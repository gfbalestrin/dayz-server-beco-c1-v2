"""
Blueprint de API de Structures (Fences, Watchtowers, Flags)
"""
from flask import Blueprint, request, jsonify
import config
import logging
from blueprints.auth import admin_required
from database import (
    get_structures_paginated,
    get_structure_history,
    filter_structure_history_by_changes
)

api_structures_bp = Blueprint('api_structures', __name__)

@api_structures_bp.route('/api/structures/data', methods=['GET'])
@admin_required
def api_structures_data():
    """Endpoint para dados paginados de estruturas com filtros"""
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
            '0': 'StructureId',
            '1': 'StructureName',
            '2': 'StructureType',
            '3': 'IsDestroyed',
            '4': 'ChangeCount',  # Não ordenável no servidor, será ignorado
            '6': 'TimeStamp'  # Coluna 6
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
        
        # Log de debug
        logger = logging.getLogger(__name__)
        logger.info(f"API structures/data - status_filter: '{status_filter}', datetime_from: '{datetime_from}', datetime_to: '{datetime_to}', change_types: {change_types}, start: {start}, length: {length}")
        
        # Buscar dados paginados
        try:
            data, total_records = get_structures_paginated(
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
            
            logger.info(f"API structures/data - total_records: {total_records}, data length: {len(data)}")
        except Exception as e:
            logger.error(f"Erro em get_structures_paginated: {e}", exc_info=True)
            raise
        
        return jsonify({
            'data': data,
            'recordsTotal': total_records,
            'recordsFiltered': total_records
        })
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar dados de estruturas: {e}", exc_info=True)
        return jsonify({
            'error': 'Erro ao buscar dados de estruturas',
            'message': str(e)
        }), 500

@api_structures_bp.route('/api/structures/<structure_id>/history', methods=['GET'])
@admin_required
def api_structure_history(structure_id):
    """Endpoint para histórico de uma estrutura com suporte a filtros de data e paginação"""
    try:
        # Parâmetros de paginação
        page = request.args.get('page', None)
        per_page = request.args.get('per_page', None)
        
        # Tipo de estrutura (necessário para saber qual tabela consultar)
        structure_type = request.args.get('structure_type', 'fence')
        if structure_type not in ['fence', 'watchtower', 'flag']:
            return jsonify({
                'success': False,
                'error': 'Tipo de estrutura inválido. Use: fence, watchtower ou flag'
            }), 400
        
        # Filtros de data
        date_from = request.args.get('date_from', None)
        date_to = request.args.get('date_to', None)
        
        # Validar formato de data se fornecido
        if date_from:
            try:
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
        
        # Buscar TODOS os registros do histórico (sem limite inicial)
        # Limitar a 5000 registros para evitar problemas de memória
        all_history = get_structure_history(
            structure_id,
            structure_type,
            limit=5000,
            offset=0,
            date_from=date_from,
            date_to=date_to
        )
        
        # Filtrar registros sem mudanças significativas consecutivas
        filtered_history = filter_structure_history_by_changes(all_history, structure_type)
        
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
            'structure_id': structure_id,
            'structure_type': structure_type,
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
        logger.error(f"Erro ao buscar histórico da estrutura {structure_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao buscar histórico da estrutura',
            'message': str(e)
        }), 500

