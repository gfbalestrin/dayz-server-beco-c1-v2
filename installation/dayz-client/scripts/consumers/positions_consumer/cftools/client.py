"""
Cliente para a API CFTools Cloud Data
Implementação baseada no shell script cftools.sh
"""

import os
import json
import time
import hashlib
import logging
import sqlite3
import socket
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)


class CFToolsClient:
    """
    Cliente para interagir com a API CFTools Cloud.
    Implementa autenticação, cache de token e consulta de dados de jogadores.
    """

    def __init__(
        self,
        base_url: str,
        app_id: str,
        app_secret: str,
        server_api_id: str,
        game_id: str = '1',
        server_ip: str = '',
        server_port: str = '',
        token_cache_file: str = '/tmp/cftools_token.json',
        db_path: str = None
    ):
        self.base_url = base_url.rstrip('/')
        self.app_id = app_id
        self.app_secret = app_secret
        self.server_api_id = server_api_id
        self.game_id = game_id
        self.server_ip = server_ip
        self.server_port = server_port
        self.token_cache_file = token_cache_file
        self.db_path = db_path
        self._token: Optional[str] = None
        self._token_created_at: Optional[int] = None

    def is_configured(self) -> bool:
        """Verifica se o cliente está configurado corretamente"""
        return bool(self.app_id and self.app_secret and self.server_api_id)

    def _get_headers(self, with_auth: bool = False) -> Dict[str, str]:
        """Retorna headers para requisições"""
        headers = {
            'User-Agent': self.app_id,
            'Content-Type': 'application/json'
        }
        if with_auth and self._token:
            headers['Authorization'] = f'Bearer {self._token}'
        return headers

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        with_auth: bool = False
    ) -> Optional[Dict]:
        """Faz uma requisição HTTP para a API"""
        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers(with_auth)

        try:
            if data:
                body = json.dumps(data).encode('utf-8')
            else:
                body = None

            request = Request(url, data=body, headers=headers, method=method)

            with urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))

        except HTTPError as e:
            error_body = e.read().decode('utf-8', errors='ignore') if hasattr(e, 'fp') and e.fp else ''
            logger.error(f"CFTools API: HTTP {e.code} - {e.reason}")
            logger.debug(f"CFTools API: Error body: {error_body[:200]}")  # Primeiros 200 chars
            return None
        except URLError as e:
            logger.error(f"CFTools API: Network error - {e.reason}")
            logger.debug(f"CFTools API: Check network connectivity and firewall")
            return None
        except socket.timeout:
            logger.error(f"CFTools API: Request timeout after 10 seconds")
            logger.debug(f"CFTools API: Endpoint: {url}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"CFTools API: Invalid JSON response - {str(e)}")
            return None
        except Exception as e:
            logger.error(f"CFTools API: Unexpected error - {type(e).__name__}: {str(e)}")
            logger.debug(f"CFTools API: Traceback:", exc_info=True)
            return None

    def _load_cached_token(self) -> bool:
        """Carrega token do cache se ainda for válido (23h30m)"""
        if not os.path.exists(self.token_cache_file):
            return False

        try:
            with open(self.token_cache_file, 'r') as f:
                cache = json.load(f)

            token = cache.get('token')
            created_at = cache.get('created_at')

            if not token or not created_at:
                return False

            # Token válido por 23h30m
            max_age = 23 * 3600 + 30 * 60
            age = int(time.time()) - created_at

            if age < max_age:
                self._token = token
                self._token_created_at = created_at
                return True

            return False

        except Exception as e:
            logger.debug(f"Erro ao carregar cache de token CFTools: {e}")
            return False

    def _save_cached_token(self) -> None:
        """Salva token no cache"""
        try:
            cache_dir = os.path.dirname(self.token_cache_file)
            if cache_dir:
                os.makedirs(cache_dir, exist_ok=True)

            with open(self.token_cache_file, 'w') as f:
                json.dump({
                    'token': self._token,
                    'created_at': self._token_created_at
                }, f)

        except Exception as e:
            logger.warning(f"Erro ao salvar cache de token CFTools: {e}")

    def authenticate(self) -> bool:
        """Autentica com a API CFTools e obtém token"""
        # Tentar carregar do cache
        if self._load_cached_token():
            logger.debug("CFTools: Token carregado do cache")
            return True

        # Registrar novo token
        response = self._make_request(
            'POST',
            '/v1/auth/register',
            data={
                'application_id': self.app_id,
                'secret': self.app_secret
            }
        )

        if not response:
            logger.warning("CFTools: Falha ao autenticar")
            return False

        # Extrair token (pode estar em diferentes campos)
        token = (
            response.get('token') or
            response.get('data', {}).get('token') or
            response.get('access_token')
        )

        if not token:
            logger.warning(f"CFTools: Token não encontrado na resposta: {response}")
            return False

        self._token = token
        self._token_created_at = int(time.time())
        self._save_cached_token()

        logger.info("CFTools: Autenticação bem sucedida")
        return True

    def get_gsm_list(self) -> Optional[List[Dict]]:
        """
        Obtém lista de jogadores online via GSM (Game Session Manager)
        Retorna lista de sessões de jogadores com todos os dados disponíveis
        """
        if not self._token:
            if not self.authenticate():
                return None

        response = self._make_request(
            'GET',
            f'/v1/server/{self.server_api_id}/GSM/list',
            with_auth=True
        )

        if not response:
            return None

        if not response.get('status'):
            logger.warning(f"CFTools GSM/list retornou status=false")
            return None

        sessions = response.get('sessions', [])
        logger.info(f"CFTools API: Received response with {len(sessions)} players")
        logger.debug(f"CFTools API: Response status: {response.get('status', 'unknown')}")
        return sessions

    def _extract_player_data(self, session: Dict) -> Dict[str, Any]:
        """Extrai dados relevantes de uma sessão CFTools para o banco de dados"""
        gamedata = session.get('gamedata', {})
        connection = session.get('connection', {})
        persona = session.get('persona', {})
        bans = persona.get('bans', {})
        profile = persona.get('profile', {})
        info = session.get('info', {})
        live = session.get('live', {})
        ping = live.get('ping', {})

        return {
            'cftools_id': session.get('cftools_id'),
            'steam64': gamedata.get('steam64'),
            'player_name': gamedata.get('player_name'),
            'country_code': connection.get('country_code'),
            'ip_address': connection.get('ipv4'),
            'is_malicious': 1 if connection.get('malicious') else 0,
            'provider': connection.get('provider'),
            'vac_bans': bans.get('vac', 0),
            'game_bans': bans.get('game', 0),
            'community_ban': 1 if bans.get('community') else 0,
            'economy_ban': bans.get('economy', 'none'),
            'last_ban_days': bans.get('last_ban', 0),
            'cftools_ban_count': info.get('ban_count', 0),
            'radar_detection': json.dumps(info.get('radar')) if info.get('radar') else None,
            'labels': json.dumps(info.get('labels', [])),
            'steam_profile_name': profile.get('name'),
            'steam_avatar_url': profile.get('avatar'),
            'is_profile_private': 1 if profile.get('private') else 0,
            'session_id': session.get('id'),
            'session_start': session.get('created_at'),
            'ping': ping.get('actual'),
            'load_time': live.get('load_time')
        }

    def sync_player_data(self, player_id: str, steam64: str) -> bool:
        """
        Sincroniza dados de um jogador específico do CFTools para o banco local.
        Busca nas sessões ativas pelo steam64.
        """
        if not self.db_path:
            logger.warning("CFTools: db_path não configurado")
            return False

        sessions = self.get_gsm_list()
        if not sessions:
            return False

        # Encontrar sessão do jogador pelo steam64
        player_session = None
        for session in sessions:
            gamedata = session.get('gamedata', {})
            if gamedata.get('steam64') == steam64:
                player_session = session
                break

        if not player_session:
            logger.debug(f"CFTools: Jogador {steam64} não encontrado nas sessões ativas")
            return False

        # Extrair dados
        data = self._extract_player_data(player_session)

        # Salvar no banco
        return self._upsert_cftools_data(player_id, data)

    def sync_all_online_players(self, player_steam_map: Dict[str, str]) -> int:
        """
        Sincroniza dados de todos os jogadores online.

        Args:
            player_steam_map: Dict mapeando PlayerID -> Steam64

        Returns:
            Número de jogadores sincronizados
        """
        logger.info(f"CFTools API: Requesting GSM list for {len(player_steam_map)} players")
        logger.debug(f"CFTools API: Steam64 IDs: {list(player_steam_map.values())[:5]}...")

        if not self.db_path:
            logger.warning("CFTools: db_path não configurado")
            return 0

        sessions = self.get_gsm_list()
        if not sessions:
            return 0

        # Criar mapa inverso: steam64 -> player_id
        steam_player_map = {v: k for k, v in player_steam_map.items()}

        synced = 0
        for session in sessions:
            gamedata = session.get('gamedata', {})
            steam64 = gamedata.get('steam64')

            if not steam64:
                continue

            player_id = steam_player_map.get(steam64)
            if not player_id:
                logger.debug(f"CFTools: Steam64 {steam64} não encontrado no mapa de jogadores")
                continue

            data = self._extract_player_data(session)
            if self._upsert_cftools_data(player_id, data):
                synced += 1

        logger.info(f"CFTools: {synced} jogadores sincronizados")
        return synced

    def _upsert_cftools_data(self, player_id: str, data: Dict[str, Any]) -> bool:
        """Insere ou atualiza dados CFTools no banco de dados"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=10.0)
            cursor = conn.cursor()

            # Verificar se já existe
            cursor.execute(
                "SELECT UpdateCount FROM players_cftools WHERE PlayerID = ?",
                (player_id,)
            )
            existing = cursor.fetchone()

            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            if existing:
                # UPDATE
                update_count = existing[0] + 1
                cursor.execute("""
                    UPDATE players_cftools SET
                        CFToolsId = ?,
                        Steam64 = ?,
                        CountryCode = ?,
                        IPAddress = ?,
                        IsMalicious = ?,
                        Provider = ?,
                        VACBans = ?,
                        GameBans = ?,
                        CommunityBan = ?,
                        EconomyBan = ?,
                        LastBanDays = ?,
                        CFToolsBanCount = ?,
                        RadarDetection = ?,
                        Labels = ?,
                        SteamProfileName = ?,
                        SteamAvatarUrl = ?,
                        IsProfilePrivate = ?,
                        LastSessionId = ?,
                        LastSessionStart = ?,
                        LastPing = ?,
                        LastLoadTime = ?,
                        LastUpdated = ?,
                        UpdateCount = ?
                    WHERE PlayerID = ?
                """, (
                    data['cftools_id'],
                    data['steam64'],
                    data['country_code'],
                    data['ip_address'],
                    data['is_malicious'],
                    data['provider'],
                    data['vac_bans'],
                    data['game_bans'],
                    data['community_ban'],
                    data['economy_ban'],
                    data['last_ban_days'],
                    data['cftools_ban_count'],
                    data['radar_detection'],
                    data['labels'],
                    data['steam_profile_name'],
                    data['steam_avatar_url'],
                    data['is_profile_private'],
                    data['session_id'],
                    data['session_start'],
                    data['ping'],
                    data['load_time'],
                    now,
                    update_count,
                    player_id
                ))
            else:
                # INSERT
                cursor.execute("""
                    INSERT INTO players_cftools (
                        PlayerID, CFToolsId, Steam64, CountryCode, IPAddress,
                        IsMalicious, Provider, VACBans, GameBans, CommunityBan,
                        EconomyBan, LastBanDays, CFToolsBanCount, RadarDetection,
                        Labels, SteamProfileName, SteamAvatarUrl, IsProfilePrivate,
                        LastSessionId, LastSessionStart, LastPing, LastLoadTime,
                        FirstSeen, LastUpdated, UpdateCount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    player_id,
                    data['cftools_id'],
                    data['steam64'],
                    data['country_code'],
                    data['ip_address'],
                    data['is_malicious'],
                    data['provider'],
                    data['vac_bans'],
                    data['game_bans'],
                    data['community_ban'],
                    data['economy_ban'],
                    data['last_ban_days'],
                    data['cftools_ban_count'],
                    data['radar_detection'],
                    data['labels'],
                    data['steam_profile_name'],
                    data['steam_avatar_url'],
                    data['is_profile_private'],
                    data['session_id'],
                    data['session_start'],
                    data['ping'],
                    data['load_time'],
                    now,
                    now,
                    0
                ))

            # Inserir sessão no histórico
            if data['session_id']:
                cursor.execute("""
                    INSERT OR IGNORE INTO players_cftools_sessions (
                        PlayerID, CFToolsSessionId, SessionStart,
                        IPAddress, CountryCode, IsMalicious, Provider,
                        InitialPing, LoadTime
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    player_id,
                    data['session_id'],
                    data['session_start'],
                    data['ip_address'],
                    data['country_code'],
                    data['is_malicious'],
                    data['provider'],
                    data['ping'],
                    data['load_time']
                ))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.warning(f"CFTools: Erro ao salvar dados do jogador {player_id}: {e}")
            if conn:
                try:
                    conn.close()
                except:
                    pass
            return False
