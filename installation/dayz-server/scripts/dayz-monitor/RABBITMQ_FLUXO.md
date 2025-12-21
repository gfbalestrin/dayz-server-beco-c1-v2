# Fluxo RabbitMQ - Servidor DayZ

## Arquitetura Atual

```
┌─────────────────────────────────────────────────────────────┐
│  Servidor DayZ                                             │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  dayz-monitor.service (systemd)                     │  │
│  │  └─> dayz_supervisor.sh                              │  │
│  │      ├─> dayz_command_watcher.sh (background)       │  │
│  │      ├─> dayz_log_monitor.sh (background)          │  │
│  │      └─> dayz_err_monitor.sh (background)           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Scripts de Ação (actions/*.sh)                     │  │
│  │  - containers_positions.sh                           │  │
│  │  - vehicles_positions.sh                             │  │
│  │  - players_positions.sh                              │  │
│  │  - etc.                                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Funções em config.sh                                │  │
│  │  - INSERT_CUSTOM_LOG()                               │  │
│  │    ├─> Grava SQLite local (fallback)                │  │
│  │    └─> PUBLISH_TO_RABBITMQ("logs.custom", ...)       │  │
│  │                                                       │  │
│  │  - INSERT_ADM_LOG()                                  │  │
│  │    ├─> Grava SQLite local (fallback)                 │  │
│  │    └─> PUBLISH_TO_RABBITMQ("logs.adm", ...)         │  │
│  │                                                       │  │
│  │  - PUBLISH_TO_RABBITMQ()                             │  │
│  │    └─> python3 rabbitmq_producer.py (background)     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  rabbitmq_producer.py                                │  │
│  │  - Conecta ao RabbitMQ (servidor de monitoramento)  │  │
│  │  - Publica mensagem na fila                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ AMQP (porta 5672)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Servidor de Monitoramento                                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  RabbitMQ Server                                      │  │
│  │  - Fila: logs.custom                                  │  │
│  │  - Fila: logs.adm                                    │  │
│  │  - Fila: data.containers.positions                    │  │
│  │  - Fila: data.vehicles.positions                     │  │
│  │  - etc.                                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Consumers Python                                    │  │
│  │  - logs_consumer.py                                  │  │
│  │  - positions_consumer.py                             │  │
│  │  └─> Grava no SQLite local                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Fluxo Detalhado

### 1. Logs (INSERT_CUSTOM_LOG / INSERT_ADM_LOG)

```
dayz_log_monitor.sh
    │
    ├─> Detecta evento no log
    │
    ├─> INSERT_CUSTOM_LOG("mensagem", "INFO", "ScriptName")
    │       │
    │       ├─> Grava no SQLite local (server_beco_c1_logs.db)
    │       │   └─> Fallback se RabbitMQ falhar
    │       │
    │       └─> PUBLISH_TO_RABBITMQ("logs.custom", payload)
    │               │
    │               └─> rabbitmq_producer.py (background)
    │                       │
    │                       └─> Publica na fila RabbitMQ
    │                               │
    │                               └─> Servidor de monitoramento
    │                                       │
    │                                       └─> logs_consumer.py
    │                                               │
    │                                               └─> Grava no SQLite
```

### 2. Dados de Posições (containers_positions.sh)

```
containers_positions.sh
    │
    ├─> Processa JSON de containers
    │
    ├─> INSERT_CONTAINERS_POSITIONS_BATCH() (SQLite local)
    │
    └─> PUBLISH_TO_RABBITMQ("data.containers.positions", json)
            │
            └─> rabbitmq_producer.py
                    │
                    └─> Fila RabbitMQ
                            │
                            └─> positions_consumer.py
                                    │
                                    └─> Grava no SQLite
```

## Como Testar

### 1. Verificar Configuração RabbitMQ

Edite `config.json` e configure:

```json
{
  "RabbitMQ": {
    "Host": "IP_DO_SERVIDOR_MONITORAMENTO",
    "Port": 5672,
    "Username": "dayz_producer",
    "Password": "sua_senha",
    "VHost": "dayz",
    "Exchange": "dayz.events",
    "Enabled": true
  }
}
```

### 2. Testar Conexão RabbitMQ

No servidor DayZ, teste a conexão:

```bash
cd /home/dayzadmin/servers/dayz-server/scripts/dayz-monitor
python3 rabbitmq_producer.py "logs.custom" '{"message":"teste","level":"INFO","source":"test"}'
```

### 3. Testar Publicação Manual

No servidor DayZ, teste a função PUBLISH_TO_RABBITMQ:

```bash
cd /home/dayzadmin/servers/dayz-server/scripts
source config.sh

# Testar publicação de log custom
PUBLISH_TO_RABBITMQ "logs.custom" '{"message":"Teste manual","level":"INFO","source":"teste"}'

# Testar publicação de log adm
PUBLISH_TO_RABBITMQ "logs.adm" '{"message":"Teste adm","level":"INFO"}'
```

### 4. Verificar Mensagens no RabbitMQ

No servidor de monitoramento:

```bash
# Verificar filas
sudo rabbitmqctl list_queues -p dayz

# Ver mensagens na fila (sem consumir)
sudo rabbitmqctl list_queues -p dayz name messages

# Verificar conexões
sudo rabbitmqctl list_connections
```

### 5. Testar com Logs Reais

O serviço `dayz-monitor.service` já está rodando e automaticamente:
- Monitora logs do DayZ
- Chama `INSERT_CUSTOM_LOG()` e `INSERT_ADM_LOG()`
- Essas funções automaticamente publicam no RabbitMQ

Para verificar se está funcionando:

```bash
# Ver logs do serviço
sudo journalctl -u dayz-monitor -f

# Verificar se há erros de conexão RabbitMQ
sudo journalctl -u dayz-monitor | grep -i rabbitmq
```

### 6. Verificar Consumers no Servidor de Monitoramento

```bash
# Verificar status do serviço de consumers
sudo systemctl status dayz-rabbitmq-consumers

# Ver logs dos consumers
sudo journalctl -u dayz-rabbitmq-consumers -f

# Verificar se mensagens estão sendo consumidas
sudo rabbitmqctl list_queues -p dayz name messages consumers
```

## Troubleshooting

### Erro: "Connection refused"

- Verificar se RabbitMQ está rodando no servidor de monitoramento
- Verificar firewall (porta 5672)
- Verificar IP/hostname no config.json

### Erro: "Access refused"

- Verificar usuário/senha no config.json
- Verificar permissões do usuário no RabbitMQ:
  ```bash
  sudo rabbitmqctl list_permissions -p dayz
  ```

### Mensagens não aparecem nas filas

- Verificar se `"Enabled": true` no config.json
- Verificar logs do rabbitmq_producer.py:
  ```bash
  # Executar manualmente para ver erros
  python3 rabbitmq_producer.py "logs.custom" '{"test":"test"}'
  ```

### Mensagens ficam na fila mas não são consumidas

- Verificar se consumers estão rodando:
  ```bash
  sudo systemctl status dayz-rabbitmq-consumers
  ```
- Verificar logs dos consumers:
  ```bash
  sudo journalctl -u dayz-rabbitmq-consumers -f
  ```

## Status Atual

✅ **Já implementado e funcionando:**
- `INSERT_CUSTOM_LOG()` publica no RabbitMQ automaticamente
- `INSERT_ADM_LOG()` publica no RabbitMQ automaticamente
- `containers_positions.sh` publica dados no RabbitMQ
- `rabbitmq_producer.py` está pronto para uso

⚠️ **Ainda precisa:**
- Configurar `config.json` com IP e credenciais do servidor de monitoramento
- Habilitar RabbitMQ (`"Enabled": true`)
- Instalar `pika` no servidor DayZ: `pip3 install pika`
- Iniciar consumers no servidor de monitoramento

