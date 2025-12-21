"""
Blueprint de API de Eventos
Rotas de API para kills e damages
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from database import get_recent_kills, get_recent_damages, parse_position, dayz_to_pixel
from blueprints.auth import admin_required

api_events_bp = Blueprint('api_events', __name__)

@api_events_bp.route('/api/events/kills')
@admin_required
def api_kills():
    """API com eventos de kills recentes"""
    limit = request.args.get('limit', 100, type=int)
    kills = get_recent_kills(limit)
    
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
            'timestamp': kill['Data'],
            'killer_pos': killer_pos,
            'victim_pos': victim_pos
        })
    
    return jsonify(result)

@api_events_bp.route('/api/events/damages')
@admin_required
def api_damages():
    """API com eventos de danos recentes entre jogadores"""
    limit = request.args.get('limit', 100, type=int)
    damages = get_recent_damages(limit)
    
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
            'timestamp': damage['Data'],
            'attacker_pos': attacker_pos,
            'victim_pos': victim_pos
        })
    
    return jsonify(result)
