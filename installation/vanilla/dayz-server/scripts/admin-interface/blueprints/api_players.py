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
    get_all_players_with_status
)
from blueprints.auth import admin_required, audit_action

api_players_bp = Blueprint('api_players', __name__)
logger = logging.getLogger(__name__)


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
        
        # Formato: SYSTEM scanregion coord_x coord_y coord_z radius request_id
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
