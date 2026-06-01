import { html, raw } from "../utils.js?v=20";
import { getPath, navigate } from "../router.js?v=30";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
// Lot 19 — topbar no longer carries its own sidebar-toggle button. The
// sidebar head exposes the toggle in both expanded (chevron-left) and
// collapsed (view-list) states, so the duplicate in the topbar was just
// a leftover. ⌘B still works globally.
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  openSources as openSourcesPanel,
  closePanel as closeRightPanel,
  getMode as getRightPanelMode,
  getActiveBatchRef as getActiveDraftsBatchRef,
  subscribe as subscribeRightPanel,
} from "./right-panel.js?v=128";
import { getSources as getSessionSources, subscribeSources } from "../sources-stream.js?v=33";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=38";
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=31";
import { getPosts, subscribe as subscribePosts } from "../posts-store.js?v=28";
import {
  isEnabled as isStatusCardEnabled,
  toggle as toggleStatusCard,
  subscribeVisibility as subscribeStatusCardVisibility,
} from "./conversation-status-card.js?v=30";
import { getSessionById, updateSession, subscribe as subscribeSessions } from "../sessions-store.js?v=1";
import { open as openRenameModal } from "./rename-modal.js?v=2";
import { subscribe as subscribeContexts } from "../contexts-store.js?v=29";

// The playbook/context pill now lives in the composer (session.js
// renderPlaybookControl) — selectable on a New Chat, then a static
// indicator once the conversation starts — so the topbar no longer
// renders it.

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
  const onPlaybook = isPlaybookRoute();
  const onWelcomeAlt = onSession && isWelcomeAltSession();
  const rpMode = getRightPanelMode();
  const draftCount = onSession ? latestDraftCount() : 0;
  // Empty conversation = no user turn yet. Used as one input to the
  // Outputs gating logic (combined with the live idea count — ideas
  // can land before the user types if a source got auto-extracted).
  const isEmpty = onSession ? isEmptyConversation() : true;
  const ideaCount = onSession ? sessionIdeaCount() : 0;
  // Welcome-alt swaps the right-side pills cluster for a single Exit
  // button — the wizard has no conversation to surface yet, so the
  // session pills + chat-status toggle would just be dead controls.
  // The info toggle only appears once the chat has something to summarise —
  // on a brand-new/empty chat the status card would be all "None yet", so we
  // hide the control entirely (matches conversation-status-card.render).
  const statusCardAvailable = onSession && (sessionSourceCount() > 0 || ideaCount > 0 || draftCount > 0);
  const rightSide = onWelcomeAlt
    ? renderWelcomeAltExit()
    : onSession
      ? `${renderSessionPills(rpMode, draftCount, isEmpty, ideaCount)}${renderStatusCardToggle(statusCardAvailable)}`
      : "";
  el.innerHTML = html`
    <div class="app-topbar__left">${raw(onPlaybook ? renderBack() : renderTitle(onSession))}</div>
    <div class="app-topbar__right">${raw(rightSide)}</div>
  `;
}

// Right-side Exit affordance shown during the integrated Playbook
// creation flow. The first-time onboarding flow has body.onboarding
// applied, so the topbar is hidden — only the integrated returning-user
// flow ever sees this button (the welcome-alt wizard chrome itself has
// no Exit affordance any more; this is the canonical one). Click goes
// through the session.js confirm-modal that was previously gating the
// floating wizard Exit button.
function renderWelcomeAltExit() {
  return `
    <button
      type="button"
      class="ap-button ghost grey"
      data-topbar-welcome-alt-exit
      aria-label="Exit Playbook creation"
    >
      Exit
      <i class="ap-icon-close" aria-hidden="true"></i>
    </button>
  `;
}

// "i" icon-button at the far right of the topbar — toggles the floating
// conversation status card on/off. Persists across reloads via
// localStorage (cf. conversation-status-card.js).
function renderStatusCardToggle(available) {
  if (!available) return "";
  const on = isStatusCardEnabled();
  return `
    <button
      type="button"
      class="ap-icon-button transparent app-topbar__status-toggle"
      data-topbar-toggle-status-card
      aria-pressed="${on}"
      aria-label="${on ? "Hide chat status" : "Show chat status"}"
      title="${on ? "Hide chat status" : "Show chat status"}"
    >
      <i class="ap-icon-info"></i>
    </button>
  `;
}

// On session routes the title doubles as a rename trigger — click to
// open the rename modal for the active conversation. Off-session the
// title is a plain heading. Welcome-alt sessions (Playbook creation)
// override both: a fixed "New Playbook" label, no rename — the session
// has no persisted name yet, and the user will name the Playbook
// itself at the end of the flow.
function renderTitle(onSession) {
  if (onSession && isWelcomeAltSession()) {
    return `<h1 class="app-topbar__title">New Playbook</h1>`;
  }
  const title = currentTitle();
  if (onSession) {
    const sid = currentSessionId();
    return `
      <button
        type="button"
        class="app-topbar__title app-topbar__title--rename"
        data-topbar-rename-session="${sid || ""}"
        title="Rename chat"
      >
        ${title}
        <i class="ap-icon-pen app-topbar__title-pen" aria-hidden="true"></i>
      </button>
    `;
  }
  return `<h1 class="app-topbar__title">${title}</h1>`;
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
    // Back to Playbooks — shown on the /playbook/:id page.
    const backBtn = event.target.closest("[data-topbar-back]");
    if (backBtn) {
      navigate(backBtn.dataset.topbarBack || "/");
      return;
    }
    // Click the conversation title → open the rename modal for it.
    const renameBtn = event.target.closest("[data-topbar-rename-session]");
    if (renameBtn) {
      const sid = renameBtn.dataset.topbarRenameSession;
      const session = sid ? getSessionById(sid) : null;
      if (!session) return;
      openRenameModal({
        title: "Rename chat",
        initialName: session.name,
        placeholder: "Chat name",
        confirmLabel: "Save name",
        onSubmit: (name) => updateSession(sid, { name }),
      });
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
    // Welcome-alt Exit — open the discard-progress confirm and navigate
    // back to the dashboard. Pairs with the topbar button rendered by
    // renderWelcomeAltExit() above. The wizard chrome no longer carries
    // its own Exit affordance; this is the only entry.
    if (event.target.closest("[data-topbar-welcome-alt-exit]")) {
      import("./confirm-modal.js?v=22").then(({ open }) => {
        open({
          title: "Exit onboarding?",
          body: "Your progress so far will be discarded. You can start over anytime from the dashboard.",
          confirmLabel: "Exit",
          cancelLabel: "Stay",
          danger: true,
          onConfirm: () => navigate("/"),
        });
      });
      return;
    }
    if (event.target.closest("[data-topbar-toggle-status-card]")) {
      toggleStatusCard();
      // Defensive: explicitly re-render the topbar so the button's
      // aria-pressed + title reflect the new state immediately, even
      // if the visibility subscription chain races with another
      // subscriber firing renderTopbar with the previous state.
      renderTopbar();
      return;
    }
  });

  // Re-render the topbar when the user flips the status-card visibility
  // preference so the `i` button's pressed state + tooltip stay accurate.
  subscribeStatusCardVisibility(() => renderTopbar());

  // Re-render when a context is renamed / deleted / created so the
  // active-session pill stays in sync (covers playbook editor saves and
  // wizard finalisation).
  subscribeContexts(() => renderTopbar());

  // Re-render the topbar whenever the right panel state changes so the
  // pills reflect the live mode (.is-on accent flips).
  subscribeRightPanel(() => renderTopbar());
  // Re-render when a session is renamed / deleted so the topbar title
  // reflects the new value (or "New conversation" if the active session
  // got removed).
  subscribeSessions(() => renderTopbar());

  // Re-render on hash change so pills re-derive per-route state.
  window.addEventListener("hashchange", () => renderTopbar());

  // When the active session's thread updates (new drafts land), re-render
  // so the Drafts pill badge reflects the latest count. Re-attach when the
  // route changes to a different session. Same goes for sources — drives
  // the Sources pill counter — and for the library (ideas extracted from
  // sources) — drives the Outputs pill badge + ungating.
  let lastSessionId = null;
  let unsubscribeThread = null;
  let unsubscribeSources = null;
  let unsubscribeLibrary = null;
  let unsubscribePosts = null;
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
    if (unsubscribeLibrary) {
      unsubscribeLibrary();
      unsubscribeLibrary = null;
    }
    if (unsubscribePosts) {
      unsubscribePosts();
      unsubscribePosts = null;
    }
    lastSessionId = sid;
    if (sid) {
      unsubscribeThread = subscribeThread(sid, () => renderTopbar());
      unsubscribeSources = subscribeSources(sid, () => renderTopbar());
      unsubscribeLibrary = subscribeLibrary(sid, () => renderTopbar());
      unsubscribePosts = subscribePosts(sid, () => renderTopbar());
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
// Lot 19 DS conformance — Drafts / Outputs / Sources now share one
// uniform button style per user feedback:
//   • OFF → `.ap-button ghost grey` (transparent, no border)
//   • ON  → `.ap-button stroked blue` (1px blue border + blue text/icon,
//           no fill — the canonical "active panel" cue in the
//           Agorapulse DS for a ghost-rest button)
// All hover/focus/disabled feedback is inherited from the DS.
// Counters stay color-coded to the data they carry: Drafts orange,
// Sources blue. The Context pill is unrelated (composed exception
// elsewhere in the layout — `.ap-button stroked grey` wrapped in
// `.app-topbar__context-pill`).
function renderSessionPills(rpMode, draftCount, isEmpty, ideaCount) {
  const draftBadge = draftCount > 0 ? `<span class="ap-counter normal orange">${draftCount}</span>` : "";
  const ideasBadge = ideaCount > 0 ? `<span class="ap-counter normal blue">${ideaCount}</span>` : "";
  const draftsClass = rpMode === "drafts" ? "stroked blue" : "ghost grey";
  const ideasClass = rpMode === "ideas" ? "stroked blue" : "ghost grey";
  const sourcesClass = rpMode === "sources" ? "stroked blue" : "ghost grey";
  // Each pill is disabled when its underlying count is 0 AND its panel
  // isn't currently the active mode — a button can't be semantically
  // both `disabled` and `aria-pressed=true`, and the user must be able
  // to re-click to close a panel even if the count dropped to 0 while
  // the panel was open.
  const draftsDisabled = draftCount === 0 && rpMode !== "drafts";
  const ideasDisabled = isEmpty && ideaCount === 0 && rpMode !== "ideas";
  const sourcesCount = sessionSourceCount();
  const sourcesDisabled = sourcesCount === 0 && rpMode !== "sources";
  const sourcesBadge = sourcesCount > 0 ? `<span class="ap-counter normal blue">${sourcesCount}</span>` : "";
  return `
    <button
      type="button"
      class="ap-button ${sourcesClass} ${sourcesDisabled ? "is-empty" : ""}"
      data-topbar-sources
      ${sourcesDisabled ? "disabled" : ""}
      aria-pressed="${rpMode === "sources"}"
      title="${sourcesDisabled ? "No sources attached yet — drop a file in the composer to add one" : "Toggle Sources panel"}"
    >
      <i class="ap-icon-file"></i>
      <span>Sources</span>
      ${sourcesBadge}
    </button>
    <button
      type="button"
      class="ap-button ${ideasClass} ${ideasDisabled ? "is-empty" : ""}"
      data-topbar-ideas
      ${ideasDisabled ? "disabled" : ""}
      aria-pressed="${rpMode === "ideas"}"
      title="${ideasDisabled ? "No ideas yet — attach a source or send a message" : "Toggle Ideas panel"}"
    >
      <i class="ap-icon-sparkles"></i>
      <span>Ideas</span>
      ${ideasBadge}
    </button>
    <button
      type="button"
      class="ap-button ${draftsClass} ${draftsDisabled ? "is-empty" : ""}"
      data-topbar-drafts
      ${draftsDisabled ? "disabled" : ""}
      aria-pressed="${rpMode === "drafts"}"
      title="${draftsDisabled ? "No drafts in this chat yet" : "Toggle Drafts panel"}"
    >
      <i class="ap-icon-pen"></i>
      <span>Drafts</span>
      ${draftBadge}
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

// Same shape for ideas (drives the Outputs pill badge + ungating).
function sessionIdeaCount() {
  const sid = currentSessionId();
  if (!sid) return 0;
  return getIdeas(sid).length;
}

// Count of drafts available in the active session's Drafts panel.
// Sources, in order:
//   1. posts-store — the canonical store the right-panel Drafts feed
//      reads from. Includes seeded mock drafts AND anything the user
//      drafted in this session, regardless of whether an assistant
//      "Drafted N posts" turn was ever posted.
//   2. The latest variant:"draft" assistant turn — kept as a fallback
//      so flows that post the turn before the store is populated
//      still light up the pill.
function latestDraftCount() {
  const sessionId = currentSessionId();
  if (!sessionId) return 0;
  const storeCount = getPosts(sessionId).length;
  if (storeCount > 0) return storeCount;
  const thread = getThread(sessionId);
  const latestDraft = [...thread].reverse().find((m) => m.variant === "draft");
  if (!latestDraft) return 0;
  return latestDraft.count ?? latestDraft.drafts?.length ?? 0;
}

function isSessionRoute() {
  return /^\/session\//.test(getPath());
}

function isPlaybookRoute() {
  return /^\/playbook\//.test(getPath());
}

// The welcome-alt session hosts the conversational Playbook builder
// (URL → profile → optional docs). It runs in app-shell chrome only
// in the integrated entry (returning user creates a Playbook from
// /contexts); the first-time onboarding hides chrome entirely via the
// body.onboarding class set in app.js. Either way, the Sources / Ideas
// / Drafts pills + the chat-status toggle don't apply during creation
// — there's no thread yet, no drafts, no idea bank. Use this helper to
// gate session-pill rendering.
function isWelcomeAltSession() {
  const sid = currentSessionId();
  return !!sid && sid.startsWith("welcome-alt-");
}

// On the Playbook page the topbar leads with a back control to the
// Playbooks list, in place of the route title.
function renderBack() {
  return `
    <button type="button" class="ap-button ghost grey app-topbar__back" data-topbar-back="/contexts" title="Back to Playbooks">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      <span>Back to Playbooks</span>
    </button>
  `;
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
  if (path === "/ideas") return "Ideas";
  if (path === "/contexts") return "Playbooks";
  const sessionMatch = /^\/session\/([^/?]+)/.exec(path);
  if (sessionMatch) {
    const id = sessionMatch[1];
    const known = getSessionById(id);
    return known?.name || "New chat";
  }
  return "Archie";
}
