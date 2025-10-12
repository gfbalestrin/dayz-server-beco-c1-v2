#!/bin/bash

export TZ=America/Sao_Paulo

[ -z "${CONFIG_FILE:-}" ] && { echo "Erro: CONFIG_FILE não foi definido."; return 1; }

# Leitura dos dados usando jq
LinuxUserName=$(jq -r '.Linux.User.Name // empty' "$CONFIG_FILE")
if [[ -z "$LinuxUserName" ]]; then
    echo "Erro: Nome de usuário não encontrado no arquivo JSON."
    return 1
fi
export LinuxUserName

LinuxUserPassword=$(jq -r '.Linux.User.Password // empty' "$CONFIG_FILE")
if [[ -z "$LinuxUserPassword" ]]; then
    echo "Erro: Senha de usuário não encontrada no arquivo JSON."
    return 1
fi
export LinuxUserPassword

SteamAccount=$(jq -r '.Steam.Account // empty' "$CONFIG_FILE")
if [[ -z "$SteamAccount" ]]; then
    echo "Erro: Conta da steam não encontrada no arquivo JSON."
    return 1
fi
export SteamAccount

DayzServerName=$(jq -r '.DayZ.ServerName // empty' "$CONFIG_FILE")
if [[ -z "$DayzServerName" ]]; then
    echo "Erro: Nome do servidor não encontrado no arquivo JSON."
    return 1
fi
export DayzServerName

DayzPasswordAdmin=$(jq -r '.DayZ.PasswordAdmin // empty' "$CONFIG_FILE")
if [[ -z "$DayzPasswordAdmin" ]]; then
    echo "Erro: Senha de admin do servidor não encontrada no arquivo JSON."
    return 1
fi
export DayzPasswordAdmin

DayzMaxPlayers=$(jq -r '.DayZ.MaxPlayers // empty' "$CONFIG_FILE")
if [[ -z "$DayzMaxPlayers" ]]; then
    echo "Erro: Número máximo de jogadores não encontrado no arquivo JSON."
    return 1
fi
export DayzMaxPlayers

DayzMotdMessage=$(jq -r '.DayZ.MotdMessage // empty' "$CONFIG_FILE")
if [[ -z "$DayzMotdMessage" ]]; then
    echo "Erro: Mensagem do servidor não encontrada no arquivo JSON."
    return 1
fi
export DayzMotdMessage

DayzMotdIntervalSeconds=$(jq -r '.DayZ.MotdIntervalSeconds // empty' "$CONFIG_FILE")
if [[ -z "$DayzMotdIntervalSeconds" ]]; then
    echo "Erro: Intervalo da mensagem do servidor não encontrado no arquivo JSON."
    return 1
fi
export DayzMotdIntervalSeconds

DayzPcCpuMaxCores=$(jq -r '.DayZ.PcCpuMaxCores // empty' "$CONFIG_FILE")
if [[ -z "$DayzPcCpuMaxCores" ]]; then
    echo "Erro: Máximo de núcleos da CPU não encontrado no arquivo JSON."
    return 1
fi
export DayzPcCpuMaxCores

DayzPcCpuReservedcores=$(jq -r '.DayZ.PcCpuReservedcores // empty' "$CONFIG_FILE")
if [[ -z "$DayzPcCpuReservedcores" ]]; then
    echo "Erro: Núcleos reservados da CPU não encontrado no arquivo JSON."
    return 1
fi
export DayzPcCpuReservedcores

DayzRestartMinutes=$(jq -r '.DayZ.RestartMinutes // empty' "$CONFIG_FILE")
if [[ -z "$DayzRestartMinutes" ]]; then
    echo "Erro: RestartMinutes não encontrado no arquivo JSON."
    return 1
fi
export DayzRestartMinutes


DayzRConPassword=$(jq -r '.DayZ.RConPassword // empty' "$CONFIG_FILE")
if [[ -z "$DayzRConPassword" ]]; then
    echo "Erro: Senha RCon não encontrada no arquivo JSON."
    return 1
fi
export DayzRConPassword

DayzMaxPing=$(jq -r '.DayZ.MaxPing // empty' "$CONFIG_FILE")
if [[ -z "$DayzMaxPing" ]]; then
    echo "Erro: Máximo de ping não encontrado no arquivo JSON."
    return 1
fi
export DayzMaxPing

DayzRestrictRCon=$(jq -r '.DayZ.RestrictRCon // empty' "$CONFIG_FILE")
if [[ -z "$DayzRestrictRCon" ]]; then
    echo "Erro: Restrição RCon não encontrada no arquivo JSON."
    return 1
fi
export DayzRestrictRCon

DayzRConPort=$(jq -r '.DayZ.RConPort // empty' "$CONFIG_FILE")
if [[ -z "$DayzRConPort" ]]; then
    echo "Erro: Porta RCon não encontrada no arquivo JSON."
    return 1
fi
export DayzRConPort

DayzRConIP=$(jq -r '.DayZ.RConIP // empty' "$CONFIG_FILE")
if [[ -z "$DayzRConIP" ]]; then
    echo "Erro: IP RCon não encontrado no arquivo JSON."
    return 1
fi
export DayzRConIP

DayzMpmission=$(jq -r '.DayZ.MpMission // empty' "$CONFIG_FILE")
if [[ -z "$DayzMpmission" ]]; then
    echo "Erro: Mpmission não encontrado no arquivo JSON."
    return 1
fi
export DayzMpmission

DayzLimitFPS=$(jq -r '.DayZ.LimitFPS // empty' "$CONFIG_FILE")
if [[ -z "$DayzLimitFPS" ]]; then
    echo "Erro: Limite de FPS não encontrado no arquivo JSON."
    return 1
fi
export DayzLimitFPS

DayzDeathmatch=$(jq -r '.DayZ.Deathmatch // empty' "$CONFIG_FILE")
if [[ -z "$DayzDeathmatch" ]]; then
    echo "Erro: Deathmatch não encontrado no arquivo JSON."
    return 1
fi
export DayzDeathmatch

DayzWipeOnRestart=$(jq -r '.DayZ.WipeOnRestart // empty' "$CONFIG_FILE")
if [[ -z "$DayzWipeOnRestart" ]]; then
    echo "Erro: WipeOnRestart não encontrado no arquivo JSON."
    return 1
fi
export DayzWipeOnRestart

# --- VALIDAÇÕES GERAIS ---

# Função de erro
error_exit() {
  echo "Erro: $1"
  exit 1
}

# Validação de variáveis obrigatórias não vazias
[ -z "$LinuxUserName" ] && error_exit "LinuxUserName não pode estar vazio."
[ -z "$LinuxUserPassword" ] && error_exit "LinuxUserPassword não pode estar vazio."
[ -z "$DayzServerName" ] && error_exit "DayzServerName não pode estar vazio."
[ -z "$DayzPasswordAdmin" ] && error_exit "DayzPasswordAdmin não pode estar vazio."
[ -z "$DayzMaxPlayers" ] && error_exit "DayzMaxPlayers não pode estar vazio."
[ -z "$DayzMotdMessage" ] && error_exit "DayzMotdMessage não pode estar vazio."
[ -z "$DayzMotdIntervalSeconds" ] && error_exit "DayzMotdIntervalSeconds não pode estar vazio."
[ -z "$DayzPcCpuMaxCores" ] && error_exit "DayzPcCpuMaxCores não pode estar vazio."
[ -z "$DayzPcCpuReservedcores" ] && error_exit "DayzPcCpuReservedcores não pode estar vazio."
[ -z "$DayzRConPassword" ] && error_exit "DayzRConPassword não pode estar vazio."
[ -z "$DayzMaxPing" ] && error_exit "DayzMaxPing não pode estar vazio."
[ -z "$DayzRestrictRCon" ] && error_exit "DayzRestrictRCon não pode estar vazio."
[ -z "$DayzRConPort" ] && error_exit "DayzRConPort não pode estar vazio."
[ -z "$DayzRConIP" ] && error_exit "DayzRConIP não pode estar vazio."
[ -z "$DayzMpmission" ] && error_exit "DayzMpmission não pode estar vazio."
[ -z "$DayzLimitFPS" ] && error_exit "DayzLimitFPS não pode estar vazio."
[ -z "$DayzDeathmatch" ] && error_exit "DayzDeathmatch não pode estar vazio."
[ -z "$DayzWipeOnRestart" ] && error_exit "DayzWipeOnRestart não pode estar vazio."
[ -z "$SteamAccount" ] && error_exit "SteamAccount não pode estar vazio."

# --- VALIDAÇÕES DE FORMATO/VALOR ---

# DayzMaxPlayers deve ser um número inteiro entre 1 e 60
[[ "$DayzMaxPlayers" =~ ^[0-9]+$ ]] && [ "$DayzMaxPlayers" -le 60 ] && [ "$DayzMaxPlayers" -ge 1 ] || error_exit "DayzMaxPlayers deve ser um número inteiro entre 1 e 60."

# DayzMotdIntervalSeconds deve estar entre 60 e 3600
[[ "$DayzMotdIntervalSeconds" =~ ^[0-9]+$ ]] && [ "$DayzMotdIntervalSeconds" -ge 60 ] && [ "$DayzMotdIntervalSeconds" -le 3600 ] || error_exit "DayzMotdIntervalSeconds deve estar entre 60 e 3600."

# DayzPcCpuMaxCores deve ser número inteiro >= 1
[[ "$DayzPcCpuMaxCores" =~ ^[0-9]+$ ]] && [ "$DayzPcCpuMaxCores" -ge 1 ] || error_exit "DayzPcCpuMaxCores deve ser um número inteiro maior ou igual a 1."

# DayzPcCpuReservedcores deve ser número inteiro >= 0
[[ "$DayzPcCpuReservedcores" =~ ^[0-9]+$ ]] || error_exit "DayzPcCpuReservedcores deve ser um número inteiro."

# DayzMaxPing deve ser número inteiro >= 0
[[ "$DayzMaxPing" =~ ^[0-9]+$ ]] || error_exit "DayzMaxPing deve ser um número inteiro."

# DayzRestrictRCon deve ser 0 ou 1
[[ "$DayzRestrictRCon" == "0" || "$DayzRestrictRCon" == "1" ]] || error_exit "DayzRestrictRCon deve ser '0' ou '1'."

# DayzRConPort deve ser número de porta válido (1–65535)
[[ "$DayzRConPort" =~ ^[0-9]+$ ]] && [ "$DayzRConPort" -ge 1 ] && [ "$DayzRConPort" -le 65535 ] || error_exit "DayzRConPort deve ser um número entre 1 e 65535."

# DayzRConIP deve ser IPv4 válido
[[ "$DayzRConIP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || error_exit "DayzRConIP deve ser um IPv4 válido (ex: 0.0.0.0)."

# DayzMpmission deve ser um dos valores permitidos
case "$DayzMpmission" in
  "dayzOffline.chernarusplus"|"dayzOffline.enoch"|"dayzOffline.sakhal") ;;
  *) error_exit "DayzMpmission deve ser 'dayzOffline.chernarusplus', 'dayzOffline.enoch' ou 'dayzOffline.sakhal'." ;;
esac

# DayzLimitFPS deve ser número inteiro > 0
[[ "$DayzLimitFPS" =~ ^[0-9]+$ ]] && [ "$DayzLimitFPS" -ge 1 ] || error_exit "DayzLimitFPS deve ser um número inteiro maior que zero."

# DayzDeathmatch deve ser "0" ou "1"
[[ "$DayzDeathmatch" == "0" || "$DayzDeathmatch" == "1" ]] || error_exit "DayzDeathmatch deve ser '0' ou '1'."

# DayzWipeOnRestart deve ser "0" ou "1"
[[ "$DayzWipeOnRestart" == "0" || "$DayzWipeOnRestart" == "1" ]] || error_exit "DayzWipeOnRestart deve ser '0' ou '1'."

# --- REGRA EXTRA DE INCOMPATIBILIDADE ---
if [[ "$DayzMpmission" != "dayzOffline.chernarusplus" && "$DayzDeathmatch" == "1" ]]; then
  error_exit "Erro: Somente a missão dayzOffline.chernarusplus é compatível com o modo deathmatch."
fi

DiscordWebhookLogs=$(jq -r '.Discord.WebhookLogs // empty' "$CONFIG_FILE")
if [[ -z "$DiscordWebhookLogs" ]]; then
    echo "Erro: DiscordWebhookLogs não encontrado no arquivo JSON."
    return 1
fi
export DiscordWebhookLogs

DiscordWebhookLogsAdmin=$(jq -r '.Discord.WebhookLogsAdmin // empty' "$CONFIG_FILE")
if [[ -z "$DiscordWebhookLogsAdmin" ]]; then
    echo "Erro: DiscordWebhookLogsAdmin não encontrado no arquivo JSON."
    return 1
fi
export DiscordWebhookLogsAdmin

DiscordChannelPlayersOnlineId=$(jq -r '.Discord.ChannelPlayersOnline.ChannelId // empty' "$CONFIG_FILE")
if [[ -z "$DiscordChannelPlayersOnlineId" ]]; then
    echo "Erro: DiscordChannelPlayersOnlineId não encontrado no arquivo JSON."
    return 1
fi
export DiscordChannelPlayersOnlineId
DiscordChannelPlayersOnlineBotToken=$(jq -r '.Discord.ChannelPlayersOnline.BotToken // empty' "$CONFIG_FILE")
if [[ -z "$DiscordChannelPlayersOnlineBotToken" ]]; then
    echo "Erro: DiscordChannelPlayersOnlineBotToken não encontrado no arquivo JSON."
    return 1
fi

DiscordChannelPlayersStatsId=$(jq -r '.Discord.ChannelPlayersStats.ChannelId // empty' "$CONFIG_FILE")
if [[ -z "$DiscordChannelPlayersStatsId" ]]; then
    echo "Erro: DiscordChannelPlayersStatsId não encontrado no arquivo JSON."
    return 1
fi
export DiscordChannelPlayersStatsId
DiscordChannelPlayersStatsBotToken=$(jq -r '.Discord.ChannelPlayersStats.BotToken // empty' "$CONFIG_FILE")
if [[ -z "$DiscordChannelPlayersStatsBotToken" ]]; then
    echo "Erro: DiscordChannelPlayersStatsBotToken não encontrado no arquivo JSON."
    return 1
fi
export DiscordChannelPlayersStatsBotToken
