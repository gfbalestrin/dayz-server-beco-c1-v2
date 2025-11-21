/**
 * Módulo de Teleporte do Mapa
 * Sistema completo de teleporte de jogadores e veículos
 */

/**
 * Definir modo de interação do mapa
 */
function setMode(mode) {
    MapState.currentMode = mode;
    
    // Atualizar UI dos botões
    $('#btnModeNormal, #btnModeTeleport, #btnModeScan').removeClass('active');
    
    // Ocultar todos os controles
    $('#teleportInfo').hide();
    $('#scanRadiusControl').hide();
    $('#clearScanMarkersBtn').hide();
    
    // Remover círculo de escaneamento se existir
    if (MapState.scanCircle) {
        MapState.map.removeLayer(MapState.scanCircle);
        MapState.scanCircle = null;
    }
    
    // Remover círculo de região escaneada se existir (mas não se estiver escaneando)
    if (MapState.scanRegionCircle && !MapState.isScanning) {
        MapState.map.removeLayer(MapState.scanRegionCircle);
        MapState.scanRegionCircle = null;
    }
    
    if (mode === 'normal') {
        $('#btnModeNormal').addClass('active');
        MapState.map.getContainer().style.cursor = '';
        // Limpar teleportTargetVehicle ao voltar ao modo normal
        if (MapState.teleportTargetVehicle) {
            MapState.teleportTargetVehicle = null;
        }
    } else if (mode === 'teleport') {
        $('#btnModeTeleport').addClass('active');
        $('#teleportInfo').show();
        MapState.map.getContainer().style.cursor = 'crosshair';
        
        // Atualizar mensagem do teleportInfo baseado no contexto
        updateTeleportInfo();
    } else if (mode === 'scan') {
        // Verificar se está escaneando
        if (MapState.isScanning) {
            showToast('Aviso', 'Não é possível mudar de modo enquanto um escaneamento está em andamento', 'warning');
            return;
        }
        
        $('#btnModeScan').addClass('active');
        $('#scanRadiusControl').show();
        $('#clearScanMarkersBtn').show();
        if (MapState.map) {
            MapState.map.getContainer().style.cursor = 'crosshair';
            // Criar círculo visual inicial (será atualizado no mousemove)
            updateScanCircle();
        }
    }
}

/**
 * Atualizar mensagem do teleportInfo baseado no contexto atual
 */
function updateTeleportInfo() {
    const teleportInfo = $('#teleportInfo');
    
    if (MapState.teleportTargetVehicle) {
        const vehicle = MapState.vehiclesData[MapState.teleportTargetVehicle];
        const vehicleName = vehicle ? (vehicle.vehicle_name || 'Veículo') : 'Veículo';
        teleportInfo.html(`
            <div class="alert alert-warning mb-0">
                <i class="fas fa-car me-2"></i><strong>Modo Teleporte de Veículo</strong><br>
                <small>Clique no mapa para teleportar <strong>${vehicleName}</strong></small>
            </div>
        `);
    } else if (MapState.selectedPlayerFilters.length > 0) {
        const playerId = MapState.selectedPlayerFilters[0];
        const player = MapState.playersData[playerId];
        const playerName = player ? (player.name || playerId) : playerId;
        teleportInfo.html(`
            <div class="alert alert-info mb-0">
                <i class="fas fa-user me-2"></i><strong>Modo Teleporte de Jogador</strong><br>
                <small>Clique no mapa para teleportar <strong>${playerName}</strong></small>
            </div>
        `);
    } else {
        teleportInfo.html(`
            <div class="alert alert-secondary mb-0">
                <i class="fas fa-map-marker-alt me-2"></i><strong>Modo Teleporte</strong><br>
                <small>Selecione um jogador no filtro acima ou um veículo no mapa</small>
            </div>
        `);
    }
}

/**
 * Handler para clique no mapa em modo teleporte
 */
function handleTeleportClick(e) {
    // Verificar se é teleporte de veículo (prioridade sobre jogador)
    if (MapState.teleportTargetVehicle) {
        const vehicle = MapState.vehiclesData[MapState.teleportTargetVehicle];
        if (!vehicle) {
            showToast('Erro', 'Veículo não encontrado', 'error');
            MapState.teleportTargetVehicle = null;
            // Voltar ao modo normal se não houver jogador selecionado
            if (MapState.selectedPlayerFilters.length === 0) {
                setMode('normal');
            }
            return;
        }
        
        // Converter pixel para coordenadas DayZ
        const pixelCoords = [e.latlng.lat, e.latlng.lng];
        const dayzCoords = pixelToDayz(pixelCoords);
        
        const vehicleName = vehicle.vehicle_name || 'Veículo';
        
        if (!confirm(`Teleportar ${vehicleName} para X=${dayzCoords.x.toFixed(1)}, Y=${dayzCoords.y.toFixed(1)}?`)) {
            return;
        }
        
        // Verificar se modal está aberto
        const modal = bootstrap.Modal.getInstance(document.getElementById('vehicleTeleportModal'));
        const isModalOpen = modal && modal._isShown;
        
        if (isModalOpen) {
            // Se modal está aberto, preencher campos e executar
            $('#teleportVehicleX').val(dayzCoords.x.toFixed(2));
            $('#teleportVehicleY').val(dayzCoords.y.toFixed(2));
            $('#teleportVehicleZ').val('');
            executeVehicleTeleport();
        } else {
            // Se modal está fechado, executar teleporte diretamente
            const vehicleId = MapState.teleportTargetVehicle;
            const coordX = dayzCoords.x;
            const coordY = dayzCoords.y;
            
            // Desabilitar modo teleporte temporariamente para evitar múltiplos cliques
            const originalMode = MapState.currentMode;
            setMode('normal');
            
            $.ajax({
                url: `/api/vehicles/${vehicleId}/teleport`,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    coord_x: coordX,
                    coord_y: coordY
                }),
                success: function(response) {
                    showToast('Sucesso', response.message, 'success');
                    // Limpar target após teleporte bem-sucedido
                    MapState.teleportTargetVehicle = null;
                    // Voltar ao modo normal se não houver jogador selecionado
                    if (MapState.selectedPlayerFilters.length === 0) {
                        setMode('normal');
                    } else {
                        setMode(originalMode);
                    }
                    // Recarregar veículos após um delay
                    setTimeout(() => {
                        if (MapState.showVehicles) {
                            loadVehicles();
                        }
                    }, 1000);
                },
                error: function(xhr) {
                    console.error('Erro ao teleportar veículo:', xhr);
                    const error = xhr.responseJSON || {};
                    const errorMsg = error.message || error.error || 'Erro desconhecido ao teleportar veículo';
                    showToast('Erro', errorMsg, 'error');
                    // Restaurar modo
                    setMode(originalMode);
                }
            });
        }
        
        // Limpar target será feito na função executeVehicleTeleport após sucesso (se modal aberto)
        // ou no callback do AJAX (se modal fechado)
        updateTeleportInfo();
        return;
    }
    
    // Teleporte de jogador (código original)
    if (MapState.selectedPlayerFilters.length === 0) {
        showToast('Aviso', 'Selecione um jogador no filtro acima para teleportar', 'warning');
        return;
    }
    
    if (MapState.selectedPlayerFilters.length > 1) {
        showToast('Aviso', 'Selecione apenas um jogador para teleportar', 'warning');
        return;
    }
    
    const playerId = MapState.selectedPlayerFilters[0];
    const playerInfo = MapState.playersData[playerId] || {};
    const playerDisplayName = playerInfo.name || playerId;
    const playerSteamName = playerInfo.steamName ? ` (${playerInfo.steamName})` : '';
    
    // Converter pixel para coordenadas DayZ
    const pixelCoords = [e.latlng.lat, e.latlng.lng];
    const dayzCoords = pixelToDayz(pixelCoords);
    
    const confirmationName = `${playerDisplayName}${playerSteamName}`;
    
    if (!confirm(`Teleportar ${confirmationName} para X=${dayzCoords.x.toFixed(1)}, Y=${dayzCoords.y.toFixed(1)}?`)) {
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
    
    updateTeleportInfo();
}

/**
 * Handler para clique no mapa em modo scan
 */
function handleScanClick(e) {
    if (MapState.currentMode !== 'scan') {
        return;
    }
    
    // Obter raio do input
    const radius = parseFloat($('#scanRadiusInput').val()) || 50;
    
    if (radius < 1 || radius > 100) {
        showToast('Erro', 'Raio deve estar entre 1 e 100 metros', 'error');
        return;
    }
    
    // Converter pixel para coordenadas DayZ
    const pixelCoords = [e.latlng.lat, e.latlng.lng];
    const dayzCoords = pixelToDayz(pixelCoords);
    
    // Calcular altura Z (será calculada pelo servidor, mas podemos tentar obter do mapa)
    const coordZ = 0; // Será calculado pelo servidor
    
    // Chamar função de escaneamento
    scanRegion(dayzCoords.x, dayzCoords.y, coordZ, radius);
}

/**
 * Atualizar círculo visual de escaneamento no cursor
 */
function updateScanCircle() {
    if (MapState.currentMode !== 'scan' || !MapState.map) {
        return;
    }
    
    // Remover círculo anterior se existir
    if (MapState.scanCircle) {
        MapState.map.removeLayer(MapState.scanCircle);
    }
    
    // Obter raio do input
    const radius = parseFloat($('#scanRadiusInput').val()) || 50;
    
    // Converter raio de metros para pixels do mapa
    // 1 metro no DayZ = 15360 / pixelSize pixels no mapa
    const pixelSize = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : 4096;
    const radiusInPixels = (radius / 15360.0) * pixelSize;
    
    // Criar círculo no centro do mapa inicialmente (será atualizado no mousemove)
    const center = MapState.map.getCenter();
    MapState.scanCircle = L.circle(center, {
        radius: radiusInPixels,
        color: '#ff6b35',
        fillColor: '#ff6b35',
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '5, 5'
    }).addTo(MapState.map);
    
    // Atualizar posição do círculo quando o mouse se move
    MapState.map.off('mousemove', updateScanCirclePosition);
    MapState.map.on('mousemove', updateScanCirclePosition);
}

/**
 * Atualizar posição do círculo de escaneamento seguindo o cursor
 */
function updateScanCirclePosition(e) {
    if (MapState.currentMode !== 'scan' || !MapState.scanCircle || !e.latlng) {
        return;
    }
    
    // Obter raio do input
    const radius = parseFloat($('#scanRadiusInput').val()) || 50;
    
    // Converter raio de metros para pixels do mapa
    const pixelSize = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : 4096;
    const radiusInPixels = (radius / 15360.0) * pixelSize;
    
    // Atualizar posição e raio do círculo
    MapState.scanCircle.setLatLng(e.latlng);
    MapState.scanCircle.setRadius(radiusInPixels);
}

/**
 * Mostrar modal de teleporte de veículo
 */
function showVehicleTeleportModal(vehicleId) {
    const vehicle = MapState.vehiclesData[vehicleId];
    if (!vehicle) {
        showToast('Erro', 'Veículo não encontrado', 'error');
        return;
    }
    
    // Preencher informações do veículo
    $('#teleportVehicleId').val(vehicleId);
    $('#teleportVehicleName').text(vehicle.vehicle_name || 'Veículo');
    $('#teleportVehicleCurrentCoords').text(`X=${vehicle.coord_x.toFixed(1)}, Y=${vehicle.coord_y.toFixed(1)}`);
    
    // Limpar campos de coordenadas
    $('#teleportVehicleX').val('');
    $('#teleportVehicleY').val('');
    $('#teleportVehicleZ').val('');
    
    // Armazenar vehicleId para uso no clique do mapa
    MapState.teleportTargetVehicle = vehicleId;
    
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
 * Fechar modal e aguardar clique no mapa para definir posição
 */
function useMapPositionForVehicle() {
    // Marcar flag para não limpar teleportTargetVehicle
    MapState.vehicleTeleportUseMapPosition = true;
    
    // Fechar modal
    bootstrap.Modal.getInstance(document.getElementById('vehicleTeleportModal')).hide();
    
    // Garantir que está no modo teleporte
    if (MapState.currentMode !== 'teleport') {
        setMode('teleport');
    }
    
    // Atualizar mensagem do teleportInfo
    updateTeleportInfo();
    
    showToast('Info', 'Clique no mapa para definir a posição do veículo', 'info');
    
    // Resetar flag após um pequeno delay
    setTimeout(() => {
        MapState.vehicleTeleportUseMapPosition = false;
    }, 100);
}

/**
 * Executar teleporte de veículo
 */
function executeVehicleTeleport() {
    const vehicleId = $('#teleportVehicleId').val();
    const coordX = parseFloat($('#teleportVehicleX').val());
    const coordY = parseFloat($('#teleportVehicleY').val());
    const coordZ = $('#teleportVehicleZ').val() ? parseFloat($('#teleportVehicleZ').val()) : null;
    
    if (!vehicleId) {
        showToast('Erro', 'ID do veículo não encontrado', 'error');
        return;
    }
    
    if (isNaN(coordX) || isNaN(coordY)) {
        showToast('Aviso', 'Preencha as coordenadas X e Y', 'warning');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    $('#confirmVehicleTeleportBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Teleportando...');
    
    const payload = {
        coord_x: coordX,
        coord_y: coordY
    };
    
    if (coordZ !== null && !isNaN(coordZ)) {
        payload.coord_z = coordZ;
    }
    
    $.ajax({
        url: `/api/vehicles/${vehicleId}/teleport`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(response) {
            // Fechar modal
            bootstrap.Modal.getInstance(document.getElementById('vehicleTeleportModal')).hide();
            
            // Mostrar mensagem de sucesso
            showToast('Sucesso', response.message, 'success');
            
            // Limpar target após teleporte bem-sucedido
            MapState.teleportTargetVehicle = null;
            
            // Voltar ao modo normal se não houver jogador selecionado
            if (MapState.selectedPlayerFilters.length === 0) {
                setMode('normal');
            } else {
                updateTeleportInfo();
            }
            
            // Recarregar veículos após um delay
            setTimeout(() => {
                if (MapState.showVehicles) {
                    loadVehicles();
                }
            }, 1000);
        },
        error: function(xhr) {
            console.error('Erro ao teleportar veículo:', xhr);
            const error = xhr.responseJSON || {};
            const errorMsg = error.message || error.error || 'Erro desconhecido ao teleportar veículo';
            showToast('Erro', errorMsg, 'error');
        },
        complete: function() {
            // Reabilitar botão
            $('#confirmVehicleTeleportBtn').prop('disabled', false).html('<i class="fas fa-map-marker-alt me-1"></i>Teleportar');
        }
    });
}

