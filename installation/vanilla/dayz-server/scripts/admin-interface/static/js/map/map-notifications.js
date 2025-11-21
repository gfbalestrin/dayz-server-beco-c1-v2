/**
 * Módulo de Notificações do Mapa
 * Sistema de notificações e log em tempo real
 */

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
    const isEmpty = logContent.find('.text-muted').length > 0;
    
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
            <span class="badge ${badgeClass} me-2 mt-1" style="min-width: 60px; text-align: center;">
                <i class="fas ${iconClass} me-1"></i>${type.toUpperCase()}
            </span>
            <div class="flex-grow-1">
                <div class="small text-muted mb-1">${timeStr}</div>
                <div class="small">${message}</div>
            </div>
        </div>
    `);
    
    logContent.prepend(logEntry);
    
    if (logContent.children().length > 50) {
        logContent.children().last().remove();
    }
}

/**
 * Limpar log de notificações
 */
function clearNotificationLog() {
    const logContent = $('#notificationLogContent');
    logContent.html('<div class="text-muted text-center small">Nenhuma notificação ainda</div>');
}

/**
 * Toggle visibilidade do log de notificações
 */
function toggleNotificationLog() {
    const logCard = $('#notificationLogCard');
    
    if (MapState.notificationsEnabled) {
        logCard.show();
    } else {
        logCard.hide();
        clearNotificationLog();
    }
}

