/**
 * Módulo de Utilitários do Mapa
 * Funções utilitárias e conversões de coordenadas
 */

// Constantes
const BASE_MAP_SIZE = 4096;

/**
 * Obter data/hora atual em America/Sao_Paulo como objeto Date em UTC
 * @returns {Date} Objeto Date em UTC que representa o momento atual em São Paulo
 */
function getNowInSaoPaulo() {
    // Simplesmente retornar a data atual (que já está em UTC internamente)
    // Quando usamos new Date(), ele já representa o momento atual em UTC
    // Não precisamos converter, apenas retornar
    return new Date();
}

/**
 * Converter data/hora de America/Sao_Paulo para UTC
 * Cria um objeto Date que representa a data/hora em São Paulo, convertido para UTC
 * @param {string} dateString - Data no formato 'YYYY-MM-DD'
 * @param {string} timeString - Hora no formato 'HH:MM:SS' ou 'HH:MM'
 * @returns {Date} Objeto Date em UTC que representa a data/hora de São Paulo
 */
function convertSaoPauloToUTC(dateString, timeString) {
    if (!dateString) return null;
    
    // Garantir formato de hora completo
    let fullTime = timeString || '00:00:00';
    if (fullTime.split(':').length === 2) {
        fullTime += ':00';
    }
    
    // Parse da data/hora
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes, seconds = 0] = fullTime.split(':').map(Number);
    
    // Abordagem: usar uma data de referência para calcular o offset de SP
    // Criar uma data UTC de referência (meio-dia do dia desejado)
    const refUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    
    // Obter como essa data seria exibida em São Paulo
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const refSPString = spFormatter.format(refUTC);
    // Formato retornado: 'YYYY-MM-DD, HH:MM:SS'
    // refSPString representa como SP vê 12:00 UTC
    
    const [refSPDatePart, refSPTimePart] = refSPString.split(', ');
    const [refSPYear, refSPMonth, refSPDay] = refSPDatePart.split('-').map(Number);
    const [refSPHours, refSPMinutes, refSPSeconds = 0] = refSPTimePart.split(':').map(Number);
    
    // Calcular offset: diferença de horas entre 12:00 UTC e como SP vê 12:00 UTC
    // Se refUTC é 12:00 UTC e em SP é 09:00, então SP está 3 horas atrás de UTC
    // Isso significa que offset = 3 horas (SP está atrás, então UTC está à frente)
    const offsetHours = 12 - refSPHours;
    
    // Se a data mudou (dia anterior ou seguinte), ajustar
    if (refSPDay !== day) {
        const dayDiff = day - refSPDay;
        const offsetHoursWithDay = offsetHours + (dayDiff * 24);
        const offsetMs = offsetHoursWithDay * 60 * 60 * 1000;
        const desiredAsUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        // Se a hora no filtro é 01:48 e o usuário quer 01:48 UTC (não 04:48),
        // isso significa que a hora no filtro já está em UTC, não em SP
        // Então não devemos converter, apenas retornar a data como está
        // Mas espera, o usuário disse que "a data no filtro Data Inicio e Hora está correta"
        // Então talvez a hora no filtro esteja em SP, mas estamos convertendo errado
        // Vamos testar: se offset é positivo (SP está atrás), para converter SP para UTC adicionamos
        // Mas se está enviando 04:48 quando deveria ser 01:48, então estamos adicionando quando não devemos
        // Vamos SUBTRAIR o offset
        return new Date(desiredAsUTC.getTime() - offsetMs);
    }
    
    const offsetMs = offsetHours * 60 * 60 * 1000;
    
    // Criar data UTC que representa a data/hora desejada
    const desiredAsUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    
    // Se está enviando 04:48 quando deveria ser 01:48, estamos adicionando 3h quando não devemos
    // Isso sugere que a hora no filtro já está em UTC, não em SP
    // Ou que estamos convertendo na direção errada
    // Vamos SUBTRAIR o offset em vez de adicionar
    return new Date(desiredAsUTC.getTime() - offsetMs);
}

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

