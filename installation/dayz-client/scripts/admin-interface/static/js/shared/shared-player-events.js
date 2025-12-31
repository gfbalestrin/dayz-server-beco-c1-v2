/**
 * Shared Player Events History
 * Histórico de eventos de jogadores
 * Depende de: shared-common.js
 */

// Mapeamento de tipos de eventos
const EVENT_TYPE_NAMES = {
    'player_connected': 'Conexão',
    'player_disconnected': 'Desconexão',
    'player_death': 'Morte',
    'player_killed': 'Morto por Jogador',
    'player_respawn': 'Respawn',
    'damage_taken': 'Dano Recebido',
    'damage_dealt': 'Dano Causado',
    'fence_built': 'Fence Construída',
    'fence_destroyed': 'Fence Destruída',
    'watchtower_built': 'Torre Construída',
    'watchtower_destroyed': 'Torre Destruída',
    'flag_built': 'Bandeira Construída',
    'shelter_built': 'Abrigo Construído',
    'loadout_changed': 'Loadout Alterado',
    'admin_action': 'Ação Admin',
    'chat_command': 'Comando de Chat',
    'item_found': 'Item Encontrado',
    'item_picked_up': 'Item Coletado',
    'item_dropped': 'Item Solto',
    'item_used': 'Item Usado',
    'vehicle_entered': 'Entrou em Veículo',
    'vehicle_exited': 'Saiu de Veículo',
    'vehicle_damaged': 'Veículo Danificado',
    'infected_killed': 'Zumbi Morto',
    'teleport': 'Teleporte',
    'custom_event': 'Evento Customizado'
};

// Estado do histórico de eventos
const EventsHistoryState = {
    currentPlayerId: null,
    currentPage: 1,
    limit: 50,
    dateFrom: null,
    dateTo: null,
    eventType: null
};

/**
 * Formatar tipo de evento para exibição
 * @param {string} eventType - Tipo de evento
 * @returns {string} Nome formatado
 */
function formatEventType(eventType) {
    return EVENT_TYPE_NAMES[eventType] || eventType;
}

/**
 * Formatar detalhes JSON de forma legível
 * @param {string} detailsStr - String JSON dos detalhes
 * @param {string} eventType - Tipo de evento
 * @returns {string} Detalhes formatados
 */
function formatEventDetails(detailsStr, eventType) {
    if (!detailsStr) return 'N/A';

    try {
        const details = JSON.parse(detailsStr);
        const parts = [];

        // Para eventos de conexão e desconexão, remover timestamp (já existe coluna na tabela)
        const isConnectionEvent = eventType === 'player_connected' || eventType === 'player_disconnected';

        for (const [key, value] of Object.entries(details)) {
            if (value !== null && value !== undefined) {
                // Pular timestamp para eventos de conexão/desconexão
                if (isConnectionEvent && key === 'timestamp') {
                    continue;
                }

                // Formatar Country com bandeira (igual à tabela de jogadores online)
                if (key === 'Country' && value) {
                    const flag = getCountryFlag(value);
                    if (flag) {
                        parts.push(`Country: ${flag} ${escapeHtml(value)}`);
                    } else {
                        parts.push(`Country: ${escapeHtml(value)}`);
                    }
                }
                // Formatar IP como link (igual à tabela de jogadores online)
                else if (key === 'IP' && value) {
                    const ipUrl = `https://ip-api.com/#${escapeHtml(value)}`;
                    parts.push(`IP: <a href="${ipUrl}" target="_blank" class="text-decoration-none">${escapeHtml(value)}</a>`);
                } else {
                    parts.push(`${key}: ${value}`);
                }
            }
        }

        return parts.length > 0 ? parts.join(', ') : 'N/A';
    } catch (e) {
        return detailsStr;
    }
}

/**
 * Formatar coordenadas para exibição
 * @param {number} coordX - Coordenada X
 * @param {number} coordY - Coordenada Y
 * @param {number} coordZ - Coordenada Z
 * @returns {string} Coordenadas formatadas
 */
function formatEventCoords(coordX, coordY, coordZ) {
    if (coordX !== null && coordX !== undefined &&
        coordY !== null && coordY !== undefined) {
        let coords = `X: ${parseFloat(coordX).toFixed(1)}, Y: ${parseFloat(coordY).toFixed(1)}`;
        if (coordZ !== null && coordZ !== undefined) {
            coords += `, Z: ${parseFloat(coordZ).toFixed(1)}`;
        }
        return coords;
    }
    return 'N/A';
}

/**
 * Mostrar modal de histórico de eventos do jogador
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function showPlayerEventsHistory(playerId, playerName) {
    if (!playerId || !playerName) {
        showToast('Erro', 'Dados do jogador não disponíveis', 'error');
        return;
    }

    // Fechar modal de ações do jogador
    const playerModal = bootstrap.Modal.getInstance(document.getElementById('playerControlPanelModal'));
    if (playerModal) {
        playerModal.hide();
    }

    // Configurar estado
    EventsHistoryState.currentPlayerId = playerId;
    EventsHistoryState.currentPage = 1;
    EventsHistoryState.dateFrom = null;
    EventsHistoryState.dateTo = null;
    EventsHistoryState.eventType = null;

    // Atualizar nome no modal
    $('#eventsHistoryPlayerName').text(playerName);

    // Limpar filtros
    $('#eventsHistoryStartDate').val('');
    $('#eventsHistoryStartTime').val('');
    $('#eventsHistoryEndDate').val('');
    $('#eventsHistoryEndTime').val('');
    $('#eventsHistoryEventType').val('');

    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('playerEventsHistoryModal'));
    modal.show();

    // Handler do botão "Voltar ao Painel"
    $('#eventsHistoryModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
    });

    // Carregar eventos
    loadPlayerEvents();
}

/**
 * Carregar eventos do jogador
 */
function loadPlayerEvents() {
    const playerId = EventsHistoryState.currentPlayerId;
    if (!playerId) {
        return;
    }

    // Mostrar indicador de carregamento
    $('#eventsHistoryLoading').show();
    $('#eventsHistoryTableContainer').hide();
    $('#eventsHistoryPagination').hide();

    // Construir parâmetros da API
    const params = {
        limit: EventsHistoryState.limit,
        offset: (EventsHistoryState.currentPage - 1) * EventsHistoryState.limit
    };

    // Adicionar filtros de data
    if (EventsHistoryState.dateFrom) {
        params.date_from = EventsHistoryState.dateFrom;
    }
    if (EventsHistoryState.dateTo) {
        params.date_to = EventsHistoryState.dateTo;
    }
    if (EventsHistoryState.eventType) {
        params.event_type = EventsHistoryState.eventType;
    }

    // Fazer requisição
    $.get(`/api/players/${playerId}/events`, params)
        .done(function(data) {
            $('#eventsHistoryLoading').hide();
            $('#eventsHistoryTableContainer').show();

            if (data.events && data.events.length > 0) {
                renderPlayerEvents(data.events, data.pagination);
            } else {
                $('#eventsHistoryTableBody').html(`
                    <tr>
                        <td colspan="5" class="text-center text-muted">Nenhum evento encontrado</td>
                    </tr>
                `);
                $('#eventsHistoryPagination').hide();
            }
        })
        .fail(function() {
            $('#eventsHistoryLoading').hide();
            $('#eventsHistoryTableContainer').show();
            $('#eventsHistoryTableBody').html(`
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Erro ao carregar eventos
                    </td>
                </tr>
            `);
            $('#eventsHistoryPagination').hide();
        });
}

/**
 * Renderizar eventos na tabela
 * @param {Array} events - Array de eventos
 * @param {Object} pagination - Dados de paginação
 */
function renderPlayerEvents(events, pagination) {
    const tbody = $('#eventsHistoryTableBody');
    tbody.empty();

    events.forEach(function(event) {
        const timestamp = new Date(event.timestamp || event.TimeStamp);
        const formattedDate = timestamp.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const eventTypeName = event.event_type || event.EventType;
        const eventType = formatEventType(eventTypeName);
        const coords = formatEventCoords(event.coord_x || event.CoordX, event.coord_y || event.CoordY, event.coord_z || event.CoordZ);
        const details = formatEventDetails(event.details || event.Details, eventTypeName);
        const relatedPlayer = (event.related_player_name || event.RelatedPlayerName) || ((event.related_player_id || event.RelatedPlayerID) ? 'ID: ' + (event.related_player_id || event.RelatedPlayerID).substring(0, 8) + '...' : 'N/A');

        const row = `
            <tr>
                <td>${escapeHtml(formattedDate)}</td>
                <td><span class="badge bg-info">${escapeHtml(eventType)}</span></td>
                <td><small>${escapeHtml(coords)}</small></td>
                <td><small>${details}</small></td>
                <td><small>${escapeHtml(relatedPlayer)}</small></td>
            </tr>
        `;
        tbody.append(row);
    });

    // Atualizar paginação
    if (pagination && pagination.total > 0) {
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        $('#eventsHistoryCurrentPage').text(EventsHistoryState.currentPage);
        $('#eventsHistoryTotalPages').text(totalPages);
        $('#eventsHistoryTotalCount').text(pagination.total);

        $('#eventsHistoryPrevPage').prop('disabled', EventsHistoryState.currentPage <= 1);
        $('#eventsHistoryNextPage').prop('disabled', EventsHistoryState.currentPage >= totalPages || !pagination.has_more);

        $('#eventsHistoryPagination').show();
    } else {
        $('#eventsHistoryPagination').hide();
    }
}

/**
 * Aplicar filtros de histórico
 */
function applyEventsHistoryFilters() {
    const startDate = $('#eventsHistoryStartDate').val();
    const startTime = $('#eventsHistoryStartTime').val();
    const endDate = $('#eventsHistoryEndDate').val();
    const endTime = $('#eventsHistoryEndTime').val();
    const eventType = $('#eventsHistoryEventType').val();

    // Construir data início
    if (startDate) {
        const startDateTime = startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`;
        EventsHistoryState.dateFrom = new Date(startDateTime).toISOString();
    } else {
        EventsHistoryState.dateFrom = null;
    }

    // Construir data fim
    if (endDate) {
        const endDateTime = endTime ? `${endDate}T${endTime}:59` : `${endDate}T23:59:59`;
        EventsHistoryState.dateTo = new Date(endDateTime).toISOString();
    } else {
        EventsHistoryState.dateTo = null;
    }

    EventsHistoryState.eventType = eventType || null;
    EventsHistoryState.currentPage = 1;

    loadPlayerEvents();
}

/**
 * Limpar filtros de histórico
 */
function clearEventsHistoryFilters() {
    $('#eventsHistoryStartDate').val('');
    $('#eventsHistoryStartTime').val('');
    $('#eventsHistoryEndDate').val('');
    $('#eventsHistoryEndTime').val('');
    $('#eventsHistoryEventType').val('');

    EventsHistoryState.dateFrom = null;
    EventsHistoryState.dateTo = null;
    EventsHistoryState.eventType = null;
    EventsHistoryState.currentPage = 1;

    loadPlayerEvents();
}

/**
 * Limpar histórico de eventos do jogador
 */
function clearPlayerEvents() {
    const playerId = EventsHistoryState.currentPlayerId;
    const playerName = $('#eventsHistoryPlayerName').text();

    if (!playerId) {
        alert('Erro: ID do jogador não encontrado');
        return;
    }

    if (!confirm(`Tem certeza que deseja limpar TODOS os eventos do jogador "${playerName}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }

    // Desabilitar botão durante a operação
    const btn = $('#clearPlayerEventsBtn');
    const originalHtml = btn.html();
    btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Limpando...');

    $.ajax({
        url: `/api/players/${playerId}/events/clear`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                alert('Histórico de eventos limpo com sucesso!');
                // Recarregar eventos (que agora estarão vazios)
                EventsHistoryState.currentPage = 1;
                loadPlayerEvents();
            } else {
                alert('Erro: ' + (response.message || 'Não foi possível limpar os eventos'));
            }
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.message || 'Erro ao limpar eventos';
            alert('Erro: ' + errorMsg);
        },
        complete: function() {
            btn.prop('disabled', false).html(originalHtml);
        }
    });
}

/**
 * Inicializar event listeners do histórico de eventos
 * Deve ser chamado no document.ready da página
 */
function initPlayerEventsListeners() {
    // Filtros
    $('#applyEventsHistoryFilter').off('click').on('click', applyEventsHistoryFilters);
    $('#clearEventsHistoryFilter').off('click').on('click', clearEventsHistoryFilters);
    $('#clearPlayerEventsBtn').off('click').on('click', clearPlayerEvents);

    // Paginação
    $('#eventsHistoryPrevPage').off('click').on('click', function() {
        if (EventsHistoryState.currentPage > 1) {
            EventsHistoryState.currentPage--;
            loadPlayerEvents();
        }
    });

    $('#eventsHistoryNextPage').off('click').on('click', function() {
        EventsHistoryState.currentPage++;
        loadPlayerEvents();
    });
}
