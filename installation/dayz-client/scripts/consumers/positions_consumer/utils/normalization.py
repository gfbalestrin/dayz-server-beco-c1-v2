"""
Utilitários de normalização de dados
"""

import logging
from typing import Optional, Any, Dict

logger = logging.getLogger(__name__)


def normalize_coordinate(coord: Optional[float]) -> str:
    """
    Normaliza coordenada para comparação (3 casas decimais)
    Similar a normalize_coordinate() do containers_positions.sh
    """
    if coord is None:
        return ""
    try:
        return f"{float(coord):.3f}"
    except (TypeError, ValueError):
        return ""


def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    """
    Converte valor para float de forma segura
    Retorna default se não for possível converter
    """
    try:
        if value is None or value == '':
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    """
    Converte valor para inteiro (0 ou 1) de forma segura.
    Suporta: booleanos (True/False), strings ("true"/"false", "1"/"0"), números, None
    O JSON do Enforce envia booleanos como strings "true"/"false" via BoolToJson()
    """
    try:
        if value is None or value == '':
            return default
        
        # Se já é booleano
        if isinstance(value, bool):
            return 1 if value else 0
        
        # Se é string, tratar "true"/"false" e "1"/"0"
        if isinstance(value, str):
            value_lower = value.lower().strip()
            if value_lower in ('true', 'yes', '1'):
                return 1
            elif value_lower in ('false', 'no', '0', ''):
                return 0
            # Tentar converter para int
            return int(value)
        
        # Se é número
        if isinstance(value, (int, float)):
            return 1 if value else 0
        
        return default
    except (TypeError, ValueError):
        return default


def normalize_structure_values(structure: Dict[str, Any], structure_type: str, validate_func) -> Optional[Dict[str, Any]]:
    """
    Normaliza valores de uma estrutura para inserção no banco
    structure_type: 'fence', 'watchtower', ou 'flag'
    validate_func: função de validação apropriada
    """
    normalized = {}
    
    if structure_type == 'fence':
        if not validate_func(structure):
            return None
        
        # ID da fence
        raw_id = structure.get('fence_id')
        if isinstance(raw_id, str) and raw_id.strip():
            normalized['fence_id'] = raw_id.strip()
        else:
            # Gerar ID baseada na posição
            from .validation import validate_coordinates
            x, z, y = validate_coordinates(structure)
            if x is None or z is None or y is None:
                return None
            x_norm = normalize_coordinate(x)
            z_norm = normalize_coordinate(z)
            y_norm = normalize_coordinate(y)
            normalized['fence_id'] = f"fence:{x_norm}:{z_norm}:{y_norm}"
        
        # Gerar fence_name
        fence_name = 'Fence'
        has_gate = safe_int(structure.get('has_gate'), 0) == 1
        is_opened = safe_int(structure.get('is_opened'), 0) == 1
        is_locked = safe_int(structure.get('is_locked'), 0) == 1
        
        if has_gate:
            fence_name = fence_name + '_Gate'
        if is_opened:
            fence_name = fence_name + '_Open'
        if is_locked:
            fence_name = fence_name + '_Locked'
        
        normalized['fence_name'] = fence_name
        
        # Coordenadas
        x, z, y = validate_coordinates(structure)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        normalized['has_base'] = safe_int(structure.get('has_base'))
        normalized['lower_panel_built'] = safe_int(structure.get('lower_panel_built'))
        normalized['upper_panel_built'] = safe_int(structure.get('upper_panel_built'))
        
    elif structure_type == 'watchtower':
        if not validate_func(structure):
            return None
        
        # ID da watchtower
        raw_id = structure.get('watchtower_id')
        if isinstance(raw_id, str) and raw_id.strip():
            normalized['watchtower_id'] = raw_id.strip()
        else:
            from .validation import validate_coordinates
            x, z, y = validate_coordinates(structure)
            if x is None or z is None or y is None:
                return None
            x_norm = normalize_coordinate(x)
            z_norm = normalize_coordinate(z)
            y_norm = normalize_coordinate(y)
            normalized['watchtower_id'] = f"watchtower:{x_norm}:{z_norm}:{y_norm}"
        
        normalized['watchtower_name'] = "Torre de Observação"
        
        # Coordenadas
        x, z, y = validate_coordinates(structure)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        # Orientation
        orientation = structure.get('orientation', {})
        if isinstance(orientation, dict):
            normalized['orientation_x'] = safe_float(orientation.get('x'))
            normalized['orientation_y'] = safe_float(orientation.get('y'))
            normalized['orientation_z'] = safe_float(orientation.get('z'))
        else:
            normalized['orientation_x'] = safe_float(structure.get('orientation_x'))
            normalized['orientation_y'] = safe_float(structure.get('orientation_y'))
            normalized['orientation_z'] = safe_float(structure.get('orientation_z'))
        
        normalized['has_base'] = safe_int(structure.get('has_base'))
        normalized['level1_base_built'] = safe_int(structure.get('level_1_base'))
        normalized['level2_base_built'] = safe_int(structure.get('level_2_base'))
        normalized['level3_base_built'] = safe_int(structure.get('level_3_base'))
        normalized['level1_stairs_built'] = safe_int(structure.get('level_1_stairs'))
        normalized['level2_stairs_built'] = safe_int(structure.get('level_2_stairs'))
        normalized['has_roof'] = safe_int(structure.get('has_roof'))
        
        # Walls
        normalized['level1_wall1_lower_built'] = safe_int(structure.get('level_1_wall_1_lower_built'))
        normalized['level1_wall1_upper_built'] = safe_int(structure.get('level_1_wall_1_upper_built'))
        normalized['level1_wall2_lower_built'] = safe_int(structure.get('level_1_wall_2_lower_built'))
        normalized['level1_wall2_upper_built'] = safe_int(structure.get('level_1_wall_2_upper_built'))
        normalized['level1_wall3_lower_built'] = safe_int(structure.get('level_1_wall_3_lower_built'))
        normalized['level1_wall3_upper_built'] = safe_int(structure.get('level_1_wall_3_upper_built'))
        normalized['level2_wall1_lower_built'] = safe_int(structure.get('level_2_wall_1_lower_built'))
        normalized['level2_wall1_upper_built'] = safe_int(structure.get('level_2_wall_1_upper_built'))
        normalized['level2_wall2_lower_built'] = safe_int(structure.get('level_2_wall_2_lower_built'))
        normalized['level2_wall2_upper_built'] = safe_int(structure.get('level_2_wall_2_upper_built'))
        normalized['level2_wall3_lower_built'] = safe_int(structure.get('level_2_wall_3_lower_built'))
        normalized['level2_wall3_upper_built'] = safe_int(structure.get('level_2_wall_3_upper_built'))
        normalized['level3_wall1_lower_built'] = safe_int(structure.get('level_3_wall_1_lower_built'))
        normalized['level3_wall1_upper_built'] = safe_int(structure.get('level_3_wall_1_upper_built'))
        normalized['level3_wall2_lower_built'] = safe_int(structure.get('level_3_wall_2_lower_built'))
        normalized['level3_wall2_upper_built'] = safe_int(structure.get('level_3_wall_2_upper_built'))
        normalized['level3_wall3_lower_built'] = safe_int(structure.get('level_3_wall_3_lower_built'))
        normalized['level3_wall3_upper_built'] = safe_int(structure.get('level_3_wall_3_upper_built'))
        
    elif structure_type == 'flag':
        if not validate_func(structure):
            return None
        
        # ID da flag
        raw_id = structure.get('flag_id')
        if isinstance(raw_id, str) and raw_id.strip():
            normalized['flag_id'] = raw_id.strip()
        else:
            from .validation import validate_coordinates
            x, z, y = validate_coordinates(structure)
            if x is None or z is None or y is None:
                return None
            x_norm = normalize_coordinate(x)
            z_norm = normalize_coordinate(z)
            y_norm = normalize_coordinate(y)
            normalized['flag_id'] = f"flag:{x_norm}:{z_norm}:{y_norm}"
        
        normalized['flag_name'] = structure.get('flag_name', '').strip() or ''
        
        # Coordenadas
        x, z, y = validate_coordinates(structure)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        # Orientation
        orientation = structure.get('orientation', {})
        if isinstance(orientation, dict):
            normalized['orientation_x'] = safe_float(orientation.get('x'))
            normalized['orientation_y'] = safe_float(orientation.get('y'))
            normalized['orientation_z'] = safe_float(orientation.get('z'))
        else:
            normalized['orientation_x'] = safe_float(structure.get('orientation_x'))
            normalized['orientation_y'] = safe_float(structure.get('orientation_y'))
            normalized['orientation_z'] = safe_float(structure.get('orientation_z'))
        
        normalized['has_base'] = safe_int(structure.get('has_base'))
        normalized['has_flag_base'] = safe_int(structure.get('has_flag_base'))
        normalized['flag_raised'] = safe_int(structure.get('flag_raised'))
        normalized['flag_height'] = safe_float(structure.get('flag_height'))
    else:
        return None
    
    return normalized

