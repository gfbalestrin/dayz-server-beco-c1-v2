"""
Configurações da aplicação Flask - Servidor de Monitoramento
Versão adaptada sem validações de arquivos DayZ
"""
import os
import json

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
            HOST = flask_config.get('Host', '0.0.0.0')
            PORT = flask_config.get('Port', 5000)
            DEBUG = flask_config.get('Debug', False)
            SECRET_KEY = flask_config.get('SecretKey', 'dayz-beco-c1-secret-key-2024-change-me')
            
            # Configurações Admin (credenciais)
            admin_config = config_data.get('Admin', {})
            ADMIN_USERNAME = admin_config.get('Username', 'admin')
            ADMIN_PASSWORD = admin_config.get('Password', 'dayz_beco_2024')
            
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"RabbitMQ configurado: HOST={RABBITMQ_HOST}, PORT={RABBITMQ_PORT}, VHOST={RABBITMQ_VHOST}, ENABLED={RABBITMQ_ENABLED}")
            logger.debug(f"Discord configurado: DESACTIVE={DISCORD_DESACTIVE}, WEBHOOK_LOGS={'***' if DISCORD_WEBHOOK_LOGS else ''}, CHANNEL_ID={'***' if DISCORD_CHANNEL_PLAYERS_ONLINE_CHANNEL_ID else ''}")
            logger.debug(f"Flask configurado: HOST={HOST}, PORT={PORT}, DEBUG={DEBUG}")
            logger.debug(f"Admin configurado: USERNAME={ADMIN_USERNAME}")
    except Exception as e:
        import logging
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
        HOST = '0.0.0.0'
        PORT = 5000
        DEBUG = False
        SECRET_KEY = 'dayz-beco-c1-secret-key-2024-change-me'
        ADMIN_USERNAME = 'admin'
        ADMIN_PASSWORD = 'dayz_beco_2024'
else:
    # Valores padrão se config.json não existir
    import logging
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
    HOST = '0.0.0.0'
    PORT = 5000
    DEBUG = False
    SECRET_KEY = 'dayz-beco-c1-secret-key-2024-change-me'
    ADMIN_USERNAME = 'admin'
    ADMIN_PASSWORD = 'dayz_beco_2024'

# Nota: As seguintes configurações não são necessárias no servidor de monitoramento:
# - RCON (não há servidor DayZ local)
# - Arquivos de comandos do DayZ
# - Arquivos de mensagens do DayZ
# - Arquivos de configuração do servidor DayZ
# - Arquivos XML (types.xml, events.xml)
# - Caminhos de logs do servidor DayZ
# - Caminhos de loadouts (se necessário, podem ser adicionados depois)

