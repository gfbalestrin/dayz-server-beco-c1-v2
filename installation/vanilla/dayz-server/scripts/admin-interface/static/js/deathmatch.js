/**
 * Visualização de Deathmatch
 * - Desenha SpawnZones (pontos) e WallZones (polígono fechado tracejado)
 * - Desenha Spawns (ex.: Vehicles) quando existirem
 */

let map; // mapa exclusivo desta página (não usar map.js)
let dmSpawnMarkers = [];
let dmWallPolygon = null;
let dmVehicleMarkers = [];

function dmClearLayers() {
  dmSpawnMarkers.forEach(m => map.removeLayer(m));
  dmSpawnMarkers = [];
  if (dmWallPolygon) {
    map.removeLayer(dmWallPolygon);
    dmWallPolygon = null;
  }
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

  // Nome/região
  $('#dmRegionName').text(cfg.region || `Região #${cfg.regionId || '-'}`);

  // SpawnZones -> pontos verdes
  const spawnZones = cfg.spawnZones || [];
  spawnZones.forEach(function(pt) {
    const x = pt[0];
    const z = pt[1];
    const pixel = dmDayzToPixel(x, z);
    const marker = L.circleMarker(pixel, {
      radius: 5,
      fillColor: '#28a745',
      color: '#ffffff',
      weight: 1,
      opacity: 1,
      fillOpacity: 1
    }).addTo(map);
    marker.bindTooltip(`SpawnZone\nX=${x.toFixed(1)} Z=${z.toFixed(1)}`, {
      permanent: false,
      direction: 'top',
      className: 'trail-tooltip'
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
      fill: false
    }).addTo(map);
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
    maxZoom: 3,
    maxBounds: [[0, 0], [4096, 4096]],
    maxBoundsViscosity: 1.0,
    zoom: -2,
    center: [2048, 2048],
    zoomControl: true,
    attributionControl: false
  });

  const imageUrl = $('#map').data('map-image');
  const imageOverlay = L.imageOverlay(imageUrl, [[0, 0], [4096, 4096]], {
    opacity: 1,
    interactive: false
  });
  imageOverlay.addTo(map);
}

function dmLoadMaps() {
  const select = $('#dmRegionSelect');
  $.get('/api/deathmatch/maps')
    .done(function(data) {
      const maps = data.maps || [];
      select.empty();
      maps.forEach(m => {
        const label = `${m.regionId} - ${m.region}${m.active ? ' (ativo)' : ''}`;
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
  dmInitMap();
  dmLoadMaps();
  dmLoad();
  $('#dmRefreshBtn').on('click', dmLoad);
  $('#dmRegionSelect').on('change', dmLoad);
});


