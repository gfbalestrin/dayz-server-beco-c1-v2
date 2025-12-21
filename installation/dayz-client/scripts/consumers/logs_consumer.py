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

# Adicionar diretório admin-interface ao path para importar config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'admin-interface'))
import config

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
                
                # Garantir que data é um dict
                if not isinstance(data, dict):
                    logger.warning(f"Dados não são dict na fila {queue_name}: {type(data)}, convertendo...")
                    if isinstance(data, str):
                        try:
                            data = json.loads(data)
                        except json.JSONDecodeError:
                            data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
                    else:
                        data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
                
                if queue_name == 'logs.custom':
                    # Extrair campos do dict
                    raw_message = data.get('message', '')
                    raw_level = data.get('level', 'INFO')
                    raw_source = data.get('source', 'Script')
                    
                    # Verificar se message é uma string JSON (caso de double encoding)
                    if isinstance(raw_message, str) and raw_message.strip().startswith('{'):
                        try:
                            parsed_message = json.loads(raw_message)
                            # Se parseou com sucesso e tem os campos esperados, usar eles
                            if isinstance(parsed_message, dict):
                                message = str(parsed_message.get('message', raw_message))
                                level = str(parsed_message.get('level', raw_level)) if 'level' in parsed_message else str(raw_level)
                                source = str(parsed_message.get('source', raw_source)) if 'source' in parsed_message else str(raw_source)
                                logger.debug(f"Detectado JSON aninhado em logs.custom, extraído: message={message[:50]}...")
                            else:
                                message = str(raw_message)
                                level = str(raw_level) if raw_level is not None else 'INFO'
                                source = str(raw_source) if raw_source is not None else 'Script'
                        except json.JSONDecodeError:
                            # Não é JSON válido, usar como está
                            message = str(raw_message)
                            level = str(raw_level) if raw_level is not None else 'INFO'
                            source = str(raw_source) if raw_source is not None else 'Script'
                    else:
                        # Campo message não é JSON, usar diretamente
                        message = str(raw_message) if raw_message is not None else ''
                        level = str(raw_level) if raw_level is not None else 'INFO'
                        source = str(raw_source) if raw_source is not None else 'Script'
                    
                    cursor.execute("""
                        INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                        VALUES (?, ?, ?, ?)
                    """, (message, level, source, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                    
                elif queue_name == 'logs.adm':
                    # Formato logs.adm: {"log_type": "adm", "log_file": "...", "line": "...", "content": "...", "timestamp": "..."}
                    # Verificar se tem o formato novo (com log_type, line, content) ou formato antigo (com message, level)
                    message = ''
                    level = 'INFO'
                    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    if 'log_type' in data or 'line' in data or 'content' in data:
                        # Formato novo: usar 'line' como mensagem principal, ou 'content' como fallback
                        raw_line = data.get('line')
                        raw_content = data.get('content')
                        
                        # Prioridade 1: usar campo 'line' se existir e não for vazio
                        if raw_line and isinstance(raw_line, str) and raw_line.strip():
                            # Verificar se line é uma string JSON (caso de double encoding)
                            if raw_line.strip().startswith('{'):
                                try:
                                    parsed_line = json.loads(raw_line)
                                    if isinstance(parsed_line, dict):
                                        # Se line é um JSON, tentar extrair message ou line dele
                                        message = str(parsed_line.get('message', parsed_line.get('line', raw_line)))
                                        logger.debug(f"Detectado JSON aninhado em logs.adm line, extraído: message={message[:50]}...")
                                    else:
                                        message = str(raw_line)
                                except json.JSONDecodeError:
                                    message = str(raw_line)
                            else:
                                message = str(raw_line)
                        # Prioridade 2: usar campo 'content' se line não existir
                        elif raw_content and isinstance(raw_content, str) and raw_content.strip():
                            # Verificar se content é uma string JSON (caso de double encoding)
                            if raw_content.strip().startswith('{'):
                                try:
                                    parsed_content = json.loads(raw_content)
                                    if isinstance(parsed_content, dict):
                                        message = str(parsed_content.get('message', parsed_content.get('content', raw_content)))
                                        logger.debug(f"Detectado JSON aninhado em logs.adm content, extraído: message={message[:50]}...")
                                    else:
                                        message = str(raw_content)
                                except json.JSONDecodeError:
                                    message = str(raw_content)
                            else:
                                message = str(raw_content)
                        # Prioridade 3: fallback para campo 'message' se existir
                        elif 'message' in data:
                            raw_message = data.get('message', '')
                            if raw_message and isinstance(raw_message, str) and raw_message.strip():
                                message = str(raw_message)
                        
                        # Level padrão para logs.adm (não há campo level no formato novo)
                        level = str(data.get('level', 'INFO')) if 'level' in data else 'INFO'
                        
                        # Usar timestamp do payload se disponível, senão usar timestamp atual
                        payload_timestamp = data.get('timestamp', '')
                        if payload_timestamp:
                            try:
                                # Validar formato do timestamp
                                datetime.strptime(payload_timestamp, '%Y-%m-%d %H:%M:%S')
                                timestamp = payload_timestamp
                            except (ValueError, TypeError):
                                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        # Formato antigo: usar message e level diretamente
                        raw_message = data.get('message', '')
                        raw_level = data.get('level', 'INFO')
                        
                        # Verificar se message é uma string JSON (caso de double encoding)
                        if isinstance(raw_message, str) and raw_message.strip().startswith('{'):
                            try:
                                parsed_message = json.loads(raw_message)
                                if isinstance(parsed_message, dict):
                                    message = str(parsed_message.get('message', raw_message))
                                    level = str(parsed_message.get('level', raw_level)) if 'level' in parsed_message else str(raw_level)
                                    logger.debug(f"Detectado JSON aninhado em logs.adm (formato antigo), extraído: message={message[:50]}...")
                                else:
                                    message = str(raw_message)
                                    level = str(raw_level) if raw_level is not None else 'INFO'
                            except json.JSONDecodeError:
                                message = str(raw_message)
                                level = str(raw_level) if raw_level is not None else 'INFO'
                        else:
                            message = str(raw_message) if raw_message is not None else ''
                            level = str(raw_level) if raw_level is not None else 'INFO'
                    
                    # Validação final: garantir que nunca inserimos JSON completo como mensagem
                    if not message or (isinstance(message, str) and message.strip().startswith('{') and 'log_type' in message):
                        logger.warning(f"Tentativa de inserir JSON completo como mensagem em logs.adm, extraindo campos...")
                        # Tentar fazer parse do JSON se for um JSON completo
                        try:
                            if isinstance(message, str) and message.strip().startswith('{'):
                                parsed_json = json.loads(message)
                                if isinstance(parsed_json, dict):
                                    message = str(parsed_json.get('line', parsed_json.get('content', parsed_json.get('message', ''))))
                                    if not message:
                                        logger.error(f"Não foi possível extrair mensagem do JSON: {parsed_json}")
                                        message = 'Mensagem inválida'
                        except json.JSONDecodeError:
                            pass
                    
                    # Garantir que message não está vazia
                    if not message or not message.strip():
                        logger.warning(f"Mensagem vazia em logs.adm, usando fallback")
                        message = 'Mensagem não disponível'
                    
                    cursor.execute("""
                        INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
                        VALUES (?, ?, ?)
                    """, (message, level, timestamp))
            
            conn.commit()
            conn.close()
            
            logger.info(f"Processado batch de {len(self.batch)} mensagens")
            self.batch = []
            self.last_batch_time = time.time()
            
        except Exception as e:
            logger.error(f"Erro ao processar batch: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Não fazer ack das mensagens em caso de erro (retry)
            self.batch = []
    
    def callback(self, ch, method, properties, body):
        """Callback para processar mensagens"""
        try:
            # Parse do JSON
            payload = json.loads(body.decode('utf-8'))
            queue_name = method.routing_key
            
            # Extrair dados da mensagem
            # O payload já vem no formato: {"message": "...", "level": "...", "source": "..."}
            if isinstance(payload, dict):
                # Se o payload é um dict, usar diretamente
                data = payload
            elif isinstance(payload, str):
                # Se for string, tentar fazer parse novamente (caso de double encoding)
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    # Se não conseguir fazer parse, tratar como mensagem simples
                    data = {'message': payload, 'level': 'INFO', 'source': 'Unknown'}
            else:
                # Formato desconhecido, criar estrutura padrão
                data = {'message': str(payload), 'level': 'INFO', 'source': 'Unknown'}
            
            # Validar que data é um dict antes de adicionar ao batch
            if not isinstance(data, dict):
                logger.warning(f"Formato de dados inválido para fila {queue_name}: {type(data)}")
                data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
            
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
            logger.error(f"Erro ao decodificar JSON: {e}, body: {body.decode('utf-8')[:200]}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            logger.error(f"Erro no callback: {e}, body: {body.decode('utf-8')[:200] if body else 'None'}")
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

