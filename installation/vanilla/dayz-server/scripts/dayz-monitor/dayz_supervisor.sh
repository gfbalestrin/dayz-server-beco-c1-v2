#!/bin/bash

# Caminhos para os scripts individuais
CMD_WATCHER="/home/__LINUX_USER_NAME__/servers/dayz-server/scripts/dayz-monitor/dayz_command_watcher.sh"
LOG_WATCHER="/home/__LINUX_USER_NAME__/servers/dayz-server/scripts/dayz-monitor/dayz_log_monitor.sh"
ERR_WATCHER="/home/__LINUX_USER_NAME__/servers/dayz-server/scripts/dayz-monitor/dayz_err_monitor.sh"

# Inicia os scripts em background
"$CMD_WATCHER" &
PID1=$!

"$LOG_WATCHER" &
PID2=$!

"$ERR_WATCHER" &
PID3=$!

# Espera os três processos (para manter o serviço "vivo")
wait $PID1 $PID2 $PID3 
