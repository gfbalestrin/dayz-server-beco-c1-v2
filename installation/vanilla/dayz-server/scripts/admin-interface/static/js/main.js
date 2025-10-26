/**
 * JavaScript customizado para DayZ Admin Interface
 */

// Configuração global do DataTables
$.extend(true, $.fn.dataTable.defaults, {
    language: {
        "sEmptyTable": "Nenhum registro encontrado",
        "sInfo": "Mostrando de _START_ até _END_ de _TOTAL_ registros",
        "sInfoEmpty": "Mostrando 0 até 0 de 0 registros",
        "sInfoFiltered": "(Filtrado de _MAX_ registros no total)",
        "sInfoPostFix": "",
        "sInfoThousands": ".",
        "sLengthMenu": "_MENU_ resultados por página",
        "sLoadingRecords": "Carregando...",
        "sProcessing": "Processando...",
        "sZeroRecords": "Nenhum registro encontrado",
        "oPaginate": {
            "sFirst": "Primeiro",
            "sPrevious": "Anterior",
            "sNext": "Próximo",
            "sLast": "Último"
        },
        "oAria": {
            "sSortAscending": ": Ordenar colunas de forma ascendente",
            "sSortDescending": ": Ordenar colunas de forma descendente"
        }
    },
    pageLength: 25,
    lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Todos"]],
    responsive: true,
    autoWidth: false,
    order: []
});

// Função para aplicar máscara de data nos inputs
function applyDateFilter(tableId) {
    const table = $(`#${tableId}`).DataTable();
    
    // Adicionar input de filtro de data
    $('#dateFilterStart, #dateFilterEnd').on('change', function() {
        const start = $('#dateFilterStart').val();
        const end = $('#dateFilterEnd').val();
        
        if (start || end) {
            $.fn.dataTable.ext.search.push(
                function(settings, data, dataIndex) {
                    const dateStr = data[4] || data[5] || data[6]; // Adaptar conforme coluna de data
                    if (!dateStr) return false;
                    
                    const date = new Date(dateStr);
                    const startDate = start ? new Date(start) : null;
                    const endDate = end ? new Date(end) : null;
                    
                    if (startDate && date < startDate) return false;
                    if (endDate && date > endDate) return false;
                    
                    return true;
                }
            );
        } else {
            $.fn.dataTable.ext.search.pop();
        }
        
        table.draw();
    });
}

// Função para exportar tabela para CSV
function exportToCSV(tableId, filename) {
    const table = $(`#${tableId}`).DataTable();
    const data = table.rows({search: 'applied'}).data();
    
    let csv = '';
    
    // Cabeçalho
    table.columns().every(function() {
        csv += this.header().textContent + ',';
    });
    csv = csv.slice(0, -1) + '\n';
    
    // Dados
    data.each(function(row) {
        let rowData = '';
        $(row).each(function() {
            let cell = $(this).text();
            cell = cell.replace(/"/g, '""');
            rowData += '"' + cell + '",';
        });
        csv += rowData.slice(0, -1) + '\n';
    });
    
    // Criar download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// Função para mostrar loading
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    }
}

// Função para mostrar toast/notificação
function showToast(message, type = 'info') {
    const toast = $(`
        <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `);
    
    const toastContainer = $('.toast-container');
    if (toastContainer.length === 0) {
        $('body').append('<div class="toast-container position-fixed bottom-0 end-0 p-3"></div>');
    }
    
    toast.appendTo('.toast-container');
    const bsToast = new bootstrap.Toast(toast[0]);
    bsToast.show();
    
    toast.on('hidden.bs.toast', function() {
        toast.remove();
    });
}

// Atualização automática de dados (opcional)
let autoRefreshInterval = null;

function startAutoRefresh(url, interval = 60000) {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(function() {
        $.get(url, function(data) {
            // Implementar atualização de dados
            console.log('Atualizando dados...');
        });
    }, interval);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Validação de formulários
function validateDateRange(startDate, endDate) {
    if (startDate && endDate) {
        return new Date(startDate) <= new Date(endDate);
    }
    return true;
}

// Função para copiar texto para clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showToast('Copiado para a área de transferência!', 'success');
    }, function() {
        showToast('Erro ao copiar', 'danger');
    });
}

// Adicionar listeners de evento quando o documento estiver pronto
$(document).ready(function() {
    // Tooltips do Bootstrap
    $('[data-bs-toggle="tooltip"]').tooltip();
    
    // Popovers do Bootstrap
    $('[data-bs-toggle="popover"]').popover();
    
    // Confirmar ação de sair
    $('a[href="logout"]').on('click', function(e) {
        if (!confirm('Deseja realmente sair?')) {
            e.preventDefault();
        }
    });
    
    console.log('DayZ Admin Interface - JavaScript carregado');
});
