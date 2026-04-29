import { html, raw } from "../utils.js?v=20";
import { getPath } from "../router.js?v=20";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
import { toggleSidebar } from "./sidebar.js?v=26";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  closePanel as closeRightPanel,
  getMode as getRightPanelMode,
  getActiveBatchRef as getActiveDraftsBatchRef,
  subscribe as subscribeRightPanel,
} from "./right-panel.js?v=31";
import { open as openContextDrawer } from "./context-drawer.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=23";
import { recentSessions } from "../mocks.js?v=25";
import { getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=24";
import { parseHashParams } from "../url-state.js?v=20";

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
    <div class="app-topbar__right">${raw(onSession ? renderSessionPills(rpMode, draftCount) : "")}</div>
  `;
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
    if (event.target.closest("[data-topbar-context]")) {
      const ctx = currentContext();
      openContextDrawer(ctx?.id || null);
    }
  });

  // Re-render the topbar whenever the right panel state changes so the
  // pills reflect the live mode (.is-on accent flips).
  subscribeRightPanel(() => renderTopbar());

  // Re-render when contexts are mutated (rename, color change, delete) so
  // the Context pill stays in sync with the drawer's edits, and on hash
  // change so the pill picks up a new ?contextId= param.
  subscribeContexts(() => renderTopbar());
  window.addEventListener("hashchange", () => renderTopbar());

  // When the active session's thread updates (new drafts land), re-render
  // so the Drafts pill badge reflects the latest count. Re-attach when the
  // route changes to a different session.
  let lastSessionId = null;
  let unsubscribeThread = null;
  function syncThreadSubscription() {
    const sid = currentSessionId();
    if (sid === lastSessionId) return;
    if (unsubscribeThread) {
      unsubscribeThread();
      unsubscribeThread = null;
    }
    lastSessionId = sid;
    if (sid) {
      unsubscribeThread = subscribeThread(sid, () => renderTopbar());
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
function renderSessionPills(rpMode, draftCount) {
  const ctx = currentContext();
  const ctxColor = ctx?.color || "grey";
  const ctxLabel = ctx ? ctx.name : "Set context…";
  const ctxStateClass = ctx ? "" : "is-empty";
  const draftBadge = draftCount > 0 ? `<span class="ap-counter normal orange">${draftCount}</span>` : "";
  const draftsClass = rpMode === "drafts" ? "secondary orange" : "ghost grey";
  const ideasClass = rpMode === "ideas" ? "secondary blue" : "ghost grey";
  return `
    <button
      type="button"
      class="ap-button stroked grey app-topbar__context-pill ${ctxStateClass}"
      data-topbar-context
      title="${ctx ? `Edit context · ${ctx.name}` : "Attach a context"}"
    >
      <span class="app-topbar__context-swatch app-topbar__context-swatch--${ctxColor}" aria-hidden="true"></span>
      <span class="app-topbar__context-label">
        <span class="app-topbar__context-eyebrow">Context</span>
        <span class="app-topbar__context-name">${escapeText(ctxLabel)}</span>
      </span>
      <i class="ap-icon-chevron-down" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="ap-button ${draftsClass}"
      data-topbar-drafts
      aria-pressed="${rpMode === "drafts"}"
      title="Toggle Drafts panel"
    >
      <i class="ap-icon-pen"></i>
      <span>Drafts</span>
      ${draftBadge}
    </button>
    <button
      type="button"
      class="ap-button ${ideasClass}"
      data-topbar-ideas
      aria-pressed="${rpMode === "ideas"}"
      title="Toggle Ideas panel"
    >
      <i class="ap-icon-sparkles"></i>
      <span>Ideas</span>
    </button>
  `;
}

function escapeText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Resolve the active session's bound context — URL ?contextId= wins,
// otherwise fall back to the recentSessions seed for known mock sessions.
function currentContext() {
  const sid = currentSessionId();
  if (!sid) return null;
  const params = parseHashParams();
  const fromUrl = params.get("contextId");
  if (fromUrl) return getContextById(fromUrl);
  const seed = recentSessions.find((s) => s.id === sid);
  if (seed?.contextId) return getContextById(seed.contextId);
  return null;
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
