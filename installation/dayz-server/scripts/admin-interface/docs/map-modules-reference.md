# Referência Rápida dos Módulos do Mapa

## Guia de Referência Rápida

Este documento lista todas as funções e variáveis públicas de cada módulo para referência rápida.

## map-utils.js

### Constantes
- `BASE_MAP_SIZE`: 4096 (tamanho padrão do mapa em pixels)
- `iconColors`: Array de cores para jogadores

### Funções Públicas
- `convertToMapCoords(pixelCoords)`: Converte coordenadas de pixel para Leaflet
- `pixelToDayz(pixelCoords)`: Converte coordenadas de pixel para DayZ
- `getTooltipDirectionForPoint(lat, lng)`: Calcula direção do tooltip
- `getPopupOffsetForPoint(lat, lng)`: Calcula offset do popup
- `getPlayerColor(playerId)`: Gera cor única para jogador

## map-icons.js

### Funções Públicas
- `createMarkerIcon(color)`: Cria ícone de marcador de jogador
- `createVehicleIcon(hasMoved)`: Cria ícone de veículo
- `createContainerIcon(containerType)`: Cria ícone de container
- `createContainerClusterIcon(cluster)`: Cria ícone de cluster de containers
- `createFenceIcon(fence, hasRecentAttack)`: Cria ícone de construção
- `createKillIcon()`: Cria ícone de kill
- `createKillerIcon()`: Cria ícone de killer
- `createVictimIcon()`: Cria ícone de vítima
- `createDamageAttackerIcon()`: Cria ícone de atacante
- `createDamageVictimIcon()`: Cria ícone de vítima de dano

## map-core.js

### Variáveis Globais (via MapState)
- `map`: Instância do mapa Leaflet
- `mapConfigs`: Objeto com configurações de mapas
- `mapConfigList`: Array de configurações
- `currentMapConfig`: Configuração atual
- `mapImageOverlay`: Overlay da imagem do mapa

### Funções Públicas
- `initializeMapConfigs()`: Inicializa configurações de mapas
- `setupMapSelector()`: Configura seletor de mapas
- `initMap()`: Inicializa o mapa Leaflet
- `switchMap(mapId)`: Troca o mapa exibido
- `applyMapConfiguration()`: Aplica configuração atual
- `getCurrentMapBounds()`: Retorna bounds do mapa atual
- `getMapCenter()`: Retorna centro do mapa
- `getMapScaleFactor()`: Retorna fator de escala
- `clearMapLayers()`: Limpa todos os layers do mapa
- `showLoading()`: Mostra indicador de loading
- `hideLoading()`: Esconde indicador de loading

## map-history.js

### Variáveis Globais (via MapState)
- `currentHistoryType`: Tipo de histórico atual ('container', 'fence', 'watchtower', 'flag')
- `currentHistoryId`: ID do objeto do histórico atual
- `currentHistoryPagination`: Objeto com paginação do histórico

### Funções Públicas
- `areAllPointsSame(trail)`: Verifica se todos os pontos estão na mesma posição
- `generateConsolidatedTooltip(trail, objectType, objectName)`: Gera tooltip consolidado
- `generateFenceConsolidatedTooltip(trail)`: Gera tooltip consolidado para fence
- `applyHistoryFilters()`: Aplica filtros de data no histórico
- `loadHistoryPage(offset)`: Carrega página do histórico

## map-notifications.js

### Variáveis Globais (via MapState)
- `notificationsEnabled`: Boolean indicando se notificações estão ativas

### Funções Públicas
- `toggleNotifications()`: Alterna estado de notificações
- `addNotificationToLog(type, message, timestamp)`: Adiciona entrada ao log
- `clearNotificationLog()`: Limpa o log de notificações
- `toggleNotificationLog()`: Alterna visibilidade do log

## map-players.js

### Variáveis Globais (via MapState)
- `playerMarkers`: Objeto com marcadores de jogadores
- `playerTrails`: Objeto com trails de jogadores
- `playersData`: Objeto com dados dos jogadores
- `previousPlayersData`: Estado anterior para detecção de mudanças
- `selectedPlayerFilters`: Array de IDs de jogadores selecionados
- `showTrails`: Boolean indicando se trails estão visíveis
- `showPlayers`: Boolean indicando se jogadores estão visíveis
- `trailDateFilter`: Objeto com filtro de data dos trails
- `scanMarkers`: Objeto com marcadores de objetos escaneados
- `scanRegionCircle`: Círculo visual permanente durante escaneamento
- `isScanning`: Boolean indicando se há escaneamento em andamento

### Funções Públicas
- `loadPositions()`: Carrega posições dos jogadores
- `updatePositions(data)`: Atualiza posições no mapa
- `detectPlayerChanges(newData, oldData)`: Detecta mudanças de posição
- `loadPlayerTrail(playerId)`: Carrega trail de um jogador
- `drawTrail(playerId, trail)`: Desenha trail no mapa
- `togglePlayersDisplay()`: Alterna exibição de jogadores
- `toggleTrails()`: Alterna exibição de trails
- `handlePlayerSearch()`: Processa pesquisa de jogadores
- `addPlayerToFilter(playerId)`: Adiciona jogador ao filtro
- `removePlayerFromFilter(playerId)`: Remove jogador do filtro
- `clearAllPlayerFilters()`: Limpa todos os filtros
- `filterPlayers()`: Aplica filtros de jogadores
- `applyTrailDateFilter()`: Aplica filtro de data nos trails
- `showPointActionsMenu(playerId, point, pointNumber)`: Mostra menu de ações do ponto
- `showPlayerMarkerActions(targetPlayer, targetPlayerId)`: Mostra ações do marcador
- `checkPlayerInventory(playerId, playerName)`: Verifica inventário do jogador
- `scanRegion(coordX, coordY, coordZ, radius)`: Inicia escaneamento de região
- `startScanPolling(requestId, attempt, centerX, centerY, centerZ, radius)`: Polling de resultados do escaneamento
- `markObjectsOnMap(scanData)`: Marca objetos escaneados no mapa
- `showScanRegionVisual(centerX, centerY, centerZ, radius)`: Mostra círculo visual permanente durante escaneamento
- `clearScanState()`: Limpa estado de escaneamento
- `clearScanMarkers()`: Remove todos os marcadores de objetos escaneados
- `createScanObjectIcon(objectType)`: Cria ícone baseado no tipo de objeto
- `scanRegion(coordX, coordY, coordZ, radius)`: Inicia escaneamento de região
- `startScanPolling(requestId, attempt, centerX, centerY, centerZ, radius)`: Polling de resultados do escaneamento
- `markObjectsOnMap(scanData)`: Marca objetos escaneados no mapa
- `showScanRegionVisual(centerX, centerY, centerZ, radius)`: Mostra círculo visual permanente durante escaneamento
- `clearScanState()`: Limpa estado de escaneamento
- `clearScanMarkers()`: Remove todos os marcadores de objetos escaneados
- `createScanObjectIcon(objectType)`: Cria ícone baseado no tipo de objeto

## map-vehicles.js

### Variáveis Globais (via MapState)
- `vehicleMarkers`: Objeto com marcadores de veículos
- `vehicleTrails`: Objeto com trails de veículos
- `vehiclesData`: Objeto com dados dos veículos
- `previousVehiclesData`: Estado anterior para detecção de mudanças
- `showVehicles`: Boolean indicando se veículos estão visíveis

### Funções Públicas
- `loadVehicles()`: Carrega veículos
- `updateVehicles(data)`: Atualiza veículos no mapa
- `detectVehicleChanges(newData, oldData)`: Detecta mudanças em veículos
- `loadVehicleTrail(vehicleId, forceReload)`: Carrega trail de veículo
- `drawVehicleTrail(vehicleId, trail)`: Desenha trail de veículo
- `removeVehicleTrail(vehicleId)`: Remove trail de veículo
- `toggleVehicleTrail(vehicleId)`: Alterna trail de veículo
- `createVehiclePopup(vehicle)`: Cria conteúdo do popup de veículo
- `updateVehiclePopup(vehicleId)`: Atualiza popup de veículo
- `toggleVehiclesDisplay()`: Alterna exibição de veículos

## map-containers.js

### Variáveis Globais (via MapState)
- `containerMarkers`: Objeto com marcadores de containers
- `containerTrails`: Objeto com trails de containers
- `containersData`: Objeto com dados dos containers
- `previousContainersData`: Estado anterior para detecção de mudanças
- `containerClusterGroup`: Grupo de cluster de containers
- `showContainers`: Boolean indicando se containers estão visíveis

### Funções Públicas
- `loadContainers()`: Carrega containers
- `updateContainers(data)`: Atualiza containers no mapa
- `detectContainerChanges(newData, oldData)`: Detecta mudanças em containers
- `loadContainerTrail(containerId, forceReload)`: Carrega trail de container
- `drawContainerTrail(containerId, trail)`: Desenha trail de container
- `removeContainerTrail(containerId)`: Remove trail de container
- `toggleContainerTrail(containerId)`: Alterna trail de container
- `createContainerPopup(container)`: Cria conteúdo do popup de container
- `updateContainerPopup(containerId)`: Atualiza popup de container
- `toggleContainersDisplay()`: Alterna exibição de containers
- `loadContainerHistory(containerId, offset, dateFrom, dateTo)`: Carrega histórico
- `showContainerLootHistory(containerId)`: Mostra histórico de loot

## map-fences.js

### Variáveis Globais (via MapState)
- `fenceMarkers`: Objeto com marcadores de construções
- `fenceTrails`: Objeto com trails de construções
- `fencesData`: Objeto com dados das construções
- `previousFencesData`: Estado anterior para detecção de mudanças
- `showFences`: Boolean indicando se construções estão visíveis

### Funções Públicas
- `loadFences()`: Carrega construções
- `updateFences(data)`: Atualiza construções no mapa
- `detectFenceChanges(newData, oldData)`: Detecta mudanças em construções
- `loadFenceTrail(fenceId)`: Carrega trail de fence
- `toggleFenceTrail(fenceId)`: Alterna histórico de fence
- `createFencePopup(fence)`: Cria conteúdo do popup de construção
- `updateFencePopup(fenceId)`: Atualiza popup de construção
- `toggleFencesDisplay()`: Alterna exibição de construções
- `loadFenceHistory(fenceId, offset, dateFrom, dateTo)`: Carrega histórico de fence
- `loadWatchtowerHistory(watchtowerId, offset, dateFrom, dateTo)`: Carrega histórico de watchtower
- `loadFlagHistory(flagId, offset, dateFrom, dateTo)`: Carrega histórico de flag
- `showFenceHistoryModal(fenceId, trail, pagination)`: Mostra modal de histórico

## map-events.js

### Variáveis Globais (via MapState)
- `killMarkers`: Array com marcadores de kills
- `damageMarkers`: Array com marcadores de damages
- `previousKillsData`: Estado anterior de kills
- `previousDamagesData`: Estado anterior de damages
- `showKills`: Boolean indicando se kills estão visíveis
- `showDamages`: Boolean indicando se damages estão visíveis

### Funções Públicas
- `loadKills()`: Carrega eventos de kill
- `updateKills(data)`: Atualiza kills no mapa
- `detectKillChanges(newData, oldData)`: Detecta novos kills
- `toggleKills()`: Alterna exibição de kills
- `loadDamages()`: Carrega eventos de dano
- `updateDamages(data)`: Atualiza damages no mapa
- `detectDamageChanges(newData, oldData)`: Detecta novos damages
- `toggleDamages()`: Alterna exibição de damages
- `showKillMarkerActions(killEvent, positionType)`: Mostra ações de kill
- `showDamageMarkerActions(damageEvent, positionType)`: Mostra ações de dano

## map-teleport.js

### Variáveis Globais (via MapState)
- `currentMode`: Modo atual ('normal', 'teleport' ou 'scan')
- `teleportTargetPlayer`: ID do jogador alvo do teleporte
- `teleportTargetVehicle`: ID do veículo alvo do teleporte
- `vehicleTeleportUseMapPosition`: Boolean indicando se deve usar posição do mapa para veículo
- `scanCircle`: Círculo visual do cursor em modo scan
- `isScanning`: Boolean indicando se há escaneamento em andamento

### Funções Públicas
- `setMode(mode)`: Define modo de interação ('normal', 'teleport' ou 'scan')
- `updateTeleportInfo()`: Atualiza mensagem de informação do teleporte
- `handleTeleportClick(e)`: Processa clique no mapa em modo teleporte
- `handleScanClick(e)`: Processa clique no mapa em modo scan
- `updateScanCircle()`: Atualiza círculo visual do raio de escaneamento
- `updateScanCirclePosition(e)`: Atualiza posição do círculo visual com o cursor
- `clearScanCircle()`: Remove círculo visual do cursor
- `showTeleportToPlayerModal()`: Mostra modal de teleporte de jogador
- `executeTeleportToPlayer()`: Executa teleporte de jogador
- `showVehicleTeleportModal(vehicleId)`: Mostra modal de teleporte de veículo
- `useMapPositionForVehicle()`: Usa posição do mapa para veículo
- `executeVehicleTeleport()`: Executa teleporte de veículo

## map.js (Principal)

### Variáveis Globais
- `autoRefreshInterval`: Intervalo de auto-refresh

### Funções Públicas
- Nenhuma (apenas inicialização e orquestração)

### Event Listeners
- Registrados no `$(document).ready()`
- Auto-refresh configurado aqui

## Exemplos de Uso

### Carregar posições de jogadores
```javascript
loadPositions();
```

### Alternar exibição de veículos
```javascript
toggleVehiclesDisplay();
```

### Adicionar notificação ao log
```javascript
addNotificationToLog('info', 'Jogador moveu-se', new Date());
```

### Teleportar jogador
```javascript
setMode('teleport');
selectedPlayerFilters.push(playerId);
// Clique no mapa executará o teleporte
```

### Carregar histórico de container
```javascript
loadContainerHistory(containerId, 0, '2024-01-01', '2024-01-31');
```

### Escanear região do mapa
```javascript
// Ativar modo scan
setMode('scan');
// Definir raio (1-100 metros)
$('#scanRadiusInput').val(50);
// Clique no mapa executará o escaneamento
// O modo volta para 'normal' automaticamente após iniciar
```

### Limpar marcadores de escaneamento
```javascript
clearScanMarkers();
```

### Escanear região do mapa
```javascript
// Ativar modo scan
setMode('scan');
// Definir raio (1-100 metros)
$('#scanRadiusInput').val(50);
// Clique no mapa executará o escaneamento
// O modo volta para 'normal' automaticamente após iniciar
```

### Limpar marcadores de escaneamento
```javascript
clearScanMarkers();
```

