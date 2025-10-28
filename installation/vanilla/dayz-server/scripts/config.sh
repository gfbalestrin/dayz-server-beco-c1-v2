#!/bin/bash

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

export AppFolder=$(jq -r '.App.Folder' "$CONFIG_FILE")
export AppPlayerBecoC1DbFile=$(jq -r '.App.PlayerBecoC1DbFile' "$CONFIG_FILE")
export AppServerBecoC1LogsDbFile=$(jq -r '.App.ServerBecoC1LogsDbFile' "$CONFIG_FILE")
export AppDayzItemsDbFile=$(jq -r '.App.DayzItemsDbFile' "$CONFIG_FILE")
export AppScriptUpdatePlayersOnlineFile=$(jq -r '.App.ScriptUpdatePlayersOnlineFile' "$CONFIG_FILE")
export AppScriptExtractPlayersStatsFile=$(jq -r '.App.ScriptExtractPlayersStatsFile' "$CONFIG_FILE")
export AppScriptUpdateGeneralKillfeed=$(jq -r '.App.ScriptUpdateGeneralKillfeed' "$CONFIG_FILE")
export AppScriptGetPlayerDamageFile=$(jq -r '.App.ScriptGetPlayerDamageFile' "$CONFIG_FILE")
export AppScriptPlayerLoadoutManagerFile=$(jq -r '.App.ScriptPlayerLoadoutManagerFile' "$CONFIG_FILE")
export AppScriptWipeFile=$(jq -r '.App.ScriptWipeFile' "$CONFIG_FILE")
export AppUrlAppLoadout=$(jq -r '.App.UrlAppLoadout' "$CONFIG_FILE")

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

INSERT_PLAYER_DATABASE() {
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
INSERT INTO players_database (PlayerID, PlayerName, SteamID, SteamName)
VALUES (
    '$EscapedPlayerID',
    '$EscapedPlayerName',
    '$EscapedSteamID',
    '$EscapedSteamName'
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
UPDATE players_database SET PlayerName = '$EscapedPlayerName', SteamID = '$EscapedSteamID', SteamName = '$EscapedSteamName' WHERE PlayerID = '$EscapedPlayerID';
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
    
    local max_retries=5
    local retry_delay=0.2
    local attempt=1

    if [[ -z "$PlayerID" ]]; then
        echo "Error: PlayerID is required."
        echo ""
        return 1
    fi

    local EscapedPlayerID

    # Escapar aspas simples
    EscapedPlayerID=$(echo "$PlayerID" | sed "s/'/''/g")

    while (( attempt <= max_retries )); do
        local PlayerCoordId=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" <<EOF
INSERT INTO players_coord (PlayerID, CoordX, CoordZ, CoordY, Data)
VALUES (
    '$EscapedPlayerID',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    datetime('now', 'localtime')
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

INSERT_VEHICLE_POSITION() {
    local VehicleId="$1"
    local VehicleName="$2"
    local CoordX="$3"
    local CoordZ="$4"
    local CoordY="$5"
    local CustomTimestamp="$6"  # Parâmetro opcional para timestamp customizado
    
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

    # Escapar aspas simples
    EscapedVehicleId=$(echo "$VehicleId" | sed "s/'/''/g")
    EscapedVehicleName=$(echo "$VehicleName" | sed "s/'/''/g")
    
    # Usar timestamp customizado se fornecido, senão usar datetime atual
    if [[ -n "$CustomTimestamp" ]]; then
        TimestampValue="'$CustomTimestamp'"
    else
        TimestampValue="datetime('now', 'localtime')"
    fi

    while (( attempt <= max_retries )); do
        local VehicleTrackingId=$(sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" <<EOF
INSERT INTO vehicles_tracking (VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp)
VALUES (
    '$EscapedVehicleId',
    '$EscapedVehicleName',
    '$CoordX',
    '$CoordZ',
    '$CoordY',
    $TimestampValue
);
SELECT last_insert_rowid();
EOF
)

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

SEND_DISCORD_WEBHOOK() {
    [[ -z "$DiscordDesactive" || "$DiscordDesactive" -eq 0 ]] || return 0
    local content="$1"
    local webhook_url="$2"
    local current_date="${3:-$(date '+%d/%m/%Y %H:%M:%S')}"
    local source="$4"

    #INSERT_CUSTOM_LOG "Enviando evento para o discord..." "INFO" "$source"

    if [[ -z "$content" || -z "$webhook_url" ]]; then
        INSERT_CUSTOM_LOG "Usage: send_discord_webhook_log <content> <webhook_url> [current_date]" "ERROR" "$source"
        return 1
    fi

    echo $content

    local payload=$(
        cat <<EOF
{ "content": "$current_date - $content" }   
EOF
    )

    # Envia a requisição e captura o código de status HTTP
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -X POST -d "$payload" "$webhook_url")

    # Verifica se foi sucesso (HTTP 200 ou 204)
    if [[ "$http_code" -eq 200 || "$http_code" -eq 204 ]]; then
        echo "✅ Mensagem enviada com sucesso para o Discord."
        #INSERT_CUSTOM_LOG "Enviou evento para o discord!" "INFO" "$source"
    else
        INSERT_CUSTOM_LOG "Falha ao enviar evento para discord! Código HTTP: $http_code" "ERROR" "$source"
    fi
}
