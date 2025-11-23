#!/bin/bash

# Script de inicialização da Interface Administrativa DayZ
# Beco Gaming

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "  DayZ Admin Interface - Beco Gaming"
echo "=================================================="
echo ""

# Verificar se Python 3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado. Por favor, instale Python 3."
    exit 1
fi

# Verificar se pip está instalado
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 não encontrado. Por favor, instale pip3."
    exit 1
fi

# Criar ambiente virtual se não existir
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
fi

# Ativar ambiente virtual
echo "🔧 Ativando ambiente virtual..."
source venv/bin/activate

# Instalar dependências
echo "📥 Instalando dependências..."
pip install --upgrade pip
pip install -r requirements.txt

# Verificar arquivos de configuração
if [ ! -f "config.py" ]; then
    echo "❌ Arquivo config.py não encontrado!"
    exit 1
fi

echo ""
echo "✅ Preparação concluída!"
echo ""
echo "🚀 Iniciando servidor..."
echo ""

# Executar a aplicação
python3 app.py
