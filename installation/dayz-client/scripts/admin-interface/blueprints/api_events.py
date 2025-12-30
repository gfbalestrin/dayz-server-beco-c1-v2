"""
Blueprint de API de Eventos
Rotas de API para kills e damages
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from zoneinfo import ZoneInfo
from database import get_recent_kills, get_recent_damages, parse_position, dayz_to_pixel, get_recent_player_events
from blueprints.auth import admin_required
import logging

# Configurar logger para debug de timezone
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

api_events_bp = Blueprint('api_events', __name__)

def normalize_since_timestamp(since_str: str) -> str:
    """
    Converte timestamp ISO com timezone para formato UTC que o SQLite espera.
    
    Args:
        since_str: Timestamp em formato ISO (ex: '2025-12-30T17:28:56-03:00')
    
    Returns:
        Timestamp em formato UTC para SQLite (ex: '2025-12-30 20:28:56')
    """
    if not since_str:
        return None
    
    try:
        # Parsear timestamp ISO com timezone
        dt = datetime.fromisoformat(since_str)
        
        # Converter para UTC
        if dt.tzinfo is None:
            # Se não tem timezone, assumir que já está em UTC
            dt_utc = dt
        else:
            dt_utc = dt.astimezone(ZoneInfo('UTC'))
        
        # Retornar no formato que o SQLite espera (sem timezone)
        return dt_utc.strftime('%Y-%m-%d %H:%M:%S')
    except (ValueError, AttributeError):
        # Se falhar, retornar original
        return since_str

@api_events_bp.route('/api/events/kills')
@admin_required
def api_kills():
    """API com eventos de kills recentes"""
    limit = request.args.get('limit', 100, type=int)
    since = request.args.get('since', None)
    
    # Normalizar timestamp para UTC antes de passar para o banco
    if since:
        since = normalize_since_timestamp(since)
    
    kills = get_recent_kills(limit, since_timestamp=since)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'events': []
    }
    
    for kill in kills:
        pos_killer = parse_position(kill['PosKiller'])
        pos_killed = parse_position(kill['PosKilled'])
        
        if pos_killer:
            pixel_killer = dayz_to_pixel(pos_killer[0], pos_killer[1])
            killer_pos = {
                'x': pos_killer[0],
                'y': pos_killer[1],
                'z': pos_killer[2],
                'pixel_coords': pixel_killer
            }
        else:
            pixel_killer = None
            killer_pos = None
        
        if pos_killed:
            pixel_killed = dayz_to_pixel(pos_killed[0], pos_killed[1])
            victim_pos = {
                'x': pos_killed[0],
                'y': pos_killed[1],
                'z': pos_killed[2],
                'pixel_coords': pixel_killed
            }
        else:
            pixel_killed = None
            victim_pos = None
        
        # Converter timestamp de UTC para America/Sao_Paulo
        timestamp_br = kill['Data']
        if kill['Data']:
            try:
                # Parsear timestamp do banco (formato: YYYY-MM-DD HH:MM:SS ou YYYY-MM-DD HH:MM:SS.ffffff)
                try:
                    dt_utc = datetime.strptime(kill['Data'], '%Y-%m-%d %H:%M:%S.%f')
                except ValueError:
                    dt_utc = datetime.strptime(kill['Data'], '%Y-%m-%d %H:%M:%S')
                # Timestamp está em UTC, adicionar timezone UTC
                dt_utc = dt_utc.replace(tzinfo=ZoneInfo('UTC'))
                # Converter para America/Sao_Paulo
                dt_sp = dt_utc.astimezone(ZoneInfo('America/Sao_Paulo'))
                timestamp_br = dt_sp.isoformat()
            except (ValueError, AttributeError):
                # Se falhar, manter o timestamp original
                pass
        
        result['events'].append({
            'id': kill['Id'],
            'killer_id': kill['PlayerIDKiller'],
            'killer_name': kill['KillerName'] or 'Desconhecido',
            'killer_steam_name': kill.get('KillerSteamName') or None,
            'victim_id': kill['PlayerIDKilled'],
            'victim_name': kill['VictimName'] or 'Desconhecido',
            'victim_steam_name': kill.get('VictimSteamName') or None,
            'weapon': kill['Weapon'] or 'Desconhecido',
            'distance': kill['DistanceMeter'] or 0,
            'timestamp': timestamp_br,
            'killer_pos': killer_pos,
            'victim_pos': victim_pos
        })
    
    return jsonify(result)

@api_events_bp.route('/api/events/damages')
@admin_required
def api_damages():
    """API com eventos de danos recentes entre jogadores"""
    limit = request.args.get('limit', 100, type=int)
    since = request.args.get('since', None)
    
    # Normalizar timestamp para UTC antes de passar para o banco
    if since:
        since = normalize_since_timestamp(since)
    
    damages = get_recent_damages(limit, since_timestamp=since)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'events': []
    }
    
    for damage in damages:
        pos_attacker = parse_position(damage['PosAttacker'])
        pos_victim = parse_position(damage['PosVictim'])
        
        if pos_attacker:
            pixel_attacker = dayz_to_pixel(pos_attacker[0], pos_attacker[1])
            attacker_pos = {
                'x': pos_attacker[0],
                'y': pos_attacker[1],
                'z': pos_attacker[2],
                'pixel_coords': pixel_attacker
            }
        else:
            pixel_attacker = None
            attacker_pos = None
        
        if pos_victim:
            pixel_victim = dayz_to_pixel(pos_victim[0], pos_victim[1])
            victim_pos = {
                'x': pos_victim[0],
                'y': pos_victim[1],
                'z': pos_victim[2],
                'pixel_coords': pixel_victim
            }
        else:
            pixel_victim = None
            victim_pos = None
        
        # Converter timestamp de UTC para America/Sao_Paulo
        timestamp_br = damage['Data']
        if damage['Data']:
            try:
                # Parsear timestamp do banco (formato: YYYY-MM-DD HH:MM:SS ou YYYY-MM-DD HH:MM:SS.ffffff)
                try:
                    dt_utc = datetime.strptime(damage['Data'], '%Y-%m-%d %H:%M:%S.%f')
                except ValueError:
                    dt_utc = datetime.strptime(damage['Data'], '%Y-%m-%d %H:%M:%S')
                # Timestamp está em UTC, adicionar timezone UTC
                dt_utc = dt_utc.replace(tzinfo=ZoneInfo('UTC'))
                # Converter para America/Sao_Paulo
                dt_sp = dt_utc.astimezone(ZoneInfo('America/Sao_Paulo'))
                timestamp_br = dt_sp.isoformat()
            except (ValueError, AttributeError):
                # Se falhar, manter o timestamp original
                pass
        
        result['events'].append({
            'id': damage['Id'],
            'attacker_id': damage['PlayerIDAttacker'],
            'attacker_name': damage['AttackerName'] or 'Desconhecido',
            'attacker_steam_name': damage.get('AttackerSteamName') or None,
            'victim_id': damage['PlayerIDVictim'],
            'victim_name': damage['VictimName'] or 'Desconhecido',
            'victim_steam_name': damage.get('VictimSteamName') or None,
            'local_damage': damage.get('LocalDamage') or None,
            'hit_type': damage.get('HitType') or None,
            'damage': damage.get('Damage') or 0,
            'health': damage.get('Health') or None,
            'weapon': damage['Weapon'] or 'Desconhecido',
            'distance': damage['DistanceMeter'] or 0,
            'timestamp': timestamp_br,
            'attacker_pos': attacker_pos,
            'victim_pos': victim_pos
        })
    
    return jsonify(result)

@api_events_bp.route('/api/events/recent')
@admin_required
def api_recent_player_events():
    """API com eventos recentes de todos os jogadores da tabela players_events"""
    limit = request.args.get('limit', 50, type=int)
    since_timestamp = request.args.get('since', None)
    event_types = request.args.getlist('event_type')
    
    # Normalizar timestamp para UTC antes de passar para o banco
    if since_timestamp:
        since_timestamp = normalize_since_timestamp(since_timestamp)
    
    events = get_recent_player_events(limit, since_timestamp, event_types if event_types else None)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'events': []
    }
    
    for event in events:
        # Converter timestamp de UTC para America/Sao_Paulo
        timestamp_br = event.get('TimeStamp')
        if timestamp_br:
            try:
                # Se for string, parsear
                if isinstance(timestamp_br, str):
                    # Parsear formato do SQLite (YYYY-MM-DD HH:MM:SS) - sempre como UTC
                    try:
                        dt_utc = datetime.strptime(timestamp_br, '%Y-%m-%d %H:%M:%S.%f')
                    except ValueError:
                        dt_utc = datetime.strptime(timestamp_br, '%Y-%m-%d %H:%M:%S')

                    # Adicionar timezone UTC (banco armazena em UTC)
                    dt_utc = dt_utc.replace(tzinfo=ZoneInfo('UTC'))
                else:
                    # Se já for datetime, adicionar UTC se não tiver timezone
                    dt_utc = timestamp_br
                    if dt_utc.tzinfo is None:
                        dt_utc = dt_utc.replace(tzinfo=ZoneInfo('UTC'))

                # Converter para America/Sao_Paulo
                dt_sp = dt_utc.astimezone(ZoneInfo('America/Sao_Paulo'))
                timestamp_br = dt_sp.isoformat()

            except (ValueError, AttributeError):
                # Se falhar, manter o timestamp original
                pass

        result['events'].append({
            'event_id': event.get('EventId'),
            'player_id': event.get('PlayerID'),
            'player_name': event.get('PlayerName') or 'Desconhecido',
            'steam_name': event.get('SteamName'),
            'event_type': event.get('EventType'),
            'timestamp': timestamp_br,
            'coord_x': event.get('CoordX'),
            'coord_y': event.get('CoordY'),
            'coord_z': event.get('CoordZ'),
            'details': event.get('Details'),
            'related_player_id': event.get('RelatedPlayerID'),
            'related_player_name': event.get('RelatedPlayerName'),
            'related_steam_name': event.get('RelatedSteamName')
        })
    
    return jsonify(result)
