// ============================================================================
// js/app.js
// StreamFlix Master Application Orchestrator — True Step-by-Step History Stack
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
import { TopUsersView } from "./components/community/topUsers.js";

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
    this.activeGenre = "all";
    this.activeMediaType = "all";
    this.selectedProvider = null;
    this.heroIndex = 0;
    this.heroSlides = [];
    this.catalogItems = [];
    this.isLoading = false;
    this.isEditingContinue = false;

    // Track active detail item
    this.currentDetailId = null;
    this.currentDetailType = "movie";

    // Watchlist sub-tab state ('my-list' | 'community')
    this.watchlistSubTab = "my-list";
    this.cachedPublicLists = [];

    // ─── Step-by-Step Navigation Stack ───
    this.viewStack = [];
    this._isNavigatingBack = false;

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
    this.navBackBtn = document.getElementById("nav-back-btn");

    // Initialize Components
    this.trailerModal = new TrailerModal();

    this.playerView = new PlayerView("player-view-container", () => {
      this.goBack();
    });

    this.settingsView = new SettingsView("settings-view-container");
    this.liveTvView = new LiveTvView(
      document.getElementById("live-tv-view-container"),
    );

    this.topUsersView = new TopUsersView("top-users-view-container", {
      onBack: () => this.goBack(),
    });

    this.navbar = new Navbar(
      (page) => {
        this.viewStack = []; // Reset history stack on explicit navbar tab click
        this.navigate(page);
      },
      (item) => this.openDetails(item.id, item.media_type),
    );

    this.castView = new CastView("cast-view-container", {
      onBack: () => this.goBack(),
      onOpenTitle: (id, type) => this.openDetails(id, type),
    });

    this.detailView = new DetailView(
      "detail-view-container",
      (item) => this.openPlayer(item),
      (item) => this.trailerModal.open(item),
      (id, type) => this.openDetails(id, type),
      (personId, seed) => this.openCastView(personId, seed),
      () => this.goBack(),
    );

    if (this.detailView) {
      this.detailView.onBack = () => this.goBack();
    }
  }

  async init() {
    this._renderProviders();
    this._bindEvents();
    this.renderContinueWatching();
    await this.navigate("home", false);
  }

  // ─── Stack-based Router ───────────────────────────────────────────────────

  _saveCurrentState() {
    const scrollY = window.scrollY;

    if (this.activePage === "home") {
      return { view: "home", scrollY };
    }

    if (this.activePage === "network" && this.selectedProvider) {
      return {
        view: "network",
        providerId: this.selectedProvider.id,
        providerName: this.selectedProvider.name,
        providerLogo: this.selectedProvider.logo,
        providerIds: this.selectedProvider.ids,
        activeMediaType: this.activeMediaType,
        activeGenre: this.activeGenre,
        currentPage: this.currentPage,
        catalogItems: [...this.catalogItems],
        headerHTML:
          this.gridSection.querySelector(".section-header")?.innerHTML || "",
        scrollY,
      };
    }

    if (this.activePage === "movies" || this.activePage === "shows") {
      return {
        view: this.activePage,
        activeGenre: this.activeGenre,
        currentPage: this.currentPage,
        catalogItems: [...this.catalogItems],
        scrollY,
      };
    }

    if (this.activePage === "watchlist") {
      return {
        view: "watchlist",
        watchlistSubTab: this.watchlistSubTab,
        scrollY,
      };
    }

    if (this.activePage === "detail") {
      return {
        view: "detail",
        id: this.currentDetailId,
        mediaType: this.currentDetailType,
        scrollY,
      };
    }

    if (this.activePage === "cast") {
      return { view: "cast", scrollY };
    }

    if (this.activePage === "settings") {
      return { view: "settings", scrollY };
    }

    return { view: "home", scrollY: 0 };
  }

  _pushState() {
    if (this._isNavigatingBack) return;
    const currentState = this._saveCurrentState();
    this.viewStack.push(currentState);
    this._updateNavBackVisibility();

    try {
      window.history.pushState({ depth: this.viewStack.length }, "");
    } catch {}
  }

  _updateNavBackVisibility() {
    if (this.navBackBtn) {
      // Ghayban f ga3 les vues mn ghir Home (Movies, Shows, Lists, Details, etc.)
      const shouldShow = this.activePage !== "home";
      this.navBackBtn.style.display = shouldShow ? "inline-flex" : "none";
    }
  }

  async goBack() {
    if (this.viewStack.length === 0) {
      await this.navigate("home", false);
      return;
    }

    this._isNavigatingBack = true;
    const prevState = this.viewStack.pop();
    this._updateNavBackVisibility();

    try {
      await this._restoreState(prevState);
    } finally {
      this._isNavigatingBack = false;
    }
  }

  async _restoreState(state) {
    if (!state || state.view === "home") {
      await this._showHome(state?.scrollY || 0);
      return;
    }

    switch (state.view) {
      case "network": {
        this.activePage = "network";
        this.selectedProvider = {
          id: state.providerId,
          ids: state.providerIds,
          name: state.providerName,
          logo: state.providerLogo,
        };
        this.activeMediaType = state.activeMediaType || "all";
        this.activeGenre = state.activeGenre || "all";
        this.currentPage = state.currentPage || 1;
        this.catalogItems = state.catalogItems || [];

        this._hideAllViews();

        document.body.classList.add("subpage-mode");
        this.navbar.setActiveTab("network");
        this.gridSection.style.display = "block";

        if (state.headerHTML) {
          this.gridSection.querySelector(".section-header").innerHTML =
            state.headerHTML;
          this._bindNetworkHeaderEvents();
        }

        if (this.catalogItems.length > 0) {
          this._renderGrid(this.catalogItems, false);
          this._renderPagination(() => {
            this.currentPage++;
            this.loadNetworkCatalog(true);
          });
        } else {
          await this.loadNetworkCatalog();
        }

        window.scrollTo({ top: state.scrollY || 0, behavior: "instant" });
        break;
      }

      case "detail": {
        if (this.detailView?.container && this.currentDetailId === state.id) {
          this._hideAllViews();
          document.body.classList.add("subpage-mode");
          this.navbar.setActiveTab("detail");
          this.detailView.container.style.display = "block";
        } else {
          await this.openDetails(state.id, state.mediaType, false);
        }
        window.scrollTo({ top: state.scrollY || 0, behavior: "instant" });
        break;
      }

      case "movies": {
        this.activeGenre = state.activeGenre || "all";
        this.currentPage = state.currentPage || 1;
        this._setupSubpageLayout(
          "Movies",
          "Explore trending blockbusters and new movie releases",
          "movie",
        );
        window.scrollTo({ top: state.scrollY || 0, behavior: "instant" });
        break;
      }

      case "shows": {
        this.activeGenre = state.activeGenre || "all";
        this.currentPage = state.currentPage || 1;
        this._setupSubpageLayout(
          "TV Shows",
          "Binge-worthy series, docuseries, and original seasons",
          "tv",
        );
        window.scrollTo({ top: state.scrollY || 0, behavior: "instant" });
        break;
      }

      case "watchlist": {
        this.watchlistSubTab = state.watchlistSubTab || "my-list";
        await this._setupWatchlistLayout();
        window.scrollTo({ top: state.scrollY || 0, behavior: "instant" });
        break;
      }

      case "settings": {
        await this.navigate("settings", false);
        break;
      }

      default:
        await this._showHome(0);
    }
  }

  // ─── Clean View Isolator ──────────────────────────────────────────────────
  _hideAllViews() {
    if (this.heroShowcaseEl) this.heroShowcaseEl.style.display = "none";
    if (this.continueWatchingSection)
      this.continueWatchingSection.style.display = "none";
    if (this.providersSection) this.providersSection.style.display = "none";
    if (this.gridSection) this.gridSection.style.display = "none";

    this.detailView?.hide?.();
    this.castView?.hide?.();
    this.playerView?.hide?.();
    this.settingsView?.hide?.();
    this.topUsersView?.hide?.();

    if (this.liveTvView) {
      this.liveTvView.destroy?.();
      const liveTvEl =
        this.liveTvView.container ||
        document.getElementById("live-tv-view-container");
      if (liveTvEl) {
        liveTvEl.style.display = "none";
        liveTvEl.setAttribute("aria-hidden", "true");
      }
    }

    document.body.classList.remove("player-mode");
    this._removePagination();
    this._updateNavBackVisibility();
  }

  // ─── Events & Interceptions ───────────────────────────────────────────────
  _bindEvents() {
    window.addEventListener("popstate", () => {
      this.goBack();
    });

    window.addEventListener("cinejoy:progress-updated", () => {
      this.renderContinueWatching();
    });

    // Capture Phase Listener: Intercepts ANY back button
    document.addEventListener(
      "click",
      (e) => {
        const backBtn = e.target.closest(
          "#nav-back-btn, #detail-back-btn, .btn-detail-back, .detail-back-btn, .btn-player-back, #player-back-btn, .cast-back-btn, [data-action='back']",
        );
        if (backBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.goBack();
        }
      },
      true,
    );

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

    document.getElementById("hero-play-btn")?.addEventListener("click", () => {
      const current = this.heroSlides[this.heroIndex];
      if (current) this.openPlayer(current);
    });

    document.getElementById("hero-info-btn")?.addEventListener("click", () => {
      const current = this.heroSlides[this.heroIndex];
      if (current) this.openDetails(current.id, current.media_type);
    });

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

  // ─── Main Navigation ───────────────────────────────────────────────────────

  async navigate(page, push = true) {
    if (push && this.activePage !== page) {
      this._pushState();
    }

    this.activePage = page;
    this.currentPage = 1;
    this.activeGenre = "all";
    this.selectedProvider = null;

    this._hideAllViews();

    const isSubpage = page !== "home";
    document.body.classList.toggle("subpage-mode", isSubpage);
    this.navbar.setActiveTab(page);

    if (this.ambientImageEl && page !== "home") {
      this.ambientImageEl.style.backgroundImage = "";
    }

    if (page === "home") {
      await this._showHome(0);
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
      await this._setupWatchlistLayout();
    } else if (page === "live-tv") {
      const liveTvEl =
        this.liveTvView?.container ||
        document.getElementById("live-tv-view-container");
      if (liveTvEl) {
        liveTvEl.style.display = "block";
        liveTvEl.setAttribute("aria-hidden", "false");
        await this.liveTvView.render();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (page === "settings") {
      this.settingsView.render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (page === "top-users") {
      await this.topUsersView.render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async _showHome(scrollTop = 0) {
    this.activePage = "home";
    this._hideAllViews();

    document.body.classList.remove("subpage-mode");
    this.navbar.setActiveTab("home");

    if (this.heroShowcaseEl) this.heroShowcaseEl.style.display = "flex";
    if (this.providersSection) this.providersSection.style.display = "block";
    if (this.gridSection) this.gridSection.style.display = "block";

    this.renderContinueWatching();

    const header = this.gridSection.querySelector(".section-header");
    if (header) {
      header.innerHTML = `
        <h2 class="section-title" id="grid-section-title">Trending Movies & Shows</h2>
        <a href="#" class="view-all-link" id="view-all-btn">View All <i class="fa-solid fa-arrow-right"></i></a>
      `;

      document
        .getElementById("view-all-btn")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          this.navigate("movies");
        });
    }

    if (this.heroSlides.length === 0) {
      await this.loadHomeFeed();
    } else {
      this.updateHeroSlide(this.heroIndex || 0);
      this._renderGrid(this.heroSlides, false);
    }

    window.scrollTo({ top: scrollTop, behavior: "instant" });
  }

  // ─── Network View ─────────────────────────────────────────────────────────

  async openNetworkView(
    providerId,
    providerName,
    providerLogo,
    providerIds = null,
    push = true,
  ) {
    const ids =
      Array.isArray(providerIds) && providerIds.length
        ? providerIds
        : [Number(providerId)].filter(Number.isFinite);

    if (push) {
      this._pushState();
    }

    this.activePage = "network";
    this.selectedProvider = {
      id: Number(providerId),
      ids,
      name: providerName,
      logo: providerLogo,
    };
    this.activeMediaType = "all";
    this.activeGenre = "all";
    this.currentPage = 1;

    this._hideAllViews();

    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("network");
    this.gridSection.style.display = "block";

    const isCrunchyroll = providerName.toLowerCase().includes("crunchyroll");

    if (isCrunchyroll) {
      colorExtractor.applyAmbientLighting({ r: 244, g: 117, b: 33 });
      if (this.ambientImageEl) {
        this.ambientImageEl.style.backgroundImage =
          "url('assets/images/yuta_pnganime.png')";
      }
    } else {
      if (this.ambientImageEl) this.ambientImageEl.style.backgroundImage = "";

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

    this._bindNetworkHeaderEvents();
    await this.loadNetworkCatalog();
  }

  _bindNetworkHeaderEvents() {
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
  }

  // ─── Details, Player & Cast ───────────────────────────────────────────────

  async openDetails(id, mediaType = "movie", push = true) {
    if (push) {
      this._pushState();
    }

    this.currentDetailId = id;
    this.currentDetailType = mediaType;
    this.activePage = "detail";

    this._hideAllViews();

    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("detail");

    await this.detailView.render(id, mediaType);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  openPlayer(media) {
    this._pushState();
    this.activePage = "player";

    // Hide background views but keep detail container ready
    if (this.heroShowcaseEl) this.heroShowcaseEl.style.display = "none";
    if (this.continueWatchingSection)
      this.continueWatchingSection.style.display = "none";
    if (this.providersSection) this.providersSection.style.display = "none";
    if (this.gridSection) this.gridSection.style.display = "none";
    if (this.detailView?.container)
      this.detailView.container.style.display = "none";

    document.body.classList.add("player-mode");
    this.playerView.render(media);
  }

  async openCastView(personId, seed = {}, push = true) {
    if (!personId || !this.castView) return;

    if (push) {
      this._pushState();
    }

    this.activePage = "cast";
    this._hideAllViews();

    document.body.classList.add("subpage-mode");
    this.navbar.setActiveTab("detail");

    await this.castView.render(personId, seed);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Subpages ─────────────────────────────────────────────────────────────

  _setupSubpageLayout(title, subtitle, mediaType) {
    this._hideAllViews();
    document.body.classList.add("subpage-mode");
    this.gridSection.style.display = "block";

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

  // ─── Full Discover & Watchlist Implementation (Safe & Bulletproof) ────────
  async _setupWatchlistLayout() {
    this._hideAllViews();
    document.body.classList.add("subpage-mode");
    this.gridSection.style.display = "block";

    const mySavedList = storageService.getWatchlist();

    this.gridSection.querySelector(".section-header").innerHTML = `
      <div class="subpage-header-box" style="width: 100%;">
        <div class="subpage-title-row" style=" padding-top: 2rem;  flex-wrap:wrap;gap:18px;align-items:flex-end;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#22c55e;display:grid;place-items:center;font-size:0.95rem;">
                <i class="fa-solid fa-compass"></i>
              </span>
              <h1 class="subpage-title" style="margin:0;">Discover &amp; Lists</h1>
            </div>
            <span class="subpage-subtitle" id="watchlist-subtitle-tag">
              ${
                this.watchlistSubTab === "my-list"
                  ? `${mySavedList.length} titles saved to your personal library`
                  : "Explore public collections from the community"
              }
            </span>
          </div>

          <div class="lists-search-box" id="community-search-box" style="display:${this.watchlistSubTab === "community" ? "block" : "none"};">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="input-community-search" placeholder="Search list names..." autocomplete="off">
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;gap:12px;flex-wrap:wrap;">
          <div class="genre-pill-bar" style="margin-bottom:0;">
            <button type="button" class="genre-pill ${this.watchlistSubTab === "my-list" ? "active" : ""}" id="tab-btn-personal">
              <i class="fa-regular fa-bookmark"></i> My Watchlist (${mySavedList.length})
            </button>
            <button type="button" class="genre-pill ${this.watchlistSubTab === "community" ? "active" : ""}" id="tab-btn-community">
              <i class="fa-solid fa-earth-americas"></i> Community Lists
            </button>
          </div>

          ${
            mySavedList.length > 0
              ? `
                <button type="button" class="btn-create-list" id="btn-publish-my-list" title="Publish your current watchlist for others to see">
                  <i class="fa-solid fa-cloud-arrow-up"></i> Share My List Publicly
                </button>
              `
              : ""
          }
        </div>
      </div>
    `;

    if (this.watchlistSubTab === "my-list") {
      this._renderPersonalWatchlist(mySavedList);
    } else {
      await this._renderCommunityLists();
    }

    document
      .getElementById("tab-btn-personal")
      ?.addEventListener("click", () => {
        this.watchlistSubTab = "my-list";
        this._setupWatchlistLayout();
      });

    document
      .getElementById("tab-btn-community")
      ?.addEventListener("click", () => {
        this.watchlistSubTab = "community";
        this._setupWatchlistLayout();
      });

    document
      .getElementById("btn-publish-my-list")
      ?.addEventListener("click", async () => {
        try {
          const { getCurrentUser } =
            await import("./firebase/firebase-auth.js");
          const user = getCurrentUser();

          if (!user) {
            alert("Please sign in from Settings to publish your list.");
            this.navigate("settings");
            return;
          }

          const listName = prompt(
            "Enter a name for your public list:",
            `${user.displayName || "My"} Favorite Picks`,
          );
          if (!listName || !listName.trim()) return;

          const { createCommunityList } =
            await import("./firebase/firebase-lists.js");
          await createCommunityList({
            title: listName.trim(),
            isPublic: true,
            items: mySavedList,
          });

          alert("🎉 Your list has been published!");
          this.watchlistSubTab = "community";
          await this._setupWatchlistLayout();
        } catch (err) {
          console.error("Publish list error:", err);
          alert("Failed to publish: " + (err.message || "Unknown error"));
        }
      });
  }

  _renderPersonalWatchlist(list) {
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

  async _renderCommunityLists() {
    this.mediaGridEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem;color:#22c55e;"></i>
        <div style="margin-top:12px;">Loading community lists...</div>
      </div>
    `;

    try {
      // Safe Dynamic Import to prevent blank page crashes
      const { getPublicCommunityLists } =
        await import("./firebase/firebase-lists.js");
      const publicLists = await getPublicCommunityLists(60);
      this.cachedPublicLists = publicLists || [];

      const countTag = document.getElementById("watchlist-subtitle-tag");
      if (countTag) {
        countTag.textContent = `${this.cachedPublicLists.length} public lists from the community`;
      }

      this._filterAndRenderCommunityCards(this.cachedPublicLists);

      document
        .getElementById("input-community-search")
        ?.addEventListener("input", (e) => {
          const q = e.target.value.trim().toLowerCase();
          const filtered = this.cachedPublicLists.filter(
            (l) =>
              l.title.toLowerCase().includes(q) ||
              (l.authorName || "").toLowerCase().includes(q),
          );
          this._filterAndRenderCommunityCards(filtered);
        });
    } catch (err) {
      console.error("[Lists] Failed to load community lists:", err);
      this.mediaGridEl.innerHTML = `
        <div class="empty-state-box">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h3>Could not load lists</h3>
          <p>Please check your Firebase connection or console for details.</p>
        </div>
      `;
    }
  }

  _filterAndRenderCommunityCards(lists) {
    if (!lists || lists.length === 0) {
      this.mediaGridEl.innerHTML = `
        <div class="empty-state-box">
          <i class="fa-solid fa-layer-group"></i>
          <h3>No community lists found</h3>
          <p>Be the first to share your watchlist with the community!</p>
        </div>
      `;
      return;
    }

    const fallbackPosters = [
      "https://image.tmdb.org/t/p/w342/8CDWjvZQUExUUTzyp4t6EDMubfO.jpg",
      "https://image.tmdb.org/t/p/w342/A4j8S6moJS2zNtRR8oWF08gRnL5.jpg",
      "https://image.tmdb.org/t/p/w342/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
      "https://image.tmdb.org/t/p/w342/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
      "https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    ];

    const cardsHtml = lists
      .map((list) => {
        const items = list.items || [];
        const count = list.itemCount || items.length;
        const author = list.authorName || "Curator";

        const posterUrls = [];
        for (let i = 0; i < 5; i++) {
          if (items[i] && items[i].poster_path) {
            posterUrls.push(
              items[i].poster_path.startsWith("http")
                ? items[i].poster_path
                : `https://image.tmdb.org/t/p/w342${items[i].poster_path}`,
            );
          } else {
            posterUrls.push(fallbackPosters[i % fallbackPosters.length]);
          }
        }

        return `
          <div class="community-list-card" data-list-id="${escapeHtml(list.id)}">
            <div class="list-slices-container">
              ${posterUrls.map((url) => `<img src="${escapeHtml(url)}" class="list-slice-img" alt="" loading="lazy">`).join("")}
            </div>
            <div class="list-card-overlay">
              <div class="list-card-content">
                <h3 class="list-card-title">${escapeHtml(list.title)}</h3>
                <span class="list-card-meta">by ${escapeHtml(author)} • ${count} titles</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    this.mediaGridEl.innerHTML = `
      <div class="community-lists-grid" style="grid-column:1/-1;">
        ${cardsHtml}
      </div>
    `;

    this.mediaGridEl
      .querySelectorAll(".community-list-card")
      .forEach((card) => {
        card.onclick = () => {
          const listId = card.dataset.listId;
          const list = this.cachedPublicLists.find((x) => x.id === listId);
          if (list) this._openCommunityListViewer(list);
        };
      });
  }

  _openCommunityListViewer(list) {
    let modal = document.getElementById("community-list-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "community-list-modal";
      modal.className = "lists-modal-backdrop";
      document.body.appendChild(modal);
    }

    const items = list.items || [];

    modal.innerHTML = `
      <div class="lists-modal-card list-viewer-card">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:14px;margin-bottom:14px;">
          <div>
            <h2 style="font-family:var(--font-heading);font-size:1.4rem;color:#fff;margin:0 0 4px;">${escapeHtml(list.title)}</h2>
            <span style="font-size:0.8rem;color:#94a3b8;">Curated by ${escapeHtml(list.authorName || "User")} • ${items.length} titles</span>
          </div>
          <button type="button" id="close-viewer-btn" style="background:transparent;border:0;color:#94a3b8;font-size:1.3rem;cursor:pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style="overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;max-height:65vh;padding:6px;">
          ${
            items.length === 0
              ? `<div style="grid-column:1/-1;text-align:center;color:#64748b;padding:30px;">This collection has no titles.</div>`
              : items
                  .map(
                    (m) => `
                <div class="media-poster-card" data-id="${m.id}" data-type="${m.media_type || "movie"}" style="cursor:pointer;">
                  <img src="${m.poster_path ? (m.poster_path.startsWith("http") ? m.poster_path : `https://image.tmdb.org/t/p/w342${m.poster_path}`) : "assets/icons/logo.png"}" alt="" loading="lazy">
                </div>
              `,
                  )
                  .join("")
          }
        </div>
      </div>
    `;

    modal.style.display = "flex";

    modal.querySelector("#close-viewer-btn").onclick = () => {
      modal.style.display = "none";
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = "none";
    };

    modal.querySelectorAll(".media-poster-card").forEach((card) => {
      card.onclick = () => {
        modal.style.display = "none";
        this.openDetails(Number(card.dataset.id), card.dataset.type || "movie");
      };
    });
  }

  // ─── Data Feed Loaders ────────────────────────────────────────────────────

  async loadHomeFeed() {
    try {
      const data = await tmdbService.getTitlesByProvider(337);
      this.heroSlides = data.results || [];

      if (this.heroSlides.length > 0) {
        this.updateHeroSlide(0);
        this._renderSlideIndicators();
        this._renderGrid(this.heroSlides, false);
      }
    } catch (error) {
      console.error("[HomeFeed] Error loading home feed:", error);
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
      const newItems = data.results || [];

      if (append) {
        this.catalogItems = [...this.catalogItems, ...newItems];
        this._renderGrid(newItems, true);
      } else {
        this.catalogItems = newItems;
        this._renderGrid(this.catalogItems, false);
      }

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
          console.warn(`[Provider] TMDB provider ${providerId} failed:`, error);
        }
      }

      data = data || { results: [], total_pages: 1 };
      this.selectedProvider.activeId = usedProviderId;
      this.totalPages = data.total_pages || 1;
      const newResults = Array.isArray(data.results) ? data.results : [];

      if (append) {
        this.catalogItems = [...this.catalogItems, ...newResults];
        this._renderGrid(newResults, true);
      } else {
        this.catalogItems = newResults;
        this._renderGrid(this.catalogItems, false);
      }

      if (!append && newResults.length === 0) {
        this.mediaGridEl.innerHTML = `
          <div class="empty-state-box">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <h3>No titles available</h3>
            <p>TMDB has no streaming catalog results for ${escapeHtml(this.selectedProvider.name)} with the current filters.</p>
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

  // ─── Hero & Slides ─────────────────────────────────────────────────────────
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
      (_, i) =>
        `<span class="${i === 0 ? "indicator-bar active" : "indicator-dot"}" data-slide="${i}"></span>`,
    ).join("");

    this.heroIndicatorsEl.addEventListener("click", (e) => {
      const dot = e.target.closest("[data-slide]");
      if (dot) this.updateHeroSlide(Number(dot.dataset.slide));
    });
  }

  // ─── Continue Watching ────────────────────────────────────────────────────
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
                  ? `<button type="button" class="continue-delete-btn" data-delete-id="${item.id}" title="Remove"><i class="fa-solid fa-xmark"></i></button>`
                  : `<div class="continue-play-overlay"><i class="fa-solid fa-play"></i></div>`
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

  // ─── Providers Section ─────────────────────────────────────────────────────
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

  // ─── Grid & Incremental Renderer ──────────────────────────────────────────
  _renderGrid(items, append = false) {
    if (!this.mediaGridEl || !Array.isArray(items)) return;

    const validItems = items.filter((item) => item.poster_path);

    const html = validItems
      .map(
        (item) => `
          <div class="media-poster-card" data-id="${item.id}" data-type="${item.media_type || "movie"}">
            <img 
              src="${item.poster_path}" 
              alt="${escapeHtml(item.title || item.name || "")}" 
              loading="lazy" 
              onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500';"
            >
          </div>
        `,
      )
      .join("");

    if (append) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const newCards = Array.from(tempDiv.children);

      newCards.forEach((card) => {
        card.onclick = () => {
          const targetId = Number(card.dataset.id);
          const targetType = card.dataset.type || "movie";
          this.openDetails(targetId, targetType);
        };
        this.mediaGridEl.appendChild(card);
      });
    } else {
      this.mediaGridEl.innerHTML = html;
      this.mediaGridEl
        .querySelectorAll(".media-poster-card")
        .forEach((card) => {
          card.onclick = () => {
            const targetId = Number(card.dataset.id);
            const targetType = card.dataset.type || "movie";
            this.openDetails(targetId, targetType);
          };
        });
    }
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
