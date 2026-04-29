import { html, raw } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=34";
import { renderSourceCard } from "../components/source-card.js?v=26";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=21";
import { getSources, subscribeSources, classifyFile, startFileUpload } from "../sources-stream.js?v=25";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=25";
import { isNewUser } from "../user-mode.js?v=20";
import { showToast } from "../components/toast.js?v=20";

// Lot 15 — empty in first-time mode so the sub-line "{N} ideas extracted"
// and the cards both reflect a clean slate. Returning user gets the seed.
const IDEAS = isNewUser() ? [] : MOCK_IDEAS;

// Sources view — standalone library page.
// Header (eyebrow + h1 + sub + actions) → filter rail (kinds) + search →
// drop zone + grid of SourceCards (handoff §2.2).
//
// Data: getSources() + subscribeSources() from the global sources-stream.
// Drag/drop a file anywhere on the body → kicks off the upload pipeline
// (mirrors the chat-panel drag/drop wired in Lot 3.5).
//
// The granular async ticker (queued/analyzing/analyzed/failed + progress +
// stage + ETA, per Q8) is a follow-up — today we surface the existing
// Processing/Processed states via the source-card component.

const KIND_FILTERS = [
  { id: "all", label: "All sources" },
  { id: "PDF", label: "PDFs" },
  { id: "Video", label: "Video" },
  { id: "Audio", label: "Audio" },
  { id: "URL", label: "Links" },
  { id: "Word", label: "Documents" },
  { id: "Image", label: "Images" },
  { id: "processing", label: "Processing" },
];

let unsubscribeSources = null;
let pageState = { kind: "all", query: "" };

export function renderSources(_params, target) {
  renderTopbar();
  if (unsubscribeSources) {
    unsubscribeSources();
    unsubscribeSources = null;
  }
  pageState = { kind: "all", query: "" };

  paint(target);

  unsubscribeSources = subscribeSources(() => paint(target));
}

function paint(target) {
  target.innerHTML = html`<section class="screen sources-view">${raw(renderPage())}</section>`;
  bind(target);
}

function renderPage() {
  const sources = getSources();
  const totalIdeas = IDEAS.length;
  const inFlight = sources.filter((s) => s.status === "Processing").length;
  const counts = countByKind(sources);
  const visible = filterAndSearch(sources, pageState);

  return html`
    <div class="sources-view__page">
      <header class="sources-view__head">
        <div class="sources-view__head-text">
          <div class="screen__placeholder-eyebrow">Library</div>
          <h1 class="sources-view__title">Sources</h1>
          <p class="sources-view__sub">
            ${sources.length} sources · ${totalIdeas} ideas extracted
            ${inFlight > 0 ? raw(`<span class="sources-view__sub-inflight">· ${inFlight} processing</span>`) : ""}
          </p>
        </div>
        <div class="sources-view__head-actions">
          <button type="button" class="ap-button stroked grey" data-sources-add-url>
            <i class="ap-icon-link"></i>
            <span>Add URL</span>
          </button>
          <button type="button" class="ap-button primary orange" data-sources-add>
            <i class="ap-icon-plus"></i>
            <span>Upload sources</span>
          </button>
        </div>
      </header>

      <div class="sources-view__toolbar">
        <div class="sources-view__filters" role="tablist">
          ${raw(
            KIND_FILTERS.map(
              (k) => `
                <button
                  type="button"
                  class="sources-view__filter ${pageState.kind === k.id ? "is-on" : ""}"
                  data-sources-filter="${k.id}"
                  role="tab"
                  aria-selected="${pageState.kind === k.id}"
                >${k.label} <span class="sources-view__filter-count">${counts[k.id] ?? 0}</span></button>
              `,
            ).join(""),
          )}
        </div>
        <div class="ap-input-group sources-view__search">
          <i class="ap-icon-search"></i>
          <input
            type="search"
            class="ap-input"
            placeholder="Search sources…"
            value="${escapeAttr(pageState.query)}"
            data-sources-search
          />
        </div>
      </div>

      <div class="sources-view__body" data-sources-drop-target>
        <div class="sources-view__grid">
          ${raw(renderDropTile())}
          ${visible.length === 0
            ? raw(`<div class="sources-view__empty">No sources match.</div>`)
            : raw(visible.map((s) => renderSourceCard(s, IDEAS)).join(""))}
        </div>
      </div>
    </div>
  `;
}

// Permanent drop tile at the head of the grid — encourages upload without
// requiring the user to open the Add Source modal explicitly.
function renderDropTile() {
  return `
    <button type="button" class="sources-view__drop-tile" data-sources-add>
      <span class="sources-view__drop-icon"><i class="ap-icon-upload"></i></span>
      <span class="sources-view__drop-title">Drop a file or paste a link</span>
      <span class="sources-view__drop-sub">PDFs, video, audio, transcripts, articles. Up to 100 MB.</span>
    </button>
  `;
}

function countByKind(sources) {
  const counts = { all: sources.length, processing: 0 };
  for (const s of sources) {
    counts[s.kind] = (counts[s.kind] || 0) + 1;
    if (s.status === "Processing") counts.processing += 1;
  }
  return counts;
}

function filterAndSearch(sources, { kind, query }) {
  const q = (query || "").trim().toLowerCase();
  return sources
    .filter((s) => {
      if (kind === "all") return true;
      if (kind === "processing") return s.status === "Processing";
      return s.kind === kind;
    })
    .filter((s) => !q || (s.filename || "").toLowerCase().includes(q));
}

function bind(root) {
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-sources-add]")) {
      openAddSourceModal({ tab: "upload" });
      return;
    }
    if (event.target.closest("[data-sources-add-url]")) {
      openAddSourceModal({ tab: "url" });
      return;
    }
    const filter = event.target.closest("[data-sources-filter]");
    if (filter) {
      pageState.kind = filter.dataset.sourcesFilter;
      paint(root);
      return;
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-sources-search]")) {
      pageState.query = event.target.value || "";
      // Body-only repaint so the search input doesn't lose focus on each keystroke.
      const grid = root.querySelector(".sources-view__grid");
      if (grid) {
        const visible = filterAndSearch(getSources(), pageState);
        grid.innerHTML =
          renderDropTile() +
          (visible.length === 0
            ? `<div class="sources-view__empty">No sources match.</div>`
            : visible.map((s) => renderSourceCard(s, IDEAS)).join(""));
      }
    }
  });

  // Drag/drop a file anywhere on the body → kick off the upload pipeline.
  // Mirrors the chat-panel drag/drop wired in Lot 3.5.
  const dropTarget = root.querySelector("[data-sources-drop-target]");
  if (dropTarget) {
    let dragDepth = 0;
    dropTarget.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
      dragDepth += 1;
      dropTarget.classList.add("is-drop-target");
    });
    dropTarget.addEventListener("dragover", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    dropTarget.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropTarget.classList.remove("is-drop-target");
    });
    dropTarget.addEventListener("drop", (event) => {
      if (!event.dataTransfer || !event.dataTransfer.files?.length) return;
      event.preventDefault();
      dragDepth = 0;
      dropTarget.classList.remove("is-drop-target");
      const files = Array.from(event.dataTransfer.files);
      let started = 0;
      for (const file of files) {
        const c = classifyFile(file);
        if (c.ok) {
          startFileUpload(file, c);
          started += 1;
        }
      }
      if (started > 0) {
        showToast(started === 1 ? `Uploading "${files[0].name}"…` : `Uploading ${started} files…`);
      } else {
        openAddSourceModal({ tab: "upload" });
      }
    });
  }
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
