// Research modal — "Read the research" behind one finding.
//
// The app's FIRST long-form reading surface in a dialog. Why a modal and not
// the alternatives:
//   • not the right panel — every panel mode is a working surface bound to the
//     active session, and /research has no session at all;
//   • not a route — the decision buttons have to sit in the same surface as the
//     evidence, and a modal keeps the feed underneath as the return context
//     with no navigation to unwind.
//
// 720px, narrower than the 920px connectors dialog: this is prose, and 920
// overshoots a comfortable reading measure.
//
// The footer repeats the feed card's actions with the SAME data-* hooks
// (renderFindingCard(…, { variant: "modal" })), so one handler in
// research-flow.js serves both surfaces.
//
// Standard lifecycle via modal-coordinator — one overlay at a time, focus
// restore, Esc / backdrop dismissal. Mirrors connectors-modal.js.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { html, raw } from "../utils.js?v=21";
import { getFinding, restoreFinding, subscribe as subscribeResearch } from "../research-store.js?v=2";
import { useFinding, dismiss as dismissWithUndo } from "../research-flow.js?v=1";
import { findResearchSource } from "../research-catalog.js?v=2";
import { renderFindingCard, renderBadge } from "../research-view.js?v=2";
import { renderSocialPostCard } from "./social-post-card.js?v=2";

const MODAL_ID = "research";

let backdrop, modal, headerEl, contentEl, footerEl;
let initialized = false;
let unsubscribe = null;
let findingId = null;

const HTML = `
<div class="app-modal-backdrop research-modal__backdrop" id="researchModalBackdrop" hidden></div>
<aside
  class="ap-dialog research-modal"
  id="researchModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="researchModalTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header research-modal__header" id="researchModalHeader"></div>
  <button class="ap-dialog-close" type="button" id="researchModalClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content research-modal__content" id="researchModalContent"></div>
  <div class="research-modal__footer" id="researchModalFooter"></div>
</aside>
`;

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("researchModalBackdrop");
  modal = document.getElementById("researchModal");
  headerEl = document.getElementById("researchModalHeader");
  contentEl = document.getElementById("researchModalContent");
  footerEl = document.getElementById("researchModalFooter");

  modal.addEventListener("click", onClick);
  bindOverlayDismissal({ modal, backdrop, close });
}

// The footer carries the same data-* hooks as the feed card, but the modal is
// appended to <body> — outside the /research screen's delegated root — so it
// handles them itself. The actions themselves live in research-flow, shared
// with the feed.
function onClick(event) {
  const use = event.target.closest("[data-research-use]");
  if (use) {
    close();
    useFinding(use.dataset.researchUse);
    return;
  }

  const useIn = event.target.closest("[data-research-use-in]");
  if (useIn) {
    close();
    useFinding(useIn.dataset.researchUseIn, { forcePicker: true });
    return;
  }

  const draft = event.target.closest("[data-research-draft]");
  if (draft) {
    close();
    useFinding(draft.dataset.researchDraft, { thenDraft: true });
    return;
  }

  const dismiss = event.target.closest("[data-research-dismiss]");
  if (dismiss) {
    close();
    dismissWithUndo(dismiss.dataset.researchDismiss);
    return;
  }

  const restore = event.target.closest("[data-research-restore]");
  if (restore) {
    restoreFinding(restore.dataset.researchRestore);
    return;
  }

  const menuBtn = event.target.closest("[data-research-menu]");
  if (menuBtn) {
    const menu = footerEl.querySelector(`[data-research-menu-for="${menuBtn.dataset.researchMenu}"]`);
    if (!menu) return;
    const open = menu.hidden;
    closeMenus();
    if (open) {
      menu.hidden = false;
      menuBtn.classList.add("open");
      menuBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }

  if (!event.target.closest("[data-research-menu-for]")) closeMenus();
}

function closeMenus() {
  footerEl.querySelectorAll("[data-research-menu-for]").forEach((m) => {
    m.hidden = true;
  });
  footerEl.querySelectorAll("[data-research-menu]").forEach((b) => {
    b.classList.remove("open");
    b.setAttribute("aria-expanded", "false");
  });
}

export function open({ findingId: id } = {}) {
  if (!initialized) init();
  if (!getFinding(id)) return;
  requestOpen(MODAL_ID, close);
  findingId = id;
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  // Stay live: using or dismissing the finding from the footer has to update
  // the footer itself, and a dismissal from elsewhere shouldn't leave a stale
  // action row on screen.
  if (!unsubscribe) unsubscribe = subscribeResearch(() => render());
  render();
  contentEl.scrollTop = 0;
}

export function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  findingId = null;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  notifyClose(MODAL_ID);
}

export function isOpen() {
  return initialized && modal.classList.contains("open");
}

/** The finding currently being read, or null. */
export function getOpenFindingId() {
  return isOpen() ? findingId : null;
}

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  const finding = getFinding(findingId);
  if (!finding) {
    close();
    return;
  }
  const source = findResearchSource(finding.sourceId);

  headerEl.innerHTML = html`
    <div class="research-modal__title-block">
      <span class="research-modal__origin">
        ${raw(renderBadge(source, { size: "sm" }))}
        <span class="research-modal__source">${source ? source.name : "Research"}</span>
        <span class="research-modal__time">· ${finding.scannedAt}</span>
        <span class="ap-tag grey">${finding.researchType}</span>
      </span>
      <h2 class="research-modal__title" id="researchModalTitle">${finding.headline}</h2>
    </div>
  `;

  const paragraphs = (finding.synthesis || []).map((p) => html`<p>${p}</p>`).join("");
  const posts = finding.posts || [];
  const evidence = posts.length
    ? html`<section class="research-modal__evidence">
        <header class="research-modal__evidence-head">
          <h3 class="research-modal__evidence-title">Source posts</h3>
          <span class="ap-counter normal grey">${posts.length}</span>
        </header>
        <div class="research-modal__posts">${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}</div>
      </section>`
    : "";

  const seeds = finding.ideaSeeds || [];
  const whatNext = seeds.length
    ? html`<section class="research-modal__seeds">
        <h3 class="research-modal__evidence-title">What I'd write from this</h3>
        <ul class="research-modal__seed-list">
          ${raw(
            seeds
              .map(
                (s) =>
                  html`<li class="research-modal__seed">
                    <span class="research-modal__seed-title">${s.title}</span>
                    <span class="research-modal__seed-body">${s.body}</span>
                  </li>`,
              )
              .join(""),
          )}
        </ul>
      </section>`
    : "";

  contentEl.innerHTML = html`
    <div class="research-modal__body">
      <div class="research-modal__prose">${raw(paragraphs)}</div>
      ${raw(evidence)} ${raw(whatNext)}
    </div>
  `;

  footerEl.innerHTML = renderFindingCard(finding, source, { variant: "modal" });
}
