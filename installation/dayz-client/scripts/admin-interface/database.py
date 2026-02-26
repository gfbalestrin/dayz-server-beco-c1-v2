"""
Camada de acesso aos bancos de dados SQLite
"""
import re
import sqlite3
import base64
import json
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Set
import config
import bcrypt

# Importar ssh_client para acesso a arquivos remotos
try:
    from ssh_client import read_remote_file
except ImportError:
    read_remote_file = None

# Cache para schema de tabelas (PRAGMA table_info)
_schema_cache: Dict[str, List[str]] = {}

# Cache de admin IDs (carregado uma vez na inicialização)
_admin_ids_cache: List[str] = []
_admin_ids_loaded: bool = False


def load_admin_ids_cache() -> bool:
    """
    Carrega admin_ids do servidor remoto para o cache.
    Chamado uma vez na inicialização da aplicação.
    """
    global _admin_ids_cache, _admin_ids_loaded

    try:
        if not read_remote_file:
            logging.warning("ssh_client não disponível, cache de admin_ids vazio")
            _admin_ids_cache = []
            _admin_ids_loaded = True
            return False

        file_content = read_remote_file(config.ADMIN_IDS_FILE)

        if file_content is None:
            _admin_ids_cache = []
        else:
            _admin_ids_cache = [line.strip() for line in file_content.splitlines() if line.strip()]

        _admin_ids_loaded = True
        logging.info(f"Cache de admin_ids carregado: {len(_admin_ids_cache)} administradores")
        return True
    except Exception as e:
        logging.error(f"Erro ao carregar cache de admin_ids: {str(e)}")
        _admin_ids_cache = []
        _admin_ids_loaded = True
        return False

def get_table_columns(db_path: str, table_name: str) -> List[str]:
    """Busca colunas de uma tabela com cache"""
    # Validar nome da tabela para prevenir SQL injection
    valid_table_names = {
        'containers_tracking', 'vehicles_tracking', 'vehicles_items', 
        'vehicles_attachments', 'container_items_tracking',
        'fences_tracking', 'watchtowers_tracking', 'flags_tracking'
    }
    if table_name not in valid_table_names:
        raise ValueError(f"Invalid table name: {table_name}")
    
    cache_key = f"{db_path}:{table_name}"
    if cache_key not in _schema_cache:
        with DatabaseConnection(db_path) as conn:
            cursor = conn.cursor()
            # PRAGMA table_info não aceita placeholders, mas validamos o nome da tabela
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [row[1] for row in cursor.fetchall()]
            _schema_cache[cache_key] = columns
    return _schema_cache[cache_key]

def clear_schema_cache(db_path: str = None, table_name: str = None):
    """Limpa cache de schema"""
    global _schema_cache
    if db_path is None:
        _schema_cache.clear()
    elif table_name is None:
        # Limpar todas as entradas deste banco
        keys_to_remove = [k for k in _schema_cache.keys() if k.startswith(f"{db_path}:")]
        for k in keys_to_remove:
            del _schema_cache[k]
    else:
        cache_key = f"{db_path}:{table_name}"
        if cache_key in _schema_cache:
            del _schema_cache[cache_key]

class DatabaseConnection:
    """Context manager para conexões com o banco de dados"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None
    
    def __enter__(self):
        self.conn = sqlite3.connect(self.db_path)
        self.conn.text_factory = lambda b: b.decode("utf-8", "replace") if isinstance(b, bytes) else b
        self.conn.row_factory = sqlite3.Row
        return self.conn
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()

def get_all_players() -> List[Dict]:
    """Retorna todos os jogadores da tabela players_database"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT PlayerID, PlayerName, SteamID, SteamName
            FROM players_database
            ORDER BY PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_player_coords(player_id: str) -> List[Dict]:
    """Retorna as coordenadas de um jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT PlayerCoordId, CoordX, CoordY, CoordZ, Data
            FROM players_coord
            WHERE PlayerID = ?
            ORDER BY Data DESC
        """, (player_id,))
        return [dict(row) for row in cursor.fetchall()]

def get_player_coords_backup(coord_id: int) -> List[Dict]:
    """Retorna backups de coordenadas"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT Backup, TimeStamp
            FROM players_coord_backup
            WHERE PlayerCoordId = ?
            ORDER BY TimeStamp DESC
        """, (coord_id,))
        return [dict(row) for row in cursor.fetchall()]

def get_logs_adm(limit: int = 1000) -> List[Dict]:
    """Retorna logs administrativos"""
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdLogAdm, Message, LogLevel, TimeStamp
            FROM logs_adm
            ORDER BY TimeStamp DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_logs_custom(limit: int = 1000) -> List[Dict]:
    """Retorna logs customizados"""
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdLogCustom, Message, LogLevel, Source, TimeStamp
            FROM logs_custom
            ORDER BY TimeStamp DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_vehicles_tracking(limit: int = 1000) -> List[Dict]:
    """Retorna tracking de veículos"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdVehicleTracking, VehicleId, VehicleName, 
                   PositionX, PositionY, PositionZ, TimeStamp
            FROM vehicles_tracking
            ORDER BY TimeStamp DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_vehicles_last_position() -> List[Dict]:
    """Retorna apenas veículos do último timestamp de rastreamento (veículos atualmente ativos)"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT VehicleId, VehicleName,
                   PositionX, PositionY, PositionZ, TimeStamp, IdVehicleTracking
            FROM vehicles_tracking
            WHERE TimeStamp = (
                SELECT MAX(TimeStamp) FROM vehicles_tracking
            )
            ORDER BY VehicleName
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_vehicles_map_positions(include_destroyed: bool = False) -> List[Dict]:
    """Retorna apenas veículos do último timestamp de rastreamento para exibição no mapa"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Verificar se coluna IsDestroyed existe (migração) - usar cache
        try:
            columns = get_table_columns(config.DB_VEHICLES, 'vehicles_tracking')
            has_is_destroyed = 'IsDestroyed' in columns
        except:
            has_is_destroyed = False
        
        # Buscar último registro de cada veículo
        # Carregar colunas uma vez usando cache
        try:
            columns = get_table_columns(config.DB_VEHICLES, 'vehicles_tracking')
        except:
            columns = []
        
        if has_is_destroyed and not include_destroyed:
            health_columns = ""
            if 'EngineHealth' in columns:
                health_columns += ", vt.EngineHealth"
            if 'BodyHealth' in columns:
                health_columns += ", vt.BodyHealth"
            if 'FuelTankHealth' in columns:
                health_columns += ", vt.FuelTankHealth"
            
            cursor.execute(f"""
                SELECT vt.VehicleId, vt.VehicleName, vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp, vt.IdVehicleTracking,
                       0 as IsDestroyed, NULL as DestroyedAt{health_columns}
                FROM vehicles_tracking vt
                INNER JOIN (
                    SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                    FROM vehicles_tracking
                    WHERE IsDestroyed = 0 OR IsDestroyed IS NULL
                    GROUP BY VehicleId
                ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                WHERE vt.IsDestroyed = 0 OR vt.IsDestroyed IS NULL
                ORDER BY vt.VehicleName
            """)
        else:
            if has_is_destroyed:
                # Colunas já carregadas do cache acima
                health_columns = ""
                if 'EngineHealth' in columns:
                    health_columns += ", vt.EngineHealth"
                if 'BodyHealth' in columns:
                    health_columns += ", vt.BodyHealth"
                if 'FuelTankHealth' in columns:
                    health_columns += ", vt.FuelTankHealth"
                
                cursor.execute(f"""
                    SELECT vt.VehicleId, vt.VehicleName, vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp, vt.IdVehicleTracking,
                           IFNULL(vt.IsDestroyed, 0) as IsDestroyed, vt.DestroyedAt{health_columns}
                    FROM vehicles_tracking vt
                    INNER JOIN (
                        SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                        FROM vehicles_tracking
                        GROUP BY VehicleId
                    ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                    ORDER BY vt.VehicleName
                """)
            else:
                # Colunas já carregadas do cache acima
                health_columns = ""
                if 'EngineHealth' in columns:
                    health_columns += ", vt.EngineHealth"
                if 'BodyHealth' in columns:
                    health_columns += ", vt.BodyHealth"
                if 'FuelTankHealth' in columns:
                    health_columns += ", vt.FuelTankHealth"
                
                cursor.execute(f"""
                    SELECT vt.VehicleId, vt.VehicleName, vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp, vt.IdVehicleTracking,
                           0 as IsDestroyed, NULL as DestroyedAt{health_columns}
                    FROM vehicles_tracking vt
                    INNER JOIN (
                        SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                        FROM vehicles_tracking
                        GROUP BY VehicleId
                    ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                    ORDER BY vt.VehicleName
                """)
        
        vehicles = [dict(row) for row in cursor.fetchall()]
        
        if not vehicles:
            return vehicles
        
        # Verificar se coluna IsPartialUpdate existe - usar cache
        try:
            columns = get_table_columns(config.DB_VEHICLES, 'vehicles_tracking')
            has_is_partial_update = 'IsPartialUpdate' in columns
        except:
            has_is_partial_update = False
        
        # Preparar estruturas para batch queries
        vehicle_complete_snapshot_map = {}  # vehicle_id -> (tracking_id, timestamp)
        tracking_ids_needing_items = []
        
        # Primeira passada: identificar tracking IDs completos
        for vehicle in vehicles:
            vehicle_id = vehicle['VehicleId']
            vehicle_tracking_id = vehicle['IdVehicleTracking']
            
            if has_is_partial_update:
                # Buscar último snapshot completo
                cursor.execute("""
                    SELECT IdVehicleTracking, TimeStamp
                    FROM vehicles_tracking
                    WHERE VehicleId = ? AND IsPartialUpdate = 0
                    ORDER BY TimeStamp DESC
                    LIMIT 1
                """, (vehicle_id,))
                result = cursor.fetchone()
                if result:
                    complete_tracking_id = result[0]
                    vehicle['items_attachments_last_update'] = result[1]
                    tracking_ids_needing_items.append(complete_tracking_id)
                else:
                    vehicle['items_attachments_last_update'] = None
                    tracking_ids_needing_items.append(vehicle_tracking_id)
            else:
                vehicle['items_attachments_last_update'] = vehicle['TimeStamp']
                tracking_ids_needing_items.append(vehicle_tracking_id)
            
            # Data de atualização das coordenadas (último registro, pode ser parcial)
            vehicle['coordinates_last_update'] = vehicle['TimeStamp']
            
            # Verificação simplificada de movimento (comparar apenas primeira e última posição)
            # Isso evita fazer query por veículo - assumimos que veículo não se moveu inicialmente
            vehicle['has_moved'] = False
        
        # Batch query para buscar todos os items de uma vez
        items_by_tracking = {}
        if tracking_ids_needing_items:
            placeholders = ','.join(['?'] * len(tracking_ids_needing_items))
            try:
                cursor.execute(f"""
                    SELECT VehicleTrackingId, ItemType, ItemHealth
                    FROM vehicles_items
                    WHERE VehicleTrackingId IN ({placeholders})
                    ORDER BY VehicleTrackingId, ItemType
                """, tracking_ids_needing_items)
                
                for row in cursor.fetchall():
                    tracking_id = row[0]
                    if tracking_id not in items_by_tracking:
                        items_by_tracking[tracking_id] = {'items': [], 'attachments': []}
                    items_by_tracking[tracking_id]['items'].append({
                        'type': row[1],
                        'health': row[2]
                    })
            except:
                pass
        
        # Batch query para buscar todos os attachments de uma vez
        if tracking_ids_needing_items:
            placeholders = ','.join(['?'] * len(tracking_ids_needing_items))
            try:
                cursor.execute(f"""
                    SELECT VehicleTrackingId, AttachmentType, AttachmentHealth
                    FROM vehicles_attachments
                    WHERE VehicleTrackingId IN ({placeholders})
                    ORDER BY VehicleTrackingId, AttachmentType
                """, tracking_ids_needing_items)
                
                for row in cursor.fetchall():
                    tracking_id = row[0]
                    if tracking_id not in items_by_tracking:
                        items_by_tracking[tracking_id] = {'items': [], 'attachments': []}
                    items_by_tracking[tracking_id]['attachments'].append({
                        'type': row[1],
                        'health': row[2]
                    })
            except:
                pass
        
        # Buscar health_parts em batch
        health_parts_by_tracking = {}
        if tracking_ids_needing_items:
            placeholders = ','.join(['?'] * len(tracking_ids_needing_items))
            try:
                health_cols = []
                if 'EngineHealth' in columns:
                    health_cols.append('EngineHealth')
                if 'BodyHealth' in columns:
                    health_cols.append('BodyHealth')
                if 'FuelTankHealth' in columns:
                    health_cols.append('FuelTankHealth')
                
                if health_cols:
                    cols_str = ', '.join(health_cols)
                    cursor.execute(f"""
                        SELECT IdVehicleTracking, {cols_str}
                        FROM vehicles_tracking
                        WHERE IdVehicleTracking IN ({placeholders})
                    """, tracking_ids_needing_items)
                    
                    for row in cursor.fetchall():
                        tracking_id = row[0]
                        health_parts = {}
                        row_dict = dict(row)
                        if 'EngineHealth' in row_dict and row_dict['EngineHealth'] is not None:
                            health_parts['engine'] = row_dict['EngineHealth']
                        if 'BodyHealth' in row_dict and row_dict['BodyHealth'] is not None:
                            health_parts['body'] = row_dict['BodyHealth']
                        if 'FuelTankHealth' in row_dict and row_dict['FuelTankHealth'] is not None:
                            health_parts['fuel_tank'] = row_dict['FuelTankHealth']
                        
                        if health_parts:
                            health_parts_by_tracking[tracking_id] = health_parts
            except:
                pass
        
        # Atribuir items, attachments e health_parts aos veículos
        for i, vehicle in enumerate(vehicles):
            tracking_id = tracking_ids_needing_items[i]
            
            tracking_data = items_by_tracking.get(tracking_id, {'items': [], 'attachments': []})
            vehicle['items'] = tracking_data['items']
            vehicle['attachments'] = tracking_data['attachments']
            
            health_parts = health_parts_by_tracking.get(tracking_id)
            if not health_parts and tracking_id == vehicle['IdVehicleTracking']:
                # Fallback: usar do registro atual
                health_parts = {}
                if 'EngineHealth' in columns:
                    engine_health = vehicle.get('EngineHealth')
                    if engine_health is not None:
                        health_parts['engine'] = engine_health
                if 'BodyHealth' in columns:
                    body_health = vehicle.get('BodyHealth')
                    if body_health is not None:
                        health_parts['body'] = body_health
                if 'FuelTankHealth' in columns:
                    fuel_health = vehicle.get('FuelTankHealth')
                    if fuel_health is not None:
                        health_parts['fuel_tank'] = fuel_health
            
            vehicle['health_parts'] = health_parts if health_parts else None
        
        return vehicles

def get_vehicle_trail(vehicle_id: str, limit: int = 100, date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna histórico de posições de um veículo, filtrando pontos duplicados
    
    A função busca mais registros do banco para garantir que, após filtrar duplicados
    (mesma posição), ainda haja pontos únicos suficientes para retornar.
    """
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Construir condições WHERE dinamicamente
        where_conditions = ["VehicleId = ?"]
        params = [vehicle_id]
        
        if date_from:
            # Usar datetime() do SQLite para garantir comparação correta de datas
            # Isso funciona mesmo se TimeStamp tiver milissegundos
            where_conditions.append("datetime(TimeStamp) >= datetime(?)")
            params.append(date_from)
        
        if date_to:
            # Usar datetime() do SQLite para garantir comparação correta de datas
            where_conditions.append("datetime(TimeStamp) <= datetime(?)")
            params.append(date_to)
        
        where_clause = " AND ".join(where_conditions)
        
        # Se filtros de data estiverem ativos, usar limite maior para buscar mais registros brutos
        # Isso garante que, após filtrar duplicados, ainda haja pontos únicos suficientes
        # Para evitar sobrecarga, usar limite de 10000 quando filtros estão ativos
        if date_from or date_to:
            db_query_limit = limit if limit > 10000 else 10000
        else:
            # Quando não há filtros de data, buscar mais registros (multiplicador)
            # para garantir pontos únicos suficientes após filtrar duplicados
            # Exemplo: se limit=100, buscar 1000 registros brutos para ter ~100 únicos
            db_query_limit = limit * 10 if limit * 10 <= 10000 else 10000
        
        # Buscar mais registros do banco (antes de filtrar duplicados)
        query = f"""
            SELECT IdVehicleTracking, VehicleId, VehicleName,
                   PositionX, PositionY, PositionZ, TimeStamp
            FROM vehicles_tracking
            WHERE {where_clause}
            ORDER BY datetime(TimeStamp) DESC
            LIMIT ?
        """
        params.append(db_query_limit)
        
        cursor.execute(query, params)
        all_vehicles = [dict(row) for row in cursor.fetchall()]
        
        # Filtrar eventos duplicados (mesma posição) ANTES de aplicar o limite final
        # Isso garante que o limite seja aplicado sobre pontos únicos (onde houve movimento)
        filtered_vehicles = []
        prev_state = None
        
        for vehicle in all_vehicles:
            # Criar hash do estado atual (posição arredondada)
            current_state_key = (
                round(vehicle['PositionX'], 1),
                round(vehicle['PositionY'], 1),
                round(vehicle['PositionZ'], 1)
            )
            
            current_state = {
                'key': current_state_key,
                'position': (vehicle['PositionX'], vehicle['PositionY'], vehicle['PositionZ'])
            }
            
            # Se mudou, adicionar à lista
            if prev_state is None or prev_state['key'] != current_state['key']:
                filtered_vehicles.append(vehicle)
                prev_state = current_state
        
        # Aplicar limite final sobre os pontos únicos já filtrados
        return filtered_vehicles[:limit]

def get_vehicles_overview(include_destroyed: bool = False, date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna último registro de cada veículo com filtros opcionais"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        status_filter = (status_filter or 'active').lower()
        selected_change_types = set(change_types or [])
        change_types_active = len(selected_change_types) > 0
        
        # Verificar colunas disponíveis
        cursor.execute("PRAGMA table_info(vehicles_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_destroyed = 'IsDestroyed' in columns
        has_health = 'EngineHealth' in columns or 'BodyHealth' in columns or 'FuelTankHealth' in columns
        
        health_columns = ""
        if 'EngineHealth' in columns:
            health_columns += ", vt.EngineHealth"
        if 'BodyHealth' in columns:
            health_columns += ", vt.BodyHealth"
        if 'FuelTankHealth' in columns:
            health_columns += ", vt.FuelTankHealth"
        
        # Construir query base
        where_conditions = []
        params = []
        
        if has_is_destroyed and not include_destroyed:
            where_conditions.append("(vt.IsDestroyed = 0 OR vt.IsDestroyed IS NULL)")
        
        if date_from:
            where_conditions.append("vt.TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("vt.TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)
        
        query = f"""
            SELECT vt.IdVehicleTracking, vt.VehicleId, vt.VehicleName,
                   vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp,
                   IFNULL(vt.IsDestroyed, 0) as IsDestroyed, vt.DestroyedAt{health_columns}
            FROM vehicles_tracking vt
            INNER JOIN (
                SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                FROM vehicles_tracking
                GROUP BY VehicleId
            ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
            {where_clause}
            ORDER BY vt.TimeStamp DESC, vt.VehicleName
        """
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_vehicle_history(vehicle_id: str, limit: int = 100, offset: int = 0, 
                       date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna histórico de um veículo com informações de saúde, com suporte a filtros de data e paginação"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Verificar colunas de saúde
        cursor.execute("PRAGMA table_info(vehicles_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        
        health_columns = ""
        if 'EngineHealth' in columns:
            health_columns += ", EngineHealth"
        if 'BodyHealth' in columns:
            health_columns += ", BodyHealth"
        if 'FuelTankHealth' in columns:
            health_columns += ", FuelTankHealth"
        
        # Construir WHERE clause com filtros de data
        where_conditions = ["VehicleId = ?"]
        params = [vehicle_id]
        
        if date_from:
            where_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = "WHERE " + " AND ".join(where_conditions)
        
        # Verificar se coluna IsPartialUpdate existe
        has_is_partial_update = 'IsPartialUpdate' in columns
        partial_column = ", IFNULL(IsPartialUpdate, 0) as IsPartialUpdate" if has_is_partial_update else ", 0 as IsPartialUpdate"
        
        query = f"""
            SELECT IdVehicleTracking, VehicleId, VehicleName,
                   PositionX, PositionY, PositionZ, TimeStamp,
                   IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt{health_columns}{partial_column}
            FROM vehicles_tracking
            {where_clause}
            ORDER BY TimeStamp DESC
            LIMIT ? OFFSET ?
        """
        
        params.extend([limit, offset])
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def count_vehicle_history(vehicle_id: str, date_from: str = None, date_to: str = None) -> int:
    """Conta o total de registros de histórico de um veículo com filtros de data aplicados"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Construir WHERE clause com filtros de data
        where_conditions = ["VehicleId = ?"]
        params = [vehicle_id]
        
        if date_from:
            where_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = "WHERE " + " AND ".join(where_conditions)
        
        query = f"""
            SELECT COUNT(*)
            FROM vehicles_tracking
            {where_clause}
        """
        
        cursor.execute(query, params)
        return cursor.fetchone()[0]

def get_vehicle_tracking_items(tracking_id: int) -> List[Dict]:
    """Retorna items de um registro específico de tracking"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdVehicleItem, ItemType, ItemHealth, TimeStamp
            FROM vehicles_items
            WHERE VehicleTrackingId = ?
            ORDER BY ItemType
        """, (tracking_id,))
        return [dict(row) for row in cursor.fetchall()]

def get_vehicle_tracking_attachments(tracking_id: int) -> List[Dict]:
    """Retorna attachments de um registro específico de tracking"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdVehicleAttachment, AttachmentType, AttachmentHealth, TimeStamp
            FROM vehicles_attachments
            WHERE VehicleTrackingId = ?
            ORDER BY AttachmentType
        """, (tracking_id,))
        return [dict(row) for row in cursor.fetchall()]

def count_vehicle_changes(vehicle_id: str, date_from: str = None, date_to: str = None) -> Tuple[int, Dict[str, bool]]:
    """Conta o número de alterações significativas no histórico de um veículo e retorna flags por tipo"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Buscar histórico ordenado por timestamp (limitar a últimos 500 registros para performance)
        history_conditions = ["VehicleId = ?"]
        params = [vehicle_id]
        
        if date_from:
            history_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            history_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = " AND ".join(history_conditions)
        
        query = f"""
            SELECT IdVehicleTracking, PositionX, PositionY, PositionZ, TimeStamp,
                   IFNULL(IsDestroyed, 0) as IsDestroyed,
                   EngineHealth, BodyHealth, FuelTankHealth, IFNULL(IsPartialUpdate, 0) as IsPartialUpdate
            FROM vehicles_tracking
            WHERE {where_clause}
            ORDER BY TimeStamp DESC
            LIMIT 500
        """
        
        cursor.execute(query, params)
        
        # Reverter para ordem ASC para comparação
        records = list(reversed([dict(row) for row in cursor.fetchall()]))
        
        if len(records) <= 1:
            return 0, {
                'position': False,
                'health': False,
                'items': False,
                'attachments': False
            }
        
        # Carregar todos os items e attachments de uma vez (otimização)
        tracking_ids = [r['IdVehicleTracking'] for r in records]
        items_map = {}
        attachments_map = {}
        
        if tracking_ids:
            placeholders = ','.join(['?'] * len(tracking_ids))
            
            # Carregar items (filtrar apenas tipos válidos, não nulos e não vazios)
            try:
                cursor.execute(f"""
                    SELECT VehicleTrackingId, ItemType
                    FROM vehicles_items
                    WHERE VehicleTrackingId IN ({placeholders})
                    AND ItemType IS NOT NULL
                    AND ItemType != ''
                    AND ItemType != 'empty'
                """, tracking_ids)
                for row in cursor.fetchall():
                    tracking_id = row[0]
                    item_type = row[1]
                    # Validar novamente no código (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        if tracking_id not in items_map:
                            items_map[tracking_id] = []
                        items_map[tracking_id].append(item_type)
            except:
                pass
            
            # Carregar attachments (filtrar apenas tipos válidos, não nulos e não vazios)
            try:
                cursor.execute(f"""
                    SELECT VehicleTrackingId, AttachmentType
                    FROM vehicles_attachments
                    WHERE VehicleTrackingId IN ({placeholders})
                    AND AttachmentType IS NOT NULL
                    AND AttachmentType != ''
                    AND AttachmentType != 'empty'
                """, tracking_ids)
                for row in cursor.fetchall():
                    tracking_id = row[0]
                    attachment_type = row[1]
                    # Validar novamente no código (segurança extra)
                    if attachment_type and attachment_type.strip() and attachment_type != 'empty':
                        if tracking_id not in attachments_map:
                            attachments_map[tracking_id] = []
                        attachments_map[tracking_id].append(attachment_type)
            except:
                pass
        
        change_count = 0
        pos_threshold = 0.1
        health_threshold = 0.05
        change_flags = {
            'position': False,
            'health': False,
            'items': False,
            'attachments': False
        }
        
        # Comparar registros consecutivos para posição/saúde/status
        # e comparar apenas snapshots COMPLETOS consecutivos para items/attachments
        # Inicializar last_complete_index com o primeiro registro se ele já for completo
        last_complete_index = None
        if len(records) > 0:
            first_record_is_partial = records[0].get('IsPartialUpdate', 0) == 1
            if not first_record_is_partial:
                last_complete_index = 0
        
        for i in range(1, len(records)):
            prev = records[i - 1]
            curr = records[i]
            
            # Verificar se são parciais (updates parciais não alteram items/attachments)
            prev_is_partial = prev.get('IsPartialUpdate', 0) == 1
            curr_is_partial = curr.get('IsPartialUpdate', 0) == 1
            
            # Verificar mudança de posição
            pos_changed = (abs((prev.get('PositionX') or 0) - (curr.get('PositionX') or 0)) > pos_threshold or
                          abs((prev.get('PositionY') or 0) - (curr.get('PositionY') or 0)) > pos_threshold or
                          abs((prev.get('PositionZ') or 0) - (curr.get('PositionZ') or 0)) > pos_threshold)
            
            # Verificar mudança de status
            status_changed = (prev.get('IsDestroyed') or 0) != (curr.get('IsDestroyed') or 0)
            
            # Verificar mudança de saúde
            health_changed = False
            if prev.get('EngineHealth') is not None and curr.get('EngineHealth') is not None:
                if abs(prev['EngineHealth'] - curr['EngineHealth']) > health_threshold:
                    health_changed = True
            elif prev.get('EngineHealth') != curr.get('EngineHealth'):
                health_changed = True
            
            if not health_changed and prev.get('BodyHealth') is not None and curr.get('BodyHealth') is not None:
                if abs(prev['BodyHealth'] - curr['BodyHealth']) > health_threshold:
                    health_changed = True
            elif not health_changed and prev.get('BodyHealth') != curr.get('BodyHealth'):
                health_changed = True
            
            if not health_changed and prev.get('FuelTankHealth') is not None and curr.get('FuelTankHealth') is not None:
                if abs(prev['FuelTankHealth'] - curr['FuelTankHealth']) > health_threshold:
                    health_changed = True
            elif not health_changed and prev.get('FuelTankHealth') != curr.get('FuelTankHealth'):
                health_changed = True
            
            # Verificar mudança em items/attachments (apenas entre snapshots COMPLETOS consecutivos)
            # Regra: items/attachments só são confiáveis em updates completos (IsPartialUpdate = 0)
            items_changed = False
            attachments_changed = False
            
            # Para items/attachments, queremos comparar o snapshot completo atual (curr)
            # com o último snapshot completo anterior na sequência (não necessariamente prev,
            # pois podem existir vários parciais entre dois completos).
            if not curr_is_partial and last_complete_index is not None and last_complete_index != i:
                prev_complete = records[last_complete_index]
                
                # Criar contadores por tipo para items (ignorando ordem)
                prev_items_list = items_map.get(prev_complete['IdVehicleTracking'], [])
                curr_items_list = items_map.get(curr['IdVehicleTracking'], [])
                
                prev_items_count = {}
                for item_type in prev_items_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        prev_items_count[item_type] = prev_items_count.get(item_type, 0) + 1
                
                curr_items_count = {}
                for item_type in curr_items_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        curr_items_count[item_type] = curr_items_count.get(item_type, 0) + 1
                
                # Comparar contadores (ignora ordem, apenas tipos e quantidades)
                if prev_items_count != curr_items_count:
                    items_changed = True
                
                # Criar contadores por tipo para attachments (ignorando ordem)
                prev_attachments_list = attachments_map.get(prev_complete['IdVehicleTracking'], [])
                curr_attachments_list = attachments_map.get(curr['IdVehicleTracking'], [])
                
                prev_attachments_count = {}
                for attachment_type in prev_attachments_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if attachment_type and attachment_type.strip() and attachment_type != 'empty':
                        prev_attachments_count[attachment_type] = prev_attachments_count.get(attachment_type, 0) + 1
                
                curr_attachments_count = {}
                for attachment_type in curr_attachments_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if attachment_type and attachment_type.strip() and attachment_type != 'empty':
                        curr_attachments_count[attachment_type] = curr_attachments_count.get(attachment_type, 0) + 1
                
                # Comparar contadores (ignora ordem, apenas tipos e quantidades)
                if prev_attachments_count != curr_attachments_count:
                    attachments_changed = True
            
            # Se houve qualquer mudança significativa, incrementar contador
            if pos_changed or status_changed or health_changed or items_changed or attachments_changed:
                change_count += 1
                if pos_changed:
                    change_flags['position'] = True
                if health_changed or status_changed:
                    change_flags['health'] = True
                if items_changed:
                    change_flags['items'] = True
                if attachments_changed:
                    change_flags['attachments'] = True
            
            # Atualizar índice do último snapshot completo
            if not curr_is_partial:
                last_complete_index = i
        
        return change_count, change_flags

def filter_vehicle_history_by_changes(history: List[Dict]) -> List[Dict]:
    """
    Filtra histórico mantendo apenas registros com mudanças significativas.
    
    Regras:
    - Histórico vem em ordem DESC (mais recente primeiro) na entrada.
    - Posição/saúde/status: analisados entre registros consecutivos (ao longo do tempo).
    - Items/attachments: analisados apenas entre snapshots COMPLETOS consecutivos
      (ignorando updates parciais entre eles).
    - Sempre mantém o snapshot mais recente.
    """
    if len(history) <= 1:
        return history

    pos_threshold = 0.1
    health_threshold = 0.05

    n = len(history)
    # Trabalhar em ordem ASC (do mais antigo para o mais recente)
    asc_history = list(reversed(history))
    # Flags de quais índices em ASC devem ser mantidos
    keep_asc = [False] * n

    # Inicializar last_complete_idx com o primeiro registro se ele já for completo
    last_complete_idx = None
    # Tratar o primeiro registro separadamente (i=0 não é processado no loop)
    if len(asc_history) > 0:
        first_record = asc_history[0]
        first_record_is_partial = first_record.get('IsPartialUpdate', 0) == 1
        if not first_record_is_partial:
            last_complete_idx = 0
            # REGRA: Primeiro snapshot completo sempre é mantido (baseline de items/attachments)
            keep_asc[0] = True

    for i in range(1, n):
        prev = asc_history[i - 1]  # mais antigo
        curr = asc_history[i]      # mais recente

        prev_is_partial = prev.get('IsPartialUpdate', 0) == 1
        curr_is_partial = curr.get('IsPartialUpdate', 0) == 1

        # Mudança de posição
        pos_changed = (
            abs((prev.get('PositionX') or 0) - (curr.get('PositionX') or 0)) > pos_threshold or
            abs((prev.get('PositionY') or 0) - (curr.get('PositionY') or 0)) > pos_threshold or
            abs((prev.get('PositionZ') or 0) - (curr.get('PositionZ') or 0)) > pos_threshold
        )

        # Mudança de status
        status_changed = (prev.get('IsDestroyed') or 0) != (curr.get('IsDestroyed') or 0)

        # Mudança de saúde
        health_changed = False
        for health_field in ['EngineHealth', 'BodyHealth', 'FuelTankHealth']:
            prev_val = prev.get(health_field)
            curr_val = curr.get(health_field)
            if prev_val is not None and curr_val is not None:
                if abs(prev_val - curr_val) > health_threshold:
                    health_changed = True
                    break
            elif prev_val != curr_val:
                health_changed = True
                break

        # Mudanças em items/attachments: apenas entre snapshots COMPLETOS consecutivos
        items_changed = False
        attachments_changed = False

        # Se o registro atual é completo, comparar items/attachments
        if not curr_is_partial:
            # Determinar qual registro completo usar para comparação
            prev_complete = None
            
            # Se ambos prev e curr são completos e consecutivos, comparar diretamente
            if not prev_is_partial:
                prev_complete = prev
            # Caso contrário, usar o último snapshot completo conhecido
            elif last_complete_idx is not None and last_complete_idx != i:
                prev_complete = asc_history[last_complete_idx]
            
            # Se temos um registro completo anterior para comparar
            if prev_complete is not None:
                # Items
                prev_items = prev_complete.get('items', [])
                curr_items = curr.get('items', [])

                prev_items_count = {}
                for item in prev_items:
                    item_type = item.get('ItemType') or item.get('type')
                    if item_type and item_type.strip() and item_type != 'empty':
                        prev_items_count[item_type] = prev_items_count.get(item_type, 0) + 1

                curr_items_count = {}
                for item in curr_items:
                    item_type = item.get('ItemType') or item.get('type')
                    if item_type and item_type.strip() and item_type != 'empty':
                        curr_items_count[item_type] = curr_items_count.get(item_type, 0) + 1

                if prev_items_count != curr_items_count:
                    items_changed = True

                # Attachments
                prev_att = prev_complete.get('attachments', [])
                curr_att = curr.get('attachments', [])

                prev_att_count = {}
                for att in prev_att:
                    att_type = att.get('AttachmentType') or att.get('type')
                    if att_type and att_type.strip() and att_type != 'empty':
                        prev_att_count[att_type] = prev_att_count.get(att_type, 0) + 1

                curr_att_count = {}
                for att in curr_att:
                    att_type = att.get('AttachmentType') or att.get('type')
                    if att_type and att_type.strip() and att_type != 'empty':
                        curr_att_count[att_type] = curr_att_count.get(att_type, 0) + 1

                if prev_att_count != curr_att_count:
                    attachments_changed = True
            # REGRA: Se é o primeiro snapshot completo (sem registro anterior para comparar),
            # sempre mantê-lo para estabelecer baseline de items/attachments
            else:
                items_changed = True  # Marcar como mudado para garantir que seja mantido

        # REGRA 2: Parciais são mantidos apenas quando há mudanças de posição/saúde/status
        # (não têm items/attachments para comparar)
        if curr_is_partial:
            if pos_changed or status_changed or health_changed:
                keep_asc[i] = True
        # REGRA 3: Completos são mantidos quando há mudanças de items/attachments
        # (também podem ter mudanças de posição/saúde, mas items/attachments é o critério principal)
        else:
            if items_changed or attachments_changed:
                keep_asc[i] = True
            # Se não houve mudanças de items/attachments, ainda pode ser mantido por outras razões
            # (será mantido pelo snapshot mais recente ou último completo se aplicável)

        # Atualizar último snapshot completo
        if not curr_is_partial:
            last_complete_idx = i

    # REGRA 1: Sempre manter o snapshot mais recente (parcial ou completo)
    # Conforme cenários: o snapshot mais recente sempre deve aparecer no histórico
    most_recent_idx = n - 1
    if most_recent_idx >= 0:
        keep_asc[most_recent_idx] = True
    
    # REGRA 5: Sempre manter o último snapshot completo encontrado,
    # mesmo que não seja o registro mais recente (pode haver parciais depois dele)
    # Isso garante que items/attachments do último snapshot completo estejam disponíveis
    last_complete_snapshot_idx = None
    # Procurar do mais recente para o mais antigo (ordem ASC reversa)
    for i in range(n - 1, -1, -1):
        record = asc_history[i]
        if record and (record.get('IsPartialUpdate', 0) == 0):
            last_complete_snapshot_idx = i
            break
    
    # Garantir que o último snapshot completo seja mantido
    if last_complete_snapshot_idx is not None:
        keep_asc[last_complete_snapshot_idx] = True

    # Opcional: se quiser sempre manter também o mais antigo, descomente:
    # keep_asc[0] = True

    # Reconstruir lista filtrada em ordem DESC original
    filtered = []
    for desc_idx in range(n):
        asc_idx = n - 1 - desc_idx
        if keep_asc[asc_idx]:
            filtered.append(history[desc_idx])

    return filtered

def get_vehicles_paginated(status_filter: str, change_types: Optional[List[str]], date_from: str, date_to: str, 
                          start: int, length: int, search: str = None, 
                          order_by: Tuple[str, str] = None,
                          order_by_change_count: bool = False, order_by_change_count_dir: str = None) -> Tuple[List[Dict], int]:
    """Retorna dados paginados de veículos com busca e filtros"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()
        
        # Verificar colunas disponíveis
        cursor.execute("PRAGMA table_info(vehicles_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_destroyed = 'IsDestroyed' in columns
        
        health_columns = ""
        if 'EngineHealth' in columns:
            health_columns += ", vt.EngineHealth"
        if 'BodyHealth' in columns:
            health_columns += ", vt.BodyHealth"
        if 'FuelTankHealth' in columns:
            health_columns += ", vt.FuelTankHealth"
        
        # Construir condições WHERE
        where_conditions = []
        params = []
        
        # Aplicar filtro de status conforme seleção
        if has_is_destroyed:
            if status_filter == 'active':
                where_conditions.append("(vt.IsDestroyed = 0 OR vt.IsDestroyed IS NULL)")
            elif status_filter == 'destroyed':
                where_conditions.append("(vt.IsDestroyed = 1)")
        
        if date_from:
            where_conditions.append("vt.TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("vt.TimeStamp <= ?")
            params.append(date_to)
        
        if search:
            where_conditions.append("(vt.VehicleId LIKE ? OR vt.VehicleName LIKE ?)")
            search_param = f"%{search}%"
            params.extend([search_param, search_param])
        
        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)
        
        # Query para contar total de registros (sem paginação)
        # Primeiro contar total sem filtros
        cursor.execute("SELECT COUNT(DISTINCT VehicleId) FROM vehicles_tracking")
        total_all = cursor.fetchone()[0]
        
        # Se há filtros, contar com filtros aplicados
        if where_conditions:
            count_query = f"""
                SELECT COUNT(DISTINCT vt.VehicleId)
                FROM vehicles_tracking vt
                INNER JOIN (
                    SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                    FROM vehicles_tracking
                    GROUP BY VehicleId
                ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                {where_clause}
            """
            cursor.execute(count_query, params)
            total_records = cursor.fetchone()[0]
        else:
            total_records = total_all
        
        # Construir ORDER BY padrão (usado quando não ordenado por ChangeCount)
        valid_fields = ['VehicleId', 'VehicleName', 'IsDestroyed', 'TimeStamp']
        if order_by and order_by[0] in valid_fields and not order_by_change_count:
            order_field, order_direction = order_by
            order_direction = 'DESC' if order_direction == 'desc' else 'ASC'
            order_clause = f"ORDER BY vt.{order_field} {order_direction}, vt.VehicleName"
        else:
            order_clause = "ORDER BY vt.TimeStamp DESC, vt.VehicleName"
        
        # Normalizar tipos de alteração selecionados
        selected_change_types = set(change_types or [])
        change_types_active = len(selected_change_types) > 0
        full_scan_required = order_by_change_count or change_types_active
        
        def vehicle_matches_change_types(vehicle: Dict) -> bool:
            if not selected_change_types:
                return True
            flags = vehicle.get('ChangeFlags') or {}
            for change_type in selected_change_types:
                if flags.get(change_type):
                    return True
            return False
        
        # Se for necessário escanear todos os registros (ordenar por ChangeCount ou filtrar por tipo)
        if full_scan_required:
            # Buscar TODOS os dados (sem paginação) para poder ordenar por ChangeCount
            order_clause_all = "ORDER BY vt.TimeStamp DESC, vt.VehicleName" if order_by_change_count else order_clause
            data_query_all = f"""
                SELECT vt.IdVehicleTracking, vt.VehicleId, vt.VehicleName,
                       vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp,
                       IFNULL(vt.IsDestroyed, 0) as IsDestroyed, vt.DestroyedAt{health_columns}
                FROM vehicles_tracking vt
                INNER JOIN (
                    SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                    FROM vehicles_tracking
                    GROUP BY VehicleId
                ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                {where_clause}
                {order_clause_all}
            """
            # Usar apenas os parâmetros de WHERE, sem LIMIT e OFFSET
            # Só passar parâmetros se houver WHERE clause
            if where_clause and params:
                cursor.execute(data_query_all, params)
            else:
                cursor.execute(data_query_all)
            all_data = [dict(row) for row in cursor.fetchall()]
            
            # Calcular ChangeCount para todos
            for vehicle in all_data:
                vehicle_id = vehicle['VehicleId']
                try:
                    change_count, change_flags = count_vehicle_changes(vehicle_id, date_from=date_from, date_to=date_to)
                    vehicle['ChangeCount'] = change_count
                    vehicle['ChangeFlags'] = change_flags
                    vehicle['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
                except Exception:
                    vehicle['ChangeCount'] = 0
                    vehicle['ChangeFlags'] = {
                        'position': False,
                        'health': False,
                        'items': False,
                        'attachments': False
                    }
                    vehicle['ChangeTypesCount'] = 0
            
            # Aplicar filtro de tipos de alteração, se necessário
            if change_types_active:
                all_data = [v for v in all_data if vehicle_matches_change_types(v)]
            
            # Atualizar total_records para refletir todos os veículos filtrados
            total_records = len(all_data)
            
            # Ordenar por ChangeCount em memória quando solicitado
            if order_by_change_count:
                reverse_order = (order_by_change_count_dir == 'desc')
                all_data.sort(key=lambda x: x.get('ChangeCount', 0), reverse=reverse_order)
            else:
                # Garantir ordenação consistente (já vem ordenado pela query)
                pass
            
            # Aplicar paginação após ordenação
            data = all_data
        else:
            # Query para dados paginados
            data_query = f"""
                SELECT vt.IdVehicleTracking, vt.VehicleId, vt.VehicleName,
                       vt.PositionX, vt.PositionY, vt.PositionZ, vt.TimeStamp,
                       IFNULL(vt.IsDestroyed, 0) as IsDestroyed, vt.DestroyedAt{health_columns}
                FROM vehicles_tracking vt
                INNER JOIN (
                    SELECT VehicleId, MAX(TimeStamp) as MaxTimeStamp
                    FROM vehicles_tracking
                    GROUP BY VehicleId
                ) AS latest_vt ON vt.VehicleId = latest_vt.VehicleId AND vt.TimeStamp = latest_vt.MaxTimeStamp
                {where_clause}
                {order_clause}
                LIMIT ? OFFSET ?
            """
            
            # Adicionar LIMIT e OFFSET aos parâmetros
            query_params = list(params) + [length, start]
            cursor.execute(data_query, query_params)
            data = [dict(row) for row in cursor.fetchall()]
            
            # Adicionar contagem de alterações para cada veículo
            # Otimização: calcular em batch para melhor performance
            for vehicle in data:
                vehicle_id = vehicle['VehicleId']
                try:
                    change_count, change_flags = count_vehicle_changes(vehicle_id, date_from=date_from, date_to=date_to)
                    vehicle['ChangeCount'] = change_count
                    vehicle['ChangeFlags'] = change_flags
                    vehicle['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
                except Exception:
                    vehicle['ChangeCount'] = 0
                    vehicle['ChangeFlags'] = {
                        'position': False,
                        'health': False,
                        'items': False,
                        'attachments': False
                    }
                    vehicle['ChangeTypesCount'] = 0
        
        # Se filtro de tipos estiver ativo e não for necessário full scan (caso raro), aplicar aqui
        if change_types_active and not full_scan_required:
            data = [v for v in data if vehicle_matches_change_types(v)]
            total_records = len(data)
        
        # Ordenação extra: garantir que, por padrão, veículos sejam ordenados
        # por Última Atualização (TimeStamp DESC) e, em seguida,
        # pela quantidade de tipos de alterações (ChangeTypesCount DESC).
        # Isso é aplicado na página atual, após cálculo de flags/contagens.
        try:
            data.sort(
                key=lambda v: (
                    v.get('TimeStamp') or '',
                    v.get('ChangeTypesCount') or 0
                ),
                reverse=True
            )
        except Exception:
            pass
        
        return data, total_records

def get_container_history(container_id: str, limit: int = 100, offset: int = 0, 
                         date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna histórico de um container com suporte a filtros de data e paginação"""
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        
        # Construir WHERE clause com filtros de data
        where_conditions = ["ContainerId = ?"]
        params = [container_id]
        
        if date_from:
            where_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = "WHERE " + " AND ".join(where_conditions)
        
        # Verificar se coluna IsPartialUpdate existe
        cursor.execute("PRAGMA table_info(containers_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_partial_update = 'IsPartialUpdate' in columns
        partial_column = ", IFNULL(IsPartialUpdate, 0) as IsPartialUpdate" if has_is_partial_update else ", 0 as IsPartialUpdate"
        
        query = f"""
            SELECT IdContainerTracking, ContainerId, ContainerName,
                   PositionX, PositionY, PositionZ, TimeStamp,
                   IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt{partial_column}
            FROM containers_tracking
            {where_clause}
            ORDER BY TimeStamp DESC
            LIMIT ? OFFSET ?
        """
        
        params.extend([limit, offset])
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_container_tracking_items(tracking_id: int) -> List[Dict]:
    """Retorna items de um registro específico de tracking de container"""
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT IdContainerItemTracking, ItemType, ItemHealth, TimeStamp
            FROM container_items_tracking
            WHERE ContainerTrackingId = ?
            ORDER BY ItemType
        """, (tracking_id,))
        return [dict(row) for row in cursor.fetchall()]

def count_container_changes(container_id: str, date_from: str = None, date_to: str = None) -> Tuple[int, Dict[str, bool]]:
    """Conta o número de alterações significativas no histórico de um container e retorna flags por tipo"""
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        
        # Buscar histórico ordenado por timestamp (limitar a últimos 500 registros para performance)
        history_conditions = ["ContainerId = ?"]
        params = [container_id]
        
        if date_from:
            history_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            history_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = " AND ".join(history_conditions)
        
        # Verificar se coluna IsPartialUpdate existe
        cursor.execute("PRAGMA table_info(containers_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_partial_update = 'IsPartialUpdate' in columns
        partial_column = ", IFNULL(IsPartialUpdate, 0) as IsPartialUpdate" if has_is_partial_update else ", 0 as IsPartialUpdate"
        
        baseline_record = None
        if date_from:
            baseline_query = f"""
                SELECT IdContainerTracking, PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed{partial_column}
                FROM containers_tracking
                WHERE ContainerId = ?
                  AND TimeStamp < ?
                ORDER BY TimeStamp DESC
                LIMIT 1
            """
            cursor.execute(baseline_query, (container_id, date_from))
            baseline_row = cursor.fetchone()
            if baseline_row:
                baseline_record = dict(baseline_row)
        
        base_query = f"""
            SELECT IdContainerTracking, PositionX, PositionY, PositionZ, TimeStamp,
                   IFNULL(IsDestroyed, 0) as IsDestroyed{partial_column}
            FROM containers_tracking
            WHERE {where_clause}
            ORDER BY TimeStamp DESC
            LIMIT {{limit}}
        """
        
        # Buscar mais registros caso haja poucos snapshots completos devido a muitos updates parciais
        records = []
        limit = 500
        max_limit = 5000
        while True:
            cursor.execute(base_query.format(limit=limit), params)
            fetched_rows = [dict(row) for row in cursor.fetchall()]
            records = list(reversed(fetched_rows))
            
            if baseline_record:
                # Inserir snapshot imediatamente anterior à janela para garantir comparação correta
                if not records or records[0]['IdContainerTracking'] != baseline_record['IdContainerTracking']:
                    records.insert(0, baseline_record)
            
            complete_count = sum(1 for r in records if r.get('IsPartialUpdate', 0) == 0)
            if complete_count >= 2 or len(records) < limit or limit >= max_limit:
                break
            limit = min(limit * 2, max_limit)
        
        # Log de debug
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"count_container_changes - ContainerId: {container_id}, records encontrados: {len(records)}, date_from: {date_from}, date_to: {date_to}")
        
        if len(records) <= 1:
            logger.debug(f"count_container_changes - ContainerId: {container_id}, retornando 0 (menos de 2 registros)")
            return 0, {
                'position': False,
                'items': False,
                'status': False
            }
        
        # Carregar todos os items de uma vez (otimização)
        tracking_ids = [r['IdContainerTracking'] for r in records]
        items_map = {}
        
        if tracking_ids:
            placeholders = ','.join(['?'] * len(tracking_ids))
            
            # Carregar items (filtrar apenas tipos válidos, não nulos e não vazios)
            try:
                cursor.execute(f"""
                    SELECT ContainerTrackingId, ItemType
                    FROM container_items_tracking
                    WHERE ContainerTrackingId IN ({placeholders})
                    AND ItemType IS NOT NULL
                    AND ItemType != ''
                    AND ItemType != 'empty'
                """, tracking_ids)
                for row in cursor.fetchall():
                    tracking_id = row[0]
                    item_type = row[1]
                    # Validar novamente no código (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        if tracking_id not in items_map:
                            items_map[tracking_id] = []
                        items_map[tracking_id].append(item_type)
            except:
                pass
        
        change_count = 0
        pos_threshold = 0.1
        change_flags = {
            'position': False,
            'items': False,
            'status': False
        }
        
        # Comparar registros consecutivos para posição/status
        # e comparar apenas snapshots COMPLETOS consecutivos para items
        # Inicializar last_complete_index com o primeiro registro se ele já for completo
        last_complete_index = None
        if len(records) > 0:
            first_record_is_partial = records[0].get('IsPartialUpdate', 0) == 1
            if not first_record_is_partial:
                last_complete_index = 0
        
        for i in range(1, len(records)):
            prev = records[i - 1]
            curr = records[i]
            
            # Verificar se são parciais (updates parciais não alteram items)
            prev_is_partial = prev.get('IsPartialUpdate', 0) == 1
            curr_is_partial = curr.get('IsPartialUpdate', 0) == 1
            
            # Verificar mudança de posição
            pos_changed = (abs((prev.get('PositionX') or 0) - (curr.get('PositionX') or 0)) > pos_threshold or
                          abs((prev.get('PositionY') or 0) - (curr.get('PositionY') or 0)) > pos_threshold or
                          abs((prev.get('PositionZ') or 0) - (curr.get('PositionZ') or 0)) > pos_threshold)
            
            # Verificar mudança de status
            # Validar transições: ignorar mudanças inválidas (destruído → ativo)
            # Containers destruídos não podem ser restaurados
            prev_destroyed = (prev.get('IsDestroyed') or 0)
            curr_destroyed = (curr.get('IsDestroyed') or 0)
            if prev_destroyed == 1 and curr_destroyed == 0:
                # Transição inválida: destruído → ativo (ignorar)
                status_changed = False
            else:
                # Transição válida ou sem mudança
                status_changed = prev_destroyed != curr_destroyed
            
            # Verificar mudança em items (apenas entre snapshots COMPLETOS consecutivos)
            # Regra: items só são confiáveis em updates completos (IsPartialUpdate = 0)
            items_changed = False
            
            # Para items, queremos comparar o snapshot completo atual (curr)
            # com o último snapshot completo anterior na sequência (não necessariamente prev,
            # pois podem existir vários parciais entre dois completos).
            if not curr_is_partial and last_complete_index is not None and last_complete_index != i:
                prev_complete = records[last_complete_index]
                
                # Criar contadores por tipo para items (ignorando ordem)
                prev_items_list = items_map.get(prev_complete['IdContainerTracking'], [])
                curr_items_list = items_map.get(curr['IdContainerTracking'], [])
                
                prev_items_count = {}
                for item_type in prev_items_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        prev_items_count[item_type] = prev_items_count.get(item_type, 0) + 1
                
                curr_items_count = {}
                for item_type in curr_items_list:
                    # Filtrar tipos inválidos (segurança extra)
                    if item_type and item_type.strip() and item_type != 'empty':
                        curr_items_count[item_type] = curr_items_count.get(item_type, 0) + 1
                
                # Comparar contadores (ignora ordem, apenas tipos e quantidades)
                if prev_items_count != curr_items_count:
                    items_changed = True
            
            # Se houve qualquer mudança significativa, incrementar contador
            if pos_changed or status_changed or items_changed:
                change_count += 1
                if pos_changed:
                    change_flags['position'] = True
                if status_changed:
                    change_flags['status'] = True
                if items_changed:
                    change_flags['items'] = True
                logger.debug(f"count_container_changes - ContainerId: {container_id}, mudança detectada no registro {i}: pos_changed={pos_changed}, status_changed={status_changed}, items_changed={items_changed}")
            
            # Atualizar índice do último snapshot completo
            if not curr_is_partial:
                last_complete_index = i
        
        logger.debug(f"count_container_changes - ContainerId: {container_id}, change_count final: {change_count}, change_flags: {change_flags}")
        return change_count, change_flags

def filter_container_history_by_changes(history: List[Dict]) -> List[Dict]:
    """
    Filtra histórico mantendo apenas registros com mudanças significativas.
    
    Regras:
    - Histórico vem em ordem DESC (mais recente primeiro) na entrada.
    - Posição/status: analisados entre registros consecutivos (ao longo do tempo).
    - Items: analisados apenas entre snapshots COMPLETOS consecutivos
      (ignorando updates parciais entre eles).
    - Sempre mantém o snapshot mais recente.
    """
    if len(history) <= 1:
        return history

    pos_threshold = 0.1

    n = len(history)
    # Trabalhar em ordem ASC (do mais antigo para o mais recente)
    asc_history = list(reversed(history))
    # Flags de quais índices em ASC devem ser mantidos
    keep_asc = [False] * n

    # Inicializar last_complete_idx com o primeiro registro se ele já for completo
    last_complete_idx = None
    # Tratar o primeiro registro separadamente (i=0 não é processado no loop)
    if len(asc_history) > 0:
        first_record = asc_history[0]
        first_record_is_partial = first_record.get('IsPartialUpdate', 0) == 1
        if not first_record_is_partial:
            last_complete_idx = 0
            # REGRA: Primeiro snapshot completo sempre é mantido (baseline de items)
            keep_asc[0] = True

    for i in range(1, n):
        prev = asc_history[i - 1]  # mais antigo
        curr = asc_history[i]      # mais recente

        prev_is_partial = prev.get('IsPartialUpdate', 0) == 1
        curr_is_partial = curr.get('IsPartialUpdate', 0) == 1

        # Mudança de posição
        pos_changed = (
            abs((prev.get('PositionX') or 0) - (curr.get('PositionX') or 0)) > pos_threshold or
            abs((prev.get('PositionY') or 0) - (curr.get('PositionY') or 0)) > pos_threshold or
            abs((prev.get('PositionZ') or 0) - (curr.get('PositionZ') or 0)) > pos_threshold
        )

        # Mudança de status
        # Validar transições: ignorar mudanças inválidas (destruído → ativo)
        # Containers destruídos não podem ser restaurados
        prev_destroyed = (prev.get('IsDestroyed') or 0)
        curr_destroyed = (curr.get('IsDestroyed') or 0)
        if prev_destroyed == 1 and curr_destroyed == 0:
            # Transição inválida: destruído → ativo (ignorar)
            status_changed = False
        else:
            # Transição válida ou sem mudança
            status_changed = prev_destroyed != curr_destroyed

        # Mudanças em items: apenas entre snapshots COMPLETOS consecutivos
        items_changed = False

        # Se o registro atual é completo, comparar items
        if not curr_is_partial:
            # Determinar qual registro completo usar para comparação
            prev_complete = None
            
            # Se ambos prev e curr são completos e consecutivos, comparar diretamente
            if not prev_is_partial:
                prev_complete = prev
            # Caso contrário, usar o último snapshot completo conhecido
            elif last_complete_idx is not None and last_complete_idx != i:
                prev_complete = asc_history[last_complete_idx]
            
            # Se temos um registro completo anterior para comparar
            if prev_complete is not None:
                # Items
                prev_items = prev_complete.get('items', [])
                curr_items = curr.get('items', [])

                prev_items_count = {}
                for item in prev_items:
                    item_type = item.get('ItemType') or item.get('type')
                    if item_type and item_type.strip() and item_type != 'empty':
                        prev_items_count[item_type] = prev_items_count.get(item_type, 0) + 1

                curr_items_count = {}
                for item in curr_items:
                    item_type = item.get('ItemType') or item.get('type')
                    if item_type and item_type.strip() and item_type != 'empty':
                        curr_items_count[item_type] = curr_items_count.get(item_type, 0) + 1

                if prev_items_count != curr_items_count:
                    items_changed = True
            # REGRA: Se é o primeiro snapshot completo (sem registro anterior para comparar),
            # sempre mantê-lo para estabelecer baseline de items
            else:
                items_changed = True  # Marcar como mudado para garantir que seja mantido

        # REGRA 2: Parciais são mantidos apenas quando há mudanças de posição/status
        # (não têm items para comparar)
        if curr_is_partial:
            if pos_changed or status_changed:
                keep_asc[i] = True
        # REGRA 3: Completos são mantidos quando há mudanças de items
        # (também podem ter mudanças de posição, mas items é o critério principal)
        else:
            if items_changed:
                keep_asc[i] = True
            # Se não houve mudanças de items, ainda pode ser mantido por outras razões
            # (será mantido pelo snapshot mais recente ou último completo se aplicável)

        # Atualizar último snapshot completo
        if not curr_is_partial:
            last_complete_idx = i

    # REGRA 1: Sempre manter o snapshot mais recente (parcial ou completo)
    # Conforme cenários: o snapshot mais recente sempre deve aparecer no histórico
    most_recent_idx = n - 1
    if most_recent_idx >= 0:
        keep_asc[most_recent_idx] = True
    
    # REGRA 5: Sempre manter o último snapshot completo encontrado,
    # mesmo que não seja o registro mais recente (pode haver parciais depois dele)
    # Isso garante que items do último snapshot completo estejam disponíveis
    last_complete_snapshot_idx = None
    # Procurar do mais recente para o mais antigo (ordem ASC reversa)
    for i in range(n - 1, -1, -1):
        record = asc_history[i]
        if record and (record.get('IsPartialUpdate', 0) == 0):
            last_complete_snapshot_idx = i
            break
    
    # Garantir que o último snapshot completo seja mantido
    if last_complete_snapshot_idx is not None:
        keep_asc[last_complete_snapshot_idx] = True

    # Opcional: se quiser sempre manter também o mais antigo, descomente:
    # keep_asc[0] = True

    # Reconstruir lista filtrada em ordem DESC original
    filtered = []
    for desc_idx in range(n):
        asc_idx = n - 1 - desc_idx
        if keep_asc[asc_idx]:
            filtered.append(history[desc_idx])

    return filtered

def get_containers_paginated(status_filter: str, change_types: Optional[List[str]], date_from: str, date_to: str, 
                             start: int, length: int, search: str = None, 
                             order_by: Tuple[str, str] = None,
                             order_by_change_count: bool = False, order_by_change_count_dir: str = None) -> Tuple[List[Dict], int]:
    """Retorna dados paginados de containers com busca e filtros"""
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        
        # Verificar colunas disponíveis
        cursor.execute("PRAGMA table_info(containers_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_destroyed = 'IsDestroyed' in columns
        
        # Construir condições WHERE
        where_conditions = []
        params = []
        
        # Aplicar filtro de status conforme seleção
        if has_is_destroyed:
            if status_filter == 'active':
                where_conditions.append("(ct.IsDestroyed = 0 OR ct.IsDestroyed IS NULL)")
            elif status_filter == 'destroyed':
                where_conditions.append("(ct.IsDestroyed = 1)")
        
        if date_from:
            where_conditions.append("ct.TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("ct.TimeStamp <= ?")
            params.append(date_to)
        
        if search:
            where_conditions.append("(ct.ContainerId LIKE ? OR ct.ContainerName LIKE ?)")
            search_param = f"%{search}%"
            params.extend([search_param, search_param])
        
        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)
        
        # Log de debug
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"get_containers_paginated - status_filter: {status_filter}, date_from: {date_from}, date_to: {date_to}, where_conditions: {where_conditions}")
        
        # Query para contar total de registros (sem paginação)
        # Primeiro contar total sem filtros
        cursor.execute("SELECT COUNT(DISTINCT ContainerId) FROM containers_tracking")
        total_all = cursor.fetchone()[0]
        logger.debug(f"get_containers_paginated - total_all (sem filtros): {total_all}")
        
        # Se há filtros, contar com filtros aplicados
        if where_conditions:
            count_query = f"""
                SELECT COUNT(DISTINCT ct.ContainerId)
                FROM containers_tracking ct
                INNER JOIN (
                    SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                    FROM containers_tracking
                    GROUP BY ContainerId
                ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                {where_clause}
            """
            cursor.execute(count_query, params)
            total_records = cursor.fetchone()[0]
            logger.debug(f"get_containers_paginated - total_records (com filtros): {total_records}")
        else:
            total_records = total_all
        
        # Construir ORDER BY padrão (usado quando não ordenado por ChangeCount)
        valid_fields = ['ContainerId', 'ContainerName', 'IsDestroyed', 'TimeStamp']
        if order_by and order_by[0] in valid_fields and not order_by_change_count:
            order_field, order_direction = order_by
            order_direction = 'DESC' if order_direction == 'desc' else 'ASC'
            order_clause = f"ORDER BY ct.{order_field} {order_direction}, ct.ContainerName"
        else:
            order_clause = "ORDER BY ct.TimeStamp DESC, ct.ContainerName"
        
        # Normalizar tipos de alteração selecionados
        selected_change_types = set(change_types or [])
        change_types_active = len(selected_change_types) > 0
        # Sempre fazer full scan quando há filtro de data para garantir ordenação correta
        full_scan_required = order_by_change_count or change_types_active or (date_from is not None or date_to is not None)
        
        def container_matches_change_types(container: Dict) -> bool:
            if not selected_change_types:
                return True
            flags = container.get('ChangeFlags') or {}
            for change_type in selected_change_types:
                if flags.get(change_type):
                    return True
            return False
        
        # Se for necessário escanear todos os registros (ordenar por ChangeCount ou filtrar por tipo)
        def sort_by_timestamp_and_changes(items):
            try:
                # Priorizar ChangeTypesCount primeiro, depois TimeStamp
                items.sort(
                    key=lambda c: (
                        c.get('ChangeTypesCount') or 0,
                        c.get('TimeStamp') or ''
                    ),
                    reverse=True
                )
            except Exception as e:
                logger.warning(f"get_containers_paginated - Erro ao ordenar lista padrão: {e}")

        if full_scan_required:
            # Buscar TODOS os dados (sem paginação) para poder ordenar por ChangeCount
            order_clause_all = "ORDER BY ct.TimeStamp DESC, ct.ContainerName" if order_by_change_count else order_clause
            data_query_all = f"""
                SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName,
                       ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp,
                       IFNULL(ct.IsDestroyed, 0) as IsDestroyed, ct.DestroyedAt
                FROM containers_tracking ct
                INNER JOIN (
                    SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                    FROM containers_tracking
                    GROUP BY ContainerId
                ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                {where_clause}
                {order_clause_all}
            """
            # Usar apenas os parâmetros de WHERE, sem LIMIT e OFFSET
            # Só passar parâmetros se houver WHERE clause
            if where_clause and params:
                cursor.execute(data_query_all, params)
            else:
                cursor.execute(data_query_all)
            all_data = [dict(row) for row in cursor.fetchall()]
            logger.debug(f"get_containers_paginated - dados retornados da query (com full_scan): {len(all_data)}")
            
            # Calcular ChangeCount para todos
            for container in all_data:
                container_id = container['ContainerId']
                try:
                    change_count, change_flags = count_container_changes(container_id, date_from=date_from, date_to=date_to)
                    container['ChangeCount'] = change_count
                    container['ChangeFlags'] = change_flags
                    container['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
                except Exception:
                    container['ChangeCount'] = 0
                    container['ChangeFlags'] = {
                        'position': False,
                        'items': False,
                        'status': False
                    }
                    container['ChangeTypesCount'] = 0
            
            # Aplicar filtro de tipos de alteração, se necessário
            if change_types_active:
                all_data = [c for c in all_data if container_matches_change_types(c)]
            
            # Atualizar total_records para refletir todos os containers filtrados
            total_records = len(all_data)
            
            # Ordenar por ChangeCount em memória quando solicitado
            if order_by_change_count:
                reverse_order = (order_by_change_count_dir == 'desc')
                all_data.sort(key=lambda x: x.get('ChangeCount', 0), reverse=reverse_order)
            else:
                sort_by_timestamp_and_changes(all_data)
            
            # Aplicar paginação após ordenação
            data = all_data[start:start + length]
        else:
            # Query para dados paginados
            data_query = f"""
                SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName,
                       ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp,
                       IFNULL(ct.IsDestroyed, 0) as IsDestroyed, ct.DestroyedAt
                FROM containers_tracking ct
                INNER JOIN (
                    SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                    FROM containers_tracking
                    GROUP BY ContainerId
                ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                {where_clause}
                {order_clause}
                LIMIT ? OFFSET ?
            """
            
            # Adicionar LIMIT e OFFSET aos parâmetros
            query_params = list(params) + [length, start]
            cursor.execute(data_query, query_params)
            data = [dict(row) for row in cursor.fetchall()]
            logger.debug(f"get_containers_paginated - dados retornados da query (sem full_scan): {len(data)}")
            
            # Adicionar contagem de alterações para cada container
            # Otimização: calcular em batch para melhor performance
            for container in data:
                container_id = container['ContainerId']
                try:
                    change_count, change_flags = count_container_changes(container_id, date_from=date_from, date_to=date_to)
                    container['ChangeCount'] = change_count
                    container['ChangeFlags'] = change_flags
                    container['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
                except Exception:
                    container['ChangeCount'] = 0
                    container['ChangeFlags'] = {
                        'position': False,
                        'items': False,
                        'status': False
                    }
                    container['ChangeTypesCount'] = 0
        
        # Se filtro de tipos estiver ativo e não for necessário full scan (caso raro), aplicar aqui
        if change_types_active and not full_scan_required:
            data = [c for c in data if container_matches_change_types(c)]
            total_records = len(data)
        
        # Ordenação extra: garantir que, por padrão, containers sejam ordenados
        # primeiro pela quantidade de tipos de alterações (ChangeTypesCount DESC) e, em seguida,
        # por Última Atualização (TimeStamp DESC).
        # Isso é aplicado na página atual, após cálculo de flags/contagens.
            sort_by_timestamp_and_changes(data)
            data = data[start:start + length]
        
        logger.debug(f"get_containers_paginated - retornando {len(data)} containers, total_records: {total_records}")
        if len(data) > 0:
            logger.debug(f"get_containers_paginated - Primeiro container: ContainerId={data[0].get('ContainerId')}, ContainerName={data[0].get('ContainerName')}, ChangeCount={data[0].get('ChangeCount')}")
        
        return data, total_records


def get_active_vehicle_name_counts() -> Dict[str, int]:
    """Agrupa veículos ativos (não destruídos) por nome exibido"""
    with DatabaseConnection(config.DB_VEHICLES) as conn:
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(vehicles_tracking)")
        columns = [row[1] for row in cursor.fetchall()]
        has_is_destroyed = 'IsDestroyed' in columns

        base_query = """
            SELECT vt.VehicleName, COUNT(*) AS Total
            FROM vehicles_tracking vt
            INNER JOIN (
                SELECT VehicleId, MAX(TimeStamp) AS MaxTimeStamp
                FROM vehicles_tracking
                GROUP BY VehicleId
            ) latest ON vt.VehicleId = latest.VehicleId AND vt.TimeStamp = latest.MaxTimeStamp
        """

        if has_is_destroyed:
            base_query += " WHERE IFNULL(vt.IsDestroyed, 0) = 0"

        base_query += " GROUP BY vt.VehicleName"

        cursor.execute(base_query)
        rows = cursor.fetchall()
        return {row['VehicleName']: row['Total'] for row in rows}

def get_containers_last_position(include_destroyed: bool = False) -> List[Dict]:
    """Retorna containers do último timestamp de rastreamento com seus items"""
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        
        # Verificar se colunas IsDestroyed e IsPartialUpdate existem (migração) - usar cache
        try:
            columns = get_table_columns(config.DB_CONTAINERS, 'containers_tracking')
            has_is_destroyed = 'IsDestroyed' in columns
            has_is_partial_update = 'IsPartialUpdate' in columns
        except:
            has_is_destroyed = False
            has_is_partial_update = False
        
        partial_column = ", IFNULL(ct.IsPartialUpdate, 0) as IsPartialUpdate" if has_is_partial_update else ", 0 as IsPartialUpdate"
        
        if has_is_destroyed and not include_destroyed:
            cursor.execute(f"""
                SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName, 
                       ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp,
                       0 as IsDestroyed, NULL as DestroyedAt{partial_column}
                FROM containers_tracking ct
                INNER JOIN (
                    SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                    FROM containers_tracking
                    WHERE IsDestroyed = 0 OR IsDestroyed IS NULL
                    GROUP BY ContainerId
                ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                WHERE ct.IsDestroyed = 0 OR ct.IsDestroyed IS NULL
                ORDER BY ct.ContainerName
            """)
        else:
            if has_is_destroyed:
                cursor.execute(f"""
                    SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName, 
                           ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp,
                           IFNULL(ct.IsDestroyed, 0) as IsDestroyed, ct.DestroyedAt{partial_column}
                    FROM containers_tracking ct
                    INNER JOIN (
                        SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                        FROM containers_tracking
                        GROUP BY ContainerId
                    ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                    ORDER BY ct.ContainerName
                """)
            else:
                cursor.execute(f"""
                    SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName, 
                           ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp,
                           0 as IsDestroyed, NULL as DestroyedAt{partial_column}
                    FROM containers_tracking ct
                    INNER JOIN (
                        SELECT ContainerId, MAX(TimeStamp) as MaxTimeStamp
                        FROM containers_tracking
                        GROUP BY ContainerId
                    ) AS latest_ct ON ct.ContainerId = latest_ct.ContainerId AND ct.TimeStamp = latest_ct.MaxTimeStamp
                    ORDER BY ct.ContainerName
                """)
        containers = [dict(row) for row in cursor.fetchall()]
        
        if not containers:
            return containers
        
        # Preparar estrutura para batch queries
        container_items_map = {}  # tracking_id -> lista de items
        container_ids_needing_complete_snapshot = []
        container_complete_snapshot_map = {}  # container_id -> (tracking_id, timestamp)
        
        # Primeira passada: identificar quais containers precisam de snapshot completo
        for container in containers:
            container_db_id = container['ContainerId']
            latest_timestamp = container['TimeStamp']
            latest_is_partial = container.get('IsPartialUpdate', 0) == 1
            
            # coordinates_last_update: sempre o último timestamp (parcial ou completo)
            container['coordinates_last_update'] = latest_timestamp
            
            if has_is_partial_update and latest_is_partial:
                # Precisamos buscar último snapshot completo
                container_ids_needing_complete_snapshot.append((container_db_id, latest_timestamp))
                container_complete_snapshot_map[container_db_id] = None  # Será preenchido
            else:
                # Último é completo, usar ele
                container['items_last_update'] = latest_timestamp
                container_items_map[container['IdContainerTracking']] = container
        
        # Batch query para buscar últimos snapshots completos
        if container_ids_needing_complete_snapshot and has_is_partial_update:
            # Para cada container que precisa, buscar snapshot completo
            # SQLite não suporta bem batch para este caso, mas podemos otimizar com UNION
            # Ou fazer queries individuais ainda (mas são menos que antes)
            for container_db_id, latest_timestamp in container_ids_needing_complete_snapshot:
                cursor.execute("""
                    SELECT IdContainerTracking, TimeStamp
                    FROM containers_tracking
                    WHERE ContainerId = ? AND (IsPartialUpdate = 0 OR IsPartialUpdate IS NULL) AND TimeStamp <= ?
                    ORDER BY TimeStamp DESC
                    LIMIT 1
                """, (container_db_id, latest_timestamp))
                complete_record = cursor.fetchone()
                if complete_record:
                    complete_tracking_id = dict(complete_record)['IdContainerTracking']
                    complete_timestamp = dict(complete_record)['TimeStamp']
                    container_complete_snapshot_map[container_db_id] = (complete_tracking_id, complete_timestamp)
                else:
                    container_complete_snapshot_map[container_db_id] = None
        
        # Segunda passada: atualizar containers com informações de snapshot completo
        tracking_ids_to_fetch = []
        for container in containers:
            container_db_id = container['ContainerId']
            if container_db_id in container_complete_snapshot_map:
                snapshot_info = container_complete_snapshot_map[container_db_id]
                if snapshot_info:
                    tracking_id, timestamp = snapshot_info
                    container['items_last_update'] = timestamp
                    tracking_ids_to_fetch.append(tracking_id)
                else:
                    # Não há snapshot completo, usar o atual mesmo sendo parcial
                    container['items_last_update'] = None
                    tracking_ids_to_fetch.append(container['IdContainerTracking'])
            else:
                # Container já tem snapshot completo
                tracking_ids_to_fetch.append(container['IdContainerTracking'])
                container_items_map[container['IdContainerTracking']] = container
        
        # Batch query para buscar todos os items de uma vez
        if tracking_ids_to_fetch:
            placeholders = ','.join(['?'] * len(tracking_ids_to_fetch))
            cursor.execute(f"""
                SELECT ContainerTrackingId, ItemType, ItemHealth, TimeStamp
                FROM container_items_tracking
                WHERE ContainerTrackingId IN ({placeholders})
                ORDER BY ContainerTrackingId, TimeStamp
            """, tracking_ids_to_fetch)
            
            # Agrupar items por tracking_id
            items_by_tracking = {}
            for row in cursor.fetchall():
                tracking_id = row[0]
                if tracking_id not in items_by_tracking:
                    items_by_tracking[tracking_id] = []
                items_by_tracking[tracking_id].append({
                    'ItemType': row[1],
                    'ItemHealth': row[2],
                    'TimeStamp': row[3]
                })
            
            # Atribuir items aos containers
            for i, container in enumerate(containers):
                tracking_id = tracking_ids_to_fetch[i]
                container['items'] = items_by_tracking.get(tracking_id, [])
        else:
            # Nenhum container tem items
            for container in containers:
                container['items'] = []
        
        return containers

def get_container_trail(container_id: str, limit: int = 100, offset: int = 0, date_from: str = None, date_to: str = None, filter_by_items_only: bool = False) -> tuple:
    """
    Retorna histórico de posições e items de um container com filtros
    Retorna: (trail, total_count)
    
    Args:
        filter_by_items_only: Se True, filtra apenas por mudanças nos itens (ignora mudanças de posição).
                              Se False, filtra por mudanças em posição E itens (comportamento original para trail).
    """
    with DatabaseConnection(config.DB_CONTAINERS) as conn:
        cursor = conn.cursor()
        
        # Query base com filtros de data
        where_clauses = ["ct.ContainerId = ?"]
        params = [container_id]
        
        if date_from:
            where_clauses.append("ct.TimeStamp >= ?")
            params.append(date_from)
        if date_to:
            where_clauses.append("ct.TimeStamp <= ?")
            params.append(date_to)
        
        where_sql = " AND ".join(where_clauses)
        
        # Contar total (antes de filtrar duplicados)
        cursor.execute(f"""
            SELECT COUNT(DISTINCT ct.IdContainerTracking)
            FROM containers_tracking ct
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()[0]
        
        # Buscar todos os registros ordenados
        cursor.execute(f"""
            SELECT ct.IdContainerTracking, ct.ContainerId, ct.ContainerName,
                   ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp
            FROM containers_tracking ct
            WHERE {where_sql}
            ORDER BY ct.TimeStamp DESC
        """, params)
        all_containers = [dict(row) for row in cursor.fetchall()]
        
        # Buscar items de todos os containers
        container_ids = [c['IdContainerTracking'] for c in all_containers]
        items_map = {}
        if container_ids:
            placeholders = ','.join(['?'] * len(container_ids))
            cursor.execute(f"""
                SELECT ContainerTrackingId, ItemType, ItemHealth, TimeStamp
                FROM container_items_tracking
                WHERE ContainerTrackingId IN ({placeholders})
                ORDER BY TimeStamp
            """, container_ids)
            for row in cursor.fetchall():
                item = dict(row)
                cid = item['ContainerTrackingId']
                if cid not in items_map:
                    items_map[cid] = []
                items_map[cid].append(item)
        
        # Adicionar items aos containers
        for container in all_containers:
            container['items'] = items_map.get(container['IdContainerTracking'], [])
        
        # Filtrar eventos duplicados
        filtered_containers = []
        prev_state = None
        
        for container in all_containers:
            # Criar hash dos itens
            items_sorted = sorted(container['items'], key=lambda x: (x['ItemType'], x.get('ItemHealth', 0) or 0))
            items_tuple = tuple((item['ItemType'], item.get('ItemHealth')) for item in items_sorted)
            
            if filter_by_items_only:
                # Filtrar apenas por mudanças nos itens (ignorar mudanças de posição)
                # Mudanças de posição são visíveis no "Mostrar Trail", então não precisam aparecer no histórico
                if prev_state is None or prev_state != items_tuple:
                    filtered_containers.append(container)
                    prev_state = items_tuple
            else:
                # Filtrar por mudanças em posição E itens (comportamento original para trail)
                # Isso garante que o trail no mapa mostre todas as posições onde o container esteve
                current_state_key = (
                    round(container['PositionX'], 1),
                    round(container['PositionY'], 1),
                    round(container['PositionZ'], 1),
                    items_tuple
                )
                
                if prev_state is None or prev_state != current_state_key:
                    filtered_containers.append(container)
                    prev_state = current_state_key
        
        # Aplicar paginação após filtrar
        paginated_containers = filtered_containers[offset:offset + limit]
        
        return paginated_containers, len(filtered_containers)

def get_fences_last_position(include_destroyed: bool = False) -> List[Dict]:
    """Retorna fences do último timestamp de rastreamento com detecção de ataques"""
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()
        
        # Verificar se coluna IsDestroyed existe (migração) - usar cache
        try:
            columns = get_table_columns(config.DB_STRUCTURES, 'fences_tracking')
            has_is_destroyed = 'IsDestroyed' in columns
        except:
            has_is_destroyed = False
        
        # Buscar último registro de cada fence usando window functions para melhor performance
        # SQLite 3.45.1 suporta window functions (ROW_NUMBER)
        if has_is_destroyed and not include_destroyed:
            query = """
                SELECT IdFenceTracking, FenceId, FenceName,
                       PositionX, PositionY, PositionZ, TimeStamp,
                       HasBase, LowerPanelBuilt, UpperPanelBuilt,
                       0 as IsDestroyed, NULL as DestroyedAt
                FROM (
                    SELECT IdFenceTracking, FenceId, FenceName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           HasBase, LowerPanelBuilt, UpperPanelBuilt,
                           ROW_NUMBER() OVER (
                               PARTITION BY FenceId 
                               ORDER BY TimeStamp DESC, IdFenceTracking DESC
                           ) as rn
                    FROM fences_tracking
                    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
                ) ranked
                WHERE rn = 1
                ORDER BY FenceName
            """
            cursor.execute(query)
        else:
            if has_is_destroyed:
                query = """
                    SELECT IdFenceTracking, FenceId, FenceName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           HasBase, LowerPanelBuilt, UpperPanelBuilt,
                           IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt
                    FROM (
                        SELECT IdFenceTracking, FenceId, FenceName,
                               PositionX, PositionY, PositionZ, TimeStamp,
                               HasBase, LowerPanelBuilt, UpperPanelBuilt,
                               IsDestroyed, DestroyedAt,
                               ROW_NUMBER() OVER (
                                   PARTITION BY FenceId 
                                   ORDER BY TimeStamp DESC, IdFenceTracking DESC
                               ) as rn
                        FROM fences_tracking
                    ) ranked
                    WHERE rn = 1
                    ORDER BY FenceName
                """
                cursor.execute(query)
            else:
                query = """
                    SELECT IdFenceTracking, FenceId, FenceName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           HasBase, LowerPanelBuilt, UpperPanelBuilt,
                           0 as IsDestroyed, NULL as DestroyedAt
                    FROM (
                        SELECT IdFenceTracking, FenceId, FenceName,
                               PositionX, PositionY, PositionZ, TimeStamp,
                               HasBase, LowerPanelBuilt, UpperPanelBuilt,
                               ROW_NUMBER() OVER (
                                   PARTITION BY FenceId 
                                   ORDER BY TimeStamp DESC, IdFenceTracking DESC
                               ) as rn
                        FROM fences_tracking
                    ) ranked
                    WHERE rn = 1
                    ORDER BY FenceName
                """
                cursor.execute(query)
        
        fences = [dict(row) for row in cursor.fetchall()]
        
        if not fences:
            return fences
        
        # Função auxiliar para normalizar valores booleanos/inteiros para 0 ou 1
        def normalize_bool_value(value):
            """Normaliza valores para 0 ou 1 (inteiro)"""
            if value is None:
                return 0
            if isinstance(value, bool):
                return 1 if value else 0
            if isinstance(value, str):
                return 1 if value.lower() in ('true', '1', 'yes') else 0
            # Para inteiros ou outros tipos numéricos
            return 1 if int(value) == 1 else 0
        
        # Detectar ataques recentes (perda de painel) - OTIMIZADO: batch queries
        # Coletar informações de todos os fences primeiro
        fence_ids = []
        fence_timestamps = {}
        fence_panels = {}
        
        for fence in fences:
            fence_id = fence['FenceId']
            fence_ids.append(fence_id)
            fence_timestamps[fence_id] = fence.get('TimeStamp')
            
            raw_lower = fence.get('LowerPanelBuilt', 0)
            raw_upper = fence.get('UpperPanelBuilt', 0)
            fence_panels[fence_id] = {
                'current_lower': normalize_bool_value(raw_lower),
                'current_upper': normalize_bool_value(raw_upper)
            }
        
        # Buscar último registro onde painéis eram construídos (LowerPanelBuilt=1 OU UpperPanelBuilt=1)
        # para comparar com o estado atual e detectar ataques
        prev_record_by_fence = {}  # fence_id -> row (último registro com painéis construídos)
        
        if fence_ids and any(fence_timestamps.values()):
            if has_is_destroyed and not include_destroyed:
                destroy_condition = "AND (IsDestroyed = 0 OR IsDestroyed IS NULL)"
            else:
                destroy_condition = ""
            
            # Query batch usando IN clause: buscar último registro onde painéis eram 1
            # para cada fence onde o estado atual tem painéis em 0
            placeholders = ','.join(['?'] * len(fence_ids))
            
            # Buscar o último registro onde LowerPanelBuilt=1 OU UpperPanelBuilt=1 para cada fence
            # Isso detecta ataques mesmo se houver múltiplos registros com painéis em 0 após o ataque
            prev_query = f"""
                SELECT ft.FenceId, ft.LowerPanelBuilt, ft.UpperPanelBuilt, ft.TimeStamp, ft.IdFenceTracking,
                       latest.MaxTimeStamp
                FROM fences_tracking ft
                INNER JOIN (
                    SELECT FenceId, MAX(TimeStamp) as MaxTimeStamp
                    FROM fences_tracking
                    WHERE FenceId IN ({placeholders}) {destroy_condition}
                    GROUP BY FenceId
                ) latest ON ft.FenceId = latest.FenceId
                WHERE ft.FenceId IN ({placeholders}) 
                  AND ft.TimeStamp < latest.MaxTimeStamp
                  AND (ft.LowerPanelBuilt = 1 OR ft.UpperPanelBuilt = 1)
                  {destroy_condition}
                ORDER BY ft.FenceId, ft.TimeStamp DESC, ft.IdFenceTracking DESC
            """
            
            # Parâmetros: fence_ids duas vezes (uma para cada IN clause)
            fence_id_params = fence_ids + fence_ids
            
            cursor.execute(prev_query, fence_id_params)
            
            # Processar resultados: para cada fence, pegar apenas o primeiro registro (último com painéis construídos)
            current_fence_id = None
            logger = logging.getLogger(__name__)
            
            all_prev_rows = cursor.fetchall()
            logger.debug(f"Total de registros com painéis construídos encontrados: {len(all_prev_rows)}")
            
            for row in all_prev_rows:
                fence_id = row[0]
                
                if fence_id != current_fence_id:
                    # Novo fence, este é o último registro onde os painéis eram construídos
                    current_fence_id = fence_id
                    if fence_id not in prev_record_by_fence:
                        # Guardar apenas os campos necessários (sem MaxTimeStamp)
                        prev_record_by_fence[fence_id] = (row[0], row[1], row[2], row[3], row[4])
                        logger.debug(f"Fence {fence_id}: Último registro com painéis construídos encontrado - LowerPanelBuilt={row[1]}, UpperPanelBuilt={row[2]}, TimeStamp={row[3]}")
            
            logger.debug(f"Total de fences com registro anterior com painéis construídos: {len(prev_record_by_fence)}")
        
        # Detectar ataques comparando estados atuais com anteriores
        logger = logging.getLogger(__name__)
        for fence in fences:
            fence_id = fence['FenceId']
            current_timestamp = fence_timestamps.get(fence_id)
            
            panels = fence_panels.get(fence_id, {})
            current_lower = panels.get('current_lower', 0)
            current_upper = panels.get('current_upper', 0)
            
            has_recent_attack = False
            
            if current_timestamp:
                # Comparar estado atual com último registro onde painéis eram construídos
                prev_row = prev_record_by_fence.get(fence_id)
                
                if prev_row:
                    # Extrair estados dos painéis do último registro onde eram construídos
                    prev_lower_raw = prev_row[1]  # LowerPanelBuilt está no índice 1
                    prev_upper_raw = prev_row[2]  # UpperPanelBuilt está no índice 2
                    prev_lower = normalize_bool_value(prev_lower_raw)
                    prev_upper = normalize_bool_value(prev_upper_raw)
                    
                    # Detectar ataque: se o estado atual tem painéis em 0 e encontramos um registro anterior
                    # onde os painéis eram 1, então houve ataque
                    # Verificar se houve perda de painéis (estava construído antes e não está mais)
                    lower_attack = (prev_lower == 1 and current_lower == 0)
                    upper_attack = (prev_upper == 1 and current_upper == 0)
                    
                    # Debug: log detalhado para verificar cálculo
                    logger.debug(f"Fence {fence_id}: Comparação - prev_lower_raw={prev_lower_raw} (normalized={prev_lower}), current_lower={current_lower}, prev_upper_raw={prev_upper_raw} (normalized={prev_upper}), current_upper={current_upper}")
                    logger.debug(f"Fence {fence_id}: lower_attack={lower_attack}, upper_attack={upper_attack}")
                    
                    if lower_attack or upper_attack:
                        has_recent_attack = True
                        logger.info(f"Fence {fence_id}: ATAQUE DETECTADO - has_recent_attack=True (painéis foram de 1 para 0)")
                else:
                    # Se não há registro anterior com painéis construídos, não houve ataque recente
                    # (a fence pode nunca ter tido painéis construídos, ou os painéis foram construídos e depois destruídos há muito tempo)
                    logger.debug(f"Fence {fence_id}: Não há registro anterior com painéis construídos para comparação (prev_row is None). Total de registros anteriores: {len(prev_record_by_fence)}")
            else:
                # Debug: log quando não há timestamp atual
                logger.debug(f"Fence {fence_id}: Não há timestamp atual para comparação")
            
            fence['has_recent_attack'] = has_recent_attack
            logger.debug(f"Fence {fence_id}: has_recent_attack final = {has_recent_attack}")
        
        return fences

def get_watchtowers_last_position(include_destroyed: bool = False) -> List[Dict]:
    """Retorna watchtowers do último timestamp de rastreamento"""
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='watchtowers_tracking';")
        if not cursor.fetchone():
            return []

        # Verificar se coluna IsDestroyed existe (migração) - usar cache
        try:
            columns = get_table_columns(config.DB_STRUCTURES, 'watchtowers_tracking')
            has_is_destroyed = 'IsDestroyed' in columns
        except:
            has_is_destroyed = False

        if has_is_destroyed and not include_destroyed:
            query = """
                SELECT WatchtowerTrackingId,
                       WatchtowerId,
                       WatchtowerName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       Level1BaseBuilt,
                       Level2BaseBuilt,
                       Level3BaseBuilt,
                       Level1StairsBuilt,
                       Level2StairsBuilt,
                       HasRoof,
                       Level1Wall1LowerBuilt,
                       Level1Wall1UpperBuilt,
                       Level1Wall2LowerBuilt,
                       Level1Wall2UpperBuilt,
                       Level1Wall3LowerBuilt,
                       Level1Wall3UpperBuilt,
                       Level2Wall1LowerBuilt,
                       Level2Wall1UpperBuilt,
                       Level2Wall2LowerBuilt,
                       Level2Wall2UpperBuilt,
                       Level2Wall3LowerBuilt,
                       Level2Wall3UpperBuilt,
                       Level3Wall1LowerBuilt,
                       Level3Wall1UpperBuilt,
                       Level3Wall2LowerBuilt,
                       Level3Wall2UpperBuilt,
                       Level3Wall3LowerBuilt,
                       Level3Wall3UpperBuilt,
                       0 as IsDestroyed,
                       NULL as DestroyedAt
                FROM (
                    SELECT WatchtowerTrackingId,
                           WatchtowerId,
                           WatchtowerName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           Level1BaseBuilt,
                           Level2BaseBuilt,
                           Level3BaseBuilt,
                           Level1StairsBuilt,
                           Level2StairsBuilt,
                           HasRoof,
                           Level1Wall1LowerBuilt,
                           Level1Wall1UpperBuilt,
                           Level1Wall2LowerBuilt,
                           Level1Wall2UpperBuilt,
                           Level1Wall3LowerBuilt,
                           Level1Wall3UpperBuilt,
                           Level2Wall1LowerBuilt,
                           Level2Wall1UpperBuilt,
                           Level2Wall2LowerBuilt,
                           Level2Wall2UpperBuilt,
                           Level2Wall3LowerBuilt,
                           Level2Wall3UpperBuilt,
                           Level3Wall1LowerBuilt,
                           Level3Wall1UpperBuilt,
                           Level3Wall2LowerBuilt,
                           Level3Wall2UpperBuilt,
                           Level3Wall3LowerBuilt,
                           Level3Wall3UpperBuilt,
                           ROW_NUMBER() OVER (
                               PARTITION BY WatchtowerId 
                               ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                           ) as rn
                    FROM watchtowers_tracking
                    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        elif has_is_destroyed:
            query = """
                SELECT WatchtowerTrackingId,
                       WatchtowerId,
                       WatchtowerName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       Level1BaseBuilt,
                       Level2BaseBuilt,
                       Level3BaseBuilt,
                       Level1StairsBuilt,
                       Level2StairsBuilt,
                       HasRoof,
                       Level1Wall1LowerBuilt,
                       Level1Wall1UpperBuilt,
                       Level1Wall2LowerBuilt,
                       Level1Wall2UpperBuilt,
                       Level1Wall3LowerBuilt,
                       Level1Wall3UpperBuilt,
                       Level2Wall1LowerBuilt,
                       Level2Wall1UpperBuilt,
                       Level2Wall2LowerBuilt,
                       Level2Wall2UpperBuilt,
                       Level2Wall3LowerBuilt,
                       Level2Wall3UpperBuilt,
                       Level3Wall1LowerBuilt,
                       Level3Wall1UpperBuilt,
                       Level3Wall2LowerBuilt,
                       Level3Wall2UpperBuilt,
                       Level3Wall3LowerBuilt,
                       Level3Wall3UpperBuilt,
                       IFNULL(IsDestroyed, 0) as IsDestroyed,
                       DestroyedAt
                FROM (
                    SELECT WatchtowerTrackingId,
                           WatchtowerId,
                           WatchtowerName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           Level1BaseBuilt,
                           Level2BaseBuilt,
                           Level3BaseBuilt,
                           Level1StairsBuilt,
                           Level2StairsBuilt,
                           HasRoof,
                           Level1Wall1LowerBuilt,
                           Level1Wall1UpperBuilt,
                           Level1Wall2LowerBuilt,
                           Level1Wall2UpperBuilt,
                           Level1Wall3LowerBuilt,
                           Level1Wall3UpperBuilt,
                           Level2Wall1LowerBuilt,
                           Level2Wall1UpperBuilt,
                           Level2Wall2LowerBuilt,
                           Level2Wall2UpperBuilt,
                           Level2Wall3LowerBuilt,
                           Level2Wall3UpperBuilt,
                           Level3Wall1LowerBuilt,
                           Level3Wall1UpperBuilt,
                           Level3Wall2LowerBuilt,
                           Level3Wall2UpperBuilt,
                           Level3Wall3LowerBuilt,
                           Level3Wall3UpperBuilt,
                           IsDestroyed,
                           DestroyedAt,
                           ROW_NUMBER() OVER (
                               PARTITION BY WatchtowerId 
                               ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                           ) as rn
                    FROM watchtowers_tracking
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        else:
            query = """
                SELECT WatchtowerTrackingId,
                       WatchtowerId,
                       WatchtowerName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       Level1BaseBuilt,
                       Level2BaseBuilt,
                       Level3BaseBuilt,
                       Level1StairsBuilt,
                       Level2StairsBuilt,
                       HasRoof,
                       Level1Wall1LowerBuilt,
                       Level1Wall1UpperBuilt,
                       Level1Wall2LowerBuilt,
                       Level1Wall2UpperBuilt,
                       Level1Wall3LowerBuilt,
                       Level1Wall3UpperBuilt,
                       Level2Wall1LowerBuilt,
                       Level2Wall1UpperBuilt,
                       Level2Wall2LowerBuilt,
                       Level2Wall2UpperBuilt,
                       Level2Wall3LowerBuilt,
                       Level2Wall3UpperBuilt,
                       Level3Wall1LowerBuilt,
                       Level3Wall1UpperBuilt,
                       Level3Wall2LowerBuilt,
                       Level3Wall2UpperBuilt,
                       Level3Wall3LowerBuilt,
                       Level3Wall3UpperBuilt,
                       0 as IsDestroyed,
                       NULL as DestroyedAt
                FROM (
                    SELECT WatchtowerTrackingId,
                           WatchtowerId,
                           WatchtowerName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           Level1BaseBuilt,
                           Level2BaseBuilt,
                           Level3BaseBuilt,
                           Level1StairsBuilt,
                           Level2StairsBuilt,
                           HasRoof,
                           Level1Wall1LowerBuilt,
                           Level1Wall1UpperBuilt,
                           Level1Wall2LowerBuilt,
                           Level1Wall2UpperBuilt,
                           Level1Wall3LowerBuilt,
                           Level1Wall3UpperBuilt,
                           Level2Wall1LowerBuilt,
                           Level2Wall1UpperBuilt,
                           Level2Wall2LowerBuilt,
                           Level2Wall2UpperBuilt,
                           Level2Wall3LowerBuilt,
                           Level2Wall3UpperBuilt,
                           Level3Wall1LowerBuilt,
                           Level3Wall1UpperBuilt,
                           Level3Wall2LowerBuilt,
                           Level3Wall2UpperBuilt,
                           Level3Wall3LowerBuilt,
                           Level3Wall3UpperBuilt,
                           ROW_NUMBER() OVER (
                               PARTITION BY WatchtowerId 
                               ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                           ) as rn
                    FROM watchtowers_tracking
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        cursor.execute(query)
        watchtowers = [dict(row) for row in cursor.fetchall()]
        
        # Função auxiliar para normalizar valores booleanos
        def normalize_bool_value(value):
            if value is None:
                return 0
            if isinstance(value, bool):
                return 1 if value else 0
            if isinstance(value, str):
                value = value.strip().lower()
                if value in ('true', '1', 'yes'):
                    return 1
                if value in ('false', '0', 'no'):
                    return 0
            # Para inteiros ou outros tipos numéricos
            return 1 if int(value) == 1 else 0
        
        # Detectar ataques recentes (perda de parede)
        for watchtower in watchtowers:
            watchtower_id = watchtower['WatchtowerId']
            current_timestamp = watchtower.get('TimeStamp')
            
            has_recent_attack = False
            
            # Só buscar registro anterior se tiver timestamp atual
            if current_timestamp:
                # Lista de todas as 18 paredes para verificar
                wall_fields = [
                    'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                    'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                    'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                    'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                    'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                    'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                    'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                    'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                    'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt'
                ]
                
                # Normalizar valores atuais
                current_walls = {}
                for field in wall_fields:
                    raw_value = watchtower.get(field, 0)
                    current_walls[field] = normalize_bool_value(raw_value)
                
                # Verificar cada parede individualmente
                for wall_field in wall_fields:
                    current_value = current_walls[wall_field]
                    
                    # Se a parede atual não está construída, verificar se estava antes
                    if current_value == 0:
                        if has_is_destroyed and not include_destroyed:
                            # Buscar último registro com esta parede construída
                            cursor.execute(f"""
                                SELECT {wall_field}, TimeStamp, WatchtowerTrackingId
                                FROM watchtowers_tracking
                                WHERE WatchtowerId = ?
                                AND TimeStamp < ?
                                AND {wall_field} = 1
                                AND (IsDestroyed = 0 OR IsDestroyed IS NULL)
                                ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                                LIMIT 1
                            """, (watchtower_id, current_timestamp))
                        else:
                            # Buscar último registro com esta parede construída
                            cursor.execute(f"""
                                SELECT {wall_field}, TimeStamp, WatchtowerTrackingId
                                FROM watchtowers_tracking
                                WHERE WatchtowerId = ?
                                AND TimeStamp < ?
                                AND {wall_field} = 1
                                ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                                LIMIT 1
                            """, (watchtower_id, current_timestamp))
                        
                        prev_row = cursor.fetchone()
                        if prev_row:
                            prev_value = normalize_bool_value(prev_row[0])
                            # Se tinha antes (1) e não tem mais (0), houve ataque
                            if prev_value == 1:
                                has_recent_attack = True
                                break  # Basta uma parede destruída para marcar como ataque
            
            watchtower['has_recent_attack'] = has_recent_attack
        
        return watchtowers

def get_flags_last_position(include_destroyed: bool = False) -> List[Dict]:
    """Retorna flags do último timestamp de rastreamento"""
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='flags_tracking';")
        if not cursor.fetchone():
            return []

        # Verificar se coluna IsDestroyed existe (migração) - usar cache
        try:
            columns = get_table_columns(config.DB_STRUCTURES, 'flags_tracking')
            has_is_destroyed = 'IsDestroyed' in columns
        except:
            has_is_destroyed = False

        if has_is_destroyed and not include_destroyed:
            query = """
                SELECT FlagTrackingId,
                       FlagId,
                       FlagName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       HasFlagBase,
                       FlagRaised,
                       FlagHeight,
                       0 as IsDestroyed,
                       NULL as DestroyedAt
                FROM (
                    SELECT FlagTrackingId,
                           FlagId,
                           FlagName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           HasFlagBase,
                           FlagRaised,
                           FlagHeight,
                           ROW_NUMBER() OVER (
                               PARTITION BY FlagId 
                               ORDER BY TimeStamp DESC, FlagTrackingId DESC
                           ) as rn
                    FROM flags_tracking
                    WHERE (IsDestroyed = 0 OR IsDestroyed IS NULL)
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        elif has_is_destroyed:
            query = """
                SELECT FlagTrackingId,
                       FlagId,
                       FlagName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       HasFlagBase,
                       FlagRaised,
                       FlagHeight,
                       IFNULL(IsDestroyed, 0) as IsDestroyed,
                       DestroyedAt
                FROM (
                    SELECT FlagTrackingId,
                           FlagId,
                           FlagName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           HasFlagBase,
                           FlagRaised,
                           FlagHeight,
                           IsDestroyed,
                           DestroyedAt,
                           ROW_NUMBER() OVER (
                               PARTITION BY FlagId 
                               ORDER BY TimeStamp DESC, FlagTrackingId DESC
                           ) as rn
                    FROM flags_tracking
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        else:
            query = """
                SELECT FlagTrackingId,
                       FlagId,
                       FlagName,
                       PositionX,
                       PositionY,
                       PositionZ,
                       OrientationX,
                       OrientationY,
                       OrientationZ,
                       TimeStamp,
                       HasBase,
                       HasFlagBase,
                       FlagRaised,
                       FlagHeight,
                       0 as IsDestroyed,
                       NULL as DestroyedAt
                FROM (
                    SELECT FlagTrackingId,
                           FlagId,
                           FlagName,
                           PositionX,
                           PositionY,
                           PositionZ,
                           OrientationX,
                           OrientationY,
                           OrientationZ,
                           TimeStamp,
                           HasBase,
                           HasFlagBase,
                           FlagRaised,
                           FlagHeight,
                           ROW_NUMBER() OVER (
                               PARTITION BY FlagId 
                               ORDER BY TimeStamp DESC, FlagTrackingId DESC
                           ) as rn
                    FROM flags_tracking
                ) ranked
                WHERE rn = 1
                ORDER BY TimeStamp DESC
            """
        cursor.execute(query)
        return [dict(row) for row in cursor.fetchall()]

def get_watchtower_trail(watchtower_id: str, limit: int = 100, offset: int = 0, date_from: str = None, date_to: str = None) -> tuple:
    """
    Retorna histórico de mudanças de uma watchtower com filtros
    Retorna: (trail, total_count)
    """
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='watchtowers_tracking';")
        if not cursor.fetchone():
            return [], 0

        where_clauses = ["wt.WatchtowerId = ?"]
        params = [watchtower_id]

        if date_from:
            where_clauses.append("wt.TimeStamp >= ?")
            params.append(date_from)
        if date_to:
            where_clauses.append("wt.TimeStamp <= ?")
            params.append(date_to)

        where_sql = " AND ".join(where_clauses)

        cursor.execute(f"""
            SELECT COUNT(DISTINCT wt.WatchtowerTrackingId)
            FROM watchtowers_tracking wt
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()[0]

        cursor.execute(f"""
            SELECT wt.WatchtowerTrackingId, wt.WatchtowerId, wt.WatchtowerName,
                   wt.PositionX, wt.PositionY, wt.PositionZ, wt.OrientationX,
                   wt.OrientationY, wt.OrientationZ, wt.TimeStamp,
                   wt.HasBase, wt.Level1BaseBuilt, wt.Level2BaseBuilt,
                   wt.Level3BaseBuilt, wt.Level1StairsBuilt, wt.Level2StairsBuilt,
                   wt.HasRoof,
                   wt.Level1Wall1LowerBuilt, wt.Level1Wall1UpperBuilt,
                   wt.Level1Wall2LowerBuilt, wt.Level1Wall2UpperBuilt,
                   wt.Level1Wall3LowerBuilt, wt.Level1Wall3UpperBuilt,
                   wt.Level2Wall1LowerBuilt, wt.Level2Wall1UpperBuilt,
                   wt.Level2Wall2LowerBuilt, wt.Level2Wall2UpperBuilt,
                   wt.Level2Wall3LowerBuilt, wt.Level2Wall3UpperBuilt,
                   wt.Level3Wall1LowerBuilt, wt.Level3Wall1UpperBuilt,
                   wt.Level3Wall2LowerBuilt, wt.Level3Wall2UpperBuilt,
                   wt.Level3Wall3LowerBuilt, wt.Level3Wall3UpperBuilt,
                   IFNULL(wt.IsDestroyed, 0) as IsDestroyed, wt.DestroyedAt
            FROM watchtowers_tracking wt
            WHERE {where_sql}
            ORDER BY wt.TimeStamp DESC, wt.WatchtowerTrackingId DESC
        """, params)
        all_rows = [dict(row) for row in cursor.fetchall()]

        def normalize_bool(value):
            if value is None:
                return None
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                value = value.strip().lower()
                if value in ('true', '1', 'yes'):
                    return True
                if value in ('false', '0', 'no'):
                    return False
            try:
                return bool(int(value))
            except (TypeError, ValueError):
                return bool(value)

        def safe_round(value):
            if value is None:
                return None
            try:
                return round(float(value), 1)
            except (TypeError, ValueError):
                return None

        filtered_rows = []
        prev_state_key = None

        for row in all_rows:
            state_key = (
                safe_round(row.get('PositionX')),
                safe_round(row.get('PositionY')),
                safe_round(row.get('PositionZ')),
                normalize_bool(row.get('HasBase')),
                normalize_bool(row.get('Level1BaseBuilt')),
                normalize_bool(row.get('Level2BaseBuilt')),
                normalize_bool(row.get('Level3BaseBuilt')),
                normalize_bool(row.get('Level1StairsBuilt')),
                normalize_bool(row.get('Level2StairsBuilt')),
                normalize_bool(row.get('HasRoof')),
                normalize_bool(row.get('Level1Wall1LowerBuilt')),
                normalize_bool(row.get('Level1Wall1UpperBuilt')),
                normalize_bool(row.get('Level1Wall2LowerBuilt')),
                normalize_bool(row.get('Level1Wall2UpperBuilt')),
                normalize_bool(row.get('Level1Wall3LowerBuilt')),
                normalize_bool(row.get('Level1Wall3UpperBuilt')),
                normalize_bool(row.get('Level2Wall1LowerBuilt')),
                normalize_bool(row.get('Level2Wall1UpperBuilt')),
                normalize_bool(row.get('Level2Wall2LowerBuilt')),
                normalize_bool(row.get('Level2Wall2UpperBuilt')),
                normalize_bool(row.get('Level2Wall3LowerBuilt')),
                normalize_bool(row.get('Level2Wall3UpperBuilt')),
                normalize_bool(row.get('Level3Wall1LowerBuilt')),
                normalize_bool(row.get('Level3Wall1UpperBuilt')),
                normalize_bool(row.get('Level3Wall2LowerBuilt')),
                normalize_bool(row.get('Level3Wall2UpperBuilt')),
                normalize_bool(row.get('Level3Wall3LowerBuilt')),
                normalize_bool(row.get('Level3Wall3UpperBuilt')),
            )

            if prev_state_key is None or prev_state_key != state_key:
                filtered_rows.append(row)
                prev_state_key = state_key

        paginated_rows = filtered_rows[offset:offset + limit]

        for row in paginated_rows:
            for key in ('HasBase', 'Level1BaseBuilt', 'Level2BaseBuilt', 'Level3BaseBuilt',
                        'Level1StairsBuilt', 'Level2StairsBuilt', 'HasRoof',
                        'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                        'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                        'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                        'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                        'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                        'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                        'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                        'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                        'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt',
                        'IsDestroyed'):
                row[key] = normalize_bool(row.get(key))

        return paginated_rows, len(filtered_rows)

def get_flag_trail(flag_id: str, limit: int = 100, offset: int = 0, date_from: str = None, date_to: str = None) -> tuple:
    """
    Retorna histórico de mudanças de uma flag com filtros
    Retorna: (trail, total_count)
    """
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='flags_tracking';")
        if not cursor.fetchone():
            return [], 0

        where_clauses = ["ft.FlagId = ?"]
        params = [flag_id]

        if date_from:
            where_clauses.append("ft.TimeStamp >= ?")
            params.append(date_from)
        if date_to:
            where_clauses.append("ft.TimeStamp <= ?")
            params.append(date_to)

        where_sql = " AND ".join(where_clauses)

        cursor.execute(f"""
            SELECT COUNT(DISTINCT ft.FlagTrackingId)
            FROM flags_tracking ft
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()[0]

        cursor.execute(f"""
            SELECT ft.FlagTrackingId, ft.FlagId, ft.FlagName,
                   ft.PositionX, ft.PositionY, ft.PositionZ, ft.OrientationX,
                   ft.OrientationY, ft.OrientationZ, ft.TimeStamp,
                   ft.HasBase, ft.HasFlagBase, ft.FlagRaised, ft.FlagHeight
            FROM flags_tracking ft
            WHERE {where_sql}
            ORDER BY ft.TimeStamp DESC, ft.FlagTrackingId DESC
        """, params)
        all_rows = [dict(row) for row in cursor.fetchall()]

        def normalize_bool(value):
            if value is None:
                return None
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                value = value.strip().lower()
                if value in ('true', '1', 'yes'):
                    return True
                if value in ('false', '0', 'no'):
                    return False
            try:
                return bool(int(value))
            except (TypeError, ValueError):
                return bool(value)

        def safe_round(value):
            if value is None:
                return None
            try:
                return round(float(value), 1)
            except (TypeError, ValueError):
                return None

        filtered_rows = []
        prev_state_key = None

        for row in all_rows:
            state_key = (
                safe_round(row.get('PositionX')),
                safe_round(row.get('PositionY')),
                safe_round(row.get('PositionZ')),
                normalize_bool(row.get('HasBase')),
                normalize_bool(row.get('HasFlagBase')),
                normalize_bool(row.get('FlagRaised')),
                safe_round(row.get('FlagHeight')),
            )

            if prev_state_key is None or prev_state_key != state_key:
                filtered_rows.append(row)
                prev_state_key = state_key

        paginated_rows = filtered_rows[offset:offset + limit]

        for row in paginated_rows:
            for key in ('HasBase', 'HasFlagBase', 'FlagRaised'):
                row[key] = normalize_bool(row.get(key))
            if row.get('FlagHeight') is not None:
                try:
                    row['FlagHeight'] = round(float(row['FlagHeight']), 2)
                except (TypeError, ValueError):
                    row['FlagHeight'] = None

        return paginated_rows, len(filtered_rows)

def get_fence_trail(fence_id: str, limit: int = 100, offset: int = 0, date_from: str = None, date_to: str = None) -> tuple:
    """
    Retorna histórico de mudanças de uma fence com filtros
    Retorna: (trail, total_count)
    """
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()
        
        # Query base com filtros de data
        where_clauses = ["ft.FenceId = ?"]
        params = [fence_id]
        
        if date_from:
            where_clauses.append("ft.TimeStamp >= ?")
            params.append(date_from)
        if date_to:
            where_clauses.append("ft.TimeStamp <= ?")
            params.append(date_to)
        
        where_sql = " AND ".join(where_clauses)
        
        # Contar total (antes de filtrar duplicados)
        cursor.execute(f"""
            SELECT COUNT(DISTINCT ft.IdFenceTracking)
            FROM fences_tracking ft
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()[0]
        
        # Buscar todos os registros ordenados
        cursor.execute(f"""
            SELECT ft.IdFenceTracking, ft.FenceId, ft.FenceName,
                   ft.PositionX, ft.PositionY, ft.PositionZ, ft.TimeStamp,
                   ft.HasBase, ft.LowerPanelBuilt, ft.UpperPanelBuilt
            FROM fences_tracking ft
            WHERE {where_sql}
            ORDER BY ft.TimeStamp DESC
        """, params)
        all_fences = [dict(row) for row in cursor.fetchall()]
        
        # Filtrar eventos duplicados (mesma posição e mesmo estado de construção)
        filtered_fences = []
        prev_state = None
        
        for fence in all_fences:
            # Criar hash do estado atual (posição + estado de construção + tipo de fence)
            current_state_key = (
                round(fence['PositionX'], 1),
                round(fence['PositionY'], 1),
                round(fence['PositionZ'], 1),
                fence.get('HasBase'),
                fence.get('LowerPanelBuilt'),
                fence.get('UpperPanelBuilt'),
                fence.get('FenceName')  # Incluir FenceName para detectar mudanças de tipo
            )
            
            current_state = {
                'key': current_state_key,
                'position': (fence['PositionX'], fence['PositionY'], fence['PositionZ']),
                'has_base': fence.get('HasBase'),
                'lower_panel': fence.get('LowerPanelBuilt'),
                'upper_panel': fence.get('UpperPanelBuilt'),
                'fence_name': fence.get('FenceName')
            }
            
            # Se mudou, adicionar à lista
            if prev_state is None or prev_state['key'] != current_state['key']:
                filtered_fences.append(fence)
                prev_state = current_state
        
        # Aplicar paginação após filtrar
        paginated_fences = filtered_fences[offset:offset + limit]
        
        return paginated_fences, len(filtered_fences)

def get_item_details_from_items_db(name_type: str) -> Optional[Dict]:
    """Busca detalhes de um item no banco dayz_items.db por name_type
    Busca sequencialmente em múltiplas tabelas: item, weapons, attachments, magazines, ammunitions, explosives
    """
    if not name_type:
        return None
    
    try:
        with DatabaseConnection(config.DB_ITEMS) as conn:
            cursor = conn.cursor()
            
            # Lista de tabelas para buscar (em ordem de prioridade)
            # Ordem otimizada: tabela item primeiro (mais comum)
            tables = [
                ('item', 'id, name, name_type, img, slots, width, height'),
                ('weapons', 'id, name, name_type, img, slots, width, height'),
                ('attachments', 'id, name, name_type, img, slots, width, height'),
                ('magazines', 'id, name, name_type, img, slots, width, height'),
                ('ammunitions', 'id, name, name_type, img, slots, width, height'),
                ('explosives', 'id, name, name_type, img, slots, width, height')
            ]
            
            # Buscar sequencialmente, parar na primeira correspondência
            for table_name, fields in tables:
                try:
                    cursor.execute(f"""
                        SELECT {fields}
                        FROM {table_name}
                        WHERE name_type = ?
                        LIMIT 1
                    """, (name_type,))
                    row = cursor.fetchone()
                    if row:
                        return dict(row)
                except Exception as table_error:
                    # Se tabela não existir ou houver erro, continuar para próxima
                    continue
            
            return None
    except Exception as e:
        print(f"Erro ao buscar item {name_type}: {e}")
        return None

def get_items_details_batch(item_types: List[str]) -> Dict[str, Dict]:
    """Busca detalhes de múltiplos items de uma vez usando batch queries
    Retorna um dicionário mapeando item_type -> detalhes
    """
    if not item_types:
        return {}
    
    # Remover duplicatas e valores vazios
    unique_types = list(set(filter(None, item_types)))
    if not unique_types:
        return {}
    
    result = {}
    
    try:
        with DatabaseConnection(config.DB_ITEMS) as conn:
            cursor = conn.cursor()
            
            # Lista de tabelas para buscar (em ordem de prioridade)
            tables = [
                ('item', 'id, name, name_type, img, slots, width, height'),
                ('weapons', 'id, name, name_type, img, slots, width, height'),
                ('attachments', 'id, name, name_type, img, slots, width, height'),
                ('magazines', 'id, name, name_type, img, slots, width, height'),
                ('ammunitions', 'id, name, name_type, img, slots, width, height'),
                ('explosives', 'id, name, name_type, img, slots, width, height')
            ]
            
            # Criar placeholders para IN clause
            placeholders = ','.join(['?'] * len(unique_types))
            
            # Buscar em cada tabela
            # Items já encontrados não precisam ser buscados nas próximas tabelas
            remaining_types = set(unique_types)
            
            for table_name, fields in tables:
                if not remaining_types:
                    break
                
                try:
                    cursor.execute(f"""
                        SELECT {fields}
                        FROM {table_name}
                        WHERE name_type IN ({placeholders})
                    """, tuple(remaining_types))
                    
                    for row in cursor.fetchall():
                        item_dict = dict(row)
                        name_type = item_dict.get('name_type')
                        if name_type and name_type not in result:
                            result[name_type] = item_dict
                            remaining_types.discard(name_type)
                    
                    # Se encontrou todos, pode parar
                    if not remaining_types:
                        break
                        
                except Exception as table_error:
                    # Se tabela não existir ou houver erro, continuar para próxima
                    continue
            
            return result
    except Exception as e:
        print(f"Erro ao buscar items em batch: {e}")
        return {}

def search_players(query: str) -> List[Dict]:
    """Busca jogadores por nome ou ID"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT PlayerID, PlayerName, SteamID, SteamName
            FROM players_database
            WHERE PlayerName LIKE ? OR PlayerID LIKE ? OR SteamID LIKE ?
            ORDER BY PlayerName
        """, (f"%{query}%", f"%{query}%", f"%{query}%"))
        return [dict(row) for row in cursor.fetchall()]

def get_player_by_id(player_id: str) -> Optional[Dict]:
    """Retorna um jogador específico por ID"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT PlayerID, PlayerName, SteamID, SteamName, RconGuid
            FROM players_database
            WHERE PlayerID = ?
        """, (player_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_players_last_position() -> List[Dict]:
    """Retorna a última posição de cada jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                   pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data, pc.PlayerCoordId,
                   pc.Health, pc.Blood, pc.Shock, pc.Energy, pc.Water,
                   pc.IsAlive, pc.IsAdmin, pc.Stamina, pc.StaminaMax,
                   pc.ItemsInHands, pc.ItemsCount, pc.MainItems
            FROM players_database p
            INNER JOIN (
                SELECT PlayerID, CoordX, CoordY, CoordZ, Data, PlayerCoordId,
                       Health, Blood, Shock, Energy, Water, IsAlive, IsAdmin,
                       Stamina, StaminaMax, ItemsInHands, ItemsCount, MainItems,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC, PlayerCoordId DESC) as rn
                FROM players_coord
            ) pc ON p.PlayerID = pc.PlayerID AND pc.rn = 1
            ORDER BY p.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_player_trail(player_id: str, limit: int = 100, date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna o histórico de movimento de um jogador com flag de backup e informações do jogador
    
    Args:
        player_id: ID do jogador
        limit: Limite de registros (padrão 100). Se filtros de data estiverem ativos, usar limite maior ou None
        date_from: Data inicial para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
        date_to: Data final para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Construir condições WHERE dinamicamente
        where_conditions = ["pc.PlayerID = ?"]
        params = [player_id]
        
        if date_from:
            # Usar datetime() do SQLite para garantir comparação correta de datas
            # Isso funciona mesmo se pc.Data tiver milissegundos
            where_conditions.append("datetime(pc.Data) >= datetime(?)")
            params.append(date_from)
        
        if date_to:
            # Usar datetime() do SQLite para garantir comparação correta de datas
            where_conditions.append("datetime(pc.Data) <= datetime(?)")
            params.append(date_to)
        
        where_clause = " AND ".join(where_conditions)
        
        # Se filtros de data estiverem ativos, usar limite maior ou remover limite
        # Para evitar sobrecarga, usar limite de 10000 quando filtros estão ativos
        if date_from or date_to:
            effective_limit = limit if limit > 10000 else 10000
        else:
            effective_limit = limit
        
        query = f"""
            SELECT pc.PlayerCoordId, pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data,
                   pc.Health, pc.Blood, pc.Shock, pc.Energy, pc.Water,
                   pc.IsAlive, pc.IsAdmin, pc.Stamina, pc.StaminaMax,
                   pc.ItemsInHands, pc.ItemsCount, pc.MainItems,
                   CASE WHEN pcb.PlayerCoordId IS NOT NULL THEN 1 ELSE 0 END as HasBackup
            FROM players_coord pc
            LEFT JOIN (
                SELECT DISTINCT PlayerCoordId FROM players_coord_backup
            ) pcb ON pc.PlayerCoordId = pcb.PlayerCoordId
            WHERE {where_clause}
            ORDER BY datetime(pc.Data) DESC
            LIMIT ?
        """
        
        params.append(effective_limit)
        cursor.execute(query, params)
        results = [dict(row) for row in cursor.fetchall()]
        return results

def get_players_trails_batch(player_ids: List[str], limit: int = 100, date_from: str = None, date_to: str = None) -> Dict[str, List[Dict]]:
    """Retorna o histórico de movimento de múltiplos jogadores em uma única query
    
    Args:
        player_ids: Lista de IDs dos jogadores
        limit: Limite de registros por jogador (padrão 100)
        date_from: Data inicial para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
        date_to: Data final para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
    
    Returns:
        Dicionário onde a chave é o player_id e o valor é a lista de pontos do trail
    """
    if not player_ids:
        return {}
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Construir condições WHERE dinamicamente
        placeholders = ','.join(['?' for _ in player_ids])
        where_conditions = [f"pc.PlayerID IN ({placeholders})"]
        params = list(player_ids)
        
        date_conditions = []
        date_conditions_subquery = []  # Para usar na subquery sem alias
        # Nota: Nao usar datetime() pois impede uso do indice. O formato YYYY-MM-DD HH:MM:SS ja e ordenavel como string.
        if date_from:
            date_conditions.append("pc.Data >= ?")
            date_conditions_subquery.append("Data >= ?")
            params.append(date_from)

        if date_to:
            date_conditions.append("pc.Data <= ?")
            date_conditions_subquery.append("Data <= ?")
            params.append(date_to)
        
        where_clause = " AND ".join(where_conditions)
        date_clause = " AND ".join(date_conditions) if date_conditions else "1=1"
        date_clause_subquery = " AND ".join(date_conditions_subquery) if date_conditions_subquery else "1=1"
        
        # Se filtros de data estiverem ativos, usar limite maior
        if date_from or date_to:
            effective_limit = limit if limit > 10000 else 10000
        else:
            effective_limit = limit
        
        # Query otimizada para buscar múltiplos jogadores
        # Usar subquery otimizada - SQLite 3.8.3+ suporta CTE, mas vamos usar abordagem mais compatível
        # Primeiro obter os PlayerCoordIds que queremos (limitados por jogador)
        query = f"""
            SELECT pc.PlayerID, pc.PlayerCoordId, pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data,
                   pc.Health, pc.Blood, pc.Shock, pc.Energy, pc.Water,
                   pc.IsAlive, pc.IsAdmin, pc.Stamina, pc.StaminaMax,
                   pc.ItemsInHands, pc.ItemsCount, pc.MainItems,
                   CASE WHEN pcb.PlayerCoordId IS NOT NULL THEN 1 ELSE 0 END as HasBackup
            FROM players_coord pc
            INNER JOIN (
                SELECT PlayerCoordId
                FROM (
                    SELECT PlayerCoordId,
                           ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC) as rn
                    FROM players_coord
                    WHERE PlayerID IN ({placeholders})
                    AND {date_clause_subquery}
                ) ranked
                WHERE rn <= ?
            ) rc ON pc.PlayerCoordId = rc.PlayerCoordId
            LEFT JOIN (
                SELECT DISTINCT PlayerCoordId FROM players_coord_backup
            ) pcb ON pc.PlayerCoordId = pcb.PlayerCoordId
            WHERE pc.PlayerID IN ({placeholders})
            AND {date_clause}
            ORDER BY pc.PlayerID, pc.Data DESC
        """
        
        # Parâmetros: player_ids para subquery, date conditions, limit, player_ids para WHERE, date conditions
        batch_params = list(player_ids) + (params[len(player_ids):] if date_conditions else [])
        batch_params.append(effective_limit)
        batch_params += list(player_ids) + (params[len(player_ids):] if date_conditions else [])
        
        cursor.execute(query, batch_params)
        results = [dict(row) for row in cursor.fetchall()]
        
        # Agrupar resultados por player_id
        trails_by_player = {}
        for row in results:
            player_id = row['PlayerID']
            if player_id not in trails_by_player:
                trails_by_player[player_id] = []
            trails_by_player[player_id].append(row)
        
        # Garantir que todos os player_ids tenham uma entrada (mesmo que vazia)
        for player_id in player_ids:
            if player_id not in trails_by_player:
                trails_by_player[player_id] = []
        
        return trails_by_player

def get_online_players_positions() -> List[Dict]:
    """Retorna posições de jogadores online"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        # Query otimizada: filtra players_coord apenas para jogadores online
        # Isso evita processar 550k+ registros desnecessariamente
        cursor.execute("""
            SELECT p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                   pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data, pc.PlayerCoordId,
                   pc.Health, pc.Blood, pc.Shock, pc.Energy, pc.Water,
                   pc.IsAlive, pc.IsAdmin, pc.Stamina, pc.StaminaMax,
                   pc.ItemsInHands, pc.ItemsCount, pc.MainItems,
                   po.Country, po.City, po.IP, po.Port, po.Ping, po.Lat, po.Lon,
                   1 as IsOnline
            FROM players_online po
            INNER JOIN players_database p ON po.PlayerID = p.PlayerID
            INNER JOIN (
                SELECT PlayerID, CoordX, CoordY, CoordZ, Data, PlayerCoordId,
                       Health, Blood, Shock, Energy, Water, IsAlive, IsAdmin,
                       Stamina, StaminaMax, ItemsInHands, ItemsCount, MainItems,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC, PlayerCoordId DESC) as rn
                FROM players_coord
                WHERE PlayerID IN (SELECT PlayerID FROM players_online)
            ) pc ON p.PlayerID = pc.PlayerID AND pc.rn = 1
            ORDER BY p.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]


def get_cftools_data_for_players(player_ids: List[str]) -> Dict[str, Dict]:
    """
    Busca dados CFTools para uma lista de jogadores.
    Retorna dicionário {player_id: cftools_data} ou {} se CFTools não disponível.
    Esta função é opcional - se a tabela não existir ou ocorrer erro, retorna vazio.
    """
    if not player_ids:
        return {}

    logging.debug(f"CFTools DB: Querying CFTools data for {len(player_ids)} player IDs")

    try:
        with DatabaseConnection(config.DB_PLAYERS) as conn:
            cursor = conn.cursor()

            # Verificar se tabela existe
            cursor.execute("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='players_cftools'
            """)
            if not cursor.fetchone():
                return {}

            placeholders = ','.join('?' * len(player_ids))
            cursor.execute(f"""
                SELECT
                    PlayerID,
                    CFToolsId,
                    Steam64,
                    CountryCode,
                    IsMalicious,
                    Provider,
                    VACBans,
                    GameBans,
                    CommunityBan,
                    EconomyBan,
                    LastBanDays,
                    CFToolsBanCount,
                    RadarDetection,
                    Labels,
                    SteamProfileName,
                    SteamAvatarUrl,
                    IsProfilePrivate,
                    LastSessionId,
                    LastSessionStart,
                    LastPing,
                    LastLoadTime,
                    LastUpdated
                FROM players_cftools
                WHERE PlayerID IN ({placeholders})
            """, player_ids)

            result = {}
            for row in cursor.fetchall():
                row_dict = dict(row)
                result[row_dict['PlayerID']] = row_dict

            logging.debug(f"CFTools DB: Found {len(result)} players with CFTools data")

            # Log sample de dados (apenas 3 primeiros)
            if result:
                for pid, data in list(result.items())[:3]:
                    last_updated = data.get('LastUpdated', 'never')
                    logging.debug(f"  - PlayerID {pid}: LastUpdated={last_updated}")

            return result
    except Exception as e:
        logging.debug(f"CFTools data unavailable: {e}")
        return {}


def get_players_positions_by_timerange(start_date: str, end_date: str) -> List[Dict]:
    """Retorna posições de jogadores em um período específico"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                   pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data, pc.PlayerCoordId
            FROM players_coord pc
            INNER JOIN players_database p ON pc.PlayerID = p.PlayerID
            WHERE pc.Data BETWEEN ? AND ?
            ORDER BY pc.Data DESC
        """, (start_date, end_date))
        return [dict(row) for row in cursor.fetchall()]

def dayz_to_pixel(coord_x: float, coord_y: float) -> List[float]:
    """
    Converte coordenadas DayZ para pixels no mapa
    Chernarus: 15360m × 15360m = 4096px × 4096px
    
    No DayZ (SEU banco):
    - CoordX: Leste-Oeste (horizontal, 0 a 15360)
    - CoordY: Sul-Norte (vertical no mapa, 0 a 15360)  
    - CoordZ: Altitude (ignorada)
    
    Como CoordY=13309.9 (87% norte) aparece mais ao SUL,
    significa que NÃO precisamos inverter! CoordY alto = sul na imagem
    Ou seja: Sul está no TOPO da imagem!
    """
    # CoordX para pixel X (horizontal: Oeste-Leste)
    pixel_x = (coord_x / 15360.0) * 4096
    
    # CoordY para pixel Y (vertical: Sul-Norte)
    # SEM inverter: CoordY alto (norte) → pixel_y alto (sul na imagem)
    # Isso significa Sul está no TOPO da imagem chernarus.jpeg
    pixel_y = (coord_y / 15360.0) * 4096
    
    # Leaflet CRS.Simple: [y, x] onde y=0 é o topo da imagem
    return [pixel_y, pixel_x]

def get_recent_kills(limit: int = 100, since_timestamp: str = None) -> List[Dict]:
    """Retorna kills recentes com posições"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        where_clause = ""
        params = []
        
        if since_timestamp:
            where_clause = "WHERE k.Data > ?"
            params.append(since_timestamp)
        
        query = f"""
            SELECT 
                k.Id,
                k.PlayerIDKiller,
                k.PlayerIDKilled,
                k.Weapon,
                k.DistanceMeter,
                k.Data,
                k.PosKiller,
                k.PosKilled,
                killer.PlayerName as KillerName,
                killer.SteamName as KillerSteamName,
                victim.PlayerName as VictimName,
                victim.SteamName as VictimSteamName
            FROM players_killfeed k
            LEFT JOIN players_database killer ON k.PlayerIDKiller = killer.PlayerID
            LEFT JOIN players_database victim ON k.PlayerIDKilled = victim.PlayerID
            {where_clause}
            ORDER BY k.Data DESC
            LIMIT ?
        """
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_recent_damages(limit: int = 100, since_timestamp: str = None) -> List[Dict]:
    """Retorna danos recentes entre jogadores com posições"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        where_clause = ""
        params = []
        
        if since_timestamp:
            where_clause = "WHERE d.Data > ?"
            params.append(since_timestamp)
        
        query = f"""
            SELECT 
                d.Id,
                d.PlayerIDAttacker,
                d.PlayerIDVictim,
                d.PosAttacker,
                d.PosVictim,
                d.LocalDamage,
                d.HitType,
                d.Damage,
                d.Health,
                d.Data,
                d.Weapon,
                d.DistanceMeter,
                attacker.PlayerName as AttackerName,
                attacker.SteamName as AttackerSteamName,
                victim.PlayerName as VictimName,
                victim.SteamName as VictimSteamName
            FROM players_damage d
            LEFT JOIN players_database attacker ON d.PlayerIDAttacker = attacker.PlayerID
            LEFT JOIN players_database victim ON d.PlayerIDVictim = victim.PlayerID
            {where_clause}
            ORDER BY d.Data DESC
            LIMIT ?
        """
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def parse_position(pos_string: str):
    """Parse string de posição '<X, Y, Z>' para tupla"""
    if not pos_string:
        return None
    try:
        # Remove < > e split por vírgula
        coords = pos_string.strip('<>').split(',')
        if len(coords) == 3:
            return (float(coords[0]), float(coords[1]), float(coords[2]))
    except:
        return None
    return None

def check_backup_exists(player_id: str, player_coord_id: int) -> bool:
    """Verifica se existe backup para o PlayerCoordId"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM players_coord_backup pcb
            INNER JOIN players_coord pc ON pcb.PlayerCoordId = pc.PlayerCoordId
            WHERE pc.PlayerID = ? AND pcb.PlayerCoordId = ?
        """, (player_id, player_coord_id))
        result = cursor.fetchone()
        return result['count'] > 0 if result else False

def check_backup_exists_any_player(player_coord_id: int) -> bool:
    """Verifica se existe backup para o PlayerCoordId (qualquer jogador - para clonagem)"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM players_coord_backup
            WHERE PlayerCoordId = ?
        """, (player_coord_id,))
        result = cursor.fetchone()
        return result['count'] > 0 if result else False

def get_backup_info(player_coord_id: int) -> Dict:
    """Retorna informações sobre o backup"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pcb.TimeStamp, pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data as CoordDate
            FROM players_coord_backup pcb
            INNER JOIN players_coord pc ON pcb.PlayerCoordId = pc.PlayerCoordId
            WHERE pcb.PlayerCoordId = ?
            LIMIT 1
        """, (player_coord_id,))
        result = cursor.fetchone()
        return dict(result) if result else None

def get_backup_blob_hex(player_coord_id: int) -> Optional[str]:
    """
    Busca o backup BLOB do banco de dados e retorna em formato hexadecimal
    (formato esperado pelo script player_restore_backup.sh)
    
    Args:
        player_coord_id: ID da coordenada do jogador
        
    Returns:
        String hexadecimal do backup ou None se não encontrado
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        # Usar hex() do SQLite para converter BLOB diretamente para hex
        cursor.execute("""
            SELECT hex(Backup) as backup_hex
            FROM players_coord_backup
            WHERE PlayerCoordId = ?
            LIMIT 1
        """, (player_coord_id,))
        result = cursor.fetchone()
        if result and result['backup_hex']:
            return result['backup_hex']
        return None

def get_online_players() -> List[Dict]:
    """Retorna lista de jogadores online com informações completas"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                pd.PlayerID,
                pd.PlayerName,
                pd.SteamName,
                po.DataConnect as LastUpdate,
                pc.CoordX,
                pc.CoordY,
                pc.CoordZ
            FROM players_online po
            INNER JOIN players_database pd ON po.PlayerID = pd.PlayerID
            LEFT JOIN (
                SELECT PlayerID, CoordX, CoordY, CoordZ, Data,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC) as rn
                FROM players_coord
            ) pc ON pd.PlayerID = pc.PlayerID AND pc.rn = 1
            ORDER BY pd.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

def is_player_online(player_id: str) -> bool:
    """Verifica se um jogador está online consultando a tabela players_online"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM players_online
            WHERE PlayerID = ?
        """, (player_id,))
        row = cursor.fetchone()
        return row['count'] > 0 if row else False

def get_all_players_with_status() -> List[Dict]:
    """Retorna todos os jogadores com status online e últimas coordenadas"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                pd.*,
                pd.RconGuid,
                po.DataConnect,
                CASE WHEN po.PlayerID IS NOT NULL THEN 1 ELSE 0 END as IsOnline,
                po.Country,
                po.City,
                po.Lat,
                po.Lon,
                po.Port,
                po.Ping,
                po.IP,
                pc.CoordX, 
                pc.CoordY, 
                pc.Data as LastCoordDate,
                usr.LinkedUsername,
                COALESCE(lp.LoadoutCount, 0) AS PlayerLoadoutCount
            FROM players_database pd
            LEFT JOIN players_online po ON pd.PlayerID = po.PlayerID
            LEFT JOIN (
                SELECT PlayerID, CoordX, CoordY, Data,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC) as rn
                FROM players_coord
            ) pc ON pd.PlayerID = pc.PlayerID AND pc.rn = 1
            LEFT JOIN (
                SELECT PlayerID, MAX(Username) AS LinkedUsername
                FROM users
                WHERE IsActive = 1 AND PlayerID IS NOT NULL
                GROUP BY PlayerID
            ) usr ON usr.PlayerID = pd.PlayerID
            LEFT JOIN (
                SELECT player_id, COUNT(*) AS LoadoutCount
                FROM loadouts_players
                GROUP BY player_id
            ) lp ON lp.player_id = pd.PlayerID
            ORDER BY 
                IsOnline DESC,
                CASE 
                    WHEN po.PlayerID IS NOT NULL THEN po.DataConnect
                    ELSE pc.Data
                END DESC,
                pd.PlayerName ASC
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_weapons(search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de armas com filtro opcional"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        if search:
            cursor.execute("""
                SELECT id, name, name_type, feed_type, slots, width, height, img
                FROM weapons
                WHERE name LIKE ? OR name_type LIKE ?
                LIMIT ?
            """, (f'%{search}%', f'%{search}%', limit))
        else:
            cursor.execute("""
                SELECT id, name, name_type, feed_type, slots, width, height, img
                FROM weapons
                LIMIT ?
            """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_weapons_with_calibers(limit: int = 1000) -> List[Dict]:
    """Retorna armas com seus calibres"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT
                w.id, w.name, w.name_type, w.feed_type, 
                w.slots, w.width, w.height, w.img,
                GROUP_CONCAT(DISTINCT c.name) as calibers
            FROM weapons w
            LEFT JOIN weapon_ammunitions wa ON w.id = wa.weapon_id
            LEFT JOIN ammunitions a ON wa.ammo_id = a.id
            LEFT JOIN calibers c ON a.caliber_id = c.id
            GROUP BY w.id
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_all_calibers() -> List[Dict]:
    """Retorna todos os calibres disponíveis"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM calibers ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_items(type_id: int = None, search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de itens com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, type_id, slots, width, height, img, localization, storage_slots FROM item WHERE 1=1"
        params = []
        
        if type_id:
            query += " AND type_id = ?"
            params.append(type_id)
        
        if search:
            query += " AND (name LIKE ? OR name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        query += " LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_item_types() -> List[Dict]:
    """Retorna lista de tipos de itens"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM item_types ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_explosives(search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de explosivos com filtro opcional"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, slots, width, height, img FROM explosives WHERE 1=1"
        params = []
        
        if search:
            query += " AND (name LIKE ? OR name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        query += " LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_ammunitions(search: str = None, caliber_id: int = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de munições com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        if weapon_id:
            # Filtrar apenas munições compatíveis com a arma
            query = """
                SELECT DISTINCT a.id, a.name, a.name_type, a.caliber_id, a.slots, a.width, a.height, a.img
                FROM ammunitions a
                INNER JOIN weapon_ammunitions wa ON a.id = wa.ammo_id
                WHERE wa.weapon_id = ?
            """
            params = [weapon_id]
            
            if search:
                query += " AND (a.name LIKE ? OR a.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " LIMIT ?"
            params.append(limit)
        else:
            # Query original sem filtro de arma
            query = "SELECT id, name, name_type, caliber_id, slots, width, height, img FROM ammunitions WHERE 1=1"
            params = []
            
            if caliber_id:
                query += " AND caliber_id = ?"
                params.append(caliber_id)
            
            if search:
                query += " AND (name LIKE ? OR name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_calibers() -> List[Dict]:
    """Retorna lista de calibres"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM calibers ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_magazines(search: str = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de magazines com filtro opcional"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        if weapon_id:
            # Filtrar apenas magazines compatíveis com a arma
            query = """
                SELECT DISTINCT m.id, m.name, m.name_type, m.capacity, m.slots, m.width, m.height, m.img
                FROM magazines m
                INNER JOIN weapon_magazines wm ON m.id = wm.magazine_id
                WHERE wm.weapon_id = ?
            """
            params = [weapon_id]
            
            if search:
                query += " AND (m.name LIKE ? OR m.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " LIMIT ?"
            params.append(limit)
        else:
            # Query original sem filtro de arma
            query = "SELECT id, name, name_type, capacity, slots, width, height, img FROM magazines WHERE 1=1"
            params = []
            
            if search:
                query += " AND (name LIKE ? OR name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_attachments(search: str = None, type_filter: str = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de attachments com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        if weapon_id:
            # Filtrar apenas attachments compatíveis com a arma
            query = """
                SELECT DISTINCT at.id, at.name, at.name_type, at.type, at.slots, at.width, at.height, at.img, at.battery
                FROM attachments at
                INNER JOIN weapon_attachments wat ON at.id = wat.attachment_id
                WHERE wat.weapon_id = ?
            """
            params = [weapon_id]
            
            if type_filter:
                query += " AND at.type = ?"
                params.append(type_filter)
            
            if search:
                query += " AND (at.name LIKE ? OR at.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " ORDER BY at.type LIMIT ?"
            params.append(limit)
        else:
            # Query original sem filtro de arma
            query = "SELECT id, name, name_type, type, slots, width, height, img, battery FROM attachments WHERE 1=1"
            params = []
            
            if type_filter:
                query += " AND type = ?"
                params.append(type_filter)
            
            if search:
                query += " AND (name LIKE ? OR name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            
            query += " LIMIT ?"
            params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_attachment_types() -> List[str]:
    """Retorna lista de tipos de attachments"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT type FROM attachments ORDER BY type")
        return [row['type'] for row in cursor.fetchall()]

def get_weapon_compatible_items(weapon_id: int) -> Dict:
    """Retorna magazines, munições e attachments compatíveis com uma arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Magazines compatíveis
        cursor.execute("""
            SELECT m.id, m.name, m.name_type, m.capacity, m.img
            FROM magazines m
            INNER JOIN weapon_magazines wm ON m.id = wm.magazine_id
            WHERE wm.weapon_id = ?
        """, (weapon_id,))
        magazines = [dict(row) for row in cursor.fetchall()]
        
        # Munições compatíveis
        cursor.execute("""
            SELECT a.id, a.name, a.name_type, a.img
            FROM ammunitions a
            INNER JOIN weapon_ammunitions wa ON a.id = wa.ammo_id
            WHERE wa.weapon_id = ?
        """, (weapon_id,))
        ammunitions = [dict(row) for row in cursor.fetchall()]
        
        # Attachments compatíveis
        cursor.execute("""
            SELECT at.id, at.name, at.name_type, at.type, at.img, at.battery
            FROM attachments at
            INNER JOIN weapon_attachments wat ON at.id = wat.attachment_id
            WHERE wat.weapon_id = ?
            ORDER BY at.type
        """, (weapon_id,))
        attachments = [dict(row) for row in cursor.fetchall()]
        
        return {
            'magazines': magazines,
            'ammunitions': ammunitions,
            'attachments': attachments
        }

# ============================================================================
# FUNÇÕES CRUD PARA GERENCIAMENTO DE ITENS
# ============================================================================

import xml.etree.ElementTree as ET

def get_valid_item_types() -> List[str]:
    """Retorna lista de tipos válidos do types.xml"""
    try:
        tree = ET.parse('/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/db/types.xml')
        root = tree.getroot()
        return [type_elem.get('name') for type_elem in root.findall('type')]
    except Exception as e:
        print(f"Erro ao ler types.xml: {e}")
        return []

def validate_item_type(name_type: str) -> bool:
    """Valida se o name_type existe no types.xml"""
    valid_types = get_valid_item_types()
    return name_type in valid_types

# === CRUD WEAPONS ===
def create_weapon(data: Dict) -> int:
    """Cria uma nova arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO weapons (name, name_type, feed_type, slots, width, height, img)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], data['feed_type'], 
              data['slots'], data['width'], data['height'], data['img']))
        conn.commit()
        return cursor.lastrowid

def update_weapon(weapon_id: int, data: Dict) -> bool:
    """Atualiza uma arma existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE weapons SET name=?, name_type=?, feed_type=?, 
                   slots=?, width=?, height=?, img=?
            WHERE id=?
        """, (data['name'], data['name_type'], data['feed_type'],
              data['slots'], data['width'], data['height'], data['img'], weapon_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_weapon(weapon_id: int) -> bool:
    """Exclui uma arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM weapons WHERE id=?", (weapon_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_weapon_by_id(weapon_id: int) -> Dict:
    """Retorna uma arma por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM weapons WHERE id=?", (weapon_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_weapon_relationships(weapon_id: int) -> Dict:
    """Retorna os relacionamentos de uma arma (munições, magazines, attachments)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Munições
        cursor.execute("""
            SELECT a.* FROM ammunitions a
            INNER JOIN weapon_ammunitions wa ON a.id = wa.ammo_id
            WHERE wa.weapon_id = ?
        """, (weapon_id,))
        ammunitions = [dict(row) for row in cursor.fetchall()]
        
        # Magazines
        cursor.execute("""
            SELECT m.* FROM magazines m
            INNER JOIN weapon_magazines wm ON m.id = wm.magazine_id
            WHERE wm.weapon_id = ?
        """, (weapon_id,))
        magazines = [dict(row) for row in cursor.fetchall()]
        
        # Attachments
        cursor.execute("""
            SELECT at.* FROM attachments at
            INNER JOIN weapon_attachments wat ON at.id = wat.attachment_id
            WHERE wat.weapon_id = ?
        """, (weapon_id,))
        attachments = [dict(row) for row in cursor.fetchall()]
        
        return {
            'ammunitions': ammunitions,
            'magazines': magazines,
            'attachments': attachments
        }

def update_weapon_relationships(weapon_id: int, ammo_ids: List[int], 
                                magazine_ids: List[int], attachment_ids: List[int]) -> bool:
    """Atualiza os relacionamentos de uma arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Remover relacionamentos existentes
        cursor.execute("DELETE FROM weapon_ammunitions WHERE weapon_id=?", (weapon_id,))
        cursor.execute("DELETE FROM weapon_magazines WHERE weapon_id=?", (weapon_id,))
        cursor.execute("DELETE FROM weapon_attachments WHERE weapon_id=?", (weapon_id,))
        
        # Inserir novos relacionamentos
        for ammo_id in ammo_ids:
            cursor.execute("INSERT INTO weapon_ammunitions (weapon_id, ammo_id) VALUES (?, ?)",
                         (weapon_id, ammo_id))
        for mag_id in magazine_ids:
            cursor.execute("INSERT INTO weapon_magazines (weapon_id, magazine_id) VALUES (?, ?)",
                         (weapon_id, mag_id))
        for att_id in attachment_ids:
            cursor.execute("INSERT INTO weapon_attachments (weapon_id, attachment_id) VALUES (?, ?)",
                         (weapon_id, att_id))
        
        conn.commit()
        return True

# === CRUD CALIBERS ===
def create_caliber(data: Dict) -> int:
    """Cria um novo calibre"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO calibers (name) VALUES (?)", (data['name'],))
        conn.commit()
        return cursor.lastrowid

def update_caliber(caliber_id: int, data: Dict) -> bool:
    """Atualiza um calibre existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE calibers SET name=? WHERE id=?", (data['name'], caliber_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_caliber(caliber_id: int) -> bool:
    """Exclui um calibre"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM calibers WHERE id=?", (caliber_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_caliber_by_id(caliber_id: int) -> Dict:
    """Retorna um calibre por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM calibers WHERE id=?", (caliber_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD AMMUNITIONS ===
def create_ammunition(data: Dict) -> int:
    """Cria uma nova munição"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO ammunitions (name, name_type, caliber_id, slots, width, height, img)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], data['caliber_id'], 
              data['slots'], data['width'], data['height'], data['img']))
        conn.commit()
        return cursor.lastrowid

def update_ammunition(ammo_id: int, data: Dict) -> bool:
    """Atualiza uma munição existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE ammunitions SET name=?, name_type=?, caliber_id=?, 
                   slots=?, width=?, height=?, img=?
            WHERE id=?
        """, (data['name'], data['name_type'], data['caliber_id'],
              data['slots'], data['width'], data['height'], data['img'], ammo_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_ammunition(ammo_id: int) -> bool:
    """Exclui uma munição"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ammunitions WHERE id=?", (ammo_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_ammunition_by_id(ammo_id: int) -> Dict:
    """Retorna uma munição por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ammunitions WHERE id=?", (ammo_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD MAGAZINES ===
def create_magazine(data: Dict) -> int:
    """Cria um novo magazine"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO magazines (name, name_type, capacity, slots, width, height, img)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], data.get('capacity'),
              data['slots'], data['width'], data['height'], data['img']))
        conn.commit()
        return cursor.lastrowid

def update_magazine(mag_id: int, data: Dict) -> bool:
    """Atualiza um magazine existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE magazines SET name=?, name_type=?, capacity=?, 
                   slots=?, width=?, height=?, img=?
            WHERE id=?
        """, (data['name'], data['name_type'], data.get('capacity'),
              data['slots'], data['width'], data['height'], data['img'], mag_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_magazine(mag_id: int) -> bool:
    """Exclui um magazine"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM magazines WHERE id=?", (mag_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_magazine_by_id(mag_id: int) -> Dict:
    """Retorna um magazine por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM magazines WHERE id=?", (mag_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD ATTACHMENTS ===
def create_attachment(data: Dict) -> int:
    """Cria um novo attachment"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO attachments (name, name_type, type, slots, width, height, img, battery)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], data['type'],
              data['slots'], data['width'], data['height'], data['img'], data.get('battery', 0)))
        conn.commit()
        return cursor.lastrowid

def update_attachment(att_id: int, data: Dict) -> bool:
    """Atualiza um attachment existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE attachments SET name=?, name_type=?, type=?, 
                   slots=?, width=?, height=?, img=?, battery=?
            WHERE id=?
        """, (data['name'], data['name_type'], data['type'],
              data['slots'], data['width'], data['height'], data['img'], data.get('battery', 0), att_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_attachment(att_id: int) -> bool:
    """Exclui um attachment"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM attachments WHERE id=?", (att_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_attachment_by_id(att_id: int) -> Dict:
    """Retorna um attachment por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM attachments WHERE id=?", (att_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD EXPLOSIVES ===
def create_explosive(data: Dict) -> int:
    """Cria um novo explosivo"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO explosives (name, name_type, slots, width, height, img)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], 
              data['slots'], data['width'], data['height'], data['img']))
        conn.commit()
        return cursor.lastrowid

def update_explosive(exp_id: int, data: Dict) -> bool:
    """Atualiza um explosivo existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE explosives SET name=?, name_type=?, 
                   slots=?, width=?, height=?, img=?
            WHERE id=?
        """, (data['name'], data['name_type'],
              data['slots'], data['width'], data['height'], data['img'], exp_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_explosive(exp_id: int) -> bool:
    """Exclui um explosivo"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM explosives WHERE id=?", (exp_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_explosive_by_id(exp_id: int) -> Dict:
    """Retorna um explosivo por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM explosives WHERE id=?", (exp_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD ITEM_TYPES ===
def create_item_type(data: Dict) -> int:
    """Cria um novo tipo de item"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO item_types (name) VALUES (?)", (data['name'],))
        conn.commit()
        return cursor.lastrowid

def update_item_type(type_id: int, data: Dict) -> bool:
    """Atualiza um tipo de item existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE item_types SET name=? WHERE id=?", (data['name'], type_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_item_type(type_id: int) -> bool:
    """Exclui um tipo de item"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM item_types WHERE id=?", (type_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_item_type_by_id(type_id: int) -> Dict:
    """Retorna um tipo de item por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM item_types WHERE id=?", (type_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

# === CRUD ITEM ===
def create_item(data: Dict) -> int:
    """Cria um novo item"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO item (name, name_type, type_id, slots, width, height, img, 
                            storage_slots, storage_width, storage_height, localization)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (data['name'], data['name_type'], data['type_id'],
              data['slots'], data['width'], data['height'], data['img'],
              data.get('storage_slots', 0), data.get('storage_width', 0), 
              data.get('storage_height', 0), data.get('localization')))
        conn.commit()
        return cursor.lastrowid

def update_item(item_id: int, data: Dict) -> bool:
    """Atualiza um item existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE item SET name=?, name_type=?, type_id=?, 
                   slots=?, width=?, height=?, img=?,
                   storage_slots=?, storage_width=?, storage_height=?, localization=?
            WHERE id=?
        """, (data['name'], data['name_type'], data['type_id'],
              data['slots'], data['width'], data['height'], data['img'],
              data.get('storage_slots', 0), data.get('storage_width', 0),
              data.get('storage_height', 0), data.get('localization'), item_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_item(item_id: int) -> bool:
    """Exclui um item"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM item WHERE id=?", (item_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_item_by_id(item_id: int) -> Dict:
    """Retorna um item por ID"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM item WHERE id=?", (item_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_item_compatibility(item_id: int) -> Dict:
    """Retorna relacionamentos de compatibilidade de um item"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Itens que ESTE item encaixa (parents)
        cursor.execute("""
            SELECT i.* FROM item i
            INNER JOIN item_compatibility ic ON i.id = ic.parent_item_id
            WHERE ic.child_item_id = ?
        """, (item_id,))
        parents = [dict(row) for row in cursor.fetchall()]
        
        # Itens que encaixam NESTE item (children)
        cursor.execute("""
            SELECT i.* FROM item i
            INNER JOIN item_compatibility ic ON i.id = ic.child_item_id
            WHERE ic.parent_item_id = ?
        """, (item_id,))
        children = [dict(row) for row in cursor.fetchall()]
        
        return {
            'parents': parents,  # Este item encaixa em...
            'children': children  # Este item recebe...
        }

def update_item_compatibility(item_id: int, parent_ids: List[int], child_ids: List[int]) -> bool:
    """Atualiza a compatibilidade de itens (relação recursiva)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Remover relacionamentos onde ESTE item é filho (encaixa em...)
        cursor.execute("DELETE FROM item_compatibility WHERE child_item_id=?", (item_id,))
        
        # Remover relacionamentos onde ESTE item é pai (recebe...)
        cursor.execute("DELETE FROM item_compatibility WHERE parent_item_id=?", (item_id,))
        
        # Inserir novos relacionamentos como filho (encaixa em...)
        for parent_id in parent_ids:
            cursor.execute("""
                INSERT INTO item_compatibility (parent_item_id, child_item_id) 
                VALUES (?, ?)
            """, (parent_id, item_id))
        
        # Inserir novos relacionamentos como pai (recebe...)
        for child_id in child_ids:
            cursor.execute("""
                INSERT INTO item_compatibility (parent_item_id, child_item_id) 
                VALUES (?, ?)
            """, (item_id, child_id))
        
        conn.commit()
        return True

# === RELACIONAMENTOS INVERSOS (Magazine e Attachment) ===
def get_magazine_weapons(magazine_id: int) -> List[Dict]:
    """Retorna armas relacionadas a um magazine"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.* FROM weapons w
            INNER JOIN weapon_magazines wm ON w.id = wm.weapon_id
            WHERE wm.magazine_id = ?
        """, (magazine_id,))
        return [dict(row) for row in cursor.fetchall()]

def update_magazine_weapons(magazine_id: int, weapon_ids: List[int]) -> bool:
    """Atualiza armas relacionadas a um magazine"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Remover relacionamentos existentes
        cursor.execute("DELETE FROM weapon_magazines WHERE magazine_id=?", (magazine_id,))
        # Inserir novos relacionamentos
        for weapon_id in weapon_ids:
            cursor.execute("""
                INSERT INTO weapon_magazines (weapon_id, magazine_id)
                VALUES (?, ?)
            """, (weapon_id, magazine_id))
        conn.commit()
        return True

def get_attachment_weapons(attachment_id: int) -> List[Dict]:
    """Retorna armas relacionadas a um attachment"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.* FROM weapons w
            INNER JOIN weapon_attachments wa ON w.id = wa.weapon_id
            WHERE wa.attachment_id = ?
        """, (attachment_id,))
        return [dict(row) for row in cursor.fetchall()]

def update_attachment_weapons(attachment_id: int, weapon_ids: List[int]) -> bool:
    """Atualiza armas relacionadas a um attachment"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Remover relacionamentos existentes
        cursor.execute("DELETE FROM weapon_attachments WHERE attachment_id=?", (attachment_id,))
        # Inserir novos relacionamentos
        for weapon_id in weapon_ids:
            cursor.execute("""
                INSERT INTO weapon_attachments (weapon_id, attachment_id)
                VALUES (?, ?)
            """, (weapon_id, attachment_id))
        conn.commit()
        return True

def get_ammunition_weapons(ammunition_id: int) -> List[Dict]:
    """Retorna armas relacionadas a uma munição"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.* FROM weapons w
            INNER JOIN weapon_ammunitions wa ON w.id = wa.weapon_id
            WHERE wa.ammo_id = ?
        """, (ammunition_id,))
        return [dict(row) for row in cursor.fetchall()]

def update_ammunition_weapons(ammunition_id: int, weapon_ids: List[int]) -> bool:
    """Atualiza armas relacionadas a uma munição"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Remover relacionamentos existentes
        cursor.execute("DELETE FROM weapon_ammunitions WHERE ammo_id=?", (ammunition_id,))
        # Inserir novos relacionamentos
        for weapon_id in weapon_ids:
            cursor.execute("""
                INSERT INTO weapon_ammunitions (weapon_id, ammo_id)
                VALUES (?, ?)
            """, (weapon_id, ammunition_id))
        conn.commit()
        return True

# ============================================================================
# CRUD WEAPON KITS
# ============================================================================

def get_weapon_kits() -> List[Dict]:
    """Lista todos os kits de arma com detalhes"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT wk.*, 
                   w.name as weapon_name, w.name_type as weapon_name_type, w.img as weapon_img, w.slots as weapon_slots,
                   m.name as magazine_name, m.name_type as magazine_name_type, m.img as magazine_img, m.slots as magazine_slots
            FROM weapon_kits wk
            LEFT JOIN weapons w ON wk.weapon_id = w.id
            LEFT JOIN magazines m ON wk.magazine_id = m.id
            ORDER BY wk.created_at DESC
        """)
        kits = [dict(row) for row in cursor.fetchall()]
        
        # Adicionar attachments para cada kit
        for kit in kits:
            cursor.execute("""
                SELECT a.* FROM attachments a
                INNER JOIN weapon_kit_attachments wka ON a.id = wka.attachment_id
                WHERE wka.kit_id = ?
            """, (kit['id'],))
            kit['attachments'] = [dict(row) for row in cursor.fetchall()]
        
        return kits

def get_weapon_kit_by_id(kit_id: int) -> Optional[Dict]:
    """Busca um kit de arma específico com todos os detalhes"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT wk.*, 
                   w.name as weapon_name, w.name_type as weapon_name_type, w.img as weapon_img, w.slots as weapon_slots,
                   m.name as magazine_name, m.name_type as magazine_name_type, m.img as magazine_img, m.slots as magazine_slots
            FROM weapon_kits wk
            LEFT JOIN weapons w ON wk.weapon_id = w.id
            LEFT JOIN magazines m ON wk.magazine_id = m.id
            WHERE wk.id = ?
        """, (kit_id,))
        kit = cursor.fetchone()
        
        if not kit:
            return None
        
        kit_dict = dict(kit)
        
        # Buscar attachments
        cursor.execute("""
            SELECT a.* FROM attachments a
            INNER JOIN weapon_kit_attachments wka ON a.id = wka.attachment_id
            WHERE wka.kit_id = ?
        """, (kit_id,))
        kit_dict['attachments'] = [dict(row) for row in cursor.fetchall()]
        
        return kit_dict

def create_weapon_kit(data: Dict) -> int:
    """Cria um novo kit de arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Validar que há apenas 1 attachment por tipo
        if 'attachments' in data:
            if not validate_weapon_kit_attachments(conn, data['attachments']):
                raise ValueError("Não é permitido ter mais de um attachment do mesmo tipo")
        
        # Criar kit
        cursor.execute("""
            INSERT INTO weapon_kits (name, weapon_id, magazine_id)
            VALUES (?, ?, ?)
        """, (data['name'], data['weapon_id'], data.get('magazine_id')))
        
        kit_id = cursor.lastrowid
        
        # Adicionar attachments
        if 'attachments' in data and data['attachments']:
            for attachment_id in data['attachments']:
                cursor.execute("""
                    INSERT INTO weapon_kit_attachments (kit_id, attachment_id)
                    VALUES (?, ?)
                """, (kit_id, attachment_id))
        
        conn.commit()
        return kit_id

def update_weapon_kit(kit_id: int, data: Dict) -> bool:
    """Atualiza um kit de arma existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Validar que há apenas 1 attachment por tipo
        if 'attachments' in data:
            if not validate_weapon_kit_attachments(conn, data['attachments']):
                raise ValueError("Não é permitido ter mais de um attachment do mesmo tipo")
        
        # Atualizar kit
        cursor.execute("""
            UPDATE weapon_kits 
            SET name=?, weapon_id=?, magazine_id=?
            WHERE id=?
        """, (data['name'], data['weapon_id'], data.get('magazine_id'), kit_id))
        
        # Remover attachments antigos
        cursor.execute("DELETE FROM weapon_kit_attachments WHERE kit_id=?", (kit_id,))
        
        # Adicionar novos attachments
        if 'attachments' in data and data['attachments']:
            for attachment_id in data['attachments']:
                cursor.execute("""
                    INSERT INTO weapon_kit_attachments (kit_id, attachment_id)
                    VALUES (?, ?)
                """, (kit_id, attachment_id))
        
        conn.commit()
        return cursor.rowcount > 0

def delete_weapon_kit(kit_id: int) -> bool:
    """Exclui um kit de arma"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM weapon_kits WHERE id=?", (kit_id,))
        conn.commit()
        return cursor.rowcount > 0

def validate_weapon_kit_attachments(conn, attachment_ids: List[int]) -> bool:
    """Valida que não há mais de um attachment do mesmo tipo"""
    if not attachment_ids:
        return True
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT type, COUNT(*) as count
        FROM attachments
        WHERE id IN ({})
        GROUP BY type
        HAVING COUNT(*) > 1
    """.format(','.join('?' * len(attachment_ids))), attachment_ids)
    
    result = cursor.fetchone()
    return result is None

# ============================================================================
# CRUD LOOT KITS
# ============================================================================

def get_loot_kits() -> List[Dict]:
    """Lista todos os kits de loot com detalhes"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT lk.*, 
                   i.name as container_name, i.name_type as container_name_type, 
                   i.img as container_img, i.storage_slots
            FROM loot_kits lk
            INNER JOIN item i ON lk.container_item_id = i.id
            ORDER BY lk.created_at DESC
        """)
        kits = [dict(row) for row in cursor.fetchall()]
        
        # Adicionar items e weapon kits para cada kit de loot
        for kit in kits:
            # Itens avulsos
            cursor.execute("""
                SELECT i.*, lki.quantity
                FROM item i
                INNER JOIN loot_kit_items lki ON i.id = lki.item_id
                WHERE lki.loot_kit_id = ?
            """, (kit['id'],))
            kit['items'] = [dict(row) for row in cursor.fetchall()]
            
            # Kits de arma
            cursor.execute("""
                SELECT wk.*, 
                       w.name_type as weapon_name_type,
                       m.name_type as magazine_name_type,
                       lkwk.quantity
                FROM weapon_kits wk
                INNER JOIN loot_kit_weapon_kits lkwk ON wk.id = lkwk.weapon_kit_id
                LEFT JOIN weapons w ON wk.weapon_id = w.id
                LEFT JOIN magazines m ON wk.magazine_id = m.id
                WHERE lkwk.loot_kit_id = ?
            """, (kit['id'],))
            weapon_kits = [dict(row) for row in cursor.fetchall()]
            
            # Adicionar attachments para cada weapon kit
            for wkit in weapon_kits:
                cursor.execute("""
                    SELECT a.* FROM attachments a
                    INNER JOIN weapon_kit_attachments wka ON a.id = wka.attachment_id
                    WHERE wka.kit_id = ?
                """, (wkit['id'],))
                wkit['attachments'] = [dict(row) for row in cursor.fetchall()]
            
            kit['weapon_kits'] = weapon_kits
            
            # Explosivos
            cursor.execute("""
                SELECT e.*, lke.quantity
                FROM explosives e
                INNER JOIN loot_kit_explosives lke ON e.id = lke.explosive_id
                WHERE lke.loot_kit_id = ?
            """, (kit['id'],))
            kit['explosives'] = [dict(row) for row in cursor.fetchall()]
            
            # Munições
            cursor.execute("""
                SELECT a.*, lka.quantity
                FROM ammunitions a
                INNER JOIN loot_kit_ammunitions lka ON a.id = lka.ammunition_id
                WHERE lka.loot_kit_id = ?
            """, (kit['id'],))
            kit['ammunitions'] = [dict(row) for row in cursor.fetchall()]
            
            # Magazines
            cursor.execute("""
                SELECT m.*, lkm.quantity
                FROM magazines m
                INNER JOIN loot_kit_magazines lkm ON m.id = lkm.magazine_id
                WHERE lkm.loot_kit_id = ?
            """, (kit['id'],))
            kit['magazines'] = [dict(row) for row in cursor.fetchall()]
            
            # Attachments
            cursor.execute("""
                SELECT att.*, lka.quantity
                FROM attachments att
                INNER JOIN loot_kit_attachments lka ON att.id = lka.attachment_id
                WHERE lka.loot_kit_id = ?
            """, (kit['id'],))
            kit['attachments'] = [dict(row) for row in cursor.fetchall()]
        
        return kits

def get_loot_kit_by_id(kit_id: int) -> Optional[Dict]:
    """Busca um kit de loot específico com todos os detalhes"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT lk.*, 
                   i.name as container_name, i.name_type as container_name_type, 
                   i.img as container_img, i.storage_slots
            FROM loot_kits lk
            INNER JOIN item i ON lk.container_item_id = i.id
            WHERE lk.id = ?
        """, (kit_id,))
        kit = cursor.fetchone()
        
        if not kit:
            return None
        
        kit_dict = dict(kit)
        
        # Buscar itens avulsos
        cursor.execute("""
            SELECT i.*, lki.quantity
            FROM item i
            INNER JOIN loot_kit_items lki ON i.id = lki.item_id
            WHERE lki.loot_kit_id = ?
        """, (kit_id,))
        kit_dict['items'] = [dict(row) for row in cursor.fetchall()]
        
        # Buscar kits de arma com detalhes completos
        cursor.execute("""
            SELECT wk.*, 
                   w.name_type as weapon_name_type,
                   m.name_type as magazine_name_type,
                   lkwk.quantity
            FROM weapon_kits wk
            INNER JOIN loot_kit_weapon_kits lkwk ON wk.id = lkwk.weapon_kit_id
            LEFT JOIN weapons w ON wk.weapon_id = w.id
            LEFT JOIN magazines m ON wk.magazine_id = m.id
            WHERE lkwk.loot_kit_id = ?
        """, (kit_id,))
        weapon_kits = [dict(row) for row in cursor.fetchall()]
        
        # Adicionar attachments para cada weapon kit
        for wkit in weapon_kits:
            cursor.execute("""
                SELECT a.* FROM attachments a
                INNER JOIN weapon_kit_attachments wka ON a.id = wka.attachment_id
                WHERE wka.kit_id = ?
            """, (wkit['id'],))
            wkit['attachments'] = [dict(row) for row in cursor.fetchall()]
        
        kit_dict['weapon_kits'] = weapon_kits
        
        # Buscar explosivos
        cursor.execute("""
            SELECT e.*, lke.quantity
            FROM explosives e
            INNER JOIN loot_kit_explosives lke ON e.id = lke.explosive_id
            WHERE lke.loot_kit_id = ?
        """, (kit_id,))
        kit_dict['explosives'] = [dict(row) for row in cursor.fetchall()]
        
        # Buscar munições
        cursor.execute("""
            SELECT a.*, lka.quantity
            FROM ammunitions a
            INNER JOIN loot_kit_ammunitions lka ON a.id = lka.ammunition_id
            WHERE lka.loot_kit_id = ?
        """, (kit_id,))
        kit_dict['ammunitions'] = [dict(row) for row in cursor.fetchall()]
        
        # Buscar magazines
        cursor.execute("""
            SELECT m.*, lkm.quantity
            FROM magazines m
            INNER JOIN loot_kit_magazines lkm ON m.id = lkm.magazine_id
            WHERE lkm.loot_kit_id = ?
        """, (kit_id,))
        kit_dict['magazines'] = [dict(row) for row in cursor.fetchall()]
        
        # Buscar attachments
        cursor.execute("""
            SELECT att.*, lka.quantity
            FROM attachments att
            INNER JOIN loot_kit_attachments lka ON att.id = lka.attachment_id
            WHERE lka.loot_kit_id = ?
        """, (kit_id,))
        kit_dict['attachments'] = [dict(row) for row in cursor.fetchall()]
        
        return kit_dict

def create_loot_kit(data: Dict) -> int:
    """Cria um novo kit de loot"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Criar kit
        cursor.execute("""
            INSERT INTO loot_kits (name, container_item_id)
            VALUES (?, ?)
        """, (data['name'], data['container_item_id']))
        
        kit_id = cursor.lastrowid
        
        # Adicionar itens avulsos
        if 'items' in data and data['items']:
            for item_data in data['items']:
                cursor.execute("""
                    INSERT INTO loot_kit_items (loot_kit_id, item_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, item_data['item_id'], item_data['quantity']))
        
        # Adicionar kits de arma
        if 'weapon_kits' in data and data['weapon_kits']:
            for kit_data in data['weapon_kits']:
                cursor.execute("""
                    INSERT INTO loot_kit_weapon_kits (loot_kit_id, weapon_kit_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, kit_data['weapon_kit_id'], kit_data['quantity']))
        
        # Adicionar explosivos
        if 'explosives' in data and data['explosives']:
            for exp_data in data['explosives']:
                cursor.execute("""
                    INSERT INTO loot_kit_explosives (loot_kit_id, explosive_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, exp_data['explosive_id'], exp_data['quantity']))
        
        # Adicionar munições
        if 'ammunitions' in data and data['ammunitions']:
            for ammo_data in data['ammunitions']:
                cursor.execute("""
                    INSERT INTO loot_kit_ammunitions (loot_kit_id, ammunition_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, ammo_data['ammunition_id'], ammo_data['quantity']))
        
        # Adicionar magazines
        if 'magazines' in data and data['magazines']:
            for mag_data in data['magazines']:
                cursor.execute("""
                    INSERT INTO loot_kit_magazines (loot_kit_id, magazine_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, mag_data['magazine_id'], mag_data['quantity']))
        
        # Adicionar attachments
        if 'attachments' in data and data['attachments']:
            for att_data in data['attachments']:
                cursor.execute("""
                    INSERT INTO loot_kit_attachments (loot_kit_id, attachment_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, att_data['attachment_id'], att_data['quantity']))
        
        conn.commit()
        return kit_id

def update_loot_kit(kit_id: int, data: Dict) -> bool:
    """Atualiza um kit de loot existente"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        # Atualizar kit
        cursor.execute("""
            UPDATE loot_kits 
            SET name=?, container_item_id=?
            WHERE id=?
        """, (data['name'], data['container_item_id'], kit_id))
        
        # Remover itens antigos
        cursor.execute("DELETE FROM loot_kit_items WHERE loot_kit_id=?", (kit_id,))
        cursor.execute("DELETE FROM loot_kit_weapon_kits WHERE loot_kit_id=?", (kit_id,))
        cursor.execute("DELETE FROM loot_kit_explosives WHERE loot_kit_id=?", (kit_id,))
        cursor.execute("DELETE FROM loot_kit_ammunitions WHERE loot_kit_id=?", (kit_id,))
        cursor.execute("DELETE FROM loot_kit_magazines WHERE loot_kit_id=?", (kit_id,))
        cursor.execute("DELETE FROM loot_kit_attachments WHERE loot_kit_id=?", (kit_id,))
        
        # Adicionar novos itens avulsos
        if 'items' in data and data['items']:
            for item_data in data['items']:
                cursor.execute("""
                    INSERT INTO loot_kit_items (loot_kit_id, item_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, item_data['item_id'], item_data['quantity']))
        
        # Adicionar novos kits de arma
        if 'weapon_kits' in data and data['weapon_kits']:
            for kit_data in data['weapon_kits']:
                cursor.execute("""
                    INSERT INTO loot_kit_weapon_kits (loot_kit_id, weapon_kit_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, kit_data['weapon_kit_id'], kit_data['quantity']))
        
        # Adicionar novos explosivos
        if 'explosives' in data and data['explosives']:
            for exp_data in data['explosives']:
                cursor.execute("""
                    INSERT INTO loot_kit_explosives (loot_kit_id, explosive_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, exp_data['explosive_id'], exp_data['quantity']))
        
        # Adicionar novas munições
        if 'ammunitions' in data and data['ammunitions']:
            for ammo_data in data['ammunitions']:
                cursor.execute("""
                    INSERT INTO loot_kit_ammunitions (loot_kit_id, ammunition_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, ammo_data['ammunition_id'], ammo_data['quantity']))
        
        # Adicionar novos magazines
        if 'magazines' in data and data['magazines']:
            for mag_data in data['magazines']:
                cursor.execute("""
                    INSERT INTO loot_kit_magazines (loot_kit_id, magazine_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, mag_data['magazine_id'], mag_data['quantity']))
        
        # Adicionar novos attachments
        if 'attachments' in data and data['attachments']:
            for att_data in data['attachments']:
                cursor.execute("""
                    INSERT INTO loot_kit_attachments (loot_kit_id, attachment_id, quantity)
                    VALUES (?, ?, ?)
                """, (kit_id, att_data['attachment_id'], att_data['quantity']))
        
        conn.commit()
        return cursor.rowcount > 0

def delete_loot_kit(kit_id: int) -> bool:
    """Exclui um kit de loot"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loot_kits WHERE id=?", (kit_id,))
        conn.commit()
        return cursor.rowcount > 0

def calculate_loot_kit_space(kit_id: int) -> int:
    """Calcula o espaço total usado em slots por um kit de loot"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        
        total_space = 0
        
        # Calcular espaço dos itens avulsos
        cursor.execute("""
            SELECT SUM(i.slots * lki.quantity) as total
            FROM item i
            INNER JOIN loot_kit_items lki ON i.id = lki.item_id
            WHERE lki.loot_kit_id = ?
        """, (kit_id,))
        result = cursor.fetchone()
        if result and result[0]:
            total_space += result[0]
        
        # Calcular espaço dos kits de arma
        # (assumindo que cada weapon kit ocupa o espaço da arma + acessórios)
        cursor.execute("""
            SELECT lkwk.quantity, wk.weapon_id, wk.magazine_id
            FROM loot_kit_weapon_kits lkwk
            INNER JOIN weapon_kits wk ON lkwk.weapon_kit_id = wk.id
            WHERE lkwk.loot_kit_id = ?
        """, (kit_id,))
        
        for row in cursor.fetchall():
            quantity = row[0]
            weapon_id = row[1]
            magazine_id = row[2]
            
            # Espaço da arma
            cursor.execute("SELECT slots FROM weapons WHERE id=?", (weapon_id,))
            weapon = cursor.fetchone()
            if weapon:
                total_space += weapon[0] * quantity
            
            # Espaço do magazine
            if magazine_id:
                cursor.execute("SELECT slots FROM magazines WHERE id=?", (magazine_id,))
                magazine = cursor.fetchone()
                if magazine:
                    total_space += magazine[0] * quantity
            
            # Espaço dos attachments
            cursor.execute("""
                SELECT SUM(a.slots) as total
                FROM attachments a
                INNER JOIN weapon_kit_attachments wka ON a.id = wka.attachment_id
                INNER JOIN weapon_kits wk ON wka.kit_id = wk.id
                WHERE wk.id = ?
            """, (row[1],))
            att_result = cursor.fetchone()
            if att_result and att_result[0]:
                total_space += att_result[0] * quantity
        
        # Calcular espaço dos explosivos
        cursor.execute("""
            SELECT SUM(e.slots * lke.quantity) as total
            FROM explosives e
            INNER JOIN loot_kit_explosives lke ON e.id = lke.explosive_id
            WHERE lke.loot_kit_id = ?
        """, (kit_id,))
        result = cursor.fetchone()
        if result and result[0]:
            total_space += result[0]
        
        # Calcular espaço das munições
        cursor.execute("""
            SELECT SUM(a.slots * lka.quantity) as total
            FROM ammunitions a
            INNER JOIN loot_kit_ammunitions lka ON a.id = lka.ammunition_id
            WHERE lka.loot_kit_id = ?
        """, (kit_id,))
        result = cursor.fetchone()
        if result and result[0]:
            total_space += result[0]
        
        # Calcular espaço dos magazines
        cursor.execute("""
            SELECT SUM(m.slots * lkm.quantity) as total
            FROM magazines m
            INNER JOIN loot_kit_magazines lkm ON m.id = lkm.magazine_id
            WHERE lkm.loot_kit_id = ?
        """, (kit_id,))
        result = cursor.fetchone()
        if result and result[0]:
            total_space += result[0]
        
        # Calcular espaço dos attachments
        cursor.execute("""
            SELECT SUM(att.slots * lka.quantity) as total
            FROM attachments att
            INNER JOIN loot_kit_attachments lka ON att.id = lka.attachment_id
            WHERE lka.loot_kit_id = ?
        """, (kit_id,))
        result = cursor.fetchone()
        if result and result[0]:
            total_space += result[0]
        
        return total_space

def get_storage_containers() -> List[Dict]:
    """Retorna apenas os containers permitidos para kits de loot"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM item
            WHERE name_type IN ('WoodenCrate', 'Barrel_Yellow', 'Barrel_Red', 
                               'Barrel_Green', 'Barrel_Blue', 'SeaChest')
            ORDER BY name
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_all_explosives() -> List[Dict]:
    """Retorna todos os explosivos para seleção"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, name_type, slots, width, height, img FROM explosives ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_all_ammunitions() -> List[Dict]:
    """Retorna todas as munições para seleção"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, name_type, caliber_id, slots, width, height, img FROM ammunitions ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_all_magazines() -> List[Dict]:
    """Retorna todos os magazines para seleção"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, name_type, capacity, slots, width, height, img FROM magazines ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

def get_all_attachments() -> List[Dict]:
    """Retorna todos os attachments para seleção"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, name_type, type, slots, width, height, img, battery FROM attachments ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]

# ============================================================================
# FUNÇÕES DE AUTENTICAÇÃO E GESTÃO DE USUÁRIOS
# ============================================================================

def hash_password(password: str) -> str:
    """Gera hash bcrypt da senha"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verifica se a senha corresponde ao hash"""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def authenticate_user(username: str, password: str) -> Optional[Dict]:
    """
    Valida credenciais e retorna dados do usuário
    Retorna None se inválido, dict com dados do usuário se válido
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UserID, Username, Password, UserType, PlayerID, IsActive, MustChangePassword
            FROM users
            WHERE Username = ? AND IsActive = 1
        """, (username,))
        
        result = cursor.fetchone()
        if result:
            user_data = dict(result)
            if verify_password(password, user_data['Password']):
                # Atualizar último login
                update_last_login(user_data['UserID'])
                return user_data
        return None
def get_or_create_steam_user(steam_id: str, player_id_dayz: str, steam_name: str) -> Optional[dict]:
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # 1. Tentar buscar usuário existente
        cursor.execute("SELECT * FROM users WHERE PlayerID = ?", (player_id_dayz,))
        result = cursor.fetchone()
        
        if result:
            user_data = dict(result)
            # FAÇA O UPDATE AQUI MESMO, usando a mesma conexão 'conn'
            cursor.execute("UPDATE users SET LastLogin = CURRENT_TIMESTAMP WHERE UserID = ?", (user_data['UserID'],))
            return user_data
            
        # 2. Se não existir, criar um novo já com LastLogin
        clean_name = re.sub(r'[^a-zA-Z0-9]', '', steam_name).lower()[:10]
        new_username = f"{clean_name}_{steam_id[-4:]}"
        
        cursor.execute("""
            INSERT INTO users (Username, Password, UserType, PlayerID, IsActive, MustChangePassword, LastLogin)
            VALUES (?, ?, 'player', ?, 1, 0, CURRENT_TIMESTAMP)
        """, (new_username, "EXTERNAL_STEAM_AUTH", player_id_dayz))
        
        user_id = cursor.lastrowid
        
        cursor.execute("SELECT * FROM users WHERE UserID = ?", (user_id,))
        return dict(cursor.fetchone())

def get_player_by_steam_id(steam_id: str) -> Optional[dict]:
    """Busca dados do jogador na players_database pelo SteamID64"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT PlayerID, SteamName FROM players_database WHERE SteamID = ?", (steam_id,))
        result = cursor.fetchone()
        return dict(result) if result else None

def get_user_by_username(username: str) -> Optional[Dict]:
    """Busca usuário por username"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UserID, Username, Password, UserType, PlayerID, IsActive, CreatedAt, LastLogin, MustChangePassword
            FROM users
            WHERE Username = ?
        """, (username,))
        
        result = cursor.fetchone()
        return dict(result) if result else None

def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Busca usuário por ID"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UserID, Username, Password, UserType, PlayerID, IsActive, CreatedAt, LastLogin, MustChangePassword
            FROM users
            WHERE UserID = ?
        """, (user_id,))
        
        result = cursor.fetchone()
        return dict(result) if result else None

def get_user_by_player_id(player_id: str) -> Optional[Dict]:
    """Busca usuário associado a um PlayerID específico"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UserID, Username, Password, UserType, PlayerID, IsActive, CreatedAt, LastLogin, MustChangePassword
            FROM users
            WHERE PlayerID = ?
        """, (player_id,))
        result = cursor.fetchone()
        return dict(result) if result else None

def create_user(username: str, password: str, user_type: str, player_id: Optional[str] = None) -> Optional[int]:
    """
    Cria novo usuário
    Retorna UserID se sucesso, None se username já existe
    """
    hashed_password = hash_password(password)
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO users (Username, Password, UserType, PlayerID, MustChangePassword)
                VALUES (?, ?, ?, ?, 1)
            """, (username, hashed_password, user_type, player_id))
            conn.commit()
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None

def update_user_password(user_id: int, new_password: str, force_change: bool = False) -> bool:
    """Atualiza senha do usuário"""
    hashed_password = hash_password(new_password)
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET Password = ?, MustChangePassword = ?
            WHERE UserID = ?
        """, (hashed_password, 1 if force_change else 0, user_id))
        conn.commit()
        return cursor.rowcount > 0

def update_user_player_link(user_id: int, player_id: Optional[str]) -> bool:
    """Atualiza vínculo de PlayerID do usuário (permite definir ou remover)"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET PlayerID = ?
            WHERE UserID = ?
        """, (player_id, user_id))
        conn.commit()
        return cursor.rowcount > 0

def update_last_login(user_id: int) -> bool:
    """Atualiza timestamp de último login"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET LastLogin = CURRENT_TIMESTAMP
            WHERE UserID = ?
        """, (user_id,))
        conn.commit()
        return cursor.rowcount > 0

def deactivate_user(user_id: int) -> bool:
    """Desativa usuário (não remove do banco)"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET IsActive = 0
            WHERE UserID = ?
        """, (user_id,))
        conn.commit()
        return cursor.rowcount > 0

def activate_user(user_id: int) -> bool:
    """Ativa usuário"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users
            SET IsActive = 1
            WHERE UserID = ?
        """, (user_id,))
        conn.commit()
        return cursor.rowcount > 0

def delete_user(user_id: int) -> bool:
    """Exclui usuário permanentemente do banco de dados"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE UserID = ?", (user_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_all_admins() -> List[Dict]:
    """Lista todos admins normais (ativo)"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT UserID, Username, UserType, PlayerID, CreatedAt, LastLogin
            FROM users
            WHERE UserType = ? AND IsActive = 1
            ORDER BY CreatedAt DESC
        """, (config.USER_TYPE_ADMIN,))
        return [dict(row) for row in cursor.fetchall()]

def link_player_to_user(player_id: str, username: str, password: str) -> Optional[int]:
    """
    Vincula jogador a usuário (cria usuário tipo player)
    Retorna UserID se sucesso, None se username já existe
    """
    return create_user(username, password, config.USER_TYPE_PLAYER, player_id)

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Valida força da senha
    Retorna (True, "") se válida, (False, mensagem_erro) se inválida
    """
    if len(password) < 8:
        return False, "Senha deve ter no mínimo 8 caracteres"
    return True, ""

def get_all_users() -> List[Dict]:
    """
    Retorna todos os usuários (admin e player) com informações do jogador vinculado
    Não inclui senhas por segurança
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                u.UserID,
                u.Username,
                u.UserType,
                u.PlayerID,
                u.IsActive,
                u.CreatedAt,
                u.LastLogin,
                u.MustChangePassword,
                pd.PlayerName,
                pd.SteamID,
                pd.SteamName,
                COALESCE(lp.LoadoutCount, 0) AS PlayerLoadoutCount
            FROM users u
            LEFT JOIN players_database pd ON u.PlayerID = pd.PlayerID
            LEFT JOIN (
                SELECT player_id, COUNT(*) AS LoadoutCount
                FROM loadouts_players
                GROUP BY player_id
            ) lp ON u.PlayerID = lp.player_id
            ORDER BY u.CreatedAt DESC
        """)
        
        results = []
        for row in cursor.fetchall():
            user_data = dict(row)
            if 'PlayerLoadoutCount' in user_data and user_data['PlayerLoadoutCount'] is None:
                user_data['PlayerLoadoutCount'] = 0
            results.append(user_data)
        
        return results

def log_user_action(user_id: Optional[int], username: str, action: str, 
                    details: Optional[Dict] = None, ip_address: Optional[str] = None) -> bool:
    """
    Registra ação do usuário no log de auditoria
    
    Args:
        user_id: ID do usuário (None para super_admin)
        username: Nome do usuário
        action: Ação realizada (LOGIN, LOGOUT, CREATE_USER, UPDATE_USER, etc)
        details: Detalhes adicionais em formato dict (será convertido para JSON)
        ip_address: Endereço IP do usuário
    """
    import json
    
    details_json = json.dumps(details, ensure_ascii=False) if details else None
    
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_audit_logs (UserID, Username, Action, Details, IPAddress)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, username, action, details_json, ip_address))
        conn.commit()
        return cursor.rowcount > 0

def get_user_audit_logs(limit: int = 1000, user_id: Optional[int] = None, 
                        action: Optional[str] = None,
                        start_date: Optional[str] = None,
                        end_date: Optional[str] = None) -> List[Dict]:
    """Retorna logs de auditoria com filtros opcionais"""
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        
        query = "SELECT * FROM user_audit_logs WHERE 1=1"
        params = []
        
        if user_id is not None:
            query += " AND UserID = ?"
            params.append(user_id)
        
        if action:
            query += " AND Action = ?"
            params.append(action)
        
        if start_date:
            query += " AND TimeStamp >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND TimeStamp <= ?"
            params.append(end_date)
        
        query += " ORDER BY TimeStamp DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_unique_audit_actions() -> List[str]:
    """Retorna lista de ações únicas registradas nos logs"""
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Action FROM user_audit_logs ORDER BY Action")
        return [row[0] for row in cursor.fetchall()]

# ============================================================================
# FUNÇÕES DE LOADOUTS
# ============================================================================

# ============================================================================
# LOADOUTS CUSTOM
# ============================================================================

# Loadouts protegidos que não podem ser renomeados, desativados ou deletados
PROTECTED_LOADOUTS = ['admin', 'deathmatch']

def get_loadouts_custom() -> List[Dict]:
    """Retorna todos os loadouts custom"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, is_active, loadout_data, created_at, updated_at
            FROM loadouts_custom
            ORDER BY name
        """)
        results = []
        for row in cursor.fetchall():
            loadout = dict(row)
            loadout['loadout_data'] = json.loads(loadout['loadout_data'])
            results.append(loadout)
        return results

def get_loadout_custom_by_id(loadout_id: int) -> Optional[Dict]:
    """Retorna um loadout custom por ID"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, is_active, loadout_data, created_at, updated_at
            FROM loadouts_custom
            WHERE id = ?
        """, (loadout_id,))
        row = cursor.fetchone()
        if row:
            loadout = dict(row)
            loadout['loadout_data'] = json.loads(loadout['loadout_data'])
            return loadout
        return None

def create_loadout_custom(name: str, is_active: bool, loadout_data: Dict) -> Optional[int]:
    """Cria um novo loadout custom"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        loadout_json = json.dumps(loadout_data, ensure_ascii=False)
        cursor.execute("""
            INSERT INTO loadouts_custom (name, is_active, loadout_data, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """, (name, 1 if is_active else 0, loadout_json))
        conn.commit()
        return cursor.lastrowid if cursor.rowcount > 0 else None

def update_loadout_custom(loadout_id: int, name: str, is_active: bool, loadout_data: Dict) -> bool:
    """Atualiza um loadout custom"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Verificar se o loadout atual é protegido
        cursor.execute("SELECT name FROM loadouts_custom WHERE id = ?", (loadout_id,))
        result = cursor.fetchone()
        if not result:
            return False
        
        current_name = result[0]
        is_protected = current_name.lower() in [p.lower() for p in PROTECTED_LOADOUTS]
        
        # Se protegido, só permitir atualização do loadout_data
        if is_protected:
            loadout_json = json.dumps(loadout_data, ensure_ascii=False)
            cursor.execute("""
                UPDATE loadouts_custom
                SET loadout_data = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (loadout_json, loadout_id))
        else:
            loadout_json = json.dumps(loadout_data, ensure_ascii=False)
            cursor.execute("""
                UPDATE loadouts_custom
                SET name = ?, is_active = ?, loadout_data = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (name, 1 if is_active else 0, loadout_json, loadout_id))
        
        conn.commit()
        return cursor.rowcount > 0

def delete_loadout_custom(loadout_id: int) -> bool:
    """Deleta um loadout custom"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Verificar se o loadout é protegido
        cursor.execute("SELECT name FROM loadouts_custom WHERE id = ?", (loadout_id,))
        result = cursor.fetchone()
        if not result:
            return False
        
        current_name = result[0]
        is_protected = current_name.lower() in [p.lower() for p in PROTECTED_LOADOUTS]
        
        # Não permitir deletar loadouts protegidos
        if is_protected:
            return False
        
        cursor.execute("DELETE FROM loadouts_custom WHERE id = ?", (loadout_id,))
        conn.commit()
        return cursor.rowcount > 0

def ensure_protected_loadouts_exist():
    """Garante que os loadouts protegidos existam no banco de dados"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        for protected_name in PROTECTED_LOADOUTS:
            # Verificar se já existe
            cursor.execute("SELECT id FROM loadouts_custom WHERE LOWER(name) = LOWER(?)", (protected_name,))
            existing = cursor.fetchone()
            
            if not existing:
                # Criar loadout vazio
                empty_loadout = {
                    "weapons": {},
                    "explosives": [],
                    "items": []
                }
                loadout_json = json.dumps(empty_loadout, ensure_ascii=False)
                cursor.execute("""
                    INSERT INTO loadouts_custom (name, is_active, loadout_data, created_at, updated_at)
                    VALUES (?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (protected_name, loadout_json))
        
        conn.commit()

# ============================================================================
# LOADOUTS PLAYERS
# ============================================================================

def get_loadouts_by_player(player_id: str) -> List[Dict]:
    """Retorna todos os loadouts de um jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, player_id, loadout_id, name, is_active, loadout_data, created_at, updated_at
            FROM loadouts_players
            WHERE player_id = ?
            ORDER BY loadout_id
        """, (player_id,))
        results = []
        for row in cursor.fetchall():
            loadout = dict(row)
            loadout['loadout_data'] = json.loads(loadout['loadout_data'])
            results.append(loadout)
        return results

def get_loadout_player_by_id(loadout_id: int) -> Optional[Dict]:
    """Retorna um loadout de player por ID do banco"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, player_id, loadout_id, name, is_active, loadout_data, created_at, updated_at
            FROM loadouts_players
            WHERE id = ?
        """, (loadout_id,))
        row = cursor.fetchone()
        if row:
            loadout = dict(row)
            loadout['loadout_data'] = json.loads(loadout['loadout_data'])
            return loadout
        return None

def create_loadout_player(player_id: str, loadout_id: int, name: str, is_active: bool, loadout_data: Dict) -> Optional[int]:
    """Cria um novo loadout para um jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Se loadout_id for None, calcular automaticamente o próximo ID disponível
        if loadout_id is None:
            cursor.execute("""
                SELECT MAX(loadout_id) FROM loadouts_players WHERE player_id = ?
            """, (player_id,))
            result = cursor.fetchone()
            max_id = result[0] if result[0] is not None else 0
            loadout_id = max_id + 1
        
        loadout_json = json.dumps(loadout_data, ensure_ascii=False)
        cursor.execute("""
            INSERT INTO loadouts_players (player_id, loadout_id, name, is_active, loadout_data, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (player_id, loadout_id, name, 1 if is_active else 0, loadout_json))
        conn.commit()
        return cursor.lastrowid if cursor.rowcount > 0 else None

def update_loadout_player(db_id: int, loadout_id: int, name: str, is_active: bool, loadout_data: Dict) -> bool:
    """Atualiza um loadout de player"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        loadout_json = json.dumps(loadout_data, ensure_ascii=False)
        cursor.execute("""
            UPDATE loadouts_players
            SET loadout_id = ?, name = ?, is_active = ?, loadout_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (loadout_id, name, 1 if is_active else 0, loadout_json, db_id))
        conn.commit()
        return cursor.rowcount > 0

def reorder_player_loadout_ids(player_id: str) -> bool:
    """Reordena os IDs dos loadouts de um jogador sequencialmente (1, 2, 3...)"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Buscar todos loadouts do jogador ordenados por loadout_id
        cursor.execute("""
            SELECT id, loadout_id 
            FROM loadouts_players 
            WHERE player_id = ? 
            ORDER BY loadout_id
        """, (player_id,))
        loadouts = cursor.fetchall()
        
        # Atualizar IDs sequencialmente
        for index, loadout in enumerate(loadouts, start=1):
            new_loadout_id = index
            old_loadout_id = loadout['loadout_id']
            
            # Só atualizar se o ID mudou
            if new_loadout_id != old_loadout_id:
                cursor.execute("""
                    UPDATE loadouts_players 
                    SET loadout_id = ? 
                    WHERE id = ?
                """, (new_loadout_id, loadout['id']))
        
        conn.commit()
        return True

def delete_loadout_player(db_id: int) -> bool:
    """Deleta um loadout de player"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Buscar player_id antes de deletar
        cursor.execute("SELECT player_id FROM loadouts_players WHERE id = ?", (db_id,))
        result = cursor.fetchone()
        if not result:
            return False
        
        player_id = result[0]
        
        # Deletar loadout
        cursor.execute("DELETE FROM loadouts_players WHERE id = ?", (db_id,))
        conn.commit()
        
        # Reordenar IDs após deletar
        reorder_player_loadout_ids(player_id)
        
        return True

def get_players_with_loadouts() -> List[Dict]:
    """Retorna lista de jogadores que possuem loadouts"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT lp.player_id, pd.PlayerName, pd.SteamID, pd.SteamName
            FROM loadouts_players lp
            LEFT JOIN players_database pd ON lp.player_id = pd.PlayerID
            ORDER BY pd.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

# ============================================================================
# SINCRONIZAÇÃO COM ARQUIVOS JSON
# ============================================================================

def _get_player_id_base64(player_id: str) -> str:
    """Converte PlayerID para base64"""
    return base64.b64encode(player_id.encode('utf-8')).decode('utf-8')

def load_custom_loadouts_from_file() -> List[Dict]:
    """Carrega loadouts custom do arquivo JSON"""
    try:
        if not os.path.exists(config.LOADOUTS_CUSTOM_FILE):
            return []
        
        with open(config.LOADOUTS_CUSTOM_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"Erro ao carregar loadouts custom do arquivo: {str(e)}")
        return []

def sync_custom_loadouts_to_file() -> bool:
    """Sincroniza loadouts custom do banco para o arquivo JSON"""
    try:
        loadouts = get_loadouts_custom()
        
        # Converter para formato do arquivo JSON
        json_data = []
        for loadout in loadouts:
            json_data.append({
                "Id": loadout['id'],
                "Name": loadout['name'],
                "IsActive": bool(loadout['is_active']),
                "Loadout": loadout['loadout_data']
            })
        
        # Garantir que o diretório existe
        os.makedirs(os.path.dirname(config.LOADOUTS_CUSTOM_FILE), exist_ok=True)
        
        # Escrever arquivo com formatação
        with open(config.LOADOUTS_CUSTOM_FILE, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=4, ensure_ascii=False)
        
        return True
    except Exception as e:
        print(f"Erro ao sincronizar loadouts custom para arquivo: {str(e)}")
        return False

def load_player_loadouts_from_file(player_id: str) -> List[Dict]:
    """Carrega loadouts de um jogador do arquivo JSON"""
    try:
        player_id_base64 = _get_player_id_base64(player_id)
        file_path = os.path.join(config.LOADOUTS_PLAYERS_DIR, f"{player_id_base64}.json")
        
        if not os.path.exists(file_path):
            return []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"Erro ao carregar loadouts do player do arquivo: {str(e)}")
        return []

def sync_player_loadouts_to_file(player_id: str) -> bool:
    """Sincroniza loadouts de um jogador do banco para o arquivo JSON"""
    try:
        loadouts = get_loadouts_by_player(player_id)
        
        if not loadouts:
            # Se não há loadouts, remover arquivo se existir
            player_id_base64 = _get_player_id_base64(player_id)
            file_path = os.path.join(config.LOADOUTS_PLAYERS_DIR, f"{player_id_base64}.json")
            if os.path.exists(file_path):
                os.remove(file_path)
            return True
        
        # Converter para formato do arquivo JSON
        json_data = []
        active_count = 0
        first_active_index = None
        
        for idx, loadout in enumerate(loadouts):
            is_active = bool(loadout['is_active'])
            
            # Contar quantos loadouts estão ativos
            if is_active:
                active_count += 1
                if first_active_index is None:
                    first_active_index = idx
            
            json_data.append({
                "Id": loadout['loadout_id'],
                "Name": loadout['name'],
                "IsActive": is_active,
                "Loadout": loadout['loadout_data']
            })
        
        # Validação: garantir que apenas um loadout fique ativo no JSON
        # Se houver múltiplos ativos (caso raro de inconsistência), manter apenas o primeiro
        if active_count > 1:
            for idx, loadout_json in enumerate(json_data):
                if idx != first_active_index and loadout_json['IsActive']:
                    loadout_json['IsActive'] = False
                    # Também atualizar no banco para manter consistência
                    loadout = loadouts[idx]
                    update_loadout_player(loadout['id'], loadout['loadout_id'], loadout['name'], False, loadout['loadout_data'])
        
        # Garantir que o diretório existe
        os.makedirs(config.LOADOUTS_PLAYERS_DIR, exist_ok=True)
        
        # Escrever arquivo com formatação
        player_id_base64 = _get_player_id_base64(player_id)
        file_path = os.path.join(config.LOADOUTS_PLAYERS_DIR, f"{player_id_base64}.json")
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=4, ensure_ascii=False)
        
        # Atualizar players_ids.json
        update_players_ids_json(player_id)
        
        return True
    except Exception as e:
        print(f"Erro ao sincronizar loadouts do player para arquivo: {str(e)}")
        return False

def update_players_ids_json(player_id: str) -> bool:
    """Atualiza o arquivo players_ids.json com o mapeamento de PlayerID"""
    try:
        player_id_base64 = _get_player_id_base64(player_id)
        
        # Carregar arquivo existente
        players_ids = []
        if os.path.exists(config.LOADOUTS_PLAYERS_IDS_FILE):
            with open(config.LOADOUTS_PLAYERS_IDS_FILE, 'r', encoding='utf-8') as f:
                players_ids = json.load(f)
                if not isinstance(players_ids, list):
                    players_ids = []
        
        # Verificar se já existe
        exists = False
        for entry in players_ids:
            if entry.get('PlayerId') == player_id:
                exists = True
                entry['PlayerIdBase64'] = player_id_base64
                break
        
        # Se não existe, adicionar
        if not exists:
            players_ids.append({
                "PlayerId": player_id,
                "PlayerIdBase64": player_id_base64
            })
        
        # Garantir que o diretório existe
        os.makedirs(os.path.dirname(config.LOADOUTS_PLAYERS_IDS_FILE), exist_ok=True)
        
        # Escrever arquivo
        with open(config.LOADOUTS_PLAYERS_IDS_FILE, 'w', encoding='utf-8') as f:
            json.dump(players_ids, f, indent=4, ensure_ascii=False)
        
        return True
    except Exception as e:
        print(f"Erro ao atualizar players_ids.json: {str(e)}")
        return False

def migrate_custom_loadouts_from_files() -> bool:
    """Migra arquivos JSON existentes do diretório custom/ para custom.json"""
    try:
        custom_dir = os.path.join(config.LOADOUTS_BASE_PATH, 'custom')
        if not os.path.exists(custom_dir):
            return True
        
        all_loadouts = []
        
        # Ler todos os arquivos JSON do diretório custom/
        for filename in os.listdir(custom_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(custom_dir, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            all_loadouts.extend(data)
                        elif isinstance(data, dict):
                            all_loadouts.append(data)
                except Exception as e:
                    print(f"Erro ao ler arquivo {filename}: {str(e)}")
        
        # Se encontrou loadouts, salvar no banco e no arquivo custom.json
        if all_loadouts:
            # Primeiro salvar no banco
            for loadout_item in all_loadouts:
                if isinstance(loadout_item, dict) and 'Loadout' in loadout_item:
                    loadout_id = loadout_item.get('Id', 0)
                    name = loadout_item.get('Name', 'Sem nome')
                    is_active = loadout_item.get('IsActive', False)
                    loadout_data = loadout_item.get('Loadout', {})
                    
                    # Verificar se já existe no banco
                    existing = None
                    if loadout_id > 0:
                        existing = get_loadout_custom_by_id(loadout_id)
                    
                    if existing:
                        update_loadout_custom(loadout_id, name, is_active, loadout_data)
                    else:
                        create_loadout_custom(name, is_active, loadout_data)
            
            # Depois sincronizar com arquivo
            sync_custom_loadouts_to_file()
        
        return True
    except Exception as e:
        print(f"Erro ao migrar loadouts custom: {str(e)}")
        return False

# ============================================================================
# FUNÇÕES DE REGRAS PARA LOADOUTS DE PLAYERS
# ============================================================================

# === WEAPONS ===
def get_loadout_rules_weapons() -> List[Dict]:
    """Retorna lista de armas com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.id, w.name, w.name_type, w.feed_type, w.slots, w.width, w.height, w.img,
                   lrw.id as rule_id, lrw.max_quantity,
                   CASE 
                       WHEN lrw.id IS NOT NULL AND lrw.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM weapons w
            LEFT JOIN loadout_rules_weapons lrw ON w.id = lrw.weapon_id
            ORDER BY is_banned DESC, w.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_weapon_for_loadout(weapon_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane uma arma para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_weapons (weapon_id, max_quantity)
            VALUES (?, ?)
        """, (weapon_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_weapon_for_loadout(weapon_id: int) -> bool:
    """Remove ban de uma arma para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_weapons WHERE weapon_id = ?", (weapon_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_weapon_max_quantity(weapon_id: int, max_quantity: Optional[int]) -> bool:
    """Define quantidade máxima de uma arma (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_weapons WHERE weapon_id = ?", (weapon_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_weapons 
                SET max_quantity = ? 
                WHERE weapon_id = ?
            """, (max_quantity, weapon_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_weapons (weapon_id, max_quantity)
                VALUES (?, ?)
            """, (weapon_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

# === MAGAZINES ===
def get_loadout_rules_magazines() -> List[Dict]:
    """Retorna lista de magazines com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.id, m.name, m.name_type, m.capacity, m.slots, m.width, m.height, m.img,
                   lrm.id as rule_id, lrm.max_quantity,
                   CASE 
                       WHEN lrm.id IS NOT NULL AND lrm.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM magazines m
            LEFT JOIN loadout_rules_magazines lrm ON m.id = lrm.magazine_id
            ORDER BY is_banned DESC, m.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_magazine_for_loadout(magazine_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane um magazine para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_magazines (magazine_id, max_quantity)
            VALUES (?, ?)
        """, (magazine_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_magazine_for_loadout(magazine_id: int) -> bool:
    """Remove ban de um magazine para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_magazines WHERE magazine_id = ?", (magazine_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_magazine_max_quantity(magazine_id: int, max_quantity: Optional[int]) -> bool:
    """Define quantidade máxima de um magazine (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_magazines WHERE magazine_id = ?", (magazine_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_magazines 
                SET max_quantity = ? 
                WHERE magazine_id = ?
            """, (max_quantity, magazine_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_magazines (magazine_id, max_quantity)
                VALUES (?, ?)
            """, (magazine_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

# === AMMUNITIONS ===
def get_loadout_rules_ammunitions() -> List[Dict]:
    """Retorna lista de ammunitions com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.name, a.name_type, a.caliber_id, a.slots, a.width, a.height, a.img,
                   lra.id as rule_id, lra.max_quantity,
                   CASE 
                       WHEN lra.id IS NOT NULL AND lra.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM ammunitions a
            LEFT JOIN loadout_rules_ammunitions lra ON a.id = lra.ammunition_id
            ORDER BY is_banned DESC, a.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_ammunition_for_loadout(ammunition_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane uma ammunition para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_ammunitions (ammunition_id, max_quantity)
            VALUES (?, ?)
        """, (ammunition_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_ammunition_for_loadout(ammunition_id: int) -> bool:
    """Remove ban de uma ammunition para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_ammunitions WHERE ammunition_id = ?", (ammunition_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_ammunition_max_quantity(ammunition_id: int, max_quantity: Optional[int]) -> bool:
    """Define quantidade máxima de uma ammunition (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_ammunitions WHERE ammunition_id = ?", (ammunition_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_ammunitions 
                SET max_quantity = ? 
                WHERE ammunition_id = ?
            """, (max_quantity, ammunition_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_ammunitions (ammunition_id, max_quantity)
                VALUES (?, ?)
            """, (ammunition_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

# === ATTACHMENTS ===
def get_loadout_rules_attachments() -> List[Dict]:
    """Retorna lista de attachments com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.name, a.name_type, a.type, a.slots, a.width, a.height, a.img, a.battery,
                   lrat.id as rule_id, lrat.max_quantity,
                   CASE 
                       WHEN lrat.id IS NOT NULL AND lrat.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM attachments a
            LEFT JOIN loadout_rules_attachments lrat ON a.id = lrat.attachment_id
            ORDER BY is_banned DESC, a.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_attachment_for_loadout(attachment_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane um attachment para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_attachments (attachment_id, max_quantity)
            VALUES (?, ?)
        """, (attachment_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_attachment_for_loadout(attachment_id: int) -> bool:
    """Remove ban de um attachment para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_attachments WHERE attachment_id = ?", (attachment_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_attachment_max_quantity(attachment_id: int, max_quantity: Optional[int]) -> bool:
    """Define quantidade máxima de um attachment (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_attachments WHERE attachment_id = ?", (attachment_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_attachments 
                SET max_quantity = ? 
                WHERE attachment_id = ?
            """, (max_quantity, attachment_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_attachments (attachment_id, max_quantity)
                VALUES (?, ?)
            """, (attachment_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

# === EXPLOSIVES ===
def get_loadout_rules_explosives() -> List[Dict]:
    """Retorna lista de explosives com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT e.id, e.name, e.name_type, e.slots, e.width, e.height, e.img,
                   lre.id as rule_id, lre.max_quantity,
                   CASE 
                       WHEN lre.id IS NOT NULL AND lre.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM explosives e
            LEFT JOIN loadout_rules_explosives lre ON e.id = lre.explosive_id
            ORDER BY is_banned DESC, e.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_explosive_for_loadout(explosive_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane um explosive para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_explosives (explosive_id, max_quantity)
            VALUES (?, ?)
        """, (explosive_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_explosive_for_loadout(explosive_id: int) -> bool:
    """Remove ban de um explosive para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_explosives WHERE explosive_id = ?", (explosive_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_explosive_max_quantity(explosive_id: int, max_quantity: Optional[int]) -> bool:
    """Define quantidade máxima de um explosive (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_explosives WHERE explosive_id = ?", (explosive_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_explosives 
                SET max_quantity = ? 
                WHERE explosive_id = ?
            """, (max_quantity, explosive_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_explosives (explosive_id, max_quantity)
                VALUES (?, ?)
            """, (explosive_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def get_explosives_global_limit() -> Optional[Dict]:
    """Retorna o limite global de quantidade total de explosivos"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, max_total_quantity, created_at, updated_at
            FROM loadout_rules_explosives_global
            ORDER BY id DESC
            LIMIT 1
        """)
        row = cursor.fetchone()
        return dict(row) if row else None

def set_explosives_global_limit(max_total_quantity: int) -> bool:
    """Define o limite global de quantidade total de explosivos"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe registro
        existing = get_explosives_global_limit()
        if existing:
            cursor.execute("""
                UPDATE loadout_rules_explosives_global 
                SET max_total_quantity = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (max_total_quantity, existing['id']))
        else:
            cursor.execute("""
                INSERT INTO loadout_rules_explosives_global (max_total_quantity)
                VALUES (?)
            """, (max_total_quantity,))
        conn.commit()
        return cursor.rowcount > 0

# === ITEMS ===
def get_loadout_rules_items() -> List[Dict]:
    """Retorna lista de items com status de blacklist e max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Lógica: Se está na tabela E max_quantity é NULL = banido
        # Se está na tabela E max_quantity tem valor = permitido com limite
        # Se não está na tabela = permitido, quantidade padrão 1
        cursor.execute("""
            SELECT i.id, i.name, i.name_type, i.type_id, i.slots, i.width, i.height, 
                   i.img, i.storage_slots, i.storage_width, i.storage_height, i.localization,
                   it.name as type_name,
                   lri.id as rule_id, lri.max_quantity,
                   CASE 
                       WHEN lri.id IS NOT NULL AND lri.max_quantity IS NULL THEN 1
                       ELSE 0
                   END as is_banned
            FROM item i
            LEFT JOIN item_types it ON i.type_id = it.id
            LEFT JOIN loadout_rules_items lri ON i.id = lri.item_id
            ORDER BY is_banned DESC, i.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_item_for_loadout(item_id: int, max_quantity: Optional[int] = None) -> bool:
    """Bane um item para loadouts de players (se max_quantity for NULL) ou define quantidade máxima (se max_quantity for definido)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Garantir que None seja tratado como NULL explicitamente
        # Verificar se já existe registro
        cursor.execute("SELECT id, max_quantity FROM loadout_rules_items WHERE item_id = ?", (item_id,))
        existing = cursor.fetchone()
        
        if existing:
            # Atualizar registro existente
            cursor.execute("""
                UPDATE loadout_rules_items 
                SET max_quantity = ? 
                WHERE item_id = ?
            """, (max_quantity, item_id))
        else:
            # Inserir novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_items (item_id, max_quantity)
                VALUES (?, ?)
            """, (item_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

def unban_item_for_loadout(item_id: int) -> bool:
    """Remove ban de um item para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_items WHERE item_id = ?", (item_id,))
        conn.commit()
        return cursor.rowcount > 0

def set_item_max_quantity(item_id: int, max_quantity: int) -> bool:
    """Define quantidade máxima de um item (cria registro se não existir)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Verificar se já existe
        cursor.execute("SELECT id FROM loadout_rules_items WHERE item_id = ?", (item_id,))
        exists = cursor.fetchone()
        
        if exists:
            # Atualizar
            cursor.execute("""
                UPDATE loadout_rules_items 
                SET max_quantity = ? 
                WHERE item_id = ?
            """, (max_quantity, item_id))
        else:
            # Criar novo registro
            cursor.execute("""
                INSERT INTO loadout_rules_items (item_id, max_quantity)
                VALUES (?, ?)
            """, (item_id, max_quantity))
        conn.commit()
        return cursor.rowcount > 0

# === ITEM TYPES ===
def get_loadout_rules_item_types() -> List[Dict]:
    """Retorna lista de tipos de itens com status de blacklist"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT it.id, it.name,
                   lrit.id as rule_id,
                   CASE WHEN lrit.id IS NOT NULL THEN 1 ELSE 0 END as is_banned
            FROM item_types it
            LEFT JOIN loadout_rules_item_types lrit ON it.id = lrit.item_type_id
            ORDER BY is_banned DESC, it.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_allowed_item_types_for_loadout() -> List[Dict]:
    """Retorna apenas tipos de itens permitidos (não banidos) para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT it.id, it.name
            FROM item_types it
            LEFT JOIN loadout_rules_item_types lrit ON it.id = lrit.item_type_id
            WHERE lrit.id IS NULL
            ORDER BY it.name
        """)
        return [dict(row) for row in cursor.fetchall()]

def ban_item_type_for_loadout(item_type_id: int) -> bool:
    """Bane um tipo de item para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO loadout_rules_item_types (item_type_id)
            VALUES (?)
        """, (item_type_id,))
        conn.commit()
        return cursor.rowcount > 0

def unban_item_type_for_loadout(item_type_id: int) -> bool:
    """Remove ban de um tipo de item para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM loadout_rules_item_types WHERE item_type_id = ?", (item_type_id,))
        conn.commit()
        return cursor.rowcount > 0

# ============================================================================
# FUNÇÕES FILTRADAS PARA LOADOUTS DE PLAYERS
# ============================================================================

def get_weapons_for_player_loadout(search: str = None) -> List[Dict]:
    """Retorna apenas armas permitidas para loadouts de players"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = """
            SELECT DISTINCT
                w.id, w.name, w.name_type, w.feed_type, w.slots, w.width, w.height, w.img,
                GROUP_CONCAT(DISTINCT c.name) as calibers
            FROM weapons w
            LEFT JOIN loadout_rules_weapons lrw ON w.id = lrw.weapon_id
            LEFT JOIN weapon_ammunitions wa ON w.id = wa.weapon_id
            LEFT JOIN ammunitions a ON wa.ammo_id = a.id
            LEFT JOIN calibers c ON a.caliber_id = c.id
            WHERE lrw.id IS NULL
        """
        params = []
        if search:
            query += " AND (w.name LIKE ? OR w.name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        query += " GROUP BY w.id ORDER BY w.name"
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_magazines_for_player_loadout(search: str = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna apenas magazines permitidas para loadouts de players (não banidas, com ou sem max_quantity)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        if weapon_id:
            query = """
                SELECT DISTINCT m.id, m.name, m.name_type, m.capacity, m.slots, m.width, m.height, m.img,
                       CASE 
                           WHEN lrm.id IS NULL THEN NULL
                           ELSE lrm.max_quantity
                       END as max_quantity
                FROM magazines m
                INNER JOIN weapon_magazines wm ON m.id = wm.magazine_id
                LEFT JOIN loadout_rules_magazines lrm ON m.id = lrm.magazine_id
                WHERE wm.weapon_id = ? AND (lrm.id IS NULL OR lrm.max_quantity IS NOT NULL)
            """
            params = [weapon_id]
            if search:
                query += " AND (m.name LIKE ? OR m.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        else:
            query = """
                SELECT m.id, m.name, m.name_type, m.capacity, m.slots, m.width, m.height, m.img,
                       CASE 
                           WHEN lrm.id IS NULL THEN NULL
                           ELSE lrm.max_quantity
                       END as max_quantity
                FROM magazines m
                LEFT JOIN loadout_rules_magazines lrm ON m.id = lrm.magazine_id
                WHERE lrm.id IS NULL OR lrm.max_quantity IS NOT NULL
            """
            params = []
            if search:
                query += " AND (m.name LIKE ? OR m.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_ammunitions_for_player_loadout(search: str = None, caliber_id: int = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna apenas ammunitions permitidas para loadouts de players (não banidas, com ou sem max_quantity)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        if weapon_id:
            query = """
                SELECT DISTINCT a.id, a.name, a.name_type, a.caliber_id, a.slots, a.width, a.height, a.img,
                       CASE 
                           WHEN lra.id IS NULL THEN NULL
                           ELSE lra.max_quantity
                       END as max_quantity
                FROM ammunitions a
                INNER JOIN weapon_ammunitions wa ON a.id = wa.ammo_id
                LEFT JOIN loadout_rules_ammunitions lra ON a.id = lra.ammunition_id
                WHERE wa.weapon_id = ? AND (lra.id IS NULL OR lra.max_quantity IS NOT NULL)
            """
            params = [weapon_id]
            if search:
                query += " AND (a.name LIKE ? OR a.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        else:
            query = """
                SELECT a.id, a.name, a.name_type, a.caliber_id, a.slots, a.width, a.height, a.img,
                       CASE 
                           WHEN lra.id IS NULL THEN NULL
                           ELSE lra.max_quantity
                       END as max_quantity
                FROM ammunitions a
                LEFT JOIN loadout_rules_ammunitions lra ON a.id = lra.ammunition_id
                WHERE lra.id IS NULL OR lra.max_quantity IS NOT NULL
            """
            params = []
            if caliber_id:
                query += " AND a.caliber_id = ?"
                params.append(caliber_id)
            if search:
                query += " AND (a.name LIKE ? OR a.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_attachments_for_player_loadout(search: str = None, type_filter: str = None, weapon_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna apenas attachments permitidos para loadouts de players (não banidos, com ou sem max_quantity)"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        if weapon_id:
            query = """
                SELECT DISTINCT at.id, at.name, at.name_type, at.type, at.slots, at.width, at.height, at.img, at.battery,
                       CASE 
                           WHEN lrat.id IS NULL THEN NULL
                           ELSE lrat.max_quantity
                       END as max_quantity
                FROM attachments at
                INNER JOIN weapon_attachments wat ON at.id = wat.attachment_id
                LEFT JOIN loadout_rules_attachments lrat ON at.id = lrat.attachment_id
                WHERE wat.weapon_id = ? AND (lrat.id IS NULL OR lrat.max_quantity IS NOT NULL)
            """
            params = [weapon_id]
            if type_filter:
                query += " AND at.type = ?"
                params.append(type_filter)
            if search:
                query += " AND (at.name LIKE ? OR at.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        else:
            query = """
                SELECT at.id, at.name, at.name_type, at.type, at.slots, at.width, at.height, at.img, at.battery,
                       CASE 
                           WHEN lrat.id IS NULL THEN NULL
                           ELSE lrat.max_quantity
                       END as max_quantity
                FROM attachments at
                LEFT JOIN loadout_rules_attachments lrat ON at.id = lrat.attachment_id
                WHERE lrat.id IS NULL OR lrat.max_quantity IS NOT NULL
            """
            params = []
            if type_filter:
                query += " AND at.type = ?"
                params.append(type_filter)
            if search:
                query += " AND (at.name LIKE ? OR at.name_type LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " LIMIT ?"
            params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_explosives_for_player_loadout(search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna apenas explosives permitidos para loadouts de players com max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Lógica: Se está na tabela E max_quantity é NULL = banido (não retorna)
        # Se está na tabela E max_quantity tem valor = permitido com limite (retorna com max_quantity)
        # Se não está na tabela = permitido sem limite (retorna com max_quantity NULL)
        query = """
            SELECT e.id, e.name, e.name_type, e.slots, e.width, e.height, e.img,
                   CASE 
                       WHEN lre.id IS NULL THEN NULL
                       ELSE lre.max_quantity
                   END as max_quantity
            FROM explosives e
            LEFT JOIN loadout_rules_explosives lre ON e.id = lre.explosive_id
            WHERE lre.id IS NULL OR (lre.id IS NOT NULL AND lre.max_quantity IS NOT NULL)
        """
        params = []
        if search:
            query += " AND (e.name LIKE ? OR e.name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        query += " ORDER BY e.name LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_items_for_player_loadout(type_id: int = None, search: str = None, limit: int = 1000) -> List[Dict]:
    """Retorna apenas items permitidos para loadouts de players (não banidos individualmente nem por tipo) com max_quantity"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        # Lógica: Se não está na tabela = permitido, quantidade padrão 1
        # Se está na tabela com max_quantity = permitido, quantidade máxima = max_quantity
        # Se está na tabela sem max_quantity (NULL) = banido (não retorna)
        # Se tipo está banido = banido (não retorna)
        query = """
            SELECT i.id, i.name, i.name_type, i.type_id, i.slots, i.width, i.height, 
                   i.img, i.storage_slots, i.storage_width, i.storage_height, i.localization,
                   it.name as type_name,
                   CASE 
                       WHEN lri.id IS NULL THEN 1
                       ELSE lri.max_quantity
                   END as max_quantity
            FROM item i
            INNER JOIN item_types it ON i.type_id = it.id
            LEFT JOIN loadout_rules_items lri ON i.id = lri.item_id
            LEFT JOIN loadout_rules_item_types lrit ON i.type_id = lrit.item_type_id
            WHERE (lri.id IS NULL OR lri.max_quantity IS NOT NULL) AND lrit.id IS NULL
        """
        params = []
        if type_id:
            query += " AND i.type_id = ?"
            params.append(type_id)
        if search:
            query += " AND (i.name LIKE ? OR i.name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        query += " ORDER BY i.name LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

# ============================================================================
# FUNÇÕES DE ADMINISTRADORES
# ============================================================================

def _write_remote_file(file_path: str, content: str) -> bool:
    """
    Escreve conteúdo em arquivo remoto via SFTP
    
    Args:
        file_path: Caminho do arquivo no servidor remoto
        content: Conteúdo a escrever (string)
    
    Returns:
        bool: True se escrito com sucesso, False caso contrário
    """
    try:
        from ssh_client import _connection_pool
    except ImportError:
        logging.warning("ssh_client não disponível, não é possível escrever arquivo remoto")
        return False
    
    conn = _connection_pool.get_connection()
    if not conn:
        logging.error("Não foi possível obter conexão SSH")
        return False
    
    try:
        with conn.lock:
            sftp = conn.client.open_sftp()
            try:
                # Escrever conteúdo no arquivo
                with sftp.open(file_path, 'w') as f:
                    f.write(content.encode('utf-8'))
                logging.debug(f"Arquivo escrito via SSH: {file_path}")
                return True
            finally:
                sftp.close()
    except Exception as e:
        logging.error(f"Erro ao escrever arquivo via SSH: {str(e)}")
        return False


def get_admin_ids() -> List[str]:
    """Retorna lista de Player IDs dos administradores do cache"""
    global _admin_ids_cache, _admin_ids_loaded

    # Se cache não foi carregado, carregar agora (fallback)
    if not _admin_ids_loaded:
        load_admin_ids_cache()

    return _admin_ids_cache.copy()

def get_admins_with_player_info() -> List[Dict]:
    """Retorna lista de administradores com informações do banco de dados"""
    admin_ids = get_admin_ids()
    
    if not admin_ids:
        return []
    
    # Correlacionar com players_database
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Criar placeholders para a query IN
        placeholders = ','.join('?' * len(admin_ids))
        
        cursor.execute(f"""
            SELECT PlayerID, PlayerName, SteamID, SteamName
            FROM players_database
            WHERE PlayerID IN ({placeholders})
        """, admin_ids)
        
        players_dict = {row['PlayerID']: dict(row) for row in cursor.fetchall()}
    
    # Construir lista de administradores com informações do banco ou placeholders
    admins = []
    for player_id in admin_ids:
        if player_id in players_dict:
            admin_info = players_dict[player_id]
            admins.append({
                'PlayerID': admin_info['PlayerID'],
                'PlayerName': admin_info['PlayerName'],
                'SteamID': admin_info['SteamID'],
                'SteamName': admin_info['SteamName']
            })
        else:
            # Player ID não encontrado no banco ainda
            admins.append({
                'PlayerID': player_id,
                'PlayerName': None,
                'SteamID': None,
                'SteamName': None
            })
    
    return admins

def add_admin_id(player_id: str) -> bool:
    """Adiciona um Player ID ao arquivo admin_ids.txt (via SSH)"""
    if not player_id or not player_id.strip():
        return False
    
    if not read_remote_file:
        logging.warning("ssh_client não disponível, não é possível adicionar admin ID")
        return False
    
    player_id = player_id.strip()
    
    # Verificar se já existe
    existing_ids = get_admin_ids()
    if player_id in existing_ids:
        return False
    
    try:
        # Ler arquivo remoto via SSH
        file_content = read_remote_file(config.ADMIN_IDS_FILE)
        
        # Se arquivo não existe, criar novo
        if file_content is None:
            new_content = f"{player_id}\n"
        else:
            # Adiciona o Player ID ao final do arquivo
            # Verifica se termina com quebra de linha
            if file_content and not file_content.endswith('\n'):
                new_content = file_content + '\n' + f"{player_id}\n"
            else:
                new_content = file_content + f"{player_id}\n"
        
        # Escrever arquivo remoto via SSH
        if _write_remote_file(config.ADMIN_IDS_FILE, new_content):
            # Atualizar cache local
            _admin_ids_cache.append(player_id)
            logging.info(f"Admin ID {player_id} adicionado ao arquivo admin_ids.txt")
            return True
        else:
            logging.error(f"Falha ao escrever arquivo admin_ids.txt via SSH")
            return False
    except Exception as e:
        logging.error(f"Erro ao adicionar admin ID: {str(e)}")
        return False

def remove_admin_id(player_id: str) -> bool:
    """Remove um Player ID do arquivo admin_ids.txt (via SSH)"""
    if not player_id or not player_id.strip():
        return False
    
    if not read_remote_file:
        logging.warning("ssh_client não disponível, não é possível remover admin ID")
        return False
    
    player_id = player_id.strip()
    
    # Ler todos os IDs
    admin_ids = get_admin_ids()
    
    if player_id not in admin_ids:
        return False
    
    # Remover o ID da lista
    admin_ids.remove(player_id)
    
    try:
        # Construir novo conteúdo do arquivo
        new_content = '\n'.join(admin_ids)
        if new_content:  # Se ainda há IDs, adicionar quebra de linha final
            new_content += '\n'
        
        # Escrever arquivo remoto via SSH
        if _write_remote_file(config.ADMIN_IDS_FILE, new_content):
            # Atualizar cache local
            if player_id in _admin_ids_cache:
                _admin_ids_cache.remove(player_id)
            logging.info(f"Admin ID {player_id} removido do arquivo admin_ids.txt")
            return True
        else:
            logging.error(f"Falha ao escrever arquivo admin_ids.txt via SSH")
            return False
    except Exception as e:
        logging.error(f"Erro ao remover admin ID: {str(e)}")
        return False

# ============================================================================
# FUNÇÕES DE DETECÇÃO DE CHEATERS
# ============================================================================

def calculate_risk_level(score: float) -> str:
    """Calcula o nível de risco baseado na pontuação"""
    if score <= 50:
        return 'normal'
    elif score <= 100:
        return 'suspicious'
    elif score <= 200:
        return 'high_risk'
    else:
        return 'critical'

def update_player_score(player_id: str, event_type: str, score: float, details: Dict = None) -> bool:
    """
    Atualiza a pontuação de um jogador e registra o evento
    Aplica decaimento diário (10% por dia sem eventos)
    """
    import json
    from datetime import datetime, timedelta
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Verificar se o jogador já tem registro
        cursor.execute("""
            SELECT TotalScore, LastUpdated FROM cheat_detection_scores
            WHERE PlayerID = ?
        """, (player_id,))
        existing = cursor.fetchone()
        
        current_score = 0.0
        if existing:
            current_score = existing[0] or 0.0
            last_updated = existing[1]
            
            # Aplicar decaimento diário (10% por dia sem eventos)
            if last_updated:
                try:
                    last_date = datetime.strptime(last_updated, '%Y-%m-%d %H:%M:%S')
                    days_passed = (datetime.now() - last_date).days
                    if days_passed > 0:
                        # Reduzir 10% por dia, mínimo 0
                        decay_factor = (0.9 ** days_passed)
                        current_score = max(0.0, current_score * decay_factor)
                except:
                    pass
        
        # Adicionar nova pontuação
        new_score = current_score + score
        risk_level = calculate_risk_level(new_score)
        
        # Atualizar ou inserir pontuação
        if existing:
            cursor.execute("""
                UPDATE cheat_detection_scores
                SET TotalScore = ?, RiskLevel = ?, LastUpdated = CURRENT_TIMESTAMP
                WHERE PlayerID = ?
            """, (new_score, risk_level, player_id))
        else:
            cursor.execute("""
                INSERT INTO cheat_detection_scores (PlayerID, TotalScore, RiskLevel, LastUpdated)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """, (player_id, new_score, risk_level))
        
        # Registrar evento
        details_json = json.dumps(details, ensure_ascii=False) if details else None
        cursor.execute("""
            INSERT INTO cheat_detection_events (PlayerID, EventType, Score, Details, TimeStamp)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (player_id, event_type, score, details_json))
        
        conn.commit()
        return True

def detect_teleportation(player_id: str, hours_back: int = 2) -> List[Dict]:
    """
    Detecta teleportação/speed hack analisando movimentos consecutivos
    Retorna lista de eventos suspeitos detectados
    """
    from datetime import datetime, timedelta
    import math
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Buscar coordenadas das últimas horas
        time_threshold = (datetime.now() - timedelta(hours=hours_back)).strftime('%Y-%m-%d %H:%M:%S')
        
        cursor.execute("""
            SELECT PlayerCoordId, CoordX, CoordY, CoordZ, Data
            FROM players_coord
            WHERE PlayerID = ? AND Data >= ?
            ORDER BY Data ASC
        """, (player_id, time_threshold))
        
        coords = [dict(row) for row in cursor.fetchall()]
        
        if len(coords) < 2:
            return []
        
        suspicious_events = []
        
        suspicious_speed_threshold = 80.0      # ~288 km/h
        critical_speed_threshold = 150.0       # ~540 km/h
        min_distance_threshold = 200.0         # ignorar amostras muito curtas
        critical_distance_threshold = 500.0
        max_time_for_speed_check = 20.0
        teleport_distance_threshold = 1000.0
        teleport_time_threshold = 5.0
        
        for i in range(1, len(coords)):
            prev = coords[i-1]
            curr = coords[i]
            
            # Calcular distância
            dx = curr['CoordX'] - prev['CoordX']
            dy = curr['CoordY'] - prev['CoordY']
            dz = curr['CoordZ'] - prev['CoordZ']
            distance = math.sqrt(dx*dx + dy*dy + dz*dz)
            
            # Calcular tempo em segundos
            try:
                prev_time = datetime.strptime(prev['Data'], '%Y-%m-%d %H:%M:%S')
                curr_time = datetime.strptime(curr['Data'], '%Y-%m-%d %H:%M:%S')
                time_diff = (curr_time - prev_time).total_seconds()
            except:
                continue
            
            if time_diff <= 0:
                continue
            
            # Ignorar detecções com tempo muito curto (< 5 segundos) para evitar falsos positivos
            # com intervalos de 10 segundos entre atualizações
            if time_diff < 5.0:
                continue
            
            # Calcular velocidade (m/s)
            speed = distance / time_diff if time_diff > 0 else 0
            
            # Detectar suspeita
            event_score = 0
            event_type = None
            severity = None
            
            # Filtro rápido para movimentos extremos (teleporte)
            if time_diff <= teleport_time_threshold and distance >= teleport_distance_threshold:
                event_score = 60
                event_type = 'teleport'
                severity = 'critical'
            elif time_diff <= max_time_for_speed_check and distance >= min_distance_threshold:
                if speed > critical_speed_threshold and distance >= critical_distance_threshold:
                    event_score = 50
                    event_type = 'teleport'
                    severity = 'critical'
                elif speed > suspicious_speed_threshold:
                    event_score = 30
                    event_type = 'speed_hack'
                    severity = 'suspicious'
            
            if event_score > 0:
                suspicious_events.append({
                    'player_id': player_id,
                    'event_type': event_type,
                    'score': event_score,
                    'details': {
                        'distance': round(distance, 2),
                        'time_seconds': round(time_diff, 2),
                        'speed_mps': round(speed, 2),
                        'from_pos': (prev['CoordX'], prev['CoordY'], prev['CoordZ']),
                        'to_pos': (curr['CoordX'], curr['CoordY'], curr['CoordZ']),
                        'from_time': prev['Data'],
                        'to_time': curr['Data'],
                        'severity': severity
                    }
                })
        
        return suspicious_events

def detect_aimbot(player_id: str, hours_back: int = 2) -> List[Dict]:
    """
    Detecta aimbot analisando precisão anormal em kills e damage
    Retorna lista de eventos suspeitos detectados
    """
    from datetime import datetime, timedelta
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        time_threshold = (datetime.now() - timedelta(hours=hours_back)).strftime('%Y-%m-%d %H:%M:%S')
        
        suspicious_events = []
        
        # Analisar kills (players_killfeed)
        cursor.execute("""
            SELECT k.Id, k.PlayerIDKilled, k.Weapon, k.DistanceMeter, k.Data,
                   k.PosKiller, k.PosKilled
            FROM players_killfeed k
            WHERE k.PlayerIDKiller = ? AND k.Data >= ?
            ORDER BY k.Data DESC
        """, (player_id, time_threshold))
        
        kills = [dict(row) for row in cursor.fetchall()]
        
        if len(kills) > 0:
            # Analisar headshots em longas distâncias
            long_range_kills = [k for k in kills if k.get('DistanceMeter', 0) > 200]
            
            if len(long_range_kills) >= 3:
                # Verificar se há padrão suspeito de precisão
                # Se mais de 60% dos kills em longa distância são headshots (assumindo que HitType seria 'Head')
                # Por enquanto, vamos considerar múltiplos kills consecutivos em longa distância como suspeito
                event_score = 30
                suspicious_events.append({
                    'player_id': player_id,
                    'event_type': 'aimbot',
                    'score': event_score,
                    'details': {
                        'total_kills': len(kills),
                        'long_range_kills': len(long_range_kills),
                        'long_range_percentage': round((len(long_range_kills) / len(kills)) * 100, 2),
                        'time_period_hours': hours_back,
                        'reason': 'Múltiplos kills em longa distância (>200m)'
                    }
                })
        
        # Analisar damage events (players_damage)
        cursor.execute("""
            SELECT d.Id, d.PlayerIDVictim, d.Weapon, d.DistanceMeter, d.HitType,
                   d.Damage, d.Data, d.PosAttacker, d.PosVictim
            FROM players_damage d
            WHERE d.PlayerIDAttacker = ? AND d.Data >= ?
            ORDER BY d.Data DESC
        """, (player_id, time_threshold))
        
        damages = [dict(row) for row in cursor.fetchall()]
        
        if len(damages) > 0:
            # Analisar taxa de acerto em longas distâncias
            long_range_damages = [d for d in damages if d.get('DistanceMeter', 0) > 300]
            
            if len(long_range_damages) >= 5:
                # Calcular taxa de acerto (assumindo que todos os registros são hits)
                hit_rate = (len(long_range_damages) / len(damages)) * 100 if len(damages) > 0 else 0
                
                if hit_rate > 80:  # Taxa de acerto > 80% em longa distância
                    event_score = 30
                    suspicious_events.append({
                        'player_id': player_id,
                        'event_type': 'aimbot',
                        'score': event_score,
                        'details': {
                            'total_damages': len(damages),
                            'long_range_damages': len(long_range_damages),
                            'hit_rate_percentage': round(hit_rate, 2),
                            'time_period_hours': hours_back,
                            'reason': 'Taxa de acerto > 80% em distâncias > 300m'
                        }
                    })
        
        return suspicious_events

def detect_loot_hack(player_id: str, hours_back: int = 2) -> List[Dict]:
    """
    Detecta loot hack correlacionando posições de jogadores com containers
    Retorna lista de eventos suspeitos detectados
    """
    from datetime import datetime, timedelta
    import math
    
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        time_threshold = (datetime.now() - timedelta(hours=hours_back)).strftime('%Y-%m-%d %H:%M:%S')
        
        suspicious_events = []
        
        # Buscar posições do jogador
        cursor.execute("""
            SELECT PlayerCoordId, CoordX, CoordY, CoordZ, Data
            FROM players_coord
            WHERE PlayerID = ? AND Data >= ?
            ORDER BY Data ASC
        """, (player_id, time_threshold))
        
        player_positions = [dict(row) for row in cursor.fetchall()]
        
        if len(player_positions) == 0:
            return []
        
        # Buscar containers que foram modificados no período
        with DatabaseConnection(config.DB_LOGS) as logs_conn:
            logs_cursor = logs_conn.cursor()
            
            logs_cursor.execute("""
                SELECT DISTINCT ct.ContainerId, ct.ContainerName, ct.PositionX, ct.PositionY, ct.PositionZ, ct.TimeStamp
                FROM containers_tracking ct
                WHERE ct.TimeStamp >= ?
                ORDER BY ct.TimeStamp ASC
            """, (time_threshold,))
            
            containers = [dict(row) for row in logs_cursor.fetchall()]
            
            # Para cada container modificado, verificar se o jogador esteve próximo
            for container in containers:
                container_pos = (container['PositionX'], container['PositionY'], container['PositionZ'])
                container_time = container['TimeStamp']
                
                # Encontrar posição do jogador mais próxima no tempo (dentro de 10 minutos)
                try:
                    container_datetime = datetime.strptime(container_time, '%Y-%m-%d %H:%M:%S')
                except:
                    continue
                
                min_distance = float('inf')
                closest_position = None
                closest_time_diff = None
                
                max_time_window = 600.0  # 10 minutos
                
                for player_pos in player_positions:
                    try:
                        player_datetime = datetime.strptime(player_pos['Data'], '%Y-%m-%d %H:%M:%S')
                        time_diff = abs((container_datetime - player_datetime).total_seconds())
                        
                        # Verificar apenas posições dentro do intervalo definido
                        if time_diff <= max_time_window:
                            player_pos_coords = (player_pos['CoordX'], player_pos['CoordY'], player_pos['CoordZ'])
                            
                            # Calcular distância
                            dx = container_pos[0] - player_pos_coords[0]
                            dy = container_pos[1] - player_pos_coords[1]
                            dz = container_pos[2] - player_pos_coords[2]
                            distance = math.sqrt(dx*dx + dy*dy + dz*dz)
                            
                            if distance < min_distance:
                                min_distance = distance
                                closest_position = player_pos
                                closest_time_diff = time_diff
                    except:
                        continue
                
                base_threshold = 5.0
                threshold_30s = 8.0
                threshold_2min = 10.0
                threshold_10min = 15.0
                applied_threshold = base_threshold
                
                if closest_position:
                    if closest_time_diff is not None:
                        if closest_time_diff <= 30:
                            applied_threshold = threshold_30s
                        elif closest_time_diff <= 120:
                            applied_threshold = threshold_2min
                        elif closest_time_diff <= max_time_window:
                            applied_threshold = threshold_10min
                        else:
                            applied_threshold = base_threshold
                    
                    if min_distance <= applied_threshold:
                        continue
                
                # Se ainda não encontramos posição segura, registrar suspeita
                if min_distance == float('inf') or min_distance > applied_threshold:
                    suspicious_events.append({
                        'player_id': player_id,
                        'event_type': 'loot_hack',
                        'score': 35,
                        'details': {
                            'container_id': container['ContainerId'],
                            'container_name': container['ContainerName'],
                            'container_pos': container_pos,
                            'container_time': container_time,
                            'min_distance': round(min_distance, 2) if min_distance != float('inf') else None,
                            'closest_player_pos': (closest_position['CoordX'], closest_position['CoordY'], closest_position['CoordZ']) if closest_position else None,
                            'closest_player_time': closest_position['Data'] if closest_position else None,
                            'closest_time_diff_seconds': round(closest_time_diff, 2) if closest_time_diff is not None else None,
                            'allowed_distance_threshold': applied_threshold if closest_position else base_threshold,
                            'max_time_window_seconds': max_time_window,
                            'reason': 'Container acessado sem proximidade detectada'
                        }
                    })
        
        return suspicious_events

def get_cheat_detection_scores(limit: int = 100, risk_level: str = None) -> List[Dict]:
    """Retorna lista de jogadores com pontuação de suspeição"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT cds.PlayerID, cds.TotalScore, cds.RiskLevel, cds.LastUpdated, cds.IsBanned, cds.BannedAt,
                   pd.PlayerName, pd.SteamID, pd.SteamName
            FROM cheat_detection_scores cds
            LEFT JOIN players_database pd ON cds.PlayerID = pd.PlayerID
            WHERE 1=1
        """
        params = []
        
        if risk_level:
            query += " AND cds.RiskLevel = ?"
            params.append(risk_level)
        
        query += " ORDER BY cds.TotalScore DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_cheat_detection_events(player_id: str = None, limit: int = 100, event_type: str = None) -> List[Dict]:
    """Retorna lista de eventos de detecção de cheaters"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        query = """
            SELECT cde.Id, cde.PlayerID, cde.EventType, cde.Score, cde.Details, cde.TimeStamp,
                   cde.Reviewed, cde.ReviewedBy, cde.ReviewResult,
                   pd.PlayerName, pd.SteamID, pd.SteamName
            FROM cheat_detection_events cde
            LEFT JOIN players_database pd ON cde.PlayerID = pd.PlayerID
            WHERE 1=1
        """
        params = []
        
        if player_id:
            query += " AND cde.PlayerID = ?"
            params.append(player_id)
        
        if event_type:
            query += " AND cde.EventType = ?"
            params.append(event_type)
        
        query += " ORDER BY cde.TimeStamp DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_player_cheat_details(player_id: str) -> Dict:
    """Retorna detalhes completos de suspeição de um jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Buscar pontuação
        cursor.execute("""
            SELECT cds.PlayerID, cds.TotalScore, cds.RiskLevel, cds.LastUpdated, cds.IsBanned, cds.BannedAt,
                   pd.PlayerName, pd.SteamID, pd.SteamName
            FROM cheat_detection_scores cds
            LEFT JOIN players_database pd ON cds.PlayerID = pd.PlayerID
            WHERE cds.PlayerID = ?
        """, (player_id,))
        
        score_data = cursor.fetchone()
        
        if not score_data:
            return None
        
        result = dict(score_data)
        
        # Buscar eventos recentes
        cursor.execute("""
            SELECT Id, EventType, Score, Details, TimeStamp, Reviewed, ReviewedBy, ReviewResult
            FROM cheat_detection_events
            WHERE PlayerID = ?
            ORDER BY TimeStamp DESC
            LIMIT 50
        """, (player_id,))
        
        result['events'] = [dict(row) for row in cursor.fetchall()]
        
        return result

def review_cheat_event(event_id: int, reviewed_by: str, review_result: str) -> bool:
    """Marca um evento como revisado"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE cheat_detection_events
            SET Reviewed = 1, ReviewedBy = ?, ReviewResult = ?
            WHERE Id = ?
        """, (reviewed_by, review_result, event_id))
        conn.commit()
        return cursor.rowcount > 0

def clear_player_cheat_events(player_id: str) -> bool:
    """Remove eventos e reseta a pontuação de um jogador"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM cheat_detection_events
            WHERE PlayerID = ?
        """, (player_id,))
        events_deleted = cursor.rowcount
        
        cursor.execute("""
            UPDATE cheat_detection_scores
            SET TotalScore = 0,
                RiskLevel = 'normal',
                LastUpdated = CURRENT_TIMESTAMP,
                IsBanned = 0,
                BannedAt = NULL
            WHERE PlayerID = ?
        """, (player_id,))
        scores_updated = cursor.rowcount
        
        conn.commit()
        return events_deleted > 0 or scores_updated > 0

def get_player_events(player_id: str, limit: int = 50, offset: int = 0, date_from: str = None, date_to: str = None, event_type: str = None) -> tuple:
    """
    Retorna histórico de eventos de um jogador com filtros e paginação
    Retorna: (events, total_count)
    
    Args:
        player_id: ID do jogador
        limit: Limite de registros por página (padrão 50)
        offset: Offset para paginação (padrão 0)
        date_from: Data inicial para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
        date_to: Data final para filtrar (formato: 'YYYY-MM-DD HH:MM:SS' ou ISO)
        event_type: Tipo de evento para filtrar (opcional)
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        # Construir condições WHERE dinamicamente
        where_clauses = ["pe.PlayerID = ?"]
        params = [player_id]
        
        if date_from:
            where_clauses.append("datetime(pe.TimeStamp) >= datetime(?)")
            params.append(date_from)
        
        if date_to:
            where_clauses.append("datetime(pe.TimeStamp) <= datetime(?)")
            params.append(date_to)
        
        if event_type:
            where_clauses.append("pe.EventType = ?")
            params.append(event_type)
        
        where_sql = " AND ".join(where_clauses)
        
        # Contar total de registros
        cursor.execute(f"""
            SELECT COUNT(*)
            FROM players_events pe
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()[0]
        
        # Buscar eventos com paginação
        cursor.execute(f"""
            SELECT pe.EventId, pe.PlayerID, pe.EventType, pe.TimeStamp,
                   pe.CoordX, pe.CoordY, pe.CoordZ, pe.Details, pe.RelatedPlayerID,
                   pd_related.PlayerName as RelatedPlayerName
            FROM players_events pe
            LEFT JOIN players_database pd_related ON pe.RelatedPlayerID = pd_related.PlayerID
            WHERE {where_sql}
            ORDER BY pe.TimeStamp DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset])
        
        events = [dict(row) for row in cursor.fetchall()]
        
        return (events, total_count)

def clear_player_events(player_id: str) -> bool:
    """
    Remove todos os eventos de um jogador específico
    
    Args:
        player_id: ID do jogador
        
    Returns:
        True se eventos foram deletados, False caso contrário
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM players_events
            WHERE PlayerID = ?
        """, (player_id,))
        
        events_deleted = cursor.rowcount
        conn.commit()
        
        return events_deleted > 0

def insert_player_event(player_id: str, event_type: str, details: dict = None, 
                       coord_x: float = None, coord_y: float = None, coord_z: float = None,
                       related_player_id: str = None) -> Optional[int]:
    """
    Insere um evento na tabela players_events
    
    Args:
        player_id: ID do jogador
        event_type: Tipo do evento
        details: Dicionário com detalhes do evento (será convertido para JSON)
        coord_x, coord_y, coord_z: Coordenadas opcionais
        related_player_id: ID de outro jogador relacionado (opcional)
    
    Returns:
        int: ID do evento inserido ou None em caso de erro
    """
    try:
        import json
        details_json = json.dumps(details) if details else None
        
        with DatabaseConnection(config.DB_PLAYERS) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO players_events 
                (PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (player_id, event_type, coord_x, coord_y, coord_z, details_json, related_player_id))
            conn.commit()
            return cursor.lastrowid
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception(f"Erro ao inserir evento do jogador: {str(e)}")
        return None

def get_recent_player_events(limit: int = 50, since_timestamp: str = None, event_types: list = None) -> List[Dict]:
    """
    Busca eventos recentes de players_events
    
    Args:
        limit: Número máximo de eventos a retornar
        since_timestamp: Retornar apenas eventos após este timestamp
        event_types: Lista de tipos de eventos para filtrar (opcional)
    
    Returns:
        Lista de dicionários com os eventos
    """
    try:
        with DatabaseConnection(config.DB_PLAYERS) as conn:
            cursor = conn.cursor()
            
            where_clauses = []
            params = []
            
            if since_timestamp:
                where_clauses.append("pe.TimeStamp > ?")
                params.append(since_timestamp)
            
            if event_types and len(event_types) > 0:
                placeholders = ','.join('?' * len(event_types))
                where_clauses.append(f"pe.EventType IN ({placeholders})")
                params.extend(event_types)
            
            where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
            
            query = f"""
                SELECT pe.EventId, pe.PlayerID, pe.EventType, pe.TimeStamp,
                       pe.CoordX, pe.CoordY, pe.CoordZ, pe.Details, pe.RelatedPlayerID,
                       p.PlayerName, p.SteamName,
                       rp.PlayerName as RelatedPlayerName, rp.SteamName as RelatedSteamName
                FROM players_events pe
                LEFT JOIN players_database p ON pe.PlayerID = p.PlayerID
                LEFT JOIN players_database rp ON pe.RelatedPlayerID = rp.PlayerID
                {where_sql}
                ORDER BY pe.TimeStamp DESC
                LIMIT ?
            """
            params.append(limit)
            
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception(f"Erro ao buscar eventos recentes: {str(e)}")
        return []

def get_player_activity_by_hour(date: str, player_ids: List[str] = None) -> List[Dict]:
    """
    Retorna contagem de posições por hora para uma data específica.
    Usado para mostrar heatmap de atividade na timeline.

    Args:
        date: Data no formato 'YYYY-MM-DD'
        player_ids: Lista opcional de IDs de jogadores para filtrar

    Returns:
        Lista de dicts: [{'hour': 0, 'count': 15}, {'hour': 1, 'count': 8}, ...]
    """
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()

        query = """
            SELECT
                CAST(strftime('%H', Data) AS INTEGER) as hour,
                COUNT(*) as count
            FROM players_coord
            WHERE DATE(Data) = ?
        """
        params = [date]

        if player_ids:
            placeholders = ','.join('?' * len(player_ids))
            query += f" AND PlayerID IN ({placeholders})"
            params.extend(player_ids)

        query += " GROUP BY hour ORDER BY hour"

        cursor.execute(query, params)
        return [{'hour': row['hour'], 'count': row['count']} for row in cursor.fetchall()]

def save_vehicle_check_data(vehicle_id: str, vehicle_name: str, position: dict,
                            items: list, attachments: list, health_parts: dict) -> Optional[int]:
    """
    Salva dados de um veículo coletados via checkvehicle no banco de dados
    Retorna o IdVehicleTracking do registro inserido ou None em caso de erro
    
    Args:
        vehicle_id: ID do veículo
        vehicle_name: Nome do veículo
        position: Dict com x, y, z (coordenadas)
        items: Lista de dicts com type e health
        attachments: Lista de dicts com type e health
        health_parts: Dict com engine, body, fuel_tank (valores entre 0 e 1)
    """
    from datetime import datetime
    
    try:
        with DatabaseConnection(config.DB_VEHICLES) as conn:
            cursor = conn.cursor()
            
            # Verificar se colunas de saúde existem
            cursor.execute("PRAGMA table_info(vehicles_tracking)")
            columns = [row[1] for row in cursor.fetchall()]
            has_engine_health = 'EngineHealth' in columns
            has_body_health = 'BodyHealth' in columns
            has_fuel_tank_health = 'FuelTankHealth' in columns
            
            # Preparar valores de saúde
            engine_health = health_parts.get('engine') if health_parts else None
            body_health = health_parts.get('body') if health_parts else None
            fuel_tank_health = health_parts.get('fuel_tank') if health_parts else None
            
            # Converter valores de saúde (0-1) para porcentagem (0-100) se necessário
            # O banco pode armazenar como 0-1 ou 0-100, vamos manter como 0-1
            if engine_health is not None and engine_health > 1:
                engine_health = engine_health / 100.0
            if body_health is not None and body_health > 1:
                body_health = body_health / 100.0
            if fuel_tank_health is not None and fuel_tank_health > 1:
                fuel_tank_health = fuel_tank_health / 100.0
            
            # Preparar coordenadas
            # Formato JSON: {"x": leste-oeste, "z": altura, "y": norte-sul} (igual ao VehicleTracking.c)
            # Formato banco: PositionX (leste-oeste), PositionZ (altura), PositionY (norte-sul)
            coord_x = float(position.get('x', 0))
            coord_z = float(position.get('z', 0))  # z do JSON é altura (PositionZ no banco)
            coord_y = float(position.get('y', 0))  # y do JSON é norte-sul (PositionY no banco)
            
            # Construir query dinamicamente baseado nas colunas disponíveis
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            health_columns = ""
            health_values = ""
            if has_engine_health:
                health_columns += ", EngineHealth"
                health_values += ", ?"
            if has_body_health:
                health_columns += ", BodyHealth"
                health_values += ", ?"
            if has_fuel_tank_health:
                health_columns += ", FuelTankHealth"
                health_values += ", ?"
            
            # Preparar parâmetros
            params = [vehicle_id, vehicle_name, coord_x, coord_z, coord_y, timestamp]
            if has_engine_health:
                params.append(engine_health)
            if has_body_health:
                params.append(body_health)
            if has_fuel_tank_health:
                params.append(fuel_tank_health)
            
            # Inserir veículo
            cursor.execute(f"""
                INSERT INTO vehicles_tracking 
                (VehicleId, VehicleName, PositionX, PositionZ, PositionY, TimeStamp{health_columns})
                VALUES (?, ?, ?, ?, ?, ?{health_values})
            """, params)
            
            vehicle_tracking_id = cursor.lastrowid
            
            # Inserir items
            if items and vehicle_tracking_id:
                for item in items:
                    item_type = item.get('type', '')
                    item_health = item.get('health')
                    if item_type:
                        try:
                            if item_health is not None:
                                cursor.execute("""
                                    INSERT INTO vehicles_items 
                                    (VehicleTrackingId, ItemType, ItemHealth, TimeStamp)
                                    VALUES (?, ?, ?, ?)
                                """, (vehicle_tracking_id, item_type, float(item_health), timestamp))
                            else:
                                cursor.execute("""
                                    INSERT INTO vehicles_items 
                                    (VehicleTrackingId, ItemType, TimeStamp)
                                    VALUES (?, ?, ?)
                                """, (vehicle_tracking_id, item_type, timestamp))
                        except Exception as e:
                            # Log erro mas continua
                            import logging
                            logging.getLogger(__name__).warning(f"Erro ao inserir item {item_type}: {e}")
            
            # Inserir attachments
            if attachments and vehicle_tracking_id:
                for attachment in attachments:
                    attachment_type = attachment.get('type', '')
                    attachment_health = attachment.get('health')
                    if attachment_type:
                        try:
                            if attachment_health is not None:
                                cursor.execute("""
                                    INSERT INTO vehicles_attachments 
                                    (VehicleTrackingId, AttachmentType, AttachmentHealth, TimeStamp)
                                    VALUES (?, ?, ?, ?)
                                """, (vehicle_tracking_id, attachment_type, float(attachment_health), timestamp))
                            else:
                                cursor.execute("""
                                    INSERT INTO vehicles_attachments 
                                    (VehicleTrackingId, AttachmentType, TimeStamp)
                                    VALUES (?, ?, ?)
                                """, (vehicle_tracking_id, attachment_type, timestamp))
                        except Exception as e:
                            # Log erro mas continua
                            import logging
                            logging.getLogger(__name__).warning(f"Erro ao inserir attachment {attachment_type}: {e}")
            
            conn.commit()
            return vehicle_tracking_id
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Erro ao salvar dados do veículo {vehicle_id}: {e}", exc_info=True)
        return None

def save_container_check_data(container_id: str, container_type: str, position: dict, 
                              items: list) -> Optional[int]:
    """
    Salva dados de um container coletados via checkcontainer no banco de dados
    Retorna o IdContainerTracking do registro inserido ou None em caso de erro
    
    Args:
        container_id: ID do container
        container_type: Tipo do container
        position: Dict com x, y, z (coordenadas)
        items: Lista de dicts com type e health
    """
    from datetime import datetime
    
    try:
        with DatabaseConnection(config.DB_CONTAINERS) as conn:
            cursor = conn.cursor()
            
            # Preparar coordenadas
            # Formato JSON: {"x": leste-oeste, "z": altura, "y": norte-sul} (igual ao LootTracking.c)
            # Formato banco: PositionX (leste-oeste), PositionZ (altura), PositionY (norte-sul)
            coord_x = float(position.get('x', 0))
            coord_z = float(position.get('z', 0))  # z do JSON é altura (PositionZ no banco)
            coord_y = float(position.get('y', 0))  # y do JSON é norte-sul (PositionY no banco)
            
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Inserir container
            cursor.execute("""
                INSERT INTO containers_tracking 
                (ContainerId, ContainerName, PositionX, PositionZ, PositionY, TimeStamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (container_id, container_type, coord_x, coord_z, coord_y, timestamp))
            
            container_tracking_id = cursor.lastrowid
            
            # Inserir items
            if items and container_tracking_id:
                for item in items:
                    item_type = item.get('type', '')
                    item_health = item.get('health')
                    if item_type:
                        try:
                            if item_health is not None:
                                cursor.execute("""
                                    INSERT INTO container_items_tracking 
                                    (ContainerTrackingId, ItemType, ItemHealth, TimeStamp)
                                    VALUES (?, ?, ?, ?)
                                """, (container_tracking_id, item_type, float(item_health), timestamp))
                            else:
                                cursor.execute("""
                                    INSERT INTO container_items_tracking 
                                    (ContainerTrackingId, ItemType, TimeStamp)
                                    VALUES (?, ?, ?)
                                """, (container_tracking_id, item_type, timestamp))
                        except Exception as item_error:
                            import logging
                            logging.getLogger(__name__).warning(f"Erro ao inserir item {item_type} do container {container_id}: {item_error}")
            
            conn.commit()
            return container_tracking_id
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Erro ao salvar dados do container {container_id}: {e}", exc_info=True)
        return None

def save_fence_check_data(fence_id: str, structure_type: str, position: dict, orientation: dict, fence_data: dict):
    """
    Salva dados de uma construção coletados via checkfence no banco de dados
    Retorna o ID do registro inserido ou None em caso de erro
    
    Args:
        fence_id: ID da construção
        structure_type: Tipo da construção ('fence', 'watchtower', 'flag')
        position: Dict com x, y, z (coordenadas)
        orientation: Dict com x, y, z (orientação)
        fence_data: Dict completo com todos os dados da construção
    """
    from datetime import datetime
    
    try:
        with DatabaseConnection(config.DB_STRUCTURES) as conn:
            cursor = conn.cursor()
            
            # Preparar coordenadas
            # Formato JSON: {"x": leste-oeste, "y": norte-sul, "z": altura}
            # Formato banco: PositionX (leste-oeste), PositionY (norte-sul), PositionZ (altura)
            coord_x = float(position.get('x', 0))
            coord_y = float(position.get('y', 0))  # y do JSON é norte-sul (PositionY no banco)
            coord_z = float(position.get('z', 0))  # z do JSON é altura (PositionZ no banco)
            
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if structure_type == 'fence':
                # Inserir fence
                # Gerar fence_name baseado nos valores (seguindo padrão do FencesTracking.c e fences_positions.sh)
                fence_name = 'Fence'
                has_gate = fence_data.get('has_gate', False)
                is_opened = fence_data.get('is_opened', False)
                is_locked = fence_data.get('is_locked', False)
                
                if has_gate:
                    fence_name = fence_name + '_Gate'
                if is_opened:
                    fence_name = fence_name + '_Open'
                if is_locked:
                    fence_name = fence_name + '_Locked'
                
                has_base = 1 if fence_data.get('has_base', False) else 0
                lower_panel_built = 1 if fence_data.get('lower_panel_built', False) else 0
                upper_panel_built = 1 if fence_data.get('upper_panel_built', False) else 0
                
                cursor.execute("""
                    INSERT INTO fences_tracking 
                    (FenceId, FenceName, PositionX, PositionZ, PositionY, TimeStamp, HasBase, LowerPanelBuilt, UpperPanelBuilt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (fence_id, fence_name, coord_x, coord_z, coord_y, timestamp, has_base, lower_panel_built, upper_panel_built))
                
                fence_tracking_id = cursor.lastrowid
                
            elif structure_type == 'watchtower':
                # Inserir watchtower
                watchtower_name = 'Watchtower'
                has_base = 1 if fence_data.get('has_base', False) else 0
                level1_base = 1 if fence_data.get('level_1_base', False) else 0
                level2_base = 1 if fence_data.get('level_2_base', False) else 0
                level3_base = 1 if fence_data.get('level_3_base', False) else 0
                level1_stairs = 1 if fence_data.get('level_1_stairs', False) else 0
                level2_stairs = 1 if fence_data.get('level_2_stairs', False) else 0
                has_roof = 1 if fence_data.get('has_roof', False) else 0
                
                # Paredes nível 1
                level1_wall1_lower = 1 if fence_data.get('level_1_wall_1_lower_built', False) else 0
                level1_wall1_upper = 1 if fence_data.get('level_1_wall_1_upper_built', False) else 0
                level1_wall2_lower = 1 if fence_data.get('level_1_wall_2_lower_built', False) else 0
                level1_wall2_upper = 1 if fence_data.get('level_1_wall_2_upper_built', False) else 0
                level1_wall3_lower = 1 if fence_data.get('level_1_wall_3_lower_built', False) else 0
                level1_wall3_upper = 1 if fence_data.get('level_1_wall_3_upper_built', False) else 0
                
                # Paredes nível 2
                level2_wall1_lower = 1 if fence_data.get('level_2_wall_1_lower_built', False) else 0
                level2_wall1_upper = 1 if fence_data.get('level_2_wall_1_upper_built', False) else 0
                level2_wall2_lower = 1 if fence_data.get('level_2_wall_2_lower_built', False) else 0
                level2_wall2_upper = 1 if fence_data.get('level_2_wall_2_upper_built', False) else 0
                level2_wall3_lower = 1 if fence_data.get('level_2_wall_3_lower_built', False) else 0
                level2_wall3_upper = 1 if fence_data.get('level_2_wall_3_upper_built', False) else 0
                
                # Paredes nível 3
                level3_wall1_lower = 1 if fence_data.get('level_3_wall_1_lower_built', False) else 0
                level3_wall1_upper = 1 if fence_data.get('level_3_wall_1_upper_built', False) else 0
                level3_wall2_lower = 1 if fence_data.get('level_3_wall_2_lower_built', False) else 0
                level3_wall2_upper = 1 if fence_data.get('level_3_wall_2_upper_built', False) else 0
                level3_wall3_lower = 1 if fence_data.get('level_3_wall_3_lower_built', False) else 0
                level3_wall3_upper = 1 if fence_data.get('level_3_wall_3_upper_built', False) else 0
                
                # Orientação
                ori_x = float(orientation.get('x', 0)) if orientation else 0.0
                ori_y = float(orientation.get('y', 0)) if orientation else 0.0
                ori_z = float(orientation.get('z', 0)) if orientation else 0.0
                
                cursor.execute("""
                    INSERT INTO watchtowers_tracking 
                    (WatchtowerId, WatchtowerName, PositionX, PositionZ, PositionY, OrientationX, OrientationY, OrientationZ,
                     TimeStamp, HasBase, Level1BaseBuilt, Level2BaseBuilt, Level3BaseBuilt, Level1StairsBuilt, Level2StairsBuilt, HasRoof,
                     Level1Wall1LowerBuilt, Level1Wall1UpperBuilt, Level1Wall2LowerBuilt, Level1Wall2UpperBuilt, Level1Wall3LowerBuilt, Level1Wall3UpperBuilt,
                     Level2Wall1LowerBuilt, Level2Wall1UpperBuilt, Level2Wall2LowerBuilt, Level2Wall2UpperBuilt, Level2Wall3LowerBuilt, Level2Wall3UpperBuilt,
                     Level3Wall1LowerBuilt, Level3Wall1UpperBuilt, Level3Wall2LowerBuilt, Level3Wall2UpperBuilt, Level3Wall3LowerBuilt, Level3Wall3UpperBuilt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (fence_id, watchtower_name, coord_x, coord_z, coord_y, ori_x, ori_y, ori_z, timestamp,
                      has_base, level1_base, level2_base, level3_base, level1_stairs, level2_stairs, has_roof,
                      level1_wall1_lower, level1_wall1_upper, level1_wall2_lower, level1_wall2_upper, level1_wall3_lower, level1_wall3_upper,
                      level2_wall1_lower, level2_wall1_upper, level2_wall2_lower, level2_wall2_upper, level2_wall3_lower, level2_wall3_upper,
                      level3_wall1_lower, level3_wall1_upper, level3_wall2_lower, level3_wall2_upper, level3_wall3_lower, level3_wall3_upper))
                
                fence_tracking_id = cursor.lastrowid
                
            elif structure_type == 'flag':
                # Inserir flag
                flag_name = 'Flag Pole'
                has_base = 1 if fence_data.get('has_base', False) else 0
                has_flag_base = 1 if fence_data.get('has_flag_base', False) else 0
                flag_raised = 1 if fence_data.get('flag_raised', False) else 0
                flag_height = float(fence_data.get('flag_height', 0.0)) if fence_data.get('flag_height') is not None else 0.0
                
                # Orientação
                ori_x = float(orientation.get('x', 0)) if orientation else 0.0
                ori_y = float(orientation.get('y', 0)) if orientation else 0.0
                ori_z = float(orientation.get('z', 0)) if orientation else 0.0
                
                cursor.execute("""
                    INSERT INTO flags_tracking 
                    (FlagId, FlagName, PositionX, PositionZ, PositionY, OrientationX, OrientationY, OrientationZ,
                     TimeStamp, HasBase, HasFlagBase, FlagRaised, FlagHeight)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (fence_id, flag_name, coord_x, coord_z, coord_y, ori_x, ori_y, ori_z, timestamp,
                      has_base, has_flag_base, flag_raised, flag_height))
                
                fence_tracking_id = cursor.lastrowid
            else:
                import logging
                logging.getLogger(__name__).error(f"Tipo de construção desconhecido: {structure_type}")
                return None
            
            conn.commit()
            return fence_tracking_id
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Erro ao salvar dados da construção {fence_id} (tipo: {structure_type}): {e}", exc_info=True)
        return None

def count_structure_changes(structure_id: str, structure_type: str, date_from: str = None, date_to: str = None) -> Tuple[int, Dict[str, bool]]:
    """Conta o número de alterações significativas no histórico de uma estrutura e retorna flags por tipo"""
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()
        
        # Determinar tabela e campos baseado no tipo
        if structure_type == 'fence':
            table_name = 'fences_tracking'
            id_field = 'FenceId'
            tracking_id_field = 'IdFenceTracking'
            name_field = 'FenceName'
        elif structure_type == 'watchtower':
            table_name = 'watchtowers_tracking'
            id_field = 'WatchtowerId'
            tracking_id_field = 'WatchtowerTrackingId'
            name_field = 'WatchtowerName'
        elif structure_type == 'flag':
            table_name = 'flags_tracking'
            id_field = 'FlagId'
            tracking_id_field = 'FlagTrackingId'
            name_field = 'FlagName'
        else:
            return 0, {'position': False, 'status': False, 'structure': False}
        
        # Buscar histórico ordenado por timestamp
        history_conditions = [f"{id_field} = ?"]
        params = [structure_id]
        
        if date_from:
            history_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            history_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = " AND ".join(history_conditions)
        
        # Verificar se coluna IsDestroyed existe
        columns = get_table_columns(config.DB_STRUCTURES, table_name)
        has_is_destroyed = 'IsDestroyed' in columns
        
        baseline_record = None
        if date_from:
            baseline_query = f"""
                SELECT {tracking_id_field}, {name_field}, PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed
                FROM {table_name}
                WHERE {id_field} = ?
                  AND TimeStamp < ?
                ORDER BY TimeStamp DESC
                LIMIT 1
            """
            cursor.execute(baseline_query, (structure_id, date_from))
            baseline_row = cursor.fetchone()
            if baseline_row:
                baseline_record = dict(baseline_row)
        
        base_query = f"""
            SELECT {tracking_id_field}, {name_field}, PositionX, PositionY, PositionZ, TimeStamp,
                   IFNULL(IsDestroyed, 0) as IsDestroyed
            FROM {table_name}
            WHERE {where_clause}
            ORDER BY TimeStamp DESC
            LIMIT 500
        """
        
        cursor.execute(base_query, params)
        fetched_rows = [dict(row) for row in cursor.fetchall()]
        records = list(reversed(fetched_rows))
        
        if baseline_record:
            if not records or records[0][tracking_id_field] != baseline_record[tracking_id_field]:
                records.insert(0, baseline_record)
        
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"count_structure_changes - {structure_type} {structure_id}, records encontrados: {len(records)}")
        
        if len(records) <= 1:
            return 0, {
                'position': False,
                'status': False,
                'structure': False,
                'attack': False
            }
        
        # Buscar todos os registros completos para comparar componentes estruturais
        all_tracking_ids = [r[tracking_id_field] for r in records]
        structure_components_map = {}
        
        if all_tracking_ids:
            placeholders = ','.join(['?'] * len(all_tracking_ids))
            
            # Buscar componentes estruturais baseado no tipo
            if structure_type == 'fence':
                try:
                    cursor.execute(f"""
                        SELECT {tracking_id_field}, HasBase, LowerPanelBuilt, UpperPanelBuilt
                        FROM {table_name}
                        WHERE {tracking_id_field} IN ({placeholders})
                    """, all_tracking_ids)
                    for row in cursor.fetchall():
                        tracking_id = row[0]
                        structure_components_map[tracking_id] = {
                            'HasBase': row[1],
                            'LowerPanelBuilt': row[2],
                            'UpperPanelBuilt': row[3]
                        }
                except:
                    pass
            elif structure_type == 'watchtower':
                try:
                    cursor.execute(f"""
                        SELECT {tracking_id_field}, HasBase, Level1BaseBuilt, Level2BaseBuilt, Level3BaseBuilt,
                               Level1StairsBuilt, Level2StairsBuilt, HasRoof,
                               Level1Wall1LowerBuilt, Level1Wall1UpperBuilt, Level1Wall2LowerBuilt, Level1Wall2UpperBuilt,
                               Level1Wall3LowerBuilt, Level1Wall3UpperBuilt,
                               Level2Wall1LowerBuilt, Level2Wall1UpperBuilt, Level2Wall2LowerBuilt, Level2Wall2UpperBuilt,
                               Level2Wall3LowerBuilt, Level2Wall3UpperBuilt,
                               Level3Wall1LowerBuilt, Level3Wall1UpperBuilt, Level3Wall2LowerBuilt, Level3Wall2UpperBuilt,
                               Level3Wall3LowerBuilt, Level3Wall3UpperBuilt
                        FROM {table_name}
                        WHERE {tracking_id_field} IN ({placeholders})
                    """, all_tracking_ids)
                    for row in cursor.fetchall():
                        tracking_id = row[0]
                        structure_components_map[tracking_id] = {
                            'HasBase': row[1],
                            'Level1BaseBuilt': row[2],
                            'Level2BaseBuilt': row[3],
                            'Level3BaseBuilt': row[4],
                            'Level1StairsBuilt': row[5],
                            'Level2StairsBuilt': row[6],
                            'HasRoof': row[7],
                            'Level1Wall1LowerBuilt': row[8],
                            'Level1Wall1UpperBuilt': row[9],
                            'Level1Wall2LowerBuilt': row[10],
                            'Level1Wall2UpperBuilt': row[11],
                            'Level1Wall3LowerBuilt': row[12],
                            'Level1Wall3UpperBuilt': row[13],
                            'Level2Wall1LowerBuilt': row[14],
                            'Level2Wall1UpperBuilt': row[15],
                            'Level2Wall2LowerBuilt': row[16],
                            'Level2Wall2UpperBuilt': row[17],
                            'Level2Wall3LowerBuilt': row[18],
                            'Level2Wall3UpperBuilt': row[19],
                            'Level3Wall1LowerBuilt': row[20],
                            'Level3Wall1UpperBuilt': row[21],
                            'Level3Wall2LowerBuilt': row[22],
                            'Level3Wall2UpperBuilt': row[23],
                            'Level3Wall3LowerBuilt': row[24],
                            'Level3Wall3UpperBuilt': row[25]
                        }
                except:
                    pass
            elif structure_type == 'flag':
                try:
                    cursor.execute(f"""
                        SELECT {tracking_id_field}, HasBase, HasFlagBase, FlagRaised, FlagHeight
                        FROM {table_name}
                        WHERE {tracking_id_field} IN ({placeholders})
                    """, all_tracking_ids)
                    for row in cursor.fetchall():
                        tracking_id = row[0]
                        structure_components_map[tracking_id] = {
                            'HasBase': row[1],
                            'HasFlagBase': row[2],
                            'FlagRaised': row[3],
                            'FlagHeight': row[4]
                        }
                except:
                    pass
        
        change_count = 0
        pos_threshold = 0.1
        change_flags = {
            'position': False,
            'status': False,
            'structure': False,
            'attack': False
        }
        
        # Função auxiliar para normalizar valores booleanos
        def normalize_bool_value(value):
            if value is None:
                return 0
            if isinstance(value, bool):
                return 1 if value else 0
            try:
                int_val = int(value)
                return 1 if int_val != 0 else 0
            except:
                return 0
        
        # Comparar registros consecutivos
        for i in range(1, len(records)):
            prev = records[i - 1]
            curr = records[i]
            
            # Verificar mudança de posição
            pos_changed = (abs((prev.get('PositionX') or 0) - (curr.get('PositionX') or 0)) > pos_threshold or
                          abs((prev.get('PositionY') or 0) - (curr.get('PositionY') or 0)) > pos_threshold or
                          abs((prev.get('PositionZ') or 0) - (curr.get('PositionZ') or 0)) > pos_threshold)
            
            # Verificar mudança de status
            status_changed = (prev.get('IsDestroyed') or 0) != (curr.get('IsDestroyed') or 0)
            
            # Verificar mudança de nome (reflete mudanças de estado importantes)
            name_changed = False
            if name_field in prev and name_field in curr:
                prev_name = prev.get(name_field)
                curr_name = curr.get(name_field)
                if prev_name != curr_name:
                    name_changed = True
            
            # Verificar mudança em componentes estruturais
            structure_changed = False
            prev_components = structure_components_map.get(prev[tracking_id_field], {})
            curr_components = structure_components_map.get(curr[tracking_id_field], {})
            
            if prev_components != curr_components:
                structure_changed = True
            
            # Detectar ataque: componente estava construído e agora está destruído
            attack_detected = False
            if structure_type == 'fence':
                prev_lower = normalize_bool_value(prev_components.get('LowerPanelBuilt', 0))
                prev_upper = normalize_bool_value(prev_components.get('UpperPanelBuilt', 0))
                curr_lower = normalize_bool_value(curr_components.get('LowerPanelBuilt', 0))
                curr_upper = normalize_bool_value(curr_components.get('UpperPanelBuilt', 0))
                
                # Ataque: painel estava construído (1) e agora está destruído (0)
                if (prev_lower == 1 and curr_lower == 0) or (prev_upper == 1 and curr_upper == 0):
                    attack_detected = True
            elif structure_type == 'watchtower':
                # Lista de todas as paredes para verificar
                wall_fields = [
                    'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                    'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                    'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                    'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                    'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                    'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                    'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                    'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                    'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt'
                ]
                
                # Verificar cada parede
                for wall_field in wall_fields:
                    prev_wall = normalize_bool_value(prev_components.get(wall_field, 0))
                    curr_wall = normalize_bool_value(curr_components.get(wall_field, 0))
                    
                    # Ataque: parede estava construída (1) e agora está destruída (0)
                    if prev_wall == 1 and curr_wall == 0:
                        attack_detected = True
                        break  # Basta uma parede destruída para marcar como ataque
            
            # Se houve qualquer mudança significativa, incrementar contador
            # Mudança de nome é considerada uma mudança estrutural
            if pos_changed or status_changed or name_changed or structure_changed or attack_detected:
                change_count += 1
                if pos_changed:
                    change_flags['position'] = True
                if status_changed:
                    change_flags['status'] = True
                if name_changed or structure_changed:
                    change_flags['structure'] = True
                if attack_detected:
                    change_flags['attack'] = True
        
        logger.debug(f"count_structure_changes - {structure_type} {structure_id}, change_count final: {change_count}, change_flags: {change_flags}")
        return change_count, change_flags

def get_structures_paginated(status_filter: str, change_types: Optional[List[str]], date_from: str, date_to: str,
                             start: int, length: int, search: str = None,
                             order_by: Tuple[str, str] = None,
                             order_by_change_count: bool = False, order_by_change_count_dir: str = None) -> Tuple[List[Dict], int]:
    """Retorna dados paginados de estruturas (fences, watchtowers, flags) com busca e filtros"""
    import logging
    logger = logging.getLogger(__name__)
    
    all_structures = []
    
    # Função auxiliar para verificar se uma tabela existe
    def table_exists(table_name: str) -> bool:
        """Verifica se uma tabela existe no banco de dados"""
        try:
            with DatabaseConnection(config.DB_STRUCTURES) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table_name,))
                return cursor.fetchone() is not None
        except Exception as e:
            logger.warning(f"Erro ao verificar existência da tabela {table_name}: {e}")
            return False
    
    # Buscar fences
    try:
        if not table_exists('fences_tracking'):
            logger.warning("Tabela fences_tracking não encontrada no banco de dados")
        else:
            with DatabaseConnection(config.DB_STRUCTURES) as conn:
                cursor = conn.cursor()
                try:
                    columns = get_table_columns(config.DB_STRUCTURES, 'fences_tracking')
                    has_is_destroyed = 'IsDestroyed' in columns
                except Exception as e:
                    logger.warning(f"Erro ao obter colunas da tabela fences_tracking: {e}")
                    has_is_destroyed = False
                
                where_conditions = []
                params = []
                
                if has_is_destroyed:
                    if status_filter == 'active':
                        where_conditions.append("(IsDestroyed = 0 OR IsDestroyed IS NULL)")
                    elif status_filter == 'destroyed':
                        where_conditions.append("(IsDestroyed = 1)")
                
                if date_from:
                    where_conditions.append("TimeStamp >= ?")
                    params.append(date_from)
                
                if date_to:
                    where_conditions.append("TimeStamp <= ?")
                    params.append(date_to)
                
                if search:
                    where_conditions.append("(FenceId LIKE ? OR FenceName LIKE ?)")
                    search_param = f"%{search}%"
                    params.extend([search_param, search_param])
                
                where_clause = ""
                if where_conditions:
                    where_clause = "WHERE " + " AND ".join(where_conditions)
                
                query = f"""
                    SELECT IdFenceTracking, FenceId, FenceName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt
                    FROM (
                        SELECT IdFenceTracking, FenceId, FenceName,
                               PositionX, PositionY, PositionZ, TimeStamp,
                               IsDestroyed, DestroyedAt,
                               ROW_NUMBER() OVER (
                                   PARTITION BY FenceId 
                                   ORDER BY TimeStamp DESC, IdFenceTracking DESC
                               ) as rn
                        FROM fences_tracking
                        {where_clause}
                    ) ranked
                    WHERE rn = 1
                """
                
                try:
                    if where_clause and params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    
                    fence_count = 0
                    for row in cursor.fetchall():
                        structure = dict(row)
                        structure['StructureId'] = structure['FenceId']
                        structure['StructureName'] = structure['FenceName']
                        structure['StructureType'] = 'fence'
                        all_structures.append(structure)
                        fence_count += 1
                    
                    logger.info(f"Encontradas {fence_count} fences")
                except Exception as e:
                    logger.error(f"Erro ao buscar fences: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Erro ao processar fences: {e}", exc_info=True)
    
    # Buscar watchtowers
    try:
        if not table_exists('watchtowers_tracking'):
            logger.warning("Tabela watchtowers_tracking não encontrada no banco de dados")
        else:
            with DatabaseConnection(config.DB_STRUCTURES) as conn:
                cursor = conn.cursor()
                try:
                    columns = get_table_columns(config.DB_STRUCTURES, 'watchtowers_tracking')
                    has_is_destroyed = 'IsDestroyed' in columns
                except Exception as e:
                    logger.warning(f"Erro ao obter colunas da tabela watchtowers_tracking: {e}")
                    has_is_destroyed = False
                
                where_conditions = []
                params = []
                
                if has_is_destroyed:
                    if status_filter == 'active':
                        where_conditions.append("(IsDestroyed = 0 OR IsDestroyed IS NULL)")
                    elif status_filter == 'destroyed':
                        where_conditions.append("(IsDestroyed = 1)")
                
                if date_from:
                    where_conditions.append("TimeStamp >= ?")
                    params.append(date_from)
                
                if date_to:
                    where_conditions.append("TimeStamp <= ?")
                    params.append(date_to)
                
                if search:
                    where_conditions.append("(WatchtowerId LIKE ? OR WatchtowerName LIKE ?)")
                    search_param = f"%{search}%"
                    params.extend([search_param, search_param])
                
                where_clause = ""
                if where_conditions:
                    where_clause = "WHERE " + " AND ".join(where_conditions)
                
                query = f"""
                    SELECT WatchtowerTrackingId, WatchtowerId, WatchtowerName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt
                    FROM (
                        SELECT WatchtowerTrackingId, WatchtowerId, WatchtowerName,
                               PositionX, PositionY, PositionZ, TimeStamp,
                               IsDestroyed, DestroyedAt,
                               ROW_NUMBER() OVER (
                                   PARTITION BY WatchtowerId 
                                   ORDER BY TimeStamp DESC, WatchtowerTrackingId DESC
                               ) as rn
                        FROM watchtowers_tracking
                        {where_clause}
                    ) ranked
                    WHERE rn = 1
                """
                
                try:
                    if where_clause and params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    
                    watchtower_count = 0
                    for row in cursor.fetchall():
                        structure = dict(row)
                        structure['StructureId'] = structure['WatchtowerId']
                        structure['StructureName'] = structure['WatchtowerName']
                        structure['StructureType'] = 'watchtower'
                        all_structures.append(structure)
                        watchtower_count += 1
                    
                    logger.info(f"Encontradas {watchtower_count} watchtowers")
                except Exception as e:
                    logger.error(f"Erro ao buscar watchtowers: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Erro ao processar watchtowers: {e}", exc_info=True)
    
    # Buscar flags
    try:
        if not table_exists('flags_tracking'):
            logger.warning("Tabela flags_tracking não encontrada no banco de dados")
        else:
            with DatabaseConnection(config.DB_STRUCTURES) as conn:
                cursor = conn.cursor()
                try:
                    columns = get_table_columns(config.DB_STRUCTURES, 'flags_tracking')
                    has_is_destroyed = 'IsDestroyed' in columns
                except Exception as e:
                    logger.warning(f"Erro ao obter colunas da tabela flags_tracking: {e}")
                    has_is_destroyed = False
                
                where_conditions = []
                params = []
                
                if has_is_destroyed:
                    if status_filter == 'active':
                        where_conditions.append("(IsDestroyed = 0 OR IsDestroyed IS NULL)")
                    elif status_filter == 'destroyed':
                        where_conditions.append("(IsDestroyed = 1)")
                
                if date_from:
                    where_conditions.append("TimeStamp >= ?")
                    params.append(date_from)
                
                if date_to:
                    where_conditions.append("TimeStamp <= ?")
                    params.append(date_to)
                
                if search:
                    where_conditions.append("(FlagId LIKE ? OR FlagName LIKE ?)")
                    search_param = f"%{search}%"
                    params.extend([search_param, search_param])
                
                where_clause = ""
                if where_conditions:
                    where_clause = "WHERE " + " AND ".join(where_conditions)
                
                query = f"""
                    SELECT FlagTrackingId, FlagId, FlagName,
                           PositionX, PositionY, PositionZ, TimeStamp,
                           IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt
                    FROM (
                        SELECT FlagTrackingId, FlagId, FlagName,
                               PositionX, PositionY, PositionZ, TimeStamp,
                               IsDestroyed, DestroyedAt,
                               ROW_NUMBER() OVER (
                                   PARTITION BY FlagId 
                                   ORDER BY TimeStamp DESC, FlagTrackingId DESC
                               ) as rn
                        FROM flags_tracking
                        {where_clause}
                    ) ranked
                    WHERE rn = 1
                """
                
                try:
                    if where_clause and params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    
                    flag_count = 0
                    for row in cursor.fetchall():
                        structure = dict(row)
                        structure['StructureId'] = structure['FlagId']
                        structure['StructureName'] = structure['FlagName']
                        structure['StructureType'] = 'flag'
                        all_structures.append(structure)
                        flag_count += 1
                    
                    logger.info(f"Encontradas {flag_count} flags")
                except Exception as e:
                    logger.error(f"Erro ao buscar flags: {e}", exc_info=True)
    except Exception as e:
        logger.error(f"Erro ao processar flags: {e}", exc_info=True)
    
    # Contar estruturas por tipo para log detalhado
    fence_count = sum(1 for s in all_structures if s.get('StructureType') == 'fence')
    watchtower_count = sum(1 for s in all_structures if s.get('StructureType') == 'watchtower')
    flag_count = sum(1 for s in all_structures if s.get('StructureType') == 'flag')
    logger.info(f"Total de estruturas encontradas: {len(all_structures)} (Fences: {fence_count}, WatchTowers: {watchtower_count}, Flags: {flag_count})")
    
    # Calcular ChangeCount para todas as estruturas
    selected_change_types = set(change_types or [])
    change_types_active = len(selected_change_types) > 0
    full_scan_required = order_by_change_count or change_types_active or (date_from is not None or date_to is not None)
    
    def structure_matches_change_types(structure: Dict) -> bool:
        if not selected_change_types:
            return True
        flags = structure.get('ChangeFlags') or {}
        for change_type in selected_change_types:
            if flags.get(change_type):
                return True
        return False
    
    if full_scan_required:
        for structure in all_structures:
            structure_id = structure['StructureId']
            structure_type = structure['StructureType']
            try:
                change_count, change_flags = count_structure_changes(structure_id, structure_type, date_from=date_from, date_to=date_to)
                structure['ChangeCount'] = change_count
                structure['ChangeFlags'] = change_flags
                structure['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
            except Exception:
                structure['ChangeCount'] = 0
                structure['ChangeFlags'] = {
                    'position': False,
                    'status': False,
                    'structure': False
                }
                structure['ChangeTypesCount'] = 0
        
        # Aplicar filtro de tipos de alteração
        if change_types_active:
            all_structures = [s for s in all_structures if structure_matches_change_types(s)]
        
        total_records = len(all_structures)
        
        # Ordenar
        if order_by_change_count:
            reverse_order = (order_by_change_count_dir == 'desc')
            all_structures.sort(key=lambda x: x.get('ChangeCount', 0), reverse=reverse_order)
        else:
            valid_fields = ['StructureId', 'StructureName', 'StructureType', 'IsDestroyed', 'TimeStamp']
            # Sempre priorizar ChangeTypesCount primeiro, mesmo com ordenação explícita
            # Usar chave composta que inclui todos os critérios
            if order_by and order_by[0] in valid_fields:
                order_field, order_direction = order_by
                reverse_order = (order_direction == 'desc')
                # Chave composta: (has_changes invertido, ChangeTypesCount invertido, ordenação explícita)
                # Quando reverse_order=True (DESC), usar valores normais nos dois primeiros e reverse=True
                # Quando reverse_order=False (ASC), usar valores invertidos nos dois primeiros e reverse=False
                if reverse_order:
                    # Para DESC: usar valores normais e reverse=True
                    def sort_key(x):
                        change_types_count = x.get('ChangeTypesCount') or 0
                        has_changes = 1 if change_types_count > 0 else 0  # 1=tem alterações
                        order_value = x.get(order_field, '')
                        return (has_changes, change_types_count, order_value)
                    all_structures.sort(key=sort_key, reverse=True)
                else:
                    # Para ASC: usar valores invertidos e reverse=False
                    def sort_key(x):
                        change_types_count = x.get('ChangeTypesCount') or 0
                        has_changes_inverted = 1 - (1 if change_types_count > 0 else 0)  # 0=tem alterações
                        change_types_count_inverted = -(change_types_count)
                        order_value = x.get(order_field, '')
                        return (has_changes_inverted, change_types_count_inverted, order_value)
                    all_structures.sort(key=sort_key, reverse=False)
            else:
                # Sem ordenação explícita: usar TimeStamp DESC como terceiro critério
                def sort_key(x):
                    change_types_count = x.get('ChangeTypesCount') or 0
                    has_changes_inverted = 1 - (1 if change_types_count > 0 else 0)
                    change_types_count_inverted = -(change_types_count)
                    timestamp = x.get('TimeStamp', '')
                    return (has_changes_inverted, change_types_count_inverted, timestamp)
                all_structures.sort(key=sort_key, reverse=False)
        
        # Aplicar paginação
        data = all_structures[start:start + length]
    else:
        # Calcular ChangeCount para todas as estruturas antes de ordenar
        # Isso é necessário para a ordenação padrão por TimeStamp e ChangeTypesCount
        for structure in all_structures:
            structure_id = structure['StructureId']
            structure_type = structure['StructureType']
            try:
                change_count, change_flags = count_structure_changes(structure_id, structure_type, date_from=date_from, date_to=date_to)
                structure['ChangeCount'] = change_count
                structure['ChangeFlags'] = change_flags
                structure['ChangeTypesCount'] = sum(1 for v in (change_flags or {}).values() if v)
            except Exception:
                structure['ChangeCount'] = 0
                structure['ChangeFlags'] = {
                    'position': False,
                    'status': False,
                    'structure': False
                }
                structure['ChangeTypesCount'] = 0
        
        # Ordenar antes de paginar
        valid_fields = ['StructureId', 'StructureName', 'StructureType', 'IsDestroyed', 'TimeStamp']
        # Sempre priorizar ChangeTypesCount primeiro, mesmo com ordenação explícita
        if order_by and order_by[0] in valid_fields:
            order_field, order_direction = order_by
            reverse_order = (order_direction == 'desc')
            # Quando reverse_order=True (DESC), usar valores normais e reverse=True
            # Quando reverse_order=False (ASC), usar valores invertidos e reverse=False
            if reverse_order:
                # Para DESC: usar valores normais e reverse=True
                def sort_key(x):
                    change_types_count = x.get('ChangeTypesCount') or 0
                    has_changes = 1 if change_types_count > 0 else 0  # 1=tem alterações
                    order_value = x.get(order_field, '')
                    return (has_changes, change_types_count, order_value)
                all_structures.sort(key=sort_key, reverse=True)
            else:
                # Para ASC: usar valores invertidos e reverse=False
                def sort_key(x):
                    change_types_count = x.get('ChangeTypesCount') or 0
                    has_changes_inverted = 1 - (1 if change_types_count > 0 else 0)  # 0=tem alterações
                    change_types_count_inverted = -(change_types_count)
                    order_value = x.get(order_field, '')
                    return (has_changes_inverted, change_types_count_inverted, order_value)
                all_structures.sort(key=sort_key, reverse=False)
        else:
            # Sem ordenação explícita: usar TimeStamp DESC como terceiro critério
            def sort_key(x):
                change_types_count = x.get('ChangeTypesCount') or 0
                has_changes = 1 if change_types_count > 0 else 0  # 1=tem alterações
                timestamp = x.get('TimeStamp', '')
                return (has_changes, change_types_count, timestamp)
            all_structures.sort(key=sort_key, reverse=True)
        
        total_records = len(all_structures)
        data = all_structures[start:start + length]
    
    return data, total_records

def get_structure_history(structure_id: str, structure_type: str, limit: int = 5000, offset: int = 0,
                          date_from: str = None, date_to: str = None) -> List[Dict]:
    """Retorna histórico de uma estrutura com suporte a filtros de data"""
    with DatabaseConnection(config.DB_STRUCTURES) as conn:
        cursor = conn.cursor()
        
        # Determinar tabela e campos baseado no tipo
        if structure_type == 'fence':
            table_name = 'fences_tracking'
            id_field = 'FenceId'
            tracking_id_field = 'IdFenceTracking'
            name_field = 'FenceName'
        elif structure_type == 'watchtower':
            table_name = 'watchtowers_tracking'
            id_field = 'WatchtowerId'
            tracking_id_field = 'WatchtowerTrackingId'
            name_field = 'WatchtowerName'
        elif structure_type == 'flag':
            table_name = 'flags_tracking'
            id_field = 'FlagId'
            tracking_id_field = 'FlagTrackingId'
            name_field = 'FlagName'
        else:
            return []
        
        # Construir WHERE clause
        where_conditions = [f"{id_field} = ?"]
        params = [structure_id]
        
        if date_from:
            where_conditions.append("TimeStamp >= ?")
            params.append(date_from)
        
        if date_to:
            where_conditions.append("TimeStamp <= ?")
            params.append(date_to)
        
        where_clause = "WHERE " + " AND ".join(where_conditions)
        
        # Buscar histórico completo com componentes estruturais incluídos
        if structure_type == 'fence':
            query = f"""
                SELECT {tracking_id_field}, {id_field}, {name_field},
                       PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt,
                       HasBase, LowerPanelBuilt, UpperPanelBuilt
                FROM {table_name}
                {where_clause}
                ORDER BY TimeStamp DESC
                LIMIT ? OFFSET ?
            """
        elif structure_type == 'watchtower':
            query = f"""
                SELECT {tracking_id_field}, {id_field}, {name_field},
                       PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt,
                       HasBase, Level1BaseBuilt, Level2BaseBuilt, Level3BaseBuilt,
                       Level1StairsBuilt, Level2StairsBuilt, HasRoof,
                       Level1Wall1LowerBuilt, Level1Wall1UpperBuilt, Level1Wall2LowerBuilt, Level1Wall2UpperBuilt,
                       Level1Wall3LowerBuilt, Level1Wall3UpperBuilt,
                       Level2Wall1LowerBuilt, Level2Wall1UpperBuilt, Level2Wall2LowerBuilt, Level2Wall2UpperBuilt,
                       Level2Wall3LowerBuilt, Level2Wall3UpperBuilt,
                       Level3Wall1LowerBuilt, Level3Wall1UpperBuilt, Level3Wall2LowerBuilt, Level3Wall2UpperBuilt,
                       Level3Wall3LowerBuilt, Level3Wall3UpperBuilt
                FROM {table_name}
                {where_clause}
                ORDER BY TimeStamp DESC
                LIMIT ? OFFSET ?
            """
        elif structure_type == 'flag':
            query = f"""
                SELECT {tracking_id_field}, {id_field}, {name_field},
                       PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt,
                       HasBase, HasFlagBase, FlagRaised, FlagHeight
                FROM {table_name}
                {where_clause}
                ORDER BY TimeStamp DESC
                LIMIT ? OFFSET ?
            """
        else:
            query = f"""
                SELECT {tracking_id_field}, {id_field}, {name_field},
                       PositionX, PositionY, PositionZ, TimeStamp,
                       IFNULL(IsDestroyed, 0) as IsDestroyed, DestroyedAt
                FROM {table_name}
                {where_clause}
                ORDER BY TimeStamp DESC
                LIMIT ? OFFSET ?
            """
        
        params.extend([limit, offset])
        cursor.execute(query, params)
        history = [dict(row) for row in cursor.fetchall()]
        
        return history

def filter_structure_history_by_changes(history: List[Dict], structure_type: str = 'fence') -> List[Dict]:
    """Filtra histórico mantendo apenas registros com mudanças significativas"""
    if len(history) <= 1:
        return history
    
    pos_threshold = 0.1
    
    # Campos a serem excluídos das comparações
    exclude_fields = ['PositionX', 'PositionY', 'PositionZ', 'TimeStamp', 'IsDestroyed', 'DestroyedAt',
                     'FenceName', 'WatchtowerName', 'FlagName',
                     'IdFenceTracking', 'WatchtowerTrackingId', 'FlagTrackingId',
                     'FenceId', 'WatchtowerId', 'FlagId']
    name_fields = ['FenceName', 'WatchtowerName', 'FlagName']
    
    # Função auxiliar para normalizar valores booleanos
    def normalize_bool_value(value):
        if value is None:
            return 0
        if isinstance(value, bool):
            return 1 if value else 0
        try:
            int_val = int(value)
            return 1 if int_val != 0 else 0
        except:
            return 0
    
    # Função auxiliar para verificar se dois registros têm mudanças significativas
    def has_changes(r1, r2):
        pos_ch = (
            abs((r1.get('PositionX') or 0) - (r2.get('PositionX') or 0)) > pos_threshold or
            abs((r1.get('PositionY') or 0) - (r2.get('PositionY') or 0)) > pos_threshold or
            abs((r1.get('PositionZ') or 0) - (r2.get('PositionZ') or 0)) > pos_threshold
        )
        status_ch = (r1.get('IsDestroyed') or 0) != (r2.get('IsDestroyed') or 0)
        
        name_ch = False
        for name_field in name_fields:
            if name_field in r1 and name_field in r2:
                if r1.get(name_field) != r2.get(name_field):
                    name_ch = True
                    break
        
        structure_ch = False
        r1_keys = set(k for k in r1.keys() if k not in exclude_fields and not k.endswith('TrackingId') and not k.endswith('Id'))
        r2_keys = set(k for k in r2.keys() if k not in exclude_fields and not k.endswith('TrackingId') and not k.endswith('Id'))
        common_keys = r1_keys & r2_keys
        for key in common_keys:
            if r1.get(key) != r2.get(key):
                structure_ch = True
                break
        
        # Detectar ataque: componente estava construído e agora está destruído
        attack_ch = False
        if structure_type == 'fence':
            prev_lower = normalize_bool_value(r1.get('LowerPanelBuilt', 0))
            prev_upper = normalize_bool_value(r1.get('UpperPanelBuilt', 0))
            curr_lower = normalize_bool_value(r2.get('LowerPanelBuilt', 0))
            curr_upper = normalize_bool_value(r2.get('UpperPanelBuilt', 0))
            
            # Ataque: painel estava construído (1) e agora está destruído (0)
            if (prev_lower == 1 and curr_lower == 0) or (prev_upper == 1 and curr_upper == 0):
                attack_ch = True
        elif structure_type == 'watchtower':
            # Lista de todas as paredes para verificar
            wall_fields = [
                'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt'
            ]
            
            for wall_field in wall_fields:
                prev_wall = normalize_bool_value(r1.get(wall_field, 0))
                curr_wall = normalize_bool_value(r2.get(wall_field, 0))
                
                # Ataque: parede estava construída (1) e agora está destruída (0)
                if prev_wall == 1 and curr_wall == 0:
                    attack_ch = True
                    break
        
        return pos_ch or status_ch or name_ch or structure_ch or attack_ch
    
    # Trabalhar em ordem ASC (do mais antigo para o mais recente)
    # History vem em DESC, então revertemos para ASC
    asc_history = list(reversed(history))
    n = len(asc_history)
    
    # Lista para rastrear quais registros manter
    keep_asc = [False] * n
    
    # Comparar registros consecutivos (do mais antigo para o mais recente)
    # Marcar registros apenas quando há mudanças significativas
    for i in range(1, n):
        prev = asc_history[i - 1]
        curr = asc_history[i]
        
        if has_changes(prev, curr):
            # Há mudanças significativas: manter ambos os registros
            keep_asc[i - 1] = True
            keep_asc[i] = True
    
    # Processar grupos de registros consecutivos sem mudanças
    # Estratégia: Para cada grupo sem mudanças, manter apenas o último registro do grupo
    i = 0
    while i < n:
        if keep_asc[i]:
            # Registro já marcado (houve mudanças), pular para o próximo
            i += 1
            continue
        
        # Encontrar grupo de registros consecutivos não marcados (sem mudanças)
        group_start = i
        group_end = i
        
        # Avançar até encontrar um registro marcado ou o fim da lista
        while group_end < n and not keep_asc[group_end]:
            group_end += 1
        
        # Se o grupo vai até o final da lista
        if group_end >= n:
            # Manter apenas o último registro do grupo (mais recente)
            # Desmarcar todos os anteriores do grupo (incluindo o primeiro se foi marcado por outro motivo)
            for j in range(group_start, n - 1):
                keep_asc[j] = False
            # Garantir que o último registro seja mantido
            keep_asc[n - 1] = True
            break
        
        # Se há um registro marcado após o grupo
        if group_end > group_start:
            # Desmarcar todos os registros do grupo exceto o último (antes do marcado)
            for j in range(group_start, group_end - 1):
                keep_asc[j] = False
            # Manter apenas o último registro do grupo
            keep_asc[group_end - 1] = True
        
        i = group_end
    
    # Sempre garantir que o último registro (mais recente) seja mantido
    # Isso é importante para garantir que sempre temos pelo menos um registro
    keep_asc[n - 1] = True
    
    # Se nenhum registro foi marcado (todos são idênticos), manter apenas o último
    if not any(keep_asc):
        keep_asc[n - 1] = True
    
    # Filtrar e reverter para ordem DESC (mais recente primeiro)
    filtered = [asc_history[i] for i in range(n) if keep_asc[i]]
    return list(reversed(filtered))
