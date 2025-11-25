#!/bin/bash

handle_update_player() {
    local line="$1"

    sanitize_name() {
        LC_ALL=C tr -d '\r' \
        | iconv -c -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null \
        | tr '\n' ' ' \
        | LC_ALL=C sed 's/[^[:alnum:] ._\-\[\]()@#+]/ /g' \
        | sed 's/[[:space:]]\+/ /g' \
        | sed 's/^[[:space:]]\+//; s/[[:space:]]\+$//'
    }

    local PlayerId PlayerName PlayerSteamId PlayerRconGuid
    PlayerId=$(echo "$line" | jq -r '.player_id')
    PlayerName=$(echo "$line" | jq -r '.player_name' | sanitize_name)
    if [[ -z "$PlayerName" ]]; then
        PlayerName="Unknown"
    fi
    PlayerSteamId=$(echo "$line" | jq -r '.steam_id')
    PlayerRconGuid=$(GENERATE_RCON_GUID "$PlayerSteamId")

    echo ">> Atualizando jogador na player_database: $PlayerId"

    local PlayerSteamName
    PlayerSteamName=$(
        curl -L -s -A "Mozilla/5.0" "https://steamcommunity.com/profiles/$PlayerSteamId" \
        | grep -oP '(?<=actual_persona_name">).*(?=</span>)' \
        | sed 's/<[^>]*>//g' \
        | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&#39;/'"'"'/g' \
        | sanitize_name
    )
    if [[ -z "$PlayerSteamName" ]]; then
        PlayerSteamName="Unknown"
    fi

    local PlayerExists
    PlayerExists=$(sqlite3 -separator $'\x1F' "$AppFolder/$AppPlayerBecoC1DbFile" \
    "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")

    if [[ -z "$PlayerExists" ]]; then
        INSERT_CUSTOM_LOG "Player $PlayerId ($PlayerName) ($PlayerSteamId) ($PlayerSteamName) não consta no banco. O player será inserido no banco de dados." "INFO" "$ScriptName"
        INSERT_PLAYER_DATABASE "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName" "$PlayerRconGuid"
        sleep 2
        "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
        return
    fi

    local PlayerNameCurrent PlayerSteamIdCurrent PlayerSteamNameCurrent
    PlayerNameCurrent=$(echo "$PlayerExists" | cut -d$'\x1F' -f1)
    PlayerSteamIdCurrent=$(echo "$PlayerExists" | cut -d$'\x1F' -f2)
    PlayerSteamNameCurrent=$(echo "$PlayerExists" | cut -d$'\x1F' -f3)

    INSERT_CUSTOM_LOG "Player $PlayerId ($PlayerName) ($PlayerSteamId) ($PlayerSteamName) já consta no banco. O player será atualizado no banco de dados." "INFO" "$ScriptName"
    UPDATE_PLAYER_DATABASE "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName" "$PlayerRconGuid"

    if [[ "$PlayerNameCurrent" != "$PlayerName" ]] \
    || [[ "$PlayerSteamIdCurrent" != "$PlayerSteamId" ]] \
    || [[ "$PlayerSteamNameCurrent" != "$PlayerSteamName" ]]; then
        INSERT_CUSTOM_LOG "Player alterou seus dados desde a última conexão." "INFO" "$ScriptName"
        INSERT_PLAYER_NAME_HISTORY "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName"
    fi

    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
}

