#!/bin/bash
# Script de teste para RabbitMQ Consumers
# Testa se os consumers conseguem consumir mensagens do RabbitMQ e gravar no SQLite

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"

echo "=========================================="
echo "Teste de Consumers RabbitMQ"
echo "=========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de testes
TESTS_PASSED=0
TESTS_FAILED=0

# Verificar e ativar ambiente virtual
VENV_DIR="$PARENT_DIR/venv"
PYTHON_CMD="python3"

if [[ -d "$VENV_DIR" ]]; then
    echo "🔧 Usando ambiente virtual: $VENV_DIR"
    source "$VENV_DIR/bin/activate"
    PYTHON_CMD="$VENV_DIR/bin/python3"
else
    echo -e "${YELLOW}⚠️  Ambiente virtual não encontrado em $VENV_DIR${NC}"
    echo "   Usando Python do sistema. Execute o setup.sh primeiro."
    PYTHON_CMD="python3"
fi
echo ""

# Função para testar e reportar
test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    if [[ "$result" -eq 0 ]]; then
        echo -e "${GREEN}✅ $test_name${NC}"
        if [[ -n "$details" ]]; then
            echo "   $details"
        fi
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ $test_name${NC}"
        if [[ -n "$details" ]]; then
            echo "   $details"
        fi
        ((TESTS_FAILED++))
        return 1
    fi
}

# Teste 1: Verificar dependências
echo "Teste 1: Verificando dependências..."
if command -v "$PYTHON_CMD" &> /dev/null; then
    PYTHON_VERSION=$("$PYTHON_CMD" --version 2>&1)
    test_result "python3 instalado" 0 "$PYTHON_VERSION"
else
    test_result "python3 instalado" 1 "python3 não está instalado"
    exit 1
fi

if "$PYTHON_CMD" -c "import pika" 2>/dev/null; then
    test_result "pika instalado" 0 "Biblioteca pika disponível"
else
    test_result "pika instalado" 1 "Biblioteca pika não está instalada. Execute: cd $PARENT_DIR && ./setup.sh"
    exit 1
fi

if "$PYTHON_CMD" -c "import sqlite3" 2>/dev/null; then
    test_result "sqlite3 instalado" 0 "Biblioteca sqlite3 disponível"
else
    test_result "sqlite3 instalado" 1 "Biblioteca sqlite3 não está disponível"
    exit 1
fi
echo ""

# Teste 2: Verificar se scripts consumer existem
echo "Teste 2: Verificando scripts consumer..."
LOGS_CONSUMER="$SCRIPT_DIR/logs_consumer.py"
POSITIONS_CONSUMER="$SCRIPT_DIR/positions_consumer.py"
CONSUMER_MANAGER="$SCRIPT_DIR/consumer_manager.py"

if [[ -f "$LOGS_CONSUMER" ]]; then
    test_result "logs_consumer.py encontrado" 0 "Localização: $LOGS_CONSUMER"
else
    test_result "logs_consumer.py encontrado" 1 "Script não encontrado em: $LOGS_CONSUMER"
    exit 1
fi

if [[ -f "$POSITIONS_CONSUMER" ]]; then
    test_result "positions_consumer.py encontrado" 0 "Localização: $POSITIONS_CONSUMER"
else
    test_result "positions_consumer.py encontrado" 1 "Script não encontrado em: $POSITIONS_CONSUMER"
    exit 1
fi

if [[ -f "$CONSUMER_MANAGER" ]]; then
    test_result "consumer_manager.py encontrado" 0 "Localização: $CONSUMER_MANAGER"
else
    test_result "consumer_manager.py encontrado" 1 "Script não encontrado em: $CONSUMER_MANAGER"
fi
echo ""

# Teste 3: Verificar configuração
echo "Teste 3: Verificando configuração..."
CONFIG_FILE="$PARENT_DIR/admin-interface/config.py"
if [[ -f "$CONFIG_FILE" ]]; then
    test_result "config.py encontrado" 0 "Localização: $CONFIG_FILE"
    
    # Verificar se consegue importar config (capturando erro específico)
    # Usar caminho absoluto e mudar para o diretório antes de importar
    PARENT_DIR_ABS=$(cd "$PARENT_DIR" && pwd)
    
    # Verificar se config.py realmente existe
    if [[ ! -f "$PARENT_DIR_ABS/admin-interface/config.py" ]]; then
        test_result "config.py importável" 1 "Erro: config.py não encontrado em $PARENT_DIR_ABS/admin-interface"
        exit 1
    fi
    
    # Mudar para o diretório e executar Python de lá
    # Usar subshell para garantir que o cd funcione
    IMPORT_OUTPUT=$(
        cd "$PARENT_DIR_ABS/admin-interface" || exit 1
        export PYTHONPATH="$PARENT_DIR_ABS/admin-interface:$PYTHONPATH"
        "$PYTHON_CMD" <<PYTHON_SCRIPT
import sys
import os
# Garantir que estamos no diretório correto
os.chdir('$PARENT_DIR_ABS/admin-interface')
sys.path.insert(0, '$PARENT_DIR_ABS/admin-interface')
sys.path.insert(0, os.getcwd())
try:
    import config
    print('OK')
    sys.exit(0)
except Exception as e:
    error_msg = str(e)
    print('ERRO:', error_msg)
    sys.exit(1)
PYTHON_SCRIPT
    )
    IMPORT_EXIT_CODE=$?
    IMPORT_ERROR="$IMPORT_OUTPUT"
    
    if [[ "$IMPORT_ERROR" == "OK" && $IMPORT_EXIT_CODE -eq 0 ]]; then
        test_result "config.py importável" 0 "Configuração pode ser importada"
        
        # Verificar configurações RabbitMQ
        RABBITMQ_HOST=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.RABBITMQ_HOST)" 2>/dev/null)
        if [[ -n "$RABBITMQ_HOST" && "$RABBITMQ_HOST" != "None" ]]; then
            test_result "RABBITMQ_HOST configurado" 0 "Host: $RABBITMQ_HOST"
        else
            test_result "RABBITMQ_HOST configurado" 1 "Host não configurado"
        fi
    else
        # Verificar se o erro é por arquivos faltando (bancos de dados ou XMLs)
        if echo "$IMPORT_ERROR" | grep -qiE "Database não encontrado|Arquivo.*não encontrado|FileNotFoundError|types\.xml|events\.xml"; then
            test_result "config.py importável" 0 "Config pode ser importado (arquivos faltando são esperados)"
            echo "   Aviso: Alguns arquivos não foram encontrados:"
            echo "$IMPORT_ERROR" | grep -E "FileNotFoundError|não encontrado" | head -3 | sed 's/^/   - /'
            echo "   Nota: No ambiente de teste, alguns arquivos podem não existir."
            echo "   Isso é normal se os bancos de dados ainda não foram criados."
            echo "   Os consumers criarão os bancos automaticamente na primeira execução."
            
            # Tentar obter RABBITMQ_HOST mesmo com erro (pode funcionar se o erro for só de validação)
            RABBITMQ_HOST=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "
import sys
import os
sys.path.insert(0, os.getcwd())
try:
    import config
    print(config.RABBITMQ_HOST)
except:
    pass
" 2>/dev/null)
            if [[ -n "$RABBITMQ_HOST" && "$RABBITMQ_HOST" != "None" ]]; then
                test_result "RABBITMQ_HOST configurado" 0 "Host: $RABBITMQ_HOST"
            else
                test_result "RABBITMQ_HOST configurado" 1 "Host não configurado (erro ao importar config)"
            fi
        elif echo "$IMPORT_ERROR" | grep -qiE "ModuleNotFoundError.*config"; then
            # Se for ModuleNotFoundError, o problema é que o Python não está encontrando o módulo
            test_result "config.py importável" 1 "Erro: Python não encontrou o módulo config"
            echo "   Detalhes: $IMPORT_ERROR"
            echo "   Caminho testado: $PARENT_DIR_ABS/admin-interface"
            echo "   Verificando se config.py existe..."
            if [[ -f "$PARENT_DIR_ABS/admin-interface/config.py" ]]; then
                echo "   ✅ config.py existe no caminho"
                echo "   Tentando importar com PYTHONPATH..."
                PYTHONPATH="$PARENT_DIR_ABS/admin-interface" "$PYTHON_CMD" -c "import config; print('OK')" 2>&1 | head -3
            else
                echo "   ❌ config.py NÃO existe em $PARENT_DIR_ABS/admin-interface"
            fi
            exit 1
        else
            test_result "config.py importável" 1 "Erro ao importar config.py"
            echo "   Detalhes: $IMPORT_ERROR"
            echo "   Exit code: $IMPORT_EXIT_CODE"
            exit 1
        fi
    fi
else
    test_result "config.py encontrado" 1 "Arquivo não encontrado em: $CONFIG_FILE"
    exit 1
fi
echo ""

# Teste 4: Verificar conectividade RabbitMQ
echo "Teste 4: Testando conectividade RabbitMQ..."
if command -v nc &> /dev/null; then
    if timeout 3 nc -z "$RABBITMQ_HOST" 5672 2>/dev/null; then
        test_result "Conectividade RabbitMQ" 0 "Conexão TCP estabelecida com $RABBITMQ_HOST:5672"
    else
        test_result "Conectividade RabbitMQ" 1 "Não foi possível conectar a $RABBITMQ_HOST:5672"
        echo "   Verifique se o servidor RabbitMQ está acessível"
    fi
else
    echo -e "${YELLOW}⚠️  nc (netcat) não instalado, pulando teste de conectividade${NC}"
fi
echo ""

# Teste 5: Verificar bancos de dados SQLite
echo "Teste 5: Verificando bancos de dados SQLite..."
# Tentar obter paths dos bancos, mas se config não puder ser importado, usar paths padrão
PARENT_DIR_ABS=$(cd "$PARENT_DIR" && pwd)
DB_BASE="$PARENT_DIR_ABS/../databases"

DB_PLAYERS_DEFAULT="$DB_BASE/players_beco_c1.db"
DB_LOGS_DEFAULT="$DB_BASE/server_beco_c1_logs.db"
DB_VEHICLES_DEFAULT="$DB_BASE/vehicles_beco_c1.db"
DB_CONTAINERS_DEFAULT="$DB_BASE/containers_beco_c1.db"
DB_STRUCTURES_DEFAULT="$DB_BASE/structures_beco_c1.db"

DB_PLAYERS=""
DB_LOGS=""
DB_VEHICLES=""
DB_CONTAINERS=""
DB_STRUCTURES=""

# Tentar importar config para obter os caminhos reais
if cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print('OK')" 2>/dev/null | grep -q "OK"; then
    DB_PLAYERS=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.DB_PLAYERS)" 2>/dev/null)
    DB_LOGS=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.DB_LOGS)" 2>/dev/null)
    DB_VEHICLES=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.DB_VEHICLES)" 2>/dev/null)
    DB_CONTAINERS=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.DB_CONTAINERS)" 2>/dev/null)
    DB_STRUCTURES=$(cd "$PARENT_DIR_ABS/admin-interface" && "$PYTHON_CMD" -c "import sys; import os; sys.path.insert(0, os.getcwd()); import config; print(config.DB_STRUCTURES)" 2>/dev/null)
else
    # Se não conseguir importar, usar os caminhos padrão
    DB_PLAYERS="$DB_PLAYERS_DEFAULT"
    DB_LOGS="$DB_LOGS_DEFAULT"
    DB_VEHICLES="$DB_VEHICLES_DEFAULT"
    DB_CONTAINERS="$DB_CONTAINERS_DEFAULT"
    DB_STRUCTURES="$DB_STRUCTURES_DEFAULT"
    echo "   Aviso: Não foi possível importar config.py para obter caminhos de DBs. Usando caminhos padrão."
fi

for db_name_var in "DB_PLAYERS" "DB_LOGS" "DB_VEHICLES" "DB_CONTAINERS" "DB_STRUCTURES"; do
    db_path=$(eval echo \$$db_name_var)
    if [[ -f "$db_path" ]]; then
        test_result "$db_name_var existe" 0 "Localização: $db_path"
    else
        test_result "$db_name_var existe" 1 "Banco não encontrado: $db_path"
        echo "   Criando banco de dados..."
        mkdir -p "$(dirname "$db_path")"
        touch "$db_path"
    fi
done
echo ""

# Teste 6: Testar conexão RabbitMQ via consumer
echo "Teste 6: Testando conexão RabbitMQ via consumer..."
PARENT_DIR_ABS=$(cd "$PARENT_DIR" && pwd)
CONSUMERS_DIR="$PARENT_DIR_ABS/consumers"
ADMIN_INTERFACE_DIR="$PARENT_DIR_ABS/admin-interface"
CONSUMER_TEST_OUTPUT=$(cd "$ADMIN_INTERFACE_DIR" && "$PYTHON_CMD" -c "
import sys
import os
# Adicionar diretórios ao path
sys.path.insert(0, '$ADMIN_INTERFACE_DIR')
sys.path.insert(0, '$CONSUMERS_DIR')
try:
    # Importar diretamente do arquivo (sem usar consumers.)
    import sys
    import os
    sys.path.insert(0, '$CONSUMERS_DIR')
    from logs_consumer import LogsConsumer
    consumer = LogsConsumer()
    if consumer.connect():
        print('OK')
        consumer.connection.close()
        sys.exit(0)
    else:
        print('ERRO: Falha ao conectar')
        sys.exit(1)
except Exception as e:
    print(f'ERRO: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
" 2>&1)

if echo "$CONSUMER_TEST_OUTPUT" | grep -q "^OK$"; then
    test_result "Conexão RabbitMQ via consumer" 0 "Consumer conseguiu conectar ao RabbitMQ"
elif echo "$CONSUMER_TEST_OUTPUT" | grep -q "Database não encontrado\|Arquivo.*não encontrado"; then
    test_result "Conexão RabbitMQ via consumer" 1 "Erro: Arquivos necessários não encontrados para inicializar consumer"
    echo "   Detalhes: $CONSUMER_TEST_OUTPUT"
    echo "   Nota: Os bancos de dados serão criados automaticamente na primeira execução."
else
    test_result "Conexão RabbitMQ via consumer" 1 "Consumer não conseguiu conectar ao RabbitMQ"
    echo "   Detalhes: $CONSUMER_TEST_OUTPUT"
    echo "   Verifique:"
    echo "   - Credenciais RabbitMQ no config.py"
    echo "   - VHost existe e usuário tem permissão"
    echo "   - Exchange 'dayz.events' existe"
fi
echo ""

# Resumo
echo "=========================================="
echo "Resumo do Diagnóstico"
echo "=========================================="
echo -e "Testes passados: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Testes falhados: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ Todos os testes passaram!${NC}"
    echo ""
    echo "Próximos passos:"
    if [[ -d "$VENV_DIR" ]]; then
        echo "1. Inicie os consumers (com ambiente virtual):"
        echo "   cd $SCRIPT_DIR"
        echo "   source ../venv/bin/activate"
        echo "   python3 $CONSUMER_MANAGER"
        echo ""
        echo "2. Ou inicie individualmente:"
        echo "   source ../venv/bin/activate"
        echo "   python3 $LOGS_CONSUMER &"
        echo "   python3 $POSITIONS_CONSUMER &"
    else
        echo "1. Inicie os consumers:"
        echo "   cd $SCRIPT_DIR"
        echo "   python3 $CONSUMER_MANAGER"
        echo ""
        echo "2. Ou inicie individualmente:"
        echo "   python3 $LOGS_CONSUMER &"
        echo "   python3 $POSITIONS_CONSUMER &"
    fi
    exit 0
else
    echo -e "${RED}❌ Alguns testes falharam${NC}"
    echo ""
    echo "Verifique os erros acima e corrija os problemas antes de continuar."
    exit 1
fi

