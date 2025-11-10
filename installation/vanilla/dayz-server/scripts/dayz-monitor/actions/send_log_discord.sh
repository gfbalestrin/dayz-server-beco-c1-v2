#!/bin/bash

handle_send_log_discord() {
    local line="$1"
    local Message CurrentDate
    Message=$(echo "$line" | jq -r '.message')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo "Evento de envio de mensagem ao discord!"
    INSERT_CUSTOM_LOG "Evento de envio de mensagem!" "INFO" "$ScriptName"
    SEND_DISCORD_WEBHOOK "$Message" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
}

