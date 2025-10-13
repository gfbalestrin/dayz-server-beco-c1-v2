# Sistema de Rastreamento de Jogadores Ativos

## Visão Geral

O sistema de rastreamento de jogadores ativos permite monitorar todos os jogadores conectados ao servidor em tempo real, armazenando informações detalhadas sobre cada conexão.

## Arquivos

### Modelo: `ActivePlayer.c`
**Localização:** `admin/models/ActivePlayer.c`

Classe que representa um jogador ativo/conectado no servidor.

**Propriedades:**
- `PlayerName` (string) - Nome do jogador
- `SteamId` (string) - Steam ID do jogador
- `ConnectedTime` (float) - Timestamp de quando o jogador conectou

**Métodos:**
- `GetPlayerName()` - Retorna o nome do jogador
- `GetSteamId()` - Retorna o Steam ID
- `GetConnectedDuration()` - Retorna há quanto tempo (em segundos) o jogador está conectado
- `IsSamePlayer(string steamId)` - Verifica se o Steam ID corresponde a este jogador

## Implementação no CustomMission

### Variável de Instância
```enforscript
ref array<ref ActivePlayer> ActivePlayers;
```
Lista que armazena todos os jogadores atualmente conectados.

### Funções Disponíveis

#### AddActivePlayer(string playerName, string steamId)
Adiciona um jogador à lista de jogadores ativos.
- Verifica se o jogador já existe antes de adicionar
- Registra no log quando um jogador é adicionado

**Exemplo:**
```enforscript
AddActivePlayer("JohnDoe", "76561198012345678");
```

#### RemoveActivePlayer(string steamId)
Remove um jogador da lista pelo Steam ID.
- Busca o jogador na lista
- Remove e registra no log

**Exemplo:**
```enforscript
RemoveActivePlayer("76561198012345678");
```

#### GetActivePlayerBySteamId(string steamId)
Busca e retorna um objeto ActivePlayer pelo Steam ID.
- Retorna `null` se não encontrar

**Exemplo:**
```enforscript
ActivePlayer player = GetActivePlayerBySteamId("76561198012345678");
if (player)
{
    Print("Jogador encontrado: " + player.GetPlayerName());
}
```

#### GetActivePlayersCount()
Retorna a quantidade total de jogadores ativos.

**Exemplo:**
```enforscript
int total = GetActivePlayersCount();
Print("Total de jogadores online: " + total);
```

#### ListActivePlayers()
Lista todos os jogadores ativos no log com informações detalhadas.
- Nome do jogador
- Steam ID
- Tempo conectado

**Exemplo:**
```enforscript
ListActivePlayers();
```

**Saída no log:**
```
=== JOGADORES ATIVOS (3) ===
  [1] JohnDoe | SteamID: 76561198012345678 | Conectado há: 245.5s
  [2] JaneDoe | SteamID: 76561198087654321 | Conectado há: 120.3s
  [3] PlayerThree | SteamID: 76561198011111111 | Conectado há: 89.7s
```

## Integração com Eventos

### ClientConnectedEventTypeID
Quando um jogador conecta ao servidor, o evento `ClientConnectedEventTypeID` é disparado e automaticamente:
1. Captura o nome e Steam ID do jogador
2. Adiciona à lista de jogadores ativos via `AddActivePlayer()`
3. Registra no log

### ClientDisconnectedEventTypeID
Quando um jogador desconecta, o evento `ClientDisconnectedEventTypeID` é disparado e automaticamente:
1. Identifica o jogador pelo PlayerIdentity
2. Remove da lista via `RemoveActivePlayer()`
3. Registra no log

### ClientReadyEventTypeID
Quando um jogador fica pronto para jogar:
1. Exibe o total de jogadores conectados no log

## Exemplos de Uso

### Exemplo 1: Verificar se um jogador específico está online
```enforscript
bool IsPlayerOnline(string steamId)
{
    ActivePlayer player = GetActivePlayerBySteamId(steamId);
    return player != null;
}
```

### Exemplo 2: Obter lista de todos os Steam IDs online
```enforscript
array<string> GetAllOnlineSteamIds()
{
    array<string> steamIds = new array<string>();
    for (int i = 0; i < ActivePlayers.Count(); i++)
    {
        ActivePlayer player = ActivePlayers.Get(i);
        if (player)
            steamIds.Insert(player.GetSteamId());
    }
    return steamIds;
}
```

### Exemplo 3: Encontrar jogadores por nome parcial
```enforscript
array<ref ActivePlayer> FindPlayersByName(string partialName)
{
    array<ref ActivePlayer> results = new array<ref ActivePlayer>();
    
    for (int i = 0; i < ActivePlayers.Count(); i++)
    {
        ActivePlayer player = ActivePlayers.Get(i);
        if (player && player.GetPlayerName().Contains(partialName))
        {
            results.Insert(player);
        }
    }
    
    return results;
}
```

### Exemplo 4: Broadcast mensagem apenas para jogadores conectados há mais de 5 minutos
```enforscript
void BroadcastToVeterans(string message)
{
    for (int i = 0; i < ActivePlayers.Count(); i++)
    {
        ActivePlayer activePlayer = ActivePlayers.Get(i);
        if (activePlayer && activePlayer.GetConnectedDuration() > 300.0) // 5 minutos
        {
            // Buscar o PlayerBase e enviar mensagem
            PlayerBase player = GetPlayerById(activePlayer.GetSteamId());
            if (player)
            {
                player.MessageStatus(message);
            }
        }
    }
}
```

## Logs

O sistema registra automaticamente:
- ✅ Quando um jogador é adicionado à lista
- ✅ Quando um jogador é removido da lista
- ✅ Se tentar adicionar um jogador que já existe
- ⚠️ Se tentar remover um jogador que não está na lista

## Diferenças do Sistema Anterior

### Antes:
```enforscript
ref set<string> ActivePlayers;  // Apenas Steam IDs
```

### Agora:
```enforscript
ref array<ref ActivePlayer> ActivePlayers;  // Objetos completos com:
// - Nome do jogador
// - Steam ID
// - Timestamp de conexão
// - Métodos úteis
```

## Vantagens

1. **Informações Completas** - Armazena nome e Steam ID
2. **Rastreamento de Tempo** - Sabe há quanto tempo cada jogador está conectado
3. **Facilidade de Busca** - Métodos helper para encontrar jogadores
4. **Extensível** - Fácil adicionar mais propriedades no futuro (ex: IP, last position, etc)
5. **Type-Safe** - Usa objetos tipados ao invés de strings simples

## Notas Técnicas

- A lista é inicializada automaticamente em `OnMissionStart()`
- As operações são thread-safe dentro do contexto do servidor
- O Steam ID é usado como identificador único
- O sistema não persiste dados entre reinícios do servidor (em memória apenas)

