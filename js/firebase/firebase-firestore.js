// ============================================================================
// js/firebase/firebase-firestore.js (Additions for Continue Watching)
// ============================================================================

import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firestore } from "./firebase-app.js";

/**
 * References the continue_watching subcollection for a given user
 * Path: users/{uid}/continue_watching/{mediaId}
 */
export const getUserProgressCollection = (uid) =>
  collection(firestore, "users", uid, "continue_watching");

export const getUserProgressDoc = (uid, mediaId) =>
  doc(firestore, "users", uid, "continue_watching", String(mediaId));

/**
 * Saves or updates a media item's watch progress in Firestore
 */
export async function saveUserWatchProgress(uid, item) {
  if (!uid || !item?.id) return;
  const docRef = getUserProgressDoc(uid, item.id);
  
  await setDoc(docRef, {
    id: item.id,
    title: item.title || item.name || "Untitled",
    media_type: item.media_type || "movie",
    backdrop_path: item.backdrop_path || item.poster_path || "",
    poster_path: item.poster_path || "",
    season: Number(item.season) || 1,
    episode: Number(item.episode) || 1,
    currentTime: Math.round(Number(item.currentTime) || 0),
    duration: Math.round(Number(item.duration) || 3600),
    lastWatched: Date.now(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/**
 * Removes an item from the user's continue watching in Firestore
 */
export async function deleteUserWatchProgress(uid, mediaId) {
  if (!uid || !mediaId) return;
  const docRef = getUserProgressDoc(uid, mediaId);
  await deleteDoc(docRef);
}

/**
 * Subscribes to real-time updates for a user's continue watching list
 */
export function subscribeToUserWatchProgress(uid, onUpdate) {
  if (!uid) return () => {};

  const q = query(
    getUserProgressCollection(uid),
    orderBy("lastWatched", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => doc.data());
    onUpdate(items);
  }, (err) => {
    console.warn("[Firestore] Continue watching sync error:", err);
  });
}

/**
 * References the watchlist subcollection for a given user
 * Path: users/{uid}/watchlist/{mediaId}
 */
export const getUserWatchlistCollection = (uid) =>
  collection(firestore, "users", uid, "watchlist");

export const getUserWatchlistDoc = (uid, mediaId) =>
  doc(firestore, "users", uid, "watchlist", String(mediaId));

/**
 * Adds an item to the user's Firestore watchlist
 */
export async function saveUserWatchlistItem(uid, item) {
  if (!uid || !item?.id) return;
  const docRef = getUserWatchlistDoc(uid, item.id);

  await setDoc(
    docRef,
    {
      id: Number(item.id),
      title: item.title || item.name || "Untitled",
      media_type: item.media_type || "movie",
      poster_path: item.poster_path || "",
      backdrop_path: item.backdrop_path || "",
      vote_average: Number(item.vote_average) || 0,
      release_date: item.release_date || item.first_air_date || "",
      addedAt: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Removes an item from the user's Firestore watchlist
 */
export async function deleteUserWatchlistItem(uid, mediaId) {
  if (!uid || !mediaId) return;
  const docRef = getUserWatchlistDoc(uid, mediaId);
  await deleteDoc(docRef);
}

/**
 * Subscribes to real-time updates for a user's watchlist
 */
export function subscribeToUserWatchlist(uid, onUpdate) {
  if (!uid) return () => {};

  const q = query(
    getUserWatchlistCollection(uid),
    orderBy("addedAt", "desc"),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => doc.data());
      onUpdate(items);
    },
    (err) => {
      console.warn("[Firestore] Watchlist sync error:", err);
    },
  );
}