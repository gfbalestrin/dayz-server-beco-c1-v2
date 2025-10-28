let playersData = [];
let weaponsData = [];
let itemsData = [];
let selectedWeapon = null;
let selectedItem = null;
let selectedPlayer = null; // Jogador globalmente selecionado

// Variáveis para modo de spawn por coordenadas
let spawnMode = 'player'; // 'player' ou 'coords'
let selectedCoords = null; // {x, y, z, pixel: [lat, lng]}
let spawnMap = null; // Instância do Leaflet
let spawnMapPlayerMarkers = {}; // Marcadores de jogadores no mapa de spawn

// Cores para marcadores de jogadores (reutilizado de map.js)
const iconColors = [
    '#ff0000', '#0066ff', '#00cc00', '#ff6600', '#9900ff', '#ff0099',
    '#ffcc00', '#00cccc', '#cc0000', '#0000cc', '#009900'
];

// Lista de veículos comuns
const VEHICLES = [
    { type: 'OffroadHatchback', name: 'Ada 4x4 verde', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/c/cc/Lada-niva.png' },
    { type: 'Sedan_02', name: 'Sarka 120 amarelo', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/6/6f/S120.png' },
    { type: 'CivilianSedan', name: 'Olga 24 cinza', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/3/38/Volga.png' },
    { type: 'CivilianSedan_Black', name: 'Olga 24 preto', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/3/38/Volga.png' },
    { type: 'CivilianSedan_Wine', name: 'Olga 24 vinho', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/3/38/Volga.png' },
    { type: 'Hatchback_02', name: 'Gunter 2 vermelho', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/5/53/Hatchback_02.png' },
    { type: 'Hatchback_02_Black', name: 'Gunter 2 preto', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/5/53/Hatchback_02.png' },
    { type: 'Truck_01_Covered', name: 'Caminhão Coberto Marrom', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/0/0d/M3S_Covered.png' },
    { type: 'Truck_01_Covered_Blue', name: 'Caminhão Coberto Azul', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/0/0d/M3S_Covered.png' },
    { type: 'Truck_01_Covered_Orange', name: 'Caminhão Coberto Laranja', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/0/0d/M3S_Covered.png' },
    { type: 'Offroad_02', name: 'Humvee', image: 'https://static.wikia.nocookie.net/dayz_gamepedia/images/9/93/M1025.png' }
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
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
                <img src="${vehicle.image}" alt="${vehicle.name}" onerror="this.src='https://via.placeholder.com/200x120/6c757d/ffffff?text=Erro+ao+carregar'">
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
        return;
    }
    
    // Confirmar spawn
    let confirmMsg = '';
    if (spawnMode === 'player') {
        confirmMsg = `Spawnar ${vehicle.name} próximo ao jogador ${selectedPlayer.PlayerName}?`;
    } else {
        confirmMsg = `Spawnar ${vehicle.name} nas coordenadas X=${selectedCoords.x.toFixed(1)}, Y=${selectedCoords.y.toFixed(1)}?`;
    }
    
    if (!confirm(confirmMsg)) return;
    
    if (spawnMode === 'player') {
        // Spawn próximo ao jogador
        $.ajax({
            url: '/api/spawn/vehicle',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                player_id: selectedPlayer.PlayerID,
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
    } else {
        // Spawn em coordenadas específicas
        $.ajax({
            url: '/api/spawn/vehicle-at-coords',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                vehicle_type: vehicle.type,
                coord_x: selectedCoords.x,
                coord_y: selectedCoords.y
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
}

// === MODAL DE CONFIRMAÇÃO ===

function executeSpawn() {
    const type = $('#confirmSpawnBtn').data('type');
    const mode = $('#confirmSpawnBtn').data('mode');
    const playerId = $('#confirmSpawnBtn').data('playerId');
    const itemType = $('#confirmSpawnBtn').data('itemType');
    const quantity = $('#confirmSpawnBtn').data('quantity');
    const coordX = $('#confirmSpawnBtn').data('coordX');
    const coordY = $('#confirmSpawnBtn').data('coordY');
    const coordZ = $('#confirmSpawnBtn').data('coordZ');
    
    $('#confirmSpawnBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Spawnando...');
    
    let url, data;
    
    if (mode === 'player') {
        // Spawn próximo ao jogador
        url = '/api/spawn/item';
        data = {
            player_id: playerId,
            item_type: itemType,
            quantity: quantity
        };
    } else {
        // Spawn em coordenadas específicas
        url = '/api/spawn/item-at-coords';
        data = {
            item_type: itemType,
            quantity: quantity,
            coord_x: coordX,
            coord_y: coordY
        };
    }
    
    $.ajax({
        url: url,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data),
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
            if (mode === 'coords') {
                selectedCoords = null;
                $('#coordsDisplay').hide().text('');
                $('#openMapText').text('Abrir Mapa e Selecionar Coordenadas');
            }
            $('.item-card').removeClass('selected');
            $('.weapon-card').removeClass('selected');
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
        return;
    }
    
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
        return;
    }
    
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
        return;
    }
    
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
    // Validar baseado no modo
    if (spawnMode === 'player' && !selectedPlayer) {
        showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
        return;
    }
    if (spawnMode === 'coords' && !selectedCoords) {
        showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
        return;
    }
    
    selectedAttachment = attachment;
    $('.item-card').removeClass('selected');
    $('.item-card').filter(function() { return $(this).data('attachment')?.id === attachment.id; }).addClass('selected');
    showSpawnConfirmModal('attachment', attachment);
}

// === ATUALIZAÇÃO DO MODAL DE CONFIRMAÇÃO ===
function showSpawnConfirmModal(type, item = null) {
    let playerId, quantity, itemName, itemType;
    
    // Validar baseado no modo
    if (spawnMode === 'player') {
        playerId = selectedPlayer ? selectedPlayer.PlayerID : null;
        if (!playerId) {
            showToast('Aviso', 'Selecione um jogador primeiro!', 'warning');
            return;
        }
    } else if (spawnMode === 'coords') {
        if (!selectedCoords) {
            showToast('Aviso', 'Selecione as coordenadas no mapa primeiro!', 'warning');
            return;
        }
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
    
    // Atualizar modal de confirmação baseado no modo
    $('#confirmItemName').text(itemName);
    $('#confirmQuantity').text(quantity);
    
    if (spawnMode === 'player') {
        const player = selectedPlayer;
        $('#confirmPlayerSection').show();
        $('#confirmCoordsSection').hide();
        $('#confirmCoordsDetail').hide();
        $('#confirmPlayerName').text(player.PlayerName);
    } else {
        $('#confirmPlayerSection').hide();
        $('#confirmCoordsSection').show();
        $('#confirmCoordsDetail').show();
        $('#confirmCoords').text(`X: ${selectedCoords.x.toFixed(1)}, Y: ${selectedCoords.y.toFixed(1)}, Z: ${selectedCoords.z.toFixed(1)}`);
        $('#confirmCoordsDetail').html(`
            <strong>Detalhes:</strong><br>
            X: ${selectedCoords.x.toFixed(2)}<br>
            Y: ${selectedCoords.y.toFixed(2)}<br>
            Z: ${selectedCoords.z.toFixed(2)}
        `);
    }
    
    // Armazenar dados no botão
    $('#confirmSpawnBtn').data('type', type);
    $('#confirmSpawnBtn').data('mode', spawnMode);
    $('#confirmSpawnBtn').data('playerId', playerId);
    $('#confirmSpawnBtn').data('itemType', itemType);
    $('#confirmSpawnBtn').data('quantity', quantity);
    if (selectedCoords) {
        $('#confirmSpawnBtn').data('coordX', selectedCoords.x);
        $('#confirmSpawnBtn').data('coordY', selectedCoords.y);
        $('#confirmSpawnBtn').data('coordZ', selectedCoords.z);
    }
    
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

// === FUNÇÕES DE MODO DE SPAWN POR COORDENADAS ===

/**
 * Gerar cor única para um jogador
 */
function getPlayerColor(playerId) {
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
        hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return iconColors[Math.abs(hash) % iconColors.length];
}

/**
 * Criar ícone de marcador de jogador
 */
function createPlayerMarkerIcon(color) {
    return L.divIcon({
        className: 'player-marker',
        html: `<div style="background-color: ${color}; border: 2px solid white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                 <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
               </div>`,
        iconSize: [24, 24]
    });
}

/**
 * Carregar jogadores online no mapa de spawn
 */
function loadOnlinePlayersInSpawnMap() {
    if (!spawnMap) return;
    
    $.get('/api/players/online/positions')
        .done(function(data) {
            // Limpar marcadores antigos
            clearPlayerMarkersFromSpawnMap();
            
            // Adicionar marcador para cada jogador
            data.players.forEach(function(player) {
                const color = getPlayerColor(player.player_id);
                const lat = player.pixel_coords[0];
                const lng = player.pixel_coords[1];
                
                const marker = L.marker([lat, lng], {
                    icon: createPlayerMarkerIcon(color),
                    opacity: 1.0,
                    zIndexOffset: 1000 // Garantir que fique acima da imagem
                }).addTo(spawnMap);
                
                // Tooltip com informações
                const tooltipContent = `
                    <strong>👤 ${player.player_name}${player.steam_name ? ` (${player.steam_name})` : ''}</strong><br>
                    🟢 <span class="value">Online</span><br>
                    📍 Coords: <span class="value">X=${player.coord_x.toFixed(1)}, Y=${player.coord_y.toFixed(1)}</span>
                `;
                
                // Direção dinâmica do tooltip baseada na posição
                let tooltipDirection = 'top';
                if (lat > 3000) tooltipDirection = 'bottom';
                if (lng < 2000) tooltipDirection = 'right';
                else if (lng > 13000) tooltipDirection = 'left';
                
                marker.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: tooltipDirection,
                    className: 'trail-tooltip'
                });
                
                spawnMapPlayerMarkers[player.player_id] = marker;
            });
            
            console.log(`Carregados ${data.players.length} jogadores online no mapa de spawn`);
        })
        .fail(function() {
            console.error('Erro ao carregar jogadores online no mapa de spawn');
        });
}

/**
 * Limpar marcadores de jogadores do mapa de spawn
 */
function clearPlayerMarkersFromSpawnMap() {
    Object.keys(spawnMapPlayerMarkers).forEach(function(key) {
        spawnMap.removeLayer(spawnMapPlayerMarkers[key]);
    });
    spawnMapPlayerMarkers = {};
}

/**
 * Alternar entre modo de spawn por jogador ou por coordenadas
 */
function switchSpawnMode(mode) {
    spawnMode = mode;
    
    if (mode === 'player') {
        // Mostrar seletor de jogador, esconder seletor de coordenadas
        $('#playerSelectCard').show();
        $('#coordsSelectCard').hide();
        $('#openMapBtn').hide();
        selectedCoords = null;
        
        // Limpar coordenadas selecionadas
        $('#coordsDisplay').hide().text('');
        $('#openMapText').text('Abrir Mapa e Selecionar Coordenadas');
    } else if (mode === 'coords') {
        // Esconder seletor de jogador, mostrar seletor de coordenadas
        $('#playerSelectCard').hide();
        $('#coordsSelectCard').show();
        $('#openMapBtn').show();
        selectedPlayer = null;
        
        // Reset seletor de jogador
        $('#globalPlayerSelect').val('');
    }
}

/**
 * Inicializar mapa Leaflet no modal
 */
function initSpawnMap() {
    if (spawnMap) {
        return; // Mapa já inicializado
    }
    
    // Criar mapa
    spawnMap = L.map('spawnMap', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 3,
        maxBounds: [[0, 0], [4096, 4096]],
        maxBoundsViscosity: 1.0,
        zoom: -2,
        center: [2048, 2048],
        zoomControl: true,
        attributionControl: false
    });
    
    // Obter URL da imagem do mapa
    const imageUrl = $('#spawnMap').data('map-image');
    
    if (!imageUrl) {
        console.error('URL da imagem do mapa não encontrada!');
        return;
    }
    
    // Adicionar overlay da imagem
    L.imageOverlay(imageUrl, [[0, 0], [4096, 4096]], {
        opacity: 1,
        interactive: false
    }).addTo(spawnMap);
    
    // Adicionar evento de clique no mapa
    spawnMap.on('click', function(e) {
        handleMapClick(e);
    });
    
    // Carregar jogadores online no mapa
    loadOnlinePlayersInSpawnMap();
    
    console.log('Mapa de spawn inicializado');
}

/**
 * Converter coordenadas pixel para DayZ
 */
function pixelToDayz(pixelCoords) {
    // Inverso da conversão dayz_to_pixel
    // pixel_x = (coord_x / 15360.0) * 4096
    // pixel_y = (coord_y / 15360.0) * 4096
    const x = (pixelCoords[1] / 4096) * 15360.0;
    const y = (pixelCoords[0] / 4096) * 15360.0;
    return { x: x, y: y };
}

/**
 * Handler para clique no mapa de spawn
 */
function handleMapClick(e) {
    if (spawnMode !== 'coords') {
        return;
    }
    
    // Converter pixel para coordenadas DayZ
    const pixelCoords = [e.latlng.lat, e.latlng.lng];
    const dayzCoords = pixelToDayz(pixelCoords);
    
    // Salvar coordenadas
    selectedCoords = {
        x: dayzCoords.x,
        y: dayzCoords.y,
        z: 0, // Será calculado pelo servidor
        pixel: pixelCoords
    };
    
    // Atualizar UI
    $('#coordsDisplay').text(`X: ${dayzCoords.x.toFixed(1)}, Y: ${dayzCoords.y.toFixed(1)}`).show();
    $('#openMapText').text('Coordenadas Selecionadas:');
    
    // Fechar modal do mapa
    bootstrap.Modal.getInstance(document.getElementById('spawnMapModal')).hide();
    
    console.log('Coordenadas selecionadas:', selectedCoords);
}

/**
 * Abrir modal do mapa
 */
function openMapModal() {
    if (spawnMode !== 'coords') {
        showToast('Aviso', 'Modo de coordenadas não está ativo', 'warning');
        return;
    }
    
    // Inicializar mapa se necessário
    initSpawnMap();
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('spawnMapModal'));
    modal.show();
    
    // Atualizar tamanho do mapa e recarregar jogadores
    setTimeout(function() {
        if (spawnMap) {
            spawnMap.invalidateSize();
            loadOnlinePlayersInSpawnMap(); // Recarregar posições atualizadas
        }
    }, 500);
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
    
    // Event listeners para modo de spawn
    $('input[name="spawnMode"]').on('change', function() {
        const mode = $(this).val();
        switchSpawnMode(mode);
    });
    
    // Event listener para abrir mapa
    $('#openMapBtn').on('click', openMapModal);
    
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
