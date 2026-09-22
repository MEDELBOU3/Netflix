// ============================================================================
// firebase/firebase-analytics.js
// CineJoy Analytics helpers
// ============================================================================

import{logEvent}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import{firebaseAnalytics}from"./firebase-app.js";

export function trackEvent(name,params={}){
  if(!firebaseAnalytics)return;
  try{
    logEvent(firebaseAnalytics,name,params);
  }catch(error){
    console.warn("[Firebase Analytics] Event skipped:",error);
  }
}

export function trackCommunityOpened(){trackEvent("community_opened");}
export function trackPostCreated(){trackEvent("community_post_created");}
export function trackPostLiked(){trackEvent("community_post_liked");}