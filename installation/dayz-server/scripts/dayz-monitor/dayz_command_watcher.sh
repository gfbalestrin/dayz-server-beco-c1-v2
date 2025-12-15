#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")

COMMAND_FILE="$DayzServerFolder/$DayzActionsToExecuteFile"

echo "Monitorando comandos do DayZ em $COMMAND_FILE..."
INSERT_CUSTOM_LOG "Monitorando arquivo: $COMMAND_FILE" "INFO" "$ScriptName"

echo > "$COMMAND_FILE"

# Mapeamento de action -> queue RabbitMQ
# Todas as ações são publicadas diretamente no RabbitMQ sem processamento local
get_rabbitmq_queue() {
    local action="$1"
    case "$action" in
        players_positions)
            echo "data.players.positions"
            ;;
        vehicles_positions)
            echo "data.vehicles.positions"
            ;;
        containers_positions)
            echo "data.containers.positions"
            ;;
        fences_positions|watchtowers_positions|flags_positions)
            echo "data.structures.positions"
            ;;
        reset_password)
            echo "users.management"
            ;;
        player_connected|player_disconnected|player_respawned)
            echo "events.players"
            ;;
        active_loadout|update_player|restart_server|event_restarting|event_start_finished|event_minutes_to_restart|send_log_discord)
            echo "events.server"
            ;;
        *)
            echo "events.unknown"
            ;;
    esac
}

tail -F "$COMMAND_FILE" 2>/dev/null | while IFS= read -r line || [[ -n "$line" ]]; do
    # Ignorar linhas vazias ou apenas espaços
    line_trimmed=$(echo "$line" | xargs)
    if [[ -z "$line_trimmed" ]]; then
        continue
    fi
    
    # Valida se é um JSON válido
    if ! echo "$line" | jq empty 2>/dev/null; then
        echo ">> Linha inválida (não é JSON válido): ${line:0:100}..."
        INSERT_CUSTOM_LOG "Linha inválida (não é JSON): ${line:0:200}" "ERROR" "$ScriptName"
        continue
    fi

    # Extrai o campo "action"
    action=$(echo "$line" | jq -r '.action // empty' 2>/dev/null)
    
    if [[ -z "$action" || "$action" == "null" || "$action" == "empty" ]]; then
        # Tentar extrair todos os campos para debug
        all_keys=$(echo "$line" | jq -r 'keys[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        echo ">> Ação não encontrada no JSON. Campos disponíveis: [$all_keys]. Linha completa: ${line:0:200}..."
        INSERT_CUSTOM_LOG "Ação não encontrada no JSON. Campos: [$all_keys]. Linha: ${line:0:200}" "WARNING" "$ScriptName"
        continue
    fi

    # Obter queue RabbitMQ para esta ação
    queue=$(get_rabbitmq_queue "$action")
    
    # Adicionar timestamp ao JSON se não existir
    payload=$(echo "$line" | jq --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" '. + {captured_timestamp: $timestamp}' 2>/dev/null)
    
    if [[ -z "$payload" ]]; then
        payload="$line"
    fi
    
    # Publicar diretamente no RabbitMQ (não bloqueia, executa em background)
    if PUBLISH_TO_RABBITMQ "$queue" "$payload"; then
        INSERT_CUSTOM_LOG "Ação [$action] publicada na fila [$queue]" "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Falha ao publicar ação [$action] na fila [$queue]" "ERROR" "$ScriptName"
    fi
done
