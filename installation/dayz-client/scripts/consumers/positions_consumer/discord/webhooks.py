"""
Integração com Discord - Webhooks e mensagens
"""

import json
import sqlite3
import logging
import re
import time
import sys
import os
from datetime import datetime
from typing import Optional

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
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), 'admin-interface'))
import config

# Importar utilitários SQLite
from ..database.sqlite_utils import configure_sqlite_pragmas

logger = logging.getLogger(__name__)


def sanitize_discord_markdown(text: str) -> str:
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


def send_discord_webhook(content: str, webhook_url: str) -> bool:
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


def insert_player_event(
    player_id: str,
    event_type: str,
    coord_x: Optional[float] = None,
    coord_y: Optional[float] = None,
    coord_z: Optional[float] = None,
    details: Optional[str] = None,
    related_player_id: Optional[str] = None
) -> bool:
    """
    Insere evento na tabela players_events
    Retorna True se sucesso, False caso contrário
    """
    if not player_id or not event_type:
        return False
    
    max_retries = 5
    base_retry_delay = 0.2
    
    # Escapar aspas simples em strings
    player_id = player_id.replace("'", "''")
    event_type = event_type.replace("'", "''")
    if details:
        details = details.replace("'", "''")
    if related_player_id:
        related_player_id = related_player_id.replace("'", "''")
    
    # Validar coordenadas (devem ser numéricas ou None)
    coord_x_sql = coord_x if coord_x is not None and isinstance(coord_x, (int, float)) else None
    coord_y_sql = coord_y if coord_y is not None and isinstance(coord_y, (int, float)) else None
    coord_z_sql = coord_z if coord_z is not None and isinstance(coord_z, (int, float)) else None
    
    # Preparar SQL para Details e RelatedPlayerID
    details_sql = f"'{details}'" if details else "NULL"
    related_player_sql = f"'{related_player_id}'" if related_player_id else "NULL"
    
    conn = None
    for attempt in range(1, max_retries + 1):
        try:
            conn = sqlite3.connect(config.DB_PLAYERS, timeout=10.0)
            cursor = conn.cursor()
            
            # Configurar PRAGMAs
            configure_sqlite_pragmas(cursor)
            
            # Construir SQL
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


def update_discord_players_online_message() -> bool:
    """
    Atualiza mensagem Discord com lista de jogadores online
    Retorna True se sucesso, False caso contrário
    """
    # Verificar se Discord está desativado ou configurações não disponíveis
    if not hasattr(config, 'DISCORD_DESACTIVE') or config.DISCORD_DESACTIVE == '1':
        return False
    
    if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID:
        return False
    
    if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID:
        return False
    
    if not hasattr(config, 'DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN') or not config.DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN:
        return False
    
    try:
        # Buscar lista de jogadores online
        conn = sqlite3.connect(config.DB_PLAYERS, timeout=10.0)
        cursor = conn.cursor()
        
        # Contar jogadores online
        cursor.execute("SELECT COUNT(*) FROM players_online")
        num_registros = cursor.fetchone()[0]
        
        # Buscar jogadores online com dados do players_database
        cursor.execute("""
            SELECT 
                p.PlayerID,
                p.PlayerName,
                p.SteamID,
                p.SteamName,
                o.DataConnect
            FROM 
                players_online o
            INNER JOIN 
                players_database p
            ON 
                o.PlayerID = p.PlayerID
            ORDER BY 
                o.DataConnect ASC
        """)
        
        players_data = cursor.fetchall()
        conn.close()
        
        # Formatar data atual
        current_date = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        
        # Construir mensagem
        content = f"**({num_registros}/60) Usuários online (atualizado em {current_date})**\n\n"
        
        if num_registros == 0:
            # Apenas atualizar contagem
            pass
        else:
            # Adicionar lista de jogadores
            for player_id, player_name, steam_id, steam_name, data_connect in players_data:
                # Extrair hora de DataConnect
                try:
                    if data_connect:
                        # DataConnect está no formato "YYYY-MM-DD HH:MM:SS"
                        hora = data_connect.split(' ')[1] if ' ' in data_connect else ''
                    else:
                        hora = ''
                except:
                    hora = ''
                
                # Formatar link Steam
                link_steam = "**NaoIdentificado**"
                if steam_id and steam_name:
                    sanitized_steam_name = sanitize_discord_markdown(steam_name)
                    link_steam = f"[{sanitized_steam_name}](<https://steamcommunity.com/profiles/{steam_id}>)"
                
                # Formatar nome do jogador
                sanitized_player_name = sanitize_discord_markdown(player_name or "NaoIdentificado")
                player_info = f"🟢 **{sanitized_player_name}** ({link_steam}) - {hora}"
                #content += f"{player_info} \n"
        
        # Atualizar mensagem Discord usando PATCH
        channel_id = config.DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID
        message_id = config.DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID
        bot_token = config.DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN
        
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}"
        headers = {
            "Authorization": f"Bot {bot_token}",
            "Content-Type": "application/json",
            "User-Agent": "DiscordBot (https://github.com/discord/discord-api-docs, 1.0)"
        }
        payload = {"content": content}
        
        if HAS_REQUESTS:
            response = requests.patch(url, json=payload, headers=headers, timeout=10)
            http_code = response.status_code
            if http_code == 200:
                return True
            elif "Maximum number of edits" in response.text:
                # Retry após 5 segundos
                time.sleep(5)
                response = requests.patch(url, json=payload, headers=headers, timeout=10)
                http_code = response.status_code
                return http_code == 200
            else:
                logger.warning(f"Falha ao atualizar mensagem Discord: código HTTP {http_code}")
                return False
        else:
            # Fallback para urllib
            if urllib_request is None:
                logger.warning("Nenhuma biblioteca HTTP disponível para atualizar mensagem Discord")
                return False
            
            import urllib.parse
            data = json.dumps(payload).encode('utf-8')
            req = urllib_request.Request(url, data=data, headers=headers, method='PATCH')
            try:
                with urllib_request.urlopen(req, timeout=10) as response:
                    http_code = response.getcode()
                    if http_code == 200:
                        return True
                    else:
                        logger.warning(f"Falha ao atualizar mensagem Discord: código HTTP {http_code}")
                        return False
            except urllib_request.HTTPError as e:
                if "Maximum number of edits" in str(e):
                    time.sleep(5)
                    try:
                        with urllib_request.urlopen(req, timeout=10) as response:
                            return response.getcode() == 200
                    except:
                        return False
                return False
                
    except Exception as e:
        logger.error(f"Erro ao atualizar mensagem Discord: {e}")
        return False

