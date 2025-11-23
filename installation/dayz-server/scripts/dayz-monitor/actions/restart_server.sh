#!/bin/bash

handle_restart_server() {
    local line="$1"
    local minutes message CurrentDate
    minutes=$(echo "$line" | jq -r '.minutes')
    message=$(echo "$line" | jq -r '.message')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    echo ">> Reinício do servidor em $minutes minuto(s): $message"
    INSERT_CUSTOM_LOG "Servidor será reiniciado antes do previsto devido a votação" "INFO" "$ScriptName"
    SEND_DISCORD_WEBHOOK "Servidor será reiniciado antes do previsto devido a votação" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

    if ! [[ "$minutes" =~ ^[0-9]+$ ]] || [[ "$minutes" -le 0 ]]; then
        echo ">> Valor inválido para minutos: $minutes"
        return
    fi

    echo "Atenção: o servidor será reiniciado em $minutes minuto(s)!" >> "$DayzServerFolder/$DayzMessagesToSendoFile"
    sleep 60
    sudo systemctl restart dayz-server
}

