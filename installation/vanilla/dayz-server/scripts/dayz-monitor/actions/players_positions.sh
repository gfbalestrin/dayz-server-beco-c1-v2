#!/bin/bash

handle_players_positions() {
    local line="$1"

    echo ">> Recebendo posições dos jogadores"

    local players
    players=$(echo "$line" | jq -c '.players[]')

    local previous_players=()
    while IFS= read -r player_id; do
        if [[ -n "$player_id" ]]; then
            previous_players+=("$player_id")
        fi
    done < <(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT PlayerID FROM players_online;" 2>/dev/null || true)

    local player_data player_id coord_x coord_z coord_y health blood shock energy water is_alive is_admin stamina stamina_max items_in_hands items_count main_items
    local current_players=()
    while IFS= read -r player_data; do
        if [[ -z "$player_data" ]]; then
            continue
        fi
        player_id=$(echo "$player_data" | jq -r '.player_id')
        if [[ -n "$player_id" ]]; then
            current_players+=("$player_id")
        fi
        coord_x=$(echo "$player_data" | jq -r '.x')
        coord_z=$(echo "$player_data" | jq -r '.z')
        coord_y=$(echo "$player_data" | jq -r '.y')

        health=$(echo "$player_data" | jq -r '.health // empty')
        blood=$(echo "$player_data" | jq -r '.blood // empty')
        shock=$(echo "$player_data" | jq -r '.shock // empty')
        energy=$(echo "$player_data" | jq -r '.energy // empty')
        water=$(echo "$player_data" | jq -r '.water // empty')
        is_alive=$(echo "$player_data" | jq -r '.is_alive // false')
        is_admin=$(echo "$player_data" | jq -r '.is_admin // false')
        stamina=$(echo "$player_data" | jq -r '.stamina // empty')
        stamina_max=$(echo "$player_data" | jq -r '.stamina_max // empty')
        items_in_hands=$(echo "$player_data" | jq -c '.items_in_hands // []')
        items_count=$(echo "$player_data" | jq -r '.items_count // empty')
        main_items=$(echo "$player_data" | jq -c '.main_items // []')

        local PlayerCoordId
        PlayerCoordId=$(INSERT_PLAYER_POSITION "$player_id" "$coord_x" "$coord_z" "$coord_y" \
            "$health" "$blood" "$shock" "$energy" "$water" \
            "$is_alive" "$is_admin" "$stamina" "$stamina_max" \
            "$items_in_hands" "$items_count" "$main_items")

        if [[ $? -eq 0 && -n "$PlayerCoordId" ]]; then
            echo ">> Posições armazenadas com sucesso (ID: $PlayerCoordId)"

            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                continue
            fi

            # Verificar último backup do jogador (intervalo mínimo de 5 minutos)
            local sanitized_player_id
            sanitized_player_id=$(echo "$player_id" | sed "s/'/''/g")
            
            # Calcular diferença em segundos usando SQLite (mais confiável)
            # Retorna NULL se não houver backup anterior
            local time_diff
            time_diff=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT CAST((julianday('now', 'localtime') - julianday(MAX(pcb.TimeStamp))) * 86400 AS INTEGER) FROM players_coord_backup pcb INNER JOIN players_coord pc ON pcb.PlayerCoordId = pc.PlayerCoordId WHERE pc.PlayerID = '$sanitized_player_id';" 2>/dev/null || echo "")
            
            local should_backup=true
            # Se time_diff não estiver vazio, verificar intervalo
            if [[ -n "$time_diff" ]]; then
                # Tentar comparação numérica (falha silenciosamente se não for número)
                if [[ "$time_diff" -ge 0 ]] 2>/dev/null && [[ "$time_diff" -lt 300 ]]; then
                    should_backup=false
                fi
            fi
            # Se time_diff estiver vazio/NULL, significa que não há backup anterior, então should_backup=true

            if [[ "$should_backup" != true ]]; then
                continue
            fi

            echo ">> Tentando realizar backup do personagem..."

            local backup
            backup=$(sqlite3 "$DB_FILENAME" "SELECT hex(Data) FROM Players where UID = '$player_id';")

            if [[ -n "$backup" ]]; then
                local MAX_ATTEMPTS ATTEMPT backup_success
                MAX_ATTEMPTS=5
                ATTEMPT=1
                backup_success=false

                while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
                    echo "Tentativa $ATTEMPT de $MAX_ATTEMPTS para backup..."

                    sqlite3 "$PLAYERS_BECO_C1_DB" <<EOF
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

                    echo "Falha na tentativa $ATTEMPT. Aguardando para tentar novamente..."
                    sleep $((ATTEMPT * 2))
                    ATTEMPT=$((ATTEMPT + 1))
                done

                if [[ "$backup_success" != true ]]; then
                    INSERT_CUSTOM_LOG "Erro: não foi possível inserir backup após $MAX_ATTEMPTS tentativas (coordenadas já salvas)." "ERROR" "$ScriptName"
                fi
            else
                echo "Player Data está em branco. Backup ignorado."
                INSERT_CUSTOM_LOG "Backup ignorado - dados do player não disponíveis" "INFO" "$ScriptName"
            fi
        else
            INSERT_CUSTOM_LOG "Erro: não foi possível salvar coordenadas do jogador $player_id" "ERROR" "$ScriptName"
        fi

    done <<< "$players"

    local player_count
    player_count=$(echo "$players" | wc -l)
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
    sync_sql="BEGIN;
CREATE TEMP TABLE IF NOT EXISTS SyncCurrent(PlayerID TEXT PRIMARY KEY);
DELETE FROM SyncCurrent;
"

    local sanitized_id
    local idx
    for idx in "${!current_players[@]}"; do
        sanitized_id=$(echo "${current_players[$idx]}" | sed "s/'/''/g")
        sync_sql+="INSERT INTO SyncCurrent(PlayerID) VALUES ('$sanitized_id');
INSERT INTO players_online (PlayerID, DataConnect) VALUES ('$sanitized_id', '$sync_timestamp')
ON CONFLICT(PlayerID) DO UPDATE SET DataConnect='$sync_timestamp';
"
    done

    if [[ ${#current_players[@]} -gt 0 ]]; then
        sync_sql+="DELETE FROM players_online WHERE PlayerID NOT IN (SELECT PlayerID FROM SyncCurrent);
"
    else
        sync_sql+="DELETE FROM players_online;
"
    fi

    sync_sql+="DROP TABLE IF EXISTS SyncCurrent;
COMMIT;
"

    local sync_output
    sync_output=$(sqlite3 "$PLAYERS_BECO_C1_DB" "$sync_sql" 2>&1)

    if [[ $? -ne 0 ]]; then
        INSERT_CUSTOM_LOG "Erro ao sincronizar players_online: $sync_output" "ERROR" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Tabela players_online sincronizada com sucesso ($player_count jogadores)." "INFO" "$ScriptName"
    fi
}

