import{firestore}from"./firebase-app.js";
export{collection,doc,getDoc,getDocs,addDoc,setDoc,updateDoc,deleteDoc,query,where,orderBy,limit,onSnapshot,serverTimestamp,increment,arrayUnion,arrayRemove,writeBatch,runTransaction}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export const communityRef=collection(firestore,"communityPosts");
export const usersRef=collection(firestore,"users");
export const commentsRef=collection(firestore,"comments");