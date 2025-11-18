#!/bin/bash

handle_fences_positions() {
    local line="$1"

    echo ">> Recebendo posições das portões: $line"

    local current_timestamp CurrentDate
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    if ! echo "$line" | jq -e '.fence_data' >/dev/null 2>&1; then
        echo ">> Nenhum fence encontrado no JSON"
        INSERT_CUSTOM_LOG "JSON de fences vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    declare -A prev_fences=()

    # Buscar último registro de cada fence
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_has_base prev_lower_panel prev_upper_panel; do
        prev_fences["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_has_base|$prev_lower_panel|$prev_upper_panel"
    done < <(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" -separator '|' "
        SELECT ft.FenceId, ft.FenceName, ft.PositionX, ft.PositionZ, ft.PositionY, 
               IFNULL(ft.HasBase,''), IFNULL(ft.LowerPanelBuilt,''), IFNULL(ft.UpperPanelBuilt,'')
        FROM fences_tracking ft
        WHERE ft.TimeStamp = (
            SELECT MAX(ft2.TimeStamp) 
            FROM fences_tracking ft2 
            WHERE ft2.FenceId = ft.FenceId
        )
    ")

    local fences fence_count processed_count
    fences=$(echo "$line" | jq -c '.fence_data[]')
    fence_count=$(echo "$line" | jq '.fence_data | length')
    processed_count=0

    local fence_data
    while IFS= read -r fence_data; do
        if [[ -z "$fence_data" ]]; then
            continue
        fi

        local coord_x coord_z coord_y has_gate is_opened is_locked has_base lower_panel_built upper_panel_built
        coord_x=$(echo "$fence_data" | jq -r '.position.x')
        coord_z=$(echo "$fence_data" | jq -r '.position.z')
        coord_y=$(echo "$fence_data" | jq -r '.position.y')
        has_gate=$(echo "$fence_data" | jq -r '.has_gate')
        is_opened=$(echo "$fence_data" | jq -r '.is_opened')
        is_locked=$(echo "$fence_data" | jq -r '.is_locked')
        has_base=$(echo "$fence_data" | jq -r 'if has("has_base") then (if .has_base then "1" else "0" end) else "" end')
        lower_panel_built=$(echo "$fence_data" | jq -r 'if has("lower_panel_built") then (if .lower_panel_built then "1" else "0" end) else "" end')
        upper_panel_built=$(echo "$fence_data" | jq -r 'if has("upper_panel_built") then (if .upper_panel_built then "1" else "0" end) else "" end')

        local fence_id fence_name
        fence_id="Fence_${coord_x}_${coord_y}_${coord_z}"
        fence_name="Fence"
        if [[ "$has_gate" == "true" ]]; then
            fence_name="${fence_name}_Gate"
        fi
        if [[ "$is_opened" == "true" ]]; then
            fence_name="${fence_name}_Open"
        fi
        if [[ "$is_locked" == "true" ]]; then
            fence_name="${fence_name}_Locked"
        fi

        local prev_data
        prev_data="${prev_fences[$fence_id]}"
        if [[ -z "$prev_data" ]]; then
            INSERT_CUSTOM_LOG "Fence nova detectada (ID=$fence_id) - Coords=($coord_x,$coord_z,$coord_y) - Base=$(format_bool_log "$has_base") - PainelInf=$(format_bool_log "$lower_panel_built") - PainelSup=$(format_bool_log "$upper_panel_built")" "INFO" "$ScriptName"
        else
            local prev_name prev_x prev_z prev_y prev_has_base prev_lower prev_upper diff_message
            IFS='|' read -r prev_name prev_x prev_z prev_y prev_has_base prev_lower prev_upper <<< "$prev_data"
            diff_message=""

            if [[ "$fence_name" != "$prev_name" ]]; then
                diff_message+="nome(${prev_name}->${fence_name}); "
            fi
            if [[ "$coord_x" != "$prev_x" || "$coord_z" != "$prev_z" || "$coord_y" != "$prev_y" ]]; then
                diff_message+="coords((${prev_x},${prev_z},${prev_y})->(${coord_x},${coord_z},${coord_y})); "
            fi
            if [[ "$has_base" != "$prev_has_base" ]]; then
                diff_message+="base($(format_bool_log "$prev_has_base")->$(format_bool_log "$has_base")); "
            fi
            if [[ "$lower_panel_built" != "$prev_lower" ]]; then
                diff_message+="painel_inf($(format_bool_log "$prev_lower")->$(format_bool_log "$lower_panel_built")); "
            fi
            if [[ "$upper_panel_built" != "$prev_upper" ]]; then
                diff_message+="painel_sup($(format_bool_log "$prev_upper")->$(format_bool_log "$upper_panel_built")); "
            fi

            if [[ -n "$diff_message" ]]; then
                diff_message="${diff_message%??}"
                INSERT_CUSTOM_LOG "Fence atualizada (ID=$fence_id) - Alterações: $diff_message" "INFO" "$ScriptName"

                local destruction_detected destruction_summary
                destruction_detected="false"
                destruction_summary=""

                if [[ "$prev_lower" == "1" && "$lower_panel_built" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Painel inferior destruído; "
                fi

                if [[ "$prev_upper" == "1" && "$upper_panel_built" != "1" ]]; then
                    destruction_detected="true"
                    destruction_summary+="Painel superior destruído; "
                fi

                if [[ "$destruction_detected" == "true" ]]; then
                    destruction_summary="${destruction_summary%??}"
                    local Content
                    Content="Fence destruída (ID=$fence_id) em (${coord_x},${coord_z},${coord_y}) - $destruction_summary"
                    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
                fi
            fi

            unset "prev_fences[$fence_id]"
        fi

        local FenceTrackingId
        FenceTrackingId=$(INSERT_FENCE_POSITION "$fence_id" "$fence_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp" "$has_base" "$lower_panel_built" "$upper_panel_built")

        if [[ $? -eq 0 ]]; then
            processed_count=$((processed_count + 1))
        fi

    done <<< "$fences"

    if [[ ${#prev_fences[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y rem_has_base rem_lower rem_upper Content
        for removed_id in "${!prev_fences[@]}"; do
            removed_data="${prev_fences[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y rem_has_base rem_lower rem_upper <<< "$removed_data"
            INSERT_CUSTOM_LOG "Fence removida (ID=$removed_id) - Última posição=($rem_x,$rem_z,$rem_y) - Base=$(format_bool_log "$rem_has_base") - PainelInf=$(format_bool_log "$rem_lower") - PainelSup=$(format_bool_log "$rem_upper")" "INFO" "$ScriptName"
            Content="Fence destruída (ID=$removed_id) removida do mapa - Última posição=($rem_x,$rem_z,$rem_y)"
            SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
    fi

    echo ">> $processed_count portões processados de $fence_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count portões rastreados" "INFO" "$ScriptName"
}

