// ============================================================================
// js/components/heroBanner.js
// Provider Hero Banner Component
// ============================================================================

import { APP_CONFIG } from '../config.js';
import { escapeHtml } from '../utils/dom.js';

export class HeroBanner {
    constructor() {
        this.backdropEl = document.getElementById('hero-backdrop');
        this.logoEl = document.getElementById('provider-logo');
        this.titleEl = document.getElementById('provider-title');
        this.descEl = document.getElementById('provider-desc');
        this.statTitlesEl = document.getElementById('stat-total-titles');
    }

    updateProvider(providerId = APP_CONFIG.defaultProviderId, customStats = null) {
        const provider = APP_CONFIG.providers[providerId] || APP_CONFIG.providers[APP_CONFIG.defaultProviderId];

        if (this.backdropEl && provider.backdrop) {
            this.backdropEl.style.backgroundImage = `url('${provider.backdrop}')`;
        }

        if (this.logoEl && provider.logo) {
            this.logoEl.src = provider.logo;
            this.logoEl.alt = `${provider.name} Logo`;
        }

        if (this.titleEl) {
            this.titleEl.textContent = `${provider.name} Streaming Catalog`;
        }

        if (this.descEl) {
            this.descEl.textContent = provider.description;
        }

        if (this.statTitlesEl) {
            this.statTitlesEl.textContent = customStats?.total 
                ? `${customStats.total.toLocaleString()}+` 
                : provider.totalTitlesEstimate;
        }
    }
}