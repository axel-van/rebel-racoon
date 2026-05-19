import { html, raw } from "../utils.js?v=20";
import { navigate, getPath } from "../router.js?v=20";
import { open as openSettingsDrawer } from "./settings-drawer.js?v=22";
import { open as openBugReportModal } from "./bug-report-modal.js?v=21";
import { open as openFeedbackModal } from "./feedback-modal.js?v=24";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
import { recentSessions } from "../mocks.js?v=27";
import { isFlagOn } from "../feature-flags.js?v=2";
import { isNewUser } from "../user-mode.js?v=20";
import { getSources, subscribeSources } from "../sources-stream.js?v=20";
import { getIdeas } from "../library.js?v=20";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=24";
import { closePanel as closeRightPanel } from "./right-panel.js?v=41";

// Global app sidebar — Brand / + New conversation / Recent chats / User footer.
// Rendered once at boot into #sidebar; re-rendered on every route change so the
// active conversation row stays highlighted.
//
// Collapsed state — driven by the .is-sidebar-collapsed class on #appShell.
// Toggle is exposed via the head button or Cmd/Ctrl+B (cf. initSidebar).
// State persists across reloads via localStorage so the chrome stays predictable.
//
// Footer popmenu (Lot 11) — the user-row's trailing button is now a popmenu
// trigger that exposes Send feedback / Report a bug / Keyboard shortcuts /
// Settings. The topbar dropped these chrome buttons in Lot 11 ; the sidebar
// foot is the single canonical place to reach them.

const COLLAPSED_KEY = "archie-sidebar-collapsed";

let menuOpen = false;
// Live filter query for the recent-conversations list. Updated as the user
// types into the search input, drives the visible Pinned / Recent groups.
// Kept module-local so it survives the re-renders triggered by route
// changes / store subscriptions.
let sidebarSearchQuery = "";

export function isSidebarCollapsed() {
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

export function setSidebarCollapsed(collapsed) {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  shell.classList.toggle("is-sidebar-collapsed", collapsed);
  if (collapsed) localStorage.setItem(COLLAPSED_KEY, "1");
  else localStorage.removeItem(COLLAPSED_KEY);
  // Re-render so the collapsed/expanded chrome swaps without leaving stale
  // pieces (e.g. the brand wordmark) hidden under CSS-only rules.
  renderSidebar();
}

export function toggleSidebar() {
  setSidebarCollapsed(!isSidebarCollapsed());
}

function setMenuOpen(open) {
  menuOpen = open;
  const popmenu = document.querySelector("[data-sidebar-foot-menu]");
  const trigger = document.querySelector("[data-sidebar-foot-toggle]");
  if (popmenu) popmenu.hidden = !open;
  if (trigger) trigger.setAttribute("aria-expanded", String(open));
}

export function initSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;

  // Apply persisted collapse state before the first render so we don't flash
  // the expanded layout on boot.
  const shell = document.getElementById("appShell");
  if (shell && isSidebarCollapsed()) shell.classList.add("is-sidebar-collapsed");

  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-sidebar-toggle]")) {
      toggleSidebar();
      return;
    }
    if (event.target.closest("[data-sidebar-home]")) {
      navigate("/");
      return;
    }
    if (event.target.closest("[data-sidebar-new]")) {
      // Close any leftover right-panel from the previous chat — drafts /
      // ideas / context-form should never spill into a fresh conversation.
      closeRightPanel();
      // Mint a unique session id per click so the per-id stores
      // (assistant thread, composer pills, posts-store, contextBuilder
      // promptedSessions) all start clean. A literal "/session/new"
      // would re-land on the same accumulated state — feels like a
      // toggle to the user.
      navigate(`/session/new-${Date.now().toString(36)}`);
      return;
    }
    const navItem = event.target.closest("[data-sidebar-nav]");
    if (navItem) {
      navigate(navItem.dataset.sidebarNav);
      return;
    }
    // Pin/unpin a conversation. Captured before the row-navigation handler
    // so clicking the pin button doesn't bubble into a route change.
    const pinBtn = event.target.closest("[data-sidebar-pin]");
    if (pinBtn) {
      event.preventDefault();
      event.stopPropagation();
      togglePinSidebar(pinBtn.dataset.sidebarPin);
      return;
    }
    const sessionRow = event.target.closest("[data-sidebar-session]");
    if (sessionRow) {
      navigate(`/session/${sessionRow.dataset.sidebarSession}`);
      return;
    }
    // Footer popmenu — toggle on the trigger, dispatch on item click.
    if (event.target.closest("[data-sidebar-foot-toggle]")) {
      setMenuOpen(!menuOpen);
      return;
    }
    // Sidebar head "Give feedback" link OR the popmenu item — same
    // handler. Lot 18.c — the head link is the new visible entry point
    // ; popmenu version stays for keyboard / discoverability.
    if (event.target.closest("[data-sidebar-feedback]")) {
      setMenuOpen(false);
      openFeedbackModal();
      return;
    }
    if (event.target.closest("[data-sidebar-bug]")) {
      setMenuOpen(false);
      openBugReportModal();
      return;
    }
    if (event.target.closest("[data-sidebar-shortcuts]")) {
      setMenuOpen(false);
      toggleShortcutLegend();
      return;
    }
    if (event.target.closest("[data-sidebar-settings]")) {
      setMenuOpen(false);
      openSettingsDrawer();
    }
  });

  // Search input — filter the recent / pinned lists as the user types.
  // Re-renders only the list block (not the input), so the input keeps
  // its focus and selection state across keystrokes.
  el.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches("[data-sidebar-search]")) {
      sidebarSearchQuery = target.value;
      renderRecentListsOnly();
    }
  });

  // Live-rerender on store mutations so the nav counters and any context
  // colors used by session rows stay in sync without waiting for the next
  // route change.
  subscribeSources(() => renderSidebar());
  subscribeContexts(() => renderSidebar());

  // Click outside the popmenu → close.
  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (event.target.closest("[data-sidebar-foot-menu], [data-sidebar-foot-toggle]")) return;
    setMenuOpen(false);
  });

  // Cmd/Ctrl+B toggles the sidebar — matches Claude.ai. Skip the binding when
  // the user is typing into an input/textarea/contenteditable so it never
  // hijacks composer input.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (event.key !== "b" && event.key !== "B") return;
    if (!(event.metaKey || event.ctrlKey)) return;
    const t = event.target;
    if (
      t instanceof HTMLElement &&
      (t.matches("input, textarea, [contenteditable=true]") || t.closest("[contenteditable=true]"))
    ) {
      // Inside an editable surface — let the platform shortcut (e.g. bold) win.
      return;
    }
    event.preventDefault();
    toggleSidebar();
  });
}

export function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  // Re-rendering tears down the popmenu DOM, so reset the local state to
  // match. Any open menu has to be re-opened with a fresh click.
  menuOpen = false;
  const path = getPath();
  const activeSessionId = matchSessionId(path);
  const collapsed = isSidebarCollapsed();

  if (collapsed) {
    el.innerHTML = html`
      <div class="app-sidebar__head app-sidebar__head--collapsed">
        <button
          type="button"
          class="ap-icon-button transparent"
          data-sidebar-toggle
          aria-label="Expand sidebar"
          title="Expand sidebar (⌘B)"
        >
          <i class="ap-icon-view-list"></i>
        </button>
      </div>

      <button
        type="button"
        class="ap-button secondary blue app-sidebar__new app-sidebar__new--collapsed"
        data-sidebar-new
        aria-label="New conversation"
        title="New conversation"
      >
        <i class="ap-icon-plus"></i>
      </button>

      <div class="app-sidebar__list-spacer"></div>

      <div class="app-sidebar__foot app-sidebar__foot--collapsed">
        <div class="ap-avatar size-32">MB</div>
        ${raw(renderFootMenu({ collapsed: true }))}
      </div>
    `;
    return;
  }

  el.innerHTML = html`
    <div class="app-sidebar__head">
      <button type="button" class="app-sidebar__brand" data-sidebar-home aria-label="Go to Archie home">
        <span class="app-sidebar__brand-mark"><i class="ap-icon-sparkles-mermaid"></i></span>
        <span class="app-sidebar__brand-name">Archie</span>
        <span class="ap-badge blue">BETA</span>
      </button>
      <button
        type="button"
        class="ap-icon-button transparent"
        data-sidebar-toggle
        aria-label="Collapse sidebar"
        title="Collapse sidebar (⌘B)"
      >
        <i class="ap-icon-chevron-left"></i>
      </button>
    </div>

    <button type="button" class="ap-link standalone small app-sidebar__feedback" data-sidebar-feedback>
      <i class="ap-icon-single-chat-bubble"></i>
      <span>Give feedback</span>
    </button>

    <button type="button" class="ap-button secondary blue app-sidebar__new" data-sidebar-new>
      <i class="ap-icon-plus"></i>
      <span>New conversation</span>
    </button>

    <nav class="app-sidebar__nav" aria-label="Library">${raw(renderNav(path))}</nav>

    ${raw(renderSearchInput())}

    <div class="app-sidebar__list" aria-label="Recent conversations">
      ${raw(renderRecentLists(activeSessionId, sidebarSearchQuery))}
    </div>

    <div class="app-sidebar__foot">
      <div class="app-sidebar__user">
        <div class="ap-avatar size-32">MB</div>
        <div class="app-sidebar__user-meta">
          <span class="app-sidebar__user-name">Matt Bousendorfer</span>
          <span class="app-sidebar__user-plan">Studio · Team</span>
        </div>
        ${raw(renderFootMenu({ collapsed: false }))}
      </div>
    </div>
  `;
}

// Footer popmenu — trigger button + popmenu list. The popmenu lives in the
// DOM but is hidden until the user clicks the trigger. Items dispatch to
// the existing modal/drawer/legend handlers at the top of initSidebar.
function renderFootMenu({ collapsed }) {
  // Pop the menu UPWARDS from the trigger so it doesn't get cut off by the
  // viewport's bottom edge.
  return `
    <div class="app-sidebar__foot-popmenu-wrap">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-sidebar-foot-toggle
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="More options"
        title="More options"
      >
        <i class="ap-icon-cog"></i>
      </button>
      <div
        class="app-sidebar__foot-popmenu ${collapsed ? "app-sidebar__foot-popmenu--collapsed" : ""}"
        role="menu"
        data-sidebar-foot-menu
        hidden
      >
        <button type="button" role="menuitem" class="app-sidebar__foot-item" data-sidebar-feedback>
          <i class="ap-icon-single-chat-bubble"></i>
          <span>Send feedback</span>
        </button>
        <button type="button" role="menuitem" class="app-sidebar__foot-item" data-sidebar-bug>
          <i class="ap-icon-bug"></i>
          <span>Report a bug</span>
        </button>
        <button type="button" role="menuitem" class="app-sidebar__foot-item" data-sidebar-shortcuts>
          <i class="ap-icon-question"></i>
          <span>Keyboard shortcuts</span>
          <kbd class="app-sidebar__foot-kbd">?</kbd>
        </button>
        <hr class="app-sidebar__foot-divider" />
        <button type="button" role="menuitem" class="app-sidebar__foot-item" data-sidebar-settings>
          <i class="ap-icon-cog"></i>
          <span>Settings</span>
        </button>
      </div>
    </div>
  `;
}

// Library nav — Sources / Ideas / Contexts standalone views. `count`
// resolves to a live count from the relevant store so the trailing
// `.ap-counter` badge stays in sync. Chats no longer needs a nav row:
// the recent-conversations list right below is the canonical entry
// point for session navigation.
const NAV = [
  {
    path: "/sources",
    icon: "ap-icon-folder",
    label: "Sources",
    match: (p) => p === "/sources",
    count: () => getSources().length,
  },
  {
    path: "/ideas",
    icon: "ap-icon-sparkles",
    label: "Ideas",
    match: (p) => p === "/ideas",
    count: () => recentSessions.reduce((n, s) => n + getIdeas(s.id).length, 0),
  },
  {
    path: "/contexts",
    icon: "ap-icon-target",
    label: "Contexts",
    match: (p) => p === "/contexts",
    count: () => getContexts().length,
  },
];

function renderNav(path) {
  return NAV.filter((item) => item.path !== "/ideas" || isFlagOn("sidebarIdeas"))
    .map((item) => {
      const count = item.count ? item.count() : 0;
      const counter = count > 0 ? `<span class="ap-counter normal grey">${count}</span>` : "";
      return `
      <button
        type="button"
        class="app-sidebar__nav-item ${item.match(path) ? "is-active" : ""}"
        data-sidebar-nav="${item.path}"
      >
        <i class="${item.icon}"></i>
        <span>${item.label}</span>
        ${counter}
      </button>
    `;
    })
    .join("");
}

// Search input — visible only when the recent-conversations list has at
// least one entry (otherwise it'd just be a dead control). Hidden in
// isNewUser mode for the same reason. Markup mirrors the workspace
// content toolbar pattern (cf. content-workspace.js): `.ap-input-group`
// + leading icon + `<input>`.
function renderSearchInput() {
  if (isNewUser() || recentSessions.length === 0) return "";
  const value = sidebarSearchQuery ? sidebarSearchQuery.replace(/"/g, "&quot;") : "";
  return `
    <div class="app-sidebar__search">
      <div class="ap-input-group">
        <i class="ap-icon-search" aria-hidden="true"></i>
        <input
          type="text"
          class="ap-input"
          placeholder="Search…"
          value="${value}"
          data-sidebar-search
          aria-label="Search conversations"
        />
      </div>
    </div>
  `;
}

// Render only the lists (Pinned + Recent) inside `.app-sidebar__list`.
// Used by the search-input keystroke handler so the input's focus and
// caret position survive the re-render.
function renderRecentListsOnly() {
  const list = document.querySelector(".app-sidebar__list");
  if (!list) return;
  const activeSessionId = matchSessionId(getPath());
  list.innerHTML = renderRecentLists(activeSessionId, sidebarSearchQuery);
}

// Pinned + Recent groups, filtered by the live search query. Empty groups
// are dropped (no orphan heading). When the filter matches nothing, an
// empty-state message takes over the list.
function renderRecentLists(activeSessionId, query) {
  if (isNewUser() || recentSessions.length === 0) {
    // FIND-E4: first-run anchor for the recent-conversations list. The
    // bare "No conversations yet" was a dead end — anchor a soft hint
    // that points at the New conversation button just above this list,
    // so the user has an obvious next move without duplicating the
    // primary CTA.
    return `
      <div class="app-sidebar__empty app-sidebar__empty--first-run">
        <span class="app-sidebar__empty-text">No conversations yet</span>
        <span class="app-sidebar__empty-hint">
          <i class="ap-icon-arrow-up" aria-hidden="true"></i>
          <span>Start one with the button above.</span>
        </span>
      </div>
    `;
  }
  const q = (query || "").trim().toLowerCase();
  const filtered = q ? recentSessions.filter((s) => s.name.toLowerCase().includes(q)) : recentSessions;

  const pinned = filtered.filter((s) => s.pinned);
  const unpinned = filtered.filter((s) => !s.pinned);

  if (pinned.length === 0 && unpinned.length === 0) {
    return `
      <div class="app-sidebar__empty">
        <span class="app-sidebar__empty-text">No conversations match</span>
      </div>
    `;
  }

  let out = "";
  if (pinned.length > 0) {
    out += `<div class="app-sidebar__section-heading">Pinned</div>`;
    out += pinned.map((s) => renderSessionRow(s, activeSessionId)).join("");
  }
  if (unpinned.length > 0) {
    out += `<div class="app-sidebar__section-heading">Recent</div>`;
    out += unpinned.map((s) => renderSessionRow(s, activeSessionId)).join("");
  }
  return out;
}

// One conversation row. Layout:
//   [pin icon if pinned] [title] [color dot] [pin button on hover]
// The color dot resolves the row's bound context color (orange / blue /
// green / etc.) — same lookup the topbar Context pill uses. Falls back to
// grey when the session has no contextId or the context was deleted.
function renderSessionRow(session, activeSessionId) {
  const isActive = session.id === activeSessionId;
  const ctx = session.contextId ? getContextById(session.contextId) : null;
  const dotColor = ctx?.color || "grey";
  const isPinned = !!session.pinned;
  const leading = isPinned ? `<i class="ap-icon-pin app-sidebar__row-leading" aria-hidden="true"></i>` : "";
  const pinLabel = isPinned ? "Unpin conversation" : "Pin conversation";
  return `
    <button
      type="button"
      class="app-sidebar__row ${isActive ? "is-active" : ""}"
      data-sidebar-session="${session.id}"
      data-sidebar-pinned="${isPinned ? "true" : "false"}"
    >
      ${leading}
      <span class="app-sidebar__row-title">${session.name}</span>
      <span
        class="app-sidebar__row-dot app-sidebar__row-dot--${dotColor}"
        aria-hidden="true"
      ></span>
      <span
        class="ap-icon-button transparent app-sidebar__row-pin"
        role="button"
        tabindex="0"
        data-sidebar-pin="${session.id}"
        aria-label="${pinLabel}"
        title="${pinLabel}"
      >
        <i class="ap-icon-pin"></i>
      </span>
    </button>
  `;
}

// Toggle the pinned flag on a session (in-memory mock mutation), re-render
// the sidebar, and surface a toast with an Undo action — same pattern as
// the idea-card pin/unpin (cf. idea-card.js togglePinMenuItem).
function togglePinSidebar(sessionId) {
  const s = recentSessions.find((r) => r.id === sessionId);
  if (!s) return;
  s.pinned = !s.pinned;
  renderSidebar();
  import("./toast.js?v=20").then(({ showToast }) => {
    showToast(s.pinned ? "Conversation pinned" : "Conversation unpinned", {
      action: {
        label: "Undo",
        onClick: () => togglePinSidebar(sessionId),
      },
    });
  });
}

function matchSessionId(path) {
  const m = /^\/session\/([^/?]+)/.exec(path);
  return m ? m[1] : null;
}
