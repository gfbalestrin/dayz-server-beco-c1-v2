"""
Configurações da aplicação Flask - Servidor de Monitoramento
Versão adaptada sem validações de arquivos DayZ
"""
import os
import json
import logging
import logging

# Diretório base da aplicação
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Tipos de usuário
USER_TYPE_SUPER_ADMIN = "super_admin"
USER_TYPE_ADMIN = "admin"
USER_TYPE_PLAYER = "player"

# Paths dos bancos de dados (relativos ao diretório scripts)
# Os bancos serão criados automaticamente se não existirem
DB_PLAYERS = os.path.join(BASE_DIR, "..", "..", "databases", "players_beco_c1.db")
DB_LOGS = os.path.join(BASE_DIR, "..", "..", "databases", "server_beco_c1_logs.db")
DB_VEHICLES = os.path.join(BASE_DIR, "..", "..", "databases", "vehicles_beco_c1.db")
DB_CONTAINERS = os.path.join(BASE_DIR, "..", "..", "databases", "containers_beco_c1.db")
DB_STRUCTURES = os.path.join(BASE_DIR, "..", "..", "databases", "structures_beco_c1.db")
DB_ITEMS = os.path.join(BASE_DIR, "..", "..", "databases", "dayz_items.db")

# Banco de dados GeoLite2 para geolocalização de jogadores
GEOLITE2_DB_PATH = os.path.join(BASE_DIR, "..", "..", "databases", "GeoLite2-City.mmdb")

# Criar diretório de bancos se não existir
DB_DIR = os.path.dirname(DB_PLAYERS)
os.makedirs(DB_DIR, exist_ok=True)

# Configurações de paginação
RESULTS_PER_PAGE = 100

# Configurações RabbitMQ - lendo do config.json
# Caminho: installation/dayz-client/scripts/admin-interface -> installation/dayz-client/scripts/config.json
CONFIG_JSON_PATH = os.path.join(BASE_DIR, "..", "config.json")
if os.path.exists(CONFIG_JSON_PATH):
    try:
        with open(CONFIG_JSON_PATH, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
            rabbitmq_config = config_data.get('RabbitMQ', {})
            
            RABBITMQ_HOST = rabbitmq_config.get('Host', 'localhost')
            RABBITMQ_PORT = rabbitmq_config.get('Port', 5672)
            RABBITMQ_USERNAME = rabbitmq_config.get('Username', 'guest')
            RABBITMQ_PASSWORD = rabbitmq_config.get('Password', 'guest')
            RABBITMQ_VHOST = rabbitmq_config.get('VHost', '/')
            RABBITMQ_EXCHANGE = rabbitmq_config.get('Exchange', 'dayz.events')
            RABBITMQ_ENABLED = rabbitmq_config.get('Enabled', False)
            
            # Configurações Discord
            discord_config = config_data.get('Discord', {})
            DISCORD_DESACTIVE = discord_config.get('Desactive', '0')
            DISCORD_WEBHOOK_LOGS = discord_config.get('WebhookLogs', '')
            discord_channel_online = discord_config.get('ChannelPlayersOnline', {})
            DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID = discord_channel_online.get('ChannelId', '')
            DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID = discord_channel_online.get('MessageId', '')
            DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN = discord_channel_online.get('BotToken', '')
            
            # Configurações Flask (servidor)
            flask_config = config_data.get('Flask', {})
            HOST = flask_config.get('Host') or '0.0.0.0'  # Fallback mínimo para evitar quebra do Flask
            PORT = flask_config.get('Port')
            DEBUG = flask_config.get('Debug')
            SECRET_KEY = flask_config.get('SecretKey')
            
            # Configurações Admin (credenciais)
            admin_config = config_data.get('Admin', {})
            ADMIN_USERNAME = admin_config.get('Username')
            ADMIN_PASSWORD = admin_config.get('Password')
            
            # Configurações SSH para servidor DayZ
            # Prioridade: Variáveis de ambiente > config.json
            dayz_server_config = config_data.get('DayZServer', {})
            ssh_config = dayz_server_config.get('SSH', {})
            
            # Credenciais sensíveis: priorizar variáveis de ambiente
            DAYZ_SERVER_SSH_HOST = os.getenv('DAYZ_SSH_HOST') or ssh_config.get('Host')
            DAYZ_SERVER_SSH_USER = os.getenv('DAYZ_SSH_USER') or ssh_config.get('User')
            DAYZ_SERVER_SSH_KEY_PATH = os.getenv('DAYZ_SSH_KEY_PATH') or ssh_config.get('KeyPath')
            DAYZ_SERVER_SSH_PASSWORD = os.getenv('DAYZ_SSH_PASSWORD') or ssh_config.get('Password', '')
            
            # Configurações não-sensíveis: podem vir do config.json ou variáveis de ambiente
            DAYZ_SERVER_SSH_PORT = int(os.getenv('DAYZ_SSH_PORT', ssh_config.get('Port', 22)))
            DAYZ_SERVER_COMMANDS_FILE = os.getenv('DAYZ_SSH_COMMANDS_FILE') or ssh_config.get('CommandsFile')
            DAYZ_SERVER_RESULTS_FILE = os.getenv('DAYZ_SSH_RESULTS_FILE') or ssh_config.get('ResultsFile')
            DAYZ_SERVER_SSH_TIMEOUT = int(os.getenv('DAYZ_SSH_TIMEOUT', ssh_config.get('Timeout', 5)))
            DAYZ_SERVER_SSH_CONNECTION_POOL_SIZE = int(os.getenv('DAYZ_SSH_POOL_SIZE', ssh_config.get('ConnectionPoolSize', 3)))
            DAYZ_SERVER_SSH_CONNECTION_TTL = int(os.getenv('DAYZ_SSH_CONNECTION_TTL', ssh_config.get('ConnectionTTL', 30)))
            
            # Configurações de script de restauração de backup
            RESTORE_BACKUP_SCRIPT = os.getenv('RESTORE_BACKUP_SCRIPT') or dayz_server_config.get('RestoreBackupScript') or '/home/dayzadmin/servers/dayz-server/scripts/player_restore_backup.sh'
            RESTORE_BACKUP_WORKDIR = os.getenv('RESTORE_BACKUP_WORKDIR') or dayz_server_config.get('RestoreBackupWorkdir') or '/home/dayzadmin/servers/dayz-server/scripts'
            
            # Caminho do arquivo ban.txt no servidor remoto
            BAN_FILE_PATH = os.getenv('BAN_FILE_PATH') or dayz_server_config.get('BanFilePath') or '/home/dayzadmin/servers/dayz-server/ban.txt'
            
            # Caminho do arquivo admin_ids.txt no servidor remoto
            ADMIN_IDS_FILE = os.getenv('ADMIN_IDS_FILE') or dayz_server_config.get('AdminIdsFile') or '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt'
            
            # Configurações RCON - lendo do config.json
            # Aceitar tanto "DayZ" quanto "Dayz" (case-insensitive)
            dayz_config = config_data.get('DayZ') or config_data.get('Dayz') or {}
            app_config = config_data.get('App', {})
            
            RCON_IP = dayz_config.get('RConIP', '127.0.0.1')
            RCON_PORT = dayz_config.get('RConPort', '2305')
            RCON_PASSWORD = dayz_config.get('RConPassword', '')
            RCON_BIN = app_config.get('RconBinFile', 'bercon-cli')
            # Caminho completo do binário RCON (assumindo que está no PATH ou no diretório de scripts)
            RCON_BIN_PATH = RCON_BIN if os.path.isabs(RCON_BIN) or '/' in RCON_BIN else RCON_BIN
            
            logger = logging.getLogger(__name__)
            logger.debug(f"RabbitMQ configurado: HOST={RABBITMQ_HOST}, PORT={RABBITMQ_PORT}, VHOST={RABBITMQ_VHOST}, ENABLED={RABBITMQ_ENABLED}")
            logger.debug(f"Discord configurado: DESACTIVE={DISCORD_DESACTIVE}, WEBHOOK_LOGS={'***' if DISCORD_WEBHOOK_LOGS else ''}, CHANNEL_ID={'***' if DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID else ''}")
            logger.debug(f"Flask configurado: HOST={HOST}, PORT={PORT}, DEBUG={DEBUG}")
            logger.debug(f"Admin configurado: USERNAME={ADMIN_USERNAME}")
            logger.debug(f"SSH configurado: HOST={'***' if DAYZ_SERVER_SSH_HOST else 'não configurado'}, PORT={DAYZ_SERVER_SSH_PORT}, USER={'***' if DAYZ_SERVER_SSH_USER else 'não configurado'}, AUTH={'chave' if DAYZ_SERVER_SSH_KEY_PATH else 'senha' if DAYZ_SERVER_SSH_PASSWORD else 'não configurado'}")
            logger.debug(f"RCON configurado: IP={RCON_IP}, PORT={RCON_PORT}, BIN={RCON_BIN_PATH}, PASSWORD={'*' * len(RCON_PASSWORD) if RCON_PASSWORD else 'VAZIA'}")
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao ler configuração do config.json: {str(e)}")
        RABBITMQ_HOST = 'localhost'
        RABBITMQ_PORT = 5672
        RABBITMQ_USERNAME = 'guest'
        RABBITMQ_PASSWORD = 'guest'
        RABBITMQ_VHOST = '/'
        RABBITMQ_EXCHANGE = 'dayz.events'
        RABBITMQ_ENABLED = False
        DISCORD_DESACTIVE = '0'
        DISCORD_WEBHOOK_LOGS = ''
        DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID = ''
        DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID = ''
        DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN = ''
        # Tentar ler de variáveis de ambiente como fallback
        HOST = os.getenv('FLASK_HOST') or '0.0.0.0'  # Fallback mínimo para evitar quebra do Flask
        PORT = int(os.getenv('FLASK_PORT')) if os.getenv('FLASK_PORT') else None
        flask_debug = os.getenv('FLASK_DEBUG')
        DEBUG = flask_debug.lower() == 'true' if flask_debug else None
        SECRET_KEY = os.getenv('FLASK_SECRET_KEY') or None
        ADMIN_USERNAME = os.getenv('ADMIN_USERNAME') or None
        ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD') or None
        # Tentar ler de variáveis de ambiente mesmo em caso de erro
        DAYZ_SERVER_SSH_HOST = os.getenv('DAYZ_SSH_HOST')
        DAYZ_SERVER_SSH_PORT = int(os.getenv('DAYZ_SSH_PORT', 22))
        DAYZ_SERVER_SSH_USER = os.getenv('DAYZ_SSH_USER')
        DAYZ_SERVER_SSH_KEY_PATH = os.getenv('DAYZ_SSH_KEY_PATH')
        DAYZ_SERVER_SSH_PASSWORD = os.getenv('DAYZ_SSH_PASSWORD', '')
        DAYZ_SERVER_COMMANDS_FILE = os.getenv('DAYZ_SSH_COMMANDS_FILE')
        DAYZ_SERVER_RESULTS_FILE = os.getenv('DAYZ_SSH_RESULTS_FILE')
        DAYZ_SERVER_SSH_TIMEOUT = int(os.getenv('DAYZ_SSH_TIMEOUT', 5))
        DAYZ_SERVER_SSH_CONNECTION_POOL_SIZE = int(os.getenv('DAYZ_SSH_POOL_SIZE', 3))
        DAYZ_SERVER_SSH_CONNECTION_TTL = int(os.getenv('DAYZ_SSH_CONNECTION_TTL', 30))
        # Configurações de script de restauração de backup
        RESTORE_BACKUP_SCRIPT = os.getenv('RESTORE_BACKUP_SCRIPT') or '/home/dayzadmin/servers/dayz-server/scripts/player_restore_backup.sh'
        RESTORE_BACKUP_WORKDIR = os.getenv('RESTORE_BACKUP_WORKDIR') or '/home/dayzadmin/servers/dayz-server/scripts'
        # Caminho do arquivo ban.txt no servidor remoto
        BAN_FILE_PATH = os.getenv('BAN_FILE_PATH') or '/home/dayzadmin/servers/dayz-server/ban.txt'
        # Caminho do arquivo admin_ids.txt no servidor remoto
        ADMIN_IDS_FILE = os.getenv('ADMIN_IDS_FILE') or '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt'
        # Configurações RCON - valores padrão em caso de erro
        RCON_IP = '127.0.0.1'
        RCON_PORT = '2305'
        RCON_PASSWORD = ''
        RCON_BIN_PATH = 'bercon-cli'
else:
    # Valores padrão se config.json não existir
    logger = logging.getLogger(__name__)
    logger.warning(f"config.json não encontrado em: {CONFIG_JSON_PATH}")
    RABBITMQ_HOST = 'localhost'
    RABBITMQ_PORT = 5672
    RABBITMQ_USERNAME = 'guest'
    RABBITMQ_PASSWORD = 'guest'
    RABBITMQ_VHOST = '/'
    RABBITMQ_EXCHANGE = 'dayz.events'
    RABBITMQ_ENABLED = False
    DISCORD_DESACTIVE = '0'
    DISCORD_WEBHOOK_LOGS = ''
    DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID = ''
    DISCORD_CHANNEL_PLAYERS_ONLINE_MESSAGE_ID = ''
    DISCORD_CHANNEL_PLAYERS_ONLINE_BOT_TOKEN = ''
    # Tentar ler de variáveis de ambiente como fallback
    HOST = os.getenv('FLASK_HOST') or '0.0.0.0'  # Fallback mínimo para evitar quebra do Flask
    PORT = int(os.getenv('FLASK_PORT')) if os.getenv('FLASK_PORT') else None
    flask_debug = os.getenv('FLASK_DEBUG')
    DEBUG = flask_debug.lower() == 'true' if flask_debug else None
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY') or None
    ADMIN_USERNAME = os.getenv('ADMIN_USERNAME') or None
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD') or None
    # Tentar ler de variáveis de ambiente mesmo se config.json não existir
    DAYZ_SERVER_SSH_HOST = os.getenv('DAYZ_SSH_HOST')
    DAYZ_SERVER_SSH_PORT = int(os.getenv('DAYZ_SSH_PORT', 22))
    DAYZ_SERVER_SSH_USER = os.getenv('DAYZ_SSH_USER')
    DAYZ_SERVER_SSH_KEY_PATH = os.getenv('DAYZ_SSH_KEY_PATH')
    DAYZ_SERVER_SSH_PASSWORD = os.getenv('DAYZ_SSH_PASSWORD', '')
    DAYZ_SERVER_COMMANDS_FILE = os.getenv('DAYZ_SSH_COMMANDS_FILE')
    DAYZ_SERVER_RESULTS_FILE = os.getenv('DAYZ_SSH_RESULTS_FILE')
    DAYZ_SERVER_SSH_TIMEOUT = int(os.getenv('DAYZ_SSH_TIMEOUT', 5))
    DAYZ_SERVER_SSH_CONNECTION_POOL_SIZE = int(os.getenv('DAYZ_SSH_POOL_SIZE', 3))
    DAYZ_SERVER_SSH_CONNECTION_TTL = int(os.getenv('DAYZ_SSH_CONNECTION_TTL', 30))
    # Configurações de script de restauração de backup
    RESTORE_BACKUP_SCRIPT = os.getenv('RESTORE_BACKUP_SCRIPT') or '/home/dayzadmin/servers/dayz-server/scripts/player_restore_backup.sh'
    RESTORE_BACKUP_WORKDIR = os.getenv('RESTORE_BACKUP_WORKDIR') or '/home/dayzadmin/servers/dayz-server/scripts'
    # Caminho do arquivo ban.txt no servidor remoto
    BAN_FILE_PATH = os.getenv('BAN_FILE_PATH') or '/home/dayzadmin/servers/dayz-server/ban.txt'
    # Caminho do arquivo admin_ids.txt no servidor remoto
    ADMIN_IDS_FILE = os.getenv('ADMIN_IDS_FILE') or '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt'
    # Configurações RCON - valores padrão se config.json não existir
    RCON_IP = '127.0.0.1'
    RCON_PORT = '2305'
    RCON_PASSWORD = ''
    RCON_BIN_PATH = 'bercon-cli'

# Validação de configurações obrigatórias
logger = logging.getLogger(__name__)

# Validar configurações críticas
if not SECRET_KEY:
    logger.error("SECRET_KEY não configurado no config.json. Configure em Flask.SecretKey")
    raise ValueError("SECRET_KEY é obrigatório. Configure em config.json -> Flask -> SecretKey")

if PORT is None:
    logger.error("PORT não configurado no config.json. Configure em Flask.Port")
    raise ValueError("PORT é obrigatório. Configure em config.json -> Flask -> Port")

if not ADMIN_USERNAME:
    logger.error("ADMIN_USERNAME não configurado no config.json. Configure em Admin.Username")
    raise ValueError("ADMIN_USERNAME é obrigatório. Configure em config.json -> Admin -> Username")

if not ADMIN_PASSWORD:
    logger.error("ADMIN_PASSWORD não configurado no config.json. Configure em Admin.Password")
    raise ValueError("ADMIN_PASSWORD é obrigatório. Configure em config.json -> Admin -> Password")

# Tratar DEBUG como False se None
if DEBUG is None:
    DEBUG = False

# Validar se a senha RCON foi configurada (apenas warning, não bloqueia)
if not RCON_PASSWORD:
    logger.warning("RCON_PASSWORD não está configurada. Comandos RCON podem falhar.")

# Nota: As seguintes configurações não são necessárias no servidor de monitoramento:
# - Arquivos de comandos do DayZ (usamos RCON diretamente)
# - Arquivos de mensagens do DayZ (usamos RCON diretamente)
# - Arquivos de configuração do servidor DayZ
# - Arquivos XML (types.xml, events.xml)
# - Caminhos de logs do servidor DayZ
# - Caminhos de loadouts (se necessário, podem ser adicionados depois)

