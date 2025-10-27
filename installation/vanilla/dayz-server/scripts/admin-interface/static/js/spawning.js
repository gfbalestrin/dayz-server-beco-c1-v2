let playersData = [];
let weaponsData = [];
let itemsData = [];
let selectedWeapon = null;
let selectedItem = null;
let selectedPlayer = null; // Jogador globalmente selecionado

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
    
    $('#globalPlayerSelect').html(
        '<option value="">Selecione um jogador</option>' + options
    );
}

// === ABA DE ARMAS ===

function loadWeapons() {
    $('#weaponsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/manage/weapons',
        method: 'GET',
        success: function(response) {
            weaponsData = response.weapons;
            applyWeaponFilters();
        },
        error: function() {
            $('#weaponsGrid').html('<div class="text-center p-5 text-danger">Erro ao carregar armas</div>');
        }
    });
}

function applyWeaponFilters() {
    const search = $('#weaponSearchInput').val().toLowerCase();
    const feedType = $('#filterFeedType').val();
    const sizeFilter = $('#filterWeaponSize').val();
    const caliberFilter = $('#filterCaliber').val();
    
    let filtered = weaponsData;
    
    // Busca por nome
    if (search) {
        filtered = filtered.filter(w => 
            w.name.toLowerCase().includes(search) || 
            w.name_type.toLowerCase().includes(search)
        );
    }
    
    // Filtro por feed type
    if (feedType) {
        filtered = filtered.filter(w => w.feed_type === feedType);
    }
    
    // Filtro por tamanho
    if (sizeFilter) {
        const totalSlots = (w) => parseInt(w.width) * parseInt(w.height);
        if (sizeFilter === 'small') {
            filtered = filtered.filter(w => totalSlots(w) <= 12);
        } else if (sizeFilter === 'large') {
            filtered = filtered.filter(w => totalSlots(w) > 12);
        }
    }
    
    // Filtro por calibre (case-insensitive)
    if (caliberFilter) {
        filtered = filtered.filter(w => {
            if (!w.calibers) return false;
            const calibers = w.calibers.toLowerCase().split(',').map(c => c.trim());
            return calibers.includes(caliberFilter.toLowerCase());
        });
    }
    
    renderWeaponsGrid(filtered);
}

function renderWeaponsGrid(data = weaponsData) {
    const grid = $('#weaponsGrid');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhuma arma encontrada</div>');
        return;
    }
    
    data.forEach(weapon => {
        const card = $(`
            <div class="weapon-card" data-weapon-id="${weapon.id}" data-weapon-type="${weapon.name_type}">
                <img src="${weapon.img}" alt="${weapon.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                <div class="weapon-name" title="${weapon.name}">${weapon.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            selectWeapon(weapon);
        });
        
        grid.append(card);
    });
}

function selectWeapon(weapon) {
    if (!selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    selectedWeapon = weapon;
    $('.weapon-card').removeClass('selected');
    $(`.weapon-card[data-weapon-id="${weapon.id}"]`).addClass('selected');
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
            $('#filterItemType').html('<option value="">Todos Tipos</option>' + options);
        }
    });
}

function loadItems() {
    $('#itemsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/manage/items',
        method: 'GET',
        success: function(response) {
            itemsData = response.items;
            applyItemFilters();
        },
        error: function() {
            $('#itemsGrid').html('<div class="text-center p-5 text-danger">Erro ao carregar itens</div>');
        }
    });
}

function applyItemFilters() {
    const search = $('#itemSearchInput').val().toLowerCase();
    const typeFilter = $('#filterItemType').val();
    const locationFilter = $('#filterItemLocation').val();
    const storageFilter = $('#filterItemStorage').val();
    
    let filtered = itemsData;
    
    // Busca por nome
    if (search) {
        filtered = filtered.filter(i => 
            i.name.toLowerCase().includes(search) || 
            i.name_type.toLowerCase().includes(search)
        );
    }
    
    // Filtro por tipo
    if (typeFilter) {
        filtered = filtered.filter(i => i.type_id == typeFilter);
    }
    
    // Filtro por localização
    if (locationFilter) {
        if (locationFilter === 'none') {
            filtered = filtered.filter(i => !i.localization || i.localization === '' || i.localization === null);
        } else {
            filtered = filtered.filter(i => i.localization === locationFilter);
        }
    }
    
    // Filtro por storage
    if (storageFilter) {
        if (storageFilter === 'with') {
            filtered = filtered.filter(i => (i.storage_slots || 0) > 0);
        } else if (storageFilter === 'without') {
            filtered = filtered.filter(i => (i.storage_slots || 0) === 0);
        }
    }
    
    renderItemsGrid(filtered);
}

function renderItemsGrid(data = itemsData) {
    const grid = $('#itemsGrid');
    grid.empty();
    
    if (data.length === 0) {
        grid.html('<div class="text-center p-5">Nenhum item encontrado</div>');
        return;
    }
    
    data.forEach(item => {
        const card = $(`
            <div class="weapon-card" data-item-id="${item.id}" data-item-type="${item.name_type}">
                <img src="${item.img}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/100?text=No+Image'">
                <div class="weapon-name" title="${item.name}">${item.name}</div>
            </div>
        `);
        
        card.on('click', function() {
            selectItem(item);
        });
        
        grid.append(card);
    });
}

function selectItem(item) {
    if (!selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    selectedItem = item;
    $('.weapon-card').removeClass('selected');
    $(`.weapon-card[data-item-id="${item.id}"]`).addClass('selected');
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
    if (!selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    const player = selectedPlayer;
    
    if (!confirm(`Spawnar ${vehicle.name} próximo ao jogador ${player.PlayerName}?`)) return;
    
    $.ajax({
        url: '/api/spawn/vehicle',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_id: player.PlayerID,
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
    const search = $('#explosiveSearchInput').val();
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

// Carregar armas para os filtros
function loadWeaponsForFilters() {
    $.ajax({
        url: '/api/items/weapons',
        method: 'GET',
        data: { limit: 200 },
        success: function(response) {
            const options = response.weapons.map(w => 
                `<option value="${w.id}">${w.name}</option>`
            ).join('');
            
            $('#ammoWeaponFilter, #magazineWeaponFilter, #attachmentWeaponFilter').html(
                '<option value="">Todas</option>' + options
            );
        }
    });
}

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
    const search = $('#ammoSearchInput').val();
    const caliberId = $('#caliberSelect').val();
    const weaponId = $('#ammoWeaponFilter').val();
    
    $('#ammunitionsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/ammunitions',
        method: 'GET',
        data: { 
            search: search, 
            caliber_id: caliberId || null, 
            weapon_id: weaponId || null,
            limit: 100 
        },
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
    const search = $('#magazineSearchInput').val();
    const weaponId = $('#magazineWeaponFilter').val();
    
    $('#magazinesGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/magazines',
        method: 'GET',
        data: { 
            search: search, 
            weapon_id: weaponId || null,
            limit: 100 
        },
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
    const search = $('#attachmentSearchInput').val();
    const typeFilter = $('#attachmentTypeSelect').val();
    const weaponId = $('#attachmentWeaponFilter').val();
    
    $('#attachmentsGrid').html('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x"></i></div>');
    
    $.ajax({
        url: '/api/items/attachments',
        method: 'GET',
        data: { 
            search: search, 
            type: typeFilter, 
            weapon_id: weaponId || null,
            limit: 100 
        },
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
    
    // Usar jogador globalmente selecionado
    playerId = selectedPlayer ? selectedPlayer.PlayerID : null;
    
    if (!playerId) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    if (type === 'weapon') {
        quantity = $('#weaponQuantity').val();
        itemName = selectedWeapon.name;
        itemType = selectedWeapon.name_type;
    } else if (type === 'item') {
        quantity = $('#itemQuantity').val();
        itemName = selectedItem.name;
        itemType = selectedItem.name_type;
    } else if (type === 'explosive') {
        quantity = $('#explosiveQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'ammo') {
        quantity = $('#ammoQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'magazine') {
        quantity = $('#magazineQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else if (type === 'attachment') {
        quantity = $('#attachmentQuantity').val();
        itemName = item.name;
        itemType = item.name_type;
    } else {
        return;
    }
    
    const player = selectedPlayer;
    
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

function loadCalibersFilter() {
    $.ajax({
        url: '/api/items/calibers',
        method: 'GET',
        success: function(response) {
            const options = response.calibers.map(c => 
                `<option value="${c.name}">${c.name}</option>`
            ).join('');
            $('#filterCaliber').html('<option value="">Todos Calibres</option>' + options);
        }
    });
}

function loadCompleteWeaponLoadout() {
    if (!selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    
    if (!selectedWeapon) {
        showToast('Aviso', 'Selecione uma arma primeiro!', 'warning');
        return;
    }
    
    // Carregar dados do loadout completo
    $.ajax({
        url: `/api/items/weapon/${selectedWeapon.id}/loadout`,
        method: 'GET',
        success: function(response) {
            // Implementar lógica do modal de loadout
            $('#loadoutWeaponName').text(selectedWeapon.name);
            
            // Popular grids de magazines, ammunitions e attachments
            // ... implementação do loadout completo
        }
    });
}

// Função para obter parâmetro da URL
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

$(document).ready(function() {
    loadPlayers();
    loadWeapons(); // Carregar armas na inicialização
    loadItems(); // Carregar itens na inicialização
    loadCalibersFilter();
    loadWeaponsForFilters();
    loadItemTypes();
    renderVehiclesGrid();
    
    // Auto-seleção de jogador via URL
    setTimeout(function() {
        const playerIdFromUrl = getUrlParameter('player_id');
        if (playerIdFromUrl && playersData.length > 0) {
            $('#globalPlayerSelect').val(playerIdFromUrl).trigger('change');
        }
    }, 500);
    
    // Seletor global de jogador
    $('#globalPlayerSelect').on('change', function() {
        const playerId = $(this).val();
        if (playerId) {
            selectedPlayer = playersData.find(p => p.PlayerID === playerId);
            $('#selectedPlayerInfo').html(`
                <strong>Jogador selecionado:</strong> ${selectedPlayer.PlayerName} (${selectedPlayer.SteamName})
            `);
        } else {
            selectedPlayer = null;
            $('#selectedPlayerInfo').html('<small>Nenhum jogador selecionado</small>');
        }
    });
    
    // Event listeners para armas
    $('#weaponSearchInput').on('input', applyWeaponFilters);
    $('#filterFeedType, #filterWeaponSize, #filterCaliber').on('change', applyWeaponFilters);
    
    // Event listeners para itens
    $('#itemSearchInput').on('input', applyItemFilters);
    $('#filterItemType, #filterItemLocation, #filterItemStorage').on('change', applyItemFilters);
    
    // Event listeners para explosivos
    $('#explosiveSearchInput').on('input', function() {
        loadExplosives();
    });
    
    // Event listeners para munições
    $('#ammoWeaponFilter').on('change', function() {
        loadAmmunitions();
    });
    $('#caliberSelect, #ammoSearchInput').on('change input', function() {
        loadAmmunitions();
    });
    
    // Event listeners para magazines
    $('#magazineWeaponFilter').on('change', function() {
        loadMagazines();
    });
    $('#magazineSearchInput').on('input', function() {
        loadMagazines();
    });
    
    // Event listeners para attachments
    $('#attachmentWeaponFilter').on('change', function() {
        loadAttachments();
    });
    $('#attachmentTypeSelect, #attachmentSearchInput').on('change input', function() {
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
