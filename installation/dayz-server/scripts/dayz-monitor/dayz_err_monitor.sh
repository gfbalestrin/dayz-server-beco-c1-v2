#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")
LogFileName="$DayzServerFolder/profiles/dayz-server.err"

INSERT_CUSTOM_LOG "Monitorando arquivo: $LogFileName" "INFO" "$ScriptName"

stdbuf -oL tail -n 0 -F "$LogFileName" | while IFS= read -r Line; do
    # Ignora linhas que não contêm os erros críticos monitorados
    if [[ "$Line" != *"Can't compile mission init script'!"* && \
          "$Line" != *"Invalid number -nan"* && \
          "$Line" != *"Admin Kick"* ]]; then
        continue
    fi

    INSERT_CUSTOM_LOG "Erro crítico detectado: $Line" "ERROR" "$ScriptName"
    
    # Publicar linha bruta no RabbitMQ (todo processamento será feito no consumer)
    local payload
    payload=$(jq -n \
        --arg log_type "err" \
        --arg log_file "$(basename "$LogFileName")" \
        --arg line "$Line" \
        --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" \
        '{log_type: $log_type, log_file: $log_file, line: $line, timestamp: $timestamp}' 2>/dev/null)
    
    if [[ -n "$payload" ]]; then
        PUBLISH_TO_RABBITMQ "logs.err" "$payload" >/dev/null 2>&1 &
    fi

done

