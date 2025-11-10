#!/bin/bash

handle_players_positions() {
    local line="$1"

    echo ">> Recebendo posições dos jogadores"

    local players
    players=$(echo "$line" | jq -c '.players[]')

    local player_data player_id coord_x coord_z coord_y health blood shock energy water is_alive is_admin stamina stamina_max items_in_hands items_count main_items
    while IFS= read -r player_data; do
        player_id=$(echo "$player_data" | jq -r '.player_id')
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
}

