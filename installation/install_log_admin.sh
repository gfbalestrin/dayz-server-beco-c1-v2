#!/bin/bash

DELAY=5

# Função de ajuda
usage() {
  echo "Uso: $0 [--skip-discord] [--skip-loadout]"
  exit 1
}

SKIP_DISCORD=0
SKIP_LOADOUT=0
# Processa os argumentos
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-discord)
      SKIP_DISCORD=1
      shift
      ;;
    --skip-loadout)
      SKIP_LOADOUT=1
      shift
      ;;
    *)
      echo "Parâmetro desconhecido: $1"
      usage
      ;;
  esac
done

[[ "$SKIP_DISCORD" -eq 1 ]] && echo "Flag --skip-discord foi ativada. O sistema integrado ao Discord não será instalado." 

echo "Iniciando em $DELAY segundos..."
sleep $DELAY

set -eEuo pipefail  # u para erro em variáveis não definidas, o pipefail para detectar falhas em pipes
#set -x              # debug: mostra cada comando antes de executar

# Função de erro personalizada
erro_tratado() {
    local exit_code=$?
    local cmd="${BASH_COMMAND}"
    echo "❌ Erro ao executar: '$cmd'" >&2
    echo "Código de saída: $exit_code" >&2
    echo "O script falhou. Verifique os detalhes acima." >&2
}
trap erro_tratado ERR

# Verifica se está sendo executado como root
if [[ "$EUID" -ne 0 ]]; then
    echo "Erro: este script deve ser executado como root." >&2
    exit 1
fi

systemctl stop dayz-server

# Atualiza pacotes e instala jq
apt -y update
apt -y install sqlite3

# Determina o diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SCRIPT="$SCRIPT_DIR/config/config.sh"
CONFIG_FILE="$SCRIPT_DIR/config/config.json"

# Valida existência dos arquivos
[[ -f "$CONFIG_SCRIPT" ]] || { echo "Erro: config.sh não encontrado em $CONFIG_SCRIPT"; exit 1; }
[[ -f "$CONFIG_FILE" ]] || { echo "Erro: config.json não encontrado em $CONFIG_FILE"; exit 1; }

# Exporta caminho do JSON para ser usado no config.sh
export CONFIG_FILE

# Executa config.sh
source "$CONFIG_SCRIPT"

if [[ $$DayzDeathmatch == "1" ]]; then
    echo "Ativando o modo Deathmatch ..."
    sleep $DELAY
    cp -R mods/deathmatch/* $DayzFolder/mpmissions/$DayzMpmission/
    chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/mpmissions/$DayzMpmission/"

    DayzMpmissionGlobalsXml="$DayzFolder/mpmissions/$DayzMpmission/db/globals.xml"
    cp -Rap $DayzMpmissionGlobalsXml "$DayzFolder/mpmissions/$DayzMpmission/db/globals.xml.bkp"
    echo "Editando arquivo $DayzMpmissionGlobalsXml ..."
    sleep $DELAY
    sed -i "s#<var name=\"CleanupLifetimeDeadPlayer\" type=\"0\" value=\"3600\"/>#<var name=\"CleanupLifetimeDeadPlayer\" type=\"0\" value=\"10\"/>#g" "$DayzMpmissionGlobalsXml"
    sed -i "s#<var name=\"CleanupLifetimeDeadAnimal\" type=\"0\" value=\"3600\"/>#<var name=\"CleanupLifetimeDeadAnimal\" type=\"0\" value=\"10\"/>#g" "$DayzMpmissionGlobalsXml"
    sed -i "s#<var name=\"CleanupLifetimeDeadInfected\" type=\"0\" value=\"3600\"/>#<var name=\"CleanupLifetimeDeadInfected\" type=\"0\" value=\"10\"/>#g" "$DayzMpmissionGlobalsXml"
    sed -i "s#<var name=\"TimeLogin\" type=\"0\" value=\"3600\"/>#<var name=\"TimeLogin\" type=\"0\" value=\"5\"/>#g" "$DayzMpmissionGlobalsXml"
fi

DayzFolder="/home/$LinuxUserName/servers/dayz-server"
echo "Diretório do servidor: $DayzFolder"
cd "$DayzFolder"
echo "Criando diretório scripts em $DayzFolder"
mkdir -p scripts 
cd scripts

curl -o config.json https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/config.json
curl -o config.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/config.sh
chmod +x config.sh

jq --arg v "$DayzFolder" '.Dayz.ServerFolder = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "mpmissions/$DayzMpmission/storage_1/players.db" '.Dayz.PlayerDbFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "mpmissions/$DayzMpmission/admin_ids.txt" '.Dayz.AdminIdsFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "mpmissions/$DayzMpmission/admin_cmds.txt" '.Dayz.AdminCmdsFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "$DayzDeathmatch" '.Dayz.Deathmatch = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "$DayzWipeOnRestart" '.Dayz.WipeOnRestart = $v' config.json > config_tmp.json && mv config_tmp.json config.json

AppFolder="$DayzFolder/scripts"
jq --arg v "$AppFolder" '.App.Folder = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "databases/players_beco_c1.db" '.App.PlayerBecoC1DbFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "databases/server_beco_c1_logs.db" '.App.ServerBecoC1LogsDbFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "atualiza_players_online.sh" '.App.ScriptUpdatePlayersOnlineFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "extrai_players_stats.sh" '.App.ScriptExtractPlayersStatsFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "monta_killfeed_geral.sh" '.App.ScriptUpdateGeneralKillfeed = $v' config.json > config_tmp.json && mv config_tmp.json config.json
jq --arg v "captura_dano_player.sh" '.App.ScriptGetPlayerDamageFile = $v' config.json > config_tmp.json && mv config_tmp.json config.json

jq --arg v "$SKIP_DISCORD" '.Discord.Desactive = $v' config.json > config_tmp.json && mv config_tmp.json config.json

if [[ "$SKIP_DISCORD" == "0" ]]; then
  jq --arg v "0" '.Discord.Desactive = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordWebhookLogs" '.Discord.WebhookLogs = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordWebhookLogsAdmin" '.Discord.WebhookLogsAdmin = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordChannelPlayersOnlineId" '.Discord.ChannelPlayersOnline.ChannelId = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordChannelPlayersOnlineBotToken" '.Discord.ChannelPlayersOnline.BotToken = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordChannelPlayersStatsId" '.Discord.ChannelPlayersStats.ChannelId = $v' config.json > config_tmp.json && mv config_tmp.json config.json
  jq --arg v "$DiscordChannelPlayersStatsBotToken" '.Discord.ChannelPlayersStats.BotToken = $v' config.json > config_tmp.json && mv config_tmp.json config.json

  echo "Criando mensagem inicial no canal de jogadores online para capturar o id da mensagem..."
  MESSAGE_CONTENT="Mensagem criada automaticamente via API."  
  RESPONSE=$(curl -s -X POST "https://discord.com/api/v10/channels/$DiscordChannelPlayersOnlineId/messages" \
    -H "Authorization: Bot $DiscordChannelPlayersOnlineBotToken" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$MESSAGE_CONTENT\"}")
  echo $RESPONSE
  MESSAGE_ID=$(echo "$RESPONSE" | jq -r '.id')
  jq --arg v "$MESSAGE_ID" '.Discord.ChannelPlayersOnline.MessageId = $v' config.json > config_tmp.json && mv config_tmp.json config.json

  echo "Criando mensagem inicial no canal de jogadores stats para capturar o id da mensagem..."
  MESSAGE_CONTENT="Mensagem criada automaticamente via API."
  RESPONSE=$(curl -s -X POST "https://discord.com/api/v10/channels/$DiscordChannelPlayersStatsId/messages" \
    -H "Authorization: Bot $DiscordChannelPlayersStatsBotToken" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$MESSAGE_CONTENT\"}")
  echo $RESPONSE
  MESSAGE_ID=$(echo "$RESPONSE" | jq -r '.id')
  jq --arg v "$MESSAGE_ID" '.Discord.ChannelPlayersStats.MessageId = $v' config.json > config_tmp.json && mv config_tmp.json config.json

fi

curl -o atualiza_players_online.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/atualiza_players_online.sh
chmod +x atualiza_players_online.sh

echo "#!/bin/bash" > "extrai_players_stats.sh"
chmod +x extrai_players_stats.sh

curl -o monta_killfeed_geral.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/monta_killfeed_geral.sh
chmod +x monta_killfeed_geral.sh

curl -o captura_dano_player.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/captura_dano_player.sh
chmod +x captura_dano_player.sh

curl -o send_events_to_discord.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/send_events_to_discord.sh
chmod +x send_events_to_discord.sh

curl -o send_events_infos_to_discord.sh https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/send_events_infos_to_discord.sh
chmod +x send_events_infos_to_discord.sh

mkdir -p "$DayzFolder/scripts/databases"
cd "$DayzFolder/scripts/databases"

curl -o players_beco_c1.sql https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/databases/players_beco_c1.sql
curl -o server_beco_c1_logs.sql https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/scripts/databases/server_beco_c1_logs.sql

# Cria as bases de dados e executa os comandos SQL
sqlite3 "players_beco_c1.db" < "players_beco_c1.sql"
echo "✔ Banco players_beco_c1.db criado com sucesso."

sqlite3 "server_beco_c1_logs.db" < "server_beco_c1_logs.sql"
echo "✔ Banco server_beco_c1_logs.db criado com sucesso."

chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/scripts/databases"

echo "" > "$DayzFolder/mpmissions/$DayzMpmission/admin_ids.txt"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/mpmissions/$DayzMpmission/admin_ids.txt"

echo "" > "$DayzFolder/mpmissions/$DayzMpmission/admin_cmds.txt"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/mpmissions/$DayzMpmission/admin_cmds.txt"

echo "✔ Scripts configurados com sucesso."

cd "$DayzFolder/mpmissions/$DayzMpmission/"
rm init.c
if [[ "$DayzDeathmatch" == "1" ]]; then
  echo "Baixando init.c para Deathmatch..."
  curl -o init.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/Installation/mods/deathmatch/init.c
else
  echo "Baixando init.c..."
  curl -o init.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/mpmissions/$DayzMpmission/init.c
fi
chown "$LinuxUserName:$LinuxUserName" init.c
mkdir -p admin
cd admin
if [[ "$DayzDeathmatch" == "1" ]]; then
  echo "Baixando Construction.c para Deathmatch..."
  curl -o Construction.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/Installation/mods/deathmatch/admin/Construction.c
  echo "Baixando PlayersLoadout.c para Deathmatch..."
  curl -o PlayersLoadout.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/Installation/mods/deathmatch/admin/PlayersLoadout.c
else
  echo "Baixando AdminLoadout.c..."
  curl -o AdminLoadout.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/mpmissions/$DayzMpmission/admin/AdminLoadout.c
  chown "$LinuxUserName:$LinuxUserName" AdminLoadout.c
fi

curl -o VehicleSpawner.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/dayz-server/mpmissions/$DayzMpmission/admin/VehicleSpawner.c
chown "$LinuxUserName:$LinuxUserName" VehicleSpawner.c

echo > "$DayzFolder/mpmissions/$DayzMpmission/messages_to_send.txt"
echo > "$DayzFolder/profiles/init.log"
echo > "$DayzFolder/profiles/position.log"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/profiles"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/mpmissions/$DayzMpmission/admin"

if [[ "$DayzDeathmatch" == "1" ]]; then
  curl -o "$DayzFolder/mpmissions/$DayzMpmission/deathmatch_config.json" https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1/refs/heads/main/Installation/mods/deathmatch/deathmatch_config.json
  chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/mpmissions/$DayzMpmission/deathmatch_config.json"
fi


if [[ "$SKIP_LOADOUT" == "0" ]]; then
  echo "Configurando aplicação logout..."
  exit 0
  APP_LOADOUT_FOLDER="$AppFolder/app_player_loadout"
  mkdir -p "$APP_LOADOUT_FOLDER"
  cd "$APP_LOADOUT_FOLDER"  
  apt -y install git python3 python3-pip python3.11-venv
  rm -rf /tmp/dayz-server-beco-c1
  git clone https://github.com/gfbalestrin/dayz-server-beco-c1.git /tmp/dayz-server-beco-c1
  cp -Rap /tmp/dayz-server-beco-c1/app_player_loadout/admin/templates .
  cp -Rap /tmp/dayz-server-beco-c1/app_player_loadout/admin/app.py .
  ls -lh
  python3 -m venv venv
  source venv/bin/activate
  pip install Flask requests filelock apscheduler

  chown -R "$LinuxUserName:$LinuxUserName" "$APP_LOADOUT_FOLDER"
fi
exit 0
source ${DayzFolder}/scripts/update.sh

sleep 5



echo "Configurando serviço de logs..."
sleep 5

# Criar dayz-logs-discord.service
cat <<EOF > /etc/systemd/system/dayz-logs-discord.service
[Unit]
Description=DayZ Logs Discord
Wants=network-online.target
After=network.target

[Service]
ExecStart=${DayzFolder}/scripts/send_events_to_discord.sh &
WorkingDirectory=${DayzFolder}/scripts/
ExecReload=/bin/kill -s HUP \$MAINPID
ExecStop=/bin/kill -s INT \$MAINPID
User=${LinuxUserName}
Group=${LinuxUserName}
Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target
EOF

# Criar dayz-infos-logs-discord.service
cat <<EOF > /etc/systemd/system/dayz-infos-logs-discord.service
[Unit]
Description=DayZ Infos Logs Discord
Wants=network-online.target
After=network.target

[Service]
ExecStart=${DayzFolder}/scripts/send_events_infos_to_discord.sh &
WorkingDirectory=${DayzFolder}/scripts/
ExecReload=/bin/kill -s HUP \$MAINPID
ExecStop=/bin/kill -s INT \$MAINPID
User=${LinuxUserName}
Group=${LinuxUserName}
Restart=on-failure
RestartSec=30s

[Install]
WantedBy=multi-user.target
EOF

# Atualizar systemd e habilitar os serviços
systemctl daemon-reexec
systemctl daemon-reload
systemctl enable dayz-logs-discord.service
systemctl enable dayz-infos-logs-discord.service

# systemctl start dayz-logs-discord.service
# systemctl start dayz-infos-logs-discord.service

# systemctl status dayz-logs-discord.service
# systemctl status dayz-infos-logs-discord.service

echo "Serviços criados e habilitados com sucesso."


echo "Para iniciar o servidor digite o comando: "
echo "systemctl start dayz-server && systemctl start dayz-logs-discord.service && systemctl start dayz-infos-logs-discord.service"