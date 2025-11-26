#/bin/bash

# Descobre o diretório onde este script está
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Carrega o config.sh do mesmo diretório
source "$script_dir/config.sh"

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
    PlayerExists=$(sqlite3 -separator $'\x1F' "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PLAYER_ID';")
    if [[ -z "$PlayerExists" ]]; then
        echo "Ignorando pois player não consta no banco"
        INSERT_CUSTOM_LOG "Ignorando pois player não consta no banco" "INFO" "$ScriptName"
        return 1
    fi
    PlayerName=$(echo "$PlayerExists" | cut -d$'\x1F' -f1)
    SteamID=$(echo "$PlayerExists" | cut -d$'\x1F' -f2)
    SteamName=$(echo "$PlayerExists" | cut -d$'\x1F' -f3)

    #if [[ -f "$DayzServerFolder/$DayzAdminIdsFile" ]] && grep -q "$PLAYER_ID" "$DayzServerFolder/$DayzAdminIdsFile"; then
    #    echo "Ignorando conta do administrador e matando player para renascer com loot admin..."
    #    INSERT_CUSTOM_LOG "Ignorando conta do administrador e matando player para renascer com loot admin..." "INFO" "$ScriptName"
    #    return 1
    #fi

    if [[ "$EVENT" == "CONNECT" ]]; then
        Content="Jogador **$(sanitize_discord_markdown "$PlayerName")** ([$(sanitize_discord_markdown "$SteamName")](<https://steamcommunity.com/profiles/$SteamID>)) conectou"
    else
        Content="Jogador **$(sanitize_discord_markdown "$PlayerName")** ([$(sanitize_discord_markdown "$SteamName")](<https://steamcommunity.com/profiles/$SteamID>)) desconectou"
    fi
    			
    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
}

function BuscaDadosGeolocalizacaoRcon() {
    local PlayerId="$1"
    
    if [[ -z "$PlayerId" ]]; then
        return 1
    fi
    
    local RconBinary="$AppFolder/$AppRconBinFile"
    
    if [[ ! -x "$RconBinary" ]]; then
        return 1
    fi
    
    local RconGuid
    RconGuid=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT RconGuid FROM players_database WHERE PlayerID = '$PlayerId' LIMIT 1;")
    
    if [[ -z "$RconGuid" ]]; then
        return 1
    fi
    
    local RconResponse
    RconResponse=$("$RconBinary" -i "$DayzRConIP" -p "$DayzRConPort" -P "$DayzRConPassword" -g "$AppFolder/$AppGeoLiteDbFile" -j players 2>&1)
    
    if [[ $? -ne 0 ]] || [[ -z "$RconResponse" ]] || [[ "$RconResponse" == "null" ]]; then
        return 1
    fi
    
    if ! echo "$RconResponse" | jq empty >/dev/null 2>&1; then
        return 1
    fi
    
    local PlayerData
    PlayerData=$(echo "$RconResponse" | jq -r --arg guid "$RconGuid" '.[] | select(.guid == $guid)')
    
    if [[ -z "$PlayerData" ]]; then
        return 1
    fi
    
    local Country City Lon IP Port Ping
    Country=$(echo "$PlayerData" | jq -r '.country // empty')
    City=$(echo "$PlayerData" | jq -r '.city // empty')
    Lon=$(echo "$PlayerData" | jq -r '.lon // empty')
    IP=$(echo "$PlayerData" | jq -r '.ip // empty')
    Port=$(echo "$PlayerData" | jq -r '.port // empty')
    Ping=$(echo "$PlayerData" | jq -r '.ping // empty')
    
    echo "$Country|$City|$Lon|$IP|$Port|$Ping"
    return 0
}

function AtualizaPlayersOnlineRcon() {
    local RconBinary="$AppFolder/$AppRconBinFile"

    if [[ ! -x "$RconBinary" ]]; then
        INSERT_CUSTOM_LOG "Binário RCON não encontrado em $RconBinary" "ERROR" "$ScriptName"
        return 1
    fi

    local RconResponse
    RconResponse=$("$RconBinary" -i "$DayzRConIP" -p "$DayzRConPort" -P "$DayzRConPassword" -g "$AppFolder/$AppGeoLiteDbFile" -j players 2>&1)
    if [[ $? -ne 0 ]]; then
        INSERT_CUSTOM_LOG "Falha ao consultar jogadores via RCON: $RconResponse" "ERROR" "$ScriptName"
        return 1
    fi

    if [[ -z "$RconResponse" || "$RconResponse" == "null" ]]; then
        return 0
    fi

    if ! echo "$RconResponse" | jq empty >/dev/null 2>&1; then
        INSERT_CUSTOM_LOG "Resposta inválida do RCON: $RconResponse" "ERROR" "$ScriptName"
        return 1
    fi

    echo "$RconResponse" | jq -c '.[]' | while IFS= read -r player_json; do
        local Guid
        Guid=$(echo "$player_json" | jq -r '.guid // empty')
        if [[ -z "$Guid" ]]; then
            continue
        fi

        local EscapedGuid
        EscapedGuid=$(echo "$Guid" | sed "s/'/''/g")

        local PlayerIdDb
        PlayerIdDb=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT PlayerID FROM players_database WHERE RconGuid = '$EscapedGuid' LIMIT 1;")
        if [[ -z "$PlayerIdDb" ]]; then
            continue
        fi

        local Country City Lat Lon Port Ping IP
        Country=$(echo "$player_json" | jq -r '.country // empty')
        City=$(echo "$player_json" | jq -r '.city // empty')
        Lat=$(echo "$player_json" | jq -r '.lat // empty')
        Lon=$(echo "$player_json" | jq -r '.lon // empty')
        Port=$(echo "$player_json" | jq -r '.port // empty')
        Ping=$(echo "$player_json" | jq -r '.ping // empty')
        IP=$(echo "$player_json" | jq -r '.ip // empty')

        local EscapedPlayerId
        EscapedPlayerId=$(echo "$PlayerIdDb" | sed "s/'/''/g")

        local CountryValue="NULL"
        local CityValue="NULL"
        local LatValue="NULL"
        local LonValue="NULL"
        local PortValue="NULL"
        local PingValue="NULL"

        if [[ -n "$Country" ]]; then
            local EscapedCountry
            EscapedCountry=$(echo "$Country" | sed "s/'/''/g")
            CountryValue="'$EscapedCountry'"
        fi

        if [[ -n "$City" ]]; then
            local EscapedCity
            EscapedCity=$(echo "$City" | sed "s/'/''/g")
            CityValue="'$EscapedCity'"
        fi

        if [[ "$Lat" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
            LatValue="$Lat"
        fi

        if [[ "$Lon" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then
            LonValue="$Lon"
        fi

        if [[ "$Port" =~ ^[0-9]+$ ]]; then
            PortValue="$Port"
        fi

        if [[ "$Ping" =~ ^[0-9]+$ ]]; then
            PingValue="$Ping"
        fi

        local IPValue="NULL"
        if [[ -n "$IP" ]]; then
            local EscapedIP
            EscapedIP=$(echo "$IP" | sed "s/'/''/g")
            IPValue="'$EscapedIP'"
        fi

        local UpdateSQL
        UpdateSQL="UPDATE players_online SET Country = $CountryValue, City = $CityValue, Lat = $LatValue, Lon = $LonValue, Port = $PortValue, Ping = $PingValue, IP = $IPValue WHERE PlayerID = '$EscapedPlayerId';"

        sqlite3 "$PLAYERS_BECO_C1_DB" "$UpdateSQL" >/dev/null 2>&1 || INSERT_CUSTOM_LOG "Falha ao atualizar dados RCON do player $PlayerIdDb" "ERROR" "$ScriptName"
    done
}

if [[ "$PLAYER_ID" == "RESET" ]]; then
    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        DeathMatchCoords="$DayzServerFolder/$DayzDeathmatchCoords"
        if [[ -f "$DeathMatchCoords" ]]; then
            CURRENT_INDEX=$(jq 'map(.Active) | index(1)' "$DeathMatchCoords")
            CURRENT_REGION=$(jq -r ".[$CURRENT_INDEX].Region" "$DeathMatchCoords")
        else
            CURRENT_REGION="Desconhecido"
        fi
        CONTENT="**(0/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
        CONTENT="${CONTENT}**Mapa atual: ${CURRENT_REGION}** \n"
    else
        CONTENT="**(0/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
    fi    

    AtualizaPlayersOnlineDiscord

    # Processar todos os jogadores online antes de deletar
    # Usar set +e para não parar em caso de erro nos logs
    set +e
    
    while IFS=$'\x1F' read -r PlayerId PlayerName SteamID SteamName Country City Lon IP Port Ping
    do
        if [[ -z "$PlayerId" ]] || [[ ${#PlayerId} -ne 44 ]]; then
            continue
        fi
        
        # Enviar webhook Discord de desconexão (não bloquear se falhar)
        {
            CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")
            Content="Jogador **$(sanitize_discord_markdown "$PlayerName")** ([$(sanitize_discord_markdown "$SteamName")](<https://steamcommunity.com/profiles/$SteamID>)) desconectou"
            SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
        } || true
        
        # Registrar evento de desconexão (não bloquear se falhar)
        {
            CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
            
            DetailsJson=$(jq -n \
                --arg timestamp "$CurrentDate" \
                --arg country "${Country:-null}" \
                --arg city "${City:-null}" \
                --arg lon "${Lon:-null}" \
                --arg ip "${IP:-null}" \
                --arg port "${Port:-null}" \
                --arg ping "${Ping:-null}" \
                '{timestamp: $timestamp, Country: (if $country == "" then null else $country end), City: (if $city == "" then null else $city end), Lon: (if $lon == "" then null else ($lon | tonumber) end), IP: (if $ip == "" then null else $ip end), Port: (if $port == "" then null else ($port | tonumber) end), Ping: (if $ping == "" then null else ($ping | tonumber) end)}')
            
            sleep 2
            INSERT_PLAYER_EVENT "$PlayerId" "player_disconnected" "" "" "" "$DetailsJson" ""
        } || true
    done < <(sqlite3 -separator $'\x1F' "$PLAYERS_BECO_C1_DB" "
        SELECT 
            o.PlayerID,
            p.PlayerName,
            p.SteamID,
            p.SteamName,
            o.Country,
            o.City,
            o.Lon,
            o.IP,
            o.Port,
            o.Ping
        FROM 
            players_online o
        INNER JOIN 
            players_database p
        ON 
            o.PlayerID = p.PlayerID;
    ")
    
    # Restaurar comportamento padrão de erro
    set -e

    # SQLITE - DELETE sempre deve executar, independente de falhas nos logs acima
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
        if [[ -n "$PLAYER_ID" ]] && [[ ${#PLAYER_ID} -eq 44 ]]; then
            CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
            
            Country=""
            City=""
            Lon=""
            IP=""
            Port=""
            Ping=""
            GeoDataDb=$(sqlite3 -separator $'\x1F' "$PLAYERS_BECO_C1_DB" "SELECT Country, City, Lon, IP, Port, Ping FROM players_online WHERE PlayerID = '$PLAYER_ID' LIMIT 1;")
            
            if [[ -n "$GeoDataDb" ]]; then
                Country=$(echo "$GeoDataDb" | cut -d$'\x1F' -f1)
                City=$(echo "$GeoDataDb" | cut -d$'\x1F' -f2)
                Lon=$(echo "$GeoDataDb" | cut -d$'\x1F' -f3)
                IP=$(echo "$GeoDataDb" | cut -d$'\x1F' -f4)
                Port=$(echo "$GeoDataDb" | cut -d$'\x1F' -f5)
                Ping=$(echo "$GeoDataDb" | cut -d$'\x1F' -f6)
            fi
            
            DetailsJson=$(jq -n \
                --arg timestamp "$CurrentDate" \
                --arg country "${Country:-null}" \
                --arg city "${City:-null}" \
                --arg lon "${Lon:-null}" \
                --arg ip "${IP:-null}" \
                --arg port "${Port:-null}" \
                --arg ping "${Ping:-null}" \
                '{timestamp: $timestamp, Country: (if $country == "" then null else $country end), City: (if $city == "" then null else $city end), Lon: (if $lon == "" then null else ($lon | tonumber) end), IP: (if $ip == "" then null else $ip end), Port: (if $port == "" then null else ($port | tonumber) end), Ping: (if $ping == "" then null else ($ping | tonumber) end)}')
            
            sleep 2
            INSERT_PLAYER_EVENT "$PLAYER_ID" "player_disconnected" "" "" "" "$DetailsJson" ""
        fi
        
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
                
                if [[ -n "$PLAYER_ID" ]] && [[ ${#PLAYER_ID} -eq 44 ]]; then
                    GeoData=$(BuscaDadosGeolocalizacaoRcon "$PLAYER_ID")
                    
                    CurrentDate=$(date "+%Y-%m-%d %H:%M:%S")
                    
                    Country=""
                    City=""
                    Lon=""
                    IP=""
                    Port=""
                    Ping=""
                    if [[ -n "$GeoData" ]]; then
                        Country=$(echo "$GeoData" | cut -d'|' -f1)
                        City=$(echo "$GeoData" | cut -d'|' -f2)
                        Lon=$(echo "$GeoData" | cut -d'|' -f3)
                        IP=$(echo "$GeoData" | cut -d'|' -f4)
                        Port=$(echo "$GeoData" | cut -d'|' -f5)
                        Ping=$(echo "$GeoData" | cut -d'|' -f6)
                    fi
                    
                    DetailsJson=$(jq -n \
                        --arg timestamp "$CurrentDate" \
                        --arg country "${Country:-null}" \
                        --arg city "${City:-null}" \
                        --arg lon "${Lon:-null}" \
                        --arg ip "${IP:-null}" \
                        --arg port "${Port:-null}" \
                        --arg ping "${Ping:-null}" \
                        '{timestamp: $timestamp, Country: (if $country == "" then null else $country end), City: (if $city == "" then null else $city end), Lon: (if $lon == "" then null else ($lon | tonumber) end), IP: (if $ip == "" then null else $ip end), Port: (if $port == "" then null else ($port | tonumber) end), Ping: (if $ping == "" then null else ($ping | tonumber) end)}')
                    
                    INSERT_PLAYER_EVENT "$PLAYER_ID" "player_connected" "" "" "" "$DetailsJson" ""
                fi
                
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

# Sincroniza dados do RCON antes de montar o relatório
AtualizaPlayersOnlineRcon

NUM_REGISTROS=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT COUNT(*) FROM players_online;")

if [[ "$DayzDeathmatch" -eq "1" ]]; then
    DeathMatchCoords="$DayzServerFolder/$DayzDeathmatchCoords"
    if [[ -f "$DeathMatchCoords" ]]; then
        CURRENT_INDEX=$(jq 'map(.Active) | index(1)' "$DeathMatchCoords")
        CURRENT_REGION=$(jq -r ".[$CURRENT_INDEX].Region" "$DeathMatchCoords")
    else
        CURRENT_REGION="Desconhecido"
    fi
    CONTENT="**($NUM_REGISTROS/60) Usuários online (atualizado em $CURRENT_DATE)**\n"  
    CONTENT="${CONTENT}**Mapa atual: ${CURRENT_REGION}** \n\n"
else
    CONTENT="**($NUM_REGISTROS/60) Usuários online (atualizado em $CURRENT_DATE)**\n\n"
fi

if [[ $NUM_REGISTROS -eq 0 ]]; then
    AtualizaPlayersOnlineDiscord
    exit 0
fi

while IFS=$'\x1F' read -r PlayerId PlayerName SteamID SteamName DataConnect
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
done < <(sqlite3 -separator $'\x1F' "$PLAYERS_BECO_C1_DB" "
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
