"""
Utilitários SQLite reutilizáveis
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


def configure_sqlite_pragmas(cursor: sqlite3.Cursor) -> None:
    """Configura PRAGMAs SQLite para otimização"""
    try:
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.execute("PRAGMA synchronous = NORMAL")
    except Exception as e:
        logger.warning(f"Erro ao configurar PRAGMAs (continuando): {e}")


def generate_unique_timestamps(base_timestamp: datetime, count: int) -> List[datetime]:
    """
    Gera timestamps únicos com incremento de milissegundos
    
    Args:
        base_timestamp: Timestamp base
        count: Número de timestamps a gerar
        
    Returns:
        Lista de timestamps únicos
    """
    timestamps = []
    for i in range(count):
        # Incremento de 0.001 segundos (1 milissegundo) por registro
        delta = timedelta(milliseconds=i)
        timestamps.append(base_timestamp + delta)
    return timestamps


def ensure_players_in_database(cursor: sqlite3.Cursor, players_data: List[Dict[str, Any]]) -> bool:
    """
    Garante que todos os PlayerIDs existem em players_database
    players_data deve conter pelo menos 'player_id', e opcionalmente 'player_name' e 'steam_id'
    Retorna True se sucesso, False caso contrário
    """
    if not players_data:
        return True
    
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
        return True
    
    player_ids = list(player_map.keys())
    
    try:
        placeholders = ','.join(['?'] * len(player_ids))
        cursor.execute(f"""
            SELECT PlayerID 
            FROM players_database 
            WHERE PlayerID IN ({placeholders})
        """, player_ids)
        
        existing_ids = {row[0] for row in cursor.fetchall()}
        
        missing_ids = [pid for pid in player_ids if pid not in existing_ids]
        
        if not missing_ids:
            return True
        
        insert_values = []
        for player_id in missing_ids:
            player_info = player_map[player_id]
            player_name = player_info.get('player_name')
            steam_id = player_info.get('steam_id')
            
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



