#!/bin/bash

flag_bool_to_int() {
    local value="$1"
    if [[ "$value" == "true" || "$value" == "1" ]]; then
        echo "1"
    elif [[ "$value" == "false" || "$value" == "0" ]]; then
        echo "0"
    else
        echo ""
    fi
}

handle_flags_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições das bandeiras"

    local current_timestamp CurrentDate
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    if ! echo "$line" | jq -e '.flag_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de flags vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    declare -A prev_flags=()

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('flags_tracking') WHERE name='IsDestroyed';")
    
    # Buscar último registro de cada flag (excluindo destruídas)
    local sql_query
    if [[ "$has_is_destroyed" -eq 1 ]]; then
        sql_query="SELECT ft.FlagId, ft.FlagName, ft.PositionX, ft.PositionZ, ft.PositionY, 
               IFNULL(ft.HasBase,''), IFNULL(ft.HasFlagBase,''), IFNULL(ft.FlagRaised,''), 
               IFNULL(ft.FlagHeight,'')
        FROM flags_tracking ft
        WHERE ft.TimeStamp = (
            SELECT MAX(ft2.TimeStamp) 
            FROM flags_tracking ft2 
            WHERE ft2.FlagId = ft.FlagId
            AND (ft2.IsDestroyed = 0 OR ft2.IsDestroyed IS NULL)
        )
        AND (ft.IsDestroyed = 0 OR ft.IsDestroyed IS NULL)"
    else
        sql_query="SELECT ft.FlagId, ft.FlagName, ft.PositionX, ft.PositionZ, ft.PositionY, 
               IFNULL(ft.HasBase,''), IFNULL(ft.HasFlagBase,''), IFNULL(ft.FlagRaised,''), 
               IFNULL(ft.FlagHeight,'')
        FROM flags_tracking ft
        WHERE ft.TimeStamp = (
            SELECT MAX(ft2.TimeStamp) 
            FROM flags_tracking ft2 
            WHERE ft2.FlagId = ft.FlagId
        )"
    fi
    
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_has_base prev_has_flag_base prev_flag_raised prev_flag_height; do
        # Pular linhas vazias ou quando prev_id está vazio
        if [[ -z "$prev_id" ]]; then
            continue
        fi
        prev_flags["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_has_base|$prev_has_flag_base|$prev_flag_raised|$prev_flag_height"
    done < <(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" -separator '|' "$sql_query")

    local flags
    flags=$(echo "$line" | jq -c '.flag_data[]?')

    local processed_count
    processed_count=0

    local flag_data
    while IFS= read -r flag_data; do
        if [[ -z "$flag_data" ]]; then
            continue
        fi

        local coord_x coord_z coord_y
        coord_x=$(echo "$flag_data" | jq -r '.position.x')
        coord_z=$(echo "$flag_data" | jq -r '.position.z')
        coord_y=$(echo "$flag_data" | jq -r '.position.y')

        local ori_x ori_y ori_z
        ori_x=$(echo "$flag_data" | jq -r '.orientation.x')
        ori_y=$(echo "$flag_data" | jq -r '.orientation.y')
        ori_z=$(echo "$flag_data" | jq -r '.orientation.z')

        local has_base
        has_base=$(flag_bool_to_int "$(echo "$flag_data" | jq -r '.has_base')")

        local has_flag_base
        has_flag_base=$(flag_bool_to_int "$(echo "$flag_data" | jq -r '.has_flag_base')")

        local flag_raised
        flag_raised=$(flag_bool_to_int "$(echo "$flag_data" | jq -r '.flag_raised')")

        local flag_height
        flag_height=$(echo "$flag_data" | jq -r '.flag_height // empty')

        local flag_id
        flag_id="Flag_${coord_x}_${coord_z}_${coord_y}"

        local prev_data
        prev_data="${prev_flags[$flag_id]}"
        if [[ -z "$prev_data" ]]; then
            INSERT_CUSTOM_LOG "Flag nova detectada (ID=$flag_id) - Coords=($coord_x,$coord_z,$coord_y)" "INFO" "$ScriptName"
        else
            unset "prev_flags[$flag_id]"
        fi

        local FlagTrackingId insert_exit_code
        FlagTrackingId=$(INSERT_FLAG_POSITION "$flag_id" "Flag" "$coord_x" "$coord_z" "$coord_y" "$ori_x" "$ori_y" "$ori_z" "$current_timestamp" "$has_base" "$has_flag_base" "$flag_raised" "$flag_height")
        insert_exit_code=$?

        if [[ $insert_exit_code -eq 0 && -n "$FlagTrackingId" && "$FlagTrackingId" =~ ^[0-9]+$ ]]; then
            processed_count=$((processed_count + 1))
        else
            local error_msg="Erro ao salvar posição da bandeira em ($coord_x,$coord_z,$coord_y)"
            if [[ -n "$FlagTrackingId" ]]; then
                error_msg="$error_msg - Resposta: $FlagTrackingId"
            fi
            if [[ $insert_exit_code -ne 0 ]]; then
                error_msg="$error_msg - Exit code: $insert_exit_code"
            fi
            INSERT_CUSTOM_LOG "$error_msg" "ERROR" "$ScriptName"
        fi
    done <<< "$flags"

    if [[ ${#prev_flags[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y Content EscapedRemovedId
        for removed_id in "${!prev_flags[@]}"; do
            removed_data="${prev_flags[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y rem_has_base rem_has_flag_base rem_flag_raised rem_flag_height <<< "$removed_data"
            INSERT_CUSTOM_LOG "Flag removida (ID=$removed_id) - Última posição=($rem_x,$rem_z,$rem_y)" "INFO" "$ScriptName"
            Content="Flag destruída (ID=$removed_id) removida do mapa - Última posição=($rem_x,$rem_z,$rem_y)"
            SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            
            # Escapar aspas simples no ID para SQL
            EscapedRemovedId=$(echo "$removed_id" | sed "s/'/''/g")
            
            # Marcar TODOS os registros da flag como destruída (garantir que não apareça no mapa)
            # Não usar condição IsDestroyed para garantir que todos sejam marcados
            local affected_rows
            affected_rows=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" <<EOF
UPDATE flags_tracking
SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
WHERE FlagId = '$EscapedRemovedId';
SELECT changes();
EOF
)
            INSERT_CUSTOM_LOG "Flag destruída (ID=$removed_id) - Registros marcados como destruídos: $affected_rows" "INFO" "$ScriptName"
        done
    fi

    INSERT_CUSTOM_LOG "Total de $processed_count bandeiras rastreadas" "INFO" "$ScriptName"
}

