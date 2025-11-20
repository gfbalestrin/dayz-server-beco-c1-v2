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

    echo ">> Recebendo posições das bandeiras"

    local current_timestamp
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    if ! echo "$line" | jq -e '.flag_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "JSON de flags vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

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

        local flag_id
        flag_id="Flag_${coord_x}_${coord_z}_${coord_y}"

        local FlagTrackingId
        FlagTrackingId=$(INSERT_FLAG_POSITION "$flag_id" "Flag" "$coord_x" "$coord_z" "$coord_y" "$ori_x" "$ori_y" "$ori_z" "$current_timestamp" "$has_base")

        if [[ $? -eq 0 && -n "$FlagTrackingId" ]]; then
            processed_count=$((processed_count + 1))
        else
            INSERT_CUSTOM_LOG "Erro ao salvar posição da bandeira em ($coord_x,$coord_z,$coord_y)" "ERROR" "$ScriptName"
        fi
    done <<< "$flags"

    INSERT_CUSTOM_LOG "Total de $processed_count bandeiras rastreadas" "INFO" "$ScriptName"
}

