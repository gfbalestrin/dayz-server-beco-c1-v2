#!/usr/bin/env python3
"""
Consumer RabbitMQ para dados de posições
Consome filas de posições (containers, vehicles, players, structures) e grava no SQLite
"""

import pika
import json
import sqlite3
import logging
import sys
import os
import time
from datetime import datetime
from typing import Dict, Any, List

# Adicionar diretório pai ao path para importar config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PositionsConsumer:
    """Consumer para processar dados de posições do RabbitMQ e gravar no SQLite"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.batch_size = 50
        self.batch_timeout = 3.0  # segundos
        self.batch = []
        self.last_batch_time = time.time()
        
        # Mapeamento de filas para bancos de dados
        self.queue_db_map = {
            'data.containers.positions': config.DB_CONTAINERS,
            'data.vehicles.positions': config.DB_VEHICLES,
            'data.players.positions': config.DB_PLAYERS,
            'data.structures.positions': config.DB_STRUCTURES,
        }
        
    def connect(self):
        """Conecta ao RabbitMQ"""
        try:
            credentials = pika.PlainCredentials(
                config.RABBITMQ_USERNAME,
                config.RABBITMQ_PASSWORD
            )
            parameters = pika.ConnectionParameters(
                host=config.RABBITMQ_HOST,
                port=config.RABBITMQ_PORT,
                virtual_host=config.RABBITMQ_VHOST,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # Declarar exchange
            self.channel.exchange_declare(
                exchange=config.RABBITMQ_EXCHANGE,
                exchange_type='topic',
                durable=True
            )
            
            # Declarar filas
            for queue_name in self.queue_db_map.keys():
                self.channel.queue_declare(queue=queue_name, durable=True)
                self.channel.queue_bind(
                    exchange=config.RABBITMQ_EXCHANGE,
                    queue=queue_name,
                    routing_key=queue_name
                )
            
            logger.info("Conectado ao RabbitMQ")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao conectar ao RabbitMQ: {e}")
            return False
    
    def process_containers_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """Processa dados de containers"""
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Implementar lógica de inserção de containers
            # Por enquanto, apenas log
            logger.debug(f"Processando dados de containers: {len(data.get('containers', []))} containers")
            
            # TODO: Implementar inserção real baseada na lógica dos scripts shell
            # Por enquanto, apenas commit vazio para não quebrar
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao processar dados de containers: {e}")
            return False
    
    def process_vehicles_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """Processa dados de veículos"""
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            logger.debug(f"Processando dados de veículos: {len(data.get('vehicles', []))} veículos")
            
            # TODO: Implementar inserção real
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao processar dados de veículos: {e}")
            return False
    
    def process_players_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """Processa dados de jogadores"""
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            logger.debug(f"Processando dados de jogadores: {len(data.get('players', []))} jogadores")
            
            # TODO: Implementar inserção real
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao processar dados de jogadores: {e}")
            return False
    
    def process_structures_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """Processa dados de estruturas"""
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            logger.debug(f"Processando dados de estruturas")
            
            # TODO: Implementar inserção real
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao processar dados de estruturas: {e}")
            return False
    
    def process_message(self, queue_name: str, data: Dict[str, Any]) -> bool:
        """Processa mensagem baseado no tipo de fila"""
        db_path = self.queue_db_map.get(queue_name)
        if not db_path:
            logger.error(f"Fila desconhecida: {queue_name}")
            return False
        
        if queue_name == 'data.containers.positions':
            return self.process_containers_data(db_path, data)
        elif queue_name == 'data.vehicles.positions':
            return self.process_vehicles_data(db_path, data)
        elif queue_name == 'data.players.positions':
            return self.process_players_data(db_path, data)
        elif queue_name == 'data.structures.positions':
            return self.process_structures_data(db_path, data)
        else:
            logger.error(f"Tipo de dados não suportado: {queue_name}")
            return False
    
    def process_batch(self):
        """Processa batch de mensagens"""
        if not self.batch:
            return
        
        success_count = 0
        fail_count = 0
        
        # Agrupar por tipo de fila para processamento em batch
        grouped = {}
        for item in self.batch:
            queue_name = item['queue']
            if queue_name not in grouped:
                grouped[queue_name] = []
            grouped[queue_name].append(item['data'])
        
        # Processar cada grupo
        for queue_name, items in grouped.items():
            try:
                # Combinar dados em um único objeto
                combined_data = {
                    'items': items,
                    'timestamp': datetime.now().isoformat()
                }
                
                if self.process_message(queue_name, combined_data):
                    success_count += len(items)
                else:
                    fail_count += len(items)
                    
            except Exception as e:
                logger.error(f"Erro ao processar batch de {queue_name}: {e}")
                fail_count += len(items)
        
        if success_count > 0:
            logger.info(f"Processado batch: {success_count} sucesso, {fail_count} falhas")
        
        self.batch = []
        self.last_batch_time = time.time()
    
    def callback(self, ch, method, properties, body):
        """Callback para processar mensagens"""
        try:
            # Parse do JSON
            payload = json.loads(body.decode('utf-8'))
            queue_name = method.routing_key
            
            # Extrair dados da mensagem
            if isinstance(payload, dict):
                if 'message' in payload:
                    data = payload['message']
                else:
                    data = payload
            else:
                data = {'raw': payload}
            
            # Adicionar ao batch
            self.batch.append({
                'queue': queue_name,
                'data': data,
                'delivery_tag': method.delivery_tag,
                'channel': ch
            })
            
            # Processar batch se atingir tamanho ou timeout
            current_time = time.time()
            if (len(self.batch) >= self.batch_size or 
                (current_time - self.last_batch_time) >= self.batch_timeout):
                self.process_batch()
            
            # Ack individual (após processar)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except json.JSONDecodeError as e:
            logger.error(f"Erro ao decodificar JSON: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            logger.error(f"Erro no callback: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    def start(self):
        """Inicia o consumer"""
        if not self.connect():
            logger.error("Falha ao conectar ao RabbitMQ")
            return False
        
        try:
            # Configurar QoS (prefetch)
            self.channel.basic_qos(prefetch_count=self.batch_size)
            
            # Consumir filas
            for queue_name in self.queue_db_map.keys():
                self.channel.basic_consume(
                    queue=queue_name,
                    on_message_callback=self.callback
                )
            
            logger.info("Aguardando mensagens de posições. Pressione CTRL+C para sair.")
            
            # Processar batch pendente periodicamente
            def process_pending_batch():
                if self.batch and (time.time() - self.last_batch_time) >= self.batch_timeout:
                    self.process_batch()
            
            # Iniciar consumo
            while True:
                self.connection.process_data_events(time_limit=1)
                process_pending_batch()
                
        except KeyboardInterrupt:
            logger.info("Interrompido pelo usuário")
            # Processar batch pendente antes de sair
            if self.batch:
                self.process_batch()
        except Exception as e:
            logger.error(f"Erro no consumer: {e}")
        finally:
            if self.connection and not self.connection.is_closed:
                self.connection.close()
            logger.info("Consumer finalizado")
    
    def stop(self):
        """Para o consumer"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()


def main():
    """Função principal"""
    if not config.RABBITMQ_ENABLED:
        logger.warning("RabbitMQ está desabilitado no config.py")
        return
    
    consumer = PositionsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()

