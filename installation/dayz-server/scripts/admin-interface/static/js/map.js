/**
 * Mapa Principal - Orquestrador de Módulos
 * Este arquivo carrega e inicializa todos os módulos do sistema de mapa
 * 
 * Ordem de carregamento (via HTML):
 * 1. map-state.js - Estado global compartilhado
 * 2. map-utils.js - Funções utilitárias
 * 3. map-icons.js - Criação de ícones
 * 4. map-core.js - Inicialização do mapa
 * 5. map-history.js - Funções de histórico
 * 6. map-notifications.js - Sistema de notificações
 * 7. map-players.js - Lógica de jogadores
 * 8. map-vehicles.js - Lógica de veículos
 * 9. map-containers.js - Lógica de containers
 * 10. map-fences.js - Lógica de construções
 * 11. map-events.js - Lógica de kills e damages
 * 12. map-teleport.js - Sistema de teleporte
 * 13. map.js (este arquivo) - Inicialização e event listeners
 */

// Event listeners e inicialização
$(document).ready(function() {
    initializeMapConfigs();
    initMap();
    setupMapSelector();
    loadPositions();
    
    // Garantir que inputs de hora sempre usem formato 24h
    // O valor sempre é retornado em formato 24h pelo JavaScript, mas podemos adicionar
    // uma validação para garantir consistência
    $('#trailStartTime, #trailEndTime').on('change', function() {
        const value = $(this).val();
        if (value) {
            // Garantir formato HH:MM:SS (adicionar segundos se não existirem)
            if (value.length === 5) {
                $(this).val(value + ':00');
            }
        }
    });
    
    // Atualizar visibilidade inicial do botão de trails
    updateTrailButtonVisibility();
    
    // Inicializar visibilidade do log de notificações
    MapState.notificationsEnabled = $('#notificationsCheck').is(':checked');
    toggleNotificationLog();
    
    // Event listeners
    $('#refreshBtn').on('click', loadPositions);
    $('#autoRefreshCheck').on('change', toggleAutoRefresh);
    $('#autoRefreshInterval').on('change', function() {
        // Se auto-refresh estiver ativo, reiniciar com novo intervalo
        if ($('#autoRefreshCheck').is(':checked')) {
            toggleAutoRefresh();
        }
    });
    $('#notificationsCheck').on('change', toggleNotifications);
    $('#onlineOnlyCheck').on('change', filterPlayers);
    $('#showDestroyedCheck').on('change', function() {
        if (MapState.showVehicles) loadVehicles();
        if (MapState.showContainers) loadContainers();
        if (MapState.showFences) loadFences();
    });
    $('#toggleTrailsBtn').on('click', toggleTrails);
    $('#togglePlayersBtn').on('click', togglePlayersDisplay);
    $('#toggleVehiclesBtn').on('click', toggleVehiclesDisplay);
    $('#toggleContainersBtn').on('click', toggleContainersDisplay);
    $('#toggleFencesBtn').on('click', toggleFencesDisplay);
    $('#toggleKillsBtn').on('click', toggleKills);
    $('#toggleDamagesBtn').on('click', toggleDamages);
    $('#applyTrailFilter').on('click', applyTrailDateFilter);
    
    // Event listeners para o novo sistema de filtro de jogadores
    $('#playerSearchInput').on('input', handlePlayerSearch);
    $('#playerSearchInput').on('focus', handlePlayerSearch);
    $('#playerSearchInput').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#playerSearchResults').hide(), 200);
    });
    $('#clearAllFiltersBtn').on('click', clearAllPlayerFilters);
    
    // Event listeners para o novo sistema de filtro de veículos
    $('#vehicleSearchInput').on('input', handleVehicleSearch);
    $('#vehicleSearchInput').on('focus', handleVehicleSearch);
    $('#vehicleSearchInput').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#vehicleSearchResults').hide(), 200);
    });
    $('#clearAllVehicleFiltersBtn').on('click', clearAllVehicleFilters);
    
    // Event listener para atalhos de filtro de trails
    $('[data-filter]').on('click', function() {
        const filter = $(this).data('filter');
        applyTrailFilterShortcut(filter);
    });
    
    // Event listeners para modos
    $('#btnModeNormal').on('click', () => setMode('normal'));
    $('#btnModeTeleport').on('click', () => setMode('teleport'));
    $('#btnModeScan').on('click', () => setMode('scan'));
    
    // Event listener para atualizar círculo de escaneamento quando raio mudar
    $('#scanRadiusInput').on('input', function() {
        if (MapState.currentMode === 'scan') {
            updateScanCircle();
        }
    });
    
    // Event listener para limpar marcadores de escaneamento
    $('#btnClearScanMarkers').on('click', clearScanMarkers);
    
    // Função para fazer zoom no jogador
    function zoomToPlayer(playerId) {
        // Aguardar marcador ser criado (com retry)
        const maxAttempts = 10;
        let attempts = 0;
        
        const tryZoom = function() {
            attempts++;
            const marker = MapState.playerMarkers[playerId];
            const playerData = MapState.playersData[playerId];
            
            if (marker) {
                // Marcador existe, fazer zoom
                const latLng = marker.getLatLng();
                MapState.map.flyTo(latLng, 3, {
                    animate: true,
                    duration: 1.0
                });
            } else if (playerData && playerData.pixel_coords) {
                // Marcador ainda não existe, mas temos dados do jogador
                const mapCoords = convertToMapCoords(playerData.pixel_coords);
                if (mapCoords) {
                    MapState.map.flyTo(mapCoords, 3, {
                        animate: true,
                        duration: 1.0
                    });
                }
            } else if (attempts < maxAttempts) {
                // Aguardar mais um pouco e tentar novamente
                setTimeout(tryZoom, 500);
            }
        };
        
        // Primeira tentativa após um delay inicial
        setTimeout(tryZoom, 1000);
    }
    
    // Verificar se há filtro de player_id na URL e aplicar
    const urlParams = new URLSearchParams(window.location.search);
    const playerIdFilter = urlParams.get('player_id');
    if (playerIdFilter) {
        // Desativar filtro "Apenas Online" para permitir visualizar jogadores offline
        $('#onlineOnlyCheck').prop('checked', false);
        
        // Ativar trails dos jogadores
        if (!MapState.showTrails) {
            MapState.showTrails = true;
            $('#toggleTrailsBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar trails dos jogadores');
        }
        
        setTimeout(function() {
            // Adicionar ao array de filtros ao invés de usar select
            MapState.selectedPlayerFilters.push(playerIdFilter);
            updateSelectedPlayersBadges();
            filterPlayers();
        }, 500); // Aguardar carga completa do mapa
        
        // Fazer zoom no jogador após carregar posições
        // Usar um listener único para fazer zoom após o primeiro carregamento
        let zoomExecuted = false;
        const originalLoadPositions = window.loadPositions;
        const wrappedLoadPositions = function() {
            const result = originalLoadPositions.apply(this, arguments);
            
            if (!zoomExecuted) {
                zoomExecuted = true;
                // Aguardar um pouco para marcadores serem criados
                setTimeout(function() {
                    zoomToPlayer(playerIdFilter);
                }, 1500);
                
                // Restaurar função original após primeira execução
                window.loadPositions = originalLoadPositions;
            }
            
            return result;
        };
        
        // Interceptar apenas uma vez
        window.loadPositions = wrappedLoadPositions;
    }
    
    // Verificar se há filtro de vehicle_id na URL e aplicar
    const vehicleIdFilter = urlParams.get('vehicle_id');
    if (vehicleIdFilter) {
        setTimeout(function() {
            // Garantir que veículos estão sendo exibidos
            if (!MapState.showVehicles) {
                MapState.showVehicles = true;
                $('#toggleVehiclesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Veículos');
            }
            // Adicionar ao array de filtros
            MapState.selectedVehicleFilters.push(vehicleIdFilter);
            updateSelectedVehiclesBadges();
            // Carregar veículos (que aplicará o filtro automaticamente)
            loadVehicles();
        }, 500); // Aguardar carga completa do mapa
    }
    
    // Auto-refresh inicial
    toggleAutoRefresh();
    
    // Botão de restaurar backup
    $('#confirmRestoreBtn').on('click', executeRestoreBackup);
    
    // Menu de ações
    $('#restoreBackupActionBtn').on('click', function() {
        if (MapState.currentPointContext && MapState.currentPointContext.hasBackup) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de restauração
            showRestoreBackupModal(
                MapState.currentPointContext.playerId,
                MapState.currentPointContext.point,
                MapState.currentPointContext.pointNumber
            );
        }
    });
    
    $('#teleportActionBtn').on('click', function() {
        if (MapState.currentPointContext) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de teleporte de jogador para posição (igual ao botão do jogador online)
            showTeleportToPlayerModal();
        }
    });
    
    // Botão de clonagem no menu de ações
    $('#cloneCharacterActionBtn').on('click', function() {
        if (MapState.currentPointContext) {
            // Fechar menu de ações
            bootstrap.Modal.getInstance(document.getElementById('pointActionsModal')).hide();
            
            // Abrir modal de clonagem
            showCloneCharacterModal(
                MapState.currentPointContext.playerId,
                MapState.currentPointContext.point,
                MapState.currentPointContext.pointNumber
            );
        }
    });
    
    // Botão de teleporte entre jogadores
    $('#confirmTeleportToPlayerBtn').on('click', executeTeleportToPlayer);
    $('#teleportToPlayerSearch').on('input', handleTeleportToPlayerSearch);
    
    // Esconder resultados quando clicar fora
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#teleportToPlayerSearch, #teleportToPlayerSearchResults').length) {
            $('#teleportToPlayerSearchResults').hide();
        }
    });
    
    // Botão de confirmação de clonagem
    $('#confirmCloneCharacterBtn').on('click', executeCloneCharacter);
    
    // Event listeners para pesquisa de clonagem
    $('#cloneCharacterSearch').on('input', handleCloneCharacterSearch);
    $('#cloneCharacterSearch').on('focus', handleCloneCharacterSearch);
    $('#cloneCharacterSearch').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#cloneCharacterSearchResults').hide(), 200);
    });
    
    // Esconder resultados quando clicar fora do modal de clonagem
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#cloneCharacterSearch, #cloneCharacterSearchResults').length) {
            $('#cloneCharacterSearchResults').hide();
        }
    });
    
    // Limpar teleportTargetVehicle apenas quando modal for cancelado explicitamente
    $('#vehicleTeleportModal').on('hidden.bs.modal', function(e) {
        // Não limpar se foi fechado para usar posição do mapa
        if (MapState.vehicleTeleportUseMapPosition) {
            return;
        }
        
        // Não limpar se foi fechado por sucesso de teleporte (será limpo na função executeVehicleTeleport)
        // Só limpar se foi cancelado pelo botão Cancelar ou fechado pelo X
        const relatedTarget = e.relatedTarget || (e.target && $(e.target).closest('.btn-close, .btn-secondary')[0]);
        if (relatedTarget && ($(relatedTarget).hasClass('btn-secondary') || $(relatedTarget).hasClass('btn-close'))) {
            MapState.teleportTargetVehicle = null;
            // Voltar ao modo normal se não houver jogador selecionado
            if (MapState.selectedPlayerFilters.length === 0) {
                setMode('normal');
            }
        }
    });
    
    // Botões do modal de ações do jogador
    $('#teleportPlayerActionBtn').on('click', function() {
        if (MapState.currentPlayerContext) {
            // Fechar modal de ações
            bootstrap.Modal.getInstance(document.getElementById('playerMarkerActionsModal')).hide();
            
            // Abrir modal de teleporte
            showTeleportToPlayerModal();
        }
    });
    
    $('#teleportPlayerDirectBtn').on('click', function() {
        if (MapState.currentPlayerContext) {
            // Fechar modal de ações
            bootstrap.Modal.getInstance(document.getElementById('playerMarkerActionsModal')).hide();
            
            // Abrir modal de teleporte direto
            showPlayerTeleportModal();
        }
    });
    
    $('#checkInventoryActionBtn').on('click', function() {
        if (MapState.currentPlayerContext) {
            checkPlayerInventory(
                MapState.currentPlayerContext.playerId,
                MapState.currentPlayerContext.playerName
            );
        }
    });
    
    // Botão de ver mais ações (redireciona para players.html)
    $('#viewMoreActionsBtn').on('click', function() {
        if (MapState.currentPlayerContext) {
            const playerId = MapState.currentPlayerContext.playerId;
            window.location.href = `/players?player_id=${encodeURIComponent(playerId)}`;
        }
    });
    
    // Event listeners do modal de histórico de eventos
    $('#applyEventsHistoryFilter').on('click', applyEventsHistoryFilters);
    $('#clearEventsHistoryFilter').on('click', clearEventsHistoryFilters);
    $('#eventsHistoryPrevPage').on('click', function() {
        if (EventsHistoryState.currentPage > 1) {
            EventsHistoryState.currentPage--;
            loadPlayerEvents();
        }
    });
    $('#eventsHistoryNextPage').on('click', function() {
        EventsHistoryState.currentPage++;
        loadPlayerEvents();
    });
    
    // Botões do modal de teleporte de jogador
    $('#confirmPlayerTeleportBtn').on('click', executePlayerTeleport);
    $('#useMapPositionForPlayerBtn').on('click', useMapPositionForPlayer);
    
    // Atualizar modo quando modal de teleporte de jogador for fechado
    $('#playerTeleportModal').on('hidden.bs.modal', function(e) {
        // Voltar ao modo normal se não houver jogador selecionado no filtro
        if (MapState.selectedPlayerFilters.length === 0 && !MapState.teleportTargetVehicle && !MapState.teleportTargetContainer) {
            setMode('normal');
        } else {
            updateTeleportInfo();
        }
    });
    
    // Limpar intervalos ao sair da página
    $(window).on('beforeunload', function() {
        if (MapState.autoRefreshInterval) {
            clearInterval(MapState.autoRefreshInterval);
        }
    });
});
