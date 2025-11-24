"""
Blueprint de API de Veículos
"""
from flask import Blueprint, request, jsonify
import config
import os
import logging
import fcntl
from blueprints.auth import admin_required, audit_action
from database import (
    get_vehicles_paginated, 
    get_vehicle_history, 
    get_vehicle_tracking_items, 
    get_vehicle_tracking_attachments,
    count_vehicle_history
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
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        if coord_z is not None and coord_z != 0:
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} {coord_z} {coord_y}\n"
        else:
            command_line = f"SYSTEM teleportvehicle {vehicle_id} {coord_x} 0 {coord_y}\n"
        
        logger.info(f"Adicionando comando de teleporte de veículo: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
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
        
        commands_file = config.COMMANDS_FILE
        
        if not os.path.exists(commands_file):
            logger.error(f"Arquivo de comandos não encontrado: {commands_file}")
            return jsonify({
                'success': False,
                'message': 'Arquivo de comandos não encontrado'
            }), 500
        
        command_line = f"SYSTEM checkvehicle {vehicle_id} {request_id}\n"
        logger.info(f"Adicionando comando de atualização de veículo: {command_line.strip()}")
        
        try:
            with open(commands_file, 'a') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    f.write(command_line)
                    f.flush()
                    os.fsync(f.fileno())
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            
            logger.info("Comando de atualização de veículo adicionado com sucesso")
            return jsonify({
                'success': True,
                'message': 'Comando enviado com sucesso',
                'request_id': request_id
            })
        except IOError as e:
            logger.error(f"Erro ao escrever comando de atualização de veículo: {e}")
            return jsonify({
                'success': False,
                'message': f'Erro ao escrever comando: {str(e)}'
            }), 500
    except Exception as e:
        logger.exception("Erro inesperado ao atualizar veículo")
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
        include_destroyed_param = request.args.get('include_destroyed', 'false')
        include_destroyed = include_destroyed_param.lower() == 'true'
        only_with_changes_param = request.args.get('only_with_changes', 'false')
        only_with_changes = only_with_changes_param.lower() == 'true'
        date_from = request.args.get('date_from', None)
        date_to = request.args.get('date_to', None)
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
        logger.debug(f"API vehicles/data - include_destroyed param: '{include_destroyed_param}', parsed: {include_destroyed}")
        
        # Buscar dados paginados
        data, total_records = get_vehicles_paginated(
            include_destroyed=include_destroyed,
            only_with_changes=only_with_changes,
            date_from=date_from,
            date_to=date_to,
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
        
        # Se não há parâmetros de paginação, usar comportamento padrão (limit 100)
        if page is None and per_page is None:
            limit = int(request.args.get('limit', 100))
            offset = 0
            total_records = None
            total_pages = None
            current_page = 1
            per_page_value = limit
        else:
            # Paginação ativa
            page = int(page) if page else 1
            per_page_value = int(per_page) if per_page else 10
            
            # Validar valores
            if page < 1:
                page = 1
            if per_page_value < 1:
                per_page_value = 10
            
            # Calcular offset
            offset = (page - 1) * per_page_value
            limit = per_page_value
            
            # Contar total de registros com filtros aplicados
            total_records = count_vehicle_history(vehicle_id, date_from=date_from, date_to=date_to)
            total_pages = (total_records + per_page_value - 1) // per_page_value if total_records > 0 else 1
            current_page = page
        
        # Buscar histórico
        history = get_vehicle_history(
            vehicle_id, 
            limit=limit, 
            offset=offset,
            date_from=date_from,
            date_to=date_to
        )
        
        # Para cada registro, buscar items e attachments
        for record in history:
            tracking_id = record['IdVehicleTracking']
            record['items'] = get_vehicle_tracking_items(tracking_id)
            record['attachments'] = get_vehicle_tracking_attachments(tracking_id)
        
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
