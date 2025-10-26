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
