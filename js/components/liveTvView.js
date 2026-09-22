// ============================================================================
// js/components/liveTvView.js
// StreamFlix Pro Live TV Suite (With Fullscreen Channel Guide & Status Engine)
// ============================================================================

import { parseM3U, parseM3UFile } from "../live-tv/m3uParser.js";
import { playHLS, stopHLS } from "../live-tv/liveTvPlayer.js";
import {
  getPlaylistUrl,
  savePlaylistUrl,
  clearPlaylistUrl,
  getFavorites,
  isFavorite,
  toggleFavorite,
  addRecent,
  getRecent,
} from "../live-tv/liveTvStore.js";

const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1";
let hlsLoaderPromise = null;

function loadHlsLibrary() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLoaderPromise) return hlsLoaderPromise;

  hlsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cinejoy-hls="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Hls), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load hls.js.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = HLS_CDN;
    script.async = true;
    script.dataset.cinejoyHls = "true";

    script.onload = () => {
      if (window.Hls) resolve(window.Hls);
      else reject(new Error("hls.js loaded without exposing Hls global."));
    };
    script.onerror = () => reject(new Error("Network error loading hls.js."));
    document.head.appendChild(script);
  });

  return hlsLoaderPromise;
}

export class LiveTvView {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;

    this.channels = [];
    this.filteredChannels = [];
    this.groups = [];
    this.activeGroup = "All";
    this.searchQuery = "";
    this.currentChannel = null;
    this.hls = null;
    this._abortController = null;
    this._channelSelectionId = 0;
    this._controls = null;
    this._observer = null;

    // Track status of tested channels: 'online' | 'offline' | 'loading'
    this.channelStatusMap = new Map();

    this._ensureInjectedStyles();
  }

  _ensureInjectedStyles() {
    if (document.getElementById("live-tv-injected-styles")) return;

    const style = document.createElement("style");
    style.id = "live-tv-injected-styles";
    style.textContent = `
      /* 1. Force hide native HTML5 video controls */
      #live-tv-video::-webkit-media-controls,
      #live-tv-video::-webkit-media-controls-enclosure,
      #live-tv-video::-webkit-media-controls-panel,
      #live-tv-video::-webkit-media-controls-overlay-play-button,
      #live-tv-video::-webkit-media-controls-start-playback-button {
        display: none !important;
        -webkit-appearance: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* 2. Vertical Volume Popover */
      .volume-control-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .volume-popover {
        position: absolute;
        bottom: calc(100% + 14px);
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: rgba(18, 18, 22, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px;
        padding: 14px 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                    visibility 0.22s;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.65);
        z-index: 50;
      }

      .volume-popover::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-width: 6px;
        border-style: solid;
        border-color: rgba(18, 18, 22, 0.96) transparent transparent transparent;
      }

      .volume-control-wrapper:hover .volume-popover,
      .volume-control-wrapper.is-open .volume-popover,
      .volume-control-wrapper:focus-within .volume-popover {
        opacity: 1;
        pointer-events: auto;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
      }

      .volume-track-vertical {
        height: 110px;
        width: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .volume-slider-v {
        -webkit-appearance: slider-vertical;
        writing-mode: vertical-lr;
        direction: rtl;
        width: 8px;
        height: 100px;
        background: rgba(255, 255, 255, 0.2);
        accent-color: #3b82f6;
        cursor: pointer;
        border-radius: 4px;
        outline: none;
      }

      .volume-percent-badge {
        font-size: 0.72rem;
        font-weight: 700;
        color: #e2e8f0;
        font-family: monospace;
        letter-spacing: 0.5px;
        user-select: none;
      }

      /* Pulse LIVE badge */
      .live-indicator-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(239, 68, 68, 0.18);
        color: #ef4444;
        font-weight: 700;
        font-size: 0.75rem;
        padding: 3px 10px;
        border-radius: 9999px;
        border: 1px solid rgba(239, 68, 68, 0.35);
      }

      .live-dot {
        width: 7px;
        height: 7px;
        background: #ef4444;
        border-radius: 50%;
        animation: pulse-live-dot 1.4s infinite ease-in-out;
      }

      @keyframes pulse-live-dot {
        0%, 100% { transform: scale(0.9); opacity: 0.5; }
        50% { transform: scale(1.3); opacity: 1; }
      }

      /* 3. Fullscreen Quick Channel Guide Drawer */
      .quick-guide-drawer {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(380px, 85vw);
        background: rgba(12, 12, 16, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-left: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        flex-direction: column;
        z-index: 90;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: -10px 0 35px rgba(0, 0, 0, 0.75);
      }

      .quick-guide-drawer.is-open {
        transform: translateX(0);
      }

      .quick-guide-header {
        padding: 16px 18px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .quick-guide-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .quick-guide-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 0.95rem;
        color: #fff;
      }

      .quick-guide-close-btn {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        color: #cbd5e1;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .quick-guide-close-btn:hover {
        background: rgba(239, 68, 68, 0.25);
        color: #ef4444;
      }

      .quick-guide-search-box {
        position: relative;
        display: flex;
        align-items: center;
      }

      .quick-guide-search-box i {
        position: absolute;
        left: 12px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.85rem;
      }

      .quick-guide-search-input {
        width: 100%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px 12px 8px 34px;
        color: #fff;
        font-size: 0.85rem;
        outline: none;
        transition: border-color 0.2s;
      }

      .quick-guide-search-input:focus {
        border-color: #3b82f6;
      }

      .quick-guide-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .quick-guide-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        color: #fff;
      }

      .quick-guide-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .quick-guide-item.is-active {
        background: rgba(59, 130, 246, 0.16);
        border-color: rgba(59, 130, 246, 0.4);
      }

      .quick-guide-item-info {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
      }

      .quick-guide-item-logo {
        width: 34px;
        height: 34px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }

      .quick-guide-item-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .quick-guide-item-texts {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .quick-guide-item-title {
        font-size: 0.86rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .quick-guide-item-sub {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.5);
      }

      /* Channel Status Badges */
      .channel-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 9999px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        flex-shrink: 0;
      }

      .channel-status-pill.status-online {
        background: rgba(34, 197, 94, 0.18);
        color: #22c55e;
        border: 1px solid rgba(34, 197, 94, 0.35);
      }

      .channel-status-pill.status-offline {
        background: rgba(239, 68, 68, 0.18);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.35);
      }

      .channel-status-pill.status-ready {
        background: rgba(148, 163, 184, 0.12);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.2);
      }

      .channel-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  async render() {
    if (!this.container) return;

    this.destroy();
    this.container.innerHTML = this._shellHTML();
    this._bindEvents();
    this._initPlayerControls();

    const savedUrl = getPlaylistUrl();
    const input = this.container.querySelector("#live-tv-playlist-url");
    if (input) input.value = savedUrl || "";

    if (savedUrl) {
      await this.loadPlaylistFromUrl(savedUrl);
    } else {
      this._renderEmptyState();
    }
  }

  destroy() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    if (this._controls) {
      this._controls.destroy();
      this._controls = null;
    }

    const video = this.container?.querySelector("#live-tv-video");
    if (video) {
      video.onplaying = null;
      video.onerror = null;
      video.onwaiting = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      stopHLS(video);
    }

    this.hls = null;
    this.currentChannel = null;
  }

  _shellHTML() {
    return `
      <section class="live-tv-view" data-live-tv>
        <header class="live-tv-header">
          <div class="live-tv-header-info">
            <span class="live-tv-kicker"><i class="fa-solid fa-satellite-dish"></i> BROADCAST PLATFORM</span>
            <h1 class="live-tv-title">Live Television</h1>
            <p class="live-tv-subtitle">Stream unlimited worldwide live channels from your IPTV M3U playlist.</p>
          </div>

          <div class="live-tv-source">
            <div class="live-tv-input-box">
              <i class="fa-solid fa-link input-icon"></i>
              <input
                id="live-tv-playlist-url"
                class="live-tv-url"
                type="url"
                autocomplete="off"
                placeholder="Paste M3U playlist URL (.m3u, .m3u8)"
              />
            </div>
            <button type="button" class="live-tv-load-btn" data-action="load-url">
              <i class="fa-solid fa-arrow-right"></i> Load
            </button>

            <label class="live-tv-file-btn" title="Upload local .m3u file">
              <input id="live-tv-file" type="file" accept=".m3u,.m3u8,text/plain" hidden />
              <i class="fa-solid fa-folder-open"></i> <span>Open File</span>
            </label>

            <button type="button" class="live-tv-clear-btn" data-action="clear-url" title="Clear playlist">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </header>

        <div class="live-tv-status" id="live-tv-status" hidden></div>

        <div class="live-tv-layout">
          <main class="live-tv-main">
            <div class="live-tv-player-wrapper">
              <div class="live-tv-player" id="player-container">
                <video id="live-tv-video" playsinline preload="metadata"></video>

                <!-- Initial Idle Overlay -->
                <div class="live-tv-player-empty" id="live-tv-player-empty">
                  <div class="empty-icon-wrap">
                    <i class="fa-solid fa-tv"></i>
                  </div>
                  <strong>No Channel Selected</strong>
                  <span>Select any broadcast channel from the playlist to start streaming.</span>
                </div>

                <!-- Buffering / Loading Overlay -->
                <div class="live-tv-loading-overlay" id="live-tv-loader" hidden>
                  <div class="spinner-ring"></div>
                  <span id="live-tv-loader-text">Connecting to channel...</span>
                </div>

                <!-- Stream Error Overlay -->
                <div class="live-tv-error-overlay" id="live-tv-error-overlay" hidden>
                  <i class="fa-solid fa-triangle-exclamation error-icon"></i>
                  <h3 id="live-tv-error-title">Stream Unavailable</h3>
                  <p id="live-tv-error-msg">The stream format could not be decoded or the provider is offline.</p>
                  <button type="button" class="live-tv-retry-btn" id="live-tv-retry-btn">
                    <i class="fa-solid fa-rotate-right"></i> Retry Connection
                  </button>
                </div>

                <!-- Fullscreen Quick Guide Drawer -->
                <aside class="quick-guide-drawer" id="quick-guide-drawer" aria-hidden="true">
                  <div class="quick-guide-header">
                    <div class="quick-guide-title-row">
                      <div class="quick-guide-title">
                        <i class="fa-solid fa-list-ul"></i>
                        <span>Channels Guide</span>
                      </div>
                      <button type="button" class="quick-guide-close-btn" id="btn-close-quick-guide" title="Close (C / Esc)">
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    </div>

                    <div class="quick-guide-search-box">
                      <i class="fa-solid fa-magnifying-glass"></i>
                      <input
                        type="search"
                        id="quick-guide-search"
                        class="quick-guide-search-input"
                        placeholder="Search channel or status..."
                        autocomplete="off"
                      />
                    </div>
                  </div>

                  <div class="quick-guide-list" id="quick-guide-list" role="list"></div>
                </aside>

                <!-- Custom Overlay Controls -->
                <div class="custom-video-controls" id="custom-controls">
                  <!-- Progress Bar -->
                  <div class="video-progress-container" id="progress-container">
                    <input type="range" class="video-progress-slider" id="video-progress" min="0" max="100" value="0" step="0.1" />
                    <div class="video-progress-filled" id="progress-filled"></div>
                    <div class="video-progress-buffer" id="progress-buffer"></div>
                  </div>

                  <!-- Controls Bottom Bar -->
                  <div class="controls-bottom-bar">
                    <!-- Left: Prev, Play/Pause, Next, Live Badge, Time -->
                    <div class="controls-left">
                      <!-- Previous Channel -->
                      <button type="button" class="ctrl-btn" id="btn-prev-channel" title="Previous Channel (P / PageUp)">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                          <polygon points="19 20 9 12 19 4 19 20"/>
                          <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                        </svg>
                      </button>

                      <!-- Play / Pause -->
                      <button type="button" class="ctrl-btn" id="btn-play-pause" title="Play/Pause (Space)">
                        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                          <rect x="6" y="4" width="4" height="16" rx="1"/>
                          <rect x="14" y="4" width="4" height="16" rx="1"/>
                        </svg>
                      </button>

                      <!-- Next Channel -->
                      <button type="button" class="ctrl-btn" id="btn-next-channel" title="Next Channel (N / PageDown)">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                          <polygon points="5 4 15 12 5 20 5 4"/>
                          <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                        </svg>
                      </button>

                      <div class="live-indicator-badge" id="live-badge">
                        <span class="live-dot"></span> LIVE
                      </div>

                      <div class="video-timer" id="timer-box">
                        <span id="current-time">0:00</span>
                        <span id="time-separator"> / </span>
                        <span id="duration-time">0:00</span>
                      </div>
                    </div>

                    <!-- Right: Channels List Guide, Vertical Volume, Quality, PiP, Fullscreen -->
                    <div class="controls-right">
                      <!-- Fullscreen Channel Guide Toggle Button -->
                      <button type="button" class="ctrl-btn" id="btn-toggle-quick-guide" title="Quick Channels Guide (C)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="8" y1="6" x2="21" y2="6"/>
                          <line x1="8" y1="12" x2="21" y2="12"/>
                          <line x1="8" y1="18" x2="21" y2="18"/>
                          <line x1="3" y1="6" x2="3.01" y2="6"/>
                          <line x1="3" y1="12" x2="3.01" y2="12"/>
                          <line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                      </button>

                      <!-- Vertical Volume Wrapper -->
                      <div class="volume-control-wrapper" id="volume-wrapper">
                        <button type="button" class="ctrl-btn" id="btn-volume" title="Volume / Mute (M)">
                          <svg class="icon-volume-high" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                          </svg>
                          <svg class="icon-volume-low" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                          </svg>
                          <svg class="icon-volume-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <line x1="23" y1="9" x2="17" y2="15"/>
                            <line x1="17" y1="9" x2="23" y2="15"/>
                          </svg>
                        </button>

                        <div class="volume-popover" id="volume-popover">
                          <span class="volume-percent-badge" id="volume-percent-badge">100%</span>
                          <div class="volume-track-vertical">
                            <input
                              type="range"
                              class="volume-slider-v"
                              id="volume-slider"
                              min="0"
                              max="1"
                              step="0.02"
                              value="1"
                              orient="vertical"
                              title="Drag to change volume"
                            />
                          </div>
                        </div>
                      </div>

                      <span class="ctrl-badge" id="stream-quality-badge">FHD</span>

                      <button type="button" class="ctrl-btn" id="btn-pip" title="Picture in Picture">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2"/>
                          <rect x="12" y="10" width="8" height="7" rx="1"/>
                        </svg>
                      </button>

                      <button type="button" class="ctrl-btn" id="btn-fullscreen" title="Fullscreen (F)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                          <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                          <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
                          <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Current Channel Metadata Bar -->
            <div class="live-tv-now">
              <div class="live-tv-now-info">
                <div class="live-tv-now-logo-box">
                  <img id="live-tv-now-logo" alt="" hidden />
                  <span id="live-tv-now-logo-fallback" class="live-tv-channel-fallback">TV</span>
                </div>
                <div>
                  <span class="live-tv-now-label"><i class="fa-solid fa-tower-broadcast"></i> NOW STREAMING</span>
                  <h2 id="live-tv-now-title">No channel selected</h2>
                  <span id="live-tv-now-group">Select a channel to begin</span>
                </div>
              </div>

              <div class="live-tv-now-actions">
                <button
                  type="button"
                  class="live-tv-favorite-btn"
                  data-action="favorite-current"
                  disabled
                >
                  <i class="fa-regular fa-star"></i> Favorite
                </button>
              </div>
            </div>
          </main>

          <!-- Standard Sidebar -->
          <aside class="live-tv-sidebar">
            <div class="live-tv-sidebar-tools">
              <div class="live-tv-search-wrap">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input
                  id="live-tv-search"
                  class="live-tv-search"
                  type="search"
                  placeholder="Search channels, genres, numbers..."
                  autocomplete="off"
                />
              </div>
            </div>

            <div class="live-tv-groups-wrap">
              <button type="button" class="live-tv-groups-arrow" data-group-scroll="-1" aria-label="Previous categories">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <div class="live-tv-groups" id="live-tv-groups"></div>
              <button type="button" class="live-tv-groups-arrow" data-group-scroll="1" aria-label="Next categories">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>
            
            <div class="live-tv-channel-list" id="live-tv-channel-list" role="list"></div>
          </aside>
        </div>
      </section>
    `;
  }

  _bindEvents() {
    this.container.addEventListener("click", event => {
      // Toggle favorite star independently
      const starBtn = event.target.closest("[data-action='toggle-fav']");
      if (starBtn && this.container.contains(starBtn)) {
        event.stopPropagation();
        event.preventDefault();
        const id = starBtn.dataset.channelId;
        toggleFavorite(id);
        this._renderChannelList();
        this._renderQuickGuide();
        this._renderNowPlaying();
        return;
      }

      // Quick guide channel click inside fullscreen drawer
      const quickItem = event.target.closest("[data-quick-channel-id]");
      if (quickItem && this.container.contains(quickItem)) {
        event.preventDefault();
        this.selectChannel(quickItem.dataset.quickChannelId);
        return;
      }

      // Standard Channel card select
      const channelBtn = event.target.closest("[data-channel-id]");
      if (channelBtn && this.container.contains(channelBtn)) {
        event.preventDefault();
        this.selectChannel(channelBtn.dataset.channelId);
        return;
      }

      // Group category select
      const groupBtn = event.target.closest("[data-group]");
      if (groupBtn && this.container.contains(groupBtn)) {
        event.preventDefault();
        this.activeGroup = groupBtn.dataset.group || "All";
        this._renderGroups();
        this._applyFilters();
        return;
      }

      // Action buttons
      const actionBtn = event.target.closest("[data-action]");
      if (actionBtn && this.container.contains(actionBtn)) {
        const action = actionBtn.dataset.action;
        if (action === "load-url") this._loadUrlFromInput();
        if (action === "clear-url") this._clearPlaylist();
        if (action === "favorite-current") this._toggleCurrentFavorite();
      }
    });

    // Retry button click
    this.container.querySelector("#live-tv-retry-btn")?.addEventListener("click", () => {
      if (this.currentChannel) {
        this.selectChannel(this.currentChannel.id);
      }
    });

    // Horizontal category arrows
    this.container.querySelectorAll("[data-group-scroll]").forEach(btn => {
      btn.addEventListener("click", () => {
        const groups = this.container.querySelector("#live-tv-groups");
        if (!groups) return;
        groups.scrollBy({
          left: Number(btn.dataset.groupScroll || 1) * 220,
          behavior: "smooth",
        });
      });
    });

    // Mouse wheel scrolling for categories
    const groups = this.container.querySelector("#live-tv-groups");
    groups?.addEventListener(
      "wheel",
      event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        if (groups.scrollWidth <= groups.clientWidth) return;
        event.preventDefault();
        groups.scrollLeft += event.deltaY;
      },
      { passive: false }
    );

    // Sidebar search input
    const search = this.container.querySelector("#live-tv-search");
    search?.addEventListener("input", () => {
      this.searchQuery = search.value.trim().toLowerCase();
      this._applyFilters();
    });

    // Fullscreen Quick Guide Search input
    const quickSearch = this.container.querySelector("#quick-guide-search");
    quickSearch?.addEventListener("input", () => {
      this._renderQuickGuide(quickSearch.value.trim().toLowerCase());
    });

    // Close Fullscreen Quick Guide
    this.container.querySelector("#btn-close-quick-guide")?.addEventListener("click", () => {
      this.toggleQuickGuide(false);
    });

    // File input
    const file = this.container.querySelector("#live-tv-file");
    file?.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;

      try {
        this._setStatus("Parsing M3U file...", "loading");
        const channels = await parseM3UFile(selected);

        if (!channels?.length) {
          throw new Error("No channels found in this M3U file.");
        }

        this._setChannels(channels);
        this._setStatus(`${channels.length} channels loaded successfully.`, "success");
      } catch (error) {
        this._setStatus(error.message || "Failed to read M3U file.", "error");
      } finally {
        file.value = "";
      }
    });

    // Enter key support
    this.container
      .querySelector("#live-tv-playlist-url")
      ?.addEventListener("keydown", event => {
        if (event.key === "Enter") this._loadUrlFromInput();
      });
  }

  _initPlayerControls() {
    const playerWrapper = this.container.querySelector("#player-container");
    const video = this.container.querySelector("#live-tv-video");
    if (!playerWrapper || !video) return;

    // Permanently disable native controls
    video.removeAttribute("controls");
    try {
      Object.defineProperty(video, "controls", {
        get: () => false,
        set: () => { video.removeAttribute("controls"); },
        configurable: true,
      });
    } catch (_) {
      video.controls = false;
    }

    // Guard against script injection of controls attribute
    this._observer = new MutationObserver(() => {
      if (video.hasAttribute("controls")) {
        video.removeAttribute("controls");
      }
    });
    this._observer.observe(video, { attributes: true, attributeFilter: ["controls"] });

    this._controls = new LiveTvPlayerControls(playerWrapper, {
      onNextChannel: () => this.nextChannel(),
      onPrevChannel: () => this.prevChannel(),
      onToggleGuide: () => this.toggleQuickGuide(),
    });
  }

  toggleQuickGuide(forceState = null) {
    const drawer = this.container.querySelector("#quick-guide-drawer");
    if (!drawer) return;

    const isOpen = forceState !== null ? forceState : !drawer.classList.contains("is-open");
    drawer.classList.toggle("is-open", isOpen);
    drawer.setAttribute("aria-hidden", !isOpen);

    if (isOpen) {
      this._renderQuickGuide();
      const input = this.container.querySelector("#quick-guide-search");
      if (input) {
        input.value = "";
        input.focus();
      }
    }
  }

  nextChannel() {
    const list = this.filteredChannels.length ? this.filteredChannels : this.channels;
    if (!list.length) return;

    if (!this.currentChannel) {
      this.selectChannel(list[0].id);
      return;
    }

    const currentIndex = list.findIndex(c => String(c.id) === String(this.currentChannel.id));
    const nextIndex = (currentIndex + 1) % list.length;
    this.selectChannel(list[nextIndex].id);
  }

  prevChannel() {
    const list = this.filteredChannels.length ? this.filteredChannels : this.channels;
    if (!list.length) return;

    if (!this.currentChannel) {
      this.selectChannel(list[list.length - 1].id);
      return;
    }

    const currentIndex = list.findIndex(c => String(c.id) === String(this.currentChannel.id));
    const prevIndex = (currentIndex - 1 + list.length) % list.length;
    this.selectChannel(list[prevIndex].id);
  }

  async _loadUrlFromInput() {
    const input = this.container.querySelector("#live-tv-playlist-url");
    const url = input?.value.trim();

    if (!url) {
      this._setStatus("Please paste a valid M3U playlist URL.", "error");
      return;
    }

    await this.loadPlaylistFromUrl(url);
  }

  async loadPlaylistFromUrl(url) {
    let source = String(url || "").trim();
    if (!source) return;

    if (/^https?:\/\/raw\.githubusercontent\.com\/Free-TV\/IPTV\/master\/?$/i.test(source)) {
      source = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";
      const input = this.container.querySelector("#live-tv-playlist-url");
      if (input) input.value = source;
    }

    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    try {
      this._setStatus("Fetching M3U playlist...", "loading");

      const response = await fetch(source, {
        method: "GET",
        signal: this._abortController.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Playlist request failed with status: ${response.status}`);
      }

      const text = await response.text();
      const channels = parseM3U(text);

      if (!channels?.length) {
        throw new Error("No channels could be parsed from this playlist.");
      }

      savePlaylistUrl(source);
      this._setChannels(channels);
      this._setStatus(`${channels.length} channels loaded successfully.`, "success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      this._setStatus(error?.message || "Could not load playlist.", "error");
    }
  }

  _setChannels(channels) {
    this.channels = Array.isArray(channels) ? channels : [];
    this.channelStatusMap.clear();

    const groupSet = new Set(
      this.channels.map(c => c.group || "General").filter(Boolean)
    );

    this.groups = ["All", "Favorites", "Recent", ...Array.from(groupSet)];
    this.activeGroup = "All";
    this.searchQuery = "";

    const search = this.container.querySelector("#live-tv-search");
    if (search) search.value = "";

    this._renderGroups();
    this._applyFilters();
  }

  _applyFilters() {
    let list = this.channels;

    if (this.activeGroup === "Favorites") {
      const favs = new Set(getFavorites().map(String));
      list = list.filter(channel => favs.has(String(channel.id)));
    } else if (this.activeGroup === "Recent") {
      const recent = getRecent();
      const byId = new Map(this.channels.map(c => [String(c.id), c]));
      list = recent.map(item => byId.get(String(item.id)) || item).filter(Boolean);
    } else if (this.activeGroup !== "All") {
      list = list.filter(c => (c.group || "General") === this.activeGroup);
    }

    if (this.searchQuery) {
      list = list.filter(channel => {
        const text = `${channel.name} ${channel.group || ""} ${channel.id}`.toLowerCase();
        return text.includes(this.searchQuery);
      });
    }

    this.filteredChannels = list;
    this._renderChannelList();
    this._renderQuickGuide();
  }

  _renderGroups() {
    const root = this.container.querySelector("#live-tv-groups");
    if (!root) return;

    root.innerHTML = this.groups
      .map(
        group => `
        <button
          type="button"
          class="live-tv-group ${group === this.activeGroup ? "is-active" : ""}"
          data-group="${this._escape(group)}"
        >
          ${this._escape(group)}
        </button>
      `
      )
      .join("");
  }

  _renderChannelList() {
    const root = this.container.querySelector("#live-tv-channel-list");
    if (!root) return;

    if (!this.filteredChannels.length) {
      root.innerHTML = `
        <div class="live-tv-list-empty">
          <i class="fa-solid fa-satellite"></i>
          <strong>No channels found</strong>
          <span>Try a different keyword or category.</span>
        </div>
      `;
      return;
    }

    root.innerHTML = this.filteredChannels
      .map(channel => {
        const active = String(channel.id) === String(this.currentChannel?.id);
        const favorite = isFavorite(channel.id);

        return `
          <div
            class="live-tv-channel ${active ? "is-active" : ""}"
            data-channel-id="${this._escape(String(channel.id))}"
            role="button"
            tabindex="0"
          >
            <div class="live-tv-channel-logo">
              ${
                channel.logo
                  ? `<img src="${this._escape(channel.logo)}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
                  : ""
              }
              <span class="live-tv-channel-fallback" style="${channel.logo ? 'display:none;' : ''}">TV</span>
            </div>

            <div class="live-tv-channel-copy">
              <strong class="live-tv-channel-name">${this._escape(channel.name)}</strong>
              <small class="live-tv-channel-category">${this._escape(channel.group || "General")}</small>
            </div>

            <button
              type="button"
              class="channel-star-btn ${favorite ? "is-fav" : ""}"
              data-action="toggle-fav"
              data-channel-id="${this._escape(String(channel.id))}"
              title="${favorite ? 'Remove favorite' : 'Add to favorites'}"
            >
              <i class="fa-${favorite ? 'solid' : 'regular'} fa-star"></i>
            </button>
          </div>
        `;
      })
      .join("");

    const activeEl = root.querySelector(".live-tv-channel.is-active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  _renderQuickGuide(filterKeyword = "") {
    const root = this.container.querySelector("#quick-guide-list");
    if (!root) return;

    let list = this.channels;
    if (filterKeyword) {
      list = list.filter(c => 
        `${c.name} ${c.group || ""}`.toLowerCase().includes(filterKeyword)
      );
    }

    if (!list.length) {
      root.innerHTML = `
        <div style="padding: 24px; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.85rem;">
          No channels match "${this._escape(filterKeyword)}"
        </div>
      `;
      return;
    }

    root.innerHTML = list
      .map(channel => {
        const isCurrent = String(channel.id) === String(this.currentChannel?.id);
        const status = this.channelStatusMap.get(String(channel.id)) || (isCurrent ? 'online' : 'ready');

        const statusLabel = isCurrent 
          ? 'Live Now' 
          : status === 'online' 
          ? 'Online' 
          : status === 'offline' 
          ? 'Offline' 
          : 'Ready';

        const statusClass = isCurrent || status === 'online'
          ? 'status-online'
          : status === 'offline'
          ? 'status-offline'
          : 'status-ready';

        return `
          <div
            class="quick-guide-item ${isCurrent ? 'is-active' : ''}"
            data-quick-channel-id="${this._escape(String(channel.id))}"
            role="button"
          >
            <div class="quick-guide-item-info">
              <div class="quick-guide-item-logo">
                ${
                  channel.logo
                    ? `<img src="${this._escape(channel.logo)}" alt="" loading="lazy" onerror="this.remove()" />`
                    : `<i class="fa-solid fa-tv" style="font-size: 0.8rem; color: rgba(255,255,255,0.4);"></i>`
                }
              </div>
              <div class="quick-guide-item-texts">
                <span class="quick-guide-item-title">${this._escape(channel.name)}</span>
                <span class="quick-guide-item-sub">${this._escape(channel.group || 'General')}</span>
              </div>
            </div>

            <span class="channel-status-pill ${statusClass}">
              <span class="channel-status-dot"></span>
              ${statusLabel}
            </span>
          </div>
        `;
      })
      .join("");

    // Auto-scroll to active channel in drawer
    const activeEl = root.querySelector(".quick-guide-item.is-active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  async selectChannel(channelId) {
    const channel = this.channels.find(c => String(c.id) === String(channelId));
    if (!channel) return;

    const selectionId = ++this._channelSelectionId;

    const video = this.container.querySelector("#live-tv-video");
    const empty = this.container.querySelector("#live-tv-player-empty");
    const loader = this.container.querySelector("#live-tv-loader");
    const loaderText = this.container.querySelector("#live-tv-loader-text");
    const errorOverlay = this.container.querySelector("#live-tv-error-overlay");

    try {
      this._setStatus(`Connecting to ${channel.name}...`, "loading");
      if (loader) {
        loader.hidden = false;
        if (loaderText) loaderText.textContent = `Tuning into ${channel.name}...`;
      }
      if (errorOverlay) errorOverlay.hidden = true;
      if (empty) empty.hidden = true;

      await loadHlsLibrary();

      if (this._channelSelectionId !== selectionId) return;

      this.currentChannel = channel;
      addRecent(channel);

      if (!video) throw new Error("Video player surface missing.");

      // Stop previous stream
      stopHLS(video);

      // Enforce custom controls only
      video.controls = false;
      video.removeAttribute("controls");
      video.autoplay = true;
      video.playsInline = true;

      video.onplaying = () => {
        if (loader) loader.hidden = true;
        if (errorOverlay) errorOverlay.hidden = true;
        this.channelStatusMap.set(String(channel.id), 'online');
        this._setStatus(`${channel.name} is now playing.`, "success");
        this._renderQuickGuide();
      };

      video.onwaiting = () => {
        if (loader) {
          loader.hidden = false;
          if (loaderText) loaderText.textContent = "Buffering broadcast...";
        }
      };

      video.onerror = () => {
        if (loader) loader.hidden = true;
        if (errorOverlay) errorOverlay.hidden = false;
        this.channelStatusMap.set(String(channel.id), 'offline');
        this._setStatus(`Stream error or offline: ${channel.name}`, "error");
        this._renderQuickGuide();
      };

      this.hls = playHLS(video, channel.url, {
        onReady: () => {
          this._setStatus(`Receiving ${channel.name}...`, "loading");
        },
        onUnsupported: detail => {
          if (loader) loader.hidden = true;
          if (errorOverlay) errorOverlay.hidden = false;
          this.channelStatusMap.set(String(channel.id), 'offline');
          this._setStatus(`Stream format unsupported (${detail}).`, "error");
          this._renderQuickGuide();
        },
        onError: data => {
          if (!data?.fatal) return;
          if (loader) loader.hidden = true;
          if (errorOverlay) errorOverlay.hidden = false;
          this.channelStatusMap.set(String(channel.id), 'offline');
          this._setStatus(`Connection lost: ${data.details || "Offline"}`, "error");
          this._renderQuickGuide();
        },
      });

      // Confirm native controls remain removed
      video.controls = false;
      video.removeAttribute("controls");

      this._renderNowPlaying();
      this._renderChannelList();
      this._renderQuickGuide();
    } catch (error) {
      if (this._channelSelectionId !== selectionId) return;
      if (loader) loader.hidden = true;
      if (errorOverlay) errorOverlay.hidden = false;
      this.channelStatusMap.set(String(channel.id), 'offline');
      this._setStatus(error?.message || "Could not play channel.", "error");
      this._renderQuickGuide();
    }
  }

  _toggleCurrentFavorite() {
    if (!this.currentChannel) return;

    toggleFavorite(this.currentChannel.id);
    this._renderNowPlaying();
    this._renderGroups();
    this._applyFilters();
  }

  _renderNowPlaying() {
    const title = this.container.querySelector("#live-tv-now-title");
    const group = this.container.querySelector("#live-tv-now-group");
    const logo = this.container.querySelector("#live-tv-now-logo");
    const fallback = this.container.querySelector("#live-tv-now-logo-fallback");
    const btn = this.container.querySelector('[data-action="favorite-current"]');

    if (!this.currentChannel) {
      if (title) title.textContent = "No channel selected";
      if (group) group.textContent = "Select a channel to begin";
      if (logo) logo.hidden = true;
      if (fallback) fallback.style.display = "flex";
      if (btn) btn.disabled = true;
      return;
    }

    if (title) title.textContent = this.currentChannel.name;
    if (group) group.textContent = this.currentChannel.group || "General Broadcast";

    if (this.currentChannel.logo) {
      if (logo) {
        logo.src = this.currentChannel.logo;
        logo.hidden = false;
        logo.onerror = () => {
          logo.hidden = true;
          if (fallback) fallback.style.display = "flex";
        };
      }
      if (fallback) fallback.style.display = "none";
    } else {
      if (logo) logo.hidden = true;
      if (fallback) fallback.style.display = "flex";
    }

    if (btn) {
      btn.disabled = false;
      const fav = isFavorite(this.currentChannel.id);
      btn.innerHTML = `<i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i> ${fav ? 'Favorited' : 'Favorite'}`;
      btn.classList.toggle("is-active", fav);
    }
  }

  _renderEmptyState() {
    const list = this.container.querySelector("#live-tv-channel-list");
    const groups = this.container.querySelector("#live-tv-groups");

    if (groups) groups.innerHTML = "";
    if (list) {
      list.innerHTML = `
        <div class="live-tv-list-empty">
          <i class="fa-solid fa-cloud-arrow-down"></i>
          <strong>No playlist loaded</strong>
          <span>Paste an M3U stream URL or open a local .m3u file above.</span>
        </div>
      `;
    }
  }

  _clearPlaylist() {
    clearPlaylistUrl();

    this.channels = [];
    this.filteredChannels = [];
    this.groups = [];
    this.activeGroup = "All";
    this.currentChannel = null;
    this.channelStatusMap.clear();

    const video = this.container.querySelector("#live-tv-video");
    if (video) {
      stopHLS(video);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    const empty = this.container.querySelector("#live-tv-player-empty");
    if (empty) empty.hidden = false;

    const input = this.container.querySelector("#live-tv-playlist-url");
    if (input) input.value = "";

    this._renderNowPlaying();
    this._renderEmptyState();
    this._renderQuickGuide();
    this._setStatus("Playlist cleared.", "info");
  }

  _setStatus(message, type = "info") {
    const status = this.container.querySelector("#live-tv-status");
    if (!status) return;

    status.hidden = !message;
    status.dataset.type = type;
    status.innerHTML = `
      <i class="fa-solid ${
        type === 'loading'
          ? 'fa-circle-notch fa-spin'
          : type === 'error'
          ? 'fa-triangle-exclamation'
          : type === 'success'
          ? 'fa-circle-check'
          : 'fa-circle-info'
      }"></i>
      <span>${this._escape(message)}</span>
    `;
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

// ============================================================================
// Pro Custom Player Controls Manager
// ============================================================================

class LiveTvPlayerControls {
  constructor(playerContainer, options = {}) {
    this.container = playerContainer;
    this.options = options;
    this.video = playerContainer.querySelector("#live-tv-video");
    this.controls = playerContainer.querySelector("#custom-controls");
    this.quickGuideDrawer = playerContainer.querySelector("#quick-guide-drawer");

    // Playback Buttons
    this.prevBtn = playerContainer.querySelector("#btn-prev-channel");
    this.nextBtn = playerContainer.querySelector("#btn-next-channel");
    this.playPauseBtn = playerContainer.querySelector("#btn-play-pause");
    this.iconPlay = this.playPauseBtn?.querySelector(".icon-play");
    this.iconPause = this.playPauseBtn?.querySelector(".icon-pause");

    this.toggleGuideBtn = playerContainer.querySelector("#btn-toggle-quick-guide");

    this.liveBadge = playerContainer.querySelector("#live-badge");
    this.timerBox = playerContainer.querySelector("#timer-box");
    this.currentTimeEl = playerContainer.querySelector("#current-time");
    this.durationTimeEl = playerContainer.querySelector("#duration-time");

    this.progressContainer = playerContainer.querySelector("#progress-container");
    this.progressFilled = playerContainer.querySelector("#progress-filled");
    this.progressBuffer = playerContainer.querySelector("#progress-buffer");
    this.progressSlider = playerContainer.querySelector("#video-progress");

    // Vertical Volume Elements
    this.volumeWrapper = playerContainer.querySelector("#volume-wrapper");
    this.volumeBtn = playerContainer.querySelector("#btn-volume");
    this.volumeSlider = playerContainer.querySelector("#volume-slider");
    this.volumePercentBadge = playerContainer.querySelector("#volume-percent-badge");
    this.iconVolHigh = this.volumeBtn?.querySelector(".icon-volume-high");
    this.iconVolLow = this.volumeBtn?.querySelector(".icon-volume-low");
    this.iconVolMuted = this.volumeBtn?.querySelector(".icon-volume-muted");

    this.fullscreenBtn = playerContainer.querySelector("#btn-fullscreen");
    this.pipBtn = playerContainer.querySelector("#btn-pip");

    this._hideTimeout = null;
    this._isDraggingScrubber = false;
    this._lastVolume = 1;

    this._bind();
  }

  _bind() {
    if (!this.video || !this.controls) return;

    // 1. Play / Pause
    const togglePlay = () => {
      if (this.video.paused || this.video.ended) {
        this.video.play().catch(() => {});
      } else {
        this.video.pause();
      }
    };

    this.playPauseBtn?.addEventListener("click", togglePlay);
    this.video.addEventListener("click", () => {
      // If drawer is open, clicking video closes drawer first
      if (this.quickGuideDrawer?.classList.contains("is-open")) {
        this.options.onToggleGuide?.();
        return;
      }
      togglePlay();
    });

    // 2. Channel Navigation & Guide Toggle
    this.prevBtn?.addEventListener("click", () => {
      this.options.onPrevChannel?.();
      this._resetTimer();
    });

    this.nextBtn?.addEventListener("click", () => {
      this.options.onNextChannel?.();
      this._resetTimer();
    });

    this.toggleGuideBtn?.addEventListener("click", () => {
      this.options.onToggleGuide?.();
      this._resetTimer();
    });

    this.video.addEventListener("play", () => {
      if (this.iconPlay) this.iconPlay.style.display = "none";
      if (this.iconPause) this.iconPause.style.display = "block";
      this._resetTimer();
    });

    this.video.addEventListener("pause", () => {
      if (this.iconPlay) this.iconPlay.style.display = "block";
      if (this.iconPause) this.iconPause.style.display = "none";
      this.controls.classList.remove("is-hidden");
    });

    // 3. Time & Scrubber logic
    this.video.addEventListener("timeupdate", () => {
      const isLive = !isFinite(this.video.duration) || this.video.duration === 0;

      if (isLive) {
        if (this.liveBadge) this.liveBadge.style.display = "inline-flex";
        if (this.timerBox) this.timerBox.style.display = "none";
        if (this.progressContainer) this.progressContainer.style.opacity = "0.25";
        if (this.progressSlider) this.progressSlider.disabled = true;
      } else {
        if (this.liveBadge) this.liveBadge.style.display = "none";
        if (this.timerBox) this.timerBox.style.display = "inline-flex";
        if (this.progressContainer) this.progressContainer.style.opacity = "1";
        if (this.progressSlider) this.progressSlider.disabled = false;

        this.currentTimeEl.textContent = this._formatTime(this.video.currentTime);
        this.durationTimeEl.textContent = this._formatTime(this.video.duration);

        if (!this._isDraggingScrubber && this.video.duration) {
          const percent = (this.video.currentTime / this.video.duration) * 100;
          this.progressFilled.style.width = `${percent}%`;
          this.progressSlider.value = percent;
        }
      }

      if (this.video.buffered.length > 0 && isFinite(this.video.duration)) {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        const bufferPercent = (bufferedEnd / this.video.duration) * 100;
        if (this.progressBuffer) this.progressBuffer.style.width = `${bufferPercent}%`;
      }
    });

    // Scrubber Scrubbing
    this.progressSlider?.addEventListener("input", e => {
      this._isDraggingScrubber = true;
      if (isFinite(this.video.duration)) {
        const target = (Number(e.target.value) / 100) * this.video.duration;
        this.progressFilled.style.width = `${e.target.value}%`;
        this.currentTimeEl.textContent = this._formatTime(target);
      }
    });

    this.progressSlider?.addEventListener("change", e => {
      if (isFinite(this.video.duration)) {
        this.video.currentTime = (Number(e.target.value) / 100) * this.video.duration;
      }
      this._isDraggingScrubber = false;
    });

    // 4. Vertical Volume
    this.volumeBtn?.addEventListener("click", e => {
      e.stopPropagation();
      if (window.matchMedia("(hover: none)").matches) {
        this.volumeWrapper.classList.toggle("is-open");
      } else {
        this._toggleMute();
      }
    });

    this._outsideClickHandler = event => {
      if (!this.volumeWrapper?.contains(event.target)) {
        this.volumeWrapper?.classList.remove("is-open");
      }
    };
    document.addEventListener("click", this._outsideClickHandler);

    this.volumeSlider?.addEventListener("input", e => {
      const val = parseFloat(e.target.value);
      this.video.volume = val;
      this.video.muted = val === 0;
      if (val > 0) this._lastVolume = val;
      this._updateVolumeUI();
      this._resetTimer();
    });

    // 5. Fullscreen
    this.fullscreenBtn?.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        this.container.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    // 6. Picture-in-Picture
    if ("pictureInPictureEnabled" in document && this.pipBtn) {
      this.pipBtn.addEventListener("click", async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await this.video.requestPictureInPicture();
          }
        } catch (e) {
          console.warn("[PiP] Error:", e);
        }
      });
    } else if (this.pipBtn) {
      this.pipBtn.style.display = "none";
    }

    // Auto-hide controls
    this.container.addEventListener("mousemove", () => this._resetTimer());
    this.container.addEventListener("mouseleave", () => {
      if (!this.video.paused && !this.quickGuideDrawer?.classList.contains("is-open")) {
        this.controls.classList.add("is-hidden");
        this.volumeWrapper?.classList.remove("is-open");
      }
    });

    // 7. Keyboard Shortcuts (C = Guide, N = Next, P = Prev, Space, M, F)
    this._keyHandler = e => {
      if (["input", "textarea"].includes(document.activeElement?.tagName.toLowerCase())) return;
      if (!this.container.contains(document.activeElement) && document.fullscreenElement !== this.container) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "KeyC") {
        e.preventDefault();
        this.options.onToggleGuide?.();
      } else if (e.code === "KeyN" || e.code === "PageDown") {
        e.preventDefault();
        this.options.onNextChannel?.();
      } else if (e.code === "KeyP" || e.code === "PageUp") {
        e.preventDefault();
        this.options.onPrevChannel?.();
      } else if (e.code === "KeyM") {
        this._toggleMute();
      } else if (e.code === "KeyF") {
        this.fullscreenBtn?.click();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        this._adjustVolume(0.05);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        this._adjustVolume(-0.05);
      } else if (e.code === "Escape") {
        if (this.quickGuideDrawer?.classList.contains("is-open")) {
          e.preventDefault();
          this.options.onToggleGuide?.();
        }
      }
    };
    window.addEventListener("keydown", this._keyHandler);

    this._updateVolumeUI();
  }

  _toggleMute() {
    if (this.video.muted || this.video.volume === 0) {
      this.video.muted = false;
      this.video.volume = this._lastVolume || 0.8;
    } else {
      this._lastVolume = this.video.volume;
      this.video.muted = true;
    }
    this._updateVolumeUI();
  }

  _adjustVolume(delta) {
    let next = Math.max(0, Math.min(1, this.video.volume + delta));
    this.video.volume = next;
    this.video.muted = next === 0;
    if (next > 0) this._lastVolume = next;
    this._updateVolumeUI();
    this.volumeWrapper?.classList.add("is-open");
    this._resetTimer();
  }

  _updateVolumeUI() {
    const isMuted = this.video.muted || this.video.volume === 0;
    const vol = isMuted ? 0 : this.video.volume;

    if (this.iconVolHigh) this.iconVolHigh.style.display = vol > 0.5 ? "block" : "none";
    if (this.iconVolLow) this.iconVolLow.style.display = vol > 0 && vol <= 0.5 ? "block" : "none";
    if (this.iconVolMuted) this.iconVolMuted.style.display = isMuted ? "block" : "none";

    if (this.volumeSlider) this.volumeSlider.value = vol;
    if (this.volumePercentBadge) {
      this.volumePercentBadge.textContent = isMuted ? "MUTED" : `${Math.round(vol * 100)}%`;
    }
  }

  _resetTimer() {
    this.controls.classList.remove("is-hidden");
    clearTimeout(this._hideTimeout);
    if (!this.video.paused && !this.quickGuideDrawer?.classList.contains("is-open")) {
      this._hideTimeout = setTimeout(() => {
        this.controls.classList.add("is-hidden");
        this.volumeWrapper?.classList.remove("is-open");
      }, 3500);
    }
  }

  _formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const sec = Math.floor(seconds % 60);
    const min = Math.floor((seconds / 60) % 60);
    const hrs = Math.floor(seconds / 3600);
    const pad = s => String(s).padStart(2, "0");

    if (hrs > 0) return `${hrs}:${pad(min)}:${pad(sec)}`;
    return `${min}:${pad(sec)}`;
  }

  destroy() {
    clearTimeout(this._hideTimeout);
    if (this._keyHandler) {
      window.removeEventListener("keydown", this._keyHandler);
    }
    if (this._outsideClickHandler) {
      document.removeEventListener("click", this._outsideClickHandler);
    }
  }
}