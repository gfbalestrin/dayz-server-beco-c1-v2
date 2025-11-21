#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

LOG_ACTIONS_DIR="$SCRIPT_DIR/log_actions"
if [[ -d "$LOG_ACTIONS_DIR" ]]; then
    for action_file in "$LOG_ACTIONS_DIR"/*.sh; do
        [[ -e "$action_file" ]] || continue
        source "$action_file"
    done
fi

HANDLER_CONTENT=""
HANDLER_SHOULD_CONTINUE=0

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
    # Usa a linha completa como conteúdo
    Content="$Line"
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    INSERT_CUSTOM_LOG "Evento capturado: $Content" "INFO" "$ScriptName"

    HANDLER_CONTENT="$Content"
    HANDLER_SHOULD_CONTINUE=0

    if [[ "$Content" == *"Can't compile mission init script'!"* ]]; then
        handle_compile_error "$Line" "$Content"
    elif [[ "$Content" == *"Invalid number -nan"* ]]; then
        handle_invalid_number_nan "$Line" "$Content"
    elif [[ "$Content" == *"Admin Kick"* ]]; then
        handle_admin_kick "$Line" "$Content"
    fi

    if [[ "$HANDLER_SHOULD_CONTINUE" -eq 1 ]]; then
        continue
    fi

    Content="$HANDLER_CONTENT"
    Content=$(echo "$Content" | tr -d '\r\n' | sed "s/   */ /g")

    # Envia $Content para discord
    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

done

