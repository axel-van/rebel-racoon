// Settings — full-page route /settings.
//
// Two-pane shell: .ap-list-panel rail (Social accounts / Admin) + content with
// a single .ap-card per section containing the rows separated by .ap-divider.
// Connector management lives on the dedicated /connectors page (+ modal), so
// Settings doesn't duplicate it.
//
// Social toggles are instant-save — clicking Connect / Disconnect mutates the
// imported socialAccounts mock array and shows a toast. No Save button.

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=98";
import { parseHashParams, setHashQuery } from "../url-state.js?v=4";
import { showToast } from "../components/toast.js?v=20";
import { socialAccounts } from "../mocks.js?v=38";
// Admin section — prototype-only controls (was the floating admin chip).
import { FLAGS } from "../ff-catalog.js?v=5";
import { getFlags, setFlag } from "../feature-flags.js?v=4";
import { getUserMode, setUserMode } from "../user-mode.js?v=22";

const SECTIONS = [
  {
    id: "social",
    label: "Social accounts",
    sub: "Where I publish your approved posts.",
  },
  {
    id: "admin",
    label: "Admin",
    sub: "Prototype-only controls — user mode, feature flags, dev docs. Changes reload the app.",
  },
];

// User-mode options (mirrors the former admin chip).
const ADMIN_MODE_OPTIONS = [
  { value: "returning", label: "Returning user", hint: "Populated mocks (default)" },
  { value: "new-alt", label: "Welcome - First Time XP", hint: "Visual picker + conversational chat" },
];

function adminModeLabel(mode) {
  return mode === "new-alt" ? "Welcome - First Time XP" : "Returning user";
}

// Switch user mode: persist, land on a coherent screen for the target mode,
// then full-reload so every store re-seeds. (Lifted from user-mode-chip.js.)
function applyUserMode(target) {
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

let boundTarget = null;
let boundHandler = null;
let boundChangeHandler = null;

export function renderSettings(_params, target) {
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  return teardown;
}

function teardown() {
  if (boundTarget && boundHandler) {
    boundTarget.removeEventListener("click", boundHandler);
  }
  if (boundTarget && boundChangeHandler) {
    boundTarget.removeEventListener("change", boundChangeHandler);
  }
  boundTarget = null;
  boundHandler = null;
  boundChangeHandler = null;
}

// ─── Render ──────────────────────────────────────────────────────────────

function readSection() {
  const fallback = SECTIONS[0].id;
  const id = parseHashParams().get("section") || fallback;
  return SECTIONS.find((s) => s.id === id) ? id : fallback;
}

function paint(target) {
  const activeId = readSection();
  target.innerHTML = html`<section class="screen settings-view">${raw(renderPage(activeId))}</section>`;
}

function renderPage(activeId) {
  return html`
    <div class="settings-view__page">
      <header class="settings-view__head">
        <h1>Settings</h1>
        <p class="ap-subtitle">Connect your sources and social accounts.</p>
      </header>
      <div class="settings-view__body">${raw(renderNav(activeId))} ${raw(renderActiveSection(activeId))}</div>
    </div>
  `;
}

function counts(items) {
  const total = items.length;
  const connected = items.filter((x) => x.status === "connected").length;
  return { total, connected, label: `${connected} of ${total} connected` };
}

function renderNav(activeId) {
  const socialCounts = counts(socialAccounts);
  const subFor = (id) => {
    if (id === "social") return socialCounts.label;
    return adminModeLabel(getUserMode());
  };
  return html`
    <nav class="ap-list-panel settings-view__nav" aria-label="Settings sections">
      <div class="ap-list-panel-items">
        ${raw(
          SECTIONS.map(
            (s) => `
              <button type="button"
                class="ap-list-panel-item${s.id === activeId ? " selected" : ""}"
                data-section="${s.id}"
                ${s.id === activeId ? 'aria-current="page"' : ""}
              >
                <div class="ap-list-panel-item-text">
                  <div class="ap-list-panel-item-name">${escapeHtml(s.label)}</div>
                  <div class="ap-list-panel-item-subtitle">${escapeHtml(subFor(s.id))}</div>
                </div>
              </button>
            `,
          ).join(""),
        )}
      </div>
    </nav>
  `;
}

function renderActiveSection(activeId) {
  const section = SECTIONS.find((s) => s.id === activeId);
  if (!section) return "";
  if (activeId === "admin") return renderAdminSection(section);
  const items = sortConnected(socialAccounts);
  const c = counts(items);
  return html`
    <main class="settings-view__content">
      <header class="settings-view__section-head">
        <div>
          <h2>${escapeHtml(section.label)}</h2>
          <p>${escapeHtml(section.sub)}</p>
        </div>
        <span class="ap-status grey no-dot">${escapeHtml(c.label)}</span>
      </header>
      <section class="ap-card settings-card settings-list-card">
        ${raw(
          items.map((item, i) => (i === 0 ? "" : `<div class="ap-divider"></div>`) + renderSocialRow(item)).join(""),
        )}
      </section>
    </main>
  `;
}

function renderAdminSection(section) {
  const mode = getUserMode();
  const flags = getFlags();
  const modeRows = ADMIN_MODE_OPTIONS.map((opt) => {
    const active = opt.value === mode;
    return `
      <label class="ap-radio-card card settings-mode-card" data-admin-mode="${escapeHtml(opt.value)}">
        <input type="radio" name="settings-admin-user-mode" value="${escapeHtml(opt.value)}" ${active ? "checked" : ""} />
        <span class="settings-opt-text">
          <span class="settings-opt-label">${escapeHtml(opt.label)}</span>
          <span class="settings-opt-hint">${escapeHtml(opt.hint)}</span>
        </span>
      </label>
    `;
  }).join("");

  const flagRows = FLAGS.map((flag) => {
    const enabled = !!flags[flag.id];
    return `
      <label class="settings-opt-row settings-flag-row" data-admin-flag="${escapeHtml(flag.id)}">
        <span class="settings-opt-text">
          <span class="settings-opt-label">${escapeHtml(flag.label)}</span>
          ${flag.hides ? `<span class="settings-opt-hint">${escapeHtml(flag.hides)}</span>` : ""}
        </span>
        <span class="ap-toggle-container settings-flag-toggle" aria-hidden="true">
          <input type="checkbox" ${enabled ? "checked" : ""} tabindex="-1" />
          <i></i>
        </span>
      </label>
    `;
  }).join("");

  return html`
    <main class="settings-view__content">
      <header class="settings-view__section-head">
        <div>
          <h2>${escapeHtml(section.label)}</h2>
          <p>${escapeHtml(section.sub)}</p>
        </div>
      </header>

      <section class="ap-card settings-card">
        <h3 class="ap-card-title">User mode</h3>
        <div class="settings-card__rows settings-card__rows--cards" role="radiogroup" aria-label="User mode">
          ${raw(modeRows)}
        </div>
      </section>

      <section class="ap-card settings-card">
        <h3 class="ap-card-title">Feature flags</h3>
        <div class="settings-card__rows settings-card__rows--divided">${raw(flagRows)}</div>
      </section>

      <section class="ap-card settings-card">
        <h3 class="ap-card-title">Docs</h3>
        <a class="settings-doc-row" href="/handoff/components.html" target="_blank" rel="noopener">
          <span class="settings-opt-text">
            <span class="settings-opt-label">Conversation thread components</span>
            <span class="settings-opt-hint">Live HTML + tokens · dev handoff</span>
          </span>
          <i class="ap-icon-external-link" aria-hidden="true"></i>
        </a>
      </section>
    </main>
  `;
}

function sortConnected(items) {
  return items.slice().sort((a, b) => {
    const aConn = a.status === "connected" ? 0 : 1;
    const bConn = b.status === "connected" ? 0 : 1;
    return aConn - bConn;
  });
}

function renderSocialRow(a) {
  const isConnected = a.status === "connected";
  return `
    <div class="settings-row" data-row-id="${escapeHtml(a.id)}">
      <img class="settings-row__logo" src="${escapeHtml(a.logo)}" alt="" width="32" height="32" loading="lazy" />
      <div class="settings-row__body">
        <div class="settings-row__title-line">
          <span class="settings-row__title">${escapeHtml(a.platformLabel)}</span>
          ${a.kind ? `<span class="ap-tag grey">${escapeHtml(a.kind)}</span>` : ""}
        </div>
        <div class="settings-row__sub">${isConnected && a.handle ? escapeHtml(a.handle) : "Not connected"}</div>
      </div>
      <div class="settings-row__action">
        ${
          isConnected
            ? `<span class="ap-status green">Connected</span>
               <button type="button" class="ap-button ghost grey" data-social-toggle="${escapeHtml(a.id)}">Disconnect</button>`
            : `<button type="button" class="ap-button stroked grey" data-social-toggle="${escapeHtml(a.id)}">Connect</button>`
        }
      </div>
    </div>
  `;
}

// ─── Event handling ──────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;
  boundHandler = (event) => {
    // Section nav — URL change doesn't re-trigger the route (same path),
    // so repaint manually after updating the hash.
    const navBtn = event.target.closest("[data-section]");
    if (navBtn) {
      const id = navBtn.dataset.section;
      if (id !== readSection()) {
        setHashQuery("/settings", { section: id });
        paint(target);
      }
      return;
    }

    // Admin — feature flag toggle (reload so stores re-read the flag).
    const flagRow = event.target.closest("[data-admin-flag]");
    if (flagRow) {
      event.preventDefault();
      const id = flagRow.dataset.adminFlag;
      setFlag(id, !getFlags()[id]);
      window.location.reload();
      return;
    }

    // Social toggle — instant-save, mutate the imported mock directly
    // (same model the drawer used; no other surface lists social accounts).
    const socialBtn = event.target.closest("[data-social-toggle]");
    if (socialBtn) {
      const id = socialBtn.dataset.socialToggle;
      const a = socialAccounts.find((x) => x.id === id);
      if (!a) return;
      const wasConnected = a.status === "connected";
      if (wasConnected) {
        a.status = "disconnected";
      } else {
        a.status = "connected";
        if (!a.handle) a.handle = "@archie";
      }
      paint(target);
      const label = a.platformLabel || a.platform || "Account";
      showToast(`${label} ${wasConnected ? "disconnected" : "connected"}`);
      return;
    }
  };
  target.addEventListener("click", boundHandler);

  // Admin — user-mode radio change applies the mode + reloads.
  boundChangeHandler = (event) => {
    const radio = event.target.closest('[name="settings-admin-user-mode"]');
    if (radio) applyUserMode(radio.value);
  };
  target.addEventListener("change", boundChangeHandler);
}
