let currentEventId = null;

function getRiskBadgeClass(riskLevel) {
    const classes = {
        'normal': 'risk-normal',
        'suspicious': 'risk-suspicious',
        'high_risk': 'risk-high_risk',
        'critical': 'risk-critical'
    };
    return classes[riskLevel] || 'risk-normal';
}

function getRiskLabel(riskLevel) {
    const labels = {
        'normal': 'Normal',
        'suspicious': 'Suspeito',
        'high_risk': 'Alto Risco',
        'critical': 'Crítico'
    };
    return labels[riskLevel] || riskLevel;
}

function getEventTypeLabel(eventType) {
    const labels = {
        'teleport': 'Teleportação',
        'speed_hack': 'Speed Hack',
        'aimbot': 'Aimbot',
        'loot_hack': 'Loot Hack'
    };
    return labels[eventType] || eventType;
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    return date.toLocaleString('pt-BR');
}

function loadScores() {
    const riskLevel = document.getElementById('riskLevelFilter').value;
    
    fetch(`/api/cheat-detection/scores?limit=100${riskLevel ? '&risk_level=' + riskLevel : ''}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderScoresTable(data.scores);
            } else {
                console.error('Erro ao carregar pontuações:', data.message);
            }
        })
        .catch(error => {
            console.error('Erro ao carregar pontuações:', error);
        });
}

function renderScoresTable(scores) {
    const tbody = document.getElementById('scoresTableBody');
    
    if (scores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum jogador suspeito encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = scores.map(score => {
        const riskClass = getRiskBadgeClass(score.RiskLevel);
        const riskLabel = getRiskLabel(score.RiskLevel);
        
        return `
            <tr>
                <td>${score.PlayerName || 'Desconhecido'}</td>
                <td><code>${score.SteamID || '-'}</code></td>
                <td><span class="score-display text-${score.TotalScore > 200 ? 'danger' : score.TotalScore > 100 ? 'warning' : 'info'}">${score.TotalScore.toFixed(2)}</span></td>
                <td><span class="badge ${riskClass} risk-badge">${riskLabel}</span></td>
                <td>${formatDateTime(score.LastUpdated)}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="showPlayerDetails('${score.PlayerID}')">
                        <i class="fas fa-info-circle me-1"></i>Detalhes
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function loadEvents() {
    const eventType = document.getElementById('eventTypeFilter').value;
    
    fetch(`/api/cheat-detection/events?limit=100${eventType ? '&event_type=' + eventType : ''}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderEventsTable(data.events);
            } else {
                console.error('Erro ao carregar eventos:', data.message);
            }
        })
        .catch(error => {
            console.error('Erro ao carregar eventos:', error);
        });
}

function renderEventsTable(events) {
    const tbody = document.getElementById('eventsTableBody');
    
    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum evento encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = events.map(event => {
        const eventLabel = getEventTypeLabel(event.EventType);
        const reviewedBadge = event.Reviewed 
            ? `<span class="badge bg-${event.ReviewResult === 'confirmed' ? 'success' : 'warning'}">${event.ReviewResult === 'confirmed' ? 'Confirmado' : 'Falso Positivo'}</span>`
            : '<span class="badge bg-secondary">Não Revisado</span>';
        
        return `
            <tr>
                <td>${formatDateTime(event.TimeStamp)}</td>
                <td>${event.PlayerName || 'Desconhecido'}</td>
                <td><span class="badge event-type-badge bg-info">${eventLabel}</span></td>
                <td>${event.Score.toFixed(2)}</td>
                <td>${reviewedBadge}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="showEventDetails(${event.Id})">
                        <i class="fas fa-eye me-1"></i>Ver
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function showPlayerDetails(playerId) {
    const modal = new bootstrap.Modal(document.getElementById('playerDetailsModal'));
    const content = document.getElementById('playerDetailsContent');
    
    content.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    modal.show();
    
    fetch(`/api/cheat-detection/player/${playerId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderPlayerDetails(data.player);
            } else {
                content.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
            }
        })
        .catch(error => {
            content.innerHTML = `<div class="alert alert-danger">Erro ao carregar detalhes: ${error}</div>`;
        });
}

function renderPlayerDetails(player) {
    const content = document.getElementById('playerDetailsContent');
    const riskClass = getRiskBadgeClass(player.RiskLevel);
    const riskLabel = getRiskLabel(player.RiskLevel);
    
    let eventsHtml = '';
    if (player.events && player.events.length > 0) {
        eventsHtml = `
            <h6 class="mt-4">Eventos Recentes (${player.events.length})</h6>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Data/Hora</th>
                            <th>Tipo</th>
                            <th>Pontuação</th>
                            <th>Revisado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${player.events.map(event => {
                            const eventLabel = getEventTypeLabel(event.EventType);
                            const reviewedBadge = event.Reviewed 
                                ? `<span class="badge bg-${event.ReviewResult === 'confirmed' ? 'success' : 'warning'}">${event.ReviewResult === 'confirmed' ? 'Confirmado' : 'Falso Positivo'}</span>`
                                : '<span class="badge bg-secondary">Não Revisado</span>';
                            
                            return `
                                <tr>
                                    <td>${formatDateTime(event.TimeStamp)}</td>
                                    <td><span class="badge bg-info">${eventLabel}</span></td>
                                    <td>${event.Score.toFixed(2)}</td>
                                    <td>${reviewedBadge}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    content.innerHTML = `
        <div>
            <h6>Informações do Jogador</h6>
            <p><strong>Nome:</strong> ${player.PlayerName || 'Desconhecido'}</p>
            <p><strong>Steam ID:</strong> <code>${player.SteamID || '-'}</code></p>
            <p><strong>Steam Name:</strong> ${player.SteamName || '-'}</p>
            
            <h6 class="mt-3">Pontuação</h6>
            <p><strong>Total:</strong> <span class="score-display text-${player.TotalScore > 200 ? 'danger' : player.TotalScore > 100 ? 'warning' : 'info'}">${player.TotalScore.toFixed(2)}</span></p>
            <p><strong>Nível de Risco:</strong> <span class="badge ${riskClass} risk-badge">${riskLabel}</span></p>
            <p><strong>Última Atualização:</strong> ${formatDateTime(player.LastUpdated)}</p>
            
            ${player.IsBanned ? `<p class="text-danger"><strong>Status:</strong> Banido em ${formatDateTime(player.BannedAt)}</p>` : ''}
            
            ${eventsHtml}
        </div>
    `;
}

function showEventDetails(eventId) {
    currentEventId = eventId;
    const modal = new bootstrap.Modal(document.getElementById('eventDetailsModal'));
    const content = document.getElementById('eventDetailsContent');
    
    content.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    modal.show();
    
    fetch(`/api/cheat-detection/events?limit=1000`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const event = data.events.find(e => e.Id === eventId);
                if (event) {
                    renderEventDetails(event);
                } else {
                    content.innerHTML = '<div class="alert alert-danger">Evento não encontrado</div>';
                }
            } else {
                content.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
            }
        })
        .catch(error => {
            content.innerHTML = `<div class="alert alert-danger">Erro ao carregar detalhes: ${error}</div>`;
        });
}

function renderEventDetails(event) {
    const content = document.getElementById('eventDetailsContent');
    const eventLabel = getEventTypeLabel(event.EventType);
    const details = event.details_parsed || {};
    
    let detailsHtml = '';
    if (details && Object.keys(details).length > 0) {
        detailsHtml = `
            <h6 class="mt-3">Detalhes do Evento</h6>
            <div class="event-details">
                <pre class="bg-light p-3 rounded">${JSON.stringify(details, null, 2)}</pre>
            </div>
        `;
    }
    
    content.innerHTML = `
        <div>
            <p><strong>Jogador:</strong> ${event.PlayerName || 'Desconhecido'}</p>
            <p><strong>Steam ID:</strong> <code>${event.SteamID || '-'}</code></p>
            <p><strong>Tipo:</strong> <span class="badge bg-info">${eventLabel}</span></p>
            <p><strong>Pontuação:</strong> ${event.Score.toFixed(2)}</p>
            <p><strong>Data/Hora:</strong> ${formatDateTime(event.TimeStamp)}</p>
            <p><strong>Revisado:</strong> ${event.Reviewed ? (event.ReviewResult === 'confirmed' ? '<span class="badge bg-success">Confirmado</span>' : '<span class="badge bg-warning">Falso Positivo</span>') : '<span class="badge bg-secondary">Não Revisado</span>'}</p>
            ${event.ReviewedBy ? `<p><strong>Revisado por:</strong> ${event.ReviewedBy}</p>` : ''}
            ${detailsHtml}
        </div>
    `;
}

function reviewEvent(reviewResult) {
    if (!currentEventId) return;
    
    fetch(`/api/cheat-detection/review-event/${currentEventId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ review_result: reviewResult })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                bootstrap.Modal.getInstance(document.getElementById('eventDetailsModal')).hide();
                loadEvents();
                loadScores();
            } else {
                alert('Erro ao revisar evento: ' + data.message);
            }
        })
        .catch(error => {
            alert('Erro ao revisar evento: ' + error);
        });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    loadScores();
    loadEvents();
    
    document.getElementById('riskLevelFilter').addEventListener('change', loadScores);
    document.getElementById('eventTypeFilter').addEventListener('change', loadEvents);
});

