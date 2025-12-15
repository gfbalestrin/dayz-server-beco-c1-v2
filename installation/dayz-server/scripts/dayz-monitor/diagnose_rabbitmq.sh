#!/bin/bash
# Script de diagnóstico para RabbitMQ
# Testa conexão, configuração e publicação de mensagens

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR/scripts"
source ./config.sh

echo "=========================================="
echo "Diagnóstico RabbitMQ"
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

# Teste 1: Verificar se config.json existe
echo "Teste 1: Verificando config.json..."
if [[ -f "$CONFIG_FILE" ]]; then
    test_result "config.json encontrado" 0 "Localização: $CONFIG_FILE"
else
    test_result "config.json encontrado" 1 "Arquivo não encontrado em: $CONFIG_FILE"
    echo ""
    echo "=========================================="
    echo "Diagnóstico interrompido: config.json não encontrado"
    echo "=========================================="
    exit 1
fi
echo ""

# Teste 2: Verificar se jq está instalado
echo "Teste 2: Verificando dependências..."
if command -v jq &> /dev/null; then
    test_result "jq instalado" 0 "$(jq --version)"
else
    test_result "jq instalado" 1 "jq não está instalado. Execute: sudo apt install jq"
    exit 1
fi

if command -v python3 &> /dev/null; then
    test_result "python3 instalado" 0 "$(python3 --version)"
else
    test_result "python3 instalado" 1 "python3 não está instalado"
    exit 1
fi

if python3 -c "import pika" 2>/dev/null; then
    test_result "pika instalado" 0 "Biblioteca pika disponível"
else
    test_result "pika instalado" 1 "Biblioteca pika não está instalada. Execute: pip3 install pika"
    exit 1
fi
echo ""

# Teste 3: Verificar configuração RabbitMQ no config.json
echo "Teste 3: Verificando configuração RabbitMQ..."
if ! jq -e '.RabbitMQ' "$CONFIG_FILE" >/dev/null 2>&1; then
    test_result "Seção RabbitMQ no config.json" 1 "Seção 'RabbitMQ' não encontrada no config.json"
    exit 1
fi

RABBITMQ_ENABLED=$(jq -r '.RabbitMQ.Enabled // false' "$CONFIG_FILE")
if [[ "$RABBITMQ_ENABLED" != "true" ]]; then
    test_result "RabbitMQ habilitado" 1 "RabbitMQ.Enabled = $RABBITMQ_ENABLED (deve ser 'true')"
    exit 1
fi
test_result "RabbitMQ habilitado" 0 "RabbitMQ.Enabled = $RABBITMQ_ENABLED"

RABBITMQ_HOST=$(jq -r '.RabbitMQ.Host // empty' "$CONFIG_FILE")
if [[ -z "$RABBITMQ_HOST" || "$RABBITMQ_HOST" == "monitoring-server-ip" ]]; then
    test_result "Host RabbitMQ configurado" 1 "Host não configurado ou ainda é 'monitoring-server-ip'"
    exit 1
fi
test_result "Host RabbitMQ configurado" 0 "Host: $RABBITMQ_HOST"

RABBITMQ_PORT=$(jq -r '.RabbitMQ.Port // 5672' "$CONFIG_FILE")
test_result "Porta RabbitMQ configurada" 0 "Porta: $RABBITMQ_PORT"

RABBITMQ_USER=$(jq -r '.RabbitMQ.Username // empty' "$CONFIG_FILE")
if [[ -z "$RABBITMQ_USER" ]]; then
    test_result "Usuário RabbitMQ configurado" 1 "Username não configurado"
    exit 1
fi
test_result "Usuário RabbitMQ configurado" 0 "Username: $RABBITMQ_USER"

RABBITMQ_PASS=$(jq -r '.RabbitMQ.Password // empty' "$CONFIG_FILE")
if [[ -z "$RABBITMQ_PASS" || "$RABBITMQ_PASS" == "secure_password" ]]; then
    test_result "Senha RabbitMQ configurada" 1 "Senha não configurada ou ainda é 'secure_password'"
    exit 1
fi
test_result "Senha RabbitMQ configurada" 0 "Senha: *** (oculta)"

RABBITMQ_VHOST=$(jq -r '.RabbitMQ.VHost // "/"' "$CONFIG_FILE")
test_result "VHost RabbitMQ configurado" 0 "VHost: $RABBITMQ_VHOST"

RABBITMQ_EXCHANGE=$(jq -r '.RabbitMQ.Exchange // "dayz.events"' "$CONFIG_FILE")
test_result "Exchange RabbitMQ configurado" 0 "Exchange: $RABBITMQ_EXCHANGE"
echo ""

# Teste 4: Verificar se script producer existe
echo "Teste 4: Verificando script producer..."
PRODUCER_SCRIPT="$SCRIPT_DIR/rabbitmq_producer.py"
if [[ -f "$PRODUCER_SCRIPT" ]]; then
    test_result "rabbitmq_producer.py encontrado" 0 "Localização: $PRODUCER_SCRIPT"
    
    # Verificar se é executável
    if [[ -x "$PRODUCER_SCRIPT" ]]; then
        test_result "rabbitmq_producer.py executável" 0 "Permissões OK"
    else
        test_result "rabbitmq_producer.py executável" 1 "Script não tem permissão de execução"
        echo "   Executando: chmod +x $PRODUCER_SCRIPT"
        chmod +x "$PRODUCER_SCRIPT"
    fi
else
    test_result "rabbitmq_producer.py encontrado" 1 "Script não encontrado em: $PRODUCER_SCRIPT"
    exit 1
fi
echo ""

# Teste 5: Testar conexão de rede com servidor RabbitMQ
echo "Teste 5: Testando conectividade de rede..."
if command -v nc &> /dev/null; then
    if timeout 3 nc -z "$RABBITMQ_HOST" "$RABBITMQ_PORT" 2>/dev/null; then
        test_result "Conectividade de rede" 0 "Conexão TCP estabelecida com $RABBITMQ_HOST:$RABBITMQ_PORT"
    else
        test_result "Conectividade de rede" 1 "Não foi possível conectar a $RABBITMQ_HOST:$RABBITMQ_PORT"
        echo "   Verifique:"
        echo "   - IP/hostname está correto?"
        echo "   - Porta está aberta no firewall?"
        echo "   - Servidor RabbitMQ está rodando?"
    fi
else
    echo -e "${YELLOW}⚠️  nc (netcat) não instalado, pulando teste de conectividade${NC}"
    echo "   Instale com: sudo apt install netcat-openbsd"
fi
echo ""

# Teste 6: Testar carregamento de configuração no producer
echo "Teste 6: Testando carregamento de configuração..."
if python3 "$PRODUCER_SCRIPT" "test.queue" '{"test": "config"}' 2>&1 | grep -q "config.json não encontrado"; then
    test_result "Carregamento de configuração" 1 "Producer não consegue encontrar config.json"
    echo "   Verifique o caminho do config.json no rabbitmq_producer.py"
else
    # Se exit code for 0 ou 2, significa que config foi carregado (0=desabilitado, 2=erro de config)
    # Se exit code for 1, significa erro de conexão (isso é esperado se RabbitMQ não estiver acessível)
    python3 "$PRODUCER_SCRIPT" "test.queue" '{"test": "config"}' >/dev/null 2>&1
    exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        test_result "Carregamento de configuração" 0 "Config carregado (RabbitMQ pode estar desabilitado)"
    elif [[ $exit_code -eq 2 ]]; then
        test_result "Carregamento de configuração" 1 "Erro ao carregar configuração (exit code: 2)"
    else
        # Exit code 1 = erro de conexão, mas config foi carregado
        test_result "Carregamento de configuração" 0 "Config carregado (erro de conexão esperado)"
    fi
fi
echo ""

# Teste 7: Testar publicação de mensagem (modo verbose)
echo "Teste 7: Testando publicação de mensagem..."
TEST_QUEUE="diagnostic.test.queue"
TEST_MESSAGE='{"test": "diagnostic", "timestamp": "'$(date '+%Y-%m-%d %H:%M:%S')'"}'

echo "   Publicando mensagem de teste na fila: $TEST_QUEUE"
RABBITMQ_VERBOSE=1 python3 "$PRODUCER_SCRIPT" "$TEST_QUEUE" "$TEST_MESSAGE" 2>&1
PUBLISH_EXIT_CODE=$?

if [[ $PUBLISH_EXIT_CODE -eq 0 ]]; then
    test_result "Publicação de mensagem" 0 "Mensagem publicada com sucesso"
    echo "   ✅ Mensagem de teste publicada na fila: $TEST_QUEUE"
    echo "   Verifique no painel RabbitMQ se a fila foi criada e contém a mensagem"
elif [[ $PUBLISH_EXIT_CODE -eq 2 ]]; then
    test_result "Publicação de mensagem" 1 "Erro na configuração (exit code: 2)"
    echo "   Verifique o config.json"
elif [[ $PUBLISH_EXIT_CODE -eq 1 ]]; then
    test_result "Publicação de mensagem" 1 "Erro ao publicar mensagem (exit code: 1)"
    echo "   Possíveis causas:"
    echo "   - Servidor RabbitMQ não está acessível"
    echo "   - Credenciais incorretas (usuário/senha)"
    echo "   - VHost não existe ou acesso negado"
    echo "   - Firewall bloqueando conexão"
else
    test_result "Publicação de mensagem" 1 "Exit code inesperado: $PUBLISH_EXIT_CODE"
fi
echo ""

# Teste 8: Verificar função PUBLISH_TO_RABBITMQ
echo "Teste 8: Testando função PUBLISH_TO_RABBITMQ()..."
TEST_QUEUE2="diagnostic.test.queue2"
TEST_MESSAGE2='{"test": "function", "timestamp": "'$(date '+%Y-%m-%d %H:%M:%S')'"}'

if PUBLISH_TO_RABBITMQ "$TEST_QUEUE2" "$TEST_MESSAGE2" "1"; then
    sleep 1
    test_result "Função PUBLISH_TO_RABBITMQ()" 0 "Função executada com sucesso"
else
    test_result "Função PUBLISH_TO_RABBITMQ()" 1 "Função retornou erro"
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
    echo "1. Verifique no painel RabbitMQ (http://$RABBITMQ_HOST:15672) se as filas foram criadas"
    echo "2. Verifique se as mensagens de teste estão nas filas:"
    echo "   - $TEST_QUEUE"
    echo "   - $TEST_QUEUE2"
    echo "3. Execute os consumers no servidor de monitoramento"
    exit 0
else
    echo -e "${RED}❌ Alguns testes falharam${NC}"
    echo ""
    echo "Verifique os erros acima e corrija os problemas antes de continuar."
    exit 1
fi

