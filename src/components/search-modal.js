// Conversation search modal — opened from the sidebar's "Search…" nav row.
// Mirrors Claude's pattern: a single text input + filtered list of conversations
// + keyboard navigation (↑/↓/Enter/Esc). Replaces the inline search input that
// used to live in the sidebar between the nav block and the conversation list.
//
// Public API:
//   init()  — inject markup + bind once on app boot.
//   open()  — show the modal, focus the input, render the full list.
//   close() — hide + reset state.
//
// Behaviour:
//   - Filters getSessions() by name (case-insensitive substring) on each keystroke.
//   - Empty input → full list, grouped Pinned / Recent (same shape as the sidebar).
//   - Empty-state when nothing matches: "No conversations match".
//   - ↑ / ↓ move the highlighted row (wraps at the edges).
//   - Enter navigates to /session/:id of the highlighted row, then close().
//   - Esc + backdrop click + close button → close() without navigation.
//   - Mousemove over a result steals the highlight; click navigates + closes.
//   - Subscribes to the sessions-store so the result list refreshes if a session
//     is renamed / deleted from elsewhere while the modal is open.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { navigate } from "../router.js?v=21";
import { getSessions, subscribe as subscribeSessions } from "../sessions-store.js?v=1";
import { getContextById } from "../contexts-store.js?v=28";

const MODAL_ID = "search";

let backdrop, modal, inputEl, resultsEl;
let initialized = false;
let isOpen = false;
let highlightIndex = 0;
let lastFocus = null;

const HTML = `
<div class="app-modal-backdrop search-modal__backdrop" id="searchBackdrop" hidden></div>
<aside
  class="ap-dialog search-modal"
  id="searchModal"
  role="dialog"
  aria-modal="true"
  aria-label="Search conversations"
  aria-hidden="true"
>
  <div class="ap-dialog-header search-modal__header">
    <div class="search-modal__input-row">
      <i class="ap-icon-search search-modal__input-icon" aria-hidden="true"></i>
      <input
        type="text"
        class="search-modal__input"
        id="searchModalInput"
        placeholder="Search conversations…"
        aria-label="Search conversations"
        aria-controls="searchModalResults"
        autocomplete="off"
      />
      <kbd class="search-modal__kbd">Esc</kbd>
    </div>
  </div>
  <div
    class="ap-dialog-content search-modal__results"
    id="searchModalResults"
    role="listbox"
    aria-label="Conversations"
  ></div>
</aside>
`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("searchBackdrop");
  modal = document.getElementById("searchModal");
  inputEl = document.getElementById("searchModalInput");
  resultsEl = document.getElementById("searchModalResults");

  backdrop.addEventListener("click", close);

  inputEl.addEventListener("input", () => {
    highlightIndex = 0;
    renderResults();
  });

  inputEl.addEventListener("keydown", (event) => {
    const results = currentResultButtons();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightIndex = (highlightIndex + 1) % results.length;
      syncHighlight();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightIndex = (highlightIndex - 1 + results.length) % results.length;
      syncHighlight();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const sid = results[highlightIndex]?.dataset.searchResult;
      if (sid) {
        close();
        navigate(`/session/${sid}`);
      }
    }
  });

  // Hover / click on a result.
  resultsEl.addEventListener("mousemove", (event) => {
    const btn = event.target.closest("[data-search-result]");
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (Number.isNaN(idx) || idx === highlightIndex) return;
    highlightIndex = idx;
    syncHighlight();
  });

  resultsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-search-result]");
    if (!btn) return;
    const sid = btn.dataset.searchResult;
    if (!sid) return;
    close();
    navigate(`/session/${sid}`);
  });

  // Live-refresh when the underlying sessions store mutates. Only re-render
  // when the modal is open so we don't do work for nothing.
  subscribeSessions(() => {
    if (!isOpen) return;
    // Cap the highlight so it doesn't fall off the new list length.
    const len = currentFiltered().length;
    if (highlightIndex >= len) highlightIndex = Math.max(0, len - 1);
    renderResults();
  });

  // Global ⌘K / Ctrl+K — open the modal from anywhere (matches Claude /
  // Linear / Raycast / Slack). Intentionally NOT skipped on inputs /
  // textareas / contenteditable: ⌘K is the canonical "navigate anywhere"
  // shortcut and should win over the surface the user is currently on.
  // No-op if the modal is already open so re-pressing the shortcut
  // doesn't reset the input mid-query.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "k" && event.key !== "K") return;
    if (!(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (isOpen) return;
    open();
  });

  initialized = true;
}

function currentResultButtons() {
  return resultsEl ? Array.from(resultsEl.querySelectorAll("[data-search-result]")) : [];
}

function currentFiltered() {
  const q = (inputEl?.value || "").trim().toLowerCase();
  const all = getSessions();
  return q ? all.filter((s) => (s.name || "").toLowerCase().includes(q)) : all;
}

function syncHighlight() {
  const buttons = currentResultButtons();
  buttons.forEach((btn, i) => {
    const active = i === highlightIndex;
    btn.classList.toggle("is-highlighted", active);
    btn.setAttribute("aria-selected", String(active));
    if (active) btn.scrollIntoView({ block: "nearest" });
  });
}

function renderResults() {
  if (!resultsEl) return;
  const filtered = currentFiltered();
  if (filtered.length === 0) {
    const all = getSessions();
    const msg = all.length === 0 ? "No conversations yet" : "No conversations match";
    resultsEl.innerHTML = `
      <div class="search-modal__empty">
        <span class="search-modal__empty-text">${msg}</span>
      </div>
    `;
    return;
  }
  const pinned = filtered.filter((s) => s.pinned);
  const unpinned = filtered.filter((s) => !s.pinned);
  let i = 0;
  let html = "";
  if (pinned.length > 0) {
    html += `<div class="search-modal__group-heading">Pinned</div>`;
    html += pinned.map((s) => renderResultRow(s, i++)).join("");
  }
  if (unpinned.length > 0) {
    html += `<div class="search-modal__group-heading">Recent</div>`;
    html += unpinned.map((s) => renderResultRow(s, i++)).join("");
  }
  resultsEl.innerHTML = html;
  syncHighlight();
}

function renderResultRow(session, index) {
  const ctx = session.contextId ? getContextById(session.contextId) : null;
  const color = ctx?.color || "grey";
  const safeName = escapeHtml(session.name || "Untitled conversation");
  const isHighlighted = index === highlightIndex;
  // Pinned status is conveyed by the "Pinned" group heading above the row,
  // so no per-row pin glyph (Raycast/Linear pattern). The trailing slot
  // carries the ↩ keycap, only visible when the row is highlighted to
  // signal "Enter opens this".
  return `
    <button
      type="button"
      class="search-modal__result ${isHighlighted ? "is-highlighted" : ""}"
      role="option"
      aria-selected="${isHighlighted}"
      data-search-result="${session.id}"
      data-index="${index}"
    >
      <span
        class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${color}"
        aria-hidden="true"
      ></span>
      <span class="search-modal__result-title">${safeName}</span>
      <span class="search-modal__result-meta" aria-hidden="true">
        <kbd class="search-modal__result-kbd">↵</kbd>
      </span>
    </button>
  `;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function init() {
  injectOnce();
}

export function open() {
  injectOnce();
  requestOpen(MODAL_ID, close);

  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  inputEl.value = "";
  highlightIndex = 0;
  renderResults();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  isOpen = true;

  // Focus the input on the next frame so the platform actually applies the
  // focus (the modal becomes visible in the same tick).
  setTimeout(() => inputEl?.focus({ preventScroll: true }), 0);
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  isOpen = false;
  notifyClose(MODAL_ID);
  // Return focus to whatever opened us (typically the Search… nav row) so
  // keyboard users don't get teleported to <body>.
  if (lastFocus && typeof lastFocus.focus === "function") {
    try {
      lastFocus.focus({ preventScroll: true });
    } catch {}
  }
  lastFocus = null;
}
