// ============================================================================
// js/firebase/firebase-lists.js
// Safe Community Lists Service
// ============================================================================

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firestore } from "./firebase-app.js";
import { getCurrentUser } from "./firebase-auth.js";
import { trackUserActivity } from "./firebase-activity.js";

const LISTS_COLLECTION = "communityLists";

export async function createCommunityList({ title, description = "", isPublic = true, items = [] }) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error("Please sign in first.");

    const listRef = doc(collection(firestore, LISTS_COLLECTION));
    const authorName = user.displayName || user.email?.split("@")[0] || "CineJoy User";

    const listData = {
      id: listRef.id,
      userId: user.uid,
      authorName,
      authorAvatar: user.photoURL || "",
      title: title.trim(),
      description: description.trim(),
      isPublic: Boolean(isPublic),
      items: items,
      itemCount: items.length,
      createdAt: Date.now(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(listRef, listData);

    // 🌟 XP Tracking: Attribuer +100 XP 7it nshar list jdida f l-community
    try {
      trackUserActivity("LIST_CREATED", {
        listId: listRef.id,
        title: listData.title,
      });
    } catch (e) {
      console.warn("[Lists] XP track error:", e);
    }

    return listData;
  } catch (err) {
    console.error("[Lists] createCommunityList error:", err);
    throw err;
  }
}

export async function getPublicCommunityLists(max = 60) {
  try {
    if (!firestore) return [];
    const q = query(
      collection(firestore, LISTS_COLLECTION),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (error) {
    console.warn("[Lists] Failed to load public lists (Firestore might need Index):", error);
    // Fallback: ila kant index ma m9adash f firestore, njibo bla orderBy
    try {
      const fallbackQuery = query(
        collection(firestore, LISTS_COLLECTION),
        where("isPublic", "==", true),
        limit(max)
      );
      const snap = await getDocs(fallbackQuery);
      return snap.docs.map((d) => d.data());
    } catch {
      return [];
    }
  }
}

export async function deleteCommunityList(listId) {
  try {
    const user = getCurrentUser();
    if (!user || !listId) return;
    const ref = doc(firestore, LISTS_COLLECTION, listId);
    await deleteDoc(ref);
  } catch (err) {
    console.error("[Lists] deleteCommunityList error:", err);
  }
}