#!/usr/bin/env python3
"""
Consumer RabbitMQ para logs
Consome filas logs.custom e logs.adm e grava no SQLite
"""

import pika
import json
import sqlite3
import logging
import sys
import os
import time
from datetime import datetime
from typing import Dict, Any

# Adicionar diretório pai ao path para importar config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LogsConsumer:
    """Consumer para processar logs do RabbitMQ e gravar no SQLite"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.db_path = config.DB_LOGS
        self.batch_size = 100
        self.batch_timeout = 5.0  # segundos
        self.batch = []
        self.last_batch_time = time.time()
        
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
            for queue_name in ['logs.custom', 'logs.adm']:
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
    
    def insert_log_custom(self, message: str, level: str, source: str) -> bool:
        """Insere log customizado no SQLite"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                VALUES (?, ?, ?, ?)
            """, (message, level, source, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao inserir log customizado: {e}")
            return False
    
    def insert_log_adm(self, message: str, level: str) -> bool:
        """Insere log administrativo no SQLite"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
                VALUES (?, ?, ?)
            """, (message, level, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao inserir log administrativo: {e}")
            return False
    
    def process_batch(self):
        """Processa batch de mensagens"""
        if not self.batch:
            return
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for item in self.batch:
                queue_name = item['queue']
                data = item['data']
                
                if queue_name == 'logs.custom':
                    message = data.get('message', '')
                    level = data.get('level', 'INFO')
                    source = data.get('source', 'Script')
                    
                    cursor.execute("""
                        INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                        VALUES (?, ?, ?, ?)
                    """, (message, level, source, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                    
                elif queue_name == 'logs.adm':
                    message = data.get('message', '')
                    level = data.get('level', 'INFO')
                    
                    cursor.execute("""
                        INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
                        VALUES (?, ?, ?)
                    """, (message, level, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Processado batch de {len(self.batch)} mensagens")
            self.batch = []
            self.last_batch_time = time.time()
            
        except Exception as e:
            logger.error(f"Erro ao processar batch: {e}")
            # Não fazer ack das mensagens em caso de erro (retry)
            self.batch = []
    
    def callback(self, ch, method, properties, body):
        """Callback para processar mensagens"""
        try:
            # Parse do JSON
            payload = json.loads(body.decode('utf-8'))
            queue_name = method.routing_key
            
            # Extrair dados da mensagem
            if isinstance(payload, dict) and 'message' in payload:
                # Formato direto
                data = payload
            else:
                # Formato wrapper
                data = payload.get('message', payload)
            
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
            for queue_name in ['logs.custom', 'logs.adm']:
                self.channel.basic_consume(
                    queue=queue_name,
                    on_message_callback=self.callback
                )
            
            logger.info("Aguardando mensagens. Pressione CTRL+C para sair.")
            
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
    
    consumer = LogsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()

