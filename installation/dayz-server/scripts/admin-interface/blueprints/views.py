"""
Blueprint de Views
Rotas de renderização de templates HTML
"""
from flask import Blueprint, render_template, request, session, url_for, Response, stream_with_context
from zoneinfo import ZoneInfo
from datetime import datetime
import config
from database import (
    get_all_players, get_all_players_with_status, get_player_by_id,
    get_player_coords, get_player_coords_backup,
    get_logs_adm, get_logs_custom,
    get_user_audit_logs, get_all_users, get_unique_audit_actions,
    get_loadouts_by_player
)
from blueprints.auth import admin_required, login_required
from blueprints.helpers import stream_log_file

views_bp = Blueprint('views', __name__)


@views_bp.route('/')
@admin_required
def index():
    """Lista de jogadores - Página principal"""
    players_list = get_all_players_with_status()
    return render_template('players.html', players=players_list)


@views_bp.route('/players')
@admin_required
def players():
    """Lista de jogadores"""
    players_list = get_all_players_with_status()
    return render_template('players.html', players=players_list)


@views_bp.route('/player/<player_id>/coords')
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


@views_bp.route('/logs/adm')
@admin_required
def logs_adm():
    """Logs DayZServer.ADM"""
    logs = get_logs_adm()
    return render_template('logs_adm.html', logs=logs)


@views_bp.route('/logs/custom')
@admin_required
def logs_custom():
    """Logs customizados"""
    logs = get_logs_custom()
    return render_template('logs_custom.html', logs=logs)


@views_bp.route('/logs/init')
@admin_required
def logs_init():
    """Logs init.log em tempo real"""
    return render_template(
        'logs_init.html',
        log_title='Logs init.log',
        log_stream=url_for('views.logs_init_stream'),
        log_path=config.INIT_LOG_PATH
    )


@views_bp.route('/logs/init/stream')
@admin_required
def logs_init_stream():
    """Stream SSE do init.log"""
    generator = stream_log_file(config.INIT_LOG_PATH)
    response = Response(stream_with_context(generator), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@views_bp.route('/logs/dayz-server-err')
@admin_required
def logs_dayz_err():
    """Logs dayz-server.err em tempo real"""
    return render_template(
        'logs_dayz_err.html',
        log_title='Logs Dayz-server.err',
        log_stream=url_for('views.logs_dayz_err_stream'),
        log_path=config.DAYZ_SERVER_ERR_PATH
    )


@views_bp.route('/logs/dayz-server-err/stream')
@admin_required
def logs_dayz_err_stream():
    """Stream SSE do dayz-server.err"""
    generator = stream_log_file(config.DAYZ_SERVER_ERR_PATH)
    response = Response(stream_with_context(generator), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


@views_bp.route('/logs/audit')
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


@views_bp.route('/vehicles')
@admin_required
def vehicles():
    """Tracking de veículos"""
    return render_template('vehicles.html')


@views_bp.route('/containers')
@admin_required
def containers():
    """Tracking de containers"""
    return render_template('containers.html')

@views_bp.route('/structures')
@admin_required
def structures():
    """Tracking de construções (fences, watchtowers, flags)"""
    return render_template('structures.html')

@views_bp.route('/map')
@admin_required
def map_view():
    """Visualização do mapa"""
    players_list = get_all_players()
    player_id_filter = request.args.get('player_id', None)
    return render_template('map.html', players=players_list, player_id_filter=player_id_filter)


@views_bp.route('/deathmatch')
@admin_required
def deathmatch():
    """Tela Deathmatch com mapa e overlays das zonas configuradas"""
    return render_template('deathmatch.html')


@views_bp.route('/cheat-detection')
@admin_required
def cheat_detection():
    """Página de detecção de cheaters"""
    return render_template('cheat_detection.html')


@views_bp.route('/spawning')
@admin_required
def spawning():
    """Página de spawning de itens e veículos"""
    return render_template('spawning.html')


@views_bp.route('/items-manage')
@admin_required
def items_manage():
    """Página de gerenciamento do banco de dados de itens"""
    return render_template('items_manage.html')


@views_bp.route('/kits-manage')
@admin_required
def kits_manage():
    """Página de gerenciamento de kits de armas e loot"""
    return render_template('kits_manage.html')


@views_bp.route('/users-manage')
@admin_required
def users_manage():
    """Página de gerenciamento de usuários"""
    return render_template('users_manage.html')


@views_bp.route('/server-config')
@admin_required
def server_config():
    """Página de configurações do servidor"""
    return render_template('server_config.html')


@views_bp.route('/loadouts')
@admin_required
def loadouts():
    """Tela principal de gerenciamento de loadouts"""
    return render_template('loadouts.html')


@views_bp.route('/loadouts/custom/new')
@admin_required
def loadout_custom_new():
    """Página de criação de novo loadout custom"""
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='custom')


@views_bp.route('/loadouts/custom/<int:loadout_id>/edit')
@admin_required
def loadout_custom_edit(loadout_id):
    """Página de edição de loadout custom"""
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='custom')


@views_bp.route('/loadouts/players/<player_id>/new')
@admin_required
def loadout_player_new(player_id):
    """Página de criação de novo loadout para jogador"""
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='player', player_id=player_id)


@views_bp.route('/loadouts/players/<player_id>/<int:loadout_id>/edit')
@admin_required
def loadout_player_edit(player_id, loadout_id):
    """Página de edição de loadout de jogador"""
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='player', player_id=player_id)


@views_bp.route('/my-loadout')
@login_required
def my_loadout():
    """Tela de gerenciamento de loadouts do usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    return render_template('my_loadout.html', player_id=player_id)


@views_bp.route('/my-loadout/new')
@login_required
def my_loadout_new():
    """Página de criação de novo loadout para o usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    return render_template('loadout_edit.html', loadout_id=None, is_edit=False, loadout_type='player', player_id=player_id)


@views_bp.route('/my-loadout/<int:loadout_id>/edit')
@login_required
def my_loadout_edit(loadout_id):
    """Página de edição de loadout do usuário logado"""
    player_id = session.get('player_id')
    if not player_id:
        return render_template('error.html', message='Você precisa ter um player_id associado à sua conta para acessar esta página.'), 403
    
    # Validar que o loadout pertence ao usuário logado
    loadouts = get_loadouts_by_player(player_id)
    loadout = None
    for l in loadouts:
        if l['loadout_id'] == loadout_id:
            loadout = l
            break
    
    if not loadout:
        return render_template('error.html', message='Loadout não encontrado ou você não tem permissão para editá-lo.'), 404
    
    return render_template('loadout_edit.html', loadout_id=loadout_id, is_edit=True, loadout_type='player', player_id=player_id)


@views_bp.route('/loadout-rules')
@admin_required
def loadout_rules():
    """Página de gerenciamento de regras para loadouts de players"""
    return render_template('loadout_rules.html')

