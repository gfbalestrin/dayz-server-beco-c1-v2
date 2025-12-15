// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

let usersTable;
let allPlayers = [];
let isSuperAdmin = false;
let isAdminUser = false;
let userToDelete = null;
let userToLink = null;

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Verificar se é Super Admin
    const userType = $('body').data('user-type');
    isSuperAdmin = userType === 'super_admin';
    isAdminUser = userType === 'admin';
    
    // Inicializar DataTables
    initializeTable();
    
    // Carregar jogadores para select
    loadPlayers();
    
    // Event listeners (botão só existe para Super Admin)
    $('#btnAddUser').on('click', showAddUserModal);
    $('#btnSaveUser').on('click', saveUser);
    $('#userType').on('change', togglePlayerIdField);
    $('#btnSavePassword').on('click', updatePassword);
});

// ============================================================================
// INICIALIZAÇÃO DA TABELA
// ============================================================================

function initializeTable() {
    usersTable = $('#usersTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        processing: true,
        serverSide: false,
        responsive: true,
        columns: [
            { data: 'UserID', width: '5%' },
            { data: 'Username', width: '15%' },
            { 
                data: 'UserType', 
                width: '10%',
                render: function(data, type, row) {
                    if (data === 'admin') {
                        return '<span class="badge bg-warning">Admin</span>';
                    } else if (data === 'player') {
                        return '<span class="badge bg-info">Jogador</span>';
                    }
                    return data;
                }
            },
            { 
                data: 'IsActive', 
                width: '10%',
                render: function(data, type, row) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-success">Ativo</span>';
                    } else {
                        return '<span class="badge bg-secondary">Inativo</span>';
                    }
                }
            },
            { 
                data: 'PlayerName', 
                width: '20%',
                render: function(data, type, row) {
                    if (data) {
                        const steamValue = row.SteamName || row.SteamID || null;
                        if (steamValue) {
                            return `<span title="PlayerID: ${row.PlayerID}">${data} (${steamValue})</span>`;
                        }
                        return `<span title="PlayerID: ${row.PlayerID}">${data}</span>`;
                    }
                    return '<span class="text-muted">-</span>';
                }
            },
            { 
                data: null,
                width: '12%',
                orderable: false,
                render: function(data, type, row) {
                    const loadoutCount = row.PlayerLoadoutCount || 0;
                    if (!row.PlayerID || loadoutCount === 0) {
                        return '<span class="text-muted">Sem loadouts</span>';
                    }
                    const label = loadoutCount === 1 ? 'Ver 1 loadout' : `Ver ${loadoutCount} loadouts`;
                    return `<a href="/loadouts#players-tab?player_id=${row.PlayerID}" class="btn btn-link p-0">${label}</a>`;
                }
            },
            { 
                data: 'CreatedAt', 
                width: '10%',
                render: function(data, type, row) {
                    if (data) {
                        const date = new Date(data);
                        return date.toLocaleString('pt-BR');
                    }
                    return '-';
                }
            },
            { 
                data: 'LastLogin', 
                width: '10%',
                render: function(data, type, row) {
                    if (data) {
                        const date = new Date(data);
                        return formatRelativeTime(date);
                    }
                    return '<span class="text-muted">Nunca</span>';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    if (isSuperAdmin) {
                        let html = '<div class="btn-group btn-group-sm" role="group">';
                        html += `<button class="btn btn-primary btn-link-player" data-id="${row.UserID}" title="Vincular jogador">
                                    <i class="fas fa-user-tag"></i>
                                 </button>`;
                        html += `<button class="btn btn-warning btn-edit-password" data-id="${row.UserID}" title="Alterar senha">
                                    <i class="fas fa-key"></i>
                                 </button>`;
                        if (row.IsActive === 1 || row.IsActive === true) {
                            html += `<button class="btn btn-danger btn-deactivate" data-id="${row.UserID}" title="Desativar">
                                        <i class="fas fa-ban"></i>
                                     </button>`;
                        } else {
                            html += `<button class="btn btn-success btn-activate" data-id="${row.UserID}" title="Ativar">
                                        <i class="fas fa-check"></i>
                                     </button>`;
                        }
                        html += `<button class="btn btn-danger btn-delete" data-id="${row.UserID}" data-username="${row.Username}" title="Excluir permanentemente">
                                    <i class="fas fa-trash"></i>
                                 </button>`;
                        html += '</div>';
                        return html;
                    }
                    
                    if (isAdminUser && row.UserType === 'player') {
                        return `<div class="btn-group btn-group-sm" role="group">
                                    <button class="btn btn-warning btn-edit-password" data-id="${row.UserID}" title="Alterar senha">
                                        <i class="fas fa-key"></i>
                                    </button>
                                </div>`;
                    }
                    
                    return '<span class="text-muted">Sem permissão</span>';
                }
            }
        ]
    });
    
    // Event listeners para botões de ação
    $('#usersTable').on('click', '.btn-edit-password', function() {
        const userId = $(this).data('id');
        showPasswordModal(userId);
    });
    
    $('#usersTable').on('click', '.btn-deactivate', function() {
        const userId = $(this).data('id');
        confirmDeactivate(userId);
    });
    
    $('#usersTable').on('click', '.btn-activate', function() {
        const userId = $(this).data('id');
        confirmActivate(userId);
    });
    
    $('#usersTable').on('click', '.btn-delete', function() {
        const userId = $(this).data('id');
        const username = $(this).data('username');
        showDeleteModal(userId, username);
    });
    
    $('#usersTable').on('click', '.btn-link-player', function() {
        const button = $(this);
        const rowData = getRowDataFromButton(button);
        if (rowData) {
            showPlayerLinkModal(rowData);
        }
    });
    
    $('#btnConfirmDelete').on('click', deleteUser);
    $('#btnSavePlayerLink').on('click', savePlayerLink);
    $('#btnUnlinkPlayer').on('click', unlinkPlayer);
    
    // Carregar dados
    loadUsers();
}

// ============================================================================
// CARREGAMENTO DE DADOS
// ============================================================================

function loadUsers() {
    $.ajax({
        url: '/api/manage/users',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                usersTable.clear();
                usersTable.rows.add(response.data);
                usersTable.draw();
            }
        },
        error: function(xhr) {
            showAlert('Erro ao carregar usuários', 'danger');
        }
    });
}

function loadPlayers(callback) {
    console.log('[users_manage] loadPlayers() iniciado');
    $.ajax({
        url: '/api/players/all-with-status',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            console.log('[users_manage] loadPlayers() sucesso', response);
            handlePlayersResponse(response, callback);
        },
        error: function() {
            showAlert('Erro ao carregar lista de jogadores', 'danger');
            console.warn('[users_manage] loadPlayers() erro ao recuperar dados');
            if (typeof callback === 'function') {
                callback();
            }
        }
    });
}

function handlePlayersResponse(response, callback) {
    console.log('[users_manage] handlePlayersResponse() bruto', response);
    let responseData = response;
    if (typeof response === 'string') {
        try {
            responseData = JSON.parse(response);
            console.log('[users_manage] handlePlayersResponse() string convertida em objeto');
        } catch (error) {
            showAlert('Resposta inválida ao carregar jogadores', 'danger');
            console.error('[users_manage] handlePlayersResponse() erro ao converter string em JSON', error);
            if (typeof callback === 'function') {
                callback();
            }
            return;
        }
    }
    
    let playersList = null;
    if (Array.isArray(responseData)) {
        playersList = responseData;
    } else if (responseData && Array.isArray(responseData.players)) {
        playersList = responseData.players;
    } else if (responseData && Array.isArray(responseData.data)) {
        playersList = responseData.data;
    }
    
    if (playersList && playersList.length > 0) {
        allPlayers = playersList;
        console.log(`[users_manage] handlePlayersResponse() jogadores carregados: ${playersList.length}`);
        refreshPlayerSelects();
    } else if (!playersList) {
        showAlert('Formato inesperado na resposta da API de jogadores', 'warning');
        console.warn('[users_manage] handlePlayersResponse() formato inesperado', responseData);
    } else {
        console.warn('[users_manage] handlePlayersResponse() lista de jogadores vazia');
        refreshPlayerSelects();
    }
    
    if (typeof callback === 'function') {
        callback();
    }
}
function populatePlayerSelect() {
    const select = $('#playerId');
    if (!select.length) {
        console.log('[users_manage] populatePlayerSelect() select não encontrado');
        return;
    }
    select.empty();
    select.append('<option value="">Selecione um jogador...</option>');
    
    allPlayers.forEach(player => {
        const optionLabel = buildPlayerOptionLabel(player);
        select.append(`<option value="${player.PlayerID}">${optionLabel}</option>`);
    });
    console.log(`[users_manage] populatePlayerSelect() total de jogadores adicionados: ${allPlayers.length}`);
}

function populatePlayerLinkSelect(selectedPlayerId) {
    const select = $('#playerLinkSelect');
    if (!select.length) {
        console.log('[users_manage] populatePlayerLinkSelect() select não encontrado');
        return;
    }
    
    const previousSelection = select.val() || '';
    select.empty();
    select.append('<option value="">Sem jogador vinculado</option>');
    
    allPlayers.forEach(player => {
        const optionLabel = buildPlayerOptionLabel(player);
        select.append(`<option value="${player.PlayerID}">${optionLabel}</option>`);
    });
    console.log(`[users_manage] populatePlayerLinkSelect() total de jogadores adicionados: ${allPlayers.length}`);
    
    if (selectedPlayerId) {
        select.val(selectedPlayerId);
        if (select.val() !== selectedPlayerId) {
            const optionExists = select.find(`option[value="${selectedPlayerId}"]`).length > 0;
            if (!optionExists) {
                let missingLabel = selectedPlayerId;
                if (userToLink && userToLink.PlayerName) {
                    const steamReference = userToLink.SteamName || userToLink.SteamID || selectedPlayerId;
                    missingLabel = `${userToLink.PlayerName} (${steamReference})`;
                }
                select.append(`<option value="${selectedPlayerId}">${missingLabel}</option>`);
                console.log('[users_manage] populatePlayerLinkSelect() adicionando opção faltante', { selectedPlayerId, missingLabel });
            }
            select.val(selectedPlayerId);
        }
    } else if (previousSelection) {
        select.val(previousSelection);
    }
}

function buildPlayerOptionLabel(player) {
    const displayName = player.PlayerName || 'Nome não disponível';
    const steamReference = player.SteamName || player.SteamID || 'Sem Steam';
    const isOnline = player.IsOnline && player.IsOnline !== 0;
    const statusText = isOnline ? 'Online' : 'Offline';
    return `${displayName} (${steamReference}) - ${statusText}`;
}

function refreshPlayerSelects() {
    console.log('[users_manage] refreshPlayerSelects() chamado', { totalPlayers: allPlayers.length });
    populatePlayerSelect();
    const selectedPlayerId = userToLink ? userToLink.PlayerID : null;
    populatePlayerLinkSelect(selectedPlayerId);
}

// ============================================================================
// MODAL DE CRIAR/EDITAR USUÁRIO
// ============================================================================

function showAddUserModal() {
    $('#userModalTitle').text('Novo Usuário');
    $('#userForm')[0].reset();
    $('#userId').val('');
    $('#userType').val('admin');
    togglePlayerIdField();
    $('#userModal').modal('show');
}

function togglePlayerIdField() {
    const userType = $('#userType').val();
    if (userType === 'player') {
        $('#playerIdField').show();
    } else {
        $('#playerIdField').hide();
    }
}

function saveUser() {
    const userId = $('#userId').val();
    const username = $('#username').val();
    const password = $('#password').val();
    const userType = $('#userType').val();
    const playerId = $('#playerId').val() || null;
    
    // Validações
    if (!username) {
        showAlert('Username é obrigatório', 'danger');
        return;
    }
    
    if (!password || password.length < 8) {
        showAlert('Senha deve ter no mínimo 8 caracteres', 'danger');
        return;
    }
    
    // Preparar dados
    const data = {
        username: username,
        password: password,
        userType: userType,
        playerId: playerId
    };
    
    // Enviar request
    $.ajax({
        url: '/api/manage/admins',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function(response) {
            if (response.success) {
                showAlert('Usuário criado com sucesso!', 'success');
                $('#userModal').modal('hide');
                loadUsers();
            } else {
                showAlert(response.message || 'Erro ao criar usuário', 'danger');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert(response?.message || 'Erro ao criar usuário', 'danger');
        }
    });
}

// ============================================================================
// MODAL DE ALTERAR SENHA
// ============================================================================

function showPasswordModal(userId) {
    $('#passwordForm')[0].reset();
    $('#passwordUserId').val(userId);
    $('#passwordModal').modal('show');
}

function updatePassword() {
    const userId = $('#passwordUserId').val();
    const newPassword = $('#newPassword').val();
    
    if (!newPassword || newPassword.length < 8) {
        showAlert('Senha deve ter no mínimo 8 caracteres', 'danger');
        return;
    }
    
    $.ajax({
        url: `/api/manage/admins/${userId}`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ password: newPassword }),
        success: function(response) {
            if (response.success) {
                showAlert('Senha alterada com sucesso!', 'success');
                $('#passwordModal').modal('hide');
            } else {
                showAlert(response.message || 'Erro ao alterar senha', 'danger');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert(response?.message || 'Erro ao alterar senha', 'danger');
        }
    });
}

// ============================================================================
// DESATIVAR USUÁRIO
// ============================================================================

function confirmDeactivate(userId) {
    if (confirm('Tem certeza que deseja desativar este usuário?')) {
        deactivateUser(userId);
    }
}

function deactivateUser(userId) {
    $.ajax({
        url: `/api/manage/admins/${userId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('Usuário desativado com sucesso!', 'success');
                loadUsers();
            } else {
                showAlert(response.message || 'Erro ao desativar usuário', 'danger');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert(response?.message || 'Erro ao desativar usuário', 'danger');
        }
    });
}

function confirmActivate(userId) {
    if (confirm('Tem certeza que deseja ativar este usuário?')) {
        activateUser(userId);
    }
}

function activateUser(userId) {
    $.ajax({
        url: `/api/manage/admins/${userId}`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ isActive: true }),
        success: function(response) {
            if (response.success) {
                showAlert('Usuário ativado com sucesso!', 'success');
                loadUsers();
            } else {
                showAlert(response.message || 'Erro ao ativar usuário', 'danger');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert(response?.message || 'Erro ao ativar usuário', 'danger');
        }
    });
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `Há ${diffMins} minuto(s)`;
    if (diffHours < 24) return `Há ${diffHours} hora(s)`;
    if (diffDays < 30) return `Há ${diffDays} dia(s)`;
    
    return date.toLocaleString('pt-BR');
}

function showPlayerLinkModal(userData) {
    console.log('[users_manage] showPlayerLinkModal()', userData);
    userToLink = userData;
    const userIdField = $('#playerLinkUserId');
    const usernameField = $('#playerLinkUsername');
    const currentPlayerField = $('#playerLinkCurrentPlayer');
    const unlinkButton = $('#btnUnlinkPlayer');
    
    userIdField.val(userData.UserID);
    usernameField.val(userData.Username);
    
    if (userData.PlayerID) {
        const playerName = userData.PlayerName || 'Nome não disponível';
        const steamName = userData.SteamName || userData.SteamID || '';
        let displayValue = `${playerName} (${userData.PlayerID})`;
        if (steamName) {
            displayValue = `${playerName} (${steamName}) - PlayerID: ${userData.PlayerID}`;
        }
        currentPlayerField.val(displayValue);
        unlinkButton.prop('disabled', false);
    } else {
        currentPlayerField.val('Nenhum jogador vinculado');
        unlinkButton.prop('disabled', true);
    }
    
    const showModal = function() {
        console.log('[users_manage] showPlayerLinkModal() exibindo modal', { totalPlayers: allPlayers.length });
        populatePlayerLinkSelect(userData.PlayerID);
        $('#playerLinkModal').modal('show');
    };
    
    if (!allPlayers || allPlayers.length === 0) {
        console.log('[users_manage] showPlayerLinkModal() lista de jogadores vazia, requisitando loadPlayers()');
        loadPlayers(showModal);
    } else {
        showModal();
    }
}

function savePlayerLink() {
    if (!userToLink) {
        return;
    }
    
    const selectedPlayerId = $('#playerLinkSelect').val();
    const payload = {
        playerId: selectedPlayerId || null
    };
    
    submitPlayerLinkUpdate(payload);
}

function unlinkPlayer() {
    if (!userToLink) {
        return;
    }
    
    $('#playerLinkSelect').val('');
    const payload = {
        playerId: null
    };
    submitPlayerLinkUpdate(payload);
}

function submitPlayerLinkUpdate(payload) {
    const userId = $('#playerLinkUserId').val();
    if (!userId) {
        return;
    }
    
    $.ajax({
        url: `/api/manage/admins/${userId}`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(response) {
            if (response.success) {
                showAlert(response.message || 'Vínculo atualizado com sucesso!', 'success');
                $('#playerLinkModal').modal('hide');
                userToLink = null;
                loadUsers();
            } else {
                showAlert(response.message || 'Erro ao atualizar vínculo de jogador', 'danger');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert(response?.message || 'Erro ao atualizar vínculo de jogador', 'danger');
        }
    });
}

function getRowDataFromButton(button) {
    const currentRow = usersTable.row(button.closest('tr'));
    let rowData = currentRow.data();
    
    if (!rowData) {
        const previousRow = usersTable.row(button.closest('tr').prev());
        rowData = previousRow.data();
    }
    
    return rowData;
}

function showAlert(message, type) {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const alertContainer = $('<div class="alert-container"></div>').html(alertHtml);
    $('body').append(alertContainer);
    
    setTimeout(function() {
        alertContainer.fadeOut(function() {
            $(this).remove();
        });
    }, 3000);
}

// ============================================================================
// EXCLUSÃO PERMANENTE DE USUÁRIOS
// ============================================================================

function showDeleteModal(userId, username) {
    userToDelete = userId;
    $('#deleteUsername').text(username);
    $('#deleteModal').modal('show');
}

function deleteUser() {
    if (!userToDelete) return;
    
    $.ajax({
        url: `/api/manage/admins/${userToDelete}?permanent=true`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showToast('Sucesso', response.message, 'success');
                $('#deleteModal').modal('hide');
                loadUsers(); // Recarregar tabela
            } else {
                showToast('Erro', response.message, 'error');
            }
        },
        error: function(xhr) {
            const message = xhr.responseJSON?.message || 'Erro ao excluir usuário';
            showToast('Erro', message, 'error');
        }
    });
}

