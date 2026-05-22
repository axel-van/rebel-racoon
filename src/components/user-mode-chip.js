import { FLAGS } from "../ff-catalog.js?v=3";
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

  const MODE_OPTIONS = [
    { value: "returning", label: "Returning user", hint: "Populated mocks (default)" },
    { value: "new", label: "First-time user", hint: "Linear 4-screen /welcome wizard" },
    { value: "new-alt", label: "First-time ALT", hint: "Visual picker + conversational chat" },
  ];

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
      <div class="admin-menu__section-title">User mode</div>
      <div class="admin-menu__modes" role="radiogroup" aria-label="User mode">
        ${MODE_OPTIONS.map((opt) => renderModeRow(opt, opt.value === mode)).join("")}
      </div>
      <div class="ap-action-dropdown-divider" role="separator"></div>
      <div class="admin-menu__section-title">Feature flags</div>
      ${FLAGS.map((flag) => renderFlagRow(flag, flags[flag.id])).join("")}
    `;
  }

  function renderModeRow(opt, isActive) {
    return `
      <label class="ap-radio-container admin-menu__mode-row${isActive ? " is-active" : ""}" data-admin-mode="${opt.value}">
        <input type="radio" name="archie-admin-user-mode" value="${opt.value}" ${isActive ? "checked" : ""} />
        <span class="admin-menu__mode-text">
          <span class="admin-menu__mode-label">${opt.label}</span>
          <span class="admin-menu__mode-hint">${opt.hint}</span>
        </span>
      </label>
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

  // Apply a target mode picked from the radio group. Mutates localStorage,
  // repositions the URL so the user lands on a coherent screen for the
  // target mode, then forces a full reload so every store re-seeds.
  // location.replace alone is unreliable — replacing to the same URL is
  // a no-op in Chrome — so we mutate location.hash and then reload().
  function applyMode(target) {
    if (target === getUserMode()) return;
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore — storage may be unavailable in private browsing */
    }
    try {
      if (target === "new") window.localStorage.setItem("archie-user-mode", "new");
      else if (target === "new-alt") window.localStorage.setItem("archie-user-mode", "new-alt");
      else window.localStorage.removeItem("archie-user-mode");
    } catch {
      /* ignore */
    }
    if (target === "new" && !window.location.hash.startsWith("#/welcome")) {
      window.location.hash = "#/welcome";
    } else if (target === "new-alt" && !window.location.hash.startsWith("#/welcome-alt")) {
      window.location.hash = "#/welcome-alt";
    } else if (target === "returning") {
      const h = window.location.hash;
      if (h.startsWith("#/welcome") || h.startsWith("#/session/welcome-alt-")) {
        window.location.hash = "#/";
      }
    }
    window.location.reload();
  }

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    // Native radio inputs are interactive — let the click reach them,
    // we handle the actual change in the 'change' listener below.
    if (event.target.matches('[name="archie-admin-user-mode"]')) return;
    if (event.target.matches("[data-admin-flag] input")) return;

    const flagRow = event.target.closest("[data-admin-flag]");
    if (flagRow) {
      const flags = getFlags();
      const id = flagRow.dataset.adminFlag;
      setFlag(id, !flags[id]);
      window.location.reload();
    }
  });

  menu.addEventListener("change", (event) => {
    const input = event.target.closest('[name="archie-admin-user-mode"]');
    if (!input) return;
    event.stopPropagation();
    applyMode(input.value);
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
