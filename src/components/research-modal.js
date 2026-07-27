// "Why this idea" — the research behind one delivered idea.
//
// It used to be "Read the research": the finding as the subject, with the ideas
// it could become listed at the bottom. That was backwards. The idea is what
// the feature delivers; this dialog exists to justify it, so the idea is the
// title and the research is the argument underneath.
//
// Why a modal: the justification is read-then-decide, the decision buttons have
// to sit with the evidence, and a modal keeps the digest underneath as the
// return context with no navigation to unwind. 720px — this is prose, and the
// connectors dialog's 920 overshoots a comfortable measure.
//
// Standard lifecycle via modal-coordinator — one overlay at a time, focus
// restore, Esc / backdrop dismissal. Mirrors connectors-modal.js.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { html, raw } from "../utils.js?v=21";
import { getFinding, subscribe as subscribeResearch } from "../research-store.js?v=7";
import { writeIdea, skipIdea } from "../research-flow.js?v=9";
import { findResearchSource } from "../research-catalog.js?v=3";
import { getIdeaById } from "../library.js?v=55";
import { renderBadge } from "../research-view.js?v=8";
import { renderSocialPostCard } from "./social-post-card.js?v=2";

const MODAL_ID = "research";

let backdrop, modal, headerEl, contentEl, footerEl;
let initialized = false;
let unsubscribe = null;
let findingId = null;
let ideaId = null;

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

// The footer's actions live in research-flow, shared with the digest. The modal
// is appended to <body> — outside the screen's delegated root — so it handles
// its own clicks.
function onClick(event) {
  // The ✕. bindOverlayDismissal only wires the backdrop and Esc — every modal
  // handles its own close button, and rewriting this handler had dropped it.
  if (event.target.closest("#researchModalClose") || event.target.closest("[data-modal-close]")) {
    close();
    return;
  }

  const write = event.target.closest("[data-research-write]");
  if (write) {
    close();
    writeIdea(write.dataset.researchWrite);
    return;
  }

  const skip = event.target.closest("[data-research-skip]");
  if (skip) {
    close();
    skipIdea(skip.dataset.researchSkip);
  }
}

export function open({ findingId: fid, ideaId: iid = null } = {}) {
  if (!initialized) init();
  if (!getFinding(fid)) return;
  requestOpen(MODAL_ID, close);
  findingId = fid;
  ideaId = iid;
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
  ideaId = null;
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
  const idea = ideaId ? getIdeaById(ideaId) : null;
  // The idea is the subject; without it there's nothing to justify.
  if (!finding || (ideaId && !idea)) {
    close();
    return;
  }
  const source = findResearchSource(finding.sourceId);

  headerEl.innerHTML = html`
    <div class="research-modal__title-block">
      <span class="research-modal__origin">
        ${raw(renderBadge(source, { size: "sm" }))}
        <span class="research-modal__source">${source ? source.name : "Research"}</span>
      </span>
      <h2 class="research-modal__title" id="researchModalTitle">${idea ? idea.title : finding.headline}</h2>
      ${raw(idea ? html`<p class="research-modal__lead">${idea.body}</p>` : "")}
    </div>
  `;

  const posts = finding.posts || [];
  contentEl.innerHTML = html`
    <div class="research-modal__body">
      <section class="research-modal__reason">
        <h3 class="research-modal__section-title">Why I'm suggesting it</h3>
        <p class="research-modal__reason-line">${finding.headline}</p>
        <div class="research-modal__prose">
          ${raw((finding.synthesis || []).map((p) => html`<p>${p}</p>`).join(""))}
        </div>
      </section>

      ${raw(
        posts.length
          ? html`<section class="research-modal__evidence">
              <header class="research-modal__evidence-head">
                <h3 class="research-modal__section-title">What I saw</h3>
                <span class="ap-counter normal grey">${posts.length}</span>
              </header>
              <div class="research-modal__posts">${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}</div>
            </section>`
          : "",
      )}
    </div>
  `;

  footerEl.innerHTML = idea
    ? html`<div class="research-modal__actions">
        <button type="button" class="ap-button primary orange" data-research-write="${idea.id}">
          <i class="ap-icon-pen"></i>
          <span>Write it</span>
        </button>
        <button type="button" class="ap-button ghost grey" data-research-skip="${idea.id}">
          <span>Not for me</span>
        </button>
      </div>`
    : "";
}
