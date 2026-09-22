// ============================================================================
// js/components/detailView.js
// Professional CineJoy Detail View
// ============================================================================

import { tmdbService } from "../api/tmdb.js";
import { APP_CONFIG } from "../config.js";
import { colorExtractor } from "../utils/colorExtractor.js";
import { storageService } from "../utils/storage.js";
import { formatDate, escapeHtml } from "../utils/dom.js";
import { TvEpisodesManager } from "./tvEpisodes.js";
import { CommunityView } from "./community/CommunityView.js";

export class DetailView {
  constructor(containerId, onPlayMedia, onOpenTrailer, onNavigateDetail, onOpenCast) {
    this.container = document.getElementById(containerId);
    this.onPlayMedia = onPlayMedia;
    this.onOpenTrailer = onOpenTrailer;
    this.onNavigateDetail = onNavigateDetail;
    this.onOpenCast = onOpenCast;
    this.currentDetail = null;
    this.communityView = null;
    this.titleLogoCache = new Map();
    this._injectTitleLogoStyles();

    this.tvManager = new TvEpisodesManager((epMedia) => {
      if (typeof this.onPlayMedia === "function") this.onPlayMedia(epMedia);
    });
  }

  _injectTitleLogoStyles() {
    if (document.getElementById("cinejoy-detail-title-logo-styles")) return;

    const style = document.createElement("style");
    style.id = "cinejoy-detail-title-logo-styles";
    style.textContent = `
      .detail-title-artwork-box {
        width: min(100%, 320px);
        height: 92px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin: 4px 0 12px;
        overflow: hidden;
      }

      .detail-title-artwork {
        display: block;
        width: auto;
        max-width: 300px;
        height: auto;
        max-height: 82px;
        object-fit: contain;
        object-position: left center;
        filter: drop-shadow(0 8px 22px rgba(0,0,0,.28));
      }

      .detail-title-artwork.artwork-failed {
        display: none;
      }

      .detail-title-artwork-fallback {
        font-size: clamp(1.8rem, 4vw, 3rem);
        line-height: 1;
        font-weight: 800;
        letter-spacing: -.035em;
        color: #fff;
      }

      @media (max-width: 700px) {
        .detail-title-artwork-box {
          width: min(100%, 220px);
          height: 72px;
        }

        .detail-title-artwork {
          max-width: 220px;
          max-height: 64px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  _normalizeTitleLogoUrl(value) {
    if (!value) return "";

    const url = String(value);

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    if (url.startsWith("/")) {
      return `https://image.tmdb.org/t/p/w500${url}`;
    }

    return url;
  }

  async _getTitleLogo(id, mediaType, data) {
    const direct =
      data?.logo_path ||
      data?.title_logo ||
      data?.title_logo_path ||
      data?.logo ||
      data?.images?.logo_path ||
      data?.images?.logos?.[0]?.file_path;

    if (direct) return this._normalizeTitleLogoUrl(direct);

    const type =
      mediaType === "tv" ||
      mediaType === "show" ||
      mediaType === "series"
        ? "tv"
        : "movie";

    const cacheKey = `${type}_${id}`;

    if (this.titleLogoCache.has(cacheKey)) {
      return this.titleLogoCache.get(cacheKey);
    }

    if (!APP_CONFIG?.tmdb?.apiKey) {
      this.titleLogoCache.set(cacheKey, "");
      return "";
    }

    try {
      const url =
        `${APP_CONFIG.tmdb.baseUrl}/${type}/${id}/images` +
        `?api_key=${APP_CONFIG.tmdb.apiKey}` +
        `&include_image_language=en,null`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`TMDB images request failed: ${response.status}`);

      const images = await response.json();
      const logos = Array.isArray(images?.logos) ? images.logos : [];

      const logo =
        logos.find((item) => item.iso_639_1 === "en") ||
        logos.find((item) => item.iso_639_1 === null) ||
        logos[0];

      const logoUrl = logo?.file_path
        ? `https://image.tmdb.org/t/p/w500${logo.file_path}`
        : "";

      this.titleLogoCache.set(cacheKey, logoUrl);
      return logoUrl;
    } catch (error) {
      console.warn("[DetailView] Could not load TMDB title logo:", error);
      this.titleLogoCache.set(cacheKey, "");
      return "";
    }
  }

  _renderTitleArtwork(title, logoUrl) {
    if (!logoUrl) {
      return `<h1 class="detail-giant-title">${escapeHtml(title)}</h1>`;
    }

    return `
      <div class="detail-title-artwork-box" aria-label="${escapeHtml(title)}">
        <img
          class="detail-title-artwork"
          src="${escapeHtml(logoUrl)}"
          alt="${escapeHtml(title)}"
          loading="eager"
          decoding="async"
          onerror="this.classList.add('artwork-failed'); this.nextElementSibling.hidden=false"
        >
        <span class="detail-title-artwork-fallback" hidden>${escapeHtml(title)}</span>
      </div>
    `;
  }

  async render(id, mediaType = "movie") {
    if (!this.container) return;

    this.communityView?.destroy?.();
    this.communityView = null;

    this.container.innerHTML = `
      <div class="detail-loading-box">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Loading title details...</span>
      </div>
    `;
    this.container.style.display = "block";

    try {
      const data = await tmdbService.getFullDetails(id, mediaType);
      if (!data) throw new Error("No title details returned.");

      this.currentDetail = data;

      const backdropUrl = data.backdrop_path || data.poster_path || "";
      const posterUrl = data.poster_path || data.backdrop_path || "";

      if (backdropUrl) {
        const ambientImg = document.getElementById("ambient-image");
        if (ambientImg) ambientImg.style.backgroundImage = `url('${backdropUrl}')`;

        try {
          const rgb = await colorExtractor.extractDominantColor(backdropUrl);
          colorExtractor.applyAmbientLighting(rgb);
        } catch {
          // Ambient color is optional.
        }
      }

      const isSaved = storageService.isInWatchlist(data.id);
      const isTv = data.media_type === "tv";
      const title = data.title || data.name || "Untitled";
      const titleLogo = await this._getTitleLogo(id, mediaType, data);
      const originalTitle = data.original_title || data.original_name || title;
      const overview = data.overview || "No synopsis available.";
      const releaseDate = data.release_date || data.first_air_date || "";
      const releaseYear = releaseDate ? formatDate(releaseDate) : "—";
      const releaseDateFormatted = this._formatFullDate(releaseDate);

      const runtimeMins = Number(data.runtime) || 0;
      const runtimeText = isTv
        ? `${data.number_of_seasons || 0} ${(data.number_of_seasons || 0) === 1 ? "Season" : "Seasons"}`
        : runtimeMins > 0
          ? `${Math.floor(runtimeMins / 60)}h ${runtimeMins % 60}m`
          : "Runtime unavailable";

      const endTime = runtimeMins > 0 ? this._calculateEndTime(runtimeMins) : "—";
      const genres = Array.isArray(data.genres) ? data.genres : [];
      const genresList = genres.length
        ? genres.slice(0, 4).map((g) => typeof g === "string" ? g : g.name).filter(Boolean).join(" • ")
        : (isTv ? "Series" : "Feature Film");

      const director = data.director || data.created_by?.[0]?.name || "Not available";
      const status = data.status || (isTv ? "Series" : "Released");
      const language = (data.original_language || "—").toUpperCase();
      const countries = this._getCountries(data);
      const productionCompanies = this._getProductionCompanies(data);
      const rating = Number(data.vote_average);
      const voteAverage = Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "—";
      const voteCount = Number(data.vote_count);
      const popularity = Number(data.popularity);
      const budget = Number(data.budget);
      const revenue = Number(data.revenue);
      const certification = data.certification || data.content_rating || "NR";

      this.container.innerHTML = `
        <main class="detail-page">

          <!-- ================================================================
               HERO
          ================================================================= -->
          <section class="detail-hero-section">
            <div class="detail-backdrop-media" aria-hidden="true">
              ${backdropUrl ? `
                <img
                  src="${escapeHtml(backdropUrl)}"
                  alt=""
                  class="detail-backdrop-img"
                  loading="eager"
                  onerror="this.style.display='none'"
                >
              ` : ""}
              <div class="detail-vignette-left"></div>
              <div class="detail-vignette-bottom"></div>
              <div class="detail-vignette-top"></div>
            </div>

            <div class="detail-main-layout container">

              <!-- Main content -->
              <div class="detail-left-content">

               

                ${this._renderTitleArtwork(title, titleLogo)}

                ${originalTitle !== title ? `
                  <div class="detail-original-title">
                    Original title: <strong>${escapeHtml(originalTitle)}</strong>
                  </div>
                ` : ""}

                <div class="detail-genres-subtitle">
                  ${escapeHtml(genresList)}
                </div>

                <!-- Actions -->
                <div class="detail-actions-row">
                  <button type="button" class="btn-detail-play" id="detail-play-btn">
                    <i class="fa-solid fa-play"></i>
                    <span>Play</span>
                  </button>

                  <button
                    type="button"
                    class="btn-detail-circle ${isSaved ? "saved" : ""}"
                    id="detail-watchlist-btn"
                    title="${isSaved ? "Remove from List" : "Add to List"}"
                    aria-label="${isSaved ? "Remove from watchlist" : "Add to watchlist"}"
                  >
                    <i class="fa-solid ${isSaved ? "fa-check" : "fa-plus"}"></i>
                  </button>

                  <button
                    type="button"
                    class="btn-detail-circle"
                    id="detail-download-btn"
                    title="Download"
                    aria-label="Download"
                  >
                    <i class="fa-solid fa-download"></i>
                  </button>

                  <button
                    type="button"
                    class="btn-detail-circle"
                    id="detail-trailer-btn"
                    title="Watch Trailer"
                    aria-label="Watch trailer"
                  >
                    <i class="fa-solid fa-film"></i>
                  </button>
                </div>

                <!-- Primary metadata -->
                <div class="detail-meta-tags-row">
                  <span class="meta-tag-txt">${escapeHtml(releaseYear)}</span>
                  <span class="meta-tag-txt">${escapeHtml(runtimeText)}</span>
                  <span class="pill-badge-cert">${escapeHtml(certification)}</span>

                  ${data.video_quality ? `
                    <span class="pill-badge-quality">${escapeHtml(data.video_quality)}</span>
                  ` : ""}

                  <span class="pill-badge-star">
                    <i class="fa-solid fa-star"></i>
                    <strong>${escapeHtml(voteAverage)}</strong>
                  </span>

                  ${voteCount > 0 ? `
                    <span class="vote-count">${voteCount.toLocaleString()} votes</span>
                  ` : ""}
                </div>

                <div class="detail-director-line">
                  <span>${isTv ? "Creator:" : "Director:"}</span>
                  <strong>${escapeHtml(director)}</strong>
                </div>

                <!-- Synopsis -->
                <div class="detail-synopsis-wrapper">
                  <p class="detail-synopsis-text" id="detail-synopsis-text">
                    ${escapeHtml(overview)}
                  </p>
                  ${overview.length > 300 ? `
                    <button type="button" class="btn-read-more" id="btn-read-more">
                      Read More
                    </button>
                  ` : ""}
                </div>

                <!-- Rating providers -->
                <div class="detail-external-ratings-row">
                  <span class="ext-rating-label">Ratings</span>

                  <span class="ext-badge-imdb">
                    <strong>TMDB</strong> ${escapeHtml(voteAverage)}
                  </span>

                  ${data.imdb_rating ? `
                    <span class="ext-badge-imdb">
                      <strong>IMDb</strong> ${escapeHtml(String(data.imdb_rating))}
                    </span>
                  ` : ""}

                  ${data.rotten_tomatoes ? `
                    <span class="ext-badge-rt">
                      RT ${escapeHtml(String(data.rotten_tomatoes))}%
                    </span>
                  ` : ""}

                  ${data.popcorn_score ? `
                    <span class="ext-badge-popcorn">
                      🍿 ${escapeHtml(String(data.popcorn_score))}%
                    </span>
                  ` : ""}
                </div>

                <!-- Streaming providers -->
                ${data.providers && data.providers.length > 0 ? `
                  <div class="detail-providers-bar">
                    <span class="provider-stream-label">Available on</span>
                    <div class="provider-stream-icons">
                      ${data.providers.map((p) => `
                        <div class="detail-stream-logo" title="${escapeHtml(p.name || "Streaming service")}">
                          ${p.logo ? `
                            <img
                              src="${escapeHtml(p.logo)}"
                              alt="${escapeHtml(p.name || "Provider")}"
                              loading="lazy"
                              onerror="this.style.display='none'"
                            >
                          ` : ""}
                        </div>
                      `).join("")}
                    </div>
                  </div>
                ` : ""}
              </div>

              <!-- ============================================================
                   INFORMATION SIDEBAR
              ============================================================= -->
              <aside class="detail-right-sidebar">
                ${posterUrl ? `
                  <div class="detail-poster-card">
                    <img
                      src="${escapeHtml(posterUrl)}"
                      alt="${escapeHtml(title)} poster"
                      loading="eager"
                      onerror="this.style.display='none'"
                    >
                  </div>
                ` : ""}

                <div class="detail-info-card">
                  ${this._infoRow("Runtime", runtimeText)}
                  ${runtimeMins > 0 ? this._infoRow("Ends", endTime) : ""}
                  ${this._infoRow("Original Language", language)}
                  ${this._infoRow("Release Date", releaseDateFormatted)}
                  ${this._infoRow("Status", status)}
                  ${this._infoRow("Country", countries)}
                  ${budget > 0 ? this._infoRow("Budget", this._formatMoney(budget)) : ""}
                  ${revenue > 0 ? this._infoRow("Revenue", this._formatMoney(revenue)) : ""}
                  ${Number.isFinite(popularity) && popularity > 0
                    ? this._infoRow("Popularity", popularity.toFixed(1))
                    : ""}
                  ${voteCount > 0 ? this._infoRow("Vote Count", voteCount.toLocaleString()) : ""}
                </div>

                ${productionCompanies ? `
                  <div class="detail-production-card">
                    <span class="detail-card-kicker">Production</span>
                    <div class="detail-production-list">
                      ${escapeHtml(productionCompanies)}
                    </div>
                  </div>
                ` : ""}
              </aside>
            </div>
          </section>

          <!-- ================================================================
               ADDITIONAL DETAILS
          ================================================================= -->
          <section class="detail-sub-section container detail-additional-section">
            <div class="section-header">
              <h2 class="detail-section-title">Details</h2>
            </div>

            <div class="detail-details-grid">
              ${this._detailGridItem("Original Title", originalTitle)}
              ${this._detailGridItem("Release Date", releaseDateFormatted)}
              ${this._detailGridItem("Original Language", language)}
              ${this._detailGridItem("Status", status)}
              ${this._detailGridItem("Genres", genresList)}
              ${this._detailGridItem("Country", countries)}
              ${this._detailGridItem("Director / Creator", director)}
              ${this._detailGridItem("Certification", certification)}
              ${budget > 0 ? this._detailGridItem("Budget", this._formatMoney(budget)) : ""}
              ${revenue > 0 ? this._detailGridItem("Revenue", this._formatMoney(revenue)) : ""}
              ${voteCount > 0 ? this._detailGridItem("Vote Count", voteCount.toLocaleString()) : ""}
              ${Number.isFinite(popularity) && popularity > 0 ? this._detailGridItem("Popularity", popularity.toFixed(1)) : ""}
            </div>
          </section>

          <!-- TV Episodes -->
          <div id="tv-seasons-slot"></div>

          <!-- ================================================================
               CAST
          ================================================================= -->
          ${data.cast && data.cast.length > 0 ? `
            <section class="detail-sub-section container">
              <div class="section-header">
                <h2 class="detail-section-title">Cast</h2>
                <span class="detail-section-meta">${data.cast.length} credited</span>
              </div>

              <div class="carousel-container-wrap">
                <div class="cast-cards-row" id="cast-cards-row">
                  ${data.cast.map((c) => `
                    <article class="cast-card" data-person-id="${escapeHtml(String(c.id || ""))}">
                      <div class="cast-avatar-frame">
                        <img
                          src="${escapeHtml(c.profile_path || "")}"
                          alt="${escapeHtml(c.name || "Cast member")}"
                          loading="lazy"
                          onerror="this.style.display='none'"
                        >
                      </div>
                      <strong class="cast-real-name">${escapeHtml(c.name || "Unknown")}</strong>
                      <span class="cast-character-name">${escapeHtml(c.character || "Unknown role")}</span>
                    </article>
                  `).join("")}
                </div>
              </div>
            </section>
          ` : ""}

          <!-- ================================================================
               TRAILERS
          ================================================================= -->
          <section class="detail-sub-section container">
            <div class="section-header">
              <h2 class="detail-section-title">Trailers & Videos</h2>
            </div>

            <div class="trailers-cards-row">
              <div class="trailer-card-item" id="trailer-item-1">
                <div class="trailer-thumb-frame">
                  <img src="${escapeHtml(backdropUrl)}" alt="Official trailer" loading="lazy">
                  <div class="trailer-play-icon">
                    <i class="fa-solid fa-play"></i>
                  </div>
                </div>
                <strong class="trailer-card-title">Official Trailer</strong>
                <span class="trailer-card-sub">Trailer</span>
              </div>

              <div class="trailer-card-item" id="trailer-item-2">
                <div class="trailer-thumb-frame">
                  <img src="${escapeHtml(backdropUrl)}" alt="More videos" loading="lazy">
                  <div class="trailer-play-icon">
                    <i class="fa-solid fa-play"></i>
                  </div>
                </div>
                <strong class="trailer-card-title">More Videos</strong>
                <span class="trailer-card-sub">Video</span>
              </div>
            </div>
          </section>

          <!-- ================================================================
               COMMENTS
          ================================================================= -->
          <section class="detail-sub-section container detail-comments-section">
            <div class="section-header">
              <h2 class="detail-section-title">Community</h2>
              <span class="detail-section-meta" id="detail-community-count">Join the discussion</span>
            </div>

            <div class="comments-mock-box">
              <div class="comment-placeholder-icon">
                <i class="fa-regular fa-message"></i>
              </div>
              <div>
                <strong>Share your thoughts</strong>
                <p>Write a review, comment, react, and reply to the community.</p>
              </div>
              <button type="button" class="comment-action-btn" id="detail-comment-btn">
                Write a Review
              </button>
            </div>

            <div id="detail-community-container"></div>
          </section>

          <!-- ================================================================
               RECOMMENDATIONS
          ================================================================= -->
          ${data.recommendations && data.recommendations.length > 0 ? `
            <section class="detail-sub-section container detail-recommendations-section">
              <div class="section-header">
                <h2 class="detail-section-title">You May Also Like</h2>
                <span class="detail-section-meta">${data.recommendations.length} titles</span>
              </div>

              <div class="detail-recommendations-grid">
                ${data.recommendations.slice(0, 12).map((item) => {
                  const itemTitle = item.title || item.name || "Untitled";
                  const itemPoster = item.poster_path || item.backdrop_path || "";
                  return `
                    <article
                      class="detail-recommendation-card"
                      data-detail-id="${escapeHtml(String(item.id || ""))}"
                      data-detail-type="${escapeHtml(item.media_type || (isTv ? "tv" : "movie"))}"
                      tabindex="0"
                    >
                      <div class="detail-recommendation-poster">
                        <img
                          src="${escapeHtml(itemPoster)}"
                          alt="${escapeHtml(itemTitle)}"
                          loading="lazy"
                          onerror="this.style.display='none'"
                        >
                        <span class="detail-recommendation-rating">
                          <i class="fa-solid fa-star"></i>
                          ${Number(item.vote_average) > 0 ? Number(item.vote_average).toFixed(1) : "—"}
                        </span>
                      </div>
                      <strong>${escapeHtml(itemTitle)}</strong>
                      <span>${escapeHtml(item.release_date || item.first_air_date || "—")}</span>
                    </article>
                  `;
                }).join("")}
              </div>
            </section>
          ` : ""}

        </main>
      `;

      if (isTv) {
        const seasonsSlot = this.container.querySelector("#tv-seasons-slot");
        if (seasonsSlot) await this.tvManager.renderSeasonsSection(seasonsSlot, data);
      }

      const communityContainer = this.container.querySelector("#detail-community-container");
      if (communityContainer) {
        this.communityView = new CommunityView(communityContainer, {
          mediaId: data.id,
          mediaType: data.media_type || mediaType,
          mediaTitle: title,
          mediaPoster: posterUrl,
          onCountChange: count => {
            const countEl = this.container.querySelector("#detail-community-count");
            if (countEl) countEl.textContent = count ? `${count} ${count === 1 ? "review" : "reviews"}` : "Join the discussion";
          }
        });
        await this.communityView.render();
      }

      this._bindEvents(data);
    } catch (error) {
      console.error("[DetailView] Failed to render details:", error);

      this.container.innerHTML = `
        <section class="detail-error-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h2>Unable to load details</h2>
          <p>We couldn't load this title right now. Please try again.</p>
          <button type="button" class="detail-retry-btn" id="detail-retry-btn">
            <i class="fa-solid fa-rotate-right"></i>
            Try Again
          </button>
        </section>
      `;

      this.container.querySelector("#detail-retry-btn")?.addEventListener("click", () => {
        this.render(id, mediaType);
      });
    }
  }

  _bindEvents(data) {
    this.container.querySelectorAll(".cast-card[data-person-id]").forEach((card) => {
      const personId = Number(card.dataset.personId);
      if (!personId) return;
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.addEventListener("click", () => {
        if (typeof this.onOpenCast === "function") this.onOpenCast(personId, {
          name: card.querySelector(".cast-real-name")?.textContent || "",
          profile_path: card.querySelector("img")?.src || "",
        });
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          card.click();
        }
      });
    });
    document.getElementById("detail-play-btn")?.addEventListener("click", () => {
      if (typeof this.onPlayMedia === "function") this.onPlayMedia(data);
    });

    document.getElementById("detail-trailer-btn")?.addEventListener("click", () => {
      if (typeof this.onOpenTrailer === "function") this.onOpenTrailer(data);
    });

    document.getElementById("trailer-item-1")?.addEventListener("click", () => {
      if (typeof this.onOpenTrailer === "function") this.onOpenTrailer(data);
    });

    document.getElementById("trailer-item-2")?.addEventListener("click", () => {
      if (typeof this.onOpenTrailer === "function") this.onOpenTrailer(data);
    });

    const watchBtn = document.getElementById("detail-watchlist-btn");

    watchBtn?.addEventListener("click", () => {
      const isSaved = storageService.toggleWatchlist(data);
      watchBtn.classList.toggle("saved", isSaved);
      watchBtn.title = isSaved ? "Remove from List" : "Add to List";
      watchBtn.setAttribute(
        "aria-label",
        isSaved ? "Remove from watchlist" : "Add to watchlist"
      );
      watchBtn.innerHTML = `
        <i class="fa-solid ${isSaved ? "fa-check" : "fa-plus"}"></i>
      `;
    });

    const downloadBtn = document.getElementById("detail-download-btn");

    downloadBtn?.addEventListener("click", () => {
      // The existing application does not expose a download service.
      // Keep this action non-destructive instead of inventing a download URL.
      downloadBtn.classList.add("is-active");
      window.setTimeout(() => downloadBtn.classList.remove("is-active"), 450);
    });

    const synopsisEl = document.getElementById("detail-synopsis-text");
    const readMoreBtn = document.getElementById("btn-read-more");

    readMoreBtn?.addEventListener("click", () => {
      const expanded = synopsisEl?.classList.toggle("expanded");
      readMoreBtn.textContent = expanded ? "Read Less" : "Read More";
    });

    document.querySelectorAll(".detail-recommendation-card").forEach((card) => {
      const open = () => {
        const nextId = card.dataset.detailId;
        const nextType = card.dataset.detailType || "movie";

        if (!nextId) return;

        if (typeof this.onNavigateDetail === "function") {
          this.onNavigateDetail(nextId, nextType);
        }
      };

      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    document.getElementById("detail-comment-btn")?.addEventListener("click", () => {
      if (!this.communityView) return;
      this.communityView.openComposer();
    });
  }

  _infoRow(label, value) {
    if (!value || value === "—") return "";

    return `
      <div class="info-card-row">
        <span class="info-card-label">${escapeHtml(label)}</span>
        <span class="info-card-value">${escapeHtml(String(value))}</span>
      </div>
    `;
  }

  _detailGridItem(label, value) {
    if (!value || value === "—") return "";

    return `
      <div class="detail-grid-item">
        <span class="detail-grid-label">${escapeHtml(label)}</span>
        <strong class="detail-grid-value">${escapeHtml(String(value))}</strong>
      </div>
    `;
  }

  _getCountries(data) {
    const countries = data.production_countries || data.origin_country || [];

    if (!Array.isArray(countries) || countries.length === 0) return "—";

    return countries
      .map((country) => {
        if (typeof country === "string") return country;
        return country.name || country.iso_3166_1 || "";
      })
      .filter(Boolean)
      .slice(0, 4)
      .join(", ") || "—";
  }

  _getProductionCompanies(data) {
    if (!Array.isArray(data.production_companies)) return "";

    return data.production_companies
      .map((company) => typeof company === "string" ? company : company.name)
      .filter(Boolean)
      .slice(0, 5)
      .join(" • ");
  }

  _formatMoney(value) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "—";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  _calculateEndTime(runtimeMinutes) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + runtimeMinutes);

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${ampm}`;
  }

  _formatFullDate(dateStr) {
    if (!dateStr) return "—";

    const date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  hide() {
    if (this.container) {
      this.container.style.display = "none";
      this.container.innerHTML = "";
    }
  }
}
