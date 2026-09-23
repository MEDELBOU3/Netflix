// ============================================================================
// js/components/settingsView.js
// CineJoy Settings Page with Multi-Account Switcher & Profile/Avatar Editing
// ============================================================================

import { APP_CONFIG } from "../config.js";
import { storageService } from "../utils/storage.js";
import { PlayerView } from "./playerView.js";
import {
  observeAuth,
  logout,
  getCurrentUser,
} from "../firebase/firebase-auth.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firestore } from "../firebase/firebase-app.js";
import {
  createUserAvatarRef,
  uploadBytes,
  getDownloadURL,
} from "../firebase/firebase-storage.js";
import { AuthView } from "./auth/AuthView.js";

const SETTINGS_KEY = "cinejoy_user_settings_v1";
const ACCOUNTS_KEY = "cinejoy_saved_accounts_v1";

const DEFAULT_SETTINGS = {
  ambientGlow: true,
  posterHover: true,
  autoplayNext: true,
  videoQuality: "1080p",
  primaryServer: "cinesrc",
  cinesrcServer: "auto",
  cinesrcPrioritize: true,
  autoFallback: true,
  subtitleLang: "en",
  blockPopups: true,
  tmdbApiKey: APP_CONFIG.tmdb?.apiKey || "",
  febboxToken: "",
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
    this.isEditingProfile = false;
    this.tempAvatarFile = null;

    this._authUnsubscribe = observeAuth((user) => {
      this.currentUser = user || null;
      this.isSignedIn = !!user;
      if (user) {
        this._rememberAccount(user);
      }
      if (this.activeTab === "account" && this.container?.style.display !== "none") {
        const content = document.getElementById("settings-tab-content");
        if (content) {
          content.innerHTML = this._getTabHTML("account");
          this._bindTabInnerEvents();
        }
      }
    });
  }

  // ─── Styles for Profile Editor & Account Switcher ──────────────────────────
  _ensureAccountStyles() {
    if (document.getElementById("cinejoy-account-settings-styles")) return;
    const style = document.createElement("style");
    style.id = "cinejoy-account-settings-styles";
    style.textContent = `
      .settings-saved-accounts{margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07)}
      .settings-saved-accounts-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .settings-saved-accounts-head strong{color:#fff;font-size:.9rem}
      .settings-saved-accounts-head span{color:#64748b;font-size:.74rem}
      .btn-add-account{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 12px;font-size:.75rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:.2s}
      .btn-add-account:hover{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.25)}
      .settings-saved-accounts-list{display:flex;flex-direction:column;gap:8px}
      .settings-saved-account{display:flex;align-items:center;gap:12px;min-height:50px;padding:8px 12px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025);transition:.2s}
      .settings-saved-account:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
      .settings-saved-account-avatar{width:36px;height:36px;flex:0 0 36px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:rgba(255,255,255,.07);color:#94a3b8}
      .settings-saved-account-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
      .settings-saved-account-info strong{color:#fff;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .settings-saved-account-info span{color:#64748b;font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .settings-saved-account-active{color:#22c55e;font-size:.74rem;display:inline-flex;align-items:center;gap:4px;font-weight:600}
      .settings-saved-account-switch{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;cursor:pointer;padding:6px 12px;border-radius:8px;font-size:.76rem;transition:.2s}
      .settings-saved-account-switch:hover{background:#e50914;border-color:#e50914}
      .settings-saved-account-remove{border:0;background:transparent;color:#64748b;cursor:pointer;padding:6px 8px;border-radius:7px;transition:.2s}
      .settings-saved-account-remove:hover{background:rgba(239,68,68,.15);color:#ef4444}
      
      /* Profile Edit Form */
      .profile-edit-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:18px;margin-top:14px;display:flex;flex-direction:column;gap:14px}
      .profile-edit-avatar-row{display:flex;align-items:center;gap:16px}
      .profile-preview-avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #e50914}
      .profile-edit-avatar-controls{display:flex;flex-direction:column;gap:8px;flex:1}
      .profile-avatar-toggle-bar{display:flex;gap:8px}
      .btn-avatar-mode{background:transparent;color:#94a3b8;border:0;padding:4px 8px;font-size:.75rem;cursor:pointer;border-bottom:2px solid transparent}
      .btn-avatar-mode.active{color:#fff;border-color:#e50914}
      .profile-input{width:100%;height:38px;background:#141822;border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:9px;padding:0 12px;font-size:.85rem}
      .profile-file-input{color:#94a3b8;font-size:.8rem}
      .profile-edit-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:6px}
      .btn-edit-profile-trigger{background:transparent;border:1px solid rgba(255,255,255,.15);color:#fff;padding:6px 12px;border-radius:8px;font-size:.76rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:.2s}
      .btn-edit-profile-trigger:hover{background:rgba(255,255,255,.1)}
    `;
    document.head.appendChild(style);
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
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
      lastUsedAt: Date.now(),
    };

    const next = [
      account,
      ...this.savedAccounts.filter((item) => item.uid !== user.uid),
    ].slice(0, 10);

    this.savedAccounts = next;

    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    } catch {}
  }

  _updateAccountInMemory(uid, updates) {
    this.savedAccounts = this.savedAccounts.map((acc) =>
      acc.uid === uid ? { ...acc, ...updates } : acc,
    );
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.savedAccounts));
    } catch {}
  }

  _removeSavedAccount(uid) {
    this.savedAccounts = this.savedAccounts.filter((item) => item.uid !== uid);
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(this.savedAccounts));
    } catch {}
  }

  _saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
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
      const displayName =
        user?.displayName || user?.email?.split("@")[0] || "CineJoy User";
      const email = user?.email || "";
      const photo = user?.photoURL || "";
      const avatar = photo
        ? `<img src="${escapeAttr(photo)}" alt="" class="settings-account-avatar" id="current-account-avatar">`
        : `<div class="settings-account-avatar settings-account-avatar-fallback" id="current-account-avatar"><i class="fa-solid fa-user"></i></div>`;

      return `
        <div class="settings-card-box settings-account-card">
          <div class="settings-card-head">
            <h3>Account &amp; Profiles</h3>
            <p>Manage your active profile, customize your name and avatar, or switch accounts.</p>
          </div>

          ${
            user
              ? `
                <div class="settings-account-profile">
                  ${avatar}
                  <div class="settings-account-identity">
                    <strong id="display-username">${escapeHtmlSafe(displayName)}</strong>
                    <span>${escapeHtmlSafe(email)}</span>
                    <small><i class="fa-solid fa-circle-check"></i> Cloud Profile Connected</small>
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <button type="button" class="btn-edit-profile-trigger" id="btn-toggle-edit-profile">
                      <i class="fa-solid fa-pen"></i> Edit Profile
                    </button>
                    <button type="button" class="btn-settings-pill" id="btn-toggle-auth">Sign Out</button>
                  </div>
                </div>

                <!-- Profile Editing Box -->
                <div class="profile-edit-box" id="profile-edit-panel" style="display: ${this.isEditingProfile ? "flex" : "none"};">
                  <strong>Edit Profile Info</strong>

                  <div>
                    <label style="font-size:0.75rem;color:#94a3b8;margin-bottom:4px;display:block;">Display Name</label>
                    <input type="text" class="profile-input" id="input-edit-displayname" value="${escapeAttr(displayName)}" placeholder="Your username">
                  </div>

                  <div class="profile-edit-avatar-row">
                    <img src="${escapeAttr(photo || "assets/icons/logo.png")}" class="profile-preview-avatar" id="avatar-live-preview" onerror="this.src='assets/icons/logo.png'">
                    <div class="profile-edit-avatar-controls">
                      <div class="profile-avatar-toggle-bar">
                        <button type="button" class="btn-avatar-mode active" id="mode-avatar-url">Image URL</button>
                        <button type="button" class="btn-avatar-mode" id="mode-avatar-file">Upload Image</button>
                      </div>

                      <div id="container-avatar-url">
                        <input type="url" class="profile-input" id="input-avatar-url" value="${escapeAttr(photo)}" placeholder="https://example.com/avatar.jpg">
                      </div>

                      <div id="container-avatar-file" style="display:none;">
                        <input type="file" accept="image/*" class="profile-file-input" id="input-avatar-file">
                      </div>
                    </div>
                  </div>

                  <div class="profile-edit-actions">
                    <button type="button" class="btn-settings-pill" id="btn-cancel-edit-profile" style="background:transparent;border:1px solid rgba(255,255,255,.1);">Cancel</button>
                    <button type="button" class="btn-settings-pill" id="btn-save-profile">
                      <i class="fa-solid fa-check"></i> Save Changes
                    </button>
                  </div>
                </div>
              `
              : `
                <div class="settings-action-row">
                  <div class="settings-action-text">
                    <strong>You're not signed in</strong>
                    <span>Sign in or create an account to sync your watchlist, servers, and progress across devices.</span>
                  </div>
                  <button type="button" class="btn-settings-pill" id="btn-toggle-auth">Sign In</button>
                </div>
              `
          }

          <!-- Saved Multi-Account Switcher -->
          <div class="settings-saved-accounts">
            <div class="settings-saved-accounts-head">
              <div>
                <strong>Switch Accounts</strong>
                <span style="display:block;">Accounts remembered on this device</span>
              </div>
              <button type="button" class="btn-add-account" id="btn-add-new-account">
                <i class="fa-solid fa-plus"></i> Add Account
              </button>
            </div>

            <div class="settings-saved-accounts-list">
              ${
                this.savedAccounts.length
                  ? this.savedAccounts
                      .map((account) => {
                        const active = user?.uid === account.uid;
                        const name = escapeHtmlSafe(
                          account.displayName || account.email || "Account",
                        );
                        const emailText = escapeHtmlSafe(account.email || "");
                        const photoHtml = account.photoURL
                          ? `<img src="${escapeAttr(account.photoURL)}" alt="" class="settings-saved-account-avatar" onerror="this.src='assets/icons/logo.png'">`
                          : `<span class="settings-saved-account-avatar"><i class="fa-solid fa-user"></i></span>`;

                        return `
                          <div class="settings-saved-account" data-account-uid="${escapeAttr(account.uid)}">
                            ${photoHtml}
                            <div class="settings-saved-account-info">
                              <strong>${name}</strong>
                              <span>${emailText}</span>
                            </div>
                            ${
                              active
                                ? `<span class="settings-saved-account-active"><i class="fa-solid fa-circle-check"></i> Current</span>`
                                : `<button type="button" class="settings-saved-account-switch" data-switch-account="${escapeAttr(account.uid)}">Switch</button>`
                            }
                            <button type="button" class="settings-saved-account-remove" data-remove-account="${escapeAttr(account.uid)}" title="Forget this account">
                              <i class="fa-solid fa-xmark"></i>
                            </button>
                          </div>
                        `;
                      })
                      .join("")
                  : `<span style="font-size:0.75rem;color:#64748b;">No saved accounts yet. Log in to remember an account.</span>`
              }
            </div>
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
              <span>Preferred streaming resolution sent to supported cloud players</span>
            </div>
            <select class="custom-select" id="setting-quality-select">
              <option value="4k" ${s.videoQuality === "4k" ? "selected" : ""}>4K Ultra HD</option>
              <option value="1080p" ${s.videoQuality === "1080p" ? "selected" : ""}>1080p Full HD</option>
              <option value="720p" ${s.videoQuality === "720p" ? "selected" : ""}>720p HD</option>
              <option value="480p" ${s.videoQuality === "480p" ? "selected" : ""}>480p SD</option>
            </select>
          </div>
        </div>
      `;
    }

    if (tab === "servers") {
      const servers = PlayerView.SERVERS || [];

      const optionsHtml = servers
        .map(
          (srv) => `
            <option value="${srv.id}" ${this.settings.primaryServer === srv.id ? "selected" : ""}>
              ${srv.label} — ${srv.name}${srv.quality === "4K" ? " · 4K" : ""}
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
              <span>Preferred embed source (CineSrc, VidSrc, VidKing, etc.)</span>
            </div>
            <select class="custom-select" id="setting-server-select">
              ${optionsHtml}
            </select>
          </div>

          <div class="settings-field-row" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:14px;">
            <div>
              <strong>CineSrc Preferred Node / Server</strong>
              <span>Default sub-server node inside the CineSrc player network</span>
            </div>
            <select class="custom-select" id="setting-cinesrc-server">
              <option value="auto" ${s.cinesrcServer === "auto" ? "selected" : ""}>Automatic (Fastest Available)</option>
              <option value="lisbon" ${s.cinesrcServer === "lisbon" ? "selected" : ""}>🇺🇸 Lisbon</option>
              <option value="nebula" ${s.cinesrcServer === "nebula" ? "selected" : ""}>🇺🇸 Nebula (VIP ⭐)</option>
              <option value="thunder" ${s.cinesrcServer === "thunder" ? "selected" : ""}>🇺🇸 Thunder</option>
              <option value="wave" ${s.cinesrcServer === "wave" ? "selected" : ""}>🇺🇸 Wave</option>
              <option value="surge" ${s.cinesrcServer === "surge" ? "selected" : ""}>🇺🇸 Surge</option>
              <option value="blizzard" ${s.cinesrcServer === "blizzard" ? "selected" : ""}>🇺🇸 Blizzard</option>
              <option value="pulse" ${s.cinesrcServer === "pulse" ? "selected" : ""}>🇺🇸 Pulse</option>
            </select>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Prioritize Selected Node</strong>
              <span>Forces CineSrc to load the preferred sub-server node directly</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="setting-cinesrc-prioritize" ${s.cinesrcPrioritize !== false ? "checked" : ""}>
              <span class="slider-round"></span>
            </label>
          </div>

          <div class="settings-field-row" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:14px;">
            <div>
              <strong>Auto-fallback on Error</strong>
              <span>Automatically switch to the next server if a stream fails</span>
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
            <p>Set default subtitle preferences.</p>
          </div>

          <div class="settings-field-row">
            <div>
              <strong>Default Subtitle Language</strong>
              <span>Preferred language track for compatible players</span>
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
              <span>Block third-party video host popups and redirect banners using iframe sandboxing</span>
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
            <label style="font-weight:600;font-size:0.9rem;color:#fff;">Febbox Access Token (for CineSrc VIP streams)</label>
            <div style="display:flex;gap:10px;width:100%;">
              <input type="text" id="input-settings-febbox" value="${escapeAttr(s.febboxToken || "")}" 
                     placeholder="Enter your Febbox token"
                     style="flex:1;height:42px;background:#141822;border:1px solid rgba(255,255,255,0.12);color:#fff;border-radius:12px;padding:0 14px;font-size:0.9rem;">
              <button type="button" class="btn-settings-pill" id="btn-save-febbox">Save</button>
            </div>
          </div>

          <div class="settings-field-row" style="flex-direction:column;align-items:flex-start;gap:10px;margin-top:15px;">
            <label style="font-weight:600;font-size:0.9rem;color:#fff;">TMDb v3 API Key</label>
            <div style="display:flex;gap:10px;width:100%;">
              <input type="text" id="input-settings-tmdb" value="${escapeAttr(s.tmdbApiKey)}" 
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
    // Auth & Account Actions
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
        this._openAuthView("login");
      });

    // Add New Account Button
    document.getElementById("btn-add-new-account")?.addEventListener("click", () => {
      this._openAuthView("login");
    });

    // Switch Account click
    document.querySelectorAll("[data-switch-account]").forEach((button) => {
      button.addEventListener("click", () => {
        const uid = button.dataset.switchAccount;
        const account = this.savedAccounts.find((item) => item.uid === uid);
        if (!account) return;
        this._openAuthView("login", account.email);
      });
    });

    // Remove Account click
    document.querySelectorAll("[data-remove-account]").forEach((button) => {
      button.addEventListener("click", () => {
        const uid = button.dataset.removeAccount;
        this._removeSavedAccount(uid);
        const content = document.getElementById("settings-tab-content");
        if (content) {
          content.innerHTML = this._getTabHTML("account");
          this._bindTabInnerEvents();
        }
      });
    });

    // Toggle Edit Profile Panel
    document
      .getElementById("btn-toggle-edit-profile")
      ?.addEventListener("click", () => {
        this.isEditingProfile = !this.isEditingProfile;
        const panel = document.getElementById("profile-edit-panel");
        if (panel) {
          panel.style.display = this.isEditingProfile ? "flex" : "none";
        }
      });

    document
      .getElementById("btn-cancel-edit-profile")
      ?.addEventListener("click", () => {
        this.isEditingProfile = false;
        const panel = document.getElementById("profile-edit-panel");
        if (panel) panel.style.display = "none";
      });

    // Avatar Upload Mode Tabs
    const btnModeUrl = document.getElementById("mode-avatar-url");
    const btnModeFile = document.getElementById("mode-avatar-file");
    const containerUrl = document.getElementById("container-avatar-url");
    const containerFile = document.getElementById("container-avatar-file");

    btnModeUrl?.addEventListener("click", () => {
      btnModeUrl.classList.add("active");
      btnModeFile?.classList.remove("active");
      if (containerUrl) containerUrl.style.display = "block";
      if (containerFile) containerFile.style.display = "none";
      this.tempAvatarFile = null;
    });

    btnModeFile?.addEventListener("click", () => {
      btnModeFile.classList.add("active");
      btnModeUrl?.classList.remove("active");
      if (containerFile) containerFile.style.display = "block";
      if (containerUrl) containerUrl.style.display = "none";
    });

    // Live preview avatar URL
    const urlInput = document.getElementById("input-avatar-url");
    const livePreview = document.getElementById("avatar-live-preview");

    urlInput?.addEventListener("input", (e) => {
      if (livePreview && e.target.value.trim()) {
        livePreview.src = e.target.value.trim();
      }
    });

    // Live preview file upload
    const fileInput = document.getElementById("input-avatar-file");
    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file && livePreview) {
        this.tempAvatarFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
          livePreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    // Save Profile Changes
    document.getElementById("btn-save-profile")?.addEventListener("click", async () => {
      const user = getCurrentUser();
      if (!user) return;

      const saveBtn = document.getElementById("btn-save-profile");
      const nameInput = document.getElementById("input-edit-displayname");
      const newName = nameInput?.value.trim() || user.displayName || "CineJoy User";
      let newPhotoURL = urlInput?.value.trim() || user.photoURL || "";

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
      }

      try {
        // 1. Upload file if picked
        if (this.tempAvatarFile) {
          const avatarRef = createUserAvatarRef(user.uid);
          await uploadBytes(avatarRef, this.tempAvatarFile);
          newPhotoURL = await getDownloadURL(avatarRef);
        }

        // 2. Update Firebase Authentication Profile
        await updateProfile(user, {
          displayName: newName,
          photoURL: newPhotoURL,
        });

        // 3. Update Firestore User Document
        const userDocRef = doc(firestore, "users", user.uid);
        await setDoc(
          userDocRef,
          {
            uid: user.uid,
            displayName: newName,
            photoURL: newPhotoURL,
            email: user.email || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        // 4. Update Saved Accounts List in Memory and LocalStorage
        this._updateAccountInMemory(user.uid, {
          displayName: newName,
          photoURL: newPhotoURL,
        });

        this.isEditingProfile = false;
        this.tempAvatarFile = null;

        alert("Profile updated successfully!");

        // Refresh view
        const content = document.getElementById("settings-tab-content");
        if (content) {
          content.innerHTML = this._getTabHTML("account");
          this._bindTabInnerEvents();
        }
      } catch (error) {
        console.error("[SettingsView] Failed to update profile:", error);
        alert("Failed to update profile: " + (error.message || "Unknown error"));
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fa-solid fa-check"></i> Save Changes`;
        }
      }
    });

    // Appearance
    document
      .getElementById("setting-ambient-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.ambientGlow = e.target.checked;
        this._saveSettings();
        document.body.classList.toggle("ambient-disabled", !e.target.checked);
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
      .getElementById("setting-cinesrc-server")
      ?.addEventListener("change", (e) => {
        this.settings.cinesrcServer = e.target.value;
        this._saveSettings();
      });

    document
      .getElementById("setting-cinesrc-prioritize")
      ?.addEventListener("change", (e) => {
        this.settings.cinesrcPrioritize = e.target.checked;
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

    // Febbox & TMDb
    document.getElementById("btn-save-febbox")?.addEventListener("click", () => {
      const val = document.getElementById("input-settings-febbox")?.value.trim() || "";
      this.settings.febboxToken = val;
      this._saveSettings();
      alert("Febbox token saved successfully!");
    });

    document.getElementById("btn-save-tmdb")?.addEventListener("click", () => {
      const val = document.getElementById("input-settings-tmdb")?.value.trim();
      if (val) {
        this.settings.tmdbApiKey = val;
        APP_CONFIG.tmdb.apiKey = val;
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
          this.render();
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

export function getUserSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}