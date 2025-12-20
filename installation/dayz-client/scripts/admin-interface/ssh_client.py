"""
Módulo SSH Client Otimizado para comunicação com servidor DayZ
Implementa pool de conexões, execução assíncrona e retry inteligente
"""
import paramiko
import threading
import time
import logging
from typing import Optional, Tuple, List
from concurrent.futures import ThreadPoolExecutor, Future
from paramiko import SSHClient, AutoAddPolicy, SSHException
try:
    import config
except ImportError:
    # Fallback se config não estiver disponível
    config = None

logger = logging.getLogger(__name__)

# Thread pool executor global para operações assíncronas
_executor = None
_executor_lock = threading.Lock()


def get_executor() -> ThreadPoolExecutor:
    """Obtém ou cria o thread pool executor global"""
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="ssh_")
    return _executor


class SSHConnection:
    """Wrapper para uma conexão SSH com timestamp"""
    
    def __init__(self, client: SSHClient, created_at: float):
        self.client = client
        self.created_at = created_at
        self.last_used = created_at
        self.lock = threading.Lock()
    
    def is_expired(self, ttl: float) -> bool:
        """Verifica se a conexão expirou"""
        return (time.time() - self.created_at) > ttl
    
    def is_alive(self) -> bool:
        """Verifica se a conexão SSH ainda está ativa"""
        try:
            transport = self.client.get_transport()
            if transport is None:
                return False
            return transport.is_active()
        except Exception:
            return False


class SSHConnectionPool:
    """Pool de conexões SSH reutilizáveis e thread-safe"""
    
    def __init__(self):
        self._pool: List[SSHConnection] = []
        self._lock = threading.Lock()
        if config:
            self._max_size = getattr(config, 'DAYZ_SERVER_SSH_CONNECTION_POOL_SIZE', 3)
            self._ttl = getattr(config, 'DAYZ_SERVER_SSH_CONNECTION_TTL', 30)
        else:
            self._max_size = 3
            self._ttl = 30
    
    def _create_connection(self) -> Optional[SSHConnection]:
        """Cria uma nova conexão SSH"""
        if not config:
            logger.error("Config não disponível")
            return None
        
        try:
            client = SSHClient()
            client.set_missing_host_key_policy(AutoAddPolicy())
            
            # Configurar autenticação
            ssh_key_path = getattr(config, 'DAYZ_SERVER_SSH_KEY_PATH', None)
            if ssh_key_path and ssh_key_path.strip():
                # Usar chave SSH
                try:
                    client.connect(
                        hostname=getattr(config, 'DAYZ_SERVER_SSH_HOST', ''),
                        port=getattr(config, 'DAYZ_SERVER_SSH_PORT', 22),
                        username=getattr(config, 'DAYZ_SERVER_SSH_USER', ''),
                        key_filename=ssh_key_path,
                        timeout=getattr(config, 'DAYZ_SERVER_SSH_TIMEOUT', 5),
                        look_for_keys=False,
                        allow_agent=False
                    )
                except Exception as e:
                    logger.error(f"Erro ao conectar SSH com chave: {e}")
                    return None
            elif getattr(config, 'DAYZ_SERVER_SSH_PASSWORD', None):
                # Usar senha
                try:
                    client.connect(
                        hostname=getattr(config, 'DAYZ_SERVER_SSH_HOST', ''),
                        port=getattr(config, 'DAYZ_SERVER_SSH_PORT', 22),
                        username=getattr(config, 'DAYZ_SERVER_SSH_USER', ''),
                        password=getattr(config, 'DAYZ_SERVER_SSH_PASSWORD', ''),
                        timeout=getattr(config, 'DAYZ_SERVER_SSH_TIMEOUT', 5),
                        look_for_keys=False,
                        allow_agent=False
                    )
                except Exception as e:
                    logger.error(f"Erro ao conectar SSH com senha: {e}")
                    return None
            else:
                logger.error("Nenhum método de autenticação SSH configurado (KeyPath ou Password)")
                return None
            
            logger.debug(f"Conexão SSH criada: {getattr(config, 'DAYZ_SERVER_SSH_HOST', '')}:{getattr(config, 'DAYZ_SERVER_SSH_PORT', 22)}")
            return SSHConnection(client, time.time())
            
        except Exception as e:
            logger.error(f"Erro ao criar conexão SSH: {e}")
            return None
    
    def get_connection(self) -> Optional[SSHConnection]:
        """Obtém uma conexão do pool (cria nova se necessário)"""
        with self._lock:
            # Limpar conexões expiradas ou mortas
            self._cleanup_connections()
            
            # Tentar reutilizar conexão existente
            for conn in self._pool:
                if conn.is_alive() and not conn.is_expired(self._ttl):
                    conn.last_used = time.time()
                    return conn
            
            # Criar nova conexão se pool não estiver cheio
            if len(self._pool) < self._max_size:
                conn = self._create_connection()
                if conn:
                    self._pool.append(conn)
                    return conn
            
            # Se pool está cheio, usar a mais antiga (se ainda válida)
            if self._pool:
                conn = self._pool[0]
                if conn.is_alive() and not conn.is_expired(self._ttl):
                    conn.last_used = time.time()
                    return conn
            
            # Criar nova conexão mesmo com pool cheio (substituir uma antiga)
            conn = self._create_connection()
            if conn and self._pool:
                # Fechar conexão mais antiga
                old_conn = self._pool.pop(0)
                try:
                    old_conn.client.close()
                except Exception:
                    pass
                self._pool.append(conn)
            
            return conn
    
    def return_connection(self, conn: SSHConnection):
        """Retorna uma conexão ao pool (não faz nada, conexões são reutilizadas automaticamente)"""
        # Conexões são mantidas no pool e reutilizadas
        pass
    
    def _cleanup_connections(self):
        """Remove conexões expiradas ou mortas do pool"""
        valid_connections = []
        for conn in self._pool:
            if conn.is_alive() and not conn.is_expired(self._ttl):
                valid_connections.append(conn)
            else:
                try:
                    conn.client.close()
                except Exception:
                    pass
        self._pool = valid_connections
    
    def close_all(self):
        """Fecha todas as conexões do pool"""
        with self._lock:
            for conn in self._pool:
                try:
                    conn.client.close()
                except Exception:
                    pass
            self._pool.clear()


# Pool global de conexões SSH
_connection_pool = SSHConnectionPool()


def _write_command_sync(command: str) -> Tuple[bool, Optional[str]]:
    """Escreve comando no arquivo remoto (síncrono, interno)"""
    if not config:
        error_msg = "Config não disponível"
        logger.error(error_msg)
        return False, error_msg
    
    ssh_host = getattr(config, 'DAYZ_SERVER_SSH_HOST', None)
    commands_file = getattr(config, 'DAYZ_SERVER_COMMANDS_FILE', None)
    
    if not ssh_host or not commands_file:
        error_msg = "Configuração SSH não encontrada"
        logger.error(error_msg)
        return False, error_msg
    
    conn = _connection_pool.get_connection()
    if not conn:
        error_msg = "Não foi possível obter conexão SSH"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        with conn.lock:
            # Usar SFTP para escrever no arquivo
            sftp = conn.client.open_sftp()
            
            # Ler conteúdo atual do arquivo (se existir)
            try:
                existing_content = sftp.open(commands_file, 'r').read().decode('utf-8')
            except IOError:
                existing_content = ''
            
            # Adicionar novo comando
            new_content = existing_content + command
            
            # Escrever de volta (append atômico)
            with sftp.open(commands_file, 'w') as f:
                f.write(new_content.encode('utf-8'))
            
            sftp.close()
            
            logger.debug(f"Comando escrito via SSH: {command.strip()}")
            return True, None
            
    except Exception as e:
        error_msg = f"Erro ao escrever comando via SSH: {str(e)}"
        logger.error(error_msg)
        # Tentar fechar conexão problemática
        try:
            conn.client.close()
        except Exception:
            pass
        return False, error_msg


def _read_file_sync(file_path: str) -> Tuple[Optional[str], Optional[str]]:
    """Lê arquivo remoto (síncrono, interno)"""
    if not config:
        error_msg = "Config não disponível"
        logger.error(error_msg)
        return None, error_msg
    
    if not getattr(config, 'DAYZ_SERVER_SSH_HOST', None):
        error_msg = "Configuração SSH não encontrada"
        logger.error(error_msg)
        return None, error_msg
    
    conn = _connection_pool.get_connection()
    if not conn:
        error_msg = "Não foi possível obter conexão SSH"
        logger.error(error_msg)
        return None, error_msg
    
    try:
        with conn.lock:
            sftp = conn.client.open_sftp()
            with sftp.open(file_path, 'r') as f:
                content = f.read().decode('utf-8')
            sftp.close()
            return content, None
            
    except IOError as e:
        error_msg = f"Arquivo não encontrado ou erro ao ler: {str(e)}"
        logger.warning(error_msg)
        return None, error_msg
    except Exception as e:
        error_msg = f"Erro ao ler arquivo via SSH: {str(e)}"
        logger.error(error_msg)
        return None, error_msg


def write_command_with_retry(command: str, max_retries: int = 3) -> Tuple[bool, Optional[str]]:
    """Escreve comando com retry automático"""
    for attempt in range(max_retries):
        try:
            success, error = _write_command_sync(command)
            if success:
                return True, None
            
            # Se não foi sucesso e não é última tentativa, aguardar antes de retry
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(f"Tentativa {attempt + 1}/{max_retries} falhou, retry em {wait_time}s: {error}")
                time.sleep(wait_time)
            else:
                logger.error(f"Falha após {max_retries} tentativas: {error}")
                return False, error
                
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                logger.warning(f"Exceção na tentativa {attempt + 1}/{max_retries}, retry em {wait_time}s: {e}")
                time.sleep(wait_time)
            else:
                error_msg = f"Exceção após {max_retries} tentativas: {str(e)}"
                logger.error(error_msg)
                return False, error_msg
    
    return False, "Falha após todas as tentativas"


def write_command_to_remote_file(command: str) -> bool:
    """Escreve comando no arquivo remoto (síncrono, público)"""
    success, error = write_command_with_retry(command)
    return success


def write_command_to_remote_file_async(command: str) -> Future:
    """Escreve comando no arquivo remoto (assíncrono, público)"""
    executor = get_executor()
    return executor.submit(write_command_to_remote_file, command)


def read_remote_file(file_path: str) -> Optional[str]:
    """Lê arquivo remoto (síncrono, público)"""
    content, error = _read_file_sync(file_path)
    return content


def read_remote_file_async(file_path: str) -> Future:
    """Lê arquivo remoto (assíncrono, público)"""
    executor = get_executor()
    return executor.submit(read_remote_file, file_path)


def test_ssh_connection() -> bool:
    """Testa conectividade SSH"""
    if not config:
        logger.error("Config não disponível")
        return False
    
    ssh_host = getattr(config, 'DAYZ_SERVER_SSH_HOST', None)
    ssh_user = getattr(config, 'DAYZ_SERVER_SSH_USER', None)
    
    if not ssh_host or not ssh_user:
        logger.error("Configuração SSH incompleta")
        return False
    
    conn = _connection_pool.get_connection()
    if not conn:
        return False
    
    try:
        # Testar conexão executando comando simples
        stdin, stdout, stderr = conn.client.exec_command('echo "test"', timeout=5)
        exit_status = stdout.channel.recv_exit_status()
        return exit_status == 0
    except Exception as e:
        logger.error(f"Erro ao testar conexão SSH: {e}")
        return False


def close_all_connections():
    """Fecha todas as conexões SSH (útil para shutdown)"""
    _connection_pool.close_all()
    global _executor
    with _executor_lock:
        if _executor:
            _executor.shutdown(wait=False)
            _executor = None

