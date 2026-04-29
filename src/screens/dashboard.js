import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=34";
import { open as openChatPickerModal } from "../components/chat-picker-modal.js?v=21";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=21";
import { recentSessions } from "../mocks.js?v=25";
import { getContexts, getContextById } from "../contexts-store.js?v=24";
import { setHandoff } from "../handoff.js?v=20";
import { parseHashParams, setHashQuery } from "../url-state.js?v=20";
import { getSources, subscribeSources } from "../sources-stream.js?v=25";
import { getIdeas, subscribe as subscribeLibrary } from "../library.js?v=23";
import { isNewUser } from "../user-mode.js?v=20";
import { renderSourceCard } from "../components/source-card.js?v=26";
import { renderIdeaCard } from "../components/idea-card.js?v=25";
import {
  contentState,
  renderContentWorkspace as renderSharedContentWorkspace,
  rerenderContentWorkspaceBody,
  renderContentEmptyState,
} from "../components/content-workspace.js?v=23";
import { wireLibraryActions, renderSourcesBulkBar, renderIdeasBulkBar } from "../library-actions.js?v=20";

// Dashboard — one URL (#/), state variants encoded in URL params so URLs
// like "Projects · Ideas" stay shareable.
//
// Params:
//   ctx       "none" (default) | "voice" | "brief" | "brand"
//   view      "sources" (default) | "ideas"   — Content section sub-view
//
// (The previous "Global contexts" main tab was lifted out — contexts now
// live behind the Settings entry in the sidebar.)

function readQuery() {
  const params = parseHashParams();
  return {
    // ctx is now a context id ("ctx-acme"), or "" for "no context yet — AI
    // will help create one". Legacy values ("none"/"voice"/"brief"/"brand")
    // are normalized to "" since the magic mapping was dropped along with
    // the /analyse routes.
    ctx: params.get("ctx") || "",
    title: params.get("title") || "",
    view: params.get("view") || "sources",
  };
}

function setQuery(next) {
  setHashQuery("/", { ...readQuery(), ...next });
}

// Cleared and reset on every renderDashboard so subscriptions don't pile up
// across navigations.
let unsubscribeSources = null;
let unsubscribeLibrary = null;
// Controller for the dashboard's click + change listeners (matches the
// session.js pattern). Re-created on every renderDashboard call so old
// listeners don't stack on the stable #app element.
let dashboardListenerController = null;

// Library selection — module-local Sets shared with library-actions.js.
// Cleared on every fresh renderDashboard so navigation away clears the
// selection (mirrors the session-screen previousSessionId guard).
const sourceSelection = new Set();
const ideaSelection = new Set();

export function renderDashboard(_params, target) {
  // Lot 13 — handoff alignment. The dashboard route `/` no longer renders
  // its own page (new chat hero card + content workspace). Instead it
  // redirects to the most-recent session, or to `/session/new` if there
  // isn't one. This matches the handoff App.jsx pattern where `/` IS the
  // active chat — the standalone /sources, /ideas, /contexts views own
  // the library surfaces. The Sidebar's "Chats" nav item still points at
  // `/`, so clicking it lands the user back on a chat surface either way.
  if (unsubscribeSources) {
    unsubscribeSources();
    unsubscribeSources = null;
  }
  if (unsubscribeLibrary) {
    unsubscribeLibrary();
    unsubscribeLibrary = null;
  }
  if (dashboardListenerController) dashboardListenerController.abort();
  dashboardListenerController = new AbortController();
  sourceSelection.clear();
  ideaSelection.clear();

  const recent = recentSessions[0];
  const targetPath = isNewUser() || !recent ? "/session/new" : `/session/${recent.id}`;
  // Use replace() rather than navigate() so the browser history doesn't end
  // up with a `/` entry that immediately bounces — feels broken on Back.
  window.location.replace(window.location.href.split("#")[0] + "#" + targetPath);
}

function renderNewProjectCard(q) {
  // Context select — either "" (no context, AI walks the user through creation)
  // or the id of an existing global context. Templates / direct param can
  // pre-select a value; otherwise we default to "" (no context).
  const selected = q.ctx || "";
  const ctxOpt = (value, label) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`;
  const globals = getContexts();

  return html`
    <div class="ap-card dashboard__new-project">
      <h3 class="ap-card-title">New chat</h3>
      <div class="ap-form-field">
        <label>Chat name (optional)</label>
        <div class="ap-input-group">
          <input placeholder="e.g. Q2 launch drumbeat" data-new-project-name value="${q.title}" />
        </div>
        <p class="dashboard__form-hint muted">
          Archie will name it from the conversation, or fall back to the date and time.
        </p>
      </div>
      <div class="ap-form-field">
        <label>Context</label>
        <select class="ap-native-select" data-new-project-context>
          ${raw(ctxOpt("", "No context — Archie will help me create one"))}
          ${raw(globals.map((c) => ctxOpt(c.id, c.name)).join(""))}
        </select>
      </div>
      <button type="button" class="ap-button primary orange" data-new-project-create>New chat</button>
    </div>
  `;
}

// (Recent chats, sidebar settings, and workflow templates were removed in
// Lot 2.1 — recent chats now live in the global app sidebar; templates are
// dropped per Q14 in favor of the four handoff starters that ship with the
// Chat empty state in Lot 3.)

// ---- Main panel — Content section -----------------------------------------

function renderProjectsPanel(q) {
  if (isNewUser()) {
    return html`
      <div class="dashboard__panel">
        <div class="ap-card dashboard__first-run">
          <div class="dashboard__first-run-icon">
            <i class="ap-icon-sparkles-mermaid md"></i>
          </div>
          <div class="grow stack-sm">
            <h2 class="text-subtitle">Welcome to Archie</h2>
            <p class="muted">
              You don't have any projects yet. Start one from the form on the left, or pick a template starter to
              prefill it.
            </p>
          </div>
        </div>
      </div>
    `;
  }
  return html` <div class="dashboard__panel">${raw(renderContentSection(q))}</div> `;
}

// The dashboard's library implicitly browses the default session's content
// (mirrors the existing "click source/idea → navigate to session" behavior).
// Bulk extract / delete operate on this session id so the dashboard and the
// in-session Content tab share state.
function defaultLibrarySessionId() {
  return recentSessions[0]?.id || "new";
}

function renderContentSection(q) {
  const sid = defaultLibrarySessionId();
  const sources = getSources();
  const ideas = getIdeas(sid);
  // Same Content workspace as the in-session Content tab: header with count
  // meta + the "+ Add source" button, search + sort toolbar, By source /
  // All ideas tabs, body of cards. Selection state + bulk bars are shared
  // via library-actions.js so behavior is identical across surfaces.
  const addSourceButton = `
    <button type="button" class="ap-button stroked blue" data-dashboard-add-source>
      <i class="ap-icon-plus"></i>
      <span>Add source</span>
    </button>
  `;
  if (sources.length === 0 && ideas.length === 0) {
    return renderContentEmptyState({ actionHtml: addSourceButton });
  }
  const view = q.view === "ideas" ? "ideas" : "sources";
  const sourceSel = view === "sources" ? sourceSelection : null;
  const ideaSel = view === "ideas" ? ideaSelection : null;
  return renderSharedContentWorkspace({
    sources,
    ideas,
    view,
    headerActions: addSourceButton,
    sourceSelection: sourceSel,
    sourcesBulkBar: sourceSel && sourceSel.size > 0 ? renderSourcesBulkBar(sourceSel.size) : "",
    ideaSelection: ideaSel,
    ideasBulkBar: ideaSel && ideaSel.size > 0 ? renderIdeasBulkBar(ideaSel.size) : "",
  });
}

// ---- Wiring -------------------------------------------------------------------

function bindDashboard(root) {
  root.addEventListener("click", (event) => {
    const contentView = event.target.closest("[data-content-view]");
    if (contentView) {
      setQuery({ view: contentView.dataset.contentView });
      return;
    }

    // (Recent chats now live in the global app sidebar — no [data-open-session]
    // handling here. Settings is reachable from the sidebar footer too.
    // Workflow templates dropped per Q14.)

    if (event.target.closest("[data-new-project-create]")) {
      const nameInput = root.querySelector("[data-new-project-name]");
      const contextSelect = root.querySelector("[data-new-project-context]");
      // Name is optional. When the user leaves it blank we fall back to a
      // date+time stamp; the eventual product behavior will rename the chat
      // from the conversation content once it has enough material.
      const typed = nameInput?.value.trim() || "";
      const title = typed || defaultChatName();
      // contextSelect.value is now either "" (no context — AI will walk the
      // user through creation in-session) or the id of an existing global
      // context. No magic-value mapping anymore.
      const contextId = contextSelect?.value || "";
      const qs = new URLSearchParams({ tab: "posts", title });
      if (contextId) qs.set("contextId", contextId);
      // Hand-off pattern (mirrors pendingDraftIdeaId): the session screen
      // reads + clears this flag on mount and triggers the right start flow.
      const ctx = contextId ? getContextById(contextId) : null;
      setHandoff("pendingStartFlow", {
        hasContext: !!contextId,
        contextName: ctx?.name || "Your context",
      });
      navigate(`/session/new?${qs.toString()}`);
      return;
    }

    if (event.target.closest("[data-dashboard-add-source]")) {
      openAddSourceModal();
      return;
    }

    // Source-card actions on the Content section — open the default session
    // and land in the right tab. The card now exposes three actions:
    // "Ask" → posts tab, "View all N ideas" → All ideas view, more → no-op.
    const defaultSessionId = recentSessions[0]?.id || "new";

    // Idea-card source chips — navigate to the source within its session.
    const openSrc = event.target.closest("[data-source-open]");
    if (openSrc) {
      event.preventDefault();
      navigate(`/session/${defaultSessionId}?tab=content&view=sources&focusSource=${openSrc.dataset.sourceOpen}`);
      return;
    }
    if (event.target.closest("[data-source-view]")) {
      event.preventDefault();
      navigate(`/session/${defaultSessionId}?tab=content&view=ideas`);
      return;
    }
    const askBtn = event.target.closest("[data-source-ask]");
    if (askBtn) {
      event.preventDefault();
      const sourceId = askBtn.dataset.sourceAsk;
      const source = getSources().find((s) => s.id === sourceId);
      if (!source) return;
      const handoff = (choice) => {
        setHandoff("pendingAskSource", { sourceId, filename: source.filename });
        if (choice.kind === "new") {
          const qs = new URLSearchParams({ tab: "posts", title: defaultChatName() });
          navigate(`/session/new?${qs.toString()}`);
        } else {
          navigate(`/session/${choice.session.id}?tab=posts`);
        }
      };
      if (recentSessions.length === 0) {
        handoff({ kind: "new" });
      } else {
        openChatPickerModal({ onPick: handoff });
      }
      return;
    }
    // Idea-card source link doubles as "Open idea" — jump to the default
    // session's All ideas view with focus on that idea. Pin + more-menu
    // behavior is encapsulated inside src/components/idea-card.js.
    const openIdeaBtn = event.target.closest("[data-idea-open]");
    if (openIdeaBtn) {
      event.preventDefault();
      navigate(`/session/${defaultSessionId}?tab=content&view=ideas&focusIdea=${openIdeaBtn.dataset.ideaOpen}`);
      return;
    }
    if (event.target.closest("[data-idea-generate]")) {
      event.preventDefault();
      const ideaId = event.target.closest("[data-idea-generate]")?.dataset.ideaGenerate;
      if (!ideaId) return;
      // The session screen consumes pendingDraftIdeaId on mount and triggers
      // the inline "Which profile?" question before starting the draft. Same
      // hand-off shape regardless of whether we land in a fresh chat or an
      // existing one.
      setHandoff("pendingDraftIdeaId", ideaId);
      // Zero existing chats — skip the picker, go straight to a new one.
      if (recentSessions.length === 0) {
        const qs = new URLSearchParams({ tab: "content", view: "ideas", title: defaultChatName() });
        navigate(`/session/new?${qs.toString()}`);
        return;
      }
      // Otherwise ask explicitly where the draft should land.
      openChatPickerModal({
        onPick: (choice) => {
          if (choice.kind === "new") {
            const qs = new URLSearchParams({ tab: "content", view: "ideas", title: defaultChatName() });
            navigate(`/session/new?${qs.toString()}`);
          } else {
            navigate(`/session/${choice.session.id}?tab=content&view=ideas`);
          }
        },
      });
      return;
    }
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-new-project-context]")) {
      // Empty value = "no context yet — Archie will help create one".
      // Anything else is a global context id that gets attached on submit.
      setQuery({ ctx: event.target.value });
      return;
    }
    if (event.target.matches("[data-content-sort]")) {
      contentState.sort = event.target.value;
      rerenderContentBody(root);
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-new-project-name]")) {
      const error = root.querySelector("[data-new-project-error]");
      if (error && event.target.value.trim()) error.hidden = true;
      return;
    }
    if (event.target.matches("[data-content-search]")) {
      contentState.q = event.target.value;
      rerenderContentBody(root);
    }
  });
}

// Body-only repaint helper: same options the initial render uses so the
// search input keeps focus while typing. Threads selection + bulk-bar
// state through so the bar reflects the current Set sizes.
function rerenderContentBody(root) {
  const sid = defaultLibrarySessionId();
  const view = readQuery().view === "ideas" ? "ideas" : "sources";
  const sourceSel = view === "sources" ? sourceSelection : null;
  const ideaSel = view === "ideas" ? ideaSelection : null;
  rerenderContentWorkspaceBody(root, {
    sources: getSources(),
    ideas: getIdeas(sid),
    view,
    sourceSelection: sourceSel,
    sourcesBulkBar: sourceSel && sourceSel.size > 0 ? renderSourcesBulkBar(sourceSel.size) : "",
    ideaSelection: ideaSel,
    ideasBulkBar: ideaSel && ideaSel.size > 0 ? renderIdeasBulkBar(ideaSel.size) : "",
  });
}

// Fallback chat name when the user submits with no title typed in. Eventually
// this stamp gets replaced by an AI-derived title once there's enough
// material in the thread; for now the date+time is good enough to scan in
// the recent-chats list.
function defaultChatName() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat · ${fmt.format(now)}`;
}
