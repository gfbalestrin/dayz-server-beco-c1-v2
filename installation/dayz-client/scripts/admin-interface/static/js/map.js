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
    loadAdminIdsForMap();
    
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
    $('#showEmptyContainersCheck').on('change', function() {
        if (MapState.showContainers) loadContainers();
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
    
    // Event listeners para o novo sistema de filtro de exclusão de jogadores
    $('#playerExcludeSearchInput').on('input', handlePlayerExcludeSearch);
    $('#playerExcludeSearchInput').on('focus', handlePlayerExcludeSearch);
    $('#playerExcludeSearchInput').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#playerExcludeSearchResults').hide(), 200);
    });
    $('#clearAllExclusionsBtn').on('click', clearAllPlayerExclusions);
    
    // Event listeners para o novo sistema de filtro de veículos
    $('#vehicleSearchInput').on('input', handleVehicleSearch);
    $('#vehicleSearchInput').on('focus', handleVehicleSearch);
    $('#vehicleSearchInput').on('blur', function() {
        // Delay para permitir clique nos resultados
        setTimeout(() => $('#vehicleSearchResults').hide(), 200);
    });
    $('#clearAllVehicleFiltersBtn').on('click', clearAllVehicleFilters);
    
    // Event listeners para filtro de trail de veículos
    $('#vehicleTrailFilterModal button[data-filter]').on('click', function() {
        const vehicleId = $('#vehicleTrailFilterVehicleId').val();
        const filter = $(this).data('filter');
        if (vehicleId && filter) {
            applyVehicleTrailFilterShortcut(vehicleId, filter);
        }
    });
    $('#applyVehicleTrailFilterBtn').on('click', function() {
        const vehicleId = $('#vehicleTrailFilterVehicleId').val();
        if (vehicleId) {
            applyVehicleTrailDateFilter(vehicleId);
        }
    });
    $('#hideVehicleTrailBtn').on('click', function() {
        const vehicleId = $('#vehicleTrailFilterVehicleId').val();
        if (vehicleId) {
            hideVehicleTrail(vehicleId);
        }
    });
    
    // Event listeners para filtro de trail de containers
    $('#containerTrailFilterModal button[data-filter]').on('click', function() {
        const containerId = $('#containerTrailFilterContainerId').val();
        const filter = $(this).data('filter');
        if (containerId && filter) {
            applyContainerTrailFilterShortcut(containerId, filter);
        }
    });
    $('#applyContainerTrailFilterBtn').on('click', function() {
        const containerId = $('#containerTrailFilterContainerId').val();
        if (containerId) {
            applyContainerTrailDateFilter(containerId);
        }
    });
    $('#hideContainerTrailBtn').on('click', function() {
        const containerId = $('#containerTrailFilterContainerId').val();
        if (containerId) {
            hideContainerTrail(containerId);
        }
    });
    
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
    
    // Função para fazer zoom no veículo
    function zoomToVehicle(vehicleId) {
        // Aguardar marcador ser criado (com retry)
        const maxAttempts = 10;
        let attempts = 0;
        
        const tryZoom = function() {
            attempts++;
            const marker = MapState.vehicleMarkers[vehicleId];
            const vehicleData = MapState.vehiclesData[vehicleId];
            
            if (marker) {
                // Marcador existe, fazer zoom
                const latLng = marker.getLatLng();
                MapState.map.flyTo(latLng, 3, {
                    animate: true,
                    duration: 1.0
                });
            } else if (vehicleData && vehicleData.pixel_coords) {
                // Marcador ainda não existe, mas temos dados do veículo
                const mapCoords = convertToMapCoords(vehicleData.pixel_coords);
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
    
    // Função para fazer zoom no container
    function zoomToContainer(containerId) {
        // Aguardar marcador ser criado (com retry)
        const maxAttempts = 10;
        let attempts = 0;
        
        const tryZoom = function() {
            attempts++;
            const marker = MapState.containerMarkers[containerId];
            const containerData = MapState.containersData[containerId];
            
            if (marker) {
                // Marcador existe, fazer zoom
                const latLng = marker.getLatLng();
                MapState.map.flyTo(latLng, 3, {
                    animate: true,
                    duration: 1.0
                });
            } else if (containerData && containerData.pixel_coords) {
                // Marcador ainda não existe, mas temos dados do container
                const mapCoords = convertToMapCoords(containerData.pixel_coords);
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
    
    // Função para fazer zoom na estrutura
    function zoomToStructure(structureId) {
        // Aguardar marcador ser criado (com retry)
        const maxAttempts = 10;
        let attempts = 0;
        
        const tryZoom = function() {
            attempts++;
            const marker = MapState.fenceMarkers[structureId];
            const fenceData = MapState.fencesData[structureId];
            
            if (marker) {
                // Marcador existe, fazer zoom
                const latLng = marker.getLatLng();
                MapState.map.flyTo(latLng, 3, {
                    animate: true,
                    duration: 1.0
                });
            } else if (fenceData && fenceData.coord_x !== undefined && fenceData.coord_y !== undefined) {
                // Marcador ainda não existe, mas temos dados da estrutura
                const pixelCoords = [fenceData.coord_x, fenceData.coord_y];
                const mapCoords = convertToMapCoords(pixelCoords);
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
            // Mostrar seções de atalhos e filtros
            $('#trailQuickShortcuts').show();
            $('#trailCustomFilter').show();
            // Aplicar filtro padrão de 30 segundos automaticamente
            if (typeof applyTrailFilterShortcut === 'function') {
                applyTrailFilterShortcut('30seconds');
            }
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
        }, 500); // Aguardar carga completa do mapa
        
        // Fazer zoom no veículo após carregar veículos
        // Usar um listener único para fazer zoom após o primeiro carregamento
        let zoomExecuted = false;
        const originalLoadVehicles = window.loadVehicles;
        const wrappedLoadVehicles = function() {
            const result = originalLoadVehicles.apply(this, arguments);
            
            if (!zoomExecuted) {
                zoomExecuted = true;
                // Aguardar um pouco para marcadores serem criados
                setTimeout(function() {
                    zoomToVehicle(vehicleIdFilter);
                }, 1500);
                
                // Restaurar função original após primeira execução
                window.loadVehicles = originalLoadVehicles;
            }
            
            return result;
        };
        
        // Interceptar apenas uma vez
        window.loadVehicles = wrappedLoadVehicles;
        
        // Carregar veículos (que aplicará o filtro automaticamente)
        setTimeout(function() {
            loadVehicles();
        }, 500);
    }
    
    // Verificar se há filtro de container_id na URL e aplicar
    const containerIdFilter = urlParams.get('container_id');
    if (containerIdFilter) {
        setTimeout(function() {
            // Garantir que containers estão sendo exibidos
            if (!MapState.showContainers) {
                MapState.showContainers = true;
                $('#toggleContainersBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Containers');
            }
            // Adicionar ao array de filtros
            MapState.selectedContainerFilters.push(containerIdFilter);
        }, 500); // Aguardar carga completa do mapa
        
        // Fazer zoom no container após carregar containers
        // Usar um listener único para fazer zoom após o primeiro carregamento
        let zoomExecuted = false;
        const originalLoadContainers = window.loadContainers;
        const wrappedLoadContainers = function() {
            const result = originalLoadContainers.apply(this, arguments);
            
            if (!zoomExecuted) {
                zoomExecuted = true;
                // Aguardar um pouco para marcadores serem criados
                setTimeout(function() {
                    zoomToContainer(containerIdFilter);
                }, 1500);
                
                // Restaurar função original após primeira execução
                window.loadContainers = originalLoadContainers;
            }
            
            return result;
        };
        
        // Interceptar apenas uma vez
        window.loadContainers = wrappedLoadContainers;
        
        // Carregar containers (que aplicará o filtro automaticamente)
        setTimeout(function() {
            loadContainers();
        }, 500);
    }
    
    // Verificar se há filtro de structure_id na URL e aplicar
    const structureIdFilter = urlParams.get('structure_id');
    if (structureIdFilter) {
        setTimeout(function() {
            // Garantir que estruturas estão sendo exibidas
            if (!MapState.showFences) {
                MapState.showFences = true;
                $('#toggleFencesBtn').html('<i class="fas fa-eye-slash me-1"></i>Ocultar Construções');
            }
            // Adicionar ao array de filtros
            MapState.selectedStructureFilters.push(structureIdFilter);
        }, 500); // Aguardar carga completa do mapa
        
        // Fazer zoom na estrutura após carregar estruturas
        // Usar um listener único para fazer zoom após o primeiro carregamento
        let zoomExecuted = false;
        const originalLoadFences = window.loadFences;
        const wrappedLoadFences = function() {
            const result = originalLoadFences.apply(this, arguments);
            
            if (!zoomExecuted) {
                zoomExecuted = true;
                // Aguardar um pouco para marcadores serem criados
                setTimeout(function() {
                    zoomToStructure(structureIdFilter);
                }, 1500);
                
                // Restaurar função original após primeira execução
                window.loadFences = originalLoadFences;
            }
            
            return result;
        };
        
        // Interceptar apenas uma vez
        window.loadFences = wrappedLoadFences;
        
        // Carregar estruturas (que aplicará o filtro automaticamente)
        setTimeout(function() {
            loadFences();
        }, 500);
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
        if (!$(e.target).closest('#playerExcludeSearchInput, #playerExcludeSearchResults').length) {
            $('#playerExcludeSearchResults').hide();
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
    $('#clearPlayerEventsBtn').on('click', clearPlayerEvents);
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
    
    // Inicializar colapso das seções da sidebar
    initializeSidebarCollapse();
    
    // Event listener para busca de jogadores na sidebar
    $('#sidebarPlayerSearch').on('input', function() {
        updateSidebarPlayersList();
    });
    
    // Iniciar polling de eventos de jogadores se notificações estiverem ativas
    if (MapState.notificationsEnabled) {
        startPlayerEventsPolling();
    }
    
    // Event listener para alternar notificações
    $('#notificationsCheck').on('change', function() {
        toggleNotifications();
        if ($(this).is(':checked')) {
            startPlayerEventsPolling();
        } else {
            stopPlayerEventsPolling();
        }
    });
});

/**
 * Gerenciamento de colapso das seções da sidebar
 */
function initializeSidebarCollapse() {
    // Carregar estados salvos do localStorage
    const savedStates = JSON.parse(localStorage.getItem('mapSidebarStates') || '{}');
    
    // Estados padrão se não houver salvos
    const defaultStates = {
        'jogadores-online': 'expanded',
        'notificacoes': 'collapsed',
        'modos': 'collapsed',
        'visualizar': 'expanded',
        'filtros': 'collapsed'
    };
    
    // Aplicar estados (salvos ou padrões)
    Object.keys(defaultStates).forEach(function(section) {
        const state = savedStates[section] || defaultStates[section];
        if (state === 'collapsed') {
            collapseSectionImmediate(section);
        }
    });
    
    // Event listeners para botões de toggle
    $('.section-toggle').on('click', function() {
        const section = $(this).data('section');
        toggleSection(section);
    });
}

function toggleSection(section) {
    const contentId = '#' + section + '-content';
    const $content = $(contentId);
    const $toggle = $('.section-toggle[data-section="' + section + '"]');
    
    if ($content.hasClass('collapsed')) {
        // Expandir
        $content.removeClass('collapsed');
        $toggle.removeClass('collapsed');
        saveState(section, 'expanded');
    } else {
        // Colapsar
        $content.addClass('collapsed');
        $toggle.addClass('collapsed');
        saveState(section, 'collapsed');
    }
}

function collapseSectionImmediate(section) {
    const contentId = '#' + section + '-content';
    const $content = $(contentId);
    const $toggle = $('.section-toggle[data-section="' + section + '"]');
    
    $content.addClass('collapsed');
    $toggle.addClass('collapsed');
}

function saveState(section, state) {
    const states = JSON.parse(localStorage.getItem('mapSidebarStates') || '{}');
    states[section] = state;
    localStorage.setItem('mapSidebarStates', JSON.stringify(states));
}

/**
 * Popular lista de jogadores online na sidebar
 */
function updateSidebarPlayersList() {
    const $list = $('#sidebarPlayersList');
    const searchTerm = $('#sidebarPlayerSearch').val().toLowerCase();
    
    // Filtrar jogadores online
    const onlinePlayers = Object.keys(MapState.playersData)
        .map(id => ({ id, ...MapState.playersData[id] }))
        .filter(p => p.is_online || p.isOnline)
        .filter(p => {
            if (!searchTerm) return true;
            const name = (p.player_name || p.name || '').toLowerCase();
            const steamName = (p.steam_name || p.steamName || '').toLowerCase();
            return name.includes(searchTerm) || steamName.includes(searchTerm);
        })
        .sort((a, b) => {
            const nameA = (a.player_name || a.name || '').toLowerCase();
            const nameB = (b.player_name || b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    
    // Atualizar contador
    $('#sidebarOnlineCount').text(onlinePlayers.length);
    
    // Se vazio
    if (onlinePlayers.length === 0) {
        $list.html('<div class="text-muted text-center small py-3">Nenhum jogador online</div>');
        return;
    }
    
    // Gerar HTML
    let html = '';
    onlinePlayers.forEach(function(player) {
        const playerName = player.player_name || player.name || 'Jogador';
        const steamName = player.steam_name || player.steamName || '';
        const steamId = player.steam_id || player.steamId || '';
        let steamNameDisplay = '';
        if (steamName && steamId) {
            steamNameDisplay = ` (<a href="https://steamcommunity.com/profiles/${steamId}" target="_blank" class="text-decoration-none" title="Ver perfil Steam" onclick="event.stopPropagation();">${steamName}</a>)`;
        } else if (steamName) {
            steamNameDisplay = ` (${steamName})`;
        }
        const isAdmin = player.is_admin || false;
        const adminBadge = isAdmin ? '<span class="badge bg-danger ms-1" style="font-size: 0.65rem;">Admin</span>' : '';

        html += `
            <div class="sidebar-player-item" data-player-id="${player.id}">
                <div class="sidebar-player-name">
                    🟢 ${playerName}${steamNameDisplay}${adminBadge}
                </div>
                <div class="sidebar-player-actions">
                    <button class="btn btn-sm btn-outline-primary"
                            onclick="zoomToPlayerFromSidebar('${player.id}')"
                            title="Zoom no jogador">
                        <i class="fas fa-search-location"></i>
                    </button>
                    <button class="btn btn-sm ${MapState.selectedPlayerFilters.includes(player.id) ? 'btn-info' : 'btn-outline-info'}"
                            onclick="viewPlayerTrailFromSidebar('${player.id}')"
                            title="${MapState.selectedPlayerFilters.includes(player.id) ? 'Remover trail' : 'Ver trail'}">
                        <i class="fas fa-route"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning"
                            onclick="showPlayerControlPanelFromMap('${player.id}')"
                            title="Painel de Controle">
                        <i class="fas fa-sliders-h"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    $list.html(html);
}

/**
 * Zoom em jogador a partir da sidebar
 */
function zoomToPlayerFromSidebar(playerId) {
    const marker = MapState.playerMarkers[playerId];
    if (marker) {
        const latLng = marker.getLatLng();
        MapState.map.flyTo(latLng, 3, {
            animate: true,
            duration: 1.0
        });
        // Abrir popup
        marker.openPopup();
    }
}

/**
 * Carregar IDs de administradores para o mapa
 */
function loadAdminIdsForMap() {
    $.get('/api/admins/list')
        .done(function(response) {
            if (response.admins && Array.isArray(response.admins)) {
                MapState.adminIds = new Set(response.admins.map(a => a.PlayerID || a.player_id));
            }
        })
        .fail(function() {
            console.warn('Não foi possível carregar lista de administradores');
        });
}

/**
 * Abrir painel de controle do jogador a partir do mapa
 * @param {string} playerId - ID do jogador
 */
function showPlayerControlPanelFromMap(playerId) {
    // Buscar dados do jogador do MapState
    const playerData = MapState.playersData[playerId];
    if (!playerData) {
        showToast('Erro', 'Jogador não encontrado', 'error');
        return;
    }

    // Converter para formato esperado pelo showPlayerControlPanel (PascalCase)
    const playerFormatted = {
        PlayerID: playerId,
        PlayerName: playerData.player_name || playerData.name || 'Jogador',
        SteamName: playerData.steam_name || playerData.steamName || '',
        SteamID: playerData.steam_id || playerData.steamId || '',
        IsOnline: (playerData.is_online || playerData.isOnline) ? 1 : 0
    };

    // Preparar dados para os módulos compartilhados
    const playersDataArray = [playerFormatted];

    // Configurar dados compartilhados para os módulos
    setSharedPlayerData(playersDataArray, MapState.adminIds);

    // Chamar função compartilhada
    showPlayerControlPanel(playerId, playerFormatted.PlayerName);
}

/**
 * Expandir seção se estiver colapsada
 */
function expandSectionIfCollapsed(section) {
    const $content = $('#' + section + '-content');
    if ($content.hasClass('collapsed')) {
        toggleSection(section);
    }
}

/**
 * Atualizar estado visual do botão de trail na sidebar
 */
function updateSidebarTrailButtonState(playerId, isActive) {
    const $btn = $(`.sidebar-player-actions button[onclick*="viewPlayerTrailFromSidebar('${playerId}')"]`);
    if (isActive) {
        $btn.removeClass('btn-outline-info').addClass('btn-info');
        $btn.attr('title', 'Remover trail');
    } else {
        $btn.removeClass('btn-info').addClass('btn-outline-info');
        $btn.attr('title', 'Ver trail');
    }
}

/**
 * Ver trail do jogador a partir da sidebar
 */
function viewPlayerTrailFromSidebar(playerId) {
    const isActive = MapState.selectedPlayerFilters.includes(playerId);

    if (isActive) {
        // Desativar trail do jogador
        MapState.selectedPlayerFilters = MapState.selectedPlayerFilters.filter(id => id !== playerId);
        updateSelectedPlayersBadges();
        filterPlayers();
        updateSidebarTrailButtonState(playerId, false);
        return;
    }

    // Ativar trails se não estiver ativo
    if (!MapState.showTrails) {
        $('#toggleTrailsBtn').click();
    }

    // Expandir seções "Filtros" e "Visualizar" se estiverem colapsadas
    expandSectionIfCollapsed('filtros');
    expandSectionIfCollapsed('visualizar');

    // Aplicar filtro "Última Hora" por padrão
    applyTrailFilterShortcut('1hour');

    // Adicionar jogador ao filtro
    MapState.selectedPlayerFilters.push(playerId);
    updateSelectedPlayersBadges();
    filterPlayers();

    // Atualizar estado visual do botão
    updateSidebarTrailButtonState(playerId, true);
}
