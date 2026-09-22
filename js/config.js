// ============================================================================
// js/config.js
// CineJoy Application Configuration & TMDb Credentials
// ============================================================================

export const APP_CONFIG = Object.freeze({
    appName: 'CineJoy',
    defaultProviderId: 337, // Disney+ Watch Provider ID
    defaultRegion: 'US',
    itemsPerPage: 20,

    // Live TMDb v3 Credentials
    tmdb: {
        apiKey: '31280d77499208623732d77823eabcb4',
        baseUrl: 'https://api.themoviedb.org/3',
        imageBase: 'https://image.tmdb.org/t/p/w500',
        backdropBase: 'https://image.tmdb.org/t/p/original'
    },

    // Streaming Providers Directory
    providers: {
        337: {
            id: 337,
            name: 'Disney+',
            logo: 'https://image.tmdb.org/t/p/original/7rwgEs55tOXyYvdRdFiRp89IrAk.png',
            backdrop: 'https://image.tmdb.org/t/p/original/8YFL5QQVPy3AgrEQxNYVSgiPEbe.jpg',
            description: 'Stream exclusive Marvel blockbusters, Star Wars sagas, Disney Animation classics, Pixar features, and National Geographic in 4K HDR.',
            accentColor: '#00f0ff',
            totalTitlesEstimate: '1,480+'
        },
        8: {
            id: 8,
            name: 'Netflix',
            logo: 'https://image.tmdb.org/t/p/original/pbpMk2JmcoNnQwx5JGpXngfoWtp.png',
            backdrop: 'https://image.tmdb.org/t/p/original/mDeZp6a3vXv8P3L47t0g1C9zM6v.jpg',
            description: 'Stream unlimited original films, award-winning drama series, documentaries, and anime.',
            accentColor: '#e50914',
            totalTitlesEstimate: '3,800+'
        },
        9: {
            id: 9,
            name: 'Amazon Prime Video',
            logo: 'https://image.tmdb.org/t/p/original/emthp39XA2zhcoYLKJYnvG7WrSn.png',
            backdrop: 'https://image.tmdb.org/t/p/original/9yBVqNruk6Ykrwc32qrK2TIE5xw.jpg',
            description: 'Watch Prime Video Originals, blockbuster movies, and top-rated television shows.',
            accentColor: '#00a8e1',
            totalTitlesEstimate: '2,900+'
        }
    },

    // Genre ID Lookup
    genreMap: {
        28: 'Action',
        12: 'Adventure',
        16: 'Animation',
        35: 'Comedy',
        80: 'Crime',
        99: 'Documentary',
        18: 'Drama',
        10751: 'Family',
        14: 'Fantasy',
        36: 'History',
        27: 'Horror',
        10402: 'Music',
        9648: 'Mystery',
        10749: 'Romance',
        878: 'Sci-Fi',
        10770: 'TV Movie',
        53: 'Thriller',
        10752: 'War',
        37: 'Western',
        10759: 'Action & Adventure',
        10765: 'Sci-Fi & Fantasy'
    },

    storageKeys: {
        watchlist: 'cinejoy_user_watchlist_v1',
        history: 'cinejoy_search_history_v1',
        preferences: 'cinejoy_user_prefs_v1'
    }
});