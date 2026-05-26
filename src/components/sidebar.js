import { html, raw } from "../utils.js?v=20";
import { navigate, getPath } from "../router.js?v=30";
import { open as openSettingsDrawer } from "./settings-drawer.js?v=23";
import { open as openBugReportModal } from "./bug-report-modal.js?v=21";
import { open as openFeedbackModal } from "./feedback-modal.js?v=24";
import { open as openConfirmModal } from "./confirm-modal.js?v=20";
import { open as openRenameModal } from "./rename-modal.js?v=1";
import { open as openSearchModal } from "./search-modal.js?v=3";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
import {
  getSessions,
  getSessionById,
  updateSession,
  deleteSession,
  togglePin as togglePinSession,
  subscribe as subscribeSessions,
} from "../sessions-store.js?v=1";
import { isFlagOn } from "../feature-flags.js?v=3";
import { isNewUser } from "../user-mode.js?v=21";
import { getIdeas, clearSession as clearLibrarySession } from "../library.js?v=29";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=28";
import { closePanel as closeRightPanel } from "./right-panel.js?v=103";
import { clearSession as clearAssistantSession } from "../assistant.js?v=35";
import { clearSession as clearPostsSession } from "../posts-store.js?v=27";
import { clearSession as clearSourcesSession } from "../sources-stream.js?v=30";

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

// Search lives in a dedicated modal now (cf. ./search-modal.js — opened from
// the Search… row in the top nav). The sidebar no longer carries an inline
// `<input>` or a live filter query — opening the modal is the only path.

// Rename is handled via the dedicated rename-modal, not inline edit.
// (Earlier iteration tried inline title → input swap but the modal
// pattern is friendlier for a name long enough to matter.)

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

function toggleSidebar() {
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
    // Search… nav row — open the dedicated search modal (mirrors Claude's
    // pattern). Captured before the generic `data-sidebar-nav` branch since
    // the Search row intentionally isn't a route.
    if (event.target.closest("[data-sidebar-search-open]")) {
      openSearchModal();
      return;
    }
    const navItem = event.target.closest("[data-sidebar-nav]");
    if (navItem) {
      navigate(navItem.dataset.sidebarNav);
      return;
    }
    // Rename action — opens the inline-rename input on the row.
    const renameBtn = event.target.closest("[data-sidebar-row-rename]");
    if (renameBtn) {
      event.preventDefault();
      event.stopPropagation();
      startRenameSidebar(renameBtn.dataset.sidebarRowRename);
      return;
    }
    // Delete action — confirm-modal then cleanup + remove.
    const deleteBtn = event.target.closest("[data-sidebar-row-delete]");
    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();
      deleteSidebarSession(deleteBtn.dataset.sidebarRowDelete);
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
    // 3-dots menu summary click — let <details> handle its own toggle,
    // swallow propagation so the row's session-nav handler doesn't fire,
    // and position the dropdown (fixed-positioned, escapes the sidebar's
    // overflow) just to the right of the trigger.
    const summary = event.target.closest(".app-sidebar__row-menu summary");
    if (summary) {
      event.stopPropagation();
      // Wait for <details>.open to toggle, then position the dropdown.
      requestAnimationFrame(() => {
        const details = summary.closest("details");
        if (!details?.open) return;
        const dropdown = details.querySelector(".app-sidebar__row-menu-dropdown");
        if (!dropdown) return;
        const rect = summary.getBoundingClientRect();
        dropdown.style.left = `${rect.right + 8}px`;
        dropdown.style.top = `${rect.top}px`;
      });
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

  // Live-rerender on store mutations so the nav counters and any context
  // colors used by session rows stay in sync without waiting for the next
  // route change.
  subscribeContexts(() => renderSidebar());
  subscribeSessions(() => renderSidebar());

  // Click outside the popmenu → close.
  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (event.target.closest("[data-sidebar-foot-menu], [data-sidebar-foot-toggle]")) return;
    setMenuOpen(false);
  });

  // Click outside an open row ⋮ menu → close it. The dropdown is
  // fixed-positioned so its click events bubble normally to document.
  document.addEventListener("click", (event) => {
    const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
    if (!openDetails) return;
    if (openDetails.contains(event.target)) return;
    openDetails.removeAttribute("open");
  });

  // If the user scrolls the sidebar list while a menu is open, close it
  // — the dropdown is fixed-positioned and wouldn't follow.
  const list = el.querySelector(".app-sidebar__list");
  if (list) {
    list.addEventListener("scroll", () => {
      const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
      if (openDetails) openDetails.removeAttribute("open");
    });
  }
  window.addEventListener("resize", () => {
    const openDetails = el.querySelector(".app-sidebar__row-menu[open]");
    if (openDetails) openDetails.removeAttribute("open");
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

  // ⇧⌘O / Ctrl+Shift+O — start a new conversation from anywhere. Matches
  // Claude.ai's "New chat" shortcut. Like ⌘K, it intentionally fires even
  // from inside inputs / textareas / contenteditable: starting a new
  // conversation is a global navigation action, and the user can always
  // come back if they want to keep editing. Same closeRightPanel + fresh
  // session-id logic as the `[data-sidebar-new]` click handler above.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "o" && event.key !== "O") return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (!event.shiftKey) return;
    event.preventDefault();
    closeRightPanel();
    navigate(`/session/new-${Date.now().toString(36)}`);
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

      <nav class="app-sidebar__nav" aria-label="Library">${raw(renderNav(path))}</nav>

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
        <span class="app-sidebar__brand-beta">BETA</span>
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

    <nav class="app-sidebar__nav" aria-label="Library">${raw(renderNav(path))}</nav>

    <div class="app-sidebar__list" aria-label="Recent conversations">${raw(renderRecentLists(activeSessionId))}</div>

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
//
// Expanded mode also renders a sibling 💬 icon button as a direct,
// always-visible entry point to Send feedback (the head-of-sidebar link
// was demoted to this quieter footer slot). Collapsed mode skips the
// dedicated button — the popmenu's `Send feedback` item is the
// collapsed-mode fallback, otherwise the foot rail would carry two
// stacked icon buttons in too-little horizontal space.
function renderFootMenu({ collapsed }) {
  const feedbackBtn = collapsed
    ? ""
    : `
      <button
        type="button"
        class="ap-icon-button transparent app-sidebar__foot-feedback"
        data-sidebar-feedback
        aria-label="Send feedback"
        title="Send feedback"
      >
        <i class="ap-icon-single-chat-bubble"></i>
      </button>
    `;
  // Pop the menu UPWARDS from the trigger so it doesn't get cut off by the
  // viewport's bottom edge.
  //
  // The expanded form wraps both buttons in a `.app-sidebar__foot-tools`
  // container with a subtle background so they read as a mini toolbar
  // anchored to the user row, not as two floating icons.
  const inner = `
    ${feedbackBtn}
    <div class="app-sidebar__foot-popmenu-wrap">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-sidebar-foot-toggle
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="More actions"
        title="More actions"
      >
        <i class="ap-icon-cog"></i>
      </button>
      <div
        class="ap-action-dropdown app-sidebar__foot-popmenu ${collapsed ? "app-sidebar__foot-popmenu--collapsed" : ""}"
        role="menu"
        data-sidebar-foot-menu
        hidden
      >
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-feedback>
          <i class="ap-icon-single-chat-bubble"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Send feedback</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-bug>
          <i class="ap-icon-bug"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Report a bug</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-shortcuts>
          <i class="ap-icon-question"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Keyboard shortcuts</span>
            </div>
          </div>
          <kbd class="app-sidebar__foot-kbd">?</kbd>
        </button>
        <div class="ap-action-dropdown-divider" role="separator"></div>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-sidebar-settings>
          <i class="ap-icon-cog"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Settings</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  `;
  // Collapsed mode keeps the icons stacked individually (vertical rail);
  // expanded mode wraps them in a small bordered toolbar so the row reads
  // as a grouped affordance next to the user meta.
  return collapsed ? inner : `<div class="app-sidebar__foot-tools">${inner}</div>`;
}

// Library nav — Ideas / Contexts standalone views. `count` resolves to
// a live count from the relevant store so the trailing `.ap-counter`
// badge stays in sync. Sources moved into per-session ownership; they
// are no longer browseable workspace-wide so the global /sources page
// was dropped. Chats: the recent-conversations list below is the
// canonical entry point for session navigation.
const NAV = [
  {
    path: "/ideas",
    icon: "ap-icon-sparkles",
    label: "Ideas",
    match: (p) => p === "/ideas",
    count: () => getSessions().reduce((n, s) => n + getIdeas(s.id).length, 0),
  },
  {
    path: "/contexts",
    icon: "ap-icon-target",
    label: "Playbooks",
    match: (p) => p === "/contexts",
    count: () => getContexts().length,
  },
];

function renderNav(path) {
  // Action rows at the top of the nav group: New conversation + Search.
  // Both are verbs (not routes), so they live alongside Playbooks / Ideas
  // but never carry the `.is-active` cue. Their ⇧⌘O / ⌘K kbd hints are
  // hover-revealed (cf. sidebar.css — opacity 0 → 1 on :hover/:focus).
  const newConversationItem = `
    <button
      type="button"
      class="app-sidebar__nav-item"
      data-sidebar-new
      aria-label="New chat"
      title="New chat (⇧⌘O)"
    >
      <i class="ap-icon-plus"></i>
      <span>New chat</span>
      <kbd class="app-sidebar__nav-kbd" aria-hidden="true">⇧⌘O</kbd>
    </button>
  `;

  const searchItem = `
    <button
      type="button"
      class="app-sidebar__nav-item"
      data-sidebar-search-open
      aria-label="Search chats"
      title="Search chats (⌘K)"
    >
      <i class="ap-icon-search"></i>
      <span>Search…</span>
      <kbd class="app-sidebar__nav-kbd" aria-hidden="true">⌘K</kbd>
    </button>
  `;

  const routeItems = NAV.filter((item) => item.path !== "/ideas" || isFlagOn("sidebarIdeas"))
    .map((item) => {
      const count = item.count ? item.count() : 0;
      const counter = count > 0 ? `<span class="ap-counter normal grey">${count}</span>` : "";
      return `
      <button
        type="button"
        class="app-sidebar__nav-item ${item.match(path) ? "is-active" : ""}"
        data-sidebar-nav="${item.path}"
        title="${item.label}"
        aria-label="${item.label}"
      >
        <i class="${item.icon}"></i>
        <span>${item.label}</span>
        ${counter}
      </button>
    `;
    })
    .join("");

  return newConversationItem + searchItem + routeItems;
}

// Pinned + Recent groups. Search lives in a dedicated modal now
// (./search-modal.js) — the sidebar always renders the full list.
function renderRecentLists(activeSessionId) {
  const allSessions = getSessions();
  if (isNewUser() || allSessions.length === 0) {
    // FIND-E4: first-run anchor for the recent-conversations list. The
    // bare "No conversations yet" was a dead end — anchor a soft hint
    // that points at the New conversation button just above this list,
    // so the user has an obvious next move without duplicating the
    // primary CTA.
    return `
      <div class="app-sidebar__empty app-sidebar__empty--first-run">
        <span class="app-sidebar__empty-text">No chats yet</span>
        <span class="app-sidebar__empty-hint">
          <i class="ap-icon-arrow-up" aria-hidden="true"></i>
          <span>Start one with the <strong>New chat</strong> button above.</span>
        </span>
      </div>
    `;
  }
  const pinned = allSessions.filter((s) => s.pinned);
  const unpinned = allSessions.filter((s) => !s.pinned);

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

// One conversation row — Claude-style minimal layout:
//   [color dot]  [title]                                          [⋮ on hover]
// The color dot resolves the row's bound playbook color (orange / blue /
// green / etc.); falls back to grey when the session has no playbook
// attached. Pinned status is conveyed only by the PINNED section header
// above the row (no extra glyph on the row itself).
function renderSessionRow(session, activeSessionId) {
  const isActive = session.id === activeSessionId;
  const ctx = session.contextId ? getContextById(session.contextId) : null;
  const dotColor = ctx?.color || "grey";
  const isPinned = !!session.pinned;
  const safeName = escapeHtml(session.name);
  // <div role="button"> rather than <button> so we can nest the <details>
  // dropdown legitimately without breaking HTML semantics.
  return `
    <div
      class="app-sidebar__row ${isActive ? "is-active" : ""}"
      data-sidebar-session="${session.id}"
      data-sidebar-pinned="${isPinned ? "true" : "false"}"
      role="button"
      tabindex="0"
    >
      <span
        class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${dotColor}"
        aria-hidden="true"
      ></span>
      <span class="app-sidebar__row-title">${safeName}</span>
      <details class="ap-select app-sidebar__row-menu" data-sidebar-row-menu>
        <summary
          class="app-sidebar__row-more"
          aria-label="More actions"
          title="More actions"
        >
          <i class="ap-icon-more"></i>
        </summary>
        <div class="ap-action-dropdown app-sidebar__row-menu-dropdown" role="menu">
          <button type="button" class="ap-action-dropdown-item" role="menuitem" data-sidebar-row-rename="${session.id}">
            <i class="ap-icon-pen"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Rename</span>
              </div>
            </div>
          </button>
          <button type="button" class="ap-action-dropdown-item" role="menuitem" data-sidebar-pin="${session.id}">
            <i class="ap-icon-pin"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">${isPinned ? "Unpin" : "Pin"}</span>
              </div>
            </div>
          </button>
          <button type="button" class="ap-action-dropdown-item red-mode" role="menuitem" data-sidebar-row-delete="${session.id}">
            <i class="ap-icon-trash"></i>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">Delete</span>
              </div>
            </div>
          </button>
        </div>
      </details>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

// Toggle the pinned flag on a session via the sessions-store, then
// surface a toast with an Undo action. The store's subscribe hook
// re-renders the sidebar automatically.
function togglePinSidebar(sessionId) {
  const before = getSessionById(sessionId);
  if (!before) return;
  const after = togglePinSession(sessionId);
  if (!after) return;
  import("./toast.js?v=20").then(({ showToast }) => {
    showToast(after.pinned ? "Chat pinned" : "Chat unpinned", {
      action: {
        label: "Undo",
        onClick: () => togglePinSession(sessionId),
      },
    });
  });
}

// Open the rename modal for a session. The modal owns its own input +
// keyboard handling; on Save we patch the session and the store's
// subscribe hook re-renders the sidebar + topbar.
function startRenameSidebar(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  // Close any open dropdown menus that may have triggered this rename.
  document.querySelectorAll(".app-sidebar__row-menu[open]").forEach((el) => el.removeAttribute("open"));
  openRenameModal({
    title: "Rename chat",
    initialName: session.name,
    placeholder: "Chat name",
    confirmLabel: "Save name",
    onSubmit: (name) => updateSession(sessionId, { name }),
  });
}

// Delete a conversation via confirm-modal. Cleans up every per-session
// store before removing from the sessions list, and redirects to the
// dashboard if the user was viewing the deleted session.
function deleteSidebarSession(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  openConfirmModal({
    title: "Delete chat?",
    body: `"${session.name}" and its sources, ideas, and drafts will be permanently removed.`,
    confirmLabel: "Delete chat",
    cancelLabel: "Keep",
    danger: true,
    onConfirm: () => {
      // Sweep per-session state before pulling the row.
      try {
        clearAssistantSession(sessionId);
      } catch {}
      try {
        clearPostsSession(sessionId);
      } catch {}
      try {
        clearLibrarySession(sessionId);
      } catch {}
      try {
        clearSourcesSession(sessionId);
      } catch {}
      deleteSession(sessionId);
      // If the user was viewing this session, bounce them home.
      const activeId = matchSessionId(getPath());
      if (activeId === sessionId) {
        closeRightPanel();
        navigate("/");
      }
      import("./toast.js?v=20").then(({ showToast }) => showToast("Chat deleted"));
    },
  });
}

function matchSessionId(path) {
  const m = /^\/session\/([^/?]+)/.exec(path);
  return m ? m[1] : null;
}
