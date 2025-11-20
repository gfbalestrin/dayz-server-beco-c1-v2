import os
import xml.etree.ElementTree as ET
from threading import Lock
from typing import Dict, List, Optional, Set

import config

# Mapeia os nomes exibidos no jogo para o tipo base usado pelos administradores
DISPLAY_NAME_TO_TYPE = {
    "Ada 4x4": "OffroadHatchback",
    "Sarka 120": "Sedan_02",
    "Olga 24": "CivilianSedan",
    "Gunter 2": "Hatchback_02",
    "M3S Covered": "Truck_01_Covered",
    "M1025": "Offroad_02",
}

# Mapeia tipos individuais (incluindo variantes) para o nome exibido
TYPE_TO_DISPLAY_NAME = {
    "OffroadHatchback": "Ada 4x4",
    "OffroadHatchback_Blue": "Ada 4x4",
    "OffroadHatchback_White": "Ada 4x4",
    "OffroadHatchback_Beige": "Ada 4x4",
    "OffroadHatchback_Green": "Ada 4x4",
    "Sedan_02": "Sarka 120",
    "Sedan_02_Blue": "Sarka 120",
    "Sedan_02_Grey": "Sarka 120",
    "Sedan_02_Red": "Sarka 120",
    "CivilianSedan": "Olga 24",
    "CivilianSedan_Black": "Olga 24",
    "CivilianSedan_Wine": "Olga 24",
    "CivilianSedan_Green": "Olga 24",
    "Hatchback_02": "Gunter 2",
    "Hatchback_02_Black": "Gunter 2",
    "Hatchback_02_Blue": "Gunter 2",
    "Truck_01_Covered": "M3S Covered",
    "Truck_01_Covered_Blue": "M3S Covered",
    "Truck_01_Covered_Orange": "M3S Covered",
    "Truck_01_Open": "M3S Covered",
    "Truck_01_Open_Blue": "M3S Covered",
    "Offroad_02": "M1025",
}

# Tipos exibidos na tela de spawning
ADMIN_VEHICLE_TYPES: List[str] = [
    "OffroadHatchback",
    "Sedan_02",
    "CivilianSedan",
    "CivilianSedan_Black",
    "CivilianSedan_Wine",
    "Hatchback_02",
    "Hatchback_02_Black",
    "Truck_01_Covered",
    "Truck_01_Covered_Blue",
    "Truck_01_Covered_Orange",
    "Offroad_02",
]

_event_cache_lock = Lock()
_event_cache_mtime: Optional[float] = None
_event_cache: Optional[Dict[str, Dict]] = None

_types_cache_lock = Lock()
_types_cache_mtime: Optional[float] = None
_types_cache: Optional[Dict[str, Dict]] = None


def _safe_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _parse_events_xml() -> Dict[str, Dict]:
    events_path = config.DAYZ_EVENTS_FILE
    tree = ET.parse(events_path)
    root = tree.getroot()
    events_by_type: Dict[str, Dict] = {}

    for event_node in root.findall('event'):
        event_name = event_node.get('name')
        if not event_name:
            continue

        event_info = {
            'event_name': event_name,
            'nominal': _safe_int(event_node.findtext('nominal')),
            'min': _safe_int(event_node.findtext('min')),
            'max': _safe_int(event_node.findtext('max')),
            'lifetime': _safe_int(event_node.findtext('lifetime')),
            'restock': _safe_int(event_node.findtext('restock')),
            'limit': event_node.findtext('limit'),
            'saferadius': _safe_int(event_node.findtext('saferadius')),
            'distanceradius': _safe_int(event_node.findtext('distanceradius')),
            'cleanupradius': _safe_int(event_node.findtext('cleanupradius')),
            'child_types': [],
        }

        children_node = event_node.find('children')
        if not children_node:
            continue

        for child in children_node.findall('child'):
            type_name = child.get('type')
            if not type_name:
                continue

            child_info = event_info.copy()
            child_info['child_max'] = _safe_int(child.get('max'))
            child_info['child_min'] = _safe_int(child.get('min'))
            child_info['child_types'] = []
            events_by_type[type_name] = child_info
            event_info['child_types'].append(type_name)

        # Atualizar child_types nas entradas individuais
        for child_type in event_info['child_types']:
            events_by_type[child_type]['child_types'] = list(event_info['child_types'])

    return events_by_type


def _parse_types_xml() -> Dict[str, Dict]:
    """Lê types.xml e extrai lifetime para cada tipo de veículo"""
    types_path = config.DAYZ_TYPES_FILE
    if not os.path.exists(types_path):
        return {}
    
    tree = ET.parse(types_path)
    root = tree.getroot()
    types_info: Dict[str, Dict] = {}

    for type_node in root.findall('type'):
        type_name = type_node.get('name')
        if not type_name:
            continue

        lifetime_text = type_node.findtext('lifetime')
        lifetime = _safe_int(lifetime_text)

        types_info[type_name] = {
            'lifetime': lifetime,
        }

    return types_info


def _load_types_cache(force: bool = False) -> Dict[str, Dict]:
    """Carrega cache do types.xml com verificação de mtime"""
    global _types_cache, _types_cache_mtime

    types_path = config.DAYZ_TYPES_FILE
    if not os.path.exists(types_path):
        return {}

    try:
        current_mtime = os.path.getmtime(types_path)
    except OSError:
        return {}

    with _types_cache_lock:
        if not force and _types_cache is not None and _types_cache_mtime == current_mtime:
            return _types_cache

        _types_cache = _parse_types_xml()
        _types_cache_mtime = current_mtime
        return _types_cache


def _load_events_cache(force: bool = False) -> Dict[str, Dict]:
    global _event_cache, _event_cache_mtime

    events_path = config.DAYZ_EVENTS_FILE
    current_mtime = os.path.getmtime(events_path)

    with _event_cache_lock:
        if not force and _event_cache is not None and _event_cache_mtime == current_mtime:
            return _event_cache

        _event_cache = _parse_events_xml()
        _event_cache_mtime = current_mtime
        return _event_cache


def get_event_info_for_type(vehicle_type: str) -> Optional[Dict]:
    events = _load_events_cache()
    if vehicle_type in events:
        return events[vehicle_type]
    return None


def _display_names_for_child_types(child_types: List[str]) -> Set[str]:
    display_names: Set[str] = set()
    for child_type in child_types:
        display = TYPE_TO_DISPLAY_NAME.get(child_type)
        if display:
            display_names.add(display)
    return display_names


def get_vehicle_limits_summary(
    active_counts_by_display: Dict[str, int],
    types_filter: Optional[List[str]] = None
) -> Dict[str, Dict]:
    summary: Dict[str, Dict] = {}
    target_types = types_filter or ADMIN_VEHICLE_TYPES
    types_info = _load_types_cache()

    for vehicle_type in target_types:
        event_info = get_event_info_for_type(vehicle_type)
        type_info = types_info.get(vehicle_type, {})
        
        # Obter lifetime do types.xml (ou de qualquer variante relacionada)
        lifetime = type_info.get('lifetime')
        if not lifetime:
            # Tentar buscar em variantes (ex: OffroadHatchback_Blue -> OffroadHatchback)
            base_type = vehicle_type.split('_')[0]
            if base_type != vehicle_type:
                base_info = types_info.get(base_type, {})
                lifetime = base_info.get('lifetime')
        
        if not event_info:
            display_name = TYPE_TO_DISPLAY_NAME.get(vehicle_type)
            current = active_counts_by_display.get(display_name, 0) if display_name else 0
            summary[vehicle_type] = {
                'event': None,
                'max': None,
                'min': None,
                'nominal': None,
                'restock': None,
                'lifetime': lifetime,
                'limit': None,
                'saferadius': None,
                'cleanupradius': None,
                'distanceradius': None,
                'current': current,
                'available': None,
                'child_types': [],
                'display_names': [display_name] if display_name else [],
                'has_limit': False,
                'blocked': False,
                'warning': 'Tipo não encontrado no events.xml',
            }
            continue

        display_names = _display_names_for_child_types(event_info['child_types'])
        current = sum(active_counts_by_display.get(name, 0) for name in display_names)

        max_allowed = event_info.get('max') or event_info.get('child_max')
        min_allowed = event_info.get('min') or event_info.get('child_min')
        available = None
        blocked = False
        if max_allowed is not None:
            remaining = max_allowed - current
            available = max(0, remaining)
            blocked = remaining <= 0

        summary[vehicle_type] = {
            'event': event_info['event_name'],
            'max': max_allowed,
            'min': min_allowed,
            'nominal': event_info.get('nominal'),
            'restock': event_info.get('restock'),
            'lifetime': lifetime if lifetime is not None else event_info.get('lifetime'),
            'limit': event_info.get('limit'),
            'saferadius': event_info.get('saferadius'),
            'cleanupradius': event_info.get('cleanupradius'),
            'distanceradius': event_info.get('distanceradius'),
            'current': current,
            'available': available,
            'child_types': event_info['child_types'],
            'display_names': sorted(display_names),
            'has_limit': max_allowed is not None,
            'blocked': blocked,
        }

    return summary


def can_spawn_vehicle(
    vehicle_type: str,
    active_counts_by_display: Optional[Dict[str, int]] = None
) -> Dict[str, Dict]:
    counts = active_counts_by_display or {}
    summary = get_vehicle_limits_summary(counts, types_filter=[vehicle_type])
    data = summary.get(vehicle_type, {})
    allowed = not data.get('has_limit') or not data.get('blocked')
    data['allowed'] = allowed
    return data


def refresh_events_cache():
    """Recarrega os caches de events.xml e types.xml"""
    _load_events_cache(force=True)
    _load_types_cache(force=True)

