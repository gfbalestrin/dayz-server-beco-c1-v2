"""
Processador de dados de containers
"""

import sqlite3
import math
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional

from ..database.sqlite_utils import configure_sqlite_pragmas, generate_unique_timestamps
from ..database.queries import Queries
from ..utils.validation import validate_coordinates, validate_id
from ..utils.normalization import normalize_coordinate
from ..utils.comparison import serialize_items_for_comparison, compare_container_data

logger = logging.getLogger(__name__)


class ContainersProcessor:
    """
    Processador de dados de containers
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.queries = Queries(db_path)
        self.max_retries = 5
        self.base_retry_delay = 0.5
    
    def _validate_container_data(self, container: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um container"""
        # Validar container_id (obrigatório)
        container_id = container.get('container_id')
        if not validate_id(container_id, 'container_id'):
            logger.warning(f"Container validação falhou: container_id inválido (value={container_id}, type={type(container_id)})")
            return False
        
        # Validar coordenadas
        x, z, y = validate_coordinates(container)
        if x is None or z is None or y is None:
            logger.warning(f"Container {container_id}: validação falhou - coordenadas inválidas")
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
        x, z, y = validate_coordinates(container)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        # Validar novamente após conversão (proteção extra)
        if (math.isnan(normalized['coord_x']) or math.isinf(normalized['coord_x']) or
            math.isnan(normalized['coord_z']) or math.isinf(normalized['coord_z']) or
            math.isnan(normalized['coord_y']) or math.isinf(normalized['coord_y'])):
            return None
        
        # Items (para processamento posterior)
        normalized['items'] = container.get('items', [])
        
        return normalized
    
    def process(self, data: Dict[str, Any]) -> bool:
        """
        Processa dados de containers e insere no banco SQLite
        Implementa lógica completa baseada em INSERT_CONTAINERS_POSITIONS_BATCH do config.sh
        """
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
        
        if containers:
            first_container = containers[0]
            logger.info(f"Primeiro container recebido: chaves={list(first_container.keys())}")
            logger.info(f"Primeiro container: container_id={first_container.get('container_id')}, container_type={first_container.get('container_type')}, position={first_container.get('position')}")
        
        for idx, container in enumerate(containers):
            container_id = container.get('container_id', 'N/A')
            container_type = container.get('container_type', 'N/A')
            
            if idx < 3:
                logger.info(f"Container {idx}: container_id={container_id}, container_type={container_type}")
                logger.info(f"Container {idx}: chaves disponíveis={list(container.keys())}")
            
            normalized = self._normalize_container_values(container)
            if normalized:
                normalized_containers.append(normalized)
                container_ids.append(normalized['container_id'])
                if idx < 3:
                    logger.info(f"Container {idx} (id={container_id}) normalizado com sucesso: coord_x={normalized.get('coord_x')}, coord_z={normalized.get('coord_z')}, coord_y={normalized.get('coord_y')}, container_name={normalized.get('container_name')}")
            else:
                position = container.get('position', 'N/A')
                x = container.get('x', 'N/A')
                z = container.get('z', 'N/A')
                y = container.get('y', 'N/A')
                logger.warning(f"Container {idx} (id={container_id}): falhou na validação/normalização - position={position} (type={type(position)}), x={x}, z={z}, y={y}")
        
        if not normalized_containers:
            logger.warning(f"Nenhum container válido após normalização de {len(containers)} containers recebidos")
            return False
        
        logger.info(f"Após normalização: {len(normalized_containers)} containers válidos de {len(containers)} recebidos")
        
        # Retry logic
        conn = None
        for attempt in range(1, self.max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                configure_sqlite_pragmas(cursor)
                
                # Buscar registros anteriores para comparação
                logger.info(f"Buscando registros anteriores para {len(container_ids)} containers")
                prev_containers = self.queries.fetch_previous_containers(cursor, container_ids)
                logger.info(f"Encontrados {len(prev_containers)} containers anteriores no banco")
                
                # Separar containers em dois grupos: UPDATE e INSERT
                containers_to_update = []
                containers_to_insert = []
                
                for normalized_container in normalized_containers:
                    container_id = normalized_container['container_id']
                    previous = prev_containers.get(container_id)
                    
                    # Comparar dados atuais com anteriores
                    has_changes, diff_message = compare_container_data(
                        normalized_container, previous, is_partial_update
                    )
                    
                    if is_partial_update:
                        # Snapshots parciais sempre inserem novo registro
                        containers_to_insert.append(normalized_container)
                    else:
                        if not has_changes and previous:
                            # Snapshot completo SEM mudanças: otimizar usando UPDATE
                            containers_to_update.append(normalized_container)
                        else:
                            # Há mudanças ou container novo: usar INSERT
                            containers_to_insert.append(normalized_container)
                
                logger.info(f"Containers separados: {len(containers_to_update)} para UPDATE, {len(containers_to_insert)} para INSERT")
                
                # Processar UPDATEs primeiro
                updated_count = 0
                if containers_to_update:
                    logger.info(f"Iniciando UPDATE de {len(containers_to_update)} containers")
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    for container in containers_to_update:
                        container_id = container['container_id']
                        timestamp = base_timestamp + timedelta(milliseconds=updated_count)
                        tracking_id = self.queries.update_container_timestamp(
                            cursor, container_id, timestamp, prefer_complete=(not is_partial_update)
                        )
                        if tracking_id:
                            updated_count += 1
                        else:
                            logger.warning(f"Falha ao atualizar timestamp do container {container_id}")
                    conn.commit()
                    logger.info(f"Atualizados {updated_count} containers")
                
                # Processar INSERTs
                inserted_count = 0
                last_rowid = 0
                if containers_to_insert:
                    logger.info(f"Iniciando INSERT de {len(containers_to_insert)} containers (is_partial_update={is_partial_update})")
                    timestamps = generate_unique_timestamps(base_timestamp, len(containers_to_insert))
                    
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    
                    inserted_count, last_rowid = self.queries.insert_containers_batch(
                        cursor, containers_to_insert, timestamps, is_partial_update
                    )
                    logger.info(f"INSERT executado: {inserted_count} containers inseridos, last_rowid={last_rowid}")
                
                    if inserted_count <= 0:
                        conn.rollback()
                        conn.close()
                        logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{self.max_retries})")
                        if attempt < self.max_retries:
                            retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                            time.sleep(retry_delay)
                            continue
                        return False
                    
                    conn.commit()
                    
                    # Recuperar IDs inseridos
                    inserted_container_ids = [c['container_id'] for c in containers_to_insert]
                    first_rowid = last_rowid - inserted_count + 1 if last_rowid > 0 and inserted_count > 0 else 0
                    logger.info(f"Recuperando IDs inseridos: first_rowid={first_rowid}, last_rowid={last_rowid}, inserted_count={inserted_count}, container_ids={len(inserted_container_ids)}")
                    container_tracking_map = self.queries.get_inserted_container_ids(
                        cursor, first_rowid, last_rowid, inserted_container_ids, inserted_count
                    )
                    logger.info(f"Container tracking map recuperado: {len(container_tracking_map)} mapeamentos")
                    
                    # Se não é update parcial, inserir items
                    if not is_partial_update and container_tracking_map:
                        logger.info(f"Inserindo items para {len(container_tracking_map)} containers")
                        cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                        
                        items_count = self.queries.insert_container_items_batch(
                            cursor, container_tracking_map, containers_to_insert, base_timestamp
                        )
                        
                        conn.commit()
                        
                        logger.info(f"Inseridos {items_count} items de containers")
                    elif not is_partial_update:
                        logger.warning(f"Container tracking map vazio - não foi possível inserir items (is_partial_update={is_partial_update}, container_tracking_map size={len(container_tracking_map) if container_tracking_map else 0})")
                else:
                    container_tracking_map = {}
                    logger.info(f"Nenhum container para inserir (containers_to_insert está vazio)")
                
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
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{self.max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {self.max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{self.max_retries}): {e}")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
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
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{self.max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de containers (tentativa {attempt}/{self.max_retries}): {e}")
                if attempt < self.max_retries:
                    retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir containers após {self.max_retries} tentativas")
        return False
