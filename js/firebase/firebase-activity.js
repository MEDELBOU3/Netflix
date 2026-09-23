// ============================================================================
// js/firebase/firebase-activity.js
// ============================================================================

import {
  doc,
  setDoc,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firestore } from "./firebase-app.js";
import { getCurrentUser } from "./firebase-auth.js";
import { trackEvent } from "./firebase-analytics.js";

// Points map
const XP_REWARDS = {
  WATCH_COMPLETED: 50,
  WATCH_PROGRESS: 5,
  WATCHLIST_ADD: 10,
  LIST_CREATED: 100,
  REVIEW_POSTED: 30,
  DAILY_LOGIN: 20,
};

/**
 * Calculer le badge selon le score XP
 */
export function getRankBadge(xp = 0) {
  if (xp >= 15000) return { title: "Legendary Cinephile", icon: "fa-trophy", color: "#f59e0b" };
  if (xp >= 6000)  return { title: "Top Curator", icon: "fa-crown", color: "#a855f7" };
  if (xp >= 2000)  return { title: "Film Critic", icon: "fa-feather-pointed", color: "#3b82f6" };
  if (xp >= 500)   return { title: "Movie Enthusiast", icon: "fa-star", color: "#22c55e" };
  return { title: "Cinema Rookie", icon: "fa-ticket", color: "#94a3b8" };
}

/**
 * Enregistrer l'activité de l'utilisateur
 */
export async function trackUserActivity(actionType, meta = {}) {
  try {
    const user = getCurrentUser();
    if (!user || !firestore) return;

    const pointsToAdd = XP_REWARDS[actionType] || 5;
    const userRef = doc(firestore, "users", user.uid);

    const updates = {
      xp: increment(pointsToAdd),
      lastActive: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (actionType === "WATCH_COMPLETED") {
      updates["stats.watchedCount"] = increment(1);
    } else if (actionType === "LIST_CREATED") {
      updates["stats.listsCount"] = increment(1);
    } else if (actionType === "REVIEW_POSTED") {
      updates["stats.reviewsCount"] = increment(1);
    }

    await setDoc(userRef, updates, { merge: true });

    trackEvent(actionType.toLowerCase(), {
      uid: user.uid,
      points: pointsToAdd,
      ...meta,
    });
  } catch (err) {
    console.warn("[ActivityTracker] Skipped activity track:", err);
  }
}