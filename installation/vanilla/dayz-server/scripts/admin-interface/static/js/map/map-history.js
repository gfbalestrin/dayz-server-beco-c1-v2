/**
 * Módulo de Histórico do Mapa
 * Funções auxiliares para históricos e trails
 */

/**
 * Verificar se todos os pontos do trail estão na mesma posição
 * @param {Array} trail - Array de pontos do trail com mapCoords
 * @returns {boolean} True se todos os pontos estão na mesma posição
 */
function areAllPointsSame(trail) {
    if (trail.length <= 1) return true;
    
    const firstPoint = trail[0];
    const firstCoords = firstPoint.mapCoords;
    
    for (let i = 1; i < trail.length; i++) {
        const currentCoords = trail[i].mapCoords;
        // Comparar com pequena tolerância para erros de ponto flutuante
        const tolerance = 0.0001;
        if (Math.abs(firstCoords[0] - currentCoords[0]) > tolerance ||
            Math.abs(firstCoords[1] - currentCoords[1]) > tolerance) {
            return false;
        }
    }
    
    return true;
}

/**
 * Aplicar filtros de data no histórico
 */
function applyHistoryFilters() {
    const dateFrom = document.getElementById('historyDateFrom').value || null;
    const dateTo = document.getElementById('historyDateTo').value || null;
    
    // Fechar modal antes de recarregar para evitar overlay preso
    const modalElement = document.getElementById('trailHistoryModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    const isModalOpen = modal && modal._isShown;
    
    if (isModalOpen) {
        // Aguardar o modal fechar completamente antes de recarregar
        $(modalElement).one('hidden.bs.modal', function() {
            if (MapState.currentHistoryType === 'container') {
                loadContainerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            } else if (MapState.currentHistoryType === 'fence') {
                loadFenceHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            } else if (MapState.currentHistoryType === 'flag') {
                loadFlagHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            } else if (MapState.currentHistoryType === 'watchtower') {
                loadWatchtowerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            }
        });
        modal.hide();
    } else {
        // Se o modal não estava aberto, executar diretamente
        if (MapState.currentHistoryType === 'container') {
            loadContainerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
        } else if (MapState.currentHistoryType === 'fence') {
            loadFenceHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
        } else if (MapState.currentHistoryType === 'watchtower') {
            loadWatchtowerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
        } else if (MapState.currentHistoryType === 'flag') {
            loadFlagHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
        }
    }
}

/**
 * Carregar página do histórico
 */
function loadHistoryPage(offset) {
    if (MapState.currentHistoryType === 'container') {
        loadContainerHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
    } else if (MapState.currentHistoryType === 'fence') {
        loadFenceHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
    } else if (MapState.currentHistoryType === 'watchtower') {
        loadWatchtowerHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
    } else if (MapState.currentHistoryType === 'flag') {
        loadFlagHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
    }
}

/**
 * Gerar tooltip consolidado para objetos estáticos
 * @param {Array} trail - Array de pontos do trail
 * @param {string} objectType - Tipo do objeto ('vehicle' ou 'container')
 * @param {string} objectName - Nome do objeto
 * @returns {string} HTML do tooltip
 */
function generateConsolidatedTooltip(trail, objectType, objectName) {
    const icon = objectType === 'vehicle' ? '🚗' : '📦';
    let tooltip = `<strong>${icon} ${objectName || objectType}</strong><br>`;
    tooltip += `<strong>📍 ${trail.length} atualizações no mesmo local</strong><br>`;
    tooltip += `<div style="max-height: 300px; overflow-y: auto;">`;
    
    // Timeline reversa (mais recente primeiro)
    for (let i = trail.length - 1; i >= 0; i--) {
        const point = trail[i].data;
        tooltip += `<div style="border-left: 3px solid #${i === trail.length - 1 ? '4caf50' : '007bff'}; padding-left: 8px; margin-bottom: 8px;">`;
        tooltip += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
        tooltip += `📍 Coords: X=${point.coord_x.toFixed(1)}, Y=${point.coord_y.toFixed(1)}`;
        
        if (objectType === 'container' && point.items && point.items.length > 0) {
            tooltip += `<br>📦 Itens: ${point.items.length}`;
        }
        
        tooltip += `</div>`;
    }
    
    tooltip += `</div>`;
    return tooltip;
}

/**
 * Gerar tooltip consolidado para fence com histórico de alterações
 * @param {Array} trail - Array de pontos do trail
 * @returns {string} HTML do tooltip
 */
function generateFenceConsolidatedTooltip(trail) {
    let tooltip = `<strong>🏠 ${trail[0].data.fence_name || 'Fence'}</strong><br>`;
    tooltip += `<strong>📍 ${trail.length} atualizações no mesmo local</strong><br>`;
    tooltip += `<div style="max-height: 300px; overflow-y: auto;">`;
    
    // Timeline reversa (mais recente primeiro)
    for (let i = trail.length - 1; i >= 0; i--) {
        const point = trail[i].data;
        tooltip += `<div style="border-left: 3px solid #${i === trail.length - 1 ? '4caf50' : 'ffc107'}; padding-left: 8px; margin-bottom: 8px;">`;
        tooltip += `<strong>${point.timestamp || 'Sem data'}</strong><br>`;
        
        if (point.has_base !== null && point.has_base !== undefined) {
            tooltip += `🏗️ Base: <span class="value">${point.has_base ? 'Sim' : 'Não'}</span> `;
        }
        if (point.lower_panel_built !== null && point.lower_panel_built !== undefined) {
            tooltip += `🔨 Inf: <span class="value">${point.lower_panel_built ? 'Sim' : 'Não'}</span> `;
        }
        if (point.upper_panel_built !== null && point.upper_panel_built !== undefined) {
            tooltip += `🔨 Sup: <span class="value">${point.upper_panel_built ? 'Sim' : 'Não'}</span>`;
        }
        
        tooltip += `</div>`;
    }
    
    tooltip += `</div>`;
    return tooltip;
}

/**
 * Aplicar filtros de data no histórico
 */
function applyHistoryFilters() {
    const dateFrom = document.getElementById('historyDateFrom').value || null;
    const dateTo = document.getElementById('historyDateTo').value || null;
    
    // Fechar modal antes de recarregar para evitar overlay preso
    const modalElement = document.getElementById('trailHistoryModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    const isModalOpen = modal && modal._isShown;
    
    if (isModalOpen) {
        // Aguardar o modal fechar completamente antes de recarregar
        $(modalElement).one('hidden.bs.modal', function() {
            if (MapState.currentHistoryType === 'container') {
                if (typeof loadContainerHistory === 'function') {
                    loadContainerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
                }
            } else if (MapState.currentHistoryType === 'fence') {
                if (typeof loadFenceHistory === 'function') {
                    loadFenceHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
                }
            } else if (MapState.currentHistoryType === 'flag') {
                if (typeof loadFlagHistory === 'function') {
                    loadFlagHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
                }
            }
        });
        modal.hide();
    } else {
        // Se o modal não estava aberto, executar diretamente
        if (MapState.currentHistoryType === 'container') {
            if (typeof loadContainerHistory === 'function') {
                loadContainerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            }
        } else if (MapState.currentHistoryType === 'fence') {
            if (typeof loadFenceHistory === 'function') {
                loadFenceHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            }
        } else if (MapState.currentHistoryType === 'watchtower') {
            if (typeof loadWatchtowerHistory === 'function') {
                loadWatchtowerHistory(MapState.currentHistoryId, 0, dateFrom, dateTo);
            }
        }
    }
}

/**
 * Carregar página do histórico
 * @param {number} offset - Offset da paginação
 */
function loadHistoryPage(offset) {
    if (MapState.currentHistoryType === 'container') {
        if (typeof loadContainerHistory === 'function') {
            loadContainerHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
        }
    } else if (MapState.currentHistoryType === 'fence') {
        if (typeof loadFenceHistory === 'function') {
            loadFenceHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
        }
    } else if (MapState.currentHistoryType === 'watchtower') {
        if (typeof loadWatchtowerHistory === 'function') {
            loadWatchtowerHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
        }
    } else if (MapState.currentHistoryType === 'flag') {
        if (typeof loadFlagHistory === 'function') {
            loadFlagHistory(MapState.currentHistoryId, offset, MapState.currentHistoryPagination.date_from, MapState.currentHistoryPagination.date_to);
        }
    }
}

