"""
Algoritmos de empacotamento 2D para cálculo de espaço em containers
"""
from typing import List, Dict, Optional, Tuple


def can_fit_items_in_container(
    container_width: int,
    container_height: int,
    items_list: List[Dict]
) -> Dict:
    """
    Verifica se os itens cabem no container usando validação dimensional básica.
    
    Args:
        container_width: Largura do container
        container_height: Altura do container
        items_list: Lista de itens, cada um com 'width', 'height', 'quantity' e opcionalmente 'id', 'name'
    
    Returns:
        Dict com:
        - 'fits': True se todos os itens cabem individualmente
        - 'usage': Porcentagem de uso aproximada (slots totais)
        - 'errors': Lista de itens que não cabem
        - 'total_slots': Total de slots necessários
    """
    if not items_list:
        return {
            'fits': True,
            'usage': 0.0,
            'errors': [],
            'total_slots': 0
        }
    
    errors = []
    total_slots = 0
    
    for item in items_list:
        width = item.get('width', 0)
        height = item.get('height', 0)
        quantity = item.get('quantity', 1)
        name = item.get('name', f"Item {item.get('id', '?')}")
        
        # Validar dimensões individuais (considerar rotação)
        fits_normal = width <= container_width and height <= container_height
        fits_rotated = height <= container_width and width <= container_height
        
        if not fits_normal and not fits_rotated:
            errors.append({
                'item': name,
                'dimension': 'both',
                'width': width,
                'height': height,
                'container_width': container_width,
                'container_height': container_height
            })
        
        # Calcular slots totais (aproximação conservadora)
        item_slots = item.get('slots', width * height)
        total_slots += item_slots * quantity
    
    # Calcular taxa de uso
    container_total_slots = container_width * container_height
    usage = min(total_slots / container_total_slots, 1.0) if container_total_slots > 0 else 0.0
    
    return {
        'fits': len(errors) == 0,
        'usage': usage,
        'errors': errors,
        'total_slots': total_slots
    }


def pack_items_ffdh(
    container_width: int,
    container_height: int,
    items_list: List[Dict]
) -> Dict:
    """
    Algoritmo First-Fit Decreasing Height (FFDH) para empacotamento 2D.
    
    Ordena itens por altura e posiciona cada um na primeira posição que couber.
    
    Returns:
        Dict com:
        - 'fits': True se todos os itens foram posicionados
        - 'usage': Porcentagem de uso
        - 'positions': Lista de posições (x, y) de cada item
        - 'visual_grid': Grid 2D representando ocupação
    """
    if not items_list:
        return {
            'fits': True,
            'usage': 0.0,
            'positions': [],
            'visual_grid': [[0 for _ in range(container_width)] for _ in range(container_height)]
        }
    
    # Expandir items por quantity
    expanded_items = []
    for item in items_list:
        for _ in range(item.get('quantity', 1)):
            expanded_items.append(item.copy())
    
    # Ordenar por altura (decrescente) e depois por largura (decrescente)
    sorted_items = sorted(expanded_items, key=lambda x: (-x.get('height', 0), -x.get('width', 0)))
    
    # Grid para tracking de ocupação
    grid = [[0 for _ in range(container_width)] for _ in range(container_height)]
    positions = []
    
    # Tentar posicionar cada item
    for item in sorted_items:
        width = item.get('width', 0)
        height = item.get('height', 0)
        
        if width == 0 or height == 0:
            continue
        
        # Buscar primeira posição livre (com rotação automática)
        result = find_first_fit_position_with_rotation(
            grid, container_width, container_height, width, height
        )
        
        if result is None:
            # Item não coube nem rotacionado
            return {
                'fits': False,
                'usage': 0.0,
                'positions': positions,
                'visual_grid': grid
            }
        
        x, y, rotated = result
        
        # Se rotacionado, trocar dimensões
        actual_width = height if rotated else width
        actual_height = width if rotated else height
        
        # Marcar área como ocupada
        for dy in range(actual_height):
            for dx in range(actual_width):
                if y + dy < container_height and x + dx < container_width:
                    grid[y + dy][x + dx] = 1
        
        # Adicionar à lista de posições
        positions.append({
            'item': item.get('name', f"Item {item.get('id', '?')}"),
            'x': x,
            'y': y,
            'width': actual_width,
            'height': actual_height,
            'rotated': rotated,
            'img': item.get('img', '')
        })
    
    # Calcular uso
    occupied = sum(sum(row) for row in grid)
    total = container_width * container_height
    usage = occupied / total if total > 0 else 0.0
    
    return {
        'fits': True,
        'usage': usage,
        'positions': positions,
        'visual_grid': grid
    }


def find_first_fit_position(
    grid: List[List[int]],
    container_width: int,
    container_height: int,
    width: int,
    height: int
) -> Optional[Tuple[int, int]]:
    """
    Encontra a primeira posição (x, y) onde um item de dimensões width x height cabe.
    
    Args:
        grid: Grid 2D de ocupação (0 = livre, 1 = ocupado)
        container_width, container_height: Dimensões do container
        width, height: Dimensões do item
    
    Returns:
        (x, y) da primeira posição livre ou None se não couber
    """
    if width > container_width or height > container_height:
        return None
    
    # Tentar cada posição possível
    for y in range(container_height - height + 1):
        for x in range(container_width - width + 1):
            # Verificar se área está livre
            if is_area_free(grid, x, y, width, height):
                return (x, y)
    
    return None


def is_area_free(grid: List[List[int]], x: int, y: int, width: int, height: int) -> bool:
    """
    Verifica se uma área está livre no grid.
    
    Args:
        grid: Grid 2D de ocupação
        x, y: Posição inicial
        width, height: Dimensões da área
    
    Returns:
        True se toda área está livre
    """
    for dy in range(height):
        for dx in range(width):
            if y + dy < len(grid) and x + dx < len(grid[0]):
                if grid[y + dy][x + dx] != 0:
                    return False
            else:
                return False
    return True


def find_first_fit_position_with_rotation(
    grid: List[List[int]],
    container_width: int,
    container_height: int,
    width: int,
    height: int
) -> Optional[Tuple[int, int, bool]]:
    """
    Encontra a primeira posição onde um item cabe, tentando rotação se necessário.
    
    Args:
        grid: Grid 2D de ocupação (0 = livre, 1 = ocupado)
        container_width, container_height: Dimensões do container
        width, height: Dimensões do item
    
    Returns:
        (x, y, rotated) onde rotated=True se o item foi rotacionado, ou None se não couber
    """
    # Tentar orientação normal primeiro
    position = find_first_fit_position(grid, container_width, container_height, width, height)
    if position is not None:
        return (position[0], position[1], False)
    
    # Se não couber, tentar rotacionado (trocar width e height)
    if width != height:  # Só faz sentido rotacionar se não for quadrado
        position = find_first_fit_position(grid, container_width, container_height, height, width)
        if position is not None:
            return (position[0], position[1], True)
    
    return None

