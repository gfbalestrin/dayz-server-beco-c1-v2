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
    get_vehicle_tracking_attachments
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

@api_vehicles_bp.route('/api/vehicles/data', methods=['GET'])
@admin_required
def api_vehicles_data():
    """Endpoint para dados paginados de veículos com filtros"""
    try:
        # Parâmetros de paginação
        start = int(request.args.get('start', 0))
        length = int(request.args.get('length', 50))
        
        # Filtros
        include_destroyed = request.args.get('include_destroyed', 'false').lower() == 'true'
        date_from = request.args.get('date_from', None)
        date_to = request.args.get('date_to', None)
        search = request.args.get('search', None)
        
        # Buscar dados paginados
        data, total_records = get_vehicles_paginated(
            include_destroyed=include_destroyed,
            date_from=date_from,
            date_to=date_to,
            start=start,
            length=length,
            search=search
        )
        
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
    """Endpoint para histórico completo de um veículo"""
    try:
        limit = int(request.args.get('limit', 100))
        
        # Buscar histórico
        history = get_vehicle_history(vehicle_id, limit=limit)
        
        # Para cada registro, buscar items e attachments
        for record in history:
            tracking_id = record['IdVehicleTracking']
            record['items'] = get_vehicle_tracking_items(tracking_id)
            record['attachments'] = get_vehicle_tracking_attachments(tracking_id)
        
        return jsonify({
            'success': True,
            'vehicle_id': vehicle_id,
            'history': history
        })
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar histórico do veículo {vehicle_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao buscar histórico do veículo',
            'message': str(e)
        }), 500
