/**
 * Shared Player Utilities
 * Funções auxiliares para exibição de informações de jogador
 * Depende de: shared-common.js
 */

/**
 * Atualizar contador de caracteres
 * @param {string} textareaId - ID do textarea (com #)
 * @param {string} counterId - ID do contador (com #)
 * @param {number} maxLength - Limite máximo de caracteres
 */
function updateCharacterCount(textareaId, counterId, maxLength) {
    const textarea = $(textareaId);
    const counter = $(counterId);
    const currentLength = textarea.val().length;
    counter.text(currentLength);

    // Adicionar classe de aviso se estiver próximo do limite
    if (currentLength > maxLength * 0.9) {
        counter.addClass('text-warning');
    } else {
        counter.removeClass('text-warning');
    }

    // Adicionar classe de perigo se exceder o limite
    if (currentLength >= maxLength) {
        counter.addClass('text-danger fw-bold');
    } else {
        counter.removeClass('text-danger fw-bold');
    }
}

/**
 * Copiar Player ID para clipboard
 * @param {string} playerId - ID do jogador
 */
function copyPlayerId(playerId) {
    document.getElementById('playerIdToCopy').textContent = playerId;
    $('#copyPlayerIdModal').modal('show');

    $('#copyPlayerIdBtn').off('click').on('click', function() {
        navigator.clipboard.writeText(playerId).then(function() {
            const btn = $('#copyPlayerIdBtn');
            const originalHtml = btn.html();
            btn.html('<i class="fas fa-check me-2"></i>Copiado!');
            btn.removeClass('btn-primary').addClass('btn-success');

            setTimeout(function() {
                btn.html(originalHtml);
                btn.removeClass('btn-success').addClass('btn-primary');
            }, 2000);
        });
    });
}

/**
 * Criar link para mapa externo
 * @param {number} coordX - Coordenada X
 * @param {number} coordY - Coordenada Y
 * @returns {string} HTML do link
 */
function createMapLink(coordX, coordY) {
    if (!coordX || !coordY) return '<span class="text-muted">-</span>';
    const url = `https://dayz.xam.nu/#location=${coordX};${coordY};5`;
    return `<a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fas fa-map-marked-alt me-1"></i>Ver Mapa</a>`;
}

/**
 * Criar link para perfil Steam
 * @param {string} steamId - Steam ID
 * @param {string} steamName - Nome Steam
 * @returns {string} HTML do link
 */
function createSteamLink(steamId, steamName) {
    if (!steamId || !steamName) return '<span class="text-muted">-</span>';
    const url = `https://steamcommunity.com/profiles/${steamId}`;
    return `<a href="${url}" target="_blank">${escapeHtml(steamName)}</a>`;
}

/**
 * Escapar aspas para uso em atributos JavaScript inline
 * @param {string} str - String a escapar
 * @returns {string} String escapada
 */
function escapeJsString(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
