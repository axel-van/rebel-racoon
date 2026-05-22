import { FLAGS } from "../ff-catalog.js?v=2";
import { getFlags, setFlag } from "../feature-flags.js?v=2";
import { getUserMode, setUserMode } from "../user-mode.js?v=20";

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

  function render() {
    const mode = getUserMode();
    const flags = getFlags();

    el.className = "admin-chip" + (mode === "new" ? " admin-chip--new" : "");
    el.setAttribute(
      "aria-label",
      mode === "new"
        ? "Admin: currently showing first-time user. Open controls."
        : "Admin: currently showing returning user. Open controls.",
    );
    el.setAttribute("aria-expanded", open ? "true" : "false");
    el.innerHTML = `
      <span class="admin-chip__label">Admin</span>
      <span class="admin-chip__divider">·</span>
      <span class="admin-chip__mode">${mode === "new" ? "First-time user" : "Returning user"}</span>
      <i class="ap-icon-chevron-${open ? "down" : "up"} admin-chip__icon"></i>
    `;

    menu.hidden = !open;
    menu.innerHTML = `
      <button type="button" class="ap-action-dropdown-item admin-menu__row" data-admin-user-mode role="menuitem">
        <span class="ap-action-dropdown-item-text">
          <span class="ap-action-dropdown-item-label bold">User mode</span>
          <span class="ap-action-dropdown-item-description">
            ${mode === "new" ? "first-time" : "returning user"} · refresh
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
      const mode = getUserMode();
      if (mode === "new") {
        // Switching off first-time → returning. If the user is mid-
        // onboarding on /welcome*, send them to the dashboard so they
        // actually land in the returning-user state (seeded sidebar +
        // conversations) — staying on /welcome would just re-show the
        // empty first-time onboarding. From any other route, stay put:
        // the chip is a demo switch, not navigation.
        if (window.location.hash.startsWith("#/welcome")) {
          window.location.hash = "#/";
        }
        setUserMode("returning");
      } else {
        // Switching INTO first-time → land directly on /welcome, every
        // time. That's the whole point of the toggle: re-experience the
        // onboarding from a clean state. We also wipe sessionStorage
        // handoffs so a stale flow from the previous mode doesn't fire
        // on the next render.
        try {
          window.localStorage.setItem("archie-user-mode", "new");
          window.sessionStorage.clear();
        } catch {
          // ignore — storage may be unavailable in private browsing
        }
        // Set the hash to /welcome (no-op if already there) and force a
        // hard reload so every store re-seeds with the new mode.
        // location.replace alone is unreliable: replacing to the *same*
        // URL is a no-op in Chrome, so when the user is already on
        // /welcome the page never refreshes and the toggle silently
        // fails. Mutating location.hash preserves the current pathname,
        // so this still works under any base path (e.g. GitHub Pages).
        if (!window.location.hash.startsWith("#/welcome")) {
          window.location.hash = "#/welcome";
        }
        window.location.reload();
      }
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
