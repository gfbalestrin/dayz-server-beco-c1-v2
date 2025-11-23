# Fluxo de Dados entre Módulos do Mapa

## Visão Geral

Este documento descreve como os dados fluem entre os módulos do sistema de mapa, incluindo estados globais, comunicação entre módulos e padrões de compartilhamento de dados.

## Estado Global (MapState)

Para gerenciar variáveis compartilhadas entre módulos, foi criado um objeto `MapState` que centraliza o estado global:

```javascript
const MapState = {
    // Mapa Leaflet
    map: null,
    mapConfigs: {},
    mapConfigList: [],
    currentMapConfig: null,
    mapImageOverlay: null,
    
    // Dados de entidades
    playersData: {},
    vehiclesData: {},
    containersData: {},
    fencesData: {},
    
    // Marcadores
    playerMarkers: {},
    vehicleMarkers: {},
    containerMarkers: {},
    fenceMarkers: {},
    killMarkers: [],
    damageMarkers: [],
    
    // Trails
    playerTrails: {},
    vehicleTrails: {},
    containerTrails: {},
    fenceTrails: {},
    
    // Estados anteriores (para detecção de mudanças)
    previousPlayersData: {},
    previousVehiclesData: {},
    previousContainersData: {},
    previousFencesData: {},
    previousKillsData: [],
    previousDamagesData: [],
    
    // Estados de exibição
    showPlayers: true,
    showVehicles: false,
    showContainers: false,
    showFences: false,
    showKills: false,
    showDamages: false,
    showTrails: false,
    
    // Filtros e seleções
    selectedPlayerFilters: [],
    trailDateFilter: { enabled: false, startDate: null, endDate: null },
    
    // Contextos
    currentPointContext: null,
    currentPlayerContext: null,
    
    // Modos e teleporte
    currentMode: 'normal',
    teleportTargetPlayer: null,
    teleportTargetVehicle: null,
    vehicleTeleportUseMapPosition: false,
    
    // Escaneamento de região
    scanCircle: null,
    scanMarkers: {},
    scanRegionCircle: null,
    isScanning: false,
    
    // Notificações
    notificationsEnabled: true,
    
    // Histórico
    currentHistoryType: null,
    currentHistoryId: null,
    currentHistoryPagination: { limit: 50, offset: 0, date_from: null, date_to: null },
    
    // Auto-refresh
    autoRefreshInterval: null,
    
    // Clusters
    containerClusterGroup: null
};
```

## Fluxos de Dados Principais

### 1. Carregamento de Dados

```
map.js (principal)
  └─> loadPositions() [map-players.js]
        └─> $.get('/api/players/positions')
              └─> updatePositions(data) [map-players.js]
                    ├─> detectPlayerChanges() [map-players.js]
                    │     └─> addNotificationToLog() [map-notifications.js]
                    ├─> createMarkerIcon() [map-icons.js]
                    ├─> convertToMapCoords() [map-utils.js]
                    └─> MapState.playerMarkers atualizado
```

### 2. Detecção de Mudanças

```
updateVehicles(data) [map-vehicles.js]
  ├─> detectVehicleChanges() [map-vehicles.js]
  │     └─> Compara MapState.previousVehiclesData com data
  │           └─> addNotificationToLog() [map-notifications.js]
  └─> MapState.previousVehiclesData = data (salva estado)
```

### 3. Sistema de Trails

```
loadPlayerTrail(playerId) [map-players.js]
  └─> $.get('/api/players/${playerId}/trail')
        └─> drawTrail(playerId, trail) [map-players.js]
              ├─> convertToMapCoords() [map-utils.js]
              ├─> getPlayerColor() [map-utils.js]
              └─> MapState.playerTrails[playerId] atualizado
```

### 4. Sistema de Teleporte

```
handleTeleportClick(e) [map-teleport.js]
  ├─> Verifica MapState.teleportTargetVehicle
  │     └─> pixelToDayz() [map-utils.js]
  │           └─> executeVehicleTeleport() [map-teleport.js]
  │                 └─> $.ajax('/api/vehicles/${id}/teleport')
  └─> Verifica MapState.selectedPlayerFilters
        └─> pixelToDayz() [map-utils.js]
              └─> $.ajax('/api/players/${id}/teleport')
```

### 5. Sistema de Escaneamento de Região

```
handleScanClick(e) [map-teleport.js]
  ├─> Obtém raio do input (#scanRadiusInput)
  ├─> pixelToDayz() [map-utils.js]
  └─> scanRegion(coordX, coordY, coordZ, radius) [map-players.js]
        ├─> Verifica MapState.isScanning (prevenção de múltiplos scans)
        ├─> setMode('normal') (volta ao modo normal imediatamente)
        ├─> showScanRegionVisual() [map-players.js]
        │     └─> Cria círculo visual permanente no mapa
        └─> $.ajax('/api/scan-region')
              └─> startScanPolling(requestId) [map-players.js]
                    └─> $.get('/api/commands/results/${requestId}')
                          └─> markObjectsOnMap(scanData) [map-players.js]
                                ├─> convertToMapCoords() [map-utils.js]
                                ├─> createScanObjectIcon() [map-players.js]
                                └─> MapState.scanMarkers atualizado
```

### 6. Sistema de Notificações

```
detectPlayerChanges() [map-players.js]
  └─> addNotificationToLog('info', message) [map-notifications.js]
        └─> Verifica MapState.notificationsEnabled
              └─> Atualiza DOM (#notificationLogContent)
```

## Comunicação entre Módulos

### Padrão 1: Funções Públicas

Módulos expõem funções públicas que podem ser chamadas por outros módulos:

```javascript
// map-players.js
function loadPositions() {
    // ...
}

// map.js (principal)
loadPositions(); // Chama função pública
```

### Padrão 2: Estado Global Compartilhado

Módulos acessam e modificam o estado global via `MapState`:

```javascript
// map-players.js
MapState.playerMarkers[playerId] = marker;

// map-teleport.js
if (MapState.selectedPlayerFilters.length > 0) {
    // Usa estado de players
}
```

### Padrão 3: Callbacks e Event Listeners

O módulo principal registra event listeners que chamam funções de outros módulos:

```javascript
// map.js (principal)
$('#toggleVehiclesBtn').on('click', toggleVehiclesDisplay);
// toggleVehiclesDisplay está em map-vehicles.js
```

## Estados Locais vs Globais

### Estados Locais (dentro do módulo)

Variáveis que são usadas apenas dentro de um módulo específico:

```javascript
// map-utils.js
const BASE_MAP_SIZE = 4096; // Constante local
```

### Estados Globais (MapState)

Variáveis que precisam ser compartilhadas entre múltiplos módulos:

```javascript
// Acessado por map-players.js, map-teleport.js, etc.
MapState.selectedPlayerFilters = [];
```

## Dependências de Dados

### map-players.js depende de:
- `MapState.map` (de map-core.js)
- `MapState.notificationsEnabled` (de map-notifications.js)
- Funções de map-utils.js, map-icons.js, map-history.js

### map-teleport.js depende de:
- `MapState.map` (de map-core.js)
- `MapState.selectedPlayerFilters` (de map-players.js)
- `MapState.vehiclesData` (de map-vehicles.js)
- `MapState.isScanning` (de map-players.js)
- Funções de map-utils.js

### map-players.js (escaneamento) depende de:
- `MapState.map` (de map-core.js)
- `MapState.currentMapConfig` (de map-core.js)
- Funções de map-utils.js para conversão de coordenadas

### map-vehicles.js depende de:
- `MapState.map` (de map-core.js)
- `MapState.notificationsEnabled` (de map-notifications.js)
- Funções de map-utils.js, map-icons.js, map-history.js

## Ciclo de Vida dos Dados

### 1. Inicialização
```
map.js (principal)
  └─> initializeMapConfigs() [map-core.js]
  └─> initMap() [map-core.js]
  └─> loadPositions() [map-players.js]
```

### 2. Atualização (Auto-refresh)
```
map.js (principal)
  └─> setInterval() a cada 60s
        ├─> loadPositions() [map-players.js]
        ├─> loadVehicles() [map-vehicles.js]
        ├─> loadContainers() [map-containers.js]
        └─> loadFences() [map-fences.js]
```

### 3. Interação do Usuário
```
Usuário clica em botão
  └─> Event listener em map.js
        └─> Função do módulo específico
              └─> Atualiza MapState
                    └─> Atualiza visualização
```

## Boas Práticas

### 1. Acesso ao Estado Global
Sempre use `MapState` para acessar estado compartilhado:
```javascript
// ✅ Correto
if (MapState.showVehicles) {
    loadVehicles();
}

// ❌ Incorreto (variável global direta)
if (showVehicles) {
    loadVehicles();
}
```

### 2. Modificação de Estado
Modifique estado apenas no módulo responsável:
```javascript
// ✅ Correto - map-players.js modifica seu próprio estado
MapState.playerMarkers[playerId] = marker;

// ❌ Evite - outro módulo modificando estado de players
// (exceto em casos específicos documentados)
```

### 3. Comunicação entre Módulos
Use funções públicas para comunicação:
```javascript
// ✅ Correto
toggleVehiclesDisplay(); // Função pública

// ❌ Evite acesso direto a variáveis internas
```

### 4. Inicialização
Sempre verifique se dependências estão inicializadas:
```javascript
// ✅ Correto
if (!MapState.map) {
    console.error('Mapa não inicializado');
    return;
}
```

## Debugging

### Verificar Estado Global
```javascript
console.log('Estado atual:', MapState);
console.log('Jogadores visíveis:', MapState.showPlayers);
console.log('Filtros ativos:', MapState.selectedPlayerFilters);
```

### Rastrear Mudanças
Adicione logs quando modificar estado crítico:
```javascript
MapState.currentMode = mode;
console.log('Modo alterado para:', mode);
```

