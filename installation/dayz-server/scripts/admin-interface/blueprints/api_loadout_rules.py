"""
Blueprint de API de Loadout Rules
Rotas de API para regras de loadout e endpoints filtrados
"""
from flask import Blueprint, request, jsonify
import logging
from database import (
    get_loadout_rules_weapons, ban_weapon_for_loadout, unban_weapon_for_loadout, set_weapon_max_quantity,
    get_loadout_rules_magazines, ban_magazine_for_loadout, unban_magazine_for_loadout, set_magazine_max_quantity,
    get_loadout_rules_ammunitions, ban_ammunition_for_loadout, unban_ammunition_for_loadout, set_ammunition_max_quantity,
    get_loadout_rules_attachments, ban_attachment_for_loadout, unban_attachment_for_loadout, set_attachment_max_quantity,
    get_loadout_rules_explosives, ban_explosive_for_loadout, unban_explosive_for_loadout, set_explosive_max_quantity,
    get_explosives_global_limit, set_explosives_global_limit,
    get_loadout_rules_items, ban_item_for_loadout, unban_item_for_loadout, set_item_max_quantity,
    get_loadout_rules_item_types, get_allowed_item_types_for_loadout, ban_item_type_for_loadout, unban_item_type_for_loadout,
    get_weapons_for_player_loadout, get_magazines_for_player_loadout, get_ammunitions_for_player_loadout,
    get_attachments_for_player_loadout, get_explosives_for_player_loadout, get_items_for_player_loadout
)
from blueprints.auth import admin_required, login_required, audit_action

api_loadout_rules_bp = Blueprint('api_loadout_rules', __name__)
logger = logging.getLogger(__name__)



# === WEAPONS ===
@api_loadout_rules_bp.route('/api/loadout-rules/weapons', methods=['GET'])
@admin_required
def api_loadout_rules_weapons_list():
    """Lista armas com status de blacklist e max_quantity"""
    try:
        weapons = get_loadout_rules_weapons()
        return jsonify({'success': True, 'weapons': weapons})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/weapons/<int:weapon_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_WEAPON_LOADOUT')
def api_loadout_rules_weapons_ban(weapon_id):
    """Bane uma arma para loadouts de players"""
    try:
        data = request.get_json() or {}
        max_quantity = data.get('max_quantity')
        success = ban_weapon_for_loadout(weapon_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/weapons/<int:weapon_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_WEAPON_LOADOUT')
def api_loadout_rules_weapons_unban(weapon_id):
    """Remove ban de uma arma para loadouts de players"""
    try:
        success = unban_weapon_for_loadout(weapon_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/weapons/<int:weapon_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_WEAPON_MAX_QUANTITY')
def api_loadout_rules_weapons_max_quantity(weapon_id):
    """Define quantidade máxima de uma arma"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity')
        success = set_weapon_max_quantity(weapon_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === MAGAZINES ===
@api_loadout_rules_bp.route('/api/loadout-rules/magazines', methods=['GET'])
@admin_required
def api_loadout_rules_magazines_list():
    """Lista magazines com status de blacklist e max_quantity"""
    try:
        magazines = get_loadout_rules_magazines()
        return jsonify({'success': True, 'magazines': magazines})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/magazines/<int:magazine_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_MAGAZINE_LOADOUT')
def api_loadout_rules_magazines_ban(magazine_id):
    """Bane um magazine para loadouts de players"""
    try:
        data = request.get_json() or {}
        max_quantity = data.get('max_quantity')
        success = ban_magazine_for_loadout(magazine_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/magazines/<int:magazine_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_MAGAZINE_LOADOUT')
def api_loadout_rules_magazines_unban(magazine_id):
    """Remove ban de um magazine para loadouts de players"""
    try:
        success = unban_magazine_for_loadout(magazine_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/magazines/<int:magazine_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_MAGAZINE_MAX_QUANTITY')
def api_loadout_rules_magazines_max_quantity(magazine_id):
    """Define quantidade máxima de um magazine"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity')
        success = set_magazine_max_quantity(magazine_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === AMMUNITIONS ===
@api_loadout_rules_bp.route('/api/loadout-rules/ammunitions', methods=['GET'])
@admin_required
def api_loadout_rules_ammunitions_list():
    """Lista ammunitions com status de blacklist e max_quantity"""
    try:
        ammunitions = get_loadout_rules_ammunitions()
        return jsonify({'success': True, 'ammunitions': ammunitions})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/ammunitions/<int:ammunition_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_AMMUNITION_LOADOUT')
def api_loadout_rules_ammunitions_ban(ammunition_id):
    """Bane uma ammunition para loadouts de players"""
    try:
        data = request.get_json() or {}
        max_quantity = data.get('max_quantity')
        success = ban_ammunition_for_loadout(ammunition_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/ammunitions/<int:ammunition_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_AMMUNITION_LOADOUT')
def api_loadout_rules_ammunitions_unban(ammunition_id):
    """Remove ban de uma ammunition para loadouts de players"""
    try:
        success = unban_ammunition_for_loadout(ammunition_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/ammunitions/<int:ammunition_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_AMMUNITION_MAX_QUANTITY')
def api_loadout_rules_ammunitions_max_quantity(ammunition_id):
    """Define quantidade máxima de uma ammunition"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity')
        success = set_ammunition_max_quantity(ammunition_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === ATTACHMENTS ===
@api_loadout_rules_bp.route('/api/loadout-rules/attachments', methods=['GET'])
@admin_required
def api_loadout_rules_attachments_list():
    """Lista attachments com status de blacklist e max_quantity"""
    try:
        attachments = get_loadout_rules_attachments()
        return jsonify({'success': True, 'attachments': attachments})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/attachments/<int:attachment_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_ATTACHMENT_LOADOUT')
def api_loadout_rules_attachments_ban(attachment_id):
    """Bane um attachment para loadouts de players"""
    try:
        data = request.get_json() or {}
        max_quantity = data.get('max_quantity')
        success = ban_attachment_for_loadout(attachment_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/attachments/<int:attachment_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_ATTACHMENT_LOADOUT')
def api_loadout_rules_attachments_unban(attachment_id):
    """Remove ban de um attachment para loadouts de players"""
    try:
        success = unban_attachment_for_loadout(attachment_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/attachments/<int:attachment_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_ATTACHMENT_MAX_QUANTITY')
def api_loadout_rules_attachments_max_quantity(attachment_id):
    """Define quantidade máxima de um attachment"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity')
        success = set_attachment_max_quantity(attachment_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === EXPLOSIVES ===
@api_loadout_rules_bp.route('/api/loadout-rules/explosives', methods=['GET'])
@admin_required
def api_loadout_rules_explosives_list():
    """Lista explosives com status de blacklist e max_quantity"""
    try:
        explosives = get_loadout_rules_explosives()
        return jsonify({'success': True, 'explosives': explosives})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/explosives/<int:explosive_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_EXPLOSIVE_LOADOUT')
def api_loadout_rules_explosives_ban(explosive_id):
    """Bane um explosive para loadouts de players"""
    try:
        data = request.get_json() or {}
        max_quantity = data.get('max_quantity')
        success = ban_explosive_for_loadout(explosive_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/explosives/<int:explosive_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_EXPLOSIVE_LOADOUT')
def api_loadout_rules_explosives_unban(explosive_id):
    """Remove ban de um explosive para loadouts de players"""
    try:
        success = unban_explosive_for_loadout(explosive_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/explosives/<int:explosive_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_EXPLOSIVE_MAX_QUANTITY')
def api_loadout_rules_explosives_max_quantity(explosive_id):
    """Define quantidade máxima de um explosive"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity')
        success = set_explosive_max_quantity(explosive_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/explosives-global', methods=['GET'])
@admin_required
def api_loadout_rules_explosives_global_get():
    """Retorna limite global de quantidade total de explosivos"""
    try:
        limit = get_explosives_global_limit()
        return jsonify({'success': True, 'limit': limit})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/explosives-global', methods=['PUT'])
@admin_required
@audit_action('SET_EXPLOSIVES_GLOBAL_LIMIT')
def api_loadout_rules_explosives_global_set():
    """Define limite global de quantidade total de explosivos"""
    try:
        data = request.get_json()
        max_total_quantity = data.get('max_total_quantity', 0)
        success = set_explosives_global_limit(max_total_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === ITEMS ===
@api_loadout_rules_bp.route('/api/loadout-rules/items', methods=['GET'])
@admin_required
def api_loadout_rules_items_list():
    """Lista items com status de blacklist e max_quantity"""
    try:
        items = get_loadout_rules_items()
        return jsonify({'success': True, 'items': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/items/<int:item_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_ITEM_LOADOUT')
def api_loadout_rules_items_ban(item_id):
    """Bane um item para loadouts de players (max_quantity NULL = banido, com valor = permitido com limite)"""
    try:
        data = request.get_json() or {}
        # Quando banir, max_quantity deve ser explicitamente None (NULL no banco)
        # Flask converte null do JSON para None automaticamente
        max_quantity = data.get('max_quantity')
        # Se foi enviado um valor numérico válido, usar esse valor
        # Caso contrário (None/null/string vazia), usar None para banir
        if max_quantity is not None:
            try:
                # Tentar converter para int se for um número válido
                max_quantity = int(max_quantity)
            except (ValueError, TypeError):
                # Se não for um número válido, usar None (banir)
                max_quantity = None
        # Se max_quantity é None, será inserido como NULL no banco (banido)
        success = ban_item_for_loadout(item_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/items/<int:item_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_ITEM_LOADOUT')
def api_loadout_rules_items_unban(item_id):
    """Remove ban de um item para loadouts de players"""
    try:
        success = unban_item_for_loadout(item_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/items/<int:item_id>/max-quantity', methods=['PUT'])
@admin_required
@audit_action('SET_ITEM_MAX_QUANTITY')
def api_loadout_rules_items_max_quantity(item_id):
    """Define quantidade máxima de um item"""
    try:
        data = request.get_json()
        max_quantity = data.get('max_quantity', 1)
        success = set_item_max_quantity(item_id, max_quantity)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# === ITEM TYPES ===
@api_loadout_rules_bp.route('/api/loadout-rules/item-types', methods=['GET'])
@admin_required
def api_loadout_rules_item_types_list():
    """Lista tipos de itens com status de blacklist"""
    try:
        item_types = get_loadout_rules_item_types()
        return jsonify({'success': True, 'item_types': item_types})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/item-types/<int:item_type_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_ITEM_TYPE_LOADOUT')
def api_loadout_rules_item_types_ban(item_type_id):
    """Bane um tipo de item para loadouts de players"""
    try:
        success = ban_item_type_for_loadout(item_type_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadout-rules/item-types/<int:item_type_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_ITEM_TYPE_LOADOUT')
def api_loadout_rules_item_types_unban(item_type_id):
    """Remove ban de um tipo de item para loadouts de players"""
    try:
        success = unban_item_type_for_loadout(item_type_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ============================================================================
# API - LOADOUTS PLAYERS FILTRADOS (Aplicam regras)
# ============================================================================

@api_loadout_rules_bp.route('/api/loadouts/players/weapons', methods=['GET'])
@login_required
def api_loadouts_players_weapons():
    """Lista apenas armas permitidas para loadouts de players"""
    try:
        search = request.args.get('search', '')
        weapons = get_weapons_for_player_loadout(search)
        return jsonify({'success': True, 'weapons': weapons})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadouts/players/magazines', methods=['GET'])
@login_required
def api_loadouts_players_magazines():
    """Lista apenas magazines permitidas para loadouts de players"""
    try:
        search = request.args.get('search', '')
        weapon_id = request.args.get('weapon_id', type=int)
        limit = int(request.args.get('limit', 50))
        magazines = get_magazines_for_player_loadout(search, weapon_id, limit)
        return jsonify({'success': True, 'magazines': magazines})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadouts/players/ammunitions', methods=['GET'])
@login_required
def api_loadouts_players_ammunitions():
    """Lista apenas ammunitions permitidas para loadouts de players"""
    try:
        search = request.args.get('search', '')
        caliber_id = request.args.get('caliber_id', type=int)
        weapon_id = request.args.get('weapon_id', type=int)
        limit = int(request.args.get('limit', 50))
        ammunitions = get_ammunitions_for_player_loadout(search, caliber_id, weapon_id, limit)
        return jsonify({'success': True, 'ammunitions': ammunitions})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadouts/players/attachments', methods=['GET'])
@login_required
def api_loadouts_players_attachments():
    """Lista apenas attachments permitidos para loadouts de players"""
    try:
        search = request.args.get('search', '')
        type_filter = request.args.get('type', '')
        weapon_id = request.args.get('weapon_id', type=int)
        limit = int(request.args.get('limit', 50))
        attachments = get_attachments_for_player_loadout(search, type_filter if type_filter else None, weapon_id, limit)
        return jsonify({'success': True, 'attachments': attachments})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadouts/players/explosives', methods=['GET'])
@login_required
def api_loadouts_players_explosives():
    """Lista apenas explosives permitidos para loadouts de players com max_quantity"""
    try:
        search = request.args.get('search', '')
        limit = int(request.args.get('limit', 50))
        explosives = get_explosives_for_player_loadout(search, limit)
        return jsonify({'success': True, 'explosives': explosives})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadout_rules_bp.route('/api/loadouts/players/items', methods=['GET'])
@login_required
def api_loadouts_players_items():
    """Lista apenas items permitidos para loadouts de players com max_quantity"""
    try:
        type_id = request.args.get('type_id', type=int)
        search = request.args.get('search', '')
        limit = int(request.args.get('limit', 1000))
        items = get_items_for_player_loadout(type_id, search, limit)
        return jsonify({'success': True, 'items': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
