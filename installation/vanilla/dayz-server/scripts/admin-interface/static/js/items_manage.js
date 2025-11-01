let weaponsData = [];
let selectedAmmunitions = [];
let selectedMagazines = [];
let selectedAttachments = [];
let allAmmunitions = [];
let allMagazines = [];
let allAttachments = [];

// Dados para outras abas
let explosivesData = [];
let ammunitionsData = [];
let magazinesData = [];
let attachmentsData = [];
let calibersData = [];
let itemTypesData = [];

// Variáveis para relacionamentos inversos
let allWeaponsForRelationship = [];
let selectedWeaponsForMagazine = [];
let selectedWeaponsForAttachment = [];

$(document).ready(function() {
    loadWeapons();
    loadCalibersFilter();
    loadItemTypesFilter();
    
    // Event listeners - Armas
    $('#btnAddWeapon').on('click', showAddWeaponModal);
    $('#btnSaveWeapon').on('click', saveWeapon);
    $('#btnValidateType').on('click', validateNameType);
    $('#weaponSearchInput').on('input', applyWeaponFilters);
    $('#filterFeedType').on('change', applyWeaponFilters);
    $('#filterWeaponSize').on('change', applyWeaponFilters);
    $('#filterCaliber').on('change', applyWeaponFilters);
    
    // Cálculo automático de slots
    $('#weaponWidth, #weaponHeight').on('input', calculateSlots);
    
    // Busca em relacionamentos
    $('#ammoSearchInput').on('input', () => filterRelationships('ammo'));
    $('#magsSearchInput').on('input', () => filterRelationships('mags'));
    $('#attsSearchInput').on('input', () => filterRelationships('atts'));
    
    // Event listeners para outras abas
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if (target === '#explosives-tab' && explosivesData.length === 0) loadExplosives();
        else if (target === '#ammo-tab' && ammunitionsData.length === 0) loadAmmunitions();
        else if (target === '#magazines-tab' && magazinesData.length === 0) loadMagazines();
        else if (target === '#attachments-tab' && attachmentsData.length === 0) loadAttachments();
        else if (target === '#calibers-tab' && calibersData.length === 0) loadCalibers();
        else if (target === '#types-tab' && itemTypesData.length === 0) loadItemTypes();
        else if (target === '#items-tab' && itemsData.length === 0) loadItems();
    });
    
    // Event listeners - Itens
    $('#btnAddItem').on('click', showAddItemModal);
    $('#btnSaveItem').on('click', saveItem);
    $('#btnValidateItemType').on('click', validateItemNameType);
    $('#itemSearchInput').on('input', applyItemFilters);
    $('#filterItemType').on('change', applyItemFilters);
    $('#filterItemLocation').on('change', applyItemFilters);
    $('#filterItemStorage').on('change', applyItemFilters);
    
    // Cálculo automático de slots para itens
    $('#itemWidth, #itemHeight').on('input', calculateItemSlots);
    $('#itemStorageWidth, #itemStorageHeight').on('input', calculateItemStorageSlots);
    
    // Busca em relacionamentos de itens
    $('#parentsSearchInput').on('input', function() {
        filterItemRelationships('parents');
    });
    $('#childrenSearchInput').on('input', function() {
        filterItemRelationships('children');
    });
    
    // Event listeners - Explosivos
    $('#btnAddExplosive').on('click', showAddExplosiveModal);
    $('#btnSaveExplosive').on('click', saveExplosive);
    $('#btnValidateExplosiveType').on('click', validateExplosiveNameType);
    $('#explosiveWidth, #explosiveHeight').on('input', calculateExplosiveSlots);
    
    // Event listeners - Munições
    $('#btnAddAmmunition').on('click', showAddAmmunitionModal);
    $('#btnSaveAmmunition').on('click', saveAmmunition);
    $('#btnValidateAmmunitionType').on('click', validateAmmunitionNameType);
    $('#ammunitionWidth, #ammunitionHeight').on('input', calculateAmmunitionSlots);
    
    // Event listeners - Magazines
    $('#btnAddMagazine').on('click', showAddMagazineModal);
    $('#btnSaveMagazine').on('click', saveMagazine);
    $('#btnValidateMagazineType').on('click', validateMagazineNameType);
    $('#magazineWidth, #magazineHeight').on('input', calculateMagazineSlots);
    $('#magazineWeaponSearch').on('input', filterMagazineWeapons);
    
    // Event listeners - Attachments
    $('#btnAddAttachment').on('click', showAddAttachmentModal);
    $('#btnSaveAttachment').on('click', saveAttachment);
    $('#btnValidateAttachmentType').on('click', validateAttachmentNameType);
    $('#attachmentWidth, #attachmentHeight').on('input', calculateAttachmentSlots);
    $('#attachmentWeaponSearch').on('input', filterAttachmentWeapons);
    $('#attachmentSearchInput').on('input', applyAttachmentFilters);
    $('#filterAttachmentType').on('change', applyAttachmentFilters);
});

// === GRID DE ARMAS ===
function loadWeapons() {
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            weaponsData = response.weapons;
            applyWeaponFilters();
        }
    });
}

function renderWeaponsGrid(data = weaponsData) {
    const grid = $('#weaponsGrid');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma arma encontrada</div>');
        return;
    }
    
    data.forEach(weapon => {
        const calibersText = weapon.calibers ? weapon.calibers.split(',').join(', ') : 'N/A';
        const card = $(`
            <div class="weapon-card">
                <div class="weapon-actions">
                    <button class="btn btn-sm btn-primary me-1" onclick="editWeapon(${weapon.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWeapon(${weapon.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <img src="${weapon.img}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${weapon.name}</div>
                <div class="weapon-info">
                    ${weapon.name_type}<br>
                    ${weapon.feed_type} | ${weapon.slots} slots<br>
                    ${weapon.width}x${weapon.height}<br>
                    <small class="text-muted">Calibre: ${calibersText}</small>
                </div>
            </div>
        `);
        grid.append(card);
    });
}

// === MODAL E VALIDAÇÕES ===
function showAddWeaponModal() {
    $('#weaponId').val('');
    $('#weaponForm')[0].reset();
    $('#typeValidationFeedback').text('').removeClass('valid invalid');
    selectedAmmunitions = [];
    selectedMagazines = [];
    selectedAttachments = [];
    loadRelationshipOptions();
    $('#weaponModal').modal('show');
}

function calculateSlots() {
    const width = parseInt($('#weaponWidth').val()) || 0;
    const height = parseInt($('#weaponHeight').val()) || 0;
    $('#weaponSlots').val(width * height);
}

function validateNameType() {
    const nameType = $('#weaponNameType').val();
    if (!nameType) {
        $('#typeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#typeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#typeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

// === RELACIONAMENTOS ===
function loadRelationshipOptions() {
    $.when(
        $.get('/api/items/ammunitions', { limit: 500 }),
        $.get('/api/items/magazines', { limit: 500 }),
        $.get('/api/items/attachments', { limit: 500 })
    ).done(function(ammoResp, magResp, attResp) {
        allAmmunitions = ammoResp[0].ammunitions;
        allMagazines = magResp[0].magazines;
        allAttachments = attResp[0].attachments;
        
        renderRelationshipGrid('ammo');
        renderRelationshipGrid('mags');
        renderRelationshipGrid('atts');
    });
}

function renderRelationshipGrid(type) {
    let data, selected, gridId;
    
    if (type === 'ammo') {
        data = allAmmunitions;
        selected = selectedAmmunitions;
        gridId = '#ammoGrid';
    } else if (type === 'mags') {
        data = allMagazines;
        selected = selectedMagazines;
        gridId = '#magsGrid';
    } else {
        data = allAttachments;
        selected = selectedAttachments;
        gridId = '#attsGrid';
    }
    
    const grid = $(gridId);
    grid.empty();
    
    data.forEach(item => {
        const isSelected = selected.includes(item.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="checkbox-indicator"></div>
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleRelationshipSelection(type, item.id);
        });
        
        grid.append(card);
    });
    
    updateSelectedSection(type);
    updateBadgeCount(type);
}

function toggleRelationshipSelection(type, itemId) {
    let selected;
    
    if (type === 'ammo') selected = selectedAmmunitions;
    else if (type === 'mags') selected = selectedMagazines;
    else selected = selectedAttachments;
    
    const index = selected.indexOf(itemId);
    if (index > -1) {
        selected.splice(index, 1);
    } else {
        selected.push(itemId);
    }
    
    renderRelationshipGrid(type);
}

function updateSelectedSection(type) {
    let data, selected, sectionId;
    
    if (type === 'ammo') {
        data = allAmmunitions;
        selected = selectedAmmunitions;
        sectionId = '#selectedAmmo .selected-items-grid';
    } else if (type === 'mags') {
        data = allMagazines;
        selected = selectedMagazines;
        sectionId = '#selectedMags .selected-items-grid';
    } else {
        data = allAttachments;
        selected = selectedAttachments;
        sectionId = '#selectedAtts .selected-items-grid';
    }
    
    const section = $(sectionId);
    section.empty();
    
    if (selected.length === 0) {
        section.html('<span class="text-muted">Nenhum item selecionado</span>');
        return;
    }
    
    selected.forEach(id => {
        const item = data.find(i => i.id === id);
        if (item) {
            const badge = $(`
                <div class="selected-item-badge">
                    ${item.name}
                    <span class="remove-btn" data-id="${id}">×</span>
                </div>
            `);
            
            badge.find('.remove-btn').on('click', function(e) {
                e.stopPropagation();
                toggleRelationshipSelection(type, id);
            });
            
            section.append(badge);
        }
    });
}

function updateBadgeCount(type) {
    let count, badgeId;
    
    if (type === 'ammo') {
        count = selectedAmmunitions.length;
        badgeId = '#ammoCount';
    } else if (type === 'mags') {
        count = selectedMagazines.length;
        badgeId = '#magsCount';
    } else {
        count = selectedAttachments.length;
        badgeId = '#attsCount';
    }
    
    $(badgeId).text(count);
}

function filterRelationships(type) {
    let searchVal, data, gridId;
    
    if (type === 'ammo') {
        searchVal = $('#ammoSearchInput').val().toLowerCase();
        data = allAmmunitions;
        gridId = '#ammoGrid';
    } else if (type === 'mags') {
        searchVal = $('#magsSearchInput').val().toLowerCase();
        data = allMagazines;
        gridId = '#magsGrid';
    } else {
        searchVal = $('#attsSearchInput').val().toLowerCase();
        data = allAttachments;
        gridId = '#attsGrid';
    }
    
    const filtered = data.filter(item => 
        item.name.toLowerCase().includes(searchVal) ||
        item.name_type.toLowerCase().includes(searchVal)
    );
    
    // Re-render apenas os itens filtrados
    const grid = $(gridId);
    grid.empty();
    
    filtered.forEach(item => {
        const isSelected = (type === 'ammo' ? selectedAmmunitions : 
                          type === 'mags' ? selectedMagazines : 
                          selectedAttachments).includes(item.id);
        
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="checkbox-indicator"></div>
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleRelationshipSelection(type, item.id);
        });
        
        grid.append(card);
    });
}

// === EDITAR ARMA ===
function editWeapon(weaponId) {
    $.ajax({
        url: `/api/manage/weapons/${weaponId}`,
        method: 'GET',
        success: function(response) {
            const weapon = response.weapon;
            const rels = response.relationships;
            
            $('#weaponId').val(weapon.id);
            $('#weaponName').val(weapon.name);
            $('#weaponNameType').val(weapon.name_type);
            $('#weaponFeedType').val(weapon.feed_type);
            $('#weaponWidth').val(weapon.width);
            $('#weaponHeight').val(weapon.height);
            $('#weaponSlots').val(weapon.slots);
            $('#weaponImg').val(weapon.img);
            
            // Carregar relacionamentos selecionados
            selectedAmmunitions = rels.ammunitions.map(a => a.id);
            selectedMagazines = rels.magazines.map(m => m.id);
            selectedAttachments = rels.attachments.map(a => a.id);
            
            loadRelationshipOptions();
            $('#weaponModal').modal('show');
        }
    });
}

// === SALVAR ARMA ===
function saveWeapon() {
    const weaponId = $('#weaponId').val();
    const isNew = !weaponId;
    
    const weaponData = {
        name: $('#weaponName').val(),
        name_type: $('#weaponNameType').val(),
        feed_type: $('#weaponFeedType').val(),
        slots: parseInt($('#weaponSlots').val()),
        width: parseInt($('#weaponWidth').val()),
        height: parseInt($('#weaponHeight').val()),
        img: $('#weaponImg').val()
    };
    
    // Validação
    if (!weaponData.name || !weaponData.name_type || !weaponData.feed_type) {
        showToast('Erro', 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    // Validar name_type antes de salvar
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(weaponData.name_type)}`,
        method: 'GET',
        success: function(response) {
            if (!response.valid) {
                showToast('Erro', 'Name type inválido. Não existe no types.xml', 'error');
                return;
            }
            
            // Prosseguir com o salvamento
            const url = isNew ? '/api/manage/weapons' : `/api/manage/weapons/${weaponId}`;
            const method = isNew ? 'POST' : 'PUT';
            
            $.ajax({
                url: url,
                method: method,
                contentType: 'application/json',
                data: JSON.stringify(weaponData),
                success: function(response) {
                    const savedId = isNew ? response.id : weaponId;
                    
                    // Salvar relacionamentos
                    $.ajax({
                        url: `/api/manage/weapons/${savedId}/relationships`,
                        method: 'PUT',
                        contentType: 'application/json',
                        data: JSON.stringify({
                            ammunitions: selectedAmmunitions,
                            magazines: selectedMagazines,
                            attachments: selectedAttachments
                        }),
                        success: function() {
                            showToast('Sucesso', 'Arma salva com sucesso!', 'success');
                            $('#weaponModal').modal('hide');
                            loadWeapons();
                        }
                    });
                },
                error: function(xhr) {
                    const error = xhr.responseJSON || {};
                    showToast('Erro', error.error || 'Erro ao salvar arma', 'error');
                }
            });
        }
    });
}

// === DELETAR ARMA ===
function deleteWeapon(weaponId) {
    if (!confirm('Tem certeza que deseja excluir esta arma?')) return;
    
    $.ajax({
        url: `/api/manage/weapons/${weaponId}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Arma excluída com sucesso!', 'success');
            loadWeapons();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao excluir arma', 'error');
        }
    });
}

// ============================================================================
// FUNÇÕES PARA OUTRAS ABAS
// ============================================================================

// === EXPLOSIVOS ===
function loadExplosives() {
    $.ajax({
        url: '/api/manage/explosives',
        method: 'GET',
        success: function(response) {
            explosivesData = response.explosives;
            renderGrid('explosives', explosivesData, $('#explosivesGrid'));
        }
    });
}

// === MUNIÇÕES ===
function loadAmmunitions() {
    $.ajax({
        url: '/api/manage/ammunitions',
        method: 'GET',
        success: function(response) {
            ammunitionsData = response.ammunitions;
            renderGrid('ammunitions', ammunitionsData, $('#ammunitionsGrid'));
        }
    });
}

// === MAGAZINES ===
function loadMagazines() {
    $.ajax({
        url: '/api/manage/magazines',
        method: 'GET',
        success: function(response) {
            magazinesData = response.magazines;
            renderGrid('magazines', magazinesData, $('#magazinesGrid'));
        }
    });
}

// === ATTACHMENTS ===
function loadAttachments() {
    $.ajax({
        url: '/api/manage/attachments',
        method: 'GET',
        success: function(response) {
            attachmentsData = response.attachments;
            applyAttachmentFilters();
        }
    });
}

function applyAttachmentFilters() {
    const searchTerm = $('#attachmentSearchInput').val().toLowerCase();
    const typeFilter = $('#filterAttachmentType').val();
    
    const filtered = attachmentsData.filter(att => {
        const matchesSearch = !searchTerm || 
            att.name.toLowerCase().includes(searchTerm) ||
            att.name_type.toLowerCase().includes(searchTerm);
        
        const matchesType = !typeFilter || att.type === typeFilter;
        
        return matchesSearch && matchesType;
    });
    
    renderGrid('attachments', filtered, $('#attachmentsGrid'));
}

// === CALIBERS ===
function loadCalibers() {
    $.ajax({
        url: '/api/manage/calibers',
        method: 'GET',
        success: function(response) {
            calibersData = response.calibers;
            // Calibers usa tabela simples (apenas nome)
            const tbody = $('#calibersTable tbody');
            tbody.empty();
            calibersData.forEach(caliber => {
                tbody.append(`
                    <tr>
                        <td>${caliber.id}</td>
                        <td>${caliber.name}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="editCaliber(${caliber.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger ms-1" onclick="deleteCaliber(${caliber.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `);
            });
        }
    });
}

// === TIPOS DE ITEM ===
function loadItemTypes() {
    $.ajax({
        url: '/api/manage/item-types',
        method: 'GET',
        success: function(response) {
            itemTypesData = response.types;
            const tbody = $('#itemTypesTable tbody');
            tbody.empty();
            
            if (itemTypesData.length === 0) {
                tbody.append('<tr><td colspan="3" class="text-center">Nenhum tipo de item encontrado</td></tr>');
                return;
            }
            
            itemTypesData.forEach(type => {
                tbody.append(`
                    <tr>
                        <td>${type.id}</td>
                        <td>${type.name}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="editItemType(${type.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger ms-1" onclick="deleteItemType(${type.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `);
            });
        },
        error: function(xhr) {
            showToast('Erro', 'Erro ao carregar tipos de item', 'error');
        }
    });
}

// === FUNÇÃO GENÉRICA PARA RENDERIZAR GRID ===
function renderGrid(type, data, grid) {
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum item encontrado</div>');
        return;
    }
    
    data.forEach(item => {
        const info = type === 'explosives' 
            ? `${item.slots || 0} slots | ${item.width || 0}x${item.height || 0}`
            : type === 'ammunitions'
            ? `Calibre ID: ${item.caliber_id || 'N/A'} | ${item.slots || 0} slots`
            : type === 'magazines'
            ? `Cap: ${item.capacity || 'N/A'} | ${item.slots || 0} slots`
            : type === 'items'
            ? `${item.slots || 0} slots | ${item.width || 0}x${item.height || 0}`
            : `Tipo: ${item.type || 'N/A'} | ${item.slots || 0} slots`;
        
        const card = $(`
            <div class="weapon-card">
                <div class="weapon-actions">
                    <button class="btn btn-sm btn-primary me-1" onclick="edit${capitalize(type)}(${item.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="delete${capitalize(type)}(${item.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/120?text=No+Image'">
                <div class="weapon-name">${item.name}</div>
                <div class="weapon-info">
                    ${item.name_type || 'N/A'}<br>
                    ${info}
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function capitalize(str) {
    // Mapear nomes para suas respectivas funções
    const mapping = {
        'explosives': 'Explosives',
        'ammunitions': 'Ammunitions',
        'magazines': 'Magazines',
        'attachments': 'Attachments',
        'items': 'Item',
        'weapons': 'Weapon'
    };
    
    if (mapping[str]) {
        return mapping[str];
    }
    
    // Fallback: remover 's' do final
    if (str.endsWith('s')) {
        return str.charAt(0).toUpperCase() + str.slice(1, -1);
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// === FUNÇÕES DE EDIÇÃO E EXCLUSÃO GENÉRICAS ===
// Estas funções são chamadas dinamicamente via onclick nos cards

function showAddExplosiveModal() {
    $('#explosiveId').val('');
    $('#explosiveForm')[0].reset();
    $('#explosiveModal').modal('show');
}

function editExplosives(id) {
    $.ajax({
        url: `/api/manage/explosives/${id}`,
        method: 'GET',
        success: function(response) {
            const exp = response.explosive;
            $('#explosiveId').val(exp.id);
            $('#explosiveName').val(exp.name);
            $('#explosiveNameType').val(exp.name_type);
            $('#explosiveWidth').val(exp.width);
            $('#explosiveHeight').val(exp.height);
            $('#explosiveSlots').val(exp.slots);
            $('#explosiveImg').val(exp.img);
            $('#explosiveModal').modal('show');
        }
    });
}

function saveExplosive() {
    const explosiveId = $('#explosiveId').val();
    const isNew = !explosiveId;
    
    const data = {
        name: $('#explosiveName').val(),
        name_type: $('#explosiveNameType').val(),
        width: parseInt($('#explosiveWidth').val()),
        height: parseInt($('#explosiveHeight').val()),
        slots: parseInt($('#explosiveSlots').val()),
        img: $('#explosiveImg').val()
    };
    
    const url = isNew ? '/api/manage/explosives' : `/api/manage/explosives/${explosiveId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function() {
            showToast('Sucesso', 'Explosivo salvo!', 'success');
            $('#explosiveModal').modal('hide');
            loadExplosives();
        },
        error: function() {
            showToast('Erro', 'Erro ao salvar explosivo', 'error');
        }
    });
}

function calculateExplosiveSlots() {
    const width = parseInt($('#explosiveWidth').val()) || 0;
    const height = parseInt($('#explosiveHeight').val()) || 0;
    $('#explosiveSlots').val(width * height);
}

function deleteExplosives(id) {
    if (!confirm('Excluir este explosivo?')) return;
    $.ajax({
        url: `/api/manage/explosives/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Explosivo excluído!', 'success');
            loadExplosives();
        }
    });
}

function showAddAmmunitionModal() {
    $('#ammunitionId').val('');
    $('#ammunitionForm')[0].reset();
    loadCalibersForAmmunition();
    $('#ammunitionModal').modal('show');
}

function editAmmunitions(id) {
    $.ajax({
        url: `/api/manage/ammunitions/${id}`,
        method: 'GET',
        success: function(response) {
            const ammo = response.ammunition;
            $('#ammunitionId').val(ammo.id);
            $('#ammunitionName').val(ammo.name);
            $('#ammunitionNameType').val(ammo.name_type);
            $('#ammunitionWidth').val(ammo.width);
            $('#ammunitionHeight').val(ammo.height);
            $('#ammunitionSlots').val(ammo.slots);
            $('#ammunitionImg').val(ammo.img);
            
            // Popular select de calibres
            loadCalibersForAmmunition(function() {
                $('#ammunitionCaliberId').val(ammo.caliber_id);
            });
            
            $('#ammunitionModal').modal('show');
        }
    });
}

function saveAmmunition() {
    const ammunitionId = $('#ammunitionId').val();
    const isNew = !ammunitionId;
    
    const data = {
        name: $('#ammunitionName').val(),
        name_type: $('#ammunitionNameType').val(),
        caliber_id: parseInt($('#ammunitionCaliberId').val()),
        width: parseInt($('#ammunitionWidth').val()),
        height: parseInt($('#ammunitionHeight').val()),
        slots: parseInt($('#ammunitionSlots').val()),
        img: $('#ammunitionImg').val()
    };
    
    const url = isNew ? '/api/manage/ammunitions' : `/api/manage/ammunitions/${ammunitionId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function() {
            showToast('Sucesso', 'Munição salva!', 'success');
            $('#ammunitionModal').modal('hide');
            loadAmmunitions();
        },
        error: function() {
            showToast('Erro', 'Erro ao salvar munição', 'error');
        }
    });
}

function calculateAmmunitionSlots() {
    const width = parseInt($('#ammunitionWidth').val()) || 0;
    const height = parseInt($('#ammunitionHeight').val()) || 0;
    $('#ammunitionSlots').val(width * height);
}

function loadCalibersForAmmunition(callback) {
    $.ajax({
        url: '/api/manage/calibers-list',
        method: 'GET',
        success: function(response) {
            const select = $('#ammunitionCaliberId');
            select.empty();
            select.append('<option value="">Selecione...</option>');
            response.calibers.forEach(caliber => {
                select.append(`<option value="${caliber.id}">${caliber.name}</option>`);
            });
            if (callback) callback();
        }
    });
}

function deleteAmmunitions(id) {
    if (!confirm('Excluir esta munição?')) return;
    $.ajax({
        url: `/api/manage/ammunitions/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Munição excluída!', 'success');
            loadAmmunitions();
        }
    });
}

function showAddMagazineModal() {
    $('#magazineId').val('');
    $('#magazineForm')[0].reset();
    selectedWeaponsForMagazine = [];
    loadWeaponsForMagazine();
    $('#magazineModal').modal('show');
}

function editMagazines(id) {
    $.ajax({
        url: `/api/manage/magazines/${id}`,
        method: 'GET',
        success: function(response) {
            const mag = response.magazine;
            $('#magazineId').val(mag.id);
            $('#magazineName').val(mag.name);
            $('#magazineNameType').val(mag.name_type);
            $('#magazineCapacity').val(mag.capacity);
            $('#magazineWidth').val(mag.width);
            $('#magazineHeight').val(mag.height);
            $('#magazineSlots').val(mag.slots);
            $('#magazineImg').val(mag.img);
            
            // Buscar armas relacionadas
            $.ajax({
                url: `/api/manage/magazines/${id}/weapons`,
                method: 'GET',
                success: function(resp) {
                    selectedWeaponsForMagazine = resp.weapons.map(w => w.id);
                    loadWeaponsForMagazine();
                    renderSelectedWeaponsForMagazine();
                }
            });
            
            $('#magazineModal').modal('show');
        }
    });
}

function saveMagazine() {
    const magazineId = $('#magazineId').val();
    const isNew = !magazineId;
    
    const data = {
        name: $('#magazineName').val(),
        name_type: $('#magazineNameType').val(),
        capacity: parseInt($('#magazineCapacity').val()),
        width: parseInt($('#magazineWidth').val()),
        height: parseInt($('#magazineHeight').val()),
        slots: parseInt($('#magazineSlots').val()),
        img: $('#magazineImg').val()
    };
    
    const url = isNew ? '/api/manage/magazines' : `/api/manage/magazines/${magazineId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function(response) {
            const savedId = response.id || magazineId;
            
            // Salvar relacionamento com armas
            $.ajax({
                url: `/api/manage/magazines/${savedId}/weapons`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ weapon_ids: selectedWeaponsForMagazine }),
                success: function() {
                    showToast('Sucesso', 'Magazine salvo!', 'success');
                    $('#magazineModal').modal('hide');
                    loadMagazines();
                }
            });
        },
        error: function() {
            showToast('Erro', 'Erro ao salvar magazine', 'error');
        }
    });
}

function calculateMagazineSlots() {
    const width = parseInt($('#magazineWidth').val()) || 0;
    const height = parseInt($('#magazineHeight').val()) || 0;
    $('#magazineSlots').val(width * height);
}

function loadWeaponsForMagazine() {
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            allWeaponsForRelationship = response.weapons;
            renderMagazineWeaponGrid();
        }
    });
}

function renderMagazineWeaponGrid() {
    const grid = $('#magazineWeaponGrid');
    grid.empty();
    
    const searchTerm = $('#magazineWeaponSearch').val().toLowerCase();
    const filtered = allWeaponsForRelationship.filter(w => {
        return !searchTerm || w.name.toLowerCase().includes(searchTerm) || 
               w.name_type.toLowerCase().includes(searchTerm);
    });
    
    filtered.forEach(weapon => {
        const isSelected = selectedWeaponsForMagazine.includes(weapon.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" onclick="toggleWeaponForMagazine(${weapon.id})">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="event.stopPropagation()" onclick="toggleWeaponForMagazine(${weapon.id})">
                <img src="${weapon.img}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/60?text=No+Img'">
                <div class="item-name">${weapon.name}</div>
            </div>
        `);
        grid.append(card);
    });
}

function toggleWeaponForMagazine(weaponId) {
    const index = selectedWeaponsForMagazine.indexOf(weaponId);
    if (index === -1) {
        selectedWeaponsForMagazine.push(weaponId);
    } else {
        selectedWeaponsForMagazine.splice(index, 1);
    }
    renderMagazineWeaponGrid();
    renderSelectedWeaponsForMagazine();
}

function renderSelectedWeaponsForMagazine() {
    const container = $('#selectedMagazineWeapons .selected-items-grid');
    container.empty();
    
    selectedWeaponsForMagazine.forEach(weaponId => {
        const weapon = allWeaponsForRelationship.find(w => w.id === weaponId);
        if (weapon) {
            const badge = $(`
                <span class="badge bg-primary me-2 mb-2">
                    ${weapon.name}
                    <button type="button" class="btn-close btn-close-white ms-1" onclick="toggleWeaponForMagazine(${weaponId})"></button>
                </span>
            `);
            container.append(badge);
        }
    });
}

function filterMagazineWeapons() {
    renderMagazineWeaponGrid();
}

function deleteMagazines(id) {
    if (!confirm('Excluir este magazine?')) return;
    $.ajax({
        url: `/api/manage/magazines/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Magazine excluído!', 'success');
            loadMagazines();
        }
    });
}

function showAddAttachmentModal() {
    $('#attachmentId').val('');
    $('#attachmentForm')[0].reset();
    selectedWeaponsForAttachment = [];
    loadWeaponsForAttachment();
    $('#attachmentModal').modal('show');
}

function editAttachments(id) {
    $.ajax({
        url: `/api/manage/attachments/${id}`,
        method: 'GET',
        success: function(response) {
            const att = response.attachment;
            $('#attachmentId').val(att.id);
            $('#attachmentName').val(att.name);
            $('#attachmentNameType').val(att.name_type);
            $('#attachmentType').val(att.type);
            $('#attachmentBattery').prop('checked', att.battery === 1);
            $('#attachmentWidth').val(att.width);
            $('#attachmentHeight').val(att.height);
            $('#attachmentSlots').val(att.slots);
            $('#attachmentImg').val(att.img);
            
            // Buscar armas relacionadas
            $.ajax({
                url: `/api/manage/attachments/${id}/weapons`,
                method: 'GET',
                success: function(resp) {
                    selectedWeaponsForAttachment = resp.weapons.map(w => w.id);
                    loadWeaponsForAttachment();
                    renderSelectedWeaponsForAttachment();
                }
            });
            
            $('#attachmentModal').modal('show');
        }
    });
}

function saveAttachment() {
    const attachmentId = $('#attachmentId').val();
    const isNew = !attachmentId;
    
    const data = {
        name: $('#attachmentName').val(),
        name_type: $('#attachmentNameType').val(),
        type: $('#attachmentType').val(),
        battery: $('#attachmentBattery').is(':checked') ? 1 : 0,
        width: parseInt($('#attachmentWidth').val()),
        height: parseInt($('#attachmentHeight').val()),
        slots: parseInt($('#attachmentSlots').val()),
        img: $('#attachmentImg').val()
    };
    
    const url = isNew ? '/api/manage/attachments' : `/api/manage/attachments/${attachmentId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function(response) {
            const savedId = response.id || attachmentId;
            
            // Salvar relacionamento com armas
            $.ajax({
                url: `/api/manage/attachments/${savedId}/weapons`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ weapon_ids: selectedWeaponsForAttachment }),
                success: function() {
                    showToast('Sucesso', 'Attachment salvo!', 'success');
                    $('#attachmentModal').modal('hide');
                    loadAttachments();
                }
            });
        },
        error: function() {
            showToast('Erro', 'Erro ao salvar attachment', 'error');
        }
    });
}

function calculateAttachmentSlots() {
    const width = parseInt($('#attachmentWidth').val()) || 0;
    const height = parseInt($('#attachmentHeight').val()) || 0;
    $('#attachmentSlots').val(width * height);
}

function loadWeaponsForAttachment() {
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            allWeaponsForRelationship = response.weapons;
            renderAttachmentWeaponGrid();
        }
    });
}

function renderAttachmentWeaponGrid() {
    const grid = $('#attachmentWeaponGrid');
    grid.empty();
    
    const searchTerm = $('#attachmentWeaponSearch').val().toLowerCase();
    const filtered = allWeaponsForRelationship.filter(w => {
        return !searchTerm || w.name.toLowerCase().includes(searchTerm) || 
               w.name_type.toLowerCase().includes(searchTerm);
    });
    
    filtered.forEach(weapon => {
        const isSelected = selectedWeaponsForAttachment.includes(weapon.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" onclick="toggleWeaponForAttachment(${weapon.id})">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="event.stopPropagation()" onclick="toggleWeaponForAttachment(${weapon.id})">
                <img src="${weapon.img}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/60?text=No+Img'">
                <div class="item-name">${weapon.name}</div>
            </div>
        `);
        grid.append(card);
    });
}

function toggleWeaponForAttachment(weaponId) {
    const index = selectedWeaponsForAttachment.indexOf(weaponId);
    if (index === -1) {
        selectedWeaponsForAttachment.push(weaponId);
    } else {
        selectedWeaponsForAttachment.splice(index, 1);
    }
    renderAttachmentWeaponGrid();
    renderSelectedWeaponsForAttachment();
}

function renderSelectedWeaponsForAttachment() {
    const container = $('#selectedAttachmentWeapons .selected-items-grid');
    container.empty();
    
    selectedWeaponsForAttachment.forEach(weaponId => {
        const weapon = allWeaponsForRelationship.find(w => w.id === weaponId);
        if (weapon) {
            const badge = $(`
                <span class="badge bg-primary me-2 mb-2">
                    ${weapon.name}
                    <button type="button" class="btn-close btn-close-white ms-1" onclick="toggleWeaponForAttachment(${weaponId})"></button>
                </span>
            `);
            container.append(badge);
        }
    });
}

function filterAttachmentWeapons() {
    renderAttachmentWeaponGrid();
}

function deleteAttachments(id) {
    if (!confirm('Excluir este attachment?')) return;
    $.ajax({
        url: `/api/manage/attachments/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Attachment excluído!', 'success');
            loadAttachments();
        }
    });
}

function editCaliber(id) {
    const caliber = calibersData.find(c => c.id === id);
    if (!caliber) return;
    
    $('#caliberModalId').val(caliber.id);
    $('#caliberName').val(caliber.name);
    $('#caliberModal').modal('show');
}

function deleteCaliber(id) {
    if (!confirm('Excluir este calibre?')) return;
    $.ajax({
        url: `/api/manage/calibers/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Calibre excluído!', 'success');
            loadCalibers();
        }
    });
}

function editItemType(id) {
    const type = itemTypesData.find(t => t.id === id);
    if (!type) return;
    
    $('#itemTypeModalId').val(type.id);
    $('#itemTypeName').val(type.name);
    $('#itemTypeModal').modal('show');
}

function deleteItemType(id) {
    if (!confirm('Excluir este tipo de item?')) return;
    $.ajax({
        url: `/api/manage/item-types/${id}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Tipo de item excluído!', 'success');
            loadItemTypes();
        }
    });
}

// Salvamento
$(document).on('click', '#btnSaveCaliber', function() {
    const id = $('#caliberModalId').val();
    const isNew = !id;
    const data = { name: $('#caliberName').val() };
    
    const url = isNew ? '/api/manage/calibers' : `/api/manage/calibers/${id}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function() {
            showToast('Sucesso', 'Calibre salvo!', 'success');
            $('#caliberModal').modal('hide');
            loadCalibers();
        }
    });
});

$(document).on('click', '#btnSaveItemType', function() {
    const id = $('#itemTypeModalId').val();
    const isNew = !id;
    const data = { name: $('#itemTypeName').val() };
    
    const url = isNew ? '/api/manage/item-types' : `/api/manage/item-types/${id}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function() {
            showToast('Sucesso', 'Tipo de item salvo!', 'success');
            $('#itemTypeModal').modal('hide');
            loadItemTypes();
        }
    });
});

// Botões de adicionar
$('#btnAddCaliber').on('click', function() {
    $('#caliberModalId').val('');
    $('#caliberForm')[0].reset();
    $('#caliberModal').modal('show');
});

$('#btnAddItemType').on('click', function() {
    $('#itemTypeModalId').val('');
    $('#itemTypeForm')[0].reset();
    $('#itemTypeModal').modal('show');
});

// ============================================================================
// FUNÇÕES PARA ABA DE ITENS
// ============================================================================

// Dados globais
let itemsData = [];
let allItems = [];
let selectedParentItems = [];
let selectedChildItems = [];
let itemTypes = [];

function loadItems() {
    $.ajax({
        url: '/api/manage/items',
        method: 'GET',
        success: function(response) {
            itemsData = response.items;
            applyItemFilters();
        }
    });
}


function showAddItemModal() {
    $('#itemId').val('');
    $('#itemForm')[0].reset();
    $('#itemTypeValidationFeedback').text('').removeClass('valid invalid');
    selectedParentItems = [];
    selectedChildItems = [];
    loadItemTypesDropdown();
    loadAllItemsForCompatibility();
    $('#itemModal').modal('show');
}

function loadItemTypesDropdown() {
    $.ajax({
        url: '/api/manage/item-types',
        method: 'GET',
        success: function(response) {
            itemTypes = response.types;
            const select = $('#itemTypeId');
            select.empty();
            select.append('<option value="">Selecione...</option>');
            itemTypes.forEach(type => {
                select.append(`<option value="${type.id}">${type.name}</option>`);
            });
        }
    });
}

function loadAllItemsForCompatibility() {
    $.ajax({
        url: '/api/manage/items',
        method: 'GET',
        data: { limit: 1000 },
        success: function(response) {
            allItems = response.items;
            renderItemCompatibilityGrid('parents');
            renderItemCompatibilityGrid('children');
        }
    });
}

function calculateItemSlots() {
    const width = parseInt($('#itemWidth').val()) || 0;
    const height = parseInt($('#itemHeight').val()) || 0;
    $('#itemSlots').val(width * height);
}

function calculateItemStorageSlots() {
    const width = parseInt($('#itemStorageWidth').val()) || 0;
    const height = parseInt($('#itemStorageHeight').val()) || 0;
    $('#itemStorageSlots').val(width * height);
}

function validateItemNameType() {
    const nameType = $('#itemNameType').val();
    if (!nameType) {
        $('#itemTypeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#itemTypeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#itemTypeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

function validateExplosiveNameType() {
    const nameType = $('#explosiveNameType').val();
    if (!nameType) {
        $('#explosiveTypeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#explosiveTypeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#explosiveTypeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

function validateAmmunitionNameType() {
    const nameType = $('#ammunitionNameType').val();
    if (!nameType) {
        $('#ammunitionTypeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#ammunitionTypeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#ammunitionTypeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

function validateMagazineNameType() {
    const nameType = $('#magazineNameType').val();
    if (!nameType) {
        $('#magazineTypeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#magazineTypeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#magazineTypeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

function validateAttachmentNameType() {
    const nameType = $('#attachmentNameType').val();
    if (!nameType) {
        $('#attachmentTypeValidationFeedback').text('Digite um name_type').removeClass('valid invalid');
        return;
    }
    
    $.ajax({
        url: `/api/validate/item-type/${encodeURIComponent(nameType)}`,
        method: 'GET',
        success: function(response) {
            if (response.valid) {
                $('#attachmentTypeValidationFeedback')
                    .text('✓ Name type válido!')
                    .removeClass('invalid')
                    .addClass('valid');
            } else {
                $('#attachmentTypeValidationFeedback')
                    .text('✗ Name type não encontrado no types.xml')
                    .removeClass('valid')
                    .addClass('invalid');
            }
        }
    });
}

function renderItemCompatibilityGrid(type) {
    const selected = type === 'parents' ? selectedParentItems : selectedChildItems;
    const gridId = type === 'parents' ? '#parentsGrid' : '#childrenGrid';
    const grid = $(gridId);
    grid.empty();
    
    allItems.forEach(item => {
        const isSelected = selected.includes(item.id);
        const card = $(`
            <div class="relationship-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
                <div class="checkbox-indicator"></div>
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            toggleItemCompatibility(type, item.id);
        });
        
        grid.append(card);
    });
    
    updateItemSelectedSection(type);
    updateItemBadgeCount(type);
}

function toggleItemCompatibility(type, itemId) {
    const selected = type === 'parents' ? selectedParentItems : selectedChildItems;
    const index = selected.indexOf(itemId);
    
    if (index > -1) {
        selected.splice(index, 1);
    } else {
        selected.push(itemId);
    }
    
    renderItemCompatibilityGrid(type);
}

function updateItemSelectedSection(type) {
    const selected = type === 'parents' ? selectedParentItems : selectedChildItems;
    const sectionId = type === 'parents' ? '#selectedParents .selected-items-grid' : '#selectedChildren .selected-items-grid';
    const section = $(sectionId);
    section.empty();
    
    if (selected.length === 0) {
        section.html('<span class="text-muted">Nenhum item selecionado</span>');
        return;
    }
    
    selected.forEach(id => {
        const item = allItems.find(i => i.id === id);
        if (item) {
            const badge = $(`
                <div class="selected-item-badge">
                    ${item.name}
                    <span class="remove-btn" data-id="${id}">×</span>
                </div>
            `);
            
            badge.find('.remove-btn').on('click', function(e) {
                e.stopPropagation();
                toggleItemCompatibility(type, id);
            });
            
            section.append(badge);
        }
    });
}

function updateItemBadgeCount(type) {
    const count = type === 'parents' ? selectedParentItems.length : selectedChildItems.length;
    const badgeId = type === 'parents' ? '#parentsCount' : '#childrenCount';
    $(badgeId).text(count);
}

function filterItemRelationships(type) {
    const searchTerm = type === 'parents' ? $('#parentsSearchInput').val() : $('#childrenSearchInput').val();
    const gridId = type === 'parents' ? '#parentsGrid' : '#childrenGrid';
    const grid = $(gridId);
    
    grid.find('.relationship-item').each(function() {
        const item = $(this);
        const name = item.find('.item-name').text().toLowerCase();
        if (name.includes(searchTerm.toLowerCase())) {
            item.show();
        } else {
            item.hide();
        }
    });
}

function editItem(itemId) {
    $.ajax({
        url: `/api/manage/items/${itemId}`,
        method: 'GET',
        success: function(response) {
            const item = response.item;
            const compat = response.compatibility;
            
            $('#itemId').val(item.id);
            $('#itemName').val(item.name);
            $('#itemNameType').val(item.name_type);
            $('#itemWidth').val(item.width);
            $('#itemHeight').val(item.height);
            $('#itemSlots').val(item.slots);
            $('#itemStorageWidth').val(item.storage_width || 0);
            $('#itemStorageHeight').val(item.storage_height || 0);
            $('#itemStorageSlots').val(item.storage_slots || 0);
            $('#itemLocalization').val(item.localization || '');
            $('#itemImg').val(item.img);
            
            // Carregar compatibilidades
            selectedParentItems = compat.parents.map(p => p.id);
            selectedChildItems = compat.children.map(c => c.id);
            
            // Carregar tipos e definir o valor após o carregamento
            $.ajax({
                url: '/api/manage/item-types',
                method: 'GET',
                success: function(response) {
                    itemTypes = response.types;
                    const select = $('#itemTypeId');
                    select.empty();
                    select.append('<option value="">Selecione...</option>');
                    itemTypes.forEach(type => {
                        select.append(`<option value="${type.id}">${type.name}</option>`);
                    });
                    // Definir o valor atual após popular o select
                    select.val(item.type_id);
                    
                    // Carregar itens de compatibilidade após definir o tipo
                    loadAllItemsForCompatibility();
                }
            });
            
            $('#itemModal').modal('show');
        }
    });
}

function saveItem() {
    const itemId = $('#itemId').val();
    const isNew = !itemId;
    
    const itemData = {
        name: $('#itemName').val(),
        name_type: $('#itemNameType').val(),
        type_id: parseInt($('#itemTypeId').val()),
        slots: parseInt($('#itemSlots').val()),
        width: parseInt($('#itemWidth').val()),
        height: parseInt($('#itemHeight').val()),
        storage_slots: parseInt($('#itemStorageSlots').val()) || 0,
        storage_width: parseInt($('#itemStorageWidth').val()) || 0,
        storage_height: parseInt($('#itemStorageHeight').val()) || 0,
        localization: $('#itemLocalization').val() || '',
        img: $('#itemImg').val()
    };
    
    // Validação
    if (!itemData.name || !itemData.name_type || !itemData.type_id) {
        showToast('Erro', 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    const url = isNew ? '/api/manage/items' : `/api/manage/items/${itemId}`;
    const method = isNew ? 'POST' : 'PUT';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(itemData),
        success: function(response) {
            const savedId = isNew ? response.id : itemId;
            
            // Salvar compatibilidades
            $.ajax({
                url: `/api/manage/items/${savedId}/compatibility`,
                method: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                    parents: selectedParentItems,
                    children: selectedChildItems
                }),
                success: function() {
                    showToast('Sucesso', 'Item salvo com sucesso!', 'success');
                    $('#itemModal').modal('hide');
                    loadItems();
                },
                error: function() {
                    showToast('Erro', 'Erro ao salvar compatibilidades', 'error');
                }
            });
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao salvar item', 'error');
        }
    });
}

function deleteItem(itemId) {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    
    $.ajax({
        url: `/api/manage/items/${itemId}`,
        method: 'DELETE',
        success: function() {
            showToast('Sucesso', 'Item excluído com sucesso!', 'success');
            loadItems();
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.error || 'Erro ao excluir item', 'error');
        }
    });
}

// Exportar para global scope (para onclick nos cards)
window.editItem = editItem;
window.deleteItem = deleteItem;

// ============================================================================
// FUNÇÕES DE FILTROS
// ============================================================================

// Carregar calibres para o filtro
function loadCalibersFilter() {
    $.ajax({
        url: '/api/manage/calibers-list',
        method: 'GET',
        success: function(response) {
            const select = $('#filterCaliber');
            response.calibers.forEach(caliber => {
                select.append(`<option value="${caliber.name}">${caliber.name}</option>`);
            });
        }
    });
}

// Aplicar filtros de armas
function applyWeaponFilters() {
    const searchTerm = $('#weaponSearchInput').val().toLowerCase();
    const feedType = $('#filterFeedType').val();
    const size = $('#filterWeaponSize').val();
    const caliber = $('#filterCaliber').val();
    
    const filtered = weaponsData.filter(weapon => {
        // Filtro de busca por texto
        const matchesSearch = !searchTerm || 
            weapon.name.toLowerCase().includes(searchTerm) ||
            weapon.name_type.toLowerCase().includes(searchTerm);
        
        // Filtro por feed type
        const matchesFeedType = !feedType || weapon.feed_type === feedType;
        
        // Filtro por tamanho
        let matchesSize = true;
        if (size === 'small') {
            matchesSize = weapon.slots <= 12;
        } else if (size === 'large') {
            matchesSize = weapon.slots > 12;
        }
        
        // Filtro por calibre
        const matchesCaliber = !caliber || 
            (weapon.calibers && weapon.calibers.includes(caliber));
        
        return matchesSearch && matchesFeedType && matchesSize && matchesCaliber;
    });
    
    renderWeaponsGrid(filtered);
}

// Carregar tipos de item para o filtro
function loadItemTypesFilter() {
    $.ajax({
        url: '/api/manage/item-types',
        method: 'GET',
        success: function(response) {
            const select = $('#filterItemType');
            response.types.forEach(type => {
                select.append(`<option value="${type.id}">${type.name}</option>`);
            });
        }
    });
}

// Aplicar filtros de itens
function applyItemFilters() {
    const searchTerm = $('#itemSearchInput').val().toLowerCase();
    const typeId = $('#filterItemType').val();
    const location = $('#filterItemLocation').val();
    const storage = $('#filterItemStorage').val();
    
    const filtered = itemsData.filter(item => {
        // Filtro de busca por texto
        const matchesSearch = !searchTerm || 
            item.name.toLowerCase().includes(searchTerm) ||
            item.name_type.toLowerCase().includes(searchTerm);
        
        // Filtro por tipo
        const matchesType = !typeId || item.type_id == typeId;
        
        // Filtro por localização
        let matchesLocation = true;
        if (location) {
            if (location === 'none') {
                matchesLocation = !item.localization || item.localization === '' || item.localization === null;
            } else {
                matchesLocation = item.localization === location;
            }
        }
        
        // Filtro por storage
        let matchesStorage = true;
        if (storage) {
            const storageSlots = item.storage_slots || 0;
            if (storage === 'with') {
                matchesStorage = storageSlots > 0;
            } else if (storage === 'without') {
                matchesStorage = storageSlots === 0;
            }
        }
        
        return matchesSearch && matchesType && matchesLocation && matchesStorage;
    });
    
    renderGrid('items', filtered, $('#itemsGrid'));
}

// Nota: Event listeners para filtros de itens já estão configurados acima na linha 783-787
