import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { firebaseAuth, firestore } from "./firebase-app.js";

const googleProvider = new GoogleAuthProvider();

let persistenceReady = null;

function ensurePersistence() {
  if (!persistenceReady) {
    persistenceReady = setPersistence(firebaseAuth, browserLocalPersistence).catch(error => {
      console.warn("[Firebase Auth] Local persistence setup failed:", error);
    });
  }
  return persistenceReady;
}

async function syncUserProfile(user) {
  if (!user?.uid) return;

  try {
    await setDoc(doc(firestore, "users", user.uid), {
      uid: user.uid,
      displayName: user.displayName || "CineJoy User",
      email: user.email || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("[Firebase Auth] Firestore profile sync skipped:", error);
  }
}

export async function registerWithEmail(email, password, displayName = "") {
  await ensurePersistence();
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }

  await syncUserProfile(credential.user);
  return credential.user;
}

export async function loginWithEmail(email, password) {
  await ensurePersistence();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await syncUserProfile(credential.user);
  return credential.user;
}

export async function loginWithGoogle() {
  await ensurePersistence();
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  await syncUserProfile(credential.user);
  return credential.user;
}

export async function updateUserProfile(data = {}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("No authenticated user.");

  const next = {};
  if (typeof data.displayName === "string") next.displayName = data.displayName.trim();
  if (typeof data.photoURL === "string") next.photoURL = data.photoURL.trim();

  await updateProfile(user, next);
  await syncUserProfile(user);
  return user;
}

export async function logout() {
  await ensurePersistence();
  return signOut(firebaseAuth);
}

export function observeAuth(callback) {
  ensurePersistence();
  return onAuthStateChanged(firebaseAuth, callback);
}

export function getCurrentUser() {
  return firebaseAuth.currentUser;
}

export async function resetPassword(email) {
  await ensurePersistence();
  return sendPasswordResetEmail(firebaseAuth, email);
}

export async function removeCurrentAccount() {
  const user = getCurrentUser();
  if (!user) throw new Error("No authenticated user.");
  return deleteUser(user);
}
