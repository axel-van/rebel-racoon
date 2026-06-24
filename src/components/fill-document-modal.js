// Fill-from-document dialog. Lets the user (re-)fill a Playbook's sections
// from a document — either by dropping/browsing a file, or pasting a link
// (Google Docs / Drive). Same init/open/close pattern as the other modals.
//
// Public API:
//   init()                              — inject markup + bind once on app boot
//   open({ onConfirm })                 — onConfirm({ file, url })
//
// Behaviour:
//   - Drop a file or click to browse; or paste a document URL.
//   - "Fill from document" is enabled once a file is chosen or a URL typed;
//     it fires onConfirm({ file, url }) then closes. A warning notes the
//     overwrite. Cancel / Esc / backdrop / close-X dismiss without firing.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { dropzoneHTML, bindDropzone } from "./dropzone.js?v=1";
import { detectUrlService } from "../url-services.js?v=1";

const MODAL_ID = "fill-document";
const ACCEPT = ".pdf,.doc,.docx,.txt,.md,.rtf,.pptx,.csv";

let backdrop, modal, dropEl, fileInput, fileChip, fileNameEl, urlInput, urlGroup, confirmBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnConfirm = null;
let selectedFile = null;
// Element focused before the dialog opened — focus returns here on close so
// keyboard users land back where they were (escape-routes / focus-management).
let lastFocused = null;

const HTML = `
<div class="app-modal-backdrop fill-document-modal__backdrop" id="fillDocBackdrop" hidden></div>
<aside
  class="ap-dialog fill-document-modal"
  id="fillDocModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="fillDocTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="fillDocTitle">Fill from a document</span>
  </div>
  <button class="ap-dialog-close" type="button" id="fillDocClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="fill-document-modal__lead">
      Drop a brand doc or paste a link — I'll read it and rebuild every section of this Playbook.
    </p>
    ${dropzoneHTML({
      id: "fillDocDrop",
      lead: "Drag a file here, or",
      sub: "PDF, Word, text, slides, CSV",
      accept: ACCEPT,
      inputId: "fillDocFile",
      compact: true,
    })}
    <div class="fill-document-modal__file" id="fillDocFileChip" hidden>
      <i class="ap-icon-file--text" aria-hidden="true"></i>
      <span class="fill-document-modal__file-name" id="fillDocFileName"></span>
      <button type="button" class="fill-document-modal__file-remove" id="fillDocFileRemove" aria-label="Remove file">
        <i class="ap-icon-close"></i>
      </button>
    </div>
    <div class="fill-document-modal__or"><span>or</span></div>
    <div class="ap-input-group fill-document-modal__url" id="fillDocUrlGroup">
      <i class="ap-icon-link" aria-hidden="true"></i>
      <input type="text" id="fillDocUrl" placeholder="Paste a Google Docs or Drive link…" aria-label="Document link" />
    </div>
    <div class="ap-infobox warning fill-document-modal__warn">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">This replaces all current sections of the Playbook.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="fillDocCancel">Cancel</button>
      <button type="button" class="ap-button primary blue" id="fillDocConfirm" disabled>
        <i class="ap-icon-archie-official"></i><span>Fill from document</span>
      </button>
    </div>
  </div>
</aside>`;

function syncConfirm() {
  confirmBtn.disabled = !(selectedFile || urlInput.value.trim());
}

// Same recognition as the Add-URL modal: when the pasted link matches a known
// source (Google Docs, Drive, Notion, …) swap the leading link icon for that
// service's logo. The prefix is the input group's first child (the DS
// `.ap-input-group > i` icon), swapped in place; falls back to the link icon.
function updateUrlPrefix() {
  if (!urlGroup) return;
  const prefix = urlGroup.firstElementChild;
  if (!prefix) return;
  const svc = detectUrlService(urlInput.value);
  prefix.outerHTML = svc
    ? `<img class="fill-document-modal__url-logo" src="${svc.logo}" alt="${svc.name}" width="18" height="18" loading="lazy" />`
    : `<i class="ap-icon-link" aria-hidden="true"></i>`;
}

function setFile(file) {
  selectedFile = file || null;
  if (selectedFile) {
    fileNameEl.textContent = selectedFile.name || "Document";
    fileChip.hidden = false;
    dropEl.hidden = true;
  } else {
    fileChip.hidden = true;
    dropEl.hidden = false;
    fileInput.value = "";
  }
  syncConfirm();
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("fillDocBackdrop");
  modal = document.getElementById("fillDocModal");
  dropEl = document.getElementById("fillDocDrop");
  fileInput = document.getElementById("fillDocFile");
  fileChip = document.getElementById("fillDocFileChip");
  fileNameEl = document.getElementById("fillDocFileName");
  urlInput = document.getElementById("fillDocUrl");
  urlGroup = document.getElementById("fillDocUrlGroup");
  confirmBtn = document.getElementById("fillDocConfirm");
  cancelBtn = document.getElementById("fillDocCancel");
  closeBtn = document.getElementById("fillDocClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  confirmBtn.addEventListener("click", submit);

  // Click / keyboard / drag-drop on the shared dropzone.
  bindDropzone(modal, { onFiles: (files) => setFile(files[0]) });
  document.getElementById("fillDocFileRemove").addEventListener("click", (e) => {
    e.stopPropagation();
    setFile(null);
  });

  urlInput.addEventListener("input", () => {
    syncConfirm();
    updateUrlPrefix();
  });
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });

  // Esc closes from anywhere in the dialog (not just the URL field). Guarded
  // by the open state so it's inert when the modal is closed.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      e.preventDefault();
      close();
    }
  });

  initialized = true;
}

function submit() {
  const url = urlInput.value.trim();
  if (!selectedFile && !url) return;
  const fn = pendingOnConfirm;
  const payload = { file: selectedFile, url };
  pendingOnConfirm = null;
  close();
  if (typeof fn === "function") fn(payload);
}

export function init() {
  injectOnce();
}

export function open({ onConfirm = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  pendingOnConfirm = onConfirm;
  setFile(null);
  urlInput.value = "";
  syncConfirm();
  updateUrlPrefix();

  lastFocused = document.activeElement;
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  // Move focus into the dialog so keyboard/AT users start inside it.
  requestAnimationFrame(() => dropEl?.focus());
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  pendingOnConfirm = null;
  selectedFile = null;
  notifyClose(MODAL_ID);
  // Return focus to the trigger.
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}
