#!/bin/bash

# Carrega as variáveis

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")

COMMAND_FILE="$DayzServerFolder/$DayzActionsToExecuteFile"
DB_FILENAME="$DayzServerFolder/$DayzPlayerDbFile"
PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"

echo "Monitorando comandos do DayZ em $COMMAND_FILE..."
INSERT_CUSTOM_LOG "Monitorando arquivo: $COMMAND_FILE" "INFO" "$ScriptName"

echo > "$COMMAND_FILE"

format_bool_log() {
    local value="$1"
    if [[ "$value" == "1" ]]; then
        echo "Sim"
    elif [[ "$value" == "0" ]]; then
        echo "Não"
    else
        echo "Desconhecido"
    fi
}

format_coord() {
    local value="$1"
    if [[ -z "$value" ]]; then
        echo ""
        return
    fi

    awk -v val="$value" 'BEGIN { printf("%.3f", val + 0) }'
}

ACTIONS_DIR="$SCRIPT_DIR/actions"
if [[ -d "$ACTIONS_DIR" ]]; then
    for action_file in "$ACTIONS_DIR"/*.sh; do
        [[ -e "$action_file" ]] || continue
        source "$action_file"
    done
fi

tail -F "$COMMAND_FILE" | while read -r line; do
    # Valida se é um JSON válido
    if ! echo "$line" | jq empty 2>/dev/null; then
        echo ">> Linha inválida (não é JSON): $line"
        continue
    fi

    # Extrai o campo "action"
    action=$(echo "$line" | jq -r '.action')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S") 

    case "$action" in
        reset_password)
            handle_reset_password "$line"
            ;;
        active_loadout)
            handle_active_loadout "$line"
            ;;
        restart_server)
            handle_restart_server "$line"
            ;;
        update_player)
            handle_update_player "$line"
            ;;
        player_connected)
            handle_player_connected "$line"
            ;;
        player_disconnected)
            handle_player_disconnected "$line"
            ;;
        event_restarting)
            handle_event_restarting "$line"
            ;;
        event_start_finished)
            handle_event_start_finished "$line"
            ;;
        event_minutes_to_restart)
            handle_event_minutes_to_restart "$line"
            ;;
        send_log_discord)
            handle_send_log_discord "$line"
            ;;
        players_positions)
            handle_players_positions "$line"
            ;;
        vehicles_positions)
            handle_vehicles_positions "$line"
            ;;
        containers_positions)
            handle_containers_positions "$line"
            ;;
        fences_positions)
            handle_fences_positions "$line"
            ;;
        watchtowers_positions)
            handle_watchtowers_positions "$line"
            ;;
        flags_positions)
            handle_flags_positions "$line"
            ;;
        *)
            echo ">> Ação desconhecida: $action"
            ;;
    esac
done
