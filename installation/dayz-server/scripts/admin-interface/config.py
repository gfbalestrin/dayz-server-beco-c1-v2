"""
Configurações da aplicação Flask
"""
import os
import json

# Diretório base da aplicação
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Credenciais de acesso (hardcoded) - Super Admin
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "dayz_beco_2024"

# Tipos de usuário
USER_TYPE_SUPER_ADMIN = "super_admin"
USER_TYPE_ADMIN = "admin"
USER_TYPE_PLAYER = "player"

# Secret key para sessões (mude isso em produção)
SECRET_KEY = "dayz-beco-c1-secret-key-2024-change-me"

# Configurações do servidor
HOST = "0.0.0.0"
PORT = 5000
DEBUG = False

# Paths dos bancos de dados
DB_PLAYERS = os.path.join(BASE_DIR, "..", "databases", "players_beco_c1.db")
DB_LOGS = os.path.join(BASE_DIR, "..", "databases", "server_beco_c1_logs.db")
DB_VEHICLES = os.path.join(BASE_DIR, "..", "databases", "vehicles_beco_c1.db")
DB_CONTAINERS = os.path.join(BASE_DIR, "..", "databases", "containers_beco_c1.db")
DB_STRUCTURES = os.path.join(BASE_DIR, "..", "databases", "structures_beco_c1.db")

# Validação de paths
if not os.path.exists(DB_PLAYERS):
    raise FileNotFoundError(f"Database não encontrado: {DB_PLAYERS}")
if not os.path.exists(DB_LOGS):
    raise FileNotFoundError(f"Database não encontrado: {DB_LOGS}")
if not os.path.exists(DB_VEHICLES):
    raise FileNotFoundError(f"Database não encontrado: {DB_VEHICLES}")
if not os.path.exists(DB_CONTAINERS):
    raise FileNotFoundError(f"Database não encontrado: {DB_CONTAINERS}")
if not os.path.exists(DB_STRUCTURES):
    raise FileNotFoundError(f"Database não encontrado: {DB_STRUCTURES}")

# Configurações de paginação
RESULTS_PER_PAGE = 100

# Caminho para script de restauração de backup
RESTORE_BACKUP_SCRIPT = '/home/dayzadmin/servers/dayz-server/scripts/player_restore_backup.sh'
RESTORE_BACKUP_WORKDIR = '/home/dayzadmin/servers/dayz-server/scripts'

# Arquivo de comandos do DayZ
COMMANDS_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/commands_to_execute.txt'

# Arquivo de resultados de comandos do DayZ
COMMANDS_RESULTS_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/commands_results.txt'

# Arquivo de mensagens privadas para enviar
MESSAGES_PRIVATE_TO_SEND_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/messages_private_to_send.txt'

# Arquivo de mensagens globais para enviar
MESSAGES_TO_SEND_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/messages_to_send.txt'

# Arquivo de administradores
ADMIN_IDS_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt'

# Arquivo de configuração do deathmatch
DEATHMATCH_CONFIG_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/deathmatch_config.json'

# Arquivo de ban permanente do servidor DayZ
BAN_FILE_PATH = '/home/dayzadmin/servers/dayz-server/ban.txt'

# Banco de dados de itens
DB_ITEMS = os.path.join(BASE_DIR, "..", "databases", "dayz_items.db")

# Caminhos dos loadouts
LOADOUTS_BASE_PATH = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/loadouts'
LOADOUTS_CUSTOM_FILE = os.path.join(LOADOUTS_BASE_PATH, 'custom.json')
LOADOUTS_PLAYERS_DIR = os.path.join(LOADOUTS_BASE_PATH, 'players')
LOADOUTS_PLAYERS_IDS_FILE = os.path.join(LOADOUTS_BASE_PATH, 'players_ids.json')

# Caminhos de logs do servidor
INIT_LOG_PATH = '/home/dayzadmin/servers/dayz-server/profiles/init.log'
DAYZ_SERVER_ERR_PATH = '/home/dayzadmin/servers/dayz-server/profiles/dayz-server.err'

# Caminhos de configuração da economia
DAYZ_TYPES_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/db/types.xml'
DAYZ_EVENTS_FILE = '/home/dayzadmin/servers/dayz-server/mpmissions/dayzOffline.chernarusplus/db/events.xml'

if not os.path.exists(DAYZ_TYPES_FILE):
    raise FileNotFoundError(f"Arquivo types.xml não encontrado: {DAYZ_TYPES_FILE}")
if not os.path.exists(DAYZ_EVENTS_FILE):
    raise FileNotFoundError(f"Arquivo events.xml não encontrado: {DAYZ_EVENTS_FILE}")

# Configurações RCON - lendo do config.json
# Caminho: installation/dayz-server/scripts/admin-interface -> installation/dayz-server/scripts/config.json
CONFIG_JSON_PATH = os.path.join(BASE_DIR, "..", "config.json")
if os.path.exists(CONFIG_JSON_PATH):
    try:
        with open(CONFIG_JSON_PATH, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
            # Aceitar tanto "DayZ" quanto "Dayz" (case-insensitive)
            dayz_config = config_data.get('DayZ') or config_data.get('Dayz') or {}
            app_config = config_data.get('App') or {}
            
            RCON_IP = dayz_config.get('RConIP', '127.0.0.1')
            RCON_PORT = dayz_config.get('RConPort', '2305')
            RCON_PASSWORD = dayz_config.get('RConPassword', '')
            RCON_BIN = app_config.get('RconBinFile', 'bercon-cli')
            # Caminho completo do binário RCON (assumindo que está no PATH ou no diretório de scripts)
            RCON_BIN_PATH = RCON_BIN if os.path.isabs(RCON_BIN) or '/' in RCON_BIN else RCON_BIN
            
            # Log de debug (sem mostrar a senha completa)
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"RCON configurado: IP={RCON_IP}, PORT={RCON_PORT}, BIN={RCON_BIN_PATH}, PASSWORD={'*' * len(RCON_PASSWORD) if RCON_PASSWORD else 'VAZIA'}")
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao ler config.json: {str(e)}")
        RCON_IP = '127.0.0.1'
        RCON_PORT = '2305'
        RCON_PASSWORD = ''
        RCON_BIN_PATH = 'bercon-cli'
else:
    # Valores padrão se config.json não existir
    import logging
    logger = logging.getLogger(__name__)
    logger.warning(f"config.json não encontrado em: {CONFIG_JSON_PATH}")
    RCON_IP = '127.0.0.1'
    RCON_PORT = '2305'
    RCON_PASSWORD = ''
    RCON_BIN_PATH = 'bercon-cli'

# Validar se a senha RCON foi configurada
if not RCON_PASSWORD:
    import warnings
    import logging
    logger = logging.getLogger(__name__)
    logger.warning("RCON_PASSWORD não está configurada. Comandos RCON podem falhar.")
    warnings.warn("RCON_PASSWORD não está configurada. Comandos RCON podem falhar.")
