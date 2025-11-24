/**
 * Módulo de Containers do Mapa
 * Lógica de containers, trails, histórico e clustering
 */

/**
 * Detectar mudanças em containers
 */
function detectContainerChanges(newData, oldData) {
    if (!MapState.showContainers) return [];
    
    const changes = [];
    newData.containers.forEach(function(container) {
        const containerId = container.container_id;
        const oldContainer = oldData[containerId];
        
        if (!oldContainer) {
            changes.push({
                type: 'new',
                containerId: containerId,
                containerType: container.container_type,
                message: `Novo container: ${container.container_type}`
            });
            return;
        }
        
        const changeMessages = [];
        
        if (oldContainer.coord_x !== container.coord_x || oldContainer.coord_y !== container.coord_y) {
            changeMessages.push('mudou de posição');
        }
        
        if (oldContainer.is_destroyed !== container.is_destroyed) {
            if (container.is_destroyed) {
                changeMessages.push('foi destruído');
            } else {
                changeMessages.push('foi restaurado');
            }
        }
        
        const oldItemsCount = (oldContainer.items || []).length;
        const newItemsCount = (container.items || []).length;
        if (oldItemsCount !== newItemsCount) {
            changeMessages.push(`itens: ${oldItemsCount} → ${newItemsCount}`);
        }
        
        if (changeMessages.length > 0) {
            changes.push({
                type: 'change',
                containerId: containerId,
                containerType: container.container_type,
                message: `Container ${container.container_type}: ${changeMessages.join(', ')}`
            });
        }
    });
    
    return changes;
}

/**
 * Carregar posições de containers
 */
function loadContainers() {
    if (!MapState.showContainers) {
        return;
    }
    
    const includeDestroyed = $('#showDestroyedCheck').is(':checked');
    
    // Adicionar indicador de loading no botão (apenas se não estiver já em loading)
    const btn = $('#toggleContainersBtn');
    if (!btn.prop('disabled') || !btn.html().includes('Carregando')) {
        btn.html('<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Carregando...').prop('disabled', true);
    }
    
    $.get('/api/containers/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateContainers(data);
        })
        .fail(function() {
            console.error('Erro ao carregar containers');
            // Restaurar botão em caso de erro
            if (MapState.showContainers) {
                btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Containers').prop('disabled', false);
            } else {
                btn.html('<i class="fas fa-box me-1"></i>Mostrar Containers').prop('disabled', false);
            }
        });
}

/**
 * Atualizar containers no mapa
 */
function updateContainers(data) {
    // Detectar mudanças antes de atualizar
    if (Object.keys(MapState.previousContainersData).length > 0 && MapState.notificationsEnabled) {
        const containerChanges = detectContainerChanges(data, MapState.previousContainersData);
        containerChanges.forEach(function(change) {
            showToast('Container', change.message, 'info');
            addNotificationToLog('info', `Container: ${change.message}`);
        });
    }
    
    // Rastrear quais popups estavam abertos antes de remover marcadores
    const openContainerPopups = [];
    Object.keys(MapState.containerMarkers).forEach(function(key) {
        const marker = MapState.containerMarkers[key];
        if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
            openContainerPopups.push(key);
        }
    });
    
    // Limpar containers antigos
    if (MapState.containerClusterGroup) {
        MapState.containerClusterGroup.clearLayers();
    }
    Object.keys(MapState.containerMarkers).forEach(function(key) {
        if (MapState.containerMarkers[key] && MapState.map.hasLayer(MapState.containerMarkers[key])) {
            MapState.map.removeLayer(MapState.containerMarkers[key]);
        }
    });
    MapState.containerMarkers = {};
    
    // Atualizar contador de containers
    $('#containerCount').text(data.containers.length);
    
    if (!MapState.showContainers) {
        // Salvar estado anterior mesmo se não estiver mostrando
        MapState.previousContainersData = {};
        data.containers.forEach(function(container) {
            MapState.previousContainersData[container.container_id] = {
                coord_x: container.coord_x,
                coord_y: container.coord_y,
                is_destroyed: container.is_destroyed,
                items: container.items || []
            };
        });
        return;
    }
    
    // Criar ou reutilizar cluster group
    if (!MapState.containerClusterGroup) {
        MapState.containerClusterGroup = L.markerClusterGroup({
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
        
        MapState.containersData[containerId] = container;
        
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
            maxWidth: 320,
            maxHeight: 500,
            offset: popupOffset
        });
        
        MapState.containerMarkers[containerId] = marker;
        MapState.containerClusterGroup.addLayer(marker);
    });
    
    // Adicionar cluster group ao mapa se ainda não estiver
    if (!MapState.map.hasLayer(MapState.containerClusterGroup)) {
        MapState.containerClusterGroup.addTo(MapState.map);
    }
    
    // Reabrir popups que estavam abertos antes do auto-refresh
    if (openContainerPopups.length > 0) {
        setTimeout(function() {
            openContainerPopups.forEach(function(containerId) {
                const marker = MapState.containerMarkers[containerId];
                if (marker && !marker.isPopupOpen()) {
                    marker.openPopup();
                }
            });
        }, 100);
    }
    
    console.log(`Containers atualizados: ${data.containers.length} containers`);
    
    // Remover indicador de loading do botão (apenas se estiver desabilitado)
    const btn = $('#toggleContainersBtn');
    if (btn.prop('disabled') && btn.html().includes('Carregando')) {
        if (MapState.showContainers) {
            btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Containers').prop('disabled', false);
        } else {
            btn.html('<i class="fas fa-box me-1"></i>Mostrar Containers').prop('disabled', false);
        }
    }
    
    // Recarregar trails de containers que já estão ativos (para atualizar com novos dados)
    setTimeout(function() {
        Object.keys(MapState.containerTrails).forEach(function(containerId) {
            if (MapState.containerMarkers[containerId]) {
                loadContainerTrail(containerId, true); // forceReload = true
            }
        });
    }, 500);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousContainersData = {};
    data.containers.forEach(function(container) {
        MapState.previousContainersData[container.container_id] = {
            coord_x: container.coord_x,
            coord_y: container.coord_y,
            is_destroyed: container.is_destroyed,
            items: container.items || []
        };
    });
}

/**
 * Carregar trail de um container
 */
function loadContainerTrail(containerId, forceReload = false) {
    if (MapState.containerTrails[containerId] && !forceReload) {
        console.log('Container trail já carregado:', containerId);
        return; // Trail já carregado e não é recarregamento forçado
    }
    
    // Se forceReload, remover trail antigo antes de carregar novo
    if (forceReload && MapState.containerTrails[containerId]) {
        removeContainerTrail(containerId);
    }
    
    console.log('Carregando trail do container:', containerId, forceReload ? '(recarregamento forçado)' : '');
    // Para o trail no mapa, não filtrar apenas por itens (mostrar todas as posições)
    $.get(`/api/containers/${containerId}/trail`, { limit: 100, filter_by_items_only: false })
        .done(function(data) {
            console.log('Trail do container recebido:', containerId, data);
            drawContainerTrail(containerId, data.trail);
        })
        .fail(function(xhr, status, error) {
            console.error('Erro ao carregar trail do container:', containerId, status, error, xhr.responseText);
            // Atualizar popup mesmo em caso de erro para refletir o estado correto
            updateContainerPopup(containerId);
        });
}

/**
 * Desenhar trail de um container
 */
function drawContainerTrail(containerId, trail) {
    console.log('drawContainerTrail chamado:', containerId, 'trail length:', trail ? trail.length : 0);
    
    // Remover trail antigo se existir
    if (MapState.containerTrails[containerId]) {
        if (Array.isArray(MapState.containerTrails[containerId])) {
            MapState.containerTrails[containerId].forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(MapState.containerTrails[containerId]);
        }
    }
    
    MapState.containerTrails[containerId] = [];
    
    if (!trail || trail.length === 0) {
        console.warn('drawContainerTrail: trail vazio ou inválido para container:', containerId);
        // Trail vazio: não há trail ativo, então atualizar popup para mostrar botão "Trail"
        updateContainerPopup(containerId);
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
        // Trail processado vazio: não há trail ativo, então atualizar popup para mostrar botão "Trail"
        updateContainerPopup(containerId);
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
        }).addTo(MapState.map);
        
        const tooltipText = generateConsolidatedTooltip(processedTrail, 'container', firstPoint.container_name || firstPoint.container_type);
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip',
            maxWidth: 400
        });
        
        MapState.containerTrails[containerId].push(circleMarker);
        console.log('drawContainerTrail: círculo único criado para container:', containerId);
    } else {
        // Objeto em movimento: criar polyline e círculos individuais
        console.log('drawContainerTrail: criando polyline e círculos (em movimento) para container:', containerId);
        const latlngs = processedTrail.map(item => item.mapCoords);
        const polyline = L.polyline(latlngs, {
            color: '#007bff',
            weight: 3,
            opacity: 0.7
        }).addTo(MapState.map);
        
        MapState.containerTrails[containerId].push(polyline);
        
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
            }).addTo(MapState.map);
            
            const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
            circleMarker.bindTooltip(tooltipText, {
                permanent: false,
                direction: tooltipDirection,
                className: 'trail-tooltip'
            });
            
            MapState.containerTrails[containerId].push(circleMarker);
        }
        console.log('drawContainerTrail: polyline e', processedTrail.length, 'círculos criados para container:', containerId);
    }
    
    // Atualizar popup após o trail ser desenhado para refletir o estado do botão
    if (MapState.containerTrails[containerId] && MapState.containerTrails[containerId].length > 0) {
        updateContainerPopup(containerId);
    }
}

/**
 * Remover trail de um container
 */
function removeContainerTrail(containerId) {
    if (MapState.containerTrails[containerId]) {
        if (Array.isArray(MapState.containerTrails[containerId])) {
            MapState.containerTrails[containerId].forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(MapState.containerTrails[containerId]);
        }
        delete MapState.containerTrails[containerId];
    }
}

/**
 * Toggle trail de container
 */
function toggleContainerTrail(containerId) {
    if (MapState.containerTrails[containerId]) {
        removeContainerTrail(containerId);
        // Atualizar popup para refletir que o trail foi removido
        updateContainerPopup(containerId);
    } else {
        // O popup será atualizado automaticamente após o trail ser carregado
        loadContainerTrail(containerId);
    }
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
        itemsHtml += '<div class="mt-2"><strong>Items:</strong><div class="mt-1" style="max-height: 200px; overflow-y: auto;">';
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
    
    const isRefreshing = MapState.containerRefreshStatus && MapState.containerRefreshStatus[container.container_id];
    
    return `
        <div class="player-popup" style="display: flex; flex-direction: column; max-height: 580px;">
            <div style="flex: 1; overflow-y: auto; padding-right: 4px; min-height: 0;">
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
            </div>
            <div style="flex-shrink: 0; border-top: 1px solid #dee2e6; padding-top: 8px; margin-top: 8px; background-color: #fff;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" id="containerRefreshBtn_${container.container_id}" ${isRefreshing ? 'disabled' : ''} onclick="refreshContainerData('${container.container_id}')">
                        ${isRefreshing ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...' : '<i class="fas fa-sync-alt me-1"></i>Atualizar'}
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="toggleContainerTrail('${container.container_id}')">
                        <i class="fas fa-route me-1"></i><span id="containerTrailBtn_${container.container_id}">${MapState.containerTrails[container.container_id] ? 'Ocultar' : 'Trail'}</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-info" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="showContainerLootHistory('${container.container_id}')">
                        <i class="fas fa-history me-1"></i>Histórico
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="showContainerTeleportModal('${container.container_id}')">
                        <i class="fas fa-map-marker-alt me-1"></i>Teleportar
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Atualizar popup de container
 */
function updateContainerPopup(containerId) {
    const marker = MapState.containerMarkers[containerId];
    if (!marker || !MapState.containersData[containerId]) return;
    
    const container = MapState.containersData[containerId];
    const popupContent = createContainerPopup(container);
    
    // Verificar se popup está aberto antes de atualizar
    const wasOpen = marker.isPopupOpen();
    
    if (wasOpen) {
        // Atualizar conteúdo do popup
        marker.setPopupContent(popupContent);
        
        // Garantir que popup permaneça aberto após atualização
        setTimeout(function() {
            if (marker && !marker.isPopupOpen()) {
                marker.openPopup();
            }
        }, 50);
    }
}

/**
 * Toggle mostrar containers
 */
function toggleContainersDisplay() {
    MapState.showContainers = !MapState.showContainers;
    
    if (MapState.showContainers) {
        $('#toggleContainersBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Containers');
        loadContainers();
    } else {
        $('#toggleContainersBtn').html('<i class="fas fa-box me-1"></i>Mostrar Containers');
        // Remover cluster group do mapa se existir
        if (MapState.containerClusterGroup && MapState.map.hasLayer(MapState.containerClusterGroup)) {
            MapState.map.removeLayer(MapState.containerClusterGroup);
        }
        // Remover todos os containers
        Object.keys(MapState.containerMarkers).forEach(function(key) {
            if (MapState.containerMarkers[key] && MapState.map.hasLayer(MapState.containerMarkers[key])) {
                MapState.map.removeLayer(MapState.containerMarkers[key]);
            }
        });
        MapState.containerMarkers = {};
        
        // Limpar trails de containers
        Object.keys(MapState.containerTrails).forEach(function(key) {
            const trail = MapState.containerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.containerTrails = {};
        
        // Resetar contador de containers
        $('#containerCount').text('0');
    }
    
    // Atualizar visibilidade dos badges
    if (typeof updateBadgesVisibility === 'function') {
        updateBadgesVisibility();
    }
}

/**
 * Carregar histórico de loot do container com filtros e paginação
 */
function loadContainerHistory(containerId, offset = 0, dateFrom = null, dateTo = null) {
    MapState.currentHistoryType = 'container';
    MapState.currentHistoryId = containerId;
    MapState.currentHistoryPagination.offset = offset;
    MapState.currentHistoryPagination.date_from = dateFrom;
    MapState.currentHistoryPagination.date_to = dateTo;
    
    const params = {
        limit: MapState.currentHistoryPagination.limit,
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
    const container = MapState.containersData[containerId];
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
    html += `<input type="date" class="form-control form-control-sm" id="historyDateFrom" value="${formatDateForInput(MapState.currentHistoryPagination.date_from)}">`;
    html += `</div>`;
    html += `<div class="col-md-5">`;
    html += `<label class="form-label small">Data final:</label>`;
    html += `<input type="date" class="form-control form-control-sm" id="historyDateTo" value="${formatDateForInput(MapState.currentHistoryPagination.date_to)}">`;
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
 * Mostrar modal de teleporte de container
 */
function showContainerTeleportModal(containerId) {
    const container = MapState.containersData[containerId];
    if (!container) {
        showToast('Erro', 'Container não encontrado', 'error');
        return;
    }
    
    // Limpar target de veículo se houver
    MapState.teleportTargetVehicle = null;
    
    // Usar o mesmo modal de teleporte de veículos
    $('#teleportVehicleId').val(containerId);
    $('#teleportVehicleName').text(container.container_type || 'Container');
    $('#teleportVehicleCurrentCoords').text(`X=${container.coord_x.toFixed(1)}, Y=${container.coord_y.toFixed(1)}`);
    
    // Atualizar título e texto do modal para container
    $('#vehicleTeleportModal .modal-title').html('<i class="fas fa-map-marker-alt me-2"></i>Teleportar Container');
    $('#vehicleTeleportModal .alert-info strong').first().text('Container:');
    
    // Limpar campos de coordenadas
    $('#teleportVehicleX').val('');
    $('#teleportVehicleY').val('');
    $('#teleportVehicleZ').val('');
    
    // Armazenar containerId para uso no clique do mapa
    MapState.teleportTargetContainer = containerId;
    
    // Verificar se está no modo de teleporte
    if (MapState.currentMode !== 'teleport') {
        // Mudar para modo de teleporte
        setMode('teleport');
    } else {
        // Atualizar mensagem do teleportInfo
        updateTeleportInfo();
    }
    
    // Mostrar modal
    $('#vehicleTeleportModal').modal('show');
}

/**
 * Calcular distância entre duas coordenadas DayZ (em metros)
 * @param {number} x1 - Coordenada X (leste-oeste) da primeira posição
 * @param {number} y1 - Coordenada Y (norte-sul) da primeira posição
 * @param {number} x2 - Coordenada X (leste-oeste) da segunda posição
 * @param {number} y2 - Coordenada Y (norte-sul) da segunda posição
 * @returns {number} Distância em metros
 */
function calculateDayZDistance(x1, y1, x2, y2) {
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
        return 0;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Solicitar refresh de informações do container via comando checkcontainer
 */
function refreshContainerData(containerId) {
    if (!containerId) {
        return;
    }
    
    if (MapState.containerRefreshStatus && MapState.containerRefreshStatus[containerId]) {
        showToast('Info', 'Atualização já está em andamento para este container.', 'info');
        return;
    }
    
    const container = MapState.containersData[containerId];
    if (!container) {
        showToast('Erro', 'Container não encontrado no mapa.', 'error');
        return;
    }
    
    const requestId = generateRequestId();
    if (!MapState.containerRefreshRequests) {
        MapState.containerRefreshRequests = {};
    }
    MapState.containerRefreshRequests[containerId] = requestId;
    
    setContainerRefreshState(containerId, true);
    
    $.ajax({
        url: `/api/containers/${containerId}/refresh`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            request_id: requestId
        }),
        success: function() {
            showToast('Info', `Solicitação de atualização enviada para ${container.container_type || containerId}.`, 'info');
            startContainerRefreshPolling(requestId, containerId, 0);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao solicitar atualização do container';
            showToast('Erro', errorMsg, 'error');
            setContainerRefreshState(containerId, false);
            delete MapState.containerRefreshRequests[containerId];
        }
    });
}

/**
 * Polling para aguardar resultado do comando checkcontainer
 */
function startContainerRefreshPolling(requestId, containerId, attempt) {
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 500;
    
    if (MapState.containerRefreshRequests[containerId] !== requestId) {
        return;
    }
    
    if (attempt >= MAX_ATTEMPTS) {
        showToast('Aviso', 'Tempo limite ao atualizar dados do container.', 'warning');
        setContainerRefreshState(containerId, false);
        delete MapState.containerRefreshRequests[containerId];
        return;
    }
    
    $.get(`/api/commands/results/${requestId}`)
        .done(function(response) {
            if (MapState.containerRefreshRequests[containerId] !== requestId) {
                return;
            }
            
            if (response.status === 'ready') {
                const data = response.data || {};
                if (data.status === 'success') {
                    applyContainerRefreshData(containerId, data);
                    
                    // Salvar no banco de dados (silenciosamente)
                    saveContainerCheckToDatabase(containerId, data);
                    
                    const containerType = (MapState.containersData[containerId] && MapState.containersData[containerId].container_type) || containerId;
                    showToast('Sucesso', `Dados do container ${containerType} atualizados.`, 'success');
                } else {
                    const errorMsg = data.message || 'Não foi possível atualizar os dados do container.';
                    showToast('Aviso', errorMsg, 'warning');
                }
                setContainerRefreshState(containerId, false);
                delete MapState.containerRefreshRequests[containerId];
            } else if (response.status === 'not_found') {
                // Resultado ainda não disponível, continuar polling
                setTimeout(function() {
                    startContainerRefreshPolling(requestId, containerId, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                // Erro ou status desconhecido
                const errorMsg = response.message || 'Erro ao buscar resultado do comando.';
                showToast('Erro', errorMsg, 'error');
                setContainerRefreshState(containerId, false);
                delete MapState.containerRefreshRequests[containerId];
            }
        })
        .fail(function(xhr) {
            if (MapState.containerRefreshRequests[containerId] !== requestId) {
                return;
            }
            
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao buscar resultado do comando.';
            showToast('Erro', errorMsg, 'error');
            setContainerRefreshState(containerId, false);
            delete MapState.containerRefreshRequests[containerId];
        });
}

/**
 * Gerenciar estado visual do botão de refresh
 */
function setContainerRefreshState(containerId, isRefreshing) {
    if (!MapState.containerRefreshStatus) {
        MapState.containerRefreshStatus = {};
    }
    
    if (isRefreshing) {
        MapState.containerRefreshStatus[containerId] = true;
    } else {
        delete MapState.containerRefreshStatus[containerId];
    }
    
    // Atualizar botão no popup se estiver aberto
    const marker = MapState.containerMarkers[containerId];
    if (marker && marker.isPopupOpen()) {
        updateContainerPopup(containerId);
    }
}

/**
 * Aplicar dados retornados pelo comando ao estado local
 */
function applyContainerRefreshData(containerId, commandData) {
    if (!commandData) {
        return;
    }
    
    const container = MapState.containersData[containerId] || { container_id: containerId };
    
    if (commandData.container_type) {
        container.container_type = commandData.container_type;
    }
    
    let oldCoordX = container.coord_x;
    let oldCoordY = container.coord_y;
    let hasPositionChanged = false;
    let distanceMoved = 0;
    
    // Verificar se popup está aberto antes de qualquer atualização
    const marker = MapState.containerMarkers[containerId];
    const wasPopupOpen = marker && marker.isPopupOpen();
    
    if (commandData.position) {
        // Formato JSON do checkcontainer: {"x": leste-oeste, "z": altura, "y": norte-sul} (igual ao LootTracking.c)
        // Formato frontend: coord_x (leste-oeste), coord_y (norte-sul), coord_z (altura)
        const coordX = parseFloat(commandData.position.x);
        const coordY = parseFloat(commandData.position.y);  // y do JSON é norte-sul (PositionY no banco)
        const coordZ = parseFloat(commandData.position.z);  // z do JSON é altura (PositionZ no banco)
        
        if (!isNaN(coordX) && !isNaN(coordY)) {
            if (!isNaN(oldCoordX) && !isNaN(oldCoordY)) {
                distanceMoved = calculateDayZDistance(oldCoordX, oldCoordY, coordX, coordY);
                hasPositionChanged = distanceMoved > 100;
            }
        }
        
        if (!isNaN(coordX)) {
            container.coord_x = coordX;
        }
        if (!isNaN(coordY)) {
            container.coord_y = coordY;
        }
        if (!isNaN(coordZ)) {
            container.coord_z = coordZ;
        }
        
        const pixelCoords = dayzToPixelCoords(container.coord_x, container.coord_y);
        if (pixelCoords) {
            container.pixel_coords = pixelCoords;
            const mapCoords = convertToMapCoords(pixelCoords);
            if (mapCoords && marker) {
                // Preservar popup aberto antes de mover marcador
                const popupWasOpen = marker.isPopupOpen();
                marker.setLatLng(mapCoords);
                
                // Reabrir popup se estava aberto (setLatLng pode fechar)
                if (popupWasOpen && !marker.isPopupOpen()) {
                    setTimeout(function() {
                        if (marker && !marker.isPopupOpen()) {
                            marker.openPopup();
                        }
                    }, 50);
                }
                
                if (hasPositionChanged && wasPopupOpen && MapState.map) {
                    MapState.map.panTo(mapCoords, {
                        animate: true,
                        duration: 0.5
                    });
                    
                    if (distanceMoved > 0) {
                        const distanceKm = (distanceMoved / 1000).toFixed(2);
                        const distanceM = Math.round(distanceMoved);
                        const distanceText = distanceMoved >= 1000 ? `${distanceKm} km` : `${distanceM} m`;
                        showToast('Container Movido', `${container.container_type || containerId} se moveu ${distanceText}`, 'info');
                    }
                }
            }
        }
    }
    
    if (commandData.orientation) {
        container.orientation = commandData.orientation;
    }
    
    container.items = (commandData.items || []).map(function(item) {
        return {
            type: item.type || '',
            name: item.name || item.type || 'Item',
            img: item.img || '',
            health: item.health
        };
    });
    
    try {
        container.last_update = new Date().toLocaleString('pt-BR');
    } catch (e) {
        container.last_update = new Date().toISOString();
    }
    
    MapState.containersData[containerId] = container;
    
    MapState.previousContainersData[containerId] = {
        coord_x: container.coord_x,
        coord_y: container.coord_y,
        is_destroyed: container.is_destroyed || false,
        items: container.items
    };
    
    // Atualizar popup se estava aberto antes (preservar estado)
    if (marker && wasPopupOpen) {
        updateContainerPopup(containerId);
        
        // Garantir que popup permaneça aberto após atualização
        setTimeout(function() {
            if (marker && !marker.isPopupOpen()) {
                marker.openPopup();
            }
        }, 100);
    }
}

/**
 * Salvar dados do container no banco de dados
 */
function saveContainerCheckToDatabase(containerId, commandData) {
    if (!commandData || commandData.status !== 'success') {
        return;
    }
    
    $.ajax({
        url: `/api/containers/${containerId}/save-check`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            container_type: commandData.container_type || 'Container',
            position: commandData.position || {},
            items: commandData.items || []
        }),
        success: function(response) {
            if (response.success) {
                console.log(`Dados do container ${containerId} salvos no banco (tracking_id: ${response.container_tracking_id})`);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            console.error(`Erro ao salvar dados do container ${containerId} no banco:`, error.message || 'Erro desconhecido');
        }
    });
}

