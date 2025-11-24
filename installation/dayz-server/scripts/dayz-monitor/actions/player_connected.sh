#!/bin/bash

handle_player_connected() {
    local line="$1"
    local PlayerId
    PlayerId=$(echo "$line" | jq -r '.player_id')

    echo "Evento de player conectado detectado!"
    INSERT_CUSTOM_LOG "Evento de player conectado detectado!" "INFO" "$ScriptName"
    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
    
    # Registrar evento de conexão
    if [[ -n "$PlayerId" ]] && [[ ${#PlayerId} -eq 44 ]]; then
        local CurrentDate
        CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
        local DetailsJson
        DetailsJson="{\"timestamp\": \"$CurrentDate\"}"
        INSERT_PLAYER_EVENT "$PlayerId" "player_connected" "" "" "" "$DetailsJson" ""
    fi
}

