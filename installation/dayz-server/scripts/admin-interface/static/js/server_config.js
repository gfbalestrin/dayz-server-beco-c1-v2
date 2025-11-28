// ============================================================================
// VARIÁVEIS GLOBAIS
// ============================================================================

let currentConfig = null;
let originalConfig = null;
let currentServerDZConfig = null;
let originalServerDZConfig = null;
let isSuperAdmin = false;
let currentActiveTab = 'serverdz';

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

$(document).ready(function() {
    // Verificar tipo de usuário
    const userType = $('body').data('user-type');
    isSuperAdmin = userType === 'super_admin';
    
    // Inicializar containers de arrays
    initializeArrayContainers();
    
    // Desabilitar campos se não for super admin
    if (!isSuperAdmin) {
        disableAllFields();
    }
    
    // Event listeners
    $('#btnLoadConfig').on('click', function() {
        if (currentActiveTab === 'cfggameplay') {
            loadConfig();
        } else if (currentActiveTab === 'serverdz') {
            loadServerDZConfig();
        }
    });
    
    $('#btnSaveConfig').on('click', function() {
        if (currentActiveTab === 'cfggameplay') {
            saveConfig();
        } else if (currentActiveTab === 'serverdz') {
            saveServerDZConfig();
        }
    });
    
    // Detectar mudança de aba
    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('data-bs-target') || $(e.target).data('bs-target');
        if (target === '#cfggameplay') {
            currentActiveTab = 'cfggameplay';
            if (!currentConfig) {
                loadConfig();
            }
        } else if (target === '#serverdz') {
            currentActiveTab = 'serverdz';
            if (!currentServerDZConfig) {
                loadServerDZConfig();
            }
        }
    });
    
    // Detectar aba inicial ativa
    const activeTab = $('.nav-link.active').attr('data-bs-target') || $('.nav-link.active').data('bs-target');
    if (activeTab === '#serverdz') {
        currentActiveTab = 'serverdz';
    } else if (activeTab === '#cfggameplay') {
        currentActiveTab = 'cfggameplay';
    }
    
    // Carregar configuração automaticamente ao carregar a página
    loadServerDZConfig();
});

// ============================================================================
// INICIALIZAÇÃO DE CONTAINERS DE ARRAYS
// ============================================================================

function initializeArrayContainers() {
    const disabledAttr = isSuperAdmin ? '' : ' disabled';
    
    // Environment Min Temps (12 meses)
    const minTempsContainer = $('#environmentMinTempsContainer');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (let i = 0; i < 12; i++) {
        minTempsContainer.append(`
            <div class="col-md-1 mb-2">
                <label class="form-label small">${months[i]}</label>
                <input type="number" class="form-control form-control-sm environmentMinTemp" data-index="${i}" step="0.1"${disabledAttr}>
            </div>
        `);
    }
    
    // Environment Max Temps (12 meses)
    const maxTempsContainer = $('#environmentMaxTempsContainer');
    for (let i = 0; i < 12; i++) {
        maxTempsContainer.append(`
            <div class="col-md-1 mb-2">
                <label class="form-label small">${months[i]}</label>
                <input type="number" class="form-control form-control-sm environmentMaxTemp" data-index="${i}" step="0.1"${disabledAttr}>
            </div>
        `);
    }
    
    // Wetness Weight Modifiers (5 valores)
    const wetnessContainer = $('#wetnessWeightModifiersContainer');
    const wetnessLabels = ['Nível 1', 'Nível 2', 'Nível 3', 'Nível 4', 'Nível 5'];
    for (let i = 0; i < 5; i++) {
        wetnessContainer.append(`
            <div class="col-md-2 mb-2">
                <label class="form-label small">${wetnessLabels[i]}</label>
                <input type="number" class="form-control form-control-sm wetnessWeightModifier" data-index="${i}" step="0.01" min="0" max="10"${disabledAttr}>
            </div>
        `);
    }
}

// ============================================================================
// CARREGAR CONFIGURAÇÃO
// ============================================================================

function loadConfig() {
    showAlert('info', 'Carregando configurações...');
    $('#btnLoadConfig').prop('disabled', true);
    
    $.ajax({
        url: '/api/server-config/gameplay',
        method: 'GET',
        success: function(data) {
            currentConfig = data;
            originalConfig = JSON.parse(JSON.stringify(data)); // Deep copy
            populateForm(data);
            showAlert('success', 'Configurações carregadas com sucesso!');
            $('#btnLoadConfig').prop('disabled', false);
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.error || 'Erro ao carregar configurações';
            showAlert('danger', `Erro: ${errorMsg}`);
            $('#btnLoadConfig').prop('disabled', false);
        }
    });
}

// ============================================================================
// POPULAR FORMULÁRIO
// ============================================================================

function populateForm(data) {
    // Version
    $('#version').val(data.version || '');
    
    // GeneralData
    if (data.GeneralData) {
        $('#disableBaseDamage').prop('checked', data.GeneralData.disableBaseDamage || false);
        $('#disableContainerDamage').prop('checked', data.GeneralData.disableContainerDamage || false);
        $('#disableRespawnDialog').prop('checked', data.GeneralData.disableRespawnDialog || false);
        $('#disableRespawnInUnconsciousness').prop('checked', data.GeneralData.disableRespawnInUnconsciousness || false);
    }
    
    // PlayerData
    if (data.PlayerData) {
        $('#disablePersonalLight').prop('checked', data.PlayerData.disablePersonalLight || false);
        
        // StaminaData
        if (data.PlayerData.StaminaData) {
            const stamina = data.PlayerData.StaminaData;
            $('#sprintStaminaModifierErc').val(stamina.sprintStaminaModifierErc || '');
            $('#sprintStaminaModifierCro').val(stamina.sprintStaminaModifierCro || '');
            $('#staminaWeightLimitThreshold').val(stamina.staminaWeightLimitThreshold || '');
            $('#staminaMax').val(stamina.staminaMax || '');
            $('#staminaKgToStaminaPercentPenalty').val(stamina.staminaKgToStaminaPercentPenalty || '');
            $('#staminaMinCap').val(stamina.staminaMinCap || '');
            $('#sprintSwimmingStaminaModifier').val(stamina.sprintSwimmingStaminaModifier || '');
            $('#sprintLadderStaminaModifier').val(stamina.sprintLadderStaminaModifier || '');
            $('#meleeStaminaModifier').val(stamina.meleeStaminaModifier || '');
            $('#obstacleTraversalStaminaModifier').val(stamina.obstacleTraversalStaminaModifier || '');
            $('#holdBreathStaminaModifier').val(stamina.holdBreathStaminaModifier || '');
        }
        
        // ShockHandlingData
        if (data.PlayerData.ShockHandlingData) {
            const shock = data.PlayerData.ShockHandlingData;
            $('#shockRefillSpeedConscious').val(shock.shockRefillSpeedConscious || '');
            $('#shockRefillSpeedUnconscious').val(shock.shockRefillSpeedUnconscious || '');
            $('#allowRefillSpeedModifier').prop('checked', shock.allowRefillSpeedModifier || false);
        }
        
        // MovementData
        if (data.PlayerData.MovementData) {
            const movement = data.PlayerData.MovementData;
            $('#timeToStrafeJog').val(movement.timeToStrafeJog || '');
            $('#rotationSpeedJog').val(movement.rotationSpeedJog || '');
            $('#timeToSprint').val(movement.timeToSprint || '');
            $('#timeToStrafeSprint').val(movement.timeToStrafeSprint || '');
            $('#rotationSpeedSprint').val(movement.rotationSpeedSprint || '');
            $('#allowStaminaAffectInertia').prop('checked', movement.allowStaminaAffectInertia || false);
        }
        
        // DrowningData
        if (data.PlayerData.DrowningData) {
            const drowning = data.PlayerData.DrowningData;
            $('#staminaDepletionSpeed').val(drowning.staminaDepletionSpeed || '');
            $('#healthDepletionSpeed').val(drowning.healthDepletionSpeed || '');
            $('#shockDepletionSpeed').val(drowning.shockDepletionSpeed || '');
        }
        
        // WeaponObstructionData
        if (data.PlayerData.WeaponObstructionData) {
            const weapon = data.PlayerData.WeaponObstructionData;
            $('#staticMode').val(weapon.staticMode || '');
            $('#dynamicMode').val(weapon.dynamicMode || '');
        }
    }
    
    // WorldsData
    if (data.WorldsData) {
        $('#lightingConfig').val(data.WorldsData.lightingConfig || '');
        
        // Environment Min Temps
        if (data.WorldsData.environmentMinTemps && Array.isArray(data.WorldsData.environmentMinTemps)) {
            data.WorldsData.environmentMinTemps.forEach((temp, index) => {
                $(`.environmentMinTemp[data-index="${index}"]`).val(temp);
            });
        }
        
        // Environment Max Temps
        if (data.WorldsData.environmentMaxTemps && Array.isArray(data.WorldsData.environmentMaxTemps)) {
            data.WorldsData.environmentMaxTemps.forEach((temp, index) => {
                $(`.environmentMaxTemp[data-index="${index}"]`).val(temp);
            });
        }
        
        // Wetness Weight Modifiers
        if (data.WorldsData.wetnessWeightModifiers && Array.isArray(data.WorldsData.wetnessWeightModifiers)) {
            data.WorldsData.wetnessWeightModifiers.forEach((mod, index) => {
                $(`.wetnessWeightModifier[data-index="${index}"]`).val(mod);
            });
        }
    }
    
    // BaseBuildingData
    if (data.BaseBuildingData) {
        // HologramData
        if (data.BaseBuildingData.HologramData) {
            const hologram = data.BaseBuildingData.HologramData;
            $('#disableIsCollidingBBoxCheck').prop('checked', hologram.disableIsCollidingBBoxCheck || false);
            $('#disableIsCollidingPlayerCheck').prop('checked', hologram.disableIsCollidingPlayerCheck || false);
            $('#disableIsClippingRoofCheck').prop('checked', hologram.disableIsClippingRoofCheck || false);
            $('#disableIsBaseViableCheck').prop('checked', hologram.disableIsBaseViableCheck || false);
            $('#disableIsCollidingGPlotCheck').prop('checked', hologram.disableIsCollidingGPlotCheck || false);
            $('#disableIsCollidingAngleCheck').prop('checked', hologram.disableIsCollidingAngleCheck || false);
            $('#disableIsPlacementPermittedCheck').prop('checked', hologram.disableIsPlacementPermittedCheck || false);
            $('#disableHeightPlacementCheck').prop('checked', hologram.disableHeightPlacementCheck || false);
            $('#disableIsUnderwaterCheck').prop('checked', hologram.disableIsUnderwaterCheck || false);
            $('#disableIsInTerrainCheck').prop('checked', hologram.disableIsInTerrainCheck || false);
            $('#disableColdAreaBuildingCheck').prop('checked', hologram.disableColdAreaBuildingCheck || false);
            
            if (hologram.disallowedTypesInUnderground && Array.isArray(hologram.disallowedTypesInUnderground)) {
                $('#disallowedTypesInUnderground').val(hologram.disallowedTypesInUnderground.join(','));
            }
        }
        
        // ConstructionData
        if (data.BaseBuildingData.ConstructionData) {
            const construction = data.BaseBuildingData.ConstructionData;
            $('#disablePerformRoofCheck').prop('checked', construction.disablePerformRoofCheck || false);
            $('#disableIsCollidingCheck').prop('checked', construction.disableIsCollidingCheck || false);
            $('#disableDistanceCheck').prop('checked', construction.disableDistanceCheck || false);
        }
    }
    
    // UIData
    if (data.UIData) {
        $('#use3DMap').prop('checked', data.UIData.use3DMap || false);
        
        // HitIndicationData
        if (data.UIData.HitIndicationData) {
            const hit = data.UIData.HitIndicationData;
            $('#hitDirectionOverrideEnabled').prop('checked', hit.hitDirectionOverrideEnabled || false);
            $('#hitDirectionBehaviour').val(hit.hitDirectionBehaviour || '');
            $('#hitDirectionStyle').val(hit.hitDirectionStyle || '');
            $('#hitDirectionIndicatorColorStr').val(hit.hitDirectionIndicatorColorStr || '');
            $('#hitDirectionMaxDuration').val(hit.hitDirectionMaxDuration || '');
            $('#hitDirectionBreakPointRelative').val(hit.hitDirectionBreakPointRelative || '');
            $('#hitDirectionScatter').val(hit.hitDirectionScatter || '');
            $('#hitIndicationPostProcessEnabled').prop('checked', hit.hitIndicationPostProcessEnabled || false);
        }
    }
    
    // MapData
    if (data.MapData) {
        $('#ignoreMapOwnership').prop('checked', data.MapData.ignoreMapOwnership || false);
        $('#ignoreNavItemsOwnership').prop('checked', data.MapData.ignoreNavItemsOwnership || false);
        $('#displayPlayerPosition').prop('checked', data.MapData.displayPlayerPosition || false);
        $('#displayNavInfo').prop('checked', data.MapData.displayNavInfo || false);
    }
    
    // VehicleData
    if (data.VehicleData) {
        $('#boatDecayMultiplier').val(data.VehicleData.boatDecayMultiplier || '');
    }
}

// ============================================================================
// COLETAR DADOS DO FORMULÁRIO
// ============================================================================

function collectFormData() {
    const config = {
        version: parseInt($('#version').val()) || 0,
        GeneralData: {
            disableBaseDamage: $('#disableBaseDamage').is(':checked'),
            disableContainerDamage: $('#disableContainerDamage').is(':checked'),
            disableRespawnDialog: $('#disableRespawnDialog').is(':checked'),
            disableRespawnInUnconsciousness: $('#disableRespawnInUnconsciousness').is(':checked')
        },
        PlayerData: {
            disablePersonalLight: $('#disablePersonalLight').is(':checked'),
            StaminaData: {
                sprintStaminaModifierErc: parseFloat($('#sprintStaminaModifierErc').val()) || 0,
                sprintStaminaModifierCro: parseFloat($('#sprintStaminaModifierCro').val()) || 0,
                staminaWeightLimitThreshold: parseFloat($('#staminaWeightLimitThreshold').val()) || 0,
                staminaMax: parseFloat($('#staminaMax').val()) || 0,
                staminaKgToStaminaPercentPenalty: parseFloat($('#staminaKgToStaminaPercentPenalty').val()) || 0,
                staminaMinCap: parseFloat($('#staminaMinCap').val()) || 0,
                sprintSwimmingStaminaModifier: parseFloat($('#sprintSwimmingStaminaModifier').val()) || 0,
                sprintLadderStaminaModifier: parseFloat($('#sprintLadderStaminaModifier').val()) || 0,
                meleeStaminaModifier: parseFloat($('#meleeStaminaModifier').val()) || 0,
                obstacleTraversalStaminaModifier: parseFloat($('#obstacleTraversalStaminaModifier').val()) || 0,
                holdBreathStaminaModifier: parseFloat($('#holdBreathStaminaModifier').val()) || 0
            },
            ShockHandlingData: {
                shockRefillSpeedConscious: parseFloat($('#shockRefillSpeedConscious').val()) || 0,
                shockRefillSpeedUnconscious: parseFloat($('#shockRefillSpeedUnconscious').val()) || 0,
                allowRefillSpeedModifier: $('#allowRefillSpeedModifier').is(':checked')
            },
            MovementData: {
                timeToStrafeJog: parseFloat($('#timeToStrafeJog').val()) || 0,
                rotationSpeedJog: parseFloat($('#rotationSpeedJog').val()) || 0,
                timeToSprint: parseFloat($('#timeToSprint').val()) || 0,
                timeToStrafeSprint: parseFloat($('#timeToStrafeSprint').val()) || 0,
                rotationSpeedSprint: parseFloat($('#rotationSpeedSprint').val()) || 0,
                allowStaminaAffectInertia: $('#allowStaminaAffectInertia').is(':checked')
            },
            DrowningData: {
                staminaDepletionSpeed: parseFloat($('#staminaDepletionSpeed').val()) || 0,
                healthDepletionSpeed: parseFloat($('#healthDepletionSpeed').val()) || 0,
                shockDepletionSpeed: parseFloat($('#shockDepletionSpeed').val()) || 0
            },
            WeaponObstructionData: {
                staticMode: parseInt($('#staticMode').val()) || 0,
                dynamicMode: parseInt($('#dynamicMode').val()) || 0
            }
        },
        WorldsData: {
            lightingConfig: parseInt($('#lightingConfig').val()) || 0,
            objectSpawnersArr: currentConfig?.WorldsData?.objectSpawnersArr || [],
            environmentMinTemps: [],
            environmentMaxTemps: [],
            wetnessWeightModifiers: []
        },
        BaseBuildingData: {
            HologramData: {
                disableIsCollidingBBoxCheck: $('#disableIsCollidingBBoxCheck').is(':checked'),
                disableIsCollidingPlayerCheck: $('#disableIsCollidingPlayerCheck').is(':checked'),
                disableIsClippingRoofCheck: $('#disableIsClippingRoofCheck').is(':checked'),
                disableIsBaseViableCheck: $('#disableIsBaseViableCheck').is(':checked'),
                disableIsCollidingGPlotCheck: $('#disableIsCollidingGPlotCheck').is(':checked'),
                disableIsCollidingAngleCheck: $('#disableIsCollidingAngleCheck').is(':checked'),
                disableIsPlacementPermittedCheck: $('#disableIsPlacementPermittedCheck').is(':checked'),
                disableHeightPlacementCheck: $('#disableHeightPlacementCheck').is(':checked'),
                disableIsUnderwaterCheck: $('#disableIsUnderwaterCheck').is(':checked'),
                disableIsInTerrainCheck: $('#disableIsInTerrainCheck').is(':checked'),
                disableColdAreaBuildingCheck: $('#disableColdAreaBuildingCheck').is(':checked'),
                disallowedTypesInUnderground: $('#disallowedTypesInUnderground').val().split(',').map(s => s.trim()).filter(s => s.length > 0)
            },
            ConstructionData: {
                disablePerformRoofCheck: $('#disablePerformRoofCheck').is(':checked'),
                disableIsCollidingCheck: $('#disableIsCollidingCheck').is(':checked'),
                disableDistanceCheck: $('#disableDistanceCheck').is(':checked')
            }
        },
        UIData: {
            use3DMap: $('#use3DMap').is(':checked'),
            HitIndicationData: {
                hitDirectionOverrideEnabled: $('#hitDirectionOverrideEnabled').is(':checked'),
                hitDirectionBehaviour: parseInt($('#hitDirectionBehaviour').val()) || 0,
                hitDirectionStyle: parseInt($('#hitDirectionStyle').val()) || 0,
                hitDirectionIndicatorColorStr: $('#hitDirectionIndicatorColorStr').val() || '',
                hitDirectionMaxDuration: parseFloat($('#hitDirectionMaxDuration').val()) || 0,
                hitDirectionBreakPointRelative: parseFloat($('#hitDirectionBreakPointRelative').val()) || 0,
                hitDirectionScatter: parseFloat($('#hitDirectionScatter').val()) || 0,
                hitIndicationPostProcessEnabled: $('#hitIndicationPostProcessEnabled').is(':checked')
            }
        },
        MapData: {
            ignoreMapOwnership: $('#ignoreMapOwnership').is(':checked'),
            ignoreNavItemsOwnership: $('#ignoreNavItemsOwnership').is(':checked'),
            displayPlayerPosition: $('#displayPlayerPosition').is(':checked'),
            displayNavInfo: $('#displayNavInfo').is(':checked')
        },
        VehicleData: {
            boatDecayMultiplier: parseFloat($('#boatDecayMultiplier').val()) || 0
        }
    };
    
    // Coletar arrays
    $('.environmentMinTemp').each(function() {
        const index = $(this).data('index');
        const val = parseFloat($(this).val());
        config.WorldsData.environmentMinTemps[index] = isNaN(val) ? 0 : val;
    });
    
    $('.environmentMaxTemp').each(function() {
        const index = $(this).data('index');
        const val = parseFloat($(this).val());
        config.WorldsData.environmentMaxTemps[index] = isNaN(val) ? 0 : val;
    });
    
    $('.wetnessWeightModifier').each(function() {
        const index = $(this).data('index');
        const val = parseFloat($(this).val());
        config.WorldsData.wetnessWeightModifiers[index] = isNaN(val) ? 0 : val;
    });
    
    return config;
}

// ============================================================================
// VALIDAR FORMULÁRIO (CLIENT-SIDE)
// ============================================================================

function validateForm() {
    const errors = [];
    
    // Validações básicas podem ser feitas aqui
    // A validação completa é feita no servidor
    
    return errors;
}

// ============================================================================
// DESABILITAR CAMPOS
// ============================================================================

function disableAllFields() {
    // Desabilitar todos os campos de input e checkbox criados dinamicamente
    $('.environmentMinTemp, .environmentMaxTemp, .wetnessWeightModifier').prop('disabled', true);
}

// ============================================================================
// SALVAR CONFIGURAÇÃO
// ============================================================================

function saveConfig() {
    // Verificar permissões
    if (!isSuperAdmin) {
        showAlert('danger', 'Apenas Super Admin pode salvar configurações.');
        return;
    }
    
    const errors = validateForm();
    if (errors.length > 0) {
        showAlert('warning', 'Erros de validação: ' + errors.join(', '));
        return;
    }
    
    const configData = collectFormData();
    
    if (!confirm('Tem certeza que deseja salvar as configurações? Isso irá modificar o arquivo do servidor.')) {
        return;
    }
    
    showAlert('info', 'Salvando configurações...');
    $('#btnSaveConfig').prop('disabled', true);
    
    $.ajax({
        url: '/api/server-config/gameplay',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(configData),
        success: function(response) {
            showAlert('success', 'Configurações salvas com sucesso!');
            currentConfig = configData;
            originalConfig = JSON.parse(JSON.stringify(configData));
            $('#btnSaveConfig').prop('disabled', false);
        },
        error: function(xhr) {
            let errorMsg = 'Erro ao salvar configurações';
            if (xhr.status === 403) {
                errorMsg = 'Acesso negado. Apenas Super Admin pode salvar configurações.';
            } else if (xhr.responseJSON) {
                if (xhr.responseJSON.details && Array.isArray(xhr.responseJSON.details)) {
                    errorMsg = 'Erros de validação:\n' + xhr.responseJSON.details.join('\n');
                } else {
                    errorMsg = xhr.responseJSON.error || errorMsg;
                }
            }
            showAlert('danger', errorMsg);
            $('#btnSaveConfig').prop('disabled', false);
        }
    });
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function showAlert(type, message) {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    $('#alertContainer').html(alertHtml);
    
    // Auto-dismiss após 5 segundos para sucesso/info
    if (type === 'success' || type === 'info') {
        setTimeout(function() {
            $('#alertContainer .alert').fadeOut(function() {
                $(this).remove();
            });
        }, 5000);
    }
}

// ============================================================================
// FUNÇÕES PARA SERVERDZ.CFG
// ============================================================================

function loadServerDZConfig() {
    showAlert('info', 'Carregando configurações do serverDZ.cfg...');
    $('#btnLoadConfig').prop('disabled', true);
    
    $.ajax({
        url: '/api/server-config/serverdz',
        method: 'GET',
        success: function(data) {
            currentServerDZConfig = data;
            originalServerDZConfig = JSON.parse(JSON.stringify(data));
            populateServerDZForm(data);
            showAlert('success', 'Configurações do serverDZ.cfg carregadas com sucesso!');
            $('#btnLoadConfig').prop('disabled', false);
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.error || 'Erro ao carregar configurações';
            showAlert('danger', `Erro: ${errorMsg}`);
            $('#btnLoadConfig').prop('disabled', false);
        }
    });
}

function populateServerDZForm(data) {
    // Geral
    $('#serverdz_hostname').val(data.hostname || '');
    $('#serverdz_password').val(data.password || '');
    $('#serverdz_passwordAdmin').val(data.passwordAdmin || '');
    $('#serverdz_description').val(data.description || '');
    $('#serverdz_shardId').val(data.shardId || '');
    $('#serverdz_missionTemplate').val(data.missionTemplate || 'dayzOffline.chernarusplus');
    
    // Jogadores
    $('#serverdz_enableWhitelist').prop('checked', data.enableWhitelist == 1 || data.enableWhitelist === true);
    $('#serverdz_maxPlayers').val(data.maxPlayers || '');
    $('#serverdz_verifySignatures').val(data.verifySignatures || '2');
    $('#serverdz_forceSameBuild').prop('checked', data.forceSameBuild == 1 || data.forceSameBuild === true);
    
    // Voz
    $('#serverdz_disableVoN').prop('checked', data.disableVoN == 1 || data.disableVoN === true);
    $('#serverdz_vonCodecQuality').val(data.vonCodecQuality || '');
    
    // Visual
    $('#serverdz_disable3rdPerson').prop('checked', data.disable3rdPerson == 1 || data.disable3rdPerson === true);
    $('#serverdz_disableCrosshair').prop('checked', data.disableCrosshair == 1 || data.disableCrosshair === true);
    $('#serverdz_disablePersonalLight').prop('checked', data.disablePersonalLight == 1 || data.disablePersonalLight === true);
    $('#serverdz_lightingConfig').val(data.lightingConfig || '1');
    
    // Tempo
    $('#serverdz_serverTime').val(data.serverTime || '');
    $('#serverdz_serverTimeAcceleration').val(data.serverTimeAcceleration || '');
    $('#serverdz_serverNightTimeAcceleration').val(data.serverNightTimeAcceleration || '');
    $('#serverdz_serverTimePersistent').prop('checked', data.serverTimePersistent == 1 || data.serverTimePersistent === true);
    
    // Login Queue
    $('#serverdz_loginQueueConcurrentPlayers').val(data.loginQueueConcurrentPlayers || '');
    $('#serverdz_loginQueueMaxPlayers').val(data.loginQueueMaxPlayers || '');
    
    // Sistema
    $('#serverdz_guaranteedUpdates').val(data.guaranteedUpdates || '1');
    $('#serverdz_instanceId').val(data.instanceId || '');
    $('#serverdz_storageAutoFix').prop('checked', data.storageAutoFix == 1 || data.storageAutoFix === true);
    $('#serverdz_BattlEye').prop('checked', data.BattlEye == 1 || data.BattlEye === true);
    $('#serverdz_adminLogBuildActions').prop('checked', data.adminLogBuildActions == 1 || data.adminLogBuildActions === true);
    
    // MOTD
    if (data.motd && Array.isArray(data.motd)) {
        $('#serverdz_motd').val(data.motd.join('\n'));
    } else {
        $('#serverdz_motd').val('');
    }
    $('#serverdz_motdInterval').val(data.motdInterval || '');
}

function collectServerDZFormData() {
    const config = {
        hostname: $('#serverdz_hostname').val() || '',
        password: $('#serverdz_password').val() || '',
        passwordAdmin: $('#serverdz_passwordAdmin').val() || '',
        description: $('#serverdz_description').val() || '',
        enableWhitelist: $('#serverdz_enableWhitelist').is(':checked') ? 1 : 0,
        maxPlayers: parseInt($('#serverdz_maxPlayers').val()) || 60,
        verifySignatures: parseInt($('#serverdz_verifySignatures').val()) || 2,
        forceSameBuild: $('#serverdz_forceSameBuild').is(':checked') ? 1 : 0,
        disableVoN: $('#serverdz_disableVoN').is(':checked') ? 1 : 0,
        vonCodecQuality: parseInt($('#serverdz_vonCodecQuality').val()) || 20,
        shardId: $('#serverdz_shardId').val() || '',
        disable3rdPerson: $('#serverdz_disable3rdPerson').is(':checked') ? 1 : 0,
        disableCrosshair: $('#serverdz_disableCrosshair').is(':checked') ? 1 : 0,
        disablePersonalLight: $('#serverdz_disablePersonalLight').is(':checked') ? 1 : 0,
        lightingConfig: parseInt($('#serverdz_lightingConfig').val()) || 1,
        serverTime: $('#serverdz_serverTime').val() || 'SystemTime',
        serverTimeAcceleration: parseFloat($('#serverdz_serverTimeAcceleration').val()) || 10,
        serverNightTimeAcceleration: parseFloat($('#serverdz_serverNightTimeAcceleration').val()) || 3,
        serverTimePersistent: $('#serverdz_serverTimePersistent').is(':checked') ? 1 : 0,
        guaranteedUpdates: parseInt($('#serverdz_guaranteedUpdates').val()) || 1,
        loginQueueConcurrentPlayers: parseInt($('#serverdz_loginQueueConcurrentPlayers').val()) || 5,
        loginQueueMaxPlayers: parseInt($('#serverdz_loginQueueMaxPlayers').val()) || 500,
        instanceId: parseInt($('#serverdz_instanceId').val()) || 1,
        storageAutoFix: $('#serverdz_storageAutoFix').is(':checked') ? 1 : 0,
        motd: $('#serverdz_motd').val().split('\n').filter(line => line.trim().length > 0),
        motdInterval: parseInt($('#serverdz_motdInterval').val()) || 600,
        BattlEye: $('#serverdz_BattlEye').is(':checked') ? 1 : 0,
        adminLogBuildActions: $('#serverdz_adminLogBuildActions').is(':checked') ? 1 : 0,
        missionTemplate: $('#serverdz_missionTemplate').val() || 'dayzOffline.chernarusplus'
    };
    
    return config;
}

function saveServerDZConfig() {
    // Verificar permissões
    if (!isSuperAdmin) {
        showAlert('danger', 'Apenas Super Admin pode salvar configurações.');
        return;
    }
    
    const configData = collectServerDZFormData();
    
    if (!confirm('Tem certeza que deseja salvar as configurações do serverDZ.cfg? Isso irá modificar o arquivo do servidor.')) {
        return;
    }
    
    showAlert('info', 'Salvando configurações do serverDZ.cfg...');
    $('#btnSaveConfig').prop('disabled', true);
    
    $.ajax({
        url: '/api/server-config/serverdz',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(configData),
        success: function(response) {
            showAlert('success', 'Configurações do serverDZ.cfg salvas com sucesso!');
            currentServerDZConfig = configData;
            originalServerDZConfig = JSON.parse(JSON.stringify(configData));
            $('#btnSaveConfig').prop('disabled', false);
        },
        error: function(xhr) {
            let errorMsg = 'Erro ao salvar configurações';
            if (xhr.status === 403) {
                errorMsg = 'Acesso negado. Apenas Super Admin pode salvar configurações.';
            } else if (xhr.responseJSON) {
                errorMsg = xhr.responseJSON.error || errorMsg;
            }
            showAlert('danger', errorMsg);
            $('#btnSaveConfig').prop('disabled', false);
        }
    });
}

