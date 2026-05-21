// Floating status card — sits at the top-right of the conversation column
// when no right-panel is open. Surfaces what's "happening / available" in
// the active session at a glance, without forcing the user to crack open
// each panel:
//   • In progress  — Archie generating / thinking (any thread message
//                    flagged status:"loading").
//   • Sources (N)  — list of attached source filenames.
//   • Drafts  (N)  — latest draft-batch count.
//   • Outputs (N)  — extracted-ideas count.
//
// Each row is clickable and opens the matching right-panel mode. The card
// hides itself entirely when:
//   • off /session/:id routes
//   • a right-panel is already open (drafts / ideas / sources / context-brief)
//   • the session has no content yet (nothing to surface)
//
// Pattern: inject markup once into <body>, then re-render reactively as
// the underlying stores mutate (assistant thread, sources-stream, library,
// right-panel mode, sessions).

import { html, raw } from "../utils.js?v=20";
import { getPath } from "../router.js?v=21";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  openSources as openSourcesPanel,
  getMode as getRightPanelMode,
  subscribe as subscribeRightPanel,
} from "./right-panel.js?v=55";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=31";
import { getSources as getSessionSources, subscribeSources } from "../sources-stream.js?v=30";
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=27";
import { subscribe as subscribeSessions } from "../sessions-store.js?v=1";

const HTML = `
<aside class="conversation-status-card" id="conversationStatusCard" hidden aria-label="Conversation status">
  <div class="conversation-status-card__inner" data-status-card-root></div>
</aside>
`;

let rootEl = null;
let innerEl = null;
let initialized = false;

// Re-attach thread/sources/library subscriptions when the active session
// changes (route → /session/:other-id).
let lastSessionId = null;
let unsubscribeThread = null;
let unsubscribeSources = null;
let unsubscribeLibrary = null;

export function init() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper.firstElementChild);
  rootEl = document.getElementById("conversationStatusCard");
  innerEl = rootEl.querySelector("[data-status-card-root]");

  // Click delegate — one handler for all the action rows.
  rootEl.addEventListener("click", (event) => {
    const sourceItem = event.target.closest("[data-status-source]");
    if (sourceItem) {
      event.preventDefault();
      openSourcesPanel();
      return;
    }
    if (event.target.closest("[data-status-drafts]")) {
      event.preventDefault();
      openDraftsPanel(null);
      return;
    }
    if (event.target.closest("[data-status-ideas]")) {
      event.preventDefault();
      openIdeasPanel();
      return;
    }
  });

  // Global state subscriptions that don't depend on a session id.
  subscribeRightPanel(() => render());
  subscribeSessions(() => render());
  window.addEventListener("hashchange", () => {
    syncSessionSubscriptions();
    render();
  });

  syncSessionSubscriptions();
  initialized = true;
}

function syncSessionSubscriptions() {
  const sid = currentSessionId();
  if (sid === lastSessionId) return;
  if (unsubscribeThread) {
    unsubscribeThread();
    unsubscribeThread = null;
  }
  if (unsubscribeSources) {
    unsubscribeSources();
    unsubscribeSources = null;
  }
  if (unsubscribeLibrary) {
    unsubscribeLibrary();
    unsubscribeLibrary = null;
  }
  lastSessionId = sid;
  if (sid) {
    unsubscribeThread = subscribeThread(sid, () => render());
    unsubscribeSources = subscribeSources(sid, () => render());
    unsubscribeLibrary = subscribeLibrary(sid, () => render());
  }
}

export function render() {
  if (!initialized) return;
  const sid = currentSessionId();
  if (!sid) {
    hideCard();
    return;
  }
  // When any right-panel mode is open the card is redundant — the user
  // has the full panel already. Hide.
  if (getRightPanelMode()) {
    hideCard();
    return;
  }
  const thread = getThread(sid);
  const sources = getSessionSources(sid);
  const ideas = getIdeas(sid);
  const draftCount = latestDraftCount(thread);
  const pending = pendingProcesses(thread);

  // If nothing to show, hide the card altogether — an empty card is noise.
  const hasContent = pending.length > 0 || sources.length > 0 || draftCount > 0 || ideas.length > 0;
  if (!hasContent) {
    hideCard();
    return;
  }

  innerEl.innerHTML = html`
    ${raw(renderPendingSection(pending))} ${raw(renderSourcesSection(sources))}
    ${raw(renderCountsRow(draftCount, ideas.length))}
  `;
  rootEl.hidden = false;
  // Reserve right padding on the conversation column so chat bubbles
  // wrap before they collide with the overlay (CSS in
  // conversation-status-card.css).
  document.body.classList.add("has-conversation-status-card");
}

function hideCard() {
  if (rootEl) rootEl.hidden = true;
  document.body.classList.remove("has-conversation-status-card");
}

// In progress — list any thread messages currently flagged loading.
// Each pending row is non-clickable text (the user can't navigate
// "into" a generating process); just shows what's happening.
function renderPendingSection(pending) {
  if (pending.length === 0) return "";
  const rows = pending
    .map(
      (p) => `
    <div class="conversation-status-card__pending">
      <span class="ap-loader blue size-16" aria-hidden="true">
        <svg><circle></circle><circle></circle></svg>
      </span>
      <span class="conversation-status-card__pending-label">${escapeHtml(p)}</span>
    </div>
  `,
    )
    .join("");
  return `
    <section class="conversation-status-card__section">
      <h3 class="conversation-status-card__heading">In progress</h3>
      ${rows}
    </section>
  `;
}

function renderSourcesSection(sources) {
  if (sources.length === 0) return "";
  const items = sources
    .map((s) => {
      const name = s.title || s.name || s.filename || "Untitled";
      return `
      <button
        type="button"
        class="conversation-status-card__row conversation-status-card__source"
        data-status-source="${s.id}"
        title="Open Sources panel"
      >
        <i class="ap-icon-file" aria-hidden="true"></i>
        <span class="conversation-status-card__row-label">${escapeHtml(name)}</span>
      </button>
    `;
    })
    .join("");
  return `
    <section class="conversation-status-card__section">
      <h3 class="conversation-status-card__heading">
        Sources <span class="conversation-status-card__heading-count">${sources.length}</span>
      </h3>
      ${items}
    </section>
  `;
}

function renderCountsRow(draftCount, ideaCount) {
  if (draftCount === 0 && ideaCount === 0) return "";
  const draftsRow =
    draftCount > 0
      ? `
    <button type="button" class="conversation-status-card__row" data-status-drafts title="Open Drafts panel">
      <i class="ap-icon-pen" aria-hidden="true"></i>
      <span class="conversation-status-card__row-label">Drafts</span>
      <span class="ap-counter normal orange">${draftCount}</span>
    </button>
  `
      : "";
  const ideasRow =
    ideaCount > 0
      ? `
    <button type="button" class="conversation-status-card__row" data-status-ideas title="Open Outputs panel">
      <i class="ap-icon-sparkles" aria-hidden="true"></i>
      <span class="conversation-status-card__row-label">Outputs</span>
      <span class="ap-counter normal blue">${ideaCount}</span>
    </button>
  `
      : "";
  return `
    <section class="conversation-status-card__section">
      ${draftsRow}
      ${ideasRow}
    </section>
  `;
}

// Latest draft-batch count — mirrors the topbar's draft-pill logic.
function latestDraftCount(thread) {
  const latestDraft = [...thread].reverse().find((m) => m.variant === "draft");
  if (!latestDraft) return 0;
  return latestDraft.count ?? latestDraft.drafts?.length ?? 0;
}

// Collect human-readable labels for in-progress work. We only flag
// loading messages that have a meta label (e.g. "Generating drafts…",
// "Extracting ideas…") — source-intake uploading bubbles are excluded
// because they're already surfaced inline as the source row.
function pendingProcesses(thread) {
  const labels = [];
  for (const m of thread) {
    if (m.status !== "loading") continue;
    if (m.role === "source-intake") continue; // surfaced via Sources row
    const label = humanizePendingMessage(m);
    if (label) labels.push(label);
  }
  return labels;
}

function humanizePendingMessage(m) {
  if (m.role === "assistant") {
    return m.meta || "Archie is thinking…";
  }
  if (m.role === "system-notice") {
    return m.meta || m.text || "Working…";
  }
  if (m.role === "idea-extraction") {
    return `Extracting ideas from ${m.filename || "source"}…`;
  }
  if (m.role === "clip-extraction") {
    return `Extracting clips from ${m.filename || "source"}…`;
  }
  return "Working…";
}

function currentSessionId() {
  const m = /^\/session\/([^/?]+)/.exec(getPath());
  return m ? m[1] : null;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
