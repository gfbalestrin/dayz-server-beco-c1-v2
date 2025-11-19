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

    echo ">> Recebendo posições das watchtowers"

    local current_timestamp
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    if ! echo "$line" | jq -e '.watchtower_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de watchtowers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

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

        local watchtower_id
        watchtower_id="Watchtower_${coord_x}_${coord_z}_${coord_y}"

        local WatchtowerTrackingId
        WatchtowerTrackingId=$(INSERT_WATCHTOWER_POSITION "$watchtower_id" "Watchtower" "$coord_x" "$coord_z" "$coord_y" "$ori_x" "$ori_y" "$ori_z" "$current_timestamp" "$has_base" "$level_1_base" "$level_2_base" "$level_3_base" "$level_1_stairs" "$level_2_stairs" "$has_roof")

        if [[ $? -eq 0 && -n "$WatchtowerTrackingId" ]]; then
            processed_count=$((processed_count + 1))
        else
            INSERT_CUSTOM_LOG "Erro ao salvar posição da watchtower em ($coord_x,$coord_z,$coord_y)" "ERROR" "$ScriptName"
        fi
    done <<< "$watchtowers"

    INSERT_CUSTOM_LOG "Total de $processed_count watchtowers rastreadas" "INFO" "$ScriptName"
}


