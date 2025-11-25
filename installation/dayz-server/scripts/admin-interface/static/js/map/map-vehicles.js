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
    
    // Adicionar indicador de loading no botão (apenas se não estiver já em loading)
    const btn = $('#toggleVehiclesBtn');
    if (!btn.prop('disabled') || !btn.html().includes('Carregando')) {
        btn.html('<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Carregando...').prop('disabled', true);
    }
    
    $.get('/api/vehicles/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateVehicles(data);
        })
        .fail(function() {
            console.error('Erro ao carregar veículos');
            // Restaurar botão em caso de erro
            if (MapState.showVehicles) {
                btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Veículos').prop('disabled', false);
            } else {
                btn.html('<i class="fas fa-car me-1"></i>Mostrar Veículos').prop('disabled', false);
            }
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
    
    // Rastrear quais popups estavam abertos antes de remover marcadores
    const openVehiclePopups = [];
    Object.keys(MapState.vehicleMarkers).forEach(function(key) {
        const marker = MapState.vehicleMarkers[key];
        if (marker && marker.isPopupOpen && marker.isPopupOpen()) {
            openVehiclePopups.push(key);
        }
    });
    
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
    
    // Aplicar filtro de veículos se houver filtros selecionados
    let vehiclesToShow = data.vehicles;
    if (MapState.selectedVehicleFilters.length > 0) {
        vehiclesToShow = data.vehicles.filter(function(vehicle) {
            return MapState.selectedVehicleFilters.includes(vehicle.vehicle_id);
        });
    }
    
    // Adicionar veículos
    vehiclesToShow.forEach(function(vehicle) {
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
            maxWidth: 420,
            maxHeight: 600,
            offset: popupOffset
        });
        
        MapState.vehicleMarkers[vehicleId] = marker;
    });
    
    // Reabrir popups que estavam abertos antes do auto-refresh
    if (openVehiclePopups.length > 0) {
        setTimeout(function() {
            openVehiclePopups.forEach(function(vehicleId) {
                const marker = MapState.vehicleMarkers[vehicleId];
                if (marker && !marker.isPopupOpen()) {
                    marker.openPopup();
                }
            });
        }, 100);
    }
    
    console.log(`Veículos atualizados: ${data.vehicles.length} veículos`);
    
    // Remover indicador de loading do botão (apenas se estiver desabilitado)
    const btn = $('#toggleVehiclesBtn');
    if (btn.prop('disabled') && btn.html().includes('Carregando')) {
        if (MapState.showVehicles) {
            btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Veículos').prop('disabled', false);
        } else {
            btn.html('<i class="fas fa-car me-1"></i>Mostrar Veículos').prop('disabled', false);
        }
    }
    
    // Atualizar badges de veículos selecionados (para mostrar nomes corretos)
    if (MapState.selectedVehicleFilters.length > 0) {
        updateSelectedVehiclesBadges();
    }
    
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
            // Atualizar popup mesmo em caso de erro para refletir o estado correto
            updateVehiclePopup(vehicleId);
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
        // Trail vazio: não há trail ativo, então atualizar popup para mostrar botão "Trail"
        updateVehiclePopup(vehicleId);
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
        // Trail processado vazio: não há trail ativo, então atualizar popup para mostrar botão "Trail"
        updateVehiclePopup(vehicleId);
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
    
    // Atualizar popup após o trail ser desenhado para refletir o estado do botão
    if (MapState.vehicleTrails[vehicleId] && MapState.vehicleTrails[vehicleId].length > 0) {
        updateVehiclePopup(vehicleId);
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
        // Atualizar popup para refletir que o trail foi removido
        updateVehiclePopup(vehicleId);
    } else {
        // O popup será atualizado automaticamente após o trail ser carregado
        loadVehicleTrail(vehicleId);
    }
}

/**
 * Solicitar refresh de informações do veículo via comando checkvehicle
 */
function refreshVehicleData(vehicleId) {
    if (!vehicleId) {
        return;
    }
    
    if (MapState.vehicleRefreshStatus && MapState.vehicleRefreshStatus[vehicleId]) {
        showToast('Info', 'Atualização já está em andamento para este veículo.', 'info');
        return;
    }
    
    const vehicle = MapState.vehiclesData[vehicleId];
    if (!vehicle) {
        showToast('Erro', 'Veículo não encontrado no mapa.', 'error');
        return;
    }
    
    const requestId = generateRequestId();
    if (!MapState.vehicleRefreshRequests) {
        MapState.vehicleRefreshRequests = {};
    }
    MapState.vehicleRefreshRequests[vehicleId] = requestId;
    
    setVehicleRefreshState(vehicleId, true);
    
    $.ajax({
        url: `/api/vehicles/${vehicleId}/refresh`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            request_id: requestId
        }),
        success: function() {
            showToast('Info', `Solicitação de atualização enviada para ${vehicle.vehicle_name || vehicleId}.`, 'info');
            startVehicleRefreshPolling(requestId, vehicleId, 0);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao solicitar atualização do veículo';
            showToast('Erro', errorMsg, 'error');
            setVehicleRefreshState(vehicleId, false);
            delete MapState.vehicleRefreshRequests[vehicleId];
        }
    });
}

/**
 * Polling para aguardar resultado do comando checkvehicle
 */
function startVehicleRefreshPolling(requestId, vehicleId, attempt) {
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 2000;
    
    if (MapState.vehicleRefreshRequests[vehicleId] !== requestId) {
        return;
    }
    
    if (attempt >= MAX_ATTEMPTS) {
        showToast('Aviso', 'Tempo limite ao atualizar dados do veículo.', 'warning');
        setVehicleRefreshState(vehicleId, false);
        delete MapState.vehicleRefreshRequests[vehicleId];
        return;
    }
    
    $.get(`/api/commands/results/${requestId}`)
        .done(function(response) {
            if (MapState.vehicleRefreshRequests[vehicleId] !== requestId) {
                return;
            }
            
            if (response.status === 'ready') {
                const data = response.data || {};
                if (data.status === 'success') {
                    // Verificar se popup estava aberto antes de atualizar
                    const marker = MapState.vehicleMarkers[vehicleId];
                    const wasPopupOpen = marker && marker.isPopupOpen();
                    
                    applyVehicleRefreshData(vehicleId, data);
                    
                    // Salvar no banco de dados (silenciosamente)
                    saveVehicleCheckToDatabase(vehicleId, data);
                    
                    // Reabrir popup se estava aberto antes (usar delay maior para garantir que setPopupContent terminou)
                    if (wasPopupOpen && marker) {
                        setTimeout(function() {
                            if (marker && !marker.isPopupOpen()) {
                                marker.openPopup();
                            }
                        }, 200);
                    }
                    
                    const vehicleName = (MapState.vehiclesData[vehicleId] && MapState.vehiclesData[vehicleId].vehicle_name) || vehicleId;
                    showToast('Sucesso', `Dados do veículo ${vehicleName} atualizados.`, 'success');
                } else {
                    const errorMsg = data.message || 'Não foi possível atualizar os dados do veículo.';
                    showToast('Aviso', errorMsg, 'warning');
                }
                
                setVehicleRefreshState(vehicleId, false);
                delete MapState.vehicleRefreshRequests[vehicleId];
            } else if (response.status === 'not_found' || response.status === 'processing') {
                setTimeout(function() {
                    startVehicleRefreshPolling(requestId, vehicleId, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                const errorMsg = response.message || 'Erro ao consultar resultado do comando.';
                showToast('Erro', errorMsg, 'error');
                setVehicleRefreshState(vehicleId, false);
                delete MapState.vehicleRefreshRequests[vehicleId];
            }
        })
        .fail(function(xhr) {
            if (MapState.vehicleRefreshRequests[vehicleId] !== requestId) {
                return;
            }
            
            if (attempt < 5) {
                setTimeout(function() {
                    startVehicleRefreshPolling(requestId, vehicleId, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                const error = xhr.responseJSON || {};
                const errorMsg = error.message || error.error || 'Erro ao consultar resultado da atualização do veículo.';
                showToast('Erro', errorMsg, 'error');
                setVehicleRefreshState(vehicleId, false);
                delete MapState.vehicleRefreshRequests[vehicleId];
            }
        });
}

/**
 * Controlar estado visual do botão de refresh
 */
function setVehicleRefreshState(vehicleId, isRefreshing) {
    if (!MapState.vehicleRefreshStatus) {
        MapState.vehicleRefreshStatus = {};
    }
    
    if (isRefreshing) {
        MapState.vehicleRefreshStatus[vehicleId] = true;
    } else {
        delete MapState.vehicleRefreshStatus[vehicleId];
    }
    
    const button = document.getElementById(`vehicleRefreshBtn_${vehicleId}`);
    if (button) {
        if (isRefreshing) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...';
        } else {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Atualizar';
        }
    }
}

/**
 * Salvar dados do checkvehicle no banco de dados
 */
function saveVehicleCheckToDatabase(vehicleId, commandData) {
    if (!commandData || commandData.status !== 'success') {
        return;
    }
    
    // Preparar dados para enviar ao endpoint
    const saveData = {
        vehicle_name: commandData.vehicle_name || 'Veículo',
        position: commandData.position || {},
        items: commandData.items || [],
        attachments: commandData.attachments || [],
        health_parts: commandData.health_parts || {}
    };
    
    // Chamar endpoint de forma assíncrona (não bloquear UI)
    $.ajax({
        url: `/api/vehicles/${vehicleId}/save-check`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(saveData),
        success: function(response) {
            // Sucesso silencioso (não precisa mostrar toast)
            console.log(`Dados do veículo ${vehicleId} salvos no banco`);
        },
        error: function(xhr) {
            // Erro silencioso (não bloquear atualização visual)
            console.warn(`Erro ao salvar dados do veículo ${vehicleId} no banco:`, xhr.responseJSON || xhr.statusText);
        }
    });
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
 * Aplicar dados retornados pelo comando ao estado local
 */
function applyVehicleRefreshData(vehicleId, commandData) {
    if (!commandData) {
        return;
    }
    
    const vehicle = MapState.vehiclesData[vehicleId] || { vehicle_id: vehicleId };
    
    if (commandData.vehicle_name) {
        vehicle.vehicle_name = commandData.vehicle_name;
    }
    
    let oldCoordX = vehicle.coord_x;
    let oldCoordY = vehicle.coord_y;
    let hasPositionChanged = false;
    let distanceMoved = 0;
    
    if (commandData.position) {
        // Formato JSON do checkvehicle: {"x": leste-oeste, "z": altura, "y": norte-sul} (igual ao VehicleTracking.c)
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
            vehicle.coord_x = coordX;
        }
        if (!isNaN(coordY)) {
            vehicle.coord_y = coordY;
        }
        if (!isNaN(coordZ)) {
            vehicle.coord_z = coordZ;
        }
        
        const pixelCoords = dayzToPixelCoords(vehicle.coord_x, vehicle.coord_y);
        if (pixelCoords) {
            vehicle.pixel_coords = pixelCoords;
            const mapCoords = convertToMapCoords(pixelCoords);
            if (mapCoords && MapState.vehicleMarkers[vehicleId]) {
                MapState.vehicleMarkers[vehicleId].setLatLng(mapCoords);
                
                const marker = MapState.vehicleMarkers[vehicleId];
                if (hasPositionChanged && marker && marker.isPopupOpen() && MapState.map) {
                    MapState.map.panTo(mapCoords, {
                        animate: true,
                        duration: 0.5
                    });
                    
                    if (distanceMoved > 0) {
                        const distanceKm = (distanceMoved / 1000).toFixed(2);
                        const distanceM = Math.round(distanceMoved);
                        const distanceText = distanceMoved >= 1000 ? `${distanceKm} km` : `${distanceM} m`;
                        showToast('Veículo Movido', `${vehicle.vehicle_name || vehicleId} se moveu ${distanceText}`, 'info');
                    }
                }
            }
        }
    }
    
    vehicle.items = (commandData.items || []).map(function(item) {
        return {
            type: item.type || '',
            name: item.name || item.type || 'Item',
            img: item.img || '',
            health: item.health
        };
    });
    
    vehicle.attachments = (commandData.attachments || []).map(function(attachment) {
        return {
            type: attachment.type || '',
            name: attachment.name || attachment.type || 'Parte',
            img: attachment.img || '',
            health: attachment.health
        };
    });
    
    if (commandData.health_parts) {
        vehicle.health_parts = commandData.health_parts;
    }
    
    try {
        vehicle.last_update = new Date().toLocaleString('pt-BR');
    } catch (e) {
        vehicle.last_update = new Date().toISOString();
    }
    
    MapState.vehiclesData[vehicleId] = vehicle;
    
    MapState.previousVehiclesData[vehicleId] = {
        coord_x: vehicle.coord_x,
        coord_y: vehicle.coord_y,
        is_destroyed: vehicle.is_destroyed || false,
        items: vehicle.items,
        attachments: vehicle.attachments,
        engine_health: vehicle.health_parts ? vehicle.health_parts.engine : null,
        body_health: vehicle.health_parts ? vehicle.health_parts.body : null
    };
    
    // Atualizar popup apenas se estiver aberto (evita fechar)
    const marker = MapState.vehicleMarkers[vehicleId];
    if (marker && marker.isPopupOpen()) {
        updateVehiclePopup(vehicleId);
    }
}

/**
 * Formatar data para exibição no popup
 */
function formatVehicleDate(dateStr) {
    if (!dateStr) return 'Desconhecido';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return dateStr;
        }
        return date.toLocaleString('pt-BR');
    } catch (e) {
        return dateStr;
    }
}

/**
 * Criar popup de veículo
 */
function createVehiclePopup(vehicle) {
    let itemsHtml = '';
    const items = vehicle.items || [];
    const isRefreshing = MapState.vehicleRefreshStatus && MapState.vehicleRefreshStatus[vehicle.vehicle_id];
    
    const itemsUpdateDate = vehicle.items_attachments_last_update ? formatVehicleDate(vehicle.items_attachments_last_update) : null;
    const itemsUpdateText = itemsUpdateDate ? ` <small class="text-muted">(atualizado: ${itemsUpdateDate})</small>` : '';
    
    if (items.length > 0) {
        itemsHtml += `<div class="mt-2"><strong>📦 Itens:${itemsUpdateText}</strong><div class="mt-1" style="max-height: 150px; overflow-y: auto; padding-right: 4px;">`;
        items.forEach(function(item) {
            const imgTag = item.img ? `<img src="${item.img}" onerror="this.style.display='none'" style="width: 24px; height: 24px; margin-right: 4px; vertical-align: middle;">` : '';
            const healthText = item.health ? ` (HP: ${item.health.toFixed(2)})` : '';
            itemsHtml += `<div class="item-display">${imgTag}<span>${item.name || item.type}${healthText}</span></div>`;
        });
        itemsHtml += '</div></div>';
    } else {
        itemsHtml = `<div class="text-muted mt-2">Nenhum item no inventário${itemsUpdateText}</div>`;
    }
    
    let attachmentsHtml = '';
    const attachments = vehicle.attachments || [];
    const attachmentsUpdateDate = vehicle.items_attachments_last_update ? formatVehicleDate(vehicle.items_attachments_last_update) : null;
    const attachmentsUpdateText = attachmentsUpdateDate ? ` <small class="text-muted">(atualizado: ${attachmentsUpdateDate})</small>` : '';
    
    if (attachments.length > 0) {
        attachmentsHtml += `<div class="mt-2"><strong>🔧 Partes do Veículo:${attachmentsUpdateText}</strong><div class="mt-1" style="max-height: 150px; overflow-y: auto; padding-right: 4px;">`;
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
                <div class="info-row">
                    <span class="info-label">📍 Coordenadas atualizadas:</span>
                    <span class="info-value">${formatVehicleDate(vehicle.coordinates_last_update || vehicle.TimeStamp || vehicle.last_update)}</span>
                </div>
                ${healthPartsHtml}
                ${itemsHtml}
                ${attachmentsHtml}
                ${destroyedInfo}
            </div>
            <div style="flex-shrink: 0; border-top: 1px solid #dee2e6; padding-top: 8px; margin-top: 8px; background-color: #fff;">
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" id="vehicleRefreshBtn_${vehicle.vehicle_id}" ${isRefreshing ? 'disabled' : ''} onclick="refreshVehicleData('${vehicle.vehicle_id}')">
                        ${isRefreshing ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...' : '<i class="fas fa-sync-alt me-1"></i>Atualizar'}
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="toggleVehicleTrail('${vehicle.vehicle_id}')">
                        <i class="fas fa-route me-1"></i><span id="vehicleTrailBtn_${vehicle.vehicle_id}">${MapState.vehicleTrails[vehicle.vehicle_id] ? 'Ocultar' : 'Trail'}</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-info" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="showVehicleLootHistory('${vehicle.vehicle_id}')">
                        <i class="fas fa-history me-1"></i>Histórico
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" style="flex: 1 1 calc(50% - 3px); min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.5rem;" onclick="showVehicleTeleportModal('${vehicle.vehicle_id}')">
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
    
    // Atualizar visibilidade dos badges
    if (typeof updateBadgesVisibility === 'function') {
        updateBadgesVisibility();
    }
}

/**
 * Buscar veículos para filtro
 */
function handleVehicleSearch() {
    const searchTerm = $('#vehicleSearchInput').val().toLowerCase().trim();
    const resultsContainer = $('#vehicleSearchResults');
    
    if (searchTerm === '') {
        resultsContainer.hide();
        return;
    }
    
    // Filtrar veículos que correspondem à pesquisa
    const matchingVehicles = Object.keys(MapState.vehiclesData)
        .filter(vehicleId => {
            const vehicle = MapState.vehiclesData[vehicleId];
            const name = (vehicle.vehicle_name || '').toLowerCase();
            
            // Não mostrar veículos já selecionados
            if (MapState.selectedVehicleFilters.includes(vehicleId)) {
                return false;
            }
            
            return name.includes(searchTerm) || 
                   vehicleId.toLowerCase().includes(searchTerm);
        })
        .slice(0, 10); // Limitar a 10 resultados
    
    if (matchingVehicles.length === 0) {
        resultsContainer.html('<div class="list-group-item text-muted">Nenhum veículo encontrado</div>');
        resultsContainer.show();
        return;
    }
    
    // Renderizar resultados
    resultsContainer.empty();
    matchingVehicles.forEach(vehicleId => {
        const vehicle = MapState.vehiclesData[vehicleId];
        if (!vehicle) {
            return; // Pular se veículo não estiver carregado
        }
        
        const vehicleName = vehicle.vehicle_name || '';
        // Sempre mostrar nome (ID), exceto se o nome for vazio ou igual ao ID
        let displayName;
        if (vehicleName && vehicleName.trim() !== '' && vehicleName !== vehicleId) {
            displayName = `${vehicleName} (${vehicleId})`;
        } else {
            displayName = vehicleId;
        }
        
        const statusIcon = vehicle.is_destroyed ? '🔴' : '🟢';
        
        const item = $('<div class="list-group-item"></div>')
            .html(`${statusIcon} ${displayName}`)
            .on('click', function() {
                addVehicleToFilter(vehicleId);
            });
        
        resultsContainer.append(item);
    });
    
    resultsContainer.show();
}

/**
 * Adicionar veículo ao filtro
 */
function addVehicleToFilter(vehicleId) {
    if (MapState.selectedVehicleFilters.includes(vehicleId)) {
        return;
    }
    
    MapState.selectedVehicleFilters.push(vehicleId);
    
    // Limpar campo de pesquisa
    $('#vehicleSearchInput').val('');
    $('#vehicleSearchResults').hide();
    
    // Atualizar UI
    updateSelectedVehiclesBadges();
    
    // Aplicar filtro
    filterVehicles();
}

/**
 * Remover veículo do filtro
 */
function removeVehicleFromFilter(vehicleId) {
    const index = MapState.selectedVehicleFilters.indexOf(vehicleId);
    if (index > -1) {
        MapState.selectedVehicleFilters.splice(index, 1);
    }
    
    // Atualizar UI
    updateSelectedVehiclesBadges();
    
    // Aplicar filtro
    filterVehicles();
}

/**
 * Atualizar badges de veículos selecionados
 */
function updateSelectedVehiclesBadges() {
    const container = $('#selectedVehiclesBadges');
    container.empty();
    
    if (MapState.selectedVehicleFilters.length === 0) {
        $('#clearAllVehicleFiltersBtn').hide();
        return;
    }
    
    $('#clearAllVehicleFiltersBtn').show();
    
    MapState.selectedVehicleFilters.forEach(vehicleId => {
        const vehicle = MapState.vehiclesData[vehicleId];
        if (!vehicle) {
            // Se veículo ainda não foi carregado, mostrar apenas o ID
            const badge = $('<span class="badge bg-info me-1 mb-1"></span>')
                .html(`🟢 ${vehicleId} <i class="fas fa-times remove-vehicle"></i>`)
                .find('.remove-vehicle')
                .on('click', function(e) {
                    e.stopPropagation();
                    removeVehicleFromFilter(vehicleId);
                })
                .end();
            container.append(badge);
            return;
        }
        
        const vehicleName = vehicle.vehicle_name || '';
        // Sempre mostrar nome (ID), exceto se o nome for vazio ou igual ao ID
        let displayName;
        if (vehicleName && vehicleName.trim() !== '' && vehicleName !== vehicleId) {
            displayName = `${vehicleName} (${vehicleId})`;
        } else {
            displayName = vehicleId;
        }
        
        const statusIcon = vehicle.is_destroyed ? '🔴' : '🟢';
        
        const badge = $('<span class="badge bg-info me-1 mb-1"></span>')
            .html(`${statusIcon} ${displayName} <i class="fas fa-times remove-vehicle"></i>`)
            .find('.remove-vehicle')
            .on('click', function(e) {
                e.stopPropagation();
                removeVehicleFromFilter(vehicleId);
            })
            .end();
        
        container.append(badge);
    });
}

/**
 * Limpar todos os filtros de veículos
 */
function clearAllVehicleFilters() {
    MapState.selectedVehicleFilters = [];
    updateSelectedVehiclesBadges();
    filterVehicles();
}

/**
 * Filtrar veículos
 */
function filterVehicles() {
    // Recarregar veículos para aplicar filtro
    if (MapState.showVehicles) {
        loadVehicles();
    }
}

/**
 * Carregar histórico de loot do veículo com filtros e paginação
 */
function loadVehicleHistory(vehicleId, offset = 0, dateFrom = null, dateTo = null) {
    MapState.currentHistoryType = 'vehicle';
    MapState.currentHistoryId = vehicleId;
    MapState.currentHistoryPagination.offset = offset;
    MapState.currentHistoryPagination.date_from = dateFrom;
    MapState.currentHistoryPagination.date_to = dateTo;
    
    const params = {
        limit: MapState.currentHistoryPagination.limit,
        offset: offset,
        per_page: MapState.currentHistoryPagination.limit,
        page: Math.floor(offset / MapState.currentHistoryPagination.limit) + 1
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    
    console.log('Carregando histórico de loot do veículo:', vehicleId, params);
    $.get(`/api/vehicles/${vehicleId}/history`, params)
        .done(function(data) {
            console.log('Histórico do veículo recebido:', vehicleId, data);
            showVehicleHistoryModal(vehicleId, data.history || [], data.pagination || { total: data.history ? data.history.length : 0, limit: params.limit, offset: offset, has_more: false });
        })
        .fail(function(xhr, status, error) {
            console.error('Erro ao carregar histórico de loot do veículo:', vehicleId, status, error, xhr.responseText);
        });
}

/**
 * Mostrar histórico de loot do veículo
 */
function showVehicleLootHistory(vehicleId) {
    loadVehicleHistory(vehicleId, 0, null, null);
}

/**
 * Filtrar histórico de veículo para mostrar apenas alterações (igual a containers)
 */
function filterVehicleHistoryByChanges(history) {
    if (!history || history.length === 0) {
        return [];
    }
    
    const filtered = [];
    let prevItemsState = null;
    let prevAttachmentsState = null;
    
    // Ordenar por timestamp DESC (mais recente primeiro) e depois inverter para comparar
    const sortedHistory = [...history].sort((a, b) => {
        const timeA = new Date(a.TimeStamp || a.timestamp || 0);
        const timeB = new Date(b.TimeStamp || b.timestamp || 0);
        return timeB - timeA;
    }).reverse();
    
    for (let i = 0; i < sortedHistory.length; i++) {
        const point = sortedHistory[i];
        
        // Criar hash dos itens e attachments (similar ao backend de containers)
        const items = point.items || [];
        const attachments = point.attachments || [];
        
        // Ordenar itens por tipo e health
        const itemsSorted = [...items].sort((a, b) => {
            const typeA = (a.type || a.ItemType || '').toLowerCase();
            const typeB = (b.type || b.ItemType || '').toLowerCase();
            if (typeA !== typeB) return typeA.localeCompare(typeB);
            const healthA = (a.health || a.ItemHealth || 0);
            const healthB = (b.health || b.ItemHealth || 0);
            return healthA - healthB;
        });
        
        const itemsTuple = itemsSorted.map(item => ({
            type: item.type || item.ItemType || '',
            health: item.health || item.ItemHealth || null
        }));
        
        // Ordenar attachments por tipo e health
        const attachmentsSorted = [...attachments].sort((a, b) => {
            const typeA = (a.type || a.AttachmentType || '').toLowerCase();
            const typeB = (b.type || b.AttachmentType || '').toLowerCase();
            if (typeA !== typeB) return typeA.localeCompare(typeB);
            const healthA = (a.health || a.AttachmentHealth || 0);
            const healthB = (b.health || b.AttachmentHealth || 0);
            return healthA - healthB;
        });
        
        const attachmentsTuple = attachmentsSorted.map(attach => ({
            type: attach.type || attach.AttachmentType || '',
            health: attach.health || attach.AttachmentHealth || null
        }));
        
        // Comparar estados de items e attachments
        const itemsChanged = JSON.stringify(itemsTuple) !== JSON.stringify(prevItemsState);
        const attachmentsChanged = JSON.stringify(attachmentsTuple) !== JSON.stringify(prevAttachmentsState);
        
        // Se houve mudança em items ou attachments, adicionar ao resultado
        if (prevItemsState === null || prevAttachmentsState === null || itemsChanged || attachmentsChanged) {
            filtered.push(point);
            prevItemsState = itemsTuple;
            prevAttachmentsState = attachmentsTuple;
        }
    }
    
    // Reverter para ordem DESC (mais recente primeiro)
    return filtered.reverse();
}

/**
 * Exibir modal com histórico de loot do veículo
 */
function showVehicleHistoryModal(vehicleId, history, pagination) {
    const vehicle = MapState.vehiclesData[vehicleId];
    if (!vehicle) return;
    
    // Filtrar histórico para mostrar apenas alterações (igual a containers)
    const filteredHistory = filterVehicleHistoryByChanges(history);
    const filteredTotal = filteredHistory.length;
    
    const modalTitle = document.getElementById('trailHistoryModalTitle');
    const modalBody = document.getElementById('trailHistoryModalBody');
    
    modalTitle.innerHTML = `<i class="fas fa-car me-2"></i>Histórico de Loot - ${vehicle.vehicle_name || 'Veículo'}`;
    
    // Formatar data para input type="date"
    function formatDateForInput(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    }
    
    let html = `<div class="trail-history-container">`;
    html += `<div class="mb-3"><strong>ID:</strong> ${vehicleId}</div>`;
    html += `<div class="mb-3"><strong>Coordenadas:</strong> X=${vehicle.coord_x.toFixed(1)}, Y=${vehicle.coord_y.toFixed(1)}</div>`;
    
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
    const totalPages = Math.ceil(filteredTotal / (pagination.limit || 10));
    const currentPage = Math.floor((pagination.offset || 0) / (pagination.limit || 10)) + 1;
    
    html += `<div class="d-flex justify-content-between align-items-center mb-3">`;
    html += `<div><strong>Total de eventos (sem duplicados):</strong> ${filteredTotal}</div>`;
    html += `<div>`;
    if ((pagination.offset || 0) > 0) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="loadHistoryPage(${(pagination.offset || 0) - (pagination.limit || 10)})">Anterior</button>`;
    }
    html += `<span class="mx-2">Página ${currentPage} de ${totalPages || 1}</span>`;
    if (pagination.has_more || (history.length >= (pagination.limit || 10))) {
        html += `<button type="button" class="btn btn-sm btn-outline-primary ms-1" onclick="loadHistoryPage(${(pagination.offset || 0) + (pagination.limit || 10)})">Próxima</button>`;
    }
    html += `</div>`;
    html += `</div>`;
    
    html += `<div class="trail-timeline" style="max-height: 500px; overflow-y: auto;">`;
    
    if (filteredHistory.length === 0) {
        html += `<div class="text-muted text-center py-4">Nenhum evento encontrado</div>`;
    } else {
        // Timeline reversa (mais recente primeiro)
        for (let i = 0; i < filteredHistory.length; i++) {
            const point = filteredHistory[i];
            html += `<div class="trail-timeline-item" style="border-left: 3px solid #${i === 0 ? '4caf50' : '007bff'}; padding-left: 15px; margin-bottom: 20px;">`;
            html += `<strong>${point.TimeStamp || point.timestamp || 'Sem data'}</strong><br>`;
            html += `📍 Coords: X=${(point.PositionX || point.coord_x || 0).toFixed(1)}, Y=${(point.PositionY || point.coord_y || 0).toFixed(1)}`;
            
            // Processar items e attachments
            const items = point.items || [];
            const attachments = point.attachments || [];
            
            if (items.length > 0 || attachments.length > 0) {
                if (items.length > 0) {
                    html += `<br><strong>📦 Itens (${items.length}):</strong><br>`;
                    html += `<div class="container-items-list" style="margin-top: 8px;">`;
                    items.forEach(function(item) {
                        const itemType = item.type || item.ItemType || '';
                        const itemHealth = item.health || item.ItemHealth || '';
                        const healthText = itemHealth ? ` (HP: ${itemHealth})` : '';
                        html += `<div class="mb-1"><span>${itemType}${healthText}</span></div>`;
                    });
                    html += `</div>`;
                }
                
                if (attachments.length > 0) {
                    html += `<br><strong>🔧 Anexos (${attachments.length}):</strong><br>`;
                    html += `<div class="container-items-list" style="margin-top: 8px;">`;
                    attachments.forEach(function(attachment) {
                        const attachType = attachment.type || attachment.AttachmentType || '';
                        const attachHealth = attachment.health || attachment.AttachmentHealth || '';
                        const healthText = attachHealth ? ` (HP: ${attachHealth})` : '';
                        html += `<div class="mb-1"><span>${attachType}${healthText}</span></div>`;
                    });
                    html += `</div>`;
                }
            } else {
                html += `<br><span class="text-muted">Veículo vazio</span>`;
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

