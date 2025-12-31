"""
Processador de dados de players
"""

import sqlite3
import json
import math
import time
import logging
import base64
import sys
import os
import subprocess
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional

# Adicionar diretório admin-interface ao path para importar config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), 'admin-interface'))
import config

from ..database.sqlite_utils import configure_sqlite_pragmas, generate_unique_timestamps, ensure_players_in_database
from ..database.queries import Queries
from ..utils.validation import validate_coordinates, validate_id
from ..utils.normalization import safe_float, safe_int
from ..discord.webhooks import sanitize_discord_markdown, send_discord_webhook, insert_player_event, update_discord_players_online_message

logger = logging.getLogger(__name__)


class PlayersProcessor:
    """
    Processador de dados de jogadores
    """
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.queries = Queries(db_path)
        self.max_retries = 5
        self.base_retry_delay = 0.5
        self.previous_players: set = set()  # Estado de players anteriores para detecção de conectados/desconectados
    
    def _validate_player_data(self, player: Dict[str, Any]) -> bool:
        """Valida dados obrigatórios de um player"""
        # Validar player_id (obrigatório)
        if not validate_id(player.get('player_id'), 'player_id'):
            return False
        
        # Validar coordenadas (obrigatórias, números válidos)
        x, z, y = validate_coordinates(player)
        if x is None or z is None or y is None:
            return False
        
        return True
    
    def _normalize_player_values(self, player: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Normaliza valores de um player para inserção no banco"""
        if not self._validate_player_data(player):
            return None
        
        normalized = {}
        
        # PlayerID (obrigatório, já validado)
        normalized['player_id'] = player['player_id'].strip()
        
        # Coordenadas (obrigatórias, já validadas)
        x, z, y = validate_coordinates(player)
        normalized['coord_x'] = x
        normalized['coord_z'] = z
        normalized['coord_y'] = y
        
        # Valores numéricos opcionais
        normalized['health'] = safe_float(player.get('health'))
        normalized['blood'] = safe_float(player.get('blood'))
        normalized['shock'] = safe_float(player.get('shock'))
        normalized['energy'] = safe_float(player.get('energy'))
        normalized['water'] = safe_float(player.get('water'))
        normalized['stamina'] = safe_float(player.get('stamina'))
        normalized['stamina_max'] = safe_float(player.get('stamina_max'))
        
        # ItemsCount (inteiro)
        try:
            items_count = player.get('items_count')
            if items_count is None or items_count == '':
                normalized['items_count'] = None
            else:
                normalized['items_count'] = int(items_count)
        except (TypeError, ValueError):
            normalized['items_count'] = None
        
        # Booleanos (converter para 0/1)
        is_alive = player.get('is_alive')
        normalized['is_alive'] = safe_int(is_alive, 0)
        
        is_admin = player.get('is_admin')
        normalized['is_admin'] = safe_int(is_admin, 0)
        
        # Arrays JSON (serializar para string)
        items_in_hands = player.get('items_in_hands')
        if items_in_hands:
            try:
                if isinstance(items_in_hands, list):
                    normalized['items_in_hands'] = json.dumps(items_in_hands)
                elif isinstance(items_in_hands, str):
                    # Tentar validar se já é JSON válido
                    json.loads(items_in_hands)
                    normalized['items_in_hands'] = items_in_hands
                else:
                    normalized['items_in_hands'] = None
            except (json.JSONDecodeError, TypeError):
                normalized['items_in_hands'] = None
        else:
            normalized['items_in_hands'] = None
        
        main_items = player.get('main_items')
        if main_items:
            try:
                if isinstance(main_items, list):
                    normalized['main_items'] = json.dumps(main_items)
                elif isinstance(main_items, str):
                    # Tentar validar se já é JSON válido
                    json.loads(main_items)
                    normalized['main_items'] = main_items
                else:
                    normalized['main_items'] = None
            except (json.JSONDecodeError, TypeError):
                normalized['main_items'] = None
        else:
            normalized['main_items'] = None
        
        return normalized

    def _execute_rcon_players_geo(self) -> Optional[List[Dict[str, Any]]]:
        """
        Executa comando RCON 'players' com parâmetro de geolocalização (-g)
        Retorna lista de jogadores com dados de geolocalização
        """
        if not config.RCON_PASSWORD:
            logger.debug("RCON_PASSWORD não configurada, geolocalização desabilitada")
            return None

        geolite_path = getattr(config, 'GEOLITE2_DB_PATH', '')
        if not geolite_path or not os.path.exists(geolite_path):
            logger.debug(f"GeoLite2 database não encontrado: {geolite_path}")
            return None

        try:
            cmd = [
                config.RCON_BIN_PATH,
                '-i', config.RCON_IP,
                '-p', str(config.RCON_PORT),
                '-P', config.RCON_PASSWORD,
                '-g', geolite_path,
                '-j', 'players'
            ]

            logger.debug(f"Executando RCON players geo: {config.RCON_BIN_PATH} -i {config.RCON_IP} -p {config.RCON_PORT} -P *** -g {geolite_path} -j players")

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode != 0:
                logger.debug(f"RCON players geo retornou código {result.returncode}: {result.stderr}")
                return None

            if not result.stdout or not result.stdout.strip():
                logger.debug("RCON players geo retornou resposta vazia")
                return None

            players_data = json.loads(result.stdout)
            logger.debug(f"RCON players geo retornou {len(players_data) if players_data else 0} jogadores")
            return players_data

        except subprocess.TimeoutExpired:
            logger.warning("Timeout ao executar RCON players geo")
            return None
        except json.JSONDecodeError as e:
            logger.warning(f"Resposta RCON não é JSON válido: {e}")
            return None
        except Exception as e:
            logger.warning(f"Erro ao executar RCON players geo: {e}")
            return None

    def _update_players_geolocation(self, connect_players: set) -> bool:
        """
        Atualiza dados de geolocalização dos jogadores recém-conectados
        Chama RCON para obter dados e faz UPDATE na tabela players_online
        """
        if not connect_players:
            return True

        # Buscar dados de geolocalização via RCON
        rcon_players = self._execute_rcon_players_geo()
        if not rcon_players:
            logger.debug("Nenhum dado de geolocalização obtido via RCON")
            return True

        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=10.0)
            cursor = conn.cursor()

            # Buscar RconGuid dos jogadores conectados
            placeholders = ','.join(['?'] * len(connect_players))
            cursor.execute(f"""
                SELECT PlayerID, RconGuid
                FROM players_database
                WHERE PlayerID IN ({placeholders}) AND RconGuid IS NOT NULL AND RconGuid != ''
            """, list(connect_players))

            player_guid_map = {row[1]: row[0] for row in cursor.fetchall()}

            if not player_guid_map:
                logger.debug("Nenhum jogador conectado possui RconGuid")
                conn.close()
                return True

            # Fazer match e atualizar
            updated_count = 0
            for rcon_player in rcon_players:
                guid = rcon_player.get('guid')
                if not guid or guid not in player_guid_map:
                    continue

                player_id = player_guid_map[guid]

                # Preparar valores
                country = rcon_player.get('country') or None
                city = rcon_player.get('city') or None
                lon = rcon_player.get('lon')
                ip = rcon_player.get('ip') or None
                port = rcon_player.get('port')
                ping = rcon_player.get('ping')

                cursor.execute("""
                    UPDATE players_online
                    SET Country = ?, City = ?, Lon = ?, IP = ?, Port = ?, Ping = ?
                    WHERE PlayerID = ?
                """, (country, city, lon, ip, port, ping, player_id))

                if cursor.rowcount > 0:
                    updated_count += 1
                    logger.debug(f"Geolocalização atualizada para {player_id}: {country}/{city}")

            conn.commit()
            conn.close()

            if updated_count > 0:
                logger.info(f"Geolocalização atualizada para {updated_count} jogadores")

            return True

        except Exception as e:
            logger.warning(f"Erro ao atualizar geolocalização: {e}")
            if conn:
                try:
                    conn.close()
                except:
                    pass
            return False

    def _update_players_online(self, current_player_ids: List[str], timestamp: datetime) -> bool:
        """
        Atualiza tabela players_online baseado em jogadores conectados/desconectados
        Compara lista atual com lista anterior e executa INSERT/DELETE conforme necessário
        """
        logger.info(f"_update_players_online: chamado com {len(current_player_ids) if current_player_ids else 0} player_ids. previous_players tem {len(self.previous_players)} players")
        
        if not current_player_ids:
            logger.debug("_update_players_online: lista de player_ids vazia, retornando sem processar")
            return True
        
        current_set = set(current_player_ids)
        connect_players = current_set - self.previous_players
        disconnect_players = self.previous_players - current_set
        
        logger.info(f"_update_players_online: current_set={len(current_set)} players, previous_players={len(self.previous_players)} players, connect_players={len(connect_players)}, disconnect_players={len(disconnect_players)}")
        
        has_changes = bool(connect_players or disconnect_players)
        if not has_changes:
            logger.debug(f"_update_players_online: nenhuma mudança detectada, mas sincronizando banco para garantir consistência")
        
        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S')
        
        conn = None
        for attempt in range(1, self.max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                configure_sqlite_pragmas(cursor)
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                # Buscar dados dos jogadores para Discord ANTES de modificar players_online
                connect_players_data = {}
                disconnect_players_data = {}
                
                if has_changes:
                    if connect_players:
                        placeholders = ','.join(['?'] * len(connect_players))
                        cursor.execute(f"""
                            SELECT PlayerID, PlayerName, SteamID, SteamName
                            FROM players_database
                            WHERE PlayerID IN ({placeholders})
                        """, list(connect_players))
                        for row in cursor.fetchall():
                            connect_players_data[row[0]] = {
                                'player_name': row[1],
                                'steam_id': row[2],
                                'steam_name': row[3]
                            }
                    
                    if disconnect_players:
                        placeholders = ','.join(['?'] * len(disconnect_players))
                        cursor.execute(f"""
                            SELECT 
                                p.PlayerID, p.PlayerName, p.SteamID, p.SteamName,
                                o.Country, o.City, o.Lon, o.IP, o.Port, o.Ping
                            FROM players_database p
                            LEFT JOIN players_online o ON p.PlayerID = o.PlayerID
                            WHERE p.PlayerID IN ({placeholders})
                        """, list(disconnect_players))
                        for row in cursor.fetchall():
                            disconnect_players_data[row[0]] = {
                                'player_name': row[1],
                                'steam_id': row[2],
                                'steam_name': row[3],
                                'country': row[4],
                                'city': row[5],
                                'lon': row[6],
                                'ip': row[7],
                                'port': row[8],
                                'ping': row[9]
                            }
                
                # SEMPRE atualizar todos os players atuais
                if current_set:
                    logger.debug(f"Sincronizando {len(current_set)} jogadores atuais na tabela players_online")
                    all_current_values = [(player_id, timestamp_str) for player_id in current_set]
                    cursor.executemany(
                        "INSERT OR REPLACE INTO players_online (PlayerID, DataConnect) VALUES (?, ?)",
                        all_current_values
                    )
                    logger.debug(f"Atualizados {len(current_set)} jogadores como conectados (sincronização completa)")
                
                # Processar desconectados
                if disconnect_players:
                    logger.info(f"Processando {len(disconnect_players)} jogadores para desconectar da tabela players_online")
                    disconnect_values = [(player_id,) for player_id in disconnect_players]
                    cursor.executemany(
                        "DELETE FROM players_online WHERE PlayerID = ?",
                        disconnect_values
                    )
                    logger.info(f"Removidos {len(disconnect_players)} jogadores como desconectados: {list(disconnect_players)[:5]}{'...' if len(disconnect_players) > 5 else ''}")
                
                # Limpeza de players órfãos
                cursor.execute("SELECT PlayerID FROM players_online")
                db_player_ids = {row[0] for row in cursor.fetchall()}
                orphaned_players = db_player_ids - current_set
                
                if orphaned_players:
                    logger.info(f"Removendo {len(orphaned_players)} jogadores órfãos que estão no banco mas não estão na lista atual")
                    orphaned_values = [(player_id,) for player_id in orphaned_players]
                    cursor.executemany(
                        "DELETE FROM players_online WHERE PlayerID = ?",
                        orphaned_values
                    )
                    logger.info(f"Removidos {len(orphaned_players)} jogadores órfãos: {list(orphaned_players)[:5]}{'...' if len(orphaned_players) > 5 else ''}")
                
                conn.commit()
                
                # Processar Discord e eventos (não bloquear se falhar)
                try:
                    if connect_players or disconnect_players:
                        for player_id in connect_players:
                            try:
                                player_data = connect_players_data.get(player_id, {})
                                player_name = player_data.get('player_name', 'NaoIdentificado')
                                steam_id = player_data.get('steam_id', '')
                                steam_name = player_data.get('steam_name', '')
                                
                                if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                                    content = ""  # Originalmente comentado no código
                                    send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
                                
                                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                details_json = json.dumps({'timestamp': current_date})
                                insert_player_event(player_id, 'player_connected', details=details_json)
                            except Exception as e:
                                logger.warning(f"Erro ao processar Discord para jogador conectado {player_id}: {e}")
                        
                        for player_id in disconnect_players:
                            try:
                                player_data = disconnect_players_data.get(player_id, {})
                                player_name = player_data.get('player_name', 'NaoIdentificado')
                                steam_id = player_data.get('steam_id', '')
                                steam_name = player_data.get('steam_name', '')
                                
                                if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                                    content = ""  # Originalmente comentado no código
                                    send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
                                
                                current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                                details_dict = {
                                    'timestamp': current_date,
                                    'Country': player_data.get('country') or None,
                                    'City': player_data.get('city') or None,
                                    'Lon': float(player_data.get('lon')) if player_data.get('lon') else None,
                                    'IP': player_data.get('ip') or None,
                                    'Port': int(player_data.get('port')) if player_data.get('port') else None,
                                    'Ping': int(player_data.get('ping')) if player_data.get('ping') else None
                                }
                                details_dict = {k: v for k, v in details_dict.items() if v is not None}
                                details_json = json.dumps(details_dict)
                                insert_player_event(player_id, 'player_disconnected', details=details_json)
                            except Exception as e:
                                logger.warning(f"Erro ao processar Discord para jogador desconectado {player_id}: {e}")
                        
                        update_discord_players_online_message()
                    
                except Exception as e:
                    logger.warning(f"Erro ao processar Discord (não crítico): {e}")

                conn.close()

                # Atualizar geolocalização dos jogadores conectados (não crítico)
                if connect_players:
                    try:
                        self._update_players_geolocation(connect_players)
                    except Exception as e:
                        logger.warning(f"Erro ao atualizar geolocalização (não crítico): {e}")

                # Atualizar estado apenas após sucesso
                logger.info(f"_update_players_online: atualizando previous_players de {len(self.previous_players)} para {len(current_set)} players")
                self.previous_players = current_set
                logger.debug(f"_update_players_online: previous_players atualizado para: {list(self.previous_players)[:5]}{'...' if len(self.previous_players) > 5 else ''}")
                
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
                        logger.warning(f"Banco players_online bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{self.max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco players_online bloqueado após {self.max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional ao atualizar players_online (tentativa {attempt}/{self.max_retries}): {e}")
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
                logger.error(f"Erro de integridade SQLite ao atualizar players_online (tentativa {attempt}/{self.max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao atualizar players_online (tentativa {attempt}/{self.max_retries}): {e}")
                if attempt < self.max_retries:
                    retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao atualizar players_online após {self.max_retries} tentativas")
        return False
    
    def process(self, data: Dict[str, Any]) -> bool:
        """
        Processa dados de jogadores e insere no banco SQLite
        Implementa lógica completa baseada em INSERT_PLAYERS_POSITIONS_BATCH do config.sh
        """
        # Validar entrada
        players = data.get('players', [])
        if not players or not isinstance(players, list):
            logger.warning("Dados de players inválidos ou vazios")
            return False
        
        logger.info(f"Processando {len(players)} players do RabbitMQ")
        
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
        
        # Normalizar e validar players
        normalized_players = []
        player_ids = []
        original_players_data = []
        for player in players:
            normalized = self._normalize_player_values(player)
            if normalized:
                normalized_players.append(normalized)
                player_ids.append(normalized['player_id'])
                original_players_data.append({
                    'player_id': normalized['player_id'],
                    'player_name': player.get('player_name'),
                    'steam_id': player.get('steam_id')
                })
        
        if not normalized_players:
            logger.warning("Nenhum player válido após normalização")
            return False
        
        logger.info(f"Após normalização: {len(normalized_players)} players válidos de {len(players)} recebidos")
        
        timestamps = generate_unique_timestamps(base_timestamp, len(normalized_players))
        
        conn = None
        for attempt in range(1, self.max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                configure_sqlite_pragmas(cursor)
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                # Garantir que todos os PlayerIDs existem em players_database
                if not ensure_players_in_database(cursor, original_players_data):
                    conn.rollback()
                    conn.close()
                    logger.error(f"Falha ao garantir PlayerIDs em players_database (tentativa {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Inserir players em batch
                inserted_count, last_rowid = self.queries.insert_players_batch(
                    cursor, normalized_players, timestamps
                )
                
                if inserted_count <= 0:
                    conn.rollback()
                    conn.close()
                    logger.error(f"INSERT não inseriu nenhum registro (tentativa {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                conn.commit()
                
                # Recuperar IDs inseridos
                first_rowid = last_rowid - inserted_count + 1 if last_rowid > 0 and inserted_count > 0 else 0
                player_coord_map = self.queries.get_inserted_player_ids(
                    cursor, first_rowid, last_rowid, player_ids, inserted_count
                )
                
                conn.close()
                
                logger.info(f"Inseridos {inserted_count} players no banco (IDs recuperados: {len(player_coord_map)})")
                
                # Atualizar tabela players_online (conectados/desconectados)
                try:
                    result = self._update_players_online(player_ids, base_timestamp)
                    logger.info(f"_update_players_online retornou: {result}")
                except Exception as e:
                    import traceback
                    logger.warning(f"Erro ao atualizar players_online (não crítico): {e}")
                    logger.warning(f"Traceback completo: {traceback.format_exc()}")
                
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
                logger.error(f"Erro inesperado ao processar dados de jogadores (tentativa {attempt}/{self.max_retries}): {e}")
                if attempt < self.max_retries:
                    retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir players após {self.max_retries} tentativas")
        return False
    
    def process_backup_data(self, data: Dict[str, Any]) -> bool:
        """
        Processa dados de backup de jogadores e insere no banco SQLite
        Insere coordenadas em players_coord e backup BLOB em players_coord_backup
        """
        # Validar entrada - verificar se é mensagem de backup
        action = data.get('action')
        if action != 'players_backup_data':
            logger.warning(f"Mensagem de backup com action inválida: {action}")
            return False
        
        # Extrair dados da mensagem
        player_id = data.get('player_id')
        backup_data_base64 = data.get('backup_data')
        coord_x = data.get('coord_x')
        coord_z = data.get('coord_z')
        coord_y = data.get('coord_y')
        timestamp_str = data.get('timestamp')
        
        # Validar dados obrigatórios
        if not player_id or not isinstance(player_id, str) or not player_id.strip():
            logger.warning("player_id inválido ou ausente na mensagem de backup")
            return False
        
        if not backup_data_base64 or not isinstance(backup_data_base64, str):
            logger.warning(f"backup_data inválido ou ausente para {player_id}")
            return False
        
        if coord_x is None or coord_z is None or coord_y is None:
            logger.warning(f"Coordenadas ausentes na mensagem de backup para {player_id}")
            return False
        
        # Converter coordenadas para float
        try:
            coord_x_float = float(coord_x)
            coord_z_float = float(coord_z)
            coord_y_float = float(coord_y)
        except (TypeError, ValueError) as e:
            logger.warning(f"Erro ao converter coordenadas para {player_id}: {e}")
            return False
        
        # Decodificar base64 para bytes (BLOB)
        try:
            backup_blob = base64.b64decode(backup_data_base64)
        except Exception as e:
            logger.error(f"Erro ao decodificar base64 para {player_id}: {e}")
            return False
        
        # Preparar dados para ensure_players_in_database
        original_player_data = [{
            'player_id': player_id.strip(),
            'player_name': None,
            'steam_id': None
        }]
        
        conn = None
        for attempt in range(1, self.max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                
                configure_sqlite_pragmas(cursor)
                cursor.execute("BEGIN IMMEDIATE TRANSACTION")
                
                # Garantir que PlayerID existe em players_database
                if not ensure_players_in_database(cursor, original_player_data):
                    conn.rollback()
                    conn.close()
                    logger.error(f"Falha ao garantir PlayerID em players_database para {player_id} (tentativa {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Buscar último timestamp de players_coord para este player_id
                cursor.execute("""
                    SELECT Data 
                    FROM players_coord 
                    WHERE PlayerID = ? 
                    ORDER BY datetime(Data) DESC 
                    LIMIT 1
                """, (player_id.strip(),))
                
                last_position_result = cursor.fetchone()
                last_position_timestamp = None
                
                if last_position_result:
                    last_position_timestamp = last_position_result[0]
                    try:
                        if isinstance(last_position_timestamp, str):
                            try:
                                last_dt = datetime.strptime(last_position_timestamp, '%Y-%m-%d %H:%M:%S.%f')
                            except ValueError:
                                last_dt = datetime.strptime(last_position_timestamp, '%Y-%m-%d %H:%M:%S')
                        else:
                            last_dt = None
                        
                        if last_dt:
                            time_diff = datetime.now() - last_dt
                            if time_diff.total_seconds() <= 300:
                                timestamp_str = last_position_timestamp
                                try:
                                    dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S.%f')
                                    timestamp_str = dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                                except ValueError:
                                    dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                                    timestamp_str = dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                                logger.info(f"Usando timestamp da última posição para {player_id}: {timestamp_str}")
                            else:
                                logger.debug(f"Última posição de {player_id} é muito antiga ({time_diff.total_seconds():.0f}s), usando timestamp da mensagem")
                                last_position_timestamp = None
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Erro ao processar timestamp da última posição para {player_id}: {e}")
                        last_position_timestamp = None
                
                # Se não encontrou timestamp recente, usar timestamp da mensagem ou atual
                if not last_position_timestamp:
                    if not timestamp_str:
                        timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                    else:
                        try:
                            dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S.%f')
                            timestamp_str = dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                        except (ValueError, TypeError):
                            try:
                                dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                                timestamp_str = dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                            except (ValueError, TypeError):
                                logger.warning(f"Timestamp inválido para {player_id} ({timestamp_str}), usando timestamp atual")
                                timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                
                # Inserir novo registro na tabela players_coord
                cursor.execute("""
                    INSERT INTO players_coord (PlayerID, CoordX, CoordZ, CoordY, Data)
                    VALUES (?, ?, ?, ?, ?)
                """, (player_id.strip(), coord_x_float, coord_z_float, coord_y_float, timestamp_str))
                
                player_coord_id = cursor.lastrowid
                
                if not player_coord_id:
                    conn.rollback()
                    conn.close()
                    logger.error(f"Falha ao obter PlayerCoordId após INSERT para {player_id} (tentativa {attempt}/{self.max_retries})")
                    if attempt < self.max_retries:
                        retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    return False
                
                # Inserir backup na tabela players_coord_backup
                cursor.execute("""
                    INSERT INTO players_coord_backup (PlayerCoordId, Backup, TimeStamp)
                    VALUES (?, ?, ?)
                """, (player_coord_id, backup_blob, timestamp_str))
                
                conn.commit()
                conn.close()
                
                logger.info(f"Backup inserido com sucesso para {player_id} (PlayerCoordId: {player_coord_id})")
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
                        logger.warning(f"Banco bloqueado ao inserir backup para {player_id}, tentando novamente em {retry_delay}s (tentativa {attempt}/{self.max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {self.max_retries} tentativas para {player_id}")
                        return False
                else:
                    logger.error(f"Erro SQLite operacional ao inserir backup para {player_id} (tentativa {attempt}/{self.max_retries}): {e}")
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
                logger.error(f"Erro de integridade SQLite ao inserir backup para {player_id} (tentativa {attempt}/{self.max_retries}): {e}")
                return False
                
            except Exception as e:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro inesperado ao processar backup para {player_id} (tentativa {attempt}/{self.max_retries}): {e}")
                if attempt < self.max_retries:
                    retry_delay = self.base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        logger.error(f"Falha ao inserir backup para {player_id} após {self.max_retries} tentativas")
        return False
