import { LIVE_TV_CONFIG } from "./liveTvConfig.js";

const safeRead = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export function savePlaylistUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    localStorage.removeItem(LIVE_TV_CONFIG.storageKey);
    return;
  }

  safeWrite(LIVE_TV_CONFIG.storageKey, { playlistUrl: value });
}

export function getPlaylistUrl() {
  const saved = safeRead(LIVE_TV_CONFIG.storageKey, null);
  return saved?.playlistUrl || LIVE_TV_CONFIG.playlistUrl || "";
}

export function clearPlaylistUrl() {
  localStorage.removeItem(LIVE_TV_CONFIG.storageKey);
}

export function getFavorites() {
  const list = safeRead(LIVE_TV_CONFIG.favoritesKey, []);
  return Array.isArray(list) ? list.map(String) : [];
}

export function isFavorite(channelId) {
  return getFavorites().includes(String(channelId));
}

export function toggleFavorite(channelId) {
  const id = String(channelId);
  const favorites = getFavorites();
  const index = favorites.indexOf(id);

  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push(id);
  }

  safeWrite(LIVE_TV_CONFIG.favoritesKey, favorites);
  return index < 0;
}

export function addRecent(channel) {
  if (!channel?.id) return;

  const id = String(channel.id);
  const recent = safeRead(LIVE_TV_CONFIG.recentKey, []);
  const filtered = Array.isArray(recent)
    ? recent.filter(item => String(item?.id) !== id)
    : [];

  filtered.unshift({
    id,
    name: channel.name || "",
    logo: channel.logo || "",
    group: channel.group || "Other",
    url: channel.url || "",
  });

  safeWrite(
    LIVE_TV_CONFIG.recentKey,
    filtered.slice(0, LIVE_TV_CONFIG.maxRecent)
  );
}

export function getRecent() {
  const recent = safeRead(LIVE_TV_CONFIG.recentKey, []);
  return Array.isArray(recent) ? recent : [];
}

export function clearRecent() {
  localStorage.removeItem(LIVE_TV_CONFIG.recentKey);
}