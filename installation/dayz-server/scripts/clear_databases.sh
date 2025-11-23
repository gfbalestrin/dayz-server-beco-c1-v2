#!/bin/bash

export TZ=America/Sao_Paulo

# Configuração de retenção de histórico (em dias)
# Para alterar, modifique o valor abaixo:
RETENTION_DAYS_SHORT=1   # Para coords, vehicles, containers e fences (24 horas)
RETENTION_DAYS_LONG=7    # Para logs

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

# Limpeza do banco vehicles_beco_c1.db
vehicles_db="$AppFolder/$AppVehicleBecoC1DbFile"
cleanup_database "$vehicles_db" "vehicles_beco_c1.db"

# Contar registros antes da limpeza
vehicles_tracking_before=$(count_records "$vehicles_db" "vehicles_tracking")
vehicles_items_before=$(count_records "$vehicles_db" "vehicles_items")
vehicles_attachments_before=$(count_records "$vehicles_db" "vehicles_attachments")

# Contar registros antigos
vehicles_tracking_old=$(count_old_records "$vehicles_db" "vehicles_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")
vehicles_items_old=$(count_old_records "$vehicles_db" "vehicles_items" "TimeStamp" "$RETENTION_DAYS_SHORT")
vehicles_attachments_old=$(count_old_records "$vehicles_db" "vehicles_attachments" "TimeStamp" "$RETENTION_DAYS_SHORT")

INSERT_CUSTOM_LOG "Tabela vehicles_tracking: $vehicles_tracking_before total, $vehicles_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela vehicles_items: $vehicles_items_before total, $vehicles_items_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela vehicles_attachments: $vehicles_attachments_before total, $vehicles_attachments_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$vehicles_db" "vehicles_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "vehicles_tracking"
delete_old_records "$vehicles_db" "vehicles_items" "TimeStamp" "$RETENTION_DAYS_SHORT" "vehicles_items"
delete_old_records "$vehicles_db" "vehicles_attachments" "TimeStamp" "$RETENTION_DAYS_SHORT" "vehicles_attachments"

# Contar registros depois da limpeza
vehicles_tracking_after=$(count_records "$vehicles_db" "vehicles_tracking")
vehicles_items_after=$(count_records "$vehicles_db" "vehicles_items")
vehicles_attachments_after=$(count_records "$vehicles_db" "vehicles_attachments")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela vehicles_tracking: $vehicles_tracking_before -> $vehicles_tracking_after (deletados: $((vehicles_tracking_before - vehicles_tracking_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela vehicles_items: $vehicles_items_before -> $vehicles_items_after (deletados: $((vehicles_items_before - vehicles_items_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela vehicles_attachments: $vehicles_attachments_before -> $vehicles_attachments_after (deletados: $((vehicles_attachments_before - vehicles_attachments_after)))" "INFO" "clear_databases.sh"

# Limpeza do banco containers_beco_c1.db
containers_db="$AppFolder/$AppContainerBecoC1DbFile"
cleanup_database "$containers_db" "containers_beco_c1.db"

# Contar registros antes da limpeza
containers_tracking_before=$(count_records "$containers_db" "containers_tracking")
container_items_tracking_before=$(count_records "$containers_db" "container_items_tracking")

# Contar registros antigos
containers_tracking_old=$(count_old_records "$containers_db" "containers_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")
container_items_tracking_old=$(count_old_records "$containers_db" "container_items_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")

INSERT_CUSTOM_LOG "Tabela containers_tracking: $containers_tracking_before total, $containers_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela container_items_tracking: $container_items_tracking_before total, $container_items_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$containers_db" "containers_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "containers_tracking"
delete_old_records "$containers_db" "container_items_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "container_items_tracking"

# Contar registros depois da limpeza
containers_tracking_after=$(count_records "$containers_db" "containers_tracking")
container_items_tracking_after=$(count_records "$containers_db" "container_items_tracking")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela containers_tracking: $containers_tracking_before -> $containers_tracking_after (deletados: $((containers_tracking_before - containers_tracking_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela container_items_tracking: $container_items_tracking_before -> $container_items_tracking_after (deletados: $((container_items_tracking_before - container_items_tracking_after)))" "INFO" "clear_databases.sh"

# Limpeza do banco structures_beco_c1.db
structures_db="$AppFolder/$AppStructureBecoC1DbFile"
cleanup_database "$structures_db" "structures_beco_c1.db"

# Contar registros antes da limpeza
fences_tracking_before=$(count_records "$structures_db" "fences_tracking")
watchtowers_tracking_before=$(count_records "$structures_db" "watchtowers_tracking")
flags_tracking_before=$(count_records "$structures_db" "flags_tracking")

# Contar registros antigos
fences_tracking_old=$(count_old_records "$structures_db" "fences_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")
watchtowers_tracking_old=$(count_old_records "$structures_db" "watchtowers_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")
flags_tracking_old=$(count_old_records "$structures_db" "flags_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT")

INSERT_CUSTOM_LOG "Tabela fences_tracking: $fences_tracking_before total, $fences_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela watchtowers_tracking: $watchtowers_tracking_before total, $watchtowers_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela flags_tracking: $flags_tracking_before total, $flags_tracking_old antigos (mais de $RETENTION_DAYS_SHORT dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$structures_db" "fences_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "fences_tracking"
delete_old_records "$structures_db" "watchtowers_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "watchtowers_tracking"
delete_old_records "$structures_db" "flags_tracking" "TimeStamp" "$RETENTION_DAYS_SHORT" "flags_tracking"

# Contar registros depois da limpeza
fences_tracking_after=$(count_records "$structures_db" "fences_tracking")
watchtowers_tracking_after=$(count_records "$structures_db" "watchtowers_tracking")
flags_tracking_after=$(count_records "$structures_db" "flags_tracking")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela fences_tracking: $fences_tracking_before -> $fences_tracking_after (deletados: $((fences_tracking_before - fences_tracking_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela watchtowers_tracking: $watchtowers_tracking_before -> $watchtowers_tracking_after (deletados: $((watchtowers_tracking_before - watchtowers_tracking_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela flags_tracking: $flags_tracking_before -> $flags_tracking_after (deletados: $((flags_tracking_before - flags_tracking_after)))" "INFO" "clear_databases.sh"

# Limpeza do banco server_beco_c1_logs.db
logs_db="$AppFolder/$AppServerBecoC1LogsDbFile"
cleanup_database "$logs_db" "server_beco_c1_logs.db"

# Contar registros antes da limpeza
logs_adm_before=$(count_records "$logs_db" "logs_adm")
logs_custom_before=$(count_records "$logs_db" "logs_custom")
logs_rpt_before=$(count_records "$logs_db" "logs_rpt")
user_audit_logs_before=$(count_records "$logs_db" "user_audit_logs")

# Contar registros antigos
logs_adm_old=$(count_old_records "$logs_db" "logs_adm" "TimeStamp" "$RETENTION_DAYS_LONG")
logs_custom_old=$(count_old_records "$logs_db" "logs_custom" "TimeStamp" "$RETENTION_DAYS_LONG")
logs_rpt_old=$(count_old_records "$logs_db" "logs_rpt" "TimeStamp" "$RETENTION_DAYS_LONG")
user_audit_logs_old=$(count_old_records "$logs_db" "user_audit_logs" "TimeStamp" "$RETENTION_DAYS_LONG")

INSERT_CUSTOM_LOG "Tabela user_audit_logs será mantida sem exclusões de registros." "INFO" "clear_databases.sh"

INSERT_CUSTOM_LOG "Tabela logs_adm: $logs_adm_before total, $logs_adm_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_custom: $logs_custom_before total, $logs_custom_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_rpt: $logs_rpt_before total, $logs_rpt_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela user_audit_logs: $user_audit_logs_before total, $user_audit_logs_old antigos (mais de $RETENTION_DAYS_LONG dias)" "INFO" "clear_databases.sh"

# Deletar registros antigos
delete_old_records "$logs_db" "logs_adm" "TimeStamp" "$RETENTION_DAYS_LONG" "logs_adm"
delete_old_records "$logs_db" "logs_custom" "TimeStamp" "$RETENTION_DAYS_LONG" "logs_custom"
delete_old_records "$logs_db" "logs_rpt" "TimeStamp" "$RETENTION_DAYS_LONG" "logs_rpt"

# Contar registros depois da limpeza
logs_adm_after=$(count_records "$logs_db" "logs_adm")
logs_custom_after=$(count_records "$logs_db" "logs_custom")
logs_rpt_after=$(count_records "$logs_db" "logs_rpt")
user_audit_logs_after=$(count_records "$logs_db" "user_audit_logs")

# Log de resultados
INSERT_CUSTOM_LOG "Tabela logs_adm: $logs_adm_before -> $logs_adm_after (deletados: $((logs_adm_before - logs_adm_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_custom: $logs_custom_before -> $logs_custom_after (deletados: $((logs_custom_before - logs_custom_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela logs_rpt: $logs_rpt_before -> $logs_rpt_after (deletados: $((logs_rpt_before - logs_rpt_after)))" "INFO" "clear_databases.sh"
INSERT_CUSTOM_LOG "Tabela user_audit_logs: $user_audit_logs_before -> $user_audit_logs_after (deletados: $((user_audit_logs_before - user_audit_logs_after)))" "INFO" "clear_databases.sh"

# Executar VACUUM em todos os bancos para recuperar espaço
execute_vacuum "$player_db" "players_beco_c1.db"
execute_vacuum "$vehicles_db" "vehicles_beco_c1.db"
execute_vacuum "$containers_db" "containers_beco_c1.db"
execute_vacuum "$structures_db" "structures_beco_c1.db"
execute_vacuum "$logs_db" "server_beco_c1_logs.db"

INSERT_CUSTOM_LOG "Limpeza de bancos de dados concluída com sucesso!" "INFO" "clear_databases.sh"

