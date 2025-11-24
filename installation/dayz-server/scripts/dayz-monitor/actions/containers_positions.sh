#!/bin/bash

normalize_coordinate() {
    local coord="$1"
    if [[ -z "$coord" || "$coord" == "null" ]]; then
        echo ""
        return
    fi
    LC_NUMERIC=C printf "%.3f\n" "$coord"
}

is_shelter_container_type() {
    case "$1" in
        ShelterStick|ShelterFabric|ShelterLeather)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

handle_containers_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    INSERT_CUSTOM_LOG ">> Iniciando processamento de containers_positions" "INFO" "$ScriptName"

    local current_timestamp CurrentDate
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    if ! echo "$line" | jq -e '.container_data' >/dev/null 2>&1; then
        echo ">> Nenhum container encontrado no JSON"
        INSERT_CUSTOM_LOG "JSON de containers vazio ou inválido" "INFO" "$ScriptName"
        return
    fi
    
    local container_count_check
    container_count_check=$(echo "$line" | jq '.container_data | length // 0' 2>/dev/null || echo "0")
    INSERT_CUSTOM_LOG ">> Containers encontrados no JSON: $container_count_check" "INFO" "$ScriptName"

    declare -A prev_containers=()

    # Configurar PRAGMAs antes de acessar o banco
    configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    local check_stderr
    check_stderr=$(mktemp)
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed';" 2>"$check_stderr")
    local check_error
    check_error=$(cat "$check_stderr" 2>/dev/null)
    rm -f "$check_stderr"
    if [[ -n "$check_error" ]]; then
        if echo "$check_error" | grep -q "database is locked"; then
            INSERT_CUSTOM_LOG "SQLite lock detectado (verificar IsDestroyed): $check_error" "WARNING" "$ScriptName"
        elif [[ -n "$check_error" ]]; then
            INSERT_CUSTOM_LOG "SQLite error (verificar IsDestroyed): $check_error" "ERROR" "$ScriptName"
        fi
    fi
    
    # Garantir que índice composto otimizado existe
    local index_stderr
    index_stderr=$(mktemp)
    sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" "CREATE INDEX IF NOT EXISTS idx_containers_tracking_lookup ON containers_tracking(ContainerId, TimeStamp, IsDestroyed);" 2>"$index_stderr"
    local index_error
    index_error=$(cat "$index_stderr" 2>/dev/null)
    rm -f "$index_stderr"
    if [[ -n "$index_error" ]]; then
        if echo "$index_error" | grep -q "database is locked"; then
            INSERT_CUSTOM_LOG "SQLite lock detectado (criar índice): $index_error" "WARNING" "$ScriptName"
        elif [[ -n "$index_error" ]]; then
            INSERT_CUSTOM_LOG "SQLite error (criar índice): $index_error" "ERROR" "$ScriptName"
        fi
    fi
    
    # Buscar último registro de cada container com items usando window function (muito mais eficiente que subquery MAX)
    # Usa índice composto idx_containers_tracking_lookup para performance otimizada
    local sql_query
    if [[ "$has_is_destroyed" -eq 1 ]]; then
        sql_query="SELECT 
    ranked.ContainerId,
    ranked.ContainerName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(GROUP_CONCAT(cit.ItemType || ':' || IFNULL(cit.ItemHealth, ''), ','), '')
FROM (
    SELECT ContainerId, ContainerName, PositionX, PositionZ, PositionY, IdContainerTracking,
           ROW_NUMBER() OVER (PARTITION BY ContainerId ORDER BY TimeStamp DESC) as rn
    FROM containers_tracking
    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
) ranked
LEFT JOIN container_items_tracking cit ON ranked.IdContainerTracking = cit.ContainerTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY;"
    else
        sql_query="SELECT 
    ranked.ContainerId,
    ranked.ContainerName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(GROUP_CONCAT(cit.ItemType || ':' || IFNULL(cit.ItemHealth, ''), ','), '')
FROM (
    SELECT ContainerId, ContainerName, PositionX, PositionZ, PositionY, IdContainerTracking,
           ROW_NUMBER() OVER (PARTITION BY ContainerId ORDER BY TimeStamp DESC) as rn
    FROM containers_tracking
) ranked
LEFT JOIN container_items_tracking cit ON ranked.IdContainerTracking = cit.ContainerTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY;"
    fi
    
    INSERT_CUSTOM_LOG ">> Buscando containers anteriores no banco de dados..." "INFO" "$ScriptName"
    local prev_containers_query_start
    prev_containers_query_start=$(date +%s.%N 2>/dev/null || date +%s)
    
    # Executar query com retry logic para evitar locks
    local query_output
    local query_success=false
    local max_retries=5
    local retry_delay=0.2
    local attempt=1
    
    while [[ $attempt -le $max_retries ]]; do
        # Configurar PRAGMAs antes de cada tentativa
        configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"
        
        # Separar stdout e stderr para capturar erros
        local sqlite_stderr
        sqlite_stderr=$(mktemp)
        query_output=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" -separator '|' "$sql_query" 2>"$sqlite_stderr")
        local sqlite_exit_code=$?
        local sqlite_error
        sqlite_error=$(cat "$sqlite_stderr" 2>/dev/null)
        rm -f "$sqlite_stderr"
        
        # Logar erros de lock no banco
        if [[ -n "$sqlite_error" ]]; then
            if echo "$sqlite_error" | grep -q "database is locked"; then
                INSERT_CUSTOM_LOG "SQLite lock detectado (containers anteriores, tentativa $attempt/$max_retries): $sqlite_error" "WARNING" "$ScriptName"
            else
                INSERT_CUSTOM_LOG "SQLite error (containers anteriores): $sqlite_error" "ERROR" "$ScriptName"
            fi
        fi
        
        if [[ $sqlite_exit_code -eq 0 ]]; then
            query_success=true
            break
        fi
        
        # Verificar se é erro de lock (código 5)
        if echo "$sqlite_error" | grep -q "database is locked"; then
            if [[ $attempt -lt $max_retries ]]; then
                INSERT_CUSTOM_LOG ">> Query de containers anteriores travou (tentativa $attempt/$max_retries), aguardando..." "WARNING" "$ScriptName"
                sleep "$retry_delay"
                # Backoff exponencial: 0.2, 0.4, 0.8, 1.6, 3.2
                retry_delay=$(awk "BEGIN {printf \"%.1f\", $retry_delay * 2}")
                attempt=$((attempt + 1))
                continue
            fi
        else
            # Erro diferente de lock, não tentar novamente
            INSERT_CUSTOM_LOG ">> Erro na query de containers anteriores: ${sqlite_error:0:200}" "ERROR" "$ScriptName"
            break
        fi
    done
    
    local prev_containers_count=0
    if [[ "$query_success" == true ]]; then
        while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_items; do
            # Pular linhas vazias ou quando prev_id está vazio
            if [[ -z "$prev_id" ]]; then
                continue
            fi
            prev_containers["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_items"
            prev_containers_count=$((prev_containers_count + 1))
        done <<< "$query_output"
    else
        INSERT_CUSTOM_LOG ">> Erro ao buscar containers anteriores após $max_retries tentativas" "ERROR" "$ScriptName"
    fi
    
    local prev_containers_query_end
    prev_containers_query_end=$(date +%s.%N 2>/dev/null || date +%s)
    local prev_containers_query_elapsed_ms
    if command -v awk >/dev/null 2>&1; then
        prev_containers_query_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($prev_containers_query_end - $prev_containers_query_start) * 1000}")
    else
        local prev_containers_query_elapsed_seconds
        prev_containers_query_elapsed_seconds=$(echo "$prev_containers_query_end - $prev_containers_query_start" | bc -l 2>/dev/null || echo "0")
        prev_containers_query_elapsed_ms=$(echo "$prev_containers_query_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
    fi
    INSERT_CUSTOM_LOG ">> Containers anteriores carregados: $prev_containers_count (tempo: ${prev_containers_query_elapsed_ms}ms)" "INFO" "$ScriptName"

    # Medir tempo do parsing do JSON
    local parsing_start_time
    parsing_start_time=$(date +%s.%N 2>/dev/null || date +%s)

    local containers container_count processed_count
    containers=$(echo "$line" | jq -c '.container_data[]')
    container_count=$(echo "$line" | jq '.container_data | length')
    processed_count=0

    # Arrays para coletar dados antes de processar
    declare -a batch_containers_data=()  # Para batch INSERT
    declare -A containers_items_map=()    # ContainerId -> array de items
    declare -a containers_to_process=()  # Lista de containers para processar
    declare -A containers_metadata=()     # ContainerId -> metadata (type, coords, etc)

    # Primeira passagem: coletar todos os dados e fazer comparações
    INSERT_CUSTOM_LOG ">> Iniciando loop de processamento de containers..." "INFO" "$ScriptName"
    local container_data
    local containers_processed_in_loop=0
    local comparison_time_total=0
    local comparison_count=0
    while IFS= read -r container_data; do
        if [[ -z "$container_data" ]]; then
            continue
        fi
        containers_processed_in_loop=$((containers_processed_in_loop + 1))
        if [[ $((containers_processed_in_loop % 100)) -eq 0 ]]; then
            INSERT_CUSTOM_LOG ">> Processados $containers_processed_in_loop containers no loop..." "INFO" "$ScriptName"
        fi
        
        local container_loop_start
        container_loop_start=$(date +%s.%N 2>/dev/null || date +%s)

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

        local is_shelter_type=false
        if is_shelter_container_type "$container_type"; then
            is_shelter_type=true
        fi

        local coord_x_norm coord_z_norm coord_y_norm coord_x_cmp coord_z_cmp coord_y_cmp
        local coord_x_log coord_z_log coord_y_log
        coord_x_norm=$(normalize_coordinate "$coord_x")
        coord_z_norm=$(normalize_coordinate "$coord_z")
        coord_y_norm=$(normalize_coordinate "$coord_y")

        coord_x_log="$coord_x"
        coord_z_log="$coord_z"
        coord_y_log="$coord_y"

        if [[ -n "$coord_x_norm" ]]; then
            coord_x_log="$coord_x_norm"
        fi
        if [[ -n "$coord_z_norm" ]]; then
            coord_z_log="$coord_z_norm"
        fi
        if [[ -n "$coord_y_norm" ]]; then
            coord_y_log="$coord_y_norm"
        fi

        coord_x_cmp="$coord_x_log"
        coord_z_cmp="$coord_z_log"
        coord_y_cmp="$coord_y_log"

        local current_items current_items_str item_count
        # Processar items - filtrar apenas objetos válidos com tipo não vazio
        current_items=$(echo "$container_data" | jq -c '.items[]? | select(.type != null and .type != "" and .type != "empty")' 2>/dev/null)
        current_items_str=""
        item_count=$(echo "$container_data" | jq '[.items[]? | select(.type != null and .type != "" and .type != "empty")] | length' 2>/dev/null || echo "0")
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
        local should_save_empty=false
        if [[ -z "$prev_data" ]]; then
            if [[ -n "$current_items_str" || "$is_shelter_type" == true ]]; then
                INSERT_CUSTOM_LOG "Container novo detectado (ID=$container_id) - Coords=($coord_x_log,$coord_z_log,$coord_y_log) - Tipo=$container_type - Itens=$item_count" "INFO" "$ScriptName"
                local Content
                if [[ "$item_count" -gt 0 ]]; then
                    Content="Container novo com loot (ID=$container_id) em (${coord_x_log},${coord_z_log},${coord_y_log}) - Tipo: $container_type - $item_count item(s)"
                else
                    Content="Container novo registrado (ID=$container_id) em (${coord_x_log},${coord_z_log},${coord_y_log}) - Tipo: $container_type - Sem itens"
                fi
                #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi
        else
            local prev_name prev_x prev_z prev_y prev_items_str
            IFS='|' read -r prev_name prev_x prev_z prev_y prev_items_str <<< "$prev_data"
            local prev_x_norm prev_z_norm prev_y_norm prev_x_log prev_z_log prev_y_log
            local prev_x_cmp prev_z_cmp prev_y_cmp
            prev_x_norm=$(normalize_coordinate "$prev_x")
            prev_z_norm=$(normalize_coordinate "$prev_z")
            prev_y_norm=$(normalize_coordinate "$prev_y")

            prev_x_log="$prev_x"
            prev_z_log="$prev_z"
            prev_y_log="$prev_y"

            if [[ -n "$prev_x_norm" ]]; then
                prev_x_log="$prev_x_norm"
            fi
            if [[ -n "$prev_z_norm" ]]; then
                prev_z_log="$prev_z_norm"
            fi
            if [[ -n "$prev_y_norm" ]]; then
                prev_y_log="$prev_y_norm"
            fi

            prev_x_cmp="$prev_x_log"
            prev_z_cmp="$prev_z_log"
            prev_y_cmp="$prev_y_log"
            
            # Detectar se container foi esvaziado (tinha items, agora está vazio)
            if [[ -n "$prev_items_str" && -z "$current_items_str" ]]; then
                should_save_empty=true
            fi
            local diff_message=""
            local container_moved=false

            if [[ "$coord_x_cmp" != "$prev_x_cmp" || "$coord_z_cmp" != "$prev_z_cmp" || "$coord_y_cmp" != "$prev_y_cmp" ]]; then
                container_moved=true
                diff_message+="movido((${prev_x_log},${prev_z_log},${prev_y_log})->(${coord_x_log},${coord_z_log},${coord_y_log})); "
            fi

            # Contar items anteriores e atuais (comparação rápida)
            local prev_items_count=0
            local current_items_count=0
            if [[ -n "$prev_items_str" ]]; then
                prev_items_count=$(echo "$prev_items_str" | tr ',' '\n' | grep -c . || echo "0")
            fi
            if [[ -n "$current_items_str" ]]; then
                current_items_count=$(echo "$current_items_str" | tr ',' '\n' | grep -c . || echo "0")
            fi
            
            # Fazer comparação detalhada apenas se necessário:
            # 1. Container mudou de posição
            # 2. Número de items mudou
            # 3. Container foi esvaziado
            local needs_detailed_comparison=false
            if [[ "$container_moved" == true ]] || [[ "$prev_items_count" != "$current_items_count" ]] || [[ "$should_save_empty" == true ]]; then
                needs_detailed_comparison=true
            fi

            local items_added items_removed items_changed
            items_added=""
            items_removed=""
            items_changed=""

            # Comparação detalhada apenas quando necessário
            if [[ "$needs_detailed_comparison" == true ]]; then
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
                
                local comparison_end
                comparison_end=$(date +%s.%N 2>/dev/null || date +%s)
                local comparison_elapsed_ms
                if command -v awk >/dev/null 2>&1; then
                    comparison_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($comparison_end - $comparison_start) * 1000}")
                else
                    local comparison_elapsed_seconds
                    comparison_elapsed_seconds=$(echo "$comparison_end - $comparison_start" | bc -l 2>/dev/null || echo "0")
                    comparison_elapsed_ms=$(echo "$comparison_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                fi
                comparison_time_total=$((comparison_time_total + comparison_elapsed_ms))
                comparison_count=$((comparison_count + 1))
            else
                # Se não precisa de comparação detalhada, apenas indicar que items mudaram se contagem mudou
                if [[ "$prev_items_count" != "$current_items_count" ]]; then
                    items_changed="contagem_mudou($prev_items_count->$current_items_count)"
                fi
            fi
            
            local container_loop_end
            container_loop_end=$(date +%s.%N 2>/dev/null || date +%s)
            local container_loop_elapsed_ms
            if command -v awk >/dev/null 2>&1; then
                container_loop_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($container_loop_end - $container_loop_start) * 1000}")
            else
                local container_loop_elapsed_seconds
                container_loop_elapsed_seconds=$(echo "$container_loop_end - $container_loop_start" | bc -l 2>/dev/null || echo "0")
                container_loop_elapsed_ms=$(echo "$container_loop_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
            fi
            if [[ $container_loop_elapsed_ms -gt 100 ]]; then
                INSERT_CUSTOM_LOG ">> Container $container_id processado em ${container_loop_elapsed_ms}ms (comparação detalhada: $needs_detailed_comparison)" "DEBUG" "$ScriptName"
            fi

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
                    INSERT_CUSTOM_LOG "Container movido (ID=$container_id) - De (${prev_x_log},${prev_z_log},${prev_y_log}) para (${coord_x_log},${coord_z_log},${coord_y_log}) - Tipo=$container_type" "INFO" "$ScriptName"
                fi
                
                if [[ -n "$items_added" || -n "$items_removed" || -n "$items_changed" ]]; then
                    INSERT_CUSTOM_LOG "Container atualizado (ID=$container_id) - Alterações: $diff_message" "INFO" "$ScriptName"
                fi

                if [[ -n "$items_added" || -n "$items_changed" ]]; then
                    local Content
                    Content="Container recebeu loot (ID=$container_id) em (${coord_x_log},${coord_z_log},${coord_y_log})"
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

        # Salvar container para batch INSERT se:
        # 1. Tem items atualmente (comportamento normal)
        # 2. Foi esvaziado (tinha items antes, agora está vazio) - para atualizar timestamp e evitar logs repetidos
        # 3. É shelter type
        if [[ -n "$current_items_str" || "$should_save_empty" == true || "$is_shelter_type" == true ]]; then
            # Adicionar ao batch de containers (formato: container_id|container_name|coord_x|coord_z|coord_y)
            batch_containers_data+=("$container_id|$container_name|$coord_x|$coord_z|$coord_y")
            containers_to_process+=("$container_id")
            
            # Armazenar metadata do container
            containers_metadata["$container_id"]="$container_type|$coord_x_log|$coord_z_log|$coord_y_log|$is_shelter_type"
            
            # Armazenar items do container para processamento posterior
            if [[ -n "$current_items" ]]; then
                local items_batch=()
                local item_data item_type item_health
                
                # Coletar todos os items válidos em um array
                while IFS= read -r item_data; do
                    if [[ -z "$item_data" || "$item_data" == "null" || "$item_data" == "empty" ]]; then
                        continue
                    fi

                    # Extrair tipo e health do item
                    item_type=$(echo "$item_data" | jq -r '.type // empty' 2>/dev/null)
                    item_health=$(echo "$item_data" | jq -r 'if .health != null and .health != "" then .health else empty end' 2>/dev/null)

                    # Validar que o tipo não está vazio e não é "empty"
                    if [[ -n "$item_type" && "$item_type" != "empty" && "$item_type" != "null" ]]; then
                        # Adicionar ao array no formato "type|health"
                        if [[ -n "$item_health" ]]; then
                            items_batch+=("${item_type}|${item_health}")
                        else
                            items_batch+=("${item_type}")
                        fi
                    fi
                done <<< "$current_items"
                
                # Armazenar items como string separada por newlines para depois processar
                if [[ ${#items_batch[@]} -gt 0 ]]; then
                    containers_items_map["$container_id"]=$(IFS=$'\n'; echo "${items_batch[*]}")
                fi
            fi
        fi

    done <<< "$containers"
    
    local avg_comparison_time=0
    if [[ $comparison_count -gt 0 ]]; then
        avg_comparison_time=$((comparison_time_total / comparison_count))
    fi
    INSERT_CUSTOM_LOG ">> Loop de processamento concluído. Total processado: $containers_processed_in_loop, coletados para batch: ${#batch_containers_data[@]}, comparações detalhadas: $comparison_count (tempo médio: ${avg_comparison_time}ms)" "INFO" "$ScriptName"

    local parsing_end_time
    parsing_end_time=$(date +%s.%N 2>/dev/null || date +%s)
    local parsing_elapsed_ms
    if command -v awk >/dev/null 2>&1; then
        parsing_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($parsing_end_time - $parsing_start_time) * 1000}")
    else
        local parsing_elapsed_seconds
        parsing_elapsed_seconds=$(echo "$parsing_end_time - $parsing_start_time" | bc -l 2>/dev/null || echo "0")
        parsing_elapsed_ms=$(echo "$parsing_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
    fi
    INSERT_CUSTOM_LOG "Etapa [parsing_json_coleta_dados] executada em ${parsing_elapsed_ms}ms (containers: $container_count, coletados para batch: ${#batch_containers_data[@]})" "INFO" "$ScriptName"

    # Batch INSERT de todos os containers
    local inserted_ids
    local batch_insert_result
    if [[ ${#batch_containers_data[@]} -gt 0 ]]; then
        INSERT_CUSTOM_LOG ">> Iniciando batch INSERT de ${#batch_containers_data[@]} containers" "INFO" "$ScriptName"
        local containers_insert_start_time
        containers_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
        
        inserted_ids=$(INSERT_CONTAINERS_POSITIONS_BATCH "$current_timestamp" "${batch_containers_data[@]}")
        batch_insert_result=$?
        
        local containers_insert_end_time
        containers_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
        local containers_insert_elapsed_ms
        if command -v awk >/dev/null 2>&1; then
            containers_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($containers_insert_end_time - $containers_insert_start_time) * 1000}")
        else
            local containers_insert_elapsed_seconds
            containers_insert_elapsed_seconds=$(echo "$containers_insert_end_time - $containers_insert_start_time" | bc -l 2>/dev/null || echo "0")
            containers_insert_elapsed_ms=$(echo "$containers_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        fi
        INSERT_CUSTOM_LOG "Etapa [batch_insert_containers] executada em ${containers_insert_elapsed_ms}ms (containers: ${#batch_containers_data[@]})" "INFO" "$ScriptName"
        
        if [[ $batch_insert_result -ne 0 ]]; then
            INSERT_CUSTOM_LOG "Erro: não foi possível inserir containers em batch (código: $batch_insert_result)" "ERROR" "$ScriptName"
            INSERT_CUSTOM_LOG ">> IDs retornados: ${inserted_ids:0:200}..." "DEBUG" "$ScriptName"
        else
            processed_count=${#batch_containers_data[@]}
            INSERT_CUSTOM_LOG ">> Batch INSERT bem-sucedido. IDs obtidos: $(echo "$inserted_ids" | wc -l) linhas" "INFO" "$ScriptName"
            
            # Criar mapeamento ContainerId -> ContainerTrackingId
            declare -A container_tracking_map=()
            if [[ -n "$inserted_ids" ]]; then
                local mapping_count=0
                while IFS='|' read -r cid tracking_id; do
                    if [[ -n "$cid" && -n "$tracking_id" ]]; then
                        container_tracking_map["$cid"]="$tracking_id"
                        mapping_count=$((mapping_count + 1))
                    fi
                done <<< "$inserted_ids"
                INSERT_CUSTOM_LOG ">> Mapeamento criado: $mapping_count containers mapeados" "INFO" "$ScriptName"
            else
                INSERT_CUSTOM_LOG ">> AVISO: inserted_ids está vazio, não foi possível criar mapeamento" "WARNING" "$ScriptName"
            fi
            
            # Coletar todos os items de todos os containers em array global
            local collection_start_time
            collection_start_time=$(date +%s.%N 2>/dev/null || date +%s)
            
            declare -a all_items_batch=()
            
            for container_id in "${containers_to_process[@]}"; do
                local ContainerTrackingId="${container_tracking_map[$container_id]}"
                if [[ -z "$ContainerTrackingId" ]]; then
                    continue
                fi
                
                # Coletar items do container no formato ContainerTrackingId|type|health
                if [[ -n "${containers_items_map[$container_id]}" ]]; then
                    local items_string="${containers_items_map[$container_id]}"
                    while IFS= read -r item_entry; do
                        if [[ -n "$item_entry" ]]; then
                            # Formato: ContainerTrackingId|type|health (ou ContainerTrackingId|type se não houver health)
                            all_items_batch+=("$ContainerTrackingId|$item_entry")
                        fi
                    done <<< "$items_string"
                fi
            done
            
            local collection_end_time
            collection_end_time=$(date +%s.%N 2>/dev/null || date +%s)
            local collection_elapsed_ms
            if command -v awk >/dev/null 2>&1; then
                collection_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($collection_end_time - $collection_start_time) * 1000}")
            else
                local collection_elapsed_seconds
                collection_elapsed_seconds=$(echo "$collection_end_time - $collection_start_time" | bc -l 2>/dev/null || echo "0")
                collection_elapsed_ms=$(echo "$collection_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
            fi
            INSERT_CUSTOM_LOG "Etapa [coleta_items_globais] executada em ${collection_elapsed_ms}ms (items: ${#all_items_batch[@]})" "INFO" "$ScriptName"
            
            # Processar todos os items em um único batch INSERT
            if [[ ${#all_items_batch[@]} -gt 0 ]]; then
                local items_insert_start_time
                items_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
                
                local inserted_items_count
                inserted_items_count=$(INSERT_ALL_CONTAINERS_ITEMS_BATCH "$current_timestamp" "${all_items_batch[@]}" 2>/dev/null)
                local items_insert_result=$?
                
                local items_insert_end_time
                items_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
                local items_insert_elapsed_ms
                if command -v awk >/dev/null 2>&1; then
                    items_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($items_insert_end_time - $items_insert_start_time) * 1000}")
                else
                    local items_insert_elapsed_seconds
                    items_insert_elapsed_seconds=$(echo "$items_insert_end_time - $items_insert_start_time" | bc -l 2>/dev/null || echo "0")
                    items_insert_elapsed_ms=$(echo "$items_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                fi
                INSERT_CUSTOM_LOG "Etapa [batch_insert_items] executada em ${items_insert_elapsed_ms}ms (items: ${#all_items_batch[@]})" "INFO" "$ScriptName"
                
                if [[ $items_insert_result -ne 0 ]]; then
                    INSERT_CUSTOM_LOG "Erro ao inserir items de containers em batch" "ERROR" "$ScriptName"
                fi
            fi
        fi
    fi

    if [[ ${#prev_containers[@]} -gt 0 ]]; then
        local removed_id removed_data rem_name rem_x rem_z rem_y rem_items Content
        for removed_id in "${!prev_containers[@]}"; do
            removed_data="${prev_containers[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y rem_items <<< "$removed_data"
            local rem_x_norm rem_z_norm rem_y_norm rem_x_log rem_z_log rem_y_log
            rem_x_norm=$(normalize_coordinate "$rem_x")
            rem_z_norm=$(normalize_coordinate "$rem_z")
            rem_y_norm=$(normalize_coordinate "$rem_y")

            rem_x_log="$rem_x"
            rem_z_log="$rem_z"
            rem_y_log="$rem_y"

            if [[ -n "$rem_x_norm" ]]; then
                rem_x_log="$rem_x_norm"
            fi
            if [[ -n "$rem_z_norm" ]]; then
                rem_z_log="$rem_z_norm"
            fi
            if [[ -n "$rem_y_norm" ]]; then
                rem_y_log="$rem_y_norm"
            fi
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
                INSERT_CUSTOM_LOG "Container destruído (ID=$removed_id) - Última posição=($rem_x_log,$rem_z_log,$rem_y_log) - Tipo=$rem_name - Itens=$rem_item_count - Detalhes: $rem_items_summary" "INFO" "$ScriptName"
                Content="Container destruído (ID=$removed_id) do mapa - Última posição=($rem_x_log,$rem_z_log,$rem_y_log) - Tipo: $rem_name - $rem_item_count item(s)"
            else
                INSERT_CUSTOM_LOG "Container removido (ID=$removed_id) - Última posição=($rem_x_log,$rem_z_log,$rem_y_log) - Tipo=$rem_name" "INFO" "$ScriptName"
                Content="Container removido (ID=$removed_id) do mapa - Última posição=($rem_x_log,$rem_z_log,$rem_y_log) - Tipo: $rem_name"
            fi
            
            # Marcar todos os registros do container como destruído (garantir que não apareça no mapa)
            local update_stderr
            update_stderr=$(mktemp)
            sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>"$update_stderr"
UPDATE containers_tracking
SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
WHERE ContainerId = '$removed_id'
AND (IsDestroyed = 0 OR IsDestroyed IS NULL);
EOF
            local update_error
            update_error=$(cat "$update_stderr" 2>/dev/null)
            rm -f "$update_stderr"
            if [[ -n "$update_error" ]]; then
                if echo "$update_error" | grep -q "database is locked"; then
                    INSERT_CUSTOM_LOG "SQLite lock detectado (marcar container destruído ID=$removed_id): $update_error" "WARNING" "$ScriptName"
                elif [[ -n "$update_error" ]]; then
                    INSERT_CUSTOM_LOG "SQLite error (marcar container destruído ID=$removed_id): $update_error" "ERROR" "$ScriptName"
                fi
            fi
            
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
    fi

    echo ">> $processed_count containers processados de $container_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count containers rastreados (de $container_count totais no JSON, ${#batch_containers_data[@]} coletados para batch)" "INFO" "$ScriptName"
}
