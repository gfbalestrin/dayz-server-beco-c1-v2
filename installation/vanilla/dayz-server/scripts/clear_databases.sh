#!/bin/bash

export TZ=America/Sao_Paulo

# Configurações de retenção (hardcoded)
RETENTION_DAYS_SHORT=7   # Para coords e vehicles
RETENTION_DAYS_LONG=30   # Para logs

# Importar configurações do config.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Configurações de retry
MAX_RETRIES=5
RETRY_DELAY=0.2

# Função para executar comando SQLite com retry
execute_sql_with_retry() {
    local db_file="$1"
    local sql_command="$2"
    local description="$3"
    local attempt=1
    
    while (( attempt <= MAX_RETRIES )); do
        local result
        result=$(sqlite3 "$db_file" "$sql_command" 2>&1)
        
        if [[ $? -eq 0 ]]; then
            echo "$result"
            return 0
        else
            INSERT_CUSTOM_LOG "Tentativa $attempt falhou para: $description. Erro: $result" "ERROR" "clear_databases.sh"
            sleep "$RETRY_DELAY"
            attempt=$((attempt + 1))
        fi
    done
    
    INSERT_CUSTOM_LOG "Falha ao executar $description após $MAX_RETRIES tentativas" "ERROR" "clear_databases.sh"
    return 1
}

# Função para contar registros
count_records() {
    local db_file="$1"
    local table="$2"
    local result
    result=$(sqlite3 "$db_file" "SELECT COUNT(*) FROM $table;")
    echo "$result"
}

# Função para contar registros que serão deletados
count_old_records() {
    local db_file="$1"
    local table="$2"
    local timestamp_column="$3"
    local retention_days="$4"
    
    local sql="SELECT COUNT(*) FROM $table WHERE $timestamp_column < datetime('now', '-$retention_days days');"
    local result
    result=$(execute_sql_with_retry "$db_file" "$sql" "contar registros antigos em $table")
    echo "$result"
}

# Função para deletar registros antigos
delete_old_records() {
    local db_file="$1"
    local table="$2"
    local timestamp_column="$3"
    local retention_days="$4"
    local description="$5"
    
    local sql="DELETE FROM $table WHERE $timestamp_column < datetime('now', '-$retention_days days');"
    execute_sql_with_retry "$db_file" "$sql" "deletar registros antigos de $description"
}

# Função para executar VACUUM
execute_vacuum() {
    local db_file="$1"
    local description="$2"
    
    INSERT_CUSTOM_LOG "Executando VACUUM em $description..." "INFO" "clear_databases.sh"
    execute_sql_with_retry "$db_file" "VACUUM;" "VACUUM em $description"
}

# Função principal de limpeza
cleanup_database() {
    local db_file="$1"
    local description="$2"
    
    if [[ ! -f "$db_file" ]]; then
        INSERT_CUSTOM_LOG "Arquivo de banco de dados não encontrado: $db_file" "ERROR" "clear_databases.sh"
        return 1
    fi
    
    INSERT_CUSTOM_LOG "Iniciando limpeza do banco de dados: $description" "INFO" "clear_databases.sh"
    
    return 0
}

# Início da execução
INSERT_CUSTOM_LOG "Iniciando limpeza de bancos de dados..." "INFO" "clear_databases.sh"

# Limpeza do banco players_beco_c1.db
player_db="$AppFolder/$AppPlayerBecoC1DbFile"
cleanup_database "$player_db" "players_beco_c1.db"

# Contar registros antes da limpeza
players_coord_before=$(count_records "$player_db" "players_coord")
players_coord_backup_before=$(count_records "$player_db" "players_coord_backup")

# Contar registros antigos
players_coord_old=$(count_old_records "$player_db" "players_coord" "Data" "$RETENTION_DAYS_SHORT")
players_coord_backup_old=$(count_old_records "$player_db" "players_coord_backup" "TimeStamp" "$RETENTION_DAYS_SHORT")

INSERT_CUSTOM_LOG "Tabela players_coord: $players_coord_before total, $players_coord_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela players_coord_backup: $players_coord_backup_before total, $players_coord_backup_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$player_db" "players_coord" "Data" "$RETENTION_DAYS_SHORT" "players_coord"
delete_old_records "$player_db" "players_coord_backup" "TimeStamp" "$RETENTION_DAYS_SHORT" "players_coord_backup"

# Contar registros depois da limpeza
players_coord_after=$(count_records "$player_db" "players_coord")
players_coord_backup_after=$(count_records "$player_db" "players_coord_backup")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela players_coord: $players_coord_before -> $players_coord_after (deletados: $((players_coord_before - players_coord_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela players_coord_backup: $players_coord_backup_before -> $players_coord_backup_after (deletados: $((players_coord_backup_before - players_coord_backup_after)))" "INFO" "clear_databases.sh"

# Limpeza do banco server_beco_c1_logs.db
logs_db="$AppFolder/$AppServerBecoC1LogsDbFile"
cleanup_database "$logs_db" "server_beco_c1_logs.db"

# Contar registros antes da limpeza
vehicles_tracking_before=$(count_records "$logs_db" "vehicles_tracking")
logs_adm_before=$(count_records "$logs_db" "logs_adm")
logs_custom_before=$(count_records "$logs_db" "logs_custom")

# Contar registros antigos
vehicles_tracking_old=$(count_old_records "$logs_db" "vehicles_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")
logs_adm_old=$(count_old_records "$logs_db" "logs_adm" "TimeStamp" "$RETENTION_DAYS_LONG")
logs_custom_old=$(count_old_records "$logs_db" "logs_custom" "TimeStamp" "$RETENTION_DAYS_LONG")

INSERT_CUSTOM_LOG "Tabela vehicles_tracking: $vehicles_tracking_before total, $vehicles_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_adm: $logs_adm_before total, $logs_adm_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_custom: $logs_custom_before total, $logs_custom_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$logs_db" "vehicles_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "vehicles_tracking"
delete_old_records "$logs_db" "logs_adm" "TimeStamp" "$RETENTION_DAYS_LONG" "logs_adm"
delete_old_records "$logs_db" "logs_custom" "TimeStamp" "$RETENTION_DAYS_LONG" "logs_custom"

# Contar registros depois da limpeza
vehicles_tracking_after=$(count_records "$logs_db" "vehicles_tracking")
logs_adm_after=$(count_records "$logs_db" "logs_adm")
logs_custom_after=$(count_records "$logs_db" "logs_custom")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela vehicles_tracking: $vehicles_tracking_before -> $vehicles_tracking_after (deletados: $((vehicles_tracking_before - vehicles_tracking_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_adm: $logs_adm_before -> $logs_adm_after (deletados: $((logs_adm_before - logs_adm_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_custom: $logs_custom_before -> $logs_custom_after (deletados: $((logs_custom_before - logs_custom_after)))" "INFO" "clear_databases.sh"

# Executar VACUUM em ambos os bancos para recuperar espaço
execute_vacuum "$player_db" "players_beco_c1.db"
execute_vacuum "$logs_db" "server_beco_c1_logs.db"

INSERT_CUSTOM_LOG "Limpeza de bancos de dados concluída com sucesso!" "INFO" "clear_databases.sh"

