// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

// Loadouts protegidos que não podem ser renomeados, desativados ou deletados
const PROTECTED_LOADOUTS = ['admin', 'deathmatch'];

let customLoadoutsTable;
let playerLoadoutsTable;
let allPlayers = [];
let selectedPlayerId = null;

// Variáveis para modo visual de loadouts
let loadoutMode = 'visual'; // 'visual' ou 'json'
let selectedWeapons = {}; // { primary: {...}, secondary: {...}, small: {...} }
let selectedExplosives = []; // [{id, name, name_type, quantity, slots, width, height}]
let selectedItems = []; // [{id, name, name_type, ...compatibilidade...}]
let loadoutHasChanges = false; // Controla se há alterações não salvas

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
        // Botões de salvar (topo e final)
        $('#btnSaveCustomLoadout').on('click', saveCustomLoadout);
        $('#btnSaveCustomLoadoutTop').on('click', saveCustomLoadout);
        
        // Event listeners para botões JSON serão adicionados dinamicamente conforme tipo
        
        // Detectar tipo de loadout
        const loadoutType = $('#loadoutType').val() || 'custom';
        
        // Detectar alterações nos campos básicos conforme tipo
        if (loadoutType === 'player') {
            $('#playerLoadoutId').on('input change', markLoadoutChanged);
            $('#playerLoadoutName').on('input change', markLoadoutChanged);
            $('#playerLoadoutActive').on('change', markLoadoutChanged);
            $('#playerLoadoutData').on('input', function() {
                if (loadoutMode === 'json') {
                    markLoadoutChanged();
                }
            });
            // Event listeners para botões JSON de player
            $('#btnValidatePlayerJSON').on('click', () => validateJSON('player'));
            $('#btnFormatPlayerJSON').on('click', () => formatJSON('player'));
        } else {
            $('#customLoadoutName').on('input change', markLoadoutChanged);
            $('#customLoadoutActive').on('change', markLoadoutChanged);
            $('#customLoadoutData').on('input', function() {
                if (loadoutMode === 'json') {
                    markLoadoutChanged();
                }
            });
            // Event listeners para botões JSON de custom
            $('#btnValidateCustomJSON').on('click', () => validateJSON('custom'));
            $('#btnFormatCustomJSON').on('click', () => formatJSON('custom'));
        }
        
        // Detectar mudanças no modo (visual/JSON)
        $('input[name="loadoutMode"]').on('change', markLoadoutChanged);
        
        // Confirmação ao tentar sair da página
        window.addEventListener('beforeunload', function(e) {
            if (loadoutHasChanges) {
                e.preventDefault();
                e.returnValue = ''; // Chrome requer returnValue
                return ''; // Alguns browsers
            }
        });
        
        // Carregar dados se estiver na página de edição
        const currentLoadoutType = $('#loadoutType').val() || 'custom';
        if (currentLoadoutType === 'player') {
            const playerId = $('#playerLoadoutPlayerId').val();
            const loadoutId = $('#playerLoadoutLoadoutId').val();
            if (playerId && loadoutId) {
                // Está editando loadout de player, carregar dados
                loadPlayerLoadoutForEdit(playerId, parseInt(loadoutId));
            } else if (playerId) {
                // Novo loadout de player, não precisa calcular ID (será gerado pela API)
                resetLoadoutForm();
                loadoutHasChanges = false;
                updateChangesIndicator();
            } else {
                // Sem player_id, apenas resetar
                resetLoadoutForm();
                loadoutHasChanges = false;
                updateChangesIndicator();
            }
        } else {
            const loadoutId = $('#customLoadoutId').val();
            if (loadoutId) {
                // Está editando loadout custom, carregar dados
                loadLoadoutForEdit(loadoutId);
            } else {
                // Novo loadout custom, resetar
                resetLoadoutForm();
                loadoutHasChanges = false;
                updateChangesIndicator();
            }
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
    const currentLoadoutType = $('#loadoutType').val() || 'custom';
    if ($('#customLoadoutId').length > 0 || $('#playerLoadoutPlayerId').length > 0 || window.location.pathname.includes('/loadouts/')) {
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
    
    // Event listeners - Subitems modal
    // Usar função intermediária que sempre chama window.saveSubitemsConfiguration
    // Isso garante que o wrapper (quando criado) ou a função original seja sempre usada
    $('#btnSaveSubitems').on('click', function() {
        if (window.saveSubitemsConfiguration) {
            window.saveSubitemsConfiguration();
        } else {
            saveSubitemsConfiguration();
        }
    });
    
    // Event listeners - Filtros de explosivos
    $('#explosiveSearchLoadout').on('input', applyExplosiveFiltersLoadout);
    
    // Event listeners - Filtros de items
    $('#itemSearchLoadout').on('input', applyItemFiltersLoadout);
    $('#filterItemTypeLoadout').on('change', applyItemFiltersLoadout);
    $('#filterItemLocationLoadout').on('change', applyItemFiltersLoadout);
    $('#filterItemStorageLoadout').on('change', applyItemFiltersLoadout);
    
    // Event listeners - Player Loadouts
    $('#playerSelect').on('change', onPlayerSelectChange);
    $('#btnAddPlayerLoadout').on('click', function() {
        if (!selectedPlayerId) {
            showAlert('warning', 'Selecione um jogador primeiro');
            return;
        }
        // Redirecionar para página de criação visual
        window.location.href = `/loadouts/players/${selectedPlayerId}/new`;
    });
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
// FUNÇÕES AUXILIARES - DETECÇÃO DE ALTERAÇÕES
// ============================================================================

function markLoadoutChanged() {
    loadoutHasChanges = true;
    updateChangesIndicator();
}

function updateChangesIndicator() {
    const indicator = $('#loadoutChangesIndicator');
    if (indicator.length > 0) {
        if (loadoutHasChanges) {
            indicator.show();
        } else {
            indicator.hide();
        }
    }
}

function handleCancelLoadout() {
    if (loadoutHasChanges) {
        if (!confirm('Você tem alterações não salvas. Tem certeza que deseja cancelar?')) {
            return false;
        }
    }
    // Redirecionar para página de listagem
    window.location.href = '/loadouts#custom-tab';
    return false;
}

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
            { 
                data: 'name', 
                width: '25%',
                render: function(data, type, row) {
                    const isProtected = PROTECTED_LOADOUTS.includes(data.toLowerCase());
                    return data + (isProtected ? ' <span class="badge bg-warning" title="Loadout protegido"><i class="fas fa-shield-alt"></i></span>' : '');
                }
            },
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
                    const isProtected = PROTECTED_LOADOUTS.includes(row.name.toLowerCase());
                    const deleteButton = isProtected ? '' : `<button class="btn btn-sm btn-danger" onclick="deleteCustomLoadout(${row.id}, '${row.name.replace(/'/g, "\\'")}')" title="Deletar">
                            <i class="fas fa-trash"></i>
                        </button>`;
                    return `
                        <button class="btn btn-sm btn-primary me-1" onclick="editCustomLoadout(${row.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${deleteButton}
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
                        <button class="btn btn-sm btn-primary me-1" onclick="editPlayerLoadout('${row.player_id}', ${row.loadout_id}, ${row.id})" title="Editar Visual">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary me-1" onclick="editPlayerLoadoutModal('${row.player_id}', ${row.loadout_id}, ${row.id})" title="Editar JSON">
                            <i class="fas fa-code"></i>
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
    const loadoutType = $('#loadoutType').val() || 'custom';
    
    if (loadoutType === 'player') {
        // Resetar campos de player loadout
        $('#playerLoadoutId').val('');
        $('#playerLoadoutName').val('');
        $('#playerLoadoutActive').val('false');
        $('#playerLoadoutData').val(JSON.stringify(window.defaultLoadoutTemplate, null, 4));
        $('#playerJSONValidation').empty();
    } else {
        // Resetar dados custom
        $('#customLoadoutName').val('');
        $('#customLoadoutActive').val('false');
        $('#customLoadoutData').val(JSON.stringify(window.defaultLoadoutTemplate, null, 4));
        $('#customJSONValidation').empty();
        
        // Remover aviso de loadout protegido se existir
        $('#protectedLoadoutWarning').remove();
        
        // Resetar campos para editável
        $('#customLoadoutName').prop('readonly', false);
        $('#customLoadoutActive').prop('disabled', false);
    }
    
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
                const isProtected = PROTECTED_LOADOUTS.includes(loadout.name.toLowerCase());
                
                $('#customLoadoutId').val(loadout.id);
                $('#customLoadoutName').val(loadout.name);
                $('#customLoadoutActive').val(loadout.is_active ? 'true' : 'false');
                $('#customLoadoutData').val(JSON.stringify(loadout.loadout_data, null, 4));
                $('#customJSONValidation').empty();
                
                // Se for loadout protegido, desabilitar campos de nome e status
                if (isProtected) {
                    $('#customLoadoutName').prop('readonly', true);
                    $('#customLoadoutActive').prop('disabled', true);
                    // Adicionar aviso visual
                    if ($('#protectedLoadoutWarning').length === 0) {
                        $('#customLoadoutName').after('<div id="protectedLoadoutWarning" class="alert alert-warning mt-2"><i class="fas fa-shield-alt"></i> Este é um loadout protegido. Nome e status não podem ser alterados.</div>');
                    }
                } else {
                    $('#customLoadoutName').prop('readonly', false);
                    $('#customLoadoutActive').prop('disabled', false);
                    $('#protectedLoadoutWarning').remove();
                }
                
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
                    // Resetar flag de alterações após carregar dados
                    loadoutHasChanges = false;
                    updateChangesIndicator();
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

function loadPlayerLoadoutForEdit(playerId, loadoutId) {
    $.ajax({
        url: `/api/loadouts/players/${playerId}`,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const loadout = response.loadouts.find(l => l.loadout_id === loadoutId);
                if (!loadout) {
                    showAlert('danger', 'Loadout não encontrado');
                    return;
                }
                
                // O ID do banco (db_id) está em loadout.id
                $('#playerLoadoutPlayerId').val(playerId);
                $('#playerLoadoutLoadoutId').val(loadout.id); // ID do banco
                $('#playerLoadoutId').val(loadout.loadout_id); // ID interno do loadout
                $('#playerLoadoutName').val(loadout.name);
                $('#playerLoadoutActive').val(loadout.is_active ? 'true' : 'false');
                $('#playerLoadoutData').val(JSON.stringify(loadout.loadout_data, null, 4));
                $('#playerJSONValidation').empty();
                
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
                    // Resetar flag de alterações após carregar dados
                    loadoutHasChanges = false;
                    updateChangesIndicator();
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
    const loadoutType = $('#loadoutType').val() || 'custom';
    const jsonTextarea = loadoutType === 'player' ? '#playerLoadoutData' : '#customLoadoutData';
    
    if (loadoutMode === 'visual') {
        $('#visualModeContent').show();
        $('#jsonModeContent').hide();
    } else {
        $('#visualModeContent').hide();
        $('#jsonModeContent').show();
        // Se carregou do modo visual, montar JSON antes de mostrar
        if (selectedWeapons || selectedExplosives.length > 0 || selectedItems.length > 0) {
            const loadoutData = buildLoadoutFromVisual();
            $(jsonTextarea).val(JSON.stringify(loadoutData, null, 4));
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
    
    // Carregar relationships da arma para obter componentes compatíveis
    $.ajax({
        url: `/api/manage/weapons/${weapon.id}`,
        method: 'GET',
        success: function(response) {
            try {
                if (!response || !response.relationships) {
                    // Se não houver relationships, tentar carregar componentes sem eles
                    loadComponentsAfterLoad(weapon.id, type, weaponData, {});
                    return;
                }
                
                const relationships = response.relationships;
                
                // Carregar componentes compatíveis usando callback
                loadCompatibleItemsForWeapon(weapon.id, relationships, function() {
                    loadComponentsAfterLoad(weapon.id, type, weaponData, relationships);
                });
            } catch (error) {
                console.error('Erro ao processar relationships da arma:', error);
                // Tentar carregar componentes mesmo com erro
                loadComponentsAfterLoad(weapon.id, type, weaponData, {});
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar relationships da arma:', xhr);
            // Tentar carregar componentes mesmo com erro
            loadComponentsAfterLoad(weapon.id, type, weaponData, {});
        }
    });
}

function loadComponentsAfterLoad(weaponId, type, weaponData, relationships) {
    // Carregar magazine se existir
    if (weaponData.magazine) {
        const magazine = magazinesDataLoadout.find(m => m.name_type === weaponData.magazine.name_type);
        if (magazine) {
            selectedWeapons[type].magazine = {
                id: magazine.id,
                name: magazine.name,
                name_type: magazine.name_type,
                capacity: magazine.capacity,
                slots: magazine.slots,
                width: magazine.width,
                height: magazine.height,
                img: magazine.img || '',
                quantity: weaponData.magazine.quantity || 1,
                max_quantity: magazine.max_quantity || null
            };
        } else {
            // Armazenar dados mesmo sem encontrar no banco
            selectedWeapons[type].magazine = {
                name: weaponData.magazine.name_type || 'Magazine',
                name_type: weaponData.magazine.name_type,
                capacity: weaponData.magazine.capacity,
                slots: weaponData.magazine.slots,
                width: weaponData.magazine.width,
                height: weaponData.magazine.height,
                quantity: weaponData.magazine.quantity || 1
            };
        }
    }
    
    // Carregar ammunition se existir
    if (weaponData.ammunitions) {
        const ammunition = ammunitionsDataLoadout.find(a => a.name_type === weaponData.ammunitions.name_type);
        if (ammunition) {
            selectedWeapons[type].ammunition = {
                id: ammunition.id,
                name: ammunition.name,
                name_type: ammunition.name_type,
                slots: ammunition.slots,
                width: ammunition.width,
                height: ammunition.height,
                // Usar img do banco, mas se não tiver, tentar usar do weaponData como fallback
                img: ammunition.img || weaponData.ammunitions.img || '',
                quantity: weaponData.ammunitions.quantity || 1,
                max_quantity: ammunition.max_quantity || null
            };
        } else {
            selectedWeapons[type].ammunition = {
                name: weaponData.ammunitions.name_type || 'Ammunition',
                name_type: weaponData.ammunitions.name_type,
                slots: weaponData.ammunitions.slots,
                width: weaponData.ammunitions.width,
                height: weaponData.ammunitions.height,
                img: weaponData.ammunitions.img || null,
                quantity: weaponData.ammunitions.quantity || 1
            };
        }
    }
    
    // Carregar attachments se existirem
    if (weaponData.attachments && Array.isArray(weaponData.attachments)) {
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
                    battery: att.battery || false,
                    img: att.img || null,
                    quantity: attData.quantity || 1,
                    max_quantity: att.max_quantity || null
                });
            } else {
                selectedWeapons[type].attachments.push({
                    name: attData.name_type || 'Attachment',
                    name_type: attData.name_type,
                    type: attData.type,
                    slots: attData.slots,
                    width: attData.width,
                    height: attData.height,
                    battery: attData.battery || false,
                    img: null,
                    quantity: attData.quantity || 1
                });
            }
        });
    }
    
    // Atualizar display após carregar todos os componentes
    updateSelectedWeaponDisplay(type);
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
                quantity: expData.quantity || 1,
                img: explosive.img || null
            });
        } else {
            selectedExplosives.push({
                name_type: expData.name_type,
                slots: expData.slots,
                width: expData.width,
                height: expData.height,
                quantity: expData.quantity || 1,
                img: null
            });
        }
    });
    updateSelectedExplosivesDisplay();
}

// Função auxiliar recursiva para carregar subitems
function loadSubitemsToVisual(subitemsData, itemsDataLoadout) {
    if (!subitemsData || !Array.isArray(subitemsData) || subitemsData.length === 0) {
        return [];
    }
    
    return subitemsData.map(function(subitemData) {
        const subitem = itemsDataLoadout.find(i => i.name_type === subitemData.name_type);
        
        if (subitem) {
            // Carregar subitems recursivamente se existirem
            const loadedSubitems = loadSubitemsToVisual(subitemData.subitems, itemsDataLoadout);
            
            return {
                id: subitem.id,
                name: subitem.name,
                name_type: subitem.name_type,
                type_name: subitem.type_name || subitemData.type_name || '',
                slots: subitem.slots,
                width: subitem.width,
                height: subitem.height,
                storage_slots: subitem.storage_slots || 0,
                storage_width: subitem.storage_width || 0,
                storage_height: subitem.storage_height || 0,
                localization: subitem.localization || subitemData.localization || '',
                subitems: loadedSubitems,
                canHaveSubitems: false, // Será atualizado quando necessário
                compatibleChildren: [],
                img: subitem.img || null
            };
        } else {
            // Item não encontrado, usar dados do JSON
            return {
                name_type: subitemData.name_type,
                type_name: subitemData.type_name || '',
                slots: subitemData.slots,
                width: subitemData.width,
                height: subitemData.height,
                storage_slots: subitemData.storage_slots || 0,
                storage_width: subitemData.storage_width || 0,
                storage_height: subitemData.storage_height || 0,
                localization: subitemData.localization || '',
                subitems: loadSubitemsToVisual(subitemData.subitems, itemsDataLoadout),
                canHaveSubitems: false,
                compatibleChildren: [],
                img: null
            };
        }
    });
}

function loadItemsToVisual(itemsData) {
    // Processar items sequencialmente para garantir que subitems sejam carregados corretamente
    let processedCount = 0;
    const totalItems = itemsData.length;
    
    if (totalItems === 0) {
        updateSelectedItemsDisplay();
        return;
    }
    
    itemsData.forEach(function(itemData) {
        const item = itemsDataLoadout.find(i => i.name_type === itemData.name_type);
        if (item) {
            // Carregar compatibilidade
            $.ajax({
                url: `/api/manage/items/${item.id}/compatibility`,
                method: 'GET',
                success: function(response) {
                    const compatibility = response.compatibility || { children: [] };
                    
                    // Carregar subitems recursivamente se existirem
                    const loadedSubitems = loadSubitemsToVisual(itemData.subitems, itemsDataLoadout);
                    
                    // Para cada subitem carregado, buscar compatibilidade se necessário
                    if (loadedSubitems.length > 0) {
                        let subitemsProcessed = 0;
                        loadedSubitems.forEach(function(subitem, index) {
                            if (subitem.id) {
                                $.ajax({
                                    url: `/api/manage/items/${subitem.id}/compatibility`,
                                    method: 'GET',
                                    success: function(subResponse) {
                                        const subCompatibility = subResponse.compatibility || { children: [] };
                                        loadedSubitems[index].canHaveSubitems = subCompatibility.children && subCompatibility.children.length > 0;
                                        loadedSubitems[index].compatibleChildren = subCompatibility.children || [];
                                        subitemsProcessed++;
                                        if (subitemsProcessed === loadedSubitems.length) {
                                            finishLoadingItem(item, itemData, compatibility, loadedSubitems);
                                        }
                                    },
                                    error: function() {
                                        loadedSubitems[index].canHaveSubitems = false;
                                        loadedSubitems[index].compatibleChildren = [];
                                        subitemsProcessed++;
                                        if (subitemsProcessed === loadedSubitems.length) {
                                            finishLoadingItem(item, itemData, compatibility, loadedSubitems);
                                        }
                                    }
                                });
                            } else {
                                subitemsProcessed++;
                                if (subitemsProcessed === loadedSubitems.length) {
                                    finishLoadingItem(item, itemData, compatibility, loadedSubitems);
                                }
                            }
                        });
                    } else {
                        finishLoadingItem(item, itemData, compatibility, loadedSubitems);
                    }
                },
                error: function() {
                    // Carregar subitems mesmo sem compatibilidade
                    const loadedSubitems = loadSubitemsToVisual(itemData.subitems, itemsDataLoadout);
                    finishLoadingItem(item, itemData, { children: [] }, loadedSubitems);
                }
            });
        } else {
            // Item não encontrado, usar dados do JSON
            const loadedSubitems = loadSubitemsToVisual(itemData.subitems, itemsDataLoadout);
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
                subitems: loadedSubitems,
                canHaveSubitems: false,
                compatibleChildren: [],
                img: null,
                quantity: itemData.quantity || 1
            });
            processedCount++;
            if (processedCount === totalItems) {
                updateSelectedItemsDisplay();
            }
        }
    });
    
    function finishLoadingItem(item, itemData, compatibility, loadedSubitems) {
        // Buscar max_quantity do item se for loadout de player
        const loadoutType = $('#loadoutType').val() || 'custom';
        const isPlayerLoadout = loadoutType === 'player';
        let maxQuantity = null;
        
        if (isPlayerLoadout) {
            const itemInData = itemsDataLoadout.find(i => i.id === item.id);
            if (itemInData) {
                maxQuantity = itemInData.max_quantity || null;
            }
        }
        
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
            subitems: loadedSubitems,
            canHaveSubitems: compatibility.children && compatibility.children.length > 0,
            compatibleChildren: compatibility.children || [],
            img: item.img || null,
            quantity: itemData.quantity || 1,
            max_quantity: maxQuantity
        });
        
        processedCount++;
        if (processedCount === totalItems) {
            updateSelectedItemsDisplay();
        }
    }
}

// Função saveCustomLoadout antiga removida - agora usa página dedicada

function deleteCustomLoadout(id, name) {
    // Verificar se é loadout protegido
    if (PROTECTED_LOADOUTS.includes(name.toLowerCase())) {
        showAlert('warning', 'Loadouts protegidos não podem ser deletados');
        return;
    }
    
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
                    select.append(`<option value="${player.PlayerID}">${displayName} (${player.SteamName})</option>`);
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
    // Redirecionar para página de edição visual
    window.location.href = `/loadouts/players/${playerId}/${loadoutId}/edit`;
}

function editPlayerLoadoutModal(playerId, loadoutId, dbId) {
    // Abrir modal JSON (função original)
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
    // Verificar se é loadout de player para usar endpoints filtrados
    const loadoutType = $('#loadoutType').val() || 'custom';
    const url = loadoutType === 'player' ? '/api/loadouts/players/weapons' : '/api/manage/weapons';
    
    $.ajax({
        url: url,
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
    // Verificar se é loadout de player para usar endpoints filtrados
    const loadoutType = $('#loadoutType').val() || 'custom';
    const url = loadoutType === 'player' ? '/api/loadouts/players/explosives' : '/api/manage/explosives';
    
    $.ajax({
        url: url,
        method: 'GET',
        success: function(response) {
            explosivesDataLoadout = response.explosives;
            // Carregar limite global se for loadout de player
            if (loadoutType === 'player') {
                loadExplosivesGlobalLimit();
            }
            applyExplosiveFiltersLoadout();
        },
        error: function(xhr) {
            console.error('Erro ao carregar explosivos:', xhr);
        }
    });
}

function loadItemsForLoadout() {
    // Verificar se é loadout de player para usar endpoints filtrados
    const loadoutType = $('#loadoutType').val() || 'custom';
    const url = loadoutType === 'player' ? '/api/loadouts/players/items' : '/api/manage/items';
    
    $.ajax({
        url: url,
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

function loadExplosivesGlobalLimit() {
    $.ajax({
        url: '/api/loadouts/players/explosives-global',
        method: 'GET',
        success: function(response) {
            if (response.success && response.limit) {
                window.explosivesGlobalLimit = response.limit.max_total_quantity || 0;
            } else {
                window.explosivesGlobalLimit = 0;
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar limite global de explosivos:', xhr);
            window.explosivesGlobalLimit = 0;
        }
    });
}

function loadItemTypesForLoadout() {
    // Verificar se é loadout de player para usar endpoint filtrado (sem tipos banidos)
    const loadoutType = $('#loadoutType').val() || 'custom';
    const url = loadoutType === 'player' ? '/api/loadouts/players/item-types' : '/api/manage/item-types';
    
    $.ajax({
        url: url,
        method: 'GET',
        success: function(response) {
            // Para player loadouts, response tem 'types', para custom tem 'types' também
            const types = response.types || [];
            itemTypesDataLoadout = types;
            const select = $('#filterItemTypeLoadout');
            select.empty();
            select.append('<option value="">Todos os Tipos</option>');
            types.forEach(function(type) {
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
                        markLoadoutChanged();
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
    // Verificar se é loadout de player para usar endpoints filtrados
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let magazinesLoaded = false;
    let ammunitionsLoaded = false;
    let attachmentsLoaded = false;
    
    function checkAllLoaded() {
        if (magazinesLoaded && ammunitionsLoaded && attachmentsLoaded && callback) {
            callback();
        }
    }
    
    // Para loadouts de players, usar endpoints filtrados que já aplicam as regras
    if (isPlayerLoadout) {
        // Carregar magazines filtrados
        $.ajax({
            url: `/api/loadouts/players/magazines?weapon_id=${weaponId}&limit=500`,
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
        
        // Carregar ammunitions filtrados
        $.ajax({
            url: `/api/loadouts/players/ammunitions?weapon_id=${weaponId}&limit=500`,
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
        
        // Carregar attachments filtrados
        $.ajax({
            url: `/api/loadouts/players/attachments?weapon_id=${weaponId}&limit=500`,
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
    } else {
        // Para loadouts custom, usar relacionamentos retornados pela API
        // Carregar magazines compatíveis usando relationships
        if (relationships && relationships.magazines !== undefined) {
            magazinesDataLoadout = relationships.magazines || [];
            magazinesLoaded = true;
            checkAllLoaded();
        } else {
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
        if (relationships && relationships.ammunitions !== undefined) {
            ammunitionsDataLoadout = relationships.ammunitions || [];
            ammunitionsLoaded = true;
            checkAllLoaded();
        } else {
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
        if (relationships && relationships.attachments !== undefined) {
            attachmentsDataLoadout = relationships.attachments || [];
            attachmentsLoaded = true;
            checkAllLoaded();
        } else {
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
}

function openWeaponConfigModalWithData(weaponType) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const weapon = weaponConfig.weapon;
    $('#weaponConfigId').val(weapon.id);
    $('#weaponConfigType').val(weaponType);
    $('#weaponConfigName').text(weapon.name);
    
    // Carregar componentes compatíveis da arma correta antes de abrir o modal
    $.ajax({
        url: `/api/manage/weapons/${weapon.id}`,
        method: 'GET',
        success: function(response) {
            try {
                if (!response || !response.relationships) {
                    // Se não houver relationships, usar arrays globais existentes
                    renderModalContent();
                    return;
                }
                
                const relationships = response.relationships;
                
                // Carregar componentes compatíveis usando callback
                loadCompatibleItemsForWeapon(weapon.id, relationships, function() {
                    // Após carregar os dados corretos, renderizar o modal
                    renderModalContent();
                });
            } catch (error) {
                console.error('Erro ao processar relationships da arma no modal:', error);
                // Renderizar modal mesmo com erro
                renderModalContent();
            }
        },
        error: function(xhr) {
            console.error('Erro ao carregar relationships da arma no modal:', xhr);
            // Renderizar modal mesmo com erro
            renderModalContent();
        }
    });
    
    function renderModalContent() {
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
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    const index = weaponConfig.attachments.findIndex(a => a.id === attachmentId);
    
    if (index >= 0) {
        // Se já está selecionado, permitir editar quantidade
        editAttachmentQuantity(attachmentId);
    } else {
        // Validar que não há outro attachment do mesmo tipo
        const existingSameType = weaponConfig.attachments.find(a => a.type === attachment.type);
        if (existingSameType) {
            showAlert('warning', `Já existe um attachment do tipo "${attachment.type}" selecionado. Remova o existente antes de adicionar outro.`);
            return;
        }
        
        let quantity = 1;
        let promptMessage = `Quantidade de "${attachment.name}":`;
        if (isPlayerLoadout) {
            const maxQty = attachment.max_quantity;
            
            if (maxQty) {
                promptMessage += `\n(Máximo: ${maxQty})`;
            }
        }
        
        const newQuantity = prompt(promptMessage, quantity);
        if (newQuantity === null) return;
        
        const qty = parseInt(newQuantity) || 1;
        
        // Validações para loadouts de players
        if (isPlayerLoadout) {
            // Validar quantidade máxima individual
            if (attachment.max_quantity && qty > attachment.max_quantity) {
                showAlert('danger', `Quantidade máxima permitida para este attachment é ${attachment.max_quantity}`);
                return;
            }
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
            battery: attachment.battery || false,
            img: attachment.img || '',
            quantity: qty,
            max_quantity: attachment.max_quantity || null
        });
    }
    
    renderAttachmentsGridConfig();
    updateSelectedAttachmentsDisplay();
    updateJSONPreview();
    markLoadoutChanged();
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
                ${att.name || att.name_type || 'Attachment'} (${att.type || 'Attachment'}) (Qtd: ${att.quantity || 1})
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
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    // Se já está selecionado, permitir editar quantidade
    if (weaponConfig.magazine?.id === magazineId) {
        editMagazineQuantity();
        return;
    }
    
    let quantity = 1;
    let promptMessage = `Quantidade de "${magazine.name}":`;
    if (isPlayerLoadout) {
        const maxQty = magazine.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, quantity);
    if (newQuantity === null) return;
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (magazine.max_quantity && qty > magazine.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este magazine é ${magazine.max_quantity}`);
            return;
        }
    }
    
    // Selecionar (substitui o anterior se houver)
    weaponConfig.magazine = {
        id: magazine.id,
        name: magazine.name,
        name_type: magazine.name_type,
        capacity: magazine.capacity,
        slots: magazine.slots,
        width: magazine.width,
        height: magazine.height,
        img: magazine.img || '',
        quantity: qty,
        max_quantity: magazine.max_quantity || null
    };
    
    renderMagazinesGridConfig();
    updateSelectedMagazineDisplay();
    updateJSONPreview();
    markLoadoutChanged();
}

function selectAmmunitionForWeapon(ammunitionId) {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return;
    
    const ammunition = ammunitionsDataLoadout.find(a => a.id === ammunitionId);
    if (!ammunition) return;
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    // Se já está selecionado, permitir editar quantidade
    if (weaponConfig.ammunition?.id === ammunitionId) {
        editAmmunitionQuantity();
        return;
    }
    
    let quantity = 1;
    let promptMessage = `Quantidade de "${ammunition.name}":`;
    if (isPlayerLoadout) {
        const maxQty = ammunition.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, quantity);
    if (newQuantity === null) return;
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (ammunition.max_quantity && qty > ammunition.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para esta ammunition é ${ammunition.max_quantity}`);
            return;
        }
    }
    
    // Selecionar (substitui o anterior se houver)
    weaponConfig.ammunition = {
        id: ammunition.id,
        name: ammunition.name,
        name_type: ammunition.name_type,
        slots: ammunition.slots,
        width: ammunition.width,
        height: ammunition.height,
        img: ammunition.img || '',
        quantity: qty,
        max_quantity: ammunition.max_quantity || null
    };
    
    renderAmmunitionsGridConfig();
    updateSelectedAmmunitionDisplay();
    updateJSONPreview();
    markLoadoutChanged();
}

function editMagazineQuantity() {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig || !weaponConfig.magazine) return false;
    
    const magazine = weaponConfig.magazine;
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${magazine.name}":`;
    if (isPlayerLoadout) {
        const maxQty = magazine.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, magazine.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (magazine.max_quantity && qty > magazine.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este magazine é ${magazine.max_quantity}`);
            return false;
        }
    }
    
    magazine.quantity = qty;
    updateSelectedMagazineDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function editAmmunitionQuantity() {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig || !weaponConfig.ammunition) return false;
    
    const ammunition = weaponConfig.ammunition;
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${ammunition.name}":`;
    if (isPlayerLoadout) {
        const maxQty = ammunition.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, ammunition.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (ammunition.max_quantity && qty > ammunition.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para esta ammunition é ${ammunition.max_quantity}`);
            return false;
        }
    }
    
    ammunition.quantity = qty;
    updateSelectedAmmunitionDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function editAttachmentQuantity(attachmentId) {
    const weaponType = $('#weaponConfigType').val();
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return false;
    
    const attachment = weaponConfig.attachments.find(a => a.id === attachmentId);
    if (!attachment) return false;
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${attachment.name}":`;
    if (isPlayerLoadout) {
        const maxQty = attachment.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, attachment.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (attachment.max_quantity && qty > attachment.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este attachment é ${attachment.max_quantity}`);
            return false;
        }
    }
    
    attachment.quantity = qty;
    updateSelectedAttachmentsDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function editMagazineQuantityForWeapon(weaponType) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig || !weaponConfig.magazine) return false;
    
    const magazine = weaponConfig.magazine;
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${magazine.name || magazine.name_type || 'Magazine'}":`;
    if (isPlayerLoadout) {
        const maxQty = magazine.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, magazine.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (magazine.max_quantity && qty > magazine.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este magazine é ${magazine.max_quantity}`);
            return false;
        }
    }
    
    magazine.quantity = qty;
    updateSelectedWeaponDisplay(weaponType);
    
    // Atualizar também o display do modal se estiver aberto
    const currentWeaponType = $('#weaponConfigType').val();
    if (currentWeaponType === weaponType) {
        updateSelectedMagazineDisplay();
    }
    
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function editAmmunitionQuantityForWeapon(weaponType) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig || !weaponConfig.ammunition) return false;
    
    const ammunition = weaponConfig.ammunition;
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${ammunition.name || ammunition.name_type || 'Ammunition'}":`;
    if (isPlayerLoadout) {
        const maxQty = ammunition.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, ammunition.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (ammunition.max_quantity && qty > ammunition.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para esta ammunition é ${ammunition.max_quantity}`);
            return false;
        }
    }
    
    ammunition.quantity = qty;
    updateSelectedWeaponDisplay(weaponType);
    
    // Atualizar também o display do modal se estiver aberto
    const currentWeaponType = $('#weaponConfigType').val();
    if (currentWeaponType === weaponType) {
        updateSelectedAmmunitionDisplay();
    }
    
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function editAttachmentQuantityForWeapon(weaponType, attachmentId, attachmentNameType, attachmentType, attachmentIndex) {
    const weaponConfig = selectedWeapons[weaponType];
    if (!weaponConfig) return false;
    
    // Tentar encontrar pelo ID primeiro
    let attachment = weaponConfig.attachments.find(a => a.id === attachmentId);
    
    // Se não encontrar pelo ID e temos informações adicionais, usar elas
    if (!attachment && attachmentId === 0 && attachmentNameType) {
        attachment = weaponConfig.attachments.find(a => 
            a.name_type === attachmentNameType && 
            a.type === attachmentType
        );
    }
    
    // Se ainda não encontrou, usar o index
    if (!attachment && typeof attachmentIndex !== 'undefined' && attachmentIndex >= 0) {
        attachment = weaponConfig.attachments[attachmentIndex];
    }
    
    if (!attachment) return false;
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${attachment.name || attachment.name_type || 'Attachment'}":`;
    if (isPlayerLoadout) {
        const maxQty = attachment.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, attachment.quantity || 1);
    if (newQuantity === null) {
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (attachment.max_quantity && qty > attachment.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este attachment é ${attachment.max_quantity}`);
            return false;
        }
    }
    
    attachment.quantity = qty;
    updateSelectedWeaponDisplay(weaponType);
    
    // Atualizar também o display do modal se estiver aberto
    const currentWeaponType = $('#weaponConfigType').val();
    if (currentWeaponType === weaponType) {
        updateSelectedAttachmentsDisplay();
    }
    
    updateJSONPreview();
    markLoadoutChanged();
    return true;
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
            ${mag.name || mag.name_type || 'Magazine'}${mag.capacity ? ` (${mag.capacity} cap.)` : ''} (Qtd: ${mag.quantity || 1})
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
            ${ammo.name || ammo.name_type || 'Ammunition'} (Qtd: ${ammo.quantity || 1})
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
    markLoadoutChanged();
    
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
                         alt="${att.name || att.name_type || 'Attachment'}" 
                         class="img-thumbnail selected-weapon-img-small" 
                         onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
                    <div class="small text-muted">${att.name || att.name_type || 'Attachment'}</div>
                </div>
            `;
        });
    }
    
    let magazineHtml = '';
    if (magazine) {
        magazineHtml = `
            <div class="d-inline-block me-3 mb-2 text-center">
                <img src="${magazine.img || 'https://via.placeholder.com/60?text=No+Image'}" 
                     alt="${magazine.name || magazine.name_type || 'Magazine'}" 
                     class="img-thumbnail selected-weapon-img-small" 
                     onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
                <div class="small text-muted">${magazine.name || magazine.name_type || 'Magazine'}</div>
            </div>
        `;
    }
    
    let ammunitionHtml = '';
    if (ammunition) {
        ammunitionHtml = `
            <div class="d-inline-block me-3 mb-2 text-center">
                <img src="${ammunition.img || 'https://via.placeholder.com/60?text=No+Image'}" 
                     alt="${ammunition.name || ammunition.name_type || 'Ammunition'}" 
                     class="img-thumbnail selected-weapon-img-small" 
                     onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
                <div class="small text-muted">${ammunition.name || ammunition.name_type || 'Ammunition'}</div>
            </div>
        `;
    }
    
    // Alterar classe do container para grid horizontal
    container.removeClass('items-tree').addClass('selected-weapons-grid');
    
    // Renderizar arma com componentes em grid horizontal
    const weaponHtml = renderSelectedWeaponCard(weaponConfig, weaponType);
    container.append(weaponHtml);
}

function renderSelectedWeaponCard(weaponConfig, weaponType) {
    const weapon = weaponConfig.weapon;
    const magazine = weaponConfig.magazine;
    const ammunition = weaponConfig.ammunition;
    const attachments = weaponConfig.attachments || [];
    
    // Card principal da arma (destacado)
    const weaponCard = $(`
        <div class="selected-weapon-card-main">
            <div class="card h-100 selected-weapon-main-card">
                <div class="card-body p-3">
                    <div class="row">
                        <!-- Coluna da Arma -->
                        <div class="col-md-6 col-lg-5">
                            <div class="d-flex flex-column align-items-center h-100">
                                <img src="${weapon.img || 'https://via.placeholder.com/200?text=No+Image'}" 
                                     alt="${weapon.name}" 
                                     class="img-thumbnail mb-3 selected-weapon-img-main" 
                                     style="max-width: 200px; max-height: 200px; width: auto; height: auto; object-fit: contain;"
                                     onerror="this.src='https://via.placeholder.com/200?text=No+Image'">
                                <div class="text-center mb-3">
                                    <h5 class="mb-1"><strong>${weapon.name}</strong></h5>
                                    <small class="text-muted d-block">${weapon.name_type}</small>
                                </div>
                                <div class="d-flex gap-2 w-100 justify-content-center">
                                    <button class="btn btn-sm btn-warning" onclick="openWeaponConfigModalWithData('${weaponType}'); event.preventDefault(); event.stopPropagation(); return false;" title="Configurar">
                                        <i class="fas fa-cog"></i> Configurar
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="removeWeaponFromLoadout('${weaponType}'); event.preventDefault(); event.stopPropagation(); return false;" title="Remover">
                                        <i class="fas fa-trash"></i> Remover
                                    </button>
                                </div>
                            </div>
                        </div>
                        <!-- Coluna dos Componentes -->
                        <div class="col-md-6 col-lg-7">
                            ${magazine || ammunition || attachments.length > 0 ? `
                                <div class="selected-weapon-components">
                                    <h6 class="text-muted mb-2"><i class="fas fa-link me-2"></i>Componentes:</h6>
                                    <div class="selected-components-grid">
                                        ${magazine ? `
                                            <div class="selected-component-card">
                                                <div class="card h-100">
                                                    <div class="card-body p-2 text-center">
                                                        <img src="${magazine.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                                             alt="${magazine.name || magazine.name_type || 'Magazine'}" 
                                                             class="img-thumbnail mb-2" 
                                                             style="width: 80px; height: 80px; object-fit: contain;"
                                                             onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                                                        <div>
                                                            <small class="text-muted d-block"><i class="fas fa-clipboard-list"></i> Magazine</small>
                                                            <strong class="d-block small">${magazine.name || magazine.name_type || 'Magazine'}</strong>
                                                            <small class="text-info d-block mt-1"><i class="fas fa-box"></i> Quantidade: <strong>${magazine.quantity || 1}</strong></small>
                                                        </div>
                                                        <div class="mt-2">
                                                            <button class="btn btn-sm btn-primary" onclick="editMagazineQuantityForWeapon('${weaponType}'); event.preventDefault(); event.stopPropagation(); return false;" title="Editar Quantidade">
                                                                <i class="fas fa-edit"></i> Qtd
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${ammunition ? `
                                            <div class="selected-component-card">
                                                <div class="card h-100">
                                                    <div class="card-body p-2 text-center">
                                                        <img src="${ammunition.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                                             alt="${ammunition.name || ammunition.name_type || 'Ammunition'}" 
                                                             class="img-thumbnail mb-2" 
                                                             style="width: 80px; height: 80px; object-fit: contain;"
                                                             onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                                                        <div>
                                                            <small class="text-muted d-block"><i class="fas fa-bolt"></i> Ammunition</small>
                                                            <strong class="d-block small">${ammunition.name || ammunition.name_type || 'Ammunition'}</strong>
                                                            <small class="text-info d-block mt-1"><i class="fas fa-box"></i> Quantidade: <strong>${ammunition.quantity || 1}</strong></small>
                                                        </div>
                                                        <div class="mt-2">
                                                            <button class="btn btn-sm btn-primary" onclick="editAmmunitionQuantityForWeapon('${weaponType}'); event.preventDefault(); event.stopPropagation(); return false;" title="Editar Quantidade">
                                                                <i class="fas fa-edit"></i> Qtd
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ` : ''}
                                        ${attachments.map(function(att, attIndex) {
                                            return `
                                                <div class="selected-component-card">
                                                    <div class="card h-100">
                                                        <div class="card-body p-2 text-center">
                                                            <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                                                                 alt="${att.name || att.name_type || 'Attachment'}" 
                                                                 class="img-thumbnail mb-2" 
                                                                 style="width: 80px; height: 80px; object-fit: contain;"
                                                                 onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                                                            <div>
                                                                <small class="text-muted d-block"><i class="fas fa-puzzle-piece"></i> ${att.type || 'Attachment'}</small>
                                                                <strong class="d-block small">${att.name || att.name_type || 'Attachment'}</strong>
                                                                <small class="text-info d-block mt-1"><i class="fas fa-box"></i> Quantidade: <strong>${att.quantity || 1}</strong></small>
                                                            </div>
                                                            <div class="mt-2">
                                                                <button class="btn btn-sm btn-primary" onclick="editAttachmentQuantityForWeapon('${weaponType}', ${att.id || 0}, '${att.name_type || ''}', '${att.type || ''}', ${attIndex}); event.preventDefault(); event.stopPropagation(); return false;" title="Editar Quantidade">
                                                                    <i class="fas fa-edit"></i> Qtd
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            ` : '<div class="text-muted text-center"><small>Nenhum componente configurado</small></div>'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    return weaponCard;
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
    markLoadoutChanged();
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
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    const existing = selectedExplosives.find(e => e.id === explosiveId);
    let quantity = 1;
    
    if (existing) {
        quantity = existing.quantity || 1;
    }
    
    // Calcular quantidade total atual de explosivos (para validação de limite global)
    // Usar quantity || 0 para contar apenas explosivos com quantidade definida
    const currentTotal = selectedExplosives.reduce((sum, exp) => sum + (exp.quantity || 0), 0);
    const currentForThisExplosive = existing ? (existing.quantity || 0) : 0;
    
    let promptMessage = `Quantidade de "${explosive.name}":`;
    if (isPlayerLoadout) {
        // Usar max_quantity do objeto original do banco
        const maxQty = explosive.max_quantity;
        const globalLimit = window.explosivesGlobalLimit || 0;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
        if (globalLimit > 0) {
            const totalWithoutThis = currentTotal - currentForThisExplosive;
            promptMessage += `\n(Limite global total: ${globalLimit})`;
            promptMessage += `\n(Total atual: ${totalWithoutThis})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, quantity);
    if (newQuantity === null) return;
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual usando o objeto original do banco
        if (explosive.max_quantity && qty > explosive.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este explosive é ${explosive.max_quantity}`);
            return;
        }
        
        // Validar limite global
        const globalLimit = window.explosivesGlobalLimit || 0;
        if (globalLimit > 0) {
            const newTotal = currentTotal - currentForThisExplosive + qty;
            if (newTotal > globalLimit) {
                showAlert('danger', `Limite global de explosivos é ${globalLimit}. Total atual seria ${newTotal}`);
                return;
            }
        }
    }
    
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
            quantity: qty,
            img: explosive.img || null,
            max_quantity: explosive.max_quantity || null
        });
    }
    
    updateSelectedExplosivesDisplay();
    updateJSONPreview();
    applyExplosiveFiltersLoadout();
    markLoadoutChanged();
}

function updateSelectedExplosivesDisplay() {
    const container = $('#selectedExplosivesList');
    container.empty();
    
    if (selectedExplosives.length === 0) {
        container.html('<span class="text-muted">Nenhum explosivo selecionado</span>');
        return;
    }
    
    // Alterar classe do container para grid horizontal
    container.removeClass('items-tree').addClass('selected-items-grid');
    
    // Renderizar explosivos em grid horizontal
    selectedExplosives.forEach(function(explosive, index) {
        const explosiveHtml = renderSelectedExplosiveCard(explosive, index);
        container.append(explosiveHtml);
    });
}

function renderSelectedExplosiveCard(explosive, index) {
    // Card do explosivo
    const card = $(`
        <div class="selected-item-card" data-explosive-index="${index}" data-explosive-id="${explosive.id}">
            <div class="card h-100">
                <div class="card-body p-2">
                    <div class="d-flex flex-column align-items-center">
                        <img src="${explosive.img || 'https://via.placeholder.com/100?text=No+Image'}" 
                             alt="${explosive.name}" 
                             class="img-thumbnail mb-2" 
                             style="width: 100px; height: 100px; object-fit: cover;"
                             onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                        <div class="text-center mb-2">
                            <strong class="d-block">${explosive.name}</strong>
                            <small class="text-muted d-block">${explosive.name_type}</small>
                            <small class="text-info d-block mt-1"><i class="fas fa-box"></i> Quantidade: <strong>${explosive.quantity}</strong></small>
                        </div>
                        <div class="btn-group btn-group-sm w-100" role="group">
                            <button class="btn btn-primary" onclick="editExplosiveQuantity(${explosive.id}); event.preventDefault(); event.stopPropagation(); return false;" title="Editar Quantidade">
                                <i class="fas fa-edit"></i> Qtd
                            </button>
                            <button class="btn btn-danger" onclick="removeExplosiveFromLoadout(${explosive.id}); event.preventDefault(); event.stopPropagation(); return false;" title="Remover">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    return card;
}

function editExplosiveQuantity(explosiveId) {
    const explosive = selectedExplosives.find(e => e.id === explosiveId);
    if (!explosive) return false;
    
    // Buscar o objeto original do banco para obter max_quantity correto
    const explosiveOriginal = explosivesDataLoadout.find(e => e.id === explosiveId);
    if (!explosiveOriginal) return false;
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    // Calcular quantidade total atual de explosivos (para validação de limite global)
    // Usar quantity || 0 para contar apenas explosivos com quantidade definida
    const currentTotal = selectedExplosives.reduce((sum, exp) => sum + (exp.quantity || 0), 0);
    const currentForThisExplosive = explosive.quantity || 0;
    
    let promptMessage = `Quantidade de "${explosive.name}":`;
    if (isPlayerLoadout) {
        // Usar max_quantity do objeto original do banco
        const maxQty = explosiveOriginal.max_quantity;
        const globalLimit = window.explosivesGlobalLimit || 0;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
        if (globalLimit > 0) {
            const totalWithoutThis = currentTotal - currentForThisExplosive;
            promptMessage += `\n(Limite global total: ${globalLimit})`;
            promptMessage += `\n(Total atual: ${totalWithoutThis})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, explosive.quantity || 1);
    if (newQuantity === null) {
        // Cancelado pelo usuário - não fazer nada
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual usando o objeto original do banco
        if (explosiveOriginal.max_quantity && qty > explosiveOriginal.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este explosive é ${explosiveOriginal.max_quantity}`);
            return false;
        }
        
        // Validar limite global
        const globalLimit = window.explosivesGlobalLimit || 0;
        if (globalLimit > 0) {
            const newTotal = currentTotal - currentForThisExplosive + qty;
            if (newTotal > globalLimit) {
                showAlert('danger', `Limite global de explosivos é ${globalLimit}. Total atual seria ${newTotal}`);
                return false;
            }
        }
    }
    
    explosive.quantity = qty;
    // Atualizar max_quantity do objeto selecionado com o valor do banco (caso tenha mudado)
    explosive.max_quantity = explosiveOriginal.max_quantity || null;
    
    updateSelectedExplosivesDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    return true;
}

function removeExplosiveFromLoadout(explosiveId) {
    const index = selectedExplosives.findIndex(e => e.id === explosiveId);
    if (index >= 0) {
        selectedExplosives.splice(index, 1);
        updateSelectedExplosivesDisplay();
        updateJSONPreview();
        applyExplosiveFiltersLoadout();
        markLoadoutChanged();
    }
}

// Funções para items (simplificadas por enquanto, subitems serão adicionados depois)
function applyItemFiltersLoadout() {
    // Salvar posições de scroll antes de filtrar
    const savedScrollPositions = saveGridScrollPositions();
    
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
        
        // Não filtrar por localização aqui quando location é vazio, pois vamos separar por localização nos grids
        // Apenas aplicar se o filtro de localização estiver ativo (mostrar apenas uma seção)
        if (location !== '' && location !== 'none') {
            match = match && item.localization === location;
        } else if (location === 'none') {
            // Filtro "Sem Localização" - item não deve ter localização
            match = match && (!item.localization || item.localization === '');
        }
        
        if (storage === 'with') {
            match = match && item.storage_slots > 0;
        } else if (storage === 'without') {
            match = match && item.storage_slots === 0;
        }
        
        return match;
    });
    
    // Renderizar grids separados por tipo
    // O filtro de localização será aplicado nos dados, mas os grids são separados por tipo
    renderItemsGridLoadoutByType(filtered);
    
    // Restaurar posições de scroll após filtrar
    // Usar setTimeout para garantir que o DOM foi atualizado
    setTimeout(function() {
        restoreGridScrollPositions(savedScrollPositions);
    }, 50);
}

// Função auxiliar para salvar posições de scroll dos grids
function saveGridScrollPositions() {
    const scrollPositions = {};
    const container = document.getElementById('itemsGridsByType');
    if (!container) return scrollPositions;
    
    const grids = container.querySelectorAll('.items-grid-scrollable');
    grids.forEach(function(grid) {
        const gridId = grid.id;
        if (gridId) {
            scrollPositions[gridId] = grid.scrollLeft;
        }
    });
    
    return scrollPositions;
}

// Função auxiliar para restaurar posições de scroll dos grids
function restoreGridScrollPositions(scrollPositions) {
    if (!scrollPositions) return;
    
    Object.keys(scrollPositions).forEach(function(gridId) {
        const grid = document.getElementById(gridId);
        if (grid) {
            grid.scrollLeft = scrollPositions[gridId];
        }
    });
}

function renderItemsGridLoadoutByType(data) {
    const container = $('#itemsGridsByType');
    
    // Salvar posições de scroll antes de renderizar
    const savedScrollPositions = saveGridScrollPositions();
    
    // Obter tipos únicos dos itens filtrados
    const typesMap = {};
    data.forEach(function(item) {
        const typeId = item.type_id || 'none';
        
        // Buscar nome do tipo em itemTypesDataLoadout se não estiver no item
        let typeName = item.type_name;
        if (!typeName && typeId !== 'none' && itemTypesDataLoadout && itemTypesDataLoadout.length > 0) {
            const typeInfo = itemTypesDataLoadout.find(function(t) {
                return t.id === typeId || t.id === parseInt(typeId);
            });
            if (typeInfo) {
                typeName = typeInfo.name;
            }
        }
        
        // Se ainda não tiver nome, usar "Sem Tipo"
        if (!typeName) {
            typeName = 'Sem Tipo';
        }
        
        if (!typesMap[typeId]) {
            typesMap[typeId] = {
                id: typeId,
                name: typeName,
                items: []
            };
        }
        typesMap[typeId].items.push(item);
    });
    
    // Limpar container
    container.empty();
    
    // Obter tipos ordenados por nome
    const typesArray = Object.values(typesMap).sort(function(a, b) {
        if (a.id === 'none') return 1; // Sem Tipo sempre no final
        if (b.id === 'none') return -1;
        return a.name.localeCompare(b.name);
    });
    
    // Localizações possíveis (para segundo nível de separação)
    const locations = [
        { key: 'head', label: 'Cabeça', icon: 'fa-hard-hat' },
        { key: 'face', label: 'Rosto', icon: 'fa-user-secret' },
        { key: 'torso', label: 'Torso', icon: 'fa-tshirt' },
        { key: 'legs', label: 'Pernas', icon: 'fa-running' },
        { key: 'foot', label: 'Pés', icon: 'fa-shoe-prints' },
        { key: 'hands', label: 'Mãos', icon: 'fa-hand-paper' },
        { key: 'back', label: 'Costas', icon: 'fa-backpack' },
        { key: 'waist', label: 'Cintura', icon: 'fa-waist' },
        { key: 'none', label: 'Sem Localização', icon: 'fa-box' }
    ];
    
    // Criar seção para cada tipo
    typesArray.forEach(function(type) {
        if (type.items.length === 0) return; // Pular tipos sem itens
        
        const typeKey = type.id === 'none' ? 'None' : `Type${type.id}`;
        const typeSectionId = `itemsTypeSection${typeKey}`;
        
        // Agrupar itens deste tipo por localização
        const itemsByLocation = {};
        type.items.forEach(function(item) {
            const locationKey = item.localization || 'none';
            
            if (!itemsByLocation[locationKey]) {
                itemsByLocation[locationKey] = [];
            }
            itemsByLocation[locationKey].push(item);
        });
        
        // Criar seção principal do tipo se não existir
        let typeSection = $(`#${typeSectionId}`);
        if (typeSection.length === 0) {
            typeSection = $(`
                <div class="mb-5 items-type-section" id="${typeSectionId}">
                    <h5 class="mb-3"><i class="fas fa-tag me-2"></i>${type.name}</h5>
                </div>
            `);
            container.append(typeSection);
        } else {
            // Limpar conteúdo anterior da seção
            typeSection.find('.items-location-subsection').remove();
        }
        
        // Criar sub-seções por localização dentro deste tipo
        locations.forEach(function(loc) {
            const locationKey = loc.key;
            const itemsForLocation = itemsByLocation[locationKey] || [];
            
            if (itemsForLocation.length === 0) return; // Pular localizações sem itens
            
            const gridId = `itemsGridLoadout${typeKey}Location${locationKey === 'none' ? 'None' : (locationKey.charAt(0).toUpperCase() + locationKey.slice(1))}`;
            const locationSubsectionId = `itemsLocationSubsection${typeKey}${locationKey === 'none' ? 'None' : (locationKey.charAt(0).toUpperCase() + locationKey.slice(1))}`;
            
            // Criar sub-seção de localização
            const locationSubsection = $(`
                <div class="mb-4 items-location-subsection ms-4" id="${locationSubsectionId}">
                    <h6 class="mb-2"><i class="fas ${loc.icon} me-2"></i>${loc.label}</h6>
                    <div class="items-grid-container">
                        <button type="button" class="grid-nav-prev" data-grid="${gridId}" aria-label="Anterior" onclick="scrollGridPrev('${gridId}'); return false;"><i class="fas fa-chevron-left"></i></button>
                        <div id="${gridId}" class="weapons-grid items-grid-scrollable"></div>
                        <button type="button" class="grid-nav-next" data-grid="${gridId}" aria-label="Próximo" onclick="scrollGridNext('${gridId}'); return false;"><i class="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            `);
            
            typeSection.append(locationSubsection);
            
            // Renderizar grid para esta localização
            renderItemsGridLoadoutForType(itemsForLocation, type.id, gridId);
            
            // Inicializar navegação para este grid
            const gridElement = document.getElementById(gridId);
            if (gridElement) {
                initGridDragSwipe(gridElement);
                updateGridNavigationButtons(gridId);
            }
        });
    });
    
    // Inicializar navegação para todos os grids criados
    initGridNavigation();
    
    // Restaurar posições de scroll após renderizar
    // Usar setTimeout para garantir que o DOM foi atualizado
    setTimeout(function() {
        restoreGridScrollPositions(savedScrollPositions);
    }, 0);
}

function renderItemsGridLoadoutForType(data, typeId, gridId) {
    const grid = $(`#${gridId}`);
    
    // Se o grid não existe, não precisa renderizar
    if (grid.length === 0) {
        return;
    }
    
    grid.empty();
    
    if (data.length === 0) {
        // Ocultar seção se não houver itens
        const section = grid.closest('.items-location-section');
        if (section.length > 0) {
            section.hide();
        }
        return;
    }
    
    // Mostrar seção se houver itens
    const section = grid.closest('.items-location-section');
    if (section.length > 0) {
        section.show();
    }
    
    data.forEach(function(item) {
        const isSelected = selectedItems.some(i => i.id === item.id);
        
        const card = $(`
            <div class="weapon-card ${isSelected ? 'selected' : ''}" data-item-id="${item.id}">
                <div class="weapon-actions">
                    ${isSelected ? `
                        <button class="btn btn-sm btn-danger me-1" onclick="removeItemFromLoadoutByGrid(${item.id}, '${gridId}'); event.stopPropagation(); return false;" title="Remover">
                            <i class="fas fa-times"></i>
                        </button>
                        ${item.canHaveSubitems ? `
                            <button class="btn btn-sm btn-warning" onclick="openSubitemsModal(${selectedItems.findIndex(i => i.id === item.id)}); event.stopPropagation(); return false;" title="Configurar Subitems">
                                <i class="fas fa-cog"></i>
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-info" onclick="selectItemForLoadout(${item.id}); event.stopPropagation(); return false;" title="Configurar">
                                <i class="fas fa-cog"></i>
                            </button>
                        `}
                    ` : `
                        <button class="btn btn-sm btn-success" onclick="selectItemForLoadout(${item.id}); event.stopPropagation(); return false;" title="Adicionar">
                            <i class="fas fa-plus"></i>
                        </button>
                    `}
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

// Função mantida para compatibilidade
function renderItemsGridLoadout(data) {
    // Esta função agora apenas chama renderItemsGridLoadoutByType
    renderItemsGridLoadoutByType(data);
}

function selectItemForLoadout(itemId) {
    try {
        const item = itemsDataLoadout.find(i => i.id === itemId);
        if (!item) {
            showAlert('danger', 'Item não encontrado nos dados carregados');
            console.error('Item não encontrado:', itemId);
            return;
        }
        
        const loadoutType = $('#loadoutType').val() || 'custom';
        const isPlayerLoadout = loadoutType === 'player';
        
        const existing = selectedItems.find(i => i.id === itemId);
        let quantity = 1;
        
        if (existing) {
            quantity = existing.quantity || 1;
        }
        
        let promptMessage = `Quantidade de "${item.name}":`;
        if (isPlayerLoadout) {
            const maxQty = item.max_quantity;
            
            if (maxQty) {
                promptMessage += `\n(Máximo: ${maxQty})`;
            }
        }
        
        const newQuantity = prompt(promptMessage, quantity);
        if (newQuantity === null) return;
        
        const qty = parseInt(newQuantity) || 1;
        
        // Validações para loadouts de players
        if (isPlayerLoadout) {
            // Validar quantidade máxima individual
            if (item.max_quantity && qty > item.max_quantity) {
                showAlert('danger', `Quantidade máxima permitida para este item é ${item.max_quantity}`);
                return;
            }
        }
        
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
                            compatibleChildren: compatibility.children || [],
                            img: item.img || null,
                            quantity: qty,
                            max_quantity: item.max_quantity || null
                        });
                        
                        updateSelectedItemsDisplay();
                        updateJSONPreview();
                        applyItemFiltersLoadout();
                        markLoadoutChanged();
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
                            compatibleChildren: [],
                            img: item.img || null,
                            quantity: qty,
                            max_quantity: item.max_quantity || null
                        });
                        updateSelectedItemsDisplay();
                        updateJSONPreview();
                        applyItemFiltersLoadout();
                        markLoadoutChanged();
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
                        compatibleChildren: [],
                        img: item.img || null,
                        quantity: qty,
                        max_quantity: item.max_quantity || null
                    });
                    
                    updateSelectedItemsDisplay();
                    updateJSONPreview();
                    applyItemFiltersLoadout();
                    markLoadoutChanged();
                }
            });
        } else {
            // Item já existe - atualizar quantidade
            existing.quantity = qty;
            updateSelectedItemsDisplay();
            updateJSONPreview();
            applyItemFiltersLoadout();
            markLoadoutChanged();
        }
    } catch (error) {
        showAlert('danger', 'Erro inesperado ao selecionar item: ' + error.message);
        console.error('Erro inesperado:', error);
    }
}

function editItemQuantity(itemId) {
    const item = selectedItems.find(i => i.id === itemId);
    if (!item) return false;
    
    const loadoutType = $('#loadoutType').val() || 'custom';
    const isPlayerLoadout = loadoutType === 'player';
    
    let promptMessage = `Quantidade de "${item.name}":`;
    if (isPlayerLoadout) {
        const maxQty = item.max_quantity;
        
        if (maxQty) {
            promptMessage += `\n(Máximo: ${maxQty})`;
        }
    }
    
    const newQuantity = prompt(promptMessage, item.quantity || 1);
    if (newQuantity === null) {
        // Cancelado pelo usuário - não fazer nada
        return false;
    }
    
    const qty = parseInt(newQuantity) || 1;
    
    // Validações para loadouts de players
    if (isPlayerLoadout) {
        // Validar quantidade máxima individual
        if (item.max_quantity && qty > item.max_quantity) {
            showAlert('danger', `Quantidade máxima permitida para este item é ${item.max_quantity}`);
            return false;
        }
    }
    
    item.quantity = qty;
    updateSelectedItemsDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    return true;
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
    
    // Alterar classe do container para grid horizontal
    container.removeClass('items-tree').addClass('selected-items-grid');
    
    // Renderizar items principais em grid horizontal
    selectedItems.forEach(function(item, index) {
        const itemHtml = renderSelectedItemCard(item, index);
        container.append(itemHtml);
    });
}

function renderSelectedItemCard(item, itemIndex) {
    // Card principal do item
    const card = $(`
        <div class="selected-item-card" data-item-index="${itemIndex}">
            <div class="card h-100">
                <div class="card-body p-2">
                    <div class="d-flex flex-column align-items-center">
                        <img src="${item.img || 'https://via.placeholder.com/100?text=No+Image'}" 
                             alt="${item.name}" 
                             class="img-thumbnail mb-2" 
                             style="width: 100px; height: 100px; object-fit: cover;"
                             onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                        <div class="text-center mb-2">
                            <strong class="d-block">${item.name}</strong>
                            <small class="text-muted d-block">${item.name_type}</small>
                            <small class="text-info d-block mt-1"><i class="fas fa-box"></i> Quantidade: <strong>${item.quantity || 1}</strong></small>
                            ${item.subitems && item.subitems.length > 0 ? `<small class="text-info d-block mt-1"><i class="fas fa-layer-group"></i> ${item.subitems.length} subitem(s)</small>` : ''}
                        </div>
                        <div class="btn-group btn-group-sm w-100" role="group">
                            ${item.canHaveSubitems ? `
                                <button class="btn btn-info" onclick="openSubitemsModal(${itemIndex}); return false;" title="Subitems">
                                    <i class="fas fa-layer-group"></i> Subitems
                                    ${item.subitems && item.subitems.length > 0 ? ` <span class="badge bg-light text-dark">${item.subitems.length}</span>` : ''}
                                </button>
                            ` : ''}
                            <button class="btn btn-primary" onclick="editItemQuantity(${item.id}); event.preventDefault(); event.stopPropagation(); return false;" title="Editar Quantidade">
                                <i class="fas fa-edit"></i> Qtd
                            </button>
                            <button class="btn btn-danger" onclick="removeItemFromLoadout(${itemIndex}); return false;" title="Remover">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    return card;
}

// Função removida: renderSelectedSubitemsGrid
// Subitems não são mais exibidos embaixo do item principal
// O usuário deve clicar no botão "Subitems" para ver/gerenciar os subitems no modal

// Função recursiva para renderizar item com seus subitems
function renderItemWithSubitems(item, itemIndex, depth, parentItemIndex) {
    const indent = depth * 20; // Indentação visual para subitems
    const marginLeft = depth > 0 ? `style="margin-left: ${indent}px;"` : '';
    
    // Se depth > 0, usar parentItemIndex; senão usar itemIndex
    const actualParentIndex = depth === 0 ? itemIndex : parentItemIndex;
    
    // Renderizar o item principal
    let html = $(`
        <div class="card mb-2 item-display-card" ${marginLeft} data-item-index="${itemIndex}" data-depth="${depth}" data-parent-index="${actualParentIndex}" data-item-name="${item.name}" data-item-name-type="${item.name_type}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="d-flex align-items-center flex-grow-1">
                        <img src="${item.img || 'https://via.placeholder.com/80?text=No+Image'}" 
                             alt="${item.name}" 
                             class="img-thumbnail me-3" 
                             style="width: 80px; height: 80px; object-fit: cover;"
                             onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                        <div>
                            ${depth > 0 ? '<i class="fas fa-level-down-alt text-muted me-1"></i>' : ''}
                            <strong>${item.name}</strong>
                            ${item.localization ? `<br><small class="text-muted">Localização: ${item.localization}</small>` : ''}
                            ${item.canHaveSubitems ? `<br><small class="text-info">Pode receber subitems</small>` : ''}
                            ${item.subitems && item.subitems.length > 0 ? `<br><small class="text-secondary">Subitems: ${item.subitems.length}</small>` : ''}
                        </div>
                    </div>
                    <div class="ms-3">
                        ${item.canHaveSubitems ? `
                            ${depth === 0 ? `
                                <button class="btn btn-sm btn-info me-1" onclick="openSubitemsModal(${itemIndex}); return false;">
                                    <i class="fas fa-layer-group"></i> Subitems
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-info me-1" onclick="openSubitemsModalForSubitemInDisplay(${actualParentIndex}, '${item.name_type}'); return false;">
                                    <i class="fas fa-layer-group"></i> Subitems
                                </button>
                            `}
                        ` : ''}
                        ${depth === 0 ? `
                            <button class="btn btn-sm btn-danger" onclick="removeItemFromLoadout(${itemIndex}); return false;">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-danger" onclick="removeSubitemFromLoadout(${actualParentIndex}, '${item.name_type}'); return false;">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `);
    
    // Renderizar subitems recursivamente
    if (item.subitems && item.subitems.length > 0) {
        const subitemsContainer = $('<div class="subitems-container ms-4 mt-2"></div>');
        item.subitems.forEach(function(subitem, subIndex) {
            // Para subitems, usar o parentItemIndex (que é o itemIndex do item principal)
            const subitemHtml = renderItemWithSubitems(subitem, -1, depth + 1, actualParentIndex);
            subitemsContainer.append(subitemHtml);
        });
        html.append(subitemsContainer);
    }
    
    return html;
}

// Função auxiliar para abrir modal de subitems de um subitem no display principal
// Para subitems, precisamos encontrar o item na hierarquia e abrir o modal como se fosse um item principal temporário
function openSubitemsModalForSubitemInDisplay(parentItemIndex, subitemNameType) {
    // Encontrar o item principal
    const mainItem = selectedItems[parentItemIndex];
    if (!mainItem) {
        showAlert('danger', 'Item principal não encontrado.');
        return;
    }
    
    // Função melhorada para encontrar subitem na hierarquia (suporta múltiplos níveis)
    // Retorna tanto o subitem quanto o caminho para encontrá-lo
    const findSubitemInHierarchyWithPath = function(item, targetNameType, currentPath = []) {
        if (item.subitems && item.subitems.length > 0) {
            for (let i = 0; i < item.subitems.length; i++) {
                const subitem = item.subitems[i];
                const newPath = [...currentPath, i]; // Armazenar índice para acesso direto
                
                if (subitem.name_type === targetNameType) {
                    return { subitem: subitem, path: newPath, parentArray: item.subitems, index: i };
                }
                
                // Buscar recursivamente em subitems
                const found = findSubitemInHierarchyWithPath(subitem, targetNameType, newPath);
                if (found) return found;
            }
        }
        return null;
    };
    
    const found = findSubitemInHierarchyWithPath(mainItem, subitemNameType);
    if (!found || !found.subitem) {
        showAlert('warning', 'Subitem não encontrado na hierarquia.');
        console.error('Subitem não encontrado:', subitemNameType, 'em item:', mainItem.name);
        return;
    }
    
    // Salvar referências para uso no wrapper
    const targetSubitem = found.subitem;
    const targetParentArray = found.parentArray;
    const targetIndex = found.index;
    
    console.log('Abrindo modal para subitem:', targetSubitem.name, 'Índice:', targetIndex, 'Path:', found.path);
    
    // Abrir modal - criar um item temporário no selectedItems para poder usar openSubitemsModal
    const tempIndex = selectedItems.length;
    
    // Temporariamente adicionar o subitem como um item principal para poder usar openSubitemsModal
    const originalSubitems = targetSubitem.subitems ? JSON.parse(JSON.stringify(targetSubitem.subitems)) : [];
    const tempItem = {
        ...targetSubitem,
        subitems: originalSubitems
    };
    
    // Adicionar temporariamente
    selectedItems.push(tempItem);
    
    // Abrir modal
    openSubitemsModal(tempIndex);
    
    // Criar um wrapper para saveSubitemsConfiguration que salva no lugar correto
    // Garantir que window.saveSubitemsConfiguration existe antes de criar o wrapper
    if (typeof window.saveSubitemsConfiguration === 'undefined') {
        window.saveSubitemsConfiguration = saveSubitemsConfiguration;
    }
    
    const originalSave = window.saveSubitemsConfiguration;
    
    console.log('🔧 Criando wrapper para saveSubitemsConfiguration');
    console.log('ParentItemIndex:', parentItemIndex);
    console.log('SubitemNameType:', subitemNameType);
    
    window.saveSubitemsConfiguration = function() {
        console.log('🔧 WRAPPER chamado (não função original)');
        console.log('Verificando se é subitem...');
        
        // Verificar se é um item temporário (subitem) checando se o índice é >= parentItemIndex + 1
        // Ou verificar se o itemIndex corresponde ao tempIndex
        const itemIndex = parseInt($('#subitemsItemIndex').val());
        console.log('ItemIndex do modal:', itemIndex);
        console.log('TempIndex:', tempIndex);
        console.log('ParentItemIndex:', parentItemIndex);
        
        // Se o itemIndex é o tempIndex, então é um subitem
        if (itemIndex === tempIndex) {
            console.log('✅ É um subitem, usando lógica do wrapper');
            
            // Buscar o item principal novamente para garantir referência atualizada
            const mainItemCurrent = selectedItems[parentItemIndex];
        if (!mainItemCurrent) {
            showAlert('danger', 'Item principal não encontrado.');
            return;
        }
        
        // Buscar o subitem novamente usando a mesma estratégia
        const foundCurrent = findSubitemInHierarchyWithPath(mainItemCurrent, subitemNameType);
        if (!foundCurrent || !foundCurrent.subitem) {
            showAlert('danger', 'Subitem não encontrado na hierarquia.');
            console.error('Subitem não encontrado ao salvar:', subitemNameType);
            return;
        }
        
        // Obter referência direta ao subitem na hierarquia
        const currentSubitem = foundCurrent.subitem;
        const currentParentArray = foundCurrent.parentArray;
        const currentIndex = foundCurrent.index;
        
        console.log('=== DEBUG: Salvando subitems de subitem ===');
        console.log('Subitem encontrado:', currentSubitem.name);
        console.log('ParentArray existe:', !!currentParentArray);
        console.log('Index:', currentIndex);
        console.log('ParentArray[currentIndex] existe:', !!(currentParentArray && currentParentArray[currentIndex]));
        console.log('Subitem atual antes:', JSON.stringify(currentSubitem.subitems || []));
        
        // IMPORTANTE: Ler de currentSelectedSubitems (mesmo que a função original)
        // currentSelectedSubitems contém os subitems selecionados no modal
        console.log('ItemIndex do modal:', parseInt($('#subitemsItemIndex').val()));
        console.log('currentSelectedSubitems.length:', currentSelectedSubitems ? currentSelectedSubitems.length : 0);
        console.log('currentSelectedSubitems:', currentSelectedSubitems);
        
        // Usar currentSelectedSubitems ao invés de tempItemCurrent.subitems
        // Isso garante que estamos usando os subitems selecionados no modal
        if (currentSelectedSubitems && currentSelectedSubitems.length > 0) {
            // Fazer deep copy dos subitems selecionados (mesma lógica da função original)
            const subitemsToSave = currentSelectedSubitems.map(function(subitem) {
                return {
                    id: subitem.id,
                    name: subitem.name,
                    name_type: subitem.name_type,
                    type_name: subitem.type_name || '',
                    slots: subitem.slots,
                    width: subitem.width,
                    height: subitem.height,
                    storage_slots: subitem.storage_slots || 0,
                    storage_width: subitem.storage_width || 0,
                    storage_height: subitem.storage_height || 0,
                    localization: subitem.localization || '',
                    subitems: subitem.subitems && subitem.subitems.length > 0 ? JSON.parse(JSON.stringify(subitem.subitems)) : [],
                    canHaveSubitems: subitem.canHaveSubitems || false,
                    compatibleChildren: subitem.compatibleChildren || [],
                    img: subitem.img || null
                };
            });
            
            console.log('Subitems para salvar:', subitemsToSave.length);
            
            // IMPORTANTE: Atualizar diretamente no subitem usando a referência encontrada
            // Isso garante que estamos atualizando a referência correta na hierarquia
            // Usar both approaches: atualizar via parentArray E diretamente no subitem
            if (currentParentArray && currentParentArray[currentIndex] && currentParentArray[currentIndex] === currentSubitem) {
                // Confirmar que a referência está correta
                currentParentArray[currentIndex].subitems = JSON.parse(JSON.stringify(subitemsToSave));
                currentSubitem.subitems = JSON.parse(JSON.stringify(subitemsToSave)); // Garantir sincronização
                console.log('✅ Subitems salvos via parentArray para subitem:', currentParentArray[currentIndex].name);
                console.log('✅ Subitems salvos:', currentParentArray[currentIndex].subitems);
            } else if (currentSubitem) {
                // Atualizar diretamente no subitem encontrado (a referência é a mesma na hierarquia)
                currentSubitem.subitems = JSON.parse(JSON.stringify(subitemsToSave));
                console.log('✅ Subitems salvos diretamente no subitem:', currentSubitem.name);
                console.log('✅ Subitems salvos:', currentSubitem.subitems);
                
                // Também atualizar via parentArray se possível
                if (currentParentArray && currentParentArray[currentIndex]) {
                    currentParentArray[currentIndex].subitems = JSON.parse(JSON.stringify(subitemsToSave));
                }
            } else {
                console.error('❌ Erro: Não foi possível encontrar referência válida para atualizar');
            }
            
            // Verificar se a atualização foi propagada
            console.log('Subitem após atualização:', JSON.stringify(currentSubitem.subitems || []));
        } else {
            // Se não há subitems selecionados, limpar array
            console.log('⚠️ AVISO: currentSelectedSubitems está vazio ou não existe');
            console.log('currentSelectedSubitems:', currentSelectedSubitems);
            console.log('Limpar array de subitems do subitem');
            
            // Limpar array de subitems
            if (currentSubitem) {
                currentSubitem.subitems = [];
            }
            if (currentParentArray && currentParentArray[currentIndex]) {
                currentParentArray[currentIndex].subitems = [];
            }
        }
        
        console.log('=== FIM DEBUG ===');
        
        // Verificar se a atualização foi propagada corretamente na hierarquia
        // Criar função local para buscar novamente
        const findSubitemForVerification = function(item, targetNameType) {
            if (item.subitems && item.subitems.length > 0) {
                for (let i = 0; i < item.subitems.length; i++) {
                    if (item.subitems[i].name_type === targetNameType) {
                        return item.subitems[i];
                    }
                    const found = findSubitemForVerification(item.subitems[i], targetNameType);
                    if (found) return found;
                }
            }
            return null;
        };
        
        const verifySubitem = findSubitemForVerification(mainItemCurrent, subitemNameType);
        if (verifySubitem) {
            console.log('✅ Verificação: Subitem após atualização na hierarquia:', verifySubitem.name);
            console.log('✅ Subitems após atualização:', verifySubitem.subitems);
            
            // Verificar se os subitems foram salvos corretamente
            const hasSubitems = verifySubitem.subitems && verifySubitem.subitems.length > 0;
            if (hasSubitems) {
                console.log('✅ SUCESSO: Subitems persistidos corretamente na hierarquia');
            } else {
                console.warn('⚠️ AVISO: Subitems não foram encontrados após atualização');
            }
        }
        
        // Remover item temporário
        if (selectedItems.length > tempIndex && selectedItems[tempIndex] === tempItem) {
            selectedItems.pop();
        }
        
        // Restaurar função original
        window.saveSubitemsConfiguration = originalSave;
        
        // Atualizar display e preview
        updateSelectedItemsDisplay();
        updateJSONPreview();
        markLoadoutChanged();
        
        // Verificar novamente após atualizar display
        const finalCheck = findSubitemForVerification(mainItemCurrent, subitemNameType);
        if (finalCheck) {
            console.log('✅ Verificação final: Subitems na hierarquia:', finalCheck.subitems);
        }
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('subitemsModal'));
        if (modal) {
            modal.hide();
        }
        } else {
            console.log('❌ Não é subitem, chamando função original');
            // Não é um subitem, chamar função original
            return originalSave.apply(this, arguments);
        }
    };
    
    // Também atualizar cancelar do modal para remover item temporário
    $('#subitemsModal').one('hidden.bs.modal', function() {
        // Remover item temporário se ainda existir
        if (selectedItems.length > tempIndex && selectedItems[tempIndex] === tempItem) {
            selectedItems.pop();
        }
        // Restaurar função original
        window.saveSubitemsConfiguration = originalSave;
    });
}

function calculateItemDepth(item, targetSubitem, currentDepth = 0) {
    if (item.subitems && item.subitems.length > 0) {
        for (let i = 0; i < item.subitems.length; i++) {
            if (item.subitems[i].name_type === targetSubitem.name_type) {
                return currentDepth + 1;
            }
            const depth = calculateItemDepth(item.subitems[i], targetSubitem, currentDepth + 1);
            if (depth > 0) return depth;
        }
    }
    return 0;
}

function buildItemPath(item, targetSubitem, currentPath = '') {
    const newPath = currentPath ? `${currentPath} > ${item.name}` : item.name;
    
    if (item.subitems && item.subitems.length > 0) {
        for (let i = 0; i < item.subitems.length; i++) {
            if (item.subitems[i].name_type === targetSubitem.name_type) {
                return `${newPath} > ${targetSubitem.name}`;
            }
            const path = buildItemPath(item.subitems[i], targetSubitem, newPath);
            if (path) return path;
        }
    }
    return '';
}

function removeItemFromLoadout(index) {
    selectedItems.splice(index, 1);
    updateSelectedItemsDisplay();
    updateJSONPreview();
    applyItemFiltersLoadout();
    markLoadoutChanged();
}

function removeItemFromLoadoutByGrid(itemId, gridId) {
    // Encontrar índice do item
    const index = selectedItems.findIndex(i => i.id === itemId);
    if (index >= 0) {
        // Salvar posição de scroll antes de remover
        const grid = document.getElementById(gridId);
        const savedScroll = grid ? grid.scrollLeft : 0;
        
        // Remover item
        selectedItems.splice(index, 1);
        updateSelectedItemsDisplay();
        updateJSONPreview();
        
        // Aplicar filtros (isso vai re-renderizar os grids)
        applyItemFiltersLoadout();
        markLoadoutChanged();
        
        // Restaurar scroll após um pequeno delay
        setTimeout(function() {
            if (grid) {
                grid.scrollLeft = savedScroll;
            }
        }, 10);
    }
}

function removeSubitemFromLoadout(parentItemIndex, subitemNameType) {
    // Confirmar remoção
    if (!confirm(`Tem certeza que deseja remover este subitem?`)) {
        return;
    }
    
    // Encontrar o item principal
    const mainItem = selectedItems[parentItemIndex];
    if (!mainItem) {
        showAlert('danger', 'Item principal não encontrado.');
        return;
    }
    
    // Função para encontrar subitem na hierarquia e retornar referências para remoção
    const findSubitemInHierarchyWithPath = function(item, targetNameType, currentPath = []) {
        if (item.subitems && item.subitems.length > 0) {
            for (let i = 0; i < item.subitems.length; i++) {
                const subitem = item.subitems[i];
                const newPath = [...currentPath, i];
                
                if (subitem.name_type === targetNameType) {
                    return { subitem: subitem, path: newPath, parentArray: item.subitems, index: i };
                }
                
                // Buscar recursivamente em subitems
                const found = findSubitemInHierarchyWithPath(subitem, targetNameType, newPath);
                if (found) return found;
            }
        }
        return null;
    };
    
    // Encontrar o subitem na hierarquia
    const found = findSubitemInHierarchyWithPath(mainItem, subitemNameType);
    if (!found || !found.subitem) {
        showAlert('warning', 'Subitem não encontrado na hierarquia.');
        console.error('Subitem não encontrado:', subitemNameType, 'em item:', mainItem.name);
        return;
    }
    
    // Remover o subitem do array usando a referência encontrada
    const parentArray = found.parentArray;
    const index = found.index;
    
    if (parentArray && parentArray[index]) {
        parentArray.splice(index, 1);
        console.log('✅ Subitem removido:', found.subitem.name, 'do item:', mainItem.name);
        
        // Atualizar display e preview
        updateSelectedItemsDisplay();
        updateJSONPreview();
        applyItemFiltersLoadout();
        markLoadoutChanged();
        
        showAlert('success', 'Subitem removido com sucesso.');
    } else {
        showAlert('danger', 'Erro ao remover subitem.');
        console.error('Não foi possível encontrar referência válida para remover:', subitemNameType);
    }
}

// Variáveis globais para subitems modal
let currentSubitemsData = []; // Items compatíveis filtrados
let currentSelectedSubitems = []; // Subitems selecionados no modal
let subitemsModalContextStack = []; // Pilha de contextos para navegação recursiva
let currentSubitemsContext = null; // Contexto atual do modal (null = nível principal)

// Função auxiliar para criar contexto do modal
function createSubitemsModalContext(itemIndex, itemData, selectedSubitems, parentPath, breadcrumb) {
    return {
        itemIndex: itemIndex,
        itemData: JSON.parse(JSON.stringify(itemData)), // Deep copy
        selectedSubitems: JSON.parse(JSON.stringify(selectedSubitems)), // Deep copy
        parentPath: parentPath ? [...parentPath] : [], // Cópia do array
        breadcrumb: breadcrumb || ''
    };
}

// Função auxiliar para atualizar breadcrumb no modal
function updateSubitemsModalBreadcrumb() {
    const breadcrumbContainer = $('#subitemsBreadcrumb');
    if (!breadcrumbContainer.length) return;
    
    const itemIndex = parseInt($('#subitemsItemIndex').val());
    const item = selectedItems[itemIndex];
    if (!item) return;
    
    let breadcrumbHtml = '<nav aria-label="breadcrumb"><ol class="breadcrumb mb-2">';
    
    // Se estamos no nível principal
    if (!currentSubitemsContext && subitemsModalContextStack.length === 0) {
        breadcrumbHtml += `<li class="breadcrumb-item active">${item.name}</li>`;
    } else {
        // Sempre adicionar item principal como primeiro nível (clicável para voltar)
        breadcrumbHtml += `<li class="breadcrumb-item"><a href="#" onclick="navigateToSubitemsLevel(-1); return false;">${item.name}</a></li>`;
        
        // Adicionar níveis anteriores da pilha
        subitemsModalContextStack.forEach(function(context, index) {
            breadcrumbHtml += `<li class="breadcrumb-item"><a href="#" onclick="navigateToSubitemsLevel(${index}); return false;">${context.itemData.name}</a></li>`;
        });
        
        // Adicionar nível atual
        if (currentSubitemsContext) {
            breadcrumbHtml += `<li class="breadcrumb-item active">${currentSubitemsContext.itemData.name}</li>`;
        } else {
            breadcrumbHtml += `<li class="breadcrumb-item active">${item.name}</li>`;
        }
    }
    
    breadcrumbHtml += '</ol></nav>';
    breadcrumbContainer.html(breadcrumbHtml);
}

// Função auxiliar para salvar subitems em um item usando parentPath
function saveSubitemsToItem(targetItem, parentPath, subitemsToSave) {
    console.log('=== saveSubitemsToItem INÍCIO ===');
    console.log('targetItem:', targetItem.name || targetItem.name_type);
    console.log('parentPath:', parentPath);
    console.log('subitemsToSave count:', subitemsToSave.length);
    
    if (!parentPath || parentPath.length === 0) {
        console.log('Salvando diretamente (sem parentPath)');
        targetItem.subitems = JSON.parse(JSON.stringify(subitemsToSave));
        console.log('=== saveSubitemsToItem FIM (direto) ===');
        return targetItem;
    }
    
    // Navegar pelo caminho até o subitem correto
    let currentItem = targetItem;
    for (let i = 0; i < parentPath.length; i++) {
        const pathIndex = parentPath[i];
        console.log(`Navegando nível ${i}, índice ${pathIndex}`);
        console.log('currentItem:', currentItem.name || currentItem.name_type);
        console.log('currentItem.subitems existe?', !!currentItem.subitems);
        console.log('currentItem.subitems.length:', currentItem.subitems ? currentItem.subitems.length : 'N/A');
        
        if (currentItem.subitems && currentItem.subitems[pathIndex]) {
            console.log(`✓ Item encontrado no índice ${pathIndex}:`, currentItem.subitems[pathIndex].name || currentItem.subitems[pathIndex].name_type);
            currentItem = currentItem.subitems[pathIndex];
        } else {
            console.error('✗ ERRO: Caminho inválido ao salvar subitems');
            console.error('pathIndex:', pathIndex);
            console.error('currentItem.subitems:', currentItem.subitems);
            console.error('parentPath completo:', parentPath);
            console.error('Nível que falhou:', i);
            console.error('=== saveSubitemsToItem FIM (erro) ===');
            return null;
        }
    }
    
    console.log('✓ Navegação completa! Salvando subitems em:', currentItem.name || currentItem.name_type);
    currentItem.subitems = JSON.parse(JSON.stringify(subitemsToSave));
    console.log('=== saveSubitemsToItem FIM (sucesso) ===');
    return currentItem;
}

// Função auxiliar para atualizar visibilidade do botão voltar
function updateBackButtonVisibility() {
    const backButton = $('#btnBackSubitemsModal');
    if (backButton.length) {
        if (subitemsModalContextStack.length > 0 || currentSubitemsContext !== null) {
            backButton.show();
        } else {
            backButton.hide();
        }
    }
}

function openSubitemsModal(itemIndex) {
    const item = selectedItems[itemIndex];
    if (!item) return;
    
    if (!item.canHaveSubitems || !item.compatibleChildren || item.compatibleChildren.length === 0) {
        showAlert('info', 'Este item não pode receber subitems ou não possui subitems compatíveis.');
        return;
    }
    
    // Resetar pilha de contexto quando abrir do nível principal
    subitemsModalContextStack = [];
    currentSubitemsContext = null;
    
    // Salvar contexto do modal
    $('#subitemsItemIndex').val(itemIndex);
    $('#subitemsItemIndex').data('original-item-index', itemIndex);
    
    // Atualizar título
    $('#subitemsParentName').text(item.name);
    
    // Atualizar informações
    $('#subitemsParentInfo').html(`
        Item: <strong>${item.name}</strong> | 
        Subitems compatíveis: <strong>${item.compatibleChildren.length}</strong> | 
        Subitems selecionados: <strong>${item.subitems ? item.subitems.length : 0}</strong>
    `);
    
    // Inicializar arrays
    currentSubitemsData = [];
    currentSelectedSubitems = item.subitems ? JSON.parse(JSON.stringify(item.subitems)) : []; // Deep copy
    
    // Filtrar itemsDataLoadout para pegar apenas os compatíveis
    const compatibleIds = item.compatibleChildren.map(child => child.id || child);
    currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
    
    // Carregar tipos de item no filtro
    loadSubitemTypes();
    
    // Renderizar grid e lista de selecionados
    renderSubitemsGrid();
    updateSelectedSubitemsDisplay();
    updateSubitemsModalBreadcrumb();
    
    // Mostrar/ocultar botão voltar baseado na pilha
    updateBackButtonVisibility();
    
    // Inicializar event listeners dos filtros
    initSubitemsFilters();
    
    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('subitemsModal'));
    modal.show();
}

function loadSubitemTypes() {
    const select = $('#filterSubitemType');
    select.empty();
    select.append('<option value="">Todos os Tipos</option>');
    
    // Pegar tipos únicos dos items compatíveis
    const types = {};
    currentSubitemsData.forEach(item => {
        if (item.type_id && itemTypesDataLoadout) {
            const type = itemTypesDataLoadout.find(t => t.id === item.type_id);
            if (type && !types[type.id]) {
                types[type.id] = type.name;
                select.append(`<option value="${type.id}">${type.name}</option>`);
            }
        }
    });
}

function initSubitemsFilters() {
    // Remover listeners anteriores para evitar duplicação
    $('#subitemSearchInput').off('input');
    $('#filterSubitemType').off('change');
    $('#filterSubitemLocation').off('change');
    $('#filterSubitemStorage').off('change');
    
    // Adicionar novos listeners
    $('#subitemSearchInput').on('input', applySubitemsFilters);
    $('#filterSubitemType').on('change', applySubitemsFilters);
    $('#filterSubitemLocation').on('change', applySubitemsFilters);
    $('#filterSubitemStorage').on('change', applySubitemsFilters);
}

function applySubitemsFilters() {
    const search = $('#subitemSearchInput').val().toLowerCase();
    const typeId = $('#filterSubitemType').val();
    const location = $('#filterSubitemLocation').val();
    const storage = $('#filterSubitemStorage').val();
    
    // Buscar item principal (sempre é item principal agora, sem recursão dentro do modal)
    const itemIndex = parseInt($('#subitemsItemIndex').val());
    const item = selectedItems[itemIndex];
    
    if (!item || !item.compatibleChildren) return;
    
    const compatibleIds = item.compatibleChildren.map(child => child.id || child);
    
    if (compatibleIds.length === 0) return;
    
    // Filtrar itemsDataLoadout pelos compatíveis e pelos filtros
    let filtered = itemsDataLoadout.filter(function(subitem) {
        // Verificar se está na lista de compatíveis
        if (!compatibleIds.includes(subitem.id)) return false;
        
        let match = true;
        
        if (search) {
            match = match && (subitem.name.toLowerCase().includes(search) || 
                             subitem.name_type.toLowerCase().includes(search));
        }
        
        if (typeId) {
            match = match && subitem.type_id == typeId;
        }
        
        if (location !== '' && location !== 'none') {
            match = match && subitem.localization === location;
        } else if (location === 'none') {
            match = match && (!subitem.localization || subitem.localization === '');
        }
        
        if (storage === 'with') {
            match = match && subitem.storage_slots > 0;
        } else if (storage === 'without') {
            match = match && subitem.storage_slots === 0;
        }
        
        return match;
    });
    
    currentSubitemsData = filtered;
    renderSubitemsGrid();
}

function renderSubitemsGrid() {
    const grid = $('#subitemsGrid');
    grid.empty();
    
    if (currentSubitemsData.length === 0) {
        grid.html('<p class="text-muted text-center p-3">Nenhum subitem disponível com os filtros selecionados.</p>');
        return;
    }
    
    currentSubitemsData.forEach(function(subitem) {
        // Verificar se já está selecionado
        const isSelected = currentSelectedSubitems.some(s => s.id === subitem.id || s.name_type === subitem.name_type);
        
        const card = $(`
            <div class="weapon-card ${isSelected ? 'selected' : ''}" data-subitem-id="${subitem.id}">
                <div class="card h-100">
                    <div class="card-img-top-container">
                        <img src="${subitem.img || 'https://via.placeholder.com/150?text=No+Image'}" 
                             class="card-img-top" 
                             alt="${subitem.name}"
                             onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
                        ${isSelected ? '<div class="selected-badge"><i class="fas fa-check-circle"></i></div>' : ''}
                    </div>
                    <div class="card-body">
                        <h6 class="card-title">${subitem.name}</h6>
                        <p class="card-text small text-muted">${subitem.name_type}</p>
                        ${subitem.localization ? `<p class="card-text small"><i class="fas fa-map-marker-alt"></i> ${subitem.localization}</p>` : ''}
                        ${subitem.storage_slots > 0 ? `<p class="card-text small"><i class="fas fa-box"></i> Storage: ${subitem.storage_slots} slots</p>` : ''}
                    </div>
                    <div class="card-footer">
                        ${isSelected ? 
                            `<button class="btn btn-sm btn-danger w-100" onclick="removeSubitemFromSelection(${subitem.id}); return false;">
                                <i class="fas fa-times"></i> Remover
                            </button>` :
                            `<button class="btn btn-sm btn-primary w-100" onclick="selectSubitemForItem(${subitem.id}); return false;">
                                <i class="fas fa-plus"></i> Adicionar
                            </button>`
                        }
                    </div>
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function selectSubitemForItem(subitemId) {
    // Buscar item nos dados carregados
    const subitem = itemsDataLoadout.find(i => i.id === subitemId);
    if (!subitem) {
        showAlert('danger', 'Subitem não encontrado.');
        return;
    }
    
    // Verificar se já está selecionado
    if (currentSelectedSubitems.some(s => s.id === subitemId || s.name_type === subitem.name_type)) {
        showAlert('info', 'Este subitem já está selecionado.');
        return;
    }
    
    // Buscar compatibilidade do subitem (para saber se pode ter seus próprios subitems)
    $.ajax({
        url: `/api/manage/items/${subitemId}/compatibility`,
        method: 'GET',
        success: function(response) {
            try {
                const compatibility = response.compatibility || { children: [] };
                
                // Criar objeto do subitem
                const subitemObj = {
                    id: subitem.id,
                    name: subitem.name,
                    name_type: subitem.name_type,
                    type_name: subitem.type_name || '',
                    slots: subitem.slots,
                    width: subitem.width,
                    height: subitem.height,
                    storage_slots: subitem.storage_slots || 0,
                    storage_width: subitem.storage_width || 0,
                    storage_height: subitem.storage_height || 0,
                    localization: subitem.localization || '',
                    subitems: [],
                    canHaveSubitems: compatibility.children && compatibility.children.length > 0,
                    compatibleChildren: compatibility.children || [],
                    img: subitem.img || null
                };
                
                // Adicionar à lista de selecionados
                currentSelectedSubitems.push(subitemObj);
                
                // Atualizar display
                updateSelectedSubitemsDisplay();
                renderSubitemsGrid();
            } catch (error) {
                showAlert('danger', 'Erro ao processar compatibilidade do subitem: ' + error.message);
                console.error('Erro ao processar resposta:', error);
            }
        },
        error: function(xhr) {
            // Adicionar mesmo sem compatibilidade
            console.warn('Não foi possível carregar compatibilidade do subitem, adicionando sem subitems:', xhr);
            
            const subitemObj = {
                id: subitem.id,
                name: subitem.name,
                name_type: subitem.name_type,
                type_name: subitem.type_name || '',
                slots: subitem.slots,
                width: subitem.width,
                height: subitem.height,
                storage_slots: subitem.storage_slots || 0,
                storage_width: subitem.storage_width || 0,
                storage_height: subitem.storage_height || 0,
                localization: subitem.localization || '',
                subitems: [],
                canHaveSubitems: false,
                compatibleChildren: [],
                img: subitem.img || null
            };
            
            currentSelectedSubitems.push(subitemObj);
            updateSelectedSubitemsDisplay();
            renderSubitemsGrid();
        }
    });
}

function removeSubitemFromSelection(subitemId) {
    const index = currentSelectedSubitems.findIndex(s => s.id === subitemId);
    if (index >= 0) {
        currentSelectedSubitems.splice(index, 1);
        updateSelectedSubitemsDisplay();
        renderSubitemsGrid();
    }
}

function updateSelectedSubitemsDisplay() {
    const container = $('#selectedSubitemsList');
    container.empty();
    
    if (currentSelectedSubitems.length === 0) {
        container.html('<span class="text-muted">Nenhum subitem selecionado</span>');
        return;
    }
    
    currentSelectedSubitems.forEach(function(subitem, index) {
        const card = $(`
            <div class="card mb-2">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="d-flex align-items-center flex-grow-1">
                            <img src="${subitem.img || 'https://via.placeholder.com/60?text=No+Image'}" 
                                 alt="${subitem.name}" 
                                 class="img-thumbnail me-2" 
                                 style="width: 60px; height: 60px; object-fit: cover;"
                                 onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
                            <div>
                                <strong>${subitem.name}</strong>
                                ${subitem.localization ? `<br><small class="text-muted">Localização: ${subitem.localization}</small>` : ''}
                                ${subitem.canHaveSubitems ? `<br><small class="text-info">Pode receber subitems</small>` : ''}
                                ${subitem.subitems && subitem.subitems.length > 0 ? `<br><small class="text-secondary">Subitems: ${subitem.subitems.length}</small>` : ''}
                            </div>
                        </div>
                        <div class="ms-3">
                            ${subitem.canHaveSubitems ? `
                                <button class="btn btn-sm btn-info me-1" onclick="openSubitemsModalForSubitemInModal(${index}); return false;" title="Configurar Subitems">
                                    <i class="fas fa-layer-group"></i> Subitems
                                    ${subitem.subitems && subitem.subitems.length > 0 ? ` <span class="badge bg-light text-dark">${subitem.subitems.length}</span>` : ''}
                                </button>
                            ` : ''}
                            <button class="btn btn-sm btn-danger" onclick="removeSubitemFromSelection(${subitem.id}); return false;">
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

// Função para abrir modal recursivamente para subitems de um subitem dentro do modal
function openSubitemsModalForSubitemInModal(subitemIndex) {
    const subitem = currentSelectedSubitems[subitemIndex];
    if (!subitem) {
        showAlert('danger', 'Subitem não encontrado.');
        return;
    }
    
    if (!subitem.canHaveSubitems || !subitem.compatibleChildren || subitem.compatibleChildren.length === 0) {
        showAlert('info', 'Este subitem não pode receber subitems ou não possui subitems compatíveis.');
        return;
    }
    
    // Obter itemIndex original do modal
    const originalItemIndex = parseInt($('#subitemsItemIndex').val());
    const originalItem = selectedItems[originalItemIndex];
    if (!originalItem) {
        showAlert('danger', 'Item principal não encontrado.');
        return;
    }
    
    // Salvar contexto atual na pilha antes de navegar
    if (currentSubitemsContext) {
        // Se já estamos em um nível recursivo, salvar contexto atual na pilha
        // Atualizar os selectedSubitems do contexto atual antes de salvar
        currentSubitemsContext.selectedSubitems = JSON.parse(JSON.stringify(currentSelectedSubitems));
        subitemsModalContextStack.push(currentSubitemsContext);
    } else {
        // Se não há contexto atual, criar um para o nível principal
        const mainContext = createSubitemsModalContext(
            originalItemIndex,
            originalItem,
            currentSelectedSubitems,
            [],
            originalItem.name
        );
        subitemsModalContextStack.push(mainContext);
    }
    
    // Calcular parentPath para o novo nível
    const newParentPath = currentSubitemsContext ? 
        [...currentSubitemsContext.parentPath, subitemIndex] : 
        [subitemIndex];
    
    // Calcular breadcrumb para o novo nível
    const newBreadcrumb = currentSubitemsContext ? 
        `${currentSubitemsContext.breadcrumb} > ${subitem.name}` : 
        `${originalItem.name} > ${subitem.name}`;
    
    // Definir novo contexto atual
    currentSubitemsContext = createSubitemsModalContext(
        originalItemIndex,
        subitem,
        subitem.subitems ? JSON.parse(JSON.stringify(subitem.subitems)) : [],
        newParentPath,
        newBreadcrumb
    );
    
    // Atualizar título
    $('#subitemsParentName').text(subitem.name);
    
    // Atualizar informações
    $('#subitemsParentInfo').html(`
        Item: <strong>${subitem.name}</strong> | 
        Subitems compatíveis: <strong>${subitem.compatibleChildren.length}</strong> | 
        Subitems selecionados: <strong>${subitem.subitems ? subitem.subitems.length : 0}</strong>
    `);
    
    // Atualizar arrays para o novo nível
    currentSelectedSubitems = currentSubitemsContext.selectedSubitems;
    
    // Filtrar itemsDataLoadout para pegar apenas os compatíveis
    const compatibleIds = subitem.compatibleChildren.map(child => child.id || child);
    currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
    
    // Carregar tipos de item no filtro
    loadSubitemTypes();
    
    // Renderizar grid e lista de selecionados
    renderSubitemsGrid();
    updateSelectedSubitemsDisplay();
    updateSubitemsModalBreadcrumb();
    updateBackButtonVisibility();
    
    // Inicializar event listeners dos filtros
    initSubitemsFilters();
}

// Função para voltar um nível na hierarquia
function navigateBackInSubitemsModal() {
    if (subitemsModalContextStack.length === 0 && currentSubitemsContext === null) {
        // Já estamos no nível principal, não há para onde voltar
        return;
    }
    
    // Obter itemIndex original
    const originalItemIndex = parseInt($('#subitemsItemIndex').val());
    const originalItem = selectedItems[originalItemIndex];
    if (!originalItem) {
        showAlert('danger', 'Item principal não encontrado.');
        return;
    }
    
    // Se estamos em um nível recursivo, atualizar os subitems do contexto atual
    // antes de voltar, para preservar as alterações
    if (currentSubitemsContext && currentSubitemsContext.parentPath && currentSubitemsContext.parentPath.length > 0) {
        // Salvar subitems do nível atual antes de voltar
        const subitemsToSave = currentSelectedSubitems.map(function(subitem) {
            return {
                id: subitem.id,
                name: subitem.name,
                name_type: subitem.name_type,
                type_name: subitem.type_name || '',
                slots: subitem.slots,
                width: subitem.width,
                height: subitem.height,
                storage_slots: subitem.storage_slots || 0,
                storage_width: subitem.storage_width || 0,
                storage_height: subitem.storage_height || 0,
                localization: subitem.localization || '',
                subitems: subitem.subitems && subitem.subitems.length > 0 ? JSON.parse(JSON.stringify(subitem.subitems)) : [],
                canHaveSubitems: subitem.canHaveSubitems || false,
                compatibleChildren: subitem.compatibleChildren || [],
                img: subitem.img || null
            };
        });
        
        // Atualizar no item principal usando parentPath
        saveSubitemsToItem(originalItem, currentSubitemsContext.parentPath, subitemsToSave);
        
        // Atualizar no contexto da pilha se existir
        if (subitemsModalContextStack.length > 0) {
            const lastContext = subitemsModalContextStack[subitemsModalContextStack.length - 1];
            if (lastContext && lastContext.selectedSubitems) {
                const parentIndex = currentSubitemsContext.parentPath[currentSubitemsContext.parentPath.length - 1];
                if (lastContext.selectedSubitems[parentIndex]) {
                    lastContext.selectedSubitems[parentIndex].subitems = JSON.parse(JSON.stringify(subitemsToSave));
                }
            }
        }
    }
    
    // Restaurar contexto anterior
    if (subitemsModalContextStack.length > 0) {
        const previousContext = subitemsModalContextStack.pop();
        currentSubitemsContext = previousContext;
        
        // Atualizar arrays
        currentSelectedSubitems = previousContext.selectedSubitems;
        
        // Filtrar itemsDataLoadout para pegar apenas os compatíveis
        const compatibleIds = previousContext.itemData.compatibleChildren.map(child => child.id || child);
        currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
        
        // Atualizar título
        $('#subitemsParentName').text(previousContext.itemData.name);
        
        // Atualizar informações
        $('#subitemsParentInfo').html(`
            Item: <strong>${previousContext.itemData.name}</strong> | 
            Subitems compatíveis: <strong>${previousContext.itemData.compatibleChildren.length}</strong> | 
            Subitems selecionados: <strong>${previousContext.selectedSubitems.length}</strong>
        `);
    } else {
        // Voltar para o nível principal
        currentSubitemsContext = null;
        currentSelectedSubitems = originalItem.subitems ? JSON.parse(JSON.stringify(originalItem.subitems)) : [];
        
        // Filtrar itemsDataLoadout para pegar apenas os compatíveis
        const compatibleIds = originalItem.compatibleChildren.map(child => child.id || child);
        currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
        
        // Atualizar título
        $('#subitemsParentName').text(originalItem.name);
        
        // Atualizar informações
        $('#subitemsParentInfo').html(`
            Item: <strong>${originalItem.name}</strong> | 
            Subitems compatíveis: <strong>${originalItem.compatibleChildren.length}</strong> | 
            Subitems selecionados: <strong>${originalItem.subitems ? originalItem.subitems.length : 0}</strong>
        `);
    }
    
    // Carregar tipos de item no filtro
    loadSubitemTypes();
    
    // Renderizar grid e lista de selecionados
    renderSubitemsGrid();
    updateSelectedSubitemsDisplay();
    updateSubitemsModalBreadcrumb();
    updateBackButtonVisibility();
    
    // Inicializar event listeners dos filtros
    initSubitemsFilters();
}

// Função para navegar para um nível específico (usada pelo breadcrumb)
function navigateToSubitemsLevel(stackIndex) {
    // Obter itemIndex original
    const originalItemIndex = parseInt($('#subitemsItemIndex').val());
    const originalItem = selectedItems[originalItemIndex];
    if (!originalItem) {
        showAlert('danger', 'Item principal não encontrado.');
        return;
    }
    
    // Se estamos em um nível recursivo, salvar alterações antes de navegar
    if (currentSubitemsContext && currentSubitemsContext.parentPath && currentSubitemsContext.parentPath.length > 0) {
        const subitemsToSave = currentSelectedSubitems.map(function(subitem) {
            return {
                id: subitem.id,
                name: subitem.name,
                name_type: subitem.name_type,
                type_name: subitem.type_name || '',
                slots: subitem.slots,
                width: subitem.width,
                height: subitem.height,
                storage_slots: subitem.storage_slots || 0,
                storage_width: subitem.storage_width || 0,
                storage_height: subitem.storage_height || 0,
                localization: subitem.localization || '',
                subitems: subitem.subitems && subitem.subitems.length > 0 ? JSON.parse(JSON.stringify(subitem.subitems)) : [],
                canHaveSubitems: subitem.canHaveSubitems || false,
                compatibleChildren: subitem.compatibleChildren || [],
                img: subitem.img || null
            };
        });
        
        // Salvar no item principal
        saveSubitemsToItem(originalItem, currentSubitemsContext.parentPath, subitemsToSave);
        
        // Atualizar nos contextos da pilha
        if (subitemsModalContextStack.length > 0) {
            const lastContext = subitemsModalContextStack[subitemsModalContextStack.length - 1];
            if (lastContext && lastContext.selectedSubitems) {
                const parentIndex = currentSubitemsContext.parentPath[currentSubitemsContext.parentPath.length - 1];
                if (lastContext.selectedSubitems[parentIndex]) {
                    lastContext.selectedSubitems[parentIndex].subitems = JSON.parse(JSON.stringify(subitemsToSave));
                }
            }
        }
    }
    
    // Se stackIndex é -1, voltar ao nível principal
    if (stackIndex < 0) {
        // Limpar contextos e voltar ao principal
        subitemsModalContextStack = [];
        currentSubitemsContext = null;
        currentSelectedSubitems = originalItem.subitems ? JSON.parse(JSON.stringify(originalItem.subitems)) : [];
        
        const compatibleIds = originalItem.compatibleChildren.map(child => child.id || child);
        currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
        
        $('#subitemsParentName').text(originalItem.name);
        $('#subitemsParentInfo').html(`
            Item: <strong>${originalItem.name}</strong> | 
            Subitems compatíveis: <strong>${originalItem.compatibleChildren.length}</strong> | 
            Subitems selecionados: <strong>${originalItem.subitems ? originalItem.subitems.length : 0}</strong>
        `);
        
        loadSubitemTypes();
        renderSubitemsGrid();
        updateSelectedSubitemsDisplay();
        updateSubitemsModalBreadcrumb();
        updateBackButtonVisibility();
        initSubitemsFilters();
        return;
    }
    
    // Navegar até o nível desejado, descartando contextos mais profundos
    // Mas primeiro, salvar alterações dos contextos que serão descartados
    while (subitemsModalContextStack.length > stackIndex + 1) {
        const contextToDiscard = subitemsModalContextStack.pop();
        // Não precisamos salvar pois o contexto atual já foi salvo acima
    }
    
    // Restaurar contexto do índice desejado
    if (stackIndex < subitemsModalContextStack.length) {
        const targetContext = subitemsModalContextStack[stackIndex];
        if (targetContext) {
            currentSubitemsContext = targetContext;
            currentSelectedSubitems = targetContext.selectedSubitems;
            
            const compatibleIds = targetContext.itemData.compatibleChildren.map(child => child.id || child);
            currentSubitemsData = itemsDataLoadout.filter(i => compatibleIds.includes(i.id));
            
            $('#subitemsParentName').text(targetContext.itemData.name);
            $('#subitemsParentInfo').html(`
                Item: <strong>${targetContext.itemData.name}</strong> | 
                Subitems compatíveis: <strong>${targetContext.itemData.compatibleChildren.length}</strong> | 
                Subitems selecionados: <strong>${targetContext.selectedSubitems.length}</strong>
            `);
            
            loadSubitemTypes();
            renderSubitemsGrid();
            updateSelectedSubitemsDisplay();
            updateSubitemsModalBreadcrumb();
            updateBackButtonVisibility();
            initSubitemsFilters();
            return;
        }
    }
    
    // Se chegou aqui, algo deu errado, voltar ao nível principal
    navigateBackInSubitemsModal();
}

function saveSubitemsConfiguration() {
    const itemIndex = parseInt($('#subitemsItemIndex').val());
    const item = selectedItems[itemIndex];
    
    if (!item) {
        showAlert('danger', 'Item não encontrado.');
        return;
    }
    
    // Fazer deep copy dos subitems selecionados para garantir que todas as propriedades sejam copiadas
    // Preservar subitems recursivos existentes nos objetos
    const subitemsToSave = currentSelectedSubitems.map(function(subitem) {
        return {
            id: subitem.id,
            name: subitem.name,
            name_type: subitem.name_type,
            type_name: subitem.type_name || '',
            slots: subitem.slots,
            width: subitem.width,
            height: subitem.height,
            storage_slots: subitem.storage_slots || 0,
            storage_width: subitem.storage_width || 0,
            storage_height: subitem.storage_height || 0,
            localization: subitem.localization || '',
            subitems: subitem.subitems && subitem.subitems.length > 0 ? JSON.parse(JSON.stringify(subitem.subitems)) : [],
            canHaveSubitems: subitem.canHaveSubitems || false,
            compatibleChildren: subitem.compatibleChildren || [],
            img: subitem.img || null
        };
    });
    
    // Debug: estado inicial
    console.log('=== saveSubitemsConfiguration DEBUG ===');
    console.log('itemIndex:', itemIndex);
    console.log('item:', item.name || item.name_type);
    console.log('item.subitems:', item.subitems);
    console.log('currentSubitemsContext:', currentSubitemsContext);
    console.log('subitemsModalContextStack.length:', subitemsModalContextStack.length);
    console.log('subitemsToSave count:', subitemsToSave.length);
    
    // Se estamos em nível recursivo, salvar usando parentPath
    if (currentSubitemsContext && currentSubitemsContext.parentPath && currentSubitemsContext.parentPath.length > 0) {
        console.log('Modo recursivo detectado, parentPath:', currentSubitemsContext.parentPath);
        
        // CORREÇÃO: Antes de salvar recursivamente, garantir que item.subitems
        // contenha os subitems do nível anterior (da pilha de contexto)
        if (subitemsModalContextStack.length > 0) {
            const parentContext = subitemsModalContextStack[subitemsModalContextStack.length - 1];
            if (parentContext && parentContext.selectedSubitems) {
                // Atualizar item.subitems com os dados do contexto pai
                item.subitems = JSON.parse(JSON.stringify(parentContext.selectedSubitems));
                console.log('DEBUG: item.subitems atualizado do contexto pai:', item.subitems.length);
            }
        }
        
        // Agora salvar subitems no nível correto da hierarquia
        const saved = saveSubitemsToItem(item, currentSubitemsContext.parentPath, subitemsToSave);
        if (!saved) {
            showAlert('danger', 'Erro ao salvar subitems na hierarquia.');
            return;
        }
        
        // Debug: confirmar salvamento no objeto item
        console.log('DEBUG: Salvou subitems recursivos via saveSubitemsToItem');
        console.log('DEBUG: Item após save:', JSON.stringify(item, null, 2));
        
        // Atualizar subitems no contexto da pilha para manter consistência
        // O último contexto na pilha deve ter o subitem atualizado
        if (subitemsModalContextStack.length > 0) {
            const lastContext = subitemsModalContextStack[subitemsModalContextStack.length - 1];
            if (lastContext && lastContext.selectedSubitems) {
                // Encontrar o índice do subitem pai no contexto anterior
                const parentIndex = currentSubitemsContext.parentPath[currentSubitemsContext.parentPath.length - 1];
                if (lastContext.selectedSubitems[parentIndex]) {
                    // Atualizar os subitems do subitem pai
                    lastContext.selectedSubitems[parentIndex].subitems = JSON.parse(JSON.stringify(subitemsToSave));
                }
            }
        }
    } else {
        // Estamos no nível principal, salvar diretamente
        item.subitems = JSON.parse(JSON.stringify(subitemsToSave));
    }
    
    // Debug: verificar se os subitems foram salvos
    if (currentSubitemsContext && currentSubitemsContext.parentPath && currentSubitemsContext.parentPath.length > 0) {
        console.log('Subitems salvos para nível RECURSIVO:', currentSubitemsContext.itemData.name, subitemsToSave);
    } else {
        console.log('Subitems salvos para item PRINCIPAL:', item.name, item.subitems);
    }
    
    // Atualizar display e preview
    updateSelectedItemsDisplay();
    updateJSONPreview();
    markLoadoutChanged();
    
    // Fechar modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('subitemsModal'));
    if (modal) {
        modal.hide();
    }
    
    // Limpar contextos após salvar
    subitemsModalContextStack = [];
    currentSubitemsContext = null;
}

// Garantir que saveSubitemsConfiguration está disponível globalmente
// Isso permite que o wrapper substitua temporariamente window.saveSubitemsConfiguration
if (typeof window.saveSubitemsConfiguration === 'undefined') {
    window.saveSubitemsConfiguration = saveSubitemsConfiguration;
}

// Função removida: updateSubitemsByPath - não é mais necessária sem recursão dentro do modal

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
            // Adicionar quantity se existir
            if (weaponConfig.magazine.quantity !== undefined && weaponConfig.magazine.quantity !== null) {
                weaponData.magazine.quantity = weaponConfig.magazine.quantity;
            }
        }
        
        // Adicionar ammunition (note: no JSON é "ammunitions", não "ammunition")
        if (weaponConfig.ammunition) {
            weaponData.ammunitions = {
                name_type: weaponConfig.ammunition.name_type,
                slots: weaponConfig.ammunition.slots || 1,
                width: weaponConfig.ammunition.width || 1,
                height: weaponConfig.ammunition.height || 1
            };
            // Adicionar quantity se existir
            if (weaponConfig.ammunition.quantity !== undefined && weaponConfig.ammunition.quantity !== null) {
                weaponData.ammunitions.quantity = weaponConfig.ammunition.quantity;
            }
        }
        
        // Adicionar attachments
        if (weaponConfig.attachments.length > 0) {
            weaponData.attachments = weaponConfig.attachments.map(function(att) {
                const attData = {
                    name_type: att.name_type,
                    type: att.type,
                    slots: att.slots,
                    width: att.width,
                    height: att.height,
                    battery: att.battery || false
                };
                // Adicionar quantity se existir
                if (att.quantity !== undefined && att.quantity !== null) {
                    attData.quantity = att.quantity;
                }
                return attData;
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
    if (!items || !Array.isArray(items)) {
        return [];
    }
    
    return items.map(function(item) {
        if (!item) {
            return null;
        }
        
        const itemData = {
            name_type: item.name_type,
            type_name: item.type_name || '',
            slots: item.slots,
            width: item.width,
            height: item.height,
            storage_slots: item.storage_slots || 0,
            storage_width: item.storage_width || 0,
            storage_height: item.storage_height || 0,
            localization: item.localization || ''
        };
        
        // Adicionar quantity se existir
        if (item.quantity !== undefined && item.quantity !== null) {
            itemData.quantity = item.quantity;
        }
        
        // Processar subitems recursivamente se existirem
        if (item.subitems && Array.isArray(item.subitems) && item.subitems.length > 0) {
            itemData.subitems = buildItemsWithSubitems(item.subitems);
        } else {
            itemData.subitems = [];
        }
        
        return itemData;
    }).filter(function(item) {
        // Remover nulls caso existam
        return item !== null;
    });
}

function updateJSONPreview() {
    if (loadoutMode === 'visual') {
        const loadoutData = buildLoadoutFromVisual();
        const loadoutType = $('#loadoutType').val() || 'custom';
        
        // Atualizar preview JSON
        $('#jsonPreview').val(JSON.stringify(loadoutData, null, 4));
        
        // Também atualizar o textarea do modo JSON se estiver visível
        if (loadoutType === 'player') {
            $('#playerLoadoutData').val(JSON.stringify(loadoutData, null, 4));
        } else {
            $('#customLoadoutData').val(JSON.stringify(loadoutData, null, 4));
        }
    }
}

// Atualizar saveCustomLoadout para usar modo visual quando necessário
function saveCustomLoadout() {
    const loadoutType = $('#loadoutType').val() || 'custom';
    let id, name, isActive, loadoutData;
    let url, method, redirectUrl;
    
    // Detectar tipo e usar campos corretos
    if (loadoutType === 'player') {
        const playerId = $('#playerLoadoutPlayerId').val();
        const loadoutId = parseInt($('#playerLoadoutId').val());
        const dbLoadoutId = $('#playerLoadoutLoadoutId').val();
        name = $('#playerLoadoutName').val();
        isActive = $('#playerLoadoutActive').val() === 'true';
        
        if (!playerId || !name) {
            showAlert('danger', 'Player ID e nome são obrigatórios');
            return;
        }
        
        // URLs para player loadouts
        if (dbLoadoutId) {
            // Editando - usar PUT
            url = `/api/loadouts/players/${playerId}/${loadoutId}`;
            method = 'PUT';
        } else {
            // Criando - usar POST
            url = `/api/loadouts/players/${playerId}`;
            method = 'POST';
        }
        redirectUrl = '/loadouts#players-tab';
    } else {
        // Custom loadout
        id = $('#customLoadoutId').val();
        name = $('#customLoadoutName').val();
        isActive = $('#customLoadoutActive').val() === 'true';
        
        if (!name) {
            showAlert('danger', 'Nome é obrigatório');
            return;
        }
        
        // URLs para custom loadouts
        url = id ? `/api/loadouts/custom/${id}` : '/api/loadouts/custom';
        method = id ? 'PUT' : 'POST';
        redirectUrl = '/loadouts#custom-tab';
    }
    
    // Se estiver no modo visual, montar JSON das seleções
    if (loadoutMode === 'visual') {
        // Validar estrutura antes de montar
        if (!validateLoadoutVisual()) {
            return;
        }
        loadoutData = buildLoadoutFromVisual();
    } else {
        // Modo JSON manual
        const jsonTextarea = loadoutType === 'player' ? '#playerLoadoutData' : '#customLoadoutData';
        try {
            loadoutData = JSON.parse($(jsonTextarea).val());
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
    
    // Preparar dados para envio
    let dataToSend;
    if (loadoutType === 'player') {
        const playerId = $('#playerLoadoutPlayerId').val();
        const loadoutId = parseInt($('#playerLoadoutId').val());
        const dbLoadoutId = $('#playerLoadoutLoadoutId').val();
        
        dataToSend = {
            name: name,
            is_active: isActive,
            loadout_data: loadoutData
        };
        // Se existe dbLoadoutId, estamos editando
        if (dbLoadoutId) {
            dataToSend.db_id = dbLoadoutId;
            dataToSend.loadout_id = loadoutId; // Só enviar loadout_id ao editar
            // Usar loadoutId atual para garantir que está correto
            url = `/api/loadouts/players/${playerId}/${loadoutId}`;
            method = 'PUT';
        }
        // Ao criar, não enviar loadout_id (será gerado automaticamente pela API)
    } else {
        dataToSend = {
            name: name,
            is_active: isActive,
            loadout_data: loadoutData
        };
    }
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(dataToSend),
        success: function(response) {
            if (response.success) {
                // Marcar como salvo antes de redirecionar
                loadoutHasChanges = false;
                updateChangesIndicator();
                // Redirecionar para página de listagem
                window.location.href = redirectUrl;
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



// ============================================================================
// NAVEGAÇÃO DE GRIDS COM SETAS E DRAG/SWIPE
// ============================================================================

function initGridNavigation() {
    console.log('initGridNavigation chamada');
    // Encontrar todos os grids dinamicamente no container
    const container = document.getElementById('itemsGridsByType');
    if (!container) {
        console.log('Container itemsGridsByType não encontrado');
        return;
    }
    
    // Encontrar todos os grids com classe items-grid-scrollable dentro do container
    const grids = container.querySelectorAll('.items-grid-scrollable');
    
    grids.forEach(function(grid) {
        const gridId = grid.id;
        if (!gridId) {
            console.log('Grid sem ID encontrado');
            return;
        }
        
        console.log('Inicializando navegação para grid:', gridId);
        
        // Atualizar visibilidade das setas
        updateGridNavigationButtons(gridId);
        
        // Inicializar drag/swipe
        initGridDragSwipe(grid);
        
        // Adicionar listeners para scroll
        grid.addEventListener("scroll", function() {
            updateGridNavigationButtons(gridId);
        });
        
        // Nota: Os botões usam onclick diretamente no HTML como fallback
        // Os event listeners aqui são apenas para atualizar visibilidade após scroll
    });
}

function updateGridNavigationButtons(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    
    const prevBtn = document.querySelector(`.grid-nav-prev[data-grid="${gridId}"]`);
    const nextBtn = document.querySelector(`.grid-nav-next[data-grid="${gridId}"]`);
    
    if (!prevBtn || !nextBtn) return;
    
    // Verificar se há scroll disponível
    const canScrollLeft = grid.scrollLeft > 0;
    const canScrollRight = grid.scrollLeft < (grid.scrollWidth - grid.clientWidth - 1);
    
    // Atualizar visibilidade dos botões
    if (canScrollLeft) {
        prevBtn.classList.remove("hidden");
    } else {
        prevBtn.classList.add("hidden");
    }
    
    if (canScrollRight) {
        nextBtn.classList.remove("hidden");
    } else {
        nextBtn.classList.add("hidden");
    }
}

function scrollGrid(direction, gridId) {
    console.log('scrollGrid chamada:', direction, gridId);
    const grid = document.getElementById(gridId);
    if (!grid) {
        console.error('Grid não encontrado:', gridId);
        return;
    }
    
    const cardWidth = 200; // Largura do card
    const gap = 15; // Gap entre cards
    const scrollAmount = cardWidth + gap;
    
    try {
        console.log('Fazendo scroll:', direction, 'amount:', scrollAmount);
        if (direction === "prev") {
            grid.scrollBy({
                left: -scrollAmount,
                behavior: "smooth"
            });
        } else if (direction === "next") {
            grid.scrollBy({
                left: scrollAmount,
                behavior: "smooth"
            });
        }
        
        // Atualizar botões após scroll (com pequeno delay para aguardar scroll)
        setTimeout(function() {
            updateGridNavigationButtons(gridId);
        }, 100);
    } catch (error) {
        console.error('Erro ao fazer scroll:', error);
    }
}

// Funções globais para uso com onclick direto no HTML
window.scrollGridPrev = function(gridId) {
    console.log('scrollGridPrev chamada via onclick:', gridId);
    scrollGrid("prev", gridId);
    return false;
};

window.scrollGridNext = function(gridId) {
    console.log('scrollGridNext chamada via onclick:', gridId);
    scrollGrid("next", gridId);
    return false;
};

function initGridDragSwipe(gridElement) {
    if (!gridElement) return;
    
    // Evitar inicialização duplicada
    if (gridElement.hasAttribute("data-drag-initialized")) {
        return;
    }
    gridElement.setAttribute("data-drag-initialized", "true");
    
    let isDown = false;
    let startX;
    let scrollLeft;
    let startTime;
    let velocity = 0;
    let lastX;
    
    gridElement.addEventListener("touchstart", function(e) {
        isDown = true;
        startX = e.touches[0].pageX - gridElement.offsetLeft;
        scrollLeft = gridElement.scrollLeft;
        startTime = Date.now();
        velocity = 0;
        lastX = e.touches[0].pageX;
    }, { passive: true });
    
    gridElement.addEventListener("touchmove", function(e) {
        if (!isDown) return;
        
        e.preventDefault();
        const x = e.touches[0].pageX - gridElement.offsetLeft;
        const walk = (x - startX) * 1.5; // Multiplicador para velocidade
        gridElement.scrollLeft = scrollLeft - walk;
        
        // Calcular velocidade para inércia
        const currentTime = Date.now();
        const currentX = e.touches[0].pageX;
        if (lastX !== undefined) {
            const timeDiff = currentTime - startTime;
            const xDiff = currentX - lastX;
            if (timeDiff > 0) {
                velocity = xDiff / timeDiff;
            }
        }
        lastX = currentX;
    }, { passive: false });
    
    gridElement.addEventListener("touchend", function(e) {
        if (!isDown) return;
        isDown = false;
        
        // Aplicar inércia suave
        if (Math.abs(velocity) > 0.1) {
            const inertia = velocity * 50;
            const targetScroll = gridElement.scrollLeft - inertia;
            
            gridElement.scrollTo({
                left: targetScroll,
                behavior: "smooth"
            });
        }
        
        // Atualizar botões de navegação
        const gridId = gridElement.id;
        if (gridId) {
            setTimeout(function() {
                updateGridNavigationButtons(gridId);
            }, 100);
        }
    }, { passive: true });
    
    // Suporte para mouse drag (opcional)
    gridElement.addEventListener("mousedown", function(e) {
        if (e.button !== 0) return; // Apenas botão esquerdo
        isDown = true;
        startX = e.pageX - gridElement.offsetLeft;
        scrollLeft = gridElement.scrollLeft;
        gridElement.style.cursor = "grabbing";
        gridElement.style.userSelect = "none";
    });
    
    gridElement.addEventListener("mouseleave", function() {
        isDown = false;
        gridElement.style.cursor = "grab";
        gridElement.style.userSelect = "";
    });
    
    gridElement.addEventListener("mouseup", function() {
        isDown = false;
        gridElement.style.cursor = "grab";
        gridElement.style.userSelect = "";
        
        // Atualizar botões de navegação
        const gridId = gridElement.id;
        if (gridId) {
            updateGridNavigationButtons(gridId);
        }
    });
    
    gridElement.addEventListener("mousemove", function(e) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - gridElement.offsetLeft;
        const walk = (x - startX) * 1.5;
        gridElement.scrollLeft = scrollLeft - walk;
    });
    
    // Cursor grab quando hover
    gridElement.style.cursor = "grab";
}

