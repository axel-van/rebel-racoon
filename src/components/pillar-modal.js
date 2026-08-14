// New pillar dialog. CREATE ONLY — there is no edit mode and there must not be
// one.
//
// Editing a pillar happens on the pillar's own page, in place, beside the
// context, the assets and the trail it is about. A dialog could only ever offer
// the name and one sentence, which is the smallest and least useful part of a
// pillar; the pen on a pillar card therefore NAVIGATES rather than opening
// anything. The Playbook page draws the same line for the same reason.
//
// Three fields and no seed picker. "Start it from a topic / a chat / nothing"
// was tried and removed: matching runs from the moment the pillar exists, so
// seeding it by hand answers a question nobody has.
//
// ── Name AND description are required ──────────────────────────────────────
// The description is not a nicety here — it is the seed the matcher reads until
// the first topic lands, so a pillar created without one matches nothing and
// looks broken for a week. It is the one field whose absence is invisible at the
// moment it is skipped, which is exactly what a required field is for.
//
// The infobox sits LAST, above the footer, because it describes what happens
// AFTER this form is submitted. Between the fields it read as an instruction
// about the field above it and split the form in two.
//
// Assets are optional and use the same `.ap-dropzone` the pillar page uses, so
// the field a user meets first is the field they meet later.
//
// Public API:
//   init()
//   open({ playbookId?, onDone? })

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { escapeAttr } from "../utils.js?v=21";
import { getActivePlaybookId } from "../active-playbook.js?v=19";
import { addPillar, assetKindFor } from "../pillars-store.js?v=6";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "pillar";

let backdrop, modal, titleEl, nameEl, aboutEl, saveBtn, cancelBtn, closeBtn, dropzone, fileInput, fileList;
let initialized = false;
let state = { assets: [], onDone: null };

const HTML = `
<div class="app-modal-backdrop pillar-modal__backdrop" id="pillarBackdrop" hidden></div>
<aside
  class="ap-dialog pillar-modal"
  id="pillarModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pillarModalTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="pillarModalTitle">New pillar</span>
  </div>
  <button class="ap-dialog-close" type="button" id="pillarClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content pillar-modal__content">
    <!-- Placeholders describe WHAT TO WRITE rather than showing one brand's
         answer. A worked example ("Sustainable wardrobe") reads as the expected
         answer and gets copied; a description of the shape does not. -->
    <div class="ap-form-field">
      <label for="pillarName">Name it</label>
      <div class="ap-input-group">
        <input type="text" id="pillarName" placeholder="A short name for the theme, as you'd say it out loud" />
      </div>
    </div>
    <div class="ap-form-field">
      <label for="pillarAbout">What is this pillar about?</label>
      <div class="ap-textarea-field resizable">
        <textarea
          id="pillarAbout"
          rows="5"
          placeholder="What it covers, the angle you take on it, and anything I should never say about it. A few sentences is plenty — I'll build on this as topics and chats come in."
        ></textarea>
      </div>
    </div>
    <div class="ap-form-field">
      <label for="pillarAssets">Assets for this pillar <span class="pillar-modal__opt">optional</span></label>
      <div class="ap-dropzone ap-dropzone--compact pillar-modal__drop" id="pillarDropzone" data-dropzone role="button" tabindex="0"
        aria-label="Drop files here, or browse">
        <span class="ap-dropzone__icon"><i class="ap-icon-upload" aria-hidden="true"></i></span>
        <span class="ap-dropzone__text">
          <span class="ap-dropzone__title">Drop files here, or <span class="ap-dropzone__browse">browse</span></span>
          <span class="ap-dropzone__sub">Images, video, PDF, docs · up to 100 MB each</span>
        </span>
        <input type="file" class="ap-dropzone__input" id="pillarAssets" multiple hidden />
      </div>
      <ul class="pillar-modal__files" id="pillarFiles"></ul>
    </div>
    <div class="ap-infobox info pillar-modal__note">
      <i class="ap-icon-info_fill"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">
            From your description, topics from your feed and content from your chats will be matched to
            continuously nurture the pillar. You can review what's included any time and add your own assets and
            notes.
          </span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="pillarCancel">Cancel</button>
      <button type="button" class="ap-button primary blue" id="pillarSave">Create pillar</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("pillarBackdrop");
  modal = document.getElementById("pillarModal");
  titleEl = document.getElementById("pillarModalTitle");
  nameEl = document.getElementById("pillarName");
  aboutEl = document.getElementById("pillarAbout");
  saveBtn = document.getElementById("pillarSave");
  cancelBtn = document.getElementById("pillarCancel");
  closeBtn = document.getElementById("pillarClose");
  dropzone = document.getElementById("pillarDropzone");
  fileInput = document.getElementById("pillarAssets");
  fileList = document.getElementById("pillarFiles");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  saveBtn.addEventListener("click", submit);

  nameEl.addEventListener("input", syncSave);
  aboutEl.addEventListener("input", syncSave);
  // Enter moves ON to the description rather than submitting past it — the
  // description is required, and a keyboard user who types a name and presses
  // Enter should land in the next field, not bounce off a disabled button.
  nameEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (aboutEl.value.trim()) submit();
      else aboutEl.focus();
    }
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  dropzone.addEventListener("click", (event) => {
    if (event.target.closest(".ap-dropzone__input")) return;
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    takeFiles([...(event.dataTransfer?.files || [])]);
  });
  fileInput.addEventListener("change", () => {
    takeFiles([...(fileInput.files || [])]);
    fileInput.value = "";
  });

  initialized = true;
}

function takeFiles(files) {
  for (const f of files) state.assets.push({ name: f.name, kind: assetKindFor(f.name), size: "—" });
  paintFiles();
}

function paintFiles() {
  fileList.innerHTML = state.assets
    .map(
      (a, i) => `
      <li class="pillar-modal__file">
        <i class="${a.kind === "image" ? "ap-icon-image" : a.kind === "video" ? "ap-icon-video" : "ap-icon-file"}"></i>
        <span>${escapeAttr(a.name)}</span>
        <button type="button" class="ap-icon-button transparent" data-drop-file="${i}" aria-label="Remove ${escapeAttr(a.name)}">
          <i class="ap-icon-close"></i>
        </button>
      </li>`,
    )
    .join("");
  fileList.querySelectorAll("[data-drop-file]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.assets.splice(Number(btn.getAttribute("data-drop-file")), 1);
      paintFiles();
    });
  });
}

function syncSave() {
  saveBtn.disabled = nameEl.value.trim().length === 0 || aboutEl.value.trim().length === 0;
}

function submit() {
  const name = nameEl.value.trim();
  const about = aboutEl.value.trim();
  // Both, not just the name: Enter in the name field submits, so this is the
  // guard the disabled button cannot provide on its own.
  if (!name || !about) return;
  // The Playbook is not asked here any more: a pillar belongs to whichever brand
  // the rail is scoped to, and asking again would let the dialog disagree with
  // the switcher two inches to its left.
  const { onDone, assets } = state;
  close();
  addPillar({ name, about, playbookId: getActivePlaybookId(), assets });
  showToast(`Created “${name}”`);
  if (typeof onDone === "function") onDone();
}

export function init() {
  injectOnce();
}

export function open({ playbookId = null, onDone = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  state = { assets: [], onDone };

  titleEl.textContent = "New pillar";
  saveBtn.textContent = "Create pillar";
  nameEl.value = "";
  aboutEl.value = "";
  paintFiles();
  syncSave();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  window.setTimeout(() => {
    nameEl.focus();
    nameEl.select();
  }, 0);
}

export function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  state.onDone = null;
  notifyClose(MODAL_ID);
}
