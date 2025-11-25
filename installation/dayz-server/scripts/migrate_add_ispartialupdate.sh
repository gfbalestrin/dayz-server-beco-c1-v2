#!/bin/bash
# Script de migração para adicionar coluna IsPartialUpdate na tabela vehicles_tracking
# Este script deve ser executado uma vez para atualizar bancos de dados existentes

set -euo pipefail

# Carregar configurações
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh" 2>/dev/null || {
    echo "Erro: Não foi possível carregar config.sh"
    exit 1
}

DB_FILE="$AppFolder/$AppVehicleBecoC1DbFile"

if [[ ! -f "$DB_FILE" ]]; then
    echo "Aviso: Banco de dados não encontrado: $DB_FILE"
    echo "A coluna IsPartialUpdate será criada automaticamente quando o banco for criado a partir do schema SQL."
    exit 0
fi

echo "Verificando se a coluna IsPartialUpdate já existe..."

# Verificar se a coluna já existe
COLUMN_EXISTS=$(sqlite3 "$DB_FILE" "PRAGMA table_info(vehicles_tracking);" | grep -c "IsPartialUpdate" || echo "0")

if [[ "$COLUMN_EXISTS" -gt 0 ]]; then
    echo "✓ Coluna IsPartialUpdate já existe no banco de dados."
    exit 0
fi

echo "Adicionando coluna IsPartialUpdate na tabela vehicles_tracking..."

# Adicionar coluna
sqlite3 "$DB_FILE" <<EOF
ALTER TABLE vehicles_tracking ADD COLUMN IsPartialUpdate INTEGER DEFAULT 0;
UPDATE vehicles_tracking SET IsPartialUpdate = 0 WHERE IsPartialUpdate IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_partial ON vehicles_tracking(VehicleId, IsPartialUpdate, TimeStamp);
EOF

if [[ $? -eq 0 ]]; then
    echo "✓ Coluna IsPartialUpdate adicionada com sucesso!"
    echo "✓ Índice idx_vehicles_tracking_partial criado com sucesso!"
    echo ""
    echo "Todos os registros existentes foram marcados como IsPartialUpdate = 0 (updates completos)."
else
    echo "✗ Erro ao adicionar coluna IsPartialUpdate."
    exit 1
fi

