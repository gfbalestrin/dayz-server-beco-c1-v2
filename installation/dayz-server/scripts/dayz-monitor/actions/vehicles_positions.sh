#!/bin/bash

handle_vehicles_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições dos veículos"

    local current_timestamp
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi

    declare -A prev_vehicles=()

    # Configurar PRAGMAs antes de acessar o banco
    configure_sqlite_pragmas "$AppFolder/$AppServerBecoC1LogsDbFile"

    # Garantir que índice composto otimizado existe (criação automática se não existir)
    # Nota: SQLite não suporta DESC na definição do índice, mas ORDER BY DESC na query ainda usa o índice eficientemente
    sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" "CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_lookup ON vehicles_tracking(VehicleId, TimeStamp, IsDestroyed);" 2>/dev/null

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed';")
    
    # Buscar último registro de cada veículo usando window function (muito mais eficiente que subquery MAX)
    # Usa índice composto idx_vehicles_tracking_lookup para performance otimizada
    local sql_query
    if [[ "$has_is_destroyed" -eq 1 ]]; then
        sql_query="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
        FROM (
            SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY,
                   ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
            FROM vehicles_tracking
            WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
        ) ranked
        WHERE rn = 1"
    else
        sql_query="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
        FROM (
            SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY,
                   ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
            FROM vehicles_tracking
        ) ranked
        WHERE rn = 1"
    fi
    
    # Executar query com retry logic para evitar locks
    local query_output
    local query_success=false
    local max_retries=5
    local retry_delay=0.2
    local attempt=1
    
    while [[ $attempt -le $max_retries ]]; do
        # Configurar PRAGMAs antes de cada tentativa
        configure_sqlite_pragmas "$AppFolder/$AppServerBecoC1LogsDbFile"
        
        query_output=$(sqlite3 -separator '|' "$AppFolder/$AppServerBecoC1LogsDbFile" "$sql_query" 2>&1)
        
        if [[ $? -eq 0 ]]; then
            query_success=true
            break
        fi
        
        # Verificar se é erro de lock (código 5)
        if echo "$query_output" | grep -q "database is locked"; then
            if [[ $attempt -lt $max_retries ]]; then
                sleep "$retry_delay"
                # Backoff exponencial: 0.2, 0.4, 0.8, 1.6, 3.2
                retry_delay=$(awk "BEGIN {printf \"%.1f\", $retry_delay * 2}")
                attempt=$((attempt + 1))
                continue
            fi
        else
            # Erro diferente de lock, não tentar novamente
            break
        fi
    done
    
    if [[ "$query_success" != true ]]; then
        INSERT_CUSTOM_LOG "Erro ao buscar veículos anteriores após $max_retries tentativas: $query_output" "ERROR" "$ScriptName"
        query_output=""  # Limpar output para não processar dados inválidos
    fi
    
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y; do
        local prev_x_fmt prev_z_fmt prev_y_fmt
        prev_x_fmt=$(format_coord "$prev_x")
        prev_z_fmt=$(format_coord "$prev_z")
        prev_y_fmt=$(format_coord "$prev_y")
        prev_vehicles["$prev_id"]="$prev_name|$prev_x_fmt|$prev_z_fmt|$prev_y_fmt"
    done <<< "$query_output"

    local vehicles
    vehicles=$(echo "$line" | jq -c '.vehicles[]?')

    local vehicle_count
    vehicle_count=$(echo "$line" | jq '.vehicles | length // 0')

    # Arrays para coletar dados antes de processar
    declare -a batch_vehicles_data=()  # Para batch INSERT
    declare -A vehicles_items_map=()    # VehicleId -> array de items
    declare -A vehicles_attachments_map=()  # VehicleId -> array de attachments
    declare -a vehicles_to_process=()   # Lista de veículos para processar logs

    # Primeira passagem: coletar todos os dados
    local vehicle_data
    while IFS= read -r vehicle_data; do
        if [[ -z "$vehicle_data" ]]; then
            continue
        fi

        local vehicle_id vehicle_name coord_x coord_z coord_y
        vehicle_id=$(echo "$vehicle_data" | jq -r '.vehicle_id')
        vehicle_name=$(echo "$vehicle_data" | jq -r '.vehicle_name')
        
        if [[ -z "$vehicle_id" ]]; then
            continue
        fi
        
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
        
        # Extrair health_parts
        local engine_health body_health fuel_tank_health
        engine_health=$(echo "$vehicle_data" | jq -r '.health_parts.engine // empty')
        body_health=$(echo "$vehicle_data" | jq -r '.health_parts.body // empty')
        fuel_tank_health=$(echo "$vehicle_data" | jq -r '.health_parts.fuel_tank // empty')
        
        # Formatar coordenadas
        local coord_x_fmt coord_z_fmt coord_y_fmt
        coord_x_fmt=$(format_coord "$coord_x")
        coord_z_fmt=$(format_coord "$coord_z")
        coord_y_fmt=$(format_coord "$coord_y")

        # Processar logs de novos veículos e movimentação
        local prev_data
        prev_data="${prev_vehicles[$vehicle_id]}"
        if [[ -z "$prev_data" ]]; then
            Content="Veículo novo detectado (ID=$vehicle_id) - Nome=\"$vehicle_name\" - Coords=($coord_x_fmt,$coord_z_fmt,$coord_y_fmt)"
            INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
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
            fi

            unset "prev_vehicles[$vehicle_id]"
        fi

        # Coletar items do veículo
        local current_items
        current_items=$(echo "$vehicle_data" | jq -c '.items[]? | select(.type != null and .type != "" and .type != "empty")' 2>/dev/null)
        if [[ -n "$current_items" ]]; then
            local items_batch=()
            while IFS= read -r item_data; do
                if [[ -z "$item_data" || "$item_data" == "null" || "$item_data" == "empty" ]]; then
                    continue
                fi
                local item_type item_health
                item_type=$(echo "$item_data" | jq -r '.type // empty' 2>/dev/null)
                item_health=$(echo "$item_data" | jq -r 'if .health != null and .health != "" then .health else empty end' 2>/dev/null)
                if [[ -n "$item_type" && "$item_type" != "empty" && "$item_type" != "null" ]]; then
                    if [[ -n "$item_health" ]]; then
                        items_batch+=("${item_type}|${item_health}")
                    else
                        items_batch+=("${item_type}")
                    fi
                fi
            done <<< "$current_items"
            if [[ ${#items_batch[@]} -gt 0 ]]; then
                # Armazenar items como string separada por newlines para depois processar
                vehicles_items_map["$vehicle_id"]=$(IFS=$'\n'; echo "${items_batch[*]}")
            fi
        fi
        
        # Coletar attachments do veículo
        local current_attachments
        if echo "$vehicle_data" | jq -e '.attachments | type == "array"' >/dev/null 2>&1; then
            current_attachments=$(echo "$vehicle_data" | jq -c '.attachments[]? | select(.type != null and .type != "" and .type != "empty") | {type: .type, health: (.health // null)}' 2>/dev/null | sort)
        else
            current_attachments=""
        fi
        if [[ -n "$current_attachments" ]]; then
            local attachments_batch=()
            while IFS= read -r attachment_data; do
                if [[ -z "$attachment_data" || "$attachment_data" == "null" || "$attachment_data" == "empty" ]]; then
                    continue
                fi
                local attachment_type attachment_health
                attachment_type=$(echo "$attachment_data" | jq -r '.type // empty' 2>/dev/null)
                attachment_health=$(echo "$attachment_data" | jq -r 'if .health != null and .health != "" then .health else empty end' 2>/dev/null)
                if [[ -n "$attachment_type" && "$attachment_type" != "empty" && "$attachment_type" != "null" ]]; then
                    if [[ -n "$attachment_health" ]]; then
                        attachments_batch+=("${attachment_type}|${attachment_health}")
                    else
                        attachments_batch+=("${attachment_type}")
                    fi
                fi
            done <<< "$current_attachments"
            if [[ ${#attachments_batch[@]} -gt 0 ]]; then
                # Armazenar attachments como string separada por newlines para depois processar
                vehicles_attachments_map["$vehicle_id"]=$(IFS=$'\n'; echo "${attachments_batch[*]}")
            fi
        fi

        # Adicionar ao batch de veículos (formato: vehicle_id|vehicle_name|coord_x|coord_z|coord_y|engine_health|body_health|fuel_tank_health)
        batch_vehicles_data+=("$vehicle_id|$vehicle_name|$coord_x_fmt|$coord_z_fmt|$coord_y_fmt|${engine_health:-}|${body_health:-}|${fuel_tank_health:-}")
        vehicles_to_process+=("$vehicle_id")
    done <<< "$vehicles"

    # Batch INSERT de todos os veículos
    local inserted_ids
    local batch_insert_result
    local processed_count=0
    if [[ ${#batch_vehicles_data[@]} -gt 0 ]]; then
        inserted_ids=$(INSERT_VEHICLES_POSITIONS_BATCH "$current_timestamp" "${batch_vehicles_data[@]}")
        batch_insert_result=$?
        
        if [[ $batch_insert_result -ne 0 ]]; then
            INSERT_CUSTOM_LOG "Erro: não foi possível inserir veículos em batch (código: $batch_insert_result)" "ERROR" "$ScriptName"
        else
            processed_count=${#batch_vehicles_data[@]}
            
            # Criar mapeamento VehicleId -> VehicleTrackingId
            declare -A vehicle_tracking_map=()
            if [[ -n "$inserted_ids" ]]; then
                while IFS='|' read -r vid tracking_id; do
                    if [[ -n "$vid" && -n "$tracking_id" ]]; then
                        vehicle_tracking_map["$vid"]="$tracking_id"
                    fi
                done <<< "$inserted_ids"
            fi
            
            # Processar items e attachments usando o mapeamento
            for vehicle_id in "${vehicles_to_process[@]}"; do
                local VehicleTrackingId="${vehicle_tracking_map[$vehicle_id]}"
                if [[ -z "$VehicleTrackingId" ]]; then
                    continue
                fi
                
                # Processar items do veículo
                if [[ -n "${vehicles_items_map[$vehicle_id]}" ]]; then
                    local items_string="${vehicles_items_map[$vehicle_id]}"
                    local items_batch=()
                    while IFS= read -r item_entry; do
                        if [[ -n "$item_entry" ]]; then
                            items_batch+=("$item_entry")
                        fi
                    done <<< "$items_string"
                    
                    if [[ ${#items_batch[@]} -gt 0 ]]; then
                        local inserted_item_count
                        inserted_item_count=$(INSERT_VEHICLE_ITEMS_BATCH "$VehicleTrackingId" "$current_timestamp" "${items_batch[@]}" 2>/dev/null)
                        if [[ $? -ne 0 ]]; then
                            INSERT_CUSTOM_LOG "Erro ao inserir items no veículo $vehicle_id" "ERROR" "$ScriptName"
                        fi
                    fi
                fi
                
                # Processar attachments do veículo
                if [[ -n "${vehicles_attachments_map[$vehicle_id]}" ]]; then
                    local attachments_string="${vehicles_attachments_map[$vehicle_id]}"
                    local attachments_batch=()
                    while IFS= read -r attachment_entry; do
                        if [[ -n "$attachment_entry" ]]; then
                            attachments_batch+=("$attachment_entry")
                        fi
                    done <<< "$attachments_string"
                    
                    if [[ ${#attachments_batch[@]} -gt 0 ]]; then
                        local inserted_attachment_count
                        inserted_attachment_count=$(INSERT_VEHICLE_ATTACHMENTS_BATCH "$VehicleTrackingId" "$current_timestamp" "${attachments_batch[@]}" 2>/dev/null)
                        if [[ $? -ne 0 ]]; then
                            INSERT_CUSTOM_LOG "Erro ao inserir attachments no veículo $vehicle_id" "ERROR" "$ScriptName"
                        fi
                    fi
                fi
            done
        fi
    fi

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

