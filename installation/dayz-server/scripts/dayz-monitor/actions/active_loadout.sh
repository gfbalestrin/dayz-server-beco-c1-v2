#!/bin/bash

handle_active_loadout() {
    local line="$1"
    local player_id loadout_name CurrentDate
    player_id=$(echo "$line" | jq -r '.player_id')
    loadout_name=$(echo "$line" | jq -r '.loadout_name')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo ">> Ativando loadout de $player_id para $loadout_name"
    INSERT_CUSTOM_LOG "Ativando loadout de $player_id para $loadout_name" "INFO" "$ScriptName"

    local result_json
    result_json=$("$AppFolder/$AppScriptPlayerLoadoutManagerFile" --player-id "$player_id" --loadout-name "$loadout_name" --active)

    if echo "$result_json" | jq -e 'has("error")' >/dev/null; then
        local erro
        erro=$(echo "$result_json" | jq -r '.error')
        echo "Erro ao ativar loadout: $erro"
        echo "$player_id;[ERROR] Erro ao ativar o loadout '$loadout_name': $erro" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
        return
    fi

    local msg
    msg=$(echo "$result_json" | jq -r '.message')
    echo ">> Loadout ativado com sucesso: $msg"
    echo "$player_id;$msg" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"

    # Registrar evento de mudança de loadout
    if [[ -n "$player_id" ]] && [[ ${#player_id} -eq 44 ]] && [[ -n "$loadout_name" ]]; then
        local DetailsJson
        DetailsJson="{\"loadout_name\": \"$loadout_name\"}"
        INSERT_PLAYER_EVENT "$player_id" "loadout_changed" "" "" "" "$DetailsJson" ""
    fi

    local PlayerExists
    PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$player_id';")
    if [[ -n "$PlayerExists" ]]; then
        local PlayerName SteamID SteamName Content
        PlayerName=$(echo "$PlayerExists" | cut -d'|' -f1 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
        SteamID=$(echo "$PlayerExists" | cut -d'|' -f2)
        SteamName=$(echo "$PlayerExists" | cut -d'|' -f3 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
        Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) ativou um loadout pelo jogo"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    fi
}

