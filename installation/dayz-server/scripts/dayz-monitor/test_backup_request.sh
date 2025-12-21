#!/bin/bash
# Script de teste para simular RequestPlayersBackup()
# Uso: ./test_backup_request.sh [player_id1] [player_id2] ... [--dry-run] [--from-db]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")
EXTERNAL_ACTIONS_FILE="$DayzServerFolder/$DayzActionsToExecuteFile"
PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"

# Flags
DRY_RUN=false
FROM_DB=false

# Parse argumentos
PLAYER_IDS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --from-db)
            FROM_DB=true
            shift
            ;;
        *)
            # Validar se é um player_id válido (44 caracteres)
            if [[ ${#1} -eq 44 ]]; then
                PLAYER_IDS+=("$1")
            else
                echo "Aviso: '$1' não é um player_id válido (deve ter 44 caracteres), ignorando..." >&2
            fi
            shift
            ;;
    esac
done

# Função para buscar player_ids do banco (jogadores online)
get_online_player_ids() {
    if [[ ! -f "$PLAYERS_BECO_C1_DB" ]]; then
        echo "Erro: Banco de dados não encontrado: $PLAYERS_BECO_C1_DB" >&2
        return 1
    fi
    
    sqlite3 -separator '' "$PLAYERS_BECO_C1_DB" "
        SELECT DISTINCT p.PlayerID
        FROM players_online o
        INNER JOIN players_database p ON o.PlayerID = p.PlayerID
        ORDER BY o.DataConnect ASC;
    " 2>/dev/null
}

# Obter player_ids
if [[ "$FROM_DB" == true ]]; then
    echo "Buscando player_ids do banco de dados (jogadores online)..." >&2
    while IFS= read -r player_id; do
        if [[ -n "$player_id" && ${#player_id} -eq 44 ]]; then
            PLAYER_IDS+=("$player_id")
        fi
    done < <(get_online_player_ids)
    
    if [[ ${#PLAYER_IDS[@]} -eq 0 ]]; then
        echo "Nenhum jogador online encontrado no banco de dados." >&2
        exit 1
    fi
    echo "Encontrados ${#PLAYER_IDS[@]} jogadores online." >&2
elif [[ ${#PLAYER_IDS[@]} -eq 0 ]]; then
    echo "Erro: Nenhum player_id fornecido." >&2
    echo "Uso: $0 [player_id1] [player_id2] ... [--dry-run] [--from-db]" >&2
    echo "" >&2
    echo "Opções:" >&2
    echo "  --dry-run    Apenas mostra o JSON que seria enviado, não escreve no arquivo" >&2
    echo "  --from-db     Busca player_ids do banco de dados (jogadores online)" >&2
    echo "" >&2
    echo "Exemplos:" >&2
    echo "  $0 --from-db                    # Busca do banco e escreve no arquivo" >&2
    echo "  $0 --from-db --dry-run          # Busca do banco mas apenas mostra" >&2
    echo "  $0 \"player_id_1\" \"player_id_2\"  # Usa player_ids fornecidos" >&2
    exit 1
fi

# Montar JSON (simulando a função RequestPlayersBackup)
backup_request_json=""
processed_count=0

for player_id in "${PLAYER_IDS[@]}"; do
    if [[ -n "$backup_request_json" ]]; then
        backup_request_json+=","
    fi
    backup_request_json+="\"$player_id\""
    ((processed_count++))
done

# Montar JSON final usando jq (em uma linha só, sem formatação)
json_action=$(printf '%s\n' "${PLAYER_IDS[@]}" | jq -R . | jq -s -c '{action: "players_backup_request", player_ids: .}' 2>/dev/null)

# Se jq falhar, montar manualmente
if [[ -z "$json_action" ]]; then
    json_action="{\"action\":\"players_backup_request\",\"player_ids\":[$backup_request_json]}"
fi

# Mostrar informações
echo "=========================================" >&2
echo "Teste de RequestPlayersBackup()" >&2
echo "=========================================" >&2
echo "Player IDs processados: $processed_count" >&2
echo "Modo: $([ "$DRY_RUN" == true ] && echo "DRY-RUN (não escreverá no arquivo)" || echo "ESCRITA (escreverá no arquivo)")" >&2
echo "Arquivo: $EXTERNAL_ACTIONS_FILE" >&2
echo "=========================================" >&2
echo "" >&2

# Mostrar JSON formatado (para visualização)
echo "JSON que será enviado (formatado para visualização):" >&2
echo "$json_action" | jq '.' 2>/dev/null || echo "$json_action"
echo "" >&2
echo "JSON em uma linha (como será gravado):" >&2
echo "$json_action" >&2
echo "" >&2

# Escrever no arquivo ou apenas mostrar
if [[ "$DRY_RUN" == true ]]; then
    echo "[DRY-RUN] JSON acima seria escrito no arquivo: $EXTERNAL_ACTIONS_FILE" >&2
else
    if [[ ! -f "$EXTERNAL_ACTIONS_FILE" ]]; then
        echo "Aviso: Arquivo não existe, criando: $EXTERNAL_ACTIONS_FILE" >&2
        mkdir -p "$(dirname "$EXTERNAL_ACTIONS_FILE")"
        touch "$EXTERNAL_ACTIONS_FILE"
    fi
    
    echo "$json_action" >> "$EXTERNAL_ACTIONS_FILE"
    echo "✓ JSON escrito no arquivo: $EXTERNAL_ACTIONS_FILE" >&2
    echo "  O dayz_command_watcher.sh processará esta mensagem automaticamente." >&2
fi

echo "" >&2
echo "Player IDs incluídos:" >&2
for i in "${!PLAYER_IDS[@]}"; do
    echo "  $((i+1)). ${PLAYER_IDS[$i]}" >&2
done

