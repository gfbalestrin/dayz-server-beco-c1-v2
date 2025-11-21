"""
Blueprint de API de Veículos
"""
from flask import Blueprint, request, jsonify
import config
import os
import logging
import fcntl
from blueprints.auth import admin_required, audit_action

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
