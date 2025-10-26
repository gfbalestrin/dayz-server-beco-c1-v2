let playersData = [];

function loadPlayers() {
    $.ajax({
        url: '/api/players/online',
        method: 'GET',
        success: function(response) {
            playersData = response.players;
            renderPlayersTable();
        },
        error: function(xhr) {
            showToast('Erro', 'Erro ao carregar jogadores', 'error');
        }
    });
}

function renderPlayersTable() {
    const tbody = $('#playersTableBody');
    tbody.empty();
    
    if (playersData.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">Nenhum jogador online</td></tr>');
        return;
    }
    
    playersData.forEach(player => {
        const coords = player.CoordX ? 
            `X: ${player.CoordX.toFixed(1)}, Y: ${player.CoordY.toFixed(1)}` : 
            'N/A';
        
        const row = `
            <tr>
                <td>${player.PlayerName || 'N/A'}</td>
                <td>${player.SteamName || 'N/A'}</td>
                <td>${coords}</td>
                <td>${player.LastUpdate || 'N/A'}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-success" onclick="executeAction('${player.PlayerID}', 'heal')" title="Curar">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="btn btn-warning" onclick="toggleGodMode('${player.PlayerID}')" title="God Mode">
                            <i class="fas fa-shield-alt"></i>
                        </button>
                        <button class="btn btn-danger" onclick="executeAction('${player.PlayerID}', 'kill')" title="Matar">
                            <i class="fas fa-skull"></i>
                        </button>
                        <button class="btn btn-secondary" onclick="executeAction('${player.PlayerID}', 'kick')" title="Kickar">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                        <button class="btn btn-info" onclick="executeAction('${player.PlayerID}', 'desbug')" title="Desbug">
                            <i class="fas fa-wrench"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function executeAction(playerId, action) {
    const confirmMsg = {
        'heal': 'Curar este jogador?',
        'kill': 'MATAR este jogador?',
        'kick': 'EXPULSAR este jogador?',
        'desbug': 'Corrigir posição deste jogador?'
    }[action] || 'Executar esta ação?';
    
    if (!confirm(confirmMsg)) return;
    
    $.ajax({
        url: `/api/players/${playerId}/action`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ action: action }),
        success: function(response) {
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao executar ação', 'error');
        }
    });
}

let godModeStatus = {};

function toggleGodMode(playerId) {
    const isActive = godModeStatus[playerId] || false;
    const action = isActive ? 'ungodmode' : 'godmode';
    
    $.ajax({
        url: `/api/players/${playerId}/action`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ action: action }),
        success: function(response) {
            godModeStatus[playerId] = !isActive;
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao executar ação', 'error');
        }
    });
}

$(document).ready(function() {
    loadPlayers();
    setInterval(loadPlayers, 10000); // Auto-refresh a cada 10s
});

