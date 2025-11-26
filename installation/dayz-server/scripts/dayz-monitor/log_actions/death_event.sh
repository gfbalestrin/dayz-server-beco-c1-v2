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

    # ============================================================================
    # CORRELAÇÃO DE INCONSCIÊNCIA E MORTE PARA KILLFEED (DEATHMATCH)
    # Esta seção pode ser removida facilmente se necessário
    # ============================================================================
    if [[ ${#PlayerId} -eq 44 ]] && [[ "$UpdatedContent" == *"morreu para o ambiente"* ]] && [[ "$DayzDeathmatch" -eq "1" ]]; then
        INSERT_CUSTOM_LOG "Tentando correlacionar morte por ambiente com dano recente para PlayerId: $PlayerId" "DEBUG" "$ScriptName"
        
        # Escapar PlayerId para uso seguro em SQL
        local EscapedPlayerId
        EscapedPlayerId=$(echo "$PlayerId" | sed "s/'/''/g")
        
        # Verificar se há algum dano registrado para este jogador (debug)
        local DamageCount
        DamageCount=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" "
            SELECT COUNT(*) 
            FROM players_damage 
            WHERE PlayerIDVictim = '$EscapedPlayerId';
        ")
        INSERT_CUSTOM_LOG "Total de registros de dano encontrados para PlayerId: $DamageCount" "DEBUG" "$ScriptName"
        
        # Buscar o último dano recebido nos últimos 15 segundos
        # Usar julianday para comparação mais precisa de datas
        local DamageInfo
        DamageInfo=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "
            SELECT PlayerIDAttacker, Weapon, DistanceMeter, PosAttacker, PosVictim, Data
            FROM players_damage
            WHERE PlayerIDVictim = '$EscapedPlayerId'
              AND julianday(Data) >= julianday('now', '-15 seconds')
              AND PlayerIDAttacker != PlayerIDVictim
            ORDER BY Data DESC
            LIMIT 1;
        ")
        
        # Se não encontrou, tentar sem julianday (fallback)
        if [[ -z "$DamageInfo" ]]; then
            INSERT_CUSTOM_LOG "Tentando busca alternativa sem julianday..." "DEBUG" "$ScriptName"
            DamageInfo=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "
                SELECT PlayerIDAttacker, Weapon, DistanceMeter, PosAttacker, PosVictim, Data
                FROM players_damage
                WHERE PlayerIDVictim = '$EscapedPlayerId'
                  AND Data >= datetime('now', '-15 seconds')
                  AND PlayerIDAttacker != PlayerIDVictim
                ORDER BY Data DESC
                LIMIT 1;
            ")
        fi
        
        # Se ainda não encontrou, buscar último dano e validar tempo em bash (fallback final)
        if [[ -z "$DamageInfo" ]]; then
            INSERT_CUSTOM_LOG "Tentando busca do último dano sem filtro de tempo..." "DEBUG" "$ScriptName"
            local LastDamageAll
            LastDamageAll=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "
                SELECT PlayerIDAttacker, Weapon, DistanceMeter, PosAttacker, PosVictim, Data
                FROM players_damage
                WHERE PlayerIDVictim = '$EscapedPlayerId'
                  AND PlayerIDAttacker != PlayerIDVictim
                ORDER BY Data DESC
                LIMIT 1;
            ")
            
            if [[ -n "$LastDamageAll" ]]; then
                local LastDamageData
                LastDamageData=$(echo "$LastDamageAll" | cut -d"|" -f6)
                
                # Converter datas para timestamps Unix e comparar
                local CurrentTimestamp LastDamageTimestamp TimeDiff
                CurrentTimestamp=$(date "+%s")
                LastDamageTimestamp=$(date -d "$LastDamageData" "+%s" 2>/dev/null || echo "0")
                
                # Se não conseguiu converter, tentar formato alternativo
                if [[ "$LastDamageTimestamp" == "0" ]]; then
                    LastDamageTimestamp=$(date -j -f "%Y-%m-%d %H:%M:%S" "$LastDamageData" "+%s" 2>/dev/null || echo "0")
                fi
                
                if [[ "$LastDamageTimestamp" != "0" ]]; then
                    TimeDiff=$((CurrentTimestamp - LastDamageTimestamp))
                    INSERT_CUSTOM_LOG "Diferença de tempo: $TimeDiff segundos (limite: 15)" "DEBUG" "$ScriptName"
                    
                    if [[ $TimeDiff -le 15 ]] && [[ $TimeDiff -ge 0 ]]; then
                        DamageInfo="$LastDamageAll"
                        INSERT_CUSTOM_LOG "Dano encontrado via validação de tempo em bash!" "DEBUG" "$ScriptName"
                    fi
                fi
            fi
        fi
        
        if [[ -n "$DamageInfo" ]]; then
            INSERT_CUSTOM_LOG "Dano encontrado: $DamageInfo" "DEBUG" "$ScriptName"
            local PlayerIDAttacker Weapon DistanceMeter PosAttacker PosVictim DamageData
            PlayerIDAttacker=$(echo "$DamageInfo" | cut -d"|" -f1)
            Weapon=$(echo "$DamageInfo" | cut -d"|" -f2)
            DistanceMeter=$(echo "$DamageInfo" | cut -d"|" -f3)
            PosAttacker=$(echo "$DamageInfo" | cut -d"|" -f4)
            PosVictim=$(echo "$DamageInfo" | cut -d"|" -f5)
            DamageData=$(echo "$DamageInfo" | cut -d"|" -f6)
            
            if [[ -n "$PlayerIDAttacker" ]] && [[ ${#PlayerIDAttacker} -eq 44 ]]; then
                local metros
                metros=$(echo "$DistanceMeter" | cut -d '.' -f 1)
                if [[ -z "$metros" ]]; then
                    metros="0"
                fi
                
                local KillData
                KillData=$(date "+%Y-%m-%d %H:%M:%S")
                
                INSERT_CUSTOM_LOG "Atacante encontrado! PlayerIDAttacker: $PlayerIDAttacker, Weapon: $Weapon, Distance: $metros metros" "INFO" "$ScriptName"
                
                INSERT_KILLFEED "$PlayerIDAttacker" "$PlayerId" "$Weapon" "$metros" "$KillData" "$PosAttacker" "$PosVictim"
                
                INSERT_CUSTOM_LOG "Killfeed atualizado com correlação de inconsciência/morte" "INFO" "$ScriptName"
                
                # Buscar informações do atacante e vítima para formatar mensagem no padrão do killfeed
                local EscapedPlayerIDAttacker
                EscapedPlayerIDAttacker=$(echo "$PlayerIDAttacker" | sed "s/'/''/g")
                local AttackerInfo VictimInfo
                AttackerInfo=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$EscapedPlayerIDAttacker';")
                VictimInfo=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$EscapedPlayerId';")
                
                if [[ -n "$AttackerInfo" ]] && [[ -n "$VictimInfo" ]]; then
                    local AttackerName AttackerSteamID AttackerSteamName VictimName VictimSteamID VictimSteamName
                    AttackerName=$(echo "$AttackerInfo" | cut -d"|" -f1)
                    AttackerSteamID=$(echo "$AttackerInfo" | cut -d"|" -f2)
                    AttackerSteamName=$(echo "$AttackerInfo" | cut -d"|" -f3)
                    
                    VictimName=$(echo "$VictimInfo" | cut -d"|" -f1)
                    VictimSteamID=$(echo "$VictimInfo" | cut -d"|" -f2)
                    VictimSteamName=$(echo "$VictimInfo" | cut -d"|" -f3)
                    
                    if [[ -n "$AttackerName" ]] && [[ -n "$VictimName" ]]; then
                        # Formatar no padrão do killfeed: 💀 Jogador [vítima] foi executado por [atacante]. Arma: [arma], distância: [metros] metros (PvP correlacionado)
                        local PlayerKillerInfo PlayerVictimInfo message
                        PlayerKillerInfo="**$(sanitize_discord_markdown "$AttackerName")** ([$(sanitize_discord_markdown "$AttackerSteamName")](<https://steamcommunity.com/profiles/$AttackerSteamID>))"
                        PlayerVictimInfo="**$(sanitize_discord_markdown "$VictimName")** ([$(sanitize_discord_markdown "$VictimSteamName")](<https://steamcommunity.com/profiles/$VictimSteamID>))"
                        
                        message="💀 Jogador ${PlayerVictimInfo} foi executado por ${PlayerKillerInfo}. Arma: ${Weapon}, distância: ${metros} metros (PvP correlacionado)"
                        
                        UpdatedContent="$message"
                        INSERT_CUSTOM_LOG "Mensagem formatada no padrão do killfeed: $UpdatedContent" "INFO" "$ScriptName"
                    fi
                fi
            else
                INSERT_CUSTOM_LOG "PlayerIDAttacker inválido ou vazio: '$PlayerIDAttacker'" "DEBUG" "$ScriptName"
            fi
        else
            INSERT_CUSTOM_LOG "Nenhum dano recente encontrado para PlayerId: $PlayerId nos últimos 15 segundos" "DEBUG" "$ScriptName"
            
            # Debug: verificar o último dano registrado (independente do tempo)
            local LastDamage
            LastDamage=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "
                SELECT PlayerIDAttacker, Weapon, Data
                FROM players_damage
                WHERE PlayerIDVictim = '$EscapedPlayerId'
                  AND PlayerIDAttacker != PlayerIDVictim
                ORDER BY Data DESC
                LIMIT 1;
            ")
            if [[ -n "$LastDamage" ]]; then
                local LastDamageData
                LastDamageData=$(echo "$LastDamage" | cut -d"|" -f3)
                INSERT_CUSTOM_LOG "Último dano registrado (fora da janela): $LastDamage (Data: $LastDamageData)" "DEBUG" "$ScriptName"
            else
                INSERT_CUSTOM_LOG "Nenhum dano encontrado no banco para este PlayerId" "DEBUG" "$ScriptName"
            fi
        fi
    fi
    # ============================================================================
    # FIM DA SEÇÃO DE CORRELAÇÃO
    # ============================================================================

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

    # Registrar evento de morte
    if [[ ${#PlayerId} -eq 44 ]]; then
        local Position CoordX CoordY CoordZ DetailsJson Cause
        # Tentar extrair coordenadas do conteúdo original
        Position=$(echo "$content" | sed -n 's/.*pos=<\([^>]*\)>.*/\1/p' | sed 's/, */,/g')
        if [[ -n "$Position" ]]; then
            CoordX=$(echo "$Position" | cut -d',' -f1 | xargs)
            CoordY=$(echo "$Position" | cut -d',' -f2 | xargs)
            CoordZ=$(echo "$Position" | cut -d',' -f3 | xargs)
        fi
        
        # Extrair causa da morte do conteúdo traduzido
        Cause=$(echo "$UpdatedContent" | sed -E 's/.*(morreu por|morreu para|está inconsciente|bled out).*/\1/' | head -n 1)
        if [[ -z "$Cause" ]]; then
            Cause="unknown"
        fi
        
        # Criar JSON com detalhes
        DetailsJson="{\"cause\": \"$Cause\", \"death_message\": \"$UpdatedContent\"}"
        INSERT_PLAYER_EVENT "$PlayerId" "player_death" "$CoordX" "$CoordY" "$CoordZ" "$DetailsJson" ""
        
        # ============================================================================
        # BAN AUTOMÁTICO AO MORRER (PARAMETRIZADO)
        # ============================================================================
        if [[ "$DayzAutoBanOnDeathEnabled" == "1" ]]; then
            INSERT_CUSTOM_LOG "Ban automático ao morrer está ativado. Verificando condições para banir PlayerId: $PlayerId" "DEBUG" "$ScriptName"
            
            # Verificar se variáveis RCON estão configuradas
            if [[ -z "$DayzRConIP" ]] || [[ -z "$DayzRConPort" ]] || [[ -z "$DayzRConPassword" ]] || [[ -z "$AppRconBinFile" ]]; then
                INSERT_CUSTOM_LOG "Configurações RCON não estão completas. Não é possível banir automaticamente." "WARNING" "$ScriptName"
            else
                # Escapar PlayerId para uso seguro em SQL
                local EscapedPlayerId
                EscapedPlayerId=$(echo "$PlayerId" | sed "s/'/''/g")
                
                # Buscar RconGuid do jogador
                local RconGuid
                RconGuid=$(sqlite3 "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT RconGuid FROM players_database WHERE PlayerID = '$EscapedPlayerId' LIMIT 1;")
                
                if [[ -z "$RconGuid" ]]; then
                    INSERT_CUSTOM_LOG "RconGuid não encontrado para PlayerId: $PlayerId. Não é possível banir automaticamente." "WARNING" "$ScriptName"
                else
                    # Validar tempo de ban (deve ser maior que 0)
                    local BanMinutes
                    BanMinutes="${DayzAutoBanOnDeathMinutes:-5}"
                    if ! [[ "$BanMinutes" =~ ^[0-9]+$ ]] || [[ "$BanMinutes" -le 0 ]]; then
                        INSERT_CUSTOM_LOG "Tempo de ban inválido: $BanMinutes. Usando padrão de 5 minutos." "WARNING" "$ScriptName"
                        BanMinutes="5"
                    fi
                    
                    # Executar comando addban via RCON
                    local BanCommand BanMessage RconResponse
                    if [[ "$BanMinutes" -gt 0 ]]; then
                        # Calcular data/hora de desban
                        local UnbanDateTime
                        UnbanDateTime=$(date -d "+$BanMinutes minutes" "+%d/%m/%Y %H:%M" 2>/dev/null || date -v+${BanMinutes}M "+%d/%m/%Y %H:%M" 2>/dev/null || date "+%d/%m/%Y %H:%M")
                        BanMessage="Morreu e foi banido por $BanMinutes minutos. Será desbanido em $UnbanDateTime"
                    else
                        BanMessage="Morreu e foi banido permanentemente"
                    fi
                    BanCommand="addban $RconGuid $BanMinutes $BanMessage"
                    
                    INSERT_CUSTOM_LOG "Executando ban automático via RCON para PlayerId: $PlayerId, RconGuid: $RconGuid, Minutos: $BanMinutes" "INFO" "$ScriptName"
                    
                    set +e # Desabilitar exit on error para capturar erros do comando RCON
                    RconResponse=$("$AppFolder/$AppRconBinFile" -i "$DayzRConIP" -p "$DayzRConPort" -P "$DayzRConPassword" -j "$BanCommand" 2>&1)
                    local RconExitCode=$?
                    set -e # Reabilitar exit on error
                    
                    if [[ $RconExitCode -eq 0 ]]; then
                        # Verificar se a resposta contém "OK" (formato: { "msg": [ "OK" ] })
                        if echo "$RconResponse" | grep -q '"OK"'; then
                            INSERT_CUSTOM_LOG "Comando addban executado com sucesso. Executando loadBans para aplicar o ban..." "INFO" "$ScriptName"
                            
                            # Executar loadBans para efetivar o ban
                            set +e
                            local LoadBansResponse
                            LoadBansResponse=$("$AppFolder/$AppRconBinFile" -i "$DayzRConIP" -p "$DayzRConPort" -P "$DayzRConPassword" -j "loadBans" 2>&1)
                            local LoadBansExitCode=$?
                            set -e
                            
                            if [[ $LoadBansExitCode -eq 0 ]] && echo "$LoadBansResponse" | grep -q '"OK"'; then
                                INSERT_CUSTOM_LOG "Jogador $PlayerId (RconGuid: $RconGuid) banido automaticamente por $BanMinutes minutos após morrer. Ban aplicado com sucesso." "INFO" "$ScriptName"
                            else
                                INSERT_CUSTOM_LOG "addban executado com sucesso, mas loadBans falhou (exit code: $LoadBansExitCode). Resposta: $LoadBansResponse" "WARNING" "$ScriptName"
                                INSERT_CUSTOM_LOG "Jogador $PlayerId (RconGuid: $RconGuid) banido automaticamente por $BanMinutes minutos após morrer, mas loadBans não foi executado." "INFO" "$ScriptName"
                            fi
                        else
                            INSERT_CUSTOM_LOG "Resposta inesperada do RCON ao banir automaticamente: $RconResponse" "WARNING" "$ScriptName"
                        fi
                    else
                        INSERT_CUSTOM_LOG "Erro ao executar ban automático via RCON (exit code: $RconExitCode). Resposta: $RconResponse" "ERROR" "$ScriptName"
                    fi
                fi
            fi
        fi
        # ============================================================================
        # FIM DA SEÇÃO DE BAN AUTOMÁTICO
        # ============================================================================
    fi

    HANDLER_CONTENT=$(echo "$UpdatedContent" | tr -d '\r\n' | sed "s/   */ /g")
}

