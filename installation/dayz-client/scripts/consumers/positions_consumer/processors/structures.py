"""
Processador de dados de structures
"""

import sqlite3
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List

from ..database.sqlite_utils import configure_sqlite_pragmas, generate_unique_timestamps
from ..database.queries import Queries
from ..utils.validation import validate_fence_data, validate_watchtower_data, validate_flag_data
from ..utils.normalization import normalize_structure_values

logger = logging.getLogger(__name__)


class StructuresProcessor:
    """
    Processador de dados de estruturas (fences, watchtowers, flags)
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.queries = Queries(db_path)
        self.max_retries = 5
        self.base_retry_delay = 0.5
    
    def process(self, data: Dict[str, Any]) -> bool:
        """
        Processa dados de estruturas e insere no banco SQLite
        Suporta fences, watchtowers e flags
        """
        # Extrair timestamp base
        captured_timestamp = data.get('captured_timestamp')
        if captured_timestamp:
            try:
                if isinstance(captured_timestamp, str):
                    base_timestamp = datetime.strptime(captured_timestamp, '%Y-%m-%d %H:%M:%S')
                else:
                    base_timestamp = datetime.now()
            except (ValueError, TypeError):
                base_timestamp = datetime.now()
        else:
            base_timestamp = datetime.now()
        
        # Extrair estruturas por tipo
        fences = data.get('fence_data', [])
        watchtowers = data.get('watchtower_data', [])
        flags = data.get('flag_data', [])
        
        if not fences and not watchtowers and not flags:
            logger.warning("Dados de structures inválidos ou vazios")
            return False
        
        logger.info(f"Processando structures: {len(fences)} fences, {len(watchtowers)} watchtowers, {len(flags)} flags")
        
        # Normalizar estruturas
        normalized_fences = []
        normalized_watchtowers = []
        normalized_flags = []
        
        if fences:
            first_fence = fences[0]
            logger.info(f"Primeiro fence recebido: chaves={list(first_fence.keys())}")
        
        for fence in fences:
            normalized = normalize_structure_values(fence, 'fence', validate_fence_data)
            if normalized:
                normalized_fences.append(normalized)
            else:
                logger.debug(f"Fence falhou na normalização: {fence.get('position', 'N/A')}")
        
        if watchtowers:
            first_watchtower = watchtowers[0]
            logger.info(f"Primeiro watchtower recebido: chaves={list(first_watchtower.keys())}")
        
        for watchtower in watchtowers:
            normalized = normalize_structure_values(watchtower, 'watchtower', validate_watchtower_data)
            if normalized:
                normalized_watchtowers.append(normalized)
            else:
                logger.debug(f"Watchtower falhou na normalização: {watchtower.get('position', 'N/A')}")
        
        for flag in flags:
            normalized = normalize_structure_values(flag, 'flag', validate_flag_data)
            if normalized:
                normalized_flags.append(normalized)
        
        logger.info(f"Após normalização: {len(normalized_fences)} fences válidos de {len(fences)} recebidos, {len(normalized_watchtowers)} watchtowers válidos de {len(watchtowers)} recebidos, {len(normalized_flags)} flags válidos de {len(flags)} recebidos")
        
        if not normalized_fences and not normalized_watchtowers and not normalized_flags:
            logger.warning("Nenhuma estrutura válida após normalização")
            return False
        
        # Retry logic
        conn = None
        for attempt in range(1, self.max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                configure_sqlite_pragmas(cursor)
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                total_inserted = 0
                
                # Inserir fences
                if normalized_fences:
                    timestamps = generate_unique_timestamps(base_timestamp, len(normalized_fences))
                    inserted_count, _ = self.queries.insert_fences_batch(cursor, normalized_fences, timestamps)
                    total_inserted += inserted_count
                    
                    gate_count = sum(1 for f in normalized_fences if f.get('fence_name', '').find('Gate') != -1)
                    regular_count = inserted_count - gate_count
                    logger.info(f"Inseridos {inserted_count} fences: {gate_count} com portão, {regular_count} cercas regulares")
                
                # Inserir watchtowers
                if normalized_watchtowers:
                    watchtower_base = base_timestamp + timedelta(milliseconds=len(normalized_fences))
                    timestamps = generate_unique_timestamps(watchtower_base, len(normalized_watchtowers))
                    inserted_count, _ = self.queries.insert_watchtowers_batch(cursor, normalized_watchtowers, timestamps)
                    total_inserted += inserted_count
                    logger.info(f"Inseridos {inserted_count} watchtowers")
                
                # Inserir flags
                if normalized_flags:
                    flag_base = base_timestamp + timedelta(milliseconds=len(normalized_fences) + len(normalized_watchtowers))
                    timestamps = generate_unique_timestamps(flag_base, len(normalized_flags))
                    inserted_count, _ = self.queries.insert_flags_batch(cursor, normalized_flags, timestamps)
                    total_inserted += inserted_count
                    logger.info(f"Inseridos {inserted_count} flags")
                
                if total_inserted <= 0:
                    conn.rollback()
                    conn.close()
                    logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                conn.commit()
                conn.close()
                
                logger.info(f"Inseridas {total_inserted} structures no banco")
                
                return True
                
            except sqlite3.OperationalError as e:
                error_msg = str(e)
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                
                if "database is locked" in error_msg.lower():
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{self.max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {self.max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional (tentativa {attempt}/{self.max_retries}): {e}")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                    
            except sqlite3.IntegrityError as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro de integridade SQLite (tentativa {attempt}/{self.max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar dados de structures (tentativa {attempt}/{self.max_retries}): {e}")
                if attempt < self.max_retries:
                    retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir structures após {self.max_retries} tentativas")
        return False
