"""
Processador de dados de vehicles
"""

import sqlite3
import math
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional

from ..database.sqlite_utils import configure_sqlite_pragmas, generate_unique_timestamps
from ..utils.validation import validate_coordinates, validate_id
from ..utils.normalization import normalize_coordinate, safe_float
from ..utils.comparison import serialize_items_for_comparison, serialize_attachments_for_comparison

logger = logging.getLogger(__name__)


class VehiclesProcessor:
    """
    Processador de dados de vehicles
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def validate(self, vehicle: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um vehicle"""
        # Validar vehicle_id (obrigatório)
        if not validate_id(vehicle.get('vehicle_id'), 'vehicle_id'):
            return False
        
        # Validar coordenadas
        x, z, y = validate_coordinates(vehicle)
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def normalize(self, vehicle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normaliza valores de um vehicle para inserção no banco"""
        if not self.validate(vehicle):
            return None
        
        normalized = {}
        
        # VehicleId (obrigatório, já validado)
        normalized['vehicle_id'] = vehicle['vehicle_id'].strip()
        
        # VehicleName
        vehicle_name = vehicle.get('vehicle_name', '')
        normalized['vehicle_name'] = vehicle_name.strip() if vehicle_name else ''
        
        # Coordenadas (obrigatórias, já validadas)
        x, z, y = validate_coordinates(vehicle)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        # Health parts (opcionais)
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
                item_health_float = safe_float(item_health)
                
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
                attachment_health_float = safe_float(attachment_health)
                
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
                        'x': normalize_coordinate(row[2]),
                        'z': normalize_coordinate(row[3]),
                        'y': normalize_coordinate(row[4]),
                        'engine_health': normalize_coordinate(row[5]) if row[5] else '',
                        'body_health': normalize_coordinate(row[6]) if row[6] else '',
                        'fuel_tank_health': normalize_coordinate(row[7]) if row[7] else '',
                        'items_str': row[8] or '',
                        'attachments_str': row[9] or '',
                        'is_partial_update': int(row[10]) if row[10] is not None else 0
                    }
        except Exception as e:
            logger.warning(f"Erro ao buscar vehicles anteriores: {e}")
        
        return prev_vehicles
    
    def _fetch_all_active_vehicle_ids(self, cursor: sqlite3.Cursor) -> set:
        """
        Busca todos os VehicleId únicos que estão ativos no banco (IsDestroyed = 0 ou NULL)
        Retorna um set de IDs para comparação eficiente
        """
        active_vehicle_ids = set()
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            if has_is_destroyed:
                sql_query = """
                SELECT DISTINCT VehicleId
                FROM vehicles_tracking
                WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
                """
            else:
                # Se não tem coluna IsDestroyed, retornar todos os veículos únicos
                sql_query = """
                SELECT DISTINCT VehicleId
                FROM vehicles_tracking
                """
            
            cursor.execute(sql_query)
            results = cursor.fetchall()
            
            for row in results:
                vehicle_id = row[0]
                if vehicle_id:
                    active_vehicle_ids.add(vehicle_id)
            
            logger.debug(f"Encontrados {len(active_vehicle_ids)} veículos ativos no banco")
        except Exception as e:
            logger.warning(f"Erro ao buscar todos os veículos ativos: {e}")
        
        return active_vehicle_ids
    
    def _mark_vehicles_as_destroyed(self, cursor: sqlite3.Cursor, vehicle_ids: List[str], timestamp: datetime) -> int:
        """
        Marca todos os registros de veículos como destruídos
        Define IsDestroyed = 1 e DestroyedAt = timestamp para todos os registros desses veículos
        Retorna o número de registros atualizados
        """
        if not vehicle_ids:
            return 0
        
        try:
            # Verificar se coluna IsDestroyed existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='IsDestroyed'")
            has_is_destroyed = cursor.fetchone()[0] > 0
            
            if not has_is_destroyed:
                logger.warning("Coluna IsDestroyed não existe na tabela vehicles_tracking, não é possível marcar veículos como destruídos")
                return 0
            
            # Verificar se coluna DestroyedAt existe
            cursor.execute("SELECT COUNT(*) FROM pragma_table_info('vehicles_tracking') WHERE name='DestroyedAt'")
            has_destroyed_at = cursor.fetchone()[0] > 0
            
            timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            
            placeholders = ','.join(['?'] * len(vehicle_ids))
            
            if has_destroyed_at:
                sql_query = f"""
                UPDATE vehicles_tracking
                SET IsDestroyed = 1, DestroyedAt = ?
                WHERE VehicleId IN ({placeholders})
                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                """
                params = [timestamp_str] + vehicle_ids
            else:
                sql_query = f"""
                UPDATE vehicles_tracking
                SET IsDestroyed = 1
                WHERE VehicleId IN ({placeholders})
                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                """
                params = vehicle_ids
            
            cursor.execute(sql_query, params)
            updated_count = cursor.rowcount
            
            if updated_count > 0:
                logger.info(f"Marcados {updated_count} registros de {len(vehicle_ids)} veículos como destruídos (DestroyedAt: {timestamp_str})")
            else:
                logger.debug(f"Nenhum registro foi atualizado para {len(vehicle_ids)} veículos (já estavam marcados como destruídos ou não existem)")
            
            return updated_count
        except Exception as e:
            logger.error(f"Erro ao marcar veículos como destruídos: {e}")
            return 0
    
    def _compare_vehicle_data(self, current: Dict[str, Any], previous: Optional[Dict[str, Any]], is_partial_update: bool) -> Tuple[bool, str]:
        """
        Compara dados atuais de vehicle com anteriores
        Retorna (has_changes, diff_message)
        """
        if not previous:
            return (True, "")  # Vehicle novo
        
        diff_message = ""
        
        # Normalizar coordenadas atuais
        current_x = normalize_coordinate(current.get('coord_x'))
        current_z = normalize_coordinate(current.get('coord_z'))
        current_y = normalize_coordinate(current.get('coord_y'))
        
        # Comparar posição
        if current_x != previous.get('x') or current_z != previous.get('z') or current_y != previous.get('y'):
            prev_x = previous.get('x', '')
            prev_z = previous.get('z', '')
            prev_y = previous.get('y', '')
            diff_message += f"movido(({prev_x},{prev_z},{prev_y})->({current_x},{current_z},{current_y})); "
        
        # Comparar health parts
        current_engine = normalize_coordinate(current.get('engine_health'))
        current_body = normalize_coordinate(current.get('body_health'))
        current_fuel = normalize_coordinate(current.get('fuel_tank_health'))
        
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
                current_items_str = serialize_items_for_comparison(current_items)
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
                current_attachments_str = serialize_attachments_for_comparison(current_attachments)
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
                        # Sempre atualizar o timestamp do registro principal
                        cursor.execute("""
                            UPDATE vehicles_tracking
                            SET TimeStamp = ?
                            WHERE IdVehicleTracking = ?
                        """, (timestamp_str, tracking_id))
                        
                        # Comportamento diferente para snapshot completo x parcial:
                        # - prefer_complete == True  -> update completo: também atualizar items/attachments
                        # - prefer_complete == False -> update parcial: NÃO atualizar items/attachments
                        if prefer_complete:
                            # Atualizar timestamp dos items e attachments relacionados (snapshot completo)
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
    
    def process(self, data: Dict[str, Any]) -> bool:
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
            
            normalized = self.normalize(vehicle)
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
                validation_errors.append(f"Vehicle {idx} (id={vehicle_id}): falhou na validação - position={position}")
        
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
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Configurar PRAGMAs
                configure_sqlite_pragmas(cursor)
                
                # Buscar registros anteriores para comparação
                prev_vehicles = self._fetch_previous_vehicles(cursor, self.db_path, vehicle_ids, is_partial_update)
                
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
                    
                    if is_partial_update:
                        # IMPORTANTE:
                        # - Snapshots parciais não devem atualizar o registro completo existente
                        # - Sempre inserir um novo registro com IsPartialUpdate = 1
                        #   mesmo que não haja mudança de posição/health.
                        #
                        # Isso garante que:
                        # - coordinates_last_update (último registro) avance a cada parcial
                        # - items_attachments_last_update (último completo) permaneça estável
                        vehicles_to_insert.append(normalized_vehicle)
                    else:
                        if not has_changes and previous:
                            # Snapshot completo SEM mudanças relevantes:
                            # otimizar usando UPDATE no registro completo existente
                            vehicles_to_update.append(normalized_vehicle)
                        else:
                            # Há mudanças ou vehicle novo: usar INSERT
                            vehicles_to_insert.append(normalized_vehicle)
                
                # Processar UPDATEs primeiro (dentro de uma transação)
                updated_count = 0
                if vehicles_to_update:
                    # Iniciar transação para UPDATEs
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    for vehicle in vehicles_to_update:
                        vehicle_id = vehicle['vehicle_id']
                        # Gerar timestamp único para este vehicle
                        timestamp = base_timestamp + timedelta(milliseconds=updated_count)
                        tracking_id = self._update_vehicle_timestamp(
                            cursor, vehicle_id, timestamp, prefer_complete=(not is_partial_update)
                        )
                        if tracking_id:
                            updated_count += 1
                    # Commit transação de UPDATEs
                    conn.commit()
                
                # Processar INSERTs
                inserted_count = 0
                last_rowid = 0
                if vehicles_to_insert:
                    # Gerar timestamps únicos
                    timestamps = generate_unique_timestamps(base_timestamp, len(vehicles_to_insert))
                    
                    # Iniciar transação para INSERTs
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
                
                # Verificar veículos que devem ser marcados como destruídos
                # Comparar veículos ativos no banco com a lista recebida
                active_vehicle_ids = self._fetch_all_active_vehicle_ids(cursor)
                received_vehicle_ids_set = set(vehicle_ids)
                
                # Veículos que estão ativos no banco mas não estão na lista recebida
                vehicles_to_mark_destroyed = active_vehicle_ids - received_vehicle_ids_set
                
                if vehicles_to_mark_destroyed:
                    vehicles_to_mark_destroyed_list = list(vehicles_to_mark_destroyed)
                    logger.info(f"Encontrados {len(vehicles_to_mark_destroyed_list)} veículos ativos no banco que não estão na lista recebida - marcando como destruídos")
                    
                    # Marcar veículos como destruídos dentro de uma transação
                    cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                    destroyed_count = self._mark_vehicles_as_destroyed(cursor, vehicles_to_mark_destroyed_list, base_timestamp)
                    conn.commit()
                    
                    if destroyed_count > 0:
                        logger.info(f"Marcados {destroyed_count} registros de {len(vehicles_to_mark_destroyed_list)} veículos como destruídos")
                else:
                    logger.debug("Nenhum veículo precisa ser marcado como destruído")
                
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

