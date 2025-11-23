"""
Blueprint de API de Items Manage
Rotas de API relacionadas
"""
from flask import Blueprint, request, jsonify
import logging
import fcntl
import os
import config
from database import (
    get_weapon_by_id, create_weapon, update_weapon, delete_weapon,
    get_weapon_relationships, update_weapon_relationships,
    get_caliber_by_id, create_caliber, update_caliber, delete_caliber,
    get_all_calibers, get_calibers,
    get_ammunition_by_id, create_ammunition, update_ammunition, delete_ammunition,
    get_ammunitions,
    get_magazine_by_id, create_magazine, update_magazine, delete_magazine,
    get_magazines,
    get_attachment_by_id, create_attachment, update_attachment, delete_attachment,
    get_attachments,
    get_explosive_by_id, create_explosive, update_explosive, delete_explosive,
    get_explosives,
    get_item_type_by_id, create_item_type, update_item_type, delete_item_type,
    get_item_types,
    get_item_by_id, create_item, update_item, delete_item,
    get_items,
    get_item_compatibility, update_item_compatibility,
    validate_item_type,
    get_magazine_weapons, update_magazine_weapons,
    get_attachment_weapons, update_attachment_weapons,
    get_ammunition_weapons, update_ammunition_weapons,
    get_weapons_with_calibers
)
from blueprints.auth import admin_required, login_required, audit_action


api_items_manage_bp = Blueprint('api_items_manage', __name__)
logger = logging.getLogger(__name__)



# === WEAPONS ===
@api_items_manage_bp.route('/api/manage/weapons', methods=['GET'])
@login_required
def api_manage_weapons_list():
    weapons = get_weapons_with_calibers(limit=1000)
    return jsonify({'weapons': weapons})

@api_items_manage_bp.route('/api/manage/weapons/<int:weapon_id>', methods=['GET'])
@login_required
def api_manage_weapon_detail(weapon_id):
    weapon = get_weapon_by_id(weapon_id)
    if not weapon:
        return jsonify({'error': 'Arma não encontrada'}), 404
    relationships = get_weapon_relationships(weapon_id)
    return jsonify({'weapon': weapon, 'relationships': relationships})

@api_items_manage_bp.route('/api/manage/weapons', methods=['POST'])
@admin_required
@audit_action('CREATE_WEAPON')
def api_manage_weapon_create():
    data = request.get_json()
    try:
        weapon_id = create_weapon(data)
        return jsonify({'success': True, 'id': weapon_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/weapons/<int:weapon_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_WEAPON')
def api_manage_weapon_update(weapon_id):
    data = request.get_json()
    try:
        success = update_weapon(weapon_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/weapons/<int:weapon_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_WEAPON')
def api_manage_weapon_delete(weapon_id):
    try:
        success = delete_weapon(weapon_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/weapons/<int:weapon_id>/relationships', methods=['PUT'])
@admin_required
@audit_action('UPDATE_WEAPON_RELATIONSHIPS')
def api_manage_weapon_relationships_update(weapon_id):
    data = request.get_json()
    try:
        update_weapon_relationships(
            weapon_id,
            data.get('ammunitions', []),
            data.get('magazines', []),
            data.get('attachments', [])
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === CALIBERS ===
@api_items_manage_bp.route('/api/manage/calibers', methods=['GET'])
@admin_required
def api_manage_calibers_list():
    calibers = get_calibers()
    return jsonify({'calibers': calibers})

@api_items_manage_bp.route('/api/manage/calibers-list', methods=['GET'])
@login_required
def api_manage_calibers_list_simple():
    """Retorna apenas id e name dos calibres para filtros"""
    calibers = get_all_calibers()
    return jsonify({'calibers': calibers})

@api_items_manage_bp.route('/api/manage/calibers/<int:caliber_id>', methods=['GET'])
@admin_required
def api_manage_caliber_detail(caliber_id):
    caliber = get_caliber_by_id(caliber_id)
    if not caliber:
        return jsonify({'error': 'Calibre não encontrado'}), 404
    return jsonify({'caliber': caliber})

@api_items_manage_bp.route('/api/manage/calibers', methods=['POST'])
@admin_required
@audit_action('CREATE_CALIBER')
def api_manage_caliber_create():
    data = request.get_json()
    try:
        caliber_id = create_caliber(data)
        return jsonify({'success': True, 'id': caliber_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/calibers/<int:caliber_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_CALIBER')
def api_manage_caliber_update(caliber_id):
    data = request.get_json()
    try:
        success = update_caliber(caliber_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/calibers/<int:caliber_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_CALIBER')
def api_manage_caliber_delete(caliber_id):
    try:
        success = delete_caliber(caliber_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === AMMUNITIONS ===
@api_items_manage_bp.route('/api/manage/ammunitions', methods=['GET'])
@login_required
def api_manage_ammunitions_list():
    ammunitions = get_ammunitions(limit=1000)
    return jsonify({'ammunitions': ammunitions})

@api_items_manage_bp.route('/api/manage/ammunitions/<int:ammo_id>', methods=['GET'])
@admin_required
def api_manage_ammunition_detail(ammo_id):
    ammunition = get_ammunition_by_id(ammo_id)
    if not ammunition:
        return jsonify({'error': 'Munição não encontrada'}), 404
    return jsonify({'ammunition': ammunition})

@api_items_manage_bp.route('/api/manage/ammunitions', methods=['POST'])
@admin_required
@audit_action('CREATE_AMMUNITION')
def api_manage_ammunition_create():
    data = request.get_json()
    try:
        ammo_id = create_ammunition(data)
        return jsonify({'success': True, 'id': ammo_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/ammunitions/<int:ammo_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_AMMUNITION')
def api_manage_ammunition_update(ammo_id):
    data = request.get_json()
    try:
        success = update_ammunition(ammo_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/ammunitions/<int:ammo_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_AMMUNITION')
def api_manage_ammunition_delete(ammo_id):
    try:
        success = delete_ammunition(ammo_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === MAGAZINES ===
@api_items_manage_bp.route('/api/manage/magazines', methods=['GET'])
@login_required
def api_manage_magazines_list():
    magazines = get_magazines(limit=1000)
    return jsonify({'magazines': magazines})

@api_items_manage_bp.route('/api/manage/magazines/<int:mag_id>', methods=['GET'])
@admin_required
def api_manage_magazine_detail(mag_id):
    magazine = get_magazine_by_id(mag_id)
    if not magazine:
        return jsonify({'error': 'Magazine não encontrado'}), 404
    return jsonify({'magazine': magazine})

@api_items_manage_bp.route('/api/manage/magazines', methods=['POST'])
@admin_required
@audit_action('CREATE_MAGAZINE')
def api_manage_magazine_create():
    data = request.get_json()
    try:
        mag_id = create_magazine(data)
        return jsonify({'success': True, 'id': mag_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/magazines/<int:mag_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_MAGAZINE')
def api_manage_magazine_update(mag_id):
    data = request.get_json()
    try:
        success = update_magazine(mag_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/magazines/<int:mag_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_MAGAZINE')
def api_manage_magazine_delete(mag_id):
    try:
        success = delete_magazine(mag_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ATTACHMENTS ===
@api_items_manage_bp.route('/api/manage/attachments', methods=['GET'])
@login_required
def api_manage_attachments_list():
    attachments = get_attachments(limit=1000)
    return jsonify({'attachments': attachments})

@api_items_manage_bp.route('/api/manage/attachments/<int:att_id>', methods=['GET'])
@admin_required
def api_manage_attachment_detail(att_id):
    attachment = get_attachment_by_id(att_id)
    if not attachment:
        return jsonify({'error': 'Attachment não encontrado'}), 404
    return jsonify({'attachment': attachment})

@api_items_manage_bp.route('/api/manage/attachments', methods=['POST'])
@admin_required
@audit_action('CREATE_ATTACHMENT')
def api_manage_attachment_create():
    data = request.get_json()
    try:
        att_id = create_attachment(data)
        return jsonify({'success': True, 'id': att_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/attachments/<int:att_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ATTACHMENT')
def api_manage_attachment_update(att_id):
    data = request.get_json()
    try:
        success = update_attachment(att_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/attachments/<int:att_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ATTACHMENT')
def api_manage_attachment_delete(att_id):
    try:
        success = delete_attachment(att_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === EXPLOSIVES ===
@api_items_manage_bp.route('/api/manage/explosives', methods=['GET'])
@login_required
def api_manage_explosives_list():
    explosives = get_explosives(limit=1000)
    return jsonify({'explosives': explosives})

@api_items_manage_bp.route('/api/manage/explosives/<int:exp_id>', methods=['GET'])
@admin_required
def api_manage_explosive_detail(exp_id):
    explosive = get_explosive_by_id(exp_id)
    if not explosive:
        return jsonify({'error': 'Explosivo não encontrado'}), 404
    return jsonify({'explosive': explosive})

@api_items_manage_bp.route('/api/manage/explosives', methods=['POST'])
@admin_required
@audit_action('CREATE_EXPLOSIVE')
def api_manage_explosive_create():
    data = request.get_json()
    try:
        exp_id = create_explosive(data)
        return jsonify({'success': True, 'id': exp_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/explosives/<int:exp_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_EXPLOSIVE')
def api_manage_explosive_update(exp_id):
    data = request.get_json()
    try:
        success = update_explosive(exp_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/explosives/<int:exp_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_EXPLOSIVE')
def api_manage_explosive_delete(exp_id):
    try:
        success = delete_explosive(exp_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ITEM_TYPES ===
@api_items_manage_bp.route('/api/manage/item-types', methods=['GET'])
@admin_required
def api_manage_item_types_list():
    types = get_item_types()
    return jsonify({'types': types})

@api_items_manage_bp.route('/api/manage/item-types/<int:type_id>', methods=['GET'])
@admin_required
def api_manage_item_type_detail(type_id):
    item_type = get_item_type_by_id(type_id)
    if not item_type:
        return jsonify({'error': 'Tipo de item não encontrado'}), 404
    return jsonify({'type': item_type})

@api_items_manage_bp.route('/api/manage/item-types', methods=['POST'])
@admin_required
@audit_action('CREATE_ITEM_TYPE')
def api_manage_item_type_create():
    data = request.get_json()
    try:
        type_id = create_item_type(data)
        return jsonify({'success': True, 'id': type_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/item-types/<int:type_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ITEM_TYPE')
def api_manage_item_type_update(type_id):
    data = request.get_json()
    try:
        success = update_item_type(type_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/item-types/<int:type_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ITEM_TYPE')
def api_manage_item_type_delete(type_id):
    try:
        success = delete_item_type(type_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ITEMS ===
@api_items_manage_bp.route('/api/manage/items', methods=['GET'])
@login_required
def api_manage_items_list():
    items = get_items(limit=1000)
    return jsonify({'items': items})

@api_items_manage_bp.route('/api/manage/items/<int:item_id>', methods=['GET'])
@admin_required
def api_manage_item_detail(item_id):
    item = get_item_by_id(item_id)
    if not item:
        return jsonify({'error': 'Item não encontrado'}), 404
    compatibility = get_item_compatibility(item_id)
    return jsonify({'item': item, 'compatibility': compatibility})

@api_items_manage_bp.route('/api/manage/items', methods=['POST'])
@admin_required
@audit_action('CREATE_ITEM')
def api_manage_item_create():
    data = request.get_json()
    try:
        item_id = create_item(data)
        return jsonify({'success': True, 'id': item_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/items/<int:item_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ITEM')
def api_manage_item_update(item_id):
    data = request.get_json()
    try:
        success = update_item(item_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/items/<int:item_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ITEM')
def api_manage_item_delete(item_id):
    try:
        success = delete_item(item_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/items/<int:item_id>/compatibility', methods=['GET'])
@login_required
def api_manage_item_compatibility_get(item_id):
    """Retorna compatibilidade de um item"""
    compatibility = get_item_compatibility(item_id)
    return jsonify({'compatibility': compatibility})

@api_items_manage_bp.route('/api/manage/items/<int:item_id>/compatibility', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ITEM_COMPATIBILITY')
def api_manage_item_compatibility_update(item_id):
    data = request.get_json()
    parent_ids = data.get('parents', [])
    child_ids = data.get('children', [])
    try:
        success = update_item_compatibility(item_id, parent_ids, child_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === VALIDAÇÃO ===
@api_items_manage_bp.route('/api/validate/item-type/<name_type>')
@admin_required
def api_validate_item_type(name_type):
    """Valida se o item type existe no types.xml"""
    is_valid = validate_item_type(name_type)
    return jsonify({'valid': is_valid})

# === RELACIONAMENTOS INVERSOS ===
@api_items_manage_bp.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['GET'])
@admin_required
def api_manage_magazine_weapons_get(mag_id):
    weapons = get_magazine_weapons(mag_id)
    return jsonify({'weapons': weapons})

@api_items_manage_bp.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['PUT'])
@admin_required
@audit_action('UPDATE_MAGAZINE_WEAPONS')
def api_manage_magazine_weapons_update(mag_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_magazine_weapons(mag_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['GET'])
@admin_required
def api_manage_ammunition_weapons_get(ammo_id):
    weapons = get_ammunition_weapons(ammo_id)
    return jsonify({'weapons': weapons})

@api_items_manage_bp.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['PUT'])
@admin_required
@audit_action('UPDATE_AMMUNITION_WEAPONS')
def api_manage_ammunition_weapons_update(ammo_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_ammunition_weapons(ammo_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@api_items_manage_bp.route('/api/manage/attachments/<int:att_id>/weapons', methods=['GET'])
@admin_required
def api_manage_attachment_weapons_get(att_id):
    weapons = get_attachment_weapons(att_id)
    return jsonify({'weapons': weapons})

@api_items_manage_bp.route('/api/manage/attachments/<int:att_id>/weapons', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ATTACHMENT_WEAPONS')
def api_manage_attachment_weapons_update(att_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_attachment_weapons(att_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# ============================================================================
# ROTAS DE GERENCIAMENTO DE KITS
# ============================================================================

# === WEAPON KITS ===
