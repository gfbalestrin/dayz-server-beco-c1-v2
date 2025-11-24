#!/bin/bash

handle_chat_command() {
    local line="$1"
    local content="$2"

    HANDLER_SHOULD_CONTINUE=1

    local PlayerId
    PlayerId=$(echo "$content" | awk -F'id=' '{print $2}' | awk -F')' '{print $1}')
    if [[ -z "$PlayerId" ]]; then
        INSERT_CUSTOM_LOG "Ignorando pois PlayerId está em branco" "INFO" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    local ChatMessage Command CommandName
    ChatMessage="${content##*: }"
    Command="$ChatMessage"
    if [[ "$Command" == "!"* ]]; then
        Command="${Command:1}"
    fi
    CommandName=$(echo "$Command" | awk '{print tolower($1)}')

    if [[ -n "$PlayerId" ]] && [[ ${#PlayerId} -eq 44 ]] && [[ -n "$ChatMessage" ]]; then
        local EscapedMessage EscapedCommandName DetailsJson
        EscapedMessage=$(printf '%s' "$ChatMessage" | sed 's/\\/\\\\/g; s/"/\\"/g')
        EscapedCommandName=$(printf '%s' "$CommandName" | sed 's/\\/\\\\/g; s/"/\\"/g')
        DetailsJson="{\"message\": \"$EscapedMessage\", \"command_name\": \"$EscapedCommandName\"}"
        INSERT_PLAYER_EVENT "$PlayerId" "chat_command" "" "" "" "$DetailsJson" ""
    fi

    if grep -q "$PlayerId" "$DayzServerFolder/$DayzAdminIdsFile"; then
        echo "$PlayerId $Command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        local AllowedCommand=0 Allowed
        for Allowed in help kill votemap nextmap maps votekick players loadouts loadout; do
            if [[ "$CommandName" == "$Allowed" ]]; then
                AllowedCommand=1
                break
            fi
        done

        if [[ "$AllowedCommand" -eq "0" ]]; then
            echo "$PlayerId;[ERROR] Comando indisponível para jogadores" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            HANDLER_SHOULD_CONTINUE=1
            return
        fi

        echo "$PlayerId $Command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        
        HANDLER_SHOULD_CONTINUE=1
        return
    fi
    
}

