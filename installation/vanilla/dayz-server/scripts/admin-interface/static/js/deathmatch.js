/**
 * Visualização de Deathmatch
 * - Desenha SpawnZones (pontos) e WallZones (polígono fechado tracejado)
 * - Desenha Spawns (ex.: Vehicles) quando existirem
 */

let map; // mapa exclusivo desta página (não usar map.js)
let dmSpawnMarkers = [];
let dmWallPolygon = null;
let dmVehicleMarkers = [];
let dmWallPointMarkers = [];
let dmLastConfig = null;
let dmPickMode = null; // 'spawn-edit' | 'spawn-add' | 'wall-edit' | 'wall-add' | null
let dmSelectedSpawnIndex = null;
let dmSelectedWallIndex = null;
let dmCanvasRenderer = null; // legado (mantido para compat)
let dmRendererPoly = null;
let dmRendererPoints = null;
let dmTeleportCoord = null;
let dmTeleportPlayers = [];
let dmTeleportSelectedPlayerId = localStorage.getItem('dmTeleportSelectedPlayerId') || '';

function createVehicleIcon() {
  return L.divIcon({
    className: 'vehicle-marker',
    html: '<div style="background-color: #28a745; border: 2px solid white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="fas fa-car" style="color: white; font-size: 12px;"></i></div>',
    iconSize: [20, 20]
  });
}

function dmClearLayers() {
  dmSpawnMarkers.forEach(m => map.removeLayer(m));
  dmSpawnMarkers = [];
  if (dmWallPolygon) {
    map.removeLayer(dmWallPolygon);
    dmWallPolygon = null;
  }
  dmWallPointMarkers.forEach(m => map.removeLayer(m));
  dmWallPointMarkers = [];
  dmVehicleMarkers.forEach(m => map.removeLayer(m));
  dmVehicleMarkers = [];
}

function dmDayzToPixel(x, z) {
  // Conversão alinhada com pixelToDayz() inverso em map.js
  // pixel_lat = (z / 15360) * 4096
  // pixel_lng = (x / 15360) * 4096
  const lat = (z / 15360.0) * 4096.0;
  const lng = (x / 15360.0) * 4096.0;
  return [lat, lng];
}

function dmDrawConfig(cfg) {
  dmClearLayers();
  dmLastConfig = cfg;

  // Nome/região
  $('#dmRegionName').text(cfg.region || `Região #${cfg.regionId || '-'}`);
  $('#dmMetaRegion').val(cfg.region || '');
  $('#dmMetaCustomMessage').val(cfg.customMessage || '');

  // SpawnZones -> pontos verdes
  const spawnZones = cfg.spawnZones || [];
  spawnZones.forEach(function(pt, idx) {
    const x = pt[0];
    const y = (pt.length >= 3 ? pt[1] : 0);
    const z = (pt.length >= 3 ? pt[2] : pt[1]);
    const pixel = dmDayzToPixel(x, z);
    const marker = L.circleMarker(pixel, {
      radius: 5,
      fillColor: '#28a745',
      color: '#ffffff',
      weight: 1,
      opacity: 1,
      fillOpacity: 1,
      renderer: dmRendererPoints || dmCanvasRenderer
    }).addTo(map);
    marker.bindTooltip(`SpawnZone\nX=${x.toFixed(1)} Y=${y.toFixed(1)} Z=${z.toFixed(1)}`, {
      permanent: false,
      direction: 'top',
      className: 'trail-tooltip'
    });
    marker.on('click', function(){
      dmOpenEditor('spawn', idx);
    });
    dmSpawnMarkers.push(marker);
  });
  $('#dmSpawnCount').text(spawnZones.length);

  // WallZones -> polígono fechado tracejado
  const wallZones = cfg.wallZones || [];
  if (wallZones.length >= 3) {
    const latlngs = wallZones.map(pt => dmDayzToPixel(pt[0], pt[1]));
    dmWallPolygon = L.polygon(latlngs, {
      color: '#ff8800',
      weight: 2,
      opacity: 0.9,
      dashArray: '6,6',
      fill: false,
      renderer: dmRendererPoly || dmCanvasRenderer
    }).addTo(map);

    // Adicionar marcadores em cada vértice com tooltip de coordenadas
    wallZones.forEach(function(pt, idx) {
      const x = pt[0];
      const z = pt[1];
      const pixel = dmDayzToPixel(x, z);
      const marker = L.circleMarker(pixel, {
        radius: 4,
        fillColor: '#ff8800',
        color: '#ffffff',
        weight: 1,
        opacity: 1,
        fillOpacity: 1,
        renderer: dmRendererPoints || dmCanvasRenderer
      }).addTo(map);
      marker.bindTooltip(`WallZone P${idx + 1}\nX=${x.toFixed(1)} Z=${z.toFixed(1)}`, {
        permanent: false,
        direction: 'top',
        className: 'trail-tooltip'
      });
      marker.on('click', function(){
        dmOpenEditor('wall', idx);
      });
      dmWallPointMarkers.push(marker);
    });
  }
  $('#dmWallCount').text(wallZones.length);

  // Spawns (Vehicles)
  const vehicles = (cfg.spawns && cfg.spawns.vehicles) ? cfg.spawns.vehicles : [];
  vehicles.forEach(function(v) {
    const x = v.coord[0];
    const z = v.coord[1];
    const pixel = dmDayzToPixel(x, z);
    const marker = L.marker(pixel, { icon: createVehicleIcon(), opacity: 1 }).addTo(map);
    marker.bindPopup(
      `<div class="player-popup">`
      + `<strong><i class="fas fa-car me-2"></i>${v.name || 'Veículo'}</strong>`
      + `<div class="info-row"><span class="info-label">Coords:</span>`
      + `<span class="info-value">X: ${x.toFixed(2)}, Z: ${z.toFixed(2)}</span></div>`
      + `</div>`
    );
    dmVehicleMarkers.push(marker);
  });

  // Ajustar bounds para mostrar tudo
  const allLatLngs = [];
  dmSpawnMarkers.forEach(m => allLatLngs.push(m.getLatLng()));
  if (dmWallPolygon) {
    dmWallPolygon.getLatLngs()[0].forEach(ll => allLatLngs.push(ll));
  }
  dmVehicleMarkers.forEach(m => allLatLngs.push(m.getLatLng()));

  if (allLatLngs.length > 0) {
    const bounds = L.latLngBounds(allLatLngs);
    map.fitBounds(bounds.pad(0.05));
  }

  // Ajustar rótulo do botão de exclusão conforme status
  const isInvalid = !(Array.isArray(cfg.spawnZones) && cfg.spawnZones.length >= 1 && Array.isArray(cfg.wallZones) && cfg.wallZones.length >= 3);
  if (cfg.isDeleted) {
    $('#dmToggleDeletedBtn').removeClass('btn-outline-secondary').addClass('btn-outline-success').html('<i class="fas fa-undo me-1"></i>Reverter Exclusão');
  } else {
    $('#dmToggleDeletedBtn').removeClass('btn-outline-success').addClass('btn-outline-secondary').html('<i class="fas fa-ban me-1"></i>Marcar como Excluído');
  }
  // Desabilitar "Tornar Ativo" se excluído ou inválido
  $('#dmSetActiveBtn').prop('disabled', cfg.isDeleted || isInvalid).attr('title', (cfg.isDeleted ? 'Mapa excluído' : (isInvalid ? 'Mapa inválido: adicione pelo menos 1 Spawn e 3 WallZones' : '')));
}

function dmLoad() {
  const regionId = $('#dmRegionSelect').val() || '';
  const url = regionId ? `/api/deathmatch/config?regionId=${encodeURIComponent(regionId)}` : '/api/deathmatch/config';
  $.get(url)
    .done(function(cfg) { dmDrawConfig(cfg); })
    .fail(function(xhr) {
      console.error('Erro ao carregar configuração do Deathmatch');
      const err = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) || 'Erro desconhecido';
      $('#dmRegionName').text(err);
    });
}

function dmInitMap() {
  // Criar mapa simples com mesma base (4096x4096)
  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    maxBounds: [[0, 0], [4096, 4096]],
    maxBoundsViscosity: 1.0,
    zoom: -2,
    center: [2048, 2048],
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true,
    zoomAnimation: false,
    markerZoomAnimation: false,
    fadeAnimation: false,
    inertia: false
  });

  const imageUrl = $('#map').data('map-image');
  const imageOverlay = L.imageOverlay(imageUrl, [[0, 0], [4096, 4096]], {
    opacity: 1,
    interactive: false
  });
  imageOverlay.addTo(map);
  // Panes com z-index controlado
  map.createPane('dm-poly');
  map.getPane('dm-poly').style.zIndex = 401;
  map.createPane('dm-points');
  map.getPane('dm-points').style.zIndex = 402;
  // Renderers por pane
  dmRendererPoly = L.canvas({ padding: 0.2, pane: 'dm-poly' });
  dmRendererPoints = L.canvas({ padding: 0.2, pane: 'dm-points' });
  dmCanvasRenderer = dmRendererPoints;
  if (imageOverlay.bringToBack) imageOverlay.bringToBack();

  map.on('click', function(e) {
    if (!dmPickMode) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const x = (lng / 4096.0) * 15360.0;
    const z = (lat / 4096.0) * 15360.0;
    if (dmPickMode === 'spawn-edit') {
      $('#dmSpawnX').val(x.toFixed(2));
      $('#dmSpawnZ').val(z.toFixed(2));
      $('#dmSpawnEditManualBtn').trigger('click');
    } else if (dmPickMode === 'spawn-add') {
      $('#dmSpawnAddX').val(x.toFixed(2));
      $('#dmSpawnAddZ').val(z.toFixed(2));
      $('#dmSpawnAddManualBtn').trigger('click');
    } else if (dmPickMode === 'wall-edit') {
      $('#dmWallX').val(x.toFixed(2));
      $('#dmWallZ').val(z.toFixed(2));
      $('#dmWallEditManualBtn').trigger('click');
    } else if (dmPickMode === 'wall-add') {
      $('#dmWallAddX').val(x.toFixed(2));
      $('#dmWallAddZ').val(z.toFixed(2));
      $('#dmWallAddManualBtn').trigger('click');
    }
    dmSetPickMode(null);
  });
}

function dmLoadMaps() {
  const select = $('#dmRegionSelect');
  $.get('/api/deathmatch/maps')
    .done(function(data) {
      const maps = data.maps || [];
      select.empty();
      maps.forEach(m => {
        const del = m.isDeleted ? ' (excluído)' : '';
        const label = `${m.regionId} - ${m.region}${m.active ? ' (ativo)' : ''}${del}`;
        const opt = $('<option></option>').val(m.regionId).text(label);
        if (m.active) opt.attr('selected', true);
        select.append(opt);
      });
      // Caso não haja ativo, mantém o primeiro selecionado
    })
    .fail(function() {
      select.html('<option value="">Erro ao carregar mapas</option>');
    });
}

$(document).ready(function() {
  // Garantir que o modal não fique preso em contextos de empilhamento do mapa
  const createModal = document.getElementById('dmCreateMapModal');
  if (createModal && createModal.parentElement !== document.body) {
    document.body.appendChild(createModal);
  }

  dmInitMap();
  dmLoadMaps();
  dmLoad();
  $('#dmRefreshBtn').on('click', dmLoad);
  $('#dmRegionSelect').on('change', dmLoad);
  $('#dmOpenSpawnEditorBtn').on('click', function(){ dmOpenEditor('spawn'); });
  $('#dmOpenWallEditorBtn').on('click', function(){ dmOpenEditor('wall'); });
  $('#dmMetaSaveBtn').on('click', dmSaveMeta);
  $('#dmSetActiveBtn').on('click', dmSetActive);
  $('#dmToggleDeletedBtn').on('click', dmToggleDeleted);
  // Abertura do modal é via data-bs-* no botão
  $('#dmCreateMapBtn').on('click', dmCreateMap);

  // Spawn handlers
  $('#dmSpawnEditPickBtn').on('click', function(){ if (dmEnsureSpawnSelected()) dmSetPickMode('spawn-edit'); });
  $('#dmSpawnEditManualBtn').on('click', dmSpawnEditManual);
  $('#dmSpawnRemoveBtn').on('click', dmSpawnRemove);
  $('#dmSpawnAddPickBtn').on('click', function(){ dmSetPickMode('spawn-add'); });
  $('#dmSpawnAddManualBtn').on('click', dmSpawnAddManual);

  // Wall handlers
  $('#dmWallEditPickBtn').on('click', function(){ if (dmEnsureWallSelected()) dmSetPickMode('wall-edit'); });
  $('#dmWallEditManualBtn').on('click', dmWallEditManual);
  $('#dmWallRemoveBtn').on('click', dmWallRemove);
  $('#dmWallAddPickBtn').on('click', function(){ dmSetPickMode('wall-add'); });
  $('#dmWallAddManualBtn').on('click', dmWallAddManual);

  // Teleporte
  $('#teleport-tab').on('shown.bs.tab', function(){ dmLoadOnlinePlayers(); if (dmTeleportCoord) { $('#dmTpX').val(dmTeleportCoord.x.toFixed(2)); $('#dmTpZ').val(dmTeleportCoord.z.toFixed(2)); } });
  $('#dmTeleportBtn').on('click', dmExecuteTeleport);
  $('#dmTeleportSearch').on('input', function(){ dmRenderTeleportOptions($(this).val().trim().toLowerCase()); });
  $('#dmTeleportPlayerDropdown').on('change', function(){ dmTeleportSelectedPlayerId = $(this).val(); localStorage.setItem('dmTeleportSelectedPlayerId', dmTeleportSelectedPlayerId); });
});

function dmOpenEditor(kind, preselectIdx){
  if (!dmLastConfig) return;
  if (kind === 'spawn') {
    if (typeof preselectIdx === 'number') {
      dmSelectedSpawnIndex = preselectIdx;
      const pt = dmLastConfig.spawnZones?.[preselectIdx];
      if (pt) {
        const x = pt[0];
        const y = (pt.length >= 3 ? pt[1] : 0);
        const z = (pt.length >= 3 ? pt[2] : pt[1]);
        $('#dmSpawnX').val(x.toFixed(2));
        $('#dmSpawnZ').val(z.toFixed(2));
        $('#dmSpawnH').val(y.toFixed(2));
        dmTeleportCoord = { x, z, y };
        $('#dmTpX').val(x.toFixed(2));
        $('#dmTpZ').val(z.toFixed(2));
        $('#dmTpH').val(y.toFixed(2));
      }
    }
  } else if (kind === 'wall') {
    if (typeof preselectIdx === 'number') {
      dmSelectedWallIndex = preselectIdx;
      const pt = dmLastConfig.wallZones?.[preselectIdx];
      if (pt) { $('#dmWallX').val(pt[0].toFixed(2)); $('#dmWallZ').val(pt[1].toFixed(2)); dmTeleportCoord = { x: pt[0], z: pt[1] }; $('#dmTpX').val(pt[0].toFixed(2)); $('#dmTpZ').val(pt[1].toFixed(2)); }
    }
  }
  dmRenderPointsLists();
  const modal = new bootstrap.Modal(document.getElementById('dmEditModal'));
  modal.show();
  if (kind === 'spawn') {
    document.getElementById('spawn-tab').click();
  } else {
    document.getElementById('wall-tab').click();
  }
  // Carregar jogadores online (aba Teleporte)
  dmLoadOnlinePlayers();
}

function dmRenderPointsLists(){
  const spawnList = $('#dmSpawnPointsList').empty();
  const wallList = $('#dmWallPointsList').empty();
  const sp = dmLastConfig?.spawnZones || [];
  const wl = dmLastConfig?.wallZones || [];
  sp.forEach((pt, idx)=>{
    const x = pt[0];
    const y = (pt.length >= 3 ? pt[1] : 0);
    const z = (pt.length >= 3 ? pt[2] : pt[1]);
    const item = $('<button type="button" class="list-group-item list-group-item-action"></button>')
      .text(`#${idx+1}  X=${x.toFixed(2)}  Y=${y.toFixed(2)}  Z=${z.toFixed(2)}`)
      .on('click', function(){ dmSelectedSpawnIndex = idx; $('#dmSpawnX').val(x.toFixed(2)); $('#dmSpawnZ').val(z.toFixed(2)); $('#dmSpawnH').val(y.toFixed(2)); dmTeleportCoord = { x, z, y }; $('#dmTpX').val(x.toFixed(2)); $('#dmTpZ').val(z.toFixed(2)); $('#dmTpH').val(y.toFixed(2)); spawnList.find('.active').removeClass('active'); $(this).addClass('active'); });
    if (idx === dmSelectedSpawnIndex) item.addClass('active');
    spawnList.append(item);
  });
  wl.forEach((pt, idx)=>{
    const x = pt[0], z = pt[1];
    const item = $('<button type="button" class="list-group-item list-group-item-action"></button>')
      .text(`#${idx+1}  X=${x.toFixed(2)}  Z=${z.toFixed(2)}`)
      .on('click', function(){ dmSelectedWallIndex = idx; $('#dmWallX').val(x.toFixed(2)); $('#dmWallZ').val(z.toFixed(2)); dmTeleportCoord = { x, z }; $('#dmTpX').val(x.toFixed(2)); $('#dmTpZ').val(z.toFixed(2)); wallList.find('.active').removeClass('active'); $(this).addClass('active'); });
    if (idx === dmSelectedWallIndex) item.addClass('active');
    wallList.append(item);
  });
}

function dmSetPickMode(mode){
  dmPickMode = mode;
  const c = map.getContainer();
  c.style.cursor = mode ? 'crosshair' : '';
}

function dmCurrentRegionId(){
  return $('#dmRegionSelect').val();
}

// ---- Spawn actions
function dmEnsureSpawnSelected(){
  if (dmSelectedSpawnIndex === null || dmSelectedSpawnIndex === undefined) {
    alert('Selecione um ponto de SpawnZone na lista');
    return false;
  }
  return true;
}

function dmSpawnEditManual(){
  if (!dmEnsureSpawnSelected()) return;
  const x = parseFloat($('#dmSpawnX').val());
  const z = parseFloat($('#dmSpawnZ').val());
  const hRaw = $('#dmSpawnH').val();
  const h = hRaw !== '' ? parseFloat(hRaw) : null;
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'spawn', action: 'update', index: dmSelectedSpawnIndex, coord: { x, z, h } })
  }).done(()=>{ dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

function dmSpawnRemove(){
  if (!dmEnsureSpawnSelected()) return;
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'spawn', action: 'remove', index: dmSelectedSpawnIndex })
  }).done(()=>{ dmSelectedSpawnIndex = null; dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

function dmSpawnAddManual(){
  const x = parseFloat($('#dmSpawnAddX').val());
  const z = parseFloat($('#dmSpawnAddZ').val());
  const hRaw = $('#dmSpawnAddH').val();
  const h = hRaw !== '' ? parseFloat(hRaw) : null;
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'spawn', action: 'add', coord: { x, z, h } })
  }).done(()=>{ $('#dmSpawnAddX').val(''); $('#dmSpawnAddZ').val(''); $('#dmSpawnAddH').val(''); dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

// ---- Wall actions
function dmEnsureWallSelected(){
  if (dmSelectedWallIndex === null || dmSelectedWallIndex === undefined) {
    alert('Selecione um ponto de WallZone na lista');
    return false;
  }
  return true;
}

function dmWallEditManual(){
  if (!dmEnsureWallSelected()) return;
  const x = parseFloat($('#dmWallX').val());
  const z = parseFloat($('#dmWallZ').val());
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'wall', action: 'update', index: dmSelectedWallIndex, coord: { x, z } })
  }).done(()=>{ dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

function dmWallRemove(){
  if (!dmEnsureWallSelected()) return;
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'wall', action: 'remove', index: dmSelectedWallIndex })
  }).done(()=>{ dmSelectedWallIndex = null; dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

function dmWallAddManual(){
  const x = parseFloat($('#dmWallAddX').val());
  const z = parseFloat($('#dmWallAddZ').val());
  $.ajax({
    url: '/api/deathmatch/map/points', method: 'POST', contentType: 'application/json',
    data: JSON.stringify({ regionId: dmCurrentRegionId(), kind: 'wall', action: 'add', coord: { x, z } })
  }).done(()=>{ $('#dmWallAddX').val(''); $('#dmWallAddZ').val(''); dmLoad(); dmRenderPointsLists(); }).fail(dmApiError);
}

// ---- Meta
function dmSaveMeta(){
  const region = $('#dmMetaRegion').val();
  const customMessage = $('#dmMetaCustomMessage').val();
  $.ajax({ url: '/api/deathmatch/map/update-meta', method: 'PATCH', contentType: 'application/json', data: JSON.stringify({ regionId: dmCurrentRegionId(), region, customMessage }) })
    .done(()=>{ dmLoadMaps(); dmLoad(); })
    .fail(dmApiError);
}

function dmSetActive(){
  $.ajax({ url: '/api/deathmatch/map/set-active', method: 'POST', contentType: 'application/json', data: JSON.stringify({ regionId: dmCurrentRegionId() }) })
    .done(()=>{ dmLoadMaps(); })
    .fail(dmApiError);
}

function dmToggleDeleted(){
  // Infere pelo texto do botão
  const isRestore = $('#dmToggleDeletedBtn').text().toLowerCase().includes('reverter');
  const isDeleted = !isRestore;
  $.ajax({ url: '/api/deathmatch/map/set-deleted', method: 'POST', contentType: 'application/json', data: JSON.stringify({ regionId: dmCurrentRegionId(), isDeleted }) })
    .done(()=>{ dmLoadMaps(); dmLoad(); })
    .fail(dmApiError);
}

function dmCreateMap(){
  const region = ($('#dmCreateRegion').val() || '').trim();
  const customMessage = ($('#dmCreateCustomMessage').val() || '').trim();
  $('#dmCreateMapBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i>Criando...');
  $.ajax({ url: '/api/deathmatch/map/create', method: 'POST', contentType: 'application/json', data: JSON.stringify({ region, customMessage }) })
    .done(function(resp){
      const newId = resp.regionId;
      // Fechar modal
      bootstrap.Modal.getInstance(document.getElementById('dmCreateMapModal')).hide();
      // Limpar campos
      $('#dmCreateRegion').val('');
      $('#dmCreateCustomMessage').val('');
      // Recarregar lista e selecionar novo mapa
      dmLoadMaps();
      setTimeout(function(){
        if (newId) {
          $('#dmRegionSelect').val(String(newId));
          dmLoad();
        }
      }, 200);
    })
    .fail(dmApiError)
    .always(function(){ $('#dmCreateMapBtn').prop('disabled', false).html('<i class="fas fa-save me-1"></i>Criar'); });
}

function dmApiError(xhr){
  const err = (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) || 'Erro';
  alert(err);
}

function dmLoadOnlinePlayers(){
  const dd = $('#dmTeleportPlayerDropdown');
  dd.html('<option value="">Carregando jogadores...</option>');
  $.get('/api/players/online/positions')
    .done(function(data){
      dmTeleportPlayers = data.players || [];
      $('#dmTeleportSearch').val('');
      dmRenderTeleportOptions('');
    })
    .fail(function(){ dd.html('<option value="">Erro ao carregar jogadores</option>'); });
}

function dmRenderTeleportOptions(query){
  const dd = $('#dmTeleportPlayerDropdown');
  dd.empty();
  dd.append('<option value="">Selecione um jogador</option>');
  const list = dmTeleportPlayers.filter(p => {
    const name = (p.player_name || '').toLowerCase();
    const steam = (p.steam_name || '').toLowerCase();
    return !query || name.includes(query) || steam.includes(query);
  });
  list.forEach(function(p){
    const opt = $('<option></option>').val(p.player_id).text(`${p.player_name}${p.steam_name ? ' ('+p.steam_name+')' : ''}`);
    dd.append(opt);
  });
  if (dmTeleportSelectedPlayerId) {
    dd.val(dmTeleportSelectedPlayerId);
  }
}

function dmExecuteTeleport(){
  const playerId = $('#dmTeleportPlayerDropdown').val();
  if (!playerId) { alert('Selecione um jogador'); return; }
  if (!dmTeleportCoord) { alert('Coord. inválida'); return; }
  const coord_x = dmTeleportCoord.x;
  const coord_y = dmTeleportCoord.z; // eixo norte-sul (Y)
  const heightVal = $('#dmTpH').val();
  let coord_z;
  if (heightVal !== '') {
    coord_z = parseFloat(heightVal);
  } else if (dmTeleportCoord.y !== undefined && dmTeleportCoord.y !== null) {
    coord_z = dmTeleportCoord.y;
  } else {
    coord_z = 0;
  }
  const payload = { coord_x, coord_y, coord_z };
  $.ajax({ url: `/api/players/${playerId}/teleport`, method: 'POST', contentType: 'application/json', data: JSON.stringify(payload) })
    .done(function(resp){ alert(resp.message || 'Teleportado com sucesso'); })
    .fail(dmApiError);
}


