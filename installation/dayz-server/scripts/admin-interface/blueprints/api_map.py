"""
Blueprint de API do Mapa
Rotas de API para posições e trails de players, vehicles, containers e fences
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
import logging
import os
import fcntl
import config
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo
from database import (
    get_players_last_position, get_online_players, get_player_trail,
    get_online_players_positions, get_vehicles_map_positions,
    get_vehicle_trail, get_containers_last_position, get_container_trail,
    get_fences_last_position, get_watchtowers_last_position, get_flags_last_position,
    get_fence_trail, get_watchtower_trail, get_flag_trail,
    get_item_details_from_items_db, dayz_to_pixel, get_player_events, clear_player_events
)
from blueprints.auth import admin_required, audit_action
from blueprints.helpers import convert_timestamp_to_br

api_map_bp = Blueprint('api_map', __name__)

@api_map_bp.route('/api/players/positions')
@admin_required
def api_positions():
    """API com posições atuais de todos os jogadores"""
    positions = get_players_last_position()
    
    # Buscar lista de jogadores online
    online_players = get_online_players()
    online_ids = set(p['PlayerID'] for p in online_players)
    
    # Converter para formato esperado pelo frontend
    result = {
        'timestamp': datetime.now().isoformat(),
        'players': []
    }
    
    for pos in positions:
        # TESTE: CoordY do banco é a coordenada Norte-Sul
        # Mas pode estar invertido (Norte no topo ou embaixo da imagem)
        # Vamos testar com inversão
        pixel_coords = dayz_to_pixel(pos['CoordX'], pos['CoordY'])
        result['players'].append({
            'player_id': pos['PlayerID'],
            'player_name': pos['PlayerName'] or 'Sem nome',
            'steam_name': pos['SteamName'] or 'Sem steam name',
            'coord_x': pos['CoordX'],
            'coord_y': pos['CoordY'],  # Essa é Sul-Norte
            'coord_z': pos['CoordZ'],  # Essa é Altitude
            'pixel_coords': pixel_coords,
            'last_update': pos['Data'] or '',
            'is_online': pos['PlayerID'] in online_ids,
            'health': pos.get('Health'),
            'blood': pos.get('Blood'),
            'shock': pos.get('Shock'),
            'energy': pos.get('Energy'),
            'water': pos.get('Water'),
            'is_alive': bool(pos.get('IsAlive')) if pos.get('IsAlive') is not None else None,
            'is_admin': bool(pos.get('IsAdmin')) if pos.get('IsAdmin') is not None else None,
            'stamina': pos.get('Stamina'),
            'stamina_max': pos.get('StaminaMax'),
            'items_in_hands': pos.get('ItemsInHands'),
            'items_count': pos.get('ItemsCount'),
            'main_items': pos.get('MainItems')
        })
    
    return jsonify(result)

@api_map_bp.route('/api/players/<player_id>/trail')
@admin_required
def api_player_trail(player_id):
    """API com trail de um jogador específico"""
    limit = request.args.get('limit', 100, type=int)
    date_from = request.args.get('date_from', None)
    date_to = request.args.get('date_to', None)
    
    # Converter parâmetros de data de UTC para formato do banco (assumindo UTC no banco)
    # O frontend envia em ISO (UTC), precisamos converter para UTC antes de buscar no banco
    if date_from:
        try:
            # Parse ISO string (assumindo UTC)
            dt_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if dt_from.tzinfo is None:
                dt_from = dt_from.replace(tzinfo=ZoneInfo('UTC'))
            # Converter para string no formato do banco (UTC)
            # Incluir milissegundos se disponíveis para comparação precisa
            if dt_from.microsecond > 0:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass  # Manter original se não conseguir parsear
    
    if date_to:
        try:
            # Parse ISO string (assumindo UTC)
            dt_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if dt_to.tzinfo is None:
                dt_to = dt_to.replace(tzinfo=ZoneInfo('UTC'))
            # Converter para string no formato do banco (UTC)
            # Incluir milissegundos se disponíveis para comparação precisa
            if dt_to.microsecond > 0:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass  # Manter original se não conseguir parsear
    
    trail = get_player_trail(player_id, limit, date_from, date_to)
    
    result = {
        'player_id': player_id,
        'trail': []
    }
    
    for point in trail:
        pixel_coords = dayz_to_pixel(point['CoordX'], point['CoordY'])
        # Timestamp do banco já está em America/Sao_Paulo (salvo com 'localtime')
        # Apenas adicionar timezone -03:00 para manter formato ISO consistente
        timestamp_br = None
        if point.get('Data'):
            try:
                # Parse timestamp do banco (já em America/Sao_Paulo)
                # Tentar primeiro com milissegundos, depois sem
                try:
                    dt = datetime.strptime(point['Data'], '%Y-%m-%d %H:%M:%S.%f')
                except ValueError:
                    dt = datetime.strptime(point['Data'], '%Y-%m-%d %H:%M:%S')
                # Adicionar timezone America/Sao_Paulo (sem conversão, pois já está nesse timezone)
                dt_sp = dt.replace(tzinfo=ZoneInfo('America/Sao_Paulo'))
                # Retornar em formato ISO com timezone
                timestamp_br = dt_sp.isoformat()
            except (ValueError, AttributeError):
                # Fallback: retornar timestamp original
                timestamp_br = point['Data']
        
        trail_point = {
            'player_coord_id': point['PlayerCoordId'],
            'coord_x': point['CoordX'],
            'coord_y': point['CoordY'],
            'coord_z': point['CoordZ'],
            'pixel_coords': pixel_coords,
            'timestamp': timestamp_br or '',
            'has_backup': bool(point.get('HasBackup', 0))
        }
        
        # Adicionar campos de informações do jogador se estiverem disponíveis
        if 'Health' in point and point['Health'] is not None:
            trail_point['health'] = point['Health']
        if 'Blood' in point and point['Blood'] is not None:
            trail_point['blood'] = point['Blood']
        if 'Shock' in point and point['Shock'] is not None:
            trail_point['shock'] = point['Shock']
        if 'Energy' in point and point['Energy'] is not None:
            trail_point['energy'] = point['Energy']
        if 'Water' in point and point['Water'] is not None:
            trail_point['water'] = point['Water']
        if 'IsAlive' in point and point['IsAlive'] is not None:
            trail_point['is_alive'] = bool(point['IsAlive'])
        if 'Stamina' in point and point['Stamina'] is not None:
            trail_point['stamina'] = point['Stamina']
        if 'StaminaMax' in point and point['StaminaMax'] is not None:
            trail_point['stamina_max'] = point['StaminaMax']
        if 'ItemsInHands' in point and point['ItemsInHands']:
            trail_point['items_in_hands'] = point['ItemsInHands']
        if 'ItemsCount' in point and point['ItemsCount'] is not None:
            trail_point['items_count'] = point['ItemsCount']
        if 'MainItems' in point and point['MainItems']:
            trail_point['main_items'] = point['MainItems']
        
        result['trail'].append(trail_point)
    
    return jsonify(result)

@api_map_bp.route('/api/players/<player_id>/events')
@admin_required
def api_player_events(player_id):
    """API com histórico de eventos de um jogador específico"""
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    date_from = request.args.get('date_from', None)
    date_to = request.args.get('date_to', None)
    event_type = request.args.get('event_type', None)
    
    # Converter parâmetros de data de UTC para formato do banco
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if dt_from.tzinfo is None:
                dt_from = dt_from.replace(tzinfo=ZoneInfo('UTC'))
            if dt_from.microsecond > 0:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass
    
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if dt_to.tzinfo is None:
                dt_to = dt_to.replace(tzinfo=ZoneInfo('UTC'))
            if dt_to.microsecond > 0:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass
    
    events, total_count = get_player_events(player_id, limit, offset, date_from, date_to, event_type)
    
    result = {
        'player_id': player_id,
        'events': [],
        'pagination': {
            'limit': limit,
            'offset': offset,
            'total': total_count,
            'has_more': (offset + limit) < total_count
        }
    }
    
    for event in events:
        # Converter timestamp do banco (UTC) para America/Sao_Paulo
        timestamp_br = None
        if event.get('TimeStamp'):
            try:
                try:
                    dt_utc = datetime.strptime(event['TimeStamp'], '%Y-%m-%d %H:%M:%S.%f')
                except ValueError:
                    dt_utc = datetime.strptime(event['TimeStamp'], '%Y-%m-%d %H:%M:%S')
                dt_utc = dt_utc.replace(tzinfo=ZoneInfo('UTC'))
                dt_sp = dt_utc.astimezone(ZoneInfo('America/Sao_Paulo'))
                timestamp_br = dt_sp.isoformat()
            except (ValueError, AttributeError):
                timestamp_br = convert_timestamp_to_br(event['TimeStamp'])
        
        event_data = {
            'event_id': event['EventId'],
            'event_type': event['EventType'],
            'timestamp': timestamp_br or event.get('TimeStamp', ''),
            'coord_x': event.get('CoordX'),
            'coord_y': event.get('CoordY'),
            'coord_z': event.get('CoordZ'),
            'details': event.get('Details'),
            'related_player_id': event.get('RelatedPlayerID'),
            'related_player_name': event.get('RelatedPlayerName')
        }
        
        result['events'].append(event_data)
    
    return jsonify(result)

@api_map_bp.route('/api/players/<player_id>/events/clear', methods=['DELETE'])
@admin_required
@audit_action('clear_player_events')
def api_clear_player_events(player_id):
    """API para limpar todos os eventos de um jogador específico"""
    try:
        success = clear_player_events(player_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Eventos do jogador foram limpos com sucesso'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Nenhum evento encontrado para limpar'
            }), 404
    except Exception as e:
        logging.error(f"Erro ao limpar eventos do jogador {player_id}: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Erro ao limpar eventos: {str(e)}'
        }), 500

@api_map_bp.route('/api/players/online/positions')
@admin_required
def api_online_positions():
    """API com posições apenas de jogadores online"""
    positions = get_online_players_positions()
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'players': []
    }
    
    for pos in positions:
        pixel_coords = dayz_to_pixel(pos['CoordX'], pos['CoordY'])
        result['players'].append({
            'player_id': pos['PlayerID'],
            'player_name': pos['PlayerName'] or 'Sem nome',
            'steam_name': pos['SteamName'] or 'Sem steam name',
            'coord_x': pos['CoordX'],
            'coord_y': pos['CoordY'],
            'coord_z': pos['CoordZ'],
            'pixel_coords': pixel_coords,
            'last_update': pos['Data'] or '',
            'is_online': True,
            'health': pos.get('Health'),
            'blood': pos.get('Blood'),
            'shock': pos.get('Shock'),
            'energy': pos.get('Energy'),
            'water': pos.get('Water'),
            'is_alive': bool(pos.get('IsAlive')) if pos.get('IsAlive') is not None else None,
            'is_admin': bool(pos.get('IsAdmin')) if pos.get('IsAdmin') is not None else None,
            'stamina': pos.get('Stamina'),
            'stamina_max': pos.get('StaminaMax'),
            'items_in_hands': pos.get('ItemsInHands'),
            'items_count': pos.get('ItemsCount'),
            'main_items': pos.get('MainItems')
        })
    
    return jsonify(result)

@api_map_bp.route('/api/vehicles/positions')
@admin_required
def api_vehicles_positions():
    """API com posições atuais de todos os veículos"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    vehicles = get_vehicles_map_positions(include_destroyed=include_destroyed)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'vehicles': []
    }
    
    # Coletar todos os item types para batch lookup
    all_item_types = []
    for veh in vehicles:
        for item in veh.get('items', []):
            item_type = item.get('type', '')
            if item_type:
                all_item_types.append(item_type)
        for attachment in veh.get('attachments', []):
            attachment_type = attachment.get('type', '')
            if attachment_type:
                all_item_types.append(attachment_type)
    
    # Buscar detalhes de todos os items e attachments de uma vez
    from database import get_items_details_batch
    items_details_map = get_items_details_batch(all_item_types)
    
    for veh in vehicles:
        # Para veículos (diferente dos jogadores):
        # PositionX = Leste-Oeste
        # PositionY = Sul-Norte (Y do mapa) ← usar este
        # PositionZ = Altitude (ignorar)
        pixel_coords = dayz_to_pixel(veh['PositionX'], veh['PositionY'])
        
        # Buscar informações de items do banco de dados
        items = veh.get('items', [])
        attachments = veh.get('attachments', [])
        health_parts = veh.get('health_parts')
        
        # Converter items e attachments para formato esperado pelo frontend usando batch lookup
        items_formatted = []
        for item in items:
            item_type = item.get('type', '')
            item_health = item.get('health')
            item_info = items_details_map.get(item_type) if item_type else None
            items_formatted.append({
                'type': item_type,
                'name': item_info.get('name', item_type) if item_info else item_type,
                'health': item_health,
                'img': item_info.get('img', '') if item_info else ''
            })
        
        attachments_formatted = []
        for attachment in attachments:
            attachment_type = attachment.get('type', '')
            attachment_health = attachment.get('health')
            attachment_info = items_details_map.get(attachment_type) if attachment_type else None
            attachments_formatted.append({
                'type': attachment_type,
                'name': attachment_info.get('name', attachment_type) if attachment_info else attachment_type,
                'health': attachment_health,
                'img': attachment_info.get('img', '') if attachment_info else ''
            })
        
        result['vehicles'].append({
            'vehicle_id': veh['VehicleId'],
            'vehicle_name': veh['VehicleName'] or 'Veículo',
            'coord_x': veh['PositionX'],
            'coord_y': veh['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': veh['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'last_update': veh['TimeStamp'] or '',
            'coordinates_last_update': veh.get('coordinates_last_update') or veh['TimeStamp'] or '',
            'items_attachments_last_update': veh.get('items_attachments_last_update'),
            'is_destroyed': bool(veh.get('IsDestroyed', 0)) if include_destroyed else False,
            'destroyed_at': veh.get('DestroyedAt') if include_destroyed else None,
            'has_moved': bool(veh.get('has_moved', False)),
            'items': items_formatted,
            'attachments': attachments_formatted,
            'health_parts': health_parts
        })
    
    return jsonify(result)

@api_map_bp.route('/api/vehicles/map-positions')
@admin_required
def api_vehicles_map_positions():
    """API com posições atuais dos veículos para o mapa (otimizado)"""
    vehicles = get_vehicles_map_positions()
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'vehicles': []
    }
    
    for veh in vehicles:
        # Para veículos (diferente dos jogadores):
        # PositionX = Leste-Oeste
        # PositionY = Sul-Norte (Y do mapa) ← usar este
        # PositionZ = Altitude (ignorar)
        pixel_coords = dayz_to_pixel(veh['PositionX'], veh['PositionY'])
        
        # Buscar informações de items do banco de dados
        items = veh.get('items', [])
        attachments = veh.get('attachments', [])
        health_parts = veh.get('health_parts')
        
        # Converter items e attachments para formato esperado pelo frontend
        items_formatted = []
        for item in items:
            item_type = item.get('type', '')
            item_health = item.get('health')
            # Buscar informações do item no banco de itens
            item_info = get_item_details_from_items_db(item_type)
            items_formatted.append({
                'type': item_type,
                'name': item_info.get('name', item_type) if item_info else item_type,
                'health': item_health,
                'img': item_info.get('img', '') if item_info else ''
            })
        
        attachments_formatted = []
        for attachment in attachments:
            attachment_type = attachment.get('type', '')
            attachment_health = attachment.get('health')
            # Buscar informações do attachment no banco de itens
            attachment_info = get_item_details_from_items_db(attachment_type)
            attachments_formatted.append({
                'type': attachment_type,
                'name': attachment_info.get('name', attachment_type) if attachment_info else attachment_type,
                'health': attachment_health,
                'img': attachment_info.get('img', '') if attachment_info else ''
            })
        
        result['vehicles'].append({
            'vehicle_id': veh['VehicleId'],
            'vehicle_name': veh['VehicleName'] or 'Veículo',
            'coord_x': veh['PositionX'],
            'coord_y': veh['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': veh['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'last_update': veh['TimeStamp'] or '',
            'coordinates_last_update': veh.get('coordinates_last_update') or veh['TimeStamp'] or '',
            'items_attachments_last_update': veh.get('items_attachments_last_update')
        })
    
    return jsonify(result)

@api_map_bp.route('/api/vehicles/<vehicle_id>/trail')
@admin_required
def api_vehicle_trail(vehicle_id):
    """API com trail de um veículo específico"""
    limit = request.args.get('limit', 100, type=int)
    date_from = request.args.get('date_from', None)
    date_to = request.args.get('date_to', None)
    
    # Converter parâmetros de data de UTC para formato do banco (assumindo UTC no banco)
    # O frontend envia em ISO (UTC), precisamos converter para UTC antes de buscar no banco
    if date_from:
        try:
            # Parse ISO string (assumindo UTC)
            dt_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if dt_from.tzinfo is None:
                dt_from = dt_from.replace(tzinfo=ZoneInfo('UTC'))
            # Converter para string no formato do banco (UTC)
            # Incluir milissegundos se disponíveis para comparação precisa
            if dt_from.microsecond > 0:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_from = dt_from.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass  # Manter original se não conseguir parsear
    
    if date_to:
        try:
            # Parse ISO string (assumindo UTC)
            dt_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if dt_to.tzinfo is None:
                dt_to = dt_to.replace(tzinfo=ZoneInfo('UTC'))
            # Converter para string no formato do banco (UTC)
            # Incluir milissegundos se disponíveis para comparação precisa
            if dt_to.microsecond > 0:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S.%f')
            else:
                date_to = dt_to.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, AttributeError):
            pass  # Manter original se não conseguir parsear
    
    trail = get_vehicle_trail(vehicle_id, limit, date_from, date_to)
    
    result = {
        'vehicle_id': vehicle_id,
        'trail': []
    }
    
    for point in trail:
        pixel_coords = dayz_to_pixel(point['PositionX'], point['PositionY'])
        result['trail'].append({
            'vehicle_tracking_id': point['IdVehicleTracking'],
            'vehicle_name': point['VehicleName'],
            'coord_x': point['PositionX'],
            'coord_y': point['PositionY'],
            'coord_z': point['PositionZ'],
            'pixel_coords': pixel_coords,
            'timestamp': point['TimeStamp'] or ''
        })
    
    return jsonify(result)

@api_map_bp.route('/api/containers/positions')
@admin_required
def api_containers_positions():
    """API com posições atuais dos containers com seus items"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    containers = get_containers_last_position(include_destroyed=include_destroyed)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'containers': []
    }
    
    # Coletar todos os item types para batch lookup
    all_item_types = []
    for container in containers:
        for item in container.get('items', []):
            item_type = item.get('ItemType')
            if item_type:
                all_item_types.append(item_type)
    
    # Buscar detalhes de todos os items de uma vez
    from database import get_items_details_batch
    items_details_map = get_items_details_batch(all_item_types)
    
    for container in containers:
        # Converter coordenadas para pixel
        pixel_coords = dayz_to_pixel(container['PositionX'], container['PositionY'])
        
        # Processar items do container usando batch lookup
        items = []
        for item in container.get('items', []):
            item_type = item.get('ItemType')
            item_details = items_details_map.get(item_type) if item_type else None
            
            item_data = {
                'type': item_type,
                'health': item.get('ItemHealth'),
                'name': item_details['name'] if item_details else item_type,
                'img': item_details['img'] if item_details else ''
            }
            items.append(item_data)
        
        result['containers'].append({
            'container_id': container['ContainerId'],
            'container_name': container['ContainerName'],
            'container_type': container['ContainerName'],
            'coord_x': container['PositionX'],
            'coord_y': container['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': container['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'items': items,
            'last_update': container['TimeStamp'] or '',
            'coordinates_last_update': container.get('coordinates_last_update') or container['TimeStamp'] or '',
            'items_last_update': container.get('items_last_update') or '',
            'is_destroyed': bool(container.get('IsDestroyed', 0)) if include_destroyed else False,
            'destroyed_at': container.get('DestroyedAt') if include_destroyed else None
        })
    
    return jsonify(result)

@api_map_bp.route('/api/containers/<container_id>/trail')
@admin_required
def api_container_trail(container_id):
    """API com trail de um container específico"""
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    date_from = request.args.get('date_from', None)
    date_to = request.args.get('date_to', None)
    filter_by_items_only = request.args.get('filter_by_items_only', 'false').lower() == 'true'
    
    trail, total_count = get_container_trail(container_id, limit, offset, date_from, date_to, filter_by_items_only)
    
    result = {
        'container_id': container_id,
        'trail': [],
        'pagination': {
            'limit': limit,
            'offset': offset,
            'total': total_count,
            'has_more': (offset + limit) < total_count
        }
    }
    
    for point in trail:
        pixel_coords = dayz_to_pixel(point['PositionX'], point['PositionY'])
        
        # Processar items do container
        items = []
        for item in point.get('items', []):
            item_details = get_item_details_from_items_db(item['ItemType'])
            items.append({
                'type': item['ItemType'],
                'health': item.get('ItemHealth'),
                'name': item_details['name'] if item_details else item['ItemType'],
                'img': item_details['img'] if item_details else ''
            })
        
        result['trail'].append({
            'container_tracking_id': point['IdContainerTracking'],
            'container_name': point['ContainerName'],
            'coord_x': point['PositionX'],
            'coord_y': point['PositionY'],
            'coord_z': point['PositionZ'],
            'pixel_coords': pixel_coords,
            'items': items,
            'timestamp': point['TimeStamp'] or ''
        })
    
    return jsonify(result)

@api_map_bp.route('/api/fences/positions')
@admin_required
def api_fences_positions():
    """API com posições atuais dos fences (construções)"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    fences = get_fences_last_position(include_destroyed=include_destroyed)
    watchtowers = get_watchtowers_last_position(include_destroyed=include_destroyed)
    flags = get_flags_last_position(include_destroyed=include_destroyed)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'fences': []
    }
    
    for fence in fences:
        # Converter coordenadas para pixel
        pixel_coords = dayz_to_pixel(fence['PositionX'], fence['PositionY'])
        has_base = fence.get('HasBase')
        lower_panel_built = fence.get('LowerPanelBuilt')
        upper_panel_built = fence.get('UpperPanelBuilt')
        
        # Extrair has_gate, is_opened e is_locked do FenceName (seguindo padrão do FencesTracking.c)
        fence_name = fence.get('FenceName', '')
        has_gate = '_Gate' in fence_name if fence_name else None
        is_opened = '_Open' in fence_name if fence_name else None
        is_locked = '_Locked' in fence_name if fence_name else None
        
        # Construir objeto fence apenas com campos não-None
        fence_obj = {
            'fence_id': fence['FenceId'],
            'fence_name': fence_name,
            'coord_x': fence['PositionX'],
            'coord_y': fence['PositionY'],
            'coord_z': fence['PositionZ'],
            'pixel_coords': pixel_coords,
            'last_update': fence['TimeStamp'] or '',
            'structure_type': 'fence',
            'has_recent_attack': bool(fence.get('has_recent_attack', False))
        }
        
        # Adicionar campos opcionais apenas se não forem None
        if has_base is not None:
            fence_obj['has_base'] = (has_base == 1)
        if lower_panel_built is not None:
            fence_obj['lower_panel_built'] = (lower_panel_built == 1)
        if upper_panel_built is not None:
            fence_obj['upper_panel_built'] = (upper_panel_built == 1)
        if has_gate is not None:
            fence_obj['has_gate'] = has_gate
        if is_opened is not None:
            fence_obj['is_opened'] = is_opened
        if is_locked is not None:
            fence_obj['is_locked'] = is_locked
        if include_destroyed:
            fence_obj['is_destroyed'] = bool(fence.get('IsDestroyed', 0))
            if fence.get('DestroyedAt'):
                fence_obj['destroyed_at'] = fence.get('DestroyedAt')
        
        result['fences'].append(fence_obj)

    def normalize_watchtower_bool(value):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        try:
            return bool(int(value))
        except (TypeError, ValueError):
            if isinstance(value, str):
                return value.lower() in ('true', '1', 'yes')
            return bool(value)

    def safe_float(value):
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    for watchtower in watchtowers:
        pixel_coords = dayz_to_pixel(watchtower['PositionX'], watchtower['PositionY'])
        
        # Construir details removendo campos None/False para reduzir payload
        details = {}
        details_map = {
            'has_base': watchtower.get('HasBase'),
            'level_1_base': watchtower.get('Level1BaseBuilt'),
            'level_2_base': watchtower.get('Level2BaseBuilt'),
            'level_3_base': watchtower.get('Level3BaseBuilt'),
            'level_1_stairs': watchtower.get('Level1StairsBuilt'),
            'level_2_stairs': watchtower.get('Level2StairsBuilt'),
            'has_roof': watchtower.get('HasRoof'),
            'level_1_wall_1_lower_built': watchtower.get('Level1Wall1LowerBuilt'),
            'level_1_wall_1_upper_built': watchtower.get('Level1Wall1UpperBuilt'),
            'level_1_wall_2_lower_built': watchtower.get('Level1Wall2LowerBuilt'),
            'level_1_wall_2_upper_built': watchtower.get('Level1Wall2UpperBuilt'),
            'level_1_wall_3_lower_built': watchtower.get('Level1Wall3LowerBuilt'),
            'level_1_wall_3_upper_built': watchtower.get('Level1Wall3UpperBuilt'),
            'level_2_wall_1_lower_built': watchtower.get('Level2Wall1LowerBuilt'),
            'level_2_wall_1_upper_built': watchtower.get('Level2Wall1UpperBuilt'),
            'level_2_wall_2_lower_built': watchtower.get('Level2Wall2LowerBuilt'),
            'level_2_wall_2_upper_built': watchtower.get('Level2Wall2UpperBuilt'),
            'level_2_wall_3_lower_built': watchtower.get('Level2Wall3LowerBuilt'),
            'level_2_wall_3_upper_built': watchtower.get('Level2Wall3UpperBuilt'),
            'level_3_wall_1_lower_built': watchtower.get('Level3Wall1LowerBuilt'),
            'level_3_wall_1_upper_built': watchtower.get('Level3Wall1UpperBuilt'),
            'level_3_wall_2_lower_built': watchtower.get('Level3Wall2LowerBuilt'),
            'level_3_wall_2_upper_built': watchtower.get('Level3Wall2UpperBuilt'),
            'level_3_wall_3_lower_built': watchtower.get('Level3Wall3LowerBuilt'),
            'level_3_wall_3_upper_built': watchtower.get('Level3Wall3UpperBuilt'),
        }
        
        # Adicionar apenas campos que não são None (incluindo False para o frontend mostrar "Não construído")
        for key, value in details_map.items():
            normalized = normalize_watchtower_bool(value)
            if normalized is not None:
                details[key] = normalized
        
        # Construir objeto watchtower
        watchtower_obj = {
            'fence_id': watchtower['WatchtowerId'],
            'fence_name': watchtower.get('WatchtowerName') or 'Watchtower',
            'coord_x': watchtower['PositionX'],
            'coord_y': watchtower['PositionY'],
            'coord_z': watchtower['PositionZ'],
            'pixel_coords': pixel_coords,
            'last_update': watchtower.get('TimeStamp') or '',
            'structure_type': 'watchtower',
            'has_recent_attack': bool(watchtower.get('has_recent_attack', False))
        }
        
        # Adicionar campos opcionais apenas se não forem None
        if details:
            watchtower_obj['watchtower_details'] = details
            if 'has_base' in details:
                watchtower_obj['has_base'] = details['has_base']
            if 'level_1_base' in details:
                watchtower_obj['lower_panel_built'] = details['level_1_base']
            if 'level_2_base' in details:
                watchtower_obj['upper_panel_built'] = details['level_2_base']
        
        # Adicionar orientation apenas se tiver valores válidos
        orientation_x = safe_float(watchtower.get('OrientationX'))
        orientation_y = safe_float(watchtower.get('OrientationY'))
        orientation_z = safe_float(watchtower.get('OrientationZ'))
        if orientation_x is not None or orientation_y is not None or orientation_z is not None:
            orientation = {}
            if orientation_x is not None:
                orientation['x'] = orientation_x
            if orientation_y is not None:
                orientation['y'] = orientation_y
            if orientation_z is not None:
                orientation['z'] = orientation_z
            if orientation:
                watchtower_obj['orientation'] = orientation
        
        if include_destroyed:
            watchtower_obj['is_destroyed'] = bool(watchtower.get('IsDestroyed', 0))
            if watchtower.get('DestroyedAt'):
                watchtower_obj['destroyed_at'] = watchtower.get('DestroyedAt')
        
        result['fences'].append(watchtower_obj)

    for flag in flags:
        pixel_coords = dayz_to_pixel(flag['PositionX'], flag['PositionY'])
        
        # Construir flag_details removendo campos None/False
        flag_details = {}
        flag_base = normalize_watchtower_bool(flag.get('HasBase'))
        flag_flag_base = normalize_watchtower_bool(flag.get('HasFlagBase'))
        flag_raised = normalize_watchtower_bool(flag.get('FlagRaised'))
        flag_height = safe_float(flag.get('FlagHeight'))
        
        if flag_base is not None:
            flag_details['has_base'] = flag_base
        if flag_flag_base is not None:
            flag_details['has_flag_base'] = flag_flag_base
        if flag_raised is not None:
            flag_details['flag_raised'] = flag_raised
        if flag_height is not None:
            flag_details['flag_height'] = flag_height
        
        # Construir objeto flag
        flag_obj = {
            'fence_id': flag['FlagId'],
            'fence_name': flag.get('FlagName') or 'Flag Pole',
            'coord_x': flag['PositionX'],
            'coord_y': flag['PositionY'],
            'coord_z': flag['PositionZ'],
            'pixel_coords': pixel_coords,
            'last_update': flag.get('TimeStamp') or '',
            'structure_type': 'flag',
            'has_recent_attack': False
        }
        
        # Adicionar campos opcionais apenas se não forem None
        if flag_details:
            flag_obj['flag_details'] = flag_details
            if 'has_base' in flag_details:
                flag_obj['has_base'] = flag_details['has_base']
        
        # Adicionar orientation apenas se tiver valores válidos
        orientation_x = safe_float(flag.get('OrientationX'))
        orientation_y = safe_float(flag.get('OrientationY'))
        orientation_z = safe_float(flag.get('OrientationZ'))
        if orientation_x is not None or orientation_y is not None or orientation_z is not None:
            orientation = {}
            if orientation_x is not None:
                orientation['x'] = orientation_x
            if orientation_y is not None:
                orientation['y'] = orientation_y
            if orientation_z is not None:
                orientation['z'] = orientation_z
            if orientation:
                flag_obj['orientation'] = orientation
        
        if include_destroyed:
            flag_obj['is_destroyed'] = bool(flag.get('IsDestroyed', 0))
            if flag.get('DestroyedAt'):
                flag_obj['destroyed_at'] = flag.get('DestroyedAt')
        
        result['fences'].append(flag_obj)
    
    return jsonify(result)

@api_map_bp.route('/api/fences/<fence_id>/trail')
@admin_required
def api_fence_trail(fence_id):
    """API com trail de uma fence específica"""
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    date_from = request.args.get('date_from', None)
    date_to = request.args.get('date_to', None)
    
    trail, total_count = get_fence_trail(fence_id, limit, offset, date_from, date_to)
    
    result = {
        'fence_id': fence_id,
        'trail': [],
        'pagination': {
            'limit': limit,
            'offset': offset,
            'total': total_count,
            'has_more': (offset + limit) < total_count
        }
    }
    
    for point in trail:
        pixel_coords = dayz_to_pixel(point['PositionX'], point['PositionY'])
        result['trail'].append({
            'fence_tracking_id': point['IdFenceTracking'],
            'fence_name': point['FenceName'],
            'coord_x': point['PositionX'],
            'coord_y': point['PositionY'],
            'coord_z': point['PositionZ'],
            'pixel_coords': pixel_coords,
            'has_base': point.get('HasBase'),
            'lower_panel_built': point.get('LowerPanelBuilt'),
            'upper_panel_built': point.get('UpperPanelBuilt'),
            'timestamp': point['TimeStamp'] or ''
        })
    
    return jsonify(result)

@api_map_bp.route('/api/watchtowers/<watchtower_id>/trail')
@admin_required
def api_watchtower_trail(watchtower_id):
    """API com histórico de watchtower"""
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    trail, total_count = get_watchtower_trail(
        watchtower_id,
        limit=limit,
        offset=offset,
        date_from=date_from,
        date_to=date_to
    )

    def normalize_bool(value):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in ('true', '1', 'yes'):
                return True
            if lowered in ('false', '0', 'no'):
                return False
        try:
            return bool(int(value))
        except (TypeError, ValueError):
            return bool(value)

    def safe_float(value):
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    result_trail = []
    for point in trail:
        pixel_coords = dayz_to_pixel(point.get('PositionX') or 0, point.get('PositionY') or 0)
        result_trail.append({
            'tracking_id': point.get('WatchtowerTrackingId'),
            'watchtower_id': point.get('WatchtowerId'),
            'watchtower_name': point.get('WatchtowerName') or 'Watchtower',
            'coord_x': point.get('PositionX') or 0,
            'coord_y': point.get('PositionY') or 0,
            'coord_z': point.get('PositionZ'),
            'pixel_coords': pixel_coords,
            'timestamp': convert_timestamp_to_br(point.get('TimeStamp')),
            'level_1_wall_1_lower_built': normalize_bool(point.get('Level1Wall1LowerBuilt')),
            'level_1_wall_1_upper_built': normalize_bool(point.get('Level1Wall1UpperBuilt')),
            'level_1_wall_2_lower_built': normalize_bool(point.get('Level1Wall2LowerBuilt')),
            'level_1_wall_2_upper_built': normalize_bool(point.get('Level1Wall2UpperBuilt')),
            'level_1_wall_3_lower_built': normalize_bool(point.get('Level1Wall3LowerBuilt')),
            'level_1_wall_3_upper_built': normalize_bool(point.get('Level1Wall3UpperBuilt')),
            'level_2_wall_1_lower_built': normalize_bool(point.get('Level2Wall1LowerBuilt')),
            'level_2_wall_1_upper_built': normalize_bool(point.get('Level2Wall1UpperBuilt')),
            'level_2_wall_2_lower_built': normalize_bool(point.get('Level2Wall2LowerBuilt')),
            'level_2_wall_2_upper_built': normalize_bool(point.get('Level2Wall2UpperBuilt')),
            'level_2_wall_3_lower_built': normalize_bool(point.get('Level2Wall3LowerBuilt')),
            'level_2_wall_3_upper_built': normalize_bool(point.get('Level2Wall3UpperBuilt')),
            'level_3_wall_1_lower_built': normalize_bool(point.get('Level3Wall1LowerBuilt')),
            'level_3_wall_1_upper_built': normalize_bool(point.get('Level3Wall1UpperBuilt')),
            'level_3_wall_2_lower_built': normalize_bool(point.get('Level3Wall2LowerBuilt')),
            'level_3_wall_2_upper_built': normalize_bool(point.get('Level3Wall2UpperBuilt')),
            'level_3_wall_3_lower_built': normalize_bool(point.get('Level3Wall3LowerBuilt')),
            'level_3_wall_3_upper_built': normalize_bool(point.get('Level3Wall3UpperBuilt')),
            'has_base': normalize_bool(point.get('HasBase')),
            'level_1_base': normalize_bool(point.get('Level1BaseBuilt')),
            'level_2_base': normalize_bool(point.get('Level2BaseBuilt')),
            'level_3_base': normalize_bool(point.get('Level3BaseBuilt')),
            'level_1_stairs': normalize_bool(point.get('Level1StairsBuilt')),
            'level_2_stairs': normalize_bool(point.get('Level2StairsBuilt')),
            'has_roof': normalize_bool(point.get('HasRoof')),
            'orientation': {
                'x': safe_float(point.get('OrientationX')),
                'y': safe_float(point.get('OrientationY')),
                'z': safe_float(point.get('OrientationZ'))
            }
        })

    pagination = {
        'limit': limit,
        'offset': offset,
        'total': total_count,
        'has_more': (offset + limit) < total_count
    }

    return jsonify({
        'watchtower_id': watchtower_id,
        'trail': result_trail,
        'pagination': pagination
    })

@api_map_bp.route('/api/flags/<flag_id>/trail')
@admin_required
def api_flag_trail(flag_id):
    """API com histórico de flag"""
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    trail, total_count = get_flag_trail(
        flag_id,
        limit=limit,
        offset=offset,
        date_from=date_from,
        date_to=date_to
    )

    def normalize_bool(value):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in ('true', '1', 'yes'):
                return True
            if lowered in ('false', '0', 'no'):
                return False
        try:
            return bool(int(value))
        except (TypeError, ValueError):
            return bool(value)

    def safe_float(value):
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    result_trail = []
    for point in trail:
        pixel_coords = dayz_to_pixel(point.get('PositionX') or 0, point.get('PositionY') or 0)
        result_trail.append({
            'tracking_id': point.get('FlagTrackingId'),
            'flag_id': point.get('FlagId'),
            'flag_name': point.get('FlagName') or 'Flag Pole',
            'coord_x': point.get('PositionX') or 0,
            'coord_y': point.get('PositionY') or 0,
            'coord_z': point.get('PositionZ'),
            'pixel_coords': pixel_coords,
            'timestamp': convert_timestamp_to_br(point.get('TimeStamp')),
            'has_base': normalize_bool(point.get('HasBase')),
            'has_flag_base': normalize_bool(point.get('HasFlagBase')),
            'flag_raised': normalize_bool(point.get('FlagRaised')),
            'flag_height': safe_float(point.get('FlagHeight')),
            'orientation': {
                'x': safe_float(point.get('OrientationX')),
                'y': safe_float(point.get('OrientationY')),
                'z': safe_float(point.get('OrientationZ'))
            }
        })

    pagination = {
        'limit': limit,
        'offset': offset,
        'total': total_count,
        'has_more': (offset + limit) < total_count
    }

    return jsonify({
        'flag_id': flag_id,
        'trail': result_trail,
        'pagination': pagination
    })

@api_map_bp.route('/api/containers/<container_id>/teleport', methods=['POST'])
@admin_required
def api_teleport_container(container_id):
    """API para teleportar container para uma posição usando sistema de comandos DayZ"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        coord_x = data.get('coord_x')
        coord_y = data.get('coord_y')
        coord_z = data.get('coord_z')
        
        logger.debug(f"Teleport container request: container_id={container_id}, x={coord_x}, y={coord_y}, z={coord_z}")
        
        if coord_x is None or coord_y is None:
            return jsonify({'success': False, 'message': 'Coordenadas não fornecidas'}), 400
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        if coord_z is not None and coord_z != 0:
            command_line = f"SYSTEM teleportcontainer {container_id} {coord_x} {coord_z} {coord_y}\n"
        else:
            command_line = f"SYSTEM teleportcontainer {container_id} {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte de container: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de teleporte de container adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de teleporte enviado! O container será teleportado em instantes.'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever comando de teleporte de container: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao adicionar comando: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao teleportar container: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_map_bp.route('/api/containers/<container_id>/delete', methods=['POST'])
@admin_required
@audit_action('DELETE_CONTAINER')
def api_delete_container(container_id):
    """API para deletar container usando sistema de comandos DayZ"""
    logger = logging.getLogger(__name__)
    
    try:
        logger.debug(f"Delete container request: container_id={container_id}")
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        command_line = f"SYSTEM deleteentity {container_id}\n"
        
        logger.info(f"Adicionando comando de deletar container: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de deletar container adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de deletar container enviado! O container será deletado em instantes.'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever comando de deletar container: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao adicionar comando: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao deletar container: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_map_bp.route('/api/containers/<container_id>/refresh', methods=['POST'])
@admin_required
@audit_action('CHECK_CONTAINER')
def api_refresh_container(container_id):
    """API para solicitar atualização dos dados de um container rastreado"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json(silent=True) or {}
        request_id = data.get('request_id')
        
        if not request_id:
            return jsonify({
                'success': False,
                'message': 'request_id não fornecido'
            }), 400
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        command_line = f"SYSTEM checkcontainer {container_id} {request_id}\n"
        logger.info(f"Adicionando comando de atualização de container: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de atualização de container adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
        except IOError as e:
            logger.error(f"Erro ao escrever comando de atualização de container: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever comando: {str(e)}'
            }), 500
    except Exception as e:
        logger.exception("Erro inesperado ao atualizar container")
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_map_bp.route('/api/containers/<container_id>/save-check', methods=['POST'])
@admin_required
@audit_action('SAVE_CONTAINER_CHECK')
def api_save_container_check(container_id):
    """API para salvar dados coletados via checkcontainer no banco de dados"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Dados não fornecidos'
            }), 400
        
        container_type = data.get('container_type', 'Container')
        position = data.get('position', {})
        items = data.get('items', [])
        
        if not position:
            return jsonify({
                'success': False,
                'message': 'Posição não fornecida'
            }), 400
        
        from database import save_container_check_data
        
        container_tracking_id = save_container_check_data(
            container_id=container_id,
            container_type=container_type,
            position=position,
            items=items
        )
        
        if container_tracking_id:
            logger.info(f"Dados do container {container_id} salvos no banco (tracking_id: {container_tracking_id})")
            return jsonify({
                'success': True,
                'message': 'Dados salvos com sucesso',
                'container_tracking_id': container_tracking_id
            })
        else:
            logger.error(f"Falha ao salvar dados do container {container_id} no banco")
            return jsonify({
                'success': False,
                'message': 'Erro ao salvar dados no banco'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao salvar dados do container")
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_map_bp.route('/api/fences/<fence_id>/refresh', methods=['POST'])
@admin_required
@audit_action('CHECK_FENCE')
def api_refresh_fence(fence_id):
    """API para solicitar atualização dos dados de uma construção rastreada (fence/watchtower/flag)"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json(silent=True) or {}
        request_id = data.get('request_id')
        
        if not request_id:
            return jsonify({
                'success': False,
                'message': 'request_id não fornecido'
            }), 400
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        command_line = f"SYSTEM checkfence {fence_id} {request_id}\n"
        logger.info(f"Adicionando comando de atualização de construção: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de atualização de construção adicionado com sucesso")
            return jsonify({
                'success': True,
                'request_id': request_id,
                'message': 'Comando de atualização enviado'
            })
        except IOError as e:
            logger.error(f"Erro ao escrever no arquivo de comandos: {e}")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao solicitar atualização de construção: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_map_bp.route('/api/fences/<fence_id>/save-check', methods=['POST'])
@admin_required
@audit_action('SAVE_FENCE_CHECK')
def api_save_fence_check(fence_id):
    """API para salvar dados coletados via checkfence no banco de dados"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Dados não fornecidos'
            }), 400
        
        structure_type = data.get('structure_type', 'fence')
        position = data.get('position', {})
        orientation = data.get('orientation', {})
        
        if not position:
            return jsonify({
                'success': False,
                'message': 'Posição não fornecida'
            }), 400
        
        from database import save_fence_check_data
        
        fence_tracking_id = save_fence_check_data(
            fence_id=fence_id,
            structure_type=structure_type,
            position=position,
            orientation=orientation,
            fence_data=data
        )
        
        if fence_tracking_id:
            logger.info(f"Dados da construção {fence_id} (tipo: {structure_type}) salvos no banco (tracking_id: {fence_tracking_id})")
            return jsonify({
                'success': True,
                'message': 'Dados salvos com sucesso',
                'fence_tracking_id': fence_tracking_id
            })
        else:
            logger.error(f"Falha ao salvar dados da construção {fence_id} no banco")
            return jsonify({
                'success': False,
                'message': 'Erro ao salvar dados no banco'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao salvar dados da construção: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500