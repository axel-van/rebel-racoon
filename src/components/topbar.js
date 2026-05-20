import { html, raw } from "../utils.js?v=20";
import { getPath } from "../router.js?v=21";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
import { toggleSidebar } from "./sidebar.js?v=32";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  openSources as openSourcesPanel,
  closePanel as closeRightPanel,
  getMode as getRightPanelMode,
  getActiveBatchRef as getActiveDraftsBatchRef,
  subscribe as subscribeRightPanel,
} from "./right-panel.js?v=52";
import { getSources as getSessionSources, subscribeSources } from "../sources-stream.js?v=28";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=28";
import { recentSessions } from "../mocks.js?v=29";

// Persistent top bar.
//
// Layout (Lot 11 refactor — feedback from user 2026-04-28):
//   • Far left  — sidebar-toggle button (mirrors the sidebar's own collapse
//     control so the chrome stays reachable in any state) + route-derived
//     title
//   • Right     — Drafts pill + Ideas pill (only on /session/:id, drives the
//     right-panel modes). Nothing else.
//
// The Archie wordmark moved to the global sidebar at Lot 2.1. Feedback /
// Report a bug / Keyboard shortcuts / Settings moved out of the topbar at
// Lot 11 — they now live in the sidebar footer popmenu (cf. sidebar.js).
// The "?" key shortcut for the keyboard legend stays globally bound so
// power users keep their muscle memory.

export function renderTopbar(_options = {}) {
  const el = document.getElementById("topbar");
  if (!el) return;
  const onSession = isSessionRoute();
  const rpMode = getRightPanelMode();
  const draftCount = onSession ? latestDraftCount() : 0;
  // Empty conversation = no user turn yet. Used to disable Ideas (which is
  // global content but not relevant before the user has even started) and
  // — combined with draftCount — Drafts (no drafts produced for this chat).
  const isEmpty = onSession ? isEmptyConversation() : true;
  el.innerHTML = html`
    <div class="app-topbar__left">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-topbar-sidebar-toggle
        aria-label="Toggle sidebar (⌘B)"
        title="Toggle sidebar (⌘B)"
      >
        <i class="ap-icon-view-list"></i>
      </button>
      <h1 class="app-topbar__title">${raw(currentTitle())}</h1>
    </div>
    <div class="app-topbar__right">${raw(onSession ? renderSessionPills(rpMode, draftCount, isEmpty) : "")}</div>
  `;
}

function isEmptyConversation() {
  const sid = currentSessionId();
  if (!sid) return true;
  const thread = getThread(sid);
  return thread.every((m) => m.role !== "user");
}

// Bind once at startup — the topbar DOM node is persistent.
export function initTopbar() {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-topbar-sidebar-toggle]")) {
      toggleSidebar();
      return;
    }
    // Drafts pill — toggle the right panel between Drafts mode and closed.
    // If the panel is open in Ideas mode, switch to Drafts (don't close).
    if (event.target.closest("[data-topbar-drafts]")) {
      const mode = getRightPanelMode();
      if (mode === "drafts") {
        closeRightPanel();
      } else {
        const sessionId = currentSessionId();
        let activeRef = getActiveDraftsBatchRef();
        if (sessionId) {
          const thread = getThread(sessionId);
          const latestDraft = [...thread].reverse().find((m) => m.variant === "draft");
          if (latestDraft) activeRef = { sessionId, messageId: latestDraft.id };
        }
        openDraftsPanel(activeRef);
      }
      return;
    }
    if (event.target.closest("[data-topbar-ideas]")) {
      const mode = getRightPanelMode();
      if (mode === "ideas") closeRightPanel();
      else openIdeasPanel();
      return;
    }
    if (event.target.closest("[data-topbar-sources]")) {
      const mode = getRightPanelMode();
      if (mode === "sources") closeRightPanel();
      else openSourcesPanel();
      return;
    }
  });

  // Re-render the topbar whenever the right panel state changes so the
  // pills reflect the live mode (.is-on accent flips).
  subscribeRightPanel(() => renderTopbar());

  // Re-render on hash change so pills re-derive per-route state.
  window.addEventListener("hashchange", () => renderTopbar());

  // When the active session's thread updates (new drafts land), re-render
  // so the Drafts pill badge reflects the latest count. Re-attach when the
  // route changes to a different session. Same goes for inputs (attached
  // sources) — drives the Sources pill counter.
  let lastSessionId = null;
  let unsubscribeThread = null;
  let unsubscribeSources = null;
  function syncThreadSubscription() {
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
    lastSessionId = sid;
    if (sid) {
      unsubscribeThread = subscribeThread(sid, () => renderTopbar());
      unsubscribeSources = subscribeSources(sid, () => renderTopbar());
    }
  }
  syncThreadSubscription();
  window.addEventListener("hashchange", syncThreadSubscription);

  // Global "?" keypress opens the shortcut legend (skipped if user is typing).
  document.addEventListener("keydown", (event) => {
    if (event.key !== "?") return;
    const t = event.target;
    if (
      t instanceof HTMLElement &&
      (t.matches("input, textarea, [contenteditable=true]") || t.closest("[contenteditable=true]"))
    ) {
      return;
    }
    event.preventDefault();
    toggleShortcutLegend();
  });
}

// Context + Drafts + Ideas pills — only on /session/:id. Order matches
// handoff App.jsx: Context first, then Drafts (with badge), then Ideas.
//
// Lot 18 DS conformance (revised 2026-04-29 #2) — Drafts + Ideas are
// ghost buttons in their resting state per user feedback. The DS ships
// `.ghost` in grey/blue/green/red (no orange), so the ON/OFF mapping is:
//   • OFF → `.ap-button ghost grey` (transparent, no border)
//   • ON  → `.ap-button secondary <orange|blue>` (tinted-fill — color-XX-10
//           bg + color-XX-100 text/icon)
// The transparent → tinted-fill transition reads cleanly as the pressed
// state, and all hover/active/focus feedback is inherited from the DS.
// The Drafts count badge stays `.ap-counter normal orange`. The Context
// pill is the only composed exception (2-line inner label) — it starts
// from `.ap-button stroked grey` and adds a thin
// `.app-topbar__context-pill` wrapper for the layout overrides.
function renderSessionPills(rpMode, draftCount, isEmpty) {
  const draftBadge = draftCount > 0 ? `<span class="ap-counter normal orange">${draftCount}</span>` : "";
  const draftsClass = rpMode === "drafts" ? "secondary orange" : "ghost grey";
  const ideasClass = rpMode === "ideas" ? "secondary blue" : "ghost grey";
  const sourcesClass = rpMode === "sources" ? "secondary blue" : "ghost grey";
  // Drafts disabled until at least one draft turn has landed in the thread
  // (latestDraftCount > 0). Ideas disabled until the user has actually
  // started the conversation — opening Ideas in a brand-new chat with no
  // prompt sent yet has no useful context. Sources is always available.
  const draftsDisabled = draftCount === 0;
  const ideasDisabled = isEmpty;
  const sourcesCount = sessionSourceCount();
  const sourcesBadge = sourcesCount > 0 ? `<span class="ap-counter normal blue">${sourcesCount}</span>` : "";
  return `
    <button
      type="button"
      class="ap-button ${sourcesClass}"
      data-topbar-sources
      aria-pressed="${rpMode === "sources"}"
      title="Toggle Sources panel"
    >
      <i class="ap-icon-file"></i>
      <span>Sources</span>
      ${sourcesBadge}
    </button>
    <button
      type="button"
      class="ap-button ${draftsClass} ${draftsDisabled ? "is-empty" : ""}"
      data-topbar-drafts
      ${draftsDisabled ? "disabled" : ""}
      aria-pressed="${rpMode === "drafts"}"
      title="${draftsDisabled ? "No drafts in this conversation yet" : "Toggle Drafts panel"}"
    >
      <i class="ap-icon-pen"></i>
      <span>Drafts</span>
      ${draftBadge}
    </button>
    <button
      type="button"
      class="ap-button ${ideasClass} ${ideasDisabled ? "is-empty" : ""}"
      data-topbar-ideas
      ${ideasDisabled ? "disabled" : ""}
      aria-pressed="${rpMode === "ideas"}"
      title="${ideasDisabled ? "Send a message first" : "Toggle Outputs panel"}"
    >
      <i class="ap-icon-sparkles"></i>
      <span>Outputs</span>
    </button>
  `;
}

function escapeText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Resolve the count of sources attached to the active session. Drives
// the .ap-counter badge on the Sources pill so the user sees how many
// inputs are feeding the conversation without opening the panel.
function sessionSourceCount() {
  const sid = currentSessionId();
  if (!sid) return 0;
  return getSessionSources(sid).length;
}

// Resolve the latest draft message in the active session (if any) and return
// its count. Used to show the badge on the Drafts pill so the user has a
// visible cue that drafts are waiting in the panel even when it's closed.
function latestDraftCount() {
  const sessionId = currentSessionId();
  if (!sessionId) return 0;
  const thread = getThread(sessionId);
  const latestDraft = [...thread].reverse().find((m) => m.variant === "draft");
  if (!latestDraft) return 0;
  return latestDraft.count ?? latestDraft.drafts?.length ?? 0;
}

function isSessionRoute() {
  return /^\/session\//.test(getPath());
}

function currentSessionId() {
  const m = /^\/session\/([^/?]+)/.exec(getPath());
  return m ? m[1] : null;
}

// Resolve the title shown in the topbar from the current route. Session
// titles fall back to a generic label so /session/new and unknown ids stay
// readable. Anchors back to the dashboard via the sidebar — no need to make
// the topbar title clickable.
function currentTitle() {
  const path = getPath();
  if (path === "/") return "Home";
  if (path === "/sources") return "Sources";
  if (path === "/ideas") return "Ideas";
  if (path === "/contexts") return "Contexts";
  const sessionMatch = /^\/session\/([^/?]+)/.exec(path);
  if (sessionMatch) {
    const id = sessionMatch[1];
    const known = recentSessions.find((s) => s.id === id);
    return known?.name || "New conversation";
  }
  return "Archie";
}
