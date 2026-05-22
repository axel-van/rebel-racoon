// Lightweight reusable rename dialog. Same init/open/close pattern as the
// confirm-modal but with a single text input pre-filled with the current
// name. Used by the sidebar's per-row Rename action and the topbar's
// click-to-rename affordance.
//
// Public API:
//   init()   — inject markup + bind once on app boot
//   open({ title, initialName, placeholder?, confirmLabel?, onSubmit })
//
// Behaviour:
//   - Confirm fires onSubmit(trimmedName) then closes. Empty input
//     disables the Save button.
//   - Cancel button / Esc / backdrop click closes without firing.
//   - Enter inside the input submits.
//   - Input is auto-focused + full text selected on open so the user
//     can immediately overtype or accept.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";

const MODAL_ID = "rename";

let backdrop, modal, titleEl, inputEl, saveBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnSubmit = null;

const HTML = `
<div class="app-modal-backdrop rename-modal__backdrop" id="renameBackdrop" hidden></div>
<aside
  class="ap-dialog rename-modal"
  id="renameModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="renameTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <h2 class="ap-dialog-title" id="renameTitle">Rename</h2>
  </div>
  <button class="ap-dialog-close" type="button" id="renameClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <div class="ap-input-group">
      <input
        type="text"
        class="ap-input"
        id="renameInput"
        placeholder="Name…"
        aria-label="New name"
      />
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="renameCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="renameSave">Save</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("renameBackdrop");
  modal = document.getElementById("renameModal");
  titleEl = document.getElementById("renameTitle");
  inputEl = document.getElementById("renameInput");
  saveBtn = document.getElementById("renameSave");
  cancelBtn = document.getElementById("renameCancel");
  closeBtn = document.getElementById("renameClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  saveBtn.addEventListener("click", submit);

  // Enter submits, Esc closes — both scoped to the input so they don't
  // hijack the rest of the app.
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  // Disable Save while the input is empty.
  inputEl.addEventListener("input", () => {
    saveBtn.disabled = inputEl.value.trim().length === 0;
  });

  initialized = true;
}

function submit() {
  const value = inputEl.value.trim();
  if (!value) return;
  const fn = pendingOnSubmit;
  pendingOnSubmit = null;
  close();
  if (typeof fn === "function") fn(value);
}

export function init() {
  injectOnce();
}

export function open({
  title = "Rename",
  initialName = "",
  placeholder = "Name…",
  confirmLabel = "Save",
  onSubmit = null,
} = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  titleEl.textContent = title;
  inputEl.value = initialName;
  inputEl.placeholder = placeholder;
  saveBtn.textContent = confirmLabel;
  saveBtn.disabled = initialName.trim().length === 0;

  pendingOnSubmit = onSubmit;

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  // Focus the input and select the full text so the user can immediately
  // overtype the existing name.
  setTimeout(() => {
    inputEl?.focus({ preventScroll: true });
    inputEl?.select();
  }, 0);
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  pendingOnSubmit = null;
  notifyClose(MODAL_ID);
}
