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

    HANDLER_CONTENT=$(echo "$UpdatedContent" | tr -d '\r\n' | sed "s/   */ /g")
}

