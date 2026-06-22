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
import { installMoreMenu } from "./more-menu.js?v=1";

// ── Overflow menu — one open at a time (shared behaviour) ──────────────
// idea-card keeps a module-local listener (below) for the Sources toggle and
// the Pin item; the generic menu open/close/outside/Escape wiring is shared.
const { closeAll: closeAllIdeaMoreMenus } = installMoreMenu({
  menuSelector: ".idea-card__more-menu",
  triggerSelector: "[data-idea-more]",
});

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

// idea-card-specific items that live alongside the shared menu wiring: the
// Sources attribution toggle and the Pin item. ES modules execute once per
// page, so this delegate is installed exactly once.
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
  // Pin menu item — visual toggle only (mocks don't persist)
  const pinBtn = event.target.closest("[data-idea-pin]");
  if (pinBtn) {
    event.preventDefault();
    togglePinMenuItem(pinBtn);
  }
});

export function renderIdeaCard(
  idea,
  allSources = [],
  { selectable = false, isSelected = false, sessionId = null } = {},
) {
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
          <button
            type="button"
            class="idea-card__source-chip"
            data-source-open="${s.id}"
          >
            <span class="idea-card__source-chip-tile">
              <i class="${iconFor(s.kind)}" aria-hidden="true"></i>
            </span>
            <span>${s.filename}</span>
          </button>
        </li>
      `,
    )
    .join("");

  const sourcesPanel = sources.length
    ? `
      <div id="${panelId}" class="idea-card__source-info" hidden>
        <div class="idea-card__source-info-label">
          <i class="ap-icon-information-circle idea-card__source-info-icon" aria-hidden="true"></i>
          <span>Sources used to generate this idea</span>
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
            ${
              sessionId
                ? `<button
                type="button"
                class="ap-button transparent grey idea-card__mention"
                data-idea-mention="${idea.id}"
              >
                <i class="ap-icon-at"></i>
                <span>Reference</span>
              </button>`
                : ""
            }
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
              <div id="idea-more-${idea.id}" class="ap-action-dropdown idea-card__more-menu" role="menu" hidden>
                <button
                  type="button"
                  role="menuitem"
                  class="ap-action-dropdown-item"
                  data-idea-pin="${idea.id}"
                  aria-pressed="${idea.pinned ? "true" : "false"}"
                >
                  <i class="ap-icon-pin"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">${pinLabel}</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${sourcesPanel}
    </article>
  `;
}
