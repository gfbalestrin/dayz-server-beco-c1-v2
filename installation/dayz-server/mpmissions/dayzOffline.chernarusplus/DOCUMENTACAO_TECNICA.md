# Documentação Técnica - Servidor DayZ Enforce Script

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Padrões de Código e Convenções](#2-padrões-de-código-e-convenções)
3. [Sistema de Logging](#3-sistema-de-logging)
4. [Sistema de Eventos](#4-sistema-de-eventos)
5. [Gerenciamento de Jogadores](#5-gerenciamento-de-jogadores)
6. [Sistema de Comandos](#6-sistema-de-comandos)
7. [Integrações Externas](#7-integrações-externas)
8. [Sistema de Tracking](#8-sistema-de-tracking)
9. [Sistema de Loadouts](#9-sistema-de-loadouts)
10. [Sistema de Deathmatch](#10-sistema-de-deathmatch)
11. [Modelos de Dados](#11-modelos-de-dados)
12. [Funções Utilitárias](#12-funções-utilitárias)
13. [Técnicas Avançadas](#13-técnicas-avançadas)
14. [Boas Práticas](#14-boas-práticas)
15. [Exemplos de Código](#15-exemplos-de-código)
16. [Glossário](#16-glossário)

---

## 1. Visão Geral

### 1.1 Arquitetura do Sistema

O servidor DayZ customizado utiliza uma arquitetura modular baseada em Enforce Script, com os seguintes componentes principais:

- **init.c**: Ponto de entrada principal que inicializa a classe `CustomMission` e inclui todos os módulos
- **admin/**: Diretório contendo todos os módulos customizados
  - **MainCustom.c**: Função `main()` que inicializa o servidor
  - **Globals.c**: Variáveis globais, constantes e enums
  - **Log.c**: Sistema de logging centralizado
  - **Functions.c**: Funções utilitárias reutilizáveis
  - **Commands.c**: Sistema de processamento de comandos
  - **OnEventCustom.c**: Tratamento de eventos do DayZ
  - **ExternalActions.c**: Comunicação com sistemas externos
  - **models/**: Classes de modelo de dados
  - Módulos especializados (Tracking, Loadouts, Deathmatch, etc)

### 1.2 Estrutura de Diretórios

```
dayzOffline.chernarusplus/
├── init.c                          # Arquivo principal
└── admin/
    ├── MainCustom.c                # Inicialização
    ├── Globals.c                  # Variáveis globais
    ├── Log.c                      # Sistema de logs
    ├── Functions.c                # Funções utilitárias
    ├── Commands.c                 # Sistema de comandos
    ├── OnEventCustom.c           # Eventos customizados
    ├── ExternalActions.c          # Ações externas
    ├── Messages.c                # Sistema de mensagens
    ├── PlayersLoadout.c          # Gerenciamento de loadouts
    ├── VehicleSpawner.c          # Spawn de veículos
    ├── Construction.c             # Construção de objetos
    ├── VoteMapManager.c          # Votação de mapas
    ├── VoteKickManager.c         # Votação de kick
    ├── DeathMatchConfig.c        # Configuração deathmatch
    ├── WorldTracking.c           # Tracking geral
    ├── VehicleTracking.c         # Tracking de veículos
    ├── FencesTracking.c         # Tracking de cercas
    ├── LootTracking.c            # Tracking de loot
    ├── files/                    # Arquivos de comunicação
    │   ├── admin_ids.txt
    │   ├── commands_to_execute.txt
    │   ├── commands_results.txt
    │   ├── external_actions.txt
    │   ├── messages_to_send.txt
    │   └── messages_private_to_send.txt
    ├── loadouts/                 # Configurações de loadouts
    │   ├── custom.json
    │   ├── players_ids.json
    │   └── players/
    └── models/                   # Modelos de dados
        ├── ActivePlayer.c
        ├── SafeZoneData.c
        ├── LoadoutPlayer.c
        └── LoadoutPlayerId.c
```

### 1.3 Fluxo de Inicialização

```
main() [MainCustom.c]
  ├── CreateHive() e InitOffline()
  ├── Ajuste de data/horário
  └── Configuração de clima (se deathmatch)

CustomMission() [init.c]
  ├── ResetLog()
  ├── EnsureAllFilesExist()
  ├── Carrega configuração deathmatch (se habilitado)
  ├── Inicializa VoteMapManager e VoteKickManager
  └── Constrói wallzones (se configurado)

OnInit() [init.c]
  ├── InitWorldTracking() (após 5s)
  ├── SendStartEvent() (após 5s)
  └── SpawnConfiguredVehiclesFromConfig() (após 3s)

OnMissionStart() [init.c]
  ├── InitializeVestGrenadeSlots()
  └── Inicializa ActivePlayers array
```

### 1.4 Modos de Operação

O servidor suporta dois modos de operação controlados pela variável global `IsDeathmatchEnabled`:

**Modo Vanilla (IsDeathmatchEnabled = false)**
- Servidor tradicional DayZ
- Persistência de dados via Hive
- Loadouts customizados por jogador
- Sistema de admin básico

**Modo Deathmatch (IsDeathmatchEnabled = true)**
- Servidor PvP com zonas seguras
- Sistema de votação de mapas
- Sistema de votação de kick
- Spawn zones configuráveis
- Wall zones (barreiras)
- Clima sempre limpo
- Horário fixo (06:00)

---

## 2. Padrões de Código e Convenções

### 2.1 Nomenclatura

#### Variáveis
- **CamelCase** para variáveis locais: `playerName`, `steamId`, `currentPos`
- **m_** prefixo para variáveis de membro de classe: `m_AdminCheckTimer10`, `m_IsProcessingCommands`
- **g_** prefixo para variáveis globais: `g_VoteMapManager`, `g_VoteKickManager`
- **s_** prefixo para variáveis estáticas: `s_FirstSeenWeapon`
- **Constantes**: UPPER_SNAKE_CASE: `PLAYER_TIMEOUT`, `CLEAN_RADIUS_M`

#### Funções
- **PascalCase** para nomes de funções: `GetPlayerById()`, `SendPrivateMessage()`, `CheckCommands()`
- Verbos no início: `Create`, `Get`, `Set`, `Check`, `Send`, `Register`, `Clean`

#### Classes
- **PascalCase**: `ActivePlayer`, `SafeZoneData`, `LoadoutPlayer`, `ItemAttachmentData`

### 2.2 Estrutura de Classes

```c
class NomeClasse
{
    // Membros privados primeiro
    Tipo membroPrivado;
    
    // Construtor
    void NomeClasse()
    {
        // Inicialização
    }
    
    // Métodos públicos
    Tipo MetodoPublico()
    {
        // Implementação
    }
}
```

### 2.3 Gerenciamento de Memória

#### Arrays
- Sempre usar `ref array<Tipo>` para arrays que precisam persistir
- Inicializar antes de usar: `ref array<string> msgs = new array<string>();`
- Verificar null antes de usar: `if (!ActivePlayers) return;`

#### Maps
- Usar `ref map<Key, Value>` para estruturas chave-valor
- Inicializar: `ref map<string, int> PendingDisconnects = new map<string, int>();`
- Verificar existência: `if (PendingDisconnects && PendingDisconnects.Contains(key))`

#### Sets
- Usar `ref set<Tipo>` para coleções sem duplicatas
- Inicializar: `ref set<string> observedPlayerIds = new set<string>();`

### 2.4 Tratamento de Erros e Logs

**Padrão de verificação:**
```c
if (!player)
{
    WriteToLog("Função(): player é null", LogFile.INIT, false, LogType.ERROR);
    return;
}
```

**Padrão de log:**
```c
WriteToLog("NomeFunção(): Descrição da ação", LogFile.INIT, false, LogType.INFO);
```

### 2.5 Comentários e Documentação

- Comentários em português
- Seções delimitadas com `// ============`
- Documentação de parâmetros e retornos quando necessário
- Comentários explicativos para lógicas complexas

---

## 3. Sistema de Logging

### 3.1 Função WriteToLog()

A função central de logging está definida em `admin/Log.c`:

```c
void WriteToLog(string content, LogFile file = LogFile.INIT, bool internalCall = false, LogType type = LogType.DEBUG)
```

**Parâmetros:**
- `content`: Mensagem a ser logada
- `file`: Arquivo de log (LogFile.INIT ou LogFile.POSITION)
- `internalCall`: Flag para evitar loops infinitos
- `type`: Nível de log (DEBUG, INFO, WARNING, ERROR)

**Exemplo:**
```c
WriteToLog("CreateCharacter(): Jogador criado: " + playerName, LogFile.INIT, false, LogType.INFO);
```

### 3.2 Arquivos de Log

- **init.log**: Log principal do servidor (em `$profile:init.log`)
- **position.log**: Log de posições capturadas (em `$profile:position.log`)

### 3.3 Níveis de Log

```c
enum LogType
{
    DEBUG,    // Informações de depuração
    WARNING,  // Avisos (não críticos)
    ERROR,    // Erros que precisam atenção
    INFO      // Informações gerais
}
```

**Uso por contexto:**
- `DEBUG`: Informações detalhadas para depuração
- `INFO`: Eventos normais do sistema
- `WARNING`: Situações anômalas mas não críticas
- `ERROR`: Erros que impedem funcionalidade

### 3.4 Padrões de Mensagens de Log

**Formato padrão:**
```
[NomeFunção()]: Descrição da ação | Dados adicionais
```

**Exemplos:**
```c
WriteToLog("GetPlayerById(): Jogador encontrado: " + playerName, LogFile.INIT, false, LogType.DEBUG);
WriteToLog("ExecuteCommand(): Comando desconhecido: " + command, LogFile.INIT, false, LogType.ERROR);
WriteToLog("RegisterVehicle(): Veículo " + vehicleName + " adicionado em " + position.ToString(), LogFile.INIT, false, LogType.INFO);
```

### 3.5 Reset de Log

```c
void ResetLog(string logfile = "init.log")
```

Limpa o arquivo de log no início da execução para evitar arquivos muito grandes.

---

## 4. Sistema de Eventos

### 4.1 OnEventCustom()

A função `OnEventCustom()` em `admin/OnEventCustom.c` é chamada pelo `OnEvent()` da classe `CustomMission` e trata todos os eventos do DayZ.

**Estrutura básica:**
```c
void OnEventCustom(EventType eventTypeId, Param params)
{
    if (eventTypeId == ClientConnectedEventTypeID)
    {
        // Tratamento do evento
    }
    else if (eventTypeId == ClientDisconnectedEventTypeID)
    {
        // Tratamento do evento
    }
    // ... outros eventos
}
```

### 4.2 Eventos de Conexão/Desconexão

#### ClientConnectedEventTypeID
- **Quando**: Cliente se conecta ao servidor (antes de spawn)
- **Params**: `ClientConnectedEventParams` (nome, steamId)
- **Uso**: Validação inicial, não adiciona à lista ainda

#### ClientDisconnectedEventTypeID
- **Quando**: Cliente inicia desconexão (não confirma desconexão)
- **Params**: `ClientDisconnectedEventParams` (identity, player, logoutTime, authFailed)
- **Uso**: Marca desconexão como pendente em `PendingDisconnects`

#### ClientReadyEventTypeID
- **Quando**: Cliente totalmente carregado e pronto
- **Params**: `ClientReadyEventParams` (identity, player)
- **Uso**: Adiciona jogador à lista `ActivePlayers` via `ProcessPlayerReady()`

#### ClientNewEventTypeID
- **Quando**: Novo jogador (primeira vez) entra
- **Params**: `ClientNewEventParams` (identity, position, serializer)
- **Uso**: Processa novo jogador

### 4.3 Eventos de Jogador

#### PlayerDeathEventTypeID
- **Quando**: Jogador morre
- **Params**: `PlayerDeathEventParams` (player, killer)
- **Uso**: Marca jogador como morto recentemente para evitar `player_disconnected` após morte

#### ClientRespawnEventTypeID
- **Quando**: Jogador respawna após morte
- **Params**: `ClientRespawnEventParams` (identity)
- **Uso**: Limpa flag de morte, não envia `player_connected` novamente

#### LogoutEventTypeID / ScriptLogEventTypeID
- **Quando**: Logout confirmado via log do sistema
- **Uso**: Remove jogador de `ActivePlayers` e envia `player_disconnected`

### 4.4 Eventos de Chat

#### ChatMessageEventTypeID
- **Quando**: Mensagem de chat enviada
- **Params**: `ChatMessageEventParams` (channel, from, text, colorClass)
- **Uso**: Detecta comandos iniciados com `!` e chama `CheckCommands()`

### 4.5 Padrão de Tratamento de Eventos

```c
else if (eventTypeId == NomeEventoTypeID)
{
    WriteToLog("EVENT: NomeEventoTypeID - Descrição", LogFile.INIT, false, LogType.INFO);
    NomeEventParams params = NomeEventParams.Cast(params);
    if (!params) {
        WriteToLog("NomeEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
        return;
    }
    
    // Processamento do evento
}
```

---

## 5. Gerenciamento de Jogadores

### 5.1 Classe ActivePlayer

A classe `ActivePlayer` (em `admin/models/ActivePlayer.c`) representa um jogador conectado:

```c
class ActivePlayer
{
    PlayerIdentity Identity;           // Identidade do jogador
    Man Player;                        // Objeto físico do jogador
    float ConnectedTime;               // Timestamp de conexão
    float DeathTime;                   // Timestamp de morte (0 se vivo)
    bool HasSentConnectedEvent;        // Flag para evitar duplicatas
    string SteamId;                    // SteamID persistente
    string PlayerId;                   // PlayerID persistente
}
```

**Métodos principais:**
- `GetIdentity()`: Retorna PlayerIdentity
- `GetPlayer()`: Retorna objeto Man/PlayerBase
- `GetPlayerName()`: Retorna nome do jogador
- `GetSteamId()`: Retorna SteamID
- `GetPlayerId()`: Retorna PlayerID
- `IsSamePlayer(string steamId)`: Compara por SteamID
- `IsSamePlayerById(string playerId)`: Compara por PlayerID
- `IsRecentlyDead(float timeout)`: Verifica se morreu recentemente

### 5.2 Sistema de Tracking

O array global `ActivePlayers` mantém todos os jogadores conectados:

```c
ref array<ref ActivePlayer> ActivePlayers;
```

**Funções principais:**

#### AddOrUpdateActivePlayer()
- Adiciona ou atualiza jogador na lista
- Detecta e remove duplicatas (ghosts)
- Sincroniza Identity e Player

#### GetActivePlayerById()
- Busca jogador por PlayerID
- Retorna `ActivePlayer` ou `null`

#### RemoveActivePlayerById()
- Remove jogador da lista por PlayerID
- Limpa referências

#### ListActivePlayers()
- Lista todos os jogadores ativos no log
- Limpa automaticamente jogadores inválidos

### 5.3 Detecção e Tratamento de "Ghosts"

**Ghost**: Jogador que está em `ActivePlayers` mas não aparece em `GetPlayers()` (desconectado mas não removido).

**Detecção:**
```c
bool IsPlayerActiveInWorld(string playerId)
{
    array<Man> players = new array<Man>();
    GetGame().GetPlayers(players);
    
    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetId() == playerId)
            return true;
    }
    return false;
}
```

**Tratamento:**
- `CleanupInvalidActivePlayers()`: Remove ghosts periodicamente
- `ForceDisconnectGhost()`: Força desconexão de ghosts
- Verificação em `AddOrUpdateActivePlayer()`: Detecta duplicatas físicas

### 5.4 Sistema de Desconexões Pendentes

O mapa `PendingDisconnects` rastreia desconexões iniciadas mas não confirmadas:

```c
ref map<string, int> PendingDisconnects;  // Key: PlayerID, Value: timestamp
```

**Fluxo:**
1. `ClientDisconnectedEventTypeID`: Marca como pendente
2. `LogoutCancelEventTypeID`: Remove se cancelado
3. `ScriptLogEventTypeID`: Confirma e remove quando "finished"
4. Timeout de 30s: Remove automaticamente se antigo

### 5.5 Funções Auxiliares

#### GetPlayerById(string id)
```c
PlayerBase GetPlayerById(string id)
{
    array<Man> players = {};
    GetGame().GetPlayers(players);
    
    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetId() == id)
            return player;
    }
    return null;
}
```

#### GetPlayerByName(string name)
- Similar a `GetPlayerById()` mas busca por nome

#### GetPlayerId(Man man)
- Extrai PlayerID de um objeto Man

---

## 6. Sistema de Comandos

### 6.1 Arquivo commands_to_execute.txt

Comandos são lidos de `$mission:admin/files/commands_to_execute.txt` no formato:

```
PlayerID comando parametro1 parametro2 ...
SYSTEM comando parametro1 parametro2 ...
```

**Exemplo:**
```
abc123 teleport 100.0 200.0 50.0
SYSTEM createitem AKM 1 5000.0 6000.0
```

### 6.2 Processamento de Comandos

#### CheckCommands()
- Lê arquivo `commands_to_execute.txt`
- Processa cada linha
- Limpa arquivo após processamento
- Usa flag `m_IsProcessingCommands` para evitar concorrência

**Fluxo:**
```c
void CheckCommands()
{
    if (m_IsProcessingCommands) return;
    m_IsProcessingCommands = true;
    
    // Lê arquivo
    // Para cada linha: ExecuteCommand(tokens)
    // Limpa arquivo
    
    m_IsProcessingCommands = false;
}
```

#### ExecuteCommand(TStringArray tokens)
- `tokens[0]`: PlayerID ou "SYSTEM"
- `tokens[1]`: Nome do comando
- `tokens[2+]`: Parâmetros

**Comandos de Sistema (SYSTEM):**
- `createitem`: Cria item no mundo
- `createvehicle`: Cria veículo
- `createcontainer`: Cria container
- `createweapon`: Cria arma com attachments
- `scanobjects`: Inicia varredura do mundo
- `registerfence`: Registra cerca para tracking
- `registerwatchtower`: Registra watchtower
- `registerflag`: Registra flag
- `registercontainer`: Registra container
- `teleportvehicle`: Teleporta veículo

**Comandos de Jogador:**
- `help`: Lista comandos disponíveis
- `teleport`: Teleporta jogador
- `heal`: Cura jogador
- `kill`: Mata jogador
- `godmode`/`ungodmode`: Ativa/desativa godmode
- `giveitem`: Dá item ao jogador
- `spawnvehicle`: Spawna veículo próximo ao jogador
- `getposition`: Mostra posição atual
- `settime`: Altera horário do mundo
- `setweather`: Altera clima
- `votemap`: Vota em mapa (deathmatch)
- `votekick`: Inicia votação de kick
- `loadout`: Gerencia loadouts
- E mais...

### 6.3 Sistema de Resultados

Comandos que retornam dados escrevem em `commands_results.txt` via `AppendCommandResult()`:

```c
void AppendCommandResult(string message, bool printMsg = true)
```

**Formato JSON:**
```json
{"request_id":"abc123","command":"checkinventory","player_id":"xyz","items":[...]}
```

### 6.4 Padrão de Implementação de Comando

```c
case "nomecomando":
    if (tokens.Count() < N_PARAMS)
    {
        SendPrivateMessage(playerID, "Uso: !nomecomando <param1> <param2>", MessageColor.WARNING);
        return false;
    }
    
    // Validação de parâmetros
    // Execução
    // Log
    // Feedback ao jogador
    break;
```

---

## 7. Integrações Externas

### 7.1 Sistema de ExternalActions

Comunicação com sistemas externos (ex: interface web Python) via arquivo `external_actions.txt`:

```c
void AppendExternalAction(string message, bool printMsg = true)
```

**Formato JSON:**
```json
{"action":"player_connected","player_id":"abc123"}
{"action":"player_disconnected","player_id":"abc123"}
{"action":"players_positions","players":[...]}
{"action":"update_player","player_id":"abc123","player_name":"Nome","steam_id":"steamid"}
```

### 7.2 Eventos Enviados

#### player_connected
- Quando: Jogador conecta pela primeira vez
- Dados: `player_id`

#### player_disconnected
- Quando: Jogador desconecta (não após morte)
- Dados: `player_id`

#### update_player
- Quando: Jogador conecta ou atualiza dados
- Dados: `player_id`, `player_name`, `steam_id`

#### players_positions
- Quando: A cada 60 segundos
- Dados: Array de jogadores com posição, saúde, inventário, etc.

#### vehicles_positions
- Quando: A cada 60 segundos
- Dados: Array de veículos rastreados

#### containers_positions
- Quando: Varredura inicial ou atualização
- Dados: Array de containers com itens

#### event_start_finished
- Quando: Servidor inicia
- Dados: `current_time`, `current_map`, `next_map` (se deathmatch)

#### event_minutes_to_restart
- Quando: Aviso de reinício
- Dados: `message`, `current_map`, `next_map`

### 7.3 Sanitização de Strings para JSON

A função `SanitizeForJson()` remove caracteres perigosos:

```c
string SanitizeForJson(string input)
{
    string sanitized = input;
    TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
    foreach (string ch : unsafeChars)
    {
        sanitized.Replace(ch, "-");
    }
    sanitized.Replace("\n", "");
    sanitized.Replace("\r", "");
    sanitized.Replace("\t", "");
    if (sanitized.Length() > 64)
        sanitized = sanitized.Substring(0, 64);
    
    return sanitized;
}
```

### 7.4 Construção de JSON Manual

Como não há biblioteca JSON, o JSON é construído manualmente:

```c
string json = "{";
json += "\"player_id\":\"" + playerId + "\"";
json += ",\"player_name\":\"" + safeName + "\"";
json += ",\"x\":" + position[0].ToString();
json += "}";
```

---

## 8. Sistema de Tracking

### 8.1 WorldTracking

O módulo `WorldTracking.c` coordena o tracking de todos os objetos do mundo:

#### InitWorldTracking()
- Varredura única de todos os objetos em raio de 25000m do centro (7500, 0, 7500)
- Popula arrays de tracking: fences, watchtowers, flags, vehicles, containers
- Envia dados iniciais via ExternalAction

#### GatherWorldObjects()
- Usa `GetObjectsAtPosition()` para coletar objetos
- Retorna array de todos os objetos no raio

### 8.2 VehicleTracking

#### Arrays Globais
```c
ref array<CarScript> m_TrackedVehicles;
```

#### Funções Principais

**RegisterVehicle(EntityAI newVehicle)**
- Adiciona veículo ao array de tracking
- Verifica duplicatas
- Log da adição

**PopulateTrackedVehicles(array<Object> worldObjects)**
- Popula array inicial de veículos
- Usado na varredura inicial

**CleanTrackedVehicles()**
- Remove veículos destruídos do array
- Verifica `GetHealth("", "") <= 0`

**SendVehiclesPositions()**
- Envia posições de todos os veículos rastreados
- Inclui: posição, tipo, saúde (engine, body, fuel_tank), identificador

**BuildVehicleHealthPartsJson(CarScript vehicle)**
- Constrói JSON com saúde das partes do veículo
- Usa `TryGetVehicleZoneHealth()` para verificar zonas de dano

### 8.3 FencesTracking

#### Arrays Globais
```c
ref array<Fence> m_TrackedFences;
```

#### Funções Principais

**RegisterFenceAtPosition(vector position, float radius)**
- Registra cerca próxima à posição
- Usado via comando `registerfence`

**PopulateTrackedFences(array<Object> worldObjects)**
- Popula array inicial de cercas

**CleanTrackedFences()**
- Remove cercas destruídas

**SendFencesStatus()**
- Envia status de todas as cercas rastreadas

### 8.4 LootTracking

#### Arrays Globais
```c
ref array<EntityAI> m_TrackedContainers;
```

#### Funções Principais

**RegisterContainerAtPosition(vector position, float radius)**
- Registra container próximo à posição

**PopulateTrackedContainers(array<Object> worldObjects)**
- Popula array inicial de containers

**CleanTrackedContainers()**
- Remove containers destruídos

**CheckContainersForLoot()**
- Verifica containers que receberam loot
- Envia atualizações via ExternalAction

**BuildContainersData()**
- Constrói JSON com todos os containers e seus itens
- Usado na varredura inicial

### 8.5 Estruturas de Dados

Todos os sistemas de tracking usam arrays globais `ref array<Tipo>` que são:
- Inicializados em `Globals.c`
- Populados na varredura inicial
- Limpos periodicamente (a cada 60s)
- Atualizados quando novos objetos são criados

---

## 9. Sistema de Loadouts

### 9.1 Estrutura de Arquivos JSON

#### custom.json
Loadout padrão customizado:
```json
{
  "weapons": {
    "primary_weapon": {...},
    "secondary_weapon": {...},
    "small_weapon": {...}
  },
  "explosives": [...],
  "items": [...]
}
```

#### players_ids.json
Mapeamento PlayerID -> hash do arquivo:
```json
{
  "playerId1": "hash1",
  "playerId2": "hash2"
}
```

#### players/{hash}.json
Loadout específico do jogador:
```json
[
  {
    "Id": 1,
    "IsActive": true,
    "Name": "loadout1",
    "Loadout": {...}
  }
]
```

### 9.2 Modelos de Dados

#### LoadoutPlayer
```c
class LoadoutPlayer
{
    int Id;
    bool IsActive;
    string Name;
    ref LoadoutData Loadout;
}
```

#### LoadoutData
```c
class LoadoutData
{
    ref Weapons weapons;
    ref array<ref Explosive> explosives;
    ref array<ref LoadoutItem> items;
}
```

#### WeaponData
```c
class WeaponData
{
    string name_type;
    string feed_type;
    int slots, width, height;
    ref WeaponAmmunition ammunitions;
    ref WeaponMagazine magazine;
    ref array<ref WeaponAttachment> attachments;
}
```

### 9.3 Funções Principais

#### GiveCustomLoadout(PlayerBase player, string playerId)
- Carrega loadouts do jogador
- Aplica loadout ativo (`IsActive = true`)
- Ordem: Itens com storage → Itens sem storage → Armas → Explosivos

#### GetAllLoudoutsFromPlayer(string playerId)
- Carrega todos os loadouts do jogador
- Retorna array de `LoadoutPlayer`

#### GetLoadoutByName(string playerId, string loadoutName)
- Busca loadout específico por nome
- Retorna `LoadoutPlayer` ou `null`

#### ActiveLoadoutByName(string playerId, string loadoutName)
- Ativa um loadout específico
- Desativa outros loadouts do jogador
- Salva no arquivo JSON

#### ShowLoadoutsToPlayer(string playerId)
- Lista todos os loadouts disponíveis
- Envia mensagens privadas ao jogador

### 9.4 Sistema de Aplicação

**Ordem de aplicação:**
1. Itens com storage (mochilas, coletes) - criados primeiro
2. Itens sem storage - criados depois
3. Armas primárias, secundárias, pequenas - com attachments e munições
4. Explosivos - anexados ao colete se possível

**Tratamento de erros:**
- Se item não cabe no inventário, cria no chão
- Log de todos os itens criados
- Validação de tipos de itens

---

## 10. Sistema de Deathmatch

### 10.1 Configuração via JSON

Arquivo `deathmatch_config.json` contém array de `SafeZoneData`:

```json
[
  {
    "RegionId": 1,
    "Region": "Chernarus",
    "CustomMessage": "Mapa atual: Chernarus",
    "SpawnZones": ["100,200,300", "400,500,600"],
    "WallZones": ["1000,2000,3000", "4000,5000,6000"],
    "Active": true,
    "NextActiveMap": false,
    "IsDeleted": false,
    "Spawns": {
      "Vehicles": [
        {"name": "Sedan_02", "coord": "1000,2000,3000"}
      ]
    }
  }
]
```

### 10.2 Sistema de Votação de Mapas

#### VoteMapManager
- Gerencia votação de próximo mapa
- Jogadores votam com `!votemap <regionId>`
- Após timeout ou maioria, define próximo mapa
- Atualiza `NextActiveMap` no JSON

#### Funções Principais
- `CheckIfVotingAndStart()`: Inicia votação
- `CheckVotingStatus()`: Verifica status atual
- `GetStatusVotingMap()`: Retorna se há votação ativa

### 10.3 Sistema de Votação de Kick

#### VoteKickManager
- Gerencia votação para kickar jogador
- Jogadores votam com `!votekick <playerId>`
- Após maioria, executa kick
- Lista jogadores online com `!players`

### 10.4 SafeZones e Spawn Zones

#### SpawnZones
- Array de vetores definindo áreas de spawn
- `GetFarthestSpawnPosition()`: Calcula posição mais distante de outros jogadores
- Usado em `CreateCharacter()` para posicionar jogadores

#### WallZones
- Array de vetores definindo barreiras
- `CreateLinePathFromPoints()`: Cria objetos ao longo dos pontos
- Construído no `CustomMission()` usando `StaticObj_Roadblock_Wood_Long_DE`

### 10.5 Configuração de Clima

No modo deathmatch:
- Clima sempre limpo (`SetClearWeatherNow()`)
- Horário fixo em 06:00
- Aplicado no `MainCustom()`

---

## 11. Modelos de Dados

### 11.1 ActivePlayer

```c
class ActivePlayer
{
    PlayerIdentity Identity;
    Man Player;
    float ConnectedTime;
    float DeathTime;
    bool HasSentConnectedEvent;
    string SteamId;
    string PlayerId;
}
```

**Uso**: Rastreamento de jogadores conectados

### 11.2 SafeZoneData

```c
class SafeZoneData
{
    int RegionId;
    string Region;
    string CustomMessage;
    ref array<string> SpawnZones;
    ref array<string> WallZones;
    bool Active;
    bool NextActiveMap;
    bool IsDeleted;
    SafeZoneDataSpawns Spawns;
}
```

**Uso**: Configuração de mapas no deathmatch

### 11.3 LoadoutPlayer

```c
class LoadoutPlayer
{
    int Id;
    bool IsActive;
    string Name;
    ref LoadoutData Loadout;
}
```

**Uso**: Loadouts customizados por jogador

### 11.4 ItemAttachmentData

```c
class ItemAttachmentData
{
    string type;
    ref array<ref ItemAttachmentData> attachments;
}
```

**Uso**: Sistema recursivo de attachments para criação de itens complexos

### 11.5 Estruturas Auxiliares

#### SafeZoneDataVehicle
- `name`: Tipo do veículo
- `coord`: Coordenadas como string
- `GetCoord()`: Converte para vector

#### SafeZoneDataSpawns
- `Vehicles`: Array de veículos para spawn

#### WeaponData e relacionados
- `WeaponAttachment`, `WeaponMagazine`, `WeaponAmmunition`, `Explosive`
- Usados na estrutura de loadouts

---

## 12. Funções Utilitárias

### 12.1 Manipulação de Arquivos

#### EnsureFileExists(string path)
- Verifica se arquivo existe
- Cria vazio se não existir

#### EnsureAllFilesExist()
- Garante existência de todos os arquivos necessários
- Chamado no início de `CustomMission()`

### 12.2 Manipulação de JSON

#### ParseItemJson(string json, int pos, out int newPos)
- Parser JSON manual recursivo
- Extrai `ItemAttachmentData` de string JSON
- Suporta attachments aninhados

#### NormalizeJsonString(string json)
- Normaliza JSON sem aspas para formato válido
- Adiciona aspas, vírgulas e chaves onde necessário
- Usado para processar JSON fragmentado de comandos

#### ExtractJsonString(string json, int pos, out int newPos)
- Extrai string entre aspas do JSON

### 12.3 Cálculos de Posição e Distância

#### GetFarthestSpawnPosition(array<vector> spawnZones)
- Calcula posição de spawn mais distante de outros jogadores
- Usado no deathmatch

#### SurfaceY(float x, float z)
- Obtém altura do terreno em coordenadas X, Z
- Usado para posicionar objetos no chão

### 12.4 Validações e Sanitizações

#### SanitizeForJson(string input)
- Remove caracteres perigosos para JSON
- Limita tamanho a 64 caracteres

#### IsInteger(string s)
- Valida se string é número inteiro

#### IsContainerType(string type)
- Verifica se tipo é container

#### IsVehicle(EntityAI entity)
- Verifica se entidade é veículo

### 12.5 Formatação de Strings

#### GetCurrentDate()
- Retorna data no formato "YYYY-MM-DD"

#### GetCurrentTimestamp()
- Retorna timestamp no formato "YYYY-MM-DD HH:MM:00"

#### GetCurrentTimeInGame()
- Retorna horário com período (manhã, tarde, noite, madrugada)

#### FormatTempo(int segundos)
- Formata tempo em minutos e segundos

#### Pluralize(int valor, string singular, string plural)
- Retorna singular ou plural baseado no valor

---

## 13. Técnicas Avançadas

### 13.1 CallQueue para Execução Assíncrona

O DayZ usa `CallQueue` para agendar execuções:

```c
GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(Funcao, delayMs, repeat, param1, param2);
```

**Categorias:**
- `CALL_CATEGORY_SYSTEM`: Operações do sistema
- `CALL_CATEGORY_GAMEPLAY`: Operações de gameplay

**Exemplos:**
```c
// Executa após 5 segundos, uma vez
GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(InitWorldTracking, 5000, false);

// Executa após 300ms, uma vez, com parâmetros
GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY).CallLater(PostSpawnInit, 300, false, m_player, pos);

// Executa a cada 5 segundos (repeat = true)
GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateAdminEffects, 5000, true);
```

### 13.2 Parsing JSON Manual

Como não há biblioteca JSON, o código implementa parser manual:

**Estratégia:**
1. Normalização: `NormalizeJsonString()` adiciona aspas/vírgulas
2. Parsing recursivo: `ParseItemJson()` processa objetos aninhados
3. Extração de strings: `ExtractJsonString()` entre aspas
4. Arrays: `ParseAttachmentsArray()` processa arrays

**Exemplo:**
```c
string json = "type:AKM attachments:[{type:Optic} {type:Suppressor}]";
json = NormalizeJsonString(json);
// Resultado: {"type":"AKM","attachments":[{"type":"Optic"},{"type":"Suppressor"}]}

int pos = 0, nextPos = 0;
ref ItemAttachmentData data = ParseItemJson(json, pos, nextPos);
```

### 13.3 Sistema de Attachments Recursivos

O sistema suporta attachments aninhados infinitamente:

```c
EntityAI CreateItemWithAttachments(ItemAttachmentData itemData, EntityAI container, vector fallbackPos)
{
    // Cria item
    EntityAI item = container.GetInventory().CreateInInventory(itemData.type);
    
    // Processa attachments recursivamente
    if (itemData.attachments && itemData.attachments.Count() > 0)
        ProcessAttachmentsRecursive(item, itemData.attachments);
    
    return item;
}

void ProcessAttachmentsRecursive(EntityAI parentItem, array<ref ItemAttachmentData> attachments)
{
    foreach (ref ItemAttachmentData attachment : attachments)
    {
        EntityAI attachmentEntity = parentItem.GetInventory().CreateAttachment(attachment.type);
        
        // Recursão para sub-attachments
        if (attachment.attachments && attachment.attachments.Count() > 0)
            ProcessAttachmentsRecursive(attachmentEntity, attachment.attachments);
    }
}
```

### 13.4 Limpeza Automática de Entidades

#### CleanUpDeadEntitiesNearPlayers()
- Executa a cada 60 segundos
- Remove corpos mortos e armas no chão próximas a jogadores
- Protege itens muito próximos de jogadores vivos
- TTL (Time To Live) para armas: 60 segundos após primeira detecção

**Configuração:**
```c
static const float CLEAN_RADIUS_M = 100.0;      // Raio de limpeza
static const float PROTECT_NEAR_ALIVE_M = 2.0; // Proteção próxima a vivos
static const int WEAPON_TTL_MS = 60000;         // TTL de armas
```

### 13.5 Gerenciamento de Timers e Cooldowns

O sistema usa timers baseados em `timeslice` do `OnUpdate()`:

```c
float m_AdminCheckCooldown10 = 10.0;
float m_AdminCheckTimer10 = 0.0;
float m_AdminCheckCooldown60 = 60.0;
float m_AdminCheckTimer60 = 0.0;

override void OnUpdate(float timeslice)
{
    super.OnUpdate(timeslice);
    m_AdminCheckTimer10 += timeslice;
    m_AdminCheckTimer60 += timeslice;

    if (m_AdminCheckTimer10 >= m_AdminCheckCooldown10)
    {
        m_AdminCheckTimer10 = 0.0;
        // Executa a cada 10 segundos
        CheckCommands();
        CheckMessages();
    }

    if (m_AdminCheckTimer60 >= m_AdminCheckCooldown60)
    {
        m_AdminCheckTimer60 = 0.0;
        // Executa a cada 60 segundos
        SendPlayersPositions();
        CleanTrackedVehicles();
    }
}
```

---

## 14. Boas Práticas

### 14.1 Verificação de Null

**Sempre verificar null antes de usar:**
```c
if (!player)
{
    WriteToLog("Função(): player é null", LogFile.INIT, false, LogType.ERROR);
    return;
}
```

**Padrão para arrays:**
```c
if (!ActivePlayers)
{
    ActivePlayers = new array<ref ActivePlayer>();
    return;
}
```

### 14.2 Inicialização de Arrays/Maps

**Sempre inicializar antes de usar:**
```c
ref array<string> msgs = new array<string>();
ref map<string, int> PendingDisconnects = new map<string, int>();
ref set<string> observedIds = new set<string>();
```

### 14.3 Tratamento de Erros Consistente

**Padrão:**
1. Verificar condições de erro
2. Log com contexto
3. Retornar valor apropriado (null, false, etc)
4. Não continuar execução se erro crítico

### 14.4 Logs Informativos

**Incluir contexto suficiente:**
- Nome da função
- Valores relevantes
- Tipo de log apropriado
- Mensagem clara

### 14.5 Separação de Responsabilidades

**Módulos bem definidos:**
- `Log.c`: Apenas logging
- `Commands.c`: Apenas comandos
- `Functions.c`: Funções utilitárias genéricas
- `OnEventCustom.c`: Apenas eventos
- `ExternalActions.c`: Apenas comunicação externa

### 14.6 Uso de Enums

**Para constantes relacionadas:**
```c
enum LogType { DEBUG, WARNING, ERROR, INFO }
enum LogFile { INIT, POSITION }
enum MessageColor { STATUS, IMPORTANT, FRIENDLY, WARNING }
```

### 14.7 Comentários Estruturados

**Seções delimitadas:**
```c
// ============================================================================
// TÍTULO DA SEÇÃO
// ============================================================================
```

**Documentação de funções:**
```c
// Função que faz X
// Parâmetros: descrição
// Retorna: descrição
```

---

## 15. Exemplos de Código

### 15.1 Exemplo: Função Típica

```c
PlayerBase GetPlayerById(string id)
{
    array<Man> players = {};
    GetGame().GetPlayers(players);

    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetId() == id)
        {
            WriteToLog("GetPlayerById(): Jogador encontrado: " + player.GetIdentity().GetName(), LogFile.INIT, false, LogType.DEBUG);
            return player;
        }
    }

    WriteToLog("GetPlayerById(): Jogador de id " + id + " não encontrado", LogFile.INIT, false, LogType.ERROR);
    return null;
}
```

### 15.2 Exemplo: Tratamento de Evento

```c
else if (eventTypeId == ClientReadyEventTypeID)
{
    WriteToLog("EVENT: ClientReadyEventTypeID - Cliente pronto para jogar", LogFile.INIT, false, LogType.INFO);
    
    ClientReadyEventParams readyParams = ClientReadyEventParams.Cast(params);
    if (readyParams)
    {
        identity = readyParams.param1;
        player = readyParams.param2;
        
        if (identity)
        {
            ProcessPlayerReady(identity, player);
        }
    }
}
```

### 15.3 Exemplo: Comando Customizado

```c
case "teleport":
    if (tokens.Count() >= 4)
    {
        vector posT = Vector(tokens[2].ToFloat(), 0, tokens[4].ToFloat());
        
        if (tokens.Count() >= 5 && tokens[3].ToFloat() != 0)
        {
            posT[1] = tokens[3].ToFloat();
        }
        else
        {
            posT[1] = GetGame().SurfaceY(posT[0], posT[2]);
        }
        
        target.SetPosition(posT);
        target.MessageStatus("Você foi teleportado");
        WriteToLog("Jogador " + playerID + " teleportado para " + posT.ToString(), LogFile.INIT, false, LogType.INFO);
    }
    break;
```

### 15.4 Exemplo: Tracking de Objeto

```c
void RegisterVehicle(EntityAI newVehicle)
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    if (!newVehicle)
        return;

    CarScript vehicleScript = CarScript.Cast(newVehicle);
    if (!vehicleScript)
        return;

    if (!m_TrackedVehicles)
        m_TrackedVehicles = new array<CarScript>();

    // Verifica duplicatas
    for (int i = 0; i < m_TrackedVehicles.Count(); i++)
    {
        CarScript tracked = m_TrackedVehicles.Get(i);
        if (tracked == vehicleScript)
        {
            WriteToLog("RegisterVehicle(): Veículo já está rastreado", LogFile.INIT, false, LogType.DEBUG);
            return;
        }
    }

    m_TrackedVehicles.Insert(vehicleScript);
    WriteToLog("RegisterVehicle(): Veículo " + vehicleScript.GetDisplayName() + " adicionado", LogFile.INIT, false, LogType.INFO);
}
```

### 15.5 Exemplo: Construção de JSON

```c
string BuildPlayerJson(PlayerBase player)
{
    PlayerIdentity identity = player.GetIdentity();
    if (!identity)
        return "";

    string playerId = identity.GetId();
    string playerName = SanitizeForJson(identity.GetName());
    vector position = player.GetPosition();

    string json = "{";
    json += "\"player_id\":\"" + playerId + "\"";
    json += ",\"player_name\":\"" + playerName + "\"";
    json += ",\"x\":" + position[0].ToString();
    json += ",\"z\":" + position[1].ToString();
    json += ",\"y\":" + position[2].ToString();
    json += "}";

    return json;
}
```

### 15.6 Exemplo: Uso de CallQueue

```c
void ScheduleSpawnStaminaBurst(PlayerBase player)
{
    auto q = GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY);
    q.CallLater(BoostStaminaOnce, 50, false, player);
    q.CallLater(BoostStaminaOnce, 250, false, player);
    q.CallLater(BoostStaminaOnce, 1000, false, player);
}
```

---

## 16. Glossário

### Termos Técnicos

**ActivePlayer**: Classe que representa um jogador conectado, mantendo referências a Identity e Player.

**CallQueue**: Sistema do DayZ para agendar execuções assíncronas.

**Cast**: Conversão de tipo em Enforce Script (ex: `PlayerBase.Cast(man)`).

**EntityAI**: Classe base para todas as entidades do jogo (itens, veículos, etc).

**Enforce Script**: Linguagem de script do DayZ, similar a C++.

**ExternalAction**: Ação enviada para sistemas externos via arquivo `external_actions.txt`.

**Ghost**: Jogador que está em `ActivePlayers` mas não aparece em `GetPlayers()` (desconectado mas não removido).

**Hive**: Sistema de persistência de dados do DayZ.

**Identity (PlayerIdentity)**: Identidade do jogador contendo nome, SteamID, PlayerID.

**Loadout**: Configuração de equipamentos para um jogador.

**Man**: Classe base para personagens (jogadores e NPCs).

**PlayerBase**: Classe derivada de Man que representa jogadores.

**ref**: Palavra-chave para referências gerenciadas (arrays, maps, sets, classes).

**SafeZone**: Zona segura no deathmatch onde jogadores não podem entrar/sair.

**SteamID**: Identificador único do Steam (formato: `7656119...`).

**PlayerID**: Identificador único do jogador no servidor (formato: `abc123...`).

**Tracking**: Sistema de rastreamento de objetos no mundo (veículos, containers, etc).

**TTL (Time To Live)**: Tempo de vida de um objeto antes de ser removido.

---

## Conclusão

Esta documentação cobre os principais aspectos do sistema customizado do servidor DayZ. Para implementações futuras, consulte as seções relevantes e siga os padrões estabelecidos.

**Principais pontos a lembrar:**
- Sempre verificar null antes de usar objetos
- Usar logs informativos com contexto
- Seguir padrões de nomenclatura
- Separar responsabilidades em módulos
- Documentar funções complexas
- Tratar erros consistentemente

**Arquivos de referência rápida:**
- `Globals.c`: Variáveis globais e constantes
- `Functions.c`: Funções utilitárias
- `Log.c`: Sistema de logging
- `Commands.c`: Lista de comandos disponíveis
- `OnEventCustom.c`: Eventos tratados

---

*Documentação gerada para facilitar implementações futuras com IA.*
