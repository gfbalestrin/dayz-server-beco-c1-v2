#!/bin/bash

handle_killed_by_player() {
    local line="$1"
    local content="$2"

    local PlayerIdKilled PlayerIdKiller
    PlayerIdKilled=$(echo "$content" | grep -oP 'id=\K[^ ]+' | sed -n '1p')
    PlayerIdKiller=$(echo "$content" | grep -oP 'id=\K[^ ]+' | sed -n '2p')

    if [[ "$PlayerIdKilled" != "$PlayerIdKiller" ]]; then
        INSERT_CUSTOM_LOG "Evento de PVP detectado!" "INFO" "$ScriptName"
    fi
    INSERT_CUSTOM_LOG "PlayerIdKiller: '$PlayerIdKiller', PlayerIdKilled: '$PlayerIdKilled'" "DEBUG" "$ScriptName"

    local Weapon Distance metros PosKilled PosKiller Data
    Weapon=$(echo "$content" | grep -oP 'with \K\w+')
    Distance=$(echo "$content" | grep -oP 'from \K\d+\.\d+')
    metros=$(echo "$Distance" | cut -d '.' -f 1)

    PosKilled=$(echo "$content" | sed -n 's/.*pos=<\([^>]*\)>.*pos=<[^>]*>.*/\1/p' | sed 's/, */,/g')
    PosKiller=$(echo "$content" | sed -n 's/.*pos=<[^>]*>.*pos=<\([^>]*\)>.*/\1/p' | sed 's/, */,/g')
    Data=$(date "+%Y-%m-%d %H:%M:%S")

    if [[ "$PlayerIdKilled" != "$PlayerIdKiller" ]]; then
        INSERT_KILLFEED "$PlayerIdKiller" "$PlayerIdKilled" "$Weapon" "$metros" "$Data" "$PosKiller" "$PosKilled"
    fi

    local PlayerKiller PlayerVictim
    PlayerKiller=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdKiller';")
    PlayerVictim=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdKilled';")

    if [[ -z "$PlayerKiller" || -z "$PlayerVictim" ]]; then
        INSERT_CUSTOM_LOG "PlayerIdKiller ou PlayerIdVictim não encontrado no banco de dados. Ignorando mensagem para Discord." "ERROR" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    local PlayerKillerName KillerSteamID KillerSteamName PlayerVictimName VictimSteamID VictimSteamName
    PlayerKillerName=$(echo "$PlayerKiller" | cut -d"|" -f1)
    KillerSteamID=$(echo "$PlayerKiller" | cut -d"|" -f2)
    KillerSteamName=$(echo "$PlayerKiller" | cut -d"|" -f3)

    PlayerVictimName=$(echo "$PlayerVictim" | cut -d"|" -f1)
    VictimSteamID=$(echo "$PlayerVictim" | cut -d"|" -f2)
    VictimSteamName=$(echo "$PlayerVictim" | cut -d"|" -f3)

    local PlayerKillerInfo PlayerVictimInfo message
    PlayerKillerInfo="**$(sanitize_discord_markdown "$PlayerKillerName")** ([$(sanitize_discord_markdown "$KillerSteamName")](<https://steamcommunity.com/profiles/$KillerSteamID>))"
    PlayerVictimInfo="**$(sanitize_discord_markdown "$PlayerVictimName")** ([$(sanitize_discord_markdown "$VictimSteamName")](<https://steamcommunity.com/profiles/$VictimSteamID>))"

    if [[ "$PlayerIdKilled" != "$PlayerIdKiller" ]]; then
        message="💀 Jogador ${PlayerVictimInfo} foi executado por ${PlayerKillerInfo}. Arma: ${Weapon}, distância: ${metros} metros"
        echo "Jogador $PlayerKillerName eliminou $PlayerVictimName" >> "$DayzServerFolder/$DayzMessagesToSendoFile"
    else
        message="💀 Jogador ${PlayerVictimInfo} cometeu suicídio"
    fi

    HANDLER_CONTENT="$message"
}

