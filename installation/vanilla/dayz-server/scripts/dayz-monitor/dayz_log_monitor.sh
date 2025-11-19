#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

sanitize_discord_markdown() {
    local input="$1"
    echo "$input" | tr -d '\n\r' | sed -e 's/[*_~`|]/\\&/g' -e 's/[][\()<>]/\\&/g' -e 's/["\\]/\\&/g'
}

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
LogFileName="$DayzServerFolder/$DayzLogAdmFile"

INSERT_CUSTOM_LOG "Monitorando arquivo: $LogFileName" "INFO" "$ScriptName"

stdbuf -oL tail -n 0 -F "$LogFileName" | while IFS= read -r Line; do
    # Ignora linhas que não contêm os eventos desejados
    if [[ "$Line" != *"killed by"* && \
          "$Line" != *"is unconscious"* && \
          "$Line" != *"bled out"* && \
          "$Line" != *"died. Stats"* && \
          "$Line" != *"hit by Player"* && \
          "$Line" != *"Built base on Fence"* && \
          "$Line" != *"Built level_1_base on Watchtower"* && \
          "$Line" != *"Dismantled Base from Fence"* && \
          "$Line" != *"built Shelter"* && \
          "$Line" != *"Chat("* ]]; then
        continue
    fi
    
    echo "$Line" | grep -q "\[HP: 0\]" && continue

    INSERT_ADM_LOG "$Line" "INFO"
    # Remove primeiros 12 caracteres que contém informações de data e hora
    Content=$(echo "$Line" | cut -c 12-)
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    INSERT_CUSTOM_LOG "Evento capturado: $Content" "INFO" "$ScriptName"

    HANDLER_CONTENT="$Content"
    HANDLER_SHOULD_CONTINUE=0

    if [[ "$Content" == *"hit by Player"* ]]; then
        handle_hit_player "$Line" "$Content"
    elif [[ "$Content" == *"Chat("* ]]; then
        handle_chat_command "$Line" "$Content"
    elif [[ "$Content" == *"killed by Player"* ]]; then
        handle_killed_by_player "$Line" "$Content"
    elif [[ "$Content" == *"Built base on Fence"* ]]; then
        handle_built_fence "$Line" "$Content"
    elif [[ "$Content" == *"Built level_1_base on Watchtower"* ]]; then
        handle_built_watchtower "$Line" "$Content"
    elif [[ "$Content" == *"Dismantled Base from Fence"* ]]; then
        handle_dismantled_fence "$Line" "$Content"
    elif [[ "$Content" == *"built Shelter"* ]]; then
        handle_built_shelter "$Line" "$Content"
    else
        handle_death_event "$Line" "$Content"
    fi

    if [[ "$HANDLER_SHOULD_CONTINUE" -eq 1 ]]; then
        continue
    fi

    if [[ -z "$HANDLER_CONTENT" ]]; then
        HANDLER_CONTENT="$Content"
    fi

    Content="$HANDLER_CONTENT"
    Content=$(echo "$Content" | tr -d '\r\n' | sed "s/[[:space:]]\+/ /g" | sed "s/^ //; s/ $//")

    # Envia $Content para discord
    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

done
