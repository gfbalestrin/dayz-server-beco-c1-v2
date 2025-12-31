/**
 * Shared Player Admin Management
 * Gestão de administradores
 * Depende de: shared-common.js, shared-player-actions.js
 */

// Callback para recarregar lista de admins (será definido pela página que usa o módulo)
let _loadAdminsCallback = null;

/**
 * Definir callback para recarregar lista de admins
 * @param {Function} callback - Função para recarregar admins
 */
function setLoadAdminsCallback(callback) {
    _loadAdminsCallback = callback;
}

/**
 * Adicionar administrador a partir da lista de jogadores (versão interna)
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
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
                // Recarregar lista de administradores
                if (_loadAdminsCallback) {
                    _loadAdminsCallback();
                }
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

/**
 * Adicionar administrador com confirmação
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function confirmAddAdminFromPlayer(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
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

/**
 * Remover administrador
 * @param {string} playerId - ID do jogador
 */
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
                // Recarregar lista de administradores
                if (_loadAdminsCallback) {
                    _loadAdminsCallback();
                }
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
