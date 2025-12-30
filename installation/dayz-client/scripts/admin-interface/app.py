"""
Aplicação Flask para interface administrativa DayZ
Refatorado para usar Blueprints Flask
"""
from flask import Flask, render_template
import config
from database import ensure_protected_loadouts_exist, load_admin_ids_cache
import logging

# Configurar logging para console e arquivo
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('debug_timezone.log')
    ]
)

# Importar todos os blueprints
from blueprints import auth, views
from blueprints import api_map, api_players, api_vehicles, api_containers, api_structures, api_events
from blueprints import api_cheat_detection, api_deathmatch, api_spawning
from blueprints import api_items_manage, api_kits, api_users
from blueprints import api_loadouts, api_loadout_rules, api_commands
from blueprints import api_server_config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Registrar blueprints
app.register_blueprint(auth.auth_bp)
app.register_blueprint(views.views_bp)
app.register_blueprint(api_map.api_map_bp)
app.register_blueprint(api_players.api_players_bp)
app.register_blueprint(api_vehicles.api_vehicles_bp)
app.register_blueprint(api_containers.api_containers_bp)
app.register_blueprint(api_structures.api_structures_bp)
app.register_blueprint(api_events.api_events_bp)
app.register_blueprint(api_cheat_detection.api_cheat_detection_bp)
app.register_blueprint(api_deathmatch.api_deathmatch_bp)
app.register_blueprint(api_spawning.api_spawning_bp)
app.register_blueprint(api_items_manage.api_items_manage_bp)
app.register_blueprint(api_kits.api_kits_bp)
app.register_blueprint(api_users.api_users_bp)
app.register_blueprint(api_loadouts.api_loadouts_bp)
app.register_blueprint(api_loadout_rules.api_loadout_rules_bp)
app.register_blueprint(api_commands.api_commands_bp)
app.register_blueprint(api_server_config.api_server_config_bp)

# Error handlers
@app.errorhandler(404)
def not_found(e):
    return render_template('error.html', message='Página não encontrada'), 404

@app.errorhandler(500)
def internal_error(e):
    return render_template('error.html', message='Erro interno do servidor'), 500

if __name__ == '__main__':
    print(f"\n🚀 Iniciando servidor DayZ Admin Interface...")
    print(f"📊 Banco de jogadores: {config.DB_PLAYERS}")
    print(f"📝 Banco de logs: {config.DB_LOGS}")
    print(f"🌐 Acesse: http://{config.HOST}:{config.PORT}")
    print(f"👤 Usuário: {config.ADMIN_USERNAME}")
    print(f"\n⚠️  Pressione Ctrl+C para parar o servidor\n")
    
    # Garantir que loadouts protegidos existam
    ensure_protected_loadouts_exist()
    print("✅ Loadouts protegidos verificados")

    # Carregar cache de admin IDs (uma única vez na inicialização)
    load_admin_ids_cache()
    print("✅ Cache de admin IDs carregado")

    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
