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
import re
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional

# Tentar importar requests, usar urllib como fallback
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    try:
        from urllib import request as urllib_request
        from urllib.parse import urlencode
    except ImportError:
        urllib_request = None
        urlencode = None

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


class PositionsConsumer:
    """Consumer para processar dados de posições do RabbitMQ e gravar no SQLite"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.batch_size = 50
        self.batch_timeout = 3.0  # segundos
        self.batch = []
        self.last_batch_time = time.time()
        
        # Estado de players anteriores para detecção de conectados/desconectados
        self.previous_players: set = set()
        
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
    
    # ==================== VEHICLES ====================
    
    def _validate_vehicle_data(self, vehicle: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um vehicle"""
        # Validar vehicle_id (obrigatório)
        vehicle_id = vehicle.get('vehicle_id')
        if not vehicle_id or not isinstance(vehicle_id, str) or not vehicle_id.strip():
            return False
        
        # Validar coordenadas (obrigatórias, números válidos)
        # Pode estar em position.x/z/y ou diretamente em x/z/y
        position = vehicle.get('position')
        if position is not None and isinstance(position, dict) and len(position) > 0:
            # Coordenadas estão dentro de um objeto position
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            # Coordenadas estão diretamente no vehicle
            x = vehicle.get('x')
            z = vehicle.get('z')
            y = vehicle.get('y')
        
        # Validar que coordenadas não são None e não são strings vazias
        if x is None or z is None or y is None:
            return False
        
        # Verificar se são strings vazias
        if isinstance(x, str) and not x.strip():
            return False
        if isinstance(z, str) and not z.strip():
            return False
        if isinstance(y, str) and not y.strip():
            return False
        
        # Tentar converter para float e validar que não é NaN
        try:
            x_float = float(x)
            z_float = float(z)
            y_float = float(y)
            
            # Verificar se não é NaN (Not a Number)
            if math.isnan(x_float) or math.isnan(z_float) or math.isnan(y_float):
                return False
            
            # Verificar se não é infinito
            if math.isinf(x_float) or math.isinf(z_float) or math.isinf(y_float):
                return False
        except (TypeError, ValueError):
            return False
        
        return True
    
    def _normalize_vehicle_values(self, vehicle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normaliza valores de um vehicle para inserção no banco"""
        if not self._validate_vehicle_data(vehicle):
            return None
        
        normalized = {}
        
        # VehicleId (obrigatório, já validado)
        normalized['vehicle_id'] = vehicle['vehicle_id'].strip()
        
        # VehicleName
        vehicle_name = vehicle.get('vehicle_name', '')
        normalized['vehicle_name'] = vehicle_name.strip() if vehicle_name else ''
        
        # Coordenadas (obrigatórias, já validadas)
        # Usar a mesma lógica robusta de validação
        position = vehicle.get('position')
        if position is not None and isinstance(position, dict) and len(position) > 0:
            # Coordenadas estão dentro de um objeto position
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            # Coordenadas estão diretamente no vehicle
            x = vehicle.get('x')
            z = vehicle.get('z')
            y = vehicle.get('y')
        
        # Converter para float com tratamento de erro robusto
        try:
            normalized['coord_x'] = float(x)
            normalized['coord_z'] = float(z)
            normalized['coord_y'] = float(y)
        except (TypeError, ValueError) as e:
            # Se falhar na conversão, retornar None (não deveria acontecer após validação)
            logger.warning(f"Erro ao converter coordenadas para float: {e} (x={x}, z={z}, y={y})")
            return None
        
        # Health parts (opcionais)
        def safe_float(value, default=None):
            try:
                if value is None or value == '':
                    return default
                return float(value)
            except (TypeError, ValueError):
                return default
        
        health_parts = vehicle.get('health_parts', {})
        if isinstance(health_parts, dict):
            normalized['engine_health'] = safe_float(health_parts.get('engine'))
            normalized['body_health'] = safe_float(health_parts.get('body'))
            normalized['fuel_tank_health'] = safe_float(health_parts.get('fuel_tank'))
        else:
            normalized['engine_health'] = None
            normalized['body_health'] = None
            normalized['fuel_tank_health'] = None
        
        # Items e attachments (para processamento posterior)
        normalized['items'] = vehicle.get('items', [])
        normalized['attachments'] = vehicle.get('attachments', [])
        
        return normalized
    
    def _insert_vehicles_batch(self, cursor: sqlite3.Cursor, vehicles: List[Dict[str, Any]], 
                              timestamps: List[datetime], is_partial_update: bool = False) -> Tuple[int, int]:
        """
        Insere vehicles em batch e retorna (inserted_count, last_rowid)
        Retorna (0, 0) em caso de erro
        """
        if not vehicles or not timestamps or len(vehicles) != len(timestamps):
            return (0, 0)
        
        # Construir query SQL com múltiplos VALUES
        sql = """
        INSERT INTO vehicles_tracking (
            VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp,
            EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        # Preparar valores para executemany
        values = []
        for vehicle, timestamp in zip(vehicles, timestamps):
            # Formatar timestamp como string SQLite (YYYY-MM-DD HH:MM:SS.mmm)
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            values.append((
                vehicle['vehicle_id'],
                vehicle['vehicle_name'],
                vehicle['coord_x'],
                vehicle['coord_z'],
                vehicle['coord_y'],
                timestamp_str,
                vehicle['engine_health'],
                vehicle['body_health'],
                vehicle['fuel_tank_health'],
                1 if is_partial_update else 0
            ))
        
        # Executar INSERT em batch
        cursor.executemany(sql, values)
        
        # Obter inserted_count e last_rowid
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def _get_inserted_vehicle_ids(self, cursor: sqlite3.Cursor, first_rowid: int, last_rowid: int,
                                  vehicle_ids: List[str], inserted_count: int) -> Dict[str, int]:
        """
        Recupera IdVehicleTracking dos registros inseridos
        Retorna dict {vehicle_id: id_vehicle_tracking}
        """
        vehicle_tracking_map = {}
        
        # Método 1: Usar range de IdVehicleTracking
        if first_rowid > 0 and last_rowid > 0 and inserted_count > 0:
            try:
                cursor.execute("""
                    SELECT VehicleId, IdVehicleTracking 
                    FROM vehicles_tracking 
                    WHERE IdVehicleTracking >= ? AND IdVehicleTracking <= ? 
                    ORDER BY IdVehicleTracking ASC
                """, (first_rowid, last_rowid))
                
                results = cursor.fetchall()
                if results and len(results) == inserted_count:
                    # Validar que os VehicleIds correspondem
                    for vehicle_id, tracking_id in results:
                        if vehicle_id in vehicle_ids:
                            vehicle_tracking_map[vehicle_id] = tracking_id
                    
                    if len(vehicle_tracking_map) == inserted_count:
                        return vehicle_tracking_map
            except Exception as e:
                logger.warning(f"Método 1 de recuperação de IDs de vehicles falhou: {e}")
        
        # Método 2: Fallback - buscar por VehicleIds com janela de tempo (5 segundos)
        if vehicle_ids and not vehicle_tracking_map:
            try:
                placeholders = ','.join(['?'] * len(vehicle_ids))
                cursor.execute(f"""
                    SELECT VehicleId, IdVehicleTracking 
                    FROM vehicles_tracking 
                    WHERE VehicleId IN ({placeholders}) 
                    AND TimeStamp >= datetime('now', '-5 seconds') 
                    ORDER BY IdVehicleTracking DESC 
                    LIMIT ?
                """, vehicle_ids + [inserted_count])
                
                results = cursor.fetchall()
                for vehicle_id, tracking_id in results:
                    if vehicle_id in vehicle_ids:
                        vehicle_tracking_map[vehicle_id] = tracking_id
                
                if vehicle_tracking_map:
                    return vehicle_tracking_map
            except Exception as e:
                logger.warning(f"Método 2 de recuperação de IDs de vehicles falhou: {e}")
        
        # Método 3: Fallback final - buscar últimos N registros sem filtro de tempo
        if vehicle_ids and not vehicle_tracking_map:
            try:
                placeholders = ','.join(['?'] * len(vehicle_ids))
                cursor.execute(f"""
                    SELECT VehicleId, IdVehicleTracking 
                    FROM vehicles_tracking 
                    WHERE VehicleId IN ({placeholders}) 
                    ORDER BY IdVehicleTracking DESC 
                    LIMIT ?
                """, vehicle_ids + [inserted_count])
                
                results = cursor.fetchall()
                for vehicle_id, tracking_id in results:
                    if vehicle_id in vehicle_ids:
                        vehicle_tracking_map[vehicle_id] = tracking_id
            except Exception as e:
                logger.warning(f"Método 3 de recuperação de IDs de vehicles falhou: {e}")
        
        return vehicle_tracking_map
    
    def _insert_vehicle_items_batch(self, cursor: sqlite3.Cursor, vehicle_tracking_map: Dict[str, int],
                                    vehicles_data: List[Dict[str, Any]], timestamp: datetime) -> int:
        """Insere items de vehicles em batch"""
        if not vehicle_tracking_map or not vehicles_data:
            return 0
        
        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        
        sql = """
        INSERT INTO vehicles_items (VehicleTrackingId, ItemType, ItemHealth, TimeStamp)
        VALUES (?, ?, ?, ?)
        """
        
        values = []
        for vehicle in vehicles_data:
            vehicle_id = vehicle.get('vehicle_id')
            tracking_id = vehicle_tracking_map.get(vehicle_id)
            if not tracking_id:
                continue
            
            items = vehicle.get('items', [])
            if not isinstance(items, list):
                continue
            
            for item in items:
                if not isinstance(item, dict):
                    continue
                
                item_type = item.get('type')
                if not item_type or not isinstance(item_type, str) or not item_type.strip():
                    continue
                
                item_health = item.get('health')
                try:
                    item_health_float = float(item_health) if item_health is not None and item_health != '' else None
                except (TypeError, ValueError):
                    item_health_float = None
                
                values.append((
                    tracking_id,
                    item_type.strip(),
                    item_health_float,
                    timestamp_str
                ))
        
        if not values:
            return 0
        
        cursor.executemany(sql, values)
        return cursor.rowcount
    
    def _insert_vehicle_attachments_batch(self, cursor: sqlite3.Cursor, vehicle_tracking_map: Dict[str, int],
                                          vehicles_data: List[Dict[str, Any]], timestamp: datetime) -> int:
        """Insere attachments de vehicles em batch"""
        if not vehicle_tracking_map or not vehicles_data:
            return 0
        
        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        
        sql = """
        INSERT INTO vehicles_attachments (VehicleTrackingId, AttachmentType, AttachmentHealth, TimeStamp)
        VALUES (?, ?, ?, ?)
        """
        
        values = []
        for vehicle in vehicles_data:
            vehicle_id = vehicle.get('vehicle_id')
            tracking_id = vehicle_tracking_map.get(vehicle_id)
            if not tracking_id:
                continue
            
            attachments = vehicle.get('attachments', [])
            if not isinstance(attachments, list):
                continue
            
            for attachment in attachments:
                if not isinstance(attachment, dict):
                    continue
                
                attachment_type = attachment.get('type')
                if not attachment_type or not isinstance(attachment_type, str) or not attachment_type.strip():
                    continue
                
                attachment_health = attachment.get('health')
                try:
                    attachment_health_float = float(attachment_health) if attachment_health is not None and attachment_health != '' else None
                except (TypeError, ValueError):
                    attachment_health_float = None
                
                values.append((
                    tracking_id,
                    attachment_type.strip(),
                    attachment_health_float,
                    timestamp_str
                ))
        
        if not values:
            return 0
        
        cursor.executemany(sql, values)
        return cursor.rowcount
    
    def process_vehicles_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """
        Processa dados de veículos e insere no banco SQLite
        Implementa lógica completa baseada em INSERT_VEHICLES_POSITIONS_BATCH do config.sh
        """
        max_retries = 5
        base_retry_delay = 0.5
        
        # Validar entrada
        vehicles = data.get('vehicles', [])
        if not vehicles or not isinstance(vehicles, list):
            logger.warning("Dados de vehicles inválidos ou vazios")
            return False
        
        logger.info(f"Processando {len(vehicles)} vehicles do RabbitMQ")
        
        # Detectar se é update parcial
        update_type = data.get('update_type', 'full')
        is_partial_update = (update_type == 'position_only')
        
        # Extrair timestamp base
        captured_timestamp = data.get('captured_timestamp')
        if captured_timestamp:
            try:
                if isinstance(captured_timestamp, str):
                    base_timestamp = datetime.strptime(captured_timestamp, '%Y-%m-%d %H:%M:%S')
                else:
                    base_timestamp = datetime.now()
            except (ValueError, TypeError):
                base_timestamp = datetime.now()
        else:
            base_timestamp = datetime.now()
        
        # Normalizar e validar vehicles
        normalized_vehicles = []
        vehicle_ids = []
        validation_errors = []
        for idx, vehicle in enumerate(vehicles):
            if not isinstance(vehicle, dict):
                validation_errors.append(f"Vehicle {idx}: não é um dicionário (tipo: {type(vehicle)})")
                continue
            
            # Log primeiro vehicle para debug (INFO para garantir que apareça)
            if idx == 0:
                logger.info(f"Primeiro vehicle recebido: chaves={list(vehicle.keys())}")
                logger.info(f"Primeiro vehicle: vehicle_id={vehicle.get('vehicle_id')}, position={vehicle.get('position')}")
                # Verificar estrutura de position
                position = vehicle.get('position')
                if position:
                    logger.info(f"Position type: {type(position)}, value: {position}")
                    if isinstance(position, dict):
                        x_val = position.get('x')
                        z_val = position.get('z')
                        y_val = position.get('y')
                        logger.info(f"Position keys: {list(position.keys())}, x={x_val} (type: {type(x_val)}), z={z_val} (type: {type(z_val)}), y={y_val} (type: {type(y_val)})")
                else:
                    # Verificar se coordenadas estão diretamente no vehicle
                    x_val = vehicle.get('x')
                    z_val = vehicle.get('z')
                    y_val = vehicle.get('y')
                    logger.info(f"Sem 'position', verificando x/z/y direto: x={x_val} (type: {type(x_val)}), z={z_val} (type: {type(z_val)}), y={y_val} (type: {type(y_val)})")
            
            normalized = self._normalize_vehicle_values(vehicle)
            if normalized:
                normalized_vehicles.append(normalized)
                vehicle_ids.append(normalized['vehicle_id'])
                # Log primeiro vehicle normalizado com sucesso
                if idx == 0:
                    logger.info(f"Primeiro vehicle normalizado com sucesso: coord_x={normalized['coord_x']}, coord_z={normalized['coord_z']}, coord_y={normalized['coord_y']}")
            else:
                # Coletar informações detalhadas sobre por que falhou
                vehicle_id = vehicle.get('vehicle_id', 'N/A')
                position = vehicle.get('position', 'N/A')
                # Extrair coordenadas corretamente
                if position is not None and isinstance(position, dict) and len(position) > 0:
                    x = position.get('x', 'N/A')
                    z = position.get('z', 'N/A')
                    y = position.get('y', 'N/A')
                else:
                    x = vehicle.get('x', 'N/A')
                    z = vehicle.get('z', 'N/A')
                    y = vehicle.get('y', 'N/A')
                validation_errors.append(f"Vehicle {idx} (id={vehicle_id}): falhou na validação - position={position}, x={x} (type: {type(x)}), z={z} (type: {type(z)}), y={y} (type: {type(y)})")
        
        if not normalized_vehicles:
            logger.warning(f"Nenhum vehicle válido após normalização de {len(vehicles)} vehicles recebidos")
            if validation_errors:
                # Log apenas os primeiros 5 erros para não poluir (INFO para garantir que apareça)
                for error in validation_errors[:5]:
                    logger.info(error)
                if len(validation_errors) > 5:
                    logger.info(f"... e mais {len(validation_errors) - 5} erros")
            return False
        
        logger.info(f"Após normalização: {len(normalized_vehicles)} vehicles válidos de {len(vehicles)} recebidos")
        
        # Retry logic
        conn = None
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Buscar registros anteriores para comparação
                prev_vehicles = self._fetch_previous_vehicles(cursor, db_path, vehicle_ids, is_partial_update)
                
                # Separar vehicles em dois grupos: UPDATE e INSERT
                vehicles_to_update = []
                vehicles_to_insert = []
                
                for normalized_vehicle in normalized_vehicles:
                    vehicle_id = normalized_vehicle['vehicle_id']
                    previous = prev_vehicles.get(vehicle_id)
                    
                    # Comparar dados atuais com anteriores
                    has_changes, diff_message = self._compare_vehicle_data(
                        normalized_vehicle, previous, is_partial_update
                    )
                    
                    if not has_changes and previous:
                        # Não há mudanças: usar UPDATE
                        vehicles_to_update.append(normalized_vehicle)
                    else:
                        # Há mudanças ou vehicle novo: usar INSERT
                        vehicles_to_insert.append(normalized_vehicle)
                
                # Processar UPDATEs primeiro
                updated_count = 0
                if vehicles_to_update:
                    for vehicle in vehicles_to_update:
                        vehicle_id = vehicle['vehicle_id']
                        # Gerar timestamp único para este vehicle
                        timestamp = base_timestamp + timedelta(milliseconds=updated_count)
                        tracking_id = self._update_vehicle_timestamp(
                            cursor, vehicle_id, timestamp, prefer_complete=(not is_partial_update)
                        )
                        if tracking_id:
                            updated_count += 1
                
                # Processar INSERTs
                inserted_count = 0
                last_rowid = 0
                if vehicles_to_insert:
                    # Gerar timestamps únicos
                    timestamps = self._generate_unique_timestamps(base_timestamp, len(vehicles_to_insert))
                    
                    # Iniciar transação
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    
                    # Inserir vehicles em batch
                    inserted_count, last_rowid = self._insert_vehicles_batch(
                        cursor, vehicles_to_insert, timestamps, is_partial_update
                    )
                
                    if inserted_count <= 0:
                        conn.rollback()
                        conn.close()
                        logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{max_retries})")
                        if attempt < max_retries:
                            retry_delay = base_retry_delay * (2 ** (attempt - 1))
                            time.sleep(retry_delay)
                            continue
                        return False
                    
                    # Commit transação
                    conn.commit()
                    
                    # Recuperar IDs inseridos
                    inserted_vehicle_ids = [v['vehicle_id'] for v in vehicles_to_insert]
                    first_rowid = last_rowid - inserted_count + 1 if last_rowid > 0 and inserted_count > 0 else 0
                    vehicle_tracking_map = self._get_inserted_vehicle_ids(
                        cursor, first_rowid, last_rowid, inserted_vehicle_ids, inserted_count
                    )
                    
                    # Se não é update parcial, inserir items e attachments
                    if not is_partial_update and vehicle_tracking_map:
                        # Iniciar nova transação para items/attachments
                        cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                        
                        items_count = self._insert_vehicle_items_batch(
                            cursor, vehicle_tracking_map, vehicles_to_insert, base_timestamp
                        )
                        
                        attachments_count = self._insert_vehicle_attachments_batch(
                            cursor, vehicle_tracking_map, vehicles_to_insert, base_timestamp
                        )
                        
                        conn.commit()
                        
                        logger.info(f"Inseridos {items_count} items e {attachments_count} attachments de vehicles")
                else:
                    vehicle_tracking_map = {}
                
                conn.close()
                
                # Log sucesso
                total_processed = updated_count + inserted_count
                logger.info(f"Processados {total_processed} vehicles: {updated_count} atualizados, {inserted_count} inseridos")
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de vehicles (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir vehicles após {max_retries} tentativas")
        return False
    
    # ==================== CONTAINERS ====================
    
    def _validate_container_data(self, container: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um container"""
        # Validar container_id (obrigatório)
        container_id = container.get('container_id')
        if not container_id or not isinstance(container_id, str) or not container_id.strip():
            return False
        
        # Validar coordenadas (obrigatórias, números válidos)
        position = container.get('position', {})
        if isinstance(position, dict):
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            x = container.get('x')
            z = container.get('z')
            y = container.get('y')
        
        try:
            float(x) if x is not None else None
            float(z) if z is not None else None
            float(y) if y is not None else None
        except (TypeError, ValueError):
            return False
        
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _normalize_container_values(self, container: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normaliza valores de um container para inserção no banco"""
        if not self._validate_container_data(container):
            return None
        
        normalized = {}
        
        # ContainerId (obrigatório, já validado)
        normalized['container_id'] = container['container_id'].strip()
        
        # ContainerName (container_type)
        container_type = container.get('container_type', '')
        normalized['container_name'] = container_type.strip() if container_type else ''
        
        # Coordenadas (obrigatórias, já validadas)
        position = container.get('position', {})
        if isinstance(position, dict):
            normalized['coord_x'] = float(position.get('x'))
            normalized['coord_z'] = float(position.get('z'))
            normalized['coord_y'] = float(position.get('y'))
        else:
            normalized['coord_x'] = float(container.get('x'))
            normalized['coord_z'] = float(container.get('z'))
            normalized['coord_y'] = float(container.get('y'))
        
        # Items (para processamento posterior)
        normalized['items'] = container.get('items', [])
        
        return normalized
    
    def _insert_containers_batch(self, cursor: sqlite3.Cursor, containers: List[Dict[str, Any]], 
                                timestamps: List[datetime], is_partial_update: bool = False) -> Tuple[int, int]:
        """
        Insere containers em batch e retorna (inserted_count, last_rowid)
        Retorna (0, 0) em caso de erro
        """
        if not containers or not timestamps or len(containers) != len(timestamps):
            return (0, 0)
        
        # Construir query SQL com múltiplos VALUES
        sql = """
        INSERT INTO containers_tracking (
            ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp, IsPartialUpdate
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        
        # Preparar valores para executemany
        values = []
        for container, timestamp in zip(containers, timestamps):
            # Formatar timestamp como string SQLite (YYYY-MM-DD HH:MM:SS.mmm)
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            values.append((
                container['container_id'],
                container['container_name'],
                container['coord_x'],
                container['coord_z'],
                container['coord_y'],
                timestamp_str,
                1 if is_partial_update else 0
            ))
        
        # Executar INSERT em batch
        cursor.executemany(sql, values)
        
        # Obter inserted_count e last_rowid
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def _get_inserted_container_ids(self, cursor: sqlite3.Cursor, first_rowid: int, last_rowid: int,
                                    container_ids: List[str], inserted_count: int) -> Dict[str, int]:
        """
        Recupera IdContainerTracking dos registros inseridos
        Retorna dict {container_id: id_container_tracking}
        """
        container_tracking_map = {}
        
        # Método 1: Usar range de IdContainerTracking
        if first_rowid > 0 and last_rowid > 0 and inserted_count > 0:
            try:
                cursor.execute("""
                    SELECT ContainerId, IdContainerTracking 
                    FROM containers_tracking 
                    WHERE IdContainerTracking >= ? AND IdContainerTracking <= ? 
                    ORDER BY IdContainerTracking ASC
                """, (first_rowid, last_rowid))
                
                results = cursor.fetchall()
                if results and len(results) == inserted_count:
                    for container_id, tracking_id in results:
                        if container_id in container_ids:
                            container_tracking_map[container_id] = tracking_id
                    
                    if len(container_tracking_map) == inserted_count:
                        return container_tracking_map
            except Exception as e:
                logger.warning(f"Método 1 de recuperação de IDs de containers falhou: {e}")
        
        # Método 2: Fallback - buscar por ContainerIds com janela de tempo (5 segundos)
        if container_ids and not container_tracking_map:
            try:
                placeholders = ','.join(['?'] * len(container_ids))
                cursor.execute(f"""
                    SELECT ContainerId, IdContainerTracking 
                    FROM containers_tracking 
                    WHERE ContainerId IN ({placeholders}) 
                    AND TimeStamp >= datetime('now', '-5 seconds') 
                    ORDER BY IdContainerTracking DESC 
                    LIMIT ?
                """, container_ids + [inserted_count])
                
                results = cursor.fetchall()
                for container_id, tracking_id in results:
                    if container_id in container_ids:
                        container_tracking_map[container_id] = tracking_id
                
                if container_tracking_map:
                    return container_tracking_map
            except Exception as e:
                logger.warning(f"Método 2 de recuperação de IDs de containers falhou: {e}")
        
        # Método 3: Fallback final - buscar últimos N registros sem filtro de tempo
        if container_ids and not container_tracking_map:
            try:
                placeholders = ','.join(['?'] * len(container_ids))
                cursor.execute(f"""
                    SELECT ContainerId, IdContainerTracking 
                    FROM containers_tracking 
                    WHERE ContainerId IN ({placeholders}) 
                    ORDER BY IdContainerTracking DESC 
                    LIMIT ?
                """, container_ids + [inserted_count])
                
                results = cursor.fetchall()
                for container_id, tracking_id in results:
                    if container_id in container_ids:
                        container_tracking_map[container_id] = tracking_id
            except Exception as e:
                logger.warning(f"Método 3 de recuperação de IDs de containers falhou: {e}")
        
        return container_tracking_map
    
    def _insert_container_items_batch(self, cursor: sqlite3.Cursor, container_tracking_map: Dict[str, int],
                                      containers_data: List[Dict[str, Any]], timestamp: datetime) -> int:
        """Insere items de containers em batch"""
        if not container_tracking_map or not containers_data:
            return 0
        
        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        
        sql = """
        INSERT INTO container_items_tracking (ContainerTrackingId, ItemType, ItemHealth, TimeStamp)
        VALUES (?, ?, ?, ?)
        """
        
        values = []
        for container in containers_data:
            container_id = container.get('container_id')
            tracking_id = container_tracking_map.get(container_id)
            if not tracking_id:
                continue
            
            items = container.get('items', [])
            if not isinstance(items, list):
                continue
            
            for item in items:
                if not isinstance(item, dict):
                    continue
                
                item_type = item.get('type')
                if not item_type or not isinstance(item_type, str) or not item_type.strip():
                    continue
                
                item_health = item.get('health')
                try:
                    item_health_float = float(item_health) if item_health is not None and item_health != '' else None
                except (TypeError, ValueError):
                    item_health_float = None
                
                values.append((
                    tracking_id,
                    item_type.strip(),
                    item_health_float,
                    timestamp_str
                ))
        
        if not values:
            return 0
        
        cursor.executemany(sql, values)
        return cursor.rowcount
    
    def process_containers_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """
        Processa dados de containers e insere no banco SQLite
        Implementa lógica completa baseada em INSERT_CONTAINERS_POSITIONS_BATCH do config.sh
        """
        max_retries = 5
        base_retry_delay = 0.5
        
        # Validar entrada - suportar tanto 'containers' quanto 'container_data'
        containers = data.get('containers') or data.get('container_data', [])
        if not containers or not isinstance(containers, list):
            logger.warning("Dados de containers inválidos ou vazios")
            return False
        
        logger.info(f"Processando {len(containers)} containers do RabbitMQ")
        
        # Detectar se é update parcial
        update_type = data.get('update_type', 'full')
        is_partial_update = (update_type == 'position_only')
        
        # Extrair timestamp base
        captured_timestamp = data.get('captured_timestamp')
        if captured_timestamp:
            try:
                if isinstance(captured_timestamp, str):
                    base_timestamp = datetime.strptime(captured_timestamp, '%Y-%m-%d %H:%M:%S')
                else:
                    base_timestamp = datetime.now()
            except (ValueError, TypeError):
                base_timestamp = datetime.now()
        else:
            base_timestamp = datetime.now()
        
        # Normalizar e validar containers
        normalized_containers = []
        container_ids = []
        for container in containers:
            normalized = self._normalize_container_values(container)
            if normalized:
                normalized_containers.append(normalized)
                container_ids.append(normalized['container_id'])
        
        if not normalized_containers:
            logger.warning("Nenhum container válido após normalização")
            return False
        
        logger.info(f"Após normalização: {len(normalized_containers)} containers válidos de {len(containers)} recebidos")
        
        # Retry logic
        conn = None
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Buscar registros anteriores para comparação
                prev_containers = self._fetch_previous_containers(cursor, db_path, container_ids)
                
                # Separar containers em dois grupos: UPDATE e INSERT
                containers_to_update = []
                containers_to_insert = []
                
                for normalized_container in normalized_containers:
                    container_id = normalized_container['container_id']
                    previous = prev_containers.get(container_id)
                    
                    # Comparar dados atuais com anteriores
                    has_changes, diff_message = self._compare_container_data(
                        normalized_container, previous, is_partial_update
                    )
                    
                    if not has_changes and previous:
                        # Não há mudanças: usar UPDATE
                        containers_to_update.append(normalized_container)
                    else:
                        # Há mudanças ou container novo: usar INSERT
                        containers_to_insert.append(normalized_container)
                
                # Processar UPDATEs primeiro
                updated_count = 0
                if containers_to_update:
                    for container in containers_to_update:
                        container_id = container['container_id']
                        # Gerar timestamp único para este container
                        timestamp = base_timestamp + timedelta(milliseconds=updated_count)
                        tracking_id = self._update_container_timestamp(
                            cursor, container_id, timestamp, prefer_complete=(not is_partial_update)
                        )
                        if tracking_id:
                            updated_count += 1
                
                # Processar INSERTs
                inserted_count = 0
                last_rowid = 0
                if containers_to_insert:
                    # Gerar timestamps únicos
                    timestamps = self._generate_unique_timestamps(base_timestamp, len(containers_to_insert))
                    
                    # Iniciar transação
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    
                    # Inserir containers em batch
                    inserted_count, last_rowid = self._insert_containers_batch(
                        cursor, containers_to_insert, timestamps, is_partial_update
                    )
                
                    if inserted_count <= 0:
                        conn.rollback()
                        conn.close()
                        logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{max_retries})")
                        if attempt < max_retries:
                            retry_delay = base_retry_delay * (2 ** (attempt - 1))
                            time.sleep(retry_delay)
                            continue
                        return False
                    
                    # Commit transação
                    conn.commit()
                    
                    # Recuperar IDs inseridos
                    inserted_container_ids = [c['container_id'] for c in containers_to_insert]
                    first_rowid = last_rowid - inserted_count + 1 if last_rowid > 0 and inserted_count > 0 else 0
                    container_tracking_map = self._get_inserted_container_ids(
                        cursor, first_rowid, last_rowid, inserted_container_ids, inserted_count
                    )
                    
                    # Se não é update parcial, inserir items
                    if not is_partial_update and container_tracking_map:
                        # Iniciar nova transação para items
                        cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                        
                        items_count = self._insert_container_items_batch(
                            cursor, container_tracking_map, containers_to_insert, base_timestamp
                        )
                        
                        conn.commit()
                        
                        logger.info(f"Inseridos {items_count} items de containers")
                else:
                    container_tracking_map = {}
                
                conn.close()
                
                # Log sucesso
                total_processed = updated_count + inserted_count
                logger.info(f"Processados {total_processed} containers: {updated_count} atualizados, {inserted_count} inseridos")
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de containers (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir containers após {max_retries} tentativas")
        return False
    
    def _configure_sqlite_pragmas(self, cursor: sqlite3.Cursor) -> None:
        """Configura PRAGMAs SQLite para otimização"""
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA synchronous = NORMAL")
        except Exception as e:
            logger.warning(f"Erro ao configurar PRAGMAs (continuando): {e}")
    
    def _normalize_coordinate(self, coord: Optional[float]) -> str:
        """
        Normaliza coordenada para comparação (3 casas decimais)
        Similar a normalize_coordinate() do containers_positions.sh
        """
        if coord is None:
            return ""
        try:
            return f"{float(coord):.3f}"
        except (TypeError, ValueError):
            return ""
    
    def _fetch_previous_vehicles(self, cursor: sqlite3.Cursor, db_path: str, vehicle_ids: List[str], is_partial_update: bool = False) -> Dict[str, Dict[str, Any]]:
        """
        Busca últimos registros de vehicles usando window function
        Retorna dict {vehicle_id: {name, x, z, y, engine_health, body_health, fuel_tank_health, items_str, attachments_str, is_partial_update}}
        
        Para snapshots parciais: busca último registro qualquer (completo ou parcial)
        Para snapshots completos: busca apenas último registro completo (IsPartialUpdate = 0)
        """
        if not vehicle_ids:
            return {}
        
        prev_vehicles = {}
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            # Construir query com window function
            # Para snapshots completos: buscar apenas último registro completo (IsPartialUpdate = 0)
            # Para snapshots parciais: buscar último registro qualquer (completo ou parcial)
            placeholders = ','.join(['?'] * len(vehicle_ids))
            
            if is_partial_update:
                # Snapshot parcial: buscar último registro qualquer (completo ou parcial)
                if has_is_destroyed:
                    sql_query = f"""
                    SELECT 
                        ranked.VehicleId,
                        ranked.VehicleName,
                        ranked.PositionX,
                        ranked.PositionZ,
                        ranked.PositionY,
                        IFNULL(ranked.EngineHealth, ''),
                        IFNULL(ranked.BodyHealth, ''),
                        IFNULL(ranked.FuelTankHealth, ''),
                        IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
                        IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
                        IFNULL(ranked.IsPartialUpdate, 0)
                    FROM (
                        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
                               EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
                               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
                        FROM vehicles_tracking
                        WHERE VehicleId IN ({placeholders})
                        AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                    ) ranked
                    LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
                    LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
                    WHERE ranked.rn = 1
                    GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                             ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate
                    """
                else:
                    sql_query = f"""
                    SELECT 
                        ranked.VehicleId,
                        ranked.VehicleName,
                        ranked.PositionX,
                        ranked.PositionZ,
                        ranked.PositionY,
                        IFNULL(ranked.EngineHealth, ''),
                        IFNULL(ranked.BodyHealth, ''),
                        IFNULL(ranked.FuelTankHealth, ''),
                        IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
                        IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
                        IFNULL(ranked.IsPartialUpdate, 0)
                    FROM (
                        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
                               EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
                               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
                        FROM vehicles_tracking
                        WHERE VehicleId IN ({placeholders})
                    ) ranked
                    LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
                    LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
                    WHERE ranked.rn = 1
                    GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                             ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate
                    """
            else:
                # Snapshot completo: buscar apenas último registro completo (IsPartialUpdate = 0)
                if has_is_destroyed:
                    sql_query = f"""
                    SELECT 
                        ranked.VehicleId,
                        ranked.VehicleName,
                        ranked.PositionX,
                        ranked.PositionZ,
                        ranked.PositionY,
                        IFNULL(ranked.EngineHealth, ''),
                        IFNULL(ranked.BodyHealth, ''),
                        IFNULL(ranked.FuelTankHealth, ''),
                        IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
                        IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
                        IFNULL(ranked.IsPartialUpdate, 0)
                    FROM (
                        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
                               EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
                               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
                        FROM vehicles_tracking
                        WHERE VehicleId IN ({placeholders})
                        AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                        AND IsPartialUpdate = 0
                    ) ranked
                    LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
                    LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
                    WHERE ranked.rn = 1
                    GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                             ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate
                    """
                else:
                    sql_query = f"""
                    SELECT 
                        ranked.VehicleId,
                        ranked.VehicleName,
                        ranked.PositionX,
                        ranked.PositionZ,
                        ranked.PositionY,
                        IFNULL(ranked.EngineHealth, ''),
                        IFNULL(ranked.BodyHealth, ''),
                        IFNULL(ranked.FuelTankHealth, ''),
                        IFNULL(GROUP_CONCAT(vi.ItemType || ':' || IFNULL(vi.ItemHealth, ''), ','), ''),
                        IFNULL(GROUP_CONCAT(va.AttachmentType || ':' || IFNULL(va.AttachmentHealth, ''), ','), ''),
                        IFNULL(ranked.IsPartialUpdate, 0)
                    FROM (
                        SELECT VehicleId, VehicleName, PositionX, PositionZ, PositionY, IdVehicleTracking,
                               EngineHealth, BodyHealth, FuelTankHealth, IsPartialUpdate,
                               ROW_NUMBER() OVER (PARTITION BY VehicleId ORDER BY TimeStamp DESC) as rn
                        FROM vehicles_tracking
                        WHERE VehicleId IN ({placeholders})
                        AND IsPartialUpdate = 0
                    ) ranked
                    LEFT JOIN vehicles_items vi ON ranked.IdVehicleTracking = vi.VehicleTrackingId
                    LEFT JOIN vehicles_attachments va ON ranked.IdVehicleTracking = va.VehicleTrackingId
                    WHERE ranked.rn = 1
                    GROUP BY ranked.VehicleId, ranked.VehicleName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                             ranked.EngineHealth, ranked.BodyHealth, ranked.FuelTankHealth, ranked.IsPartialUpdate
                    """
            
            cursor.execute(sql_query, vehicle_ids)
            results = cursor.fetchall()
            
            for row in results:
                vehicle_id = row[0]
                if vehicle_id in vehicle_ids:
                    prev_vehicles[vehicle_id] = {
                        'name': row[1] or '',
                        'x': self._normalize_coordinate(row[2]),
                        'z': self._normalize_coordinate(row[3]),
                        'y': self._normalize_coordinate(row[4]),
                        'engine_health': self._normalize_coordinate(row[5]) if row[5] else '',
                        'body_health': self._normalize_coordinate(row[6]) if row[6] else '',
                        'fuel_tank_health': self._normalize_coordinate(row[7]) if row[7] else '',
                        'items_str': row[8] or '',
                        'attachments_str': row[9] or '',
                        'is_partial_update': int(row[10]) if row[10] is not None else 0
                    }
        except Exception as e:
            logger.warning(f"Erro ao buscar vehicles anteriores: {e}")
        
        return prev_vehicles
    
    def _fetch_previous_containers(self, cursor: sqlite3.Cursor, db_path: str, container_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Busca últimos registros de containers usando window function
        Retorna dict {container_id: {name, x, z, y, items_str, is_partial_update}}
        """
        if not container_ids:
            return {}
        
        prev_containers = {}
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            # Construir query com window function
            if has_is_destroyed:
                sql_query = """
                SELECT 
                    ranked.ContainerId,
                    ranked.ContainerName,
                    ranked.PositionX,
                    ranked.PositionZ,
                    ranked.PositionY,
                    IFNULL(GROUP_CONCAT(ci.ItemType || ':' || IFNULL(ci.ItemHealth, ''), ','), ''),
                    IFNULL(ranked.IsPartialUpdate, 0)
                FROM (
                    SELECT ContainerId, ContainerName, PositionX, PositionZ, PositionY, IdContainerTracking,
                           IsPartialUpdate,
                           ROW_NUMBER() OVER (PARTITION BY ContainerId ORDER BY TimeStamp DESC) as rn
                    FROM containers_tracking
                    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
                    AND IsPartialUpdate = 0
                ) ranked
                LEFT JOIN container_items_tracking ci ON ranked.IdContainerTracking = ci.ContainerTrackingId
                WHERE ranked.rn = 1
                GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                         ranked.IsPartialUpdate
                """
            else:
                sql_query = """
                SELECT 
                    ranked.ContainerId,
                    ranked.ContainerName,
                    ranked.PositionX,
                    ranked.PositionZ,
                    ranked.PositionY,
                    IFNULL(GROUP_CONCAT(ci.ItemType || ':' || IFNULL(ci.ItemHealth, ''), ','), ''),
                    IFNULL(ranked.IsPartialUpdate, 0)
                FROM (
                    SELECT ContainerId, ContainerName, PositionX, PositionZ, PositionY, IdContainerTracking,
                           IsPartialUpdate,
                           ROW_NUMBER() OVER (PARTITION BY ContainerId ORDER BY TimeStamp DESC) as rn
                    FROM containers_tracking
                    WHERE IsPartialUpdate = 0
                ) ranked
                LEFT JOIN container_items_tracking ci ON ranked.IdContainerTracking = ci.ContainerTrackingId
                WHERE ranked.rn = 1
                GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                         ranked.IsPartialUpdate
                """
            
            cursor.execute(sql_query)
            results = cursor.fetchall()
            
            for row in results:
                container_id = row[0]
                if container_id in container_ids:
                    prev_containers[container_id] = {
                        'name': row[1] or '',
                        'x': self._normalize_coordinate(row[2]),
                        'z': self._normalize_coordinate(row[3]),
                        'y': self._normalize_coordinate(row[4]),
                        'items_str': row[5] or '',
                        'is_partial_update': int(row[6]) if row[6] is not None else 0
                    }
        except Exception as e:
            logger.warning(f"Erro ao buscar containers anteriores: {e}")
        
        return prev_containers
    
    def _compare_vehicle_data(self, current: Dict[str, Any], previous: Optional[Dict[str, Any]], is_partial_update: bool) -> Tuple[bool, str]:
        """
        Compara dados atuais de vehicle com anteriores
        Retorna (has_changes, diff_message)
        """
        if not previous:
            return (True, "")  # Vehicle novo
        
        diff_message = ""
        
        # Normalizar coordenadas atuais
        current_x = self._normalize_coordinate(current.get('coord_x'))
        current_z = self._normalize_coordinate(current.get('coord_z'))
        current_y = self._normalize_coordinate(current.get('coord_y'))
        
        # Comparar posição
        if current_x != previous.get('x') or current_z != previous.get('z') or current_y != previous.get('y'):
            prev_x = previous.get('x', '')
            prev_z = previous.get('z', '')
            prev_y = previous.get('y', '')
            diff_message += f"movido(({prev_x},{prev_z},{prev_y})->({current_x},{current_z},{current_y})); "
        
        # Comparar health parts
        current_engine = self._normalize_coordinate(current.get('engine_health'))
        current_body = self._normalize_coordinate(current.get('body_health'))
        current_fuel = self._normalize_coordinate(current.get('fuel_tank_health'))
        
        prev_engine = previous.get('engine_health', '')
        prev_body = previous.get('body_health', '')
        prev_fuel = previous.get('fuel_tank_health', '')
        
        if current_engine != prev_engine:
            diff_message += f"engine_health({prev_engine or 'vazio'}->{current_engine or 'vazio'}); "
        if current_body != prev_body:
            diff_message += f"body_health({prev_body or 'vazio'}->{current_body or 'vazio'}); "
        if current_fuel != prev_fuel:
            diff_message += f"fuel_tank_health({prev_fuel or 'vazio'}->{current_fuel or 'vazio'}); "
        
        # Para snapshots completos, comparar items e attachments
        if not is_partial_update:
            prev_is_partial = previous.get('is_partial_update', 0)
            
            # Só comparar items/attachments se último registro também for completo
            if prev_is_partial == 0:
                # Comparar items
                current_items = current.get('items', [])
                current_items_str = self._serialize_items_for_comparison(current_items)
                prev_items_str = previous.get('items_str', '')
                
                if current_items_str != prev_items_str:
                    if not prev_items_str and current_items_str:
                        diff_message += "items_adicionados; "
                    elif prev_items_str and not current_items_str:
                        diff_message += "items_removidos; "
                    else:
                        diff_message += "items_alterados; "
                
                # Comparar attachments
                current_attachments = current.get('attachments', [])
                current_attachments_str = self._serialize_attachments_for_comparison(current_attachments)
                prev_attachments_str = previous.get('attachments_str', '')
                
                if current_attachments_str != prev_attachments_str:
                    if not prev_attachments_str and current_attachments_str:
                        diff_message += "attachments_adicionados; "
                    elif prev_attachments_str and not current_attachments_str:
                        diff_message += "attachments_removidos; "
                    else:
                        diff_message += "attachments_alterados; "
            else:
                # Último registro é parcial: considerar como novo snapshot completo
                if current.get('items'):
                    diff_message += "items_adicionados; "
                if current.get('attachments'):
                    diff_message += "attachments_adicionados; "
        
        has_changes = bool(diff_message)
        return (has_changes, diff_message)
    
    def _compare_container_data(self, current: Dict[str, Any], previous: Optional[Dict[str, Any]], is_partial_update: bool) -> Tuple[bool, str]:
        """
        Compara dados atuais de container com anteriores
        Retorna (has_changes, diff_message)
        """
        if not previous:
            return (True, "")  # Container novo
        
        diff_message = ""
        
        # Normalizar coordenadas atuais
        current_x = self._normalize_coordinate(current.get('coord_x'))
        current_z = self._normalize_coordinate(current.get('coord_z'))
        current_y = self._normalize_coordinate(current.get('coord_y'))
        
        # Comparar posição
        if current_x != previous.get('x') or current_z != previous.get('z') or current_y != previous.get('y'):
            prev_x = previous.get('x', '')
            prev_z = previous.get('z', '')
            prev_y = previous.get('y', '')
            diff_message += f"movido(({prev_x},{prev_z},{prev_y})->({current_x},{current_z},{current_y})); "
        
        # Para snapshots completos, comparar items
        if not is_partial_update:
            prev_is_partial = previous.get('is_partial_update', 0)
            
            # Só comparar items se último registro também for completo
            if prev_is_partial == 0:
                current_items = current.get('items', [])
                current_items_str = self._serialize_items_for_comparison(current_items)
                prev_items_str = previous.get('items_str', '')
                
                if current_items_str != prev_items_str:
                    if not prev_items_str and current_items_str:
                        diff_message += "items_adicionados; "
                    elif prev_items_str and not current_items_str:
                        diff_message += "items_removidos; "
                    else:
                        diff_message += "items_alterados; "
            else:
                # Último registro é parcial: considerar como novo snapshot completo
                if current.get('items'):
                    diff_message += "items_adicionados; "
        
        has_changes = bool(diff_message)
        return (has_changes, diff_message)
    
    def _serialize_items_for_comparison(self, items: List[Dict[str, Any]]) -> str:
        """
        Serializa items para comparação (formato: "type:health,type:health")
        Ordena para comparação consistente
        """
        if not items:
            return ""
        
        item_strings = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_type = item.get('type')
            if not item_type or item_type == 'empty':
                continue
            item_health = item.get('health')
            if item_health is not None and item_health != '':
                item_strings.append(f"{item_type}:{item_health}")
            else:
                item_strings.append(item_type)
        
        # Ordenar para comparação consistente
        item_strings.sort()
        return ','.join(item_strings)
    
    def _serialize_attachments_for_comparison(self, attachments: List[Dict[str, Any]]) -> str:
        """
        Serializa attachments para comparação (formato: "type:health,type:health")
        Ordena para comparação consistente
        """
        if not attachments:
            return ""
        
        attachment_strings = []
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            attachment_type = attachment.get('type')
            if not attachment_type or attachment_type == 'empty':
                continue
            attachment_health = attachment.get('health')
            if attachment_health is not None and attachment_health != '':
                attachment_strings.append(f"{attachment_type}:{attachment_health}")
            else:
                attachment_strings.append(attachment_type)
        
        # Ordenar para comparação consistente
        attachment_strings.sort()
        return ','.join(attachment_strings)
    
    def _update_vehicle_timestamp(self, cursor: sqlite3.Cursor, vehicle_id: str, timestamp: datetime, prefer_complete: bool = True) -> Optional[int]:
        """
        Atualiza timestamp do último registro de vehicle
        Retorna VehicleTrackingId se sucesso, None caso contrário
        Similar a UPDATE_VEHICLE_TIMESTAMP do config.sh
        """
        max_retries = 5
        retry_delay = 0.2
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            for attempt in range(1, max_retries + 1):
                try:
                    if prefer_complete:
                        # Preferir registro completo (IsPartialUpdate = 0)
                        if has_is_destroyed:
                            cursor.execute("""
                                SELECT IdVehicleTracking
                                FROM vehicles_tracking
                                WHERE VehicleId = ?
                                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                                ORDER BY 
                                    CASE WHEN IsPartialUpdate = 0 THEN 0 ELSE 1 END,
                                    TimeStamp DESC,
                                    IdVehicleTracking DESC
                                LIMIT 1
                            """, (vehicle_id,))
                        else:
                            cursor.execute("""
                                SELECT IdVehicleTracking
                                FROM vehicles_tracking
                                WHERE VehicleId = ?
                                ORDER BY 
                                    CASE WHEN IsPartialUpdate = 0 THEN 0 ELSE 1 END,
                                    TimeStamp DESC,
                                    IdVehicleTracking DESC
                                LIMIT 1
                            """, (vehicle_id,))
                    else:
                        # Qualquer registro (completo ou parcial)
                        if has_is_destroyed:
                            cursor.execute("""
                                SELECT IdVehicleTracking
                                FROM vehicles_tracking
                                WHERE VehicleId = ?
                                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                                ORDER BY TimeStamp DESC, IdVehicleTracking DESC
                                LIMIT 1
                            """, (vehicle_id,))
                        else:
                            cursor.execute("""
                                SELECT IdVehicleTracking
                                FROM vehicles_tracking
                                WHERE VehicleId = ?
                                ORDER BY TimeStamp DESC, IdVehicleTracking DESC
                                LIMIT 1
                            """, (vehicle_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        tracking_id = result[0]
                        cursor.execute("""
                            UPDATE vehicles_tracking
                            SET TimeStamp = ?
                            WHERE IdVehicleTracking = ?
                        """, (timestamp_str, tracking_id))
                        
                        # Atualizar timestamp dos items e attachments relacionados
                        cursor.execute("""
                            UPDATE vehicles_items
                            SET TimeStamp = ?
                            WHERE VehicleTrackingId = ?
                        """, (timestamp_str, tracking_id))
                        
                        cursor.execute("""
                            UPDATE vehicles_attachments
                            SET TimeStamp = ?
                            WHERE VehicleTrackingId = ?
                        """, (timestamp_str, tracking_id))
                        
                        return tracking_id
                    else:
                        return None
                        
                except sqlite3.OperationalError as e:
                    if "database is locked" in str(e).lower() and attempt < max_retries:
                        time.sleep(retry_delay * attempt)
                        continue
                    raise
                    
        except Exception as e:
            logger.warning(f"Erro ao atualizar timestamp de vehicle {vehicle_id}: {e}")
            return None
    
    def _update_container_timestamp(self, cursor: sqlite3.Cursor, container_id: str, timestamp: datetime, prefer_complete: bool = True) -> Optional[int]:
        """
        Atualiza timestamp do último registro de container
        Retorna ContainerTrackingId se sucesso, None caso contrário
        Similar a UPDATE_CONTAINER_TIMESTAMP do config.sh
        """
        max_retries = 5
        retry_delay = 0.2
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            for attempt in range(1, max_retries + 1):
                try:
                    if prefer_complete:
                        # Preferir registro completo (IsPartialUpdate = 0)
                        if has_is_destroyed:
                            cursor.execute("""
                                SELECT IdContainerTracking
                                FROM containers_tracking
                                WHERE ContainerId = ?
                                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                                ORDER BY 
                                    CASE WHEN IsPartialUpdate = 0 THEN 0 ELSE 1 END,
                                    TimeStamp DESC,
                                    IdContainerTracking DESC
                                LIMIT 1
                            """, (container_id,))
                        else:
                            cursor.execute("""
                                SELECT IdContainerTracking
                                FROM containers_tracking
                                WHERE ContainerId = ?
                                ORDER BY 
                                    CASE WHEN IsPartialUpdate = 0 THEN 0 ELSE 1 END,
                                    TimeStamp DESC,
                                    IdContainerTracking DESC
                                LIMIT 1
                            """, (container_id,))
                    else:
                        # Qualquer registro (completo ou parcial)
                        if has_is_destroyed:
                            cursor.execute("""
                                SELECT IdContainerTracking
                                FROM containers_tracking
                                WHERE ContainerId = ?
                                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                                ORDER BY TimeStamp DESC, IdContainerTracking DESC
                                LIMIT 1
                            """, (container_id,))
                        else:
                            cursor.execute("""
                                SELECT IdContainerTracking
                                FROM containers_tracking
                                WHERE ContainerId = ?
                                ORDER BY TimeStamp DESC, IdContainerTracking DESC
                                LIMIT 1
                            """, (container_id,))
                    
                    result = cursor.fetchone()
                    if result:
                        tracking_id = result[0]
                        cursor.execute("""
                            UPDATE containers_tracking
                            SET TimeStamp = ?
                            WHERE IdContainerTracking = ?
                        """, (timestamp_str, tracking_id))
                        
                        # Atualizar timestamp dos items relacionados
                        cursor.execute("""
                            UPDATE container_items_tracking
                            SET TimeStamp = ?
                            WHERE ContainerTrackingId = ?
                        """, (timestamp_str, tracking_id))
                        
                        return tracking_id
                    else:
                        return None
                        
                except sqlite3.OperationalError as e:
                    if "database is locked" in str(e).lower() and attempt < max_retries:
                        time.sleep(retry_delay * attempt)
                        continue
                    raise
                    
        except Exception as e:
            logger.warning(f"Erro ao atualizar timestamp de container {container_id}: {e}")
            return None
    
    def _validate_player_data(self, player: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um player"""
        # Validar player_id (obrigatório)
        player_id = player.get('player_id')
        if not player_id or not isinstance(player_id, str) or not player_id.strip():
            return False
        
        # Validar coordenadas (obrigatórias, números válidos)
        x = player.get('x')
        z = player.get('z')
        y = player.get('y')
        
        try:
            float(x) if x is not None else None
            float(z) if z is not None else None
            float(y) if y is not None else None
        except (TypeError, ValueError):
            return False
        
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _normalize_player_values(self, player: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normaliza valores de um player para inserção no banco"""
        if not self._validate_player_data(player):
            return None
        
        normalized = {}
        
        # PlayerID (obrigatório, já validado)
        normalized['player_id'] = player['player_id'].strip()
        
        # Coordenadas (obrigatórias, já validadas)
        normalized['coord_x'] = float(player['x'])
        normalized['coord_z'] = float(player['z'])
        normalized['coord_y'] = float(player['y'])
        
        # Valores numéricos opcionais
        def safe_float(value, default=None):
            try:
                if value is None or value == '':
                    return default
                return float(value)
            except (TypeError, ValueError):
                return default
        
        normalized['health'] = safe_float(player.get('health'))
        normalized['blood'] = safe_float(player.get('blood'))
        normalized['shock'] = safe_float(player.get('shock'))
        normalized['energy'] = safe_float(player.get('energy'))
        normalized['water'] = safe_float(player.get('water'))
        normalized['stamina'] = safe_float(player.get('stamina'))
        normalized['stamina_max'] = safe_float(player.get('stamina_max'))
        
        # ItemsCount (inteiro)
        try:
            items_count = player.get('items_count')
            if items_count is None or items_count == '':
                normalized['items_count'] = None
            else:
                normalized['items_count'] = int(items_count)
        except (TypeError, ValueError):
            normalized['items_count'] = None
        
        # Booleanos (converter para 0/1)
        is_alive = player.get('is_alive')
        if is_alive is True or is_alive == 1 or (isinstance(is_alive, str) and is_alive.lower() == 'true'):
            normalized['is_alive'] = 1
        else:
            normalized['is_alive'] = 0
        
        is_admin = player.get('is_admin')
        if is_admin is True or is_admin == 1 or (isinstance(is_admin, str) and is_admin.lower() == 'true'):
            normalized['is_admin'] = 1
        else:
            normalized['is_admin'] = 0
        
        # Arrays JSON (serializar para string)
        items_in_hands = player.get('items_in_hands')
        if items_in_hands:
            try:
                if isinstance(items_in_hands, list):
                    normalized['items_in_hands'] = json.dumps(items_in_hands)
                elif isinstance(items_in_hands, str):
                    # Tentar validar se já é JSON válido
                    json.loads(items_in_hands)
                    normalized['items_in_hands'] = items_in_hands
                else:
                    normalized['items_in_hands'] = None
            except (json.JSONDecodeError, TypeError):
                normalized['items_in_hands'] = None
        else:
            normalized['items_in_hands'] = None
        
        main_items = player.get('main_items')
        if main_items:
            try:
                if isinstance(main_items, list):
                    normalized['main_items'] = json.dumps(main_items)
                elif isinstance(main_items, str):
                    # Tentar validar se já é JSON válido
                    json.loads(main_items)
                    normalized['main_items'] = main_items
                else:
                    normalized['main_items'] = None
            except (json.JSONDecodeError, TypeError):
                normalized['main_items'] = None
        else:
            normalized['main_items'] = None
        
        return normalized
    
    def _generate_unique_timestamps(self, base_timestamp: datetime, count: int) -> List[datetime]:
        """Gera timestamps únicos com incremento de milissegundos"""
        timestamps = []
        for i in range(count):
            # Incremento de 0.001 segundos (1 milissegundo) por registro
            delta = timedelta(milliseconds=i)
            timestamps.append(base_timestamp + delta)
        return timestamps
    
    def _ensure_players_in_database(self, cursor: sqlite3.Cursor, players_data: List[Dict[str, Any]]) -> bool:
        """
        Garante que todos os PlayerIDs existem em players_database
        players_data deve conter pelo menos 'player_id', e opcionalmente 'player_name' e 'steam_id'
        Retorna True se sucesso, False caso contrário
        """
        if not players_data:
            return True  # Nenhum player para processar
        
        # Extrair lista de player_ids únicos e mapear dados opcionais
        player_map = {}
        for player in players_data:
            player_id = player.get('player_id')
            if not player_id or not isinstance(player_id, str) or not player_id.strip():
                continue
            
            player_id = player_id.strip()
            if player_id not in player_map:
                player_map[player_id] = {
                    'player_name': player.get('player_name'),
                    'steam_id': player.get('steam_id')
                }
        
        if not player_map:
            return True  # Nenhum player_id válido
        
        player_ids = list(player_map.keys())
        
        try:
            # Verificar quais PlayerIDs já existem no banco
            placeholders = ','.join(['?'] * len(player_ids))
            cursor.execute(f"""
                SELECT PlayerID 
                FROM players_database 
                WHERE PlayerID IN ({placeholders})
            """, player_ids)
            
            existing_ids = {row[0] for row in cursor.fetchall()}
            
            # Identificar PlayerIDs que precisam ser inseridos
            missing_ids = [pid for pid in player_ids if pid not in existing_ids]
            
            if not missing_ids:
                # Todos já existem
                return True
            
            # Inserir PlayerIDs faltantes usando INSERT OR IGNORE
            insert_values = []
            for player_id in missing_ids:
                player_info = player_map[player_id]
                player_name = player_info.get('player_name')
                steam_id = player_info.get('steam_id')
                
                # Normalizar valores (None se vazio)
                if player_name and isinstance(player_name, str):
                    player_name = player_name.strip() or None
                else:
                    player_name = None
                
                if steam_id and isinstance(steam_id, str):
                    steam_id = steam_id.strip() or None
                else:
                    steam_id = None
                
                insert_values.append((player_id, player_name, steam_id))
            
            if insert_values:
                cursor.executemany(
                    "INSERT OR IGNORE INTO players_database (PlayerID, PlayerName, SteamID) VALUES (?, ?, ?)",
                    insert_values
                )
                inserted_count = cursor.rowcount
                logger.info(f"Inseridos {inserted_count} novos PlayerIDs em players_database (de {len(missing_ids)} faltantes)")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro ao garantir PlayerIDs em players_database: {e}")
            return False
    
    def _insert_players_batch(self, cursor: sqlite3.Cursor, players: List[Dict[str, Any]], 
                             timestamps: List[datetime]) -> Tuple[int, int]:
        """
        Insere players em batch e retorna (inserted_count, last_rowid)
        Retorna (0, 0) em caso de erro
        """
        if not players or not timestamps or len(players) != len(timestamps):
            return (0, 0)
        
        # Construir query SQL com múltiplos VALUES
        sql = """
        INSERT INTO players_coord (
            PlayerID, CoordX, CoordZ, CoordY, Data,
            Health, Blood, Shock, Energy, Water,
            IsAlive, IsAdmin, Stamina, StaminaMax,
            ItemsInHands, ItemsCount, MainItems
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        # Preparar valores para executemany
        values = []
        for player, timestamp in zip(players, timestamps):
            # Formatar timestamp como string SQLite (YYYY-MM-DD HH:MM:SS.mmm)
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]  # Remover últimos 3 dígitos de microsegundos
            
            values.append((
                player['player_id'],
                player['coord_x'],
                player['coord_z'],
                player['coord_y'],
                timestamp_str,
                player['health'],
                player['blood'],
                player['shock'],
                player['energy'],
                player['water'],
                player['is_alive'],
                player['is_admin'],
                player['stamina'],
                player['stamina_max'],
                player['items_in_hands'],
                player['items_count'],
                player['main_items']
            ))
        
        # Executar INSERT em batch
        cursor.executemany(sql, values)
        
        # Obter inserted_count e last_rowid
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def _get_inserted_ids(self, cursor: sqlite3.Cursor, first_rowid: int, last_rowid: int, 
                         player_ids: List[str], inserted_count: int) -> Dict[str, int]:
        """
        Recupera PlayerCoordId dos registros inseridos
        Retorna dict {player_id: player_coord_id}
        """
        player_coord_map = {}
        
        # Método 1: Usar range de PlayerCoordId
        if first_rowid > 0 and last_rowid > 0 and inserted_count > 0:
            try:
                cursor.execute("""
                    SELECT PlayerID, PlayerCoordId 
                    FROM players_coord 
                    WHERE PlayerCoordId >= ? AND PlayerCoordId <= ? 
                    ORDER BY PlayerCoordId ASC
                """, (first_rowid, last_rowid))
                
                results = cursor.fetchall()
                if results and len(results) == inserted_count:
                    # Validar que os PlayerIDs correspondem
                    for player_id, coord_id in results:
                        if player_id in player_ids:
                            player_coord_map[player_id] = coord_id
                    
                    if len(player_coord_map) == inserted_count:
                        return player_coord_map
            except Exception as e:
                logger.warning(f"Método 1 de recuperação de IDs falhou: {e}")
        
        # Método 2: Fallback - buscar por PlayerIDs com janela de tempo (5 segundos)
        if player_ids and not player_coord_map:
            try:
                placeholders = ','.join(['?'] * len(player_ids))
                cursor.execute(f"""
                    SELECT PlayerID, PlayerCoordId 
                    FROM players_coord 
                    WHERE PlayerID IN ({placeholders}) 
                    AND Data >= datetime('now', '-5 seconds') 
                    ORDER BY PlayerCoordId DESC 
                    LIMIT ?
                """, player_ids + [inserted_count])
                
                results = cursor.fetchall()
                for player_id, coord_id in results:
                    if player_id in player_ids:
                        player_coord_map[player_id] = coord_id
                
                if player_coord_map:
                    return player_coord_map
            except Exception as e:
                logger.warning(f"Método 2 de recuperação de IDs falhou: {e}")
        
        # Método 3: Fallback final - buscar últimos N registros sem filtro de tempo
        if player_ids and not player_coord_map:
            try:
                placeholders = ','.join(['?'] * len(player_ids))
                cursor.execute(f"""
                    SELECT PlayerID, PlayerCoordId 
                    FROM players_coord 
                    WHERE PlayerID IN ({placeholders}) 
                    ORDER BY PlayerCoordId DESC 
                    LIMIT ?
                """, player_ids + [inserted_count])
                
                results = cursor.fetchall()
                for player_id, coord_id in results:
                    if player_id in player_ids:
                        player_coord_map[player_id] = coord_id
            except Exception as e:
                logger.warning(f"Método 3 de recuperação de IDs falhou: {e}")
        
        return player_coord_map
    
    # ==================== DISCORD INTEGRATION ====================
    
    def _sanitize_discord_markdown(self, text: str) -> str:
        """
        Escapa caracteres especiais do Discord markdown
        Similar à função sanitize_discord_markdown() do config.sh
        """
        if not text:
            return ""
        # Remover quebras de linha
        text = text.replace('\n', '').replace('\r', '')
        # Escapar caracteres especiais: * _ ~ ` | [ ] ( ) < > " \
        text = re.sub(r'([*_~`|\[\]()<>"\\])', r'\\\1', text)
        return text
    
    def _send_discord_webhook(self, content: str, webhook_url: str) -> bool:
        """
        Envia webhook para Discord
        Retorna True se sucesso (HTTP 200/204), False caso contrário
        """
        # Verificar se Discord está desativado
        if not hasattr(config, 'DISCORD_DESACTIVE') or config.DISCORD_DESACTIVE == '1':
            return False
        
        if not content or not webhook_url:
            return False
        
        # Validar URL do webhook
        if not webhook_url.startswith('https://discord.com/api/webhooks/'):
            logger.warning(f"URL do webhook Discord inválida: {webhook_url[:50]}...")
            return False
        
        try:
            # Preparar payload
            current_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            escaped_message = f"{current_date} - {content}"
            
            # Discord tem limite de 2000 caracteres por mensagem
            if len(escaped_message) > 2000:
                escaped_message = escaped_message[:1997] + "..."
            
            payload = {'content': escaped_message}
            
            if HAS_REQUESTS:
                # Usar requests se disponível
                headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                response = requests.post(
                    webhook_url,
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                http_code = response.status_code
                
                if http_code in (200, 204):
                    return True
                else:
                    # Logar detalhes do erro
                    error_details = ""
                    try:
                        if hasattr(response, 'text') and response.text:
                            error_details = f" - Resposta: {response.text[:200]}"
                    except:
                        pass
                    logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}{error_details}")
                    return False
            else:
                # Fallback para urllib
                if urllib_request is None:
                    logger.warning("Nenhuma biblioteca HTTP disponível para enviar webhook Discord")
                    return False
                
                import urllib.parse
                data = json.dumps(payload).encode('utf-8')
                headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                req = urllib_request.Request(
                    webhook_url,
                    data=data,
                    headers=headers
                )
                try:
                    with urllib_request.urlopen(req, timeout=10) as response:
                        http_code = response.getcode()
                        if http_code in (200, 204):
                            return True
                        else:
                            logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}")
                            return False
                except urllib_request.HTTPError as e:
                    http_code = e.code
                    error_details = ""
                    try:
                        error_body = e.read().decode('utf-8')
                        if error_body:
                            error_details = f" - Resposta: {error_body[:200]}"
                    except:
                        pass
                    logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}{error_details}")
                    return False
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Erro de requisição ao enviar webhook Discord: {e}")
            return False
        except Exception as e:
            logger.error(f"Erro ao enviar webhook Discord: {e}")
            return False
    
    def _insert_player_event(self, player_id: str, event_type: str, 
                            coord_x: Optional[float] = None, coord_y: Optional[float] = None, 
                            coord_z: Optional[float] = None, details: Optional[str] = None, 
                            related_player_id: Optional[str] = None) -> bool:
        """
        Insere evento na tabela players_events
        Retorna True se sucesso, False caso contrário
        """
        if not player_id or not event_type:
            return False
        
        max_retries = 5
        base_retry_delay = 0.2
        
        # Escapar aspas simples em strings
        player_id = player_id.replace("'", "''")
        event_type = event_type.replace("'", "''")
        if details:
            details = details.replace("'", "''")
        if related_player_id:
            related_player_id = related_player_id.replace("'", "''")
        
        # Validar coordenadas (devem ser numéricas ou None)
        coord_x_sql = coord_x if coord_x is not None and isinstance(coord_x, (int, float)) else None
        coord_y_sql = coord_y if coord_y is not None and isinstance(coord_y, (int, float)) else None
        coord_z_sql = coord_z if coord_z is not None and isinstance(coord_z, (int, float)) else None
        
        # Preparar SQL para Details e RelatedPlayerID
        details_sql = f"'{details}'" if details else "NULL"
        related_player_sql = f"'{related_player_id}'" if related_player_id else "NULL"
        
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(config.DB_PLAYERS, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Construir SQL
                sql = f"""
                INSERT INTO players_events (PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID)
                VALUES (
                    '{player_id}',
                    '{event_type}',
                    {coord_x_sql if coord_x_sql is not None else 'NULL'},
                    {coord_y_sql if coord_y_sql is not None else 'NULL'},
                    {coord_z_sql if coord_z_sql is not None else 'NULL'},
                    {details_sql},
                    {related_player_sql}
                )
                """
                
                cursor.execute(sql)
                conn.commit()
                conn.close()
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado ao inserir evento após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite ao inserir evento (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao inserir evento (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        return False
    
    def _update_discord_players_online_message(self) -> bool:
        """
        Atualiza mensagem Discord com lista de jogadores online
        Retorna True se sucesso, False caso contrário
        """
        # Verificar se Discord está desativado ou configurações não disponíveis
        if not hasattr(config, 'DISCORD_DESACTIVE') or config.DISCORD_DESACTIVE == '1':
            return False
        
        if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID:
            return False
        
        if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID:
            return False
        
        if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN:
            return False
        
        try:
            # Buscar lista de jogadores online
            conn = sqlite3.connect(config.DB_PLAYERS, timeout=10.0)
            cursor = conn.cursor()
            
            # Contar jogadores online
            cursor.execute("SELECT COUNT(*) FROM players_online")
            num_registros = cursor.fetchone()[0]
            
            # Buscar jogadores online com dados do players_database
            cursor.execute("""
                SELECT 
                    p.PlayerID,
                    p.PlayerName,
                    p.SteamID,
                    p.SteamName,
                    o.DataConnect
                FROM 
                    players_online o
                INNER JOIN 
                    players_database p
                ON 
                    o.PlayerID = p.PlayerID
                ORDER BY 
                    o.DataConnect ASC
            """)
            
            players_data = cursor.fetchall()
            conn.close()
            
            # Formatar data atual
            current_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            
            # Construir mensagem
            content = f"**({num_registros}/60) Usuários online (atualizado em {current_date})**\n\n"
            
            if num_registros == 0:
                # Apenas atualizar contagem
                pass
            else:
                # Adicionar lista de jogadores
                for player_id, player_name, steam_id, steam_name, data_connect in players_data:
                    # Extrair hora de DataConnect
                    try:
                        if data_connect:
                            # DataConnect está no formato "YYYY-MM-DD HH:MM:SS"
                            hora = data_connect.split(' ')[1] if ' ' in data_connect else ''
                        else:
                            hora = ''
                    except:
                        hora = ''
                    
                    # Formatar link Steam
                    link_steam = "**NaoIdentificado**"
                    if steam_id and steam_name:
                        sanitized_steam_name = self._sanitize_discord_markdown(steam_name)
                        link_steam = f"[{sanitized_steam_name}](<https://steamcommunity.com/profiles/{steam_id}>)"
                    
                    # Formatar nome do jogador
                    sanitized_player_name = self._sanitize_discord_markdown(player_name or "NaoIdentificado")
                    player_info = f"🟢 **{sanitized_player_name}** ({link_steam}) - {hora}"
                    #content += f"{player_info} \n"
            
            # Atualizar mensagem Discord usando PATCH
            channel_id = config.DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID
            message_id = config.DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID
            bot_token = config.DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN
            
            url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}"
            headers = {
                "Authorization": f"Bot {bot_token}",
                "Content-Type": "application/json",
                "User-Agent": "DiscordBot (https://github.com/discord/discord-api-docs, 1.0)"
            }
            payload = {"content": content}
            
            if HAS_REQUESTS:
                response = requests.patch(url, json=payload, headers=headers, timeout=10)
                http_code = response.status_code
                if http_code == 200:
                    return True
                elif "Maximum number of edits" in response.text:
                    # Retry após 5 segundos
                    time.sleep(5)
                    response = requests.patch(url, json=payload, headers=headers, timeout=10)
                    http_code = response.status_code
                    return http_code == 200
                else:
                    logger.warning(f"Falha ao atualizar mensagem Discord: código HTTP {http_code}")
                    return False
            else:
                # Fallback para urllib
                if urllib_request is None:
                    logger.warning("Nenhuma biblioteca HTTP disponível para atualizar mensagem Discord")
                    return False
                
                import urllib.parse
                data = json.dumps(payload).encode('utf-8')
                req = urllib_request.Request(url, data=data, headers=headers, method='PATCH')
                try:
                    with urllib_request.urlopen(req, timeout=10) as response:
                        http_code = response.getcode()
                        if http_code == 200:
                            return True
                        else:
                            logger.warning(f"Falha ao atualizar mensagem Discord: código HTTP {http_code}")
                            return False
                except urllib_request.HTTPError as e:
                    if "Maximum number of edits" in str(e):
                        time.sleep(5)
                        try:
                            with urllib_request.urlopen(req, timeout=10) as response:
                                return response.getcode() == 200
                        except:
                            return False
                    return False
                    
        except Exception as e:
            logger.error(f"Erro ao atualizar mensagem Discord: {e}")
            return False
    
    def _update_players_online(self, current_player_ids: List[str], timestamp: datetime) -> bool:
        """
        Atualiza tabela players_online baseado em jogadores conectados/desconectados
        Compara lista atual com lista anterior e executa INSERT/DELETE conforme necessário
        """
        if not current_player_ids:
            return True  # Nenhum player para processar
        
        current_set = set(current_player_ids)
        connect_players = current_set - self.previous_players
        disconnect_players = self.previous_players - current_set
        
        if not connect_players and not disconnect_players:
            return True  # Nenhuma mudança
        
        max_retries = 5
        base_retry_delay = 0.5
        
        # Formatar timestamp para SQLite
        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
        
        conn = None
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(config.DB_PLAYERS, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Iniciar transação
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                # Buscar dados dos jogadores para Discord ANTES de modificar players_online
                connect_players_data = {}
                disconnect_players_data = {}
                
                if connect_players or disconnect_players:
                    # Buscar dados de players_database para conectados
                    if connect_players:
                        placeholders = ','.join(['?'] * len(connect_players))
                        cursor.execute(f"""
                            SELECT PlayerID, PlayerName, SteamID, SteamName
                            FROM players_database
                            WHERE PlayerID IN ({placeholders})
                        """, list(connect_players))
                        for row in cursor.fetchall():
                            connect_players_data[row[0]] = {
                                'player_name': row[1],
                                'steam_id': row[2],
                                'steam_name': row[3]
                            }
                    
                    # Buscar dados de players_database e players_online para desconectados
                    # IMPORTANTE: Fazer isso ANTES de deletar de players_online
                    if disconnect_players:
                        placeholders = ','.join(['?'] * len(disconnect_players))
                        cursor.execute(f"""
                            SELECT 
                                p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                                o.Country, o.City, o.Lon, o.IP, o.Port, o.Ping
                            FROM players_database p
                            LEFT JOIN players_online o ON p.PlayerID = o.PlayerID
                            WHERE p.PlayerID IN ({placeholders})
                        """, list(disconnect_players))
                        for row in cursor.fetchall():
                            disconnect_players_data[row[0]] = {
                                'player_name': row[1],
                                'steam_id': row[2],
                                'steam_name': row[3],
                                'country': row[4],
                                'city': row[5],
                                'lon': row[6],
                                'ip': row[7],
                                'port': row[8],
                                'ping': row[9]
                            }
                
                # Processar conectados (INSERT OR REPLACE)
                if connect_players:
                    connect_values = [(player_id, timestamp_str) for player_id in connect_players]
                    cursor.executemany(
                        "INSERT OR REPLACE INTO players_online (PlayerID, DataConnect) VALUES (?, ?)",
                        connect_values
                    )
                    logger.info(f"Atualizados {len(connect_players)} jogadores como conectados: {list(connect_players)[:5]}{'...' if len(connect_players) > 5 else ''}")
                
                # Processar desconectados (DELETE)
                if disconnect_players:
                    disconnect_values = [(player_id,) for player_id in disconnect_players]
                    cursor.executemany(
                        "DELETE FROM players_online WHERE PlayerID = ?",
                        disconnect_values
                    )
                    logger.info(f"Removidos {len(disconnect_players)} jogadores como desconectados: {list(disconnect_players)[:5]}{'...' if len(disconnect_players) > 5 else ''}")
                
                # Commit transação
                conn.commit()
                
                # Processar Discord e eventos (não bloquear se falhar)
                try:
                    if connect_players or disconnect_players:
                        
                        # Processar conectados
                        for player_id in connect_players:
                            try:
                                player_data = connect_players_data.get(player_id, {})
                                player_name = player_data.get('player_name', 'NaoIdentificado')
                                steam_id = player_data.get('steam_id', '')
                                steam_name = player_data.get('steam_name', '')
                                
                                # Enviar webhook Discord
                                if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                                    if steam_id and steam_name:
                                        sanitized_steam_name = self._sanitize_discord_markdown(steam_name)
                                        #content = f"Jogador **{self._sanitize_discord_markdown(player_name)}** ([{sanitized_steam_name}](<https://steamcommunity.com/profiles/{steam_id}>)) conectou"
                                        content = ""
                                    else:
                                        #content = f"Jogador **{self._sanitize_discord_markdown(player_name)}** conectou"
                                        content = ""
                                    self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
                                
                                # Inserir evento
                                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                details_json = json.dumps({
                                    'timestamp': current_date
                                })
                                self._insert_player_event(player_id, 'player_connected', details=details_json)
                            except Exception as e:
                                logger.warning(f"Erro ao processar Discord para jogador conectado {player_id}: {e}")
                        
                        # Processar desconectados
                        for player_id in disconnect_players:
                            try:
                                player_data = disconnect_players_data.get(player_id, {})
                                player_name = player_data.get('player_name', 'NaoIdentificado')
                                steam_id = player_data.get('steam_id', '')
                                steam_name = player_data.get('steam_name', '')
                                
                                # Enviar webhook Discord
                                if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                                    if steam_id and steam_name:
                                        sanitized_steam_name = self._sanitize_discord_markdown(steam_name)
                                        #content = f"Jogador **{self._sanitize_discord_markdown(player_name)}** ([{sanitized_steam_name}](<https://steamcommunity.com/profiles/{steam_id}>)) desconectou"
                                        content = ""
                                    else:
                                        #content = f"Jogador **{self._sanitize_discord_markdown(player_name)}** desconectou"
                                        content = ""
                                    self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
                                
                                # Inserir evento com detalhes geográficos
                                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                details_dict = {
                                    'timestamp': current_date,
                                    'Country': player_data.get('country') or None,
                                    'City': player_data.get('city') or None,
                                    'Lon': float(player_data.get('lon')) if player_data.get('lon') else None,
                                    'IP': player_data.get('ip') or None,
                                    'Port': int(player_data.get('port')) if player_data.get('port') else None,
                                    'Ping': int(player_data.get('ping')) if player_data.get('ping') else None
                                }
                                # Remover None values
                                details_dict = {k: v for k, v in details_dict.items() if v is not None}
                                details_json = json.dumps(details_dict)
                                self._insert_player_event(player_id, 'player_disconnected', details=details_json)
                            except Exception as e:
                                logger.warning(f"Erro ao processar Discord para jogador desconectado {player_id}: {e}")
                        
                        # Atualizar mensagem Discord com lista de jogadores online
                        self._update_discord_players_online_message()
                        
                except Exception as e:
                    logger.warning(f"Erro ao processar Discord (não crítico): {e}")
                
                conn.close()
                
                # Atualizar estado apenas após sucesso
                self.previous_players = current_set
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco players_online bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco players_online bloqueado após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional ao atualizar players_online (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite ao atualizar players_online (tentativa {attempt}/{max_retries}): {e}")
                # Integrity errors geralmente não são recuperáveis
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao atualizar players_online (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao atualizar players_online após {max_retries} tentativas")
        return False
    
    def process_players_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """
        Processa dados de jogadores e insere no banco SQLite
        Implementa lógica completa baseada em INSERT_PLAYERS_POSITIONS_BATCH do config.sh
        """
        max_retries = 5
        base_retry_delay = 0.5
        
        # Validar entrada
        players = data.get('players', [])
        if not players or not isinstance(players, list):
            logger.warning("Dados de players inválidos ou vazios")
            return False
        
        logger.info(f"Processando {len(players)} players do RabbitMQ")
        
        # Extrair timestamp base
        captured_timestamp = data.get('captured_timestamp')
        if captured_timestamp:
            try:
                # Tentar parsear timestamp no formato "YYYY-MM-DD HH:MM:SS"
                if isinstance(captured_timestamp, str):
                    base_timestamp = datetime.strptime(captured_timestamp, '%Y-%m-%d %H:%M:%S')
                else:
                    base_timestamp = datetime.now()
            except (ValueError, TypeError):
                base_timestamp = datetime.now()
        else:
            base_timestamp = datetime.now()
        
        # Normalizar e validar players
        normalized_players = []
        player_ids = []
        original_players_data = []  # Manter dados originais para garantir PlayerIDs em players_database
        for player in players:
            normalized = self._normalize_player_values(player)
            if normalized:
                normalized_players.append(normalized)
                player_ids.append(normalized['player_id'])
                # Manter dados originais com player_id, player_name e steam_id se disponíveis
                original_players_data.append({
                    'player_id': normalized['player_id'],
                    'player_name': player.get('player_name'),
                    'steam_id': player.get('steam_id')
                })
        
        if not normalized_players:
            logger.warning("Nenhum player válido após normalização")
            return False
        
        logger.info(f"Após normalização: {len(normalized_players)} players válidos de {len(players)} recebidos")
        
        # Gerar timestamps únicos
        timestamps = self._generate_unique_timestamps(base_timestamp, len(normalized_players))
        
        # Retry logic
        conn = None
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Iniciar transação
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                # Garantir que todos os PlayerIDs existem em players_database antes de inserir em players_coord
                if not self._ensure_players_in_database(cursor, original_players_data):
                    conn.rollback()
                    conn.close()
                    logger.error(f"Falha ao garantir PlayerIDs em players_database (tentativa {attempt}/{max_retries})")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Inserir players em batch
                inserted_count, last_rowid = self._insert_players_batch(
                    cursor, normalized_players, timestamps
                )
                
                if inserted_count <= 0:
                    conn.rollback()
                    conn.close()
                    logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{max_retries})")
                    if attempt < max_retries:
                        # Backoff exponencial
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Commit transação
                conn.commit()
                
                # Recuperar IDs inseridos
                first_rowid = last_rowid - inserted_count + 1 if last_rowid > 0 and inserted_count > 0 else 0
                player_coord_map = self._get_inserted_ids(
                    cursor, first_rowid, last_rowid, player_ids, inserted_count
                )
                
                conn.close()
                
                # Log sucesso
                logger.info(f"Inseridos {inserted_count} players no banco (IDs recuperados: {len(player_coord_map)})")
                
                # Atualizar tabela players_online (conectados/desconectados)
                # Não bloquear o processamento principal se falhar
                try:
                    self._update_players_online(player_ids, base_timestamp)
                except Exception as e:
                    logger.warning(f"Erro ao atualizar players_online (não crítico): {e}")
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        # Backoff exponencial para lock
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{max_retries}): {e}")
                # Integrity errors geralmente não são recuperáveis
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de jogadores (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir players após {max_retries} tentativas")
        return False
    
    # ==================== STRUCTURES ====================
    
    def _validate_fence_data(self, fence: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um fence"""
        fence_id = fence.get('fence_id')
        if not fence_id or not isinstance(fence_id, str) or not fence_id.strip():
            return False
        
        # Coordenadas obrigatórias
        position = fence.get('position', {})
        if isinstance(position, dict):
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            x = fence.get('x')
            z = fence.get('z')
            y = fence.get('y')
        
        try:
            float(x) if x is not None else None
            float(z) if z is not None else None
            float(y) if y is not None else None
        except (TypeError, ValueError):
            return False
        
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _validate_watchtower_data(self, watchtower: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um watchtower"""
        watchtower_id = watchtower.get('watchtower_id')
        if not watchtower_id or not isinstance(watchtower_id, str) or not watchtower_id.strip():
            return False
        
        # Coordenadas obrigatórias
        position = watchtower.get('position', {})
        if isinstance(position, dict):
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            x = watchtower.get('x')
            z = watchtower.get('z')
            y = watchtower.get('y')
        
        try:
            float(x) if x is not None else None
            float(z) if z is not None else None
            float(y) if y is not None else None
        except (TypeError, ValueError):
            return False
        
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _validate_flag_data(self, flag: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um flag"""
        flag_id = flag.get('flag_id')
        if not flag_id or not isinstance(flag_id, str) or not flag_id.strip():
            return False
        
        # Coordenadas obrigatórias
        position = flag.get('position', {})
        if isinstance(position, dict):
            x = position.get('x')
            z = position.get('z')
            y = position.get('y')
        else:
            x = flag.get('x')
            z = flag.get('z')
            y = flag.get('y')
        
        try:
            float(x) if x is not None else None
            float(z) if z is not None else None
            float(y) if y is not None else None
        except (TypeError, ValueError):
            return False
        
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _normalize_structure_values(self, structure: Dict[str, Any], structure_type: str) -> Optional[Dict[str, Any]]:
        """Normaliza valores de uma estrutura para inserção no banco"""
        normalized = {}
        
        if structure_type == 'fence':
            if not self._validate_fence_data(structure):
                return None
            
            normalized['fence_id'] = structure['fence_id'].strip()
            normalized['fence_name'] = structure.get('fence_name', '').strip() or ''
            
            position = structure.get('position', {})
            if isinstance(position, dict):
                normalized['coord_x'] = float(position.get('x'))
                normalized['coord_z'] = float(position.get('z'))
                normalized['coord_y'] = float(position.get('y'))
            else:
                normalized['coord_x'] = float(structure.get('x'))
                normalized['coord_z'] = float(structure.get('z'))
                normalized['coord_y'] = float(structure.get('y'))
            
            def safe_int(value, default=None):
                try:
                    if value is None or value == '':
                        return default
                    return int(value) if value else default
                except (TypeError, ValueError):
                    return default
            
            normalized['has_base'] = safe_int(structure.get('has_base'))
            normalized['lower_panel_built'] = safe_int(structure.get('lower_panel_built'))
            normalized['upper_panel_built'] = safe_int(structure.get('upper_panel_built'))
            
        elif structure_type == 'watchtower':
            if not self._validate_watchtower_data(structure):
                return None
            
            normalized['watchtower_id'] = structure['watchtower_id'].strip()
            normalized['watchtower_name'] = structure.get('watchtower_name', '').strip() or ''
            
            position = structure.get('position', {})
            if isinstance(position, dict):
                normalized['coord_x'] = float(position.get('x'))
                normalized['coord_z'] = float(position.get('z'))
                normalized['coord_y'] = float(position.get('y'))
            else:
                normalized['coord_x'] = float(structure.get('x'))
                normalized['coord_z'] = float(structure.get('z'))
                normalized['coord_y'] = float(structure.get('y'))
            
            orientation = structure.get('orientation', {})
            if isinstance(orientation, dict):
                normalized['orientation_x'] = float(orientation.get('x')) if orientation.get('x') is not None else None
                normalized['orientation_y'] = float(orientation.get('y')) if orientation.get('y') is not None else None
                normalized['orientation_z'] = float(orientation.get('z')) if orientation.get('z') is not None else None
            else:
                normalized['orientation_x'] = float(structure.get('orientation_x')) if structure.get('orientation_x') is not None else None
                normalized['orientation_y'] = float(structure.get('orientation_y')) if structure.get('orientation_y') is not None else None
                normalized['orientation_z'] = float(structure.get('orientation_z')) if structure.get('orientation_z') is not None else None
            
            def safe_int(value, default=None):
                try:
                    if value is None or value == '':
                        return default
                    return int(value) if value else default
                except (TypeError, ValueError):
                    return default
            
            normalized['has_base'] = safe_int(structure.get('has_base'))
            normalized['level1_base_built'] = safe_int(structure.get('level1_base_built'))
            normalized['level2_base_built'] = safe_int(structure.get('level2_base_built'))
            normalized['level3_base_built'] = safe_int(structure.get('level3_base_built'))
            normalized['level1_stairs_built'] = safe_int(structure.get('level1_stairs_built'))
            normalized['level2_stairs_built'] = safe_int(structure.get('level2_stairs_built'))
            normalized['has_roof'] = safe_int(structure.get('has_roof'))
            
            # Walls
            normalized['level1_wall1_lower_built'] = safe_int(structure.get('level1_wall1_lower_built'))
            normalized['level1_wall1_upper_built'] = safe_int(structure.get('level1_wall1_upper_built'))
            normalized['level1_wall2_lower_built'] = safe_int(structure.get('level1_wall2_lower_built'))
            normalized['level1_wall2_upper_built'] = safe_int(structure.get('level1_wall2_upper_built'))
            normalized['level1_wall3_lower_built'] = safe_int(structure.get('level1_wall3_lower_built'))
            normalized['level1_wall3_upper_built'] = safe_int(structure.get('level1_wall3_upper_built'))
            normalized['level2_wall1_lower_built'] = safe_int(structure.get('level2_wall1_lower_built'))
            normalized['level2_wall1_upper_built'] = safe_int(structure.get('level2_wall1_upper_built'))
            normalized['level2_wall2_lower_built'] = safe_int(structure.get('level2_wall2_lower_built'))
            normalized['level2_wall2_upper_built'] = safe_int(structure.get('level2_wall2_upper_built'))
            normalized['level2_wall3_lower_built'] = safe_int(structure.get('level2_wall3_lower_built'))
            normalized['level2_wall3_upper_built'] = safe_int(structure.get('level2_wall3_upper_built'))
            normalized['level3_wall1_lower_built'] = safe_int(structure.get('level3_wall1_lower_built'))
            normalized['level3_wall1_upper_built'] = safe_int(structure.get('level3_wall1_upper_built'))
            normalized['level3_wall2_lower_built'] = safe_int(structure.get('level3_wall2_lower_built'))
            normalized['level3_wall2_upper_built'] = safe_int(structure.get('level3_wall2_upper_built'))
            normalized['level3_wall3_lower_built'] = safe_int(structure.get('level3_wall3_lower_built'))
            normalized['level3_wall3_upper_built'] = safe_int(structure.get('level3_wall3_upper_built'))
            
        elif structure_type == 'flag':
            if not self._validate_flag_data(structure):
                return None
            
            normalized['flag_id'] = structure['flag_id'].strip()
            normalized['flag_name'] = structure.get('flag_name', '').strip() or ''
            
            position = structure.get('position', {})
            if isinstance(position, dict):
                normalized['coord_x'] = float(position.get('x'))
                normalized['coord_z'] = float(position.get('z'))
                normalized['coord_y'] = float(position.get('y'))
            else:
                normalized['coord_x'] = float(structure.get('x'))
                normalized['coord_z'] = float(structure.get('z'))
                normalized['coord_y'] = float(structure.get('y'))
            
            orientation = structure.get('orientation', {})
            if isinstance(orientation, dict):
                normalized['orientation_x'] = float(orientation.get('x')) if orientation.get('x') is not None else None
                normalized['orientation_y'] = float(orientation.get('y')) if orientation.get('y') is not None else None
                normalized['orientation_z'] = float(orientation.get('z')) if orientation.get('z') is not None else None
            else:
                normalized['orientation_x'] = float(structure.get('orientation_x')) if structure.get('orientation_x') is not None else None
                normalized['orientation_y'] = float(structure.get('orientation_y')) if structure.get('orientation_y') is not None else None
                normalized['orientation_z'] = float(structure.get('orientation_z')) if structure.get('orientation_z') is not None else None
            
            def safe_int(value, default=None):
                try:
                    if value is None or value == '':
                        return default
                    return int(value) if value else default
                except (TypeError, ValueError):
                    return default
            
            def safe_float(value, default=None):
                try:
                    if value is None or value == '':
                        return default
                    return float(value) if value else default
                except (TypeError, ValueError):
                    return default
            
            normalized['has_base'] = safe_int(structure.get('has_base'))
            normalized['has_flag_base'] = safe_int(structure.get('has_flag_base'))
            normalized['flag_raised'] = safe_int(structure.get('flag_raised'))
            normalized['flag_height'] = safe_float(structure.get('flag_height'))
        else:
            return None
        
        return normalized
    
    def _insert_fences_batch(self, cursor: sqlite3.Cursor, fences: List[Dict[str, Any]], 
                             timestamps: List[datetime]) -> Tuple[int, int]:
        """Insere fences em batch e retorna (inserted_count, last_rowid)"""
        if not fences or not timestamps or len(fences) != len(timestamps):
            return (0, 0)
        
        sql = """
        INSERT INTO fences_tracking (
            FenceId, FenceName, PositionX, PositionZ, PositionY, TimeStamp,
            HasBase, LowerPanelBuilt, UpperPanelBuilt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        values = []
        for fence, timestamp in zip(fences, timestamps):
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            values.append((
                fence['fence_id'],
                fence['fence_name'],
                fence['coord_x'],
                fence['coord_z'],
                fence['coord_y'],
                timestamp_str,
                fence['has_base'],
                fence['lower_panel_built'],
                fence['upper_panel_built']
            ))
        
        cursor.executemany(sql, values)
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def _insert_watchtowers_batch(self, cursor: sqlite3.Cursor, watchtowers: List[Dict[str, Any]], 
                                  timestamps: List[datetime]) -> Tuple[int, int]:
        """Insere watchtowers em batch e retorna (inserted_count, last_rowid)"""
        if not watchtowers or not timestamps or len(watchtowers) != len(timestamps):
            return (0, 0)
        
        sql = """
        INSERT INTO watchtowers_tracking (
            WatchtowerId, WatchtowerName, PositionX, PositionZ, PositionY,
            OrientationX, OrientationY, OrientationZ, TimeStamp,
            HasBase, Level1BaseBuilt, Level2BaseBuilt, Level3BaseBuilt,
            Level1StairsBuilt, Level2StairsBuilt, HasRoof,
            Level1Wall1LowerBuilt, Level1Wall1UpperBuilt,
            Level1Wall2LowerBuilt, Level1Wall2UpperBuilt,
            Level1Wall3LowerBuilt, Level1Wall3UpperBuilt,
            Level2Wall1LowerBuilt, Level2Wall1UpperBuilt,
            Level2Wall2LowerBuilt, Level2Wall2UpperBuilt,
            Level2Wall3LowerBuilt, Level2Wall3UpperBuilt,
            Level3Wall1LowerBuilt, Level3Wall1UpperBuilt,
            Level3Wall2LowerBuilt, Level3Wall2UpperBuilt,
            Level3Wall3LowerBuilt, Level3Wall3UpperBuilt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        values = []
        for watchtower, timestamp in zip(watchtowers, timestamps):
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            values.append((
                watchtower['watchtower_id'],
                watchtower['watchtower_name'],
                watchtower['coord_x'],
                watchtower['coord_z'],
                watchtower['coord_y'],
                watchtower['orientation_x'],
                watchtower['orientation_y'],
                watchtower['orientation_z'],
                timestamp_str,
                watchtower['has_base'],
                watchtower['level1_base_built'],
                watchtower['level2_base_built'],
                watchtower['level3_base_built'],
                watchtower['level1_stairs_built'],
                watchtower['level2_stairs_built'],
                watchtower['has_roof'],
                watchtower['level1_wall1_lower_built'],
                watchtower['level1_wall1_upper_built'],
                watchtower['level1_wall2_lower_built'],
                watchtower['level1_wall2_upper_built'],
                watchtower['level1_wall3_lower_built'],
                watchtower['level1_wall3_upper_built'],
                watchtower['level2_wall1_lower_built'],
                watchtower['level2_wall1_upper_built'],
                watchtower['level2_wall2_lower_built'],
                watchtower['level2_wall2_upper_built'],
                watchtower['level2_wall3_lower_built'],
                watchtower['level2_wall3_upper_built'],
                watchtower['level3_wall1_lower_built'],
                watchtower['level3_wall1_upper_built'],
                watchtower['level3_wall2_lower_built'],
                watchtower['level3_wall2_upper_built'],
                watchtower['level3_wall3_lower_built'],
                watchtower['level3_wall3_upper_built']
            ))
        
        cursor.executemany(sql, values)
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def _insert_flags_batch(self, cursor: sqlite3.Cursor, flags: List[Dict[str, Any]], 
                            timestamps: List[datetime]) -> Tuple[int, int]:
        """Insere flags em batch e retorna (inserted_count, last_rowid)"""
        if not flags or not timestamps or len(flags) != len(timestamps):
            return (0, 0)
        
        sql = """
        INSERT INTO flags_tracking (
            FlagId, FlagName, PositionX, PositionZ, PositionY,
            OrientationX, OrientationY, OrientationZ, TimeStamp,
            HasBase, HasFlagBase, FlagRaised, FlagHeight
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        values = []
        for flag, timestamp in zip(flags, timestamps):
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            values.append((
                flag['flag_id'],
                flag['flag_name'],
                flag['coord_x'],
                flag['coord_z'],
                flag['coord_y'],
                flag['orientation_x'],
                flag['orientation_y'],
                flag['orientation_z'],
                timestamp_str,
                flag['has_base'],
                flag['has_flag_base'],
                flag['flag_raised'],
                flag['flag_height']
            ))
        
        cursor.executemany(sql, values)
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def process_structures_data(self, db_path: str, data: Dict[str, Any]) -> bool:
        """
        Processa dados de estruturas e insere no banco SQLite
        Suporta fences, watchtowers e flags
        """
        max_retries = 5
        base_retry_delay = 0.5
        
        # Extrair timestamp base
        captured_timestamp = data.get('captured_timestamp')
        if captured_timestamp:
            try:
                if isinstance(captured_timestamp, str):
                    base_timestamp = datetime.strptime(captured_timestamp, '%Y-%m-%d %H:%M:%S')
                else:
                    base_timestamp = datetime.now()
            except (ValueError, TypeError):
                base_timestamp = datetime.now()
        else:
            base_timestamp = datetime.now()
        
        # Extrair estruturas por tipo
        fences = data.get('fence_data', [])
        watchtowers = data.get('watchtower_data', [])
        flags = data.get('flag_data', [])
        
        if not fences and not watchtowers and not flags:
            logger.warning("Dados de structures inválidos ou vazios")
            return False
        
        logger.info(f"Processando structures: {len(fences)} fences, {len(watchtowers)} watchtowers, {len(flags)} flags")
        
        # Normalizar estruturas
        normalized_fences = []
        normalized_watchtowers = []
        normalized_flags = []
        
        for fence in fences:
            normalized = self._normalize_structure_values(fence, 'fence')
            if normalized:
                normalized_fences.append(normalized)
        
        for watchtower in watchtowers:
            normalized = self._normalize_structure_values(watchtower, 'watchtower')
            if normalized:
                normalized_watchtowers.append(normalized)
        
        for flag in flags:
            normalized = self._normalize_structure_values(flag, 'flag')
            if normalized:
                normalized_flags.append(normalized)
        
        if not normalized_fences and not normalized_watchtowers and not normalized_flags:
            logger.warning("Nenhuma estrutura válida após normalização")
            return False
        
        # Retry logic
        conn = None
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                self._configure_sqlite_pragmas(cursor)
                
                # Iniciar transação
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                total_inserted = 0
                
                # Inserir fences
                if normalized_fences:
                    timestamps = self._generate_unique_timestamps(base_timestamp, len(normalized_fences))
                    inserted_count, _ = self._insert_fences_batch(cursor, normalized_fences, timestamps)
                    total_inserted += inserted_count
                    logger.info(f"Inseridos {inserted_count} fences")
                
                # Inserir watchtowers
                if normalized_watchtowers:
                    # Ajustar timestamp base para não conflitar com fences
                    watchtower_base = base_timestamp + timedelta(milliseconds=len(normalized_fences))
                    timestamps = self._generate_unique_timestamps(watchtower_base, len(normalized_watchtowers))
                    inserted_count, _ = self._insert_watchtowers_batch(cursor, normalized_watchtowers, timestamps)
                    total_inserted += inserted_count
                    logger.info(f"Inseridos {inserted_count} watchtowers")
                
                # Inserir flags
                if normalized_flags:
                    # Ajustar timestamp base para não conflitar
                    flag_base = base_timestamp + timedelta(milliseconds=len(normalized_fences) + len(normalized_watchtowers))
                    timestamps = self._generate_unique_timestamps(flag_base, len(normalized_flags))
                    inserted_count, _ = self._insert_flags_batch(cursor, normalized_flags, timestamps)
                    total_inserted += inserted_count
                    logger.info(f"Inseridos {inserted_count} flags")
                
                if total_inserted <= 0:
                    conn.rollback()
                    conn.close()
                    logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{max_retries})")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Commit transação
                conn.commit()
                conn.close()
                
                logger.info(f"Inseridas {total_inserted} structures no banco")
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de structures (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir structures após {max_retries} tentativas")
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
                        # Se item_data é uma string JSON, fazer parse
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError) as e:
                                logger.warning(f"Item_data é string mas não é JSON válido: {e}. Primeiros 100 chars: {item_data[:100]}")
                                continue
                        
                        # Verificar se é um dicionário válido
                        if not isinstance(item_data, dict):
                            logger.warning(f"Item_data não é um dicionário após parse: {type(item_data)}. Valor: {str(item_data)[:200]}")
                            continue
                        
                        logger.debug(f"Processando item_data com chaves: {list(item_data.keys())}")
                        
                        # Extrair players de cada mensagem
                        if 'players' in item_data:
                            players_list = item_data['players']
                            if isinstance(players_list, list):
                                all_players.extend(players_list)
                            else:
                                logger.warning(f"Campo 'players' não é uma lista: {type(players_list)}")
                        elif isinstance(item_data, list):
                            # Se item_data é uma lista de players diretamente
                            all_players.extend(item_data)
                        
                        # Usar o primeiro captured_timestamp encontrado
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
                        logger.warning(f"Nenhum player encontrado no batch de {queue_name}")
                        fail_count += len(items)
                
                elif queue_name == 'data.vehicles.positions':
                    # Para vehicles, combinar todos os vehicles de todas as mensagens
                    all_vehicles = []
                    captured_timestamp = None
                    update_type = 'full'
                    
                    for item_idx, item_data in enumerate(items):
                        if isinstance(item_data, str):
                            try:
                                item_data = json.loads(item_data)
                            except (json.JSONDecodeError, TypeError) as e:
                                logger.warning(f"Item_data é string mas não é JSON válido: {e}")
                                continue
                        
                        if not isinstance(item_data, dict):
                            logger.warning(f"Item_data não é um dicionário: {type(item_data)}")
                            continue
                        
                        # Log primeiro item para debug (INFO para garantir que apareça)
                        if item_idx == 0:
                            logger.info(f"Primeiro item_data de vehicles: chaves={list(item_data.keys())}")
                        
                        if 'vehicles' in item_data:
                            vehicles_list = item_data['vehicles']
                            if isinstance(vehicles_list, list):
                                all_vehicles.extend(vehicles_list)
                                if item_idx == 0 and vehicles_list:
                                    first_vehicle = vehicles_list[0]
                                    if isinstance(first_vehicle, dict):
                                        logger.info(f"Primeiro vehicle da lista: chaves={list(first_vehicle.keys())}")
                                        logger.info(f"Primeiro vehicle: vehicle_id={first_vehicle.get('vehicle_id')}, position={first_vehicle.get('position')}")
                            else:
                                logger.warning(f"Campo 'vehicles' não é uma lista: {type(vehicles_list)}")
                        elif isinstance(item_data, list):
                            all_vehicles.extend(item_data)
                            if item_idx == 0 and item_data:
                                first_item = item_data[0]
                                if isinstance(first_item, dict):
                                    logger.info(f"Item_data é lista direta, primeiro item: chaves={list(first_item.keys())}")
                        else:
                            # Se não tem 'vehicles' e não é lista, pode ser que o item_data seja o próprio vehicle
                            logger.warning(f"Item_data não tem 'vehicles' e não é lista. Tipo: {type(item_data)}, chaves: {list(item_data.keys()) if isinstance(item_data, dict) else 'N/A'}")
                        
                        if not captured_timestamp and 'captured_timestamp' in item_data:
                            captured_timestamp = item_data['captured_timestamp']
                        
                        if 'update_type' in item_data:
                            update_type = item_data['update_type']
                    
                    logger.info(f"Total de vehicles coletados: {len(all_vehicles)}")
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
                        logger.warning(f"Nenhum vehicle encontrado no batch de {queue_name}")
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
                            except (json.JSONDecodeError, TypeError) as e:
                                logger.warning(f"Item_data é string mas não é JSON válido: {e}")
                                continue
                        
                        if not isinstance(item_data, dict):
                            logger.warning(f"Item_data não é um dicionário: {type(item_data)}")
                            continue
                        
                        # Suportar tanto 'containers' quanto 'container_data'
                        containers_list = item_data.get('containers') or item_data.get('container_data', [])
                        if isinstance(containers_list, list):
                            all_containers.extend(containers_list)
                        else:
                            logger.warning(f"Campo 'containers'/'container_data' não é uma lista: {type(containers_list)}")
                        
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
                        logger.warning(f"Nenhum container encontrado no batch de {queue_name}")
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
                            except (json.JSONDecodeError, TypeError) as e:
                                logger.warning(f"Item_data é string mas não é JSON válido: {e}")
                                continue
                        
                        if not isinstance(item_data, dict):
                            logger.warning(f"Item_data não é um dicionário: {type(item_data)}")
                            continue
                        
                        # Extrair por tipo
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
                        logger.warning(f"Nenhuma estrutura encontrada no batch de {queue_name}")
                        fail_count += len(items)
                
                else:
                    # Para outros tipos, manter comportamento original
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


def main():
    """Função principal"""
    if not config.RABBITMQ_ENABLED:
        logger.warning("RabbitMQ está desabilitado no config.py")
        return
    
    consumer = PositionsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()

