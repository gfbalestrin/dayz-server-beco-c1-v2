# Consumers RabbitMQ

Este diretório contém os consumers RabbitMQ que processam mensagens do servidor DayZ e gravam no SQLite.

## Estrutura

- `logs_consumer.py` - Consumer para logs (custom e adm)
- `positions_consumer.py` - Consumer para dados de posições (containers, vehicles, players, structures)
- `consumer_manager.py` - Gerenciador que inicia e monitora todos os consumers
- `dayz-rabbitmq-consumers.service` - Arquivo de serviço systemd
- `test_consumer.sh` - Script de teste dos consumers

## Instalação

### 1. Instalar RabbitMQ no servidor de monitoramento

```bash
sudo apt update
sudo apt install rabbitmq-server
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server
```

### 2. Configurar RabbitMQ

```bash
# Criar vhost
sudo rabbitmqctl add_vhost dayz

# Criar usuário producer (para servidor DayZ)
sudo rabbitmqctl add_user dayz_producer secure_password
sudo rabbitmqctl set_permissions -p dayz dayz_producer ".*" ".*" ".*"

# Criar usuário consumer (para servidor de monitoramento)
sudo rabbitmqctl add_user dayz_consumer secure_password
sudo rabbitmqctl set_permissions -p dayz dayz_consumer ".*" ".*" ".*"
```

### 3. Instalar dependências Python

```bash
pip3 install pika
```

### 4. Configurar config.py

Editar `../admin-interface/config.py` e configurar as variáveis RabbitMQ:
- `RABBITMQ_HOST`
- `RABBITMQ_PORT`
- `RABBITMQ_USERNAME`
- `RABBITMQ_PASSWORD`
- `RABBITMQ_VHOST`
- `RABBITMQ_EXCHANGE`
- `RABBITMQ_ENABLED`

### 5. Instalar serviço systemd

```bash
# Copiar arquivo de serviço
sudo cp dayz-rabbitmq-consumers.service /etc/systemd/system/

# Recarregar systemd
sudo systemctl daemon-reload

# Habilitar serviço
sudo systemctl enable dayz-rabbitmq-consumers

# Iniciar serviço
sudo systemctl start dayz-rabbitmq-consumers

# Verificar status
sudo systemctl status dayz-rabbitmq-consumers
```

## Uso Manual

### Executar consumer manager

```bash
cd /home/dayzadmin/servers/dayz-client/scripts/consumers
python3 consumer_manager.py
```

### Executar consumer individual

```bash
# Logs consumer
python3 logs_consumer.py

# Positions consumer
python3 positions_consumer.py
```

## Testes

Execute o script de teste para verificar se tudo está configurado corretamente:

```bash
./test_consumer.sh
```

## Logs

Os logs são enviados para o journal do systemd:

```bash
# Ver logs do serviço
sudo journalctl -u dayz-rabbitmq-consumers -f

# Ver logs das últimas 100 linhas
sudo journalctl -u dayz-rabbitmq-consumers -n 100
```

## Troubleshooting

### Verificar conexão RabbitMQ

```bash
# Verificar status do RabbitMQ
sudo systemctl status rabbitmq-server

# Verificar filas
sudo rabbitmqctl list_queues -p dayz

# Verificar exchanges
sudo rabbitmqctl list_exchanges -p dayz

# Verificar conexões
sudo rabbitmqctl list_connections
```

### Verificar consumers

```bash
# Ver processos Python
ps aux | grep consumer

# Verificar se há erros nos logs
sudo journalctl -u dayz-rabbitmq-consumers | grep ERROR
```

