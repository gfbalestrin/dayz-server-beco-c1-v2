$(document).ready(function() {
    let structuresTable;
    let currentStructureId = null;
    let currentStructureType = null;
    let autoRefreshInterval = null;
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
    
    // Estado do banner de estruturas destruídas
    let destroyedStructuresAlertClosed = false;
    
    // Função para atualizar contador de estruturas
    function updateStructuresCount(recordsTotal, recordsFiltered) {
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
            countText += ' construção' + ((filtered || total) !== 1 ? 'ões' : '');
        } else {
            countText = 'Nenhuma construção';
        }
        
        $('#structuresCount').text(countText);
    }
    
    // Função para atualizar contador de estruturas destruídas
    function updateDestroyedStructuresCount(structuresData) {
        if (!structuresData || !Array.isArray(structuresData)) {
            return;
        }
        
        let destroyedCount = 0;
        structuresData.forEach(function(structure) {
            if (structure.IsDestroyed == 1 || structure.IsDestroyed === true) {
                destroyedCount++;
            }
        });
        
        const countElement = $('#destroyedStructuresCount');
        const alertElement = $('#destroyedStructuresAlert');
        
        countElement.text(destroyedCount.toLocaleString('pt-BR'));
        
        // Mostrar/esconder banner baseado na contagem e estado de fechado
        if (destroyedCount > 0 && !destroyedStructuresAlertClosed) {
            alertElement.show();
        } else {
            alertElement.hide();
        }
    }
    
    // Inicializar DataTable
    function initDataTable() {
        structuresTable = $('#structuresTable').DataTable({
            processing: true,
            serverSide: true,
            ajax: {
                url: '/api/structures/data',
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
                        updateStructuresCount(json.recordsTotal, json.recordsFiltered);
                    }
                    // Atualizar contador de estruturas destruídas
                    if (json && json.data) {
                        updateDestroyedStructuresCount(json.data);
                    }
                    return json.data;
                }
            },
            columns: [
                {
                    data: 'StructureId',
                    render: function(data) {
                        return '<code>' + escapeHtml(data) + '</code>';
                    }
                },
                {
                    data: 'StructureName',
                    render: function(data) {
                        return escapeHtml(data || 'N/A');
                    }
                },
                {
                    data: 'StructureType',
                    render: function(data) {
                        const typeNames = {
                            'fence': 'Fence',
                            'watchtower': 'Watchtower',
                            'flag': 'Flag'
                        };
                        const name = typeNames[data] || data;
                        const badges = {
                            'fence': 'bg-info',
                            'watchtower': 'bg-primary',
                            'flag': 'bg-warning'
                        };
                        const badgeClass = badges[data] || 'bg-secondary';
                        return '<span class="badge ' + badgeClass + '">' + escapeHtml(name) + '</span>';
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
                    orderable: true,
                    render: function(data, type, row) {
                        return renderChangeBadges(row.ChangeFlags);
                    }
                },
                {
                    data: null,
                    orderable: false,
                    render: function(data) {
                        const structureId = encodeURIComponent(data.StructureId || '');
                        const mapUrl = `/map?structure_id=${structureId}&structure_type=${data.StructureType || 'fence'}`;
                        return `<a class="btn btn-link p-0" href="${mapUrl}" title="Abrir construção no mapa">` +
                            `<i class="fas fa-map-marker-alt me-1"></i>Ver no mapa</a>`;
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
                    data: null,
                    orderable: false,
                    render: function(data) {
                        const structureId = escapeHtml(data.StructureId);
                        const structureType = escapeHtml(data.StructureType || 'fence');
                        return '' +
                            '<div class="btn-group" role="group">' +
                                '<button class="btn btn-sm btn-primary view-history-btn" ' +
                                    'data-structure-id="' + structureId + '" ' +
                                    'data-structure-type="' + structureType + '">' +
                                    '<i class="fas fa-history me-1"></i>Ver Histórico' +
                                '</button>' +
                            '</div>';
                    }
                }
            ],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            order: [[6, 'desc'], [4, 'desc']],
            pageLength: 50,
            responsive: true,
            searchDelay: 500,
            createdRow: function(row, data, dataIndex) {
                // Adicionar classe CSS para destacar estruturas com muitas alterações
                const changeCount = parseInt(data.ChangeCount || 0);
                if (changeCount >= 6) {
                    $(row).addClass('structure-high-changes');
                } else if (changeCount >= 3) {
                    $(row).addClass('structure-medium-changes');
                }
            },
            drawCallback: function(settings) {
                // Atualizar contador de estruturas (fallback caso dataSrc não tenha atualizado)
                try {
                    const api = this.api();
                    const pageInfo = api.page.info();
                    updateStructuresCount(pageInfo.recordsTotal, pageInfo.recordsFiltered);
                    
                    // Atualizar contador de estruturas destruídas (fallback)
                    const data = api.rows({ page: 'current' }).data().toArray();
                    updateDestroyedStructuresCount(data);
                } catch (e) {
                    console.error('Erro ao atualizar contador de estruturas:', e);
                }
            }
        });
    }
    
    function renderChangeBadges(changeFlags) {
        const flags = changeFlags || {};
        const badgeConfig = [
            { key: 'position', label: 'Coordenadas', classes: 'bg-info text-dark', icon: 'fa-location-arrow' },
            { key: 'status', label: 'Status', classes: 'bg-secondary', icon: 'fa-exclamation-triangle' },
            { key: 'structure', label: 'Estrutura', classes: 'bg-primary', icon: 'fa-building' },
            { key: 'attack', label: 'Ataque', classes: 'bg-danger', icon: 'fa-exclamation-triangle' }
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
        $('.structure-quick-filter').removeClass('active');
        if (activeQuickFilter) {
            $(`.structure-quick-filter[data-filter="${activeQuickFilter}"]`).addClass('active');
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
        if (structuresTable) {
            // Resetar estado de fechado do banner ao recarregar tabela
            destroyedStructuresAlertClosed = false;
            
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
                structuresTable.page('first');
            }
            structuresTable.ajax.reload(null, false);
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
    
    $('.structure-quick-filter').on('click', function() {
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
    
    // Abrir histórico automaticamente se structure_id vier na URL
    (function initStructureFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const structureIdFromUrl = urlParams.get('structure_id');
            const structureTypeFromUrl = urlParams.get('structure_type') || 'fence';
            if (structureIdFromUrl) {
                // Esperar DataTable inicializar antes de abrir o histórico
                const checkReadyInterval = setInterval(function() {
                    if (structuresTable) {
                        clearInterval(checkReadyInterval);
                        showStructureHistory(structureIdFromUrl, structureTypeFromUrl);
                    }
                }, 200);
                // Segurança: limpar intervalo após 10s
                setTimeout(function() {
                    clearInterval(checkReadyInterval);
                }, 10000);
            }
        } catch (e) {
            console.warn('Erro ao processar structure_id da URL:', e);
        }
    })();
    
    // Event listener para botão de histórico (usando delegação)
    $(document).on('click', '.view-history-btn', function() {
        const structureId = $(this).data('structure-id');
        const structureType = $(this).data('structure-type') || 'fence';
        showStructureHistory(structureId, structureType);
    });
    
    // Mostrar histórico da estrutura
    function showStructureHistory(structureId, structureType) {
        currentStructureId = structureId;
        currentStructureType = structureType;
        
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
        if (!currentStructureId || !currentStructureType) {
            return;
        }
        
        $('#historyLoading').show();
        $('#historyContent').hide();
        $('#historyModalLabel').html('<i class="fas fa-history me-2"></i>Histórico: ' + escapeHtml(currentStructureId));
        
        // Construir URL com parâmetros
        const params = new URLSearchParams();
        params.append('page', page);
        params.append('per_page', historyState.perPage);
        params.append('structure_type', currentStructureType);
        
        if (historyState.dateFrom) {
            params.append('date_from', historyState.dateFrom);
        }
        if (historyState.dateTo) {
            params.append('date_to', historyState.dateTo);
        }
        
        $.ajax({
            url: '/api/structures/' + encodeURIComponent(currentStructureId) + '/history?' + params.toString(),
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
            status: { label: 'Status', classes: 'bg-secondary', icon: 'fa-exclamation-triangle' },
            structure: { label: 'Estrutura', classes: 'bg-primary', icon: 'fa-building' },
            attack: { label: 'Ataque', classes: 'bg-danger', icon: 'fa-exclamation-triangle' }
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
            
            // Detectar ataque
            const structureType = currentStructureType || 'fence';
            const hasAttack = nextRecord && detectAttack(record, nextRecord, structureType);
            
            // Aplicar classe de destaque: vermelho para ataque, amarelo para outras mudanças
            let changeClass = '';
            if (hasAttack) {
                changeClass = 'border-danger bg-danger bg-opacity-10';
            } else if (hasChanges) {
                changeClass = 'border-warning bg-light';
            }
            
            // Obter tipos específicos de mudança
            const changeTypes = nextRecord ? getChangeTypes(record, nextRecord) : null;
            const changeBadgesHtml = changeTypes ? renderChangeTypeBadges(changeTypes) : '';
            
            // Mensagem de ataque
            let attackMessage = '';
            if (hasAttack) {
                if (structureType === 'fence') {
                    const prevLower = normalizeBoolValue(record.LowerPanelBuilt);
                    const prevUpper = normalizeBoolValue(record.UpperPanelBuilt);
                    const currLower = normalizeBoolValue(nextRecord.LowerPanelBuilt);
                    const currUpper = normalizeBoolValue(nextRecord.UpperPanelBuilt);
                    
                    const parts = [];
                    if (prevLower === 1 && currLower === 0) {
                        parts.push('Painel inferior perdido');
                    }
                    if (prevUpper === 1 && currUpper === 0) {
                        parts.push('Painel superior perdido');
                    }
                    attackMessage = parts.join('; ');
                } else if (structureType === 'watchtower') {
                    const wallFields = [
                        'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                        'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                        'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                        'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                        'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                        'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                        'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                        'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                        'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt'
                    ];
                    
                    const parts = [];
                    for (let wallField of wallFields) {
                        const prevWall = normalizeBoolValue(record[wallField]);
                        const currWall = normalizeBoolValue(nextRecord[wallField]);
                        if (prevWall === 1 && currWall === 0) {
                            const wallName = wallField.replace(/([A-Z])/g, ' $1').trim();
                            parts.push(wallName + ' perdida');
                        }
                    }
                    attackMessage = parts.join('; ');
                }
            }
            
            const recordHtml = `
                <div class="timeline-item mb-4 ${changeClass}" data-timestamp="${record.TimeStamp}">
                    <div class="d-flex">
                        <div class="timeline-marker me-3">
                            <div class="timeline-dot ${record.IsDestroyed == 1 ? 'bg-danger' : (hasAttack ? 'bg-danger' : 'bg-primary')}"></div>
                            ${index < history.length - 1 ? '<div class="timeline-line"></div>' : ''}
                        </div>
                        <div class="flex-grow-1">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h6 class="mb-0">
                                        <i class="fas fa-clock me-2"></i>
                                        ${formatDateTime(record.TimeStamp)}
                                    </h6>
                                    ${record.IsDestroyed == 1 ? 
                                        '<span class="badge bg-danger">Destruído</span>' : 
                                        '<span class="badge bg-success">Ativo</span>'}
                                </div>
                                <div class="card-body">
                                    ${hasAttack ? 
                                        '<div class="alert alert-danger mb-3">' +
                                        '<i class="fas fa-exclamation-triangle me-2"></i><strong>⚠️ Possível Ataque Detectado</strong><br>' +
                                        '<small>' + escapeHtml(attackMessage) + '</small>' +
                                        '</div>' : 
                                        ''}
                                    ${hasChanges && !hasAttack ? 
                                        '<div class="alert alert-info mb-3">' +
                                        '<i class="fas fa-info-circle me-2"></i><strong>Mudanças detectadas neste momento</strong>' +
                                        changeBadgesHtml +
                                        '</div>' : 
                                        ''}
                                    ${renderNameWithChanges(record, nextRecord)}
                                    <div class="row mt-3">
                                        <div class="col-md-6">
                                            <h6><i class="fas fa-map-marker-alt me-2"></i>Posição</h6>
                                            ${renderPositionWithChanges(record, nextRecord)}
                                        </div>
                                    </div>
                                    <div class="row mt-3">
                                        <div class="col-12">
                                            <h6><i class="fas fa-building me-2"></i>Componentes Estruturais</h6>
                                            ${renderStructureComponentsWithChanges(record, nextRecord)}
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
        const posThreshold = 0.001;
        
        // Verificar mudança de status (destruído/ativo)
        const statusChanged = (prev.IsDestroyed || 0) !== (curr.IsDestroyed || 0);
        
        // Verificar mudança de posição
        const posChanged = Math.abs((prev.PositionX || 0) - (curr.PositionX || 0)) > posThreshold ||
                          Math.abs((prev.PositionY || 0) - (curr.PositionY || 0)) > posThreshold ||
                          Math.abs((prev.PositionZ || 0) - (curr.PositionZ || 0)) > posThreshold;
        
        // Verificar mudança em componentes estruturais
        const structureChanged = structureComponentsChanged(prev, curr);
        
        // Verificar ataque
        const structureType = currentStructureType || 'fence';
        const attackDetected = detectAttack(prev, curr, structureType);
        
        return statusChanged || posChanged || structureChanged || attackDetected;
    }
    
    // Identificar tipos específicos de mudança entre dois registros
    function getChangeTypes(prev, curr) {
        const posThreshold = 0.001;
        const structureType = currentStructureType || 'fence';
        
        const changes = {
            position: false,
            status: false,
            structure: false,
            attack: false
        };
        
        // Mudança de status
        if ((prev.IsDestroyed || 0) !== (curr.IsDestroyed || 0)) {
            changes.status = true;
        }
        
        // Mudança de posição
        if (Math.abs((prev.PositionX || 0) - (curr.PositionX || 0)) > posThreshold ||
            Math.abs((prev.PositionY || 0) - (curr.PositionY || 0)) > posThreshold ||
            Math.abs((prev.PositionZ || 0) - (curr.PositionZ || 0)) > posThreshold) {
            changes.position = true;
        }
        
        // Mudança em componentes estruturais
        if (structureComponentsChanged(prev, curr)) {
            changes.structure = true;
        }
        
        // Detectar ataque
        if (detectAttack(prev, curr, structureType)) {
            changes.attack = true;
        }
        
        return changes;
    }
    
    // Função auxiliar para normalizar valores booleanos
    function normalizeBoolValue(value) {
        if (value === null || value === undefined) {
            return 0;
        }
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        const intVal = parseInt(value);
        return isNaN(intVal) ? 0 : (intVal !== 0 ? 1 : 0);
    }
    
    // Detectar ataque: componente estava construído e agora está destruído
    function detectAttack(prev, curr, structureType) {
        if (!prev || !curr) {
            return false;
        }
        
        if (structureType === 'fence') {
            const prevLower = normalizeBoolValue(prev.LowerPanelBuilt);
            const prevUpper = normalizeBoolValue(prev.UpperPanelBuilt);
            const currLower = normalizeBoolValue(curr.LowerPanelBuilt);
            const currUpper = normalizeBoolValue(curr.UpperPanelBuilt);
            
            // Ataque: painel estava construído (1) e agora está destruído (0)
            if ((prevLower === 1 && currLower === 0) || (prevUpper === 1 && currUpper === 0)) {
                return true;
            }
        } else if (structureType === 'watchtower') {
            // Lista de todas as paredes para verificar
            const wallFields = [
                'Level1Wall1LowerBuilt', 'Level1Wall1UpperBuilt',
                'Level1Wall2LowerBuilt', 'Level1Wall2UpperBuilt',
                'Level1Wall3LowerBuilt', 'Level1Wall3UpperBuilt',
                'Level2Wall1LowerBuilt', 'Level2Wall1UpperBuilt',
                'Level2Wall2LowerBuilt', 'Level2Wall2UpperBuilt',
                'Level2Wall3LowerBuilt', 'Level2Wall3UpperBuilt',
                'Level3Wall1LowerBuilt', 'Level3Wall1UpperBuilt',
                'Level3Wall2LowerBuilt', 'Level3Wall2UpperBuilt',
                'Level3Wall3LowerBuilt', 'Level3Wall3UpperBuilt'
            ];
            
            for (let wallField of wallFields) {
                const prevWall = normalizeBoolValue(prev[wallField]);
                const currWall = normalizeBoolValue(curr[wallField]);
                
                // Ataque: parede estava construída (1) e agora está destruída (0)
                if (prevWall === 1 && currWall === 0) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // Verificar se componentes estruturais mudaram
    function structureComponentsChanged(prev, curr) {
        // Verificar mudança de nome primeiro (FenceName, WatchtowerName, FlagName)
        const nameFields = ['FenceName', 'WatchtowerName', 'FlagName'];
        for (let nameField of nameFields) {
            if (nameField in prev && nameField in curr) {
                if (prev[nameField] !== curr[nameField]) {
                    return true;
                }
            }
        }
        
        // Obter chaves que não são posição/timestamp/ID de tracking/nome
        // IDs de tracking: IdFenceTracking, WatchtowerTrackingId, FlagTrackingId
        // IDs: FenceId, WatchtowerId, FlagId
        // Nomes: já verificados acima
        const excludeKeys = ['PositionX', 'PositionY', 'PositionZ', 'TimeStamp', 'IsDestroyed', 'DestroyedAt',
                            'FenceName', 'WatchtowerName', 'FlagName',
                            'FenceId', 'WatchtowerId', 'FlagId',
                            'IdFenceTracking', 'WatchtowerTrackingId', 'FlagTrackingId'];
        const prevKeys = Object.keys(prev).filter(k => !excludeKeys.includes(k) && !k.endsWith('TrackingId') && !k.endsWith('Id'));
        const currKeys = Object.keys(curr).filter(k => !excludeKeys.includes(k) && !k.endsWith('TrackingId') && !k.endsWith('Id'));
        
        const commonKeys = prevKeys.filter(k => currKeys.includes(k));
        for (let key of commonKeys) {
            if (prev[key] !== curr[key]) {
                return true;
            }
        }
        
        return false;
    }
    
    // Renderizar nome com indicadores de mudança
    function renderNameWithChanges(prev, curr) {
        if (!curr) {
            // Sem comparação, mostrar apenas o nome atual
            const nameFields = ['FenceName', 'WatchtowerName', 'FlagName'];
            for (let nameField of nameFields) {
                if (nameField in prev && prev[nameField]) {
                    return '<div class="mb-2"><strong>Nome:</strong> <code>' + escapeHtml(prev[nameField]) + '</code></div>';
                }
            }
            return '';
        }
        
        // Verificar mudança de nome
        const nameFields = ['FenceName', 'WatchtowerName', 'FlagName'];
        for (let nameField of nameFields) {
            if (nameField in prev && nameField in curr) {
                const prevName = prev[nameField];
                const currName = curr[nameField];
                const changed = prevName !== currName;
                
                if (changed) {
                    return '<div class="mb-2">' +
                           '<strong>Nome:</strong> <code class="change-modified" style="font-weight: 700; background-color: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 3px; border: 1px solid #ffc107;">' + escapeHtml(prevName) + '</code> ' +
                           '<small class="text-muted">(era <code>' + escapeHtml(currName) + '</code>)</small>' +
                           '</div>';
                } else {
                    return '<div class="mb-2"><strong>Nome:</strong> <code>' + escapeHtml(prevName) + '</code></div>';
                }
            }
        }
        
        return '';
    }
    
    // Renderizar componentes estruturais com indicadores de mudança
    function renderStructureComponentsWithChanges(prev, curr) {
        if (!curr) {
            return renderStructureComponents(prev);
        }
        
        // Excluir: posição, timestamp, status, IDs de tracking, IDs, nomes (já renderizados separadamente)
        const excludeKeys = ['PositionX', 'PositionY', 'PositionZ', 'TimeStamp', 'IsDestroyed', 'DestroyedAt',
                            'FenceName', 'WatchtowerName', 'FlagName',
                            'FenceId', 'WatchtowerId', 'FlagId',
                            'IdFenceTracking', 'WatchtowerTrackingId', 'FlagTrackingId'];
        const componentKeys = Object.keys(prev).filter(k => !excludeKeys.includes(k) && !k.endsWith('TrackingId') && !k.endsWith('Id'));
        
        if (componentKeys.length === 0) {
            return '<span class="text-muted">Nenhum componente</span>';
        }
        
        let html = '<div class="d-flex flex-wrap gap-2">';
        
        componentKeys.forEach(function(key) {
            const prevValue = prev[key];
            const currValue = curr[key];
            const changed = prevValue !== currValue;
            
            const label = key.replace(/([A-Z])/g, ' $1').trim();
            const displayValue = prevValue === 1 || prevValue === true ? 'Sim' : (prevValue === 0 || prevValue === false ? 'Não' : String(prevValue || 'N/A'));
            
            if (changed) {
                html += '<span class="badge bg-warning text-dark">' + escapeHtml(label) + ': ' + escapeHtml(displayValue) + 
                       ' <small>(era ' + (currValue === 1 || currValue === true ? 'Sim' : (currValue === 0 || currValue === false ? 'Não' : String(currValue || 'N/A'))) + ')</small></span>';
            } else {
                html += '<span class="badge bg-secondary">' + escapeHtml(label) + ': ' + escapeHtml(displayValue) + '</span>';
            }
        });
        
        html += '</div>';
        return html;
    }
    
    // Renderizar componentes estruturais simples
    function renderStructureComponents(record) {
        // Excluir: posição, timestamp, status, IDs de tracking, IDs, nomes (já renderizados separadamente)
        const excludeKeys = ['PositionX', 'PositionY', 'PositionZ', 'TimeStamp', 'IsDestroyed', 'DestroyedAt',
                            'FenceName', 'WatchtowerName', 'FlagName',
                            'FenceId', 'WatchtowerId', 'FlagId',
                            'IdFenceTracking', 'WatchtowerTrackingId', 'FlagTrackingId'];
        const componentKeys = Object.keys(record).filter(k => !excludeKeys.includes(k) && !k.endsWith('TrackingId') && !k.endsWith('Id'));
        
        if (componentKeys.length === 0) {
            return '<span class="text-muted">Nenhum componente</span>';
        }
        
        let html = '<div class="d-flex flex-wrap gap-2">';
        
        componentKeys.forEach(function(key) {
            const value = record[key];
            const label = key.replace(/([A-Z])/g, ' $1').trim();
            const displayValue = value === 1 || value === true ? 'Sim' : (value === 0 || value === false ? 'Não' : String(value || 'N/A'));
            
            html += '<span class="badge bg-secondary">' + escapeHtml(label) + ': ' + escapeHtml(displayValue) + '</span>';
        });
        
        html += '</div>';
        return html;
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
    
    
    // Formatar data/hora
    function formatDateTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString('pt-BR');
    }
    
    // Event listener para fechar banner de estruturas destruídas
    $('#destroyedStructuresAlert').on('close.bs.alert', function() {
        destroyedStructuresAlertClosed = true;
    });
    
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

