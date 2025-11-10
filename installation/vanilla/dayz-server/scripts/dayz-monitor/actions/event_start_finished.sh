#!/bin/bash

handle_event_start_finished() {
    local line="$1"
    local CurrentMap CurrentTime CurrentDate Content
    CurrentMap=$(echo "$line" | jq -r '.current_map')
    CurrentTime=$(echo "$line" | jq -r '.current_time')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo "Evento de servidor reiniciado!"
    INSERT_CUSTOM_LOG "Evento de início do servidor!" "INFO" "$ScriptName"

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        Content="✅ Servidor iniciado e liberado para jogadores!"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    else
        Content="✅ Servidor iniciado e liberado para jogadores! Horário: $CurrentTime"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    fi

    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "RESET"
}

