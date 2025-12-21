#!/usr/bin/env python3
"""
Consumer RabbitMQ para processar backups de players.
Este script consome mensagens de data.players.backups, insere coordenadas em players_coord
e vincula o backup BLOB na tabela players_coord_backup.
"""

import pika
import json
import sqlite3
import sys
import os
import base64
from datetime import datetime

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
PLAYERS_BECO_C1_DB = os.environ.get('PLAYERS_BECO_C1_DB', '')
DAYZ_DEATHMATCH = os.environ.get('DayzDeathmatch', '0')

if not PLAYERS_BECO_C1_DB:
    print("Erro: PLAYERS_BECO_C1_DB deve ser definido como variável de ambiente", file=sys.stderr)
    sys.exit(1)


def process_message(ch, method, properties, body):
    """Processa mensagem recebida do RabbitMQ."""
    try:
        # Decodificar mensagem
        message_str = body.decode('utf-8')
        
        # A mensagem pode vir em dois formatos:
        # 1. JSON direto: {"action": "players_backup_data", ...}
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
        
        # Verificar se é mensagem de backup
        if message.get('action') != 'players_backup_data':
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Extrair dados da mensagem
        player_id = message.get('player_id')
        backup_data_base64 = message.get('backup_data')
        coord_x = message.get('coord_x')
        coord_z = message.get('coord_z')
        coord_y = message.get('coord_y')
        timestamp_str = message.get('timestamp')
        
        if not player_id or not backup_data_base64:
            print(f"Erro: Dados incompletos na mensagem de backup", file=sys.stderr)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        if coord_x is None or coord_z is None or coord_y is None:
            print(f"Erro: Coordenadas ausentes na mensagem de backup para {player_id}", file=sys.stderr)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Converter base64 para bytes (blob)
        try:
            backup_blob = base64.b64decode(backup_data_base64)
        except Exception as e:
            print(f"Erro ao decodificar base64 para {player_id}: {e}", file=sys.stderr)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Usar timestamp da mensagem ou atual
        if not timestamp_str:
            timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Conectar ao banco e inserir coordenada + backup em transação
        conn = sqlite3.connect(PLAYERS_BECO_C1_DB)
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()
        
        try:
            # Iniciar transação
            conn.execute("BEGIN IMMEDIATE TRANSACTION")
            
            # Inserir novo registro na tabela players_coord (apenas coordenadas)
            cursor.execute("""
                INSERT INTO players_coord (PlayerID, CoordX, CoordZ, CoordY, Data)
                VALUES (?, ?, ?, ?, ?)
            """, (player_id, float(coord_x), float(coord_z), float(coord_y), timestamp_str))
            
            # Capturar PlayerCoordId gerado
            player_coord_id = cursor.lastrowid
            
            if not player_coord_id:
                raise Exception("Falha ao obter PlayerCoordId após INSERT")
            
            # Inserir backup na tabela players_coord_backup
            cursor.execute("""
                INSERT INTO players_coord_backup (PlayerCoordId, Backup, TimeStamp)
                VALUES (?, ?, datetime('now', 'localtime'))
            """, (player_coord_id, backup_blob))
            
            # Commit transação
            conn.commit()
            print(f"Backup inserido com sucesso para {player_id} (PlayerCoordId: {player_coord_id})")
            
        except sqlite3.IntegrityError as e:
            # Foreign key constraint - PlayerID não existe em players_database
            print(f"Erro de integridade ao inserir backup para {player_id}: {e}", file=sys.stderr)
            conn.rollback()
        except Exception as e:
            print(f"Erro ao inserir backup para {player_id}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            conn.rollback()
        finally:
            conn.close()
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except Exception as e:
        print(f"Erro ao processar mensagem: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
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
        
        # Declarar fila para backups
        queue_name = 'data.players.backups'
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

