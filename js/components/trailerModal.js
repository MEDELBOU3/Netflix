// ============================================================================
// js/components/trailerModal.js
// Dedicated Official YouTube Trailer Popup Modal
// ============================================================================

import { tmdbService } from '../api/tmdb.js';
import { escapeHtml } from '../utils/dom.js';

export class TrailerModal {
    constructor() {
        this._ensureModalExists();
    }

    _ensureModalExists() {
        let modal = document.getElementById('trailer-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'trailer-modal';
            modal.className = 'custom-modal';
            document.body.appendChild(modal);
        }
        this.modal = modal;
    }

    async open(media) {
        this._ensureModalExists();
        if (!media) return;

        this.modal.innerHTML = `
            <div class="modal-backdrop-blur" id="trailer-backdrop-bg"></div>
            
            <div class="trailer-modal-box">
                <button type="button" class="modal-close-btn" id="trailer-close-btn" aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>

                <div class="trailer-video-wrap" id="trailer-video-frame">
                    <div style="display:grid; place-items:center; height:100%; color:#fff;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--brand-green, #10b981);"></i>
                    </div>
                </div>

                <div class="trailer-meta-footer">
                    <h2 class="trailer-title">${escapeHtml(media.title || media.name)} — Official Trailer</h2>
                </div>
            </div>
        `;

        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        document.getElementById('trailer-close-btn')?.addEventListener('click', () => this.close());
        document.getElementById('trailer-backdrop-bg')?.addEventListener('click', () => this.close());

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        const videoKey = await tmdbService.getTrailerVideoKey(media.id, media.media_type || 'movie');
        const frame = document.getElementById('trailer-video-frame');
        if (frame) {
            frame.innerHTML = `
                <iframe 
                    src="https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1" 
                    title="Trailer" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `;
        }
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove('active');
        this.modal.innerHTML = '';
        document.body.style.overflow = '';
    }
}