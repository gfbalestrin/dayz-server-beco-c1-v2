/**
 * Shared Common Utilities
 * Funções utilitárias básicas compartilhadas entre múltiplos arquivos
 */

/**
 * Escapar HTML para prevenir XSS
 * @param {string} text - Texto a ser escapado
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? text.toString().replace(/[&<>"']/g, m => map[m]) : '';
}

/**
 * Formatar data para exibição
 * @param {string} dateString - String de data ISO
 * @returns {string} Data formatada em pt-BR
 */
function formatDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';

    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formatar tempo decorrido
 * @param {string} startDate - Data de início
 * @returns {string} Tempo formatado (ex: "2h 30m")
 */
function formatElapsedTime(startDate) {
    if (!startDate) return '-';

    const start = new Date(startDate);
    const now = new Date();
    const diff = now - start;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}min`;
}

/**
 * Converter código de país para emoji de bandeira
 * @param {string} countryCode - Código de país (2 letras)
 * @returns {string} Emoji de bandeira
 */
function getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return '';
    }

    // Converter código de país para emoji de bandeira
    // Cada letra é convertida para seu equivalente em Regional Indicator Symbol
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));

    return String.fromCodePoint(...codePoints);
}

/**
 * Mostrar notificação toast
 * @param {string} title - Título da notificação
 * @param {string} message - Mensagem
 * @param {string} type - Tipo (success, error, warning, info)
 */
function showToast(title, message, type) {
    if (typeof toastr !== 'undefined') {
        toastr[type](message, title);
    } else {
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
}
