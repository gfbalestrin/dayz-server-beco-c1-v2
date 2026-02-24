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

# Função para converter dia da semana de português para inglês
CONVERT_DAY_PT_TO_EN() {
    local day_pt=$(echo "$1" | tr '[:lower:]' '[:upper:]' | tr -d ' ')
    case "$day_pt" in
        "DOM") echo "SUN" ;;
        "SEG") echo "MON" ;;
        "TER") echo "TUE" ;;
        "QUA") echo "WED" ;;
        "QUI") echo "THU" ;;
        "SEX") echo "FRI" ;;
        "SAB") echo "SAT" ;;
        *) echo "$day_pt" ;;
    esac
}

# Função para verificar se o dia atual está na lista de dias permitidos
CHECK_RAID_DAY_ALLOWED() {
    local days_allowed="$1"
    local current_day=$(date +%a | tr '[:lower:]' '[:upper:]')
    
    IFS=',' read -ra DAYS_ARRAY <<< "$days_allowed"
    for day in "${DAYS_ARRAY[@]}"; do
        day=$(echo "$day" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
        day_en=$(CONVERT_DAY_PT_TO_EN "$day")
        if [[ "$current_day" == "$day_en" ]]; then
            return 0
        fi
    done
    return 1
}

# Função para verificar se o horário atual está dentro do intervalo permitido
CHECK_RAID_HOUR_ALLOWED() {
    local hours_allowed="$1"
    local current_time=$(date +%H:%M)
    
    local start_time=$(echo "$hours_allowed" | cut -d'-' -f1)
    local end_time=$(echo "$hours_allowed" | cut -d'-' -f2)
    
    local current_minutes=$((10#$(echo "$current_time" | cut -d':' -f1) * 60 + 10#$(echo "$current_time" | cut -d':' -f2)))
    local start_minutes=$((10#$(echo "$start_time" | cut -d':' -f1) * 60 + 10#$(echo "$start_time" | cut -d':' -f2)))
    local end_minutes=$((10#$(echo "$end_time" | cut -d':' -f1) * 60 + 10#$(echo "$end_time" | cut -d':' -f2)))
    
    if [[ $current_minutes -ge $start_minutes ]] && [[ $current_minutes -le $end_minutes ]]; then
        return 0
    fi
    return 1
}
SEND_DISCORD_WEBHOOK "⚠️ Servidor reiniciando e atualizando... Todos os jogadores foram desconectados!" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
INSERT_CUSTOM_LOG "⚠️ Servidor reiniciando e atualizando... Todos os jogadores foram desconectados!" "INFO" "$ScriptName"

"__APP_FOLDER__/$AppScriptUpdatePlayersOnlineFile" "RESET"

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
echo "Removendo backups de players antigos (mais de 7 dias)..."
find "$BACKUP_DIR" -name "players.db_*" -type f -mtime +7 -delete

# Opcional: Log da limpeza
if [ $? -eq 0 ]; then
    echo "Limpeza de backups de players antigos concluída"
else
    echo "Aviso: Erro durante limpeza de backups de players antigos"
fi

echo "Fazendo backup dos bancos sqlite do diretório databases..."

# Faz backup dos bancos SQLite do diretório databases
DATABASES_DIR="__APP_FOLDER__/databases"
DATABASES_BACKUP_DIR="__APP_FOLDER__/databases/backup_custom"
DATABASES_BACKUP_SUBDIR="$DATABASES_BACKUP_DIR/$CURRENT_DATE"

# Cria a pasta backup_custom se não existir
if [ ! -d "$DATABASES_BACKUP_DIR" ]; then
    mkdir -p "$DATABASES_BACKUP_DIR"
    chown "__LINUX_USER_NAME__:__LINUX_USER_NAME__" "$DATABASES_BACKUP_DIR"
fi

# Cria o subdiretório com data/hora para este backup
if [ ! -d "$DATABASES_BACKUP_SUBDIR" ]; then
    mkdir -p "$DATABASES_BACKUP_SUBDIR"
    chown "__LINUX_USER_NAME__:__LINUX_USER_NAME__" "$DATABASES_BACKUP_SUBDIR"
fi

# Copia todos os arquivos .db do diretório databases para o backup
if [ -d "$DATABASES_DIR" ]; then
    DB_COUNT=0
    for db_file in "$DATABASES_DIR"/*.db; do
        if [ -f "$db_file" ]; then
            db_name=$(basename "$db_file")
            cp -Rap "$db_file" "$DATABASES_BACKUP_SUBDIR/$db_name"
            DB_COUNT=$((DB_COUNT + 1))
            echo "Backup criado: $db_name"
        fi
    done
    
    if [ $DB_COUNT -gt 0 ]; then
        INSERT_CUSTOM_LOG "Backup de $DB_COUNT banco(s) SQLite criado em $DATABASES_BACKUP_SUBDIR" "INFO" "$ScriptName"
        echo "Backup de $DB_COUNT banco(s) SQLite criado com sucesso em $DATABASES_BACKUP_SUBDIR"
    else
        echo "Aviso: Nenhum arquivo .db encontrado em $DATABASES_DIR"
    fi
else
    echo "Aviso: Diretório $DATABASES_DIR não encontrado, backup não realizado."
fi

# Remove diretórios de backup mais antigos que 7 dias
echo "Removendo backups de databases antigos (mais de 7 dias)..."
find "$DATABASES_BACKUP_DIR" -type d -name "20*" -mtime +7 -exec rm -rf {} + 2>/dev/null || true

# Log da limpeza
if [ $? -eq 0 ]; then
    echo "Limpeza de backups de databases antigos concluída"
else
    echo "Aviso: Erro durante limpeza de backups de databases antigos"
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
	PROFILE_DIR="__DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/storage_1"
	INSERT_CUSTOM_LOG "PROFILE_DIR: $PROFILE_DIR" "INFO" "$ScriptName"
	rm -rf "$PROFILE_DIR/players.db"
	rm -rf "$PROFILE_DIR/spawnpoints.bin"
	rm -rf "$PROFILE_DIR/data"
	sqlite3 "__APP_VEHICLE_BECO_C1_DB_FILE__" "DELETE FROM vehicles_tracking"
    sqlite3 "__APP_VEHICLE_BECO_C1_DB_FILE__" "DELETE FROM vehicles_attachments"
    sqlite3 "__APP_VEHICLE_BECO_C1_DB_FILE__" "DELETE FROM vehicles_items"
	sqlite3 "__APP_CONTAINER_BECO_C1_DB_FILE__" "DELETE FROM container_items_tracking"
	sqlite3 "__APP_CONTAINER_BECO_C1_DB_FILE__" "DELETE FROM containers_tracking"
	sqlite3 "__APP_STRUCTURE_BECO_C1_DB_FILE__" "DELETE FROM fences_tracking"
	sqlite3 "__APP_STRUCTURE_BECO_C1_DB_FILE__" "DELETE FROM watchtowers_tracking"
	sqlite3 "__APP_STRUCTURE_BECO_C1_DB_FILE__" "DELETE FROM flags_tracking"
    sqlite3 "__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM logs_custom"
    sqlite3 "__APP_SERVER_BECO_C1_LOGS_DB_FILE__" "DELETE FROM logs_adm"
	sqlite3 "__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_damage"
	sqlite3 "__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_killfeed"
	sqlite3 "__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_coord_backup"
	sqlite3 "__APP_PLAYER_BECO_C1_DB_FILE__" "DELETE FROM players_coord"
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
cp "$REPO_DIR/installation/dayz-server/mpmissions/__DAYZ_MPMISSION__/init.c" .
cp -r "$REPO_DIR/installation/dayz-server/mpmissions/__DAYZ_MPMISSION__/admin" .
if [ -d "/tmp/files" ]; then
    cp -a /tmp/files/. ./admin/files/
else
    echo "[INFO] Diretório /tmp/files não encontrado, pulando restauração de arquivos..."
fi
if [ -d "/tmp/loadouts" ]; then
    cp -a /tmp/loadouts/. ./admin/loadouts/
else
    echo "[INFO] Diretório /tmp/loadouts não encontrado, pulando restauração de loadouts..."
fi

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

# Converte lista de dias em inglês abreviado (MON,TUE,...) para nomes em português
convert_days_to_pt() {
    local input="$1"
    local result=""
    local day name_pt

    IFS=',' read -ra days_array <<< "$input"
    for day in "${days_array[@]}"; do
        # Remover espaços em branco
        day="${day//[[:space:]]/}"
        if [[ -z "$day" ]]; then
            continue
        fi

        case "$day" in
            MON) name_pt="Segunda-feira" ;;
            TUE) name_pt="Terça-feira" ;;
            WED) name_pt="Quarta-feira" ;;
            THU) name_pt="Quinta-feira" ;;
            FRI) name_pt="Sexta-feira" ;;
            SAT) name_pt="Sábado" ;;
            SUN) name_pt="Domingo" ;;
            *) name_pt="$day" ;;
        esac

        if [[ -n "$name_pt" ]]; then
            if [[ -n "$result" ]]; then
                result+=", "
            fi
            result+="$name_pt"
        fi
    done

    echo "$result"
}

if [[ "$DayzRaidRulesEnable" == "1" ]]; then
    DAY_ALLOWED=false
    HOUR_ALLOWED=false
    DayzRaidRulesDaysAllowedPT="$(convert_days_to_pt "$DayzRaidRulesDaysAllowed")"
    
    if CHECK_RAID_DAY_ALLOWED "$DayzRaidRulesDaysAllowed"; then
        DAY_ALLOWED=true
        INSERT_CUSTOM_LOG "Dia permitido para raid: $(date +%a)" "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Dia NÃO permitido para raid: $(date +%a). Dias permitidos: $DayzRaidRulesDaysAllowedPT" "INFO" "$ScriptName"
    fi
    
    if CHECK_RAID_HOUR_ALLOWED "$DayzRaidRulesHoursAllowed"; then
        HOUR_ALLOWED=true
        INSERT_CUSTOM_LOG "Horário permitido para raid: $(date +%H:%M). Intervalo: $DayzRaidRulesHoursAllowed" "INFO" "$ScriptName"
    else
        INSERT_CUSTOM_LOG "Horário NÃO permitido para raid: $(date +%H:%M). Intervalo permitido: $DayzRaidRulesHoursAllowed" "INFO" "$ScriptName"
    fi
    if [[ "$DAY_ALLOWED" == "true" ]] && [[ "$HOUR_ALLOWED" == "true" ]]; then
        INSERT_CUSTOM_LOG "Ativando regras de raid (dia e horário permitidos)..." "INFO" "$ScriptName"
        SEND_DISCORD_WEBHOOK "Raid liberado! Dias permitidos: $DayzRaidRulesDaysAllowedPT - Horário permitido: $DayzRaidRulesHoursAllowed" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        sed -i "s/^\s*disableBaseDamage =.*/disableBaseDamage = 0;/" "$CFG_FILE"
    else
        INSERT_CUSTOM_LOG "Regras de raid NÃO ativadas: condições de dia/horário não atendidas" "INFO" "$ScriptName"
        SEND_DISCORD_WEBHOOK "Raid NÃO Permitido! Dias permitidos: $DayzRaidRulesDaysAllowedPT - Horário permitido: $DayzRaidRulesHoursAllowed" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        sed -i "s/^\s*disableBaseDamage =.*/disableBaseDamage = 1;/" "$CFG_FILE"
    fi
fi

chown -R "__LINUX_USER_NAME__:__LINUX_USER_NAME__" __DAYZ_FOLDER__/mpmissions/__DAYZ_MPMISSION__/db/messages.xml 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta admin"

echo "[INFO] Update concluído com sucesso."