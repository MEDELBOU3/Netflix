// ============================================================================
// js/components/tvEpisodes.js
// TV Show Seasons & Episode Carousel with Side Arrow Navigation
// ============================================================================

import { APP_CONFIG } from '../config.js';
import { storageService } from '../utils/storage.js';
import { formatDate, escapeHtml } from '../utils/dom.js';

export class TvEpisodesManager {
    constructor(onPlayEpisode) {
        this.onPlayEpisode = onPlayEpisode;
        this.currentTvId = null;
        this.currentSeason = 1;
        this.tvData = null;
        this.seasonsCache = new Map();
    }

    async renderSeasonsSection(container, tvData) {
        if (!container || !tvData || tvData.media_type !== 'tv') return;
        this.tvData = tvData;
        this.currentTvId = tvData.id;
        this.currentSeason = 1;

        const totalSeasons = tvData.number_of_seasons || 1;

        const section = document.createElement('section');
        section.className = 'detail-sub-section container';
        section.id = 'tv-episodes-section';

        section.innerHTML = `
            <div class="episodes-header-row">
                <div class="episodes-title-box">
                    <h2 class="detail-section-title" style="margin-bottom:0;">Episodes</h2>
                    <span class="episodes-count" id="episodes-count-text">Season 1</span>
                </div>

                <div class="season-select-wrapper">
                    <i class="fa-solid fa-layer-group season-select-icon"></i>
                    <select class="season-dropdown" id="season-dropdown">
                        ${Array.from({ length: totalSeasons }, (_, i) => `
                            <option value="${i + 1}" ${i === 0 ? 'selected' : ''}>Season ${i + 1}</option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <!-- Episodes Carousel Wrap with Side Navigation Arrows -->
            <div class="carousel-container-wrap">
                <button type="button" class="carousel-arrow-btn prev-btn" id="episodes-prev-btn" aria-label="Previous Episodes">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>

                <div class="episodes-carousel-row" id="episodes-grid-container">
                    <div class="episodes-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        <span>Loading season episodes...</span>
                    </div>
                </div>

                <button type="button" class="carousel-arrow-btn next-btn" id="episodes-next-btn" aria-label="Next Episodes">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;

        container.appendChild(section);

        // Bind Carousel Side Arrows
        const grid = section.querySelector('#episodes-grid-container');
        const prevBtn = section.querySelector('#episodes-prev-btn');
        const nextBtn = section.querySelector('#episodes-next-btn');

        prevBtn?.addEventListener('click', () => {
            grid.scrollBy({ left: -(grid.clientWidth * 0.75), behavior: 'smooth' });
        });

        nextBtn?.addEventListener('click', () => {
            grid.scrollBy({ left: grid.clientWidth * 0.75, behavior: 'smooth' });
        });

        // Update Arrow Disabled States on Scroll
        grid?.addEventListener('scroll', () => {
            if (!prevBtn || !nextBtn) return;
            const maxScroll = grid.scrollWidth - grid.clientWidth - 5;
            prevBtn.style.opacity = grid.scrollLeft <= 5 ? '0' : '1';
            prevBtn.style.pointerEvents = grid.scrollLeft <= 5 ? 'none' : 'auto';
            nextBtn.style.opacity = grid.scrollLeft >= maxScroll ? '0' : '1';
            nextBtn.style.pointerEvents = grid.scrollLeft >= maxScroll ? 'none' : 'auto';
        });

        // Bind Season Dropdown
        const dropdown = section.querySelector('#season-dropdown');
        dropdown?.addEventListener('change', async (e) => {
            this.currentSeason = Number(e.target.value);
            const countEl = document.getElementById('episodes-count-text');
            if (countEl) countEl.textContent = `Season ${this.currentSeason}`;
            await this.loadSeasonEpisodes(this.currentSeason);
        });

        await this.loadSeasonEpisodes(1);
    }

    async loadSeasonEpisodes(seasonNumber = 1) {
        const grid = document.getElementById('episodes-grid-container');
        if (!grid) return;

        const cacheKey = `tv_${this.currentTvId}_season_${seasonNumber}`;
        if (this.seasonsCache.has(cacheKey)) {
            this._renderEpisodeCards(grid, this.seasonsCache.get(cacheKey));
            return;
        }

        grid.innerHTML = `
            <div class="episodes-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Loading Season ${seasonNumber} episodes...</span>
            </div>
        `;

        try {
            let episodes = [];

            if (APP_CONFIG.tmdb.apiKey) {
                const url = `${APP_CONFIG.tmdb.baseUrl}/tv/${this.currentTvId}/season/${seasonNumber}?api_key=${APP_CONFIG.tmdb.apiKey}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    episodes = data.episodes || [];
                }
            }

            if (episodes.length === 0) {
                episodes = Array.from({ length: 8 }, (_, i) => ({
                    id: `${this.currentTvId}_s${seasonNumber}_e${i + 1}`,
                    episode_number: i + 1,
                    season_number: seasonNumber,
                    name: `Episode ${i + 1}`,
                    overview: `Follow the gripping events as the story unfolds in Season ${seasonNumber}, Episode ${i + 1}.`,
                    still_path: this.tvData.backdrop_path,
                    runtime: 52,
                    air_date: this.tvData.release_date
                }));
            }

            this.seasonsCache.set(cacheKey, episodes);
            this._renderEpisodeCards(grid, episodes);
        } catch (err) {
            console.error('[TvEpisodesManager] Failed to load episodes:', err);
            grid.innerHTML = `<div style="color:var(--text-muted); padding:20px 0;">Could not load episodes for Season ${seasonNumber}.</div>`;
        }
    }

    _renderEpisodeCards(container, episodes) {
        const progressList = storageService.getContinueWatching();
        const currentProgress = progressList.find(x => x.id === this.tvData.id);

        container.innerHTML = episodes.map(ep => {
            const thumbUrl = ep.still_path 
                ? (ep.still_path.startsWith('http') ? ep.still_path : `https://image.tmdb.org/t/p/w500${ep.still_path}`)
                : this.tvData.backdrop_path;

            const isCurrentWatching = currentProgress && currentProgress.season === ep.season_number && currentProgress.episode === ep.episode_number;
            const percent = isCurrentWatching ? Math.min(100, Math.round((currentProgress.currentTime / currentProgress.duration) * 100)) : 0;
            const runtime = ep.runtime ? `${ep.runtime}m` : '26m';

            return `
                <div class="ep-card" data-episode="${ep.episode_number}" data-season="${ep.season_number}">
                    <div class="ep-thumb-wrap">
                        <img src="${thumbUrl}" alt="${escapeHtml(ep.name)}" class="ep-thumb-img" loading="lazy" onerror="this.src='${this.tvData.backdrop_path}';">
                        
                        <span class="ep-badge-num">E${ep.episode_number}</span>
                        <span class="ep-badge-time">${runtime}</span>
                        
                        <div class="ep-play-overlay"><i class="fa-solid fa-play"></i></div>
                        ${percent > 0 ? `<div class="continue-progress-bar"><div class="progress-fill" style="width:${percent}%;"></div></div>` : ''}
                    </div>

                    <div class="ep-info-box">
                        <h4 class="ep-title" title="${escapeHtml(ep.name)}">${escapeHtml(ep.name)}</h4>
                        <p class="ep-overview">${escapeHtml(ep.overview || 'No synopsis provided for this episode.')}</p>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.ep-card').forEach(card => {
            card.addEventListener('click', () => {
                const epNumber = Number(card.dataset.episode);
                const seasonNumber = Number(card.dataset.season);
                const epData = episodes.find(e => e.episode_number === epNumber);

                if (typeof this.onPlayEpisode === 'function') {
                    this.onPlayEpisode({
                        ...this.tvData,
                        selectedSeason: seasonNumber,
                        selectedEpisode: epNumber,
                        episodeTitle: epData?.name || `Episode ${epNumber}`
                    });
                }
            });
        });
    }
}