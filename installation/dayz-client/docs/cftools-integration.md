# Integração CFTools Cloud

## Visão Geral

A integração com o CFTools Cloud permite obter dados adicionais dos jogadores conectados ao servidor DayZ, incluindo informações de segurança (VAC bans, game bans), dados de conexão (país, provedor, IP malicioso) e perfil Steam.

Esta integração é **totalmente opcional** - o sistema continua funcionando normalmente se o CFTools não estiver configurado ou se houver falhas na comunicação com a API.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PlayersProcessor                             │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Jogador      │───▶│ _update_     │───▶│ _sync_cftools_data() │  │
│  │ Conecta      │    │ players_     │    │ (não bloqueante)     │  │
│  │              │    │ online()     │    │                      │  │
│  └──────────────┘    └──────────────┘    └──────────┬───────────┘  │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CFToolsClient                                │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ authenticate │───▶│ get_gsm_list │───▶│ sync_all_online_     │  │
│  │ ()           │    │ ()           │    │ players()            │  │
│  └──────────────┘    └──────────────┘    └──────────┬───────────┘  │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                      ┌────────────────────────────────┼────────────────┐
                      │                                │                │
                      ▼                                ▼                ▼
            ┌─────────────────┐            ┌─────────────────┐  ┌──────────────┐
            │ CFTools Cloud   │            │ players_cftools │  │ players_     │
            │ API             │            │ (tabela)        │  │ cftools_     │
            │                 │            │                 │  │ sessions     │
            └─────────────────┘            └─────────────────┘  └──────────────┘
```

---

## Configuração

### 1. Obter Credenciais no CFTools

1. Acesse [CFTools Cloud](https://app.cftools.cloud/)
2. Vá em **Developer** → **Applications**
3. Crie uma nova aplicação ou use uma existente
4. Copie o **Application ID** e **Secret**
5. Em **Grants**, adicione seu servidor e copie o **Server API ID** (UUID)

### 2. Configurar config.json

Edite o arquivo `installation/dayz-client/scripts/config.json`:

```json
{
  "CFTools": {
    "Enabled": true,
    "BaseUrl": "https://data.cftools.cloud",
    "AppId": "SEU_APPLICATION_ID",
    "AppSecret": "SEU_APPLICATION_SECRET",
    "ServerApiId": "SEU_SERVER_API_ID_UUID",
    "GameId": "1",
    "ServerIP": "IP_DO_SERVIDOR",
    "ServerPort": "PORTA_DO_SERVIDOR",
    "TokenCacheFile": "/tmp/cftools_token.json",
    "SyncOnConnect": true,
    "SyncIntervalMinutes": 5
  }
}
```

### Parâmetros

| Parâmetro | Descrição | Obrigatório |
|-----------|-----------|-------------|
| `Enabled` | Habilita/desabilita a integração | Sim |
| `BaseUrl` | URL base da API CFTools | Não (padrão já definido) |
| `AppId` | Application ID do CFTools | Sim |
| `AppSecret` | Application Secret do CFTools | Sim |
| `ServerApiId` | UUID do servidor (grants) | Sim |
| `GameId` | ID do jogo (1 = DayZ) | Não |
| `ServerIP` | IP público do servidor | Não |
| `ServerPort` | Porta do servidor | Não |
| `TokenCacheFile` | Arquivo para cache do token | Não |
| `SyncOnConnect` | Sincronizar ao conectar | Não |
| `SyncIntervalMinutes` | Intervalo de sincronização | Não |

### 3. Criar Tabelas no Banco de Dados

Execute o SQL em `installation/dayz-client/databases/players_beco_c1.sql` no banco `players_beco_c1.db` para criar as tabelas:

```bash
sqlite3 databases/players_beco_c1.db < databases/players_beco_c1.sql
```

Ou execute apenas as tabelas CFTools:

```sql
-- Tabela principal de dados CFTools
CREATE TABLE IF NOT EXISTS players_cftools (
    PlayerID TEXT PRIMARY KEY NOT NULL,
    CFToolsId TEXT,
    Steam64 TEXT,
    CountryCode TEXT,
    IPAddress TEXT,
    IsMalicious INTEGER DEFAULT 0,
    Provider TEXT,
    VACBans INTEGER DEFAULT 0,
    GameBans INTEGER DEFAULT 0,
    CommunityBan INTEGER DEFAULT 0,
    EconomyBan TEXT,
    LastBanDays INTEGER DEFAULT 0,
    CFToolsBanCount INTEGER DEFAULT 0,
    RadarDetection TEXT,
    Labels TEXT,
    SteamProfileName TEXT,
    SteamAvatarUrl TEXT,
    IsProfilePrivate INTEGER DEFAULT 0,
    LastSessionId TEXT,
    LastSessionStart DATETIME,
    LastPing INTEGER,
    LastLoadTime REAL,
    FirstSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
    LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdateCount INTEGER DEFAULT 0,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Histórico de sessões
CREATE TABLE IF NOT EXISTS players_cftools_sessions (
    SessionId INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerID TEXT NOT NULL,
    CFToolsSessionId TEXT NOT NULL,
    SessionStart DATETIME NOT NULL,
    SessionEnd DATETIME,
    IPAddress TEXT,
    CountryCode TEXT,
    IsMalicious INTEGER DEFAULT 0,
    Provider TEXT,
    InitialPing INTEGER,
    FinalPing INTEGER,
    LoadTime REAL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);
```

---

## Dados Coletados

### Tabela `players_cftools`

| Campo | Descrição | Utilidade |
|-------|-----------|-----------|
| `CFToolsId` | ID único no CFTools | Identificação cross-server |
| `Steam64` | Steam64 ID | Vinculação com Steam |
| `CountryCode` | Código do país (BR, US) | Geolocalização |
| `IPAddress` | IP do jogador | Rastreamento |
| `IsMalicious` | IP malicioso (VPN/proxy) | **Detecção de cheaters** |
| `Provider` | ISP do jogador | Informação adicional |
| `VACBans` | Número de VAC bans | **Histórico de cheater** |
| `GameBans` | Número de game bans | **Histórico de cheater** |
| `CommunityBan` | Ban da comunidade Steam | Reputação |
| `EconomyBan` | Ban de economia Steam | Reputação |
| `LastBanDays` | Dias desde último ban | **Risco recente** |
| `CFToolsBanCount` | Bans no CFTools | **Histórico no CFTools** |
| `RadarDetection` | Detecção de radar/ESP | **Cheat detection** |
| `Labels` | Tags/labels do CFTools | Categorização |
| `SteamProfileName` | Nome no Steam | Comparação |
| `SteamAvatarUrl` | URL do avatar | Visual |
| `IsProfilePrivate` | Perfil privado | **Cheaters escondem perfil** |
| `LastSessionId` | ID da sessão atual | Comandos (kick) |

### Tabela `players_cftools_sessions`

Histórico de todas as sessões do jogador com dados de conexão.

---

## Fluxo de Execução

### 1. Inicialização

```
PlayersProcessor.__init__()
    └── _init_cftools()
        ├── Verifica CFTOOLS_AVAILABLE (módulo importado?)
        ├── Verifica CFTOOLS_ENABLED (config.json)
        ├── Valida credenciais (AppId, AppSecret, ServerApiId)
        └── Cria instância de CFToolsClient
```

### 2. Jogador Conecta

```
PlayersProcessor.process()
    └── _update_players_online()
        ├── Detecta jogadores conectados (connect_players)
        ├── Processa Discord e eventos
        ├── Atualiza geolocalização (RCON)
        └── _sync_cftools_data(connect_players)  ◄── CFTools
            ├── Busca SteamIDs dos jogadores
            └── CFToolsClient.sync_all_online_players()
                ├── authenticate() (com cache de token)
                ├── get_gsm_list() (lista de sessões)
                └── _upsert_cftools_data() (salva no banco)
```

### 3. Autenticação CFTools

```
CFToolsClient.authenticate()
    ├── Tenta carregar token do cache (válido por 23h30m)
    │   └── Se válido, usa token cacheado
    └── Se não, registra novo token
        ├── POST /v1/auth/register
        └── Salva token no cache
```

---

## Tratamento de Erros

A integração foi projetada para **nunca bloquear** o sistema principal:

### Camada 1: Importação
```python
try:
    from ..cftools import CFToolsClient
    CFTOOLS_AVAILABLE = True
except ImportError:
    CFTOOLS_AVAILABLE = False  # Continua sem CFTools
```

### Camada 2: Inicialização
```python
def _init_cftools(self):
    if not CFTOOLS_AVAILABLE:
        return  # Silenciosamente ignora

    if not cftools_enabled:
        return  # Desabilitado na config

    try:
        self.cftools_client = CFToolsClient(...)
    except Exception as e:
        logger.warning(f"Erro: {e}")
        self.cftools_client = None  # Continua sem CFTools
```

### Camada 3: Sincronização
```python
def _sync_cftools_data(self, connect_players):
    if not self.cftools_client:
        return  # Sem cliente, ignora

    try:
        # Sincroniza dados
    except Exception as e:
        logger.warning(f"Erro (não crítico): {e}")
        # Não propaga exceção - sistema continua
```

### Camada 4: Chamada
```python
# Em _update_players_online()
try:
    self._sync_cftools_data(connect_players)
except Exception as e:
    logger.warning(f"Erro ao sincronizar CFTools (não crítico): {e}")
    # Sistema continua normalmente
```

---

## Logs

### Sucesso
```
INFO  CFTools: Cliente inicializado com sucesso
INFO  CFTools: 5 jogadores sincronizados
```

### Desabilitado/Não Configurado
```
DEBUG CFTools: Desabilitado na configuração
DEBUG CFTools: Módulo não disponível
WARNING CFTools: Configurações incompletas (AppId, AppSecret ou ServerApiId)
```

### Erros (não bloqueantes)
```
WARNING CFTools: Falha ao autenticar
WARNING CFTools API HTTP error 401: Unauthorized
WARNING CFTools: Erro ao sincronizar dados (não crítico): ...
```

---

## Consultas Úteis

### Jogadores Suspeitos (VAC/Game Bans)
```sql
SELECT
    p.PlayerName,
    c.Steam64,
    c.VACBans,
    c.GameBans,
    c.LastBanDays,
    c.IsMalicious,
    c.IsProfilePrivate
FROM players_cftools c
JOIN players_database p ON c.PlayerID = p.PlayerID
WHERE c.VACBans > 0 OR c.GameBans > 0 OR c.IsMalicious = 1
ORDER BY c.VACBans + c.GameBans DESC;
```

### Jogadores com IP Malicioso (VPN/Proxy)
```sql
SELECT
    p.PlayerName,
    c.IPAddress,
    c.Provider,
    c.CountryCode
FROM players_cftools c
JOIN players_database p ON c.PlayerID = p.PlayerID
WHERE c.IsMalicious = 1;
```

### Histórico de Sessões de um Jogador
```sql
SELECT
    SessionStart,
    SessionEnd,
    IPAddress,
    CountryCode,
    InitialPing
FROM players_cftools_sessions
WHERE PlayerID = 'PLAYER_ID_AQUI'
ORDER BY SessionStart DESC
LIMIT 10;
```

### Jogadores com Perfil Privado e Bans
```sql
SELECT
    p.PlayerName,
    c.SteamProfileName,
    c.VACBans,
    c.GameBans,
    c.CFToolsBanCount
FROM players_cftools c
JOIN players_database p ON c.PlayerID = p.PlayerID
WHERE c.IsProfilePrivate = 1
  AND (c.VACBans > 0 OR c.GameBans > 0 OR c.CFToolsBanCount > 0);
```

---

## Estrutura de Arquivos

```
installation/dayz-client/
├── scripts/
│   ├── config.json                          # Configuração CFTools
│   ├── admin-interface/
│   │   └── config.py                        # Carrega CFTOOLS_*
│   └── consumers/
│       └── positions_consumer/
│           ├── cftools/
│           │   ├── __init__.py              # Exporta CFToolsClient
│           │   └── client.py                # Cliente da API
│           └── processors/
│               └── players.py               # Integração
├── databases/
│   ├── players_beco_c1.sql                  # Schema com tabelas CFTools
│   └── players_beco_c1.db                   # Banco de dados
└── docs/
    └── cftools-integration.md               # Esta documentação
```

---

## Troubleshooting

### CFTools não está sincronizando

1. Verifique se `Enabled` está `true` no config.json
2. Verifique os logs por mensagens `CFTools:`
3. Confirme que AppId, AppSecret e ServerApiId estão corretos
4. Verifique se o servidor tem acesso à internet

### Erro de autenticação (401)

1. Verifique se o AppSecret está correto
2. Regenere o secret no painel CFTools
3. Verifique se a aplicação tem permissão no servidor

### Jogadores não aparecem nas sessões

1. O jogador precisa estar online no momento da sincronização
2. Verifique se o SteamID está preenchido em `players_database`
3. A sincronização ocorre apenas quando o jogador conecta

### Token expirando frequentemente

O token é válido por 24h e cacheado por 23h30m. Se estiver expirando antes:
1. Verifique permissões de escrita em `TokenCacheFile`
2. Verifique se o path é persistente (não use /tmp em containers efêmeros)
