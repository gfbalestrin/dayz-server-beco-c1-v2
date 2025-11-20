"""
Aplicação Flask para interface administrativa DayZ
"""
from flask import Flask, render_template, request, session, redirect, url_for, jsonify, Response, stream_with_context
from functools import wraps
import config
import json
import os
import time
import re
from packing_algorithm import can_fit_items_in_container, pack_items_ffdh
from zoneinfo import ZoneInfo
from database import (
    get_all_players, get_player_coords, get_player_coords_backup,
    get_logs_adm, get_logs_custom,     get_vehicles_tracking, get_vehicles_map_positions,
    get_player_by_id, search_players, get_players_last_position,
    get_containers_last_position, get_item_details_from_items_db,
    get_fences_last_position, get_watchtowers_last_position, get_flags_last_position, get_watchtower_trail,
    get_player_trail, get_online_players_positions,
    get_vehicle_trail, get_container_trail, get_fence_trail,
    get_players_positions_by_timerange, dayz_to_pixel,
    get_vehicles_last_position, get_recent_kills, get_recent_damages, parse_position,
    check_backup_exists, check_backup_exists_any_player, get_backup_info, get_online_players,
    get_all_players_with_status,
    get_cheat_detection_scores, get_cheat_detection_events, get_player_cheat_details, review_cheat_event,
    clear_player_cheat_events,
    get_weapons, get_weapons_with_calibers, get_all_calibers, get_items, get_item_types,
    get_explosives, get_ammunitions, get_calibers,
    get_magazines, get_attachments, get_attachment_types,
    get_weapon_compatible_items,
    # CRUD Functions
    get_weapon_by_id, create_weapon, update_weapon, delete_weapon,
    get_weapon_relationships, update_weapon_relationships,
    get_caliber_by_id, create_caliber, update_caliber, delete_caliber,
    get_ammunition_by_id, create_ammunition, update_ammunition, delete_ammunition,
    get_magazine_by_id, create_magazine, update_magazine, delete_magazine,
    get_attachment_by_id, create_attachment, update_attachment, delete_attachment,
    get_explosive_by_id, create_explosive, update_explosive, delete_explosive,
    get_item_type_by_id, create_item_type, update_item_type, delete_item_type,
    get_item_by_id, create_item, update_item, delete_item,
    get_item_compatibility, update_item_compatibility,
    validate_item_type,
    get_magazine_weapons, update_magazine_weapons,
    get_attachment_weapons, update_attachment_weapons,
    get_ammunition_weapons, update_ammunition_weapons,
    # Weapon Kits
    get_weapon_kits, get_weapon_kit_by_id, create_weapon_kit, update_weapon_kit, delete_weapon_kit,
    # Loot Kits
    get_loot_kits, get_loot_kit_by_id, create_loot_kit, update_loot_kit, delete_loot_kit,
    calculate_loot_kit_space, get_storage_containers,
    # All Items
    get_all_explosives, get_all_ammunitions, get_all_magazines, get_all_attachments,
    # User Authentication Functions
    authenticate_user, get_user_by_id, create_user, update_user_password,
    get_all_admins, deactivate_user, activate_user, delete_user, validate_password_strength, 
    get_all_users, verify_password, log_user_action, get_user_audit_logs, get_unique_audit_actions,
    get_user_by_player_id, update_user_player_link,
    # Loadouts Functions
    get_loadouts_custom, get_loadout_custom_by_id, create_loadout_custom, update_loadout_custom, delete_loadout_custom,
    get_loadouts_by_player, get_loadout_player_by_id, create_loadout_player, update_loadout_player, delete_loadout_player,
    get_players_with_loadouts, sync_custom_loadouts_to_file, sync_player_loadouts_to_file,
    PROTECTED_LOADOUTS, ensure_protected_loadouts_exist,
    # Admin Functions
    get_admin_ids, get_admins_with_player_info, add_admin_id, remove_admin_id,
    # Loadout Rules Functions
    get_loadout_rules_weapons, ban_weapon_for_loadout, unban_weapon_for_loadout, set_weapon_max_quantity,
    get_loadout_rules_magazines, ban_magazine_for_loadout, unban_magazine_for_loadout, set_magazine_max_quantity,
    get_loadout_rules_ammunitions, ban_ammunition_for_loadout, unban_ammunition_for_loadout, set_ammunition_max_quantity,
    get_loadout_rules_attachments, ban_attachment_for_loadout, unban_attachment_for_loadout, set_attachment_max_quantity,
    get_loadout_rules_explosives, ban_explosive_for_loadout, unban_explosive_for_loadout, set_explosive_max_quantity,
    get_explosives_global_limit, set_explosives_global_limit,
    get_loadout_rules_items, ban_item_for_loadout, unban_item_for_loadout, set_item_max_quantity,
    get_loadout_rules_item_types, get_allowed_item_types_for_loadout, ban_item_type_for_loadout, unban_item_type_for_loadout,
    # Loadout Rules Filtered Functions
    get_weapons_for_player_loadout, get_magazines_for_player_loadout, get_ammunitions_for_player_loadout,
    get_attachments_for_player_loadout, get_explosives_for_player_loadout, get_items_for_player_loadout,
    get_active_vehicle_name_counts
)
from datetime import datetime
import vehicle_limits
try:
    from zoneinfo import ZoneInfo
except ImportError:
    # Fallback para Python < 3.9
    from backports.zoneinfo import ZoneInfo

app = Flask(__name__)
UTC_TZ = ZoneInfo("UTC")
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")

def convert_timestamp_to_br(timestamp_str):
    """Converte string de data/hora para America/Sao_Paulo"""
    if not timestamp_str:
        return None
    value = str(timestamp_str).strip()
    if value == "":
        return None
    
    normalized = value
    if value.endswith('Z'):
        normalized = value[:-1] + '+00:00'
    
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            cleaned = value.replace('T', ' ')
            dt = datetime.strptime(cleaned, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return value
    
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC_TZ)
    
    return dt.astimezone(SAO_PAULO_TZ).strftime('%Y-%m-%d %H:%M:%S')

def current_time_br():
    return datetime.now(SAO_PAULO_TZ).strftime('%Y-%m-%d %H:%M:%S')
app.secret_key = config.SECRET_KEY


def evaluate_vehicle_limit(vehicle_type: str):
    """Valida se é permitido spawnar o veículo considerando os limites do events.xml"""
    counts = get_active_vehicle_name_counts()
    limit_info = vehicle_limits.can_spawn_vehicle(vehicle_type, counts)
    allowed = limit_info.get('allowed', True)
    return allowed, limit_info


def format_limit_block_message(limit_info: dict) -> str:
    event_name = limit_info.get('event') or 'Evento desconhecido'
    current = limit_info.get('current')
    max_allowed = limit_info.get('max')
    if current is not None and max_allowed is not None:
        return f'Limite do {event_name} atingido ({current}/{max_allowed})'
    return f'Limite do {event_name} atingido'


def stream_log_file(log_path: str):
    """Gera eventos SSE com o conteúdo de um arquivo de log, simulando tail -F."""
    def iterator():
        log_descriptor = None
        current_position = 0
        last_heartbeat = time.time()
        heartbeat_interval = 10.0
        try:
            while True:
                if log_descriptor is None:
                    try:
                        log_descriptor = open(log_path, 'r', encoding='utf-8', errors='replace')
                        log_descriptor.seek(0, os.SEEK_END)
                        file_size = log_descriptor.tell()
                        if file_size > 0:
                            window_size = 16384
                            start_position = file_size - window_size
                            if start_position < 0:
                                start_position = 0
                            log_descriptor.seek(start_position, os.SEEK_SET)
                            if start_position > 0:
                                log_descriptor.readline()
                            for recent_line in log_descriptor.readlines():
                                sanitized_recent = recent_line.rstrip('\r\n')
                                yield f"data: {sanitized_recent}\n\n"
                            current_position = log_descriptor.tell()
                        else:
                            current_position = 0
                            yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                    except FileNotFoundError:
                        yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                        time.sleep(1.0)
                        continue
                    except Exception as open_error:
                        app.logger.error(f'Falha ao abrir log {log_path}: {open_error}')
                        yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                        time.sleep(1.0)
                        continue
                line_text = log_descriptor.readline()
                if line_text:
                    current_position = log_descriptor.tell()
                    sanitized_line = line_text.rstrip('\r\n')
                    yield f"data: {sanitized_line}\n\n"
                    last_heartbeat = time.time()
                    continue
                time.sleep(0.5)
                try:
                    file_size = os.path.getsize(log_path)
                except FileNotFoundError:
                    log_descriptor.close()
                    log_descriptor = None
                    current_position = 0
                    continue
                except Exception as stat_error:
                    app.logger.error(f'Falha ao verificar log {log_path}: {stat_error}')
                    continue
                if file_size < current_position:
                    log_descriptor.close()
                    log_descriptor = None
                    current_position = 0
                    yield "data: __heartbeat__\n\n"
                    last_heartbeat = time.time()
                    continue
                now = time.time()
                if now - last_heartbeat >= heartbeat_interval:
                    yield "data: __heartbeat__\n\n"
                    last_heartbeat = now
        finally:
            if log_descriptor:
                log_descriptor.close()
    return iterator()

# ============================================================================
# DECORATORS DE AUTENTICAÇÃO
# ============================================================================

def login_required(f):
    """Decorator para rotas que requerem autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        
        # Verificar se precisa trocar senha (exceto nas rotas permitidas)
        if session.get('must_change_password'):
            from flask import request
            if request.endpoint not in ['change_password_required', 'logout']:
                return redirect(url_for('change_password_required'))
        
        return f(*args, **kwargs)
    return decorated_function

def super_admin_required(f):
    """Decorator para rotas que requerem Super Admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        if session.get('user_type') != config.USER_TYPE_SUPER_ADMIN:
            return render_template('error.html', message='Acesso negado. Requer permissões de Super Admin.'), 403
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator para rotas que requerem Admin ou Super Admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        user_type = session.get('user_type')
        if user_type not in [config.USER_TYPE_SUPER_ADMIN, config.USER_TYPE_ADMIN]:
            return render_template('error.html', message='Acesso negado. Requer permissões de administrador.'), 403
        return f(*args, **kwargs)
    return decorated_function

# ============================================================================
# HELPER E DECORATOR DE AUDITORIA
# ============================================================================

def get_client_ip():
    """Obtém IP do cliente considerando proxies"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr

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

@app.route('/login', methods=['GET', 'POST'])
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
            
            return redirect(url_for('index'))
        
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
                return redirect(url_for('change_password_required'))
            
            # Redirecionar conforme tipo de usuário
            if session.get('user_type') == 'player':
                return redirect(url_for('my_loadout'))
            return redirect(url_for('index'))
        
        # Credenciais inválidas
        return render_template('login.html', error='Credenciais inválidas')
    
    return render_template('login.html')

@app.route('/logout')
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
    return redirect(url_for('login'))

@app.route('/change-password-required', methods=['GET', 'POST'])
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
            return redirect(url_for('login'))
        
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
            return redirect(url_for('my_loadout'))
        return redirect(url_for('index'))
    
    return render_template('change_password_required.html')

@app.route('/')
@admin_required
def index():
    """Lista de jogadores - Página principal"""
    players_list = get_all_players_with_status()
    return render_template('players.html', players=players_list)

@app.route('/players')
@admin_required
def players():
    """Lista de jogadores"""
    players_list = get_all_players_with_status()
    return render_template('players.html', players=players_list)

@app.route('/player/<player_id>/coords')
@admin_required
def player_coords(player_id):
    """Coordenadas de um jogador específico"""
    player = get_player_by_id(player_id)
    if not player:
        return render_template('error.html', message='Jogador não encontrado'), 404
    
    coords = get_player_coords(player_id)
    
    # Buscar backups para cada coordenada
    for coord in coords:
        backups = get_player_coords_backup(coord['PlayerCoordId'])
        coord['backups'] = backups
    
    return render_template('player_coords.html', player=player, coords=coords)

@app.route('/logs/adm')
@admin_required
def logs_adm():
    """Logs DayZServer.ADM"""
    logs = get_logs_adm()
    return render_template('logs_adm.html', logs=logs)

@app.route('/logs/custom')
@admin_required
def logs_custom():
    """Logs customizados"""
    logs = get_logs_custom()
    return render_template('logs_custom.html', logs=logs)


@app.route('/logs/init')
@admin_required
def logs_init():
    """Logs init.log em tempo real"""
    return render_template(
        'logs_init.html',
        log_title='Logs init.log',
        log_stream=url_for('logs_init_stream'),
        log_path=config.INIT_LOG_PATH
    )


@app.route('/logs/init/stream')
@admin_required
def logs_init_stream():
    """Stream SSE do init.log"""
    generator = stream_log_file(config.INIT_LOG_PATH)
    response = Response(stream_with_context(generator), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/logs/dayz-server-err')
@admin_required
def logs_dayz_err():
    """Logs dayz-server.err em tempo real"""
    return render_template(
        'logs_dayz_err.html',
        log_title='Logs Dayz-server.err',
        log_stream=url_for('logs_dayz_err_stream'),
        log_path=config.DAYZ_SERVER_ERR_PATH
    )


@app.route('/logs/dayz-server-err/stream')
@admin_required
def logs_dayz_err_stream():
    """Stream SSE do dayz-server.err"""
    generator = stream_log_file(config.DAYZ_SERVER_ERR_PATH)
    response = Response(stream_with_context(generator), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@app.route('/logs/audit')
@admin_required
def logs_audit():
    """Logs de auditoria de usuários"""
    # Obter parâmetros de filtro
    user_id = request.args.get('user_id', type=int)
    action = request.args.get('action')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    limit = request.args.get('limit', 1000, type=int)
    
    # Buscar logs com filtros
    logs = get_user_audit_logs(
        limit=limit,
        user_id=user_id,
        action=action,
        start_date=start_date,
        end_date=end_date
    )
    
    # Converter TimeStamp de UTC para America/Sao_Paulo
    sao_paulo_tz = ZoneInfo('America/Sao_Paulo')
    for log in logs:
        if log.get('TimeStamp'):
            dt_timestamp = None
            if isinstance(log['TimeStamp'], datetime):
                # Se já é datetime, assumir UTC e converter
                if log['TimeStamp'].tzinfo is None:
                    dt_timestamp = log['TimeStamp'].replace(tzinfo=ZoneInfo('UTC')).astimezone(sao_paulo_tz)
                else:
                    dt_timestamp = log['TimeStamp'].astimezone(sao_paulo_tz)
            elif isinstance(log['TimeStamp'], str):
                # Se é string, parsear e converter
                try:
                    dt = datetime.fromisoformat(log['TimeStamp'].replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=ZoneInfo('UTC'))
                    dt_timestamp = dt.astimezone(sao_paulo_tz)
                except (ValueError, AttributeError):
                    pass  # Manter string original se não conseguir parsear
            
            # Converter para string formatada para exibição no template
            if dt_timestamp:
                # Formato brasileiro: DD/MM/YYYY HH:MM:SS
                log['TimeStamp'] = dt_timestamp.strftime('%d/%m/%Y %H:%M:%S')
    
    # Buscar lista de usuários e ações para filtros
    users = get_all_users()
    actions = get_unique_audit_actions()
    
    return render_template('logs_audit.html', 
                         logs=logs, 
                         users=users, 
                         actions=actions,
                         filters={
                             'user_id': user_id,
                             'action': action,
                             'start_date': start_date,
                             'end_date': end_date,
                             'limit': limit
                         })

@app.route('/vehicles')
@admin_required
def vehicles():
    """Tracking de veículos"""
    vehicles = get_vehicles_tracking()
    return render_template('vehicles.html', vehicles=vehicles)

@app.route('/map')
@admin_required
def map_view():
    """Visualização do mapa"""
    players_list = get_all_players()
    player_id_filter = request.args.get('player_id', None)
    return render_template('map.html', players=players_list, player_id_filter=player_id_filter)

# ----------------------
# Deathmatch Views & API
# ----------------------

@app.route('/deathmatch')
@admin_required
def deathmatch():
    """Tela Deathmatch com mapa e overlays das zonas configuradas"""
    return render_template('deathmatch.html')


@app.route('/api/deathmatch/config')
@admin_required
def api_deathmatch_config():
    """Retorna um mapa do deathmatch_config.json com listas de pontos (X,Z).
    Se query param 'regionId' for fornecido, retorna esse; caso contrário, retorna o ativo.
    """
    # Caminho do arquivo de configuração
    cfg_path = os.path.join(
        os.path.dirname(__file__),
        '..', '..', 'mpmissions', 'dayzOffline.chernarusplus', 'admin', 'files', 'deathmatch_config.json'
    )
    cfg_path = os.path.normpath(cfg_path)

    try:
        with open(cfg_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({ 'error': f'Falha ao ler configuração: {str(e)}' }), 500

    if not isinstance(data, list) or len(data) == 0:
        return jsonify({ 'error': 'Configuração inválida ou vazia' }), 404

    # Seleção por query param
    region_id = request.args.get('regionId', type=int)
    selected = None
    if region_id is not None:
        selected = next((item for item in data if int(item.get('RegionId', -1)) == region_id), None)
        if not selected:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
    else:
        selected = next((item for item in data if item.get('Active') is True), None)
        if not selected:
            return jsonify({ 'error': 'Nenhum mapa ativo encontrado' }), 404

    def parse_coord_str(coord_str):
        # Aceita formatos "x, y, z" ou "x y z"; retorna (x, z) como float
        if not coord_str:
            return None
        # Normalizar separadores e espaços
        parts = [p.strip() for p in coord_str.replace(',', ' ').split() if p.strip()]
        if len(parts) < 3:
            return None
        try:
            x = float(parts[0])
            z = float(parts[2])
            return [x, z]
        except:
            return None

    def parse_coord_spawn(coord_str):
        # Retorna [x, y, z] com altura (y) preservada
        if not coord_str:
            return None
        parts = [p.strip() for p in coord_str.replace(',', ' ').split() if p.strip()]
        if len(parts) < 3:
            return None
        try:
            x = float(parts[0])
            y = float(parts[1])
            z = float(parts[2])
            return [x, y, z]
        except:
            return None

    next_entry = None
    for item in data:
        if item.get('NextActiveMap'):
            if not bool(item.get('IsDeleted')):
                next_entry = item
                break
            if not next_entry:
                next_entry = item

    spawn_zones = []
    for s in selected.get('SpawnZones', []) or []:
        pt = parse_coord_spawn(s)
        if pt:
            spawn_zones.append(pt)

    wall_zones = []
    for w in selected.get('WallZones', []) or []:
        pt = parse_coord_str(w)
        if pt:
            wall_zones.append(pt)

    spawns = selected.get('Spawns', {}) or {}
    vehicles = []
    for v in spawns.get('Vehicles', []) or []:
        name = v.get('name')
        coord = parse_coord_str(v.get('coord'))
        if coord:
            vehicles.append({ 'name': name, 'coord': coord })

    result = {
        'regionId': selected.get('RegionId'),
        'region': selected.get('Region'),
        'customMessage': selected.get('CustomMessage'),
        'active': bool(selected.get('Active')),
        'nextActive': bool(selected.get('NextActiveMap')),
        'isDeleted': bool(selected.get('IsDeleted')),
        'valid': (len(selected.get('SpawnZones') or []) >= 1 and len(selected.get('WallZones') or []) >= 3),
        'spawnZones': spawn_zones,
        'wallZones': wall_zones,
        'spawns': {
            'vehicles': vehicles
        },
        'nextMap': None
    }

    if next_entry:
        result['nextMap'] = {
            'regionId': next_entry.get('RegionId'),
            'region': next_entry.get('Region'),
            'isDeleted': bool(next_entry.get('IsDeleted')),
            'active': bool(next_entry.get('Active'))
        }

    return jsonify(result)


@app.route('/api/deathmatch/maps')
@admin_required
def api_deathmatch_maps():
    """Lista todos os mapas do deathmatch com status de ativo."""
    cfg_path = os.path.join(
        os.path.dirname(__file__),
        '..', '..', 'mpmissions', 'dayzOffline.chernarusplus', 'admin', 'files', 'deathmatch_config.json'
    )
    cfg_path = os.path.normpath(cfg_path)

    try:
        with open(cfg_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({ 'error': f'Falha ao ler configuração: {str(e)}' }), 500

    if not isinstance(data, list) or len(data) == 0:
        return jsonify({ 'maps': [] })

    maps = []
    for item in data:
        maps.append({
            'regionId': item.get('RegionId'),
            'region': item.get('Region'),
            'active': bool(item.get('Active')),
            'nextActive': bool(item.get('NextActiveMap')),
            'isDeleted': bool(item.get('IsDeleted')),
            'valid': (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3)
        })

    return jsonify({ 'maps': maps })


def _dm_cfg_path():
    return os.path.normpath(os.path.join(
        os.path.dirname(__file__),
        '..', '..', 'mpmissions', 'dayzOffline.chernarusplus', 'admin', 'files', 'deathmatch_config.json'
    ))


def _dm_read_all():
    with open(_dm_cfg_path(), 'r', encoding='utf-8') as f:
        return json.load(f)


def _dm_write_all(data):
    with open(_dm_cfg_path(), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def _validate_coord(x, z):
    try:
        x = float(x)
        z = float(z)
    except:
        return None
    if x < 0 or z < 0 or x > 15360 or z > 15360:
        return None
    return x, z


@app.route('/api/deathmatch/map/set-active', methods=['POST'])
@admin_required
def api_deathmatch_set_active():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        found = False
        for item in data:
            if int(item.get('RegionId', -1)) == int(region_id):
                # validação: não permitir ativar se excluído ou inválido
                if bool(item.get('IsDeleted')):
                    return jsonify({ 'error': 'Mapa está marcado como excluído' }), 400
                if not (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3):
                    return jsonify({ 'error': 'Mapa inválido: precisa de ao menos 1 Spawn e 3 WallZones' }), 400
                item['Active'] = True
                item['NextActiveMap'] = True
                found = True
            else:
                item['Active'] = False
                item['NextActiveMap'] = False
        if not found:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa definido como ativo com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@app.route('/api/deathmatch/map/set-next', methods=['POST'])
@admin_required
def api_deathmatch_set_next():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        found = False
        for item in data:
            if int(item.get('RegionId', -1)) == int(region_id):
                if bool(item.get('IsDeleted')):
                    return jsonify({ 'error': 'Mapa está marcado como excluído' }), 400
                if not (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3):
                    return jsonify({ 'error': 'Mapa inválido: precisa de ao menos 1 Spawn e 3 WallZones' }), 400
                item['NextActiveMap'] = True
                found = True
            else:
                item['NextActiveMap'] = False
        if not found:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa definido como próximo com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@app.route('/api/deathmatch/map/update-meta', methods=['PATCH'])
@admin_required
def api_deathmatch_update_meta():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    region_name = payload.get('region')
    custom_message = payload.get('customMessage')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        if region_name is not None:
            target['Region'] = str(region_name)
        if custom_message is not None:
            target['CustomMessage'] = str(custom_message)
        _dm_write_all(data)
        return jsonify({ 'message': 'Metadados atualizados com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@app.route('/api/deathmatch/map/create', methods=['POST'])
@admin_required
def api_deathmatch_create():
    payload = request.get_json(silent=True) or {}
    region_name = (payload.get('region') or '').strip()
    custom_message = (payload.get('customMessage') or '').strip()
    provided_id = payload.get('regionId')
    try:
        data = _dm_read_all()
        # Determinar novo RegionId
        existing_ids = [int(item.get('RegionId', 0)) for item in data if item.get('RegionId') is not None]
        next_id = (max(existing_ids) + 1) if existing_ids else 1
        if provided_id is not None:
            provided_id = int(provided_id)
            if provided_id in existing_ids:
                return jsonify({ 'error': f'RegionId {provided_id} já existe' }), 400
            new_id = provided_id
        else:
            new_id = next_id

        new_item = {
            'RegionId': new_id,
            'Active': False,
            'NextActiveMap': False,
            'IsDeleted': True,
            'Region': region_name or f'Região {new_id}',
            'CustomMessage': custom_message or '',
            'SpawnZones': [],
            'WallZones': [],
            'Spawns': { 'Vehicles': [] }
        }
        data.append(new_item)
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa criado com sucesso', 'regionId': new_id })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@app.route('/api/deathmatch/map/set-deleted', methods=['POST'])
@admin_required
def api_deathmatch_set_deleted():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    is_deleted = payload.get('isDeleted')
    if region_id is None or is_deleted is None:
        return jsonify({ 'error': 'regionId e isDeleted são obrigatórios' }), 400
    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        # Se tentar reverter exclusão, validar consistência
        if bool(is_deleted) is False:
            if not (len(target.get('SpawnZones') or []) >= 1 and len(target.get('WallZones') or []) >= 3):
                return jsonify({ 'error': 'Não é possível reverter exclusão: mapa inválido (mín: 1 Spawn e 3 WallZones)' }), 400
        target['IsDeleted'] = bool(is_deleted)
        _dm_write_all(data)
        return jsonify({ 'message': 'Status de exclusão atualizado com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@app.route('/api/deathmatch/map/points', methods=['POST'])
@admin_required
def api_deathmatch_points():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    kind = payload.get('kind')  # 'spawn' | 'wall'
    action = payload.get('action')  # 'add' | 'update' | 'remove'
    index = payload.get('index')
    coord = payload.get('coord') or {}

    if region_id is None or kind not in ['spawn', 'wall'] or action not in ['add', 'update', 'remove']:
        return jsonify({ 'error': 'Parâmetros inválidos' }), 400

    key = 'SpawnZones' if kind == 'spawn' else 'WallZones'

    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404

        points = target.get(key) or []

        def _format_coord_spawn(x, y, z):
            return f"{x:.6f}, {y:.6f}, {z:.6f}"

        def _format_coord_wall(x, z):
            # Wall não usa altura
            return f"{x:.6f}, 0, {z:.6f}"

        if action in ['add', 'update']:
            xz = _validate_coord(coord.get('x'), coord.get('z'))
            if not xz:
                return jsonify({ 'error': 'Coordenadas inválidas. Use 0..15360' }), 400
            x, z = xz

        if action == 'add':
            if kind == 'spawn':
                # altura opcional em coord.h
                y = float(coord.get('h')) if coord.get('h') is not None else 0.0
                points.append(_format_coord_spawn(x, y, z))
            else:
                points.append(_format_coord_wall(x, z))
        elif action == 'update':
            if index is None or index < 0 or index >= len(points):
                return jsonify({ 'error': 'Índice inválido' }), 400
            if kind == 'spawn':
                # preservar altura existente se não for fornecida
                try:
                    existing = points[index]
                    parts = [p.strip() for p in existing.replace(',', ' ').split() if p.strip()]
                    existing_y = float(parts[1]) if len(parts) >= 3 else 0.0
                except:
                    existing_y = 0.0
                y = float(coord.get('h')) if coord.get('h') is not None else existing_y
                points[index] = _format_coord_spawn(x, y, z)
            else:
                points[index] = _format_coord_wall(x, z)
        elif action == 'remove':
            if index is None or index < 0 or index >= len(points):
                return jsonify({ 'error': 'Índice inválido' }), 400
            points.pop(index)

        target[key] = points
        _dm_write_all(data)

        return jsonify({ 'message': 'OK', 'count': len(points) })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500

@app.route('/api/players/positions')
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

@app.route('/api/players/<player_id>/trail')
@admin_required
def api_player_trail(player_id):
    """API com trail de um jogador específico"""
    limit = request.args.get('limit', 100, type=int)
    trail = get_player_trail(player_id, limit)
    
    result = {
        'player_id': player_id,
        'trail': []
    }
    
    for point in trail:
        pixel_coords = dayz_to_pixel(point['CoordX'], point['CoordY'])
        result['trail'].append({
            'player_coord_id': point['PlayerCoordId'],
            'coord_x': point['CoordX'],
            'coord_y': point['CoordY'],
            'coord_z': point['CoordZ'],
            'pixel_coords': pixel_coords,
            'timestamp': point['Data'] or '',
            'has_backup': bool(point.get('HasBackup', 0))
        })
    
    return jsonify(result)

@app.route('/api/players/online/positions')
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

@app.route('/api/vehicles/positions')
@admin_required
def api_vehicles_positions():
    """API com posições atuais de todos os veículos"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    vehicles = get_vehicles_map_positions(include_destroyed=include_destroyed)
    
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
            'is_destroyed': bool(veh.get('IsDestroyed', 0)) if include_destroyed else False,
            'destroyed_at': veh.get('DestroyedAt') if include_destroyed else None,
            'has_moved': bool(veh.get('has_moved', False)),
            'items': items_formatted,
            'attachments': attachments_formatted,
            'health_parts': health_parts
        })
    
    return jsonify(result)

@app.route('/api/vehicles/map-positions')
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
            'last_update': veh['TimeStamp'] or ''
        })
    
    return jsonify(result)

@app.route('/api/vehicles/<vehicle_id>/trail')
@admin_required
def api_vehicle_trail(vehicle_id):
    """API com trail de um veículo específico"""
    limit = request.args.get('limit', 100, type=int)
    trail = get_vehicle_trail(vehicle_id, limit)
    
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

@app.route('/api/containers/positions')
@admin_required
def api_containers_positions():
    """API com posições atuais dos containers com seus items"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    containers = get_containers_last_position(include_destroyed=include_destroyed)
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'containers': []
    }
    
    for container in containers:
        # Converter coordenadas para pixel
        pixel_coords = dayz_to_pixel(container['PositionX'], container['PositionY'])
        
        # Processar items do container
        items = []
        for item in container.get('items', []):
            # Buscar detalhes do item no banco dayz_items.db
            item_details = get_item_details_from_items_db(item['ItemType'])
            
            item_data = {
                'type': item['ItemType'],
                'health': item.get('ItemHealth'),
                'name': item_details['name'] if item_details else item['ItemType'],
                'img': item_details['img'] if item_details else ''
            }
            items.append(item_data)
        
        # Debug: log para containers WoodenCrate
        if 'WoodenCrate' in container.get('ContainerName', ''):
            print(f"DEBUG WoodenCrate {container.get('ContainerId')}: {len(items)} items")
            for item_data in items:
                print(f"  - {item_data['type']}: img={item_data['img']}")
        
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
            'is_destroyed': bool(container.get('IsDestroyed', 0)) if include_destroyed else False,
            'destroyed_at': container.get('DestroyedAt') if include_destroyed else None
        })
    
    return jsonify(result)

@app.route('/api/containers/<container_id>/trail')
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

@app.route('/api/fences/positions')
@admin_required
def api_fences_positions():
    """API com posições atuais dos fences (construções)"""
    include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
    fences = get_fences_last_position(include_destroyed=include_destroyed)
    watchtowers = get_watchtowers_last_position()
    flags = get_flags_last_position()
    
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
        
        result['fences'].append({
            'fence_id': fence['FenceId'],
            'fence_name': fence['FenceName'],
            'coord_x': fence['PositionX'],
            'coord_y': fence['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': fence['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'last_update': fence['TimeStamp'] or '',
            'has_base': (has_base == 1) if has_base is not None else None,
            'lower_panel_built': (lower_panel_built == 1) if lower_panel_built is not None else None,
            'upper_panel_built': (upper_panel_built == 1) if upper_panel_built is not None else None,
            'is_destroyed': bool(fence.get('IsDestroyed', 0)) if include_destroyed else False,
            'destroyed_at': fence.get('DestroyedAt') if include_destroyed else None,
            'has_recent_attack': bool(fence.get('has_recent_attack', False)),
            'structure_type': 'fence',
            'watchtower_details': None,
            'orientation': None
        })

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
        details = {
            'has_base': normalize_watchtower_bool(watchtower.get('HasBase')),
            'level_1_base': normalize_watchtower_bool(watchtower.get('Level1BaseBuilt')),
            'level_2_base': normalize_watchtower_bool(watchtower.get('Level2BaseBuilt')),
            'level_3_base': normalize_watchtower_bool(watchtower.get('Level3BaseBuilt')),
            'level_1_stairs': normalize_watchtower_bool(watchtower.get('Level1StairsBuilt')),
            'level_2_stairs': normalize_watchtower_bool(watchtower.get('Level2StairsBuilt')),
            'has_roof': normalize_watchtower_bool(watchtower.get('HasRoof')),
        }

        result['fences'].append({
            'fence_id': watchtower['WatchtowerId'],
            'fence_name': watchtower.get('WatchtowerName') or 'Watchtower',
            'coord_x': watchtower['PositionX'],
            'coord_y': watchtower['PositionY'],
            'coord_z': watchtower['PositionZ'],
            'pixel_coords': pixel_coords,
            'last_update': watchtower.get('TimeStamp') or '',
            'has_base': details['has_base'],
            'lower_panel_built': details['level_1_base'],
            'upper_panel_built': details['level_2_base'],
            'is_destroyed': False,
            'destroyed_at': None,
            'has_recent_attack': False,
            'structure_type': 'watchtower',
            'watchtower_details': details,
            'orientation': {
                'x': safe_float(watchtower.get('OrientationX')),
                'y': safe_float(watchtower.get('OrientationY')),
                'z': safe_float(watchtower.get('OrientationZ'))
            }
        })

    for flag in flags:
        pixel_coords = dayz_to_pixel(flag['PositionX'], flag['PositionY'])
        flag_details = {
            'has_base': normalize_watchtower_bool(flag.get('HasBase'))
        }

        result['fences'].append({
            'fence_id': flag['FlagId'],
            'fence_name': flag.get('FlagName') or 'Flag Pole',
            'coord_x': flag['PositionX'],
            'coord_y': flag['PositionY'],
            'coord_z': flag['PositionZ'],
            'pixel_coords': pixel_coords,
            'last_update': flag.get('TimeStamp') or '',
            'has_base': flag_details['has_base'],
            'lower_panel_built': None,
            'upper_panel_built': None,
            'is_destroyed': False,
            'destroyed_at': None,
            'has_recent_attack': False,
            'structure_type': 'flag',
            'watchtower_details': None,
            'flag_details': flag_details,
            'orientation': {
                'x': safe_float(flag.get('OrientationX')),
                'y': safe_float(flag.get('OrientationY')),
                'z': safe_float(flag.get('OrientationZ'))
            }
        })
    
    return jsonify(result)

@app.route('/api/fences/<fence_id>/trail')
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

@app.route('/api/watchtowers/<watchtower_id>/trail')
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

@app.route('/api/players/search')
@admin_required
def api_search_players():
    """API para busca de jogadores"""
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    results = search_players(query)
    return jsonify(results)

@app.route('/api/players/<player_id>/restore-backup', methods=['POST'])
@admin_required
@audit_action('RESTORE_BACKUP')
def api_restore_backup(player_id):
    """API para restaurar backup de um jogador"""
    import subprocess
    import os
    import logging
    
    # Configurar logging
    logger = logging.getLogger(__name__)
    
    try:
        # Verificar se jogador está online
        online_players = get_online_players()
        online_ids = [p['PlayerID'] for p in online_players]
        
        if player_id in online_ids:
            logger.warning(f"Tentativa de restaurar/clonar para jogador online: {player_id}")
            return jsonify({
                'success': False,
                'message': 'Não é possível restaurar/clonar para jogador online. Aguarde o jogador desconectar.'
            }), 400
        
        data = request.get_json()
        player_coord_id = data.get('player_coord_id')
        
        logger.debug(f"Restore backup request: player_id={player_id}, player_coord_id={player_coord_id}")
        
        if not player_coord_id:
            return jsonify({'success': False, 'message': 'PlayerCoordId não fornecido'}), 400
        
        # Validar se o backup existe (sem verificar dono, pois pode ser clonagem)
        backup_exists = check_backup_exists_any_player(player_coord_id)
        if not backup_exists:
            logger.warning(f"Backup não encontrado: coord_id={player_coord_id}")
            return jsonify({'success': False, 'message': 'Backup não encontrado'}), 404
        
        # Executar script de restauração
        script_path = config.RESTORE_BACKUP_SCRIPT
        
        # Verificar se script existe
        if not os.path.exists(script_path):
            logger.error(f"Script não encontrado: {script_path}")
            return jsonify({
                'success': False,
                'message': f'Script de restauração não encontrado: {script_path}'
            }), 500
        
        # Verificar se script é executável
        if not os.access(script_path, os.X_OK):
            logger.error(f"Script sem permissão de execução: {script_path}")
            return jsonify({
                'success': False,
                'message': 'Script de restauração sem permissão de execução'
            }), 500
        
        logger.info(f"Executando script: {script_path} {player_id} {player_coord_id}")
        
        result = subprocess.run(
            [script_path, player_id, str(player_coord_id)],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=config.RESTORE_BACKUP_WORKDIR
        )
        
        logger.debug(f"Script return code: {result.returncode}")
        logger.debug(f"Script stdout: {result.stdout}")
        logger.debug(f"Script stderr: {result.stderr}")
        
        if result.returncode == 0:
            return jsonify({
                'success': True,
                'message': 'Backup restaurado com sucesso!',
                'output': result.stdout
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Erro ao restaurar backup',
                'error': result.stderr,
                'stdout': result.stdout
            }), 500
            
    except subprocess.TimeoutExpired:
        logger.error("Timeout ao executar script")
        return jsonify({
            'success': False,
            'message': 'Timeout ao executar script de restauração'
        }), 500
    except Exception as e:
        logger.exception("Erro inesperado ao restaurar backup")
        return jsonify({
            'success': False,
            'message': f'Erro ao executar restauração: {str(e)}'
        }), 500

@app.route('/api/players/<player_id>/teleport', methods=['POST'])
@admin_required
@audit_action('TELEPORT_PLAYER')
def api_teleport_player(player_id):
    """API para teleportar jogador para uma posição usando sistema de comandos DayZ"""
    import logging
    import fcntl
    import os
    
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        coord_x = data.get('coord_x')
        coord_y = data.get('coord_y')
        coord_z = data.get('coord_z')
        
        logger.debug(f"Teleport request: player_id={player_id}, x={coord_x}, y={coord_y}, z={coord_z}")
        
        if coord_x is None or coord_y is None:
            return jsonify({'success': False, 'message': 'Coordenadas não fornecidas'}), 400
        
        # Caminho do arquivo de comandos
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        # Formato aceito pelo servidor: PlayerID teleport CoordX CoordZ CoordY (mantido como antes)
        if coord_z is not None:
            command_line = f"{player_id} teleport {coord_x} {coord_z} {coord_y}\n"
        else:
            command_line = f"{player_id} teleport {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte: {command_line.strip()}")
        
        # Usar file lock para evitar concorrência
        try:
            with open(commands_file, 'a') as f:
                # Adquirir lock exclusivo
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    # Liberar lock
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de teleporte adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de teleporte enviado! O jogador será teleportado em instantes.'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever no arquivo de comandos: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever comando: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao teleportar")
        return jsonify({
            'success': False,
            'message': f'Erro ao executar teleporte: {str(e)}'
        }), 500

@app.route('/api/vehicles/<vehicle_id>/teleport', methods=['POST'])
@admin_required
@audit_action('TELEPORT_VEHICLE')
def api_teleport_vehicle(vehicle_id):
    """API para teleportar veículo para uma posição usando sistema de comandos DayZ"""
    import logging
    import fcntl
    import os
    
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        coord_x = data.get('coord_x')
        coord_y = data.get('coord_y')
        coord_z = data.get('coord_z')
        
        logger.debug(f"Teleport vehicle request: vehicle_id={vehicle_id}, x={coord_x}, y={coord_y}, z={coord_z}")
        
        if coord_x is None or coord_y is None:
            return jsonify({'success': False, 'message': 'Coordenadas não fornecidas'}), 400
        
        # Caminho do arquivo de comandos
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        # Formato aceito pelo servidor: SYSTEM teleportvehicle VehicleId CoordX Altura CoordY
        # Seguindo o mesmo padrão do comando teleport de jogadores
        if coord_z is not None and coord_z != 0:
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} {coord_z} {coord_y}\n"
        else:
            # Se não fornecer altura, usar 0 (será calculada automaticamente pelo servidor)
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte de veículo: {command_line.strip()}")
        
        # Usar file lock para evitar concorrência
        try:
            with open(commands_file, 'a') as f:
                # Adquirir lock exclusivo
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    # Liberar lock
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de teleporte de veículo adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de teleporte enviado! O veículo será teleportado em instantes.'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever comando de teleporte de veículo: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao adicionar comando: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao teleportar veículo: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@app.route('/api/players/<player_id>/send-message', methods=['POST'])
@admin_required
@audit_action('SEND_PRIVATE_MESSAGE')
def api_send_private_message(player_id):
    """API para enviar mensagem privada a um jogador"""
    import logging
    import fcntl
    import os
    
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        
        logger.debug(f"Send message request: player_id={player_id}, message_length={len(message)}")
        
        if not message:
            return jsonify({'success': False, 'message': 'Mensagem não pode estar vazia'}), 400
        
        if not player_id or not player_id.strip():
            return jsonify({'success': False, 'message': 'Player ID inválido'}), 400
        
        # Caminho do arquivo de mensagens privadas
        messages_file = config.MESSAGES_PRIVATE_TO_SEND_FILE
        
        if not os.path.exists(messages_file):
            logger.error(f"Arquivo de mensagens privadas não encontrado: {messages_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de mensagens privadas não encontrado'
            }), 500
        
        # Formato: PlayerId;Mensagem
        message_line = f"{player_id};{message}\n"
        
        logger.info(f"Adicionando mensagem privada: {player_id};{message[:50]}...")
        
        # Usar file lock para evitar concorrência
        try:
            with open(messages_file, 'a') as f:
                # Adquirir lock exclusivo
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(message_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    # Liberar lock
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Mensagem privada adicionada com sucesso")
            return jsonify({
                'success': True,
                'message': 'Mensagem privada enviada com sucesso!'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever no arquivo de mensagens privadas: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever mensagem: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao enviar mensagem privada")
        return jsonify({
            'success': False,
            'message': f'Erro ao enviar mensagem: {str(e)}'
        }), 500

@app.route('/api/players/<player_id>/check-inventory', methods=['POST'])
@admin_required
@audit_action('CHECK_INVENTORY')
def api_check_inventory(player_id):
    """API para verificar inventário de um jogador online"""
    import logging
    import fcntl
    import os
    import uuid
    
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        request_id = data.get('request_id')
        
        if not request_id:
            return jsonify({'success': False, 'message': 'request_id não fornecido'}), 400
        
        logger.debug(f"Check inventory request: player_id={player_id}, request_id={request_id}")
        
        # Verificar se jogador está online
        online_players = get_online_players()
        online_ids = [p['PlayerID'] for p in online_players]
        
        if player_id not in online_ids:
            logger.warning(f"Tentativa de verificar inventário de jogador offline: {player_id}")
            return jsonify({
                'success': False,
                'message': 'Jogador precisa estar online para verificar inventário'
            }), 400
        
        # Caminho do arquivo de comandos
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        # Formato: PlayerID checkinventory PlayerID request_id
        command_line = f"{player_id} checkinventory {player_id} {request_id}\n"
        
        logger.info(f"Adicionando comando de verificação de inventário: {command_line.strip()}")
        
        # Usar file lock para evitar concorrência
        try:
            with open(commands_file, 'a') as f:
                # Adquirir lock exclusivo
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    # Liberar lock
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de verificação de inventário adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever no arquivo de comandos: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever comando: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao verificar inventário")
        return jsonify({
            'success': False,
            'message': f'Erro ao executar verificação de inventário: {str(e)}'
        }), 500

@app.route('/api/commands/results/<request_id>')
@admin_required
def api_command_results(request_id):
    """API para obter resultado de um comando pelo request_id"""
    import logging
    import os
    import json
    
    logger = logging.getLogger(__name__)
    
    try:
        # Caminho do arquivo de resultados
        results_file = config.COMMANDS_RESULTS_FILE
        
        if not os.path.exists(results_file):
            logger.error(f"Arquivo de resultados não encontrado: {results_file}")
            return jsonify({
                'status': 'not_found',
                'message': 'Arquivo de resultados não encontrado'
            }), 404
        
        # Ler arquivo de resultados
        try:
            with open(results_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except IOError as e:
            logger.error(f"Erro ao ler arquivo de resultados: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Erro ao ler arquivo de resultados: {str(e)}'
            }), 500
        
        # Buscar linha com request_id correspondente (última ocorrência)
        result_data = None
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            
            try:
                # Tentar parsear JSON
                data = json.loads(line)
                if data.get('request_id') == request_id:
                    result_data = data
                    break
            except json.JSONDecodeError:
                # Linha não é JSON válido, continuar
                continue
        
        if result_data:
            # Enriquecer dados dos itens com informações do banco (nome e imagem)
            if result_data.get('items'):
                enriched_items = []
                for item in result_data['items']:
                    item_type = item.get('type', '')
                    if item_type:
                        item_details = get_item_details_from_items_db(item_type)
                        enriched_item = {
                            'type': item_type,
                            'quantity': item.get('quantity', 1),
                            'name': item_details['name'] if item_details else item_type,
                            'img': item_details['img'] if item_details else ''
                        }
                        enriched_items.append(enriched_item)
                    else:
                        enriched_items.append(item)
                result_data['items'] = enriched_items
            
            return jsonify({
                'status': 'ready',
                'data': result_data
            })
        else:
            # Resultado ainda não disponível
            return jsonify({
                'status': 'not_found',
                'message': 'Resultado ainda não disponível'
            })
            
    except Exception as e:
        logger.exception("Erro inesperado ao buscar resultado do comando")
        return jsonify({
            'status': 'error',
            'message': f'Erro ao buscar resultado: {str(e)}'
        }), 500

@app.route('/api/messages/global', methods=['POST'])
@admin_required
@audit_action('SEND_GLOBAL_MESSAGE')
def api_send_global_message():
    """API para enviar mensagem global a todos os jogadores online"""
    import logging
    import fcntl
    import os
    
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        
        logger.debug(f"Send global message request: message_length={len(message)}")
        
        if not message:
            return jsonify({'success': False, 'message': 'Mensagem não pode estar vazia'}), 400
        
        # Caminho do arquivo de mensagens globais
        messages_file = config.MESSAGES_TO_SEND_FILE
        
        if not os.path.exists(messages_file):
            logger.error(f"Arquivo de mensagens globais não encontrado: {messages_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de mensagens globais não encontrado'
            }), 500
        
        # Formato: apenas a mensagem, sem Player ID
        message_line = f"{message}\n"
        
        logger.info(f"Adicionando mensagem global: {message[:50]}...")
        
        # Usar file lock para evitar concorrência
        try:
            with open(messages_file, 'a') as f:
                # Adquirir lock exclusivo
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(message_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    # Liberar lock
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Mensagem global adicionada com sucesso")
            return jsonify({
                'success': True,
                'message': 'Mensagem global enviada com sucesso!'
            })
            
        except IOError as e:
            logger.error(f"Erro ao escrever no arquivo de mensagens globais: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever mensagem: {str(e)}'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao enviar mensagem global")
        return jsonify({
            'success': False,
            'message': f'Erro ao enviar mensagem: {str(e)}'
        }), 500

@app.route('/api/events/kills')
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
        # Parse posições (pode retornar None se não puder ser parseada)
        pos_killer = parse_position(kill['PosKiller'])
        pos_killed = parse_position(kill['PosKilled'])
        
        # Processar posição do killer
        if pos_killer:
            # Converter coordenadas para pixel
            pixel_killer = dayz_to_pixel(pos_killer[0], pos_killer[1])
            killer_pos = {
                'x': pos_killer[0],  # Leste-Oeste
                'y': pos_killer[1],  # Sul-Norte (Y do mapa)
                'z': pos_killer[2],  # Altitude
                'pixel_coords': pixel_killer
            }
        else:
            pixel_killer = None
            killer_pos = None
        
        # Processar posição da vítima
        if pos_killed:
            # Converter coordenadas para pixel
            pixel_killed = dayz_to_pixel(pos_killed[0], pos_killed[1])
            victim_pos = {
                'x': pos_killed[0],  # Leste-Oeste
                'y': pos_killed[1],  # Sul-Norte (Y do mapa)
                'z': pos_killed[2],  # Altitude
                'pixel_coords': pixel_killed
            }
        else:
            pixel_killed = None
            victim_pos = None
        
        # Sempre adicionar evento ao resultado (mesmo se posições não puderem ser parseadas)
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

@app.route('/api/events/damages')
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
        # Parse posições (pode retornar None se não puder ser parseada)
        pos_attacker = parse_position(damage['PosAttacker'])
        pos_victim = parse_position(damage['PosVictim'])
        
        # Processar posição do atacante
        if pos_attacker:
            # Converter coordenadas para pixel
            pixel_attacker = dayz_to_pixel(pos_attacker[0], pos_attacker[1])
            attacker_pos = {
                'x': pos_attacker[0],  # Leste-Oeste
                'y': pos_attacker[1],  # Sul-Norte (Y do mapa)
                'z': pos_attacker[2],  # Altitude
                'pixel_coords': pixel_attacker
            }
        else:
            pixel_attacker = None
            attacker_pos = None
        
        # Processar posição da vítima
        if pos_victim:
            # Converter coordenadas para pixel
            pixel_victim = dayz_to_pixel(pos_victim[0], pos_victim[1])
            victim_pos = {
                'x': pos_victim[0],  # Leste-Oeste
                'y': pos_victim[1],  # Sul-Norte (Y do mapa)
                'z': pos_victim[2],  # Altitude
                'pixel_coords': pixel_victim
            }
        else:
            pixel_victim = None
            victim_pos = None
        
        # Sempre adicionar evento ao resultado (mesmo se posições não puderem ser parseadas)
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

# ============================================================================
# API - CHEAT DETECTION
# ============================================================================

@app.route('/api/cheat-detection/scores', methods=['GET'])
@admin_required
def api_cheat_detection_scores():
    """Lista jogadores suspeitos ordenados por pontuação"""
    try:
        limit = int(request.args.get('limit', 100))
        risk_level = request.args.get('risk_level')
        
        scores = get_cheat_detection_scores(limit=limit, risk_level=risk_level if risk_level else None)
        for score in scores:
            score['LastUpdated'] = convert_timestamp_to_br(score.get('LastUpdated'))
            score['BannedAt'] = convert_timestamp_to_br(score.get('BannedAt'))
        
        return jsonify({
            'success': True,
            'scores': scores,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/cheat-detection/player/<player_id>', methods=['GET'])
@admin_required
def api_cheat_detection_player(player_id):
    """Retorna detalhes completos de suspeição de um jogador"""
    try:
        details = get_player_cheat_details(player_id)
        
        if not details:
            return jsonify({'success': False, 'message': 'Jogador não encontrado'}), 404
        
        details['LastUpdated'] = convert_timestamp_to_br(details.get('LastUpdated'))
        details['BannedAt'] = convert_timestamp_to_br(details.get('BannedAt'))
        
        # Parse JSON details dos eventos e ajustar timezone
        for event in details.get('events', []):
            if event.get('Details'):
                try:
                    event['details_parsed'] = json.loads(event['Details'])
                except:
                    event['details_parsed'] = None
            event['TimeStamp'] = convert_timestamp_to_br(event.get('TimeStamp'))
        
        return jsonify({
            'success': True,
            'player': details,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/cheat-detection/events', methods=['GET'])
@admin_required
def api_cheat_detection_events():
    """Lista eventos de detecção de cheaters"""
    try:
        limit = int(request.args.get('limit', 100))
        player_id = request.args.get('player_id')
        event_type = request.args.get('event_type')
        
        events = get_cheat_detection_events(
            player_id=player_id if player_id else None,
            limit=limit,
            event_type=event_type if event_type else None
        )
        
        # Parse JSON details
        for event in events:
            if event.get('Details'):
                try:
                    event['details_parsed'] = json.loads(event['Details'])
                except:
                    event['details_parsed'] = None
            event['TimeStamp'] = convert_timestamp_to_br(event.get('TimeStamp'))
        
        return jsonify({
            'success': True,
            'events': events,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/cheat-detection/review-event/<int:event_id>', methods=['POST'])
@admin_required
def api_cheat_detection_review_event(event_id):
    """Marca um evento como revisado"""
    try:
        data = request.get_json()
        review_result = data.get('review_result')  # 'confirmed' ou 'false_positive'
        reviewed_by = session.get('username', 'Unknown')
        
        if review_result not in ['confirmed', 'false_positive']:
            return jsonify({'success': False, 'message': 'review_result deve ser "confirmed" ou "false_positive"'}), 400
        
        success = review_cheat_event(event_id, reviewed_by, review_result)
        
        if not success:
            return jsonify({'success': False, 'message': 'Evento não encontrado'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Evento marcado como revisado'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/cheat-detection/player/<player_id>/clear', methods=['POST'])
@admin_required
def api_cheat_detection_clear_player(player_id):
    """Remove eventos e reseta score de um jogador"""
    try:
        success = clear_player_cheat_events(player_id)
        if success:
            log_user_action(
                session.get('user_id'),
                session.get('username', 'Unknown'),
                'CLEAR_CHEAT_EVENTS',
                {'player_id': player_id},
                get_client_ip()
            )
            message = 'Eventos e pontuação limpos com sucesso'
        else:
            message = 'Nenhum evento ou pontuação foi encontrado para este jogador'
        
        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/cheat-detection')
@admin_required
def cheat_detection():
    """Página de detecção de cheaters"""
    return render_template('cheat_detection.html')

@app.route('/api/players/online')
@admin_required
def api_online_players():
    """API com jogadores online e suas informações"""
    players = get_online_players()
    return jsonify({'players': players})

@app.route('/api/players/all-with-status')
@admin_required
def api_all_players_with_status():
    """API com todos os jogadores e seus status para atualização automática"""
    players = get_all_players_with_status()
    return jsonify({'players': players})

@app.route('/api/admins/list')
@admin_required
def api_admins_list():
    """API com lista de administradores e suas informações do banco de dados"""
    admins = get_admins_with_player_info()
    return jsonify({'admins': admins})

@app.route('/api/admins/add', methods=['POST'])
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

@app.route('/api/admins/remove', methods=['POST'])
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

@app.route('/api/players/<player_id>/action', methods=['POST'])
@admin_required
@audit_action('PLAYER_ACTION')
def api_player_action(player_id):
    """Executar ação administrativa em jogador"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
    data = request.get_json()
    action = data.get('action')
    
    # Validar ação
    valid_actions = ['heal', 'kill', 'kick', 'godmode', 'ungodmode', 
                     'ghostmode', 'unghostmode', 'desbug', 'getposition']
    
    if action not in valid_actions:
        return jsonify({'success': False, 'message': 'Ação inválida'}), 400
    
    # Formato: PlayerID action
    command_line = f"{player_id} {action}\n"
    
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
            'message': f'Comando {action} enviado com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao executar ação")
        return jsonify({
            'success': False,
            'message': f'Erro ao executar ação: {str(e)}'
        }), 500

@app.route('/spawning')
@admin_required
def spawning():
    """Página de spawning de itens e veículos"""
    return render_template('spawning.html')

@app.route('/api/items/weapons')
@admin_required
def api_weapons():
    """API para buscar armas"""
    search = request.args.get('search', '')
    weapons = get_weapons(search)
    return jsonify({'weapons': weapons})

@app.route('/api/items/items')
@admin_required
def api_items():
    """API para buscar itens"""
    type_id = request.args.get('type_id', type=int)
    search = request.args.get('search', '')
    items = get_items(type_id, search)
    return jsonify({'items': items})

@app.route('/api/items/types')
@admin_required
def api_item_types():
    """API para buscar tipos de itens"""
    types = get_item_types()
    return jsonify({'types': types})


@app.route('/api/vehicle-limits', methods=['GET'])
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
        app.logger.exception("Erro ao carregar limites de veículos: %s", e)
        return jsonify({'success': False, 'message': 'Erro ao carregar limites de veículos'}), 500

@app.route('/api/spawn/item', methods=['POST'])
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

@app.route('/api/spawn/vehicle', methods=['POST'])
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

@app.route('/api/spawn/item-at-coords', methods=['POST'])
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

@app.route('/api/spawn/vehicle-at-coords', methods=['POST'])
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

@app.route('/api/items/explosives')
@admin_required
def api_explosives():
    search = request.args.get('search', '')
    limit = int(request.args.get('limit', 50))
    explosives = get_explosives(search, limit)
    return jsonify({'explosives': explosives})

@app.route('/api/items/ammunitions')
@admin_required
def api_ammunitions():
    search = request.args.get('search', '')
    caliber_id = request.args.get('caliber_id', type=int)
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    ammunitions = get_ammunitions(search, caliber_id, weapon_id, limit)
    return jsonify({'ammunitions': ammunitions})

@app.route('/api/items/calibers')
@admin_required
def api_calibers():
    calibers = get_calibers()
    return jsonify({'calibers': calibers})

@app.route('/api/items/magazines')
@admin_required
def api_magazines():
    search = request.args.get('search', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    magazines = get_magazines(search, weapon_id, limit)
    return jsonify({'magazines': magazines})

@app.route('/api/items/attachments')
@admin_required
def api_attachments():
    search = request.args.get('search', '')
    type_filter = request.args.get('type', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    attachments = get_attachments(search, type_filter if type_filter else None, weapon_id, limit)
    return jsonify({'attachments': attachments})

@app.route('/api/items/attachment-types')
@admin_required
def api_attachment_types():
    types = get_attachment_types()
    return jsonify({'types': types})

# Endpoints "get all" para kits (sem limite)
@app.route('/api/items/all-explosives')
@admin_required
def api_all_explosives():
    explosives = get_all_explosives()
    return jsonify({'explosives': explosives})

@app.route('/api/items/all-ammunitions')
@admin_required
def api_all_ammunitions():
    ammunitions = get_all_ammunitions()
    return jsonify({'ammunitions': ammunitions})

@app.route('/api/items/all-magazines')
@admin_required
def api_all_magazines():
    magazines = get_all_magazines()
    return jsonify({'magazines': magazines})

@app.route('/api/items/all-attachments')
@admin_required
def api_all_attachments():
    attachments = get_all_attachments()
    return jsonify({'attachments': attachments})

@app.route('/api/weapons/<int:weapon_id>/compatible-items')
@admin_required
def api_weapon_compatible_items(weapon_id):
    items = get_weapon_compatible_items(weapon_id)
    return jsonify(items)

@app.route('/api/spawn/loadout', methods=['POST'])
@admin_required
@audit_action('SPAWN_LOADOUT')
def api_spawn_loadout():
    """Spawnar arma com múltiplos acessórios"""
    import fcntl
    import os
    import logging
    
    logger = logging.getLogger(__name__)
    
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

# ============================================================================
# ROTAS DE GERENCIAMENTO DE ITENS (CRUD)
# ============================================================================

@app.route('/items-manage')
@admin_required
def items_manage():
    """Página de gerenciamento do banco de dados de itens"""
    return render_template('items_manage.html')

# === WEAPONS ===
@app.route('/api/manage/weapons', methods=['GET'])
@login_required
def api_manage_weapons_list():
    weapons = get_weapons_with_calibers(limit=1000)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/weapons/<int:weapon_id>', methods=['GET'])
@login_required
def api_manage_weapon_detail(weapon_id):
    weapon = get_weapon_by_id(weapon_id)
    if not weapon:
        return jsonify({'error': 'Arma não encontrada'}), 404
    relationships = get_weapon_relationships(weapon_id)
    return jsonify({'weapon': weapon, 'relationships': relationships})

@app.route('/api/manage/weapons', methods=['POST'])
@admin_required
@audit_action('CREATE_WEAPON')
def api_manage_weapon_create():
    data = request.get_json()
    try:
        weapon_id = create_weapon(data)
        return jsonify({'success': True, 'id': weapon_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_WEAPON')
def api_manage_weapon_update(weapon_id):
    data = request.get_json()
    try:
        success = update_weapon(weapon_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_WEAPON')
def api_manage_weapon_delete(weapon_id):
    try:
        success = delete_weapon(weapon_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>/relationships', methods=['PUT'])
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
@app.route('/api/manage/calibers', methods=['GET'])
@admin_required
def api_manage_calibers_list():
    calibers = get_calibers()
    return jsonify({'calibers': calibers})

@app.route('/api/manage/calibers-list', methods=['GET'])
@login_required
def api_manage_calibers_list_simple():
    """Retorna apenas id e name dos calibres para filtros"""
    calibers = get_all_calibers()
    return jsonify({'calibers': calibers})

@app.route('/api/manage/calibers/<int:caliber_id>', methods=['GET'])
@admin_required
def api_manage_caliber_detail(caliber_id):
    caliber = get_caliber_by_id(caliber_id)
    if not caliber:
        return jsonify({'error': 'Calibre não encontrado'}), 404
    return jsonify({'caliber': caliber})

@app.route('/api/manage/calibers', methods=['POST'])
@admin_required
@audit_action('CREATE_CALIBER')
def api_manage_caliber_create():
    data = request.get_json()
    try:
        caliber_id = create_caliber(data)
        return jsonify({'success': True, 'id': caliber_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/calibers/<int:caliber_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_CALIBER')
def api_manage_caliber_update(caliber_id):
    data = request.get_json()
    try:
        success = update_caliber(caliber_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/calibers/<int:caliber_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_CALIBER')
def api_manage_caliber_delete(caliber_id):
    try:
        success = delete_caliber(caliber_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === AMMUNITIONS ===
@app.route('/api/manage/ammunitions', methods=['GET'])
@login_required
def api_manage_ammunitions_list():
    ammunitions = get_ammunitions(limit=1000)
    return jsonify({'ammunitions': ammunitions})

@app.route('/api/manage/ammunitions/<int:ammo_id>', methods=['GET'])
@admin_required
def api_manage_ammunition_detail(ammo_id):
    ammunition = get_ammunition_by_id(ammo_id)
    if not ammunition:
        return jsonify({'error': 'Munição não encontrada'}), 404
    return jsonify({'ammunition': ammunition})

@app.route('/api/manage/ammunitions', methods=['POST'])
@admin_required
@audit_action('CREATE_AMMUNITION')
def api_manage_ammunition_create():
    data = request.get_json()
    try:
        ammo_id = create_ammunition(data)
        return jsonify({'success': True, 'id': ammo_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/ammunitions/<int:ammo_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_AMMUNITION')
def api_manage_ammunition_update(ammo_id):
    data = request.get_json()
    try:
        success = update_ammunition(ammo_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/ammunitions/<int:ammo_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_AMMUNITION')
def api_manage_ammunition_delete(ammo_id):
    try:
        success = delete_ammunition(ammo_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === MAGAZINES ===
@app.route('/api/manage/magazines', methods=['GET'])
@login_required
def api_manage_magazines_list():
    magazines = get_magazines(limit=1000)
    return jsonify({'magazines': magazines})

@app.route('/api/manage/magazines/<int:mag_id>', methods=['GET'])
@admin_required
def api_manage_magazine_detail(mag_id):
    magazine = get_magazine_by_id(mag_id)
    if not magazine:
        return jsonify({'error': 'Magazine não encontrado'}), 404
    return jsonify({'magazine': magazine})

@app.route('/api/manage/magazines', methods=['POST'])
@admin_required
@audit_action('CREATE_MAGAZINE')
def api_manage_magazine_create():
    data = request.get_json()
    try:
        mag_id = create_magazine(data)
        return jsonify({'success': True, 'id': mag_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/magazines/<int:mag_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_MAGAZINE')
def api_manage_magazine_update(mag_id):
    data = request.get_json()
    try:
        success = update_magazine(mag_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/magazines/<int:mag_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_MAGAZINE')
def api_manage_magazine_delete(mag_id):
    try:
        success = delete_magazine(mag_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ATTACHMENTS ===
@app.route('/api/manage/attachments', methods=['GET'])
@login_required
def api_manage_attachments_list():
    attachments = get_attachments(limit=1000)
    return jsonify({'attachments': attachments})

@app.route('/api/manage/attachments/<int:att_id>', methods=['GET'])
@admin_required
def api_manage_attachment_detail(att_id):
    attachment = get_attachment_by_id(att_id)
    if not attachment:
        return jsonify({'error': 'Attachment não encontrado'}), 404
    return jsonify({'attachment': attachment})

@app.route('/api/manage/attachments', methods=['POST'])
@admin_required
@audit_action('CREATE_ATTACHMENT')
def api_manage_attachment_create():
    data = request.get_json()
    try:
        att_id = create_attachment(data)
        return jsonify({'success': True, 'id': att_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/attachments/<int:att_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ATTACHMENT')
def api_manage_attachment_update(att_id):
    data = request.get_json()
    try:
        success = update_attachment(att_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/attachments/<int:att_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ATTACHMENT')
def api_manage_attachment_delete(att_id):
    try:
        success = delete_attachment(att_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === EXPLOSIVES ===
@app.route('/api/manage/explosives', methods=['GET'])
@login_required
def api_manage_explosives_list():
    explosives = get_explosives(limit=1000)
    return jsonify({'explosives': explosives})

@app.route('/api/manage/explosives/<int:exp_id>', methods=['GET'])
@admin_required
def api_manage_explosive_detail(exp_id):
    explosive = get_explosive_by_id(exp_id)
    if not explosive:
        return jsonify({'error': 'Explosivo não encontrado'}), 404
    return jsonify({'explosive': explosive})

@app.route('/api/manage/explosives', methods=['POST'])
@admin_required
@audit_action('CREATE_EXPLOSIVE')
def api_manage_explosive_create():
    data = request.get_json()
    try:
        exp_id = create_explosive(data)
        return jsonify({'success': True, 'id': exp_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/explosives/<int:exp_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_EXPLOSIVE')
def api_manage_explosive_update(exp_id):
    data = request.get_json()
    try:
        success = update_explosive(exp_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/explosives/<int:exp_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_EXPLOSIVE')
def api_manage_explosive_delete(exp_id):
    try:
        success = delete_explosive(exp_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ITEM_TYPES ===
@app.route('/api/manage/item-types', methods=['GET'])
@admin_required
def api_manage_item_types_list():
    types = get_item_types()
    return jsonify({'types': types})

@app.route('/api/manage/item-types/<int:type_id>', methods=['GET'])
@admin_required
def api_manage_item_type_detail(type_id):
    item_type = get_item_type_by_id(type_id)
    if not item_type:
        return jsonify({'error': 'Tipo de item não encontrado'}), 404
    return jsonify({'type': item_type})

@app.route('/api/manage/item-types', methods=['POST'])
@admin_required
@audit_action('CREATE_ITEM_TYPE')
def api_manage_item_type_create():
    data = request.get_json()
    try:
        type_id = create_item_type(data)
        return jsonify({'success': True, 'id': type_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/item-types/<int:type_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ITEM_TYPE')
def api_manage_item_type_update(type_id):
    data = request.get_json()
    try:
        success = update_item_type(type_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/item-types/<int:type_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ITEM_TYPE')
def api_manage_item_type_delete(type_id):
    try:
        success = delete_item_type(type_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ITEMS ===
@app.route('/api/manage/items', methods=['GET'])
@login_required
def api_manage_items_list():
    items = get_items(limit=1000)
    return jsonify({'items': items})

@app.route('/api/manage/items/<int:item_id>', methods=['GET'])
@admin_required
def api_manage_item_detail(item_id):
    item = get_item_by_id(item_id)
    if not item:
        return jsonify({'error': 'Item não encontrado'}), 404
    compatibility = get_item_compatibility(item_id)
    return jsonify({'item': item, 'compatibility': compatibility})

@app.route('/api/manage/items', methods=['POST'])
@admin_required
@audit_action('CREATE_ITEM')
def api_manage_item_create():
    data = request.get_json()
    try:
        item_id = create_item(data)
        return jsonify({'success': True, 'id': item_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_ITEM')
def api_manage_item_update(item_id):
    data = request.get_json()
    try:
        success = update_item(item_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_ITEM')
def api_manage_item_delete(item_id):
    try:
        success = delete_item(item_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>/compatibility', methods=['GET'])
@login_required
def api_manage_item_compatibility_get(item_id):
    """Retorna compatibilidade de um item"""
    compatibility = get_item_compatibility(item_id)
    return jsonify({'compatibility': compatibility})

@app.route('/api/manage/items/<int:item_id>/compatibility', methods=['PUT'])
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
@app.route('/api/validate/item-type/<name_type>')
@admin_required
def api_validate_item_type(name_type):
    """Valida se o item type existe no types.xml"""
    is_valid = validate_item_type(name_type)
    return jsonify({'valid': is_valid})

@app.errorhandler(404)
def not_found(e):
    return render_template('error.html', message='Página não encontrada'), 404

# === RELACIONAMENTOS INVERSOS ===
@app.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['GET'])
@admin_required
def api_manage_magazine_weapons_get(mag_id):
    weapons = get_magazine_weapons(mag_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['PUT'])
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

@app.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['GET'])
@admin_required
def api_manage_ammunition_weapons_get(ammo_id):
    weapons = get_ammunition_weapons(ammo_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['PUT'])
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

@app.route('/api/manage/attachments/<int:att_id>/weapons', methods=['GET'])
@admin_required
def api_manage_attachment_weapons_get(att_id):
    weapons = get_attachment_weapons(att_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/attachments/<int:att_id>/weapons', methods=['PUT'])
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

@app.route('/kits-manage')
@admin_required
def kits_manage():
    """Página de gerenciamento de kits de armas e loot"""
    return render_template('kits_manage.html')

@app.route('/users-manage')
@admin_required
def users_manage():
    """Página de gerenciamento de usuários"""
    return render_template('users_manage.html')

# === WEAPON KITS ===
@app.route('/api/kits/weapons', methods=['GET'])
@admin_required
def api_weapon_kits_list():
    kits = get_weapon_kits()
    return jsonify({'kits': kits})

@app.route('/api/kits/weapons/<int:kit_id>', methods=['GET'])
@admin_required
def api_weapon_kit_detail(kit_id):
    kit = get_weapon_kit_by_id(kit_id)
    if not kit:
        return jsonify({'error': 'Kit de arma não encontrado'}), 404
    return jsonify({'kit': kit})

@app.route('/api/kits/weapons', methods=['POST'])
@admin_required
@audit_action('CREATE_WEAPON_KIT')
def api_weapon_kit_create():
    data = request.get_json()
    try:
        kit_id = create_weapon_kit(data)
        return jsonify({'success': True, 'id': kit_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/kits/weapons/<int:kit_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_WEAPON_KIT')
def api_weapon_kit_update(kit_id):
    data = request.get_json()
    try:
        success = update_weapon_kit(kit_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/kits/weapons/<int:kit_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_WEAPON_KIT')
def api_weapon_kit_delete(kit_id):
    try:
        success = delete_weapon_kit(kit_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === LOOT KITS ===
@app.route('/api/kits/loot', methods=['GET'])
@admin_required
def api_loot_kits_list():
    kits = get_loot_kits()
    return jsonify({'kits': kits})

@app.route('/api/kits/loot/<int:kit_id>', methods=['GET'])
@admin_required
def api_loot_kit_detail(kit_id):
    kit = get_loot_kit_by_id(kit_id)
    if not kit:
        return jsonify({'error': 'Kit de loot não encontrado'}), 404
    return jsonify({'kit': kit})

@app.route('/api/kits/loot', methods=['POST'])
@admin_required
@audit_action('CREATE_LOOT_KIT')
def api_loot_kit_create():
    data = request.get_json()
    try:
        kit_id = create_loot_kit(data)
        return jsonify({'success': True, 'id': kit_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/kits/loot/<int:kit_id>', methods=['PUT'])
@admin_required
@audit_action('UPDATE_LOOT_KIT')
def api_loot_kit_update(kit_id):
    data = request.get_json()
    try:
        success = update_loot_kit(kit_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/kits/loot/<int:kit_id>', methods=['DELETE'])
@admin_required
@audit_action('DELETE_LOOT_KIT')
def api_loot_kit_delete(kit_id):
    try:
        success = delete_loot_kit(kit_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/kits/storage-containers', methods=['GET'])
@admin_required
def api_storage_containers():
    containers = get_storage_containers()
    return jsonify({'containers': containers})

@app.route('/api/kits/loot/<int:kit_id>/space', methods=['GET'])
@admin_required
def api_loot_kit_space(kit_id):
    space_used = calculate_loot_kit_space(kit_id)
    return jsonify({'space_used': space_used})

@app.route('/api/kits/loot/validate-space', methods=['POST'])
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

@app.route('/api/spawn/weapon-kit', methods=['POST'])
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
        
        # Escrever no arquivo com file locking
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
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

@app.route('/api/spawn/loot-kit', methods=['POST'])
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
        
        # Escrever no arquivo com file locking
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
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

@app.route('/api/spawn/weapon-kit-coords', methods=['POST'])
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
        
        # Escrever no arquivo com file locking
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Weapon kit {kit_id} spawnado em coordenadas ({coord_x}, {coord_y})")
        return jsonify({'success': True, 'message': 'Weapon kit spawnado com sucesso!'})
    except Exception as e:
        logger.exception("Erro ao spawnar weapon kit em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500

@app.route('/api/spawn/loot-kit-coords', methods=['POST'])
@admin_required
@audit_action('SPAWN_LOOT_KIT_COORDS')
def api_spawn_loot_kit_coords():
    """Spawnar kit de loot em coordenadas do mapa usando createcontainer"""
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
        # Buscar slots de cada item e ordenar
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
        
        # Escrever no arquivo
        with open(config.COMMANDS_FILE, 'a') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(command)
                f.flush()
                os.fsync(f.fileno())
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        
        logger.info(f"Kit de loot {kit_id} spawnado em coordenadas ({coord_x}, {coord_y})")
        return jsonify({'success': True, 'message': 'Kit de loot spawnado com sucesso!'})
    except Exception as e:
        logger.exception("Erro ao spawnar kit de loot em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar kit: {str(e)}'
        }), 500

# ============================================================================
# ROTAS DE GESTÃO DE USUÁRIOS
# ============================================================================

@app.route('/api/manage/users', methods=['GET'])
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

@app.route('/api/manage/admins', methods=['GET'])
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

@app.route('/api/manage/admins/<int:admin_id>', methods=['GET'])
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

@app.route('/api/manage/admins', methods=['POST'])
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

@app.route('/api/manage/admins/<int:admin_id>', methods=['PUT'])
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

@app.route('/api/manage/admins/<int:admin_id>', methods=['DELETE'])
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

# ============================================================================
# ROTAS DE LOADOUTS
# ============================================================================

@app.route('/loadouts')
@admin_required
def loadouts():
    """Tela principal de gerenciamento de loadouts"""
    return render_template('loadouts.html')

@app.route('/loadouts/custom/new')
@admin_required
def loadout_custom_new():
    """Página de criação de novo loadout custom"""
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='custom')

@app.route('/loadouts/custom/<int:loadout_id>/edit')
@admin_required
def loadout_custom_edit(loadout_id):
    """Página de edição de loadout custom"""
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='custom')

@app.route('/loadouts/players/<player_id>/new')
@admin_required
def loadout_player_new(player_id):
    """Página de criação de novo loadout para jogador"""
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='player', player_id=player_id)

@app.route('/loadouts/players/<player_id>/<int:loadout_id>/edit')
@admin_required
def loadout_player_edit(player_id, loadout_id):
    """Página de edição de loadout de jogador"""
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='player', player_id=player_id)

@app.route('/my-loadout')
@login_required
def my_loadout():
    """Tela de gerenciamento de loadouts do usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    return render_template('my_loadout.html', player_id=player_id)

@app.route('/my-loadout/new')
@login_required
def my_loadout_new():
    """Página de criação de novo loadout para o usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='player', player_id=player_id)

@app.route('/my-loadout/<int:loadout_id>/edit')
@login_required
def my_loadout_edit(loadout_id):
    """Página de edição de loadout do usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    
    # Validar que o loadout pertence ao usuário logado
    from database import get_loadouts_by_player
    loadouts = get_loadouts_by_player(player_id)
    loadout = None
    for l in loadouts:
        if l['loadout_id'] == loadout_id:
            loadout = l
            break
    
    if not loadout:
        return render_template('error.html', message='Loadout não encontrado ou você não tem permissão para editá-lo.'), 404
    
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='player', player_id=player_id)

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

@app.route('/api/loadouts/custom', methods=['GET'])
@admin_required
def api_loadouts_custom_list():
    """Lista todos os loadouts custom"""
    try:
        loadouts = get_loadouts_custom()
        return jsonify({'success': True, 'loadouts': loadouts})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/custom/<int:loadout_id>', methods=['GET'])
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

@app.route('/api/loadouts/custom', methods=['POST'])
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

@app.route('/api/loadouts/custom/<int:loadout_id>', methods=['PUT'])
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

@app.route('/api/loadouts/custom/<int:loadout_id>', methods=['DELETE'])
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

@app.route('/api/loadouts/players/list', methods=['GET'])
@admin_required
def api_loadouts_players_list_all():
    """Lista todos os jogadores da tabela players_database"""
    try:
        players = get_all_players()
        return jsonify({'success': True, 'players': players})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/players', methods=['GET'])
@admin_required
def api_loadouts_players_list():
    """Lista jogadores que possuem loadouts"""
    try:
        players = get_players_with_loadouts()
        return jsonify({'success': True, 'players': players})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/players/<player_id>', methods=['GET'])
@admin_required
def api_loadouts_players_get(player_id):
    """Obtém loadouts de um jogador"""
    try:
        loadouts = get_loadouts_by_player(player_id)
        return jsonify({'success': True, 'loadouts': loadouts})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/players/<player_id>', methods=['POST'])
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

@app.route('/api/loadouts/players/<player_id>/<int:loadout_id>', methods=['PUT'])
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

@app.route('/api/loadouts/my-loadout', methods=['GET'])
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

@app.route('/api/loadouts/my-loadout', methods=['POST'])
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

@app.route('/api/loadouts/my-loadout/<int:db_id>', methods=['PUT'])
@login_required
def api_my_loadout_update(db_id):
    """Atualiza um loadout do usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        from database import get_loadout_player_by_id
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

@app.route('/api/loadouts/my-loadout/<int:db_id>', methods=['DELETE'])
@login_required
def api_my_loadout_delete(db_id):
    """Deleta um loadout do usuário logado"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        from database import get_loadout_player_by_id
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

@app.route('/api/loadouts/my-loadout/<int:db_id>/set-active', methods=['POST'])
@login_required
def api_my_loadout_set_active(db_id):
    """Define um loadout como ativo (desativa todos os outros)"""
    try:
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'success': False, 'message': 'Você precisa ter um player_id associado à sua conta'}), 403
        
        # Validar que o loadout pertence ao usuário logado
        from database import get_loadout_player_by_id
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

@app.route('/api/loadouts/players/<player_id>/<int:loadout_id>', methods=['DELETE'])
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
# API - LOADOUT RULES (Gerenciamento de Regras)
# ============================================================================

@app.route('/loadout-rules')
@admin_required
def loadout_rules():
    """Página de gerenciamento de regras para loadouts de players"""
    return render_template('loadout_rules.html')

# === WEAPONS ===
@app.route('/api/loadout-rules/weapons', methods=['GET'])
@admin_required
def api_loadout_rules_weapons_list():
    """Lista armas com status de blacklist e max_quantity"""
    try:
        weapons = get_loadout_rules_weapons()
        return jsonify({'success': True, 'weapons': weapons})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/weapons/<int:weapon_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/weapons/<int:weapon_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_WEAPON_LOADOUT')
def api_loadout_rules_weapons_unban(weapon_id):
    """Remove ban de uma arma para loadouts de players"""
    try:
        success = unban_weapon_for_loadout(weapon_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/weapons/<int:weapon_id>/max-quantity', methods=['PUT'])
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
@app.route('/api/loadout-rules/magazines', methods=['GET'])
@admin_required
def api_loadout_rules_magazines_list():
    """Lista magazines com status de blacklist e max_quantity"""
    try:
        magazines = get_loadout_rules_magazines()
        return jsonify({'success': True, 'magazines': magazines})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/magazines/<int:magazine_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/magazines/<int:magazine_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_MAGAZINE_LOADOUT')
def api_loadout_rules_magazines_unban(magazine_id):
    """Remove ban de um magazine para loadouts de players"""
    try:
        success = unban_magazine_for_loadout(magazine_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/magazines/<int:magazine_id>/max-quantity', methods=['PUT'])
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
@app.route('/api/loadout-rules/ammunitions', methods=['GET'])
@admin_required
def api_loadout_rules_ammunitions_list():
    """Lista ammunitions com status de blacklist e max_quantity"""
    try:
        ammunitions = get_loadout_rules_ammunitions()
        return jsonify({'success': True, 'ammunitions': ammunitions})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/ammunitions/<int:ammunition_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/ammunitions/<int:ammunition_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_AMMUNITION_LOADOUT')
def api_loadout_rules_ammunitions_unban(ammunition_id):
    """Remove ban de uma ammunition para loadouts de players"""
    try:
        success = unban_ammunition_for_loadout(ammunition_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/ammunitions/<int:ammunition_id>/max-quantity', methods=['PUT'])
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
@app.route('/api/loadout-rules/attachments', methods=['GET'])
@admin_required
def api_loadout_rules_attachments_list():
    """Lista attachments com status de blacklist e max_quantity"""
    try:
        attachments = get_loadout_rules_attachments()
        return jsonify({'success': True, 'attachments': attachments})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/attachments/<int:attachment_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/attachments/<int:attachment_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_ATTACHMENT_LOADOUT')
def api_loadout_rules_attachments_unban(attachment_id):
    """Remove ban de um attachment para loadouts de players"""
    try:
        success = unban_attachment_for_loadout(attachment_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/attachments/<int:attachment_id>/max-quantity', methods=['PUT'])
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
@app.route('/api/loadout-rules/explosives', methods=['GET'])
@admin_required
def api_loadout_rules_explosives_list():
    """Lista explosives com status de blacklist e max_quantity"""
    try:
        explosives = get_loadout_rules_explosives()
        return jsonify({'success': True, 'explosives': explosives})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/explosives/<int:explosive_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/explosives/<int:explosive_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_EXPLOSIVE_LOADOUT')
def api_loadout_rules_explosives_unban(explosive_id):
    """Remove ban de um explosive para loadouts de players"""
    try:
        success = unban_explosive_for_loadout(explosive_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/explosives/<int:explosive_id>/max-quantity', methods=['PUT'])
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

@app.route('/api/loadout-rules/explosives-global', methods=['GET'])
@admin_required
def api_loadout_rules_explosives_global_get():
    """Retorna limite global de quantidade total de explosivos"""
    try:
        limit = get_explosives_global_limit()
        return jsonify({'success': True, 'limit': limit})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/explosives-global', methods=['PUT'])
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
@app.route('/api/loadout-rules/items', methods=['GET'])
@admin_required
def api_loadout_rules_items_list():
    """Lista items com status de blacklist e max_quantity"""
    try:
        items = get_loadout_rules_items()
        return jsonify({'success': True, 'items': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/items/<int:item_id>/ban', methods=['POST'])
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

@app.route('/api/loadout-rules/items/<int:item_id>', methods=['DELETE'])
@admin_required
@audit_action('UNBAN_ITEM_LOADOUT')
def api_loadout_rules_items_unban(item_id):
    """Remove ban de um item para loadouts de players"""
    try:
        success = unban_item_for_loadout(item_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/items/<int:item_id>/max-quantity', methods=['PUT'])
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
@app.route('/api/loadout-rules/item-types', methods=['GET'])
@admin_required
def api_loadout_rules_item_types_list():
    """Lista tipos de itens com status de blacklist"""
    try:
        item_types = get_loadout_rules_item_types()
        return jsonify({'success': True, 'item_types': item_types})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/item-types/<int:item_type_id>/ban', methods=['POST'])
@admin_required
@audit_action('BAN_ITEM_TYPE_LOADOUT')
def api_loadout_rules_item_types_ban(item_type_id):
    """Bane um tipo de item para loadouts de players"""
    try:
        success = ban_item_type_for_loadout(item_type_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadout-rules/item-types/<int:item_type_id>', methods=['DELETE'])
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

@app.route('/api/loadouts/players/weapons', methods=['GET'])
@login_required
def api_loadouts_players_weapons():
    """Lista apenas armas permitidas para loadouts de players"""
    try:
        search = request.args.get('search', '')
        weapons = get_weapons_for_player_loadout(search)
        return jsonify({'success': True, 'weapons': weapons})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/players/magazines', methods=['GET'])
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

@app.route('/api/loadouts/players/ammunitions', methods=['GET'])
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

@app.route('/api/loadouts/players/attachments', methods=['GET'])
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

@app.route('/api/loadouts/players/explosives', methods=['GET'])
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

@app.route('/api/loadouts/players/items', methods=['GET'])
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

@app.route('/api/loadouts/players/item-types', methods=['GET'])
@login_required
def api_loadouts_players_item_types():
    """Lista apenas tipos de itens permitidos (não banidos) para loadouts de players"""
    try:
        item_types = get_allowed_item_types_for_loadout()
        return jsonify({'success': True, 'types': item_types})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/loadouts/players/explosives-global', methods=['GET'])
@login_required
def api_loadouts_players_explosives_global():
    """Retorna limite global de quantidade total de explosivos"""
    try:
        limit = get_explosives_global_limit()
        return jsonify({'success': True, 'limit': limit})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.errorhandler(500)
def internal_error(e):
    return render_template('error.html', message='Erro interno do servidor'), 500

if __name__ == '__main__':
    print(f"\n🚀 Iniciando servidor DayZ Admin Interface...")
    print(f"📊 Banco de jogadores: {config.DB_PLAYERS}")
    print(f"📝 Banco de logs: {config.DB_LOGS}")
    print(f"🌐 Acesse: http://{config.HOST}:{config.PORT}")
    print(f"👤 Usuário: {config.ADMIN_USERNAME}")
    print(f"\n⚠️  Pressione Ctrl+C para parar o servidor\n")
    
    # Garantir que loadouts protegidos existam
    ensure_protected_loadouts_exist()
    print("✅ Loadouts protegidos verificados")
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
