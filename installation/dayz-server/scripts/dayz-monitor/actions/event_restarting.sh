#!/bin/bash

handle_event_restarting() {
    local line="$1"
    local NextMap CurrentDate
    NextMap=$(echo "$line" | jq -r '.next_map')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo "Evento de servidor reiniciando!"
    INSERT_CUSTOM_LOG "Evento de restart do servidor!" "INFO" "$ScriptName"

    local Content
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        Content="Servidor reiniciando... todos os jogadores foram desconectados! (Próximo mapa: $NextMap)"
    else
        Content="Servidor reiniciando... todos os jogadores foram desconectados!"
    fi

    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "RESET"
}

