"""
Blueprint de API de Players
Rotas de API para ações em jogadores
"""
from flask import Blueprint, request, jsonify
import logging
import fcntl
import os
import subprocess
import json
import config
from database import (
    get_online_players, check_backup_exists_any_player,
    search_players, get_item_details_from_items_db,
    get_all_players_with_status, get_player_by_id
)
from blueprints.auth import admin_required, audit_action

api_players_bp = Blueprint('api_players', __name__)
logger = logging.getLogger(__name__)


def execute_rcon_command(command):
    """
    Executa um comando RCON usando bercon-cli
    
    Args:
        command: Comando RCON a executar (ex: 'kick 0 Mensagem')
    
    Returns:
        dict: Resposta JSON do RCON ou None em caso de erro
    """
    # Validar se a senha RCON está configurada
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return None
    
    try:
        cmd = [
            config.RCON_BIN_PATH,
            '-i', config.RCON_IP,
            '-p', str(config.RCON_PORT),
            '-P', config.RCON_PASSWORD,
            '-j', command
        ]
        
        logger.debug(f"Executando comando RCON: {' '.join(cmd[:3])} -P *** -j {command}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            logger.error(f"Erro ao executar comando RCON (returncode={result.returncode}): {result.stderr}")
            logger.debug(f"stdout: {result.stdout}")
            return None
        
        # Verificar se stdout está vazio
        if not result.stdout or not result.stdout.strip():
            logger.warning("Resposta RCON vazia")
            return None
        
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as e:
            logger.error(f"Resposta RCON não é JSON válido: {result.stdout}")
            logger.debug(f"Erro de parsing: {str(e)}")
            return None
            
    except subprocess.TimeoutExpired:
        logger.error("Timeout ao executar comando RCON")
        return None
    except Exception as e:
        logger.exception(f"Erro ao executar comando RCON: {str(e)}")
        return None


def get_player_rcon_id(player_guid):
    """
    Busca o ID do jogador no RCON usando o GUID
    
    Args:
        player_guid: GUID do jogador (RconGuid do banco de dados)
    
    Returns:
        int: ID do jogador no RCON ou None se não encontrado
    """
    try:
        # Listar jogadores online
        response = execute_rcon_command('players')
        
        if not response or not isinstance(response, list):
            logger.warning("Resposta de players inválida ou vazia")
            return None
        
        # Procurar jogador pelo GUID (comparação case-insensitive)
        player_guid_lower = player_guid.lower() if player_guid else ''
        for player in response:
            if isinstance(player, dict):
                player_guid_from_rcon = player.get('guid', '').lower()
                if player_guid_from_rcon == player_guid_lower:
                    player_id = player.get('id')
                    if player_id is not None:
                        return int(player_id)
        
        logger.warning(f"Jogador com GUID {player_guid} não encontrado online")
        return None
        
    except Exception as e:
        logger.exception(f"Erro ao buscar ID do jogador no RCON: {str(e)}")
        return None


@api_players_bp.route('/api/players/online')
@admin_required
def api_online_players():
    """API com jogadores online e suas informações"""
    players = get_online_players()
    return jsonify({'players': players})

@api_players_bp.route('/api/players/all-with-status')
@admin_required
def api_all_players_with_status():
    """API com todos os jogadores e seus status para atualização automática"""
    players = get_all_players_with_status()
    return jsonify({'players': players})


@api_players_bp.route('/api/players/search')
@admin_required
def api_search_players():
    """API para busca de jogadores"""
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    results = search_players(query)
    return jsonify(results)


@api_players_bp.route('/api/players/<player_id>/restore-backup', methods=['POST'])
@admin_required
@audit_action('RESTORE_BACKUP')
def api_restore_backup(player_id):
    """API para restaurar backup de um jogador"""
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


@api_players_bp.route('/api/players/<player_id>/teleport', methods=['POST'])
@admin_required
@audit_action('TELEPORT_PLAYER')
def api_teleport_player(player_id):
    """API para teleportar jogador para uma posição usando sistema de comandos DayZ"""
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


@api_players_bp.route('/api/players/<player_id>/send-message', methods=['POST'])
@admin_required
@audit_action('SEND_PRIVATE_MESSAGE')
def api_send_private_message(player_id):
    """API para enviar mensagem privada a um jogador"""
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


@api_players_bp.route('/api/players/<player_id>/check-inventory', methods=['POST'])
@admin_required
@audit_action('CHECK_INVENTORY')
def api_check_inventory(player_id):
    """API para verificar inventário de um jogador online"""
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


@api_players_bp.route('/api/scan-region', methods=['POST'])
@admin_required
@audit_action('SCAN_REGION')
def api_scan_region():
    """API para escanear objetos em uma região do mapa"""
    try:
        data = request.get_json()
        coord_x = data.get('coord_x')
        coord_y = data.get('coord_y')
        coord_z = data.get('coord_z', 0)
        radius = data.get('radius')
        request_id = data.get('request_id')
        
        if coord_x is None or coord_y is None:
            return jsonify({
                'success': False,
                'message': 'Coordenadas X e Y são obrigatórias'
            }), 400
        
        if radius is None:
            return jsonify({
                'success': False,
                'message': 'Raio é obrigatório'
            }), 400
        
        if radius < 1 or radius > 100:
            return jsonify({
                'success': False,
                'message': 'Raio deve estar entre 1 e 100 metros'
            }), 400
        
        if not request_id:
            return jsonify({
                'success': False,
                'message': 'request_id não fornecido'
            }), 400
        
        logger.debug(f"Scan region request: coord_x={coord_x}, coord_y={coord_y}, coord_z={coord_z}, radius={radius}, request_id={request_id}")
        
        # Caminho do arquivo de comandos
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        # Formato: SYSTEM scanregion coord_x coord_z coord_y radius request_id
        # O Commands.c lê: tokens[2]=X, tokens[3]=Z (norte-sul), tokens[4]=Y (altura)
        # Frontend envia: coord_x=X (leste-oeste), coord_y=Z (norte-sul), coord_z=Y (altura)
        # Commands.c espera: scanCoordX=X, scanCoordZ=Z, scanCoordY=Y
        # Então enviamos: coord_x, coord_y (que é Z do DayZ), coord_z (que é Y do DayZ)
        command_line = f"SYSTEM scanregion {coord_x} {coord_y} {coord_z} {radius} {request_id}\n"
        
        logger.info(f"Adicionando comando de escaneamento de região: {command_line.strip()}")
        
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
            
            logger.info("Comando de escaneamento de região adicionado com sucesso")
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
        logger.exception("Erro inesperado ao escanear região")
        return jsonify({
            'success': False,
            'message': f'Erro ao executar escaneamento de região: {str(e)}'
        }), 500


@api_players_bp.route('/api/players/<player_id>/kick', methods=['POST'])
@admin_required
@audit_action('PLAYER_KICK')
def api_player_kick(player_id):
    """Kickar jogador via RCON com mensagem personalizada"""
    # Verificar se RCON está configurado
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return jsonify({
            'success': False,
            'message': 'Configuração RCON não encontrada. Verifique o config.json'
        }), 500
    
    data = request.get_json()
    message = data.get('message', 'Você foi kickado do servidor')
    
    # Buscar dados do jogador no banco
    player = get_player_by_id(player_id)
    if not player:
        return jsonify({
            'success': False,
            'message': 'Jogador não encontrado no banco de dados'
        }), 404
    
    # Verificar se tem RconGuid
    rcon_guid = player.get('RconGuid')
    if not rcon_guid:
        logger.warning(f"RconGuid não encontrado para jogador {player_id}")
        return jsonify({
            'success': False,
            'message': 'RconGuid não encontrado para este jogador'
        }), 400
    
    # Buscar ID do jogador no RCON
    logger.info(f"Buscando ID RCON para GUID: {rcon_guid}")
    rcon_id = get_player_rcon_id(rcon_guid)
    if rcon_id is None:
        logger.warning(f"Jogador com GUID {rcon_guid} não encontrado online no RCON")
        return jsonify({
            'success': False,
            'message': 'Jogador não está online ou não foi encontrado no RCON'
        }), 404
    
    logger.info(f"Jogador encontrado no RCON com ID: {rcon_id}")
    
    # Executar comando kick via RCON
    kick_command = f"kick {rcon_id} {message}"
    logger.info(f"Executando comando kick: {kick_command}")
    response = execute_rcon_command(kick_command)
    
    if response is None:
        logger.error(f"Falha ao executar comando kick via RCON para jogador {player_id}")
        return jsonify({
            'success': False,
            'message': 'Erro ao executar comando kick via RCON. Verifique os logs do servidor.'
        }), 500
    
    # Verificar se o comando foi executado com sucesso
    if isinstance(response, dict) and response.get('msg') == ['OK']:
        logger.info(f"Jogador {player_id} kickado via RCON com mensagem: {message}")
        return jsonify({
            'success': True,
            'message': f'Jogador kickado com sucesso!'
        })
    else:
        logger.warning(f"Resposta inesperada do RCON: {response}")
        return jsonify({
            'success': False,
            'message': 'Resposta inesperada do servidor RCON'
        }), 500


@api_players_bp.route('/api/players/<player_id>/action', methods=['POST'])
@admin_required
@audit_action('PLAYER_ACTION')
def api_player_action(player_id):
    """Executar ação administrativa em jogador"""
    data = request.get_json()
    action = data.get('action')
    
    # Validar ação
    valid_actions = ['heal', 'kill', 'kick', 'godmode', 'ungodmode', 
                     'ghostmode', 'unghostmode', 'desbug', 'getposition']
    
    if action not in valid_actions:
        return jsonify({'success': False, 'message': 'Ação inválida'}), 400
    
    # Se for kick, redirecionar para rota específica
    if action == 'kick':
        return api_player_kick(player_id)
    
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
