#!/bin/bash

handle_event_start_finished() {
    local line="$1"
    local CurrentMap NextMap CurrentTime CurrentDate Content
    CurrentMap=$(echo "$line" | jq -r '.current_map')
    NextMap=$(echo "$line" | jq -r '.next_map')
    CurrentTime=$(echo "$line" | jq -r '.current_time')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    INSERT_CUSTOM_LOG "Evento de início do servidor!" "INFO" "$ScriptName"

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        Content="✅ Servidor iniciado e liberado para jogadores! Mapa atual: $CurrentMap, Próximo mapa: $NextMap, Horário: $CurrentTime"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    else
        Content="✅ Servidor iniciado e liberado para jogadores! Horário: $CurrentTime"
        SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    fi

    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "RESET"
}

