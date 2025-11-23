/**
 * Módulo de Ícones do Mapa
 * Criação de ícones e marcadores Leaflet
 */

/**
 * Criar ícone de marcador de jogador
 * @param {string} color - Cor hexadecimal do marcador
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createMarkerIcon(color) {
    return L.divIcon({
        className: 'player-marker player-marker-pulse',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone customizado para veículos
 * @param {boolean} hasMoved - Indica se o veículo se moveu
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createVehicleIcon(hasMoved = false) {
    // Cor verde para veículos estáticos, laranja para veículos que se moveram
    const backgroundColor = hasMoved ? '#ff9800' : '#28a745';
    const borderColor = hasMoved ? '#ff6f00' : 'white';
    
    return L.divIcon({
        className: 'vehicle-marker',
        html: `<div style="background-color: ${backgroundColor}; border: 2px solid ${borderColor}; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="fas fa-car" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [20, 20]
    });
}

/**
 * Criar ícone customizado para containers baseado no tipo
 * @param {string} containerType - Tipo do container
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createContainerIcon(containerType) {
    let color, iconClass;
    
    if (containerType && containerType.startsWith('Barrel')) {
        // Barrels - Azul
        color = '#007bff';
        iconClass = 'fas fa-drum';
    } else if (containerType === 'WoodenCrate' || containerType === 'CargoNet' || containerType === 'SeaChest') {
        // Crates - Marrom
        color = '#8b4513';
        iconClass = 'fas fa-box';
    } else if (containerType && (containerType.includes('Tent') || containerType.includes('CarTent'))) {
        // Tents - Verde
        color = '#28a745';
        iconClass = 'fas fa-campground';
    } else if (containerType && containerType.startsWith('Shelter')) {
        // Shelters - Marrom escuro
        color = '#795548';
        iconClass = 'fas fa-home';
    } else {
        // Default - Cinza
        color = '#6c757d';
        iconClass = 'fas fa-box';
    }
    
    return L.divIcon({
        className: 'container-marker',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="${iconClass}" style="color: white; font-size: 12px;"></i></div>`,
        iconSize: [20, 20]
    });
}

/**
 * Criar ícone personalizado para clusters de containers
 * @param {L.MarkerCluster} cluster - Cluster do Leaflet MarkerCluster
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createContainerClusterIcon(cluster) {
    const count = cluster.getChildCount();
    let size = 'small';
    let backgroundColor = '#ff9800';
    
    if (count < 10) {
        size = 'small';
        backgroundColor = '#ff9800';
    } else if (count < 50) {
        size = 'medium';
        backgroundColor = '#ff5722';
    } else {
        size = 'large';
        backgroundColor = '#d32f2f';
    }
    
    const sizeMap = {
        small: 40,
        medium: 50,
        large: 60
    };
    
    const fontSizeMap = {
        small: 10,
        medium: 12,
        large: 14
    };
    
    const iconSizeMap = {
        small: 14,
        medium: 16,
        large: 18
    };
    
    const sizePx = sizeMap[size];
    const fontSize = fontSizeMap[size];
    const iconSize = iconSizeMap[size];
    
    return L.divIcon({
        html: `<div style="background-color: ${backgroundColor}; border: 3px solid white; width: ${sizePx}px; height: ${sizePx}px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
            <i class="fas fa-boxes" style="font-size: ${iconSize}px; margin-bottom: 2px;"></i>
            <span style="font-size: ${fontSize}px; line-height: 1;">${count}</span>
        </div>`,
        className: 'container-cluster-marker',
        iconSize: L.point(sizePx, sizePx)
    });
}

/**
 * Criar ícone customizado para construções (fences e watchtowers)
 * @param {Object} fence - Dados da construção
 * @param {boolean} hasRecentAttack - Indica se houve ataque recente
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createFenceIcon(fence, hasRecentAttack = false) {
    const structureType = fence?.structure_type || 'fence';
    if (structureType === 'watchtower') {
        const details = fence.watchtower_details || {};
        const completionScore = ['level_1_base', 'level_2_base', 'level_3_base', 'has_roof']
            .reduce((sum, key) => sum + (details[key] ? 1 : 0), 0);
        let color = '#4e73df';
        if (completionScore >= 4) {
            color = '#1cc88a';
        } else if (completionScore >= 2) {
            color = '#36b9cc';
        }
        // Se houver ataque recente, alterar cor para laranja/vermelho
        if (hasRecentAttack) {
            color = '#ff6b35';
        }
        // Adicionar ícone de alerta se houver ataque recente
        const alertIcon = hasRecentAttack ? '<i class="fas fa-exclamation-triangle" style="position: absolute; top: -5px; right: -5px; color: #dc3545; font-size: 10px; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;"></i>' : '';
        return L.divIcon({
            className: 'fence-marker watchtower-marker',
            html: `<div style="position: relative; background-color: ${color}; border: 2px solid ${hasRecentAttack ? '#dc3545' : 'white'}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-chess-rook" style="color: white; font-size: 13px;"></i>${alertIcon}
            </div>`,
            iconSize: [24, 24]
        });
    }
    
    if (structureType === 'flag') {
        const details = fence.flag_details || {};
        let color = '#dc3545';
        if (details.has_flag_base) {
            color = '#1cc88a';
        }
        return L.divIcon({
            className: 'fence-marker flag-marker',
            html: `<div style="position: relative; background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-flag" style="color: white; font-size: 13px;"></i>
            </div>`,
            iconSize: [24, 24]
        });
    }

    const fenceName = fence?.fence_name || '';
    let color, iconClass;
    
    // Verificar se ambos painéis estão construídos
    const lowerPanelBuilt = fence?.lower_panel_built === true || fence?.lower_panel_built === 1;
    const upperPanelBuilt = fence?.upper_panel_built === true || fence?.upper_panel_built === 1;
    const bothPanelsBuilt = lowerPanelBuilt && upperPanelBuilt;
    
    // Determinar ícone baseado no tipo de fence
    if (fenceName.includes('Gate')) {
        iconClass = 'fas fa-door-open';
    } else if (fenceName.includes('Open')) {
        iconClass = 'fas fa-unlock';
    } else if (fenceName.includes('Locked')) {
        iconClass = 'fas fa-lock';
    } else {
        iconClass = 'fas fa-border-all';
    }
    
    // Determinar cor com prioridade: hasRecentAttack > portão não trancado > ambos painéis construídos > tipo de fence
    if (hasRecentAttack) {
        // Prioridade 1: Ataque recente - Laranja/Vermelho
        if (fenceName.includes('Locked')) {
            color = '#c82333';
        } else {
            color = '#ff6b35';
        }
    } else if (fenceName.includes('Gate') && !fenceName.includes('Locked')) {
        // Prioridade 2: Portão não trancado (Gate sem Locked) - Vermelho
        // Isso inclui portões abertos (Open) e portões genéricos (Gate)
        color = '#dc3545';
    } else if (bothPanelsBuilt) {
        // Prioridade 3: Ambos painéis construídos - Verde
        color = '#28a745';
    } else {
        // Prioridade 4: Cor baseada no tipo de fence
        if (fenceName.includes('Gate')) {
            color = '#28a745';
        } else if (fenceName.includes('Locked')) {
            color = '#dc3545';
        } else {
            color = '#6c757d';
        }
    }
    
    // Adicionar ícone de alerta se houver ataque recente
    const alertIcon = hasRecentAttack ? '<i class="fas fa-exclamation-triangle" style="position: absolute; top: -5px; right: -5px; color: #dc3545; font-size: 10px; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;"></i>' : '';
    
    return L.divIcon({
        className: 'fence-marker',
        html: `<div style="position: relative; background-color: ${color}; border: 2px solid ${hasRecentAttack ? '#dc3545' : 'white'}; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content:center;"><i class="${iconClass}" style="color: white; font-size: 12px;"></i>${alertIcon}</div>`,
        iconSize: [22, 22]
    });
}

/**
 * Criar ícone de kill
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createKillIcon() {
    return L.divIcon({
        className: 'kill-marker',
        html: `<div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-skull-crossbones" style="color: white; font-size: 12px; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);"></i>
               </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]  // Centralizar o ícone no círculo
    });
}

/**
 * Criar ícone do killer (jogador que matou)
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createKillerIcon() {
    return L.divIcon({
        className: 'killer-marker',
        html: `<div style="background-color: #007bff; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone da vítima (jogador que morreu)
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createVictimIcon() {
    return L.divIcon({
        className: 'victim-marker',
        html: `<div style="background-color: #dc3545; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-skull-crossbones" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone do atacante (jogador que causou dano)
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createDamageAttackerIcon() {
    return L.divIcon({
        className: 'damage-attacker-marker',
        html: `<div style="background-color: #ff9800; border: 2px solid #ff6f00; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-fist-raised" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Criar ícone da vítima de dano (jogador que recebeu dano)
 * @returns {L.DivIcon} Ícone do Leaflet
 */
function createDamageVictimIcon() {
    return L.divIcon({
        className: 'damage-victim-marker',
        html: `<div style="background-color: #ffc107; border: 2px solid #ffa000; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-heart-broken" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

