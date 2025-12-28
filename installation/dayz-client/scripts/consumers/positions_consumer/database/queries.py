"""
Queries SQL complexas reutilizáveis
"""

import sqlite3
import logging
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional

from ..utils.normalization import normalize_coordinate

logger = logging.getLogger(__name__)


class Queries:
    """
    Classe para queries SQL complexas reutilizáveis
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    # ==================== CONTAINERS ====================
    
    def fetch_previous_containers(self, cursor: sqlite3.Cursor, container_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Busca últimos registros de containers usando window function
        Retorna dict {container_id: {name, x, z, y, items_str, is_partial_update}}
        """
        if not container_ids:
            logger.debug("fetch_previous_containers: lista de container_ids vazia")
            return {}
        
        logger.info(f"fetch_previous_containers: buscando {len(container_ids)} containers anteriores")
        prev_containers = {}
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            # Construir query com window function, filtrando por container_ids
            placeholders = ','.join(['?'] * len(container_ids))
            
            if has_is_destroyed:
                sql_query = f"""
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
                    WHERE ContainerId IN ({placeholders})
                    AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                    AND IsPartialUpdate = 0
                ) ranked
                LEFT JOIN container_items_tracking ci ON ranked.IdContainerTracking = ci.ContainerTrackingId
                WHERE ranked.rn = 1
                GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                         ranked.IsPartialUpdate
                """
            else:
                sql_query = f"""
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
                    WHERE ContainerId IN ({placeholders})
                    AND IsPartialUpdate = 0
                ) ranked
                LEFT JOIN container_items_tracking ci ON ranked.IdContainerTracking = ci.ContainerTrackingId
                WHERE ranked.rn = 1
                GROUP BY ranked.ContainerId, ranked.ContainerName, ranked.PositionX, ranked.PositionZ, ranked.PositionY,
                         ranked.IsPartialUpdate
                """
            
            cursor.execute(sql_query, container_ids)
            results = cursor.fetchall()
            
            logger.info(f"fetch_previous_containers: query retornou {len(results)} resultados")
            
            for row in results:
                container_id = row[0]
                if container_id in container_ids:
                    prev_containers[container_id] = {
                        'name': row[1] or '',
                        'x': normalize_coordinate(row[2]),
                        'z': normalize_coordinate(row[3]),
                        'y': normalize_coordinate(row[4]),
                        'items_str': row[5] or '',
                        'is_partial_update': int(row[6]) if row[6] is not None else 0
                    }
                    logger.debug(f"fetch_previous_containers: container {container_id} encontrado - x={prev_containers[container_id]['x']}, z={prev_containers[container_id]['z']}, y={prev_containers[container_id]['y']}, items_count={len(prev_containers[container_id]['items_str'].split(',')) if prev_containers[container_id]['items_str'] else 0}")
            
            logger.info(f"fetch_previous_containers: {len(prev_containers)} containers anteriores encontrados de {len(container_ids)} buscados")
        except Exception as e:
            logger.warning(f"Erro ao buscar containers anteriores: {e}")
        
        return prev_containers
    
    def insert_containers_batch(self, cursor: sqlite3.Cursor, containers: List[Dict[str, Any]], 
                                timestamps: List[datetime], is_partial_update: bool = False) -> Tuple[int, int]:
        """
        Insere containers em batch e retorna (inserted_count, last_rowid)
        Retorna (0, 0) em caso de erro
        """
        if not containers or not timestamps or len(containers) != len(timestamps):
            logger.warning(f"insert_containers_batch: dados inválidos - containers={len(containers) if containers else 0}, timestamps={len(timestamps) if timestamps else 0}")
            return (0, 0)
        
        logger.info(f"insert_containers_batch: preparando inserção de {len(containers)} containers (is_partial_update={is_partial_update})")
        
        sql = """
        INSERT INTO containers_tracking (
            ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp, IsPartialUpdate
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        
        values = []
        for container, timestamp in zip(containers, timestamps):
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
        
        try:
            cursor.executemany(sql, values)
            
            inserted_count = cursor.rowcount
            last_rowid = cursor.lastrowid
            
            logger.info(f"insert_containers_batch: INSERT executado com sucesso - rowcount={inserted_count}, last_rowid={last_rowid}")
            
            if containers:
                first_container = containers[0]
                logger.info(f"insert_containers_batch: primeiro container inserido - container_id={first_container.get('container_id')}, container_name={first_container.get('container_name')}, coord_x={first_container.get('coord_x')}, coord_z={first_container.get('coord_z')}, coord_y={first_container.get('coord_y')}")
            
            return (inserted_count, last_rowid)
        except Exception as e:
            logger.error(f"insert_containers_batch: erro ao executar INSERT - {e}")
            if containers:
                first_container = containers[0]
                logger.error(f"insert_containers_batch: primeiro container que causou erro - container_id={first_container.get('container_id')}, container_name={first_container.get('container_name')}, coord_x={first_container.get('coord_x')}, coord_z={first_container.get('coord_z')}, coord_y={first_container.get('coord_y')}")
            raise
    
    def get_inserted_container_ids(self, cursor: sqlite3.Cursor, first_rowid: int, last_rowid: int,
                                    container_ids: List[str], inserted_count: int) -> Dict[str, int]:
        """
        Recupera IdContainerTracking dos registros inseridos
        Retorna dict {container_id: id_container_tracking}
        """
        container_tracking_map = {}
        
        logger.info(f"get_inserted_container_ids: first_rowid={first_rowid}, last_rowid={last_rowid}, inserted_count={inserted_count}, container_ids={len(container_ids)}")
        
        if first_rowid > 0 and last_rowid > 0 and inserted_count > 0:
            try:
                cursor.execute("""
                    SELECT ContainerId, IdContainerTracking 
                    FROM containers_tracking 
                    WHERE IdContainerTracking >= ? AND IdContainerTracking <= ? 
                    ORDER BY IdContainerTracking ASC
                """, (first_rowid, last_rowid))
                
                results = cursor.fetchall()
                logger.debug(f"get_inserted_container_ids método 1: encontrados {len(results)} resultados")
                if results and len(results) == inserted_count:
                    for container_id, tracking_id in results:
                        if container_id in container_ids:
                            container_tracking_map[container_id] = tracking_id
                    
                    if len(container_tracking_map) == inserted_count:
                        logger.debug(f"get_inserted_container_ids método 1: sucesso - {len(container_tracking_map)} mapeamentos")
                        return container_tracking_map
                    else:
                        logger.warning(f"get_inserted_container_ids método 1: mapeamento incompleto - esperado {inserted_count}, obtido {len(container_tracking_map)}")
                else:
                    logger.warning(f"get_inserted_container_ids método 1: número de resultados não corresponde - esperado {inserted_count}, obtido {len(results) if results else 0}")
            except Exception as e:
                logger.warning(f"Método 1 de recuperação de IDs de containers falhou: {e}")
        
        if container_ids and not container_tracking_map:
            logger.debug(f"get_inserted_container_ids: tentando método 2 (fallback) para {len(container_ids)} containers")
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
                logger.debug(f"get_inserted_container_ids método 2: encontrados {len(results)} resultados")
                for container_id, tracking_id in results:
                    if container_id in container_ids:
                        container_tracking_map[container_id] = tracking_id
                
                if container_tracking_map:
                    logger.debug(f"get_inserted_container_ids método 2: sucesso - {len(container_tracking_map)} mapeamentos")
                    return container_tracking_map
                else:
                    logger.warning(f"get_inserted_container_ids método 2: nenhum mapeamento encontrado")
            except Exception as e:
                logger.warning(f"Método 2 de recuperação de IDs de containers falhou: {e}")
        
        if container_ids and not container_tracking_map:
            logger.debug(f"get_inserted_container_ids: tentando método 3 (fallback final) para {len(container_ids)} containers")
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
                logger.debug(f"get_inserted_container_ids método 3: encontrados {len(results)} resultados")
                for container_id, tracking_id in results:
                    if container_id in container_ids:
                        container_tracking_map[container_id] = tracking_id
                
                if container_tracking_map:
                    logger.debug(f"get_inserted_container_ids método 3: sucesso - {len(container_tracking_map)} mapeamentos")
                else:
                    logger.warning(f"get_inserted_container_ids método 3: nenhum mapeamento encontrado")
            except Exception as e:
                logger.warning(f"Método 3 de recuperação de IDs de containers falhou: {e}")
        
        logger.info(f"get_inserted_container_ids: retornando {len(container_tracking_map)} mapeamentos de {inserted_count} esperados")
        return container_tracking_map
    
    def insert_container_items_batch(self, cursor: sqlite3.Cursor, container_tracking_map: Dict[str, int],
                                      containers_data: List[Dict[str, Any]], timestamp: datetime) -> int:
        """Insere items de containers em batch"""
        if not container_tracking_map or not containers_data:
            logger.warning(f"insert_container_items_batch: dados inválidos - container_tracking_map={len(container_tracking_map) if container_tracking_map else 0}, containers_data={len(containers_data) if containers_data else 0}")
            return 0
        
        logger.info(f"insert_container_items_batch: preparando inserção de items para {len(containers_data)} containers")
        
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
            logger.warning(f"insert_container_items_batch: nenhum item válido para inserir")
            return 0
        
        logger.info(f"insert_container_items_batch: inserindo {len(values)} items")
        try:
            cursor.executemany(sql, values)
            items_count = cursor.rowcount
            logger.info(f"insert_container_items_batch: {items_count} items inseridos com sucesso")
            return items_count
        except Exception as e:
            logger.error(f"insert_container_items_batch: erro ao inserir items - {e}")
            raise
    
    def update_container_timestamp(self, cursor: sqlite3.Cursor, container_id: str, timestamp: datetime, prefer_complete: bool = True) -> Optional[int]:
        """
        Atualiza timestamp do último registro de container
        Retorna ContainerTrackingId se sucesso, None caso contrário
        """
        max_retries = 5
        retry_delay = 0.2
        
        try:
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('containers_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            for attempt in range(1, max_retries + 1):
                try:
                    if prefer_complete:
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
                        
                        if prefer_complete:
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
                        import time
                        time.sleep(retry_delay * attempt)
                        continue
                    raise
                    
        except Exception as e:
            logger.warning(f"Erro ao atualizar timestamp de container {container_id}: {e}")
            return None
    
    # ==================== PLAYERS ====================
    
    def insert_players_batch(self, cursor: sqlite3.Cursor, players: List[Dict[str, Any]], 
                            timestamps: List[datetime]) -> Tuple[int, int]:
        """
        Insere players em batch e retorna (inserted_count, last_rowid)
        Retorna (0, 0) em caso de erro
        """
        if not players or not timestamps or len(players) != len(timestamps):
            return (0, 0)
        
        sql = """
        INSERT INTO players_coord (
            PlayerID, CoordX, CoordZ, CoordY, Data,
            Health, Blood, Shock, Energy, Water,
            IsAlive, IsAdmin, Stamina, StaminaMax,
            ItemsInHands, ItemsCount, MainItems
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        values = []
        for player, timestamp in zip(players, timestamps):
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
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
        
        cursor.executemany(sql, values)
        
        inserted_count = cursor.rowcount
        last_rowid = cursor.lastrowid
        
        return (inserted_count, last_rowid)
    
    def get_inserted_player_ids(self, cursor: sqlite3.Cursor, first_rowid: int, last_rowid: int, 
                            player_ids: List[str], inserted_count: int) -> Dict[str, int]:
        """
        Recupera PlayerCoordId dos registros inseridos
        Retorna dict {player_id: player_coord_id}
        """
        player_coord_map = {}
        
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
                    for player_id, coord_id in results:
                        if player_id in player_ids:
                            player_coord_map[player_id] = coord_id
                    
                    if len(player_coord_map) == inserted_count:
                        return player_coord_map
            except Exception as e:
                logger.warning(f"Método 1 de recuperação de IDs falhou: {e}")
        
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
    
    # ==================== STRUCTURES ====================
    
    def insert_fences_batch(self, cursor: sqlite3.Cursor, fences: List[Dict[str, Any]], 
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
    
    def insert_watchtowers_batch(self, cursor: sqlite3.Cursor, watchtowers: List[Dict[str, Any]], 
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
    
    def insert_flags_batch(self, cursor: sqlite3.Cursor, flags: List[Dict[str, Any]], 
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
