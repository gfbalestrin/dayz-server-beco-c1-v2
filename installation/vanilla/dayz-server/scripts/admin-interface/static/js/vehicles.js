$(document).ready(function() {
    let vehiclesTable;
    let currentVehicleId = null;
    
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
                    d.date_from = $('#dateFrom').val() || null;
                    d.date_to = $('#dateTo').val() || null;
                    if (d.search && d.search.value) {
                        d.search = d.search.value;
                    } else {
                        d.search = null;
                    }
                },
                dataSrc: function(json) {
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
                    data: null,
                    render: function(data) {
                        const x = parseFloat(data.PositionX || 0).toFixed(2);
                        const y = parseFloat(data.PositionY || 0).toFixed(2);
                        const z = parseFloat(data.PositionZ || 0).toFixed(2);
                        return `X: ${x}<br>Y: ${y}<br>Z: ${z}`;
                    }
                },
                {
                    data: null,
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
                        return '<button class="btn btn-sm btn-primary view-history-btn" data-vehicle-id="' + 
                            escapeHtml(data) + '">' +
                            '<i class="fas fa-history me-1"></i>Ver Histórico</button>';
                    }
                }
            ],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            order: [[5, 'desc']],
            pageLength: 50,
            responsive: true,
            searchDelay: 500
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
    
    // Event listeners para filtros
    $('#includeDestroyed, #dateFrom, #dateTo').on('change', function() {
        if (vehiclesTable) {
            // Resetar para primeira página e recarregar dados do servidor
            vehiclesTable.page('first');
            vehiclesTable.ajax.reload(null, false); // false = manter página atual (já resetamos acima)
        }
    });
    
    $('#clearFilters').on('click', function() {
        $('#includeDestroyed').prop('checked', false);
        $('#dateFrom').val('');
        $('#dateTo').val('');
        if (vehiclesTable) {
            vehiclesTable.ajax.reload();
        }
    });
    
    // Event listener para botão de histórico (usando delegação)
    $(document).on('click', '.view-history-btn', function() {
        const vehicleId = $(this).data('vehicle-id');
        showVehicleHistory(vehicleId);
    });
    
    // Mostrar histórico do veículo
    function showVehicleHistory(vehicleId) {
        currentVehicleId = vehicleId;
        const modal = new bootstrap.Modal(document.getElementById('historyModal'));
        modal.show();
        
        $('#historyLoading').show();
        $('#historyContent').hide();
        $('#historyModalLabel').html('<i class="fas fa-history me-2"></i>Histórico: ' + escapeHtml(vehicleId));
        
        $.ajax({
            url: '/api/vehicles/' + encodeURIComponent(vehicleId) + '/history',
            type: 'GET',
            success: function(response) {
                if (response.success && response.history) {
                    renderHistoryTimeline(response.history);
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
            const lastIncluded = filteredHistory[filteredHistory.length - 1];
            
            // Se há mudanças significativas, incluir este registro
            if (hasSignificantChanges(currentRecord, lastIncluded)) {
                filteredHistory.push(currentRecord);
            }
            // Se não há mudanças, pular (já temos o mais recente)
        }
        
        // Renderizar apenas os registros filtrados
        let previousRecord = null;
        
        filteredHistory.forEach(function(record, index) {
            const hasChanges = previousRecord && hasSignificantChanges(previousRecord, record);
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
                                    </h6>
                                    ${record.IsDestroyed == 1 ? 
                                        '<span class="badge bg-danger">Destruído</span>' : 
                                        '<span class="badge bg-success">Ativo</span>'}
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-map-marker-alt me-2"></i>Posição</h6>
                                            <p class="mb-0">
                                                X: ${parseFloat(record.PositionX || 0).toFixed(2)}<br>
                                                Y: ${parseFloat(record.PositionY || 0).toFixed(2)}<br>
                                                Z: ${parseFloat(record.PositionZ || 0).toFixed(2)}
                                            </p>
                                        </div>
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-heartbeat me-2"></i>Saúde</h6>
                                            ${renderHealthSection(record)}
                                        </div>
                                        <div class="col-md-4">
                                            <h6><i class="fas fa-box me-2"></i>Items e Attachments</h6>
                                            ${renderItemsAndAttachments(record)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            timeline.append(recordHtml);
            previousRecord = record;
        });
    }
    
    // Verificar se há mudanças significativas
    function hasSignificantChanges(prev, curr) {
        const posThreshold = 0.1;
        const healthThreshold = 0.05; // 5% em formato decimal (valores vêm como 0.0 a 1.0)
        
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
        
        // Verificar mudança em items (quantidade ou conteúdo)
        const itemsChanged = itemsListChanged(prev.items || [], curr.items || []);
        
        // Verificar mudança em attachments (quantidade ou conteúdo)
        const attachmentsChanged = attachmentsListChanged(prev.attachments || [], curr.attachments || []);
        
        return statusChanged || posChanged || healthChanged || itemsChanged || attachmentsChanged;
    }
    
    // Comparar listas de items
    function itemsListChanged(prevItems, currItems) {
        if (prevItems.length !== currItems.length) {
            return true;
        }
        
        // Criar mapas para comparação
        const prevMap = {};
        prevItems.forEach(function(item) {
            const key = item.ItemType || '';
            const health = item.ItemHealth || 0;
            if (!prevMap[key]) {
                prevMap[key] = [];
            }
            prevMap[key].push(health);
        });
        
        const currMap = {};
        currItems.forEach(function(item) {
            const key = item.ItemType || '';
            const health = item.ItemHealth || 0;
            if (!currMap[key]) {
                currMap[key] = [];
            }
            currMap[key].push(health);
        });
        
        // Comparar chaves
        const prevKeys = Object.keys(prevMap).sort();
        const currKeys = Object.keys(currMap).sort();
        
        if (prevKeys.length !== currKeys.length) {
            return true;
        }
        
        for (let i = 0; i < prevKeys.length; i++) {
            if (prevKeys[i] !== currKeys[i]) {
                return true;
            }
            // Comparar quantidades de cada tipo
            if (prevMap[prevKeys[i]].length !== currMap[currKeys[i]].length) {
                return true;
            }
        }
        
        return false;
    }
    
    // Comparar listas de attachments
    function attachmentsListChanged(prevAttachments, currAttachments) {
        if (prevAttachments.length !== currAttachments.length) {
            return true;
        }
        
        // Criar mapas para comparação
        const prevMap = {};
        prevAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            const health = attachment.AttachmentHealth || 0;
            if (!prevMap[key]) {
                prevMap[key] = [];
            }
            prevMap[key].push(health);
        });
        
        const currMap = {};
        currAttachments.forEach(function(attachment) {
            const key = attachment.AttachmentType || '';
            const health = attachment.AttachmentHealth || 0;
            if (!currMap[key]) {
                currMap[key] = [];
            }
            currMap[key].push(health);
        });
        
        // Comparar chaves
        const prevKeys = Object.keys(prevMap).sort();
        const currKeys = Object.keys(currMap).sort();
        
        if (prevKeys.length !== currKeys.length) {
            return true;
        }
        
        for (let i = 0; i < prevKeys.length; i++) {
            if (prevKeys[i] !== currKeys[i]) {
                return true;
            }
            // Comparar quantidades de cada tipo
            if (prevMap[prevKeys[i]].length !== currMap[currKeys[i]].length) {
                return true;
            }
        }
        
        return false;
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
    
    // Renderizar items e attachments
    function renderItemsAndAttachments(record) {
        let html = '';
        
        if (record.items && record.items.length > 0) {
            html += '<div class="mb-2">';
            html += '<strong>Items (' + record.items.length + '):</strong><br>';
            html += '<div class="ms-2">';
            record.items.forEach(function(item) {
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
            record.attachments.forEach(function(attachment) {
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

