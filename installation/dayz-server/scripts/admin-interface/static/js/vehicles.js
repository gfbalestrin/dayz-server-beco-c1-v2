$(document).ready(function() {
    let vehiclesTable;
    let currentVehicleId = null;
    let autoRefreshInterval = null;
    let listVehicleRefreshStatus = {};
    let listVehicleRefreshRequests = {};
    const QUICK_FILTERS = {
        last10m: { minutes: 10 },
        last1h: { minutes: 60 },
        last4h: { minutes: 240 },
        last24h: { minutes: 1440 },
        today: { type: 'day', offsetDays: 0 },
        yesterday: { type: 'day', offsetDays: -1 },
        last7d: { days: 7 }
    };
    let activeQuickFilter = 'last1h';
    
    // Estado de paginação do histórico
    let historyState = {
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        perPage: 10,
        dateFrom: null,
        dateTo: null
    };
    
    // Função para atualizar contador de veículos
    function updateVehiclesCount(recordsTotal, recordsFiltered) {
        const total = parseInt(recordsTotal) || 0;
        const filtered = parseInt(recordsFiltered) || 0;
        
        let countText = '';
        if (filtered > 0 || total > 0) {
            // Se há filtros aplicados e são diferentes, mostrar ambos
            if (filtered !== total && total > 0 && filtered > 0) {
                countText = filtered.toLocaleString('pt-BR') + ' de ' + total.toLocaleString('pt-BR');
            } else if (filtered > 0) {
                countText = filtered.toLocaleString('pt-BR');
            } else if (total > 0) {
                countText = total.toLocaleString('pt-BR');
            }
            countText += ' veículo' + ((filtered || total) !== 1 ? 's' : '');
        } else {
            countText = 'Nenhum veículo';
        }
        
        $('#vehiclesCount').text(countText);
    }
    
    // Inicializar DataTable
    function initDataTable() {
        vehiclesTable = $('#vehiclesTable').DataTable({
            processing: true,
            serverSide: true,
            ajax: {
                url: '/api/vehicles/data',
                type: 'GET',
                data: function(d) {
                    d.status_filter = $('#statusFilter').val();
                    const selectedChangeTypes = [];
                    $('.change-type-checkbox:checked').each(function() {
                        selectedChangeTypes.push($(this).val());
                    });
                    d.change_types = selectedChangeTypes;
                    const dateRange = getCurrentDateRange();
                    d.datetime_from = dateRange.from;
                    d.datetime_to = dateRange.to;
                    if (d.search && d.search.value) {
                        d.search = d.search.value;
                    } else {
                        d.search = null;
                    }
                },
                dataSrc: function(json) {
                    // Atualizar contador quando receber resposta
                    if (json && json.recordsTotal !== undefined) {
                        updateVehiclesCount(json.recordsTotal, json.recordsFiltered);
                    }
                    return json.data;
                }
            },
            columns: [
                {
                    data: 'VehicleId',
                    render: function(data) {
                        return '<code>' + escapeHtml(data) + '</code>';
                    }
                },
                {
                    data: 'VehicleName',
                    render: function(data) {
                        return escapeHtml(data || 'N/A');
                    }
                },
                {
                    data: 'IsDestroyed',
                    orderable: false,
                    render: function(data) {
                        if (data == 1 || data === true) {
                            return '<span class="badge bg-danger">Destruído</span>';
                        } else {
                            return '<span class="badge bg-success">Ativo</span>';
                        }
                    }
                },
                {
                    data: 'ChangeCount',
                    orderable: true, // Ordenável - ordenação feita em memória no backend
                    render: function(data, type, row) {
                        return renderChangeBadges(row.ChangeFlags);
                    }
                },
                {
                    data: null,
                    orderable: false, // Não ordenável - coluna composta
                    render: function(data) {
                        const vehicleId = encodeURIComponent(data.VehicleId || '');
                        const mapUrl = `/map?vehicle_id=${vehicleId}`;
                        return `<a class="btn btn-link p-0" href="${mapUrl}" title="Abrir veículo no mapa">` +
                            `<i class="fas fa-map-marker-alt me-1"></i>Ver no mapa</a>`;
                    }
                },
                {
                    data: null,
                    orderable: false, // Não ordenável - coluna composta
                    render: function(data) {
                        let healthHtml = '';
                        
                        if (data.EngineHealth !== null && data.EngineHealth !== undefined) {
                            const engineHealth = parseFloat(data.EngineHealth || 0) * 100;
                            healthHtml += '<div class="mb-1"><small>Motor:</small> ' + 
                                renderHealthBar(engineHealth) + '</div>';
                        }
                        
                        if (data.BodyHealth !== null && data.BodyHealth !== undefined) {
                            const bodyHealth = parseFloat(data.BodyHealth || 0) * 100;
                            healthHtml += '<div class="mb-1"><small>Carroceria:</small> ' + 
                                renderHealthBar(bodyHealth) + '</div>';
                        }
                        
                        if (data.FuelTankHealth !== null && data.FuelTankHealth !== undefined) {
                            const fuelHealth = parseFloat(data.FuelTankHealth || 0) * 100;
                            healthHtml += '<div><small>Tanque:</small> ' + 
                                renderHealthBar(fuelHealth) + '</div>';
                        }
                        
                        return healthHtml || '<span class="text-muted">N/A</span>';
                    }
                },
                {
                    data: 'TimeStamp',
                    render: function(data) {
                        if (!data) return 'N/A';
                        const date = new Date(data);
                        return date.toLocaleString('pt-BR');
                    }
                },
                {
                    data: 'VehicleId',
                    orderable: false,
                    render: function(data) {
                        const vehicleId = escapeHtml(data);
                        const safeId = vehicleId;
                        return '' +
                            '<div class="btn-group" role="group">' +
                                '<button class="btn btn-sm btn-secondary me-1 list-refresh-vehicle-btn" ' +
                                    'id="vehicleListRefreshBtn_' + safeId + '" ' +
                                    'data-vehicle-id="' + vehicleId + '">' +
                                    '<i class="fas fa-sync-alt me-1"></i>Atualizar' +
                                '</button>' +
                                '<button class="btn btn-sm btn-primary view-history-btn" data-vehicle-id="' + vehicleId + '">' +
                                    '<i class="fas fa-history me-1"></i>Ver Histórico' +
                                '</button>' +
                            '</div>';
                    }
                }
            ],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            // Ordenar por Última Atualização (coluna 6) e,
            // secundariamente, pela quantidade de tipos de alterações (coluna 3)
            order: [[6, 'desc'], [3, 'desc']],
            pageLength: 50,
            responsive: true,
            searchDelay: 500,
            createdRow: function(row, data, dataIndex) {
                // Adicionar classe CSS para destacar veículos com muitas alterações
                const changeCount = parseInt(data.ChangeCount || 0);
                if (changeCount >= 6) {
                    $(row).addClass('vehicle-high-changes');
                } else if (changeCount >= 3) {
                    $(row).addClass('vehicle-medium-changes');
                }
            },
            drawCallback: function(settings) {
                // Atualizar contador de veículos (fallback caso dataSrc não tenha atualizado)
                try {
                    const api = this.api();
                    const pageInfo = api.page.info();
                    updateVehiclesCount(pageInfo.recordsTotal, pageInfo.recordsFiltered);
                } catch (e) {
                    console.error('Erro ao atualizar contador de veículos:', e);
                }
            }
        });
    }
    
    // Renderizar barra de saúde
    function renderHealthBar(health) {
        const healthValue = Math.max(0, Math.min(100, parseFloat(health || 0)));
        let colorClass = 'bg-success';
        if (healthValue < 30) {
            colorClass = 'bg-danger';
        } else if (healthValue < 70) {
            colorClass = 'bg-warning';
        }
        
        return '<div class="progress" style="height: 20px; width: 100px;">' +
            '<div class="progress-bar ' + colorClass + '" role="progressbar" ' +
            'style="width: ' + healthValue + '%" aria-valuenow="' + healthValue + '" ' +
            'aria-valuemin="0" aria-valuemax="100">' +
            healthValue.toFixed(0) + '%</div></div>';
    }
    
    function renderChangeBadges(changeFlags) {
        const flags = changeFlags || {};
        const badgeConfig = [
            { key: 'position', label: 'Coordenadas', classes: 'bg-info text-dark', icon: 'fa-location-arrow' },
            { key: 'health', label: 'Saúde', classes: 'bg-danger', icon: 'fa-heartbeat' },
            { key: 'items', label: 'Items', classes: 'bg-primary', icon: 'fa-boxes' },
            { key: 'attachments', label: 'Attachments', classes: 'bg-warning text-dark', icon: 'fa-tools' }
        ];
        const badges = [];
        
        badgeConfig.forEach(function(config) {
            if (flags[config.key]) {
                badges.push(
                    `<span class="badge ${config.classes} me-1 mb-1" title="${config.label}">` +
                    `<i class="fas ${config.icon} me-1"></i>${config.label}</span>`
                );
            }
        });
        
        if (badges.length === 0) {
            return '<span class="badge bg-secondary">Sem alterações</span>';
        }
        
        return badges.join('');
    }
    
    // ==== Funções de atualização completa de veículo (checkvehicle) ====
    
    function generateVehicleRefreshRequestId() {
        return 'veh_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function setListVehicleRefreshState(vehicleId, isRefreshing) {
        if (!listVehicleRefreshStatus) {
            listVehicleRefreshStatus = {};
        }
        
        if (isRefreshing) {
            listVehicleRefreshStatus[vehicleId] = true;
        } else {
            delete listVehicleRefreshStatus[vehicleId];
        }
        
        const button = document.getElementById(`vehicleListRefreshBtn_${vehicleId}`);
        if (button) {
            if (isRefreshing) {
                button.disabled = true;
                button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando...';
            } else {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Atualizar';
            }
        }
    }
    
    function saveVehicleCheckToDatabaseFromList(vehicleId, commandData) {
        if (!commandData || commandData.status !== 'success') {
            return;
        }
        
        const saveData = {
            vehicle_name: commandData.vehicle_name || 'Veículo',
            position: commandData.position || {},
            items: commandData.items || [],
            attachments: commandData.attachments || [],
            health_parts: commandData.health_parts || {}
        };
        
        $.ajax({
            url: `/api/vehicles/${vehicleId}/save-check`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(saveData),
            success: function() {
                // Após salvar no banco, recarregar a tabela (sem resetar página)
                reloadTable(false);
            },
            error: function(xhr) {
                const error = xhr.responseJSON || {};
                const errorMsg = error.message || error.error || 'Erro ao salvar dados do veículo no banco';
                if (typeof showToast === 'function') {
                    showToast('Erro', errorMsg, 'error');
                } else {
                    console.warn(errorMsg);
                }
            }
        });
    }
    
    function startListVehicleRefreshPolling(requestId, vehicleId, attempt) {
        const MAX_ATTEMPTS = 30;
        const POLL_INTERVAL = 2000;
        
        if (!listVehicleRefreshRequests || listVehicleRefreshRequests[vehicleId] !== requestId) {
            return;
        }
        
        if (attempt >= MAX_ATTEMPTS) {
            if (typeof showToast === 'function') {
                showToast('Aviso', 'Tempo limite ao atualizar dados do veículo.', 'warning');
            }
            setListVehicleRefreshState(vehicleId, false);
            delete listVehicleRefreshRequests[vehicleId];
            return;
        }
        
        $.get(`/api/commands/results/${requestId}`)
            .done(function(response) {
                if (!listVehicleRefreshRequests || listVehicleRefreshRequests[vehicleId] !== requestId) {
                    return;
                }
                
                if (response.status === 'ready') {
                    const data = response.data || {};
                    if (data.status === 'success') {
                        saveVehicleCheckToDatabaseFromList(vehicleId, data);
                        if (typeof showToast === 'function') {
                            const vehicleName = data.vehicle_name || vehicleId;
                            showToast('Sucesso', `Dados do veículo ${vehicleName} atualizados.`, 'success');
                        }
                    } else {
                        const errorMsg = data.message || 'Não foi possível atualizar os dados do veículo.';
                        if (typeof showToast === 'function') {
                            showToast('Aviso', errorMsg, 'warning');
                        }
                    }
                    
                    setListVehicleRefreshState(vehicleId, false);
                    delete listVehicleRefreshRequests[vehicleId];
                } else if (response.status === 'not_found' || response.status === 'processing') {
                    setTimeout(function() {
                        startListVehicleRefreshPolling(requestId, vehicleId, attempt + 1);
                    }, POLL_INTERVAL);
                } else {
                    const errorMsg = response.message || 'Erro ao consultar resultado do comando.';
                    if (typeof showToast === 'function') {
                        showToast('Erro', errorMsg, 'error');
                    }
                    setListVehicleRefreshState(vehicleId, false);
                    delete listVehicleRefreshRequests[vehicleId];
                }
            })
            .fail(function(xhr) {
                if (!listVehicleRefreshRequests || listVehicleRefreshRequests[vehicleId] !== requestId) {
                    return;
                }
                
                if (attempt < 5) {
                    setTimeout(function() {
                        startListVehicleRefreshPolling(requestId, vehicleId, attempt + 1);
                    }, POLL_INTERVAL);
                } else {
                    const error = xhr.responseJSON || {};
                    const errorMsg = error.message || error.error || 'Erro ao consultar resultado da atualização do veículo.';
                    if (typeof showToast === 'function') {
                        showToast('Erro', errorMsg, 'error');
                    }
                    setListVehicleRefreshState(vehicleId, false);
                    delete listVehicleRefreshRequests[vehicleId];
                }
            });
    }
    
    function refreshVehicleFromList(vehicleId) {
        if (!vehicleId) {
            return;
        }
        
        if (listVehicleRefreshStatus && listVehicleRefreshStatus[vehicleId]) {
            if (typeof showToast === 'function') {
                showToast('Info', 'Atualização já está em andamento para este veículo.', 'info');
            }
            return;
        }
        
        const requestId = generateVehicleRefreshRequestId();
        if (!listVehicleRefreshRequests) {
            listVehicleRefreshRequests = {};
        }
        listVehicleRefreshRequests[vehicleId] = requestId;
        
        setListVehicleRefreshState(vehicleId, true);
        
        $.ajax({
            url: `/api/vehicles/${encodeURIComponent(vehicleId)}/refresh`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                request_id: requestId
            }),
            success: function() {
                if (typeof showToast === 'function') {
                    showToast('Info', `Solicitação de atualização enviada para ${vehicleId}.`, 'info');
                }
                startListVehicleRefreshPolling(requestId, vehicleId, 0);
            },
            error: function(xhr) {
                const error = xhr.responseJSON || {};
                const errorMsg = error.message || error.error || 'Erro ao solicitar atualização do veículo';
                if (typeof showToast === 'function') {
                    showToast('Erro', errorMsg, 'error');
                }
                setListVehicleRefreshState(vehicleId, false);
                delete listVehicleRefreshRequests[vehicleId];
            }
        });
    }
    
    let suppressDateInputListeners = false;
    
    function padZero(value) {
        return String(value).padStart(2, '0');
    }
    
    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    }
    
    function formatDateForInput(date) {
        return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
    }
    
    function formatTimeForInput(date) {
        return `${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
    }
    
    function formatDateTimeForServer(date) {
        if (!date) {
            return null;
        }
        return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
    }
    
    function setCustomDateInputs(fromDate, toDate) {
        suppressDateInputListeners = true;
        if (fromDate) {
            $('#customDateFrom').val(formatDateForInput(fromDate));
            $('#customTimeFrom').val(formatTimeForInput(fromDate));
        } else {
            $('#customDateFrom').val('');
            $('#customTimeFrom').val('');
        }
        
        if (toDate) {
            $('#customDateTo').val(formatDateForInput(toDate));
            $('#customTimeTo').val(formatTimeForInput(toDate));
        } else {
            $('#customDateTo').val('');
            $('#customTimeTo').val('');
        }
        suppressDateInputListeners = false;
    }
    
    function clearCustomDateInputs() {
        suppressDateInputListeners = true;
        $('#customDateFrom, #customDateTo').val('');
        $('#customTimeFrom, #customTimeTo').val('');
        suppressDateInputListeners = false;
    }
    
    function computeQuickRange(filterKey) {
        if (!filterKey || !QUICK_FILTERS[filterKey]) {
            return null;
        }
        
        const config = QUICK_FILTERS[filterKey];
        const now = new Date();
        let end = new Date(now);
        let start = null;
        
        if (config.minutes) {
            start = new Date(end.getTime() - config.minutes * 60 * 1000);
        } else if (config.days) {
            start = new Date(end.getTime() - config.days * 24 * 60 * 60 * 1000);
        } else if (config.type === 'day') {
            const todayStart = startOfDay(now);
            if (config.offsetDays === 0) {
                start = todayStart;
                end = new Date(now);
            } else if (config.offsetDays === -1) {
                const endOfYesterday = new Date(todayStart.getTime() - 1000);
                end = endOfYesterday;
                start = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            } else {
                const targetStart = new Date(todayStart.getTime() + config.offsetDays * 24 * 60 * 60 * 1000);
                start = targetStart;
                end = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000 - 1000);
            }
        }
        
        if (!start) {
            start = new Date(now);
        }
        
        return { from: start, to: end, config: config };
    }
    
    function getInputDateTime(dateValue, timeValue) {
        if (!dateValue && !timeValue) {
            return null;
        }
        
        if (!dateValue || !timeValue) {
            return null;
        }
        
        let timeString = timeValue;
        if (timeString.length === 5) {
            timeString = `${timeString}:00`;
        }
        
        return `${dateValue} ${timeString}`;
    }
    
    function getCurrentDateRange() {
        if (activeQuickFilter) {
            const range = computeQuickRange(activeQuickFilter);
            if (range) {
                const cfg = range.config || QUICK_FILTERS[activeQuickFilter] || {};
                const fromServer = formatDateTimeForServer(range.from);
                // Para filtros relativos (minutes/days), só usamos o início e deixamos fim em branco
                if (cfg.minutes || cfg.days) {
                    return {
                        from: fromServer,
                        to: null
                    };
                }
                return {
                    from: fromServer,
                    to: formatDateTimeForServer(range.to)
                };
            }
        }
        
        const customFrom = getInputDateTime($('#customDateFrom').val(), $('#customTimeFrom').val());
        const customTo = getInputDateTime($('#customDateTo').val(), $('#customTimeTo').val());
        
        return {
            from: customFrom,
            to: customTo
        };
    }
    
    function updateQuickShortcutButtons() {
        $('.vehicle-quick-filter').removeClass('active');
        if (activeQuickFilter) {
            $(`.vehicle-quick-filter[data-filter="${activeQuickFilter}"]`).addClass('active');
        }
    }
    
    // Escapar HTML
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    // Função para recarregar tabela
    function reloadTable(resetPage = true) {
        if (vehiclesTable) {
            if (activeQuickFilter) {
                const range = computeQuickRange(activeQuickFilter);
                if (range) {
                    const cfg = range.config || QUICK_FILTERS[activeQuickFilter] || {};
                    if (cfg.minutes || cfg.days) {
                        setCustomDateInputs(range.from, null);
                    } else {
                        setCustomDateInputs(range.from, range.to);
                    }
                }
            }
            if (resetPage) {
                vehiclesTable.page('first');
            }
            vehiclesTable.ajax.reload(null, false);
        }
    }
    
    function applyQuickFilter(filterKey) {
        if (filterKey === 'clear') {
            activeQuickFilter = null;
            updateQuickShortcutButtons();
            clearCustomDateInputs();
            reloadTable();
            return;
        }
        
        activeQuickFilter = filterKey;
        updateQuickShortcutButtons();
        const range = computeQuickRange(filterKey);
        if (range) {
            const cfg = range.config || QUICK_FILTERS[filterKey] || {};
            if (cfg.minutes || cfg.days) {
                setCustomDateInputs(range.from, null);
            } else {
                setCustomDateInputs(range.from, range.to);
            }
        }
        reloadTable();
    }
    
    function handleCustomDateChange() {
        if (suppressDateInputListeners) {
            return;
        }
        activeQuickFilter = null;
        updateQuickShortcutButtons();
    }
    
    // Event listeners para filtros
    $('#statusFilter').on('change', function() {
        reloadTable();
    });
    
    $('.change-type-checkbox').on('change', function() {
        reloadTable();
    });
    
    $('.vehicle-quick-filter').on('click', function() {
        const filterKey = $(this).data('filter');
        applyQuickFilter(filterKey);
    });
    
    $('#applyCustomDateFilter').on('click', function() {
        activeQuickFilter = null;
        updateQuickShortcutButtons();
        reloadTable();
    });
    
    $('#clearCustomDateFilter').on('click', function() {
        activeQuickFilter = null;
        updateQuickShortcutButtons();
        clearCustomDateInputs();
        reloadTable();
    });
    
    $('#customDateFrom, #customTimeFrom, #customDateTo, #customTimeTo').on('input', handleCustomDateChange);
    
    $('#clearFilters').on('click', function() {
        $('#statusFilter').val('active');
        $('.change-type-checkbox').prop('checked', false);
        activeQuickFilter = null;
        updateQuickShortcutButtons();
        clearCustomDateInputs();
        reloadTable();
    });
    
    // Função para gerenciar auto refresh
    function setupAutoRefresh() {
        // Limpar intervalo anterior
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
        
        // Verificar se auto refresh está habilitado
        if ($('#autoRefreshEnabled').is(':checked')) {
            const intervalSeconds = parseInt($('#autoRefreshInterval').val()) || 30;
            const intervalMs = Math.max(5000, intervalSeconds * 1000); // Mínimo 5 segundos
            
            autoRefreshInterval = setInterval(function() {
                reloadTable(false);
            }, intervalMs);
        }
    }
    
    // Event listeners para auto refresh
    $('#autoRefreshEnabled').on('change', function() {
        setupAutoRefresh();
    });
    
    $('#autoRefreshInterval').on('change', function() {
        setupAutoRefresh();
    });
    
    // Inicializar auto refresh
    setupAutoRefresh();
    
    // Abrir histórico automaticamente se vehicle_id vier na URL
    (function initVehicleFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const vehicleIdFromUrl = urlParams.get('vehicle_id');
            if (vehicleIdFromUrl) {
                // Esperar DataTable inicializar antes de abrir o histórico
                const checkReadyInterval = setInterval(function() {
                    if (vehiclesTable) {
                        clearInterval(checkReadyInterval);
                        showVehicleHistory(vehicleIdFromUrl);
                    }
                }, 200);
                // Segurança: limpar intervalo após 10s
                setTimeout(function() {
                    clearInterval(checkReadyInterval);
                }, 10000);
            }
        } catch (e) {
            console.warn('Erro ao processar vehicle_id da URL:', e);
        }
    })();
    
    // Event listener para botão de histórico (usando delegação)
    $(document).on('click', '.view-history-btn', function() {
        const vehicleId = $(this).data('vehicle-id');
        showVehicleHistory(vehicleId);
    });
    
    // Event listener para botão de atualização completa (checkvehicle) na lista
    $(document).on('click', '.list-refresh-vehicle-btn', function() {
        const vehicleId = $(this).data('vehicle-id');
        refreshVehicleFromList(vehicleId);
    });
    
    // Mostrar histórico do veículo
    function showVehicleHistory(vehicleId) {
        currentVehicleId = vehicleId;
        
        // Resetar estado de paginação
        historyState.currentPage = 1;
        historyState.totalPages = 1;
        historyState.totalRecords = 0;
        // Filtro padrão: histórico do dia atual (equivalente a \"Hoje\")
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        historyState.dateFrom = todayStr;
        historyState.dateTo = null;
        
        // Aplicar filtros padrão nos campos de data
        $('#historyDateFrom').val(todayStr);
        $('#historyDateTo').val('');
        
        const modal = new bootstrap.Modal(document.getElementById('historyModal'));
        modal.show();
        
        // Carregar primeira página
        loadHistoryPage(1);
    }
    
    // Carregar página do histórico
    function loadHistoryPage(page) {
        if (!currentVehicleId) {
            return;
        }
        
        $('#historyLoading').show();
        $('#historyContent').hide();
        $('#historyModalLabel').html('<i class="fas fa-history me-2"></i>Histórico: ' + escapeHtml(currentVehicleId));
        
        // Construir URL com parâmetros
        const params = new URLSearchParams();
        params.append('page', page);
        params.append('per_page', historyState.perPage);
        
        if (historyState.dateFrom) {
            params.append('date_from', historyState.dateFrom);
        }
        if (historyState.dateTo) {
            params.append('date_to', historyState.dateTo);
        }
        
        $.ajax({
            url: '/api/vehicles/' + encodeURIComponent(currentVehicleId) + '/history?' + params.toString(),
            type: 'GET',
            success: function(response) {
                if (response.success && response.history) {
                    // Atualizar estado de paginação
                    if (response.pagination) {
                        historyState.currentPage = response.pagination.current_page;
                        historyState.totalPages = response.pagination.total_pages;
                        historyState.totalRecords = response.pagination.total_records;
                    }
                    
                    renderHistoryTimeline(response.history);
                    updateHistoryPaginationControls();
                    $('#historyLoading').hide();
                    $('#historyContent').show();
                } else {
                    $('#historyLoading').html('<p class="text-danger">Erro ao carregar histórico</p>');
                }
            },
            error: function(xhr, status, error) {
                $('#historyLoading').html('<p class="text-danger">Erro ao carregar histórico: ' + error + '</p>');
            }
        });
    }
    
    // Atualizar controles de paginação
    function updateHistoryPaginationControls() {
        const prevBtn = $('#historyPrevPage');
        const nextBtn = $('#historyNextPage');
        const pageInfo = $('#historyPageInfo');
        const totalRecords = $('#historyTotalRecords');
        
        // Atualizar informações de página
        pageInfo.text(`Página ${historyState.currentPage} de ${historyState.totalPages}`);
        totalRecords.text(`(${historyState.totalRecords.toLocaleString('pt-BR')} registro${historyState.totalRecords !== 1 ? 's' : ''})`);
        
        // Habilitar/desabilitar botões
        prevBtn.prop('disabled', historyState.currentPage <= 1);
        nextBtn.prop('disabled', historyState.currentPage >= historyState.totalPages);
    }
    
    // Navegar para página anterior
    function prevHistoryPage() {
        if (historyState.currentPage > 1) {
            loadHistoryPage(historyState.currentPage - 1);
        }
    }
    
    // Navegar para próxima página
    function nextHistoryPage() {
        if (historyState.currentPage < historyState.totalPages) {
            loadHistoryPage(historyState.currentPage + 1);
        }
    }
    
    // Aplicar filtros de data
    function applyHistoryDateFilters() {
        historyState.dateFrom = $('#historyDateFrom').val() || null;
        historyState.dateTo = $('#historyDateTo').val() || null;
        
        // Resetar para primeira página ao aplicar filtros
        historyState.currentPage = 1;
        loadHistoryPage(1);
    }
    
    // Limpar filtros de data
    function clearHistoryDateFilters() {
        $('#historyDateFrom').val('');
        $('#historyDateTo').val('');
        historyState.dateFrom = null;
        historyState.dateTo = null;
        
        // Resetar para primeira página
        historyState.currentPage = 1;
        loadHistoryPage(1);
    }
    
    // Event listeners para paginação e filtros do histórico
    $('#historyPrevPage').on('click', function() {
        prevHistoryPage();
    });
    
    $('#historyNextPage').on('click', function() {
        nextHistoryPage();
    });
    
    // Aplicar filtros quando as datas mudarem
    $('#historyDateFrom, #historyDateTo').on('change', function() {
        applyHistoryDateFilters();
    });
    
    // Limpar filtros
    $('#clearHistoryFilters').on('click', function() {
        clearHistoryDateFilters();
    });
    
    // Renderizar badges de tipos de mudança
    function renderChangeTypeBadges(changeTypes) {
        if (!changeTypes) {
            return '';
        }
        
        const badges = [];
        const badgeConfig = {
            position: { label: 'Coordenadas', classes: 'bg-info text-dark', icon: 'fa-location-arrow' },
            health: { label: 'Saúde', classes: 'bg-danger', icon: 'fa-heartbeat' },
            status: { label: 'Status', classes: 'bg-secondary', icon: 'fa-exclamation-triangle' },
            items: { label: 'Items', classes: 'bg-primary', icon: 'fa-boxes' },
            attachments: { label: 'Attachments', classes: 'bg-warning text-dark', icon: 'fa-tools' }
        };
        
        Object.keys(badgeConfig).forEach(function(key) {
            if (changeTypes[key]) {
                const config = badgeConfig[key];
                badges.push(
                    `<span class="badge ${config.classes} me-1 mb-1">` +
                    `<i class="fas ${config.icon} me-1"></i>${config.label}</span>`
                );
            }
        });
        
        return badges.length > 0 ? '<div class="mt-2">' + badges.join('') + '</div>' : '';
    }
    
    // Renderizar timeline do histórico
    function renderHistoryTimeline(history) {
        const timeline = $('#historyTimeline');
        timeline.empty();
        
        if (history.length === 0) {
            timeline.html('<p class="text-muted">Nenhum registro de histórico encontrado.</p>');
            return;
        }
        
        // NOTA: O histórico já vem filtrado do backend (apenas registros com mudanças significativas)
        // Não é necessário filtrar novamente no frontend
        
        // Renderizar os registros do histórico
        // O histórico vem em ordem DESC: [mais recente, ..., mais antigo]
        // Cada registro deve ser comparado com o PRÓXIMO na lista (mais antigo)
        // para mostrar as mudanças que aconteceram neste momento específico
        
        history.forEach(function(record, index) {
            // Obter o próximo registro na lista (mais antigo)
            const nextRecord = index < history.length - 1 ? history[index + 1] : null;
            
            // Comparar este registro com o próximo (mais antigo) para detectar mudanças
            // Se há próximo registro, comparar para ver o que mudou DESSE registro PARA o próximo
            const hasChanges = nextRecord && hasSignificantChanges(record, nextRecord);
            const changeClass = hasChanges ? 'border-warning bg-light' : '';
            
            // Obter tipos específicos de mudança
            const changeTypes = nextRecord ? getChangeTypes(record, nextRecord) : null;
            const changeBadgesHtml = changeTypes ? renderChangeTypeBadges(changeTypes) : '';
            
            const recordHtml = `
                <div class="timeline-item mb-4 ${changeClass}" data-timestamp="${record.TimeStamp}">
                    <div class="d-flex">
                        <div class="timeline-marker me-3">
                            <div class="timeline-dot ${record.IsDestroyed == 1 ? 'bg-danger' : 'bg-primary'}"></div>
                            ${index < history.length - 1 ? '<div class="timeline-line"></div>' : ''}
                        </div>
                        <div class="flex-grow-1">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h6 class="mb-0">
                                        <i class="fas fa-clock me-2"></i>
                                        ${formatDateTime(record.TimeStamp)}
                                        ${record.IsPartialUpdate == 1 ? 
                                            '<span class="badge bg-info ms-2" title="Update parcial (apenas posição e health_parts)">Parcial</span>' : 
                                            ''}
                                    </h6>
                                    ${record.IsDestroyed == 1 ? 
                                        '<span class="badge bg-danger">Destruído</span>' : 
                                        '<span class="badge bg-success">Ativo</span>'}
                                </div>
                                <div class="card-body">
                                    ${hasChanges ? 
                                        '<div class="alert alert-info mb-3">' +
                                        '<i class="fas fa-info-circle me-2"></i><strong>Mudanças detectadas neste momento</strong>' +
                                        changeBadgesHtml +
                                        '</div>' : 
                                        ''}
                                    <div class="row">
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-map-marker-alt me-2"></i>Posição</h6>
                                            ${renderPositionWithChanges(record, nextRecord)}
                                        </div>
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-heartbeat me-2"></i>Saúde</h6>
                                            ${renderHealthSectionWithChanges(record, nextRecord)}
                                        </div>
                                    </div>
                                    <div class="row mt-3">
                                        <div class="col-12">
                                            <h6><i class="fas fa-box me-2"></i>Items e Attachments</h6>
                                            ${renderItemsAndAttachmentsWithChanges(record, nextRecord, history, index)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            timeline.append(recordHtml);
        });
    }
    
    // Verificar se há mudanças significativas
    function hasSignificantChanges(prev, curr) {
        const posThreshold = 0.001; // Threshold reduzido para detectar mudanças menores
        const healthThreshold = 0.05; // 5% em formato decimal (valores vêm como 0.0 a 1.0)
        
        // Verificar se algum registro é parcial
        const prevIsPartial = (prev.IsPartialUpdate || 0) === 1;
        const currIsPartial = (curr.IsPartialUpdate || 0) === 1;
        
        // Verificar mudança de status (destruído/ativo)
        const statusChanged = (prev.IsDestroyed || 0) !== (curr.IsDestroyed || 0);
        
        // Verificar mudança de posição
        const posChanged = Math.abs((prev.PositionX || 0) - (curr.PositionX || 0)) > posThreshold ||
                          Math.abs((prev.PositionY || 0) - (curr.PositionY || 0)) > posThreshold ||
                          Math.abs((prev.PositionZ || 0) - (curr.PositionZ || 0)) > posThreshold;
        
        // Verificar mudança de saúde
        const healthChanged = (prev.EngineHealth !== null && curr.EngineHealth !== null &&
                              Math.abs(prev.EngineHealth - curr.EngineHealth) > healthThreshold) ||
                             (prev.BodyHealth !== null && curr.BodyHealth !== null &&
                              Math.abs(prev.BodyHealth - curr.BodyHealth) > healthThreshold) ||
                             (prev.FuelTankHealth !== null && curr.FuelTankHealth !== null &&
                              Math.abs(prev.FuelTankHealth - curr.FuelTankHealth) > healthThreshold) ||
                             (prev.EngineHealth === null && curr.EngineHealth !== null) ||
                             (prev.EngineHealth !== null && curr.EngineHealth === null) ||
                             (prev.BodyHealth === null && curr.BodyHealth !== null) ||
                             (prev.BodyHealth !== null && curr.BodyHealth === null) ||
                             (prev.FuelTankHealth === null && curr.FuelTankHealth !== null) ||
                             (prev.FuelTankHealth !== null && curr.FuelTankHealth === null);
        
        // Verificar mudança em items (apenas se ambos forem completos)
        let itemsChanged = false;
        if (!prevIsPartial && !currIsPartial) {
            itemsChanged = itemsListChanged(prev.items || [], curr.items || []);
        }
        
        // Verificar mudança em attachments (apenas se ambos forem completos)
        let attachmentsChanged = false;
        if (!prevIsPartial && !currIsPartial) {
            attachmentsChanged = attachmentsListChanged(prev.attachments || [], curr.attachments || []);
        }
        
        return statusChanged || posChanged || healthChanged || itemsChanged || attachmentsChanged;
    }
    
    // Identificar tipos específicos de mudança entre dois registros
    function getChangeTypes(prev, curr) {
        const posThreshold = 0.001;
        const healthThreshold = 0.05;
        
        const prevIsPartial = (prev.IsPartialUpdate || 0) === 1;
        const currIsPartial = (curr.IsPartialUpdate || 0) === 1;
        
        const changes = {
            position: false,
            health: false,
            status: false,
            items: false,
            attachments: false
        };
        
        // Mudança de status
        if ((prev.IsDestroyed || 0) !== (curr.IsDestroyed || 0)) {
            changes.status = true;
            changes.health = true; // Status mudou também conta como mudança de saúde
        }
        
        // Mudança de posição
        if (Math.abs((prev.PositionX || 0) - (curr.PositionX || 0)) > posThreshold ||
            Math.abs((prev.PositionY || 0) - (curr.PositionY || 0)) > posThreshold ||
            Math.abs((prev.PositionZ || 0) - (curr.PositionZ || 0)) > posThreshold) {
            changes.position = true;
        }
        
        // Mudança de saúde
        if ((prev.EngineHealth !== null && curr.EngineHealth !== null &&
             Math.abs(prev.EngineHealth - curr.EngineHealth) > healthThreshold) ||
            (prev.BodyHealth !== null && curr.BodyHealth !== null &&
             Math.abs(prev.BodyHealth - curr.BodyHealth) > healthThreshold) ||
            (prev.FuelTankHealth !== null && curr.FuelTankHealth !== null &&
             Math.abs(prev.FuelTankHealth - curr.FuelTankHealth) > healthThreshold) ||
            (prev.EngineHealth === null && curr.EngineHealth !== null) ||
            (prev.EngineHealth !== null && curr.EngineHealth === null) ||
            (prev.BodyHealth === null && curr.BodyHealth !== null) ||
            (prev.BodyHealth !== null && curr.BodyHealth === null) ||
            (prev.FuelTankHealth === null && curr.FuelTankHealth !== null) ||
            (prev.FuelTankHealth !== null && curr.FuelTankHealth === null)) {
            changes.health = true;
        }
        
        // Mudança em items (apenas se ambos forem completos)
        if (!prevIsPartial && !currIsPartial) {
            if (itemsListChanged(prev.items || [], curr.items || [])) {
                changes.items = true;
            }
        }
        
        // Mudança em attachments (apenas se ambos forem completos)
        if (!prevIsPartial && !currIsPartial) {
            if (attachmentsListChanged(prev.attachments || [], curr.attachments || [])) {
                changes.attachments = true;
            }
        }
        
        return changes;
    }
    
    // Comparar listas de items (apenas tipos e quantidades, ignorando ordem)
    function itemsListChanged(prevItems, currItems) {
        // Criar contadores por tipo (ignorando ordem e outros detalhes)
        const prevCount = {};
        prevItems.forEach(function(item) {
            const key = item.ItemType || '';
            prevCount[key] = (prevCount[key] || 0) + 1;
        });
        
        const currCount = {};
        currItems.forEach(function(item) {
            const key = item.ItemType || '';
            currCount[key] = (currCount[key] || 0) + 1;
        });
        
        // Comparar tipos presentes
        const prevTypes = Object.keys(prevCount).sort();
        const currTypes = Object.keys(currCount).sort();
        
        if (prevTypes.length !== currTypes.length) {
            return true;
        }
        
        // Comparar quantidades de cada tipo
        for (let i = 0; i < prevTypes.length; i++) {
            const type = prevTypes[i];
            if (prevCount[type] !== currCount[type]) {
                return true;
            }
        }
        
        return false;
    }
    
    // Comparar listas de attachments (apenas tipos e quantidades, ignorando ordem)
    function attachmentsListChanged(prevAttachments, currAttachments) {
        // Criar contadores por tipo (ignorando ordem e outros detalhes)
        const prevCount = {};
        prevAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            prevCount[key] = (prevCount[key] || 0) + 1;
        });
        
        const currCount = {};
        currAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            currCount[key] = (currCount[key] || 0) + 1;
        });
        
        // Comparar tipos presentes
        const prevTypes = Object.keys(prevCount).sort();
        const currTypes = Object.keys(currCount).sort();
        
        if (prevTypes.length !== currTypes.length) {
            return true;
        }
        
        // Comparar quantidades de cada tipo
        for (let i = 0; i < prevTypes.length; i++) {
            const type = prevTypes[i];
            if (prevCount[type] !== currCount[type]) {
                return true;
            }
        }
        
        return false;
    }
    
    // Obter diferenças detalhadas entre listas de items
    function getItemsDiff(prevItems, currItems) {
        const prevMap = {};
        prevItems.forEach(function(item) {
            const key = item.ItemType || '';
            if (!prevMap[key]) {
                prevMap[key] = [];
            }
            prevMap[key].push(item);
        });
        
        const currMap = {};
        currItems.forEach(function(item) {
            const key = item.ItemType || '';
            if (!currMap[key]) {
                currMap[key] = [];
            }
            currMap[key].push(item);
        });
        
        const added = [];
        const removed = [];
        const unchanged = [];
        
        // Encontrar items adicionados
        Object.keys(currMap).forEach(function(key) {
            const prevCount = (prevMap[key] || []).length;
            const currCount = currMap[key].length;
            
            if (currCount > prevCount) {
                const diff = currCount - prevCount;
                for (let i = 0; i < diff; i++) {
                    added.push({ type: key, item: currMap[key][prevCount + i] });
                }
            }
        });
        
        // Encontrar items removidos
        Object.keys(prevMap).forEach(function(key) {
            const prevCount = prevMap[key].length;
            const currCount = (currMap[key] || []).length;
            
            if (prevCount > currCount) {
                const diff = prevCount - currCount;
                for (let i = 0; i < diff; i++) {
                    removed.push({ type: key, item: prevMap[key][currCount + i] });
                }
            }
        });
        
        // Encontrar items inalterados (presentes em ambos)
        Object.keys(prevMap).forEach(function(key) {
            if (currMap[key]) {
                const minCount = Math.min(prevMap[key].length, currMap[key].length);
                for (let i = 0; i < minCount; i++) {
                    unchanged.push({ type: key, prevItem: prevMap[key][i], currItem: currMap[key][i] });
                }
            }
        });
        
        return { added: added, removed: removed, unchanged: unchanged };
    }
    
    // Obter diferenças detalhadas entre listas de attachments
    function getAttachmentsDiff(prevAttachments, currAttachments) {
        const prevMap = {};
        prevAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            if (!prevMap[key]) {
                prevMap[key] = [];
            }
            prevMap[key].push(attachment);
        });
        
        const currMap = {};
        currAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            if (!currMap[key]) {
                currMap[key] = [];
            }
            currMap[key].push(attachment);
        });
        
        const added = [];
        const removed = [];
        const unchanged = [];
        
        // Encontrar attachments adicionados
        Object.keys(currMap).forEach(function(key) {
            const prevCount = (prevMap[key] || []).length;
            const currCount = currMap[key].length;
            
            if (currCount > prevCount) {
                const diff = currCount - prevCount;
                for (let i = 0; i < diff; i++) {
                    added.push({ type: key, attachment: currMap[key][prevCount + i] });
                }
            }
        });
        
        // Encontrar attachments removidos
        Object.keys(prevMap).forEach(function(key) {
            const prevCount = prevMap[key].length;
            const currCount = (currMap[key] || []).length;
            
            // Se há mais attachments deste tipo em prev do que em curr, os extras foram removidos
            if (prevCount > currCount) {
                const diff = prevCount - currCount;
                for (let i = 0; i < diff; i++) {
                    removed.push({ type: key, attachment: prevMap[key][currCount + i] });
                }
            }
        });
        
        // Encontrar attachments inalterados (presentes em ambos)
        Object.keys(prevMap).forEach(function(key) {
            if (currMap[key]) {
                const minCount = Math.min(prevMap[key].length, currMap[key].length);
                for (let i = 0; i < minCount; i++) {
                    unchanged.push({ type: key, prevAttachment: prevMap[key][i], currAttachment: currMap[key][i] });
                }
            }
        });
        
        return { added: added, removed: removed, unchanged: unchanged };
    }
    
    // Renderizar seção de saúde
    function renderHealthSection(record) {
        let html = '<div class="d-flex gap-3 flex-wrap align-items-center" style="font-size: 0.875rem;">';
        let hasData = false;
        
        if (record.EngineHealth !== null && record.EngineHealth !== undefined) {
            const engineHealth = parseFloat(record.EngineHealth || 0) * 100;
            html += '<div class="d-flex align-items-center gap-2"><small>Motor:</small> ' + 
                renderHealthBar(engineHealth) + '</div>';
            hasData = true;
        }
        
        if (record.BodyHealth !== null && record.BodyHealth !== undefined) {
            const bodyHealth = parseFloat(record.BodyHealth || 0) * 100;
            html += '<div class="d-flex align-items-center gap-2"><small>Carroceria:</small> ' + 
                renderHealthBar(bodyHealth) + '</div>';
            hasData = true;
        }
        
        if (record.FuelTankHealth !== null && record.FuelTankHealth !== undefined) {
            const fuelHealth = parseFloat(record.FuelTankHealth || 0) * 100;
            html += '<div class="d-flex align-items-center gap-2"><small>Tanque:</small> ' + 
                renderHealthBar(fuelHealth) + '</div>';
            hasData = true;
        }
        
        html += '</div>';
        return hasData ? html : '<span class="text-muted">N/A</span>';
    }
    
    // Renderizar posição com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro (mais antigo, para comparação, pode ser null se for o último)
    function renderPositionWithChanges(prev, curr) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderPosition(prev);
        }
        
        // Threshold reduzido para detectar mudanças menores (0.001 unidades)
        const posThreshold = 0.001;
        // Mostrar valores do registro atual (prev = mais recente)
        const x = parseFloat(prev.PositionX || 0);
        const y = parseFloat(prev.PositionY || 0);
        const z = parseFloat(prev.PositionZ || 0);
        
        // Comparar com o próximo registro (curr = mais antigo)
        const currX = parseFloat(curr.PositionX || 0);
        const currY = parseFloat(curr.PositionY || 0);
        const currZ = parseFloat(curr.PositionZ || 0);
        
        const xChanged = Math.abs(x - currX) > posThreshold;
        const yChanged = Math.abs(y - currY) > posThreshold;
        const zChanged = Math.abs(z - currZ) > posThreshold;
        
        let html = '<div class="d-flex gap-3 flex-wrap" style="font-size: 0.875rem;">';
        
        if (xChanged) {
            const diff = x - currX; // Diferença do atual (recente) para o próximo (antigo)
            const arrow = diff > 0 ? '→' : '←';
            html += `<span>X: <span class="change-modified" style="font-weight: 700; background-color: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; border: 1px solid #ffc107;">${x.toFixed(2)}</span> <small class="text-info" style="font-weight: 600;">(${arrow} ${Math.abs(diff).toFixed(2)})</small></span>`;
        } else {
            html += `<span>X: ${x.toFixed(2)}</span>`;
        }
        
        if (yChanged) {
            const diff = y - currY;
            const arrow = diff > 0 ? '↑' : '↓';
            html += `<span>Y: <span class="change-modified" style="font-weight: 700; background-color: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; border: 1px solid #ffc107;">${y.toFixed(2)}</span> <small class="text-info" style="font-weight: 600;">(${arrow} ${Math.abs(diff).toFixed(2)})</small></span>`;
        } else {
            html += `<span>Y: ${y.toFixed(2)}</span>`;
        }
        
        if (zChanged) {
            const diff = z - currZ;
            const arrow = diff > 0 ? '↗' : '↘';
            html += `<span>Z: <span class="change-modified" style="font-weight: 700; background-color: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; border: 1px solid #ffc107;">${z.toFixed(2)}</span> <small class="text-info" style="font-weight: 600;">(${arrow} ${Math.abs(diff).toFixed(2)})</small></span>`;
        } else {
            html += `<span>Z: ${z.toFixed(2)}</span>`;
        }
        
        html += '</div>';
        return html;
    }
    
    // Renderizar posição simples (sem comparação)
    function renderPosition(record) {
        const x = parseFloat(record.PositionX || 0).toFixed(2);
        const y = parseFloat(record.PositionY || 0).toFixed(2);
        const z = parseFloat(record.PositionZ || 0).toFixed(2);
        return `<div class="d-flex gap-3 flex-wrap" style="font-size: 0.875rem;"><span>X: ${x}</span><span>Y: ${y}</span><span>Z: ${z}</span></div>`;
    }
    
    // Renderizar seção de saúde com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro (mais antigo, para comparação, pode ser null se for o último)
    function renderHealthSectionWithChanges(prev, curr) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderHealthSection(prev);
        }
        
        let html = '<div class="d-flex gap-3 flex-wrap align-items-center" style="font-size: 0.875rem;">';
        let hasData = false;
        const healthThreshold = 0.05;
        
        // Motor - mostrar valor do registro atual (prev)
        if (prev.EngineHealth !== null && prev.EngineHealth !== undefined) {
            const engineHealth = parseFloat(prev.EngineHealth || 0) * 100;
            let changeIndicator = '';
            
            // Comparar com o próximo registro (curr)
            if (curr.EngineHealth !== null && curr.EngineHealth !== undefined) {
                const currHealth = parseFloat(curr.EngineHealth || 0) * 100;
                const diff = engineHealth - currHealth; // Diferença do atual (recente) para o próximo (antigo)
                
                if (Math.abs(diff) > (healthThreshold * 100)) {
                    const arrow = diff > 0 ? '↑' : '↓';
                    const colorClass = diff > 0 ? 'text-success' : 'text-danger';
                    const borderColor = diff > 0 ? '#28a745' : '#dc3545';
                    changeIndicator = ` <small class="${colorClass}" style="font-weight: 700;">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                    html += '<div class="d-flex align-items-center gap-2" style="padding: 4px 8px; background-color: ' + (diff > 0 ? '#d4edda' : '#f8d7da') + '; border-radius: 4px; border: 2px solid ' + borderColor + ';"><small style="font-weight: 600;">Motor:</small> ' + 
                        renderHealthBar(engineHealth) + changeIndicator + '</div>';
                } else {
                    html += '<div class="d-flex align-items-center gap-2"><small>Motor:</small> ' + 
                        renderHealthBar(engineHealth) + changeIndicator + '</div>';
                }
            } else {
                html += '<div class="d-flex align-items-center gap-2"><small>Motor:</small> ' + 
                    renderHealthBar(engineHealth) + changeIndicator + '</div>';
            }
            hasData = true;
        }
        
        // Carroceria - mostrar valor do registro atual (prev)
        if (prev.BodyHealth !== null && prev.BodyHealth !== undefined) {
            const bodyHealth = parseFloat(prev.BodyHealth || 0) * 100;
            let changeIndicator = '';
            
            // Comparar com o próximo registro (curr)
            if (curr.BodyHealth !== null && curr.BodyHealth !== undefined) {
                const currHealth = parseFloat(curr.BodyHealth || 0) * 100;
                const diff = bodyHealth - currHealth;
                
                if (Math.abs(diff) > (healthThreshold * 100)) {
                    const arrow = diff > 0 ? '↑' : '↓';
                    const colorClass = diff > 0 ? 'text-success' : 'text-danger';
                    const borderColor = diff > 0 ? '#28a745' : '#dc3545';
                    changeIndicator = ` <small class="${colorClass}" style="font-weight: 700;">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                    html += '<div class="d-flex align-items-center gap-2" style="padding: 4px 8px; background-color: ' + (diff > 0 ? '#d4edda' : '#f8d7da') + '; border-radius: 4px; border: 2px solid ' + borderColor + ';"><small style="font-weight: 600;">Carroceria:</small> ' + 
                        renderHealthBar(bodyHealth) + changeIndicator + '</div>';
                } else {
                    html += '<div class="d-flex align-items-center gap-2"><small>Carroceria:</small> ' + 
                        renderHealthBar(bodyHealth) + changeIndicator + '</div>';
                }
            } else {
                html += '<div class="d-flex align-items-center gap-2"><small>Carroceria:</small> ' + 
                    renderHealthBar(bodyHealth) + changeIndicator + '</div>';
            }
            hasData = true;
        }
        
        // Tanque - mostrar valor do registro atual (prev)
        if (prev.FuelTankHealth !== null && prev.FuelTankHealth !== undefined) {
            const fuelHealth = parseFloat(prev.FuelTankHealth || 0) * 100;
            let changeIndicator = '';
            
            // Comparar com o próximo registro (curr)
            if (curr.FuelTankHealth !== null && curr.FuelTankHealth !== undefined) {
                const currHealth = parseFloat(curr.FuelTankHealth || 0) * 100;
                const diff = fuelHealth - currHealth;
                
                if (Math.abs(diff) > (healthThreshold * 100)) {
                    const arrow = diff > 0 ? '↑' : '↓';
                    const colorClass = diff > 0 ? 'text-success' : 'text-danger';
                    const borderColor = diff > 0 ? '#28a745' : '#dc3545';
                    changeIndicator = ` <small class="${colorClass}" style="font-weight: 700;">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                    html += '<div class="d-flex align-items-center gap-2" style="padding: 4px 8px; background-color: ' + (diff > 0 ? '#d4edda' : '#f8d7da') + '; border-radius: 4px; border: 2px solid ' + borderColor + ';"><small style="font-weight: 600;">Tanque:</small> ' + 
                        renderHealthBar(fuelHealth) + changeIndicator + '</div>';
                } else {
                    html += '<div class="d-flex align-items-center gap-2"><small>Tanque:</small> ' + 
                        renderHealthBar(fuelHealth) + changeIndicator + '</div>';
                }
            } else {
                html += '<div class="d-flex align-items-center gap-2"><small>Tanque:</small> ' + 
                    renderHealthBar(fuelHealth) + changeIndicator + '</div>';
            }
            hasData = true;
        }
        
        html += '</div>';
        return hasData ? html : '<span class="text-muted">N/A</span>';
    }
    
    // Gerar placeholder SVG inline (não depende de serviço externo)
    function generatePlaceholderSVG() {
        // SVG simples com fundo cinza e ícone de caixa (usando encodeURIComponent para compatibilidade)
        const svg = '<svg width="42" height="42" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg"><rect width="42" height="42" fill="#6c757d" rx="2"/><path d="M10 14h22v16H10V14zm2 2v12h18V16H12zm2 2h14v2H14v-2zm0 4h10v2H14v-2z" fill="#ffffff" opacity="0.7"/></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    
    // Helper para montar bloco de ícone em grade (sem badge colorida)
    // Usado tanto em renderItemsAndAttachments quanto em renderItemsAndAttachmentsWithChanges
    function buildSimpleIconBlock(label, img, healthValue, title, extraIconHtml) {
        // Sempre usar uma imagem: img fornecida ou placeholder SVG inline (42px)
        let iconHtml = '';
        if (img && img.trim()) {
            iconHtml = '<img src="' + img + '" alt="' + escapeHtml(label) + '" ' +
                'class="vehicle-item-icon" style="width: 42px; height: 42px; object-fit: contain; display: block; margin: 0 auto 4px;" onerror="this.src=\'' + generatePlaceholderSVG() + '\'">';
        } else {
            // Placeholder SVG inline (não depende de serviço externo)
            iconHtml = '<img src="' + generatePlaceholderSVG() + '" alt="' + escapeHtml(label) + '" ' +
                'class="vehicle-item-icon" style="width: 42px; height: 42px; object-fit: contain; display: block; margin: 0 auto 4px;">';
        }
        
        const textHtml = '<span class="small d-block text-center" style="font-size: 0.7rem; line-height: 1.2; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; hyphens: auto; max-width: 100%;">' + 
            escapeHtml(label) + (healthValue ? '<br><span class="text-muted">' + healthValue + '</span>' : '') + 
            '</span>';
        
        // Determinar estilo da borda baseado no tipo de mudança
        let borderStyle = 'border: 1px solid #dee2e6;';
        let backgroundColor = '';
        if (extraIconHtml) {
            if (extraIconHtml.includes('fa-plus-circle text-success')) {
                // Item/attachment adicionado - borda verde
                borderStyle = 'border: 2px solid #28a745;';
                backgroundColor = 'background-color: #d4edda;';
            } else if (extraIconHtml.includes('fa-minus-circle text-danger')) {
                // Item/attachment removido - borda vermelha
                borderStyle = 'border: 2px solid #dc3545;';
                backgroundColor = 'background-color: #f8d7da;';
            }
        }
        
        return '<div class="d-flex flex-column align-items-center justify-content-center p-2" style="' + borderStyle + backgroundColor + 'border-radius: 4px; min-height: 90px; position: relative; width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;" title="' + escapeHtml(title || label) + '">' +
            (extraIconHtml ? '<div style="position: absolute; top: 4px; right: 4px; font-size: 0.875rem; z-index: 10;">' + extraIconHtml + '</div>' : '') +
            iconHtml +
            '<div style="width: 100%; max-width: 100%;">' + textHtml + '</div>' +
            '</div>';
    }
    
    // Encontrar último snapshot completo anterior na lista do histórico
    function findLastCompleteSnapshotBefore(history, currentIndex) {
        // O histórico vem em ordem DESC: [mais recente, ..., mais antigo]
        // Procurar por um snapshot completo (IsPartialUpdate = 0) que seja anterior ao índice atual
        // (ou seja, com índice maior que currentIndex, pois índices maiores = mais antigo)
        for (let i = currentIndex + 1; i < history.length; i++) {
            const record = history[i];
            if (record && (record.IsPartialUpdate || 0) === 0) {
                return record;
            }
        }
        return null;
    }
    
    // Renderizar items e attachments com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro na lista (mais antigo, para comparação, pode ser null se for o último)
    // history = array completo do histórico (opcional, usado para encontrar snapshot completo anterior)
    // currentIndex = índice do registro atual no histórico (opcional)
    function renderItemsAndAttachmentsWithChanges(prev, curr, history, currentIndex) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderItemsAndAttachments(prev);
        }
        
        // Verificar se algum registro é parcial
        const prevIsPartial = (prev.IsPartialUpdate || 0) === 1;
        const currIsPartial = (curr.IsPartialUpdate || 0) === 1;
        
        // Verificar se há mudanças em items/attachments detectadas
        const changeTypes = getChangeTypes(prev, curr);
        const itemsChangesDetected = changeTypes && changeTypes.items;
        const attachmentsChangesDetected = changeTypes && changeTypes.attachments;
        
        let html = '';
        
        // Se o registro atual é parcial, mostrar aviso com informação sobre origem dos dados
        if (prevIsPartial) {
            let sourceInfo = '';
            if (history && currentIndex !== undefined && currentIndex !== null) {
                const lastComplete = findLastCompleteSnapshotBefore(history, currentIndex);
                if (lastComplete) {
                    const sourceTimestamp = formatDateTime(lastComplete.TimeStamp);
                    sourceInfo = ' Os items e attachments exibidos abaixo são do snapshot completo de <strong>' + sourceTimestamp + '</strong> e foram preservados porque este é um registro parcial.';
                }
            }
            html += '<div class="alert alert-info mb-2">' +
                '<i class="fas fa-info-circle me-2"></i>' +
                '<div><strong>Update parcial:</strong> Este registro contém apenas informações de posição e saúde.<br>' +
                '<small>' +
                'Os items e attachments mostrados abaixo são do último snapshot completo anterior e não refletem mudanças neste momento específico.' +
                sourceInfo +
                '</small></div>' +
                '</div>';
        }
        
        // Se há mudanças em items/attachments detectadas mas um registro é parcial, informar
        if ((itemsChangesDetected || attachmentsChangesDetected) && (prevIsPartial || currIsPartial)) {
            let messageParts = [];
            if (itemsChangesDetected) {
                messageParts.push('items');
            }
            if (attachmentsChangesDetected) {
                messageParts.push('attachments');
            }
            html += '<div class="alert alert-warning mb-2">' +
                '<i class="fas fa-exclamation-triangle me-2"></i>' +
                '<small>Mudanças em ' + messageParts.join(' e ') + ' foram detectadas, mas não podem ser comparadas porque um dos registros é parcial.</small>' +
                '</div>';
        }
        
        // Comparar items apenas se ambos forem completos
        if (!prevIsPartial && !currIsPartial) {
            // Comparar items
            // prev = registro atual sendo renderizado (mais recente)
            // curr = próximo registro (mais antigo, para comparação)
            // Invertemos a ordem para comparar do mais antigo (curr) para o mais recente (prev)
            // Isso mostra o que mudou DO curr (antigo) PARA o prev (recente)
            const itemsDiff = getItemsDiff(curr.items || [], prev.items || []);
            
            // Mostrar items do registro atual (prev = mais recente), não do curr
            const hasItemsForDiff = itemsDiff.added.length > 0 || itemsDiff.removed.length > 0 || (prev.items && prev.items.length > 0);
            
            // Comparar attachments apenas se ambos forem completos
            // prev = registro atual sendo renderizado (mais recente)
            // curr = próximo registro (mais antigo, para comparação)
            // Invertemos a ordem para comparar do mais antigo (curr) para o mais recente (prev)
            // Isso mostra o que mudou DO curr (antigo) PARA o prev (recente)
            const attachmentsDiff = getAttachmentsDiff(curr.attachments || [], prev.attachments || []);
            const hasAttachmentsForDiff = attachmentsDiff.added.length > 0 || attachmentsDiff.removed.length > 0 || (prev.attachments && prev.attachments.length > 0);
            
            // Linha de Items (linha completa)
            if (hasItemsForDiff) {
                html += '<div class="mb-3">';
                html += '<strong>Items (' + (prev.items ? prev.items.length : 0) + '):</strong><br>';
                html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 8px;">';
                
                // Ordenar arrays alfabeticamente por type
                const sortedRemoved = itemsDiff.removed.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                const sortedUnchanged = itemsDiff.unchanged.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                const sortedAdded = itemsDiff.added.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                
                // Helper para montar bloco com ícone indicando adição/remoção/inalterado
                function buildItemDiffBlock(baseItem, typeIconClass) {
                    if (!baseItem) {
                        return '';
                    }
                    const type = baseItem.ItemType || '';
                    const label = baseItem.name || type;
                    const img = baseItem.img || '';
                    const healthValue = baseItem.ItemHealth !== null && baseItem.ItemHealth !== undefined
                        ? parseFloat(baseItem.ItemHealth || 0).toFixed(0) + '%'
                        : null;
                    let extraIconHtml = '';
                    if (typeIconClass === 'added') {
                        extraIconHtml = '<i class="fas fa-plus-circle text-success me-1"></i>';
                    } else if (typeIconClass === 'removed') {
                        extraIconHtml = '<i class="fas fa-minus-circle text-danger me-1"></i>';
                    } else {
                        extraIconHtml = '';
                    }
                    return buildSimpleIconBlock(label, img, healthValue, type || label, extraIconHtml);
                }
                
                // Mostrar items removidos (estavam em curr mas não em prev = foram removidos entre curr e prev)
                sortedRemoved.forEach(function(entry) {
                    html += buildItemDiffBlock(entry.item, 'removed');
                });
                
                // Mostrar items inalterados (presentes em ambos)
                sortedUnchanged.forEach(function(entry) {
                    html += buildItemDiffBlock(entry.prevItem, 'unchanged');
                });
                
                // Mostrar items adicionados (estavam em prev mas não em curr = foram adicionados entre curr e prev)
                sortedAdded.forEach(function(entry) {
                    html += buildItemDiffBlock(entry.item, 'added');
                });
                
                html += '</div></div>';
            }
            
            // Linha de Attachments (linha completa, embaixo dos items)
            if (hasAttachmentsForDiff) {
                html += '<div>';
                html += '<strong>Attachments (' + (prev.attachments ? prev.attachments.length : 0) + '):</strong><br>';
                html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 8px;">';
                
                // Ordenar arrays alfabeticamente por type
                const sortedRemovedAtt = attachmentsDiff.removed.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                const sortedUnchangedAtt = attachmentsDiff.unchanged.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                const sortedAddedAtt = attachmentsDiff.added.slice().sort(function(a, b) {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                
                function buildAttachmentDiffBlock(baseAttachment, typeIconClass) {
                    if (!baseAttachment) {
                        return '';
                    }
                    const type = baseAttachment.AttachmentType || '';
                    const label = baseAttachment.name || type;
                    const img = baseAttachment.img || '';
                    const healthValue = baseAttachment.AttachmentHealth !== null && baseAttachment.AttachmentHealth !== undefined
                        ? parseFloat(baseAttachment.AttachmentHealth || 0).toFixed(0) + '%'
                        : null;
                    let extraIconHtml = '';
                    if (typeIconClass === 'added') {
                        extraIconHtml = '<i class="fas fa-plus-circle text-success me-1"></i>';
                    } else if (typeIconClass === 'removed') {
                        extraIconHtml = '<i class="fas fa-minus-circle text-danger me-1"></i>';
                    } else {
                        extraIconHtml = '';
                    }
                    return buildSimpleIconBlock(label, img, healthValue, type || label, extraIconHtml);
                }
                
                // Mostrar attachments removidos (estavam em curr mas não em prev = foram removidos entre curr e prev)
                sortedRemovedAtt.forEach(function(entry) {
                    html += buildAttachmentDiffBlock(entry.attachment, 'removed');
                });
                
                // Mostrar attachments inalterados (presentes em ambos)
                sortedUnchangedAtt.forEach(function(entry) {
                    html += buildAttachmentDiffBlock(entry.prevAttachment, 'unchanged');
                });
                
                // Mostrar attachments adicionados (estavam em prev mas não em curr = foram adicionados entre curr e prev)
                sortedAddedAtt.forEach(function(entry) {
                    html += buildAttachmentDiffBlock(entry.attachment, 'added');
                });
                
                html += '</div></div>';
            }
        } else if (!prevIsPartial) {
            // Se apenas prev é completo, mostrar items/attachments do registro completo
            // Isso é especialmente importante quando há mudanças detectadas mas curr é parcial
            if (itemsChangesDetected || attachmentsChangesDetected) {
                html += '<div class="alert alert-warning mb-2">' +
                    '<i class="fas fa-info-circle me-2"></i>' +
                    '<small>Comparação detalhada não disponível (registro anterior é parcial). Exibindo items/attachments do snapshot completo atual.</small>' +
                    '</div>';
            }
            html += renderItemsAndAttachments(prev);
        } else if (prevIsPartial) {
            // Se o registro atual é parcial, mostrar items/attachments herdados com aviso adicional
            // Encontrar último snapshot completo se possível
            let lastCompleteInfo = '';
            if (history && currentIndex !== undefined && currentIndex !== null) {
                const lastComplete = findLastCompleteSnapshotBefore(history, currentIndex);
                if (lastComplete) {
                    const sourceTimestamp = formatDateTime(lastComplete.TimeStamp);
                    lastCompleteInfo = ' (herdados do snapshot completo de ' + sourceTimestamp + ')';
                }
            }
            
            if ((prev.items && prev.items.length > 0) || (prev.attachments && prev.attachments.length > 0)) {
                html += '<div class="mb-2">' +
                    '<small class="text-muted"><i class="fas fa-info-circle me-1"></i>Os items e attachments abaixo foram herdados do último snapshot completo anterior' + lastCompleteInfo + '.</small>' +
                    '</div>';
            }
            html += renderItemsAndAttachments(prev);
        } else if (itemsChangesDetected || attachmentsChangesDetected) {
            // Se ambos são parciais mas há mudanças detectadas, mostrar aviso adicional
            html += '<div class="alert alert-warning mb-2">' +
                '<i class="fas fa-exclamation-triangle me-2"></i>' +
                '<small>Mudanças em items/attachments foram detectadas, mas ambos os registros são parciais. Não é possível exibir comparação detalhada.</small>' +
                '</div>';
        }
        
        if (!html) {
            html = '<span class="text-muted">Nenhum item ou attachment</span>';
        }
        
        return html;
    }
    
    // Renderizar items e attachments
    function renderItemsAndAttachments(record) {
        let html = '';
        
        const hasItems = record.items && record.items.length > 0;
        const hasAttachments = record.attachments && record.attachments.length > 0;
        
        if (!hasItems && !hasAttachments) {
            return '<span class="text-muted">Nenhum item ou attachment</span>';
        }
        
        // Linha de Items (linha completa)
        if (hasItems) {
            html += '<div class="mb-3">';
            html += '<strong>Items (' + record.items.length + '):</strong><br>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 8px;">';
            // Ordenar items alfabeticamente por nome amigável ou ItemType
            const sortedItems = record.items.slice().sort(function(a, b) {
                const nameA = (a.name || a.ItemType || '').toLowerCase();
                const nameB = (b.name || b.ItemType || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            sortedItems.forEach(function(item) {
                const healthValue = item.ItemHealth !== null && item.ItemHealth !== undefined
                    ? parseFloat(item.ItemHealth || 0).toFixed(0) + '%'
                    : null;
                const label = item.name || item.ItemType || '';
                const img = item.img || '';
                const title = item.ItemType || label;
                html += buildSimpleIconBlock(label, img, healthValue, title, '');
            });
            html += '</div></div>';
        }
        
        // Linha de Attachments (linha completa, embaixo dos items)
        if (hasAttachments) {
            html += '<div>';
            html += '<strong>Attachments (' + record.attachments.length + '):</strong><br>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-top: 8px;">';
            // Ordenar attachments alfabeticamente por nome amigável ou AttachmentType
            const sortedAttachments = record.attachments.slice().sort(function(a, b) {
                const nameA = (a.name || a.AttachmentType || '').toLowerCase();
                const nameB = (b.name || b.AttachmentType || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            sortedAttachments.forEach(function(attachment) {
                const healthValue = attachment.AttachmentHealth !== null && attachment.AttachmentHealth !== undefined
                    ? parseFloat(attachment.AttachmentHealth || 0).toFixed(0) + '%'
                    : null;
                const label = attachment.name || attachment.AttachmentType || '';
                const img = attachment.img || '';
                const title = attachment.AttachmentType || label;
                html += buildSimpleIconBlock(label, img, healthValue, title, '');
            });
            html += '</div></div>';
        }
        
        return html;
    }
    
    // Formatar data/hora
    function formatDateTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString('pt-BR');
    }
    
    // Inicializar
    // Definir filtro padrão: Última hora
    activeQuickFilter = 'last1h';
    updateQuickShortcutButtons();
    const initialRange = computeQuickRange(activeQuickFilter);
    if (initialRange) {
        const cfg = initialRange.config || QUICK_FILTERS[activeQuickFilter] || {};
        if (cfg.minutes || cfg.days) {
            setCustomDateInputs(initialRange.from, null);
        } else {
            setCustomDateInputs(initialRange.from, initialRange.to);
        }
    }
    initDataTable();
});

