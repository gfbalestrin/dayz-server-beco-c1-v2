"""
Aplicação Flask para interface administrativa DayZ
"""
from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from functools import wraps
import config
from database import (
    get_all_players, get_player_coords, get_player_coords_backup,
    get_logs_adm, get_logs_custom, get_vehicles_tracking,
    get_player_by_id, search_players, get_players_last_position,
    get_player_trail, get_online_players_positions,
    get_players_positions_by_timerange, dayz_to_pixel,
    get_vehicles_last_position
)
from datetime import datetime

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

def login_required(f):
    """Decorator para rotas que requerem autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Página de login"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if username == config.ADMIN_USERNAME and password == config.ADMIN_PASSWORD:
            session['logged_in'] = True
            session['username'] = username
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Credenciais inválidas')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout do usuário"""
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    """Dashboard principal"""
    players_list = get_all_players()[:100]  # Limit for stats
    logs_adm_list = get_logs_adm(limit=100)
    logs_custom_list = get_logs_custom(limit=100)
    vehicles_list = get_vehicles_tracking(limit=100)
    
    return render_template('index.html', 
                         players=players_list,
                         logs_adm=logs_adm_list,
                         logs_custom=logs_custom_list,
                         vehicles=vehicles_list)

@app.route('/players')
@login_required
def players():
    """Lista de jogadores"""
    players_list = get_all_players()
    return render_template('players.html', players=players_list)

@app.route('/player/<player_id>/coords')
@login_required
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
@login_required
def logs_adm():
    """Logs administrativos"""
    logs = get_logs_adm()
    return render_template('logs_adm.html', logs=logs)

@app.route('/logs/custom')
@login_required
def logs_custom():
    """Logs customizados"""
    logs = get_logs_custom()
    return render_template('logs_custom.html', logs=logs)

@app.route('/vehicles')
@login_required
def vehicles():
    """Tracking de veículos"""
    vehicles = get_vehicles_tracking()
    return render_template('vehicles.html', vehicles=vehicles)

@app.route('/map')
@login_required
def map_view():
    """Visualização do mapa"""
    players_list = get_all_players()
    return render_template('map.html', players=players_list)

@app.route('/api/players/positions')
@login_required
def api_positions():
    """API com posições atuais de todos os jogadores"""
    positions = get_players_last_position()
    
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
            'is_online': False
        })
    
    return jsonify(result)

@app.route('/api/players/<player_id>/trail')
@login_required
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
            'coord_x': point['CoordX'],
            'coord_y': point['CoordY'],
            'coord_z': point['CoordZ'],
            'pixel_coords': pixel_coords,
            'timestamp': point['Data'] or ''
        })
    
    return jsonify(result)

@app.route('/api/players/online/positions')
@login_required
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
            'is_online': True
        })
    
    return jsonify(result)

@app.route('/api/vehicles/positions')
@login_required
def api_vehicles_positions():
    """API com posições atuais de todos os veículos"""
    vehicles = get_vehicles_last_position()
    
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

@app.route('/api/players/search')
@login_required
def api_search_players():
    """API para busca de jogadores"""
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    results = search_players(query)
    return jsonify(results)

@app.errorhandler(404)
def not_found(e):
    return render_template('error.html', message='Página não encontrada'), 404

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
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
