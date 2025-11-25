let playersData = [];
let table;
let autoRefreshInterval = null;
let currentRefreshInterval = 30000; // 30 segundos padrão
let nextRefreshTime = 0;
let searchTimeout = null;

// Variáveis para administradores
let adminsData = [];
let adminsTable = null;
let adminSearchTimeout = null;
let adminIds = new Set(); // Set para verificação rápida de admin IDs

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

// Função para executar ação administrativa (versão interna)
function executeActionInternal(playerId, action) {
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

// Função para executar ação administrativa com confirmação
function confirmExecuteAction(playerId, action, playerName) {
    // Se for kick, usar modal especial com mensagem personalizada
    if (action === 'kick') {
        showKickPlayerModal(playerId, playerName);
        return;
    }
    
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    const actionMessages = {
        'heal': 'Deseja curar este jogador?',
        'kill': 'ATENÇÃO: Deseja MATAR este jogador? Esta ação é irreversível!',
        'desbug': 'Deseja corrigir a posição deste jogador?'
    };
    
    const actionNames = {
        'heal': 'Curar',
        'kill': 'Matar',
        'desbug': 'Corrigir Posição'
    };
    
    showActionConfirmationModal(
        actionNames[action] || 'Executar Ação',
        actionMessages[action] || 'Deseja executar esta ação?',
        playerId,
        displayName,
        function() {
            executeActionInternal(playerId, action);
        }
    );
}

// Função para mostrar modal de kick com mensagem personalizada
function showKickPlayerModal(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    $('#kickModalPlayerName').text(displayName);
    $('#kickModalPlayerId').text(playerId);
    $('#kickMessage').val('Você foi kickado do servidor');
    
    // Remover handlers anteriores e adicionar novo
    $('#kickModalConfirmBtn').off('click').on('click', function() {
        const message = $('#kickMessage').val().trim();
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
        executeKickAction(playerId, message);
        $('#kickPlayerModal').modal('hide');
    });
    
    $('#kickPlayerModal').modal('show');
}

// Função para executar kick via RCON
function executeKickAction(playerId, message) {
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/kick`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            message: message
        }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
            } else {
                showToast('Erro', response.message || 'Erro ao kickar jogador', 'error');
            }
        },
        error: function(xhr) {
            const errorMessage = xhr.responseJSON?.message || 'Erro ao kickar jogador';
            showToast('Erro', errorMessage, 'error');
        }
    });
}

// Função para ativar God Mode (versão interna)
function activateGodModeInternal(playerId) {
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/action`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ action: 'godmode' }),
        success: function(response) {
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao executar ação', 'error');
        }
    });
}

// Função para ativar God Mode com confirmação
function confirmActivateGodMode(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    showActionConfirmationModal(
        'Ativar God Mode',
        'Deseja ativar God Mode para este jogador?',
        playerId,
        displayName,
        function() {
            activateGodModeInternal(playerId);
        }
    );
}

// Função para remover God Mode (versão interna)
function deactivateGodModeInternal(playerId) {
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/action`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ action: 'ungodmode' }),
        success: function(response) {
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao executar ação', 'error');
        }
    });
}

// Função para remover God Mode com confirmação
function confirmDeactivateGodMode(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    showActionConfirmationModal(
        'Remover God Mode',
        'Deseja remover God Mode deste jogador?',
        playerId,
        displayName,
        function() {
            deactivateGodModeInternal(playerId);
        }
    );
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

// Função para mostrar modal de confirmação de ação
function showActionConfirmationModal(actionName, message, playerId, playerName, onConfirm) {
    // Buscar dados completos do jogador para obter Steam Name
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayPlayerName = player ? (player.PlayerName || 'Jogador desconhecido') : (playerName || 'Jogador desconhecido');
    const steamName = player ? (player.SteamName || null) : null;
    
    // Formatar nome com Steam Name entre parênteses
    let displayName = escapeHtml(displayPlayerName);
    if (steamName) {
        displayName += ` (${escapeHtml(steamName)})`;
    }
    
    $('#actionModalTitle').text(`Confirmar ${actionName}`);
    $('#actionModalMessage').text(message);
    $('#actionModalPlayerName').html(displayName);
    $('#actionModalPlayerId').text(playerId);
    
    // Remover handlers anteriores e adicionar novo
    $('#actionModalConfirmBtn').off('click').on('click', function() {
        $('#actionConfirmationModal').modal('hide');
        if (onConfirm) {
            onConfirm();
        }
    });
    
    $('#actionConfirmationModal').modal('show');
}

// Função para mostrar modal de enviar mensagem privada
function showSendMessageModal(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayPlayerName = player ? (player.PlayerName || 'Jogador desconhecido') : (playerName || 'Jogador desconhecido');
    const steamName = player ? (player.SteamName || null) : null;
    
    // Formatar nome com Steam Name entre parênteses
    let displayName = escapeHtml(displayPlayerName);
    if (steamName) {
        displayName += ` (${escapeHtml(steamName)})`;
    }
    
    $('#sendMessagePlayerName').html(displayName);
    $('#sendMessagePlayerId').text(playerId);
    $('#sendMessageText').val('');
    
    // Remover handlers anteriores e adicionar novo
    $('#sendMessageConfirmBtn').off('click').on('click', function() {
        const message = $('#sendMessageText').val().trim();
        
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
        sendPrivateMessage(playerId, message);
    });
    
    // Limpar textarea ao fechar modal
    $('#sendMessageModal').on('hidden.bs.modal', function() {
        $('#sendMessageText').val('');
    });
    
    $('#sendMessageModal').modal('show');
}

// Função para enviar mensagem privada
function sendPrivateMessage(playerId, message) {
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/send-message`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: message }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                $('#sendMessageModal').modal('hide');
            } else {
                showToast('Erro', response.message || 'Erro ao enviar mensagem', 'error');
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao enviar mensagem', 'error');
        }
    });
}

// Função para mostrar modal de enviar mensagem global
function showSendGlobalMessageModal() {
    $('#sendGlobalMessageText').val('');
    
    // Remover handlers anteriores e adicionar novo
    $('#sendGlobalMessageConfirmBtn').off('click').on('click', function() {
        const message = $('#sendGlobalMessageText').val().trim();
        
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
        sendGlobalMessage(message);
    });
    
    // Limpar textarea ao fechar modal
    $('#sendGlobalMessageModal').on('hidden.bs.modal', function() {
        $('#sendGlobalMessageText').val('');
    });
    
    $('#sendGlobalMessageModal').modal('show');
}

// Função para enviar mensagem global
function sendGlobalMessage(message) {
    $.ajax({
        url: '/api/messages/global',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: message }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                $('#sendGlobalMessageModal').modal('hide');
            } else {
                showToast('Erro', response.message || 'Erro ao enviar mensagem', 'error');
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao enviar mensagem', 'error');
        }
    });
}

// Função para escapar aspas simples para uso em atributos JavaScript
function escapeJsString(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Função para renderizar botão de spawnar
function renderSpawnButton(player) {
    if (!player.IsOnline || player.IsOnline === 0) {
        return '<span class="text-muted">-</span>';
    }
    
    const playerName = escapeJsString(player.PlayerName || 'Jogador');
    return `
        <button class="btn btn-primary btn-sm" onclick="confirmRedirectToSpawning('${player.PlayerID}', '${playerName}')" title="Spawnar Itens">
            <i class="fas fa-magic"></i>
        </button>
    `;
}

// Função para renderizar usuário vinculado
function renderLinkedUser(player) {
    if (player.LinkedUsername) {
        return `<span class="badge bg-primary">${escapeHtml(player.LinkedUsername)}</span>`;
    }
    return '<span class="text-muted">-</span>';
}

// Função para renderizar link de loadouts
function renderLoadoutsLink(player) {
    const loadoutCount = player.PlayerLoadoutCount || 0;
    if (!player.PlayerID || loadoutCount === 0) {
        return '<span class="text-muted">Sem loadouts</span>';
    }
    const label = loadoutCount === 1 ? 'Ver 1 loadout' : `Ver ${loadoutCount} loadouts`;
    return `<a href="/loadouts#players-tab?player_id=${player.PlayerID}" class="btn btn-link p-0">${label}</a>`;
}

// Função para redirecionar para spawning com confirmação
function confirmRedirectToSpawning(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    showActionConfirmationModal(
        'Spawnar Itens',
        'Deseja abrir a página de spawning de itens para este jogador?',
        playerId,
        displayName,
        function() {
            window.location.href = `/spawning?player_id=${playerId}`;
        }
    );
}

// Função para renderizar ações
function renderActions(player) {
    return `
        <button class="btn btn-sm btn-primary" onclick="showPlayerControlPanel('${player.PlayerID}')" title="Ações">
            <i class="fas fa-sliders-h"></i>
        </button>
    `;
}

// Função para converter código de país em emoji de bandeira
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return '';
    }
    
    // Converter código de país para emoji de bandeira
    // Cada letra é convertida para seu equivalente em Regional Indicator Symbol
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
}

// Função para renderizar localização
function renderLocation(player) {
    const country = player.Country || '';
    const city = player.City || '';
    const ip = player.IP || '';
    const port = player.Port;
    const ping = player.Ping;
    
    // Se não houver nenhum dado de localização, retornar "-"
    if (!country && !city && !ip && !port && !ping) {
        return '<span class="text-muted">-</span>';
    }
    
    const parts = [];
    
    // Bandeira e país
    if (country) {
        const flag = getCountryFlag(country);
        if (flag) {
            parts.push(`${flag} ${escapeHtml(country)}`);
        } else {
            parts.push(escapeHtml(country));
        }
    }
    
    // Cidade
    if (city) {
        parts.push(escapeHtml(city));
    }
    
    // Link do IP (se disponível)
    if (ip) {
        const ipUrl = `https://ip-api.com/#${escapeHtml(ip)}`;
        parts.push(`<a href="${ipUrl}" target="_blank" class="text-decoration-none">${escapeHtml(ip)}</a>`);
    }
    
    // Port e First ping (se disponíveis)
    const networkInfo = [];
    if (port !== null && port !== undefined) {
        networkInfo.push(`Port: ${port}`);
    }
    if (ping !== null && ping !== undefined) {
        networkInfo.push(`First ping: ${ping}ms`);
    }
    
    if (networkInfo.length > 0) {
        parts.push(`<small class="text-muted">${networkInfo.join(' | ')}</small>`);
    }
    
    return parts.length > 0 ? `<div class="small">${parts.join('<br>')}</div>` : '<span class="text-muted">-</span>';
}

// Função para mostrar painel de controle do jogador
function showPlayerControlPanel(playerId) {
    const player = playersData.find(p => p.PlayerID === playerId);
    if (!player) {
        showToast('Erro', 'Jogador não encontrado', 'error');
        return;
    }
    
    const playerName = player.PlayerName || 'Jogador desconhecido';
    const steamName = player.SteamName || null;
    const isOnline = player.IsOnline && player.IsOnline !== 0;
    const isAdmin = adminIds.has(playerId);
    
    // Preencher informações do jogador no cabeçalho
    let displayName = escapeHtml(playerName);
    if (steamName) {
        displayName += ` <span class="text-muted">(${escapeHtml(steamName)})</span>`;
    }
    $('#controlPanelPlayerName').html(displayName);
    $('#controlPanelPlayerId').text(playerId);
    
    // Configurar estado dos botões baseado em se está online
    const onlineButtons = ['#controlPanelHealBtn', '#controlPanelKillBtn', '#controlPanelKickBtn', 
                          '#controlPanelDesbugBtn', '#controlPanelActivateGodModeBtn', 
                          '#controlPanelDeactivateGodModeBtn', '#controlPanelSendMessageBtn'];
    
    onlineButtons.forEach(btnId => {
        $(btnId).prop('disabled', !isOnline);
    });
    
    // Mostrar/ocultar seção de administração
    if (isAdmin) {
        $('#controlPanelAdminSection').hide();
    } else {
        $('#controlPanelAdminSection').show();
    }
    
    // Remover event handlers anteriores e adicionar novos
    $('#controlPanelHealBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmExecuteAction(playerId, 'heal', playerName);
    });
    
    $('#controlPanelKillBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmExecuteAction(playerId, 'kill', playerName);
    });
    
    $('#controlPanelKickBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmExecuteAction(playerId, 'kick', playerName);
    });
    
    $('#controlPanelDesbugBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmExecuteAction(playerId, 'desbug', playerName);
    });
    
    $('#controlPanelActivateGodModeBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmActivateGodMode(playerId, playerName);
    });
    
    $('#controlPanelDeactivateGodModeBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmDeactivateGodMode(playerId, playerName);
    });
    
    $('#controlPanelSendMessageBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        showSendMessageModal(playerId, playerName);
    });
    
    $('#controlPanelAddAdminBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmAddAdminFromPlayer(playerId, playerName);
    });
    
    // Abrir modal
    $('#playerControlPanelModal').modal('show');
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
            // Após renderizar a tabela de jogadores, carregar administradores
            // Isso garante que a tabela esteja criada antes de atualizar os botões
            loadAdmins();
        },
        error: function(xhr) {
            showToast('Erro', 'Erro ao carregar jogadores', 'error');
        }
    });
}

// Função auxiliar para toast
function showToast(title, message, type) {
    if (typeof toastr !== 'undefined') {
        toastr[type](message, title);
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
        const linkedUsername = (player.LinkedUsername || '').toLowerCase();
        
        return playerName.includes(term) || 
               steamName.includes(term) || 
               playerId.includes(term) ||
               linkedUsername.includes(term);
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
        tbody.append('<tr><td colspan="11" class="text-center">Nenhum jogador encontrado</td></tr>');
    } else {
        // Renderizar cada jogador
        filteredData.forEach(player => {
            const row = `
                <tr class="${player.IsOnline && player.IsOnline !== 0 ? 'table-info' : ''}">
                    <td>${renderStatus(player)}</td>
                    <td>${renderPlayerId(player.PlayerID)}</td>
                    <td>${escapeHtml(player.PlayerName || '-')}</td>
                    <td>${renderLinkedUser(player)}</td>
                    <td>${createSteamLink(player.SteamID, player.SteamName)}</td>
                    <td>${renderLocation(player)}</td>
                    <td>${renderLoadoutsLink(player)}</td>
                    <td>${renderDateTime(player)}</td>
                    <td>${createMapViewLink(player.PlayerID)}</td>
                    <td>${renderSpawnButton(player)}</td>
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
            { orderable: false, targets: [1, 5, 6, 8, 9, 10] } // Player ID, Localização, Loadouts, Mapa, Spawnar Itens e Ações não são ordenáveis
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
    
    // Event listener para botão de mensagem global
    $('#sendGlobalMessageBtn').on('click', function() {
        showSendGlobalMessageModal();
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
    // loadAdmins() será chamado automaticamente após loadPlayers() completar
    loadPlayers();
    
    // Iniciar auto-refresh
    updateRefreshInterval();
    
    // Event listeners para administradores
    $('#adminSearchInput').on('input', function() {
        const searchTerm = $(this).val();
        
        if (adminSearchTimeout) {
            clearTimeout(adminSearchTimeout);
        }
        
        adminSearchTimeout = setTimeout(function() {
            renderAdminsTable();
        }, 300);
    });
    
    // Tornar funções globais para uso nos botões inline
    window.copyPlayerId = copyPlayerId;
    window.confirmExecuteAction = confirmExecuteAction;
    window.confirmActivateGodMode = confirmActivateGodMode;
    window.confirmDeactivateGodMode = confirmDeactivateGodMode;
    window.confirmRedirectToSpawning = confirmRedirectToSpawning;
    window.removeAdmin = removeAdmin;
    window.showSendMessageModal = showSendMessageModal;
    window.confirmAddAdminFromPlayer = confirmAddAdminFromPlayer;
    window.showPlayerControlPanel = showPlayerControlPanel;
    
    // Limpar intervalos ao sair da página
    $(window).on('beforeunload', function() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
    });
});

// ============================================================================
// FUNÇÕES DE ADMINISTRADORES
// ============================================================================

// Função para carregar administradores
function loadAdmins() {
    $.ajax({
        url: '/api/admins/list',
        method: 'GET',
        success: function(response) {
            adminsData = response.admins || [];
            // Atualizar Set de admin IDs para verificação rápida
            adminIds = new Set(adminsData.map(admin => admin.PlayerID));
            console.log(`[loadAdmins] Dados carregados: ${adminsData.length} administradores`);
            renderAdminsTable();
            // Atualizar tabela de jogadores apenas se ela já foi criada
            // Isso evita renderização duplicada que causa erro de contagem de colunas
            if ($.fn.DataTable.isDataTable('#playersTable') && table) {
                updatePlayersTableActions();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar administradores:', xhr);
            showToast('Erro', 'Erro ao carregar administradores', 'error');
        }
    });
}

// Função para atualizar apenas as ações na tabela de jogadores (sem recriar o DataTable)
function updatePlayersTableActions() {
    if (!$.fn.DataTable.isDataTable('#playersTable') || !table) {
        return;
    }
    
    try {
        // Atualizar as células de ações usando a API do DataTables
        // Isso garante que apenas as linhas visíveis na página atual sejam atualizadas
        const searchTerm = $('#searchInput').val();
        const filteredData = filterPlayersData(playersData, searchTerm);
        
        table.rows().every(function() {
            const rowData = this.data();
            const rowNode = this.node();
            
            // Encontrar o Player ID na linha atual
            // O Player ID está na segunda coluna (índice 1)
            const playerIdCell = $(rowNode).find('td').eq(1);
            const button = playerIdCell.find('button');
            if (button.length > 0) {
                const onclickAttr = button.attr('onclick');
                const match = onclickAttr ? onclickAttr.match(/copyPlayerId\('([^']+)'\)/) : null;
                
                if (match && match[1]) {
                    const playerId = match[1];
                    // Encontrar o player correspondente nos dados filtrados
                    const player = filteredData.find(p => p.PlayerID === playerId);
                    
                    if (player) {
                        const mapCell = $(rowNode).find('td').eq(8);
                        const spawnCell = $(rowNode).find('td').eq(9);
                        const actionCell = $(rowNode).find('td').eq(10);
                        if (mapCell.length > 0) {
                            mapCell.html(createMapViewLink(playerId));
                        }
                        if (spawnCell.length > 0) {
                            spawnCell.html(renderSpawnButton(player));
                        }
                        if (actionCell.length > 0) {
                            actionCell.html(renderActions(player));
                        }
                    }
                }
            }
        });
        
        // Redesenhar a tabela para aplicar mudanças
        table.draw(false);
    } catch (error) {
        console.error('[updatePlayersTableActions] Erro ao atualizar ações:', error);
        // Em caso de erro, recarregar a tabela inteira de forma segura
        if ($.fn.DataTable.isDataTable('#playersTable')) {
            table.destroy();
            table = null;
        }
        renderPlayersTable();
    }
}

// Função para filtrar administradores
function filterAdminsData(data, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        return data;
    }
    
    const term = searchTerm.toLowerCase().trim();
    
    return data.filter(admin => {
        const playerName = (admin.PlayerName || '').toLowerCase();
        const steamName = (admin.SteamName || '').toLowerCase();
        const playerId = (admin.PlayerID || '').toLowerCase();
        
        return playerName.includes(term) || 
               steamName.includes(term) || 
               playerId.includes(term);
    });
}

// Função para renderizar tabela de administradores
function renderAdminsTable() {
    const searchTerm = $('#adminSearchInput').val();
    let filteredData = filterAdminsData(adminsData, searchTerm);
    
    console.log(`[renderAdminsTable] Renderizando tabela com ${filteredData.length} administradores filtrados`);
    
    // Destruir DataTable se existir
    if ($.fn.DataTable.isDataTable('#adminsTable')) {
        adminsTable.clear();
        adminsTable.destroy();
        adminsTable = null;
    }
    
    // Limpar e preencher tbody
    const tbody = $('#adminsTableBody');
    tbody.empty();
    
    if (filteredData.length === 0) {
        // Criar linha com 4 células separadas (sem colspan) para evitar erro do DataTables
        tbody.append('<tr><td class="text-center">Nenhum administrador encontrado</td><td></td><td></td><td></td></tr>');
    } else {
        // Renderizar cada administrador
        filteredData.forEach(admin => {
            const playerIdButton = `
                <button class="btn btn-sm btn-outline-secondary" onclick="copyPlayerId('${admin.PlayerID}')" title="Copiar Player ID">
                    <i class="fas fa-copy me-1"></i>ID
                </button>
            `;
            
            const playerName = escapeHtml(admin.PlayerName || 'Não encontrado no banco');
            const steamName = admin.SteamName ? createSteamLink(admin.SteamID, admin.SteamName) : '<span class="text-muted">-</span>';
            
            const row = `
                <tr>
                    <td>${playerIdButton}</td>
                    <td>${playerName}</td>
                    <td>${steamName}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="removeAdmin('${admin.PlayerID}')" title="Remover Administrador">
                            <i class="fas fa-trash me-1"></i>Remover
                        </button>
                    </td>
                </tr>
            `;
            tbody.append(row);
        });
    }
    
    // Recriar DataTable
    adminsTable = $('#adminsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        pageLength: 25,
        responsive: true,
        columnDefs: [
            { orderable: false, targets: [0, 3] } // Player ID e Ações não são ordenáveis
        ]
    });
}

// Função para adicionar administrador a partir da lista de jogadores (versão interna)
function addAdminFromPlayerInternal(playerId) {
    if (!playerId || !playerId.trim()) {
        showToast('Erro', 'Player ID é obrigatório', 'error');
        return;
    }
    
    playerId = playerId.trim();
    
    $.ajax({
        url: '/api/admins/add',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ player_id: playerId }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                // Recarregar lista de administradores e jogadores para atualizar botões
                loadAdmins();
            } else {
                showToast('Erro', response.message || 'Erro ao adicionar administrador', 'error');
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao adicionar administrador', 'error');
        }
    });
}

// Função para adicionar administrador com confirmação
function confirmAddAdminFromPlayer(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    showActionConfirmationModal(
        'Adicionar Administrador',
        'Deseja adicionar este jogador como administrador?',
        playerId,
        displayName,
        function() {
            addAdminFromPlayerInternal(playerId);
        }
    );
}

// Função para remover administrador
function removeAdmin(playerId) {
    if (!confirm('Tem certeza que deseja remover este administrador?')) {
        return;
    }
    
    $.ajax({
        url: '/api/admins/remove',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ player_id: playerId }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                // Recarregar lista de administradores (isso também atualiza os botões na lista de jogadores)
                loadAdmins();
            } else {
                showToast('Erro', response.message || 'Erro ao remover administrador', 'error');
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao remover administrador', 'error');
        }
    });
}

