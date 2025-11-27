/**
 * Módulo de Estado Global do Mapa
 * Centraliza todas as variáveis globais compartilhadas entre módulos
 */

const MapState = {
    // Mapa Leaflet
    map: null,
    mapConfigs: {},
    mapConfigList: [],
    currentMapConfig: null,
    mapImageOverlay: null,
    
    // Dados de entidades
    playersData: {},
    vehiclesData: {},
    containersData: {},
    fencesData: {},
    
    // Marcadores
    playerMarkers: {},
    vehicleMarkers: {},
    containerMarkers: {},
    fenceMarkers: {},
    killMarkers: [],
    damageMarkers: [],
    
    // Trails
    playerTrails: {},
    vehicleTrails: {},
    containerTrails: {},
    fenceTrails: {},
    
    // Status de refresh (comandos) por entidade
    vehicleRefreshStatus: {},
    vehicleRefreshRequests: {},
    containerRefreshStatus: {},
    containerRefreshRequests: {},
    fenceRefreshStatus: {},
    fenceRefreshRequests: {},
    
    // Popups abertos (para manter abertos durante auto-refresh)
    isVehiclePopupOpen: {},
    isContainerPopupOpen: {},
    isFencePopupOpen: {},
    
    // Dados completos dos trails (para comparação entre pontos)
    playerTrailsData: {},
    
    // Proteção contra requisições duplicadas de trails
    loadingTrails: {},
    
    // Estados anteriores (para detecção de mudanças)
    previousPlayersData: {},
    previousVehiclesData: {},
    previousContainersData: {},
    previousFencesData: {},
    previousKillsData: [],
    previousDamagesData: [],
    
    // Estados de exibição
    showPlayers: true,
    showVehicles: false,
    showContainers: false,
    showFences: false,
    showKills: false,
    showDamages: false,
    showTrails: false,
    
    // Filtros e seleções
    selectedPlayerFilters: [],
    selectedVehicleFilters: [],
    selectedContainerFilters: [],
    trailDateFilter: {
        enabled: false,
        startDate: null,
        endDate: null
    },
    vehicleTrailFilters: {}, // Filtros de trail por veículo: { vehicleId: { enabled, startDate, endDate, shortcut } }
    containerTrailFilters: {}, // Filtros de trail por container: { containerId: { enabled, startDate, endDate, shortcut } }
    activeTrailShortcut: null,
    hasCustomFilter: false,
    
    // Contextos
    currentPointContext: null,
    currentPlayerContext: null,
    
    // Modos e teleporte
    currentMode: 'normal',
    teleportTargetVehicle: null,
    teleportTargetContainer: null,
    vehicleTeleportUseMapPosition: false,
    scanCircle: null,
    scanMarkers: {},
    scanRegionCircle: null,
    isScanning: false,
    
    // Notificações
    notificationsEnabled: true,
    
    // Histórico
    currentHistoryType: null,
    currentHistoryId: null,
    currentHistoryPagination: {
        limit: 50,
        offset: 0,
        date_from: null,
        date_to: null
    },
    
    // Auto-refresh
    autoRefreshInterval: null,
    
    // Clusters
    containerClusterGroup: null
};

