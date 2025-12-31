/**
 * Shared Player Bans
 * Gerenciamento de bans de jogadores
 * Depende de: shared-common.js, shared-player-utils.js
 */

// Estado de bans
let currentBansPlayerId = null;

/**
 * Mostrar modal de ban
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function showBanPlayerModal(playerId, playerName) {
    const player = findPlayerInSharedData(playerId);
    const displayName = player ? (player.PlayerName || 'Jogador desconhecido') : playerName;
    const isOnline = player ? (player.IsOnline && player.IsOnline !== 0) : false;

    $('#banModalPlayerName').text(displayName);
    $('#banModalPlayerId').text(playerId);
    $('#banMinutes').val(0);
    $('#banMessage').val('Você foi banido do servidor');

    // Mostrar/ocultar aviso de jogador offline e desabilitar campo de minutos
    if (!isOnline) {
        $('#banOfflineWarning').show();
        // Desabilitar campo de minutos para jogadores offline (só permite ban permanente)
        $('#banMinutes').prop('disabled', true);
        $('#banMinutes').val(0);
    } else {
        $('#banOfflineWarning').hide();
        // Habilitar campo de minutos para jogadores online
        $('#banMinutes').prop('disabled', false);
    }

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

        // Validação: ban temporário só funciona para jogadores online
        if (!isOnline && minutes !== 0) {
            showToast('Aviso', 'Ban temporário só funciona para jogadores online. Para jogadores offline, use ban permanente (0 minutos).', 'warning');
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

/**
 * Executar ban via RCON
 * @param {string} playerId - ID do jogador
 * @param {number} minutes - Duração em minutos (0 = permanente)
 * @param {string} message - Mensagem de ban
 */
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
            let errorMessage = 'Erro ao banir jogador';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
            } else if (xhr.responseText) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    errorMessage = response.message || errorMessage;
                } catch (e) {
                    errorMessage = xhr.responseText || errorMessage;
                }
            }
            showToast('Erro', errorMessage, 'error');
        }
    });
}

/**
 * Mostrar modal de histórico de bans
 * @param {string} playerId - ID do jogador
 * @param {string} playerName - Nome do jogador
 */
function showPlayerBansModal(playerId, playerName) {
    // Armazenar playerId para usar na renderização
    currentBansPlayerId = playerId;

    const player = findPlayerInSharedData(playerId);
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

/**
 * Renderizar histórico de bans
 * @param {Object} bans - Objeto com arrays de bans
 */
function renderBansHistory(bans) {
    const guidBans = bans.guid_bans || [];
    const ipBans = bans.ip_bans || [];
    const banTxt = bans.ban_txt || null;

    let html = '';
    let hasAnyBan = false;

    // Mostrar ban do ban.txt primeiro (se existir)
    if (banTxt && banTxt.banned) {
        hasAnyBan = true;
        html += '<h6 class="mb-3">Ban Permanente (ban.txt):</h6>';
        html += '<div class="table-responsive mb-4">';
        html += '<table class="table table-sm table-striped">';
        html += '<thead><tr><th>SteamID</th><th>Tipo</th><th>Fonte</th><th>Status</th><th>Ação</th></tr></thead>';
        html += '<tbody>';
        html += `<tr>
            <td><code>${escapeHtml(banTxt.steam_id || '-')}</code></td>
            <td>Permanente</td>
            <td>ban.txt</td>
            <td><span class="badge bg-success">Ativo</span></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="executeUnbanBanTxtAction('${currentBansPlayerId}')" title="Remover do ban.txt">
                    <i class="fas fa-unlock me-1"></i>Remover
                </button>
            </td>
        </tr>`;
        html += '</tbody></table></div>';
    }

    if (guidBans.length > 0) {
        hasAnyBan = true;
        html += '<h6 class="mb-3">Bans por GUID:</h6>';
        html += '<div class="table-responsive mb-4">';
        html += '<table class="table table-sm table-striped">';
        html += '<thead><tr><th>Razão</th><th>Minutos</th><th>Válido</th><th>Ação</th></tr></thead>';
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
                <td>${escapeHtml(ban.reason || '-')}</td>
                <td>${minutes}</td>
                <td>${validBadge}</td>
                <td>${actionButton}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    }

    if (ipBans.length > 0) {
        hasAnyBan = true;
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

    if (!hasAnyBan) {
        html = '<div class="alert alert-info">Nenhum ban encontrado para este jogador.</div>';
    }

    $('#bansContent').html(html);
}

/**
 * Executar desban via RCON
 * @param {string} playerId - ID do jogador
 * @param {number} banId - ID do ban
 */
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

/**
 * Executar remoção de ban do ban.txt
 * @param {string} playerId - ID do jogador
 */
function executeUnbanBanTxtAction(playerId) {
    if (!confirm('Tem certeza que deseja remover este ban do arquivo ban.txt?')) {
        return;
    }

    $.ajax({
        url: `/api/players/${encodeURIComponent(playerId)}/unban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            source: 'ban_txt'
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
                showToast('Erro', response.message || 'Erro ao remover ban do ban.txt', 'error');
            }
        },
        error: function(xhr) {
            let errorMessage = 'Erro ao remover ban do ban.txt';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
            } else if (xhr.responseText) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    errorMessage = response.message || errorMessage;
                } catch (e) {
                    errorMessage = xhr.responseText || errorMessage;
                }
            }
            showToast('Erro', errorMessage, 'error');
        }
    });
}
