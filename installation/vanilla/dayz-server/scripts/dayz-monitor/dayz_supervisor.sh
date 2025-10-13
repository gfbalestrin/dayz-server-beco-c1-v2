#!/bin/bash

# Caminhos para os scripts individuais
CMD_WATCHER="/home/dayzadmin/servers/dayz-server/scripts/dayz_monitor/dayz_command_watcher.sh"
LOG_WATCHER="/home/dayzadmin/servers/dayz-server/scripts/dayz_monitor/dayz_log_monitor.sh"

# Inicia os scripts em background
"$CMD_WATCHER" &
PID1=$!

"$LOG_WATCHER" &
PID2=$!

# Espera os dois processos (para manter o serviço "vivo")
wait $PID1 $PID2 
