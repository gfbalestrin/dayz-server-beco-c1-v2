#!/bin/bash

handle_player_connected() {
    local line="$1"
    local PlayerId
    PlayerId=$(echo "$line" | jq -r '.player_id')

    echo "Evento de player conectado detectado!"
    INSERT_CUSTOM_LOG "Evento de player conectado detectado!" "INFO" "$ScriptName"
    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
}

