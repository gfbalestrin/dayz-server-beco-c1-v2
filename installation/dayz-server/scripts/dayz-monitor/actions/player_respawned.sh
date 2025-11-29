#!/bin/bash

handle_player_respawned() {
    local line="$1"
    local PlayerId Position
    PlayerId=$(echo "$line" | jq -r '.player_id')
    Position=$(echo "$line" | jq -r '.position')

    echo "Evento de player respawnado detectado!"
    INSERT_CUSTOM_LOG "Evento de player respawnado detectado! PlayerID: $PlayerId | Posição: $Position" "INFO" "$ScriptName"
    
    # Buscar registro do jogador no banco de dados para formatação Discord
    local PlayerRecord PlayerDbName PlayerSteamID PlayerSteamName SafePlayerInfo
    PlayerRecord=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")
    if [[ -n "$PlayerRecord" ]]; then
        PlayerDbName=$(echo "$PlayerRecord" | cut -d"|" -f1)
        PlayerSteamID=$(echo "$PlayerRecord" | cut -d"|" -f2)
        PlayerSteamName=$(echo "$PlayerRecord" | cut -d"|" -f3)
        SafePlayerInfo="**$(sanitize_discord_markdown "$PlayerDbName")** ([$(sanitize_discord_markdown "$PlayerSteamName")](<https://steamcommunity.com/profiles/$PlayerSteamID>))"
    else
        INSERT_CUSTOM_LOG "PlayerId '$PlayerId' não encontrado no banco. Usando apenas PlayerID." "WARNING" "$ScriptName"
        SafePlayerInfo="Jogador (id=$PlayerId)"
    fi
    
    # Registrar evento de respawn com posição
    if [[ -n "$PlayerId" ]] && [[ ${#PlayerId} -eq 44 ]] && [[ -n "$Position" ]]; then
        local CoordX CoordY CoordZ DetailsJson CurrentDate
        CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
        
        # Extrai coordenadas da posição (formato "x,y,z")
        CoordX=$(echo "$Position" | cut -d',' -f1 | xargs)
        CoordY=$(echo "$Position" | cut -d',' -f2 | xargs)
        CoordZ=$(echo "$Position" | cut -d',' -f3 | xargs)
        
        # Valida se as coordenadas são números válidos
        if [[ -n "$CoordX" ]] && [[ -n "$CoordY" ]] && [[ -n "$CoordZ" ]]; then
            DetailsJson="{\"timestamp\": \"$CurrentDate\", \"position\": \"$Position\"}"
            INSERT_PLAYER_EVENT "$PlayerId" "player_respawned" "$CoordX" "$CoordY" "$CoordZ" "$DetailsJson" ""
            
            
            # Enviar mensagem para Discord
            local Message
            Message="$SafePlayerInfo respawnou"
            INSERT_CUSTOM_LOG "Evento player_respawned registrado para $SafePlayerInfo na posição ($CoordX, $CoordY, $CoordZ)" "INFO" "$ScriptName"
            #SEND_DISCORD_WEBHOOK "$Message" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        else
            INSERT_CUSTOM_LOG "Falha ao extrair coordenadas da posição: $Position" "ERROR" "$ScriptName"
        fi
    else
        if [[ -z "$PlayerId" ]] || [[ ${#PlayerId} -ne 44 ]]; then
            INSERT_CUSTOM_LOG "PlayerID inválido ou ausente: '$PlayerId'" "ERROR" "$ScriptName"
        fi
        if [[ -z "$Position" ]]; then
            INSERT_CUSTOM_LOG "Posição ausente no evento player_respawned" "ERROR" "$ScriptName"
        fi
    fi
}

