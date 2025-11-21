/**
 * Módulo de Veículos do Mapa
 * Lógica de veículos, trails e popups
 */

/**
 * Detectar mudanças em veículos
 */
function detectVehicleChanges(newData, oldData) {
    if (!MapState.showVehicles) return [];
    
    const changes = [];
    newData.vehicles.forEach(function(vehicle) {
        const vehicleId = vehicle.vehicle_id;
        const oldVehicle = oldData[vehicleId];
        
        if (!oldVehicle) {
            changes.push({
                type: 'new',
                vehicleId: vehicleId,
                vehicleName: vehicle.vehicle_name,
                message: `Novo veículo: ${vehicle.vehicle_name}`
            });
            return;
        }
        
        const changeMessages = [];
        
        if (oldVehicle.coord_x !== vehicle.coord_x || oldVehicle.coord_y !== vehicle.coord_y) {
            changeMessages.push('mudou de posição');
        }
        
        if (oldVehicle.is_destroyed !== vehicle.is_destroyed) {
            if (vehicle.is_destroyed) {
                changeMessages.push('foi destruído');
            } else {
                changeMessages.push('foi restaurado');
            }
        }
        
        const oldItemsCount = (oldVehicle.items || []).length;
        const newItemsCount = (vehicle.items || []).length;
        if (oldItemsCount !== newItemsCount) {
            changeMessages.push(`itens: ${oldItemsCount} → ${newItemsCount}`);
        }
        
        const oldAttachmentsCount = (oldVehicle.attachments || []).length;
        const newAttachmentsCount = (vehicle.attachments || []).length;
        if (oldAttachmentsCount !== newAttachmentsCount) {
            changeMessages.push(`anexos: ${oldAttachmentsCount} → ${newAttachmentsCount}`);
        }
        
        if (oldVehicle.engine_health !== vehicle.engine_health) {
            changeMessages.push(`motor: ${(oldVehicle.engine_health || 0).toFixed(1)} → ${(vehicle.engine_health || 0).toFixed(1)}`);
        }
        
        if (oldVehicle.body_health !== vehicle.body_health) {
            changeMessages.push(`carroceria: ${(oldVehicle.body_health || 0).toFixed(1)} → ${(vehicle.body_health || 0).toFixed(1)}`);
        }
        
        if (changeMessages.length > 0) {
            changes.push({
                type: 'change',
                vehicleId: vehicleId,
                vehicleName: vehicle.vehicle_name,
                message: `Veículo ${vehicle.vehicle_name}: ${changeMessages.join(', ')}`
            });
        }
    });
    
    return changes;
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
    // Detectar mudanças antes de atualizar
    if (Object.keys(MapState.previousVehiclesData).length > 0 && MapState.notificationsEnabled) {
        const vehicleChanges = detectVehicleChanges(data, MapState.previousVehiclesData);
        vehicleChanges.forEach(function(change) {
            showToast('Veículo', change.message, 'info');
            addNotificationToLog('info', `Veículo: ${change.message}`);
        });
    }
    
    // Limpar veículos antigos
    Object.keys(MapState.vehicleMarkers).forEach(function(key) {
        MapState.map.removeLayer(MapState.vehicleMarkers[key]);
    });
    MapState.vehicleMarkers = {};
    
    // Atualizar contador de veículos
    $('#vehicleCount').text(data.vehicles.length);
    
    if (!MapState.showVehicles) {
        // Salvar estado anterior mesmo se não estiver mostrando
        MapState.previousVehiclesData = {};
        data.vehicles.forEach(function(vehicle) {
            MapState.previousVehiclesData[vehicle.vehicle_id] = {
                coord_x: vehicle.coord_x,
                coord_y: vehicle.coord_y,
                is_destroyed: vehicle.is_destroyed,
                items: vehicle.items || [],
                attachments: vehicle.attachments || [],
                engine_health: vehicle.engine_health,
                body_health: vehicle.body_health
            };
        });
        return;
    }
    
    // Adicionar veículos
    data.vehicles.forEach(function(vehicle) {
        const vehicleId = vehicle.vehicle_id;
        const coords = convertToMapCoords(vehicle.pixel_coords);
        
        if (!coords) {
            return;
        }
        
        MapState.vehiclesData[vehicleId] = vehicle;
        
        const isDestroyed = vehicle.is_destroyed || false;
        const hasMoved = vehicle.has_moved || false;
        const marker = L.marker(coords, {
            icon: createVehicleIcon(hasMoved),
            opacity: isDestroyed ? 0.5 : 1.0
        }).addTo(MapState.map);
        
        const popupContent = createVehiclePopup(vehicle);
        const popupOffset = getPopupOffsetForPoint(coords[0], coords[1]);
        
        marker.bindPopup(popupContent, {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [60, 60],
            autoPanPaddingBottomRight: [60, 60],
            maxWidth: 300,
            maxHeight: 600,
            offset: popupOffset
        });
        
        MapState.vehicleMarkers[vehicleId] = marker;
    });
    
    console.log(`Veículos atualizados: ${data.vehicles.length} veículos`);
    
    // Recarregar trails de veículos que já estão ativos (para atualizar com novos dados)
    setTimeout(function() {
        Object.keys(MapState.vehicleTrails).forEach(function(vehicleId) {
            if (MapState.vehicleMarkers[vehicleId]) {
                loadVehicleTrail(vehicleId, true); // forceReload = true
            }
        });
    }, 500);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousVehiclesData = {};
    data.vehicles.forEach(function(vehicle) {
        MapState.previousVehiclesData[vehicle.vehicle_id] = {
            coord_x: vehicle.coord_x,
            coord_y: vehicle.coord_y,
            is_destroyed: vehicle.is_destroyed,
            items: vehicle.items || [],
            attachments: vehicle.attachments || [],
            engine_health: vehicle.engine_health,
            body_health: vehicle.body_health
        };
    });
}

/**
 * Carregar trail de um veículo
 */
function loadVehicleTrail(vehicleId, forceReload = false) {
    if (MapState.vehicleTrails[vehicleId] && !forceReload) {
        return; // Trail já carregado e não é recarregamento forçado
    }
    
    // Se forceReload, remover trail antigo antes de carregar novo
    if (forceReload && MapState.vehicleTrails[vehicleId]) {
        removeVehicleTrail(vehicleId);
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
 * Desenhar trail de um veículo
 */
function drawVehicleTrail(vehicleId, trail) {
    // Remover trail antigo se existir
    if (MapState.vehicleTrails[vehicleId]) {
        if (Array.isArray(MapState.vehicleTrails[vehicleId])) {
            MapState.vehicleTrails[vehicleId].forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(MapState.vehicleTrails[vehicleId]);
        }
    }
    
    MapState.vehicleTrails[vehicleId] = [];
    
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
        }).addTo(MapState.map);
        
        // Usar coordenadas originais para o tooltip
        const tooltipText = generateConsolidatedTooltip(processedTrail, 'vehicle', firstPoint.vehicle_name);
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip',
            maxWidth: 400
        });
        
        MapState.vehicleTrails[vehicleId].push(circleMarker);
    } else {
        // Objeto em movimento: criar polyline e círculos individuais
        const latlngs = processedTrail.map(item => item.mapCoords);
        const polyline = L.polyline(latlngs, {
            color: '#28a745',
            weight: 3,
            opacity: 0.7
        }).addTo(MapState.map);
        
        MapState.vehicleTrails[vehicleId].push(polyline);
        
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
            }).addTo(MapState.map);
            
            const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
            circleMarker.bindTooltip(tooltipText, {
                permanent: false,
                direction: tooltipDirection,
                className: 'trail-tooltip'
            });
            
            MapState.vehicleTrails[vehicleId].push(circleMarker);
        }
    }
}

/**
 * Remover trail de um veículo
 */
function removeVehicleTrail(vehicleId) {
    if (MapState.vehicleTrails[vehicleId]) {
        if (Array.isArray(MapState.vehicleTrails[vehicleId])) {
            MapState.vehicleTrails[vehicleId].forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(MapState.vehicleTrails[vehicleId]);
        }
        delete MapState.vehicleTrails[vehicleId];
    }
}

/**
 * Toggle trail de veículo
 */
function toggleVehicleTrail(vehicleId) {
    if (MapState.vehicleTrails[vehicleId]) {
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
        itemsHtml += '<div class="mt-2"><strong>📦 Itens:</strong><div class="mt-1" style="max-height: 150px; overflow-y: auto; padding-right: 4px;">';
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
        attachmentsHtml += '<div class="mt-2"><strong>🔧 Partes do Veículo:</strong><div class="mt-1" style="max-height: 150px; overflow-y: auto; padding-right: 4px;">';
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
        <div class="player-popup" style="display: flex; flex-direction: column; max-height: 580px;">
            <div style="flex: 1; overflow-y: auto; padding-right: 4px; min-height: 0;">
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
            </div>
            <div style="flex-shrink: 0; border-top: 1px solid #dee2e6; padding-top: 8px; margin-top: 8px; background-color: #fff;">
                <div class="info-row">
                    <button type="button" class="btn btn-sm btn-success me-2" onclick="toggleVehicleTrail('${vehicle.vehicle_id}')">
                        <i class="fas fa-route me-1"></i><span id="vehicleTrailBtn_${vehicle.vehicle_id}">${MapState.vehicleTrails[vehicle.vehicle_id] ? 'Ocultar Trail' : 'Mostrar Trail'}</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" onclick="showVehicleTeleportModal('${vehicle.vehicle_id}')">
                        <i class="fas fa-map-marker-alt me-1"></i>Teleportar
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Atualizar popup de veículo
 */
function updateVehiclePopup(vehicleId) {
    const marker = MapState.vehicleMarkers[vehicleId];
    if (!marker || !MapState.vehiclesData[vehicleId]) return;
    
    const vehicle = MapState.vehiclesData[vehicleId];
    const popupContent = createVehiclePopup(vehicle);
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
    }
}

/**
 * Toggle mostrar veículos
 */
function toggleVehiclesDisplay() {
    MapState.showVehicles = !MapState.showVehicles;
    
    if (MapState.showVehicles) {
        $('#toggleVehiclesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Veículos');
        loadVehicles();
    } else {
        $('#toggleVehiclesBtn').html('<i class="fas fa-car me-1"></i>Mostrar Veículos');
        // Remover todos os veículos
        Object.keys(MapState.vehicleMarkers).forEach(function(key) {
            MapState.map.removeLayer(MapState.vehicleMarkers[key]);
        });
        MapState.vehicleMarkers = {};
        
        // Limpar trails de veículos
        Object.keys(MapState.vehicleTrails).forEach(function(key) {
            const trail = MapState.vehicleTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.vehicleTrails = {};
        
        // Resetar contador de veículos
        $('#vehicleCount').text('0');
    }
}

