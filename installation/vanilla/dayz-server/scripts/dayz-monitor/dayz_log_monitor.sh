#!/bin/bash

# Carrega as variáveis
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

sanitize_discord_markdown() {
    local input="$1"
    echo "$input" | tr -d '\n\r' | sed -e 's/[*_~`|]/\\&/g' -e 's/[][\()<>]/\\&/g' -e 's/["\\]/\\&/g'
}

ScriptName=$(basename "$0")
LogFileName="$DayzServerFolder/$DayzLogAdmFile"

INSERT_CUSTOM_LOG "Monitorando arquivo: $LogFileName" "INFO" "$ScriptName"

stdbuf -oL tail -n 0 -F "$LogFileName" | while IFS= read -r Line; do
    # Ignora linhas que não contêm os eventos desejados
    if [[ "$Line" != *"killed by"* && \
          "$Line" != *"is unconscious"* && \
          "$Line" != *"bled out"* && \
          "$Line" != *"died. Stats"* && \
          "$Line" != *"hit by Player"* && \
          "$Line" != *"Chat("* ]]; then
        continue
    fi
    
    echo "$Line" | grep -q "\[HP: 0\]" && continue

    INSERT_ADM_LOG "$Line" "INFO"
    # Remove primeiros 12 caracteres que contém informações de data e hora
    Content=$(echo "$Line" | cut -c 12-)
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    INSERT_CUSTOM_LOG "Evento capturado: $Content" "INFO" "$ScriptName"

    # Dano em player
    if [[ "$Content" == *"hit by Player"* ]]; then
        DamageParsed=$("$AppFolder/$AppScriptGetPlayerDamageFile" "$Content")
        parser_rc=$?
        echo "$DamageParsed"
        INSERT_CUSTOM_LOG "$DamageParsed" "INFO" "$ScriptName"
        if [ $parser_rc -eq 0 ] && [[ -n "$DamageParsed" ]]; then
            INSERT_CUSTOM_LOG "Inserindo informações de dano no banco de dados..." "INFO" "$ScriptName"
			PlayerIdVictim=$(echo "$DamageParsed" | cut -d"|" -f2)
            PlayerIdAttacker=$(echo "$DamageParsed" | cut -d"|" -f1)
            
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

            if [[ "$DayzDeathmatch" -eq "1" ]]; then
                continue
            fi

            PlayerAttacker=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdAttacker';")
            if [[ -n "$PlayerAttacker" ]]; then
                PlayerAttackerName=$(echo "$PlayerAttacker" | cut -d"|" -f1)
                AttackerSteamID=$(echo "$PlayerAttacker" | cut -d"|" -f2)
                AttackerSteamName=$(echo "$PlayerAttacker" | cut -d"|" -f3)
                PlayerAttackerInfo="**$(sanitize_discord_markdown "$PlayerAttackerName")** ([$(sanitize_discord_markdown "$AttackerSteamName")](https://steamcommunity.com/profiles/$AttackerSteamID))"
                SafePlayerAttackerInfo="$PlayerAttackerInfo"
            else
                INSERT_CUSTOM_LOG "PlayerIdAttacker não encontrado no banco de dados. Ignorando log para o discord..." "ERROR" "$ScriptName"
                continue
            fi

            PlayerVictim=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdVictim';")
            if [[ -n "$PlayerVictim" ]]; then
                PlayerVictimName=$(echo "$PlayerVictim" | cut -d"|" -f1)
                VictimSteamID=$(echo "$PlayerVictim" | cut -d"|" -f2)
                VictimSteamName=$(echo "$PlayerVictim" | cut -d"|" -f3)
                PlayerVictimInfo="**$(sanitize_discord_markdown "$PlayerVictimName")** ([$(sanitize_discord_markdown "$VictimSteamName")](https://steamcommunity.com/profiles/$VictimSteamID))"
                SafePlayerVictimInfo="$PlayerVictimInfo"
            else
                INSERT_CUSTOM_LOG "PlayerIdVictim não encontrado no banco de dados. Ignorando log para o discord..." "ERROR" "$ScriptName"
                continue
            fi
            
            metros=$(echo "$DistanceMeter" | cut -d '.' -f 1)
            Content="Jogador $SafePlayerVictimInfo foi atingido por $SafePlayerAttackerInfo. Local do dano: $LocalDamage, dano sofrido: $Damage, arma: $Weapon, tipo de ataque: $HitType, distância: $metros metros, HP restante: $Health"
        else
            INSERT_CUSTOM_LOG "Falha no parser de dano (rc=$parser_rc)" "ERROR" "$ScriptName"
            continue
        fi
    # Chat do jogo com comandos 
	elif [[ "$Content" == *"Chat("* ]]; then
		PlayerId=$(echo $Content | awk -F'id=' '{print $2}' | awk -F')' '{print $1}')
		if [[ "$PlayerId" == "" ]]; then			
			INSERT_CUSTOM_LOG "Ignorando pois PlayerId está em branco" "INFO" "$ScriptName"
			continue
		fi
		Command="${Content##*: }"
        if [[ "$Command" == "!"* ]]; then
            Command="${Command:1}"
        fi
        echo $Command
        echo "$PlayerId $Command" >>"$DayzServerFolder/$DayzAdminCmdsFile"
        continue
    # Evento de morte por player
    elif [[ "$Content" == *"killed by Player"* ]]; then
        INSERT_CUSTOM_LOG "Evento de PVP detectado!" "INFO" "$ScriptName"

        # Extrai IDs dos jogadores (killer e killed) com regex aprimorada
        PlayerIdKilled=$(echo "$Content" | grep -oP 'id=\K[^ ]+' | sed -n '1p')
		PlayerIdKiller=$(echo "$Content" | grep -oP 'id=\K[^ ]+' | sed -n '2p')

        INSERT_CUSTOM_LOG "PlayerIdKiller: '$PlayerIdKiller', PlayerIdKilled: '$PlayerIdKilled'" "DEBUG" "$ScriptName"

        Weapon=$(echo "$Content" | grep -oP 'with \K\w+')
        Distance=$(echo "$Content" | grep -oP 'from \K\d+\.\d+')
        metros=$(echo "$Distance" | cut -d '.' -f 1)

        PostKilled=$(echo "$Content" | sed -n 's/.*pos=<\([^>]*\)>.*pos=<[^>]*>.*/\1/p' | sed 's/, */,/g')
        PosKiller=$(echo "$Content" | sed -n 's/.*pos=<[^>]*>.*pos=<\([^>]*\)>.*/\1/p' | sed 's/, */,/g')
        Data=$(date "+%Y-%m-%d %H:%M:%S")
        INSERT_KILLFEED "$PlayerIdKiller" "$PlayerIdKilled" "$Weapon" "$metros" "$Data" "$PosKiller" "$PostKilled"

        PlayerKiller=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdKiller';")
        PlayerVictim=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerIdKilled';")

        if [[ -n "$PlayerKiller" && -n "$PlayerVictim" ]]; then
            PlayerKillerName=$(echo "$PlayerKiller" | cut -d"|" -f1)
            KillerSteamID=$(echo "$PlayerKiller" | cut -d"|" -f2)
            KillerSteamName=$(echo "$PlayerKiller" | cut -d"|" -f3)
            PlayerVictimName=$(echo "$PlayerVictim" | cut -d"|" -f1)
            VictimSteamID=$(echo "$PlayerVictim" | cut -d"|" -f2)
            VictimSteamName=$(echo "$PlayerVictim" | cut -d"|" -f3)

            PlayerKillerInfo="**$(sanitize_discord_markdown "$PlayerKillerName")** ([$(sanitize_discord_markdown "$KillerSteamName")](<https://steamcommunity.com/profiles/$KillerSteamID>))"
            PlayerVictimInfo="**$(sanitize_discord_markdown "$PlayerVictimName")** ([$(sanitize_discord_markdown "$VictimSteamName")](<https://steamcommunity.com/profiles/$VictimSteamID>))"

            Content="💀 Jogador ${PlayerVictimInfo} foi executado por ${PlayerKillerInfo}. Arma: ${Weapon}, distância: ${metros} metros"

            # Mensagem ingame
            echo "Jogador $PlayerKillerName eliminou $PlayerVictimName" >> "$DayzServerFolder/$DayzMessagesToSendoFile"
        else
            INSERT_CUSTOM_LOG "PlayerIdKiller ou PlayerIdVictim não encontrado no banco de dados. Ignorando mensagem para Discord." "ERROR" "$ScriptName"
            continue
        fi

    else
		Content="${Content//is unconscious/está inconsciente}"
        Content="${Content//bled out/morreu por sangramento}"
        Content="${Content//killed by/morto por}"
        Content="${Content//(DEAD)/}"
        Content=$(echo "$Content" | sed -E 's/died\..*/morreu para o ambiente/')

        PlayerId=$(echo "$Content" | grep -oP 'id=\K[^ ]+' | head -n 1)

        if [[ ${#PlayerId} -eq 44 ]]; then
            PlayerExists=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PlayerId';")
            if [[ -n "$PlayerExists" ]]; then
                PlayerName=$(echo "$PlayerExists" | cut -d"|" -f1)
                SteamID=$(echo "$PlayerExists" | cut -d"|" -f2)
                SteamName=$(echo "$PlayerExists" | cut -d"|" -f3)

                # Aplica o mesmo formato utilizado em PlayerKillerInfo
                PlayerInfo="**$(sanitize_discord_markdown "$PlayerName")** ([$(sanitize_discord_markdown "$SteamName")](<https://steamcommunity.com/profiles/$SteamID>))"
                
                INSERT_CUSTOM_LOG "Informações do jogador: $PlayerInfo" "INFO" "$ScriptName"

                # Substitui o nome original no conteúdo SEM aspas
                SafePlayerInfo=$(printf '%s\n' "$PlayerInfo" | sed 's/[&/]/\\&/g')
                # Remove o trecho entre parênteses contendo id=... pos=...
				CleanContent=$(echo "$Content" | sed -E 's/ \(id=[^)]*\)//')

				# Substitui o nome do player
				NewContent=$(echo "$CleanContent" | sed -E "s|(Player )\"[^\"]+\"|\1$SafePlayerInfo|")


                if [[ -n "$NewContent" ]]; then
                    Content="$NewContent"
                    INSERT_CUSTOM_LOG "Evento formatado com informações do jogador: $Content" "INFO" "$ScriptName"
                else
                    INSERT_CUSTOM_LOG "Erro ao formatar o evento com informações do jogador" "INFO" "$ScriptName"
                fi
            else
                INSERT_CUSTOM_LOG "PlayerId não encontrado no banco de dados. Ignorando..." "INFO" "$ScriptName"
            fi
        else
            INSERT_CUSTOM_LOG "Não foi possível capturar o PlayerId do evento" "INFO" "$ScriptName"
        fi

        # Tradução final
        Content="${Content//Player/Jogador}"

    fi

    Content=$(echo "$Content" | tr -d '\r\n' | sed "s/   */ /g")

    # Envia $Content para discord
    SEND_DISCORD_WEBHOOK "$Content" "$DiscordWebhookLogs" "$CurrentDate" "$ScriptName"

done
