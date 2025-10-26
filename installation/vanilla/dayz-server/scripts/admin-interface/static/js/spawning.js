let playersData = [];
let itemsData = [];
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
    
    $('#playerSelect, #vehiclePlayerSelect').html(
        '<option value="">Selecione um jogador</option>' + options
    );
}

function loadItemTypes() {
    $.ajax({
        url: '/api/items/types',
        method: 'GET',
        success: function(response) {
            const options = response.types.map(t => 
                `<option value="${t.id}">${t.name}</option>`
            ).join('');
            $('#itemTypeSelect').append(options);
        }
    });
}

function loadItems() {
    const typeId = $('#itemTypeSelect').val();
    const search = $('#itemSearch').val();
    
    // Carregar armas
    $.ajax({
        url: '/api/items/weapons',
        method: 'GET',
        data: { search: search },
        success: function(response) {
            const weapons = response.weapons.map(w => ({
                ...w,
                category: 'weapon'
            }));
            
            // Carregar itens
            $.ajax({
                url: '/api/items/items',
                method: 'GET',
                data: { type_id: typeId, search: search },
                success: function(response) {
                    itemsData = [...weapons, ...response.items];
                    renderItemsGrid();
                }
            });
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
    showSpawnConfirmModal();
}

function showSpawnConfirmModal() {
    const playerId = $('#playerSelect').val();
    if (!playerId) {
        alert('Selecione um jogador primeiro!');
        return;
    }
    
    const player = playersData.find(p => p.PlayerID === playerId);
    const quantity = $('#itemQuantity').val();
    
    $('#confirmItemName').text(selectedItem.name);
    $('#confirmPlayerName').text(player.PlayerName);
    $('#confirmQuantity').text(quantity);
    
    const modal = new bootstrap.Modal(document.getElementById('spawnConfirmModal'));
    modal.show();
}

function spawnItem() {
    const playerId = $('#playerSelect').val();
    const quantity = $('#itemQuantity').val();
    
    $('#confirmSpawnBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Spawnando...');
    
    $.ajax({
        url: '/api/spawn/item',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            player_id: playerId,
            item_type: selectedItem.name_type,
            quantity: quantity
        }),
        success: function(response) {
            bootstrap.Modal.getInstance(document.getElementById('spawnConfirmModal')).hide();
            showToast('Sucesso', response.message, 'success');
        },
        error: function(xhr) {
            const error = xhr.responseJSON || {};
            showToast('Erro', error.message || 'Erro ao spawnar item', 'error');
        },
        complete: function() {
            $('#confirmSpawnBtn').prop('disabled', false).html('<i class="fas fa-magic me-1"></i>Spawnar');
        }
    });
}

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
        alert('Selecione um jogador primeiro!');
        return;
    }
    
    if (!confirm(`Spawnar ${vehicle.name} próximo ao jogador?`)) return;
    
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

$(document).ready(function() {
    loadPlayers();
    loadItemTypes();
    loadItems();
    renderVehiclesGrid();
    
    $('#itemTypeSelect, #itemSearch').on('change keyup', function() {
        loadItems();
    });
    
    $('#confirmSpawnBtn').on('click', spawnItem);
});

