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

    if ! echo "$line" | jq -e '.watchtower_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de watchtowers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    declare -A prev_watchtowers=()

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('watchtowers_tracking') WHERE name='IsDestroyed';")
    
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

    local watchtowers
    watchtowers=$(echo "$line" | jq -c '.watchtower_data[]?')

    local processed_count
    processed_count=0

    local watchtower_data
    while IFS= read -r watchtower_data; do
        if [[ -z "$watchtower_data" ]]; then
            continue
        fi

        local coord_x coord_z coord_y
        coord_x=$(echo "$watchtower_data" | jq -r '.position.x')
        coord_z=$(echo "$watchtower_data" | jq -r '.position.z')
        coord_y=$(echo "$watchtower_data" | jq -r '.position.y')

        local ori_x ori_y ori_z
        ori_x=$(echo "$watchtower_data" | jq -r '.orientation.x')
        ori_y=$(echo "$watchtower_data" | jq -r '.orientation.y')
        ori_z=$(echo "$watchtower_data" | jq -r '.orientation.z')

        local has_base level_1_base level_2_base level_3_base level_1_stairs level_2_stairs has_roof
        has_base=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.has_base')")
        level_1_base=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_base')")
        level_2_base=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_base')")
        level_3_base=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_base')")
        level_1_stairs=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_stairs')")
        level_2_stairs=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_stairs')")
        has_roof=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.has_roof')")

        local level_1_wall_1_lower level_1_wall_1_upper level_1_wall_2_lower level_1_wall_2_upper
        local level_1_wall_3_lower level_1_wall_3_upper level_2_wall_1_lower level_2_wall_1_upper
        local level_2_wall_2_lower level_2_wall_2_upper level_2_wall_3_lower level_2_wall_3_upper
        local level_3_wall_1_lower level_3_wall_1_upper level_3_wall_2_lower level_3_wall_2_upper
        local level_3_wall_3_lower level_3_wall_3_upper

        level_1_wall_1_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_1_lower_built')")
        level_1_wall_1_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_1_upper_built')")
        level_1_wall_2_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_2_lower_built')")
        level_1_wall_2_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_2_upper_built')")
        level_1_wall_3_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_3_lower_built')")
        level_1_wall_3_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_1_wall_3_upper_built')")
        level_2_wall_1_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_1_lower_built')")
        level_2_wall_1_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_1_upper_built')")
        level_2_wall_2_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_2_lower_built')")
        level_2_wall_2_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_2_upper_built')")
        level_2_wall_3_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_3_lower_built')")
        level_2_wall_3_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_2_wall_3_upper_built')")
        level_3_wall_1_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_1_lower_built')")
        level_3_wall_1_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_1_upper_built')")
        level_3_wall_2_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_2_lower_built')")
        level_3_wall_2_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_2_upper_built')")
        level_3_wall_3_lower=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_3_lower_built')")
        level_3_wall_3_upper=$(watchtower_bool_to_int "$(echo "$watchtower_data" | jq -r '.level_3_wall_3_upper_built')")

        local watchtower_id
        watchtower_id="Watchtower_${coord_x}_${coord_z}_${coord_y}"

        local prev_data
        prev_data="${prev_watchtowers[$watchtower_id]}"
        if [[ -z "$prev_data" ]]; then
            INSERT_CUSTOM_LOG "Watchtower nova detectada (ID=$watchtower_id) - Coords=($coord_x,$coord_z,$coord_y)" "INFO" "$ScriptName"
        else
            local prev_name prev_x prev_z prev_y prev_has_base prev_level1_base prev_level2_base prev_level3_base prev_level1_stairs prev_level2_stairs prev_has_roof
            local prev_l1_w1_lower prev_l1_w1_upper prev_l1_w2_lower prev_l1_w2_upper prev_l1_w3_lower prev_l1_w3_upper
            local prev_l2_w1_lower prev_l2_w1_upper prev_l2_w2_lower prev_l2_w2_upper prev_l2_w3_lower prev_l2_w3_upper
            local prev_l3_w1_lower prev_l3_w1_upper prev_l3_w2_lower prev_l3_w2_upper prev_l3_w3_lower prev_l3_w3_upper
            local diff_message
            
            IFS='|' read -r prev_name prev_x prev_z prev_y prev_has_base prev_level1_base prev_level2_base prev_level3_base prev_level1_stairs prev_level2_stairs prev_has_roof \
                prev_l1_w1_lower prev_l1_w1_upper prev_l1_w2_lower prev_l1_w2_upper prev_l1_w3_lower prev_l1_w3_upper \
                prev_l2_w1_lower prev_l2_w1_upper prev_l2_w2_lower prev_l2_w2_upper prev_l2_w3_lower prev_l2_w3_upper \
                prev_l3_w1_lower prev_l3_w1_upper prev_l3_w2_lower prev_l3_w2_upper prev_l3_w3_lower prev_l3_w3_upper <<< "$prev_data"
            
            diff_message=""
            
            local coord_x_norm coord_z_norm coord_y_norm
            local prev_x_norm prev_z_norm prev_y_norm
            coord_x_norm=$(format_coord "$coord_x")
            coord_z_norm=$(format_coord "$coord_z")
            coord_y_norm=$(format_coord "$coord_y")
            prev_x_norm=$(format_coord "$prev_x")
            prev_z_norm=$(format_coord "$prev_z")
            prev_y_norm=$(format_coord "$prev_y")
            
            if [[ "$coord_x_norm" != "$prev_x_norm" || "$coord_z_norm" != "$prev_z_norm" || "$coord_y_norm" != "$prev_y_norm" ]]; then
                diff_message+="coords((${prev_x},${prev_z},${prev_y})->(${coord_x},${coord_z},${coord_y})); "
            fi
            if [[ "$has_base" != "$prev_has_base" ]]; then
                diff_message+="base($(format_bool_log "$prev_has_base")->$(format_bool_log "$has_base")); "
            fi
            if [[ "$level_1_base" != "$prev_level1_base" ]]; then
                diff_message+="nivel1($(format_bool_log "$prev_level1_base")->$(format_bool_log "$level_1_base")); "
            fi
            if [[ "$level_2_base" != "$prev_level2_base" ]]; then
                diff_message+="nivel2($(format_bool_log "$prev_level2_base")->$(format_bool_log "$level_2_base")); "
            fi
            if [[ "$level_3_base" != "$prev_level3_base" ]]; then
                diff_message+="nivel3($(format_bool_log "$prev_level3_base")->$(format_bool_log "$level_3_base")); "
            fi
            if [[ "$level_1_stairs" != "$prev_level1_stairs" ]]; then
                diff_message+="escadas1($(format_bool_log "$prev_level1_stairs")->$(format_bool_log "$level_1_stairs")); "
            fi
            if [[ "$level_2_stairs" != "$prev_level2_stairs" ]]; then
                diff_message+="escadas2($(format_bool_log "$prev_level2_stairs")->$(format_bool_log "$level_2_stairs")); "
            fi
            if [[ "$has_roof" != "$prev_has_roof" ]]; then
                diff_message+="telhado($(format_bool_log "$prev_has_roof")->$(format_bool_log "$has_roof")); "
            fi
            
            # Comparar paredes do nível 1
            if [[ "$level_1_wall_1_lower" != "$prev_l1_w1_lower" ]]; then
                diff_message+="L1P1Inf($(format_bool_log "$prev_l1_w1_lower")->$(format_bool_log "$level_1_wall_1_lower")); "
            fi
            if [[ "$level_1_wall_1_upper" != "$prev_l1_w1_upper" ]]; then
                diff_message+="L1P1Sup($(format_bool_log "$prev_l1_w1_upper")->$(format_bool_log "$level_1_wall_1_upper")); "
            fi
            if [[ "$level_1_wall_2_lower" != "$prev_l1_w2_lower" ]]; then
                diff_message+="L1P2Inf($(format_bool_log "$prev_l1_w2_lower")->$(format_bool_log "$level_1_wall_2_lower")); "
            fi
            if [[ "$level_1_wall_2_upper" != "$prev_l1_w2_upper" ]]; then
                diff_message+="L1P2Sup($(format_bool_log "$prev_l1_w2_upper")->$(format_bool_log "$level_1_wall_2_upper")); "
            fi
            if [[ "$level_1_wall_3_lower" != "$prev_l1_w3_lower" ]]; then
                diff_message+="L1P3Inf($(format_bool_log "$prev_l1_w3_lower")->$(format_bool_log "$level_1_wall_3_lower")); "
            fi
            if [[ "$level_1_wall_3_upper" != "$prev_l1_w3_upper" ]]; then
                diff_message+="L1P3Sup($(format_bool_log "$prev_l1_w3_upper")->$(format_bool_log "$level_1_wall_3_upper")); "
            fi
            
            # Comparar paredes do nível 2
            if [[ "$level_2_wall_1_lower" != "$prev_l2_w1_lower" ]]; then
                diff_message+="L2P1Inf($(format_bool_log "$prev_l2_w1_lower")->$(format_bool_log "$level_2_wall_1_lower")); "
            fi
            if [[ "$level_2_wall_1_upper" != "$prev_l2_w1_upper" ]]; then
                diff_message+="L2P1Sup($(format_bool_log "$prev_l2_w1_upper")->$(format_bool_log "$level_2_wall_1_upper")); "
            fi
            if [[ "$level_2_wall_2_lower" != "$prev_l2_w2_lower" ]]; then
                diff_message+="L2P2Inf($(format_bool_log "$prev_l2_w2_lower")->$(format_bool_log "$level_2_wall_2_lower")); "
            fi
            if [[ "$level_2_wall_2_upper" != "$prev_l2_w2_upper" ]]; then
                diff_message+="L2P2Sup($(format_bool_log "$prev_l2_w2_upper")->$(format_bool_log "$level_2_wall_2_upper")); "
            fi
            if [[ "$level_2_wall_3_lower" != "$prev_l2_w3_lower" ]]; then
                diff_message+="L2P3Inf($(format_bool_log "$prev_l2_w3_lower")->$(format_bool_log "$level_2_wall_3_lower")); "
            fi
            if [[ "$level_2_wall_3_upper" != "$prev_l2_w3_upper" ]]; then
                diff_message+="L2P3Sup($(format_bool_log "$prev_l2_w3_upper")->$(format_bool_log "$level_2_wall_3_upper")); "
            fi
            
            # Comparar paredes do nível 3
            if [[ "$level_3_wall_1_lower" != "$prev_l3_w1_lower" ]]; then
                diff_message+="L3P1Inf($(format_bool_log "$prev_l3_w1_lower")->$(format_bool_log "$level_3_wall_1_lower")); "
            fi
            if [[ "$level_3_wall_1_upper" != "$prev_l3_w1_upper" ]]; then
                diff_message+="L3P1Sup($(format_bool_log "$prev_l3_w1_upper")->$(format_bool_log "$level_3_wall_1_upper")); "
            fi
            if [[ "$level_3_wall_2_lower" != "$prev_l3_w2_lower" ]]; then
                diff_message+="L3P2Inf($(format_bool_log "$prev_l3_w2_lower")->$(format_bool_log "$level_3_wall_2_lower")); "
            fi
            if [[ "$level_3_wall_2_upper" != "$prev_l3_w2_upper" ]]; then
                diff_message+="L3P2Sup($(format_bool_log "$prev_l3_w2_upper")->$(format_bool_log "$level_3_wall_2_upper")); "
            fi
            if [[ "$level_3_wall_3_lower" != "$prev_l3_w3_lower" ]]; then
                diff_message+="L3P3Inf($(format_bool_log "$prev_l3_w3_lower")->$(format_bool_log "$level_3_wall_3_lower")); "
            fi
            if [[ "$level_3_wall_3_upper" != "$prev_l3_w3_upper" ]]; then
                diff_message+="L3P3Sup($(format_bool_log "$prev_l3_w3_upper")->$(format_bool_log "$level_3_wall_3_upper")); "
            fi
            
            if [[ -n "$diff_message" ]]; then
                diff_message="${diff_message%??}"
                INSERT_CUSTOM_LOG "Watchtower atualizada (ID=$watchtower_id) - Alterações: $diff_message" "INFO" "$ScriptName"
                
                local destruction_detected destruction_summary
                destruction_detected="false"
                destruction_summary=""
                
                # Detectar destruição de paredes do nível 1
                if [[ "$prev_l1_w1_lower" == "1" && "$level_1_wall_1_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 1 Inferior destruída; "
                fi
                if [[ "$prev_l1_w1_upper" == "1" && "$level_1_wall_1_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 1 Superior destruída; "
                fi
                if [[ "$prev_l1_w2_lower" == "1" && "$level_1_wall_2_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 2 Inferior destruída; "
                fi
                if [[ "$prev_l1_w2_upper" == "1" && "$level_1_wall_2_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 2 Superior destruída; "
                fi
                if [[ "$prev_l1_w3_lower" == "1" && "$level_1_wall_3_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 3 Inferior destruída; "
                fi
                if [[ "$prev_l1_w3_upper" == "1" && "$level_1_wall_3_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 1 Parede 3 Superior destruída; "
                fi
                
                # Detectar destruição de paredes do nível 2
                if [[ "$prev_l2_w1_lower" == "1" && "$level_2_wall_1_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 1 Inferior destruída; "
                fi
                if [[ "$prev_l2_w1_upper" == "1" && "$level_2_wall_1_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 1 Superior destruída; "
                fi
                if [[ "$prev_l2_w2_lower" == "1" && "$level_2_wall_2_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 2 Inferior destruída; "
                fi
                if [[ "$prev_l2_w2_upper" == "1" && "$level_2_wall_2_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 2 Superior destruída; "
                fi
                if [[ "$prev_l2_w3_lower" == "1" && "$level_2_wall_3_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 3 Inferior destruída; "
                fi
                if [[ "$prev_l2_w3_upper" == "1" && "$level_2_wall_3_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 2 Parede 3 Superior destruída; "
                fi
                
                # Detectar destruição de paredes do nível 3
                if [[ "$prev_l3_w1_lower" == "1" && "$level_3_wall_1_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 1 Inferior destruída; "
                fi
                if [[ "$prev_l3_w1_upper" == "1" && "$level_3_wall_1_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 1 Superior destruída; "
                fi
                if [[ "$prev_l3_w2_lower" == "1" && "$level_3_wall_2_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 2 Inferior destruída; "
                fi
                if [[ "$prev_l3_w2_upper" == "1" && "$level_3_wall_2_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 2 Superior destruída; "
                fi
                if [[ "$prev_l3_w3_lower" == "1" && "$level_3_wall_3_lower" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 3 Inferior destruída; "
                fi
                if [[ "$prev_l3_w3_upper" == "1" && "$level_3_wall_3_upper" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Nível 3 Parede 3 Superior destruída; "
                fi
                
                if [[ "$destruction_detected" == "true" ]]; then
                    destruction_summary="${destruction_summary%??}"
                    local Content
                    Content="Watchtower atacada (ID=$watchtower_id) em (${coord_x},${coord_z},${coord_y}) - $destruction_summary"
                    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
                fi
            fi
            
            unset "prev_watchtowers[$watchtower_id]"
        fi

        local WatchtowerTrackingId
        WatchtowerTrackingId=$(INSERT_WATCHTOWER_POSITION "$watchtower_id" "Watchtower" "$coord_x" "$coord_z" "$coord_y" "$ori_x" "$ori_y" "$ori_z" "$current_timestamp" "$has_base" "$level_1_base" "$level_2_base" "$level_3_base" "$level_1_stairs" "$level_2_stairs" "$has_roof" "$level_1_wall_1_lower" "$level_1_wall_1_upper" "$level_1_wall_2_lower" "$level_1_wall_2_upper" "$level_1_wall_3_lower" "$level_1_wall_3_upper" "$level_2_wall_1_lower" "$level_2_wall_1_upper" "$level_2_wall_2_lower" "$level_2_wall_2_upper" "$level_2_wall_3_lower" "$level_2_wall_3_upper" "$level_3_wall_1_lower" "$level_3_wall_1_upper" "$level_3_wall_2_lower" "$level_3_wall_2_upper" "$level_3_wall_3_lower" "$level_3_wall_3_upper")

        if [[ $? -eq 0 && -n "$WatchtowerTrackingId" ]]; then
            processed_count=$((processed_count + 1))
        else
            INSERT_CUSTOM_LOG "Erro ao salvar posição da watchtower em ($coord_x,$coord_z,$coord_y)" "ERROR" "$ScriptName"
        fi
    done <<< "$watchtowers"

    if [[ ${#prev_watchtowers[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y Content EscapedRemovedId
        for removed_id in "${!prev_watchtowers[@]}"; do
            removed_data="${prev_watchtowers[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y rem_has_base rem_level1_base rem_level2_base rem_level3_base rem_level1_stairs rem_level2_stairs rem_has_roof <<< "$removed_data"
            INSERT_CUSTOM_LOG "Watchtower removida (ID=$removed_id) - Última posição=($rem_x,$rem_z,$rem_y)" "INFO" "$ScriptName"
            Content="Watchtower destruída (ID=$removed_id) removida do mapa - Última posição=($rem_x,$rem_z,$rem_y)"
            SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            
            # Escapar aspas simples no ID para SQL
            EscapedRemovedId=$(echo "$removed_id" | sed "s/'/''/g")
            
            # Marcar TODOS os registros da watchtower como destruída (garantir que não apareça no mapa)
            # Não usar condição IsDestroyed para garantir que todos sejam marcados
            local affected_rows
            affected_rows=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" <<EOF
UPDATE watchtowers_tracking
SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
WHERE WatchtowerId = '$EscapedRemovedId';
SELECT changes();
EOF
)
            INSERT_CUSTOM_LOG "Watchtower destruída (ID=$removed_id) - Registros marcados como destruídos: $affected_rows" "INFO" "$ScriptName"
        done
    fi

    INSERT_CUSTOM_LOG "Total de $processed_count watchtowers rastreadas" "INFO" "$ScriptName"
}


