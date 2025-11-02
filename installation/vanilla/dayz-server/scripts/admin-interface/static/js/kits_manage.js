// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

let weaponKitsData = [];
let lootKitsData = [];

// Para Weapon Kits
let allWeapons = [];
let allMagazines = [];
let allAttachments = [];
let selectedAttachmentIds = [];

// Para Loot Kits
let allItems = [];
let allStorageContainers = [];
let selectedLootItems = []; // Array de {item_id, quantity}
let selectedLootWeaponKits = []; // Array de {weapon_kit_id, quantity}
let currentLootKitContainer = null;

let allWeaponKitsForLoot = [];
// Novos tipos de itens para loot kits
let allExplosives = [];
let allAmmunitions = [];
let allMagazinesForLoot = []; // Para evitar conflito com allMagazines de Weapon Kits
let allAttachmentsForLoot = []; // Para evitar conflito com allAttachments de Weapon Kits
let selectedLootExplosives = []; // Array de {explosive_id, quantity}
let selectedLootAmmunitions = []; // Array de {ammunition_id, quantity}
let selectedLootMagazines = []; // Array de {magazine_id, quantity}
let selectedLootAttachments = []; // Array de {attachment_id, quantity}

let deleteConfirmCallback = null;

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Event listeners - Weapon Kits
    $('#btnAddWeaponKit').on('click', showAddWeaponKitModal);
    $('#btnSaveWeaponKit').on('click', saveWeaponKit);
    $('#weaponKitSearchInput').on('input', applyWeaponKitFilters);
    $('#attachmentSearchInput').on('input', filterAttachments);
    
    // Event listeners - Loot Kits
    $('#btnAddLootKit').on('click', showAddLootKitModal);
    $('#btnSaveLootKit').on('click', saveLootKit);
    $('#lootKitSearchInput').on('input', applyLootKitFilters);
    $('#lootItemSearchInput').on('input', filterLootItems);
    $('#lootWeaponKitSearchInput').on('input', filterLootWeaponKits);
    $('#lootExplosiveSearchInput').on('input', filterExplosives);
    $('#lootAmmunitionSearchInput').on('input', filterAmmunitions);
    $('#lootMagazineSearchInput').on('input', filterMagazines);
    $('#lootAttachmentSearchInput').on('input', filterAttachmentsForLoot);
    
    // Lazy load tabs
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if (target === '#weapon-kits-tab' && weaponKitsData.length === 0) {
            loadWeaponKits();
        } else if (target === '#loot-kits-tab' && lootKitsData.length === 0) {
            loadLootKits();
        }
    });
    
    // Carregar dados iniciais da primeira aba
    if ($('#weapon-kits-tab').hasClass('active')) {
        loadWeaponKits();
    }
});

// ============================================================================
// WEAPON KITS
// ============================================================================

function loadWeaponKits() {
    $.ajax({
        url: '/api/kits/weapons',
        method: 'GET',
        success: function(response) {
            weaponKitsData = response.kits;
            applyWeaponKitFilters();
        }
    });
}

function renderWeaponKitsGrid(data = weaponKitsData) {
    const grid = $('#weaponKitsGrid');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum kit de arma encontrado</div>');
        return;
    }
    
    data.forEach(kit => {
        const attCount = kit.attachments ? kit.attachments.length : 0;
        const card = $(`
            <div class="weapon-card">
                <div class="weapon-actions">
                    <button class="btn btn-sm btn-primary me-1" onclick="editWeaponKit(${kit.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWeaponKit(${kit.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <img src="${kit.weapon_img || 'https://via.placeholder.com/120?text=No+Image'}" alt="${kit.weapon_name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${kit.name}</div>
                <div class="weapon-info">
                    ${kit.weapon_name || 'N/A'}<br>
                    ${kit.magazine_name ? 'Magazine: ' + kit.magazine_name : 'Sem magazine'}<br>
                    ${attCount} attachments
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function applyWeaponKitFilters() {
    const searchTerm = $('#weaponKitSearchInput').val().toLowerCase();
    const filtered = weaponKitsData.filter(kit =>
        !searchTerm ||
        kit.name.toLowerCase().includes(searchTerm) ||
        (kit.weapon_name && kit.weapon_name.toLowerCase().includes(searchTerm))
    );
    renderWeaponKitsGrid(filtered);
}

function showAddWeaponKitModal() {
    $('#weaponKitId').val('');
    $('#weaponKitForm')[0].reset();
    selectedAttachmentIds = [];
    loadWeaponKitOptions();
    $('#weaponKitModal').modal('show');
}

function loadWeaponKitOptions(callback) {
    $.get('/api/manage/weapons', { limit: 1000 }).done(function(weaponsResp) {
        allWeapons = weaponsResp.weapons;
        
        // Popular dropdown de armas
        const weaponSelect = $('#weaponKitWeaponId');
        weaponSelect.empty().append('<option value="">Selecione uma arma...</option>');
        allWeapons.forEach(w => weaponSelect.append(`<option value="${w.id}">${w.name}</option>`));
        
        // Adicionar event listener para mudança de arma
        weaponSelect.off('change').on('change', function() {
            const weaponId = $(this).val();
            updateMagazinesAndAttachmentsForWeapon(weaponId);
        });
        
        // Inicializar magazine select vazio
        const magSelect = $('#weaponKitMagazineId');
        magSelect.empty().append('<option value="">Nenhum</option>');
        
        // Inicializar attachments grid vazio
        $('#attachmentsGrid').empty();
        $('#attachmentsGrid').html('<div class="text-center p-4 text-muted">Selecione uma arma para ver os magazines e attachments compatíveis</div>');
        
        if (callback) callback();
    });
}

function updateMagazinesAndAttachmentsForWeapon(weaponId, callback) {
    if (!weaponId) {
        // Limpar dropdowns e grids
        const magSelect = $('#weaponKitMagazineId');
        magSelect.empty().append('<option value="">Nenhum</option>');
        
        $('#attachmentsGrid').empty();
        $('#attachmentsGrid').html('<div class="text-center p-4 text-muted">Selecione uma arma para ver os magazines e attachments compatíveis</div>');
        
        if (callback) callback();
        return;
    }
    
    // Buscar magazines e attachments compatíveis com a arma
    $.when(
        $.get('/api/items/magazines', { weapon_id: weaponId, limit: 500 }),
        $.get('/api/items/attachments', { weapon_id: weaponId, limit: 500 })
    ).done(function(magsResp, attsResp) {
        allMagazines = magsResp[0].magazines;
        allAttachments = attsResp[0].attachments;
        
        // Popular dropdown de magazines
        const magSelect = $('#weaponKitMagazineId');
        const currentMagId = magSelect.val();
        magSelect.empty().append('<option value="">Nenhum</option>');
        allMagazines.forEach(m => magSelect.append(`<option value="${m.id}">${m.name}</option>`));
        
        // Se havia um magazine selecionado, verificar se ainda é compatível
        if (currentMagId && !allMagazines.find(m => m.id == currentMagId)) {
            magSelect.val('');
            showToast('Aviso', 'O magazine selecionado não é compatível com a nova arma', 'warning');
        } else {
            magSelect.val(currentMagId);
        }
        
        // Verificar e remover attachments incompatíveis
        const incompatibleAttachments = selectedAttachmentIds.filter(attId => 
            !allAttachments.find(att => att.id == attId)
        );
        
        if (incompatibleAttachments.length > 0) {
            incompatibleAttachments.forEach(attId => {
                selectedAttachmentIds.splice(selectedAttachmentIds.indexOf(attId), 1);
            });
            showToast('Aviso', `${incompatibleAttachments.length} attachment(s) incompatível(is) removido(s)`, 'warning');
        }
        
        // Renderizar attachments
        renderAttachmentsGrid();
        
        if (callback) callback();
    });
}

function renderAttachmentsGrid() {
    const grid = $('#attachmentsGrid');
    grid.empty();
    
    allAttachments.forEach(att => {
        const isSelected = selectedAttachmentIds.includes(att.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${att.id}">
                <div class="checkbox-indicator"></div>
                <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${att.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${att.name}">${att.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleAttachmentSelection(att.id, att.type);
        });
        
        grid.append(card);
    });
    
    updateSelectedAttachments();
}

function toggleAttachmentSelection(attachmentId, attachmentType) {
    const index = selectedAttachmentIds.indexOf(attachmentId);
    
    if (index > -1) {
        // Remover
        selectedAttachmentIds.splice(index, 1);
    } else {
        // Adicionar com validação
        // Verificar se já existe um attachment do mesmo tipo
        const selected = allAttachments.filter(a => selectedAttachmentIds.includes(a.id));
        const hasSameType = selected.some(a => a.type === attachmentType);
        
        if (hasSameType) {
            showToast('Aviso', `Já existe um attachment do tipo "${attachmentType}". Apenas 1 por tipo é permitido.`, 'warning');
            return;
        }
        
        selectedAttachmentIds.push(attachmentId);
    }
    
    renderAttachmentsGrid();
}

function updateSelectedAttachments() {
    const section = $('#selectedAttachments .selected-items-grid');
    section.empty();
    
    if (selectedAttachmentIds.length === 0) {
        section.html('<span class="text-muted">Nenhum attachment selecionado</span>');
        return;
    }
    
    selectedAttachmentIds.forEach(id => {
        const att = allAttachments.find(a => a.id === id);
        if (att) {
            const badge = $(`
                <div class="selected-item-badge">
                    ${att.name}
                    <span class="remove-btn" data-id="${id}">×</span>
                </div>
            `);
            
            badge.find('.remove-btn').on('click', function(e) {
                e.stopPropagation();
                toggleAttachmentSelection(id, att.type);
            });
            
            section.append(badge);
        }
    });
}

function filterAttachments() {
    const searchTerm = $('#attachmentSearchInput').val().toLowerCase();
    const filtered = allAttachments.filter(att =>
        !searchTerm ||
        att.name.toLowerCase().includes(searchTerm) ||
        att.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#attachmentsGrid');
    grid.empty();
    
    filtered.forEach(att => {
        const isSelected = selectedAttachmentIds.includes(att.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${att.id}">
                <div class="checkbox-indicator"></div>
                <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${att.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${att.name}">${att.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleAttachmentSelection(att.id, att.type);
        });
        
        grid.append(card);
    });
}

function editWeaponKit(kitId) {
    $.ajax({
        url: `/api/kits/weapons/${kitId}`,
        method: 'GET',
        success: function(response) {
            const kit = response.kit;
            
            $('#weaponKitId').val(kit.id);
            $('#weaponKitName').val(kit.name);
            
            loadWeaponKitOptions(function() {
                $('#weaponKitWeaponId').val(kit.weapon_id);
                selectedAttachmentIds = kit.attachments ? kit.attachments.map(a => a.id) : [];
                
                // Carregar magazines e attachments compatíveis com a arma do kit
                if (kit.weapon_id) {
                    updateMagazinesAndAttachmentsForWeapon(kit.weapon_id, function() {
                        $('#weaponKitMagazineId').val(kit.magazine_id);
                    });
                }
            });
            
            $('#weaponKitModal').modal('show');
        }
    });
}

function saveWeaponKit() {
    const kitId = $('#weaponKitId').val();
    const isNew = !kitId;
    
    const kitData = {
        name: $('#weaponKitName').val(),
        weapon_id: parseInt($('#weaponKitWeaponId').val()),
        magazine_id: $('#weaponKitMagazineId').val() ? parseInt($('#weaponKitMagazineId').val()) : null,
        attachments: selectedAttachmentIds
    };
    
    if (!kitData.name || !kitData.weapon_id) {
        showToast('Erro', 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    const url = isNew ? '/api/kits/weapons' : `/api/kits/weapons/${kitId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(kitData),
        success: function() {
            showToast('Sucesso', 'Kit de arma salvo com sucesso!', 'success');
            $('#weaponKitModal').modal('hide');
            loadWeaponKits();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao salvar kit de arma', 'error');
        }
    });
}

function deleteWeaponKit(kitId) {
    if (!confirm('Tem certeza que deseja excluir este kit de arma?')) return;
    
    $.ajax({
        url: `/api/kits/weapons/${kitId}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Kit de arma excluído com sucesso!', 'success');
            loadWeaponKits();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao excluir kit de arma', 'error');
        }
    });
}

// ============================================================================
// LOOT KITS
// ============================================================================

function loadLootKits() {
    $.ajax({
        url: '/api/kits/loot',
        method: 'GET',
        success: function(response) {
            lootKitsData = response.kits;
            applyLootKitFilters();
        }
    });
}

function renderLootKitsGrid(data = lootKitsData) {
    const grid = $('#lootKitsGrid');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum kit de loot encontrado</div>');
        return;
    }
    
    data.forEach(kit => {
        const card = $(`
            <div class="weapon-card">
                <div class="weapon-actions">
                    <button class="btn btn-sm btn-primary me-1" onclick="editLootKit(${kit.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteLootKit(${kit.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <img src="${kit.container_img || 'https://via.placeholder.com/120?text=No+Image'}" alt="${kit.container_name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${kit.name}</div>
                <div class="weapon-info">
                    ${kit.container_name || 'N/A'}<br>
                    ${kit.storage_slots || 0} slots<br>
                    ${kit.items ? kit.items.length : 0} itens
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function applyLootKitFilters() {
    const searchTerm = $('#lootKitSearchInput').val().toLowerCase();
    const filtered = lootKitsData.filter(kit =>
        !searchTerm ||
        kit.name.toLowerCase().includes(searchTerm) ||
        (kit.container_name && kit.container_name.toLowerCase().includes(searchTerm))
    );
    renderLootKitsGrid(filtered);
}

function showAddLootKitModal() {
    $('#lootKitId').val('');
    $('#lootKitForm')[0].reset();
    selectedLootItems = [];
    selectedLootWeaponKits = [];
    selectedLootExplosives = [];
    selectedLootAmmunitions = [];
    selectedLootMagazines = [];
    selectedLootAttachments = [];
    currentLootKitContainer = null;
    $('#btnSaveLootKit').prop('disabled', false).removeClass('btn-danger').addClass('btn-primary');
    loadLootKitOptions();
    $('#lootKitModal').modal('show');
}

function loadLootKitOptions(callback) {
    $.when(
        $.get('/api/kits/storage-containers'),
        $.get('/api/manage/items', { limit: 1000 }),
        $.get('/api/kits/weapons', { limit: 1000 }),
        $.get('/api/items/all-explosives'),
        $.get('/api/items/all-ammunitions'),
        $.get('/api/items/all-magazines'),
        $.get('/api/items/all-attachments')
    ).done(function(containersResp, itemsResp, weaponKitsResp, explosivesResp, ammunitionsResp, magazinesResp, attachmentsResp) {
        allStorageContainers = containersResp[0].containers;
        allItems = itemsResp[0].items;
        allWeaponKitsForLoot = weaponKitsResp[0].kits;
        allExplosives = explosivesResp[0].explosives;
        allAmmunitions = ammunitionsResp[0].ammunitions;
        allMagazinesForLoot = magazinesResp[0].magazines;
        allAttachmentsForLoot = attachmentsResp[0].attachments;
        
        // Popular dropdown de containers
        const containerSelect = $('#lootKitContainerId');
        containerSelect.empty().append('<option value="">Selecione um container...</option>');
        allStorageContainers.forEach(c => containerSelect.append(`<option value="${c.id}">${c.name}</option>`));
        
        // Listener para mudança de container
        containerSelect.off('change').on('change', function() {
            const containerId = $(this).val();
            if (containerId) {
                currentLootKitContainer = allStorageContainers.find(c => c.id == containerId);
                $('#lootKitAvailableSpace').val(currentLootKitContainer.storage_slots || 0);
                updateLootKitSpace();
            } else {
                currentLootKitContainer = null;
                $('#lootKitAvailableSpace').val('');
            }
        });
        
        // Renderizar grids
        renderLootItemsGrid();
        renderLootWeaponKitsGrid();
        renderExplosivesGrid();
        renderAmmunitionsGrid();
        renderMagazinesGrid();
        renderLootAttachmentsGrid();
        
        if (callback) callback();
    });
}

function renderLootItemsGrid() {
    const grid = $('#lootItemsGrid');
    grid.empty();
    
    allItems.forEach(item => {
        const isSelected = selectedLootItems.some(i => i.item_id === item.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="checkbox-indicator"></div>
                <img src="${item.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootItemSelection(item.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedLootItems();
}

function toggleLootItemSelection(itemId) {
    const index = selectedLootItems.findIndex(i => i.item_id === itemId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootItems.splice(index, 1);
        renderLootItemsGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: [...selectedLootItems, { item_id: itemId, quantity: 1 }].map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootItems.push({ item_id: itemId, quantity: 1 });
                renderLootItemsGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedLootItems() {
    const list = $('#selectedLootItemsList');
    list.empty();
    
    if (selectedLootItems.length === 0) {
        list.html('<span class="text-muted">Nenhum item selecionado</span>');
        $('#itemsCount').text(0);
        return;
    }
    
    selectedLootItems.forEach((item, index) => {
        const fullItem = allItems.find(i => i.id === item.item_id);
        if (!fullItem) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullItem.img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullItem.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullItem.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${item.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeLootItem(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = item.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempItems = selectedLootItems.map(i => 
                i.item_id === item.item_id ? { ...i, quantity: newQuantity } : i
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: tempItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    item.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
    
    $('#itemsCount').text(selectedLootItems.length);
}

function removeLootItem(index) {
    selectedLootItems.splice(index, 1);
    renderLootItemsGrid();
    updateLootKitSpace();
}

function renderLootWeaponKitsGrid() {
    const grid = $('#lootWeaponKitsGrid');
    grid.empty();
    
    allWeaponKitsForLoot.forEach(kit => {
        const isSelected = selectedLootWeaponKits.some(k => k.weapon_kit_id === kit.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${kit.id}">
                <div class="checkbox-indicator"></div>
                <img src="${kit.weapon_img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${kit.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${kit.name}">${kit.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootWeaponKitSelection(kit.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedLootWeaponKits();
}

function toggleLootWeaponKitSelection(kitId) {
    const index = selectedLootWeaponKits.findIndex(k => k.weapon_kit_id === kitId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootWeaponKits.splice(index, 1);
        renderLootWeaponKitsGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: [...selectedLootWeaponKits, { weapon_kit_id: kitId, quantity: 1 }].map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootWeaponKits.push({ weapon_kit_id: kitId, quantity: 1 });
                renderLootWeaponKitsGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedLootWeaponKits() {
    const list = $('#selectedLootWeaponKitsList');
    list.empty();
    
    if (selectedLootWeaponKits.length === 0) {
        list.html('<span class="text-muted">Nenhum kit de arma selecionado</span>');
        $('#weaponKitsCount').text(0);
        return;
    }
    
    selectedLootWeaponKits.forEach((kit, index) => {
        const fullKit = allWeaponKitsForLoot.find(k => k.id === kit.weapon_kit_id);
        if (!fullKit) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullKit.weapon_img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullKit.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullKit.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${kit.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeLootWeaponKit(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = kit.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempKits = selectedLootWeaponKits.map(k => 
                k.weapon_kit_id === kit.weapon_kit_id ? { ...k, quantity: newQuantity } : k
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: tempKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    kit.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
    
    $('#weaponKitsCount').text(selectedLootWeaponKits.length);
}

function removeLootWeaponKit(index) {
    selectedLootWeaponKits.splice(index, 1);
    renderLootWeaponKitsGrid();
    updateLootKitSpace();
}

function filterLootItems() {
    const searchTerm = $('#lootItemSearchInput').val().toLowerCase();
    const filtered = allItems.filter(item =>
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm) ||
        item.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootItemsGrid');
    grid.empty();
    
    filtered.forEach(item => {
        const isSelected = selectedLootItems.some(i => i.item_id === item.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="checkbox-indicator"></div>
                <img src="${item.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootItemSelection(item.id);
        });
        
        grid.append(card);
    });
}

function filterLootWeaponKits() {
    const searchTerm = $('#lootWeaponKitSearchInput').val().toLowerCase();
    const filtered = allWeaponKitsForLoot.filter(kit =>
        !searchTerm ||
        kit.name.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootWeaponKitsGrid');
    grid.empty();
    
    filtered.forEach(kit => {
        const isSelected = selectedLootWeaponKits.some(k => k.weapon_kit_id === kit.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${kit.id}">
                <div class="checkbox-indicator"></div>
                <img src="${kit.weapon_img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${kit.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${kit.name}">${kit.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootWeaponKitSelection(kit.id);
        });
        
        grid.append(card);
    });
}

// Funções de filtro para novos tipos
function filterExplosives() {
    const searchTerm = $('#lootExplosiveSearchInput').val().toLowerCase();
    const filtered = allExplosives.filter(exp =>
        !searchTerm ||
        exp.name.toLowerCase().includes(searchTerm) ||
        exp.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootExplosivesGrid');
    grid.empty();
    
    filtered.forEach(exp => {
        const isSelected = selectedLootExplosives.some(e => e.explosive_id === exp.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${exp.id}">
                <div class="checkbox-indicator"></div>
                <img src="${exp.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${exp.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${exp.name}">${exp.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleExplosiveSelection(exp.id);
        });
        
        grid.append(card);
    });
}

function filterAmmunitions() {
    const searchTerm = $('#lootAmmunitionSearchInput').val().toLowerCase();
    const filtered = allAmmunitions.filter(ammo =>
        !searchTerm ||
        ammo.name.toLowerCase().includes(searchTerm) ||
        ammo.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootAmmunitionsGrid');
    grid.empty();
    
    filtered.forEach(ammo => {
        const isSelected = selectedLootAmmunitions.some(a => a.ammunition_id === ammo.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${ammo.id}">
                <div class="checkbox-indicator"></div>
                <img src="${ammo.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${ammo.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${ammo.name}">${ammo.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleAmmunitionSelection(ammo.id);
        });
        
        grid.append(card);
    });
}

function filterMagazines() {
    const searchTerm = $('#lootMagazineSearchInput').val().toLowerCase();
    const filtered = allMagazinesForLoot.filter(mag =>
        !searchTerm ||
        mag.name.toLowerCase().includes(searchTerm) ||
        mag.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootMagazinesGrid');
    grid.empty();
    
    filtered.forEach(mag => {
        const isSelected = selectedLootMagazines.some(m => m.magazine_id === mag.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${mag.id}">
                <div class="checkbox-indicator"></div>
                <img src="${mag.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${mag.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${mag.name}">${mag.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleMagazineSelection(mag.id);
        });
        
        grid.append(card);
    });
}

function filterAttachmentsForLoot() {
    const searchTerm = $('#lootAttachmentSearchInput').val().toLowerCase();
    const filtered = allAttachmentsForLoot.filter(att =>
        !searchTerm ||
        att.name.toLowerCase().includes(searchTerm) ||
        att.name_type.toLowerCase().includes(searchTerm)
    );
    
    const grid = $('#lootAttachmentsGrid');
    grid.empty();
    
    filtered.forEach(att => {
        const isSelected = selectedLootAttachments.some(a => a.attachment_id === att.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${att.id}">
                <div class="checkbox-indicator"></div>
                <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${att.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${att.name}">${att.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootAttachmentSelection(att.id);
        });
        
        grid.append(card);
    });
}

// Funções para Explosivos
function renderExplosivesGrid() {
    const grid = $('#lootExplosivesGrid');
    grid.empty();
    
    allExplosives.forEach(exp => {
        const isSelected = selectedLootExplosives.some(e => e.explosive_id === exp.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${exp.id}">
                <div class="checkbox-indicator"></div>
                <img src="${exp.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${exp.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${exp.name}">${exp.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleExplosiveSelection(exp.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedExplosives();
}

function toggleExplosiveSelection(expId) {
    const index = selectedLootExplosives.findIndex(e => e.explosive_id === expId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootExplosives.splice(index, 1);
        renderExplosivesGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: [...selectedLootExplosives, { explosive_id: expId, quantity: 1 }].map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootExplosives.push({ explosive_id: expId, quantity: 1 });
                renderExplosivesGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedExplosives() {
    const list = $('#selectedLootExplosivesList');
    list.empty();
    
    if (selectedLootExplosives.length === 0) {
        list.html('<span class="text-muted">Nenhum explosivo selecionado</span>');
        return;
    }
    
    selectedLootExplosives.forEach((exp, index) => {
        const fullExp = allExplosives.find(e => e.id === exp.explosive_id);
        if (!fullExp) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullExp.img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullExp.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullExp.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${exp.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeExplosive(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = exp.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempExplosives = selectedLootExplosives.map(e => 
                e.explosive_id === exp.explosive_id ? { ...e, quantity: newQuantity } : e
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: tempExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    exp.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
}

function removeExplosive(index) {
    selectedLootExplosives.splice(index, 1);
    renderExplosivesGrid();
    updateLootKitSpace();
}

// Funções para Munições
function renderAmmunitionsGrid() {
    const grid = $('#lootAmmunitionsGrid');
    grid.empty();
    
    allAmmunitions.forEach(ammo => {
        const isSelected = selectedLootAmmunitions.some(a => a.ammunition_id === ammo.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${ammo.id}">
                <div class="checkbox-indicator"></div>
                <img src="${ammo.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${ammo.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${ammo.name}">${ammo.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleAmmunitionSelection(ammo.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedAmmunitions();
}

function toggleAmmunitionSelection(ammoId) {
    const index = selectedLootAmmunitions.findIndex(a => a.ammunition_id === ammoId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootAmmunitions.splice(index, 1);
        renderAmmunitionsGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: [...selectedLootAmmunitions, { ammunition_id: ammoId, quantity: 1 }].map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootAmmunitions.push({ ammunition_id: ammoId, quantity: 1 });
                renderAmmunitionsGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedAmmunitions() {
    const list = $('#selectedLootAmmunitionsList');
    list.empty();
    
    if (selectedLootAmmunitions.length === 0) {
        list.html('<span class="text-muted">Nenhuma munição selecionada</span>');
        return;
    }
    
    selectedLootAmmunitions.forEach((ammo, index) => {
        const fullAmmo = allAmmunitions.find(a => a.id === ammo.ammunition_id);
        if (!fullAmmo) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullAmmo.img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullAmmo.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullAmmo.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${ammo.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeAmmunition(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = ammo.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempAmmunitions = selectedLootAmmunitions.map(a => 
                a.ammunition_id === ammo.ammunition_id ? { ...a, quantity: newQuantity } : a
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: tempAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    ammo.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
}

function removeAmmunition(index) {
    selectedLootAmmunitions.splice(index, 1);
    renderAmmunitionsGrid();
    updateLootKitSpace();
}

// Funções para Magazines
function renderMagazinesGrid() {
    const grid = $('#lootMagazinesGrid');
    grid.empty();
    
    allMagazinesForLoot.forEach(mag => {
        const isSelected = selectedLootMagazines.some(m => m.magazine_id === mag.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${mag.id}">
                <div class="checkbox-indicator"></div>
                <img src="${mag.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${mag.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${mag.name}">${mag.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleMagazineSelection(mag.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedMagazines();
}

function toggleMagazineSelection(magId) {
    const index = selectedLootMagazines.findIndex(m => m.magazine_id === magId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootMagazines.splice(index, 1);
        renderMagazinesGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: [...selectedLootMagazines, { magazine_id: magId, quantity: 1 }].map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootMagazines.push({ magazine_id: magId, quantity: 1 });
                renderMagazinesGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedMagazines() {
    const list = $('#selectedLootMagazinesList');
    list.empty();
    
    if (selectedLootMagazines.length === 0) {
        list.html('<span class="text-muted">Nenhum magazine selecionado</span>');
        return;
    }
    
    selectedLootMagazines.forEach((mag, index) => {
        const fullMag = allMagazinesForLoot.find(m => m.id === mag.magazine_id);
        if (!fullMag) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullMag.img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullMag.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullMag.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${mag.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeMagazine(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = mag.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempMagazines = selectedLootMagazines.map(m => 
                m.magazine_id === mag.magazine_id ? { ...m, quantity: newQuantity } : m
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: tempMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: selectedLootAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    mag.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
}

function removeMagazine(index) {
    selectedLootMagazines.splice(index, 1);
    renderMagazinesGrid();
    updateLootKitSpace();
}

// Funções para Attachments
function renderLootAttachmentsGrid() {
    const grid = $('#lootAttachmentsGrid');
    grid.empty();
    
    allAttachmentsForLoot.forEach(att => {
        const isSelected = selectedLootAttachments.some(a => a.attachment_id === att.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${att.id}">
                <div class="checkbox-indicator"></div>
                <img src="${att.img || 'https://via.placeholder.com/80?text=No+Image'}" alt="${att.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${att.name}">${att.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleLootAttachmentSelection(att.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedLootAttachments();
}

function toggleLootAttachmentSelection(attId) {
    const index = selectedLootAttachments.findIndex(a => a.attachment_id === attId);
    
    if (index > -1) {
        // Remover: sempre permitido
        selectedLootAttachments.splice(index, 1);
        renderLootAttachmentsGrid();
        updateLootKitSpace();
    } else {
        // Adicionar: validar antes
        if (!currentLootKitContainer) {
            showToast('Erro', 'Selecione um container antes de adicionar itens', 'warning');
            return;
        }
        
        const tempPayload = {
            container_id: currentLootKitContainer.id,
            items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
            weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
            explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
            ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
            magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
            attachments: [...selectedLootAttachments, { attachment_id: attId, quantity: 1 }].map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
        };
        
        validateSpaceBeforeAdding(tempPayload,
            function(response) {
                // Sucesso: adicionar
                selectedLootAttachments.push({ attachment_id: attId, quantity: 1 });
                renderLootAttachmentsGrid();
                updateLootKitSpace();
            },
            function(errorMsg) {
                // Erro: mostrar toast
                showToast('Espaço insuficiente', errorMsg, 'warning');
            }
        );
    }
}

function updateSelectedLootAttachments() {
    const list = $('#selectedLootAttachmentsList');
    list.empty();
    
    if (selectedLootAttachments.length === 0) {
        list.html('<span class="text-muted">Nenhum attachment selecionado</span>');
        return;
    }
    
    selectedLootAttachments.forEach((att, index) => {
        const fullAtt = allAttachmentsForLoot.find(a => a.id === att.attachment_id);
        if (!fullAtt) return;
        
        const listItem = $(`
            <div class="selected-items-list-item">
                <div class="item-info">
                    <img src="${fullAtt.img || 'https://via.placeholder.com/40?text=No+Img'}" alt="${fullAtt.name}" onerror="this.src='https://via.placeholder.com/40?text=No+Img'">
                    <span class="item-name">${fullAtt.name}</span>
                </div>
                <div class="quantity-input-group">
                    <label class="me-2">Qtd:</label>
                    <input type="number" class="form-control quantity-input" value="${att.quantity}" min="1" style="display: inline-block; width: 70px;">
                    <button class="btn btn-sm btn-danger ms-2" onclick="removeLootAttachment(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `);
        
        listItem.find('.quantity-input').on('change', function() {
            const newQuantity = parseInt($(this).val()) || 1;
            const oldQuantity = att.quantity;
            const $input = $(this);
            
            // Criar payload com nova quantidade
            const tempAttachments = selectedLootAttachments.map(a => 
                a.attachment_id === att.attachment_id ? { ...a, quantity: newQuantity } : a
            );
            
            const tempPayload = {
                container_id: currentLootKitContainer.id,
                items: selectedLootItems.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
                weapon_kits: selectedLootWeaponKits.map(k => ({ weapon_kit_id: k.weapon_kit_id, quantity: k.quantity })),
                explosives: selectedLootExplosives.map(e => ({ explosive_id: e.explosive_id, quantity: e.quantity })),
                ammunitions: selectedLootAmmunitions.map(a => ({ ammunition_id: a.ammunition_id, quantity: a.quantity })),
                magazines: selectedLootMagazines.map(m => ({ magazine_id: m.magazine_id, quantity: m.quantity })),
                attachments: tempAttachments.map(a => ({ attachment_id: a.attachment_id, quantity: a.quantity }))
            };
            
            validateSpaceBeforeAdding(tempPayload,
                function(response) {
                    // Sucesso: atualizar
                    att.quantity = newQuantity;
                    updateLootKitSpace();
                },
                function(errorMsg) {
                    // Erro: reverter valor
                    $input.val(oldQuantity);
                    showToast('Espaço insuficiente', errorMsg, 'warning');
                }
            );
        });
        
        list.append(listItem);
    });
}

function removeLootAttachment(index) {
    selectedLootAttachments.splice(index, 1);
    renderLootAttachmentsGrid();
    updateLootKitSpace();
}

function validateSpaceBeforeAdding(newItemPayload, onSuccess, onError) {
    if (!currentLootKitContainer) {
        if (onError) onError('Nenhum container selecionado');
        return;
    }
    
    $.ajax({
        url: '/api/kits/loot/validate-space',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(newItemPayload),
        success: function(response) {
            if (response.fits) {
                if (onSuccess) onSuccess(response);
            } else {
                if (onError) {
                    const errorMsg = response.errors && response.errors.length > 0
                        ? response.errors[0].item + ' não cabe no container'
                        : 'Item não cabe no container';
                    onError(errorMsg);
                }
            }
        },
        error: function(xhr) {
            console.error('Erro ao validar espaço:', xhr);
            if (onError) onError('Erro ao validar espaço');
        }
    });
}

function updateLootKitSpace() {
    if (!currentLootKitContainer) {
        $('#lootKitUsedSpace').val('');
        $('#lootKitRemainingSpace').val('');
        if ($('#storageUsagePercent').length) $('#storageUsagePercent').text('0%');
        if ($('#storageUsedSlots').length) $('#storageUsedSlots').text('0/0');
        return;
    }
    
    // Montar payload para API
    const payload = {
        container_id: currentLootKitContainer.id,
        items: selectedLootItems.map(item => ({ item_id: item.item_id, quantity: item.quantity })),
        weapon_kits: selectedLootWeaponKits.map(kit => ({ weapon_kit_id: kit.weapon_kit_id, quantity: kit.quantity })),
        explosives: selectedLootExplosives.map(exp => ({ explosive_id: exp.explosive_id, quantity: exp.quantity })),
        ammunitions: selectedLootAmmunitions.map(ammo => ({ ammunition_id: ammo.ammunition_id, quantity: ammo.quantity })),
        magazines: selectedLootMagazines.map(mag => ({ magazine_id: mag.magazine_id, quantity: mag.quantity })),
        attachments: selectedLootAttachments.map(att => ({ attachment_id: att.attachment_id, quantity: att.quantity }))
    };
    
    // Chamar API de validação
    $.ajax({
        url: '/api/kits/loot/validate-space',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(response) {
            const available = currentLootKitContainer.storage_slots || 0;
            const totalSlots = currentLootKitContainer.storage_width * currentLootKitContainer.storage_height;
            const usedSlots = Math.round(response.usage * totalSlots);
            const remainingSlots = totalSlots - usedSlots;
            
            // Atualizar indicadores de espaço (baseado em slots antigos para compatibilidade)
            const oldUsedSpace = Math.round(response.usage * available);
            const oldRemaining = available - oldUsedSpace;
            
            $('#lootKitUsedSpace').val(oldUsedSpace);
            $('#lootKitRemainingSpace').val(oldRemaining);
            if ($('#storageUsagePercent').length) $('#storageUsagePercent').text((response.usage * 100).toFixed(1) + '%');
            if ($('#storageUsedSlots').length) $('#storageUsedSlots').text(`${usedSlots}/${totalSlots}`);
            
            // Alerta visual
            const indicator = $('#lootKitRemainingSpace');
            indicator.removeClass('is-invalid is-valid');
            
            // Atualizar botão Salvar baseado na validação
            if (!response.fits || remainingSlots < 0) {
                indicator.addClass('is-invalid');
                $('#btnSaveLootKit').prop('disabled', true).removeClass('btn-primary').addClass('btn-danger');
                
                // Mostrar erros
                if (response.errors && response.errors.length > 0) {
                    let errorMsg = '<div class="alert alert-warning mt-2"><strong>Itens que não cabem:</strong><ul>';
                    response.errors.forEach(err => {
                        if (err.dimension === 'both') {
                            errorMsg += `<li>${err.item}: ${err.width}x${err.height} não cabe no container ${err.container_width}x${err.container_height}</li>`;
                        } else {
                            errorMsg += `<li>${err.item}: ${err.dimension} ${err.value} > ${err.max}</li>`;
                        }
                    });
                    errorMsg += '</ul></div>';
                    if ($('#lootKitSpaceWarning').length) $('#lootKitSpaceWarning').html(errorMsg).show();
                }
            } else {
                indicator.removeClass('is-invalid');
                $('#btnSaveLootKit').prop('disabled', false).removeClass('btn-danger').addClass('btn-primary');
                
                if (remainingSlots <= 0) {
                    indicator.addClass('is-valid');
                }
                if ($('#lootKitSpaceWarning').length) $('#lootKitSpaceWarning').hide();
            }
            
            // Renderizar grid visual se tiver dados E couber no container
            if (response.fits && response.visual_grid && response.visual_grid.length > 0) {
                $('#storageVisualization').show();
                
                // Aguardar o grid ser renderizado antes de calcular tamanhos
                setTimeout(() => {
                    renderStorageGrid(response.visual_grid, currentLootKitContainer.storage_width, currentLootKitContainer.storage_height, response.positions);
                }, 50);
            } else {
                $('#storageVisualization').hide();
            }
        },
        error: function(xhr) {
            console.error('Erro ao validar espaço:', xhr);
            // Fallback para cálculo antigo em caso de erro
            $('#lootKitUsedSpace').val('?');
            $('#lootKitRemainingSpace').val('?');
            $('#storageVisualization').hide();
        }
    });
}

function renderStorageGrid(gridData, containerWidth, containerHeight, positions) {
    const gridContainer = $('#storageGrid');
    if (!gridContainer.length) {
        return; // Grid ainda não foi adicionado ao HTML
    }
    
    gridContainer.empty();
    gridContainer.css({
        'display': 'grid',
        'grid-template-columns': `repeat(${containerWidth}, 1fr)`,
        'grid-template-rows': `repeat(${containerHeight}, 1fr)`,
        'gap': '1px',
        'background': '#ddd',
        'border': '2px solid #333',
        'width': '100%',
        'max-width': '800px',
        'min-height': '400px',
        'padding': '2px',
        'position': 'relative'
    });
    
    // SEMPRE criar células base primeiro
    for (let y = 0; y < containerHeight; y++) {
        for (let x = 0; x < containerWidth; x++) {
            const cell = $('<div></div>').addClass('storage-cell');
            const isOccupied = gridData[y] && gridData[y][x] === 1;
            
            cell.css({
                'background': isOccupied ? '#e0e0e0' : '#fff',
                'border': '1px solid #ccc'
            });
            gridContainer.append(cell);
        }
    }
    
    // Se temos posições com detalhes, sobrepor com imagens após renderizar
    if (positions && positions.length > 0) {
        // Aguardar próxima frame para garantir que as células foram renderizadas
        requestAnimationFrame(() => {
            positions.forEach((pos, index) => {
                renderItemInGrid(gridContainer, pos, containerWidth, containerHeight, index);
            });
        });
    }
}

function renderItemInGrid(gridContainer, pos, containerWidth, containerHeight, index) {
    // Calcular tamanho real de cada célula do grid
    const gridWidth = gridContainer.width();
    const gridHeight = gridContainer.height();
    
    // Validar se o grid tem tamanho
    if (gridWidth === 0 || gridHeight === 0) {
        console.warn('Grid container sem tamanho definido');
        return;
    }
    
    const cellWidth = gridWidth / containerWidth;
    const cellHeight = gridHeight / containerHeight;
    
    // Calcular posição e tamanho do item
    const itemLeft = pos.x * cellWidth;
    const itemTop = pos.y * cellHeight;
    const itemWidth = pos.width * cellWidth;
    const itemHeight = pos.height * cellHeight;
    
    // Criar container do item
    const itemDiv = $('<div></div>').addClass('grid-item');
    itemDiv.css({
        'position': 'absolute',
        'left': `${itemLeft}px`,
        'top': `${itemTop}px`,
        'width': `${itemWidth}px`,
        'height': `${itemHeight}px`,
        'border': '2px solid ' + getItemColor(index),
        'border-radius': '4px',
        'overflow': 'hidden',
        'background': 'rgba(255, 255, 255, 0.9)',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'cursor': 'pointer',
        'box-sizing': 'border-box'
    });
    
    // Adicionar imagem se disponível
    if (pos.img) {
        const img = $('<img>').attr('src', pos.img).attr('alt', pos.item);
        img.css({
            'max-width': '100%',
            'max-height': '100%',
            'object-fit': 'contain'
        });
        img.on('error', function() {
            // Se imagem falhar, usar cor de fallback
            $(this).remove();
            itemDiv.css('background', getItemColor(index));
        });
        itemDiv.append(img);
    } else {
        // Fallback: cor sólida
        itemDiv.css('background', getItemColor(index));
    }
    
    // Indicador de rotação
    if (pos.rotated) {
        const rotIcon = $('<i class="fas fa-redo"></i>').css({
            'position': 'absolute',
            'top': '2px',
            'right': '2px',
            'font-size': '10px',
            'color': '#fff',
            'background': 'rgba(0,0,0,0.5)',
            'padding': '2px 4px',
            'border-radius': '3px'
        });
        itemDiv.append(rotIcon);
    }
    
    // Tooltip
    itemDiv.attr('title', pos.item + (pos.rotated ? ' (rotacionado)' : ''));
    
    // Adicionar ao grid
    gridContainer.append(itemDiv);
}

function getItemColor(index) {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B'];
    return colors[index % colors.length];
}

function editLootKit(kitId) {
    $.ajax({
        url: `/api/kits/loot/${kitId}`,
        method: 'GET',
        success: function(response) {
            const kit = response.kit;
            
            $('#lootKitId').val(kit.id);
            $('#lootKitName').val(kit.name);
            
            loadLootKitOptions(function() {
                $('#lootKitContainerId').val(kit.container_item_id);
                currentLootKitContainer = allStorageContainers.find(c => c.id == kit.container_item_id);
                $('#lootKitAvailableSpace').val(currentLootKitContainer.storage_slots || 0);
                
                selectedLootItems = kit.items ? kit.items.map(i => ({
                    item_id: i.id,
                    quantity: i.quantity
                })) : [];
                
                selectedLootWeaponKits = kit.weapon_kits ? kit.weapon_kits.map(k => ({
                    weapon_kit_id: k.id,
                    quantity: k.quantity
                })) : [];
                
                selectedLootExplosives = kit.explosives ? kit.explosives.map(e => ({
                    explosive_id: e.id,
                    quantity: e.quantity
                })) : [];
                
                selectedLootAmmunitions = kit.ammunitions ? kit.ammunitions.map(a => ({
                    ammunition_id: a.id,
                    quantity: a.quantity
                })) : [];
                
                selectedLootMagazines = kit.magazines ? kit.magazines.map(m => ({
                    magazine_id: m.id,
                    quantity: m.quantity
                })) : [];
                
                selectedLootAttachments = kit.attachments ? kit.attachments.map(a => ({
                    attachment_id: a.id,
                    quantity: a.quantity
                })) : [];
                
                renderLootItemsGrid();
                renderLootWeaponKitsGrid();
                renderExplosivesGrid();
                renderAmmunitionsGrid();
                renderMagazinesGrid();
                renderLootAttachmentsGrid();
                updateLootKitSpace();
            });
            
            $('#lootKitModal').modal('show');
        }
    });
}

function saveLootKit() {
    const kitId = $('#lootKitId').val();
    const isNew = !kitId;
    
    // Validação de espaço ANTES de salvar
    if (!currentLootKitContainer) {
        showToast('Erro', 'Selecione um container', 'error');
        return;
    }
    
    // Verificar se há validação de espaço válida
    const lastValidation = $('#lootKitUsedSpace').val();
    if (!lastValidation || lastValidation === '' || lastValidation === '?') {
        showToast('Erro', 'Aguarde a validação de espaço', 'warning');
        return;
    }
    
    // Verificar se o espaço está excedido
    const remainingSpace = parseInt($('#lootKitRemainingSpace').val()) || 0;
    if (remainingSpace < 0) {
        showToast('Erro', 'Os itens excedem o espaço do container. Remova alguns itens antes de salvar.', 'error');
        return;
    }
    
    const kitData = {
        name: $('#lootKitName').val(),
        container_item_id: parseInt($('#lootKitContainerId').val()),
        items: selectedLootItems,
        weapon_kits: selectedLootWeaponKits,
        explosives: selectedLootExplosives,
        ammunitions: selectedLootAmmunitions,
        magazines: selectedLootMagazines,
        attachments: selectedLootAttachments
    };
    
    if (!kitData.name || !kitData.container_item_id) {
        showToast('Erro', 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    const url = isNew ? '/api/kits/loot' : `/api/kits/loot/${kitId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(kitData),
        success: function() {
            showToast('Sucesso', 'Kit de loot salvo com sucesso!', 'success');
            $('#lootKitModal').modal('hide');
            loadLootKits();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao salvar kit de loot', 'error');
        }
    });
}

function deleteLootKit(kitId) {
    if (!confirm('Tem certeza que deseja excluir este kit de loot?')) return;
    
    $.ajax({
        url: `/api/kits/loot/${kitId}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Kit de loot excluído com sucesso!', 'success');
            loadLootKits();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao excluir kit de loot', 'error');
        }
    });
}

// Exportar funções para onclick
window.editWeaponKit = editWeaponKit;
window.deleteWeaponKit = deleteWeaponKit;
window.editLootKit = editLootKit;
window.deleteLootKit = deleteLootKit;
window.removeLootItem = removeLootItem;
window.removeLootWeaponKit = removeLootWeaponKit;

