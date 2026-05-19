// Clip card for the unified right-panel Outputs surface. Structural
// parallel of idea-card.js — same two-piece grammar (white inner card +
// signals row + body + actions), tuned for short video segments instead
// of textual ideas.
//
// Renders: hue-gradient thumbnail with duration overlay, title, summary,
// optional source attribution, network badge, tags, Draft Post primary
// action, kebab menu (Edit / Remove).
//
// Clip shape: { id, start, end, hue, title, summary, why, network, tags }
//
// Event wiring follows the idea-card pattern: module-level click delegate
// owns kebab open/close and outside-click dismissal so the caller only
// has to handle data-clip-edit, data-clip-draft, data-clip-remove and
// data-clip-select on its own root.

const NETWORK_ICONS = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
  tiktok: "ap-icon-tiktok-official",
};

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

function escapeText(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export function renderClipCard(clip, { selectable = false, isSelected = false, sourceName = "" } = {}) {
  const network = clip.network || "";
  const networkIcon = NETWORK_ICONS[network] || "";
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

  const networkBadge = networkIcon
    ? `<span class="ap-tag blue clip-card__network"><i class="${networkIcon}"></i><span>${escapeText(network)}</span></span>`
    : "";

  const tagsRow =
    clip.tags && clip.tags.length
      ? `<div class="clip-card__tags">${clip.tags
          .slice(0, 4)
          .map((t) => `<span class="clip-card__tag">#${escapeText(t)}</span>`)
          .join("")}</div>`
      : "";

  const selectedClass = isSelected ? " clip-card--selected" : "";

  return `
    <article class="clip-card${selectedClass}" data-clip-id="${clip.id}">
      <div class="clip-card__inner">
        <div class="clip-card__signals">
          ${selectCheckbox}
          ${networkBadge}
        </div>

        <button type="button" class="clip-card__thumb-btn" data-clip-edit="${clip.id}" aria-label="Edit clip: ${safeTitle}">
          <span class="clip-card__thumb" style="background-image: ${thumbBackground(clip.hue)}">
            <span class="clip-card__thumb-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            </span>
            <span class="ap-tag grey mini clip-card__duration">${duration}</span>
          </span>
        </button>

        <div class="clip-card__body">
          <h3 class="clip-card__title">${safeTitle}</h3>
          ${safeSummary ? `<p class="clip-card__hook">${safeSummary}</p>` : ""}
        </div>

        ${tagsRow}

        <div class="clip-card__actions">
          ${sourceName ? `<span class="clip-card__source">From ${escapeText(sourceName)}</span>` : '<span class="clip-card__source"></span>'}

          <div class="clip-card__secondary-actions">
            <button type="button" class="ap-button mermaid" data-clip-draft="${clip.id}">
              <i class="ap-icon-sparkles"></i>
              <span>Draft Post</span>
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
              <ul id="clip-more-${clip.id}" class="clip-card__more-menu" role="menu" hidden>
                <li role="none">
                  <button type="button" role="menuitem" class="clip-card__more-item" data-clip-edit="${clip.id}">
                    <i class="ap-icon-pen"></i>
                    <span>Edit clip</span>
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" class="clip-card__more-item clip-card__more-item--danger" data-clip-remove="${clip.id}">
                    <i class="ap-icon-trash"></i>
                    <span>Remove clip</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}
