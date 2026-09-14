import { html, raw, escapeHtml } from "../utils.js?v=1159";
import { navigate, getPath } from "../router.js?v=1159";
import { open as openBugReportModal } from "./bug-report-modal.js?v=1159";
import { open as openFeedbackModal } from "./feedback-modal.js?v=1159";
import { open as openConfirmModal } from "./confirm-modal.js?v=1159";
import { open as openRenameModal } from "./rename-modal.js?v=1159";
import { open as openSearchModal } from "./search-modal.js?v=1159";
import { toggle as toggleShortcutLegend } from "./shortcut-legend.js?v=1159";
import { renderAdminMenu, applyUserMode, applyOrgRole, toggleFlag } from "../admin-menu.js?v=1159";
import {
  getSessions,
  getSessionById,
  updateSession,
  deleteSession,
  togglePin as togglePinSession,
  subscribe as subscribeSessions,
} from "../sessions-store.js?v=1159";
import { isFlagOn } from "../feature-flags.js?v=1159";
import { isNewUser } from "../user-mode.js?v=1159";
import { clearSession as clearLibrarySession } from "../library.js?v=1159";
import { getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=1159";
import {
  getActivePlaybook,
  setActivePlaybook,
  isWorkspaceMode,
  scopeSessions,
  playbookForNewWork,
  catalogueRoute,
  subscribe as subscribeScope,
} from "../active-playbook.js?v=1159";
import { setHandoff } from "../handoff.js?v=1159";
// A Playbook nobody shared with me must not surface here either — the store
// still holds it (see playbook-access.js), the sidebar just doesn't name it.
import { canView, visibleContexts } from "../playbook-access.js?v=1159";
import { getFeedForPlaybook } from "../topic-feeds-store.js?v=1159";
import { countToReview, subscribe as subscribeTopics } from "../topics-store.js?v=1159";
import { getConnectedConnectors, subscribe as subscribeConnectors } from "../connectors-store.js?v=1159";
import { closePanel as closeRightPanel } from "./right-panel.js?v=1159";
import { clearSession as clearAssistantSession } from "../assistant.js?v=1159";
import { clearSession as clearPostsSession } from "../posts-store.js?v=1159";
import { clearSession as clearSourcesSession } from "../sources-stream.js?v=1159";

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

// Recent-chats "Sort & group" control.
// The chosen { groupBy, sortBy } persists across reloads — mirror the
// feature-flags localStorage idiom (defensive JSON read, merge with defaults).
const ORGANIZE_KEY = "archie-chat-organize";
const ORGANIZE_DEFAULTS = { groupBy: "none", sortBy: "recency" };

let organizeOpen = false;

function getOrganizePrefs() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ORGANIZE_KEY) || "{}");
    return { ...ORGANIZE_DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    return { ...ORGANIZE_DEFAULTS };
  }
}

function setOrganizePref(key, value) {
  try {
    const prefs = getOrganizePrefs();
    prefs[key] = value;
    window.localStorage.setItem(ORGANIZE_KEY, JSON.stringify(prefs));
  } catch {
    /* private-browsing / storage disabled — ignore, prefs stay session-local */
  }
}

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

function closePlaybookSwitcher() {
  document.querySelector("[data-pb-switcher][open]")?.removeAttribute("open");
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

// Open/close the "Sort & group" popover. Mirrors setMenuOpen: the panel is
// position:fixed (the sidebar clips overflow), so anchor it to the trigger's
// rect each open — dropping down from just below the filter button, left-aligned
// so the row flyouts have room to open rightward over the content.
function setOrganizeMenuOpen(open) {
  organizeOpen = open;
  const menu = document.querySelector("[data-sidebar-organize-menu]");
  const trigger = document.querySelector("[data-sidebar-organize-toggle]");
  if (menu) menu.hidden = !open;
  if (trigger) trigger.setAttribute("aria-expanded", String(open));
  if (open && menu && trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 6}px`;
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
    // The wordmark, in workspace mode, is the door to the level ABOVE the
    // work: the account home — every brand, every chat, and a box to start
    // from. Before the switcher there was no such level, which is why it used
    // to mint a chat like the row under it; that is still the flag-OFF path
    // below, and "New chat" keeps that job in both modes.
    if (isWorkspaceMode() && event.target.closest("[data-sidebar-home]")) {
      closeRightPanel();
      navigate("/home");
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
    // Playbook switcher — pick a brand, or the two footer verbs. The <details>
    // is closed by hand: picking re-renders the whole rail anyway, but
    // "Manage" / "Create" navigate away and a re-render on arrival would
    // otherwise bring the open dropdown back with it.
    const pbPick = event.target.closest("[data-pb-switch-pick]");
    if (pbPick) {
      event.preventDefault();
      closePlaybookSwitcher();
      switchPlaybook(pbPick.dataset.pbSwitchPick);
      return;
    }
    if (event.target.closest("[data-pb-switch-manage]")) {
      event.preventDefault();
      closePlaybookSwitcher();
      // The catalogue is the home's Playbooks TAB in this mode — through the
      // helper, which carries it, rather than a bare `/home` that would open on
      // Chats under a control labelled "All playbooks".
      navigate(catalogueRoute());
      return;
    }
    if (event.target.closest("[data-pb-switch-create]")) {
      // Same handoff as /contexts' "New Playbook": the builder runs as a
      // conversation in its own transient session, and hands back to the
      // library when it's done.
      event.preventDefault();
      closePlaybookSwitcher();
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: catalogueRoute() });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
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
    // "Sort & group" control — toggle the popover on its trigger.
    if (event.target.closest("[data-sidebar-organize-toggle]")) {
      setOrganizeMenuOpen(!organizeOpen);
      return;
    }
    // "Sort & group" — pick an option (groupBy / sortBy). Persist, close, and
    // re-render so the recent list reorders/regroups.
    const organizeOpt = event.target.closest("[data-sidebar-organize-set]");
    if (organizeOpt) {
      event.preventDefault();
      const { organizeKey, organizeValue } = organizeOpt.dataset;
      if (organizeKey && organizeValue) {
        setOrganizePref(organizeKey, organizeValue);
        setOrganizeMenuOpen(false);
        renderSidebar();
      }
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

  // Admin (cog popover) — user-mode and org-role radios both apply + reload.
  el.addEventListener("change", (event) => {
    const mode = event.target.closest('[name="sidebar-admin-user-mode"]');
    if (mode) {
      applyUserMode(mode.value);
      return;
    }
    const role = event.target.closest('[name="sidebar-admin-org-role"]');
    if (role) applyOrgRole(role.value);
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

  // A <details> doesn't close itself on an outside click, and this one is the
  // one dropdown in the rail that survives a click on the page (the row menus
  // are re-rendered away by navigation).
  document.addEventListener("click", (event) => {
    const open = el.querySelector("[data-pb-switcher][open]");
    if (open && !open.contains(event.target)) open.removeAttribute("open");
  });

  // Live-rerender on store mutations so the nav counters and any context
  // colors used by session rows stay in sync without waiting for the next
  // route change.
  subscribeContexts(() => renderSidebar());
  // The switcher prints the active brand and the list under it is scoped to
  // that brand, so a scope change repaints the whole rail.
  subscribeScope(() => renderSidebar());
  subscribeSessions(() => renderSidebar());
  subscribeConnectors(() => renderSidebar());
  // A Topic used or ignored anywhere has to move the unread mark immediately —
  // the reader may never leave the page it happened on.
  subscribeTopics(() => renderSidebar());

  // Click outside the popmenu → close.
  document.addEventListener("click", (event) => {
    if (!menuOpen) return;
    if (event.target.closest("[data-sidebar-foot-menu], [data-sidebar-foot-toggle]")) return;
    setMenuOpen(false);
  });

  // Click outside the "Sort & group" popover → close.
  document.addEventListener("click", (event) => {
    if (!organizeOpen) return;
    if (event.target.closest("[data-sidebar-organize-menu], [data-sidebar-organize-toggle]")) return;
    setOrganizeMenuOpen(false);
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
    if (organizeOpen) setOrganizeMenuOpen(false);
  });

  // Cmd/Ctrl+B toggles the sidebar — matches Claude.ai. Skip the binding when
  // the user is typing into an input/textarea/contenteditable so it never
  // hijacks composer input.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (event.key === "Escape" && organizeOpen) {
      setOrganizeMenuOpen(false);
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
  organizeOpen = false;
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

      ${raw(renderPlaybookSwitcher({ collapsed: true }))}

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
        <h3 class="app-sidebar__brand-title">Archie</h3>
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

    ${raw(renderPlaybookSwitcher({ collapsed: false }))}

    <nav class="app-sidebar__nav" aria-label="Library">${raw(renderNav(path))}</nav>

    ${raw(renderOrganizeHeader())}

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

// Initials for the collapsed rail. Playbooks are named "Brand · framing", so
// the part before the separator is the identity — "Acme · Q2 marketing" is an
// A, not an AQ. Two letters at most, from the first two words of that part.
function playbookInitials(name) {
  const brand = String(name || "").split("·")[0];
  const words = brand.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

// ── The Playbook switcher — the scope, worn at the top of the rail ─────────
//
// One question, asked once, above everything it governs. It replaces the six
// pickers that each asked it separately — see the header of active-playbook.js
// for the list, what a global scope costs, and why there is no "All playbooks"
// row here.
//
// It sits UNDER the wordmark and ABOVE New chat, which is the whole claim of
// the layout: Archie is the product, the brand is the scope, and everything
// below the switcher — New chat, Search, the nav, the chat list — belongs to
// the brand named in it. Same DS `.ap-select` as the composer control it
// replaces, inline label included: a scope that hides is only safe while it is
// legible, and the label is what says WHAT is being switched.
//
// Collapsed rail: the dot alone can't be legible, so the button doesn't try to
// switch — it re-opens the rail, where the name is.
function renderPlaybookSwitcher({ collapsed }) {
  if (!isWorkspaceMode()) return "";
  const active = getActivePlaybook();
  const dotClass = `app-sidebar__row-color-dot app-sidebar__row-color-dot--${active?.color || "grey"}`;

  if (collapsed) {
    if (!active) return "";
    // The brand's initials in a DS square avatar — the same "identity in a
    // small box" the user row wears at the bottom of the rail, and what every
    // collapsed workspace switcher shows. An 8px dot alone was tried and read
    // as a stray marker rather than a control: at this width the letters are
    // the only thing that still names the brand.
    return `
      <div class="app-sidebar__pb app-sidebar__pb--collapsed">
        <button
          type="button"
          class="app-sidebar__pb-chip"
          data-sidebar-toggle
          aria-label="Playbook: ${escapeHtml(active.name)} — expand to switch"
          title="Playbook: ${escapeHtml(active.name)} — expand to switch"
        >
          <span class="ap-avatar square size-24">
            <span class="ap-avatar-initials">${escapeHtml(playbookInitials(active.name))}</span>
          </span>
        </button>
      </div>
    `;
  }

  // No Playbook at all (new-alt mode, first run): the switcher has nothing to
  // switch between, so it becomes the one thing that helps — the offer to make
  // the first one. Rendering an empty select here would be a control that
  // opens onto nothing.
  if (!active) {
    return `
      <div class="app-sidebar__pb">
        <button type="button" class="app-sidebar__nav-item app-sidebar__pb-empty" data-pb-switch-create>
          <i class="ap-icon-plus" aria-hidden="true"></i>
          <span>Create a playbook</span>
        </button>
      </div>
    `;
  }

  const options = visibleContexts()
    .map((c) => {
      const isSel = c.id === active.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-pb-switch-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${c.color || "grey"}" aria-hidden="true"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div class="app-sidebar__pb">
      <details class="ap-select app-sidebar__pb-select" data-pb-switcher>
        <summary
          class="ap-select-trigger app-sidebar__pb-trigger"
          title="Playbook: ${escapeHtml(active.name)} — switch"
        >
          <span class="${dotClass}" aria-hidden="true"></span>
          <span class="ap-select-inline-label">Playbook</span>
          <span class="ap-select-value">${escapeHtml(active.name)}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown app-sidebar__pb-dropdown" role="listbox" aria-label="Switch playbook">
          <div class="ap-select-options">${options}</div>
          <div class="ap-select-footer">
            <button type="button" class="ap-select-create" data-pb-switch-manage>
              <i class="ap-icon-stack ap-select-create-icon" aria-hidden="true"></i>
              <span>All playbooks</span>
            </button>
            <button type="button" class="ap-select-create" data-pb-switch-create>
              <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
              <span>Create a playbook</span>
            </button>
          </div>
        </div>
      </details>
    </div>
  `;
}

// Switching brand. The list, the nav counts and the feed re-scope themselves
// off the store's notify — but a CHAT does not: it keeps the Playbook it was
// born with (CONCEPTS §2), so the one you are reading is now outside the scope
// and no longer in the list under it. So a switch made from a chat lands on
// that brand's most recent chat, or on a fresh one when it has none. Every
// other route stays put and simply re-paints.
function switchPlaybook(id) {
  const previous = getActivePlaybook()?.id;
  if (!id || id === previous) return;
  const path = getPath();
  // Was I reading the workspace's OWN fiche? Then the SURFACE is "this brand's
  // Playbook", not that one brand — so it re-points to the brand just picked,
  // exactly as /topics and Insights re-point themselves. It has to be answered
  // BEFORE the switch: a moment later the path's id is no longer the active
  // one, which is also why leaving it alone was worse than a stale page —
  // isAccountScope() would start calling it another brand's fiche while
  // `body.account-scope` (only written on a route change) still said workspace,
  // so the rail named Pawtrack above Acme's sheet.
  const onOwnFiche = !!previous && path === `/playbook/${previous}`;
  setActivePlaybook(id);
  if (path.startsWith("/session/")) {
    // `/` IS "this brand's home": a pure redirect to the most recent chat in
    // scope, or a fresh one ([`screens/dashboard.js`]). Computing the
    // destination here too is how two answers to one question start to drift —
    // the topbar's way back from the catalogue asks the same thing.
    closeRightPanel();
    navigate("/");
    return;
  }
  if (onOwnFiche) {
    navigate(`/playbook/${id}`);
    return;
  }
  // Everything else is a surface with no brand in its URL (the feed, its
  // settings, Insights): the scope notify repaints it where it stands.
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

// Library nav — Playbooks / Connectors standalone views. `count` resolves
// to a live count from the relevant store so the trailing `.ap-counter`
// badge stays in sync. Sources moved into per-session ownership; they
// are no longer browseable workspace-wide so the global /sources page
// was dropped, and the standalone /ideas library was removed too (ideas
// now live only inside a session + the right panel). Chats: the
// recent-conversations list below is the canonical entry point for
// session navigation.
// `flag` gates the row declaratively (was a hardcoded `if` on /connectors). It
// takes a list when a row needs several flags, because a row that survives one
// of its dependencies is worse than no row.
const NAV = [
  {
    path: "/contexts",
    icon: "ap-icon-target",
    label: "Playbooks",
    match: (p) => p === "/contexts",
    count: () => visibleContexts().length,
  },
  // ⚠️ In workspace mode that row is REPLACED, not kept — see workspaceNav().
  // "Playbooks 8" was the only row in a one-brand rail whose destination talked
  // about the seven others, and a second door to them beside the switcher —
  // one that didn't admit it changed scope.
  {
    path: "/connectors",
    icon: "ap-icon-view-grid",
    label: "Connectors",
    flag: "connectors",
    match: (p) => p === "/connectors",
    count: () => getConnectedConnectors().length,
  },
  // The antenna is the listening glyph. The counter is Topics still TO REVIEW in
  // the DEFAULT Playbook's feed — the row is a notification, so it counts what
  // is waiting for an answer rather than everything the feed holds.
  //
  // Scoped to the default Playbook rather than summed across every one, because
  // the feed itself is scoped: a count that spans four brands would send the
  // reader to a screen showing one of them. Which Playbook that is comes from
  // playbookForNewWork(): the active one in workspace mode, the default
  // otherwise — the same resolution the feed itself uses, so the count and the
  // screen it sends you to can never name two different brands.
  // Insights — the one analytics surface you walk to. NO COUNTER, deliberately:
  // the row above reads "Playbooks 7" — a count of THINGS — so an identically
  // styled "Insights 5" gets read as five insights rather than five objectives
  // in trouble.
  {
    path: "/insights",
    icon: "ap-icon-bar-graph",
    label: "Insights",
    flag: "insightsHub",
    match: (p) => p.startsWith("/insights"),
  },
  {
    path: "/topics",
    icon: "ap-icon-antenna",
    label: "Topic Feed",
    flag: "topicFeed",
    // Prefix, not equality: the row stays lit on /topics/settings, which is
    // still the Topic Feed rather than somewhere else.
    match: (p) => p.startsWith("/topics"),
    count: () => {
      const pb = playbookForNewWork() || visibleContexts()[0] || null;
      const feed = pb ? getFeedForPlaybook(pb.id) : null;
      return feed ? countToReview(feed.id) : 0;
    },
  },
];

// The nav, in workspace mode: the catalogue row becomes THIS brand's fiche.
//
// Singular, no counter — a count of one is noise, and the 8 it used to print
// was the cross-brand leak. It is also the honest frequency: while you work you
// open the fiche of the brand you are in (voice, audience, brand) far more often
// than the list of all of them, which you open to switch, create or delete. The
// list moved up to the switcher's footer ("All playbooks"), the one control that
// announces it changes scope.
//
// No active Playbook (new-alt, nothing created yet) → no row at all: the
// switcher is already rendering the offer to create the first one.
function workspaceNav(items) {
  if (!isWorkspaceMode()) return items;
  const active = getActivePlaybook();
  const fiche = active ? `/playbook/${active.id}` : null;
  return items
    .map((item) => {
      if (item.path !== "/contexts") return item;
      if (!fiche) return null;
      return {
        path: fiche,
        icon: "ap-icon-target",
        label: "Playbook",
        match: (p) => p === fiche,
      };
    })
    .filter(Boolean);
}

function renderNav(path) {
  // Action rows at the top of the nav group: New conversation + Search.
  // Both are verbs (not routes), so they live alongside Playbooks / Connectors
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

  const routeItems = workspaceNav(NAV.filter((item) => !item.flag || [item.flag].flat().every(isFlagOn)))
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

// "Sort & group" control — options for the two rows. Grouping is limited to the
// dimensions the session record supports: Playbook (contextId) and Date
// (derived from the lastActivity label). Sorting is name or the current
// (recency) order.
const ORGANIZE_GROUP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "playbook", label: "Playbook" },
  { value: "date", label: "Date" },
];

// The options actually offered, and the grouping actually applied. In workspace
// mode the list already IS one Playbook, so "Group by → Playbook" would draw a
// single heading over everything — the option goes, and a preference stored
// before the switch falls back to None rather than rendering that heading.
function organizeGroupOptions() {
  return isWorkspaceMode() ? ORGANIZE_GROUP_OPTIONS.filter((o) => o.value !== "playbook") : ORGANIZE_GROUP_OPTIONS;
}

function effectiveGroupBy(groupBy) {
  return isWorkspaceMode() && groupBy === "playbook" ? "none" : groupBy;
}
const ORGANIZE_SORT_OPTIONS = [
  { value: "recency", label: "Recency" },
  { value: "alphabetical", label: "Alphabetical" },
];

// Chronological buckets for "Group by → Date", most-recent first. Rendered in
// this order, empty buckets skipped.
const ORGANIZE_DATE_BUCKETS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

// Map a session to a date bucket. Sessions carry no real timestamp — only the
// human `lastActivity` label ("2 hours ago", "Yesterday", "5 days ago", "just
// now") — so parse that. Unknown / undated → "Older".
function sessionDateBucket(session) {
  const s = (session.lastActivity || "").toLowerCase();
  if (
    !s ||
    s.includes("now") ||
    s.includes("today") ||
    s.includes("second") ||
    s.includes("min") ||
    s.includes("hour") ||
    s.includes("hr")
  ) {
    return "Today";
  }
  if (s.includes("yesterday")) return "Yesterday";
  const dayMatch = s.match(/(\d+)\s*day/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    if (n <= 1) return "Yesterday";
    if (n <= 7) return "Previous 7 days";
    if (n <= 30) return "Previous 30 days";
    return "Older";
  }
  const weekMatch = s.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7 <= 30 ? "Previous 30 days" : "Older";
  if (s.includes("week")) return "Previous 30 days";
  return "Older";
}

// Apply the active sort to a list of sessions. "recency" keeps the store order
// (sessions are seeded newest-first); "alphabetical" sorts by name.
function sortSessions(list, sortBy) {
  if (sortBy === "alphabetical") {
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return list.slice();
}

// One section of the "Sort & group" popover — a quiet label + its option rows,
// the active one marked with a check. Deliberately FLAT: the ADS has no
// nested/flyout-dropdown pattern, so all options are shown at once inside a
// single action-dropdown, reusing only the DS item + divider primitives.
function renderOrganizeSection(label, key, options, current) {
  const items = options
    .map((opt) => {
      const active = opt.value === current;
      return `
        <button
          type="button"
          role="menuitemradio"
          aria-checked="${active ? "true" : "false"}"
          class="ap-action-dropdown-item"
          data-sidebar-organize-set
          data-organize-key="${key}"
          data-organize-value="${opt.value}"
        >
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">${opt.label}</span>
            </div>
          </div>
          ${active ? `<i class="ap-icon-check app-sidebar__organize-check" aria-hidden="true"></i>` : ""}
        </button>
      `;
    })
    .join("");
  return `
    <div class="app-sidebar__organize-section" role="group" aria-label="${label}">
      <div class="app-sidebar__organize-section-label" aria-hidden="true">${label}</div>
      ${items}
    </div>
  `;
}

// Header row above the recent-chats list: a quiet "Chats" caption + a filter
// button that opens the Group by / Sort by popover.
function renderOrganizeHeader() {
  const { groupBy, sortBy } = getOrganizePrefs();
  return `
    <div class="app-sidebar__list-header">
      <span class="app-sidebar__list-header-label">Chats</span>
      <button
        type="button"
        class="ap-icon-button transparent app-sidebar__organize-toggle"
        data-sidebar-organize-toggle
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="Sort & group chats"
        title="Sort & group chats"
      >
        <i class="ap-icon-filter"></i>
      </button>
      <div class="ap-action-dropdown app-sidebar__organize-menu" role="menu" data-sidebar-organize-menu hidden>
        ${renderOrganizeSection("Group by", "groupBy", organizeGroupOptions(), effectiveGroupBy(groupBy))}
        <div class="ap-action-dropdown-divider" role="separator"></div>
        ${renderOrganizeSection("Sort by", "sortBy", ORGANIZE_SORT_OPTIONS, sortBy)}
      </div>
    </div>
  `;
}

// Pinned + Recent groups. Search lives in a dedicated modal now
// (./search-modal.js) — the sidebar always renders the full list.
function renderRecentLists(activeSessionId) {
  // Scoped to the active Playbook in workspace mode — the rail under the
  // switcher is that brand's work and nothing else.
  const allSessions = scopeSessions(getSessions());
  if (isNewUser() || allSessions.length === 0) {
    // FIND-E4: first-run anchor for the recent-conversations list. The
    // bare "No conversations yet" was a dead end — anchor a soft hint
    // that points at the New conversation button just above this list,
    // so the user has an obvious next move without duplicating the
    // primary CTA.
    // A scope that hides has to say so: chats DO exist, just not in this
    // brand, and "No chats yet" under a switcher would read as "the app is
    // empty" instead of "you're looking at Acme".
    const scopedEmpty = !isNewUser() && getSessions().length > 0;
    return `
      <div class="app-sidebar__empty app-sidebar__empty--first-run">
        <div class="app-sidebar__empty-icon">
          <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
        </div>
        <span class="app-sidebar__empty-text">${scopedEmpty ? "No chats in this playbook" : "No chats yet"}</span>
        <span class="app-sidebar__empty-hint">Start one with the New chat button above.</span>
      </div>
    `;
  }
  const { groupBy: storedGroupBy, sortBy } = getOrganizePrefs();
  const groupBy = effectiveGroupBy(storedGroupBy);

  const pinned = sortSessions(
    allSessions.filter((s) => s.pinned),
    sortBy,
  );
  const unpinned = sortSessions(
    allSessions.filter((s) => !s.pinned),
    sortBy,
  );

  const heading = (label) => `<div class="app-sidebar__section-heading">${escapeHtml(label)}</div>`;
  const rows = (list) => list.map((s) => renderSessionRow(s, activeSessionId)).join("");

  let out = "";
  // Pinned always leads, regardless of grouping.
  if (pinned.length > 0) {
    out += heading("Pinned");
    out += rows(pinned);
  }

  if (groupBy === "playbook") {
    // Bucket the unpinned rows by their Playbook (contextId), ordered by first
    // appearance in the sorted list; a "No playbook" bucket is forced last.
    const buckets = new Map();
    const NONE = "__none__";
    for (const s of unpinned) {
      const ctx = visibleCtx(s.contextId);
      const key = ctx?.id || NONE;
      if (!buckets.has(key)) {
        buckets.set(key, { label: ctx?.name || "No playbook", rows: [] });
      }
      buckets.get(key).rows.push(s);
    }
    const ordered = [...buckets.entries()].sort(([a], [b]) => {
      if (a === NONE) return 1;
      if (b === NONE) return -1;
      return 0;
    });
    for (const [, bucket] of ordered) {
      out += heading(bucket.label);
      out += rows(bucket.rows);
    }
  } else if (groupBy === "date") {
    // Bucket the unpinned rows by recency, rendered in fixed chronological
    // order (most-recent first); empty buckets are skipped.
    const buckets = new Map();
    for (const s of unpinned) {
      const label = sessionDateBucket(s);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(s);
    }
    for (const label of ORGANIZE_DATE_BUCKETS) {
      const bucketRows = buckets.get(label);
      if (bucketRows && bucketRows.length > 0) {
        out += heading(label);
        out += rows(bucketRows);
      }
    }
  } else if (unpinned.length > 0) {
    out += heading("Recent");
    out += rows(unpinned);
  }
  return out;
}

// One conversation row — Claude-style minimal layout:
//   [color dot]  [title]                                          [⋮ on hover]
// The color dot resolves the row's bound playbook color (orange / blue /
// green / etc.); falls back to grey when the session has no playbook
// attached. Pinned status is conveyed only by the PINNED section header
// above the row (no extra glyph on the row itself).
// The Playbook behind a chat, but only when I'm allowed to see it: a chat that
// lost access falls back to the grey dot and the "No playbook" bucket rather
// than advertising a name I can't open.
function visibleCtx(contextId) {
  if (!contextId) return null;
  const ctx = getContextById(contextId);
  return ctx && canView(ctx) ? ctx : null;
}

function renderSessionRow(session, activeSessionId) {
  const isActive = session.id === activeSessionId;
  const ctx = visibleCtx(session.contextId);
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
  import("./toast.js?v=1159").then(({ showToast }) => {
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
      import("./toast.js?v=1159").then(({ showToast }) => showToast("Chat deleted"));
    },
  });
}

function matchSessionId(path) {
  const m = /^\/session\/([^/?]+)/.exec(path);
  return m ? m[1] : null;
}
