// Pure, dependency-free renderers for the conversation-thread turns on
// /session/:id. Extracted from screens/session.js so the SAME markup powers
// both the live app and the component handoff gallery (handoff/components.html)
// — the handoff imports straight from here, so its previews can never drift
// from the app. Every export takes a plain `message`-shaped object (or opts)
// and returns an HTML string. No store reads, no DOM, no side effects: the
// store-coupled turns (extraction / clip-extraction / source resolution) stay
// in session.js and pass their resolved data in as arguments.
import { escapeHtml, escapeAttr as escapeHtmlAttr } from "../../utils.js?v=21";

// Chat-switch skeleton — shown for ~340ms inside .session__assistant-thread
// when switching chats, then swapped for the real thread.
export const SWITCH_SKELETON_HTML = `
  <div class="thread-skeleton" aria-hidden="true">
    <div class="thread-skeleton__row thread-skeleton__row--in"><span class="thread-skeleton__bubble" style="width:62%"></span></div>
    <div class="thread-skeleton__row thread-skeleton__row--out"><span class="thread-skeleton__bubble" style="width:48%"></span></div>
    <div class="thread-skeleton__row thread-skeleton__row--in"><span class="thread-skeleton__bubble" style="width:74%"></span></div>
    <div class="thread-skeleton__row thread-skeleton__row--in"><span class="thread-skeleton__bubble" style="width:40%"></span></div>
  </div>
`;

// Plain AI / User message bubble — the default (non-variant) turn. AI gets the
// sparkle avatar + borderless bubble; User gets the "You" role + solid blue
// bubble. `message.status === "loading"` adds the pending shimmer.
export function renderMessageBubble(message) {
  const isAi = message.role === "assistant";
  const bubbleClass = isAi ? "chat-bubble--ai" : "chat-bubble--user";
  const turnClass = isAi ? "chat-turn--ai" : "chat-turn--user";
  const loadingClass = message.status === "loading" ? " is-loading" : "";
  const header = isAi
    ? `<i class="ap-icon-archie-official chat-turn-avatar" aria-hidden="true"></i>`
    : `<span class="chat-turn-role">You</span>`;
  return `
    <div class="chat-turn ${turnClass}">
      ${header}
      <div class="chat-bubble ${bubbleClass}${loadingClass}">
        <p class="chat-bubble-text">${message.text}</p>
      </div>
    </div>
  `;
}

// Right-aligned "Source intake" turn — a single-line compact chip with a kind
// icon, filename (ellipsis-truncated), and a trailing status slot. The backing
// source is resolved by the caller (session.js reads sources-stream) and passed
// in as `source` so this stays a pure renderer; pass `null` for the unresolved
// case. Trailing states are driven by (status loading, ideaCount, clips).
export function renderSourceIntakeTurn(message, source = null) {
  // Kind icon — map the raw kind label (from sources-stream) to the DS
  // icon name. Lowercased so "PDF" / "Video" / "URL" / "Word" / "Image"
  // / "Audio" all resolve.
  const iconByKind = {
    pdf: "ap-icon-file--pdf",
    video: "ap-icon-file--video",
    url: "ap-icon-link",
    word: "ap-icon-file--text",
    text: "ap-icon-file--text",
    image: "ap-icon-file--image",
    audio: "ap-icon-file",
  };
  const kindKey = (message.kind || "").toLowerCase();
  const icon = iconByKind[kindKey] || "ap-icon-file";
  const isLoading = message.status === "loading";

  // A recognised link (YouTube, Drive, Notion, …) shows the service logo
  // instead of the generic link glyph. Falls back to the kind icon.
  const src = source;
  const kindIcon = src?.serviceLogo
    ? `<img class="chat-bubble-source-intake__kind chat-bubble-source-intake__kind--logo" src="${escapeHtmlAttr(
        src.serviceLogo,
      )}" alt="" aria-hidden="true" />`
    : `<i class="${icon} chat-bubble-source-intake__kind" aria-hidden="true"></i>`;

  // v2 single-line layout (see styles/chat.css and handoff §2). State lives in
  // a trailing slot with these variants driven by (isLoading, ideaCount > 0,
  // clips > 0):
  //   loading        → muted grey pill with inline dot + "Uploading"
  //   ready + ideas  → solid electric-blue pill "N ideas ›" → Ideas panel
  //   ready + clips  → second pill "M clips ›" → Clips panel (Video only)
  //   ready, none    → bare green check icon
  let trailing;
  if (isLoading) {
    trailing = `
      <span class="chat-bubble-source-intake__loading" role="status" aria-label="Uploading">
        <span class="chat-bubble-source-intake__spinner" aria-hidden="true"></span>
        <span>Uploading</span>
      </span>
    `;
  } else if (message.sourceId) {
    const ideas = src?.ideaCount || 0;
    const clips = Array.isArray(src?.clips) ? src.clips.length : 0;
    const pills = [];
    if (ideas > 0) {
      const ideasLabel = `${ideas} idea${ideas === 1 ? "" : "s"}`;
      pills.push(`
        <button
          type="button"
          class="chat-bubble-source-intake__pill"
          data-source-intake-open-ideas
          aria-label="Open ${ideasLabel} in Ideas panel"
        >
          <span>${ideasLabel}</span>
          <i class="ap-icon-chevron-right" aria-hidden="true"></i>
        </button>
      `);
    }
    if (clips > 0) {
      const clipsLabel = `${clips} clip${clips === 1 ? "" : "s"}`;
      pills.push(`
        <button
          type="button"
          class="chat-bubble-source-intake__pill"
          data-source-intake-open-clips
          aria-label="Open ${clipsLabel} in Clips panel"
        >
          <span>${clipsLabel}</span>
          <i class="ap-icon-chevron-right" aria-hidden="true"></i>
        </button>
      `);
    }
    if (pills.length > 0) {
      trailing = pills.join("");
    } else {
      trailing = `<i class="ap-icon-rounded-check_fill chat-bubble-source-intake__check" aria-hidden="true"></i>`;
    }
  } else {
    // Ready but no sourceId resolved yet — degrade to a bare check.
    trailing = `<i class="ap-icon-rounded-check_fill chat-bubble-source-intake__check" aria-hidden="true"></i>`;
  }

  const filename = message.filename || "";
  return `
    <div class="chat-turn chat-turn--user">
      <span class="chat-turn-role">${message.meta || "Source intake"}</span>
      <div class="chat-bubble chat-bubble--source-intake" data-intake-status="${message.status || "ready"}">
        ${kindIcon}
        <span class="chat-bubble-source-intake__name" title="${filename}">${filename}</span>
        ${trailing}
      </div>
    </div>
  `;
}

// Channel-picker choice turn — chip row (text+icon or visual preview tiles) +
// an optional Submit footer. Becomes static spans once `status === "answered"`.
export function renderChoiceTurn(message) {
  const isAnswered = message.status === "answered";
  // Preview-rich chips (e.g. subtitle style picker) carry a `preview`
  // string per choice that's rendered above the label as a styled
  // sample. The chip is taller and the icon slot is dropped — the
  // sample text *is* the icon visually.
  const hasPreviews = (message.choices || []).some((c) => typeof c.preview === "string" && c.preview.length > 0);
  const chips = (message.choices || [])
    .map((c) => {
      const isSelected = (message.selected || []).includes(c.value);
      const selectedClass = isSelected ? " is-selected" : "";
      const previewClass = c.preview ? ` chat-bubble-choice-chip--${c.previewKind || "preview"}` : "";
      // Selected affordance — the same filled blue check badge as the picker
      // rows. Always in the markup, CSS-hidden until the chip is .is-selected
      // (selection is a pure DOM toggle, so it can't be rendered conditionally).
      const checkBadge = `<span class="chat-bubble-choice-check" aria-hidden="true"><i class="ap-icon-check"></i></span>`;
      const inner = c.preview
        ? `<span class="chat-bubble-choice-preview chat-bubble-choice-preview--${c.previewKind || "default"}">${c.preview}</span>
           <span class="chat-bubble-choice-label">${c.label}</span>${checkBadge}`
        : `<i class="${c.icon}" aria-hidden="true"></i>
           <span>${c.label}</span>${checkBadge}`;
      if (isAnswered) {
        return `<span class="chat-bubble-choice-chip${selectedClass}${previewClass}">
          ${inner}
        </span>`;
      }
      return `<button
        type="button"
        class="chat-bubble-choice-chip${selectedClass}${previewClass}"
        data-assistant-choice="${c.value}"
        data-assistant-choice-msg="${message.id}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >
        ${inner}
      </button>`;
    })
    .join("");
  const choicesRowClass = hasPreviews ? "chat-bubble-choices chat-bubble-choices--visual" : "chat-bubble-choices";

  const submitLabel = message.submitLabel || "Submit";
  // Instant pickers (single click = submit) skip the Submit button — the
  // chip-click handler fires the handler directly.
  const footer =
    isAnswered || message.instant
      ? ""
      : `<div class="chat-bubble-choices-footer">
        <button
          type="button"
          class="ap-button primary blue"
          data-assistant-choice-submit="${message.id}"
          ${(message.selected || []).length === 0 ? "disabled" : ""}
        >
          <span>${submitLabel}</span>
        </button>
      </div>`;

  return `
    <div class="chat-turn chat-turn--ai">
      <i class="ap-icon-archie-official chat-turn-avatar" aria-hidden="true"></i>
      <div class="chat-bubble chat-bubble--ai">
        <p class="chat-bubble-text">${message.text}</p>
        <div class="chat-bubble-choices-card">
          <div class="${choicesRowClass}">${chips}</div>
          ${footer}
        </div>
      </div>
    </div>
  `;
}

// Shared collapsible notice scaffold — the <details>/<summary> + status pill
// + chevron used by both the system/drafting notices and the extraction turn.
// `bodyHtml` is the collapsed content (caller owns its wrapper). Figma 25:1413.
export function renderNotice({
  variant = "grey",
  label = "",
  open = true,
  loading = false,
  showChevron = true,
  bodyHtml = "",
} = {}) {
  const variantClass = variant === "mermaid" ? " assistant-notice--mermaid" : "";
  const loadingClass = loading ? " is-loading" : "";
  const openAttr = open ? " open" : "";
  const statusClass = variant === "mermaid" ? "ap-status mermaid" : "ap-status grey";
  return `
    <details class="assistant-notice${variantClass}${loadingClass}"${openAttr}>
      <summary class="assistant-notice__toggle">
        <span class="${statusClass}">${label}</span>
        ${showChevron ? '<i class="ap-icon-chevron-down assistant-notice__chevron"></i>' : ""}
      </summary>
      ${bodyHtml}
    </details>
  `;
}

export function renderSystemNotice(message) {
  const hasDetail = !!message.text;
  return renderNotice({
    variant: message.variant === "mermaid" ? "mermaid" : "grey",
    label: message.meta || "System",
    open: !!message.open,
    loading: message.status === "loading",
    showChevron: hasDetail,
    bodyHtml: hasDetail ? `<div class="assistant-notice__detail">${message.text}</div>` : "",
  });
}

// Inline pill + spinner shown while a non-blocking extraction is running.
export function renderExtractingNotice() {
  return `
    <div class="chat-turn chat-turn--ai chat-turn--extracting">
      <div class="extracting-notice" role="status" aria-label="Extracting ideas from this source">
        <span class="ap-status mermaid">Extracting</span>
        <span class="extracting-notice__spinner" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

// ─── Shared in-thread result card ──────────────────────────────────────────
//
// One renderer for every "result of a long AI job" card in the thread: the
// drafts batch, the clips-ready card, the ideas-ready card, plus the pending
// ("…cutting your clips") and unavailable ("clips no longer available")
// states. Composes .ap-card + .drafts-card so all of them read as one family
// (the user's brief: "globalement la même chose: le résultat d'un long
// travail").
//
//   state="ready"        → full-width <button>, mermaid tile + chevron CTA
//   state="pending"      → non-interactive, ring spinner in the tile, no CTA
//   state="unavailable"  → non-interactive, muted file-icon tile, no CTA
//
// opts:
//   state, title, sub (HTML), extraHtml (inserted between title + sub),
//   icon (glyph class for ready/unavailable tiles; ready defaults to the
//   mermaid sparkles), cta { label }, dataAttr (root <button> data-* hook),
//   active (drafts is-active anchor), busyLabel (pending spinner a11y label).
export function renderResultCard({
  state = "ready",
  title = "",
  sub = "",
  extraHtml = "",
  icon = "ap-icon-archie-official",
  cta = null,
  dataAttr = "",
  active = false,
  busyLabel = "Working",
} = {}) {
  const tile =
    state === "pending"
      ? `<span class="drafts-card__icon drafts-card__icon--spinner">
           <span class="drafts-card__spinner" role="status" aria-label="${escapeHtmlAttr(busyLabel)}"></span>
         </span>`
      : `<span class="drafts-card__icon${state === "unavailable" ? " drafts-card__icon--muted" : ""}" aria-hidden="true">
           <i class="${icon}"></i>
         </span>`;
  const ctaHtml =
    state === "ready" && cta
      ? `<span class="drafts-card__cta" aria-hidden="true">
           <span class="drafts-card__cta-label">${escapeHtml(cta.label)}</span>
           <i class="ap-icon-chevron-right"></i>
         </span>`
      : "";
  const body = `
    ${tile}
    <span class="drafts-card__main">
      <span class="drafts-card__title-row">
        <span class="drafts-card__title">${escapeHtml(title)}</span>
      </span>
      ${extraHtml}
      ${sub ? `<span class="drafts-card__sub">${sub}</span>` : ""}
    </span>
    ${ctaHtml}
  `;
  if (state === "ready") {
    return `<button type="button" class="ap-card drafts-card${active ? " is-active" : ""}" ${dataAttr}>${body}</button>`;
  }
  return `<div class="ap-card drafts-card drafts-card--${state}">${body}</div>`;
}
