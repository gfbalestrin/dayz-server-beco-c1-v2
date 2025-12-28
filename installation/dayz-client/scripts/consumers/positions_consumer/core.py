"""
Core do positions_consumer - Classe principal PositionsConsumer
"""

import pika
import json
import logging
import sys
import os
import time
from datetime import datetime
from typing import Dict, Any

# Adicionar diretório admin-interface ao path para importar config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'admin-interface'))
import config

from .processors import VehiclesProcessor, ContainersProcessor, PlayersProcessor, StructuresProcessor

# Configurar logging
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
            'data.players.backups': config.DB_PLAYERS,
        }
        
        # Inicializar processadores
        self.processors = {
            'data.vehicles.positions': VehiclesProcessor(config.DB_VEHICLES),
            'data.containers.positions': ContainersProcessor(config.DB_CONTAINERS),
            'data.players.positions': PlayersProcessor(config.DB_PLAYERS),
            'data.structures.positions': StructuresProcessor(config.DB_STRUCTURES),
            'data.players.backups': PlayersProcessor(config.DB_PLAYERS),  # Usa o mesmo processor de players
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
    
    def process_message(self, queue_name: str, data: Dict[str, Any]) -> bool:
        """Processa mensagem baseado no tipo de fila"""
        processor = self.processors.get(queue_name)
        if not processor:
            logger.error(f"Processador não encontrado para fila: {queue_name}")
            return False
        
        try:
            # Para backups, usar método específico
            if queue_name == 'data.players.backups' and hasattr(processor, 'process_backup_data'):
                return processor.process_backup_data(data)
            else:
                return processor.process(data)
        except Exception as e:
            logger.error(f"Erro ao processar mensagem da fila {queue_name}: {e}")
            return False
    
    def process_batch(self):
        """Processa batch de mensagens"""
        if not self.batch:
            return
        
        batch_size = len(self.batch)
        logger.info(f"Processando batch de {batch_size} mensagens")
        
        success_count = 0
        fail_count = 0
        
        # Agrupar por tipo de fila para processamento em batch
        grouped = {}
        for item in self.batch:
            queue_name = item['queue']
            if queue_name not in grouped:
                grouped[queue_name] = []
            grouped[queue_name].append(item['data'])
        
        logger.info(f"Batch agrupado em {len(grouped)} tipos de fila: {list(grouped.keys())}")
        
        # Processar cada grupo
        for queue_name, items in grouped.items():
            try:
                logger.info(f"Processando {len(items)} mensagens da fila {queue_name}")
                
                if queue_name == 'data.players.positions':
                    # Para players, combinar todos os players de todas as mensagens
                    all_players = []
                    captured_timestamp = None
                    
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError) as e:
                                logger.warning(f"Item_data é string mas não é JSON válido: {e}")
                                continue
                        
                        if not isinstance(item_data, dict):
                            logger.warning(f"Item_data não é um dicionário: {type(item_data)}")
                            continue
                        
                        if 'players' in item_data:
                            players_list = item_data['players']
                            if isinstance(players_list, list):
                                all_players.extend(players_list)
                            elif isinstance(item_data, list):
                                all_players.extend(item_data)
                        
                        if not captured_timestamp and 'captured_timestamp' in item_data:
                            captured_timestamp = item_data['captured_timestamp']
                    
                    if all_players:
                        combined_data = {
                            'players': all_players,
                            'captured_timestamp': captured_timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        }
                        if self.process_message(queue_name, combined_data):
                            success_count += len(items)
                        else:
                            fail_count += len(items)
                    else:
                        fail_count += len(items)
                
                elif queue_name == 'data.vehicles.positions':
                    # Para vehicles, combinar todos os vehicles de todas as mensagens
                    all_vehicles = []
                    captured_timestamp = None
                    update_type = 'full'
                    
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError):
                                continue
                        
                        if not isinstance(item_data, dict):
                            continue
                        
                        if 'vehicles' in item_data:
                            vehicles_list = item_data['vehicles']
                            if isinstance(vehicles_list, list):
                                all_vehicles.extend(vehicles_list)
                        elif isinstance(item_data, list):
                            all_vehicles.extend(item_data)
                        
                        if not captured_timestamp and 'captured_timestamp' in item_data:
                            captured_timestamp = item_data['captured_timestamp']
                        
                        if 'update_type' in item_data:
                            update_type = item_data['update_type']
                    
                    if all_vehicles:
                        combined_data = {
                            'vehicles': all_vehicles,
                            'captured_timestamp': captured_timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                            'update_type': update_type
                        }
                        if self.process_message(queue_name, combined_data):
                            success_count += len(items)
                        else:
                            fail_count += len(items)
                    else:
                        fail_count += len(items)
                
                elif queue_name == 'data.containers.positions':
                    # Para containers, combinar todos os containers de todas as mensagens
                    all_containers = []
                    captured_timestamp = None
                    update_type = 'full'
                    
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError):
                                continue
                        
                        if not isinstance(item_data, dict):
                            continue
                        
                        containers_list = item_data.get('containers') or item_data.get('container_data', [])
                        if isinstance(containers_list, list):
                            all_containers.extend(containers_list)
                        
                        if not captured_timestamp and 'captured_timestamp' in item_data:
                            captured_timestamp = item_data['captured_timestamp']
                        
                        if 'update_type' in item_data:
                            update_type = item_data['update_type']
                    
                    if all_containers:
                        combined_data = {
                            'containers': all_containers,
                            'captured_timestamp': captured_timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                            'update_type': update_type
                        }
                        if self.process_message(queue_name, combined_data):
                            success_count += len(items)
                        else:
                            fail_count += len(items)
                    else:
                        fail_count += len(items)
                
                elif queue_name == 'data.structures.positions':
                    # Para structures, combinar todas as estruturas de todas as mensagens
                    all_fences = []
                    all_watchtowers = []
                    all_flags = []
                    captured_timestamp = None
                    
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError):
                                continue
                        
                        if not isinstance(item_data, dict):
                            continue
                        
                        if 'fence_data' in item_data:
                            fence_list = item_data['fence_data']
                            if isinstance(fence_list, list):
                                all_fences.extend(fence_list)
                        
                        if 'watchtower_data' in item_data:
                            watchtower_list = item_data['watchtower_data']
                            if isinstance(watchtower_list, list):
                                all_watchtowers.extend(watchtower_list)
                        
                        if 'flag_data' in item_data:
                            flag_list = item_data['flag_data']
                            if isinstance(flag_list, list):
                                all_flags.extend(flag_list)
                        
                        if not captured_timestamp and 'captured_timestamp' in item_data:
                            captured_timestamp = item_data['captured_timestamp']
                    
                    if all_fences or all_watchtowers or all_flags:
                        combined_data = {
                            'fence_data': all_fences,
                            'watchtower_data': all_watchtowers,
                            'flag_data': all_flags,
                            'captured_timestamp': captured_timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                        }
                        if self.process_message(queue_name, combined_data):
                            success_count += len(items)
                        else:
                            fail_count += len(items)
                    else:
                        fail_count += len(items)
                
                elif queue_name == 'data.players.backups':
                    # Para backups, processar cada mensagem individualmente
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError):
                                fail_count += 1
                                continue
                        
                        if not isinstance(item_data, dict):
                            fail_count += 1
                            continue
                        
                        if self.process_message(queue_name, item_data):
                            success_count += 1
                        else:
                            fail_count += 1
                
                else:
                    # Para outros tipos, manter comportamento original
                    for item_data in items:
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError):
                                fail_count += 1
                                continue
                        
                        if not isinstance(item_data, dict):
                            fail_count += 1
                            continue
                        
                        if self.process_message(queue_name, item_data):
                            success_count += 1
                        else:
                            fail_count += 1
                    
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
            
            # Log apenas a cada 10 mensagens para não poluir os logs
            if len(self.batch) % 10 == 0:
                logger.info(f"Recebidas {len(self.batch)} mensagens (última da fila {queue_name}, tamanho: {len(body)} bytes)")
            
            # Extrair dados da mensagem
            # O producer pode enviar de duas formas:
            # 1. Direto: {"action": "players_positions", "players": [...]}
            # 2. Wrapped: {"queue": "...", "message": "{...}", "timestamp": "..."}
            if isinstance(payload, dict):
                if 'message' in payload:
                    # Se 'message' existe, pode ser string JSON ou objeto
                    message = payload['message']
                    if isinstance(message, str):
                        try:
                            # Tentar fazer parse da string JSON
                            data = json.loads(message)
                            logger.debug(f"Parseado 'message' string JSON com sucesso")
                        except (json.JSONDecodeError, TypeError) as e:
                            logger.warning(f"Erro ao parsear 'message' como JSON: {e}. Usando como raw.")
                            data = {'raw': message}
                    elif isinstance(message, dict):
                        # Já é um dicionário
                        data = message
                    else:
                        data = {'raw': str(message)}
                else:
                    # Payload direto sem wrapper
                    data = payload
            else:
                # Payload não é dict, usar como raw
                data = {'raw': payload}
            
            logger.debug(f"Dados extraídos do payload. Tipo: {type(data)}, Chaves: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
            
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
                logger.info(f"Batch atingiu limite (tamanho: {len(self.batch)}, timeout: {current_time - self.last_batch_time:.2f}s)")
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

