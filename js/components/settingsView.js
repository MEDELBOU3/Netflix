// ============================================================================
// js/components/settingsView.js
// Real Working CineJoy Settings Page
// ============================================================================

import { APP_CONFIG } from "../config.js";
import { storageService } from "../utils/storage.js";
import { PlayerView } from './playerView.js';
import {
  observeAuth,
  logout,
  getCurrentUser,
} from "../firebase/firebase-auth.js";
import { AuthView } from "./auth/AuthView.js";
const SETTINGS_KEY = "cinejoy_user_settings_v1";
const ACCOUNTS_KEY = "cinejoy_saved_accounts_v1";

const DEFAULT_SETTINGS = {
  ambientGlow: true,
  posterHover: true,
  autoplayNext: true,
  videoQuality: "1080p",
  primaryServer: "vidsrc",
  autoFallback: true,
  subtitleLang: "en",
  blockPopups: true,
  tmdbApiKey: APP_CONFIG.tmdb.apiKey || "",
};

function escapeHtmlSafe(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtmlSafe(value);
}

export class SettingsView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.activeTab = "account";
    this.isSignedIn = !!getCurrentUser();
    this.currentUser = getCurrentUser();
    this.settings = this._loadSettings();
    this.authView = null;
    this.savedAccounts = this._loadSavedAccounts();
    this._authUnsubscribe = observeAuth((user) => {
      this.currentUser = user || null;
      this.isSignedIn = !!user;
      if (user) this._rememberAccount(user);
      if (this.activeTab === "account" && this.container?.style.display !== "none") {
        const content = document.getElementById("settings-tab-content");
        if (content) {
          content.innerHTML = this._getTabHTML("account");
          this._bindTabInnerEvents();
        }
      }
    });
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  _ensureAccountStyles() {
    if (document.getElementById("cinejoy-account-settings-styles")) return;
    const style = document.createElement("style");
    style.id = "cinejoy-account-settings-styles";
    style.textContent = `
      .settings-saved-accounts{margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07)}
      .settings-saved-accounts-head{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
      .settings-saved-accounts-head strong{color:#fff;font-size:.88rem}
      .settings-saved-accounts-head span{color:#64748b;font-size:.74rem}
      .settings-saved-accounts-list{display:flex;flex-direction:column;gap:7px}
      .settings-saved-account{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 10px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:rgba(255,255,255,.025)}
      .settings-saved-account-avatar{width:32px;height:32px;flex:0 0 32px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:rgba(255,255,255,.07);color:#94a3b8}
      .settings-saved-account-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
      .settings-saved-account-info strong{color:#fff;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .settings-saved-account-info span{color:#64748b;font-size:.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .settings-saved-account-active{color:#94a3b8;font-size:.72rem}
      .settings-saved-account-switch,.settings-saved-account-remove{border:0;background:transparent;color:#94a3b8;cursor:pointer;padding:6px 8px;border-radius:7px}
      .settings-saved-account-switch:hover,.settings-saved-account-remove:hover{background:rgba(255,255,255,.07);color:#fff}
    `;
    document.head.appendChild(style);
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }


  _loadSavedAccounts() {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      const accounts = raw ? JSON.parse(raw) : [];
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  }

  _rememberAccount(user) {
    if (!user?.uid) return;

    const account = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email?.split("@")[0] || "CineJoy User",
      photoURL: user.photoURL || "",
      lastUsedAt: Date.now()
    };

    const next = [account, ...this.savedAccounts.filter(item => item.uid !== user.uid)].slice(0, 8);
    this.savedAccounts = next;

    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    } catch {}
  }

  _removeSavedAccount(uid) {
    this.savedAccounts = this.savedAccounts.filter(item => item.uid !== uid);
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.savedAccounts));
    } catch {}
  }

  _saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    // Broadcast so other parts of the app can react
    window.dispatchEvent(
      new CustomEvent("cinejoy:settings-updated", {
        detail: this.settings,
      }),
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  render() {
    if (!this.container) return;
    this._ensureAccountStyles();
    this.container.style.display = "block";

    this.container.innerHTML = `
      <div class="settings-page-wrapper container">
        <div class="settings-page-header">
          <h1 class="settings-main-title">
            <i class="fa-solid fa-gear"></i> Settings
          </h1>
        </div>

        <div class="settings-tabs-navbar" id="settings-tabs-nav">
          <button type="button" class="settings-tab-btn ${this.activeTab === "account" ? "active" : ""}" data-tab="account">
            <i class="fa-regular fa-user"></i><span>Account</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "appearance" ? "active" : ""}" data-tab="appearance">
            <i class="fa-solid fa-palette"></i><span>Appearance</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "playback" ? "active" : ""}" data-tab="playback">
            <i class="fa-solid fa-play"></i><span>Playback</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "servers" ? "active" : ""}" data-tab="servers">
            <i class="fa-solid fa-server"></i><span>Servers</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "subtitles" ? "active" : ""}" data-tab="subtitles">
            <i class="fa-solid fa-closed-captioning"></i><span>Subtitles</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "ads" ? "active" : ""}" data-tab="ads">
            <i class="fa-solid fa-bullhorn"></i><span>Ads</span>
          </button>
          <button type="button" class="settings-tab-btn ${this.activeTab === "febbox" ? "active" : ""}" data-tab="febbox">
            <i class="fa-solid fa-key"></i><span>Febbox</span>
          </button>
        </div>

        <div class="settings-content-panel" id="settings-tab-content">
          ${this._getTabHTML(this.activeTab)}
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _getTabHTML(tab) {
    const s = this.settings;

    if (tab === "account") {
      const user = this.currentUser || getCurrentUser();
      const displayName = user?.displayName || user?.email?.split("@")[0] || "CineJoy User";
      const email = user?.email || "";
      const photo = user?.photoURL || "";
      const avatar = photo
        ? `<img src="${escapeAttr(photo)}" alt="" class="settings-account-avatar">`
        : `<div class="settings-account-avatar settings-account-avatar-fallback"><i class="fa-solid fa-user"></i></div>`;

      return `
        <div class="settings-card-box settings-account-card">
          <div class="settings-card-head">
            <h3>Account</h3>
            <p>Sign in to sync your settings, community activity, and watch progress across devices.</p>
          </div>

          ${
            user
              ? `
                <div class="settings-account-profile">
                  ${avatar}
                  <div class="settings-account-identity">
                    <strong>${escapeHtmlSafe(displayName)}</strong>
                    <span>${escapeHtmlSafe(email)}</span>
                    <small><i class="fa-solid fa-circle-check"></i> Firebase account connected</small>
                  </div>
                  <button type="button" class="btn-settings-pill" id="btn-toggle-auth">Sign Out</button>
                </div>
              `
              : `
                <div class="settings-action-row">
                  <div class="settings-action-text">
                    <strong>You're not signed in</strong>
                    <span>Create an account or sign in to sync your CineJoy data.</span>
                  </div>
                  <button type="button" class="btn-settings-pill" id="btn-toggle-auth">Sign In</button>
                </div>
                <div class="settings-auth-note">
                  <i class="fa-solid fa-shield-halved"></i>
                  <span>Your account is handled securely by Firebase Authentication.</span>
                </div>
              `
          }

          ${this.savedAccounts.length ? `
            <div class="settings-saved-accounts">
              <div class="settings-saved-accounts-head">
                <strong>Saved accounts</strong>
                <span>Accounts remembered on this browser</span>
              </div>
              <div class="settings-saved-accounts-list">
                ${this.savedAccounts.map(account => {
                  const active = user?.uid === account.uid;
                  const name = escapeHtmlSafe(account.displayName || account.email || "Account");
                  const emailText = escapeHtmlSafe(account.email || "");
                  const photoHtml = account.photoURL
                    ? `<img src="${escapeAttr(account.photoURL)}" alt="" class="settings-saved-account-avatar">`
                    : `<span class="settings-saved-account-avatar"><i class="fa-solid fa-user"></i></span>`;
                  return `
                    <div class="settings-saved-account" data-account-uid="${escapeAttr(account.uid)}">
                      ${photoHtml}
                      <div class="settings-saved-account-info">
                        <strong>${name}</strong>
                        <span>${emailText}</span>
                      </div>
                      ${active
                        ? `<span class="settings-saved-account-active">Current</span>`
                        : `<button type="button" class="settings-saved-account-switch" data-switch-account="${escapeAttr(account.uid)}">Switch</button>`}
                      <button type="button" class="settings-saved-account-remove" data-remove-account="${escapeAttr(account.uid)}" aria-label="Forget account"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
                }).join("")}
              </div>
            </div>
          ` : ""}

          <div class="settings-service-row">
            <div class="service-icon-box"><i class="fa-solid fa-square-check"></i></div>
            <div class="service-text-box">
              <strong>Connect Trakt</strong>
              <span>Sync your watchlist, history and progress from Trakt</span>
            </div>
            <button type="button" class="btn-connect-service" id="btn-connect-trakt">Connect</button>
          </div>

          <div class="settings-service-row">
            <div class="service-icon-box"><i class="fa-solid fa-s"></i></div>
            <div class="service-text-box">
              <strong>Connect Simkl</strong>
              <span>Sync your watchlist, history and progress from Simkl</span>
            </div>
            <button type="button" class="btn-connect-service" id="btn-connect-simkl">Connect</button>
          </div>
        </div>
      `;
    }

    if (tab === "appearance") {
      return `
        <div class="settings-card-box">
          <div class="settings-card-head">
            <h3>Appearance</h3>
            <p>Customize the UI theme, ambient canvas lighting, and layout density.</p>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Dynamic Hero Ambient Glow</strong>
              <span>Extract background colors dynamically from active hero movies</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="setting-ambient-toggle" ${s.ambientGlow ? "checked" : ""}>
              <span class="slider-round"></span>
            </label>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Poster Card Hover Animation</strong>
              <span>Smooth zoom and floating play button when hovering titles</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="setting-hover-toggle" ${s.posterHover ? "checked" : ""}>
              <span class="slider-round"></span>
            </label>
          </div>
        </div>
      `;
    }

    if (tab === "playback") {
      return `
        <div class="settings-card-box">
          <div class="settings-card-head">
            <h3>Playback Settings</h3>
            <p>Configure default stream resolution, autoplay behavior, and audio.</p>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Autoplay Next Episode</strong>
              <span>Automatically play the subsequent episode when the current one finishes</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="setting-autoplay-toggle" ${s.autoplayNext ? "checked" : ""}>
              <span class="slider-round"></span>
            </label>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Default Video Quality</strong>
              <span>Preferred streaming bitrate</span>
            </div>
            <select class="custom-select" id="setting-quality-select">
              <option value="4k" ${s.videoQuality === "4k" ? "selected" : ""}>4K Ultra HD (Best Quality)</option>
              <option value="1080p" ${s.videoQuality === "1080p" ? "selected" : ""}>1080p Full HD</option>
              <option value="720p" ${s.videoQuality === "720p" ? "selected" : ""}>720p HD (Data Saver)</option>
            </select>
          </div>
        </div>
      `;
    }

    if (tab === "servers") {
      // PlayerView is imported at the top of this module.

      const servers = PlayerView.SERVERS || [];

      const optionsHtml = servers
        .map(
          (s) => `
    <option value="${s.id}" ${this.settings.primaryServer === s.id ? "selected" : ""}>
      ${s.label} — ${s.name}${s.quality === "4K" ? " · 4K" : ""}
    </option>
  `,
        )
        .join("");

      return `
    <div class="settings-card-box">
      <div class="settings-card-head">
        <h3>Streaming Servers</h3>
        <p>Select your default cloud embed source and fallback routing.</p>
      </div>

      <div class="settings-field-row">
        <div>
          <strong>Primary Streaming Server</strong>
          <span>Preferred cloud embed player source</span>
        </div>
        <select class="custom-select" id="setting-server-select">
          ${optionsHtml}
        </select>
      </div>

      <div class="settings-field-row">
        <div>
          <strong>Auto-fallback on Error</strong>
          <span>Automatically switch to the next server if the primary stream fails</span>
        </div>
        <label class="switch-toggle">
          <input type="checkbox" id="setting-fallback-toggle" ${this.settings.autoFallback ? "checked" : ""}>
          <span class="slider-round"></span>
        </label>
      </div>
    </div>
  `;
    }
    if (tab === "subtitles") {
      return `
        <div class="settings-card-box">
          <div class="settings-card-head">
            <h3>Subtitles &amp; Captions</h3>
            <p>Set default subtitle languages and visual appearance.</p>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Default Subtitle Language</strong>
              <span>Automatically load matching captions</span>
            </div>
            <select class="custom-select" id="setting-subtitle-select">
              <option value="en" ${s.subtitleLang === "en" ? "selected" : ""}>English</option>
              <option value="ar" ${s.subtitleLang === "ar" ? "selected" : ""}>Arabic (العربية)</option>
              <option value="fr" ${s.subtitleLang === "fr" ? "selected" : ""}>French (Français)</option>
              <option value="es" ${s.subtitleLang === "es" ? "selected" : ""}>Spanish (Español)</option>
              <option value="off" ${s.subtitleLang === "off" ? "selected" : ""}>Off by Default</option>
            </select>
          </div>
        </div>
      `;
    }

    if (tab === "ads") {
      return `
        <div class="settings-card-box">
          <div class="settings-card-head">
            <h3>Ad-Free Experience</h3>
            <p>Manage pop-up filters and built-in player ad-blocking preferences.</p>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Built-in Pop-up Interceptor</strong>
              <span>Block third-party video host popups and redirect banners</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="setting-popup-toggle" ${s.blockPopups ? "checked" : ""}>
              <span class="slider-round"></span>
            </label>
          </div>
        </div>
      `;
    }

    if (tab === "febbox") {
      return `
        <div class="settings-card-box">
          <div class="settings-card-head">
            <h3>Febbox &amp; TMDb API Credentials</h3>
            <p>Configure direct cloud download tokens and custom TMDb keys.</p>
          </div>

          <div class="settings-field-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
            <label style="font-weight:600;font-size:0.9rem;color:#fff;">TMDb v3 API Key</label>
            <div style="display:flex;gap:10px;width:100%;">
              <input type="text" id="input-settings-tmdb" value="${s.tmdbApiKey}" 
                     style="flex:1;height:42px;background:#141822;border:1px solid rgba(255,255,255,0.12);color:#fff;border-radius:12px;padding:0 14px;font-size:0.9rem;">
              <button type="button" class="btn-settings-pill" id="btn-save-tmdb">Save</button>
            </div>
          </div>

          <div class="settings-field-row" style="margin-top:20px;">
            <div>
              <strong>Clear Watch History &amp; Cache</strong>
              <span>Reset Continue Watching and clear cached responses</span>
            </div>
            <button type="button" class="btn-danger-pill" id="btn-reset-cache">Clear Data</button>
          </div>
        </div>
      `;
    }

    return "";
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  _bindEvents() {
    const nav = document.getElementById("settings-tabs-nav");
    nav?.addEventListener("click", (e) => {
      const btn = e.target.closest(".settings-tab-btn");
      if (!btn) return;

      nav
        .querySelectorAll(".settings-tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.activeTab = btn.dataset.tab;

      const content = document.getElementById("settings-tab-content");
      if (content) {
        content.innerHTML = this._getTabHTML(this.activeTab);
        this._bindTabInnerEvents();
      }
    });

    this._bindTabInnerEvents();
  }

  _bindTabInnerEvents() {
    // Account
    document
      .getElementById("btn-toggle-auth")
      ?.addEventListener("click", async () => {
        const user = getCurrentUser();

        if (user) {
          try {
            await logout();
          } catch (error) {
            console.error("[SettingsView] Sign out failed:", error);
            alert(this._authErrorMessage(error));
          }
          return;
        }

        this._openAuthView();
      });

    document.querySelectorAll("[data-switch-account]").forEach(button => {
      button.addEventListener("click", () => {
        const uid = button.dataset.switchAccount;
        const account = this.savedAccounts.find(item => item.uid === uid);
        if (!account || getCurrentUser()?.uid === uid) return;
        this._openAuthView("login", account.email);
      });
    });

    document.querySelectorAll("[data-remove-account]").forEach(button => {
      button.addEventListener("click", () => {
        this._removeSavedAccount(button.dataset.removeAccount);
        const content = document.getElementById("settings-tab-content");
        if (content) content.innerHTML = this._getTabHTML("account");
        this._bindTabInnerEvents();
      });
    });

    document
      .getElementById("btn-connect-trakt")
      ?.addEventListener("click", () => {
        alert("Trakt OAuth is not implemented yet. Coming soon.");
      });

    document
      .getElementById("btn-connect-simkl")
      ?.addEventListener("click", () => {
        alert("Simkl OAuth is not implemented yet. Coming soon.");
      });

    // Appearance
    document
      .getElementById("setting-ambient-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.ambientGlow = e.target.checked;
        this._saveSettings();

        // Live apply
        document.body.classList.toggle("ambient-disabled", !e.target.checked);
        if (!e.target.checked) {
          document.documentElement.style.setProperty(
            "--ambient-rgb",
            "9, 12, 18",
          );
        }
      });

    document
      .getElementById("setting-hover-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.posterHover = e.target.checked;
        this._saveSettings();
        document.body.classList.toggle("no-poster-hover", !e.target.checked);
      });

    // Playback
    document
      .getElementById("setting-autoplay-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.autoplayNext = e.target.checked;
        this._saveSettings();
      });

    document
      .getElementById("setting-quality-select")
      ?.addEventListener("change", (e) => {
        this.settings.videoQuality = e.target.value;
        this._saveSettings();
      });

    // Servers
    document
      .getElementById("setting-server-select")
      ?.addEventListener("change", (e) => {
        this.settings.primaryServer = e.target.value;
        this._saveSettings();
      });

    document
      .getElementById("setting-fallback-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.autoFallback = e.target.checked;
        this._saveSettings();
      });

    // Subtitles
    document
      .getElementById("setting-subtitle-select")
      ?.addEventListener("change", (e) => {
        this.settings.subtitleLang = e.target.value;
        this._saveSettings();
      });

    // Ads
    document
      .getElementById("setting-popup-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.blockPopups = e.target.checked;
        this._saveSettings();
      });

    // Febbox / TMDb
    document.getElementById("btn-save-tmdb")?.addEventListener("click", () => {
      const val = document.getElementById("input-settings-tmdb")?.value.trim();
      if (val) {
        this.settings.tmdbApiKey = val;
        APP_CONFIG.tmdb.apiKey = val; // live update
        this._saveSettings();
        alert("TMDb API Key saved successfully!");
      }
    });

    document
      .getElementById("btn-reset-cache")
      ?.addEventListener("click", () => {
        if (
          confirm(
            "Are you sure you want to clear your local watch history and cache?",
          )
        ) {
          localStorage.removeItem("cinejoy_watch_progress_v2");
          localStorage.removeItem(SETTINGS_KEY);
          this.settings = { ...DEFAULT_SETTINGS };
          window.dispatchEvent(new CustomEvent("cinejoy:progress-updated"));
          alert("Watch history and settings cache cleared.");
          this.render(); // refresh UI
        }
      });
  }

  _openAuthView(mode = "login", email = "") {
    if (!this.container) return;
    if (!this.authView) {
      this.authView = new AuthView({
        onAuthenticated: () => {
          const content = document.getElementById("settings-tab-content");
          if (content) {
            content.innerHTML = this._getTabHTML("account");
            this._bindTabInnerEvents();
          }
        },
      });
    }
    this.authView.open(mode);
    if (email) {
      requestAnimationFrame(() => {
        const input = this.authView?.overlay?.querySelector("#auth-email");
        if (input) input.value = email;
      });
    }
  }

  _authErrorMessage(error) {
    const code = error?.code || "";
    const messages = {
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-not-found": "No account was found with this email.",
      "auth/wrong-password": "The email or password is incorrect.",
      "auth/invalid-credential": "The email or password is incorrect.",
      "auth/email-already-in-use": "An account already exists with this email.",
      "auth/weak-password": "Password must contain at least 6 characters.",
      "auth/popup-closed-by-user": "The Google sign-in window was closed.",
      "auth/popup-blocked": "Your browser blocked the Google sign-in window.",
      "auth/network-request-failed": "Network error. Please check your connection.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    };
    return messages[code] || error?.message || "Authentication failed. Please try again.";
  }

  hide() {
    this.authView?.close?.();
    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  }
}

// Helper so other modules can read settings easily
export function getUserSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}
