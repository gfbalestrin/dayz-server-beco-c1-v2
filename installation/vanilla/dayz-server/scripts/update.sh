#!/bin/bash
export TZ=America/Sao_Paulo
set -euo pipefail

files=(
"__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/admin/files/commands_to_execute.txt"
"__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/admin/files/external_actions.txt"
"__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/admin/files/messages_to_send.txt"
"__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/admin/files/messages_private_to_send.txt"
"__DAYZ_FOLDER__/profiles/dayz-server.log"
"__DAYZ_FOLDER__/profiles/dayz-server.err"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo > "$file"
    fi
done

# Limpa logs de banco antigos (se o script existir)
if [ -f "__DAYZ_FOLDER__/scripts/clear_databases.sh" ]; then
    echo "[INFO] Limpar logs de banco antigos..."
    cd "__DAYZ_FOLDER__/scripts" && source "__DAYZ_FOLDER__/scripts/config.sh"
fi

cd __DAYZ_FOLDER__/scripts
source __DAYZ_FOLDER__/scripts/config.sh
CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")
ScriptName=$(basename "$0")
SEND_DISCORD_WEBHOOK "⚠️ Servidor reiniciando e atualizando... Todos os jogadores foram desconectados!" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
INSERT_CUSTOM_LOG "⚠️ Servidor reiniciando e atualizando... Todos os jogadores foram desconectados!" "INFO" "$ScriptName"

__APP_FOLDER__/__APP_SCRIPT_UPDATE_PLAYERS_ONLINE_FILE__ "RESET"

# Faz backup do banco de players ANTES de qualquer operação de wipe
CURRENT_DATE=$(date "+%Y-%m-%d_%H-%M-%S")
PLAYER_DB="/home/__LINUX_USER_NAME__/servers/dayz-server/mpmissions/__DAYZ_MPMISSION__/storage_1/players.db"
BACKUP_DIR="/home/__LINUX_USER_NAME__/servers/dayz-server/mpmissions/__DAYZ_MPMISSION__/storage_1/backup_custom"
BACKUP_FILE="$BACKUP_DIR/players.db_$CURRENT_DATE"

echo "Fazendo backup do banco de players..."

# Cria a pasta backup_custom se não existir
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    chown "__LINUX_USER_NAME__:__LINUX_USER_NAME__" "$BACKUP_DIR"
fi

if [ -f "$PLAYER_DB" ]; then
    cp -Rap "$PLAYER_DB" "$BACKUP_FILE"
else
    echo "Aviso: arquivo $PLAYER_DB não encontrado, backup não realizado."
fi

# Remove arquivos de backup mais antigos que 7 dias
echo "Removendo backups antigos (mais de 7 dias)..."
find "$BACKUP_DIR" -name "players.db_*" -type f -mtime +7 -delete

# Opcional: Log da limpeza
if [ $? -eq 0 ]; then
    echo "Limpeza de backups antigos concluída"
else
    echo "Aviso: Erro durante limpeza de backups antigos"
fi

# Remove arquivos de log mais antigos que 7 dias (ANTES do servidor gerar novos logs)
LOG_DIR="/home/__LINUX_USER_NAME__/servers/dayz-server/profiles"
echo "Removendo logs antigos (mais de 7 dias)..."
find "$LOG_DIR" -name "DayZServer_*.ADM" -type f -mtime +7 -delete
find "$LOG_DIR" -name "DayZServer_*.RPT" -type f -mtime +7 -delete
find "$LOG_DIR" -name "DayZServer_*.log" -type f -mtime +7 -delete
find "$LOG_DIR" -name "DayZServer_*.mdmp" -type f -mtime +7 -delete
find "$LOG_DIR" -name "script_*.log" -type f -mtime +7 -delete
find "$LOG_DIR" -name "crash_*.log" -type f -mtime +7 -delete

# Log da limpeza de logs
if [ $? -eq 0 ]; then
    echo "Limpeza de logs antigos concluída"
else
    echo "Aviso: Erro durante limpeza de logs antigos"
fi

if [[ "$DayzWipeOnRestart" == "1" ]]; then
	INSERT_CUSTOM_LOG "Realizando wipe do servidor DayZ" "INFO" "$ScriptName"
	PROFILE_DIR="__DAYZ_SERVER_FOLDER__/mpmissions/__DAYZ_MPMISSION__/storage_1"
	INSERT_CUSTOM_LOG "PROFILE_DIR: $PROFILE_DIR" "INFO" "$ScriptName"
	rm -rf "$PROFILE_DIR/players.db"
	rm -rf "$PROFILE_DIR/spawnpoints.bin"
	rm -rf "$PROFILE_DIR/data"
	sqlite3 "__APP_FOLDER__/__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM vehicles_tracking"
	sqlite3 "__APP_FOLDER__/__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM container_items_tracking"
	sqlite3 "__APP_FOLDER__/__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM containers_tracking"
	sqlite3 "__APP_FOLDER__/__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM fences_tracking"
	sqlite3 "__APP_FOLDER__/__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM watchtowers_tracking"
	sqlite3 "__APP_FOLDER__/__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_damage"
	sqlite3 "__APP_FOLDER__/__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_killfeed"
	sqlite3 "__APP_FOLDER__/__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_coord_backup"
	sqlite3 "__APP_FOLDER__/__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_coord"
	INSERT_CUSTOM_LOG "Wipe realizado!" "INFO" "$ScriptName"
	SEND_DISCORD_WEBHOOK "Wipe realizado!" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
fi

# Atualiza o servidor via SteamCMD
INSERT_CUSTOM_LOG "[INFO] Atualizando servidor via SteamCMD..." "INFO" "$ScriptName"
cd "__DAYZ_FOLDER__"
/home/__LINUX_USER_NAME__/servers/steamcmd/steamcmd.sh +force_install_dir "__DAYZ_FOLDER__/" +login __STEAM_ACCOUNT__ +app_update 223350 validate +quit

# Atualiza eventos (se o script existir)
if [ -f "__DAYZ_FOLDER__/scripts/economy_update.sh" ]; then
    INSERT_CUSTOM_LOG "[INFO] Atualizando eventos..." "INFO" "$ScriptName"
    cd "__DAYZ_FOLDER__/scripts"
    ./economy_update.sh
fi

cd "__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/"

# Remove arquivos existentes para evitar conflitos (cuidar para não apagar arquivos importantes do deathmatch)
rm -f init.c
[ -d admin/files ] && cp -Rap admin/files /tmp/
[ -d admin/loadouts ] && cp -Rap admin/loadouts /tmp/
[ -d admin ] && rm -rf admin

echo "[INFO] Baixando arquivos do servidor via Git..."
# Repositório local em __DAYZ_FOLDER__/scripts
REPO_DIR="__DAYZ_FOLDER__/scripts/dayz-server-beco-c1-v2"

# Verifica se o repositório já existe
if [ ! -d "$REPO_DIR" ]; then
    echo "[INFO] Clonando repositório (primeira vez)..."
    git clone https://github.com/gfbalestrin/dayz-server-beco-c1-v2.git "$REPO_DIR"
else
    echo "[INFO] Atualizando repositório existente..."
    cd "$REPO_DIR"
    git fetch --all
    git reset --hard origin/main 
    git clean -fdx
cd -
fi

# Copia arquivos específicos do vanilla
echo "[INFO] Copiando arquivos para Vanilla..."
cp "$REPO_DIR/installation/vanilla/dayz-server/mpmissions/__DAYZ_MPMISSION__/init.c" .
cp -r "$REPO_DIR/installation/vanilla/dayz-server/mpmissions/__DAYZ_MPMISSION__/admin" .
cp -a /tmp/files/.    ./admin/files/
cp -a /tmp/loadouts/. ./admin/loadouts/

GLOBALS_FILE="__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/admin/Globals.c"
if [[ "$DayzDeathmatch" == "1" ]]; then
    if grep -q "bool IsDeathmatchEnabled = false;" "$GLOBALS_FILE"; then
        sed -i 's/bool IsDeathmatchEnabled = false;/bool IsDeathmatchEnabled = true;/g' "$GLOBALS_FILE"
    fi
    EVENTS_FILE="__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/db/events.xml"
    sed -i '/<event name="StaticContaminatedArea">/,/<\/event>/d' "$EVENTS_FILE"
    sed -i '/<event name="DynamicContaminatedArea">/,/<\/event>/d' "$EVENTS_FILE"
    sed -i '/<event name="StaticGasZone">/,/<\/event>/d' "$EVENTS_FILE"
    sed -i '/<event name="DynamicGasZone">/,/<\/event>/d' "$EVENTS_FILE"
else
    if grep -q "bool IsDeathmatchEnabled = true;" "$GLOBALS_FILE"; then
        sed -i 's/bool IsDeathmatchEnabled = true;/bool IsDeathmatchEnabled = false;/g' "$GLOBALS_FILE"
    fi
fi

# Define permissões corretas apenas nos arquivos copiados
chown "__LINUX_USER_NAME__:__LINUX_USER_NAME__" init.c 2>/dev/null || echo "Aviso: Não foi possível alterar permissões do init.c"
chown -R "__LINUX_USER_NAME__:__LINUX_USER_NAME__" admin 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta admin"

MINUTES_RESTART="__DAYZ_RESTART_MINUTES__"
awk -v dl="$MINUTES_RESTART" '
BEGIN { in_old = 0; added = 0 }

/<message>/ {
    buffer = $0 ORS
    in_old = 1
    next
}

in_old {
    buffer = buffer $0 ORS
    if ($0 ~ /<\/message>/) {
        # Verifica se o buffer é a mensagem de aviso
        if (buffer ~ /<shutdown>1<\/shutdown>/ && buffer ~ /O servidor vai ser reiniciado em #tmin minutos/) {
            # drop (não imprime)
        } else {
            printf "%s", buffer
        }
        in_old = 0
        buffer = ""
    }
    next
}

/<\/messages>/ && !added {
    print "    <message>"
    print "        <deadline>" dl "</deadline>"
    print "        <shutdown>1</shutdown>"
    print "        <text>O servidor vai ser reiniciado em #tmin minutos.</text>"
    print "    </message>"
    added = 1
}

{ print }
' "__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/db/messages.xml" > tmp.xml && \
mv tmp.xml "__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/db/messages.xml"

CFG_FILE="__DAYZ_FOLDER__/serverDZ.cfg"
DAY_ACCEL="__DAY_ACCEL__"
NIGHT_ACCEL="__NIGHT_ACCEL__"
sed -i "s/^\s*serverTimeAcceleration=.*/serverTimeAcceleration=${DAY_ACCEL};/" "$CFG_FILE"
sed -i "s/^\s*serverNightTimeAcceleration=.*/serverNightTimeAcceleration=${NIGHT_ACCEL};/" "$CFG_FILE"

chown -R "__LINUX_USER_NAME__:__LINUX_USER_NAME__" __DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/db/messages.xml 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta admin"

echo "[INFO] Update concluído com sucesso."