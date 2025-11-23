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

# Diretório para locks de ações
LOCK_DIR="/tmp/dayz_action_locks"
mkdir -p "$LOCK_DIR"

# Função para adquirir lock por tipo de ação
acquire_lock() {
    local action_type="$1"
    local lock_file="$LOCK_DIR/${action_type}.lock"
    local timeout=300  # 5 minutos de timeout (em segundos)
    local check_interval=0.1
    local max_iterations
    max_iterations=$((timeout * 10))  # timeout / check_interval
    local iteration=0
    
    while [[ -f "$lock_file" ]]; do
        # Verificar se o lock está travado (processo não existe mais)
        local lock_pid
        lock_pid=$(cat "$lock_file" 2>/dev/null)
        if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
            # Processo não existe mais, remover lock órfão
            rm -f "$lock_file"
            break
        fi
        
        # Verificar timeout
        if [[ $iteration -ge $max_iterations ]]; then
            echo ">> Aviso: Timeout ao aguardar lock para $action_type (removendo lock travado)" >&2
            rm -f "$lock_file"
            break
        fi
        
        sleep "$check_interval"
        iteration=$((iteration + 1))
    done
    
    # Criar lock com PID do processo atual
    echo $$ > "$lock_file"
}

# Função para liberar lock
release_lock() {
    local action_type="$1"
    local lock_file="$LOCK_DIR/${action_type}.lock"
    rm -f "$lock_file"
}

# Função para processar ação em background com lock
process_action_async() {
    local action_type="$1"
    local line="$2"
    local timestamp="$3"
    
    # Executar em subshell para não bloquear o loop principal
    (
        # Adquirir lock para este tipo de ação
        acquire_lock "$action_type"
        
        # Processar ação baseado no tipo
        case "$action_type" in
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
                handle_players_positions "$line" "$timestamp"
                ;;
            vehicles_positions)
                handle_vehicles_positions "$line" "$timestamp"
                ;;
            containers_positions)
                handle_containers_positions "$line" "$timestamp"
                ;;
            fences_positions)
                handle_fences_positions "$line" "$timestamp"
                ;;
            watchtowers_positions)
                handle_watchtowers_positions "$line" "$timestamp"
                ;;
            flags_positions)
                handle_flags_positions "$line" "$timestamp"
                ;;
            *)
                echo ">> Ação desconhecida: $action_type"
                ;;
        esac
        
        # Liberar lock após processamento
        release_lock "$action_type"
    ) &
}

tail -F "$COMMAND_FILE" | while read -r line; do
    # Valida se é um JSON válido
    if ! echo "$line" | jq empty 2>/dev/null; then
        echo ">> Linha inválida (não é JSON): $line"
        continue
    fi

    # Capturar timestamp no momento da leitura (antes do processamento)
    captured_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    # Extrai o campo "action"
    action=$(echo "$line" | jq -r '.action')
    
    if [[ -z "$action" || "$action" == "null" ]]; then
        echo ">> Ação não encontrada no JSON: $line"
        continue
    fi

    # Processar ação em background com lock
    process_action_async "$action" "$line" "$captured_timestamp"
done
