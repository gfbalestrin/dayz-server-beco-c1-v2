"""
Blueprint de API de Containers
"""
from flask import Blueprint, request, jsonify
import config
import os
import logging
import fcntl
from blueprints.auth import admin_required, audit_action
from database import (
    get_containers_paginated, 
    get_container_history, 
    get_container_tracking_items,
    filter_container_history_by_changes,
    get_item_details_from_items_db
)

api_containers_bp = Blueprint('api_containers', __name__)

@api_containers_bp.route('/api/containers/data', methods=['GET'])
@admin_required
def api_containers_data():
    """Endpoint para dados paginados de containers com filtros"""
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
            '0': 'ContainerId',
            '1': 'ContainerName',
            '2': 'IsDestroyed',
            '3': 'ChangeCount',  # Não ordenável no servidor, será ignorado
            '5': 'TimeStamp'  # Coluna 5 (sem coluna de saúde)
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
        logger.info(f"API containers/data - status_filter: '{status_filter}', datetime_from: '{datetime_from}', datetime_to: '{datetime_to}', change_types: {change_types}, start: {start}, length: {length}")
        
        # Buscar dados paginados
        try:
            data, total_records = get_containers_paginated(
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
            
            logger.info(f"API containers/data - total_records: {total_records}, data length: {len(data)}")
            if len(data) > 0:
                logger.info(f"API containers/data - Primeiro container: ContainerId={data[0].get('ContainerId')}, ContainerName={data[0].get('ContainerName')}, ChangeCount={data[0].get('ChangeCount')}, ChangeFlags={data[0].get('ChangeFlags')}")
        except Exception as e:
            logger.error(f"Erro em get_containers_paginated: {e}", exc_info=True)
            raise
        
        return jsonify({
            'data': data,
            'recordsTotal': total_records,
            'recordsFiltered': total_records
        })
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar dados de containers: {e}", exc_info=True)
        return jsonify({
            'error': 'Erro ao buscar dados de containers',
            'message': str(e)
        }), 500

@api_containers_bp.route('/api/containers/<container_id>/history', methods=['GET'])
@admin_required
def api_container_history(container_id):
    """Endpoint para histórico de um container com suporte a filtros de data e paginação"""
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
        # 2. Carregar items para todos
        # 3. Filtrar mantendo apenas os com mudanças significativas consecutivas
        # 4. Aplicar paginação nos resultados filtrados
        
        # Buscar TODOS os registros do histórico (sem limite inicial)
        # Limitar a 5000 registros para evitar problemas de memória
        all_history = get_container_history(
            container_id, 
            limit=5000, 
            offset=0,
            date_from=date_from,
            date_to=date_to
        )
        
        # Para cada registro, buscar items
        # Se o registro for parcial (IsPartialUpdate = 1), buscar do último registro completo anterior
        for record in all_history:
            tracking_id = record['IdContainerTracking']
            is_partial = record.get('IsPartialUpdate', 0) == 1
            
            # Se for registro parcial, buscar o último registro completo anterior
            if is_partial:
                from database import DatabaseConnection
                import config
                with DatabaseConnection(config.DB_CONTAINERS) as conn:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT IdContainerTracking
                        FROM containers_tracking
                        WHERE ContainerId = ? AND IsPartialUpdate = 0 AND TimeStamp <= ?
                        ORDER BY TimeStamp DESC
                        LIMIT 1
                    """, (container_id, record['TimeStamp']))
                    result = cursor.fetchone()
                    if result:
                        tracking_id = result[0]
            
            raw_items = get_container_tracking_items(tracking_id)

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

            record['items'] = enriched_items
        
        # Filtrar registros sem mudanças significativas consecutivas
        # Isso reduz drasticamente o número de registros (de 1500+ para ~6 eventos com mudanças)
        filtered_history = filter_container_history_by_changes(all_history)
        
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
            'container_id': container_id,
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
        logger.error(f"Erro ao buscar histórico do container {container_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Erro ao buscar histórico do container',
            'message': str(e)
        }), 500

