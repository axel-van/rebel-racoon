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

export function renderSourceCard(
  source,
  allIdeas = [],
  { selectable = false, isSelected = false, sessionId = null, staged = false, removeValue = null, stagedSub = "" } = {},
) {
  // `staged` mode — the source isn't in sources-stream yet (e.g. the Batch
  // Studio intake list). Reuses the card shell + tinted kind-box, swaps the
  // Ask/Mention/More cluster for a single remove control, and shows a caller-
  // supplied sub-line (origin) in place of the ideas/status meta.
  const isProcessing = !staged && source.status === "Processing";
  // Staged "busy" — the batch-screen upload/analysis loader phases. Shows the
  // same spinner kind-box as a real processing source, with a phase sub-line.
  const stagedBusy = staged && (source.status === "uploading" || source.status === "analyzing");
  const showSpinner = isProcessing || stagedBusy;
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
  const subLine = staged
    ? source.status === "uploading"
      ? "Uploading…"
      : source.status === "analyzing"
        ? "Analyzing…"
        : stagedSub
    : isProcessing
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
  // Staged sources carry an iconKey (e.g. "text"/"url"/"pdf") that maps cleanly
  // even for connector kinds like "Doc"/"Page" that iconFor wouldn't resolve.
  const iconContent = showSpinner
    ? `<span class="source-card__spinner" role="status" aria-label="Processing"></span>`
    : `<i class="${iconFor(staged ? source.iconKey || source.kind : source.kind)} source-card__kind-icon" aria-hidden="true"></i>`;

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

  // "Mention" — only when rendered inside a session (sessionId provided)
  // and the source is finished processing. Pushes the filename into the
  // composer-mentions store; the composer subscriber repaints the pills.
  const mentionButton =
    sessionId && !isProcessing
      ? `<button
          type="button"
          class="ap-button transparent grey source-card__mention"
          data-source-mention="${source.id}"
        >
          <i class="ap-icon-at"></i>
          <span>Mention</span>
        </button>`
      : "";

  // Leading checkbox — only when the workspace is in selection mode AND the
  // source is processed. The DS `.ap-checkbox-container` uses a hidden
  // input + sibling `<i>` to render the visual box (see ds/css-ui index
  // around line 1183) so the markup must include both. data-source-select
  // gives the click delegator a stable hook regardless of which child the
  // click lands on.
  const selectCheckbox =
    selectable && !isProcessing && !staged
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
        <div class="ap-action-dropdown source-card__more-menu" id="${menuId}" role="menu" hidden>
          <button type="button" role="menuitem" class="ap-action-dropdown-item" data-source-extract-one="${source.id}">
            <i class="ap-icon-sparkles"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Extract more ideas</span>
              </div>
            </div>
          </button>
          <button type="button" role="menuitem" class="ap-action-dropdown-item red-mode" data-source-delete-one="${source.id}">
            <i class="ap-icon-trash"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Delete source</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    `
    : "";

  // Staged remove control — replaces the whole Ask/Mention/More cluster.
  const removeButton = staged
    ? `<button
        type="button"
        class="ap-icon-button transparent source-card__remove"
        data-source-remove="${escapeHtml(removeValue ?? source.id)}"
        aria-label="Remove ${escapeHtml(source.filename)}"
      >
        <i class="ap-icon-close"></i>
      </button>`
    : "";

  const actions = staged ? removeButton : `${askButton}${mentionButton}${processingPill}${moreMenu}`;

  const selectedClass = isSelected ? " source-card--selected" : "";

  return `
    <article class="ap-card source-card${showSpinner ? " source-card--processing" : ""}${selectedClass}" data-source-id="${source.id}">
      ${selectCheckbox}
      <div class="source-card__kind-box">${iconContent}</div>

      <div class="source-card__info">
        <h3 class="source-card__name">${source.filename}</h3>
        <p class="source-card__sub">${subLine}</p>
      </div>

      <div class="source-card__actions">
        ${actions}
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
