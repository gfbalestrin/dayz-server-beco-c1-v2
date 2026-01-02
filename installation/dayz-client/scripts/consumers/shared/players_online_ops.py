"""
Operações compartilhadas para gerenciamento de players_online e players_events.
Usado por events_consumer.py e positions_consumer/processors/players.py

Este módulo centraliza a lógica de:
- Registro de conexão de jogadores (INSERT em players_online + INSERT em players_events)
- Registro de desconexão de jogadores (DELETE de players_online + INSERT em players_events)
- Reset da tabela players_online
- Inserção de eventos em players_events
"""

import sqlite3
import json
import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
BASE_RETRY_DELAY = 0.2


def _configure_sqlite_pragmas(cursor: sqlite3.Cursor) -> None:
    """Configura PRAGMAs SQLite para melhor performance e confiabilidade"""
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA synchronous = NORMAL")
    cursor.execute("PRAGMA busy_timeout = 10000")


def _is_last_event_same_type(db_path: str, player_id: str, event_type: str) -> bool:
    """
    Verifica se o último evento do jogador é do mesmo tipo.
    Usado para evitar eventos duplicados de conexão/desconexão.

    Args:
        db_path: Caminho do banco SQLite
        player_id: ID do jogador
        event_type: Tipo do evento (player_connected, player_disconnected)

    Returns:
        bool: True se o último evento for do mesmo tipo
    """
    try:
        conn = sqlite3.connect(db_path, timeout=10.0)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT EventType FROM players_events
            WHERE PlayerID = ?
            ORDER BY TimeStamp DESC LIMIT 1
        """, (player_id,))
        row = cursor.fetchone()
        conn.close()
        return row is not None and row[0] == event_type
    except Exception as e:
        logger.debug(f"Erro ao verificar último evento de {player_id}: {e}")
        return False


def insert_player_event(
    db_path: str,
    player_id: str,
    event_type: str,
    coord_x: Optional[float] = None,
    coord_y: Optional[float] = None,
    coord_z: Optional[float] = None,
    details: Optional[str] = None,
    related_player_id: Optional[str] = None,
    check_duplicate: bool = False
) -> bool:
    """
    Insere evento na tabela players_events.

    Args:
        db_path: Caminho do banco SQLite
        player_id: ID do jogador
        event_type: Tipo do evento (player_connected, player_disconnected, etc.)
        coord_x: Coordenada X (opcional)
        coord_y: Coordenada Y (opcional)
        coord_z: Coordenada Z (opcional)
        details: Detalhes do evento em JSON (opcional)
        related_player_id: ID de jogador relacionado (opcional)
        check_duplicate: Se True, verifica se o último evento é do mesmo tipo antes de inserir

    Returns:
        bool: True se operação bem-sucedida
    """
    if not player_id or not event_type:
        return False

    # Verificar duplicação se solicitado (para eventos de conexão/desconexão)
    if check_duplicate and event_type in ('player_connected', 'player_disconnected'):
        if _is_last_event_same_type(db_path, player_id, event_type):
            logger.debug(f"Evento {event_type} duplicado ignorado para {player_id}")
            return True  # Retorna sucesso sem inserir

    # Escapar aspas simples em strings
    player_id_escaped = player_id.replace("'", "''")
    event_type_escaped = event_type.replace("'", "''")
    details_escaped = details.replace("'", "''") if details else None
    related_player_escaped = related_player_id.replace("'", "''") if related_player_id else None

    # Validar coordenadas
    coord_x_sql = coord_x if coord_x is not None and isinstance(coord_x, (int, float)) else None
    coord_y_sql = coord_y if coord_y is not None and isinstance(coord_y, (int, float)) else None
    coord_z_sql = coord_z if coord_z is not None and isinstance(coord_z, (int, float)) else None

    # Preparar SQL
    details_sql = f"'{details_escaped}'" if details_escaped else "NULL"
    related_player_sql = f"'{related_player_escaped}'" if related_player_escaped else "NULL"

    conn = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            cursor = conn.cursor()

            _configure_sqlite_pragmas(cursor)

            sql = f"""
            INSERT INTO players_events (PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID)
            VALUES (
                '{player_id_escaped}',
                '{event_type_escaped}',
                {coord_x_sql if coord_x_sql is not None else 'NULL'},
                {coord_y_sql if coord_y_sql is not None else 'NULL'},
                {coord_z_sql if coord_z_sql is not None else 'NULL'},
                {details_sql},
                {related_player_sql}
            )
            """

            cursor.execute(sql)
            conn.commit()
            conn.close()
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
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"Banco bloqueado ao inserir evento após {MAX_RETRIES} tentativas")
                    return False
            else:
                logger.error(f"Erro SQLite ao inserir evento (tentativa {attempt}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao inserir evento (tentativa {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                time.sleep(retry_delay)
                continue
            return False

    return False


def register_player_connected(
    db_path: str,
    player_id: str,
    timestamp: Optional[datetime] = None,
    geo_data: Optional[Dict[str, Any]] = None,
    insert_event: bool = True
) -> bool:
    """
    Registra conexão de jogador.
    - Insere em players_online (INSERT OR IGNORE)
    - Opcionalmente insere evento player_connected em players_events (com verificação de duplicação)

    Args:
        db_path: Caminho do banco SQLite
        player_id: ID do jogador
        timestamp: Timestamp da conexão (default: now)
        geo_data: Dados de geolocalização para incluir no evento (Country, City, IP, Port, Ping, Lon)
        insert_event: Se True, insere evento em players_events

    Returns:
        bool: True se operação bem-sucedida
    """
    if not player_id:
        logger.warning("register_player_connected: player_id ausente")
        return False

    player_id = player_id.strip()
    if not player_id:
        logger.warning("register_player_connected: player_id vazio após strip")
        return False

    if timestamp is None:
        timestamp = datetime.now()

    timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')

    conn = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            cursor = conn.cursor()

            _configure_sqlite_pragmas(cursor)

            # Inserir em players_online (INSERT OR IGNORE para não sobrescrever)
            cursor.execute(
                "INSERT OR IGNORE INTO players_online (PlayerID, DataConnect) VALUES (?, ?)",
                (player_id, timestamp_str)
            )

            inserted = cursor.rowcount > 0
            conn.commit()
            conn.close()

            if inserted:
                logger.info(f"Jogador {player_id} inserido em players_online")

            # Inserir evento se solicitado (com verificação de duplicação)
            if insert_event and not _is_last_event_same_type(db_path, player_id, 'player_connected'):
                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                details_dict = {'timestamp': current_date}

                # Adicionar dados de geolocalização se fornecidos
                if geo_data:
                    if geo_data.get('Country'):
                        details_dict['Country'] = geo_data['Country']
                    if geo_data.get('City'):
                        details_dict['City'] = geo_data['City']
                    if geo_data.get('IP'):
                        details_dict['IP'] = geo_data['IP']
                    if geo_data.get('Lon') is not None:
                        try:
                            details_dict['Lon'] = float(geo_data['Lon'])
                        except (TypeError, ValueError):
                            pass
                    if geo_data.get('Port') is not None:
                        try:
                            details_dict['Port'] = int(geo_data['Port'])
                        except (TypeError, ValueError):
                            pass
                    if geo_data.get('Ping') is not None:
                        try:
                            details_dict['Ping'] = int(geo_data['Ping'])
                        except (TypeError, ValueError):
                            pass

                details_json = json.dumps(details_dict)
                insert_player_event(
                    db_path=db_path,
                    player_id=player_id,
                    event_type='player_connected',
                    details=details_json
                )

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
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(f"Banco bloqueado ao registrar conexão, tentando em {retry_delay}s (tentativa {attempt}/{MAX_RETRIES})")
                    time.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"Banco bloqueado ao registrar conexão após {MAX_RETRIES} tentativas")
                    return False
            else:
                logger.error(f"Erro SQLite ao registrar conexão (tentativa {attempt}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao registrar conexão (tentativa {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                time.sleep(retry_delay)
                continue
            return False

    return False


def register_player_disconnected(
    db_path: str,
    player_id: str,
    geo_data: Optional[Dict[str, Any]] = None,
    insert_event: bool = True
) -> bool:
    """
    Registra desconexão de jogador.
    - Remove de players_online
    - Opcionalmente insere evento player_disconnected em players_events

    Args:
        db_path: Caminho do banco SQLite
        player_id: ID do jogador
        geo_data: Dados de geolocalização para incluir no evento (Country, City, Lon, IP, Port, Ping)
        insert_event: Se True, insere evento em players_events

    Returns:
        bool: True se operação bem-sucedida
    """
    if not player_id:
        logger.warning("register_player_disconnected: player_id ausente")
        return False

    player_id = player_id.strip()
    if not player_id:
        logger.warning("register_player_disconnected: player_id vazio após strip")
        return False

    conn = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            cursor = conn.cursor()

            _configure_sqlite_pragmas(cursor)

            # Remover de players_online
            cursor.execute(
                "DELETE FROM players_online WHERE PlayerID = ?",
                (player_id,)
            )

            deleted = cursor.rowcount > 0
            conn.commit()
            conn.close()

            if deleted:
                logger.info(f"Jogador {player_id} removido de players_online")

            # Inserir evento se solicitado (com verificação de duplicação)
            if insert_event and not _is_last_event_same_type(db_path, player_id, 'player_disconnected'):
                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                details_dict = {'timestamp': current_date}

                # Adicionar dados de geolocalização se fornecidos
                if geo_data:
                    if geo_data.get('Country'):
                        details_dict['Country'] = geo_data['Country']
                    if geo_data.get('City'):
                        details_dict['City'] = geo_data['City']
                    if geo_data.get('Lon') is not None:
                        try:
                            details_dict['Lon'] = float(geo_data['Lon'])
                        except (TypeError, ValueError):
                            pass
                    if geo_data.get('IP'):
                        details_dict['IP'] = geo_data['IP']
                    if geo_data.get('Port') is not None:
                        try:
                            details_dict['Port'] = int(geo_data['Port'])
                        except (TypeError, ValueError):
                            pass
                    if geo_data.get('Ping') is not None:
                        try:
                            details_dict['Ping'] = int(geo_data['Ping'])
                        except (TypeError, ValueError):
                            pass

                details_json = json.dumps(details_dict)
                insert_player_event(
                    db_path=db_path,
                    player_id=player_id,
                    event_type='player_disconnected',
                    details=details_json
                )

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
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(f"Banco bloqueado ao registrar desconexão, tentando em {retry_delay}s (tentativa {attempt}/{MAX_RETRIES})")
                    time.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"Banco bloqueado ao registrar desconexão após {MAX_RETRIES} tentativas")
                    return False
            else:
                logger.error(f"Erro SQLite ao registrar desconexão (tentativa {attempt}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao registrar desconexão (tentativa {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                time.sleep(retry_delay)
                continue
            return False

    return False


def reset_players_online(db_path: str) -> bool:
    """
    Reseta tabela players_online (DELETE FROM players_online).
    Usado em eventos de restart do servidor.

    Args:
        db_path: Caminho do banco SQLite

    Returns:
        bool: True se operação bem-sucedida
    """
    conn = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = sqlite3.connect(db_path, timeout=10.0)
            cursor = conn.cursor()

            _configure_sqlite_pragmas(cursor)

            cursor.execute("DELETE FROM players_online")

            conn.commit()
            conn.close()
            logger.info("Tabela players_online resetada")
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
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(f"Banco bloqueado ao resetar players_online, tentando em {retry_delay}s (tentativa {attempt}/{MAX_RETRIES})")
                    time.sleep(retry_delay)
                    continue
                else:
                    logger.error(f"Banco bloqueado ao resetar players_online após {MAX_RETRIES} tentativas")
                    return False
            else:
                logger.error(f"Erro SQLite ao resetar players_online (tentativa {attempt}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES:
                    retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao resetar players_online (tentativa {attempt}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES:
                retry_delay = BASE_RETRY_DELAY * (2 ** (attempt - 1))
                time.sleep(retry_delay)
                continue
            return False

    return False
