let weaponsData = [];
let selectedAmmunitions = [];
let selectedMagazines = [];
let selectedAttachments = [];
let allAmmunitions = [];
let allMagazines = [];
let allAttachments = [];

$(document).ready(function() {
    loadWeapons();
    
    // Event listeners
    $('#btnAddWeapon').on('click', showAddWeaponModal);
    $('#btnSaveWeapon').on('click', saveWeapon);
    $('#btnValidateType').on('click', validateNameType);
    $('#weaponSearchInput').on('input', filterWeapons);
    
    // Cálculo automático de slots
    $('#weaponWidth, #weaponHeight').on('input', calculateSlots);
    
    // Busca em relacionamentos
    $('#ammoSearchInput').on('input', () => filterRelationships('ammo'));
    $('#magsSearchInput').on('input', () => filterRelationships('mags'));
    $('#attsSearchInput').on('input', () => filterRelationships('atts'));
});

// === GRID DE ARMAS ===
function loadWeapons() {
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            weaponsData = response.weapons;
            renderWeaponsGrid();
        }
    });
}

function renderWeaponsGrid(filter = '') {
    const grid = $('#weaponsGrid');
    grid.empty();
    
    const filtered = weaponsData.filter(w => 
        w.name.toLowerCase().includes(filter.toLowerCase()) ||
        w.name_type.toLowerCase().includes(filter.toLowerCase())
    );
    
    if (filtered.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma arma encontrada</div>');
        return;
    }
    
    filtered.forEach(weapon => {
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
                    ${weapon.width}x${weapon.height}
                </div>
            </div>
        `);
        grid.append(card);
    });
}

function filterWeapons() {
    const filter = $('#weaponSearchInput').val();
    renderWeaponsGrid(filter);
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

