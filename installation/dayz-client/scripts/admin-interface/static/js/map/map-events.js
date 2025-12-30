/**
 * Módulo de Eventos do Mapa
 * Lógica de kills e damages
 */

/**
 * Detectar novos kills
 */
function detectKillChanges(newData, oldData) {
    if (!MapState.showKills) return [];
    
    const oldKillIds = new Set(oldData.map(k => k.kill_id || `${k.killer_id}_${k.victim_id}_${k.timestamp}`));
    const newKills = [];
    
    newData.events.forEach(function(kill) {
        const killId = kill.kill_id || `${kill.killer_id}_${kill.victim_id}_${kill.timestamp}`;
        if (!oldKillIds.has(killId)) {
            newKills.push(kill);
        }
    });
    
    return newKills;
}

/**
 * Detectar novos damages
 */
function detectDamageChanges(newData, oldData) {
    if (!MapState.showDamages) return [];
    
    const oldDamageIds = new Set(oldData.map(d => d.damage_id || `${d.attacker_id}_${d.victim_id}_${d.timestamp}`));
    const newDamages = [];
    
    newData.events.forEach(function(damage) {
        const damageId = damage.damage_id || `${damage.attacker_id}_${damage.victim_id}_${damage.timestamp}`;
        if (!oldDamageIds.has(damageId)) {
            newDamages.push(damage);
        }
    });
    
    return newDamages;
}

/**
 * Carregar eventos de kill
 */
function loadKills() {
    const params = { limit: 50 };
    
    // Adicionar filtro de período se configurado
    const startTime = getMonitoringStartTimestamp();
    if (startTime) {
        params.since = startTime;
    }
    
    $.get('/api/events/kills', params)
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
    // Detectar novos kills antes de atualizar
    if (MapState.previousKillsData.length > 0 && MapState.notificationsEnabled) {
        const newKills = detectKillChanges(data, MapState.previousKillsData);
        newKills.forEach(function(kill) {
            // Verificar se deve notificar baseado nas configurações
            if (shouldNotify('kills')) {
                const killerName = kill.killer_name || 'Desconhecido';
                const victimName = kill.victim_name || 'Desconhecido';
                const weapon = kill.weapon || 'Desconhecida';
                const distance = kill.distance ? `${kill.distance.toFixed(0)}m` : 'N/A';
                const message = `${killerName} matou ${victimName} com ${weapon} (${distance})`;
                const killTimestamp = kill.timestamp ? new Date(kill.timestamp) : new Date();
                showToast('Kill', message, 'danger');
                addNotificationToLog('danger', `Kill: ${message}`, killTimestamp);
            }
        });
    }
    
    // Limpar kills antigos
    MapState.killMarkers.forEach(item => {
        if (item.killerMarker) MapState.map.removeLayer(item.killerMarker);
        if (item.victimMarker) MapState.map.removeLayer(item.victimMarker);
        if (item.line) MapState.map.removeLayer(item.line);
    });
    MapState.killMarkers = [];
    
    if (!MapState.showKills) {
        // Salvar estado anterior mesmo se não estiver mostrando
        MapState.previousKillsData = data.events.map(function(kill) {
            return {
                kill_id: kill.kill_id,
                killer_id: kill.killer_id,
                victim_id: kill.victim_id,
                timestamp: kill.timestamp
            };
        });
        return;
    }
    
    // Adicionar kills
    data.events.forEach(function(event) {
        // Verificar se posições são válidas
        const killerPos = event.killer_pos;
        const victimPos = event.victim_pos;
        
        // Se ambas as posições são null, pular evento
        if (!killerPos && !victimPos) {
            return;
        }
        
        let killerMarker = null;
        let victimMarker = null;
        let line = null;
        
        // Criar marcador do killer (se disponível)
        if (killerPos && killerPos.pixel_coords) {
            const killerCoords = convertToMapCoords(killerPos.pixel_coords);
            
            if (killerCoords) {
                const killerLat = killerCoords[0];
                const killerLng = killerCoords[1];
                
                // Criar marcador do killer com ícone azul e fa-user
                killerMarker = L.marker(killerCoords, {
                    icon: createKillerIcon(),
                    opacity: 1.0
                }).addTo(MapState.map);
                
                // Formatar conteúdo do tooltip do killer
                const killerTooltipContent = `
                    <strong>🔪 Killer</strong><br>
                    <strong>👤 Nome:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                    <strong>💀 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${killerPos.x.toFixed(1)}, Y=${killerPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const killerTooltipDirection = getTooltipDirectionForPoint(killerLat, killerLng);
                
                // Adicionar tooltip hover
                killerMarker.bindTooltip(killerTooltipContent, {
                    permanent: false,
                    direction: killerTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição do killer
                killerMarker.on('click', function() {
                    showKillMarkerActions(event, 'killer');
                });
                
                console.log(`Killer marker criado na posição [${killerLat}, ${killerLng}]`);
            }
        }
        
        // Criar marcador da vítima (se disponível)
        if (victimPos && victimPos.pixel_coords) {
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (victimCoords) {
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Criar marcador da vítima com ícone vermelho e fa-skull-crossbones
                victimMarker = L.marker(victimCoords, {
                    icon: createVictimIcon(),
                    opacity: 1.0
                }).addTo(MapState.map);
                
                // Formatar conteúdo do tooltip da vítima
                let victimTooltipContent = `
                    <strong>💀 Vítima</strong><br>
                    <strong>👤 Nome:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔪 Killer:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                `;
                
                // Adicionar aviso se killer não tiver posição
                if (!killerPos || !killerPos.pixel_coords) {
                    victimTooltipContent += `<span style="color: #ffc107; font-weight: bold;">⚠️ Posição do killer não disponível</span><br>`;
                }
                
                victimTooltipContent += `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${victimPos.x.toFixed(1)}, Y=${victimPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const victimTooltipDirection = getTooltipDirectionForPoint(victimLat, victimLng);
                
                // Adicionar tooltip hover
                victimMarker.bindTooltip(victimTooltipContent, {
                    permanent: false,
                    direction: victimTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição da vítima
                victimMarker.on('click', function() {
                    showKillMarkerActions(event, 'victim');
                });
                
                console.log(`Victim marker criado na posição [${victimLat}, ${victimLng}]`);
            }
        }
        
        // Criar linha conectando killer e victim (apenas se ambas posições são válidas)
        if (killerPos && killerPos.pixel_coords && victimPos && victimPos.pixel_coords) {
            const killerCoords = convertToMapCoords(killerPos.pixel_coords);
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (killerCoords && victimCoords) {
                const killerLat = killerCoords[0];
                const killerLng = killerCoords[1];
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Debug: verificar coordenadas da linha
                console.log(`Kill line - Killer: [${killerLat}, ${killerLng}], Victim: [${victimLat}, ${victimLng}]`);
                
                line = L.polyline([
                    killerCoords,
                    victimCoords
                ], {
                    color: '#dc3545',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10',
                    interactive: true  // Tornar linha clicável
                }).addTo(MapState.map);
                
                // Adicionar tooltip à linha
                const lineTooltip = `
                    <strong>💀 Kill Event</strong><br>
                    <strong>🔪 Killer:</strong> ${event.killer_name}${event.killer_steam_name ? ` (${event.killer_steam_name})` : ''}<br>
                    <strong>💀 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar ao Killer</span>
                `;
                
                // Direção dinâmica para tooltip da linha
                const lineMidLat = (killerLat + victimLat) / 2;
                const lineMidLng = (killerLng + victimLng) / 2;
                const lineTooltipDirection = getTooltipDirectionForPoint(lineMidLat, lineMidLng);
                
                line.bindTooltip(lineTooltip, {
                    permanent: false,
                    direction: lineTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique na linha abre modal de teleporte para posição do killer
                line.on('click', function() {
                    showKillMarkerActions(event, 'killer');
                });
            }
        }
        
        // Adicionar ao array apenas se tiver pelo menos um marcador ou linha
        if (killerMarker || victimMarker || line) {
            MapState.killMarkers.push({ 
                killerMarker: killerMarker, 
                victimMarker: victimMarker, 
                line: line 
            });
        }
    });
    
    console.log(`Kills carregados: ${data.events.length}`);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousKillsData = data.events.map(function(kill) {
        return {
            kill_id: kill.kill_id,
            killer_id: kill.killer_id,
            victim_id: kill.victim_id,
            timestamp: kill.timestamp
        };
    });
}

/**
 * Toggle mostrar kills
 */
function toggleKills() {
    MapState.showKills = !MapState.showKills;
    
    if (MapState.showKills) {
        $('#toggleKillsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Kills');
        loadKills();
    } else {
        $('#toggleKillsBtn').html('<i class="fas fa-skull-crossbones me-1"></i>Mostrar Kills');
        MapState.killMarkers.forEach(item => {
            if (item.killerMarker) MapState.map.removeLayer(item.killerMarker);
            if (item.victimMarker) MapState.map.removeLayer(item.victimMarker);
            if (item.line) MapState.map.removeLayer(item.line);
        });
        MapState.killMarkers = [];
    }
}

/**
 * Carregar eventos de danos
 */
function loadDamages() {
    const params = { limit: 50 };
    
    // Adicionar filtro de período se configurado
    const startTime = getMonitoringStartTimestamp();
    if (startTime) {
        params.since = startTime;
    }
    
    $.get('/api/events/damages', params)
        .done(function(data) {
            updateDamages(data);
        })
        .fail(function() {
            console.error('Erro ao carregar damages');
        });
}

/**
 * Atualizar damages no mapa
 */
function updateDamages(data) {
    // Detectar novos damages antes de atualizar
    if (MapState.previousDamagesData.length > 0 && MapState.notificationsEnabled) {
        const newDamages = detectDamageChanges(data, MapState.previousDamagesData);
        newDamages.forEach(function(damage) {
            // Verificar se deve notificar baseado nas configurações
            if (shouldNotify('damages')) {
                const attackerName = damage.attacker_name || 'Desconhecido';
                const victimName = damage.victim_name || 'Desconhecido';
                const weapon = damage.weapon || 'Desconhecida';
                const distance = damage.distance ? `${damage.distance.toFixed(0)}m` : 'N/A';
                const damageAmount = damage.damage ? damage.damage.toFixed(1) : 'N/A';
                const message = `${attackerName} causou ${damageAmount} de dano em ${victimName} com ${weapon} (${distance})`;
                const damageTimestamp = damage.timestamp ? new Date(damage.timestamp) : new Date();
                showToast('Dano', message, 'warning');
                addNotificationToLog('warning', `Dano: ${message}`, damageTimestamp);
            }
        });
    }
    
    // Limpar damages antigos
    MapState.damageMarkers.forEach(item => {
        if (item.attackerMarker) MapState.map.removeLayer(item.attackerMarker);
        if (item.victimMarker) MapState.map.removeLayer(item.victimMarker);
        if (item.line) MapState.map.removeLayer(item.line);
    });
    MapState.damageMarkers = [];
    
    if (!MapState.showDamages) {
        // Salvar estado anterior mesmo se não estiver mostrando
        MapState.previousDamagesData = data.events.map(function(damage) {
            return {
                damage_id: damage.damage_id,
                attacker_id: damage.attacker_id,
                victim_id: damage.victim_id,
                timestamp: damage.timestamp
            };
        });
        return;
    }
    
    // Adicionar damages
    data.events.forEach(function(event) {
        // Verificar se posições são válidas
        const attackerPos = event.attacker_pos;
        const victimPos = event.victim_pos;
        
        // Se ambas as posições são null, pular evento
        if (!attackerPos && !victimPos) {
            return;
        }
        
        let attackerMarker = null;
        let victimMarker = null;
        let line = null;
        
        // Criar marcador do atacante (se disponível)
        if (attackerPos && attackerPos.pixel_coords) {
            const attackerCoords = convertToMapCoords(attackerPos.pixel_coords);
            
            if (attackerCoords) {
                const attackerLat = attackerCoords[0];
                const attackerLng = attackerCoords[1];
                
                // Criar marcador do atacante com ícone laranja
                attackerMarker = L.marker(attackerCoords, {
                    icon: createDamageAttackerIcon(),
                    opacity: 1.0
                }).addTo(MapState.map);
                
                // Formatar conteúdo do tooltip do atacante
                let attackerTooltipContent = `
                    <strong>⚔️ Atacante</strong><br>
                    <strong>👤 Nome:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                    <strong>🎯 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                `;
                
                if (event.local_damage) {
                    attackerTooltipContent += `<strong>🩸 Local do Dano:</strong> <span class="value">${event.local_damage}</span><br>`;
                }
                if (event.hit_type) {
                    attackerTooltipContent += `<strong>🎯 Tipo de Hit:</strong> <span class="value">${event.hit_type}</span><br>`;
                }
                if (event.damage) {
                    attackerTooltipContent += `<strong>💥 Dano:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.health !== null && event.health !== undefined) {
                    attackerTooltipContent += `<strong>❤️ Vida Restante:</strong> <span class="value">${event.health.toFixed(1)}</span><br>`;
                }
                
                attackerTooltipContent += `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${attackerPos.x.toFixed(1)}, Y=${attackerPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const attackerTooltipDirection = getTooltipDirectionForPoint(attackerLat, attackerLng);
                
                // Adicionar tooltip hover
                attackerMarker.bindTooltip(attackerTooltipContent, {
                    permanent: false,
                    direction: attackerTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição do atacante
                attackerMarker.on('click', function() {
                    showDamageMarkerActions(event, 'attacker');
                });
                
                console.log(`Attacker marker criado na posição [${attackerLat}, ${attackerLng}]`);
            }
        }
        
        // Criar marcador da vítima (se disponível)
        if (victimPos && victimPos.pixel_coords) {
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (victimCoords) {
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Criar marcador da vítima com ícone amarelo
                victimMarker = L.marker(victimCoords, {
                    icon: createDamageVictimIcon(),
                    opacity: 1.0
                }).addTo(MapState.map);
                
                // Formatar conteúdo do tooltip da vítima
                let victimTooltipContent = `
                    <strong>🩸 Vítima</strong><br>
                    <strong>👤 Nome:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                    <strong>⚔️ Atacante:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                `;
                
                // Adicionar aviso se atacante não tiver posição
                if (!attackerPos || !attackerPos.pixel_coords) {
                    victimTooltipContent += `<span style="color: #ffc107; font-weight: bold;">⚠️ Posição do atacante não disponível</span><br>`;
                }
                
                if (event.local_damage) {
                    victimTooltipContent += `<strong>🩸 Local do Dano:</strong> <span class="value">${event.local_damage}</span><br>`;
                }
                if (event.hit_type) {
                    victimTooltipContent += `<strong>🎯 Tipo de Hit:</strong> <span class="value">${event.hit_type}</span><br>`;
                }
                if (event.damage) {
                    victimTooltipContent += `<strong>💥 Dano Recebido:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.health !== null && event.health !== undefined) {
                    victimTooltipContent += `<strong>❤️ Vida Restante:</strong> <span class="value">${event.health.toFixed(1)}</span><br>`;
                }
                
                victimTooltipContent = victimTooltipContent + `
                    <strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>
                    <strong>📏 Distância:</strong> <span class="value">${event.distance ? event.distance.toFixed(0) + 'm' : 'N/A'}</span><br>
                    <strong>📍 Coords:</strong> <span class="value">X=${victimPos.x.toFixed(1)}, Y=${victimPos.y.toFixed(1)}</span><br>
                    <strong>⏰ Data:</strong> <span class="value">${event.timestamp || 'Desconhecido'}</span><br>
                    <span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar</span>
                `;
                
                // Direção dinâmica baseada na posição no mapa
                const victimTooltipDirection = getTooltipDirectionForPoint(victimLat, victimLng);
                
                // Adicionar tooltip hover
                victimMarker.bindTooltip(victimTooltipContent, {
                    permanent: false,
                    direction: victimTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique abre modal de teleporte para posição da vítima
                victimMarker.on('click', function() {
                    showDamageMarkerActions(event, 'victim');
                });
                
                console.log(`Victim marker criado na posição [${victimLat}, ${victimLng}]`);
            }
        }
        
        // Criar linha conectando atacante e vítima (apenas se ambas posições são válidas)
        if (attackerPos && attackerPos.pixel_coords && victimPos && victimPos.pixel_coords) {
            const attackerCoords = convertToMapCoords(attackerPos.pixel_coords);
            const victimCoords = convertToMapCoords(victimPos.pixel_coords);
            
            if (attackerCoords && victimCoords) {
                const attackerLat = attackerCoords[0];
                const attackerLng = attackerCoords[1];
                const victimLat = victimCoords[0];
                const victimLng = victimCoords[1];
                
                // Debug: verificar coordenadas da linha
                console.log(`Damage line - Attacker: [${attackerLat}, ${attackerLng}], Victim: [${victimLat}, ${victimLng}]`);
                
                line = L.polyline([
                    attackerCoords,
                    victimCoords
                ], {
                    color: '#ff9800',
                    weight: 2,
                    opacity: 0.6,
                    dashArray: '5, 10',
                    interactive: true  // Tornar linha clicável
                }).addTo(MapState.map);
                
                // Adicionar tooltip à linha
                let lineTooltip = `
                    <strong>🩸 Damage Event</strong><br>
                    <strong>⚔️ Atacante:</strong> ${event.attacker_name}${event.attacker_steam_name ? ` (${event.attacker_steam_name})` : ''}<br>
                    <strong>🎯 Vítima:</strong> ${event.victim_name}${event.victim_steam_name ? ` (${event.victim_steam_name})` : ''}<br>
                `;
                
                if (event.damage) {
                    lineTooltip += `<strong>💥 Dano:</strong> <span class="value">${event.damage.toFixed(1)}</span><br>`;
                }
                if (event.weapon) {
                    lineTooltip += `<strong>🔫 Arma:</strong> <span class="value">${event.weapon}</span><br>`;
                }
                if (event.distance) {
                    lineTooltip += `<strong>📏 Distância:</strong> <span class="value">${event.distance.toFixed(0)}m</span><br>`;
                }
                
                lineTooltip += `<span style="color: #4caf50; font-weight: bold;">🖱️ Clique para teleportar ao Atacante</span>`;
                
                // Direção dinâmica para tooltip da linha
                const lineMidLat = (attackerLat + victimLat) / 2;
                const lineMidLng = (attackerLng + victimLng) / 2;
                const lineTooltipDirection = getTooltipDirectionForPoint(lineMidLat, lineMidLng);
                
                line.bindTooltip(lineTooltip, {
                    permanent: false,
                    direction: lineTooltipDirection,
                    className: 'trail-tooltip'
                });
                
                // Clique na linha abre modal de teleporte para posição do atacante
                line.on('click', function() {
                    showDamageMarkerActions(event, 'attacker');
                });
            }
        }
        
        // Adicionar ao array apenas se tiver pelo menos um marcador ou linha
        if (attackerMarker || victimMarker || line) {
            MapState.damageMarkers.push({ 
                attackerMarker: attackerMarker, 
                victimMarker: victimMarker, 
                line: line 
            });
        }
    });
    
    console.log(`Damages carregados: ${data.events.length}`);
    
    // Salvar estado anterior para próxima comparação
    MapState.previousDamagesData = data.events.map(function(damage) {
        return {
            damage_id: damage.damage_id,
            attacker_id: damage.attacker_id,
            victim_id: damage.victim_id,
            timestamp: damage.timestamp
        };
    });
}

/**
 * Toggle mostrar damages
 */
function toggleDamages() {
    MapState.showDamages = !MapState.showDamages;
    
    if (MapState.showDamages) {
        $('#toggleDamagesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Damages');
        loadDamages();
    } else {
        $('#toggleDamagesBtn').html('<i class="fas fa-heart-broken me-1"></i>Mostrar Damages');
        MapState.damageMarkers.forEach(item => {
            if (item.attackerMarker) MapState.map.removeLayer(item.attackerMarker);
            if (item.victimMarker) MapState.map.removeLayer(item.victimMarker);
            if (item.line) MapState.map.removeLayer(item.line);
        });
        MapState.damageMarkers = [];
    }
}

/**
 * Mostrar ações para marcador de kill (teleporte)
 */
function showKillMarkerActions(killEvent, positionType) {
    // positionType: 'victim' ou 'killer'
    const isVictim = positionType === 'victim';
    
    let playerName, coordX, coordY, coordZ, posData;
    
    if (isVictim) {
        playerName = killEvent.victim_name || 'Desconhecido';
        posData = killEvent.victim_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    } else {
        playerName = killEvent.killer_name || 'Desconhecido';
        posData = killEvent.killer_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    }
    
    // Se não tiver posição válida, não abrir modal
    if (!posData || coordX === null || coordY === null) {
        showToast('Erro', 'Posição não disponível para este kill', 'error');
        return;
    }
    
    // Preencher informações do kill/de destino
    const positionLabel = isVictim ? 'Vítima' : 'Killer';
    $('#teleportToTargetPlayerName').text(`Kill Event - ${positionLabel}: ${playerName}`);
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
    
    // Buscar jogadores online (sem filtrar nenhum jogador, já que não temos um targetPlayerId)
    $.get('/api/players/online/positions')
        .done(function(data) {
            // Popular lista de jogadores para pesquisa
            teleportToPlayerList = data.players || [];
            
            if (teleportToPlayerList.length === 0) {
                $('#teleportToPlayerSearch').prop('disabled', true).attr('placeholder', 'Nenhum jogador online disponível');
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
 * Mostrar ações para marcador de damage (teleporte)
 */
function showDamageMarkerActions(damageEvent, positionType) {
    // positionType: 'victim' ou 'attacker'
    const isVictim = positionType === 'victim';
    
    let playerName, coordX, coordY, coordZ, posData;
    
    if (isVictim) {
        playerName = damageEvent.victim_name || 'Desconhecido';
        posData = damageEvent.victim_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    } else {
        playerName = damageEvent.attacker_name || 'Desconhecido';
        posData = damageEvent.attacker_pos;
        coordX = posData ? posData.x : null;
        coordY = posData ? posData.y : null;
        coordZ = posData ? posData.z : null;
    }
    
    // Se não tiver posição válida, não abrir modal
    if (!coordX || !coordY) {
        alert('Posição não disponível para teleporte');
        return;
    }
    
    // Verificar se está no modo de teleporte
    if (MapState.currentMode !== 'teleport') {
        // Mudar para modo de teleporte
        setMode('teleport');
    }
    
    // Preencher campos do formulário de teleporte
    $('#teleportX').val(coordX.toFixed(2));
    $('#teleportY').val(coordY.toFixed(2));
    $('#teleportZ').val(coordZ ? coordZ.toFixed(2) : '0');
    $('#teleportPlayerId').val('');
    
    // Mostrar informações do jogador no modal
    $('#teleportInfo').html(`
        <div class="alert alert-info">
            <strong>🩸 Evento de Dano</strong><br>
            <strong>Jogador:</strong> ${playerName}<br>
            <strong>Tipo:</strong> ${isVictim ? 'Vítima' : 'Atacante'}<br>
            <strong>Arma:</strong> ${damageEvent.weapon || 'Desconhecido'}<br>
            <strong>Dano:</strong> ${damageEvent.damage ? damageEvent.damage.toFixed(1) : 'N/A'}
        </div>
    `);
    
    // Abrir modal de teleporte
    $('#teleportModal').modal('show');
}

