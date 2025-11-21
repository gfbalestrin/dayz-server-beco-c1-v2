"""
Blueprint de API de Comandos e Mensagens
Rotas de API para comandos e mensagens globais
"""
from flask import Blueprint, request, jsonify
import logging
import fcntl
import os
import json
import config
from database import get_item_details_from_items_db
from blueprints.auth import admin_required, audit_action

api_commands_bp = Blueprint('api_commands', __name__)
logger = logging.getLogger(__name__)


@api_commands_bp.route('/api/commands/results/<request_id>')
@admin_required
def api_command_results(request_id):
    """API para obter resultado de um comando pelo request_id"""
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


@api_commands_bp.route('/api/messages/global', methods=['POST'])
@admin_required
@audit_action('SEND_GLOBAL_MESSAGE')
def api_send_global_message():
    """API para enviar mensagem global a todos os jogadores online"""
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
