// ============================================================================
// js/components/mediaGrid.js
// Responsive Grid Renderer & Skeleton Loader Generator
// ============================================================================

import { createMediaCard } from './mediaCard.js';

export class MediaGrid {
    constructor(containerId = 'media-grid') {
        this.container = document.getElementById(containerId);
    }

    showSkeletons(count = 12) {
        if (!this.container) return;
        this.container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'card-skeleton';
            this.container.appendChild(skeleton);
        }
    }

    render(items = [], append = false) {
        if (!this.container) return;
        
        if (!append) {
            this.container.innerHTML = '';
        }

        if (items.length === 0 && !append) {
            this.container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #838896;">
                    <i class="fa-solid fa-film" style="font-size: 2.5rem; margin-bottom: 12px; color: #393e56;"></i>
                    <h3 style="color: #fff; margin-bottom: 6px;">No titles found</h3>
                    <p style="font-size: 0.9rem;">Try adjusting your genre, year, or search filters.</p>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const cardNode = createMediaCard(item);
            fragment.appendChild(cardNode);
        });

        this.container.appendChild(fragment);
    }
}