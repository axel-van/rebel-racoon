// Add source modal — opened from the dashboard's "+ Add source" button.
// Three tabs: Upload (drop zone + file picker), URL (paste a URL), and
// Connectors (Slite/Notion/GDrive/Slack browse). All side-effects funnel
// through sources-stream.js so the dashboard's Content panel updates in
// real time.
//
// Same init/open/close pattern as the other modals. State module-local;
// upload state machines live outside in sources-stream.js so they
// continue running even after the modal closes.

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { iconFor } from "../file-kinds.js?v=20";
import { connectorDocs } from "../mocks.js?v=31";
import {
  getConnectors,
  findConnector,
  setConnectorStatus,
  subscribe as subscribeConnectors,
} from "../connectors-store.js?v=21";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";

const MODAL_ID = "addSource";
import {
  classifyFile,
  startFileUpload,
  startUrlImport,
  startConnectorImport,
  cancelUpload,
  getUploads,
  subscribeUploads,
} from "../sources-stream.js?v=30";

let backdrop, modal, tabsEl, contentEl, footerEl, fileInput;
let initialized = false;
let unsubscribeUploads = null;
let unsubscribeConnectors = null;
let inlineErrorTimeout = null;

const TABS = [
  { id: "upload", label: "Upload" },
  { id: "url", label: "URL" },
  { id: "connectors", label: "Connectors" },
];

const ACCEPT = ".pdf,.doc,.docx,.txt,.md,.mp4,.mov,.mp3,.wav,.m4a,.png,.jpg,.jpeg";

const state = {
  activeTab: "upload",
  urlValue: "",
  inlineError: "",
  // Connector sub-state
  browsingConnectorId: null,
  selections: {}, // { connectorId: Set<docId> }
  // Upload IDs started during the current modal trip — scopes the Upload
  // tab list to "what I'm uploading right now", not the global history.
  // Reset on every open().
  tripUploadIds: new Set(),
  // Mini-history of URLs added in this modal session
  urlHistory: [], // [{ uploadId }]
  // Active session — sources created during this modal trip land in
  // this session's per-session list in sources-stream.
  currentSessionId: null,
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Markup ──────────────────────────────────────────────────────────────

const HTML = `
<div class="app-modal-backdrop add-source-modal__backdrop" id="addSourceBackdrop" hidden></div>
<aside
  class="ap-dialog add-source-modal"
  id="addSourceModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="addSourceTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <h2 class="ap-dialog-title" id="addSourceTitle">Add source</h2>
  </div>
  <button class="ap-dialog-close" type="button" id="addSourceClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-tabs add-source-modal__tabs" id="addSourceTabs"></div>
  <div class="ap-dialog-content add-source-modal__content" id="addSourceContent"></div>
  <div class="ap-dialog-footer add-source-modal__footer" id="addSourceFooter" hidden></div>
  <input type="file" multiple accept="${ACCEPT}" id="addSourceFileInput" hidden />
</aside>
`;

// ─── Tabs nav ────────────────────────────────────────────────────────────

function renderTabs() {
  tabsEl.innerHTML = `
    <div class="ap-tabs-nav">
      ${TABS.map(
        (t) => `
          <button type="button" class="ap-tabs-tab ${t.id === state.activeTab ? "active" : ""}" data-add-source-tab="${t.id}">
            ${escapeHtml(t.label)}
          </button>
        `,
      ).join("")}
    </div>
  `;
}

// ─── Upload tab ──────────────────────────────────────────────────────────

function tripUploads() {
  return getUploads().filter((u) => state.tripUploadIds.has(u.id));
}

function renderUploadTab() {
  const uploads = tripUploads();
  return html`
    <div class="add-source__dropzone" id="addSourceDropzone" tabindex="0" role="button" aria-label="Upload files">
      <div class="add-source__dropzone-icon"><i class="ap-icon-upload"></i></div>
      <p class="add-source__dropzone-primary">Drop files here or click to browse</p>
      <p class="add-source__dropzone-sub muted">PDF, Word, text, video, audio, images · Up to 100MB per file</p>
    </div>
    ${raw(
      state.inlineError
        ? `<div class="ap-infobox error add-source__error"><span>${escapeHtml(state.inlineError)}</span></div>`
        : "",
    )}
    ${raw(uploads.length ? `<ul class="add-source__file-list">${uploads.map(renderUploadRow).join("")}</ul>` : "")}
  `;
}

function renderUploadRow(u) {
  const showRemove = u.status !== "done";
  const right =
    u.status === "uploading"
      ? `
        <div class="add-source__file-progress">
          <div class="add-source__progress"><div class="add-source__progress-bar" style="transform: scaleX(${u.progress / 100})"></div></div>
          <span class="add-source__file-meta muted">Uploading ${u.progress}%</span>
        </div>
      `
      : u.status === "processing"
        ? `
          <span class="ap-status blue add-source__file-status">
            <span class="add-source__file-spinner" aria-hidden="true"></span>
            Processing
          </span>
        `
        : `
          <span class="ap-status green add-source__file-status">
            <i class="ap-icon-check" aria-hidden="true"></i>
            Ready
          </span>
        `;
  return `
    <li class="add-source__file-row" data-upload-id="${escapeHtml(u.id)}">
      <span class="add-source__file-icon" aria-hidden="true">
        <i class="${iconFor(u.iconKey)}"></i>
      </span>
      <div class="add-source__file-body">
        <div class="add-source__file-name" title="${escapeHtml(u.name)}">${escapeHtml(u.name)}</div>
        <div class="add-source__file-meta muted">${escapeHtml(u.size || "")}</div>
      </div>
      <div class="add-source__file-right">
        ${right}
        ${
          showRemove
            ? `<button type="button" class="ap-icon-button transparent grey" data-upload-cancel="${escapeHtml(u.id)}" aria-label="Remove">
          <i class="ap-icon-close"></i>
        </button>`
            : ""
        }
      </div>
    </li>
  `;
}

// ─── URL tab ─────────────────────────────────────────────────────────────

function renderUrlTab() {
  const valid = isValidUrl(state.urlValue);
  // Inline format error — shown only when the user has typed something that
  // isn't a valid URL. While the input is empty we keep the slate clean
  // (the `Add URL` button stays disabled and the sub-text hint covers
  // expectations). FIND-A1: stop the silent disable that left the user
  // wondering why the button never reacted.
  const trimmed = state.urlValue.trim();
  const showUrlError = trimmed.length > 0 && !valid;
  return html`
    <div class="add-source__url">
      <div class="ap-form-field">
        <label for="addSourceUrlInput">Paste a URL</label>
        <div class="add-source__url-row">
          <div class="ap-input-group">
            <input
              id="addSourceUrlInput"
              type="url"
              placeholder="https://example.com/article"
              data-url-input
              value="${state.urlValue}"
              aria-describedby="addSourceUrlError"
              aria-invalid="${showUrlError ? "true" : "false"}"
            />
          </div>
          <button type="button" class="ap-button primary orange" data-add-url ${valid ? "" : "disabled"}>
            <span>Add URL</span>
          </button>
        </div>
        <div
          id="addSourceUrlError"
          class="ap-infobox error add-source__url-error"
          data-url-error
          role="alert"
          ${showUrlError ? "" : "hidden"}
        >
          <span data-url-error-text>URL must start with http:// or https://</span>
        </div>
        <p class="add-source__sub muted">Public web pages, blog posts, YouTube videos, podcasts.</p>
      </div>
      ${raw(state.urlHistory.length ? renderUrlHistory() : "")}
    </div>
  `;
}

function renderUrlHistory() {
  const uploads = getUploads();
  const items = state.urlHistory.map((entry) => uploads.find((u) => u.id === entry.uploadId)).filter(Boolean);
  if (items.length === 0) return "";
  return `
    <div class="add-source__url-history">
      <h4 class="add-source__url-history-title">Added in this session</h4>
      <ul class="add-source__file-list">
        ${items.map(renderUploadRow).join("")}
      </ul>
    </div>
  `;
}

function isValidUrl(value) {
  if (!value) return false;
  return /^https?:\/\/[^\s]+$/.test(value.trim());
}

// ─── Connectors tab ──────────────────────────────────────────────────────

function renderConnectorsTab() {
  if (state.browsingConnectorId) return renderConnectorBrowse();
  return html`
    <ul class="add-source__connectors">
      ${raw(getConnectors().map(renderConnectorRow).join(""))}
    </ul>
  `;
}

function renderConnectorRow(c) {
  const isConnected = c.status === "connected";
  return `
    <li class="ap-card add-source__connector-row" data-connector-id="${escapeHtml(c.id)}">
      <img class="add-source__connector-logo" src="${escapeHtml(c.logo)}" alt="" width="32" height="32" />
      <div class="add-source__connector-body">
        <div class="add-source__connector-title">${escapeHtml(c.name)}</div>
        <div class="muted">${escapeHtml(c.desc)}</div>
      </div>
      <div class="add-source__connector-action">
        ${
          isConnected
            ? `<button type="button" class="ap-button primary orange" data-connector-browse="${escapeHtml(c.id)}">Browse</button>`
            : `<button type="button" class="ap-button stroked grey" data-connector-connect="${escapeHtml(c.id)}">Connect</button>`
        }
      </div>
    </li>
  `;
}

function renderConnectorBrowse() {
  const c = findConnector(state.browsingConnectorId);
  const docs = connectorDocs[state.browsingConnectorId] || [];
  const sel = state.selections[state.browsingConnectorId] || new Set();
  const selectedCount = sel.size;
  return html`
    <div class="add-source__breadcrumb">
      <button type="button" class="ap-button transparent grey add-source__breadcrumb-back" data-connector-back>
        <i class="ap-icon-arrow-left"></i>
        <span>Connectors</span>
      </button>
      <span class="add-source__breadcrumb-sep">/</span>
      <span class="add-source__breadcrumb-current">${c ? escapeHtml(c.name) : ""}</span>
    </div>
    <ul class="add-source__doc-list">
      ${raw(docs.map((doc) => renderDocRow(doc, sel.has(doc.id))).join(""))}
    </ul>
    <input type="hidden" data-selected-count value="${selectedCount}" />
  `;
}

function renderDocRow(doc, selected) {
  return `
    <li class="add-source__doc-row${selected ? " selected" : ""}">
      <label class="ap-checkbox-container add-source__doc-check">
        <input type="checkbox" data-doc-toggle="${escapeHtml(doc.id)}" ${selected ? "checked" : ""} />
        <i></i>
      </label>
      <span class="add-source__doc-icon" aria-hidden="true">
        <i class="${iconFor(doc.iconKey)}"></i>
      </span>
      <div class="add-source__doc-body">
        <div class="add-source__doc-title">${escapeHtml(doc.title)}</div>
        <div class="muted">${escapeHtml(doc.size || doc.kind || "")}</div>
      </div>
    </li>
  `;
}

// ─── Footer ──────────────────────────────────────────────────────────────

function renderFooter() {
  const f = footerForState();
  footerEl.hidden = !f.visible;
  footerEl.innerHTML = f.html;
}

function footerForState() {
  // Connector browse sub-screen has its own footer (Cancel + Import N).
  if (state.activeTab === "connectors" && state.browsingConnectorId) {
    const sel = state.selections[state.browsingConnectorId] || new Set();
    const n = sel.size;
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button transparent grey" data-connector-back>Cancel</button>
          <button type="button" class="ap-button primary orange" data-connector-import ${n === 0 ? "disabled" : ""}>
            Import ${n} item${n === 1 ? "" : "s"}
          </button>
        </div>
      `,
    };
  }

  if (state.activeTab === "upload") {
    const ups = tripUploads();
    if (ups.length === 0) return { visible: false, html: "" };
    const inflight = ups.filter((u) => u.status !== "done").length;
    const ready = ups.filter((u) => u.status === "done").length;
    if (inflight === 0) {
      return {
        visible: true,
        html: `
          <div class="ap-dialog-footer-right">
            <button type="button" class="ap-button primary orange" data-modal-close>Done</button>
          </div>
        `,
      };
    }
    const summary = `${inflight} file${inflight === 1 ? "" : "s"} uploading${ready ? ` · ${ready} ready` : ""}`;
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-left muted">${summary}</div>
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button stroked grey" data-modal-close>Done</button>
        </div>
      `,
    };
  }

  // URL + connectors list — single Done button.
  return {
    visible: true,
    html: `
      <div class="ap-dialog-footer-right">
        <button type="button" class="ap-button transparent grey" data-modal-close>Done</button>
      </div>
    `,
  };
}

// ─── Render ──────────────────────────────────────────────────────────────

function renderContent() {
  if (state.activeTab === "upload") contentEl.innerHTML = renderUploadTab();
  else if (state.activeTab === "url") contentEl.innerHTML = renderUrlTab();
  else if (state.activeTab === "connectors") contentEl.innerHTML = renderConnectorsTab();
}

function render() {
  renderTabs();
  renderContent();
  renderFooter();
}

// ─── Drag & drop ─────────────────────────────────────────────────────────

let dragDepth = 0;

function onDragEnter(event) {
  event.preventDefault();
  dragDepth += 1;
  if (event.dataTransfer?.types?.includes("Files")) {
    document.getElementById("addSourceDropzone")?.classList.add("drag-over");
  }
}

function onDragOver(event) {
  event.preventDefault();
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.getElementById("addSourceDropzone")?.classList.remove("drag-over");
}

function onDrop(event) {
  event.preventDefault();
  dragDepth = 0;
  document.getElementById("addSourceDropzone")?.classList.remove("drag-over");
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) return;
  // Auto-switch to Upload tab on drop.
  state.activeTab = "upload";
  state.browsingConnectorId = null;
  ingestFiles(files);
}

function ingestFiles(fileList) {
  // FIND-D4: drop the silent "first error wins" pattern. When the user
  // drops 5 files and 3 fail validation, we now build a summary
  // ("3 files were rejected: <first reason>, …") so they know more than
  // one was filtered. The detailed reasons stay machine-readable for
  // future surfacing (e.g. a per-row error list).
  const rejections = [];
  for (const file of fileList) {
    const res = classifyFile(file);
    if (!res.ok) {
      rejections.push(res.reason);
      continue;
    }
    const id = startFileUpload(file, res, state.currentSessionId);
    state.tripUploadIds.add(id);
  }
  if (rejections.length > 0) {
    showInlineError(formatRejectionSummary(rejections));
  }
  render();
}

function formatRejectionSummary(rejections) {
  if (rejections.length === 1) return rejections[0];
  // First reason verbatim (already includes filename + cause), then a
  // count of the rest so the message stays one line on the infobox.
  const [first, ...rest] = rejections;
  return `${first} (and ${rest.length} other${rest.length === 1 ? "" : "s"} rejected)`;
}

function showInlineError(message) {
  state.inlineError = message;
  if (inlineErrorTimeout) clearTimeout(inlineErrorTimeout);
  inlineErrorTimeout = setTimeout(() => {
    state.inlineError = "";
    if (state.activeTab === "upload") renderContent();
  }, 4000);
}

// ─── Click + change handlers ─────────────────────────────────────────────

function onClick(event) {
  // Tab nav
  const tab = event.target.closest("[data-add-source-tab]");
  if (tab) {
    state.activeTab = tab.dataset.addSourceTab;
    state.browsingConnectorId = null;
    state.inlineError = "";
    render();
    return;
  }

  // Close
  if (event.target.closest("#addSourceClose") || event.target.closest("[data-modal-close]")) {
    close();
    return;
  }

  // Dropzone click → trigger file picker
  if (event.target.closest("#addSourceDropzone")) {
    fileInput.value = ""; // allow re-selecting the same file
    fileInput.click();
    return;
  }

  // Cancel an upload
  const cancelBtn = event.target.closest("[data-upload-cancel]");
  if (cancelBtn) {
    cancelUpload(cancelBtn.dataset.uploadCancel);
    return;
  }

  // URL submit
  if (event.target.closest("[data-add-url]")) {
    const trimmed = state.urlValue.trim();
    if (!isValidUrl(trimmed)) return;
    const uploadId = startUrlImport(trimmed, state.currentSessionId);
    state.tripUploadIds.add(uploadId);
    state.urlHistory.unshift({ uploadId });
    state.urlValue = "";
    renderContent();
    renderFooter();
    return;
  }

  // Connector connect — go through connectors-store so the settings drawer
  // stays in sync (FIND-01).
  const connectBtn = event.target.closest("[data-connector-connect]");
  if (connectBtn) {
    const id = connectBtn.dataset.connectorConnect;
    const existing = findConnector(id);
    if (existing) {
      setConnectorStatus(id, {
        status: "connected",
        account: existing.account || "matt@archie.io",
        lastSync: "just now",
      });
      renderContent();
    }
    return;
  }

  // Connector browse
  const browseBtn = event.target.closest("[data-connector-browse]");
  if (browseBtn) {
    state.browsingConnectorId = browseBtn.dataset.connectorBrowse;
    if (!state.selections[state.browsingConnectorId]) {
      state.selections[state.browsingConnectorId] = new Set();
    }
    render();
    return;
  }

  // Browse back / cancel
  if (event.target.closest("[data-connector-back]")) {
    state.browsingConnectorId = null;
    render();
    return;
  }

  // Browse Import
  if (event.target.closest("[data-connector-import]")) {
    const cid = state.browsingConnectorId;
    if (!cid) return;
    const c = findConnector(cid);
    const docs = connectorDocs[cid] || [];
    const sel = state.selections[cid] || new Set();
    if (sel.size === 0) return;
    for (const doc of docs) {
      if (sel.has(doc.id)) {
        const id = startConnectorImport(c, doc, state.currentSessionId);
        state.tripUploadIds.add(id);
      }
    }
    state.selections[cid] = new Set();
    state.browsingConnectorId = null;
    render();
    return;
  }
}

function onChange(event) {
  if (event.target === fileInput) {
    const files = Array.from(fileInput.files || []);
    if (files.length) ingestFiles(files);
    return;
  }
  // Doc selection toggle
  const docToggle = event.target.closest("[data-doc-toggle]");
  if (docToggle) {
    const cid = state.browsingConnectorId;
    if (!cid) return;
    const sel = state.selections[cid] || new Set();
    if (docToggle.checked) sel.add(docToggle.dataset.docToggle);
    else sel.delete(docToggle.dataset.docToggle);
    state.selections[cid] = sel;
    // Re-render to update the row "selected" class + footer Import N count.
    renderContent();
    renderFooter();
    return;
  }
}

function onInput(event) {
  if (event.target.matches("[data-url-input]")) {
    state.urlValue = event.target.value;
    // Just enable/disable the Add URL button — re-render only the button state.
    const btn = contentEl.querySelector("[data-add-url]");
    const valid = isValidUrl(state.urlValue);
    if (btn) btn.toggleAttribute("disabled", !valid);
    // Toggle the inline format error in place so the input keeps focus +
    // caret position. Only surface the error after the user has typed
    // something — empty input stays neutral.
    const trimmed = state.urlValue.trim();
    const showError = trimmed.length > 0 && !valid;
    const errorEl = contentEl.querySelector("[data-url-error]");
    if (errorEl) errorEl.hidden = !showError;
    if (event.target.setAttribute) event.target.setAttribute("aria-invalid", showError ? "true" : "false");
    return;
  }
}

function onKeydown(event) {
  if (!modal.classList.contains("open")) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  // Submit URL with Enter
  if (event.key === "Enter" && event.target.matches("[data-url-input]")) {
    event.preventDefault();
    const trimmed = state.urlValue.trim();
    if (!isValidUrl(trimmed)) return;
    const uploadId = startUrlImport(trimmed, state.currentSessionId);
    state.tripUploadIds.add(uploadId);
    state.urlHistory.unshift({ uploadId });
    state.urlValue = "";
    renderContent();
    renderFooter();
  }
}

// ─── Open / close ────────────────────────────────────────────────────────

export function open(opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  state.activeTab = opts.tab && TABS.find((t) => t.id === opts.tab) ? opts.tab : "upload";
  state.browsingConnectorId = null;
  state.inlineError = "";
  // Reset trip-scoped state — each open starts a fresh "what I'm uploading
  // right now" list. Past trips' uploads still live in the global store and
  // are visible in the dashboard Content panel, just not in the modal.
  state.tripUploadIds = new Set();
  state.urlHistory = [];
  state.selections = {};
  // Active session — sources created during this modal trip land in
  // this session's per-session list in sources-stream.
  state.currentSessionId = opts.currentSessionId || null;
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  // Subscribe to upload changes — re-render the upload list + footer.
  // Sources are created directly in the active session's per-session
  // list (currentSessionId passed to startFileUpload/startUrlImport/
  // startConnectorImport), so no separate attach callback is needed.
  if (!unsubscribeUploads) {
    unsubscribeUploads = subscribeUploads(() => {
      if (state.activeTab === "upload" || (state.activeTab === "url" && state.urlHistory.length)) {
        renderContent();
      }
      renderFooter();
    });
  }

  // Subscribe to connector changes too — if the user toggles a connector in
  // the settings drawer while this modal is open, the Connectors tab needs
  // to repaint to match. (FIND-01.)
  if (!unsubscribeConnectors) {
    unsubscribeConnectors = subscribeConnectors(() => {
      if (state.activeTab === "connectors" && !state.browsingConnectorId) {
        renderContent();
      }
    });
  }
  render();
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  if (unsubscribeUploads) {
    unsubscribeUploads();
    unsubscribeUploads = null;
  }
  if (unsubscribeConnectors) {
    unsubscribeConnectors();
    unsubscribeConnectors = null;
  }
  notifyClose(MODAL_ID);
}

// ─── Init ────────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("addSourceBackdrop");
  modal = document.getElementById("addSourceModal");
  tabsEl = document.getElementById("addSourceTabs");
  contentEl = document.getElementById("addSourceContent");
  footerEl = document.getElementById("addSourceFooter");
  fileInput = document.getElementById("addSourceFileInput");

  modal.addEventListener("click", onClick);
  modal.addEventListener("change", onChange);
  modal.addEventListener("input", onInput);
  modal.addEventListener("dragenter", onDragEnter);
  modal.addEventListener("dragover", onDragOver);
  modal.addEventListener("dragleave", onDragLeave);
  modal.addEventListener("drop", onDrop);

  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
}
