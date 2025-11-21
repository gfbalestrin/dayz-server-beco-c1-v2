/**
 * Módulo de Utilitários do Mapa
 * Funções utilitárias e conversões de coordenadas
 */

// Constantes
const BASE_MAP_SIZE = 4096;

// Cor padrão do Leaflet - cores escuras para melhor visibilidade
const iconColors = [
    '#cc0000', '#0044cc', '#008800', '#cc4400', '#6600cc', '#cc0066',
    '#cc9900', '#008899', '#990000', '#000099', '#006600'
];

/**
 * Converter coordenadas armazenadas para o sistema atual do Leaflet
 * @param {Array} pixelCoords - Coordenadas em pixels [x, y]
 * @returns {Array|null} Coordenadas do Leaflet [lat, lng] ou null
 */
function convertToMapCoords(pixelCoords) {
    if (!pixelCoords || pixelCoords.length < 2) {
        return null;
    }
    
    const scaleFactor = getMapScaleFactor();
    return [pixelCoords[0] * scaleFactor, pixelCoords[1] * scaleFactor];
}

/**
 * Determinar direção do tooltip baseado na posição atual
 * @param {number} lat - Latitude (coordenada Y do Leaflet)
 * @param {number} lng - Longitude (coordenada X do Leaflet)
 * @returns {string} Direção do tooltip ('top', 'bottom', 'left', 'right')
 */
function getTooltipDirectionForPoint(lat, lng) {
    const size = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const margin = size * 0.2;
    let direction = 'top';
    
    if (lat < margin) {
        direction = 'bottom';
    } else if (lat > size - margin) {
        direction = 'bottom';
    }
    
    if (lng < margin) {
        direction = 'right';
    } else if (lng > size - margin) {
        direction = 'left';
    }
    
    return direction;
}

/**
 * Calcular offset seguro para popups próximos às bordas do mapa
 * @param {number} lat - Latitude (coordenada Y do Leaflet)
 * @param {number} lng - Longitude (coordenada X do Leaflet)
 * @returns {L.Point} Offset em pixels
 */
function getPopupOffsetForPoint(lat, lng) {
    const size = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const margin = Math.max(size * 0.1, 150);
    let offsetX = 0;
    let offsetY = -24;
    
    if (lat < margin) {
        offsetY = 36;
    } else if (lat > size - margin) {
        offsetY = -36;
    }
    
    if (lng < margin) {
        offsetX = 36;
    } else if (lng > size - margin) {
        offsetX = -36;
    }
    
    return L.point(offsetX, offsetY);
}

/**
 * Gerar cor única para um jogador
 * @param {string} playerId - ID do jogador
 * @returns {string} Cor hexadecimal
 */
function getPlayerColor(playerId) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return iconColors[Math.abs(hash) % iconColors.length];
}

/**
 * Converter coordenadas de pixel para DayZ
 * @param {Array} pixelCoords - Coordenadas em pixels [lat, lng]
 * @returns {Object} Coordenadas DayZ {x, y}
 */
function pixelToDayz(pixelCoords) {
    // Inverso da conversão dayz_to_pixel
    // pixel_x = (coord_x / 15360.0) * 4096
    // pixel_y = (coord_y / 15360.0) * 4096
    const pixelSize = MapState.currentMapConfig ? MapState.currentMapConfig.pixelSize : BASE_MAP_SIZE;
    const x = (pixelCoords[1] / pixelSize) * 15360.0;
    const y = (pixelCoords[0] / pixelSize) * 15360.0;
    return { x: x, y: y };
}

