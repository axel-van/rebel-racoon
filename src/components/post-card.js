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
// action stack — sparkles (rewrite) / calendar (schedule) / copy
// (duplicate) / trash (delete). Each carries a `data-post-*`
// attribute ; the consumer wires the actions via event delegation.
//
// Render is pure ; no module-local state. Caller passes the post
// object (cf. posts-store.js / mocks.js) and an optional `opts.focusPost`
// id used to apply the focus pulse animation when navigating in via
// `?focusPost=<id>`.

import { html, raw } from "../utils.js?v=20";
import { isPortraitFormat } from "../clip-formats.js?v=1";

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
  const subtitleBadge =
    post.clipRef && post.subtitleStyle && post.subtitleStyle !== "none"
      ? `<span class="ap-status grey no-dot posts__card-subtitle-pill">Subtitles · ${SUBTITLE_LABEL[post.subtitleStyle] || post.subtitleStyle}</span>`
      : "";

  const mediaBlock = post.clipRef
    ? `${renderClipPlayer(post)}${subtitleBadge}`
    : post.imageUrl
      ? `<img class="posts__card-image" src="${post.imageUrl}" alt="Generated image for this post" loading="lazy" />`
      : `<button type="button" class="posts__card-image-placeholder" data-post-image="${post.id}">
          <i class="ap-icon-sparkles-mermaid"></i>
          <span>Generate an image</span>
        </button>`;

  return html`
    <article
      class="posts__row ${opts.focusPost === post.id ? "is-focused" : ""} ${selected ? "is-selected" : ""}"
      data-post-id="${post.id}"
      ${regenerating ? `data-regenerating="true" data-stage="${regenerateStage}"` : ""}
    >
      ${raw(checkbox)}
      <div class="posts__card-wrap">
        ${raw(renderPostErrors(post))} ${raw(renderPostScheduled(post))}
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
      </div>

      <div class="posts__row-actions" aria-label="Post actions">
        <button
          type="button"
          class="ap-icon-button stroked blue"
          aria-label="Mention in chat"
          title="Mention"
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
          <div class="posts__rewrite-menu" data-post-rewrite-menu-for="${post.id}" role="menu" hidden>
            <button
              type="button"
              class="posts__rewrite-item"
              role="menuitem"
              data-post-rewrite-intent="shorter"
              data-post-id="${post.id}"
            >
              Shorter
            </button>
            <button
              type="button"
              class="posts__rewrite-item"
              role="menuitem"
              data-post-rewrite-intent="longer"
              data-post-id="${post.id}"
            >
              Longer
            </button>
            <button
              type="button"
              class="posts__rewrite-item"
              role="menuitem"
              data-post-rewrite-intent="warmer"
              data-post-id="${post.id}"
            >
              Warmer
            </button>
            <button
              type="button"
              class="posts__rewrite-item"
              role="menuitem"
              data-post-rewrite-intent="formal"
              data-post-id="${post.id}"
            >
              More formal
            </button>
            <div class="posts__rewrite-sep" role="separator"></div>
            <button
              type="button"
              class="posts__rewrite-item"
              role="menuitem"
              data-post-rewrite-intent="fresh"
              data-post-id="${post.id}"
            >
              <i class="ap-icon-sparkles" aria-hidden="true"></i><span>Regenerate</span>
            </button>
          </div>
        </div>
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
          class="ap-icon-button stroked"
          aria-label="Duplicate post"
          data-post-duplicate="${post.id}"
          ${regenerating ? "disabled" : ""}
        >
          <i class="ap-icon-copy"></i>
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
  bold: "Bold",
  clean: "Clean",
  caption: "Caption",
};

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

// "scheduled" notice — sits flush above the card (visually glued via
// posts.css). The DS `.ap-status-card .upper` is flex with
// space-between, so a trailing .ap-link drops into the right edge
// naturally. Clicking it re-opens the schedule modal for this post
// via the same data-post-schedule hook the per-card calendar button
// uses, so the wiring is reused 1:1.
function renderPostScheduled(post) {
  if (post.status !== "scheduled") return "";
  const when = post.scheduledForLabel || "later";
  return `
    <div class="ap-status-card orange">
      <div class="upper">
        <i class="ap-icon-calendar" aria-hidden="true"></i>
        <div class="flow"><span>Scheduled</span> ${when}</div>
        <button
          type="button"
          class="ap-link small standalone"
          data-post-schedule="${post.id}"
          aria-label="Edit scheduled time"
        >
          Edit
        </button>
      </div>
    </div>
  `;
}
