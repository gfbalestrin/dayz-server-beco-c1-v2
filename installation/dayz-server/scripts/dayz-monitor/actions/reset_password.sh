#!/bin/bash

handle_reset_password() {
    local line="$1"
    local player_id CurrentDate
    player_id=$(echo "$line" | jq -r '.player_id')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo ">> Resetando senha de $player_id"
    INSERT_CUSTOM_LOG "Resetando senha de $player_id" "INFO" "$ScriptName"

    if ! python3 -c "import bcrypt" 2>/dev/null; then
        echo ">> Instalando bcrypt..."
        if ! pip3 install bcrypt --quiet 2>/dev/null; then
            echo "Erro: Falha ao instalar bcrypt. Instale manualmente com: pip3 install bcrypt"
            echo "$player_id;[ERROR] Erro interno ao resetar senha (bcrypt não disponível)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            return
        fi
    fi

    local PLAYERS_BECO_C1_DB URL_LOADOUT
    PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"
    URL_LOADOUT="$AppUrlAppLoadout"

    local player_id_escaped
    player_id_escaped=$(echo "$player_id" | sed "s/'/''/g")

    local PlayerExists
    PlayerExists=$(sqlite3 -separator "|" "$PLAYERS_BECO_C1_DB" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$player_id_escaped' LIMIT 1;")
    if [[ -z "$PlayerExists" ]]; then
        echo "Erro: PlayerID não consta na database de jogadores"
        echo "$player_id;[ERROR] PlayerID não consta na database de jogadores. Ative sua conta antes." >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
        return
    fi

    local PlayerName SteamID SteamName
    PlayerName=$(echo "$PlayerExists" | cut -d'|' -f1 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
    SteamID=$(echo "$PlayerExists" | cut -d'|' -f2)
    SteamName=$(echo "$PlayerExists" | cut -d'|' -f3 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)

    local UserExists
    UserExists=$(sqlite3 -separator "|" "$PLAYERS_BECO_C1_DB" "SELECT UserID, Username FROM users WHERE PlayerID = '$player_id_escaped' LIMIT 1;")

    local login senha hash hash_escaped
    if [[ -n "$UserExists" ]]; then
        local UserID
        UserID=$(echo "$UserExists" | cut -d'|' -f1)
        login=$(echo "$UserExists" | cut -d'|' -f2 | xargs)

        senha=$(shuf -i 1000-9999 -n 1)
        hash=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$senha'.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8'))" 2>/dev/null)

        if [[ -z "$hash" ]]; then
            echo "Erro: Falha ao gerar hash da senha"
            echo "$player_id;[ERROR] Erro interno ao resetar senha (falha ao gerar hash)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            return
        fi

        hash_escaped=$(echo "$hash" | sed "s/'/''/g")
        
        # Publicar no RabbitMQ (toda lógica SQLite será feita no consumer)
        local rabbitmq_payload
        rabbitmq_payload=$(jq -n \
            --arg action "update_password" \
            --arg user_id "$UserID" \
            --arg password_hash "$hash_escaped" \
            --arg player_id "$player_id" \
            --arg username "$login" \
            '{action: $action, user_id: $user_id, password_hash: $password_hash, player_id: $player_id, username: $username}' 2>/dev/null)
        
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "users.management" "$rabbitmq_payload"
        else
            echo "Erro: Falha ao criar payload RabbitMQ"
            echo "$player_id;[ERROR] Erro interno ao resetar senha (falha ao criar payload)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            return
        fi
    else
        local base_login suffix login_escaped
        base_login=$(echo "$SteamName" | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9' | cut -c1-10)
        if [[ -z "$base_login" ]]; then
            base_login="survivor"
        fi
        login="$base_login"

        suffix=1
        while sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT 1 FROM users WHERE Username = '$login' LIMIT 1;" | grep -q 1; do
            login="${base_login}${suffix}"
            suffix=$((suffix + 1))
        done

        senha=$(shuf -i 1000-9999 -n 1)
        hash=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$senha'.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8'))" 2>/dev/null)

        if [[ -z "$hash" ]]; then
            echo "Erro: Falha ao gerar hash da senha"
            echo "$player_id;[ERROR] Erro interno ao resetar senha (falha ao gerar hash)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            return
        fi

        hash_escaped=$(echo "$hash" | sed "s/'/''/g")
        login_escaped=$(echo "$login" | sed "s/'/''/g")

        # Publicar no RabbitMQ (toda lógica SQLite será feita no consumer)
        local rabbitmq_payload
        rabbitmq_payload=$(jq -n \
            --arg action "create_user" \
            --arg username "$login_escaped" \
            --arg password_hash "$hash_escaped" \
            --arg player_id "$player_id_escaped" \
            '{action: $action, username: $username, password_hash: $password_hash, player_id: $player_id, user_type: "player", is_active: 1, must_change_password: 1}' 2>/dev/null)
        
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "users.management" "$rabbitmq_payload"
        else
            echo "Erro: Falha ao criar payload RabbitMQ"
            echo "$player_id;[ERROR] Erro interno ao resetar senha (falha ao criar payload)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            return
        fi
    fi

    echo ">> Senha redefinida com sucesso para o jogador $player_id"
    echo "Login: $login"
    echo "Senha: $senha"
    echo "URL: $URL_LOADOUT"

    echo "$player_id;Nova senha gerada com sucesso. Acesse $URL_LOADOUT" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
    echo "$player_id;Login: $login" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
    echo "$player_id;Nova senha: $senha" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"

    # Registrar evento de reset de senha
    if [[ -n "$player_id" ]] && [[ ${#player_id} -eq 44 ]]; then
        local DetailsJson
        DetailsJson="{\"action_type\": \"password_reset\", \"username\": \"$login\"}"
        INSERT_PLAYER_EVENT "$player_id" "admin_action" "" "" "" "$DetailsJson" ""
    fi

    if [[ -n "$PlayerExists" ]]; then
        local Content
        Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) resetou seu acesso no sistema de loadout"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    fi
}

