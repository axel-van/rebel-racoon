// Admin menu — the prototype-only controls (user mode, feature flags, dev docs)
// that used to live on the /settings page. Now rendered inside the sidebar
// foot popmenu (the cog button), so there's no dedicated settings route.
//
// Pure-ish: renderAdminMenu() returns the markup; applyUserMode / toggleFlag are
// the side-effecting actions wired by the sidebar's delegated listeners. Every
// change reloads the app so the stores re-seed under the new mode / flag.

import { html, raw, escapeHtml } from "./utils.js?v=21";
import { FLAGS } from "./ff-catalog.js?v=21";
import { getFlags, setFlag } from "./feature-flags.js?v=17";
import { getUserMode, setUserMode } from "./user-mode.js?v=22";

const ADMIN_MODE_OPTIONS = [
  { value: "returning", label: "Returning user", hint: "Populated mocks (default)" },
  { value: "new-alt", label: "Welcome - First Time XP", hint: "Visual picker + conversational chat" },
];

// Switch user mode: persist, land on a coherent screen for the target mode, then
// full-reload so every store re-seeds. (Lifted from the old settings screen.)
export function applyUserMode(target) {
  if (target === getUserMode()) return;
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage may be unavailable in private browsing */
  }
  setUserMode(target);
  if (target === "new-alt" && !window.location.hash.startsWith("#/welcome-alt")) {
    window.location.hash = "#/welcome-alt";
  } else if (target === "returning") {
    const h = window.location.hash;
    if (h.startsWith("#/welcome") || h.startsWith("#/session/welcome-alt-")) {
      window.location.hash = "#/";
    }
  }
  window.location.reload();
}

// Flip a feature flag, then reload so every store / surface re-reads it.
export function toggleFlag(id) {
  setFlag(id, !getFlags()[id]);
  window.location.reload();
}

export function renderAdminMenu() {
  const mode = getUserMode();
  const flags = getFlags();

  const modeRows = ADMIN_MODE_OPTIONS.map((opt) => {
    const active = opt.value === mode;
    return `
      <label class="ap-radio-card card admin-menu__mode" data-admin-mode="${escapeHtml(opt.value)}">
        <input type="radio" name="sidebar-admin-user-mode" value="${escapeHtml(opt.value)}" ${active ? "checked" : ""} />
        <span class="admin-menu__opt-text">
          <span class="admin-menu__opt-label">${escapeHtml(opt.label)}</span>
          <span class="admin-menu__opt-hint">${escapeHtml(opt.hint)}</span>
        </span>
      </label>
    `;
  }).join("");

  const flagRows = FLAGS.map((flag) => {
    const enabled = !!flags[flag.id];
    return `
      <label class="admin-menu__row admin-menu__flag" data-admin-flag="${escapeHtml(flag.id)}">
        <span class="admin-menu__opt-label">${escapeHtml(flag.label)}</span>
        <span class="ap-toggle-container admin-menu__toggle" aria-hidden="true">
          <input type="checkbox" ${enabled ? "checked" : ""} tabindex="-1" />
          <i></i>
        </span>
      </label>
    `;
  }).join("");

  return html`
    <div class="admin-menu">
      <div class="admin-menu__section">
        <span class="admin-menu__section-title">User mode</span>
        <div class="admin-menu__cards" role="radiogroup" aria-label="User mode">${raw(modeRows)}</div>
      </div>
      <div class="admin-menu__section">
        <span class="admin-menu__section-title">Feature flags</span>
        <div class="admin-menu__flags">${raw(flagRows)}</div>
      </div>
      <div class="admin-menu__section">
        <span class="admin-menu__section-title">Docs</span>
        <a class="admin-menu__doc" href="/handoff/components.html" target="_blank" rel="noopener">
          <span class="admin-menu__opt-text">
            <span class="admin-menu__opt-label">Conversation thread components</span>
            <span class="admin-menu__opt-hint">Live HTML + tokens · dev handoff</span>
          </span>
          <i class="ap-icon-external-link" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  `;
}
