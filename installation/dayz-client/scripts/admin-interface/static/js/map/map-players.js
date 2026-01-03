/**
 * Módulo de Jogadores do Mapa
 * Lógica completa de jogadores, trails e ações
 */

/**
 * Função para escapar HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * Função para converter código de país em emoji de bandeira
 */
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return '';
    }
    
    // Converter código de país para emoji de bandeira
    // Cada letra é convertida para seu equivalente em Regional Indicator Symbol
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
}

/**
 * Formatar Date object para string local (sem conversao para UTC)
 * Formato: YYYY-MM-DD HH:MM:SS
 */
function formatDateLocal(date) {
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * Formatar timestamp para exibição em America/Sao_Paulo
 */
function formatTimestampBR(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return timestamp; // Fallback: retornar original se houver erro
    }
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
            // Nota: reapplyCurrentTrailFilter() é chamada dentro de updatePositions()
            // após os trails serem carregados (dentro do setTimeout de 500ms)
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
 * Animar movimento de marcador de forma suave
 */
function animateMarkerMove(marker, targetLatLng, duration) {
    const startLatLng = marker.getLatLng();
    const startLat = startLatLng.lat;
    const startLng = startLatLng.lng;
    const targetLat = targetLatLng[0];
    const targetLng = targetLatLng[1];
    
    const startTime = performance.now();
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Usar easing function para movimento suave (ease-out)
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        const currentLat = startLat + (targetLat - startLat) * easeProgress;
        const currentLng = startLng + (targetLng - startLng) * easeProgress;
        
        marker.setLatLng([currentLat, currentLng]);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

/**
 * Verificar se o marcador do jogador deve ser exibido
 * Retorna true se deve mostrar, false se deve ocultar
 */
function shouldShowPlayerMarker(playerId) {
    // Se trails não estão ativos ou não há filtro de data, mostrar normalmente
    if (!MapState.showTrails || !MapState.trailDateFilter.enabled) {
        return true;
    }
    
    // Se há filtro de inclusão ativo, mostrar apenas jogadores selecionados
    if (MapState.selectedPlayerFilters.length > 0) {
        return MapState.selectedPlayerFilters.includes(playerId);
    }
    
    // Verificar se o jogador tem trail válido no período filtrado
    const trailData = MapState.playerTrailsData[playerId];
    
    // Se não tem dados de trail ainda e não está carregando, ocultar até carregar
    // Isso evita mostrar jogadores que não têm registros no período
    if (!trailData && !MapState.loadingTrails[playerId]) {
        return false;
    }
    
    // Se o trail ainda está sendo carregado, ocultar temporariamente
    // (não mostrar até confirmar que tem dados)
    if (MapState.loadingTrails[playerId]) {
        return false;
    }
    
    // Se tem trail carregado, verificar se tem pontos
    if (Array.isArray(trailData) && trailData.length > 0) {
        return true;
    }
    
    // Trail foi carregado mas está vazio (sem pontos no período filtrado), ocultar
    return false;
}

/**
 * Atualizar visibilidade do marcador baseado no filtro de data
 */
function updatePlayerMarkerVisibility(playerId) {
    const marker = MapState.playerMarkers[playerId];
    if (!marker) {
        // Se o marcador não existe mas deveria ser mostrado, tentar criá-lo
        // Isso pode acontecer quando o trail é carregado antes do marcador ser criado
        const shouldShow = shouldShowPlayerMarker(playerId);
        if (shouldShow) {
            const playerData = MapState.playersData[playerId];
            if (playerData) {
                const color = getPlayerColor(playerId);
                const mapCoords = convertToMapCoords([playerData.coord_x, playerData.coord_y]);
                if (mapCoords) {
                    const newMarker = L.marker([mapCoords[0], mapCoords[1]], {
                        icon: createMarkerIcon(color, playerData.is_alive),
                        opacity: playerData.isOnline ? 1.0 : 0.9
                    }).addTo(MapState.map);
                    
                    // Adicionar tooltip e eventos
                    const tooltipContent = `
                        <strong>👤 ${playerData.name || playerId}${playerData.steamName ? ` (${playerData.steamName})` : ''}</strong><br>
                        ${playerData.isOnline ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
                        📍 Coords: <span class="value">X=${playerData.coord_x.toFixed(1)}, Y=${playerData.coord_y.toFixed(1)}</span>
                    `;
                    const tooltipDirection = getTooltipDirectionForPoint(mapCoords[0], mapCoords[1]);
                    newMarker.bindTooltip(tooltipContent, {
                        permanent: false,
                        direction: tooltipDirection,
                        className: 'trail-tooltip'
                    });
                    newMarker.on('click', function() {
                        showPlayerMarkerActions(null, playerId);
                    });
                    
                    MapState.playerMarkers[playerId] = newMarker;
                }
            }
        }
        return;
    }
    
    const shouldShow = shouldShowPlayerMarker(playerId);
    
    if (shouldShow) {
        // Mostrar marcador se estiver oculto
        if (!MapState.map.hasLayer(marker)) {
            marker.addTo(MapState.map);
        }
    } else {
        // Ocultar marcador se estiver visível
        if (MapState.map.hasLayer(marker)) {
            MapState.map.removeLayer(marker);
        }
    }
}

/**
 * Atualizar posições no mapa
 */
function updatePositions(data) {
    // Atualizar flag de CFTools disponível
    MapState.cftoolsAvailable = data.cftools_available || false;

    // Criar conjunto de IDs de jogadores atuais para identificar quais remover
    const currentPlayerIds = new Set();

    // Detectar conexões e desconexões de jogadores (antes de atualizar os dados)
    if (MapState.notificationsEnabled && Object.keys(MapState.previousPlayersData).length > 0) {
        const previousPlayerIds = new Set(Object.keys(MapState.previousPlayersData));
        const currentOnlineIds = new Set();

        // Coletar IDs de jogadores online atuais
        data.players.forEach(function(player) {
            if (player.is_online) {
                currentOnlineIds.add(player.player_id);
            }
        });

        // Detectar jogadores que conectaram (online agora, mas não estava antes)
        currentOnlineIds.forEach(function(playerId) {
            const wasOnline = MapState.previousPlayersData[playerId] && MapState.previousPlayersData[playerId].is_online;
            if (!wasOnline) {
                const player = data.players.find(p => p.player_id === playerId);
                if (player) {
                    const playerName = player.player_name || 'Desconhecido';
                    const steamName = player.steam_name ? ` (${player.steam_name})` : '';
                    showToast('Conexão', `${playerName}${steamName} conectou ao servidor`, 'success');
                    addNotificationToLog('success', `Conexão: ${playerName}${steamName} conectou ao servidor`);
                }
            }
        });

        // Detectar jogadores que desconectaram (estava online antes, mas não está mais)
        previousPlayerIds.forEach(function(playerId) {
            const wasOnline = MapState.previousPlayersData[playerId] && MapState.previousPlayersData[playerId].is_online;
            const isOnlineNow = currentOnlineIds.has(playerId);
            if (wasOnline && !isOnlineNow) {
                const previousData = MapState.previousPlayersData[playerId];
                const playerName = previousData.player_name || 'Desconhecido';
                const steamName = previousData.steam_name ? ` (${previousData.steam_name})` : '';
                showToast('Desconexão', `${playerName}${steamName} desconectou do servidor`, 'info');
                addNotificationToLog('info', `Desconexão: ${playerName}${steamName} desconectou do servidor`);
            }
        });
    }

    // Contadores de jogadores exibidos (usar Set para garantir unicidade)
    const countedPlayerIds = new Set();
    let onlineCount = 0;
    let offlineCount = 0;

    // Processar cada jogador
    data.players.forEach(function(player) {
        const playerId = player.player_id;
        currentPlayerIds.add(playerId);
        
        // Armazenar dados completos do jogador (para uso no modal e outras funcionalidades)
        MapState.playersData[playerId] = {
            name: player.player_name,
            steamName: player.steam_name,
            steamId: player.steam_id,
            isOnline: player.is_online,
            // Dados completos para uso no modal
            player_name: player.player_name,
            steam_name: player.steam_name,
            steam_id: player.steam_id,
            coord_x: player.coord_x,
            coord_y: player.coord_y,
            coord_z: player.coord_z,
            is_online: player.is_online,
            is_admin: player.is_admin || false,
            health: player.health,
            blood: player.blood,
            shock: player.shock,
            is_alive: player.is_alive,
            energy: player.energy,
            water: player.water,
            stamina: player.stamina,
            stamina_max: player.stamina_max,
            items_in_hands: player.items_in_hands,
            items_count: player.items_count,
            last_update: player.last_update,
            // Campos de geolocalização
            country: player.country,
            city: player.city,
            ip: player.ip,
            port: player.port,
            ping: player.ping,
            lat: player.lat,
            lon: player.lon,
            // Dados CFTools (se disponíveis)
            cftools: player.cftools || null
        };
        
        // Aplicar filtro se existir (múltiplos jogadores)
        if (MapState.selectedPlayerFilters.length > 0 && !MapState.selectedPlayerFilters.includes(playerId)) {
            // Remover marcador se não corresponde ao filtro
            if (MapState.playerMarkers[playerId]) {
                MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                delete MapState.playerMarkers[playerId];
            }
            // Remover trail e marcadores de backup se existirem
            removePlayerTrailAndBackups(playerId);
            return;
        }
        
        // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
        if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
            // Remover trail e marcadores de backup se existirem (marcador permanece, apenas trail é ocultado)
            removePlayerTrailAndBackups(playerId);
            // Continuar processando o jogador (marcador permanece visível)
        }
        
        // Verificar filtro "Apenas online"
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
        if (onlineOnlyFilterActive && !player.is_online) {
            // Se filtro "Apenas online" está ativo e jogador está offline, remover marcador e trail
            if (MapState.playerMarkers[playerId]) {
                MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                delete MapState.playerMarkers[playerId];
            }
            // Remover trail e marcadores de backup se existirem
            removePlayerTrailAndBackups(playerId);
            return; // Não processar jogador offline quando filtro está ativo
        }
        
        // Contar jogador (somente se passou pelo filtro e não foi contado ainda)
        if (!countedPlayerIds.has(playerId)) {
            countedPlayerIds.add(playerId);
            if (player.is_online) {
                onlineCount++;
            } else {
                offlineCount++;
            }
        }
        
        // Verificar se deve mostrar jogadores
        if (!MapState.showPlayers) {
            return;
        }
        
        // Verificar se deve mostrar marcador baseado no filtro de data do trail
        // Não deletar o marcador, apenas ocultá-lo se necessário
        // Isso permite que o trail seja carregado depois e o marcador seja mostrado novamente
        if (!shouldShowPlayerMarker(playerId)) {
            // Ocultar marcador se existir, mas manter no MapState para poder ser processado depois
            if (MapState.playerMarkers[playerId]) {
                if (MapState.map.hasLayer(MapState.playerMarkers[playerId])) {
                    MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                }
            }
            // Não retornar aqui - continuar processando para que o marcador seja criado/atualizado
            // O marcador será mostrado novamente quando o trail for carregado
        }
        
        const color = getPlayerColor(playerId);
        const mapCoords = convertToMapCoords(player.pixel_coords);
        
        if (!mapCoords) {
            return;
        }
        
        const lat = mapCoords[0];
        const lng = mapCoords[1];
        
        // Verificar se marcador já existe
        const existingMarker = MapState.playerMarkers[playerId];
        
        if (existingMarker) {
            // Marcador existe - atualizar ao invés de recriar
            const currentLatLng = existingMarker.getLatLng();
            const positionChanged = Math.abs(currentLatLng.lat - lat) > 0.0001 || Math.abs(currentLatLng.lng - lng) > 0.0001;
            
            // Verificar se posição mudou
            if (positionChanged) {
                // Obter posição anterior para animação
                const previousData = MapState.previousPlayersData[playerId];
                const hadPreviousPosition = previousData && previousData.coord_x !== undefined;
                
                // Animar movimento apenas para jogadores online que mudaram de posição
                if (player.is_online && hadPreviousPosition) {
                    // Usar animação manual para movimento suave
                    animateMarkerMove(existingMarker, [lat, lng], 500);
                } else {
                    // Atualizar sem animação para offline ou primeira vez
                    existingMarker.setLatLng([lat, lng]);
                }
            }
            
            // Atualizar opacidade se status mudou
            const currentOpacity = existingMarker.options.opacity || 1.0;
            const newOpacity = player.is_online ? 1.0 : 0.9;
            if (currentOpacity !== newOpacity) {
                existingMarker.setOpacity(newOpacity);
            }
            
            // Verificar se is_alive mudou e atualizar ícone se necessário
            const previousData = MapState.previousPlayersData[playerId];
            const previousIsAlive = previousData ? previousData.is_alive : undefined;
            const currentIsAlive = player.is_alive;
            
            if (previousIsAlive !== currentIsAlive) {
                // Status de vida mudou, atualizar ícone
                const newIcon = createMarkerIcon(color, currentIsAlive);
                existingMarker.setIcon(newIcon);
            }
            
            // Atualizar tooltip apenas se dados relevantes mudaram
            const tooltipContent = `
                <strong>👤 ${player.player_name}${player.steam_name ? ` (${player.steam_name})` : ''}</strong><br>
                ${player.is_online ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
                📍 Coords: <span class="value">X=${player.coord_x.toFixed(1)}, Y=${player.coord_y.toFixed(1)}</span><br>
                ${player.coord_z ? `📏 Altura: <span class="value">${player.coord_z.toFixed(1)}m</span><br>` : ''}
                ⏰ Atualizado: <span class="value">${player.last_update || 'Desconhecido'}</span>
            `;
            existingMarker.setTooltipContent(tooltipContent);
            
            // Se marcador se moveu e trails estão ativos, atualizar trail
            if (positionChanged && MapState.showTrails && player.is_online) {
                updatePlayerTrailOnMove(playerId, lat, lng);
            }
        } else {
            // Criar novo marcador apenas se não existir
            const marker = L.marker([lat, lng], {
                icon: createMarkerIcon(color, player.is_alive),
                opacity: player.is_online ? 1.0 : 0.9
            });
            
            // Se filtro de data está ativo, não adicionar ao mapa ainda
            // Será adicionado quando o trail for carregado e tiver pontos
            if (!MapState.showTrails || !MapState.trailDateFilter.enabled || shouldShowPlayerMarker(playerId)) {
                marker.addTo(MapState.map);
            }
            
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
            // Passar apenas playerId para buscar dados atualizados de MapState.playersData
            marker.on('click', function() {
                showPlayerMarkerActions(null, playerId);
            });
            
            MapState.playerMarkers[playerId] = marker;
        }
    });
    
    // Remover marcadores de jogadores que não existem mais nos dados
    const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
    Object.keys(MapState.playerMarkers).forEach(function(playerId) {
        if (!currentPlayerIds.has(playerId)) {
            // Jogador não está mais na resposta da API
            // Se filtro "Apenas online" está ativo, remover sempre (API só retorna online)
            // Se filtro não está ativo, verificar se não está filtrado (se houver filtro, manter)
            const shouldRemove = onlineOnlyFilterActive || 
                                 (MapState.selectedPlayerFilters.length === 0 || !MapState.selectedPlayerFilters.includes(playerId));
            
            if (shouldRemove) {
                MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                delete MapState.playerMarkers[playerId];
                // Remover trail também
                // Remover trail e marcadores de backup
                removePlayerTrailAndBackups(playerId);
                // Limpar dados do jogador de MapState.playersData se não está mais na resposta
                // (especialmente importante quando filtro "Apenas online" está ativo)
                if (onlineOnlyFilterActive) {
                    delete MapState.playersData[playerId];
                }
            }
        } else if (onlineOnlyFilterActive) {
            // Se filtro "Apenas online" está ativo, verificar se jogador está offline e remover
            const playerData = MapState.playersData[playerId];
            if (playerData && !playerData.isOnline && !playerData.is_online) {
                // Jogador está offline, remover marcador e trail
                if (MapState.playerMarkers[playerId]) {
                    MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                    delete MapState.playerMarkers[playerId];
                }
                // Remover trail e marcadores de backup
                removePlayerTrailAndBackups(playerId);
            }
        }
    });
    
    // CORREÇÃO: Sempre limpar MapState.playersData para jogadores que não aparecem mais na resposta
    // (importante para evitar dados desatualizados no modal e contadores incorretos)
    // ANTES: Esta limpeza só ocorria quando filtro "Apenas online" estava ativo,
    // causando acúmulo de dados antigos e contadores incorretos
    Object.keys(MapState.playersData).forEach(function(playerId) {
        if (!currentPlayerIds.has(playerId)) {
            // Jogador não está mais na resposta do backend, limpar completamente
            delete MapState.playersData[playerId];
            
            // Também remover marcador e trail se existirem
            if (MapState.playerMarkers[playerId]) {
                if (MapState.map.hasLayer(MapState.playerMarkers[playerId])) {
                    MapState.map.removeLayer(MapState.playerMarkers[playerId]);
                }
                delete MapState.playerMarkers[playerId];
            }
            removePlayerTrailAndBackups(playerId);
            
            console.log('🗑️ Removido jogador que não está mais na resposta:', playerId);
        }
    });
    
    // Atualizar badges após carregar dados (para atualizar status online/offline)
    if (MapState.selectedPlayerFilters.length > 0) {
        updateSelectedPlayersBadges();
    }
    if (MapState.excludedPlayerFilters.length > 0) {
        updateExcludedPlayersBadges();
    }
    
    // Atualizar contadores na UI
    $('#mapOnlineCount').text(onlineCount);
    $('#mapOfflineCount').text(offlineCount);
    $('#mapTotalCount').text(onlineCount + offlineCount);
    
    if (MapState.showTrails) {
        setTimeout(function() {
            // Atualizar timeline para tempo real (se liveMode ativo)
            if (typeof MapTimeline !== 'undefined' && MapTimeline.enabled) {
                MapTimeline.refreshToNow();
            }

            // Carregar trails de todos os jogadores (respeitando filtro "Apenas online" e exclusões)
            // Usar MapState.playersData ao invés de MapState.playerMarkers para incluir todos os jogadores,
            // incluindo aqueles cujos marcadores foram ocultados temporariamente
            const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
            const playerIdsToLoad = [];
            
            Object.keys(MapState.playersData).forEach(function(playerId) {
                // Se filtro de inclusão está ativo, verificar se jogador está selecionado
                if (MapState.selectedPlayerFilters.length > 0) {
                    if (!MapState.selectedPlayerFilters.includes(playerId)) {
                        // Jogador não está selecionado, não carregar trail
                        return;
                    }
                }
                
                // Se filtro "Apenas online" está ativo, verificar se jogador está online
                if (onlineOnlyFilterActive) {
                    const playerData = MapState.playersData[playerId];
                    if (!playerData || !playerData.isOnline) {
                        // Jogador está offline, não carregar trail
                        return;
                    }
                }
                
                // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
                if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
                    // Jogador está excluído, não carregar trail
                    return;
                }
                
                playerIdsToLoad.push(playerId);
            });
            
            // Carregar trails em lote
            if (playerIdsToLoad.length > 0) {
                loadPlayerTrailsBatch(playerIdsToLoad);
            }
            // Atualizar filtro de trails após carregar todos os trails
            // Isso garante que os campos de data/hora sejam atualizados automaticamente durante o auto-refresh
            // Apenas se houver um atalho rápido ou filtro personalizado ativo
            if (typeof reapplyCurrentTrailFilter === 'function' && 
                (MapState.activeTrailShortcut || MapState.hasCustomFilter)) {
                reapplyCurrentTrailFilter();
            }
        }, 500);
    }
    
    hideLoading();
    console.log(`Posições atualizadas: ${data.players.length} jogadores`);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousPlayersData = {};
    data.players.forEach(function(player) {
        MapState.previousPlayersData[player.player_id] = {
            coord_x: player.coord_x,
            coord_y: player.coord_y,
            is_online: player.is_online,
            is_alive: player.is_alive,
            player_name: player.player_name,
            steam_name: player.steam_name
        };
    });
    
    // Atualizar lista de jogadores online na sidebar
    if (typeof updateSidebarPlayersList === 'function') {
        updateSidebarPlayersList();
    }
}

/**
 * Carregar trails de múltiplos jogadores em lote
 */
function loadPlayerTrailsBatch(playerIds) {
    if (!MapState.showTrails || !playerIds || playerIds.length === 0) return;
    
    // Filtrar apenas jogadores que não estão sendo carregados
    const idsToLoad = playerIds.filter(playerId => !MapState.loadingTrails[playerId]);
    
    if (idsToLoad.length === 0) return;
    
    // Marcar todos como "em andamento"
    idsToLoad.forEach(playerId => {
        MapState.loadingTrails[playerId] = true;
    });
    
    // Preparar parâmetros da requisição
    const params = {
        limit: 100
    };
    
    // Adicionar filtros de data se estiverem ativos
    if (MapState.trailDateFilter.enabled) {
        if (MapState.trailDateFilter.startDate) {
            params.date_from = formatDateLocal(MapState.trailDateFilter.startDate);
        }
        if (MapState.trailDateFilter.endDate) {
            params.date_to = formatDateLocal(MapState.trailDateFilter.endDate);
        }
    }
    
    // Dividir em lotes menores para evitar timeouts
    // Reduzir batch size para 25 para melhor performance
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < idsToLoad.length; i += batchSize) {
        batches.push(idsToLoad.slice(i, i + batchSize));
    }
    
    // Processar cada lote
    batches.forEach((batch, batchIndex) => {
        setTimeout(() => {
            $.ajax({
                url: '/api/players/trails/batch',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    player_ids: batch,
                    limit: params.limit,
                    date_from: params.date_from,
                    date_to: params.date_to
                }),
                timeout: 60000 // 60 segundos de timeout (aumentado para evitar timeouts)
            })
            .done(function(data) {
                // Processar cada trail retornado
                batch.forEach(playerId => {
                    const trail = data[playerId] || [];
                    
                    // Verificar novamente se filtro ainda está ativo e jogador ainda está online
                    const onlineOnlyFilterStillActive = $('#onlineOnlyCheck').is(':checked');
                    if (onlineOnlyFilterStillActive) {
                        const playerData = MapState.playersData[playerId];
                        if (!playerData || !playerData.isOnline) {
                            // Jogador ficou offline durante o carregamento, não desenhar trail
                            delete MapState.loadingTrails[playerId];
                            return;
                        }
                    }
                    
                    // Armazenar trail completo para comparação entre pontos
                    MapState.playerTrailsData[playerId] = trail;
                    
                    // Desenhar trail (mesmo se vazio, para limpar trail anterior)
                    drawTrail(playerId, trail);
                    
                    // Atualizar visibilidade do marcador baseado no resultado do trail
                    updatePlayerMarkerVisibility(playerId);
                    
                    // Limpar flag de "em andamento"
                    delete MapState.loadingTrails[playerId];
                });
            })
            .fail(function(xhr, status, error) {
                console.error('Erro ao carregar trails em lote:', error);
                // Em caso de erro, tentar carregar individualmente como fallback
                batch.forEach(playerId => {
                    delete MapState.loadingTrails[playerId];
                    // Tentar carregar individualmente apenas se não for timeout
                    if (status !== 'timeout') {
                        loadPlayerTrail(playerId);
                    }
                });
            });
        }, batchIndex * 100); // Pequeno delay entre lotes para evitar sobrecarga
    });
}

/**
 * Carregar trail de um jogador (mantido para compatibilidade e casos especiais)
 */
function loadPlayerTrail(playerId) {
    if (!MapState.showTrails) return;
    
    // Proteção contra requisições duplicadas
    if (MapState.loadingTrails[playerId]) {
        return; // Já há uma requisição em andamento para este jogador
    }
    
    // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
    if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
        // Jogador está excluído, não carregar trail
        if (MapState.playerTrails[playerId]) {
            const trail = MapState.playerTrails[playerId];
            removePlayerTrailAndBackups(playerId);
        }
        return;
    }
    
    // Verificar filtro "Apenas online"
    const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
    if (onlineOnlyFilterActive) {
        // Verificar se jogador está online
        const playerData = MapState.playersData[playerId];
        if (!playerData || !playerData.isOnline) {
            // Jogador está offline e filtro está ativo, remover trail e marcadores de backup se existirem
            removePlayerTrailAndBackups(playerId);
            return; // Não carregar trail de jogador offline quando filtro está ativo
        }
    }
    
    // Marcar como "em andamento"
    MapState.loadingTrails[playerId] = true;
    
    // Preparar parâmetros da requisição
    const params = {
        limit: 100
    };
    
    // Adicionar filtros de data se estiverem ativos
    if (MapState.trailDateFilter.enabled) {
        if (MapState.trailDateFilter.startDate) {
            params.date_from = formatDateLocal(MapState.trailDateFilter.startDate);
        }
        if (MapState.trailDateFilter.endDate) {
            params.date_to = formatDateLocal(MapState.trailDateFilter.endDate);
        }
    }
    
    $.get(`/api/players/${playerId}/trail`, params)
        .done(function(data) {
            // Verificar novamente se filtro ainda está ativo e jogador ainda está online
            const onlineOnlyFilterStillActive = $('#onlineOnlyCheck').is(':checked');
            if (onlineOnlyFilterStillActive) {
                const playerData = MapState.playersData[playerId];
                if (!playerData || !playerData.isOnline) {
                    // Jogador ficou offline durante o carregamento, não desenhar trail
                    delete MapState.loadingTrails[playerId];
                    return;
                }
            }
            
            // Armazenar trail completo para comparação entre pontos
            MapState.playerTrailsData[playerId] = data.trail;
            
            // Desenhar trail (mesmo se vazio, para limpar trail anterior)
            drawTrail(playerId, data.trail);
            
            // Atualizar visibilidade do marcador baseado no resultado do trail
            updatePlayerMarkerVisibility(playerId);
        })
        .fail(function() {
            console.error('Erro ao carregar trail');
        })
        .always(function() {
            // Sempre limpar flag de "em andamento" ao finalizar (sucesso ou erro)
            delete MapState.loadingTrails[playerId];
        });
}

/**
 * Desenhar trail de um jogador
 */
/**
 * Remover trail e marcadores de backup de um jogador específico
 * @param {string} playerId - ID do jogador
 */
function removePlayerTrailAndBackups(playerId) {
    // Remover trail
    if (MapState.playerTrails[playerId]) {
        const trail = MapState.playerTrails[playerId];
        if (Array.isArray(trail)) {
            trail.forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(trail);
        }
        delete MapState.playerTrails[playerId];
    }
    
    // Remover marcadores de backup
    if (MapState.playerBackupMarkers[playerId]) {
        const backupMarkers = MapState.playerBackupMarkers[playerId];
        if (Array.isArray(backupMarkers)) {
            backupMarkers.forEach(item => MapState.map.removeLayer(item));
        } else {
            MapState.map.removeLayer(backupMarkers);
        }
        delete MapState.playerBackupMarkers[playerId];
    }
}

function drawTrail(playerId, trail) {
    // Remover trail e marcadores de backup antigos
    removePlayerTrailAndBackups(playerId);
    
    MapState.playerTrails[playerId] = [];
    MapState.playerBackupMarkers[playerId] = [];
    
    if (trail.length === 0) {
        // Se há filtro de data ativo e trail está vazio, ocultar marcador
        if (MapState.trailDateFilter.enabled) {
            if (MapState.playerMarkers[playerId]) {
                MapState.map.removeLayer(MapState.playerMarkers[playerId]);
            }
        }
        return;
    }
    
    // O backend já filtra os dados corretamente baseado em date_from e date_to
    // Não precisamos filtrar novamente no frontend
    
    // Separar pontos normais de pontos com backup
    const normalPoints = [];
    const backupPoints = [];
    
    trail.forEach(function(point) {
        const coords = convertToMapCoords(point.pixel_coords);
        if (coords) {
            const processedPoint = {
                data: point,
                mapCoords: coords
            };
            
            if (point.has_backup) {
                backupPoints.push(processedPoint);
            } else {
                normalPoints.push(processedPoint);
            }
        }
    });
    
    // Desenhar marcadores de backup separadamente (apenas se filtro ativo)
    if (backupPoints.length > 0 && MapState.showBackupMarkers) {
        drawBackupMarkers(playerId, backupPoints, trail);
    }
    
    // Se não há pontos normais, não criar trail
    if (normalPoints.length === 0) {
        return;
    }
    
    // IMPORTANTE: Inverter ordem dos pontos para mostrar do mais antigo para o mais recente
    // Os pontos vêm do servidor ordenados do mais recente para o mais antigo:
    //   normalPoints[0] = ponto MAIS RECENTE
    //   normalPoints[n] = ponto MAIS ANTIGO
    // Precisamos inverter para que o cálculo de velocidade compare com o ponto cronologicamente anterior
    const reversedTrail = normalPoints.slice().reverse();
    const color = getPlayerColor(playerId);
    
    // Criar múltiplas polylines separadas quando houver mudança de is_alive
    // Isso evita linhas conectando pontos antes/depois de morte/respawn
    const polylineSegments = [];
    let currentSegment = [];
    
    for (let i = 0; i < reversedTrail.length; i++) {
        const point = reversedTrail[i];
        const pointData = point.data;
        
        // Verificar se há mudança de is_alive em relação ao ponto anterior
        if (i > 0) {
            const prevPoint = reversedTrail[i - 1];
            const prevIsAlive = prevPoint.data.is_alive;
            const currentIsAlive = pointData.is_alive;
            
            // Se houver mudança de is_alive (vivo→morto ou morto→vivo), quebrar a linha
            if (prevIsAlive !== undefined && currentIsAlive !== undefined && 
                prevIsAlive !== currentIsAlive) {
                // Finalizar segmento atual se tiver pontos
                if (currentSegment.length > 0) {
                    polylineSegments.push(currentSegment);
                    currentSegment = [];
                }
            }
        }
        
        // Adicionar ponto ao segmento atual
        currentSegment.push(point.mapCoords);
    }
    
    // Adicionar último segmento se tiver pontos
    if (currentSegment.length > 0) {
        polylineSegments.push(currentSegment);
    }
    
    // Adicionar posição atual do jogador ao último segmento se estiver online
    const currentMarker = MapState.playerMarkers[playerId];
    if (currentMarker && polylineSegments.length > 0) {
        const currentLatLng = currentMarker.getLatLng();
        const isOnline = currentMarker.options.opacity === 1.0;
        
        if (isOnline && currentLatLng) {
            const lastSegment = polylineSegments[polylineSegments.length - 1];
            if (lastSegment.length > 0) {
                const lastTrailPoint = lastSegment[lastSegment.length - 1];
                const distance = Math.sqrt(
                    Math.pow(currentLatLng.lat - lastTrailPoint[0], 2) + 
                    Math.pow(currentLatLng.lng - lastTrailPoint[1], 2)
                );
                
                // Se posição atual está significativamente diferente do último ponto do trail, adicionar
                if (distance > 0.0001) {
                    lastSegment.push([currentLatLng.lat, currentLatLng.lng]);
                }
            }
        }
    }
    
    // Criar uma polyline para cada segmento
    polylineSegments.forEach(function(segment) {
        if (segment.length > 1) {
            const polyline = L.polyline(segment, {
                color: color,
                weight: 4,
                opacity: 0.85,
                smoothFactor: 1.0
            }).addTo(MapState.map);
            
            MapState.playerTrails[playerId].push(polyline);
        }
    });
    
    // Adicionar marcadores em cada ponto normal (sem backup) com cálculo de velocidade
    // IMPORTANTE: Usar reversedTrail (ordem cronológica) ao invés de normalPoints (ordem invertida)
    // para que o cálculo de velocidade compare com o ponto cronologicamente anterior
    for (let i = 0; i < reversedTrail.length; i++) {
        const point = reversedTrail[i].data;
        const pointLat = reversedTrail[i].mapCoords[0];
        const pointLng = reversedTrail[i].mapCoords[1];
        const playerData = MapState.playersData[playerId];
        const playerName = playerData?.name || 'Jogador';
        const steamName = playerData?.steamName || '';

        // Verificar se é o último ponto (mais recente) - após reverse(), o mais recente está no final do array
        const isLastPoint = (i === reversedTrail.length - 1);

        let tooltipText;
        let pointColor = color;

        if (isLastPoint) {
            // Último ponto: tooltip igual ao modo sem trails
            tooltipText = `
                <strong>👤 ${playerName}${steamName ? ` (${steamName})` : ''}</strong><br>
                ${playerData?.isOnline ? '🟢 <span class="value">Online</span>' : '🔴 <span class="value">Offline</span>'}<br>
                📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span><br>
                ${point.coord_z ? `📏 Altura: <span class="value">${point.coord_z.toFixed(1)}m</span><br>` : ''}
                ⏰ Atualizado: <span class="value">${formatTimestampBR(point.timestamp)}</span>
            `;
        } else {
            // Pontos intermediários: tooltip com informações de velocidade
            tooltipText = `<strong>👤 ${playerName}${steamName ? ` (${steamName})` : ''}</strong><br>`;
            tooltipText += `<strong>📍 Ponto ${i + 1}</strong><br>`;
            tooltipText += `⏰ Tempo: <span class="value">${formatTimestampBR(point.timestamp)}</span><br>`;
            tooltipText += `📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span>`;

            // Calcular velocidade se houver ponto anterior (cronologicamente)
            if (i > 0) {
                const prevPoint = reversedTrail[i - 1].data;

                // Calcular distância em metros (Pitágoras)
                const dx = point.coord_x - prevPoint.coord_x;
                const dy = point.coord_y - prevPoint.coord_y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Calcular diferença de tempo em segundos
                const time1 = new Date(point.timestamp);
                const time2 = new Date(prevPoint.timestamp);
                const timeDiff = Math.abs(time2 - time1) / 1000; // segundos

                // Calcular velocidade em km/h
                if (timeDiff > 0) {
                    const speed = (distance / timeDiff) * 3.6; // m/s para km/h

                    tooltipText += `<br><br><strong>📊 Desde último ponto:</strong><br>`;
                    tooltipText += `📏 Distância: <span class="value">${distance.toFixed(1)}m</span><br>`;
                    tooltipText += `⏱️ Tempo: <span class="value">${timeDiff.toFixed(1)}s</span><br>`;
                    tooltipText += `🚀 Velocidade: <span class="value">${speed.toFixed(1)} km/h</span>`;

                    // Velocidade suspeita (>50 km/h) - apenas se tempo >= 5 segundos para evitar falsos positivos
                    // Considera também distância mínima para evitar erros de medição
                    if (timeDiff >= 5 && distance >= 10 && speed > 50) {
                        pointColor = '#ff0000'; // vermelho mais vibrante
                        tooltipText += `<br><br><span style="color: #ff5252; font-weight: bold; font-size: 14px; background: rgba(255,0,0,0.2); padding: 4px 8px; border-radius: 4px; display: inline-block;">⚠️ VELOCIDADE SUSPEITA!</span>`;
                    }
                }
            }
        }

        // Criar marcador no ponto
        let pointMarker;

        if (isLastPoint) {
            // Último ponto: usar ícone estilizado igual ao modo sem trails (com animação pulsante)
            // Verificar se jogador tem posição mais recente no marcador principal
            let markerCoords = reversedTrail[i].mapCoords;
            const playerMarker = MapState.playerMarkers[playerId];
            if (playerMarker && typeof playerMarker.getLatLng === 'function') {
                const currentPos = playerMarker.getLatLng();
                if (currentPos) {
                    markerCoords = [currentPos.lat, currentPos.lng];
                }
            }

            const styledIcon = createMarkerIcon(color, point.is_alive !== false);
            pointMarker = L.marker(markerCoords, {
                icon: styledIcon
            }).addTo(MapState.map);
        } else if (point.is_alive === false) {
            // Ponto intermediário com jogador morto - usar ícone de caveira vermelha menor
            const skullSize = 20;
            const skullFontSize = 12;
            const skullIcon = L.divIcon({
                className: 'trail-point-marker',
                html: `<div style="background-color: #dc3545; border: 2px solid white; width: ${skullSize}px; height: ${skullSize}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                         <i class="fas fa-skull" style="color: white; font-size: ${skullFontSize}px;"></i>
                       </div>`,
                iconSize: [skullSize, skullSize],
                iconAnchor: [skullSize / 2, skullSize / 2]
            });
            pointMarker = L.marker(reversedTrail[i].mapCoords, {
                icon: skullIcon
            }).addTo(MapState.map);
        } else {
            // Ponto intermediário normal - usar circleMarker padrão
            pointMarker = L.circleMarker(
                reversedTrail[i].mapCoords,
                {
                    radius: 5,
                    fillColor: pointColor,
                    color: 'white',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 1.0
                }
            ).addTo(MapState.map);
        }

        // Adicionar evento de clique
        if (isLastPoint) {
            // Último ponto: mesmo comportamento do modo sem trails
            pointMarker.on('click', function() {
                showPlayerMarkerActions(null, playerId);
            });
        } else {
            // Pontos intermediários: menu de ações do ponto
            pointMarker.on('click', function() {
                // Encontrar índice do ponto no trail completo
                const fullTrail = MapState.playerTrailsData[playerId] || trail;
                let pointIndexInFullTrail = -1;

                // Tentar encontrar pelo player_coord_id primeiro
                if (point.player_coord_id) {
                    for (let j = 0; j < fullTrail.length; j++) {
                        if (fullTrail[j].player_coord_id === point.player_coord_id) {
                            pointIndexInFullTrail = j;
                            break;
                        }
                    }
                }

                // Se não encontrou, tentar por coordenadas e timestamp
                if (pointIndexInFullTrail === -1) {
                    for (let j = 0; j < fullTrail.length; j++) {
                        const trailPoint = fullTrail[j];
                        const coordMatch = Math.abs(trailPoint.coord_x - point.coord_x) < 0.1 &&
                                         Math.abs(trailPoint.coord_y - point.coord_y) < 0.1;
                        const timeMatch = trailPoint.timestamp === point.timestamp;

                        if (coordMatch && timeMatch) {
                            pointIndexInFullTrail = j;
                            break;
                        }
                    }
                }

                // Se ainda não encontrou, usar índice no trail filtrado como fallback
                if (pointIndexInFullTrail === -1) {
                    pointIndexInFullTrail = trail.indexOf(point);
                }

                showPointActionsMenu(playerId, point, trail.length - i, pointIndexInFullTrail, fullTrail);
            });
        }

        // Adicionar cursor pointer
        if (pointMarker.getElement) {
            pointMarker.getElement().style.cursor = 'pointer';
        }

        // Adicionar tooltip (direção dinâmica baseada na posição)
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);

        pointMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'trail-tooltip'
        });

        MapState.playerTrails[playerId].push(pointMarker);
    }
}

/**
 * Desenhar marcadores de backup separados do trail
 * @param {string} playerId - ID do jogador
 * @param {Array} backupPoints - Array de pontos com backup (já processados com mapCoords)
 * @param {Array} fullTrail - Trail completo (para encontrar índices corretos)
 */
function drawBackupMarkers(playerId, backupPoints, fullTrail) {
    const playerName = MapState.playersData[playerId]?.name || 'Jogador';
    const steamName = MapState.playersData[playerId]?.steamName || '';
    
    backupPoints.forEach(function(backupPoint) {
        const point = backupPoint.data;
        const pointLat = backupPoint.mapCoords[0];
        const pointLng = backupPoint.mapCoords[1];
        
        // Tooltip para backup
        let tooltipText = `<strong>👤 ${playerName}${steamName ? ` (${steamName})` : ''}</strong><br>`;
        tooltipText += `<strong>💾 Ponto de Backup</strong><br>`;
        tooltipText += `⏰ Tempo: <span class="value">${formatTimestampBR(point.timestamp)}</span><br>`;
        tooltipText += `📍 Coords: <span class="value">X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}</span>`;
        tooltipText += `<br><br><span style="color: #4caf50; font-weight: bold;">💾 Backup disponível</span>`;
        tooltipText += `<br><span style="color: #4caf50; font-weight: bold;">🖱️ Clique para restaurar backup</span>`;
        tooltipText += `<br><br><span style="color: #ff9800; font-size: 11px;">⚠️ Timestamp aproximado (pode ter até 3min de imprecisão)</span>`;
        
        // Criar marcador especial para backup (ícone de disco)
        const backupIconSize = 28;
        const backupIcon = L.divIcon({
            className: 'backup-marker',
            html: `<div style="background-color: #4caf50; border: 3px solid white; width: ${backupIconSize}px; height: ${backupIconSize}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 6px rgba(0,0,0,0.4);">
                     <i class="fas fa-database" style="color: white; font-size: 14px;"></i>
                   </div>`,
            iconSize: [backupIconSize, backupIconSize],
            iconAnchor: [backupIconSize / 2, backupIconSize / 2]
        });
        
        const backupMarker = L.marker(backupPoint.mapCoords, {
            icon: backupIcon
        }).addTo(MapState.map);
        
        // Adicionar evento de clique para restaurar backup
        backupMarker.on('click', function() {
            // Encontrar índice do ponto no trail completo
            let pointIndexInFullTrail = -1;
            
            // Tentar encontrar pelo player_coord_id primeiro
            if (point.player_coord_id) {
                for (let j = 0; j < fullTrail.length; j++) {
                    if (fullTrail[j].player_coord_id === point.player_coord_id) {
                        pointIndexInFullTrail = j;
                        break;
                    }
                }
            }
            
            // Se não encontrou, tentar por coordenadas e timestamp
            if (pointIndexInFullTrail === -1) {
                for (let j = 0; j < fullTrail.length; j++) {
                    const trailPoint = fullTrail[j];
                    const coordMatch = Math.abs(trailPoint.coord_x - point.coord_x) < 0.1 &&
                                     Math.abs(trailPoint.coord_y - point.coord_y) < 0.1;
                    const timeMatch = trailPoint.timestamp === point.timestamp;
                    
                    if (coordMatch && timeMatch) {
                        pointIndexInFullTrail = j;
                        break;
                    }
                }
            }
            
            // Se ainda não encontrou, usar índice no trail filtrado como fallback
            if (pointIndexInFullTrail === -1) {
                pointIndexInFullTrail = fullTrail.indexOf(point);
            }
            
            // Calcular número do ponto baseado na posição no fullTrail
            // fullTrail está ordenado do mais recente (índice 0) para o mais antigo (índice N)
            // O número do ponto é fullTrail.length - pointIndexInFullTrail
            let pointNumber = 0;
            if (pointIndexInFullTrail !== -1 && fullTrail.length > 0) {
                pointNumber = fullTrail.length - pointIndexInFullTrail;
            }
            
            showPointActionsMenu(playerId, point, pointNumber, pointIndexInFullTrail, fullTrail);
        });
        
        // Adicionar cursor pointer
        if (backupMarker.getElement) {
            backupMarker.getElement().style.cursor = 'pointer';
        }
        
        // Adicionar tooltip
        const tooltipDirection = getTooltipDirectionForPoint(pointLat, pointLng);
        
        backupMarker.bindTooltip(tooltipText, {
            permanent: false,
            direction: tooltipDirection,
            className: 'backup-tooltip'
        });
        
        // Armazenar marcador
        MapState.playerBackupMarkers[playerId].push(backupMarker);
    });
}

/**
 * Atualizar trail quando jogador se move
 */
function updatePlayerTrailOnMove(playerId, newLat, newLng) {
    if (!MapState.showTrails || !MapState.playerTrails[playerId]) {
        return;
    }
    
    // Verificar se há trail existente
    const existingTrail = MapState.playerTrails[playerId];
    if (!existingTrail || existingTrail.length === 0) {
        // Se não há trail, carregar trail completo
        loadPlayerTrail(playerId);
        return;
    }
    
    // Obter última polyline do trail
    const lastPolyline = existingTrail.find(item => item instanceof L.Polyline);
    if (!lastPolyline) {
        return;
    }
    
    // Obter coordenadas atuais da polyline
    const currentLatLngs = lastPolyline.getLatLngs();
    if (!currentLatLngs || currentLatLngs.length === 0) {
        return;
    }
    
    // Obter último ponto
    const lastPoint = currentLatLngs[currentLatLngs.length - 1];
    const lastLat = lastPoint.lat || lastPoint[0];
    const lastLng = lastPoint.lng || lastPoint[1];
    
    // Verificar se posição mudou significativamente (mais de 0.0001 graus)
    const distance = Math.sqrt(Math.pow(newLat - lastLat, 2) + Math.pow(newLng - lastLng, 2));
    if (distance < 0.0001) {
        return; // Posição não mudou significativamente
    }
    
    // Adicionar novo ponto à polyline existente
    const newPoint = [newLat, newLng];
    currentLatLngs.push(newPoint);
    lastPolyline.setLatLngs(currentLatLngs);

    // Atualizar visualmente com animação suave
    lastPolyline.redraw();

    // Atualizar posição do ícone estilizado (último marcador no array)
    const lastMarker = existingTrail[existingTrail.length - 1];
    if (lastMarker && lastMarker instanceof L.Marker && typeof lastMarker.setLatLng === 'function') {
        lastMarker.setLatLng(newPoint);
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
        // Desativar timeline quando jogadores sao ocultados
        if (typeof MapTimeline !== 'undefined') {
            MapTimeline.disable();
        }
    }
}

/**
 * Desativar trails e remover do mapa
 */
function disableTrails() {
    if (MapState.showTrails) {
        MapState.showTrails = false;
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar Trails');
        // Desativar timeline interativa
        if (typeof MapTimeline !== 'undefined') {
            MapTimeline.disable();
        }
        // Limpar filtros
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
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
        
        // Remover todos os marcadores de backup
        Object.keys(MapState.playerBackupMarkers).forEach(function(key) {
            const backupMarkers = MapState.playerBackupMarkers[key];
            if (Array.isArray(backupMarkers)) {
                backupMarkers.forEach(item => MapState.map.removeLayer(item));
            } else {
                MapState.map.removeLayer(backupMarkers);
            }
        });
        MapState.playerBackupMarkers = {};
    }
}

/**
 * Toggle mostrar trails
 */
function toggleTrails() {
    // Validar se jogadores estão visíveis antes de ativar
    if (!MapState.showPlayers) {
        showToast('Aviso', 'E necessario ativar "Mostrar Jogadores" para usar trails', 'warning');
        return;
    }
    MapState.showTrails = !MapState.showTrails;

    if (MapState.showTrails) {
        $('#toggleTrailsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar trails dos jogadores');
        // Ativar timeline interativa
        if (typeof MapTimeline !== 'undefined') {
            MapTimeline.enable();
        }
        // Coletar IDs de jogadores que precisam de trail
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
        const playerIdsToLoad = [];
        
        // Usar MapState.playersData para incluir todos os jogadores, não apenas os que têm marcadores visíveis
        Object.keys(MapState.playersData).forEach(function(playerId) {
            // Se filtro de inclusão está ativo, verificar se jogador está selecionado
            if (MapState.selectedPlayerFilters.length > 0) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    // Jogador não está selecionado, não carregar trail
                    return;
                }
            }
            
            if (onlineOnlyFilterActive) {
                const playerData = MapState.playersData[playerId];
                if (!playerData || !playerData.isOnline) {
                    return;
                }
            }
            
            // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
            if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
                return;
            }
            
            playerIdsToLoad.push(playerId);
        });
        
        // Carregar trails em lote
        if (playerIdsToLoad.length > 0) {
            loadPlayerTrailsBatch(playerIdsToLoad);
        }
        
        // Após carregar trails, atualizar visibilidade de todos os marcadores baseado no filtro de data
        setTimeout(function() {
            Object.keys(MapState.playerMarkers).forEach(function(playerId) {
                updatePlayerMarkerVisibility(playerId);
            });
        }, 2000);
    } else {
        $('#toggleTrailsBtn').html('<i class="fas fa-route me-1"></i>Mostrar trails dos jogadores');
        // Desativar timeline interativa
        if (typeof MapTimeline !== 'undefined') {
            MapTimeline.disable();
        }
        // Limpar filtros
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
        MapState.activeTrailShortcut = null;
        MapState.hasCustomFilter = false;

        // Mostrar todos os marcadores novamente quando trails sao desativados
        Object.keys(MapState.playerMarkers).forEach(function(playerId) {
            const marker = MapState.playerMarkers[playerId];
            if (marker && !MapState.map.hasLayer(marker)) {
                marker.addTo(MapState.map);
            }
        });
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
    
    // Atualizar visibilidade dos badges
    if (typeof updateBadgesVisibility === 'function') {
        updateBadgesVisibility();
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
            
            // Não mostrar jogadores já excluídos
            if (MapState.excludedPlayerFilters.includes(playerId)) {
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
 * Pesquisar jogadores para exclusão
 */
function handlePlayerExcludeSearch() {
    const searchTerm = $('#playerExcludeSearchInput').val().toLowerCase().trim();
    const resultsContainer = $('#playerExcludeSearchResults');
    
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
            
            // Não mostrar jogadores já excluídos
            if (MapState.excludedPlayerFilters.includes(playerId)) {
                return false;
            }
            
            // Não mostrar jogadores que estão no filtro de inclusão
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
                addPlayerToExclusion(playerId);
            });
        
        resultsContainer.append(item);
    });
    
    resultsContainer.show();
}

/**
 * Adicionar jogador à lista de exclusão
 */
function addPlayerToExclusion(playerId) {
    if (MapState.excludedPlayerFilters.includes(playerId)) {
        return;
    }
    
    MapState.excludedPlayerFilters.push(playerId);
    
    // Limpar campo de pesquisa
    $('#playerExcludeSearchInput').val('');
    $('#playerExcludeSearchResults').hide();
    
    // Atualizar UI
    updateExcludedPlayersBadges();
    
    // Remover trail e marcadores de backup do jogador excluído (se não houver filtro de inclusão ativo)
    if (MapState.selectedPlayerFilters.length === 0 && MapState.showTrails) {
        removePlayerTrailAndBackups(playerId);
    }
    
    // Aplicar filtro
    filterPlayers();
}

/**
 * Remover jogador da lista de exclusão
 */
function removePlayerFromExclusion(playerId) {
    const index = MapState.excludedPlayerFilters.indexOf(playerId);
    if (index > -1) {
        MapState.excludedPlayerFilters.splice(index, 1);
    }
    
    // Atualizar UI
    updateExcludedPlayersBadges();
    
    // Recarregar trail do jogador se trails estão ativos e não houver filtro de inclusão
    if (MapState.selectedPlayerFilters.length === 0 && MapState.showTrails) {
        const playerData = MapState.playersData[playerId];
        if (playerData && playerData.isOnline) {
            loadPlayerTrail(playerId);
        }
    }
    
    // Aplicar filtro
    filterPlayers();
}

/**
 * Atualizar badges de jogadores excluídos
 */
function updateExcludedPlayersBadges() {
    const container = $('#excludedPlayersBadges');
    container.empty();
    
    if (MapState.excludedPlayerFilters.length === 0) {
        $('#clearAllExclusionsBtn').hide();
        return;
    }
    
    $('#clearAllExclusionsBtn').show();
    
    MapState.excludedPlayerFilters.forEach(playerId => {
        const player = MapState.playersData[playerId];
        const displayName = player ? (player.name || playerId) : playerId;
        const steamName = player && player.steamName ? ` (${player.steamName})` : '';
        const statusIcon = player && player.isOnline ? '🟢' : '🔴';
        
        const badge = $('<span class="badge bg-danger"></span>')
            .html(`${statusIcon} ${displayName}${steamName} <i class="fas fa-times remove-exclusion"></i>`)
            .find('.remove-exclusion')
            .on('click', function(e) {
                e.stopPropagation();
                removePlayerFromExclusion(playerId);
            })
            .end();
        
        container.append(badge);
    });
}

/**
 * Limpar todas as exclusões de jogadores
 */
function clearAllPlayerExclusions() {
    const excludedIds = [...MapState.excludedPlayerFilters];
    MapState.excludedPlayerFilters = [];
    updateExcludedPlayersBadges();
    
    // Recarregar trails dos jogadores que foram removidos da exclusão
    if (MapState.selectedPlayerFilters.length === 0 && MapState.showTrails) {
        excludedIds.forEach(playerId => {
            const playerData = MapState.playersData[playerId];
            if (playerData && playerData.isOnline) {
                loadPlayerTrail(playerId);
            }
        });
    }
    
    filterPlayers();
}

/**
 * Filtrar jogadores
 */
function filterPlayers() {
    
    // Se trails estão ativos, remover trails de jogadores não selecionados
    if (MapState.showTrails) {
        // Se filtro de inclusão está ativo, remover trails de jogadores não selecionados
        if (MapState.selectedPlayerFilters.length > 0) {
            Object.keys(MapState.playerTrails).forEach(function(playerId) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    removePlayerTrailAndBackups(playerId);
                }
            });
            // Também remover marcadores de backup de jogadores não selecionados
            Object.keys(MapState.playerBackupMarkers).forEach(function(playerId) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    removePlayerTrailAndBackups(playerId);
                }
            });
        } else {
            // Se não há filtro de inclusão, remover trails de jogadores excluídos
            if (MapState.excludedPlayerFilters.length > 0) {
                MapState.excludedPlayerFilters.forEach(function(playerId) {
                    removePlayerTrailAndBackups(playerId);
                });
            }
        }
    }
    
    // Recarregar posições
    // Nota: loadPositions() já carrega trails automaticamente quando showTrails está ativo,
    // então não é necessário recarregar trails aqui novamente
    loadPositions();
}

/**
 * Aplicar filtro de trail por atalho
 */
function applyTrailFilterShortcut(shortcut) {
    // Restaurar classes outline de todos os botões de atalho
    // IMPORTANTE: Preservar classes base (btn, btn-sm) e apenas trocar entre outline e sólido
    $('#trailQuickShortcuts button[data-filter]').each(function() {
        const $btn = $(this);
        // Remover apenas classes de estado (active, outline, sólido) mas preservar btn e btn-sm
        $btn.removeClass('active btn-secondary btn-warning btn-danger btn-outline-secondary btn-outline-warning btn-outline-danger');
        // Determinar classe original baseada no data-filter e restaurar
        const filter = $btn.data('filter');
        if (filter === '24hours') {
            $btn.addClass('btn-outline-warning');
        } else if (filter === 'clear') {
            $btn.addClass('btn-outline-danger');
        } else {
            $btn.addClass('btn-outline-secondary');
        }
        // Garantir que btn e btn-sm estão presentes (preservar classes base)
        if (!$btn.hasClass('btn')) {
            $btn.addClass('btn');
        }
        if (!$btn.hasClass('btn-sm')) {
            $btn.addClass('btn-sm');
        }
    });
    
    // Se não for "clear", destacar o botão selecionado trocando outline por sólido
    if (shortcut !== 'clear') {
        const targetButton = $(`#trailQuickShortcuts button[data-filter="${shortcut}"]`);
        if (targetButton.length > 0) {
            // Remover apenas classes de estado mas preservar btn e btn-sm
            targetButton.removeClass('btn-outline-secondary btn-outline-warning btn-outline-danger btn-secondary btn-warning btn-danger active');
            // Adicionar classe sólida baseada no tipo original
            const filter = targetButton.data('filter');
            if (filter === '24hours') {
                targetButton.addClass('btn-warning');
            } else {
                targetButton.addClass('btn-secondary');
            }
            targetButton.addClass('active');
            // Garantir que btn e btn-sm estão presentes
            if (!targetButton.hasClass('btn')) {
                targetButton.addClass('btn');
            }
            if (!targetButton.hasClass('btn-sm')) {
                targetButton.addClass('btn-sm');
            }
            MapState.activeTrailShortcut = shortcut;
            MapState.hasCustomFilter = false;
        }
    } else {
        MapState.activeTrailShortcut = null;
        MapState.hasCustomFilter = false;
    }
    
    // Usar data atual em São Paulo para cálculos de atalhos
    const now = getNowInSaoPaulo();
    let startDate, endDate;
    
    switch(shortcut) {
        case '10seconds':
            startDate = new Date(now.getTime() - (10 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '30seconds':
            startDate = new Date(now.getTime() - (30 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '1minute':
            startDate = new Date(now.getTime() - (1 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '2minutes':
            startDate = new Date(now.getTime() - (2 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '5minutes':
            startDate = new Date(now.getTime() - (5 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '10minutes':
            startDate = new Date(now.getTime() - (10 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '30minutes':
            startDate = new Date(now.getTime() - (30 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '1hour':
            startDate = new Date(now.getTime() - (1 * 60 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '3hours':
            startDate = new Date(now.getTime() - (3 * 60 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '6hours':
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case '24hours':
            startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            endDate = null; // Vazio para indicar "a partir de"
            break;
        case 'today':
            // Obter início do dia atual em São Paulo
            const todaySP = now.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const todayDate = todaySP.split(',')[0]; // 'YYYY-MM-DD'
            startDate = convertSaoPauloToUTC(todayDate, '00:00:00');
            endDate = now;
            break;
        case 'yesterday':
            // Obter data de ontem em São Paulo
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            const yesterdaySP = yesterday.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const yesterdayDate = yesterdaySP.split(',')[0]; // 'YYYY-MM-DD'
            startDate = convertSaoPauloToUTC(yesterdayDate, '00:00:00');
            endDate = convertSaoPauloToUTC(yesterdayDate, '23:59:59');
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
            MapState.activeTrailShortcut = null;
            MapState.hasCustomFilter = false;
            // Restaurar classes outline de todos os botões (já feito no início da função, mas garantindo aqui também)
            // Coletar IDs de jogadores que precisam de trail
            // Usar MapState.playersData para incluir todos os jogadores, não apenas os que têm marcadores visíveis
            const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
            const playerIdsToLoad = [];
            
            Object.keys(MapState.playersData).forEach(function(playerId) {
                // Se filtro de inclusão está ativo, verificar se jogador está selecionado
                if (MapState.selectedPlayerFilters.length > 0) {
                    if (!MapState.selectedPlayerFilters.includes(playerId)) {
                        // Jogador não está selecionado, não carregar trail
                        return;
                    }
                }
                
                if (onlineOnlyFilterActive) {
                    const playerData = MapState.playersData[playerId];
                    if (!playerData || !playerData.isOnline) {
                        return;
                    }
                }
                
                // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
                if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
                    // Jogador está excluído, não carregar trail
                    return;
                }
                
                // Mostrar marcador novamente quando filtro é limpo
                if (MapState.playerMarkers[playerId] && !MapState.map.hasLayer(MapState.playerMarkers[playerId])) {
                    MapState.playerMarkers[playerId].addTo(MapState.map);
                }
                
                playerIdsToLoad.push(playerId);
            });
            
            // Carregar trails em lote
            if (playerIdsToLoad.length > 0) {
                loadPlayerTrailsBatch(playerIdsToLoad);
            }
            
            // Após carregar trails, atualizar visibilidade de todos os marcadores (mostrar todos quando filtro está desabilitado)
            setTimeout(function() {
                Object.keys(MapState.playerMarkers).forEach(function(playerId) {
                    updatePlayerMarkerVisibility(playerId);
                });
            }, 2000);
            
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
    
    // Configurar filtro de data
    MapState.trailDateFilter.enabled = true;
    MapState.trailDateFilter.startDate = startDate;
    MapState.trailDateFilter.endDate = endDate;
    
    // Atualizar campos HTML (sempre, mesmo durante auto-refresh)
    // Usar métodos robustos para garantir atualização visual
    const $startDate = $('#trailStartDate');
    const $startTime = $('#trailStartTime');
    const $endDate = $('#trailEndDate');
    const $endTime = $('#trailEndTime');
    
    // Função auxiliar para atualizar campo de forma robusta
    const updateField = function($field, value) {
        if ($field.length > 0 && $field[0]) {
            // Atualização direta do DOM (mais confiável)
            $field[0].value = value;
            // Atualização via jQuery (para garantir sincronização)
            $field.val(value);
            $field.attr('value', value);
            $field.prop('value', value);
            // Forçar eventos para garantir atualização visual
            $field.trigger('input');
            $field.trigger('change');
            // Forçar atualização visual adicional usando requestAnimationFrame
            requestAnimationFrame(function() {
                if ($field[0]) {
                    $field[0].value = value;
                }
            });
        }
    };
    
    if ($startDate.length > 0) {
        const startDateValue = formatDate(startDate);
        updateField($startDate, startDateValue);
    }
    
    if ($startTime.length > 0) {
        const startTimeValue = formatTime(startDate);
        updateField($startTime, startTimeValue);
    }
    
    // Para atalhos de período, deixar data fim vazia (null)
    if (endDate) {
        if ($endDate.length > 0) {
            const endDateValue = formatDate(endDate);
            updateField($endDate, endDateValue);
        }
        if ($endTime.length > 0) {
            const endTimeValue = formatTime(endDate);
            updateField($endTime, endTimeValue);
        }
    } else {
        if ($endDate.length > 0) {
            updateField($endDate, '');
        }
        if ($endTime.length > 0) {
            updateField($endTime, '');
        }
    }
    
    // Definir endDate no MapState diretamente quando for null (atalhos de período)
    if (!endDate) {
        MapState.trailDateFilter.endDate = null;
    }
    
    // Se filtro de inclusão está ativo, remover trails de jogadores não selecionados antes de aplicar filtro de data
    if (MapState.selectedPlayerFilters.length > 0) {
        Object.keys(MapState.playerTrails).forEach(function(playerId) {
            if (!MapState.selectedPlayerFilters.includes(playerId)) {
                removePlayerTrailAndBackups(playerId);
            }
        });
        Object.keys(MapState.playerBackupMarkers).forEach(function(playerId) {
            if (!MapState.selectedPlayerFilters.includes(playerId)) {
                removePlayerTrailAndBackups(playerId);
            }
        });
    }
    
    // Aplicar filtro automaticamente (preservar shortcut para não resetar estado)
    applyTrailDateFilter(true);
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
 * @param {boolean} preserveShortcut - Se true, não reseta MapState.activeTrailShortcut e não restaura classes dos botões
 */
function applyTrailDateFilter(preserveShortcut = false) {
    const startDate = $('#trailStartDate').val();
    const startTime = $('#trailStartTime').val() || '00:00:00';
    const endDate = $('#trailEndDate').val();
    const endTime = $('#trailEndTime').val() || '23:59:59';
    
    // Permitir apenas Data Início, apenas Data Fim, ou ambas
    if (startDate || endDate) {
        MapState.trailDateFilter.enabled = true;
        
        if (startDate) {
            // Os campos de data/hora já estão em UTC (formato do navegador)
            // Criar data diretamente sem conversão
            const [year, month, day] = startDate.split('-').map(Number);
            const [hours, minutes, seconds = 0] = (startTime || '00:00:00').split(':').map(Number);
            MapState.trailDateFilter.startDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        } else {
            // Se apenas Data Fim está preenchida, considerar tudo desde o início (null = sem limite)
            MapState.trailDateFilter.startDate = null;
        }
        
        if (endDate) {
            // Os campos de data/hora já estão em UTC (formato do navegador)
            // Criar data diretamente sem conversão
            const [year, month, day] = endDate.split('-').map(Number);
            const [hours, minutes, seconds = 0] = (endTime || '23:59:59').split(':').map(Number);
            MapState.trailDateFilter.endDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        } else {
            // Se apenas Data Início está preenchida, verificar se endDate já foi definido como null
            // (caso de atalhos de período que não têm data fim)
            if (MapState.trailDateFilter.endDate === null) {
                // Manter null (sem limite de data fim)
                MapState.trailDateFilter.endDate = null;
            } else {
                // Se não foi definido como null, considerar tudo até o futuro (data atual + 1 ano)
                // Usar data atual em UTC
                const futureDate = new Date();
                futureDate.setFullYear(futureDate.getFullYear() + 1);
                MapState.trailDateFilter.endDate = futureDate;
            }
        }
        
        // Se preserveShortcut for false, marcar que filtro personalizado está ativo e limpar atalho rápido
        if (!preserveShortcut) {
            MapState.hasCustomFilter = true;
            MapState.activeTrailShortcut = null;
            // Restaurar classes outline de todos os botões
            $('#trailQuickShortcuts button[data-filter]').each(function() {
                const $btn = $(this);
                $btn.removeClass('active');
                const filter = $btn.data('filter');
                if (filter === '24hours') {
                    $btn.removeClass('btn-warning').addClass('btn-outline-warning');
                } else if (filter === 'clear') {
                    $btn.removeClass('btn-danger').addClass('btn-outline-danger');
                } else {
                    $btn.removeClass('btn-secondary').addClass('btn-outline-secondary');
                }
                // Garantir que btn e btn-sm estão presentes
                if (!$btn.hasClass('btn')) {
                    $btn.addClass('btn');
                }
                if (!$btn.hasClass('btn-sm')) {
                    $btn.addClass('btn-sm');
                }
            });
        }
    } else {
        MapState.trailDateFilter.enabled = false;
        MapState.trailDateFilter.startDate = null;
        MapState.trailDateFilter.endDate = null;
        if (!preserveShortcut) {
            MapState.hasCustomFilter = false;
        }
        
        // Quando filtro é desabilitado, mostrar todos os marcadores novamente
        Object.keys(MapState.playerMarkers).forEach(function(playerId) {
            const marker = MapState.playerMarkers[playerId];
            if (marker && !MapState.map.hasLayer(marker)) {
                marker.addTo(MapState.map);
            }
        });
    }
    
    // Se filtro de inclusão está ativo, remover trails de jogadores não selecionados
    if (MapState.selectedPlayerFilters.length > 0) {
        Object.keys(MapState.playerTrails).forEach(function(playerId) {
            if (!MapState.selectedPlayerFilters.includes(playerId)) {
                removePlayerTrailAndBackups(playerId);
            }
        });
        Object.keys(MapState.playerBackupMarkers).forEach(function(playerId) {
            if (!MapState.selectedPlayerFilters.includes(playerId)) {
                removePlayerTrailAndBackups(playerId);
            }
        });
    }
    
        // Coletar IDs de jogadores que precisam de trail
        // Usar MapState.playersData para incluir todos os jogadores, não apenas os que têm marcadores visíveis
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
        const playerIdsToLoad = [];
        
        Object.keys(MapState.playersData).forEach(function(playerId) {
            // Se filtro de inclusão está ativo, verificar se jogador está selecionado
            if (MapState.selectedPlayerFilters.length > 0) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    // Jogador não está selecionado, não carregar trail
                    return;
                }
            }
            
            if (onlineOnlyFilterActive) {
                const playerData = MapState.playersData[playerId];
                if (!playerData || !playerData.isOnline) {
                    return;
                }
            }
            
            // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
            if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
                // Jogador está excluído, não carregar trail
                return;
            }
            
            playerIdsToLoad.push(playerId);
        });
    
    // Carregar trails em lote
    if (playerIdsToLoad.length > 0) {
        loadPlayerTrailsBatch(playerIdsToLoad);
    }
    
    // Após carregar trails, atualizar visibilidade de todos os marcadores baseado no filtro de data
    setTimeout(function() {
        Object.keys(MapState.playerMarkers).forEach(function(playerId) {
            updatePlayerMarkerVisibility(playerId);
        });
    }, 2000);
}

/**
 * Reaplicar filtro atual (usado pelo Auto-Refresh)
 * Respeita o filtro selecionado pelo usuário (atalho rápido ou filtro personalizado)
 */
function reapplyCurrentTrailFilter() {
    if (!MapState.showTrails) {
        return;
    }
    
    // Função auxiliar para carregar trails apenas de jogadores online quando filtro está ativo
    const loadTrailsForVisiblePlayers = function() {
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
        const playerIdsToLoad = [];
        
        // Usar MapState.playersData para incluir todos os jogadores, não apenas os que têm marcadores visíveis
        Object.keys(MapState.playersData).forEach(function(playerId) {
            // Se filtro de inclusão está ativo, verificar se jogador está selecionado
            if (MapState.selectedPlayerFilters.length > 0) {
                if (!MapState.selectedPlayerFilters.includes(playerId)) {
                    // Jogador não está selecionado, não carregar trail
                    return;
                }
            }
            
            // Se filtro "Apenas online" está ativo, verificar se jogador está online
            if (onlineOnlyFilterActive) {
                const playerData = MapState.playersData[playerId];
                if (!playerData || !playerData.isOnline) {
                    // Jogador está offline, não carregar trail
                    return;
                }
            }
            
            // Verificar filtro de exclusão (apenas se não houver filtro de inclusão ativo)
            if (MapState.selectedPlayerFilters.length === 0 && MapState.excludedPlayerFilters.includes(playerId)) {
                // Jogador está excluído, não carregar trail
                return;
            }
            
            playerIdsToLoad.push(playerId);
        });
        
        // Carregar trails em lote
        if (playerIdsToLoad.length > 0) {
            loadPlayerTrailsBatch(playerIdsToLoad);
        }
        
        // Após carregar trails, atualizar visibilidade de todos os marcadores
        setTimeout(function() {
            Object.keys(MapState.playerMarkers).forEach(function(playerId) {
                updatePlayerMarkerVisibility(playerId);
            });
        }, 2000);
    };
    
    // Se houver atalho rápido ativo, reaplicar o atalho
    if (MapState.activeTrailShortcut) {
        // Usar setTimeout para garantir que o DOM esteja pronto antes de atualizar os campos
        setTimeout(function() {
            applyTrailFilterShortcut(MapState.activeTrailShortcut);
            // Garantir recarregamento explícito dos trails (apenas jogadores online se filtro ativo)
            loadTrailsForVisiblePlayers();
        }, 50); // Pequeno delay para garantir que o DOM esteja pronto
        return;
    }
    
    // Se houver filtro personalizado ativo, reaplicar o filtro personalizado
    if (MapState.hasCustomFilter) {
        applyTrailDateFilter();
        // Garantir recarregamento explícito dos trails (apenas jogadores online se filtro ativo)
        loadTrailsForVisiblePlayers();
        return;
    }
    
    // Se não houver filtro, usar padrão de 24h
    updateTrailDateFilterAuto(24);
    // Garantir recarregamento explícito dos trails (apenas jogadores online se filtro ativo)
    loadTrailsForVisiblePlayers();
}

/**
 * Mostrar menu de ações do ponto
 */
/**
 * Comparar ponto atual com ponto anterior e calcular diferenças
 */
function comparePointWithPrevious(currentPoint, previousPoint) {
    const TOLERANCE = 0.1; // Tolerância para considerar mudanças significativas
    const changes = {};
    
    // Função auxiliar para calcular delta
    const calculateDelta = (current, previous) => {
        if (current === null || current === undefined || previous === null || previous === undefined) {
            return null;
        }
        const delta = current - previous;
        return Math.abs(delta) < TOLERANCE ? null : delta;
    };
    
    // Comparar campos numéricos
    changes.health = calculateDelta(currentPoint.health, previousPoint.health);
    changes.blood = calculateDelta(currentPoint.blood, previousPoint.blood);
    changes.shock = calculateDelta(currentPoint.shock, previousPoint.shock);
    changes.energy = calculateDelta(currentPoint.energy, previousPoint.energy);
    changes.water = calculateDelta(currentPoint.water, previousPoint.water);
    changes.stamina = calculateDelta(currentPoint.stamina, previousPoint.stamina);
    changes.items_count = calculateDelta(currentPoint.items_count, previousPoint.items_count);
    
    // Comparar estado (vivo/morto) - apenas indicar mudança, não delta
    if (currentPoint.is_alive !== null && currentPoint.is_alive !== undefined &&
        previousPoint.is_alive !== null && previousPoint.is_alive !== undefined) {
        changes.is_alive_changed = currentPoint.is_alive !== previousPoint.is_alive;
        if (changes.is_alive_changed) {
            changes.is_alive_new = currentPoint.is_alive;
        }
    }
    
    return changes;
}

/**
 * Renderizar valor com indicador de mudança
 */
function renderValueWithChange(value, delta, fieldName) {
    if (delta === null || delta === undefined) {
        return value;
    }
    
    const absDelta = Math.abs(delta);
    const sign = delta > 0 ? '+' : '';
    let iconClass, colorClass;
    
    if (delta > 0) {
        iconClass = 'fa-arrow-up';
        colorClass = 'text-success';
    } else {
        iconClass = 'fa-arrow-down';
        colorClass = 'text-danger';
    }
    
    // Formatar delta conforme o campo
    let deltaText = '';
    if (fieldName === 'health' || fieldName === 'energy' || fieldName === 'water' || fieldName === 'stamina') {
        deltaText = `${sign}${absDelta.toFixed(1)}`;
    } else if (fieldName === 'blood' || fieldName === 'shock' || fieldName === 'items_count') {
        deltaText = `${sign}${absDelta.toFixed(0)}`;
    } else {
        deltaText = `${sign}${absDelta.toFixed(1)}`;
    }
    
    return `${value} <span class="${colorClass}"><i class="fas ${iconClass}"></i> ${deltaText}</span>`;
}

function showPointActionsMenu(playerId, point, pointNumber, pointIndexInTrail, fullTrail) {
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
    
    // Buscar ponto anterior se disponível
    let previousPoint = null;
    let pointChanges = null;
    
    if (fullTrail && pointIndexInTrail !== undefined && pointIndexInTrail !== -1 && pointIndexInTrail >= 0 && pointIndexInTrail < fullTrail.length) {
        // Trail está ordenado do mais recente (índice 0) para o mais antigo (índice N)
        // Para calcular mudanças desde o ponto anterior no tempo, devemos comparar com o ponto mais antigo (índice +1)
        // Exemplo: Ponto 4 (índice 4) vs Ponto 3 (índice 5, mais antigo)
        // Delta = valor_atual - valor_anterior_mais_antigo
        const previousIndex = pointIndexInTrail + 1;
        if (previousIndex >= 0 && previousIndex < fullTrail.length) {
            previousPoint = fullTrail[previousIndex];
            pointChanges = comparePointWithPrevious(point, previousPoint);
        }
    }
    
    // Armazenar contexto
    MapState.currentPointContext = {
        playerId: playerId,
        point: point,
        pointNumber: pointNumber,
        hasBackup: point.has_backup,
        previousPoint: previousPoint,
        changes: pointChanges
    };
    
    // Buscar dados do jogador
    const playerData = MapState.playersData[playerId];
    const playerName = playerData ? playerData.name : 'Desconhecido';
    const steamName = playerData ? playerData.steamName : null;
    const isOnline = playerData ? playerData.isOnline : false;
    const isAdmin = playerData ? playerData.isAdmin : false;
    
    // Extrair dados do ponto
    const coordX = point.coord_x;
    const coordY = point.coord_y;
    const coordZ = point.coord_z;
    const health = point.health;
    const blood = point.blood;
    const shock = point.shock;
    const isAlive = point.is_alive;
    const energy = point.energy;
    const water = point.water;
    const stamina = point.stamina;
    const staminaMax = point.stamina_max;
    const itemsInHands = point.items_in_hands;
    const itemsCount = point.items_count;
    const pointDate = point.timestamp || point.last_update;
    
    // Preencher informações básicas - Cabeçalho
    $('#pointMarkerName').html(`<i class="fas fa-user me-2"></i><strong>${playerName}</strong>`);
    $('#pointMarkerNumber').text(`Ponto #${pointNumber}`);
    
    // Preencher informações básicas - Card
    $('#pointMarkerSteam').text(steamName || 'N/A');
    $('#pointMarkerStatus').html(isOnline ? '<span class="badge bg-success">Online</span>' : '<span class="badge bg-secondary">Offline</span>');
    $('#pointMarkerAdmin').html(isAdmin ? '<span class="badge bg-warning">Sim</span>' : '<span class="badge bg-secondary">Não</span>');
    
    // Preencher localização
    $('#pointMarkerCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}`);
    $('#pointMarkerHeight').find('span.fw-bold').text(coordZ ? `${coordZ.toFixed(1)}m` : 'N/A');
    
    // Preencher informações do ponto
    $('#pointMarkerPointNumber').text(pointNumber.toString());
    $('#pointMarkerPointDate').text(pointDate ? formatTimestampBR(pointDate) : 'Desconhecido');
    
    // Preencher status de vida
    const hasHealthData = (health !== null && health !== undefined) || 
                         (blood !== null && blood !== undefined) ||
                         (shock !== null && shock !== undefined) ||
                         (isAlive !== null && isAlive !== undefined);
    
    if (hasHealthData) {
        $('#pointMarkerHealthSection').show();
        if (health !== null && health !== undefined) {
            let healthText = health.toFixed(1);
            if (pointChanges && pointChanges.health !== null && pointChanges.health !== undefined) {
                healthText = renderValueWithChange(health.toFixed(1), pointChanges.health, 'health');
            }
            $('#pointMarkerHealth').show().find('span.fw-bold').html(healthText);
        } else {
            $('#pointMarkerHealth').hide();
        }
        if (blood !== null && blood !== undefined) {
            let bloodText = blood.toFixed(0);
            if (pointChanges && pointChanges.blood !== null && pointChanges.blood !== undefined) {
                bloodText = renderValueWithChange(blood.toFixed(0), pointChanges.blood, 'blood');
            }
            $('#pointMarkerBlood').show().find('span.fw-bold').html(bloodText);
        } else {
            $('#pointMarkerBlood').hide();
        }
        if (shock !== null && shock !== undefined) {
            let shockText = shock.toFixed(0);
            if (pointChanges && pointChanges.shock !== null && pointChanges.shock !== undefined) {
                shockText = renderValueWithChange(shock.toFixed(0), pointChanges.shock, 'shock');
            }
            $('#pointMarkerShock').show().find('span.fw-bold').html(shockText);
        } else {
            $('#pointMarkerShock').hide();
        }
        if (isAlive !== null && isAlive !== undefined) {
            let aliveHtml = isAlive ? '<span class="badge bg-success">Vivo</span>' : '<span class="badge bg-danger">Morto</span>';
            if (pointChanges && pointChanges.is_alive_changed) {
                // Adicionar indicador de mudança
                const changeIcon = pointChanges.is_alive_new ? 
                    '<i class="fas fa-arrow-up text-success ms-1"></i>' : 
                    '<i class="fas fa-arrow-down text-danger ms-1"></i>';
                aliveHtml += changeIcon;
            }
            // Substituir todo o conteúdo do span para evitar badges duplicados
            $('#pointMarkerAlive').show().find('span.d-block').html(aliveHtml);
        } else {
            $('#pointMarkerAlive').hide();
        }
    } else {
        $('#pointMarkerHealthSection').hide();
    }
    
    // Preencher recursos e stamina
    const hasResourcesData = (energy !== null && energy !== undefined) || 
                            (water !== null && water !== undefined) ||
                            (stamina !== null && stamina !== undefined) || 
                            (staminaMax !== null && staminaMax !== undefined);
    
    if (hasResourcesData) {
        $('#pointMarkerResourcesSection').show();
        if (energy !== null && energy !== undefined) {
            let energyText = energy.toFixed(1);
            if (pointChanges && pointChanges.energy !== null && pointChanges.energy !== undefined) {
                energyText = renderValueWithChange(energy.toFixed(1), pointChanges.energy, 'energy');
            }
            $('#pointMarkerEnergy').show().find('span.fw-bold').html(energyText);
        } else {
            $('#pointMarkerEnergy').hide();
        }
        if (water !== null && water !== undefined) {
            let waterText = water.toFixed(1);
            if (pointChanges && pointChanges.water !== null && pointChanges.water !== undefined) {
                waterText = renderValueWithChange(water.toFixed(1), pointChanges.water, 'water');
            }
            $('#pointMarkerWater').show().find('span.fw-bold').html(waterText);
        } else {
            $('#pointMarkerWater').hide();
        }
        if ((stamina !== null && stamina !== undefined) || (staminaMax !== null && staminaMax !== undefined)) {
            let staminaText = '--';
            if (stamina !== null && stamina !== undefined && staminaMax !== null && staminaMax !== undefined) {
                staminaText = `${stamina.toFixed(1)}/${staminaMax.toFixed(1)}`;
            } else if (stamina !== null && stamina !== undefined) {
                staminaText = stamina.toFixed(1);
            }
            // Aplicar mudança se houver
            if (pointChanges && pointChanges.stamina !== null && pointChanges.stamina !== undefined) {
                staminaText = renderValueWithChange(staminaText, pointChanges.stamina, 'stamina');
            }
            $('#pointMarkerStamina').show().find('span.fw-bold').html(staminaText);
        } else {
            $('#pointMarkerStamina').hide();
        }
    } else {
        $('#pointMarkerResourcesSection').hide();
    }
    
    // Preencher inventário
    const hasInventoryData = itemsInHands || (itemsCount !== null && itemsCount !== undefined);
    
    if (hasInventoryData) {
        $('#pointMarkerInventorySection').show();
        if (itemsInHands) {
            const itemsHands = formatItemsArray(itemsInHands);
            $('#pointMarkerItemsHands').show().find('span.fw-bold').text(itemsHands);
        } else {
            $('#pointMarkerItemsHands').hide();
        }
        if (itemsCount !== null && itemsCount !== undefined) {
            let itemsCountText = itemsCount.toString();
            if (pointChanges && pointChanges.items_count !== null && pointChanges.items_count !== undefined) {
                itemsCountText = renderValueWithChange(itemsCount.toString(), pointChanges.items_count, 'items_count');
            }
            $('#pointMarkerItemsCount').show().find('span.fw-bold').html(itemsCountText);
        } else {
            $('#pointMarkerItemsCount').hide();
        }
    } else {
        $('#pointMarkerInventorySection').hide();
    }
    
    // Mostrar modal de ações
    const modal = new bootstrap.Modal(document.getElementById('pointActionsModal'));
    modal.show();
    
    // Desabilitar botões se jogador estiver morto ou se não houver backup
    if (isAlive === false) {
        // Jogador morto - desabilitar Restaurar Backup e Clonar Personagem
        $('#restoreBackupActionBtn').prop('disabled', true);
        $('#cloneCharacterActionBtn').prop('disabled', true);
    } else {
        // Jogador vivo - habilitar/desabilitar baseado em disponibilidade de backup
        if (!point.has_backup) {
            $('#restoreBackupActionBtn').prop('disabled', true);
        } else {
            $('#restoreBackupActionBtn').prop('disabled', false);
        }
        // Clonar Personagem sempre habilitado quando jogador está vivo
        $('#cloneCharacterActionBtn').prop('disabled', false);
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
    
    // Buscar dados atualizados de MapState.playersData quando targetPlayer for null (marcador principal)
    if (targetPlayer === null || targetPlayer === undefined) {
        // Buscar dados atualizados de MapState.playersData
        const playerData = MapState.playersData[targetPlayerId];
        const onlineOnlyFilterActive = $('#onlineOnlyCheck').is(':checked');
        
        // Verificar se o jogador está realmente online quando o filtro "Apenas online" está ativo
        if (onlineOnlyFilterActive && playerData) {
            const isReallyOnline = playerData.is_online !== undefined ? playerData.is_online : (playerData.isOnline || false);
            if (!isReallyOnline) {
                // Jogador não está online, mas o marcador ainda existe (dados desatualizados)
                // Remover marcador e mostrar mensagem
                if (MapState.playerMarkers[targetPlayerId]) {
                    MapState.map.removeLayer(MapState.playerMarkers[targetPlayerId]);
                    delete MapState.playerMarkers[targetPlayerId];
                }
                showToast('Aviso', 'Este jogador não está mais online.', 'warning');
                return; // Não abrir modal
            }
        }
        
        if (playerData) {
            playerName = playerData.player_name || playerData.name || 'Desconhecido';
            steamName = playerData.steam_name || playerData.steamName || null;
            coordX = playerData.coord_x;
            coordY = playerData.coord_y;
            coordZ = playerData.coord_z;
            isOnline = playerData.is_online !== undefined ? playerData.is_online : (playerData.isOnline || false);
            isAdmin = playerData.is_admin || false;
            health = playerData.health;
            blood = playerData.blood;
            shock = playerData.shock;
            isAlive = playerData.is_alive;
            energy = playerData.energy;
            water = playerData.water;
            stamina = playerData.stamina;
            staminaMax = playerData.stamina_max;
            itemsInHands = playerData.items_in_hands;
            itemsCount = playerData.items_count;
            lastUpdate = playerData.last_update;
        } else {
            // Fallback: se dados não estiverem disponíveis, usar valores padrão
            console.warn('Dados do jogador não encontrados em MapState.playersData para playerId:', targetPlayerId);
            playerName = 'Desconhecido';
            steamName = null;
            coordX = 0;
            coordY = 0;
            coordZ = 0;
            isOnline = false;
            isAdmin = false;
            health = null;
            blood = null;
            shock = null;
            isAlive = null;
            energy = null;
            water = null;
            stamina = null;
            staminaMax = null;
            itemsInHands = null;
            itemsCount = null;
            lastUpdate = null;
        }
    } else if (targetPlayer.player_name !== undefined) {
        // Dados do marcador principal (player object completo) - mantido para compatibilidade
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
    
    // Preencher informações básicas - Cabeçalho
    $('#playerMarkerName').html(`<i class="fas fa-user me-2"></i><strong>${playerName}</strong>`);
    
    // Preencher informações básicas - Card
    $('#playerMarkerSteam').text(steamName || 'N/A');
    $('#playerMarkerStatus').html(isOnline ? '<span class="badge bg-success">Online</span>' : '<span class="badge bg-secondary">Offline</span>');
    $('#playerMarkerAdmin').html(isAdmin ? '<span class="badge bg-warning">Sim</span>' : '<span class="badge bg-secondary">Não</span>');
    
    // Preencher localização
    $('#playerMarkerCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}`);
    $('#playerMarkerHeight').find('span.fw-bold').text(coordZ ? `${coordZ.toFixed(1)}m` : 'N/A');
    
    // Preencher última atualização
    $('#playerMarkerLastUpdate').text(lastUpdate || 'Desconhecido');
    
    // Preencher status de vida
    const hasHealthData = (health !== null && health !== undefined) || 
                         (blood !== null && blood !== undefined) ||
                         (shock !== null && shock !== undefined) ||
                         (isAlive !== null && isAlive !== undefined);
    
    if (hasHealthData) {
        $('#playerMarkerHealthSection').show();
        if (health !== null && health !== undefined) {
            $('#playerMarkerHealth').show().find('span.fw-bold').text(health.toFixed(1));
        } else {
            $('#playerMarkerHealth').hide();
        }
        if (blood !== null && blood !== undefined) {
            $('#playerMarkerBlood').show().find('span.fw-bold').text(blood.toFixed(0));
        } else {
            $('#playerMarkerBlood').hide();
        }
        if (shock !== null && shock !== undefined) {
            $('#playerMarkerShock').show().find('span.fw-bold').text(shock.toFixed(0));
        } else {
            $('#playerMarkerShock').hide();
        }
        if (isAlive !== null && isAlive !== undefined) {
            // Substituir todo o conteúdo do span para evitar badges duplicados
            $('#playerMarkerAlive').show().find('span.d-block').html(isAlive ? '<span class="badge bg-success">Vivo</span>' : '<span class="badge bg-danger">Morto</span>');
        } else {
            $('#playerMarkerAlive').hide();
        }
    } else {
        $('#playerMarkerHealthSection').hide();
    }
    
    // Preencher recursos e stamina
    const hasResourcesData = (energy !== null && energy !== undefined) || 
                            (water !== null && water !== undefined) ||
                            (stamina !== null && stamina !== undefined) || 
                            (staminaMax !== null && staminaMax !== undefined);
    
    if (hasResourcesData) {
        $('#playerMarkerResourcesSection').show();
        if (energy !== null && energy !== undefined) {
            $('#playerMarkerEnergy').show().find('span.fw-bold').text(energy.toFixed(1));
        } else {
            $('#playerMarkerEnergy').hide();
        }
        if (water !== null && water !== undefined) {
            $('#playerMarkerWater').show().find('span.fw-bold').text(water.toFixed(1));
        } else {
            $('#playerMarkerWater').hide();
        }
        if ((stamina !== null && stamina !== undefined) || (staminaMax !== null && staminaMax !== undefined)) {
            let staminaText = '--';
            if (stamina !== null && stamina !== undefined && staminaMax !== null && staminaMax !== undefined) {
                staminaText = `${stamina.toFixed(1)}/${staminaMax.toFixed(1)}`;
            } else if (stamina !== null && stamina !== undefined) {
                staminaText = stamina.toFixed(1);
            }
            $('#playerMarkerStamina').show().find('span.fw-bold').text(staminaText);
        } else {
            $('#playerMarkerStamina').hide();
        }
    } else {
        $('#playerMarkerResourcesSection').hide();
    }
    
    // Preencher inventário
    const hasInventoryData = itemsInHands || (itemsCount !== null && itemsCount !== undefined);
    
    if (hasInventoryData) {
        $('#playerMarkerInventorySection').show();
        if (itemsInHands) {
            const itemsHands = formatItemsArray(itemsInHands);
            $('#playerMarkerItemsHands').show().find('span.fw-bold').text(itemsHands);
        } else {
            $('#playerMarkerItemsHands').hide();
        }
        if (itemsCount !== null && itemsCount !== undefined) {
            $('#playerMarkerItemsCount').show().find('span.fw-bold').text(itemsCount.toString());
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
    $('#backupPointDate').text(formatTimestampBR(point.timestamp));
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
 * Armazenar lista de jogadores online para pesquisa
 */
let teleportToPlayerList = [];

/**
 * Armazenar lista de jogadores offline para clonagem
 */
let cloneCharacterPlayerList = [];

/**
 * Pesquisar jogadores para teleporte
 */
function handleTeleportToPlayerSearch() {
    const searchTerm = $('#teleportToPlayerSearch').val().toLowerCase().trim();
    const resultsContainer = $('#teleportToPlayerSearchResults');
    const selectedContainer = $('#teleportToPlayerSelected');
    
    // Limpar seleção se pesquisa mudou
    $('#confirmTeleportToPlayerBtn').data('selectedPlayerId', null);
    selectedContainer.hide();
    
    if (searchTerm === '') {
        resultsContainer.hide();
        return;
    }
    
    // Filtrar jogadores que correspondem à pesquisa
    const matchingPlayers = teleportToPlayerList
        .filter(player => {
            const name = (player.player_name || '').toLowerCase();
            const steamName = (player.steam_name || '').toLowerCase();
            const playerId = (player.player_id || '').toLowerCase();
            
            return name.includes(searchTerm) || 
                   steamName.includes(searchTerm) || 
                   playerId.includes(searchTerm);
        })
        .slice(0, 10); // Limitar a 10 resultados
    
    if (matchingPlayers.length === 0) {
        resultsContainer.html('<div class="list-group-item text-muted">Nenhum jogador encontrado</div>');
        resultsContainer.show();
        return;
    }
    
    // Renderizar resultados
    resultsContainer.empty();
    matchingPlayers.forEach(function(player) {
        const displayName = player.player_name || player.player_id;
        const steamName = player.steam_name ? ` (${player.steam_name})` : '';
        const statusIcon = player.is_online ? '🟢' : '🔴';
        
        const item = $('<div class="list-group-item"></div>')
            .html(`${statusIcon} ${displayName}${steamName}`)
            .on('click', function() {
                selectPlayerForTeleport(player);
            });
        
        resultsContainer.append(item);
    });
    
    resultsContainer.show();
}

/**
 * Selecionar jogador para teleporte
 */
function selectPlayerForTeleport(player) {
    const selectedContainer = $('#teleportToPlayerSelected');
    const selectedName = $('#teleportToPlayerSelectedName');
    const searchInput = $('#teleportToPlayerSearch');
    const resultsContainer = $('#teleportToPlayerSearchResults');
    
    // Armazenar ID do jogador selecionado
    $('#confirmTeleportToPlayerBtn').data('selectedPlayerId', player.player_id);
    
    // Mostrar jogador selecionado
    const displayName = player.player_name || player.player_id;
    const steamName = player.steam_name ? ` (${player.steam_name})` : '';
    selectedName.text(`${displayName}${steamName}`);
    selectedContainer.show();
    
    // Limpar pesquisa e esconder resultados
    searchInput.val('');
    resultsContainer.hide();
}

/**
 * Pesquisar jogadores para clonagem
 */
function handleCloneCharacterSearch() {
    const searchTerm = $('#cloneCharacterSearch').val().toLowerCase().trim();
    const resultsContainer = $('#cloneCharacterSearchResults');
    const selectedContainer = $('#cloneCharacterSelected');
    
    // Limpar seleção se pesquisa mudou
    $('#confirmCloneCharacterBtn').data('selectedPlayerId', null);
    selectedContainer.hide();
    
    if (searchTerm === '') {
        resultsContainer.hide();
        return;
    }
    
    // Filtrar jogadores que correspondem à pesquisa
    const matchingPlayers = cloneCharacterPlayerList
        .filter(player => {
            const name = (player.player_name || '').toLowerCase();
            const steamName = (player.steam_name || '').toLowerCase();
            const playerId = (player.player_id || '').toLowerCase();
            
            return name.includes(searchTerm) || 
                   steamName.includes(searchTerm) || 
                   playerId.includes(searchTerm);
        })
        .slice(0, 10); // Limitar a 10 resultados
    
    if (matchingPlayers.length === 0) {
        resultsContainer.html('<div class="list-group-item text-muted">Nenhum jogador encontrado</div>');
        resultsContainer.show();
        return;
    }
    
    // Renderizar resultados
    resultsContainer.empty();
    matchingPlayers.forEach(function(player) {
        const displayName = player.player_name || player.player_id;
        const steamName = player.steam_name ? ` (${player.steam_name})` : '';
        const statusIcon = player.is_online ? '🟢' : '🔴';
        
        const item = $('<div class="list-group-item"></div>')
            .html(`${statusIcon} ${displayName}${steamName}`)
            .on('click', function() {
                selectPlayerForClone(player);
            });
        
        resultsContainer.append(item);
    });
    
    resultsContainer.show();
}

/**
 * Selecionar jogador para clonagem
 */
function selectPlayerForClone(player) {
    const selectedContainer = $('#cloneCharacterSelected');
    const selectedName = $('#cloneCharacterSelectedName');
    const searchInput = $('#cloneCharacterSearch');
    const resultsContainer = $('#cloneCharacterSearchResults');
    
    // Armazenar ID do jogador selecionado
    $('#confirmCloneCharacterBtn').data('selectedPlayerId', player.player_id);
    
    // Mostrar jogador selecionado
    const displayName = player.player_name || player.player_id;
    const steamName = player.steam_name ? ` (${player.steam_name})` : '';
    selectedName.text(`${displayName}${steamName}`);
    selectedContainer.show();
    
    // Limpar pesquisa e esconder resultados
    searchInput.val('');
    resultsContainer.hide();
}

/**
 * Mostrar modal de teleporte de jogador para posição de outro jogador
 * Função auxiliar chamada pelo modal de ações
 */
function showTeleportToPlayerModal() {
    let targetPlayerId, playerName, coordX, coordY, coordZ;
    
    // Verificar se temos contexto do jogador ou do ponto
    if (MapState.currentPlayerContext) {
        // Usar contexto do jogador online (comportamento original)
        targetPlayerId = MapState.currentPlayerContext.playerId;
        playerName = MapState.currentPlayerContext.playerName;
        coordX = MapState.currentPlayerContext.coordX;
        coordY = MapState.currentPlayerContext.coordY;
        coordZ = MapState.currentPlayerContext.coordZ;
    } else if (MapState.currentPointContext) {
        // Usar contexto do ponto do trail
        targetPlayerId = MapState.currentPointContext.playerId;
        const point = MapState.currentPointContext.point;
        coordX = point.coord_x;
        coordY = point.coord_y;
        coordZ = point.coord_z;
        
        // Buscar nome do jogador
        const playerData = MapState.playersData[targetPlayerId];
        playerName = playerData ? playerData.name : 'Desconhecido';
    } else {
        // Nenhum contexto disponível
        return;
    }
    
    // Preencher informações do jogador/ponto de destino
    $('#teleportToTargetPlayerName').text(playerName);
    $('#teleportToTargetCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}, Z=${coordZ ? coordZ.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados para teleporte
    $('#confirmTeleportToPlayerBtn').data('coordX', coordX);
    $('#confirmTeleportToPlayerBtn').data('coordY', coordY);
    $('#confirmTeleportToPlayerBtn').data('coordZ', coordZ);
    $('#confirmTeleportToPlayerBtn').data('selectedPlayerId', null);
    
    // Limpar campos
    $('#teleportToPlayerSearch').val('');
    $('#teleportToPlayerSearchResults').hide();
    $('#teleportToPlayerSelected').hide();
    
    // Buscar jogadores online (excluindo o próprio jogador)
    $.get('/api/players/online/positions')
        .done(function(data) {
            // Filtrar o próprio jogador da lista
            teleportToPlayerList = data.players.filter(function(player) {
                return player.player_id !== targetPlayerId;
            });
            
            if (teleportToPlayerList.length === 0) {
                $('#teleportToPlayerSearch').prop('disabled', true).attr('placeholder', 'Nenhum outro jogador online disponível');
            } else {
                $('#teleportToPlayerSearch').prop('disabled', false).attr('placeholder', 'Digite o nome do jogador...');
            }
        })
        .fail(function() {
            $('#teleportToPlayerSearch').prop('disabled', true).attr('placeholder', 'Erro ao carregar jogadores');
            teleportToPlayerList = [];
        });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('teleportToPlayerModal'));
    modal.show();
}

/**
 * Mostrar modal de teleporte direto de jogador
 */
function showPlayerTeleportModal() {
    if (!MapState.currentPlayerContext) {
        showToast('Erro', 'Contexto do jogador não encontrado', 'error');
        return;
    }
    
    const playerId = MapState.currentPlayerContext.playerId;
    const playerName = MapState.currentPlayerContext.playerName;
    const coordX = MapState.currentPlayerContext.coordX;
    const coordY = MapState.currentPlayerContext.coordY;
    const coordZ = MapState.currentPlayerContext.coordZ;
    
    // Limpar targets de veículo e container se houver
    MapState.teleportTargetVehicle = null;
    MapState.teleportTargetContainer = null;
    
    // Preencher informações do jogador no modal
    $('#teleportPlayerId').val(playerId);
    $('#teleportPlayerName').text(playerName || 'Jogador');
    $('#teleportPlayerCurrentCoords').text(`X=${coordX.toFixed(1)}, Y=${coordY.toFixed(1)}, Z=${coordZ ? coordZ.toFixed(1) : 'N/A'}`);
    
    // Limpar campos de coordenadas
    $('#teleportPlayerX').val('');
    $('#teleportPlayerY').val('');
    $('#teleportPlayerZ').val('');
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('playerTeleportModal'));
    modal.show();
}

/**
 * Executar teleporte direto de jogador (coordenadas manuais)
 */
function executePlayerTeleport() {
    const playerId = $('#teleportPlayerId').val();
    const coordX = parseFloat($('#teleportPlayerX').val());
    const coordY = parseFloat($('#teleportPlayerY').val());
    const coordZ = $('#teleportPlayerZ').val() ? parseFloat($('#teleportPlayerZ').val()) : null;
    
    if (!playerId) {
        showToast('Erro', 'ID do jogador não encontrado', 'error');
        return;
    }
    
    if (isNaN(coordX) || isNaN(coordY)) {
        showToast('Aviso', 'Preencha as coordenadas X e Y', 'warning');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    $('#confirmPlayerTeleportBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Teleportando...');
    
    const payload = {
        coord_x: coordX,
        coord_y: coordY
    };
    
    if (coordZ !== null && !isNaN(coordZ)) {
        payload.coord_z = coordZ;
    }
    
    $.ajax({
        url: `/api/players/${playerId}/teleport`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(response) {
            // Fechar modal
            bootstrap.Modal.getInstance(document.getElementById('playerTeleportModal')).hide();
            
            // Mostrar mensagem de sucesso
            showToast('Sucesso', response.message, 'success');
            
            // Voltar ao modo normal se não houver outro target
            if (MapState.selectedPlayerFilters.length === 0 && !MapState.teleportTargetVehicle && !MapState.teleportTargetContainer) {
                setMode('normal');
            } else {
                updateTeleportInfo();
            }
            
            // Recarregar posições após um delay
            setTimeout(() => {
                loadPositions();
            }, 1000);
        },
        error: function(xhr) {
            console.error('Erro ao teleportar jogador:', xhr);
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro desconhecido ao teleportar jogador';
            showToast('Erro', errorMsg, 'error');
        },
        complete: function() {
            // Reabilitar botão
            $('#confirmPlayerTeleportBtn').prop('disabled', false).html('<i class="fas fa-map-marker-alt me-1"></i>Teleportar');
        }
    });
}

/**
 * Fechar modal e aguardar clique no mapa para definir posição do jogador
 */
function useMapPositionForPlayer() {
    const playerId = $('#teleportPlayerId').val();
    
    if (!playerId) {
        showToast('Erro', 'ID do jogador não encontrado', 'error');
        return;
    }
    
    // Adicionar jogador ao filtro (se ainda não estiver)
    if (!MapState.selectedPlayerFilters.includes(playerId)) {
        addPlayerToFilter(playerId);
    }
    
    // Fechar modal
    bootstrap.Modal.getInstance(document.getElementById('playerTeleportModal')).hide();
    
    // Ativar modo teleporte (o cursor mudará para crosshair automaticamente)
    setMode('teleport');
    
    showToast('Info', 'Clique no mapa para definir a posição do jogador', 'info');
}

/**
 * Executar teleporte de jogador para posição
 */
function executeTeleportToPlayer() {
    const selectedPlayerId = $('#confirmTeleportToPlayerBtn').data('selectedPlayerId');
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
    $('#clonePointDate').text(formatTimestampBR(point.timestamp));
    $('#cloneCoords').text(`X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}, Z=${point.coord_z ? point.coord_z.toFixed(1) : 'N/A'}`);
    
    // Armazenar dados
    $('#confirmCloneCharacterBtn').data('sourcePlayerId', playerId);
    $('#confirmCloneCharacterBtn').data('playerCoordId', point.player_coord_id);
    $('#confirmCloneCharacterBtn').data('selectedPlayerId', null);
    
    // Limpar campos de pesquisa e seleção
    $('#cloneCharacterSearch').val('');
    $('#cloneCharacterSearchResults').hide();
    $('#cloneCharacterSelected').hide();
    
    // Buscar TODOS os jogadores para filtrar apenas offline
    $.get('/api/players/positions')
        .done(function(data) {
            // Filtrar apenas jogadores offline E diferentes do jogador de origem
            cloneCharacterPlayerList = data.players.filter(function(player) {
                return !player.is_online && player.player_id !== playerId;
            });
            
            if (cloneCharacterPlayerList.length === 0) {
                $('#cloneCharacterSearch').prop('disabled', true).attr('placeholder', 'Nenhum jogador offline disponível');
                $('#confirmCloneCharacterBtn').prop('disabled', true);
            } else {
                $('#cloneCharacterSearch').prop('disabled', false).attr('placeholder', 'Digite o nome do jogador...');
                $('#confirmCloneCharacterBtn').prop('disabled', false);
            }
        })
        .fail(function() {
            $('#cloneCharacterSearch').prop('disabled', true).attr('placeholder', 'Erro ao carregar jogadores');
            cloneCharacterPlayerList = [];
        });
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('cloneCharacterModal'));
    modal.show();
}

/**
 * Executar clonagem de personagem
 */
function executeCloneCharacter() {
    const targetPlayerId = $('#confirmCloneCharacterBtn').data('selectedPlayerId');
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

/**
 * Mapeamento de tipos de eventos para nomes legíveis em português
 */
const EVENT_TYPE_NAMES = {
    'player_connected': 'Conexão',
    'player_disconnected': 'Desconexão',
    'player_death': 'Morte',
    'player_killed': 'Morto por Jogador',
    'player_respawn': 'Respawn',
    'damage_taken': 'Dano Recebido',
    'damage_dealt': 'Dano Causado',
    'fence_built': 'Fence Construída',
    'fence_destroyed': 'Fence Destruída',
    'watchtower_built': 'Torre Construída',
    'watchtower_destroyed': 'Torre Destruída',
    'flag_built': 'Bandeira Construída',
    'shelter_built': 'Abrigo Construído',
    'loadout_changed': 'Loadout Alterado',
    'admin_action': 'Ação Admin',
    'chat_command': 'Comando de Chat',
    'item_found': 'Item Encontrado',
    'item_picked_up': 'Item Coletado',
    'item_dropped': 'Item Solto',
    'item_used': 'Item Usado',
    'vehicle_entered': 'Entrou em Veículo',
    'vehicle_exited': 'Saiu de Veículo',
    'vehicle_damaged': 'Veículo Danificado',
    'infected_killed': 'Zumbi Morto',
    'teleport': 'Teleporte',
    'custom_event': 'Evento Customizado'
};

/**
 * Formatar tipo de evento para exibição
 */
function formatEventType(eventType) {
    return EVENT_TYPE_NAMES[eventType] || eventType;
}

/**
 * Formatar detalhes JSON de forma legível
 */
function formatEventDetails(detailsStr, eventType) {
    if (!detailsStr) return 'N/A';
    
    try {
        const details = JSON.parse(detailsStr);
        const parts = [];
        
        // Para eventos de conexão e desconexão, remover timestamp (já existe coluna na tabela)
        const isConnectionEvent = eventType === 'player_connected' || eventType === 'player_disconnected';
        
        for (const [key, value] of Object.entries(details)) {
            if (value !== null && value !== undefined) {
                // Pular timestamp para eventos de conexão/desconexão
                if (isConnectionEvent && key === 'timestamp') {
                    continue;
                }
                
                // Formatar Country com bandeira (igual à tabela de jogadores online)
                if (key === 'Country' && value) {
                    const flag = getCountryFlag(value);
                    if (flag) {
                        parts.push(`Country: ${flag} ${escapeHtml(value)}`);
                    } else {
                        parts.push(`Country: ${escapeHtml(value)}`);
                    }
                }
                // Formatar IP como link (igual à tabela de jogadores online)
                else if (key === 'IP' && value) {
                    const ipUrl = `https://ip-api.com/#${escapeHtml(value)}`;
                    parts.push(`IP: <a href="${ipUrl}" target="_blank" class="text-decoration-none">${escapeHtml(value)}</a>`);
                } else {
                    parts.push(`${key}: ${value}`);
                }
            }
        }
        
        return parts.length > 0 ? parts.join(', ') : 'N/A';
    } catch (e) {
        return detailsStr;
    }
}

/**
 * Formatar coordenadas para exibição
 */
function formatEventCoords(coordX, coordY, coordZ) {
    if (coordX !== null && coordX !== undefined && 
        coordY !== null && coordY !== undefined) {
        let coords = `X: ${parseFloat(coordX).toFixed(1)}, Y: ${parseFloat(coordY).toFixed(1)}`;
        if (coordZ !== null && coordZ !== undefined) {
            coords += `, Z: ${parseFloat(coordZ).toFixed(1)}`;
        }
        return coords;
    }
    return 'N/A';
}

/**
 * Estado do histórico de eventos
 */
const EventsHistoryState = {
    currentPlayerId: null,
    currentPage: 1,
    limit: 50,
    dateFrom: null,
    dateTo: null,
    eventType: null
};

/**
 * Mostrar modal de histórico de eventos do jogador
 */
function showPlayerEventsHistory(playerId, playerName) {
    if (!playerId || !playerName) {
        showToast('Erro', 'Dados do jogador não disponíveis', 'error');
        return;
    }
    
    // Fechar modal de ações do jogador
    const playerModal = bootstrap.Modal.getInstance(document.getElementById('playerMarkerActionsModal'));
    if (playerModal) {
        playerModal.hide();
    }
    
    // Configurar estado
    EventsHistoryState.currentPlayerId = playerId;
    EventsHistoryState.currentPage = 1;
    EventsHistoryState.dateFrom = null;
    EventsHistoryState.dateTo = null;
    EventsHistoryState.eventType = null;
    
    // Atualizar nome no modal
    $('#eventsHistoryPlayerName').text(playerName);
    
    // Limpar filtros
    $('#eventsHistoryStartDate').val('');
    $('#eventsHistoryStartTime').val('');
    $('#eventsHistoryEndDate').val('');
    $('#eventsHistoryEndTime').val('');
    $('#eventsHistoryEventType').val('');
    
    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('playerEventsHistoryModal'));
    modal.show();
    
    // Carregar eventos
    loadPlayerEvents();
}

/**
 * Carregar eventos do jogador
 */
function loadPlayerEvents() {
    const playerId = EventsHistoryState.currentPlayerId;
    if (!playerId) {
        return;
    }
    
    // Mostrar indicador de carregamento
    $('#eventsHistoryLoading').show();
    $('#eventsHistoryTableContainer').hide();
    $('#eventsHistoryPagination').hide();
    
    // Construir parâmetros da API
    const params = {
        limit: EventsHistoryState.limit,
        offset: (EventsHistoryState.currentPage - 1) * EventsHistoryState.limit
    };
    
    // Adicionar filtros de data
    if (EventsHistoryState.dateFrom) {
        params.date_from = EventsHistoryState.dateFrom;
    }
    if (EventsHistoryState.dateTo) {
        params.date_to = EventsHistoryState.dateTo;
    }
    if (EventsHistoryState.eventType) {
        params.event_type = EventsHistoryState.eventType;
    }
    
    // Fazer requisição
    $.get(`/api/players/${playerId}/events`, params)
        .done(function(data) {
            $('#eventsHistoryLoading').hide();
            $('#eventsHistoryTableContainer').show();
            
            if (data.events && data.events.length > 0) {
                renderPlayerEvents(data.events, data.pagination);
            } else {
                $('#eventsHistoryTableBody').html(`
                    <tr>
                        <td colspan="5" class="text-center text-muted">Nenhum evento encontrado</td>
                    </tr>
                `);
                $('#eventsHistoryPagination').hide();
            }
        })
        .fail(function() {
            $('#eventsHistoryLoading').hide();
            $('#eventsHistoryTableContainer').show();
            $('#eventsHistoryTableBody').html(`
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Erro ao carregar eventos
                    </td>
                </tr>
            `);
            $('#eventsHistoryPagination').hide();
        });
}

/**
 * Renderizar eventos na tabela
 */
function renderPlayerEvents(events, pagination) {
    const tbody = $('#eventsHistoryTableBody');
    tbody.empty();
    
    events.forEach(function(event) {
        const timestamp = new Date(event.timestamp);
        const formattedDate = timestamp.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const eventTypeName = event.event_type;
        const eventType = formatEventType(eventTypeName);
        const coords = formatEventCoords(event.coord_x, event.coord_y, event.coord_z);
        const details = formatEventDetails(event.details, eventTypeName);
        const relatedPlayer = event.related_player_name || (event.related_player_id ? 'ID: ' + event.related_player_id.substring(0, 8) + '...' : 'N/A');
        
        const row = `
            <tr>
                <td>${formattedDate}</td>
                <td><span class="badge bg-info">${eventType}</span></td>
                <td><small>${coords}</small></td>
                <td><small>${details}</small></td>
                <td><small>${relatedPlayer}</small></td>
            </tr>
        `;
        tbody.append(row);
    });
    
    // Atualizar paginação
    if (pagination && pagination.total > 0) {
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        $('#eventsHistoryCurrentPage').text(EventsHistoryState.currentPage);
        $('#eventsHistoryTotalPages').text(totalPages);
        $('#eventsHistoryTotalCount').text(pagination.total);
        
        $('#eventsHistoryPrevPage').prop('disabled', EventsHistoryState.currentPage <= 1);
        $('#eventsHistoryNextPage').prop('disabled', EventsHistoryState.currentPage >= totalPages || !pagination.has_more);
        
        $('#eventsHistoryPagination').show();
    } else {
        $('#eventsHistoryPagination').hide();
    }
}

/**
 * Aplicar filtros de histórico
 */
function applyEventsHistoryFilters() {
    const startDate = $('#eventsHistoryStartDate').val();
    const startTime = $('#eventsHistoryStartTime').val();
    const endDate = $('#eventsHistoryEndDate').val();
    const endTime = $('#eventsHistoryEndTime').val();
    const eventType = $('#eventsHistoryEventType').val();
    
    // Construir data início
    if (startDate) {
        const startDateTime = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`;
        EventsHistoryState.dateFrom = new Date(startDateTime).toISOString();
    } else {
        EventsHistoryState.dateFrom = null;
    }
    
    // Construir data fim
    if (endDate) {
        const endDateTime = endTime ? `${endDate}T${endTime}:59` : `${endDate}T23:59:59`;
        EventsHistoryState.dateTo = new Date(endDateTime).toISOString();
    } else {
        EventsHistoryState.dateTo = null;
    }
    
    EventsHistoryState.eventType = eventType || null;
    EventsHistoryState.currentPage = 1;
    
    loadPlayerEvents();
}

/**
 * Limpar filtros de histórico
 */
function clearEventsHistoryFilters() {
    $('#eventsHistoryStartDate').val('');
    $('#eventsHistoryStartTime').val('');
    $('#eventsHistoryEndDate').val('');
    $('#eventsHistoryEndTime').val('');
    $('#eventsHistoryEventType').val('');
    
    EventsHistoryState.dateFrom = null;
    EventsHistoryState.dateTo = null;
    EventsHistoryState.eventType = null;
    EventsHistoryState.currentPage = 1;
    
    loadPlayerEvents();
}

/**
 * Limpar histórico de eventos do jogador
 */
function clearPlayerEvents() {
    const playerId = EventsHistoryState.currentPlayerId;
    const playerName = $('#eventsHistoryPlayerName').text();
    
    if (!playerId) {
        alert('Erro: ID do jogador não encontrado');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja limpar TODOS os eventos do jogador "${playerName}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }
    
    // Desabilitar botão durante a operação
    const btn = $('#clearPlayerEventsBtn');
    const originalHtml = btn.html();
    btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Limpando...');
    
    $.ajax({
        url: `/api/players/${playerId}/events/clear`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                alert('Histórico de eventos limpo com sucesso!');
                // Recarregar eventos (que agora estarão vazios)
                EventsHistoryState.currentPage = 1;
                loadPlayerEvents();
            } else {
                alert('Erro: ' + (response.message || 'Não foi possível limpar os eventos'));
            }
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.message || 'Erro ao limpar eventos';
            alert('Erro: ' + errorMsg);
        },
        complete: function() {
            btn.prop('disabled', false).html(originalHtml);
        }
    });
}

