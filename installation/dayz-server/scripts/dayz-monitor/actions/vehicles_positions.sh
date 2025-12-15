#!/bin/bash

handle_vehicles_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições dos veículos"

    local current_timestamp
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi

    # Detectar se é update parcial (apenas coordenadas)
    local is_partial_update=false
    if echo "$line" | jq -e '.update_type == "position_only"' >/dev/null 2>&1; then
        is_partial_update=true
        INSERT_CUSTOM_LOG "Update parcial detectado: apenas coordenadas serão atualizadas" "INFO" "$ScriptName"
    fi

    # Toda lógica SQLite foi movida para o consumer no servidor de monitoramento
    # Aqui apenas publicamos o JSON original no RabbitMQ

    # Garantir que índice composto otimizado existe (criação automática se não existir)
    # Nota: SQLite não suporta DESC na definição do índice, mas ORDER BY DESC na query ainda usa o índice eficientemente
    sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_lookup ON vehicles_tracking(VehicleId, TimeStamp, IsDestroyed);" 2>/dev/null

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed';")
    
    # Buscar último registro de cada veículo usando window function (muito mais eficiente que subquery MAX)
    # Incluir health parts, items e attachments para comparação
    # Para snapshots completos: buscar apenas último registro completo (IsPartialUpdate = 0)
    # Para snapshots parciais: buscar último registro qualquer (completo ou parcial)
    # Usa índice composto idx_vehicles_tracking_lookup para performance otimizada
    local sql_query
    if [[ "$is_partial_update" == "true" ]]; then
        # Snapshot parcial: buscar último registro qualquer (completo ou parcial)
        if [[ "$has_is_destroyed" -eq 1 ]]; then
            sql_query="SELECT 
    ranked.VehicleId,
    ranked.VehicleName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(ranked.EngineHealth, ''),
    IFNULL(ranked.BodyHealth, ''),
    IFNULL(ranked.FuelTankHealth, ''),
    IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
    IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
    IFNULL(ranked.IsPartialUpdate, 0)
FROM (
    SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
           EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
           ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
    FROM vehicles_tracking
    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
) ranked
LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
         ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate"
        else
            sql_query="SELECT 
    ranked.VehicleId,
    ranked.VehicleName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(ranked.EngineHealth, ''),
    IFNULL(ranked.BodyHealth, ''),
    IFNULL(ranked.FuelTankHealth, ''),
    IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
    IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
    IFNULL(ranked.IsPartialUpdate, 0)
FROM (
    SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
           EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
           ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
    FROM vehicles_tracking
) ranked
LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
         ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate"
        fi
    else
        # Snapshot completo: buscar apenas último registro completo (IsPartialUpdate = 0)
        if [[ "$has_is_destroyed" -eq 1 ]]; then
            sql_query="SELECT 
    ranked.VehicleId,
    ranked.VehicleName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(ranked.EngineHealth, ''),
    IFNULL(ranked.BodyHealth, ''),
    IFNULL(ranked.FuelTankHealth, ''),
    IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
    IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
    IFNULL(ranked.IsPartialUpdate, 0)
FROM (
    SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
           EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
           ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
    FROM vehicles_tracking
    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
    AND IsPartialUpdate = 0
) ranked
LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
         ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate"
        else
            sql_query="SELECT 
    ranked.VehicleId,
    ranked.VehicleName,
    ranked.PositionX,
    ranked.PositionZ,
    ranked.PositionY,
    IFNULL(ranked.EngineHealth, ''),
    IFNULL(ranked.BodyHealth, ''),
    IFNULL(ranked.FuelTankHealth, ''),
    IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
    IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
    IFNULL(ranked.IsPartialUpdate, 0)
FROM (
    SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
           EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
           ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
    FROM vehicles_tracking
    WHERE IsPartialUpdate = 0
) ranked
LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
WHERE ranked.rn = 1
GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
         ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate"
        fi
    fi
    
    # Executar query com retry logic para evitar locks
    local query_output
    local query_success=false
    local max_retries=5
    local retry_delay=0.2
    local attempt=1
    
    while [[ $attempt -le $max_retries ]]; do
        # Configurar PRAGMAs antes de cada tentativa
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        query_output=$(sqlite3 -separator '|' "$AppFolder/$AppVehicleBecoC1DbFile" "$sql_query" 2>&1)
        
        if [[ $? -eq 0 ]]; then
            query_success=true
            break
        fi
        
        # Verificar se é erro de lock (código 5)
        if echo "$query_output" | grep -q "database is locked"; then
            if [[ $attempt -lt $max_retries ]]; then
                sleep "$retry_delay"
                # Backoff exponencial: 0.2, 0.4, 0.8, 1.6, 3.2
                retry_delay=$(awk "BEGIN {printf \"%.1f\", $retry_delay * 2}")
                attempt=$((attempt + 1))
                continue
            fi
        else
            # Erro diferente de lock, não tentar novamente
            break
        fi
    done
    
    local query_end_time
    query_end_time=$(date +%s.%N 2>/dev/null || date +%s)
    local query_elapsed_ms
    if command -v awk >/dev/null 2>&1; then
        query_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($query_end_time - $query_start_time) * 1000}")
    else
        local query_elapsed_seconds
        query_elapsed_seconds=$(echo "$query_end_time - $query_start_time" | bc -l 2>/dev/null || echo "0")
        query_elapsed_ms=$(echo "$query_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
    fi
    INSERT_CUSTOM_LOG "Etapa [query_veiculos_anteriores] executada em ${query_elapsed_ms}ms (tentativas: $attempt)" "INFO" "$ScriptName"
    
    if [[ "$query_success" != true ]]; then
        INSERT_CUSTOM_LOG "Erro ao buscar veículos anteriores após $max_retries tentativas: $query_output" "ERROR" "$ScriptName"
        query_output=""  # Limpar output para não processar dados inválidos
    fi
    
    while IFS='|' read -r prev_id prev_name prev_x prev_z prev_y prev_engine_health prev_body_health prev_fuel_tank_health prev_items_str prev_attachments_str prev_is_partial_update; do
        # Pular linhas vazias ou quando prev_id está vazio
        if [[ -z "$prev_id" ]]; then
            continue
        fi
        local prev_x_fmt prev_z_fmt prev_y_fmt
        prev_x_fmt=$(format_coord "$prev_x")
        prev_z_fmt=$(format_coord "$prev_z")
        prev_y_fmt=$(format_coord "$prev_y")
        # Normalizar is_partial_update (0 = completo, 1 = parcial)
        local prev_is_partial_norm
        prev_is_partial_norm="${prev_is_partial_update:-0}"
        if [[ "$prev_is_partial_norm" != "0" && "$prev_is_partial_norm" != "1" ]]; then
            prev_is_partial_norm="0"
        fi
        # Armazenar: name|x|z|y|engine_health|body_health|fuel_tank_health|items_str|attachments_str|is_partial_update
        prev_vehicles["$prev_id"]="$prev_name|$prev_x_fmt|$prev_z_fmt|$prev_y_fmt|${prev_engine_health:-}|${prev_body_health:-}|${prev_fuel_tank_health:-}|${prev_items_str:-}|${prev_attachments_str:-}|$prev_is_partial_norm"
    done <<< "$query_output"

    # Medir tempo do parsing do JSON
    local parsing_start_time
    parsing_start_time=$(date +%s.%N 2>/dev/null || date +%s)

    local vehicle_count
    vehicle_count=$(echo "$line" | jq '.vehicles | length // 0')

    # Arrays para coletar dados antes de processar
    declare -a batch_vehicles_data=()  # Para batch INSERT
    declare -A vehicles_items_map=()    # VehicleId -> array de items
    declare -A vehicles_attachments_map=()  # VehicleId -> array de attachments
    declare -a vehicles_to_process=()   # Lista de veículos para processar logs
    local processed_count=0  # Contador de veículos processados (incluindo updates)

    # Extrair todos os veículos de uma vez com uma única chamada jq (otimização de performance)
    local all_vehicles_data
    if [[ "$is_partial_update" == "true" ]]; then
        # Snapshot parcial: extrair apenas campos básicos (sem items/attachments)
        all_vehicles_data=$(echo "$line" | jq -r '
            .vehicles[]? |
            (if .vehicle_id then .vehicle_id else "" end) + "|" +
            (if .vehicle_name then .vehicle_name else "" end) + "|" +
            (if .position then (if .position.x then (.position.x | tostring) else "" end) else (if .x then (.x | tostring) else "" end) end) + "|" +
            (if .position then (if .position.z then (.position.z | tostring) else "" end) else (if .z then (.z | tostring) else "" end) end) + "|" +
            (if .position then (if .position.y then (.position.y | tostring) else "" end) else (if .y then (.y | tostring) else "" end) end) + "|" +
            (if .health_parts.engine then (.health_parts.engine | tostring) else "" end) + "|" +
            (if .health_parts.body then (.health_parts.body | tostring) else "" end) + "|" +
            (if .health_parts.fuel_tank then (.health_parts.fuel_tank | tostring) else "" end) + "|" +
            "" + "|" +
            ""
        ' 2>/dev/null)
    else
        # Snapshot completo: extrair campos básicos + items + attachments
        all_vehicles_data=$(echo "$line" | jq -r '
            .vehicles[]? |
            (if .vehicle_id then .vehicle_id else "" end) + "|" +
            (if .vehicle_name then .vehicle_name else "" end) + "|" +
            (if .position then (if .position.x then (.position.x | tostring) else "" end) else (if .x then (.x | tostring) else "" end) end) + "|" +
            (if .position then (if .position.z then (.position.z | tostring) else "" end) else (if .z then (.z | tostring) else "" end) end) + "|" +
            (if .position then (if .position.y then (.position.y | tostring) else "" end) else (if .y then (.y | tostring) else "" end) end) + "|" +
            (if .health_parts.engine then (.health_parts.engine | tostring) else "" end) + "|" +
            (if .health_parts.body then (.health_parts.body | tostring) else "" end) + "|" +
            (if .health_parts.fuel_tank then (.health_parts.fuel_tank | tostring) else "" end) + "|" +
            ([.items[]? | select(.type != null and .type != "" and .type != "empty")] |
             if length > 0 then
               map(.type + ":" + (if .health != null and .health != "" then (.health | tostring) else "" end)) |
               join(",")
             else
               ""
             end) + "|" +
            ([.attachments[]? | select(.type != null and .type != "" and .type != "empty")] |
             if length > 0 then
               map(.type + ":" + (if .health != null and .health != "" then (.health | tostring) else "" end)) |
               join(",")
             else
               ""
             end)
        ' 2>/dev/null)
    fi

    # Processar todas as linhas extraídas
    while IFS='|' read -r vehicle_id vehicle_name coord_x coord_z coord_y engine_health body_health fuel_tank_health current_items_str current_attachments_str; do
        if [[ -z "$vehicle_id" || "$vehicle_id" == "null" ]]; then
            continue
        fi
        
        # Formatar coordenadas
        local coord_x_fmt coord_z_fmt coord_y_fmt
        coord_x_fmt=$(format_coord "$coord_x")
        coord_z_fmt=$(format_coord "$coord_z")
        coord_y_fmt=$(format_coord "$coord_y")

        # Processar logs de novos veículos e movimentação
        local prev_data diff_message
        prev_data="${prev_vehicles[$vehicle_id]}"
        diff_message=""
        if [[ -z "$prev_data" ]]; then
            Content="Veículo novo detectado (ID=$vehicle_id) - Nome=\"$vehicle_name\" - Coords=($coord_x_fmt,$coord_z_fmt,$coord_y_fmt)"
            INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
        else
            local prev_name prev_x prev_z prev_y prev_engine_health prev_body_health prev_fuel_tank_health prev_items_str prev_attachments_str prev_is_partial_update
            IFS='|' read -r prev_name prev_x prev_z prev_y prev_engine_health prev_body_health prev_fuel_tank_health prev_items_str prev_attachments_str prev_is_partial_update <<< "$prev_data"

            # Comparar posição (valores já estão formatados quando lidos do array prev_vehicles)
            if [[ "$coord_x_fmt" != "$prev_x" || "$coord_z_fmt" != "$prev_z" || "$coord_y_fmt" != "$prev_y" ]]; then
                diff_message+="movido((${prev_x},${prev_z},${prev_y})->(${coord_x_fmt},${coord_z_fmt},${coord_y_fmt})); "
            fi

            # Comparar health parts (normalizar valores vazios/null e formatar números para comparação)
            local prev_engine_health_norm prev_body_health_norm prev_fuel_tank_health_norm
            local engine_health_norm body_health_norm fuel_tank_health_norm
            
            # Normalizar valores vazios/null e formatar números (usar format_coord para normalizar)
            if [[ -n "$prev_engine_health" && "$prev_engine_health" != "null" ]]; then
                prev_engine_health_norm=$(format_coord "$prev_engine_health")
            else
                prev_engine_health_norm=""
            fi
            if [[ -n "$prev_body_health" && "$prev_body_health" != "null" ]]; then
                prev_body_health_norm=$(format_coord "$prev_body_health")
            else
                prev_body_health_norm=""
            fi
            if [[ -n "$prev_fuel_tank_health" && "$prev_fuel_tank_health" != "null" ]]; then
                prev_fuel_tank_health_norm=$(format_coord "$prev_fuel_tank_health")
            else
                prev_fuel_tank_health_norm=""
            fi
            
            if [[ -n "$engine_health" && "$engine_health" != "null" ]]; then
                engine_health_norm=$(format_coord "$engine_health")
            else
                engine_health_norm=""
            fi
            if [[ -n "$body_health" && "$body_health" != "null" ]]; then
                body_health_norm=$(format_coord "$body_health")
            else
                body_health_norm=""
            fi
            if [[ -n "$fuel_tank_health" && "$fuel_tank_health" != "null" ]]; then
                fuel_tank_health_norm=$(format_coord "$fuel_tank_health")
            else
                fuel_tank_health_norm=""
            fi

            if [[ "$engine_health_norm" != "$prev_engine_health_norm" ]]; then
                diff_message+="engine_health(${prev_engine_health_norm:-vazio}->${engine_health_norm:-vazio}); "
            fi
            if [[ "$body_health_norm" != "$prev_body_health_norm" ]]; then
                diff_message+="body_health(${prev_body_health_norm:-vazio}->${body_health_norm:-vazio}); "
            fi
            if [[ "$fuel_tank_health_norm" != "$prev_fuel_tank_health_norm" ]]; then
                diff_message+="fuel_tank_health(${prev_fuel_tank_health_norm:-vazio}->${fuel_tank_health_norm:-vazio}); "
            fi

            unset "prev_vehicles[$vehicle_id]"
        fi

        # Verificar se deve usar UPDATE ao invés de INSERT
        local is_new_vehicle=false
        if [[ -z "$prev_data" ]]; then
            is_new_vehicle=true
        fi
        
        local should_update_timestamp=false
        if [[ "$is_new_vehicle" == false ]]; then
            if [[ "$is_partial_update" == "true" ]]; then
                # Para updates parciais: usar UPDATE se posição e health não mudaram
                if [[ -z "$diff_message" ]]; then
                    should_update_timestamp=true
                fi
            else
                # Para updates completos: usar UPDATE se não houver mudanças (posição, health, items e attachments iguais)
                # diff_message será preenchido após processar items e attachments abaixo
                # Verificação será feita após processamento completo
                :
            fi
        fi
        
        # Se for update parcial e não houver mudanças, atualizar timestamp
        if [[ "$is_partial_update" == "true" && "$should_update_timestamp" == true ]]; then
            local VehicleTrackingId update_exit_code
            VehicleTrackingId=$(UPDATE_VEHICLE_TIMESTAMP "$vehicle_id" "$current_timestamp" "false")
            update_exit_code=$?
            
            if [[ $update_exit_code -eq 0 && -n "$VehicleTrackingId" && "$VehicleTrackingId" =~ ^[0-9]+$ ]]; then
                processed_count=$((processed_count + 1))
            else
                local error_msg="Erro ao atualizar timestamp do veículo $vehicle_id"
                if [[ -n "$VehicleTrackingId" ]]; then
                    error_msg="$error_msg - Resposta: $VehicleTrackingId"
                fi
                if [[ $update_exit_code -ne 0 ]]; then
                    error_msg="$error_msg - Exit code: $update_exit_code"
                fi
                INSERT_CUSTOM_LOG "$error_msg" "ERROR" "$ScriptName"
            fi
            continue  # Pular processamento de items/attachments e não adicionar ao batch
        fi
        
        # Se for update parcial e houver mudanças, adicionar ao batch
        if [[ "$is_partial_update" == "true" && "$should_update_timestamp" == false ]]; then
            # Adicionar ao batch com coordenadas e health_parts (formato: vehicle_id|vehicle_name|coord_x|coord_z|coord_y|engine_health|body_health|fuel_tank_health)
            batch_vehicles_data+=("$vehicle_id|$vehicle_name|$coord_x_fmt|$coord_z_fmt|$coord_y_fmt|${engine_health:-}|${body_health:-}|${fuel_tank_health:-}")
            vehicles_to_process+=("$vehicle_id")
            continue  # Pular processamento de items/attachments
        fi

        # Processar items (já extraídos na chamada jq acima)
        # Converter current_items_str (formato "type:health,type:health") para items_batch (formato "type|health")
        if [[ -n "$current_items_str" && "$is_partial_update" == "false" ]]; then
            local items_batch=()
            IFS=',' read -ra items_array <<< "$current_items_str"
            for item_pair in "${items_array[@]}"; do
                if [[ -n "$item_pair" ]]; then
                    local item_type item_health
                    IFS=':' read -r item_type item_health <<< "$item_pair"
                    if [[ -n "$item_type" ]]; then
                        if [[ -n "$item_health" ]]; then
                            items_batch+=("${item_type}|${item_health}")
                        else
                            items_batch+=("${item_type}")
                        fi
                    fi
                fi
            done
            if [[ ${#items_batch[@]} -gt 0 ]]; then
                # Armazenar items como string separada por newlines para depois processar
                vehicles_items_map["$vehicle_id"]=$(IFS=$'\n'; echo "${items_batch[*]}")
            fi
        fi
        
        # Comparar items com anteriores (apenas snapshots completos)
        # Para snapshots completos: só comparar se o último registro também for completo (IsPartialUpdate = 0)
        if [[ "$is_partial_update" == false ]]; then
            if [[ -n "$prev_data" ]]; then
                # Verificar se último registro é completo (IsPartialUpdate = 0)
                if [[ "$prev_is_partial_update" == "0" ]]; then
                    # Último registro é completo: comparar items
                    if [[ -n "$prev_items_str" && -n "$current_items_str" ]]; then
                        # Ordenar strings para comparação
                        local prev_items_sorted current_items_sorted
                        prev_items_sorted=$(echo "$prev_items_str" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')
                        current_items_sorted=$(echo "$current_items_str" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')
                        if [[ "$prev_items_sorted" != "$current_items_sorted" ]]; then
                            diff_message+="items_alterados; "
                        fi
                    elif [[ -z "$prev_items_str" && -n "$current_items_str" ]]; then
                        diff_message+="items_adicionados; "
                    elif [[ -n "$prev_items_str" && -z "$current_items_str" ]]; then
                        diff_message+="items_removidos; "
                    fi
                else
                    # Último registro é parcial: considerar como novo snapshot completo (items adicionados)
                    if [[ -n "$current_items_str" ]]; then
                        diff_message+="items_adicionados; "
                    fi
                fi
            else
                # Veículo novo: items adicionados
                if [[ -n "$current_items_str" ]]; then
                    diff_message+="items_adicionados; "
                fi
            fi
        fi
        
        # Processar attachments (já extraídos na chamada jq acima)
        # Converter current_attachments_str (formato "type:health,type:health") para attachments_batch (formato "type|health")
        if [[ -n "$current_attachments_str" && "$is_partial_update" == "false" ]]; then
            local attachments_batch=()
            IFS=',' read -ra attachments_array <<< "$current_attachments_str"
            for attachment_pair in "${attachments_array[@]}"; do
                if [[ -n "$attachment_pair" ]]; then
                    local attachment_type attachment_health
                    IFS=':' read -r attachment_type attachment_health <<< "$attachment_pair"
                    if [[ -n "$attachment_type" ]]; then
                        if [[ -n "$attachment_health" ]]; then
                            attachments_batch+=("${attachment_type}|${attachment_health}")
                        else
                            attachments_batch+=("${attachment_type}")
                        fi
                    fi
                fi
            done
            if [[ ${#attachments_batch[@]} -gt 0 ]]; then
                # Armazenar attachments como string separada por newlines para depois processar
                vehicles_attachments_map["$vehicle_id"]=$(IFS=$'\n'; echo "${attachments_batch[*]}")
            fi
        fi
        
        # Comparar attachments com anteriores (apenas snapshots completos)
        # Para snapshots completos: só comparar se o último registro também for completo (IsPartialUpdate = 0)
        if [[ "$is_partial_update" == false ]]; then
            if [[ -n "$prev_data" ]]; then
                # Verificar se último registro é completo (IsPartialUpdate = 0)
                if [[ "$prev_is_partial_update" == "0" ]]; then
                    # Último registro é completo: comparar attachments
                    if [[ -n "$prev_attachments_str" && -n "$current_attachments_str" ]]; then
                        # Ordenar strings para comparação
                        local prev_attachments_sorted current_attachments_sorted
                        prev_attachments_sorted=$(echo "$prev_attachments_str" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')
                        current_attachments_sorted=$(echo "$current_attachments_str" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')
                        if [[ "$prev_attachments_sorted" != "$current_attachments_sorted" ]]; then
                            diff_message+="attachments_alterados; "
                        fi
                    elif [[ -z "$prev_attachments_str" && -n "$current_attachments_str" ]]; then
                        diff_message+="attachments_adicionados; "
                    elif [[ -n "$prev_attachments_str" && -z "$current_attachments_str" ]]; then
                        diff_message+="attachments_removidos; "
                    fi
                else
                    # Último registro é parcial: considerar como novo snapshot completo (attachments adicionados)
                    if [[ -n "$current_attachments_str" ]]; then
                        diff_message+="attachments_adicionados; "
                    fi
                fi
            else
                # Veículo novo: attachments adicionados
                if [[ -n "$current_attachments_str" ]]; then
                    diff_message+="attachments_adicionados; "
                fi
            fi
        fi

        # Para snapshots completos, verificar se deve usar UPDATE após processar items e attachments
        if [[ "$is_partial_update" == false ]]; then
            if [[ "$is_new_vehicle" == false && -z "$diff_message" ]]; then
                # Não houver mudanças: atualizar timestamp do registro principal e dos items/attachments
                local VehicleTrackingId update_exit_code
                VehicleTrackingId=$(UPDATE_VEHICLE_TIMESTAMP "$vehicle_id" "$current_timestamp" "true")
                update_exit_code=$?
                
                if [[ $update_exit_code -eq 0 && -n "$VehicleTrackingId" && "$VehicleTrackingId" =~ ^[0-9]+$ ]]; then
                    # Atualizar TimeStamp de todos os items e attachments do registro
                    configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
                    
                    # Atualizar TimeStamp dos items
                    sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF
UPDATE vehicles_items
SET TimeStamp = '$current_timestamp'
WHERE VehicleTrackingId = $VehicleTrackingId;
EOF
                    local items_update_result=$?
                    
                    # Atualizar TimeStamp dos attachments
                    sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF
UPDATE vehicles_attachments
SET TimeStamp = '$current_timestamp'
WHERE VehicleTrackingId = $VehicleTrackingId;
EOF
                    local attachments_update_result=$?
                    
                    if [[ $items_update_result -eq 0 && $attachments_update_result -eq 0 ]]; then
                        processed_count=$((processed_count + 1))
                    else
                        local error_msg="Erro ao atualizar timestamp de items/attachments do veículo $vehicle_id (VehicleTrackingId: $VehicleTrackingId)"
                        if [[ $items_update_result -ne 0 ]]; then
                            error_msg="$error_msg - Items update failed"
                        fi
                        if [[ $attachments_update_result -ne 0 ]]; then
                            error_msg="$error_msg - Attachments update failed"
                        fi
                        INSERT_CUSTOM_LOG "$error_msg" "ERROR" "$ScriptName"
                    fi
                else
                    local error_msg="Erro ao atualizar timestamp do veículo $vehicle_id"
                    if [[ -n "$VehicleTrackingId" ]]; then
                        error_msg="$error_msg - Resposta: $VehicleTrackingId"
                    fi
                    if [[ $update_exit_code -ne 0 ]]; then
                        error_msg="$error_msg - Exit code: $update_exit_code"
                    fi
                    INSERT_CUSTOM_LOG "$error_msg" "ERROR" "$ScriptName"
                fi
                # Não adicionar ao batch, pular processamento de items/attachments (já atualizados)
                continue
            fi
        fi
        
        # Adicionar ao batch de veículos (formato: vehicle_id|vehicle_name|coord_x|coord_z|coord_y|engine_health|body_health|fuel_tank_health)
        batch_vehicles_data+=("$vehicle_id|$vehicle_name|$coord_x_fmt|$coord_z_fmt|$coord_y_fmt|${engine_health:-}|${body_health:-}|${fuel_tank_health:-}")
        vehicles_to_process+=("$vehicle_id")
    done <<< "$all_vehicles_data"

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
    INSERT_CUSTOM_LOG "Etapa [parsing_json_coleta_dados] executada em ${parsing_elapsed_ms}ms (veículos: $vehicle_count)" "INFO" "$ScriptName"

    # Publicar dados no RabbitMQ (toda lógica SQLite será feita no consumer)
    if [[ -n "$line" ]]; then
        local rabbitmq_payload
        rabbitmq_payload=$(echo "$line" | jq -c . 2>/dev/null)
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "data.vehicles.positions" "$rabbitmq_payload"
            processed_count=${#batch_vehicles_data[@]}
            INSERT_CUSTOM_LOG "Dados de veículos publicados no RabbitMQ (veículos: ${#batch_vehicles_data[@]})" "INFO" "$ScriptName"
        fi
    fi
    
    if [[ ${#batch_vehicles_data[@]} -gt 0 ]]; then
        # Processamento de items/attachments será feito no consumer
        if [[ "$is_partial_update" == "true" ]]; then
            INSERT_CUSTOM_LOG "Update parcial: items/attachments não processados (preservados do último registro completo)" "INFO" "$ScriptName"
        else
                # Criar mapeamento VehicleId -> VehicleTrackingId
                declare -A vehicle_tracking_map=()
                if [[ -n "$inserted_ids" ]]; then
                    while IFS='|' read -r vid tracking_id; do
                        if [[ -n "$vid" && -n "$tracking_id" ]]; then
                            vehicle_tracking_map["$vid"]="$tracking_id"
                        fi
                    done <<< "$inserted_ids"
                fi
                
                # Coletar todos os items e attachments de todos os veículos em arrays globais
                local collection_start_time
                collection_start_time=$(date +%s.%N 2>/dev/null || date +%s)
                
                declare -a all_items_batch=()
                declare -a all_attachments_batch=()
                
                for vehicle_id in "${vehicles_to_process[@]}"; do
                local VehicleTrackingId="${vehicle_tracking_map[$vehicle_id]}"
                if [[ -z "$VehicleTrackingId" ]]; then
                    continue
                fi
                
                # Coletar items do veículo no formato VehicleTrackingId|type|health
                if [[ -n "${vehicles_items_map[$vehicle_id]}" ]]; then
                    local items_string="${vehicles_items_map[$vehicle_id]}"
                    while IFS= read -r item_entry; do
                        if [[ -n "$item_entry" ]]; then
                            # Formato: VehicleTrackingId|type|health (ou VehicleTrackingId|type se não houver health)
                            all_items_batch+=("$VehicleTrackingId|$item_entry")
                        fi
                    done <<< "$items_string"
                fi
                
                # Coletar attachments do veículo no formato VehicleTrackingId|type|health
                if [[ -n "${vehicles_attachments_map[$vehicle_id]}" ]]; then
                    local attachments_string="${vehicles_attachments_map[$vehicle_id]}"
                    while IFS= read -r attachment_entry; do
                        if [[ -n "$attachment_entry" ]]; then
                            # Formato: VehicleTrackingId|type|health (ou VehicleTrackingId|type se não houver health)
                            all_attachments_batch+=("$VehicleTrackingId|$attachment_entry")
                        fi
                    done <<< "$attachments_string"
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
                INSERT_CUSTOM_LOG "Etapa [coleta_items_attachments_globais] executada em ${collection_elapsed_ms}ms (items: ${#all_items_batch[@]}, attachments: ${#all_attachments_batch[@]})" "INFO" "$ScriptName"
                
                # Processamento de items/attachments será feito no consumer
            fi
        fi
    fi

    # Detecção de veículos removidos será feita no consumer

    echo ">> $processed_count veículos processados de $vehicle_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count veículos rastreados" "INFO" "$ScriptName"
}

