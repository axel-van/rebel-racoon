// Shared source-card renderer — used by the dashboard Content section and
// the session Content tab (By source view).
//
// Matches Figma 42:5197. The card is a compact one-row listing:
// kind-icon in a tinted square, filename + meta sub, then quiet action
// buttons on the right ("Ask", more).
//
// When the source is still processing, the icon box turns electric-blue,
// the icon becomes a spinner, the filename goes grey-60, and "Ask" is
// disabled.
//
// When `selectable` is true, the card grows a leading checkbox so callers
// can run bulk actions (Extract more ideas / Delete) on a multi-selection.
// Processing sources stay non-selectable — there's nothing to extract from
// or delete cleanly while the upload is mid-flight.
//
// Each processed source row also exposes a `…` menu (right-most) with
// per-row Extract more / Delete shortcuts so single-source operations
// don't require entering selection mode. The menu state is owned here
// (mirrors the idea-card more-menu pattern); callers wire the actual
// actions via [data-source-extract-one] / [data-source-delete-one].
//
// Source shape: { id, filename, kind, status, ideaCount, addedAt, ... }

import { iconFor } from "../file-kinds.js?v=20";
import { escapeHtml } from "../utils.js?v=20";

// ── Overflow menu — one open at a time ─────────────────────────────────
//
// Document-level listeners; ES modules execute once per page so this
// installs exactly once even though the card is rendered many times.

function closeAllSourceMoreMenus(exceptMenu) {
  document.querySelectorAll(".source-card__more-menu:not([hidden])").forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.hidden = true;
    const controllingBtn = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (controllingBtn) controllingBtn.setAttribute("aria-expanded", "false");
  });
}

function toggleSourceMoreMenu(triggerBtn) {
  const menuId = triggerBtn.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!menu) return;
  const willOpen = menu.hidden;
  closeAllSourceMoreMenus(willOpen ? menu : null);
  menu.hidden = !willOpen;
  triggerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

// FIND-E: idempotent guard so the document delegate is attached at most
// once, even if the module is re-evaluated.
let globalListenersBound = false;
function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;
  document.addEventListener("click", (event) => {
    // Open / close the more menu
    const moreBtn = event.target.closest("[data-source-more]");
    if (moreBtn) {
      event.preventDefault();
      toggleSourceMoreMenu(moreBtn);
      return;
    }
    // Per-row Extract / Delete — close the menu after click; the actual
    // action is handled by screen-level delegators on the same data-* hooks.
    if (event.target.closest("[data-source-extract-one]") || event.target.closest("[data-source-delete-one]")) {
      closeAllSourceMoreMenus();
      // Don't preventDefault — let the screen handler run.
      return;
    }
    // Clicks inside an open menu shouldn't bubble-close it
    if (event.target.closest(".source-card__more-menu")) return;
    // Anywhere else — close every open menu
    closeAllSourceMoreMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllSourceMoreMenus();
  });
}
bindGlobalListeners();

// ── Card renderer ──────────────────────────────────────────────────────

export function renderSourceCard(source, allIdeas = [], { selectable = false, isSelected = false } = {}) {
  const isProcessing = source.status === "Processing";
  const totalIdeas =
    typeof source.ideaCount === "number"
      ? source.ideaCount
      : allIdeas.filter((i) => (i.sourceIds || []).includes(source.id)).length;

  // Lot 6.2 — when sources-stream attached granular ticker fields (progress,
  // stage, etaSec), surface the live stage label + ETA in the sub-line and
  // render a thin progress bar across the bottom of the card. Falls back to
  // the static "Processing · Added <when>" when no ticker is wired (e.g.
  // mock seed entries that never went through the upload pipeline).
  const hasTicker = isProcessing && typeof source.progress === "number";
  const subLine = isProcessing
    ? hasTicker
      ? `${source.stage || "Processing"} · ${formatEta(source.etaSec)} left`
      : `Processing · Added ${source.addedAt}`
    : `${totalIdeas} idea${totalIdeas === 1 ? "" : "s"} · ${source.status} · Added ${source.addedAt}`;
  const progressBar = hasTicker
    ? `
      <div class="source-card__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(source.progress * 100)}">
        <div class="source-card__progress-fill" style="width: ${Math.round(source.progress * 100)}%"></div>
      </div>
    `
    : "";

  // Icon content — file kind icon, or a spinning ring while processing.
  const iconContent = isProcessing
    ? `<span class="source-card__spinner" role="status" aria-label="Processing"></span>`
    : `<i class="${iconFor(source.kind)} source-card__kind-icon" aria-hidden="true"></i>`;

  // Processing pill — shown in place of actions while the source is still
  // being analysed. Mermaid-tinted gradient + sparkles icon + live stage
  // label tie it to the same "AI is working" signature used by the
  // assistant.js "Drafting / Extracting guidelines" pills.
  const stageLabel = isProcessing ? source.stage || "Processing" : "";
  const processingPill = isProcessing
    ? `<span class="source-card__processing-pill" role="status" aria-live="polite">
         <i class="ap-icon-sparkles-mermaid"></i>
         <span class="source-card__processing-pill-label">${escapeHtml(stageLabel)}…</span>
       </span>`
    : "";

  // "Ask" — available always, but visually muted while processing.
  const askButton = `<button
        type="button"
        class="ap-button transparent grey source-card__ask"
        data-source-ask="${source.id}"
        ${isProcessing ? 'aria-disabled="true" tabindex="-1"' : ""}
      >
        <i class="ap-icon-single-chat-bubble"></i>
        <span>Ask</span>
      </button>`;

  // "Suggest clips" — surfaces on every processed video source. The
  // sources.js click handler kicks off a non-blocking extraction if the
  // source hasn't been through extraction yet (toast on start + toast with
  // "Open clips" action when ready), or opens the Video Clips modal
  // immediately if clips already exist. While extraction is in flight, the
  // button is disabled and shows an "Extracting clips…" spinner.
  const isVideo = (source.kind || "").toLowerCase() === "video";
  const isExtractingClips = isVideo && source.clipExtractionStatus === "extracting";
  let clipsButton = "";
  if (isVideo && !isProcessing) {
    if (isExtractingClips) {
      clipsButton = `<button
          type="button"
          class="ap-button transparent grey source-card__clips source-card__clips--extracting"
          aria-disabled="true"
          tabindex="-1"
        >
          <span class="source-card__clips-spinner" role="status" aria-label="Extracting clips"></span>
          <span>Extracting clips…</span>
        </button>`;
    } else {
      clipsButton = `<button
          type="button"
          class="ap-button transparent grey source-card__clips"
          data-source-suggest-clips="${source.id}"
        >
          <i class="ap-icon-sparkles"></i>
          <span>Suggest clips</span>
        </button>`;
    }
  }

  // Leading checkbox — only when the workspace is in selection mode AND the
  // source is processed. The DS `.ap-checkbox-container` uses a hidden
  // input + sibling `<i>` to render the visual box (see ds/css-ui index
  // around line 1183) so the markup must include both. data-source-select
  // gives the click delegator a stable hook regardless of which child the
  // click lands on.
  const selectCheckbox =
    selectable && !isProcessing
      ? `
        <label class="ap-checkbox-container source-card__check" aria-label="Select ${source.filename}">
          <input
            type="checkbox"
            data-source-select="${source.id}"
            ${isSelected ? "checked" : ""}
          />
          <i></i>
        </label>
      `
      : "";

  // Per-row "…" menu — only on processed sources; processing sources can't
  // be extracted from or cleanly deleted yet.
  const menuId = `source-more-${source.id}`;
  const moreMenu = !isProcessing
    ? `
      <div class="source-card__more-wrap">
        <button
          type="button"
          class="ap-icon-button transparent source-card__more"
          data-source-more="${source.id}"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${menuId}"
          aria-label="More actions"
        >
          <i class="ap-icon-more"></i>
        </button>
        <ul class="source-card__more-menu" id="${menuId}" role="menu" hidden>
          <li role="none">
            <button type="button" role="menuitem" class="source-card__more-item" data-source-extract-one="${source.id}">
              <i class="ap-icon-sparkles"></i>
              <span>Extract more ideas</span>
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" class="source-card__more-item source-card__more-item--danger" data-source-delete-one="${source.id}">
              <i class="ap-icon-trash"></i>
              <span>Delete</span>
            </button>
          </li>
        </ul>
      </div>
    `
    : "";

  const selectedClass = isSelected ? " source-card--selected" : "";

  return `
    <article class="ap-card source-card${isProcessing ? " source-card--processing" : ""}${selectedClass}" data-source-id="${source.id}">
      ${selectCheckbox}
      <div class="source-card__kind-box">${iconContent}</div>

      <div class="source-card__info">
        <h3 class="source-card__name">${source.filename}</h3>
        <p class="source-card__sub">${subLine}</p>
      </div>

      <div class="source-card__actions">
        ${clipsButton}
        ${askButton}
        ${processingPill}
        ${moreMenu}
      </div>
      ${progressBar}
    </article>
  `;
}

function formatEta(sec) {
  if (typeof sec !== "number") return "—";
  if (sec < 60) return `~${sec}s`;
  const m = Math.round(sec / 60);
  return `~${m}m`;
}
