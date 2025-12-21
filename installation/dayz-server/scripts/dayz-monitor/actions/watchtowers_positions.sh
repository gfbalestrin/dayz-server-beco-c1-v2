#!/bin/bash

watchtower_bool_to_int() {
    local value="$1"
    if [[ "$value" == "true" || "$value" == "1" ]]; then
        echo "1"
    elif [[ "$value" == "false" || "$value" == "0" ]]; then
        echo "0"
    else
        echo ""
    fi
}

handle_watchtowers_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições das watchtowers"

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

    if ! echo "$line" | jq -e '.watchtower_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de watchtowers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi
    
    # Buscar último registro de cada watchtower (excluindo destruídas)
    local sql_query
    if [[ "$has_is_destroyed" -eq 1 ]]; then
        sql_query="SELECT wt.WatchtowerId, wt.WatchtowerName, wt.PositionX, wt.PositionZ, wt.PositionY, 
               IFNULL(wt.HasBase,''), IFNULL(wt.Level1BaseBuilt,''), IFNULL(wt.Level2BaseBuilt,''), 
               IFNULL(wt.Level3BaseBuilt,''), IFNULL(wt.Level1StairsBuilt,''), IFNULL(wt.Level2StairsBuilt,''), 
               IFNULL(wt.HasRoof,''),
               IFNULL(wt.Level1Wall1LowerBuilt,''), IFNULL(wt.Level1Wall1UpperBuilt,''),
               IFNULL(wt.Level1Wall2LowerBuilt,''), IFNULL(wt.Level1Wall2UpperBuilt,''),
               IFNULL(wt.Level1Wall3LowerBuilt,''), IFNULL(wt.Level1Wall3UpperBuilt,''),
               IFNULL(wt.Level2Wall1LowerBuilt,''), IFNULL(wt.Level2Wall1UpperBuilt,''),
               IFNULL(wt.Level2Wall2LowerBuilt,''), IFNULL(wt.Level2Wall2UpperBuilt,''),
               IFNULL(wt.Level2Wall3LowerBuilt,''), IFNULL(wt.Level2Wall3UpperBuilt,''),
               IFNULL(wt.Level3Wall1LowerBuilt,''), IFNULL(wt.Level3Wall1UpperBuilt,''),
               IFNULL(wt.Level3Wall2LowerBuilt,''), IFNULL(wt.Level3Wall2UpperBuilt,''),
               IFNULL(wt.Level3Wall3LowerBuilt,''), IFNULL(wt.Level3Wall3UpperBuilt,'')
        FROM watchtowers_tracking wt
        WHERE wt.TimeStamp = (
            SELECT MAX(wt2.TimeStamp) 
            FROM watchtowers_tracking wt2 
            WHERE wt2.WatchtowerId = wt.WatchtowerId
            AND (wt2.IsDestroyed = 0 OR wt2.IsDestroyed IS NULL)
        )
        AND (wt.IsDestroyed = 0 OR wt.IsDestroyed IS NULL)"
    else
        sql_query="SELECT wt.WatchtowerId, wt.WatchtowerName, wt.PositionX, wt.PositionZ, wt.PositionY, 
               IFNULL(wt.HasBase,''), IFNULL(wt.Level1BaseBuilt,''), IFNULL(wt.Level2BaseBuilt,''), 
               IFNULL(wt.Level3BaseBuilt,''), IFNULL(wt.Level1StairsBuilt,''), IFNULL(wt.Level2StairsBuilt,''), 
               IFNULL(wt.HasRoof,''),
               IFNULL(wt.Level1Wall1LowerBuilt,''), IFNULL(wt.Level1Wall1UpperBuilt,''),
               IFNULL(wt.Level1Wall2LowerBuilt,''), IFNULL(wt.Level1Wall2UpperBuilt,''),
               IFNULL(wt.Level1Wall3LowerBuilt,''), IFNULL(wt.Level1Wall3UpperBuilt,''),
               IFNULL(wt.Level2Wall1LowerBuilt,''), IFNULL(wt.Level2Wall1UpperBuilt,''),
               IFNULL(wt.Level2Wall2LowerBuilt,''), IFNULL(wt.Level2Wall2UpperBuilt,''),
               IFNULL(wt.Level2Wall3LowerBuilt,''), IFNULL(wt.Level2Wall3UpperBuilt,''),
               IFNULL(wt.Level3Wall1LowerBuilt,''), IFNULL(wt.Level3Wall1UpperBuilt,''),
               IFNULL(wt.Level3Wall2LowerBuilt,''), IFNULL(wt.Level3Wall2UpperBuilt,''),
               IFNULL(wt.Level3Wall3LowerBuilt,''), IFNULL(wt.Level3Wall3UpperBuilt,'')
        FROM watchtowers_tracking wt
        WHERE wt.TimeStamp = (
            SELECT MAX(wt2.TimeStamp) 
            FROM watchtowers_tracking wt2 
            WHERE wt2.WatchtowerId = wt.WatchtowerId
        )"
    fi
    
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_has_base prev_level1_base prev_level2_base prev_level3_base prev_level1_stairs prev_level2_stairs prev_has_roof \
        prev_l1_w1_lower prev_l1_w1_upper prev_l1_w2_lower prev_l1_w2_upper prev_l1_w3_lower prev_l1_w3_upper \
        prev_l2_w1_lower prev_l2_w1_upper prev_l2_w2_lower prev_l2_w2_upper prev_l2_w3_lower prev_l2_w3_upper \
        prev_l3_w1_lower prev_l3_w1_upper prev_l3_w2_lower prev_l3_w2_upper prev_l3_w3_lower prev_l3_w3_upper; do
        # Pular linhas vazias ou quando prev_id está vazio
        if [[ -z "$prev_id" ]]; then
            continue
        fi
        prev_watchtowers["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_has_base|$prev_level1_base|$prev_level2_base|$prev_level3_base|$prev_level1_stairs|$prev_level2_stairs|$prev_has_roof|$prev_l1_w1_lower|$prev_l1_w1_upper|$prev_l1_w2_lower|$prev_l1_w2_upper|$prev_l1_w3_lower|$prev_l1_w3_upper|$prev_l2_w1_lower|$prev_l2_w1_upper|$prev_l2_w2_lower|$prev_l2_w2_upper|$prev_l2_w3_lower|$prev_l2_w3_upper|$prev_l3_w1_lower|$prev_l3_w1_upper|$prev_l3_w2_lower|$prev_l3_w2_upper|$prev_l3_w3_lower|$prev_l3_w3_upper"
    done < <(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" -separator '|' "$sql_query")

    # Publicar dados no RabbitMQ (toda lógica SQLite será feita no consumer)
    local watchtower_count
    watchtower_count=$(echo "$line" | jq '.watchtower_data | length // 0')
    
    if [[ -n "$line" ]]; then
        local rabbitmq_payload
        rabbitmq_payload=$(echo "$line" | jq -c . 2>/dev/null)
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "data.structures.positions" "$rabbitmq_payload"
            INSERT_CUSTOM_LOG "Dados de watchtowers publicados no RabbitMQ (watchtowers: $watchtower_count)" "INFO" "$ScriptName"
        fi
    fi
}


