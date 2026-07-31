// Add source modal — a dedicated, single-purpose dialog opened straight
// into ONE method via open({ tab }): "upload" (drop zone + file picker),
// "url" (paste a URL), or "pasteText" (paste raw text). There is no tab
// switcher — callers pick the method (e.g. the right-panel "Attach
// source" menu), and the title names it. All side-effects funnel through
// sources-stream.js so the Content panel updates in real time.
//
// Same init/open/close pattern as the other modals. State module-local;
// upload state machines live outside in sources-stream.js so they
// continue running even after the modal closes.

import { html, raw, escapeHtml } from "../utils.js?v=21";
import { iconFor } from "../file-kinds.js?v=20";
import { connectorDocs } from "../mocks.js?v=64";
import {
  getConnectors,
  findConnector,
  setConnectorStatus,
  subscribe as subscribeConnectors,
} from "../connectors-store.js?v=34";
import { postConnectPrompt } from "../assistant.js?v=66";
import { URL_SERVICES, detectUrlService } from "../url-services.js?v=1";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderConnectorLogo } from "../connectors-view.js?v=16";
import { isFlagOn } from "../feature-flags.js?v=16";
import { showToast } from "./toast.js?v=20";
import { dropzoneHTML } from "./dropzone.js?v=1";

const MODAL_ID = "addSource";
import {
  classifyFile,
  startFileUpload,
  startUrlImport,
  startTextImport,
  startConnectorImport,
  cancelUpload,
  getUploads,
  subscribeUploads,
} from "../sources-stream.js?v=59";

let backdrop, modal, contentEl, footerEl, fileInput;
let initialized = false;
let unsubscribeUploads = null;
let unsubscribeConnectors = null;
let inlineErrorTimeout = null;

const TABS = [
  { id: "upload", label: "Upload" },
  { id: "url", label: "URL" },
  { id: "pasteText", label: "Paste text" },
  { id: "connectors", label: "Connectors" },
];

// The Connectors tab is gated behind the connectors feature flag (default OFF).
function tabs() {
  return TABS.filter((t) => t.id !== "connectors" || isFlagOn("connectors"));
}

// Each method is now its own dedicated, tab-less modal — opened straight
// into one mode. The title names the method so the dialog reads as a
// single-purpose surface rather than a picker.
const TITLES = {
  upload: "Upload a file",
  url: "Add a URL",
  pasteText: "Paste text",
  connectors: "Add a source",
};

const ACCEPT = ".pdf,.doc,.docx,.txt,.md,.mp4,.mov,.mp3,.wav,.m4a,.png,.jpg,.jpeg";

// The subset surfaced as logo chips under the field (upfront "you can paste
// these" cue). Keep it short — the doc/note tools the user asked about first.
// URL_SERVICES + detectUrlService now live in the shared url-services module
// so the Fill-from-document modal recognises the same links.
const URL_SERVICE_HINTS = ["Google Docs", "Notion", "Google Drive", "YouTube", "Figma"];

function urlLogoImg(svc, size = 20) {
  return `<img class="add-source__url-logo-img" src="${escapeHtml(svc.logo)}" alt="${escapeHtml(
    svc.name,
  )}" width="${size}" height="${size}" loading="lazy" />`;
}

const state = {
  activeTab: "upload",
  urlValue: "",
  // Paste-text tab — the textarea content.
  pasteValue: "",
  inlineError: "",
  // Connector sub-state
  browsingConnectorId: null,
  selections: {}, // { connectorId: Set<docId> }
  // Upload IDs started during the current modal trip — scopes the Upload
  // tab list to "what I'm uploading right now", not the global history.
  // Reset on every open().
  tripUploadIds: new Set(),
  // Active session — sources created during this modal trip land in
  // this session's per-session list in sources-stream.
  currentSessionId: null,
  // Optional staging callbacks (Batch Studio) — see open().
  onStageText: null,
  onStageUrl: null,
  onStageFile: null,
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
    <span class="ap-dialog-title" id="addSourceTitle">Add a source</span>
  </div>
  <button class="ap-dialog-close" type="button" id="addSourceClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content add-source-modal__content" id="addSourceContent"></div>
  <div class="ap-dialog-footer add-source-modal__footer" id="addSourceFooter" hidden></div>
  <input type="file" multiple accept="${ACCEPT}" id="addSourceFileInput" hidden />
</aside>
`;

// ─── Upload tab ──────────────────────────────────────────────────────────

function tripUploads() {
  return getUploads().filter((u) => state.tripUploadIds.has(u.id));
}

function renderUploadTab() {
  const uploads = tripUploads();
  return html`
    ${raw(
      dropzoneHTML({
        id: "addSourceDropzone",
        lead: "Drop files here, or",
        sub: "PDF, Word, text, video, audio, images · Up to 100MB per file",
        // The hidden <input> stays at the modal root (stable across the
        // content re-renders); drag/drop is wired by delegation below.
        withInput: false,
      }),
    )}
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
  // Clamp progress before scaling — an out-of-range value from the
  // mock ticker (or a real backend later) would either overflow the
  // bar (>100) or invert it (<0) and look like a regression.
  const progressPct = Math.max(0, Math.min(100, u.progress || 0));
  const right =
    u.status === "uploading"
      ? `
        <div class="add-source__file-progress">
          <div class="add-source__progress"><div class="add-source__progress-bar" style="transform: scaleX(${progressPct / 100})"></div></div>
          <span class="add-source__file-meta muted">Uploading ${progressPct}%</span>
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
  // Format validation happens on blur (onFocusOut), not at render — typing
  // never scolds the user mid-URL. So the tab always renders neutral (error
  // hidden, helper shown); the Add button still reflects validity immediately.
  const showUrlError = false;
  const svc = detectUrlService(state.urlValue);
  // Upfront logo chips — show users they can paste doc/note links, not just
  // web articles. Driven by URL_SERVICE_HINTS → URL_SERVICES.
  const hintLogos = URL_SERVICE_HINTS.map((name) => URL_SERVICES.find((s) => s.name === name))
    .filter(Boolean)
    .map(
      (s) =>
        `<img src="${escapeHtml(s.logo)}" alt="" title="${escapeHtml(s.name)}" width="18" height="18" loading="lazy" />`,
    )
    .join("");
  return html`
    <div class="add-source__url">
      <div class="ap-form-field">
        <label for="addSourceUrlInput">Paste a URL</label>
        <div class="ap-input-group">
          <span class="add-source__url-logo" data-url-logo ${svc ? "" : "hidden"}>
            ${raw(svc ? urlLogoImg(svc) : "")}
          </span>
          <input
            id="addSourceUrlInput"
            type="url"
            class="${showUrlError ? "invalid" : ""}"
            placeholder="https://example.com/article"
            data-url-input
            value="${state.urlValue}"
            aria-describedby="addSourceUrlMsg"
            aria-invalid="${showUrlError ? "true" : "false"}"
          />
        </div>
        <p
          class="ap-form-message error"
          id="addSourceUrlMsg"
          data-url-error
          role="alert"
          ${showUrlError ? "" : "hidden"}
        >
          URL must start with http:// or https://
        </p>
        <p class="add-source__sub muted" data-url-hint ${showUrlError ? "hidden" : ""}>
          ${raw(
            svc
              ? `I recognised a <strong>${escapeHtml(svc.name)}</strong> link — I'll import it.`
              : "Public web pages, blog posts, YouTube videos, podcasts.",
          )}
        </p>
        <div class="add-source__url-services" aria-hidden="true">
          <span class="add-source__url-services-label muted">Also works with</span>
          <span class="add-source__url-services-logos">${raw(hintLogos)}</span>
        </div>
      </div>
    </div>
  `;
}

function isValidUrl(value) {
  if (!value) return false;
  return /^https?:\/\/[^\s]+$/.test(value.trim());
}

// Single entry point for "Add URL" (the footer button + Enter). Routes the
// validated URL one of three ways: staged back to Batch Studio, parked behind
// a connect-first prompt when the link's service isn't connected, or imported
// straight away.
function submitUrl() {
  const trimmed = state.urlValue.trim();
  if (!isValidUrl(trimmed)) return;
  // Staging mode (Batch Studio) — hand the URL back to the caller and close.
  if (state.onStageUrl) {
    const cb = state.onStageUrl;
    state.urlValue = "";
    close();
    cb(trimmed);
    return;
  }
  // Connector-backed link to a service we're not connected to → propose
  // connecting first; the import is retried from the in-chat prompt.
  if (maybeProposeConnect(trimmed)) {
    state.urlValue = "";
    return;
  }
  startUrlImport(trimmed, state.currentSessionId);
  state.urlValue = "";
  close();
  showToast("Link added — I'll fetch it now.");
}

// If the URL belongs to a connector-backed service (Slite, Notion, Google
// Docs, …) that isn't connected yet, drop a "connect it, then I'll retry the
// import" prompt into the active conversation and return true so the caller
// skips the direct import. Returns false for public links (YouTube, plain web)
// or when already connected. Needs a live session to host the prompt.
function maybeProposeConnect(url) {
  if (!state.currentSessionId) return false;
  const svc = detectUrlService(url);
  if (!svc || !svc.connectorId) return false;
  const conn = findConnector(svc.connectorId);
  if (!conn || conn.status === "connected") return false;
  postConnectPrompt(state.currentSessionId, {
    connectorId: svc.connectorId,
    connectorName: svc.name,
    logo: svc.logo,
    url,
    noun: svc.noun || "document",
  });
  close();
  return true;
}

// ─── Paste text tab ──────────────────────────────────────────────────────
//
// Lets the user drop a raw blurb straight in (alpha feedback #4 — testers
// hit friction having to "convert a text blurb to a PDF" first). Big
// textarea + a visible "Paste from clipboard" button + an "Add text" CTA.

function renderPasteTextTab() {
  const count = state.pasteValue.length;
  return html`
    <div class="add-source__paste">
      <!-- DS textarea component — .ap-textarea-field owns the field states
           (hover / blue focus / focus-visible ring); .resizable = vertical. -->
      <div class="ap-textarea-field resizable">
        <div class="add-source__paste-label-row">
          <label for="addSourcePasteInput">Paste your text</label>
          <button type="button" class="ap-button ghost blue add-source__paste-clip" data-paste-clipboard>
            <i class="ap-icon-copy"></i><span>Paste from clipboard</span>
          </button>
        </div>
        <textarea
          id="addSourcePasteInput"
          class="add-source__paste-input"
          data-paste-input
          rows="10"
          placeholder="Paste a transcript, a blog draft, notes, an email — anything Archie should read."
        >
${escapeHtml(state.pasteValue)}</textarea
        >
        <div class="add-source__paste-row">
          <span class="add-source__sub muted"
            >${count ? `${count} characters` : "No formatting needed — plain text is fine."}</span
          >
        </div>
      </div>
    </div>
  `;
}

// Commit the textarea content as a Text source. This is a dedicated,
// single-action modal: adding the text completes the task and closes —
// no separate "Done". In staging mode (Batch Studio), hand the raw text
// back to the caller instead and close.
function submitPastedText() {
  const text = state.pasteValue;
  if (!text.trim()) return;
  if (state.onStageText) {
    const cb = state.onStageText;
    state.pasteValue = "";
    close();
    cb(text);
    return;
  }
  startTextImport(text, state.currentSessionId);
  state.pasteValue = "";
  close();
  showToast("Text added — I'll read it now.");
}

// ─── Connectors tab ──────────────────────────────────────────────────────

function renderConnectorsTab() {
  if (state.browsingConnectorId) return renderConnectorBrowse();
  // Only connected connectors are browseable for docs here — connecting new
  // ones happens in the full gallery (linked below).
  const connected = getConnectors().filter((c) => c.status === "connected");
  const rows = connected.length
    ? connected.map(renderConnectorRow).join("")
    : `<li class="add-source__connectors-empty muted">No connectors connected yet — browse the gallery to add one.</li>`;
  return html`
    <ul class="add-source__connectors">
      ${raw(rows)}
    </ul>
    <button type="button" class="ap-button ghost blue add-source__browse-connectors" data-connectors-browse>
      <i class="ap-icon-view-grid"></i><span>Browse all connectors</span>
    </button>
  `;
}

function renderConnectorRow(c) {
  const isConnected = c.status === "connected";
  return `
    <li class="ap-card add-source__connector-row" data-connector-id="${escapeHtml(c.id)}">
      ${renderConnectorLogo(c, 32)}
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
  const allSelected = docs.length > 0 && docs.every((d) => sel.has(d.id));
  return html`
    <div class="add-source__breadcrumb">
      <button type="button" class="ap-button ghost grey add-source__breadcrumb-back" data-connector-back>
        <i class="ap-icon-arrow-left"></i>
        <span>Connectors</span>
      </button>
      <span class="add-source__breadcrumb-sep">/</span>
      <span class="add-source__breadcrumb-current">${c ? escapeHtml(c.name) : ""}</span>
    </div>
    ${raw(
      docs.length
        ? `<div class="add-source__doc-bulkbar">
            <label class="ap-checkbox-container add-source__doc-check">
              <input type="checkbox" data-doc-select-all ${allSelected ? "checked" : ""} aria-label="Select all" />
              <i></i>
            </label>
            <span class="add-source__doc-bulklabel">${selectedCount ? `${selectedCount} selected` : `Select all · ${docs.length} items`}</span>
          </div>`
        : "",
    )}
    <ul class="add-source__doc-list">
      ${raw(docs.map((doc) => renderDocRow(doc, sel.has(doc.id))).join(""))}
    </ul>
    <input type="hidden" data-selected-count value="${selectedCount}" />
  `;
}

// Parse "32 files" → 32; defaults to 1 when no count is present.
function folderFileCount(doc) {
  const m = /(\d+)\s+files?/i.exec(doc.size || "");
  return m ? parseInt(m[1], 10) || 1 : 1;
}

function isFolderDoc(doc) {
  return (doc.kind || "").toLowerCase() === "folder";
}

// Bulk folder ingest is capped so the proto doesn't flood the source list
// with hundreds of rows; the cap is surfaced in the import-complete toast.
const FOLDER_BATCH_CAP = 8;

// Expand the current selection into the concrete docs to import: a selected
// folder fans out into N synthetic file docs (capped), every other doc
// imports 1:1. Drives both the footer count and the actual import.
function expandSelectedDocs(connectorId) {
  const c = findConnector(connectorId);
  const docs = connectorDocs[connectorId] || [];
  const sel = state.selections[connectorId] || new Set();
  const out = [];
  for (const doc of docs) {
    if (!sel.has(doc.id)) continue;
    if (isFolderDoc(doc)) {
      const total = folderFileCount(doc);
      const n = Math.min(total, FOLDER_BATCH_CAP);
      const base = (doc.title || "Folder").replace(/\/$/, "");
      for (let i = 0; i < n; i += 1) {
        out.push({ title: `${base} / item ${i + 1}`, kind: c?.name || "File", iconKey: "file", size: c?.name || "" });
      }
    } else {
      out.push(doc);
    }
  }
  return out;
}

function expandedImportCount(connectorId) {
  return expandSelectedDocs(connectorId).length;
}

function renderDocRow(doc, selected) {
  const folder = isFolderDoc(doc);
  const icon = folder ? "ap-icon-folder" : iconFor(doc.iconKey);
  const meta = folder ? `Folder · imports ${folderFileCount(doc)} files` : escapeHtml(doc.size || doc.kind || "");
  return `
    <li class="add-source__doc-row${selected ? " selected" : ""}${folder ? " is-folder" : ""}">
      <label class="ap-checkbox-container add-source__doc-check">
        <input type="checkbox" data-doc-toggle="${escapeHtml(doc.id)}" ${selected ? "checked" : ""} />
        <i></i>
      </label>
      <span class="add-source__doc-icon" aria-hidden="true">
        <i class="${icon}"></i>
      </span>
      <div class="add-source__doc-body">
        <div class="add-source__doc-title">${escapeHtml(doc.title)}</div>
        <div class="muted">${meta}</div>
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
    // Count the real import size: a selected folder expands to its (capped)
    // file count, so the button reflects how many sources will actually land.
    const n = expandedImportCount(state.browsingConnectorId);
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button ghost grey" data-connector-back>Cancel</button>
          <button type="button" class="ap-button primary orange" data-connector-import ${sel.size === 0 ? "disabled" : ""}>
            Import ${n} ${n === 1 ? "source" : "sources"}
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

  // URL — Cancel + the primary action in the footer (ADS modal pattern),
  // not an inline button in the body. Add URL imports + closes.
  if (state.activeTab === "url") {
    const valid = isValidUrl(state.urlValue);
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button ghost grey" data-modal-close>Cancel</button>
          <button type="button" class="ap-button primary orange" data-add-url ${valid ? "" : "disabled"}>
            <span>Add URL</span>
          </button>
        </div>
      `,
    };
  }

  // Paste text — same footer pattern: Cancel + Add text.
  if (state.activeTab === "pasteText") {
    const hasText = state.pasteValue.trim().length > 0;
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button ghost grey" data-modal-close>Cancel</button>
          <button type="button" class="ap-button primary orange" data-add-text ${hasText ? "" : "disabled"}>
            <span>Add text</span>
          </button>
        </div>
      `,
    };
  }

  // Connectors list — single Done button to finish browsing.
  return {
    visible: true,
    html: `
      <div class="ap-dialog-footer-right">
        <button type="button" class="ap-button ghost grey" data-modal-close>Done</button>
      </div>
    `,
  };
}

// ─── Render ──────────────────────────────────────────────────────────────

function renderContent() {
  if (state.activeTab === "upload") contentEl.innerHTML = renderUploadTab();
  else if (state.activeTab === "url") contentEl.innerHTML = renderUrlTab();
  else if (state.activeTab === "pasteText") contentEl.innerHTML = renderPasteTextTab();
  else if (state.activeTab === "connectors") contentEl.innerHTML = renderConnectorsTab();
}

function render() {
  // No tab switcher — the modal is dedicated to whatever method it was
  // opened in. Just title it and render that one form.
  const titleEl = document.getElementById("addSourceTitle");
  if (titleEl) titleEl.textContent = TITLES[state.activeTab] || "Add a source";
  renderContent();
  renderFooter();
}

// ─── Drag & drop ─────────────────────────────────────────────────────────

let dragDepth = 0;

function onDragEnter(event) {
  event.preventDefault();
  dragDepth += 1;
  if (event.dataTransfer?.types?.includes("Files")) {
    document.getElementById("addSourceDropzone")?.classList.add("is-dragover");
  }
}

function onDragOver(event) {
  event.preventDefault();
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.getElementById("addSourceDropzone")?.classList.remove("is-dragover");
}

function onDrop(event) {
  event.preventDefault();
  dragDepth = 0;
  document.getElementById("addSourceDropzone")?.classList.remove("is-dragover");
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
  let started = 0;
  for (const file of fileList) {
    const res = classifyFile(file);
    if (!res.ok) {
      rejections.push(res.reason);
      continue;
    }
    // Staging mode (Batch Studio) — hand the file + classification back to the
    // caller so it lands in the staged-sources list instead of the global
    // upload stream. The batch screen owns the source + its lifecycle.
    if (state.onStageFile) state.onStageFile(file, res);
    else startFileUpload(file, res, state.currentSessionId);
    started += 1;
  }
  // Auto-close once an upload starts: the upload + processing already surface in
  // the page's source list underneath, so the modal's own file list would be
  // redundant. Any rejections ride out on a toast since the modal is closing.
  if (started > 0) {
    if (rejections.length > 0) showToast(formatRejectionSummary(rejections));
    close();
    return;
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
  // Close
  if (event.target.closest("#addSourceClose") || event.target.closest("[data-modal-close]")) {
    close();
    return;
  }

  // Browse all connectors → close the modal and open the gallery page.
  if (event.target.closest("[data-connectors-browse]")) {
    close();
    navigate("/connectors");
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
    submitUrl();
    return;
  }

  // Paste from clipboard → fill the textarea (best-effort; clipboard read
  // can be blocked, in which case we leave the textarea for manual paste).
  if (event.target.closest("[data-paste-clipboard]")) {
    if (navigator.clipboard?.readText) {
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text) {
            state.pasteValue = state.pasteValue ? `${state.pasteValue}\n${text}` : text;
            renderContent();
            const ta = contentEl.querySelector("[data-paste-input]");
            if (ta) {
              ta.focus();
              ta.selectionStart = ta.selectionEnd = ta.value.length;
            }
          }
        })
        .catch(() => {
          const ta = contentEl.querySelector("[data-paste-input]");
          if (ta) ta.focus();
        });
    } else {
      contentEl.querySelector("[data-paste-input]")?.focus();
    }
    return;
  }

  // Add pasted text as a source
  if (event.target.closest("[data-add-text]")) {
    submitPastedText();
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

  // Browse Import — expands selected folders into their (capped) contents so
  // a folder pick ingests in bulk, then imports every resolved doc 1:1.
  if (event.target.closest("[data-connector-import]")) {
    const cid = state.browsingConnectorId;
    if (!cid) return;
    const c = findConnector(cid);
    const sel = state.selections[cid] || new Set();
    if (sel.size === 0) return;
    const resolved = expandSelectedDocs(cid);
    for (const doc of resolved) {
      const id = startConnectorImport(c, doc, state.currentSessionId);
      state.tripUploadIds.add(id);
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
  // Select-all toggle — bulk-select / clear every doc in the connector.
  const selectAll = event.target.closest("[data-doc-select-all]");
  if (selectAll) {
    const cid = state.browsingConnectorId;
    if (!cid) return;
    const docs = connectorDocs[cid] || [];
    state.selections[cid] = selectAll.checked ? new Set(docs.map((d) => d.id)) : new Set();
    renderContent();
    renderFooter();
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
  if (event.target.matches("[data-paste-input]")) {
    state.pasteValue = event.target.value;
    // Update the char count in place (keeps the textarea caret/focus) and
    // re-render just the footer so the "Add text" button enables live —
    // renderFooter() never touches the content, so focus is preserved.
    const meta = contentEl.querySelector(".add-source__paste-row .add-source__sub");
    if (meta) {
      meta.textContent = state.pasteValue.length
        ? `${state.pasteValue.length} characters`
        : "No formatting needed — plain text is fine.";
    }
    renderFooter();
    return;
  }
  if (event.target.matches("[data-url-input]")) {
    state.urlValue = event.target.value;
    // Swap the leading affix + helper in place (renderContent would steal the
    // caret) when the pasted URL matches a known source like Google Docs or
    // Notion — live recognition feedback as the user types.
    updateUrlServiceAffix();
    // Re-render just the footer so the "Add URL" button enables live. We
    // validate the FORMAT on blur (see onFocusOut) — typing never surfaces
    // the error — but once an error is showing, clear it the moment the
    // value becomes valid so the correction feels immediate.
    if (isValidUrl(state.urlValue)) setUrlError(false);
    renderFooter();
    return;
  }
}

// Validate the URL format when the user leaves the field (inline-validation:
// validate on blur, not on every keystroke). Toggles the DS error message +
// the input's `invalid` state in place, swapping the helper out while invalid.
function onFocusOut(event) {
  if (!event.target.matches?.("[data-url-input]")) return;
  const trimmed = state.urlValue.trim();
  setUrlError(trimmed.length > 0 && !isValidUrl(trimmed));
}

// Reflect the detected service (or none) into the field's leading logo affix
// and helper line, in place — called on every keystroke so it can't disturb
// the caret. Leaves the error/hint visibility to setUrlError.
function updateUrlServiceAffix() {
  const svc = detectUrlService(state.urlValue);
  const logoEl = contentEl.querySelector("[data-url-logo]");
  if (logoEl) {
    logoEl.innerHTML = svc ? urlLogoImg(svc) : "";
    logoEl.hidden = !svc;
  }
  const hintEl = contentEl.querySelector("[data-url-hint]");
  if (hintEl) {
    hintEl.innerHTML = svc
      ? `I recognised a <strong>${escapeHtml(svc.name)}</strong> link — I'll import it.`
      : "Public web pages, blog posts, YouTube videos, podcasts.";
  }
}

function setUrlError(show) {
  const errorEl = contentEl.querySelector("[data-url-error]");
  if (errorEl) errorEl.hidden = !show;
  const hintEl = contentEl.querySelector("[data-url-hint]");
  if (hintEl) hintEl.hidden = show;
  const input = contentEl.querySelector("[data-url-input]");
  if (input) {
    input.classList.toggle("invalid", show);
    input.setAttribute("aria-invalid", show ? "true" : "false");
  }
}

function onKeydown(event) {
  if (!modal.classList.contains("open")) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  // Dropzone is a <div role="button">; Enter/Space must trigger the file
  // picker the same way a click does (line 485 below).
  if ((event.key === "Enter" || event.key === " ") && event.target.id === "addSourceDropzone") {
    event.preventDefault();
    fileInput.value = "";
    fileInput.click();
    return;
  }
  // Submit pasted text with Cmd/Ctrl+Enter (plain Enter inserts newlines).
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && event.target.matches("[data-paste-input]")) {
    event.preventDefault();
    submitPastedText();
    return;
  }
  // Submit URL with Enter
  if (event.key === "Enter" && event.target.matches("[data-url-input]")) {
    event.preventDefault();
    submitUrl();
  }
}

// ─── Open / close ────────────────────────────────────────────────────────

export function open(opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  state.activeTab = opts.tab && tabs().find((t) => t.id === opts.tab) ? opts.tab : "upload";
  state.browsingConnectorId = null;
  state.inlineError = "";
  // Reset trip-scoped state — each open starts a fresh "what I'm uploading
  // right now" list. Past trips' uploads still live in the global store and
  // are visible in the dashboard Content panel, just not in the modal.
  state.tripUploadIds = new Set();
  state.pasteValue = "";
  state.selections = {};
  // Active session — sources created during this modal trip land in
  // this session's per-session list in sources-stream.
  state.currentSessionId = opts.currentSessionId || null;
  // Optional staging callbacks — when set (e.g. the Batch Studio intake),
  // pasted text / a URL is handed back to the caller to stage instead of
  // imported straight into a session, and the modal closes after one add.
  state.onStageText = opts.onStageText || null;
  state.onStageUrl = opts.onStageUrl || null;
  state.onStageFile = opts.onStageFile || null;
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
      // Only the Upload tab lists in-flight uploads; URL / Paste text no longer
      // show an "Added so far" history, so they don't repaint on upload changes.
      if (state.activeTab === "upload") {
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
  contentEl = document.getElementById("addSourceContent");
  footerEl = document.getElementById("addSourceFooter");
  fileInput = document.getElementById("addSourceFileInput");

  modal.addEventListener("click", onClick);
  modal.addEventListener("change", onChange);
  modal.addEventListener("input", onInput);
  modal.addEventListener("focusout", onFocusOut);
  modal.addEventListener("dragenter", onDragEnter);
  modal.addEventListener("dragover", onDragOver);
  modal.addEventListener("dragleave", onDragLeave);
  modal.addEventListener("drop", onDrop);

  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
}
