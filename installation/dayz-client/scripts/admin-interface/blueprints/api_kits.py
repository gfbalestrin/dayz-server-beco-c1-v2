"""
Blueprint de API de Kits
Rotas de API relacionadas
"""
from flask import Blueprint, request, jsonify
import logging
import json
import fcntl
import os
import config
from packing_algorithm import can_fit_items_in_container, pack_items_ffdh
from database import (
    get_weapon_kits, get_weapon_kit_by_id, create_weapon_kit, update_weapon_kit, delete_weapon_kit,
    get_loot_kits, get_loot_kit_by_id, create_loot_kit, update_loot_kit, delete_loot_kit,
    calculate_loot_kit_space, get_storage_containers,
    get_weapons, get_item_by_id, get_explosive_by_id, get_ammunition_by_id,
    get_magazine_by_id, get_attachment_by_id, get_item_details_from_items_db
)
from blueprints.auth import admin_required, audit_action
from blueprints.helpers import build_weapon_kit_json, write_command_to_file


api_kits_bp = Blueprint('api_kits', __name__)
logger = logging.getLogger(__name__)

def build_weapon_kit_json(weapon_kit):
    """
    Monta JSON para weapon kit no formato aceito por createcontainer
    """
    json_obj = {
        "type": weapon_kit['weapon_name_type']
    }
    
    attachments = []
    
    # Magazine primeiro
    if weapon_kit.get('magazine_name_type'):
        attachments.append({"type": weapon_kit['magazine_name_type']})
    
    # Attachments da arma
    for att in weapon_kit.get('attachments', []):
        attachments.append({"type": att['name_type']})
    
    if attachments:
        json_obj['attachments'] = attachments
    
    return json.dumps(json_obj, separators=(',', ':'))


@api_kits_bp.route('/api/kits/weapons', methods=['GET'])
@admin_required
def api_weapon_kits_list():
    kits = get_weapon_kits()
    return jsonify({'kits': kits})

@api_kits_bp.route('/api/kits/weapons/<int:kit_id>', methods=['GET'])
@admin_required
def api_weapon_kit_detail(kit_id):
    kit = get_weapon_kit_by_id(kit_id)
    if not kit:
        return jsonify({'error': 'Kit de arma não encontrado'}), 404
    return jsonify({'kit': kit})

@api_kits_bp.route('/api/kits/weapons', methods=['POST'])
@admin_required
@audit_action('CREATE_WEAPON_KIT')
def api_weapon_kit_create():
    data = request.get_json()
    try:
        kit_id = create_weapon_kit(data)
        return jsonify({'success': True, 'id': kit_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_kits_bp.route('/api/kits/weapons/<int:kit_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_WEAPON_KIT')
def api_weapon_kit_update(kit_id):
    data = request.get_json()
    try:
        success = update_weapon_kit(kit_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_kits_bp.route('/api/kits/weapons/<int:kit_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_WEAPON_KIT')
def api_weapon_kit_delete(kit_id):
    try:
        success = delete_weapon_kit(kit_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === LOOT KITS ===
@api_kits_bp.route('/api/kits/loot', methods=['GET'])
@admin_required
def api_loot_kits_list():
    kits = get_loot_kits()
    return jsonify({'kits': kits})

@api_kits_bp.route('/api/kits/loot/<int:kit_id>', methods=['GET'])
@admin_required
def api_loot_kit_detail(kit_id):
    kit = get_loot_kit_by_id(kit_id)
    if not kit:
        return jsonify({'error': 'Kit de loot não encontrado'}), 404
    return jsonify({'kit': kit})

@api_kits_bp.route('/api/kits/loot', methods=['POST'])
@admin_required
@audit_action('CREATE_LOOT_KIT')
def api_loot_kit_create():
    data = request.get_json()
    try:
        kit_id = create_loot_kit(data)
        return jsonify({'success': True, 'id': kit_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_kits_bp.route('/api/kits/loot/<int:kit_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_LOOT_KIT')
def api_loot_kit_update(kit_id):
    data = request.get_json()
    try:
        success = update_loot_kit(kit_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_kits_bp.route('/api/kits/loot/<int:kit_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_LOOT_KIT')
def api_loot_kit_delete(kit_id):
    try:
        success = delete_loot_kit(kit_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_kits_bp.route('/api/kits/storage-containers', methods=['GET'])
@admin_required
def api_storage_containers():
    containers = get_storage_containers()
    return jsonify({'containers': containers})

@api_kits_bp.route('/api/kits/loot/<int:kit_id>/space', methods=['GET'])
@admin_required
def api_loot_kit_space(kit_id):
    space_used = calculate_loot_kit_space(kit_id)
    return jsonify({'space_used': space_used})

@api_kits_bp.route('/api/kits/loot/validate-space', methods=['POST'])
@admin_required
def api_validate_loot_kit_space():
    """Valida se os itens cabem no container usando cálculo 2D"""
    data = request.get_json()
    
    # Buscar container
    container_id = data.get('container_id')
    if not container_id:
        return jsonify({'error': 'container_id é obrigatório'}), 400
    
    container = None
    containers = get_storage_containers()
    for c in containers:
        if c['id'] == container_id:
            container = c
            break
    
    if not container:
        return jsonify({'error': 'Container não encontrado'}), 404
    
    container_width = container.get('storage_width', 0)
    container_height = container.get('storage_height', 0)
    
    if container_width == 0 or container_height == 0:
        return jsonify({'error': 'Container sem dimensões definidas'}), 400
    
    # Construir lista de itens para validação
    items_to_validate = []
    
    # Itens gerais
    for item in data.get('items', []):
        item_data = get_item_by_id(item.get('item_id'))
        if item_data:
            items_to_validate.append({
                'id': item_data['id'],
                'name': item_data['name'],
                'width': item_data.get('width', 0),
                'height': item_data.get('height', 0),
                'slots': item_data.get('slots', 0),
                'quantity': item.get('quantity', 1),
                'img': item_data.get('img', '')
            })
    
    # Weapon kits - APENAS adicionar a arma (magazine e attachments ficam anexados)
    # IMPORTANTE: No DayZ, magazines e attachments anexados à arma
    # não ocupam espaço adicional no inventário/container.
    # Por isso, contabilizamos apenas os slots da arma.
    for weapon_kit_data in data.get('weapon_kits', []):
        weapon_kit = get_weapon_kit_by_id(weapon_kit_data.get('weapon_kit_id'))
        if weapon_kit:
            quantity = weapon_kit_data.get('quantity', 1)
            
            # Adicionar APENAS a arma (magazine e attachments não ocupam espaço adicional)
            if weapon_kit.get('weapon_name_type'):
                weapons = get_weapons()
                weapon = next((w for w in weapons if w['name_type'] == weapon_kit['weapon_name_type']), None)
                if weapon:
                    items_to_validate.append({
                        'id': weapon['id'],
                        'name': weapon['name'],
                        'width': weapon.get('width', 0),
                        'height': weapon.get('height', 0),
                        'slots': weapon.get('slots', 0),
                        'quantity': quantity,
                        'img': weapon.get('img', '')
                    })
            
            # REMOVIDO: Não adicionar magazine e attachments separadamente
            # Eles ficam anexados à arma e não ocupam espaço adicional no container
    
    # Explosivos
    for exp in data.get('explosives', []):
        exp_data = get_explosive_by_id(exp.get('explosive_id'))
        if exp_data:
            items_to_validate.append({
                'id': exp_data['id'],
                'name': exp_data['name'],
                'width': exp_data.get('width', 0),
                'height': exp_data.get('height', 0),
                'slots': exp_data.get('slots', 0),
                'quantity': exp.get('quantity', 1),
                'img': exp_data.get('img', '')
            })
    
    # Munições
    for ammo in data.get('ammunitions', []):
        ammo_data = get_ammunition_by_id(ammo.get('ammunition_id'))
        if ammo_data:
            items_to_validate.append({
                'id': ammo_data['id'],
                'name': ammo_data['name'],
                'width': ammo_data.get('width', 0),
                'height': ammo_data.get('height', 0),
                'slots': ammo_data.get('slots', 0),
                'quantity': ammo.get('quantity', 1),
                'img': ammo_data.get('img', '')
            })
    
    # Magazines
    for mag in data.get('magazines', []):
        mag_data = get_magazine_by_id(mag.get('magazine_id'))
        if mag_data:
            items_to_validate.append({
                'id': mag_data['id'],
                'name': mag_data['name'],
                'width': mag_data.get('width', 0),
                'height': mag_data.get('height', 0),
                'slots': mag_data.get('slots', 0),
                'quantity': mag.get('quantity', 1),
                'img': mag_data.get('img', '')
            })
    
    # Attachments
    for att in data.get('attachments', []):
        att_data = get_attachment_by_id(att.get('attachment_id'))
        if att_data:
            items_to_validate.append({
                'id': att_data['id'],
                'name': att_data['name'],
                'width': att_data.get('width', 0),
                'height': att_data.get('height', 0),
                'slots': att_data.get('slots', 0),
                'quantity': att.get('quantity', 1),
                'img': att_data.get('img', '')
            })
    
    # Primeiro fazer validação básica (mais rápida)
    basic_result = can_fit_items_in_container(container_width, container_height, items_to_validate)
    
    # Se passou na validação básica, tentar empacotamento completo
    if basic_result['fits']:
        packing_result = pack_items_ffdh(container_width, container_height, items_to_validate)
        return jsonify({
            'fits': packing_result['fits'],
            'usage': packing_result['usage'],
            'positions': packing_result.get('positions', []),
            'visual_grid': packing_result.get('visual_grid', []),
            'errors': []
        })
    else:
        return jsonify({
            'fits': False,
            'usage': basic_result['usage'],
            'positions': [],
            'visual_grid': [],
            'errors': basic_result['errors']
        })

# === SPAWNING ===
def build_weapon_kit_json(weapon_kit):
    """
    Monta JSON para weapon kit no formato aceito por createcontainer
    
    Estrutura:
    {
      "type": "WeaponName",
      "attachments": [
        {"type": "MagazineName"},
        {"type": "AttachmentName"},
        ...
      ]
    }
    """
    json_obj = {
        "type": weapon_kit['weapon_name_type']
    }
    
    attachments = []
    
    # Magazine primeiro
    if weapon_kit.get('magazine_name_type'):
        attachments.append({"type": weapon_kit['magazine_name_type']})
    
    # Attachments da arma
    for att in weapon_kit.get('attachments', []):
        attachments.append({"type": att['name_type']})
    
    if attachments:
        json_obj['attachments'] = attachments
    
    return json.dumps(json_obj, separators=(',', ':'))

@api_kits_bp.route('/api/spawn/weapon-kit', methods=['POST'])
@admin_required
@audit_action('SPAWN_WEAPON_KIT')
def api_spawn_weapon_kit():
    """Spawnar kit de arma para jogador"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    player_id = data.get('player_id')
    kit_id = data.get('kit_id')
    
    if not player_id or not kit_id:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    # Buscar detalhes do kit
    kit = get_weapon_kit_by_id(kit_id)
    if not kit:
        return jsonify({'success': False, 'message': 'Kit não encontrado'}), 404
    
    try:
        # Montar JSON do weapon kit usando função existente
        weapon_json = build_weapon_kit_json(kit)
        
        # Montar comando createweapon usando playerID (usa posição atual do jogador)
        command = f"{player_id} createweapon {weapon_json}\n"
        
        # Escrever comando (SSH ou arquivo local)
        if not write_command_to_file(command):
            logger.error(f"Erro ao escrever comando de weapon kit")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
        
        logger.info(f"Weapon kit {kit_id} spawnado para {player_id}")
        return jsonify({
            'success': True,
            'message': f'Weapon kit spawnado com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar weapon kit")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500

@api_kits_bp.route('/api/spawn/loot-kit', methods=['POST'])
@admin_required
@audit_action('SPAWN_LOOT_KIT')
def api_spawn_loot_kit():
    """Spawnar kit de loot para jogador"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    player_id = data.get('player_id')
    kit_id = data.get('kit_id')
    
    if not player_id or not kit_id:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    # Buscar detalhes do kit
    kit = get_loot_kit_by_id(kit_id)
    if not kit:
        return jsonify({'success': False, 'message': 'Kit não encontrado'}), 404
    
    try:
        # Montar lista de itens (mesma lógica de api_spawn_loot_kit_coords)
        weapon_kit_items = []
        simple_items = []
        
        # Weapon kits (JSON) - processar primeiro
        for wk in kit.get('weapon_kits', []):
            for _ in range(wk.get('quantity', 1)):
                weapon_kit_items.append(build_weapon_kit_json(wk))
        
        # Itens avulsos (name_type simples)
        for item in kit.get('items', []):
            for _ in range(item.get('quantity', 1)):
                simple_items.append(item['name_type'])
        
        # Explosivos
        for exp in kit.get('explosives', []):
            for _ in range(exp.get('quantity', 1)):
                simple_items.append(exp['name_type'])
        
        # Munições
        for ammo in kit.get('ammunitions', []):
            for _ in range(ammo.get('quantity', 1)):
                simple_items.append(ammo['name_type'])
        
        # Magazines
        for mag in kit.get('magazines', []):
            for _ in range(mag.get('quantity', 1)):
                simple_items.append(mag['name_type'])
        
        # Attachments
        for att in kit.get('attachments', []):
            for _ in range(att.get('quantity', 1)):
                simple_items.append(att['name_type'])
        
        # Ordenar itens simples por slots (maiores primeiro)
        def get_slots(name_type):
            item_details = get_item_details_from_items_db(name_type)
            if item_details and item_details.get('slots'):
                return item_details['slots']
            return 0
        
        simple_items_sorted = sorted(simple_items, key=get_slots, reverse=True)
        
        # Combinar: weapon kits primeiro (são grandes), depois itens simples ordenados
        items = weapon_kit_items + simple_items_sorted
        
        # Montar comando createcontainer usando playerID (usa posição atual do jogador)
        container_type = kit['container_name_type']
        items_str = ' '.join(items)
        command = f"{player_id} createcontainer {container_type} {items_str}\n"
        
        # Escrever comando (SSH ou arquivo local)
        if not write_command_to_file(command):
            logger.error(f"Erro ao escrever comando de weapon kit")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
        
        logger.info(f"Kit de loot {kit_id} spawnado para {player_id}")
        return jsonify({
            'success': True,
            'message': f'Kit de loot spawnado com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar kit de loot")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500

@api_kits_bp.route('/api/spawn/weapon-kit-coords', methods=['POST'])
@admin_required
@audit_action('SPAWN_WEAPON_KIT_COORDS')
def api_spawn_weapon_kit_coords():
    """Spawnar weapon kit em coordenadas do mapa usando createweapon"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    kit_id = data.get('kit_id')
    coord_x = data.get('coord_x')
    coord_y = data.get('coord_y')
    
    if not kit_id or coord_x is None or coord_y is None:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    kit = get_weapon_kit_by_id(kit_id)
    if not kit:
        return jsonify({'success': False, 'message': 'Kit não encontrado'}), 404
    
    try:
        # Montar JSON do weapon kit usando função existente
        weapon_json = build_weapon_kit_json(kit)
        
        # Montar comando
        command = f"SYSTEM createweapon {coord_x} {coord_y} {weapon_json}\n"
        
        # Escrever comando (SSH ou arquivo local)
        if not write_command_to_file(command):
            logger.error(f"Erro ao escrever comando de weapon kit")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
        
        logger.info(f"Weapon kit {kit_id} spawnado em coordenadas ({coord_x}, {coord_y})")
        return jsonify({'success': True, 'message': 'Weapon kit spawnado com sucesso!'})
    except Exception as e:
        logger.exception("Erro ao spawnar weapon kit em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500

@api_kits_bp.route('/api/spawn/loot-kit-coords', methods=['POST'])
@admin_required
@audit_action('SPAWN_LOOT_KIT_COORDS')
def api_spawn_loot_kit_coords():
    """Spawnar kit de loot em coordenadas do mapa usando createcontainer"""
    import fcntl
    import os
    
    data = request.get_json()
    kit_id = data.get('kit_id')
    coord_x = data.get('coord_x')
    coord_y = data.get('coord_y')
    
    if not kit_id or coord_x is None or coord_y is None:
        return jsonify({'success': False, 'message': 'Dados incompletos'}), 400
    
    kit = get_loot_kit_by_id(kit_id)
    if not kit:
        return jsonify({'success': False, 'message': 'Kit não encontrado'}), 404
    
    try:
        # Montar lista de itens
        weapon_kit_items = []
        simple_items = []
        
        # Weapon kits (JSON) - processar primeiro
        for wk in kit.get('weapon_kits', []):
            for _ in range(wk.get('quantity', 1)):
                weapon_kit_items.append(build_weapon_kit_json(wk))
        
        # Itens avulsos (name_type simples)
        for item in kit.get('items', []):
            for _ in range(item.get('quantity', 1)):
                simple_items.append(item['name_type'])
        
        # Explosivos
        for exp in kit.get('explosives', []):
            for _ in range(exp.get('quantity', 1)):
                simple_items.append(exp['name_type'])
        
        # Munições
        for ammo in kit.get('ammunitions', []):
            for _ in range(ammo.get('quantity', 1)):
                simple_items.append(ammo['name_type'])
        
        # Magazines
        for mag in kit.get('magazines', []):
            for _ in range(mag.get('quantity', 1)):
                simple_items.append(mag['name_type'])
        
        # Attachments
        for att in kit.get('attachments', []):
            for _ in range(att.get('quantity', 1)):
                simple_items.append(att['name_type'])
        
        # Ordenar itens simples por slots (maiores primeiro)
        def get_slots(name_type):
            item_details = get_item_details_from_items_db(name_type)
            if item_details and item_details.get('slots'):
                return item_details['slots']
            return 0
        
        simple_items_sorted = sorted(simple_items, key=get_slots, reverse=True)
        
        # Combinar: weapon kits primeiro (são grandes), depois itens simples ordenados
        items = weapon_kit_items + simple_items_sorted
        
        # Montar comando
        container_type = kit['container_name_type']
        items_str = ' '.join(items)
        command = f"SYSTEM createcontainer {container_type} {coord_x} {coord_y} {items_str}\n"
        
        # Escrever comando (SSH ou arquivo local)
        if not write_command_to_file(command):
            logger.error(f"Erro ao escrever comando de kit de loot")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
        
        logger.info(f"Kit de loot {kit_id} spawnado em coordenadas ({coord_x}, {coord_y})")
        return jsonify({'success': True, 'message': 'Kit de loot spawnado com sucesso!'})
    except Exception as e:
        logger.exception("Erro ao spawnar kit de loot em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500
