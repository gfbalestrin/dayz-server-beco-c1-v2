#!/bin/bash

# Carrega as variáveis

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

ScriptName=$(basename "$0")

COMMAND_FILE="$DayzServerFolder/$DayzActionsToExecuteFile"
DB_FILENAME="$DayzServerFolder/$DayzPlayerDbFile"
PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"

echo "Monitorando comandos do DayZ em $COMMAND_FILE..."
INSERT_CUSTOM_LOG "Monitorando arquivo: $COMMAND_FILE" "INFO" "$ScriptName"

echo > "$COMMAND_FILE"

tail -F "$COMMAND_FILE" | while read -r line; do
    # Valida se é um JSON válido
    if ! echo "$line" | jq empty 2>/dev/null; then
        echo ">> Linha inválida (não é JSON): $line"
        continue
    fi

    # Extrai o campo "action"
    action=$(echo "$line" | jq -r '.action')
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S") 

    case "$action" in
        reset_password)
            player_id=$(echo "$line" | jq -r '.player_id')

            echo ">> Resetando senha de $player_id"
            INSERT_CUSTOM_LOG "Resetando senha de $player_id"
    
            # Caminho absoluto para garantir que funcione via systemd
            result_json=$("$AppFolder/$AppScriptPlayerLoadoutManagerFile" --player-id "$player_id" --reset-password 2>&1)

            # Verifica se a saída é JSON válido
            if ! echo "$result_json" | jq -e . >/dev/null 2>&1; then
                echo "Erro: saída inválida do script de reset:"
                echo "$result_json"
                echo "$player_id;[ERROR] Erro interno ao resetar senha (formato inválido)" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
                continue
            fi

            # Verifica erro no JSON retornado
            if echo "$result_json" | jq -e 'has("error")' >/dev/null; then
                erro=$(echo "$result_json" | jq -r '.error')
                echo "Erro do script: $erro"
                echo "$player_id;[ERROR] Erro ao resetar a senha: $erro" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
                continue
            fi

            login=$(echo "$result_json" | jq -r '.login // empty')
            senha=$(echo "$result_json" | jq -r '.senha // empty')
            url=$(echo "$result_json" | jq -r '.url // empty')

            echo ">> Senha redefinida com sucesso para o jogador $player_id"
            echo "Login: $login"
            echo "Senha: $senha"
            echo "URL: $url"

            echo "$player_id;Nova senha gerada com sucesso. Acesse $url" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            echo "$player_id;Login: $login" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
            echo "$player_id;Nova senha: $senha" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"

            # LOG DISCORD
            PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$player_id';")
            if [[ -n "$PlayerExists" ]]; then
                PlayerName=$(echo "$PlayerExists" | cut -d'|' -f1 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
                SteamID=$(echo "$PlayerExists" | cut -d'|' -f2)
                SteamName=$(echo "$PlayerExists" | cut -d'|' -f3 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
                Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) resetou seu acesso no sistema de loadout"
                SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi
            
            ;;

        active_loadout)
            player_id=$(echo "$line" | jq -r '.player_id')
            loadout_name=$(echo "$line" | jq -r '.loadout_name')
            echo ">> Ativando loadout de $player_id para $loadout_name"
            INSERT_CUSTOM_LOG "Ativando loadout de $player_id para $loadout_name" "INFO" "$ScriptName"

            result_json=$("$AppFolder/$AppScriptPlayerLoadoutManagerFile" --player-id "$player_id" --loadout-name "$loadout_name" --active)

            if echo "$result_json" | jq -e 'has("error")' >/dev/null; then
                erro=$(echo "$result_json" | jq -r '.error')
                echo "Erro ao ativar loadout: $erro"
                echo "$player_id;[ERROR] Erro ao ativar o loadout '$loadout_name': $erro" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"
                continue
            fi

            msg=$(echo "$result_json" | jq -r '.message')
            echo ">> Loadout ativado com sucesso: $msg"
            echo "$player_id;$msg" >> "$DayzServerFolder/$DayzMessagesPrivateToSendoFile"

            # LOG DISCORD
            PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$player_id';")
            if [[ -n "$PlayerExists" ]]; then
                PlayerName=$(echo "$PlayerExists" | cut -d'|' -f1 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
                SteamID=$(echo "$PlayerExists" | cut -d'|' -f2)
                SteamName=$(echo "$PlayerExists" | cut -d'|' -f3 | tr -d '|' | sed 's/[^a-zA-Z0-9_ -]//g' | xargs)
                Content="Jogador **$PlayerName** ([$SteamName](<https://steamcommunity.com/profiles/$SteamID>)) ativou um loadout pelo jogo"
                SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi
            ;;

        restart_server)
            minutes=$(echo "$line" | jq -r '.minutes')
            message=$(echo "$line" | jq -r '.message')
            echo ">> Reinício do servidor em $minutes minuto(s): $message"
            INSERT_CUSTOM_LOG "Servidor será reiniciado antes do previsto devido a votação" "INFO" "$ScriptName"
            SEND_DISCORD_WEBHOOK "Servidor será reiniciado antes do previsto devido a votação" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

            # Validação mínima
            if ! [[ "$minutes" =~ ^[0-9]+$ ]] || [[ "$minutes" -le 0 ]]; then
                echo ">> Valor inválido para minutos: $minutes"
                continue
            fi

            echo "Atenção: o servidor será reiniciado em $minutes minuto(s)!" >> "$DayzServerFolder/$DayzMessagesToSendoFile"
            sleep 60
            sudo systemctl restart dayz-server
            ;;
        
        update_player)
            # Função de sanitização única (mantém: letras, números, espaço, _ . - [ ] ( ) @ # + |)
            sanitize_name() {
                tr -d '\r' | tr -cd '[:print:]\n' \
                | sed 's/[^[:alnum:] _.\-\[\]()@#+]/ /g' \
                | sed 's/[[:space:]]\{1,\}/ /g' \
                | sed 's/^[[:space:]]\+//; s/[[:space:]]\+$//'
            }

            # --- Extração do JSON ---
            PlayerId=$(echo "$line" | jq -r '.player_id')

            # aplica sanitização ao player_name vindo do JSON
            PlayerName=$(echo "$line" | jq -r '.player_name' | sanitize_name)
            [ -z "$PlayerName" ] && PlayerName="Unknown"

            PlayerSteamId=$(echo "$line" | jq -r '.steam_id')

            echo ">> Atualizando jogador na player_database: $PlayerId"

            # --- Obtém o nome da Steam da página do perfil (sem API key) ---
            # Dica: usar um User-Agent ajuda a evitar bloqueio
            PlayerSteamName=$(
            curl -L -s -A "Mozilla/5.0" "https://steamcommunity.com/profiles/$PlayerSteamId" \
            | grep -oP '(?<=actual_persona_name">).*(?=</span>)' \
            | sed 's/<[^>]*>//g' \
            | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&#39;/'"'"'/g' \
            | sanitize_name
            )
            [ -z "$PlayerSteamName" ] && PlayerSteamName="Unknown"

            # --- (opcional) proteção extra para SQL: escape de aspas simples, caso suas funções montem SQL literal ---
            sql_escape() { sed "s/'/''/g"; }
            PlayerNameSqlEscaped=$(printf "%s" "$PlayerName" | sql_escape)
            PlayerSteamNameSqlEscaped=$(printf "%s" "$PlayerSteamName" | sql_escape)

            # Consulta no banco
            PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" \
            "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")

            if [[ -z "$PlayerExists" ]]; then
                INSERT_CUSTOM_LOG "Player $PlayerId ($PlayerName) ($PlayerSteamId) ($PlayerSteamName) não consta no banco. O player será inserido no banco de dados." "INFO" "$ScriptName"
                # use variáveis normais se suas funções já fazem escape internamente;
                # caso contrário, troque para as *SqlEscaped*
                INSERT_PLAYER_DATABASE "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName"
                sleep 2
                "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
                continue
            fi

            # Player já existe
            PlayerNameCurrent=$(echo "$PlayerExists" | cut -d'|' -f1)
            PlayerSteamIdCurrent=$(echo "$PlayerExists" | cut -d'|' -f2)
            PlayerSteamNameCurrent=$(echo "$PlayerExists" | cut -d'|' -f3)

            INSERT_CUSTOM_LOG "Player $PlayerId ($PlayerName) ($PlayerSteamId) ($PlayerSteamName) já consta no banco. O player será atualizado no banco de dados." "INFO" "$ScriptName"
            UPDATE_PLAYER_DATABASE "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName"

            if [[ "$PlayerNameCurrent" != "$PlayerName" ]] \
            || [[ "$PlayerSteamIdCurrent" != "$PlayerSteamId" ]] \
            || [[ "$PlayerSteamNameCurrent" != "$PlayerSteamName" ]]; then
                INSERT_CUSTOM_LOG "Player alterou seus dados desde a última conexão." "INFO" "$ScriptName"
                INSERT_PLAYER_NAME_HISTORY "$PlayerId" "$PlayerName" "$PlayerSteamId" "$PlayerSteamName"
            fi

            "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"


            ;;
        player_connected)     
            PlayerId=$(echo "$line" | jq -r '.player_id')
            echo "Evento de player conectado detectado!"
            INSERT_CUSTOM_LOG "Evento de player conectado detectado!" "INFO" "$ScriptName"            
            "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "CONNECT"
            ;;
        player_disconnected)     
            PlayerId=$(echo "$line" | jq -r '.player_id')
            echo "Evento de player desconectado detectado!" 
            INSERT_CUSTOM_LOG "Evento de player desconectado detectado!" "INFO" "$ScriptName"
            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players set Alive = 0 where UID = '$PlayerId';"
            fi            
            "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "$PlayerId" "DISCONNECT"
            ;;
        event_restarting)     
            NextMap=$(echo "$line" | jq -r '.next_map')
            echo "Evento de servidor reiniciando!" 
            INSERT_CUSTOM_LOG "Evento de restart do servidor!" "INFO" "$ScriptName"
            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                Content="Servidor reiniciando... (Próximo mapa: $NextMap)"
            else
                Content="Servidor reiniciando..."
            fi
            
            SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "RESET"     
            ;;
        event_start_finished)     
            CurrentMap=$(echo "$line" | jq -r '.current_map')
            CurrentTime=$(echo "$line" | jq -r '.current_time')
            echo "Evento de servidor reiniciado!" 
            INSERT_CUSTOM_LOG "Evento de início do servidor!" "INFO" "$ScriptName"
            
            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                Content="Servidor iniciado e liberado para jogadores!"
                SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
                Content="Mapa atual: $CurrentMap, Horário: $CurrentTime"
                SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"   
            else
                Content="Servidor iniciado e liberado para jogadores! Horário: $CurrentTime"
                SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            fi

            "$AppFolder/$AppScriptUpdatePlayersOnlineFile" "RESET"  
            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                # Gerar estatísticas
                "$AppFolder/$AppScriptUpdateGeneralKillfeed"         
            fi
            ;;
        event_minutes_to_restart)     
            CurrentMap=$(echo "$line" | jq -r '.current_map')
            CurrentTime=$(echo "$line" | jq -r '.current_time')
            Message=$(echo "$line" | jq -r '.message')
            echo "Evento de servidor reiniciando!" 
            INSERT_CUSTOM_LOG "Evento de aviso de tempo para reiniciar o servidor!" "INFO" "$ScriptName"

            Content="Mapa atual: $CurrentMap, Horário: $CurrentTime"
            SEND_DISCORD_WEBHOOK "$Message ($Content)" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            ;;
        send_log_discord)     
            Message=$(echo "$line" | jq -r '.message')
            echo "Evento de envio de mensagem ao discord!" 
            INSERT_CUSTOM_LOG "Evento de envio de mensagem!" "INFO" "$ScriptName"
            SEND_DISCORD_WEBHOOK "$Message" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"
            ;;
        players_positions)
            echo ">> Recebendo posições dos jogadores"
            #INSERT_CUSTOM_LOG "Processando posições dos jogadores" "INFO" "$ScriptName"
            
            # Obtém o array de jogadores do JSON
            players=$(echo "$line" | jq -c '.players[]')
            
            # Itera sobre cada jogador no array
            while IFS= read -r player_data; do
                player_id=$(echo "$player_data" | jq -r '.player_id')
                coord_x=$(echo "$player_data" | jq -r '.x')
                coord_z=$(echo "$player_data" | jq -r '.z')
                coord_y=$(echo "$player_data" | jq -r '.y')
                
                # Insere a posição no banco de dados e captura o ID gerado
                PlayerCoordId=$(INSERT_PLAYER_POSITION "$player_id" "$coord_x" "$coord_z" "$coord_y")
                
                if [ $? -eq 0 ] && [ -n "$PlayerCoordId" ]; then
                    echo ">> Posições armazenadas com sucesso (ID: $PlayerCoordId)"
                    
                    # Tenta realizar backup completo do personagem
                    echo ">> Tentando realizar backup do personagem..."
                    
                    # Busca o blob Data do player do banco DayZ
                    backup=$(sqlite3 "$DB_FILENAME" "SELECT hex(Data) FROM Players where UID = '$player_id';")
                    
                    if [ -n "$backup" ] && [ "$backup" != "" ]; then
                        # Se backup existe, tenta inserir na tabela players_coord_backup
                        MAX_ATTEMPTS=5
                        ATTEMPT=1
                        backup_success=false
                        
                        while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
                            echo "Tentativa $ATTEMPT de $MAX_ATTEMPTS para backup..."
                            
                            sqlite3 "$PLAYERS_BECO_C1_DB" <<EOF
PRAGMA foreign_keys = ON;
INSERT INTO players_coord_backup (PlayerCoordId, Backup, TimeStamp)
VALUES (
    $PlayerCoordId,
    X'$(echo -n "$backup" | xxd -p | tr -d '\n')',
    datetime('now', 'localtime')
);
EOF

                            if [ $? -eq 0 ]; then
                                #INSERT_CUSTOM_LOG "Backup do personagem realizado com sucesso." "INFO" "$ScriptName"
                                backup_success=true
                                break
                            else
                                echo "Falha na tentativa $ATTEMPT. Aguardando para tentar novamente..."
                                sleep $((ATTEMPT * 2))
                                ((ATTEMPT++))
                            fi
                        done
                        
                        if [ "$backup_success" = false ]; then
                            INSERT_CUSTOM_LOG "Erro: não foi possível inserir backup após $MAX_ATTEMPTS tentativas (coordenadas já salvas)." "ERROR" "$ScriptName"
                        fi
                    else
                        echo "Player Data está em branco. Backup ignorado."
                        INSERT_CUSTOM_LOG "Backup ignorado - dados do player não disponíveis" "INFO" "$ScriptName"
                    fi
                else
                    INSERT_CUSTOM_LOG "Erro: não foi possível salvar coordenadas do jogador $player_id" "ERROR" "$ScriptName"
                fi

            done <<< "$players"

            player_count=$(echo "$players" | wc -l)
            INSERT_CUSTOM_LOG "Total de $player_count jogadores rastreados" "INFO" "$ScriptName"
            
            ;;
        vehicles_positions)
            echo ">> Recebendo posições dos veículos"
            #INSERT_CUSTOM_LOG "Processando posições dos veículos" "INFO" "$ScriptName"
            
            # Limpar tabela antes de inserir novas posições (mantemos apenas posição atual)
            sqlite3 "$AppFolder/$AppServerBecoC1LogsDbFile" "DELETE FROM vehicles_tracking;"
            echo ">> Tabela de tracking limpa"
            
            # Captura o timestamp atual antes do loop para usar em todos os veículos
            current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
            
            # Obtém o array de veículos do JSON
            vehicles=$(echo "$line" | jq -c '.vehicles[]')
            
            # Conta quantos veículos foram recebidos
            vehicle_count=$(echo "$line" | jq '.vehicles | length')
            
            # Itera sobre cada veículo no array
            while IFS= read -r vehicle_data; do
                vehicle_id=$(echo "$vehicle_data" | jq -r '.vehicle_id')
                vehicle_name=$(echo "$vehicle_data" | jq -r '.vehicle_name')
                coord_x=$(echo "$vehicle_data" | jq -r '.x')
                coord_z=$(echo "$vehicle_data" | jq -r '.z')
                coord_y=$(echo "$vehicle_data" | jq -r '.y')
                
                # Insere a posição do veículo no banco de dados com o timestamp compartilhado
                VehicleTrackingId=$(INSERT_VEHICLE_POSITION "$vehicle_id" "$vehicle_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp")
                               
            done <<< "$vehicles"
            
            echo ">> $vehicle_count veículos processados"
            INSERT_CUSTOM_LOG "Total de $vehicle_count veículos rastreados" "INFO" "$ScriptName"
            ;;
        containers_positions)
            echo ">> Recebendo containers para loot: $line"
            #INSERT_CUSTOM_LOG "Processando containers para loot" "INFO" "$ScriptName"
            
            # Obtém o array de containers do JSON
            containers=$(echo "$line" | jq -c '.containers[]')
            
            # Itera sobre cada container no array
            while IFS= read -r container_data; do
                container_id=$(echo "$container_data" | jq -r '.container_id')
                container_name=$(echo "$container_data" | jq -r '.container_name')
                coord_x=$(echo "$container_data" | jq -r '.x')
                coord_z=$(echo "$container_data" | jq -r '.z')
                coord_y=$(echo "$container_data" | jq -r '.y')
                
                # Insere a posição do container no banco de dados com o timestamp compartilhado
                ContainerTrackingId=$(INSERT_CONTAINER_POSITION "$container_id" "$container_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp")
                
            done <<< "$containers"
            
            echo ">> $container_count containers processados"
            INSERT_CUSTOM_LOG "Total de $container_count containers rastreados" "INFO" "$ScriptName"
            ;;
        fences_positions)
            echo ">> Recebendo posições das portões: $line"
            #INSERT_CUSTOM_LOG "Processando posições das portões" "INFO" "$ScriptName"
            
            # Obtém o array de portões do JSON
            fences=$(echo "$line" | jq -c '.fences[]')
            
            # Itera sobre cada portão no array
            while IFS= read -r fence_data; do
                fence_id=$(echo "$fence_data" | jq -r '.fence_id')
                fence_name=$(echo "$fence_data" | jq -r '.fence_name')
                coord_x=$(echo "$fence_data" | jq -r '.x')
                coord_z=$(echo "$fence_data" | jq -r '.z')
                coord_y=$(echo "$fence_data" | jq -r '.y')
                
                # Insere a posição do portão no banco de dados com o timestamp compartilhado
                FenceTrackingId=$(INSERT_FENCE_POSITION "$fence_id" "$fence_name" "$coord_x" "$coord_z" "$coord_y" "$current_timestamp")
                
            done <<< "$fences"
            
            echo ">> $fence_count portões processados"
            INSERT_CUSTOM_LOG "Total de $fence_count portões rastreados" "INFO" "$ScriptName"
            ;;
        *)
            echo ">> Ação desconhecida: $action"
            ;;
    esac
done
