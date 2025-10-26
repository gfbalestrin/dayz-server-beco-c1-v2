#!/bin/bash

# Script de instalação do DayZ Monitor
# Baseado no install.sh principal

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log com timestamp
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Função para erro
error() {
    echo -e "${RED}[ERRO]${NC} $1"
    exit 1
}

# Função para sucesso
success() {
    echo -e "${GREEN}[SUCESSO]${NC} $1"
}

# Função para aviso
warning() {
    echo -e "${YELLOW}[AVISO]${NC} $1"
}

# Função para confirmação de etapa
confirm_step() {
    echo ""
    echo -e "${BLUE}==============================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}==============================================${NC}"
    echo ""
}

# Verifica se está rodando como root
if [ "$EUID" -ne 0 ]; then
    error "Este script deve ser executado como root (use sudo)"
fi

# Determina o diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config/config.json"

# Verifica se o arquivo de configuração existe
if [ ! -f "$CONFIG_FILE" ]; then
    error "Arquivo de configuração não encontrado: $CONFIG_FILE"
fi

# Carrega configurações
log "Carregando configurações..."
source "$SCRIPT_DIR/config/config.sh"

# Verifica se as variáveis necessárias estão definidas
if [ -z "$LinuxUserName" ]; then
    error "Variável LinuxUserName não foi definida no arquivo de configuração"
fi

# Define variáveis baseadas na configuração
DayzFolder="/home/$LinuxUserName/servers/dayz-server"
MonitorScriptsDir="$DayzFolder/scripts/dayz-monitor"
SystemdServiceFile="/etc/systemd/system/dayz-monitor.service"

log "Configurações carregadas:"
log "  - Usuário Linux: $LinuxUserName"
log "  - Diretório DayZ: $DayzFolder"
log "  - Diretório Monitor: $MonitorScriptsDir"
log "  - Arquivo de serviço: $SystemdServiceFile"

apt install -y sqlite3

mkdir -p "$DayzFolder/scripts/databases"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/databases/players_beco_c1.db" "$DayzFolder/scripts/databases/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/databases/server_beco_c1_logs.db" "$DayzFolder/scripts/databases/"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/scripts/databases"

cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/config.sh" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/config.json" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/extrai_players_stats.sh" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/atualiza_players_online.sh" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/monta_killfeed_geral.sh" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/captura_dano_player.sh" "$DayzFolder/scripts/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/economy_update.sh" "$DayzFolder/scripts/"

# Ajuste: Aplica permissão de execução apenas nos scripts que existem (evita erro do shell com glob)
chmod +x -R "$DayzFolder/scripts/"
chown -R "$LinuxUserName:$LinuxUserName" "$DayzFolder/scripts"

confirm_step "Instalação do DayZ Monitor"

# Cria diretório para scripts de monitor
log "Criando diretório para scripts de monitor..."
mkdir -p "$MonitorScriptsDir"
chown "$LinuxUserName:$LinuxUserName" "$MonitorScriptsDir"

confirm_step "Cópia dos scripts de monitor"

# Copia scripts de monitor das pastas locais
log "Copiando scripts de monitor..."
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/dayz-monitor/dayz_command_watcher.sh" "$MonitorScriptsDir/"
cp "$SCRIPT_DIR/vanilla/dayz-server/scripts/dayz-monitor/dayz_log_monitor.sh" "$MonitorScriptsDir/"

# Define permissões corretas
chown "$LinuxUserName:$LinuxUserName" "$MonitorScriptsDir/dayz_command_watcher.sh"
chown "$LinuxUserName:$LinuxUserName" "$MonitorScriptsDir/dayz_log_monitor.sh"

success "Scripts de monitor copiados e configurados"

confirm_step "Criação do script supervisor"

# Cria o script supervisor com as variáveis corretas
log "Criando script dayz_supervisor.sh..."
cat > "$MonitorScriptsDir/dayz_supervisor.sh" << 'EOF'
#!/bin/bash

# Caminhos para os scripts individuais
CMD_WATCHER="/home/LINUX_USER_NAME_PLACEHOLDER/servers/dayz-server/scripts/dayz-monitor/dayz_command_watcher.sh"
LOG_WATCHER="/home/LINUX_USER_NAME_PLACEHOLDER/servers/dayz-server/scripts/dayz-monitor/dayz_log_monitor.sh"

# Inicia os scripts em background
"$CMD_WATCHER" &
PID1=$!

"$LOG_WATCHER" &
PID2=$!

# Espera os dois processos (para manter o serviço "vivo")
wait $PID1 $PID2
EOF

# Substitui o placeholder pelo nome de usuário real
sed -i "s/LINUX_USER_NAME_PLACEHOLDER/$LinuxUserName/g" "$MonitorScriptsDir/dayz_supervisor.sh"

# Define permissões corretas
chown "$LinuxUserName:$LinuxUserName" "$MonitorScriptsDir/dayz_supervisor.sh"

success "Script supervisor criado"

confirm_step "Configuração do serviço systemd"

# Cria o arquivo de serviço systemd
log "Criando serviço systemd dayz-monitor..."
cat > "$SystemdServiceFile" << EOF
[Unit]
Description=DayZ Supervisor (command + log monitor)
After=network.target

[Service]
ExecStart=/home/$LinuxUserName/servers/dayz-server/scripts/dayz-monitor/dayz_supervisor.sh
Restart=always
# Diretório de trabalho
WorkingDirectory=/home/$LinuxUserName/servers/dayz-server/

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
log "Recarregando systemd..."
systemctl daemon-reload

# Habilita o serviço
log "Habilitando serviço dayz-monitor..."
systemctl enable dayz-monitor.service

success "Serviço systemd configurado e habilitado"

confirm_step "Verificação final"

# Verifica se todos os arquivos foram criados
log "Verificando arquivos criados..."

files_to_check=(
    "$MonitorScriptsDir/dayz_supervisor.sh"
    "$MonitorScriptsDir/dayz_command_watcher.sh"
    "$MonitorScriptsDir/dayz_log_monitor.sh"
    "$SystemdServiceFile"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        success "✓ $file"
    else
        error "✗ Arquivo não encontrado: $file"
    fi
done

chmod +x $MonitorScriptsDir/dayz_supervisor.sh
chmod +x $MonitorScriptsDir/dayz_command_watcher.sh
chmod +x $MonitorScriptsDir/dayz_log_monitor.sh
chown -R "$LinuxUserName:$LinuxUserName" $MonitorScriptsDir

# Verifica se o serviço está habilitado
if systemctl is-enabled dayz-monitor.service &>/dev/null; then
    success "✓ Serviço dayz-monitor está habilitado"
else
    error "✗ Serviço dayz-monitor não está habilitado"
fi

# Mostra status do serviço
log "Status do serviço dayz-monitor:"
systemctl status dayz-monitor.service --no-pager -l

confirm_step "Instalação concluída"

echo ""
echo -e "${GREEN}🎉 Instalação do DayZ Monitor concluída com sucesso!${NC}"
echo ""
echo -e "${BLUE}Comandos úteis:${NC}"
echo "  1. Iniciar monitor:   systemctl start dayz-monitor.service"
echo "  2. Parar monitor:     systemctl stop dayz-monitor.service"
echo "  3. Reiniciar monitor: systemctl restart dayz-monitor.service"
echo "  4. Ver status:        systemctl status dayz-monitor.service"
echo "  5. Ver logs:          journalctl -f -u dayz-monitor.service"
echo ""
echo -e "${YELLOW}Nota:${NC} O serviço foi habilitado mas não iniciado automaticamente."
echo -e "${YELLOW}Para iniciar agora:${NC} systemctl start dayz-monitor.service"
echo ""
