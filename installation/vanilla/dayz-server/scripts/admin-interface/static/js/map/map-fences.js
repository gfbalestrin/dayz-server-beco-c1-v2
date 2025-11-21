/**
 * Módulo de Construções (Fences) do Mapa
 * Lógica de fences, watchtowers, flags e histórico
 */

/**
 * Detectar mudanças em construções (fences, watchtowers, flags)
 */
function detectFenceChanges(newData, oldData) {
    if (!MapState.showFences) return [];
    
    const changes = [];
    newData.fences.forEach(function(fence) {
        const fenceId = fence.fence_id;
        const oldFence = oldData[fenceId];
        
        if (!oldFence) {
            const structureType = fence.structure_type || 'fence';
            const structureName = structureType === 'watchtower' ? 'Watchtower' : (structureType === 'flag' ? 'Flag Pole' : 'Fence');
            changes.push({
                type: 'new',
                fenceId: fenceId,
                structureType: structureType,
                message: `Nova construção: ${structureName}`
            });
            return;
        }
        
        const changeMessages = [];
        const structureType = fence.structure_type || 'fence';
        
        if (oldFence.coord_x !== fence.coord_x || oldFence.coord_y !== fence.coord_y) {
            changeMessages.push('mudou de posição');
        }
        
        if (oldFence.is_destroyed !== fence.is_destroyed) {
            if (fence.is_destroyed) {
                changeMessages.push('foi destruída');
            } else {
                changeMessages.push('foi restaurada');
            }
        }
        
        if (structureType === 'fence') {
            if (oldFence.has_base !== fence.has_base) {
                changeMessages.push(fence.has_base ? 'base construída' : 'base removida');
            }
            if (oldFence.lower_panel_built !== fence.lower_panel_built) {
                changeMessages.push(fence.lower_panel_built ? 'painel inferior construído' : 'painel inferior removido');
            }
            if (oldFence.upper_panel_built !== fence.upper_panel_built) {
                changeMessages.push(fence.upper_panel_built ? 'painel superior construído' : 'painel superior removido');
            }
        } else if (structureType === 'watchtower') {
            const oldDetails = oldFence.watchtower_details || {};
            const newDetails = fence.watchtower_details || {};
            
            if (oldDetails.has_base !== newDetails.has_base) {
                changeMessages.push(newDetails.has_base ? 'base construída' : 'base removida');
            }
            if (oldDetails.level_1_base !== newDetails.level_1_base) {
                changeMessages.push(newDetails.level_1_base ? 'nível 1 construído' : 'nível 1 removido');
            }
            if (oldDetails.level_2_base !== newDetails.level_2_base) {
                changeMessages.push(newDetails.level_2_base ? 'nível 2 construído' : 'nível 2 removido');
            }
            if (oldDetails.level_3_base !== newDetails.level_3_base) {
                changeMessages.push(newDetails.level_3_base ? 'nível 3 construído' : 'nível 3 removido');
            }
            if (oldDetails.has_roof !== newDetails.has_roof) {
                changeMessages.push(newDetails.has_roof ? 'telhado construído' : 'telhado removido');
            }
        } else if (structureType === 'flag') {
            const oldDetails = oldFence.flag_details || {};
            const newDetails = fence.flag_details || {};
            
            if (oldDetails.has_base !== newDetails.has_base) {
                changeMessages.push(newDetails.has_base ? 'suporte construído' : 'suporte removido');
            }
            if (oldDetails.has_flag_base !== newDetails.has_flag_base) {
                changeMessages.push(newDetails.has_flag_base ? 'bandeira anexada' : 'bandeira removida');
            }
            if (oldDetails.flag_raised !== newDetails.flag_raised) {
                changeMessages.push(newDetails.flag_raised ? 'bandeira hasteada' : 'bandeira abaixada');
            }
            if (oldDetails.flag_height !== newDetails.flag_height) {
                const oldHeight = oldDetails.flag_height || 0;
                const newHeight = newDetails.flag_height || 0;
                changeMessages.push(`altura: ${oldHeight.toFixed(2)}m → ${newHeight.toFixed(2)}m`);
            }
        }
        
        if (changeMessages.length > 0) {
            const structureName = structureType === 'watchtower' ? 'Watchtower' : (structureType === 'flag' ? 'Flag Pole' : 'Fence');
            changes.push({
                type: 'change',
                fenceId: fenceId,
                structureType: structureType,
                message: `${structureName}: ${changeMessages.join(', ')}`
            });
        }
    });
    
    return changes;
}

/**
 * Carregar posições de fences (construções)
 */
function loadFences() {
    if (!MapState.showFences) {
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
 * Atualizar fences no mapa
 */
function updateFences(data) {
    // Detectar mudanças antes de atualizar
    if (Object.keys(MapState.previousFencesData).length > 0 && MapState.notificationsEnabled) {
        const fenceChanges = detectFenceChanges(data, MapState.previousFencesData);
        fenceChanges.forEach(function(change) {
            showToast('Construção', change.message, 'info');
            addNotificationToLog('info', `Construção: ${change.message}`);
        });
    }
    
    // Limpar fences antigos
    Object.keys(MapState.fenceMarkers).forEach(function(key) {
        const marker = MapState.fenceMarkers[key];
        if (marker) {
            MapState.map.removeLayer(marker);
        }
    });
    MapState.fenceMarkers = {};
    
    // Atualizar contador de fences
    $('#fenceCount').text(data.fences.length);
    
    if (!MapState.showFences) {
        // Salvar estado anterior mesmo se não estiver mostrando
        MapState.previousFencesData = {};
        data.fences.forEach(function(fence) {
            MapState.previousFencesData[fence.fence_id] = {
                coord_x: fence.coord_x,
                coord_y: fence.coord_y,
                is_destroyed: fence.is_destroyed,
                has_base: fence.has_base,
                lower_panel_built: fence.lower_panel_built,
                upper_panel_built: fence.upper_panel_built,
                structure_type: fence.structure_type,
                watchtower_details: fence.watchtower_details || {},
                flag_details: fence.flag_details || {}
            };
        });
        return;
    }
    
    // Adicionar fences
    data.fences.forEach(function(fence) {
        const fenceId = fence.fence_id;
        const coords = convertToMapCoords(fence.pixel_coords);
        
        if (!coords) {
            return;
        }
        
        MapState.fencesData[fenceId] = fence;
        
        const isDestroyed = fence.is_destroyed || false;
        const hasRecentAttack = fence.has_recent_attack || false;
        const marker = L.marker(coords, {
            icon: createFenceIcon(fence, hasRecentAttack),
            opacity: isDestroyed ? 0.5 : 1.0,
            zIndexOffset: hasRecentAttack ? 1000 : 0
        }).addTo(MapState.map);
        
        const popupContent = createFencePopup(fence);
        const popupOffset = getPopupOffsetForPoint(coords[0], coords[1]);
        
        marker.bindPopup(popupContent, {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [60, 60],
            autoPanPaddingBottomRight: [60, 60],
            maxWidth: 300,
            maxHeight: 500,
            offset: popupOffset
        });
        
        
        MapState.fenceMarkers[fenceId] = marker;
    });
    
    console.log(`Fences atualizados: ${data.fences.length} fences`);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousFencesData = {};
    data.fences.forEach(function(fence) {
        MapState.previousFencesData[fence.fence_id] = {
            coord_x: fence.coord_x,
            coord_y: fence.coord_y,
            is_destroyed: fence.is_destroyed,
            has_base: fence.has_base,
            lower_panel_built: fence.lower_panel_built,
            upper_panel_built: fence.upper_panel_built,
            structure_type: fence.structure_type,
            watchtower_details: fence.watchtower_details || {},
            flag_details: fence.flag_details || {}
        };
    });
}

/**
 * Carregar trail de uma fence
 */
function loadFenceTrail(fenceId) {
    loadFenceHistory(fenceId, 0, null, null);
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
    const marker = MapState.fenceMarkers[fenceId];
    if (!marker || !MapState.fencesData[fenceId]) return;
    
    const fence = MapState.fencesData[fenceId];
    const popupContent = createFencePopup(fence);
    
    if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
    }
}

/**
 * Toggle mostrar fences
 */
function toggleFencesDisplay() {
    MapState.showFences = !MapState.showFences;
    
    if (MapState.showFences) {
        $('#toggleFencesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Construções');
        loadFences();
    } else {
        $('#toggleFencesBtn').html('<i class="fas fa-home me-1"></i>Mostrar Construções');
        // Remover todos os fences
        Object.keys(MapState.fenceMarkers).forEach(function(key) {
            MapState.map.removeLayer(MapState.fenceMarkers[key]);
        });
        MapState.fenceMarkers = {};
        
        // Limpar trails de fences
        Object.keys(MapState.fenceTrails).forEach(function(key) {
            const trail = MapState.fenceTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.fenceTrails = {};
        
        // Resetar contador de fences
        $('#fenceCount').text('0');
    }
}

/**
 * Carregar histórico da fence com filtros e paginação
 */
function loadFenceHistory(fenceId, offset = 0, dateFrom = null, dateTo = null) {
    MapState.currentHistoryType = 'fence';
    MapState.currentHistoryId = fenceId;
    MapState.currentHistoryPagination.offset = offset;
    MapState.currentHistoryPagination.date_from = dateFrom;
    MapState.currentHistoryPagination.date_to = dateTo;
    
    const params = {
        limit: MapState.currentHistoryPagination.limit,
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
    MapState.currentHistoryType = 'watchtower';
    MapState.currentHistoryId = watchtowerId;
    MapState.currentHistoryPagination.offset = offset;
    MapState.currentHistoryPagination.date_from = dateFrom;
    MapState.currentHistoryPagination.date_to = dateTo;

    const params = {
        limit: MapState.currentHistoryPagination.limit,
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
 * Carregar histórico da flag com filtros e paginação
 */
function loadFlagHistory(flagId, offset = 0, dateFrom = null, dateTo = null) {
    MapState.currentHistoryType = 'flag';
    MapState.currentHistoryId = flagId;
    MapState.currentHistoryPagination.offset = offset;
    MapState.currentHistoryPagination.date_from = dateFrom;
    MapState.currentHistoryPagination.date_to = dateTo;

    const params = {
        limit: MapState.currentHistoryPagination.limit,
        offset: offset
    };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    $.get(`/api/flags/${flagId}/trail`, params)
        .done(function(data) {
            console.log('Trail da flag recebido:', flagId, data);
            showFenceHistoryModal(flagId, data.trail, data.pagination);
        })
        .fail(function() {
            console.error('Erro ao carregar histórico da flag:', flagId);
        });
}

/**
 * Exibir modal com histórico da fence
 */
function showFenceHistoryModal(fenceId, trail, pagination) {
    const fence = MapState.fencesData[fenceId];
    if (!fence) return;
    
    const modalTitle = document.getElementById('trailHistoryModalTitle');
    const modalBody = document.getElementById('trailHistoryModalBody');
    const isWatchtower = fence.structure_type === 'watchtower';
    const isFlag = fence.structure_type === 'flag';
    const modalIcon = isWatchtower ? 'fa-chess-rook' : (isFlag ? 'fa-flag' : 'fa-home');
    const modalName = isWatchtower ? 'Watchtower' : (isFlag ? 'Flag Pole' : 'Fence');
    modalTitle.innerHTML = `<i class="fas ${modalIcon} me-2"></i>Histórico - ${fence.fence_name || modalName}`;
    
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
    
    // Função auxiliar para determinar o tipo de fence baseado no nome
    const getFenceType = (fenceName) => {
        if (!fenceName) return 'Parede';
        const name = fenceName.toString();
        if (name.includes('Gate')) {
            if (name.includes('Open')) {
                return 'Portão Aberto';
            } else if (name.includes('Locked')) {
                return 'Portão Fechado';
            }
            return 'Portão';
        }
        return 'Parede';
    };
    
    let html = `<div class="trail-history-container">`;
    html += `<div class="mb-3"><strong>ID:</strong> ${fenceId}</div>`;
    html += `<div class="mb-3"><strong>Coordenadas:</strong> X=${fence.coord_x.toFixed(1)}, Y=${fence.coord_y.toFixed(1)}</div>`;
    
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
            } else if (isFlag) {
                borderColor = i === 0 ? '1cc88a' : 'f6c23e';
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
                
                // Adicionar informações das paredes
                html += `<div class="mt-2"><strong>Paredes:</strong></div>`;
                const wallLevels = [
                    { level: 1, walls: [
                        { key: 'level_1_wall_1_lower_built', label: 'Parede 1 Inferior' },
                        { key: 'level_1_wall_1_upper_built', label: 'Parede 1 Superior' },
                        { key: 'level_1_wall_2_lower_built', label: 'Parede 2 Inferior' },
                        { key: 'level_1_wall_2_upper_built', label: 'Parede 2 Superior' },
                        { key: 'level_1_wall_3_lower_built', label: 'Parede 3 Inferior' },
                        { key: 'level_1_wall_3_upper_built', label: 'Parede 3 Superior' }
                    ]},
                    { level: 2, walls: [
                        { key: 'level_2_wall_1_lower_built', label: 'Parede 1 Inferior' },
                        { key: 'level_2_wall_1_upper_built', label: 'Parede 1 Superior' },
                        { key: 'level_2_wall_2_lower_built', label: 'Parede 2 Inferior' },
                        { key: 'level_2_wall_2_upper_built', label: 'Parede 2 Superior' },
                        { key: 'level_2_wall_3_lower_built', label: 'Parede 3 Inferior' },
                        { key: 'level_2_wall_3_upper_built', label: 'Parede 3 Superior' }
                    ]},
                    { level: 3, walls: [
                        { key: 'level_3_wall_1_lower_built', label: 'Parede 1 Inferior' },
                        { key: 'level_3_wall_1_upper_built', label: 'Parede 1 Superior' },
                        { key: 'level_3_wall_2_lower_built', label: 'Parede 2 Inferior' },
                        { key: 'level_3_wall_2_upper_built', label: 'Parede 2 Superior' },
                        { key: 'level_3_wall_3_lower_built', label: 'Parede 3 Inferior' },
                        { key: 'level_3_wall_3_upper_built', label: 'Parede 3 Superior' }
                    ]}
                ];
                
                wallLevels.forEach(levelData => {
                    html += `<div class="ms-2 mt-1"><strong>Nível ${levelData.level}:</strong></div>`;
                    levelData.walls.forEach(wall => {
                        const currentVal = normalizeFlag(point[wall.key]);
                        const prevVal = prevPoint ? normalizeFlag(prevPoint[wall.key]) : null;
                        let changeIndicator = '';
                        if (prevVal !== null && prevVal !== currentVal) {
                            changeIndicator = currentVal ? ' <span class="text-success">(+)</span>' : ' <span class="text-danger">(-)</span>';
                            if (!currentVal) {
                                lostFlags.push(`N${levelData.level} ${wall.label}`);
                            }
                        }
                        html += `
                            <div class="info-row ms-3">
                                <span class="info-label">${wall.label}:</span>
                                <span class="info-value">${formatWatchtowerStatus(point[wall.key])}${changeIndicator}</span>
                            </div>
                        `;
                    });
                });
                
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
            } else if (isFlag) {
                const flagDefs = [
                    { key: 'has_base', label: 'Suporte/Base' },
                    { key: 'has_flag_base', label: 'Bandeira Anexada' },
                    { key: 'flag_raised', label: 'Bandeira Hasteada' }
                ];
                html += `<div class="mt-2">`;
                flagDefs.forEach(def => {
                    const currentVal = normalizeFlag(point[def.key]);
                    const prevVal = prevPoint ? normalizeFlag(prevPoint[def.key]) : null;
                    let changeIndicator = '';
                    if (prevVal !== null && prevVal !== currentVal) {
                        changeIndicator = currentVal ? ' <span class="text-success">(+)</span>' : ' <span class="text-danger">(-)</span>';
                    }
                    html += `
                        <div class="info-row">
                            <span class="info-label">${def.label}:</span>
                            <span class="info-value">${formatStatusLabel(point[def.key])}${changeIndicator}</span>
                        </div>
                    `;
                });
                if (point.flag_height !== null && point.flag_height !== undefined && point.flag_height > 0) {
                    const prevHeight = prevPoint ? (prevPoint.flag_height || 0) : null;
                    const heightChange = prevHeight !== null && prevHeight !== point.flag_height ? 
                        (point.flag_height > prevHeight ? ' <span class="text-success">(↑)</span>' : ' <span class="text-warning">(↓)</span>') : '';
                    html += `
                        <div class="info-row">
                            <span class="info-label">Altura da Bandeira:</span>
                            <span class="info-value">${point.flag_height.toFixed(2)}m${heightChange}</span>
                        </div>
                    `;
                }
                html += `</div>`;
                
                if (point.orientation && (point.orientation.x !== null || point.orientation.y !== null)) {
                    const pitch = point.orientation.x !== null && point.orientation.x !== undefined ? Number(point.orientation.x).toFixed(1) : 'N/A';
                    const yaw = point.orientation.y !== null && point.orientation.y !== undefined ? Number(point.orientation.y).toFixed(1) : 'N/A';
                    html += `<div class="info-row mt-2"><span class="info-label">Orientação:</span><span class="info-value">Pitch: ${pitch}°, Yaw: ${yaw}°</span></div>`;
                }
            } else {
                // Determinar tipo de fence atual e anterior
                const currentFenceType = getFenceType(point.fence_name);
                const prevFenceType = prevPoint ? getFenceType(prevPoint.fence_name) : null;
                const typeChanged = prevFenceType !== null && prevFenceType !== currentFenceType;
                
                // Determinar cor do badge baseado no tipo
                let typeBadgeClass = 'bg-secondary';
                if (currentFenceType === 'Portão Aberto') {
                    typeBadgeClass = 'bg-success';
                } else if (currentFenceType === 'Portão Fechado') {
                    typeBadgeClass = 'bg-danger';
                } else if (currentFenceType === 'Portão') {
                    typeBadgeClass = 'bg-warning';
                }
                
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
                // Exibir tipo de fence com indicador de mudança se houver
                let typeChangeIndicator = '';
                if (typeChanged) {
                    typeChangeIndicator = ` <span class="text-info">(Mudou de ${prevFenceType})</span>`;
                }
                html += `<span class="badge ${typeBadgeClass} me-1 mb-1">Tipo: ${currentFenceType}${typeChangeIndicator}</span>`;
                html += `<br>`;
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

        const hasRecentAttack = fence.has_recent_attack || false;
        const attackWarning = hasRecentAttack ? `
            <div class="alert alert-danger mt-2 mb-2" style="padding: 8px; font-size: 12px;">
                <i class="fas fa-exclamation-triangle me-1"></i><strong>⚠️ Possível Ataque Detectado</strong><br>
                <small>Uma ou mais paredes foram destruídas recentemente. Verifique o histórico para mais detalhes.</small>
            </div>
        ` : '';
        
        return `
            <div class="player-popup">
                <strong><i class="fas fa-chess-rook me-2"></i>Watchtower (${fence.fence_name})</strong>
                ${attackWarning}
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
                    <span class="info-label"><strong>Paredes - Nível 1:</strong></span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 1:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_1_wall_1_lower_built)}, Superior: ${formatStatus(details.level_1_wall_1_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 2:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_1_wall_2_lower_built)}, Superior: ${formatStatus(details.level_1_wall_2_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 3:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_1_wall_3_lower_built)}, Superior: ${formatStatus(details.level_1_wall_3_upper_built)}</span>
                </div>
                <div class="info-row mt-2">
                    <span class="info-label"><strong>Paredes - Nível 2:</strong></span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 1:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_2_wall_1_lower_built)}, Superior: ${formatStatus(details.level_2_wall_1_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 2:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_2_wall_2_lower_built)}, Superior: ${formatStatus(details.level_2_wall_2_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 3:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_2_wall_3_lower_built)}, Superior: ${formatStatus(details.level_2_wall_3_upper_built)}</span>
                </div>
                <div class="info-row mt-2">
                    <span class="info-label"><strong>Paredes - Nível 3:</strong></span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 1:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_3_wall_1_lower_built)}, Superior: ${formatStatus(details.level_3_wall_1_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 2:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_3_wall_2_lower_built)}, Superior: ${formatStatus(details.level_3_wall_2_upper_built)}</span>
                </div>
                <div class="info-row ms-3">
                    <span class="info-label">Parede 3:</span>
                    <span class="info-value">Inferior: ${formatStatus(details.level_3_wall_3_lower_built)}, Superior: ${formatStatus(details.level_3_wall_3_upper_built)}</span>
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
    
    if (structureType === 'flag') {
        const details = fence.flag_details || {};
        const formatStatus = (value) => {
            if (value === null || value === undefined) return 'Desconhecido';
            return value ? 'Sim' : 'Não';
        };
        const formatHeight = (value) => {
            if (value === null || value === undefined || value === 0) return 'N/A';
            return value.toFixed ? value.toFixed(2) + 'm' : value + 'm';
        };
        const orientation = fence.orientation || {};
        const orientationText = (orientation.x !== undefined && orientation.y !== undefined)
            ? `Pitch: ${orientation.x?.toFixed ? orientation.x.toFixed(1) : orientation.x || 0}°, Yaw: ${orientation.y?.toFixed ? orientation.y.toFixed(1) : orientation.y || 0}°`
            : 'Desconhecido';

        return `
            <div class="player-popup">
                <strong><i class="fas fa-flag me-2"></i>Flag Pole (${fence.fence_name})</strong>
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
                    <span class="info-label">Suporte/Base:</span>
                    <span class="info-value">${formatStatus(details.has_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Bandeira Anexada:</span>
                    <span class="info-value">${formatStatus(details.has_flag_base)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Bandeira Hasteada:</span>
                    <span class="info-value">${formatStatus(details.flag_raised)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Altura da Bandeira:</span>
                    <span class="info-value">${formatHeight(details.flag_height)}</span>
                </div>
                <div class="info-row mt-2">
                    <span class="info-label">Atualizado:</span>
                    <span class="info-value">${fence.last_update || 'Desconhecido'}</span>
                </div>
                <div class="info-row mt-2">
                    <button type="button" class="btn btn-sm btn-warning" onclick="loadFlagHistory('${fence.fence_id}')">
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

