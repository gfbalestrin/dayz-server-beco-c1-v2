#!/bin/bash

handle_death_event() {
    local line="$1"
    local content="$2"

    local UpdatedContent="$content"
    UpdatedContent="${UpdatedContent//is unconscious/está inconsciente}"
    UpdatedContent="${UpdatedContent//bled out/morreu por sangramento}"
    UpdatedContent="${UpdatedContent//killed by/morto por}"
    UpdatedContent="${UpdatedContent//(DEAD)/}"
    UpdatedContent=$(echo "$UpdatedContent" | sed -E 's/died\..*/morreu para o ambiente/')

    local PlayerId
    PlayerId=$(echo "$UpdatedContent" | grep -oP 'id=\K[^ ]+' | head -n 1)

    if [[ ${#PlayerId} -eq 44 ]]; then
        local PlayerExists
        PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")
        if [[ -n "$PlayerExists" ]]; then
            local PlayerName SteamID SteamName PlayerInfo SafePlayerInfo CleanContent NewContent
            PlayerName=$(echo "$PlayerExists" | cut -d"|" -f1)
            SteamID=$(echo "$PlayerExists" | cut -d"|" -f2)
            SteamName=$(echo "$PlayerExists" | cut -d"|" -f3)

            PlayerInfo="**$(sanitize_discord_markdown "$PlayerName")** ([$(sanitize_discord_markdown "$SteamName")](<https://steamcommunity.com/profiles/$SteamID>))"
            INSERT_CUSTOM_LOG "Informações do jogador: $PlayerInfo" "INFO" "$ScriptName"

            SafePlayerInfo=$(printf '%s\n' "$PlayerInfo" | sed 's/[&/]/\\&/g')
            CleanContent=$(echo "$UpdatedContent" | sed -E 's/ \(id=[^)]+\)//')
            CleanContent=$(echo "$CleanContent" | sed -E 's/ pos=<[^>]+>//g')
            NewContent=$(echo "$CleanContent" | sed -E "s|(Player )\"[^\"]+\"|\1$SafePlayerInfo|")

            if [[ -n "$NewContent" && "$NewContent" != "$CleanContent" ]]; then
                UpdatedContent="$NewContent"
                INSERT_CUSTOM_LOG "Evento formatado com informações do jogador: $UpdatedContent" "INFO" "$ScriptName"
            else
                INSERT_CUSTOM_LOG "Erro ao formatar o evento com informações do jogador. NewContent: '$NewContent', CleanContent: '$CleanContent'" "INFO" "$ScriptName"
                CleanContent=$(echo "$UpdatedContent" | sed -E 's/ \(id=[^)]+\)//')
                CleanContent=$(echo "$CleanContent" | sed -E 's/ pos=<[^>]+>//g')
                UpdatedContent="$CleanContent"
            fi
        else
            INSERT_CUSTOM_LOG "PlayerId não encontrado no banco de dados. Ignorando..." "INFO" "$ScriptName"
        fi
    else
        INSERT_CUSTOM_LOG "Não foi possível capturar o PlayerId do evento" "INFO" "$ScriptName"
    fi

    UpdatedContent="${UpdatedContent//Player/Jogador}"

    UpdatedContent=$(echo "$UpdatedContent" | sed -E 's/ \(id=[^)]+\)//g')
    UpdatedContent=$(echo "$UpdatedContent" | sed -E 's/ pos=<[^>]+>//g')
    UpdatedContent=$(echo "$UpdatedContent" | sed -E 's/id=[^ ]+//g')
    UpdatedContent=$(echo "$UpdatedContent" | sed -E 's/pos=<[^>]+>//g')

    HANDLER_CONTENT=$(echo "$UpdatedContent" | tr -d '\r\n' | sed "s/   */ /g")
}

