#!/bin/bash

GENERATE_RCON_GUID() {
    local SteamID="$1"

    if [[ -z "$SteamID" || "$SteamID" == "null" ]]; then
        echo ""
        return 0
    fi

    if ! [[ "$SteamID" =~ ^[0-9]+$ ]]; then
        echo ""
        return 0
    fi

    local Guid
    Guid=$(
        printf "%016x" "$SteamID" \
        | sed 's/\(..\)/\1 /g' \
        | awk '{for(i=NF;i>0;i--) printf $i}' \
        | sed 's/^/42 45 /' \
        | xxd -r -p \
        | md5sum \
        | awk '{print $1}'
    )

    echo "$Guid"
}

export TZ=America/Sao_Paulo

# Caminho para o arquivo JSON
CONFIG_FILE="./config.json"

# Verifique se o jq está instalado
if ! command -v jq &> /dev/null; then
    echo "Erro: 'jq' não está instalado. Instale com: sudo apt install jq"
    exit 1
fi

# Leitura dos dados usando jq
export DayzServerFolder=$(jq -r '.Dayz.ServerFolder' "$CONFIG_FILE")
export DayzLogAdmFile=$(jq -r '.Dayz.LogAdmFile' "$CONFIG_FILE")
export DayzLogRPTFile=$(jq -r '.Dayz.LogRPTFile' "$CONFIG_FILE")
export DayzPlayerDbFile=$(jq -r '.Dayz.PlayerDbFile' "$CONFIG_FILE")
export DayzMapFolder=$(jq -r '.Dayz.MapFolder' "$CONFIG_FILE")
export DayzAdminIdsFile=$(jq -r '.Dayz.AdminIdsFile' "$CONFIG_FILE")
export DayzAdminCmdsFile=$(jq -r '.Dayz.AdminCmdsFile' "$CONFIG_FILE")
export DayzMessagesToSendoFile=$(jq -r '.Dayz.MessagesToSendoFile' "$CONFIG_FILE")
export DayzMessagesPrivateToSendoFile=$(jq -r '.Dayz.MessagesPrivateToSendoFile' "$CONFIG_FILE")
export DayzActionsToExecuteFile=$(jq -r '.Dayz.ActionsToExecuteFile' "$CONFIG_FILE")
export DayzDeathmatchCoords=$(jq -r '.Dayz.DeathmatchCoords' "$CONFIG_FILE")
export DayzMessagesXmlFile=$(jq -r '.Dayz.MessagesXmlFile' "$CONFIG_FILE")
export DayzDeathmatch=$(jq -r '.Dayz.Deathmatch' "$CONFIG_FILE")
export DayzWipeOnRestart=$(jq -r '.Dayz.WipeOnRestart' "$CONFIG_FILE")
export DayzCloseTestPassword=$(jq -r '.Dayz.CloseTestPassword' "$CONFIG_FILE")
export DayzRConPort=$(jq -r '.Dayz.RConPort' "$CONFIG_FILE")
export DayzRConIP=$(jq -r '.Dayz.RConIP' "$CONFIG_FILE")
export DayzRConPassword=$(jq -r '.Dayz.RConPassword' "$CONFIG_FILE")
export DayzMaxPing=$(jq -r '.Dayz.MaxPing' "$CONFIG_FILE")
export DayzRestrictRCon=$(jq -r '.Dayz.RestrictRCon' "$CONFIG_FILE")
export DayzAutoBanOnDeathEnabled=$(jq -r '.Dayz.AutoBanOnDeath.Enabled // 0' "$CONFIG_FILE")
export DayzAutoBanOnDeathMinutes=$(jq -r '.Dayz.AutoBanOnDeath.BanMinutes // 5' "$CONFIG_FILE")
export DayzRaidRulesEnable=$(jq -r '.Dayz.RaidRules.Enable // 0' "$CONFIG_FILE")
export DayzRaidRulesDaysAllowed=$(jq -r '.Dayz.RaidRules.DaysAllowed // "SAT,SUN"' "$CONFIG_FILE")
export DayzRaidRulesHoursAllowed=$(jq -r '.Dayz.RaidRules.HoursAllowed // "09:00-23:59"' "$CONFIG_FILE")

export AppFolder=$(jq -r '.App.Folder' "$CONFIG_FILE")
export AppPlayerBecoC1DbFile=$(jq -r '.App.PlayerBecoC1DbFile' "$CONFIG_FILE")
export AppServerBecoC1LogsDbFile=$(jq -r '.App.ServerBecoC1LogsDbFile' "$CONFIG_FILE")
export AppVehicleBecoC1DbFile=$(jq -r '.App.VehicleBecoC1DbFile' "$CONFIG_FILE")
export AppContainerBecoC1DbFile=$(jq -r '.App.ContainerBecoC1DbFile' "$CONFIG_FILE")
export AppStructureBecoC1DbFile=$(jq -r '.App.StructureBecoC1DbFile' "$CONFIG_FILE")
export AppDayzItemsDbFile=$(jq -r '.App.DayzItemsDbFile' "$CONFIG_FILE")
export AppScriptUpdatePlayersOnlineFile=$(jq -r '.App.ScriptUpdatePlayersOnlineFile' "$CONFIG_FILE")
export AppScriptExtractPlayersStatsFile=$(jq -r '.App.ScriptExtractPlayersStatsFile' "$CONFIG_FILE")
export AppScriptUpdateGeneralKillfeed=$(jq -r '.App.ScriptUpdateGeneralKillfeed' "$CONFIG_FILE")
export AppScriptGetPlayerDamageFile=$(jq -r '.App.ScriptGetPlayerDamageFile' "$CONFIG_FILE")
export AppScriptPlayerLoadoutManagerFile=$(jq -r '.App.ScriptPlayerLoadoutManagerFile' "$CONFIG_FILE")
export AppUrlAppLoadout=$(jq -r '.App.UrlAppLoadout' "$CONFIG_FILE")
export AppGeoLiteDbFile=$(jq -r '.App.GeoLiteDbFile' "$CONFIG_FILE")
export AppRconBinFile=$(jq -r '.App.RconBinFile' "$CONFIG_FILE")

# Print all variables
# echo "DayzServerFolder: $DayzServerFolder"
# echo "DayzLogAdmFile: $DayzLogAdmFile"
# echo "DayzLogRPTFile: $DayzLogRPTFile"
# echo "DayzPlayerDbFile: $DayzPlayerDbFile"
# echo "DayzAdminIdsFile: $DayzAdminIdsFile"
# echo "DayzAdminCmdsFile: $DayzAdminCmdsFile"
# echo "AppFolder: $AppFolder"
# echo "AppPlayerBecoC1DbFile: $AppPlayerBecoC1DbFile"
# echo "AppServerBecoC1LogsDbFile: $AppServerBecoC1LogsDbFile"
# echo "AppScriptUpdatePlayersOnlineFile: $AppScriptUpdatePlayersOnlineFile"
# echo "AppScriptExtractPlayersStatsFile: $AppScriptExtractPlayersStatsFile"
# echo "AppScriptUpdateGeneralKillfeed: $AppScriptUpdateGeneralKillfeed"

spoof_count=$(jq '.App.SteamIdSpoof | length' "$CONFIG_FILE")
export AppSpoofCount=$spoof_count
for ((i = 0; i < spoof_count; i++)); do
    export AppSpoofFrom_$i=$(jq -r ".App.SteamIdSpoof[$i].From" "$CONFIG_FILE")
    export AppSpoofTo_$i=$(jq -r ".App.SteamIdSpoof[$i].To" "$CONFIG_FILE")
done

export DiscordDesactive=$(jq -r '.Discord.Desactive' "$CONFIG_FILE")
export DiscordWebhookLogs=$(jq -r '.Discord.WebhookLogs' "$CONFIG_FILE")
export DiscordWebhookLogsAdmin=$(jq -r '.Discord.WebhookLogsAdmin' "$CONFIG_FILE")
export DiscordChannelPlayersOnlineChannelId=$(jq -r '.Discord.ChannelPlayersOnline.ChannelId' "$CONFIG_FILE")
export DiscordChannelPlayersOnlineMessageId=$(jq -r '.Discord.ChannelPlayersOnline.MessageId' "$CONFIG_FILE")
export DiscordChannelPlayersOnlineBotToken=$(jq -r '.Discord.ChannelPlayersOnline.BotToken' "$CONFIG_FILE")
export DiscordChannelPlayersStatsChannelId=$(jq -r '.Discord.ChannelPlayersStats.ChannelId' "$CONFIG_FILE")
export DiscordChannelPlayersStatsMessageId=$(jq -r '.Discord.ChannelPlayersStats.MessageId' "$CONFIG_FILE")
export DiscordChannelPlayersStatsBotToken=$(jq -r '.Discord.ChannelPlayersStats.BotToken' "$CONFIG_FILE")


# Função helper para configurar PRAGMAs do SQLite
# Garante WAL mode e busy_timeout adequado para melhor concorrência
configure_sqlite_pragmas() {
    local db_file="$1"
    if [[ -z "$db_file" ]]; then
        echo "Erro: configure_sqlite_pragmas() requer caminho do banco de dados" >&2
        return 1
    fi
    # Configurar PRAGMAs para melhorar concorrência e evitar locks
    # busy_timeout aumentado para 30000ms (30 segundos) para suportar queries longas e múltiplos acessos concorrentes
    sqlite3 "$db_file" "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 30000;" >/dev/null 2>&1
}

INSERT_ADM_LOG() {
    local message="$1"
    local level="${2:-INFO}"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$message" ]]; then
        echo "Error: Log message is required."
        return 1
    fi

    local escaped_message
    local escaped_level

    # Escapar aspas simples
    escaped_message=$(echo "$message" | sed "s/'/''/g")
    escaped_level=$(echo "$level" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
VALUES (
    '$escaped_message',
    '$escaped_level',
    datetime('now', 'localtime')
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert log after $max_retries attempts."
    return 1
}
INSERT_RPT_LOG() {
    local message="$1"
    local level="${2:-INFO}"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$message" ]]; then
        echo "Error: Log message is required."
        return 1
    fi

    local escaped_message
    local escaped_level

    # Escapar aspas simples
    escaped_message=$(echo "$message" | sed "s/'/''/g")
    escaped_level=$(echo "$level" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
INSERT INTO logs_rpt (Message, LogLevel, TimeStamp)
VALUES (
    '$escaped_message',
    '$escaped_level',
    datetime('now', 'localtime')
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert log after $max_retries attempts."
    return 1
}
INSERT_CUSTOM_LOG() {
    local message="$1"
    local level="${2:-INFO}"
    local source="${3:-Script}"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$message" ]]; then
        echo "Error: Log message is required."
        return 1
    fi

    local escaped_message
    local escaped_level
    local escaped_source

    # Escapar aspas simples
    escaped_message=$(echo "$message" | sed "s/'/''/g")
    escaped_level=$(echo "$level" | sed "s/'/''/g")
    escaped_source=$(echo "$source" | sed "s/'/''/g")

    echo $escaped_message

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
VALUES (
    '$escaped_message',
    '$escaped_level',
    '$escaped_source',
    datetime('now', 'localtime')
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert log after $max_retries attempts."
    return 1
}

INSERT_KILLFEED() {
    local PlayerIDKiller="$1"
    local PlayerIDKilled="$2"
    local Weapon="$3"
    local DistanceMeter="$4"
    local Data="$5"
    local PosKiller="$6"
    local PosKilled="$7"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    local escaped_message
    local escaped_level
    local escaped_source

    # Escapar aspas simples
    PlayerIDKiller=$(echo "$PlayerIDKiller" | sed "s/'/''/g")
    PlayerIDKilled=$(echo "$PlayerIDKilled" | sed "s/'/''/g")
    Weapon=$(echo "$Weapon" | sed "s/'/''/g")
    DistanceMeter=$(echo "$DistanceMeter" | sed "s/'/''/g")
    Data=$(echo "$Data" | sed "s/'/''/g")
    PosKiller=$(echo "$PosKiller" | sed "s/'/''/g")
    PosKilled=$(echo "$PosKilled" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_killfeed (PlayerIDKiller, PlayerIDKilled, Weapon, DistanceMeter, Data, PosKiller, PosKilled)
VALUES (
    '$PlayerIDKiller',
    '$PlayerIDKilled',
    '$Weapon',
    '$DistanceMeter',
    '$Data',
    '$PosKiller',
    '$PosKilled'
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert log after $max_retries attempts."
    return 1
}

INSERT_PLAYER_DAMAGE() {
    local PlayerIDAttacker="$1"
    local PlayerIDVictim="$2"
    local PosAttacker="$3"
    local PosVictim="$4"
    local LocalDamage="$5"
    local HitType="$6"
    local Damage="$7"
    local Health="$8"
    local Data="$9"
    local Weapon="${10}"    
    local DistanceMeter="${11}"
    
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    local escaped_message
    local escaped_level
    local escaped_source

    # Escapar aspas simples
    PlayerIDAttacker=$(echo "$PlayerIDAttacker" | sed "s/'/''/g")
    PlayerIDVictim=$(echo "$PlayerIDVictim" | sed "s/'/''/g")
    PosAttacker=$(echo "$PosAttacker" | sed "s/'/''/g")
    PosVictim=$(echo "$PosVictim" | sed "s/'/''/g")
    LocalDamage=$(echo "$LocalDamage" | sed "s/'/''/g")
    HitType=$(echo "$HitType" | sed "s/'/''/g")
    Damage=$(echo "$Damage" | sed "s/'/''/g")
    Health=$(echo "$Health" | sed "s/'/''/g")
    Data=$(echo "$Data" | sed "s/'/''/g")
    Weapon=$(echo "$Weapon" | sed "s/'/''/g")
    DistanceMeter=$(echo "$DistanceMeter" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_damage (PlayerIDAttacker, PlayerIDVictim, PosAttacker, PosVictim, LocalDamage, HitType, Damage, Health, Data, Weapon, DistanceMeter)
VALUES (
    '$PlayerIDAttacker',
    '$PlayerIDVictim',
    '$PosAttacker',
    '$PosVictim',
    '$LocalDamage',
    '$HitType',
    '$Damage',
    '$Health',
    '$Data',
    '$Weapon',
    '$DistanceMeter'
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    return 1
}

INSERT_PLAYER_EVENT() {
    local PlayerID="$1"
    local EventType="$2"
    local CoordX="${3:-}"
    local CoordY="${4:-}"
    local CoordZ="${5:-}"
    local Details="${6:-}"
    local RelatedPlayerID="${7:-}"
    
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]] || [[ -z "$EventType" ]]; then
        echo "Error: PlayerID and EventType are required."
        return 1
    fi

    # Escapar aspas simples
    PlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
    EventType=$(echo "$EventType" | sed "s/'/''/g")
    if [[ -n "$Details" ]]; then
        Details=$(echo "$Details" | sed "s/'/''/g")
    fi
    if [[ -n "$RelatedPlayerID" ]]; then
        RelatedPlayerID=$(echo "$RelatedPlayerID" | sed "s/'/''/g")
    fi

    # Validar coordenadas (devem ser numéricas ou vazias)
    local coord_x_sql coord_y_sql coord_z_sql
    if [[ -n "$CoordX" ]] && [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
        coord_x_sql="$CoordX"
    else
        coord_x_sql="NULL"
    fi
    
    if [[ -n "$CoordY" ]] && [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
        coord_y_sql="$CoordY"
    else
        coord_y_sql="NULL"
    fi
    
    if [[ -n "$CoordZ" ]] && [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
        coord_z_sql="$CoordZ"
    else
        coord_z_sql="NULL"
    fi

    # Preparar SQL para Details e RelatedPlayerID
    local details_sql related_player_sql
    if [[ -n "$Details" ]]; then
        details_sql="'$Details'"
    else
        details_sql="NULL"
    fi
    
    if [[ -n "$RelatedPlayerID" ]]; then
        related_player_sql="'$RelatedPlayerID'"
    else
        related_player_sql="NULL"
    fi

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_events (PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID)
VALUES (
    '$PlayerID',
    '$EventType',
    $coord_x_sql,
    $coord_y_sql,
    $coord_z_sql,
    $details_sql,
    $related_player_sql
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert event after $max_retries attempts."
    return 1
}

INSERT_PLAYER_DATABASE() {
    local PlayerID="$1"
    local PlayerName="${2}"
    local SteamID="${3}"
    local SteamName="${4}"
    local RconGuid="${5}"

    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]]; then
        echo "Error: PlayerID is required."
        return 1
    fi

    if [[ -z "$RconGuid" ]]; then
        RconGuid=$(GENERATE_RCON_GUID "$SteamID")
    fi

    local EscapedPlayerID
    local EscapedPlayerName
    local EscapedSteamID
    local EscapedSteamName
    local EscapedRconGuid

    # Escapar aspas simples
    EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
    EscapedPlayerName=$(echo "$PlayerName" | sed "s/'/''/g")
    EscapedSteamID=$(echo "$SteamID" | sed "s/'/''/g")
    EscapedSteamName=$(echo "$SteamName" | sed "s/'/''/g")
    EscapedRconGuid=$(echo "$RconGuid" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_database (PlayerID, PlayerName, SteamID, SteamName, RconGuid)
VALUES (
    '$EscapedPlayerID',
    '$EscapedPlayerName',
    '$EscapedSteamID',
    '$EscapedSteamName',
    '$EscapedRconGuid'
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    return 1
}

UPDATE_PLAYER_DATABASE() {
    local PlayerID="$1"
    local PlayerName="${2}"
    local SteamID="${3}"
    local SteamName="${4}"
    local RconGuid="${5}"

    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]]; then
        echo "Error: PlayerID is required."
        return 1
    fi

    if [[ -z "$RconGuid" ]]; then
        RconGuid=$(GENERATE_RCON_GUID "$SteamID")
    fi

    local EscapedPlayerID
    local EscapedPlayerName
    local EscapedSteamID
    local EscapedSteamName
    local EscapedRconGuid

    # Escapar aspas simples
    EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
    EscapedPlayerName=$(echo "$PlayerName" | sed "s/'/''/g")
    EscapedSteamID=$(echo "$SteamID" | sed "s/'/''/g")
    EscapedSteamName=$(echo "$SteamName" | sed "s/'/''/g")
    EscapedRconGuid=$(echo "$RconGuid" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
UPDATE players_database
SET PlayerName = '$EscapedPlayerName',
    SteamID = '$EscapedSteamID',
    SteamName = '$EscapedSteamName',
    RconGuid = '$EscapedRconGuid'
WHERE PlayerID = '$EscapedPlayerID';
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to update after $max_retries attempts."
    return 1
}

INSERT_PLAYER_NAME_HISTORY() {
    local PlayerID="$1"
    local PlayerName="${2}"
    local SteamID="${3}"
    local SteamName="${4}"

    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]]; then
        echo "Error: PlayerID is required."
        return 1
    fi

    local EscapedPlayerID
    local EscapedPlayerName
    local EscapedSteamID
    local EscapedSteamName

    # Escapar aspas simples
    EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
    EscapedPlayerName=$(echo "$PlayerName" | sed "s/'/''/g")
    EscapedSteamID=$(echo "$SteamID" | sed "s/'/''/g")
    EscapedSteamName=$(echo "$SteamName" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_name_history (PlayerID, PlayerName, SteamID, SteamName, TimeStamp)
VALUES (
    '$EscapedPlayerID',
    '$EscapedPlayerName',
    '$EscapedSteamID',
    '$EscapedSteamName',
    datetime('now', 'localtime')
);
EOF

        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    return 1
}

DELETE_KILLFEED() {    
    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" "DELETE FROM players_killfeed;"
        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to DELETE after $max_retries attempts."
    return 1
}

DELETE_PLAYER_DAMAGE() {
    while (( attempt <= max_retries )); do
        sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" "DELETE FROM players_damage;"
        if [[ $? -eq 0 ]]; then
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to DELETE after $max_retries attempts."
    return 1
}

INSERT_PLAYER_POSITION() {
    local PlayerID="$1"
    local CoordX="$2"
    local CoordZ="$3"
    local CoordY="$4"
    local Health="$5"
    local Blood="$6"
    local Shock="$7"
    local Energy="$8"
    local Water="$9"
    local IsAlive="${10}"
    local IsAdmin="${11}"
    local Stamina="${12}"
    local StaminaMax="${13}"
    local ItemsInHands="${14}"
    local ItemsCount="${15}"
    local MainItems="${16}"
    
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]]; then
        echo "Error: PlayerID is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs para melhorar concorrência e evitar locks
    configure_sqlite_pragmas "$AppFolder/$AppPlayerBecoC1DbFile"

    local EscapedPlayerID
    local EscapedItemsInHands
    local EscapedMainItems

    # Escapar aspas simples
    EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
    
    # Escapar JSON arrays (já são strings JSON, mas precisam escapar aspas simples para SQL)
    local ItemsInHandsValue
    if [[ -n "$ItemsInHands" ]]; then
        EscapedItemsInHands=$(echo "$ItemsInHands" | sed "s/'/''/g")
        ItemsInHandsValue="'$EscapedItemsInHands'"
    else
        ItemsInHandsValue="NULL"
    fi
    
    local MainItemsValue
    if [[ -n "$MainItems" ]]; then
        EscapedMainItems=$(echo "$MainItems" | sed "s/'/''/g")
        MainItemsValue="'$EscapedMainItems'"
    else
        MainItemsValue="NULL"
    fi
    
    # Converter booleanos para INTEGER (0/1)
    local IsAliveValue
    if [[ "$IsAlive" == "true" ]] || [[ "$IsAlive" == "1" ]]; then
        IsAliveValue="1"
    else
        IsAliveValue="0"
    fi
    
    local IsAdminValue
    if [[ "$IsAdmin" == "true" ]] || [[ "$IsAdmin" == "1" ]]; then
        IsAdminValue="1"
    else
        IsAdminValue="0"
    fi

    while (( attempt <= max_retries )); do
        # Preparar valores para SQL (NULL se vazio, senão usar o valor)
        local HealthValue="${Health:-NULL}"
        local BloodValue="${Blood:-NULL}"
        local ShockValue="${Shock:-NULL}"
        local EnergyValue="${Energy:-NULL}"
        local WaterValue="${Water:-NULL}"
        local StaminaValue="${Stamina:-NULL}"
        local StaminaMaxValue="${StaminaMax:-NULL}"
        local ItemsCountValue="${ItemsCount:-NULL}"
        
        local PlayerCoordId=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_coord (
    PlayerID, CoordX, CoordZ, CoordY, Data,
    Health, Blood, Shock, Energy, Water,
    IsAlive, IsAdmin, Stamina, StaminaMax,
    ItemsInHands, ItemsCount, MainItems
)
VALUES (
    '$EscapedPlayerID',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    datetime('now', 'localtime'),
    $HealthValue,
    $BloodValue,
    $ShockValue,
    $EnergyValue,
    $WaterValue,
    $IsAliveValue,
    $IsAdminValue,
    $StaminaValue,
    $StaminaMaxValue,
    $ItemsInHandsValue,
    $ItemsCountValue,
    $MainItemsValue
);
SELECT last_insert_rowid();
EOF
)

        if [[ $? -eq 0 ]]; then
            echo "$PlayerCoordId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    echo ""
    return 1
}

INSERT_PLAYERS_POSITIONS_BATCH() {
    # Primeiro parâmetro pode ser timestamp base (opcional)
    # Se o primeiro parâmetro parece um timestamp (contém ":" e "-"), usar como base
    # Caso contrário, tratar todos os parâmetros como players_array
    local base_timestamp_param=""
    local players_array=()
    
    if [[ $# -gt 0 ]] && [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
        # Primeiro parâmetro é um timestamp no formato "YYYY-MM-DD HH:MM:SS"
        base_timestamp_param="$1"
        shift
        players_array=("$@")
    else
        # Todos os parâmetros são players
        players_array=("$@")
    fi
    
    if [[ ${#players_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    # Configurar PRAGMAs uma vez (silenciosamente)
    configure_sqlite_pragmas "$AppFolder/$AppPlayerBecoC1DbFile"

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Obter timestamp base (do parâmetro ou atual)
        local base_timestamp
        if [[ -n "$base_timestamp_param" ]]; then
            # Usar timestamp fornecido (momento da captura)
            base_timestamp="$base_timestamp_param"
        else
            # Fallback: usar timestamp atual (comportamento antigo)
            base_timestamp=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime');" 2>/dev/null)
            if [[ -z "$base_timestamp" ]]; then
                base_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
            fi
        fi
        
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        local player_coord_ids=()
        local row_index=0
        
        for player_data in "${players_array[@]}"; do
            if [[ -z "$player_data" ]]; then
                continue
            fi
            
            # Separar campos (formato: "player_id|coord_x|coord_z|coord_y|health|blood|shock|energy|water|is_alive|is_admin|stamina|stamina_max|items_in_hands|items_count|main_items")
            IFS='|' read -r PlayerID CoordX CoordZ CoordY Health Blood Shock Energy Water IsAlive IsAdmin Stamina StaminaMax ItemsInHands ItemsCount MainItems <<< "$player_data"
            
            # Validar campos obrigatórios
            if [[ -z "$PlayerID" ]]; then
                continue
            fi
            
            # Validar coordenadas (devem ser números válidos)
            if [[ -z "$CoordX" ]] || ! [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordX="0"
            fi
            if [[ -z "$CoordZ" ]] || ! [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordZ="0"
            fi
            if [[ -z "$CoordY" ]] || ! [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordY="0"
            fi
            
            # Escapar aspas simples
            local EscapedPlayerID
            EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")
            
            # Escapar JSON arrays
            local ItemsInHandsValue
            if [[ -n "$ItemsInHands" && "$ItemsInHands" != "NULL" && "$ItemsInHands" != "null" && "$ItemsInHands" != "" ]]; then
                local EscapedItemsInHands
                EscapedItemsInHands=$(echo "$ItemsInHands" | sed "s/'/''/g")
                ItemsInHandsValue="'$EscapedItemsInHands'"
            else
                ItemsInHandsValue="NULL"
            fi
            
            local MainItemsValue
            if [[ -n "$MainItems" && "$MainItems" != "NULL" && "$MainItems" != "null" && "$MainItems" != "" ]]; then
                local EscapedMainItems
                EscapedMainItems=$(echo "$MainItems" | sed "s/'/''/g")
                MainItemsValue="'$EscapedMainItems'"
            else
                MainItemsValue="NULL"
            fi
            
            # Converter booleanos para INTEGER (0/1)
            local IsAliveValue
            if [[ "$IsAlive" == "true" ]] || [[ "$IsAlive" == "1" ]]; then
                IsAliveValue="1"
            else
                IsAliveValue="0"
            fi
            
            local IsAdminValue
            if [[ "$IsAdmin" == "true" ]] || [[ "$IsAdmin" == "1" ]]; then
                IsAdminValue="1"
            else
                IsAdminValue="0"
            fi
            
            # Preparar valores para SQL (NULL se vazio ou inválido, senão usar o valor)
            # Validar valores numéricos antes de usar
            local HealthValue
            if [[ -n "$Health" ]] && [[ "$Health" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                HealthValue="$Health"
            else
                HealthValue="NULL"
            fi
            
            local BloodValue
            if [[ -n "$Blood" ]] && [[ "$Blood" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                BloodValue="$Blood"
            else
                BloodValue="NULL"
            fi
            
            local ShockValue
            if [[ -n "$Shock" ]] && [[ "$Shock" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                ShockValue="$Shock"
            else
                ShockValue="NULL"
            fi
            
            local EnergyValue
            if [[ -n "$Energy" ]] && [[ "$Energy" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                EnergyValue="$Energy"
            else
                EnergyValue="NULL"
            fi
            
            local WaterValue
            if [[ -n "$Water" ]] && [[ "$Water" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                WaterValue="$Water"
            else
                WaterValue="NULL"
            fi
            
            local StaminaValue
            if [[ -n "$Stamina" ]] && [[ "$Stamina" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                StaminaValue="$Stamina"
            else
                StaminaValue="NULL"
            fi
            
            local StaminaMaxValue
            if [[ -n "$StaminaMax" ]] && [[ "$StaminaMax" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                StaminaMaxValue="$StaminaMax"
            else
                StaminaMaxValue="NULL"
            fi
            
            local ItemsCountValue
            if [[ -n "$ItemsCount" ]] && [[ "$ItemsCount" =~ ^[0-9]+$ ]]; then
                ItemsCountValue="$ItemsCount"
            else
                ItemsCountValue="NULL"
            fi
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Gerar timestamp único para este registro usando strftime com frações de segundo
            # Usar julianday para adicionar milissegundos incrementais (0.001s por registro)
            # Sempre usar strftime para garantir que milissegundos sejam preservados
            # Se base_timestamp foi fornecido, usar ele; senão usar 'now'
            local timestamp_value
            # Converter milissegundos para fração de dia: row_index * 0.001 / 86400.0
            local days_fraction
            days_fraction=$(awk "BEGIN {printf \"%.10f\", $row_index * 0.001 / 86400.0}")
            if [[ -n "$base_timestamp_param" ]]; then
                # Usar timestamp fornecido + incremento de milissegundos (mesmo para row_index=0 para garantir formato consistente)
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('$base_timestamp') + $days_fraction)"
            else
                # Fallback: usar timestamp atual + incremento
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('now', 'localtime') + $days_fraction)"
            fi
            
            # Construir valor SQL
            sql_values+="('$EscapedPlayerID', '$CoordX', '$CoordZ', '$CoordY', $timestamp_value, $HealthValue, $BloodValue, $ShockValue, $EnergyValue, $WaterValue, $IsAliveValue, $IsAdminValue, $StaminaValue, $StaminaMaxValue, $ItemsInHandsValue, $ItemsCountValue, $MainItemsValue)"
            
            # Incrementar índice para próximo registro
            ((row_index++))
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Construir lista de PlayerIDs para query posterior (manter ordem)
        local player_ids_list=""
        local first_pid=1
        for player_data in "${players_array[@]}"; do
            if [[ -z "$player_data" ]]; then
                continue
            fi
            IFS='|' read -r PlayerID <<< "$player_data"
            if [[ -z "$PlayerID" ]]; then
                continue
            fi
            local EscapedPID
            EscapedPID=$(echo "$PlayerID" | sed "s/'/''/g")
            if [[ $first_pid -eq 0 ]]; then
                player_ids_list+=", "
            fi
            first_pid=0
            player_ids_list+="'$EscapedPID'"
        done
        
        # Executar INSERT em lote
        local sql_error_file
        sql_error_file=$(mktemp)
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF 2>"$sql_error_file"
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO players_coord (
    PlayerID, CoordX, CoordZ, CoordY, Data,
    Health, Blood, Shock, Energy, Water,
    IsAlive, IsAdmin, Stamina, StaminaMax,
    ItemsInHands, ItemsCount, MainItems
)
VALUES $sql_values;
SELECT changes();
SELECT last_insert_rowid();
COMMIT;
EOF
)
        
        local sql_exit_code=$?
        local sql_error
        sql_error=$(cat "$sql_error_file" 2>/dev/null)
        rm -f "$sql_error_file"
        
        # Extrair inserted_count e last_rowid do resultado
        local inserted_count=$(echo "$sql_result" | head -n 1)
        local last_rowid=$(echo "$sql_result" | tail -n 1)
        
        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi
        
        # Validar que last_rowid é um número
        if [[ -z "$last_rowid" ]] || ! [[ "$last_rowid" =~ ^[0-9]+$ ]]; then
            last_rowid="0"
        fi
        
        # Log de debug em caso de erro
        if [[ $sql_exit_code -ne 0 ]] || [[ -n "$sql_error" ]]; then
            echo "INSERT_PLAYERS_POSITIONS_BATCH: Erro SQL (tentativa $attempt/$max_retries): $sql_error" >&2
            if [[ $attempt -lt $max_retries ]]; then
                echo "INSERT_PLAYERS_POSITIONS_BATCH: Tentando novamente..." >&2
            fi
        fi
        
        # Verificar se o INSERT foi bem-sucedido
        if [[ $sql_exit_code -eq 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ $inserted_count -gt 0 ]]; then
            # Buscar PlayerID e PlayerCoordId dos registros recém-inseridos
            # Retornar no formato "PlayerID|PlayerCoordId" para facilitar mapeamento
            local inserted_ids=""
            
            # Método 1: Usar last_insert_rowid() para calcular range de IDs
            local method_used=0
            if [[ "$last_rowid" =~ ^[0-9]+$ ]] && [[ "$last_rowid" -gt 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ "$inserted_count" -gt 0 ]]; then
                local first_rowid=$((last_rowid - inserted_count + 1))
                if [[ $first_rowid -gt 0 ]]; then
                    # Buscar IDs usando range de PlayerCoordId
                    inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerID, PlayerCoordId FROM players_coord WHERE PlayerCoordId >= $first_rowid AND PlayerCoordId <= $last_rowid ORDER BY PlayerCoordId ASC;" 2>/dev/null)
                    
                    if [[ -n "$inserted_ids" ]]; then
                        method_used=1
                    else
                        echo "INSERT_PLAYERS_POSITIONS_BATCH: Método 1 não retornou IDs, usando fallback" >&2
                    fi
                else
                    echo "INSERT_PLAYERS_POSITIONS_BATCH: first_rowid inválido ($first_rowid), usando fallback" >&2
                fi
            else
                echo "INSERT_PLAYERS_POSITIONS_BATCH: last_rowid ou inserted_count inválido (last_rowid=$last_rowid, inserted_count=$inserted_count), usando fallback" >&2
            fi
            
            # Método 2: Fallback - buscar por PlayerIDs com janela de tempo maior (5 segundos)
            if [[ -z "$inserted_ids" ]] && [[ -n "$player_ids_list" ]]; then
                echo "INSERT_PLAYERS_POSITIONS_BATCH: Fallback 1 - Buscando por PlayerIDs" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerID, PlayerCoordId FROM players_coord WHERE PlayerID IN ($player_ids_list) AND Data >= datetime('now', '-5 seconds') ORDER BY PlayerCoordId DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=2
                fi
            fi
            
            # Método 3: Fallback final - buscar últimos N registros sem filtro de tempo
            if [[ -z "$inserted_ids" ]] && [[ -n "$player_ids_list" ]]; then
                echo "INSERT_PLAYERS_POSITIONS_BATCH: Fallback 2 - Buscando últimos registros" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerID, PlayerCoordId FROM players_coord WHERE PlayerID IN ($player_ids_list) ORDER BY PlayerCoordId DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=3
                fi
            fi
            
            # Validar que os IDs retornados correspondem aos PlayerIDs esperados
            # Método 1 não precisa validação (já garantido pelo range)
            if [[ -n "$inserted_ids" ]]; then
                if [[ $method_used -eq 1 ]]; then
                    # Método 1: Não precisa validar, retornar diretamente
                    echo "$inserted_ids"
                else
                    # Métodos 2 e 3: Validar contra lista de PlayerIDs esperados
                    local valid_ids=""
                    local valid_count=0
                    
                    while IFS='|' read -r returned_player_id returned_coord_id; do
                        if [[ -n "$returned_player_id" && -n "$returned_coord_id" ]]; then
                            # Verificar se o PlayerID está na lista esperada
                            local found=false
                            for expected_player_id in "${players_array[@]}"; do
                                IFS='|' read -r expected_id <<< "$expected_player_id"
                                if [[ "$expected_id" == "$returned_player_id" ]]; then
                                    found=true
                                    break
                                fi
                            done
                            
                            if [[ "$found" == true ]]; then
                                if [[ -n "$valid_ids" ]]; then
                                    valid_ids+=$'\n'
                                fi
                                valid_ids+="$returned_player_id|$returned_coord_id"
                                ((valid_count++))
                            fi
                        fi
                    done <<< "$inserted_ids"
                    
                    if [[ $valid_count -gt 0 ]]; then
                        echo "$valid_ids"
                    else
                        echo "INSERT_PLAYERS_POSITIONS_BATCH: Aviso - Nenhum ID válido encontrado após validação" >&2
                    fi
                fi
            else
                echo "INSERT_PLAYERS_POSITIONS_BATCH: Aviso - Não foi possível obter IDs inseridos (INSERT funcionou)" >&2
            fi
            
            # Retornar sucesso mesmo sem IDs (INSERT funcionou)
            return 0
        else
            # INSERT falhou, tentar novamente
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert players positions batch after $max_retries attempts."
    return 1
}

INSERT_VEHICLES_POSITIONS_BATCH() {
    # Primeiro parâmetro pode ser timestamp base (opcional)
    # Se o primeiro parâmetro parece um timestamp (contém ":" e "-"), usar como base
    # Caso contrário, tratar todos os parâmetros como vehicles_array
    local base_timestamp_param=""
    local vehicles_array=()
    
    if [[ $# -gt 0 ]] && [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
        # Primeiro parâmetro é um timestamp no formato "YYYY-MM-DD HH:MM:SS"
        base_timestamp_param="$1"
        shift
        vehicles_array=("$@")
    else
        # Todos os parâmetros são vehicles
        vehicles_array=("$@")
    fi
    
    if [[ ${#vehicles_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    # Configurar PRAGMAs uma vez (silenciosamente)
    configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"

    # Verificar se colunas de saúde existem no banco (fazer uma vez)
    local has_engine_health has_body_health has_fuel_tank_health
    has_engine_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='EngineHealth';" 2>/dev/null)
    has_body_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='BodyHealth';" 2>/dev/null)
    has_fuel_tank_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='FuelTankHealth';" 2>/dev/null)

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Obter timestamp base (do parâmetro ou atual)
        local base_timestamp
        if [[ -n "$base_timestamp_param" ]]; then
            # Usar timestamp fornecido (momento da captura)
            base_timestamp="$base_timestamp_param"
        else
            # Fallback: usar timestamp atual (comportamento antigo)
            base_timestamp=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime');" 2>/dev/null)
            if [[ -z "$base_timestamp" ]]; then
                base_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
            fi
        fi
        
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        local row_index=0
        
        # Construir colunas de saúde dinamicamente
        local HealthColumns=""
        if [[ "$has_engine_health" -eq 1 ]]; then
            HealthColumns=", EngineHealth"
        fi
        if [[ "$has_body_health" -eq 1 ]]; then
            HealthColumns="$HealthColumns, BodyHealth"
        fi
        if [[ "$has_fuel_tank_health" -eq 1 ]]; then
            HealthColumns="$HealthColumns, FuelTankHealth"
        fi
        # Adicionar IsPartialUpdate (sempre 0 para updates completos)
        HealthColumns="$HealthColumns, IsPartialUpdate"
        
        for vehicle_data in "${vehicles_array[@]}"; do
            if [[ -z "$vehicle_data" ]]; then
                continue
            fi
            
            # Separar campos (formato: "vehicle_id|vehicle_name|coord_x|coord_z|coord_y|engine_health|body_health|fuel_tank_health")
            # Usar array para garantir leitura correta mesmo com campos vazios
            IFS='|' read -ra fields <<< "$vehicle_data"
            VehicleId="${fields[0]}"
            VehicleName="${fields[1]}"
            CoordX="${fields[2]}"
            CoordZ="${fields[3]}"
            CoordY="${fields[4]}"
            EngineHealth="${fields[5]}"
            BodyHealth="${fields[6]}"
            FuelTankHealth="${fields[7]}"
            
            # Validar campos obrigatórios
            if [[ -z "$VehicleId" ]]; then
                continue
            fi
            
            # Validar coordenadas (devem ser números válidos)
            if [[ -z "$CoordX" ]] || ! [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordX="0"
            fi
            if [[ -z "$CoordZ" ]] || ! [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordZ="0"
            fi
            if [[ -z "$CoordY" ]] || ! [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordY="0"
            fi
            
            # Escapar aspas simples
            local EscapedVehicleId
            EscapedVehicleId=$(echo "$VehicleId" | sed "s/'/''/g")
            local EscapedVehicleName
            EscapedVehicleName=$(echo "$VehicleName" | sed "s/'/''/g")
            
            # Preparar valores de saúde
            local EngineHealthValue BodyHealthValue FuelTankHealthValue
            if [[ "$has_engine_health" -eq 1 ]]; then
                if [[ -n "$EngineHealth" ]] && [[ "$EngineHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                    EngineHealthValue="$EngineHealth"
                else
                    EngineHealthValue="NULL"
                fi
            fi
            if [[ "$has_body_health" -eq 1 ]]; then
                if [[ -n "$BodyHealth" ]] && [[ "$BodyHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                    BodyHealthValue="$BodyHealth"
                else
                    BodyHealthValue="NULL"
                fi
            fi
            if [[ "$has_fuel_tank_health" -eq 1 ]]; then
                if [[ -n "$FuelTankHealth" ]] && [[ "$FuelTankHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                    FuelTankHealthValue="$FuelTankHealth"
                else
                    FuelTankHealthValue="NULL"
                fi
            fi
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Gerar timestamp único para este registro usando strftime com frações de segundo
            local timestamp_value
            local days_fraction
            days_fraction=$(awk "BEGIN {printf \"%.10f\", $row_index * 0.001 / 86400.0}")
            if [[ -n "$base_timestamp_param" ]]; then
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('$base_timestamp') + $days_fraction)"
            else
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('now', 'localtime') + $days_fraction)"
            fi
            
            # Construir valor SQL
            local health_values=""
            if [[ "$has_engine_health" -eq 1 ]]; then
                health_values=", $EngineHealthValue"
            fi
            if [[ "$has_body_health" -eq 1 ]]; then
                health_values="$health_values, $BodyHealthValue"
            fi
            if [[ "$has_fuel_tank_health" -eq 1 ]]; then
                health_values="$health_values, $FuelTankHealthValue"
            fi
            # Adicionar IsPartialUpdate = 0 (sempre 0 para updates completos)
            health_values="$health_values, 0"
            
            sql_values+="('$EscapedVehicleId', '$EscapedVehicleName', '$CoordX', '$CoordZ', '$CoordY', $timestamp_value$health_values)"
            
            # Incrementar índice para próximo registro
            ((row_index++))
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Construir lista de VehicleIds para query posterior (manter ordem)
        local vehicle_ids_list=""
        local first_vid=1
        for vehicle_data in "${vehicles_array[@]}"; do
            if [[ -z "$vehicle_data" ]]; then
                continue
            fi
            IFS='|' read -r VehicleId <<< "$vehicle_data"
            if [[ -z "$VehicleId" ]]; then
                continue
            fi
            local EscapedVID
            EscapedVID=$(echo "$VehicleId" | sed "s/'/''/g")
            if [[ $first_vid -eq 0 ]]; then
                vehicle_ids_list+=", "
            fi
            first_vid=0
            vehicle_ids_list+="'$EscapedVID'"
        done
        
        # Executar INSERT em lote
        local sql_error_file
        sql_error_file=$(mktemp)
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>"$sql_error_file"
BEGIN DEFERRED TRANSACTION;
INSERT INTO vehicles_tracking (VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp$HealthColumns)
VALUES $sql_values;
SELECT changes();
SELECT last_insert_rowid();
COMMIT;
EOF
)
        
        local sql_exit_code=$?
        local sql_error
        sql_error=$(cat "$sql_error_file" 2>/dev/null)
        rm -f "$sql_error_file"
        
        # Extrair inserted_count e last_rowid do resultado
        local inserted_count=$(echo "$sql_result" | head -n 1)
        local last_rowid=$(echo "$sql_result" | tail -n 1)
        
        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi
        
        # Validar que last_rowid é um número
        if [[ -z "$last_rowid" ]] || ! [[ "$last_rowid" =~ ^[0-9]+$ ]]; then
            last_rowid="0"
        fi
        
        # Log de debug em caso de erro
        if [[ $sql_exit_code -ne 0 ]] || [[ -n "$sql_error" ]]; then
            echo "INSERT_VEHICLES_POSITIONS_BATCH: Erro SQL (tentativa $attempt/$max_retries): $sql_error" >&2
            if [[ $attempt -lt $max_retries ]]; then
                echo "INSERT_VEHICLES_POSITIONS_BATCH: Tentando novamente..." >&2
            fi
        fi
        
        # Verificar se o INSERT foi bem-sucedido
        if [[ $sql_exit_code -eq 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ $inserted_count -gt 0 ]]; then
            # Buscar VehicleId e VehicleTrackingId dos registros recém-inseridos
            # Retornar no formato "VehicleId|VehicleTrackingId" para facilitar mapeamento
            local inserted_ids=""
            
            # Método 1: Usar last_insert_rowid() para calcular range de IDs
            local method_used=0
            if [[ "$last_rowid" =~ ^[0-9]+$ ]] && [[ "$last_rowid" -gt 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ "$inserted_count" -gt 0 ]]; then
                local first_rowid=$((last_rowid - inserted_count + 1))
                if [[ $first_rowid -gt 0 ]]; then
                    # Buscar IDs usando range de VehicleTrackingId
                    inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT VehicleId, IdVehicleTracking FROM vehicles_tracking WHERE IdVehicleTracking >= $first_rowid AND IdVehicleTracking <= $last_rowid ORDER BY IdVehicleTracking ASC;" 2>/dev/null)
                    
                    if [[ -n "$inserted_ids" ]]; then
                        method_used=1
                    else
                        echo "INSERT_VEHICLES_POSITIONS_BATCH: Método 1 não retornou IDs, usando fallback" >&2
                    fi
                else
                    echo "INSERT_VEHICLES_POSITIONS_BATCH: first_rowid inválido ($first_rowid), usando fallback" >&2
                fi
            else
                echo "INSERT_VEHICLES_POSITIONS_BATCH: last_rowid ou inserted_count inválido (last_rowid=$last_rowid, inserted_count=$inserted_count), usando fallback" >&2
            fi
            
            # Método 2: Fallback - buscar por VehicleIds com janela de tempo maior (5 segundos)
            if [[ -z "$inserted_ids" ]] && [[ -n "$vehicle_ids_list" ]]; then
                echo "INSERT_VEHICLES_POSITIONS_BATCH: Fallback 1 - Buscando por VehicleIds" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT VehicleId, IdVehicleTracking FROM vehicles_tracking WHERE VehicleId IN ($vehicle_ids_list) AND TimeStamp >= datetime('now', '-5 seconds') ORDER BY IdVehicleTracking DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=2
                fi
            fi
            
            # Método 3: Fallback final - buscar últimos N registros sem filtro de tempo
            if [[ -z "$inserted_ids" ]] && [[ -n "$vehicle_ids_list" ]]; then
                echo "INSERT_VEHICLES_POSITIONS_BATCH: Fallback 2 - Buscando últimos registros" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT VehicleId, IdVehicleTracking FROM vehicles_tracking WHERE VehicleId IN ($vehicle_ids_list) ORDER BY IdVehicleTracking DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=3
                fi
            fi
            
            # Validar que os IDs retornados correspondem aos VehicleIds esperados
            if [[ -n "$inserted_ids" ]]; then
                if [[ $method_used -eq 1 ]]; then
                    # Método 1: Não precisa validar, retornar diretamente
                    echo "$inserted_ids"
                else
                    # Métodos 2 e 3: Validar contra lista de VehicleIds esperados
                    local valid_ids=""
                    local valid_count=0
                    
                    while IFS='|' read -r returned_vehicle_id returned_tracking_id; do
                        if [[ -n "$returned_vehicle_id" && -n "$returned_tracking_id" ]]; then
                            # Verificar se o VehicleId está na lista esperada
                            local found=false
                            for expected_vehicle_data in "${vehicles_array[@]}"; do
                                IFS='|' read -r expected_id <<< "$expected_vehicle_data"
                                if [[ "$expected_id" == "$returned_vehicle_id" ]]; then
                                    found=true
                                    break
                                fi
                            done
                            
                            if [[ "$found" == true ]]; then
                                if [[ -n "$valid_ids" ]]; then
                                    valid_ids+=$'\n'
                                fi
                                valid_ids+="$returned_vehicle_id|$returned_tracking_id"
                                ((valid_count++))
                            fi
                        fi
                    done <<< "$inserted_ids"
                    
                    if [[ $valid_count -gt 0 ]]; then
                        echo "$valid_ids"
                    else
                        echo "INSERT_VEHICLES_POSITIONS_BATCH: Aviso - Nenhum ID válido encontrado após validação" >&2
                    fi
                fi
            else
                echo "INSERT_VEHICLES_POSITIONS_BATCH: Aviso - Não foi possível obter IDs inseridos (INSERT funcionou)" >&2
            fi
            
            # Retornar sucesso mesmo sem IDs (INSERT funcionou)
            return 0
        else
            # INSERT falhou, tentar novamente
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert vehicles positions batch after $max_retries attempts."
    return 1
}

UPDATE_VEHICLES_POSITIONS_PARTIAL() {
    # Primeiro parâmetro é timestamp base
    # Resto são vehicles_data no formato: "vehicle_id|vehicle_name|coord_x|coord_z|coord_y|||"
    local base_timestamp="$1"
    shift
    local vehicles_data=("$@")
    
    if [[ ${#vehicles_data[@]} -eq 0 ]]; then
        return 0  # Nada para atualizar, retorna sucesso
    fi
    
    # Validar timestamp
    if [[ -z "$base_timestamp" ]]; then
        base_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    fi
    
    # Configurar PRAGMAs
    configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
    
    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1
    
    while (( attempt <= max_retries )); do
        # Construir SQL com múltiplos UPDATEs/INSERTs em transação
        local sql_statements="BEGIN DEFERRED TRANSACTION;"
        local update_count=0
        local insert_count=0
        
        for vehicle_entry in "${vehicles_data[@]}"; do
            if [[ -z "$vehicle_entry" ]]; then
                continue
            fi
            
            # Separar campos (formato: "vehicle_id|vehicle_name|coord_x|coord_z|coord_y|engine_health|body_health|fuel_tank_health")
            # Usar array para garantir leitura correta mesmo com campos vazios
            IFS='|' read -ra fields <<< "$vehicle_entry"
            VehicleId="${fields[0]}"
            VehicleName="${fields[1]}"
            CoordX="${fields[2]}"
            CoordZ="${fields[3]}"
            CoordY="${fields[4]}"
            EngineHealth="${fields[5]}"
            BodyHealth="${fields[6]}"
            FuelTankHealth="${fields[7]}"
            
            # Validar campos obrigatórios
            if [[ -z "$VehicleId" ]]; then
                continue
            fi
            
            # Validar coordenadas
            if [[ -z "$CoordX" ]] || ! [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordX="0"
            fi
            if [[ -z "$CoordZ" ]] || ! [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordZ="0"
            fi
            if [[ -z "$CoordY" ]] || ! [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordY="0"
            fi
            
            # Validar e preparar valores de health
            local EngineHealthValue BodyHealthValue FuelTankHealthValue
            local HealthColumns=""
            local HealthValues=""
            local HealthUpdateSet=""
            
            if [[ -n "$EngineHealth" ]] && [[ "$EngineHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                EngineHealthValue="$EngineHealth"
                HealthColumns=", EngineHealth"
                HealthValues=", $EngineHealthValue"
                HealthUpdateSet=", EngineHealth = $EngineHealthValue"
            fi
            
            if [[ -n "$BodyHealth" ]] && [[ "$BodyHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                BodyHealthValue="$BodyHealth"
                HealthColumns="$HealthColumns, BodyHealth"
                HealthValues="$HealthValues, $BodyHealthValue"
                HealthUpdateSet="$HealthUpdateSet, BodyHealth = $BodyHealthValue"
            fi
            
            if [[ -n "$FuelTankHealth" ]] && [[ "$FuelTankHealth" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                FuelTankHealthValue="$FuelTankHealth"
                HealthColumns="$HealthColumns, FuelTankHealth"
                HealthValues="$HealthValues, $FuelTankHealthValue"
                HealthUpdateSet="$HealthUpdateSet, FuelTankHealth = $FuelTankHealthValue"
            fi
            
            # Escapar aspas simples
            local EscapedVehicleId
            EscapedVehicleId=$(echo "$VehicleId" | sed "s/'/''/g")
            local EscapedVehicleName
            EscapedVehicleName=$(echo "$VehicleName" | sed "s/'/''/g")
            
            # Buscar último VehicleTrackingId para este veículo
            local last_tracking_id
            last_tracking_id=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" \
                "SELECT VehicleTrackingId FROM vehicles_tracking 
                 WHERE VehicleId = '$EscapedVehicleId' 
                 ORDER BY TimeStamp DESC LIMIT 1" 2>/dev/null)
            
            if [[ -n "$last_tracking_id" ]] && [[ "$last_tracking_id" =~ ^[0-9]+$ ]]; then
                # UPDATE do último registro (posição, timestamp, health_parts se disponível, marcar como parcial)
                sql_statements="${sql_statements}
UPDATE vehicles_tracking 
SET PositionX = $CoordX, PositionZ = $CoordZ, PositionY = $CoordY, TimeStamp = '$base_timestamp', IsPartialUpdate = 1${HealthUpdateSet}
WHERE VehicleTrackingId = $last_tracking_id;"
                ((update_count++))
            else
                # Se não existe registro, fazer INSERT básico (com health_parts se disponível, sem items/attachments, marcar como parcial)
                sql_statements="${sql_statements}
INSERT INTO vehicles_tracking (VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp, IsDestroyed, IsPartialUpdate${HealthColumns})
VALUES ('$EscapedVehicleId', '$EscapedVehicleName', $CoordX, $CoordZ, $CoordY, '$base_timestamp', 0, 1${HealthValues});"
                ((insert_count++))
            fi
        done
        
        sql_statements="${sql_statements} COMMIT;"
        
        # Executar SQL
        local sql_error_file
        sql_error_file=$(mktemp)
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>"$sql_error_file"
$sql_statements
EOF
)
        
        local sql_exit_code=$?
        local sql_error
        sql_error=$(cat "$sql_error_file" 2>/dev/null)
        rm -f "$sql_error_file"
        
        # Verificar se foi bem-sucedido
        if [[ $sql_exit_code -eq 0 ]] && [[ -z "$sql_error" ]]; then
            # Sucesso
            return 0
        else
            # Erro, tentar novamente se ainda há tentativas
            if [[ $attempt -lt $max_retries ]]; then
                # Verificar se é erro de lock
                if echo "$sql_error" | grep -q "database is locked"; then
                    # Backoff exponencial: 0.5s, 1s, 2s, 4s
                    local retry_multiplier=1
                    local i
                    for ((i=1; i<attempt; i++)); do
                        retry_multiplier=$((retry_multiplier * 2))
                    done
                    local retry_delay=$((base_retry_delay * retry_multiplier))
                    sleep "$retry_delay"
                else
                    # Erro diferente de lock, não tentar novamente
                    echo "UPDATE_VEHICLES_POSITIONS_PARTIAL: Erro SQL: $sql_error" >&2
                    return 1
                fi
            fi
            attempt=$((attempt + 1))
        fi
    done
    
    echo "Failed to update vehicles positions partial after $max_retries attempts."
    return 1
}

INSERT_VEHICLE_POSITION() {
    local VehicleId="$1"
    local VehicleName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local CustomTimestamp="$6"  # Parâmetro opcional para timestamp customizado
    local EngineHealth="$7"     # Parâmetro opcional para saúde do motor
    local BodyHealth="$8"        # Parâmetro opcional para saúde do corpo
    local FuelTankHealth="$9"    # Parâmetro opcional para saúde do tanque
    
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$VehicleId" ]]; then
        echo "Error: VehicleId is required."
        echo ""
        return 1
    fi

    local EscapedVehicleId
    local EscapedVehicleName
    local TimestampValue
    local HealthColumns=""
    local HealthValues=""

    # Escapar aspas simples
    EscapedVehicleId=$(echo "$VehicleId" | sed "s/'/''/g")
    EscapedVehicleName=$(echo "$VehicleName" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se colunas de saúde existem no banco
    local has_engine_health has_body_health has_fuel_tank_health
    has_engine_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='EngineHealth';")
    has_body_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='BodyHealth';")
    has_fuel_tank_health=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='FuelTankHealth';")

    # Adicionar colunas de saúde se existirem no banco e forem fornecidas
    if [[ "$has_engine_health" -eq 1 ]] && [[ -n "$EngineHealth" ]]; then
        HealthColumns=", EngineHealth"
        HealthValues=", ${EngineHealth:-NULL}"
    fi
    if [[ "$has_body_health" -eq 1 ]] && [[ -n "$BodyHealth" ]]; then
        HealthColumns="$HealthColumns, BodyHealth"
        HealthValues="$HealthValues, ${BodyHealth:-NULL}"
    fi
    if [[ "$has_fuel_tank_health" -eq 1 ]] && [[ -n "$FuelTankHealth" ]]; then
        HealthColumns="$HealthColumns, FuelTankHealth"
        HealthValues="$HealthValues, ${FuelTankHealth:-NULL}"
    fi

    while (( attempt <= max_retries )); do
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        # Executar INSERT e capturar apenas o resultado do SELECT last_insert_rowid()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>/dev/null
INSERT INTO vehicles_tracking (VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp$HealthColumns)
VALUES (
    '$EscapedVehicleId',
    '$EscapedVehicleName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    $TimestampValue$HealthValues
);
SELECT last_insert_rowid();
EOF
)
        local VehicleTrackingId=$(echo "$sql_result" | tail -n 1)

        if [[ $? -eq 0 ]]; then
            echo "$VehicleTrackingId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    echo ""
    return 1
}

INSERT_VEHICLE_ITEM() {
    local VehicleTrackingId="$1"
    local ItemType="$2"
    local ItemHealth="$3"
    local CustomTimestamp="$4"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$VehicleTrackingId" ]] || [[ -z "$ItemType" ]]; then
        echo "Error: VehicleTrackingId and ItemType are required."
        echo ""
        return 1
    fi

    local EscapedItemType
    local TimestampValue

    # Escapar aspas simples
    EscapedItemType=$(echo "$ItemType" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    while (( attempt <= max_retries )); do
        local VehicleItemId=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF
INSERT INTO vehicles_items (VehicleTrackingId, ItemType, ItemHealth, TimeStamp)
VALUES (
    $VehicleTrackingId,
    '$EscapedItemType',
    ${ItemHealth:-NULL},
    $TimestampValue
);
SELECT last_insert_rowid();
EOF
)

        if [[ $? -eq 0 ]] && [[ -n "$VehicleItemId" ]]; then
            echo "$VehicleItemId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))    
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    echo ""
    return 1
}

INSERT_VEHICLE_ATTACHMENT() {
    local VehicleTrackingId="$1"
    local AttachmentType="$2"
    local AttachmentHealth="$3"
    local CustomTimestamp="$4"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$VehicleTrackingId" ]] || [[ -z "$AttachmentType" ]]; then
        echo "Error: VehicleTrackingId and AttachmentType are required."
        echo ""
        return 1
    fi

    local EscapedAttachmentType
    local TimestampValue

    # Escapar aspas simples
    EscapedAttachmentType=$(echo "$AttachmentType" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    while (( attempt <= max_retries )); do
        local VehicleAttachmentId=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF
INSERT INTO vehicles_attachments (VehicleTrackingId, AttachmentType, AttachmentHealth, TimeStamp)
VALUES (
    $VehicleTrackingId,
    '$EscapedAttachmentType',
    ${AttachmentHealth:-NULL},
    $TimestampValue
);
SELECT last_insert_rowid();
EOF
)

        if [[ $? -eq 0 ]] && [[ -n "$VehicleAttachmentId" ]]; then
            echo "$VehicleAttachmentId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))    
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    echo ""
    return 1
}

INSERT_VEHICLE_ATTACHMENTS_BATCH() {
    local VehicleTrackingId="$1"
    local CustomTimestamp="$2"  # Timestamp para todos os attachments
    shift 2
    local attachments_array=("$@")  # Array de attachments no formato "type|health"
    
    if [[ -z "$VehicleTrackingId" ]] || [[ ${#attachments_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        
        for attachment_data in "${attachments_array[@]}"; do
            if [[ -z "$attachment_data" ]]; then
                continue
            fi
            
            # Separar type e health (formato: "type|health" ou apenas "type")
            local attachment_type="${attachment_data%%|*}"
            local attachment_health="${attachment_data#*|}"
            
            # Se não há separador, health está vazio
            if [[ "$attachment_health" == "$attachment_data" ]]; then
                attachment_health=""
            fi
            
            # Validar que o tipo não está vazio
            if [[ -z "$attachment_type" || "$attachment_type" == "empty" || "$attachment_type" == "null" ]]; then
                continue
            fi
            
            # Escapar aspas simples no tipo
            local EscapedAttachmentType
            EscapedAttachmentType=$(echo "$attachment_type" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Construir valor SQL
            if [[ -n "$attachment_health" && "$attachment_health" != "NULL" && "$attachment_health" != "null" && "$attachment_health" != "" ]]; then
                sql_values+="($VehicleTrackingId, '$EscapedAttachmentType', $attachment_health, $TimestampValue)"
            else
                sql_values+="($VehicleTrackingId, '$EscapedAttachmentType', NULL, $TimestampValue)"
            fi
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        # Executar INSERT em lote e capturar apenas o resultado do SELECT changes()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO vehicles_attachments (VehicleTrackingId, AttachmentType, AttachmentHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert attachments batch after $max_retries attempts."
    return 1
}

INSERT_VEHICLE_ITEMS_BATCH() {
    local VehicleTrackingId="$1"
    local CustomTimestamp="$2"  # Timestamp para todos os items
    shift 2
    local items_array=("$@")  # Array de items no formato "type|health"
    
    if [[ -z "$VehicleTrackingId" ]] || [[ ${#items_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        
        for item_data in "${items_array[@]}"; do
            if [[ -z "$item_data" ]]; then
                continue
            fi
            
            # Separar type e health (formato: "type|health" ou apenas "type")
            local item_type="${item_data%%|*}"
            local item_health="${item_data#*|}"
            
            # Se não há separador, health está vazio
            if [[ "$item_health" == "$item_data" ]]; then
                item_health=""
            fi
            
            # Validar que o tipo não está vazio
            if [[ -z "$item_type" || "$item_type" == "empty" || "$item_type" == "null" ]]; then
                continue
            fi
            
            # Escapar aspas simples no tipo
            local EscapedItemType
            EscapedItemType=$(echo "$item_type" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Construir valor SQL
            if [[ -n "$item_health" && "$item_health" != "NULL" && "$item_health" != "null" && "$item_health" != "" ]]; then
                sql_values+="($VehicleTrackingId, '$EscapedItemType', $item_health, $TimestampValue)"
            else
                sql_values+="($VehicleTrackingId, '$EscapedItemType', NULL, $TimestampValue)"
            fi
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        # Executar INSERT em lote e capturar apenas o resultado do SELECT changes()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO vehicles_items (VehicleTrackingId, ItemType, ItemHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert items batch after $max_retries attempts."
    return 1
}

INSERT_ALL_VEHICLES_ITEMS_BATCH() {
    local CustomTimestamp="$1"  # Timestamp para todos os items
    shift
    local items_array=("$@")  # Array de items no formato "VehicleTrackingId|type|health"
    
    if [[ ${#items_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        
        for item_data in "${items_array[@]}"; do
            if [[ -z "$item_data" ]]; then
                continue
            fi
            
            # Separar VehicleTrackingId, type e health (formato: "VehicleTrackingId|type|health" ou "VehicleTrackingId|type")
            local vehicle_tracking_id="${item_data%%|*}"
            local remaining="${item_data#*|}"
            local item_type="${remaining%%|*}"
            local item_health="${remaining#*|}"
            
            # Se não há segundo separador, health está vazio
            if [[ "$item_health" == "$remaining" ]]; then
                item_health=""
            fi
            
            # Validar que VehicleTrackingId e tipo não estão vazios
            if [[ -z "$vehicle_tracking_id" || -z "$item_type" || "$item_type" == "empty" || "$item_type" == "null" ]]; then
                continue
            fi
            
            # Escapar aspas simples no tipo
            local EscapedItemType
            EscapedItemType=$(echo "$item_type" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Construir valor SQL
            if [[ -n "$item_health" && "$item_health" != "NULL" && "$item_health" != "null" && "$item_health" != "" ]]; then
                sql_values+="($vehicle_tracking_id, '$EscapedItemType', $item_health, $TimestampValue)"
            else
                sql_values+="($vehicle_tracking_id, '$EscapedItemType', NULL, $TimestampValue)"
            fi
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        # Executar INSERT em lote e capturar apenas o resultado do SELECT changes()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO vehicles_items (VehicleTrackingId, ItemType, ItemHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert all vehicles items batch after $max_retries attempts."
    return 1
}

INSERT_ALL_VEHICLES_ATTACHMENTS_BATCH() {
    local CustomTimestamp="$1"  # Timestamp para todos os attachments
    shift
    local attachments_array=("$@")  # Array de attachments no formato "VehicleTrackingId|type|health"
    
    if [[ ${#attachments_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        
        for attachment_data in "${attachments_array[@]}"; do
            if [[ -z "$attachment_data" ]]; then
                continue
            fi
            
            # Separar VehicleTrackingId, type e health (formato: "VehicleTrackingId|type|health" ou "VehicleTrackingId|type")
            local vehicle_tracking_id="${attachment_data%%|*}"
            local remaining="${attachment_data#*|}"
            local attachment_type="${remaining%%|*}"
            local attachment_health="${remaining#*|}"
            
            # Se não há segundo separador, health está vazio
            if [[ "$attachment_health" == "$remaining" ]]; then
                attachment_health=""
            fi
            
            # Validar que VehicleTrackingId e tipo não estão vazios
            if [[ -z "$vehicle_tracking_id" || -z "$attachment_type" || "$attachment_type" == "empty" || "$attachment_type" == "null" ]]; then
                continue
            fi
            
            # Escapar aspas simples no tipo
            local EscapedAttachmentType
            EscapedAttachmentType=$(echo "$attachment_type" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Construir valor SQL
            if [[ -n "$attachment_health" && "$attachment_health" != "NULL" && "$attachment_health" != "null" && "$attachment_health" != "" ]]; then
                sql_values+="($vehicle_tracking_id, '$EscapedAttachmentType', $attachment_health, $TimestampValue)"
            else
                sql_values+="($vehicle_tracking_id, '$EscapedAttachmentType', NULL, $TimestampValue)"
            fi
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"
        
        # Executar INSERT em lote e capturar apenas o resultado do SELECT changes()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO vehicles_attachments (VehicleTrackingId, AttachmentType, AttachmentHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert all vehicles attachments batch after $max_retries attempts."
    return 1
}

INSERT_CONTAINER_POSITION() {
    local ContainerId="$1"
    local ContainerName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local CustomTimestamp="$6"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$ContainerId" ]]; then
        echo "Error: ContainerId is required."
        echo ""
        return 1
    fi

    local EscapedContainerId
    local EscapedContainerName
    local TimestampValue

    # Escapar aspas simples
    EscapedContainerId=$(echo "$ContainerId" | sed "s/'/''/g")
    EscapedContainerName=$(echo "$ContainerName" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    while (( attempt <= max_retries )); do
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"
        
        # Executar INSERT e capturar apenas o resultado do SELECT last_insert_rowid()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>/dev/null
INSERT INTO containers_tracking (ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp)
VALUES (
    '$EscapedContainerId',
    '$EscapedContainerName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    $TimestampValue
);
SELECT last_insert_rowid();
EOF
)
        local ContainerTrackingId=$(echo "$sql_result" | tail -n 1)

        if [[ $? -eq 0 ]]; then
            echo "$ContainerTrackingId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))    
        fi
    done

    echo "Failed to insert after $max_retries attempts."
    echo ""
    return 1
}

INSERT_CONTAINERS_POSITIONS_BATCH() {
    # Primeiro parâmetro pode ser timestamp base (opcional)
    # Se o primeiro parâmetro parece um timestamp (contém ":" e "-"), usar como base
    # Caso contrário, tratar todos os parâmetros como containers_array
    local base_timestamp_param=""
    local containers_array=()
    
    if [[ $# -gt 0 ]] && [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2}$ ]]; then
        # Primeiro parâmetro é um timestamp no formato "YYYY-MM-DD HH:MM:SS"
        base_timestamp_param="$1"
        shift
        containers_array=("$@")
    else
        # Todos os parâmetros são containers
        containers_array=("$@")
    fi
    
    if [[ ${#containers_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    # Configurar PRAGMAs uma vez (silenciosamente)
    configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Obter timestamp base (do parâmetro ou atual)
        local base_timestamp
        if [[ -n "$base_timestamp_param" ]]; then
            # Usar timestamp fornecido (momento da captura)
            base_timestamp="$base_timestamp_param"
        else
            # Fallback: usar timestamp atual (comportamento antigo)
            base_timestamp=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" "SELECT strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime');" 2>/dev/null)
            if [[ -z "$base_timestamp" ]]; then
                base_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
            fi
        fi
        
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        local row_index=0
        
        for container_data in "${containers_array[@]}"; do
            if [[ -z "$container_data" ]]; then
                continue
            fi
            
            # Separar campos (formato: "container_id|container_name|coord_x|coord_z|coord_y")
            IFS='|' read -r ContainerId ContainerName CoordX CoordZ CoordY <<< "$container_data"
            
            # Validar campos obrigatórios
            if [[ -z "$ContainerId" ]]; then
                continue
            fi
            
            # Validar coordenadas (devem ser números válidos)
            if [[ -z "$CoordX" ]] || ! [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordX="0"
            fi
            if [[ -z "$CoordZ" ]] || ! [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordZ="0"
            fi
            if [[ -z "$CoordY" ]] || ! [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordY="0"
            fi
            
            # Escapar aspas simples
            local EscapedContainerId
            EscapedContainerId=$(echo "$ContainerId" | sed "s/'/''/g")
            local EscapedContainerName
            EscapedContainerName=$(echo "$ContainerName" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Gerar timestamp único para este registro usando strftime com frações de segundo
            local timestamp_value
            local days_fraction
            days_fraction=$(awk "BEGIN {printf \"%.10f\", $row_index * 0.001 / 86400.0}")
            if [[ -n "$base_timestamp_param" ]]; then
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('$base_timestamp') + $days_fraction)"
            else
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('now', 'localtime') + $days_fraction)"
            fi
            
            # Construir valor SQL (IsPartialUpdate = 0 para inserts completos)
            sql_values+="('$EscapedContainerId', '$EscapedContainerName', '$CoordX', '$CoordZ', '$CoordY', $timestamp_value, 0)"
            
            # Incrementar índice para próximo registro
            ((row_index++))
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Construir lista de ContainerIds para query posterior (manter ordem)
        local container_ids_list=""
        local first_cid=1
        for container_data in "${containers_array[@]}"; do
            if [[ -z "$container_data" ]]; then
                continue
            fi
            IFS='|' read -r ContainerId <<< "$container_data"
            if [[ -z "$ContainerId" ]]; then
                continue
            fi
            local EscapedCID
            EscapedCID=$(echo "$ContainerId" | sed "s/'/''/g")
            if [[ $first_cid -eq 0 ]]; then
                container_ids_list+=", "
            fi
            first_cid=0
            container_ids_list+="'$EscapedCID'"
        done
        
        # Executar INSERT em lote
        local sql_error_file
        sql_error_file=$(mktemp)
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>"$sql_error_file"
BEGIN DEFERRED TRANSACTION;
INSERT INTO containers_tracking (ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp, IsPartialUpdate)
VALUES $sql_values;
SELECT changes();
SELECT last_insert_rowid();
COMMIT;
EOF
)
        
        local sql_exit_code=$?
        local sql_error
        sql_error=$(cat "$sql_error_file" 2>/dev/null)
        rm -f "$sql_error_file"
        
        # Extrair inserted_count e last_rowid do resultado
        local inserted_count=$(echo "$sql_result" | head -n 1)
        local last_rowid=$(echo "$sql_result" | tail -n 1)
        
        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi
        
        # Validar que last_rowid é um número
        if [[ -z "$last_rowid" ]] || ! [[ "$last_rowid" =~ ^[0-9]+$ ]]; then
            last_rowid="0"
        fi
        
        # Log de debug em caso de erro
        if [[ $sql_exit_code -ne 0 ]] || [[ -n "$sql_error" ]]; then
            echo "INSERT_CONTAINERS_POSITIONS_BATCH: Erro SQL (tentativa $attempt/$max_retries): $sql_error" >&2
            if [[ $attempt -lt $max_retries ]]; then
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: Tentando novamente..." >&2
            fi
        fi
        
        # Verificar se o INSERT foi bem-sucedido
        if [[ $sql_exit_code -eq 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ $inserted_count -gt 0 ]]; then
            # Buscar ContainerId e ContainerTrackingId dos registros recém-inseridos
            # Retornar no formato "ContainerId|ContainerTrackingId" para facilitar mapeamento
            local inserted_ids=""
            
            # Método 1: Usar last_insert_rowid() para calcular range de IDs
            local method_used=0
            if [[ "$last_rowid" =~ ^[0-9]+$ ]] && [[ "$last_rowid" -gt 0 ]] && [[ "$inserted_count" =~ ^[0-9]+$ ]] && [[ "$inserted_count" -gt 0 ]]; then
                local first_rowid=$((last_rowid - inserted_count + 1))
                if [[ $first_rowid -gt 0 ]]; then
                    # Buscar IDs usando range de ContainerTrackingId
                    inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppContainerBecoC1DbFile" "SELECT ContainerId, IdContainerTracking FROM containers_tracking WHERE IdContainerTracking >= $first_rowid AND IdContainerTracking <= $last_rowid ORDER BY IdContainerTracking ASC;" 2>/dev/null)
                    
                    if [[ -n "$inserted_ids" ]]; then
                        method_used=1
                    else
                        echo "INSERT_CONTAINERS_POSITIONS_BATCH: Método 1 não retornou IDs, usando fallback" >&2
                    fi
                else
                    echo "INSERT_CONTAINERS_POSITIONS_BATCH: first_rowid inválido ($first_rowid), usando fallback" >&2
                fi
            else
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: last_rowid ou inserted_count inválido (last_rowid=$last_rowid, inserted_count=$inserted_count), usando fallback" >&2
            fi
            
            # Método 2: Fallback - buscar por ContainerIds com janela de tempo maior (5 segundos)
            if [[ -z "$inserted_ids" ]] && [[ -n "$container_ids_list" ]]; then
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: Fallback 1 - Buscando por ContainerIds" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppContainerBecoC1DbFile" "SELECT ContainerId, IdContainerTracking FROM containers_tracking WHERE ContainerId IN ($container_ids_list) AND TimeStamp >= datetime('now', '-5 seconds') ORDER BY IdContainerTracking DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=2
                else
                    echo "INSERT_CONTAINERS_POSITIONS_BATCH: Fallback 1 não retornou IDs, usando fallback 2" >&2
                fi
            fi
            
            # Método 3: Fallback final - buscar últimos N registros ordenados por IdContainerTracking DESC
            if [[ -z "$inserted_ids" ]]; then
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: Fallback 2 - Buscando últimos registros" >&2
                inserted_ids=$(sqlite3 -separator '|' "$AppFolder/$AppContainerBecoC1DbFile" "SELECT ContainerId, IdContainerTracking FROM containers_tracking ORDER BY IdContainerTracking DESC LIMIT $inserted_count;" 2>/dev/null)
                
                if [[ -n "$inserted_ids" ]]; then
                    method_used=3
                else
                    echo "INSERT_CONTAINERS_POSITIONS_BATCH: Fallback 2 também falhou" >&2
                fi
            fi
            
            # Retornar IDs inseridos no formato "ContainerId|ContainerTrackingId" (um por linha)
            if [[ -n "$inserted_ids" ]]; then
                echo "$inserted_ids"
                return 0
            else
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: Não foi possível obter IDs dos containers inseridos (método usado: $method_used)" >&2
                if [[ $attempt -lt $max_retries ]]; then
                    # Backoff exponencial: 0.5s, 1s, 2s, 4s
                    local retry_multiplier=1
                    local i
                    for ((i=1; i<attempt; i++)); do
                        retry_multiplier=$((retry_multiplier * 2))
                    done
                    local retry_delay=$((base_retry_delay * retry_multiplier))
                    sleep "$retry_delay"
                    attempt=$((attempt + 1))
                    continue
                else
                    return 1
                fi
            fi
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
                attempt=$((attempt + 1))
            else
                echo "INSERT_CONTAINERS_POSITIONS_BATCH: Falhou após $max_retries tentativas" >&2
                return 1
            fi
        fi
    done

    echo "INSERT_CONTAINERS_POSITIONS_BATCH: Falhou após $max_retries tentativas"
    return 1
}

UPDATE_CONTAINERS_POSITIONS_PARTIAL() {
    # Primeiro parâmetro é timestamp base
    # Resto são containers_data no formato: "container_id|container_name|coord_x|coord_z|coord_y"
    local base_timestamp="$1"
    shift
    local containers_data=("$@")

    if [[ ${#containers_data[@]} -eq 0 ]]; then
        return 0
    fi

    if [[ -z "$base_timestamp" ]]; then
        base_timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    fi

    configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        local sql_values=""
        local first_value=1
        local row_index=0

        for container_entry in "${containers_data[@]}"; do
            if [[ -z "$container_entry" ]]; then
                continue
            fi

            IFS='|' read -r ContainerId ContainerName CoordX CoordZ CoordY <<< "$container_entry"

            if [[ -z "$ContainerId" ]]; then
                continue
            fi

            if [[ -z "$CoordX" ]] || ! [[ "$CoordX" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordX="0"
            fi
            if [[ -z "$CoordZ" ]] || ! [[ "$CoordZ" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordZ="0"
            fi
            if [[ -z "$CoordY" ]] || ! [[ "$CoordY" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
                CoordY="0"
            fi

            local EscapedContainerId
            EscapedContainerId=$(echo "$ContainerId" | sed "s/'/''/g")
            local EscapedContainerName
            EscapedContainerName=$(echo "$ContainerName" | sed "s/'/''/g")

            local timestamp_value
            local days_fraction
            days_fraction=$(awk "BEGIN {printf \"%.10f\", $row_index * 0.001 / 86400.0}")
            if [[ -n "$base_timestamp" ]]; then
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('$base_timestamp') + $days_fraction)"
            else
                timestamp_value="strftime('%Y-%m-%d %H:%M:%f', julianday('now', 'localtime') + $days_fraction)"
            fi

            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0

            sql_values+="('$EscapedContainerId', '$EscapedContainerName', $CoordX, $CoordZ, $CoordY, $timestamp_value, 1, 0)"
            ((row_index++))
        done

        if [[ -z "$sql_values" ]]; then
            return 0
        fi

        local sql_error_file
        sql_error_file=$(mktemp)
        sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>"$sql_error_file"
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO containers_tracking (ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp, IsPartialUpdate, IsDestroyed)
VALUES $sql_values;
COMMIT;
EOF

        local sql_exit_code=$?
        local sql_error
        sql_error=$(cat "$sql_error_file" 2>/dev/null)
        rm -f "$sql_error_file"

        if [[ $sql_exit_code -eq 0 ]] && [[ -z "$sql_error" ]]; then
            return 0
        fi

        if [[ $attempt -lt $max_retries ]]; then
            if echo "$sql_error" | grep -q "database is locked"; then
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            else
                echo "UPDATE_CONTAINERS_POSITIONS_PARTIAL: Erro SQL: $sql_error" >&2
                return 1
            fi
        fi
        attempt=$((attempt + 1))
    done

    echo "UPDATE_CONTAINERS_POSITIONS_PARTIAL: Falhou após $max_retries tentativas"
    return 1
}


INSERT_CONTAINER_ITEM() {
    local ContainerTrackingId="$1"
    local ItemType="$2"
    local ItemHealth="$3"
    local CustomTimestamp="$4"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$ContainerTrackingId" ]] || [[ -z "$ItemType" ]]; then
        echo "Error: ContainerTrackingId and ItemType are required."
        echo ""
        return 1
    fi

    local EscapedItemType
    local TimestampValue

    # Escapar aspas simples
    EscapedItemType=$(echo "$ItemType" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    while (( attempt <= max_retries )); do
        local ContainerItemTrackingId=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF
INSERT INTO container_items_tracking (ContainerTrackingId, ItemType, ItemHealth, TimeStamp)
VALUES (
    $ContainerTrackingId,
    '$EscapedItemType',
    ${ItemHealth:-NULL},
    $TimestampValue
);
SELECT last_insert_rowid();
EOF
)

        if [[ $? -eq 0 ]] && [[ -n "$ContainerItemTrackingId" ]]; then
            echo "$ContainerItemTrackingId"
            return 0
        else
            echo "Attempt $attempt failed. Retrying in $retry_delay seconds..."
            sleep "$retry_delay"
            attempt=$((attempt + 1))    
        fi
    done

    echo "Failed to insert item after $max_retries attempts."
    echo ""
    return 1
}

INSERT_CONTAINER_ITEMS_BATCH() {
    local ContainerTrackingId="$1"
    local CustomTimestamp="$2"  # Timestamp para todos os items
    shift 2
    local items_array=("$@")  # Array de items no formato "type|health"
    
    if [[ -z "$ContainerTrackingId" ]] || [[ ${#items_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        # Construir query SQL com múltiplos VALUES
        local sql_values=""
        local first_value=1
        
        for item_data in "${items_array[@]}"; do
            if [[ -z "$item_data" ]]; then
                continue
            fi
            
            # Separar type e health (formato: "type|health" ou apenas "type")
            local item_type="${item_data%%|*}"
            local item_health="${item_data#*|}"
            
            # Se não há separador, health está vazio
            if [[ "$item_health" == "$item_data" ]]; then
                item_health=""
            fi
            
            # Validar que o tipo não está vazio
            if [[ -z "$item_type" || "$item_type" == "empty" || "$item_type" == "null" ]]; then
                continue
            fi
            
            # Escapar aspas simples no tipo
            local EscapedItemType
            EscapedItemType=$(echo "$item_type" | sed "s/'/''/g")
            
            # Adicionar vírgula se não for o primeiro valor
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            # Construir valor SQL
            if [[ -n "$item_health" && "$item_health" != "NULL" && "$item_health" != "null" && "$item_health" != "" ]]; then
                sql_values+="($ContainerTrackingId, '$EscapedItemType', $item_health, $TimestampValue)"
            else
                sql_values+="($ContainerTrackingId, '$EscapedItemType', NULL, $TimestampValue)"
            fi
        done
        
        # Se não há valores válidos, retornar sucesso
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        # Configurar PRAGMAs uma vez (silenciosamente)
        configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"
        
        # Executar INSERT em lote e capturar apenas o resultado do SELECT changes()
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO container_items_tracking (ContainerTrackingId, ItemType, ItemHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        # Validar que inserted_count é um número
        if [[ -z "$inserted_count" ]] || ! [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            inserted_count="0"
        fi

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                # Backoff exponencial: 0.5s, 1s, 2s, 4s
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$((base_retry_delay * retry_multiplier))
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert items batch after $max_retries attempts."
    return 1
}

INSERT_ALL_CONTAINERS_ITEMS_BATCH() {
    local CustomTimestamp="$1"  # Timestamp para todos os items
    shift
    local items_array=("$@")  # Array de items no formato "ContainerTrackingId|type|health"
    
    if [[ ${#items_array[@]} -eq 0 ]]; then
        return 0  # Nada para inserir, retorna sucesso
    fi

    local TimestampValue
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local max_retries=5
    local base_retry_delay=0.5
    local attempt=1

    while (( attempt <= max_retries )); do
        local sql_values=""
        local first_value=1
        
        for item_data in "${items_array[@]}"; do
            if [[ -z "$item_data" ]]; then
                continue
            fi
            
            local ContainerTrackingId="${item_data%%|*}"
            local remaining_data="${item_data#*|}"
            local item_type="${remaining_data%%|*}"
            local item_health="${remaining_data#*|}"
            
            if [[ "$item_health" == "$remaining_data" ]]; then
                item_health=""
            fi
            
            if [[ -z "$ContainerTrackingId" || -z "$item_type" || "$item_type" == "empty" || "$item_type" == "null" ]]; then
                continue
            fi
            
            local EscapedItemType
            EscapedItemType=$(echo "$item_type" | sed "s/'/''/g")
            
            if [[ $first_value -eq 0 ]]; then
                sql_values+=", "
            fi
            first_value=0
            
            if [[ -n "$item_health" && "$item_health" != "NULL" && "$item_health" != "null" && "$item_health" != "" ]]; then
                sql_values+="($ContainerTrackingId, '$EscapedItemType', $item_health, $TimestampValue)"
            else
                sql_values+="($ContainerTrackingId, '$EscapedItemType', NULL, $TimestampValue)"
            fi
        done
        
        if [[ -z "$sql_values" ]]; then
            return 0
        fi
        
        configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"
        
        local sql_result
        sql_result=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" <<EOF 2>/dev/null
BEGIN IMMEDIATE TRANSACTION;
INSERT INTO container_items_tracking (ContainerTrackingId, ItemType, ItemHealth, TimeStamp) VALUES $sql_values;
COMMIT;
SELECT changes();
EOF
)
        local inserted_count=$(echo "$sql_result" | tail -n 1)

        if [[ "$inserted_count" =~ ^[0-9]+$ ]]; then
            echo "$inserted_count"
            return 0
        else
            if [[ $attempt -lt $max_retries ]]; then
                local retry_multiplier=1
                local i
                for ((i=1; i<attempt; i++)); do
                    retry_multiplier=$((retry_multiplier * 2))
                done
                local retry_delay=$(awk "BEGIN {printf \"%.1f\", $base_retry_delay * $retry_multiplier}")
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert all containers items batch after $max_retries attempts."
    return 1
}

INSERT_FENCE_POSITION() {
    local FenceId="$1"
    local FenceName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local CustomTimestamp="$6"  # Parâmetro opcional para timestamp customizado
    local HasBase="$7"
    local LowerPanelBuilt="$8"
    local UpperPanelBuilt="$9"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$FenceId" ]]; then
        echo "Error: FenceId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    local EscapedFenceId
    local EscapedFenceName
    local TimestampValue
    local HasBaseValue
    local LowerPanelBuiltValue
    local UpperPanelBuiltValue

    # Escapar aspas simples
    EscapedFenceId=$(echo "$FenceId" | sed "s/'/''/g")
    EscapedFenceName=$(echo "$FenceName" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    if [[ -n "$HasBase" ]]; then
        HasBaseValue="$HasBase"
    else
        HasBaseValue="NULL"
    fi

    if [[ -n "$LowerPanelBuilt" ]]; then
        LowerPanelBuiltValue="$LowerPanelBuilt"
    else
        LowerPanelBuiltValue="NULL"
    fi

    if [[ -n "$UpperPanelBuilt" ]]; then
        UpperPanelBuiltValue="$UpperPanelBuilt"
    else
        UpperPanelBuiltValue="NULL"
    fi

    while (( attempt <= max_retries )); do
        local FenceTrackingId
        FenceTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
INSERT INTO fences_tracking (FenceId, FenceName, PositionX, PositionZ, PositionY, TimeStamp, HasBase, LowerPanelBuilt, UpperPanelBuilt)
VALUES (
    '$EscapedFenceId',
    '$EscapedFenceName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    $TimestampValue,
    $HasBaseValue,
    $LowerPanelBuiltValue,
    $UpperPanelBuiltValue
);
SELECT last_insert_rowid();
EOF
)
        local sql_exit_code=$?

        # Verificar se a inserção foi bem-sucedida
        # sqlite3 retorna 0 em sucesso e o ID, ou erro e mensagem
        if [[ $sql_exit_code -eq 0 && -n "$FenceTrackingId" && "$FenceTrackingId" =~ ^[0-9]+$ ]]; then
            echo "$FenceTrackingId"
            return 0
        else
            # Se for database locked, aumentar delay progressivamente
            if [[ "$FenceTrackingId" == *"database is locked"* ]] || [[ "$FenceTrackingId" == *"locked"* ]]; then
                local progressive_delay=$((retry_delay * attempt))
                # Limitar delay máximo a 2 segundos
                if [[ $progressive_delay -gt 2 ]]; then
                    progressive_delay=2
                fi
                sleep "$progressive_delay"
            else
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert fence after $max_retries attempts."
    echo ""
    return 1
}

UPDATE_FENCE_TIMESTAMP() {
    local FenceId="$1"
    local CustomTimestamp="$2"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$FenceId" ]]; then
        echo "Error: FenceId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    local EscapedFenceId
    local TimestampValue

    # Escapar aspas simples
    EscapedFenceId=$(echo "$FenceId" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('fences_tracking') WHERE name='IsDestroyed';")

    while (( attempt <= max_retries )); do
        local FenceTrackingId
        
        if [[ "$has_is_destroyed" -eq 1 ]]; then
            # Buscar o ID do último registro não-destruído primeiro
            FenceTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT ft.IdFenceTracking
FROM fences_tracking ft
WHERE ft.FenceId = '$EscapedFenceId'
AND (ft.IsDestroyed = 0 OR ft.IsDestroyed IS NULL)
ORDER BY ft.TimeStamp DESC, ft.IdFenceTracking DESC
LIMIT 1;
EOF
)
            
            # Se encontrou um registro, atualizar
            if [[ -n "$FenceTrackingId" && "$FenceTrackingId" =~ ^[0-9]+$ ]]; then
                sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
UPDATE fences_tracking
SET TimeStamp = $TimestampValue
WHERE IdFenceTracking = $FenceTrackingId;
EOF
                local update_exit_code=$?
                if [[ $update_exit_code -eq 0 ]]; then
                    echo "$FenceTrackingId"
                    return 0
                fi
            fi
        else
            # Buscar o ID do último registro primeiro
            FenceTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT ft.IdFenceTracking
FROM fences_tracking ft
WHERE ft.FenceId = '$EscapedFenceId'
ORDER BY ft.TimeStamp DESC, ft.IdFenceTracking DESC
LIMIT 1;
EOF
)
            
            # Se encontrou um registro, atualizar
            if [[ -n "$FenceTrackingId" && "$FenceTrackingId" =~ ^[0-9]+$ ]]; then
                sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
UPDATE fences_tracking
SET TimeStamp = $TimestampValue
WHERE IdFenceTracking = $FenceTrackingId;
EOF
                local update_exit_code=$?
                if [[ $update_exit_code -eq 0 ]]; then
                    echo "$FenceTrackingId"
                    return 0
                fi
            fi
        fi
        
        # Se chegou aqui, a atualização falhou ou não encontrou registro
        # Verificar se foi erro de database locked
        if [[ "$FenceTrackingId" == *"database is locked"* ]] || [[ "$FenceTrackingId" == *"locked"* ]]; then
            local progressive_delay=$((retry_delay * attempt))
            # Limitar delay máximo a 2 segundos
            if [[ $progressive_delay -gt 2 ]]; then
                progressive_delay=2
            fi
            sleep "$progressive_delay"
        else
            sleep "$retry_delay"
        fi
        attempt=$((attempt + 1))
    done

    echo "Failed to update fence timestamp after $max_retries attempts."
    echo ""
    return 1
}

UPDATE_CONTAINER_TIMESTAMP() {
    local ContainerId="$1"
    local CustomTimestamp="$2"  # Parâmetro opcional para timestamp customizado
    local PreferComplete="$3"   # Parâmetro opcional: "true" para preferir registro completo (IsPartialUpdate = 0)
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$ContainerId" ]]; then
        echo "Error: ContainerId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppContainerBecoC1DbFile"

    local EscapedContainerId
    local TimestampValue

    # Escapar aspas simples
    EscapedContainerId=$(echo "$ContainerId" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed';")

    while (( attempt <= max_retries )); do
        local ContainerTrackingId
        local sql_query
        
        # Construir query baseado nas preferências
        if [[ "$PreferComplete" == "true" ]]; then
            # Preferir registro completo (IsPartialUpdate = 0), mas aceitar parcial se não houver completo
            if [[ "$has_is_destroyed" -eq 1 ]]; then
                sql_query="SELECT ct.IdContainerTracking
FROM containers_tracking ct
WHERE ct.ContainerId = '$EscapedContainerId'
AND (ct.IsDestroyed = 0 OR ct.IsDestroyed IS NULL)
ORDER BY 
    CASE WHEN ct.IsPartialUpdate = 0 THEN 0 ELSE 1 END,
    ct.TimeStamp DESC,
    ct.IdContainerTracking DESC
LIMIT 1;"
            else
                sql_query="SELECT ct.IdContainerTracking
FROM containers_tracking ct
WHERE ct.ContainerId = '$EscapedContainerId'
ORDER BY 
    CASE WHEN ct.IsPartialUpdate = 0 THEN 0 ELSE 1 END,
    ct.TimeStamp DESC,
    ct.IdContainerTracking DESC
LIMIT 1;"
            fi
        else
            # Qualquer registro (completo ou parcial), apenas o mais recente
            if [[ "$has_is_destroyed" -eq 1 ]]; then
                sql_query="SELECT ct.IdContainerTracking
FROM containers_tracking ct
WHERE ct.ContainerId = '$EscapedContainerId'
AND (ct.IsDestroyed = 0 OR ct.IsDestroyed IS NULL)
ORDER BY ct.TimeStamp DESC, ct.IdContainerTracking DESC
LIMIT 1;"
            else
                sql_query="SELECT ct.IdContainerTracking
FROM containers_tracking ct
WHERE ct.ContainerId = '$EscapedContainerId'
ORDER BY ct.TimeStamp DESC, ct.IdContainerTracking DESC
LIMIT 1;"
            fi
        fi
        
        ContainerTrackingId=$(sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" 2>&1 <<EOF
$sql_query
EOF
)
        
        # Se encontrou um registro, atualizar
        if [[ -n "$ContainerTrackingId" && "$ContainerTrackingId" =~ ^[0-9]+$ ]]; then
            sqlite3 "$AppFolder/$AppContainerBecoC1DbFile" 2>&1 <<EOF
UPDATE containers_tracking
SET TimeStamp = $TimestampValue
WHERE IdContainerTracking = $ContainerTrackingId;
EOF
            local update_exit_code=$?
            if [[ $update_exit_code -eq 0 ]]; then
                echo "$ContainerTrackingId"
                return 0
            fi
        fi
        
        # Se chegou aqui, a atualização falhou ou não encontrou registro
        # Verificar se foi erro de database locked
        if [[ "$ContainerTrackingId" == *"database is locked"* ]] || [[ "$ContainerTrackingId" == *"locked"* ]]; then
            local progressive_delay=$((retry_delay * attempt))
            # Limitar delay máximo a 2 segundos
            if [[ $progressive_delay -gt 2 ]]; then
                progressive_delay=2
            fi
            sleep "$progressive_delay"
        else
            sleep "$retry_delay"
        fi
        attempt=$((attempt + 1))
    done

    echo "Failed to update container timestamp after $max_retries attempts."
    echo ""
    return 1
}

UPDATE_VEHICLE_TIMESTAMP() {
    local VehicleId="$1"
    local CustomTimestamp="$2"  # Parâmetro opcional para timestamp customizado
    local PreferComplete="$3"   # Parâmetro opcional: "true" para preferir registro completo (IsPartialUpdate = 0)
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$VehicleId" ]]; then
        echo "Error: VehicleId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppVehicleBecoC1DbFile"

    local EscapedVehicleId
    local TimestampValue

    # Escapar aspas simples
    EscapedVehicleId=$(echo "$VehicleId" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed';")

    while (( attempt <= max_retries )); do
        local VehicleTrackingId
        local sql_query
        
        # Construir query baseado nas preferências
        if [[ "$PreferComplete" == "true" ]]; then
            # Preferir registro completo (IsPartialUpdate = 0), mas aceitar parcial se não houver completo
            if [[ "$has_is_destroyed" -eq 1 ]]; then
                sql_query="SELECT vt.IdVehicleTracking
FROM vehicles_tracking vt
WHERE vt.VehicleId = '$EscapedVehicleId'
AND (vt.IsDestroyed = 0 OR vt.IsDestroyed IS NULL)
ORDER BY 
    CASE WHEN vt.IsPartialUpdate = 0 THEN 0 ELSE 1 END,
    vt.TimeStamp DESC,
    vt.IdVehicleTracking DESC
LIMIT 1;"
            else
                sql_query="SELECT vt.IdVehicleTracking
FROM vehicles_tracking vt
WHERE vt.VehicleId = '$EscapedVehicleId'
ORDER BY 
    CASE WHEN vt.IsPartialUpdate = 0 THEN 0 ELSE 1 END,
    vt.TimeStamp DESC,
    vt.IdVehicleTracking DESC
LIMIT 1;"
            fi
        else
            # Qualquer registro (completo ou parcial), apenas o mais recente
            if [[ "$has_is_destroyed" -eq 1 ]]; then
                sql_query="SELECT vt.IdVehicleTracking
FROM vehicles_tracking vt
WHERE vt.VehicleId = '$EscapedVehicleId'
AND (vt.IsDestroyed = 0 OR vt.IsDestroyed IS NULL)
ORDER BY vt.TimeStamp DESC, vt.IdVehicleTracking DESC
LIMIT 1;"
            else
                sql_query="SELECT vt.IdVehicleTracking
FROM vehicles_tracking vt
WHERE vt.VehicleId = '$EscapedVehicleId'
ORDER BY vt.TimeStamp DESC, vt.IdVehicleTracking DESC
LIMIT 1;"
            fi
        fi
        
        VehicleTrackingId=$(sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" 2>&1 <<EOF
$sql_query
EOF
)
        
        # Se encontrou um registro, atualizar
        if [[ -n "$VehicleTrackingId" && "$VehicleTrackingId" =~ ^[0-9]+$ ]]; then
            sqlite3 "$AppFolder/$AppVehicleBecoC1DbFile" 2>&1 <<EOF
UPDATE vehicles_tracking
SET TimeStamp = $TimestampValue
WHERE IdVehicleTracking = $VehicleTrackingId;
EOF
            local update_exit_code=$?
            if [[ $update_exit_code -eq 0 ]]; then
                echo "$VehicleTrackingId"
                return 0
            fi
        fi
        
        # Se chegou aqui, a atualização falhou ou não encontrou registro
        # Verificar se foi erro de database locked
        if [[ "$VehicleTrackingId" == *"database is locked"* ]] || [[ "$VehicleTrackingId" == *"locked"* ]]; then
            local progressive_delay=$((retry_delay * attempt))
            # Limitar delay máximo a 2 segundos
            if [[ $progressive_delay -gt 2 ]]; then
                progressive_delay=2
            fi
            sleep "$progressive_delay"
        else
            sleep "$retry_delay"
        fi
        attempt=$((attempt + 1))
    done

    echo "Failed to update vehicle timestamp after $max_retries attempts."
    echo ""
    return 1
}

UPDATE_WATCHTOWER_TIMESTAMP() {
    local WatchtowerId="$1"
    local CustomTimestamp="$2"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$WatchtowerId" ]]; then
        echo "Error: WatchtowerId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    local EscapedWatchtowerId
    local TimestampValue

    # Escapar aspas simples
    EscapedWatchtowerId=$(echo "$WatchtowerId" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('watchtowers_tracking') WHERE name='IsDestroyed';")

    while (( attempt <= max_retries )); do
        local WatchtowerTrackingId
        
        if [[ "$has_is_destroyed" -eq 1 ]]; then
            # Buscar o ID do último registro não-destruído primeiro
            WatchtowerTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT wt.IdWatchtowerTracking
FROM watchtowers_tracking wt
WHERE wt.WatchtowerId = '$EscapedWatchtowerId'
AND (wt.IsDestroyed = 0 OR wt.IsDestroyed IS NULL)
ORDER BY wt.TimeStamp DESC, wt.IdWatchtowerTracking DESC
LIMIT 1;
EOF
)
        else
            # Buscar o ID do último registro primeiro
            WatchtowerTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT wt.IdWatchtowerTracking
FROM watchtowers_tracking wt
WHERE wt.WatchtowerId = '$EscapedWatchtowerId'
ORDER BY wt.TimeStamp DESC, wt.IdWatchtowerTracking DESC
LIMIT 1;
EOF
)
        fi
        
        # Se encontrou um registro, atualizar
        if [[ -n "$WatchtowerTrackingId" && "$WatchtowerTrackingId" =~ ^[0-9]+$ ]]; then
            sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
UPDATE watchtowers_tracking
SET TimeStamp = $TimestampValue
WHERE IdWatchtowerTracking = $WatchtowerTrackingId;
EOF
            local update_exit_code=$?
            if [[ $update_exit_code -eq 0 ]]; then
                echo "$WatchtowerTrackingId"
                return 0
            fi
        fi
        
        # Se chegou aqui, a atualização falhou ou não encontrou registro
        # Verificar se foi erro de database locked
        if [[ "$WatchtowerTrackingId" == *"database is locked"* ]] || [[ "$WatchtowerTrackingId" == *"locked"* ]]; then
            local progressive_delay=$((retry_delay * attempt))
            # Limitar delay máximo a 2 segundos
            if [[ $progressive_delay -gt 2 ]]; then
                progressive_delay=2
            fi
            sleep "$progressive_delay"
        else
            sleep "$retry_delay"
        fi
        attempt=$((attempt + 1))
    done

    echo "Failed to update watchtower timestamp after $max_retries attempts."
    echo ""
    return 1
}

UPDATE_FLAG_TIMESTAMP() {
    local FlagId="$1"
    local CustomTimestamp="$2"  # Parâmetro opcional para timestamp customizado
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$FlagId" ]]; then
        echo "Error: FlagId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    local EscapedFlagId
    local TimestampValue

    # Escapar aspas simples
    EscapedFlagId=$(echo "$FlagId" | sed "s/'/''/g")

    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    # Verificar se coluna IsDestroyed existe
    local has_is_destroyed
    has_is_destroyed=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" "SELECT COUNT(*) FROM pragma_table_info('flags_tracking') WHERE name='IsDestroyed';")

    while (( attempt <= max_retries )); do
        local FlagTrackingId
        
        if [[ "$has_is_destroyed" -eq 1 ]]; then
            # Buscar o ID do último registro não-destruído primeiro
            FlagTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT ft.FlagTrackingId
FROM flags_tracking ft
WHERE ft.FlagId = '$EscapedFlagId'
AND (ft.IsDestroyed = 0 OR ft.IsDestroyed IS NULL)
ORDER BY ft.TimeStamp DESC, ft.FlagTrackingId DESC
LIMIT 1;
EOF
)
        else
            # Buscar o ID do último registro primeiro
            FlagTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
SELECT ft.FlagTrackingId
FROM flags_tracking ft
WHERE ft.FlagId = '$EscapedFlagId'
ORDER BY ft.TimeStamp DESC, ft.FlagTrackingId DESC
LIMIT 1;
EOF
)
        fi
        
        # Se encontrou um registro, atualizar
        if [[ -n "$FlagTrackingId" && "$FlagTrackingId" =~ ^[0-9]+$ ]]; then
            sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
UPDATE flags_tracking
SET TimeStamp = $TimestampValue
WHERE FlagTrackingId = $FlagTrackingId;
EOF
            local update_exit_code=$?
            if [[ $update_exit_code -eq 0 ]]; then
                echo "$FlagTrackingId"
                return 0
            fi
        fi
        
        # Se chegou aqui, a atualização falhou ou não encontrou registro
        # Verificar se foi erro de database locked
        if [[ "$FlagTrackingId" == *"database is locked"* ]] || [[ "$FlagTrackingId" == *"locked"* ]]; then
            local progressive_delay=$((retry_delay * attempt))
            # Limitar delay máximo a 2 segundos
            if [[ $progressive_delay -gt 2 ]]; then
                progressive_delay=2
            fi
            sleep "$progressive_delay"
        else
            sleep "$retry_delay"
        fi
        attempt=$((attempt + 1))
    done

    echo "Failed to update flag timestamp after $max_retries attempts."
    echo ""
    return 1
}

INSERT_WATCHTOWER_POSITION() {
    local WatchtowerId="$1"
    local WatchtowerName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local OriX="$6"
    local OriY="$7"
    local OriZ="$8"
    local CustomTimestamp="$9"
    local HasBase="${10}"
    local Level1Base="${11}"
    local Level2Base="${12}"
    local Level3Base="${13}"
    local Level1Stairs="${14}"
    local Level2Stairs="${15}"
    local HasRoof="${16}"
    local Level1Wall1Lower="${17}"
    local Level1Wall1Upper="${18}"
    local Level1Wall2Lower="${19}"
    local Level1Wall2Upper="${20}"
    local Level1Wall3Lower="${21}"
    local Level1Wall3Upper="${22}"
    local Level2Wall1Lower="${23}"
    local Level2Wall1Upper="${24}"
    local Level2Wall2Lower="${25}"
    local Level2Wall2Upper="${26}"
    local Level2Wall3Lower="${27}"
    local Level2Wall3Upper="${28}"
    local Level3Wall1Lower="${29}"
    local Level3Wall1Upper="${30}"
    local Level3Wall2Lower="${31}"
    local Level3Wall2Upper="${32}"
    local Level3Wall3Lower="${33}"
    local Level3Wall3Upper="${34}"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$WatchtowerId" ]]; then
        echo "Error: WatchtowerId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" <<'EOF'
CREATE TABLE IF NOT EXISTS watchtowers_tracking (
    WatchtowerTrackingId INTEGER PRIMARY KEY AUTOINCREMENT,
    WatchtowerId TEXT NOT NULL,
    WatchtowerName TEXT,
    PositionX REAL,
    PositionZ REAL,
    PositionY REAL,
    OrientationX REAL,
    OrientationY REAL,
    OrientationZ REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    HasBase INTEGER,
    Level1BaseBuilt INTEGER,
    Level2BaseBuilt INTEGER,
    Level3BaseBuilt INTEGER,
    Level1StairsBuilt INTEGER,
    Level2StairsBuilt INTEGER,
    HasRoof INTEGER,
    Level1Wall1LowerBuilt INTEGER,
    Level1Wall1UpperBuilt INTEGER,
    Level1Wall2LowerBuilt INTEGER,
    Level1Wall2UpperBuilt INTEGER,
    Level1Wall3LowerBuilt INTEGER,
    Level1Wall3UpperBuilt INTEGER,
    Level2Wall1LowerBuilt INTEGER,
    Level2Wall1UpperBuilt INTEGER,
    Level2Wall2LowerBuilt INTEGER,
    Level2Wall2UpperBuilt INTEGER,
    Level2Wall3LowerBuilt INTEGER,
    Level2Wall3UpperBuilt INTEGER,
    Level3Wall1LowerBuilt INTEGER,
    Level3Wall1UpperBuilt INTEGER,
    Level3Wall2LowerBuilt INTEGER,
    Level3Wall2UpperBuilt INTEGER,
    Level3Wall3LowerBuilt INTEGER,
    Level3Wall3UpperBuilt INTEGER,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME
);
CREATE INDEX IF NOT EXISTS idx_watchtowers_tracking_watchtower_id ON watchtowers_tracking(WatchtowerId);
CREATE INDEX IF NOT EXISTS idx_watchtowers_tracking_timestamp ON watchtowers_tracking(TimeStamp);
EOF

    local EscapedWatchtowerId
    local EscapedWatchtowerName
    local TimestampValue

    EscapedWatchtowerId=$(echo "$WatchtowerId" | sed "s/'/''/g")
    EscapedWatchtowerName=$(echo "$WatchtowerName" | sed "s/'/''/g")

    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local HasBaseValue Level1BaseValue Level2BaseValue Level3BaseValue
    local Level1StairsValue Level2StairsValue HasRoofValue
    local Level1Wall1LowerValue Level1Wall1UpperValue Level1Wall2LowerValue Level1Wall2UpperValue
    local Level1Wall3LowerValue Level1Wall3UpperValue Level2Wall1LowerValue Level2Wall1UpperValue
    local Level2Wall2LowerValue Level2Wall2UpperValue Level2Wall3LowerValue Level2Wall3UpperValue
    local Level3Wall1LowerValue Level3Wall1UpperValue Level3Wall2LowerValue Level3Wall2UpperValue
    local Level3Wall3LowerValue Level3Wall3UpperValue

    if [[ -n "$HasBase" ]]; then HasBaseValue="$HasBase"; else HasBaseValue="NULL"; fi
    if [[ -n "$Level1Base" ]]; then Level1BaseValue="$Level1Base"; else Level1BaseValue="NULL"; fi
    if [[ -n "$Level2Base" ]]; then Level2BaseValue="$Level2Base"; else Level2BaseValue="NULL"; fi
    if [[ -n "$Level3Base" ]]; then Level3BaseValue="$Level3Base"; else Level3BaseValue="NULL"; fi
    if [[ -n "$Level1Stairs" ]]; then Level1StairsValue="$Level1Stairs"; else Level1StairsValue="NULL"; fi
    if [[ -n "$Level2Stairs" ]]; then Level2StairsValue="$Level2Stairs"; else Level2StairsValue="NULL"; fi
    if [[ -n "$HasRoof" ]]; then HasRoofValue="$HasRoof"; else HasRoofValue="NULL"; fi
    if [[ -n "$Level1Wall1Lower" ]]; then Level1Wall1LowerValue="$Level1Wall1Lower"; else Level1Wall1LowerValue="NULL"; fi
    if [[ -n "$Level1Wall1Upper" ]]; then Level1Wall1UpperValue="$Level1Wall1Upper"; else Level1Wall1UpperValue="NULL"; fi
    if [[ -n "$Level1Wall2Lower" ]]; then Level1Wall2LowerValue="$Level1Wall2Lower"; else Level1Wall2LowerValue="NULL"; fi
    if [[ -n "$Level1Wall2Upper" ]]; then Level1Wall2UpperValue="$Level1Wall2Upper"; else Level1Wall2UpperValue="NULL"; fi
    if [[ -n "$Level1Wall3Lower" ]]; then Level1Wall3LowerValue="$Level1Wall3Lower"; else Level1Wall3LowerValue="NULL"; fi
    if [[ -n "$Level1Wall3Upper" ]]; then Level1Wall3UpperValue="$Level1Wall3Upper"; else Level1Wall3UpperValue="NULL"; fi
    if [[ -n "$Level2Wall1Lower" ]]; then Level2Wall1LowerValue="$Level2Wall1Lower"; else Level2Wall1LowerValue="NULL"; fi
    if [[ -n "$Level2Wall1Upper" ]]; then Level2Wall1UpperValue="$Level2Wall1Upper"; else Level2Wall1UpperValue="NULL"; fi
    if [[ -n "$Level2Wall2Lower" ]]; then Level2Wall2LowerValue="$Level2Wall2Lower"; else Level2Wall2LowerValue="NULL"; fi
    if [[ -n "$Level2Wall2Upper" ]]; then Level2Wall2UpperValue="$Level2Wall2Upper"; else Level2Wall2UpperValue="NULL"; fi
    if [[ -n "$Level2Wall3Lower" ]]; then Level2Wall3LowerValue="$Level2Wall3Lower"; else Level2Wall3LowerValue="NULL"; fi
    if [[ -n "$Level2Wall3Upper" ]]; then Level2Wall3UpperValue="$Level2Wall3Upper"; else Level2Wall3UpperValue="NULL"; fi
    if [[ -n "$Level3Wall1Lower" ]]; then Level3Wall1LowerValue="$Level3Wall1Lower"; else Level3Wall1LowerValue="NULL"; fi
    if [[ -n "$Level3Wall1Upper" ]]; then Level3Wall1UpperValue="$Level3Wall1Upper"; else Level3Wall1UpperValue="NULL"; fi
    if [[ -n "$Level3Wall2Lower" ]]; then Level3Wall2LowerValue="$Level3Wall2Lower"; else Level3Wall2LowerValue="NULL"; fi
    if [[ -n "$Level3Wall2Upper" ]]; then Level3Wall2UpperValue="$Level3Wall2Upper"; else Level3Wall2UpperValue="NULL"; fi
    if [[ -n "$Level3Wall3Lower" ]]; then Level3Wall3LowerValue="$Level3Wall3Lower"; else Level3Wall3LowerValue="NULL"; fi
    if [[ -n "$Level3Wall3Upper" ]]; then Level3Wall3UpperValue="$Level3Wall3Upper"; else Level3Wall3UpperValue="NULL"; fi

    while (( attempt <= max_retries )); do
        local WatchtowerTrackingId
        local sql_error
        WatchtowerTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
INSERT INTO watchtowers_tracking (
    WatchtowerId,
    WatchtowerName,
    PositionX,
    PositionZ,
    PositionY,
    OrientationX,
    OrientationY,
    OrientationZ,
    TimeStamp,
    HasBase,
    Level1BaseBuilt,
    Level2BaseBuilt,
    Level3BaseBuilt,
    Level1StairsBuilt,
    Level2StairsBuilt,
    HasRoof,
    Level1Wall1LowerBuilt,
    Level1Wall1UpperBuilt,
    Level1Wall2LowerBuilt,
    Level1Wall2UpperBuilt,
    Level1Wall3LowerBuilt,
    Level1Wall3UpperBuilt,
    Level2Wall1LowerBuilt,
    Level2Wall1UpperBuilt,
    Level2Wall2LowerBuilt,
    Level2Wall2UpperBuilt,
    Level2Wall3LowerBuilt,
    Level2Wall3UpperBuilt,
    Level3Wall1LowerBuilt,
    Level3Wall1UpperBuilt,
    Level3Wall2LowerBuilt,
    Level3Wall2UpperBuilt,
    Level3Wall3LowerBuilt,
    Level3Wall3UpperBuilt
)
VALUES (
    '$EscapedWatchtowerId',
    '$EscapedWatchtowerName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    '$OriX',
    '$OriY',
    '$OriZ',
    $TimestampValue,
    $HasBaseValue,
    $Level1BaseValue,
    $Level2BaseValue,
    $Level3BaseValue,
    $Level1StairsValue,
    $Level2StairsValue,
    $HasRoofValue,
    $Level1Wall1LowerValue,
    $Level1Wall1UpperValue,
    $Level1Wall2LowerValue,
    $Level1Wall2UpperValue,
    $Level1Wall3LowerValue,
    $Level1Wall3UpperValue,
    $Level2Wall1LowerValue,
    $Level2Wall1UpperValue,
    $Level2Wall2LowerValue,
    $Level2Wall2UpperValue,
    $Level2Wall3LowerValue,
    $Level2Wall3UpperValue,
    $Level3Wall1LowerValue,
    $Level3Wall1UpperValue,
    $Level3Wall2LowerValue,
    $Level3Wall2UpperValue,
    $Level3Wall3LowerValue,
    $Level3Wall3UpperValue
);
SELECT last_insert_rowid();
EOF
)
        local sql_exit_code=$?

        # Verificar se a inserção foi bem-sucedida
        # sqlite3 retorna 0 em sucesso e o ID, ou erro e mensagem
        if [[ $sql_exit_code -eq 0 && -n "$WatchtowerTrackingId" && "$WatchtowerTrackingId" =~ ^[0-9]+$ ]]; then
            echo "$WatchtowerTrackingId"
            return 0
        else
            # Se for database locked, aumentar delay progressivamente
            if [[ "$WatchtowerTrackingId" == *"database is locked"* ]] || [[ "$WatchtowerTrackingId" == *"locked"* ]]; then
                local progressive_delay=$((retry_delay * attempt))
                # Limitar delay máximo a 2 segundos
                if [[ $progressive_delay -gt 2 ]]; then
                    progressive_delay=2
                fi
                sleep "$progressive_delay"
            else
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert watchtower after $max_retries attempts."
    echo ""
    return 1
}

INSERT_FLAG_POSITION() {
    local FlagId="$1"
    local FlagName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local OriX="$6"
    local OriY="$7"
    local OriZ="$8"
    local CustomTimestamp="$9"
    local HasBase="${10}"
    local HasFlagBase="${11}"
    local FlagRaised="${12}"
    local FlagHeight="${13}"
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$FlagId" ]]; then
        echo "Error: FlagId is required."
        echo ""
        return 1
    fi

    # Configurar PRAGMAs do SQLite para melhorar concorrência
    configure_sqlite_pragmas "$AppFolder/$AppStructureBecoC1DbFile"

    sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" <<'EOF'
CREATE TABLE IF NOT EXISTS flags_tracking (
    FlagTrackingId INTEGER PRIMARY KEY AUTOINCREMENT,
    FlagId TEXT NOT NULL,
    FlagName TEXT,
    PositionX REAL,
    PositionZ REAL,
    PositionY REAL,
    OrientationX REAL,
    OrientationY REAL,
    OrientationZ REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    HasBase INTEGER,
    HasFlagBase INTEGER,
    FlagRaised INTEGER,
    FlagHeight REAL,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME
);
CREATE INDEX IF NOT EXISTS idx_flags_tracking_flag_id ON flags_tracking(FlagId);
CREATE INDEX IF NOT EXISTS idx_flags_tracking_timestamp ON flags_tracking(TimeStamp);
EOF

    local EscapedFlagId
    local EscapedFlagName
    local TimestampValue

    EscapedFlagId=$(echo "$FlagId" | sed "s/'/''/g")
    EscapedFlagName=$(echo "$FlagName" | sed "s/'/''/g")

    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    local HasBaseValue
    local HasFlagBaseValue
    local FlagRaisedValue
    local FlagHeightValue

    if [[ -n "$HasBase" ]]; then HasBaseValue="$HasBase"; else HasBaseValue="NULL"; fi
    if [[ -n "$HasFlagBase" ]]; then HasFlagBaseValue="$HasFlagBase"; else HasFlagBaseValue="NULL"; fi
    if [[ -n "$FlagRaised" ]]; then FlagRaisedValue="$FlagRaised"; else FlagRaisedValue="NULL"; fi
    if [[ -n "$FlagHeight" ]]; then FlagHeightValue="$FlagHeight"; else FlagHeightValue="NULL"; fi

    while (( attempt <= max_retries )); do
        local FlagTrackingId
        FlagTrackingId=$(sqlite3 "$AppFolder/$AppStructureBecoC1DbFile" 2>&1 <<EOF
INSERT INTO flags_tracking (
    FlagId,
    FlagName,
    PositionX,
    PositionZ,
    PositionY,
    OrientationX,
    OrientationY,
    OrientationZ,
    TimeStamp,
    HasBase,
    HasFlagBase,
    FlagRaised,
    FlagHeight
)
VALUES (
    '$EscapedFlagId',
    '$EscapedFlagName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    '$OriX',
    '$OriY',
    '$OriZ',
    $TimestampValue,
    $HasBaseValue,
    $HasFlagBaseValue,
    $FlagRaisedValue,
    $FlagHeightValue
);
SELECT last_insert_rowid();
EOF
)
        local sql_exit_code=$?

        # Verificar se a inserção foi bem-sucedida
        # sqlite3 retorna 0 em sucesso e o ID, ou erro e mensagem
        if [[ $sql_exit_code -eq 0 && -n "$FlagTrackingId" && "$FlagTrackingId" =~ ^[0-9]+$ ]]; then
            echo "$FlagTrackingId"
            return 0
        else
            # Se for database locked, aumentar delay progressivamente
            if [[ "$FlagTrackingId" == *"database is locked"* ]] || [[ "$FlagTrackingId" == *"locked"* ]]; then
                local progressive_delay=$((retry_delay * attempt))
                # Limitar delay máximo a 2 segundos
                if [[ $progressive_delay -gt 2 ]]; then
                    progressive_delay=2
                fi
                sleep "$progressive_delay"
            else
                sleep "$retry_delay"
            fi
            attempt=$((attempt + 1))
        fi
    done

    echo "Failed to insert flag after $max_retries attempts."
    echo ""
    return 1
}

GET_DAYZ_PLAYER_POSITION(){
    local PlayerID="$1"
    local player=$(sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "SELECT hex(Data) FROM Players where UID = '$PlayerId';")    
    local length=${#player}
    local float=0

    local bytes_dbversion=${player:0:4}

    local hex_position_x=${player:4:8}
    local float_position_x=$(echo $hex_position_x | xxd -r -p | od -An -t fF | tr -d ' ')

    local hex_position_z=${player:12:8}
    local float_position_z=$(echo $hex_position_z | xxd -r -p | od -An -t fF | tr -d ' ')

    local hex_position_y=${player:20:8}
    local float_position_y=$(echo $hex_position_y | xxd -r -p | od -An -t fF | tr -d ' ')

    echo "$float_position_x;$float_position_z;$float_position_y"
}

GET_DAYZ_PLAYER_DATA(){
    local PlayerID="$1"
    local player=$(sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "SELECT hex(Data) FROM Players where UID = '$PlayerId';")
    echo "$player"
}

sanitize_discord_markdown() {
    local input="$1"
    echo "$input" | tr -d '\n\r' | sed -e 's/[*_~`|]/\\&/g' -e 's/[][\()<>]/\\&/g' -e 's/["\\]/\\&/g'
}

SEND_DISCORD_WEBHOOK() {
    [[ -z "$DiscordDesactive" || "$DiscordDesactive" -eq 0 ]] || return 0
    local content="$1"
    local webhook_url="$2"
    local current_date="${3:-$(date '+%d/%m/%Y %H:%M:%S')}"
    local source="$4"

    if [[ -z "$content" || -z "$webhook_url" ]]; then
        INSERT_CUSTOM_LOG "Usage: send_discord_webhook_log <content> <webhook_url> [current_date]" "ERROR" "$source"
        return 1
    fi

    local escaped_message="$current_date - $content"
    local payload
    payload=$(jq -cn --arg content "$escaped_message" '{content: $content}')

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -X POST -d "$payload" "$webhook_url")

    if [[ "$http_code" -eq 200 || "$http_code" -eq 204 ]]; then
        echo "✅ Mensagem enviada com sucesso para o Discord."
    else
        INSERT_CUSTOM_LOG "Falha ao enviar evento para discord! Código HTTP: $http_code" "ERROR" "$source"
    fi
}
