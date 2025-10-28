let playersData = [];
let table;
let godModeStatus = {};
let staminaStatus = {};
let autoRefreshInterval = null;
let currentRefreshInterval = 30000; // 30 segundos padrão
let nextRefreshTime = 0;
let searchTimeout = null;

// Função para escapar HTML e prevenir XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? text.toString().replace(/[&<>"']/g, m => map[m]) : '';
}

// Função para formatar tempo decorrido
function formatElapsedTime(startDate) {
    if (!startDate) return '-';
    
    const start = new Date(startDate);
    const now = new Date();
    const diff = now - start;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}min`;
}

// Função para formatar data
function formatDate(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Função para copiar Player ID
function copyPlayerId(playerId) {
    document.getElementById('playerIdToCopy').textContent = playerId;
    $('#copyPlayerIdModal').modal('show');
    
    $('#copyPlayerIdBtn').off('click').on('click', function() {
        navigator.clipboard.writeText(playerId).then(function() {
            const btn = $('#copyPlayerIdBtn');
            const originalHtml = btn.html();
            btn.html('<i class="fas fa-check me-2"></i>Copiado!');
            btn.removeClass('btn-primary').addClass('btn-success');
            
            setTimeout(function() {
                btn.html(originalHtml);
                btn.removeClass('btn-success').addClass('btn-primary');
            }, 2000);
        });
    });
}

// Função para executar ação administrativa
function executeAction(playerId, action) {
    const confirmMsg = {
        'heal': 'Curar este jogador?',
        'kill': 'MATAR este jogador?',
        'kick': 'EXPULSAR este jogador?',
        'desbug': 'Corrigir posição deste jogador?'
    }[action] || 'Executar esta ação?';
    
    if (!confirm(confirmMsg)) return;
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/action`,
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

// Função para toggle God Mode
function toggleGodMode(playerId) {
    const isActive = godModeStatus[playerId] || false;
    const action = isActive ? 'ungodmode' : 'godmode';
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/action`,
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

// Função para toggle Stamina Infinita
function toggleStamina(playerId) {
    const isActive = staminaStatus[playerId] || false;
    const action = isActive ? 'stamina off' : 'stamina on';
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/action`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ action: action }),
        success: function(response) {
            staminaStatus[playerId] = !isActive;
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao executar ação', 'error');
        }
    });
}

// Função para criar link de mapa
function createMapLink(coordX, coordY) {
    if (!coordX || !coordY) return '<span class="text-muted">-</span>';
    const url = `https://dayz.xam.nu/#location=${coordX};${coordY};5`;
    return `<a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fas fa-map-marked-alt me-1"></i>Ver Mapa</a>`;
}

// Função para criar link Steam
function createSteamLink(steamId, steamName) {
    if (!steamId || !steamName) return '<span class="text-muted">-</span>';
    const url = `https://steamcommunity.com/profiles/${steamId}`;
    return `<a href="${url}" target="_blank">${escapeHtml(steamName)}</a>`;
}

// Função para redirecionar para spawning
function redirectToSpawning(playerId) {
    window.location.href = `/spawning?player_id=${playerId}`;
}

// Função para renderizar ações
function renderActions(player) {
    if (!player.IsOnline || player.IsOnline === 0) {
        return '<span class="text-muted">-</span>';
    }
    
    return `
        <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-primary" onclick="redirectToSpawning('${player.PlayerID}')" title="Spawnar Itens">
                <i class="fas fa-magic"></i>
            </button>
            <button class="btn btn-success" onclick="executeAction('${player.PlayerID}', 'heal')" title="Curar">
                <i class="fas fa-heart"></i>
            </button>
            <button class="btn btn-warning" onclick="toggleGodMode('${player.PlayerID}')" title="God Mode">
                <i class="fas fa-shield-alt"></i>
            </button>
            <button class="btn btn-info" onclick="toggleStamina('${player.PlayerID}')" title="Stamina Infinita">
                <i class="fas fa-bolt"></i>
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
    `;
}

// Função para renderizar status
function renderStatus(player) {
    const isOnline = player.IsOnline && player.IsOnline !== 0;
    const icon = isOnline ? 'fa-circle text-success' : 'fa-circle text-secondary';
    return `<i class="fas ${icon}" title="${isOnline ? 'Online' : 'Offline'}"></i>`;
}

// Função para renderizar data/tempo
function renderDateTime(player) {
    if (player.IsOnline && player.IsOnline !== 0) {
        // Jogador online - mostrar data de conexão e tempo decorrido
        const elapsed = formatElapsedTime(player.DataConnect);
        return `
            <div>
                <small class="text-muted">${formatDate(player.DataConnect)}</small><br>
                <span class="badge bg-success">${elapsed}</span>
            </div>
        `;
    } else {
        // Jogador offline - mostrar última coordenada
        if (player.LastCoordDate) {
            return `<small class="text-muted">${formatDate(player.LastCoordDate)}</small>`;
        }
        return '<span class="text-muted">-</span>';
    }
}

// Função para renderizar Player ID
function renderPlayerId(playerId) {
    return `
        <button class="btn btn-sm btn-outline-secondary" onclick="copyPlayerId('${playerId}')" title="Copiar Player ID">
            <i class="fas fa-copy me-1"></i>ID
        </button>
    `;
}

// Função para carregar jogadores
function loadPlayers() {
    $.ajax({
        url: '/api/players/all-with-status',
        method: 'GET',
        success: function(response) {
            playersData = response.players;
            const onlineCount = playersData.filter(p => p.IsOnline && p.IsOnline !== 0).length;
            const offlineCount = playersData.length - onlineCount;
            console.log(`[loadPlayers] Dados carregados: ${playersData.length} total, ${onlineCount} online, ${offlineCount} offline`);
            renderPlayersTable();
        },
        error: function(xhr) {
            showToast('Erro', 'Erro ao carregar jogadores', 'error');
        }
    });
}

// Função auxiliar para toast
function showToast(title, message, type) {
    // Implementação básica - ajustar conforme necessário
    if (typeof toastr !== 'undefined') {
        toastr[type](message, title);
    } else {
        alert(message);
    }
}

// Função para criar link de visualização no mapa
function createMapViewLink(playerId) {
    return `
        <a href="/map?player_id=${playerId}" class="btn btn-sm btn-outline-info" title="Ver no mapa">
            <i class="fas fa-map-marked-alt"></i>
        </a>
    `;
}

// Função para atualizar intervalo de refresh
function updateRefreshInterval() {
    // Limpar intervalo atual
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    const isEnabled = $('#autoRefreshToggle').is(':checked');
    
    if (isEnabled) {
        currentRefreshInterval = parseInt($('#refreshIntervalSelect').val());
        
        // Definir tempo da próxima atualização
        nextRefreshTime = Date.now() + currentRefreshInterval;
        
        // Iniciar contador regressivo
        startRefreshCountdown();
        
        // Criar novo intervalo
        autoRefreshInterval = setInterval(function() {
            loadPlayers();
            nextRefreshTime = Date.now() + currentRefreshInterval;
        }, currentRefreshInterval);
        
        console.log(`Auto-refresh ativado: ${currentRefreshInterval}ms`);
    } else {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        $('#nextRefreshTime').text('Auto-refresh desativado');
        console.log('Auto-refresh desativado');
    }
}

// Função para contador regressivo
function startRefreshCountdown() {
    const countdownInterval = setInterval(function() {
        if (!autoRefreshInterval) {
            clearInterval(countdownInterval);
            return;
        }
        
        const now = Date.now();
        const remaining = Math.max(0, nextRefreshTime - now);
        const seconds = Math.floor(remaining / 1000);
        
        if (seconds > 0) {
            $('#nextRefreshTime').text(`Próxima atualização: ${seconds}s`);
        } else {
            $('#nextRefreshTime').text('Atualizando...');
        }
    }, 1000);
}

// Função para filtrar dados
function filterPlayersData(data, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        return data;
    }
    
    const term = searchTerm.toLowerCase().trim();
    
    return data.filter(player => {
        const playerName = (player.PlayerName || '').toLowerCase();
        const steamName = (player.SteamName || '').toLowerCase();
        const playerId = (player.PlayerID || '').toLowerCase();
        
        return playerName.includes(term) || 
               steamName.includes(term) || 
               playerId.includes(term);
    });
}

// Função para renderizar tabela com filtro
function renderPlayersTable() {
    const searchTerm = $('#searchInput').val();
    let filteredData = filterPlayersData(playersData, searchTerm);
    
    console.log(`[renderPlayersTable] Renderizando tabela com ${filteredData.length} jogadores filtrados`);
    
    // Atualizar contadores
    const onlineCount = filteredData.filter(p => p.IsOnline && p.IsOnline !== 0).length;
    const totalCount = filteredData.length;
    
    $('#onlineCount').text(onlineCount);
    $('#totalCount').text(totalCount);
    
    // Destruir DataTable PRIMEIRO (se existir)
    if ($.fn.DataTable.isDataTable('#playersTable')) {
        console.log('[renderPlayersTable] Destruindo DataTable existente...');
        table.clear();
        table.destroy();
        table = null;
    }
    
    // Limpar e preencher tbody
    const tbody = $('#playersTableBody');
    tbody.empty();
    
    if (filteredData.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">Nenhum jogador encontrado</td></tr>');
    } else {
        // Renderizar cada jogador
        filteredData.forEach(player => {
            const row = `
                <tr class="${player.IsOnline && player.IsOnline !== 0 ? 'table-info' : ''}">
                    <td>${renderStatus(player)}</td>
                    <td>${renderPlayerId(player.PlayerID)}</td>
                    <td>${escapeHtml(player.PlayerName || '-')}</td>
                    <td>${createSteamLink(player.SteamID, player.SteamName)}</td>
                    <td>${renderDateTime(player)}</td>
                    <td>${createMapViewLink(player.PlayerID)}</td>
                    <td>${renderActions(player)}</td>
                </tr>
            `;
            tbody.append(row);
        });
    }
    
    // Recriar DataTable imediatamente (sem setTimeout)
    console.log('[renderPlayersTable] Recriando DataTable...');
    table = $('#playersTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        order: [[0, 'desc']], // Ordenar por status (online primeiro)
        pageLength: 25,
        responsive: true,
        columnDefs: [
            { orderable: false, targets: [1, 5, 6] } // Player ID, Mapa e Ações não são ordenáveis
        ]
    });
    console.log('[renderPlayersTable] DataTable recriada com sucesso');
}

// Inicialização
$(document).ready(function() {
    // Carregar preferências do localStorage
    const savedInterval = localStorage.getItem('refreshInterval');
    if (savedInterval) {
        currentRefreshInterval = parseInt(savedInterval);
        $('#refreshIntervalSelect').val(savedInterval);
    }
    
    // Event listeners para controles
    $('#autoRefreshToggle').on('change', function() {
        updateRefreshInterval();
    });
    
    $('#refreshIntervalSelect').on('change', function() {
        const interval = $(this).val();
        currentRefreshInterval = parseInt(interval);
        localStorage.setItem('refreshInterval', interval);
        updateRefreshInterval();
    });
    
    // Search com debounce
    $('#searchInput').on('input', function() {
        const searchTerm = $(this).val();
        
        // Limpar timeout anterior
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Criar novo timeout
        searchTimeout = setTimeout(function() {
            renderPlayersTable();
        }, 300); // 300ms de debounce
    });
    
    // Carregar dados iniciais
    loadPlayers();
    
    // Iniciar auto-refresh
    updateRefreshInterval();
    
    // Tornar funções globais para uso nos botões inline
    window.copyPlayerId = copyPlayerId;
    window.executeAction = executeAction;
    window.toggleGodMode = toggleGodMode;
    window.toggleStamina = toggleStamina;
    window.redirectToSpawning = redirectToSpawning;
    
    // Limpar intervalos ao sair da página
    $(window).on('beforeunload', function() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
    });
});

