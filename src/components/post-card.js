// post-card — full-fidelity LinkedIn-style draft preview card.
//
// Originally rendered inside the session screen's Posts tab (dropped at
// Lot 4.4). Lot 21 lifts the renderer out so the right-panel Drafts
// surface can use the rich format the user wanted instead of the
// compact BatchCard.
//
// Each card shows: author block (avatar + name + title + visibility),
// status pill or scheduled/error notice above the card, full body text
// + hashtags + CTA, image (or "Generate an image" placeholder),
// engagement stats, and a decorative LinkedIn-style action footer
// (Like / Comment / Repost / Send). To the right of the card sits an
// action stack — sparkles (rewrite) / bookmark (save as draft) /
// calendar (schedule) / trash (delete). Each carries a `data-post-*`
// attribute ; the consumer wires the actions via event delegation.
//
// Render is pure ; no module-local state. Caller passes the post
// object (cf. posts-store.js / mocks.js) and an optional `opts.focusPost`
// id used to apply the focus pulse animation when navigating in via
// `?focusPost=<id>`.

import { html, raw } from "../utils.js?v=21";
import { isPortraitFormat } from "../clip-formats.js?v=49";
import { presetById } from "../clip-captions.js?v=5";
import { renderFeedbackControl } from "./feedback-control.js?v=4";

export function renderPostCard(post, opts = {}) {
  const inlineEdit = opts.inlineEdit === true;
  const editing = inlineEdit && opts.editing === true;
  const selectable = opts.selectable === true;
  const selected = selectable && opts.selected === true;

  // Multi-select affordance — a checkbox sits in the .posts__row-check
  // gutter, which CSS reserves at a fixed width on every row so a
  // non-selectable card (e.g. a scheduled post) stays left-aligned with
  // its selectable siblings instead of sliding into the gutter. Only
  // selectable rows fill the gutter with an actual checkbox.
  const checkbox = `<div class="posts__row-check"${selectable ? "" : ' aria-hidden="true"'}>${
    selectable
      ? `<label class="ap-checkbox-container" aria-label="Select draft">
          <input type="checkbox" data-post-select="${post.id}" ${selected ? "checked" : ""} />
          <i></i>
        </label>`
      : ""
  }</div>`;

  const bodyParagraphs = post.text.map((p) => `<p class="posts__card-paragraph">${p}</p>`).join("");

  const hashtags = post.hashtags.length
    ? `<p class="posts__card-hashtags">${post.hashtags.map((h) => `<a>#${h}</a>`).join(" ")}</p>`
    : "";

  const cta = post.cta ? `<p class="posts__card-cta">${post.cta}</p>` : "";

  // Regenerate state (sparkles click → draft-rewrite.js). Two stages :
  //   - thinking  : show a 3-bar shimmer skeleton, hashtags + CTA hidden.
  //   - streaming : empty body container that the streamer fills directly
  //                 with paragraph tokens + a blinking caret.
  // In both stages the inline-edit affordance is suppressed and the
  // .posts__row-actions buttons render with `disabled` so the user
  // can't fire conflicting actions mid-stream.
  const regenerating = post.isRegenerating === true;
  const regenerateStage = regenerating ? post.regenerateStage || "thinking" : null;

  // In edit mode the entire body (paragraphs + hashtags + CTA) collapses
  // into one contenteditable region. Hashtags lose their styling during
  // edit and re-style on save (per spec).
  let editorBody;
  if (regenerating && regenerateStage === "thinking") {
    editorBody = `<div class="posts__card-body posts__card-body--ghost" data-regenerating-body>
        <span class="posts__card-ghost-bar"></span>
        <span class="posts__card-ghost-bar"></span>
        <span class="posts__card-ghost-bar"></span>
      </div>`;
  } else if (regenerating && regenerateStage === "streaming") {
    // Empty container — draft-rewrite.js streams paragraphs into it.
    editorBody = `<div class="posts__card-body" data-regenerating-body></div>`;
  } else if (editing) {
    editorBody = `<div
        class="posts__card-body posts__card-editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Edit post body"
        data-post-editor="${post.id}"
        spellcheck="true"
      >${escapeForEditor(serializeBody(post))}</div>`;
  } else {
    editorBody = `<div class="posts__card-body">${bodyParagraphs} ${hashtags} ${cta}</div>`;
  }

  // Per-network character count (alpha feedback #3 — Mari wanted an
  // at-a-glance count). Mirrors the DS "CharacterCounts" component: a
  // small chip with the network's full-colour logo + the remaining
  // characters, turning red when the draft runs over the network limit.
  // Hidden while editing / regenerating since the count is mid-flux.
  const charCount = !editing && !regenerating ? renderCharCount(post) : "";

  const editActions = editing
    ? `<div class="posts__card-edit-actions">
        <button type="button" class="ap-button ghost grey" data-post-edit-cancel="${post.id}">Cancel</button>
        <button type="button" class="ap-button primary orange" data-post-edit-save="${post.id}">Save changes</button>
      </div>`
    : "";

  // "How's this draft?" feedback strip — sits below the LinkedIn-preview
  // card (not inside it, so it reads as product feedback rather than a faux
  // LinkedIn reaction). Suppressed while the body is mid-flux.
  const feedbackStrip =
    !editing && !regenerating
      ? renderFeedbackControl(`draft:${post.id}`, { kind: "draft", label: "How's this draft?" })
      : "";

  // Below-card foot row: the feedback strip on the left, the "Generation
  // context" disclosure toggle on the right (same line). A hidden checkbox +
  // label drives a CSS-only collapse so the panel can drop full-width beneath
  // the row without any JS wiring. When the draft has no provenance, the
  // feedback strip renders on its own.
  const gcBody = !editing && !regenerating ? renderGenerationContextBody(post) : "";
  const belowCard = gcBody
    ? `<input type="checkbox" id="gc-${post.id}" class="posts__gencontext-check" hidden />
       <div class="posts__card-footrow">
         ${feedbackStrip}
         <label class="posts__gencontext-toggle" for="gc-${post.id}">
           <i class="ap-icon-information-circle posts__gencontext-info" aria-hidden="true"></i>
           <span class="posts__gencontext-toggle-label">Generation context</span>
           <i class="ap-icon-chevron-down posts__gencontext-chevron" aria-hidden="true"></i>
         </label>
       </div>
       <div class="posts__gencontext-panel">${gcBody}</div>`
    : feedbackStrip;

  const stats = post.stats || {};
  const engagement =
    stats.likes || stats.comments || stats.reposts
      ? `
        <div class="posts__card-engagement">
          <span
            class="posts__card-reactions"
            aria-label="${stats.likes || 0} reactions"
          >
            <span class="posts__card-reaction posts__card-reaction--thumb">
              <i class="ap-icon-thumb-up_fill" aria-hidden="true"></i>
            </span>
            <span class="posts__card-reaction posts__card-reaction--heart">
              <i class="ap-icon-heart_fill" aria-hidden="true"></i>
            </span>
            <span class="posts__card-reaction-count">${stats.likes || 0}</span>
          </span>
          <span class="posts__card-meta muted">${stats.comments || 0} comments · ${stats.reposts || 0} reposts</span>
        </div>
      `
      : "";

  // Media block — when the draft was generated from a video clip the card
  // surfaces a native-feeling video player (faux frame + play overlay +
  // duration chip + scrubber). Vertical networks (TikTok, Instagram) use
  // a portrait aspect ratio so the preview matches what the post would
  // actually look like in feed. Otherwise the existing image / generate
  // placeholder path is preserved.
  const subtitleLabel = post.clipRef ? subtitleLabelFor(post.subtitleStyle) : null;
  const subtitleBadge = subtitleLabel
    ? `<span class="ap-status grey no-dot posts__card-subtitle-pill">Subtitles · ${subtitleLabel}</span>`
    : "";

  const isCarousel = Array.isArray(post.carousel) && post.carousel.length > 1;
  const mediaBlock = post.clipRef
    ? `${renderClipPlayer(post)}${subtitleBadge}`
    : isCarousel
      ? `<div class="posts__card-image-wrap posts__card-image-wrap--carousel">
          <img class="posts__card-image" src="${post.carousel[0]}" alt="Carousel slide 1 for this post" loading="lazy" />
          <span class="posts__card-carousel-badge"><i class="ap-icon-multiple-images" aria-hidden="true"></i>${post.carousel.length}</span>
          <div class="posts__card-carousel-dots" aria-hidden="true">${post.carousel
            .map((_, i) => `<span class="posts__card-carousel-dot${i === 0 ? " is-active" : ""}"></span>`)
            .join("")}</div>
          <div class="posts__card-image-controls">
            <button type="button" class="ap-button ghost grey" data-post-image-edit="${post.id}">
              <i class="ap-icon-archie-official"></i>
              <span>Edit slides</span>
            </button>
            <button type="button" class="ap-button ghost red" data-post-image-remove="${post.id}">
              <i class="ap-icon-trash"></i>
              <span>Remove</span>
            </button>
          </div>
        </div>`
      : post.imageUrl
        ? `<div class="posts__card-image-wrap">
          <img class="posts__card-image" src="${post.imageUrl}" alt="Image for this post" loading="lazy" />
          <!-- Change / Remove only. The carousel keeps its "Edit slides" — it is the
               only way into the studio for a multi-slide draft — but on a single
               image the row read as three near-equal greys for two different jobs
               (open a studio vs swap the file). -->
          <div class="posts__card-image-controls">
            <button type="button" class="ap-button ghost grey" data-post-image-upload="${post.id}">
              <i class="ap-icon-upload"></i>
              <span>Change</span>
            </button>
            <button type="button" class="ap-button ghost red" data-post-image-remove="${post.id}">
              <i class="ap-icon-trash"></i>
              <span>Remove</span>
            </button>
          </div>
        </div>`
        : `<div class="posts__card-image-actions">
          <button type="button" class="ap-button mermaid" data-post-image="${post.id}">
            <i class="ap-icon-archie-official"></i>
            <span>Generate an image</span>
          </button>
          <button type="button" class="ap-button stroked grey" data-post-image-upload="${post.id}">
            <i class="ap-icon-upload"></i>
            <span>Upload an image</span>
          </button>
        </div>`;

  return html`
    <article
      class="posts__row ${opts.focusPost === post.id ? "is-focused" : ""} ${selected ? "is-selected" : ""}"
      data-post-id="${post.id}"
      ${regenerating ? `data-regenerating="true" data-stage="${regenerateStage}"` : ""}
    >
      ${raw(checkbox)}
      <div class="posts__card-wrap">
        ${raw(renderPostErrors(post))}
        <article class="ap-card posts__card ${editing ? "is-editing" : ""}">
          <header class="posts__card-header">
            <div class="posts__card-avatar" aria-hidden="true">${post.author.initials}</div>
            <div class="posts__card-author">
              <div class="row posts__card-author-row">
                <span class="posts__card-name">${post.author.name}</span>
                <span class="muted">· ${post.author.connection}</span>
              </div>
              <div class="muted posts__card-title">${post.author.title}</div>
              <div class="muted posts__card-meta">${post.timeLabel} · ${post.author.visibility}</div>
            </div>
          </header>

          ${raw(editorBody)} ${raw(charCount)} ${raw(editActions)} ${raw(mediaBlock)} ${raw(engagement)}

          <!-- Footer is a non-interactive LinkedIn-style preview of the
               engagement bar — decoration only, not real actions (see
               aria-hidden). The actionable controls live in the
               .posts__row-actions stack to the right of the card. -->
          <footer class="posts__card-footer" aria-hidden="true">
            <span class="posts__card-action">
              <i class="ap-icon-thumb-up"></i>
              <span>Like</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-single-chat-bubble"></i>
              <span>Comment</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-repost"></i>
              <span>Repost</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-paper-plane"></i>
              <span>Send</span>
            </span>
          </footer>
        </article>
        ${raw(belowCard)}
      </div>

      <div class="posts__row-actions" aria-label="Post actions">
        <button
          type="button"
          class="ap-icon-button stroked blue"
          aria-label="Reference in chat"
          title="Reference"
          data-post-mention="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-at"></i>
        </button>
        ${raw(
          inlineEdit
            ? `<button
                type="button"
                class="ap-icon-button stroked"
                aria-label="Edit post"
                title="Edit"
                data-post-edit="${post.id}"
                ${regenerating ? "disabled" : ""}
              >
                <i class="ap-icon-pen"></i>
              </button>`
            : "",
        )}
        <div class="posts__rewrite">
          <button
            type="button"
            class="ap-icon-button stroked ${regenerating ? "loading" : ""}"
            aria-label="Regenerate draft"
            aria-haspopup="true"
            aria-expanded="false"
            data-post-rewrite-menu="${post.id}"
            ${regenerating ? "disabled" : ""}
          >
            <i class="ap-icon-sparkles"></i>
          </button>
          <div
            class="ap-action-dropdown posts__rewrite-menu"
            data-post-rewrite-menu-for="${post.id}"
            role="menu"
            hidden
          >
            ${raw(
              [
                { intent: "shorter", label: "Shorter", icon: "ap-icon-shorten" },
                { intent: "longer", label: "Longer", icon: "ap-icon-lenghten" },
                { intent: "warmer", label: "Warmer", icon: "ap-icon-heart" },
                { intent: "formal", label: "More formal", icon: "ap-icon-user-graduate" },
              ]
                .map(
                  ({ intent, label, icon }) => html`
                    <button
                      type="button"
                      class="ap-action-dropdown-item"
                      role="menuitem"
                      data-post-rewrite-intent="${intent}"
                      data-post-id="${post.id}"
                    >
                      <i class="${icon}" aria-hidden="true"></i>
                      <div class="ap-action-dropdown-item-text">
                        <div class="ap-action-dropdown-item-label-container">
                          <span class="ap-action-dropdown-item-label">${label}</span>
                        </div>
                      </div>
                    </button>
                  `,
                )
                .join(""),
            )}
            <div class="ap-action-dropdown-divider" role="separator"></div>
            <button
              type="button"
              class="ap-action-dropdown-item"
              role="menuitem"
              data-post-rewrite-intent="fresh"
              data-post-id="${post.id}"
            >
              <i class="ap-icon-sparkles" aria-hidden="true"></i>
              <div class="ap-action-dropdown-item-text">
                <div class="ap-action-dropdown-item-label-container">
                  <span class="ap-action-dropdown-item-label">Regenerate</span>
                </div>
              </div>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Save as draft"
          data-post-save-draft="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-bookmark"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Schedule post"
          data-post-schedule="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-calendar"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked posts__row-action--danger"
          aria-label="Delete post"
          data-post-delete="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-trash"></i>
        </button>
      </div>
    </article>
  `;
}

// Generation context panel body — the provenance a generated draft drew on:
// a tinted headline (the angle picked, or the winner it was repurposed from) +
// the source. Returns "" when the draft has no provenance. The toggle + the
// collapse mechanism live in renderPostCard's foot row (a CSS checkbox toggle),
// so the panel can expand full-width while the toggle stays inline on the right.
export function renderGenerationContextBody(post) {
  const gc = post.generationContext;
  if (!gc) return "";
  const tone = gc.kind === "repurpose" ? "repurpose" : gc.kind === "clip" ? "clip" : "angle";
  const headline = gc.headline
    ? `<div class="posts__gencontext-headline posts__gencontext-headline--${tone}">
        <i class="${gc.headline.icon}" aria-hidden="true"></i>
        <span>${gc.headline.text}</span>
      </div>`
    : "";
  const source = gc.source
    ? `<div class="posts__gencontext-source">
        <span class="posts__gencontext-source-head">
          <i class="${gc.source.icon}" aria-hidden="true"></i>
          <span>${gc.source.label}</span>
        </span>
        ${gc.source.detail ? `<p class="posts__gencontext-source-detail">${gc.source.detail}</p>` : ""}
      </div>`
    : "";
  return `${headline}${source}`;
}

// Per-network character budgets + the full-colour DS logo used by the
// count chip. `twitter` is the posts-store alias for `x`. Networks not
// listed here render no chip (we don't know their limit).
const NETWORK_CHAR_META = {
  linkedin: { icon: "ap-icon-linkedin-official", limit: 3000, label: "LinkedIn" },
  x: { icon: "ap-icon-x-official", limit: 280, label: "X" },
  twitter: { icon: "ap-icon-x-official", limit: 280, label: "X" },
  instagram: { icon: "ap-icon-instagram-official", limit: 2200, label: "Instagram" },
  facebook: { icon: "ap-icon-facebook-official", limit: 63206, label: "Facebook" },
  tiktok: { icon: "ap-icon-tiktok-official", limit: 2200, label: "TikTok" },
  youtube: { icon: "ap-icon-youtube-official", limit: 5000, label: "YouTube" },
};

// Characters a post consumes against its network limit — body paragraphs,
// hashtags, and the CTA, joined the way they'd publish (blank line between
// blocks). Matches what the user sees in the rendered card.
function usedCharacters(post) {
  const blocks = [];
  if (post.text?.length) blocks.push(post.text.join("\n\n"));
  if (post.hashtags?.length) blocks.push(post.hashtags.map((h) => `#${h}`).join(" "));
  if (post.cta) blocks.push(post.cta);
  return blocks.join("\n\n").length;
}

// CharacterCounts chip (DS component 3185:48434). Shows the remaining
// characters for the draft's network; goes red + negative when over.
function renderCharCount(post) {
  const meta = NETWORK_CHAR_META[(post.network || "").toLowerCase()];
  if (!meta) return "";
  const remaining = meta.limit - usedCharacters(post);
  const over = remaining < 0;
  const title = over
    ? `${Math.abs(remaining)} characters over the ${meta.label} limit`
    : `${remaining} characters left for ${meta.label}`;
  return `
    <div class="posts__card-count-row">
      <span class="posts__charcount ${over ? "is-over" : ""}" title="${title}">
        <i class="${meta.icon}" aria-hidden="true"></i>
        <span class="posts__charcount-num">${remaining}</span>
      </span>
    </div>
  `;
}

// "needs_fixes" notice — sits above the card. Surfaces every error from
// post.errors[], single-line for one error, bulleted list for multiple.
function renderPostErrors(post) {
  if (!post.errors?.length) return "";
  const body =
    post.errors.length === 1
      ? post.errors[0].message
      : `<ul class="posts__card-errors-list">${post.errors.map((e) => `<li>${e.message}</li>`).join("")}</ul>`;
  return `
    <div class="ap-infobox error" role="alert">
      <i class="ap-icon-error_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">${body}</span>
        </div>
      </div>
    </div>
  `;
}

// Build the editable plain-text body shown inside the contenteditable
// region. Paragraphs separated by blank lines ; hashtags rendered as
// "#tag #tag2" on their own line ; CTA on its own line.
// The reverse parse lives in right-panel.js (parseEditorBody).
function serializeBody(post) {
  const parts = [];
  if (post.text?.length) parts.push(post.text.join("\n\n"));
  if (post.hashtags?.length) parts.push(post.hashtags.map((h) => `#${h}`).join(" "));
  if (post.cta) parts.push(post.cta);
  return parts.join("\n\n");
}

// HTML-escape user content before injecting into the contenteditable.
// innerText reads back the literal characters, so escaping here avoids
// the editor rendering injected markup on first paint.
function escapeForEditor(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Video clip player (faux) ────────────────────────────────────────
//
// Mimics what a native video post looks like on the destination network:
// 9:16 frame for TikTok / Instagram (Reels-style), 16:9 for everything
// else. The frame itself is a hue-driven gradient so each draft feels
// like a real extracted thumbnail; play overlay + duration chip + a
// 1-px scrubber bar at the bottom (paused mid-clip) round out the
// "this is a player" affordance. Filename surfaces in a top-left bezel
// so the user still sees where the clip came from.

const PORTRAIT_NETWORKS = new Set(["tiktok", "instagram"]);

const SUBTITLE_LABEL = {
  // Legacy light styles (Video Clips modal caption tab).
  bold: "Bold",
  clean: "Clean",
  caption: "Caption",
  // Clip-draft flow styles (align with the subtitle-style card grid).
  karaoke: "Karaoké",
  "deep-diver": "Deep Diver",
  youshaei: "Youshaei",
  popline: "PopLine",
  mozi: "Mozi",
  thinkmedia: "ThinkMedia",
  beasty: "Beasty",
  simple: "Simple",
};

// Resolve a subtitle style id to a human label. The conversational draft flow
// uses the light bold/clean/caption set; editing a clip in the Video Clips
// modal can set any caption preset id (karaoke, …) — fall back to the preset
// catalog's label so the badge stays accurate after an edit.
function subtitleLabelFor(style) {
  if (!style || style === "none") return null;
  if (SUBTITLE_LABEL[style]) return SUBTITLE_LABEL[style];
  const preset = presetById(style);
  return preset ? preset.label : style;
}

function renderClipPlayer(post) {
  const clip = post.clipRef;
  const duration = Math.max(1, Math.round(clip.end - clip.start));
  // Prefer the explicit export format chosen in the clip-draft flow; fall
  // back to the network's default orientation when no format was set.
  const portrait = post.format ? isPortraitFormat(post.format) : PORTRAIT_NETWORKS.has(post.network);
  const h = typeof clip.hue === "number" ? clip.hue : 24;
  const bg = `linear-gradient(135deg, oklch(0.28 0.08 ${h}) 0%, oklch(0.14 0.05 ${h}) 100%)`;
  const blob1 = `radial-gradient(circle at 30% 35%, oklch(0.74 0.20 ${h}) 0%, transparent 48%)`;
  const blob2 = `radial-gradient(circle at 75% 70%, oklch(0.55 0.16 ${(h + 50) % 360}) 0%, transparent 44%)`;
  const blob3 = `radial-gradient(circle at 50% 88%, oklch(0.42 0.12 ${(h + 25) % 360}) 0%, transparent 36%)`;
  const aspectClass = portrait ? "posts__card-clip-player--portrait" : "posts__card-clip-player--landscape";
  const source = clip.sourceName || "";
  // The "Edit clip" affordance only works when the draft carries a back-ref to
  // its source clip (sourceId + clipId). Legacy / manual clipRefs omit them.
  const editBtn =
    clip.sourceId && clip.clipId
      ? `<button type="button" class="posts__card-clip-edit" data-post-clip-edit="${post.id}" aria-label="Edit clip" title="Edit clip">
        <i class="ap-icon-pen" aria-hidden="true"></i>
        <span>Edit clip</span>
      </button>`
      : "";
  return `
    <div
      class="posts__card-clip-player ${aspectClass}"
      style="background-image: ${blob1}, ${blob2}, ${blob3}, ${bg}"
      role="img"
      aria-label="Video preview from ${escapePlayerAttr(source)} (${formatPlayerTime(duration)})"
    >
      <span class="posts__card-clip-player-source" title="${escapePlayerAttr(source)}">
        <i class="ap-icon-file--video" aria-hidden="true"></i>
        <span>${escapePlayerText(source)}</span>
      </span>
      <span class="posts__card-clip-player-dur">${formatPlayerTime(duration)}</span>
      ${editBtn}
      <button type="button" class="posts__card-clip-player-play" aria-label="Play preview" tabindex="-1">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </button>
      <span class="posts__card-clip-player-scrubber" aria-hidden="true">
        <span class="posts__card-clip-player-progress" style="width: 24%"></span>
      </span>
    </div>
  `;
}

function formatPlayerTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const rest = (s % 60).toString().padStart(2, "0");
  return `${m}:${rest}`;
}

function escapePlayerText(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapePlayerAttr(s) {
  return escapePlayerText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
