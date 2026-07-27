// Save-drafts dialog — two choices for a batch of selected drafts: keep them
// as separate drafts, or file them into a folder. The folder picker is the DS
// Selection Dropdown (search + items + a "create new" footer), so picking an
// existing Agorapulse folder and creating a new one live in one component.
//
// Public API:
//   init()  — inject markup + bind once on app boot
//   open({ count, onConfirm })
//     • count    — number of drafts being saved (drives the title)
//     • onConfirm(folderOrNull) — null = save as separate drafts; a folder
//       object = file the drafts into it. New folders are created here
//       (addFolder via the dropdown's create item) before the callback fires.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { getFolders, addFolder } from "../folders-store.js?v=6";
import { escapeHtml } from "../utils.js?v=21";

const MODAL_ID = "saveFolder";

let backdrop,
  modal,
  titleEl,
  optionsEl,
  fieldEl,
  comboEl,
  valueEl,
  searchInput,
  itemsEl,
  footerEl,
  createBtn,
  createLabelEl,
  saveBtn,
  cancelBtn,
  closeBtn;
let initialized = false;
let pendingOnConfirm = null;
let selectedFolderId = null;

const HTML = `
<div class="app-modal-backdrop save-folder-modal__backdrop" id="saveFolderBackdrop" hidden></div>
<aside
  class="ap-dialog save-folder-modal"
  id="saveFolderModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="saveFolderTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="saveFolderTitle">Save drafts</span>
  </div>
  <button class="ap-dialog-close" type="button" id="saveFolderClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <div class="save-folder-modal__options" id="saveFolderOptions" role="radiogroup" aria-label="Where to save">
      <label class="ap-radio-card card save-folder-modal__option">
        <input type="radio" name="saveMode" value="drafts" checked />
        <div>
          <span class="ap-radio-card-title">Save as separate drafts</span>
          <span>Each draft is filed on its own in your drafts.</span>
        </div>
      </label>

      <label class="ap-radio-card card save-folder-modal__option">
        <input type="radio" name="saveMode" value="folder" />
        <div>
          <span class="ap-radio-card-title">Save to a folder</span>
          <span>Group these drafts in an Agorapulse folder.</span>
        </div>
      </label>
      <div class="save-folder-modal__field" data-field="folder" hidden>
        <details class="ap-select save-folder-modal__combo" id="saveFolderCombo">
          <summary class="ap-select-trigger">
            <span class="ap-select-value" id="saveFolderValue"><span class="ap-select-placeholder">Choose a folder…</span></span>
            <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
          </summary>
          <div class="ap-selection-dropdown save-folder-modal__dropdown">
            <div class="ap-selection-dropdown-search">
              <i class="ap-icon-search" aria-hidden="true"></i>
              <input type="text" id="saveFolderSearch" placeholder="Search or create a folder…" aria-label="Search or create a folder" />
            </div>
            <div class="ap-selection-dropdown-items" id="saveFolderItems" role="listbox" aria-label="Folders"></div>
            <div class="ap-selection-dropdown-footer" id="saveFolderFooter" hidden>
              <button type="button" class="ap-select-create" id="saveFolderCreate">
                <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
                <span id="saveFolderCreateLabel">Create folder</span>
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="saveFolderCancel">Cancel</button>
      <button type="button" class="ap-button primary blue" id="saveFolderSave">Save</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("saveFolderBackdrop");
  modal = document.getElementById("saveFolderModal");
  titleEl = document.getElementById("saveFolderTitle");
  optionsEl = document.getElementById("saveFolderOptions");
  fieldEl = optionsEl.querySelector('[data-field="folder"]');
  comboEl = document.getElementById("saveFolderCombo");
  valueEl = document.getElementById("saveFolderValue");
  searchInput = document.getElementById("saveFolderSearch");
  itemsEl = document.getElementById("saveFolderItems");
  footerEl = document.getElementById("saveFolderFooter");
  createBtn = document.getElementById("saveFolderCreate");
  createLabelEl = document.getElementById("saveFolderCreateLabel");
  saveBtn = document.getElementById("saveFolderSave");
  cancelBtn = document.getElementById("saveFolderCancel");
  closeBtn = document.getElementById("saveFolderClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  bindOverlayDismissal({ modal, backdrop, close });
  saveBtn.addEventListener("click", submit);

  optionsEl.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="saveMode"]')) return;
    syncFields();
    refreshSave();
    if (mode() === "folder") setTimeout(() => searchInput?.focus({ preventScroll: true }), 0);
  });

  // Search filters folders + drives the "create" footer.
  searchInput.addEventListener("input", renderItems);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !footerEl.hidden) {
      event.preventDefault();
      createFolderFromSearch();
    }
  });

  // Pick an existing folder (DS checkbox item; single-select for one folder).
  // Choosing one collapses the dropdown back to the trigger.
  itemsEl.addEventListener("change", (event) => {
    const cb = event.target.closest("[data-folder-id]");
    if (!cb) return;
    selectedFolderId = cb.checked ? cb.dataset.folderId : null;
    renderItems();
    updateTrigger();
    refreshSave();
    if (cb.checked) comboEl.open = false;
  });

  // Create a new folder from the typed name.
  createBtn.addEventListener("click", createFolderFromSearch);

  // Focus the search as soon as the dropdown opens.
  comboEl.addEventListener("toggle", () => {
    if (comboEl.open) setTimeout(() => searchInput?.focus({ preventScroll: true }), 0);
  });

  initialized = true;
}

function updateTrigger() {
  const f = getFolders().find((x) => x.id === selectedFolderId);
  valueEl.innerHTML = f ? escapeHtml(f.name) : `<span class="ap-select-placeholder">Choose a folder…</span>`;
}

function mode() {
  return optionsEl.querySelector('input[name="saveMode"]:checked')?.value || "drafts";
}

function syncFields() {
  fieldEl.hidden = mode() !== "folder";
}

function refreshSave() {
  saveBtn.disabled = mode() === "folder" && !selectedFolderId;
}

const norm = (s) => s.trim().toLowerCase();

function renderItems() {
  const raw = searchInput.value.trim();
  const q = norm(raw);
  const all = getFolders();
  const matches = q ? all.filter((f) => norm(f.name).includes(q)) : all;

  if (matches.length) {
    itemsEl.innerHTML = matches
      .map((f) => {
        const sel = f.id === selectedFolderId;
        return `
        <label class="ap-selection-dropdown-item">
          <span class="ap-checkbox-container">
            <input type="checkbox" data-folder-id="${escapeHtml(f.id)}" ${sel ? "checked" : ""} />
            <i></i>
          </span>
          <span class="save-folder-modal__folder-name">${escapeHtml(f.name)}</span>
          <span class="save-folder-modal__count">${f.count}</span>
        </label>`;
      })
      .join("");
  } else {
    itemsEl.innerHTML = `<div class="ap-selection-dropdown-empty">No folders match “${escapeHtml(raw)}”</div>`;
  }

  // Show the create item when there's a name typed that doesn't already exist.
  const exact = q && all.some((f) => norm(f.name) === q);
  const showCreate = q.length > 0 && !exact;
  footerEl.hidden = !showCreate;
  if (showCreate) createLabelEl.textContent = `Create “${raw}”`;
}

function createFolderFromSearch() {
  const name = searchInput.value.trim();
  if (!name) return;
  const folder = addFolder(name);
  selectedFolderId = folder.id;
  searchInput.value = "";
  renderItems();
  updateTrigger();
  refreshSave();
  comboEl.open = false;
}

function submit() {
  const m = mode();
  let folder = null;
  if (m === "folder") {
    folder = getFolders().find((f) => f.id === selectedFolderId) || null;
    if (!folder) return;
  }
  const fn = pendingOnConfirm;
  pendingOnConfirm = null;
  close();
  if (typeof fn === "function") fn(folder);
}

export function init() {
  injectOnce();
}

export function open({ count = 0, onConfirm = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  const draftWord = count === 1 ? "draft" : "drafts";
  titleEl.textContent = count ? `Save ${count} ${draftWord}` : "Save drafts";
  pendingOnConfirm = onConfirm;

  selectedFolderId = null;
  searchInput.value = "";
  comboEl.open = false;
  optionsEl.querySelector('input[value="drafts"]').checked = true;
  renderItems();
  updateTrigger();
  syncFields();
  refreshSave();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  setTimeout(() => optionsEl.querySelector('input[value="drafts"]')?.focus({ preventScroll: true }), 0);
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
