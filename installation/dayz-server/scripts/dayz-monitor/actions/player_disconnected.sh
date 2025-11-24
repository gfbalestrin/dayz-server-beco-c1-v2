#!/bin/bash

handle_player_disconnected() {
    local line="$1"
    local PlayerId
    PlayerId=$(echo "$line" | jq -r '.player_id')

    echo "Evento de player desconectado detectado!"
    INSERT_CUSTOM_LOG "Evento de player desconectado detectado!" "INFO" "$ScriptName"
    "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "DISCONNECT"

    # Registrar evento de desconexão
    if [[ -n "$PlayerId" ]] && [[ ${#PlayerId} -eq 44 ]]; then
        local CurrentDate
        CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
        local DetailsJson
        DetailsJson="{\"timestamp\": \"$CurrentDate\"}"
        INSERT_PLAYER_EVENT "$PlayerId" "player_disconnected" "" "" "" "$DetailsJson" ""
    fi

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        sleep 3
        sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players set Alive = 0 where UID = '$PlayerId';"
    fi
}

