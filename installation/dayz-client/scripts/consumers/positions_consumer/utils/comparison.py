"""
Utilitários para comparação de dados
"""

from typing import Dict, Any, List, Tuple, Optional
from .normalization import normalize_coordinate


def serialize_items_for_comparison(items: List[Dict[str, Any]]) -> str:
    """
    Serializa items para comparação (formato: "type:health,type:health")
    Ordena para comparação consistente
    """
    if not items:
        return ""
    
    item_strings = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_type = item.get('type')
        if not item_type or item_type == 'empty':
            continue
        item_health = item.get('health')
        if item_health is not None and item_health != '':
            item_strings.append(f"{item_type}:{item_health}")
        else:
            item_strings.append(item_type)
    
    # Ordenar para comparação consistente
    item_strings.sort()
    return ','.join(item_strings)


def serialize_attachments_for_comparison(attachments: List[Dict[str, Any]]) -> str:
    """
    Serializa attachments para comparação (formato: "type:health,type:health")
    Ordena para comparação consistente
    """
    if not attachments:
        return ""
    
    attachment_strings = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_type = attachment.get('type')
        if not attachment_type or attachment_type == 'empty':
            continue
        attachment_health = attachment.get('health')
        if attachment_health is not None and attachment_health != '':
            attachment_strings.append(f"{attachment_type}:{attachment_health}")
        else:
            attachment_strings.append(attachment_type)
    
    # Ordenar para comparação consistente
    attachment_strings.sort()
    return ','.join(attachment_strings)


def compare_container_data(current: Dict[str, Any], previous: Optional[Dict[str, Any]], is_partial_update: bool) -> Tuple[bool, str]:
    """
    Compara dados atuais de container com anteriores
    Retorna (has_changes, diff_message)
    """
    if not previous:
        return (True, "")  # Container novo
    
    diff_message = ""
    
    # Normalizar coordenadas atuais
    current_x = normalize_coordinate(current.get('coord_x'))
    current_z = normalize_coordinate(current.get('coord_z'))
    current_y = normalize_coordinate(current.get('coord_y'))
    
    # Comparar posição
    if current_x != previous.get('x') or current_z != previous.get('z') or current_y != previous.get('y'):
        prev_x = previous.get('x', '')
        prev_z = previous.get('z', '')
        prev_y = previous.get('y', '')
        diff_message += f"movido(({prev_x},{prev_z},{prev_y})->({current_x},{current_z},{current_y})); "
    
    # Para snapshots completos, comparar items
    if not is_partial_update:
        prev_is_partial = previous.get('is_partial_update', 0)
        
        # Só comparar items se último registro também for completo
        if prev_is_partial == 0:
            current_items = current.get('items', [])
            current_items_str = serialize_items_for_comparison(current_items)
            prev_items_str = previous.get('items_str', '')
            
            if current_items_str != prev_items_str:
                if not prev_items_str and current_items_str:
                    diff_message += "items_adicionados; "
                elif prev_items_str and not current_items_str:
                    diff_message += "items_removidos; "
                else:
                    diff_message += "items_alterados; "
        else:
            # Último registro é parcial: considerar como novo snapshot completo
            if current.get('items'):
                diff_message += "items_adicionados; "
    
    has_changes = bool(diff_message)
    return (has_changes, diff_message)

