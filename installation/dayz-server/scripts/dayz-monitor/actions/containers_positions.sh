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

    INSERT_CUSTOM_LOG "DEBUG: handle_containers_positions iniciado" "INFO" "$ScriptName"
    
    local current_timestamp CurrentDate
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
        INSERT_CUSTOM_LOG "DEBUG: usando timestamp capturado: $captured_timestamp" "INFO" "$ScriptName"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        INSERT_CUSTOM_LOG "DEBUG: usando timestamp atual: $current_timestamp" "INFO" "$ScriptName"
    fi
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    # Detectar se é update parcial (apenas coordenadas e health)
    local is_partial_update=false
    if echo "$line" | jq -e '.update_type == "position_only"' >/dev/null 2>&1; then
        is_partial_update=true
        INSERT_CUSTOM_LOG "Update parcial detectado: apenas coordenadas e health serão atualizados (items não processados)" "INFO" "$ScriptName"
    fi

    if ! echo "$line" | jq -e '.container_data' >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "DEBUG: JSON de containers vazio ou inválido, retornando" "INFO" "$ScriptName"
        return
    fi
    
    local container_count_check
    container_count_check=$(echo "$line" | jq '.container_data | length // 0' 2>/dev/null || echo "0")
    INSERT_CUSTOM_LOG "DEBUG: containers encontrados no JSON: $container_count_check" "INFO" "$ScriptName"

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
            if [[ -n "$check_error" ]] && ! echo "$check_error" | grep -q "database is locked"; then
                INSERT_CUSTOM_LOG "SQLite error (verificar IsDestroyed): $check_error" "ERROR" "$ScriptName"
            fi
    
    # Garantir que índice composto otimizado existe
    local index_stderr
    index_stderr=$(mktemp)
    sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" "CREATE INDEX IF NOT EXISTS idx_containers_tracking_lookup ON containers_tracking(ContainerId, TimeStamp, IsDestroyed);" 2>"$index_stderr"
    local index_error
    index_error=$(cat "$index_stderr" 2>/dev/null)
    rm -f "$index_stderr"
            if [[ -n "$index_error" ]] && ! echo "$index_error" | grep -q "database is locked"; then
                INSERT_CUSTOM_LOG "SQLite error (criar índice): $index_error" "ERROR" "$ScriptName"
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
    
    INSERT_CUSTOM_LOG "DEBUG: iniciando busca de containers anteriores no banco" "INFO" "$ScriptName"
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
        
        # Logar erros apenas na última tentativa ou se não for lock
        if [[ -n "$sqlite_error" ]]; then
            if echo "$sqlite_error" | grep -q "database is locked"; then
                if [[ $attempt -eq $max_retries ]]; then
                    INSERT_CUSTOM_LOG "SQLite lock detectado (containers anteriores, última tentativa): $sqlite_error" "WARNING" "$ScriptName"
                fi
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
                # Log apenas em caso de falha final
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
        INSERT_CUSTOM_LOG "DEBUG: query de containers anteriores bem-sucedida, processando resultados" "INFO" "$ScriptName"
        while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_items; do
            # Pular linhas vazias ou quando prev_id está vazio
            if [[ -z "$prev_id" ]]; then
                continue
            fi
            prev_containers["$prev_id"]="$prev_name|$prev_x|$prev_z|$prev_y|$prev_items"
            prev_containers_count=$((prev_containers_count + 1))
        done <<< "$query_output"
        INSERT_CUSTOM_LOG "DEBUG: containers anteriores carregados: $prev_containers_count" "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "DEBUG: query de containers anteriores falhou após $max_retries tentativas" "WARNING" "$ScriptName"
    fi
    
    local prev_containers_query_end
    prev_containers_query_end=$(date +%s.%N 2>/dev/null || date +%s)
    local prev_containers_query_elapsed_ms=0
    if [[ -n "$prev_containers_query_start" ]] && [[ -n "$prev_containers_query_end" ]]; then
        if command -v awk >/dev/null 2>&1; then
            prev_containers_query_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($prev_containers_query_end - $prev_containers_query_start) * 1000}" 2>/dev/null || echo "0")
        else
            local prev_containers_query_elapsed_seconds
            prev_containers_query_elapsed_seconds=$(echo "$prev_containers_query_end - $prev_containers_query_start" | bc -l 2>/dev/null || echo "0")
            prev_containers_query_elapsed_ms=$(echo "$prev_containers_query_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        fi
    fi
    # Medir tempo do parsing do JSON
    local parsing_start_time
    parsing_start_time=$(date +%s.%N 2>/dev/null || date +%s)

    local containers container_count processed_count
    # Suportar tanto .container_data (formato antigo) quanto .containers (formato novo simplificado)
    if echo "$line" | jq -e '.containers' >/dev/null 2>&1; then
        containers=$(echo "$line" | jq -c '.containers[]')
        container_count=$(echo "$line" | jq '.containers | length')
    else
        containers=$(echo "$line" | jq -c '.container_data[]')
        container_count=$(echo "$line" | jq '.container_data | length')
    fi
    INSERT_CUSTOM_LOG "DEBUG: total de containers no JSON para processar: $container_count" "INFO" "$ScriptName"
    processed_count=0

    # Arrays para coletar dados antes de processar
    declare -a batch_containers_data=()  # Para batch INSERT
    declare -A containers_items_map=()    # ContainerId -> array de items
    declare -a containers_to_process=()  # Lista de containers para processar
    declare -A containers_metadata=()     # ContainerId -> metadata (type, coords, etc)

    INSERT_CUSTOM_LOG "DEBUG: iniciando loop de processamento de containers" "INFO" "$ScriptName"
    # Primeira passagem: coletar todos os dados e fazer comparações
    local container_data
    local containers_processed_in_loop=0
    while IFS= read -r container_data; do
        if [[ -z "$container_data" ]]; then
            continue
        fi
        containers_processed_in_loop=$((containers_processed_in_loop + 1))
        
        # Log de progresso a cada 100 containers
        if [[ $((containers_processed_in_loop % 100)) -eq 0 ]]; then
            INSERT_CUSTOM_LOG "DEBUG: processados $containers_processed_in_loop de $container_count containers no loop" "INFO" "$ScriptName"
        fi
        
        local container_loop_start
        container_loop_start=$(date +%s.%N 2>/dev/null || date +%s)

        local container_type coord_x coord_z coord_y container_id container_name
        container_id=$(echo "$container_data" | jq -r '.container_id')
        container_type=$(echo "$container_data" | jq -r '.container_type')
        
        # Suportar tanto formato antigo (position.x) quanto novo (x diretamente)
        if echo "$container_data" | jq -e '.position' >/dev/null 2>&1; then
            coord_x=$(echo "$container_data" | jq -r '.position.x')
            coord_z=$(echo "$container_data" | jq -r '.position.z')
            coord_y=$(echo "$container_data" | jq -r '.position.y')
        else
            coord_x=$(echo "$container_data" | jq -r '.x')
            coord_z=$(echo "$container_data" | jq -r '.z')
            coord_y=$(echo "$container_data" | jq -r '.y')
        fi

        if [[ -z "$container_id" || "$container_id" == "null" ]]; then
            if [[ $containers_processed_in_loop -le 10 ]]; then
                INSERT_CUSTOM_LOG "DEBUG: container_id não encontrado no JSON (container $containers_processed_in_loop), pulando" "WARNING" "$ScriptName"
            fi
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

        # Processar items de forma otimizada - uma única chamada ao jq
        # Se for update parcial, pular processamento de items
        local current_items_str item_count
        if [[ "$is_partial_update" == "true" ]]; then
            current_items_str=""
            item_count=0
        else
            current_items_str=$(echo "$container_data" | jq -r '
              [.items[]? | select(.type != null and .type != "" and .type != "empty")] |
              if length > 0 then
                map(.type + ":" + (if .health != null and .health != "" then (.health | tostring) else "" end)) |
                join(",")
              else
                ""
              end
            ' 2>/dev/null)
            
            # Contar items
            if [[ -n "$current_items_str" ]]; then
                item_count=$(echo "$current_items_str" | tr ',' '\n' | grep -c . || echo "0")
            else
                item_count=0
            fi
        fi

        local prev_data
        prev_data="${prev_containers[$container_id]}"
        local should_save_empty=false
        if [[ -z "$prev_data" ]]; then
            # Container novo - não logar individualmente para não poluir logs
            # Apenas coletar para batch INSERT (será processado abaixo)
            :
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
                local comparison_start
                comparison_start=$(date +%s.%N 2>/dev/null || date +%s)
                
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
                local comparison_elapsed_ms=0
                if [[ -n "$comparison_start" ]] && [[ -n "$comparison_end" ]]; then
                    if command -v awk >/dev/null 2>&1; then
                        comparison_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($comparison_end - $comparison_start) * 1000}" 2>/dev/null || echo "0")
                    else
                        local comparison_elapsed_seconds
                        comparison_elapsed_seconds=$(echo "$comparison_end - $comparison_start" | bc -l 2>/dev/null || echo "0")
                        comparison_elapsed_ms=$(echo "$comparison_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                    fi
                fi
            else
                # Se não precisa de comparação detalhada, apenas indicar que items mudaram se contagem mudou
                if [[ "$prev_items_count" != "$current_items_count" ]]; then
                    items_changed="contagem_mudou($prev_items_count->$current_items_count)"
                fi
            fi
            
            local container_loop_end
            container_loop_end=$(date +%s.%N 2>/dev/null || date +%s)
            local container_loop_elapsed_ms=0
            if [[ -n "$container_loop_start" ]] && [[ -n "$container_loop_end" ]]; then
                if command -v awk >/dev/null 2>&1; then
                    container_loop_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($container_loop_end - $container_loop_start) * 1000}" 2>/dev/null || echo "0")
                else
                    local container_loop_elapsed_seconds
                    container_loop_elapsed_seconds=$(echo "$container_loop_end - $container_loop_start" | bc -l 2>/dev/null || echo "0")
                    container_loop_elapsed_ms=$(echo "$container_loop_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                fi
            fi
            # Não logar mudanças individuais de containers para não poluir logs
            # Apenas coletar dados para batch INSERT

            unset "prev_containers[$container_id]"
        fi

        # Salvar container para batch INSERT se:
        # 1. Tem items atualmente (comportamento normal)
        # 2. Foi esvaziado (tinha items antes, agora está vazio) - para atualizar timestamp e evitar logs repetidos
        # 3. É shelter type
        # 4. É container novo (sem prev_data) - sempre salvar containers novos
        local is_new_container=false
        if [[ -z "$prev_data" ]]; then
            is_new_container=true
        fi
        
        if [[ -n "$current_items_str" || "$should_save_empty" == true || "$is_shelter_type" == true || "$is_new_container" == true ]]; then
            # Adicionar ao batch de containers (formato: container_id|container_name|coord_x|coord_z|coord_y)
            batch_containers_data+=("$container_id|$container_name|$coord_x|$coord_z|$coord_y")
            containers_to_process+=("$container_id")
            
            # Log apenas para os primeiros 10 containers para debug
            if [[ ${#batch_containers_data[@]} -le 10 ]]; then
                INSERT_CUSTOM_LOG "DEBUG: container adicionado ao batch: $container_id (total no batch: ${#batch_containers_data[@]})" "INFO" "$ScriptName"
            fi
            
            # Armazenar metadata do container
            containers_metadata["$container_id"]="$container_type|$coord_x_log|$coord_z_log|$coord_y_log|$is_shelter_type"
            
            # Armazenar items do container para processamento posterior (já processados acima)
            # Se for update parcial, não processar items
            if [[ "$is_partial_update" != "true" ]] && [[ -n "$current_items_str" ]]; then
                local items_batch=()
                
                # Converter current_items_str (formato "type:health,type:health") para items_batch (formato "type|health")
                IFS=',' read -ra items_array <<< "$current_items_str"
                for item_pair in "${items_array[@]}"; do
                    if [[ -n "$item_pair" ]]; then
                        local item_type item_health
                        IFS=':' read -r item_type item_health <<< "$item_pair"
                        
                        if [[ -n "$item_type" && "$item_type" != "empty" && "$item_type" != "null" ]]; then
                            if [[ -n "$item_health" ]]; then
                                items_batch+=("${item_type}|${item_health}")
                            else
                                items_batch+=("${item_type}")
                            fi
                        fi
                    fi
                done
                
                # Armazenar items como string separada por newlines para depois processar
                if [[ ${#items_batch[@]} -gt 0 ]]; then
                    containers_items_map["$container_id"]=$(IFS=$'\n'; echo "${items_batch[*]}")
                fi
            fi
        fi

    done <<< "$containers"
    
    INSERT_CUSTOM_LOG "DEBUG: loop de processamento concluído, processados: $containers_processed_in_loop, batch_containers_data: ${#batch_containers_data[@]}" "INFO" "$ScriptName"
    
    # Log resumido do processamento

    local parsing_end_time
    parsing_end_time=$(date +%s.%N 2>/dev/null || date +%s)
    local parsing_elapsed_ms=0
    if [[ -n "$parsing_start_time" ]] && [[ -n "$parsing_end_time" ]]; then
        if command -v awk >/dev/null 2>&1; then
            parsing_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($parsing_end_time - $parsing_start_time) * 1000}" 2>/dev/null || echo "0")
        else
            local parsing_elapsed_seconds
            parsing_elapsed_seconds=$(echo "$parsing_end_time - $parsing_start_time" | bc -l 2>/dev/null || echo "0")
            parsing_elapsed_ms=$(echo "$parsing_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        fi
    fi
    # Batch INSERT de todos os containers
    local inserted_ids
    local batch_insert_result
    INSERT_CUSTOM_LOG "DEBUG: batch_containers_data tem ${#batch_containers_data[@]} containers para inserir" "INFO" "$ScriptName"
    if [[ ${#batch_containers_data[@]} -gt 0 ]]; then
        local containers_insert_start_time
        containers_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
        
        local batch_stderr
        batch_stderr=$(mktemp)
        inserted_ids=$(INSERT_CONTAINERS_POSITIONS_BATCH "$current_timestamp" "${batch_containers_data[@]}" 2>"$batch_stderr")
        batch_insert_result=$?
        local batch_error
        batch_error=$(cat "$batch_stderr" 2>/dev/null)
        rm -f "$batch_stderr"
        
        if [[ $batch_insert_result -ne 0 ]]; then
            INSERT_CUSTOM_LOG "DEBUG: INSERT_CONTAINERS_POSITIONS_BATCH retornou erro: $batch_insert_result, stderr: ${batch_error:0:500}" "ERROR" "$ScriptName"
        else
            local inserted_ids_count
            inserted_ids_count=$(echo "$inserted_ids" | grep -c . || echo "0")
            INSERT_CUSTOM_LOG "DEBUG: INSERT_CONTAINERS_POSITIONS_BATCH sucesso, inserted_ids tem $inserted_ids_count linhas" "INFO" "$ScriptName"
        fi
        
        local containers_insert_end_time
        containers_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
        local containers_insert_elapsed_ms=0
        if [[ -n "$containers_insert_start_time" ]] && [[ -n "$containers_insert_end_time" ]]; then
            if command -v awk >/dev/null 2>&1; then
                containers_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($containers_insert_end_time - $containers_insert_start_time) * 1000}" 2>/dev/null || echo "0")
            else
                local containers_insert_elapsed_seconds
                containers_insert_elapsed_seconds=$(echo "$containers_insert_end_time - $containers_insert_start_time" | bc -l 2>/dev/null || echo "0")
                containers_insert_elapsed_ms=$(echo "$containers_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
            fi
        fi
        if [[ $batch_insert_result -ne 0 ]]; then
            INSERT_CUSTOM_LOG "Erro: não foi possível inserir containers em batch (código: $batch_insert_result)" "ERROR" "$ScriptName"
        else
            processed_count=${#batch_containers_data[@]}
            
            # Criar mapeamento ContainerId -> ContainerTrackingId
            declare -A container_tracking_map=()
            if [[ -n "$inserted_ids" ]]; then
                while IFS='|' read -r cid tracking_id; do
                    if [[ -n "$cid" && -n "$tracking_id" ]]; then
                        container_tracking_map["$cid"]="$tracking_id"
                    fi
                done <<< "$inserted_ids"
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
            local collection_elapsed_ms=0
            if [[ -n "$collection_start_time" ]] && [[ -n "$collection_end_time" ]]; then
                if command -v awk >/dev/null 2>&1; then
                    collection_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($collection_end_time - $collection_start_time) * 1000}" 2>/dev/null || echo "0")
                else
                    local collection_elapsed_seconds
                    collection_elapsed_seconds=$(echo "$collection_end_time - $collection_start_time" | bc -l 2>/dev/null || echo "0")
                    collection_elapsed_ms=$(echo "$collection_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                fi
            fi
            # Processar todos os items em um único batch INSERT
            # Se for update parcial, pular processamento de items
            if [[ "$is_partial_update" == "true" ]]; then
                INSERT_CUSTOM_LOG "Update parcial: items não processados (preservados do último registro completo)" "INFO" "$ScriptName"
            elif [[ ${#all_items_batch[@]} -gt 0 ]]; then
                local items_insert_start_time
                items_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
                
                local inserted_items_count
                inserted_items_count=$(INSERT_ALL_CONTAINERS_ITEMS_BATCH "$current_timestamp" "${all_items_batch[@]}" 2>/dev/null)
                local items_insert_result=$?
                
                local items_insert_end_time
                items_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
                local items_insert_elapsed_ms=0
                if [[ -n "$items_insert_start_time" ]] && [[ -n "$items_insert_end_time" ]]; then
                    if command -v awk >/dev/null 2>&1; then
                        items_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($items_insert_end_time - $items_insert_start_time) * 1000}" 2>/dev/null || echo "0")
                    else
                        local items_insert_elapsed_seconds
                        items_insert_elapsed_seconds=$(echo "$items_insert_end_time - $items_insert_start_time" | bc -l 2>/dev/null || echo "0")
                        items_insert_elapsed_ms=$(echo "$items_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                    fi
                fi
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
            
            # Não logar containers removidos individualmente para não poluir logs
            # Apenas marcar como destruído no banco
            
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
            if [[ -n "$update_error" ]] && ! echo "$update_error" | grep -q "database is locked"; then
                INSERT_CUSTOM_LOG "SQLite error (marcar container destruído): $update_error" "ERROR" "$ScriptName"
            fi
            
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
    fi

    INSERT_CUSTOM_LOG "Total de $processed_count containers rastreados" "INFO" "$ScriptName"
}
