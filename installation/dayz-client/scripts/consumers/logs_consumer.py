#!/usr/bin/env python3
"""
Consumer RabbitMQ para logs
Consome filas logs.custom, logs.err, e logs.adm e grava no SQLite
"""

import pika
import json
import sqlite3
import logging
import sys
import os
import time
import re
from datetime import datetime
from typing import Dict, Any, Optional

# Tentar importar requests, usar urllib como fallback
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    try:
        from urllib import request as urllib_request
        from urllib.parse import urlencode
    except ImportError:
        urllib_request = None
        urlencode = None

# Adicionar diretório admin-interface ao path para importar config
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'admin-interface'))
import config

# Configurar logging para systemd/journalctl
# Usar StreamHandler para garantir que logs vão para stdout/stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Garantir que logs vão para stdout
    ],
    force=True  # Forçar reconfiguração se já foi configurado
)
logger = logging.getLogger(__name__)


class LogsConsumer:
    """Consumer para processar logs do RabbitMQ e gravar no SQLite"""
    
    def __init__(self):
        self.connection = None
        self.channel = None
        self.db_path = config.DB_LOGS
        self.db_players_path = config.DB_PLAYERS
        self.batch_size = 100
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
            for queue_name in ['logs.custom', 'logs.adm', 'logs.err']:
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
    
    def insert_log_custom(self, message: str, level: str, source: str) -> bool:
        """Insere log customizado no SQLite"""
        try:
            conn = sqlite3.connect(self.db_path)
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
    
    def insert_log_adm(self, message: str, level: str) -> bool:
        """Insere log administrativo no SQLite"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
                VALUES (?, ?, ?)
            """, (message, level, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            logger.error(f"Erro ao inserir log administrativo: {e}")
            return False
    
    # ==================== DISCORD INTEGRATION ====================
    
    def _sanitize_discord_markdown(self, text: str) -> str:
        """
        Escapa caracteres especiais do Discord markdown
        Similar à função sanitize_discord_markdown() do config.sh
        """
        if not text:
            return ""
        # Remover quebras de linha
        text = text.replace('\n', '').replace('\r', '')
        # Escapar caracteres especiais: * _ ~ ` | [ ] ( ) < > " \
        text = re.sub(r'([*_~`|\[\]()<>"\\])', r'\\\1', text)
        return text
    
    def _send_discord_webhook(self, content: str, webhook_url: str) -> bool:
        """
        Envia webhook para Discord
        Retorna True se sucesso (HTTP 200/204), False caso contrário
        """
        # Verificar se Discord está desativado
        if not hasattr(config, 'DISCORD_DESACTIVE') or config.DISCORD_DESACTIVE == '1':
            return False
        
        if not content or not webhook_url:
            return False
        
        # Validar URL do webhook
        if not webhook_url.startswith('https://discord.com/api/webhooks/'):
            logger.warning(f"URL do webhook Discord inválida: {webhook_url[:50]}...")
            return False
        
        try:
            # Preparar payload
            current_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            escaped_message = f"{current_date} - {content}"
            
            # Discord tem limite de 2000 caracteres por mensagem
            if len(escaped_message) > 2000:
                escaped_message = escaped_message[:1997] + "..."
            
            payload = {'content': escaped_message}
            
            if HAS_REQUESTS:
                # Usar requests se disponível
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
                    # Logar detalhes do erro
                    error_details = ""
                    try:
                        if hasattr(response, 'text') and response.text:
                            error_details = f" - Resposta: {response.text[:200]}"
                    except:
                        pass
                    logger.warning(f"Falha ao enviar webhook Discord: código HTTP {http_code}{error_details}")
                    return False
            else:
                # Fallback para urllib
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
    
    def _get_player_info(self, player_id: str) -> Optional[Dict[str, str]]:
        """Busca informações do jogador no banco (PlayerName, SteamID, SteamName)"""
        if not player_id or len(player_id) != 44:
            return None
        
        conn = None
        try:
            conn = sqlite3.connect(self.db_players_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT PlayerName, SteamID, SteamName
                FROM players_database
                WHERE PlayerID = ?
            """, (player_id,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                return {
                    'player_name': result[0] or 'Unknown',
                    'steam_id': result[1] or '',
                    'steam_name': result[2] or 'Unknown'
                }
            return None
            
        except sqlite3.OperationalError as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro SQLite ao buscar informações do jogador: {e}")
            return None
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao buscar informações do jogador: {e}")
            return None
    
    def _parse_killed_by_event(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse de eventos 'killed by' (PvP ou ambiente/objeto)"""
        try:
            # Extrair PlayerIDs
            player_ids = re.findall(r'id=([a-zA-Z0-9_\-=]+)', content)
            
            if len(player_ids) < 1:
                logger.warning(f"Evento 'killed by' não contém PlayerID: {content[:100]}")
                return None
            
            player_id_killed = player_ids[0]
            
            # Validar PlayerID do morto (deve ter 44 caracteres)
            if len(player_id_killed) != 44:
                logger.warning(f"PlayerID inválido em evento 'killed by': killed={len(player_id_killed)} caracteres")
                return None
            
            # Verificar se é PvP (2 PlayerIDs) ou morte por ambiente/objeto (1 PlayerID)
            is_pvp = len(player_ids) >= 2
            player_id_killer = None
            pos_killer = ""
            
            if is_pvp:
                # Caso PvP: há 2 PlayerIDs
                player_id_killer = player_ids[1]
                
                # Validar PlayerID do killer
                if len(player_id_killer) != 44:
                    logger.warning(f"PlayerID do killer inválido em evento 'killed by': killer={len(player_id_killer)} caracteres")
                    return None
                
                # Extrair Weapon (após 'with')
                weapon_match = re.search(r'with\s+(\w+)', content)
                weapon = weapon_match.group(1) if weapon_match else "Unknown"
                
                # Extrair Distance (após 'from', converter para inteiro)
                distance_match = re.search(r'from\s+([0-9]+\.?[0-9]*)\s+meters', content)
                distance_meter = 0
                if distance_match:
                    try:
                        distance_float = float(distance_match.group(1))
                        distance_meter = int(distance_float)
                    except ValueError:
                        distance_meter = 0
                
                # Extrair posições (pos=<x,y,z>)
                positions = re.findall(r'pos=<([^>]+)>', content)
                pos_killed = positions[0] if len(positions) > 0 else ""
                pos_killer = positions[1] if len(positions) > 1 else ""
                
                # Normalizar posições (remover espaços após vírgulas)
                if pos_killed:
                    pos_killed = re.sub(r',\s+', ',', pos_killed)
                if pos_killer:
                    pos_killer = re.sub(r',\s+', ',', pos_killer)
                
                return {
                    'player_id_killed': player_id_killed,
                    'player_id_killer': player_id_killer,
                    'weapon': weapon,
                    'distance_meter': distance_meter,
                    'pos_killed': pos_killed,
                    'pos_killer': pos_killer,
                    'is_pvp': True
                }
            else:
                # Caso morte por ambiente/objeto: apenas 1 PlayerID
                # Extrair causa da morte (texto após "killed by")
                cause_match = re.search(r'killed by\s+(.+?)(?:\s+pos=|$)', content)
                cause = cause_match.group(1).strip() if cause_match else "Unknown"
                
                # Extrair posição (pos=<x,y,z>)
                positions = re.findall(r'pos=<([^>]+)>', content)
                pos_killed = positions[0] if len(positions) > 0 else ""
                
                # Normalizar posição
                if pos_killed:
                    pos_killed = re.sub(r',\s+', ',', pos_killed)
                
                return {
                    'player_id_killed': player_id_killed,
                    'player_id_killer': None,
                    'weapon': cause,  # Usar causa como "weapon" para consistência
                    'distance_meter': 0,
                    'pos_killed': pos_killed,
                    'pos_killer': "",
                    'is_pvp': False,
                    'cause': cause
                }
        except Exception as e:
            logger.error(f"Erro ao fazer parse de evento 'killed by': {e}")
            return None
    
    def _parse_hit_by_player_event(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse de eventos 'hit by Player'"""
        try:
            # Extrair PlayerIDs (dois id= na linha)
            player_ids = re.findall(r'id=([a-zA-Z0-9_\-=]+)', content)
            if len(player_ids) < 2:
                logger.warning(f"Evento 'hit by Player' não contém 2 PlayerIDs: {content[:100]}")
                return None
            
            # Primeiro id= é a vítima, segundo é o atacante
            player_id_victim = player_ids[0]
            player_id_attacker = player_ids[1]
            
            # Validar PlayerIDs
            if len(player_id_victim) != 44 or len(player_id_attacker) != 44:
                logger.warning(f"PlayerID inválido em evento 'hit by Player': victim={len(player_id_victim)}, attacker={len(player_id_attacker)}")
                return None
            
            # Extrair HP (de [HP: ...])
            hp_match = re.search(r'\[HP:\s+([0-9.]+)\]', content)
            health = float(hp_match.group(1)) if hp_match else 0.0
            
            # Extrair LocalDamage (após 'into')
            local_damage_match = re.search(r'into\s+([^(]+)', content)
            local_damage = local_damage_match.group(1).strip() if local_damage_match else "Unknown"
            # Remover número entre parênteses se houver
            local_damage = re.sub(r'\([0-9]+\)', '', local_damage).strip()
            
            # Extrair Damage (após 'for')
            damage_match = re.search(r'for\s+([0-9.]+)\s+damage', content)
            damage = float(damage_match.group(1)) if damage_match else 0.0
            
            # Extrair HitType (tipo de dano, ex: Bullet_545x39)
            hit_type_match = re.search(r'damage\s+\(([^)]+)\)', content)
            hit_type = hit_type_match.group(1) if hit_type_match else "Unknown"
            
            # Extrair Weapon (após 'with')
            weapon_match = re.search(r'with\s+([^\s]+)', content)
            weapon = weapon_match.group(1) if weapon_match else "Unknown"
            
            # Extrair Distance (após 'from')
            distance_match = re.search(r'from\s+([0-9.]+)\s+meters', content)
            distance_meter = 0.0
            if distance_match:
                try:
                    distance_meter = float(distance_match.group(1))
                except ValueError:
                    distance_meter = 0.0
            
            # Extrair posições (pos=<x,y,z>)
            positions = re.findall(r'pos=<([^>]+)>', content)
            pos_victim = positions[0] if len(positions) > 0 else ""
            pos_attacker = positions[1] if len(positions) > 1 else ""
            
            # Normalizar posições
            if pos_victim:
                pos_victim = re.sub(r',\s+', ',', pos_victim)
            if pos_attacker:
                pos_attacker = re.sub(r',\s+', ',', pos_attacker)
            
            return {
                'player_id_victim': player_id_victim,
                'player_id_attacker': player_id_attacker,
                'pos_victim': pos_victim,
                'pos_attacker': pos_attacker,
                'local_damage': local_damage,
                'hit_type': hit_type,
                'damage': damage,
                'health': health,
                'weapon': weapon,
                'distance_meter': distance_meter
            }
        except Exception as e:
            logger.error(f"Erro ao fazer parse de evento 'hit by Player': {e}")
            return None
    
    def _parse_death_event(self, content: str, event_type: str) -> Optional[Dict[str, Any]]:
        """Parse de eventos de morte/inconsciência"""
        try:
            # Extrair PlayerID (primeiro id= na linha)
            player_id_match = re.search(r'id=([a-zA-Z0-9_\-=]+)', content)
            if not player_id_match:
                logger.warning(f"Evento '{event_type}' não contém PlayerID: {content[:100]}")
                return None
            
            player_id = player_id_match.group(1)
            
            # Validar PlayerID
            if len(player_id) != 44:
                logger.warning(f"PlayerID inválido em evento '{event_type}': {len(player_id)} caracteres")
                return None
            
            # Extrair coordenadas se disponíveis (pos=<x,y,z>)
            position_match = re.search(r'pos=<([^>]+)>', content)
            coord_x = None
            coord_y = None
            coord_z = None
            
            if position_match:
                position_str = position_match.group(1)
                coords = [c.strip() for c in position_str.split(',')]
                if len(coords) >= 3:
                    try:
                        coord_x = float(coords[0])
                        coord_y = float(coords[1])
                        coord_z = float(coords[2])
                    except (ValueError, IndexError):
                        pass
            
            return {
                'player_id': player_id,
                'coord_x': coord_x,
                'coord_y': coord_y,
                'coord_z': coord_z
            }
        except Exception as e:
            logger.error(f"Erro ao fazer parse de evento '{event_type}': {e}")
            return None
    
    def _parse_chat_event(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse de eventos de chat"""
        try:
            # Extrair PlayerID (usando regex similar a extract_player_id do script bash)
            # Formato: Chat("Survivor"(id=HdhIzjGbaI-1_-Q7p8Y1Xos04N4hk1DCNAn2QtdSYqw=))
            player_id_match = re.search(r'id=([a-zA-Z0-9_\-=]+)', content)
            if not player_id_match:
                logger.warning(f"Evento 'Chat(' não contém PlayerID: {content[:100]}")
                return None
            
            player_id = player_id_match.group(1)
            
            # Validar PlayerID (deve ter 44 caracteres)
            if len(player_id) != 44:
                logger.warning(f"PlayerID inválido em evento 'Chat(': {len(player_id)} caracteres")
                return None
            
            # Extrair mensagem do chat (texto após ': ')
            # Formato: Chat(...): mensagem
            chat_message_match = re.search(r':\s+(.+)$', content)
            chat_message = chat_message_match.group(1).strip() if chat_message_match else ""
            
            if not chat_message:
                logger.warning(f"Evento 'Chat(' não contém mensagem: {content[:100]}")
                return None
            
            # Verificar se é comando (começa com '!')
            is_command = chat_message.startswith('!')
            command = chat_message[1:] if is_command else None
            
            return {
                'player_id': player_id,
                'chat_message': chat_message,
                'is_command': is_command,
                'command': command
            }
        except Exception as e:
            logger.error(f"Erro ao fazer parse de evento 'Chat(': {e}")
            return None
    
    def _insert_killfeed(self, data: Dict[str, Any], timestamp: str) -> bool:
        """Insere registro em players_killfeed"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_players_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO players_killfeed (
                    PlayerIDKiller, PlayerIDKilled, Weapon, DistanceMeter, 
                    Data, PosKiller, PosKilled
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get('player_id_killer'),
                data.get('player_id_killed'),
                data.get('weapon', 'Unknown'),
                data.get('distance_meter', 0),
                timestamp,
                data.get('pos_killer', ''),
                data.get('pos_killed', '')
            ))
            
            conn.commit()
            conn.close()
            return True
            
        except sqlite3.OperationalError as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro SQLite ao inserir killfeed: {e}")
            return False
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao inserir killfeed: {e}")
            return False
    
    def _insert_damage(self, data: Dict[str, Any], timestamp: str) -> bool:
        """Insere registro em players_damage"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_players_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO players_damage (
                    PlayerIDAttacker, PlayerIDVictim, PosAttacker, PosVictim,
                    LocalDamage, HitType, Damage, Health, Data, Weapon, DistanceMeter
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.get('player_id_attacker'),
                data.get('player_id_victim'),
                data.get('pos_attacker', ''),
                data.get('pos_victim', ''),
                data.get('local_damage', 'Unknown'),
                data.get('hit_type', 'Unknown'),
                data.get('damage', 0.0),
                data.get('health', 0.0),
                timestamp,
                data.get('weapon', 'Unknown'),
                data.get('distance_meter', 0.0)
            ))
            
            conn.commit()
            conn.close()
            return True
            
        except sqlite3.OperationalError as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro SQLite ao inserir damage: {e}")
            return False
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao inserir damage: {e}")
            return False
    
    def _insert_player_event_from_log(self, player_id: str, event_type: str, 
                                      coord_x: Optional[float] = None,
                                      coord_y: Optional[float] = None,
                                      coord_z: Optional[float] = None,
                                      details: Optional[str] = None,
                                      related_player_id: Optional[str] = None) -> bool:
        """Wrapper para inserir eventos em players_events"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_players_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO players_events (
                    PlayerID, EventType, CoordX, CoordY, CoordZ, Details, RelatedPlayerID
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                player_id,
                event_type,
                coord_x,
                coord_y,
                coord_z,
                details,
                related_player_id
            ))
            
            conn.commit()
            conn.close()
            return True
            
        except sqlite3.OperationalError as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro SQLite ao inserir evento de jogador: {e}")
            return False
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro inesperado ao inserir evento de jogador: {e}")
            return False
    
    def process_batch(self):
        """Processa batch de mensagens"""
        if not self.batch:
            return
        
        max_retries = 5
        base_retry_delay = 0.2
        conn = None
        cursor = None
        
        for attempt in range(1, max_retries + 1):
            try:
                conn = sqlite3.connect(self.db_path, timeout=10.0)
                cursor = conn.cursor()
                break
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e).lower():
                    if attempt < max_retries:
                        retry_delay = base_retry_delay * (2 ** (attempt - 1))
                        logger.warning(f"Banco bloqueado, tentando novamente em {retry_delay}s (tentativa {attempt}/{max_retries})")
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Banco bloqueado após {max_retries} tentativas")
                        self.batch = []
                        return
                else:
                    raise
        
        if conn is None or cursor is None:
            logger.error("Falha ao conectar ao banco de dados")
            self.batch = []
            return
        
        try:
            
            for item in self.batch:
                queue_name = item['queue']
                data = item['data']
                
                # Garantir que data é um dict
                if not isinstance(data, dict):
                    logger.warning(f"Dados não são dict na fila {queue_name}: {type(data)}, convertendo...")
                    if isinstance(data, str):
                        try:
                            data = json.loads(data)
                        except json.JSONDecodeError:
                            data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
                    else:
                        data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
                
                if queue_name == 'logs.custom':
                    # Extrair campos do dict
                    raw_message = data.get('message', '')
                    raw_level = data.get('level', 'INFO')
                    raw_source = data.get('source', 'Script')
                    
                    # Verificar se message é uma string JSON (caso de double encoding)
                    if isinstance(raw_message, str) and raw_message.strip().startswith('{'):
                        try:
                            parsed_message = json.loads(raw_message)
                            # Se parseou com sucesso e tem os campos esperados, usar eles
                            if isinstance(parsed_message, dict):
                                message = str(parsed_message.get('message', raw_message))
                                level = str(parsed_message.get('level', raw_level)) if 'level' in parsed_message else str(raw_level)
                                source = str(parsed_message.get('source', raw_source)) if 'source' in parsed_message else str(raw_source)
                                logger.debug(f"Detectado JSON aninhado em logs.custom, extraído: message={message[:50]}...")
                            else:
                                message = str(raw_message)
                                level = str(raw_level) if raw_level is not None else 'INFO'
                                source = str(raw_source) if raw_source is not None else 'Script'
                        except json.JSONDecodeError:
                            # Não é JSON válido, usar como está
                            message = str(raw_message)
                            level = str(raw_level) if raw_level is not None else 'INFO'
                            source = str(raw_source) if raw_source is not None else 'Script'
                    else:
                        # Campo message não é JSON, usar diretamente
                        message = str(raw_message) if raw_message is not None else ''
                        level = str(raw_level) if raw_level is not None else 'INFO'
                        source = str(raw_source) if raw_source is not None else 'Script'
                    
                    cursor.execute("""
                        INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                        VALUES (?, ?, ?, ?)
                    """, (message, level, source, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

                if queue_name == 'logs.err':
                    # 1. Extrair os campos do primeiro nível
                    raw_message = data.get('message', '')
                    
                    # Valores padrão caso o parse falhe
                    message = str(raw_message)
                    level = 'ERROR'  # Como a fila é logs.err, fixamos o padrão como ERROR
                    source = 'dayz-server.err'
                    
                    # 2. Tentar decodificar o JSON aninhado (o conteúdo da chave 'message')
                    if isinstance(raw_message, str) and raw_message.strip().startswith('{'):
                        try:
                            parsed_message = json.loads(raw_message)
                            
                            if isinstance(parsed_message, dict):
                                # Mapeamento específico para logs do DayZ
                                # 'line' vira a mensagem principal
                                message = str(parsed_message.get('line', raw_message))
                                
                                # 'log_file' vira a fonte (source)
                                source = str(parsed_message.get('log_file', 'dayz-server.err'))
                                
                                # 'log_type' pode definir o level (se vier 'err' vira 'ERROR')
                                log_type = parsed_message.get('log_type', 'ERROR').upper()
                                level = 'ERROR' if log_type == 'ERR' else log_type
                                
                                logger.debug(f"JSON de erro DayZ processado: {message[:50]}...")
                        
                        except json.JSONDecodeError:
                            logger.warning("Falha ao decodificar JSON aninhado em logs.err, usando raw_message")

                    # 3. Inserir no banco de dados
                    # Usando o timestamp vindo do RabbitMQ (se disponível) ou o atual
                    ts_string = data.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

                    cursor.execute("""
                        INSERT INTO logs_custom (Message, LogLevel, Source, TimeStamp)
                        VALUES (?, ?, ?, ?)
                    """, (message, level, source, ts_string))
                    
                elif queue_name == 'logs.adm':
                    # Formato logs.adm: {"log_type": "adm", "log_file": "...", "line": "...", "content": "...", "timestamp": "..."}
                    # Verificar se tem o formato novo (com log_type, line, content) ou formato antigo (com message, level)
                    message = ''
                    level = 'INFO'
                    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    
                    # Inicializar variáveis para evitar UnboundLocalError
                    raw_line = None
                    raw_content = None
                    
                    if 'log_type' in data or 'line' in data or 'content' in data:
                        # Formato novo: usar 'line' como mensagem principal, ou 'content' como fallback
                        raw_line = data.get('line')
                        raw_content = data.get('content')
                        
                        # Prioridade 1: usar campo 'line' se existir e não for vazio
                        if raw_line and isinstance(raw_line, str) and raw_line.strip():
                            # Verificar se line é uma string JSON (caso de double encoding)
                            if raw_line.strip().startswith('{'):
                                try:
                                    parsed_line = json.loads(raw_line)
                                    if isinstance(parsed_line, dict):
                                        # Se line é um JSON, tentar extrair message ou line dele
                                        message = str(parsed_line.get('message', parsed_line.get('line', raw_line)))
                                        logger.debug(f"Detectado JSON aninhado em logs.adm line, extraído: message={message[:50]}...")
                                    else:
                                        message = str(raw_line)
                                except json.JSONDecodeError:
                                    message = str(raw_line)
                            else:
                                message = str(raw_line)
                        # Prioridade 2: usar campo 'content' se line não existir
                        elif raw_content and isinstance(raw_content, str) and raw_content.strip():
                            # Verificar se content é uma string JSON (caso de double encoding)
                            if raw_content.strip().startswith('{'):
                                try:
                                    parsed_content = json.loads(raw_content)
                                    if isinstance(parsed_content, dict):
                                        message = str(parsed_content.get('message', parsed_content.get('content', raw_content)))
                                        logger.debug(f"Detectado JSON aninhado em logs.adm content, extraído: message={message[:50]}...")
                                    else:
                                        message = str(raw_content)
                                except json.JSONDecodeError:
                                    message = str(raw_content)
                            else:
                                message = str(raw_content)
                        # Prioridade 3: fallback para campo 'message' se existir
                        elif 'message' in data:
                            raw_message = data.get('message', '')
                            if raw_message and isinstance(raw_message, str) and raw_message.strip():
                                message = str(raw_message)
                        
                        # Level padrão para logs.adm (não há campo level no formato novo)
                        level = str(data.get('level', 'INFO')) if 'level' in data else 'INFO'
                        
                        # Usar timestamp do payload se disponível, senão usar timestamp atual
                        payload_timestamp = data.get('timestamp', '')
                        if payload_timestamp:
                            try:
                                # Validar formato do timestamp
                                datetime.strptime(payload_timestamp, '%Y-%m-%d %H:%M:%S')
                                timestamp = payload_timestamp
                            except (ValueError, TypeError):
                                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    else:
                        # Formato antigo: usar message e level diretamente
                        raw_message = data.get('message', '')
                        raw_level = data.get('level', 'INFO')
                        
                        # Verificar se message é uma string JSON (caso de double encoding)
                        if isinstance(raw_message, str) and raw_message.strip().startswith('{'):
                            try:
                                parsed_message = json.loads(raw_message)
                                if isinstance(parsed_message, dict):
                                    message = str(parsed_message.get('message', raw_message))
                                    level = str(parsed_message.get('level', raw_level)) if 'level' in parsed_message else str(raw_level)
                                    logger.debug(f"Detectado JSON aninhado em logs.adm (formato antigo), extraído: message={message[:50]}...")
                                else:
                                    message = str(raw_message)
                                    level = str(raw_level) if raw_level is not None else 'INFO'
                            except json.JSONDecodeError:
                                message = str(raw_message)
                                level = str(raw_level) if raw_level is not None else 'INFO'
                        else:
                            message = str(raw_message) if raw_message is not None else ''
                            level = str(raw_level) if raw_level is not None else 'INFO'
                    
                    # Validação final: garantir que nunca inserimos JSON completo como mensagem
                    if not message or (isinstance(message, str) and message.strip().startswith('{') and 'log_type' in message):
                        logger.warning(f"Tentativa de inserir JSON completo como mensagem em logs.adm, extraindo campos...")
                        # Tentar fazer parse do JSON se for um JSON completo
                        try:
                            if isinstance(message, str) and message.strip().startswith('{'):
                                parsed_json = json.loads(message)
                                if isinstance(parsed_json, dict):
                                    message = str(parsed_json.get('line', parsed_json.get('content', parsed_json.get('message', ''))))
                                    if not message:
                                        logger.error(f"Não foi possível extrair mensagem do JSON: {parsed_json}")
                                        message = 'Mensagem inválida'
                        except json.JSONDecodeError:
                            pass
                    
                    # Garantir que message não está vazia
                    if not message or not message.strip():
                        logger.warning(f"Mensagem vazia em logs.adm, usando fallback")
                        message = 'Mensagem não disponível'
                    
                    cursor.execute("""
                        INSERT INTO logs_adm (Message, LogLevel, TimeStamp)
                        VALUES (?, ?, ?)
                    """, (message, level, timestamp))
                    
                    # Processar eventos específicos no content
                    content_to_process = data.get('content', '')
                    if not content_to_process and raw_content:
                        content_to_process = raw_content
                    if not content_to_process and raw_line:
                        content_to_process = raw_line
                    # Fallback: usar message se content_to_process ainda estiver vazio
                    if not content_to_process and message:
                        content_to_process = message
                    
                    if content_to_process and isinstance(content_to_process, str):
                        # Ignorar processamento de eventos para linhas com [HP: 0]
                        should_process_events = '[HP: 0]' not in content_to_process
                        
                        # Processar evento "killed by"
                        if should_process_events and 'killed by' in content_to_process:
                            killfeed_data = self._parse_killed_by_event(content_to_process)
                            if killfeed_data:
                                player_id_killer = killfeed_data.get('player_id_killer')
                                is_pvp = killfeed_data.get('is_pvp', False) and player_id_killer is not None
                                
                                # Extrair coordenadas do jogador morto
                                pos_killed = killfeed_data.get('pos_killed', '')
                                coord_x_killed = None
                                coord_y_killed = None
                                coord_z_killed = None
                                if pos_killed:
                                    coords = [c.strip() for c in pos_killed.split(',')]
                                    if len(coords) >= 3:
                                        try:
                                            coord_x_killed = float(coords[0])
                                            coord_y_killed = float(coords[1])
                                            coord_z_killed = float(coords[2])
                                        except (ValueError, IndexError):
                                            pass
                                
                                if is_pvp:
                                    # Caso PvP: inserir killfeed e eventos para ambos os jogadores
                                    if self._insert_killfeed(killfeed_data, timestamp):
                                        logger.debug(f"Killfeed inserido: {player_id_killer} -> {killfeed_data.get('player_id_killed')}")
                                        
                                        # Registrar evento em players_events para ambos os jogadores
                                        details_json = json.dumps({
                                            'weapon': killfeed_data.get('weapon'),
                                            'distance': killfeed_data.get('distance_meter'),
                                            'pos_killer': killfeed_data.get('pos_killer'),
                                            'pos_killed': killfeed_data.get('pos_killed')
                                        })
                                        
                                        # Evento para o jogador morto
                                        self._insert_player_event_from_log(
                                            killfeed_data.get('player_id_killed'),
                                            'player_killed',
                                            coord_x_killed,
                                            coord_y_killed,
                                            coord_z_killed,
                                            details_json,
                                            player_id_killer
                                        )
                                        
                                        # Evento para o jogador que matou
                                        pos_killer = killfeed_data.get('pos_killer', '')
                                        coord_x_killer = None
                                        coord_y_killer = None
                                        coord_z_killer = None
                                        if pos_killer:
                                            coords = [c.strip() for c in pos_killer.split(',')]
                                            if len(coords) >= 3:
                                                try:
                                                    coord_x_killer = float(coords[0])
                                                    coord_y_killer = float(coords[1])
                                                    coord_z_killer = float(coords[2])
                                                except (ValueError, IndexError):
                                                    pass
                                        
                                        self._insert_player_event_from_log(
                                            player_id_killer,
                                            'player_kill',
                                            coord_x_killer,
                                            coord_y_killer,
                                            coord_z_killer,
                                            details_json,
                                            killfeed_data.get('player_id_killed')
                                        )
                                        
                                        # Enviar para Discord
                                        player_killer_info = self._get_player_info(player_id_killer)
                                        player_victim_info = self._get_player_info(killfeed_data.get('player_id_killed'))
                                        
                                        if player_killer_info and player_victim_info:
                                            # Formatar mensagem no padrão do script antigo
                                            weapon = killfeed_data.get('weapon', 'Unknown')
                                            distance_meter = killfeed_data.get('distance_meter', 0)
                                            metros = int(distance_meter) if distance_meter else 0
                                            
                                            # Formatar PlayerKillerInfo
                                            player_killer_name = self._sanitize_discord_markdown(player_killer_info.get('player_name', 'Unknown'))
                                            killer_steam_name = self._sanitize_discord_markdown(player_killer_info.get('steam_name', 'Unknown'))
                                            killer_steam_id = player_killer_info.get('steam_id', '')
                                            
                                            player_killer_info_formatted = f"**{player_killer_name}**"
                                            if killer_steam_id:
                                                player_killer_info_formatted += f" ([{killer_steam_name}](<https://steamcommunity.com/profiles/{killer_steam_id}>))"
                                            
                                            # Formatar PlayerVictimInfo
                                            player_victim_name = self._sanitize_discord_markdown(player_victim_info.get('player_name', 'Unknown'))
                                            victim_steam_name = self._sanitize_discord_markdown(player_victim_info.get('steam_name', 'Unknown'))
                                            victim_steam_id = player_victim_info.get('steam_id', '')
                                            
                                            player_victim_info_formatted = f"**{player_victim_name}**"
                                            if victim_steam_id:
                                                player_victim_info_formatted += f" ([{victim_steam_name}](<https://steamcommunity.com/profiles/{victim_steam_id}>))"
                                            
                                            # Mensagem final no formato do script antigo
                                            discord_content = f"💀 Jogador {player_victim_info_formatted} foi executado por {player_killer_info_formatted}. Arma: {weapon}, distância: {metros} metros"
                                            
                                            # Enviar para Discord
                                            if hasattr(config, 'DISCORD_WEBHOOK_LOGS') and config.DISCORD_WEBHOOK_LOGS:
                                                if self._send_discord_webhook(discord_content, config.DISCORD_WEBHOOK_LOGS):
                                                    logger.debug(f"Mensagem de killfeed enviada para Discord: {player_killer_info.get('player_name')} -> {player_victim_info.get('player_name')}")
                                                else:
                                                    logger.warning(f"Falha ao enviar mensagem de killfeed para Discord")
                                        else:
                                            if not player_killer_info:
                                                logger.warning(f"PlayerIdKiller não encontrado no banco de dados: {player_id_killer}")
                                            if not player_victim_info:
                                                logger.warning(f"PlayerIdKilled não encontrado no banco de dados: {killfeed_data.get('player_id_killed')}")
                                else:
                                    # Caso morte por ambiente/objeto: apenas registrar evento em players_events
                                    cause = killfeed_data.get('cause', killfeed_data.get('weapon', 'Unknown'))
                                    details_json = json.dumps({
                                        'cause': cause,
                                        'weapon': killfeed_data.get('weapon', 'Unknown'),
                                        'pos_killed': killfeed_data.get('pos_killed', ''),
                                        'death_message': content_to_process
                                    })
                                    
                                    self._insert_player_event_from_log(
                                        killfeed_data.get('player_id_killed'),
                                        'player_death',
                                        coord_x_killed,
                                        coord_y_killed,
                                        coord_z_killed,
                                        details_json
                                    )
                                    logger.debug(f"Evento de morte por ambiente registrado: player_id={killfeed_data.get('player_id_killed')}, cause={cause}")
                        
                        # Processar evento "hit by Player"
                        elif should_process_events and 'hit by Player' in content_to_process:
                            damage_data = self._parse_hit_by_player_event(content_to_process)
                            if damage_data:
                                if self._insert_damage(damage_data, timestamp):
                                    logger.debug(f"Damage inserido: {damage_data.get('player_id_attacker')} -> {damage_data.get('player_id_victim')}")
                                    
                                    # Registrar eventos em players_events
                                    details_victim_json = json.dumps({
                                        'local_damage': damage_data.get('local_damage'),
                                        'hit_type': damage_data.get('hit_type'),
                                        'damage': damage_data.get('damage'),
                                        'health': damage_data.get('health'),
                                        'weapon': damage_data.get('weapon'),
                                        'distance': damage_data.get('distance_meter'),
                                        'attacker_pos': damage_data.get('pos_attacker')
                                    })
                                    
                                    details_attacker_json = json.dumps({
                                        'local_damage': damage_data.get('local_damage'),
                                        'hit_type': damage_data.get('hit_type'),
                                        'damage': damage_data.get('damage'),
                                        'victim_health': damage_data.get('health'),
                                        'weapon': damage_data.get('weapon'),
                                        'distance': damage_data.get('distance_meter'),
                                        'victim_pos': damage_data.get('pos_victim')
                                    })
                                    
                                    # Evento para a vítima
                                    pos_victim = damage_data.get('pos_victim', '')
                                    coord_x_victim = None
                                    coord_y_victim = None
                                    coord_z_victim = None
                                    if pos_victim:
                                        coords = [c.strip() for c in pos_victim.split(',')]
                                        if len(coords) >= 3:
                                            try:
                                                coord_x_victim = float(coords[0])
                                                coord_y_victim = float(coords[1])
                                                coord_z_victim = float(coords[2])
                                            except (ValueError, IndexError):
                                                pass
                                    
                                    self._insert_player_event_from_log(
                                        damage_data.get('player_id_victim'),
                                        'damage_taken',
                                        coord_x_victim,
                                        coord_y_victim,
                                        coord_z_victim,
                                        details_victim_json,
                                        damage_data.get('player_id_attacker')
                                    )
                                    
                                    # Evento para o atacante
                                    pos_attacker = damage_data.get('pos_attacker', '')
                                    coord_x_attacker = None
                                    coord_y_attacker = None
                                    coord_z_attacker = None
                                    if pos_attacker:
                                        coords = [c.strip() for c in pos_attacker.split(',')]
                                        if len(coords) >= 3:
                                            try:
                                                coord_x_attacker = float(coords[0])
                                                coord_y_attacker = float(coords[1])
                                                coord_z_attacker = float(coords[2])
                                            except (ValueError, IndexError):
                                                pass
                                    
                                    self._insert_player_event_from_log(
                                        damage_data.get('player_id_attacker'),
                                        'damage_dealt',
                                        coord_x_attacker,
                                        coord_y_attacker,
                                        coord_z_attacker,
                                        details_attacker_json,
                                        damage_data.get('player_id_victim')
                                    )
                        
                        # Processar eventos de morte/inconsciência
                        elif should_process_events and 'is unconscious' in content_to_process:
                            death_data = self._parse_death_event(content_to_process, 'player_unconscious')
                            if death_data:
                                details_json = json.dumps({'unconscious_message': content_to_process})
                                self._insert_player_event_from_log(
                                    death_data.get('player_id'),
                                    'player_unconscious',
                                    death_data.get('coord_x'),
                                    death_data.get('coord_y'),
                                    death_data.get('coord_z'),
                                    details_json
                                )
                        
                        elif should_process_events and 'bled out' in content_to_process:
                            death_data = self._parse_death_event(content_to_process, 'player_death')
                            if death_data:
                                details_json = json.dumps({'cause': 'bled_out', 'death_message': content_to_process})
                                self._insert_player_event_from_log(
                                    death_data.get('player_id'),
                                    'player_death',
                                    death_data.get('coord_x'),
                                    death_data.get('coord_y'),
                                    death_data.get('coord_z'),
                                    details_json
                                )
                        
                        elif should_process_events and 'died. Stats' in content_to_process:
                            death_data = self._parse_death_event(content_to_process, 'player_death')
                            if death_data:
                                details_json = json.dumps({'cause': 'environment', 'death_message': content_to_process})
                                self._insert_player_event_from_log(
                                    death_data.get('player_id'),
                                    'player_death',
                                    death_data.get('coord_x'),
                                    death_data.get('coord_y'),
                                    death_data.get('coord_z'),
                                    details_json
                                )
                        
                        # Processar evento "Chat("
                        elif should_process_events and 'Chat(' in content_to_process:
                            chat_data = self._parse_chat_event(content_to_process)
                            if chat_data:
                                # Determinar EventType baseado se é comando ou mensagem normal
                                event_type = 'chat_command' if chat_data.get('is_command') else 'chat_message'
                                
                                # Criar JSON com detalhes
                                details_dict = {
                                    'chat_message': chat_data.get('chat_message'),
                                    'is_command': chat_data.get('is_command')
                                }
                                if chat_data.get('command'):
                                    details_dict['command'] = chat_data.get('command')
                                
                                details_json = json.dumps(details_dict)
                                
                                # Registrar evento em players_events
                                self._insert_player_event_from_log(
                                    chat_data.get('player_id'),
                                    event_type,
                                    None,  # coord_x
                                    None,  # coord_y
                                    None,  # coord_z
                                    details_json
                                )
                                logger.debug(f"Evento de chat registrado: player_id={chat_data.get('player_id')}, type={event_type}, message={chat_data.get('chat_message')[:50]}")
            
            conn.commit()
            conn.close()
            
            logger.info(f"Processado batch de {len(self.batch)} mensagens")
            self.batch = []
            self.last_batch_time = time.time()
            
        except sqlite3.OperationalError as e:
            error_msg = str(e)
            if "database is locked" in error_msg.lower():
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.warning(f"Banco bloqueado durante processamento do batch, tentando novamente...")
                # Não limpar batch, deixar para retry
                return
            else:
                if conn:
                    try:
                        conn.rollback()
                        conn.close()
                    except:
                        pass
                logger.error(f"Erro SQLite ao processar batch: {e}")
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                self.batch = []
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
            logger.error(f"Erro ao processar batch: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Não fazer ack das mensagens em caso de erro (retry)
            self.batch = []
    
    def callback(self, ch, method, properties, body):
        """Callback para processar mensagens"""
        try:
            # Parse do JSON
            payload = json.loads(body.decode('utf-8'))
            queue_name = method.routing_key
            
            # Extrair dados da mensagem
            # O payload já vem no formato: {"message": "...", "level": "...", "source": "..."}
            if isinstance(payload, dict):
                # Se o payload é um dict, usar diretamente
                data = payload
            elif isinstance(payload, str):
                # Se for string, tentar fazer parse novamente (caso de double encoding)
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    # Se não conseguir fazer parse, tratar como mensagem simples
                    data = {'message': payload, 'level': 'INFO', 'source': 'Unknown'}
            else:
                # Formato desconhecido, criar estrutura padrão
                data = {'message': str(payload), 'level': 'INFO', 'source': 'Unknown'}
            
            # Validar que data é um dict antes de adicionar ao batch
            if not isinstance(data, dict):
                logger.warning(f"Formato de dados inválido para fila {queue_name}: {type(data)}")
                data = {'message': str(data), 'level': 'INFO', 'source': 'Unknown'}
            
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
            logger.error(f"Erro ao decodificar JSON: {e}, body: {body.decode('utf-8')[:200]}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            logger.error(f"Erro no callback: {e}, body: {body.decode('utf-8')[:200] if body else 'None'}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
    
    def start(self):
        """Inicia o consumer"""
        if not self.connect():
            logger.error("Falha ao conectar ao RabbitMQ")
            return False
        
        try:
            # Configurar QoS (prefetch)
            self.channel.basic_qos(prefetch_count=self.batch_size)
            
            # Consumir filas
            for queue_name in ['logs.custom', 'logs.adm', 'logs.err']:
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
    
    consumer = LogsConsumer()
    consumer.start()


if __name__ == '__main__':
    main()

