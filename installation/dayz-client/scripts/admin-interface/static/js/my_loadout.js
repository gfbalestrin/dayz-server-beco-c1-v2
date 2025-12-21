// ============================================================================
// MEU LOADOUT - JavaScript
// ============================================================================

let myLoadouts = [];
const MAX_LOADOUTS = 3;

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Carregar loadouts
    loadMyLoadouts();
    
    // Event listeners
    $('#btnAddMyLoadout').on('click', function() {
        // Verificar limite antes de criar
        if (myLoadouts.length >= MAX_LOADOUTS) {
            showAlert('warning', `Você já possui o máximo de ${MAX_LOADOUTS} loadouts. Delete um loadout antes de criar outro.`);
            return;
        }
        window.location.href = '/my-loadout/new';
    });
    
    // Atualizar indicador de limite
    updateLoadoutLimitIndicator();
});

// ============================================================================
// CARREGAR LOADOUTS
// ============================================================================

function loadMyLoadouts() {
    $.ajax({
        url: '/api/loadouts/my-loadout',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                myLoadouts = response.loadouts || [];
                renderLoadoutCards();
                updateLoadoutLimitIndicator();
            } else {
                showAlert('danger', response.message || 'Erro ao carregar loadouts');
            }
        },
        error: function(xhr) {
            const message = xhr.responseJSON?.message || 'Erro ao carregar loadouts';
            showAlert('danger', message);
        }
    });
}

// ============================================================================
// RENDERIZAÇÃO DE CARDS
// ============================================================================

function renderLoadoutCards() {
    const container = $('#loadoutCardsContainer');
    const noLoadoutsMessage = $('#noLoadoutsMessage');
    
    // Limpar container
    container.empty();
    
    // Verificar se há loadouts
    if (myLoadouts.length === 0) {
        container.hide();
        noLoadoutsMessage.show();
        return;
    }
    
    // Mostrar container e ocultar mensagem
    container.show();
    noLoadoutsMessage.hide();
    
    // Renderizar cada card
    myLoadouts.forEach(function(loadout) {
        const card = createLoadoutCard(loadout);
        container.append(card);
    });
}

function createLoadoutCard(loadout) {
    // Status badge
    let statusBadge = '';
    if (loadout.is_active) {
        statusBadge = '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Ativo</span>';
    } else {
        statusBadge = '<span class="badge bg-secondary"><i class="fas fa-times-circle me-1"></i>Inativo</span>';
    }
    
    // Imagem placeholder (SVG)
    const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIyNSIgdmlld0JveD0iMCAwIDQwMCAyMjUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIyMjUiIGZpbGw9IiNmOGY5ZmEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TG9hZG91dCBJbWFnZTwvdGV4dD48L3N2Zz4=';
    
    // Botões de ação
    let actions = '';
    
    // Botão Ativar (se não estiver ativo)
    // Quando está ativo, não exibir badge aqui (já existe no header do card)
    if (!loadout.is_active) {
        actions += `<button class="btn btn-sm btn-success" onclick="setActiveMyLoadout(${loadout.id}); return false;" title="Ativar este loadout">
            <i class="fas fa-check me-1"></i>Ativar
        </button>`;
    }
    
    // Botão Editar
    actions += `<button class="btn btn-sm btn-primary" onclick="editMyLoadout(${loadout.id}); return false;" title="Editar loadout">
        <i class="fas fa-edit me-1"></i>Editar
    </button>`;
    
    // Botão Deletar
    actions += `<button class="btn btn-sm btn-danger" onclick="deleteMyLoadout(${loadout.id}); return false;" title="Deletar loadout">
        <i class="fas fa-trash me-1"></i>Deletar
    </button>`;
    
    // Criar HTML do card
    const cardHtml = `
        <div class="loadout-card">
            <div class="loadout-card-header">
                <h5 class="loadout-card-title">${escapeHtml(loadout.name)}</h5>
                ${statusBadge}
            </div>
            <div class="loadout-card-body">
                <img src="https://img.freepik.com/free-psd/close-up-soldier-isolated_23-2151441992.jpg" alt="Loadout ${escapeHtml(loadout.name)}" class="loadout-card-image">
            </div>
            <div class="loadout-card-footer">
                <div class="loadout-actions">
                    ${actions}
                </div>
            </div>
        </div>
    `;
    
    return $(cardHtml);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// CRUD DE LOADOUTS
// ============================================================================

function editMyLoadout(dbId) {
    // Encontrar o loadout
    const loadout = myLoadouts.find(l => l.id === dbId);
    if (!loadout) {
        showAlert('danger', 'Loadout não encontrado');
        return;
    }
    
    // Redirecionar para página de edição
    window.location.href = `/my-loadout/${loadout.loadout_id}/edit`;
}

function deleteMyLoadout(dbId) {
    // Encontrar o loadout
    const loadout = myLoadouts.find(l => l.id === dbId);
    if (!loadout) {
        showAlert('danger', 'Loadout não encontrado');
        return;
    }
    
    // Confirmar deleção
    if (!confirm(`Tem certeza que deseja deletar o loadout "${loadout.name}"?`)) {
        return;
    }
    
    $.ajax({
        url: `/api/loadouts/my-loadout/${dbId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Loadout deletado com sucesso');
                loadMyLoadouts();
            } else {
                showAlert('danger', response.message || 'Erro ao deletar loadout');
            }
        },
        error: function(xhr) {
            const message = xhr.responseJSON?.message || 'Erro ao deletar loadout';
            showAlert('danger', message);
        }
    });
}

function setActiveMyLoadout(dbId) {
    $.ajax({
        url: `/api/loadouts/my-loadout/${dbId}/set-active`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Loadout ativado com sucesso');
                loadMyLoadouts();
            } else {
                showAlert('danger', response.message || 'Erro ao ativar loadout');
            }
        },
        error: function(xhr) {
            const message = xhr.responseJSON?.message || 'Erro ao ativar loadout';
            showAlert('danger', message);
        }
    });
}

// ============================================================================
// INDICADOR DE LIMITE
// ============================================================================

function updateLoadoutLimitIndicator() {
    const count = myLoadouts.length;
    const indicator = $('#loadoutLimitIndicator');
    const text = $('#loadoutLimitText');
    
    indicator.removeClass('warning danger');
    
    if (count >= MAX_LOADOUTS) {
        indicator.addClass('danger');
        text.html(`<strong>Limite atingido:</strong> Você possui ${count}/${MAX_LOADOUTS} loadouts. Delete um loadout antes de criar outro.`);
        $('#btnAddMyLoadout').prop('disabled', true);
    } else if (count >= MAX_LOADOUTS - 1) {
        indicator.addClass('warning');
        text.html(`<strong>Atenção:</strong> Você possui ${count}/${MAX_LOADOUTS} loadouts. Você pode criar mais ${MAX_LOADOUTS - count} loadout(s).`);
        $('#btnAddMyLoadout').prop('disabled', false);
    } else {
        text.html(`Você possui ${count}/${MAX_LOADOUTS} loadouts. Você pode criar mais ${MAX_LOADOUTS - count} loadout(s).`);
        $('#btnAddMyLoadout').prop('disabled', false);
    }
}

