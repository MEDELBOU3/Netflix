// ============================================================================
// js/api/tmdb.js
// TMDb Data Service — Catalog, Detailed Credits, Providers & Recommendations
// ============================================================================

import { APP_CONFIG } from '../config.js';
import { MOCK_TITLES } from './mockData.js';

class TMDbService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Fetch titles matching a specific Watch Provider ID (e.g. Disney+ = 337)
     */
    async getTitlesByProvider(providerId = APP_CONFIG.defaultProviderId, filters = {}) {
        const { mediaType = 'all', genre = 'all', year = 'all', sort = 'popularity.desc', page = 1 } = filters;
        const cacheKey = `provider_${providerId}_${mediaType}_${genre}_${year}_${sort}_${page}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        if (!APP_CONFIG.tmdb.apiKey) {
            await new Promise(res => setTimeout(res, 200));
            const filtered = this._filterMockData(mediaType, genre, year, sort);
            const result = { page, results: filtered, total_results: filtered.length, total_pages: 1 };
            this.cache.set(cacheKey, result);
            return result;
        }

        try {
            const endpoint = mediaType === 'tv' ? 'discover/tv' : 'discover/movie';
            let url = `${APP_CONFIG.tmdb.baseUrl}/${endpoint}?api_key=${APP_CONFIG.tmdb.apiKey}&with_watch_providers=${providerId}&watch_region=${APP_CONFIG.defaultRegion}&sort_by=${sort}&page=${page}`;

            if (genre !== 'all') url += `&with_genres=${genre}`;
            if (year !== 'all') url += `&primary_release_year=${year}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const data = await response.json();
            const formatted = data.results.map(item => this._formatTMDbItem(item, mediaType === 'all' ? (item.title ? 'movie' : 'tv') : mediaType));
            
            const payload = { ...data, results: formatted };
            this.cache.set(cacheKey, payload);
            return payload;
        } catch (error) {
            console.warn('[TMDbService] Live request failed, using Mock Data fallback:', error);
            const filtered = this._filterMockData(mediaType, genre, year, sort);
            return { page: 1, results: filtered, total_results: filtered.length, total_pages: 1 };
        }
    }

    /**
     * Fetch Complete Title Details (Overview, Cast, Providers, Recommendations, Videos)
     */
    async getFullDetails(id, mediaType = 'movie') {
        const type = (mediaType === 'tv' || mediaType === 'show' || mediaType === 'series') ? 'tv' : 'movie';
        const cacheKey = `details_${type}_${id}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        if (!APP_CONFIG.tmdb.apiKey) {
            const mock = MOCK_TITLES.find(t => t.id === Number(id)) || MOCK_TITLES[0];
            return {
                ...mock,
                tagline: 'The ultimate cinematic experience.',
                runtime: 142,
                cast: [
                    { name: 'Robert Downey Jr.', character: 'Tony Stark / Iron Man', profile_path: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
                    { name: 'Chris Evans', character: 'Steve Rogers / Captain America', profile_path: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
                    { name: 'Scarlett Johansson', character: 'Natasha Romanoff', profile_path: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' }
                ],
                recommendations: MOCK_TITLES.filter(t => t.id !== Number(id))
            };
        }

        try {
            const url = `${APP_CONFIG.tmdb.baseUrl}/${type}/${id}?api_key=${APP_CONFIG.tmdb.apiKey}&append_to_response=credits,recommendations,videos,watch/providers`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch details');
            const data = await response.json();

            // Format Cast
            const cast = (data.credits?.cast || []).slice(0, 10).map(c => ({
                id: c.id,
                name: c.name,
                character: c.character,
                profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
            }));

            // Format Recommendations
            const recommendations = (data.recommendations?.results || []).slice(0, 10).map(item => this._formatTMDbItem(item, type));

            // Format Trailer Key
            const trailer = data.videos?.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));

            // Format Streaming Providers
            const usProviders = data['watch/providers']?.results?.US?.flatrate || [];
            const providers = usProviders.map(p => ({
                id: p.provider_id,
                name: p.provider_name,
                logo: `https://image.tmdb.org/t/p/w92${p.logo_path}`
            }));

            const result = {
                id: data.id,
                title: data.title || data.name,
                media_type: type,
                tagline: data.tagline || '',
                overview: data.overview || 'No synopsis available.',
                poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
                backdrop_path: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '',
                release_date: data.release_date || data.first_air_date || '2024',
                vote_average: Number((data.vote_average || 7.5).toFixed(1)),
                runtime: data.runtime || (data.episode_run_time ? data.episode_run_time[0] : 45) || 120,
                number_of_seasons: data.number_of_seasons || 1,
                genres: (data.genres || []).map(g => g.name),
                genre_ids: (data.genres || []).map(g => g.id),
                cast,
                providers,
                recommendations,
                trailer_key: trailer?.key || 'dQw4w9WgXcQ'
            };

            this.cache.set(cacheKey, result);
            return result;
        } catch (err) {
            console.error('[TMDbService] getFullDetails failed:', err);
            const mock = MOCK_TITLES.find(t => t.id === Number(id)) || MOCK_TITLES[0];
            return mock;
        }
    }

    /**
     * Search titles globally
     */
    async searchTitles(query) {
        if (!query || query.trim().length === 0) return [];
        const cleanQuery = query.toLowerCase().trim();

        if (!APP_CONFIG.tmdb.apiKey) {
            return MOCK_TITLES.filter(item => 
                item.title.toLowerCase().includes(cleanQuery) || 
                item.overview.toLowerCase().includes(cleanQuery)
            );
        }

        try {
            const url = `${APP_CONFIG.tmdb.baseUrl}/search/multi?api_key=${APP_CONFIG.tmdb.apiKey}&query=${encodeURIComponent(cleanQuery)}&include_adult=false`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            return data.results
                .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
                .map(item => this._formatTMDbItem(item, item.media_type));
        } catch {
            return MOCK_TITLES.filter(item => item.title.toLowerCase().includes(cleanQuery));
        }
    }


    /**
     * Get complete TMDb person profile.
     * Used by CastView when a cast member is opened.
     */
    async getPersonDetails(personId) {
        const id = Number(personId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid person ID');

        const cacheKey = `person_details_${id}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        if (!APP_CONFIG.tmdb.apiKey) {
            const mock = {
                id,
                name: 'Unknown',
                biography: '',
                birthday: null,
                deathday: null,
                place_of_birth: null,
                known_for_department: 'Acting',
                profile_path: '',
                popularity: 0,
                also_known_as: [],
                external_ids: {}
            };
            this.cache.set(cacheKey, mock);
            return mock;
        }

        try {
            const url =
                `${APP_CONFIG.tmdb.baseUrl}/person/${id}` +
                `?api_key=${APP_CONFIG.tmdb.apiKey}` +
                `&append_to_response=external_ids,images`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Person details failed: ${response.status}`);

            const data = await response.json();

            const result = {
                ...data,
                profile_path: data.profile_path
                    ? `https://image.tmdb.org/t/p/h632${data.profile_path}`
                    : '',
                images: {
                    profiles: (data.images?.profiles || []).map(image => ({
                        ...image,
                        file_path: image.file_path
                            ? `https://image.tmdb.org/t/p/w500${image.file_path}`
                            : ''
                    }))
                }
            };

            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error('[TMDbService] getPersonDetails failed:', error);
            throw error;
        }
    }

    /**
     * Get a person's complete movie + TV filmography.
     * Returns TMDb combined_credits in a CastView-friendly format.
     */
    async getPersonCombinedCredits(personId) {
        const id = Number(personId);
        if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid person ID');

        const cacheKey = `person_credits_${id}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        if (!APP_CONFIG.tmdb.apiKey) {
            const empty = [];
            this.cache.set(cacheKey, empty);
            return empty;
        }

        try {
            const url =
                `${APP_CONFIG.tmdb.baseUrl}/person/${id}/combined_credits` +
                `?api_key=${APP_CONFIG.tmdb.apiKey}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Person credits failed: ${response.status}`);

            const data = await response.json();

            const credits = [
                ...(data.cast || []).map(item => ({
                    ...item,
                    credit_type: 'cast',
                    character: item.character || '',
                    media_type: item.media_type || (item.title ? 'movie' : 'tv'),
                    title: item.title || item.name || 'Untitled',
                    poster_path: item.poster_path
                        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                        : ''
                })),
                ...(data.crew || []).map(item => ({
                    ...item,
                    credit_type: 'crew',
                    job: item.job || '',
                    department: item.department || '',
                    media_type: item.media_type || (item.title ? 'movie' : 'tv'),
                    title: item.title || item.name || 'Untitled',
                    poster_path: item.poster_path
                        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                        : ''
                }))
            ];

            credits.sort((a, b) => {
                const dateA = a.release_date || a.first_air_date || '';
                const dateB = b.release_date || b.first_air_date || '';
                return String(dateB).localeCompare(String(dateA));
            });

            this.cache.set(cacheKey, credits);
            return credits;
        } catch (error) {
            console.error('[TMDbService] getPersonCombinedCredits failed:', error);
            throw error;
        }
    }

    /**
     * Convenience alias used by some CastView integrations.
     */
    async getPerson(id) {
        return this.getPersonDetails(id);
    }

    /**
     * Convenience alias for combined movie + TV credits.
     */
    async getCombinedCredits(id) {
        return this.getPersonCombinedCredits(id);
    }


    /**
     * Get YouTube trailer key
     */
    async getTrailerVideoKey(id, mediaType = 'movie') {
        const type = (mediaType === 'tv' || mediaType === 'show' || mediaType === 'series') ? 'tv' : 'movie';
        const foundMock = MOCK_TITLES.find(t => t.id === Number(id));
        if (foundMock?.trailer_key) return foundMock.trailer_key;

        if (!APP_CONFIG.tmdb.apiKey) return 'dQw4w9WgXcQ';

        try {
            const url = `${APP_CONFIG.tmdb.baseUrl}/${type}/${id}/videos?api_key=${APP_CONFIG.tmdb.apiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            const trailer = data.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
            return trailer?.key || 'dQw4w9WgXcQ';
        } catch {
            return 'dQw4w9WgXcQ';
        }
    }

    _filterMockData(mediaType, genre, year, sort) {
        let list = [...MOCK_TITLES];
        if (mediaType !== 'all') list = list.filter(item => item.media_type === mediaType);
        if (genre !== 'all') list = list.filter(item => item.genre_ids.includes(Number(genre)));
        if (year !== 'all') list = list.filter(item => item.release_date.startsWith(String(year)));

        if (sort === 'vote_average.desc') {
            list.sort((a, b) => b.vote_average - a.vote_average);
        } else if (sort === 'title.asc') {
            list.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            list.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
        }
        return list;
    }

    _formatTMDbItem(item, type) {
        const backdrop = item.backdrop_path 
            ? (item.backdrop_path.startsWith('http') ? item.backdrop_path : `https://image.tmdb.org/t/p/original${item.backdrop_path}`)
            : (item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/original${item.poster_path}`) : '');
        
        const poster = item.poster_path
            ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`)
            : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500';

        return {
            id: item.id,
            title: item.title || item.name || 'Untitled',
            media_type: type,
            poster_path: poster,
            backdrop_path: backdrop,
            release_date: item.release_date || item.first_air_date || '2024',
            vote_average: Number((item.vote_average || 7.5).toFixed(1)),
            genre_ids: item.genre_ids || [],
            overview: item.overview || 'No synopsis available.'
        };
    }
}

export const tmdbService = new TMDbService();