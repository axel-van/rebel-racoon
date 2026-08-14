import { html, raw, escapeHtml, escapeAttr } from "../utils.js?v=21";
import { getPath, navigate } from "../router.js?v=30";
import { parseHashParams } from "../url-state.js?v=21";
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
} from "./right-panel.js?v=564";
import { getSources as getSessionSources, subscribeSources } from "../sources-stream.js?v=89";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=97";
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=91";
import { getPosts, subscribe as subscribePosts } from "../posts-store.js?v=68";
import {
  isEnabled as isStatusCardEnabled,
  toggle as toggleStatusCard,
  subscribeVisibility as subscribeStatusCardVisibility,
} from "./conversation-status-card.js?v=357";
import { getSessionById, updateSession, subscribe as subscribeSessions } from "../sessions-store.js?v=39";
import { open as openRenameModal } from "./rename-modal.js?v=2";
import { subscribe as subscribeContexts } from "../contexts-store.js?v=75";
import { isFlagOn } from "../feature-flags.js?v=22";
import {
  getPickerState as getTopPostsState,
  subscribePicker as subscribeTopPosts,
  backToProfiles as topPostsBackToProfiles,
} from "../top-posts-flow.js?v=117";

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
//   • Right     — Sources / Ideas / Drafts pills (only on /session/:id, drive
//     the right-panel modes)
//
// The Archie wordmark moved to the global sidebar at Lot 2.1. Feedback /
// Report a bug / Keyboard shortcuts / Settings moved out of the topbar at
// Lot 11 — they now live in the sidebar footer popmenu (cf. sidebar.js).
// The "?" key shortcut for the keyboard legend stays globally bound so
// power users keep their muscle memory.

// ── Screen actions in the topbar ───────────────────────────────────────────
// A screen can hand the topbar its own controls, which then sit where the
// session pills sit. This is a COMPOSITION, not a new component: what goes in is
// unmodified `.ap-button`s, and the topbar is an app-level shell element rather
// than anything the DS ships.
//
// It exists because a page-level toolbar under the topbar spent a full row of
// vertical space repeating what the topbar already said. The rule that keeps it
// honest: only controls that act on the WHOLE screen belong here — a filter, an
// export, a settings gear. Anything scoped to one object on the page stays with
// that object.
//
// The screen owns the teardown. Nothing clears this automatically, because a
// route change repaints the topbar before the outgoing screen's cleanup runs and
// an auto-clear would race it.
// Two slots. `actions` sit on the right where the session pills sit; `lead`
// sits on the LEFT, immediately after the route title — for controls that name
// WHICH view you are in rather than act on it.
let screenActions = "";
let screenLead = "";

export function setTopbarActions(htmlString = "", leadHtml = "") {
  screenActions = htmlString || "";
  screenLead = leadHtml || "";
  renderTopbar();
}

export function clearTopbarActions() {
  if (!screenActions && !screenLead) return;
  screenActions = "";
  screenLead = "";
  renderTopbar();
}

export function renderTopbar(_options = {}) {
  const el = document.getElementById("topbar");
  if (!el) return;
  const onSession = isSessionRoute();
  const back = backTargetFor(getPath());
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
  // Gated behind the conversationStatusCard flag: when OFF, the whole card —
  // and this topbar toggle — disappears (matches conversation-status-card.render).
  const statusCardAvailable =
    onSession && isFlagOn("conversationStatusCard") && (sessionSourceCount() > 0 || ideaCount > 0 || draftCount > 0);
  const rightSide = onWelcomeAlt
    ? renderWelcomeAltExit()
    : onSession
      ? `${renderSessionPills(rpMode, draftCount, isEmpty, ideaCount)}${renderStatusCardToggle(statusCardAvailable)}`
      : screenActions;
  // On the repurposing winner board (profile-first mode), the topbar leads with
  // a "Change profile" back — the app's standard back affordance — in place of
  // the session title.
  const left = back ? renderBack(back) : isTopPostsBoard() ? renderTopPostsBack() : renderTitle(onSession);
  el.innerHTML = html`
    <div class="app-topbar__left">${raw(left)}${raw(onSession ? "" : screenLead)}</div>
    <div class="app-topbar__right">${raw(rightSide)}${raw(onWelcomeAlt ? "" : renderSettingsCog())}</div>
  `;
}

// The settings cog — on EVERY topbar, not just the Topic feed's.
//
// It started as "Feed settings" in the feed's own action cluster, which made the
// settings space reachable from exactly one screen. From a chat — where most of a
// session is spent — there was no way in at all.
//
// It goes to the section for what you are looking at, defaulting to Playbooks. A
// cog that always landed on the same page would take a reader on the feed away
// from what they were configuring; a cog that lands on the feed's row from the
// feed is the same promise the label "Feed settings" made, kept from everywhere
// else too. Hidden only in the welcome-alt chrome, which has no app to configure
// yet — and absent on /settings itself, which drops the topbar entirely.
function settingsTargetFor(path) {
  return path.startsWith("/topic-feeds") ? "/settings/topic-feeds" : "/settings/playbooks";
}

function renderSettingsCog() {
  return html`<button
    type="button"
    class="ap-icon-button transparent app-topbar__settings"
    data-topbar-settings
    title="Settings"
    aria-label="Settings"
  >
    <i class="ap-icon-cog"></i>
  </button>`;
}

// True when the active session is showing the repurposing board (step 2) —
// i.e. there's a "Change profile" step to go back to.
function isTopPostsBoard() {
  if (!isSessionRoute()) return false;
  const sid = currentSessionId();
  return !!sid && getTopPostsState(sid)?.stage === "board";
}

// "‹ Change profile" — same back treatment as the Playbook page, so the
// repurposing board's back matches every other back in the app.
function renderTopPostsBack() {
  return `
    <button type="button" class="ap-button ghost grey app-topbar__back" data-topbar-topposts-back title="Change profile">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      <span>Change profile</span>
    </button>
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
    // Back from a sub-page — target comes from backTargetFor(), and may carry a
    // query (the settings page sends its Playbook back to the digest).
    const backBtn = event.target.closest("[data-topbar-back]");
    if (backBtn) {
      navigate(backBtn.dataset.topbarBack || "/");
      return;
    }
    if (event.target.closest("[data-topbar-settings]")) {
      navigate(settingsTargetFor(getPath()));
      return;
    }
    // "Change profile" — back to the repurposing profile chooser (step 1).
    if (event.target.closest("[data-topbar-topposts-back]")) {
      const sid = currentSessionId();
      if (sid) topPostsBackToProfiles(sid);
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
  let unsubscribeTopPosts = null;
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
    if (unsubscribeTopPosts) {
      unsubscribeTopPosts();
      unsubscribeTopPosts = null;
    }
    lastSessionId = sid;
    if (sid) {
      unsubscribeThread = subscribeThread(sid, () => renderTopbar());
      unsubscribeSources = subscribeSources(sid, () => renderTopbar());
      unsubscribeLibrary = subscribeLibrary(sid, () => renderTopbar());
      unsubscribePosts = subscribePosts(sid, () => renderTopbar());
      // Repurposing stage changes (profile → board → back) flip the topbar
      // between the session title and the "Change profile" back.
      unsubscribeTopPosts = subscribeTopPosts(sid, () => renderTopbar());
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

// Routes that lead with a back control instead of a title, and where they go.
function backTargetFor(path) {
  if (/^\/playbook\//.test(path)) return { to: "/contexts", label: "Back to Playbooks" };
  if (/^\/pillar\//.test(path)) return { to: "/content-strategy", label: "Back to Content strategy" };
  // A lane's own sub-pages — its SETTINGS and its ATTENTION page — go back to that
  // lane, not to the list. You reach both from one topic list (the gear, and the
  // notice's CTA), so the list is not where you came from. These are the only
  // backs in the app that name a specific destination rather than a section, which
  // is why the label carries the lane's own name. Settings shares the target with
  // the form's Cancel (research-form.exitPath), deliberately: two exits from one
  // screen that disagree is how a user loses work.
  // There is ONE feed now — the active Playbook's — so every Topic-feeds sub-view
  // goes back to the same place and the label no longer names a lane. It used to,
  // because you could be looking at any of several feeds' settings; with one per
  // Playbook the name would repeat the rail's scope switcher.
  if (/^\/topic-feeds\/.+/.test(path)) return { to: "/topic-feeds", label: "Back to the feed" };
  // Settings is a place, not a step in a flow — its own back is the rail's.
  if (/^\/settings/.test(path)) return null;
  // The Topics settings page carries its Playbook scope BACK to the feed, so a
  // filtered feed survives the round trip. getPath() strips the query, so the scope
  // has to be read from the hash here rather than taken from `path`.
  if (/^\/topics\/settings/.test(path)) {
    const pb = parseHashParams().get("pb");
    return { to: pb ? `/topics?pb=${encodeURIComponent(pb)}` : "/topics", label: "Back to Topics" };
  }
  return null;
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

// A sub-page leads with a back control in place of the route title.
function renderBack({ to, label }) {
  return `
    <button type="button" class="ap-button ghost grey app-topbar__back" data-topbar-back="${escapeAttr(to)}" title="${escapeAttr(label)}">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      <span>${escapeHtml(label)}</span>
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
  if (path === "/contexts") return "Playbooks";
  if (path === "/connectors") return "Connectors";
  if (path === "/topics") return "Topics";
  // Every Content Research route reports the SECTION here, not the lane. The
  // topbar names where you are in the app; the lane's own header names which
  // lane. Registering these is also what let the lane list drop its in-page
  // bordered bar — that bar only existed because this map had no entry and the
  // topbar fell through to "Archie".
  if (path.startsWith("/topic-feeds")) return "Topic feeds";
  // Same rule for Content strategy: the topbar names the SECTION, the pillar's
  // own header names the pillar.
  if (path.startsWith("/settings")) return "Settings";
  if (path === "/content-strategy") return "Content strategy";
  if (path.startsWith("/pillar/")) return "Content strategy";
  const sessionMatch = /^\/session\/([^/?]+)/.exec(path);
  if (sessionMatch) {
    const id = sessionMatch[1];
    const known = getSessionById(id);
    if (known?.name) return known.name;
    // A freshly minted `new-*` chat isn't in the store yet, so fall back to the
    // `?title=` param the same way session.js does when it builds the virtual
    // session — otherwise a chat spawned with a name (from a topic, say) reads
    // "New chat" in the topbar while its own header shows the real one.
    return parseHashParams().get("title") || "New chat";
  }
  return "Archie";
}
