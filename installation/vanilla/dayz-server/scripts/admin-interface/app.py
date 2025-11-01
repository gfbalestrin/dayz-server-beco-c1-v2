"""
Aplicação Flask para interface administrativa DayZ
"""
from flask import Flask, render_template, request, session, redirect, url_for, jsonify
from functools import wraps
import config
from database import (
    get_all_players, get_player_coords, get_player_coords_backup,
    get_logs_adm, get_logs_custom,     get_vehicles_tracking, get_vehicles_map_positions,
    get_player_by_id, search_players, get_players_last_position,
    get_containers_last_position, get_item_details_from_items_db,
    get_fences_last_position,
    get_player_trail, get_online_players_positions,
    get_players_positions_by_timerange, dayz_to_pixel,
    get_vehicles_last_position, get_recent_kills, parse_position,
    check_backup_exists, check_backup_exists_any_player, get_backup_info, get_online_players,
    get_all_players_with_status,
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
    get_ammunition_weapons, update_ammunition_weapons
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
    """Lista de jogadores - Página principal"""
    players_list = get_all_players_with_status()
    return render_template('players.html', players=players_list)

@app.route('/players')
@login_required
def players():
    """Lista de jogadores"""
    players_list = get_all_players_with_status()
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
    player_id_filter = request.args.get('player_id', None)
    return render_template('map.html', players=players_list, player_id_filter=player_id_filter)

@app.route('/api/players/positions')
@login_required
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
            'is_online': pos['PlayerID'] in online_ids
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

@app.route('/api/vehicles/map-positions')
@login_required
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

@app.route('/api/containers/positions')
@login_required
def api_containers_positions():
    """API com posições atuais dos containers com seus items"""
    containers = get_containers_last_position()
    
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
        
        result['containers'].append({
            'container_id': container['ContainerId'],
            'container_name': container['ContainerName'],
            'container_type': container['ContainerName'],
            'coord_x': container['PositionX'],
            'coord_y': container['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': container['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'items': items,
            'last_update': container['TimeStamp'] or ''
        })
    
    return jsonify(result)

@app.route('/api/fences/positions')
@login_required
def api_fences_positions():
    """API com posições atuais dos fences (construções)"""
    fences = get_fences_last_position()
    
    result = {
        'timestamp': datetime.now().isoformat(),
        'fences': []
    }
    
    for fence in fences:
        # Converter coordenadas para pixel
        pixel_coords = dayz_to_pixel(fence['PositionX'], fence['PositionY'])
        
        result['fences'].append({
            'fence_id': fence['FenceId'],
            'fence_name': fence['FenceName'],
            'coord_x': fence['PositionX'],
            'coord_y': fence['PositionY'],  # Sul-Norte (Y do mapa)
            'coord_z': fence['PositionZ'],  # Altitude
            'pixel_coords': pixel_coords,
            'last_update': fence['TimeStamp'] or ''
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

@app.route('/api/players/<player_id>/restore-backup', methods=['POST'])
@login_required
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
@login_required
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
        
        # Formato: PlayerID teleport CoordX CoordZ CoordY [AlturaOpcional]
        # Se coord_z não for fornecido, calcular altura automaticamente
        if coord_z is not None:
            # Altura especificada
            command_line = f"{player_id} teleport {coord_x} {coord_z} {coord_y} {coord_z}\n"
        else:
            # Altura será calculada automaticamente pelo servidor
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

@app.route('/api/events/kills')
@login_required
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

@app.route('/api/players/online')
@login_required
def api_online_players():
    """API com jogadores online e suas informações"""
    players = get_online_players()
    return jsonify({'players': players})

@app.route('/api/players/all-with-status')
@login_required
def api_all_players_with_status():
    """API com todos os jogadores e seus status para atualização automática"""
    players = get_all_players_with_status()
    return jsonify({'players': players})

@app.route('/api/players/<player_id>/action', methods=['POST'])
@login_required
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
                     'ghostmode', 'unghostmode', 'desbug', 'getposition',
                     'stamina on', 'stamina off']
    
    if action not in valid_actions:
        return jsonify({'success': False, 'message': 'Ação inválida'}), 400
    
    # Formato: PlayerID action (permite ações com espaços para stamina on/off)
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
@login_required
def spawning():
    """Página de spawning de itens e veículos"""
    return render_template('spawning.html')

@app.route('/api/items/weapons')
@login_required
def api_weapons():
    """API para buscar armas"""
    search = request.args.get('search', '')
    weapons = get_weapons(search)
    return jsonify({'weapons': weapons})

@app.route('/api/items/items')
@login_required
def api_items():
    """API para buscar itens"""
    type_id = request.args.get('type_id', type=int)
    search = request.args.get('search', '')
    items = get_items(type_id, search)
    return jsonify({'items': items})

@app.route('/api/items/types')
@login_required
def api_item_types():
    """API para buscar tipos de itens"""
    types = get_item_types()
    return jsonify({'types': types})

@app.route('/api/spawn/item', methods=['POST'])
@login_required
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
@login_required
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
        return jsonify({
            'success': True,
            'message': f'Veículo {vehicle_type} spawned com sucesso!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar veículo")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar veículo: {str(e)}'
        }), 500

@app.route('/api/spawn/item-at-coords', methods=['POST'])
@login_required
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
@login_required
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
        return jsonify({
            'success': True,
            'message': f'Veículo {vehicle_type} criado nas coordenadas!'
        })
    except Exception as e:
        logger.exception("Erro ao spawnar veículo em coordenadas")
        return jsonify({
            'success': False,
            'message': f'Erro ao spawnar veículo: {str(e)}'
        }), 500

@app.route('/api/items/explosives')
@login_required
def api_explosives():
    search = request.args.get('search', '')
    limit = int(request.args.get('limit', 50))
    explosives = get_explosives(search, limit)
    return jsonify({'explosives': explosives})

@app.route('/api/items/ammunitions')
@login_required
def api_ammunitions():
    search = request.args.get('search', '')
    caliber_id = request.args.get('caliber_id', type=int)
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    ammunitions = get_ammunitions(search, caliber_id, weapon_id, limit)
    return jsonify({'ammunitions': ammunitions})

@app.route('/api/items/calibers')
@login_required
def api_calibers():
    calibers = get_calibers()
    return jsonify({'calibers': calibers})

@app.route('/api/items/magazines')
@login_required
def api_magazines():
    search = request.args.get('search', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    magazines = get_magazines(search, weapon_id, limit)
    return jsonify({'magazines': magazines})

@app.route('/api/items/attachments')
@login_required
def api_attachments():
    search = request.args.get('search', '')
    type_filter = request.args.get('type', '')
    weapon_id = request.args.get('weapon_id', type=int)
    limit = int(request.args.get('limit', 50))
    attachments = get_attachments(search, type_filter if type_filter else None, weapon_id, limit)
    return jsonify({'attachments': attachments})

@app.route('/api/items/attachment-types')
@login_required
def api_attachment_types():
    types = get_attachment_types()
    return jsonify({'types': types})

@app.route('/api/weapons/<int:weapon_id>/compatible-items')
@login_required
def api_weapon_compatible_items(weapon_id):
    items = get_weapon_compatible_items(weapon_id)
    return jsonify(items)

@app.route('/api/spawn/loadout', methods=['POST'])
@login_required
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
@login_required
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
@login_required
def api_manage_weapon_create():
    data = request.get_json()
    try:
        weapon_id = create_weapon(data)
        return jsonify({'success': True, 'id': weapon_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>', methods=['PUT'])
@login_required
def api_manage_weapon_update(weapon_id):
    data = request.get_json()
    try:
        success = update_weapon(weapon_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>', methods=['DELETE'])
@login_required
def api_manage_weapon_delete(weapon_id):
    try:
        success = delete_weapon(weapon_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/weapons/<int:weapon_id>/relationships', methods=['PUT'])
@login_required
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
@login_required
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
@login_required
def api_manage_caliber_detail(caliber_id):
    caliber = get_caliber_by_id(caliber_id)
    if not caliber:
        return jsonify({'error': 'Calibre não encontrado'}), 404
    return jsonify({'caliber': caliber})

@app.route('/api/manage/calibers', methods=['POST'])
@login_required
def api_manage_caliber_create():
    data = request.get_json()
    try:
        caliber_id = create_caliber(data)
        return jsonify({'success': True, 'id': caliber_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/calibers/<int:caliber_id>', methods=['PUT'])
@login_required
def api_manage_caliber_update(caliber_id):
    data = request.get_json()
    try:
        success = update_caliber(caliber_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/calibers/<int:caliber_id>', methods=['DELETE'])
@login_required
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
@login_required
def api_manage_ammunition_detail(ammo_id):
    ammunition = get_ammunition_by_id(ammo_id)
    if not ammunition:
        return jsonify({'error': 'Munição não encontrada'}), 404
    return jsonify({'ammunition': ammunition})

@app.route('/api/manage/ammunitions', methods=['POST'])
@login_required
def api_manage_ammunition_create():
    data = request.get_json()
    try:
        ammo_id = create_ammunition(data)
        return jsonify({'success': True, 'id': ammo_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/ammunitions/<int:ammo_id>', methods=['PUT'])
@login_required
def api_manage_ammunition_update(ammo_id):
    data = request.get_json()
    try:
        success = update_ammunition(ammo_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/ammunitions/<int:ammo_id>', methods=['DELETE'])
@login_required
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
@login_required
def api_manage_magazine_detail(mag_id):
    magazine = get_magazine_by_id(mag_id)
    if not magazine:
        return jsonify({'error': 'Magazine não encontrado'}), 404
    return jsonify({'magazine': magazine})

@app.route('/api/manage/magazines', methods=['POST'])
@login_required
def api_manage_magazine_create():
    data = request.get_json()
    try:
        mag_id = create_magazine(data)
        return jsonify({'success': True, 'id': mag_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/magazines/<int:mag_id>', methods=['PUT'])
@login_required
def api_manage_magazine_update(mag_id):
    data = request.get_json()
    try:
        success = update_magazine(mag_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/magazines/<int:mag_id>', methods=['DELETE'])
@login_required
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
@login_required
def api_manage_attachment_detail(att_id):
    attachment = get_attachment_by_id(att_id)
    if not attachment:
        return jsonify({'error': 'Attachment não encontrado'}), 404
    return jsonify({'attachment': attachment})

@app.route('/api/manage/attachments', methods=['POST'])
@login_required
def api_manage_attachment_create():
    data = request.get_json()
    try:
        att_id = create_attachment(data)
        return jsonify({'success': True, 'id': att_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/attachments/<int:att_id>', methods=['PUT'])
@login_required
def api_manage_attachment_update(att_id):
    data = request.get_json()
    try:
        success = update_attachment(att_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/attachments/<int:att_id>', methods=['DELETE'])
@login_required
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
@login_required
def api_manage_explosive_detail(exp_id):
    explosive = get_explosive_by_id(exp_id)
    if not explosive:
        return jsonify({'error': 'Explosivo não encontrado'}), 404
    return jsonify({'explosive': explosive})

@app.route('/api/manage/explosives', methods=['POST'])
@login_required
def api_manage_explosive_create():
    data = request.get_json()
    try:
        exp_id = create_explosive(data)
        return jsonify({'success': True, 'id': exp_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/explosives/<int:exp_id>', methods=['PUT'])
@login_required
def api_manage_explosive_update(exp_id):
    data = request.get_json()
    try:
        success = update_explosive(exp_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/explosives/<int:exp_id>', methods=['DELETE'])
@login_required
def api_manage_explosive_delete(exp_id):
    try:
        success = delete_explosive(exp_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# === ITEM_TYPES ===
@app.route('/api/manage/item-types', methods=['GET'])
@login_required
def api_manage_item_types_list():
    types = get_item_types()
    return jsonify({'types': types})

@app.route('/api/manage/item-types/<int:type_id>', methods=['GET'])
@login_required
def api_manage_item_type_detail(type_id):
    item_type = get_item_type_by_id(type_id)
    if not item_type:
        return jsonify({'error': 'Tipo de item não encontrado'}), 404
    return jsonify({'type': item_type})

@app.route('/api/manage/item-types', methods=['POST'])
@login_required
def api_manage_item_type_create():
    data = request.get_json()
    try:
        type_id = create_item_type(data)
        return jsonify({'success': True, 'id': type_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/item-types/<int:type_id>', methods=['PUT'])
@login_required
def api_manage_item_type_update(type_id):
    data = request.get_json()
    try:
        success = update_item_type(type_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/item-types/<int:type_id>', methods=['DELETE'])
@login_required
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
@login_required
def api_manage_item_detail(item_id):
    item = get_item_by_id(item_id)
    if not item:
        return jsonify({'error': 'Item não encontrado'}), 404
    compatibility = get_item_compatibility(item_id)
    return jsonify({'item': item, 'compatibility': compatibility})

@app.route('/api/manage/items', methods=['POST'])
@login_required
def api_manage_item_create():
    data = request.get_json()
    try:
        item_id = create_item(data)
        return jsonify({'success': True, 'id': item_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>', methods=['PUT'])
@login_required
def api_manage_item_update(item_id):
    data = request.get_json()
    try:
        success = update_item(item_id, data)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>', methods=['DELETE'])
@login_required
def api_manage_item_delete(item_id):
    try:
        success = delete_item(item_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/items/<int:item_id>/compatibility', methods=['PUT'])
@login_required
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
@login_required
def api_validate_item_type(name_type):
    """Valida se o item type existe no types.xml"""
    is_valid = validate_item_type(name_type)
    return jsonify({'valid': is_valid})

@app.errorhandler(404)
def not_found(e):
    return render_template('error.html', message='Página não encontrada'), 404

# === RELACIONAMENTOS INVERSOS ===
@app.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['GET'])
@login_required
def api_manage_magazine_weapons_get(mag_id):
    weapons = get_magazine_weapons(mag_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/magazines/<int:mag_id>/weapons', methods=['PUT'])
@login_required
def api_manage_magazine_weapons_update(mag_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_magazine_weapons(mag_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['GET'])
@login_required
def api_manage_ammunition_weapons_get(ammo_id):
    weapons = get_ammunition_weapons(ammo_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/ammunitions/<int:ammo_id>/weapons', methods=['PUT'])
@login_required
def api_manage_ammunition_weapons_update(ammo_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_ammunition_weapons(ammo_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/manage/attachments/<int:att_id>/weapons', methods=['GET'])
@login_required
def api_manage_attachment_weapons_get(att_id):
    weapons = get_attachment_weapons(att_id)
    return jsonify({'weapons': weapons})

@app.route('/api/manage/attachments/<int:att_id>/weapons', methods=['PUT'])
@login_required
def api_manage_attachment_weapons_update(att_id):
    data = request.get_json()
    weapon_ids = data.get('weapon_ids', [])
    try:
        success = update_attachment_weapons(att_id, weapon_ids)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

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
