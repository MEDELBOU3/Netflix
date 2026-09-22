// ============================================================================
// js/utils/storage.js
// Real-time Watch Progress Tracker & Watchlist Persistence
// ============================================================================

import { APP_CONFIG } from '../config.js';

class StorageService {
    constructor() {
        this.watchlistKey = APP_CONFIG.storageKeys.watchlist;
        this.progressKey = 'cinejoy_watch_progress_v2';
        this._initSeedData();
    }

    _initSeedData() {
        // Seed initial active continue watching if storage is empty
        if (!localStorage.getItem(this.progressKey)) {
            const seed = [
                {
                    id: 60735,
                    title: 'The Flash',
                    media_type: 'tv',
                    backdrop_path: 'https://image.tmdb.org/t/p/original/mDeZp6a3vXv8P3L47t0g1C9zM6v.jpg',
                    season: 1,
                    episode: 8,
                    currentTime: 1320, // 22 minutes watched
                    duration: 2700,    // 45 minutes total episode
                    lastWatched: Date.now()
                }
            ];
            localStorage.setItem(this.progressKey, JSON.stringify(seed));
        }
    }

    /* ---------------- WATCH PROGRESS (CONTINUE WATCHING) ---------------- */
    getContinueWatching() {
        try {
            const raw = localStorage.getItem(this.progressKey);
            const items = raw ? JSON.parse(raw) : [];
            return items.sort((a, b) => b.lastWatched - a.lastWatched);
        } catch {
            return [];
        }
    }

    saveWatchProgress(item, currentTime = 600, duration = 3600, season = 1, episode = 1) {
        let list = this.getContinueWatching();
        const index = list.findIndex(x => x.id === item.id);

        const progressEntry = {
            id: item.id,
            title: item.title || item.name,
            media_type: item.media_type || 'movie',
            backdrop_path: item.backdrop_path || item.poster_path,
            poster_path: item.poster_path,
            season,
            episode,
            currentTime: Math.min(currentTime, duration),
            duration: duration || 3600,
            lastWatched: Date.now()
        };

        if (index > -1) {
            list[index] = progressEntry;
        } else {
            list.unshift(progressEntry);
        }

        // Keep maximum 12 items in Continue Watching history
        list = list.slice(0, 12);

        try {
            localStorage.setItem(this.progressKey, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('cinejoy:progress-updated', { detail: { items: list } }));
        } catch (err) {
            console.error('[StorageService] Error saving progress:', err);
        }
    }

    removeContinueWatching(id) {
        let list = this.getContinueWatching().filter(x => x.id !== Number(id));
        localStorage.setItem(this.progressKey, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('cinejoy:progress-updated', { detail: { items: list } }));
    }

    formatRemainingTime(currentTime, duration) {
        const remainingSeconds = Math.max(0, duration - currentTime);
        const minutes = Math.floor(remainingSeconds / 60);
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${remMinutes}m left`;
        }
        return `${minutes}m left`;
    }

    /* ---------------- WATCHLIST ---------------- */
    getWatchlist() {
        try {
            const raw = localStorage.getItem(this.watchlistKey);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    isInWatchlist(id) {
        return this.getWatchlist().some(item => item.id === Number(id));
    }

    toggleWatchlist(item) {
        let list = this.getWatchlist();
        const exists = list.some(x => x.id === item.id);

        if (exists) {
            list = list.filter(x => x.id !== item.id);
        } else {
            list.unshift({
                id: item.id,
                title: item.title,
                media_type: item.media_type,
                poster_path: item.poster_path,
                vote_average: item.vote_average,
                release_date: item.release_date,
                addedAt: Date.now()
            });
        }

        localStorage.setItem(this.watchlistKey, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('cinejoy:watchlist-changed', { detail: { count: list.length } }));
        return !exists;
    }
}

export const storageService = new StorageService();