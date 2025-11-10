#!/bin/bash

handle_containers_positions() {
    local line="$1"

    echo ">> Recebendo containers para loot: $line"

    local current_timestamp
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" "DELETE FROM containers_tracking;"
    echo ">> Tabela de containers limpa"

    if ! echo "$line" | jq -e '.container_data' >/dev/null 2>&1; then
        echo ">> Nenhum container encontrado no JSON"
        INSERT_CUSTOM_LOG "JSON de containers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    local containers container_count processed_count
    containers=$(echo "$line" | jq -c '.container_data[]')
    container_count=$(echo "$line" | jq '.container_data | length')
    processed_count=0

    local container_data
    while IFS= read -r container_data; do
        if [[ -z "$container_data" ]]; then
            continue
        fi

        local container_type coord_x coord_z coord_y container_id container_name
        container_type=$(echo "$container_data" | jq -r '.container_type')
        coord_x=$(echo "$container_data" | jq -r '.position.x')
        coord_z=$(echo "$container_data" | jq -r '.position.z')
        coord_y=$(echo "$container_data" | jq -r '.position.y')

        container_id="${container_type}_${coord_x}_${coord_y}_${coord_z}"
        container_name="$container_type"

        local ContainerTrackingId
        ContainerTrackingId=$(INSERT_CONTAINER_POSITION "$container_id" "$container_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp")

        if [[ $? -eq 0 && -n "$ContainerTrackingId" ]]; then
            processed_count=$((processed_count + 1))

            local items
            items=$(echo "$container_data" | jq -c '.items[]?' 2>/dev/null)
            if [[ -n "$items" ]]; then
                local item_count item_data item_type item_health
                item_count=0
                while IFS= read -r item_data; do
                    if [[ -z "$item_data" ]]; then
                        continue
                    fi

                    item_type=$(echo "$item_data" | jq -r '.type')
                    item_health=$(echo "$item_data" | jq -r '.health // empty')

                    if [[ -n "$item_type" ]]; then
                        INSERT_CONTAINER_ITEM "$ContainerTrackingId" "$item_type" "$item_health" "$current_timestamp" >/dev/null
                        item_count=$((item_count + 1))
                    fi
                done <<< "$items"

                if [[ $item_count -gt 0 ]]; then
                    echo "  -> $item_count item(s) inseridos no container $container_id"
                fi
            fi
        fi

    done <<< "$containers"

    echo ">> $processed_count containers processados de $container_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count containers rastreados" "INFO" "$ScriptName"
}

