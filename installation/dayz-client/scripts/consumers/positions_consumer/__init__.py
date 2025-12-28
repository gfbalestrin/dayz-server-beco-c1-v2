"""
Pacote positions_consumer - Consumer RabbitMQ para dados de posições
"""

# Importação lazy para evitar dependência de pika no import do módulo
def __getattr__(name):
    if name == 'PositionsConsumer':
        from .core import PositionsConsumer
        return PositionsConsumer
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

__all__ = ['PositionsConsumer']

