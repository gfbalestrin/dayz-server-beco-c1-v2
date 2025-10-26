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
