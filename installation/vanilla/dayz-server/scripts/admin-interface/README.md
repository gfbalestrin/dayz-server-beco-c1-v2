# Interface Administrativa DayZ - Beco Gaming

Interface web para gerenciamento e visualização dos dados do servidor DayZ.

## 🎯 Funcionalidades

- ✅ **Jogadores**: Visualização completa de jogadores registrados
- ✅ **Coordenadas**: Rastreamento de posições dos jogadores com histórico de backups
- ✅ **Logs Administrativos**: Monitoramento de logs do sistema
- ✅ **Logs Customizados**: Visualização de logs personalizados
- ✅ **Veículos**: Tracking de veículos do servidor
- ✅ **Filtros Avançados**: Busca e filtros em todas as tabelas
- ✅ **Interface Responsiva**: Design moderno com Bootstrap 5

## 📋 Requisitos

- Python 3.7 ou superior
- pip3
- Navegador web moderno

## 🚀 Instalação e Uso

### Método 1: Script Automático (Recomendado)

```bash
cd installation/vanilla/dayz-server/scripts/admin-interface
chmod +x start.sh
./start.sh
```

### Método 2: Instalação Manual

```bash
cd installation/vanilla/dayz-server/scripts/admin-interface

# Criar ambiente virtual
python3 -m venv venv

# Ativar ambiente virtual
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Executar aplicação
python3 app.py
```

## 🔐 Acesso

Após iniciar o servidor, acesse:

**URL**: `http://SEU_IP:5000`

**Credenciais Padrão:**
- Usuário: `admin`
- Senha: `dayz_beco_2024`

⚠️ **IMPORTANTE**: Altere as credenciais em `config.py` antes de usar em produção!

## ⚙️ Configuração

Edite o arquivo `config.py` para personalizar:

```python
# Credenciais de acesso
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "sua_senha_segura"

# Porta do servidor
PORT = 5000

# Host (0.0.0.0 permite acesso externo)
HOST = "0.0.0.0"
```

## 📊 Bancos de Dados Suportados

- **players_beco_c1.db**: Banco de jogadores
- **server_beco_c1_logs.db**: Banco de logs

## 🔧 Estrutura de Pastas

```
admin-interface/
├── app.py                 # Aplicação Flask
├── config.py              # Configurações
├── database.py            # Camada de dados
├── requirements.txt       # Dependências
├── start.sh              # Script de inicialização
├── templates/            # Templates HTML
│   ├── base.html
│   ├── login.html
│   ├── index.html
│   ├── players.html
│   ├── player_coords.html
│   ├── logs_adm.html
│   ├── logs_custom.html
│   ├── vehicles.html
│   └── error.html
└── static/               # Assets estáticos
    ├── css/
    └── js/
```

## 🌐 Rodar em Background

### Opção 1: Usando nohup

```bash
nohup python3 app.py > admin-interface.log 2>&1 &
```

### Opção 2: Usando screen

```bash
screen -dmS dayz-admin python3 app.py
```

## 🔍 Filtros e Busca

Todas as tabelas suportam:

- 🔍 **Busca em tempo real**
- 📅 **Filtros por data/período**
- 📊 **Ordenação por qualquer coluna**
- 📄 **Paginação automática**
- 📥 **Exportação de dados**

## 🛡️ Segurança

- Autenticação via sessão Flask
- Todas as operações são READ-ONLY
- Proteção contra SQL Injection
- Secret key configurável

## 📝 Logs

Os logs da aplicação são exibidos no terminal/console onde o servidor está rodando.

## 🐛 Troubleshooting

### Problema: "Database não encontrado"

Verifique se os bancos existem em:
- `../databases/players_beco_c1.db`
- `../databases/server_beco_c1_logs.db`

### Problema: "Porta já em uso"

Altere a porta em `config.py`:

```python
PORT = 5001  # ou outra porta disponível
```

### Problema: Importação falha

Certifique-se de que o ambiente virtual está ativado:

```bash
source venv/bin/activate
```

## 📞 Suporte

Para problemas ou sugestões, consulte a documentação do projeto.

---

**Beco Gaming** - DayZ Server Admin Interface
