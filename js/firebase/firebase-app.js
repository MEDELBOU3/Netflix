// ============================================================================
// firebase/firebase-app.js
// Firebase CDN bootstrap
// Non-blocking initialization: Analytics must never block the whole app.
// ============================================================================

import{initializeApp}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import{getAuth}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import{getFirestore}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import{getStorage}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import{getAnalytics,isSupported}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import{firebaseConfig}from"./firebase-config.js";

export const firebaseApp=initializeApp(firebaseConfig);
export const firebaseAuth=getAuth(firebaseApp);
export const firestore=getFirestore(firebaseApp);
export const firebaseStorage=getStorage(firebaseApp);

// IMPORTANT:
// Do not use top-level await here.
// app.js imports SettingsView -> Firebase -> this file.
// A pending analytics promise here can block the complete module graph,
// leaving the site stuck before DOMContentLoaded/app.init() runs.
export let firebaseAnalytics=null;

Promise.resolve()
  .then(()=>isSupported())
  .then(supported=>{
    if(!supported)return null;
    try{
      firebaseAnalytics=getAnalytics(firebaseApp);
      return firebaseAnalytics;
    }catch(error){
      console.warn("[Firebase] Analytics initialization skipped:",error);
      return null;
    }
  })
  .catch(error=>{
    console.warn("[Firebase] Analytics support check failed:",error);
  });
