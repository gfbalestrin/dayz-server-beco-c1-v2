"""
Classe base abstrata para processadores de dados
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseProcessor(ABC):
    """
    Classe base abstrata para processadores de dados de posições
    Define interface comum para validação, normalização e processamento
    """
    
    def __init__(self, db_path: str):
        """
        Inicializa o processador
        
        Args:
            db_path: Caminho do banco de dados SQLite
        """
        self.db_path = db_path
    
    @abstractmethod
    def validate(self, data: Dict[str, Any]) -> bool:
        """
        Valida dados antes do processamento
        
        Args:
            data: Dados a serem validados
            
        Returns:
            True se válido, False caso contrário
        """
        pass
    
    @abstractmethod
    def normalize(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Normaliza dados para inserção no banco
        
        Args:
            data: Dados a serem normalizados
            
        Returns:
            Dicionário normalizado ou None se inválido
        """
        pass
    
    @abstractmethod
    def process(self, data: Dict[str, Any]) -> bool:
        """
        Processa dados e insere no banco
        
        Args:
            data: Dados a serem processados
            
        Returns:
            True se processado com sucesso, False caso contrário
        """
        pass

