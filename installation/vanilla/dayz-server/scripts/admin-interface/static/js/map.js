/**
 * JavaScript para visualização do mapa com Leaflet
 */

// Variáveis globais
let map;
let playerMarkers = {};
let playerTrails = {};
let vehicleMarkers = {};
let currentFilter = null;
let autoRefreshInterval = null;
let showTrails = false;
let showVehicles = false;

// Cor padrão do Leaflet
const iconColors = [
    'red', 'blue', 'green', 'orange', 'purple', 'pink', 
    'yellow', 'brown', 'darkred', 'darkblue', 'darkgreen'
];

// Ícone customizado para veículos
function createVehicleIcon() {
    return L.divIcon({
        className: 'vehicle-marker',
        html: `<div style="background-color: #28a745; border: 2px solid white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="fas fa-car" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [20, 20]
    });
}

// Inicializar o mapa quando o documento estiver pronto
$(document).ready(function() {
    initMap();
    loadPositions();
    
    // Event listeners
    $('#refreshBtn').on('click', loadPositions);
    $('#autoRefreshCheck').on('change', toggleAutoRefresh);
    $('#onlineOnlyCheck').on('change', filterPlayers);
    $('#playerFilter').on('change', filterPlayers);
    $('#toggleTrailsBtn').on('click', toggleTrails);
    $('#toggleVehiclesBtn').on('click', toggleVehiclesDisplay);
    
    // Auto-refresh inicial
    toggleAutoRefresh();
});

/**
 * Inicializar o mapa Leaflet
 */
function initMap() {
    // Mostrar loading enquanto carrega
    showLoading();
    
    // Criar mapa
    map = L.map('map', {
        crs: L.CRS.Simple,  // Sem projeção geográfica
        minZoom: -2,
        maxZoom: 3,
        maxBounds: [[0, 0], [4096, 4096]],
        maxBoundsViscosity: 1.0,  // Impede arrastar para fora dos limites
        zoom: 0,
        center: [2048, 2048],  // Centro do mapa 4096x4096
        zoomControl: true,
        attributionControl: false
    });
    
    // Obter URL da imagem do atributo data
    const imageUrl = $('#map').data('map-image');
    
    if (!imageUrl) {
        console.error('URL da imagem do mapa não encontrada!');
        hideLoading();
        return;
    }
    
    // Adicionar imagem com evento de load
    const imageOverlay = L.imageOverlay(imageUrl, [[0, 0], [4096, 4096]], {
        opacity: 1,
        interactive: false
    });
    
    // Quando a imagem carregar, remover loading
    const img = new Image();
    img.onload = function() {
        console.log('Imagem do mapa carregada com sucesso');
        hideLoading();
    };
    img.onerror = function() {
        console.error('Erro ao carregar imagem do mapa');
        hideLoading();
    };
    img.src = imageUrl;
    
    imageOverlay.addTo(map);
    
    console.log('Mapa inicializado com imagem:', imageUrl);
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
        className: 'player-marker',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 12px; height: 12px; border-radius: 50%;"></div>`,
        iconSize: [12, 12]
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
    if (!currentFilter) {
        Object.keys(playerMarkers).forEach(function(key) {
            map.removeLayer(playerMarkers[key]);
        });
        playerMarkers = {};
    }
    
    // Processar cada jogador
    data.players.forEach(function(player) {
        const playerId = player.player_id;
        
        // Aplicar filtro se existir
        if (currentFilter && currentFilter !== playerId) {
            // Remover marcador se não corresponde ao filtro
            if (playerMarkers[playerId]) {
                map.removeLayer(playerMarkers[playerId]);
                delete playerMarkers[playerId];
            }
            return;
        }
        
        const color = getPlayerColor(playerId);
        const lat = player.pixel_coords[0];
        const lng = player.pixel_coords[1];
        
        // Remover marcador antigo se existir
        if (playerMarkers[playerId]) {
            map.removeLayer(playerMarkers[playerId]);
        }
        
        // Criar novo marcador
        const marker = L.marker([lat, lng], {
            icon: createMarkerIcon(color),
            opacity: player.is_online ? 1.0 : 0.6
        }).addTo(map);
        
        // Adicionar popup
        const popupContent = `
            <div class="player-popup">
                <strong>${player.player_name}</strong>
                <div class="info-row">
                    <span class="info-label">Steam:</span>
                    <span class="info-value">${player.steam_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Coords:</span>
                    <span class="info-value">X: ${player.coord_x.toFixed(2)}, Y: ${player.coord_y.toFixed(2)} (altura: ${player.coord_z ? player.coord_z.toFixed(2) : 'N/A'})</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Atualizado:</span>
                    <span class="info-value">${player.last_update || 'Desconhecido'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status:</span>
                    <span class="info-value">${player.is_online ? '<span class="status-indicator online"></span>Online' : '<span class="status-indicator offline"></span>Offline'}</span>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        marker.on('click', function() {
            loadPlayerTrail(playerId);
        });
        
        playerMarkers[playerId] = marker;
    });
    
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
 * Desenhar trail de um jogador
 */
function drawTrail(playerId, trail) {
    // Remover trail antigo se existir
    if (playerTrails[playerId]) {
        map.removeLayer(playerTrails[playerId]);
    }
    
    // Criar linha do trail
    const latlngs = trail.map(function(point) {
        return [point.pixel_coords[0], point.pixel_coords[1]];
    });
    
    const color = getPlayerColor(playerId);
    
    const polyline = L.polyline(latlngs, {
        color: color,
        weight: 3,
        opacity: 0.6
    }).addTo(map);
    
    playerTrails[playerId] = polyline;
}

/**
 * Toggle mostrar trails
 */
function toggleTrails() {
    showTrails = !showTrails;
    
    if (showTrails) {
        $('#toggleTrailsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Trails');
        // Carregar trails de todos os jogadores visíveis
        Object.keys(playerMarkers).forEach(loadPlayerTrail);
    } else {
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar Trails');
        // Remover todos os trails
        Object.keys(playerTrails).forEach(function(key) {
            map.removeLayer(playerTrails[key]);
        });
        playerTrails = {};
    }
}

/**
 * Filtrar jogadores
 */
function filterPlayers() {
    currentFilter = $('#playerFilter').val();
    
    // Recarregar posições
    loadPositions();
}

/**
 * Toggle auto-refresh
 */
function toggleAutoRefresh() {
    if ($('#autoRefreshCheck').is(':checked')) {
        autoRefreshInterval = setInterval(function() {
            loadPositions();
            if (showVehicles) loadVehicles();
        }, 10000); // 10 segundos
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
    $.get('/api/vehicles/positions')
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
    
    if (!showVehicles) {
        return;
    }
    
    // Adicionar veículos
    data.vehicles.forEach(function(vehicle) {
        const vehicleId = vehicle.vehicle_id;
        const lat = vehicle.pixel_coords[0];
        const lng = vehicle.pixel_coords[1];
        
        const marker = L.marker([lat, lng], {
            icon: createVehicleIcon(),
            opacity: 1.0
        }).addTo(map);
        
        const popupContent = `
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
                <div class="info-row">
                    <span class="info-label">Atualizado:</span>
                    <span class="info-value">${vehicle.last_update || 'Desconhecido'}</span>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        vehicleMarkers[vehicleId] = marker;
    });
    
    console.log(`Veículos atualizados: ${data.vehicles.length} veículos`);
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
