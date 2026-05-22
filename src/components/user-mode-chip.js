import { FLAGS } from "../ff-catalog.js?v=2";
import { getFlags, setFlag } from "../feature-flags.js?v=2";
import { getUserMode, setUserMode } from "../user-mode.js?v=21";

// Floating admin chip in the bottom-right. Opens prototype-only controls
// (user-mode toggle + feature flags). Controls reload the page on change.

export function initUserModeChip() {
  if (document.getElementById("archieAdminChip")) return;

  let open = false;
  const root = document.createElement("div");
  root.id = "archieAdminChipRoot";
  root.className = "admin-chip-root";

  const el = document.createElement("button");
  el.id = "archieAdminChip";
  el.type = "button";
  el.setAttribute("aria-haspopup", "menu");
  el.setAttribute("aria-expanded", "false");
  el.setAttribute("aria-controls", "archieAdminMenu");

  const menu = document.createElement("div");
  menu.id = "archieAdminMenu";
  menu.className = "admin-menu ap-action-dropdown";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  function modeLabel(mode) {
    if (mode === "new") return "First-time user";
    if (mode === "new-alt") return "First-time ALT";
    return "Returning user";
  }
  // Description of the NEXT mode you'd cycle into, so the menu row reads
  // "first-time user · refresh" while you're returning, etc.
  function nextModeLabel(mode) {
    if (mode === "returning") return "first-time user";
    if (mode === "new") return "first-time ALT";
    return "returning user";
  }

  function render() {
    const mode = getUserMode();
    const flags = getFlags();

    const isNewish = mode === "new" || mode === "new-alt";
    el.className = "admin-chip" + (isNewish ? " admin-chip--new" : "");
    el.setAttribute("aria-label", `Admin: currently showing ${modeLabel(mode).toLowerCase()}. Open controls.`);
    el.setAttribute("aria-expanded", open ? "true" : "false");
    el.innerHTML = `
      <span class="admin-chip__label">Admin</span>
      <span class="admin-chip__divider">·</span>
      <span class="admin-chip__mode">${modeLabel(mode)}</span>
      <i class="ap-icon-chevron-${open ? "down" : "up"} admin-chip__icon"></i>
    `;

    menu.hidden = !open;
    menu.innerHTML = `
      <button type="button" class="ap-action-dropdown-item admin-menu__row" data-admin-user-mode role="menuitem">
        <span class="ap-action-dropdown-item-text">
          <span class="ap-action-dropdown-item-label bold">User mode</span>
          <span class="ap-action-dropdown-item-description">
            ${nextModeLabel(mode)} · refresh
          </span>
        </span>
        <i class="ap-icon-refresh" aria-hidden="true"></i>
      </button>
      <div class="ap-action-dropdown-divider" role="separator"></div>
      <div class="admin-menu__section-title">Feature flags</div>
      ${FLAGS.map((flag) => renderFlagRow(flag, flags[flag.id])).join("")}
    `;
  }

  function setOpen(next) {
    open = next;
    render();
  }

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!open);
  });

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target.matches("[data-admin-flag] input")) return;
    const modeBtn = event.target.closest("[data-admin-user-mode]");
    if (modeBtn) {
      // 3-state cycle: returning → new → new-alt → returning. Each
      // transition mutates localStorage, optionally repositions the URL
      // (so the user lands in a coherent screen for the new mode), then
      // forces a full reload so every store re-seeds. location.replace
      // alone is unreliable — replacing to the same URL is a no-op in
      // Chrome, so we mutate location.hash explicitly and then call
      // reload().
      const mode = getUserMode();
      try {
        window.sessionStorage.clear();
      } catch {
        // ignore — storage may be unavailable in private browsing
      }

      if (mode === "returning") {
        // → first-time (linear /welcome wizard).
        try {
          window.localStorage.setItem("archie-user-mode", "new");
        } catch {
          /* ignore */
        }
        if (!window.location.hash.startsWith("#/welcome")) {
          window.location.hash = "#/welcome";
        }
      } else if (mode === "new") {
        // → first-time ALT (visual profile picker → conversational chat).
        try {
          window.localStorage.setItem("archie-user-mode", "new-alt");
        } catch {
          /* ignore */
        }
        if (!window.location.hash.startsWith("#/welcome-alt")) {
          window.location.hash = "#/welcome-alt";
        }
      } else {
        // mode === "new-alt" → returning user. If the user is mid-
        // onboarding (either linear /welcome* or the ALT session at
        // /session/welcome-alt-*), send them to the dashboard so they
        // actually see the returning-user state instead of being
        // stranded on an onboarding screen.
        try {
          window.localStorage.removeItem("archie-user-mode");
        } catch {
          /* ignore */
        }
        const h = window.location.hash;
        if (h.startsWith("#/welcome") || h.startsWith("#/session/welcome-alt-")) {
          window.location.hash = "#/";
        }
      }
      window.location.reload();
      return;
    }

    const flagRow = event.target.closest("[data-admin-flag]");
    if (flagRow) {
      const flags = getFlags();
      const id = flagRow.dataset.adminFlag;
      setFlag(id, !flags[id]);
      window.location.reload();
    }
  });

  document.addEventListener("click", (event) => {
    if (!open || root.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    setOpen(false);
    el.focus();
  });

  root.appendChild(menu);
  root.appendChild(el);
  document.body.appendChild(root);
  render();
}

function renderFlagRow(flag, enabled) {
  return `
    <label
      class="admin-menu__flag-row"
      data-admin-flag="${escapeAttr(flag.id)}"
      title="${escapeAttr(flag.hides)}"
      role="menuitemcheckbox"
      aria-checked="${enabled ? "true" : "false"}"
    >
      <span class="admin-menu__flag-label">${escapeHtml(flag.label)}</span>
      <span class="ap-toggle-container admin-menu__toggle" aria-hidden="true">
        <input type="checkbox" ${enabled ? "checked" : ""} tabindex="-1" />
        <i></i>
        <span></span>
      </span>
    </label>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
