/**
 * Shared Player Chat
 * Funcionalidade de chat com jogador
 * Depende de: shared-common.js
 */

// Estado do chat
let chatRefreshInterval = null;
let currentChatPlayerId = null;

/**
 * Mostrar modal de chat com jogador
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function showPlayerChatModal(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
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

/**
 * Carregar mensagens de chat
 * @param {string} playerId - ID do jogador
 * @param {boolean} silent - Se true, não mostra indicador de loading
 */
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

/**
 * Renderizar mensagens de chat
 * @param {Array} messages - Array de mensagens
 */
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

/**
 * Enviar mensagem de chat
 * @param {string} playerId - ID do jogador
 */
function sendChatMessage(playerId) {
    const message = $('#chatMessageInput').val().trim();

    if (!message) {
        showToast('Aviso', 'Por favor, digite uma mensagem', 'warning');
        return;
    }

    // Salvar HTML original do botão
    const sendBtn = $('#chatSendBtn');
    const originalBtnHtml = sendBtn.html();

    // Desabilitar botão e campo de input durante envio
    sendBtn.prop('disabled', true);
    $('#chatMessageInput').prop('disabled', true);

    // Mostrar loading no botão
    sendBtn.html('<i class="fas fa-spinner fa-spin me-2"></i>Enviando...');

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
            } else {
                showToast('Erro', response.message || 'Erro ao enviar mensagem', 'error');
            }
            // Restaurar estado do botão e campo
            sendBtn.prop('disabled', false).html(originalBtnHtml);
            $('#chatMessageInput').prop('disabled', false);
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao enviar mensagem', 'error');
            // Restaurar estado do botão e campo
            sendBtn.prop('disabled', false).html(originalBtnHtml);
            $('#chatMessageInput').prop('disabled', false);
        }
    });
}

/**
 * Enviar mensagem privada (legado)
 * @param {string} playerId - ID do jogador
 * @param {string} message - Mensagem
 */
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

/**
 * Mostrar modal de enviar mensagem global
 */
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

/**
 * Enviar mensagem global
 * @param {string} message - Mensagem
 */
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
