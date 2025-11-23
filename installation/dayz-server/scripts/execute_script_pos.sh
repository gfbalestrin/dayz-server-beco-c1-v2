#!/bin/bash
export TZ=America/Sao_Paulo

LOG_DIR="/home/__LINUX_USER_NAME__/servers/dayz-server/profiles"

# Aguarda alguns segundos para o arquivo ser gerado
sleep 10

# Encontra o arquivo .ADM mais recente
ADM_FILE=$(ls -t "$LOG_DIR"/DayZServer_*.ADM 2>/dev/null | head -n 1)

# Se encontrado, cria ou atualiza link simbólico
if [[ -f "$ADM_FILE" ]]; then
    ln -sf "$(basename "$ADM_FILE")" "$LOG_DIR/DayZServer.ADM"
fi

if systemctl list-units --full -all | grep -Fq "dayz-monitor.service"; then
    systemctl restart dayz-monitor.service
fi
