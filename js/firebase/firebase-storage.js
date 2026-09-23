//js\firebase\firebase-storage.js

import{firebaseStorage}from"./firebase-app.js";
export{ref,uploadBytes,uploadBytesResumable,getDownloadURL,deleteObject}from"https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
export const createUserAvatarRef=(uid)=>ref(firebaseStorage,`users/${uid}/avatar`);
export const createCommunityImageRef=(uid,fileName)=>ref(firebaseStorage,`community/${uid}/${Date.now()}_${fileName}`);