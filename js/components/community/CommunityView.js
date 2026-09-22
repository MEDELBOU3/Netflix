// js/components/community/CommunityView.js
import {
  createPost,
  getPostsByMedia,
  likePost,
  addComment,
  getComments,
  addReply,
  getReplies,
  likeComment,
  deletePost
} from "../../firebase/firebase-community.js";
import { getCurrentUser, observeAuth } from "../../firebase/firebase-auth.js";
import { AuthView } from "../auth/AuthView.js";

export class CommunityView {
  constructor(container, options = {}) {
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    this.mediaId = options.mediaId ?? null;
    this.mediaType = String(options.mediaType || "movie").toLowerCase();
    this.mediaTitle = options.mediaTitle || "";
    this.mediaPoster = options.mediaPoster || "";
    this.onCountChange = typeof options.onCountChange === "function" ? options.onCountChange : () => {};
    this.posts = [];
    this.openPostId = null;
    this.composerOpen = false;
    this._authUnsubscribe = null;
    this._replyOpen = new Set();
    this.authView = null;
  }

  async render() {
    if (!this.container) return;
    this._ensureStyles();
    this.container.innerHTML = "";
    this.container.classList.add("detail-community-root");
    this._renderComposer();
    this._renderFeedState("Loading discussion...");
    this._authUnsubscribe?.();
    this._authUnsubscribe = observeAuth(() => this._updateAuthState());
    await this.refresh();
  }

  async refresh() {
    if (this.mediaId == null) {
      this.posts = [];
      this.renderPosts();
      this.onCountChange(0);
      return;
    }

    try {
      this.posts = await getPostsByMedia(this.mediaId, this.mediaType);
      this.renderPosts();
      this.onCountChange(this.posts.length);
    } catch (error) {
      console.error("[CommunityView] Failed to load posts:", error);
      this.posts = [];
      this._renderFeedState("Unable to load the discussion right now.");
      this.onCountChange(0);
    }
  }

  _renderComposer() {
    const wrapper = document.createElement("div");
    wrapper.className = "detail-community-composer";
    wrapper.hidden = true;

    wrapper.innerHTML = `
      <form class="detail-community-form" data-community-form>
        <div class="detail-community-form-head">
          <div>
            <strong>Write a review</strong>
            <span>Share your opinion with the community.</span>
          </div>
          <button type="button" class="detail-community-close" data-community-action="close-composer" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <input type="text" maxlength="120" placeholder="Review title" data-community-title>
        <textarea maxlength="2000" rows="5" placeholder="What did you think about this title?" data-community-text></textarea>
        <div class="detail-community-form-foot">
          <span data-community-auth-state></span>
          <button type="submit" class="comment-action-btn">Publish review</button>
        </div>
      </form>
    `;

    this.container.appendChild(wrapper);
    this.composer = wrapper;

    wrapper.querySelector("[data-community-form]")?.addEventListener("submit", e => {
      e.preventDefault();
      this._createPost(e.currentTarget);
    });

    wrapper.addEventListener("click", e => {
      if (e.target.closest('[data-community-action="close-composer"]')) this.closeComposer();
    });

    this._updateAuthState();
  }

  openComposer() {
    if (!this.composer) return false;

    this.composer.hidden = false;
    this.composerOpen = true;
    this._updateAuthState();

    if (!getCurrentUser()) {
      if (!this.authView) {
        this.authView = new AuthView({
          onAuthenticated: () => {
            this._updateAuthState();
            this.openComposer();
          }
        });
      }
      this.authView.open("login");
      return true;
    }

    requestAnimationFrame(() => {
      this.composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      this.composer?.querySelector("[data-community-title]")?.focus();
    });

    return true;
  }

  closeComposer() {
    if (!this.composer) return;
    this.composer.hidden = true;
    this.composerOpen = false;
  }

  async _createPost(form) {
    if (!getCurrentUser()) {
      this._notify("Please sign in before publishing.");
      return;
    }

    const title = form.querySelector("[data-community-title]")?.value.trim() || "";
    const text = form.querySelector("[data-community-text]")?.value.trim() || "";

    if (!title && !text) {
      this._notify("Write a title or review first.");
      return;
    }

    const button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;

    try {
      await createPost({
        title,
        text,
        mediaId: this.mediaId,
        mediaType: this.mediaType,
        mediaTitle: this.mediaTitle,
        mediaPoster: this.mediaPoster
      });

      form.reset();
      this.closeComposer();
      await this.refresh();
      this._notify("Your review was published.");
    } catch (error) {
      console.error("[CommunityView] Create post failed:", error);
      this._notify(this._errorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  renderPosts() {
    if (!this.container) return;

    let feed = this.container.querySelector("[data-community-feed]");

    if (!feed) {
      feed = document.createElement("div");
      feed.className = "detail-community-feed-list";
      feed.dataset.communityFeed = "";
      this.container.appendChild(feed);
    }

    if (!this.posts.length) {
      feed.innerHTML = `
        <div class="detail-community-empty">
          <i class="fa-regular fa-comments"></i>
          <strong>No reviews yet</strong>
          <span>Be the first to share your thoughts about this title.</span>
        </div>
      `;
      return;
    }

    feed.innerHTML = this.posts.map(post => this._postMarkup(post)).join("");

    feed.querySelectorAll("[data-community-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.communityAction;
        const id = button.closest("[data-community-post]")?.dataset.communityPost;

        if (action === "like" && id) this._toggleLike(id);
        if (action === "comments" && id) this._toggleComments(id);
        if (action === "delete" && id) this._deletePost(id);
      });
    });

    feed.querySelectorAll("[data-community-comment-form]").forEach(form => {
      form.addEventListener("submit", e => {
        e.preventDefault();
        const postId = form.closest("[data-community-post]")?.dataset.communityPost;
        if (postId) this._submitComment(postId, form);
      });
    });

    feed.querySelectorAll("[data-comment-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.commentAction;
        const commentId = button.closest("[data-community-comment]")?.dataset.commentId;

        if (!commentId) return;

        if (action === "like") this._toggleCommentLike(commentId);
        if (action === "reply") this._toggleReplyForm(commentId);
      });
    });

    feed.querySelectorAll("[data-community-reply-form]").forEach(form => {
      form.addEventListener("submit", e => {
        e.preventDefault();

        const commentId = form.closest("[data-community-comment]")?.dataset.commentId;
        const postId = form.closest("[data-community-post]")?.dataset.communityPost;

        if (commentId && postId) this._submitReply(postId, commentId, form);
      });
    });

    if (this.openPostId) {
      const post = feed.querySelector(
        `[data-community-post="${CSS.escape(String(this.openPostId))}"]`
      );

      post?.querySelector("[data-community-comments]")?.removeAttribute("hidden");
      this._loadComments(this.openPostId);
    }
  }

  _postMarkup(post) {
    const user = getCurrentUser();
    const own = !!user && post.authorId === user.uid;
    const title = this._escape(post.title || "");
    const text = this._escape(post.text || "").replace(/\n/g, "<br>");
    const author = this._escape(post.authorName || "User");

    const photo = post.authorPhoto
      ? `<img src="${this._attr(post.authorPhoto)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="detail-community-avatar"><i class="fa-solid fa-user"></i></span>`;

    return `
      <article class="detail-community-post" data-community-post="${this._attr(post.id)}">
        <div class="detail-community-post-head">
          <div class="detail-community-author">
            ${photo}
            <div>
              <strong>${author}</strong>
              <span>${this._date(post.createdAt)}</span>
            </div>
          </div>
          ${
            own
              ? `<button type="button" class="detail-community-icon-btn" data-community-action="delete" title="Delete review" aria-label="Delete review">
                   <i class="fa-regular fa-trash-can"></i>
                 </button>`
              : ""
          }
        </div>

        ${title ? `<h3>${title}</h3>` : ""}
        ${text ? `<div class="detail-community-post-text">${text}</div>` : ""}

        <div class="detail-community-post-actions">
          <button type="button" data-community-action="like">
            <i class="fa-regular fa-heart"></i>
            <span>${Number(post.likesCount || 0)}</span>
          </button>
          <button type="button" data-community-action="comments">
            <i class="fa-regular fa-comment"></i>
            <span>${Number(post.commentsCount || 0)}</span>
          </button>
        </div>

        <div class="detail-community-comments" data-community-comments hidden>
          <div class="detail-community-comments-list" data-community-comments-list></div>

          <form class="detail-community-comment-form" data-community-comment-form>
            <input
              type="text"
              maxlength="1000"
              placeholder="Write a comment..."
              aria-label="Write a comment"
            >
            <button type="submit" aria-label="Send comment">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      </article>
    `;
  }

  async _toggleLike(id) {
    if (!getCurrentUser()) {
      this._notify("Please sign in to like reviews.");
      return;
    }

    try {
      await likePost(id);
      await this.refresh();
    } catch (error) {
      console.error("[CommunityView] Like failed:", error);
      this._notify(this._errorMessage(error));
    }
  }

  async _toggleComments(id) {
    const post = this.container.querySelector(
      `[data-community-post="${CSS.escape(String(id))}"]`
    );
    const panel = post?.querySelector("[data-community-comments]");

    if (!panel) return;

    if (!panel.hidden) {
      panel.hidden = true;
      this.openPostId = null;
      return;
    }

    panel.hidden = false;
    this.openPostId = id;
    await this._loadComments(id);
  }

  async _loadComments(id) {
    const post = this.container.querySelector(
      `[data-community-post="${CSS.escape(String(id))}"]`
    );
    const list = post?.querySelector("[data-community-comments-list]");

    if (!list) return;

    list.innerHTML = `<span class="detail-community-comments-loading">Loading comments...</span>`;

    try {
      const comments = await getComments(id);

      if (!comments.length) {
        list.innerHTML = `<span class="detail-community-comments-empty">No comments yet.</span>`;
        return;
      }

      list.innerHTML = comments.map(comment => this._commentMarkup(comment)).join("");

      list.querySelectorAll("[data-comment-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.dataset.commentAction;
          const commentId = button.closest("[data-community-comment]")?.dataset.commentId;

          if (!commentId) return;

          if (action === "like") this._toggleCommentLike(commentId);
          if (action === "reply") this._toggleReplyForm(commentId);
        });
      });

      list.querySelectorAll("[data-community-reply-form]").forEach(form => {
        form.addEventListener("submit", e => {
          e.preventDefault();

          const commentId = form.closest("[data-community-comment]")?.dataset.commentId;
          if (commentId) this._submitReply(id, commentId, form);
        });
      });

      for (const comment of comments) {
        await this._loadReplies(id, comment.id);
      }
    } catch (error) {
      console.error("[CommunityView] Comments failed:", error);
      list.innerHTML = `<span class="detail-community-comments-empty">Unable to load comments.</span>`;
    }
  }

  _commentMarkup(comment) {
    const avatar = comment.authorPhoto
      ? `<img src="${this._attr(comment.authorPhoto)}" alt="" loading="lazy">`
      : `<span class="detail-community-mini-avatar"><i class="fa-solid fa-user"></i></span>`;

    return `
      <div class="detail-community-comment" data-community-comment="${this._attr(comment.id)}" data-comment-id="${this._attr(comment.id)}">
        ${avatar}
        <div class="detail-community-comment-content">
          <div class="detail-community-comment-meta">
            <strong>${this._escape(comment.authorName || "User")}</strong>
            <span>${this._date(comment.createdAt)}</span>
          </div>

          <p>${this._escape(comment.text || "").replace(/\n/g, "<br>")}</p>

          <div class="detail-community-comment-actions">
            <button type="button" class="detail-community-comment-action" data-comment-action="like">
              <i class="fa-regular fa-heart"></i>
              <span>${Number(comment.likesCount || 0)}</span>
            </button>
            <button type="button" class="detail-community-comment-action" data-comment-action="reply">
              <i class="fa-solid fa-reply"></i>
              <span>Reply</span>
            </button>
          </div>

          <form class="detail-community-reply-form" data-community-reply-form hidden>
            <input
              type="text"
              maxlength="1000"
              placeholder="Write a reply..."
              aria-label="Write a reply"
            >
            <button type="submit" aria-label="Send reply">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </form>

          <div class="detail-community-replies" data-community-replies></div>
        </div>
      </div>
    `;
  }

  async _loadReplies(postId, commentId) {
    const comment = this.container.querySelector(
      `[data-community-comment="${CSS.escape(String(commentId))}"]`
    );
    const repliesBox = comment?.querySelector("[data-community-replies]");

    if (!repliesBox) return;

    try {
      const replies = await getReplies(commentId);

      if (!replies.length) {
        repliesBox.innerHTML = "";
        return;
      }

      repliesBox.innerHTML = replies.map(reply => this._replyMarkup(reply)).join("");

      repliesBox.querySelectorAll("[data-comment-action]").forEach(button => {
        button.addEventListener("click", () => {
          const action = button.dataset.commentAction;
          const replyId = button.closest("[data-community-comment]")?.dataset.commentId;

          if (!replyId) return;

          if (action === "like") this._toggleCommentLike(replyId);
          if (action === "reply") this._toggleReplyForm(replyId);
        });
      });

      repliesBox.querySelectorAll("[data-community-reply-form]").forEach(form => {
        form.addEventListener("submit", e => {
          e.preventDefault();

          const parentId = form.closest("[data-community-comment]")?.dataset.commentId;
          if (parentId) this._submitReply(postId, parentId, form);
        });
      });
    } catch (error) {
      console.error("[CommunityView] Replies failed:", error);
      repliesBox.innerHTML = `<span class="detail-community-comments-empty">Unable to load replies.</span>`;
    }
  }

  _replyMarkup(reply) {
    const avatar = reply.authorPhoto
      ? `<img src="${this._attr(reply.authorPhoto)}" alt="" loading="lazy">`
      : `<span class="detail-community-mini-avatar"><i class="fa-solid fa-user"></i></span>`;

    return `
      <div class="detail-community-comment detail-community-reply" data-community-comment="${this._attr(reply.id)}" data-comment-id="${this._attr(reply.id)}">
        ${avatar}
        <div class="detail-community-comment-content">
          <div class="detail-community-comment-meta">
            <strong>${this._escape(reply.authorName || "User")}</strong>
            <span>${this._date(reply.createdAt)}</span>
          </div>

          <p>${this._escape(reply.text || "").replace(/\n/g, "<br>")}</p>

          <div class="detail-community-comment-actions">
            <button type="button" class="detail-community-comment-action" data-comment-action="like">
              <i class="fa-regular fa-heart"></i>
              <span>${Number(reply.likesCount || 0)}</span>
            </button>
            <button type="button" class="detail-community-comment-action" data-comment-action="reply">
              <i class="fa-solid fa-reply"></i>
              <span>Reply</span>
            </button>
          </div>

          <form class="detail-community-reply-form" data-community-reply-form hidden>
            <input type="text" maxlength="1000" placeholder="Write a reply..." aria-label="Write a reply">
            <button type="submit" aria-label="Send reply">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      </div>
    `;
  }

  _toggleReplyForm(commentId) {
    const comment = this.container.querySelector(
      `[data-community-comment="${CSS.escape(String(commentId))}"]`
    );
    const form = comment?.querySelector("[data-community-reply-form]");

    if (!form) return;

    form.hidden = !form.hidden;

    if (!form.hidden) {
      form.querySelector("input")?.focus();
      this._replyOpen.add(commentId);
    } else {
      this._replyOpen.delete(commentId);
    }
  }

  async _toggleCommentLike(commentId) {
    if (!getCurrentUser()) {
      this._notify("Please sign in to like comments.");
      return;
    }

    try {
      await likeComment(commentId);

      if (this.openPostId != null) {
        await this._loadComments(this.openPostId);
      }
    } catch (error) {
      console.error("[CommunityView] Comment like failed:", error);
      this._notify(this._errorMessage(error));
    }
  }

  async _submitComment(postId, form) {
    if (!getCurrentUser()) {
      this._notify("Please sign in to comment.");
      return;
    }

    const input = form.querySelector("input");
    const text = input?.value.trim() || "";

    if (!text) return;

    const button = form.querySelector("button");
    if (button) button.disabled = true;

    try {
      await addComment(postId, text);

      if (input) input.value = "";

      await this.refresh();

      this.openPostId = postId;

      const post = this.container.querySelector(
        `[data-community-post="${CSS.escape(String(postId))}"]`
      );
      const panel = post?.querySelector("[data-community-comments]");

      if (panel) panel.hidden = false;

      await this._loadComments(postId);
    } catch (error) {
      console.error("[CommunityView] Comment failed:", error);
      this._notify(this._errorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async _submitReply(postId, parentCommentId, form) {
    if (!getCurrentUser()) {
      this._notify("Please sign in to reply.");
      return;
    }

    const input = form.querySelector("input");
    const text = input?.value.trim() || "";

    if (!text) return;

    const button = form.querySelector("button");
    if (button) button.disabled = true;

    try {
      await addReply(postId, parentCommentId, text);

      if (input) input.value = "";
      form.hidden = true;

      await this._loadReplies(postId, parentCommentId);
      this._notify("Reply posted.");
    } catch (error) {
      console.error("[CommunityView] Reply failed:", error);
      this._notify(this._errorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async _deletePost(id) {
    if (!getCurrentUser() || !confirm("Delete this review?")) return;

    try {
      await deletePost(id);

      if (this.openPostId === id) this.openPostId = null;

      await this.refresh();
      this._notify("Review deleted.");
    } catch (error) {
      console.error("[CommunityView] Delete failed:", error);
      this._notify(this._errorMessage(error));
    }
  }

  _updateAuthState() {
    const state = this.composer?.querySelector("[data-community-auth-state]");
    if (!state) return;

    const user = getCurrentUser();

    state.textContent = user
      ? `Posting as ${user.displayName || user.email || "User"}`
      : "Sign in to publish";

    const button = this.composer?.querySelector("button[type=submit]");
    if (button) button.disabled = !user;
  }

  _renderFeedState(message) {
    let feed = this.container?.querySelector("[data-community-feed]");

    if (!feed) {
      feed = document.createElement("div");
      feed.className = "detail-community-feed-list";
      feed.dataset.communityFeed = "";
      this.container?.appendChild(feed);
    }

    feed.innerHTML = `
      <div class="detail-community-empty">
        <i class="fa-regular fa-comments"></i>
        <span>${this._escape(message)}</span>
      </div>
    `;
  }

  _notify(message) {
    this.container?.querySelector(".detail-community-notice")?.remove();

    if (!this.container) return;

    const notice = document.createElement("div");
    notice.className = "detail-community-notice";
    notice.textContent = message;

    this.container.appendChild(notice);
    setTimeout(() => notice.remove(), 2800);
  }

  _errorMessage(error) {
    if (
      error?.code === "permission-denied" ||
      error?.code === "firestore/permission-denied"
    ) {
      return "You do not have permission to do that.";
    }

    if (error?.code === "failed-precondition") {
      return "Firestore needs an index for this operation.";
    }

    return error?.message || "Something went wrong. Please try again.";
  }

  _date(value) {
    if (!value) return "Just now";

    const date = value?.toDate ? value.toDate() : new Date(value);

    return Number.isNaN(date.getTime())
      ? "Just now"
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(date);
  }

  _escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  _attr(value) {
    return this._escape(value);
  }

  _ensureStyles() {
    if (document.getElementById("detail-community-runtime-styles")) return;

    const style = document.createElement("style");
    style.id = "detail-community-runtime-styles";

    style.textContent = `
      .detail-community-root{
        width:100%;
        margin-top:18px;
        background:transparent;
      }

      .detail-community-feed-list{
        display:flex;
        flex-direction:column;
        gap:0;
        background:transparent;
      }

      .detail-community-composer{
        margin:0 0 8px;
        background:transparent;
      }

      .detail-community-composer[hidden],
      .detail-community-comments[hidden],
      .detail-community-reply-form[hidden]{
        display:none!important;
      }

      .detail-community-form{
        padding:20px 0 22px;
        border:none;
        border-bottom:1px solid rgba(255,255,255,.06);
        background:transparent;
        box-shadow:none;
      }

      .detail-community-form-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        margin-bottom:14px;
      }

      .detail-community-form-head strong,
      .detail-community-form-head span{
        display:block;
      }

      .detail-community-form-head strong{
        font-size:.98rem;
        color:#fff;
        font-weight:700;
      }

      .detail-community-form-head span{
        margin-top:3px;
        color:#64748b;
        font-size:.8rem;
      }

      .detail-community-close,
      .detail-community-icon-btn{
        border:0;
        background:transparent;
        color:#64748b;
        cursor:pointer;
        width:34px;
        height:34px;
        border-radius:50%;
        display:grid;
        place-items:center;
        transition:color .2s ease,background .2s ease;
      }

      .detail-community-close:hover,
      .detail-community-icon-btn:hover{
        color:#fff;
        background:rgba(255,255,255,.08);
      }

      .detail-community-form input,
      .detail-community-form textarea,
      .detail-community-comment-form input,
      .detail-community-reply-form input{
        width:100%;
        box-sizing:border-box;
        border:1px solid rgba(255,255,255,.1);
        background:rgba(255,255,255,.04);
        color:#fff;
        border-radius:12px;
        padding:12px 14px;
        font:inherit;
        font-size:.92rem;
        outline:none;
        transition:border-color .2s ease,box-shadow .2s ease;
      }

      .detail-community-form textarea{
        display:block;
        margin-top:10px;
        min-height:100px;
        resize:vertical;
        line-height:1.5;
      }

      .detail-community-form input:focus,
      .detail-community-form textarea:focus,
      .detail-community-comment-form input:focus,
      .detail-community-reply-form input:focus{
        border-color:rgba(255,255,255,.28);
        box-shadow:0 0 0 3px rgba(255,255,255,.05);
      }

      .detail-community-form input::placeholder,
      .detail-community-form textarea::placeholder,
      .detail-community-comment-form input::placeholder,
      .detail-community-reply-form input::placeholder{
        color:#64748b;
      }

      .detail-community-form-foot{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-top:14px;
        color:#64748b;
        font-size:.8rem;
      }

      .detail-community-form-foot .comment-action-btn{
        padding:10px 22px;
        border:0;
        border-radius:9999px;
        background:#fff;
        color:#0b0f15;
        font-weight:700;
        font-size:.88rem;
        cursor:pointer;
        box-shadow:0 4px 14px rgba(255,255,255,.1);
        transition:transform .2s ease,background .2s ease,opacity .2s ease;
      }

      .detail-community-form-foot .comment-action-btn:hover{
        background:#f1f5f9;
        transform:scale(1.03);
      }

      .detail-community-form-foot .comment-action-btn:disabled{
        opacity:.45;
        cursor:not-allowed;
        transform:none;
      }

      .detail-community-post{
        padding:20px 0;
        border:none;
        border-bottom:1px solid rgba(255,255,255,.05);
        border-radius:0;
        background:transparent;
      }

      .detail-community-post:last-child{
        border-bottom:none;
      }

      .detail-community-post-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      }

      .detail-community-author{
        display:flex;
        align-items:center;
        gap:10px;
        min-width:0;
      }

      .detail-community-avatar{
        width:38px;
        height:38px;
        min-width:38px;
        min-height:38px;
        display:flex!important;
        align-items:center;
        justify-content:center;
        box-sizing:border-box;
        flex:0 0 38px;
        border-radius:50%;
        background:rgba(255,255,255,.06);
        color:#8b95a5;
        line-height:1;
      }

      .detail-community-avatar i{
        display:block;
        margin:0;
        padding:0;
        line-height:1;
        font-size:16px;
      }

      .detail-community-author img{
        width:38px;
        height:38px;
        min-width:38px;
        min-height:38px;
        border-radius:50%;
        object-fit:cover;
        display:block;
        flex:none;
      }

      .detail-community-author > div > strong,
      .detail-community-author > div > span{
        display:block;
      }

      .detail-community-author strong{
        color:#fff;
        font-size:.9rem;
        font-weight:700;
      }

      .detail-community-author span{
        margin-top:2px;
        color:#64748b;
        font-size:.75rem;
      }

      .detail-community-post h3{
        margin:12px 0 6px;
        color:#fff;
        font-size:1.05rem;
        font-weight:700;
      }

      .detail-community-post-text{
        color:#cbd5e1;
        font-size:.9rem;
        line-height:1.6;
        overflow-wrap:anywhere;
      }

      .detail-community-post-actions{
        display:flex;
        gap:4px;
        margin-top:12px;
      }

      .detail-community-post-actions button,
      .detail-community-comment-action{
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:6px 10px;
        border:0;
        border-radius:8px;
        background:transparent;
        color:#64748b;
        cursor:pointer;
        font:inherit;
        font-size:.8rem;
        font-weight:600;
        transition:color .2s ease,background .2s ease;
      }

      .detail-community-post-actions button:hover,
      .detail-community-comment-action:hover{
        background:rgba(255,255,255,.06);
        color:#fff;
      }

      .detail-community-comments{
        margin-top:12px;
        padding-top:12px;
        border-top:1px solid rgba(255,255,255,.05);
        background:transparent;
      }

      .detail-community-comments-list{
        display:flex;
        flex-direction:column;
        gap:0;
      }

      .detail-community-comment{
        display:flex;
        gap:10px;
        padding:12px 0;
        background:transparent;
      }

      .detail-community-comment img,
      .detail-community-mini-avatar{
        width:28px;
        height:28px;
        min-width:28px;
        min-height:28px;
        flex:0 0 28px;
        border-radius:50%;
        object-fit:cover;
        background:rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        box-sizing:border-box;
        color:#94a3b8;
        line-height:1;
      }

      .detail-community-mini-avatar i{
        display:block;
        margin:0;
        padding:0;
        line-height:1;
        font-size:11px;
      }

      .detail-community-comment-content{
        min-width:0;
        flex:1;
      }

      .detail-community-comment-meta{
        display:flex;
        align-items:baseline;
        flex-wrap:wrap;
        gap:7px;
      }

      .detail-community-comment strong{
        color:#fff;
        font-size:.82rem;
        font-weight:700;
      }

      .detail-community-comment span{
        color:#64748b;
        font-size:.72rem;
      }

      .detail-community-comment p{
        margin:4px 0 0;
        color:#94a3b8;
        font-size:.84rem;
        line-height:1.5;
      }

      .detail-community-comment-actions{
        display:flex;
        gap:2px;
        margin-top:4px;
      }

      .detail-community-comment-action{
        padding:4px 6px;
        font-size:.72rem;
      }

      .detail-community-comment-action i{
        font-size:.72rem;
      }

      .detail-community-comment-form,
      .detail-community-reply-form{
        display:flex;
        gap:8px;
        margin-top:10px;
      }

      .detail-community-comment-form input,
      .detail-community-reply-form input{
        min-width:0;
        min-height:38px;
        padding:8px 11px;
      }

      .detail-community-comment-form button,
      .detail-community-reply-form button{
        width:40px;
        height:40px;
        flex:0 0 40px;
        border:0;
        border-radius:50%;
        background:#fff;
        color:#0b0f15;
        cursor:pointer;
        display:grid;
        place-items:center;
        transition:transform .2s ease,background .2s ease,opacity .2s ease;
      }

      .detail-community-comment-form button:hover,
      .detail-community-reply-form button:hover{
        background:#f1f5f9;
        transform:scale(1.05);
      }

      .detail-community-comment-form button:disabled,
      .detail-community-reply-form button:disabled{
        opacity:.45;
        cursor:not-allowed;
        transform:none;
      }

      .detail-community-replies{
        margin:2px 0 0 8px;
        padding-left:12px;
        border-left:1px solid rgba(255,255,255,.07);
      }

      .detail-community-reply{
        padding:9px 0;
      }

      .detail-community-empty{
        min-height:100px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:6px;
        text-align:center;
        color:#64748b;
        font-size:.84rem;
        padding:32px 0;
      }

      .detail-community-empty i{
        font-size:1.6rem;
        opacity:.5;
      }

      .detail-community-empty strong{
        color:#e2e8f0;
        font-size:.92rem;
      }

      .detail-community-comments-loading,
      .detail-community-comments-empty{
        display:block;
        padding:8px 0;
        color:#64748b;
        font-size:.78rem;
      }

      .detail-community-notice{
        position:sticky;
        bottom:14px;
        z-index:20;
        width:max-content;
        max-width:calc(100% - 24px);
        margin:10px auto 0;
        padding:10px 16px;
        border:1px solid rgba(255,255,255,.1);
        border-radius:9999px;
        background:rgba(18,22,32,.92);
        backdrop-filter:blur(16px);
        color:#fff;
        font-size:.82rem;
        box-shadow:0 12px 32px rgba(0,0,0,.4);
      }

      @media(max-width:600px){
        .detail-community-form-foot{
          align-items:stretch;
          flex-direction:column;
        }

        .detail-community-form-foot .comment-action-btn{
          width:100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  destroy() {
    this._authUnsubscribe?.();
    this._authUnsubscribe = null;
    this.authView?.close?.();
    this.authView = null;
    this.posts = [];
    this.openPostId = null;
    this.composerOpen = false;
    this._replyOpen.clear();

    if (this.container) {
      this.container.innerHTML = "";
      this.container.classList.remove("detail-community-root");
    }
  }

  hide() {
    this.destroy();
  }

  show() {
    return this.render();
  }
}

export default CommunityView;