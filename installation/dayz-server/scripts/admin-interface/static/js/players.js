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
            // Fechar modal de confirmação se estiver aberto
            $('.modal').modal('hide');
            // Retornar ao painel principal após sucesso
            setTimeout(function() {
                if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
                    returnToControlPanel(currentControlPanelPlayerId, currentControlPanelPlayerName);
                }
            }, 300);
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

// Função para atualizar contador de caracteres
function updateCharacterCount(textareaId, counterId, maxLength) {
    const textarea = $(textareaId);
    const counter = $(counterId);
    const currentLength = textarea.val().length;
    counter.text(currentLength);
    
    // Adicionar classe de aviso se estiver próximo do limite
    if (currentLength > maxLength * 0.9) {
        counter.addClass('text-warning');
    } else {
        counter.removeClass('text-warning');
    }
    
    // Adicionar classe de perigo se exceder o limite
    if (currentLength >= maxLength) {
        counter.addClass('text-danger fw-bold');
    } else {
        counter.removeClass('text-danger fw-bold');
    }
}

// Função para mostrar modal de kick com mensagem personalizada
function showKickPlayerModal(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    $('#kickModalPlayerName').text(displayName);
    $('#kickModalPlayerId').text(playerId);
    $('#kickMessage').val('Você foi kickado do servidor');
    
    // Atualizar contador inicial
    updateCharacterCount('#kickMessage', '#kickMessageCharCount', 50);
    
    // Event listener para atualizar contador em tempo real
    $('#kickMessage').off('input').on('input', function() {
        updateCharacterCount('#kickMessage', '#kickMessageCharCount', 50);
    });
    
    // Remover handlers anteriores e adicionar novo
    $('#kickModalConfirmBtn').off('click').on('click', function() {
        const message = $('#kickMessage').val().trim();
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
        if (message.length > 50) {
            showToast('Erro', 'A mensagem não pode exceder 50 caracteres', 'error');
            return;
        }
        
        executeKickAction(playerId, message);
    });
    
    // Handler para botão voltar
    $('#kickModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
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
                $('#kickPlayerModal').modal('hide');
                // Retornar ao painel principal após sucesso
                setTimeout(function() {
                    returnToControlPanel(playerId, currentControlPanelPlayerName || 'Jogador');
                }, 300);
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
            // Fechar modal de confirmação se estiver aberto
            $('.modal').modal('hide');
            // Retornar ao painel principal após sucesso
            setTimeout(function() {
                if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
                    returnToControlPanel(currentControlPanelPlayerId, currentControlPanelPlayerName);
                }
            }, 300);
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
            // Fechar modal de confirmação se estiver aberto
            $('.modal').modal('hide');
            // Retornar ao painel principal após sucesso
            setTimeout(function() {
                if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
                    returnToControlPanel(currentControlPanelPlayerId, currentControlPanelPlayerName);
                }
            }, 300);
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
    
    // Handler para botão voltar
    $('#actionModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
    });
    
    $('#actionConfirmationModal').modal('show');
}

// Função para mostrar modal de enviar mensagem privada
// Variável para armazenar intervalo de auto-refresh do chat
let chatRefreshInterval = null;
let currentChatPlayerId = null;

// Variáveis para armazenar contexto do jogador ao abrir modais
let currentControlPanelPlayerId = null;
let currentControlPanelPlayerName = null;

// Função para retornar ao painel de controle principal
function returnToControlPanel(playerId, playerName) {
    // Fechar modal atual
    $('.modal').modal('hide');
    
    // Aguardar um pouco para garantir que o modal foi fechado
    setTimeout(function() {
        // Reabrir modal principal com os dados do jogador
        if (playerId && playerName) {
            showPlayerControlPanel(playerId, playerName);
        } else if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
            showPlayerControlPanel(currentControlPanelPlayerId, currentControlPanelPlayerName);
        }
    }, 300);
}

function showPlayerChatModal(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayPlayerName = player ? (player.PlayerName || 'Jogador desconhecido') : (playerName || 'Jogador desconhecido');
    const steamName = player ? (player.SteamName || null) : null;
    
    // Formatar nome com Steam Name entre parênteses
    let displayName = escapeHtml(displayPlayerName);
    if (steamName) {
        displayName += ` (${escapeHtml(steamName)})`;
    }
    
    $('#chatPlayerName').html(displayName);
    $('#chatPlayerId').text(playerId);
    $('#chatMessageInput').val('');
    currentChatPlayerId = playerId;
    
    // Limpar intervalo anterior se existir
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
    
    // Carregar mensagens iniciais
    loadChatMessages(playerId);
    
    // Configurar botão de refresh
    $('#refreshChatBtn').off('click').on('click', function() {
        loadChatMessages(playerId);
    });
    
    // Configurar botão de enviar
    $('#chatSendBtn').off('click').on('click', function() {
        sendChatMessage(playerId);
    });
    
    // Handler para botão voltar
    $('#chatModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
    });
    
    // Enviar ao pressionar Enter (Shift+Enter para nova linha)
    $('#chatMessageInput').off('keydown').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage(playerId);
        }
    });
    
    // Iniciar auto-refresh a cada 5 segundos
    chatRefreshInterval = setInterval(function() {
        if (currentChatPlayerId === playerId) {
            loadChatMessages(playerId, true); // true = silent refresh
        }
    }, 5000);
    
    // Limpar intervalo ao fechar modal
    $('#playerChatModal').off('hidden.bs.modal').on('hidden.bs.modal', function() {
        if (chatRefreshInterval) {
            clearInterval(chatRefreshInterval);
            chatRefreshInterval = null;
        }
        currentChatPlayerId = null;
        $('#chatMessageInput').val('');
    });
    
    $('#playerChatModal').modal('show');
}

// Função para carregar mensagens de chat
function loadChatMessages(playerId, silent = false) {
    if (!silent) {
        $('#chatMessagesContainer').html('<div class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Carregando mensagens...</div>');
    }
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/chat`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                renderChatMessages(response.messages);
            } else {
                if (!silent) {
                    $('#chatMessagesContainer').html(`<div class="alert alert-danger">${response.message || 'Erro ao carregar mensagens'}</div>`);
                }
            }
        },
        error: function(xhr) {
            if (!silent) {
                const errorMessage = xhr.responseJSON?.message || 'Erro ao carregar mensagens';
                $('#chatMessagesContainer').html(`<div class="alert alert-danger">${errorMessage}</div>`);
            }
        }
    });
}

// Função para renderizar mensagens de chat
function renderChatMessages(messages) {
    const container = $('#chatMessagesContainer');
    
    if (messages.length === 0) {
        container.html('<div class="text-center text-muted">Nenhuma mensagem ainda. Inicie a conversa!</div>');
        return;
    }
    
    let html = '<div class="d-flex flex-column gap-2">';
    
    messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp);
        const timeStr = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = timestamp.toLocaleDateString('pt-BR');
        
        // Mensagens do jogador à esquerda, admin à direita
        const isPlayerMessage = msg.type === 'player_message';
        const alignClass = isPlayerMessage ? 'align-self-start' : 'align-self-end';
        const bgClass = isPlayerMessage ? 'bg-light border' : 'bg-primary text-white';
        const author = isPlayerMessage ? 'Jogador' : 'Admin';
        const icon = isPlayerMessage ? 'fa-user' : 'fa-user-shield';
        
        html += `
            <div class="${alignClass}" style="max-width: 70%;">
                <div class="card ${bgClass} mb-2 shadow-sm">
                    <div class="card-body p-2">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <small class="fw-bold">
                                <i class="fas ${icon} me-1"></i>${escapeHtml(author)}
                            </small>
                            <small class="opacity-75">${dateStr} ${timeStr}</small>
                        </div>
                        <div class="message-text" style="word-wrap: break-word;">${escapeHtml(msg.message)}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.html(html);
    
    // Scroll para o final
    container.scrollTop(container[0].scrollHeight);
}

// Função para enviar mensagem de chat
function sendChatMessage(playerId) {
    const message = $('#chatMessageInput').val().trim();
        
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
    // Desabilitar botão durante envio
    $('#chatSendBtn').prop('disabled', true);
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/send-message`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: message }),
        success: function(response) {
            if (response.success) {
                $('#chatMessageInput').val('');
                // Recarregar mensagens após envio
                setTimeout(function() {
                    loadChatMessages(playerId, true);
                }, 500);
                // Não fechar o modal de chat após enviar mensagem, apenas recarregar
            } else {
                showToast('Erro', response.message || 'Erro ao enviar mensagem', 'error');
            }
            $('#chatSendBtn').prop('disabled', false);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao enviar mensagem', 'error');
            $('#chatSendBtn').prop('disabled', false);
        }
    });
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
                          '#controlPanelDeactivateGodModeBtn', '#controlPanelSendMessageBtn',
                          '#controlPanelBanBtn', '#controlPanelSpawnItemsBtn'];
    
    onlineButtons.forEach(btnId => {
        $(btnId).prop('disabled', !isOnline);
    });
    
    // Botão de histórico de bans sempre habilitado (não precisa estar online)
    
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
        showPlayerChatModal(playerId, playerName);
    });
    
    $('#controlPanelAddAdminBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        confirmAddAdminFromPlayer(playerId, playerName);
    });
    
    $('#controlPanelBanBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        showBanPlayerModal(playerId, playerName);
    });
    
    $('#controlPanelViewBansBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        showPlayerBansModal(playerId, playerName);
    });
    
    $('#controlPanelViewHistoryBtn').off('click').on('click', function() {
        $('#playerControlPanelModal').modal('hide');
        showPlayerEventsHistory(playerId, playerName);
    });
    
    // Botão Spawnar Itens
    $('#controlPanelSpawnItemsBtn').off('click').on('click', function() {
        if (!isOnline) {
            showToast('Aviso', 'Jogador precisa estar online para spawnar itens', 'warning');
            return;
        }
        window.location.href = `/spawning?player_id=${playerId}`;
    });
    
    // Abrir modal
    $('#playerControlPanelModal').modal('show');
}

// Função para mostrar modal de ban
function showBanPlayerModal(playerId, playerName) {
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    $('#banModalPlayerName').text(displayName);
    $('#banModalPlayerId').text(playerId);
    $('#banMinutes').val(0);
    $('#banMessage').val('Você foi banido do servidor');
    
    // Atualizar contador inicial
    updateCharacterCount('#banMessage', '#banMessageCharCount', 50);
    
    // Event listener para atualizar contador em tempo real
    $('#banMessage').off('input').on('input', function() {
        updateCharacterCount('#banMessage', '#banMessageCharCount', 50);
    });
    
    // Remover handlers anteriores e adicionar novo
    $('#banModalConfirmBtn').off('click').on('click', function() {
        const minutes = parseInt($('#banMinutes').val()) || 0;
        const message = $('#banMessage').val().trim();
        
        if (!message) {
            showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
            return;
        }
        
        if (message.length > 50) {
            showToast('Erro', 'A mensagem não pode exceder 50 caracteres', 'error');
            return;
        }
        
        if (minutes < 0) {
            showToast('Aviso', 'Tempo em minutos deve ser maior ou igual a 0', 'warning');
            return;
        }
        
        executeBanAction(playerId, minutes, message);
    });
    
    // Handler para botão voltar
    $('#banModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
    });
    
    $('#banPlayerModal').modal('show');
}

// Função para executar ban via RCON
function executeBanAction(playerId, minutes, message) {
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            minutes: minutes,
            message: message
        }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                $('#banPlayerModal').modal('hide');
                // Retornar ao painel principal após sucesso
                setTimeout(function() {
                    returnToControlPanel(playerId, currentControlPanelPlayerName || 'Jogador');
                }, 300);
            } else {
                showToast('Erro', response.message || 'Erro ao banir jogador', 'error');
            }
        },
        error: function(xhr) {
            const errorMessage = xhr.responseJSON?.message || 'Erro ao banir jogador';
            showToast('Erro', errorMessage, 'error');
        }
    });
}

// Função para mostrar modal de histórico de bans
function showPlayerBansModal(playerId, playerName) {
    // Armazenar playerId para usar na renderização
    currentBansPlayerId = playerId;
    
    const player = playersData.find(p => p.PlayerID === playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    
    $('#bansModalPlayerName').text(displayName);
    $('#bansModalPlayerId').text(playerId);
    $('#bansContent').html('<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando histórico de bans...</div>');
    
    // Handler para botão voltar
    $('#bansModalBackBtn').off('click').on('click', function() {
        returnToControlPanel(playerId, playerName);
    });
    
    $('#playerBansModal').modal('show');
    
    // Carregar histórico de bans
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/bans`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                renderBansHistory(response.bans);
            } else {
                $('#bansContent').html(`<div class="alert alert-danger">${response.message || 'Erro ao carregar histórico de bans'}</div>`);
            }
        },
        error: function(xhr) {
            const errorMessage = xhr.responseJSON?.message || 'Erro ao carregar histórico de bans';
            $('#bansContent').html(`<div class="alert alert-danger">${errorMessage}</div>`);
        }
    });
}

// Variável para armazenar playerId atual no modal de bans
let currentBansPlayerId = null;

// Função para renderizar histórico de bans
function renderBansHistory(bans) {
    const guidBans = bans.guid_bans || [];
    const ipBans = bans.ip_bans || [];
    
    let html = '';
    
    if (guidBans.length === 0 && ipBans.length === 0) {
        html = '<div class="alert alert-info">Nenhum ban encontrado para este jogador.</div>';
    } else {
        if (guidBans.length > 0) {
            html += '<h6 class="mb-3">Bans por GUID:</h6>';
            html += '<div class="table-responsive mb-4">';
            html += '<table class="table table-sm table-striped">';
            html += '<thead><tr><th>ID</th><th>Razão</th><th>Minutos</th><th>Válido</th><th>Ação</th></tr></thead>';
            html += '<tbody>';
            guidBans.forEach(ban => {
                const minutes = ban.minutes === 0 || ban.minutes === -1 ? 'Permanente' : `${ban.minutes} min`;
                const validBadge = ban.valid ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Expirado</span>';
                const banId = ban.id !== undefined ? ban.id : null;
                const actionButton = ban.valid && banId !== null ? 
                    `<button class="btn btn-sm btn-danger" onclick="executeUnbanAction('${currentBansPlayerId}', ${banId})" title="Desbanir">
                        <i class="fas fa-unlock me-1"></i>Desbanir
                    </button>` : 
                    '<span class="text-muted">-</span>';
                html += `<tr>
                    <td>${escapeHtml(banId !== null ? banId : '-')}</td>
                    <td>${escapeHtml(ban.reason || '-')}</td>
                    <td>${minutes}</td>
                    <td>${validBadge}</td>
                    <td>${actionButton}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        }
        
        if (ipBans.length > 0) {
            html += '<h6 class="mb-3">Bans por IP:</h6>';
            html += '<div class="table-responsive">';
            html += '<table class="table table-sm table-striped">';
            html += '<thead><tr><th>IP</th><th>Razão</th><th>Minutos</th><th>Válido</th></tr></thead>';
            html += '<tbody>';
            ipBans.forEach(ban => {
                const minutes = ban.minutes === 0 || ban.minutes === -1 ? 'Permanente' : `${ban.minutes} min`;
                const validBadge = ban.valid ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Expirado</span>';
                html += `<tr>
                    <td>${escapeHtml(ban.ip || '-')}</td>
                    <td>${escapeHtml(ban.reason || '-')}</td>
                    <td>${minutes}</td>
                    <td>${validBadge}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        }
    }
    
    $('#bansContent').html(html);
}

// Função para executar desban via RCON
function executeUnbanAction(playerId, banId) {
    if (!confirm('Tem certeza que deseja remover este ban?')) {
        return;
    }
    
    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/unban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            ban_id: banId
        }),
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                // Recarregar histórico de bans
                setTimeout(function() {
                    if (currentBansPlayerId) {
                        $.ajax({
                            url: `/api/players/${encodeURIComponent(currentBansPlayerId)}/bans`,
                            method: 'GET',
                            success: function(response) {
                                if (response.success) {
                                    renderBansHistory(response.bans);
                                }
                            }
                        });
                    }
                }, 500);
            } else {
                showToast('Erro', response.message || 'Erro ao desbanir jogador', 'error');
            }
        },
        error: function(xhr) {
            const errorMessage = xhr.responseJSON?.message || 'Erro ao desbanir jogador';
            showToast('Erro', errorMessage, 'error');
        }
    });
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
        tbody.append('<tr><td colspan="10" class="text-center">Nenhum jogador encontrado</td></tr>');
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
            { orderable: false, targets: [1, 5, 6, 8, 9] } // Player ID, Localização, Loadouts, Mapa e Ações não são ordenáveis
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
    
    // Verificar se há player_id na URL e abrir modal de ações automaticamente
    const urlParams = new URLSearchParams(window.location.search);
    const playerIdFromUrl = urlParams.get('player_id');
    if (playerIdFromUrl) {
        // Aguardar dados serem carregados antes de abrir o modal
        const checkAndOpenModal = function() {
            if (playersData && playersData.length > 0) {
                const player = playersData.find(p => p.PlayerID === playerIdFromUrl);
                if (player) {
                    // Remover parâmetro da URL para limpar
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                    
                    // Abrir modal de ações
                    setTimeout(function() {
                        showPlayerControlPanel(playerIdFromUrl);
                    }, 500);
                } else {
                    // Tentar novamente após um delay
                    setTimeout(checkAndOpenModal, 500);
                }
            } else {
                // Dados ainda não carregaram, tentar novamente
                setTimeout(checkAndOpenModal, 500);
            }
        };
        
        // Iniciar verificação após um pequeno delay
        setTimeout(checkAndOpenModal, 1000);
    }
    
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
    window.removeAdmin = removeAdmin;
    window.showPlayerChatModal = showPlayerChatModal;
    window.showSendMessageModal = showPlayerChatModal; // Mantém compatibilidade
    window.confirmAddAdminFromPlayer = confirmAddAdminFromPlayer;
    window.showPlayerControlPanel = showPlayerControlPanel;
    window.showBanPlayerModal = showBanPlayerModal;
    window.showPlayerBansModal = showPlayerBansModal;
    window.executeUnbanAction = executeUnbanAction;
    
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
                        const actionCell = $(rowNode).find('td').eq(9);
                        if (mapCell.length > 0) {
                            mapCell.html(createMapViewLink(playerId));
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
function addAdminFromPlayerInternal(playerId, playerName) {
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
                // Fechar modal de confirmação se estiver aberto
                $('.modal').modal('hide');
                // Retornar ao painel principal após sucesso
                setTimeout(function() {
                    if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
                        returnToControlPanel(currentControlPanelPlayerId, currentControlPanelPlayerName);
                    }
                }, 300);
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
            addAdminFromPlayerInternal(playerId, playerName);
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

// ============================================================================
// FUNCIONALIDADE DE HISTÓRICO DE EVENTOS
// ============================================================================

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

/**
 * Estado do histórico de eventos
 */
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
 */
function formatEventType(eventType) {
    return EVENT_TYPE_NAMES[eventType] || eventType;
}

/**
 * Formatar detalhes JSON de forma legível
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

// Event listeners para histórico de eventos (quando o documento estiver pronto)
$(document).ready(function() {
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
});

