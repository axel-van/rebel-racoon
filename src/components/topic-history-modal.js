// "Topic history" — what the scan recorded, and what this reader did about it.
//
//   init()                 — inject markup + bind once on app boot
//   openTopicHistory(id)   — open it for one Topic
//
// ── Why a dialog rather than a section in the article ─────────────────────
// The trail used to be the article's last band, a collapsed DS accordion. Two
// problems with that. It spent the reading surface's ONE framed box on the only
// thing there that is not part of the argument — the reading order is facts, then
// the analysis, then the evidence it was written from, and only then what
// happened to the Topic. And 38 of the 50 Topics that have a trail have a SINGLE
// entry, so the box, the heading and the counter existed to defer one line of
// provenance.
//
// Behind the header's kebab it costs nothing until it is asked for, and the frame
// it gave up is what the two triage facts now wear.
//
// ⚠️ This is the FEED's placement. The picker dialog cannot open it — it is
// already the active overlay, and `requestOpen` closes the active overlay, so a
// modal launched from inside the picker would close the picker on the way. The
// dialog swaps to a history VIEW instead. Both render `renderTopicTrail`, so the
// trail says one thing in two places; only the placement differs, which is the
// same split the article's identity and verbs already use.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1213";
import { escapeHtml } from "../utils.js?v=1213";
import { getTopicById, topicTitle } from "../topics-store.js?v=1213";
import { renderTopicTrail } from "../topic-article.js?v=1213";

const MODAL_ID = "topic-history";

let backdrop, modal, subEl, bodyEl, closeBtn, doneBtn;
let initialized = false;

const HTML = `
<div class="app-modal-backdrop topic-history__backdrop" id="topicHistoryBackdrop" hidden></div>
<aside
  class="ap-dialog topic-history"
  id="topicHistoryModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="topicHistoryTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="topicHistoryTitle">Topic history</span>
  </div>
  <button class="ap-dialog-close" type="button" id="topicHistoryClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="topic-history__sub" id="topicHistorySub"></p>
    <div id="topicHistoryBody"></div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="topicHistoryDone">Close</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("topicHistoryBackdrop");
  modal = document.getElementById("topicHistoryModal");
  subEl = document.getElementById("topicHistorySub");
  bodyEl = document.getElementById("topicHistoryBody");
  closeBtn = document.getElementById("topicHistoryClose");
  doneBtn = document.getElementById("topicHistoryDone");

  closeBtn.addEventListener("click", close);
  doneBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  // ⚠️ CAPTURE, and it stops propagation — not bindOverlayDismissal.
  // The feed's own Escape handler also sits on `document`, and it is registered
  // LATER (on screen mount, versus this one at boot), so it runs after this one
  // in the bubble phase. Any state this handler checks — `body.has-modal`, the
  // coordinator's activeId, the `.open` class — has already been cleared by the
  // time it looks, so one keypress closed this dialog AND the article behind it,
  // leaving the reader two steps back from one press. Capturing on `document`
  // and stopping the event is the only ordering-proof answer, and it is the same
  // shape the Image Studio's in-body confirmation uses for the same reason.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !modal.classList.contains("open")) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    true,
  );

  initialized = true;
}

export function init() {
  injectOnce();
}

export function openTopicHistory(topicId) {
  injectOnce();
  const topic = getTopicById(topicId);
  // A Topic with no trail has no dialog: the kebab that opens this is not even
  // rendered in that case, so this only guards a stale click.
  if (!topic || !(topic.history || []).length) return;
  requestOpen(MODAL_ID, close);

  // Naming the Topic is what stops this reading as a generic log. The reader came
  // from an article; the dialog has to say which one it is the trail of.
  subEl.innerHTML = `“${escapeHtml(topicTitle(topic))}”`;
  bodyEl.innerHTML = renderTopicTrail(topic);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  setTimeout(() => doneBtn?.focus({ preventScroll: true }), 0);
}

export function close() {
  if (!initialized) return;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  notifyClose(MODAL_ID);
}
