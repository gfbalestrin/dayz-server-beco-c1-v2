"""
Blueprint de API de Comandos e Mensagens
Rotas de API para comandos e mensagens globais
"""
from flask import Blueprint, request, jsonify
import logging
import fcntl
import os
import json
import subprocess
import config
from database import get_item_details_from_items_db
from blueprints.auth import admin_required, audit_action

# Importar SSH client se disponível
try:
    from ssh_client import read_remote_file
    SSH_AVAILABLE = True
except ImportError:
    SSH_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("ssh_client não disponível, usando arquivo local")


def read_results_file() -> tuple[list[str] | None, str | None]:
    """Lê arquivo de resultados (local ou remoto via SSH)"""
    if SSH_AVAILABLE and config.DAYZ_SERVER_SSH_HOST and config.DAYZ_SERVER_RESULTS_FILE:
        # Usar SSH para ler remotamente
        content = read_remote_file(config.DAYZ_SERVER_RESULTS_FILE)
        if content is None:
            return None, "Erro ao ler arquivo de resultados via SSH"
        lines = content.split('\n')
        return lines, None
    else:
        # Fallback para arquivo local
        if hasattr(config, 'COMMANDS_RESULTS_FILE') and config.COMMANDS_RESULTS_FILE:
            results_file = config.COMMANDS_RESULTS_FILE
            if os.path.exists(results_file):
                try:
                    with open(results_file, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    return lines, None
                except IOError as e:
                    return None, f"Erro ao ler arquivo de resultados: {str(e)}"
        return None, "Arquivo de resultados não encontrado"

api_commands_bp = Blueprint('api_commands', __name__)
logger = logging.getLogger(__name__)


def execute_rcon_command(command):
    """
    Executa um comando RCON usando bercon-cli
    
    Args:
        command: Comando RCON a executar (ex: 'say -1 Mensagem')
    
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


@api_commands_bp.route('/api/commands/results/<request_id>')
@admin_required
def api_command_results(request_id):
    """API para obter resultado de um comando pelo request_id"""
    try:
        # Ler arquivo de resultados (SSH ou local)
        lines, error = read_results_file()
        
        if lines is None:
            logger.error(f"Erro ao ler arquivo de resultados: {error}")
            return jsonify({
                'status': 'error',
                'message': error or 'Arquivo de resultados não encontrado'
            }), 404 if 'não encontrado' in (error or '') else 500
        
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
                        enriched_item = dict(item)
                        enriched_item['type'] = item_type
                        if 'quantity' not in enriched_item:
                            enriched_item['quantity'] = item.get('quantity', 1)
                        enriched_item['name'] = item_details['name'] if item_details else item.get('name') or item_type
                        enriched_item['img'] = item_details['img'] if item_details else item.get('img', '')
                        enriched_items.append(enriched_item)
                    else:
                        enriched_items.append(item)
                result_data['items'] = enriched_items
            
            if result_data.get('attachments'):
                enriched_attachments = []
                for attachment in result_data['attachments']:
                    # Lidar com attachments que podem ser strings (fences) ou objetos (veículos)
                    if isinstance(attachment, str):
                        # Se for string, converter para objeto com type
                        attachment_type = attachment
                        attachment = {'type': attachment_type}
                    else:
                        attachment_type = attachment.get('type', '')
                    
                    if attachment_type:
                        attachment_details = get_item_details_from_items_db(attachment_type)
                        enriched_attachment = dict(attachment)
                        enriched_attachment['type'] = attachment_type
                        enriched_attachment['name'] = attachment_details['name'] if attachment_details else attachment.get('name') or attachment_type
                        enriched_attachment['img'] = attachment_details['img'] if attachment_details else attachment.get('img', '')
                        enriched_attachments.append(enriched_attachment)
                    else:
                        enriched_attachments.append(attachment)
                result_data['attachments'] = enriched_attachments
            
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


@api_commands_bp.route('/api/messages/global', methods=['POST'])
@admin_required
@audit_action('SEND_GLOBAL_MESSAGE')
def api_send_global_message():
    """API para enviar mensagem global a todos os jogadores online via RCON"""
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
        
        logger.debug(f"Send global message request: message_length={len(message)}")
        
        if not message:
            return jsonify({'success': False, 'message': 'Mensagem não pode estar vazia'}), 400
        
        # Executar comando say via RCON: say -1 Mensagem (broadcast)
        say_command = f"say -1 {message}"
        logger.info(f"Executando comando say global: {say_command}")
        response = execute_rcon_command(say_command)
        
        if response is None:
            logger.error(f"Falha ao executar comando say global via RCON")
            return jsonify({
                'success': False,
                'message': 'Erro ao executar comando say global via RCON. Verifique os logs do servidor.'
            }), 500
        
        # Verificar se o comando foi executado com sucesso
        if isinstance(response, dict) and response.get('msg') == ['OK']:
            logger.info(f"Mensagem global enviada via RCON: {message[:50]}...")
            return jsonify({
                'success': True,
                'message': 'Mensagem global enviada com sucesso!'
            })
        else:
            logger.warning(f"Resposta inesperada do RCON: {response}")
            return jsonify({
                'success': False,
                'message': 'Resposta inesperada do servidor RCON'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao enviar mensagem global")
        return jsonify({
            'success': False,
            'message': f'Erro ao enviar mensagem: {str(e)}'
        }), 500
