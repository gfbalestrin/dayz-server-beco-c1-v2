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
    # Remove espaços em branco do início e fim usando substituição de padrão do bash
    line_trimmed="${line#"${line%%[![:space:]]*}"}"
    line_trimmed="${line_trimmed%"${line_trimmed##*[![:space:]]}"}"
    if [[ -z "$line_trimmed" ]]; then
        continue
    fi
    
    # Extrai o campo "action"
    action=$(echo "$line" | jq -r '.action // empty' 2>/dev/null)
    
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