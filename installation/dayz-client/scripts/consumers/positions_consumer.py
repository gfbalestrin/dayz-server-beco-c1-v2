#!/usr/bin/env python3
"""
Consumer RabbitMQ para dados de posições
Consome filas de posições (containers, vehicles, players, structures) e grava no SQLite
"""

import sys
import os
import logging

# Adicionar diretório atual ao path para importar do pacote positions_consumer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importar config (necessário para o main())
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'admin-interface'))
import config

# Importar PositionsConsumer do pacote refatorado
from positions_consumer.core import PositionsConsumer

# Configurar logging para systemd/journalctl
# Usar StreamHandler para garantir que logs vão para stdout/stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Garantir que logs vão para stdout
    ],
    force=True  # Forçar reconfiguração se já foi configurado
)
logger = logging.getLogger(__name__)


def main():
    """Função principal"""
    if not config.RABBITMQ_ENABLED:
        logger.warning("RabbitMQ está desabilitado no config.py")
        return
    
    consumer = PositionsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()
