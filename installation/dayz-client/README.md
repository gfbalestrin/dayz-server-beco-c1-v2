# Servidor de Monitoramento DayZ - Beco Gaming

Este diretório contém todos os arquivos necessários para o servidor de monitoramento separado, que consome mensagens do RabbitMQ enviadas pelo servidor DayZ e executa a interface administrativa Flask.

## 📋 Visão Geral

O servidor de monitoramento é responsável por:

- **Consumir mensagens do RabbitMQ** enviadas pelo servidor DayZ
- **Armazenar dados em bancos SQLite** (players, logs, vehicles, containers, structures)
- **Executar interface administrativa Flask** para visualização e gerenciamento dos dados
- **Processar e analisar logs** do servidor DayZ em tempo real

## 🏗️ Estrutura

```
dayz-client/
├── scripts/
│   ├── consumers/              # Consumers RabbitMQ
│   │   ├── logs_consumer.py
│   │   ├── positions_consumer.py
│   │   ├── consumer_manager.py
│   │   ├── test_consumer.sh
│   │   ├── dayz-rabbitmq-consumers.service
│   │   └── README.md
│   ├── admin-interface/        # Interface Flask
│   │   ├── app.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── requirements.txt
│   │   ├── start.sh
│   │   ├── blueprints/
│   │   ├── templates/
│   │   ├── static/
│   │   └── README.md
│   ├── config.json             # Configuração principal
│   └── setup.sh                # Script de instalação
├── databases/                   # Bancos SQLite (criados automaticamente)
│   ├── players_beco_c1.db
│   ├── server_beco_c1_logs.db
│   ├── vehicles_beco_c1.db
│   ├── containers_beco_c1.db
│   └── structures_beco_c1.db
└── README.md                    # Este arquivo
```

## 🚀 Instalação Rápida

### 1. Executar Script de Setup

```bash
cd installation/dayz-client/scripts
chmod +x setup.sh
./setup.sh
```

O script irá:
- Verificar e instalar dependências do sistema
- Instalar dependências Python
- Criar diretórios necessários
- Criar bancos de dados SQLite
- Configurar permissões

### 2. Configurar RabbitMQ

Edite `scripts/config.json` e configure as credenciais do RabbitMQ:

```json
{
  "RabbitMQ": {
    "Host": "localhost",
    "Port": 5672,
    "Username": "dayz_consumer",
    "Password": "sua_senha_segura",
    "VHost": "dayz",
    "Exchange": "dayz.events",
    "Enabled": true
  }
}
```

### 3. Configurar RabbitMQ no Sistema

```bash
# Criar vhost
sudo rabbitmqctl add_vhost dayz

# Criar usuário consumer
sudo rabbitmqctl add_user dayz_consumer sua_senha_segura
sudo rabbitmqctl set_permissions -p dayz dayz_consumer ".*" ".*" ".*"

# Inserface web
rabbitmq-plugins enable rabbitmq_management
systemctl restart rabbitmq-server
rabbitmqctl add_user admin 123456
rabbitmqctl set_user_tags admin administrator
rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"
```

### 4. Iniciar Consumers

#### Opção A: Manualmente

```bash
cd installation/dayz-client/scripts/consumers
python3 consumer_manager.py
```

#### Opção B: Como Serviço Systemd

```bash
# Instalar serviço
sudo cp installation/dayz-client/scripts/consumers/dayz-rabbitmq-consumers.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dayz-rabbitmq-consumers
sudo systemctl start dayz-rabbitmq-consumers

# Verificar status
sudo systemctl status dayz-rabbitmq-consumers

# Ver logs
sudo journalctl -u dayz-rabbitmq-consumers -f
```

### 5. Iniciar Interface Administrativa

```bash
cd installation/dayz-client/scripts/admin-interface
./start.sh
```

A interface estará disponível em: `http://SEU_IP:5000`

**Credenciais padrão:**
- Usuário: `admin`
- Senha: `dayz_beco_2024`

## 📚 Documentação Detalhada

### Consumers RabbitMQ

Consulte `scripts/consumers/README.md` para:
- Detalhes sobre cada consumer
- Configuração avançada
- Troubleshooting

### Interface Administrativa

Consulte `scripts/admin-interface/README.md` para:
- Funcionalidades da interface
- Configuração da aplicação Flask
- Uso e navegação

## 🔧 Configuração

### config.json

O arquivo `scripts/config.json` contém todas as configurações principais:

- **RabbitMQ**: Configurações de conexão com o broker
- **Flask**: Configurações do servidor web
- **Admin**: Credenciais de acesso

### config.py

O arquivo `scripts/admin-interface/config.py` contém configurações específicas da aplicação Flask:

- Paths dos bancos de dados
- Configurações de paginação
- Secret keys
- Configurações de sessão

## 🧪 Testes

### Testar Consumers

```bash
cd installation/dayz-client/scripts/consumers
./test_consumer.sh
```

O script testa:
- Dependências instaladas
- Configuração correta
- Conectividade RabbitMQ
- Estrutura dos bancos de dados
- Conexão dos consumers

## 📊 Monitoramento

### Verificar Status dos Consumers

```bash
# Via systemd
sudo systemctl status dayz-rabbitmq-consumers

# Via processos
ps aux | grep consumer

# Via logs
sudo journalctl -u dayz-rabbitmq-consumers -f
```

### Verificar Filas RabbitMQ

```bash
# Listar filas
sudo rabbitmqctl list_queues -p dayz

# Ver mensagens em uma fila
sudo rabbitmqctl list_queues -p dayz name messages

# Verificar exchanges
sudo rabbitmqctl list_exchanges -p dayz
```

### Verificar Bancos de Dados

```bash
# Verificar tamanho dos bancos
ls -lh installation/dayz-client/databases/

# Verificar estrutura de uma tabela
sqlite3 installation/dayz-client/databases/server_beco_c1_logs.db ".tables"
sqlite3 installation/dayz-client/databases/server_beco_c1_logs.db ".schema logs_custom"
```

## 🐛 Troubleshooting

### Problema: Consumers não conectam ao RabbitMQ

1. Verifique se o RabbitMQ está rodando: `sudo systemctl status rabbitmq-server`
2. Verifique as credenciais no `config.json`
3. Verifique se o vhost existe: `sudo rabbitmqctl list_vhosts`
4. Verifique permissões do usuário: `sudo rabbitmqctl list_permissions -p dayz`

### Problema: Mensagens não estão sendo processadas

1. Verifique se os consumers estão rodando
2. Verifique se há mensagens nas filas: `sudo rabbitmqctl list_queues -p dayz name messages`
3. Verifique os logs dos consumers: `sudo journalctl -u dayz-rabbitmq-consumers -f`
4. Execute o script de teste: `./scripts/consumers/test_consumer.sh`

### Problema: Interface Flask não inicia

1. Verifique se as dependências estão instaladas: `pip3 list`
2. Verifique se a porta 5000 está disponível: `netstat -tuln | grep 5000`
3. Verifique os logs de erro no terminal
4. Verifique se os bancos de dados existem e têm permissões corretas

### Problema: Bancos de dados não são criados

1. Verifique se o diretório `databases/` existe e tem permissões de escrita
2. Verifique se os consumers têm permissão para criar arquivos
3. Execute manualmente: `touch installation/dayz-client/databases/players_beco_c1.db`

## 🔐 Segurança

### Recomendações

1. **Altere as credenciais padrão** em `config.json` e `config.py`
2. **Use senhas fortes** para RabbitMQ e Flask
3. **Configure firewall** para proteger a porta 5000 (Flask)
4. **Use HTTPS** em produção (configure um reverse proxy como nginx)
5. **Mantenha o sistema atualizado**: `sudo apt update && sudo apt upgrade`

### Firewall

```bash
# Permitir apenas IPs específicos acessarem a porta 5000
sudo ufw allow from SEU_IP to any port 5000
sudo ufw enable
```

## 📝 Logs

### Logs dos Consumers

```bash
# Via systemd
sudo journalctl -u dayz-rabbitmq-consumers -f

# Via arquivo (se configurado)
tail -f /var/log/dayz-consumers.log
```

### Logs da Interface Flask

Os logs são exibidos no terminal onde a aplicação está rodando. Para salvar em arquivo:

```bash
cd installation/dayz-client/scripts/admin-interface
python3 app.py > ../logs/flask.log 2>&1 &
```

## 🔄 Atualização

Para atualizar o servidor de monitoramento:

1. Pare os serviços:
   ```bash
   sudo systemctl stop dayz-rabbitmq-consumers
   # Pare a interface Flask manualmente se estiver rodando
   ```

2. Faça backup dos bancos de dados:
   ```bash
   cp -r installation/dayz-client/databases installation/dayz-client/databases.backup
   ```

3. Atualize os arquivos do repositório

4. Execute o setup novamente:
   ```bash
   cd installation/dayz-client/scripts
   ./setup.sh
   ```

5. Reinicie os serviços:
   ```bash
   sudo systemctl start dayz-rabbitmq-consumers
   ```

## 📞 Suporte

Para problemas ou dúvidas:

1. Consulte a documentação específica em cada subdiretório
2. Execute os scripts de teste
3. Verifique os logs do sistema
4. Consulte a documentação do projeto principal

---

**Beco Gaming** - Servidor de Monitoramento DayZ

