// Clip card for the unified right-panel Outputs surface. Mirrors
// idea-card structurally so the Ideas and Clips tabs read as variants
// of the same grammar:
//
//   ┌── signals row ─── [ ☐ ] [clip] From <source>.mp4 ──────────┐
//   │ ── hero thumbnail (full-width, hue-gradient, play + dur.) ── │
//   │ ── title (H3 Bold) ──                                        │
//   │ ── summary line ──                                           │
//   │ ── #tags …                                                   │
//   │ ── actions row: timestamps · [Mention] [Draft post] [⋯] ──   │
//   └──────────────────────────────────────────────────────────────┘
//
// Each clip is mentionable — the Mention button funnels through the
// same composer-mentions pill machinery as sources and ideas.
//
// Clip shape: { id, start, end, hue, title, summary, why, network, tags }
//
// Event wiring follows the idea-card pattern: module-level click delegate
// owns kebab open/close and outside-click dismissal so the caller only
// has to handle data-clip-edit, data-clip-draft, data-clip-mention,
// data-clip-remove and data-clip-select on its own root.

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

function closeAllClipMoreMenus(exceptMenu) {
  document.querySelectorAll(".clip-card__more-menu:not([hidden])").forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    const controllingBtn = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (controllingBtn) controllingBtn.setAttribute("aria-expanded", "false");
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

// Top-level guard so the document-scoped delegate is attached at most once,
// even if the module is somehow re-evaluated (HMR, test harness, dynamic
// import). FIND-E.
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

function escapeText(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function renderClipCard(
  clip,
  { selectable = false, isSelected = false, sourceName = "", sessionId = null } = {},
) {
  const duration = fmtTime((clip.end || 0) - (clip.start || 0));
  const safeTitle = escapeText(clip.title || "Untitled clip");
  const safeSummary = escapeText(clip.summary || "");

  const selectCheckbox = selectable
    ? `
      <label class="ap-checkbox-container clip-card__check" aria-label="Select clip: ${safeTitle}">
        <input type="checkbox" data-clip-select="${clip.id}" ${isSelected ? "checked" : ""} />
        <i></i>
      </label>
    `
    : "";

  // Signals row mirrors idea-card: a "kind" tag identifying the surface
  // (here always "clip") + the attribution line "From <source>.mp4".
  // No network badge — picking a network is a downstream decision (the
  // Draft post flow lets the user choose), not a property of the clip.
  const kindBadge = `<span class="ap-tag clip-card__kind">clip</span>`;
  const attribution = sourceName
    ? `<span class="clip-card__source-attribution">From ${escapeText(sourceName)}</span>`
    : "";

  const selectedClass = isSelected ? " clip-card--selected" : "";

  // Mention button — analogue of the idea-card Mention affordance.
  // sessionId-gated so it only renders inside an active conversation
  // (the dashboard's All Clips view won't show it).
  const mentionBtn = sessionId
    ? `
      <button
        type="button"
        class="ap-button transparent grey clip-card__mention"
        data-clip-mention="${clip.id}"
      >
        <i class="ap-icon-at"></i>
        <span>Mention</span>
      </button>
    `
    : "";

  return `
    <article class="clip-card${selectedClass}" data-clip-id="${clip.id}">
      <div class="clip-card__inner">
        <div class="clip-card__signals">
          ${selectCheckbox}
          ${kindBadge}
          ${attribution}
        </div>

        <button
          type="button"
          class="clip-card__thumb-btn"
          data-clip-edit="${clip.id}"
          aria-label="Play clip: ${safeTitle}"
        >
          <span class="clip-card__thumb" style="background-image: ${thumbBackground(clip.hue)}">
            <span class="clip-card__thumb-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </span>
          </span>
        </button>

        <div class="clip-card__body">
          <h3 class="clip-card__title">${safeTitle}</h3>
          ${safeSummary ? `<p class="clip-card__hook">${safeSummary}</p>` : ""}
        </div>

        <div class="clip-card__actions">
          <span class="clip-card__timeframe" title="Clip range">
            <span class="clip-card__timeframe-bounds">
              <span class="clip-card__timeframe-time">${fmtTime(clip.start || 0)}</span>
              <i class="ap-icon-arrow-right clip-card__timeframe-arrow" aria-hidden="true"></i>
              <span class="clip-card__timeframe-time">${fmtTime(clip.end || 0)}</span>
            </span>
            <span class="ap-tag orange clip-card__timeframe-duration">${duration}</span>
          </span>

          <div class="clip-card__secondary-actions">
            ${mentionBtn}
            <button type="button" class="ap-button mermaid" data-clip-draft="${clip.id}">
              <i class="ap-icon-sparkles"></i>
              <span>Draft post</span>
            </button>

            <div class="clip-card__more-wrap">
              <button
                type="button"
                class="ap-icon-button transparent clip-card__more"
                data-clip-more="${clip.id}"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="clip-more-${clip.id}"
                aria-label="More actions"
              >
                <i class="ap-icon-more"></i>
              </button>
              <div id="clip-more-${clip.id}" class="ap-action-dropdown clip-card__more-menu" role="menu" hidden>
                <button type="button" role="menuitem" class="ap-action-dropdown-item" data-clip-edit="${clip.id}">
                  <i class="ap-icon-pen"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Edit clip</span>
                    </div>
                  </div>
                </button>
                <button type="button" role="menuitem" class="ap-action-dropdown-item red-mode" data-clip-remove="${clip.id}">
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
        </div>
      </div>
    </article>
  `;
}
