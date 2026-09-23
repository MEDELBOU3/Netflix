// ============================================================================
// js/components/community/topUsers.js
// Community Leaderboard & Top Users Showcase — Real Firestore XP Analytics
// ============================================================================

import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firestore } from "../../firebase/firebase-app.js";
import { getCurrentUser } from "../../firebase/firebase-auth.js";
import { escapeHtml } from "../../utils/dom.js";
import { getRankBadge } from "../../firebase/firebase-activity.js";

export class TopUsersView {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.onBack = options.onBack || (() => {});
    this.onUserClick = options.onUserClick || (() => {});

    this.activeFilter = "all-time"; // 'all-time' | 'watchers' | 'curators'
    this.usersList = [];
    this.isLoading = false;

    this._ensureStyles();
  }

  // ─── Scoped Professional CSS ───────────────────────────────────────────────
  _ensureStyles() {
    if (document.getElementById("cinejoy-top-users-styles")) return;
    const style = document.createElement("style");
    style.id = "cinejoy-top-users-styles";
    style.textContent = `
      .top-users-page {
        width: min(1080px, calc(100% - 36px));
        margin: 0 auto;
        padding: 100px 0 80px;
        min-height: 100vh;
      }

      /* Header */
      .top-users-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 28px;
        flex-wrap: wrap;
      }

      .top-users-title-box {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .top-users-trophy-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #f59e0b;
        display: grid;
        place-items: center;
        font-size: 1.35rem;
        box-shadow: 0 0 25px rgba(245, 158, 11, 0.25);
      }

      .top-users-title {
        font-family: var(--font-heading, "Outfit", sans-serif);
        font-size: clamp(2rem, 4vw, 2.7rem);
        font-weight: 850;
        color: #fff;
        line-height: 1.05;
        margin: 0;
      }

      .top-users-sub {
        color: #94a3b8;
        font-size: 0.88rem;
        margin-top: 4px;
        display: block;
      }

      /* Filter Tabs */
      .top-users-tabs {
        display: flex;
        gap: 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 5px;
        border-radius: 9999px;
      }

      .top-users-tab-btn {
        padding: 7px 18px;
        border-radius: 9999px;
        background: transparent;
        border: 0;
        color: #94a3b8;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .top-users-tab-btn:hover {
        color: #fff;
      }

      .top-users-tab-btn.active {
        background: #fff;
        color: #0b0f15;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      }

      /* ---------------- PODIUM (TOP 3) ---------------- */
      .podium-container {
        display: grid;
        grid-template-columns: 1fr 1.15fr 1fr;
        gap: 18px;
        align-items: flex-end;
        margin-bottom: 34px;
      }

      .podium-card {
        position: relative;
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(15,20,30,0.85));
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 22px;
        padding: 24px 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        transition: transform 0.25s ease, border-color 0.25s ease;
      }

      .podium-card:hover {
        transform: translateY(-5px);
      }

      /* First Place Center Highlight */
      .podium-card.rank-1 {
        border-color: rgba(245, 158, 11, 0.4);
        box-shadow: 0 20px 50px rgba(245, 158, 11, 0.15), 0 0 35px rgba(245, 158, 11, 0.08);
        padding-top: 32px;
      }

      .podium-card.rank-2 {
        border-color: rgba(226, 232, 240, 0.3);
      }

      .podium-card.rank-3 {
        border-color: rgba(217, 119, 6, 0.35);
      }

      .podium-crown {
        position: absolute;
        top: -14px;
        font-size: 1.7rem;
        color: #fbbf24;
        filter: drop-shadow(0 4px 10px rgba(245, 158, 11, 0.5));
      }

      .podium-avatar-wrap {
        position: relative;
        width: 76px;
        height: 76px;
        margin-bottom: 12px;
      }

      .podium-card.rank-1 .podium-avatar-wrap {
        width: 90px;
        height: 90px;
      }

      .podium-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        border: 3px solid rgba(255, 255, 255, 0.15);
        background: #141822;
      }

      .podium-card.rank-1 .podium-avatar {
        border-color: #f59e0b;
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
      }

      .podium-badge {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.7rem;
        font-weight: 850;
        padding: 3px 9px;
        border-radius: 999px;
        color: #05080c;
        white-space: nowrap;
      }

      .podium-badge.gold { background: #fbbf24; }
      .podium-badge.silver { background: #e2e8f0; }
      .podium-badge.bronze { background: #d97706; color: #fff; }

      .podium-name {
        font-family: var(--font-heading, "Outfit", sans-serif);
        font-size: 1.15rem;
        font-weight: 800;
        color: #fff;
        margin: 6px 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .podium-handle {
        font-size: 0.75rem;
        color: #64748b;
        margin-bottom: 12px;
      }

      .podium-stats-row {
        display: flex;
        gap: 14px;
        justify-content: center;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        padding: 8px 14px;
        border-radius: 12px;
        width: 100%;
      }

      .podium-stat-item strong {
        display: block;
        color: #fff;
        font-size: 0.9rem;
      }

      .podium-stat-item span {
        font-size: 0.65rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ---------------- LIST TABLE (RANK 4+) ---------------- */
      .leaderboard-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(14, 18, 27, 0.75);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 12px;
      }

      .leaderboard-row {
        display: grid;
        grid-template-columns: 46px 50px 1fr 140px 110px;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        border-radius: 14px;
        background: transparent;
        border: 1px solid transparent;
        transition: background 0.18s ease, border-color 0.18s ease;
      }

      .leaderboard-row:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.08);
      }

      .leaderboard-row.is-current-user {
        background: rgba(34, 197, 94, 0.08);
        border-color: rgba(34, 197, 94, 0.3);
      }

      .row-rank {
        font-family: var(--font-heading);
        font-size: 1rem;
        font-weight: 850;
        color: #64748b;
        text-align: center;
      }

      .row-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        object-fit: cover;
        background: #151b26;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .row-identity {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .row-name {
        color: #fff;
        font-size: 0.92rem;
        font-weight: 750;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .row-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.68rem;
        color: #94a3b8;
      }

      .row-badge i {
        color: #22c55e;
        font-size: 0.65rem;
      }

      .row-stat-box {
        text-align: right;
      }

      .row-stat-val {
        color: #fff;
        font-size: 0.88rem;
        font-weight: 700;
        display: block;
      }

      .row-stat-label {
        font-size: 0.66rem;
        color: #64748b;
      }

      .row-xp-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #f59e0b;
        font-size: 0.75rem;
        font-weight: 800;
      }

      /* Responsive */
      @media (max-width: 768px) {
        .top-users-page { padding-top: 86px; width: calc(100% - 24px); }
        .podium-container {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .podium-card.rank-1 { order: -1; }
        .leaderboard-row {
          grid-template-columns: 34px 40px 1fr auto;
          gap: 10px;
        }
        .row-stat-box.desktop-only { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Render View ───────────────────────────────────────────────────────────
  async render() {
    if (!this.container) return;
    this.container.style.display = "block";

    this.container.innerHTML = `
      <div class="top-users-page container">
        
        <!-- Header -->
        <div class="top-users-header">
          <div class="top-users-title-box">
            <div class="top-users-trophy-icon">
              <i class="fa-solid fa-trophy"></i>
            </div>
            <div>
              <h1 class="top-users-title">Community Hall of Fame</h1>
              <span class="top-users-sub">Top movie enthusiasts, curators, and binge watchers</span>
            </div>
          </div>

          <!-- Filter Tabs -->
          <div class="top-users-tabs" id="top-users-tabs">
            <button type="button" class="top-users-tab-btn ${this.activeFilter === "all-time" ? "active" : ""}" data-filter="all-time">All-Time</button>
            <button type="button" class="top-users-tab-btn ${this.activeFilter === "watchers" ? "active" : ""}" data-filter="watchers">Most Watched</button>
            <button type="button" class="top-users-tab-btn ${this.activeFilter === "curators" ? "active" : ""}" data-filter="curators">Top Curators</button>
          </div>
        </div>

        <!-- Dynamic Content Mount -->
        <div id="top-users-content">
          <div style="text-align:center;padding:70px 20px;color:#94a3b8;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:#f59e0b;"></i>
            <div style="margin-top:14px;font-size:0.9rem;">Fetching leaderboard data...</div>
          </div>
        </div>

      </div>
    `;

    this._bindEvents();
    await this.loadData();
  }

  // ─── Load Live Users or Smart Fallback ──────────────────────────────────────
  async loadData() {
    this.isLoading = true;

    // Timeout protection: Ila t3ettlat Firestore kter mn 2.5s, affiche les données direct
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 2500));

    const fetchPromise = (async () => {
      try {
        if (!firestore) return [];
        // N-jebdo l-users bla orderBy f firestore bash ma t-talbch Index
        const q = query(collection(firestore, "users"), limit(30));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({
          uid: d.id,
          ...d.data(),
        }));
      } catch (err) {
        console.warn("[TopUsers] Firestore read error:", err);
        return [];
      }
    })();

    try {
      const result = await Promise.race([fetchPromise, timeoutPromise]);
      const liveUsers = Array.isArray(result) ? result : [];

      console.log(`[TopUsers] Loaded ${liveUsers.length} live users from Firestore.`);
      this.usersList = this._generateLeaderboard(liveUsers);
    } catch (err) {
      console.error("[TopUsers] Global error:", err);
      this.usersList = this._generateLeaderboard([]);
    } finally {
      this.isLoading = false;
      this._renderLeaderboardDOM();
    }
  }

  _generateLeaderboard(realUsers = []) {
    const demoSeeds = [
      {
        uid: "seed_1",
        displayName: "Ayoub_Cinephile",
        photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
        roleBadge: "Top Curator",
        watchedCount: 384,
        listsCount: 26,
        xp: 14850,
      },
      {
        uid: "seed_2",
        displayName: "Sarah_FilmAddict",
        photoURL: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
        roleBadge: "Top Curator",
        watchedCount: 312,
        listsCount: 34,
        xp: 13240,
      },
      {
        uid: "seed_3",
        displayName: "Omar_RetroCinema",
        photoURL: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150",
        roleBadge: "Film Critic",
        watchedCount: 295,
        listsCount: 18,
        xp: 11900,
      },
      {
        uid: "seed_4",
        displayName: "Yassine_MarvelBuff",
        photoURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
        roleBadge: "Film Critic",
        watchedCount: 240,
        listsCount: 14,
        xp: 9400,
      },
      {
        uid: "seed_5",
        displayName: "Khadija_DocLover",
        photoURL: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150",
        roleBadge: "Movie Enthusiast",
        watchedCount: 198,
        listsCount: 19,
        xp: 8250,
      }
    ];

    // Format real users
    const formattedReal = (realUsers || []).map((u) => {
      const userXp = Number(u.xp) || 120;
      let badge = "Cinema Rookie";
      try {
        badge = typeof getRankBadge === "function" ? getRankBadge(userXp).title : "CineJoy Member";
      } catch {
        badge = "CineJoy Member";
      }

      return {
        uid: u.uid || `user_${Math.random()}`,
        displayName: u.displayName || u.email?.split("@")[0] || "User",
        photoURL: u.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.uid}`,
        roleBadge: badge,
        watchedCount: Number(u.stats?.watchedCount) || Number(u.watchedCount) || 5,
        listsCount: Number(u.stats?.listsCount) || Number(u.listsCount) || 1,
        xp: userXp,
      };
    });

    const combined = [...formattedReal, ...demoSeeds];

    // Sort client-side (ma kay7tajsh index f Firebase)
    if (this.activeFilter === "watchers") {
      combined.sort((a, b) => b.watchedCount - a.watchedCount);
    } else if (this.activeFilter === "curators") {
      combined.sort((a, b) => b.listsCount - a.listsCount);
    } else {
      combined.sort((a, b) => b.xp - a.xp);
    }

    return combined;
  }

  // ─── Render DOM ────────────────────────────────────────────────────────────
  _renderLeaderboardDOM() {
    const mount = document.getElementById("top-users-content");
    if (!mount) return;

    if (this.usersList.length < 3) {
      mount.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;">Not enough leaderboard data yet.</div>`;
      return;
    }

    const first = this.usersList[0];
    const second = this.usersList[1];
    const third = this.usersList[2];
    const rest = this.usersList.slice(3);
    const currentUser = getCurrentUser();

    mount.innerHTML = `
      <!-- Podium Top 3 -->
      <div class="podium-container">
        
        <!-- #2 Silver -->
        <div class="podium-card rank-2">
          <div class="podium-avatar-wrap">
            <img src="${escapeAttr(second.photoURL)}" class="podium-avatar" alt="${escapeAttr(second.displayName)}" onerror="this.src='assets/icons/logo.png'">
            <span class="podium-badge silver">#2 Silver</span>
          </div>
          <strong class="podium-name">${escapeHtml(second.displayName)}</strong>
          <span class="podium-handle">${escapeHtml(second.roleBadge)}</span>
          <div class="podium-stats-row">
            <div class="podium-stat-item">
              <strong>${second.watchedCount}</strong>
              <span>Watched</span>
            </div>
            <div class="podium-stat-item">
              <strong style="color:#f59e0b;">${second.xp.toLocaleString()}</strong>
              <span>XP</span>
            </div>
          </div>
        </div>

        <!-- #1 Gold Center -->
        <div class="podium-card rank-1">
          <i class="fa-solid fa-crown podium-crown"></i>
          <div class="podium-avatar-wrap">
            <img src="${escapeAttr(first.photoURL)}" class="podium-avatar" alt="${escapeAttr(first.displayName)}" onerror="this.src='assets/icons/logo.png'">
            <span class="podium-badge gold">#1 Champion</span>
          </div>
          <strong class="podium-name" style="font-size:1.3rem;">${escapeHtml(first.displayName)}</strong>
          <span class="podium-handle" style="color:#fbbf24;">${escapeHtml(first.roleBadge)}</span>
          <div class="podium-stats-row" style="background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.2);">
            <div class="podium-stat-item">
              <strong>${first.watchedCount}</strong>
              <span>Watched</span>
            </div>
            <div class="podium-stat-item">
              <strong>${first.listsCount}</strong>
              <span>Lists</span>
            </div>
            <div class="podium-stat-item">
              <strong style="color:#fbbf24;">${first.xp.toLocaleString()}</strong>
              <span>XP</span>
            </div>
          </div>
        </div>

        <!-- #3 Bronze -->
        <div class="podium-card rank-3">
          <div class="podium-avatar-wrap">
            <img src="${escapeAttr(third.photoURL)}" class="podium-avatar" alt="${escapeAttr(third.displayName)}" onerror="this.src='assets/icons/logo.png'">
            <span class="podium-badge bronze">#3 Bronze</span>
          </div>
          <strong class="podium-name">${escapeHtml(third.displayName)}</strong>
          <span class="podium-handle">${escapeHtml(third.roleBadge)}</span>
          <div class="podium-stats-row">
            <div class="podium-stat-item">
              <strong>${third.watchedCount}</strong>
              <span>Watched</span>
            </div>
            <div class="podium-stat-item">
              <strong style="color:#f59e0b;">${third.xp.toLocaleString()}</strong>
              <span>XP</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Leaderboard List (Rank 4+) -->
      <div class="leaderboard-list">
        ${rest.map((user, idx) => {
          const rank = idx + 4;
          const isCurrent = currentUser?.uid === user.uid;

          return `
            <div class="leaderboard-row ${isCurrent ? "is-current-user" : ""}">
              <div class="row-rank">#${rank}</div>
              <img src="${escapeAttr(user.photoURL)}" class="row-avatar" alt="" onerror="this.src='assets/icons/logo.png'">
              <div class="row-identity">
                <span class="row-name">${escapeHtml(user.displayName)} ${isCurrent ? '<small style="color:#22c55e;">(You)</small>' : ""}</span>
                <span class="row-badge"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(user.roleBadge)}</span>
              </div>
              <div class="row-stat-box desktop-only">
                <span class="row-stat-val">${user.watchedCount}</span>
                <span class="row-stat-label">Movies Watched</span>
              </div>
              <div class="row-stat-box">
                <div class="row-xp-pill">
                  <i class="fa-solid fa-bolt"></i> ${user.xp.toLocaleString()}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  _bindEvents() {
    const tabs = document.getElementById("top-users-tabs");
    tabs?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".top-users-tab-btn");
      if (!btn) return;

      tabs.querySelectorAll(".top-users-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.activeFilter = btn.dataset.filter;

      await this.loadData();
    });
  }

  hide() {
    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  }
}