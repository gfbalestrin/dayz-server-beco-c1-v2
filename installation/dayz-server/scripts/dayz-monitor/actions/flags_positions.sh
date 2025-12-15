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

    # Toda lógica SQLite foi movida para o consumer no servidor de monitoramento
    # Aqui apenas publicamos o JSON original no RabbitMQ

    if ! echo "$line" | jq -e '.flag_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de flags vazio ou inválido" "INFO" "$ScriptName"
        return
    fi
    
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

    # Publicar dados no RabbitMQ (toda lógica SQLite será feita no consumer)
    local flag_count
    flag_count=$(echo "$line" | jq '.flag_data | length // 0')
    
    if [[ -n "$line" ]]; then
        local rabbitmq_payload
        rabbitmq_payload=$(echo "$line" | jq -c . 2>/dev/null)
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "data.structures.positions" "$rabbitmq_payload"
            INSERT_CUSTOM_LOG "Dados de flags publicados no RabbitMQ (flags: $flag_count)" "INFO" "$ScriptName"
        fi
    fi
}

