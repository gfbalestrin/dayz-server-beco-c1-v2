"""
Blueprint de API de Spawning
Rotas de API para spawning de itens, veículos e kits
"""
from flask import Blueprint, request, jsonify
import logging
import fcntl
import os
import config
from database import (
    get_weapons, get_items, get_item_types, get_explosives, get_ammunitions,
    get_calibers, get_magazines, get_attachments, get_attachment_types,
    get_all_explosives, get_all_ammunitions, get_all_magazines, get_all_attachments,
    get_weapon_compatible_items
)
from blueprints.auth import admin_required, audit_action
from blueprints.helpers import evaluate_vehicle_limit, format_limit_block_message, current_time_br
from database import get_active_vehicle_name_counts
import vehicle_limits

api_spawning_bp = Blueprint('api_spawning', __name__)
logger = logging.getLogger(__name__)


@api_spawning_bp.route('/api/vehicle-limits', methods=['GET'])
@admin_required
def api_vehicle_limits():
    """Retorna limites configurados no events.xml e o uso atual"""
    try:
        counts = get_active_vehicle_name_counts()
        limits = vehicle_limits.get_vehicle_limits_summary(counts)
        return jsonify({
            'success': True,
            'limits': limits,
            'generated_at': current_time_br()
        })
    except FileNotFoundError as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    except Exception as e:
        logger.exception("Erro ao carregar limites de veículos: %s", e)
        return jsonify({'success': False, 'message': 'Erro ao carregar limites de veículos'}), 500


@api_spawning_bp.route('/api/spawn/item', methods=['POST'])
@admin_required
@audit_action('SPAWN_ITEM')
def api_spawn_item():
    """Spawnar item para jogador ou em coordenadas"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    player_id = data.get('player_id')
    item_type = data.get('item_type')  # name_type do item
    quantity = data.get('quantity', 1)
    
    if not player_id or not item_type:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    # Formato: PlayerID giveitem item_type quantity
    command_line = f"{player_id} giveitem {item_type} {quantity}\n"
    
    try:
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command_line)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Comando enviado: {command_line.strip()}")
        return jsonify({
            'success': True,
            'message': f'Item {item_type} spawned com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar item")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar item: {str(e)}'
        }), 500

@api_spawning_bp.route('/api/spawn/vehicle', methods=['POST'])
@admin_required
@audit_action('SPAWN_VEHICLE')
def api_spawn_vehicle():
    """Spawnar veículo em coordenadas ou próximo a jogador"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    player_id = data.get('player_id')
    vehicle_type = data.get('vehicle_type')
    
    if not player_id or not vehicle_type:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400

    allowed, limit_info = evaluate_vehicle_limit(vehicle_type)
    warning = None
    if not allowed:
        warning = format_limit_block_message(limit_info)
        logger.warning(f"Tentativa de spawn com limite excedido: {vehicle_type} - {warning}")
    
    # Formato: PlayerID spawnvehicle vehicle_type
    command_line = f"{player_id} spawnvehicle {vehicle_type}\n"
    
    try:
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command_line)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Comando enviado: {command_line.strip()}")
        response = {
            'success': True,
            'message': f'Veículo {vehicle_type} spawned com sucesso!'
        }
        if warning:
            response['warning'] = warning
            response['limit'] = limit_info
        return jsonify(response)
    except Exception as e:
        logger.exception("Erro ao spawnar veículo")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar veículo: {str(e)}'
        }), 500

@api_spawning_bp.route('/api/spawn/item-at-coords', methods=['POST'])
@admin_required
@audit_action('SPAWN_ITEM_COORDS')
def api_spawn_item_at_coords():
    """Spawnar item em coordenadas específicas usando comando createitem"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    item_type = data.get('item_type')
    quantity = data.get('quantity', 1)
    coord_x = data.get('coord_x')
    coord_y = data.get('coord_y')
    
    if not all([item_type, coord_x is not None, coord_y is not None]):
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    # Formato: SYSTEM createitem item_type quantity coordX coordY
    command_line = f"SYSTEM createitem {item_type} {quantity} {coord_x} {coord_y}\n"
    
    try:
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command_line)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Spawn item em coordenadas: {coord_x}, {coord_y}")
        return jsonify({
            'success': True,
            'message': f'Item {item_type} criado nas coordenadas!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar item em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar item: {str(e)}'
        }), 500

@api_spawning_bp.route('/api/spawn/vehicle-at-coords', methods=['POST'])
@admin_required
@audit_action('SPAWN_VEHICLE_COORDS')
def api_spawn_vehicle_at_coords():
    """Spawnar veículo em coordenadas específicas usando comando createvehicle"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    vehicle_type = data.get('vehicle_type')
    coord_x = data.get('coord_x')
    coord_y = data.get('coord_y')
    
    if not all([vehicle_type, coord_x is not None, coord_y is not None]):
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400

    allowed, limit_info = evaluate_vehicle_limit(vehicle_type)
    warning = None
    if not allowed:
        warning = format_limit_block_message(limit_info)
        logger.warning(f"Tentativa de spawn com limite excedido: {vehicle_type} - {warning}")
    
    # Formato: SYSTEM createvehicle vehicle_type coordX coordY
    command_line = f"SYSTEM createvehicle {vehicle_type} {coord_x} {coord_y}\n"
    
    try:
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command_line)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Spawn veículo em coordenadas: {coord_x}, {coord_y}")
        response = {
            'success': True,
            'message': f'Veículo {vehicle_type} criado nas coordenadas!'
        }
        if warning:
            response['warning'] = warning
            response['limit'] = limit_info
        return jsonify(response)
    except Exception as e:
        logger.exception("Erro ao spawnar veículo em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar veículo: {str(e)}'
        }), 500

@api_spawning_bp.route('/api/items/explosives')
@admin_required
def api_explosives():
    search = request.args.get('search', '')
    limit = int(request.args.get('limit', 50))
    explosives = get_explosives(search, limit)
    return jsonify({'explosives': explosives})

@api_spawning_bp.route('/api/items/ammunitions')
@admin_required
def api_ammunitions():
    search = request.args.get('search', '')
    caliber_id = request.args.get('caliber_id', type=int)
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    ammunitions = get_ammunitions(search, caliber_id, weapon_id, limit)
    return jsonify({'ammunitions': ammunitions})

@api_spawning_bp.route('/api/items/calibers')
@admin_required
def api_calibers():
    calibers = get_calibers()
    return jsonify({'calibers': calibers})

@api_spawning_bp.route('/api/items/magazines')
@admin_required
def api_magazines():
    search = request.args.get('search', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    magazines = get_magazines(search, weapon_id, limit)
    return jsonify({'magazines': magazines})

@api_spawning_bp.route('/api/items/attachments')
@admin_required
def api_attachments():
    search = request.args.get('search', '')
    type_filter = request.args.get('type', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    attachments = get_attachments(search, type_filter if type_filter else None, weapon_id, limit)
    return jsonify({'attachments': attachments})

@api_spawning_bp.route('/api/items/attachment-types')
@admin_required
def api_attachment_types():
    types = get_attachment_types()
    return jsonify({'types': types})

# Endpoints "get all" para kits (sem limite)
@api_spawning_bp.route('/api/items/all-explosives')
@admin_required
def api_all_explosives():
    explosives = get_all_explosives()
    return jsonify({'explosives': explosives})

@api_spawning_bp.route('/api/items/all-ammunitions')
@admin_required
def api_all_ammunitions():
    ammunitions = get_all_ammunitions()
    return jsonify({'ammunitions': ammunitions})

@api_spawning_bp.route('/api/items/all-magazines')
@admin_required
def api_all_magazines():
    magazines = get_all_magazines()
    return jsonify({'magazines': magazines})

@api_spawning_bp.route('/api/items/all-attachments')
@admin_required
def api_all_attachments():
    attachments = get_all_attachments()
    return jsonify({'attachments': attachments})

@api_spawning_bp.route('/api/weapons/<int:weapon_id>/compatible-items')
@admin_required
def api_weapon_compatible_items(weapon_id):
    items = get_weapon_compatible_items(weapon_id)
    return jsonify(items)

@api_spawning_bp.route('/api/spawn/loadout', methods=['POST'])
@admin_required
@audit_action('SPAWN_LOADOUT')
def api_spawn_loadout():
    """Spawnar arma com múltiplos acessórios"""
    import fcntl
    import os
    
    data = request.get_json()
    player_id = data.get('player_id')
    items = data.get('items', [])  # Lista de {item_type, quantity}
    
    if not player_id or not items:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    try:
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                for item in items:
                    command_line = f"{player_id} giveitem {item['item_type']} {item['quantity']}\n"
                    f.write(command_line)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Loadout com {len(items)} itens enviado para {player_id}")
        return jsonify({
            'success': True,
            'message': f'Loadout com {len(items)} itens enviado com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar loadout")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar loadout: {str(e)}'
        }), 500

@api_spawning_bp.route('/api/items/weapons')
@admin_required
def api_weapons():
    """API para buscar armas"""
    search = request.args.get('search', '')
    limit = int(request.args.get('limit', 200))
    weapons = get_weapons(search, limit=limit)
    return jsonify({'weapons': weapons})

@api_spawning_bp.route('/api/items/types')
@admin_required
def api_item_types():
    """API para buscar tipos de itens"""
    types = get_item_types()
    return jsonify({'types': types})
