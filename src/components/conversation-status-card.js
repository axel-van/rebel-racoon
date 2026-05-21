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
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=28";
import { subscribe as subscribeSessions } from "../sessions-store.js?v=1";
import { addMention } from "../composer-mentions.js?v=1";

const HTML = `
<aside class="conversation-status-card" id="conversationStatusCard" hidden aria-label="Conversation status">
  <div class="conversation-status-card__inner" data-status-card-root></div>
</aside>
`;

// User preference — the topbar info-button toggles the card visibility.
// Default ON; stored as "0" in localStorage when explicitly hidden so a
// missing key still resolves to "show".
const STORAGE_KEY = "archie-status-card-visible";
const visibilityListeners = new Set();

export function isEnabled() {
  return localStorage.getItem(STORAGE_KEY) !== "0";
}

export function setEnabled(on) {
  if (on) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, "0");
  visibilityListeners.forEach((fn) => {
    try {
      fn(on);
    } catch {}
  });
  render();
}

export function toggle() {
  setEnabled(!isEnabled());
}

// Subscribe to visibility-pref changes so the topbar can repaint its
// info button's pressed state. Returns an unsubscribe fn.
export function subscribeVisibility(fn) {
  visibilityListeners.add(fn);
  return () => visibilityListeners.delete(fn);
}

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
    // Source row → push the filename as a mention pill into the composer.
    // The composer renders the pills inline at the top of its card (cf.
    // session.js + composer-mentions.js). More visible than an inline
    // `@filename` token.
    const sourceMention = event.target.closest("[data-status-source-mention]");
    if (sourceMention) {
      event.preventDefault();
      const sid = currentSessionId();
      if (sid) addMention(sid, sourceMention.dataset.statusSourceMention);
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
  // User has dismissed the card via the topbar info button.
  if (!isEnabled()) {
    hideCard();
    return;
  }
  const thread = getThread(sid);
  const sources = getSessionSources(sid);
  const ideas = getIdeas(sid);
  const draftCount = latestDraftCount(thread);
  const pending = pendingProcesses(thread);

  // The card is always shown on /session/:id when no right-panel is open —
  // empty sections render an "—" placeholder so the user has a reliable
  // status anchor (and discovers the affordance to access Drafts/Outputs
  // panels even on a brand-new chat).

  innerEl.innerHTML = html`
    ${raw(renderPendingSection(pending))} ${raw(renderSourcesSection(sources))} ${raw(renderOutputsRow(ideas.length))}
    ${raw(renderDraftsRow(draftCount))}
  `;
  rootEl.hidden = false;
}

function hideCard() {
  if (rootEl) rootEl.hidden = true;
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
  const heading = `
    <h3 class="conversation-status-card__heading">
      Sources <span class="conversation-status-card__heading-count">${sources.length}</span>
    </h3>
  `;
  if (sources.length === 0) {
    return `
      <section class="conversation-status-card__section">
        ${heading}
        <div class="conversation-status-card__empty conversation-status-card__empty--block">
          None yet — attach a file or URL to get started
        </div>
      </section>
    `;
  }
  const items = sources
    .map((s) => {
      const name = s.title || s.name || s.filename || "Untitled";
      // Two stacked icons in the leading slot — file at rest, copy on
      // hover. The CSS swap-on-hover lives in
      // styles/components/conversation-status-card.css.
      return `
      <button
        type="button"
        class="conversation-status-card__row conversation-status-card__source"
        data-status-source-mention="${escapeAttr(name)}"
        title="Click to mention in the composer"
      >
        <span class="conversation-status-card__row-icons" aria-hidden="true">
          <i class="ap-icon-file conversation-status-card__row-icon-rest"></i>
          <i class="ap-icon-copy conversation-status-card__row-icon-hover"></i>
        </span>
        <span class="conversation-status-card__row-label">${escapeHtml(name)}</span>
      </button>
    `;
    })
    .join("");
  return `
    <section class="conversation-status-card__section">
      ${heading}
      ${items}
    </section>
  `;
}

function renderOutputsRow(ideaCount) {
  const trailing =
    ideaCount > 0
      ? `<span class="ap-counter normal blue">${ideaCount}</span>`
      : `<span class="conversation-status-card__empty">None yet</span>`;
  return `
    <section class="conversation-status-card__section">
      <button type="button" class="conversation-status-card__row" data-status-ideas title="Open Outputs panel">
        <i class="ap-icon-sparkles" aria-hidden="true"></i>
        <span class="conversation-status-card__row-label">Outputs</span>
        ${trailing}
      </button>
    </section>
  `;
}

function renderDraftsRow(draftCount) {
  const trailing =
    draftCount > 0
      ? `<span class="ap-counter normal orange">${draftCount}</span>`
      : `<span class="conversation-status-card__empty">None yet</span>`;
  return `
    <section class="conversation-status-card__section">
      <button type="button" class="conversation-status-card__row" data-status-drafts title="Open Drafts panel">
        <i class="ap-icon-pen" aria-hidden="true"></i>
        <span class="conversation-status-card__row-label">Drafts</span>
        ${trailing}
      </button>
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

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
