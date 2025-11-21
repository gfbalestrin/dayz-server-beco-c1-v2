"""
Blueprint de API de Users
Rotas de API relacionadas
"""
from flask import Blueprint, request, jsonify, session
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from database import (
    get_all_users, get_user_by_id, create_user, update_user_password,
    deactivate_user, activate_user, delete_user, validate_password_strength,
    get_user_by_player_id, update_user_player_link, get_all_admins,
    get_admins_with_player_info, add_admin_id, remove_admin_id,
    get_player_by_id, log_user_action
)
from blueprints.auth import admin_required, super_admin_required, login_required, audit_action, get_client_ip


api_users_bp = Blueprint('api_users', __name__)
logger = logging.getLogger(__name__)



@api_users_bp.route('/api/manage/users', methods=['GET'])
@admin_required
def api_manage_users_get():
    """Listar todos os usuários (admin e player) - Admin e Super Admin podem acessar"""
    try:
        users = get_all_users()
        sao_paulo_tz = ZoneInfo('America/Sao_Paulo')
        
        # Não retornar senha no response e converter datas para timezone
        for user in users:
            if 'Password' in user:
                del user['Password']
            
            # Converter CreatedAt de UTC para America/Sao_Paulo
            if user.get('CreatedAt'):
                dt_created = None
                if isinstance(user['CreatedAt'], datetime):
                    # Se já é datetime, assumir UTC e converter
                    if user['CreatedAt'].tzinfo is None:
                        dt_created = user['CreatedAt'].replace(tzinfo=ZoneInfo('UTC')).astimezone(sao_paulo_tz)
                    else:
                        dt_created = user['CreatedAt'].astimezone(sao_paulo_tz)
                elif isinstance(user['CreatedAt'], str):
                    # Se é string, parsear e converter
                    try:
                        dt = datetime.fromisoformat(user['CreatedAt'].replace('Z', '+00:00'))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=ZoneInfo('UTC'))
                        dt_created = dt.astimezone(sao_paulo_tz)
                    except (ValueError, AttributeError):
                        pass  # Manter string original se não conseguir parsear
                
                # Converter para string ISO format para JSON
                if dt_created:
                    user['CreatedAt'] = dt_created.isoformat()
            
            # Converter LastLogin de UTC para America/Sao_Paulo
            if user.get('LastLogin'):
                dt_lastlogin = None
                if isinstance(user['LastLogin'], datetime):
                    # Se já é datetime, assumir UTC e converter
                    if user['LastLogin'].tzinfo is None:
                        dt_lastlogin = user['LastLogin'].replace(tzinfo=ZoneInfo('UTC')).astimezone(sao_paulo_tz)
                    else:
                        dt_lastlogin = user['LastLogin'].astimezone(sao_paulo_tz)
                elif isinstance(user['LastLogin'], str):
                    # Se é string, parsear e converter
                    try:
                        dt = datetime.fromisoformat(user['LastLogin'].replace('Z', '+00:00'))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=ZoneInfo('UTC'))
                        dt_lastlogin = dt.astimezone(sao_paulo_tz)
                    except (ValueError, AttributeError):
                        pass  # Manter string original se não conseguir parsear
                
                # Converter para string ISO format para JSON
                if dt_lastlogin:
                    user['LastLogin'] = dt_lastlogin.isoformat()
        
        return jsonify({'success': True, 'data': users})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ============================================================================
# ROTAS DE GESTÃO DE ADMINS NORMAIS (Específicas para Super Admin)
# ============================================================================

@api_users_bp.route('/api/manage/admins', methods=['GET'])
@super_admin_required
def api_manage_admins_get():
    """Listar todos os admins normais (apenas Super Admin)"""
    try:
        admins = get_all_admins()
        # Não retornar senha no response
        for admin in admins:
            if 'Password' in admin:
                del admin['Password']
        return jsonify({'success': True, 'data': admins})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_users_bp.route('/api/manage/admins/<int:admin_id>', methods=['GET'])
@super_admin_required
def api_manage_admin_get(admin_id):
    """Buscar admin específico por ID"""
    try:
        admin = get_user_by_id(admin_id)
        if not admin:
            return jsonify({'success': False, 'message': 'Admin não encontrado'}), 404
        
        # Verificar se é admin
        if admin.get('UserType') != config.USER_TYPE_ADMIN:
            return jsonify({'success': False, 'message': 'Usuário não é um admin'}), 400
        
        # Não retornar senha
        if 'Password' in admin:
            del admin['Password']
        
        return jsonify({'success': True, 'data': admin})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_users_bp.route('/api/manage/admins', methods=['POST'])
@super_admin_required
def api_manage_admins_post():
    """Criar novo usuário (admin ou player)"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        user_type = data.get('userType', config.USER_TYPE_ADMIN)  # Default: admin
        player_id = data.get('playerId', None)
        
        if not username or not password:
            return jsonify({'success': False, 'message': 'Username e senha são obrigatórios'}), 400
        
        # Validar tipo de usuário
        if user_type not in [config.USER_TYPE_ADMIN, config.USER_TYPE_PLAYER]:
            return jsonify({'success': False, 'message': 'Tipo de usuário inválido'}), 400
        
        # Validar força da senha
        is_valid, error_msg = validate_password_strength(password)
        if not is_valid:
            return jsonify({'success': False, 'message': error_msg}), 400
        
        # Criar usuário
        user_id = create_user(username, password, user_type, player_id)
        
        if user_id is None:
            return jsonify({'success': False, 'message': 'Username já existe'}), 400
        
        # Registrar criação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'CREATE_USER',
            {'target_username': username, 'target_user_type': user_type, 'created_user_id': user_id},
            get_client_ip()
        )
        
        type_label = 'Admin' if user_type == config.USER_TYPE_ADMIN else 'Jogador'
        return jsonify({'success': True, 'message': f'{type_label} criado com sucesso', 'data': {'user_id': user_id}})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_users_bp.route('/api/manage/admins/<int:admin_id>', methods=['PUT'])
@admin_required
def api_manage_admins_put(admin_id):
    """Atualizar senha ou status de usuário"""
    try:
        user = get_user_by_id(admin_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuário não encontrado'}), 404
        
        data = request.get_json()
        current_user_type = session.get('user_type')
        is_super_admin = current_user_type == config.USER_TYPE_SUPER_ADMIN
        
        # Verificar se é atualização de senha ou status
        if 'password' in data:
            if not is_super_admin:
                extra_fields = set(data.keys()) - {'password'}
                if extra_fields:
                    return jsonify({'success': False, 'message': 'Admins podem alterar apenas a senha de usuários com perfil player.'}), 403
                if user.get('UserType') != config.USER_TYPE_PLAYER:
                    return jsonify({'success': False, 'message': 'Admins só podem alterar senha de usuários do tipo player.'}), 403
            
            new_password = data.get('password')
            
            if not new_password:
                return jsonify({'success': False, 'message': 'Nova senha é obrigatória'}), 400
            
            # Validar força da senha
            is_valid, error_msg = validate_password_strength(new_password)
            if not is_valid:
                return jsonify({'success': False, 'message': error_msg}), 400
            
            # Forçar troca de senha para admin e player (não para super_admin)
            force_change = user['UserType'] in [config.USER_TYPE_ADMIN, config.USER_TYPE_PLAYER]
            success = update_user_password(admin_id, new_password, force_change=force_change)
            
            if not success:
                return jsonify({'success': False, 'message': 'Erro ao atualizar senha'}), 500
            
            # Registrar atualização de senha
            log_user_action(
                session.get('user_id'),
                session.get('username', 'Unknown'),
                'UPDATE_USER',
                {'action': 'password_change', 'target_user_id': admin_id, 'target_username': user['Username'], 'force_change': force_change},
                get_client_ip()
            )
            
            return jsonify({'success': True, 'message': 'Senha atualizada com sucesso'})
        
        elif 'isActive' in data:
            if not is_super_admin:
                return jsonify({'success': False, 'message': 'Apenas super admins podem alterar status do usuário.'}), 403
            is_active = data.get('isActive', False)
            
            if is_active:
                success = activate_user(admin_id)
                message = 'Usuário ativado com sucesso' if success else 'Erro ao ativar usuário'
                action_type = 'ACTIVATE_USER'
            else:
                success = deactivate_user(admin_id)
                message = 'Usuário desativado com sucesso' if success else 'Erro ao desativar usuário'
                action_type = 'DEACTIVATE_USER'
            
            if not success:
                return jsonify({'success': False, 'message': message}), 500
            
            # Registrar ativação/desativação
            log_user_action(
                session.get('user_id'),
                session.get('username', 'Unknown'),
                action_type,
                {'target_user_id': admin_id, 'target_username': user['Username']},
                get_client_ip()
            )
            
            return jsonify({'success': True, 'message': message})
        
        elif 'playerId' in data:
            if not is_super_admin:
                return jsonify({'success': False, 'message': 'Apenas super admins podem alterar vínculo de jogador.'}), 403
            player_id_raw = data.get('playerId')
            player_id = str(player_id_raw).strip() if player_id_raw not in [None, ''] else None
            previous_player_id = user.get('PlayerID')
            
            if player_id == previous_player_id:
                return jsonify({'success': True, 'message': 'Vínculo de jogador permanece inalterado.'})
            
            player_data = None
            if player_id:
                player_data = get_player_by_id(player_id)
                if not player_data:
                    return jsonify({'success': False, 'message': 'PlayerID informado não existe.'}), 400
                
                existing_user = get_user_by_player_id(player_id)
                if existing_user and existing_user.get('UserID') != admin_id:
                    return jsonify({'success': False, 'message': 'Este PlayerID já está vinculado a outro usuário.'}), 400
            
            success = update_user_player_link(admin_id, player_id)
            if not success:
                return jsonify({'success': False, 'message': 'Erro ao atualizar vínculo de jogador.'}), 500
            
            action_type = 'LINK_PLAYER' if player_id else 'UNLINK_PLAYER'
            details = {
                'action': 'player_link_update',
                'target_user_id': admin_id,
                'target_username': user['Username'],
                'previous_player_id': previous_player_id,
                'new_player_id': player_id
            }
            if player_data:
                details.update({
                    'player_name': player_data.get('PlayerName'),
                    'steam_id': player_data.get('SteamID'),
                    'steam_name': player_data.get('SteamName')
                })
            
            log_user_action(
                session.get('user_id'),
                session.get('username', 'Unknown'),
                action_type,
                details,
                get_client_ip()
            )
            
            message = 'Jogador vinculado ao usuário com sucesso!' if player_id else 'Vínculo de jogador removido com sucesso!'
            return jsonify({'success': True, 'message': message})
        
        else:
            if is_super_admin:
                return jsonify({'success': False, 'message': 'Nenhum campo válido para atualização'}), 400
            return jsonify({'success': False, 'message': 'Admins não possuem permissão para esta operação.'}), 403
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@api_users_bp.route('/api/manage/admins/<int:admin_id>', methods=['DELETE'])
@super_admin_required
def api_manage_admins_delete(admin_id):
    """Desativar ou excluir permanentemente usuário"""
    try:
        user = get_user_by_id(admin_id)
        if not user:
            return jsonify({'success': False, 'message': 'Usuário não encontrado'}), 404
        
        # Verificar se é exclusão permanente
        permanent = request.args.get('permanent', 'false').lower() == 'true'
        
        if permanent:
            # Exclusão permanente
            success = delete_user(admin_id)
            message = 'Usuário excluído permanentemente' if success else 'Erro ao excluir usuário'
            action_type = 'DELETE_USER'
        else:
            # Desativação (comportamento atual)
            success = deactivate_user(admin_id)
            message = 'Usuário desativado com sucesso' if success else 'Erro ao desativar usuário'
            action_type = 'DEACTIVATE_USER'
        
        if not success:
            return jsonify({'success': False, 'message': message}), 500
        
        # Registrar exclusão/desativação
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            action_type,
            {'target_user_id': admin_id, 'target_username': user['Username']},
            get_client_ip()
        )
        
        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_users_bp.route('/api/admins/list')
@admin_required
def api_admins_list():
    """API com lista de administradores e suas informações do banco de dados"""
    admins = get_admins_with_player_info()
    return jsonify({'admins': admins})


@api_users_bp.route('/api/admins/add', methods=['POST'])
@admin_required
@audit_action('ADMIN_ADD')
def api_admins_add():
    """Adiciona um administrador"""
    data = request.get_json()
    player_id = data.get('player_id')
    
    if not player_id or not player_id.strip():
        return jsonify({'success': False, 'message': 'Player ID é obrigatório'}), 400
    
    player_id = player_id.strip()
    
    # Verificar se o Player ID existe no banco (OBRIGATÓRIO)
    player = get_player_by_id(player_id)
    if not player:
        return jsonify({
            'success': False, 
            'message': 'Player ID não encontrado no banco de dados. Apenas jogadores que estão na database podem ser adicionados como administradores.'
        }), 400
    
    # Adicionar admin
    success = add_admin_id(player_id)
    
    if success:
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'ADD_ADMIN',
            {'player_id': player_id},
            get_client_ip()
        )
        return jsonify({'success': True, 'message': 'Administrador adicionado com sucesso!'})
    else:
        return jsonify({'success': False, 'message': 'Erro ao adicionar administrador. Player ID já existe ou ocorreu um erro.'}), 400


@api_users_bp.route('/api/admins/remove', methods=['POST'])
@admin_required
@audit_action('ADMIN_REMOVE')
def api_admins_remove():
    """Remove um administrador"""
    data = request.get_json()
    player_id = data.get('player_id')
    
    if not player_id or not player_id.strip():
        return jsonify({'success': False, 'message': 'Player ID é obrigatório'}), 400
    
    player_id = player_id.strip()
    
    # Remover admin
    success = remove_admin_id(player_id)
    
    if success:
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'REMOVE_ADMIN',
            {'player_id': player_id},
            get_client_ip()
        )
        return jsonify({'success': True, 'message': 'Administrador removido com sucesso!'})
    else:
        return jsonify({'success': False, 'message': 'Erro ao remover administrador. Player ID não encontrado ou ocorreu um erro.'}), 400

# ============================================================================
# FUNÇÕES AUXILIARES - LOADOUTS
# ============================================================================

def sanitize_loadout_name(name):
    """
    Sanitiza o nome do loadout para permitir apenas letras minúsculas, números e hífen.
    Substitui espaços por hífen e remove caracteres inválidos.
    
    Args:
        name: Nome do loadout a ser sanitizado
        
    Returns:
        str: Nome sanitizado ou None se estiver vazio após sanitização
    """
    if not name:
        return None
    
    # Converter para minúsculas
    sanitized = name.lower()
    
    # Substituir espaços (um ou mais) por um único hífen
    sanitized = re.sub(r'\s+', '-', sanitized)
    
    # Remover caracteres inválidos (manter apenas letras minúsculas, números e hífen)
    sanitized = re.sub(r'[^a-z0-9-]', '', sanitized)
    
    # Remover hífens múltiplos consecutivos
    sanitized = re.sub(r'-+', '-', sanitized)
    
    # Remover hífens no início e no fim
    sanitized = sanitized.strip('-')
    
    # Validar se está vazio após sanitização
    if not sanitized:
        return None
    
    # Validar formato final (apenas letras minúsculas, números e hífen)
    if not re.match(r'^[a-z0-9-]+$', sanitized):
        return None
    
    return sanitized

# ============================================================================
# API - LOADOUTS CUSTOM
# ============================================================================

