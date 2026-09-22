// ============================================================================
// js/components/playerView.js
// Cinema Player — Robust Server Switcher + VidKing Integration
// ============================================================================

import { storageService } from "../utils/storage.js";
import { escapeHtml } from "../utils/dom.js";
import { getUserSettings } from "./settingsView.js";

export class PlayerView {
  constructor(containerId, onBack) {
    this.containerId = containerId;
    this.onBack = onBack;
    this.activeMedia = null;
    this.hlsInstance = null;
    this._vidKingMessageHandler = null;
    this._loadToken = 0;

    const settings = getUserSettings() || {};
    this.currentSource = this._normalizeServerId(
      settings.primaryServer || "vidsrc",
    );
  }

  static SERVERS = [
    {
      id: "vidsrc",
      name: "VidSrc",
      label: "Server 1",
      icon: "fa-server",
      quality: "4K",
      build: (id, isTv, season, episode) =>
        isTv
          ? `https://vidsrc.to/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
          : `https://vidsrc.to/embed/movie/${encodeURIComponent(id)}`,
    },
    {
      id: "vidKing",
      name: "VidKing",
      label: "Server 2",
      icon: "fa-server",
      quality: "FHD - 4K",
      build: (id, isTv, season, episode) => {
        const path = isTv
          ? `/embed/tv/${encodeURIComponent(id)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
          : `/embed/movie/${encodeURIComponent(id)}`;

        const params = new URLSearchParams();
        params.set("color", "e50914");
        params.set("autoPlay", "true");

        if (isTv) {
          params.set("nextEpisode", "true");
          params.set("episodeSelector", "true");
        }

        return `https://vidking.ws${path}?${params.toString()}`;
      },
    },
    {
      id: "vidrock",
      name: "Vidrock",
      label: "Server 3",
      icon: "fa-server",
      quality: "FHD - 4K",
      logo: "https://vidrock.net/Rock.png",
      build: (id, isTv, season, episode) => {
        let url = `https://vidrock.net/embed/${isTv ? "tv" : "movie"}/${encodeURIComponent(id)}`;

        if (isTv && season) {
          url += `/${encodeURIComponent(season)}/${encodeURIComponent(episode || 1)}`;
        }

        return `${url}?autoplay=1`;
      },
    },
    {
      id: "vidfast",
      name: "VidFast",
      label: "Server 4",
      icon: "fa-server",
      quality: "FHD - 4K",
      build: (id, isTv, season, episode) => {
        // VidFast endpoint needs to be confirmed from its own documentation.
        return "";
      },
    },
  ];

  _normalizeServerId(id) {
    return PlayerView.SERVERS.some((server) => server.id === id)
      ? id
      : PlayerView.SERVERS[0].id;
  }

  _getServer(id) {
    return (
      PlayerView.SERVERS.find((server) => server.id === id) ||
      PlayerView.SERVERS[0]
    );
  }

  get container() {
    let el = document.getElementById(this.containerId);

    if (!el) {
      el = document.createElement("div");
      el.id = this.containerId;
      el.className = "player-page-container";

      const main = document.querySelector(".main-wrapper") || document.body;
      main.prepend(el);
    }

    return el;
  }

  async render(media) {
    if (!media || !media.id) return;

    this.activeMedia = { ...media };
    this._destroyHls();
    this._removeVidKingListener();

    const settings = getUserSettings() || {};
    const preferredServer = this._normalizeServerId(
      settings.primaryServer || this.currentSource || "vidsrc",
    );

    this.currentSource = preferredServer;

    const container = this.container;
    container.style.display = "block";

    const isTv = media.media_type === "tv" || media.media_type === "show";
    const season = Number(media.selectedSeason) || 1;
    const episode = Number(media.selectedEpisode) || 1;
    const title = media.title || media.name || "Untitled";
    const epTitle = media.episodeTitle || (isTv ? `Episode ${episode}` : "");

    const serverButtons = PlayerView.SERVERS.map(
      (server) => `
        <button
          type="button"
          class="server-tab-btn ${this.currentSource === server.id ? "active" : ""}"
          data-source="${escapeHtml(server.id)}"
          title="${escapeHtml(server.name)}${server.quality ? ` · ${escapeHtml(server.quality)}` : ""}">
          <i class="fa-solid ${escapeHtml(server.icon)}"></i>
          <span>${escapeHtml(server.label)}</span>
          ${
            server.quality === "4K"
              ? '<span class="server-quality-badge">4K</span>'
              : ""
          }
        </button>
      `,
    ).join("");

    container.innerHTML = `
      <div class="cinema-player-page">
        <div class="cinema-topbar">
          <button type="button" class="btn-player-back" id="player-back-btn">
            <i class="fa-solid fa-arrow-left"></i>
            <span>Back</span>
          </button>

          <div class="player-title-info">
            <h1 class="player-media-title">${escapeHtml(title)}</h1>
            ${
              isTv
                ? `
                  <span class="player-ep-tag">
                    Season ${season} • Episode ${episode}
                    ${epTitle ? `— ${escapeHtml(epTitle)}` : ""}
                  </span>
                `
                : ""
            }
          </div>

          <div class="player-server-tabs" id="player-server-tabs">
            ${serverButtons}
          </div>
        </div>

        <div class="cinema-video-frame" id="cinema-video-frame">
          <div class="player-loading-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Connecting to stream...</span>
          </div>
        </div>

        ${
          isTv
            ? `
              <div class="cinema-bottom-bar">
                <div class="ep-nav-buttons">
                  <button
                    type="button"
                    class="btn-ep-nav"
                    id="btn-prev-ep"
                    ${episode <= 1 ? "disabled" : ""}>
                    <i class="fa-solid fa-backward-step"></i>
                    Previous Episode
                  </button>

                  <button
                    type="button"
                    class="btn-ep-nav"
                    id="btn-next-ep">
                    Next Episode
                    <i class="fa-solid fa-forward-step"></i>
                  </button>
                </div>
              </div>
            `
            : ""
        }
      </div>
    `;

    this._bindEvents();
    await this._loadStream(media, season, episode);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  _bindEvents() {
    document
      .getElementById("player-back-btn")
      ?.addEventListener("click", () => {
        const previousMedia = this.activeMedia ? { ...this.activeMedia } : null;

        this.hide(false);

        if (typeof this.onBack === "function") {
          this.onBack(previousMedia);
        }
      });

    const tabs = document.getElementById("player-server-tabs");

    tabs?.addEventListener("click", async (event) => {
      const button = event.target.closest(".server-tab-btn");
      if (!button) return;

      const source = this._normalizeServerId(button.dataset.source);
      if (source === this.currentSource) return;

      this.currentSource = source;

      tabs.querySelectorAll(".server-tab-btn").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      const media = this.activeMedia;
      if (!media) return;

      const isTv = media.media_type === "tv" || media.media_type === "show";

      await this._loadStream(
        media,
        Number(media.selectedSeason) || 1,
        Number(media.selectedEpisode) || 1,
      );
    });

    document.getElementById("btn-prev-ep")?.addEventListener("click", () => {
      const media = this.activeMedia;
      if (!media) return;

      const season = Number(media.selectedSeason) || 1;
      const episode = Number(media.selectedEpisode) || 1;

      if (episode <= 1) return;

      this.render({
        ...media,
        selectedSeason: season,
        selectedEpisode: episode - 1,
      });
    });

    document.getElementById("btn-next-ep")?.addEventListener("click", () => {
      const media = this.activeMedia;
      if (!media) return;

      const season = Number(media.selectedSeason) || 1;
      const episode = Number(media.selectedEpisode) || 1;

      this.render({
        ...media,
        selectedSeason: season,
        selectedEpisode: episode + 1,
      });
    });
  }

  async _loadStream(media, season = 1, episode = 1) {
    const frame = document.getElementById("cinema-video-frame");
    if (!frame || !media?.id) return;

    const loadToken = ++this._loadToken;
    const server = this._getServer(this.currentSource);
    const isTv = media.media_type === "tv" || media.media_type === "show";
    const title = media.title || media.name || "Untitled";

    this._destroyHls();
    this._removeVidKingListener();

    frame.innerHTML = `
      <div class="player-loading-spinner">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>
          Loading ${escapeHtml(title)} via ${escapeHtml(server.name)}...
        </span>
      </div>
    `;

    const embedUrl = server.build(
      media.id,
      isTv,
      Number(season) || 1,
      Number(episode) || 1,
    );

    const iframe = document.createElement("iframe");

    iframe.className = "cinema-iframe";
    iframe.title = title;
    iframe.src = embedUrl;
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    iframe.addEventListener("load", () => {
      if (loadToken !== this._loadToken) return;

      const spinner = frame.querySelector(".player-loading-spinner");
      if (spinner) {
        spinner.remove();
      }
    });

    iframe.addEventListener("error", () => {
      if (loadToken !== this._loadToken) return;
      this._showPlayerError(frame, server, "The player could not be loaded.");
    });

    frame.replaceChildren(iframe);

    if (server.id === "vidKing") {
      this._bindVidKingEvents(media);
    }

    this._saveInitialProgress(media, season, episode);

    return embedUrl;
  }

  _bindVidKingEvents(media) {
    this._removeVidKingListener();

    this._vidKingMessageHandler = (event) => {
      const message = this._parsePlayerMessage(event.data);
      if (!message) return;

      const type = message.type || message.event || message.name || "";

      const data = message.data || message;

      if (
        type !== "PLAYER_EVENT" &&
        !String(type).toLowerCase().includes("player_event")
      ) {
        return;
      }

      const playerEvent = data.event || data.name || data.type || "";

      if (playerEvent === "timeupdate") {
        const currentTime = Number(
          data.currentTime ?? data.time ?? data.position ?? 0,
        );

        const duration = Number(data.duration ?? data.totalTime ?? 0);

        if (currentTime > 0 && duration > 0) {
          const isTv = media.media_type === "tv" || media.media_type === "show";

          storageService.saveWatchProgress(
            media,
            currentTime,
            duration,
            Number(media.selectedSeason) || 1,
            Number(media.selectedEpisode) || 1,
          );

          if (isTv && playerEvent === "ended") {
            this._showEpisodeFinished(media);
          }
        }
      }

      if (playerEvent === "ended") {
        this._showEpisodeFinished(media);
      }
    };

    window.addEventListener("message", this._vidKingMessageHandler);
  }

  _parsePlayerMessage(data) {
    if (!data) return null;

    if (typeof data === "object") {
      return data;
    }

    if (typeof data !== "string") {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  _saveInitialProgress(media, season, episode) {
    const isTv = media.media_type === "tv" || media.media_type === "show";

    const saved = storageService.getWatchProgress?.(media);

    if (saved && Number(saved.progress) > 0) {
      return;
    }

    storageService.saveWatchProgress(
      media,
      0,
      0,
      Number(season) || 1,
      Number(episode) || 1,
    );
  }

  _showEpisodeFinished(media) {
    const isTv = media.media_type === "tv" || media.media_type === "show";

    if (!isTv) return;

    const frame = document.getElementById("cinema-video-frame");
    if (!frame) return;

    if (frame.querySelector(".episode-finished-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "episode-finished-overlay";
    overlay.innerHTML = `
      <div class="episode-finished-card">
        <div class="episode-finished-icon">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <strong>Episode finished</strong>
        <button type="button" class="btn-episode-next-overlay">
          Next Episode
          <i class="fa-solid fa-forward-step"></i>
        </button>
      </div>
    `;

    overlay
      .querySelector(".btn-episode-next-overlay")
      ?.addEventListener("click", () => {
        const season = Number(media.selectedSeason) || 1;
        const episode = Number(media.selectedEpisode) || 1;

        this.render({
          ...media,
          selectedSeason: season,
          selectedEpisode: episode + 1,
        });
      });

    frame.appendChild(overlay);
  }

  _showPlayerError(frame, server, message) {
    frame.innerHTML = `
      <div class="player-error-state">
        <div class="player-error-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3>${escapeHtml(server.name)} unavailable</h3>
        <p>${escapeHtml(message)}</p>
        <button type="button" class="btn-player-retry" id="player-retry-btn">
          <i class="fa-solid fa-rotate-right"></i>
          Try Again
        </button>
        <button type="button" class="btn-player-switch" id="player-switch-btn">
          <i class="fa-solid fa-server"></i>
          Switch Server
        </button>
      </div>
    `;

    document
      .getElementById("player-retry-btn")
      ?.addEventListener("click", () => {
        const media = this.activeMedia;
        if (!media) return;

        this._loadStream(
          media,
          Number(media.selectedSeason) || 1,
          Number(media.selectedEpisode) || 1,
        );
      });

    document
      .getElementById("player-switch-btn")
      ?.addEventListener("click", () => {
        const next = PlayerView.SERVERS.find(
          (item) => item.id !== this.currentSource,
        );

        if (!next) return;

        this.currentSource = next.id;

        const tabs = document.getElementById("player-server-tabs");

        tabs?.querySelectorAll(".server-tab-btn").forEach((button) => {
          button.classList.toggle(
            "active",
            button.dataset.source === this.currentSource,
          );
        });

        const media = this.activeMedia;
        if (!media) return;

        this._loadStream(
          media,
          Number(media.selectedSeason) || 1,
          Number(media.selectedEpisode) || 1,
        );
      });
  }

  _removeVidKingListener() {
    if (!this._vidKingMessageHandler) return;

    window.removeEventListener("message", this._vidKingMessageHandler);

    this._vidKingMessageHandler = null;
  }

  _destroyHls() {
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch {}
      this.hlsInstance = null;
    }
  }

  hide(clearMedia = true) {
    this._loadToken++;
    this._destroyHls();
    this._removeVidKingListener();

    const container = document.getElementById(this.containerId);

    if (container) {
      container.style.display = "none";
      container.innerHTML = "";
    }

    if (clearMedia) {
      this.activeMedia = null;
    }
  }
}

export function getAvailableServers() {
  return PlayerView.SERVERS;
}
