#!/usr/bin/env python3
"""
Consumer RabbitMQ para eventos
Consome filas events.server, events.players e events.unknown
"""

import pika
import json
import sqlite3
import logging
import sys
import os
import time
import re
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional

# Adicionar diretório admin-interface ao path para importar config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'admin-interface'))
import config

# Tentar importar requests, fallback para urllib
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    try:
        from urllib import request as urllib_request
    except ImportError:
        urllib_request = None

# Configurar logging para systemd/journalctl
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True
)
logger = logging.getLogger(__name__)


class EventsConsumer:
    """Consumer para processar eventos do RabbitMQ"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.db_logs_path = config.DB_LOGS
        self.db_players_path = config.DB_PLAYERS
        self.batch_size = 50
        self.batch_timeout = 5.0  # segundos
        self.batch = []
        self.last_batch_time = time.time()
        
    def connect(self):
        """Conecta ao RabbitMQ"""
        try:
            credentials = pika.PlainCredentials(
                config.RABBITMQ_USERNAME,
                config.RABBITMQ_PASSWORD
            )
            parameters = pika.ConnectionParameters(
                host=config.RABBITMQ_HOST,
                port=config.RABBITMQ_PORT,
                virtual_host=config.RABBITMQ_VHOST,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # Declarar exchange
            self.channel.exchange_declare(
                exchange=config.RABBITMQ_EXCHANGE,
                exchange_type='topic',
                durable=True
            )
            
            # Declarar filas
            for queue_name in ['events.server', 'events.players', 'events.unknown']:
                self.channel.queue_declare(queue=queue_name, durable=True)
                self.channel.queue_bind(
                    exchange=config.RABBITMQ_EXCHANGE,
                    queue=queue_name,
                    routing_key=queue_name
                )
            
            logger.info("Conectado ao RabbitMQ")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao conectar ao RabbitMQ: {e}")
            return False
    
    def _sanitize_discord_markdown(self, text: str) -> str:
        """Escapa caracteres especiais do Discord markdown"""
        if not text:
            return ""
        text = text.replace('\n', '').replace('\r', '')
        text = re.sub(r'([*_~`|\[\]()<>"\\])', r'\\\1', text)
        return text
    
    def _send_discord_webhook(self, content: str, webhook_url: str) -> bool:
        """Envia webhook para Discord"""
        if not hasattr(config, 'DISCORD_DESACTIVE') or config.DISCORD_DESACTIVE == '1':
            return False
        
        if not content or not webhook_url:
            return False
        
        if not webhook_url.startswith('https://discord.com/api/webhooks/'):
            logger.warning(f"URL do webhook Discord inválida: {webhook_url[:50]}...")
            return False
        
        try:
            current_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            escaped_message = f"{current_date} - {content}"
            
            if len(escaped_message) > 2000:
                escaped_message = escaped_message[:1997] + "..."
            
            payload = {'content': escaped_message}
            
            if HAS_REQUESTS:
                headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                response = requests.post(
                    webhook_url,
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                http_code = response.status_code
                
                if http_code in (200, 204):
                    return True
                else:
                    error_details = ""
                    try:
                        if hasattr(response, 'text') and response.text:
                            error_details = f" - Resposta: {response.text[:200]}"
                    except:
                        pass
                    logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}{error_details}")
                    return False
            else:
                if urllib_request is None:
                    logger.warning("Nenhuma biblioteca HTTP disponível para enviar webhook Discord")
                    return False
                
                import urllib.parse
                data = json.dumps(payload).encode('utf-8')
                headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                req = urllib_request.Request(
                    webhook_url,
                    data=data,
                    headers=headers
                )
                try:
                    with urllib_request.urlopen(req, timeout=10) as response:
                        http_code = response.getcode()
                        if http_code in (200, 204):
                            return True
                        else:
                            logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}")
                            return False
                except urllib_request.HTTPError as e:
                    http_code = e.code
                    error_details = ""
                    try:
                        error_body = e.read().decode('utf-8')
                        if error_body:
                            error_details = f" - Resposta: {error_body[:200]}"
                    except:
                        pass
                    logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}{error_details}")
                    return False
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Erro de requisição ao enviar webhook Discord: {e}")
            return False
        except Exception as e:
            logger.error(f"Erro ao enviar webhook Discord: {e}")
            return False
    
    def _insert_log_custom(self, message: str, level: str, source: str) -> bool:
        """Insere log customizado no SQLite"""
        try:
            conn = sqlite3.connect(self.db_logs_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                VALUES (?, ?, ?, ?)
            """, (message, level, source, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao inserir log customizado: {e}")
            return False
    
    def _insert_player_event(self, player_id: str, event_type: str,
                            coord_x: Optional[float] = None, coord_y: Optional[float] = None,
                            coord_z: Optional[float] = None, details: Optional[str] = None,
                            related_player_id: Optional[str] = None) -> bool:
        """Insere evento na tabela players_events"""
        if not player_id or not event_type:
            return False
        
        max_retries = 5
        base_retry_delay = 0.2
        
        player_id = player_id.replace("'", "''")
        event_type = event_type.replace("'", "''")
        if details:
            details = details.replace("'", "''")
        if related_player_id:
            related_player_id = related_player_id.replace("'", "''")
        
        coord_x_sql = coord_x if coord_x is not None and isinstance(coord_x, (int, float)) else None
        coord_y_sql = coord_y if coord_y is not None and isinstance(coord_y, (int, float)) else None
        coord_z_sql = coord_z if coord_z is not None and isinstance(coord_z, (int, float)) else None
        
        details_sql = f"'{details}'" if details else "NULL"
        related_player_sql = f"'{related_player_id}'" if related_player_id else "NULL"
        
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_players_path, timeout=10.0)
                cursor = conn.cursor()
                
                sql = f"""
                INSERT INTO players_events (PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID)
                VALUES (
                    '{player_id}',
                    '{event_type}',
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
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado ao inserir evento após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite ao inserir evento (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
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
                logger.error(f"Erro inesperado ao inserir evento (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        return False
    
    def _generate_rcon_guid(self, steam_id: str) -> str:
        """Gera RCON GUID a partir do SteamID"""
        if not steam_id or steam_id == "null" or not steam_id.isdigit():
            return ""
        
        try:
            steam_id_int = int(steam_id)
            hex_str = format(steam_id_int, '016x')
            hex_reversed = ''.join(reversed([hex_str[i:i+2] for i in range(0, len(hex_str), 2)]))
            hex_with_prefix = '4245' + hex_reversed
            
            # Converter hex para bytes
            bytes_data = bytes.fromhex(hex_with_prefix)
            
            # Calcular MD5
            md5_hash = hashlib.md5(bytes_data).hexdigest()
            
            return md5_hash
        except Exception as e:
            logger.warning(f"Erro ao gerar RCON GUID para SteamID {steam_id}: {e}")
            return ""
    
    def _fetch_steam_name(self, steam_id: str) -> str:
        """Busca SteamName via Steam Community"""
        if not steam_id or not steam_id.isdigit():
            return "Unknown"
        
        try:
            url = f"https://steamcommunity.com/profiles/{steam_id}"
            
            if HAS_REQUESTS:
                response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
                if response.status_code == 200:
                    html = response.text
                else:
                    return "Unknown"
            else:
                if urllib_request is None:
                    return "Unknown"
                req = urllib_request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib_request.urlopen(req, timeout=10) as response:
                    html = response.read().decode('utf-8')
            
            # Extrair nome do perfil
            match = re.search(r'actual_persona_name">([^<]+)</span>', html)
            if match:
                steam_name = match.group(1)
                # Decodificar entidades HTML
                steam_name = steam_name.replace('&amp;', '&')
                steam_name = steam_name.replace('&lt;', '<')
                steam_name = steam_name.replace('&gt;', '>')
                steam_name = steam_name.replace('&quot;', '"')
                steam_name = steam_name.replace('&#39;', "'")
                # Sanitizar
                steam_name = re.sub(r'[^a-zA-Z0-9_ .\-\[\]()@#+]', ' ', steam_name)
                steam_name = re.sub(r'\s+', ' ', steam_name).strip()
                return steam_name if steam_name else "Unknown"
            else:
                return "Unknown"
                
        except Exception as e:
            logger.warning(f"Erro ao buscar SteamName para SteamID {steam_id}: {e}")
            return "Unknown"
    
    def _sanitize_name(self, name: str) -> str:
        """Sanitiza nome do jogador"""
        if not name:
            return "Unknown"
        # Remover caracteres especiais, manter alfanuméricos, espaços, pontos, underscores, hífens
        name = re.sub(r'[^a-zA-Z0-9_ .\-\[\]()@#+]', ' ', name)
        name = re.sub(r'\s+', ' ', name).strip()
        return name if name else "Unknown"
    
    def _update_player_database(self, player_id: str, player_name: str, steam_id: str, steam_name: str) -> bool:
        """Atualiza ou insere jogador em players_database"""
        if not player_id:
            return False
        
        max_retries = 5
        base_retry_delay = 0.2
        
        player_name = self._sanitize_name(player_name)
        if not player_name or player_name == "Unknown":
            player_name = "Unknown"
        
        rcon_guid = self._generate_rcon_guid(steam_id) if steam_id else ""
        
        # Escapar aspas simples
        player_id_escaped = player_id.replace("'", "''")
        player_name_escaped = player_name.replace("'", "''")
        steam_id_escaped = steam_id.replace("'", "''") if steam_id else ""
        steam_name_escaped = steam_name.replace("'", "''") if steam_name else ""
        rcon_guid_escaped = rcon_guid.replace("'", "''") if rcon_guid else ""
        
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_players_path, timeout=10.0)
                cursor = conn.cursor()
                
                # Verificar se jogador existe
                cursor.execute("SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = ?", (player_id,))
                existing = cursor.fetchone()
                
                if existing is None:
                    # Inserir novo jogador
                    cursor.execute("""
                        INSERT INTO players_database (PlayerID, PlayerName, SteamID, SteamName, RconGuid)
                        VALUES (?, ?, ?, ?, ?)
                    """, (player_id, player_name, steam_id or "", steam_name or "", rcon_guid))
                    logger.info(f"Jogador {player_id} ({player_name}) inserido no banco")
                else:
                    # Atualizar jogador existente
                    old_name, old_steam_id, old_steam_name = existing
                    
                    cursor.execute("""
                        UPDATE players_database
                        SET PlayerName = ?, SteamID = ?, SteamName = ?, RconGuid = ?
                        WHERE PlayerID = ?
                    """, (player_name, steam_id or "", steam_name or "", rcon_guid, player_id))
                    
                    # Verificar se houve mudanças para registrar em players_name_history
                    if (old_name != player_name or old_steam_id != steam_id or old_steam_name != steam_name):
                        cursor.execute("""
                            INSERT INTO players_name_history (PlayerID, PlayerName, SteamID, SteamName, TimeStamp)
                            VALUES (?, ?, ?, ?, ?)
                        """, (player_id, player_name, steam_id or "", steam_name or "", datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                        logger.info(f"Jogador {player_id} alterou dados. Registrado em players_name_history")
                    
                    logger.info(f"Jogador {player_id} ({player_name}) atualizado no banco")
                
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
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado ao atualizar jogador após {max_retries} tentativas")
                        return False
                else:
                    logger.error(f"Erro SQLite ao atualizar jogador (tentativa {attempt}/{max_retries}): {e}")
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
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
                logger.error(f"Erro inesperado ao atualizar jogador (tentativa {attempt}/{max_retries}): {e}")
                if attempt < max_retries:
                    retry_delay = base_retry_delay * (2 ** (attempt - 1))
                    time.sleep(retry_delay)
                    continue
                return False
        
        return False
    
    def _reset_players_online(self) -> bool:
        """Reseta tabela players_online (DELETE FROM players_online)"""
        try:
            conn = sqlite3.connect(self.db_players_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM players_online")
            
            conn.commit()
            conn.close()
            logger.info("Tabela players_online resetada")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao resetar players_online: {e}")
            return False
    
    def handle_action(self, action: str, data: Dict[str, Any], queue_name: str) -> bool:
        """Roteador de ações"""
        try:
            if queue_name == 'events.server':
                if action == 'active_loadout':
                    return self.handle_active_loadout(data)
                elif action == 'update_player':
                    return self.handle_update_player(data)
                elif action == 'restart_server':
                    return self.handle_restart_server(data)
                elif action == 'event_restarting':
                    return self.handle_event_restarting(data)
                elif action == 'event_start_finished':
                    return self.handle_event_start_finished(data)
                elif action == 'event_minutes_to_restart':
                    return self.handle_event_minutes_to_restart(data)
                elif action == 'send_log_discord':
                    return self.handle_send_log_discord(data)
                else:
                    logger.warning(f"Ação desconhecida em events.server: {action}")
                    return False
                    
            elif queue_name == 'events.players':
                if action == 'player_connected':
                    return self.handle_player_connected(data)
                elif action == 'player_disconnected':
                    return self.handle_player_disconnected(data)
                elif action == 'player_respawned':
                    return self.handle_player_respawned(data)
                else:
                    logger.warning(f"Ação desconhecida em events.players: {action}")
                    return False
                    
            elif queue_name == 'events.unknown':
                logger.info(f"Evento desconhecido recebido: {action}")
                self._insert_log_custom(f"Evento desconhecido: {action}", "INFO", "EventsConsumer")
                return True
            else:
                logger.warning(f"Fila desconhecida: {queue_name}")
                return False
                
        except Exception as e:
            logger.error(f"Erro ao processar ação {action}: {e}")
            return False
    
    def handle_update_player(self, data: Dict[str, Any]) -> bool:
        """Handler para update_player"""
        try:
            player_id = data.get('player_id', '').strip()
            player_name = data.get('player_name', '').strip()
            steam_id = data.get('steam_id', '').strip()
            
            if not player_id:
                logger.warning("update_player: player_id ausente")
                return False
            
            if not player_name:
                player_name = "Unknown"
            
            # Buscar SteamName se steam_id fornecido
            steam_name = "Unknown"
            if steam_id and steam_id.isdigit():
                steam_name = self._fetch_steam_name(steam_id)
            
            # Atualizar banco
            if self._update_player_database(player_id, player_name, steam_id, steam_name):
                log_msg = f"Player {player_id} ({player_name}) ({steam_id}) ({steam_name}) atualizado no banco"
                self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
                return True
            else:
                logger.error(f"Falha ao atualizar jogador {player_id}")
                return False
                
        except Exception as e:
            logger.error(f"Erro em handle_update_player: {e}")
            return False
    
    def handle_active_loadout(self, data: Dict[str, Any]) -> bool:
        """Handler para active_loadout"""
        try:
            player_id = data.get('player_id', '').strip()
            loadout_name = data.get('loadout_name', '').strip()
            
            if not player_id or not loadout_name:
                logger.warning("active_loadout: player_id ou loadout_name ausente")
                return False
            
            # Registrar evento
            details_json = json.dumps({'loadout_name': loadout_name})
            self._insert_player_event(player_id, 'loadout_changed', details=details_json)
            
            # Buscar dados do jogador para Discord
            try:
                conn = sqlite3.connect(self.db_players_path, timeout=10.0)
                cursor = conn.cursor()
                cursor.execute("SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = ?", (player_id,))
                player_data = cursor.fetchone()
                conn.close()
                
                if player_data:
                    player_name, steam_id, steam_name = player_data
                    if player_name and steam_id and steam_name:
                        sanitized_steam_name = self._sanitize_discord_markdown(steam_name)
                        content = f"Jogador **{self._sanitize_discord_markdown(player_name)}** ([{sanitized_steam_name}](<https://steamcommunity.com/profiles/{steam_id}>)) ativou um loadout pelo jogo"
                        if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                            self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
            except Exception as e:
                logger.warning(f"Erro ao buscar dados do jogador para Discord: {e}")
            
            log_msg = f"Ativando loadout de {player_id} para {loadout_name}"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_active_loadout: {e}")
            return False
    
    def handle_restart_server(self, data: Dict[str, Any]) -> bool:
        """Handler para restart_server"""
        try:
            minutes = data.get('minutes', '')
            message = data.get('message', '')
            
            log_msg = f"Servidor será reiniciado antes do previsto devido a votação"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                self._send_discord_webhook(log_msg, config.DISCORD_WEBHOOK_LOGS)
            
            # Nota: Não executar restart remotamente
            logger.info(f"restart_server recebido: {minutes} minutos - {message} (não executado remotamente)")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_restart_server: {e}")
            return False
    
    def handle_event_restarting(self, data: Dict[str, Any]) -> bool:
        """Handler para event_restarting"""
        try:
            next_map = data.get('next_map', '')
            
            log_msg = "Evento de restart do servidor!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            content = f"Servidor reiniciando... todos os jogadores foram desconectados!"
            if next_map:
                content = f"Servidor reiniciando... todos os jogadores foram desconectados! (Próximo mapa: {next_map})"
            
            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
            
            # Resetar players_online
            self._reset_players_online()
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_event_restarting: {e}")
            return False
    
    def handle_event_start_finished(self, data: Dict[str, Any]) -> bool:
        """Handler para event_start_finished"""
        try:
            current_map = data.get('current_map', '')
            next_map = data.get('next_map', '')
            current_time = data.get('current_time', '')
            
            log_msg = "Evento de início do servidor!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            #if current_map != "Indefinido":
            #    content = f"✅ Servidor iniciado e liberado para jogadores! Mapa atual: {current_map}, Próximo mapa: {next_map}, Horário: {current_time}"
            #else:
            #    content = f"✅ Servidor iniciado e liberado para jogadores! Horário: {current_time}"            
            content = f"✅ Servidor iniciado e liberado para jogadores! Horário: {current_time}"
                        
            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
            
            # Resetar players_online
            self._reset_players_online()
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_event_start_finished: {e}")
            return False
    
    def handle_event_minutes_to_restart(self, data: Dict[str, Any]) -> bool:
        """Handler para event_minutes_to_restart"""
        try:
            current_map = data.get('current_map', '')
            next_map = data.get('next_map', '')
            current_time = data.get('current_time', '')
            message = data.get('message', '')
            
            log_msg = "Evento de aviso de tempo para reiniciar o servidor!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            if current_map != "Indefinido":
                content = f"Mapa atual: {current_map}, Próximo mapa: {next_map}, Horário: {current_time}"
            else:
                content = f"Horário: {current_time}"
            
            if message:
                content = f"⏱️ {message} {content}"
            
            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                self._send_discord_webhook(content, config.DISCORD_WEBHOOK_LOGS)
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_event_minutes_to_restart: {e}")
            return False
    
    def handle_send_log_discord(self, data: Dict[str, Any]) -> bool:
        """Handler para send_log_discord"""
        try:
            message = data.get('message', '')
            
            if not message:
                logger.warning("send_log_discord: message ausente")
                return False
            
            log_msg = "Evento de envio de mensagem!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                self._send_discord_webhook(message, config.DISCORD_WEBHOOK_LOGS)
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_send_log_discord: {e}")
            return False
    
    def handle_player_connected(self, data: Dict[str, Any]) -> bool:
        """Handler para player_connected"""
        try:
            player_id = data.get('player_id', '').strip()
            
            if not player_id:
                logger.warning("player_connected: player_id ausente")
                return False
            
            log_msg = "Evento de player conectado detectado!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            # Nota: O positions_consumer já processa isso, mas mantemos compatibilidade
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_player_connected: {e}")
            return False
    
    def handle_player_disconnected(self, data: Dict[str, Any]) -> bool:
        """Handler para player_disconnected"""
        try:
            player_id = data.get('player_id', '').strip()
            
            if not player_id:
                logger.warning("player_disconnected: player_id ausente")
                return False
            
            log_msg = "Evento de player desconectado detectado!"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            # Nota: O positions_consumer já processa isso, mas mantemos compatibilidade
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_player_disconnected: {e}")
            return False
    
    def handle_player_respawned(self, data: Dict[str, Any]) -> bool:
        """Handler para player_respawned"""
        try:
            player_id = data.get('player_id', '').strip()
            position = data.get('position', '').strip()
            
            if not player_id:
                logger.warning("player_respawned: player_id ausente")
                return False
            
            coord_x = None
            coord_y = None
            coord_z = None
            
            if position:
                try:
                    # Formato "x,y,z"
                    parts = position.split(',')
                    if len(parts) == 3:
                        coord_x = float(parts[0].strip())
                        coord_y = float(parts[1].strip())
                        coord_z = float(parts[2].strip())
                except (ValueError, IndexError) as e:
                    logger.warning(f"Erro ao parsear posição '{position}': {e}")
            
            # Inserir evento
            current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            details_dict = {'timestamp': current_date}
            if position:
                details_dict['position'] = position
            details_json = json.dumps(details_dict)
            
            self._insert_player_event(player_id, 'player_respawned', 
                                    coord_x=coord_x, coord_y=coord_y, coord_z=coord_z,
                                    details=details_json)
            
            log_msg = f"Evento de player respawnado detectado! PlayerID: {player_id} | Posição: {position}"
            self._insert_log_custom(log_msg, "INFO", "EventsConsumer")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro em handle_player_respawned: {e}")
            return False
    
    def process_batch(self):
        """Processa batch de mensagens"""
        if not self.batch:
            return
        
        try:
            success_count = 0
            fail_count = 0
            
            for item in self.batch:
                queue_name = item['queue']
                data = item['data']
                
                # Extrair action do data
                action = data.get('action', '')
                if not action:
                    logger.warning("Mensagem sem campo 'action'")
                    fail_count += 1
                    continue
                
                if self.handle_action(action, data, queue_name):
                    success_count += 1
                else:
                    fail_count += 1
            
            logger.info(f"Processado batch: {success_count} sucesso, {fail_count} falhas")
            self.batch = []
            self.last_batch_time = time.time()
            
        except Exception as e:
            logger.error(f"Erro ao processar batch: {e}")
            self.batch = []
    
    def callback(self, ch, method, properties, body):
        """Callback para processar mensagens"""
        try:
            payload = json.loads(body.decode('utf-8'))
            queue_name = method.routing_key
            
            # Extrair dados da mensagem
            if isinstance(payload, dict) and 'message' in payload:
                # Se payload tem campo 'message', pode ser JSON string
                message_data = payload.get('message')
                if isinstance(message_data, str):
                    try:
                        data = json.loads(message_data)
                    except json.JSONDecodeError:
                        data = payload
                else:
                    data = message_data if message_data else payload
            else:
                data = payload
            
            # Adicionar ao batch
            self.batch.append({
                'queue': queue_name,
                'data': data,
                'delivery_tag': method.delivery_tag,
                'channel': ch
            })
            
            # Processar batch se atingir tamanho ou timeout
            current_time = time.time()
            if (len(self.batch) >= self.batch_size or 
                (current_time - self.last_batch_time) >= self.batch_timeout):
                self.process_batch()
            
            # Ack individual (após processar)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            
        except json.JSONDecodeError as e:
            logger.error(f"Erro ao decodificar JSON: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            logger.error(f"Erro no callback: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    def start(self):
        """Inicia o consumer"""
        if not self.connect():
            logger.error("Falha ao conectar ao RabbitMQ")
            return False
        
        try:
            # Configurar QoS
            self.channel.basic_qos(prefetch_count=self.batch_size)
            
            # Consumir filas
            for queue_name in ['events.server', 'events.players', 'events.unknown']:
                self.channel.basic_consume(
                    queue=queue_name,
                    on_message_callback=self.callback
                )
            
            logger.info("Aguardando mensagens. Pressione CTRL+C para sair.")
            
            # Processar batch pendente periodicamente
            def process_pending_batch():
                if self.batch and (time.time() - self.last_batch_time) >= self.batch_timeout:
                    self.process_batch()
            
            # Iniciar consumo
            while True:
                self.connection.process_data_events(time_limit=1)
                process_pending_batch()
                
        except KeyboardInterrupt:
            logger.info("Interrompido pelo usuário")
            # Processar batch pendente antes de sair
            if self.batch:
                self.process_batch()
        except Exception as e:
            logger.error(f"Erro no consumer: {e}")
        finally:
            if self.connection and not self.connection.is_closed:
                self.connection.close()
            logger.info("Consumer finalizado")
    
    def stop(self):
        """Para o consumer"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()


def main():
    """Função principal"""
    if not config.RABBITMQ_ENABLED:
        logger.warning("RabbitMQ está desabilitado no config.py")
        return
    
    consumer = EventsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()

