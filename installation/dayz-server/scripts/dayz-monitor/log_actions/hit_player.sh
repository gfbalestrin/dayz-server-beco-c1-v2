#!/bin/bash

handle_hit_player() {
    local line="$1"
    local content="$2"

    local DamageParsed parser_rc
    DamageParsed=$("$AppFolder/$AppScriptGetPlayerDamageFile" "$content")
    parser_rc=$?
    if [[ $parser_rc -ne 0 || -z "$DamageParsed" ]]; then
        INSERT_CUSTOM_LOG "Falha no parser de dano (rc=$parser_rc)" "ERROR" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    local PlayerIdAttacker PlayerIdVictim
    PlayerIdVictim=$(echo "$DamageParsed" | cut -d"|" -f2)
    PlayerIdAttacker=$(echo "$DamageParsed" | cut -d"|" -f1)

    if [[ "$PlayerIdVictim" == "$PlayerIdAttacker" ]]; then
        INSERT_CUSTOM_LOG "Evento ignorado: PlayerIdVictim e PlayerIdAttacker são iguais ($PlayerIdAttacker)" "DEBUG" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    INSERT_CUSTOM_LOG "Inserindo informações de dano no banco de dados..." "INFO" "$ScriptName"

    local PosAttacker PosVictim LocalDamage HitType Damage Health Data Weapon DistanceMeter
    PosAttacker=$(echo "$DamageParsed" | cut -d"|" -f3 | sed 's/, */,/g')
    PosVictim=$(echo "$DamageParsed" | cut -d"|" -f4 | sed 's/, */,/g')
    LocalDamage=$(echo "$DamageParsed" | cut -d"|" -f5)
    HitType=$(echo "$DamageParsed" | cut -d"|" -f6)
    Damage=$(echo "$DamageParsed" | cut -d"|" -f7)
    Health=$(echo "$DamageParsed" | cut -d"|" -f8)
    Data=$(date "+%Y-%m-%d %H:%M:%S")
    Weapon=$(echo "$DamageParsed" | cut -d"|" -f9)
    DistanceMeter=$(echo "$DamageParsed" | cut -d"|" -f10)

    INSERT_PLAYER_DAMAGE "$PlayerIdAttacker" "$PlayerIdVictim" "$PosAttacker" "$PosVictim" "$LocalDamage" "$HitType" "$Damage" "$Health" "$Data" "$Weapon" "$DistanceMeter"

    # Registrar eventos de dano
    if [[ -n "$PlayerIdVictim" ]] && [[ ${#PlayerIdVictim} -eq 44 ]] && [[ -n "$PlayerIdAttacker" ]] && [[ ${#PlayerIdAttacker} -eq 44 ]]; then
        local CoordXVictim CoordYVictim CoordZVictim CoordXAttacker CoordYAttacker CoordZAttacker DetailsJsonVictim DetailsJsonAttacker
        
        # Extrair coordenadas da vítima
        if [[ -n "$PosVictim" ]]; then
            CoordXVictim=$(echo "$PosVictim" | cut -d',' -f1 | xargs)
            CoordYVictim=$(echo "$PosVictim" | cut -d',' -f2 | xargs)
            CoordZVictim=$(echo "$PosVictim" | cut -d',' -f3 | xargs)
        fi
        
        # Extrair coordenadas do atacante
        if [[ -n "$PosAttacker" ]]; then
            CoordXAttacker=$(echo "$PosAttacker" | cut -d',' -f1 | xargs)
            CoordYAttacker=$(echo "$PosAttacker" | cut -d',' -f2 | xargs)
            CoordZAttacker=$(echo "$PosAttacker" | cut -d',' -f3 | xargs)
        fi
        
        # Criar JSON para vítima (damage_taken)
        DetailsJsonVictim="{\"local_damage\": \"$LocalDamage\", \"hit_type\": \"$HitType\", \"damage\": $Damage, \"health\": $Health, \"weapon\": \"$Weapon\", \"distance\": $DistanceMeter, \"attacker_pos\": \"$PosAttacker\"}"
        INSERT_PLAYER_EVENT "$PlayerIdVictim" "damage_taken" "$CoordXVictim" "$CoordYVictim" "$CoordZVictim" "$DetailsJsonVictim" "$PlayerIdAttacker"
        
        # Criar JSON para atacante (damage_dealt)
        DetailsJsonAttacker="{\"local_damage\": \"$LocalDamage\", \"hit_type\": \"$HitType\", \"damage\": $Damage, \"victim_health\": $Health, \"weapon\": \"$Weapon\", \"distance\": $DistanceMeter, \"victim_pos\": \"$PosVictim\"}"
        INSERT_PLAYER_EVENT "$PlayerIdAttacker" "damage_dealt" "$CoordXAttacker" "$CoordYAttacker" "$CoordZAttacker" "$DetailsJsonAttacker" "$PlayerIdVictim"
    fi

    if [[ "$DayzDeathmatch" -eq "1" ]]; then
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    local PlayerAttacker PlayerVictim
    PlayerAttacker=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdAttacker';")
    if [[ -z "$PlayerAttacker" ]]; then
        INSERT_CUSTOM_LOG "PlayerIdAttacker não encontrado no banco de dados. Ignorando log para o discord..." "ERROR" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    PlayerVictim=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdVictim';")
    if [[ -z "$PlayerVictim" ]]; then
        INSERT_CUSTOM_LOG "PlayerIdVictim não encontrado no banco de dados. Ignorando log para o discord..." "ERROR" "$ScriptName"
        HANDLER_SHOULD_CONTINUE=1
        return
    fi

    local PlayerAttackerName AttackerSteamID AttackerSteamName PlayerVictimName VictimSteamID VictimSteamName
    PlayerAttackerName=$(echo "$PlayerAttacker" | cut -d"|" -f1)
    AttackerSteamID=$(echo "$PlayerAttacker" | cut -d"|" -f2)
    AttackerSteamName=$(echo "$PlayerAttacker" | cut -d"|" -f3)

    PlayerVictimName=$(echo "$PlayerVictim" | cut -d"|" -f1)
    VictimSteamID=$(echo "$PlayerVictim" | cut -d"|" -f2)
    VictimSteamName=$(echo "$PlayerVictim" | cut -d"|" -f3)

    local metros SafePlayerAttackerInfo SafePlayerVictimInfo
    metros=$(echo "$DistanceMeter" | cut -d '.' -f 1)
    SafePlayerAttackerInfo="**$(sanitize_discord_markdown "$PlayerAttackerName")** ([$(sanitize_discord_markdown "$AttackerSteamName")](<https://steamcommunity.com/profiles/$AttackerSteamID>))"
    SafePlayerVictimInfo="**$(sanitize_discord_markdown "$PlayerVictimName")** ([$(sanitize_discord_markdown "$VictimSteamName")](<https://steamcommunity.com/profiles/$VictimSteamID>))"

    HANDLER_CONTENT="Jogador $SafePlayerVictimInfo foi atingido por $SafePlayerAttackerInfo. Local do dano: $LocalDamage, dano sofrido: $Damage, arma: $Weapon, tipo de ataque: $HitType, distância: $metros metros, HP restante: $Health"
}

