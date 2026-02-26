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

# Função para processar backup de players em batch
process_players_backup_batch() {
    local player_ids_json="$1"
    
    INSERT_CUSTOM_LOG "process_players_backup_batch(): Iniciando processamento" "INFO" "$ScriptName"
    
    # Extrair array de player_ids do JSON
    local player_ids=$(echo "$player_ids_json" | jq -r '.player_ids[]?' 2>/dev/null)
    
    if [[ -z "$player_ids" ]]; then
        INSERT_CUSTOM_LOG "process_players_backup_batch(): Nenhum player_id encontrado no JSON" "WARNING" "$ScriptName"
        INSERT_CUSTOM_LOG "process_players_backup_batch(): JSON recebido: ${player_ids_json:0:200}" "DEBUG" "$ScriptName"
        return 1
    fi
    
    # Construir lista de placeholders para SQL IN clause
    local player_ids_array=()
    while IFS= read -r player_id; do
        if [[ -n "$player_id" && ${#player_id} -eq 44 ]]; then
            player_ids_array+=("'$player_id'")
        fi
    done <<< "$player_ids"
    
    if [[ ${#player_ids_array[@]} -eq 0 ]]; then
        INSERT_CUSTOM_LOG "process_players_backup_batch(): Nenhum player_id válido encontrado" "WARNING" "$ScriptName"
        return 1
    fi
    
    local ids_list=$(IFS=','; echo "${player_ids_array[*]}")
    
    # Fazer SELECT em batch do players.db
    local backup_results=$(sqlite3 -separator '|' "$DayzServerFolder/$DayzPlayerDbFile" "SELECT UID, hex(Data) FROM Players WHERE UID IN ($ids_list);" 2>/dev/null)
    
    if [[ -z "$backup_results" ]]; then
        INSERT_CUSTOM_LOG "process_players_backup_batch(): Nenhum backup encontrado no banco" "WARNING" "$ScriptName"
        return 1
    fi
    
    local processed_count=0
    local failed_count=0
    
    # Processar cada resultado
    while IFS='|' read -r player_id backup_hex; do
        if [[ -z "$player_id" || -z "$backup_hex" ]]; then
            ((failed_count++))
            continue
        fi
        
        # Extrair posições X, Y, Z do BLOB (mesma lógica do monitor_all_players.sh)
        local hex_position_x=${backup_hex:4:8}
        local coord_x=$(echo "$hex_position_x" | xxd -r -p | od -An -t fF | tr -d ' ' 2>/dev/null)
        
        local hex_position_z=${backup_hex:12:8}
        local coord_z=$(echo "$hex_position_z" | xxd -r -p | od -An -t fF | tr -d ' ' 2>/dev/null)
        
        local hex_position_y=${backup_hex:20:8}
        local coord_y=$(echo "$hex_position_y" | xxd -r -p | od -An -t fF | tr -d ' ' 2>/dev/null)
        
        # Validar coordenadas
        if [[ -z "$coord_x" || -z "$coord_y" || -z "$coord_z" ]]; then
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Coordenadas inválidas para $player_id" "WARNING" "$ScriptName"
            ((failed_count++))
            continue
        fi
        
        # Converter backup hex para base64
        local backup_base64=$(echo "$backup_hex" | xxd -r -p | base64 -w 0 2>/dev/null)
        
        if [[ -z "$backup_base64" ]]; then
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Falha ao converter backup para base64 para $player_id" "ERROR" "$ScriptName"
            ((failed_count++))
            continue
        fi
        
        # Montar JSON para envio
        local backup_json=$(jq -n \
            --arg player_id "$player_id" \
            --arg backup_data "$backup_base64" \
            --arg coord_x "$coord_x" \
            --arg coord_z "$coord_z" \
            --arg coord_y "$coord_y" \
            --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" \
            '{
                action: "players_backup_data",
                player_id: $player_id,
                backup_data: $backup_data,
                coord_x: ($coord_x | tonumber),
                coord_z: ($coord_z | tonumber),
                coord_y: ($coord_y | tonumber),
                timestamp: $timestamp
            }' 2>/dev/null)
        
        if [[ -z "$backup_json" ]]; then
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Falha ao montar JSON para $player_id" "ERROR" "$ScriptName"
            ((failed_count++))
            continue
        fi
        
        # Publicar no RabbitMQ
        INSERT_CUSTOM_LOG "process_players_backup_batch(): Publicando backup para $player_id na fila data.players.backups" "INFO" "$ScriptName"
        
        # Verificar tamanho do JSON (para debug)
        local json_size=${#backup_json}
        INSERT_CUSTOM_LOG "process_players_backup_batch(): Tamanho do JSON: $json_size bytes para $player_id" "DEBUG" "$ScriptName"
        
        # Publicar no RabbitMQ
        if PUBLISH_TO_RABBITMQ "data.players.backups" "$backup_json"; then
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Backup publicado com sucesso para $player_id" "INFO" "$ScriptName"
            ((processed_count++))
        else
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Falha ao publicar backup para $player_id" "ERROR" "$ScriptName"
            INSERT_CUSTOM_LOG "process_players_backup_batch(): Verifique o log: ${DayzServerFolder:-/tmp}/profiles/rabbitmq_producer_errors.log" "ERROR" "$ScriptName"
            ((failed_count++))
        fi
    done <<< "$backup_results"
    
    INSERT_CUSTOM_LOG "process_players_backup_batch(): Processados $processed_count backups, $failed_count falhas" "INFO" "$ScriptName"
    
    return 0
}

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
        player_connected|player_disconnected|player_respawned|reset_password)
            echo "events.players"
            ;;
        players_backup_request)
            # Esta ação é processada localmente, retornar vazio
            echo ""
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
    
    # Extrai o campo "action" com validação do JSON
    action=""
    
    # Primeiro, verificar se o JSON é válido
    if echo "$line_trimmed" | jq empty 2>/dev/null; then
        # JSON válido, usar jq para extrair action
        action=$(echo "$line_trimmed" | jq -r '.action // empty' 2>/dev/null)
    else
        # JSON inválido ou jq falhou, tentar extrair action manualmente
        action=$(echo "$line_trimmed" | grep -o '"action"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 2>/dev/null)
        
        # Se ainda não encontrou e contém players_backup_request, forçar
        if [[ -z "$action" ]] && echo "$line_trimmed" | grep -q "players_backup_request"; then
            INSERT_CUSTOM_LOG "DEBUG: JSON inválido mas contém players_backup_request. Forçando action." "WARNING" "$ScriptName"
            action="players_backup_request"
        fi
    fi
    
    # Fallback final: se action ainda estiver vazio mas JSON contém players_backup_request
    if [[ -z "$action" ]] && echo "$line_trimmed" | grep -q "players_backup_request"; then
        INSERT_CUSTOM_LOG "DEBUG: action vazio mas JSON contém players_backup_request. Forçando action." "WARNING" "$ScriptName"
        action="players_backup_request"
    fi
    
    # Processar players_backup_request localmente
    if [[ "$action" == "players_backup_request" ]]; then
        INSERT_CUSTOM_LOG "Interceptando players_backup_request para processamento local" "INFO" "$ScriptName"
        process_players_backup_batch "$line_trimmed" &
        continue   
    fi
    
    # Obter queue RabbitMQ para esta ação
    queue=$(get_rabbitmq_queue "$action")
    
    # Se queue vazio, pular
    if [[ -z "$queue" ]]; then
        continue
    fi
    
    # Adicionar timestamp ao JSON se não existir
    payload=$(echo "$line_trimmed" | jq --arg timestamp "$(date '+%Y-%m-%d %H:%M:%S')" '. + {captured_timestamp: $timestamp}' 2>/dev/null)
    
    if [[ -z "$payload" ]]; then
        payload="$line_trimmed"
    fi
    
    # Publicar diretamente no RabbitMQ (não bloqueia, executa em background)
    if PUBLISH_TO_RABBITMQ "$queue" "$payload"; then
        INSERT_CUSTOM_LOG "Ação [$action] publicada na fila [$queue]" "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Falha ao publicar ação [$action] na fila [$queue]" "ERROR" "$ScriptName"
    fi
done