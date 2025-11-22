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
    $.get('/api/containers/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateContainers(data);
        })
        .fail(function() {
            console.error('Erro ao carregar containers');
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
    
    console.log(`Containers atualizados: ${data.containers.length} containers`);
    
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
            <div class="mt-2" style="display: flex; gap: 4px; flex-wrap: nowrap;">
                <button type="button" class="btn btn-sm btn-primary" style="flex: 1; min-width: 0; font-size: 0.75rem; padding: 0.25rem 0.4rem;" onclick="toggleContainerTrail('${container.container_id}')">
                    <i class="fas fa-route me-1"></i><span id="containerTrailBtn_${container.container_id}">${MapState.containerTrails[container.container_id] ? 'Ocultar' : 'Trail'}</span>
                </button>
                <button type="button" class="btn btn-sm btn-info" style="flex: 1; min-width: 0; font-size: 0.75rem; padding: 0.25rem 0.4rem;" onclick="showContainerLootHistory('${container.container_id}')">
                    <i class="fas fa-history me-1"></i>Histórico
                </button>
                <button type="button" class="btn btn-sm btn-warning" style="flex: 1; min-width: 0; font-size: 0.75rem; padding: 0.25rem 0.4rem;" onclick="showContainerTeleportModal('${container.container_id}')">
                    <i class="fas fa-map-marker-alt me-1"></i>Teleportar
                </button>
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
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
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

