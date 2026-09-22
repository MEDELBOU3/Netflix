// js/firebase/firebase-community.js
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { firestore } from "./firebase-app.js";
import { getCurrentUser } from "./firebase-auth.js";

const POSTS = "communityPosts";
const COMMENTS = "comments";
const USERS = "users";

function requireUser() {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error("Please sign in first.");
  return user;
}

function requireId(value, label = "ID") {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`${label} is required.`);
  return id;
}

function cleanText(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanTitle(value) {
  return cleanText(value, 120);
}

function cleanName(value) {
  return cleanText(value, 80) || "User";
}

function oldest(docs) {
  return docs.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return aTime - bTime;
  });
}

export async function createPost({
  title = "",
  text = "",
  mediaId = null,
  mediaType = "movie",
  mediaTitle = "",
  mediaPoster = ""
} = {}) {
  const user = requireUser();

  const cleanTitleValue = cleanTitle(title);
  const cleanTextValue = cleanText(text, 2000);

  if (!cleanTitleValue && !cleanTextValue) {
    throw new Error("Write a title or review first.");
  }

  const post = {
    authorId: user.uid,
    authorName: cleanName(user.displayName || "CineJoy User"),
    authorPhoto: user.photoURL || "",
    text: cleanTextValue,
    title: cleanTitleValue,
    mediaId: mediaId == null ? "" : String(mediaId),
    mediaType: String(mediaType || "movie").toLowerCase(),
    mediaTitle: cleanText(mediaTitle, 200),
    mediaPoster: String(mediaPoster || ""),
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(collection(firestore, POSTS), post);

  return {
    id: result.id,
    ...post
  };
}

export async function getPostsByMedia(mediaId, mediaType = "movie") {
  const id = mediaId == null ? "" : String(mediaId);
  const type = String(mediaType || "movie").toLowerCase();

  if (!id) return [];

  const values = [id];
  const numericId = Number(id);
  if (Number.isFinite(numericId) && String(numericId) === id) values.push(numericId);

  const snapshots = await Promise.all(
    values.map(value =>
      getDocs(
        query(
          collection(firestore, POSTS),
          where("mediaId", "==", value),
          where("mediaType", "==", type),
          limit(100)
        )
      )
    )
  );

  const merged = new Map();
  snapshots.forEach(snap => {
    snap.docs.forEach(item => {
      merged.set(item.id, { id: item.id, ...item.data() });
    });
  });

  return oldest([...merged.values()]).reverse();
}

export async function likePost(postId) {
  const user = requireUser();
  const id = requireId(postId, "Post ID");

  const postRef = doc(firestore, POSTS, id);
  const likeRef = doc(firestore, POSTS, id, "likes", user.uid);

  const postSnap = await getDoc(postRef);

  if (!postSnap.exists()) {
    throw new Error("Post not found.");
  }

  const existing = await getDoc(likeRef);

  if (existing.exists()) {
    await deleteDoc(likeRef);

    await updateDoc(postRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp()
    });

    return false;
  }

  await setDoc(likeRef, {
    uid: user.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(postRef, {
    likesCount: increment(1),
    updatedAt: serverTimestamp()
  });

  return true;
}

export async function addComment(postId, text) {
  const user = requireUser();
  const id = requireId(postId, "Post ID");
  const clean = cleanText(text, 1000);

  if (!clean) throw new Error("Comment cannot be empty.");

  const postRef = doc(firestore, POSTS, id);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists()) {
    throw new Error("Post not found.");
  }

  const comment = {
    postId: id,
    parentCommentId: null,
    authorId: user.uid,
    authorName: cleanName(user.displayName || "CineJoy User"),
    authorPhoto: user.photoURL || "",
    text: clean,
    likesCount: 0,
    repliesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(collection(firestore, COMMENTS), comment);

  await updateDoc(postRef, {
    commentsCount: increment(1),
    updatedAt: serverTimestamp()
  });

  return {
    id: result.id,
    ...comment
  };
}

export async function getComments(postId) {
  const id = requireId(postId, "Post ID");

  const snap = await getDocs(
    query(
      collection(firestore, COMMENTS),
      where("postId", "==", id),
      limit(200)
    )
  );

  return oldest(
    snap.docs
      .map(item => ({
        id: item.id,
        ...item.data()
      }))
      .filter(comment => !comment.parentCommentId)
  );
}

export async function addReply(postId, parentCommentId, text) {
  const user = requireUser();
  const postIdValue = requireId(postId, "Post ID");
  const parentId = requireId(parentCommentId, "Parent comment ID");
  const clean = cleanText(text, 1000);

  if (!clean) throw new Error("Reply cannot be empty.");

  const postRef = doc(firestore, POSTS, postIdValue);
  const parentRef = doc(firestore, COMMENTS, parentId);

  const [postSnap, parentSnap] = await Promise.all([
    getDoc(postRef),
    getDoc(parentRef)
  ]);

  if (!postSnap.exists()) throw new Error("Post not found.");
  if (!parentSnap.exists()) throw new Error("Comment not found.");

  const parent = parentSnap.data();

  if (String(parent.postId) !== postIdValue) {
    throw new Error("Comment does not belong to this post.");
  }

  const reply = {
    postId: postIdValue,
    parentCommentId: parentId,
    authorId: user.uid,
    authorName: cleanName(user.displayName || "CineJoy User"),
    authorPhoto: user.photoURL || "",
    text: clean,
    likesCount: 0,
    repliesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(collection(firestore, COMMENTS), reply);

  await updateDoc(parentRef, {
    repliesCount: increment(1),
    updatedAt: serverTimestamp()
  });

  return {
    id: result.id,
    ...reply
  };
}

export async function getReplies(parentCommentId) {
  const parentId = requireId(parentCommentId, "Parent comment ID");

  const snap = await getDocs(
    query(
      collection(firestore, COMMENTS),
      where("parentCommentId", "==", parentId),
      limit(200)
    )
  );

  return oldest(
    snap.docs.map(item => ({
      id: item.id,
      ...item.data()
    }))
  );
}

export async function likeComment(commentId) {
  const user = requireUser();
  const id = requireId(commentId, "Comment ID");

  const commentRef = doc(firestore, COMMENTS, id);
  const likeRef = doc(firestore, COMMENTS, id, "likes", user.uid);

  const commentSnap = await getDoc(commentRef);

  if (!commentSnap.exists()) {
    throw new Error("Comment not found.");
  }

  const existing = await getDoc(likeRef);

  if (existing.exists()) {
    await deleteDoc(likeRef);

    await updateDoc(commentRef, {
      likesCount: increment(-1),
      updatedAt: serverTimestamp()
    });

    return false;
  }

  await setDoc(likeRef, {
    uid: user.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(commentRef, {
    likesCount: increment(1),
    updatedAt: serverTimestamp()
  });

  return true;
}

export async function deletePost(postId) {
  const user = requireUser();
  const id = requireId(postId, "Post ID");
  const postRef = doc(firestore, POSTS, id);

  const snap = await getDoc(postRef);

  if (!snap.exists()) {
    throw new Error("Post not found.");
  }

  if (snap.data().authorId !== user.uid) {
    throw new Error("You can only delete your own review.");
  }

  await deleteDoc(postRef);
  return true;
}

export async function getUserProfile(uid) {
  const id = requireId(uid, "User ID");
  const snap = await getDoc(doc(firestore, USERS, id));

  return snap.exists()
    ? { id: snap.id, ...snap.data() }
    : null;
}
