// Shared idea-card renderer — used by the dashboard Content section (All
// ideas view) and the session Content tab.
//
// Matches Figma 204:2318. Two-piece structure:
//   - White inner card: potential pill (top), title (H3 Bold) + hook,
//     actions row with [Sources ▾ toggle] on the left and [Draft Post + ⋯]
//     on the right.
//   - Expanded grey-05 attribution panel that appears beneath the white card
//     when sources are toggled open. Holds an info-circle + "This idea has
//     been generated using these sources" line followed by a wrapping list
//     of source chips. Collapsed by default.
//
// Toggle state lives on the article's data-sources-open attribute. Click
// handling for the Sources toggle is module-local (alongside the existing
// more-menu wiring).
//
// Idea shape:   { id, title, body, confidence, pinned, sourceIds[],
//                 extractedAt, channels, state, rationale }
// Source shape: { id, filename, kind, ... }
//
// Caller passes the full sources list so the card can resolve every
// contributing source by id.

function potentialFor(confidence) {
  if (confidence >= 80) return { label: "High potential", color: "green" };
  if (confidence >= 60) return { label: "Medium potential", color: "orange" };
  return { label: "Low potential", color: "grey" };
}

import { iconFor } from "../file-kinds.js?v=20";

// ── Overflow menu — one open at a time ─────────────────────────────────
//
// idea-card manages its own menu state so screen-level code (dashboard.js,
// session.js) only has to wire the idea-open / idea-generate actions.
//
// Since ES modules execute once per page, these listeners install exactly
// once — there's no risk of duplication when the dashboard re-renders.

function closeAllIdeaMoreMenus(exceptMenu) {
  document.querySelectorAll(".idea-card__more-menu:not([hidden])").forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    const controllingBtn = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (controllingBtn) controllingBtn.setAttribute("aria-expanded", "false");
  });
}

function toggleIdeaMoreMenu(triggerBtn) {
  const menuId = triggerBtn.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllIdeaMoreMenus(willOpen ? menu : null);
  menu.hidden = !willOpen;
  triggerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

async function togglePinMenuItem(pinBtn) {
  const wasPressed = pinBtn.getAttribute("aria-pressed") === "true";
  setPinned(pinBtn, !wasPressed);
  closeAllIdeaMoreMenus();

  const { showToast } = await import("./toast.js");
  showToast(wasPressed ? "Idea unpinned" : "Idea pinned", {
    action: {
      label: "Undo",
      onClick: () => setPinned(pinBtn, wasPressed),
    },
  });
}

function setPinned(pinBtn, pinned) {
  pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
  const labelEl = pinBtn.querySelector("span");
  if (labelEl) labelEl.textContent = pinned ? "Unpin idea" : "Pin idea";
}

// FIND-E: idempotent guard so the document delegate is attached at most
// once, even if the module is re-evaluated.
let globalListenersBound = false;
function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;
  document.addEventListener("click", (event) => {
    // Sources toggle — show/hide the attribution panel
    const sourcesBtn = event.target.closest("[data-sources-toggle]");
    if (sourcesBtn) {
      event.preventDefault();
      const card = sourcesBtn.closest(".idea-card");
      const willOpen = card?.dataset.sourcesOpen !== "true";
      if (card) card.dataset.sourcesOpen = willOpen ? "true" : "false";
      sourcesBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      const panelId = sourcesBtn.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel) panel.hidden = !willOpen;
      return;
    }
    // Open/close handler
    const moreBtn = event.target.closest("[data-idea-more]");
    if (moreBtn) {
      event.preventDefault();
      toggleIdeaMoreMenu(moreBtn);
      return;
    }
    // Pin menu item — visual toggle only (mocks don't persist)
    const pinBtn = event.target.closest("[data-idea-pin]");
    if (pinBtn) {
      event.preventDefault();
      togglePinMenuItem(pinBtn);
      return;
    }
    // Clicks inside an open menu shouldn't bubble-close it
    if (event.target.closest(".idea-card__more-menu")) return;
    // Anywhere else — close everything
    closeAllIdeaMoreMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllIdeaMoreMenus();
  });
}
bindGlobalListeners();

export function renderIdeaCard(idea, allSources = [], { selectable = false, isSelected = false } = {}) {
  const sourceIds = idea.sourceIds || [];
  const sources = sourceIds.map((id) => allSources.find((s) => s.id === id)).filter(Boolean);
  const potential = potentialFor(idea.confidence || 0);
  const pinLabel = idea.pinned ? "Unpin idea" : "Pin idea";
  const panelId = `idea-sources-${idea.id}`;

  // Leading checkbox — rendered when the workspace is in selection mode.
  // Same DS .ap-checkbox-container pattern as source-card; the sibling <i>
  // is what the DS draws as the visual box (input is visually hidden).
  const selectCheckbox = selectable
    ? `
      <label class="ap-checkbox-container idea-card__check" aria-label="Select idea: ${idea.title}">
        <input
          type="checkbox"
          data-idea-select="${idea.id}"
          ${isSelected ? "checked" : ""}
        />
        <i></i>
      </label>
    `
    : "";

  const selectedClass = isSelected ? " idea-card--selected" : "";

  const sourceChips = sources
    .map(
      (s) => `
        <li>
          <a class="idea-card__source-chip" href="#" data-source-open="${s.id}">
            <span class="idea-card__source-chip-tile">
              <i class="${iconFor(s.kind)}" aria-hidden="true"></i>
            </span>
            <span>${s.filename}</span>
          </a>
        </li>
      `,
    )
    .join("");

  const sourcesPanel = sources.length
    ? `
      <div id="${panelId}" class="idea-card__source-info" hidden>
        <div class="idea-card__source-info-label">
          <i class="ap-icon-information-circle idea-card__source-info-icon" aria-hidden="true"></i>
          <span>This idea has been generated using these sources</span>
        </div>
        <ul class="idea-card__sources-list">${sourceChips}</ul>
      </div>
    `
    : "";

  const sourcesToggle = sources.length
    ? `
      <button
        type="button"
        class="idea-card__sources-toggle"
        data-sources-toggle
        aria-expanded="false"
        aria-controls="${panelId}"
      >
        <span>Sources</span>
        <i class="ap-icon-chevron-down idea-card__sources-chevron" aria-hidden="true"></i>
      </button>
    `
    : '<span class="idea-card__sources-toggle idea-card__sources-toggle--empty"></span>';

  // Lot 19 — kind badge, hashtags, extracted timestamp.
  // The kind taxonomy (stat / quote / hook / story / insight) maps to a
  // colored .ap-tag — same per-kind palette the right-panel Ideas mode
  // uses (Lot 5). The hashtag row sits above the actions ; the extracted
  // date sits in the actions row footer (after the Sources toggle, before
  // the secondary actions cluster).
  const kindBadge = idea.kind
    ? `<span class="ap-tag idea-card__kind idea-card__kind--${idea.kind}">${idea.kind}</span>`
    : "";
  const tagsRow =
    idea.tags && idea.tags.length
      ? `<div class="idea-card__tags">${idea.tags
          .slice(0, 4)
          .map((t) => `<span class="idea-card__tag">#${t}</span>`)
          .join("")}</div>`
      : "";
  const extractedAt = idea.extractedAt ? `<span class="idea-card__extracted">${idea.extractedAt}</span>` : "";

  return `
    <article class="idea-card${selectedClass}" data-idea-id="${idea.id}" data-sources-open="false">
      <div class="idea-card__inner">
        <div class="idea-card__signals">
          ${selectCheckbox}
          ${kindBadge}
          <span class="ap-status ${potential.color} idea-card__potential">${potential.label}</span>
        </div>

        <button type="button" class="idea-card__open" data-idea-open="${idea.id}" aria-label="Open idea: ${idea.title}">
          <div class="idea-card__body">
            <h3 class="idea-card__title">${idea.title}</h3>
            ${idea.body ? `<p class="idea-card__hook">${idea.body}</p>` : ""}
          </div>
        </button>

        ${tagsRow}

        <div class="idea-card__actions">
          ${sourcesToggle}
          ${extractedAt}

          <div class="idea-card__secondary-actions">
            <button
              type="button"
              class="ap-button mermaid"
              data-idea-generate="${idea.id}"
            >
              <i class="ap-icon-sparkles"></i>
              <span>Draft post</span>
            </button>

            <div class="idea-card__more-wrap">
              <button
                type="button"
                class="ap-icon-button transparent idea-card__more"
                data-idea-more="${idea.id}"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="idea-more-${idea.id}"
                aria-label="More actions"
              >
                <i class="ap-icon-more"></i>
              </button>
              <ul id="idea-more-${idea.id}" class="idea-card__more-menu" role="menu" hidden>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    class="idea-card__more-item"
                    data-idea-pin="${idea.id}"
                    aria-pressed="${idea.pinned ? "true" : "false"}"
                  >
                    <i class="ap-icon-pin"></i>
                    <span>${pinLabel}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      ${sourcesPanel}
    </article>
  `;
}
