"""
Configurações da aplicação Flask
"""
import os

# Diretório base da aplicação
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Credenciais de acesso (hardcoded)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "dayz_beco_2024"

# Secret key para sessões (mude isso em produção)
SECRET_KEY = "dayz-beco-c1-secret-key-2024-change-me"

# Configurações do servidor
HOST = "0.0.0.0"
PORT = 5000
DEBUG = False

# Paths dos bancos de dados
DB_PLAYERS = os.path.join(BASE_DIR, "..", "databases", "players_beco_c1.db")
DB_LOGS = os.path.join(BASE_DIR, "..", "databases", "server_beco_c1_logs.db")

# Validação de paths
if not os.path.exists(DB_PLAYERS):
    raise FileNotFoundError(f"Database não encontrado: {DB_PLAYERS}")
if not os.path.exists(DB_LOGS):
    raise FileNotFoundError(f"Database não encontrado: {DB_LOGS}")

# Configurações de paginação
RESULTS_PER_PAGE = 100

# Caminho para script de restauração de backup
RESTORE_BACKUP_SCRIPT = '/home/dayzadmin/servers/dayz-server/scripts/player_restore_backup.sh'
RESTORE_BACKUP_WORKDIR = '/home/dayzadmin/servers/dayz-server/scripts'

# Caminho para script de teleporte
TELEPORT_SCRIPT = '/home/dayzadmin/servers/dayz-server/scripts/player_replace_position.sh'
TELEPORT_WORKDIR = '/home/dayzadmin/servers/dayz-server/scripts'
