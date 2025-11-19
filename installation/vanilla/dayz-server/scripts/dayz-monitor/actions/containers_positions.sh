#!/bin/bash

handle_containers_positions() {
    local line="$1"

    echo ">> Recebendo containers para loot: $line"

    local current_timestamp CurrentDate
    current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    if ! echo "$line" | jq -e '.container_data' >/dev/null 2>&1; then
        echo ">> Nenhum container encontrado no JSON"
        INSERT_CUSTOM_LOG "JSON de containers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    declare -A prev_containers=()

    # Buscar último registro de cada container com items
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_items; do
        prev_containers["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_items"
    done < <(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" -separator '|' <<EOF
SELECT 
    ct.ContainerId,
    ct.ContainerName,
    ct.PositionX,
    ct.PositionZ,
    ct.PositionY,
    IFNULL(GROUP_CONCAT(cit.ItemType || ':' || IFNULL(cit.ItemHealth, ''), ','), '')
FROM containers_tracking ct
LEFT JOIN container_items_tracking cit ON ct.IdContainerTracking = cit.ContainerTrackingId
WHERE ct.TimeStamp = (
    SELECT MAX(ct2.TimeStamp) 
    FROM containers_tracking ct2 
    WHERE ct2.ContainerId = ct.ContainerId
)
GROUP BY ct.ContainerId, ct.ContainerName, ct.PositionX, ct.PositionZ, ct.PositionY;
EOF
)

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
        container_id=$(echo "$container_data" | jq -r '.container_id')
        container_type=$(echo "$container_data" | jq -r '.container_type')
        coord_x=$(echo "$container_data" | jq -r '.position.x')
        coord_z=$(echo "$container_data" | jq -r '.position.z')
        coord_y=$(echo "$container_data" | jq -r '.position.y')

        if [[ -z "$container_id" || "$container_id" == "null" ]]; then
            echo ">> Aviso: container_id não encontrado no JSON, pulando container"
            continue
        fi

        container_name="$container_type"

        local current_items current_items_str
        current_items=$(echo "$container_data" | jq -c '.items[]?' 2>/dev/null)
        current_items_str=""
        if [[ -n "$current_items" ]]; then
            while IFS= read -r item_data; do
                if [[ -z "$item_data" ]]; then
                    continue
                fi
                local item_type item_health
                item_type=$(echo "$item_data" | jq -r '.type')
                item_health=$(echo "$item_data" | jq -r '.health // empty')
                if [[ -n "$item_type" ]]; then
                    if [[ -n "$current_items_str" ]]; then
                        current_items_str+=","
                    fi
                    current_items_str+="${item_type}:${item_health}"
                fi
            done <<< "$current_items"
        fi

        local prev_data
        prev_data="${prev_containers[$container_id]}"
        if [[ -z "$prev_data" ]]; then
            if [[ -n "$current_items_str" ]]; then
                local item_count
                item_count=$(echo "$container_data" | jq '.items | length' 2>/dev/null || echo "0")
                INSERT_CUSTOM_LOG "Container novo detectado (ID=$container_id) - Coords=($coord_x,$coord_z,$coord_y) - Tipo=$container_type - Itens=$item_count" "INFO" "$ScriptName"
                local Content
                Content="Container novo com loot (ID=$container_id) em (${coord_x},${coord_z},${coord_y}) - Tipo: $container_type - $item_count item(s)"
                #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi
        else
            local prev_name prev_x prev_z prev_y prev_items_str
            IFS='|' read -r prev_name prev_x prev_z prev_y prev_items_str <<< "$prev_data"
            local diff_message=""
            local container_moved=false

            if [[ "$coord_x" != "$prev_x" || "$coord_z" != "$prev_z" || "$coord_y" != "$prev_y" ]]; then
                container_moved=true
                diff_message+="movido((${prev_x},${prev_z},${prev_y})->(${coord_x},${coord_z},${coord_y})); "
            fi

            local prev_items_array current_items_array
            declare -A prev_items_map current_items_map

            if [[ -n "$prev_items_str" ]]; then
                IFS=',' read -ra prev_items_array <<< "$prev_items_str"
                for item_pair in "${prev_items_array[@]}"; do
                    if [[ -n "$item_pair" ]]; then
                        local item_type_prev item_health_prev
                        IFS=':' read -r item_type_prev item_health_prev <<< "$item_pair"
                        if [[ -n "$item_type_prev" ]]; then
                            if [[ -z "${prev_items_map[$item_type_prev]}" ]]; then
                                prev_items_map["$item_type_prev"]="1:${item_health_prev}"
                            else
                                local existing_count existing_healths
                                IFS=':' read -r existing_count existing_healths <<< "${prev_items_map[$item_type_prev]}"
                                local new_count=$((existing_count + 1))
                                prev_items_map["$item_type_prev"]="${new_count}:${existing_healths},${item_health_prev}"
                            fi
                        fi
                    fi
                done
            fi

            if [[ -n "$current_items_str" ]]; then
                IFS=',' read -ra current_items_array <<< "$current_items_str"
                for item_pair in "${current_items_array[@]}"; do
                    if [[ -n "$item_pair" ]]; then
                        local item_type_curr item_health_curr
                        IFS=':' read -r item_type_curr item_health_curr <<< "$item_pair"
                        if [[ -n "$item_type_curr" ]]; then
                            if [[ -z "${current_items_map[$item_type_curr]}" ]]; then
                                current_items_map["$item_type_curr"]="1:${item_health_curr}"
                            else
                                local existing_count existing_healths
                                IFS=':' read -r existing_count existing_healths <<< "${current_items_map[$item_type_curr]}"
                                local new_count=$((existing_count + 1))
                                current_items_map["$item_type_curr"]="${new_count}:${existing_healths},${item_health_curr}"
                            fi
                        fi
                    fi
                done
            fi

            local items_added items_removed items_changed
            items_added=""
            items_removed=""
            items_changed=""

            for item_key in "${!prev_items_map[@]}"; do
                local prev_count prev_healths
                IFS=':' read -r prev_count prev_healths <<< "${prev_items_map[$item_key]}"
                
                if [[ -z "${current_items_map[$item_key]}" ]]; then
                    if [[ -n "$items_removed" ]]; then
                        items_removed+=", "
                    fi
                    items_removed+="$item_key(qtd:$prev_count)"
                else
                    local curr_count curr_healths
                    IFS=':' read -r curr_count curr_healths <<< "${current_items_map[$item_key]}"
                    
                    if [[ "$prev_count" != "$curr_count" ]]; then
                        if [[ -n "$items_changed" ]]; then
                            items_changed+=", "
                        fi
                        items_changed+="$item_key(qtd:$prev_count->$curr_count)"
                    fi
                fi
            done

            for item_key in "${!current_items_map[@]}"; do
                if [[ -z "${prev_items_map[$item_key]}" ]]; then
                    local curr_count curr_healths
                    IFS=':' read -r curr_count curr_healths <<< "${current_items_map[$item_key]}"
                    if [[ -n "$items_added" ]]; then
                        items_added+=", "
                    fi
                    items_added+="$item_key(qtd:$curr_count)"
                fi
            done

            if [[ -n "$items_added" || -n "$items_removed" || -n "$items_changed" || -n "$diff_message" ]]; then
                if [[ -n "$items_added" ]]; then
                    diff_message+="itens_adicionados($items_added); "
                fi
                if [[ -n "$items_removed" ]]; then
                    diff_message+="itens_removidos($items_removed); "
                fi
                if [[ -n "$items_changed" ]]; then
                    diff_message+="itens_alterados($items_changed); "
                fi

                diff_message="${diff_message%??}"
                
                if [[ "$container_moved" == true ]]; then
                    INSERT_CUSTOM_LOG "Container movido (ID=$container_id) - De (${prev_x},${prev_z},${prev_y}) para (${coord_x},${coord_z},${coord_y}) - Tipo=$container_type" "INFO" "$ScriptName"
                fi
                
                if [[ -n "$items_added" || -n "$items_removed" || -n "$items_changed" ]]; then
                    INSERT_CUSTOM_LOG "Container atualizado (ID=$container_id) - Alterações: $diff_message" "INFO" "$ScriptName"
                fi

                if [[ -n "$items_added" || -n "$items_changed" ]]; then
                    local Content
                    Content="Container recebeu loot (ID=$container_id) em (${coord_x},${coord_z},${coord_y})"
                    if [[ -n "$items_added" ]]; then
                        Content+=" - Itens adicionados: $items_added"
                    fi
                    if [[ -n "$items_changed" ]]; then
                        if [[ -n "$items_added" ]]; then
                            Content+="; "
                        fi
                        Content+="Itens alterados: $items_changed"
                    fi
                    #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
                fi
            fi

            unset "prev_containers[$container_id]"
        fi

        if [[ -n "$current_items_str" ]]; then
            local ContainerTrackingId
            ContainerTrackingId=$(INSERT_CONTAINER_POSITION "$container_id" "$container_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp")

            if [[ $? -eq 0 && -n "$ContainerTrackingId" ]]; then
                processed_count=$((processed_count + 1))

                if [[ -n "$current_items" ]]; then
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
                    done <<< "$current_items"

                    if [[ $item_count -gt 0 ]]; then
                        echo "  -> $item_count item(s) inseridos no container $container_id"
                    fi
                fi
            fi
        fi

    done <<< "$containers"

    if [[ ${#prev_containers[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y rem_items Content
        for removed_id in "${!prev_containers[@]}"; do
            removed_data="${prev_containers[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y rem_items <<< "$removed_data"
            local rem_item_count rem_items_summary
            rem_item_count=0
            rem_items_summary=""
            if [[ -n "$rem_items" ]]; then
                declare -A rem_items_map
                IFS=',' read -ra rem_items_array <<< "$rem_items"
                for item_pair in "${rem_items_array[@]}"; do
                    if [[ -n "$item_pair" ]]; then
                        local item_type_rem item_health_rem
                        IFS=':' read -r item_type_rem item_health_rem <<< "$item_pair"
                        if [[ -n "$item_type_rem" ]]; then
                            rem_item_count=$((rem_item_count + 1))
                            if [[ -z "${rem_items_map[$item_type_rem]}" ]]; then
                                rem_items_map["$item_type_rem"]=1
                            else
                                rem_items_map["$item_type_rem"]=$((${rem_items_map[$item_type_rem]} + 1))
                            fi
                        fi
                    fi
                done
                for item_type_key in "${!rem_items_map[@]}"; do
                    if [[ -n "$rem_items_summary" ]]; then
                        rem_items_summary+=", "
                    fi
                    rem_items_summary+="$item_type_key(${rem_items_map[$item_type_key]})"
                done
            fi
            
            if [[ $rem_item_count -gt 0 ]]; then
                INSERT_CUSTOM_LOG "Container destruído (ID=$removed_id) - Última posição=($rem_x,$rem_z,$rem_y) - Tipo=$rem_name - Itens=$rem_item_count - Detalhes: $rem_items_summary" "INFO" "$ScriptName"
                Content="Container destruído (ID=$removed_id) do mapa - Última posição=($rem_x,$rem_z,$rem_y) - Tipo: $rem_name - $rem_item_count item(s)"
            else
                INSERT_CUSTOM_LOG "Container removido (ID=$removed_id) - Última posição=($rem_x,$rem_z,$rem_y) - Tipo=$rem_name" "INFO" "$ScriptName"
                Content="Container removido (ID=$removed_id) do mapa - Última posição=($rem_x,$rem_z,$rem_y) - Tipo: $rem_name"
            fi
            
            # Marcar último registro do container como destruído
            sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
            UPDATE containers_tracking
            SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
            WHERE ContainerId = '$removed_id'
            AND TimeStamp = (
                SELECT MAX(TimeStamp) FROM containers_tracking
                WHERE ContainerId = '$removed_id'
            );
            EOF
            
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
    fi

    echo ">> $processed_count containers processados de $container_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count containers rastreados" "INFO" "$ScriptName"
}
