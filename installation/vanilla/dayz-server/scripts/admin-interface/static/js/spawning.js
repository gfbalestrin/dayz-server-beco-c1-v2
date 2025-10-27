let playersData = [];
let weaponsData = [];
let itemsData = [];
let selectedWeapon = null;
let selectedItem = null;

// Lista de veículos comuns
const VEHICLES = [
    { type: 'OffroadHatchback', name: 'Hatchback' },
    { type: 'Sedan_02', name: 'Sedan' },
    { type: 'CivilianSedan', name: 'Sedan Civil' },
    { type: 'Hatchback_02', name: 'Hatchback 02' },
    { type: 'OffroadHatchback_Blue', name: 'Hatchback Azul' },
    { type: 'Truck_01_Covered', name: 'Caminhão Coberto' },
    { type: 'V3S_Chassis', name: 'V3S' }
];

function loadPlayers() {
    $.ajax({
        url: '/api/players/online',
        method: 'GET',
        success: function(response) {
            playersData = response.players;
            renderPlayerSelects();
        }
    });
}

function renderPlayerSelects() {
    const options = playersData.map(p => 
        `<option value="${p.PlayerID}">${p.PlayerName} (${p.SteamName})</option>`
    ).join('');
    
    $('#weaponPlayerSelect, #itemPlayerSelect, #vehiclePlayerSelect, #explosivePlayerSelect, #ammoPlayerSelect, #magazinePlayerSelect, #attachmentPlayerSelect').html(
        '<option value="">Selecione um jogador</option>' + options
    );
}

// === ABA DE ARMAS ===

function loadWeapons() {
    const search = $('#weaponSearch').val();
    
    $('#weaponsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/weapons',
        method: 'GET',
        data: { search: search, limit: 100 },
        success: function(response) {
            weaponsData = response.weapons;
            renderWeaponsGrid();
        },
        error: function() {
            $('#weaponsGrid').html('<div class="text-center p-5 text-danger">Erro ao carregar armas</div>');
        }
    });
}

function renderWeaponsGrid() {
    const grid = $('#weaponsGrid');
    grid.empty();
    
    if (weaponsData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma arma encontrada</div>');
        return;
    }
    
    weaponsData.forEach(weapon => {
        const card = $(`
            <div class="item-card" data-weapon-id="${weapon.id}" data-weapon-type="${weapon.name_type}">
                <img src="${weapon.img}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                <div class="item-name" title="${weapon.name}">${weapon.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            selectWeapon(weapon);
        });
        
        grid.append(card);
    });
}

function selectWeapon(weapon) {
    selectedWeapon = weapon;
    $('.item-card').removeClass('selected');
    $(`.item-card[data-weapon-id="${weapon.id}"]`).addClass('selected');
    showSpawnConfirmModal('weapon');
}

// === ABA DE ITENS ===

function loadItemTypes() {
    $.ajax({
        url: '/api/items/types',
        method: 'GET',
        success: function(response) {
            const options = response.types.map(t => 
                `<option value="${t.id}">${t.name}</option>`
            ).join('');
            $('#itemTypeSelect').html('<option value="">Todas</option>' + options);
        }
    });
}

function loadItems() {
    const typeId = $('#itemTypeSelect').val();
    const search = $('#itemSearch').val();
    
    $('#itemsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/items',
        method: 'GET',
        data: { type_id: typeId || null, search: search, limit: 100 },
        success: function(response) {
            itemsData = response.items;
            renderItemsGrid();
        },
        error: function() {
            $('#itemsGrid').html('<div class="text-center p-5 text-danger">Erro ao carregar itens</div>');
        }
    });
}

function renderItemsGrid() {
    const grid = $('#itemsGrid');
    grid.empty();
    
    if (itemsData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum item encontrado</div>');
        return;
    }
    
    itemsData.forEach(item => {
        const card = $(`
            <div class="item-card" data-item-id="${item.id}" data-item-type="${item.name_type}">
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                <div class="item-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            selectItem(item);
        });
        
        grid.append(card);
    });
}

function selectItem(item) {
    selectedItem = item;
    $('.item-card').removeClass('selected');
    $(`.item-card[data-item-id="${item.id}"]`).addClass('selected');
    showSpawnConfirmModal('item');
}

// === ABA DE VEÍCULOS ===

function renderVehiclesGrid() {
    const grid = $('#vehiclesGrid');
    grid.empty();
    
    VEHICLES.forEach(vehicle => {
        const card = $(`
            <div class="vehicle-card" data-vehicle-type="${vehicle.type}">
                <i class="fas fa-car"></i>
                <div class="vehicle-name">${vehicle.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            spawnVehicle(vehicle);
        });
        
        grid.append(card);
    });
}

function spawnVehicle(vehicle) {
    const playerId = $('#vehiclePlayerSelect').val();
    if (!playerId) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    const player = playersData.find(p => p.PlayerID === playerId);
    
    if (!confirm(`Spawnar ${vehicle.name} próximo ao jogador ${player.PlayerName}?`)) return;
    
    $.ajax({
        url: '/api/spawn/vehicle',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_id: playerId,
            vehicle_type: vehicle.type
        }),
        success: function(response) {
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao spawnar veículo', 'error');
        }
    });
}

// === MODAL DE CONFIRMAÇÃO ===

function showSpawnConfirmModal(type) {
    let playerId, quantity, itemName, itemType;
    
    if (type === 'weapon') {
        playerId = $('#weaponPlayerSelect').val();
        quantity = $('#weaponQuantity').val();
        itemName = selectedWeapon.name;
        itemType = selectedWeapon.name_type;
    } else if (type === 'item') {
        playerId = $('#itemPlayerSelect').val();
        quantity = $('#itemQuantity').val();
        itemName = selectedItem.name;
        itemType = selectedItem.name_type;
    } else {
        return;
    }
    
    if (!playerId) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    const player = playersData.find(p => p.PlayerID === playerId);
    
    $('#confirmItemName').text(itemName);
    $('#confirmPlayerName').text(player.PlayerName);
    $('#confirmQuantity').text(quantity);
    
    // Armazenar dados no botão
    $('#confirmSpawnBtn').data('type', type);
    $('#confirmSpawnBtn').data('playerId', playerId);
    $('#confirmSpawnBtn').data('itemType', itemType);
    $('#confirmSpawnBtn').data('quantity', quantity);
    
    const modal = new bootstrap.Modal(document.getElementById('spawnConfirmModal'));
    modal.show();
}

function executeSpawn() {
    const type = $('#confirmSpawnBtn').data('type');
    const playerId = $('#confirmSpawnBtn').data('playerId');
    const itemType = $('#confirmSpawnBtn').data('itemType');
    const quantity = $('#confirmSpawnBtn').data('quantity');
    
    $('#confirmSpawnBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Spawnando...');
    
    $.ajax({
        url: '/api/spawn/item',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_id: playerId,
            item_type: itemType,
            quantity: quantity
        }),
        success: function(response) {
            bootstrap.Modal.getInstance(document.getElementById('spawnConfirmModal')).hide();
            showToast('Sucesso', response.message, 'success');
            
            // Limpar seleção
            selectedWeapon = null;
            selectedItem = null;
            selectedExplosive = null;
            selectedAmmo = null;
            selectedMagazine = null;
            selectedAttachment = null;
            $('.item-card').removeClass('selected');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao spawnar', 'error');
        },
        complete: function() {
            $('#confirmSpawnBtn').prop('disabled', false).html('<i class="fas fa-magic me-1"></i>Spawnar');
        }
    });
}

// === INICIALIZAÇÃO ===

// === ABA DE EXPLOSIVOS ===
let explosivesData = [];
let selectedExplosive = null;

function loadExplosives() {
    const search = $('#explosiveSearch').val();
    $('#explosivesGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/explosives',
        method: 'GET',
        data: { search: search, limit: 100 },
        success: function(response) {
            explosivesData = response.explosives;
            renderExplosivesGrid();
        }
    });
}

function renderExplosivesGrid() {
    const grid = $('#explosivesGrid');
    grid.empty();
    
    if (explosivesData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum explosivo encontrado</div>');
        return;
    }
    
    explosivesData.forEach(explosive => {
        const card = $('<div class="item-card"></div>');
        card.data('explosive', explosive);
        card.html(`
            <img src="${explosive.img}" alt="${explosive.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
            <div class="item-name" title="${explosive.name}">${explosive.name}</div>
        `);
        card.on('click', function() {
            selectExplosive(explosive);
        });
        grid.append(card);
    });
}

function selectExplosive(explosive) {
    selectedExplosive = explosive;
    $('.item-card').removeClass('selected');
    $('.item-card').filter(function() { return $(this).data('explosive')?.id === explosive.id; }).addClass('selected');
    showSpawnConfirmModal('explosive', explosive);
}

// === ABA DE MUNIÇÕES ===
let ammunitionsData = [];
let selectedAmmo = null;
let calibersData = [];

function loadCalibers() {
    $.ajax({
        url: '/api/items/calibers',
        method: 'GET',
        success: function(response) {
            calibersData = response.calibers;
            const options = calibersData.map(c => 
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
            $('#caliberSelect').html('<option value="">Todos</option>' + options);
            loadAmmunitions();
        }
    });
}

function loadAmmunitions() {
    const search = $('#ammoSearch').val();
    const caliberId = $('#caliberSelect').val();
    
    $('#ammunitionsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/ammunitions',
        method: 'GET',
        data: { search: search, caliber_id: caliberId || null, limit: 100 },
        success: function(response) {
            ammunitionsData = response.ammunitions;
            renderAmmunitionsGrid();
        }
    });
}

function renderAmmunitionsGrid() {
    const grid = $('#ammunitionsGrid');
    grid.empty();
    
    if (ammunitionsData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma munição encontrada</div>');
        return;
    }
    
    ammunitionsData.forEach(ammo => {
        const card = $('<div class="item-card"></div>');
        card.data('ammo', ammo);
        card.html(`
            <img src="${ammo.img}" alt="${ammo.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
            <div class="item-name" title="${ammo.name}">${ammo.name}</div>
        `);
        card.on('click', function() {
            selectAmmo(ammo);
        });
        grid.append(card);
    });
}

function selectAmmo(ammo) {
    selectedAmmo = ammo;
    $('.item-card').removeClass('selected');
    $('.item-card').filter(function() { return $(this).data('ammo')?.id === ammo.id; }).addClass('selected');
    showSpawnConfirmModal('ammo', ammo);
}

// === ABA DE MAGAZINES ===
let magazinesData = [];
let selectedMagazine = null;

function loadMagazines() {
    const search = $('#magazineSearch').val();
    $('#magazinesGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/magazines',
        method: 'GET',
        data: { search: search, limit: 100 },
        success: function(response) {
            magazinesData = response.magazines;
            renderMagazinesGrid();
        }
    });
}

function renderMagazinesGrid() {
    const grid = $('#magazinesGrid');
    grid.empty();
    
    if (magazinesData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum magazine encontrado</div>');
        return;
    }
    
    magazinesData.forEach(magazine => {
        const card = $('<div class="item-card"></div>');
        card.data('magazine', magazine);
        card.html(`
            <img src="${magazine.img}" alt="${magazine.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
            <div class="item-name" title="${magazine.name}">${magazine.name}</div>
        `);
        card.on('click', function() {
            selectMagazine(magazine);
        });
        grid.append(card);
    });
}

function selectMagazine(magazine) {
    selectedMagazine = magazine;
    $('.item-card').removeClass('selected');
    $('.item-card').filter(function() { return $(this).data('magazine')?.id === magazine.id; }).addClass('selected');
    showSpawnConfirmModal('magazine', magazine);
}

// === ABA DE ATTACHMENTS ===
let attachmentsData = [];
let selectedAttachment = null;
let attachmentTypesData = [];

function loadAttachmentTypes() {
    $.ajax({
        url: '/api/items/attachment-types',
        method: 'GET',
        success: function(response) {
            attachmentTypesData = response.types;
            const options = attachmentTypesData.map(t => 
                `<option value="${t}">${t}</option>`
            ).join('');
            $('#attachmentTypeSelect').html('<option value="">Todos</option>' + options);
            loadAttachments();
        }
    });
}

function loadAttachments() {
    const search = $('#attachmentSearch').val();
    const typeFilter = $('#attachmentTypeSelect').val();
    
    $('#attachmentsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/attachments',
        method: 'GET',
        data: { search: search, type: typeFilter, limit: 100 },
        success: function(response) {
            attachmentsData = response.attachments;
            renderAttachmentsGrid();
        }
    });
}

function renderAttachmentsGrid() {
    const grid = $('#attachmentsGrid');
    grid.empty();
    
    if (attachmentsData.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum attachment encontrado</div>');
        return;
    }
    
    attachmentsData.forEach(attachment => {
        const card = $('<div class="item-card"></div>');
        card.data('attachment', attachment);
        card.html(`
            <img src="${attachment.img}" alt="${attachment.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
            <div class="item-name" title="${attachment.name}">${attachment.name}</div>
        `);
        card.on('click', function() {
            selectAttachment(attachment);
        });
        grid.append(card);
    });
}

function selectAttachment(attachment) {
    selectedAttachment = attachment;
    $('.item-card').removeClass('selected');
    $('.item-card').filter(function() { return $(this).data('attachment')?.id === attachment.id; }).addClass('selected');
    showSpawnConfirmModal('attachment', attachment);
}

// === ATUALIZAÇÃO DO MODAL DE CONFIRMAÇÃO ===
function showSpawnConfirmModal(type, item = null) {
    let playerId, quantity, itemName, itemType;
    
    if (type === 'weapon') {
        playerId = $('#weaponPlayerSelect').val();
        quantity = $('#weaponQuantity').val();
        itemName = selectedWeapon.name;
        itemType = selectedWeapon.name_type;
    } else if (type === 'item') {
        playerId = $('#itemPlayerSelect').val();
        quantity = $('#itemQuantity').val();
        itemName = selectedItem.name;
        itemType = selectedItem.name_type;
    } else if (type === 'explosive') {
        playerId = $('#explosivePlayerSelect').val();
        quantity = $('#explosiveQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'ammo') {
        playerId = $('#ammoPlayerSelect').val();
        quantity = $('#ammoQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'magazine') {
        playerId = $('#magazinePlayerSelect').val();
        quantity = $('#magazineQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'attachment') {
        playerId = $('#attachmentPlayerSelect').val();
        quantity = $('#attachmentQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else {
        return;
    }
    
    if (!playerId) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    const player = playersData.find(p => p.PlayerID === playerId);
    
    $('#confirmItemName').text(itemName);
    $('#confirmPlayerName').text(player.PlayerName);
    $('#confirmQuantity').text(quantity);
    
    // Armazenar dados no botão
    $('#confirmSpawnBtn').data('type', type);
    $('#confirmSpawnBtn').data('playerId', playerId);
    $('#confirmSpawnBtn').data('itemType', itemType);
    $('#confirmSpawnBtn').data('quantity', quantity);
    
    const modal = new bootstrap.Modal(document.getElementById('spawnConfirmModal'));
    modal.show();
}

$(document).ready(function() {
    loadPlayers();
    loadWeapons();
    loadItemTypes();
    loadItems();
    renderVehiclesGrid();
    
    // Event listeners para armas
    $('#weaponSearch').on('input', function() {
        loadWeapons();
    });
    
    // Event listeners para itens
    $('#itemTypeSelect, #itemSearch').on('change input', function() {
        loadItems();
    });
    
    // Event listeners para explosivos
    $('#explosiveSearch').on('input', function() {
        loadExplosives();
    });
    
    // Event listeners para munições
    $('#caliberSelect, #ammoSearch').on('change input', function() {
        loadAmmunitions();
    });
    
    // Event listeners para magazines
    $('#magazineSearch').on('input', function() {
        loadMagazines();
    });
    
    // Event listeners para attachments
    $('#attachmentTypeSelect, #attachmentSearch').on('change input', function() {
        loadAttachments();
    });
    
    // Botão de confirmação
    $('#confirmSpawnBtn').on('click', executeSpawn);
    
    // Carregar dados ao trocar de aba
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        if (target === '#weapons-tab' && weaponsData.length === 0) {
            loadWeapons();
        } else if (target === '#items-tab' && itemsData.length === 0) {
            loadItems();
        } else if (target === '#explosives-tab' && explosivesData.length === 0) {
            loadExplosives();
        } else if (target === '#ammo-tab' && ammunitionsData.length === 0) {
            loadCalibers();
        } else if (target === '#magazines-tab' && magazinesData.length === 0) {
            loadMagazines();
        } else if (target === '#attachments-tab' && attachmentsData.length === 0) {
            loadAttachmentTypes();
        }
    });
});
