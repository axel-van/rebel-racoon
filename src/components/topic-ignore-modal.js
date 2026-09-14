// "Why did this Topic miss the mark?" — the reason a reader gives when they
// ignore a Topic.
//
//   init()                            — inject markup + bind once on app boot
//   openIgnoreReason(topicId, onDone) — onDone(reason) fires on submit
//
// ── Why a dialog and not a one-click Ignore ────────────────────────────────
// The reason is the only thing a reader ever TELLS Archie about the listening.
// Everything else on the feed is a decision about one Topic; this is the one
// input that says something about the feed itself. It is also what makes the
// Ignored state readable afterwards — the card prints it back, so an ignored
// Topic explains itself instead of just being absent.
//
// The version this was ported from carried a "Don't show this again" checkbox,
// which turned Ignore into a one-click action with no reason. That contradicted
// the same feature's own promise that the reason is kept and shown, and it
// manufactured ignored Topics with nothing to print. So the dialog always opens
// — and the field is OPTIONAL instead, which is the honest way to keep the
// friction low.
//
// Submit is `stroked grey`, not a red destructive primary: ignoring hides a Topic
// that ticking Ignored in the filter brings straight back, so nothing is
// destroyed and red would flag a danger that is not there. The primary slot is
// deliberately empty — there is no action here worth spotlighting.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1187";
import { escapeHtml } from "../utils.js?v=1187";
import { getTopicById, topicTitle } from "../topics-store.js?v=1187";

const MODAL_ID = "topic-ignore";

let backdrop, modal, subEl, inputEl, submitBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnDone = null;

const HTML = `
<div class="app-modal-backdrop topic-ignore__backdrop" id="topicIgnoreBackdrop" hidden></div>
<aside
  class="ap-dialog topic-ignore"
  id="topicIgnoreModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="topicIgnoreTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="topicIgnoreTitle">Why did this Topic miss the mark?</span>
  </div>
  <button class="ap-dialog-close" type="button" id="topicIgnoreClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="topic-ignore__sub" id="topicIgnoreSub"></p>
    <div class="ap-form-field">
      <label for="topicIgnoreInput">What was off about it? (optional)</label>
      <textarea
        class="ap-textarea topic-ignore__input"
        id="topicIgnoreInput"
        rows="3"
        placeholder="Wrong audience, already covered, not our tone…"
      ></textarea>
    </div>
    <div class="ap-infobox">
      <i class="ap-icon-info"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message"
            >An ignored Topic stays off this list even if it starts trending or gets updated. Tick
            <strong>Ignored</strong> in Filters to see it again.</span
          >
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="topicIgnoreCancel">Cancel</button>
      <button type="button" class="ap-button stroked grey" id="topicIgnoreSubmit">
        <i class="ap-icon-eye-off"></i><span>Ignore</span>
      </button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("topicIgnoreBackdrop");
  modal = document.getElementById("topicIgnoreModal");
  subEl = document.getElementById("topicIgnoreSub");
  inputEl = document.getElementById("topicIgnoreInput");
  submitBtn = document.getElementById("topicIgnoreSubmit");
  cancelBtn = document.getElementById("topicIgnoreCancel");
  closeBtn = document.getElementById("topicIgnoreClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  submitBtn.addEventListener("click", submit);

  // Cmd/Ctrl+Enter submits — a plain Enter belongs to the textarea, which is
  // multi-line. Esc closes.
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Kept from the surfaces underneath: the feed's own Escape closes the open
      // article, and one press must not take both.
      event.stopPropagation();
      close();
    }
  });

  initialized = true;
}

function submit() {
  const reason = inputEl.value.trim();
  const fn = pendingOnDone;
  pendingOnDone = null;
  close();
  if (typeof fn === "function") fn(reason);
}

export function init() {
  injectOnce();
}

export function openIgnoreReason(topicId, onDone = null) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  const topic = getTopicById(topicId);
  // Naming the Topic is what stops this reading as a generic prompt: the reader
  // came from a list, and the dialog has to say which row it is about.
  subEl.innerHTML = topic ? `“${escapeHtml(topicTitle(topic))}”` : "";
  inputEl.value = "";
  pendingOnDone = onDone;

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  setTimeout(() => inputEl?.focus({ preventScroll: true }), 0);
}

export function close() {
  if (!initialized) return;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  pendingOnDone = null;
  notifyClose(MODAL_ID);
}
