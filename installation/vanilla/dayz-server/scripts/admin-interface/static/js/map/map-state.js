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
    trailDateFilter: {
        enabled: false,
        startDate: null,
        endDate: null
    },
    
    // Contextos
    currentPointContext: null,
    currentPlayerContext: null,
    
    // Modos e teleporte
    currentMode: 'normal',
    teleportTargetPlayer: null,
    teleportTargetVehicle: null,
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

