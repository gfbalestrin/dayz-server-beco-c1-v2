#!/bin/bash

handle_vehicles_positions() {
    local line="$1"

    echo ">> Recebendo posições dos veículos"

    local current_timestamp
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    declare -A prev_vehicles=()

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed';")
    
    # Buscar último registro de cada veículo (excluindo destruídos)
    local sql_query
    if [[ "$has_is_destroyed" -eq 1 ]]; then
        sql_query="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
        FROM vehicles_tracking v1
        WHERE v1.TimeStamp = (
            SELECT MAX(v2.TimeStamp) 
            FROM vehicles_tracking v2 
            WHERE v2.VehicleId = v1.VehicleId
            AND (v2.IsDestroyed = 0 OR v2.IsDestroyed IS NULL)
        )
        AND (v1.IsDestroyed = 0 OR v1.IsDestroyed IS NULL)"
    else
        sql_query="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
        FROM vehicles_tracking v1
        WHERE v1.TimeStamp = (
            SELECT MAX(v2.TimeStamp) 
            FROM vehicles_tracking v2 
            WHERE v2.VehicleId = v1.VehicleId
        )"
    fi
    
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y; do
        local prev_x_fmt prev_z_fmt prev_y_fmt
        prev_x_fmt=$(format_coord "$prev_x")
        prev_z_fmt=$(format_coord "$prev_z")
        prev_y_fmt=$(format_coord "$prev_y")
        prev_vehicles["$prev_id"]="$prev_name|$prev_x_fmt|$prev_z_fmt|$prev_y_fmt"
    done < <(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" -separator '|' "$sql_query")

    local vehicles
    vehicles=$(echo "$line" | jq -c '.vehicles[]?')

    local vehicle_count processed_count
    vehicle_count=$(echo "$line" | jq '.vehicles | length // 0')
    processed_count=0

    local vehicle_data
    while IFS= read -r vehicle_data; do
        if [[ -z "$vehicle_data" ]]; then
            continue
        fi

        local vehicle_id vehicle_name coord_x coord_z coord_y
        vehicle_id=$(echo "$vehicle_data" | jq -r '.vehicle_id')
        vehicle_name=$(echo "$vehicle_data" | jq -r '.vehicle_name')
        
        # Suportar tanto formato antigo (x, z, y) quanto novo (position.x, position.z, position.y)
        if echo "$vehicle_data" | jq -e '.position' >/dev/null 2>&1; then
            coord_x=$(echo "$vehicle_data" | jq -r '.position.x')
            coord_z=$(echo "$vehicle_data" | jq -r '.position.z')
            coord_y=$(echo "$vehicle_data" | jq -r '.position.y')
        else
            coord_x=$(echo "$vehicle_data" | jq -r '.x')
            coord_z=$(echo "$vehicle_data" | jq -r '.z')
            coord_y=$(echo "$vehicle_data" | jq -r '.y')
        fi
        
        # Extrair health_parts, items e attachments
        local engine_health body_health fuel_tank_health
        engine_health=$(echo "$vehicle_data" | jq -r '.health_parts.engine // empty')
        body_health=$(echo "$vehicle_data" | jq -r '.health_parts.body // empty')
        fuel_tank_health=$(echo "$vehicle_data" | jq -r '.health_parts.fuel_tank // empty')
        
        local current_items current_attachments
        current_items=$(echo "$vehicle_data" | jq -c '.items[]? // empty' 2>/dev/null)
        current_attachments=$(echo "$vehicle_data" | jq -c '.attachments[]? // empty' 2>/dev/null)

        local coord_x_fmt coord_z_fmt coord_y_fmt
        coord_x_fmt=$(format_coord "$coord_x")
        coord_z_fmt=$(format_coord "$coord_z")
        coord_y_fmt=$(format_coord "$coord_y")

        local prev_data
        prev_data="${prev_vehicles[$vehicle_id]}"
        if [[ -z "$prev_data" ]]; then
            Content="Veículo novo detectado (ID=$vehicle_id) - Nome=\"$vehicle_name\" - Coords=($coord_x_fmt,$coord_z_fmt,$coord_y_fmt)"
            INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        else
            local prev_name prev_x prev_z prev_y movement_message
            IFS='|' read -r prev_name prev_x prev_z prev_y <<< "$prev_data"
            movement_message=""

            if [[ "$coord_x_fmt" != "$prev_x" || "$coord_z_fmt" != "$prev_z" || "$coord_y_fmt" != "$prev_y" ]]; then
                movement_message="Coords((${prev_x},${prev_z},${prev_y})->(${coord_x_fmt},${coord_z_fmt},${coord_y_fmt}))"
            fi

            if [[ -n "$movement_message" ]]; then
                Content="Veículo movido (ID=$vehicle_id) - Nome=\"$vehicle_name\" - $movement_message"
                INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
                #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi

            unset "prev_vehicles[$vehicle_id]"
        fi

        local VehicleTrackingId
        VehicleTrackingId=$(INSERT_VEHICLE_POSITION "$vehicle_id" "$vehicle_name" "$coord_x_fmt" "$coord_z_fmt" "$coord_y_fmt" "$current_timestamp" "$engine_health" "$body_health" "$fuel_tank_health")
        if [[ $? -eq 0 && -n "$VehicleTrackingId" ]]; then
            processed_count=$((processed_count + 1))
            
            # Inserir itens do veículo
            if [[ -n "$current_items" ]]; then
                local inserted_item_count item_data item_type item_health
                inserted_item_count=0
                while IFS= read -r item_data; do
                    if [[ -z "$item_data" ]]; then
                        continue
                    fi

                    item_type=$(echo "$item_data" | jq -r '.type')
                    item_health=$(echo "$item_data" | jq -r '.health // empty')

                    if [[ -n "$item_type" ]]; then
                        INSERT_VEHICLE_ITEM "$VehicleTrackingId" "$item_type" "$item_health" "$current_timestamp" >/dev/null
                        inserted_item_count=$((inserted_item_count + 1))
                    fi
                done <<< "$current_items"

                if [[ $inserted_item_count -gt 0 ]]; then
                    echo "  -> $inserted_item_count item(s) inseridos no veículo $vehicle_id"
                fi
            fi
            
            # Inserir attachments do veículo
            if [[ -n "$current_attachments" ]]; then
                local inserted_attachment_count attachment_data attachment_type attachment_health
                inserted_attachment_count=0
                while IFS= read -r attachment_data; do
                    if [[ -z "$attachment_data" ]]; then
                        continue
                    fi

                    attachment_type=$(echo "$attachment_data" | jq -r '.type')
                    attachment_health=$(echo "$attachment_data" | jq -r '.health // empty')

                    if [[ -n "$attachment_type" ]]; then
                        INSERT_VEHICLE_ATTACHMENT "$VehicleTrackingId" "$attachment_type" "$attachment_health" "$current_timestamp" >/dev/null
                        inserted_attachment_count=$((inserted_attachment_count + 1))
                    fi
                done <<< "$current_attachments"

                if [[ $inserted_attachment_count -gt 0 ]]; then
                    echo "  -> $inserted_attachment_count attachment(s) inseridos no veículo $vehicle_id"
                fi
            fi
        else
            INSERT_CUSTOM_LOG "Erro ao salvar posição do veículo (ID=$vehicle_id)" "ERROR" "$ScriptName"
        fi
    done <<< "$vehicles"

    if [[ ${#prev_vehicles[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y
        for removed_id in "${!prev_vehicles[@]}"; do
            removed_data="${prev_vehicles[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y <<< "$removed_data"
            Content="Veículo removido (ID=$removed_id) - Nome=\"$rem_name\" - Última posição=($rem_x,$rem_z,$rem_y)"
            INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
            
            # Marcar todos os registros do veículo como destruído (garantir que não apareça no mapa)
            sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
UPDATE vehicles_tracking
SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
WHERE VehicleId = '$removed_id'
AND (IsDestroyed = 0 OR IsDestroyed IS NULL);
EOF
            
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
    fi

    echo ">> $processed_count veículos processados de $vehicle_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count veículos rastreados" "INFO" "$ScriptName"
}

