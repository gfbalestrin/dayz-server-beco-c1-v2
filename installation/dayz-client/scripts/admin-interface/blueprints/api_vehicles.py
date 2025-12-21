"""
Blueprint de API de Veículos
"""
from flask import Blueprint, request, jsonify
import config
import os
import logging
import fcntl
from blueprints.auth import admin_required, audit_action
from blueprints.helpers import write_command_to_file
from database import (
    get_vehicles_paginated, 
    get_vehicle_history, 
    get_vehicle_tracking_items, 
    get_vehicle_tracking_attachments,
    count_vehicle_history,
    filter_vehicle_history_by_changes,
    get_item_details_from_items_db
)

api_vehicles_bp = Blueprint('api_vehicles', __name__)

@api_vehicles_bp.route('/api/vehicles/<vehicle_id>/teleport', methods=['POST'])
@admin_required
@audit_action('TELEPORT_VEHICLE')
def api_teleport_vehicle(vehicle_id):
    """API para teleportar veículo para uma posição usando sistema de comandos DayZ"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        coord_x = data.get('coord_x')
        coord_y = data.get('coord_y')
        coord_z = data.get('coord_z')
        
        logger.debug(f"Teleport vehicle request: vehicle_id={vehicle_id}, x={coord_x}, y={coord_y}, z={coord_z}")
        
        if coord_x is None or coord_y is None:
            return jsonify({'success': False, 'message': 'Coordenadas não fornecidas'}), 400
        
        if coord_z is not None and coord_z != 0:
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} {coord_z} {coord_y}\n"
        else:
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte de veículo: {command_line.strip()}")
        
        if write_command_to_file(command_line):
            logger.info("Comando de teleporte de veículo adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de teleporte enviado! O veículo será teleportado em instantes.'
            })
        else:
            logger.error("Erro ao escrever comando de teleporte de veículo")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao teleportar veículo: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_vehicles_bp.route('/api/vehicles/<vehicle_id>/flip', methods=['POST'])
@admin_required
@audit_action('FLIP_VEHICLE')
def api_flip_vehicle(vehicle_id):
    """API para virar veículo capotado usando sistema de comandos DayZ"""
    logger = logging.getLogger(__name__)
    
    try:
        logger.debug(f"Flip vehicle request: vehicle_id={vehicle_id}")
        
        command_line = f"SYSTEM flipvehicle {vehicle_id}\n"
        
        logger.info(f"Adicionando comando de virar veículo: {command_line.strip()}")
        
        if write_command_to_file(command_line):
            logger.info("Comando de virar veículo adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando de virar veículo enviado! O veículo será virado em instantes.'
            })
        else:
            logger.error("Erro ao escrever comando de virar veículo")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
            
    except Exception as e:
        logger.error(f"Erro inesperado ao virar veículo: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_vehicles_bp.route('/api/vehicles/<vehicle_id>/refresh', methods=['POST'])
@admin_required
@audit_action('CHECK_VEHICLE')
def api_refresh_vehicle(vehicle_id):
    """API para solicitar atualização dos dados de um veículo rastreado"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json(silent=True) or {}
        request_id = data.get('request_id')
        
        if not request_id:
            return jsonify({
                'success': False,
                'message': 'request_id não fornecido'
            }), 400
        
        command_line = f"SYSTEM checkvehicle {vehicle_id} {request_id}\n"
        logger.info(f"Adicionando comando de atualização de veículo: {command_line.strip()}")
        
        if write_command_to_file(command_line):
            logger.info("Comando de atualização de veículo adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
        else:
            logger.error("Erro ao escrever comando de atualização de veículo")
            return jsonify({
                'success': False,
                'message': 'Erro ao enviar comando. Verifique a configuração SSH ou arquivo de comandos.'
            }), 500
    except Exception as e:
        logger.exception("Erro inesperado ao atualizar veículo")
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_vehicles_bp.route('/api/vehicles/<vehicle_id>/save-check', methods=['POST'])
@admin_required
@audit_action('SAVE_VEHICLE_CHECK')
def api_save_vehicle_check(vehicle_id):
    """API para salvar dados coletados via checkvehicle no banco de dados"""
    logger = logging.getLogger(__name__)
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'Dados não fornecidos'
            }), 400
        
        vehicle_name = data.get('vehicle_name', 'Veículo')
        position = data.get('position', {})
        items = data.get('items', [])
        attachments = data.get('attachments', [])
        health_parts = data.get('health_parts', {})
        
        if not position:
            return jsonify({
                'success': False,
                'message': 'Posição não fornecida'
            }), 400
        
        from database import save_vehicle_check_data
        
        vehicle_tracking_id = save_vehicle_check_data(
            vehicle_id=vehicle_id,
            vehicle_name=vehicle_name,
            position=position,
            items=items,
            attachments=attachments,
            health_parts=health_parts
        )
        
        if vehicle_tracking_id:
            logger.info(f"Dados do veículo {vehicle_id} salvos no banco (tracking_id: {vehicle_tracking_id})")
            return jsonify({
                'success': True,
                'message': 'Dados salvos com sucesso',
                'vehicle_tracking_id': vehicle_tracking_id
            })
        else:
            logger.error(f"Falha ao salvar dados do veículo {vehicle_id} no banco")
            return jsonify({
                'success': False,
                'message': 'Erro ao salvar dados no banco'
            }), 500
            
    except Exception as e:
        logger.exception("Erro inesperado ao salvar dados do veículo")
        return jsonify({
            'success': False,
            'message': f'Erro inesperado: {str(e)}'
        }), 500

@api_vehicles_bp.route('/api/vehicles/data', methods=['GET'])
@admin_required
def api_vehicles_data():
    """Endpoint para dados paginados de veículos com filtros"""
    try:
        # Parâmetros de paginação
        start = int(request.args.get('start', 0))
        length = int(request.args.get('length', 50))
        
        # Filtros
        status_filter = request.args.get('status_filter', 'active')
        change_types = request.args.getlist('change_types[]')
        if not change_types:
            change_types = request.args.getlist('change_types')
        datetime_from = request.args.get('datetime_from', None) or request.args.get('date_from', None)
        datetime_to = request.args.get('datetime_to', None) or request.args.get('date_to', None)
        search = request.args.get('search', None)
        
        # Parâmetros de ordenação do DataTables
        order_column = request.args.get('order[0][column]', None)
        order_dir = request.args.get('order[0][dir]', 'desc')
        
        # Mapear índice da coluna para campo do banco
        column_map = {
            '0': 'VehicleId',
            '1': 'VehicleName',
            '2': 'IsDestroyed',
            '3': 'ChangeCount',  # Não ordenável no servidor, será ignorado
            '6': 'TimeStamp'
        }
        
        order_by = None
        order_by_change_count = False
        order_by_change_count_dir = None
        if order_column and order_column in column_map:
            field = column_map[order_column]
            # ChangeCount não pode ser ordenado no servidor (calculado depois)
            if field == 'ChangeCount':
                order_by_change_count = True
                order_by_change_count_dir = order_dir.lower()
            else:
                order_by = (field, order_dir.lower())
        
        # Log de debug (pode ser removido depois)
        logger = logging.getLogger(__name__)
        logger.debug(f"API vehicles/data - status_filter: '{status_filter}', datetime_from: '{datetime_from}', datetime_to: '{datetime_to}', change_types: {change_types}")
        
        # Buscar dados paginados
        data, total_records = get_vehicles_paginated(
            status_filter=status_filter,
            change_types=change_types,
            date_from=datetime_from,
            date_to=datetime_to,
            start=start,
            length=length,
            search=search,
            order_by=order_by,
            order_by_change_count=order_by_change_count,
            order_by_change_count_dir=order_by_change_count_dir if order_by_change_count else None
        )
        
        logger.debug(f"API vehicles/data - total_records: {total_records}, data length: {len(data)}")
        
        return jsonify({
            'data': data,
            'recordsTotal': total_records,
            'recordsFiltered': total_records
        })
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar dados de veículos: {e}", exc_info=True)
        return jsonify({
            'error': 'Erro ao buscar dados de veículos',
            'message': str(e)
        }), 500

@api_vehicles_bp.route('/api/vehicles/<vehicle_id>/history', methods=['GET'])
@admin_required
def api_vehicle_history(vehicle_id):
    """Endpoint para histórico de um veículo com suporte a filtros de data e paginação"""
    try:
        # Parâmetros de paginação (compatibilidade: se não houver, usar comportamento padrão)
        page = request.args.get('page', None)
        per_page = request.args.get('per_page', None)
        
        # Filtros de data
        date_from = request.args.get('date_from', None)
        date_to = request.args.get('date_to', None)
        
        # Validar formato de data se fornecido
        if date_from:
            try:
                # Validar formato YYYY-MM-DD
                from datetime import datetime
                datetime.strptime(date_from, '%Y-%m-%d')
            except ValueError:
                return jsonify({
                    'success': False,
                    'error': 'Formato de data inválido. Use YYYY-MM-DD'
                }), 400
        
        if date_to:
            try:
                from datetime import datetime
                datetime.strptime(date_to, '%Y-%m-%d')
            except ValueError:
                return jsonify({
                    'success': False,
                    'error': 'Formato de data inválido. Use YYYY-MM-DD'
                }), 400
        
        # IMPORTANTE: Para filtrar corretamente registros sem mudanças, precisamos:
        # 1. Buscar TODOS os registros (sem paginação inicial)
        # 2. Carregar items/attachments para todos
        # 3. Filtrar mantendo apenas os com mudanças significativas consecutivas
        # 4. Aplicar paginação nos resultados filtrados
        
        # Buscar TODOS os registros do histórico (sem limite inicial)
        # Limitar a 5000 registros para evitar problemas de memória
        all_history = get_vehicle_history(
            vehicle_id, 
            limit=5000, 
            offset=0,
            date_from=date_from,
            date_to=date_to
        )
        
        # Para cada registro, buscar items e attachments
        # Se o registro for parcial (IsPartialUpdate = 1), buscar do último registro completo anterior
        for record in all_history:
            tracking_id = record['IdVehicleTracking']
            is_partial = record.get('IsPartialUpdate', 0) == 1
            
            # Se for registro parcial, buscar o último registro completo anterior
            if is_partial:
                from database import DatabaseConnection
                import config
                with DatabaseConnection(config.DB_VEHICLES) as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT IdVehicleTracking
                        FROM vehicles_tracking
                        WHERE VehicleId = ? AND IsPartialUpdate = 0 AND TimeStamp <= ?
                        ORDER BY TimeStamp DESC
                        LIMIT 1
                    """, (vehicle_id, record['TimeStamp']))
                    result = cursor.fetchone()
                    if result:
                        tracking_id = result[0]
            
            raw_items = get_vehicle_tracking_items(tracking_id)
            raw_attachments = get_vehicle_tracking_attachments(tracking_id)

            # Enriquecer items com nome/imagem
            enriched_items = []
            for item in raw_items:
                item_type = item.get('ItemType') or ''
                item_health = item.get('ItemHealth')
                item_info = get_item_details_from_items_db(item_type)
                enriched_items.append({
                    'ItemType': item_type,
                    'ItemHealth': item_health,
                    'name': item_info.get('name', item_type) if item_info else item_type,
                    'img': item_info.get('img', '') if item_info else ''
                })

            enriched_attachments = []
            for attachment in raw_attachments:
                attachment_type = attachment.get('AttachmentType') or ''
                attachment_health = attachment.get('AttachmentHealth')
                attachment_info = get_item_details_from_items_db(attachment_type)
                enriched_attachments.append({
                    'AttachmentType': attachment_type,
                    'AttachmentHealth': attachment_health,
                    'name': attachment_info.get('name', attachment_type) if attachment_info else attachment_type,
                    'img': attachment_info.get('img', '') if attachment_info else ''
                })

            record['items'] = enriched_items
            record['attachments'] = enriched_attachments
        
        # Filtrar registros sem mudanças significativas consecutivas
        # Isso reduz drasticamente o número de registros (de 1500+ para ~6 eventos com mudanças)
        filtered_history = filter_vehicle_history_by_changes(all_history)
        
        # Aplicar paginação nos registros filtrados
        if page is None and per_page is None:
            per_page_value = int(request.args.get('limit', 100))
            current_page = 1
        else:
            # Paginação ativa
            page = int(page) if page else 1
            per_page_value = int(per_page) if per_page else 10
            
            # Validar valores
            if page < 1:
                page = 1
            if per_page_value < 1:
                per_page_value = 10
            
            current_page = page
        
        # Calcular paginação sobre os registros filtrados
        total_filtered_records = len(filtered_history)
        total_pages = (total_filtered_records + per_page_value - 1) // per_page_value if total_filtered_records > 0 else 1
        
        # Ajustar página atual se necessário
        if current_page > total_pages:
            current_page = total_pages
        
        # Aplicar paginação aos registros filtrados
        start_idx = (current_page - 1) * per_page_value
        end_idx = start_idx + per_page_value
        history = filtered_history[start_idx:end_idx]
        
        # Total de registros para paginação (baseado nos filtrados)
        total_records = total_filtered_records
        
        # Preparar resposta
        response = {
            'success': True,
            'vehicle_id': vehicle_id,
            'history': history
        }
        
        # Adicionar metadados de paginação se paginação estiver ativa
        if total_records is not None:
            response['pagination'] = {
                'total_records': total_records,
                'total_pages': total_pages,
                'current_page': current_page,
                'per_page': per_page_value
            }
        
        return jsonify(response)
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar histórico do veículo {vehicle_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao buscar histórico do veículo',
            'message': str(e)
        }), 500
