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
    
    // Adicionar indicador de loading no botão (apenas se não estiver já em loading)
    const btn = $('#toggleFencesBtn');
    if (!btn.prop('disabled') || !btn.html().includes('Carregando')) {
        btn.html('<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Carregando...').prop('disabled', true);
    }
    
    $.get('/api/fences/positions', { include_destroyed: includeDestroyed })
        .done(function(data) {
            updateFences(data);
        })
        .fail(function() {
            console.error('Erro ao carregar fences');
            // Restaurar botão em caso de erro
            if (MapState.showFences) {
                btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Construções').prop('disabled', false);
            } else {
                btn.html('<i class="fas fa-home me-1"></i>Mostrar Construções').prop('disabled', false);
            }
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
    
    // Identificar popups abertos antes de limpar marcadores
    const openFencePopups = [];
    Object.keys(MapState.fenceMarkers).forEach(function(fenceId) {
        const marker = MapState.fenceMarkers[fenceId];
        if (marker && marker.isPopupOpen()) {
            openFencePopups.push(fenceId);
        }
    });
    
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
    
    // Reabrir popups que estavam abertos antes do auto-refresh
    if (openFencePopups.length > 0) {
        setTimeout(function() {
            openFencePopups.forEach(function(fenceId) {
                const marker = MapState.fenceMarkers[fenceId];
                if (marker) {
                    // Atualizar conteúdo do popup antes de reabrir
                    if (MapState.fencesData[fenceId]) {
                        const fence = MapState.fencesData[fenceId];
                        const popupContent = createFencePopup(fence);
                        marker.setPopupContent(popupContent);
                    }
                    
                    // Reabrir popup se não estiver aberto
                    if (!marker.isPopupOpen()) {
                        marker.openPopup();
                    }
                }
            });
        }, 100);
    }
    
    console.log(`Fences atualizados: ${data.fences.length} fences`);
    
    // Remover indicador de loading do botão (apenas se estiver desabilitado)
    const btn = $('#toggleFencesBtn');
    if (btn.prop('disabled') && btn.html().includes('Carregando')) {
        if (MapState.showFences) {
            btn.html('<i class="fas fa-eye-slash me-1"></i>Ocultar Construções').prop('disabled', false);
        } else {
            btn.html('<i class="fas fa-home me-1"></i>Mostrar Construções').prop('disabled', false);
        }
    }
    
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
    
    // Atualizar visibilidade dos badges
    if (typeof updateBadgesVisibility === 'function') {
        updateBadgesVisibility();
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
    // Usar valores diretos quando disponíveis, com fallback para fence_name (compatibilidade com dados antigos)
    // Se o valor for explicitamente false, não mostrar. Se for null/undefined, usar fallback do fence_name
    const hasGate = fence.has_gate === true || (fence.has_gate !== false && fence.fence_name && fence.fence_name.includes('Gate'));
    const isOpened = fence.is_opened === true || (fence.is_opened !== false && fence.fence_name && fence.fence_name.includes('Open'));
    const isLocked = fence.is_locked === true || (fence.is_locked !== false && fence.fence_name && fence.fence_name.includes('Locked'));
    
    if (hasGate) {
        features.push('Portão');
    }
    if (isOpened) {
        features.push('Aberto');
    }
    if (isLocked) {
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
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-sm btn-secondary" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.4rem;" id="fenceRefreshBtn_${fence.fence_id}" ${MapState.fenceRefreshStatus && MapState.fenceRefreshStatus[fence.fence_id] ? 'disabled' : ''} onclick="refreshFenceData('${fence.fence_id}')">
                        ${MapState.fenceRefreshStatus && MapState.fenceRefreshStatus[fence.fence_id] ? '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...' : '<i class="fas fa-sync-alt me-1"></i>Atualizar'}
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.4rem;" onclick="toggleFenceTrail('${fence.fence_id}')">
                        <i class="fas fa-route me-1"></i><span id="fenceTrailBtn_${fence.fence_id}">${MapState.fenceTrails[fence.fence_id] ? 'Ocultar' : 'Trail'}</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-info" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.4rem;" onclick="loadFenceHistory('${fence.fence_id}')">
                        <i class="fas fa-history me-1"></i>Histórico
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 0.35rem 0.4rem;" onclick="showFenceTeleportModal('${fence.fence_id}')">
                        <i class="fas fa-map-marker-alt me-1"></i>Teleportar
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Solicitar atualização dos dados de uma construção
 */
function refreshFenceData(fenceId) {
    if (!fenceId) {
        return;
    }
    
    if (MapState.fenceRefreshStatus && MapState.fenceRefreshStatus[fenceId]) {
        showToast('Info', 'Atualização já está em andamento para esta construção.', 'info');
        return;
    }
    
    const fence = MapState.fencesData[fenceId];
    if (!fence) {
        showToast('Erro', 'Construção não encontrada no mapa.', 'error');
        return;
    }
    
    const requestId = generateRequestId();
    if (!MapState.fenceRefreshRequests) {
        MapState.fenceRefreshRequests = {};
    }
    MapState.fenceRefreshRequests[fenceId] = requestId;
    
    setFenceRefreshState(fenceId, true);
    
    $.ajax({
        url: `/api/fences/${fenceId}/refresh`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            request_id: requestId
        }),
        success: function() {
            const structureName = fence.structure_type === 'watchtower' ? 'Watchtower' : (fence.structure_type === 'flag' ? 'Flag Pole' : 'Fence');
            showToast('Info', `Solicitação de atualização enviada para ${structureName}.`, 'info');
            startFenceRefreshPolling(requestId, fenceId, 0);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao solicitar atualização da construção';
            showToast('Erro', errorMsg, 'error');
            setFenceRefreshState(fenceId, false);
            delete MapState.fenceRefreshRequests[fenceId];
        }
    });
}

/**
 * Polling para aguardar resultado do comando checkfence
 */
function startFenceRefreshPolling(requestId, fenceId, attempt) {
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL = 500;
    
    if (MapState.fenceRefreshRequests[fenceId] !== requestId) {
        return;
    }
    
    if (attempt >= MAX_ATTEMPTS) {
        showToast('Aviso', 'Tempo limite ao atualizar dados da construção.', 'warning');
        setFenceRefreshState(fenceId, false);
        delete MapState.fenceRefreshRequests[fenceId];
        return;
    }
    
    $.get(`/api/commands/results/${requestId}`)
        .done(function(response) {
            if (MapState.fenceRefreshRequests[fenceId] !== requestId) {
                return;
            }
            
            if (response.status === 'ready') {
                const data = response.data || {};
                if (data.status === 'success') {
                    applyFenceRefreshData(fenceId, data);
                    
                    // Salvar no banco de dados (silenciosamente)
                    saveFenceCheckToDatabase(fenceId, data);
                    
                    const fence = MapState.fencesData[fenceId];
                    const structureName = fence && fence.structure_type === 'watchtower' ? 'Watchtower' : (fence && fence.structure_type === 'flag' ? 'Flag Pole' : 'Fence');
                    showToast('Sucesso', `Dados da construção ${structureName} atualizados.`, 'success');
                } else {
                    const errorMsg = data.message || 'Não foi possível atualizar os dados da construção.';
                    showToast('Aviso', errorMsg, 'warning');
                }
                setFenceRefreshState(fenceId, false);
                delete MapState.fenceRefreshRequests[fenceId];
            } else if (response.status === 'not_found') {
                // Resultado ainda não disponível, continuar polling
                setTimeout(function() {
                    startFenceRefreshPolling(requestId, fenceId, attempt + 1);
                }, POLL_INTERVAL);
            } else {
                // Erro ou status desconhecido
                const errorMsg = response.message || 'Erro ao buscar resultado do comando.';
                showToast('Erro', errorMsg, 'error');
                setFenceRefreshState(fenceId, false);
                delete MapState.fenceRefreshRequests[fenceId];
            }
        })
        .fail(function(xhr) {
            if (MapState.fenceRefreshRequests[fenceId] !== requestId) {
                return;
            }
            
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao buscar resultado do comando.';
            showToast('Erro', errorMsg, 'error');
            setFenceRefreshState(fenceId, false);
            delete MapState.fenceRefreshRequests[fenceId];
        });
}

/**
 * Gerenciar estado visual do botão de refresh
 */
function setFenceRefreshState(fenceId, isRefreshing) {
    if (!MapState.fenceRefreshStatus) {
        MapState.fenceRefreshStatus = {};
    }
    
    if (isRefreshing) {
        MapState.fenceRefreshStatus[fenceId] = true;
    } else {
        delete MapState.fenceRefreshStatus[fenceId];
    }
    
    // Atualizar botão no popup se estiver aberto
    const marker = MapState.fenceMarkers[fenceId];
    if (marker && marker.isPopupOpen()) {
        updateFencePopup(fenceId);
    }
}

/**
 * Aplicar dados retornados pelo comando ao estado local
 */
function applyFenceRefreshData(fenceId, commandData) {
    if (!commandData) {
        return;
    }
    
    const fence = MapState.fencesData[fenceId] || { fence_id: fenceId };
    
    let oldCoordX = fence.coord_x;
    let oldCoordY = fence.coord_y;
    let hasPositionChanged = false;
    let distanceMoved = 0;
    
    // Verificar se popup está aberto antes de qualquer atualização
    const marker = MapState.fenceMarkers[fenceId];
    const wasPopupOpen = marker && marker.isPopupOpen();
    
    if (commandData.position) {
        // Formato JSON do checkfence: {"x": leste-oeste, "y": norte-sul, "z": altura}
        // Formato frontend: coord_x (leste-oeste), coord_y (norte-sul), coord_z (altura)
        const coordX = parseFloat(commandData.position.x);
        const coordY = parseFloat(commandData.position.y);  // y do JSON é norte-sul
        const coordZ = parseFloat(commandData.position.z);  // z do JSON é altura
        
        if (!isNaN(coordX) && !isNaN(coordY)) {
            if (!isNaN(oldCoordX) && !isNaN(oldCoordY)) {
                distanceMoved = calculateDayZDistance(oldCoordX, oldCoordY, coordX, coordY);
                hasPositionChanged = distanceMoved > 50;
            }
        }
        
        if (!isNaN(coordX)) {
            fence.coord_x = coordX;
        }
        if (!isNaN(coordY)) {
            fence.coord_y = coordY;
        }
        if (!isNaN(coordZ)) {
            fence.coord_z = coordZ;
        }
        
        const pixelCoords = dayzToPixelCoords(coordX, coordY);
        if (pixelCoords) {
            fence.pixel_coords = pixelCoords;
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
                        const structureName = fence.structure_type === 'watchtower' ? 'Watchtower' : (fence.structure_type === 'flag' ? 'Flag Pole' : 'Fence');
                        showToast('Construção Movida', `${structureName} se moveu ${distanceText}`, 'info');
                    }
                }
            }
        }
    }
    
    if (commandData.orientation) {
        fence.orientation = commandData.orientation;
    }
    
    if (commandData.structure_type) {
        fence.structure_type = commandData.structure_type;
    }
    
    // Atualizar dados específicos baseado no tipo
    if (commandData.structure_type === 'fence') {
        fence.has_base = commandData.has_base;
        fence.lower_panel_built = commandData.lower_panel_built;
        fence.upper_panel_built = commandData.upper_panel_built;
        fence.has_gate = commandData.has_gate;
        fence.is_opened = commandData.is_opened;
        fence.is_locked = commandData.is_locked;
        fence.attachments = commandData.attachments || [];
        
        // Atualizar fence_name baseado nos valores atualizados (seguindo padrão do FencesTracking.c)
        let newFenceName = 'Fence';
        if (fence.has_gate === true) {
            newFenceName = newFenceName + '_Gate';
        }
        if (fence.is_opened === true) {
            newFenceName = newFenceName + '_Open';
        }
        if (fence.is_locked === true) {
            newFenceName = newFenceName + '_Locked';
        }
        fence.fence_name = newFenceName;
    } else if (commandData.structure_type === 'watchtower') {
        fence.has_base = commandData.has_base;
        fence.watchtower_details = {
            has_base: commandData.has_base,
            level_1_base: commandData.level_1_base,
            level_2_base: commandData.level_2_base,
            level_3_base: commandData.level_3_base,
            level_1_stairs: commandData.level_1_stairs,
            level_2_stairs: commandData.level_2_stairs,
            has_roof: commandData.has_roof,
            level_1_wall_1_lower_built: commandData.level_1_wall_1_lower_built,
            level_1_wall_1_upper_built: commandData.level_1_wall_1_upper_built,
            level_1_wall_2_lower_built: commandData.level_1_wall_2_lower_built,
            level_1_wall_2_upper_built: commandData.level_1_wall_2_upper_built,
            level_1_wall_3_lower_built: commandData.level_1_wall_3_lower_built,
            level_1_wall_3_upper_built: commandData.level_1_wall_3_upper_built,
            level_2_wall_1_lower_built: commandData.level_2_wall_1_lower_built,
            level_2_wall_1_upper_built: commandData.level_2_wall_1_upper_built,
            level_2_wall_2_lower_built: commandData.level_2_wall_2_lower_built,
            level_2_wall_2_upper_built: commandData.level_2_wall_2_upper_built,
            level_2_wall_3_lower_built: commandData.level_2_wall_3_lower_built,
            level_2_wall_3_upper_built: commandData.level_2_wall_3_upper_built,
            level_3_wall_1_lower_built: commandData.level_3_wall_1_lower_built,
            level_3_wall_1_upper_built: commandData.level_3_wall_1_upper_built,
            level_3_wall_2_lower_built: commandData.level_3_wall_2_lower_built,
            level_3_wall_2_upper_built: commandData.level_3_wall_2_upper_built,
            level_3_wall_3_lower_built: commandData.level_3_wall_3_lower_built,
            level_3_wall_3_upper_built: commandData.level_3_wall_3_upper_built
        };
    } else if (commandData.structure_type === 'flag') {
        fence.has_base = commandData.has_base;
        fence.flag_details = {
            has_base: commandData.has_base,
            has_flag_base: commandData.has_flag_base,
            flag_raised: commandData.flag_raised,
            flag_height: commandData.flag_height
        };
    }
    
    try {
        fence.last_update = new Date().toLocaleString('pt-BR');
    } catch (e) {
        fence.last_update = new Date().toISOString();
    }
    
    MapState.fencesData[fenceId] = fence;
    
    MapState.previousFencesData[fenceId] = {
        coord_x: fence.coord_x,
        coord_y: fence.coord_y,
        is_destroyed: fence.is_destroyed || false,
        has_base: fence.has_base,
        lower_panel_built: fence.lower_panel_built,
        upper_panel_built: fence.upper_panel_built,
        structure_type: fence.structure_type,
        watchtower_details: fence.watchtower_details || {},
        flag_details: fence.flag_details || {}
    };
    
    // Atualizar popup se estava aberto antes (preservar estado)
    if (marker && wasPopupOpen) {
        updateFencePopup(fenceId);
        
        // Garantir que popup permaneça aberto após atualização
        setTimeout(function() {
            if (marker && !marker.isPopupOpen()) {
                marker.openPopup();
            }
        }, 100);
    }
}

/**
 * Salvar dados da construção no banco de dados
 */
function saveFenceCheckToDatabase(fenceId, commandData) {
    if (!commandData || commandData.status !== 'success') {
        return;
    }
    
    $.ajax({
        url: `/api/fences/${fenceId}/save-check`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            structure_type: commandData.structure_type || 'fence',
            position: commandData.position || {},
            orientation: commandData.orientation || {},
            has_base: commandData.has_base,
            lower_panel_built: commandData.lower_panel_built,
            upper_panel_built: commandData.upper_panel_built,
            has_gate: commandData.has_gate,
            is_opened: commandData.is_opened,
            is_locked: commandData.is_locked,
            attachments: commandData.attachments || [],
            level_1_base: commandData.level_1_base,
            level_2_base: commandData.level_2_base,
            level_3_base: commandData.level_3_base,
            level_1_stairs: commandData.level_1_stairs,
            level_2_stairs: commandData.level_2_stairs,
            has_roof: commandData.has_roof,
            level_1_wall_1_lower_built: commandData.level_1_wall_1_lower_built,
            level_1_wall_1_upper_built: commandData.level_1_wall_1_upper_built,
            level_1_wall_2_lower_built: commandData.level_1_wall_2_lower_built,
            level_1_wall_2_upper_built: commandData.level_1_wall_2_upper_built,
            level_1_wall_3_lower_built: commandData.level_1_wall_3_lower_built,
            level_1_wall_3_upper_built: commandData.level_1_wall_3_upper_built,
            level_2_wall_1_lower_built: commandData.level_2_wall_1_lower_built,
            level_2_wall_1_upper_built: commandData.level_2_wall_1_upper_built,
            level_2_wall_2_lower_built: commandData.level_2_wall_2_lower_built,
            level_2_wall_2_upper_built: commandData.level_2_wall_2_upper_built,
            level_2_wall_3_lower_built: commandData.level_2_wall_3_lower_built,
            level_2_wall_3_upper_built: commandData.level_2_wall_3_upper_built,
            level_3_wall_1_lower_built: commandData.level_3_wall_1_lower_built,
            level_3_wall_1_upper_built: commandData.level_3_wall_1_upper_built,
            level_3_wall_2_lower_built: commandData.level_3_wall_2_lower_built,
            level_3_wall_2_upper_built: commandData.level_3_wall_2_upper_built,
            level_3_wall_3_lower_built: commandData.level_3_wall_3_lower_built,
            level_3_wall_3_upper_built: commandData.level_3_wall_3_upper_built,
            has_flag_base: commandData.has_flag_base,
            flag_raised: commandData.flag_raised,
            flag_height: commandData.flag_height
        }),
        success: function(response) {
            if (response.success) {
                console.log(`Dados da construção ${fenceId} salvos no banco (tracking_id: ${response.fence_tracking_id})`);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            console.error(`Erro ao salvar dados da construção ${fenceId} no banco:`, error.message || 'Erro desconhecido');
        }
    });
}

/**
 * Mostrar modal de teleporte de construção (fence/watchtower/flag)
 */
function showFenceTeleportModal(fenceId) {
    const fence = MapState.fencesData[fenceId];
    if (!fence) {
        showToast('Erro', 'Construção não encontrada', 'error');
        return;
    }
    
    // Limpar targets de veículo e container se houver
    MapState.teleportTargetVehicle = null;
    MapState.teleportTargetContainer = null;
    
    const structureName = fence.structure_type === 'watchtower' ? 'Watchtower' : (fence.structure_type === 'flag' ? 'Flag Pole' : 'Fence');
    
    // Usar o mesmo modal de teleporte de veículos
    $('#teleportVehicleId').val(fenceId);
    $('#teleportVehicleName').text(structureName);
    $('#teleportVehicleCurrentCoords').text(`X=${fence.coord_x.toFixed(1)}, Y=${fence.coord_y.toFixed(1)}`);
    
    // Atualizar título e texto do modal para construção
    $('#vehicleTeleportModal .modal-title').html('<i class="fas fa-map-marker-alt me-2"></i>Teleportar Construção');
    $('#vehicleTeleportModal .alert-info strong').first().text('Construção:');
    
    // Limpar campos de coordenadas
    $('#teleportVehicleX').val('');
    $('#teleportVehicleY').val('');
    $('#teleportVehicleZ').val('');
    
    // Armazenar fenceId para uso no clique do mapa (usar teleportTargetContainer temporariamente)
    // Nota: Pode ser necessário criar teleportTargetFence no futuro
    MapState.teleportTargetContainer = fenceId;
    
    // Verificar se está no modo de teleporte
    if (MapState.currentMode !== 'teleport') {
        // Mudar para modo de teleporte
        if (typeof setTeleportMode === 'function') {
            setTeleportMode();
        }
    }
    
    // Mostrar modal
    $('#vehicleTeleportModal').modal('show');
}

