// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

let customLoadoutsTable;
let playerLoadoutsTable;
let allPlayers = [];
let selectedPlayerId = null;

// Variáveis para modo visual de loadouts
let loadoutMode = 'visual'; // 'visual' ou 'json'
let selectedWeapons = {}; // { primary: {...}, secondary: {...}, small: {...} }
let selectedExplosives = []; // [{id, name, name_type, quantity, slots, width, height}]
let selectedItems = []; // [{id, name, name_type, ...compatibilidade...}]

// Dados carregados para seleção
let weaponsDataLoadout = [];
let explosivesDataLoadout = [];
let itemsDataLoadout = [];
let magazinesDataLoadout = [];
let attachmentsDataLoadout = [];
let ammunitionsDataLoadout = [];
let calibersDataLoadout = [];
let itemTypesDataLoadout = [];

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Inicializar tabelas
    initializeCustomTable();
    initializePlayerTable();
    
    // Carregar dados iniciais (apenas se estiver na página de loadouts)
    if ($('#customLoadoutsTable').length > 0) {
        loadCustomLoadouts();
        loadPlayers();
        
        // Event listeners - Custom Loadouts (apenas na página de listagem)
        $('#btnAddCustomLoadout').on('click', function() {
            window.location.href = '/loadouts/custom/new';
        });
        $('#customSearchInput').on('keyup', function() {
            customLoadoutsTable.search(this.value).draw();
        });
    }
    
    // Event listeners para página de edição/criação
    if ($('#customLoadoutForm').length > 0) {
        $('#btnSaveCustomLoadout').on('click', saveCustomLoadout);
        $('#btnValidateCustomJSON').on('click', () => validateJSON('custom'));
        $('#btnFormatCustomJSON').on('click', () => formatJSON('custom'));
        
        // Carregar dados se estiver na página de edição
        const loadoutId = $('#customLoadoutId').val();
        if (loadoutId) {
            // Está editando, carregar dados
            loadLoadoutForEdit(loadoutId);
        } else {
            // Novo loadout, resetar
            resetLoadoutForm();
        }
    }
    
    // Event listeners - Modo Visual
    $('input[name="loadoutMode"]').on('change', function() {
        loadoutMode = $(this).attr('id') === 'modeVisual' ? 'visual' : 'json';
        toggleLoadoutMode();
    });
    
    // Event listeners - Abas (página de edição)
    $('a[data-bs-toggle="tab"][href^="#loadout-"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if ((target === '#loadout-primary-weapon-tab' || target === '#loadout-secondary-weapon-tab' || target === '#loadout-small-weapon-tab') && weaponsDataLoadout.length === 0) {
            loadWeaponsForLoadout();
        } else if (target === '#loadout-explosives-tab' && explosivesDataLoadout.length === 0) {
            loadExplosivesForLoadout();
        } else if (target === '#loadout-items-tab' && itemsDataLoadout.length === 0) {
            loadItemsForLoadout();
        }
    });
    
    // Carregar dados da primeira aba se estiver na página de edição
    if ($('#customLoadoutId').length > 0 || window.location.pathname.includes('/loadouts/custom/')) {
        // Está na página de edição, carregar dados da primeira aba
        if (($('#loadout-primary-weapon-tab').hasClass('active') || $('#loadout-secondary-weapon-tab').hasClass('active') || $('#loadout-small-weapon-tab').hasClass('active')) && weaponsDataLoadout.length === 0) {
            loadWeaponsForLoadout();
        }
    }
    
    // Event listeners - Filtros de armas (3 abas separadas)
    $('#weaponSearchLoadoutPrimary').on('input', () => applyWeaponFiltersLoadout('primary'));
    $('#filterWeaponFeedTypeLoadoutPrimary').on('change', () => applyWeaponFiltersLoadout('primary'));
    $('#filterWeaponCaliberLoadoutPrimary').on('change', () => applyWeaponFiltersLoadout('primary'));
    
    $('#weaponSearchLoadoutSecondary').on('input', () => applyWeaponFiltersLoadout('secondary'));
    $('#filterWeaponFeedTypeLoadoutSecondary').on('change', () => applyWeaponFiltersLoadout('secondary'));
    $('#filterWeaponCaliberLoadoutSecondary').on('change', () => applyWeaponFiltersLoadout('secondary'));
    
    $('#weaponSearchLoadoutSmall').on('input', () => applyWeaponFiltersLoadout('small'));
    $('#filterWeaponFeedTypeLoadoutSmall').on('change', () => applyWeaponFiltersLoadout('small'));
    $('#filterWeaponCaliberLoadoutSmall').on('change', () => applyWeaponFiltersLoadout('small'));
    
    // Event listeners - Configuração de arma
    $('#btnSaveWeaponConfig').on('click', saveWeaponConfiguration);
    $('#attachmentSearchConfig').on('input', applyAttachmentFiltersConfig);
    $('#filterAttachmentTypeConfig').on('change', applyAttachmentFiltersConfig);
    
    // Event listeners - Filtros de explosivos
    $('#explosiveSearchLoadout').on('input', applyExplosiveFiltersLoadout);
    
    // Event listeners - Filtros de items
    $('#itemSearchLoadout').on('input', applyItemFiltersLoadout);
    $('#filterItemTypeLoadout').on('change', applyItemFiltersLoadout);
    $('#filterItemLocationLoadout').on('change', applyItemFiltersLoadout);
    $('#filterItemStorageLoadout').on('change', applyItemFiltersLoadout);
    
    // Event listeners - Player Loadouts
    $('#playerSelect').on('change', onPlayerSelectChange);
    $('#btnAddPlayerLoadout').on('click', showAddPlayerLoadoutModal);
    $('#btnSavePlayerLoadout').on('click', savePlayerLoadout);
    $('#btnValidatePlayerJSON').on('click', () => validateJSON('player'));
    $('#btnFormatPlayerJSON').on('click', () => formatJSON('player'));
    $('#playerLoadoutSearchInput').on('keyup', function() {
        playerLoadoutsTable.search(this.value).draw();
    });
    
    // Template padrão para novo loadout
    window.defaultLoadoutTemplate = {
        "weapons": {
            "primary_weapon": null,
            "secondary_weapon": null,
            "small_weapon": null
        },
        "explosives": null,
        "items": []
    };
});

// ============================================================================
// INICIALIZAÇÃO DAS TABELAS
// ============================================================================

function initializeCustomTable() {
    customLoadoutsTable = $('#customLoadoutsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        processing: true,
        serverSide: false,
        responsive: true,
        order: [[0, 'desc']],
        columns: [
            { data: 'id', width: '5%' },
            { data: 'name', width: '25%' },
            { 
                data: 'is_active', 
                width: '10%',
                render: function(data, type, row) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-success">Ativo</span>';
                    }
                    return '<span class="badge bg-secondary">Inativo</span>';
                }
            },
            { 
                data: 'created_at', 
                width: '20%',
                render: function(data, type, row) {
                    if (data) {
                        return new Date(data).toLocaleString('pt-BR');
                    }
                    return '-';
                }
            },
            { 
                data: 'updated_at', 
                width: '20%',
                render: function(data, type, row) {
                    if (data) {
                        return new Date(data).toLocaleString('pt-BR');
                    }
                    return '-';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    return `
                        <button class="btn btn-sm btn-primary me-1" onclick="editCustomLoadout(${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCustomLoadout(${row.id}, '${row.name.replace(/'/g, "\\'")}')" title="Deletar">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                }
            }
        ]
    });
}

function initializePlayerTable() {
    playerLoadoutsTable = $('#playerLoadoutsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
        },
        processing: true,
        serverSide: false,
        responsive: true,
        order: [[0, 'asc']],
        columns: [
            { data: 'loadout_id', width: '5%' },
            { data: 'name', width: '25%' },
            { 
                data: 'is_active', 
                width: '10%',
                render: function(data, type, row) {
                    if (data === 1 || data === true) {
                        return '<span class="badge bg-success">Ativo</span>';
                    }
                    return '<span class="badge bg-secondary">Inativo</span>';
                }
            },
            { 
                data: 'created_at', 
                width: '20%',
                render: function(data, type, row) {
                    if (data) {
                        return new Date(data).toLocaleString('pt-BR');
                    }
                    return '-';
                }
            },
            { 
                data: 'updated_at', 
                width: '20%',
                render: function(data, type, row) {
                    if (data) {
                        return new Date(data).toLocaleString('pt-BR');
                    }
                    return '-';
                }
            },
            { 
                data: null, 
                width: '20%',
                orderable: false,
                render: function(data, type, row) {
                    return `
                        <button class="btn btn-sm btn-primary me-1" onclick="editPlayerLoadout('${row.player_id}', ${row.loadout_id}, ${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deletePlayerLoadout('${row.player_id}', ${row.loadout_id}, '${row.name.replace(/'/g, "\\'")}')" title="Deletar">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                }
            }
        ]
    });
}

// ============================================================================
// LOADOUTS CUSTOM
// ============================================================================

function loadCustomLoadouts() {
    $.ajax({
        url: '/api/loadouts/custom',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                customLoadoutsTable.clear().rows.add(response.loadouts).draw();
            } else {
                showAlert('danger', 'Erro ao carregar loadouts custom: ' + response.message);
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao carregar loadouts custom');
            console.error('Erro:', xhr);
        }
    });
}

function resetLoadoutForm() {
    // Resetar dados
    $('#customLoadoutName').val('');
    $('#customLoadoutActive').val('false');
    $('#customLoadoutData').val(JSON.stringify(window.defaultLoadoutTemplate, null, 4));
    $('#customJSONValidation').empty();
    
    // Resetar modo visual
    loadoutMode = 'visual';
    selectedWeapons = {};
    selectedExplosives = [];
    selectedItems = [];
    $('#modeVisual').prop('checked', true);
    $('#modeJSON').prop('checked', false);
    toggleLoadoutMode();
    
    // Resetar preview
    updateJSONPreview();
}

function loadLoadoutForEdit(id) {
    $.ajax({
        url: `/api/loadouts/custom/${id}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const loadout = response.loadout;
                $('#customLoadoutId').val(loadout.id);
                $('#customLoadoutName').val(loadout.name);
                $('#customLoadoutActive').val(loadout.is_active ? 'true' : 'false');
                $('#customLoadoutData').val(JSON.stringify(loadout.loadout_data, null, 4));
                $('#customJSONValidation').empty();
                
                // Carregar dados para modo visual
                loadoutMode = 'visual';
                // Carregar dados primeiro se necessário
                if (weaponsDataLoadout.length === 0) {
                    loadWeaponsForLoadout();
                }
                if (explosivesDataLoadout.length === 0) {
                    loadExplosivesForLoadout();
                }
                if (itemsDataLoadout.length === 0) {
                    loadItemsForLoadout();
                }
                
                // Aguardar um pouco para os dados carregarem
                setTimeout(function() {
                    loadLoadoutToVisual(loadout.loadout_data);
                    $('#modeVisual').prop('checked', true);
                    $('#modeJSON').prop('checked', false);
                    toggleLoadoutMode();
                }, 500);
            } else {
                showAlert('danger', 'Erro ao carregar loadout: ' + response.message);
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao carregar loadout');
            console.error('Erro:', xhr);
        }
    });
}

function toggleLoadoutMode() {
    if (loadoutMode === 'visual') {
        $('#visualModeContent').show();
        $('#jsonModeContent').hide();
    } else {
        $('#visualModeContent').hide();
        $('#jsonModeContent').show();
        // Se carregou do modo visual, montar JSON antes de mostrar
        if (selectedWeapons || selectedExplosives.length > 0 || selectedItems.length > 0) {
            const loadoutData = buildLoadoutFromVisual();
            $('#customLoadoutData').val(JSON.stringify(loadoutData, null, 4));
        }
    }
}

function editCustomLoadout(id) {
    // Redirecionar para página de edição
    window.location.href = `/loadouts/custom/${id}/edit`;
}

function loadLoadoutToVisual(loadoutData) {
    // Resetar seleções
    selectedWeapons = {};
    selectedExplosives = [];
    selectedItems = [];
    
    if (!loadoutData) return;
    
    // Carregar weapons
    if (loadoutData.weapons) {
        if (loadoutData.weapons.primary_weapon) {
            loadWeaponToVisual('primary', loadoutData.weapons.primary_weapon);
        }
        if (loadoutData.weapons.secondary_weapon) {
            loadWeaponToVisual('secondary', loadoutData.weapons.secondary_weapon);
        }
        if (loadoutData.weapons.small_weapon) {
            loadWeaponToVisual('small', loadoutData.weapons.small_weapon);
        }
    }
    
    // Carregar explosives (precisa carregar dados primeiro)
    if (loadoutData.explosives && Array.isArray(loadoutData.explosives)) {
        if (explosivesDataLoadout.length === 0) {
            loadExplosivesForLoadout();
            setTimeout(function() {
                loadExplosivesToVisual(loadoutData.explosives);
            }, 500);
        } else {
            loadExplosivesToVisual(loadoutData.explosives);
        }
    }
    
    // Carregar items (precisa carregar dados primeiro)
    if (loadoutData.items && Array.isArray(loadoutData.items)) {
        if (itemsDataLoadout.length === 0) {
            loadItemsForLoadout();
            setTimeout(function() {
                loadItemsToVisual(loadoutData.items);
            }, 500);
        } else {
            loadItemsToVisual(loadoutData.items);
        }
    }
    
    // Atualizar displays
    updateSelectedWeaponsDisplay();
    updateSelectedExplosivesDisplay();
    updateSelectedItemsDisplay();
    
    // Atualizar grids para mostrar itens como selecionados
    // Verificar quais tipos de arma foram carregados e atualizar seus grids
    if (loadoutData.weapons) {
        if (loadoutData.weapons.primary_weapon) {
            applyWeaponFiltersLoadout('primary');
        }
        if (loadoutData.weapons.secondary_weapon) {
            applyWeaponFiltersLoadout('secondary');
        }
        if (loadoutData.weapons.small_weapon) {
            applyWeaponFiltersLoadout('small');
        }
    }
    
    if (loadoutData.explosives && Array.isArray(loadoutData.explosives) && loadoutData.explosives.length > 0) {
        applyExplosiveFiltersLoadout();
    }
    
    if (loadoutData.items && Array.isArray(loadoutData.items) && loadoutData.items.length > 0) {
        applyItemFiltersLoadout();
    }
    
    updateJSONPreview();
}

function loadWeaponToVisual(type, weaponData) {
    // Buscar arma pelo name_type
    const weapon = weaponsDataLoadout.find(w => w.name_type === weaponData.name_type);
    if (!weapon) {
        // Se não encontrar, tentar carregar armas primeiro
        if (weaponsDataLoadout.length === 0) {
            loadWeaponsForLoadout();
            setTimeout(function() {
                loadWeaponToVisual(type, weaponData);
            }, 500);
        }
        return;
    }
    
    selectedWeapons[type] = {
        weapon: weapon,
        magazine: null,
        ammunition: null,
        attachments: []
    };
    
    // Carregar magazine se existir (precisa carregar magazines compatíveis da arma)
    if (weaponData.magazine) {
        // Carregar magazines compatíveis
        loadCompatibleItemsForWeapon(weapon.id, {});
        setTimeout(function() {
            const magazine = magazinesDataLoadout.find(m => m.name_type === weaponData.magazine.name_type);
            if (magazine) {
                selectedWeapons[type].magazine = magazine;
            } else {
                // Armazenar dados mesmo sem encontrar no banco
                selectedWeapons[type].magazine = {
                    name_type: weaponData.magazine.name_type,
                    capacity: weaponData.magazine.capacity,
                    slots: weaponData.magazine.slots,
                    width: weaponData.magazine.width,
                    height: weaponData.magazine.height
                };
            }
        }, 300);
    }
    
    // Carregar ammunition se existir
    if (weaponData.ammunitions) {
        setTimeout(function() {
            const ammunition = ammunitionsDataLoadout.find(a => a.name_type === weaponData.ammunitions.name_type);
            if (ammunition) {
                selectedWeapons[type].ammunition = ammunition;
            } else {
                selectedWeapons[type].ammunition = {
                    name_type: weaponData.ammunitions.name_type,
                    slots: weaponData.ammunitions.slots,
                    width: weaponData.ammunitions.width,
                    height: weaponData.ammunitions.height
                };
            }
        }, 300);
    }
    
    // Carregar attachments se existirem
    if (weaponData.attachments && Array.isArray(weaponData.attachments)) {
        setTimeout(function() {
            weaponData.attachments.forEach(function(attData) {
                const att = attachmentsDataLoadout.find(a => a.name_type === attData.name_type);
                if (att) {
                    selectedWeapons[type].attachments.push({
                        id: att.id,
                        name: att.name,
                        name_type: att.name_type,
                        type: att.type,
                        slots: att.slots,
                        width: att.width,
                        height: att.height,
                        battery: att.battery || false
                    });
                } else {
                    selectedWeapons[type].attachments.push({
                        name_type: attData.name_type,
                        type: attData.type,
                        slots: attData.slots,
                        width: attData.width,
                        height: attData.height,
                        battery: attData.battery || false
                    });
                }
            });
            updateSelectedWeaponsDisplay();
        }, 300);
    }
}

function loadExplosivesToVisual(explosivesData) {
    explosivesData.forEach(function(expData) {
        const explosive = explosivesDataLoadout.find(e => e.name_type === expData.name_type);
        if (explosive) {
            selectedExplosives.push({
                id: explosive.id,
                name: explosive.name,
                name_type: explosive.name_type,
                slots: explosive.slots,
                width: explosive.width,
                height: explosive.height,
                quantity: expData.quantity || 1
            });
        } else {
            selectedExplosives.push({
                name_type: expData.name_type,
                slots: expData.slots,
                width: expData.width,
                height: expData.height,
                quantity: expData.quantity || 1
            });
        }
    });
    updateSelectedExplosivesDisplay();
}

function loadItemsToVisual(itemsData) {
    itemsData.forEach(function(itemData) {
        const item = itemsDataLoadout.find(i => i.name_type === itemData.name_type);
        if (item) {
            // Carregar compatibilidade
            $.ajax({
                url: `/api/manage/items/${item.id}/compatibility`,
                method: 'GET',
                success: function(response) {
                    const compatibility = response.compatibility;
                    selectedItems.push({
                        id: item.id,
                        name: item.name,
                        name_type: item.name_type,
                        type_name: item.type_name || itemData.type_name || '',
                        slots: item.slots,
                        width: item.width,
                        height: item.height,
                        storage_slots: item.storage_slots || 0,
                        storage_width: item.storage_width || 0,
                        storage_height: item.storage_height || 0,
                        localization: item.localization || itemData.localization || '',
                        subitems: [],
                        canHaveSubitems: compatibility.children && compatibility.children.length > 0,
                        compatibleChildren: compatibility.children || []
                    });
                    updateSelectedItemsDisplay();
                },
                error: function() {
                    selectedItems.push({
                        id: item.id,
                        name: item.name,
                        name_type: item.name_type,
                        type_name: item.type_name || itemData.type_name || '',
                        slots: item.slots,
                        width: item.width,
                        height: item.height,
                        storage_slots: item.storage_slots || 0,
                        storage_width: item.storage_width || 0,
                        storage_height: item.storage_height || 0,
                        localization: item.localization || itemData.localization || '',
                        subitems: [],
                        canHaveSubitems: false,
                        compatibleChildren: []
                    });
                    updateSelectedItemsDisplay();
                }
            });
        } else {
            selectedItems.push({
                name_type: itemData.name_type,
                type_name: itemData.type_name || '',
                slots: itemData.slots,
                width: itemData.width,
                height: itemData.height,
                storage_slots: itemData.storage_slots || 0,
                storage_width: itemData.storage_width || 0,
                storage_height: itemData.storage_height || 0,
                localization: itemData.localization || '',
                subitems: [],
                canHaveSubitems: false,
                compatibleChildren: []
            });
        }
    });
    updateSelectedItemsDisplay();
}

// Função saveCustomLoadout antiga removida - agora usa página dedicada

function deleteCustomLoadout(id, name) {
    if (!confirm(`Tem certeza que deseja deletar o loadout "${name}"?`)) {
        return;
    }
    
    $.ajax({
        url: `/api/loadouts/custom/${id}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', response.message);
                loadCustomLoadouts();
            } else {
                showAlert('danger', 'Erro: ' + response.message);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Erro ao deletar loadout';
            showAlert('danger', error);
            console.error('Erro:', xhr);
        }
    });
}

// ============================================================================
// LOADOUTS PLAYERS
// ============================================================================

function loadPlayers() {
    $.ajax({
        url: '/api/loadouts/players/list',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                allPlayers = response.players;
                const select = $('#playerSelect');
                select.empty();
                select.append('<option value="">-- Selecione um jogador --</option>');
                response.players.forEach(function(player) {
                    const displayName = player.PlayerName || player.PlayerID || 'Jogador sem nome';
                    select.append(`<option value="${player.PlayerID}">${displayName}</option>`);
                });
            } else {
                showAlert('danger', 'Erro ao carregar jogadores: ' + response.message);
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao carregar jogadores');
            console.error('Erro:', xhr);
        }
    });
}

function onPlayerSelectChange() {
    selectedPlayerId = $(this).val();
    if (selectedPlayerId) {
        $('#btnAddPlayerLoadout').prop('disabled', false);
        $('#playerLoadoutSearchInput').prop('disabled', false);
        loadPlayerLoadouts(selectedPlayerId);
    } else {
        $('#btnAddPlayerLoadout').prop('disabled', true);
        $('#playerLoadoutSearchInput').prop('disabled', true);
        playerLoadoutsTable.clear().draw();
    }
}

function loadPlayerLoadouts(playerId) {
    $.ajax({
        url: `/api/loadouts/players/${playerId}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                playerLoadoutsTable.clear().rows.add(response.loadouts).draw();
            } else {
                showAlert('danger', 'Erro ao carregar loadouts do jogador: ' + response.message);
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao carregar loadouts do jogador');
            console.error('Erro:', xhr);
        }
    });
}

function showAddPlayerLoadoutModal() {
    if (!selectedPlayerId) {
        showAlert('warning', 'Selecione um jogador primeiro');
        return;
    }
    
    // Buscar próximo ID disponível
    const currentLoadouts = playerLoadoutsTable.data().toArray();
    let nextId = 1;
    if (currentLoadouts.length > 0) {
        const maxId = Math.max(...currentLoadouts.map(l => l.loadout_id));
        nextId = maxId + 1;
    }
    
    $('#playerLoadoutDbId').val('');
    $('#playerLoadoutPlayerId').val(selectedPlayerId);
    $('#playerLoadoutId').val(nextId);
    $('#playerLoadoutName').val('');
    $('#playerLoadoutActive').val('false');
    $('#playerLoadoutData').val(JSON.stringify(window.defaultLoadoutTemplate, null, 4));
    $('#playerLoadoutModalTitle').text('Novo Loadout Player');
    $('#playerJSONValidation').empty();
    const modalElement = document.getElementById('playerLoadoutModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

function editPlayerLoadout(playerId, loadoutId, dbId) {
    $.ajax({
        url: `/api/loadouts/players/${playerId}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const loadout = response.loadouts.find(l => l.loadout_id === loadoutId);
                if (loadout) {
                    $('#playerLoadoutDbId').val(dbId);
                    $('#playerLoadoutPlayerId').val(playerId);
                    $('#playerLoadoutId').val(loadout.loadout_id);
                    $('#playerLoadoutName').val(loadout.name);
                    $('#playerLoadoutActive').val(loadout.is_active ? 'true' : 'false');
                    $('#playerLoadoutData').val(JSON.stringify(loadout.loadout_data, null, 4));
                    $('#playerLoadoutModalTitle').text('Editar Loadout Player');
                    $('#playerJSONValidation').empty();
                    const modalElement = document.getElementById('playerLoadoutModal');
                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                } else {
                    showAlert('danger', 'Loadout não encontrado');
                }
            } else {
                showAlert('danger', 'Erro ao carregar loadout: ' + response.message);
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Erro ao carregar loadout');
            console.error('Erro:', xhr);
        }
    });
}

function savePlayerLoadout() {
    const dbId = $('#playerLoadoutDbId').val();
    const playerId = $('#playerLoadoutPlayerId').val();
    const loadoutId = parseInt($('#playerLoadoutId').val());
    const name = $('#playerLoadoutName').val();
    const isActive = $('#playerLoadoutActive').val() === 'true';
    let loadoutData;
    
    try {
        loadoutData = JSON.parse($('#playerLoadoutData').val());
    } catch (e) {
        showAlert('danger', 'JSON inválido: ' + e.message);
        return;
    }
    
    if (!playerId || !loadoutId || !name || !loadoutData) {
        showAlert('danger', 'Todos os campos são obrigatórios');
        return;
    }
    
    const url = dbId ? `/api/loadouts/players/${playerId}/${loadoutId}` : `/api/loadouts/players/${playerId}`;
    const method = dbId ? 'PUT' : 'POST';
    const data = {
        db_id: dbId,
        loadout_id: loadoutId,
        name: name,
        is_active: isActive,
        loadout_data: loadoutData
    };
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function(response) {
            if (response.success) {
                showAlert('success', response.message);
                const modalElement = document.getElementById('playerLoadoutModal');
                const modalInstance = bootstrap.Modal.getInstance(modalElement);
                if (modalInstance) {
                    modalInstance.hide();
                }
                loadPlayerLoadouts(playerId);
            } else {
                showAlert('danger', 'Erro: ' + response.message);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Erro ao salvar loadout';
            showAlert('danger', error);
            console.error('Erro:', xhr);
        }
    });
}

function deletePlayerLoadout(playerId, loadoutId, name) {
    if (!confirm(`Tem certeza que deseja deletar o loadout "${name}"?`)) {
        return;
    }
    
    $.ajax({
        url: `/api/loadouts/players/${playerId}/${loadoutId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', response.message);
                loadPlayerLoadouts(playerId);
            } else {
                showAlert('danger', 'Erro: ' + response.message);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Erro ao deletar loadout';
            showAlert('danger', error);
            console.error('Erro:', xhr);
        }
    });
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function validateJSON(type) {
    const textareaId = type === 'custom' ? '#customLoadoutData' : '#playerLoadoutData';
    const validationId = type === 'custom' ? '#customJSONValidation' : '#playerJSONValidation';
    const jsonText = $(textareaId).val();
    
    try {
        const parsed = JSON.parse(jsonText);
        
        // Validar estrutura básica
        if (type === 'custom' || type === 'player') {
            const isValid = validateLoadoutStructure(parsed);
            if (isValid) {
                $(validationId).html('<div class="alert alert-success"><i class="fas fa-check me-2"></i>JSON válido!</div>');
            } else {
                $(validationId).html('<div class="alert alert-warning"><i class="fas fa-exclamation-triangle me-2"></i>JSON válido, mas estrutura pode estar incompleta</div>');
            }
        } else {
            $(validationId).html('<div class="alert alert-success"><i class="fas fa-check me-2"></i>JSON válido!</div>');
        }
    } catch (e) {
        $(validationId).html(`<div class="alert alert-danger"><i class="fas fa-times me-2"></i>JSON inválido: ${e.message}</div>`);
    }
}

function validateLoadoutStructure(data) {
    // Validação básica da estrutura do loadout
    if (!data || typeof data !== 'object') {
        return false;
    }
    
    // Verificar se tem weapons, explosives e items
    const hasWeapons = data.weapons !== undefined;
    const hasExplosives = data.explosives !== undefined;
    const hasItems = data.items !== undefined && Array.isArray(data.items);
    
    return hasWeapons && hasExplosives !== undefined && hasItems;
}

function formatJSON(type) {
    const textareaId = type === 'custom' ? '#customLoadoutData' : '#playerLoadoutData';
    const jsonText = $(textareaId).val();
    
    try {
        const parsed = JSON.parse(jsonText);
        const formatted = JSON.stringify(parsed, null, 4);
        $(textareaId).val(formatted);
        showAlert('success', 'JSON formatado com sucesso');
    } catch (e) {
        showAlert('danger', 'Erro ao formatar JSON: ' + e.message);
    }
}

function showAlert(type, message) {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Remover alerts existentes
    $('.alert').remove();
    
    // Adicionar novo alert
    $('.container-fluid').prepend(alertHtml);
    
    // Auto-dismiss após 5 segundos
    setTimeout(function() {
        $('.alert').fadeOut(function() {
            $(this).remove();
        });
    }, 5000);
}

// ============================================================================
// MODO VISUAL - CARREGAMENTO DE DADOS
// ============================================================================

function loadWeaponsForLoadout() {
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            weaponsDataLoadout = response.weapons;
            loadCalibersForLoadout();
            // Aplicar filtros para todas as 3 abas
            ['primary', 'secondary', 'small'].forEach(function(type) {
                applyWeaponFiltersLoadout(type);
            });
        },
        error: function(xhr) {
            console.error('Erro ao carregar armas:', xhr);
        }
    });
}

function loadCalibersForLoadout() {
    $.ajax({
        url: '/api/manage/calibers-list',
        method: 'GET',
        success: function(response) {
            calibersDataLoadout = response.calibers;
            // Popular selects das 3 abas
            ['Primary', 'Secondary', 'Small'].forEach(function(suffix) {
                const select = $(`#filterWeaponCaliberLoadout${suffix}`);
                select.empty();
                select.append('<option value="">Todos Calibres</option>');
                response.calibers.forEach(function(caliber) {
                    // Usar ID para seleção, mas comparar por nome no filtro
                    select.append(`<option value="${caliber.id}">${caliber.name}</option>`);
                });
            });
        },
        error: function(xhr) {
            console.error('Erro ao carregar calibres:', xhr);
        }
    });
}

function loadExplosivesForLoadout() {
    $.ajax({
        url: '/api/manage/explosives',
        method: 'GET',
        success: function(response) {
            explosivesDataLoadout = response.explosives;
            applyExplosiveFiltersLoadout();
        },
        error: function(xhr) {
            console.error('Erro ao carregar explosivos:', xhr);
        }
    });
}

function loadItemsForLoadout() {
    $.ajax({
        url: '/api/manage/items',
        method: 'GET',
        success: function(response) {
            itemsDataLoadout = response.items || [];
            loadItemTypesForLoadout();
            applyItemFiltersLoadout();
        },
        error: function(xhr) {
            console.error('Erro ao carregar items:', xhr);
        }
    });
}

function loadItemTypesForLoadout() {
    $.ajax({
        url: '/api/manage/item-types',
        method: 'GET',
        success: function(response) {
            itemTypesDataLoadout = response.types;
            const select = $('#filterItemTypeLoadout');
            select.empty();
            select.append('<option value="">Todos os Tipos</option>');
            response.types.forEach(function(type) {
                select.append(`<option value="${type.id}">${type.name}</option>`);
            });
        },
        error: function(xhr) {
            console.error('Erro ao carregar tipos de item:', xhr);
        }
    });
}

// ============================================================================
// MODO VISUAL - FILTROS E RENDERIZAÇÃO
// ============================================================================

function applyWeaponFiltersLoadout(weaponType) {
    // weaponType: 'primary', 'secondary', ou 'small'
    const suffix = weaponType === 'primary' ? 'Primary' : (weaponType === 'secondary' ? 'Secondary' : 'Small');
    const search = $(`#weaponSearchLoadout${suffix}`).val().toLowerCase();
    const feedType = $(`#filterWeaponFeedTypeLoadout${suffix}`).val();
    const caliberId = $(`#filterWeaponCaliberLoadout${suffix}`).val();
    
    // Tamanho é fixo baseado no tipo
    const size = weaponType === 'small' ? 'small' : 'large';
    
    let filtered = weaponsDataLoadout.filter(function(weapon) {
        let match = true;
        
        // Filtro de tamanho baseado no tipo de arma
        if (weaponType === 'small') {
            match = match && weapon.slots <= 12;
        } else {
            // primary ou secondary
            match = match && weapon.slots > 12;
        }
        
        if (search) {
            match = match && (weapon.name.toLowerCase().includes(search) || 
                             weapon.name_type.toLowerCase().includes(search));
        }
        
        if (feedType) {
            match = match && weapon.feed_type === feedType;
        }
        
        if (caliberId) {
            // Filtro de calibre - comparar com o nome do calibre (similar ao items_manage.js)
            // Buscar o calibre selecionado nos dados carregados
            const selectedCaliber = calibersDataLoadout.find(c => c.id == caliberId);
            if (!selectedCaliber) {
                match = false;
            } else {
                // weapon.calibers pode ser string ou array, verificar se contém o nome do calibre
                if (!weapon.calibers) {
                    match = false;
                } else {
                    let calibers = [];
                    if (typeof weapon.calibers === 'string') {
                        calibers = weapon.calibers.split(',').map(c => c.trim());
                    } else if (Array.isArray(weapon.calibers)) {
                        calibers = weapon.calibers.map(c => String(c).trim());
                    }
                    // Verificar se a string de calibres contém o nome do calibre selecionado
                    match = match && weapon.calibers.includes(selectedCaliber.name);
                }
            }
        }
        
        return match;
    });
    
    renderWeaponsGridLoadout(filtered, weaponType);
}

function renderWeaponsGridLoadout(data, weaponType) {
    const suffix = weaponType === 'primary' ? 'Primary' : (weaponType === 'secondary' ? 'Secondary' : 'Small');
    const grid = $(`#weaponsGridLoadout${suffix}`);
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma arma encontrada</div>');
        return;
    }
    
    data.forEach(function(weapon) {
        const isSelected = selectedWeapons[weaponType]?.weapon?.id === weapon.id;
        const selectFunction = weaponType === 'primary' ? 'selectPrimaryWeapon' : (weaponType === 'secondary' ? 'selectSecondaryWeapon' : 'selectSmallWeapon');
        
        const card = $(`
            <div class="weapon-card ${isSelected ? 'selected' : ''}" data-weapon-id="${weapon.id}">
                <div class="weapon-actions">
                    <button class="btn btn-sm ${isSelected ? 'btn-warning' : 'btn-success'}" onclick="${selectFunction}(${weapon.id}); event.stopPropagation(); return false;" title="${isSelected ? 'Configurar' : 'Selecionar'}">
                        <i class="fas fa-${isSelected ? 'cog' : 'plus'}"></i>
                    </button>
                </div>
                <img src="${weapon.img || 'https://via.placeholder.com/120?text=No+Image'}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${weapon.name}</div>
                <div class="weapon-info">
                    ${weapon.name_type}<br>
                    ${weapon.feed_type} | ${weapon.slots} slots<br>
                    ${weapon.width}x${weapon.height}
                </div>
            </div>
        `);
        grid.append(card);
    });
    
    // Não chamar updateSelectedWeaponDisplay aqui para evitar recursão infinita
    // O display será atualizado separadamente quando necessário
}

// Funções separadas para selecionar armas por tipo
function selectPrimaryWeapon(weaponId) {
    selectWeaponByType(weaponId, 'primary');
}

function selectSecondaryWeapon(weaponId) {
    selectWeaponByType(weaponId, 'secondary');
}

function selectSmallWeapon(weaponId) {
    selectWeaponByType(weaponId, 'small');
}

function selectWeaponByType(weaponId, weaponType) {
    try {
        const weapon = weaponsDataLoadout.find(w => w.id === weaponId);
        if (!weapon) {
            showAlert('danger', 'Arma não encontrada nos dados carregados');
            console.error('Arma não encontrada:', weaponId);
            return;
        }
        
        // Validar tamanho da arma
        if (weaponType === 'small' && weapon.slots > 12) {
            showAlert('danger', 'Esta arma é muito grande para ser arma pequena (≤12 slots)');
            return;
        }
        if ((weaponType === 'primary' || weaponType === 'secondary') && weapon.slots <= 12) {
            showAlert('danger', 'Esta arma é muito pequena para ser arma primária/secundária (>12 slots)');
            return;
        }
        
        // Se a arma já está selecionada, abrir modal de configuração
        if (selectedWeapons[weaponType]?.weapon?.id === weaponId) {
            openWeaponConfigModalWithData(weaponType);
            return;
        }
        
        // Carregar relacionamentos da arma e aguardar antes de abrir modal
        $.ajax({
            url: `/api/manage/weapons/${weaponId}`,
            method: 'GET',
            success: function(response) {
                try {
                    if (!response || !response.relationships) {
                        throw new Error('Resposta inválida da API');
                    }
                    
                    const relationships = response.relationships;
                    
                    selectedWeapons[weaponType] = {
                        weapon: weapon,
                        magazine: null,
                        ammunition: null,
                        attachments: []
                    };
                    
                    // Carregar magazines, ammunitions e attachments compatíveis ANTES de abrir modal
                    loadCompatibleItemsForWeapon(weaponId, relationships, function() {
                        // Após carregar todos os dados, atualizar display e abrir modal
                        updateSelectedWeaponDisplay(weaponType);
                        // Atualizar grid para destacar a arma selecionada (sem recursão - renderWeaponsGridLoadout não chama mais updateSelectedWeaponDisplay)
                        applyWeaponFiltersLoadout(weaponType);
                        updateJSONPreview();
                        openWeaponConfigModalWithData(weaponType);
                    });
                } catch (error) {
                    showAlert('danger', 'Erro ao processar dados da arma: ' + error.message);
                    console.error('Erro ao processar resposta:', error);
                }
            },
            error: function(xhr) {
                const errorMessage = xhr.responseJSON && xhr.responseJSON.message 
                    ? xhr.responseJSON.message 
                    : 'Erro ao carregar dados da arma. Verifique o console para mais detalhes.';
                showAlert('danger', errorMessage);
                console.error('Erro AJAX ao carregar arma:', {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    response: xhr.responseJSON || xhr.responseText,
                    url: `/api/manage/weapons/${weaponId}`
                });
            }
        });
    } catch (error) {
        showAlert('danger', 'Erro inesperado ao selecionar arma: ' + error.message);
        console.error('Erro inesperado:', error);
    }
}

function loadCompatibleItemsForWeapon(weaponId, relationships, callback) {
    // Usar relacionamentos retornados pela API /api/manage/weapons/<id>
    let magazinesLoaded = false;
    let ammunitionsLoaded = false;
    let attachmentsLoaded = false;
    
    function checkAllLoaded() {
        if (magazinesLoaded && ammunitionsLoaded && attachmentsLoaded && callback) {
            callback();
        }
    }
    
    // Carregar magazines compatíveis usando relationships
    // Aceitar arrays vazios como válidos - se a chave existe, usar mesmo que vazio
    if (relationships && relationships.magazines !== undefined) {
        magazinesDataLoadout = relationships.magazines || [];
        magazinesLoaded = true;
        checkAllLoaded();
    } else {
        // Apenas fazer AJAX se a chave não existir no relationships
        $.ajax({
            url: `/api/manage/magazines`,
            method: 'GET',
            success: function(response) {
                magazinesDataLoadout = response.magazines || [];
                magazinesLoaded = true;
                checkAllLoaded();
            },
            error: function(xhr) {
                console.error('Erro ao carregar magazines:', xhr);
                magazinesDataLoadout = [];
                magazinesLoaded = true;
                checkAllLoaded();
            }
        });
    }
    
    // Carregar ammunitions compatíveis usando relationships
    // Aceitar arrays vazios como válidos - se a chave existe, usar mesmo que vazio
    if (relationships && relationships.ammunitions !== undefined) {
        ammunitionsDataLoadout = relationships.ammunitions || [];
        ammunitionsLoaded = true;
        checkAllLoaded();
    } else {
        // Apenas fazer AJAX se a chave não existir no relationships
        $.ajax({
            url: `/api/manage/ammunitions`,
            method: 'GET',
            success: function(response) {
                ammunitionsDataLoadout = response.ammunitions || [];
                ammunitionsLoaded = true;
                checkAllLoaded();
            },
            error: function(xhr) {
                console.error('Erro ao carregar ammunitions:', xhr);
                ammunitionsDataLoadout = [];
                ammunitionsLoaded = true;
                checkAllLoaded();
            }
        });
    }
    
    // Carregar attachments compatíveis usando relationships
    // Aceitar arrays vazios como válidos - se a chave existe, usar mesmo que vazio
    if (relationships && relationships.attachments !== undefined) {
        attachmentsDataLoadout = relationships.attachments || [];
        attachmentsLoaded = true;
        checkAllLoaded();
    } else {
        // Apenas fazer AJAX se a chave não existir no relationships
        $.ajax({
            url: `/api/manage/attachments`,
            method: 'GET',
            success: function(response) {
                attachmentsDataLoadout = response.attachments || [];
                attachmentsLoaded = true;
                checkAllLoaded();
            },
            error: function(xhr) {
                console.error('Erro ao carregar attachments:', xhr);
                attachmentsDataLoadout = [];
                attachmentsLoaded = true;
                checkAllLoaded();
            }
        });
    }
}

function openWeaponConfigModalWithData(weaponType) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const weapon = weaponConfig.weapon;
    $('#weaponConfigId').val(weapon.id);
    $('#weaponConfigType').val(weaponType);
    $('#weaponConfigName').text(weapon.name);
    
    // Renderizar magazines em grid
    renderMagazinesGridConfig();
    updateSelectedMagazineDisplay();
    
    // Renderizar ammunitions em grid
    renderAmmunitionsGridConfig();
    updateSelectedAmmunitionDisplay();
    
    // Renderizar attachments
    renderAttachmentsGridConfig();
    updateSelectedAttachmentsDisplay();
    
    const modalElement = document.getElementById('weaponConfigModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

// Função mantida para compatibilidade (chamada quando arma já está selecionada)
function openWeaponConfigModal(weaponType) {
    openWeaponConfigModalWithData(weaponType);
}

function applyAttachmentFiltersConfig() {
    const search = $('#attachmentSearchConfig').val().toLowerCase();
    const typeFilter = $('#filterAttachmentTypeConfig').val();
    
    let filtered = attachmentsDataLoadout.filter(function(att) {
        let match = true;
        
        if (search) {
            match = match && (att.name.toLowerCase().includes(search) || 
                             att.name_type.toLowerCase().includes(search));
        }
        
        if (typeFilter) {
            match = match && att.type === typeFilter;
        }
        
        return match;
    });
    
    renderAttachmentsGridConfig(filtered);
}

function renderAttachmentsGridConfig(data = null) {
    const dataToRender = data || attachmentsDataLoadout;
    const grid = $('#attachmentsGridConfig');
    grid.empty();
    
    if (dataToRender.length === 0) {
        grid.html('<div class="text-center p-3">Nenhum attachment encontrado</div>');
        return;
    }
    
    const weaponType = $('#weaponConfigType').val();
    const selectedAttachments = selectedWeapons[weaponType]?.attachments || [];
    const selectedTypes = selectedAttachments.map(a => a.type); // Tipos já selecionados
    
    dataToRender.forEach(function(att) {
        const isSelected = selectedAttachments.some(a => a.id === att.id);
        const sameTypeSelected = selectedTypes.includes(att.type) && !isSelected; // Mesmo tipo já selecionado mas não é este
        
        const card = $(`
            <div class="relationship-card ${isSelected ? 'selected' : ''} ${sameTypeSelected ? 'disabled' : ''}" data-attachment-id="${att.id}">
                <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${att.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="relationship-name">${att.name}</div>
                <div class="relationship-info">
                    ${att.type}<br>
                    ${att.width}x${att.height}
                    ${sameTypeSelected ? '<br><small class="text-muted">Tipo já selecionado</small>' : ''}
                </div>
                ${sameTypeSelected ? 
                    '<button class="btn btn-sm btn-secondary mt-1" disabled title="Um attachment deste tipo já está selecionado"><i class="fas fa-ban"></i></button>' :
                    `<button class="btn btn-sm ${isSelected ? 'btn-danger' : 'btn-success'} mt-1" onclick="toggleAttachmentForWeapon(${att.id})">
                        <i class="fas fa-${isSelected ? 'minus' : 'plus'}"></i>
                    </button>`
                }
            </div>
        `);
        grid.append(card);
    });
}

function toggleAttachmentForWeapon(attachmentId) {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const attachment = attachmentsDataLoadout.find(a => a.id === attachmentId);
    if (!attachment) return;
    
    const index = weaponConfig.attachments.findIndex(a => a.id === attachmentId);
    
    if (index >= 0) {
        // Remover attachment
        weaponConfig.attachments.splice(index, 1);
    } else {
        // Validar que não há outro attachment do mesmo tipo
        const existingSameType = weaponConfig.attachments.find(a => a.type === attachment.type);
        if (existingSameType) {
            showAlert('warning', `Já existe um attachment do tipo "${attachment.type}" selecionado. Remova o existente antes de adicionar outro.`);
            return;
        }
        
        // Adicionar attachment
        weaponConfig.attachments.push({
            id: attachment.id,
            name: attachment.name,
            name_type: attachment.name_type,
            type: attachment.type,
            slots: attachment.slots,
            width: attachment.width,
            height: attachment.height,
            battery: attachment.battery || false
        });
    }
    
    renderAttachmentsGridConfig();
    updateSelectedAttachmentsDisplay();
    updateJSONPreview();
}

function updateSelectedAttachmentsDisplay() {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const container = $('#selectedAttachmentsListConfig');
    container.empty();
    
    if (weaponConfig.attachments.length === 0) {
        container.html('<span class="text-muted">Nenhum attachment selecionado</span>');
        return;
    }
    
    weaponConfig.attachments.forEach(function(att) {
        const badge = $(`
            <span class="badge bg-primary me-2 mb-2" style="font-size: 0.9em;">
                ${att.name} (${att.type})
                <button class="btn-close btn-close-white ms-1" onclick="removeAttachmentFromWeapon('${weaponType}', ${att.id})" style="font-size: 0.7em;"></button>
            </span>
        `);
        container.append(badge);
    });
}

function removeAttachmentFromWeapon(weaponType, attachmentId) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const index = weaponConfig.attachments.findIndex(a => a.id === attachmentId);
    if (index >= 0) {
        weaponConfig.attachments.splice(index, 1);
        renderAttachmentsGridConfig();
        updateSelectedAttachmentsDisplay();
        updateJSONPreview();
    }
}

function renderMagazinesGridConfig() {
    const grid = $('#magazinesGridConfig');
    grid.empty();
    
    if (magazinesDataLoadout.length === 0) {
        grid.html('<div class="text-center p-3">Nenhum magazine encontrado</div>');
        return;
    }
    
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    const selectedMagazine = weaponConfig?.magazine;
    
    magazinesDataLoadout.forEach(function(mag) {
        const isSelected = selectedMagazine?.id === mag.id;
        
        const card = $(`
            <div class="relationship-card ${isSelected ? 'selected' : ''}" data-magazine-id="${mag.id}">
                <img src="${mag.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${mag.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="relationship-name">${mag.name}</div>
                <div class="relationship-info">
                    ${mag.capacity ? `Capacidade: ${mag.capacity}` : ''}<br>
                    ${mag.width}x${mag.height}
                </div>
                <button class="btn btn-sm ${isSelected ? 'btn-danger' : 'btn-success'} mt-1" onclick="selectMagazineForWeapon(${mag.id})">
                    <i class="fas fa-${isSelected ? 'check' : 'plus'}"></i> ${isSelected ? 'Selecionado' : 'Selecionar'}
                </button>
            </div>
        `);
        grid.append(card);
    });
}

function renderAmmunitionsGridConfig() {
    const grid = $('#ammunitionsGridConfig');
    grid.empty();
    
    if (ammunitionsDataLoadout.length === 0) {
        grid.html('<div class="text-center p-3">Nenhuma munição encontrada</div>');
        return;
    }
    
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    const selectedAmmunition = weaponConfig?.ammunition;
    
    ammunitionsDataLoadout.forEach(function(ammo) {
        const isSelected = selectedAmmunition?.id === ammo.id;
        
        const card = $(`
            <div class="relationship-card ${isSelected ? 'selected' : ''}" data-ammunition-id="${ammo.id}">
                <img src="${ammo.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${ammo.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="relationship-name">${ammo.name}</div>
                <div class="relationship-info">
                    ${ammo.width}x${ammo.height}
                </div>
                <button class="btn btn-sm ${isSelected ? 'btn-danger' : 'btn-success'} mt-1" onclick="selectAmmunitionForWeapon(${ammo.id})">
                    <i class="fas fa-${isSelected ? 'check' : 'plus'}"></i> ${isSelected ? 'Selecionado' : 'Selecionar'}
                </button>
            </div>
        `);
        grid.append(card);
    });
}

function selectMagazineForWeapon(magazineId) {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const magazine = magazinesDataLoadout.find(m => m.id === magazineId);
    if (!magazine) return;
    
    // Se já está selecionado, desselecionar
    if (weaponConfig.magazine?.id === magazineId) {
        weaponConfig.magazine = null;
    } else {
        // Selecionar (substitui o anterior se houver)
        weaponConfig.magazine = {
            id: magazine.id,
            name: magazine.name,
            name_type: magazine.name_type,
            capacity: magazine.capacity,
            slots: magazine.slots,
            width: magazine.width,
            height: magazine.height
        };
    }
    
    renderMagazinesGridConfig();
    updateSelectedMagazineDisplay();
    updateJSONPreview();
}

function selectAmmunitionForWeapon(ammunitionId) {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const ammunition = ammunitionsDataLoadout.find(a => a.id === ammunitionId);
    if (!ammunition) return;
    
    // Se já está selecionado, desselecionar
    if (weaponConfig.ammunition?.id === ammunitionId) {
        weaponConfig.ammunition = null;
    } else {
        // Selecionar (substitui o anterior se houver)
        weaponConfig.ammunition = {
            id: ammunition.id,
            name: ammunition.name,
            name_type: ammunition.name_type,
            slots: ammunition.slots,
            width: ammunition.width,
            height: ammunition.height
        };
    }
    
    renderAmmunitionsGridConfig();
    updateSelectedAmmunitionDisplay();
    updateJSONPreview();
}

function updateSelectedMagazineDisplay() {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    const container = $('#selectedMagazineListConfig');
    container.empty();
    
    if (!weaponConfig || !weaponConfig.magazine) {
        container.html('<span class="text-muted">Nenhum magazine selecionado</span>');
        return;
    }
    
    const mag = weaponConfig.magazine;
    const badge = $(`
        <span class="badge bg-primary me-2 mb-2" style="font-size: 0.9em;">
            ${mag.name}${mag.capacity ? ` (${mag.capacity} cap.)` : ''}
            <button class="btn-close btn-close-white ms-1" onclick="selectMagazineForWeapon(${mag.id})" style="font-size: 0.7em;"></button>
        </span>
    `);
    container.append(badge);
}

function updateSelectedAmmunitionDisplay() {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    const container = $('#selectedAmmunitionListConfig');
    container.empty();
    
    if (!weaponConfig || !weaponConfig.ammunition) {
        container.html('<span class="text-muted">Nenhuma munição selecionada</span>');
        return;
    }
    
    const ammo = weaponConfig.ammunition;
    const badge = $(`
        <span class="badge bg-primary me-2 mb-2" style="font-size: 0.9em;">
            ${ammo.name}
            <button class="btn-close btn-close-white ms-1" onclick="selectAmmunitionForWeapon(${ammo.id})" style="font-size: 0.7em;"></button>
        </span>
    `);
    container.append(badge);
}

function saveWeaponConfiguration() {
    // Os dados já estão atualizados nos objetos selectedWeapons
    // através das funções selectMagazineForWeapon, selectAmmunitionForWeapon e toggleAttachmentForWeapon
    
    const weaponType = $('#weaponConfigType').val();
    updateSelectedWeaponDisplay(weaponType);
    updateJSONPreview();
    
    const modalElement = document.getElementById('weaponConfigModal');
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
        modalInstance.hide();
    }
}

function validateWeaponRelationships(weaponId, relationships) {
    // Esta função valida se magazine, ammunition e attachments são compatíveis
    // A validação já é feita carregando apenas items compatíveis da API
    return true;
}

function updateSelectedWeaponDisplay(weaponType) {
    // weaponType: 'primary', 'secondary', ou 'small'
    const suffix = weaponType === 'primary' ? 'Primary' : (weaponType === 'secondary' ? 'Secondary' : 'Small');
    const container = $(`#selected${suffix}WeaponList`);
    container.empty();
    
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) {
        container.html('<span class="text-muted">Nenhuma arma selecionada</span>');
        return;
    }
    
    const weapon = weaponConfig.weapon;
    const magazine = weaponConfig.magazine;
    const ammunition = weaponConfig.ammunition;
    const attachments = weaponConfig.attachments || [];
    
    let attachmentsHtml = '';
    if (attachments.length > 0) {
        attachments.forEach(function(att) {
            attachmentsHtml += `
                <div class="d-inline-block me-2 mb-2 text-center">
                    <img src="${att.img || 'https://via.placeholder.com/60?text=No+Image'}" 
                         alt="${att.name}" 
                         class="img-thumbnail" 
                         style="width: 60px; height: 60px; object-fit: cover;"
                         onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
                    <div class="small text-muted">${att.name}</div>
                </div>
            `;
        });
    }
    
    const card = $(`
        <div class="card mb-2">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <img src="${weapon.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                 alt="${weapon.name}" 
                                 class="img-thumbnail me-3" 
                                 style="width: 80px; height: 80px; object-fit: cover;"
                                 onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                            <div>
                                <strong>${weapon.name}</strong>
                                <br>
                                <small class="text-muted">${weapon.name_type}</small>
                            </div>
                        </div>
                        
                        ${magazine ? `
                            <div class="mb-2">
                                <strong>Magazine:</strong>
                                <div class="d-flex align-items-center mt-1">
                                    <img src="${magazine.img || 'https://via.placeholder.com/50?text=No+Image'}" 
                                         alt="${magazine.name}" 
                                         class="img-thumbnail me-2" 
                                         style="width: 50px; height: 50px; object-fit: cover;"
                                         onerror="this.src='https://via.placeholder.com/50?text=No+Image'">
                                    <span>${magazine.name}${magazine.capacity ? ` (${magazine.capacity} cap.)` : ''}</span>
                                </div>
                            </div>
                        ` : '<div class="mb-2"><strong>Magazine:</strong> <span class="text-muted">Nenhum</span></div>'}
                        
                        ${ammunition ? `
                            <div class="mb-2">
                                <strong>Ammunition:</strong>
                                <div class="d-flex align-items-center mt-1">
                                    <img src="${ammunition.img || 'https://via.placeholder.com/50?text=No+Image'}" 
                                         alt="${ammunition.name}" 
                                         class="img-thumbnail me-2" 
                                         style="width: 50px; height: 50px; object-fit: cover;"
                                         onerror="this.src='https://via.placeholder.com/50?text=No+Image'">
                                    <span>${ammunition.name}</span>
                                </div>
                            </div>
                        ` : '<div class="mb-2"><strong>Ammunition:</strong> <span class="text-muted">Nenhum</span></div>'}
                        
                        ${attachments.length > 0 ? `
                            <div class="mb-2">
                                <strong>Attachments (${attachments.length}):</strong>
                                <div class="mt-1">
                                    ${attachmentsHtml}
                                </div>
                            </div>
                        ` : '<div class="mb-2"><strong>Attachments:</strong> <span class="text-muted">Nenhum</span></div>'}
                    </div>
                    <div class="ms-3">
                        <button class="btn btn-sm btn-primary me-1" onclick="openWeaponConfigModalWithData('${weaponType}')">
                            <i class="fas fa-cog"></i> Configurar
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="removeWeaponFromLoadout('${weaponType}')">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `);
    container.append(card);
    
    // Não chamar applyWeaponFiltersLoadout aqui para evitar recursão infinita
    // O grid será atualizado separadamente quando necessário (ao aplicar filtros)
}

function updateSelectedWeaponsDisplay() {
    // Atualizar display de todas as armas
    ['primary', 'secondary', 'small'].forEach(function(type) {
        updateSelectedWeaponDisplay(type);
    });
}

function removeWeaponFromLoadout(weaponType) {
    delete selectedWeapons[weaponType];
    updateSelectedWeaponsDisplay();
    updateJSONPreview();
}

// Funções para explosivos e items (continuarei no próximo passo devido ao limite de tamanho)
function applyExplosiveFiltersLoadout() {
    const search = $('#explosiveSearchLoadout').val().toLowerCase();
    
    let filtered = explosivesDataLoadout.filter(function(explosive) {
        if (search) {
            return explosive.name.toLowerCase().includes(search) || 
                   explosive.name_type.toLowerCase().includes(search);
        }
        return true;
    });
    
    renderExplosivesGridLoadout(filtered);
}

function renderExplosivesGridLoadout(data) {
    const grid = $('#explosivesGridLoadout');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum explosivo encontrado</div>');
        return;
    }
    
    data.forEach(function(explosive) {
        const isSelected = selectedExplosives.some(e => e.id === explosive.id);
        
        const card = $(`
            <div class="weapon-card ${isSelected ? 'selected' : ''}" data-explosive-id="${explosive.id}">
                <div class="weapon-actions">
                    <button class="btn btn-sm ${isSelected ? 'btn-warning' : 'btn-success'}" onclick="selectExplosiveForLoadout(${explosive.id})" title="${isSelected ? 'Editar quantidade' : 'Adicionar'}">
                        <i class="fas fa-${isSelected ? 'edit' : 'plus'}"></i>
                    </button>
                </div>
                <img src="${explosive.img || 'https://via.placeholder.com/120?text=No+Image'}" alt="${explosive.name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${explosive.name}</div>
                <div class="weapon-info">
                    ${explosive.name_type}<br>
                    ${explosive.slots} slots<br>
                    ${explosive.width}x${explosive.height}
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function selectExplosiveForLoadout(explosiveId) {
    const explosive = explosivesDataLoadout.find(e => e.id === explosiveId);
    if (!explosive) return;
    
    const existing = selectedExplosives.find(e => e.id === explosiveId);
    let quantity = 1;
    
    if (existing) {
        quantity = existing.quantity || 1;
    }
    
    const newQuantity = prompt(`Quantidade de "${explosive.name}":`, quantity);
    if (newQuantity === null) return;
    
    const qty = parseInt(newQuantity) || 1;
    
    if (existing) {
        existing.quantity = qty;
    } else {
        selectedExplosives.push({
            id: explosive.id,
            name: explosive.name,
            name_type: explosive.name_type,
            slots: explosive.slots,
            width: explosive.width,
            height: explosive.height,
            quantity: qty
        });
    }
    
    updateSelectedExplosivesDisplay();
    updateJSONPreview();
    applyExplosiveFiltersLoadout();
}

function updateSelectedExplosivesDisplay() {
    const container = $('#selectedExplosivesList');
    container.empty();
    
    if (selectedExplosives.length === 0) {
        container.html('<span class="text-muted">Nenhum explosivo selecionado</span>');
        return;
    }
    
    selectedExplosives.forEach(function(explosive) {
        const card = $(`
            <div class="card mb-2">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <img src="${explosive.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                 alt="${explosive.name}" 
                                 class="img-thumbnail me-3" 
                                 style="width: 80px; height: 80px; object-fit: cover;"
                                 onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                            <div>
                                <strong>${explosive.name}</strong> (x${explosive.quantity})
                                <br>
                                <small class="text-muted">${explosive.name_type}</small>
                            </div>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-primary me-1" onclick="editExplosiveQuantity(${explosive.id})">
                                <i class="fas fa-edit"></i> Quantidade
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="removeExplosiveFromLoadout(${explosive.id})">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        container.append(card);
    });
}

function editExplosiveQuantity(explosiveId) {
    const explosive = selectedExplosives.find(e => e.id === explosiveId);
    if (!explosive) return;
    
    const newQuantity = prompt(`Quantidade de "${explosive.name}":`, explosive.quantity);
    if (newQuantity === null) return;
    
    explosive.quantity = parseInt(newQuantity) || 1;
    updateSelectedExplosivesDisplay();
    updateJSONPreview();
}

function removeExplosiveFromLoadout(explosiveId) {
    const index = selectedExplosives.findIndex(e => e.id === explosiveId);
    if (index >= 0) {
        selectedExplosives.splice(index, 1);
        updateSelectedExplosivesDisplay();
        updateJSONPreview();
        applyExplosiveFiltersLoadout();
    }
}

// Funções para items (simplificadas por enquanto, subitems serão adicionados depois)
function applyItemFiltersLoadout() {
    const search = $('#itemSearchLoadout').val().toLowerCase();
    const typeId = $('#filterItemTypeLoadout').val();
    const location = $('#filterItemLocationLoadout').val();
    const storage = $('#filterItemStorageLoadout').val();
    
    let filtered = itemsDataLoadout.filter(function(item) {
        let match = true;
        
        if (search) {
            match = match && (item.name.toLowerCase().includes(search) || 
                             item.name_type.toLowerCase().includes(search));
        }
        
        if (typeId) {
            match = match && item.type_id == typeId;
        }
        
        if (location !== '') {
            match = match && item.localization === location;
        }
        
        if (storage === 'with') {
            match = match && item.storage_slots > 0;
        } else if (storage === 'without') {
            match = match && item.storage_slots === 0;
        }
        
        return match;
    });
    
    renderItemsGridLoadout(filtered);
}

function renderItemsGridLoadout(data) {
    const grid = $('#itemsGridLoadout');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum item encontrado</div>');
        return;
    }
    
    data.forEach(function(item) {
        const isSelected = selectedItems.some(i => i.id === item.id);
        
        const card = $(`
            <div class="weapon-card ${isSelected ? 'selected' : ''}" data-item-id="${item.id}">
                <div class="weapon-actions">
                    <button class="btn btn-sm ${isSelected ? 'btn-warning' : 'btn-success'}" onclick="selectItemForLoadout(${item.id}); event.stopPropagation(); return false;" title="${isSelected ? 'Configurar' : 'Adicionar'}">
                        <i class="fas fa-${isSelected ? 'cog' : 'plus'}"></i>
                    </button>
                </div>
                <img src="${item.img || 'https://via.placeholder.com/120?text=No+Image'}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${item.name}</div>
                <div class="weapon-info">
                    ${item.name_type}<br>
                    ${item.slots} slots<br>
                    ${item.width}x${item.height}
                    ${item.storage_slots > 0 ? `<br>Storage: ${item.storage_width}x${item.storage_height}` : ''}
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function selectItemForLoadout(itemId) {
    try {
        const item = itemsDataLoadout.find(i => i.id === itemId);
        if (!item) {
            showAlert('danger', 'Item não encontrado nos dados carregados');
            console.error('Item não encontrado:', itemId);
            return;
        }
        
        const existing = selectedItems.find(i => i.id === itemId);
        
        if (!existing) {
            // Carregar compatibilidade do item para subitems
            $.ajax({
                url: `/api/manage/items/${itemId}/compatibility`,
                method: 'GET',
                success: function(response) {
                    try {
                        const compatibility = response.compatibility || { children: [] };
                        
                        selectedItems.push({
                            id: item.id,
                            name: item.name,
                            name_type: item.name_type,
                            type_name: item.type_name || '',
                            slots: item.slots,
                            width: item.width,
                            height: item.height,
                            storage_slots: item.storage_slots || 0,
                            storage_width: item.storage_width || 0,
                            storage_height: item.storage_height || 0,
                            localization: item.localization || '',
                            subitems: [],
                            canHaveSubitems: compatibility.children && compatibility.children.length > 0,
                            compatibleChildren: compatibility.children || []
                        });
                        
                        updateSelectedItemsDisplay();
                        updateJSONPreview();
                        applyItemFiltersLoadout();
                    } catch (error) {
                        showAlert('danger', 'Erro ao processar compatibilidade do item: ' + error.message);
                        console.error('Erro ao processar resposta:', error);
                        // Adicionar item mesmo com erro
                        selectedItems.push({
                            id: item.id,
                            name: item.name,
                            name_type: item.name_type,
                            type_name: item.type_name || '',
                            slots: item.slots,
                            width: item.width,
                            height: item.height,
                            storage_slots: item.storage_slots || 0,
                            storage_width: item.storage_width || 0,
                            storage_height: item.storage_height || 0,
                            localization: item.localization || '',
                            subitems: [],
                            canHaveSubitems: false,
                            compatibleChildren: []
                        });
                        updateSelectedItemsDisplay();
                        updateJSONPreview();
                        applyItemFiltersLoadout();
                    }
                },
                error: function(xhr) {
                    // Adicionar mesmo sem compatibilidade (não é erro crítico)
                    console.warn('Não foi possível carregar compatibilidade do item, adicionando sem subitems:', xhr);
                    selectedItems.push({
                        id: item.id,
                        name: item.name,
                        name_type: item.name_type,
                        type_name: item.type_name || '',
                        slots: item.slots,
                        width: item.width,
                        height: item.height,
                        storage_slots: item.storage_slots || 0,
                        storage_width: item.storage_width || 0,
                        storage_height: item.storage_height || 0,
                        localization: item.localization || '',
                        subitems: [],
                        canHaveSubitems: false,
                        compatibleChildren: []
                    });
                    
                    updateSelectedItemsDisplay();
                    updateJSONPreview();
                    applyItemFiltersLoadout();
                }
            });
        } else {
            // Item já existe, mostrar mensagem ou abrir modal para adicionar subitems
            const itemIndex = selectedItems.findIndex(i => i.id === itemId);
            if (itemIndex >= 0) {
                const item = selectedItems[itemIndex];
                if (item.canHaveSubitems) {
                    openSubitemsModal(itemIndex);
                } else {
                    showAlert('info', 'Este item já está selecionado. Funcionalidade de subitems será implementada em breve.');
                }
            }
        }
    } catch (error) {
        showAlert('danger', 'Erro inesperado ao selecionar item: ' + error.message);
        console.error('Erro inesperado:', error);
    }
}

function validateItemCompatibility(parentItemId, childItemId) {
    // Verificar se childItem pode ser adicionado como subitem do parentItem
    const parentItem = selectedItems.find(i => i.id === parentItemId);
    if (!parentItem) return false;
    
    // Verificar se o childItem está na lista de compatibleChildren do parentItem
    const isCompatible = parentItem.compatibleChildren && 
                         parentItem.compatibleChildren.some(c => c.id === childItemId);
    
    return isCompatible;
}

function updateSelectedItemsDisplay() {
    const container = $('#selectedItemsList');
    container.empty();
    
    if (selectedItems.length === 0) {
        container.html('<span class="text-muted">Nenhum item selecionado</span>');
        return;
    }
    
    selectedItems.forEach(function(item, index) {
        const card = $(`
            <div class="card mb-2">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="d-flex align-items-center flex-grow-1">
                            <img src="${item.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                 alt="${item.name}" 
                                 class="img-thumbnail me-3" 
                                 style="width: 80px; height: 80px; object-fit: cover;"
                                 onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                            <div>
                                <strong>${item.name}</strong>
                                ${item.localization ? `<br><small class="text-muted">Localização: ${item.localization}</small>` : ''}
                                ${item.canHaveSubitems ? `<br><small class="text-info">Pode receber subitems</small>` : ''}
                                ${item.subitems && item.subitems.length > 0 ? `<br><small class="text-secondary">Subitems: ${item.subitems.length}</small>` : ''}
                            </div>
                        </div>
                        <div class="ms-3">
                            ${item.canHaveSubitems ? `
                                <button class="btn btn-sm btn-info me-1" onclick="openSubitemsModal(${index})">
                                    <i class="fas fa-layer-group"></i> Subitems
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-danger" onclick="removeItemFromLoadout(${index})">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        container.append(card);
    });
}

function removeItemFromLoadout(index) {
    selectedItems.splice(index, 1);
    updateSelectedItemsDisplay();
    updateJSONPreview();
    applyItemFiltersLoadout();
}

function openSubitemsModal(itemIndex) {
    // Modal para adicionar subitems recursivos será implementado depois
    // Por enquanto, apenas mostra mensagem
    const item = selectedItems[itemIndex];
    if (!item) return;
    
    if (!item.canHaveSubitems) {
        showAlert('info', 'Este item não pode receber subitems.');
        return;
    }
    
    // TODO: Implementar modal completo para subitems recursivos
    showAlert('info', `Funcionalidade de subitems para "${item.name}" será implementada em breve. O item já está na lista com suporte a subitems.`);
}

// ============================================================================
// MODO VISUAL - MONTAGEM DE JSON
// ============================================================================

function buildLoadoutFromVisual() {
    const loadout = {
        weapons: {
            primary_weapon: null,
            secondary_weapon: null,
            small_weapon: null
        },
        explosives: selectedExplosives.length > 0 ? [] : null,
        items: []
    };
    
    // Montar weapons
    ['primary', 'secondary', 'small'].forEach(function(type) {
        const weaponConfig = selectedWeapons[type];
        if (!weaponConfig) return;
        
        const weapon = weaponConfig.weapon;
        const weaponData = {
            name_type: weapon.name_type,
            feed_type: weapon.feed_type,
            slots: weapon.slots,
            width: weapon.width,
            height: weapon.height
        };
        
        // Adicionar magazine
        if (weaponConfig.magazine) {
            weaponData.magazine = {
                name_type: weaponConfig.magazine.name_type,
                capacity: weaponConfig.magazine.capacity,
                slots: weaponConfig.magazine.slots,
                width: weaponConfig.magazine.width,
                height: weaponConfig.magazine.height
            };
        }
        
        // Adicionar ammunition (note: no JSON é "ammunitions", não "ammunition")
        if (weaponConfig.ammunition) {
            weaponData.ammunitions = {
                name_type: weaponConfig.ammunition.name_type,
                slots: weaponConfig.ammunition.slots || 1,
                width: weaponConfig.ammunition.width || 1,
                height: weaponConfig.ammunition.height || 1
            };
        }
        
        // Adicionar attachments
        if (weaponConfig.attachments.length > 0) {
            weaponData.attachments = weaponConfig.attachments.map(function(att) {
                return {
                    name_type: att.name_type,
                    type: att.type,
                    slots: att.slots,
                    width: att.width,
                    height: att.height,
                    battery: att.battery || false
                };
            });
        }
        
        loadout.weapons[`${type}_weapon`] = weaponData;
    });
    
    // Montar explosives
    if (selectedExplosives.length > 0) {
        loadout.explosives = selectedExplosives.map(function(exp) {
            return {
                name_type: exp.name_type,
                slots: exp.slots,
                width: exp.width,
                height: exp.height,
                quantity: exp.quantity || 1
            };
        });
    }
    
    // Montar items (com subitems recursivos)
    loadout.items = buildItemsWithSubitems(selectedItems);
    
    return loadout;
}

function buildItemsWithSubitems(items) {
    return items.map(function(item) {
        const itemData = {
            name_type: item.name_type,
            type_name: item.type_name || '',
            slots: item.slots,
            width: item.width,
            height: item.height,
            storage_slots: item.storage_slots || 0,
            storage_width: item.storage_width || 0,
            storage_height: item.storage_height || 0,
            localization: item.localization || '',
            subitems: item.subitems && item.subitems.length > 0 ? buildItemsWithSubitems(item.subitems) : []
        };
        
        return itemData;
    });
}

function updateJSONPreview() {
    if (loadoutMode === 'visual') {
        const loadoutData = buildLoadoutFromVisual();
        $('#jsonPreview').val(JSON.stringify(loadoutData, null, 4));
    }
}

// Atualizar saveCustomLoadout para usar modo visual quando necessário
function saveCustomLoadout() {
    const id = $('#customLoadoutId').val();
    const name = $('#customLoadoutName').val();
    const isActive = $('#customLoadoutActive').val() === 'true';
    let loadoutData;
    
    // Se estiver no modo visual, montar JSON das seleções
    if (loadoutMode === 'visual') {
        // Validar estrutura antes de montar
        if (!validateLoadoutVisual()) {
            return;
        }
        loadoutData = buildLoadoutFromVisual();
    } else {
        // Modo JSON manual
        try {
            loadoutData = JSON.parse($('#customLoadoutData').val());
            // Validar estrutura
            if (!validateLoadoutStructure(loadoutData)) {
                showAlert('danger', 'Estrutura do loadout inválida');
                return;
            }
        } catch (e) {
            showAlert('danger', 'JSON inválido: ' + e.message);
            return;
        }
    }
    
    if (!name || !loadoutData) {
        showAlert('danger', 'Nome e dados do loadout são obrigatórios');
        return;
    }
    
    const url = id ? `/api/loadouts/custom/${id}` : '/api/loadouts/custom';
    const method = id ? 'PUT' : 'POST';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify({
            name: name,
            is_active: isActive,
            loadout_data: loadoutData
        }),
        success: function(response) {
            if (response.success) {
                // Redirecionar para página de listagem
                window.location.href = '/loadouts#custom-tab';
            } else {
                showAlert('danger', 'Erro: ' + response.message);
            }
        },
        error: function(xhr) {
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Erro ao salvar loadout';
            showAlert('danger', error);
            console.error('Erro:', xhr);
        }
    });
}

function validateLoadoutVisual() {
    // Validar que não há mais de uma arma de cada tipo
    let primaryCount = selectedWeapons.primary ? 1 : 0;
    let secondaryCount = selectedWeapons.secondary ? 1 : 0;
    let smallCount = selectedWeapons.small ? 1 : 0;
    
    if (primaryCount > 1 || secondaryCount > 1 || smallCount > 1) {
        showAlert('danger', 'Apenas uma arma de cada tipo pode ser selecionada (primary, secondary, small)');
        return false;
    }
    
    // Validar estrutura de weapons
    ['primary', 'secondary', 'small'].forEach(function(type) {
        const weaponConfig = selectedWeapons[type];
        if (weaponConfig) {
            // Validar que magazine e ammunition são compatíveis (já filtrados pela API)
            // Validar que attachments são compatíveis (já filtrados pela API)
        }
    });
    
    // Validar estrutura de explosives
    selectedExplosives.forEach(function(exp) {
        if (!exp.quantity || exp.quantity < 1) {
            showAlert('danger', `Quantidade inválida para explosivo "${exp.name}"`);
            return false;
        }
    });
    
    // Validar estrutura de items (subitems já validados por compatibilidade)
    // TODO: Validar subitems recursivos quando implementado
    
    return true;
}

