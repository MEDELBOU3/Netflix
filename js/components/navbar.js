// ============================================================================
// js/components/navbar.js
// Active Pill Navigation Switcher, Live TV, Settings Route & Global Search
// ============================================================================

import { tmdbService } from "../api/tmdb.js";
import { formatDate, escapeHtml } from "../utils/dom.js";

export class Navbar {
  constructor(onNavigate, onSearchSelect) {
    this.onNavigate = onNavigate;
    this.onSearchSelect = onSearchSelect;
    this.activePage = "home";

    this.pillNav = document.getElementById("pill-navbar");
    this.backBtn = document.getElementById("nav-back-btn");
    this.logoBtn = document.getElementById("logo-btn");
    this.settingsBtn = document.getElementById("open-settings-btn");
    this.searchBtn = document.getElementById("open-search-btn");
    this.mobileSearchBtn = document.getElementById("mobile-search-btn");

    // Selector dyal Dropdown Menu HNA f constructor:
    this.settingsMenu = document.getElementById("settingsMenu");

    this.searchModal = document.getElementById("search-modal");
    this.searchInput = document.getElementById("global-search-input");
    this.searchResultsList = document.getElementById("search-results-list");
    this.searchClearBtn = document.getElementById("search-clear-btn");
    this.debounceTimer = null;

    this._init();
  }

  _init() {
    this.pillNav?.addEventListener("click", (e) => {
      const navItem = e.target.closest(".pill-nav-item");
      if (!navItem) return;

      const page = navItem.dataset.page;
      if (!page) return;

      this.setActiveTab(page);

      if (typeof this.onNavigate === "function") {
        this.onNavigate(page);
      }
    });

    // 1. Click 3la Settings f Desktop (kay-toggli l-menu)
    this.settingsBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSettingsMenu();
    });

    // 2. Click 3la Settings f Mobile Bottom Nav (kay-toggli l-menu)
    const mobileSettingsBtn = document.querySelector('.mobile-tab[data-page="settings"]');
    mobileSettingsBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSettingsMenu();
    });

    // 3. Click 3la ay Item wst l-Drop Menu
    this.settingsMenu?.addEventListener("click", (e) => {
      const item = e.target.closest("li[data-action]");
      if (!item) return;

      const action = item.dataset.action;
      this.closeSettingsMenu();

      if (action === "settings") {
        this.setActiveTab("settings");
        if (typeof this.onNavigate === "function") this.onNavigate("settings");
      } else if (action === "top-users") {
        // HNA: Yddik direct l Top Users view!
        if (typeof this.onNavigate === "function") this.onNavigate("top-users");
      } else if (action === "history") {
        const continueSection = document.getElementById("section-continue-watching");
        if (continueSection) {
          continueSection.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        alert(`${item.querySelector("span")?.textContent || action} is coming soon!`);
      }
    });

    // 4. Sedd l-menu mnin twrek f ay blassa bera (Click outside)
    document.addEventListener("click", (e) => {
      if (this.settingsMenu?.classList.contains("active")) {
        const clickedInsideMenu = this.settingsMenu.contains(e.target);
        const clickedTrigger = e.target.closest("#open-settings-btn, .mobile-tab[data-page='settings']");
        
        if (!clickedInsideMenu && !clickedTrigger) {
          this.closeSettingsMenu();
        }
      }
    });

    this.logoBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      this.setActiveTab("home");

      if (typeof this.onNavigate === "function") {
        this.onNavigate("home");
      }
    });

    this.backBtn?.addEventListener("click", () => {
      this.setActiveTab("home");

      if (typeof this.onNavigate === "function") {
        this.onNavigate("home");
      }
    });

    this.searchBtn?.addEventListener("click", () => this.openSearch());
    this.mobileSearchBtn?.addEventListener("click", () => this.openSearch());

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.openSearch();
      }
    });

    this.searchInput?.addEventListener("input", (e) => {
      clearTimeout(this.debounceTimer);
      const query = e.target.value.trim();

      if (!query) {
        if (this.searchResultsList) {
          this.searchResultsList.innerHTML =
            `<div class="search-idle-hint">Search over 10,000+ movies & shows.</div>`;
        }
        return;
      }

      this.debounceTimer = setTimeout(() => this._performSearch(query), 300);
    });

    this.searchClearBtn?.addEventListener("click", () => {
      if (this.searchInput) this.searchInput.value = "";
      if (this.searchResultsList) {
        this.searchResultsList.innerHTML = `<div class="search-idle-hint">Search cleared.</div>`;
      }
    });

    this.searchModal?.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-backdrop-blur") ||
        e.target === this.searchModal
      ) {
        this.closeSearch();
      }
    });

    const mobileNav = document.getElementById("mobile-bottom-nav");
    mobileNav?.addEventListener("click", (e) => {
      const tab = e.target.closest(".mobile-tab");
      if (!tab) return;

      const page = tab.dataset.page;
      if (!page) return;

      if (page === "search") {
        this.openSearch();
        return;
      }

      // Hna: ila kan click 3la settings f l-mobile, ma y-beddelsh l-tab 7it ghadi y-ftah l-menu
      if (page === "settings") {
        return;
      }

      this.setActiveTab(page);

      mobileNav.querySelectorAll(".mobile-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.page === page);
      });

      if (typeof this.onNavigate === "function") {
        this.onNavigate(page);
      }
    });
  }

  setActiveTab(page) {
    this.activePage = page;

    this.pillNav?.querySelectorAll(".pill-nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    const mobileNav = document.getElementById("mobile-bottom-nav");
    mobileNav?.querySelectorAll(".mobile-tab").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    if (this.settingsBtn) {
      this.settingsBtn.classList.toggle("active", page === "settings");
    }

    if (this.backBtn) {
      this.backBtn.style.display = page !== "home" ? "grid" : "none";
    }
  }

  toggleSettingsMenu() {
    if (!this.settingsMenu) return;
    this.settingsMenu.classList.toggle("active");
  }

  closeSettingsMenu() {
    if (!this.settingsMenu) return;
    this.settingsMenu.classList.remove("active");
  }
  openSearch() {
    if (!this.searchModal) return;

    this.searchModal.classList.add("active");

    if (this.searchModal.showModal) {
      this.searchModal.showModal();
    }

    setTimeout(() => this.searchInput?.focus(), 100);
  }

  closeSearch() {
    if (!this.searchModal) return;

    this.searchModal.classList.remove("active");

    if (this.searchModal.close) {
      this.searchModal.close();
    }
  }

  async _performSearch(query) {
    if (!this.searchResultsList) return;

    this.searchResultsList.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--accent-cyan,#00f0ff);">
        <i class="fa-solid fa-spinner fa-spin"></i> Searching titles...
      </div>
    `;

    const results = await tmdbService.searchTitles(query);

    if (results.length === 0) {
      this.searchResultsList.innerHTML =
        `<div class="search-idle-hint">No matches found for "${escapeHtml(query)}".</div>`;
      return;
    }

    this.searchResultsList.innerHTML = "";

    results.slice(0, 8).forEach((item) => {
      const row = document.createElement("div");
      row.className = "search-result-item";

      row.innerHTML = `
        <img
          src="${escapeHtml(item.poster_path)}"
          class="search-item-poster"
          alt="${escapeHtml(item.title)}"
          onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=200';"
        >
        <div class="search-item-info">
          <div class="search-item-title">${escapeHtml(item.title)}</div>
          <div class="search-item-sub">
            <span>${formatDate(item.release_date)}</span>
            <span>•</span>
            <span style="text-transform:uppercase;">${item.media_type || "Movie"}</span>
            <span>•</span>
            <span style="color:var(--accent-gold,#f59e0b);">
              <i class="fa-solid fa-star"></i> ${item.vote_average || "7.5"}
            </span>
          </div>
        </div>
      `;

      row.addEventListener("click", () => {
        this.closeSearch();

        if (typeof this.onSearchSelect === "function") {
          this.onSearchSelect(item);
        }
      });

      this.searchResultsList.appendChild(row);
    });
  }
}