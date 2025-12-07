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

    declare -A prev_vehicles=()

    # Medir tempo da query inicial
    local query_start_time
    query_start_time=$(date +%s.%N 2>/dev/null || date +%s)

    # Configurar PRAGMAs antes de acessar o banco
    configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"

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

    local vehicles
    vehicles=$(echo "$line" | jq -c '.vehicles[]?')

    local vehicle_count
    vehicle_count=$(echo "$line" | jq '.vehicles | length // 0')

    # Arrays para coletar dados antes de processar
    declare -a batch_vehicles_data=()  # Para batch INSERT
    declare -A vehicles_items_map=()    # VehicleId -> array de items
    declare -A vehicles_attachments_map=()  # VehicleId -> array de attachments
    declare -a vehicles_to_process=()   # Lista de veículos para processar logs
    local processed_count=0  # Contador de veículos processados (incluindo updates)

    # Primeira passagem: coletar todos os dados
    local vehicle_data
    while IFS= read -r vehicle_data; do
        if [[ -z "$vehicle_data" ]]; then
            continue
        fi

        local vehicle_id vehicle_name coord_x coord_z coord_y
        vehicle_id=$(echo "$vehicle_data" | jq -r '.vehicle_id')
        vehicle_name=$(echo "$vehicle_data" | jq -r '.vehicle_name')
        
        if [[ -z "$vehicle_id" ]]; then
            continue
        fi
        
        # Suportar tanto formato antigo (x, z, y) quanto novo (position.x, position.z, position.y)
        if echo "$vehicle_data" | jq -e '.position' >/dev/null 2>&1; then
            coord_x=$(echo "$vehicle_data" | jq -r '.position.x')
            coord_z=$(echo "$vehicle_data" | jq -r '.position.z')
            coord_y=$(echo "$vehicle_data" | jq -r '.position.y')
        else
            coord_x=$(echo "$vehicle_data" | jq -r '.x')
            coord_z=$(echo "$vehicle_data" | jq -r '.z')
            coord_y=$(echo "$vehicle_data" | jq -r '.y')
        fi
        
        # Extrair health_parts
        local engine_health body_health fuel_tank_health
        engine_health=$(echo "$vehicle_data" | jq -r '.health_parts.engine // empty')
        body_health=$(echo "$vehicle_data" | jq -r '.health_parts.body // empty')
        fuel_tank_health=$(echo "$vehicle_data" | jq -r '.health_parts.fuel_tank // empty')
        
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

        # Coletar items do veículo e comparar com anteriores (apenas snapshots completos)
        local current_items current_items_str
        current_items=$(echo "$vehicle_data" | jq -c '.items[]? | select(.type != null and .type != "" and .type != "empty")' 2>/dev/null)
        current_items_str=""
        if [[ -n "$current_items" ]]; then
            local items_batch=()
            while IFS= read -r item_data; do
                if [[ -z "$item_data" || "$item_data" == "null" || "$item_data" == "empty" ]]; then
                    continue
                fi
                local item_type item_health
                item_type=$(echo "$item_data" | jq -r '.type // empty' 2>/dev/null)
                item_health=$(echo "$item_data" | jq -r 'if .health != null and .health != "" then .health else empty end' 2>/dev/null)
                if [[ -n "$item_type" && "$item_type" != "empty" && "$item_type" != "null" ]]; then
                    if [[ -n "$item_health" ]]; then
                        items_batch+=("${item_type}|${item_health}")
                        current_items_str+="${item_type}:${item_health},"
                    else
                        items_batch+=("${item_type}")
                        current_items_str+="${item_type},"
                    fi
                fi
            done <<< "$current_items"
            # Remover última vírgula
            current_items_str="${current_items_str%,}"
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
        
        # Coletar attachments do veículo e comparar com anteriores (apenas snapshots completos)
        local current_attachments current_attachments_str
        if echo "$vehicle_data" | jq -e '.attachments | type == "array"' >/dev/null 2>&1; then
            current_attachments=$(echo "$vehicle_data" | jq -c '.attachments[]? | select(.type != null and .type != "" and .type != "empty") | {type: .type, health: (.health // null)}' 2>/dev/null | sort)
        else
            current_attachments=""
        fi
        current_attachments_str=""
        if [[ -n "$current_attachments" ]]; then
            local attachments_batch=()
            while IFS= read -r attachment_data; do
                if [[ -z "$attachment_data" || "$attachment_data" == "null" || "$attachment_data" == "empty" ]]; then
                    continue
                fi
                local attachment_type attachment_health
                attachment_type=$(echo "$attachment_data" | jq -r '.type // empty' 2>/dev/null)
                attachment_health=$(echo "$attachment_data" | jq -r 'if .health != null and .health != "" then .health else empty end' 2>/dev/null)
                if [[ -n "$attachment_type" && "$attachment_type" != "empty" && "$attachment_type" != "null" ]]; then
                    if [[ -n "$attachment_health" ]]; then
                        attachments_batch+=("${attachment_type}|${attachment_health}")
                        current_attachments_str+="${attachment_type}:${attachment_health},"
                    else
                        attachments_batch+=("${attachment_type}")
                        current_attachments_str+="${attachment_type},"
                    fi
                fi
            done <<< "$current_attachments"
            # Remover última vírgula
            current_attachments_str="${current_attachments_str%,}"
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
    done <<< "$vehicles"

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

    # Batch INSERT/UPDATE de todos os veículos
    local inserted_ids
    local batch_insert_result
    if [[ ${#batch_vehicles_data[@]} -gt 0 ]]; then
        local vehicles_insert_start_time
        vehicles_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
        
        # Usar função apropriada baseado no tipo de update
        if [[ "$is_partial_update" == "true" ]]; then
            UPDATE_VEHICLES_POSITIONS_PARTIAL "$current_timestamp" "${batch_vehicles_data[@]}"
            batch_insert_result=$?
        else
            inserted_ids=$(INSERT_VEHICLES_POSITIONS_BATCH "$current_timestamp" "${batch_vehicles_data[@]}")
            batch_insert_result=$?
        fi
        
        local vehicles_insert_end_time
        vehicles_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
        local vehicles_insert_elapsed_ms
        if command -v awk >/dev/null 2>&1; then
            vehicles_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($vehicles_insert_end_time - $vehicles_insert_start_time) * 1000}")
        else
            local vehicles_insert_elapsed_seconds
            vehicles_insert_elapsed_seconds=$(echo "$vehicles_insert_end_time - $vehicles_insert_start_time" | bc -l 2>/dev/null || echo "0")
            vehicles_insert_elapsed_ms=$(echo "$vehicles_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        fi
        
        if [[ "$is_partial_update" == "true" ]]; then
            INSERT_CUSTOM_LOG "Etapa [update_parcial_veiculos] executada em ${vehicles_insert_elapsed_ms}ms (veículos: ${#batch_vehicles_data[@]})" "INFO" "$ScriptName"
        else
            INSERT_CUSTOM_LOG "Etapa [batch_insert_veiculos] executada em ${vehicles_insert_elapsed_ms}ms (veículos: ${#batch_vehicles_data[@]})" "INFO" "$ScriptName"
        fi
        
        if [[ $batch_insert_result -ne 0 ]]; then
            if [[ "$is_partial_update" == "true" ]]; then
                INSERT_CUSTOM_LOG "Erro: não foi possível atualizar veículos parcialmente (código: $batch_insert_result)" "ERROR" "$ScriptName"
            else
                INSERT_CUSTOM_LOG "Erro: não foi possível inserir veículos em batch (código: $batch_insert_result)" "ERROR" "$ScriptName"
            fi
        else
            processed_count=${#batch_vehicles_data[@]}
            
            # Se for update parcial, pular processamento de items/attachments
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
                
                # Processar todos os items em um único batch INSERT
                if [[ ${#all_items_batch[@]} -gt 0 ]]; then
                    local items_insert_start_time
                    items_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
                    
                    local inserted_items_count
                    inserted_items_count=$(INSERT_ALL_VEHICLES_ITEMS_BATCH "$current_timestamp" "${all_items_batch[@]}" 2>/dev/null)
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
                        INSERT_CUSTOM_LOG "Erro ao inserir items de veículos em batch" "ERROR" "$ScriptName"
                    fi
                fi
                
                # Processar todos os attachments em um único batch INSERT
                if [[ ${#all_attachments_batch[@]} -gt 0 ]]; then
                    local attachments_insert_start_time
                    attachments_insert_start_time=$(date +%s.%N 2>/dev/null || date +%s)
                    
                    local inserted_attachments_count
                    inserted_attachments_count=$(INSERT_ALL_VEHICLES_ATTACHMENTS_BATCH "$current_timestamp" "${all_attachments_batch[@]}" 2>/dev/null)
                    local attachments_insert_result=$?
                    
                    local attachments_insert_end_time
                    attachments_insert_end_time=$(date +%s.%N 2>/dev/null || date +%s)
                    local attachments_insert_elapsed_ms
                    if command -v awk >/dev/null 2>&1; then
                        attachments_insert_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($attachments_insert_end_time - $attachments_insert_start_time) * 1000}")
                    else
                        local attachments_insert_elapsed_seconds
                        attachments_insert_elapsed_seconds=$(echo "$attachments_insert_end_time - $attachments_insert_start_time" | bc -l 2>/dev/null || echo "0")
                        attachments_insert_elapsed_ms=$(echo "$attachments_insert_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
                    fi
                    INSERT_CUSTOM_LOG "Etapa [batch_insert_attachments] executada em ${attachments_insert_elapsed_ms}ms (attachments: ${#all_attachments_batch[@]})" "INFO" "$ScriptName"
                    
                    if [[ $attachments_insert_result -ne 0 ]]; then
                        INSERT_CUSTOM_LOG "Erro ao inserir attachments de veículos em batch" "ERROR" "$ScriptName"
                    fi
                fi
            fi
        fi
    fi

    if [[ ${#prev_vehicles[@]} -gt 0 ]]; then
        local removed_start_time
        removed_start_time=$(date +%s.%N 2>/dev/null || date +%s)
        
        local removed_id removed_data rem_name rem_x rem_z rem_y
        for removed_id in "${!prev_vehicles[@]}"; do
            removed_data="${prev_vehicles[$removed_id]}"
            IFS='|' read -r rem_name rem_x rem_z rem_y <<< "$removed_data"
            Content="Veículo removido (ID=$removed_id) - Nome=\"$rem_name\" - Última posição=($rem_x,$rem_z,$rem_y)"
            INSERT_CUSTOM_LOG "$Content" "INFO" "$ScriptName"
            
            # Marcar todos os registros do veículo como destruído (garantir que não apareça no mapa)
            sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF
UPDATE vehicles_tracking
SET IsDestroyed = 1, DestroyedAt = '$current_timestamp'
WHERE VehicleId = '$removed_id'
AND (IsDestroyed = 0 OR IsDestroyed IS NULL);
EOF
            
            #SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        done
        
        local removed_end_time
        removed_end_time=$(date +%s.%N 2>/dev/null || date +%s)
        local removed_elapsed_ms
        if command -v awk >/dev/null 2>&1; then
            removed_elapsed_ms=$(awk "BEGIN {printf \"%.0f\", ($removed_end_time - $removed_start_time) * 1000}")
        else
            local removed_elapsed_seconds
            removed_elapsed_seconds=$(echo "$removed_end_time - $removed_start_time" | bc -l 2>/dev/null || echo "0")
            removed_elapsed_ms=$(echo "$removed_elapsed_seconds * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        fi
        INSERT_CUSTOM_LOG "Etapa [processamento_veiculos_removidos] executada em ${removed_elapsed_ms}ms (veículos: ${#prev_vehicles[@]})" "INFO" "$ScriptName"
    fi

    echo ">> $processed_count veículos processados de $vehicle_count totais"
    INSERT_CUSTOM_LOG "Total de $processed_count veículos rastreados" "INFO" "$ScriptName"
}

