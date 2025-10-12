# Documentação - Servidor DayZ Deathmatch

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Funcionalidades Principais](#funcionalidades-principais)
4. [Módulos e Componentes](#módulos-e-componentes)
5. [Comandos Disponíveis](#comandos-disponíveis)
6. [Arquivos de Configuração](#arquivos-de-configuração)
7. [Sistema de Logs](#sistema-de-logs)
8. [Integração Externa](#integração-externa)
9. [Manutenção e Troubleshooting](#manutenção-e-troubleshooting)

---

## Visão Geral

O servidor Deathmatch é uma implementação customizada do DayZ que oferece uma experiência de combate PvP com funcionalidades avançadas, incluindo sistema de mapas rotativos, loadouts personalizáveis, votações democráticas e integração com sistemas externos.

### Características Principais
- **Mapas Rotativos**: Sistema de rotação automática de mapas com votação da comunidade
- **Loadouts Customizáveis**: Jogadores podem criar e salvar seus próprios loadouts
- **Sistema de Votação**: Votação de mapas e kick de jogadores
- **Zonas de Combate**: Áreas delimitadas com penalidades para quem sair
- **Limpeza Automática**: Remoção automática de corpos e armas no chão
- **Clima Controlado**: Clima sempre limpo para melhor visibilidade
- **Integração Externa**: API para comunicação com sistemas externos (Discord, Web)

---

## Arquitetura do Sistema

### Estrutura de Arquivos

```
deathmatch/dayz-server/mpmissions/dayzOffline.chernarusplus/
├── init.c                      # Arquivo principal de inicialização
├── admin/
│   ├── Commands.c              # Sistema de comandos do jogo
│   ├── Construction.c          # Construção de objetos e barreiras
│   ├── DeathMatchConfig.c      # Gerenciamento de mapas
│   ├── ExternalActions.c       # Comunicação com sistemas externos
│   ├── Functions.c             # Funções utilitárias
│   ├── Globals.c               # Variáveis globais e enums
│   ├── Log.c                   # Sistema de logging
│   ├── Messages.c              # Sistema de mensagens
│   ├── PlayersLoadout.c        # Gerenciamento de loadouts
│   ├── VehicleSpawner.c        # Sistema de spawn de veículos
│   ├── VoteKickManager.c       # Sistema de votação de kick
│   ├── VoteMapManager.c        # Sistema de votação de mapas
│   ├── files/
│   │   ├── admin_ids.txt       # IDs dos administradores
│   │   ├── commands_to_execute.txt     # Comandos pendentes
│   │   ├── deathmatch_config.json      # Configuração dos mapas
│   │   ├── external_actions.txt        # Ações para sistemas externos
│   │   ├── messages_to_send.txt        # Mensagens globais pendentes
│   │   └── messages_private_to_send.txt # Mensagens privadas pendentes
│   ├── loadouts/
│   │   ├── admin.json          # Loadout padrão para admins
│   │   ├── default.json        # Loadout padrão para jogadores
│   │   ├── players_ids.json    # Mapeamento de IDs de jogadores
│   │   └── players/            # Loadouts individuais dos jogadores (155 arquivos)
│   └── models/
│       ├── LoadoutPlayer.c     # Modelo de dados do loadout
│       ├── LoadoutPlayerId.c   # Modelo de ID do jogador
│       └── SafeZoneData.c      # Modelo de dados do mapa/zona
```

### Fluxo de Inicialização

1. **`main()`**: Inicializa o Hive, configura data/hora e clima
2. **`CustomMission()`**: Carrega configurações, mapas e inicializa gerenciadores
3. **`OnMissionStart()`**: Prepara o servidor para receber jogadores
4. **`OnUpdate()`**: Loop principal (executado a cada frame)

---

## Funcionalidades Principais

### 1. Sistema de Mapas Rotativos

O servidor suporta múltiplos mapas configuráveis que alternam automaticamente ou por votação.

#### Arquivo de Configuração: `deathmatch_config.json`

```json
[
  {
    "RegionId": 1,
    "Region": "Nome do Mapa",
    "Active": true,
    "CustomMessage": "Mensagem personalizada do mapa",
    "SpawnZones": [
      ["x1", "y1", "z1"],
      ["x2", "y2", "z2"]
    ],
    "WallZones": [
      ["x1", "y1", "z1"],
      ["x2", "y2", "z2"]
    ],
    "Spawns": {
      "Vehicles": [
        {
          "name": "Sedan_02",
          "coord": ["x", "y", "z"]
        }
      ]
    }
  }
]
```

#### Componentes do Mapa

- **RegionId**: Identificador único do mapa
- **Region**: Nome exibido no jogo
- **Active**: Define se o mapa está ativo
- **CustomMessage**: Mensagem exibida periodicamente aos jogadores
- **SpawnZones**: Array de coordenadas onde jogadores podem spawnar
- **WallZones**: Polígono que define a área de combate (jogadores fora recebem dano)
- **Spawns.Vehicles**: Lista de veículos que spawnam automaticamente

#### Funcionalidades

- Rotação automática após reinício do servidor
- Votação de próximo mapa (10 minutos antes do restart)
- Construção automática de barreiras nos limites do mapa
- Penalização de jogadores que saem da zona segura

### 2. Sistema de Loadouts Personalizáveis

Os jogadores podem criar, salvar e ativar diferentes loadouts através de uma interface web.

#### Estrutura de Loadout

```json
{
  "Name": "MeuLoadout",
  "IsActive": true,
  "Loadout": {
    "items": [
      {
        "name_type": "PlateCarrierVest",
        "subitems": [
          {"name_type": "Battery9V"}
        ]
      }
    ],
    "weapons": {
      "primary_weapon": {
        "name_type": "M4A1",
        "feed_type": "magazine",
        "magazine": {
          "name_type": "Mag_CMAG_30Rnd",
          "capacity": 30
        },
        "ammunitions": {
          "name_type": "Ammo_556x45"
        },
        "attachments": [
          {
            "name_type": "M4_OEBttstck",
            "battery": false
          }
        ]
      },
      "secondary_weapon": {...},
      "small_weapon": {...}
    },
    "explosives": [
      {
        "name_type": "Grenade_RGD5",
        "quantity": 2
      }
    ]
  }
}
```

#### Comandos Relacionados

- `!loadouts` - Lista todos os loadouts do jogador
- `!loadout <nome>` - Ativa um loadout específico
- `!loadout reset` - Gera nova senha de acesso ao sistema web

#### Sistema de Armas

O sistema suporta três tipos de alimentação de armas:
- **magazine**: Armas com carregador removível (ex: rifles de assalto)
- **manual**: Armas de alimentação manual (ex: shotguns, revólveres)
- **internal**: Armas com carregador interno (ex: rifles bolt-action)

### 3. Sistema de Votação

#### Votação de Mapas

Inicia automaticamente 10 minutos antes do restart do servidor.

**Funcionamento**:
1. Votação é anunciada para todos os jogadores
2. Jogadores votam usando `!votemap <id>`
3. Se todos votarem, finaliza imediatamente
4. Após 5 minutos, o mapa mais votado é selecionado
5. Se a votação for unânime, servidor reinicia em 1 minuto

**Comandos**:
- `!maps` - Lista mapas disponíveis
- `!votemap <id>` - Vota em um mapa
- `!nextmap` - Mostra o próximo mapa

#### Votação de Kick

Permite que jogadores votem para expulsar outros jogadores.

**Requisitos**:
- Mínimo de 3 jogadores online
- Apenas votação unânime resulta em kick

**Comandos**:
- `!players` - Lista jogadores online
- `!votekick <id>` - Inicia votação de kick
- Digite `1` para SIM ou `2` para NÃO

### 4. Zonas de Combate e Barreiras

#### SpawnZones
Áreas onde jogadores podem spawnar aleatoriamente.

#### WallZones
Polígono que define os limites da área de jogo:
- Jogadores fora da zona recebem **20 HP de dano** a cada 10 segundos
- Recebem **sangramento automático**
- Mensagem de aviso é exibida

#### Construção Automática de Barreiras

Barreiras visuais são criadas automaticamente nos limites definidos:
```cpp
CreateLinePathFromPoints(points, "StaticObj_Roadblock_Wood_Long_DE", 3.0, 0.5, 90.0);
```

Parâmetros:
- **Objeto**: `StaticObj_Roadblock_Wood_Long_DE`
- **Espaçamento**: 3.0 metros
- **Altura**: 0.5 metros
- **Rotação**: 90 graus

### 5. Sistema de Limpeza Automática

Executa a cada 60 segundos para manter o servidor otimizado.

#### Configuração

```cpp
static const float CLEAN_RADIUS_M        = 100.0;   // Raio de limpeza ao redor dos jogadores
static const float PROTECT_NEAR_ALIVE_M  = 2.0;     // Proteção de itens próximos a jogadores
static const int   WEAPON_TTL_MS         = 60000;   // Tempo de vida das armas (60 segundos)
```

#### O que é limpo?

1. **Corpos de Jogadores**: Removidos imediatamente após morte
2. **Corpos de Infectados**: Removidos imediatamente
3. **Armas no Chão**: Removidas após 60 segundos (TTL)
   - Armas a menos de 2m de jogadores vivos são protegidas

#### Algoritmo

```
Para cada jogador online:
  Varrer 100m ao redor
  Para cada objeto encontrado:
    Se for corpo morto → marcar para remoção
    Se for arma no chão:
      Se está perto de jogador vivo → ignorar
      Senão:
        Se TTL expirou → marcar para remoção
  
Executar remoções
```

### 6. Controle de Clima

O servidor mantém clima limpo permanentemente para melhor visibilidade em combates.

#### Configuração Inicial

```cpp
void SetClearWeatherNow() {
    weather.GetOvercast().Set(0.01, 1, 0);  // Quase sem nuvens
    weather.GetRain().Set(0.0, 1, 0);        // Sem chuva
    weather.GetFog().Set(0.0, 1, 0);         // Sem neblina
    weather.SetWindSpeed(0.0);               // Sem vento
}
```

#### Comando Admin

Admins podem alterar o clima temporariamente:
```
!setweather <clear | cloudy | rain | foggy | default>
```

### 7. Sistema de Spawn de Veículos

Veículos são spawnados automaticamente conforme configuração do mapa.

#### Veículos Suportados

- **CivilianSedan**
- **Sedan_02**
- **OffroadHatchback**
- **Offroad_02**
- **Truck_01_Covered**
- **Truck_01_Open**

#### Características

- Spawnam **completamente equipados** (bateria, velas, rodas, portas, etc.)
- **Combustível cheio** (1000L)
- **Óleo, freio e coolant cheios**
- **Vida máxima** (1000 HP)
- **Lifetime**: 45 dias (3.888.000 segundos)

#### Comando Admin

```
!spawnvehicle <tipo>
```

Exemplo: `!spawnvehicle Sedan_02`

---

## Comandos Disponíveis

### Comandos para Todos os Jogadores

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `!help` | Exibe lista de comandos | `!help` |
| `!kill` | Suicídio | `!kill` |
| `!loadouts` | Lista seus loadouts | `!loadouts` |
| `!loadout <nome>` | Ativa um loadout | `!loadout sniper` |
| `!loadout reset` | Gera nova senha web | `!loadout reset` |
| `!maps` | Lista mapas disponíveis | `!maps` |
| `!votemap <id>` | Vota em um mapa | `!votemap 3` |
| `!nextmap` | Mostra próximo mapa | `!nextmap` |
| `!players` | Lista jogadores online | `!players` |
| `!votekick <id>` | Inicia votação de kick | `!votekick 76561198...` |

### Comandos Exclusivos para Admins

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `!heal` | Se cura completamente | `!heal` |
| `!godmode` | Ativa invencibilidade | `!godmode` |
| `!ungodmode` | Desativa invencibilidade | `!ungodmode` |
| `!giveitem <item> <qtd>` | Cria itens | `!giveitem AKM 2` |
| `!spawnvehicle <tipo>` | Spawna veículo | `!spawnvehicle Sedan_02` |
| `!ghostmode` | Fica invisível | `!ghostmode` |
| `!unghostmode` | Fica visível | `!unghostmode` |
| `!teleport <x> <y> <z>` | Teleporta | `!teleport 7500 0 7500` |
| `!getposition` | Mostra posição atual | `!getposition` |
| `!construct <obj> <h> <n> <l> <r>` | Constrói objetos | `!construct Land_Container_1Bo 1.0 4 6.0 90` |
| `!settime <hora> <min>` | Altera horário | `!settime 12 30` |
| `!setweather <tipo>` | Altera clima | `!setweather clear` |

#### Detalhamento do Comando `!construct`

Cria uma linha de objetos na direção que o admin está olhando.

**Sintaxe**:
```
!construct <objeto> <altura> <quantidade> <comprimento> <rotação>
```

**Parâmetros**:
- **objeto**: Nome da classe do objeto (ex: `Land_Container_1Bo`)
- **altura**: Offset vertical em metros (padrão: 1.0)
- **quantidade**: Número de objetos a criar (padrão: 4)
- **comprimento**: Espaçamento entre objetos em metros (padrão: 6.0)
- **rotação**: Rotação adicional em graus (padrão: 0.0)

**Exemplo**:
```
!construct Land_Container_1Bo 1.0 8 6.0 90
```
Cria 8 containers a 1 metro de altura, espaçados 6 metros, rotacionados 90°.

#### Opções do Comando `!setweather`

- **clear**: Céu limpo, sem vento
- **cloudy**: Parcialmente nublado
- **rain**: Chuva forte com vento
- **foggy**: Neblina densa
- **default**: Retorna ao comportamento padrão do jogo

---

## Arquivos de Configuração

### 1. `admin_ids.txt`

Lista de IDs de jogadores com privilégios de admin (um por linha).

```
76561198012345678
76561198087654321
```

**Funcionalidades**:
- Admins tem godmode por padrão
- Acesso a todos os comandos
- Carregam loadout especial (`admin.json`)

### 2. `deathmatch_config.json`

Configuração completa dos mapas. Veja seção [Sistema de Mapas Rotativos](#1-sistema-de-mapas-rotativos).

### 3. `default.json`

Loadout padrão para jogadores novos ou sem loadout customizado.

### 4. `admin.json`

Loadout especial para administradores.

### 5. `players_ids.json`

Mapeia IDs de jogadores para seus arquivos de loadout.

```json
[
  {
    "PlayerId": "76561198012345678",
    "PlayerIdBase64": "NzY1NjExOTgwMTIzNDU2Nzg="
  }
]
```

### 6. Arquivos de Comunicação (Pasta `files/`)

#### `commands_to_execute.txt`
Comandos pendentes a serem executados. Verificado a cada 10 segundos.

**Formato**:
```
<player_id> <comando> <parâmetros>
```

Exemplo:
```
76561198012345678 heal
76561198012345678 giveitem AKM 1
```

#### `external_actions.txt`
Ações enviadas para sistemas externos (Discord, API Python). Escrito pelo servidor.

**Formato**: JSON (uma ação por linha)

```json
{"action":"player_connected","player_id":"76561198012345678"}
{"action":"event_restarting","next_map":"Tisy"}
{"action":"send_log_discord","message":"Servidor reiniciou"}
```

#### `messages_to_send.txt`
Mensagens globais pendentes. Verificado a cada 10 segundos.

**Formato**: Uma mensagem por linha (texto simples)

```
Servidor será reiniciado em 5 minutos!
Evento especial começando!
```

#### `messages_private_to_send.txt`
Mensagens privadas pendentes.

**Formato**:
```
<player_id>;<mensagem>
```

Exemplo:
```
76561198012345678;Seu loadout foi ativado com sucesso!
76561198087654321;[ERROR]Falha ao ativar loadout
```

Mensagens com `[ERROR]` são exibidas em vermelho.

---

## Sistema de Logs

### Tipos de Log

#### 1. `init.log`
Log principal do servidor com todos os eventos.

**Níveis**:
- `[INFO]`: Informações gerais
- `[DEBUG]`: Informações detalhadas para debug
- `[ERROR]`: Erros e falhas

**Eventos Registrados**:
- Inicialização do servidor
- Conexão/desconexão de jogadores
- Execução de comandos
- Carregamento de mapas e configurações
- Votações (mapas e kicks)
- Erros diversos

#### 2. `position.log`
Log específico para coordenadas capturadas (comando `!getposition`).

### Funções de Log

```cpp
void WriteToLog(string content, LogFile file = LogFile.INIT, bool internalCall = false, LogType type = LogType.DEBUG)
```

**Exemplo de Uso**:
```cpp
WriteToLog("Servidor iniciado com sucesso", LogFile.INIT, false, LogType.INFO);
WriteToLog("Jogador não encontrado", LogFile.INIT, false, LogType.ERROR);
```

### Localização dos Logs

Os logs são salvos em:
```
[ServidorDayZ]/profiles/init.log
[ServidorDayZ]/profiles/position.log
```

---

## Integração Externa

O servidor se comunica com sistemas externos através do arquivo `external_actions.txt`.

### URL do Sistema Python

```cpp
string UrlAppPython = "http://beco.servegame.com:54321/";
```

### Ações Enviadas

#### 1. Eventos de Jogador

**Atualização de Jogador**:
```json
{
  "action": "update_player",
  "player_id": "76561198012345678",
  "player_name": "NomeDoJogador",
  "steam_id": "76561198012345678"
}
```

**Conexão**:
```json
{"action": "player_connected", "player_id": "76561198012345678"}
```

**Desconexão**:
```json
{"action": "player_disconnected", "player_id": "76561198012345678"}
```

#### 2. Eventos de Servidor

**Servidor Iniciado**:
```json
{
  "action": "event_start_finished",
  "current_map": "Tisy",
  "current_time": "12:30 (tarde)"
}
```

**Servidor Reiniciando**:
```json
{
  "action": "event_restarting",
  "next_map": "NWAF"
}
```

**Aviso de Reinício**:
```json
{
  "action": "event_minutes_to_restart",
  "current_map": "Tisy",
  "current_time": "12:25 (tarde)",
  "message": "O servidor vai ser reiniciado em 5 minutos"
}
```

**Comando de Restart**:
```json
{
  "action": "restart_server",
  "minutes": 1,
  "message": "Servidor será reiniciado em 1 minuto"
}
```

#### 3. Logs para Discord

```json
{
  "action": "send_log_discord",
  "message": "Votação de mapa iniciada para a troca de mapa"
}
```

#### 4. Sistema de Loadouts

**Reset de Senha**:
```json
{
  "action": "reset_password",
  "player_id": "76561198012345678"
}
```

**Ativação de Loadout**:
```json
{
  "action": "active_loadout",
  "player_id": "76561198012345678",
  "loadout_name": "sniper"
}
```

### Implementação da API Externa

O sistema externo deve:
1. Ler o arquivo `external_actions.txt` periodicamente
2. Processar cada linha (JSON)
3. Limpar o arquivo após processar

**Exemplo Python**:
```python
import json
import time

def process_actions():
    try:
        with open('external_actions.txt', 'r') as f:
            lines = f.readlines()
        
        for line in lines:
            if line.strip():
                action = json.loads(line)
                handle_action(action)
        
        # Limpa o arquivo
        with open('external_actions.txt', 'w') as f:
            f.write('')
    except Exception as e:
        print(f"Erro: {e}")

def handle_action(action):
    action_type = action.get('action')
    
    if action_type == 'send_log_discord':
        send_to_discord(action['message'])
    elif action_type == 'player_connected':
        log_player_connection(action['player_id'])
    # ... outros handlers

# Loop principal
while True:
    process_actions()
    time.sleep(5)
```

---

## Manutenção e Troubleshooting

### Problemas Comuns

#### 1. Jogadores não recebem loadout customizado

**Possíveis causas**:
- Arquivo de loadout não existe em `admin/loadouts/players/`
- `players_ids.json` não contém mapeamento do jogador
- JSON malformado

**Solução**:
1. Verificar logs (`init.log`) para erros de parsing
2. Validar JSON em validador online
3. Verificar se `PlayerIdBase64` está correto
4. Jogador deve usar `!loadout reset` para gerar nova senha

#### 2. Barreiras não aparecem no mapa

**Possíveis causas**:
- `WallZones` vazio ou malformado no `deathmatch_config.json`
- Coordenadas incorretas
- Objeto de barreira não existe

**Solução**:
1. Verificar logs na inicialização
2. Confirmar que `WallZones` tem pelo menos 3 pontos
3. Testar coordenadas usando `!getposition`
4. Confirmar que objeto existe: `StaticObj_Roadblock_Wood_Long_DE`

#### 3. Votação de mapa não inicia

**Possíveis causas**:
- Mensagem de restart não detectada
- `g_VoteMapManager` não inicializado

**Solução**:
1. Verificar logs para "Votação iniciada"
2. Confirmar que servidor tem scheduler configurado
3. Testar manualmente com `!votemap 1`

#### 4. Veículos desaparecem após reinício

**Possíveis causas**:
- Central Economy (CE) está removendo veículos
- Lifetime muito curto
- Persistência não configurada

**Solução**:
1. Veículos spawnados por comando não persistem (comportamento esperado)
2. Veículos do mapa (`Spawns.Vehicles`) devem persistir
3. Verificar se CE está habilitado no `init.c`

#### 5. Sistema de limpeza remove itens indesejados

**Possíveis causas**:
- `WEAPON_TTL_MS` muito baixo
- `PROTECT_NEAR_ALIVE_M` muito pequeno

**Solução**:
Ajustar constantes em `Functions.c`:
```cpp
static const int WEAPON_TTL_MS = 120000;  // 2 minutos em vez de 1
static const float PROTECT_NEAR_ALIVE_M = 5.0;  // 5m em vez de 2m
```

### Otimização de Performance

#### 1. Reduzir Carga de Limpeza

Se o servidor estiver com lag, aumentar o intervalo:

```cpp
// Em CustomMission
float m_AdminCheckCooldown60 = 120.0;  // De 60s para 120s
```

#### 2. Limitar Área de Limpeza

Reduzir raio de varredura:

```cpp
static const float CLEAN_RADIUS_M = 50.0;  // De 100m para 50m
```

#### 3. Desabilitar Limpeza de Armas

Definir TTL como 0 para desabilitar:

```cpp
static const int WEAPON_TTL_MS = 0;  // Desabilita limpeza de armas
```

### Backup e Recuperação

#### Arquivos Críticos para Backup

1. **Configurações**:
   - `admin/files/deathmatch_config.json`
   - `admin/files/admin_ids.txt`

2. **Loadouts**:
   - `admin/loadouts/default.json`
   - `admin/loadouts/admin.json`
   - `admin/loadouts/players_ids.json`
   - `admin/loadouts/players/` (pasta completa)

3. **Scripts**:
   - Todo conteúdo da pasta `admin/`

#### Procedimento de Backup

```bash
# Criar backup completo
tar -czf backup_deathmatch_$(date +%Y%m%d).tar.gz \
  admin/files/ \
  admin/loadouts/ \
  admin/*.c

# Restaurar backup
tar -xzf backup_deathmatch_YYYYMMDD.tar.gz
```

### Logs de Debugging

Para debug avançado, ativar logs detalhados descomentando linhas:

```cpp
// Em Messages.c
WriteToLog("Verificando mensagens em: " + path, LogFile.INIT, false, LogType.DEBUG);

// Em CustomMission::OnUpdate
WriteToLog("OnUpdate(): Horário atual do servidor: " + GetCurrentTimeInGame(), LogFile.INIT, false, LogType.DEBUG);
```

### Teste de Comandos

Criar arquivo de teste `test_commands.txt`:

```
76561198012345678 heal
76561198012345678 giveitem M4A1 1
76561198012345678 godmode
```

Copiar para `commands_to_execute.txt` e aguardar 10 segundos.

### Monitoramento

#### Métricas Importantes

1. **Players Online**: Verificar `lastSeenPlayers` em logs
2. **Taxa de Limpeza**: "Corpos removidos" e "Armas removidas" em logs
3. **Erros de Parsing**: Buscar `[ERROR]` em `init.log`
4. **Desempenho**: FPS do servidor (se disponível)

#### Script de Monitoramento (Bash)

```bash
#!/bin/bash
# monitor_server.sh

LOGFILE="/path/to/profiles/init.log"
DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

# Monitorar erros
tail -f "$LOGFILE" | grep --line-buffered "\[ERROR\]" | while read line; do
    curl -X POST -H 'Content-Type: application/json' \
         -d "{\"content\":\"🚨 Erro no servidor: $line\"}" \
         "$DISCORD_WEBHOOK"
done
```

---

## Referências e Recursos

### Documentação Oficial DayZ

- [DayZ Server Configuration](https://community.bistudio.com/wiki/DayZ:Server_Configuration)
- [Enforce Script Documentation](https://community.bistudio.com/wiki/Enfusion:Enforce_Script_Syntax)

### Classes Importantes do DayZ

- `PlayerBase`: Jogador
- `EntityAI`: Entidades do jogo (itens, objetos)
- `Weapon_Base`: Armas
- `Magazine`: Carregadores
- `Car`: Veículos
- `Weather`: Sistema de clima

### Ferramentas Úteis

- **JSON Validator**: https://jsonlint.com/
- **Base64 Encoder**: https://www.base64encode.org/
- **DayZ Central Economy Editor**: Para editar economia do servidor

### Contato e Suporte

Para dúvidas ou problemas:
- Sistema web de loadouts: http://beco.servegame.com:54321/
- Logs do servidor: `[ServidorDayZ]/profiles/init.log`

---

## Changelog

### Versão Atual

**Funcionalidades Implementadas**:
- ✅ Sistema de mapas rotativos
- ✅ Votação de mapas (unânime = restart imediato)
- ✅ Votação de kick (mínimo 3 players)
- ✅ Sistema de loadouts personalizáveis
- ✅ Integração com API externa
- ✅ Sistema de limpeza automática (corpos e armas)
- ✅ Zonas de spawn aleatórias
- ✅ Zonas de barreira com penalização
- ✅ Construção automática de muros
- ✅ Clima controlado (sempre limpo)
- ✅ Spawn de veículos configurável
- ✅ Sistema de comandos completo
- ✅ Sistema de mensagens (público e privado)
- ✅ Rastreamento de conexão/desconexão
- ✅ Logging detalhado

**Melhorias Futuras Possíveis**:
- Sistema de ranking/estatísticas
- Zonas de loot customizadas
- Eventos temporários automatizados
- Sistema de recompensas
- Integração com Discord bots

---

*Documentação gerada em: 2025-10-12*
*Servidor: DayZ Deathmatch - Beco Gaming*

