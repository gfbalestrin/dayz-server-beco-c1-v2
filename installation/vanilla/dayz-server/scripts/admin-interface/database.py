"""
Camada de acesso aos bancos de dados SQLite
"""
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import config

class DatabaseConnection:
    """Context manager para conexões com o banco de dados"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = None
    
    def __enter__(self):
        self.conn = sqlite3.connect(self.db_path)
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
    with DatabaseConnection(config.DB_LOGS) as conn:
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
    """Retorna a última posição de cada veículo"""
    with DatabaseConnection(config.DB_LOGS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT VehicleId, VehicleName,
                   PositionX, PositionY, PositionZ, TimeStamp, IdVehicleTracking
            FROM vehicles_tracking v1
            WHERE TimeStamp = (
                SELECT MAX(TimeStamp)
                FROM vehicles_tracking v2
                WHERE v2.VehicleId = v1.VehicleId
            )
            ORDER BY VehicleName
        """)
        return [dict(row) for row in cursor.fetchall()]

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
            SELECT PlayerID, PlayerName, SteamID, SteamName
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
                   pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data, pc.PlayerCoordId
            FROM players_database p
            INNER JOIN (
                SELECT PlayerID, MAX(Data) as MaxData
                FROM players_coord
                GROUP BY PlayerID
            ) latest ON p.PlayerID = latest.PlayerID
            INNER JOIN players_coord pc ON pc.PlayerID = latest.PlayerID AND pc.Data = latest.MaxData
            ORDER BY p.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

def get_player_trail(player_id: str, limit: int = 100) -> List[Dict]:
    """Retorna o histórico de movimento de um jogador com flag de backup"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pc.PlayerCoordId, pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data,
                   CASE WHEN pcb.PlayerCoordId IS NOT NULL THEN 1 ELSE 0 END as HasBackup
            FROM players_coord pc
            LEFT JOIN (
                SELECT DISTINCT PlayerCoordId FROM players_coord_backup
            ) pcb ON pc.PlayerCoordId = pcb.PlayerCoordId
            WHERE pc.PlayerID = ?
            ORDER BY pc.Data DESC
            LIMIT ?
        """, (player_id, limit))
        results = [dict(row) for row in cursor.fetchall()]
        return results

def get_online_players_positions() -> List[Dict]:
    """Retorna posições de jogadores online"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                   pc.CoordX, pc.CoordY, pc.CoordZ, pc.Data, pc.PlayerCoordId,
                   1 as IsOnline
            FROM players_online po
            INNER JOIN players_database p ON po.PlayerID = p.PlayerID
            INNER JOIN (
                SELECT PlayerID, MAX(Data) as MaxData
                FROM players_coord
                GROUP BY PlayerID
            ) latest ON p.PlayerID = latest.PlayerID
            INNER JOIN players_coord pc ON pc.PlayerID = latest.PlayerID AND pc.Data = latest.MaxData
            ORDER BY p.PlayerName
        """)
        return [dict(row) for row in cursor.fetchall()]

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

def get_recent_kills(limit: int = 100) -> List[Dict]:
    """Retorna kills recentes com posições"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
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
                victim.PlayerName as VictimName
            FROM players_killfeed k
            LEFT JOIN players_database killer ON k.PlayerIDKiller = killer.PlayerID
            LEFT JOIN players_database victim ON k.PlayerIDKilled = victim.PlayerID
            ORDER BY k.Data DESC
            LIMIT ?
        """, (limit,))
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

def get_weapons(search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de armas com filtro opcional"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        if search:
            cursor.execute("""
                SELECT id, name, name_type, img
                FROM weapons
                WHERE name LIKE ? OR name_type LIKE ?
                LIMIT ?
            """, (f'%{search}%', f'%{search}%', limit))
        else:
            cursor.execute("""
                SELECT id, name, name_type, img
                FROM weapons
                LIMIT ?
            """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def get_items(type_id: int = None, search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de itens com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, type_id, img FROM item WHERE 1=1"
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
        query = "SELECT id, name, name_type, img FROM explosives WHERE 1=1"
        params = []
        
        if search:
            query += " AND (name LIKE ? OR name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        query += " LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_ammunitions(search: str = None, caliber_id: int = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de munições com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, caliber_id, img FROM ammunitions WHERE 1=1"
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

def get_magazines(search: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de magazines com filtro opcional"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, capacity, img FROM magazines WHERE 1=1"
        params = []
        
        if search:
            query += " AND (name LIKE ? OR name_type LIKE ?)"
            params.extend([f'%{search}%', f'%{search}%'])
        
        query += " LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_attachments(search: str = None, type_filter: str = None, limit: int = 50) -> List[Dict]:
    """Retorna lista de attachments com filtros opcionais"""
    with DatabaseConnection(config.DB_ITEMS) as conn:
        cursor = conn.cursor()
        query = "SELECT id, name, name_type, type, img FROM attachments WHERE 1=1"
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
            SELECT at.id, at.name, at.name_type, at.type, at.img
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
