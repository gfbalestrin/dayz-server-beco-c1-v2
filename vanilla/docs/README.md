# Documentação - Servidor DayZ Vanilla

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Funcionalidades Principais](#funcionalidades-principais)
4. [Comandos Disponíveis](#comandos-disponíveis)
5. [Arquivos de Configuração](#arquivos-de-configuração)
6. [Sistema de Logs](#sistema-de-logs)
7. [Integração Externa](#integração-externa)
8. [Manutenção e Troubleshooting](#manutenção-e-troubleshooting)

---

## Visão Geral

O servidor Vanilla é uma implementação mais simples e tradicional do DayZ, focada em proporcionar uma experiência de sobrevivência clássica com apenas algumas funcionalidades administrativas e de integração com sistemas externos.

### Características Principais
- **Experiência Vanilla**: Mantém a jogabilidade padrão do DayZ
- **Sistema de Admin**: Permissões especiais para administradores
- **Loadout Admin**: Equipamento especial para admins
- **Rastreamento de Jogadores**: Monitoramento de conexões e desconexões
- **Integração Externa**: Comunicação com sistemas externos (Discord, Web)
- **Sistema de Comandos Básicos**: Comandos essenciais para jogadores e admins
- **Sistema de Mensagens**: Envio de mensagens públicas e privadas

### Diferenças em Relação ao Deathmatch

O servidor Vanilla é uma versão **simplificada** comparado ao Deathmatch:

| Recurso | Vanilla | Deathmatch |
|---------|---------|------------|
| Mapas Rotativos | ❌ | ✅ |
| Votação de Mapas | ❌ | ✅ |
| Votação de Kick | ❌ | ✅ |
| Loadouts Personalizáveis | ❌ | ✅ |
| Zonas de Barreira | ❌ | ✅ |
| Limpeza Automática | ❌ | ✅ |
| Clima Controlado | ❌ | ✅ |
| Spawn de Veículos Config. | ❌ | ✅ |
| Sistema de Comandos | Básico | Avançado |
| Loadout Admin | ✅ | ✅ |
| Integração Externa | ✅ | ✅ |
| Rastreamento Jogadores | ✅ | ✅ |

---

## Arquitetura do Sistema

### Estrutura de Arquivos

```
vanilla/dayz-server/mpmissions/dayzOffline.chernarusplus/
├── init.c                      # Arquivo principal de inicialização
├── admin/
│   ├── Commands.c              # Sistema de comandos do jogo
│   ├── ExternalActions.c       # Comunicação com sistemas externos
│   ├── Functions.c             # Funções utilitárias
│   ├── Globals.c               # Variáveis globais e enums
│   ├── Log.c                   # Sistema de logging
│   ├── Messages.c              # Sistema de mensagens
│   ├── PlayersLoadout.c        # Gerenciamento de loadout admin
│   ├── VehicleSpawner.c        # Sistema de spawn de veículos
│   ├── files/
│   │   ├── admin_ids.txt       # IDs dos administradores
│   │   ├── commands_to_execute.txt     # Comandos pendentes
│   │   ├── external_actions.txt        # Ações para sistemas externos
│   │   ├── messages_to_send.txt        # Mensagens globais pendentes
│   │   └── messages_private_to_send.txt # Mensagens privadas pendentes
│   ├── loadouts/
│   │   └── admin.json          # Loadout para administradores
│   └── models/
│       ├── LoadoutPlayer.c     # Modelo de dados do loadout
│       ├── LoadoutPlayerId.c   # Modelo de ID do jogador
│       └── SafeZoneData.c      # Modelo de dados (não usado no vanilla)
```

### Fluxo de Inicialização

1. **`main()`**: Inicializa o Hive e configura a data do mundo
2. **`CustomMission()`**: Inicializa sistema de logs e arquivos necessários
3. **`OnMissionStart()`**: Prepara o servidor para receber jogadores
4. **`OnUpdate()`**: Loop principal (executado a cada frame)
5. **`CreateCharacter()`**: Cria personagem quando jogador conecta
6. **`StartingEquipSetup()`**: Equipa jogador com itens iniciais padrão do DayZ

---

## Funcionalidades Principais

### 1. Sistema de Spawn Padrão

O servidor vanilla utiliza o sistema de spawn padrão do DayZ, com equipamento básico de sobrevivência.

#### Equipamento Inicial (StartingEquipSetup)

Cada jogador spawna com:
- **Bandagem** (BandageDressing) → Slot 2 da barra rápida
- **Chemlight** (aleatória: branca, amarela, verde ou vermelha) → Slot 1
- **Fruta** (aleatória: maçã, pêra ou ameixa) → Slot 3
- **Roupas aleatórias** definidas pelo jogo

#### Vida dos Itens

Todos os itens iniciais têm vida aleatória entre **45% e 65%**.

### 2. Sistema Administrativo

#### Identificação de Admins

Admins são identificados pelo arquivo `admin_ids.txt`:

```
76561198012345678
76561198087654321
```

#### Privilégios Especiais

Quando um admin conecta:
1. **Godmode automático**: `SetAllowDamage(false)`
2. **Loadout especial**: Carrega de `admin/loadouts/admin.json`
3. **Acesso a comandos exclusivos**: Comandos de admin disponíveis

#### Loadout Admin

O arquivo `admin.json` define o equipamento especial dos administradores.

**Estrutura**:
```json
[
  {
    "Name": "Admin",
    "IsActive": true,
    "Loadout": {
      "items": [
        {
          "name_type": "PlateCarrierVest",
          "subitems": []
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
          "attachments": []
        }
      },
      "explosives": []
    }
  }
]
```

### 3. Sistema de Rastreamento de Jogadores

O servidor monitora conexões e desconexões automaticamente.

#### Timeout de Detecção

```cpp
const float PLAYER_TIMEOUT = 15.0; // 15 segundos
```

Se um jogador não é detectado por 15 segundos, é considerado desconectado.

#### Mapa de Rastreamento

```cpp
ref map<string, float> lastSeenPlayers = new map<string, float>();
```

Armazena:
- **Chave**: ID do jogador
- **Valor**: Timestamp da última vez que foi visto

#### Eventos Gerados

**Conexão**:
```json
{
  "action": "update_player",
  "player_id": "76561198012345678",
  "player_name": "NomeDoJogador",
  "steam_id": "76561198012345678"
}
{
  "action": "player_connected",
  "player_id": "76561198012345678"
}
```

**Desconexão**:
```json
{
  "action": "player_disconnected",
  "player_id": "76561198012345678"
}
```

### 4. Sistema de Mensagens

#### Mensagens Públicas

Enviadas para **todos os jogadores online**.

**Arquivo**: `messages_to_send.txt`

**Formato**: Uma mensagem por linha
```
Bem-vindo ao servidor!
Leia as regras no Discord
```

**Verificação**: A cada 10 segundos

**Comportamento**:
1. Lê todas as linhas do arquivo
2. Envia cada mensagem para todos os jogadores
3. Limpa o arquivo

#### Mensagens Privadas

Enviadas para **jogadores específicos**.

**Arquivo**: `messages_private_to_send.txt`

**Formato**:
```
<player_id>;<mensagem>
```

**Exemplo**:
```
76561198012345678;Bem-vindo de volta ao servidor!
76561198087654321;[ERROR]Você foi banido temporariamente
```

**Tipos de Mensagem**:
- Mensagens normais: Verde (FRIENDLY)
- Mensagens com `[ERROR]`: Vermelho (IMPORTANT)

### 5. Sistema de Comandos Externos

Comandos podem ser executados através de sistemas externos.

#### Arquivo de Comandos

**Localização**: `admin/files/commands_to_execute.txt`

**Formato**:
```
<player_id> <comando> <parametros>
```

**Exemplo**:
```
76561198012345678 heal
76561198087654321 giveitem M4A1 1
```

**Verificação**: A cada 10 segundos

**Comportamento**:
1. Lê e executa todos os comandos
2. Limpa o arquivo automaticamente

### 6. Detecção de Eventos de Reinício

O servidor detecta automaticamente mensagens de aviso de reinício.

#### Eventos Detectados

**60 minutos antes**:
```
"O servidor vai ser reiniciado em 60 minutos"
```
Nenhuma ação especial (comentado no código)

**10 minutos antes**:
```
"O servidor vai ser reiniciado em 10 minutos"
```
Retorna imediatamente (sem ação)

**5 minutos antes**:
```
"O servidor vai ser reiniciado em 5 minutos"
```
Envia ação externa:
```json
{
  "action": "event_minutes_to_restart",
  "current_time": "12:25 (tarde)",
  "message": "O servidor vai ser reiniciado em 5 minutos"
}
```

**1 minuto antes**:
```
"O servidor vai ser reiniciado em 1 minutos"
```
Envia ação externa:
```json
{
  "action": "event_restarting"
}
```

---

## Comandos Disponíveis

### Comandos para Todos os Jogadores

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `!help` | Exibe lista de comandos | `!help` |
| `!kill` | Suicídio | `!kill` |

⚠️ **Nota**: Ao contrário do servidor Deathmatch, o Vanilla tem comandos muito limitados para jogadores comuns.

### Comandos Exclusivos para Admins

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `!help` | Exibe lista completa | `!help` |
| `!heal` | Se cura completamente | `!heal` |
| `!kill` | Suicídio | `!kill` |
| `!godmode` | Ativa invencibilidade | `!godmode` |
| `!ungodmode` | Desativa invencibilidade | `!ungodmode` |
| `!giveitem <item> <qtd>` | Cria itens | `!giveitem AKM 2` |
| `!spawnvehicle <tipo>` | Spawna veículo | `!spawnvehicle Sedan_02` |
| `!ghostmode` | Fica invisível | `!ghostmode` |
| `!unghostmode` | Fica visível | `!unghostmode` |
| `!teleport <x> <y> <z>` | Teleporta | `!teleport 7500 0 7500` |
| `!desbug` | Ajusta posição | `!desbug` |
| `!kick` | Reconecta jogador | `!kick` |
| `!getposition` | Mostra posição atual | `!getposition` |

### Detalhamento dos Comandos

#### `!heal`
Restaura completamente a saúde do admin:
- Health: 100
- Blood: 5000
- Shock: 0
- Energy: 4000
- Water: 4000

#### `!godmode` / `!ungodmode`
Ativa/desativa invencibilidade.

**Godmode**:
- `SetAllowDamage(false)`
- Jogador não recebe dano de nenhuma fonte

**Ungodmode**:
- `SetAllowDamage(true)`
- Volta ao comportamento normal

#### `!giveitem <item> <quantidade>`
Cria itens no inventário do admin.

**Comportamento**:
1. Tenta criar no inventário
2. Se inventário cheio, cria no chão próximo ao jogador
3. Pode criar múltiplas unidades

**Exemplo**:
```
!giveitem M4A1 2
!giveitem Ammo_556x45 5
```

#### `!spawnvehicle <tipo>`
Spawna um veículo completo próximo ao admin.

**Veículos Suportados**:
- CivilianSedan
- Sedan_02
- OffroadHatchback
- Offroad_02
- Truck_01_Covered
- Truck_01_Open

**Características**:
- Spawna a 2 metros do admin
- Completamente equipado (bateria, velas, rodas, portas)
- Combustível, óleo, freio e coolant cheios
- Vida máxima (1000 HP)
- Lifetime: 45 dias

**Exemplo**:
```
!spawnvehicle Sedan_02
```

#### `!ghostmode` / `!unghostmode`
Torna o admin invisível.

**Ghostmode**:
- `SetInvisible(true)`
- `SetScale(0.0001)` - Torna quase imperceptível
- Jogadores não conseguem ver o admin

**Unghostmode**:
- `SetInvisible(false)`
- `SetScale(1.0)` retorna ao tamanho normal (implícito)

#### `!teleport <x> <y> <z>`
Teleporta o admin para coordenadas específicas.

**Exemplo**:
```
!teleport 7500 0 7500
```

#### `!desbug`
Ajusta a posição do jogador com pequeno offset aleatório.

**Útil para**:
- Jogador preso em parede
- Jogador caído em textura
- Qualquer problema de posicionamento

**Comportamento**:
- Offset X: -1.0 a +1.0 metros
- Offset Y: -0.5 a +0.5 metros  
- Offset Z: -1.0 a +1.0 metros

#### `!kick`
Desconecta o próprio jogador (admin) do servidor.

**Útil para**:
- Forçar reconexão quando bugado
- Testar sistema de reconexão

**Mensagem exibida**:
```
"Seu jogador está bugado. Realizando ajuste..."
```

#### `!getposition`
Captura a posição atual do admin.

**Comportamento**:
1. Exibe posição no jogo
2. Salva em `position.log`
3. Salva em `init.log` (DEBUG)

**Formato da posição**:
```
<7500.5, 10.2, 7500.8>
```

---

## Arquivos de Configuração

### 1. `admin_ids.txt`

Lista de IDs de jogadores com privilégios de admin.

**Formato**: Um ID por linha
```
76561198012345678
76561198087654321
```

**Funcionalidades**:
- Carrega automaticamente no spawn
- Godmode por padrão
- Acesso a comandos de admin
- Loadout especial

### 2. `admin.json`

Loadout especial para administradores.

**Estrutura**: Veja seção [Loadout Admin](#loadout-admin)

**Funcionalidades**:
- Aplicado automaticamente quando admin spawna
- Suporta armas primária, secundária e pequena
- Suporta itens, subitems e explosivos
- Pentes extras são criados automaticamente

### 3. Arquivos de Comunicação (Pasta `files/`)

#### `commands_to_execute.txt`
Comandos pendentes a serem executados.

**Formato**:
```
<player_id> <comando> <parametros>
```

**Exemplo**:
```
76561198012345678 heal
76561198012345678 giveitem M4A1 1
76561198012345678 teleport 7500 0 7500
```

**Verificação**: A cada 10 segundos

#### `external_actions.txt`
Ações enviadas para sistemas externos.

**Formato**: JSON (uma ação por linha)

**Exemplo**:
```json
{"action":"player_connected","player_id":"76561198012345678"}
{"action":"event_start_finished","current_time":"12:30 (tarde)"}
{"action":"player_disconnected","player_id":"76561198012345678"}
```

#### `messages_to_send.txt`
Mensagens globais pendentes.

**Formato**: Uma mensagem por linha

**Exemplo**:
```
Servidor será reiniciado em 10 minutos
Evento especial começando em 5 minutos
```

#### `messages_private_to_send.txt`
Mensagens privadas pendentes.

**Formato**:
```
<player_id>;<mensagem>
```

**Exemplo**:
```
76561198012345678;Bem-vindo ao servidor!
76561198087654321;[ERROR]Você violou as regras
```

---

## Sistema de Logs

### Tipos de Log

O servidor vanilla utiliza os mesmos tipos de log do deathmatch:

#### 1. `init.log`
Log principal com todos os eventos do servidor.

**Níveis**:
- `[INFO]`: Informações gerais
- `[DEBUG]`: Detalhes para debugging
- `[ERROR]`: Erros e falhas

**Eventos Registrados**:
- Inicialização da CustomMission
- Início da missão
- Conexão/desconexão de jogadores
- Execução de comandos
- Carregamento de loadouts
- Erros de parsing/execução

#### 2. `position.log`
Log de coordenadas capturadas com `!getposition`.

**Formato**:
```
<7500.5, 10.2, 7500.8>
<6234.1, 5.3, 8912.4>
```

### Funções de Log

```cpp
void WriteToLog(string content, LogFile file = LogFile.INIT, bool internalCall = false, LogType type = LogType.DEBUG)
```

**Parâmetros**:
- `content`: Mensagem a ser logada
- `file`: Arquivo de destino (INIT ou POSITION)
- `internalCall`: Se true, não loga erros de abertura de arquivo
- `type`: Tipo do log (DEBUG, INFO, ERROR)

**Exemplos de Uso**:
```cpp
WriteToLog("Servidor iniciado", LogFile.INIT, false, LogType.INFO);
WriteToLog("Jogador não encontrado", LogFile.INIT, false, LogType.ERROR);
WriteToLog("Detalhes da operação", LogFile.INIT, false, LogType.DEBUG);
```

### Localização dos Logs

```
[ServidorDayZ]/profiles/init.log
[ServidorDayZ]/profiles/position.log
```

### Reset de Logs

Logs são automaticamente resetados na inicialização:

```cpp
void ResetLog(string logfile = "init.log")
```

Chamado em:
```cpp
void CustomMission() {
    ResetLog();
    // ...
}
```

---

## Integração Externa

O servidor vanilla tem o mesmo sistema de integração do deathmatch, mas com menos eventos.

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
  "current_time": "12:30 (tarde)"
}
```

**Servidor Reiniciando (1 minuto)**:
```json
{"action": "event_restarting"}
```

**Aviso de Reinício (5 minutos)**:
```json
{
  "action": "event_minutes_to_restart",
  "current_time": "12:25 (tarde)",
  "message": "O servidor vai ser reiniciado em 5 minutos"
}
```

### Implementação da API Externa

O sistema externo deve ler `external_actions.txt` periodicamente.

**Exemplo Python**:

```python
import json
import time
from pathlib import Path

ACTIONS_FILE = Path("admin/files/external_actions.txt")

def process_actions():
    if not ACTIONS_FILE.exists():
        return
    
    try:
        with open(ACTIONS_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            try:
                action = json.loads(line)
                handle_action(action)
            except json.JSONDecodeError as e:
                print(f"JSON inválido: {line} - Erro: {e}")
        
        # Limpa o arquivo
        with open(ACTIONS_FILE, 'w', encoding='utf-8') as f:
            f.write('')
            
    except Exception as e:
        print(f"Erro ao processar ações: {e}")

def handle_action(action):
    action_type = action.get('action')
    
    if action_type == 'player_connected':
        player_id = action.get('player_id')
        print(f"Jogador {player_id} conectou")
        # Enviar para Discord, banco de dados, etc.
        
    elif action_type == 'player_disconnected':
        player_id = action.get('player_id')
        print(f"Jogador {player_id} desconectou")
        
    elif action_type == 'event_start_finished':
        current_time = action.get('current_time')
        print(f"Servidor iniciado às {current_time}")
        
    elif action_type == 'event_restarting':
        print("Servidor vai reiniciar")
        
    else:
        print(f"Ação desconhecida: {action_type}")

# Loop principal
if __name__ == '__main__':
    print("Monitor iniciado...")
    while True:
        process_actions()
        time.sleep(5)  # Verifica a cada 5 segundos
```

### Envio de Comandos para o Servidor

Sistema externo pode enviar comandos escrevendo em `commands_to_execute.txt`.

**Exemplo Python**:

```python
def send_command(player_id: str, command: str, *args):
    """Envia comando para o servidor DayZ"""
    
    cmd_line = f"{player_id} {command}"
    if args:
        cmd_line += " " + " ".join(str(arg) for arg in args)
    cmd_line += "\n"
    
    with open("admin/files/commands_to_execute.txt", 'a', encoding='utf-8') as f:
        f.write(cmd_line)
    
    print(f"Comando enviado: {cmd_line.strip()}")

# Exemplos de uso
send_command("76561198012345678", "heal")
send_command("76561198012345678", "giveitem", "M4A1", "1")
send_command("76561198012345678", "teleport", "7500", "0", "7500")
```

### Envio de Mensagens para Jogadores

**Mensagem Global**:
```python
def send_global_message(message: str):
    with open("admin/files/messages_to_send.txt", 'a', encoding='utf-8') as f:
        f.write(message + "\n")
```

**Mensagem Privada**:
```python
def send_private_message(player_id: str, message: str, is_error: bool = False):
    prefix = "[ERROR]" if is_error else ""
    msg = f"{player_id};{prefix}{message}\n"
    
    with open("admin/files/messages_private_to_send.txt", 'a', encoding='utf-8') as f:
        f.write(msg)
```

**Exemplos**:
```python
# Mensagem global
send_global_message("Servidor será reiniciado em 5 minutos")

# Mensagem privada normal
send_private_message("76561198012345678", "Bem-vindo de volta!")

# Mensagem privada de erro
send_private_message("76561198012345678", "Você foi banido", is_error=True)
```

---

## Manutenção e Troubleshooting

### Problemas Comuns

#### 1. Admin não recebe loadout especial

**Possíveis causas**:
- ID não está em `admin_ids.txt`
- Arquivo `admin.json` não existe ou está malformado
- JSON com erro de sintaxe

**Solução**:
1. Verificar se o ID está correto em `admin_ids.txt`
2. Validar JSON em https://jsonlint.com/
3. Verificar logs para mensagens de erro:
   ```
   [ERROR] Arquivo de loadout admin não encontrado
   [ERROR] JSON de loadout admin carregado, mas lista vazia ou nula
   ```

#### 2. Comandos não estão sendo executados

**Possíveis causas**:
- Arquivo `commands_to_execute.txt` não existe
- Formato incorreto dos comandos
- Player ID errado
- Jogador offline ou morto

**Solução**:
1. Verificar se arquivo existe em `admin/files/`
2. Conferir formato: `<player_id> <comando> <params>`
3. Verificar logs:
   ```
   [INFO] PlayerID NomeDoJogador (ID) digitou comando heal
   [ERROR] Player não identificado
   ```
4. Garantir que jogador está vivo e online

#### 3. Mensagens não são enviadas

**Possíveis causas**:
- Arquivos de mensagens não existem
- Formato incorreto (mensagens privadas)
- Sistema de mensagens está desabilitado

**Solução**:
1. Verificar arquivos:
   - `admin/files/messages_to_send.txt`
   - `admin/files/messages_private_to_send.txt`
2. Para mensagens privadas, usar formato:
   ```
   76561198012345678;Sua mensagem aqui
   ```
3. Verificar logs:
   ```
   [ERROR] Arquivo de mensagens não encontrado ou falha ao abrir
   [ERROR] Mensagem privada fora do padrão
   ```

#### 4. Jogadores desconectam mas sistema não detecta

**Possíveis causas**:
- Timeout muito alto
- Map `lastSeenPlayers` não inicializado

**Solução**:
1. Ajustar timeout em `Globals.c`:
   ```cpp
   const float PLAYER_TIMEOUT = 10.0; // Reduzir para 10 segundos
   ```
2. Verificar logs:
   ```
   [INFO] Jogador logou 76561198012345678
   [INFO] Jogador deslogou 76561198012345678
   ```

#### 5. Veículos spawnados desaparecem

**Possíveis causas**:
- Central Economy está removendo veículos
- Lifetime muito curto
- Veículos não estão sendo salvos corretamente

**Solução**:
1. Veículos spawnados por comando têm lifetime de 45 dias
2. Verificar função `SaveVehicle()` em `VehicleSpawner.c`
3. Conferir se CE está configurado corretamente
4. Logs devem mostrar:
   ```
   [INFO] Veículo spawnado com sucesso: Sedan_02
   ```

### Otimização

O servidor vanilla já é otimizado por padrão devido à ausência de sistemas pesados.

#### Reduzir Frequência de Verificação

Para servidores com muitos jogadores, aumentar intervalo de verificação:

```cpp
// Em CustomMission
float m_AdminCheckCooldown10 = 20.0; // De 10s para 20s
```

**Impacto**:
- ✅ Menos carga no servidor
- ❌ Comandos e mensagens processados mais lentamente

### Backup

#### Arquivos Críticos

```
admin/files/admin_ids.txt
admin/loadouts/admin.json
admin/*.c
```

#### Script de Backup

```bash
#!/bin/bash
# backup_vanilla.sh

BACKUP_DIR="/backups/dayz/vanilla"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_DIR/vanilla_$DATE.tar.gz" \
    admin/files/ \
    admin/loadouts/ \
    admin/*.c \
    init.c

echo "Backup criado: vanilla_$DATE.tar.gz"

# Manter apenas últimos 7 backups
cd "$BACKUP_DIR"
ls -t vanilla_*.tar.gz | tail -n +8 | xargs -r rm
```

### Monitoramento

#### Script de Monitoramento

```bash
#!/bin/bash
# monitor_vanilla.sh

LOGFILE="/path/to/profiles/init.log"

echo "Monitorando logs..."

# Monitorar erros
tail -f "$LOGFILE" | grep --line-buffered "\[ERROR\]" | while read line; do
    echo "❌ ERRO: $line"
    # Enviar notificação (Discord, email, etc.)
done &

# Monitorar conexões
tail -f "$LOGFILE" | grep --line-buffered "Jogador logou\|Jogador deslogou" | while read line; do
    echo "👤 $line"
done &

wait
```

#### Métricas Importantes

1. **Jogadores Online**:
   ```bash
   grep "Jogador logou" init.log | wc -l
   ```

2. **Erros no Log**:
   ```bash
   grep "\[ERROR\]" init.log | tail -20
   ```

3. **Últimas Conexões**:
   ```bash
   grep "Jogador logou" init.log | tail -10
   ```

4. **Últimas Desconexões**:
   ```bash
   grep "Jogador deslogou" init.log | tail -10
   ```

### Debug Avançado

#### Ativar Logs Detalhados

Descomentar linhas de debug no código:

**Em `Functions.c`**:
```cpp
WriteToLog("GetPlayerByID(): Jogador encontrado: " + player.GetIdentity().GetName(), LogFile.INIT, false, LogType.DEBUG);
```

**Em `init.c` - OnEvent**:
```cpp
WriteToLog("param1: " + chatParams.param1, LogFile.INIT, false, LogType.DEBUG);
WriteToLog("param2: " + chatParams.param2, LogFile.INIT, false, LogType.DEBUG);
WriteToLog("param3: " + chatParams.param3, LogFile.INIT, false, LogType.DEBUG);
```

**Em `Messages.c`**:
```cpp
WriteToLog("Verificando mensagens em: " + path, LogFile.INIT, false, LogType.DEBUG);
WriteToLog("Mensagens lidas: " + count.ToString(), LogFile.INIT, false, LogType.DEBUG);
```

#### Teste de Comandos

Criar arquivo de teste:

```bash
# test_commands.sh
PLAYER_ID="76561198012345678"

echo "$PLAYER_ID heal" > admin/files/commands_to_execute.txt
sleep 12
echo "$PLAYER_ID giveitem M4A1 1" >> admin/files/commands_to_execute.txt
sleep 12
echo "$PLAYER_ID godmode" >> admin/files/commands_to_execute.txt
```

### Migração do Vanilla para Deathmatch

Se desejar migrar para o servidor Deathmatch:

1. **Copiar arquivos de admin**:
   ```bash
   cp vanilla/admin/files/admin_ids.txt deathmatch/admin/files/
   cp vanilla/admin/loadouts/admin.json deathmatch/admin/loadouts/
   ```

2. **Configurar mapas** (deathmatch):
   - Editar `deathmatch_config.json`
   - Definir spawn zones
   - Definir wall zones

3. **Testar progressivamente**:
   - Iniciar com um mapa simples
   - Testar votações
   - Configurar loadouts

---

## Comparação com Deathmatch

### Quando usar Vanilla

✅ **Vantagens**:
- Mais simples de configurar e manter
- Menos carga no servidor
- Experiência DayZ tradicional
- Ideal para servidores PvE ou RP
- Menos bugs potenciais

❌ **Desvantagens**:
- Menos funcionalidades
- Sem sistema de votação
- Sem loadouts personalizáveis
- Sem controle de zonas
- Sem limpeza automática

### Quando usar Deathmatch

✅ **Vantagens**:
- Experiência PvP otimizada
- Mapas rotativos
- Loadouts customizáveis
- Sistema de votação democrático
- Limpeza automática
- Clima controlado

❌ **Desvantagens**:
- Mais complexo
- Requer mais configuração
- Maior carga no servidor
- Mais arquivos para manter

### Tabela Comparativa

| Aspecto | Vanilla | Deathmatch |
|---------|---------|------------|
| **Complexidade** | Baixa | Alta |
| **Manutenção** | Fácil | Média |
| **Performance** | Excelente | Boa |
| **Funcionalidades** | Básicas | Avançadas |
| **Ideal para** | PvE, RP, Survival | PvP, Deathmatch |
| **Tamanho do código** | ~600 linhas | ~3000 linhas |
| **Arquivos de config** | 2 | 6+ |
| **Sistema de votação** | ❌ | ✅ |
| **Loadouts custom** | ❌ | ✅ |
| **Integração externa** | ✅ | ✅ |

---

## Referências e Recursos

### Documentação Oficial DayZ

- [DayZ Server Configuration](https://community.bistudio.com/wiki/DayZ:Server_Configuration)
- [Enforce Script Documentation](https://community.bistudio.com/wiki/Enfusion:Enforce_Script_Syntax)

### Classes Importantes

- `PlayerBase`: Jogador
- `EntityAI`: Entidades do jogo
- `Weapon_Base`: Armas
- `Magazine`: Carregadores
- `Car`: Veículos
- `PlayerIdentity`: Identidade do jogador

### Ferramentas Úteis

- **JSON Validator**: https://jsonlint.com/
- **DayZ Server Tools**: https://github.com/Arkensor/DayZCommunityOfflineMode
- **DayZ Types Editor**: Para editar types.xml

### Scripts Úteis

#### Verificador de Sintaxe JSON

```bash
#!/bin/bash
# check_json.sh

echo "Verificando admin.json..."
if python3 -m json.tool admin/loadouts/admin.json > /dev/null 2>&1; then
    echo "✅ admin.json está OK"
else
    echo "❌ admin.json tem erros"
fi
```

#### Monitor de Conexões

```python
# connection_monitor.py
import time
from datetime import datetime

LOG_FILE = "profiles/init.log"
last_position = 0

print("Monitor de conexões iniciado...")

while True:
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            f.seek(last_position)
            new_lines = f.readlines()
            last_position = f.tell()
            
            for line in new_lines:
                if "Jogador logou" in line or "Jogador deslogou" in line:
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    print(f"[{timestamp}] {line.strip()}")
        
        time.sleep(2)
    except KeyboardInterrupt:
        print("\nMonitor encerrado.")
        break
    except Exception as e:
        print(f"Erro: {e}")
        time.sleep(5)
```

---

## Changelog

### Versão Atual

**Funcionalidades Implementadas**:
- ✅ Sistema de spawn padrão DayZ
- ✅ Sistema administrativo
- ✅ Loadout especial para admins
- ✅ Rastreamento de jogadores
- ✅ Sistema de mensagens (público e privado)
- ✅ Comandos básicos para jogadores
- ✅ Comandos avançados para admins
- ✅ Integração com sistemas externos
- ✅ Logging detalhado
- ✅ Detecção de eventos de reinício
- ✅ Sistema de comandos externos
- ✅ Spawn de veículos para admins

**Melhorias Futuras Possíveis**:
- Sistema de loadouts personalizáveis para jogadores
- Teleports salvos
- Zonas seguras
- Sistema de economia customizado
- Estatísticas de jogadores
- Integração com Discord bot

---

*Documentação gerada em: 2025-10-12*
*Servidor: DayZ Vanilla - Beco Gaming*

