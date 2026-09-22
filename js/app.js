// ============================================================================
// js/app.js
// StreamFlix Master Application Orchestrator
// ============================================================================

import { tmdbService } from "./api/tmdb.js";
import { colorExtractor } from "./utils/colorExtractor.js";
import { storageService } from "./utils/storage.js";
import { TrailerModal } from "./components/trailerModal.js";
import { PlayerView } from "./components/playerView.js";
import { Navbar } from "./components/navbar.js";
import { DetailView } from "./components/detailView.js";
import { SettingsView } from "./components/settingsView.js";
import { CastView } from "./components/castView.js";
import { LiveTvView } from "./components/liveTvView.js";
import { escapeHtml } from "./utils/dom.js";

const GENRE_LIST = [
  { id: "all", name: "All Genres" },
  { id: "28", name: "Action" },
  { id: "12", name: "Adventure" },
  { id: "16", name: "Animation" },
  { id: "35", name: "Comedy" },
  { id: "80", name: "Crime" },
  { id: "18", name: "Drama" },
  { id: "14", name: "Fantasy" },
  { id: "27", name: "Horror" },
  { id: "878", name: "Sci-Fi" },
  { id: "53", name: "Thriller" },
];

class StreamFlixApp {
  constructor() {
    this.currentPage = 1;
    this.totalPages = 1;
    this.activePage = "home";
    this.previousPage = "home";
    this.activeGenre = "all";
    this.activeMediaType = "all";
    this.selectedProvider = null;
    this.heroIndex = 0;
    this.heroSlides = [];
    this.catalogItems = [];
    this.isLoading = false;
    this.isEditingContinue = false;
    this.previousCastPage = "home";

    // DOM Element Bindings
    this.heroBackdropImg = document.getElementById("hero-backdrop-img");
    this.ambientImageEl = document.getElementById("ambient-image");
    this.heroShowcaseEl = document.getElementById("hero-showcase");
    this.heroTitleEl = document.getElementById("hero-title");
    this.heroRatingEl = document.getElementById("hero-rating");
    this.heroYearEl = document.getElementById("hero-year");
    this.heroGenreEl = document.getElementById("hero-genre");
    this.heroSynopsisEl = document.getElementById("hero-synopsis");
    this.heroIndicatorsEl = document.getElementById("hero-indicators");

    this.continueWatchingSection = document.getElementById(
      "section-continue-watching",
    );
    this.continueGridEl = document.getElementById("continue-watching-grid");
    this.providersSection = document.getElementById("section-providers");
    this.providersRowEl = document.getElementById("providers-list");
    this.gridSection = document.getElementById("section-trending");
    this.mediaGridEl = document.getElementById("media-grid");

    // Components
    this.trailerModal = new TrailerModal();
    this.playerView = new PlayerView("player-view-container", () => {
      document.body.classList.remove("player-mode"); // Restore navbar
      if (this.previousPage === "detail") {
        this.detailView.container.style.display = "block";
        this.activePage = "detail";
      } else {
        this.navigate("home");
      }
    });

    this.settingsView = new SettingsView("settings-view-container");
    this.liveTvView = new LiveTvView(document.getElementById("live-tv-view-container"));
    this.navbar = new Navbar(
      (page) => this.navigate(page),
      (item) => this.openDetails(item.id, item.media_type),
    );

    this.castView = new CastView("cast-view-container", {
      onBack: () => this.closeCastView(),
      onOpenTitle: (id, type) => this.openDetails(id, type),
    });

    this.detailView = new DetailView(
      "detail-view-container",
      (item) => this.openPlayer(item),
      (item) => this.trailerModal.open(item),
      (id, type) => this.openDetails(id, type),
      (personId, seed) => this.openCastView(personId, seed),
    );
  }

  async init() {
    this._renderProviders();
    this._bindEvents();
    this.renderContinueWatching();
    await this.loadHomeFeed();
  }

  _bindEvents() {
    window.addEventListener("cinejoy:progress-updated", () => {
      this.renderContinueWatching();
    });

    // Edit Continue Watching Button Toggle
    document
      .getElementById("btn-edit-continue")
      ?.addEventListener("click", () => {
        this.isEditingContinue = !this.isEditingContinue;
        const btn = document.getElementById("btn-edit-continue");
        const txt = document.getElementById("edit-btn-text");
        if (btn) btn.classList.toggle("active", this.isEditingContinue);
        if (txt) txt.textContent = this.isEditingContinue ? "Done" : "Edit";
        this.renderContinueWatching();
      });

    // Continue Watching Side Navigation Arrows
    const continueGrid = document.getElementById("continue-watching-grid");
    document
      .getElementById("continue-prev-btn")
      ?.addEventListener("click", () => {
        continueGrid?.scrollBy({ left: -320, behavior: "smooth" });
      });
    document
      .getElementById("continue-next-btn")
      ?.addEventListener("click", () => {
        continueGrid?.scrollBy({ left: 320, behavior: "smooth" });
      });

    // Providers carousel arrows
    const providersRow = document.getElementById("providers-list");

    document
      .getElementById("providers-prev-btn")
      ?.addEventListener("click", () => {
        providersRow?.scrollBy({ left: -320, behavior: "smooth" });
      });

    document
      .getElementById("providers-next-btn")
      ?.addEventListener("click", () => {
        providersRow?.scrollBy({ left: 320, behavior: "smooth" });
      });

    // Hero Play Button
    document.getElementById("hero-play-btn")?.addEventListener("click", () => {
      const current = this.heroSlides[this.heroIndex];
      if (current) this.openPlayer(current);
    });

    // Hero Info Button
    document.getElementById("hero-info-btn")?.addEventListener("click", () => {
      const current = this.heroSlides[this.heroIndex];
      if (current) this.openDetails(current.id, current.media_type);
    });

    // Hero Watchlist Button
    document
      .getElementById("hero-watchlist-btn")
      ?.addEventListener("click", () => {
        const current = this.heroSlides[this.heroIndex];
        if (current) {
          const isSaved = storageService.toggleWatchlist(current);
          document.getElementById("hero-watchlist-btn").innerHTML =
            `<i class="fa-solid ${isSaved ? "fa-check" : "fa-plus"}"></i>`;
        }
      });

    document.getElementById("scroll-top-btn")?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  openPlayer(media) {
    this.previousPage = this.activePage;
    this.activePage = "player";
    document.body.classList.add("player-mode"); // Hides floating navbar

    this.heroShowcaseEl.style.display = "none";
    this.continueWatchingSection.style.display = "none";
    this.providersSection.style.display = "none";
    this.gridSection.style.display = "none";
    this.detailView.hide();
    this.castView.hide();
    this.settingsView.hide();
    this.liveTvView?.container && (this.liveTvView.container.style.display = "none");

    this.playerView.render(media);
  }

  async updateHeroSlide(index) {
    if (!this.heroSlides[index]) return;
    this.heroIndex = index;
    const item = this.heroSlides[index];
    const backdropUrl = item.backdrop_path || item.poster_path;

    if (this.heroBackdropImg && backdropUrl)
      this.heroBackdropImg.src = backdropUrl;
    if (this.ambientImageEl && backdropUrl)
      this.ambientImageEl.style.backgroundImage = `url('${backdropUrl}')`;

    if (backdropUrl) {
      const rgb = await colorExtractor.extractDominantColor(backdropUrl);
      colorExtractor.applyAmbientLighting(rgb);
    }

    if (this.heroTitleEl) this.heroTitleEl.textContent = item.title;
    if (this.heroRatingEl)
      this.heroRatingEl.textContent = `${item.vote_average || "8.2"}/10`;
    if (this.heroYearEl)
      this.heroYearEl.textContent = (item.release_date || "2024").slice(0, 4);
    if (this.heroGenreEl)
      this.heroGenreEl.textContent =
        item.media_type === "tv" ? "Series" : "Movie";
    if (this.heroSynopsisEl) this.heroSynopsisEl.textContent = item.overview;

    if (this.heroIndicatorsEl) {
      this.heroIndicatorsEl.querySelectorAll("span").forEach((dot, i) => {
        dot.className = i === index ? "indicator-bar active" : "indicator-dot";
      });
    }
  }

  _renderSlideIndicators() {
    if (!this.heroIndicatorsEl) return;
    const count = Math.min(this.heroSlides.length, 6);

    this.heroIndicatorsEl.innerHTML = Array.from(
      { length: count },
      (_, i) => `
            <span class="${i === 0 ? "indicator-bar active" : "indicator-dot"}" data-slide="${i}"></span>
        `,
    ).join("");

    this.heroIndicatorsEl.addEventListener("click", (e) => {
      const dot = e.target.closest("[data-slide]");
      if (dot) this.updateHeroSlide(Number(dot.dataset.slide));
    });
  }

  renderContinueWatching() {
    const items = storageService.getContinueWatching();
    if (!this.continueWatchingSection || !this.continueGridEl) return;

    if (items.length === 0 || this.activePage !== "home") {
      this.continueWatchingSection.style.display = "none";
      return;
    }

    this.continueWatchingSection.style.display = "block";
    this.continueGridEl.innerHTML = items
      .map((item) => {
        const percent = Math.min(
          100,
          Math.round((item.currentTime / item.duration) * 100),
        );
        const remaining = storageService.formatRemainingTime(
          item.currentTime,
          item.duration,
        );
        const isTv = item.media_type === "tv";

        return `
                <div class="continue-card ${this.isEditingContinue ? "editing" : ""}" data-id="${item.id}" data-type="${item.media_type || "movie"}">
                    <div class="continue-thumb-box">
                        <img 
                            src="${item.backdrop_path || item.poster_path}" 
                            alt="${escapeHtml(item.title)}" 
                            class="continue-thumb-img"
                            onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500';"
                        >
                        ${
                          this.isEditingContinue
                            ? `
                            <button type="button" class="continue-delete-btn" data-delete-id="${item.id}" title="Remove from Continue Watching">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        `
                            : `
                            <div class="continue-play-overlay"><i class="fa-solid fa-play"></i></div>
                        `
                        }
                        <div class="continue-progress-bar"><div class="progress-fill" style="width: ${percent}%;"></div></div>
                    </div>
                    <div class="continue-info">
                        <strong class="continue-title">${escapeHtml(item.title)}</strong>
                        <span class="continue-subtitle">
                            ${isTv ? `S${item.season}:E${item.episode} · ` : ""}
                            <i class="fa-regular fa-clock"></i> ${remaining}
                        </span>
                    </div>
                </div>
            `;
      })
      .join("");

    // Handle clicks: delete in edit mode, play in normal mode
    this.continueGridEl.querySelectorAll(".continue-card").forEach((card) => {
      card.onclick = (e) => {
        const deleteBtn = e.target.closest(".continue-delete-btn");
        if (deleteBtn) {
          e.stopPropagation();
          const id = Number(deleteBtn.dataset.deleteId);
          storageService.removeContinueWatching(id);
          return;
        }

        if (!this.isEditingContinue) {
          const id = Number(card.dataset.id);
          const found = items.find((x) => x.id === id);
          if (found) this.openPlayer(found);
        }
      };
    });
  }

  _renderProviders() {
    if (!this.providersRowEl) return;

    const providerList = [
      {
        id: 8,
        name: "Netflix",
        logo: "https://image.tmdb.org/t/p/w154/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
      },
      {
        id: 9,
        name: "Amazon Prime",
        logo: "https://image.tmdb.org/t/p/w154/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
      },
      {
        id: 337,
        name: "Disney+",
        logo: "https://image.tmdb.org/t/p/w154/97yvRBw1GzX7fXprcF80er19ot.jpg",
      },
      {
        id: 350,
        name: "Apple TV+",
        logo: "https://image.tmdb.org/t/p/w154/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg",
      },
      {
        id: 15,
        name: "Hulu",
        logo: "https://image.tmdb.org/t/p/w154/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg",
      },
      {
        id: 1899,
        ids: [1899, 384, 1825],
        name: "Max",
        logo: "https://image.tmdb.org/t/p/w154/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
      },
      {
        id: 531,
        ids: [531, 582, 633, 1770, 1853, 2303, 2616],
        name: "Paramount+",
        logo: "https://image.tmdb.org/t/p/w154/h5DcR0J2EESLitnhR8xLG1QymTE.jpg",
      },
      {
        id: 386,
        ids: [386, 387],
        name: "Peacock",
        logo: "https://image.tmdb.org/t/p/w154/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg",
      },
      {
        id: 43,
        name: "Starz",
        logo: "https://image.tmdb.org/t/p/w154/yIKwylTLP1u8gl84Is7FItpYLGL.jpg",
      },
      {
        id: 34,
        name: "MGM+",
        logo: "https://image.tmdb.org/t/p/w154/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg",
      },
      {
        id: 526,
        name: "AMC+",
        logo: "https://image.tmdb.org/t/p/w154/ovmu6uot1XVvsemM2dDySXLiX57.jpg",
      },
      {
        id: 283,
        name: "Crunchyroll",
        logo: "https://image.tmdb.org/t/p/w154/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg",
      },
      {
        id: 73,
        name: "Tubi",
        logo: "https://image.tmdb.org/t/p/w154/9dEuvA8wg5TSeFBZlPxSVxFdimJ.png",
      },
      {
        id: 300,
        name: "Pluto TV",
        logo: "https://image.tmdb.org/t/p/w154/fN4czqaMQNLeF6sSSIjGbAWzvwK.png",
      },
      {
        id: 257,
        name: "fuboTV",
        logo: "https://image.tmdb.org/t/p/w154/9BgaNQRMDvVlji1JBZi6tcfxpKx.jpg",
      },
      {
        id: 99,
        name: "Shudder",
        logo: "https://image.tmdb.org/t/p/w154/vEtdiYRPRbDCp1Tcn3BEPF1Ni76.jpg",
      },
      {
        id: 87,
        name: "Acorn TV",
        logo: "https://image.tmdb.org/t/p/w154/doCc555FPPgGtuaZJxf9QZVpIp5.jpg",
      },
      {
        id: 151,
        name: "BritBox",
        logo: "https://image.tmdb.org/t/p/w154/ykV2tyni0cD3XV6BEQnE6NXTq6F.jpg",
      },
      {
        id: 11,
        name: "MUBI",
        logo: "https://image.tmdb.org/t/p/w154/x570VpH2C9EKDf1riP83rYc5dnL.jpg",
      },
      {
        id: 258,
        name: "Criterion",
        logo: "https://image.tmdb.org/t/p/w154/yhrtzYd43pFIhRq0ruO8umJPuyn.jpg",
      },
      {
        id: 190,
        name: "Curiosity",
        logo: "https://image.tmdb.org/t/p/w154/oR1aNm1Qu9jQBkW4VrGPWhqbC3P.jpg",
      },
      {
        id: 520,
        name: "Discovery+",
        logo: "https://image.tmdb.org/t/p/w154/eMTnWwNVtThkjvQA6zwxaoJG9NE.jpg",
      },
    ];

    this.providersRowEl.innerHTML = providerList
      .map(
        (p) => `
        <div class="provider-squircle-item"
             data-id="${p.id}"
             data-provider-ids="${(p.ids || [p.id]).join(",")}"
             data-name="${p.name}"
             data-logo="${p.logo}">
          <div class="squircle-box">
            <img src="${p.logo}"
                 alt="${p.name}"
                 class="squircle-img"
                 loading="lazy"
                 onerror="this.style.display='none'">
          </div>
          <span class="provider-name">${p.name}</span>
        </div>
      `,
      )
      .join("");

    this.providersRowEl.addEventListener("click", (e) => {
      const item = e.target.closest(".provider-squircle-item");
      if (!item) return;

      const providerId = Number(item.dataset.id);
      const providerIds = (item.dataset.providerIds || String(providerId))
        .split(",")
        .map(Number)
        .filter(Number.isFinite);
      const providerName = item.dataset.name;
      const providerLogo = item.dataset.logo;

      this.openNetworkView(providerId, providerName, providerLogo, providerIds);
    });
  }

  async openDetails(id, mediaType = "movie") {
    this.previousPage = this.activePage;
    this.activePage = "detail";
    this.detailView.hide();
    this.castView.hide();
    this.settingsView.hide();
    this.playerView.hide();
    if (this.liveTvView?.container) this.liveTvView.container.style.display = "none";
    this._removePagination();

    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("detail");

    this.heroShowcaseEl.style.display = "none";
    this.continueWatchingSection.style.display = "none";
    this.providersSection.style.display = "none";
    this.gridSection.style.display = "none";

    await this.detailView.render(id, mediaType);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async openCastView(personId, seed = {}) {
    if (!personId || !this.castView) return;
    this.previousCastPage = this.activePage;
    this.activePage = "cast";
    this.detailView.hide();
    this.castView.hide();
    this.settingsView.hide();
    this.playerView.hide();
    this._removePagination();
    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("detail");
    this.heroShowcaseEl.style.display = "none";
    this.continueWatchingSection.style.display = "none";
    this.providersSection.style.display = "none";
    this.gridSection.style.display = "none";
    await this.castView.render(personId, seed);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  closeCastView() {
    const target = this.previousCastPage === "detail" ? "detail" : "home";
    this.castView.hide();
    if (target === "detail" && this.detailView.currentDetail) {
      this.activePage = "detail";
      this.detailView.container.style.display = "block";
      this.navbar.setActiveTab("detail");
      document.body.classList.add("subpage-mode");
      this.heroShowcaseEl.style.display = "none";
      this.continueWatchingSection.style.display = "none";
      this.providersSection.style.display = "none";
      this.gridSection.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    this.navigate("home");
  }

  async openNetworkView(
    providerId,
    providerName,
    providerLogo,
    providerIds = null,
  ) {
    this.activePage = "network";
    const ids =
      Array.isArray(providerIds) && providerIds.length
        ? providerIds
        : [Number(providerId)].filter(Number.isFinite);
    this.selectedProvider = {
      id: Number(providerId),
      ids,
      name: providerName,
      logo: providerLogo,
    };
    this.activeMediaType = "all";
    this.activeGenre = "all";
    this.currentPage = 1;

    this.detailView.hide();
    this.settingsView.hide();
    this.playerView.hide();
    if (this.liveTvView?.container) this.liveTvView.container.style.display = "none";
    this._removePagination();

    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("network");

    this.heroShowcaseEl.style.display = "none";
    this.continueWatchingSection.style.display = "none";
    this.providersSection.style.display = "none";
    this.gridSection.style.display = "block";

    const isCrunchyroll = providerName.toLowerCase().includes("crunchyroll");

    // Dynamic ambient lighting per provider
    if (isCrunchyroll) {
      colorExtractor.applyAmbientLighting({ r: 244, g: 117, b: 33 });
      if (this.ambientImageEl) {
        this.ambientImageEl.style.backgroundImage = "url('assets/images/yuta_pnganime.png')";
      }
    } else {
      if (this.ambientImageEl) {
        this.ambientImageEl.style.backgroundImage = "";
      }

      if (providerName.toLowerCase().includes("netflix")) {
        colorExtractor.applyAmbientLighting({ r: 229, g: 9, b: 20 });
      } else if (providerName.toLowerCase().includes("disney")) {
        colorExtractor.applyAmbientLighting({ r: 17, g: 60, b: 207 });
      } else if (
        providerName.toLowerCase().includes("hbo") ||
        providerName.toLowerCase().includes("max")
      ) {
        colorExtractor.applyAmbientLighting({ r: 88, g: 28, b: 135 });
      } else if (providerName.toLowerCase().includes("paramount")) {
        colorExtractor.applyAmbientLighting({ r: 0, g: 84, b: 166 });
      } else {
        colorExtractor.applyAmbientLighting({ r: 34, g: 197, b: 94 });
      }
    }

    // Crunchyroll card background with linear gradient so text stays legible
    // 1. Crunchyroll styling with background image
    const crunchyrollCardStyle = isCrunchyroll
      ? `
          position: relative;
          overflow: hidden;
          padding: 1rem;
          border-radius: 8px;
          background: linear-gradient(90deg, rgba(14, 14, 16, 0.96) 25%, rgba(14, 14, 16, 0.75) 60%, rgba(244, 117, 33, 0.25) 100%), 
                      url('assets/images/yuta_pnganime.png') right center / contain no-repeat;
        `
      : "";

    // 2. Add margin-top (clamp gives ~85px on desktop, scaling nicely on mobile)
    this.gridSection.querySelector(".section-header").innerHTML = `
        <div style="width: 100%; margin-top: clamp(75px, 9vh, 95px);">
            <div class="network-hero-card" style="${crunchyrollCardStyle}">
                <div class="network-identity">
                    <div class="network-logo-frame">
                        <img src="${providerLogo}" alt="${escapeHtml(providerName)}" onerror="this.src='https://image.tmdb.org/t/p/w154/uFL3c4Cq8M6WoLymlC5Y8bmGytV.png'">
                    </div>
                    <div class="network-meta">
                        <h1>${escapeHtml(providerName)} Catalog</h1>
                        <span>Explore 4K HDR releases, anime, movies, and exclusive series</span>
                    </div>
                </div>
                <div class="network-type-tabs" id="network-tabs">
                    <button type="button" class="tab-btn active" data-type="all">All</button>
                    <button type="button" class="tab-btn" data-type="movie">Movies</button>
                    <button type="button" class="tab-btn" data-type="tv">TV Shows</button>
                </div>
            </div>
            <div class="genre-pill-bar" id="subpage-genres">
                ${GENRE_LIST.map(
                  (g) => `
                    <button type="button" class="genre-pill ${g.id === this.activeGenre ? "active" : ""}" data-genre="${g.id}">
                        ${g.name}
                    </button>
                `,
                ).join("")}
            </div>
        </div>
    `;

    document.getElementById("network-tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      document
        .querySelectorAll("#network-tabs .tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.activeMediaType = btn.dataset.type;
      this.currentPage = 1;
      this.loadNetworkCatalog();
    });

    document
      .getElementById("subpage-genres")
      ?.addEventListener("click", (e) => {
        const pill = e.target.closest(".genre-pill");
        if (!pill) return;
        document
          .querySelectorAll("#subpage-genres .genre-pill")
          .forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        this.activeGenre = pill.dataset.genre;
        this.currentPage = 1;
        this.loadNetworkCatalog();
      });

    await this.loadNetworkCatalog();
  }

  async navigate(page) {
    this.activePage = page;
    this.currentPage = 1;
    this.activeGenre = "all";
    this.selectedProvider = null;

    if (this.ambientImageEl && page !== "home") {
      this.ambientImageEl.style.backgroundImage = "";
    }

    this.detailView.hide();
    this.settingsView.hide();
    this.playerView.hide();

    // Live TV is a real media surface: always tear it down before
    // switching to another page so the video/HLS instance cannot remain
    // mounted over the rest of the site.
    if (page !== "live-tv") {
      this.liveTvView?.destroy?.();
      const liveTvContainer = this.liveTvView?.container || document.getElementById("live-tv-view-container");
      if (liveTvContainer) {
        liveTvContainer.style.display = "none";
        liveTvContainer.setAttribute("aria-hidden", "true");
      }
    }

    this._removePagination();

    const isSubpage = page !== "home";
    document.body.classList.toggle("subpage-mode", isSubpage);
    this.navbar.setActiveTab(page);

    this.gridSection.style.display =
      page === "settings" || page === "player" ? "none" : "block";

    if (page === "home") {
      this.heroShowcaseEl.style.display = "flex";
      this.providersSection.style.display = "block";
      this.renderContinueWatching();
      this.gridSection.querySelector(".section-header").innerHTML = `
                <h2 class="section-title" id="grid-section-title">Trending Movies & Shows</h2>
                <a href="#" class="view-all-link" id="view-all-btn">View All <i class="fa-solid fa-arrow-right"></i></a>
            `;
      await this.loadHomeFeed();
    } else if (page === "movies") {
      this._setupSubpageLayout(
        "Movies",
        "Explore trending blockbusters and new movie releases",
        "movie",
      );
    } else if (page === "shows") {
      this._setupSubpageLayout(
        "TV Shows",
        "Binge-worthy series, docuseries, and original seasons",
        "tv",
      );
    } else if (page === "watchlist") {
      this._setupWatchlistLayout();
    } else if (page === "live-tv") {
      this.heroShowcaseEl.style.display = "none";
      this.providersSection.style.display = "none";
      this.continueWatchingSection.style.display = "none";
      this.gridSection.style.display = "none";

      if (this.liveTvView?.container) {
        this.liveTvView.container.style.display = "block";
        this.liveTvView.container.setAttribute("aria-hidden", "false");
        await this.liveTvView.render();
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (page === "settings") {
      this.providersSection.style.display = "none";
      this.continueWatchingSection.style.display = "none";
      this.settingsView.render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  _setupSubpageLayout(title, subtitle, mediaType) {
    this.heroShowcaseEl.style.display = "none";
    this.providersSection.style.display = "none";
    this.continueWatchingSection.style.display = "none";

    this.gridSection.querySelector(".section-header").innerHTML = `
            <div class="subpage-header-box" style="width: 100%;">
                <div class="subpage-title-row">
                    <div>
                        <h1 class="subpage-title">${title}</h1>
                        <span class="subpage-subtitle">${subtitle}</span>
                    </div>
                </div>
                <div class="genre-pill-bar" id="subpage-genres">
                    ${GENRE_LIST.map(
                      (g) => `
                        <button type="button" class="genre-pill ${g.id === this.activeGenre ? "active" : ""}" data-genre="${g.id}">
                            ${g.name}
                        </button>
                    `,
                    ).join("")}
                </div>
            </div>
        `;

    document
      .getElementById("subpage-genres")
      ?.addEventListener("click", (e) => {
        const pill = e.target.closest(".genre-pill");
        if (!pill) return;

        document
          .querySelectorAll("#subpage-genres .genre-pill")
          .forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");

        this.activeGenre = pill.dataset.genre;
        this.currentPage = 1;
        this.loadSubpageCatalog(mediaType);
      });

    this.loadSubpageCatalog(mediaType);
  }

  _setupWatchlistLayout() {
    this.heroShowcaseEl.style.display = "none";
    this.providersSection.style.display = "none";
    this.continueWatchingSection.style.display = "none";

    const list = storageService.getWatchlist();

    this.gridSection.querySelector(".section-header").innerHTML = `
            <div class="subpage-header-box" style="width: 100%;">
                <div class="subpage-title-row">
                    <div>
                        <h1 class="subpage-title">My Saved Watchlist</h1>
                        <span class="subpage-subtitle">${list.length} titles saved to your personal library</span>
                    </div>
                </div>
            </div>
        `;

    if (list.length === 0) {
      this.mediaGridEl.innerHTML = `
                <div class="empty-state-box">
                    <i class="fa-regular fa-bookmark"></i>
                    <h3>Your watchlist is empty</h3>
                    <p>Save movies and shows to keep track of what you want to watch next.</p>
                    <button type="button" class="btn-play" id="empty-explore-btn">
                        <i class="fa-solid fa-compass"></i> Explore Movies
                    </button>
                </div>
            `;
      document
        .getElementById("empty-explore-btn")
        ?.addEventListener("click", () => this.navigate("movies"));
    } else {
      this._renderGrid(list, false);
    }
  }

  async loadHomeFeed() {
    const data = await tmdbService.getTitlesByProvider(337);
    this.heroSlides = data.results || [];

    if (this.heroSlides.length > 0) {
      this.updateHeroSlide(0);
      this._renderSlideIndicators();
      this._renderGrid(this.heroSlides, false);
    }
  }

  async loadSubpageCatalog(mediaType, append = false) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const data = await tmdbService.getTitlesByProvider(337, {
        mediaType,
        genre: this.activeGenre,
        page: this.currentPage,
      });

      this.totalPages = data.total_pages || 1;
      this.catalogItems = append
        ? [...this.catalogItems, ...data.results]
        : data.results;
      this._renderGrid(this.catalogItems, append);

      this._renderPagination(() => {
        this.currentPage++;
        this.loadSubpageCatalog(mediaType, true);
      });
    } finally {
      this.isLoading = false;
    }
  }

  async loadNetworkCatalog(append = false) {
    if (this.isLoading || !this.selectedProvider) return;
    this.isLoading = true;

    try {
      const providerIds =
        Array.isArray(this.selectedProvider.ids) &&
        this.selectedProvider.ids.length
          ? this.selectedProvider.ids
          : [this.selectedProvider.id];

      let data = null;
      let usedProviderId = providerIds[0];

      for (const providerId of providerIds) {
        try {
          const candidate = await tmdbService.getTitlesByProvider(providerId, {
            mediaType: this.activeMediaType,
            genre: this.activeGenre,
            page: this.currentPage,
          });

          const results = Array.isArray(candidate?.results)
            ? candidate.results
            : [];
          if (
            results.length > 0 ||
            providerId === providerIds[providerIds.length - 1]
          ) {
            data = candidate || { results: [], total_pages: 1 };
            usedProviderId = providerId;
            if (results.length > 0) break;
          }
        } catch (error) {
          console.warn(
            `[Provider] TMDB provider ${providerId} failed for ${this.selectedProvider.name}:`,
            error,
          );
        }
      }

      data = data || { results: [], total_pages: 1 };
      this.selectedProvider.activeId = usedProviderId;
      this.totalPages = data.total_pages || 1;
      const results = Array.isArray(data.results) ? data.results : [];
      this.catalogItems = append ? [...this.catalogItems, ...results] : results;
      this._renderGrid(this.catalogItems, append);

      if (!append && results.length === 0) {
        this.mediaGridEl.innerHTML = `
          <div class="empty-state-box">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <h3>No titles available</h3>
            <p>TMDB has no streaming catalog results for ${escapeHtml(this.selectedProvider.name)} with the current filters or region.</p>
          </div>
        `;
      }

      this._renderPagination(() => {
        this.currentPage++;
        this.loadNetworkCatalog(true);
      });
    } catch (error) {
      console.error(
        `[Provider] Failed to load ${this.selectedProvider.name}:`,
        error,
      );
      if (!append && this.mediaGridEl) {
        this.mediaGridEl.innerHTML = `
          <div class="empty-state-box">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Catalog could not be loaded</h3>
            <p>Please check the TMDB API configuration and watch-provider region.</p>
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
    }
  }

  _renderGrid(items, append = false) {
    if (!this.mediaGridEl) return;

    const html = items
      .map(
        (item) => `
            <div class="media-poster-card" data-id="${item.id}" data-type="${item.media_type || "movie"}">
                <img 
                    src="${item.poster_path}" 
                    alt="${escapeHtml(item.title)}" 
                    loading="lazy" 
                    onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500';"
                >
            </div>
        `,
      )
      .join("");

    if (append) {
      this.mediaGridEl.insertAdjacentHTML("beforeend", html);
    } else {
      this.mediaGridEl.innerHTML = html;
    }

    this.mediaGridEl.querySelectorAll(".media-poster-card").forEach((card) => {
      card.onclick = () => {
        const targetId = Number(card.dataset.id);
        const targetType = card.dataset.type || "movie";
        this.openDetails(targetId, targetType);
      };
    });
  }

  _renderPagination(onLoadMore) {
    this._removePagination();

    if (
      this.currentPage >= this.totalPages ||
      this.activePage === "watchlist"
    ) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "pagination-wrap";
    wrap.id = "pagination-box";
    wrap.innerHTML = `
            <button type="button" class="btn-load-more">
                <i class="fa-solid fa-spinner"></i> Load More Titles
            </button>
        `;

    wrap.querySelector(".btn-load-more").onclick = onLoadMore;
    this.gridSection.appendChild(wrap);
  }

  _removePagination() {
    document.getElementById("pagination-box")?.remove();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new StreamFlixApp();
  app.init();
  window.StreamFlixApp = app;
});
