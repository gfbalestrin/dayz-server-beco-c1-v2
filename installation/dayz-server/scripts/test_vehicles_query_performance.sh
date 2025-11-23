#!/bin/bash

# Script para testar performance da query otimizada de veículos
# Verifica uso de índices e tempo de execução

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

DB_FILE="$AppFolder/$AppVehicleBecoC1DbFile"

if [[ ! -f "$DB_FILE" ]]; then
    echo "Erro: Banco de dados não encontrado: $DB_FILE"
    exit 1
fi

echo "=========================================="
echo "Teste de Performance - Query de Veículos"
echo "=========================================="
echo ""

# Verificar se índice composto existe
echo "1. Verificando índices..."
echo "----------------------------------------"
sqlite3 "$DB_FILE" <<EOF
SELECT name, sql 
FROM sqlite_master 
WHERE type='index' 
AND tbl_name='vehicles_tracking'
AND name LIKE '%lookup%';
EOF
echo ""

# Contar registros na tabela
echo "2. Estatísticas da tabela vehicles_tracking:"
echo "----------------------------------------"
total_records=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM vehicles_tracking;")
unique_vehicles=$(sqlite3 "$DB_FILE" "SELECT COUNT(DISTINCT VehicleId) FROM vehicles_tracking;")
echo "Total de registros: $total_records"
echo "Veículos únicos: $unique_vehicles"
echo ""

# Verificar se coluna IsDestroyed existe
has_is_destroyed=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed';")

# Query otimizada com window function
if [[ "$has_is_destroyed" -eq 1 ]]; then
    OPTIMIZED_QUERY="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
    FROM (
        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY,
               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
        FROM vehicles_tracking
        WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
    ) ranked
    WHERE rn = 1"
else
    OPTIMIZED_QUERY="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
    FROM (
        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY,
               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
        FROM vehicles_tracking
    ) ranked
    WHERE rn = 1"
fi

# Query antiga (subquery MAX) para comparação
if [[ "$has_is_destroyed" -eq 1 ]]; then
    OLD_QUERY="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
    FROM vehicles_tracking v1
    WHERE v1.TimeStamp = (
        SELECT MAX(v2.TimeStamp) 
        FROM vehicles_tracking v2 
        WHERE v2.VehicleId = v1.VehicleId
        AND (v2.IsDestroyed = 0 OR v2.IsDestroyed IS NULL)
    )
    AND (v1.IsDestroyed = 0 OR v1.IsDestroyed IS NULL)"
else
    OLD_QUERY="SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY 
    FROM vehicles_tracking v1
    WHERE v1.TimeStamp = (
        SELECT MAX(v2.TimeStamp) 
        FROM vehicles_tracking v2 
        WHERE v2.VehicleId = v1.VehicleId
    )"
fi

# Teste 3: EXPLAIN QUERY PLAN da query otimizada
echo "3. EXPLAIN QUERY PLAN - Query Otimizada (Window Function):"
echo "----------------------------------------"
sqlite3 "$DB_FILE" "EXPLAIN QUERY PLAN $OPTIMIZED_QUERY"
echo ""

# Teste 4: EXPLAIN QUERY PLAN da query antiga (para comparação)
echo "4. EXPLAIN QUERY PLAN - Query Antiga (Subquery MAX):"
echo "----------------------------------------"
sqlite3 "$DB_FILE" "EXPLAIN QUERY PLAN $OLD_QUERY"
echo ""

# Teste 5: Medir tempo de execução da query otimizada
echo "5. Medindo tempo de execução (10 execuções):"
echo "----------------------------------------"
echo "Query Otimizada:"
total_time=0
for i in {1..10}; do
    start_time=$(date +%s%N)
    sqlite3 "$DB_FILE" "$OPTIMIZED_QUERY" > /dev/null
    end_time=$(date +%s%N)
    elapsed=$(( (end_time - start_time) / 1000000 ))  # Converter para milissegundos
    total_time=$((total_time + elapsed))
    echo "  Execução $i: ${elapsed}ms"
done
avg_time=$((total_time / 10))
echo "  Tempo médio: ${avg_time}ms"
echo ""

# Teste 6: Medir tempo de execução da query antiga (se não houver muitos registros)
if [[ $total_records -lt 10000 ]]; then
    echo "Query Antiga (comparação - apenas se < 10k registros):"
    total_time_old=0
    for i in {1..10}; do
        start_time=$(date +%s%N)
        sqlite3 "$DB_FILE" "$OLD_QUERY" > /dev/null
        end_time=$(date +%s%N)
        elapsed=$(( (end_time - start_time) / 1000000 ))
        total_time_old=$((total_time_old + elapsed))
        echo "  Execução $i: ${elapsed}ms"
    done
    avg_time_old=$((total_time_old / 10))
    echo "  Tempo médio: ${avg_time_old}ms"
    
    if [[ $avg_time_old -gt 0 ]]; then
        improvement=$(echo "scale=2; ($avg_time_old - $avg_time) / $avg_time_old * 100" | bc)
        echo "  Melhoria: ${improvement}% mais rápido"
    fi
    echo ""
fi

# Teste 7: Verificar resultados (contar veículos retornados)
echo "6. Verificando resultados:"
echo "----------------------------------------"
result_count=$(sqlite3 "$DB_FILE" "$OPTIMIZED_QUERY" | wc -l)
echo "Veículos retornados pela query otimizada: $result_count"
echo ""

# Teste 8: Verificar uso do índice composto
echo "7. Verificando uso do índice composto:"
echo "----------------------------------------"
sqlite3 "$DB_FILE" <<EOF
ANALYZE;
SELECT 
    stat.name,
    stat.stat
FROM sqlite_stat1 stat
WHERE stat.tbl = 'vehicles_tracking'
AND stat.name LIKE '%lookup%';
EOF
echo ""

echo "=========================================="
echo "Teste concluído!"
echo "=========================================="
echo ""
echo "Recomendações:"
echo "- Tempo médio < 100ms: Excelente para 10s de intervalo"
echo "- Tempo médio 100-500ms: Aceitável, mas monitorar"
echo "- Tempo médio > 500ms: Considerar otimizações adicionais"
echo ""

