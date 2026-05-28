// Lightweight reusable confirm dialog. Same init/open/close pattern as the
// bigger modals (bug-report, feedback) but without forms — just a title,
// a body paragraph, and two buttons. Each `open()` call configures the
// instance for the current confirmation.
//
// Public API:
//   init()   — inject markup + bind once on app boot
//   open({ title, body, confirmLabel?, cancelLabel?, danger?, onConfirm })
//
// Behaviour:
//   - Confirm button fires onConfirm() then closes.
//   - Cancel button or Esc / backdrop click just closes.
//   - danger=true paints the confirm button red (ap-button danger),
//     non-danger uses primary orange.
//   - Registers with modal-coordinator so opening the dialog auto-closes
//     any other overlay (drawer, modal, shortcut legend).

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";

const MODAL_ID = "confirm";

let backdrop, modal, titleEl, bodyEl, confirmBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnConfirm = null;

const HTML = `
<div class="app-modal-backdrop confirm-modal__backdrop" id="confirmBackdrop" hidden></div>
<aside
  class="ap-dialog confirm-modal"
  id="confirmModal"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="confirmTitle"
  aria-describedby="confirmBody"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="confirmTitle">Confirm</span>
  </div>
  <button class="ap-dialog-close" type="button" id="confirmClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="confirm-modal__body" id="confirmBody"></p>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="confirmCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="confirmConfirm">Confirm</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("confirmBackdrop");
  modal = document.getElementById("confirmModal");
  titleEl = document.getElementById("confirmTitle");
  bodyEl = document.getElementById("confirmBody");
  confirmBtn = document.getElementById("confirmConfirm");
  cancelBtn = document.getElementById("confirmCancel");
  closeBtn = document.getElementById("confirmClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", () => {
    const fn = pendingOnConfirm;
    // Clear before calling so onConfirm can open a new modal without race.
    pendingOnConfirm = null;
    close();
    if (typeof fn === "function") fn();
  });
  bindOverlayDismissal({ modal, backdrop, close });

  initialized = true;
}

export function init() {
  injectOnce();
}

export function open({
  title = "Confirm action",
  body = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm = null,
} = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  titleEl.textContent = title;
  bodyEl.textContent = body;
  confirmBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  // Danger swaps the orange CTA for a red one (DS .danger modifier on
  // ap-button). Non-danger uses the standard primary CTA.
  confirmBtn.classList.toggle("danger", danger);
  confirmBtn.classList.toggle("orange", !danger);

  pendingOnConfirm = onConfirm;

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  // On a destructive confirm, the safe default is Cancel — accidentally
  // hitting Enter shouldn't trigger a delete. Otherwise focus the primary
  // action so the common path is one keystroke away.
  setTimeout(() => {
    const target = danger ? cancelBtn : confirmBtn;
    target?.focus({ preventScroll: true });
  }, 0);
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  pendingOnConfirm = null;
  notifyClose(MODAL_ID);
}
