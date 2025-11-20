/**
 * JavaScript para visualização do mapa com Leaflet
 */

// Variáveis globais
let map;
let playerMarkers = {};
let playerTrails = {};
let vehicleTrails = {};
let containerTrails = {};
let fenceTrails = {};
let vehicleMarkers = {};
let containerMarkers = {};
let containerClusterGroup = null;
let fenceMarkers = {};
let killMarkers = [];
let damageMarkers = [];
let playersData = {}; // Armazenar dados dos jogadores
let vehiclesData = {}; // Armazenar dados dos veículos
let containersData = {}; // Armazenar dados dos containers
let fencesData = {}; // Armazenar dados das fences
let currentPointContext = null; // Contexto do ponto para ações
let currentPlayerContext = null; // Contexto do jogador para ações
let selectedPlayerFilters = []; // Array de player IDs selecionados
let autoRefreshInterval = null;
let showTrails = false;
let showPlayers = true;
let showVehicles = false;
let showContainers = false;
let showFences = false;
let showKills = false;
let showDamages = false;
let currentMode = 'normal'; // normal, teleport
let teleportTargetPlayer = null;
let trailDateFilter = {
    enabled: false,
    startDate: null,
    endDate: null
};
// Variáveis removidas - funcionalidades de spawn movidas para spawning.html

const BASE_MAP_SIZE = 4096;
let mapConfigs = {};
let mapConfigList = [];
let currentMapConfig = null;
let mapImageOverlay = null;

// Cor padrão do Leaflet - cores escuras para melhor visibilidade
const iconColors = [
    '#cc0000', '#0044cc', '#008800', '#cc4400', '#6600cc', '#cc0066',
    '#cc9900', '#008899', '#990000', '#000099', '#006600'
];

// Ícone customizado para veículos
function createVehicleIcon(hasMoved = false) {
    // Cor verde para veículos estáticos, laranja para veículos que se moveram
    const backgroundColor = hasMoved ? '#ff9800' : '#28a745';
    const borderColor = hasMoved ? '#ff6f00' : 'white';
    
    return L.divIcon({
        className: 'vehicle-marker',
        html: `<div style="background-color: ${backgroundColor}; border: 2px solid ${borderColor}; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="fas fa-car" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [20, 20]
    });
}

// Ícone customizado para containers baseado no tipo
function createContainerIcon(containerType) {
    let color, iconClass;
    
    if (containerType && containerType.startsWith('Barrel')) {
        // Barrels - Azul
        color = '#007bff';
        iconClass = 'fas fa-drum';
    } else if (containerType === 'WoodenCrate' || containerType === 'CargoNet' || containerType === 'SeaChest') {
        // Crates - Marrom
        color = '#8b4513';
        iconClass = 'fas fa-box';
    } else if (containerType && (containerType.includes('Tent') || containerType.includes('CarTent'))) {
        // Tents - Verde
        color = '#28a745';
        iconClass = 'fas fa-campground';
    } else if (containerType && containerType.startsWith('Shelter')) {
        // Shelters - Marrom escuro
        color = '#795548';
        iconClass = 'fas fa-home';
    } else {
        // Default - Cinza
        color = '#6c757d';
        iconClass = 'fas fa-box';
    }
    
    return L.divIcon({
        className: 'container-marker',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="${iconClass}" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [20, 20]
    });
}

/**
 * Criar ícone personalizado para clusters de containers
 */
function createContainerClusterIcon(cluster) {
    const count = cluster.getChildCount();
    let size = 'small';
    let backgroundColor = '#ff9800';
    
    if (count < 10) {
        size = 'small';
        backgroundColor = '#ff9800';
    } else if (count < 50) {
        size = 'medium';
        backgroundColor = '#ff5722';
    } else {
        size = 'large';
        backgroundColor = '#d32f2f';
    }
    
    const sizeMap = {
        small: 40,
        medium: 50,
        large: 60
    };
    
    const fontSizeMap = {
        small: 10,
        medium: 12,
        large: 14
    };
    
    const iconSizeMap = {
        small: 14,
        medium: 16,
        large: 18
    };
    
    const sizePx = sizeMap[size];
    const fontSize = fontSizeMap[size];
    const iconSize = iconSizeMap[size];
    
    return L.divIcon({
        html: `<div style="background-color: ${backgroundColor}; border: 3px solid white; width: ${sizePx}px; height: ${sizePx}px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
            <i class="fas fa-boxes" style="font-size: ${iconSize}px; margin-bottom: 2px;"></i>
            <span style="font-size: ${fontSize}px; line-height: 1;">${count}</span>
        </div>`,
        className: 'container-cluster-marker',
        iconSize: L.point(sizePx, sizePx)
    });
}

// Ícone customizado para construções (fences e watchtowers)
function createFenceIcon(fence, hasRecentAttack = false) {
    const structureType = fence?.structure_type || 'fence';
    if (structureType === 'watchtower') {
        const details = fence.watchtower_details || {};
        const completionScore = ['level_1_base', 'level_2_base', 'level_3_base', 'has_roof']
            .reduce((sum, key) => sum + (details[key] ? 1 : 0), 0);
        let color = '#4e73df';
        if (completionScore >= 4) {
            color = '#1cc88a';
        } else if (completionScore >= 2) {
            color = '#36b9cc';
        }
        return L.divIcon({
            className: 'fence-marker watchtower-marker',
            html: `<div style="position: relative; background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-chess-rook" style="color: white; font-size: 13px;"></i>
            </div>`,
            iconSize: [24, 24]
        });
    }

    const fenceName = fence?.fence_name || '';
    let color, iconClass;
    
    if (fenceName.includes('Gate')) {
        // Fence com Gate - Verde (ou laranja/vermelho se houver ataque)
        color = hasRecentAttack ? '#ff6b35' : '#28a745';
        iconClass = 'fas fa-door-open';
    } else if (fenceName.includes('Open')) {
        // Fence aberto - Amarelo (ou laranja/vermelho se houver ataque)
        color = hasRecentAttack ? '#ff6b35' : '#ffc107';
        iconClass = 'fas fa-unlock';
    } else if (fenceName.includes('Locked')) {
        // Fence trancado - Vermelho (ou laranja mais escuro se houver ataque)
        color = hasRecentAttack ? '#c82333' : '#dc3545';
        iconClass = 'fas fa-lock';
    } else {
        // Fence padrão - Cinza (ou laranja se houver ataque)
        color = hasRecentAttack ? '#ff6b35' : '#6c757d';
        iconClass = 'fas fa-border-all';
    }
    
    // Adicionar ícone de alerta se houver ataque recente
    const alertIcon = hasRecentAttack ? '<i class="fas fa-exclamation-triangle" style="position: absolute; top: -5px; right: -5px; color: #dc3545; font-size: 10px; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;"></i>' : '';
    
    return L.divIcon({
        className: 'fence-marker',
        html: `<div style="position: relative; background-color: ${color}; border: 2px solid ${hasRecentAttack ? '#dc3545' : 'white'}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content:center;"><i class="${iconClass}" style="color: white; font-size: 12px;"></i>${alertIcon}</div>`,
        iconSize: [22, 22]
    });
}

/**
 * Ler e preparar configurações de mapas disponíveis
 */
function initializeMapConfigs() {
    const mapElement = $('#map');
    const configsAttr = mapElement.attr('data-map-configs');
    let parsedConfigs = [];
    
    if (configsAttr) {
        try {
            parsedConfigs = JSON.parse(configsAttr);
        } catch (error) {
            console.error('Erro ao interpretar configurações do mapa:', error);
        }
    }
    
    if (!Array.isArray(parsedConfigs) || parsedConfigs.length === 0) {
        const fallbackImage = mapElement.data('map-image') || '';
        parsedConfigs = [
            {
                id: 'default',
                name: 'Chernarus',
                image: fallbackImage,
                pixel_size: BASE_MAP_SIZE
            }
        ];
    }
    
    mapConfigs = {};
    mapConfigList = [];
    
    parsedConfigs.forEach(function(rawConfig) {
        if (!rawConfig || !rawConfig.id || !rawConfig.image) {
            return;
        }
        
        const normalizedConfig = {
            id: rawConfig.id,
            name: rawConfig.name || rawConfig.id,
            image: rawConfig.image,
            pixelSize: rawConfig.pixel_size || rawConfig.pixelSize || BASE_MAP_SIZE
        };
        
        mapConfigs[normalizedConfig.id] = normalizedConfig;
        mapConfigList.push(normalizedConfig);
    });
    
    if (mapConfigList.length === 0) {
        const fallbackConfig = {
            id: 'default',
            name: 'Chernarus',
            image: '',
            pixelSize: BASE_MAP_SIZE
        };
        mapConfigs[fallbackConfig.id] = fallbackConfig;
        mapConfigList.push(fallbackConfig);
    }
    
    const defaultMapId = mapElement.attr('data-map-default');
    currentMapConfig = (defaultMapId && mapConfigs[defaultMapId]) ? mapConfigs[defaultMapId] : mapConfigList[0];
}

/**
 * Popular seletor de mapas e registrar eventos
 */
function setupMapSelector() {
    const select = $('#mapTypeSelect');
    const wrapper = select.closest('.mb-2');
    
    if (!select.length) {
        return;
    }
    
    select.empty();
    
    mapConfigList.forEach(function(config) {
        const option = $('<option></option>')
            .val(config.id)
            .text(config.name);
        select.append(option);
    });
    
    if (currentMapConfig) {
        select.val(currentMapConfig.id);
    }
    
    if (mapConfigList.length <= 1) {
        select.prop('disabled', true);
        if (wrapper.length) {
            wrapper.hide();
        }
        return;
    }
    
    if (wrapper.length) {
        wrapper.show();
    }
    select.prop('disabled', false);
    
    select.off('change.mapSelector').on('change.mapSelector', function() {
        const selectedId = $(this).val();
        switchMap(selectedId);
    });
}

/**
 * Obter bounds atuais do mapa baseado na configuração
 */
function getCurrentMapBounds() {
    const size = currentMapConfig ? currentMapConfig.pixelSize : BASE_MAP_SIZE;
    return [[0, 0], [size, size]];
}

/**
 * Obter centro do mapa baseado na configuração
 */
function getMapCenter() {
    const size = currentMapConfig ? currentMapConfig.pixelSize : BASE_MAP_SIZE;
    return [size / 2, size / 2];
}

/**
 * Obter fator de escala em relação ao mapa base (4096)
 */
function getMapScaleFactor() {
    if (!currentMapConfig) {
        return 1;
    }
    return currentMapConfig.pixelSize / BASE_MAP_SIZE;
}

/**
 * Converter coordenadas armazenadas para o sistema atual do Leaflet
 */
function convertToMapCoords(pixelCoords) {
    if (!pixelCoords || pixelCoords.length < 2) {
        return null;
    }
    
    const scaleFactor = getMapScaleFactor();
    return [pixelCoords[0] * scaleFactor, pixelCoords[1] * scaleFactor];
}

/**
 * Determinar direção do tooltip baseado na posição atual
 */
function getTooltipDirectionForPoint(lat, lng) {
    const size = currentMapConfig ? currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const margin = size * 0.2;
    let direction = 'top';
    
    if (lat < margin) {
        direction = 'bottom';
    } else
    if (lat > size - margin) {
        direction = 'bottom';
    }
    
    if (lng < margin) {
        direction = 'right';
    } else if (lng > size - margin) {
        direction = 'left';
    }
    
    return direction;
}

/**
 * Calcular offset seguro para popups próximos às bordas do mapa
 */
function getPopupOffsetForPoint(lat, lng) {
    const size = currentMapConfig ? currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const margin = Math.max(size * 0.1, 150);
    let offsetX = 0;
    let offsetY = -24;
    
    if (lat < margin) {
        offsetY = 36;
    } else if (lat > size - margin) {
        offsetY = -36;
    }
    
    if (lng < margin) {
        offsetX = 36;
    } else if (lng > size - margin) {
        offsetX = -36;
    }
    
    return L.point(offsetX, offsetY);
}

/**
 * Aplicar configuração de mapa atual (imagem, bounds, centro)
 */
function applyMapConfiguration() {
    if (!map || !currentMapConfig) {
        hideLoading();
        return;
    }
    
    const bounds = getCurrentMapBounds();
    
    if (mapImageOverlay) {
        map.removeLayer(mapImageOverlay);
    }
    
    const imageUrl = currentMapConfig.image;
    
    if (!imageUrl) {
        console.error('URL da imagem do mapa não encontrada para a configuração selecionada');
        hideLoading();
        return;
    }
    
    const img = new Image();
    img.onload = function() {
        console.log('Imagem do mapa carregada com sucesso:', imageUrl);
        hideLoading();
    };
    img.onerror = function() {
        console.error('Erro ao carregar imagem do mapa:', imageUrl);
        hideLoading();
    };
    img.src = imageUrl;
    
    mapImageOverlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 1,
        interactive: false
    });
    mapImageOverlay.addTo(map);
    
    map.options.maxBounds = bounds;
    map.setMaxBounds(bounds);
    map.setView(getMapCenter(), map.getZoom());
}

/**
 * Alterar mapa exibido
 */
function switchMap(mapId) {
    if (!mapId || !mapConfigs[mapId] || (currentMapConfig && currentMapConfig.id === mapId)) {
        return;
    }
    
    currentMapConfig = mapConfigs[mapId];
    showLoading();
    applyMapConfiguration();
    clearMapLayers();
    loadPositions();
    
    if (showVehicles) {
        loadVehicles();
    }
    if (showContainers) {
        loadContainers();
    }
    if (showFences) {
        loadFences();
    }
    if (showKills) {
        loadKills();
    }
    
    console.log('Mapa alternado para:', currentMapConfig.name, '(', currentMapConfig.pixelSize, 'px )');
}

/**
 * Limpar todos os layers que dependem do mapa atual
 */
function clearMapLayers() {
    if (!map) {
        return;
    }
    
    Object.keys(playerMarkers).forEach(function(key) {
        map.removeLayer(playerMarkers[key]);
    });
    playerMarkers = {};
    
    Object.keys(vehicleMarkers).forEach(function(key) {
        map.removeLayer(vehicleMarkers[key]);
    });
    vehicleMarkers = {};
    
    // Remover cluster group do mapa se existir
    if (containerClusterGroup && map.hasLayer(containerClusterGroup)) {
        map.removeLayer(containerClusterGroup);
    }
    if (containerClusterGroup) {
        containerClusterGroup.clearLayers();
    }
    Object.keys(containerMarkers).forEach(function(key) {
        if (containerMarkers[key] && map.hasLayer(containerMarkers[key])) {
            map.removeLayer(containerMarkers[key]);
        }
    });
    containerMarkers = {};
    
    Object.keys(fenceMarkers).forEach(function(key) {
        map.removeLayer(fenceMarkers[key]);
    });
    fenceMarkers = {};
    
    Object.keys(playerTrails).forEach(function(key) {
        const trail = playerTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => map.removeLayer(item));
        } else if (trail) {
            map.removeLayer(trail);
        }
    });
    playerTrails = {};
    
    Object.keys(vehicleTrails).forEach(function(key) {
        const trail = vehicleTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => map.removeLayer(item));
        } else if (trail) {
            map.removeLayer(trail);
        }
    });
    vehicleTrails = {};
    
    Object.keys(containerTrails).forEach(function(key) {
        const trail = containerTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => map.removeLayer(item));
        } else if (trail) {
            map.removeLayer(trail);
        }
    });
    containerTrails = {};
    
    Object.keys(fenceTrails).forEach(function(key) {
        const trail = fenceTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => map.removeLayer(item));
        } else if (trail) {
            map.removeLayer(trail);
        }
    });
    fenceTrails = {};
    
    killMarkers.forEach(function(item) {
        if (item.killerMarker) {
            map.removeLayer(item.killerMarker);
        }
        if (item.victimMarker) {
            map.removeLayer(item.victimMarker);
        }
        if (item.line) {
            map.removeLayer(item.line);
        }
    });
    killMarkers = [];
    
    damageMarkers.forEach(function(item) {
        if (item.attackerMarker) {
            map.removeLayer(item.attackerMarker);
        }
        if (item.victimMarker) {
            map.removeLayer(item.victimMarker);
        }
        if (item.line) {
            map.removeLayer(item.line);
        }
    });
    damageMarkers = [];
    
    $('#mapOnlineCount').text('0');
    $('#mapOfflineCount').text('0');
    $('#mapTotalCount').text('0');
    $('#vehicleCount').text('0');
    $('#containerCount').text('0');
    $('#fenceCount').text('0');
}

// Inicializar o mapa quando o documento estiver pronto
$(document).ready(function() {
    initializeMapConfigs();
    initMap();
    setupMapSelector();
    loadPositions();
    
    // Event listeners
    $('#refreshBtn').on('click', loadPositions);
    $('#autoRefreshCheck').on('change', toggleAutoRefresh);
    $('#onlineOnlyCheck').on('change', filterPlayers);
    $('#showDestroyedCheck').on('change', function() {
        if (showVehicles) loadVehicles();
        if (showContainers) loadContainers();
        if (showFences) loadFences();
    });
    $('#toggleTrailsBtn').on('click', toggleTrails);
    $('#togglePlayersBtn').on('click', togglePlayersDisplay);
    $('#toggleVehiclesBtn').on('click', toggleVehiclesDisplay);
    $('#toggleContainersBtn').on('click', toggleContainersDisplay);
    $('#toggleFencesBtn').on('click', toggleFencesDisplay);
    $('#toggleKillsBtn').on('click', toggleKills);
    $('#toggleDamagesBtn').on('click', toggleDamages);
    $('#applyTrailFilter').on('click', applyTrailDateFilter);
    
    // Event listeners para o novo sistema de filtro de jogadores
    $('#playerSearchInput').on('input', handlePlayerSearch);
    $('#playerSearchInput').on('focus', handlePlayerSearch);
    $('#playerSearchInput').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#playerSearchResults').hide(), 200);
    });
    $('#clearAllFiltersBtn').on('click', clearAllPlayerFilters);
    
    // Event listener para atalhos de filtro de trails
    $('[data-filter]').on('click', function() {
        const filter = $(this).data('filter');
        applyTrailFilterShortcut(filter);
    });
    
    // Event listeners para modos
    $('#btnModeNormal').on('click', () => setMode('normal'));
    $('#btnModeTeleport').on('click', () => setMode('teleport'));
    
    // Verificar se há filtro de player_id na URL e aplicar
    const urlParams = new URLSearchParams(window.location.search);
    const playerIdFilter = urlParams.get('player_id');
    if (playerIdFilter) {
        setTimeout(function() {
            // Adicionar ao array de filtros ao invés de usar select
            selectedPlayerFilters.push(playerIdFilter);
            updateSelectedPlayersBadges();
            filterPlayers();
        }, 500); // Aguardar carga completa do mapa
    }
    
    // Auto-refresh inicial
    toggleAutoRefresh();
});

/**
 * Inicializar o mapa Leaflet
 */
function initMap() {
    // Mostrar loading enquanto carrega
    showLoading();
    
    if (!currentMapConfig) {
        console.error('Nenhuma configuração de mapa disponível');
        hideLoading();
        return;
    }
    
    // Criar mapa
    map = L.map('map', {
        crs: L.CRS.Simple,  // Sem projeção geográfica
        minZoom: -2,
        maxZoom: 3,
        maxBounds: getCurrentMapBounds(),
        maxBoundsViscosity: 1.0,  // Impede arrastar para fora dos limites
        zoom: -2,  // Iniciar no zoom mínimo para ver mapa completo
        center: getMapCenter(),
        zoomControl: true,
        attributionControl: false
    });
    
    // Adicionar imagem do mapa conforme configuração atual
    applyMapConfiguration();
    
    // Adicionar evento de clique no mapa
    map.on('click', function(e) {
        if (currentMode === 'teleport') {
            handleTeleportClick(e);
        }
    });
    
    console.log('Mapa inicializado com imagem:', currentMapConfig.image);
}

/**
 * Gerar cor única para um jogador
 */
function getPlayerColor(playerId) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return iconColors[Math.abs(hash) % iconColors.length];
}

/**
 * Criar ícone de marcador
 */
function createMarkerIcon(color) {
    return L.divIcon({
        className: 'player-marker player-marker-pulse',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone de kill
 */
function createKillIcon() {
    return L.divIcon({
        className: 'kill-marker',
        html: `<div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-skull-crossbones" style="color: white; font-size: 12px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);"></i>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]  // Centralizar o ícone no círculo
    });
}

/**
 * Criar ícone do killer (jogador que matou)
 */
function createKillerIcon() {
    return L.divIcon({
        className: 'killer-marker',
        html: `<div style="background-color: #007bff; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone da vítima (jogador que morreu)
 */
function createVictimIcon() {
    return L.divIcon({
        className: 'victim-marker',
        html: `<div style="background-color: #dc3545; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-skull-crossbones" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone do atacante (jogador que causou dano)
 */
function createDamageAttackerIcon() {
    return L.divIcon({
        className: 'damage-attacker-marker',
        html: `<div style="background-color: #ff9800; border: 2px solid #ff6f00; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-fist-raised" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone da vítima de dano (jogador que recebeu dano)
 */
function createDamageVictimIcon() {
    return L.divIcon({
        className: 'damage-victim-marker',
        html: `<div style="background-color: #ffc107; border: 2px solid #ffa000; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-heart-broken" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Carregar posições dos jogadores
 */
function loadPositions() {
    showLoading();
    
    const url = $('#onlineOnlyCheck').is(':checked') 
        ? '/api/players/online/positions' 
        : '/api/players/positions';
    
    $.get(url)
        .done(function(data) {
            updatePositions(data);
            $('#lastUpdate').text(new Date().toLocaleTimeString());
        })
        .fail(function() {
            console.error('Erro ao carregar posições');
            hideLoading();
        });
}

/**
 * Atualizar posições no mapa
 */
function updatePositions(data) {
    // Remover marcadores antigos se não houver filtro
    if (selectedPlayerFilters.length === 0) {
        Object.keys(playerMarkers).forEach(function(key) {
            map.removeLayer(playerMarkers[key]);
        });
        playerMarkers = {};
    }
    
    // Contadores de jogadores exibidos
    let onlineCount = 0;
    let offlineCount = 0;
    
    // Processar cada jogador
    data.players.forEach(function(player) {
        const playerId = player.player_id;
        
        // Armazenar dados do jogador
        playersData[playerId] = {
            name: player.player_name,
            steamName: player.steam_name,
            isOnline: player.is_online
        };
        
        // Aplicar filtro se existir (múltiplos jogadores)
        if (selectedPlayerFilters.length > 0 && !selectedPlayerFilters.includes(playerId)) {
            // Remover marcador se não corresponde ao filtro
            if (playerMarkers[playerId]) {
                map.removeLayer(playerMarkers[playerId]);
                delete playerMarkers[playerId];
            }
            return;
        }
        
        // Contar jogador (somente se passou pelo filtro)
        if (player.is_online) {
            onlineCount++;
        } else {
            offlineCount++;
        }
        
        // Verificar se deve mostrar jogadores
        if (!showPlayers) {
            return;
        }
        
        const color = getPlayerColor(playerId);
        const mapCoords = convertToMapCoords(player.pixel_coords);
        
        if (!mapCoords) {
            return;
        }
        
        const lat = mapCoords[0];
        const lng = mapCoords[1];
        
        // Remover marcador antigo se existir
        if (playerMarkers[playerId]) {
            map.removeLayer(playerMarkers[playerId]);
        }
        
        // Criar novo marcador
        const marker = L.marker([lat, lng], {
            icon: createMarkerIcon(color),
            opacity: player.is_online ? 1.0 : 0.9
        }).addTo(map);
        
        // Função auxiliar para formatar arrays JSON
        const formatItemsArray = (itemsStr) => {
            if (!itemsStr) return 'Nenhum';
            try {
                const items = JSON.parse(itemsStr);
                if (Array.isArray(items) && items.length > 0) {
                    return items.join(', ');
                }
            } catch (e) {
                return itemsStr;
            }
            return 'Nenhum';
        };
        
        // Formatar conteúdo do tooltip seguindo padrão dos trails
        let tooltipContent = `
            <strong>👤 ${player.player_name}${player.steam_name ? ` (${player.steam_name})` : ''}</strong><br>
            ${player.is_online ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
            ${player.is_admin ? '👑 <span class="value">Admin</span><br>' : ''}
            📍 Coords: <span class="value">X=${player.coord_x.toFixed(1)}, Y=${player.coord_y.toFixed(1)}</span><br>
            ${player.coord_z ? `📏 Altura: <span class="value">${player.coord_z.toFixed(1)}m</span><br>` : ''}
        `;
        
        // Adicionar informações de status de vida se disponíveis
        if ((player.health !== null && player.health !== undefined) || 
            (player.blood !== null && player.blood !== undefined) ||
            (player.shock !== null && player.shock !== undefined)) {
            tooltipContent += '<br><strong>💚 Status de Vida:</strong><br>';
            if (player.health !== null && player.health !== undefined) {
                tooltipContent += `❤️ Saúde: <span class="value">${player.health.toFixed(1)}</span><br>`;
            }
            if (player.blood !== null && player.blood !== undefined) {
                tooltipContent += `🩸 Sangue: <span class="value">${player.blood.toFixed(0)}</span><br>`;
            }
            if (player.shock !== null && player.shock !== undefined) {
                tooltipContent += `⚡ Shock: <span class="value">${player.shock.toFixed(0)}</span><br>`;
            }
            if (player.is_alive !== null && player.is_alive !== undefined) {
                tooltipContent += `${player.is_alive ? '✅ <span class="value">Vivo</span>' : '💀 <span class="value">Morto</span>'}<br>`;
            }
        }
        
        // Adicionar informações de recursos se disponíveis
        if ((player.energy !== null && player.energy !== undefined) || 
            (player.water !== null && player.water !== undefined)) {
            tooltipContent += '<br><strong>📦 Recursos:</strong><br>';
            if (player.energy !== null && player.energy !== undefined) {
                tooltipContent += `⚡ Energia: <span class="value">${player.energy.toFixed(1)}</span><br>`;
            }
            if (player.water !== null && player.water !== undefined) {
                tooltipContent += `💧 Água: <span class="value">${player.water.toFixed(1)}</span><br>`;
            }
        }
        
        // Adicionar informações de stamina se disponíveis
        if ((player.stamina !== null && player.stamina !== undefined) || 
            (player.stamina_max !== null && player.stamina_max !== undefined)) {
            tooltipContent += '<br><strong>🏃 Stamina:</strong><br>';
            if (player.stamina !== null && player.stamina !== undefined && 
                player.stamina_max !== null && player.stamina_max !== undefined) {
                tooltipContent += `<span class="value">${player.stamina.toFixed(1)}/${player.stamina_max.toFixed(1)}</span><br>`;
            } else if (player.stamina !== null && player.stamina !== undefined) {
                tooltipContent += `<span class="value">${player.stamina.toFixed(1)}</span><br>`;
            }
        }
        
        // Adicionar informações de items se disponíveis
        if (player.items_in_hands || 
            (player.items_count !== null && player.items_count !== undefined)) {
            tooltipContent += '<br><strong>🎒 Inventário:</strong><br>';
            if (player.items_in_hands) {
                const itemsHands = formatItemsArray(player.items_in_hands);
                tooltipContent += `🤲 Mãos: <span class="value">${itemsHands}</span><br>`;
            }
            if (player.items_count !== null && player.items_count !== undefined) {
                tooltipContent += `📊 Items: <span class="value">${player.items_count}</span><br>`;
            }
        }
        
        // Adicionar timestamp
        tooltipContent += `<br>⏰ Atualizado: <span class="value">${player.last_update || 'Desconhecido'}</span>`;
        
        // Direção dinâmica baseada na posição no mapa
        const tooltipDirection = getTooltipDirectionForPoint(lat, lng);
        
        // Adicionar tooltip (aparece ao passar o mouse)
        marker.bindTooltip(tooltipContent, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });
        
        // Clique abre modal de teleporte entre jogadores
        marker.on('click', function() {
            showPlayerMarkerActions(player, playerId);
        });
        
        playerMarkers[playerId] = marker;
    });
    
    // Atualizar badges após carregar dados (para atualizar status online/offline)
    if (selectedPlayerFilters.length > 0) {
        updateSelectedPlayersBadges();
    }
    
    // Atualizar contadores na UI
    $('#mapOnlineCount').text(onlineCount);
    $('#mapOfflineCount').text(offlineCount);
    $('#mapTotalCount').text(onlineCount + offlineCount);
    
    if (showTrails) {
        setTimeout(function() {
            Object.keys(playerMarkers).forEach(loadPlayerTrail);
        }, 500);
    }
    
    hideLoading();
    console.log(`Posições atualizadas: ${data.players.length} jogadores`);
}

/**
 * Carregar trail de um jogador
 */
function loadPlayerTrail(playerId) {
    if (!showTrails) return;
    
    $.get(`/api/players/${playerId}/trail`, { limit: 100 })
        .done(function(data) {
            drawTrail(playerId, data.trail);
        })
        .fail(function() {
            console.error('Erro ao carregar trail');
        });
}

/**
 * Carregar trail de um veículo
 */
function loadVehicleTrail(vehicleId) {
    if (vehicleTrails[vehicleId]) {
        return; // Trail já carregado
    }
    
    $.get(`/api/vehicles/${vehicleId}/trail`, { limit: 100 })
        .done(function(data) {
            drawVehicleTrail(vehicleId, data.trail);
        })
        .fail(function() {
            console.error('Erro ao carregar trail do veículo');
        });
}

/**
 * Carregar trail de um container
 */
function loadContainerTrail(containerId) {
    if (containerTrails[containerId]) {
        console.log('Container trail já carregado:', containerId);
        return; // Trail já carregado
    }
    
    console.log('Carregando trail do container:', containerId);
    // Para o trail no mapa, não filtrar apenas por itens (mostrar todas as posições)
    $.get(`/api/containers/${containerId}/trail`, { limit: 100, filter_by_items_only: false })
        .done(function(data) {
            console.log('Trail do container recebido:', containerId, data);
            drawContainerTrail(containerId, data.trail);
        })
        .fail(function(xhr, status, error) {
            console.error('Erro ao carregar trail do container:', containerId, status, error, xhr.responseText);
        });
}

/**
 * Carregar trail de uma fence
 */
function loadFenceTrail(fenceId) {
    loadFenceHistory(fenceId, 0, null, null);
}

// Variáveis globais para histórico
let currentHistoryType = null; // 'container' ou 'fence'
let currentHistoryId = null;
let currentHistoryPagination = {
    limit: 50,
    offset: 0,
    date_from: null,
    date_to: null
};

/**
 * Carregar histórico de loot do container com filtros e paginação
 */
function loadContainerHistory(containerId, offset = 0, dateFrom = null, dateTo = null) {
    currentHistoryType = 'container';
    currentHistoryId = containerId;
    currentHistoryPagination.offset = offset;
    currentHistoryPagination.date_from = dateFrom;
    currentHistoryPagination.date_to = dateTo;
    
    const params = {
        limit: currentHistoryPagination.limit,
        offset: offset,
        filter_by_items_only: true  // Para histórico, filtrar apenas por mudanças nos itens
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    
    console.log('Carregando histórico de loot do container:', containerId, params);
    $.get(`/api/containers/${containerId}/trail`, params)
        .done(function(data) {
            console.log('Trail do container recebido para histórico:', containerId, data);
            showContainerHistoryModal(containerId, data.trail, data.pagination);
        })
        .fail(function(xhr, status, error) {
            console.error('Erro ao carregar histórico de loot do container:', containerId, status, error, xhr.responseText);
        });
}

/**
 * Mostrar histórico de loot do container
 */
function showContainerLootHistory(containerId) {
    loadContainerHistory(containerId, 0, null, null);
}

/**
 * Exibir modal com histórico de loot do container
 */
function showContainerHistoryModal(containerId, trail, pagination) {
    const container = containersData[containerId];
    if (!container) return;
    
    const modalTitle = document.getElementById('trailHistoryModalTitle');
    const modalBody = document.getElementById('trailHistoryModalBody');
    
    modalTitle.innerHTML = `<i class="fas fa-box me-2"></i>Histórico de Loot - ${container.container_type || 'Container'}`;
    
    // Formatar data para input type="date"
    function formatDateForInput(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    }
    
    let html = `<div class="trail-history-container">`;
    html += `<div class="mb-3"><strong>ID:</strong> ${containerId}</div>`;
    html += `<div class="mb-3"><strong>Coordenadas:</strong> X=${container.coord_x.toFixed(1)}, Y=${container.coord_y.toFixed(1)}</div>`;
    
    // Filtros de data
    html += `<div class="row mb-3">`;
    html += `<div class="col-md-5">`;
    html += `<label class="form-label small">Data inicial:</label>`;
    html += `<input type="date" class="form-control form-control-sm" id="historyDateFrom" value="${formatDateForInput(currentHistoryPagination.date_from)}">`;
    html += `</div>`;
    html += `<div class="col-md-5">`;
    html += `<label class="form-label small">Data final:</label>`;
    html += `<input type="date" class="form-control form-control-sm" id="historyDateTo" value="${formatDateForInput(currentHistoryPagination.date_to)}">`;
    html += `</div>`;
    html += `<div class="col-md-2 d-flex align-items-end">`;
    html += `<button type="button" class="btn btn-sm btn-primary w-100" onclick="applyHistoryFilters()">Filtrar</button>`;
    html += `</div>`;
    html += `</div>`;
    
    // Paginação
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
    
    html += `<div class="d-flex justify-content-between align-items-center mb-3">`;
    html += `<div><strong>Total de eventos (sem duplicados):</strong> ${pagination.total}</div>`;
    html += `<div>`;
    if (pagination.offset > 0) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="loadHistoryPage(${pagination.offset - pagination.limit})">Anterior</button>`;
    }
    html += `<span class="mx-2">Página ${currentPage} de ${totalPages || 1}</span>`;
    if (pagination.has_more) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary ms-1" onclick="loadHistoryPage(${pagination.offset + pagination.limit})">Próxima</button>`;
    }
    html += `</div>`;
    html += `</div>`;
    
    html += `<div class="trail-timeline" style="max-height: 500px; overflow-y: auto;">`;
    
    if (trail.length === 0) {
        html += `<div class="text-muted text-center py-4">Nenhum evento encontrado</div>`;
    } else {
        // Timeline reversa (mais recente primeiro)
        for (let i = 0; i < trail.length; i++) {
            const point = trail[i];
            html += `<div class="trail-timeline-item" style="border-left: 3px solid #${i === 0 ? '4caf50' : '007bff'}; padding-left: 15px; margin-bottom: 20px;">`;
            html += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
            html += `📍 Coords: X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}`;
            
            if (point.items && point.items.length > 0) {
                html += `<br><strong>📦 Itens (${point.items.length}):</strong><br>`;
                html += `<div class="container-items-list" style="margin-top: 8px;">`;
                point.items.forEach(function(item) {
                    const imgTag = item.img ? `<img src="${item.img}" onerror="this.style.display='none'" style="width: 24px; height: 24px; margin-right: 4px; vertical-align: middle;">` : '';
                    const healthText = item.health ? ` (HP: ${item.health})` : '';
                    html += `<div class="mb-1">${imgTag}<span>${item.name || item.type}${healthText}</span></div>`;
                });
                html += `</div>`;
            } else {
                html += `<br><span class="text-muted">Container vazio</span>`;
            }
            
            html += `</div>`;
        }
    }
    
    html += `</div></div>`;
    modalBody.innerHTML = html;
    
    // Abrir modal usando Bootstrap 5
    const modal = new bootstrap.Modal(document.getElementById('trailHistoryModal'));
    modal.show();
}

/**
 * Aplicar filtros de data no histórico
 */
function applyHistoryFilters() {
    const dateFrom = document.getElementById('historyDateFrom').value || null;
    const dateTo = document.getElementById('historyDateTo').value || null;
    
    // Fechar modal antes de recarregar para evitar overlay preso
    const modalElement = document.getElementById('trailHistoryModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    const isModalOpen = modal && modal._isShown;
    
    if (isModalOpen) {
        // Aguardar o modal fechar completamente antes de recarregar
        $(modalElement).one('hidden.bs.modal', function() {
            if (currentHistoryType === 'container') {
                loadContainerHistory(currentHistoryId, 0, dateFrom, dateTo);
            } else if (currentHistoryType === 'fence') {
                loadFenceHistory(currentHistoryId, 0, dateFrom, dateTo);
            }
        });
        modal.hide();
    } else {
        // Se o modal não estava aberto, executar diretamente
        if (currentHistoryType === 'container') {
            loadContainerHistory(currentHistoryId, 0, dateFrom, dateTo);
        } else if (currentHistoryType === 'fence') {
            loadFenceHistory(currentHistoryId, 0, dateFrom, dateTo);
        } else if (currentHistoryType === 'watchtower') {
            loadWatchtowerHistory(currentHistoryId, 0, dateFrom, dateTo);
        }
    }
}

/**
 * Carregar página do histórico
 */
function loadHistoryPage(offset) {
    if (currentHistoryType === 'container') {
        loadContainerHistory(currentHistoryId, offset, currentHistoryPagination.date_from, currentHistoryPagination.date_to);
    } else if (currentHistoryType === 'fence') {
        loadFenceHistory(currentHistoryId, offset, currentHistoryPagination.date_from, currentHistoryPagination.date_to);
    } else if (currentHistoryType === 'watchtower') {
        loadWatchtowerHistory(currentHistoryId, offset, currentHistoryPagination.date_from, currentHistoryPagination.date_to);
    }
}

/**
 * Carregar histórico da fence com filtros e paginação
 */
function loadFenceHistory(fenceId, offset = 0, dateFrom = null, dateTo = null) {
    currentHistoryType = 'fence';
    currentHistoryId = fenceId;
    currentHistoryPagination.offset = offset;
    currentHistoryPagination.date_from = dateFrom;
    currentHistoryPagination.date_to = dateTo;
    
    const params = {
        limit: currentHistoryPagination.limit,
        offset: offset
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    
    console.log('Carregando histórico da fence:', fenceId, params);
    $.get(`/api/fences/${fenceId}/trail`, params)
        .done(function(data) {
            console.log('Trail da fence recebido:', fenceId, data);
            showFenceHistoryModal(fenceId, data.trail, data.pagination);
        })
        .fail(function() {
            console.error('Erro ao carregar histórico da fence:', fenceId);
        });
}

/**
 * Carregar histórico da watchtower com filtros e paginação
 */
function loadWatchtowerHistory(watchtowerId, offset = 0, dateFrom = null, dateTo = null) {
    currentHistoryType = 'watchtower';
    currentHistoryId = watchtowerId;
    currentHistoryPagination.offset = offset;
    currentHistoryPagination.date_from = dateFrom;
    currentHistoryPagination.date_to = dateTo;

    const params = {
        limit: currentHistoryPagination.limit,
        offset: offset
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    $.get(`/api/watchtowers/${watchtowerId}/trail`, params)
        .done(function(data) {
            showFenceHistoryModal(watchtowerId, data.trail, data.pagination);
        })
        .fail(function() {
            console.error('Erro ao carregar histórico da watchtower:', watchtowerId);
        });
}

/**
 * Exibir modal com histórico da fence
 */
function showFenceHistoryModal(fenceId, trail, pagination) {
    const fence = fencesData[fenceId];
    if (!fence) return;
    
    const modalTitle = document.getElementById('trailHistoryModalTitle');
    const modalBody = document.getElementById('trailHistoryModalBody');
    const isWatchtower = fence.structure_type === 'watchtower';
    const modalIcon = isWatchtower ? 'fa-chess-rook' : 'fa-home';
    modalTitle.innerHTML = `<i class="fas ${modalIcon} me-2"></i>Histórico - ${fence.fence_name || (isWatchtower ? 'Watchtower' : 'Fence')}`;
    
    function formatDateForInput(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    }
    
    const formatStatusLabel = (value) => {
        if (value === null || value === undefined) return 'Desconhecido';
        return value ? 'Sim' : 'Não';
    };
    const formatWatchtowerStatus = (value) => {
        if (value === null || value === undefined) return 'Desconhecido';
        return value ? 'Construído' : 'Não construído';
    };
    const normalizeFlag = (value) => value === true || value === 1;
    
    let html = `<div class="trail-history-container">`;
    html += `<div class="mb-3"><strong>ID:</strong> ${fenceId}</div>`;
    html += `<div class="mb-3"><strong>Coordenadas:</strong> X=${fence.coord_x.toFixed(1)}, Y=${fence.coord_y.toFixed(1)}</div>`;
    
    html += `<div class="row mb-3">`;
    html += `<div class="col-md-5">`;
    html += `<label class="form-label small">Data inicial:</label>`;
    html += `<input type="date" class="form-control form-control-sm" id="historyDateFrom" value="${formatDateForInput(currentHistoryPagination.date_from)}">`;
    html += `</div>`;
    html += `<div class="col-md-5">`;
    html += `<label class="form-label small">Data final:</label>`;
    html += `<input type="date" class="form-control form-control-sm" id="historyDateTo" value="${formatDateForInput(currentHistoryPagination.date_to)}">`;
    html += `</div>`;
    html += `<div class="col-md-2 d-flex align-items-end">`;
    html += `<button type="button" class="btn btn-sm btn-primary w-100" onclick="applyHistoryFilters()">Filtrar</button>`;
    html += `</div>`;
    html += `</div>`;
    
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
    
    html += `<div class="d-flex justify-content-between align-items-center mb-3">`;
    html += `<div><strong>Total de eventos (sem duplicados):</strong> ${pagination.total}</div>`;
    html += `<div>`;
    if (pagination.offset > 0) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="loadHistoryPage(${pagination.offset - pagination.limit})">Anterior</button>`;
    }
    html += `<span class="mx-2">Página ${currentPage} de ${totalPages || 1}</span>`;
    if (pagination.has_more) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary ms-1" onclick="loadHistoryPage(${pagination.offset + pagination.limit})">Próxima</button>`;
    }
    html += `</div>`;
    html += `</div>`;
    
    html += `<div class="trail-timeline" style="max-height: 500px; overflow-y: auto;">`;
    
    if (trail.length === 0) {
        html += `<div class="text-muted text-center py-4">Nenhum evento encontrado</div>`;
    } else {
        for (let i = 0; i < trail.length; i++) {
            const point = trail[i];
            const prevPoint = i < trail.length - 1 ? trail[i + 1] : null;
            
            let borderColor = i === 0 ? '4caf50' : 'ffc107';
            if (isWatchtower) {
                borderColor = i === 0 ? '4e73df' : '36b9cc';
            } else if (prevPoint) {
                const prevLower = normalizeFlag(prevPoint.lower_panel_built);
                const prevUpper = normalizeFlag(prevPoint.upper_panel_built);
                const currentLower = normalizeFlag(point.lower_panel_built);
                const currentUpper = normalizeFlag(point.upper_panel_built);
                if ((prevLower && !currentLower) || (prevUpper && !currentUpper)) {
                    borderColor = 'dc3545';
                }
            }
            
            html += `<div class="trail-timeline-item" style="border-left: 3px solid #${borderColor}; padding-left: 15px; margin-bottom: 20px;">`;
            html += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
            html += `📍 Coords: X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}`;
            
            if (isWatchtower) {
                const flagDefs = [
                    { key: 'has_base', label: 'Base' },
                    { key: 'level_1_base', label: 'Nível 1' },
                    { key: 'level_2_base', label: 'Nível 2' },
                    { key: 'level_3_base', label: 'Nível 3' },
                    { key: 'level_1_stairs', label: 'Escadas Nível 1' },
                    { key: 'level_2_stairs', label: 'Escadas Nível 2' },
                    { key: 'has_roof', label: 'Telhado' }
                ];
                let lostFlags = [];
                html += `<div class="mt-2">`;
                flagDefs.forEach(def => {
                    const currentVal = normalizeFlag(point[def.key]);
                    const prevVal = prevPoint ? normalizeFlag(prevPoint[def.key]) : null;
                    let changeIndicator = '';
                    if (prevVal !== null && prevVal !== currentVal) {
                        changeIndicator = currentVal ? ' <span class="text-success">(+)</span>' : ' <span class="text-danger">(-)</span>';
                        if (!currentVal) {
                            lostFlags.push(def.label);
                        }
                    }
                    html += `
                        <div class="info-row">
                            <span class="info-label">${def.label}:</span>
                            <span class="info-value">${formatWatchtowerStatus(point[def.key])}${changeIndicator}</span>
                        </div>
                    `;
                });
                html += `</div>`;
                
                if (point.orientation && (point.orientation.x !== null || point.orientation.y !== null)) {
                    const pitch = point.orientation.x !== null && point.orientation.x !== undefined ? Number(point.orientation.x).toFixed(1) : 'N/A';
                    const yaw = point.orientation.y !== null && point.orientation.y !== undefined ? Number(point.orientation.y).toFixed(1) : 'N/A';
                    html += `<div class="info-row mt-2"><span class="info-label">Orientação:</span><span class="info-value">Pitch: ${pitch}°, Yaw: ${yaw}°</span></div>`;
                }
                
                if (lostFlags.length > 0) {
                    html += `<div class="alert alert-danger mt-2 mb-0" style="padding: 6px; font-size: 12px;">
                        <i class="fas fa-exclamation-triangle me-1"></i><strong>Componentes perdidos:</strong> ${lostFlags.join(', ')}
                    </div>`;
                }
            } else {
                let hasAttack = false;
                let attackMessage = '';
                if (prevPoint) {
                    const prevLower = normalizeFlag(prevPoint.lower_panel_built);
                    const prevUpper = normalizeFlag(prevPoint.upper_panel_built);
                    const currentLower = normalizeFlag(point.lower_panel_built);
                    const currentUpper = normalizeFlag(point.upper_panel_built);
                    
                    if (prevLower && !currentLower) {
                        hasAttack = true;
                        attackMessage += 'Painel inferior perdido; ';
                    }
                    if (prevUpper && !currentUpper) {
                        hasAttack = true;
                        attackMessage += 'Painel superior perdido; ';
                    }
                }
                
                if (hasAttack) {
                    html += ` <span style="color: #dc3545; font-weight: bold;">⚠️ Possível ataque detectado</span>`;
                }
                
                html += `<div class="mt-2">`;
                html += `<span class="badge bg-secondary me-1">Base: ${formatStatusLabel(point.has_base)}</span>`;
                html += `<span class="badge bg-secondary me-1">Painel Inferior: ${formatStatusLabel(point.lower_panel_built)}</span>`;
                html += `<span class="badge bg-secondary me-1">Painel Superior: ${formatStatusLabel(point.upper_panel_built)}</span>`;
                html += `</div>`;
                
                if (hasAttack) {
                    html += `<div class="alert alert-danger mt-2 mb-0" style="padding: 6px; font-size: 12px;">
                        <i class="fas fa-exclamation-triangle me-1"></i><strong>Possível ataque detectado:</strong> ${attackMessage}
                    </div>`;
                }
            }
            
            html += `</div>`;
        }
    }
    
    html += `</div></div>`;
    modalBody.innerHTML = html;
    
    const modal = new bootstrap.Modal(document.getElementById('trailHistoryModal'));
    modal.show();
}

/**
 * Desenhar trail de um jogador
 */
function drawTrail(playerId, trail) {
    // Remover trail antigo se existir
    if (playerTrails[playerId]) {
        if (Array.isArray(playerTrails[playerId])) {
            playerTrails[playerId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(playerTrails[playerId]);
        }
    }
    
    playerTrails[playerId] = [];
    
    if (trail.length === 0) return;
    
    // Aplicar filtro de data se ativo
    let filteredTrail = trail;
    if (trailDateFilter.enabled) {
        filteredTrail = trail.filter(point => {
            const pointDate = new Date(point.timestamp);
            return pointDate >= trailDateFilter.startDate && 
                   pointDate <= trailDateFilter.endDate;
        });
        
        if (filteredTrail.length === 0) {
            console.log('Nenhum ponto encontrado no período especificado');
            return;
        }
    }
    
    // Converter pontos para coordenadas do mapa
    const processedTrail = [];
    filteredTrail.forEach(function(point) {
        const coords = convertToMapCoords(point.pixel_coords);
        if (coords) {
            processedTrail.push({
                data: point,
                mapCoords: coords
            });
        }
    });
    
    if (processedTrail.length === 0) {
        return;
    }
    
    // Criar linha do trail
    const latlngs = processedTrail.map(item => item.mapCoords);
    const color = getPlayerColor(playerId);
    
    const polyline = L.polyline(latlngs, {
        color: color,
        weight: 4,
        opacity: 0.85
    }).addTo(map);
    
    playerTrails[playerId].push(polyline);
    
    // Adicionar marcadores em cada ponto com cálculo de velocidade
    for (let i = 0; i < processedTrail.length; i++) {
        const point = processedTrail[i].data;
        const pointLat = processedTrail[i].mapCoords[0];
        const pointLng = processedTrail[i].mapCoords[1];
        const playerName = playersData[playerId]?.name || 'Jogador';
        const steamName = playersData[playerId]?.steamName || '';
        let tooltipText = `<strong>👤 ${playerName}${steamName ? ` (${steamName})` : ''}</strong><br>`;
        tooltipText += `<strong>📍 Ponto ${processedTrail.length - i}</strong><br>`;
        tooltipText += `⏰ Tempo: <span class="value">${point.timestamp}</span><br>`;
        tooltipText += `📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span>`;
        
        // Indicador de backup
        if (point.has_backup) {
            tooltipText += `<br>💾 <span class="value" style="color: #4caf50;">Backup disponível</span>`;
            tooltipText += `<br><br><span style="color: #4caf50; font-weight: bold;">🖱️ Clique para restaurar backup</span>`;
        }
        
        let speed = null;
        let distance = null;
        let timeDiff = null;
        let pointColor = color;
        
        // Calcular velocidade se houver ponto anterior
        if (i > 0) {
            const prevPoint = processedTrail[i - 1].data;
            
            // Calcular distância em metros (Pitágoras)
            const dx = point.coord_x - prevPoint.coord_x;
            const dy = point.coord_y - prevPoint.coord_y;
            distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calcular diferença de tempo em segundos
            const time1 = new Date(point.timestamp);
            const time2 = new Date(prevPoint.timestamp);
            timeDiff = Math.abs(time2 - time1) / 1000; // segundos
            
            // Calcular velocidade em km/h
            if (timeDiff > 0) {
                speed = (distance / timeDiff) * 3.6; // m/s para km/h
                
                tooltipText += `<br><br><strong>📊 Desde último ponto:</strong><br>`;
                tooltipText += `📏 Distância: <span class="value">${distance.toFixed(1)}m</span><br>`;
                tooltipText += `⏱️ Tempo: <span class="value">${timeDiff.toFixed(1)}s</span><br>`;
                tooltipText += `🚀 Velocidade: <span class="value">${speed.toFixed(1)} km/h</span>`;
                
                // Velocidade suspeita (>30 km/h)
                if (speed > 30) {
                    pointColor = '#ff0000'; // vermelho mais vibrante
                    tooltipText += `<br><br><span style="color: #ff5252; font-weight: bold; font-size: 14px; background: rgba(255,0,0,0.2); padding: 4px 8px; border-radius: 4px; display: inline-block;">⚠️ VELOCIDADE SUSPEITA!</span>`;
                }
            }
        }
        
        // Aumentar raio se houver backup
        const markerRadius = point.has_backup ? 7 : 5;
        
        // Criar marcador circular no ponto
        const circleMarker = L.circleMarker(
            processedTrail[i].mapCoords,
            {
                radius: markerRadius,
                fillColor: pointColor,
                color: point.has_backup ? '#4caf50' : 'white',
                weight: point.has_backup ? 2 : 1,
                opacity: 1,
                fillOpacity: 1.0
            }
        ).addTo(map);
        
        // Adicionar evento de clique (sempre, para mostrar menu de ações)
        circleMarker.on('click', function() {
            showPointActionsMenu(playerId, point, trail.length - i);
        });
        
        // Adicionar cursor pointer
        circleMarker.getElement().style.cursor = 'pointer';
        
        // Adicionar tooltip (direção dinâmica baseada na posição)
        // Valores altos de Y (pixel_coords[0]) representam o norte do mapa
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });
        
        playerTrails[playerId].push(circleMarker);
    }
}

/**
 * Verificar se todos os pontos do trail estão na mesma posição
 */
function areAllPointsSame(trail) {
    if (trail.length <= 1) return true;
    
    const firstPoint = trail[0];
    const firstCoords = firstPoint.mapCoords;
    
    for (let i = 1; i < trail.length; i++) {
        const currentCoords = trail[i].mapCoords;
        // Comparar com pequena tolerância para erros de ponto flutuante
        const tolerance = 0.0001;
        if (Math.abs(firstCoords[0] - currentCoords[0]) > tolerance ||
            Math.abs(firstCoords[1] - currentCoords[1]) > tolerance) {
            return false;
        }
    }
    
    return true;
}

/**
 * Gerar tooltip consolidado para objetos estáticos
 */
function generateConsolidatedTooltip(trail, objectType, objectName) {
    const icon = objectType === 'vehicle' ? '🚗' : '📦';
    let tooltip = `<strong>${icon} ${objectName || objectType}</strong><br>`;
    tooltip += `<strong>📍 ${trail.length} atualizações no mesmo local</strong><br>`;
    tooltip += `<div style="max-height: 300px; overflow-y: auto;">`;
    
    // Timeline reversa (mais recente primeiro)
    for (let i = trail.length - 1; i >= 0; i--) {
        const point = trail[i].data;
        tooltip += `<div style="border-left: 3px solid #${i === trail.length - 1 ? '4caf50' : '007bff'}; padding-left: 8px; margin-bottom: 8px;">`;
        tooltip += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
        tooltip += `📍 Coords: X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}`;
        
        if (objectType === 'container' && point.items && point.items.length > 0) {
            tooltip += `<br>📦 Itens: ${point.items.length}`;
        }
        
        tooltip += `</div>`;
    }
    
    tooltip += `</div>`;
    return tooltip;
}

/**
 * Gerar tooltip consolidado para fence com histórico de alterações
 */
function generateFenceConsolidatedTooltip(trail) {
    let tooltip = `<strong>🏠 ${trail[0].data.fence_name || 'Fence'}</strong><br>`;
    tooltip += `<strong>📍 ${trail.length} atualizações no mesmo local</strong><br>`;
    tooltip += `<div style="max-height: 300px; overflow-y: auto;">`;
    
    // Timeline reversa (mais recente primeiro)
    for (let i = trail.length - 1; i >= 0; i--) {
        const point = trail[i].data;
        tooltip += `<div style="border-left: 3px solid #${i === trail.length - 1 ? '4caf50' : 'ffc107'}; padding-left: 8px; margin-bottom: 8px;">`;
        tooltip += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
        
        if (point.has_base !== null && point.has_base !== undefined) {
            tooltip += `🏗️ Base: <span class="value">${point.has_base ? 'Sim' : 'Não'}</span> `;
        }
        if (point.lower_panel_built !== null && point.lower_panel_built !== undefined) {
            tooltip += `🔨 Inf: <span class="value">${point.lower_panel_built ? 'Sim' : 'Não'}</span> `;
        }
        if (point.upper_panel_built !== null && point.upper_panel_built !== undefined) {
            tooltip += `🔨 Sup: <span class="value">${point.upper_panel_built ? 'Sim' : 'Não'}</span>`;
        }
        
        tooltip += `</div>`;
    }
    
    tooltip += `</div>`;
    return tooltip;
}

/**
 * Desenhar trail de um veículo
 */
function drawVehicleTrail(vehicleId, trail) {
    // Remover trail antigo se existir
    if (vehicleTrails[vehicleId]) {
        if (Array.isArray(vehicleTrails[vehicleId])) {
            vehicleTrails[vehicleId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(vehicleTrails[vehicleId]);
        }
    }
    
    vehicleTrails[vehicleId] = [];
    
    if (!trail || trail.length === 0) {
        console.warn('drawVehicleTrail: trail vazio ou inválido para veículo:', vehicleId);
        return;
    }
    
    // Converter pontos para coordenadas do mapa
    const processedTrail = [];
    trail.forEach(function(point) {
        if (!point || !point.pixel_coords) {
            console.warn('Ponto do veículo sem pixel_coords:', point);
            return;
        }
        const coords = convertToMapCoords(point.pixel_coords);
        if (coords) {
            processedTrail.push({
                data: point,
                mapCoords: coords
            });
        }
    });
    
    if (processedTrail.length === 0) {
        return;
    }
    
    // Verificar se todos os pontos estão na mesma posição
    const allPointsSame = areAllPointsSame(processedTrail);
    
    if (allPointsSame) {
        // Objeto estático: criar um único círculo maior com tooltip consolidado
        const firstPoint = processedTrail[0].data;
        const firstCoords = processedTrail[0].mapCoords;
        const pointLat = firstCoords[0];
        const pointLng = firstCoords[1];
        
        // Deslocar ligeiramente o círculo do trail para evitar sobreposição com o marcador do veículo
        // O marcador do veículo tem 20x20px, então deslocamos o trail ~15px para baixo e direita
        // Converter pixels para coordenadas lat/lng (aproximadamente 0.0001 grau por pixel no zoom padrão)
        const offsetLat = -0.00015; // Deslocar para baixo (sul)
        const offsetLng = 0.00015; // Deslocar para direita (leste)
        const offsetCoords = [pointLat + offsetLat, pointLng + offsetLng];
        
        // Calcular raio baseado na quantidade de pontos
        const radius = Math.min(8 + Math.log(processedTrail.length) * 2, 15);
        
        const circleMarker = L.circleMarker(offsetCoords, {
            radius: radius,
            fillColor: '#28a745',
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        // Usar coordenadas originais para o tooltip
        const tooltipText = generateConsolidatedTooltip(processedTrail, 'vehicle', firstPoint.vehicle_name);
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip',
            maxWidth: 400
        });
        
        vehicleTrails[vehicleId].push(circleMarker);
    } else {
        // Objeto em movimento: criar polyline e círculos individuais
        const latlngs = processedTrail.map(item => item.mapCoords);
        const polyline = L.polyline(latlngs, {
            color: '#28a745',
            weight: 3,
            opacity: 0.7
        }).addTo(map);
        
        vehicleTrails[vehicleId].push(polyline);
        
        // Adicionar marcadores em cada ponto
        for (let i = 0; i < processedTrail.length; i++) {
            const point = processedTrail[i].data;
            const pointLat = processedTrail[i].mapCoords[0];
            const pointLng = processedTrail[i].mapCoords[1];
            
            let tooltipText = `<strong>🚗 ${point.vehicle_name || 'Veículo'}</strong><br>`;
            tooltipText += `<strong>📍 Ponto ${processedTrail.length - i}</strong><br>`;
            tooltipText += `⏰ Tempo: <span class="value">${point.timestamp}</span><br>`;
            tooltipText += `📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span>`;
            
            // Calcular velocidade se houver ponto anterior
            if (i > 0) {
                const prevPoint = processedTrail[i - 1].data;
                const dx = point.coord_x - prevPoint.coord_x;
                const dy = point.coord_y - prevPoint.coord_y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const time1 = new Date(point.timestamp);
                const time2 = new Date(prevPoint.timestamp);
                const timeDiff = Math.abs(time2 - time1) / 1000;
                
                if (timeDiff > 0) {
                    const speed = (distance / timeDiff) * 3.6;
                    tooltipText += `<br><br><strong>📊 Desde último ponto:</strong><br>`;
                    tooltipText += `📏 Distância: <span class="value">${distance.toFixed(1)}m</span><br>`;
                    tooltipText += `⏱️ Tempo: <span class="value">${timeDiff.toFixed(1)}s</span><br>`;
                    tooltipText += `🚀 Velocidade: <span class="value">${speed.toFixed(1)} km/h</span>`;
                }
            }
            
            const circleMarker = L.circleMarker(processedTrail[i].mapCoords, {
                radius: 4,
                fillColor: '#28a745',
                color: 'white',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            
            const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
            circleMarker.bindTooltip(tooltipText, {
                permanent: false,
                direction: tooltipDirection,
                className: 'trail-tooltip'
            });
            
            vehicleTrails[vehicleId].push(circleMarker);
        }
    }
}

/**
 * Desenhar trail de um container
 */
function drawContainerTrail(containerId, trail) {
    console.log('drawContainerTrail chamado:', containerId, 'trail length:', trail ? trail.length : 0);
    
    // Remover trail antigo se existir
    if (containerTrails[containerId]) {
        if (Array.isArray(containerTrails[containerId])) {
            containerTrails[containerId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(containerTrails[containerId]);
        }
    }
    
    containerTrails[containerId] = [];
    
    if (!trail || trail.length === 0) {
        console.warn('drawContainerTrail: trail vazio ou inválido para container:', containerId);
        return;
    }
    
    // Converter pontos para coordenadas do mapa
    const processedTrail = [];
    trail.forEach(function(point) {
        if (!point || !point.pixel_coords) {
            console.warn('Ponto do container sem pixel_coords:', point);
            return;
        }
        const coords = convertToMapCoords(point.pixel_coords);
        if (coords) {
            processedTrail.push({
                data: point,
                mapCoords: coords
            });
        }
    });
    
    if (processedTrail.length === 0) {
        console.warn('drawContainerTrail: processedTrail vazio após conversão para container:', containerId);
        return;
    }
    
    console.log('drawContainerTrail: processedTrail criado com', processedTrail.length, 'pontos para container:', containerId);
    
    // Verificar se todos os pontos estão na mesma posição
    const allPointsSame = areAllPointsSame(processedTrail);
    
    console.log('drawContainerTrail: allPointsSame =', allPointsSame, 'para container:', containerId);
    
    if (allPointsSame) {
        // Objeto estático: criar um único círculo maior com tooltip consolidado
        const firstPoint = processedTrail[0].data;
        const firstCoords = processedTrail[0].mapCoords;
        const pointLat = firstCoords[0];
        const pointLng = firstCoords[1];
        
        // Calcular raio baseado na quantidade de pontos
        const radius = Math.min(8 + Math.log(processedTrail.length) * 2, 15);
        
        console.log('drawContainerTrail: criando círculo único (estático) para container:', containerId, 'radius:', radius);
        
        const circleMarker = L.circleMarker(firstCoords, {
            radius: radius,
            fillColor: '#007bff',
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        const tooltipText = generateConsolidatedTooltip(processedTrail, 'container', firstPoint.container_name || firstPoint.container_type);
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip',
            maxWidth: 400
        });
        
        containerTrails[containerId].push(circleMarker);
        console.log('drawContainerTrail: círculo único criado para container:', containerId);
    } else {
        // Objeto em movimento: criar polyline e círculos individuais
        console.log('drawContainerTrail: criando polyline e círculos (em movimento) para container:', containerId);
        const latlngs = processedTrail.map(item => item.mapCoords);
        const polyline = L.polyline(latlngs, {
            color: '#007bff',
            weight: 3,
            opacity: 0.7
        }).addTo(map);
        
        containerTrails[containerId].push(polyline);
        
        // Adicionar marcadores em cada ponto
        for (let i = 0; i < processedTrail.length; i++) {
            const point = processedTrail[i].data;
            const pointLat = processedTrail[i].mapCoords[0];
            const pointLng = processedTrail[i].mapCoords[1];
            
            let tooltipText = `<strong>📦 ${point.container_name || 'Container'}</strong><br>`;
            tooltipText += `<strong>📍 Ponto ${processedTrail.length - i}</strong><br>`;
            tooltipText += `⏰ Tempo: <span class="value">${point.timestamp}</span><br>`;
            tooltipText += `📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span>`;
            
            // Mostrar quantidade de itens se disponível
            if (point.items && point.items.length > 0) {
                tooltipText += `<br>📦 Itens: <span class="value">${point.items.length}</span>`;
            }
            
            // Calcular distância se houver ponto anterior
            if (i > 0) {
                const prevPoint = processedTrail[i - 1].data;
                const dx = point.coord_x - prevPoint.coord_x;
                const dy = point.coord_y - prevPoint.coord_y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    tooltipText += `<br><br><strong>📊 Desde último ponto:</strong><br>`;
                    tooltipText += `📏 Distância: <span class="value">${distance.toFixed(1)}m</span>`;
                }
            }
            
            const circleMarker = L.circleMarker(processedTrail[i].mapCoords, {
                radius: 4,
                fillColor: '#007bff',
                color: 'white',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
            
            const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
            circleMarker.bindTooltip(tooltipText, {
                permanent: false,
                direction: tooltipDirection,
                className: 'trail-tooltip'
            });
            
            containerTrails[containerId].push(circleMarker);
        }
        console.log('drawContainerTrail: polyline e', processedTrail.length, 'círculos criados para container:', containerId);
    }
}

/**
 * Desenhar trail de uma fence
 */
function drawFenceTrail(fenceId, trail) {
    // Fences nunca se movem, então não precisam desenhar trail no mapa
    // O histórico é exibido em modal através de showFenceHistoryModal()
}

/**
 * Remover trail de um veículo
 */
function removeVehicleTrail(vehicleId) {
    if (vehicleTrails[vehicleId]) {
        if (Array.isArray(vehicleTrails[vehicleId])) {
            vehicleTrails[vehicleId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(vehicleTrails[vehicleId]);
        }
        delete vehicleTrails[vehicleId];
    }
}

/**
 * Remover trail de um container
 */
function removeContainerTrail(containerId) {
    if (containerTrails[containerId]) {
        if (Array.isArray(containerTrails[containerId])) {
            containerTrails[containerId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(containerTrails[containerId]);
        }
        delete containerTrails[containerId];
    }
}

/**
 * Remover trail de uma fence
 */
function removeFenceTrail(fenceId) {
    if (fenceTrails[fenceId]) {
        if (Array.isArray(fenceTrails[fenceId])) {
            fenceTrails[fenceId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(fenceTrails[fenceId]);
        }
        delete fenceTrails[fenceId];
    }
}

/**
 * Toggle mostrar trails
 */
function toggleTrails() {
    showTrails = !showTrails;
    
    if (showTrails) {
        $('#toggleTrailsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Trails');
        $('#trailDateFilter').show();
        // Carregar trails de todos os jogadores visíveis
        Object.keys(playerMarkers).forEach(loadPlayerTrail);
    } else {
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar Trails');
        $('#trailDateFilter').hide();
        // Limpar filtros
        trailDateFilter.enabled = false;
        trailDateFilter.startDate = null;
        trailDateFilter.endDate = null;
        $('#trailStartDate').val('');
        $('#trailStartTime').val('');
        $('#trailEndDate').val('');
        $('#trailEndTime').val('');
        // Remover todos os trails
        Object.keys(playerTrails).forEach(function(key) {
            const trail = playerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => map.removeLayer(item));
            } else {
                map.removeLayer(trail);
            }
        });
        playerTrails = {};
    }
}

/**
 * Toggle mostrar jogadores
 */
function togglePlayersDisplay() {
    showPlayers = !showPlayers;
    
    if (showPlayers) {
        $('#togglePlayersBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Jogadores');
        // Recarregar posições
        loadPositions();
    } else {
        $('#togglePlayersBtn').html('<i class="fas fa-user me-1"></i>Mostrar Jogadores');
        // Remover todos os marcadores de jogadores
        Object.keys(playerMarkers).forEach(function(key) {
            map.removeLayer(playerMarkers[key]);
        });
        playerMarkers = {};
    }
}

/**
 * Pesquisar jogadores
 */
function handlePlayerSearch() {
    const searchTerm = $('#playerSearchInput').val().toLowerCase().trim();
    const resultsContainer = $('#playerSearchResults');
    
    if (searchTerm === '') {
        resultsContainer.hide();
        return;
    }
    
    // Filtrar jogadores que correspondem à pesquisa
    const matchingPlayers = Object.keys(playersData)
        .filter(playerId => {
            const player = playersData[playerId];
            const name = (player.name || '').toLowerCase();
            const steamName = (player.steamName || '').toLowerCase();
            
            // Não mostrar jogadores já selecionados
            if (selectedPlayerFilters.includes(playerId)) {
                return false;
            }
            
            return name.includes(searchTerm) || 
                   steamName.includes(searchTerm) || 
                   playerId.toLowerCase().includes(searchTerm);
        })
        .slice(0, 10); // Limitar a 10 resultados
    
    if (matchingPlayers.length === 0) {
        resultsContainer.html('<div class="list-group-item text-muted">Nenhum jogador encontrado</div>');
        resultsContainer.show();
        return;
    }
    
    // Renderizar resultados
    resultsContainer.empty();
    matchingPlayers.forEach(playerId => {
        const player = playersData[playerId];
        const displayName = player.name || playerId;
        const steamName = player.steamName ? ` (${player.steamName})` : '';
        const statusIcon = player.isOnline ? '🟢' : '🔴';
        
        const item = $('<div class="list-group-item"></div>')
            .html(`${statusIcon} ${displayName}${steamName}`)
            .on('click', function() {
                addPlayerToFilter(playerId);
            });
        
        resultsContainer.append(item);
    });
    
    resultsContainer.show();
}

/**
 * Adicionar jogador ao filtro
 */
function addPlayerToFilter(playerId) {
    if (selectedPlayerFilters.includes(playerId)) {
        return;
    }
    
    selectedPlayerFilters.push(playerId);
    
    // Limpar campo de pesquisa
    $('#playerSearchInput').val('');
    $('#playerSearchResults').hide();
    
    // Atualizar UI
    updateSelectedPlayersBadges();
    
    // Aplicar filtro
    filterPlayers();
}

/**
 * Remover jogador do filtro
 */
function removePlayerFromFilter(playerId) {
    const index = selectedPlayerFilters.indexOf(playerId);
    if (index > -1) {
        selectedPlayerFilters.splice(index, 1);
    }
    
    // Atualizar UI
    updateSelectedPlayersBadges();
    
    // Aplicar filtro
    filterPlayers();
}

/**
 * Atualizar badges de jogadores selecionados
 */
function updateSelectedPlayersBadges() {
    const container = $('#selectedPlayersBadges');
    container.empty();
    
    if (selectedPlayerFilters.length === 0) {
        $('#clearAllFiltersBtn').hide();
        return;
    }
    
    $('#clearAllFiltersBtn').show();
    
    selectedPlayerFilters.forEach(playerId => {
        const player = playersData[playerId];
        const displayName = player ? (player.name || playerId) : playerId;
        const steamName = player && player.steamName ? ` (${player.steamName})` : '';
        const statusIcon = player && player.isOnline ? '🟢' : '🔴';
        
        const badge = $('<span class="badge bg-primary"></span>')
            .html(`${statusIcon} ${displayName}${steamName} <i class="fas fa-times remove-player"></i>`)
            .find('.remove-player')
            .on('click', function(e) {
                e.stopPropagation();
                removePlayerFromFilter(playerId);
            })
            .end();
        
        container.append(badge);
    });
}

/**
 * Limpar todos os filtros de jogadores
 */
function clearAllPlayerFilters() {
    selectedPlayerFilters = [];
    updateSelectedPlayersBadges();
    filterPlayers();
}

/**
 * Filtrar jogadores
 */
function filterPlayers() {
    
    // Se trails estão ativos, limpar todos antes de recarregar
    if (showTrails) {
        Object.keys(playerTrails).forEach(function(key) {
            const trail = playerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => map.removeLayer(item));
            } else {
                map.removeLayer(trail);
            }
        });
        playerTrails = {};
    }
    
    // Recarregar posições
    loadPositions();
    
    // Se trails estavam ativos, recarregar para jogadores visíveis após um delay
    if (showTrails) {
        setTimeout(function() {
            Object.keys(playerMarkers).forEach(loadPlayerTrail);
        }, 500);
    }
}

/**
 * Aplicar filtro de trail por atalho
 */
function applyTrailFilterShortcut(shortcut) {
    const now = new Date();
    let startDate, endDate;
    
    switch(shortcut) {
        case '1hour':
            startDate = new Date(now.getTime() - (1 * 60 * 60 * 1000));
            endDate = now;
            break;
        case '3hours':
            startDate = new Date(now.getTime() - (3 * 60 * 60 * 1000));
            endDate = now;
            break;
        case '6hours':
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            endDate = now;
            break;
        case '24hours':
            startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            endDate = now;
            break;
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            endDate = now;
            break;
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
            break;
        case '7days':
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            endDate = now;
            break;
        case 'clear':
            // Limpar filtro
            $('#trailStartDate').val('');
            $('#trailStartTime').val('');
            $('#trailEndDate').val('');
            $('#trailEndTime').val('');
            trailDateFilter.enabled = false;
            trailDateFilter.startDate = null;
            trailDateFilter.endDate = null;
            Object.keys(playerMarkers).forEach(loadPlayerTrail);
            return;
    }
    
    // Formatar e preencher campos
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const formatTime = (date) => {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };
    
    $('#trailStartDate').val(formatDate(startDate));
    $('#trailStartTime').val(formatTime(startDate));
    $('#trailEndDate').val(formatDate(endDate));
    $('#trailEndTime').val(formatTime(endDate));
    
    // Aplicar filtro automaticamente
    applyTrailDateFilter();
}

/**
 * Atualizar filtro de data dos trails automaticamente (para Auto-Refresh)
 * Atualiza o filtro para as últimas N horas e recarrega os trails
 */
function updateTrailDateFilterAuto(hours = 1) {
    if (!showTrails) return;
    
    const now = new Date();
    const startDate = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    // Formatar datas
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const formatTime = (date) => {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };
    
    // Atualizar campos HTML
    $('#trailStartDate').val(formatDate(startDate));
    $('#trailStartTime').val(formatTime(startDate));
    $('#trailEndDate').val(formatDate(now));
    $('#trailEndTime').val(formatTime(now));
    
    // Aplicar filtro (isso já recarrega os trails)
    applyTrailDateFilter();
}

/**
 * Aplicar filtro de data nos trails
 */
function applyTrailDateFilter() {
    const startDate = $('#trailStartDate').val();
    const startTime = $('#trailStartTime').val() || '00:00:00';
    const endDate = $('#trailEndDate').val();
    const endTime = $('#trailEndTime').val() || '23:59:59';
    
    if (startDate && endDate) {
        trailDateFilter.enabled = true;
        trailDateFilter.startDate = new Date(`${startDate}T${startTime}`);
        trailDateFilter.endDate = new Date(`${endDate}T${endTime}`);
    } else {
        trailDateFilter.enabled = false;
        trailDateFilter.startDate = null;
        trailDateFilter.endDate = null;
    }
    
    // Recarregar trails com filtro
    Object.keys(playerMarkers).forEach(loadPlayerTrail);
}

/**
 * Toggle auto-refresh
 */
function toggleAutoRefresh() {
    if ($('#autoRefreshCheck').is(':checked')) {
        autoRefreshInterval = setInterval(function() {
            loadPositions();
            if (showVehicles) {
                loadVehicles();
            }
            if (showContainers) {
                loadContainers();
            }
            if (showFences) {
                loadFences();
            }
            if (showKills) {
                loadKills();
            }
            if (showDamages) {
                loadDamages();
            }
            // Recarregar trails se estiverem ativos, atualizando filtro de data automaticamente
            if (showTrails) {
                updateTrailDateFilterAuto(1); // Últimas 1 hora (já recarrega os trails internamente)
            }
        }, 60000); // 60 segundos (1 minuto - alinhado com frequência de salvamento das coordenadas)
        console.log('Auto-refresh ligado');
    } else {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        console.log('Auto-refresh desligado');
    }
}

/**
 * Carregar posições de veículos
 */
function loadVehicles() {
    const includeDestroyed = $('#showDestroyedCheck').is(':checked');
    $.get('/api/vehicles/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateVehicles(data);
        })
        .fail(function() {
            console.error('Erro ao carregar veículos');
        });
}

/**
 * Atualizar veículos no mapa
 */
function updateVehicles(data) {
    // Limpar veículos antigos
    Object.keys(vehicleMarkers).forEach(function(key) {
        map.removeLayer(vehicleMarkers[key]);
    });
    vehicleMarkers = {};
    
    // Atualizar contador de veículos
    $('#vehicleCount').text(data.vehicles.length);
    
    if (!showVehicles) {
        return;
    }
    
    // Adicionar veículos
    data.vehicles.forEach(function(vehicle) {
        const vehicleId = vehicle.vehicle_id;
        const coords = convertToMapCoords(vehicle.pixel_coords);
        
        if (!coords) {
            return;
        }
        
        vehiclesData[vehicleId] = vehicle;
        
        const isDestroyed = vehicle.is_destroyed || false;
        const hasMoved = vehicle.has_moved || false;
        const marker = L.marker(coords, {
            icon: createVehicleIcon(hasMoved),
            opacity: isDestroyed ? 0.5 : 1.0
        }).addTo(map);
        
        const popupContent = createVehiclePopup(vehicle);
        const popupOffset = getPopupOffsetForPoint(coords[0], coords[1]);
        
        marker.bindPopup(popupContent, {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [60, 60],
            autoPanPaddingBottomRight: [60, 60],
            maxWidth: 300,
            offset: popupOffset
        });
        
        vehicleMarkers[vehicleId] = marker;
    });
    
    console.log(`Veículos atualizados: ${data.vehicles.length} veículos`);
}

/**
 * Toggle trail de veículo
 */
function toggleVehicleTrail(vehicleId) {
    if (vehicleTrails[vehicleId]) {
        removeVehicleTrail(vehicleId);
        $(`#vehicleTrailBtn_${vehicleId}`).text('Mostrar Trail');
        updateVehiclePopup(vehicleId);
    } else {
        loadVehicleTrail(vehicleId);
        $(`#vehicleTrailBtn_${vehicleId}`).text('Ocultar Trail');
        updateVehiclePopup(vehicleId);
    }
}

/**
 * Criar popup de veículo
 */
function createVehiclePopup(vehicle) {
    let itemsHtml = '';
    const items = vehicle.items || [];
    
    if (items.length > 0) {
        itemsHtml += '<div class="mt-2"><strong>📦 Itens:</strong><div class="mt-1">';
        items.forEach(function(item) {
            const imgTag = item.img ? `<img src="${item.img}" onerror="this.style.display='none'" style="width: 24px; height: 24px; margin-right: 4px; vertical-align: middle;">` : '';
            const healthText = item.health ? ` (HP: ${item.health.toFixed(2)})` : '';
            itemsHtml += `<div class="item-display">${imgTag}<span>${item.name || item.type}${healthText}</span></div>`;
        });
        itemsHtml += '</div></div>';
    } else {
        itemsHtml = '<div class="text-muted mt-2">Nenhum item no inventário</div>';
    }
    
    let attachmentsHtml = '';
    const attachments = vehicle.attachments || [];
    
    if (attachments.length > 0) {
        attachmentsHtml += '<div class="mt-2"><strong>🔧 Partes do Veículo:</strong><div class="mt-1">';
        attachments.forEach(function(attachment) {
            const imgTag = attachment.img ? `<img src="${attachment.img}" onerror="this.style.display='none'" style="width: 24px; height: 24px; margin-right: 4px; vertical-align: middle;">` : '';
            const healthText = attachment.health ? ` (HP: ${attachment.health.toFixed(2)})` : '';
            attachmentsHtml += `<div class="item-display">${imgTag}<span>${attachment.name || attachment.type}${healthText}</span></div>`;
        });
        attachmentsHtml += '</div></div>';
    }
    
    let healthPartsHtml = '';
    const healthParts = vehicle.health_parts;
    
    if (healthParts) {
        healthPartsHtml += '<div class="mt-2"><strong>💚 Saúde das Partes:</strong><div class="mt-1">';
        if (healthParts.engine !== null && healthParts.engine !== undefined) {
            healthPartsHtml += `<div class="info-row"><span class="info-label">🔧 Motor:</span><span class="info-value">${(healthParts.engine * 100).toFixed(1)}%</span></div>`;
        }
        if (healthParts.body !== null && healthParts.body !== undefined) {
            healthPartsHtml += `<div class="info-row"><span class="info-label">🚗 Corpo:</span><span class="info-value">${(healthParts.body * 100).toFixed(1)}%</span></div>`;
        }
        if (healthParts.fuel_tank !== null && healthParts.fuel_tank !== undefined) {
            healthPartsHtml += `<div class="info-row"><span class="info-label">⛽ Tanque:</span><span class="info-value">${(healthParts.fuel_tank * 100).toFixed(1)}%</span></div>`;
        }
        healthPartsHtml += '</div></div>';
    }
    
    const isDestroyed = vehicle.is_destroyed || false;
    const destroyedInfo = isDestroyed ? `
        <div class="info-row">
            <span class="info-label"><i class="fas fa-exclamation-triangle text-warning me-1"></i>Status:</span>
            <span class="info-value text-warning">Destruído</span>
        </div>
        <div class="info-row">
            <span class="info-label">Destruído em:</span>
            <span class="info-value">${vehicle.destroyed_at || 'Desconhecido'}</span>
        </div>
    ` : '';
    
    return `
        <div class="player-popup">
            <strong><i class="fas fa-car me-2"></i>${vehicle.vehicle_name}</strong>
            <div class="info-row">
                <span class="info-label">ID:</span>
                <span class="info-value">${vehicle.vehicle_id}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Coords:</span>
                <span class="info-value">X: ${vehicle.coord_x.toFixed(2)}, Y: ${vehicle.coord_y.toFixed(2)} (altura: ${vehicle.coord_z ? vehicle.coord_z.toFixed(2) : 'N/A'})</span>
            </div>
            ${healthPartsHtml}
            ${itemsHtml}
            ${attachmentsHtml}
            <div class="info-row mt-2">
                <span class="info-label">Atualizado:</span>
                <span class="info-value">${vehicle.last_update || 'Desconhecido'}</span>
            </div>
            ${destroyedInfo}
            <div class="info-row mt-2">
                <button type="button" class="btn btn-sm btn-success" onclick="toggleVehicleTrail('${vehicle.vehicle_id}')">
                    <i class="fas fa-route me-1"></i><span id="vehicleTrailBtn_${vehicle.vehicle_id}">${vehicleTrails[vehicle.vehicle_id] ? 'Ocultar Trail' : 'Mostrar Trail'}</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Atualizar popup de veículo
 */
function updateVehiclePopup(vehicleId) {
    const marker = vehicleMarkers[vehicleId];
    if (!marker || !vehiclesData[vehicleId]) return;
    
    const vehicle = vehiclesData[vehicleId];
    const popupContent = createVehiclePopup(vehicle);
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
    }
}

/**
 * Toggle mostrar veículos
 */
function toggleVehiclesDisplay() {
    showVehicles = !showVehicles;
    
    if (showVehicles) {
        $('#toggleVehiclesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Veículos');
        loadVehicles();
    } else {
        $('#toggleVehiclesBtn').html('<i class="fas fa-car me-1"></i>Mostrar Veículos');
        // Remover todos os veículos
        Object.keys(vehicleMarkers).forEach(function(key) {
            map.removeLayer(vehicleMarkers[key]);
        });
        vehicleMarkers = {};
        
        // Limpar trails de veículos
        Object.keys(vehicleTrails).forEach(function(key) {
            const trail = vehicleTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => map.removeLayer(item));
            } else {
                map.removeLayer(trail);
            }
        });
        vehicleTrails = {};
        
        // Resetar contador de veículos
        $('#vehicleCount').text('0');
    }
}

/**
 * Carregar posições de containers
 */
function loadContainers() {
    if (!showContainers) {
        return;
    }
    
    const includeDestroyed = $('#showDestroyedCheck').is(':checked');
    $.get('/api/containers/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateContainers(data);
        })
        .fail(function() {
            console.error('Erro ao carregar containers');
        });
}

/**
 * Toggle trail de container
 */
function toggleContainerTrail(containerId) {
    if (containerTrails[containerId]) {
        removeContainerTrail(containerId);
        $(`#containerTrailBtn_${containerId}`).text('Mostrar Trail');
        updateContainerPopup(containerId);
    } else {
        loadContainerTrail(containerId);
        $(`#containerTrailBtn_${containerId}`).text('Ocultar Trail');
        updateContainerPopup(containerId);
    }
}

/**
 * Atualizar popup de container
 */
function updateContainerPopup(containerId) {
    const marker = containerMarkers[containerId];
    if (!marker || !containersData[containerId]) return;
    
    const container = containersData[containerId];
    const popupContent = createContainerPopup(container);
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
    }
}

/**
 * Atualizar containers no mapa
 */
function updateContainers(data) {
    // Limpar containers antigos
    if (containerClusterGroup) {
        containerClusterGroup.clearLayers();
    }
    Object.keys(containerMarkers).forEach(function(key) {
        if (containerMarkers[key] && map.hasLayer(containerMarkers[key])) {
            map.removeLayer(containerMarkers[key]);
        }
    });
    containerMarkers = {};
    
    // Atualizar contador de containers
    $('#containerCount').text(data.containers.length);
    
    if (!showContainers) {
        return;
    }
    
    // Criar ou reutilizar cluster group
    if (!containerClusterGroup) {
        containerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 60, // Raio máximo para agrupar (em pixels)
            spiderfyOnMaxZoom: true, // Separar ao fazer zoom máximo
            showCoverageOnHover: true, // Mostrar área coberta ao passar mouse
            zoomToBoundsOnClick: true, // Fazer zoom ao clicar no cluster
            iconCreateFunction: createContainerClusterIcon
        });
    }
    
    // Adicionar containers ao cluster group
    data.containers.forEach(function(container) {
        const containerId = container.container_id;
        const coords = convertToMapCoords(container.pixel_coords);
        
        if (!coords) {
            return;
        }
        
        containersData[containerId] = container;
        
        const isDestroyed = container.is_destroyed || false;
        const marker = L.marker(coords, {
            icon: createContainerIcon(container.container_type),
            opacity: isDestroyed ? 0.5 : 1.0
        });
        
        const popupContent = createContainerPopup(container);
        const popupOffset = getPopupOffsetForPoint(coords[0], coords[1]);
        
        marker.bindPopup(popupContent, {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [60, 60],
            autoPanPaddingBottomRight: [60, 60],
            maxWidth: 300,
            offset: popupOffset
        });
        
        containerMarkers[containerId] = marker;
        containerClusterGroup.addLayer(marker);
    });
    
    // Adicionar cluster group ao mapa se ainda não estiver
    if (!map.hasLayer(containerClusterGroup)) {
        containerClusterGroup.addTo(map);
    }
    
    console.log(`Containers atualizados: ${data.containers.length} containers`);
}

/**
 * Criar popup de container
 */
function createContainerPopup(container) {
    let itemsHtml = '';
    const items = container.items || [];
    
    // Debug: log para WoodenCrate
    if (container.container_type === 'WoodenCrate' || (container.container_type && container.container_type.includes('WoodenCrate'))) {
        console.log('DEBUG WoodenCrate popup:', container.container_id, 'items:', items);
        items.forEach(function(item) {
            console.log('  - Item:', item.type, 'img:', item.img, 'name:', item.name);
        });
    }
    
    if (items.length > 0) {
        itemsHtml += '<div class="mt-2"><strong>Items:</strong><div class="mt-1">';
        items.forEach(function(item) {
            const imgTag = item.img ? `<img src="${item.img}" onerror="this.style.display='none'" style="width: 24px; height: 24px; margin-right: 4px; vertical-align: middle;">` : '';
            const healthText = item.health ? ` (HP: ${item.health})` : '';
            itemsHtml += `<div class="item-display">${imgTag}<span>${item.name || item.type}${healthText}</span></div>`;
        });
        itemsHtml += '</div></div>';
    } else {
        itemsHtml = '<div class="text-muted mt-2">Container vazio</div>';
    }
    
    const isDestroyed = container.is_destroyed || false;
    const destroyedInfo = isDestroyed ? `
        <div class="info-row">
            <span class="info-label"><i class="fas fa-exclamation-triangle text-warning me-1"></i>Status:</span>
            <span class="info-value text-warning">Destruído</span>
        </div>
        <div class="info-row">
            <span class="info-label">Destruído em:</span>
            <span class="info-value">${container.destroyed_at || 'Desconhecido'}</span>
        </div>
    ` : '';
    
    return `
        <div class="player-popup">
            <strong><i class="fas fa-box me-2"></i>${container.container_type}</strong>
            <div class="info-row">
                <span class="info-label">ID:</span>
                <span class="info-value">${container.container_id}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Coords:</span>
                <span class="info-value">X: ${container.coord_x.toFixed(2)}, Y: ${container.coord_y.toFixed(2)} (altura: ${container.coord_z ? container.coord_z.toFixed(2) : 'N/A'})</span>
            </div>
            ${itemsHtml}
            <div class="info-row mt-2">
                <span class="info-label">Atualizado:</span>
                <span class="info-value">${container.last_update || 'Desconhecido'}</span>
            </div>
            ${destroyedInfo}
            <div class="info-row mt-2">
                <button type="button" class="btn btn-sm btn-info me-2" onclick="showContainerLootHistory('${container.container_id}')">
                    <i class="fas fa-history me-1"></i>Histórico de Loot
                </button>
                <button type="button" class="btn btn-sm btn-primary" onclick="toggleContainerTrail('${container.container_id}')">
                    <i class="fas fa-route me-1"></i><span id="containerTrailBtn_${container.container_id}">${containerTrails[container.container_id] ? 'Ocultar Trail' : 'Mostrar Trail'}</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Toggle mostrar containers
 */
function toggleContainersDisplay() {
    showContainers = !showContainers;
    
    if (showContainers) {
        $('#toggleContainersBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Containers');
        loadContainers();
    } else {
        $('#toggleContainersBtn').html('<i class="fas fa-box me-1"></i>Mostrar Containers');
        // Remover cluster group do mapa se existir
        if (containerClusterGroup && map.hasLayer(containerClusterGroup)) {
            map.removeLayer(containerClusterGroup);
        }
        // Remover todos os containers
        Object.keys(containerMarkers).forEach(function(key) {
            if (containerMarkers[key] && map.hasLayer(containerMarkers[key])) {
                map.removeLayer(containerMarkers[key]);
            }
        });
        containerMarkers = {};
        
        // Limpar trails de containers
        Object.keys(containerTrails).forEach(function(key) {
            const trail = containerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => map.removeLayer(item));
            } else {
                map.removeLayer(trail);
            }
        });
        containerTrails = {};
        
        // Resetar contador de containers
        $('#containerCount').text('0');
    }
}

/**
 * Carregar posições de fences (construções)
 */
function loadFences() {
    if (!showFences) {
        return;
    }
    
    const includeDestroyed = $('#showDestroyedCheck').is(':checked');
    $.get('/api/fences/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateFences(data);
        })
        .fail(function() {
            console.error('Erro ao carregar fences');
        });
}

/**
 * Toggle trail de fence
 */
function toggleFenceTrail(fenceId) {
    // Fences sempre abrem modal, não desenham no mapa
    loadFenceTrail(fenceId);
}

/**
 * Atualizar popup de fence
 */
function updateFencePopup(fenceId) {
    const marker = fenceMarkers[fenceId];
    if (!marker || !fencesData[fenceId]) return;
    
    const fence = fencesData[fenceId];
    const popupContent = createFencePopup(fence);
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
    }
}

/**
 * Atualizar fences no mapa
 */
function updateFences(data) {
    // Limpar fences antigos
    Object.keys(fenceMarkers).forEach(function(key) {
        map.removeLayer(fenceMarkers[key]);
    });
    fenceMarkers = {};
    
    // Atualizar contador de fences
    $('#fenceCount').text(data.fences.length);
    
    if (!showFences) {
        return;
    }
    
    // Adicionar fences
    data.fences.forEach(function(fence) {
        const fenceId = fence.fence_id;
        const coords = convertToMapCoords(fence.pixel_coords);
        
        if (!coords) {
            return;
        }
        
        fencesData[fenceId] = fence;
        
        const isDestroyed = fence.is_destroyed || false;
        const hasRecentAttack = fence.has_recent_attack || false;
        const marker = L.marker(coords, {
            icon: createFenceIcon(fence, hasRecentAttack),
            opacity: isDestroyed ? 0.5 : 1.0,
            zIndexOffset: hasRecentAttack ? 1000 : 0
        }).addTo(map);
        
        const popupContent = createFencePopup(fence);
        const popupOffset = getPopupOffsetForPoint(coords[0], coords[1]);
        
        marker.bindPopup(popupContent, {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [60, 60],
            autoPanPaddingBottomRight: [60, 60],
            maxWidth: 300,
            offset: popupOffset
        });
        
        fenceMarkers[fenceId] = marker;
    });
    
    console.log(`Fences atualizados: ${data.fences.length} fences`);
}

/**
 * Criar popup de fence
 */
function createFencePopup(fence) {
    const structureType = fence.structure_type || 'fence';
    if (structureType === 'watchtower') {
        const details = fence.watchtower_details || {};
        const formatStatus = (value) => {
            if (value === null || value === undefined) return 'Desconhecido';
            return value ? 'Construído' : 'Não construído';
        };
        const orientation = fence.orientation || {};
        const orientationText = (orientation.x !== undefined && orientation.y !== undefined)
            ? `Pitch: ${orientation.x?.toFixed ? orientation.x.toFixed(1) : orientation.x || 0}°, Yaw: ${orientation.y?.toFixed ? orientation.y.toFixed(1) : orientation.y || 0}°`
            : 'Desconhecido';

        return `
            <div class="player-popup">
                <strong><i class="fas fa-chess-rook me-2"></i>Watchtower (${fence.fence_name})</strong>
                <div class="info-row">
                    <span class="info-label">ID:</span>
                    <span class="info-value">${fence.fence_id}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Coords:</span>
                    <span class="info-value">X: ${fence.coord_x.toFixed(2)}, Y: ${fence.coord_y.toFixed(2)} (altura: ${fence.coord_z ? fence.coord_z.toFixed(2) : 'N/A'})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Orientação:</span>
                    <span class="info-value">${orientationText}</span>
                </div>
                <div class="info-row mt-2">
                    <span class="info-label">Base:</span>
                    <span class="info-value">${formatStatus(details.has_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nível 1:</span>
                    <span class="info-value">${formatStatus(details.level_1_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nível 2:</span>
                    <span class="info-value">${formatStatus(details.level_2_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Nível 3:</span>
                    <span class="info-value">${formatStatus(details.level_3_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Escadas Nível 1:</span>
                    <span class="info-value">${formatStatus(details.level_1_stairs)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Escadas Nível 2:</span>
                    <span class="info-value">${formatStatus(details.level_2_stairs)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Telhado:</span>
                    <span class="info-value">${formatStatus(details.has_roof)}</span>
                </div>
                <div class="info-row mt-2">
                    <span class="info-label">Atualizado:</span>
                    <span class="info-value">${fence.last_update || 'Desconhecido'}</span>
                </div>
                <div class="info-row mt-2">
                    <button type="button" class="btn btn-sm btn-warning" onclick="loadWatchtowerHistory('${fence.fence_id}')">
                        <i class="fas fa-history me-1"></i>Histórico de Alterações
                    </button>
                </div>
            </div>
        `;
    }

    const features = [];
    if (fence.fence_name.includes('Gate')) {
        features.push('Portão');
    }
    if (fence.fence_name.includes('Open')) {
        features.push('Aberto');
    }
    if (fence.fence_name.includes('Locked')) {
        features.push('Trancado');
    }
    
    const featuresText = features.length > 0 ? features.join(', ') : 'Nenhuma característica especial';
    const formatFenceStatus = (value) => {
        if (value === null || value === undefined) {
            return 'Desconhecido';
        }
        return value ? 'Sim' : 'Não';
    };
    const hasConstructionData =
        fence.has_base !== null && fence.has_base !== undefined ||
        fence.lower_panel_built !== null && fence.lower_panel_built !== undefined ||
        fence.upper_panel_built !== null && fence.upper_panel_built !== undefined;

    let constructionDetails = '';
    if (hasConstructionData) {
        constructionDetails = `
            <div class="info-row mt-2">
                <span class="info-label">Base:</span>
                <span class="info-value">${formatFenceStatus(fence.has_base)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Painel Inferior:</span>
                <span class="info-value">${formatFenceStatus(fence.lower_panel_built)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Painel Superior:</span>
                <span class="info-value">${formatFenceStatus(fence.upper_panel_built)}</span>
            </div>
        `;
    }
    
    const isDestroyed = fence.is_destroyed || false;
    const destroyedInfo = isDestroyed ? `
        <div class="info-row">
            <span class="info-label"><i class="fas fa-exclamation-triangle text-warning me-1"></i>Status:</span>
            <span class="info-value text-warning">Destruído</span>
        </div>
        <div class="info-row">
            <span class="info-label">Destruído em:</span>
            <span class="info-value">${fence.destroyed_at || 'Desconhecido'}</span>
        </div>
    ` : '';
    
    const hasRecentAttack = fence.has_recent_attack || false;
    const attackWarning = hasRecentAttack ? `
        <div class="alert alert-danger mt-2 mb-2" style="padding: 8px; font-size: 12px;">
            <i class="fas fa-exclamation-triangle me-1"></i><strong>⚠️ Possível Ataque Detectado</strong><br>
            <small>Um painel foi perdido recentemente. Verifique o histórico para mais detalhes.</small>
        </div>
    ` : '';
    
    return `
        <div class="player-popup">
            <strong><i class="fas fa-home me-2"></i>Construção (${fence.fence_name})</strong>
            <div class="info-row">
                <span class="info-label">ID:</span>
                <span class="info-value">${fence.fence_id}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Coords:</span>
                <span class="info-value">X: ${fence.coord_x.toFixed(2)}, Y: ${fence.coord_y.toFixed(2)} (altura: ${fence.coord_z ? fence.coord_z.toFixed(2) : 'N/A'})</span>
            </div>
            <div class="info-row">
                <span class="info-label">Características:</span>
                <span class="info-value">${featuresText}</span>
            </div>
            <div class="info-row mt-2">
                <span class="info-label">Atualizado:</span>
                <span class="info-value">${fence.last_update || 'Desconhecido'}</span>
            </div>
            ${constructionDetails}
            ${destroyedInfo}
            ${attackWarning}
            <div class="info-row mt-2">
                <button type="button" class="btn btn-sm btn-warning" onclick="toggleFenceTrail('${fence.fence_id}')">
                    <i class="fas fa-history me-1"></i>Histórico de Alterações
                </button>
            </div>
        </div>
    `;
}

/**
 * Toggle mostrar fences
 */
function toggleFencesDisplay() {
    showFences = !showFences;
    
    if (showFences) {
        $('#toggleFencesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Construções');
        loadFences();
    } else {
        $('#toggleFencesBtn').html('<i class="fas fa-home me-1"></i>Mostrar Construções');
        // Remover todos os fences
        Object.keys(fenceMarkers).forEach(function(key) {
            map.removeLayer(fenceMarkers[key]);
        });
        fenceMarkers = {};
        
        // Limpar trails de fences
        Object.keys(fenceTrails).forEach(function(key) {
            const trail = fenceTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => map.removeLayer(item));
            } else {
                map.removeLayer(trail);
            }
        });
        fenceTrails = {};
        
        // Resetar contador de fences
        $('#fenceCount').text('0');
    }
}

/**
 * Mostrar loading
 */
function showLoading() {
    $('#map').append('<div class="loading-overlay"><i class="fas fa-spinner fa-spin loading-spinner"></i></div>');
}

/**
 * Esconder loading
 */
function hideLoading() {
    $('.loading-overlay').remove();
}

// Limpar intervalos ao sair da página
$(window).on('beforeunload', function() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});

/**
 * Carregar eventos de kill
 */
function loadKills() {
    $.get('/api/events/kills', { limit: 50 })
        .done(function(data) {
            updateKills(data);
        })
        .fail(function() {
            console.error('Erro ao carregar kills');
        });
}

/**
 * Atualizar kills no mapa
 */
function updateKills(data) {
    // Limpar kills antigos
    killMarkers.forEach(item => {
        if (item.killerMarker) map.removeLayer(item.killerMarker);
        if (item.victimMarker) map.removeLayer(item.victimMarker);
        if (item.line) map.removeLayer(item.line);
    });
    killMarkers = [];
    
    if (!showKills) {
        return;
    }
    
    // Adicionar kills
    data.events.forEach(function(event) {
        // Verificar se posições são válidas
        const killerPos = event.killer_pos;
        const victimPos = event.victim_pos;
        
        // Se ambas as posições são null, pular evento
        if (!killerPos && !victimPos) {
            return;
        }
        
        let killerMarker = null;
        let victimMarker = null;
        let line = null;
        
        // Criar marcador do killer (se disponível)
        if (killerPos && killerPos.pixel_coords) {
            const killerCoords = convertToMapCoords(killerPos.pixel_coords);
            
            if (killerCoords) {
                const killerLat = killerCoords[0];
                const killerLng = killerCoords[1];
                
                // Criar marcador do killer com ícone azul e fa-user
                killerMarker = L.marker(killerCoords, {
                    icon: createKillerIcon(),
                    opacity: 1.0
                }).addTo(map);
                
                // Formatar conteúdo do tooltip do killer
                const killerTooltipContent = `
                    <strong>🔪 Killer</strong><br>
                    <strong>👤 Nome:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                    <strong>💀 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${killerPos.x.toFixed(1)}, Y=${killerPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const killerTooltipDirection = getTooltipDirectionForPoint(killerLat, killerLng);
                
                // Adicionar tooltip hover
                killerMarker.bindTooltip(killerTooltipContent, {
                    permanent: false,
                    direction: killerTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição do killer
                killerMarker.on('click', function() {
                    showKillMarkerActions(event, 'killer');
                });
                
                console.log(`Killer marker criado na posição [${killerLat}, ${killerLng}]`);
            }
        }
        
        // Criar marcador da vítima (se disponível)
        if (victimPos && victimPos.pixel_coords) {
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (victimCoords) {
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Criar marcador da vítima com ícone vermelho e fa-skull-crossbones
                victimMarker = L.marker(victimCoords, {
                    icon: createVictimIcon(),
                    opacity: 1.0
                }).addTo(map);
                
                // Formatar conteúdo do tooltip da vítima
                let victimTooltipContent = `
                    <strong>💀 Vítima</strong><br>
                    <strong>👤 Nome:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔪 Killer:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                `;
                
                // Adicionar aviso se killer não tiver posição
                if (!killerPos || !killerPos.pixel_coords) {
                    victimTooltipContent += `<span style="color: #ffc107; font-weight: bold;">⚠️ Posição do killer não disponível</span><br>`;
                }
                
                victimTooltipContent += `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${victimPos.x.toFixed(1)}, Y=${victimPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const victimTooltipDirection = getTooltipDirectionForPoint(victimLat, victimLng);
                
                // Adicionar tooltip hover
                victimMarker.bindTooltip(victimTooltipContent, {
                    permanent: false,
                    direction: victimTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição da vítima
                victimMarker.on('click', function() {
                    showKillMarkerActions(event, 'victim');
                });
                
                console.log(`Victim marker criado na posição [${victimLat}, ${victimLng}]`);
            }
        }
        
        // Criar linha conectando killer e victim (apenas se ambas posições são válidas)
        if (killerPos && killerPos.pixel_coords && victimPos && victimPos.pixel_coords) {
            const killerCoords = convertToMapCoords(killerPos.pixel_coords);
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (killerCoords && victimCoords) {
                const killerLat = killerCoords[0];
                const killerLng = killerCoords[1];
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Debug: verificar coordenadas da linha
                console.log(`Kill line - Killer: [${killerLat}, ${killerLng}], Victim: [${victimLat}, ${victimLng}]`);
                
                line = L.polyline([
                    killerCoords,
                    victimCoords
                ], {
                    color: '#dc3545',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10',
                    interactive: true  // Tornar linha clicável
                }).addTo(map);
                
                // Adicionar tooltip à linha
                const lineTooltip = `
                    <strong>💀 Kill Event</strong><br>
                    <strong>🔪 Killer:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                    <strong>💀 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar ao Killer</span>
                `;
                
                // Direção dinâmica para tooltip da linha
                const lineMidLat = (killerLat + victimLat) / 2;
                const lineMidLng = (killerLng + victimLng) / 2;
                const lineTooltipDirection = getTooltipDirectionForPoint(lineMidLat, lineMidLng);
                
                line.bindTooltip(lineTooltip, {
                    permanent: false,
                    direction: lineTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique na linha abre modal de teleporte para posição do killer
                line.on('click', function() {
                    showKillMarkerActions(event, 'killer');
                });
            }
        }
        
        // Adicionar ao array apenas se tiver pelo menos um marcador ou linha
        if (killerMarker || victimMarker || line) {
            killMarkers.push({ 
                killerMarker: killerMarker, 
                victimMarker: victimMarker, 
                line: line 
            });
        }
    });
    
    console.log(`Kills carregados: ${data.events.length}`);
}

/**
 * Toggle mostrar kills
 */
function toggleKills() {
    showKills = !showKills;
    
    if (showKills) {
        $('#toggleKillsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Kills');
        loadKills();
    } else {
        $('#toggleKillsBtn').html('<i class="fas fa-skull-crossbones me-1"></i>Mostrar Kills');
        killMarkers.forEach(item => {
            if (item.killerMarker) map.removeLayer(item.killerMarker);
            if (item.victimMarker) map.removeLayer(item.victimMarker);
            if (item.line) map.removeLayer(item.line);
        });
        killMarkers = [];
    }
}

/**
 * Carregar eventos de danos
 */
function loadDamages() {
    $.get('/api/events/damages', { limit: 50 })
        .done(function(data) {
            updateDamages(data);
        })
        .fail(function() {
            console.error('Erro ao carregar damages');
        });
}

/**
 * Atualizar damages no mapa
 */
function updateDamages(data) {
    // Limpar damages antigos
    damageMarkers.forEach(item => {
        if (item.attackerMarker) map.removeLayer(item.attackerMarker);
        if (item.victimMarker) map.removeLayer(item.victimMarker);
        if (item.line) map.removeLayer(item.line);
    });
    damageMarkers = [];
    
    if (!showDamages) {
        return;
    }
    
    // Adicionar damages
    data.events.forEach(function(event) {
        // Verificar se posições são válidas
        const attackerPos = event.attacker_pos;
        const victimPos = event.victim_pos;
        
        // Se ambas as posições são null, pular evento
        if (!attackerPos && !victimPos) {
            return;
        }
        
        let attackerMarker = null;
        let victimMarker = null;
        let line = null;
        
        // Criar marcador do atacante (se disponível)
        if (attackerPos && attackerPos.pixel_coords) {
            const attackerCoords = convertToMapCoords(attackerPos.pixel_coords);
            
            if (attackerCoords) {
                const attackerLat = attackerCoords[0];
                const attackerLng = attackerCoords[1];
                
                // Criar marcador do atacante com ícone laranja
                attackerMarker = L.marker(attackerCoords, {
                    icon: createDamageAttackerIcon(),
                    opacity: 1.0
                }).addTo(map);
                
                // Formatar conteúdo do tooltip do atacante
                let attackerTooltipContent = `
                    <strong>⚔️ Atacante</strong><br>
                    <strong>👤 Nome:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                    <strong>🎯 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                `;
                
                if (event.local_damage) {
                    attackerTooltipContent += `<strong>🩸 Local do Dano:</strong> <span class="value">${event.local_damage}</span><br>`;
                }
                if (event.hit_type) {
                    attackerTooltipContent += `<strong>🎯 Tipo de Hit:</strong> <span class="value">${event.hit_type}</span><br>`;
                }
                if (event.damage) {
                    attackerTooltipContent += `<strong>💥 Dano:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.health !== null && event.health !== undefined) {
                    attackerTooltipContent += `<strong>❤️ Vida Restante:</strong> <span class="value">${event.health.toFixed(1)}</span><br>`;
                }
                
                attackerTooltipContent += `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${attackerPos.x.toFixed(1)}, Y=${attackerPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const attackerTooltipDirection = getTooltipDirectionForPoint(attackerLat, attackerLng);
                
                // Adicionar tooltip hover
                attackerMarker.bindTooltip(attackerTooltipContent, {
                    permanent: false,
                    direction: attackerTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição do atacante
                attackerMarker.on('click', function() {
                    showDamageMarkerActions(event, 'attacker');
                });
                
                console.log(`Attacker marker criado na posição [${attackerLat}, ${attackerLng}]`);
            }
        }
        
        // Criar marcador da vítima (se disponível)
        if (victimPos && victimPos.pixel_coords) {
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (victimCoords) {
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Criar marcador da vítima com ícone amarelo
                victimMarker = L.marker(victimCoords, {
                    icon: createDamageVictimIcon(),
                    opacity: 1.0
                }).addTo(map);
                
                // Formatar conteúdo do tooltip da vítima
                let victimTooltipContent = `
                    <strong>🩸 Vítima</strong><br>
                    <strong>👤 Nome:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>⚔️ Atacante:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                `;
                
                // Adicionar aviso se atacante não tiver posição
                if (!attackerPos || !attackerPos.pixel_coords) {
                    victimTooltipContent += `<span style="color: #ffc107; font-weight: bold;">⚠️ Posição do atacante não disponível</span><br>`;
                }
                
                if (event.local_damage) {
                    victimTooltipContent += `<strong>🩸 Local do Dano:</strong> <span class="value">${event.local_damage}</span><br>`;
                }
                if (event.hit_type) {
                    victimTooltipContent += `<strong>🎯 Tipo de Hit:</strong> <span class="value">${event.hit_type}</span><br>`;
                }
                if (event.damage) {
                    victimTooltipContent += `<strong>💥 Dano Recebido:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.health !== null && event.health !== undefined) {
                    victimTooltipContent += `<strong>❤️ Vida Restante:</strong> <span class="value">${event.health.toFixed(1)}</span><br>`;
                }
                
                victimTooltipContent = victimTooltipContent + `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${victimPos.x.toFixed(1)}, Y=${victimPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const victimTooltipDirection = getTooltipDirectionForPoint(victimLat, victimLng);
                
                // Adicionar tooltip hover
                victimMarker.bindTooltip(victimTooltipContent, {
                    permanent: false,
                    direction: victimTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição da vítima
                victimMarker.on('click', function() {
                    showDamageMarkerActions(event, 'victim');
                });
                
                console.log(`Victim marker criado na posição [${victimLat}, ${victimLng}]`);
            }
        }
        
        // Criar linha conectando atacante e vítima (apenas se ambas posições são válidas)
        if (attackerPos && attackerPos.pixel_coords && victimPos && victimPos.pixel_coords) {
            const attackerCoords = convertToMapCoords(attackerPos.pixel_coords);
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (attackerCoords && victimCoords) {
                const attackerLat = attackerCoords[0];
                const attackerLng = attackerCoords[1];
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Debug: verificar coordenadas da linha
                console.log(`Damage line - Attacker: [${attackerLat}, ${attackerLng}], Victim: [${victimLat}, ${victimLng}]`);
                
                line = L.polyline([
                    attackerCoords,
                    victimCoords
                ], {
                    color: '#ff9800',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10',
                    interactive: true  // Tornar linha clicável
                }).addTo(map);
                
                // Adicionar tooltip à linha
                let lineTooltip = `
                    <strong>🩸 Damage Event</strong><br>
                    <strong>⚔️ Atacante:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                    <strong>🎯 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                `;
                
                if (event.damage) {
                    lineTooltip += `<strong>💥 Dano:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.weapon) {
                    lineTooltip += `<strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>`;
                }
                if (event.distance) {
                    lineTooltip += `<strong>📏 Distância:</strong> <span class="value">${event.distance.toFixed(0)}m</span><br>`;
                }
                
                lineTooltip += `<span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar ao Atacante</span>`;
                
                // Direção dinâmica para tooltip da linha
                const lineMidLat = (attackerLat + victimLat) / 2;
                const lineMidLng = (attackerLng + victimLng) / 2;
                const lineTooltipDirection = getTooltipDirectionForPoint(lineMidLat, lineMidLng);
                
                line.bindTooltip(lineTooltip, {
                    permanent: false,
                    direction: lineTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique na linha abre modal de teleporte para posição do atacante
                line.on('click', function() {
                    showDamageMarkerActions(event, 'attacker');
                });
            }
        }
        
        // Adicionar ao array apenas se tiver pelo menos um marcador ou linha
        if (attackerMarker || victimMarker || line) {
            damageMarkers.push({ 
                attackerMarker: attackerMarker, 
                victimMarker: victimMarker, 
                line: line 
            });
        }
    });
    
    console.log(`Damages carregados: ${data.events.length}`);
}

/**
 * Toggle mostrar damages
 */
function toggleDamages() {
    showDamages = !showDamages;
    
    if (showDamages) {
        $('#toggleDamagesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Damages');
        loadDamages();
    } else {
        $('#toggleDamagesBtn').html('<i class="fas fa-heart-broken me-1"></i>Mostrar Damages');
        damageMarkers.forEach(item => {
            if (item.attackerMarker) map.removeLayer(item.attackerMarker);
            if (item.victimMarker) map.removeLayer(item.victimMarker);
            if (item.line) map.removeLayer(item.line);
        });
        damageMarkers = [];
    }
}

/**
 * Mostrar ações para marcador de damage (teleporte)
 */
function showDamageMarkerActions(damageEvent, positionType) {
    // positionType: 'victim' ou 'attacker'
    const isVictim = positionType === 'victim';
    
    let playerName, coordX, coordY, coordZ, posData;
    
    if (isVictim) {
        playerName = damageEvent.victim_name || 'Desconhecido';
        posData = damageEvent.victim_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    } else {
        playerName = damageEvent.attacker_name || 'Desconhecido';
        posData = damageEvent.attacker_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    }
    
    // Se não tiver posição válida, não abrir modal
    if (!coordX || !coordY) {
        alert('Posição não disponível para teleporte');
        return;
    }
    
    // Verificar se está no modo de teleporte
    if (currentMode !== 'teleport') {
        // Mudar para modo de teleporte
        setMode('teleport');
    }
    
    // Preencher campos do formulário de teleporte
    $('#teleportX').val(coordX.toFixed(2));
    $('#teleportY').val(coordY.toFixed(2));
    $('#teleportZ').val(coordZ ? coordZ.toFixed(2) : '0');
    $('#teleportPlayerId').val('');
    
    // Mostrar informações do jogador no modal
    $('#teleportInfo').html(`
        <div class="alert alert-info">
            <strong>🩸 Evento de Dano</strong><br>
            <strong>Jogador:</strong> ${playerName}<br>
            <strong>Tipo:</strong> ${isVictim ? 'Vítima' : 'Atacante'}<br>
            <strong>Arma:</strong> ${damageEvent.weapon || 'Desconhecido'}<br>
            <strong>Dano:</strong> ${damageEvent.damage ? damageEvent.damage.toFixed(1) : 'N/A'}
        </div>
    `);
    
    // Abrir modal de teleporte
    $('#teleportModal').modal('show');
}

/**
 * Mostrar modal de restauração de backup
 */
function showRestoreBackupModal(playerId, point, pointNumber) {
    // Buscar nome do jogador dos dados armazenados
    const playerData = playersData[playerId];
    const playerName = playerData ? playerData.name : 'Desconhecido';
    
    // Preencher informações no modal
    $('#backupPlayerName').text(playerName);
    $('#backupPointNumber').text(pointNumber);
    $('#backupPointDate').text(point.timestamp);
    $('#backupCoords').text(`X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}, Z=${point.coord_z ? point.coord_z.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados para restauração
    $('#confirmRestoreBtn').data('playerId', playerId);
    $('#confirmRestoreBtn').data('playerCoordId', point.player_coord_id);
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('restoreBackupModal'));
    modal.show();
}

/**
 * Executar restauração de backup
 */
function executeRestoreBackup() {
    const playerId = $('#confirmRestoreBtn').data('playerId');
    const playerCoordId = $('#confirmRestoreBtn').data('playerCoordId');
    
    if (!playerId || !playerCoordId) {
        showToast('Erro', 'Dados inválidos para restauração', 'error');
        return;
    }
    
    // Verificar se jogador está online
    const playerData = playersData[playerId];
    if (playerData && playerData.isOnline) {
        showToast('Erro', 'Não é possível restaurar backup de jogador online. Aguarde o jogador desconectar.', 'error');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    $('#confirmRestoreBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Restaurando...');
    
    $.ajax({
        url: `/api/players/${playerId}/restore-backup`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_coord_id: playerCoordId
        }),
        success: function(response) {
            // Fechar modal
            bootstrap.Modal.getInstance(document.getElementById('restoreBackupModal')).hide();
            
            // Mostrar mensagem de sucesso
            showToast('Sucesso', response.message, 'success');
            
            // Recarregar posições
            loadPositions();
        },
        error: function(xhr) {
            console.error('Erro ao restaurar backup:', xhr);
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro desconhecido ao restaurar backup';
            
            // Log detalhado para debug
            if (error.stdout) console.log('Script stdout:', error.stdout);
            if (error.error) console.error('Script stderr:', error.error);
            
            showToast('Erro', errorMsg, 'error');
        },
        complete: function() {
            // Reabilitar botão
            $('#confirmRestoreBtn').prop('disabled', false).html('<i class="fas fa-undo me-1"></i>Restaurar Backup');
        }
    });
}

/**
 * Mostrar menu de ações do ponto
 */
function showPointActionsMenu(playerId, point, pointNumber) {
    // Armazenar contexto
    currentPointContext = {
        playerId: playerId,
        point: point,
        pointNumber: pointNumber,
        hasBackup: point.has_backup
    };
    
    // Mostrar modal de ações
    const modal = new bootstrap.Modal(document.getElementById('pointActionsModal'));
    modal.show();
    
    // Desabilitar botão de backup se não houver backup
    if (!point.has_backup) {
        $('#restoreBackupActionBtn').prop('disabled', true);
    } else {
        $('#restoreBackupActionBtn').prop('disabled', false);
    }
}

/**
 * Mostrar modal de ações do jogador
 * Aceita tanto dados de marcador principal quanto de pontos do trail
 */
function showPlayerMarkerActions(targetPlayer, targetPlayerId) {
    // Determinar se é marcador principal ou ponto do trail
    let playerName, coordX, coordY, coordZ, isOnline;
    
    if (targetPlayer.player_name !== undefined) {
        // Dados do marcador principal (player object completo)
        playerName = targetPlayer.player_name;
        coordX = targetPlayer.coord_x;
        coordY = targetPlayer.coord_y;
        coordZ = targetPlayer.coord_z;
        isOnline = targetPlayer.is_online || false;
    } else {
        // Dados do ponto do trail (currentPointContext)
        const playerData = playersData[targetPlayerId];
        playerName = playerData ? playerData.name : 'Desconhecido';
        coordX = targetPlayer.coord_x;
        coordY = targetPlayer.coord_y;
        coordZ = targetPlayer.coord_z;
        isOnline = playerData ? playerData.isOnline : false;
    }
    
    // Armazenar contexto do jogador
    currentPlayerContext = {
        playerId: targetPlayerId,
        playerName: playerName,
        coordX: coordX,
        coordY: coordY,
        coordZ: coordZ,
        isOnline: isOnline
    };
    
    // Mostrar modal de ações
    const modal = new bootstrap.Modal(document.getElementById('playerMarkerActionsModal'));
    modal.show();
    
    // Habilitar/desabilitar botão de inventário baseado em status online
    if (isOnline) {
        $('#checkInventoryActionBtn').prop('disabled', false);
    } else {
        $('#checkInventoryActionBtn').prop('disabled', true);
    }
}

/**
 * Mostrar modal de teleporte de jogador para posição de outro jogador
 * Função auxiliar chamada pelo modal de ações
 */
function showTeleportToPlayerModal() {
    if (!currentPlayerContext) {
        return;
    }
    
    const playerName = currentPlayerContext.playerName;
    const coordX = currentPlayerContext.coordX;
    const coordY = currentPlayerContext.coordY;
    const coordZ = currentPlayerContext.coordZ;
    
    // Preencher informações do jogador/ponto de destino
    $('#teleportToTargetPlayerName').text(playerName);
    $('#teleportToTargetCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}, Z=${coordZ ? coordZ.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados para teleporte
    $('#confirmTeleportToPlayerBtn').data('coordX', coordX);
    $('#confirmTeleportToPlayerBtn').data('coordY', coordY);
    $('#confirmTeleportToPlayerBtn').data('coordZ', coordZ);
    
    // Limpar e popular dropdown com jogadores online
    const dropdown = $('#teleportToPlayerDropdown');
    dropdown.html('<option value="">Carregando jogadores...</option>');
    
    // Buscar jogadores online
    $.get('/api/players/online/positions')
        .done(function(data) {
            dropdown.html('<option value="">Selecione um jogador</option>');
            
            data.players.forEach(function(player) {
                const option = $('<option></option>');
                option.val(player.player_id);
                option.text(`${player.player_name}${player.steam_name ? ' (' + player.steam_name + ')' : ''}`);
                dropdown.append(option);
            });
        })
        .fail(function() {
            dropdown.html('<option value="">Erro ao carregar jogadores</option>');
        });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('teleportToPlayerModal'));
    modal.show();
}

/**
 * Mostrar modal de teleporte para posição de kill (vítima ou killer)
 */
function showKillMarkerActions(killEvent, positionType) {
    // positionType: 'victim' ou 'killer'
    const isVictim = positionType === 'victim';
    
    let playerName, coordX, coordY, coordZ, posData;
    
    if (isVictim) {
        playerName = killEvent.victim_name || 'Desconhecido';
        posData = killEvent.victim_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    } else {
        playerName = killEvent.killer_name || 'Desconhecido';
        posData = killEvent.killer_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    }
    
    // Se não tiver posição válida, não abrir modal
    if (!posData || coordX === null || coordY === null) {
        showToast('Erro', 'Posição não disponível para este kill', 'error');
        return;
    }
    
    // Preencher informações do kill/de destino
    const positionLabel = isVictim ? 'Vítima' : 'Killer';
    $('#teleportToTargetPlayerName').text(`Kill Event - ${positionLabel}: ${playerName}`);
    $('#teleportToTargetCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}, Z=${coordZ ? coordZ.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados para teleporte
    $('#confirmTeleportToPlayerBtn').data('coordX', coordX);
    $('#confirmTeleportToPlayerBtn').data('coordY', coordY);
    $('#confirmTeleportToPlayerBtn').data('coordZ', coordZ);
    
    // Limpar e popular dropdown com jogadores online
    const dropdown = $('#teleportToPlayerDropdown');
    dropdown.html('<option value="">Carregando jogadores...</option>');
    
    // Buscar jogadores online
    $.get('/api/players/online/positions')
        .done(function(data) {
            dropdown.html('<option value="">Selecione um jogador</option>');
            
            data.players.forEach(function(player) {
                const option = $('<option></option>');
                option.val(player.player_id);
                option.text(`${player.player_name}${player.steam_name ? ' (' + player.steam_name + ')' : ''}`);
                dropdown.append(option);
            });
        })
        .fail(function() {
            dropdown.html('<option value="">Erro ao carregar jogadores</option>');
        });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('teleportToPlayerModal'));
    modal.show();
}

/**
 * Executar teleporte de jogador para posição
 */
function executeTeleportToPlayer() {
    const selectedPlayerId = $('#teleportToPlayerDropdown').val();
    const coordX = $('#confirmTeleportToPlayerBtn').data('coordX');
    const coordY = $('#confirmTeleportToPlayerBtn').data('coordY');
    const coordZ = $('#confirmTeleportToPlayerBtn').data('coordZ');
    
    if (!selectedPlayerId || selectedPlayerId === '') {
        showToast('Aviso', 'Selecione um jogador para teleportar', 'warning');
        return;
    }
    
    if (coordX === undefined || coordY === undefined) {
        showToast('Erro', 'Dados inválidos para teleporte', 'error');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    $('#confirmTeleportToPlayerBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Teleportando...');
    
    $.ajax({
        url: `/api/players/${selectedPlayerId}/teleport`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            coord_x: coordX,
            coord_y: coordY,
            coord_z: coordZ || 0
        }),
        success: function(response) {
            bootstrap.Modal.getInstance(document.getElementById('teleportToPlayerModal')).hide();
            showToast('Sucesso', response.message, 'success');
            loadPositions();
        },
        error: function(xhr) {
            console.error('Erro ao teleportar:', xhr);
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro desconhecido ao teleportar';
            showToast('Erro', errorMsg, 'error');
        },
        complete: function() {
            $('#confirmTeleportToPlayerBtn').prop('disabled', false).html('<i class="fas fa-map-marker-alt me-1"></i>Teleportar');
        }
    });
}

/**
 * Mostrar modal de clonagem de personagem
 */
function showCloneCharacterModal(playerId, point, pointNumber) {
    const playerData = playersData[playerId];
    const playerName = playerData ? playerData.name : 'Desconhecido';
    
    // Preencher informações
    $('#cloneSourcePlayerName').text(playerName);
    $('#clonePointNumber').text(pointNumber);
    $('#clonePointDate').text(point.timestamp);
    $('#cloneCoords').text(`X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}, Z=${point.coord_z ? point.coord_z.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados
    $('#confirmCloneCharacterBtn').data('sourcePlayerId', playerId);
    $('#confirmCloneCharacterBtn').data('playerCoordId', point.player_coord_id);
    
    // Limpar e popular dropdown
    const dropdown = $('#cloneCharacterDropdown');
    dropdown.html('<option value="">Carregando jogadores...</option>');
    
    // Buscar TODOS os jogadores para filtrar apenas offline
    $.get('/api/players/positions')
        .done(function(data) {
            const offlineCount = data.players.filter(p => !p.is_online).length;
            
            if (offlineCount === 0) {
                dropdown.html('<option value="">Nenhum jogador offline disponível</option>');
                $('#confirmCloneCharacterBtn').prop('disabled', true);
            } else {
                dropdown.html('<option value="">Selecione um jogador</option>');
                $('#confirmCloneCharacterBtn').prop('disabled', false);
                
                // Adicionar apenas jogadores offline E diferentes do jogador de origem
                data.players.forEach(function(player) {
                    if (!player.is_online && player.player_id !== playerId) {
                        const option = $('<option></option>');
                        option.val(player.player_id);
                        option.text(`${player.player_name}${player.steam_name ? ' (' + player.steam_name + ')' : ''}`);
                        dropdown.append(option);
                    }
                });
            }
        })
        .fail(function() {
            dropdown.html('<option value="">Erro ao carregar jogadores</option>');
        });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('cloneCharacterModal'));
    modal.show();
}

/**
 * Executar clonagem de personagem
 */
function executeCloneCharacter() {
    const targetPlayerId = $('#cloneCharacterDropdown').val();
    const sourcePlayerId = $('#confirmCloneCharacterBtn').data('sourcePlayerId');
    const playerCoordId = $('#confirmCloneCharacterBtn').data('playerCoordId');
    
    if (!targetPlayerId || targetPlayerId === '') {
        showToast('Aviso', 'Selecione um jogador de destino', 'warning');
        return;
    }
    
    if (!playerCoordId) {
        showToast('Erro', 'Dados inválidos para clonagem', 'error');
        return;
    }
    
    // Validação adicional via API antes de clonar (caso status tenha mudado)
    $('#confirmCloneCharacterBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Verificando...');
    
    $.get('/api/players/online/positions')
        .done(function(data) {
            const onlineIds = data.players.map(p => p.player_id);
            if (onlineIds.includes(targetPlayerId)) {
                showToast('Erro', 'Jogador de destino está online. Aguarde desconectar.', 'error');
                $('#confirmCloneCharacterBtn').prop('disabled', false).html('<i class="fas fa-clone me-1"></i>Clonar');
                return;
            }
            
            // Se passou pela validação, continuar com clonagem
            proceedWithClone(targetPlayerId, playerCoordId);
        })
        .fail(function() {
            showToast('Erro', 'Não foi possível verificar status do jogador', 'error');
            $('#confirmCloneCharacterBtn').prop('disabled', false).html('<i class="fas fa-clone me-1"></i>Clonar');
        });
}

/**
 * Proceder com clonagem após validação
 */
function proceedWithClone(targetPlayerId, playerCoordId) {
    // Desabilitar botão e mostrar loading
    $('#confirmCloneCharacterBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Clonando...');
    
    // Chamar API de restore-backup para o jogador de destino
    $.ajax({
        url: `/api/players/${targetPlayerId}/restore-backup`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_coord_id: playerCoordId
        }),
        success: function(response) {
            bootstrap.Modal.getInstance(document.getElementById('cloneCharacterModal')).hide();
            showToast('Sucesso', response.message, 'success');
            loadPositions();
        },
        error: function(xhr) {
            console.error('Erro ao clonar:', xhr);
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro desconhecido ao clonar';
            showToast('Erro', errorMsg, 'error');
        },
        complete: function() {
            $('#confirmCloneCharacterBtn').prop('disabled', false).html('<i class="fas fa-clone me-1"></i>Clonar');
        }
    });
}

/**
 * Gerar ID único para request
 */
function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Verificar inventário de um jogador
 */
function checkPlayerInventory(playerId, playerName) {
    if (!currentPlayerContext || !currentPlayerContext.isOnline) {
        showToast('Aviso', 'Jogador precisa estar online para verificar inventário', 'warning');
        return;
    }
    
    // Gerar request_id único
    const requestId = generateRequestId();
    
    // Fechar modal de ações
    bootstrap.Modal.getInstance(document.getElementById('playerMarkerActionsModal')).hide();
    
    // Mostrar loading no modal de inventário
    const modalBody = $('#playerInventoryModalBody');
    modalBody.html(`
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <p class="mt-3">Verificando inventário de <strong>${playerName}</strong>...</p>
        </div>
    `);
    
    // Abrir modal de inventário
    const modal = new bootstrap.Modal(document.getElementById('playerInventoryModal'));
    modal.show();
    
    // Desabilitar botão durante processamento
    $('#checkInventoryActionBtn').prop('disabled', true);
    
    // Chamar endpoint para enviar comando
    $.ajax({
        url: `/api/players/${playerId}/check-inventory`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            request_id: requestId
        }),
        success: function(response) {
            // Iniciar polling para obter resultado
            startInventoryPolling(requestId, playerId, playerName, 0);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao iniciar verificação de inventário';
            modalBody.html(`
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>${errorMsg}
                </div>
            `);
            $('#checkInventoryActionBtn').prop('disabled', false);
        }
    });
}

/**
 * Fazer polling para obter resultado do inventário
 */
function startInventoryPolling(requestId, playerId, playerName, attempt) {
    const MAX_ATTEMPTS = 30; // 30 tentativas
    const POLL_INTERVAL = 2000; // 2 segundos entre tentativas
    
    if (attempt >= MAX_ATTEMPTS) {
        const modalBody = $('#playerInventoryModalBody');
        modalBody.html(`
            <div class="alert alert-warning">
                <i class="fas fa-clock me-2"></i>Tempo limite excedido. O servidor pode estar processando o comando.
            </div>
        `);
        $('#checkInventoryActionBtn').prop('disabled', false);
        return;
    }
    
    // Atualizar mensagem de loading com tentativa atual
    if (attempt > 0 && attempt % 5 === 0) {
        const modalBody = $('#playerInventoryModalBody');
        modalBody.html(`
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <p class="mt-3">Verificando inventário de <strong>${playerName}</strong>...</p>
                <p class="text-muted small">Aguardando resposta do servidor (tentativa ${attempt}/${MAX_ATTEMPTS})</p>
            </div>
        `);
    }
    
    // Fazer requisição para obter resultado
    $.get(`/api/commands/results/${requestId}`)
        .done(function(response) {
            if (response.status === 'ready') {
                // Resultado disponível
                displayPlayerInventory(response.data, playerName);
                $('#checkInventoryActionBtn').prop('disabled', false);
            } else if (response.status === 'not_found' || response.status === 'processing') {
                // Resultado não encontrado ainda, continuar polling
                setTimeout(function() {
                    startInventoryPolling(requestId, playerId, playerName, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                // Status desconhecido, continuar tentando
                setTimeout(function() {
                    startInventoryPolling(requestId, playerId, playerName, attempt + 1);
                }, POLL_INTERVAL);
            }
        })
        .fail(function(xhr) {
            // Em caso de erro, continuar tentando por algumas vezes
            if (attempt < 5) {
                setTimeout(function() {
                    startInventoryPolling(requestId, playerId, playerName, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                const modalBody = $('#playerInventoryModalBody');
                modalBody.html(`
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Erro ao buscar resultado do inventário.
                    </div>
                `);
                $('#checkInventoryActionBtn').prop('disabled', false);
            }
        });
}

/**
 * Exibir inventário do jogador no modal
 */
function displayPlayerInventory(inventoryData, playerName) {
    const modalBody = $('#playerInventoryModalBody');
    
    // Lista de itens que usam "quantity" para carga/durabilidade, não para stack
    const itemsWithQuantityAsCharge = [
        'Battery9V',
        'Battery',
        'CarBattery'
    ];
    
    if (!inventoryData || !inventoryData.items || inventoryData.items.length === 0) {
        modalBody.html(`
            <div class="mb-3">
                <strong>Jogador:</strong> ${playerName}<br>
                <strong>ID:</strong> ${inventoryData.player_id || 'N/A'}
            </div>
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>Inventário vazio
            </div>
        `);
        return;
    }
    
    let html = `
        <div class="mb-3">
            <strong>Jogador:</strong> ${playerName}<br>
            <strong>ID:</strong> ${inventoryData.player_id || 'N/A'}
        </div>
        <div class="mb-2"><strong>Itens (${inventoryData.items.length}):</strong></div>
        <div class="mt-2" style="max-height: 500px; overflow-y: auto;">
    `;
    
    inventoryData.items.forEach(function(item) {
        const itemType = item.type || '';
        const itemName = item.name || itemType;
        const itemImg = item.img || '';
        const quantity = item.quantity || 1;
        
        // Verificar se o item usa quantity para carga/durabilidade (não stack)
        const usesQuantityAsCharge = itemsWithQuantityAsCharge.some(function(excludedType) {
            return itemType.includes(excludedType);
        });
        
        // Mostrar badge de quantidade apenas se:
        // - quantity > 1 E
        // - O item NÃO usa quantity para carga/durabilidade
        const shouldShowQuantity = quantity > 1 && !usesQuantityAsCharge;
        
        const imgTag = itemImg ? `<img src="${itemImg}" onerror="this.style.display='none'" style="width: 32px; height: 32px; margin-right: 8px; vertical-align: middle; object-fit: contain;">` : '';
        
        html += `
            <div class="item-display mb-2 p-2 border rounded d-flex align-items-center">
                ${imgTag}
                <div class="flex-grow-1">
                    <span class="fw-bold">${itemName}</span>
                    ${itemType !== itemName ? `<br><small class="text-muted">${itemType}</small>` : ''}
                </div>
                ${shouldShowQuantity ? `<span class="badge bg-secondary ms-2">x${quantity}</span>` : ''}
            </div>
        `;
    });
    
    html += `</div>`;
    
    modalBody.html(html);
}

// Event listeners
$(document).ready(function() {
    // Botão de restaurar backup
    $('#confirmRestoreBtn').on('click', executeRestoreBackup);
    
    // Menu de ações
    $('#restoreBackupActionBtn').on('click', function() {
        if (currentPointContext && currentPointContext.hasBackup) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de restauração
            showRestoreBackupModal(
                currentPointContext.playerId,
                currentPointContext.point,
                currentPointContext.pointNumber
            );
        }
    });
    
    $('#teleportActionBtn').on('click', function() {
        if (currentPointContext) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de teleporte com dropdown de jogadores
            showPlayerMarkerActions(
                currentPointContext.point,
                currentPointContext.playerId
            );
        }
    });
    
    // Botão de clonagem no menu de ações
    $('#cloneCharacterActionBtn').on('click', function() {
        if (currentPointContext) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de clonagem
            showCloneCharacterModal(
                currentPointContext.playerId,
                currentPointContext.point,
                currentPointContext.pointNumber
            );
        }
    });
    
    // Botão de teleporte entre jogadores
    $('#confirmTeleportToPlayerBtn').on('click', executeTeleportToPlayer);
    
    // Botão de confirmação de clonagem
    $('#confirmCloneCharacterBtn').on('click', executeCloneCharacter);
    
    // Botões do modal de ações do jogador
    $('#teleportPlayerActionBtn').on('click', function() {
        if (currentPlayerContext) {
            // Fechar modal de ações
            bootstrap.Modal.getInstance(document.getElementById('playerMarkerActionsModal')).hide();
            
            // Abrir modal de teleporte
            showTeleportToPlayerModal();
        }
    });
    
    $('#checkInventoryActionBtn').on('click', function() {
        if (currentPlayerContext) {
            checkPlayerInventory(
                currentPlayerContext.playerId,
                currentPlayerContext.playerName
            );
        }
    });
});

/**
 * Definir modo de interação do mapa
 */
function setMode(mode) {
    currentMode = mode;
    
    // Atualizar UI dos botões
    $('#btnModeNormal, #btnModeTeleport').removeClass('active');
    
    // Ocultar todos os controles
    $('#teleportInfo').hide();
    
    if (mode === 'normal') {
        $('#btnModeNormal').addClass('active');
        map.getContainer().style.cursor = '';
    } else if (mode === 'teleport') {
        $('#btnModeTeleport').addClass('active');
        $('#teleportInfo').show();
        map.getContainer().style.cursor = 'crosshair';
    }
}

/**
 * Converter coordenadas de pixel para DayZ
 */
function pixelToDayz(pixelCoords) {
    // Inverso da conversão dayz_to_pixel
    // pixel_x = (coord_x / 15360.0) * 4096
    // pixel_y = (coord_y / 15360.0) * 4096
    const pixelSize = currentMapConfig ? currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const x = (pixelCoords[1] / pixelSize) * 15360.0;
    const y = (pixelCoords[0] / pixelSize) * 15360.0;
    return { x: x, y: y };
}

/**
 * Handler para clique no mapa em modo teleporte
 */
function handleTeleportClick(e) {
    if (selectedPlayerFilters.length === 0) {
        showToast('Aviso', 'Selecione um jogador no filtro acima para teleportar', 'warning');
        return;
    }
    
    if (selectedPlayerFilters.length > 1) {
        showToast('Aviso', 'Selecione apenas um jogador para teleportar', 'warning');
        return;
    }
    
    const playerId = selectedPlayerFilters[0];
    const playerInfo = playersData[playerId] || {};
    const playerDisplayName = playerInfo.name || playerId;
    const playerSteamName = playerInfo.steamName ? ` (${playerInfo.steamName})` : '';
    
    // Converter pixel para coordenadas DayZ
    const pixelCoords = [e.latlng.lat, e.latlng.lng];
    const dayzCoords = pixelToDayz(pixelCoords);
    
    const confirmationName = `${playerDisplayName}${playerSteamName}`;
    
    if (!confirm(`Teleportar ${confirmationName} para X=${dayzCoords.x.toFixed(1)}, Y=${dayzCoords.y.toFixed(1)}?`)) {
        return;
    }
    
    // Executar teleporte (sem especificar altura - será calculada automaticamente)
    $.ajax({
        url: `/api/players/${playerId}/teleport`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            coord_x: dayzCoords.x,
            coord_y: dayzCoords.y
            // coord_z não é enviado, altura será calculada automaticamente pelo servidor
        }),
        success: function(response) {
            showToast('Sucesso', response.message, 'success');
            // Voltar ao modo normal após teleporte
            setMode('normal');
            // Atualizar posições
            setTimeout(() => loadPositions(), 1000);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao teleportar', 'error');
        }
    });
}

// Funções de spawn removidas - funcionalidades movidas para spawning.html
