#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")
LogFileName="$DayzServerFolder/$DayzLogAdmFile"

INSERT_CUSTOM_LOG "Monitorando arquivo: $LogFileName" "INFO" "$ScriptName"

# Função auxiliar para extrair posição de uma linha de log
extract_position() {
    local content="$1"
    echo "$content" | sed -n 's/.*pos=<\([^>]*\)>.*/\1/p' | sed 's/, */,/g'
}

# Função auxiliar para extrair PlayerId de uma linha de log
extract_player_id() {
    local content="$1"
    echo "$content" | grep -oP 'id=\K[^ ]+' | head -1
}

# Função auxiliar para enfileirar comando de registro de estrutura
enqueue_structure_command() {
    local command_type="$1"  # registerfence, registerwatchtower, registerflag, registercontainer
    local position="$2"
    
    if [[ -z "$position" ]]; then
        return 1
    fi
    
    local pos_command
    pos_command=$(echo "$position" | tr ',' ' ')
    
    if [[ -n "$pos_command" ]]; then
        local command_line
        command_line="SYSTEM $command_type $pos_command"
        echo "$command_line" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        return 0
    fi
    
    return 1
}

# Função auxiliar para enfileirar comando de chat
enqueue_chat_command() {
    local player_id="$1"
    local command="$2"
    
    if [[ -z "$player_id" || -z "$command" ]]; then
        return 1
    fi
    
    # Verificar se é admin ou se é deathmatch com comandos permitidos
    if grep -q "$player_id" "$DayzServerFolder/$DayzAdminIdsFile" 2>/dev/null; then
        echo "$player_id $command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        return 0
    fi
    
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        local command_name
        command_name=$(echo "$command" | awk '{print tolower($1)}')
        local allowed_commands="help kill votemap nextmap maps votekick players loadouts loadout"
        
        if echo "$allowed_commands" | grep -q "\b$command_name\b"; then
            echo "$player_id $command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
            return 0
        fi
    fi
    
    return 1
}

stdbuf -oL tail -n 0 -F "$LogFileName" | while IFS= read -r Line; do
    # Ignora linhas que não contêm os eventos desejados
    if [[ "$Line" != *"killed by"* && \
          "$Line" != *"is unconscious"* && \
          "$Line" != *"bled out"* && \
          "$Line" != *"died. Stats"* && \
          "$Line" != *"hit by Player"* && \
          "$Line" != *"Built base on Fence"* && \
          "$Line" != *"Built level_1_base on Watchtower"* && \
          "$Line" != *"Built base on Flag Pole"* && \
          "$Line" != *"Dismantled Base from Fence"* && \
          "$Line" != *"Dismantled Upper Wooden Wall from Fence"* && \
          "$Line" != *"Dismantled Upper Frame from Fence"* && \
          "$Line" != *"built Shelter"* && \
          "$Line" != *"Chat("* ]]; then
        continue
    fi
    
    echo "$Line" | grep -q "\[HP: 0\]" && continue

    INSERT_ADM_LOG "$Line" "INFO"
    
    # Remove primeiros 12 caracteres que contém informações de data e hora
    Content=$(echo "$Line" | cut -c 12-)
    
    # Publicar linha bruta no RabbitMQ (todo processamento será feito no consumer)
    local payload
    payload=$(jq -n \
        --arg log_type "adm" \
        --arg log_file "$(basename "$LogFileName")" \
        --arg line "$Line" \
        --arg content "$Content" \
        --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" \
        '{log_type: $log_type, log_file: $log_file, line: $line, content: $content, timestamp: $timestamp}' 2>/dev/null)
    
    if [[ -n "$payload" ]]; then
        PUBLISH_TO_RABBITMQ "logs.adm" "$payload" >/dev/null 2>&1 &
    fi
    
    # Lógica mínima para enfileirar comandos (apenas extração de dados básicos)
    if [[ "$Content" == *"Built base on Fence"* ]]; then
        local position
        position=$(extract_position "$Content")
        enqueue_structure_command "registerfence" "$position"
    elif [[ "$Content" == *"Built level_1_base on Watchtower"* ]]; then
        local position
        position=$(extract_position "$Content")
        enqueue_structure_command "registerwatchtower" "$position"
    elif [[ "$Content" == *"Built base on Flag Pole"* ]]; then
        local position
        position=$(extract_position "$Content")
        enqueue_structure_command "registerflag" "$position"
    elif [[ "$Content" == *"built Shelter"* ]]; then
        local position
        position=$(extract_position "$Content")
        enqueue_structure_command "registercontainer" "$position"
    elif [[ "$Content" == *"Chat("* ]]; then
        local player_id chat_message command
        player_id=$(extract_player_id "$Content")
        chat_message="${Content##*: }"
        command="$chat_message"
        if [[ "$command" == "!"* ]]; then
            command="${command:1}"
        fi
        enqueue_chat_command "$player_id" "$command"
    fi

done
