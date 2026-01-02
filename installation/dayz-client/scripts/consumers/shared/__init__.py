"""
Módulo compartilhado para operações comuns entre consumers.
"""

from .players_online_ops import (
    register_player_connected,
    register_player_disconnected,
    reset_players_online,
    insert_player_event
)

__all__ = [
    'register_player_connected',
    'register_player_disconnected',
    'reset_players_online',
    'insert_player_event'
]
