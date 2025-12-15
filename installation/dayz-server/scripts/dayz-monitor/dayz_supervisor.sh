#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

# Caminhos para os scripts individuais
CMD_WATCHER="$SCRIPT_DIR/dayz_command_watcher.sh"
LOG_WATCHER="$SCRIPT_DIR/dayz_log_monitor.sh"
ERR_WATCHER="$SCRIPT_DIR/dayz_err_monitor.sh"
BACKUP_CONSUMER="$SCRIPT_DIR/players_backup_consumer.sh"

# Inicia os scripts em background
"$CMD_WATCHER" &
PID1=$!

"$LOG_WATCHER" &
PID2=$!

"$ERR_WATCHER" &
PID3=$!

# Iniciar consumer de backups apenas se não for deathmatch
if [[ "$DayzDeathmatch" != "1" ]]; then
    "$BACKUP_CONSUMER" &
    PID4=$!
    # Espera os quatro processos
    wait $PID1 $PID2 $PID3 $PID4
else
    # Espera os três processos (sem backup consumer)
    wait $PID1 $PID2 $PID3
fi 
