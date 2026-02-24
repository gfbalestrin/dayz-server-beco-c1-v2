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
  echo "Uso: $0 [--skip-user] [--skip-steam] [--skip-server-config] [--skip-monitor] [--no-confirm]"
  echo "  --skip-user          Pula a criação do usuário Linux"
  echo "  --skip-steam         Pula a instalação do SteamCMD"
  echo "  --skip-server-config Pula a configuração do servidor"
  echo "  --skip-monitor       Pula a instalação do sistema de monitor e logs"
  echo "  --no-confirm         Executa sem pedir confirmações (modo automático)"
  exit 1
}

SKIP_USER=0
SKIP_STEAM=0
SKIP_SERVER_CONFIG=0
SKIP_MONITOR=0
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
    --skip-server-config)
      SKIP_SERVER_CONFIG=1
      shift
      ;;
    --skip-monitor)
      SKIP_MONITOR=1
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
[[ "$SKIP_SERVER_CONFIG" -eq 1 ]] && echo "Flag --skip-server-config foi ativada"
[[ "$SKIP_MONITOR" -eq 1 ]] && echo "Flag --skip-monitor foi ativada"
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
apt -y install jq curl wget git

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

# Função auxiliar para escapar caracteres especiais no sed (para delimitador |)
escape_sed_chars() {
    local str="$1"
    # Escapa caracteres especiais na ordem correta:
    # 1. Barras invertidas primeiro (para não duplicar escape)
    # 2. Pipes (delimitador usado)
    # 3. Ampersands (caractere especial do sed)
    str="${str//\\/\\\\}"
    str="${str//|/\\|}"
    str="${str//&/\\&}"
    echo "$str"
}

# Função para substituir variáveis em scripts template
substituir_variaveis_script() {
    local template_file="$1"
    local destino_file="$2"
    
    if [ ! -f "$template_file" ]; then
        echo "Erro: Template não encontrado: $template_file" >&2
        return 1
    fi
    
    # Valida que todas as variáveis necessárias estão definidas e não vazias
    local variaveis_necessarias=(
        "LinuxUserName"
        "DayzFolder"
        "DayzMpmission"
        "SteamAccount"
        "DayzRestartMinutes"
    )
    
    for var_name in "${variaveis_necessarias[@]}"; do
        local var_value="${!var_name:-}"
        if [ -z "$var_value" ]; then
            echo "Erro: Variável '$var_name' não está definida ou está vazia" >&2
            echo "Verifique se o arquivo de configuração foi carregado corretamente" >&2
            return 1
        fi
    done
    
    # Escapa os valores das variáveis para uso seguro no sed
    local linux_user_escaped=$(escape_sed_chars "$LinuxUserName")
    local dayz_folder_escaped=$(escape_sed_chars "$DayzFolder")
    local dayz_mpmission_escaped=$(escape_sed_chars "$DayzMpmission")
    local steam_account_escaped=$(escape_sed_chars "$SteamAccount")
    local dayz_restart_minutes_escaped=$(escape_sed_chars "$DayzRestartMinutes")
    local app_folder_escaped=$(escape_sed_chars "${DayzFolder}/scripts")
    local logs_db_escaped=$(escape_sed_chars "${app_folder_escaped}/databases/server_beco_c1_logs.db")
    local players_db_escaped=$(escape_sed_chars "${app_folder_escaped}/databases/players_beco_c1.db")
    local vehicles_db_escaped=$(escape_sed_chars "${app_folder_escaped}/databases/vehicles_beco_c1.db")
    local containers_db_escaped=$(escape_sed_chars "${app_folder_escaped}/databases/containers_beco_c1.db")
    local structures_db_escaped=$(escape_sed_chars "${app_folder_escaped}/databases/structures_beco_c1.db")
    
    # Copia o template e substitui as variáveis com valores escapados
    if ! sed -e "s|__LINUX_USER_NAME__|${linux_user_escaped}|g" \
            -e "s|__DAYZ_FOLDER__|${dayz_folder_escaped}|g" \
            -e "s|__DAYZ_MPMISSION__|${dayz_mpmission_escaped}|g" \
            -e "s|__STEAM_ACCOUNT__|${steam_account_escaped}|g" \
            -e "s|__DAYZ_RESTART_MINUTES__|${dayz_restart_minutes_escaped}|g" \
            -e "s|__DAY_ACCEL__|10|g" \
            -e "s|__NIGHT_ACCEL__|3|g" \
            -e "s|__APP_FOLDER__|${app_folder_escaped}|g" \
            -e "s|__APP_SERVER_BECO_C1_LOGS_DB_FILE__|${logs_db_escaped}|g" \
            -e "s|__APP_PLAYER_BECO_C1_DB_FILE__|${players_db_escaped}|g" \
            -e "s|__APP_VEHICLE_BECO_C1_DB_FILE__|${vehicles_db_escaped}|g" \
            -e "s|__APP_CONTAINER_BECO_C1_DB_FILE__|${containers_db_escaped}|g" \
            -e "s|__APP_STRUCTURE_BECO_C1_DB_FILE__|${structures_db_escaped}|g" \
            "$template_file" > "$destino_file"; then
        echo "Erro: Falha ao processar template '$template_file' com sed" >&2
        return 1
    fi
    
    chmod +x "$destino_file"
    return 0
}

# Função para gerar config.json no servidor substituindo placeholders
gerar_config_json_servidor() {
    local template_file="$1"
    local destino_file="$2"
    
    if [ ! -f "$template_file" ]; then
        echo "Erro: Template config.json não encontrado: $template_file" >&2
        return 1
    fi
    
    # Valida que todas as variáveis necessárias estão definidas
    local variaveis_necessarias=(
        "LinuxUserName"
        "DayzFolder"
        "DayzMpmission"
    )
    
    for var_name in "${variaveis_necessarias[@]}"; do
        local var_value="${!var_name:-}"
        if [ -z "$var_value" ]; then
            echo "Erro: Variável '$var_name' não está definida ou está vazia" >&2
            echo "Verifique se o arquivo de configuração foi carregado corretamente" >&2
            return 1
        fi
    done
    
    # Escapa os valores das variáveis para uso seguro no sed
    local dayz_folder_escaped=$(escape_sed_chars "$DayzFolder")
    local dayz_mpmission_escaped=$(escape_sed_chars "$DayzMpmission")
    
    # Substitui os placeholders no JSON usando sed
    # Nota: JSON permite usar | como delimitador já que não aparece nos valores
    # Também converte "DayZ" para "Dayz" para compatibilidade com config.sh do servidor
    if ! sed -e "s|__DAYZ_FOLDER__|${dayz_folder_escaped}|g" \
            -e "s|__DAYZ_MPMISSION__|${dayz_mpmission_escaped}|g" \
            -e 's|"DayZ":|"Dayz":|g' \
            "$template_file" > "$destino_file"; then
        echo "Erro: Falha ao processar template config.json '$template_file' com sed" >&2
        return 1
    fi
    
    # Valida se o JSON gerado é válido usando jq
    if ! jq empty "$destino_file" 2>/dev/null; then
        echo "Erro: JSON gerado é inválido: $destino_file" >&2
        return 1
    fi
    
    return 0
}

# Função para copiar scripts e pastas do repositório
copiar_scripts_e_pastas() {
    local source_dir="$1"
    local dest_dir="$2"
    
    if [ ! -d "$source_dir" ]; then
        echo "Erro: Diretório fonte não encontrado: $source_dir" >&2
        return 1
    fi
    
    # Cria diretório de destino se não existir
    mkdir -p "$dest_dir"
    
    # Copia pastas completas
    local folders=(
        "admin-interface"
        "cheat_detection"
        "databases"
        "dayz-monitor"
    )
    
    for folder in "${folders[@]}"; do
        if [ -d "$source_dir/$folder" ]; then
            echo "Copiando pasta $folder..."
            # Remove pasta destino se existir para evitar conflitos
            [ -d "$dest_dir/$folder" ] && rm -rf "$dest_dir/$folder"
            cp -Rap "$source_dir/$folder" "$dest_dir/"
        fi
    done
    
    # Copia arquivos de configuração
    if [ -f "$source_dir/config.sh" ]; then
        cp "$source_dir/config.sh" "$dest_dir/"
    fi
    
    # config.json não é copiado aqui - será gerado dinamicamente pela função gerar_config_json_servidor
    
    # Copia todos os scripts .sh da raiz (exceto os que já foram copiados como templates)
    for script in "$source_dir"/*.sh; do
        if [ -f "$script" ]; then
            local script_name=$(basename "$script")
            # Pula scripts que são templates (update.sh e execute_script_pos.sh são gerados)
            if [[ "$script_name" != "update.sh" && "$script_name" != "execute_script_pos.sh" ]]; then
                cp "$script" "$dest_dir/"
            fi
        fi
    done
    
    # Aplica permissões de execução apenas em arquivos .sh
    find "$dest_dir" -type f -name "*.sh" -exec chmod +x {} \;
    
    # Aplica permissões de propriedade recursivamente
    chown -R "$LinuxUserName:$LinuxUserName" "$dest_dir"
}

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
        if [[ "$VERSION" -ge 10 && "$VERSION" -le 13 ]]; then
            echo "Versão do Debian é suportada."
        else
            echo "Versão do Debian não suportada. Apenas Debian 10, 11, 12 e 13 são suportados."
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
    chown -R "$LinuxUserName:$LinuxUserName" "/home/$LinuxUserName/servers" 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta servers (alguns arquivos podem ter restrições)"
    sudo -u "$LinuxUserName" ./steamcmd.sh +force_install_dir "/home/$LinuxUserName/servers/dayz-server/" +login "$SteamAccount" +app_update 223350 +quit
    echo "SteamCMD instalado com sucesso."
else
    echo "❌ Steam não foi instalado, pois a flag --skip-steam foi ativada."
fi

sleep $DELAY
DayzFolder="/home/$LinuxUserName/servers/dayz-server"
ServerDZFile="$DayzFolder/serverDZ.cfg"
DayzSettingXmlFile="$DayzFolder/dayzsetting.xml"
DayzBeServerFile="$DayzFolder/battleye/beserver_x64.cfg"
DayzMpmissionMessagesXml="$DayzFolder/mpmissions/$DayzMpmission/db/messages.xml"

if [[ "$SKIP_SERVER_CONFIG" -eq 0 ]]; then
    confirm_step "Configuração do arquivo serverDZ.cfg (nome, senha admin, jogadores)"    
    echo "Entrando no diretório $DayzFolder"
    cd "$DayzFolder"

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
    sed -i "/class Missions/i adminLogBuildActions = 1;" "$ServerDZFile" 
    sed -i "/class Missions/i disableBaseDamage = 0;" "$ServerDZFile" 

    echo "Arquivo $ServerDZFile editado com sucesso."

    confirm_step "Configuração do arquivo dayzsetting.xml (CPU cores)"
    
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
    
    echo "Configurando integração com RCtools no arquivo $DayzBeServerFile ..."
    sleep $DELAY

    echo "RConPassword $DayzRConPassword" > "$DayzBeServerFile"
    echo "RConIP $DayzRConIP" >> "$DayzBeServerFile"
    echo "RConPort $DayzRConPort" >> "$DayzBeServerFile"
    echo "MaxPing $DayzMaxPing" >> "$DayzBeServerFile"
    echo "RestrictRCon $DayzRestrictRCon" >> "$DayzBeServerFile"

    echo "Arquivo $DayzBeServerFile editado com sucesso."

    confirm_step "Configuração de mensagens de reinício automático"
    
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
else
    echo "❌ Configuração do arquivo serverDZ.cfg não foi feita, pois a flag --skip-server-config foi ativada."
fi

confirm_step "Criação do serviço systemd para inicialização automática"

DayzServerServiceFile="/etc/systemd/system/dayz-server.service"
echo "Configurando serviço no systemd $DayzServerServiceFile ..."
sleep $DELAY
mkdir -p $DayzFolder/profiles
echo > $DayzFolder/profiles/dayz-server.log
echo > $DayzFolder/profiles/dayz-server.err
chown -R "$LinuxUserName:$LinuxUserName" $DayzFolder/profiles

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
ExecReload= 
ExecStop=                         

# Em vez disso, diga qual sinal você quer que o systemd use:
KillSignal=INT

# Usuário e grupo que rodam o serviço
User=${LinuxUserName}
Group=${LinuxUserName}

# Política de reinício
Restart=always
RestartSec=10s

# Logs dedicados
StandardOutput=append:${DayzFolder}/profiles/dayz-server.log
StandardError=append:${DayzFolder}/profiles/dayz-server.err

# Timeout
TimeoutStartSec=300s

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "${DayzFolder}/profiles"
chown -R "$LinuxUserName:$LinuxUserName" "${DayzFolder}/profiles" 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta profiles"

mkdir -p "$DayzFolder/scripts"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/scripts" 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta scripts"

confirm_step "Criação dos scripts de atualização e pós-inicialização"

echo "Configurando script de update $DayzFolder/scripts/update.sh ..."

# Define o caminho do template
TEMPLATE_UPDATE="$SCRIPT_DIR/dayz-server/scripts/update.sh"
TEMPLATE_EXECUTE_POS="$SCRIPT_DIR/dayz-server/scripts/execute_script_pos.sh"

# Verifica se os templates existem
if [ ! -f "$TEMPLATE_UPDATE" ]; then
    echo "Erro: Template update.sh não encontrado em $TEMPLATE_UPDATE" >&2
    exit 1
fi

if [ ! -f "$TEMPLATE_EXECUTE_POS" ]; then
    echo "Erro: Template execute_script_pos.sh não encontrado em $TEMPLATE_EXECUTE_POS" >&2
    exit 1
fi

# Gera o script update.sh a partir do template
substituir_variaveis_script "$TEMPLATE_UPDATE" "$DayzFolder/scripts/update.sh"

echo "Configurando script de pós inicialização $DayzFolder/scripts/execute_script_pos.sh ..."

# Gera o script execute_script_pos.sh a partir do template
substituir_variaveis_script "$TEMPLATE_EXECUTE_POS" "$DayzFolder/scripts/execute_script_pos.sh"

chown -R "$LinuxUserName:$LinuxUserName" "/home/$LinuxUserName/servers" 2>/dev/null || echo "Aviso: Não foi possível alterar permissões da pasta servers (alguns arquivos podem ter restrições)"

systemctl enable dayz-server.service

if [[ "$SKIP_MONITOR" -eq 0 ]]; then
    confirm_step "Instalação do sistema de logs e monitor"
    
    # Instala sqlite3 se necessário
    if ! command -v sqlite3 &> /dev/null; then
        echo "Instalando sqlite3..."
        apt install -y sqlite3
    fi
    
    # Define diretórios
    SCRIPTS_SOURCE_DIR="$SCRIPT_DIR/dayz-server/scripts"
    SCRIPTS_DEST_DIR="$DayzFolder/scripts"
    
    # Copia todos os scripts e pastas
    echo "Copiando scripts e pastas do repositório..."
    copiar_scripts_e_pastas "$SCRIPTS_SOURCE_DIR" "$SCRIPTS_DEST_DIR"
    
    # Função para inicializar databases a partir de arquivos SQL
    init_database_from_sql() {
        local db_file="$1"
        local sql_file="$2"
        local description="$3"
        
        if [[ ! -f "$db_file" ]]; then
            echo "Criando database $description..."
            if [[ -f "$sql_file" ]]; then
                sqlite3 "$db_file" < "$sql_file"
                chown "$LinuxUserName:$LinuxUserName" "$db_file"
                echo "Database $description criada com sucesso."
            else
                echo "Aviso: Arquivo SQL não encontrado: $sql_file"
            fi
        else
            echo "Database $description já existe, pulando criação."
        fi
    }
    
    # Inicializar databases
    echo "Inicializando databases..."
    DATABASES_DIR="$SCRIPTS_DEST_DIR/databases"
    init_database_from_sql "$DATABASES_DIR/vehicles_beco_c1.db" "$DATABASES_DIR/vehicles_beco_c1.sql" "vehicles_beco_c1.db"
    init_database_from_sql "$DATABASES_DIR/containers_beco_c1.db" "$DATABASES_DIR/containers_beco_c1.sql" "containers_beco_c1.db"
    init_database_from_sql "$DATABASES_DIR/structures_beco_c1.db" "$DATABASES_DIR/structures_beco_c1.sql" "structures_beco_c1.db"
    init_database_from_sql "$DATABASES_DIR/server_beco_c1_logs.db" "$DATABASES_DIR/server_beco_c1_logs.sql" "server_beco_c1_logs.db"
    
    # Gera o config.json no servidor substituindo placeholders
    echo "Gerando config.json no servidor..."
    TEMPLATE_CONFIG_JSON="$CONFIG_FILE"
    CONFIG_JSON_DEST="$SCRIPTS_DEST_DIR/config.json"
    
    if ! gerar_config_json_servidor "$TEMPLATE_CONFIG_JSON" "$CONFIG_JSON_DEST"; then
        echo "Erro: Falha ao gerar config.json no servidor" >&2
        exit 1
    fi
    
    # Aplica permissões no config.json gerado
    chown "$LinuxUserName:$LinuxUserName" "$CONFIG_JSON_DEST"
    
    # Gera o script supervisor a partir do template
    TEMPLATE_SUPERVISOR="$SCRIPTS_SOURCE_DIR/dayz-monitor/dayz_supervisor.sh"
    SUPERVISOR_DEST="$SCRIPTS_DEST_DIR/dayz-monitor/dayz_supervisor.sh"
    
    if [ -f "$TEMPLATE_SUPERVISOR" ]; then
        echo "Gerando script supervisor..."
        substituir_variaveis_script "$TEMPLATE_SUPERVISOR" "$SUPERVISOR_DEST"
    else
        echo "Aviso: Template supervisor não encontrado em $TEMPLATE_SUPERVISOR"
    fi
    
    # Cria o serviço systemd para o monitor
    confirm_step "Configuração do serviço systemd dayz-monitor"
    
    DayzMonitorServiceFile="/etc/systemd/system/dayz-monitor.service"
    echo "Configurando serviço no systemd $DayzMonitorServiceFile ..."
    
    cat <<EOF > "$DayzMonitorServiceFile"
[Unit]
Description=DayZ Supervisor (command + log monitor)
After=network.target

[Service]
ExecStart=$SCRIPTS_DEST_DIR/dayz-monitor/dayz_supervisor.sh
Restart=always
# Diretório de trabalho
WorkingDirectory=$DayzFolder/

# Limite de arquivos abertos
LimitNOFILE=100000

# Comandos de reload e parada
ExecReload=/bin/kill -s HUP \$MAINPID
ExecStop=/bin/kill -s INT \$MAINPID

# Usuário e grupo que rodam o serviço
User=$LinuxUserName
Group=$LinuxUserName

[Install]
WantedBy=multi-user.target
EOF
    
    # Recarrega systemd
    systemctl daemon-reload
    
    # Habilita o serviço
    systemctl enable dayz-monitor.service
    
    echo "✅ Sistema de monitor e logs instalado com sucesso."
    echo "   Para iniciar: systemctl start dayz-monitor.service"
else
    echo "❌ Instalação do sistema de monitor e logs foi pulada, pois a flag --skip-monitor foi ativada."
fi
