#/bin/bash

# SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PARENT_DIR="$(dirname "$SCRIPT_DIR")"
# cd "$PARENT_DIR"
pwd
source ./config.sh

DISCORD_MESSAGE_ID="$DiscordChannelPlayersOnlineMessageId"
DISCORD_BOT_TOKEN="$DiscordChannelPlayersOnlineBotToken"
DISCORD_CHANNEL_ID="$DiscordChannelPlayersOnlineChannelId"
PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"
CURRENT_DATE=$(date "+%d/%m/%Y %H:%M:%S")

PLAYER_ID=$1
EVENT=$2

CONTENT=""

function AtualizaPlayersOnlineDiscord() {
    [[ -z "$DiscordDesactive" || "$DiscordDesactive" -eq 0 ]] || return 0
    URL="https://discord.com/api/v10/channels/$DISCORD_CHANNEL_ID/messages/$DISCORD_MESSAGE_ID"
    echo "Atualizando a mensagem com ID $DISCORD_MESSAGE_ID no canal $DISCORD_CHANNEL_ID..."
    echo "Mensagem: $CONTENT"
    sleep 2
    # Enviar requisição PATCH para editar a mensagem
    response=$(curl -s -X PATCH \
        -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"content\": \"$CONTENT\"}" \
        "$URL")

    echo ""
    echo $response
    if [[ "$response" == *"Maximum number of edits to messages"* ]]; then
        sleep 5
        AtualizaPlayersOnlineDiscord
    fi
}

function EnviaLogsDiscord() {
    PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PLAYER_ID';")
    if [[ -z "$PlayerExists" ]]; then
        echo "Ignorando pois player não consta no banco"
        INSERT_CUSTOM_LOG "Ignorando pois player não consta no banco" "INFO" "$ScriptName"
        return 1
    fi
    PlayerName=$(echo "$PlayerExists" | cut -d'|' -f1 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
    SteamID=$(echo "$PlayerExists" | cut -d'|' -f2)
    SteamName=$(echo "$PlayerExists" | cut -d'|' -f3 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)

    if [[ -f "$DayzServerFolder/$DayzAdminIdsFile" ]] && grep -q "$PLAYER_ID" "$DayzServerFolder/$DayzAdminIdsFile"; then
        echo "Ignorando conta do administrador e matando player para renascer com loot admin..."
        INSERT_CUSTOM_LOG "Ignorando conta do administrador e matando player para renascer com loot admin..." "INFO" "$ScriptName"
        return 1
    fi

    if [[ "$EVENT" == "CONNECT" ]]; then
        Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) conectou"
    else
        Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) desconectou"
    fi
    			
    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
}

if [[ "$PLAYER_ID" == "RESET" ]]; then
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        DeathMatchCoords="$DayzServerFolder/$DayzDeathmatchCoords"
        CURRENT_INDEX=$(jq 'map(.Active) | index(1)' "$DeathMatchCoords")
        NEXT_INDEX=$((CURRENT_INDEX + 1))
        TOTAL=$(jq 'length' "$DeathMatchCoords")
        if [ "$NEXT_INDEX" -ge "$TOTAL" ]; then
            NEXT_INDEX=0
        fi
        CURRENT_REGION=$(jq -r ".[$CURRENT_INDEX].Region" "$DeathMatchCoords")  
        NEXT_REGION=$(jq -r ".[$NEXT_INDEX].Region" "$DeathMatchCoords")  
        CONTENT="**(0/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
        CONTENT="${CONTENT}**Mapa atual: ${CURRENT_REGION}** \n"
    else
        CONTENT="**(0/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
    fi    

    AtualizaPlayersOnlineDiscord

    # SQLITE
    for ((i = 1; i <= 5; i++)); do
        echo "Tentativa $i de exclusão..."

        OUTPUT=$(sqlite3 "$PLAYERS_BECO_C1_DB" "DELETE FROM players_online;" 2>&1)

        if [ $? -eq 0 ]; then
            echo "Registros da tabela 'players_online' excluídos com sucesso."
            break;
        else
            if echo "$OUTPUT" | grep -q "database is locked"; then
                echo "Banco de dados está travado. Tentando novamente em 2 segundos..."
                sleep 2
            else
                echo "Erro inesperado: $OUTPUT"
                break;
            fi
        fi
    done

    exit 0
fi
if [[ "$EVENT" == "CONNECT" || "$EVENT" == "DISCONNECT" ]]; then
    echo "O evento recebido é: $EVENT"
else
    echo "Erro: Parâmetro inválido. Os valores permitidos são 'CONNECT' ou 'DISCONNECT'."
    exit 1
fi

if [[ "$PLAYER_ID" == "" ]]; then
    echo "PlayerID não foi identificado"
    exit 1
fi

# SQLITE
DATACONNECT=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT DataConnect FROM players_online WHERE PlayerID = '$PLAYER_ID';")
# Extrair partes da data manualmente
DIA=$(echo "$CURRENT_DATE" | cut -d'/' -f1)
MES=$(echo "$CURRENT_DATE" | cut -d'/' -f2)
ANO_HORA=$(echo "$CURRENT_DATE" | cut -d'/' -f3)
ANO=$(echo "$ANO_HORA" | cut -d' ' -f1)
HORA=$(echo "$ANO_HORA" | cut -d' ' -f2)
DATA_FORMATADA="${ANO}-${MES}-${DIA} ${HORA}"
if [ -n "$DATACONNECT" ]; then
    if [[ "$EVENT" == "DISCONNECT" ]]; then
        for ((i = 1; i <= 5; i++)); do
            echo "Tentativa $i de exclusao..."
            
            OUTPUT=$(sqlite3 "$PLAYERS_BECO_C1_DB" "DELETE FROM players_online WHERE PlayerId = '$PLAYER_ID';" 2>&1)

            if [ $? -eq 0 ]; then
                echo "Registro da tabela 'players_online' excluído com sucesso."
                EnviaLogsDiscord
                break;
            else
                if echo "$OUTPUT" | grep -q "database is locked"; then
                    echo "Banco de dados está travado. Tentando novamente em 2 segundos..."
                    sleep 2
                else
                    echo "Erro inesperado: $OUTPUT"
                    break;
                fi
            fi
        done
    elif [[ "$EVENT" == "CONNECT" ]]; then
        for ((i = 1; i <= 5; i++)); do
            echo "Tentativa $i de atualizacao..."
            
            OUTPUT=$(sqlite3 "$PLAYERS_BECO_C1_DB" "UPDATE players_online SET DataConnect = '$DATA_FORMATADA' WHERE PlayerId = '$PLAYER_ID';" 2>&1)

            if [ $? -eq 0 ]; then
                echo "Registro da tabela 'players_online' atualizado com sucesso."
                break;
            else
                if echo "$OUTPUT" | grep -q "database is locked"; then
                    echo "Banco de dados está travado. Tentando novamente em 2 segundos..."
                    sleep 2
                else
                    echo "Erro inesperado: $OUTPUT"
                    break;
                fi
            fi
        done
    fi
else
    if [[ "$EVENT" == "DISCONNECT" ]]; then
        echo "Ignorando pois PlayerID $PLAYER_ID não estava registrado como online"        

    elif [[ "$EVENT" == "CONNECT" ]]; then
        for ((i = 1; i <= 5; i++)); do
            echo "Tentativa $i de insercao..."
            
            OUTPUT=$(sqlite3 "$PLAYERS_BECO_C1_DB" "INSERT INTO players_online (PlayerId, DataConnect) VALUES ('$PLAYER_ID','$DATA_FORMATADA');" 2>&1)

            if [ $? -eq 0 ]; then
                echo "Registro da tabela 'players_online' inserido com sucesso."
                EnviaLogsDiscord
                break;
            else
                if echo "$OUTPUT" | grep -q "database is locked"; then
                    echo "Banco de dados está travado. Tentando novamente em 2 segundos..."
                    sleep 2
                else
                    echo "Erro inesperado: $OUTPUT"
                    break;
                fi
            fi
        done        
        
    fi
fi

NUM_REGISTROS=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT COUNT(*) FROM players_online;")

if [[ "$DayzDeathmatch" -eq "1" ]]; then
    DeathMatchCoords="$DayzServerFolder/$DayzDeathmatchCoords"
    CURRENT_INDEX=$(jq 'map(.Active) | index(1)' "$DeathMatchCoords")
    PREV_INDEX=$((CURRENT_INDEX - 1))
    if [ "$PREV_INDEX" -lt 0 ]; then
        PREV_INDEX=$(jq 'length - 1' "$DeathMatchCoords")
    fi
    CURRENT_REGION=$(jq -r ".[$PREV_INDEX].Region" "$DeathMatchCoords")  
    CONTENT="**($NUM_REGISTROS/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
    CONTENT="${CONTENT}**Mapa atual: ${CURRENT_REGION}** \n\n"
else
    CONTENT="**($NUM_REGISTROS/60) Usuários online (atualizado em $CURRENT_DATE)**\n\n"
fi

if [[ $NUM_REGISTROS -eq 0 ]]; then
    AtualizaPlayersOnlineDiscord
    exit 0
fi

while IFS="|" read -r PlayerId PlayerName SteamID SteamName DataConnect
do

    link_steam="**NaoIdentificado**"
    if [[ $SteamID != "" && $SteamName != "" ]]; then
        link_steam="[$SteamName](<https://steamcommunity.com/profiles/$SteamID>)"
    fi
    echo "link_steam: $link_steam"

    player_info="🟢 **$PlayerName** ($link_steam) - $HORA"
    echo "player_info: $player_info"
    CONTENT="${CONTENT}${player_info} \n"
    echo "CONTENT: $CONTENT"
done < <(sqlite3 -separator "|" "$PLAYERS_BECO_C1_DB" "
SELECT 
    p.PlayerId,
    p.PlayerName,
    p.SteamID,
    p.SteamName,
    o.DataConnect
FROM 
    players_online o
INNER JOIN 
    players_database p
ON 
    o.PlayerID = p.PlayerID
ORDER BY 
    o.DataConnect ASC;
")

AtualizaPlayersOnlineDiscord
