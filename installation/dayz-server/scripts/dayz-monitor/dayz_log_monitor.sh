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
    echo "$content" | awk -F'id=' '{print $2}' | awk -F')' '{print $1}'
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
        INSERT_CUSTOM_LOG "enqueue_chat_command: PlayerId ou comando vazio (player_id='$player_id', command='$command')" "DEBUG" "$ScriptName"
        return 1
    fi
    
    # Verificar se é admin ou se é deathmatch com comandos permitidos
    if grep -q "$player_id" "$DayzServerFolder/$DayzAdminIdsFile" 2>/dev/null; then
        echo "$player_id $command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        INSERT_CUSTOM_LOG "Comando de admin enfileirado: player_id='$player_id', command='$command'" "DEBUG" "$ScriptName"
        return 0
    fi
    
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        local command_name
        command_name=$(echo "$command" | awk '{print tolower($1)}')
        local allowed_commands="help kill votemap nextmap maps votekick players loadouts loadout"
        
        if echo "$allowed_commands" | grep -q "\b$command_name\b"; then
            echo "$player_id $command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
            INSERT_CUSTOM_LOG "Comando de deathmatch enfileirado: player_id='$player_id', command='$command'" "DEBUG" "$ScriptName"
            return 0
        fi
        
        INSERT_CUSTOM_LOG "Comando não permitido para jogador: player_id='$player_id', command='$command', command_name='$command_name'" "DEBUG" "$ScriptName"
    fi
    
    INSERT_CUSTOM_LOG "Comando não enfileirado: player_id='$player_id' não é admin e não está em modo deathmatch" "DEBUG" "$ScriptName"
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
          "$Line" != *"has been disconnected"* && \
          "$Line" != *"Chat("* ]]; then
        continue
    fi
    
    echo "$Line" | grep -q "\[HP: 0\]" && continue
    
    # Remove primeiros 12 caracteres que contém informações de data e hora
    Content=$(echo "$Line" | cut -c 12-)
    
    # Publicar linha bruta no RabbitMQ (todo processamento será feito no consumer)
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
        position=$(extract_position "$Content")
        enqueue_structure_command "registerfence" "$position"
    elif [[ "$Content" == *"Built level_1_base on Watchtower"* ]]; then
        position=$(extract_position "$Content")
        enqueue_structure_command "registerwatchtower" "$position"
    elif [[ "$Content" == *"Built base on Flag Pole"* ]]; then
        position=$(extract_position "$Content")
        enqueue_structure_command "registerflag" "$position"
    elif [[ "$Content" == *"built Shelter"* ]]; then
        position=$(extract_position "$Content")
        enqueue_structure_command "registercontainer" "$position"
    elif [[ "$Content" == *"has been disconnected"* && "$DayzDeathmatch" -eq 1 ]]; then
        player_id=$(extract_player_id "$Content")
        INSERT_CUSTOM_LOG "Evento de desconexão detectado para o player $player_id. Alterando Alive para 0..." "DEBUG" "$ScriptName"
        sleep 5
        sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players SET Alive = 0 WHERE UID = '$player_id';"
    elif [[ "$Content" == *"Chat("* ]]; then
        player_id=$(extract_player_id "$Content")
        
        # Validar PlayerId extraído
        if [[ -z "$player_id" ]]; then
            INSERT_CUSTOM_LOG "PlayerId vazio extraído do chat: Content='$Content'" "DEBUG" "$ScriptName"
        elif [[ ${#player_id} -ne 44 ]]; then
            INSERT_CUSTOM_LOG "PlayerId com tamanho inválido (esperado 44, obtido ${#player_id}): player_id='$player_id'" "DEBUG" "$ScriptName"
        else
            chat_message="${Content##*: }"
            command="$chat_message"
            if [[ "$command" == "!"* ]]; then
                command="${command:1}"
                INSERT_CUSTOM_LOG "Comando de chat detectado: player_id='$player_id', comando='$command'" "DEBUG" "$ScriptName"
                
                if enqueue_chat_command "$player_id" "$command"; then
                    INSERT_CUSTOM_LOG "Comando enfileirado com sucesso: player_id='$player_id', command='$command'" "INFO" "$ScriptName"
                else
                    INSERT_CUSTOM_LOG "Falha ao enfileirar comando: player_id='$player_id', command='$command'" "WARNING" "$ScriptName"
                fi
            fi
        fi
    fi

done
