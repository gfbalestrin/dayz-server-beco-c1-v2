"""
Utilitários compartilhados
"""

from .validation import validate_coordinates, validate_id, validate_fence_data, validate_watchtower_data, validate_flag_data
from .normalization import normalize_coordinate, safe_float, safe_int, normalize_structure_values
from .comparison import serialize_items_for_comparison, serialize_attachments_for_comparison, compare_container_data

__all__ = [
    'validate_coordinates',
    'validate_id',
    'validate_fence_data',
    'validate_watchtower_data',
    'validate_flag_data',
    'normalize_coordinate',
    'safe_float',
    'safe_int',
    'normalize_structure_values',
    'serialize_items_for_comparison',
    'serialize_attachments_for_comparison',
    'compare_container_data',
]

