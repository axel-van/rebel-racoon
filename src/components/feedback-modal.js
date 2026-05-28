// "Give feedback" dialog. Same module-level-state pattern as
// bug-report-modal: init() injects the markup once, then open()/close()
// toggle its visibility. No persistence — submitting shows a success flash
// and resets on close.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";

const MODAL_ID = "feedback";

let backdrop, modal, textArea, featureArea, submitBtn, textAreaError;
let initialized = false;
// Stays false until the user clicks Submit once. Avoids yelling at
// people who haven't tried yet.
let hasAttemptedSubmit = false;

const HTML = `
<div class="app-modal-backdrop feedback-modal__backdrop" id="feedbackBackdrop" hidden></div>
<aside
  class="ap-dialog feedback-modal"
  id="feedbackModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="feedbackTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="feedbackTitle">Send feedback</span>
  </div>
  <button class="ap-dialog-close" type="button" id="closeFeedbackBtn" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="feedback-modal__intro">
      Every piece of feedback gets read. For urgent support,
      <a href="mailto:support@agorapulse.com">contact the team directly</a> instead.
    </p>

    <div class="ap-form-field">
      <label for="feedbackFeatureArea">Feature area</label>
      <select id="feedbackFeatureArea" class="ap-native-select">
        <option value="content-studio">General</option>
        <option value="ideas">Ideas</option>
        <option value="posts">Drafts</option>
        <option value="brief">Playbook — Brief</option>
        <option value="voice">Playbook — Voice profile</option>
        <option value="brand">Playbook — Branding</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div class="ap-form-field">
      <label for="feedbackText">What's on your mind? <span class="bug-field__required">*</span></label>
      <textarea id="feedbackText" class="feedback-modal__textarea" rows="5" required placeholder="What worked, what didn't, what's missing…" aria-describedby="feedbackTextError"></textarea>
      <p class="form-field-error" id="feedbackTextError" role="alert" hidden>Write something before sending.</p>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="cancelFeedbackBtn">Cancel</button>
      <button type="button" class="ap-button primary orange" id="submitFeedbackBtn">Send feedback</button>
    </div>
  </div>
  <div class="feedback-modal__success">
    <div class="feedback-modal__success-icon">
      <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
      </svg>
    </div>
    <h3>Feedback sent</h3>
    <p>Every message feeds into Archie's improvements.</p>
  </div>
</aside>`;

function focusSafe(el) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function reset() {
  modal.classList.remove("success");
  textArea.value = "";
  textArea.classList.remove("invalid");
  textAreaError.hidden = true;
  featureArea.value = "content-studio";
  submitBtn.disabled = false;
  submitBtn.textContent = "Send feedback";
  hasAttemptedSubmit = false;
}

function setTextAreaInvalid(invalid) {
  textArea.classList.toggle("invalid", invalid);
  textAreaError.hidden = !invalid;
}

export function open() {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  window.setTimeout(() => focusSafe(textArea), 50);
}

function close() {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  reset();
  notifyClose(MODAL_ID);
}

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("feedbackBackdrop");
  modal = document.getElementById("feedbackModal");
  textArea = document.getElementById("feedbackText");
  textAreaError = document.getElementById("feedbackTextError");
  featureArea = document.getElementById("feedbackFeatureArea");
  submitBtn = document.getElementById("submitFeedbackBtn");

  document.getElementById("closeFeedbackBtn").addEventListener("click", close);
  document.getElementById("cancelFeedbackBtn").addEventListener("click", close);
  bindOverlayDismissal({ modal, backdrop, close });

  textArea.addEventListener("input", () => {
    if (textArea.value.trim()) setTextAreaInvalid(false);
  });
  // Re-validate on blur, but only after the user has tried once — pre-submit
  // blur shouldn't yell about a field they may still be planning to fill.
  textArea.addEventListener("blur", () => {
    if (hasAttemptedSubmit) setTextAreaInvalid(!textArea.value.trim());
  });

  submitBtn.addEventListener("click", async () => {
    hasAttemptedSubmit = true;
    const text = textArea.value.trim();
    if (!text) {
      setTextAreaInvalid(true);
      focusSafe(textArea);
      return;
    }
    setTextAreaInvalid(false);
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="feedback-modal__submit-spinner" aria-hidden="true"></span>Sending…`;
    await new Promise((r) => setTimeout(r, 1200));
    modal.classList.add("success");
    setTimeout(close, 2200);
  });
}
