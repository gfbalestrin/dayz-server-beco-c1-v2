"""
Blueprint de API de Deathmatch
Rotas de API para gerenciamento de mapas de deathmatch
"""
from flask import Blueprint, request, jsonify
import os
import json
import logging
from blueprints.auth import admin_required

logger = logging.getLogger(__name__)

api_deathmatch_bp = Blueprint('api_deathmatch', __name__)


def _dm_cfg_path():
    # No blueprint, __file__ está em blueprints/, então precisamos de mais um .. para chegar ao diretório raiz do servidor
    return os.path.normpath(os.path.join(
        os.path.dirname(__file__),
        '..', '..', '..', 'mpmissions', 'dayzOffline.chernarusplus', 'admin', 'files', 'deathmatch_config.json'
    ))


def _dm_read_all():
    with open(_dm_cfg_path(), 'r', encoding='utf-8') as f:
        return json.load(f)


def _dm_write_all(data):
    with open(_dm_cfg_path(), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


@api_deathmatch_bp.route('/api/deathmatch/config')
@admin_required
def api_deathmatch_config():
    """Retorna um mapa do deathmatch_config.json com listas de pontos (X,Z).
    Se query param 'regionId' for fornecido, retorna esse; caso contrário, retorna o ativo.
    """
    # Caminho do arquivo de configuração
    cfg_path = os.path.join(
        os.path.dirname(__file__),
        '..', '..', 'mpmissions', 'dayzOffline.chernarusplus', 'admin', 'files', 'deathmatch_config.json'
    )
    cfg_path = os.path.normpath(cfg_path)

    try:
        with open(cfg_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({ 'error': f'Falha ao ler configuração: {str(e)}' }), 500

    if not isinstance(data, list) or len(data) == 0:
        return jsonify({ 'error': 'Configuração inválida ou vazia' }), 404

    # Seleção por query param
    region_id = request.args.get('regionId', type=int)
    selected = None
    if region_id is not None:
        selected = next((item for item in data if int(item.get('RegionId', -1)) == region_id), None)
        if not selected:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
    else:
        selected = next((item for item in data if item.get('Active') is True), None)
        if not selected:
            return jsonify({ 'error': 'Nenhum mapa ativo encontrado' }), 404

    def parse_coord_str(coord_str):
        # Aceita formatos "x, y, z" ou "x y z"; retorna (x, z) como float
        if not coord_str:
            return None
        # Normalizar separadores e espaços
        parts = [p.strip() for p in coord_str.replace(',', ' ').split() if p.strip()]
        if len(parts) < 3:
            return None
        try:
            x = float(parts[0])
            z = float(parts[2])
            return [x, z]
        except:
            return None

    def parse_coord_spawn(coord_str):
        # Retorna [x, y, z] com altura (y) preservada
        if not coord_str:
            return None
        parts = [p.strip() for p in coord_str.replace(',', ' ').split() if p.strip()]
        if len(parts) < 3:
            return None
        try:
            x = float(parts[0])
            y = float(parts[1])
            z = float(parts[2])
            return [x, y, z]
        except:
            return None

    next_entry = None
    for item in data:
        if item.get('NextActiveMap'):
            if not bool(item.get('IsDeleted')):
                next_entry = item
                break
            if not next_entry:
                next_entry = item

    spawn_zones = []
    for s in selected.get('SpawnZones', []) or []:
        pt = parse_coord_spawn(s)
        if pt:
            spawn_zones.append(pt)

    wall_zones = []
    for w in selected.get('WallZones', []) or []:
        pt = parse_coord_str(w)
        if pt:
            wall_zones.append(pt)

    spawns = selected.get('Spawns', {}) or {}
    vehicles = []
    for v in spawns.get('Vehicles', []) or []:
        name = v.get('name')
        coord = parse_coord_str(v.get('coord'))
        if coord:
            vehicles.append({ 'name': name, 'coord': coord })

    result = {
        'regionId': selected.get('RegionId'),
        'region': selected.get('Region'),
        'customMessage': selected.get('CustomMessage'),
        'active': bool(selected.get('Active')),
        'nextActive': bool(selected.get('NextActiveMap')),
        'isDeleted': bool(selected.get('IsDeleted')),
        'valid': (len(selected.get('SpawnZones') or []) >= 1 and len(selected.get('WallZones') or []) >= 3),
        'spawnZones': spawn_zones,
        'wallZones': wall_zones,
        'spawns': {
            'vehicles': vehicles
        },
        'nextMap': None
    }

    if next_entry:
        result['nextMap'] = {
            'regionId': next_entry.get('RegionId'),
            'region': next_entry.get('Region'),
            'isDeleted': bool(next_entry.get('IsDeleted')),
            'active': bool(next_entry.get('Active'))
        }

    return jsonify(result)


@api_deathmatch_bp.route('/api/deathmatch/maps')
@admin_required
def api_deathmatch_maps():
    """Lista todos os mapas do deathmatch com status de ativo."""
    try:
        cfg_path = _dm_cfg_path()
        logger.debug(f"Tentando ler arquivo: {cfg_path}")
        
        if not os.path.exists(cfg_path):
            logger.error(f"Arquivo não encontrado: {cfg_path}")
            return jsonify({ 'error': f'Arquivo de configuração não encontrado: {cfg_path}' }), 500
        
        data = _dm_read_all()
        logger.debug(f"Dados lidos: {len(data) if isinstance(data, list) else 'não é lista'}")
        
    except FileNotFoundError as e:
        logger.error(f"Arquivo não encontrado: {e}")
        return jsonify({ 'error': f'Arquivo de configuração não encontrado: {str(e)}' }), 500
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON: {e}")
        return jsonify({ 'error': f'Erro ao decodificar JSON: {str(e)}' }), 500
    except Exception as e:
        logger.exception(f"Erro inesperado ao ler configuração: {e}")
        return jsonify({ 'error': f'Falha ao ler configuração: {str(e)}' }), 500

    if not isinstance(data, list) or len(data) == 0:
        return jsonify({ 'maps': [] })

    maps = []
    try:
        for item in data:
            maps.append({
                'regionId': item.get('RegionId'),
                'region': item.get('Region'),
                'active': bool(item.get('Active')),
                'nextActive': bool(item.get('NextActiveMap')),
                'isDeleted': bool(item.get('IsDeleted')),
                'valid': (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3)
            })
    except Exception as e:
        logger.exception(f"Erro ao processar dados: {e}")
        return jsonify({ 'error': f'Erro ao processar dados: {str(e)}' }), 500

    return jsonify({ 'maps': maps })


def _validate_coord(x, z):
    try:
        x = float(x)
        z = float(z)
    except:
        return None
    if x < 0 or z < 0 or x > 15360 or z > 15360:
        return None
    return x, z


@api_deathmatch_bp.route('/api/deathmatch/map/set-active', methods=['POST'])
@admin_required
def api_deathmatch_set_active():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        found = False
        for item in data:
            if int(item.get('RegionId', -1)) == int(region_id):
                # validação: não permitir ativar se excluído ou inválido
                if bool(item.get('IsDeleted')):
                    return jsonify({ 'error': 'Mapa está marcado como excluído' }), 400
                if not (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3):
                    return jsonify({ 'error': 'Mapa inválido: precisa de ao menos 1 Spawn e 3 WallZones' }), 400
                item['Active'] = True
                item['NextActiveMap'] = True
                found = True
            else:
                item['Active'] = False
                item['NextActiveMap'] = False
        if not found:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa definido como ativo com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@api_deathmatch_bp.route('/api/deathmatch/map/set-next', methods=['POST'])
@admin_required
def api_deathmatch_set_next():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        found = False
        for item in data:
            if int(item.get('RegionId', -1)) == int(region_id):
                if bool(item.get('IsDeleted')):
                    return jsonify({ 'error': 'Mapa está marcado como excluído' }), 400
                if not (len(item.get('SpawnZones') or []) >= 1 and len(item.get('WallZones') or []) >= 3):
                    return jsonify({ 'error': 'Mapa inválido: precisa de ao menos 1 Spawn e 3 WallZones' }), 400
                item['NextActiveMap'] = True
                found = True
            else:
                item['NextActiveMap'] = False
        if not found:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa definido como próximo com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@api_deathmatch_bp.route('/api/deathmatch/map/update-meta', methods=['PATCH'])
@admin_required
def api_deathmatch_update_meta():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    region_name = payload.get('region')
    custom_message = payload.get('customMessage')
    if region_id is None:
        return jsonify({ 'error': 'regionId é obrigatório' }), 400
    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        if region_name is not None:
            target['Region'] = str(region_name)
        if custom_message is not None:
            target['CustomMessage'] = str(custom_message)
        _dm_write_all(data)
        return jsonify({ 'message': 'Metadados atualizados com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@api_deathmatch_bp.route('/api/deathmatch/map/create', methods=['POST'])
@admin_required
def api_deathmatch_create():
    payload = request.get_json(silent=True) or {}
    region_name = (payload.get('region') or '').strip()
    custom_message = (payload.get('customMessage') or '').strip()
    provided_id = payload.get('regionId')
    try:
        data = _dm_read_all()
        # Determinar novo RegionId
        existing_ids = [int(item.get('RegionId', 0)) for item in data if item.get('RegionId') is not None]
        next_id = (max(existing_ids) + 1) if existing_ids else 1
        if provided_id is not None:
            provided_id = int(provided_id)
            if provided_id in existing_ids:
                return jsonify({ 'error': f'RegionId {provided_id} já existe' }), 400
            new_id = provided_id
        else:
            new_id = next_id

        new_item = {
            'RegionId': new_id,
            'Active': False,
            'NextActiveMap': False,
            'IsDeleted': True,
            'Region': region_name or f'Região {new_id}',
            'CustomMessage': custom_message or '',
            'SpawnZones': [],
            'WallZones': [],
            'Spawns': { 'Vehicles': [] }
        }
        data.append(new_item)
        _dm_write_all(data)
        return jsonify({ 'message': 'Mapa criado com sucesso', 'regionId': new_id })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@api_deathmatch_bp.route('/api/deathmatch/map/set-deleted', methods=['POST'])
@admin_required
def api_deathmatch_set_deleted():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    is_deleted = payload.get('isDeleted')
    if region_id is None or is_deleted is None:
        return jsonify({ 'error': 'regionId e isDeleted são obrigatórios' }), 400
    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404
        # Se tentar reverter exclusão, validar consistência
        if bool(is_deleted) is False:
            if not (len(target.get('SpawnZones') or []) >= 1 and len(target.get('WallZones') or []) >= 3):
                return jsonify({ 'error': 'Não é possível reverter exclusão: mapa inválido (mín: 1 Spawn e 3 WallZones)' }), 400
        target['IsDeleted'] = bool(is_deleted)
        _dm_write_all(data)
        return jsonify({ 'message': 'Status de exclusão atualizado com sucesso' })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500


@api_deathmatch_bp.route('/api/deathmatch/map/points', methods=['POST'])
@admin_required
def api_deathmatch_points():
    payload = request.get_json(silent=True) or {}
    region_id = payload.get('regionId')
    kind = payload.get('kind')  # 'spawn' | 'wall'
    action = payload.get('action')  # 'add' | 'update' | 'remove'
    index = payload.get('index')
    coord = payload.get('coord') or {}

    if region_id is None or kind not in ['spawn', 'wall'] or action not in ['add', 'update', 'remove']:
        return jsonify({ 'error': 'Parâmetros inválidos' }), 400

    key = 'SpawnZones' if kind == 'spawn' else 'WallZones'

    try:
        data = _dm_read_all()
        target = next((item for item in data if int(item.get('RegionId', -1)) == int(region_id)), None)
        if not target:
            return jsonify({ 'error': f'Região {region_id} não encontrada' }), 404

        points = target.get(key) or []

        def _format_coord_spawn(x, y, z):
            return f"{x:.6f}, {y:.6f}, {z:.6f}"

        def _format_coord_wall(x, z):
            # Wall não usa altura
            return f"{x:.6f}, 0, {z:.6f}"

        if action in ['add', 'update']:
            xz = _validate_coord(coord.get('x'), coord.get('z'))
            if not xz:
                return jsonify({ 'error': 'Coordenadas inválidas. Use 0..15360' }), 400
            x, z = xz

        if action == 'add':
            if kind == 'spawn':
                # altura opcional em coord.h
                y = float(coord.get('h')) if coord.get('h') is not None else 0.0
                points.append(_format_coord_spawn(x, y, z))
            else:
                points.append(_format_coord_wall(x, z))
        elif action == 'update':
            if index is None or index < 0 or index >= len(points):
                return jsonify({ 'error': 'Índice inválido' }), 400
            if kind == 'spawn':
                # preservar altura existente se não for fornecida
                try:
                    existing = points[index]
                    parts = [p.strip() for p in existing.replace(',', ' ').split() if p.strip()]
                    existing_y = float(parts[1]) if len(parts) >= 3 else 0.0
                except:
                    existing_y = 0.0
                y = float(coord.get('h')) if coord.get('h') is not None else existing_y
                points[index] = _format_coord_spawn(x, y, z)
            else:
                points[index] = _format_coord_wall(x, z)
        elif action == 'remove':
            if index is None or index < 0 or index >= len(points):
                return jsonify({ 'error': 'Índice inválido' }), 400
            points.pop(index)

        target[key] = points
        _dm_write_all(data)

        return jsonify({ 'message': 'OK', 'count': len(points) })
    except Exception as e:
        return jsonify({ 'error': str(e) }), 500