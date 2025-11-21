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
    
    // Atualizar visibilidade inicial do botão de trails
    updateTrailButtonVisibility();
    
    // Inicializar visibilidade do log de notificações
    MapState.notificationsEnabled = $('#notificationsCheck').is(':checked');
    toggleNotificationLog();
    
    // Event listeners
    $('#refreshBtn').on('click', loadPositions);
    $('#autoRefreshCheck').on('change', toggleAutoRefresh);
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
    
    // Event listener para atalhos de filtro de trails
    $('[data-filter]').on('click', function() {
        const filter = $(this).data('filter');
        applyTrailFilterShortcut(filter);
    });
    
    // Event listeners para modos
    $('#btnModeNormal').on('click', () => setMode('normal'));
    $('#btnModeTeleport').on('click', () => setMode('teleport'));
    
    // Verificar se há filtro de player_id na URL e aplicar
    const urlParams = new URLSearchParams(window.location.search);
    const playerIdFilter = urlParams.get('player_id');
    if (playerIdFilter) {
        setTimeout(function() {
            // Adicionar ao array de filtros ao invés de usar select
            MapState.selectedPlayerFilters.push(playerIdFilter);
            updateSelectedPlayersBadges();
            filterPlayers();
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
            
            // Abrir modal de teleporte com dropdown de jogadores
            showPlayerMarkerActions(
                MapState.currentPointContext.point,
                MapState.currentPointContext.playerId
            );
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
    
    // Botão de confirmação de clonagem
    $('#confirmCloneCharacterBtn').on('click', executeCloneCharacter);
    
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
    
    $('#checkInventoryActionBtn').on('click', function() {
        if (MapState.currentPlayerContext) {
            checkPlayerInventory(
                MapState.currentPlayerContext.playerId,
                MapState.currentPlayerContext.playerName
            );
        }
    });
    
    // Limpar intervalos ao sair da página
    $(window).on('beforeunload', function() {
        if (MapState.autoRefreshInterval) {
            clearInterval(MapState.autoRefreshInterval);
        }
    });
});
