#!/usr/bin/env python3
"""
Consumer RabbitMQ para processar backups de players.
Este script consome mensagens de data.players.positions e faz backups dos players
quando necessário (intervalo mínimo de 5 minutos).
"""

import pika
import json
import sqlite3
import sys
import os
import time
from datetime import datetime, timedelta

# Carregar configurações do config.json
script_dir = os.path.dirname(os.path.abspath(__file__))
config_path = os.path.abspath(os.path.join(script_dir, '../../config/config.json'))

rabbitmq_config = {}
try:
    with open(config_path, 'r') as f:
        full_config = json.load(f)
        rabbitmq_config = full_config.get('RabbitMQ', {})
except FileNotFoundError:
    print(f"Erro: config.json não encontrado em {config_path}", file=sys.stderr)
    sys.exit(1)
except json.JSONDecodeError:
    print(f"Erro: Falha ao decodificar JSON em {config_path}", file=sys.stderr)
    sys.exit(1)

RABBITMQ_HOST = rabbitmq_config.get('Host', 'localhost')
RABBITMQ_PORT = rabbitmq_config.get('Port', 5672)
RABBITMQ_USER = rabbitmq_config.get('Username', 'guest')
RABBITMQ_PASS = rabbitmq_config.get('Password', 'guest')
RABBITMQ_VHOST = rabbitmq_config.get('VHost', '/')
RABBITMQ_EXCHANGE = rabbitmq_config.get('Exchange', 'dayz.events')
RABBITMQ_ENABLED = rabbitmq_config.get('Enabled', False)

if not RABBITMQ_ENABLED:
    print("RabbitMQ está desativado na configuração. Saindo do consumer.", file=sys.stderr)
    sys.exit(0)

# Carregar variáveis do ambiente ou config
# Essas variáveis devem ser definidas no script que chama este consumer
DB_FILENAME = os.environ.get('DB_FILENAME', '')
PLAYERS_BECO_C1_DB = os.environ.get('PLAYERS_BECO_C1_DB', '')
DAYZ_DEATHMATCH = os.environ.get('DayzDeathmatch', '0')

if not DB_FILENAME or not PLAYERS_BECO_C1_DB:
    print("Erro: DB_FILENAME e PLAYERS_BECO_C1_DB devem ser definidos como variáveis de ambiente", file=sys.stderr)
    sys.exit(1)

# Cache de últimos backups (PlayerID -> timestamp)
last_backups = {}

def process_player_backup(player_id, player_coord_id):
    """Processa backup de um player."""
    try:
        # Ler backup do banco DayZ
        conn = sqlite3.connect(DB_FILENAME)
        cursor = conn.cursor()
        cursor.execute("SELECT hex(Data) FROM Players WHERE UID = ?", (player_id,))
        result = cursor.fetchone()
        conn.close()
        
        if not result or not result[0]:
            return True  # Player Data está em branco, ignorar
        
        backup_hex = result[0]
        
        # Inserir backup no banco de players
        conn = sqlite3.connect(PLAYERS_BECO_C1_DB)
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()
        
        # Converter hex para blob
        backup_blob = bytes.fromhex(backup_hex)
        
        cursor.execute("""
            INSERT INTO players_coord_backup (PlayerCoordId, Backup, TimeStamp)
            VALUES (?, ?, datetime('now', 'localtime'))
        """, (player_coord_id, backup_blob))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        print(f"Erro ao processar backup para {player_id}: {e}", file=sys.stderr)
        return False

def should_backup(player_id):
    """Verifica se deve fazer backup (intervalo mínimo de 5 minutos)."""
    if player_id not in last_backups:
        return True
    
    last_backup_time = last_backups[player_id]
    now = datetime.now()
    
    # Calcular diferença em segundos
    time_diff = (now - last_backup_time).total_seconds()
    
    # Intervalo mínimo de 5 minutos (300 segundos)
    return time_diff >= 300

def process_message(ch, method, properties, body):
    """Processa mensagem recebida do RabbitMQ."""
    try:
        # Decodificar mensagem
        message_str = body.decode('utf-8')
        
        # A mensagem pode vir em dois formatos:
        # 1. JSON direto: {"action": "players_positions", "players": [...]}
        # 2. JSON com wrapper: {"queue": "...", "message": "{...}", "timestamp": "..."}
        
        try:
            wrapper = json.loads(message_str)
            if 'message' in wrapper:
                # Formato wrapper - extrair mensagem interna
                if isinstance(wrapper['message'], str):
                    message = json.loads(wrapper['message'])
                else:
                    message = wrapper['message']
            else:
                # Formato direto
                message = wrapper
        except json.JSONDecodeError:
            print(f"Erro: Falha ao decodificar JSON: {message_str[:200]}", file=sys.stderr)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Verificar se é deathmatch (não fazer backups)
        if DAYZ_DEATHMATCH == '1':
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Extrair players do JSON
        players = message.get('players', [])
        if not players:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Obter PlayerCoordIds do banco (precisa ter sido inserido pelo consumer de posições)
        conn = sqlite3.connect(PLAYERS_BECO_C1_DB)
        cursor = conn.cursor()
        
        # Buscar PlayerCoordIds para os players
        player_ids = [p.get('player_id') for p in players if p.get('player_id')]
        if not player_ids:
            conn.close()
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Buscar últimos PlayerCoordIds de cada player (mais recente por player)
        placeholders = ','.join('?' * len(player_ids))
        cursor.execute(f"""
            SELECT PlayerID, PlayerCoordId
            FROM (
                SELECT PlayerID, PlayerCoordId,
                       ROW_NUMBER() OVER (PARTITION BY PlayerID ORDER BY TimeStamp DESC) as rn
                FROM players_coord
                WHERE PlayerID IN ({placeholders})
            ) ranked
            WHERE rn = 1
        """, player_ids)
        
        player_coord_map = {}
        for row in cursor.fetchall():
            player_id, coord_id = row
            player_coord_map[player_id] = coord_id
        
        conn.close()
        
        # Processar backups para cada player
        for player in players:
            player_id = player.get('player_id')
            if not player_id or player_id not in player_coord_map:
                continue
            
            # Verificar se deve fazer backup
            if not should_backup(player_id):
                continue
            
            player_coord_id = player_coord_map[player_id]
            
            # Processar backup em background (não bloqueia)
            if process_player_backup(player_id, player_coord_id):
                last_backups[player_id] = datetime.now()
        
        # Confirmar processamento
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except Exception as e:
        print(f"Erro ao processar mensagem: {e}", file=sys.stderr)
        # Rejeitar mensagem e não reenfileirar (evitar loop infinito)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

def main():
    """Função principal do consumer."""
    try:
        # Conectar ao RabbitMQ
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
        parameters = pika.ConnectionParameters(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            virtual_host=RABBITMQ_VHOST,
            credentials=credentials,
            heartbeat=60,
            blocked_connection_timeout=300
        )
        
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        
        # Declarar exchange
        channel.exchange_declare(exchange=RABBITMQ_EXCHANGE, exchange_type='topic', durable=True)
        
        # Declarar fila
        queue_name = 'data.players.positions'
        channel.queue_declare(queue=queue_name, durable=True)
        channel.queue_bind(exchange=RABBITMQ_EXCHANGE, queue=queue_name, routing_key=queue_name)
        
        # Configurar QoS (processar uma mensagem por vez)
        channel.basic_qos(prefetch_count=1)
        
        # Configurar consumer
        channel.basic_consume(queue=queue_name, on_message_callback=process_message)
        
        print(f"Consumindo mensagens da fila '{queue_name}'...")
        print("Pressione CTRL+C para sair")
        
        # Iniciar consumo
        channel.start_consuming()
        
    except KeyboardInterrupt:
        print("\nInterrompido pelo usuário")
        if 'channel' in locals():
            channel.stop_consuming()
        if 'connection' in locals():
            connection.close()
    except Exception as e:
        print(f"Erro fatal: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

