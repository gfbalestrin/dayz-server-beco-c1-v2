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
from datetime import datetime, timezone, timedelta
import config
from database import (
    get_online_players, check_backup_exists_any_player,
    search_players, get_item_details_from_items_db,
    get_all_players_with_status, get_player_by_id, get_player_events,
    insert_player_event, is_player_online, get_backup_blob_hex
)
from blueprints.auth import admin_required, audit_action
from blueprints.helpers import write_command_to_file

api_players_bp = Blueprint('api_players', __name__)
logger = logging.getLogger(__name__)

try:
    from ssh_client import execute_remote_command, read_remote_file
except ImportError:
    logger.warning("ssh_client não disponível, restauração de backup não funcionará")
    execute_remote_command = None
    read_remote_file = None


def steamid_exists_in_ban_file(steam_id):
    """
    Verifica se um SteamID já existe no arquivo ban.txt (via SSH)
    
    Args:
        steam_id: SteamID a verificar (string)
    
    Returns:
        bool: True se o SteamID existe, False caso contrário
    """
    if not steam_id or not steam_id.strip():
        return False
    
    if not read_remote_file:
        logger.warning("ssh_client não disponível, não é possível verificar ban.txt")
        return False
    
    ban_file_path = config.BAN_FILE_PATH
    
    try:
        # Ler arquivo remoto via SSH
        file_content = read_remote_file(ban_file_path)
        
        if file_content is None:
            # Arquivo não existe ou erro ao ler
            return False
        
        # Processar conteúdo do arquivo
        for line in file_content.splitlines():
            # Remove espaços e quebras de linha
            line = line.strip()
            # Ignora comentários e linhas vazias
            if not line or line.startswith('//'):
                continue
            # Compara SteamID (pode ter comentário após o ID)
            steam_id_part = line.split('//')[0].strip()
            if steam_id_part == steam_id:
                return True
        
        return False
    except Exception as e:
        logger.error(f"Erro ao verificar SteamID no arquivo ban.txt via SSH: {str(e)}")
        return False


def _write_remote_file(file_path, content):
    """
    Escreve conteúdo em arquivo remoto via SFTP
    
    Args:
        file_path: Caminho do arquivo no servidor remoto
        content: Conteúdo a escrever (string)
    
    Returns:
        bool: True se escrito com sucesso, False caso contrário
    """
    try:
        from ssh_client import _connection_pool
    except ImportError:
        logger.warning("ssh_client não disponível, não é possível escrever arquivo remoto")
        return False
    
    conn = _connection_pool.get_connection()
    if not conn:
        logger.error("Não foi possível obter conexão SSH")
        return False
    
    try:
        with conn.lock:
            sftp = conn.client.open_sftp()
            try:
                # Escrever conteúdo no arquivo
                with sftp.open(file_path, 'w') as f:
                    f.write(content.encode('utf-8'))
                logger.debug(f"Arquivo escrito via SSH: {file_path}")
                return True
            finally:
                sftp.close()
    except Exception as e:
        logger.error(f"Erro ao escrever arquivo via SSH: {str(e)}")
        return False


def add_steamid_to_ban_file(steam_id):
    """
    Adiciona um SteamID ao arquivo ban.txt se não existir (via SSH)
    
    Args:
        steam_id: SteamID a adicionar (string)
    
    Returns:
        bool: True se adicionado com sucesso, False caso contrário
    """
    if not steam_id or not steam_id.strip():
        logger.warning("SteamID vazio ou inválido para adicionar ao ban.txt")
        return False
    
    if not read_remote_file or not execute_remote_command:
        logger.warning("ssh_client não disponível, não é possível adicionar ao ban.txt")
        return False
    
    # Verifica se já existe
    if steamid_exists_in_ban_file(steam_id):
        logger.info(f"SteamID {steam_id} já existe no arquivo ban.txt")
        return True
    
    ban_file_path = config.BAN_FILE_PATH
    
    try:
        # Ler arquivo remoto via SSH
        file_content = read_remote_file(ban_file_path)
        
        # Se arquivo não existe, criar com cabeçalho padrão
        if file_content is None:
            header = '//Players added to the ban.txt won\'t be able to connect to this server.\n'
            header += '//Bans can be added/removed while the server is running and will come in effect immediately, kicking the player.\n'
            header += '//-----------------------------------------------------------------------------------------------------\n'
            header += '//To ban a player, add his player ID (44 characters long ID) which can be found in the admin log file (.ADM).\n'
            header += '//-----------------------------------------------------------------------------------------------------\n'
            header += '//For comments use the // prefix. It can be used after an inserted ID, to easily mark it.\n'
            header += '\n'
            new_content = header + f'{steam_id}\n'
        else:
            # Adiciona o SteamID ao final do arquivo
            # Verifica se termina com quebra de linha
            if file_content and not file_content.endswith('\n'):
                new_content = file_content + '\n' + f'{steam_id}\n'
            else:
                new_content = file_content + f'{steam_id}\n'
        
        # Escrever arquivo remoto via SSH
        if _write_remote_file(ban_file_path, new_content):
            logger.info(f"SteamID {steam_id} adicionado ao arquivo ban.txt")
            return True
        else:
            logger.error(f"Falha ao escrever arquivo ban.txt via SSH")
            return False
                
    except Exception as e:
        logger.error(f"Erro ao adicionar SteamID ao arquivo ban.txt: {str(e)}")
        return False


def remove_steamid_from_ban_file(steam_id):
    """
    Remove um SteamID do arquivo ban.txt se existir (via SSH)
    
    Args:
        steam_id: SteamID a remover (string)
    
    Returns:
        bool: True se removido com sucesso, False caso contrário
    """
    if not steam_id or not steam_id.strip():
        logger.warning("SteamID vazio ou inválido para remover do ban.txt")
        return False
    
    if not read_remote_file or not execute_remote_command:
        logger.warning("ssh_client não disponível, não é possível remover do ban.txt")
        return False
    
    ban_file_path = config.BAN_FILE_PATH
    
    try:
        # Ler arquivo remoto via SSH
        file_content = read_remote_file(ban_file_path)
        
        if file_content is None:
            logger.info(f"Arquivo ban.txt não existe: {ban_file_path}")
            return False
        
        # Processar linhas do arquivo
        lines = file_content.splitlines(keepends=True)
        if not lines:
            lines = [line + '\n' for line in file_content.splitlines()]
        
        # Filtra as linhas, removendo o SteamID (preserva comentários e formatação)
        modified = False
        filtered_lines = []
        for line in lines:
            original_line = line
            line_stripped = line.strip()
            
            # Ignora linhas vazias e comentários completos
            if not line_stripped or line_stripped.startswith('//'):
                filtered_lines.append(original_line)
                continue
            
            # Verifica se a linha contém o SteamID
            steam_id_part = line_stripped.split('//')[0].strip()
            if steam_id_part == steam_id:
                modified = True
                logger.info(f"SteamID {steam_id} removido do arquivo ban.txt")
                continue
            
            # Preserva a linha original (mantém formatação e comentários)
            filtered_lines.append(original_line)
        
        # Reescreve o arquivo apenas se houve modificação
        if modified:
            new_content = ''.join(filtered_lines)
            if _write_remote_file(ban_file_path, new_content):
                return True
            else:
                logger.error(f"Falha ao escrever arquivo ban.txt via SSH")
                return False
        else:
            logger.info(f"SteamID {steam_id} não encontrado no arquivo ban.txt")
            return False
            
    except Exception as e:
        logger.error(f"Erro ao remover SteamID do arquivo ban.txt: {str(e)}")
        return False


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


def execute_load_bans():
    """
    Executa o comando loadBans via RCON para aplicar bans do arquivo ban.txt
    
    Returns:
        bool: True se executado com sucesso, False caso contrário
    """
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return False
    
    try:
        response = execute_rcon_command('loadBans')
        if response is None:
            logger.error("Falha ao executar comando loadBans via RCON")
            return False
        
        if isinstance(response, dict) and response.get('msg') == ['OK']:
            logger.info("Comando loadBans executado com sucesso")
            return True
        else:
            logger.warning(f"Resposta inesperada do RCON ao executar loadBans: {response}")
            return False
    except Exception as e:
        logger.exception(f"Erro ao executar loadBans via RCON: {str(e)}")
        return False


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
    logger.info(f"[RESTORE_BACKUP] Iniciando restauração de backup para player_id={player_id}")
    
    try:
        # Log de parâmetros recebidos
        data = request.get_json()
        player_coord_id = data.get('player_coord_id') if data else None
        logger.info(f"[RESTORE_BACKUP] Parâmetros recebidos: player_id={player_id}, player_coord_id={player_coord_id}, data={data}")
        
        # Verificar se jogador está online
        logger.debug(f"[RESTORE_BACKUP] Verificando se jogador está online: {player_id}")
        try:
            online_players = get_online_players()
            online_ids = [p['PlayerID'] for p in online_players]
            logger.debug(f"[RESTORE_BACKUP] Jogadores online: {len(online_ids)}")
        except Exception as e:
            logger.error(f"[RESTORE_BACKUP] Erro ao obter lista de jogadores online: {str(e)}")
            raise
        
        if player_id in online_ids:
            logger.warning(f"[RESTORE_BACKUP] Tentativa de restaurar/clonar para jogador online: {player_id}")
            return jsonify({
                'success': False,
                'message': 'Não é possível restaurar/clonar para jogador online. Aguarde o jogador desconectar.'
            }), 400
        
        logger.debug(f"[RESTORE_BACKUP] Jogador não está online, prosseguindo com restauração")
        
        # Validar player_coord_id
        if not player_coord_id:
            logger.error(f"[RESTORE_BACKUP] PlayerCoordId não fornecido no request")
            return jsonify({'success': False, 'message': 'PlayerCoordId não fornecido'}), 400
        
        logger.info(f"[RESTORE_BACKUP] PlayerCoordId validado: {player_coord_id}")
        
        # Validar se o backup existe (sem verificar dono, pois pode ser clonagem)
        logger.debug(f"[RESTORE_BACKUP] Verificando se backup existe: coord_id={player_coord_id}")
        try:
            backup_exists = check_backup_exists_any_player(player_coord_id)
            logger.debug(f"[RESTORE_BACKUP] Resultado da verificação de backup: {backup_exists}")
        except Exception as e:
            logger.error(f"[RESTORE_BACKUP] Erro ao verificar se backup existe: {str(e)}")
            raise
        
        if not backup_exists:
            logger.warning(f"[RESTORE_BACKUP] Backup não encontrado: coord_id={player_coord_id}")
            return jsonify({'success': False, 'message': 'Backup não encontrado'}), 404
        
        logger.info(f"[RESTORE_BACKUP] Backup encontrado e validado")
        
        # Buscar backup BLOB do banco do cliente e converter para hex
        logger.debug(f"[RESTORE_BACKUP] Buscando backup BLOB do banco do cliente: coord_id={player_coord_id}")
        try:
            backup_hex = get_backup_blob_hex(player_coord_id)
            if not backup_hex:
                logger.error(f"[RESTORE_BACKUP] Backup BLOB não encontrado no banco do cliente: coord_id={player_coord_id}")
                return jsonify({
                    'success': False,
                    'message': 'Backup BLOB não encontrado no banco de dados'
                }), 404
            logger.info(f"[RESTORE_BACKUP] Backup BLOB obtido do banco do cliente (tamanho hex: {len(backup_hex)} caracteres)")
        except Exception as e:
            logger.error(f"[RESTORE_BACKUP] Erro ao buscar backup BLOB: {str(e)}")
            logger.exception("[RESTORE_BACKUP] Stack trace completo:")
            return jsonify({
                'success': False,
                'message': f'Erro ao buscar backup do banco de dados: {str(e)}'
            }), 500
        
        # Verificar disponibilidade do SSH client
        if not execute_remote_command:
            logger.error("[RESTORE_BACKUP] SSH client não disponível para executar script de restauração")
            return jsonify({
                'success': False,
                'message': 'SSH client não disponível. Configure a conexão SSH no config.json'
            }), 500
        
        logger.debug("[RESTORE_BACKUP] SSH client disponível")
        
        # Obter configurações
        try:
            script_path = config.RESTORE_BACKUP_SCRIPT
            workdir = config.RESTORE_BACKUP_WORKDIR
            logger.info(f"[RESTORE_BACKUP] Configurações: script_path={script_path}, workdir={workdir}")
            
            if not script_path:
                raise ValueError("RESTORE_BACKUP_SCRIPT não configurado")
            if not workdir:
                raise ValueError("RESTORE_BACKUP_WORKDIR não configurado")
        except AttributeError as e:
            logger.error(f"[RESTORE_BACKUP] Erro ao acessar configurações: {str(e)}")
            logger.error(f"[RESTORE_BACKUP] Config disponível: RESTORE_BACKUP_SCRIPT={hasattr(config, 'RESTORE_BACKUP_SCRIPT')}, RESTORE_BACKUP_WORKDIR={hasattr(config, 'RESTORE_BACKUP_WORKDIR')}")
            return jsonify({
                'success': False,
                'message': f'Configuração não encontrada: {str(e)}. Verifique config.json -> DayZServer -> RestoreBackupScript e RestoreBackupWorkdir'
            }), 500
        except ValueError as e:
            logger.error(f"[RESTORE_BACKUP] Configuração inválida: {str(e)}")
            return jsonify({
                'success': False,
                'message': f'Configuração inválida: {str(e)}'
            }), 500
        
        # Montar comando para executar no servidor remoto
        # Passar backup como terceiro parâmetro (PlayerId, PlayerCoordId, BackupHex)
        # Escapar o backup hex para evitar problemas com caracteres especiais no shell
        backup_hex_escaped = backup_hex.replace("'", "'\\''")
        command = f"{script_path} '{player_id}' '{str(player_coord_id)}' '{backup_hex_escaped}'"
        logger.info(f"[RESTORE_BACKUP] Comando montado: {script_path} '{player_id}' '{str(player_coord_id)}' '<backup_hex>...' (backup hex length: {len(backup_hex)})")
        logger.info(f"[RESTORE_BACKUP] Executando script via SSH (timeout=30s, cwd={workdir})")
        
        # Executar comando via SSH
        try:
            exit_code, stdout, stderr = execute_remote_command(
                command,
                timeout=30,
                cwd=workdir
            )
            logger.info(f"[RESTORE_BACKUP] Script executado: exit_code={exit_code}")
            logger.info(f"[RESTORE_BACKUP] Script stdout (primeiros 500 chars): {stdout[:500] if stdout else '(vazio)'}")
            logger.info(f"[RESTORE_BACKUP] Script stderr (primeiros 500 chars): {stderr[:500] if stderr else '(vazio)'}")
        except TimeoutError as e:
            logger.error(f"[RESTORE_BACKUP] Timeout ao executar comando SSH: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Timeout ao executar script de restauração (30s). O script pode estar demorando mais que o esperado.'
            }), 500
        except Exception as e:
            logger.error(f"[RESTORE_BACKUP] Erro ao executar comando SSH: {str(e)}")
            logger.exception("[RESTORE_BACKUP] Stack trace completo:")
            error_type = type(e).__name__
            return jsonify({
                'success': False,
                'message': f'Erro ao executar script via SSH: {error_type} - {str(e)}'
            }), 500
        
        # Processar resultado
        if exit_code == 0:
            logger.info(f"[RESTORE_BACKUP] Restauração concluída com sucesso para player_id={player_id}")
            return jsonify({
                'success': True,
                'message': 'Backup restaurado com sucesso!',
                'output': stdout
            })
        else:
            logger.error(f"[RESTORE_BACKUP] Script retornou código de erro: {exit_code}")
            logger.error(f"[RESTORE_BACKUP] stderr completo: {stderr}")
            logger.error(f"[RESTORE_BACKUP] stdout completo: {stdout}")
            return jsonify({
                'success': False,
                'message': 'Erro ao restaurar backup',
                'error': stderr,
                'stdout': stdout
            }), 500
            
    except KeyError as e:
        logger.error(f"[RESTORE_BACKUP] Chave não encontrada no request: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Dados inválidos no request: {str(e)}'
        }), 400
    except ValueError as e:
        logger.error(f"[RESTORE_BACKUP] Valor inválido: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Valor inválido: {str(e)}'
        }), 400
    except Exception as e:
        logger.exception(f"[RESTORE_BACKUP] Erro inesperado ao restaurar backup para player_id={player_id}")
        logger.error(f"[RESTORE_BACKUP] Tipo de exceção: {type(e).__name__}")
        logger.error(f"[RESTORE_BACKUP] Mensagem de erro: {str(e)}")
        error_type = type(e).__name__
        error_msg = str(e)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado ao executar restauração: {error_type} - {error_msg}'
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
        
        # Formato aceito pelo servidor: PlayerID teleport CoordX CoordZ CoordY (mantido como antes)
        if coord_z is not None:
            command_line = f"{player_id} teleport {coord_x} {coord_z} {coord_y}\n"
        else:
            command_line = f"{player_id} teleport {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte: {command_line.strip()}")
        
        # Escrever comando (SSH ou arquivo local)
        if write_command_to_file(command_line):
            logger.info("Comando de teleporte adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de teleporte enviado! O jogador será teleportado em instantes.'
            })
        else:
            logger.error("Erro ao escrever comando de teleporte")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando de teleporte. Verifique a configuração SSH ou arquivo de comandos.'
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
    """API para enviar mensagem privada a um jogador via RCON"""
    # Verificar se RCON está configurado
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return jsonify({
            'success': False,
            'message': 'Configuração RCON não encontrada. Verifique o config.json'
        }), 500
    
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        
        logger.debug(f"Send message request: player_id={player_id}, message_length={len(message)}")
        
        if not message:
            return jsonify({'success': False, 'message': 'Mensagem não pode estar vazia'}), 400
        
        if not player_id or not player_id.strip():
            return jsonify({'success': False, 'message': 'Player ID inválido'}), 400
        
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
        
        # Executar comando say via RCON: say -<id> Mensagem
        say_command = f"say -{rcon_id} {message}"
        logger.info(f"Executando comando say: {say_command}")
        response = execute_rcon_command(say_command)
        
        if response is None:
            logger.error(f"Falha ao executar comando say via RCON para jogador {player_id}")
            return jsonify({
                'success': False,
                'message': 'Erro ao executar comando say via RCON. Verifique os logs do servidor.'
            }), 500
        
        # Verificar se o comando foi executado com sucesso
        if isinstance(response, dict) and response.get('msg') == ['OK']:
            logger.info(f"Mensagem privada enviada via RCON para jogador {player_id}: {message[:50]}...")
            
            # Salvar mensagem do admin no banco para aparecer no chat
            insert_player_event(
                player_id=player_id,
                event_type='admin_message',
                details={'message': message, 'type': 'admin_message'}
            )
            
            return jsonify({
                'success': True,
                'message': 'Mensagem privada enviada com sucesso!'
            })
        else:
            logger.warning(f"Resposta inesperada do RCON: {response}")
            return jsonify({
                'success': False,
                'message': 'Resposta inesperada do servidor RCON'
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
        
        # Formato: PlayerID checkinventory PlayerID request_id
        command_line = f"{player_id} checkinventory {player_id} {request_id}\n"
        
        logger.info(f"Adicionando comando de verificação de inventário: {command_line.strip()}")
        
        # Escrever comando (SSH ou arquivo local)
        if write_command_to_file(command_line):
            logger.info("Comando de verificação de inventário adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
        else:
            logger.error("Erro ao escrever comando de verificação de inventário")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
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
        
        # Formato: SYSTEM scanregion coord_x coord_z coord_y radius request_id
        # O Commands.c lê: tokens[2]=X, tokens[3]=Z (norte-sul), tokens[4]=Y (altura)
        # Frontend envia: coord_x=X (leste-oeste), coord_y=Z (norte-sul), coord_z=Y (altura)
        # Commands.c espera: scanCoordX=X, scanCoordZ=Z, scanCoordY=Y
        # Então enviamos: coord_x, coord_y (que é Z do DayZ), coord_z (que é Y do DayZ)
        command_line = f"SYSTEM scanregion {coord_x} {coord_y} {coord_z} {radius} {request_id}\n"
        
        logger.info(f"Adicionando comando de escaneamento de região: {command_line.strip()}")
        
        # Escrever comando (SSH ou arquivo local)
        if write_command_to_file(command_line):
            logger.info("Comando de escaneamento de região adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
        else:
            logger.error("Erro ao escrever comando de escaneamento de região")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
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
        
        # Registrar evento na tabela players_events
        details = {
            'action_type': 'kick',
            'action_name': 'Kickar',
            'message': message,
            'rcon_id': rcon_id
        }
        
        try:
            insert_player_event(
                player_id=player_id,
                event_type='admin_action',
                details=details
            )
            logger.info(f"Evento registrado para kick no jogador {player_id}")
        except Exception as e:
            logger.warning(f"Erro ao registrar evento para kick: {str(e)}")
        
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


@api_players_bp.route('/api/players/<player_id>/ban', methods=['POST'])
@admin_required
@audit_action('PLAYER_BAN')
def api_player_ban(player_id):
    """Banir jogador via RCON (online) ou ban.txt (offline) com mensagem e tempo"""
    data = request.get_json()
    message = data.get('message', 'Você foi banido do servidor')
    minutes = data.get('minutes', 0)
    
    # Validar minutos
    try:
        minutes = int(minutes)
        if minutes < 0:
            return jsonify({
                'success': False,
                'message': 'Tempo em minutos deve ser maior ou igual a 0 (0 = permanente)'
            }), 400
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'message': 'Tempo em minutos deve ser um número válido'
        }), 400
    
    # Buscar dados do jogador no banco
    player = get_player_by_id(player_id)
    if not player:
        return jsonify({
            'success': False,
            'message': 'Jogador não encontrado no banco de dados'
        }), 404
    
    # Verificar se o jogador está online
    player_is_online = is_player_online(player_id)
    
    # Se jogador está offline
    if not player_is_online:
        # Para jogadores offline, apenas ban permanente é permitido
        if minutes != 0:
            return jsonify({
                'success': False,
                'message': 'Ban temporário só funciona para jogadores online. Para jogadores offline, use ban permanente (0 minutos).'
            }), 400
        
        # Verificar se tem SteamID
        steam_id = player.get('SteamID')
        if not steam_id:
            logger.warning(f"SteamID não encontrado para jogador {player_id}")
            return jsonify({
                'success': False,
                'message': 'SteamID não encontrado para este jogador. Não é possível banir jogador offline sem SteamID.'
            }), 400
        
        # Adicionar SteamID ao ban.txt
        logger.info(f"Jogador offline detectado. Adicionando SteamID {steam_id} ao arquivo ban.txt")
        if add_steamid_to_ban_file(steam_id):
            logger.info(f"SteamID {steam_id} adicionado com sucesso ao arquivo ban.txt")
            
            # Executar loadBans via RCON se RCON estiver configurado
            if config.RCON_PASSWORD:
                if execute_load_bans():
                    logger.info("Comando loadBans executado com sucesso após adicionar ban permanente no ban.txt")
                else:
                    logger.warning("Falha ao executar loadBans, mas o SteamID foi adicionado ao ban.txt")
            else:
                logger.warning("RCON não configurado. SteamID adicionado ao ban.txt, mas loadBans não foi executado")
            
            # Registrar evento na tabela players_events
            details = {
                'action_type': 'ban',
                'action_name': 'Banir',
                'ban_type': 'permanente',
                'source': 'ban.txt',
                'message': message,
                'steam_id': steam_id
            }
            
            try:
                insert_player_event(
                    player_id=player_id,
                    event_type='admin_action',
                    details=details
                )
                logger.info(f"Evento registrado para ban (offline) no jogador {player_id}")
            except Exception as e:
                logger.warning(f"Erro ao registrar evento para ban (offline): {str(e)}")
            
            return jsonify({
                'success': True,
                'message': 'Jogador banido permanentemente via ban.txt (offline)'
            })
        else:
            logger.error(f"Falha ao adicionar SteamID {steam_id} ao arquivo ban.txt")
            return jsonify({
                'success': False,
                'message': 'Erro ao adicionar jogador ao arquivo ban.txt. Verifique os logs do servidor.'
            }), 500
    
    # Se jogador está online, usar RCON (comportamento original)
    # Verificar se RCON está configurado
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return jsonify({
            'success': False,
            'message': 'Configuração RCON não encontrada. Verifique o config.json'
        }), 500
    
    # Verificar se tem RconGuid
    rcon_guid = player.get('RconGuid')
    if not rcon_guid:
        logger.warning(f"RconGuid não encontrado para jogador {player_id}")
        return jsonify({
            'success': False,
            'message': 'RconGuid não encontrado para este jogador'
        }), 400
    
    # Executar comando addban via RCON: addban <guid> <minutes> <mensagem>
    ban_command = f"addban {rcon_guid} {minutes} {message}"
    logger.info(f"Executando comando addban: {ban_command}")
    response = execute_rcon_command(ban_command)
    
    if response is None:
        logger.error(f"Falha ao executar comando ban via RCON para jogador {player_id}")
        return jsonify({
            'success': False,
            'message': 'Erro ao executar comando ban via RCON. Verifique os logs do servidor.'
        }), 500
    
    # Verificar se o comando foi executado com sucesso
    if isinstance(response, dict) and response.get('msg') == ['OK']:
        ban_type = 'permanente' if minutes == 0 else f'{minutes} minuto(s)'
        logger.info(f"Jogador {player_id} banido via RCON por {ban_type} com mensagem: {message[:50]}...")
        
        # Se o ban for permanente (minutes == 0 ou -1), adicionar SteamID ao ban.txt
        if minutes == 0 or minutes == -1:
            steam_id = player.get('SteamID')
            if steam_id:
                logger.info(f"Ban permanente detectado. Adicionando SteamID {steam_id} ao arquivo ban.txt")
                if add_steamid_to_ban_file(steam_id):
                    logger.info(f"SteamID {steam_id} adicionado com sucesso ao arquivo ban.txt")
                else:
                    logger.warning(f"Falha ao adicionar SteamID {steam_id} ao arquivo ban.txt, mas o ban via RCON foi aplicado")
            else:
                logger.warning(f"SteamID não encontrado para jogador {player_id}, não é possível adicionar ao ban.txt")
        
        # Executar loadBans para aplicar o ban (temporário ou permanente)
        if execute_load_bans():
            logger.info("Comando loadBans executado com sucesso após adicionar ban")
        else:
            logger.warning("Falha ao executar loadBans, mas o ban via RCON foi aplicado")
        
        # Registrar evento na tabela players_events
        details = {
            'action_type': 'ban',
            'action_name': 'Banir',
            'ban_type': ban_type,
            'source': 'rcon',
            'message': message,
            'minutes': minutes,
            'rcon_guid': rcon_guid
        }
        
        try:
            insert_player_event(
                player_id=player_id,
                event_type='admin_action',
                details=details
            )
            logger.info(f"Evento registrado para ban (online) no jogador {player_id}")
        except Exception as e:
            logger.warning(f"Erro ao registrar evento para ban (online): {str(e)}")
        
        return jsonify({
            'success': True,
            'message': f'Jogador banido com sucesso! ({ban_type})'
        })
    else:
        logger.warning(f"Resposta inesperada do RCON: {response}")
        return jsonify({
            'success': False,
            'message': 'Resposta inesperada do servidor RCON'
        }), 500


@api_players_bp.route('/api/players/<player_id>/chat', methods=['GET'])
@admin_required
def api_player_chat(player_id):
    """Buscar mensagens de chat do jogador"""
    try:
        # Buscar eventos do tipo chat_command e admin_message
        # Como get_player_events só aceita um event_type, vamos buscar todos e filtrar
        events, total_count = get_player_events(
            player_id=player_id,
            limit=100,  # Limite maior para histórico de chat
            offset=0,
            event_type=None  # Buscar todos os tipos
        )
        
        # Filtrar apenas eventos de chat
        chat_events = [e for e in events if e.get('EventType') in ['chat_command', 'chat_message', 'admin_message']]
        
        # Processar eventos e extrair mensagens
        messages = []
        for event in chat_events:
            try:
                event_type = event.get('EventType', '')
                details = json.loads(event.get('Details', '{}'))
                
                # Buscar mensagem em 'message' ou 'chat_message' (compatibilidade)
                message_text = details.get('message', '') or details.get('chat_message', '')
                
                # Determinar tipo de mensagem baseado no tipo de evento
                if event_type == 'chat_command':
                    command_name = details.get('command_name', '') or details.get('command', '')
                    msg_type = 'player_message'
                elif event_type == 'chat_message':
                    # Mensagem normal do jogador (sem comando)
                    msg_type = 'player_message'
                    command_name = ''
                elif event_type == 'admin_message':
                    msg_type = 'admin_message'
                    command_name = ''
                else:
                    continue  # Ignorar outros tipos de evento
                
                # Converter timestamp de UTC para America/Sao_Paulo (UTC-3)
                event_timestamp = event.get('TimeStamp')
                if event_timestamp:
                    # Se for string, converter para datetime
                    if isinstance(event_timestamp, str):
                        try:
                            # Tentar parsear como ISO format
                            dt = datetime.fromisoformat(event_timestamp.replace('Z', '+00:00'))
                        except ValueError:
                            # Tentar parsear outros formatos comuns
                            try:
                                dt = datetime.strptime(event_timestamp, '%Y-%m-%d %H:%M:%S')
                                # Assumir UTC se não tiver timezone
                                dt = dt.replace(tzinfo=timezone.utc)
                            except ValueError:
                                logger.warning(f"Formato de timestamp não reconhecido: {event_timestamp}")
                                dt = None
                    else:
                        # Se já for datetime, usar diretamente
                        dt = event_timestamp
                        if dt.tzinfo is None:
                            # Se não tiver timezone, assumir UTC
                            dt = dt.replace(tzinfo=timezone.utc)
                    
                    if dt:
                        # Converter de UTC para America/Sao_Paulo (UTC-3)
                        sao_paulo_tz = timezone(timedelta(hours=-3))
                        dt_sao_paulo = dt.astimezone(sao_paulo_tz)
                        # Converter de volta para string ISO para o frontend
                        timestamp_str = dt_sao_paulo.isoformat()
                    else:
                        timestamp_str = event_timestamp
                else:
                    timestamp_str = event_timestamp
                
                messages.append({
                    'id': event.get('EventId'),
                    'timestamp': timestamp_str,
                    'message': message_text,
                    'command_name': command_name,
                    'type': msg_type
                })
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning(f"Erro ao processar evento de chat {event.get('EventId')}: {str(e)}")
                continue
        
        # Ordenar por timestamp (mais antigo primeiro para chat)
        messages.sort(key=lambda x: x['timestamp'])
        
        return jsonify({
            'success': True,
            'messages': messages,
            'total': len(messages)
        })
        
    except Exception as e:
        logger.exception("Erro ao buscar mensagens de chat")
        return jsonify({
            'success': False,
            'message': f'Erro ao buscar mensagens: {str(e)}'
        }), 500


@api_players_bp.route('/api/players/<player_id>/bans', methods=['GET'])
@admin_required
def api_player_bans(player_id):
    """Consultar histórico de bans do jogador via RCON e ban.txt"""
    # Buscar dados do jogador no banco
    player = get_player_by_id(player_id)
    if not player:
        return jsonify({
            'success': False,
            'message': 'Jogador não encontrado no banco de dados'
        }), 404
    
    player_bans = {
        'guid_bans': [],
        'ip_bans': [],
        'ban_txt': None
    }
    
    # Verificar se SteamID está no ban.txt
    steam_id = player.get('SteamID')
    if steam_id:
        is_banned_in_file = steamid_exists_in_ban_file(steam_id)
        if is_banned_in_file:
            player_bans['ban_txt'] = {
                'steam_id': steam_id,
                'banned': True,
                'type': 'permanent',
                'source': 'ban.txt'
            }
    
    # Verificar se tem RconGuid para consultar RCON
    rcon_guid = player.get('RconGuid')
    if rcon_guid:
        # Verificar se RCON está configurado
        if not config.RCON_PASSWORD:
            logger.warning("RCON_PASSWORD não está configurada, pulando consulta de bans via RCON")
        else:
            # Executar comando bans via RCON
            logger.info(f"Consultando bans para GUID: {rcon_guid}")
            response = execute_rcon_command('bans')
            
            if response is not None:
                # Filtrar bans por GUID do jogador
                rcon_guid_lower = rcon_guid.lower()
                
                if isinstance(response, dict):
                    # Filtrar guid_bans
                    guid_bans = response.get('guid_bans', [])
                    if isinstance(guid_bans, list):
                        for ban in guid_bans:
                            if isinstance(ban, dict) and ban.get('guid', '').lower() == rcon_guid_lower:
                                player_bans['guid_bans'].append(ban)
                    
                    # Filtrar ip_bans (se o jogador tiver IP no banco, podemos filtrar também)
                    ip_bans = response.get('ip_bans', [])
                    if isinstance(ip_bans, list):
                        # Por enquanto, retornar todos os IP bans (pode ser melhorado se tivermos IP do jogador)
                        player_bans['ip_bans'] = ip_bans
    
    logger.info(f"Encontrados {len(player_bans['guid_bans'])} ban(s) por GUID, {len(player_bans['ip_bans'])} ban(s) por IP e ban.txt: {player_bans['ban_txt'] is not None}")
    return jsonify({
        'success': True,
        'bans': player_bans
    })


@api_players_bp.route('/api/players/<player_id>/unban', methods=['POST'])
@admin_required
@audit_action('PLAYER_UNBAN')
def api_player_unban(player_id):
    """Desbanir jogador via RCON ou ban.txt"""
    data = request.get_json()
    ban_id = data.get('ban_id')
    source = data.get('source', 'rcon')  # 'rcon' ou 'ban_txt'
    
    # Buscar dados do jogador no banco
    player = get_player_by_id(player_id)
    if not player:
        return jsonify({
            'success': False,
            'message': 'Jogador não encontrado no banco de dados'
        }), 404
    
    # Se for remoção do ban.txt
    if source == 'ban_txt':
        steam_id = player.get('SteamID')
        if not steam_id:
            logger.warning(f"SteamID não encontrado para jogador {player_id}")
            return jsonify({
                'success': False,
                'message': 'SteamID não encontrado para este jogador'
            }), 400
        
        # Verificar se está no ban.txt
        if not steamid_exists_in_ban_file(steam_id):
            logger.info(f"SteamID {steam_id} não está no ban.txt")
            return jsonify({
                'success': False,
                'message': 'Jogador não está banido no arquivo ban.txt'
            }), 404
        
        # Remover do ban.txt
        logger.info(f"Removendo SteamID {steam_id} do arquivo ban.txt")
        if remove_steamid_from_ban_file(steam_id):
            logger.info(f"SteamID {steam_id} removido com sucesso do arquivo ban.txt")
            
            # Executar loadBans via RCON se RCON estiver configurado
            if config.RCON_PASSWORD:
                if execute_load_bans():
                    logger.info("Comando loadBans executado com sucesso após remover ban do ban.txt")
                else:
                    logger.warning("Falha ao executar loadBans, mas o SteamID foi removido do ban.txt")
            else:
                logger.warning("RCON não configurado. SteamID removido do ban.txt, mas loadBans não foi executado")
            
            return jsonify({
                'success': True,
                'message': 'Ban removido do ban.txt com sucesso!'
            })
        else:
            logger.error(f"Falha ao remover SteamID {steam_id} do arquivo ban.txt")
            return jsonify({
                'success': False,
                'message': 'Erro ao remover ban do arquivo ban.txt. Verifique os logs do servidor.'
            }), 500
    
    # Se for remoção via RCON (comportamento original)
    # Verificar se RCON está configurado
    if not config.RCON_PASSWORD:
        logger.error("RCON_PASSWORD não está configurada")
        return jsonify({
            'success': False,
            'message': 'Configuração RCON não encontrada. Verifique o config.json'
        }), 500
    
    # Validar ban_id
    if ban_id is None:
        return jsonify({
            'success': False,
            'message': 'ban_id é obrigatório para remoção via RCON'
        }), 400
    
    try:
        ban_id = int(ban_id)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'message': 'ban_id deve ser um número válido'
        }), 400
    
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
    
    # Validar se o ban pertence ao jogador
    # Buscar lista de bans para verificar
    logger.info(f"Validando ban {ban_id} para GUID: {rcon_guid}")
    response = execute_rcon_command('bans')
    
    if response is None:
        logger.error(f"Falha ao consultar bans via RCON para validação")
        return jsonify({
            'success': False,
            'message': 'Erro ao validar ban via RCON. Verifique os logs do servidor.'
        }), 500
    
    # Verificar se o ban existe e pertence ao jogador
    rcon_guid_lower = rcon_guid.lower()
    ban_found = False
    
    if isinstance(response, dict):
        guid_bans = response.get('guid_bans', [])
        if isinstance(guid_bans, list):
            for ban in guid_bans:
                if isinstance(ban, dict):
                    ban_guid = ban.get('guid', '').lower()
                    ban_ban_id = ban.get('id')
                    if ban_guid == rcon_guid_lower and ban_ban_id == ban_id:
                        ban_found = True
                        break
    
    if not ban_found:
        logger.warning(f"Ban {ban_id} não encontrado ou não pertence ao jogador {player_id}")
        return jsonify({
            'success': False,
            'message': 'Ban não encontrado ou não pertence a este jogador'
        }), 404
    
    # Executar comando removeban via RCON: removeban <ban_id>
    unban_command = f"removeban {ban_id}"
    logger.info(f"Executando comando removeban: {unban_command}")
    response = execute_rcon_command(unban_command)
    
    if response is None:
        logger.error(f"Falha ao executar comando removeban via RCON para ban {ban_id}")
        return jsonify({
            'success': False,
            'message': 'Erro ao executar comando removeban via RCON. Verifique os logs do servidor.'
        }), 500
    
    # Verificar se o comando foi executado com sucesso
    if isinstance(response, dict) and response.get('msg') == ['OK']:
        logger.info(f"Ban {ban_id} removido via RCON para jogador {player_id}")
        
        # Remover SteamID do ban.txt se existir e executar loadBans
        steam_id = player.get('SteamID')
        if steam_id:
            logger.info(f"Removendo SteamID {steam_id} do arquivo ban.txt")
            if remove_steamid_from_ban_file(steam_id):
                logger.info(f"SteamID {steam_id} removido com sucesso do arquivo ban.txt")
                # Executar loadBans para atualizar os bans do arquivo
                if execute_load_bans():
                    logger.info("Comando loadBans executado com sucesso após remover ban permanente")
                else:
                    logger.warning("Falha ao executar loadBans, mas o SteamID foi removido do ban.txt")
            else:
                logger.info(f"SteamID {steam_id} não encontrado no arquivo ban.txt ou já foi removido")
        else:
            logger.warning(f"SteamID não encontrado para jogador {player_id}, não é possível remover do ban.txt")
        
        return jsonify({
            'success': True,
            'message': f'Ban removido com sucesso!'
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
        # Escrever comando (SSH ou arquivo local)
        if not write_command_to_file(command_line):
            logger.error(f"Erro ao enviar comando: {command_line.strip()}")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
        
        logger.info(f"Comando enviado: {command_line.strip()}")
        
        # Registrar evento na tabela players_events
        action_names = {
            'heal': 'Curar',
            'kill': 'Matar',
            'desbug': 'Corrigir Posição',
            'godmode': 'Ativar God Mode',
            'ungodmode': 'Remover God Mode',
            'ghostmode': 'Ativar Ghost Mode',
            'unghostmode': 'Remover Ghost Mode',
            'getposition': 'Obter Posição'
        }
        
        action_name = action_names.get(action, action)
        details = {
            'action_type': action,
            'action_name': action_name,
            'command': command_line.strip()
        }
        
        try:
            insert_player_event(
                player_id=player_id,
                event_type='admin_action',
                details=details
            )
            logger.info(f"Evento registrado para ação {action} no jogador {player_id}")
        except Exception as e:
            logger.warning(f"Erro ao registrar evento para ação {action}: {str(e)}")
        
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
