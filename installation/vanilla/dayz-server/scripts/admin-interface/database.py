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

def get_all_players_with_status() -> List[Dict]:
    """Retorna todos os jogadores com status online e últimas coordenadas"""
    with DatabaseConnection(config.DB_PLAYERS) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                pd.*,
                po.DataConnect,
                CASE WHEN po.PlayerID IS NOT NULL THEN 1 ELSE 0 END as IsOnline,
                pc.CoordX, 
                pc.CoordY, 
                pc.Data as LastCoordDate
            FROM players_database pd
            LEFT JOIN players_online po ON pd.PlayerID = po.PlayerID
            LEFT JOIN (
                SELECT PlayerID, CoordX, CoordY, Data,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY Data DESC) as rn
                FROM players_coord
            ) pc ON pd.PlayerID = pc.PlayerID AND pc.rn = 1
            ORDER BY IsOnline DESC, pd.PlayerName ASC
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
                SELECT DISTINCT at.id, at.name, at.name_type, at.type, at.slots, at.width, at.height, at.img
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
            query = "SELECT id, name, name_type, type, slots, width, height, img FROM attachments WHERE 1=1"
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
