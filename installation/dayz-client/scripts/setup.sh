#!/bin/bash
# Script de setup para servidor de monitoramento DayZ
# Instala dependências e configura o ambiente

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Setup - Servidor de Monitoramento DayZ"
echo "=========================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para imprimir mensagens
print_info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar se está rodando como root (para algumas operações)
if [[ $EUID -eq 0 ]]; then
    print_warning "Este script não deve ser executado como root para a maioria das operações."
    print_warning "Algumas operações podem precisar de sudo, mas serão solicitadas quando necessário."
fi

# 1. Verificar dependências do sistema
print_info "Verificando dependências do sistema..."

if ! command -v python3 &> /dev/null; then
    print_error "Python 3 não está instalado. Instale com: sudo apt install python3"
    exit 1
fi
print_info "Python 3: $(python3 --version)"

if ! command -v pip3 &> /dev/null; then
    print_warning "pip3 não está instalado. Instalando..."
    sudo apt update
    sudo apt install -y python3-pip
fi
print_info "pip3: $(pip3 --version)"

if ! command -v sqlite3 &> /dev/null; then
    print_warning "sqlite3 não está instalado. Instalando..."
    sudo apt update
    sudo apt install -y sqlite3
fi
print_info "sqlite3: $(sqlite3 --version | head -1)"

# 2. Verificar RabbitMQ
print_info "Verificando RabbitMQ..."
if ! command -v rabbitmqctl &> /dev/null; then
    print_warning "RabbitMQ não está instalado."
    read -p "Deseja instalar o RabbitMQ agora? (s/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        print_info "Instalando RabbitMQ..."
        sudo apt update
        sudo apt install -y rabbitmq-server
        sudo systemctl enable rabbitmq-server
        sudo systemctl start rabbitmq-server
        print_info "RabbitMQ instalado e iniciado."
    else
        print_warning "RabbitMQ não será instalado. Você precisará instalá-lo manualmente."
    fi
else
    print_info "RabbitMQ está instalado."
    if systemctl is-active --quiet rabbitmq-server; then
        print_info "RabbitMQ está rodando."
    else
        print_warning "RabbitMQ não está rodando. Iniciando..."
        sudo systemctl start rabbitmq-server
    fi
    
    # Configurar RabbitMQ (vhost, usuários, permissões)
    print_info "Configurando RabbitMQ..."
    
    # Ler configurações do config.json
    if [[ -f "$SCRIPT_DIR/config.json" ]]; then
        RABBITMQ_VHOST=$(jq -r '.RabbitMQ.VHost // "dayz"' "$SCRIPT_DIR/config.json")
        RABBITMQ_USERNAME=$(jq -r '.RabbitMQ.Username // "dayz_consumer"' "$SCRIPT_DIR/config.json")
        RABBITMQ_PASSWORD=$(jq -r '.RabbitMQ.Password // ""' "$SCRIPT_DIR/config.json")
    else
        RABBITMQ_VHOST="dayz"
        RABBITMQ_USERNAME="dayz_consumer"
        RABBITMQ_PASSWORD=""
    fi
    
    # Verificar e criar vhost
    if sudo rabbitmqctl list_vhosts | grep -q "^$RABBITMQ_VHOST$"; then
        print_info "VHost '$RABBITMQ_VHOST' já existe."
    else
        print_info "Criando vhost '$RABBITMQ_VHOST'..."
        sudo rabbitmqctl add_vhost "$RABBITMQ_VHOST"
        print_info "VHost '$RABBITMQ_VHOST' criado."
    fi
    
    # Verificar e criar usuário consumer
    if sudo rabbitmqctl list_users | grep -q "^$RABBITMQ_USERNAME"; then
        print_info "Usuário '$RABBITMQ_USERNAME' já existe."
        
        # Se senha foi fornecida no config.json, atualizar senha
        if [[ -n "$RABBITMQ_PASSWORD" && "$RABBITMQ_PASSWORD" != "" ]]; then
            print_info "Atualizando senha do usuário '$RABBITMQ_USERNAME'..."
            sudo rabbitmqctl change_password "$RABBITMQ_USERNAME" "$RABBITMQ_PASSWORD"
        fi
    else
        if [[ -z "$RABBITMQ_PASSWORD" || "$RABBITMQ_PASSWORD" == "" ]]; then
            print_warning "Senha do RabbitMQ não configurada no config.json."
            read -sp "Digite a senha para o usuário '$RABBITMQ_USERNAME' (ou Enter para pular): " USER_PASSWORD
            echo
            if [[ -n "$USER_PASSWORD" ]]; then
                RABBITMQ_PASSWORD="$USER_PASSWORD"
            else
                print_warning "Usuário não será criado. Configure manualmente depois."
                RABBITMQ_PASSWORD=""
            fi
        fi
        
        if [[ -n "$RABBITMQ_PASSWORD" && "$RABBITMQ_PASSWORD" != "" ]]; then
            print_info "Criando usuário '$RABBITMQ_USERNAME'..."
            sudo rabbitmqctl add_user "$RABBITMQ_USERNAME" "$RABBITMQ_PASSWORD"
            print_info "Usuário '$RABBITMQ_USERNAME' criado."
        fi
    fi
    
    # Configurar permissões do usuário no vhost
    if [[ -n "$RABBITMQ_PASSWORD" && "$RABBITMQ_PASSWORD" != "" ]] && sudo rabbitmqctl list_users | grep -q "^$RABBITMQ_USERNAME"; then
        print_info "Configurando permissões do usuário '$RABBITMQ_USERNAME' no vhost '$RABBITMQ_VHOST'..."
        sudo rabbitmqctl set_permissions -p "$RABBITMQ_VHOST" "$RABBITMQ_USERNAME" ".*" ".*" ".*"
        print_info "Permissões configuradas."
        
        # Verificar permissões
        if sudo rabbitmqctl list_permissions -p "$RABBITMQ_VHOST" | grep -q "^$RABBITMQ_USERNAME"; then
            print_info "Permissões verificadas com sucesso."
        else
            print_warning "Não foi possível verificar as permissões."
        fi
    else
        print_warning "Usuário '$RABBITMQ_USERNAME' não existe. Configure manualmente:"
        echo "  sudo rabbitmqctl add_user $RABBITMQ_USERNAME <senha>"
        echo "  sudo rabbitmqctl set_permissions -p $RABBITMQ_VHOST $RABBITMQ_USERNAME \".*\" \".*\" \".*\""
    fi
fi

# 3. Criar diretórios necessários
print_info "Criando diretórios necessários..."
mkdir -p "$SCRIPT_DIR/../databases"
mkdir -p "$SCRIPT_DIR/consumers"
mkdir -p "$SCRIPT_DIR/admin-interface"
print_info "Diretórios criados."

# 4. Criar ambiente virtual Python
print_info "Criando ambiente virtual Python..."
VENV_DIR="$SCRIPT_DIR/venv"
if [[ ! -d "$VENV_DIR" ]]; then
    print_info "Criando ambiente virtual em $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    print_info "Ambiente virtual criado."
else
    print_info "Ambiente virtual já existe."
fi

# Ativar ambiente virtual
print_info "Ativando ambiente virtual..."
source "$VENV_DIR/bin/activate"

# Atualizar pip no ambiente virtual
print_info "Atualizando pip..."
pip install --upgrade pip --quiet

# 5. Instalar dependências Python para consumers
print_info "Instalando dependências Python para consumers..."
if pip show pika &> /dev/null; then
    print_info "pika já está instalado no ambiente virtual."
else
    print_info "Instalando pika..."
    pip install pika
fi

# 6. Instalar dependências Python para admin-interface
print_info "Instalando dependências Python para admin-interface..."
if [[ -f "$SCRIPT_DIR/admin-interface/requirements.txt" ]]; then
    print_info "Instalando dependências do requirements.txt..."
    pip install -r "$SCRIPT_DIR/admin-interface/requirements.txt"
else
    print_warning "requirements.txt não encontrado. Instalando dependências básicas..."
    pip install Flask==3.0.0 Werkzeug==3.0.1 bcrypt==3.2.2 pika==1.3.2
fi

# Desativar ambiente virtual (será reativado quando necessário)
deactivate

# 7. Verificar config.json
print_info "Verificando config.json..."
if [[ -f "$SCRIPT_DIR/config.json" ]]; then
    print_info "config.json encontrado."
    print_warning "Verifique se as configurações RabbitMQ estão corretas:"
    echo "  - Host: $(jq -r '.RabbitMQ.Host // "não configurado"' "$SCRIPT_DIR/config.json")"
    echo "  - Port: $(jq -r '.RabbitMQ.Port // "não configurado"' "$SCRIPT_DIR/config.json")"
    echo "  - VHost: $(jq -r '.RabbitMQ.VHost // "não configurado"' "$SCRIPT_DIR/config.json")"
    echo "  - Enabled: $(jq -r '.RabbitMQ.Enabled // false' "$SCRIPT_DIR/config.json")"
else
    print_warning "config.json não encontrado. Um arquivo de exemplo será criado."
    # O config.json já foi criado no plano, então isso não deve acontecer
fi

# 8. Criar bancos de dados SQLite vazios (se não existirem)
print_info "Verificando bancos de dados SQLite..."
DB_BASE="$SCRIPT_DIR/../databases"
DB_FILES=(
    "players_beco_c1.db"
    "server_beco_c1_logs.db"
    "vehicles_beco_c1.db"
    "containers_beco_c1.db"
    "structures_beco_c1.db"
)

for db_file in "${DB_FILES[@]}"; do
    db_path="$DB_BASE/$db_file"
    if [[ -f "$db_path" ]]; then
        print_info "Banco $db_file já existe."
    else
        print_info "Criando banco $db_file..."
        touch "$db_path"
        # Criar estrutura básica (será criada pelos consumers quando necessário)
        print_info "Banco $db_file criado."
    fi
done

# 9. Configurar permissões
print_info "Configurando permissões..."
chmod +x "$SCRIPT_DIR/consumers"/*.py 2>/dev/null || true
chmod +x "$SCRIPT_DIR/consumers"/*.sh 2>/dev/null || true
chmod +x "$SCRIPT_DIR/admin-interface"/*.sh 2>/dev/null || true
print_info "Permissões configuradas."

# 10. Verificar e configurar serviço systemd
print_info "Verificando serviço systemd..."
SERVICE_TEMPLATE="$SCRIPT_DIR/consumers/dayz-rabbitmq-consumers.service"
SERVICE_NAME="dayz-rabbitmq-consumers"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
    print_warning "Arquivo de template de serviço não encontrado: $SERVICE_TEMPLATE"
else
    print_info "Template de serviço encontrado."
    
    # Verificar se o serviço já está instalado
    if [[ -f "$SERVICE_FILE" ]]; then
        print_info "Serviço systemd já está instalado em $SERVICE_FILE"
        
        # Verificar se precisa atualizar (comparar caminhos)
        CURRENT_WORKDIR=$(grep "^WorkingDirectory=" "$SERVICE_FILE" | cut -d'=' -f2)
        CURRENT_EXECSTART=$(grep "^ExecStart=" "$SERVICE_FILE" | cut -d'=' -f2-)
        EXPECTED_WORKDIR="$SCRIPT_DIR/consumers"
        EXPECTED_EXECSTART="$SCRIPT_DIR/venv/bin/python3 $SCRIPT_DIR/consumers/consumer_manager.py"
        
        if [[ "$CURRENT_WORKDIR" != "$EXPECTED_WORKDIR" ]] || [[ "$CURRENT_EXECSTART" != "$EXPECTED_EXECSTART" ]]; then
            print_warning "Caminhos do serviço estão desatualizados. Atualizando..."
            # Criar arquivo de serviço com caminhos corretos
            sed "s|/home/dayzadmin/scripts|$SCRIPT_DIR|g" "$SERVICE_TEMPLATE" | sudo tee "$SERVICE_FILE" > /dev/null
            sudo systemctl daemon-reload
            print_info "Serviço atualizado. Recarregue com: sudo systemctl daemon-reload"
        else
            print_info "Caminhos do serviço estão corretos."
        fi
    else
        print_info "Serviço systemd não está instalado. Configurando..."
        
        # Criar arquivo de serviço com caminhos corretos
        # Substituir caminhos genéricos pelos caminhos reais
        sed "s|/home/dayzadmin/scripts|$SCRIPT_DIR|g" "$SERVICE_TEMPLATE" | sudo tee "$SERVICE_FILE" > /dev/null
        
        if [[ $? -eq 0 ]]; then
            print_info "Arquivo de serviço criado em $SERVICE_FILE"
            
            # Recarregar systemd
            print_info "Recarregando systemd..."
            sudo systemctl daemon-reload
            
            # Perguntar se deseja habilitar e iniciar
            read -p "Deseja habilitar e iniciar o serviço agora? (s/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Ss]$ ]]; then
                print_info "Habilitando serviço..."
                sudo systemctl enable "$SERVICE_NAME"
                
                print_info "Iniciando serviço..."
                sudo systemctl start "$SERVICE_NAME"
                
                # Verificar status
                sleep 2
                if systemctl is-active --quiet "$SERVICE_NAME"; then
                    print_info "Serviço iniciado com sucesso!"
                else
                    print_warning "Serviço pode ter falhado ao iniciar. Verifique com:"
                    echo "  sudo systemctl status $SERVICE_NAME"
                    echo "  sudo journalctl -u $SERVICE_NAME -f"
                fi
            else
                print_info "Serviço configurado mas não iniciado. Para iniciar depois:"
                echo "  sudo systemctl enable $SERVICE_NAME"
                echo "  sudo systemctl start $SERVICE_NAME"
            fi
        else
            print_error "Falha ao criar arquivo de serviço. Verifique permissões sudo."
        fi
    fi
fi

# 11. Resumo
echo ""
echo "=========================================="
echo "Setup Concluído!"
echo "=========================================="
echo ""
print_info "Próximos passos:"
echo ""
echo "1. Configure o config.json com as credenciais corretas do RabbitMQ (se ainda não foi feito)"
echo "2. Configure o RabbitMQ (vhost, usuários, permissões) - já foi feito automaticamente"
if [[ -f "$SERVICE_FILE" ]] && systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "3. Serviço systemd já está configurado e habilitado"
    echo "   Verifique status: sudo systemctl status $SERVICE_NAME"
    echo "   Ver logs: sudo journalctl -u $SERVICE_NAME -f"
else
    echo "3. Inicie os consumers (usando o ambiente virtual):"
    echo "   cd $SCRIPT_DIR/consumers"
    echo "   source ../venv/bin/activate"
    echo "   python3 consumer_manager.py"
    echo ""
    echo "   Ou configure o serviço systemd (já foi criado, apenas habilite):"
    echo "   sudo systemctl enable $SERVICE_NAME"
    echo "   sudo systemctl start $SERVICE_NAME"
fi
echo ""
echo "4. Inicie a interface administrativa:"
echo "   cd $SCRIPT_DIR/admin-interface"
echo "   ./start.sh"
echo ""
print_info "Nota: O ambiente virtual Python está em: $VENV_DIR"
print_info "Ative-o antes de executar scripts Python: source $VENV_DIR/bin/activate"
echo ""
print_info "Para mais informações, consulte o README.md na raiz do projeto."
echo ""

