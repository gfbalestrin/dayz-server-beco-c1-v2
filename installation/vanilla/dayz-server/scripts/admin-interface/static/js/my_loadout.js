// ============================================================================
// MEU LOADOUT - JavaScript
// ============================================================================

let myLoadoutsTable;
let myLoadouts = [];
const MAX_LOADOUTS = 3;

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Inicializar tabela
    initializeMyLoadoutTable();
    
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
    
    $('#myLoadoutSearchInput').on('keyup', function() {
        myLoadoutsTable.search(this.value).draw();
    });
    
    // Atualizar indicador de limite
    updateLoadoutLimitIndicator();
});

// ============================================================================
// INICIALIZAÇÃO DA TABELA
// ============================================================================

function initializeMyLoadoutTable() {
    myLoadoutsTable = $('#myLoadoutsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/pt-BR.json'
        },
        pageLength: 10,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "Todos"]],
        order: [[3, 'desc']], // Ordenar por atualizado em (mais recente primeiro)
        columns: [
            { data: 'name', name: 'name' },
            { 
                data: 'is_active',
                name: 'is_active',
                render: function(data, type, row) {
                    if (data) {
                        return '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Ativo</span>';
                    } else {
                        return '<span class="badge bg-secondary"><i class="fas fa-times-circle me-1"></i>Inativo</span>';
                    }
                }
            },
            {
                data: 'created_at',
                name: 'created_at',
                render: function(data) {
                    if (!data) return '-';
                    const date = new Date(data);
                    return date.toLocaleString('pt-BR');
                }
            },
            {
                data: 'updated_at',
                name: 'updated_at',
                render: function(data) {
                    if (!data) return '-';
                    const date = new Date(data);
                    return date.toLocaleString('pt-BR');
                }
            },
            {
                data: null,
                name: 'actions',
                orderable: false,
                searchable: false,
                render: function(data, type, row) {
                    let actions = '';
                    
                    // Botão Ativar (se não estiver ativo)
                    if (!row.is_active) {
                        actions += `<button class="btn btn-sm btn-success me-1 mb-1" onclick="setActiveMyLoadout(${row.id}); return false;" title="Ativar este loadout">
                            <i class="fas fa-check me-1"></i>Ativar
                        </button>`;
                    } else {
                        actions += `<span class="badge bg-success me-1 mb-1">Ativo</span>`;
                    }
                    
                    // Botão Editar
                    actions += `<button class="btn btn-sm btn-primary me-1 mb-1" onclick="editMyLoadout(${row.id}); return false;" title="Editar loadout">
                        <i class="fas fa-edit me-1"></i>Editar
                    </button>`;
                    
                    // Botão Deletar
                    actions += `<button class="btn btn-sm btn-danger me-1 mb-1" onclick="deleteMyLoadout(${row.id}); return false;" title="Deletar loadout">
                        <i class="fas fa-trash me-1"></i>Deletar
                    </button>`;
                    
                    return `<div class="loadout-actions">${actions}</div>`;
                }
            }
        ],
        responsive: true
    });
}

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
                updateMyLoadoutsTable();
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

function updateMyLoadoutsTable() {
    myLoadoutsTable.clear();
    myLoadoutsTable.rows.add(myLoadouts);
    myLoadoutsTable.draw();
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

