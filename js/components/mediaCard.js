// ============================================================================
// js/components/mediaCard.js
// 2:3 Aspect-Ratio Media Card Component with Hover Overlays
// ============================================================================

import { formatDate, getPrimaryGenres, escapeHtml } from '../utils/dom.js';
import { storageService } from '../utils/storage.js';

export function createMediaCard(item) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.id = item.id;
    card.dataset.type = item.media_type || 'movie';

    const isSaved = storageService.isInWatchlist(item.id);
    const genres = getPrimaryGenres(item.genre_ids);
    const releaseYear = formatDate(item.release_date);

    card.innerHTML = `
        <div class="media-poster-wrap">
            <img 
                src="${escapeHtml(item.poster_path)}" 
                alt="${escapeHtml(item.title)}" 
                class="media-poster-img"
                loading="lazy"
                onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500';"
            >

            <!-- Floating Top Badges -->
            <div class="card-top-badges">
                <span class="badge-quality">${escapeHtml(item.quality || '4K UHD')}</span>
                <span class="badge-rating"><i class="fa-solid fa-star"></i> ${item.vote_average || '7.5'}</span>
            </div>

            <!-- Hover Action Overlay -->
            <div class="card-hover-overlay">
                <button type="button" class="quick-play-btn" data-action="play-trailer" data-id="${item.id}" data-type="${item.media_type}" aria-label="Play Trailer">
                    <i class="fa-solid fa-play"></i>
                </button>

                <div class="card-action-bar">
                    <span style="font-size:0.75rem; color:#d1d5db; font-weight:600;">${escapeHtml(genres)}</span>
                    <button type="button" class="card-bookmark-btn ${isSaved ? 'saved' : ''}" data-action="toggle-watchlist" data-id="${item.id}" title="Add to Watchlist">
                        <i class="fa-solid fa-bookmark"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Bottom Metadata -->
        <div class="card-details">
            <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            <div class="card-sub-info">
                <span>${releaseYear}</span>
                <span style="text-transform: uppercase;">${escapeHtml(item.media_type === 'tv' ? 'Series' : 'Movie')}</span>
            </div>
        </div>
    `;

    // Bind Bookmark Click
    const bookmarkBtn = card.querySelector('[data-action="toggle-watchlist"]');
    bookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const savedNow = storageService.toggleWatchlist(item);
        bookmarkBtn.classList.toggle('saved', savedNow);
    });

    return card;
}