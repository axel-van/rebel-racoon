// Clip card for the right-panel Outputs > Clips tab. Visually identical
// to rpanel-ideas__card — it reuses the same class scheme on purpose so
// the Ideas and Clips tabs read as variants of one card grammar:
//
//   ┌─ thumbnail (hero, hue gradient, play + start→end + duration) ─┐
//   │                                                                │
//   │  [clip]                                                        │
//   │  Title                                                         │
//   │  Summary                                                       │
//   │                                                                │
//   │  ┌─ Why this clip ▾ ─────────────────────────────────────────┐ │
//   │  │ Rationale text                                             │ │
//   │  │ Source  [📄 founder-keynote.mp4]                           │ │
//   │  └────────────────────────────────────────────────────────────┘ │
//   ├────────────────────────────────────────────────────────────────┤
//   │  👍 👎                              [@Mention] [✦Draft]        │
//   └────────────────────────────────────────────────────────────────┘
//
// Clip shape: { id, start, end, hue, title, summary, why, network, tags }
//
// Visual classes prefixed `rpanel-ideas__*` are shared with the idea
// card (defined in right-panel.css). Classes prefixed `clip-card__*`
// own clip-specific bits (thumbnail, timeframe overlay).

import { iconFor } from "../file-kinds.js?v=20";
import { escapeText, escapeAttr } from "../utils.js?v=21";

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function thumbBackground(hue) {
  const h = hue ?? 24;
  const bg = `linear-gradient(135deg, oklch(0.32 0.08 ${h}) 0%, oklch(0.18 0.05 ${h}) 100%)`;
  const blob1 = `radial-gradient(circle at 28% 38%, oklch(0.72 0.18 ${h}) 0%, transparent 42%)`;
  const blob2 = `radial-gradient(circle at 78% 72%, oklch(0.55 0.14 ${(h + 40) % 360}) 0%, transparent 38%)`;
  return `${blob1}, ${blob2}, ${bg}`;
}

// One-at-a-time kebab menu — closes any other open card menu when the
// user opens a new one, and closes everything on click outside / Escape.
function closeAllClipMoreMenus(exceptMenu) {
  document.querySelectorAll(".clip-card__more-menu:not([hidden])").forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
}

function toggleClipMoreMenu(triggerBtn) {
  const menuId = triggerBtn.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllClipMoreMenus(willOpen ? menu : null);
  menu.hidden = !willOpen;
  triggerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

let globalListenersBound = false;
function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;
  document.addEventListener("click", (event) => {
    const moreBtn = event.target.closest("[data-clip-more]");
    if (moreBtn) {
      event.preventDefault();
      toggleClipMoreMenu(moreBtn);
      return;
    }
    if (event.target.closest(".clip-card__more-menu")) return;
    closeAllClipMoreMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllClipMoreMenus();
  });
}
bindGlobalListeners();

export function renderClipCard(
  clip,
  { sourceName = "", sourceKind = "Video", sessionId = null, feedback = null, whyOpen = false } = {},
) {
  const duration = fmtTime((clip.end || 0) - (clip.start || 0));
  const safeTitle = escapeText(clip.title || "Untitled clip");
  const safeSummary = escapeText(clip.summary || "");
  const safeWhy = escapeText(clip.why || "");

  // Why-this-clip panel — mirrors the rpanel-ideas__why structure.
  // Holds the per-clip rationale (clip.why). Source attribution lives
  // in the source line at the top of the content zone (sibling of the
  // kind tag), so it's NOT repeated here.
  const whyId = `rpanel-clip-why-${clip.id}`;
  const hasWhyBody = Boolean(safeWhy);
  const whyPanel = hasWhyBody
    ? `
      <section class="rpanel-ideas__why" data-why-open="${whyOpen ? "true" : "false"}">
        <button
          type="button"
          class="rpanel-ideas__why-head"
          data-rpanel-clip-why-toggle="${escapeAttr(clip.id)}"
          aria-expanded="${whyOpen ? "true" : "false"}"
          aria-controls="${whyId}"
        >
          <i class="ap-icon-info rpanel-ideas__why-info" aria-hidden="true"></i>
          <span class="rpanel-ideas__why-title">Why this clip</span>
          <i class="ap-icon-chevron-${whyOpen ? "up" : "down"} rpanel-ideas__why-chevron" aria-hidden="true"></i>
        </button>
        <div id="${whyId}" class="rpanel-ideas__why-body" ${whyOpen ? "" : "hidden"}>
          ${safeWhy ? `<p class="rpanel-ideas__why-rationale">${safeWhy}</p>` : ""}
        </div>
      </section>
    `
    : "";

  const thumbBtn = (side) => {
    const isUp = side === "up";
    const isActive = feedback === side;
    const icon = isUp ? "ap-icon-thumb-up" : "ap-icon-thumb-down";
    const label = isUp ? "Mark clip as useful" : "Mark clip as not useful";
    return `
      <button
        type="button"
        class="ap-icon-button transparent sm rpanel-ideas__thumb${isActive ? " is-active" : ""}"
        data-rpanel-clip-feedback="${escapeAttr(clip.id)}"
        data-verdict="${side}"
        aria-pressed="${isActive}"
        aria-label="${label}"
        title="${label}"
      >
        <i class="${icon}"></i>
      </button>
    `;
  };

  // Mention button — sessionId-gated so the dashboard's All Clips view
  // (if it ever lands) renders without the affordance.
  const mentionBtn = sessionId
    ? `
      <button
        type="button"
        class="ap-button ghost blue rpanel-ideas__mention"
        data-clip-mention="${escapeAttr(clip.id)}"
      >
        <i class="ap-icon-at"></i>
        <span>Mention</span>
      </button>
    `
    : "";

  return `
    <article class="rpanel-ideas__card clip-card" data-clip-id="${escapeAttr(clip.id)}">
      <button
        type="button"
        class="clip-card__thumb-btn"
        data-clip-edit="${escapeAttr(clip.id)}"
        aria-label="Play clip: ${safeTitle}"
      >
        <span class="clip-card__thumb" style="background-image: ${thumbBackground(clip.hue)}">
          <span class="clip-card__thumb-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          </span>
          <span class="clip-card__timeframe" aria-label="Clip range">
            <span class="clip-card__timeframe-bounds">
              <span class="clip-card__timeframe-time">${fmtTime(clip.start || 0)}</span>
              <i class="ap-icon-arrow-right clip-card__timeframe-arrow" aria-hidden="true"></i>
              <span class="clip-card__timeframe-time">${fmtTime(clip.end || 0)}</span>
            </span>
            <span class="ap-tag orange clip-card__timeframe-duration">${duration}</span>
          </span>
        </span>
      </button>

      <div class="rpanel-ideas__card-content">
        <div class="clip-card__source-line">
          <span class="ap-tag grey rpanel-ideas__kind clip-card__kind">clip</span>
          ${
            sourceName
              ? `<span class="clip-card__source-name" title="${escapeAttr(sourceName)}">
                  <i class="${iconFor(sourceKind)}" aria-hidden="true"></i>
                  <span>${escapeText(sourceName)}</span>
                </span>`
              : ""
          }
          <div class="clip-card__more-wrap">
            <button
              type="button"
              class="ap-icon-button transparent sm clip-card__more"
              data-clip-more="${escapeAttr(clip.id)}"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-controls="clip-more-${escapeAttr(clip.id)}"
              aria-label="More actions"
            >
              <i class="ap-icon-more"></i>
            </button>
            <div
              id="clip-more-${escapeAttr(clip.id)}"
              class="ap-action-dropdown clip-card__more-menu"
              role="menu"
              hidden
            >
              <button
                type="button"
                role="menuitem"
                class="ap-action-dropdown-item"
                data-clip-edit="${escapeAttr(clip.id)}"
              >
                <i class="ap-icon-pen"></i>
                <div class="ap-action-dropdown-item-text">
                  <div class="ap-action-dropdown-item-label-container">
                    <span class="ap-action-dropdown-item-label">Edit clip</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                role="menuitem"
                class="ap-action-dropdown-item red-mode"
                data-clip-remove="${escapeAttr(clip.id)}"
              >
                <i class="ap-icon-trash"></i>
                <div class="ap-action-dropdown-item-text">
                  <div class="ap-action-dropdown-item-label-container">
                    <span class="ap-action-dropdown-item-label">Remove clip</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
        <h4 class="rpanel-ideas__card-title">${safeTitle}</h4>
        ${safeSummary ? `<p class="rpanel-ideas__card-body">${safeSummary}</p>` : ""}
        ${whyPanel}
      </div>

      <footer class="rpanel-ideas__card-actions">
        <div class="rpanel-ideas__feedback">
          ${thumbBtn("up")}
          ${thumbBtn("down")}
        </div>
        <div class="rpanel-ideas__primary">
          ${mentionBtn}
          <button
            type="button"
            class="ap-button secondary blue rpanel-ideas__use"
            data-clip-draft="${escapeAttr(clip.id)}"
          >
            <i class="ap-icon-sparkles"></i>
            <span>Draft</span>
          </button>
        </div>
      </footer>
    </article>
  `;
}
