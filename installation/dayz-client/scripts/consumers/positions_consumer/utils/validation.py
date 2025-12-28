"""
Utilitários de validação de dados
"""

import math
from typing import Dict, Any, Optional


def validate_coordinates(
    data: Dict[str, Any],
    position_key: str = 'position',
    x_key: str = 'x',
    z_key: str = 'z',
    y_key: str = 'y'
) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Valida e extrai coordenadas de um dicionário
    Retorna (x, z, y) se válidas, ou (None, None, None) se inválidas
    
    Aceita coordenadas em position.x/z/y ou diretamente em x/z/y
    """
    # Tentar pegar coordenadas de position dict primeiro
    position = data.get(position_key)
    if position is not None and isinstance(position, dict) and len(position) > 0:
        x = position.get(x_key)
        z = position.get(z_key)
        y = position.get(y_key)
    else:
        # Tentar pegar diretamente do data
        x = data.get(x_key)
        z = data.get(z_key)
        y = data.get(y_key)
    
    # Validar que coordenadas existem
    if x is None or z is None or y is None:
        return (None, None, None)
    
    # Verificar se são strings vazias
    if isinstance(x, str) and not x.strip():
        return (None, None, None)
    if isinstance(z, str) and not z.strip():
        return (None, None, None)
    if isinstance(y, str) and not y.strip():
        return (None, None, None)
    
    # Tentar converter para float e validar que não é NaN/infinito
    try:
        x_float = float(x)
        z_float = float(z)
        y_float = float(y)
        
        # Verificar se não é NaN (Not a Number)
        if math.isnan(x_float) or math.isnan(z_float) or math.isnan(y_float):
            return (None, None, None)
        
        # Verificar se não é infinito
        if math.isinf(x_float) or math.isinf(z_float) or math.isinf(y_float):
            return (None, None, None)
        
        return (x_float, z_float, y_float)
    except (TypeError, ValueError):
        return (None, None, None)


def validate_id(id_value: Any, field_name: str = "id") -> bool:
    """
    Valida que um ID é uma string não vazia
    """
    return id_value is not None and isinstance(id_value, str) and id_value.strip() != ""


def validate_fence_data(fence: Dict[str, Any]) -> bool:
    """
    Valida dados obrigatórios de um fence.
    O JSON original de fences não inclui fence_id, então validamos apenas coordenadas.
    """
    x, z, y = validate_coordinates(fence)
    return x is not None and z is not None and y is not None


def validate_watchtower_data(watchtower: Dict[str, Any]) -> bool:
    """
    Valida dados obrigatórios de uma watchtower.
    O JSON original de watchtowers não inclui watchtower_id, então validamos apenas coordenadas.
    """
    x, z, y = validate_coordinates(watchtower)
    return x is not None and z is not None and y is not None


def validate_flag_data(flag: Dict[str, Any]) -> bool:
    """
    Valida dados obrigatórios de uma flag.
    O JSON original de flags não inclui flag_id, então validamos apenas coordenadas.
    """
    x, z, y = validate_coordinates(flag)
    return x is not None and z is not None and y is not None

