/**
 * JavaScript para visualização do mapa com Leaflet
 */

// Variáveis globais
let map;
let playerMarkers = {};
let playerTrails = {};
let vehicleMarkers = {};
let killMarkers = [];
let playersData = {}; // Armazenar dados dos jogadores
let currentPointContext = null; // Contexto do ponto para ações
let currentFilter = null;
let autoRefreshInterval = null;
let showTrails = false;
let showVehicles = false;
let showKills = false;
let currentMode = 'normal'; // normal, teleport
let teleportTargetPlayer = null;
let trailDateFilter = {
    enabled: false,
    startDate: null,
    endDate: null
};
// Variáveis removidas - funcionalidades de spawn movidas para spawning.html

// Cor padrão do Leaflet - cores mais vibrantes
const iconColors = [
    '#ff0000', '#0066ff', '#00cc00', '#ff6600', '#9900ff', '#ff0099',
    '#ffcc00', '#00cccc', '#cc0000', '#0000cc', '#009900'
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
    $('#toggleKillsBtn').on('click', toggleKills);
    $('#applyTrailFilter').on('click', applyTrailDateFilter);
    
    // Event listeners para modos
    $('#btnModeNormal').on('click', () => setMode('normal'));
    $('#btnModeTeleport').on('click', () => setMode('teleport'));
    
    // Verificar se há filtro de player_id na URL e aplicar
    const urlParams = new URLSearchParams(window.location.search);
    const playerIdFilter = urlParams.get('player_id');
    if (playerIdFilter) {
        setTimeout(function() {
            $('#playerFilter').val(playerIdFilter);
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
    
    // Criar mapa
    map = L.map('map', {
        crs: L.CRS.Simple,  // Sem projeção geográfica
        minZoom: -2,
        maxZoom: 3,
        maxBounds: [[0, 0], [4096, 4096]],
        maxBoundsViscosity: 1.0,  // Impede arrastar para fora dos limites
        zoom: -2,  // Iniciar no zoom mínimo para ver mapa completo
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
    
    // Adicionar evento de clique no mapa
    map.on('click', function(e) {
        if (currentMode === 'teleport') {
            handleTeleportClick(e);
        }
    });
    
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
        html: `<div style="background-color: #dc3545; border: 2px solid white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-skull-crossbones" style="color: white; font-size: 10px;"></i>
               </div>`,
        iconSize: [20, 20]
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
        
        // Armazenar dados do jogador
        playersData[playerId] = {
            name: player.player_name,
            steamName: player.steam_name,
            isOnline: player.is_online
        };
        
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
            opacity: player.is_online ? 1.0 : 0.9
        }).addTo(map);
        
        // Formatar conteúdo do tooltip seguindo padrão dos trails
        const tooltipContent = `
            <strong>👤 ${player.player_name}${player.steam_name ? ` (${player.steam_name})` : ''}</strong><br>
            ${player.is_online ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
            📍 Coords: <span class="value">X=${player.coord_x.toFixed(1)}, Y=${player.coord_y.toFixed(1)}</span><br>
            ${player.coord_z ? `📏 Altura: <span class="value">${player.coord_z.toFixed(1)}m</span><br>` : ''}
            ⏰ Atualizado: <span class="value">${player.last_update || 'Desconhecido'}</span>
        `;
        
        // Direção dinâmica baseada na posição Y (valores altos = norte)
        const tooltipDirection = lat > 3000 ? 'bottom' : 'top';
        
        // Adicionar tooltip (aparece ao passar o mouse)
        marker.bindTooltip(tooltipContent, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });
        
        // Clique continua carregando o trail
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
        if (Array.isArray(playerTrails[playerId])) {
            playerTrails[playerId].forEach(item => map.removeLayer(item));
        } else {
            map.removeLayer(playerTrails[playerId]);
        }
    }
    
    playerTrails[playerId] = [];
    
    if (trail.length === 0) return;
    
    // Aplicar filtro de data se ativo
    if (trailDateFilter.enabled) {
        trail = trail.filter(point => {
            const pointDate = new Date(point.timestamp);
            return pointDate >= trailDateFilter.startDate && 
                   pointDate <= trailDateFilter.endDate;
        });
        
        if (trail.length === 0) {
            console.log('Nenhum ponto encontrado no período especificado');
            return;
        }
    }
    
    // Criar linha do trail
    const latlngs = trail.map(point => [point.pixel_coords[0], point.pixel_coords[1]]);
    const color = getPlayerColor(playerId);
    
    const polyline = L.polyline(latlngs, {
        color: color,
        weight: 4,
        opacity: 0.85
    }).addTo(map);
    
    playerTrails[playerId].push(polyline);
    
    // Adicionar marcadores em cada ponto com cálculo de velocidade
    for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        const playerName = playersData[playerId]?.name || 'Jogador';
        const steamName = playersData[playerId]?.steamName || '';
        let tooltipText = `<strong>👤 ${playerName}${steamName ? ` (${steamName})` : ''}</strong><br>`;
        tooltipText += `<strong>📍 Ponto ${trail.length - i}</strong><br>`;
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
            const prevPoint = trail[i - 1];
            
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
            [point.pixel_coords[0], point.pixel_coords[1]],
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
        const tooltipDirection = point.pixel_coords[0] > 3000 ? 'bottom' : 'top';
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });
        
        playerTrails[playerId].push(circleMarker);
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
 * Filtrar jogadores
 */
function filterPlayers() {
    currentFilter = $('#playerFilter').val();
    
    // Recarregar posições
    loadPositions();
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
        map.removeLayer(item.marker);
        if (item.line) map.removeLayer(item.line);
    });
    killMarkers = [];
    
    if (!showKills) return;
    
    data.events.forEach(function(event) {
        // Marcador na posição da vítima
        const marker = L.marker(
            [event.victim_pos.pixel_coords[0], event.victim_pos.pixel_coords[1]],
            { icon: createKillIcon() }
        ).addTo(map);
        
        // Popup com informações
        const popupContent = `
            <div class="event-popup">
                <strong>💀 Kill Event</strong>
                <div class="info-row">
                    <span class="info-label">Killer:</span>
                    <span class="info-value">${event.killer_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Victim:</span>
                    <span class="info-value">${event.victim_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Weapon:</span>
                    <span class="info-value">${event.weapon}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Distance:</span>
                    <span class="info-value">${event.distance.toFixed(0)}m</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Time:</span>
                    <span class="info-value">${event.timestamp}</span>
                </div>
            </div>
        `;
        marker.bindPopup(popupContent);
        
        // Linha conectando killer e victim
        const line = L.polyline([
            [event.killer_pos.pixel_coords[0], event.killer_pos.pixel_coords[1]],
            [event.victim_pos.pixel_coords[0], event.victim_pos.pixel_coords[1]]
        ], {
            color: '#dc3545',
            weight: 2,
            opacity: 0.6,
            dashArray: '5, 10'
        }).addTo(map);
        
        killMarkers.push({ marker, line });
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
            map.removeLayer(item.marker);
            if (item.line) map.removeLayer(item.line);
        });
        killMarkers = [];
    }
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
 * Mostrar modal de teleporte
 */
function showTeleportModal(playerId, point, pointNumber) {
    const playerData = playersData[playerId];
    const playerName = playerData ? playerData.name : 'Desconhecido';
    
    $('#teleportPlayerName').text(playerName);
    $('#teleportPointNumber').text(pointNumber);
    $('#teleportCoords').text(`X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}, Z=${point.coord_z ? point.coord_z.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados
    $('#confirmTeleportBtn').data('playerId', playerId);
    $('#confirmTeleportBtn').data('coordX', point.coord_x);
    $('#confirmTeleportBtn').data('coordY', point.coord_y);
    $('#confirmTeleportBtn').data('coordZ', point.coord_z);
    
    const modal = new bootstrap.Modal(document.getElementById('teleportModal'));
    modal.show();
}

/**
 * Executar teleporte
 */
function executeTeleport() {
    const playerId = $('#confirmTeleportBtn').data('playerId');
    const coordX = $('#confirmTeleportBtn').data('coordX');
    const coordY = $('#confirmTeleportBtn').data('coordY');
    const coordZ = $('#confirmTeleportBtn').data('coordZ');
    
    if (!playerId || coordX === undefined || coordY === undefined) {
        showToast('Erro', 'Dados inválidos para teleporte', 'error');
        return;
    }
    
    $('#confirmTeleportBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Teleportando...');
    
    $.ajax({
        url: `/api/players/${playerId}/teleport`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            coord_x: coordX,
            coord_y: coordY,
            coord_z: coordZ || 0
        }),
        success: function(response) {
            bootstrap.Modal.getInstance(document.getElementById('teleportModal')).hide();
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
            $('#confirmTeleportBtn').prop('disabled', false).html('<i class="fas fa-map-marker-alt me-1"></i>Teleportar');
        }
    });
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
            
            // Abrir modal de teleporte
            showTeleportModal(
                currentPointContext.playerId,
                currentPointContext.point,
                currentPointContext.pointNumber
            );
        }
    });
    
    // Botão de teleporte
    $('#confirmTeleportBtn').on('click', executeTeleport);
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
    const x = (pixelCoords[1] / 4096) * 15360.0;
    const y = (pixelCoords[0] / 4096) * 15360.0;
    return { x: x, y: y };
}

/**
 * Handler para clique no mapa em modo teleporte
 */
function handleTeleportClick(e) {
    const playerId = $('#playerFilter').val();
    if (!playerId || playerId === '') {
        showToast('Aviso', 'Selecione um jogador no filtro acima para teleportar', 'warning');
        return;
    }
    
    // Converter pixel para coordenadas DayZ
    const pixelCoords = [e.latlng.lat, e.latlng.lng];
    const dayzCoords = pixelToDayz(pixelCoords);
    
    // Buscar nome do jogador do filtro
    const select = $('#playerFilter');
    const playerName = select.find('option:selected').text();
    
    if (!confirm(`Teleportar ${playerName} para X=${dayzCoords.x.toFixed(1)}, Y=${dayzCoords.y.toFixed(1)}?`)) {
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
