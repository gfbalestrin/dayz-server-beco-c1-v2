/**
 * Módulo de Jogadores do Mapa
 * Lógica completa de jogadores, trails e ações
 */

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
 * Detectar mudanças de posição de jogadores
 */
function detectPlayerChanges(newData, oldData) {
    if (!MapState.showPlayers) return [];
    
    const changes = [];
    if (newData && newData.players) {
        newData.players.forEach(function(player) {
            const playerId = player.player_id;
            const oldPlayer = oldData[playerId];
            
            if (oldPlayer) {
                const oldX = oldPlayer.coord_x;
                const oldY = oldPlayer.coord_y;
                const newX = player.coord_x;
                const newY = player.coord_y;
                
                if (oldX !== newX || oldY !== newY) {
                    const distance = Math.sqrt(Math.pow(newX - oldX, 2) + Math.pow(newY - oldY, 2));
                    changes.push({
                        playerId: playerId,
                        playerName: player.player_name,
                        oldX: oldX,
                        oldY: oldY,
                        newX: newX,
                        newY: newY,
                        distance: distance
                    });
                }
            }
        });
    }
    
    return changes;
}

/**
 * Atualizar posições no mapa
 */
function updatePositions(data) {
    // Detectar mudanças antes de atualizar
    if (Object.keys(MapState.previousPlayersData).length > 0 && MapState.notificationsEnabled) {
        const playerChanges = detectPlayerChanges(data, MapState.previousPlayersData);
        playerChanges.forEach(function(change) {
            const message = `${change.playerName} moveu-se para X=${change.newX.toFixed(1)}, Y=${change.newY.toFixed(1)} (distância: ${change.distance.toFixed(1)}m)`;
            showToast('Jogador Moveu-se', message, 'info');
            addNotificationToLog('info', `Jogador: ${message}`);
        });
    }
    
    // Remover marcadores antigos se não houver filtro
    if (MapState.selectedPlayerFilters.length === 0) {
        Object.keys(MapState.playerMarkers).forEach(function(key) {
            MapState.map.removeLayer(MapState.playerMarkers[key]);
        });
        MapState.playerMarkers = {};
    }
    
    // Contadores de jogadores exibidos
    let onlineCount = 0;
    let offlineCount = 0;
    
    // Processar cada jogador
    data.players.forEach(function(player) {
        const playerId = player.player_id;
        
        // Armazenar dados do jogador
        MapState.playersData[playerId] = {
            name: player.player_name,
            steamName: player.steam_name,
            isOnline: player.is_online
        };
        
        // Aplicar filtro se existir (múltiplos jogadores)
        if (MapState.selectedPlayerFilters.length > 0 && !MapState.selectedPlayerFilters.includes(playerId)) {
            // Remover marcador se não corresponde ao filtro
            if (MapState.playerMarkers[playerId]) {
                MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                delete MapState.playerMarkers[playerId];
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
        if (!MapState.showPlayers) {
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
        if (MapState.playerMarkers[playerId]) {
            MapState.map.removeLayer(MapState.playerMarkers[playerId]);
        }
        
        // Criar novo marcador
        const marker = L.marker([lat, lng], {
            icon: createMarkerIcon(color),
            opacity: player.is_online ? 1.0 : 0.9
        }).addTo(MapState.map);
        
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
        
        // Formatar conteúdo do tooltip com informações essenciais apenas
        let tooltipContent = `
            <strong>👤 ${player.player_name}${player.steam_name ? ` (${player.steam_name})` : ''}</strong><br>
            ${player.is_online ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
            📍 Coords: <span class="value">X=${player.coord_x.toFixed(1)}, Y=${player.coord_y.toFixed(1)}</span><br>
            ${player.coord_z ? `📏 Altura: <span class="value">${player.coord_z.toFixed(1)}m</span><br>` : ''}
            ⏰ Atualizado: <span class="value">${player.last_update || 'Desconhecido'}</span>
        `;
        
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
        
        MapState.playerMarkers[playerId] = marker;
    });
    
    // Atualizar badges após carregar dados (para atualizar status online/offline)
    if (MapState.selectedPlayerFilters.length > 0) {
        updateSelectedPlayersBadges();
    }
    
    // Atualizar contadores na UI
    $('#mapOnlineCount').text(onlineCount);
    $('#mapOfflineCount').text(offlineCount);
    $('#mapTotalCount').text(onlineCount + offlineCount);
    
    if (MapState.showTrails) {
        setTimeout(function() {
            Object.keys(MapState.playerMarkers).forEach(loadPlayerTrail);
        }, 500);
    }
    
    hideLoading();
    console.log(`Posições atualizadas: ${data.players.length} jogadores`);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousPlayersData = {};
    data.players.forEach(function(player) {
        MapState.previousPlayersData[player.player_id] = {
            coord_x: player.coord_x,
            coord_y: player.coord_y
        };
    });
}

/**
 * Carregar trail de um jogador
 */
function loadPlayerTrail(playerId) {
    if (!MapState.showTrails) return;
    
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
    if (MapState.playerTrails[playerId]) {
        if (Array.isArray(MapState.playerTrails[playerId])) {
            MapState.playerTrails[playerId].forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(MapState.playerTrails[playerId]);
        }
    }
    
    MapState.playerTrails[playerId] = [];
    
    if (trail.length === 0) return;
    
    // Aplicar filtro de data se ativo
    let filteredTrail = trail;
    if (MapState.trailDateFilter.enabled) {
        filteredTrail = trail.filter(point => {
            const pointDate = new Date(point.timestamp);
            return pointDate >= MapState.trailDateFilter.startDate && 
                   pointDate <= MapState.trailDateFilter.endDate;
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
    }).addTo(MapState.map);
    
    MapState.playerTrails[playerId].push(polyline);
    
    // Adicionar marcadores em cada ponto com cálculo de velocidade
    for (let i = 0; i < processedTrail.length; i++) {
        const point = processedTrail[i].data;
        const pointLat = processedTrail[i].mapCoords[0];
        const pointLng = processedTrail[i].mapCoords[1];
        const playerName = MapState.playersData[playerId]?.name || 'Jogador';
        const steamName = MapState.playersData[playerId]?.steamName || '';
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
        ).addTo(MapState.map);
        
        // Adicionar evento de clique (sempre, para mostrar menu de ações)
        circleMarker.on('click', function() {
            showPointActionsMenu(playerId, point, trail.length - i);
        });
        
        // Adicionar cursor pointer
        circleMarker.getElement().style.cursor = 'pointer';
        
        // Adicionar tooltip (direção dinâmica baseada na posição)
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        
        circleMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });
        
        MapState.playerTrails[playerId].push(circleMarker);
    }
}

/**
 * Atualizar visibilidade do botão de trails baseado no estado de showPlayers
 */
function updateTrailButtonVisibility() {
    if (MapState.showPlayers) {
        $('#toggleTrailsBtn').show();
    } else {
        $('#toggleTrailsBtn').hide();
        $('#trailDateFilter').hide();
    }
}

/**
 * Desativar trails e remover do mapa
 */
function disableTrails() {
    if (MapState.showTrails) {
        MapState.showTrails = false;
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar Trails');
        $('#trailDateFilter').hide();
        // Limpar filtros
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
        $('#trailStartDate').val('');
        $('#trailStartTime').val('');
        $('#trailEndDate').val('');
        $('#trailEndTime').val('');
        // Remover todos os trails
        Object.keys(MapState.playerTrails).forEach(function(key) {
            const trail = MapState.playerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.playerTrails = {};
    }
}

/**
 * Toggle mostrar trails
 */
function toggleTrails() {
    // Validar se jogadores estão visíveis antes de ativar
    if (!MapState.showPlayers) {
        showToast('Aviso', 'É necessário ativar "Mostrar Jogadores" para usar trails', 'warning');
        return;
    }
    MapState.showTrails = !MapState.showTrails;
    
    if (MapState.showTrails) {
        $('#toggleTrailsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Trails');
        $('#trailDateFilter').show();
        // Carregar trails de todos os jogadores visíveis
        Object.keys(MapState.playerMarkers).forEach(loadPlayerTrail);
    } else {
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar Trails');
        $('#trailDateFilter').hide();
        // Limpar filtros
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
        $('#trailStartDate').val('');
        $('#trailStartTime').val('');
        $('#trailEndDate').val('');
        $('#trailEndTime').val('');
        // Remover todos os trails
        Object.keys(MapState.playerTrails).forEach(function(key) {
            const trail = MapState.playerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.playerTrails = {};
    }
}

/**
 * Toggle mostrar jogadores
 */
function togglePlayersDisplay() {
    MapState.showPlayers = !MapState.showPlayers;
    
    if (MapState.showPlayers) {
        $('#togglePlayersBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Jogadores');
        // Recarregar posições
        loadPositions();
        // Atualizar visibilidade do botão de trails
        updateTrailButtonVisibility();
    } else {
        $('#togglePlayersBtn').html('<i class="fas fa-user me-1"></i>Mostrar Jogadores');
        // Desativar e remover trails se estiverem ativos
        disableTrails();
        // Remover todos os marcadores de jogadores
        Object.keys(MapState.playerMarkers).forEach(function(key) {
            MapState.map.removeLayer(MapState.playerMarkers[key]);
        });
        MapState.playerMarkers = {};
        // Atualizar visibilidade do botão de trails
        updateTrailButtonVisibility();
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
    const matchingPlayers = Object.keys(MapState.playersData)
        .filter(playerId => {
            const player = MapState.playersData[playerId];
            const name = (player.name || '').toLowerCase();
            const steamName = (player.steamName || '').toLowerCase();
            
            // Não mostrar jogadores já selecionados
            if (MapState.selectedPlayerFilters.includes(playerId)) {
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
        const player = MapState.playersData[playerId];
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
    if (MapState.selectedPlayerFilters.includes(playerId)) {
        return;
    }
    
    MapState.selectedPlayerFilters.push(playerId);
    
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
    const index = MapState.selectedPlayerFilters.indexOf(playerId);
    if (index > -1) {
        MapState.selectedPlayerFilters.splice(index, 1);
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
    
    if (MapState.selectedPlayerFilters.length === 0) {
        $('#clearAllFiltersBtn').hide();
        return;
    }
    
    $('#clearAllFiltersBtn').show();
    
    MapState.selectedPlayerFilters.forEach(playerId => {
        const player = MapState.playersData[playerId];
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
    MapState.selectedPlayerFilters = [];
    updateSelectedPlayersBadges();
    filterPlayers();
}

/**
 * Filtrar jogadores
 */
function filterPlayers() {
    
    // Se trails estão ativos, limpar todos antes de recarregar
    if (MapState.showTrails) {
        Object.keys(MapState.playerTrails).forEach(function(key) {
            const trail = MapState.playerTrails[key];
            if (Array.isArray(trail)) {
                trail.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(trail);
            }
        });
        MapState.playerTrails = {};
    }
    
    // Recarregar posições
    loadPositions();
    
    // Se trails estavam ativos, recarregar para jogadores visíveis após um delay
    if (MapState.showTrails) {
        setTimeout(function() {
            Object.keys(MapState.playerMarkers).forEach(loadPlayerTrail);
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
            MapState.trailDateFilter.enabled = false;
            MapState.trailDateFilter.startDate = null;
            MapState.trailDateFilter.endDate = null;
            Object.keys(MapState.playerMarkers).forEach(loadPlayerTrail);
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
    if (!MapState.showTrails) return;
    
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
        MapState.trailDateFilter.enabled = true;
        MapState.trailDateFilter.startDate = new Date(`${startDate}T${startTime}`);
        MapState.trailDateFilter.endDate = new Date(`${endDate}T${endTime}`);
    } else {
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
    }
    
    // Recarregar trails com filtro
    Object.keys(MapState.playerMarkers).forEach(loadPlayerTrail);
}

/**
 * Mostrar menu de ações do ponto
 */
function showPointActionsMenu(playerId, point, pointNumber) {
    // Armazenar contexto
    MapState.currentPointContext = {
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
    // Função auxiliar para formatar arrays JSON de itens
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
    
    // Determinar se é marcador principal ou ponto do trail
    let playerName, steamName, coordX, coordY, coordZ, isOnline, isAdmin;
    let health, blood, shock, isAlive, energy, water, stamina, staminaMax;
    let itemsInHands, itemsCount, lastUpdate;
    
    if (targetPlayer.player_name !== undefined) {
        // Dados do marcador principal (player object completo)
        playerName = targetPlayer.player_name;
        steamName = targetPlayer.steam_name;
        coordX = targetPlayer.coord_x;
        coordY = targetPlayer.coord_y;
        coordZ = targetPlayer.coord_z;
        isOnline = targetPlayer.is_online || false;
        isAdmin = targetPlayer.is_admin || false;
        health = targetPlayer.health;
        blood = targetPlayer.blood;
        shock = targetPlayer.shock;
        isAlive = targetPlayer.is_alive;
        energy = targetPlayer.energy;
        water = targetPlayer.water;
        stamina = targetPlayer.stamina;
        staminaMax = targetPlayer.stamina_max;
        itemsInHands = targetPlayer.items_in_hands;
        itemsCount = targetPlayer.items_count;
        lastUpdate = targetPlayer.last_update;
    } else {
        // Dados do ponto do trail (currentPointContext)
        const playerData = MapState.playersData[targetPlayerId];
        playerName = playerData ? playerData.name : 'Desconhecido';
        steamName = playerData ? playerData.steamName : null;
        coordX = targetPlayer.coord_x;
        coordY = targetPlayer.coord_y;
        coordZ = targetPlayer.coord_z;
        isOnline = playerData ? playerData.isOnline : false;
        isAdmin = false;
        health = targetPlayer.health;
        blood = targetPlayer.blood;
        shock = targetPlayer.shock;
        isAlive = targetPlayer.is_alive;
        energy = targetPlayer.energy;
        water = targetPlayer.water;
        stamina = targetPlayer.stamina;
        staminaMax = targetPlayer.stamina_max;
        itemsInHands = targetPlayer.items_in_hands;
        itemsCount = targetPlayer.items_count;
        lastUpdate = targetPlayer.timestamp || targetPlayer.last_update;
    }
    
    // Armazenar contexto do jogador
    MapState.currentPlayerContext = {
        playerId: targetPlayerId,
        playerName: playerName,
        coordX: coordX,
        coordY: coordY,
        coordZ: coordZ,
        isOnline: isOnline
    };
    
    // Preencher informações básicas
    $('#playerMarkerName').html(`<strong>${playerName}</strong>`);
    $('#playerMarkerSteam').text(steamName || 'N/A');
    $('#playerMarkerStatus').html(isOnline ? '<span class="badge bg-success">Online</span>' : '<span class="badge bg-secondary">Offline</span>');
    $('#playerMarkerAdmin').html(isAdmin ? '<span class="badge bg-warning">Sim</span>' : '<span class="badge bg-secondary">Não</span>');
    $('#playerMarkerCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}`);
    $('#playerMarkerHeight').find('p').text(coordZ ? `${coordZ.toFixed(1)}m` : 'N/A');
    $('#playerMarkerLastUpdate').text(lastUpdate || 'Desconhecido');
    
    // Preencher status de vida
    const hasHealthData = (health !== null && health !== undefined) || 
                         (blood !== null && blood !== undefined) ||
                         (shock !== null && shock !== undefined) ||
                         (isAlive !== null && isAlive !== undefined);
    
    if (hasHealthData) {
        $('#playerMarkerHealthSection').show();
        if (health !== null && health !== undefined) {
            $('#playerMarkerHealth').show().find('p').text(health.toFixed(1));
        } else {
            $('#playerMarkerHealth').hide();
        }
        if (blood !== null && blood !== undefined) {
            $('#playerMarkerBlood').show().find('p').text(blood.toFixed(0));
        } else {
            $('#playerMarkerBlood').hide();
        }
        if (shock !== null && shock !== undefined) {
            $('#playerMarkerShock').show().find('p').text(shock.toFixed(0));
        } else {
            $('#playerMarkerShock').hide();
        }
        if (isAlive !== null && isAlive !== undefined) {
            $('#playerMarkerAlive').show().find('p').html(isAlive ? '<span class="badge bg-success">Vivo</span>' : '<span class="badge bg-danger">Morto</span>');
        } else {
            $('#playerMarkerAlive').hide();
        }
    } else {
        $('#playerMarkerHealthSection').hide();
    }
    
    // Preencher recursos
    const hasResourcesData = (energy !== null && energy !== undefined) || 
                            (water !== null && water !== undefined);
    
    if (hasResourcesData) {
        $('#playerMarkerResourcesSection').show();
        if (energy !== null && energy !== undefined) {
            $('#playerMarkerEnergy').show().find('p').text(energy.toFixed(1));
        } else {
            $('#playerMarkerEnergy').hide();
        }
        if (water !== null && water !== undefined) {
            $('#playerMarkerWater').show().find('p').text(water.toFixed(1));
        } else {
            $('#playerMarkerWater').hide();
        }
    } else {
        $('#playerMarkerResourcesSection').hide();
    }
    
    // Preencher stamina
    const hasStaminaData = (stamina !== null && stamina !== undefined) || 
                          (staminaMax !== null && staminaMax !== undefined);
    
    if (hasStaminaData) {
        $('#playerMarkerStaminaSection').show();
        let staminaText = '--';
        if (stamina !== null && stamina !== undefined && staminaMax !== null && staminaMax !== undefined) {
            staminaText = `${stamina.toFixed(1)}/${staminaMax.toFixed(1)}`;
        } else if (stamina !== null && stamina !== undefined) {
            staminaText = stamina.toFixed(1);
        }
        $('#playerMarkerStamina').find('p').text(staminaText);
    } else {
        $('#playerMarkerStaminaSection').hide();
    }
    
    // Preencher inventário
    const hasInventoryData = itemsInHands || (itemsCount !== null && itemsCount !== undefined);
    
    if (hasInventoryData) {
        $('#playerMarkerInventorySection').show();
        if (itemsInHands) {
            const itemsHands = formatItemsArray(itemsInHands);
            $('#playerMarkerItemsHands').show().find('p').text(itemsHands);
        } else {
            $('#playerMarkerItemsHands').hide();
        }
        if (itemsCount !== null && itemsCount !== undefined) {
            $('#playerMarkerItemsCount').show().find('p').text(itemsCount.toString());
        } else {
            $('#playerMarkerItemsCount').hide();
        }
    } else {
        $('#playerMarkerInventorySection').hide();
    }
    
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
 * Mostrar modal de restauração de backup
 */
function showRestoreBackupModal(playerId, point, pointNumber) {
    // Buscar nome do jogador dos dados armazenados
    const playerData = MapState.playersData[playerId];
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
    const playerData = MapState.playersData[playerId];
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
 * Mostrar modal de teleporte de jogador para posição de outro jogador
 * Função auxiliar chamada pelo modal de ações
 */
function showTeleportToPlayerModal() {
    if (!MapState.currentPlayerContext) {
        return;
    }
    
    const playerName = MapState.currentPlayerContext.playerName;
    const coordX = MapState.currentPlayerContext.coordX;
    const coordY = MapState.currentPlayerContext.coordY;
    const coordZ = MapState.currentPlayerContext.coordZ;
    
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
    const playerData = MapState.playersData[playerId];
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
 * Escanear região do mapa
 */
function scanRegion(coordX, coordY, coordZ, radius) {
    // Verificar se já está escaneando
    if (MapState.isScanning) {
        showToast('Aviso', 'Já existe um escaneamento em andamento. Aguarde a conclusão.', 'warning');
        return;
    }
    
    // Marcar como escaneando
    MapState.isScanning = true;
    
    // Desabilitar botão de escaneamento
    $('#btnModeScan').prop('disabled', true);
    
    // Voltar para modo normal imediatamente após iniciar escaneamento
    setMode('normal');
    
    // Gerar request_id único
    const requestId = generateRequestId();
    
    // Mostrar feedback visual no mapa
    showScanRegionVisual(coordX, coordY, coordZ, radius);
    
    // Mostrar loading
    showToast('Info', `Escaneando região em X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)} (raio: ${radius}m)...`, 'info');
    
    // Chamar endpoint para enviar comando
    $.ajax({
        url: '/api/scan-region',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            coord_x: coordX,
            coord_y: coordY,
            coord_z: coordZ,
            radius: radius,
            request_id: requestId
        }),
        success: function(response) {
            // Iniciar polling para obter resultado
            startScanPolling(requestId, 0, coordX, coordY, coordZ, radius);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro ao iniciar escaneamento de região';
            showToast('Erro', errorMsg, 'error');
            // Limpar estado de escaneamento
            clearScanState();
        }
    });
}

/**
 * Mostrar círculo visual permanente no mapa durante escaneamento
 */
function showScanRegionVisual(centerX, centerY, centerZ, radius) {
    // Remover círculo anterior se existir
    if (MapState.scanRegionCircle) {
        MapState.map.removeLayer(MapState.scanRegionCircle);
        MapState.scanRegionCircle = null;
    }
    
    // Converter coordenadas DayZ para coordenadas do mapa
    // centerX = leste-oeste (X do DayZ)
    // centerY = norte-sul (Z do DayZ) - mas vem como coord_y do frontend
    // centerZ = altura (Y do DayZ) - mas vem como coord_z do frontend
    const pixelSize = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : 4096;
    const pixelX = (centerY / 15360.0) * pixelSize; // Y (norte-sul) vira lat do mapa
    const pixelY = (centerX / 15360.0) * pixelSize; // X (leste-oeste) vira lng do mapa
    const radiusInPixels = (radius / 15360.0) * pixelSize;
    
    const mapCoords = [pixelX, pixelY];
    
    // Criar círculo visual permanente (diferente do círculo do cursor)
    MapState.scanRegionCircle = L.circle(mapCoords, {
        radius: radiusInPixels,
        color: '#007bff',
        fillColor: '#007bff',
        fillOpacity: 0.3,
        weight: 3,
        dashArray: '10, 5'
    }).addTo(MapState.map);
    
    // Adicionar popup informativo
    MapState.scanRegionCircle.bindPopup(`
        <div>
            <strong>Escaneando região...</strong><br>
            <small>Centro: X=${centerX.toFixed(1)}, Y=${centerY.toFixed(1)}</small><br>
            <small>Raio: ${radius}m</small>
        </div>
    `).openPopup();
}

/**
 * Limpar estado de escaneamento
 */
function clearScanState() {
    MapState.isScanning = false;
    $('#btnModeScan').prop('disabled', false);
    
    // Remover círculo visual
    if (MapState.scanRegionCircle) {
        MapState.map.removeLayer(MapState.scanRegionCircle);
        MapState.scanRegionCircle = null;
    }
}

/**
 * Iniciar polling para obter resultado do escaneamento
 */
function startScanPolling(requestId, attempt, centerX, centerY, centerZ, radius) {
    const MAX_ATTEMPTS = 30; // 30 tentativas
    const POLL_INTERVAL = 2000; // 2 segundos entre tentativas
    
    if (attempt >= MAX_ATTEMPTS) {
        showToast('Aviso', 'Tempo limite excedido. O servidor pode estar processando o comando.', 'warning');
        clearScanState();
        // Modo normal já foi definido ao iniciar o escaneamento
        return;
    }
    
    // Fazer requisição para obter resultado
    $.get(`/api/commands/results/${requestId}`)
        .done(function(response) {
            if (response.status === 'ready') {
                // Resultado disponível
                markObjectsOnMap(response.data);
                showToast('Sucesso', `Escaneamento concluído: ${response.data.objects ? response.data.objects.length : 0} objetos encontrados`, 'success');
                clearScanState();
                // Modo normal já foi definido ao iniciar o escaneamento
            } else if (response.status === 'not_found' || response.status === 'processing') {
                // Resultado não encontrado ainda, continuar polling
                setTimeout(function() {
                    startScanPolling(requestId, attempt + 1, centerX, centerY, centerZ, radius);
                }, POLL_INTERVAL);
            } else {
                // Status desconhecido, continuar tentando
                setTimeout(function() {
                    startScanPolling(requestId, attempt + 1, centerX, centerY, centerZ, radius);
                }, POLL_INTERVAL);
            }
        })
        .fail(function(xhr) {
            // Em caso de erro, continuar tentando por algumas vezes
            if (attempt < 5) {
                setTimeout(function() {
                    startScanPolling(requestId, attempt + 1, centerX, centerY, centerZ, radius);
                }, POLL_INTERVAL);
            } else {
                showToast('Erro', 'Erro ao buscar resultado do escaneamento.', 'error');
                clearScanState();
                // Modo normal já foi definido ao iniciar o escaneamento
            }
        });
}

/**
 * Marcar objetos no mapa baseado nos resultados do escaneamento
 */
function markObjectsOnMap(scanData) {
    if (!scanData || !scanData.objects || scanData.objects.length === 0) {
        showToast('Info', 'Nenhum objeto encontrado na região escaneada', 'info');
        return;
    }
    
    console.log('markObjectsOnMap: Processando', scanData.objects.length, 'objetos');
    
    // Limpar marcadores anteriores se necessário (opcional - pode manter acumulados)
    // Para limpar: clearScanMarkers();
    
    let markedCount = 0;
    let skippedCount = 0;
    
    scanData.objects.forEach(function(obj) {
        if (!obj.position || obj.position.x === undefined || obj.position.y === undefined) {
            skippedCount++;
            return;
        }
        
        // Filtrar objetos sem tipo (tipo vazio)
        if (!obj.type || obj.type === '') {
            skippedCount++;
            return;
        }
        
        // Converter coordenadas DayZ para coordenadas do mapa
        // No DayZ Enforce Script: GetPosition() retorna [X, Y, Z]
        // - X = leste-oeste (horizontal)
        // - Y = altura (não usado para mapa)
        // - Z = norte-sul (vertical)
        // No backend Python: CoordX = X, CoordY = Z, CoordZ = Y
        // Conversão: pixel_x = (coord_x / 15360.0) * pixelSize
        //            pixel_y = (coord_z / 15360.0) * pixelSize (usar Z, não Y!)
        const pixelSize = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : 4096;
        const pixelX = (obj.position.x / 15360.0) * pixelSize; // X = leste-oeste
        const pixelY = (obj.position.z / 15360.0) * pixelSize; // Z = norte-sul (não Y que é altura!)
        
        // Leaflet usa [lat, lng] = [y, x]
        const mapCoords = [pixelY, pixelX];
        
        // Verificar se as coordenadas estão dentro dos bounds do mapa
        if (pixelX < 0 || pixelX > pixelSize || pixelY < 0 || pixelY > pixelSize) {
            console.warn('Objeto fora dos bounds do mapa:', obj, 'pixelCoords:', [pixelX, pixelY]);
            skippedCount++;
            return;
        }
        
        // Criar ícone baseado no tipo de objeto
        let icon = createScanObjectIcon(obj.type);
        
        // Criar marcador
        const marker = L.marker(mapCoords, {
            icon: icon,
            opacity: 0.9
        }).addTo(MapState.map);
        
        // Criar popup com informações do objeto
        const objName = obj.name || obj.type || 'Objeto desconhecido';
        const popupContent = `
            <div>
                <strong>${objName}</strong><br>
                <small>Tipo: ${obj.type || 'N/A'}</small><br>
                <small>X: ${obj.position.x.toFixed(1)}, Y: ${obj.position.y.toFixed(1)}</small>
                ${obj.position.z !== undefined ? `<br><small>Z: ${obj.position.z.toFixed(1)}</small>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent);
        
        // Armazenar marcador
        const markerId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        MapState.scanMarkers[markerId] = marker;
        
        markedCount++;
    });
    
    console.log(`Marcados ${markedCount} objetos no mapa de ${scanData.objects.length} objetos encontrados (${skippedCount} ignorados)`);
    
    if (markedCount === 0) {
        showToast('Aviso', `Nenhum objeto válido foi marcado no mapa. ${skippedCount} objetos foram ignorados (sem tipo ou fora dos bounds)`, 'warning');
    }
    
    // Nota: clearScanState() e setMode('normal') são chamados em startScanPolling()
}

/**
 * Criar ícone para objeto escaneado baseado no tipo
 */
function createScanObjectIcon(objectType) {
    if (!objectType) {
        objectType = 'Unknown';
    }
    
    let color, iconClass;
    const typeLower = objectType.toLowerCase();
    
    // Detectar tipo de objeto
    if (typeLower.includes('car') || typeLower.includes('vehicle') || typeLower.includes('truck') || typeLower.includes('sedan') || typeLower.includes('hatchback')) {
        // Veículos
        color = '#28a745';
        iconClass = 'fas fa-car';
    } else if (typeLower.includes('barrel') || typeLower.includes('crate') || typeLower.includes('container') || typeLower.includes('tent') || typeLower.includes('chest')) {
        // Containers
        color = '#007bff';
        iconClass = 'fas fa-box';
    } else if (typeLower.includes('weapon') || typeLower.includes('gun') || typeLower.includes('rifle') || typeLower.includes('pistol') || 
               typeLower.includes('shotgun') || typeLower.includes('akm') || typeLower.includes('mosin') || typeLower.includes('mag_') ||
               typeLower.includes('ammo') || typeLower.includes('bayonet') || typeLower.includes('glock') || typeLower.includes('fnx')) {
        // Armas e munições
        color = '#dc3545';
        iconClass = 'fas fa-crosshairs';
    } else if (typeLower.includes('pants') || typeLower.includes('jacket') || typeLower.includes('vest') || typeLower.includes('boots') ||
               typeLower.includes('gloves') || typeLower.includes('cap') || typeLower.includes('shirt') || typeLower.includes('mask') ||
               typeLower.includes('belt') || typeLower.includes('bag') || typeLower.includes('backpack')) {
        // Roupas e equipamentos
        color = '#9c27b0';
        iconClass = 'fas fa-tshirt';
    } else if (typeLower.includes('tree') || typeLower.includes('bush') || typeLower.includes('static_rock') || typeLower.includes('static_')) {
        // Objetos estáticos e natureza
        color = '#795548';
        iconClass = 'fas fa-tree';
    } else if (typeLower.includes('land_') || typeLower.includes('power') || typeLower.includes('panel')) {
        // Estruturas e objetos do terreno
        color = '#607d8b';
        iconClass = 'fas fa-building';
    } else {
        // Outros objetos/itens
        color = '#ffc107';
        iconClass = 'fas fa-cube';
    }
    
    return L.divIcon({
        className: 'scan-object-marker',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="${iconClass}" style="color: white; font-size: 10px;"></i></div>`,
        iconSize: [18, 18]
    });
}

/**
 * Limpar todos os marcadores de escaneamento
 */
function clearScanMarkers() {
    Object.keys(MapState.scanMarkers).forEach(function(key) {
        if (MapState.scanMarkers[key]) {
            MapState.map.removeLayer(MapState.scanMarkers[key]);
        }
    });
    MapState.scanMarkers = {};
    showToast('Info', 'Marcadores de escaneamento removidos', 'info');
}

/**
 * Verificar inventário de um jogador
 */
function checkPlayerInventory(playerId, playerName) {
    if (!MapState.currentPlayerContext || !MapState.currentPlayerContext.isOnline) {
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

