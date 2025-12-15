#!/bin/bash

# Wrapper para iniciar o consumer de backups de players
# Este script carrega as variáveis necessárias e inicia o consumer Python

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

# Exportar variáveis necessárias para o consumer Python
export DB_FILENAME="$DayzServerFolder/$DayzPlayerDbFile"
export PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"
export DayzDeathmatch="${DayzDeathmatch:-0}"

# Caminho do script Python
CONSUMER_SCRIPT="$SCRIPT_DIR/players_backup_consumer.py"

# Verificar se o script existe
if [[ ! -f "$CONSUMER_SCRIPT" ]]; then
    echo "Erro: Script consumer não encontrado: $CONSUMER_SCRIPT" >&2
    exit 1
fi

# Verificar se Python3 está disponível
if ! command -v python3 >/dev/null 2>&1; then
    echo "Erro: python3 não está disponível" >&2
    exit 1
fi

# Verificar se pika está instalado
if ! python3 -c "import pika" 2>/dev/null; then
    echo "Erro: biblioteca pika não está instalada. Execute: pip3 install pika" >&2
    exit 1
fi

# Iniciar consumer
exec python3 "$CONSUMER_SCRIPT"

