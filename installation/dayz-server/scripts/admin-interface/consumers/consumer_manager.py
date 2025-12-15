#!/usr/bin/env python3
"""
Gerenciador de consumers RabbitMQ
Inicia, monitora e gerencia múltiplos consumers
"""

import subprocess
import time
import logging
import sys
import os
import signal
from typing import List, Dict

# Adicionar diretório pai ao path para importar config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ConsumerManager:
    """Gerenciador de consumers RabbitMQ"""
    
    def __init__(self):
        self.consumers = {}
        self.running = True
        
        # Mapeamento de consumers
        self.consumer_configs = [
            {
                'name': 'logs_consumer',
                'script': os.path.join(os.path.dirname(__file__), 'logs_consumer.py'),
                'description': 'Consumer de logs (custom e adm)'
            },
            {
                'name': 'positions_consumer',
                'script': os.path.join(os.path.dirname(__file__), 'positions_consumer.py'),
                'description': 'Consumer de posições (containers, vehicles, players, structures)'
            }
        ]
        
        # Registrar handler de sinais
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
    
    def signal_handler(self, signum, frame):
        """Handler para sinais de interrupção"""
        logger.info(f"Recebido sinal {signum}, parando consumers...")
        self.running = False
        self.stop_all()
        sys.exit(0)
    
    def start_consumer(self, consumer_config: Dict) -> bool:
        """Inicia um consumer"""
        name = consumer_config['name']
        script = consumer_config['script']
        
        if not os.path.exists(script):
            logger.error(f"Script não encontrado: {script}")
            return False
        
        try:
            # Iniciar processo
            process = subprocess.Popen(
                [sys.executable, script],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            self.consumers[name] = {
                'process': process,
                'config': consumer_config,
                'start_time': time.time()
            }
            
            logger.info(f"Consumer '{name}' iniciado (PID: {process.pid})")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao iniciar consumer '{name}': {e}")
            return False
    
    def stop_consumer(self, name: str):
        """Para um consumer"""
        if name not in self.consumers:
            return
        
        consumer = self.consumers[name]
        process = consumer['process']
        
        try:
            # Enviar SIGTERM
            process.terminate()
            
            # Aguardar até 5 segundos
            try:
                process.wait(timeout=5)
                logger.info(f"Consumer '{name}' parado (PID: {process.pid})")
            except subprocess.TimeoutExpired:
                # Forçar kill se não parar
                process.kill()
                process.wait()
                logger.warning(f"Consumer '{name}' forçado a parar (PID: {process.pid})")
            
            del self.consumers[name]
            
        except Exception as e:
            logger.error(f"Erro ao parar consumer '{name}': {e}")
    
    def restart_consumer(self, name: str):
        """Reinicia um consumer"""
        logger.info(f"Reiniciando consumer '{name}'...")
        self.stop_consumer(name)
        time.sleep(1)
        
        # Encontrar config
        for config_item in self.consumer_configs:
            if config_item['name'] == name:
                self.start_consumer(config_item)
                break
    
    def check_consumers(self):
        """Verifica status dos consumers e reinicia se necessário"""
        for name, consumer in list(self.consumers.items()):
            process = consumer['process']
            
            # Verificar se processo ainda está rodando
            if process.poll() is not None:
                # Processo morreu
                logger.warning(f"Consumer '{name}' parou inesperadamente (exit code: {process.returncode})")
                
                # Ler stderr se disponível
                try:
                    stderr = process.stderr.read()
                    if stderr:
                        logger.error(f"Stderr do consumer '{name}': {stderr}")
                except:
                    pass
                
                # Reiniciar
                logger.info(f"Reiniciando consumer '{name}'...")
                self.restart_consumer(name)
    
    def start_all(self):
        """Inicia todos os consumers"""
        if not config.RABBITMQ_ENABLED:
            logger.warning("RabbitMQ está desabilitado no config.py")
            return
        
        logger.info("Iniciando consumers RabbitMQ...")
        
        for consumer_config in self.consumer_configs:
            self.start_consumer(consumer_config)
            time.sleep(0.5)  # Pequeno delay entre inícios
        
        logger.info(f"Total de {len(self.consumers)} consumers iniciados")
    
    def stop_all(self):
        """Para todos os consumers"""
        logger.info("Parando todos os consumers...")
        
        for name in list(self.consumers.keys()):
            self.stop_consumer(name)
        
        logger.info("Todos os consumers parados")
    
    def run(self):
        """Loop principal de monitoramento"""
        self.start_all()
        
        try:
            while self.running:
                # Verificar status dos consumers a cada 10 segundos
                self.check_consumers()
                time.sleep(10)
                
        except KeyboardInterrupt:
            logger.info("Interrompido pelo usuário")
        finally:
            self.stop_all()


def main():
    """Função principal"""
    manager = ConsumerManager()
    manager.run()


if __name__ == '__main__':
    main()

