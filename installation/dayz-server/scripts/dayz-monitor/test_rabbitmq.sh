#!/bin/bash
# Script de teste para RabbitMQ

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"
source ./config.sh

echo "=========================================="
echo "Teste de Publicação RabbitMQ"
echo "=========================================="
echo ""

# Verificar se RabbitMQ está habilitado
if ! jq -e '.RabbitMQ.Enabled == true' "$CONFIG_FILE" >/dev/null 2>&1; then
    echo "❌ ERRO: RabbitMQ está desabilitado no config.json"
    echo "   Configure 'RabbitMQ.Enabled': true no config.json"
    exit 1
fi

source .venv/bin/activate

# Verificar se pika está instalado
if ! python3 -c "import pika" 2>/dev/null; then
    echo "❌ ERRO: Biblioteca 'pika' não está instalada"
    echo "   Execute: pip3 install pika"
    exit 1
fi

# Verificar se script producer existe
PRODUCER_SCRIPT="$SCRIPT_DIR/rabbitmq_producer.py"
if [[ ! -f "$PRODUCER_SCRIPT" ]]; then
    echo "❌ ERRO: Script rabbitmq_producer.py não encontrado"
    exit 1
fi

echo "✅ Configuração básica OK"
echo ""

# Teste 1: Teste direto do producer
echo "Teste 1: Publicação direta via rabbitmq_producer.py"
TEST_MESSAGE='{"message":"Teste direto do producer","level":"INFO","source":"test_script"}'
if python3 "$PRODUCER_SCRIPT" "logs.custom" "$TEST_MESSAGE" 2>&1; then
    echo "✅ Publicação direta OK"
else
    echo "❌ Erro na publicação direta"
    echo "   Verifique:"
    echo "   - IP do servidor RabbitMQ no config.json"
    echo "   - Credenciais (usuário/senha)"
    echo "   - Firewall (porta 5672)"
fi
echo ""

# Teste 2: Teste via função PUBLISH_TO_RABBITMQ
echo "Teste 2: Publicação via função PUBLISH_TO_RABBITMQ()"
TEST_PAYLOAD='{"message":"Teste via função PUBLISH_TO_RABBITMQ","level":"INFO","source":"test_script"}'
PUBLISH_TO_RABBITMQ "logs.custom" "$TEST_PAYLOAD"
sleep 1
echo "✅ Função PUBLISH_TO_RABBITMQ() executada (background)"
echo ""

# Teste 3: Teste via INSERT_CUSTOM_LOG
echo "Teste 3: Publicação via INSERT_CUSTOM_LOG()"
INSERT_CUSTOM_LOG "Teste via INSERT_CUSTOM_LOG - esta mensagem deve aparecer no RabbitMQ" "INFO" "test_script"
sleep 1
echo "✅ INSERT_CUSTOM_LOG() executado (deve publicar no RabbitMQ)"
echo ""

# Teste 4: Teste via INSERT_ADM_LOG
echo "Teste 4: Publicação via INSERT_ADM_LOG()"
INSERT_ADM_LOG "Teste via INSERT_ADM_LOG - esta mensagem deve aparecer no RabbitMQ" "INFO"
sleep 1
echo "✅ INSERT_ADM_LOG() executado (deve publicar no RabbitMQ)"
echo ""

echo "=========================================="
echo "Testes concluídos!"
echo ""
echo "Para verificar se as mensagens chegaram:"
echo "  No servidor de monitoramento, execute:"
echo "    sudo rabbitmqctl list_queues -p dayz name messages"
echo ""
echo "Ou verifique os logs dos consumers:"
echo "    sudo journalctl -u dayz-rabbitmq-consumers -f"
echo "=========================================="

