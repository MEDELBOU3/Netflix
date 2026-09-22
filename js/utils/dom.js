// ============================================================================
// js/utils/dom.js
// DOM Utilities, Date Formatters & String Helpers
// ============================================================================

import { APP_CONFIG } from '../config.js';

export function formatDate(dateString) {
    if (!dateString) return 'TBA';
    try {
        const year = dateString.split('-')[0];
        return year || 'TBA';
    } catch {
        return 'TBA';
    }
}

export function getGenreName(genreId) {
    return APP_CONFIG.genreMap[genreId] || '';
}

export function getPrimaryGenres(genreIds = [], limit = 2) {
    if (!Array.isArray(genreIds)) return '';
    return genreIds
        .map(id => getGenreName(id))
        .filter(Boolean)
        .slice(0, limit)
        .join(' • ');
}

export function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, match => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[match]));
}