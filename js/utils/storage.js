// ============================================================================
// js/utils/storage.js
// Watch Progress & Watchlist Service with Full Firestore Real-time Sync
// ============================================================================

import { APP_CONFIG } from "../config.js";
import { observeAuth, getCurrentUser } from "../firebase/firebase-auth.js";
import {
  saveUserWatchProgress,
  deleteUserWatchProgress,
  subscribeToUserWatchProgress,
  saveUserWatchlistItem,
  deleteUserWatchlistItem,
  subscribeToUserWatchlist,
} from "../firebase/firebase-firestore.js";
import { trackUserActivity } from "../firebase/firebase-activity.js";
class StorageService {
  constructor() {
    this.watchlistKey =
      APP_CONFIG.storageKeys?.watchlist || "cinejoy_user_watchlist_v1";
    this.progressKey = "cinejoy_watch_progress_v2";
    this.currentUser = getCurrentUser() || null;

    this._unsubscribeProgress = null;
    this._unsubscribeWatchlist = null;

    this._remoteProgress = [];
    this._remoteWatchlist = [];

    this._initSeedData();
    this._initAuthSync();
  }

  _initSeedData() {
    if (!localStorage.getItem(this.progressKey)) {
      const seed = [
        {
          id: 60735,
          title: "The Flash",
          media_type: "tv",
          backdrop_path:
            "https://image.tmdb.org/t/p/original/mDeZp6a3vXv8P3L47t0g1C9zM6v.jpg",
          season: 1,
          episode: 8,
          currentTime: 1320,
          duration: 2700,
          lastWatched: Date.now(),
        },
      ];
      localStorage.setItem(this.progressKey, JSON.stringify(seed));
    }
  }

  /* ---------------- AUTH & CLOUD SYNCHRONIZATION ---------------- */
  _initAuthSync() {
    observeAuth((user) => {
      this.currentUser = user || null;

      // Clean up previous listeners
      if (this._unsubscribeProgress) {
        this._unsubscribeProgress();
        this._unsubscribeProgress = null;
      }
      if (this._unsubscribeWatchlist) {
        this._unsubscribeWatchlist();
        this._unsubscribeWatchlist = null;
      }

      if (user) {
        // 1. Sync any existing local guest items up to Firestore
        this._syncLocalToFirestore(user.uid);

        // 2. Real-time Continue Watching sync
        this._unsubscribeProgress = subscribeToUserWatchProgress(
          user.uid,
          (items) => {
            this._remoteProgress = items;
            try {
              localStorage.setItem(this.progressKey, JSON.stringify(items));
            } catch {}
            window.dispatchEvent(
              new CustomEvent("cinejoy:progress-updated", { detail: { items } }),
            );
          },
        );

        // 3. Real-time Watchlist sync
        this._unsubscribeWatchlist = subscribeToUserWatchlist(
          user.uid,
          (items) => {
            this._remoteWatchlist = items;
            try {
              localStorage.setItem(this.watchlistKey, JSON.stringify(items));
            } catch {}
            window.dispatchEvent(
              new CustomEvent("cinejoy:watchlist-changed", {
                detail: { count: items.length, items },
              }),
            );
          },
        );
      } else {
        // Logged out: return to local guest storage
        this._remoteProgress = [];
        this._remoteWatchlist = [];
        window.dispatchEvent(
          new CustomEvent("cinejoy:progress-updated", {
            detail: { items: this.getContinueWatching() },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("cinejoy:watchlist-changed", {
            detail: { count: this.getWatchlist().length },
          }),
        );
      }
    });
  }

  async _syncLocalToFirestore(uid) {
    try {
      // Migrate local progress
      const localProgress = this.getContinueWatching();
      for (const item of localProgress) {
        await saveUserWatchProgress(uid, item).catch(() => {});
      }

      // Migrate local watchlist
      const localWatchlist = this.getWatchlist();
      for (const item of localWatchlist) {
        await saveUserWatchlistItem(uid, item).catch(() => {});
      }
    } catch (e) {
      console.warn("[StorageService] Initial sync to Firestore failed:", e);
    }
  }

  /* ---------------- WATCH PROGRESS (CONTINUE WATCHING) ---------------- */
  getContinueWatching() {
    if (this.currentUser && this._remoteProgress.length > 0) {
      return [...this._remoteProgress].sort(
        (a, b) => (b.lastWatched || 0) - (a.lastWatched || 0),
      );
    }

    try {
      const raw = localStorage.getItem(this.progressKey);
      const items = raw ? JSON.parse(raw) : [];
      return items.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
    } catch {
      return [];
    }
  }

  getWatchProgress(item) {
    if (!item?.id) return null;
    const list = this.getContinueWatching();
    return list.find((x) => x.id === Number(item.id)) || null;
  }

  async saveWatchProgress(
    item,
    currentTime = 600,
    duration = 3600,
    season = 1,
    episode = 1,
  ) {
    if (!item?.id) return;

    let list = this.getContinueWatching();
    const index = list.findIndex((x) => x.id === Number(item.id));

    const progressEntry = {
      id: Number(item.id),
      title: item.title || item.name || "Untitled",
      media_type: item.media_type || (season ? "tv" : "movie"),
      backdrop_path: item.backdrop_path || item.poster_path || "",
      poster_path: item.poster_path || "",
      season: Number(season) || 1,
      episode: Number(episode) || 1,
      currentTime: Math.min(currentTime, duration),
      duration: duration || 3600,
      lastWatched: Date.now(),
    };

    if (index > -1) {
      list[index] = progressEntry;
    } else {
      list.unshift(progressEntry);
    }

    list = list.slice(0, 16);

    // 1. Instant local update
    try {
      localStorage.setItem(this.progressKey, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent("cinejoy:progress-updated", { detail: { items: list } }),
      );
    } catch (err) {
      console.error("[StorageService] Error saving progress locally:", err);
    }

    // 2. Cloud update if logged in
    if (this.currentUser?.uid) {
      try {
        await saveUserWatchProgress(this.currentUser.uid, progressEntry);
      } catch (err) {
        console.error("[StorageService] Error syncing watch progress:", err);
      }
    }
  }

  async removeContinueWatching(id) {
    const mediaId = Number(id);

    // 1. Remove locally
    let list = this.getContinueWatching().filter((x) => x.id !== mediaId);
    try {
      localStorage.setItem(this.progressKey, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent("cinejoy:progress-updated", { detail: { items: list } }),
      );
    } catch {}

    // 2. Remove from Firestore
    if (this.currentUser?.uid) {
      try {
        await deleteUserWatchProgress(this.currentUser.uid, mediaId);
      } catch (err) {
        console.error("[StorageService] Error deleting watch progress:", err);
      }
    }
  }

  formatRemainingTime(currentTime, duration) {
    const remainingSeconds = Math.max(0, duration - currentTime);
    const minutes = Math.floor(remainingSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remMinutes}m left`;
    }
    return `${minutes}m left`;
  }

  /* ---------------- WATCHLIST ---------------- */
  getWatchlist() {
    if (this.currentUser && this._remoteWatchlist.length > 0) {
      return [...this._remoteWatchlist].sort(
        (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
      );
    }

    try {
      const raw = localStorage.getItem(this.watchlistKey);
      const items = raw ? JSON.parse(raw) : [];
      return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } catch {
      return [];
    }
  }

  isInWatchlist(id) {
    return this.getWatchlist().some((item) => item.id === Number(id));
  }

  async toggleWatchlist(item) {
    if (!item?.id) return false;

    let list = this.getWatchlist();
    const mediaId = Number(item.id);
    const exists = list.some((x) => x.id === mediaId);

    const watchlistItem = {
      id: mediaId,
      title: item.title || item.name || "Untitled",
      media_type: item.media_type || "movie",
      poster_path: item.poster_path || "",
      backdrop_path: item.backdrop_path || "",
      vote_average: Number(item.vote_average) || 0,
      release_date: item.release_date || item.first_air_date || "",
      addedAt: Date.now(),
    };

    // 1. Instant local update
    if (exists) {
      list = list.filter((x) => x.id !== mediaId);
    } else {
      list.unshift(watchlistItem);
    }

    try {
      localStorage.setItem(this.watchlistKey, JSON.stringify(list));
      window.dispatchEvent(
        new CustomEvent("cinejoy:watchlist-changed", {
          detail: { count: list.length, items: list },
        }),
      );
    } catch {}

    // 2. Cloud update if logged in + XP Tracking
    if (this.currentUser?.uid) {
      try {
        if (exists) {
          await deleteUserWatchlistItem(this.currentUser.uid, mediaId);
        } else {
          await saveUserWatchlistItem(this.currentUser.uid, watchlistItem);
          
          // 🌟 XP Tracking: Attribuer +10 XP 7it zad film jdid l-Watchlist
          trackUserActivity("WATCHLIST_ADD", {
            id: mediaId,
            title: watchlistItem.title,
          });
        }
      } catch (err) {
        console.error("[StorageService] Error syncing watchlist to Firestore:", err);
      }
    }

    return !exists;
  }
}

export const storageService = new StorageService();