// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

let weaponsTable;
let magazinesTable;
let ammunitionsTable;
let attachmentsTable;
let explosivesTable;
let itemsTable;
let itemTypesTable;

let itemTypesData = [];
let bannedItemTypes = []; // Armazena os nomes dos tipos de itens banidos

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Inicializar tabelas
    initializeTables();
    
    // Carregar dados iniciais
    loadWeapons();
    loadItemTypes();
    // Carregar tipos banidos para filtrar itens
    loadBannedItemTypes();
    
    // Event listeners - Busca
    $('#weaponsSearchInput').on('keyup', function() {
        weaponsTable.search(this.value).draw();
    });
    $('#magazinesSearchInput').on('keyup', function() {
        magazinesTable.search(this.value).draw();
    });
    $('#ammunitionsSearchInput').on('keyup', function() {
        ammunitionsTable.search(this.value).draw();
    });
    $('#attachmentsSearchInput').on('keyup', function() {
        attachmentsTable.search(this.value).draw();
    });
    $('#explosivesSearchInput').on('keyup', function() {
        explosivesTable.search(this.value).draw();
    });
    $('#itemsSearchInput').on('keyup', function() {
        itemsTable.search(this.value).draw();
    });
    $('#itemTypesSearchInput').on('keyup', function() {
        itemTypesTable.search(this.value).draw();
    });
    
    // Event listeners - Filtros
    $('#itemsTypeFilter').on('change', function() {
        itemsTable.column(4).search(this.value).draw(); // type_name agora está na coluna 4 (após id, img, name, name_type)
    });
    
    // Event listeners - Tabs
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if (target === '#magazines-tab' && !magazinesTable.data().any()) {
            loadMagazines();
        } else if (target === '#ammunitions-tab' && !ammunitionsTable.data().any()) {
            loadAmmunitions();
        } else if (target === '#attachments-tab' && !attachmentsTable.data().any()) {
            loadAttachments();
        } else if (target === '#explosives-tab' && !explosivesTable.data().any()) {
            loadExplosives();
            loadExplosivesGlobalLimit();
        } else if (target === '#items-tab' && !itemsTable.data().any()) {
            loadItems();
        } else if (target === '#item-types-tab' && !itemTypesTable.data().any()) {
            loadItemTypesRules();
        }
    });
    
    // Event listeners - Modals
    $('#btnSaveMaxQuantity').on('click', saveMaxQuantity);
    $('#btnSaveExplosivesGlobalLimit').on('click', saveExplosivesGlobalLimit);
});

// ============================================================================
// FUNÇÃO DE ORDENAÇÃO CUSTOMIZADA PARA is_banned
// ============================================================================

// Função para ordenar dados antes de adicionar à tabela (banidos primeiro)
function sortDataByBannedStatus(data) {
    // Criar cópia do array para evitar mutação do original
    const dataCopy = data.slice();
    return dataCopy.sort(function(a, b) {
        // Converter is_banned para número: 1 para banido, 0 para permitido
        const aBanned = (a.is_banned === 1 || a.is_banned === true) ? 1 : 0;
        const bBanned = (b.is_banned === 1 || b.is_banned === true) ? 1 : 0;
        
        // Ordenar por is_banned DESC (banidos primeiro)
        if (aBanned !== bBanned) {
            return bBanned - aBanned;
        }
        
        // Se is_banned for igual, ordenar por name ASC
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
    });
}

// Função de ordenação customizada para garantir que is_banned seja ordenado numericamente
$.fn.dataTable.ext.order['is-banned-pre'] = function(data) {
    // Converter para número: 1 para banido (true), 0 para permitido (false)
    // Tratar diferentes formatos de dados
    if (data === null || data === undefined) {
        return 0;
    }
    // Se for número
    if (typeof data === 'number') {
        return data === 1 ? 1 : 0;
    }
    // Se for boolean
    if (typeof data === 'boolean') {
        return data === true ? 1 : 0;
    }
    // Se for string
    if (typeof data === 'string') {
        const num = parseInt(data, 10);
        if (!isNaN(num)) {
            return num === 1 ? 1 : 0;
        }
        if (data.toLowerCase() === 'true' || data.toLowerCase() === '1') {
            return 1;
        }
    }
    // Padrão: não banido
    return 0;
};

// ============================================================================
// INICIALIZAÇÃO DAS TABELAS
// ============================================================================

function initializeTables() {
    const tableOptions = {
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        processing: true,
        serverSide: false,
        responsive: true,
        pageLength: 25
        // order removido - cada tabela define sua própria ordenação
    };
    
    // Weapons Table
    weaponsTable = $('#weaponsTable').DataTable({
        ...tableOptions,
        order: [[4, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Weapon" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '20%' },
            { data: 'name_type', width: '20%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '12%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '15%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanWeapon(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banWeapon(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('weapon', ${row.id}, ${row.max_quantity || (row.rule_id ? 'null' : 1)})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Magazines Table
    magazinesTable = $('#magazinesTable').DataTable({
        ...tableOptions,
        order: [[4, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Magazine" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '20%' },
            { data: 'name_type', width: '25%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '15%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanMagazine(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banMagazine(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('magazine', ${row.id}, ${row.max_quantity || (row.rule_id ? 'null' : 1)})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Ammunitions Table
    ammunitionsTable = $('#ammunitionsTable').DataTable({
        ...tableOptions,
        order: [[4, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Ammunition" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '20%' },
            { data: 'name_type', width: '25%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '15%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanAmmunition(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banAmmunition(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('ammunition', ${row.id}, ${row.max_quantity || (row.rule_id ? 'null' : 1)})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Attachments Table
    attachmentsTable = $('#attachmentsTable').DataTable({
        ...tableOptions,
        order: [[5, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Attachment" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '18%' },
            { data: 'name_type', width: '20%' },
            { data: 'type', width: '15%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '10%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanAttachment(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banAttachment(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('attachment', ${row.id}, ${row.max_quantity || (row.rule_id ? 'null' : 1)})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Explosives Table
    explosivesTable = $('#explosivesTable').DataTable({
        ...tableOptions,
        order: [[4, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Explosive" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '20%' },
            { data: 'name_type', width: '25%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '15%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanExplosive(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banExplosive(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('explosive', ${row.id}, ${row.max_quantity || (row.rule_id ? 'null' : 1)})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Items Table
    itemsTable = $('#itemsTable').DataTable({
        ...tableOptions,
        order: [[5, 'asc'], [2, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '5%' },
            { 
                data: 'img', 
                width: '10%',
                orderable: false,
                render: function(data) {
                    if (data) {
                        return `<img src="${data}" alt="Item" style="max-width: 80px; max-height: 80px;" />`;
                    }
                    return '-';
                }
            },
            { data: 'name', width: '18%' },
            { data: 'name_type', width: '20%' },
            { data: 'type_name', width: '15%' },
            { 
                data: 'is_banned', 
                width: '10%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: 'max_quantity', 
                width: '10%',
                render: function(data, type, row) {
                    // Se está banido (is_banned = 1), mostrar '-'
                    if (row.is_banned === 1 || row.is_banned === true) {
                        return '-';
                    }
                    // Se não está na tabela (rule_id é null), quantidade padrão é 1
                    if (!row.rule_id) {
                        return '1 (padrão)';
                    }
                    // Se está na tabela com max_quantity, mostrar o valor
                    return data ? data : '1';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success me-1" onclick="unbanItem(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger me-1" onclick="banItem(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return `
                        ${banBtn}
                        <button class="btn btn-sm btn-primary" onclick="editMaxQuantity('item', ${row.id}, ${row.max_quantity || 1})" title="Editar Quantidade">
                            <i class="fas fa-edit"></i>
                        </button>
                    `;
                }
            }
        ]
    });
    
    // Item Types Table
    itemTypesTable = $('#itemTypesTable').DataTable({
        ...tableOptions,
        order: [[2, 'asc'], [1, 'asc']], // Ordenar por is_banned ASC (banidos primeiro), depois por name ASC
        columns: [
            { data: 'id', width: '10%' },
            { data: 'name', width: '60%' },
            { 
                data: 'is_banned', 
                width: '15%',
                type: 'is-banned-pre',
                render: function(data) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-danger">Banido</span>';
                    }
                    return '<span class="badge bg-success">Permitido</span>';
                }
            },
            { 
                data: null, 
                width: '15%',
                orderable: false,
                render: function(data, type, row) {
                    const banBtn = row.is_banned ? 
                        `<button class="btn btn-sm btn-success" onclick="unbanItemType(${row.id})" title="Permitir">
                            <i class="fas fa-check"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-danger" onclick="banItemType(${row.id})" title="Banir">
                            <i class="fas fa-ban"></i>
                        </button>`;
                    return banBtn;
                }
            }
        ]
    });
}

// ============================================================================
// CARREGAR DADOS
// ============================================================================

function loadWeapons() {
    $.ajax({
        url: '/api/loadout-rules/weapons',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                weaponsTable.clear().rows.add(response.weapons).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar armas:', xhr);
            showAlert('danger', 'Erro ao carregar armas');
        }
    });
}

function loadMagazines() {
    $.ajax({
        url: '/api/loadout-rules/magazines',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                magazinesTable.clear().rows.add(response.magazines).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar magazines:', xhr);
            showAlert('danger', 'Erro ao carregar magazines');
        }
    });
}

function loadAmmunitions() {
    $.ajax({
        url: '/api/loadout-rules/ammunitions',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                ammunitionsTable.clear().rows.add(response.ammunitions).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar ammunitions:', xhr);
            showAlert('danger', 'Erro ao carregar ammunitions');
        }
    });
}

function loadAttachments() {
    $.ajax({
        url: '/api/loadout-rules/attachments',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                attachmentsTable.clear().rows.add(response.attachments).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar attachments:', xhr);
            showAlert('danger', 'Erro ao carregar attachments');
        }
    });
}

function loadExplosives() {
    $.ajax({
        url: '/api/loadout-rules/explosives',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                explosivesTable.clear().rows.add(response.explosives).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar explosives:', xhr);
            showAlert('danger', 'Erro ao carregar explosives');
        }
    });
}

function loadItems() {
    $.ajax({
        url: '/api/loadout-rules/items',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                // Filtrar itens de tipos banidos
                const filteredItems = response.items.filter(function(item) {
                    return bannedItemTypes.indexOf(item.type_name) === -1;
                });
                
                itemsTable.clear().rows.add(filteredItems).draw();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar items:', xhr);
            showAlert('danger', 'Erro ao carregar items');
        }
    });
}

function loadItemTypes() {
    $.ajax({
        url: '/api/manage/item-types',
        method: 'GET',
        success: function(response) {
            itemTypesData = response.types;
            updateItemTypesFilter();
        },
        error: function(xhr) {
            console.error('Erro ao carregar tipos de item:', xhr);
        }
    });
}

function updateItemTypesFilter() {
    const select = $('#itemsTypeFilter');
    const currentValue = select.val();
    select.empty();
    select.append('<option value="">Todos os Tipos</option>');
    
    // Filtrar tipos banidos
    itemTypesData.forEach(function(type) {
        if (bannedItemTypes.indexOf(type.name) === -1) {
            select.append(`<option value="${type.name}">${type.name}</option>`);
        }
    });
    
    // Restaurar valor selecionado se ainda existir
    if (currentValue && bannedItemTypes.indexOf(currentValue) === -1) {
        select.val(currentValue);
    }
}

function loadBannedItemTypes() {
    $.ajax({
        url: '/api/loadout-rules/item-types',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                // Atualizar lista de tipos banidos
                bannedItemTypes = response.item_types
                    .filter(function(type) {
                        return type.is_banned === 1 || type.is_banned === true;
                    })
                    .map(function(type) {
                        return type.name;
                    });
                
                // Atualizar filtro de tipos
                updateItemTypesFilter();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar tipos banidos:', xhr);
        }
    });
}

function loadItemTypesRules() {
    $.ajax({
        url: '/api/loadout-rules/item-types',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                itemTypesTable.clear().rows.add(response.item_types).draw();
                
                // Atualizar lista de tipos banidos
                bannedItemTypes = response.item_types
                    .filter(function(type) {
                        return type.is_banned === 1 || type.is_banned === true;
                    })
                    .map(function(type) {
                        return type.name;
                    });
                
                // Recarregar filtro de tipos e lista de itens se necessário
                updateItemTypesFilter();
                if (itemsTable && itemsTable.data().any()) {
                    loadItems();
                }
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar tipos de item:', xhr);
            showAlert('danger', 'Erro ao carregar tipos de item');
        }
    });
}

function loadExplosivesGlobalLimit() {
    $.ajax({
        url: '/api/loadout-rules/explosives-global',
        method: 'GET',
        success: function(response) {
            if (response.success && response.limit) {
                $('#explosivesGlobalLimit').val(response.limit.max_total_quantity || 0);
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar limite global:', xhr);
        }
    });
}

// ============================================================================
// AÇÕES - BANIR/PERMITIR
// ============================================================================

function banWeapon(id) {
    if (!confirm('Tem certeza que deseja banir esta arma?')) return;
    $.ajax({
        url: `/api/loadout-rules/weapons/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Arma banida com sucesso');
                loadWeapons();
            } else {
                showAlert('danger', 'Erro ao banir arma');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir arma');
        }
    });
}

function unbanWeapon(id) {
    $.ajax({
        url: `/api/loadout-rules/weapons/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Arma permitida com sucesso');
                loadWeapons();
            } else {
                showAlert('danger', 'Erro ao permitir arma');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir arma');
        }
    });
}

function banMagazine(id) {
    if (!confirm('Tem certeza que deseja banir este magazine?')) return;
    $.ajax({
        url: `/api/loadout-rules/magazines/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Magazine banido com sucesso');
                loadMagazines();
            } else {
                showAlert('danger', 'Erro ao banir magazine');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir magazine');
        }
    });
}

function unbanMagazine(id) {
    $.ajax({
        url: `/api/loadout-rules/magazines/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Magazine permitido com sucesso');
                loadMagazines();
            } else {
                showAlert('danger', 'Erro ao permitir magazine');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir magazine');
        }
    });
}

function banAmmunition(id) {
    if (!confirm('Tem certeza que deseja banir esta ammunition?')) return;
    $.ajax({
        url: `/api/loadout-rules/ammunitions/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Ammunition banida com sucesso');
                loadAmmunitions();
            } else {
                showAlert('danger', 'Erro ao banir ammunition');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir ammunition');
        }
    });
}

function unbanAmmunition(id) {
    $.ajax({
        url: `/api/loadout-rules/ammunitions/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Ammunition permitida com sucesso');
                loadAmmunitions();
            } else {
                showAlert('danger', 'Erro ao permitir ammunition');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir ammunition');
        }
    });
}

function banAttachment(id) {
    if (!confirm('Tem certeza que deseja banir este attachment?')) return;
    $.ajax({
        url: `/api/loadout-rules/attachments/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Attachment banido com sucesso');
                loadAttachments();
            } else {
                showAlert('danger', 'Erro ao banir attachment');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir attachment');
        }
    });
}

function unbanAttachment(id) {
    $.ajax({
        url: `/api/loadout-rules/attachments/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Attachment permitido com sucesso');
                loadAttachments();
            } else {
                showAlert('danger', 'Erro ao permitir attachment');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir attachment');
        }
    });
}

function banExplosive(id) {
    if (!confirm('Tem certeza que deseja banir este explosive?')) return;
    $.ajax({
        url: `/api/loadout-rules/explosives/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Explosive banido com sucesso');
                loadExplosives();
            } else {
                showAlert('danger', 'Erro ao banir explosive');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir explosive');
        }
    });
}

function unbanExplosive(id) {
    $.ajax({
        url: `/api/loadout-rules/explosives/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Explosive permitido com sucesso');
                loadExplosives();
            } else {
                showAlert('danger', 'Erro ao permitir explosive');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir explosive');
        }
    });
}

function banItem(id) {
    if (!confirm('Tem certeza que deseja banir este item?')) return;
    $.ajax({
        url: `/api/loadout-rules/items/${id}/ban`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: null }), // NULL = banido
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Item banido com sucesso');
                loadItems();
            } else {
                showAlert('danger', 'Erro ao banir item');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir item');
        }
    });
}

function unbanItem(id) {
    $.ajax({
        url: `/api/loadout-rules/items/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Item permitido com sucesso');
                loadItems();
            } else {
                showAlert('danger', 'Erro ao permitir item');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir item');
        }
    });
}

function banItemType(id) {
    if (!confirm('Tem certeza que deseja banir este tipo de item? Todos os itens deste tipo serão banidos.')) return;
    $.ajax({
        url: `/api/loadout-rules/item-types/${id}/ban`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Tipo de item banido com sucesso');
                loadItemTypesRules();
                // loadItemTypesRules já recarrega loadItems() e updateItemTypesFilter()
            } else {
                showAlert('danger', 'Erro ao banir tipo de item');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao banir tipo de item');
        }
    });
}

function unbanItemType(id) {
    $.ajax({
        url: `/api/loadout-rules/item-types/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Tipo de item permitido com sucesso');
                loadItemTypesRules();
                // loadItemTypesRules já recarrega loadItems() e updateItemTypesFilter()
            } else {
                showAlert('danger', 'Erro ao permitir tipo de item');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao permitir tipo de item');
        }
    });
}

// ============================================================================
// EDITAR MAX QUANTITY
// ============================================================================

function editMaxQuantity(type, id, currentValue) {
    $('#maxQuantityItemId').val(id);
    $('#maxQuantityItemType').val(type);
    $('#maxQuantityValue').val(currentValue === 'null' || currentValue === null ? '' : currentValue);
    $('#maxQuantityModal').modal('show');
}

function saveMaxQuantity() {
    const itemId = $('#maxQuantityItemId').val();
    const itemType = $('#maxQuantityItemType').val();
    const maxQuantity = $('#maxQuantityValue').val().trim();
    
    // Validar e converter valor
    let maxQtyValue = null;
    if (maxQuantity !== '') {
        const parsed = parseInt(maxQuantity);
        if (isNaN(parsed) || parsed < 1) {
            showAlert('danger', 'Por favor, insira um número válido maior ou igual a 1');
            return;
        }
        maxQtyValue = parsed;
    }
    
    // Para explosives, se max_quantity for definido, precisa adicionar à tabela com max_quantity
    // Se max_quantity for null e já estiver na tabela, precisa atualizar
    if (itemType === 'explosive') {
        // Sempre usar ban endpoint que faz INSERT OR REPLACE
        $.ajax({
            url: `/api/loadout-rules/explosives/${itemId}/ban`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ max_quantity: maxQtyValue }),
            success: function(response) {
                if (response.success) {
                    $('#maxQuantityModal').modal('hide');
                    showAlert('success', 'Quantidade máxima definida com sucesso');
                    loadExplosives();
                } else {
                    showAlert('danger', response.message || 'Erro ao definir quantidade máxima');
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseJSON?.message || 'Erro ao definir quantidade máxima';
                showAlert('danger', errorMsg);
            }
        });
        return;
    }
    
    // Para outros tipos, usar endpoint de max-quantity
    let url = '';
    if (itemType === 'weapon') {
        url = `/api/loadout-rules/weapons/${itemId}/max-quantity`;
    } else if (itemType === 'magazine') {
        url = `/api/loadout-rules/magazines/${itemId}/max-quantity`;
    } else if (itemType === 'ammunition') {
        url = `/api/loadout-rules/ammunitions/${itemId}/max-quantity`;
    } else if (itemType === 'attachment') {
        url = `/api/loadout-rules/attachments/${itemId}/max-quantity`;
    } else if (itemType === 'item') {
        url = `/api/loadout-rules/items/${itemId}/max-quantity`;
    }
    
    if (!url) {
        showAlert('danger', 'Tipo de item inválido');
        return;
    }
    
    $.ajax({
        url: url,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ max_quantity: maxQtyValue }),
        success: function(response) {
            if (response.success) {
                $('#maxQuantityModal').modal('hide');
                showAlert('success', 'Quantidade máxima definida com sucesso');
                // Recarregar tabela apropriada
                if (itemType === 'weapon') loadWeapons();
                else if (itemType === 'magazine') loadMagazines();
                else if (itemType === 'ammunition') loadAmmunitions();
                else if (itemType === 'attachment') loadAttachments();
                else if (itemType === 'item') loadItems();
            } else {
                showAlert('danger', response.message || 'Erro ao definir quantidade máxima');
            }
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.message || 'Erro ao definir quantidade máxima';
            showAlert('danger', errorMsg);
        }
    });
}

function saveExplosivesGlobalLimit() {
    const maxTotalQuantity = parseInt($('#explosivesGlobalLimit').val()) || 0;
    
    $.ajax({
        url: '/api/loadout-rules/explosives-global',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ max_total_quantity: maxTotalQuantity }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Limite global de explosivos salvo com sucesso');
            } else {
                showAlert('danger', 'Erro ao salvar limite global');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao salvar limite global');
        }
    });
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function showAlert(type, message) {
    // Usar showToast se disponível, caso contrário criar toast manualmente
    if (typeof showToast === 'function') {
        showToast('', message, type);
    } else {
        // Fallback: criar toast manualmente no canto inferior direito
        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info',
            'danger': 'bg-danger'
        }[type] || 'bg-info';
        
        const icon = {
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle',
            'danger': 'fa-exclamation-circle'
        }[type] || 'fa-info-circle';
        
        const toast = $(`
            <div class="toast align-items-center text-white ${bgClass} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas ${icon} me-2"></i>${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `);
        
        let toastContainer = $('.toast-container');
        if (toastContainer.length === 0) {
            $('body').append('<div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999;"></div>');
            toastContainer = $('.toast-container');
        }
        
        toast.appendTo(toastContainer);
        const bsToast = new bootstrap.Toast(toast[0], {
            autohide: true,
            delay: 5000
        });
        bsToast.show();
        
        toast.on('hidden.bs.toast', function() {
            toast.remove();
        });
    }
}

