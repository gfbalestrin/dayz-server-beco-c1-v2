#!/bin/bash

source ./config.sh

PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"

CURRENT_DATE=`date "+%d/%m/%Y %H:%M:%S"`
Content="💀 **Ranking geral de kills (atualizado em $CURRENT_DATE):**\n\n"
i=1
while IFS='|' read -r PlayerID PlayerName SteamID SteamName TotalKills LongestKill Weapon; do
    echo "--------------------------------------------"
    echo "Player ID       : $PlayerID"
    echo "Player Name     : ${PlayerName:-<sem nome>}"
    echo "Total Kills     : $TotalKills"
    echo "Longest Kill    : $LongestKill metros"
    echo "Preferred Weapon: $Weapon"

    [ -z "$PlayerName" ] && PlayerName="Desconhecido"
    [ -z "$Weapon" ] && Weapon="Desconhecida"
    [ -z "$LongestKill" ] && LongestKill="0"
    [ -z "$TotalKills" ] && TotalKills="0"
    link_steam="**Desconhecido**"
    if [[ $SteamID != "" && $SteamName != "" ]]; then
        link_steam="[$SteamName](<https://steamcommunity.com/profiles/$SteamID>)"
    fi
    player_info="**$PlayerName** ($link_steam)"
    metros=$(echo $LongestKill | cut -d '.' -f 1)

    if [ $i -eq 1 ]; then
        Content+="🥇 $player_info matou $TotalKills jogadores \n 🔫 Arma preferida: $Weapon \n 🎯 Maior distância de execução: $metros metros \n"
    elif [ $i -eq 2 ]; then
        Content+="🥈 $player_info matou $TotalKills jogadores \n 🔫 Arma preferida: $Weapon \n 🎯 Maior distância de execução: $metros metros \n"
    elif [ $i -eq 3 ]; then
    	Content+="🥉 $player_info matou $TotalKills jogadores \n 🔫 Arma preferida: $Weapon \n 🎯 Maior distância de execução: $metros metros \n"
    else
 	    Content+="🏅 $player_info matou $TotalKills jogadores \n 🔫 Arma preferida: $Weapon \n 🎯 Maior distância de execução: $metros metros \n"
    fi
    Content+="\n"
    i=$((i+1))    
done < <(sqlite3 -separator '|' "$PLAYERS_BECO_C1_DB" "
WITH KillStats AS (
    SELECT
        k.PlayerIDKiller,
        COUNT(*) AS TotalKills,
        MAX(k.DistanceMeter) AS LongestKillDistance
    FROM players_killfeed k
    GROUP BY k.PlayerIDKiller
),
PreferredWeapons AS (
    SELECT
        k.PlayerIDKiller,
        k.Weapon,
        COUNT(*) AS WeaponCount,
        ROW_NUMBER() OVER (PARTITION BY k.PlayerIDKiller ORDER BY COUNT(*) DESC) AS WeaponRank
    FROM players_killfeed k
    GROUP BY k.PlayerIDKiller, k.Weapon
)
SELECT
    ks.PlayerIDKiller,
    pd.PlayerName,
    pd.SteamID,
    pd.SteamName,
    ks.TotalKills,
    ks.LongestKillDistance,
    pw.Weapon
FROM KillStats ks
JOIN PreferredWeapons pw ON ks.PlayerIDKiller = pw.PlayerIDKiller AND pw.WeaponRank = 1
LEFT JOIN players_database pd ON ks.PlayerIDKiller = pd.PlayerID
ORDER BY ks.TotalKills DESC, ks.LongestKillDistance DESC
LIMIT 10;
")

FirstDate=$(sqlite3 "$PLAYERS_BECO_C1_DB" "SELECT Data FROM players_killfeed ORDER BY Data ASC LIMIT 1;")
Content+="Obs: Dados coletados a partir de $FirstDate"
Content+="...\n"

#echo "$Content"

URL="https://discord.com/api/v10/channels/$DiscordChannelPlayersStatsChannelId/messages/$DiscordChannelPlayersStatsMessageId"
response=$(curl -s -X PATCH \
-H "Authorization: Bot $DiscordChannelPlayersStatsBotToken" \
-H "Content-Type: application/json" \
-d "{\"content\": \"$Content\"}" \
"$URL")