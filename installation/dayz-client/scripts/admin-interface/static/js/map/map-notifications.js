/**
 * Módulo de Notificações do Mapa
 * Sistema de notificações e log em tempo real
 */

/**
 * Configuração padrão de notificações
 */
const DEFAULT_NOTIFICATION_SETTINGS = {
    kills: true,
    damages: true,
    vehicles: {
        new: true,
        destroyed: true,
        position: false,
        items: false,
        attachments: false,
        health: false
    },
    containers: {
        new: true,
        destroyed: true,
        position: false,
        items: false
    },
    fences: {
        new: true,
        destroyed: true,
        position: false
    },
    playerEvents: {
        loadout_changed: true,
        player_respawned: true,
        player_death: true,
        player_unconscious: true,
        chat_command: false,
        chat_message: false,
        admin_message: true
    },
    monitoring_period: 'new_only'
};

/**
 * Variáveis globais para polling de eventos
 */
let lastEventTimestamp = null;
let playerEventsInterval = null;

/**
 * Controle de auto-scroll do log de notificações
 * - true: scroll automático para novas notificações
 * - false: usuário está navegando manualmente
 */
let notificationAutoScroll = true;
let notificationScrollListenerInitialized = false;

/**
 * Inicializar listener de scroll para o log de notificações
 */
function initNotificationScrollListener() {
    if (notificationScrollListenerInitialized) return;

    const logContent = document.getElementById('notificationLogContent');
    if (!logContent) return;

    logContent.addEventListener('scroll', function() {
        // Se o usuário está no final (ou muito próximo), reativar auto-scroll
        // Se o usuário subiu, desativar auto-scroll
        const isAtBottom = logContent.scrollHeight - logContent.scrollTop - logContent.clientHeight <= 5;
        notificationAutoScroll = isAtBottom;
    });

    notificationScrollListenerInitialized = true;
}

/**
 * Calcular timestamp inicial para monitoramento baseado na configuração de período
 * @returns {string|null} Timestamp ISO ou null
 */
function getMonitoringStartTimestamp() {
    const settings = loadNotificationSettings();
    const period = settings.monitoring_period || 'new_only';
    
    if (period === 'new_only' || period === 'all') {
        return null;  // Sem filtro ou usar lógica incremental
    }
    
    const now = new Date();
    const hours = {
        '1h': 1,
        '6h': 6,
        '24h': 24
    };
    
    now.setHours(now.getHours() - hours[period]);
    return now.toISOString();
}

/**
 * Toggle notificações
 */
function toggleNotifications() {
    MapState.notificationsEnabled = $('#notificationsCheck').is(':checked');
    console.log('Notificações:', MapState.notificationsEnabled ? 'ativadas' : 'desativadas');
    toggleNotificationLog();
}

/**
 * Adicionar notificação ao log
 * @param {string} type - Tipo da notificação ('info', 'warning', 'danger', 'error', 'success')
 * @param {string} message - Mensagem da notificação
 * @param {Date} timestamp - Timestamp da notificação (opcional)
 */
function addNotificationToLog(type, message, timestamp) {
    if (!MapState.notificationsEnabled) {
        return;
    }
    
    const logContent = $('#notificationLogContent');
    const logContentElement = logContent[0];
    
    // Verificar se está no estado inicial (apenas mensagem "Nenhuma notificação ainda")
    // Verifica se existe exatamente um filho que seja um div com classe text-muted e texto centralizado
    const children = logContent.children();
    const isEmpty = children.length === 1 && 
                    children.first().hasClass('text-muted') && 
                    children.first().hasClass('text-center') &&
                    children.first().text().includes('Nenhuma notificação ainda');
    
    if (isEmpty) {
        logContent.empty();
    }
    
    const now = timestamp || new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + 
                    String(now.getMinutes()).padStart(2, '0') + ':' + 
                    String(now.getSeconds()).padStart(2, '0');
    
    let iconClass = 'fa-info-circle';
    let badgeClass = 'bg-info';
    
    if (type === 'warning') {
        iconClass = 'fa-exclamation-triangle';
        badgeClass = 'bg-warning text-dark';
    } else if (type === 'danger' || type === 'error') {
        iconClass = 'fa-times-circle';
        badgeClass = 'bg-danger';
    } else if (type === 'success') {
        iconClass = 'fa-check-circle';
        badgeClass = 'bg-success';
    } else if (type === 'info') {
        iconClass = 'fa-info-circle';
        badgeClass = 'bg-info';
    }
    
    const logEntry = $(`
        <div class="d-flex align-items-start mb-2 pb-2 border-bottom">
            <div class="flex-grow-1">
                <div class="small text-muted mb-1">${timeStr}</div>
                <div class="small">${message}</div>
            </div>
        </div>
    `);
    
    logContent.append(logEntry);

    // Remover logs antigos se exceder o limite de 50 (remove os mais antigos do topo)
    while (logContent.children().length > 50) {
        logContent.children().first().remove();
    }

    // Scroll automático para o final apenas se auto-scroll estiver ativo
    if (logContentElement && notificationAutoScroll) {
        logContentElement.scrollTop = logContentElement.scrollHeight;
    }
}

/**
 * Limpar log de notificações
 */
function clearNotificationLog() {
    const logContent = $('#notificationLogContent');
    logContent.html('<div class="text-muted text-center small">Nenhuma notificação ainda</div>');
    // Resetar auto-scroll ao limpar
    notificationAutoScroll = true;
}

/**
 * Toggle visibilidade do log de notificações
 */
function toggleNotificationLog() {
    const logCard = $('#notificationLogCard');

    if (MapState.notificationsEnabled) {
        logCard.show();
        // Inicializar listener de scroll (idempotente)
        initNotificationScrollListener();
        // Resetar auto-scroll ao mostrar
        notificationAutoScroll = true;
    } else {
        logCard.hide();
        // Não limpa os logs ao desativar - apenas esconde o card para manter o histórico
    }
}

/**
 * Carregar configurações de notificações do LocalStorage
 */
function loadNotificationSettings() {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Erro ao carregar configurações de notificações:', e);
            return DEFAULT_NOTIFICATION_SETTINGS;
        }
    }
    return DEFAULT_NOTIFICATION_SETTINGS;
}

/**
 * Salvar configurações de notificações no LocalStorage
 */
function saveNotificationSettings(settings) {
    try {
        localStorage.setItem('notificationSettings', JSON.stringify(settings));
        return true;
    } catch (e) {
        console.error('Erro ao salvar configurações de notificações:', e);
        return false;
    }
}

/**
 * Verificar se deve notificar baseado nas configurações
 * @param {string} category - Categoria principal (kills, damages, vehicles, etc)
 * @param {string} subcategory - Subcategoria opcional (new, destroyed, position, etc)
 */
function shouldNotify(category, subcategory = null) {
    const settings = loadNotificationSettings();
    
    if (subcategory) {
        return settings[category]?.[subcategory] === true;
    }
    return settings[category] === true;
}

/**
 * Abrir modal de configurações de notificações
 */
function openNotificationSettings() {
    const modal = new bootstrap.Modal(document.getElementById('notificationSettingsModal'));
    
    // Carregar configurações atuais
    const settings = loadNotificationSettings();
    
    // Preencher checkboxes com valores atuais
    $('#notifKills').prop('checked', settings.kills);
    $('#notifDamages').prop('checked', settings.damages);
    
    // Veículos
    $('#notifVehiclesNew').prop('checked', settings.vehicles.new);
    $('#notifVehiclesDestroyed').prop('checked', settings.vehicles.destroyed);
    $('#notifVehiclesPosition').prop('checked', settings.vehicles.position);
    $('#notifVehiclesItems').prop('checked', settings.vehicles.items);
    $('#notifVehiclesAttachments').prop('checked', settings.vehicles.attachments);
    $('#notifVehiclesHealth').prop('checked', settings.vehicles.health);
    
    // Containers
    $('#notifContainersNew').prop('checked', settings.containers.new);
    $('#notifContainersDestroyed').prop('checked', settings.containers.destroyed);
    $('#notifContainersPosition').prop('checked', settings.containers.position);
    $('#notifContainersItems').prop('checked', settings.containers.items);
    
    // Construções
    $('#notifFencesNew').prop('checked', settings.fences.new);
    $('#notifFencesDestroyed').prop('checked', settings.fences.destroyed);
    $('#notifFencesPosition').prop('checked', settings.fences.position);
    
    // Eventos de jogadores
    $('#notifLoadoutChanged').prop('checked', settings.playerEvents.loadout_changed);
    $('#notifPlayerRespawned').prop('checked', settings.playerEvents.player_respawned);
    $('#notifPlayerDeath').prop('checked', settings.playerEvents.player_death);
    $('#notifPlayerUnconscious').prop('checked', settings.playerEvents.player_unconscious);
    $('#notifChatCommand').prop('checked', settings.playerEvents.chat_command);
    $('#notifChatMessage').prop('checked', settings.playerEvents.chat_message);
    $('#notifAdminMessage').prop('checked', settings.playerEvents.admin_message);
    
    // Carregar período de monitoramento
    $('#monitoringPeriod').val(settings.monitoring_period || 'new_only');
    
    modal.show();
}

/**
 * Salvar configurações do modal
 */
function saveNotificationSettingsFromModal() {
    const settings = {
        kills: $('#notifKills').is(':checked'),
        damages: $('#notifDamages').is(':checked'),
        vehicles: {
            new: $('#notifVehiclesNew').is(':checked'),
            destroyed: $('#notifVehiclesDestroyed').is(':checked'),
            position: $('#notifVehiclesPosition').is(':checked'),
            items: $('#notifVehiclesItems').is(':checked'),
            attachments: $('#notifVehiclesAttachments').is(':checked'),
            health: $('#notifVehiclesHealth').is(':checked')
        },
        containers: {
            new: $('#notifContainersNew').is(':checked'),
            destroyed: $('#notifContainersDestroyed').is(':checked'),
            position: $('#notifContainersPosition').is(':checked'),
            items: $('#notifContainersItems').is(':checked')
        },
        fences: {
            new: $('#notifFencesNew').is(':checked'),
            destroyed: $('#notifFencesDestroyed').is(':checked'),
            position: $('#notifFencesPosition').is(':checked')
        },
        playerEvents: {
            loadout_changed: $('#notifLoadoutChanged').is(':checked'),
            player_respawned: $('#notifPlayerRespawned').is(':checked'),
            player_death: $('#notifPlayerDeath').is(':checked'),
            player_unconscious: $('#notifPlayerUnconscious').is(':checked'),
            chat_command: $('#notifChatCommand').is(':checked'),
            chat_message: $('#notifChatMessage').is(':checked'),
            admin_message: $('#notifAdminMessage').is(':checked')
        },
        monitoring_period: $('#monitoringPeriod').val()
    };
    
    if (saveNotificationSettings(settings)) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('notificationSettingsModal'));
        modal.hide();
    }
}

/**
 * Iniciar polling de eventos de jogadores
 */
function startPlayerEventsPolling() {
    if (playerEventsInterval) return;
    
    // Poll a cada 10 segundos
    playerEventsInterval = setInterval(fetchRecentPlayerEvents, 10000);
    fetchRecentPlayerEvents(); // Primeira busca imediata
}

/**
 * Parar polling de eventos de jogadores
 */
function stopPlayerEventsPolling() {
    if (playerEventsInterval) {
        clearInterval(playerEventsInterval);
        playerEventsInterval = null;
    }
}

/**
 * Buscar eventos recentes de jogadores
 */
function fetchRecentPlayerEvents() {
    if (!MapState.notificationsEnabled) return;
    
    const params = { limit: 20 };
    const settings = loadNotificationSettings();
    
    if (settings.monitoring_period === 'new_only' && lastEventTimestamp) {
        params.since = lastEventTimestamp;
    } else if (settings.monitoring_period !== 'all') {
        const startTime = getMonitoringStartTimestamp();
        if (startTime) params.since = startTime;
    }
    
    $.get('/api/events/recent', params)
        .done(function(data) {
            if (data.events && data.events.length > 0) {
                processPlayerEvents(data.events);
                // Atualizar timestamp do último evento processado
                lastEventTimestamp = data.events[0].timestamp;
            }
        })
        .fail(function(error) {
            console.error('Erro ao buscar eventos recentes:', error);
        });
}

/**
 * Processar eventos de jogadores e criar notificações
 */
function processPlayerEvents(events) {
    // Inverter ordem para processar os mais antigos primeiro (já que usamos append)
    const sortedEvents = [...events].reverse();
    sortedEvents.forEach(function(event) {
        const eventType = event.event_type;
        const playerName = event.player_name || 'Desconhecido';
        const relatedPlayerName = event.related_player_name;
        
        // Verificar se deve notificar baseado nas configurações
        if (!shouldNotify('playerEvents', eventType)) {
            return;
        }
        
        let message = '';
        let type = 'info';
        
        try {
            const details = event.details ? JSON.parse(event.details) : {};
            
            switch(eventType) {
                case 'loadout_changed':
                    const loadoutName = details.loadout_name || 'desconhecido';
                    message = `${playerName} mudou para o loadout: ${loadoutName}`;
                    type = 'info';
                    break;
                case 'player_respawned':
                    message = `${playerName} respawnou`;
                    type = 'success';
                    break;
                case 'player_death':
                    const cause = details.cause || 'desconhecida';
                    message = `${playerName} morreu (${cause})`;
                    type = 'danger';
                    break;
                case 'player_unconscious':
                    message = `${playerName} ficou inconsciente`;
                    type = 'warning';
                    break;
                case 'chat_command':
                    const command = details.command || '';
                    message = `${playerName} executou comando: ${command}`;
                    type = 'info';
                    break;
                case 'chat_message':
                    const msg = details.chat_message || '';
                    message = `${playerName}: ${msg}`;
                    type = 'info';
                    break;
                case 'admin_message':
                    const adminMsg = details.message || '';
                    message = `Admin para ${playerName}: ${adminMsg}`;
                    type = 'info';
                    break;
                default:
                    // Evento desconhecido, não notificar
                    return;
            }
        } catch (e) {
            console.error('Erro ao processar detalhes do evento:', e);
            return;
        }
        
        if (message) {
            // Parsear timestamp do evento
            const eventTimestamp = event.timestamp ? new Date(event.timestamp) : new Date();
            addNotificationToLog(type, message, eventTimestamp);
        }
    });
}

