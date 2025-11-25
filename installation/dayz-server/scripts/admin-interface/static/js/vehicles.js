$(document).ready(function() {
    let vehiclesTable;
    let currentVehicleId = null;
    let autoRefreshInterval = null;
    
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
                    // Converter explicitamente para string 'true'/'false' para garantir conversão correta
                    d.include_destroyed = $('#includeDestroyed').is(':checked') ? 'true' : 'false';
                    d.only_with_changes = $('#onlyWithChanges').is(':checked') ? 'true' : 'false';
                    d.date_from = $('#dateFrom').val() || null;
                    d.date_to = $('#dateTo').val() || null;
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
                    render: function(data) {
                        const count = parseInt(data || 0);
                        let badgeClass = 'bg-success';
                        let icon = '';
                        
                        if (count === 0) {
                            badgeClass = 'bg-secondary';
                        } else if (count >= 1 && count <= 2) {
                            badgeClass = 'bg-success';
                        } else if (count >= 3 && count <= 5) {
                            badgeClass = 'bg-warning';
                        } else if (count >= 6 && count <= 10) {
                            badgeClass = 'bg-warning text-dark';
                            icon = '<i class="fas fa-exclamation-triangle me-1"></i>';
                        } else {
                            badgeClass = 'bg-danger';
                            icon = '<i class="fas fa-exclamation-circle me-1"></i>';
                        }
                        
                        return '<span class="badge ' + badgeClass + '" title="Número de alterações significativas detectadas no histórico do veículo">' + 
                               icon + count + '</span>';
                    }
                },
                {
                    data: null,
                    orderable: false, // Não ordenável - coluna composta
                    render: function(data) {
                        const x = parseFloat(data.PositionX || 0).toFixed(2);
                        const y = parseFloat(data.PositionY || 0).toFixed(2);
                        const z = parseFloat(data.PositionZ || 0).toFixed(2);
                        return `X: ${x}<br>Y: ${y}<br>Z: ${z}`;
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
                    render: function(data, type, row) {
                        const vehicleId = escapeHtml(data);
                        const mapUrl = '/map?vehicle_id=' + encodeURIComponent(vehicleId);
                        return '<div class="btn-group" role="group">' +
                            '<button class="btn btn-sm btn-primary view-history-btn" data-vehicle-id="' + vehicleId + '">' +
                            '<i class="fas fa-history me-1"></i>Ver Histórico</button>' +
                            '<a href="' + mapUrl + '" class="btn btn-sm btn-info" title="Ver no Mapa">' +
                            '<i class="fas fa-map-marker-alt"></i></a>' +
                            '</div>';
                    }
                }
            ],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            order: [[6, 'desc']], // Ordenar por Última Atualização (coluna 6)
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
    function reloadTable() {
        if (vehiclesTable) {
            vehiclesTable.page('first');
            vehiclesTable.ajax.reload(null, false);
        }
    }
    
    // Event listeners para filtros
    $('#includeDestroyed, #onlyWithChanges, #dateFrom, #dateTo').on('change', function() {
        reloadTable();
    });
    
    $('#clearFilters').on('click', function() {
        $('#includeDestroyed').prop('checked', false);
        $('#onlyWithChanges').prop('checked', false);
        $('#dateFrom').val('');
        $('#dateTo').val('');
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
                reloadTable();
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
    
    // Event listener para botão de histórico (usando delegação)
    $(document).on('click', '.view-history-btn', function() {
        const vehicleId = $(this).data('vehicle-id');
        showVehicleHistory(vehicleId);
    });
    
    // Mostrar histórico do veículo
    function showVehicleHistory(vehicleId) {
        currentVehicleId = vehicleId;
        
        // Resetar estado de paginação
        historyState.currentPage = 1;
        historyState.totalPages = 1;
        historyState.totalRecords = 0;
        historyState.dateFrom = null;
        historyState.dateTo = null;
        
        // Limpar filtros
        $('#historyDateFrom').val('');
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
    
    // Renderizar timeline do histórico
    function renderHistoryTimeline(history) {
        const timeline = $('#historyTimeline');
        timeline.empty();
        
        if (history.length === 0) {
            timeline.html('<p class="text-muted">Nenhum registro de histórico encontrado.</p>');
            return;
        }
        
        // Filtrar registros duplicados: manter apenas quando há mudanças significativas
        // Como o histórico vem ordenado DESC (mais recente primeiro), sempre manter o primeiro
        const filteredHistory = [];
        
        for (let i = 0; i < history.length; i++) {
            const currentRecord = history[i];
            
            // Sempre incluir o primeiro registro (mais recente)
            if (i === 0) {
                filteredHistory.push(currentRecord);
                continue;
            }
            
            // Comparar com o último registro incluído (mais recente)
            // Como o histórico vem em DESC, lastIncluded é mais recente que currentRecord
            const lastIncluded = filteredHistory[filteredHistory.length - 1];
            
            // Comparar o mais recente (lastIncluded) com o mais antigo (currentRecord)
            // Se há mudanças significativas, incluir o registro mais antigo
            if (hasSignificantChanges(currentRecord, lastIncluded)) {
                filteredHistory.push(currentRecord);
            }
            // Se não há mudanças, pular (já temos o mais recente)
        }
        
        // Renderizar apenas os registros filtrados
        // O histórico vem em ordem DESC: [mais recente, ..., mais antigo]
        // Cada registro deve ser comparado com o PRÓXIMO na lista (mais antigo)
        // para mostrar as mudanças que aconteceram neste momento específico
        
        filteredHistory.forEach(function(record, index) {
            // Obter o próximo registro na lista (mais antigo)
            const nextRecord = index < filteredHistory.length - 1 ? filteredHistory[index + 1] : null;
            
            // Comparar este registro com o próximo (mais antigo) para detectar mudanças
            // Se há próximo registro, comparar para ver o que mudou DESSE registro PARA o próximo
            const hasChanges = nextRecord && hasSignificantChanges(record, nextRecord);
            const changeClass = hasChanges ? 'border-warning bg-light' : '';
            
            const recordHtml = `
                <div class="timeline-item mb-4 ${changeClass}" data-timestamp="${record.TimeStamp}">
                    <div class="d-flex">
                        <div class="timeline-marker me-3">
                            <div class="timeline-dot ${record.IsDestroyed == 1 ? 'bg-danger' : 'bg-primary'}"></div>
                            ${index < filteredHistory.length - 1 ? '<div class="timeline-line"></div>' : ''}
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
                                    ${nextRecord && hasSignificantChanges(record, nextRecord) ? 
                                        '<div class="alert alert-info mb-3"><i class="fas fa-info-circle me-2"></i><strong>Mudanças detectadas neste momento</strong></div>' : 
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
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-box me-2"></i>Items e Attachments</h6>
                                            ${renderItemsAndAttachmentsWithChanges(record, nextRecord)}
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
        const posThreshold = 0.1;
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
        let html = '';
        
        if (record.EngineHealth !== null && record.EngineHealth !== undefined) {
            const engineHealth = parseFloat(record.EngineHealth || 0) * 100;
            html += '<div class="mb-2"><small>Motor:</small> ' + 
                renderHealthBar(engineHealth) + '</div>';
        }
        
        if (record.BodyHealth !== null && record.BodyHealth !== undefined) {
            const bodyHealth = parseFloat(record.BodyHealth || 0) * 100;
            html += '<div class="mb-2"><small>Carroceria:</small> ' + 
                renderHealthBar(bodyHealth) + '</div>';
        }
        
        if (record.FuelTankHealth !== null && record.FuelTankHealth !== undefined) {
            const fuelHealth = parseFloat(record.FuelTankHealth || 0) * 100;
            html += '<div><small>Tanque:</small> ' + 
                renderHealthBar(fuelHealth) + '</div>';
        }
        
        return html || '<span class="text-muted">N/A</span>';
    }
    
    // Renderizar posição com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro (mais antigo, para comparação, pode ser null se for o último)
    function renderPositionWithChanges(prev, curr) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderPosition(prev);
        }
        
        const posThreshold = 0.1;
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
        
        let html = '<p class="mb-0">';
        
        if (xChanged) {
            const diff = x - currX; // Diferença do atual (recente) para o próximo (antigo)
            const arrow = diff > 0 ? '→' : '←';
            html += `X: <span class="change-modified">${x.toFixed(2)}</span> <small class="text-muted">(${arrow} ${Math.abs(diff).toFixed(2)})</small><br>`;
        } else {
            html += `X: ${x.toFixed(2)}<br>`;
        }
        
        if (yChanged) {
            const diff = y - currY;
            const arrow = diff > 0 ? '↑' : '↓';
            html += `Y: <span class="change-modified">${y.toFixed(2)}</span> <small class="text-muted">(${arrow} ${Math.abs(diff).toFixed(2)})</small><br>`;
        } else {
            html += `Y: ${y.toFixed(2)}<br>`;
        }
        
        if (zChanged) {
            const diff = z - currZ;
            const arrow = diff > 0 ? '↗' : '↘';
            html += `Z: <span class="change-modified">${z.toFixed(2)}</span> <small class="text-muted">(${arrow} ${Math.abs(diff).toFixed(2)})</small>`;
        } else {
            html += `Z: ${z.toFixed(2)}`;
        }
        
        html += '</p>';
        return html;
    }
    
    // Renderizar posição simples (sem comparação)
    function renderPosition(record) {
        const x = parseFloat(record.PositionX || 0).toFixed(2);
        const y = parseFloat(record.PositionY || 0).toFixed(2);
        const z = parseFloat(record.PositionZ || 0).toFixed(2);
        return `<p class="mb-0">X: ${x}<br>Y: ${y}<br>Z: ${z}</p>`;
    }
    
    // Renderizar seção de saúde com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro (mais antigo, para comparação, pode ser null se for o último)
    function renderHealthSectionWithChanges(prev, curr) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderHealthSection(prev);
        }
        
        let html = '';
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
                    changeIndicator = ` <small class="${colorClass}">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                }
            }
            
            html += '<div class="mb-2"><small>Motor:</small> ' + 
                renderHealthBar(engineHealth) + changeIndicator + '</div>';
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
                    changeIndicator = ` <small class="${colorClass}">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                }
            }
            
            html += '<div class="mb-2"><small>Carroceria:</small> ' + 
                renderHealthBar(bodyHealth) + changeIndicator + '</div>';
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
                    changeIndicator = ` <small class="${colorClass}">(${arrow} ${Math.abs(diff).toFixed(1)}%)</small>`;
                }
            }
            
            html += '<div><small>Tanque:</small> ' + 
                renderHealthBar(fuelHealth) + changeIndicator + '</div>';
        }
        
        return html || '<span class="text-muted">N/A</span>';
    }
    
    // Renderizar items e attachments com indicadores de mudança
    // prev = registro atual sendo renderizado (mais recente na timeline)
    // curr = próximo registro na lista (mais antigo, para comparação, pode ser null se for o último)
    function renderItemsAndAttachmentsWithChanges(prev, curr) {
        // Se não há próximo registro (curr é null), mostrar apenas o registro atual sem comparação
        if (!curr) {
            return renderItemsAndAttachments(prev);
        }
        
        // Verificar se algum registro é parcial
        const prevIsPartial = (prev.IsPartialUpdate || 0) === 1;
        const currIsPartial = (curr.IsPartialUpdate || 0) === 1;
        
        let html = '';
        
        // Se o registro atual é parcial, mostrar aviso
        if (prevIsPartial) {
            html += '<div class="alert alert-info mb-2">' +
                '<i class="fas fa-info-circle me-2"></i>' +
                '<small>Update parcial: items/attachments preservados do último registro completo</small>' +
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
            if (itemsDiff.added.length > 0 || itemsDiff.removed.length > 0 || (prev.items && prev.items.length > 0)) {
            html += '<div class="mb-2">';
            html += '<strong>Items (' + (prev.items ? prev.items.length : 0) + '):</strong><br>';
            html += '<div class="ms-2">';
            
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
            
            // Mostrar items removidos (estavam em curr mas não em prev = foram removidos entre curr e prev)
            sortedRemoved.forEach(function(item) {
                const health = item.item.ItemHealth !== null ? 
                    ' (' + parseFloat(item.item.ItemHealth || 0).toFixed(0) + '%)' : '';
                html += '<small class="change-removed">' +
                    '<i class="fas fa-minus-circle me-1"></i>' +
                    escapeHtml(item.type) + health + '</small><br>';
            });
            
            // Mostrar items inalterados (presentes em ambos)
            sortedUnchanged.forEach(function(item) {
                const health = item.prevItem.ItemHealth !== null ? 
                    ' (' + parseFloat(item.prevItem.ItemHealth || 0).toFixed(0) + '%)' : '';
                html += '<small>• ' + escapeHtml(item.type) + health + '</small><br>';
            });
            
            // Mostrar items adicionados (estavam em prev mas não em curr = foram adicionados entre curr e prev)
            sortedAdded.forEach(function(item) {
                const health = item.item.ItemHealth !== null ? 
                    ' (' + parseFloat(item.item.ItemHealth || 0).toFixed(0) + '%)' : '';
                html += '<small class="change-added">' +
                    '<i class="fas fa-plus-circle me-1"></i>' +
                    escapeHtml(item.type) + health + '</small><br>';
            });
            
            html += '</div></div>';
            }
            
            // Comparar attachments apenas se ambos forem completos
            // prev = registro atual sendo renderizado (mais recente)
            // curr = próximo registro (mais antigo, para comparação)
            // Invertemos a ordem para comparar do mais antigo (curr) para o mais recente (prev)
            // Isso mostra o que mudou DO curr (antigo) PARA o prev (recente)
            const attachmentsDiff = getAttachmentsDiff(curr.attachments || [], prev.attachments || []);
            
            // Mostrar attachments do registro atual (prev = mais recente), não do curr
            if (attachmentsDiff.added.length > 0 || attachmentsDiff.removed.length > 0 || (prev.attachments && prev.attachments.length > 0)) {
            html += '<div>';
            html += '<strong>Attachments (' + (prev.attachments ? prev.attachments.length : 0) + '):</strong><br>';
            html += '<div class="ms-2">';
            
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
            
            // Mostrar attachments removidos (estavam em curr mas não em prev = foram removidos entre curr e prev)
            sortedRemovedAtt.forEach(function(attachment) {
                const health = attachment.attachment.AttachmentHealth !== null ? 
                    ' (' + parseFloat(attachment.attachment.AttachmentHealth || 0).toFixed(0) + '%)' : '';
                html += '<small class="change-removed">' +
                    '<i class="fas fa-minus-circle me-1"></i>' +
                    escapeHtml(attachment.type) + health + '</small><br>';
            });
            
            // Mostrar attachments inalterados (presentes em ambos)
            sortedUnchangedAtt.forEach(function(attachment) {
                const health = attachment.prevAttachment.AttachmentHealth !== null ? 
                    ' (' + parseFloat(attachment.prevAttachment.AttachmentHealth || 0).toFixed(0) + '%)' : '';
                html += '<small>• ' + escapeHtml(attachment.type) + health + '</small><br>';
            });
            
            // Mostrar attachments adicionados (estavam em prev mas não em curr = foram adicionados entre curr e prev)
            sortedAddedAtt.forEach(function(attachment) {
                const health = attachment.attachment.AttachmentHealth !== null ? 
                    ' (' + parseFloat(attachment.attachment.AttachmentHealth || 0).toFixed(0) + '%)' : '';
                html += '<small class="change-added">' +
                    '<i class="fas fa-plus-circle me-1"></i>' +
                    escapeHtml(attachment.type) + health + '</small><br>';
            });
            
            html += '</div></div>';
            }
        } else if (!prevIsPartial) {
            // Se apenas prev é completo, mostrar items/attachments de prev sem comparação
            if (prev.items && prev.items.length > 0) {
                html += '<div class="mb-2">';
                html += '<strong>Items (' + prev.items.length + '):</strong><br>';
                html += '<div class="ms-2">';
                const sortedItems = prev.items.slice().sort(function(a, b) {
                    const typeA = (a.ItemType || '').toLowerCase();
                    const typeB = (b.ItemType || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                sortedItems.forEach(function(item) {
                    const health = item.ItemHealth !== null ? 
                        ' (' + parseFloat(item.ItemHealth || 0).toFixed(0) + '%)' : '';
                    html += '<small>• ' + escapeHtml(item.ItemType) + health + '</small><br>';
                });
                html += '</div></div>';
            }
            
            if (prev.attachments && prev.attachments.length > 0) {
                html += '<div>';
                html += '<strong>Attachments (' + prev.attachments.length + '):</strong><br>';
                html += '<div class="ms-2">';
                const sortedAttachments = prev.attachments.slice().sort(function(a, b) {
                    const typeA = (a.AttachmentType || '').toLowerCase();
                    const typeB = (b.AttachmentType || '').toLowerCase();
                    return typeA.localeCompare(typeB);
                });
                sortedAttachments.forEach(function(attachment) {
                    const health = attachment.AttachmentHealth !== null ? 
                        ' (' + parseFloat(attachment.AttachmentHealth || 0).toFixed(0) + '%)' : '';
                    html += '<small>• ' + escapeHtml(attachment.AttachmentType) + health + '</small><br>';
                });
                html += '</div></div>';
            }
        }
        
        if (!html) {
            html = '<span class="text-muted">Nenhum item ou attachment</span>';
        }
        
        return html;
    }
    
    // Renderizar items e attachments
    function renderItemsAndAttachments(record) {
        let html = '';
        
        if (record.items && record.items.length > 0) {
            html += '<div class="mb-2">';
            html += '<strong>Items (' + record.items.length + '):</strong><br>';
            html += '<div class="ms-2">';
            // Ordenar items alfabeticamente por ItemType
            const sortedItems = record.items.slice().sort(function(a, b) {
                const typeA = (a.ItemType || '').toLowerCase();
                const typeB = (b.ItemType || '').toLowerCase();
                return typeA.localeCompare(typeB);
            });
            sortedItems.forEach(function(item) {
                const health = item.ItemHealth !== null ? 
                    ' (' + parseFloat(item.ItemHealth || 0).toFixed(0) + '%)' : '';
                html += '<small>• ' + escapeHtml(item.ItemType) + health + '</small><br>';
            });
            html += '</div></div>';
        }
        
        if (record.attachments && record.attachments.length > 0) {
            html += '<div>';
            html += '<strong>Attachments (' + record.attachments.length + '):</strong><br>';
            html += '<div class="ms-2">';
            // Ordenar attachments alfabeticamente por AttachmentType
            const sortedAttachments = record.attachments.slice().sort(function(a, b) {
                const typeA = (a.AttachmentType || '').toLowerCase();
                const typeB = (b.AttachmentType || '').toLowerCase();
                return typeA.localeCompare(typeB);
            });
            sortedAttachments.forEach(function(attachment) {
                const health = attachment.AttachmentHealth !== null ? 
                    ' (' + parseFloat(attachment.AttachmentHealth || 0).toFixed(0) + '%)' : '';
                html += '<small>• ' + escapeHtml(attachment.AttachmentType) + health + '</small><br>';
            });
            html += '</div></div>';
        }
        
        if (!html) {
            html = '<span class="text-muted">Nenhum item ou attachment</span>';
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
    initDataTable();
});

