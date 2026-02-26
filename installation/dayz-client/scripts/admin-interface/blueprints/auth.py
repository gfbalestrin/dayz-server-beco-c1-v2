"""
Blueprint de Autenticação
Rotas de login, logout e troca de senha obrigatória
Decorators de autenticação e auditoria
"""
import re
import requests
import sqlite3
import urllib.parse
from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from functools import wraps
import config
from database import (
    authenticate_user, get_user_by_id, update_user_password,
    verify_password, validate_password_strength, log_user_action
)

auth_bp = Blueprint('auth', __name__)

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"

def verify_steam_login(params):
    """Valida se a resposta da Steam é legítima"""
    v_params = params.copy()
    v_params["openid.mode"] = "check_authentication"
    response = requests.post(STEAM_OPENID_URL, data=v_params)
    return "is_valid:true" in response.text

@auth_bp.route('/steam/login')
def steam_login():
    """Redireciona para a Steam"""
    # Monta a URL de retorno baseada na URL atual da requisição
    realm = request.host_url
    return_to = f"{realm}auth/steam/callback"

    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm
    }
    query_string = urllib.parse.urlencode(params)
    return redirect(f"{STEAM_OPENID_URL}?{query_string}")

@auth_bp.route('/auth/steam/callback')
def steam_callback():
    params = request.args.to_dict()
    
    # 1. Validação de Segurança
    if not verify_steam_login(params):
        return render_template('login.html', error="Falha na autenticação da Steam.")

    # 2. Extrair SteamID64
    claimed_id = params.get("openid.claimed_id", "")
    steam_id = claimed_id.split('/')[-1]

    # 3. Verificar se o jogador existe no servidor DayZ (usando database.py)
    from database import get_player_by_steam_id, get_or_create_steam_user # Certifique-se de importar
    
    player_info = get_player_by_steam_id(steam_id)
    if not player_info:
        return render_template('login.html', error="Você precisa entrar no servidor DayZ antes de acessar o painel.")

    # 4. Obter ou Criar o usuário (usando database.py)
    user_data = get_or_create_steam_user(steam_id, player_info['PlayerID'], player_info['SteamName'])
    
    if not user_data:
        return render_template('login.html', error="Erro ao processar conta vinculada.")

    # 5. Configurar Sessão
    session['logged_in'] = True
    session['username'] = user_data['Username']
    session['user_type'] = user_data['UserType']
    session['user_id'] = user_data['UserID']
    session['player_id'] = user_data['PlayerID']

    # 6. Auditoria
    log_user_action(
        user_data['UserID'],
        user_data['Username'],
        'LOGIN_STEAM',
        {'steam_id': steam_id},
        get_client_ip()
    )

    return redirect(url_for('views.my_loadout'))

def get_client_ip():
    """Obtém IP do cliente considerando proxies"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr


def login_required(f):
    """Decorator para rotas que requerem autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('auth.login'))
        
        # Verificar se precisa trocar senha (exceto nas rotas permitidas)
        if session.get('must_change_password'):
            if request.endpoint not in ['auth.change_password_required', 'auth.logout']:
                return redirect(url_for('auth.change_password_required'))
        
        return f(*args, **kwargs)
    return decorated_function


def super_admin_required(f):
    """Decorator para rotas que requerem Super Admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('auth.login'))
        if session.get('user_type') != config.USER_TYPE_SUPER_ADMIN:
            return render_template('error.html', message='Acesso negado. Requer permissões de Super Admin.'), 403
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator para rotas que requerem Admin ou Super Admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('auth.login'))
        user_type = session.get('user_type')
        if user_type not in [config.USER_TYPE_SUPER_ADMIN, config.USER_TYPE_ADMIN]:
            return render_template('error.html', message='Acesso negado. Requer permissões de administrador.'), 403
        return f(*args, **kwargs)
    return decorated_function


def audit_action(action: str):
    """Decorator para registrar ações automaticamente"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Executar função
            result = f(*args, **kwargs)
            
            # Registrar ação após sucesso
            try:
                user_id = session.get('user_id')
                username = session.get('username', 'Unknown')
                ip_address = get_client_ip()
                
                # Detalhes básicos apenas
                details = {
                    'endpoint': request.endpoint,
                    'path': request.path
                }
                
                log_user_action(user_id, username, action, details, ip_address)
            except Exception as e:
                # Não falhar a requisição se o log falhar
                print(f"Erro ao registrar auditoria: {e}")
            
            return result
        return decorated_function
    return decorator


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Página de login - Suporta Super Admin, Admin Normal e Jogador"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # Primeiro verifica se é Super Admin (hardcoded)
        if username == config.ADMIN_USERNAME and password == config.ADMIN_PASSWORD:
            session['logged_in'] = True
            session['username'] = username
            session['user_type'] = config.USER_TYPE_SUPER_ADMIN
            session['user_id'] = None  # Super admin não tem ID no banco
            
            # Registrar login
            log_user_action(
                None,
                username,
                'LOGIN',
                {'user_type': config.USER_TYPE_SUPER_ADMIN},
                get_client_ip()
            )
            
            return redirect(url_for('views.map_view'))
        
        # Se não for Super Admin, verifica no banco de dados
        user_data = authenticate_user(username, password)
        if user_data:
            session['logged_in'] = True
            session['username'] = user_data['Username']
            session['user_type'] = user_data['UserType']
            session['user_id'] = user_data['UserID']
            if user_data.get('PlayerID'):
                session['player_id'] = user_data['PlayerID']
            
            # Registrar login
            log_user_action(
                user_data['UserID'],
                user_data['Username'],
                'LOGIN',
                {'user_type': user_data['UserType']},
                get_client_ip()
            )
            
            # Verificar se deve trocar senha no primeiro login
            must_change = user_data.get('MustChangePassword', 0)
            if must_change == 1 or must_change is True:
                session['must_change_password'] = True
                return redirect(url_for('auth.change_password_required'))
            
            # Redirecionar conforme tipo de usuário
            if session.get('user_type') == 'player':
                return redirect(url_for('views.my_loadout'))
            return redirect(url_for('views.map_view'))
        
        # Credenciais inválidas
        return render_template('login.html', error='Credenciais inválidas')
    
    return render_template('login.html')

@auth_bp.route('/logout')
def logout():
    """Logout do usuário"""
    # Registrar logout antes de limpar sessão
    if 'logged_in' in session and session['logged_in']:
        log_user_action(
            session.get('user_id'),
            session.get('username', 'Unknown'),
            'LOGOUT',
            None,
            get_client_ip()
        )
    
    session.clear()
    return redirect(url_for('auth.login'))


@auth_bp.route('/change-password-required', methods=['GET', 'POST'])
@login_required
def change_password_required():
    """Troca obrigatória de senha no primeiro login"""
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')
        
        user_id = session.get('user_id')
        
        # Validar senhas
        if not current_password or not new_password or not confirm_password:
            return render_template('change_password_required.html', error='Todos os campos são obrigatórios')
        
        # Verificar se nova senha e confirmação coincidem
        if new_password != confirm_password:
            return render_template('change_password_required.html', error='As senhas não coincidem')
        
        # Verificar força da senha
        is_valid, error_msg = validate_password_strength(new_password)
        if not is_valid:
            return render_template('change_password_required.html', error=error_msg)
        
        # Verificar senha atual
        user = get_user_by_id(user_id)
        if not user:
            session.clear()
            return redirect(url_for('auth.login'))
        
        if not verify_password(current_password, user['Password']):
            return render_template('change_password_required.html', error='Senha atual incorreta')
        
        # Atualizar senha (com force_change=False por padrão)
        success = update_user_password(user_id, new_password, force_change=False)
        if not success:
            return render_template('change_password_required.html', error='Erro ao atualizar senha')
        
        # Registrar troca de senha
        log_user_action(
            user_id,
            session['username'],
            'CHANGE_PASSWORD',
            {'forced': True},
            get_client_ip()
        )
        
        # Remover flag da sessão e redirecionar
        session.pop('must_change_password', None)
        if session.get('user_type') == 'player':
            return redirect(url_for('views.my_loadout'))
        return redirect(url_for('views.index'))
    
    return render_template('change_password_required.html')

