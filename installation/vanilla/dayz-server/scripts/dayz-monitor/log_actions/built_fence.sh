#!/bin/bash

handle_built_fence() {
    local line="$1"
    local content="$2"

    local PlayerName PlayerId Position
    PlayerName=$(echo "$content" | sed -n 's/.*Player "\([^"]\+\)".*/\1/p')
    PlayerId=$(echo "$content" | grep -oP 'id=\K[^ ]+')
    Position=$(echo "$content" | sed -n 's/.*pos=<\([^>]*\)>.*/\1/p' | sed 's/, */,/g')

    local PlayerRecord PlayerDbName PlayerSteamID PlayerSteamName SafePlayerInfo
    PlayerRecord=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")
    if [[ -n "$PlayerRecord" ]]; then
        PlayerDbName=$(echo "$PlayerRecord" | cut -d"|" -f1)
        PlayerSteamID=$(echo "$PlayerRecord" | cut -d"|" -f2)
        PlayerSteamName=$(echo "$PlayerRecord" | cut -d"|" -f3)

        SafePlayerInfo="**$(sanitize_discord_markdown "$PlayerDbName")** ([$(sanitize_discord_markdown "$PlayerSteamName")](<https://steamcommunity.com/profiles/$PlayerSteamID>))"
    else
        INSERT_CUSTOM_LOG "PlayerId '$PlayerId' não encontrado no banco. Usando nome do log apenas." "WARNING" "$ScriptName"
        SafePlayerInfo="Jogador \"$(sanitize_discord_markdown "$PlayerName")\" (id=$PlayerId)"
    fi

    local Message PosCommand
    Message="Construção detectada: $SafePlayerInfo construiu uma fence em $Position"

    INSERT_CUSTOM_LOG "$Message" "INFO" "$ScriptName"
    HANDLER_CONTENT="$Message"

    PosCommand=$(echo "$Position" | tr ',' ' ')
    if [[ -n "$PosCommand" ]]; then
        local CommandLine
        CommandLine="SYSTEM registerfence $PosCommand"
        echo "$CommandLine" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        INSERT_CUSTOM_LOG "Comando enfileirado: $CommandLine" "DEBUG" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Falha ao montar coordenadas para comando registerfence" "ERROR" "$ScriptName"
    fi
}

