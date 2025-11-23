"""
Blueprint de API de Loadouts
Rotas de API relacionadas
"""
from flask import Blueprint, request, jsonify, session
import logging
import fcntl
import os
import config
import logging
from database import (
    get_loadouts_custom, get_loadout_custom_by_id, create_loadout_custom,
    update_loadout_custom, delete_loadout_custom,
    get_loadouts_by_player, get_loadout_player_by_id, create_loadout_player,
    update_loadout_player, delete_loadout_player,
    get_players_with_loadouts, sync_custom_loadouts_to_file,
    sync_player_loadouts_to_file, PROTECTED_LOADOUTS, ensure_protected_loadouts_exist,
    get_weapons_for_player_loadout, get_magazines_for_player_loadout,
    get_ammunitions_for_player_loadout, get_attachments_for_player_loadout,
    get_explosives_for_player_loadout, get_items_for_player_loadout,
    get_explosives_global_limit, get_allowed_item_types_for_loadout,
    log_user_action, get_all_players
)
from blueprints.auth import admin_required, login_required, audit_action, get_client_ip
from blueprints.helpers import sanitize_loadout_name


api_loadouts_bp = Blueprint('api_loadouts', __name__)
logger = logging.getLogger(__name__)



@api_loadouts_bp.route('/api/loadouts/custom', methods=['GET'])
@admin_required
def api_loadouts_custom_list():
    """Lista todos os loadouts custom"""
    try:
        loadouts = get_loadouts_custom()
        return jsonify({'success': True, 'loadouts': loadouts})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/custom/<int:loadout_id>', methods=['GET'])
@admin_required
def api_loadouts_custom_get(loadout_id):
    """Obtém um loadout custom por ID"""
    try:
        loadout = get_loadout_custom_by_id(loadout_id)
        if not loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        return jsonify({'success': True, 'loadout': loadout})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/custom', methods=['POST'])
@admin_required
@admin_required
def api_loadouts_custom_create():
    """Cria um novo loadout custom"""
    try:
        data = request.get_json()
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not name or not loadout_data:
            return jsonify({'success': False, 'message': 'Nome e dados do loadout são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        loadout_id = create_loadout_custom(name, is_active, loadout_data)
        if not loadout_id:
            return jsonify({'success': False, 'message': 'Erro ao criar loadout'}), 500
        
        # Sincronizar com arquivo JSON
        sync_custom_loadouts_to_file()
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'CREATE_LOADOUT_CUSTOM',
            {'loadout_id': loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout criado com sucesso', 'loadout_id': loadout_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/custom/<int:loadout_id>', methods=['PUT'])
@admin_required
@admin_required
def api_loadouts_custom_update(loadout_id):
    """Atualiza um loadout custom"""
    try:
        data = request.get_json()
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not name or not loadout_data:
            return jsonify({'success': False, 'message': 'Nome e dados do loadout são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        # Verificar se é loadout protegido tentando alterar nome ou status
        loadout = get_loadout_custom_by_id(loadout_id)
        if loadout:
            current_name = loadout['name']
            is_protected = current_name.lower() in [p.lower() for p in PROTECTED_LOADOUTS]
            
            if is_protected:
                # Verificar se está tentando mudar nome ou status
                if name.lower() != current_name.lower() or is_active != loadout['is_active']:
                    return jsonify({'success': False, 'message': 'Loadouts protegidos não podem ter nome ou status alterados'}), 403
        
        success = update_loadout_custom(loadout_id, name, is_active, loadout_data)
        if not success:
            return jsonify({'success': False, 'message': 'Loadout não encontrado ou erro ao atualizar'}), 404
        
        # Sincronizar com arquivo JSON
        sync_custom_loadouts_to_file()
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'UPDATE_LOADOUT_CUSTOM',
            {'loadout_id': loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout atualizado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/custom/<int:loadout_id>', methods=['DELETE'])
@admin_required
@admin_required
def api_loadouts_custom_delete(loadout_id):
    """Deleta um loadout custom"""
    try:
        loadout = get_loadout_custom_by_id(loadout_id)
        if not loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        
        # Verificar se é loadout protegido
        current_name = loadout['name']
        is_protected = current_name.lower() in [p.lower() for p in PROTECTED_LOADOUTS]
        if is_protected:
            return jsonify({'success': False, 'message': 'Loadouts protegidos não podem ser deletados'}), 403
        
        success = delete_loadout_custom(loadout_id)
        if not success:
            return jsonify({'success': False, 'message': 'Erro ao deletar loadout'}), 500
        
        # Sincronizar com arquivo JSON
        sync_custom_loadouts_to_file()
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'DELETE_LOADOUT_CUSTOM',
            {'loadout_id': loadout_id, 'name': loadout['name']},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout deletado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ============================================================================
# API - LOADOUTS PLAYERS
# ============================================================================

@api_loadouts_bp.route('/api/loadouts/players/list', methods=['GET'])
@admin_required
def api_loadouts_players_list_all():
    """Lista todos os jogadores da tabela players_database"""
    try:
        players = get_all_players()
        return jsonify({'success': True, 'players': players})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players', methods=['GET'])
@admin_required
def api_loadouts_players_list():
    """Lista jogadores que possuem loadouts"""
    try:
        players = get_players_with_loadouts()
        return jsonify({'success': True, 'players': players})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/<player_id>', methods=['GET'])
@admin_required
def api_loadouts_players_get(player_id):
    """Obtém loadouts de um jogador"""
    try:
        loadouts = get_loadouts_by_player(player_id)
        return jsonify({'success': True, 'loadouts': loadouts})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/<player_id>', methods=['POST'])
@admin_required
@admin_required
def api_loadouts_players_create(player_id):
    """Cria um novo loadout para um jogador"""
    try:
        data = request.get_json()
        loadout_id = data.get('loadout_id')  # ID interno opcional (será gerado automaticamente se None)
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not name or not loadout_data:
            return jsonify({'success': False, 'message': 'Nome e dados são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        # Criar loadout (loadout_id será gerado automaticamente se None)
        db_id = create_loadout_player(player_id, loadout_id, name, is_active, loadout_data)
        if not db_id:
            return jsonify({'success': False, 'message': 'Erro ao criar loadout'}), 500
        
        # Buscar o loadout_id gerado para retornar
        from database import get_loadout_player_by_id
        created_loadout = get_loadout_player_by_id(db_id)
        generated_loadout_id = created_loadout['loadout_id'] if created_loadout else None
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'CREATE_LOADOUT_PLAYER',
            {'player_id': player_id, 'loadout_id': generated_loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout criado com sucesso', 'db_id': db_id, 'loadout_id': generated_loadout_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/<player_id>/<int:loadout_id>', methods=['PUT'])
@admin_required
@admin_required
def api_loadouts_players_update(player_id, loadout_id):
    """Atualiza um loadout de jogador (loadout_id é o ID interno, não o ID do banco)"""
    try:
        data = request.get_json()
        db_id = data.get('db_id')  # ID do banco de dados
        new_loadout_id = data.get('loadout_id', loadout_id)  # Novo ID interno
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not db_id or not name or not loadout_data:
            return jsonify({'success': False, 'message': 'ID do banco, nome e dados são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        success = update_loadout_player(db_id, new_loadout_id, name, is_active, loadout_data)
        if not success:
            return jsonify({'success': False, 'message': 'Loadout não encontrado ou erro ao atualizar'}), 404
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'UPDATE_LOADOUT_PLAYER',
            {'player_id': player_id, 'loadout_id': new_loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout atualizado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/my-loadout', methods=['GET'])
@login_required
def api_my_loadout_list():
    """Lista loadouts do usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        loadouts = get_loadouts_by_player(player_id)
        return jsonify({'success': True, 'loadouts': loadouts})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/my-loadout', methods=['POST'])
@login_required
def api_my_loadout_create():
    """Cria um novo loadout para o usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar limite de 3 loadouts
        existing_loadouts = get_loadouts_by_player(player_id)
        if len(existing_loadouts) >= 3:
            return jsonify({'success': False, 'message': 'Você já possui o máximo de 3 loadouts. Delete um loadout antes de criar outro.'}), 400
        
        data = request.get_json()
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not name or not loadout_data:
            return jsonify({'success': False, 'message': 'Nome e dados são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        # Auto-gerar loadout_id (None para gerar automaticamente)
        db_id = create_loadout_player(player_id, None, name, is_active, loadout_data)
        if not db_id:
            return jsonify({'success': False, 'message': 'Erro ao criar loadout'}), 500
        
        # Buscar o loadout_id gerado para retornar
        from database import get_loadout_player_by_id
        created_loadout = get_loadout_player_by_id(db_id)
        generated_loadout_id = created_loadout['loadout_id'] if created_loadout else None
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'CREATE_MY_LOADOUT',
            {'player_id': player_id, 'loadout_id': generated_loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout criado com sucesso', 'db_id': db_id, 'loadout_id': generated_loadout_id})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/my-loadout/<int:db_id>', methods=['PUT'])
@login_required
def api_my_loadout_update(db_id):
    """Atualiza um loadout do usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        existing_loadout = get_loadout_player_by_id(db_id)
        if not existing_loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        
        if existing_loadout['player_id'] != player_id:
            return jsonify({'success': False, 'message': 'Você não tem permissão para editar este loadout'}), 403
        
        data = request.get_json()
        name = data.get('name')
        is_active = data.get('is_active', False)
        loadout_data = data.get('loadout_data', {})
        
        if not name or not loadout_data:
            return jsonify({'success': False, 'message': 'Nome e dados são obrigatórios'}), 400
        
        # Sanitizar e validar nome do loadout
        name = sanitize_loadout_name(name)
        if not name:
            return jsonify({'success': False, 'message': 'Nome do loadout inválido. Use apenas letras minúsculas, números e hífen.'}), 400
        
        # Usar o loadout_id existente (não permitir alterar)
        loadout_id = existing_loadout['loadout_id']
        
        success = update_loadout_player(db_id, loadout_id, name, is_active, loadout_data)
        if not success:
            return jsonify({'success': False, 'message': 'Erro ao atualizar loadout'}), 500
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'UPDATE_MY_LOADOUT',
            {'player_id': player_id, 'loadout_id': loadout_id, 'name': name},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout atualizado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/my-loadout/<int:db_id>', methods=['DELETE'])
@login_required
def api_my_loadout_delete(db_id):
    """Deleta um loadout do usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        existing_loadout = get_loadout_player_by_id(db_id)
        if not existing_loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        
        if existing_loadout['player_id'] != player_id:
            return jsonify({'success': False, 'message': 'Você não tem permissão para deletar este loadout'}), 403
        
        success = delete_loadout_player(db_id)
        if not success:
            return jsonify({'success': False, 'message': 'Erro ao deletar loadout'}), 500
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'DELETE_MY_LOADOUT',
            {'player_id': player_id, 'loadout_id': existing_loadout['loadout_id'], 'name': existing_loadout['name']},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout deletado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/my-loadout/<int:db_id>/set-active', methods=['POST'])
@login_required
def api_my_loadout_set_active(db_id):
    """Define um loadout como ativo (desativa todos os outros)"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        existing_loadout = get_loadout_player_by_id(db_id)
        if not existing_loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        
        if existing_loadout['player_id'] != player_id:
            return jsonify({'success': False, 'message': 'Você não tem permissão para editar este loadout'}), 403
        
        # Desativar todos os loadouts do usuário e ativar apenas o selecionado
        all_loadouts = get_loadouts_by_player(player_id)
        for loadout in all_loadouts:
            if loadout['id'] == db_id:
                # Ativar este loadout
                update_loadout_player(loadout['id'], loadout['loadout_id'], loadout['name'], True, loadout['loadout_data'])
            else:
                # Desativar TODOS os outros loadouts (garantir que apenas um fique ativo)
                update_loadout_player(loadout['id'], loadout['loadout_id'], loadout['name'], False, loadout['loadout_data'])
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'SET_ACTIVE_MY_LOADOUT',
            {'player_id': player_id, 'loadout_id': existing_loadout['loadout_id'], 'name': existing_loadout['name']},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout ativado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/<player_id>/<int:loadout_id>', methods=['DELETE'])
@admin_required
@admin_required
def api_loadouts_players_delete(player_id, loadout_id):
    """Deleta um loadout de jogador (loadout_id é o ID interno, não o ID do banco)"""
    try:
        # Buscar loadout pelo player_id e loadout_id
        loadouts = get_loadouts_by_player(player_id)
        db_loadout = None
        for loadout in loadouts:
            if loadout['loadout_id'] == loadout_id:
                db_loadout = loadout
                break
        
        if not db_loadout:
            return jsonify({'success': False, 'message': 'Loadout não encontrado'}), 404
        
        success = delete_loadout_player(db_loadout['id'])  # Usar ID do banco
        if not success:
            return jsonify({'success': False, 'message': 'Erro ao deletar loadout'}), 500
        
        # Sincronizar com arquivo JSON
        sync_player_loadouts_to_file(player_id)
        
        # Registrar ação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'DELETE_LOADOUT_PLAYER',
            {'player_id': player_id, 'loadout_id': loadout_id, 'name': db_loadout['name']},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': 'Loadout deletado com sucesso'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ============================================================================
# API - LOADOUTS PLAYERS FILTRADOS (Aplicam regras)
# ============================================================================

# ============================================================================
# API - LOADOUTS PLAYERS FILTRADOS (Aplicam regras)
# ============================================================================

@api_loadouts_bp.route('/api/loadouts/players/weapons', methods=['GET'])
@login_required
def api_loadouts_players_weapons():
    """Lista apenas armas permitidas para loadouts de players"""
    try:
        search = request.args.get('search', '')
        weapons = get_weapons_for_player_loadout(search)
        return jsonify({'success': True, 'weapons': weapons})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/magazines', methods=['GET'])
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

@api_loadouts_bp.route('/api/loadouts/players/ammunitions', methods=['GET'])
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

@api_loadouts_bp.route('/api/loadouts/players/attachments', methods=['GET'])
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

@api_loadouts_bp.route('/api/loadouts/players/explosives', methods=['GET'])
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

@api_loadouts_bp.route('/api/loadouts/players/items', methods=['GET'])
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

@api_loadouts_bp.route('/api/loadouts/players/item-types', methods=['GET'])
@login_required
def api_loadouts_players_item_types():
    """Lista apenas tipos de itens permitidos (não banidos) para loadouts de players"""
    try:
        item_types = get_allowed_item_types_for_loadout()
        return jsonify({'success': True, 'types': item_types})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_loadouts_bp.route('/api/loadouts/players/explosives-global', methods=['GET'])
@login_required
def api_loadouts_players_explosives_global():
    """Retorna limite global de quantidade total de explosivos"""
    try:
        limit = get_explosives_global_limit()
        return jsonify({'success': True, 'limit': limit})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
