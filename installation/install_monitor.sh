#!/bin/bash

# Wrapper para instalação do DayZ Monitor
# Este script agora é apenas um wrapper que chama o install.sh principal
# com as flags apropriadas para instalar apenas o monitor
#
# Nota: Este script assume que o usuário já foi criado e as configurações
# já foram carregadas. Se necessário, execute o install.sh completo primeiro.

# Determina o diretório do script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Chama o install.sh principal pulando etapas desnecessárias, mas mantendo
# a validação do sistema e carregamento de configurações
exec "$SCRIPT_DIR/install.sh" --skip-user --skip-steam --skip-server-config --no-confirm
