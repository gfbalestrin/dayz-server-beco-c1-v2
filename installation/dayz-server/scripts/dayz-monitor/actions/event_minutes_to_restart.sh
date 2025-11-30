#!/bin/bash

handle_event_minutes_to_restart() {
    local line="$1"
    local CurrentMap NextMap CurrentTime Message CurrentDate Content
    CurrentMap=$(echo "$line" | jq -r '.current_map')
    NextMap=$(echo "$line" | jq -r '.next_map')
    CurrentTime=$(echo "$line" | jq -r '.current_time')
    Message=$(echo "$line" | jq -r '.message')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    INSERT_CUSTOM_LOG "Evento de aviso de tempo para reiniciar o servidor!" "INFO" "$ScriptName"
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        Content="Mapa atual: $CurrentMap, Próximo mapa: $NextMap, Horário: $CurrentTime"
    else
        Content="Horário: $CurrentTime"
    fi

    SEND_DISCORD_WEBHOOK "⏱️ $Message $Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

    #if [[ "$Message" == *"O servidor vai ser reiniciado em 1 minuto"* ]]; then
    #    SEND_DISCORD_WEBHOOK "⏱️ $Message $Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    #else
    #    SEND_DISCORD_WEBHOOK "⏱️ $Message" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
    #fi    
}