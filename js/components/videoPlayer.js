// ============================================================================
// js/components/videoPlayer.js
// Multi-Source Streaming Video Player with 4K-Capable Server Switcher
// ============================================================================

import { tmdbService } from '../api/tmdb.js';
import { storageService } from '../utils/storage.js';
import { escapeHtml } from '../utils/dom.js';
import { getUserSettings } from './settingsView.js';

export class VideoPlayerModal {
  constructor() {
    this.modal = document.getElementById('trailer-modal');
    this.videoContainer = document.getElementById('modal-video-container');
    this.infoBody = document.getElementById('modal-info-body');
    this.closeBtn = document.getElementById('modal-close-btn');

    // Default from user settings or first high-quality server
    const settings = getUserSettings();
    this.currentSource = settings.primaryServer || 'vidsrc';
    this.activeMedia = null;

    this._bindEvents();
  }

  // ─── Server catalogue ──────────────────────────────────────────────────────
  // flag 4K for sources that commonly deliver higher bitrates
  static SERVERS = [
    {
      id: 'vidsrc',
      name: 'VidSrc',
      label: 'Server 1',
      icon: 'fa-server',
      quality: '4K',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
          : `https://vidsrc.to/embed/movie/${id}`
    },
    {
      id: 'vidsrcpro',
      name: 'VidSrc Pro',
      label: 'Server 2',
      icon: 'fa-bolt',
      quality: '4K',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
          : `https://vidsrc.pro/embed/movie/${id}`
    },
    {
      id: 'autoembed',
      name: 'AutoEmbed',
      label: 'Server 3',
      icon: 'fa-cloud',
      quality: '1080p',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`
          : `https://player.autoembed.cc/embed/movie/${id}`
    },
    {
      id: 'multiembed',
      name: 'MultiEmbed',
      label: 'Server 4',
      icon: 'fa-shield-halved',
      quality: '4K',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`
          : `https://multiembed.mov/?video_id=${id}&tmdb=1`
    },
    {
      id: '2embed',
      name: '2Embed',
      label: 'Server 5',
      icon: 'fa-play',
      quality: '1080p',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
          : `https://www.2embed.cc/embed/${id}`
    },
    {
      id: 'smashy',
      name: 'SmashyStream',
      label: 'Server 6',
      icon: 'fa-fire',
      quality: '4K',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://player.smashystream.com/tv/${id}?s=${s}&e=${e}`
          : `https://player.smashystream.com/movie/${id}`
    },
    {
      id: 'vidlink',
      name: 'VidLink',
      label: 'Server 7',
      icon: 'fa-link',
      quality: '4K',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://vidlink.pro/tv/${id}/${s}/${e}`
          : `https://vidlink.pro/movie/${id}`
    },
    {
      id: 'embedsu',
      name: 'Embed.su',
      label: 'Server 8',
      icon: 'fa-globe',
      quality: '1080p',
      build: (id, type, s, e) =>
        type === 'tv'
          ? `https://embed.su/embed/tv/${id}/${s}/${e}`
          : `https://embed.su/embed/movie/${id}`
    },
    {
      id: 'trailer',
      name: 'YouTube Trailer',
      label: 'Trailer',
      icon: 'fa-brands fa-youtube',
      quality: '4K',
      build: null // special handling
    }
  ];

  _getServer(id) {
    return VideoPlayerModal.SERVERS.find(s => s.id === id) || VideoPlayerModal.SERVERS[0];
  }

  _getSourceName(id) {
    const s = this._getServer(id);
    return `${s.name}${s.quality === '4K' ? ' · 4K' : ''}`;
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  _bindEvents() {
    this.closeBtn?.addEventListener('click', () => this.close());
    this.modal?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop-blur') || e.target === this.modal) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal?.hasAttribute('open')) {
        this.close();
      }
    });
  }

  // ─── Open ──────────────────────────────────────────────────────────────────
  async open(media, requestedSource = null) {
    if (!this.modal || !media) return;
    this.activeMedia = media;

    // Prefer user setting if no explicit request
    if (requestedSource) {
      this.currentSource = requestedSource;
    } else {
      const settings = getUserSettings();
      this.currentSource = settings.primaryServer || 'vidsrc';
    }

    const isTv = media.media_type === 'tv';
    const season = media.selectedSeason || 1;
    const episode = media.selectedEpisode || 1;

    // Save to Continue Watching
    const duration = isTv ? 2700 : 7200;
    storageService.saveWatchProgress(media, 720, duration, season, episode);

    this.modal.showModal();
    this._renderPlayerControls(media, season, episode);
    await this._loadStream(media, season, episode);
  }

  // ─── Controls UI ───────────────────────────────────────────────────────────
  _renderPlayerControls(media, season, episode) {
    const isTv = media.media_type === 'tv';
    const titleSuffix = isTv
      ? `— S${season}:E${episode} (${escapeHtml(media.episodeTitle || 'Episode')})`
      : '';

    const serverButtons = VideoPlayerModal.SERVERS.map(s => `
      <button type="button"
              class="server-btn ${this.currentSource === s.id ? 'active' : ''}"
              data-source="${s.id}"
              title="${s.name}${s.quality === '4K' ? ' (4K capable)' : ''}">
        <i class="fa-solid ${s.icon}"></i>
        <span>${s.label}</span>
        ${s.quality === '4K' ? '<span class="server-quality-badge">4K</span>' : ''}
      </button>
    `).join('');

    this.infoBody.innerHTML = `
      <div class="player-header-bar">
        <div class="player-title-box">
          <h2 class="modal-title">${escapeHtml(media.title)} ${titleSuffix}</h2>
          <span class="player-current-source">
            Streaming via: <strong id="active-server-name">${this._getSourceName(this.currentSource)}</strong>
          </span>
        </div>

        <div class="server-switcher-box">
          ${serverButtons}
        </div>
      </div>
    `;

    // Bind switch buttons
    this.infoBody.querySelectorAll('.server-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.infoBody.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.currentSource = btn.dataset.source;
        document.getElementById('active-server-name').textContent =
          this._getSourceName(this.currentSource);

        await this._loadStream(media, season, episode);
      });
    });
  }

  // ─── Load stream ───────────────────────────────────────────────────────────
  async _loadStream(media, season = 1, episode = 1) {
    this.videoContainer.innerHTML = `
      <div class="stream-loader-box">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Connecting to ${this._getSourceName(this.currentSource)}...</span>
      </div>
    `;

    let embedUrl = '';
    const isTv = media.media_type === 'tv';
    const server = this._getServer(this.currentSource);

    if (this.currentSource === 'trailer') {
      const videoKey = await tmdbService.getTrailerVideoKey(media.id, media.media_type);
      embedUrl = `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`;
    } else if (server && server.build) {
      embedUrl = server.build(media.id, isTv ? 'tv' : 'movie', season, episode);
    }

    this.videoContainer.innerHTML = `
      <iframe
        src="${embedUrl}"
        title="Stream Player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="no-referrer">
      </iframe>
    `;
  }

  close() {
    if (!this.modal) return;
    this.videoContainer.innerHTML = '';
    this.modal.close();
  }
}