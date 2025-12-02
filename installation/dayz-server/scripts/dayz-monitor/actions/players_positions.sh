#!/bin/bash

# Função auxiliar para processar backup de jogador em background
process_player_backup() {
    local player_id="$1"
    local PlayerCoordId="$2"
    
    if [[ -z "$player_id" || -z "$PlayerCoordId" ]]; then
        return 1
    fi
    
    echo ">> Tentando realizar backup do personagem $player_id..."
    
    local backup
    backup=$(sqlite3 "$DB_FILENAME" "SELECT hex(Data) FROM Players where UID = '$player_id';" 2>/dev/null)
    
    if [[ -z "$backup" ]]; then
        echo "Player Data está em branco. Backup ignorado para $player_id"
        return 0
    fi
    
    local MAX_ATTEMPTS=5
    local ATTEMPT=1
    local backup_success=false
    
    while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
        sqlite3 "$PLAYERS_BECO_C1_DB" <<EOF 2>/dev/null
PRAGMA foreign_keys = ON;
INSERT INTO players_coord_backup (PlayerCoordId, Backup, TimeStamp)
VALUES (
    $PlayerCoordId,
    X'$(echo -n "$backup" | xxd -p | tr -d '\n')',
    datetime('now', 'localtime')
);
EOF
        
        if [[ $? -eq 0 ]]; then
            backup_success=true
            break
        fi
        
        sleep $((ATTEMPT * 2))
        ATTEMPT=$((ATTEMPT + 1))
    done
    
    if [[ "$backup_success" != true ]]; then
        INSERT_CUSTOM_LOG "Erro: não foi possível inserir backup após $MAX_ATTEMPTS tentativas para $player_id" "ERROR" "$ScriptName"
        return 1
    fi
    
    return 0
}

handle_players_positions() {
    local line="$1"
    local base_captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições dos jogadores"

    local players
    players=$(echo "$line" | jq -c '.players[]')

    # Configurar PRAGMAs antes de acessar o banco
    configure_sqlite_pragmas "$PLAYERS_BECO_C1_DB"
    
    local previous_players=()
    while IFS= read -r player_id; do
        if [[ -n "$player_id" ]]; then
            previous_players+=("$player_id")
        fi
    done < <(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT PlayerID FROM players_online;" 2>/dev/null || true)

    # Processar JSON uma vez e coletar dados em arrays
    declare -a batch_data=()
    declare -a current_players=()
    declare -a player_data_map=()
    
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -z "$base_captured_timestamp" ]]; then
        base_captured_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    fi
    
    # Extrair todos os dados de uma vez usando jq
    while IFS= read -r player_json; do
        if [[ -z "$player_json" ]]; then
            continue
        fi
        
        # Extrair todos os campos de uma vez
        local player_id coord_x coord_z coord_y health blood shock energy water is_alive is_admin stamina stamina_max items_in_hands items_count main_items
        
        player_id=$(echo "$player_json" | jq -r '.player_id // empty')
        if [[ -z "$player_id" ]]; then
            continue
        fi
        
        current_players+=("$player_id")
        
        coord_x=$(echo "$player_json" | jq -r '.x // empty')
        coord_z=$(echo "$player_json" | jq -r '.z // empty')
        coord_y=$(echo "$player_json" | jq -r '.y // empty')
        health=$(echo "$player_json" | jq -r '.health // empty')
        blood=$(echo "$player_json" | jq -r '.blood // empty')
        shock=$(echo "$player_json" | jq -r '.shock // empty')
        energy=$(echo "$player_json" | jq -r '.energy // empty')
        water=$(echo "$player_json" | jq -r '.water // empty')
        is_alive=$(echo "$player_json" | jq -r '.is_alive // false')
        is_admin=$(echo "$player_json" | jq -r '.is_admin // false')
        stamina=$(echo "$player_json" | jq -r '.stamina // empty')
        stamina_max=$(echo "$player_json" | jq -r '.stamina_max // empty')
        items_in_hands=$(echo "$player_json" | jq -c '.items_in_hands // []')
        items_count=$(echo "$player_json" | jq -r '.items_count // empty')
        main_items=$(echo "$player_json" | jq -c '.main_items // []')
        
        # Validar campos obrigatórios antes de adicionar ao batch
        # Coordenadas devem ser números válidos (ou pelo menos não vazias)
        if [[ -z "$coord_x" ]] || [[ -z "$coord_z" ]] || [[ -z "$coord_y" ]]; then
            echo ">> Aviso: Jogador $player_id pulado - coordenadas inválidas (x=$coord_x, z=$coord_z, y=$coord_y)" >&2
            continue
        fi
        
        # Armazenar dados completos para uso posterior (backups)
        player_data_map+=("$player_id|$coord_x|$coord_z|$coord_y|$health|$blood|$shock|$energy|$water|$is_alive|$is_admin|$stamina|$stamina_max|$items_in_hands|$items_count|$main_items")
        
        # Preparar dados para batch INSERT (formato: player_id|coord_x|coord_z|coord_y|...)
        batch_data+=("$player_id|$coord_x|$coord_z|$coord_y|$health|$blood|$shock|$energy|$water|$is_alive|$is_admin|$stamina|$stamina_max|$items_in_hands|$items_count|$main_items")
    done <<< "$players"
    
    # Batch INSERT de todas as posições
    local inserted_ids
    local batch_insert_result
    if [[ ${#batch_data[@]} -gt 0 ]]; then
        # Passar timestamp base se disponível (fallback para comportamento atual se não houver)
        if [[ -n "$base_captured_timestamp" ]]; then
            inserted_ids=$(INSERT_PLAYERS_POSITIONS_BATCH "$base_captured_timestamp" "${batch_data[@]}")
        else
            inserted_ids=$(INSERT_PLAYERS_POSITIONS_BATCH "${batch_data[@]}")
        fi
        batch_insert_result=$?
        
        if [[ $batch_insert_result -ne 0 ]]; then
            INSERT_CUSTOM_LOG "Erro: não foi possível inserir posições em batch (código: $batch_insert_result)" "ERROR" "$ScriptName"
        else
            # INSERT foi bem-sucedido, mesmo que não tenha conseguido pegar os IDs
            if [[ -n "$inserted_ids" ]]; then
                echo ">> Posições armazenadas em batch (${#batch_data[@]} jogadores) - IDs obtidos"
            else
                echo ">> Posições armazenadas em batch (${#batch_data[@]} jogadores) - IDs não disponíveis"
            fi
        fi
    fi
    
    # Se não for deathmatch, processar backups
    if [[ "$DayzDeathmatch" -ne "1" && ${#current_players[@]} -gt 0 ]]; then
        # Batch query para verificar últimos backups de todos os jogadores
        declare -A last_backups=()
        
        # Construir lista de PlayerIDs sanitizados para query
        local sanitized_ids=()
        local sanitized_ids_sql=""
        local first_id=1
        
        for player_id in "${current_players[@]}"; do
            local sanitized_id
            sanitized_id=$(echo "$player_id" | sed "s/'/''/g")
            sanitized_ids+=("$sanitized_id")
            
            if [[ $first_id -eq 0 ]]; then
                sanitized_ids_sql+=", "
            fi
            first_id=0
            sanitized_ids_sql+="'$sanitized_id'"
        done
        
        # Query batch para obter últimos backups
        if [[ -n "$sanitized_ids_sql" ]]; then
            while IFS='|' read -r backup_player_id backup_timestamp; do
                if [[ -n "$backup_player_id" && -n "$backup_timestamp" ]]; then
                    last_backups["$backup_player_id"]="$backup_timestamp"
                fi
            done < <(sqlite3 -separator '|' "$PLAYERS_BECO_C1_DB" "SELECT pc.PlayerID, MAX(pcb.TimeStamp) FROM players_coord_backup pcb INNER JOIN players_coord pc ON pcb.PlayerCoordId = pc.PlayerCoordId WHERE pc.PlayerID IN ($sanitized_ids_sql) GROUP BY pc.PlayerID;" 2>/dev/null)
        fi
        
        # Processar backups em background para jogadores que precisam
        # Criar mapa de PlayerID -> PlayerCoordId usando resultado do batch INSERT
        declare -A player_coord_map=()
        
        if [[ -n "$inserted_ids" ]]; then
            # inserted_ids já vem no formato "PlayerID|PlayerCoordId" da função batch
            while IFS='|' read -r pid coord_id; do
                if [[ -n "$pid" && -n "$coord_id" ]]; then
                    player_coord_map["$pid"]="$coord_id"
                fi
            done <<< "$inserted_ids"
        fi
        
        # Processar backups para cada jogador
        for player_data_entry in "${player_data_map[@]}"; do
            IFS='|' read -r player_id coord_x coord_z coord_y health blood shock energy water is_alive is_admin stamina stamina_max items_in_hands items_count main_items <<< "$player_data_entry"
            
            if [[ -z "$player_id" ]]; then
                continue
            fi
            
            # Obter PlayerCoordId do mapa
            local PlayerCoordId="${player_coord_map[$player_id]}"
            
            if [[ -z "$PlayerCoordId" ]]; then
                continue
            fi
            
            # Verificar se precisa fazer backup (intervalo mínimo de 5 minutos)
            local should_backup=true
            local last_backup_time="${last_backups[$player_id]}"
            
            if [[ -n "$last_backup_time" ]]; then
                local time_diff
                time_diff=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT CAST((julianday('now', 'localtime') - julianday('$last_backup_time')) * 86400 AS INTEGER);" 2>/dev/null || echo "")
                
                if [[ -n "$time_diff" ]]; then
                    if [[ "$time_diff" -ge 0 ]] 2>/dev/null && [[ "$time_diff" -lt 300 ]]; then
                        should_backup=false
                    fi
                fi
            fi
            
            if [[ "$should_backup" == true ]]; then
                # Processar backup em background
                (
                    process_player_backup "$player_id" "$PlayerCoordId"
                ) &
            fi
        done
    fi

    local player_count=${#current_players[@]}
    INSERT_CUSTOM_LOG "Total de $player_count jogadores rastreados" "INFO" "$ScriptName"

    local connect_players=()
    local disconnect_players=()

    for player_id in "${current_players[@]}"; do
        local found=false
        for prev_id in "${previous_players[@]}"; do
            if [[ "$player_id" == "$prev_id" ]]; then
                found=true
                break
            fi
        done
        if [[ "$found" != true ]]; then
            connect_players+=("$player_id")
        fi
    done

    for prev_id in "${previous_players[@]}"; do
        local found=false
        for player_id in "${current_players[@]}"; do
            if [[ "$prev_id" == "$player_id" ]]; then
                found=true
                break
            fi
        done
        if [[ "$found" != true ]]; then
            disconnect_players+=("$prev_id")
        fi
    done

    local update_script
    update_script="$AppFolder/$AppScriptUpdatePlayersOnlineFile"

    for player_id in "${connect_players[@]}"; do
        echo ">> Jogador $player_id conectou"
        if [[ -f "$update_script" ]]; then
            "$update_script" "$player_id" "CONNECT" &
        fi
    done

    for player_id in "${disconnect_players[@]}"; do
        echo ">> Jogador $player_id desconectou"
        if [[ -f "$update_script" ]]; then
            "$update_script" "$player_id" "DISCONNECT" &
        fi
    done

    local sync_timestamp
    sync_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    local sync_sql
    sync_sql="BEGIN IMMEDIATE;
CREATE TEMP TABLE IF NOT EXISTS SyncCurrent(PlayerID TEXT PRIMARY KEY);
DELETE FROM SyncCurrent;
"

    # Construir INSERT em batch para SyncCurrent e players_online
    if [[ ${#current_players[@]} -gt 0 ]]; then
        local sync_values=""
        local online_values=""
        local first_sync=1
        local first_online=1
        local sanitized_id
        
        for idx in "${!current_players[@]}"; do
            sanitized_id=$(echo "${current_players[$idx]}" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_sync -eq 0 ]]; then
                sync_values+=", "
            fi
            first_sync=0
            sync_values+="('$sanitized_id')"
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_online -eq 0 ]]; then
                online_values+=", "
            fi
            first_online=0
            online_values+="('$sanitized_id', '$sync_timestamp')"
        done
        
        sync_sql+="INSERT INTO SyncCurrent(PlayerID) VALUES $sync_values;
INSERT INTO players_online (PlayerID, DataConnect) VALUES $online_values
ON CONFLICT(PlayerID) DO UPDATE SET DataConnect='$sync_timestamp';
DELETE FROM players_online WHERE PlayerID NOT IN (SELECT PlayerID FROM SyncCurrent);
"
    else
        sync_sql+="DELETE FROM players_online;
"
    fi

    sync_sql+="DROP TABLE IF EXISTS SyncCurrent;
COMMIT;
"

    # Sincronizar players_online com retry logic para evitar locks
    local sync_output
    local sync_success=false
    local max_retries=5
    local retry_delay=0.2
    local attempt=1
    
    while [[ $attempt -le $max_retries ]]; do
        # Configurar PRAGMAs antes de cada tentativa
        configure_sqlite_pragmas "$PLAYERS_BECO_C1_DB"
        
        sync_output=$(sqlite3 "$PLAYERS_BECO_C1_DB" "$sync_sql" 2>&1)
        
        if [[ $? -eq 0 ]]; then
            sync_success=true
            break
        fi
        
        # Verificar se é erro de lock (código 5)
        if echo "$sync_output" | grep -q "database is locked"; then
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

    if [[ "$sync_success" == true ]]; then
        INSERT_CUSTOM_LOG "Tabela players_online sincronizada com sucesso ($player_count jogadores)." "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Erro ao sincronizar players_online após $max_retries tentativas: $sync_output" "ERROR" "$ScriptName"
    fi
}

