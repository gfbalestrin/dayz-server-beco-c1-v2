#!/bin/bash

handle_player_disconnected() {
    local line="$1"
    local PlayerId
    PlayerId=$(echo "$line" | jq -r '.player_id')

    echo "Evento de player desconectado detectado!"
    INSERT_CUSTOM_LOG "Evento de player desconectado detectado!" "INFO" "$ScriptName"
    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "DISCONNECT"

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        sleep 3
        sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players set Alive = 0 where UID = '$PlayerId';"
    fi
}

