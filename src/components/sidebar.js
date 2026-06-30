import { html, raw, escapeHtml } from "../utils.js?v=21";
import { navigate, getPath } from "../router.js?v=30";
import { open as openBugReportModal } from "./bug-report-modal.js?v=24";
import { open as openFeedbackModal } from "./feedback-modal.js?v=26";
import { open as openConfirmModal } from "./confirm-modal.js?v=22";
import { open as openRenameModal } from "./rename-modal.js?v=2";
import { open as openSearchModal } from "./search-modal.js?v=5";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=22";
import { renderAdminMenu, applyUserMode, toggleFlag } from "../admin-menu.js?v=5";
import {
  getSessions,
  getSessionById,
  updateSession,
  deleteSession,
  togglePin as togglePinSession,
  subscribe as subscribeSessions,
} from "../sessions-store.js?v=3";
import { isFlagOn } from "../feature-flags.js?v=8";
import { isNewUser } from "../user-mode.js?v=22";
import { getIdeas, clearSession as clearLibrarySession } from "../library.js?v=42";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=31";
import { getConnectedConnectors, subscribe as subscribeConnectors } from "../connectors-store.js?v=25";
import { closePanel as closeRightPanel } from "./right-panel.js?v=261";
import { clearSession as clearAssistantSession } from "../assistant.js?v=52";
import { clearSession as clearPostsSession } from "../posts-store.js?v=31";
import { clearSession as clearSourcesSession } from "../sources-stream.js?v=44";

// Full Archie logo (mark + "archie" wordmark) — the official horizontal
// lockup. Paths carry no fill, so they inherit `fill: currentColor` from
// the CSS, letting the brand colour (and the hover-to-blue) flow through.
const BRAND_LOGO = `<svg class="app-sidebar__brand-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 233" aria-hidden="true" focusable="false"><path d="M463.32,197.98v-73.02c0-20.25-6.08-35.73-18.2-46.46-12.11-10.76-29.58-16.16-52.38-16.16-20.06,0-36.5,4.48-49.33,13.39-12.87,8.97-20.65,21.54-23.41,37.76h30.91c4.74-17.15,18.53-25.7,41.29-25.7s37.36,9.14,40.86,27.47c.32,1.57.55,3.23.73,4.95h-21.57v12.96h-34.26c-19.87,0-35.06,4.33-45.64,12.99-3.71,3.02-6.76,6.49-9.18,10.37-1.8,2.91-3.23,6.06-4.31,9.45-.16.54-.3,1.05-.46,1.57-.13.42-.25.83-.35,1.23-.19.71-.35,1.44-.49,2.19h12.42v27.01h-11.32c2.47,8.13,7.1,15.08,13.84,20.9,10.64,9.21,25.26,13.82,43.87,13.82,12.95,0,24.37-2.48,34.18-7.53,9.86-5.01,17.61-11.87,23.24-20.61h11.49v28.42h32.83v-35.01h-14.76ZM426.92,185.66c-4.74,6.97-11.18,12.43-19.4,16.41-8.18,4.02-17.23,6.03-27.06,6.03-10.95,0-19.52-2.41-25.73-7.26-1.15-.89-2.18-1.83-3.12-2.87h5.42v-27.01h-9.8c1.42-3.64,3.69-6.62,6.86-8.97,5.73-4.26,14.35-6.41,25.8-6.41h32.34v-13.59h21.82v20.95c0,.13,0,.29-.01.43v.07s-.02.04-.03.06v.33h0c-.14,7.86-2.52,15.18-7.1,21.81Z"/><path d="M585.7,62.33h13.42v26.27h-15.07c-16.4,0-29.07,4.84-37.97,14.5-8.96,9.66-13.42,22.69-13.42,39.09v8.21h18.24v30.35h-18.24v52.24h-30.35v-52.24h18.24v-30.35h-18.24v-54.96h-15.87v-32.47h32.82v31.39h11.48c4.55-10.05,11.62-17.87,21.2-23.53,9.58-5.66,20.81-8.5,33.76-8.5Z"/><path d="M753.15,170.98h29.72c-4.04,19.52-12.38,36.04-25.85,46.42-13.5,10.39-30.62,15.6-51.39,15.6-16.63,0-31.11-3.53-43.51-10.52-12.38-7.05-21.99-16.91-28.86-29.7-4.64-8.66-7.7-18.37-9.19-29.13h-15.01v-29.39h14.69c1.3-11.8,4.43-22.38,9.4-31.72,6.74-12.79,16.32-22.65,28.71-29.68,12.38-7.01,26.98-10.54,43.77-10.54,20.02,0,36.76,5.01,50.16,14.91,13.42,9.94,22.2,24.18,26.41,42.79h-30.94c-3.08-10.56-8.41-18.37-15.99-23.35-7.58-5.04-17.44-7.54-29.63-7.54-16.24,0-28.98,5.13-38.2,15.32-6.86,7.61-11.15,17.56-12.84,29.82h-16.15v29.35h16.56c1.96,10.95,6.08,20.03,12.43,27.11,9.21,10.29,21.96,15.44,38.2,15.44,25.31,0,41.66-12.76,47.52-35.21Z"/><path d="M942.65,80.82c12.11,12.11,18.2,28.27,18.2,48.51v41.65h-12.24v27.02h12.24v35.01h-30.66v-35.01h-12.21v-27.02h12.21v-36.44c0-14.79-3.94-25.98-11.9-33.64-7.9-7.66-19.53-11.5-34.85-11.5s-26.69,3.84-34.72,11.5c-8.04,7.66-12.03,18.85-12.03,33.64v98.47h-30.65V0h30.65v91.89h1.08c5.29-9.48,12.68-16.73,22.14-21.77,9.5-4.98,20.69-7.49,33.64-7.49,20.63,0,36.99,6.05,49.1,18.2Z"/><rect x="984.97" y="9.3" width="30.6" height="30.6"/><rect x="984.97" y="62.97" width="30.6" height="170.03"/><path d="M1200,140.58c0-16.09-3.16-29.9-9.57-41.61-6.38-11.66-15.38-20.65-26.94-27.06-11.58-6.38-25.29-9.57-41.15-9.57s-31.09,3.48-43.47,10.42c-12.39,6.9-22.02,16.72-28.86,29.38-6.82,12.67-10.22,27.66-10.22,44.98s3.4,32.48,10.22,45.38c6.84,12.95,16.55,22.94,29.11,29.99,12.58,6.98,27.44,10.51,44.6,10.51,19.49,0,35.84-4.64,49.07-13.95,13.22-9.3,21.84-22.43,25.84-39.36h-31.16c-2.9,9.09-8.18,15.98-15.84,20.65-7.67,4.61-17.09,6.93-28.2,6.93-16.02,0-28.84-4.77-38.38-14.35-9.58-9.55-14.83-22.91-15.75-40.05h130.72v-12.28ZM1070.36,130.45c2.56-13.47,8.37-23.97,17.55-31.48,9.06-7.44,20.49-11.18,34.14-11.18s25.02,3.73,33.51,11.18c8.5,7.51,13.45,18.01,14.9,31.48h-100.1Z"/><path d="M227.15,144.95v29.37c0,4.69-3.81,8.5-8.5,8.5h-29.37c-4.69,0-8.5-3.81-8.5-8.5v-27.11c0-4.69-3.78-8.5-8.47-8.5h-27.45c-4.69,0-8.5,3.81-8.5,8.5v26.91c0,4.69-3.78,8.47-8.47,8.47h-28.92c-4.69,0-8.5,3.81-8.5,8.5v33.89c0,4.69-3.78,8.47-8.47,8.47h-32.67c-4.69,0-8.47-3.78-8.47-8.47v-34.03c0-4.69-3.81-8.47-8.5-8.47H8.47c-4.69,0-8.47-3.81-8.47-8.5v-23.86c0-4.69,3.78-8.47,8.47-8.47h23.89c4.69,0,8.5-3.81,8.5-8.5v-14.18c0-4.69,3.78-8.5,8.47-8.5h16.07c4.69,0,8.47-3.78,8.47-8.44v-30.55c0-4.69,3.78-8.5,8.47-8.5h32.64c4.69,0,8.47,3.81,8.47,8.5v32.11c0,4.69-3.78,8.47-8.47,8.47h-32.64c-4.69,0-8.47,3.81-8.47,8.5v14.46c0,4.69-3.81,8.5-8.5,8.5h-16.04c-4.69,0-8.47,3.78-8.47,8.47v20.05c0,4.69,3.78,8.5,8.47,8.5h32.67c4.69,0,8.47-3.81,8.47-8.5v-26.83c0-4.72,3.81-8.5,8.5-8.5h30.38c3.87,0,7-3.13,7-7v-26.94c0-4.69,3.81-8.5,8.5-8.5h27.45c4.69,0,8.47,3.81,8.47,8.5v25.22c0,4.69,3.81,8.47,8.5,8.47h29.37c4.69,0,8.5,3.81,8.5,8.5Z"/></svg>`;

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

// Was the current collapsed state forced by the width-reactive logic
// (panel open on a narrow viewport) rather than chosen by the user? Only an
// auto-collapse may be auto-undone when the viewport grows back — a manual
// collapse stays until the user re-opens it. Cleared on any manual toggle.
let autoCollapsed = false;
export function isAutoCollapsed() {
  return autoCollapsed && isSidebarCollapsed();
}

// `auto: true` marks the change as width-driven (see isAutoCollapsed). A
// manual call (default) hands control back to the user, so the auto flag is
// dropped and the viewport logic won't fight their choice.
export function setSidebarCollapsed(collapsed, { auto = false } = {}) {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  autoCollapsed = auto && collapsed;
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
  // The popmenu is position:fixed (the sidebar clips overflow), so anchor it
  // to the cog's rect each time it opens. Collapsed rail → to the right of the
  // icon, growing up from the cog's bottom. Expanded → above the cog, left-
  // aligned so the wider panel opens rightward over the content.
  if (open && popmenu && trigger) {
    const rect = trigger.getBoundingClientRect();
    if (popmenu.classList.contains("app-sidebar__foot-popmenu--collapsed")) {
      popmenu.style.left = `${rect.right + 8}px`;
      popmenu.style.bottom = `${window.innerHeight - rect.bottom}px`;
    } else {
      popmenu.style.left = `${rect.left}px`;
      popmenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }
  }
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
    if (event.target.closest("[data-sidebar-home]") || event.target.closest("[data-sidebar-new]")) {
      // Brand button + "New chat" row both mint a fresh conversation.
      // `/` resolves to the most-recent session for returning users
      // (cf. dashboard.js redirect), which felt like the brand button
      // was "swallowing" the click into an existing chat. Treat both
      // entry-points the same: close any leftover right-panel and
      // mint a unique session id so the per-id stores start clean.
      closeRightPanel();
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
    // Admin (cog popover) — feature-flag toggle. Reloads so stores re-read it.
    const flagRow = event.target.closest("[data-admin-flag]");
    if (flagRow) {
      event.preventDefault();
      toggleFlag(flagRow.dataset.adminFlag);
    }
  });

  // Admin (cog popover) — user-mode radio change applies the mode + reloads.
  el.addEventListener("change", (event) => {
    const radio = event.target.closest('[name="sidebar-admin-user-mode"]');
    if (radio) applyUserMode(radio.value);
  });

  // Keyboard activation for the conversation row — it's a <div role="button">
  // (HTML forbids nesting <details> inside <button>), so Enter/Space need
  // explicit wiring to navigate. Other interactive children (rename, pin,
  // delete, summary) are real <button>/<summary> elements and handle Enter
  // natively; we only intervene when focus is on the row itself.
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-sidebar-session]");
    if (!row || event.target !== row) return;
    event.preventDefault();
    navigate(`/session/${row.dataset.sidebarSession}`);
  });

  // Live-rerender on store mutations so the nav counters and any context
  // colors used by session rows stay in sync without waiting for the next
  // route change.
  subscribeContexts(() => renderSidebar());
  subscribeSessions(() => renderSidebar());
  subscribeConnectors(() => renderSidebar());

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
        <span class="app-sidebar__brand-logo">${raw(BRAND_LOGO)}</span>
        <span class="app-sidebar__brand-beta ap-badge blue">BETA</span>
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
        ${renderAdminMenu()}
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
  {
    path: "/connectors",
    icon: "ap-icon-view-grid",
    label: "Connectors",
    match: (p) => p === "/connectors",
    count: () => getConnectedConnectors().length,
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

  const routeItems = NAV.filter((item) => {
    if (item.path === "/ideas") return isFlagOn("sidebarIdeas");
    if (item.path === "/connectors") return isFlagOn("connectors");
    return true;
  })
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
        <div class="app-sidebar__empty-icon">
          <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
        </div>
        <span class="app-sidebar__empty-text">No chats yet</span>
        <span class="app-sidebar__empty-hint">Start one with the New chat button above.</span>
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
