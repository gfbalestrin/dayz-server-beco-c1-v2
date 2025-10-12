#!/bin/bash

DELAY=1

# Função de confirmação
confirm_step() {
    local step_name="$1"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "📋 Próxima etapa: $step_name"
    echo "════════════════════════════════════════════════════════════════"
    read -p "Deseja continuar? (s/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[SsYy]$ ]]; then
        echo "❌ Instalação cancelada pelo usuário na etapa: $step_name"
        exit 0
    fi
    echo "✅ Prosseguindo com: $step_name"
    echo ""
}

# Função de ajuda
usage() {
  echo "Uso: $0 [--skip-user] [--skip-steam] [--no-confirm]"
  echo "  --skip-user     Pula a criação do usuário Linux"
  echo "  --skip-steam    Pula a instalação do SteamCMD"
  echo "  --no-confirm    Executa sem pedir confirmações (modo automático)"
  exit 1
}

SKIP_USER=0
SKIP_STEAM=0
NO_CONFIRM=0

# Processa os argumentos
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-user)
      SKIP_USER=1
      shift
      ;;
    --skip-steam)
      SKIP_STEAM=1
      shift
      ;;
    --no-confirm)
      NO_CONFIRM=1
      shift
      ;;
    *)
      echo "Parâmetro desconhecido: $1"
      usage
      ;;
  esac
done

# Sobrescreve função confirm_step se --no-confirm estiver ativo
if [[ "$NO_CONFIRM" -eq 1 ]]; then
    confirm_step() {
        local step_name="$1"
        echo ""
        echo "════════════════════════════════════════════════════════════════"
        echo "📋 Executando: $step_name"
        echo "════════════════════════════════════════════════════════════════"
        echo ""
    }
fi

[[ "$SKIP_USER" -eq 1 ]] && echo "Flag --skip-user foi ativada"
[[ "$SKIP_STEAM" -eq 1 ]] && echo "Flag --skip-steam foi ativada"
[[ "$NO_CONFIRM" -eq 1 ]] && echo "Flag --no-confirm foi ativada (modo automático)"

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

# Define o timezone desejado
TIMEZONE="America/Sao_Paulo"

confirm_step "Configuração de Timezone para $TIMEZONE"

# Verifica se o timezone existe
if [ -f "/usr/share/zoneinfo/$TIMEZONE" ]; then
  # Remove o link simbólico atual, se existir
  rm -f /etc/localtime

  # Cria um novo link simbólico para o timezone desejado
  ln -s "/usr/share/zoneinfo/$TIMEZONE" /etc/localtime

  # Grava o timezone no arquivo /etc/timezone (para algumas distros, como Debian/Ubuntu)
  echo "$TIMEZONE" | tee /etc/timezone

  echo "Timezone configurado para $TIMEZONE com sucesso."
else
  echo "Timezone '$TIMEZONE' não encontrado."
  exit 1
fi

confirm_step "Atualização de pacotes e instalação de dependências (jq, curl, wget)"

# Atualiza pacotes e instala jq
echo "⏳ Verificando se o apt está livre..."
while fuser /var/lib/dpkg/lock >/dev/null 2>&1 || \
      fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
   echo "🔒 Aguardando liberação de lock do apt..."
   sleep 3
done

echo "✅ Lock liberado. Prosseguindo com instalação..."
apt -y update
apt -y install jq curl wget

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

confirm_step "Validação do Sistema Operacional"

# Verifica se o sistema é baseado em Debian ou Ubuntu
if grep -qiE 'debian|ubuntu' /etc/os-release; then
    # Obtém informações
    DISTRO_NAME=$(grep "^ID=" /etc/os-release | cut -d '=' -f2 | tr -d '"')
    VERSION=$(grep VERSION_ID /etc/os-release | cut -d '=' -f2 | tr -d '"')
    echo "Distribuição detectada: $DISTRO_NAME"
    echo "Versão: $VERSION"

    # Validação de versões suportadas
    if [[ "$DISTRO_NAME" == "debian" ]]; then
        if [[ "$VERSION" -ge 10 && "$VERSION" -le 12 ]]; then
            echo "Versão do Debian é suportada."
        else
            echo "Versão do Debian não suportada. Apenas Debian 10, 11 e 12 são suportados."
            exit 1
        fi
    elif [[ "$DISTRO_NAME" == "ubuntu" ]]; then
        # Suporte a Ubuntu 20.04, 22.04, 24.04
        MAJOR_VERSION=$(echo "$VERSION" | cut -d'.' -f1)
        if [[ "$MAJOR_VERSION" -ge 20 ]]; then
            echo "Versão do Ubuntu é suportada."
        else
            echo "Versão do Ubuntu não suportada. Apenas Ubuntu 20.04, 22.04 e superiores são suportados."
            exit 1
        fi
    else
        # ID_LIKE pode conter debian para outras distribuições baseadas, mas o suporte oficial é só para Debian e Ubuntu puramente
        echo "Atenção: distribuição baseada em Debian detectada ($DISTRO_NAME), mas não oficialmente suportada!"
        exit 1
    fi
else
    echo "Distribuição não é baseada em Debian/Ubuntu."
    exit 1
fi

if [[ "$SKIP_USER" -eq 0 ]]; then
    confirm_step "Criação do usuário Linux '$LinuxUserName'"
    
    # Verifica se o usuário já existe
    if id "$LinuxUserName" &>/dev/null; then
        echo "Erro: o usuário '$LinuxUserName' já existe."
        exit 1
    fi

    # Cria o usuário
    useradd -m -s /bin/bash "$LinuxUserName"

    # Define a senha
    echo "${LinuxUserName}:${LinuxUserPassword}" | chpasswd

    echo "Usuário '$LinuxUserName' criado com sucesso com a senha predefinida."

    # Adiciona o usuário ao grupo sudo
    usermod -aG sudo "$LinuxUserName"
    echo "Usuário '$LinuxUserName' adicionado ao grupo sudo."

    # Cria um arquivo sudoers dedicado para o usuário
    SUDOERS_FILE="/etc/sudoers.d/$LinuxUserName"

    echo "$LinuxUserName ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"

    echo "✅ Usuário '$LinuxUserName' pode usar sudo sem senha."
else
    echo "❌ Usuário '$LinuxUserName' não foi criado, pois a flag --skip-user foi ativada."
fi

sleep $DELAY

if [[ "$SKIP_STEAM" -eq 0 ]]; then
    confirm_step "Instalação do SteamCMD e download do servidor DayZ"
    
    apt-get -y install lib32gcc-s1
    cd "/home/$LinuxUserName"
    mkdir -p "servers/steamcmd" && cd servers/steamcmd
    curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -    
    chown -R "$LinuxUserName:$LinuxUserName" "/home/$LinuxUserName/servers"
    sudo -u "$LinuxUserName" ./steamcmd.sh +force_install_dir "/home/$LinuxUserName/servers/dayz-server/" +login "$SteamAccount" +app_update 223350 +quit
    echo "SteamCMD instalado com sucesso."
else
    echo "❌ Steam não foi instalado, pois a flag --skip-steam foi ativada."
fi

sleep $DELAY

confirm_step "Configuração do arquivo serverDZ.cfg (nome, senha admin, jogadores)"

DayzFolder="/home/$LinuxUserName/servers/dayz-server"
echo "Entrando no diretório $DayzFolder"
cd "$DayzFolder"

ServerDZFile="$DayzFolder/serverDZ.cfg"

cp -Rap $ServerDZFile serverDZ.cfg.bkp

stringSearchHostname="hostname = \"EXAMPLE NAME\";"
stringReplaceHostname="hostname = \"$DayzServerName\";"
if ! grep -q "$stringSearchHostname" "$ServerDZFile"; then
    echo "Não foi possível encontrar a linha '$stringSearchHostname' no arquivo $ServerDZFile"
    echo "Copie o arquivo serverDZ.cfg para $ServerDZFile e edite-o manualmente."
    exit 1
fi

stringSearchPasswordAdmin="passwordAdmin = \"\";"
stringReplacePasswordAdmin="passwordAdmin = \"$DayzPasswordAdmin\";"
if ! grep -q "$stringSearchPasswordAdmin" "$ServerDZFile"; then
    echo "Não foi possível encontrar a linha '$stringSearchPasswordAdmin' no arquivo $ServerDZFile"
    echo "Copie o arquivo serverDZ.cfg para $ServerDZFile e edite-o manualmente."
    exit 1
fi

stringSearchMaxPlayers="maxPlayers = 60;"
stringReplaceMaxPlayers="maxPlayers = $DayzMaxPlayers;"
if ! grep -q "$stringSearchMaxPlayers" "$ServerDZFile"; then
    echo "Não foi possível encontrar a linha '$stringSearchMaxPlayers' no arquivo $ServerDZFile"
    echo "Copie o arquivo serverDZ.cfg para $ServerDZFile e reincie o script com as flags --skip-user e --skip-steam."
    exit 1
fi

echo "Editando o arquivo $ServerDZFile ..."

sed -i "s#${stringSearchHostname}#${stringReplaceHostname}#g" "$ServerDZFile"
sed -i "s#${stringSearchPasswordAdmin}#${stringReplacePasswordAdmin}#g" "$ServerDZFile"
sed -i "s#${stringSearchMaxPlayers}#${stringReplaceMaxPlayers}#g" "$ServerDZFile"

# Modificar
#disable3rdPerson=0;         // Toggles the 3rd person view for players (value 0-1)
sed -i "s#disable3rdPerson=0;#disable3rdPerson=1;#g" "$ServerDZFile"
#disableCrosshair=0;         // Toggles the cross-hair (value 0-1)
sed -i "s#disableCrosshair=0;#disableCrosshair=1;#g" "$ServerDZFile"
#lightingConfig = 0;         // 0 for brighter night setup, 1 for darker night setup
sed -i "s#lightingConfig = 0;#lightingConfig = 1;#g" "$ServerDZFile"
#serverTimeAcceleration=12;  // Accelerated Time (value 0-24)// This is a time multiplier for in-game time. In this case, the time would move 24 times faster than normal, so an entire day would pass in one hour.
sed -i "s#serverTimeAcceleration=12;#serverTimeAcceleration=6;#g" "$ServerDZFile"
#serverNightTimeAcceleration=1;  // Accelerated Nigh Time - The numerical value being a multiplier (0.1-64) and also multiplied by serverTimeAcceleration value. Thus, in case it is set to 4 and serverTimeAcceleration is set to 2, night time would move 8 times faster than normal. An entire night would pass in 3 hours.
sed -i "s#serverNightTimeAcceleration=1;#serverNightTimeAcceleration=4;#g" "$ServerDZFile"
#serverTimePersistent=0;     // Persistent Time (value 0-1)// The actual server time is saved to storage, so when active, the next server start will use the saved time value.
sed -i "s#serverTimePersistent=0;#serverTimePersistent=1;#g" "$ServerDZFile"

# Adicionar antes de 'class Missions'
motd="motd[] = { \"$DayzMotdMessage\" };"
sed -i "/class Missions/i $motd" "$ServerDZFile"
sed -i "/class Missions/i motdInterval = $DayzMotdIntervalSeconds;" "$ServerDZFile"
sed -i "/class Missions/i BattlEye = 1;" "$ServerDZFile" 

echo "Arquivo $ServerDZFile editado com sucesso."

confirm_step "Configuração do arquivo dayzsetting.xml (CPU cores)"

DayzSettingXmlFile="$DayzFolder/dayzsetting.xml"
echo "Editando arquivo $DayzSettingXmlFile ..."
sleep ${DELAY:-1}  # usa valor padrão de 1 segundo se DELAY não estiver definido

# --- Definições fixas (ajuste para usar variáveis no futuro) ---
DayzGlobalQueue="2048"
DayzThreadQueue="512"

# --- Substituição: maxcores ---
stringSearchMaxCores="maxcores=\"2\""
stringReplaceMaxCores="maxcores=\"$DayzPcCpuMaxCores\""
if ! grep -q "$stringSearchMaxCores" "$DayzSettingXmlFile"; then
    echo "❌ Não foi possível encontrar '$stringSearchMaxCores' em $DayzSettingXmlFile"
    echo "⚠️  Copie o arquivo dayzsetting.cfg para $DayzSettingXmlFile e reinicie com --skip-user e --skip-steam."
    exit 1
fi
sed -i "s#$stringSearchMaxCores#$stringReplaceMaxCores#g" "$DayzSettingXmlFile"

# --- Substituição: reservedcores ---
stringSearchReservedcores="reservedcores=\"1\""
stringReplaceReservedcores="reservedcores=\"$DayzPcCpuReservedcores\""
if ! grep -q "$stringSearchReservedcores" "$DayzSettingXmlFile"; then
    echo "❌ Não foi possível encontrar '$stringSearchReservedcores' em $DayzSettingXmlFile"
    echo "⚠️  Copie o arquivo dayzsetting.cfg para $DayzSettingXmlFile e reinicie com --skip-user e --skip-steam."
    exit 1
fi
sed -i "s#$stringSearchReservedcores#$stringReplaceReservedcores#g" "$DayzSettingXmlFile"

# --- Substituição: globalqueue ---
stringSearchGlobalQueue="globalqueue=\"4096\""
stringReplaceGlobalQueue="globalqueue=\"$DayzGlobalQueue\""
if grep -q "$stringSearchGlobalQueue" "$DayzSettingXmlFile"; then
    sed -i "s#$stringSearchGlobalQueue#$stringReplaceGlobalQueue#g" "$DayzSettingXmlFile"
else
    echo "⚠️  'globalqueue' não encontrado ou já editado. Pulando..."
fi

# --- Substituição: threadqueue ---
stringSearchThreadQueue="threadqueue=\"1024\""
stringReplaceThreadQueue="threadqueue=\"$DayzThreadQueue\""
if grep -q "$stringSearchThreadQueue" "$DayzSettingXmlFile"; then
    sed -i "s#$stringSearchThreadQueue#$stringReplaceThreadQueue#g" "$DayzSettingXmlFile"
else
    echo "⚠️  'threadqueue' não encontrado ou já editado. Pulando..."
fi

echo "✅ Arquivo $DayzSettingXmlFile editado com sucesso com as configurações:"
echo "   maxcores=$DayzPcCpuMaxCores"
echo "   reservedcores=$DayzPcCpuReservedcores"
echo "   globalqueue=$DayzGlobalQueue"
echo "   threadqueue=$DayzThreadQueue"

confirm_step "Configuração do BattlEye (RCon para administração remota)"

DayzBeServerFile="$DayzFolder/battleye/beserver_x64.cfg"
echo "Configurando integração com RCtools no arquivo $DayzBeServerFile ..."
sleep $DELAY

echo "RConPassword $DayzRConPassword" > "$DayzBeServerFile"
echo "RConIP $DayzRConIP" >> "$DayzBeServerFile"
echo "RConPort $DayzRConPort" >> "$DayzBeServerFile"
echo "MaxPing $DayzMaxPing" >> "$DayzBeServerFile"
echo "RestrictRCon $DayzRestrictRCon" >> "$DayzBeServerFile"

echo "Arquivo $DayzBeServerFile editado com sucesso."

confirm_step "Configuração de mensagens de reinício automático"

DayzMpmissionMessagesXml="$DayzFolder/mpmissions/$DayzMpmission/db/messages.xml"
cp -Rap $DayzMpmissionMessagesXml "$DayzFolder/mpmissions/$DayzMpmission/db/messages.xml.bkp"
echo "Editando arquivo $DayzMpmissionMessagesXml ..."
sleep $DELAY

awk -v dl="$DayzRestartMinutes" '
/<\/messages>/ {
    print "<message>";
    print "    <deadline>" dl "</deadline>";
    print "    <shutdown>1</shutdown>";
    print "    <text>O servidor vai ser reiniciado em #tmin minutos.</text>";
    print "</message>";
}
{ print }
' "$DayzMpmissionMessagesXml" > tmp.xml && mv tmp.xml "$DayzMpmissionMessagesXml"

echo "Arquivo $DayzMpmissionMessagesXml editado com sucesso."

confirm_step "Criação do serviço systemd para inicialização automática"

DayzServerServiceFile="/etc/systemd/system/dayz-server.service"
echo "Configurando serviço no systemd $DayzServerServiceFile ..."
sleep $DELAY

cat <<EOF > "$DayzServerServiceFile"
[Unit]
Description=DayZ Dedicated Server
Wants=network-online.target
After=syslog.target network.target nss-lookup.target network-online.target

[Service]
# Atualização e preparação
ExecStartPre=${DayzFolder}/scripts/update.sh

# Inicialização principal do servidor
ExecStart=${DayzFolder}/DayZServer -config=${DayzFolder}/serverDZ.cfg -port=2302 -BEpath=${DayzFolder}/battleye -profiles=${DayzFolder}/profiles -dologs -adminlog -netlog -freezecheck -cpuCount=${DayzPcCpuMaxCores} -limitFPS=${DayzLimitFPS}

# Script pós-inicialização
ExecStartPost=+${DayzFolder}/scripts/execute_script_pos.sh

# Diretório de trabalho
WorkingDirectory=${DayzFolder}/

# Limite de arquivos abertos
LimitNOFILE=100000

# Comandos de reload e parada
ExecReload=/bin/kill -s HUP \$MAINPID
ExecStop=/bin/kill -s INT \$MAINPID

# Usuário e grupo que rodam o serviço
User=${LinuxUserName}
Group=${LinuxUserName}

# Política de reinício
Restart=on-failure
RestartSec=30s

# Logs dedicados
StandardOutput=append:${DayzFolder}/profiles/dayz-server.log
StandardError=append:${DayzFolder}/profiles/dayz-server.err

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "${DayzFolder}/profiles"
chown -R "$LinuxUserName:$LinuxUserName" "${DayzFolder}/profiles"

mkdir -p "$DayzFolder/scripts"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/scripts"

if [[ "$DayzWipeOnRestart" == "1" ]]; then

confirm_step "Criação do script de wipe (limpeza de dados)"

echo "Criando script de wipe.sh ..."
PROFILE_DIR="$DayzFolder/mpmissions/$DayzMpmission/storage_1"
cat <<EOF > "$DayzFolder/scripts/wipe.sh"
#!/bin/bash
echo "=== Realizando wipe do servidor DayZ ==="
echo "PROFILE_DIR: $PROFILE_DIR"
rm -rf $PROFILE_DIR/*
echo "Wipe completo!"
EOF
chmod +x "$DayzFolder/scripts/wipe.sh"

fi

confirm_step "Criação dos scripts de atualização e pós-inicialização"

echo "Configurando script de update $DayzFolder/scripts/update.sh ..."

if [[ "$DayzWipeOnRestart" == "1" ]]; then
cat <<EOF > "$DayzFolder/scripts/update.sh"
#!/bin/bash

set -euo pipefail

echo "[INFO] Iniciando update do servidor DayZ..."

echo "[INFO] Executando wipe..."
cd "$DayzFolder/scripts" && ./wipe.sh
echo "[INFO] Wipe concluído."

# Atualiza o servidor via SteamCMD
echo "[INFO] Atualizando servidor via SteamCMD..."
cd "$DayzFolder"
/home/$LinuxUserName/servers/steamcmd/steamcmd.sh +force_install_dir "$DayzFolder/" +login $SteamAccount +app_update 223350 validate +quit

cd "$DayzFolder/mpmissions/$DayzMpmission/"
rm init.c
echo "Baixando init.c para Deathmatch..."
curl -o init.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1-v2/refs/heads/main/installation/deathmatch/init.c

chown "$LinuxUserName:$LinuxUserName" init.c

echo "[INFO] Update concluído com sucesso."
EOF
else
cat <<EOF > "$DayzFolder/scripts/update.sh"
#!/bin/bash

set -euo pipefail

echo "[INFO] Iniciando update do servidor DayZ..."

# Atualiza o servidor via SteamCMD
echo "[INFO] Atualizando servidor via SteamCMD..."
cd "$DayzFolder"
/home/$LinuxUserName/servers/steamcmd/steamcmd.sh +force_install_dir "$DayzFolder/" +login $SteamAccount +app_update 223350 validate +quit

cd "$DayzFolder/mpmissions/$DayzMpmission/"
rm init.c
echo "Baixando init.c para Vanilla..."
curl -o init.c https://raw.githubusercontent.com/gfbalestrin/dayz-server-beco-c1-v2/refs/heads/main/installation/vanilla/init.c

chown "$LinuxUserName:$LinuxUserName" init.c

echo "[INFO] Update concluído com sucesso."
EOF
fi

chmod +x "$DayzFolder/scripts/update.sh"

echo "Configurando script de pós inicialização $DayzFolder/scripts/execute_script_pos.sh ..."
echo "#!/bin/bash" > "$DayzFolder/scripts/execute_script_pos.sh"
echo "" >> "$DayzFolder/scripts/execute_script_pos.sh"
chmod +x "$DayzFolder/scripts/execute_script_pos.sh"

chown -R "$LinuxUserName:$LinuxUserName" "/home/$LinuxUserName/servers"

systemctl enable dayz-server.service

confirm_step "Verificação final de configurações e instalação do sistema de logs"

echo "Realizando checagem de configuração..."

echo "$ServerDZFile ..."
echo ""

echo "$DayzSettingXmlFile ..."
echo ""

echo "$DayzBeServerFile ..."
echo ""

echo "$DayzMpmissionMessagesXml ..."
echo ""

echo "$DayzServerServiceFile ..."
echo ""

echo "Listando scripts..."
ls -lh "$DayzFolder/scripts"
echo ""

if [[ $$DayzDeathmatch == "1" ]]; then
	echo "$DayzMpmissionGlobalsXml ..."
	echo ""
fi

if [[ "$DayzWipeOnRestart" == "1" ]]; then
    echo "$DayzFolder/scripts/wipe.sh ..."
    echo ""
fi

systemctl stop dayz-server.service

sleep 10

confirm_step "Instalação do sistema de logs"

source ./install_log_admin.sh

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Instalação concluída com sucesso!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Próximos passos:"
echo "  1. Iniciar servidor:   systemctl start dayz-server.service"
echo "  2. Ver status:         systemctl status dayz-server.service"
echo "  3. Ver logs em tempo real: journalctl -f -u dayz-server.service"
echo "  4. Parar servidor:     systemctl stop dayz-server.service"
echo "  5. Reiniciar servidor: systemctl restart dayz-server.service"
echo ""
echo "════════════════════════════════════════════════════════════════"
