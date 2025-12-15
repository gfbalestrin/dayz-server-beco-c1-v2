/**
 * Módulo Core do Mapa
 * Inicialização e configuração básica do mapa Leaflet
 */

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
    
    MapState.mapConfigs = {};
    MapState.mapConfigList = [];
    
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
        
        MapState.mapConfigs[normalizedConfig.id] = normalizedConfig;
        MapState.mapConfigList.push(normalizedConfig);
    });
    
    if (MapState.mapConfigList.length === 0) {
        const fallbackConfig = {
            id: 'default',
            name: 'Chernarus',
            image: '',
            pixelSize: BASE_MAP_SIZE
        };
        MapState.mapConfigs[fallbackConfig.id] = fallbackConfig;
        MapState.mapConfigList.push(fallbackConfig);
    }
    
    const defaultMapId = mapElement.attr('data-map-default');
    MapState.currentMapConfig = (defaultMapId && MapState.mapConfigs[defaultMapId]) ? MapState.mapConfigs[defaultMapId] : MapState.mapConfigList[0];
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
    
    MapState.mapConfigList.forEach(function(config) {
        const option = $('<option></option>')
            .val(config.id)
            .text(config.name);
        select.append(option);
    });
    
    if (MapState.currentMapConfig) {
        select.val(MapState.currentMapConfig.id);
    }
    
    if (MapState.mapConfigList.length <= 1) {
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
 * @returns {Array} Bounds do mapa [[minLat, minLng], [maxLat, maxLng]]
 */
function getCurrentMapBounds() {
    const size = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : BASE_MAP_SIZE;
    return [[0, 0], [size, size]];
}

/**
 * Obter centro do mapa baseado na configuração
 * @returns {Array} Centro do mapa [lat, lng]
 */
function getMapCenter() {
    const size = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : BASE_MAP_SIZE;
    return [size / 2, size / 2];
}

/**
 * Obter fator de escala em relação ao mapa base (4096)
 * @returns {number} Fator de escala
 */
function getMapScaleFactor() {
    if (!MapState.currentMapConfig) {
        return 1;
    }
    return MapState.currentMapConfig.pixelSize / BASE_MAP_SIZE;
}

/**
 * Aplicar configuração de mapa atual (imagem, bounds, centro)
 */
function applyMapConfiguration() {
    if (!MapState.map || !MapState.currentMapConfig) {
        hideLoading();
        return;
    }
    
    const bounds = getCurrentMapBounds();
    
    if (MapState.mapImageOverlay) {
        MapState.map.removeLayer(MapState.mapImageOverlay);
    }
    
    const imageUrl = MapState.currentMapConfig.image;
    
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
    
    MapState.mapImageOverlay = L.imageOverlay(imageUrl, bounds, {
        opacity: 1,
        interactive: false
    });
    MapState.mapImageOverlay.addTo(MapState.map);
    
    MapState.map.options.maxBounds = bounds;
    MapState.map.setMaxBounds(bounds);
    MapState.map.setView(getMapCenter(), MapState.map.getZoom());
}

/**
 * Alterar mapa exibido
 * @param {string} mapId - ID do mapa a ser exibido
 */
function switchMap(mapId) {
    if (!mapId || !MapState.mapConfigs[mapId] || (MapState.currentMapConfig && MapState.currentMapConfig.id === mapId)) {
        return;
    }
    
    MapState.currentMapConfig = MapState.mapConfigs[mapId];
    showLoading();
    applyMapConfiguration();
    clearMapLayers();
    
    // Recarregar dados após trocar mapa
    if (typeof loadPositions === 'function') {
        loadPositions();
    }
    if (MapState.showVehicles && typeof loadVehicles === 'function') {
        loadVehicles();
    }
    if (MapState.showContainers && typeof loadContainers === 'function') {
        loadContainers();
    }
    if (MapState.showFences && typeof loadFences === 'function') {
        loadFences();
    }
    if (MapState.showKills && typeof loadKills === 'function') {
        loadKills();
    }
    if (MapState.showDamages && typeof loadDamages === 'function') {
        loadDamages();
    }
    
    console.log('Mapa alternado para:', MapState.currentMapConfig.name, '(', MapState.currentMapConfig.pixelSize, 'px )');
}

/**
 * Limpar todos os layers que dependem do mapa atual
 */
function clearMapLayers() {
    if (!MapState.map) {
        return;
    }
    
    Object.keys(MapState.playerMarkers).forEach(function(key) {
        MapState.map.removeLayer(MapState.playerMarkers[key]);
    });
    MapState.playerMarkers = {};
    
    Object.keys(MapState.vehicleMarkers).forEach(function(key) {
        MapState.map.removeLayer(MapState.vehicleMarkers[key]);
    });
    MapState.vehicleMarkers = {};
    
    // Remover cluster group do mapa se existir
    if (MapState.containerClusterGroup && MapState.map.hasLayer(MapState.containerClusterGroup)) {
        MapState.map.removeLayer(MapState.containerClusterGroup);
    }
    if (MapState.containerClusterGroup) {
        MapState.containerClusterGroup.clearLayers();
    }
    Object.keys(MapState.containerMarkers).forEach(function(key) {
        if (MapState.containerMarkers[key] && MapState.map.hasLayer(MapState.containerMarkers[key])) {
            MapState.map.removeLayer(MapState.containerMarkers[key]);
        }
    });
    MapState.containerMarkers = {};
    
    Object.keys(MapState.fenceMarkers).forEach(function(key) {
        MapState.map.removeLayer(MapState.fenceMarkers[key]);
    });
    MapState.fenceMarkers = {};
    
    Object.keys(MapState.playerTrails).forEach(function(key) {
        const trail = MapState.playerTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => MapState.map.removeLayer(item));
        } else if (trail) {
            MapState.map.removeLayer(trail);
        }
    });
    MapState.playerTrails = {};
    
    Object.keys(MapState.vehicleTrails).forEach(function(key) {
        const trail = MapState.vehicleTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => MapState.map.removeLayer(item));
        } else if (trail) {
            MapState.map.removeLayer(trail);
        }
    });
    MapState.vehicleTrails = {};
    
    Object.keys(MapState.containerTrails).forEach(function(key) {
        const trail = MapState.containerTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => MapState.map.removeLayer(item));
        } else if (trail) {
            MapState.map.removeLayer(trail);
        }
    });
    MapState.containerTrails = {};
    
    Object.keys(MapState.fenceTrails).forEach(function(key) {
        const trail = MapState.fenceTrails[key];
        if (Array.isArray(trail)) {
            trail.forEach(item => MapState.map.removeLayer(item));
        } else if (trail) {
            MapState.map.removeLayer(trail);
        }
    });
    MapState.fenceTrails = {};
    
    MapState.killMarkers.forEach(function(item) {
        if (item.killerMarker) {
            MapState.map.removeLayer(item.killerMarker);
        }
        if (item.victimMarker) {
            MapState.map.removeLayer(item.victimMarker);
        }
        if (item.line) {
            MapState.map.removeLayer(item.line);
        }
    });
    MapState.killMarkers = [];
    
    MapState.damageMarkers.forEach(function(item) {
        if (item.attackerMarker) {
            MapState.map.removeLayer(item.attackerMarker);
        }
        if (item.victimMarker) {
            MapState.map.removeLayer(item.victimMarker);
        }
        if (item.line) {
            MapState.map.removeLayer(item.line);
        }
    });
    MapState.damageMarkers = [];
    
    $('#mapOnlineCount').text('0');
    $('#mapOfflineCount').text('0');
    $('#mapTotalCount').text('0');
    $('#vehicleCount').text('0');
    $('#containerCount').text('0');
    $('#fenceCount').text('0');
}

/**
 * Inicializar o mapa Leaflet
 */
function initMap() {
    // Mostrar loading enquanto carrega
    showLoading();
    
    if (!MapState.currentMapConfig) {
        console.error('Nenhuma configuração de mapa disponível');
        hideLoading();
        return;
    }
    
    // Criar mapa
    MapState.map = L.map('map', {
        crs: L.CRS.Simple,  // Sem projeção geográfica
        minZoom: -2,
        maxZoom: 5,  // Aumentado de 3 para 5 para facilitar seleção de construções próximas
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
    MapState.map.on('click', function(e) {
        if (MapState.currentMode === 'teleport') {
            if (typeof handleTeleportClick === 'function') {
                handleTeleportClick(e);
            }
        } else if (MapState.currentMode === 'scan') {
            if (typeof handleScanClick === 'function') {
                handleScanClick(e);
            }
        }
    });
    
    console.log('Mapa inicializado com imagem:', MapState.currentMapConfig.image);
    
    // Atualizar visibilidade dos badges baseado nos estados iniciais
    updateBadgesVisibility();
}

/**
 * Mostrar loading (agora na sidebar ao invés de overlay no mapa)
 */
function showLoading() {
    $('#mapLoadingIndicator').show();
}

/**
 * Esconder loading
 */
function hideLoading() {
    $('#mapLoadingIndicator').hide();
}

/**
 * Atualizar visibilidade dos badges baseado nos estados de visualização
 * Badges só são exibidos quando a visualização correspondente está ativa
 */
function updateBadgesVisibility() {
    // Badges de jogadores (Online, Offline, Total) - mostrar apenas se showPlayers estiver ativo
    const playersBadges = $('#mapOnlineCount, #mapOfflineCount, #mapTotalCount').closest('.badge');
    if (MapState.showPlayers) {
        playersBadges.show();
    } else {
        playersBadges.hide();
    }
    
    // Badge de veículos - mostrar apenas se showVehicles estiver ativo
    const vehicleBadge = $('#vehicleCount').closest('.badge');
    if (MapState.showVehicles) {
        vehicleBadge.show();
    } else {
        vehicleBadge.hide();
    }
    
    // Badge de containers - mostrar apenas se showContainers estiver ativo
    const containerBadge = $('#containerCount').closest('.badge');
    if (MapState.showContainers) {
        containerBadge.show();
    } else {
        containerBadge.hide();
    }
    
    // Badge de construções - mostrar apenas se showFences estiver ativo
    const fenceBadge = $('#fenceCount').closest('.badge');
    if (MapState.showFences) {
        fenceBadge.show();
    } else {
        fenceBadge.hide();
    }
}

/**
 * Toggle auto-refresh
 */
function toggleAutoRefresh() {
    if ($('#autoRefreshCheck').is(':checked')) {
        // Obter intervalo do campo de input (em segundos) e converter para milissegundos
        const intervalSeconds = parseInt($('#autoRefreshInterval').val()) || 10;
        const intervalMs = intervalSeconds * 1000;
        
        // Armazenar valor em segundos no MapState para referência
        MapState.autoRefreshIntervalSeconds = intervalSeconds;
        
        MapState.autoRefreshInterval = setInterval(function() {
            if (typeof loadPositions === 'function') loadPositions();
            if (MapState.showVehicles && typeof loadVehicles === 'function') loadVehicles();
            if (MapState.showContainers && typeof loadContainers === 'function') loadContainers();
            if (MapState.showFences && typeof loadFences === 'function') loadFences();
            if (MapState.showKills && typeof loadKills === 'function') loadKills();
            if (MapState.showDamages && typeof loadDamages === 'function') loadDamages();
            // Nota: reapplyCurrentTrailFilter() é chamada dentro de loadPositions() após updatePositions() terminar
            // Isso garante que os campos de data/hora sejam atualizados automaticamente durante o auto-refresh
        }, intervalMs);
        console.log(`Auto-refresh ligado (${intervalSeconds} segundos)`);
    } else {
        if (MapState.autoRefreshInterval) {
            clearInterval(MapState.autoRefreshInterval);
            MapState.autoRefreshInterval = null;
        }
        console.log('Auto-refresh desligado');
    }
}

