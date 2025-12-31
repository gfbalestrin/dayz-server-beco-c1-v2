/**
 * Shared Player Actions
 * Painel de controle principal e ações de jogador
 * Depende de: shared-common.js, shared-player-utils.js
 */

// Estado compartilhado do painel de controle
let currentControlPanelPlayerId = null;
let currentControlPanelPlayerName = null;

// Referência para dados de jogadores (será definida pela página que usa o módulo)
let _sharedPlayersData = [];
let _sharedAdminIds = new Set();

/**
 * Definir dados de jogadores para uso no módulo
 * @param {Array} playersData - Array de dados de jogadores
 * @param {Set} adminIds - Set de IDs de administradores
 */
function setSharedPlayerData(playersData, adminIds) {
    _sharedPlayersData = playersData || [];
    _sharedAdminIds = adminIds || new Set();
}

/**
 * Buscar jogador nos dados compartilhados
 * @param {string} playerId - ID do jogador
 * @returns {Object|null} Dados do jogador ou null
 */
function findPlayerInSharedData(playerId) {
    return _sharedPlayersData.find(p => p.PlayerID === playerId) || null;
}

/**
 * Retornar ao painel de controle principal
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function returnToControlPanel(playerId, playerName) {
    // Fechar modal atual
    $('.modal').modal('hide');

    // Aguardar um pouco para garantir que o modal foi fechado
    setTimeout(function() {
        // Reabrir modal principal com os dados do jogador
        if (playerId && playerName) {
            showPlayerControlPanel(playerId);
        } else if (currentControlPanelPlayerId && currentControlPanelPlayerName) {
            showPlayerControlPanel(currentControlPanelPlayerId);
        }
    }, 300);
}

/**
 * Mostrar modal de confirmação de ação
 * @param {string} actionName - Nome da ação
 * @param {string} message - Mensagem de confirmação
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 * @param {Function} onConfirm - Callback ao confirmar
 */
function showActionConfirmationModal(actionName, message, playerId, playerName, onConfirm) {
    // Buscar dados completos do jogador para obter Steam Name
    const player = findPlayerInSharedData(playerId);
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

/**
 * Executar ação administrativa (versão interna)
 * @param {string} playerId - ID do jogador
 * @param {string} action - Ação a executar
 */
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

/**
 * Executar ação administrativa com confirmação
 * @param {string} playerId - ID do jogador
 * @param {string} action - Ação a executar
 * @param {string} playerName - Nome do jogador
 */
function confirmExecuteAction(playerId, action, playerName) {
    // Se for kick, usar modal especial com mensagem personalizada
    if (action === 'kick') {
        showKickPlayerModal(playerId, playerName);
        return;
    }

    const player = findPlayerInSharedData(playerId);
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

// ============================================================================
// KICK
// ============================================================================

/**
 * Mostrar modal de kick com mensagem personalizada
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function showKickPlayerModal(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
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

/**
 * Executar kick via RCON
 * @param {string} playerId - ID do jogador
 * @param {string} message - Mensagem de kick
 */
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

// ============================================================================
// GOD MODE
// ============================================================================

/**
 * Ativar God Mode (versão interna)
 * @param {string} playerId - ID do jogador
 */
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

/**
 * Ativar God Mode com confirmação
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function confirmActivateGodMode(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
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

/**
 * Remover God Mode (versão interna)
 * @param {string} playerId - ID do jogador
 */
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

/**
 * Remover God Mode com confirmação
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function confirmDeactivateGodMode(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
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

// ============================================================================
// PAINEL DE CONTROLE PRINCIPAL
// ============================================================================

/**
 * Mostrar painel de controle do jogador
 * @param {string} playerId - ID do jogador
 */
function showPlayerControlPanel(playerId) {
    const player = findPlayerInSharedData(playerId);
    if (!player) {
        showToast('Erro', 'Jogador não encontrado', 'error');
        return;
    }

    const playerName = player.PlayerName || 'Jogador desconhecido';
    const steamName = player.SteamName || null;
    const isOnline = player.IsOnline && player.IsOnline !== 0;
    const isAdmin = _sharedAdminIds.has(playerId);

    // Armazenar contexto atual
    currentControlPanelPlayerId = playerId;
    currentControlPanelPlayerName = playerName;

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
                          '#controlPanelSpawnItemsBtn'];

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
