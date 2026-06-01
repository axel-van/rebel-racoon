// Settings — full-page route /settings.
//
// Two-pane shell: .ap-list-panel rail (Connectors / Social accounts) +
// content with a single .ap-card per section containing the rows separated
// by .ap-divider. Replaces the old right-anchored drawer (which forked
// DS conventions because the DS doesn't ship a side-drawer primitive).
//
// All toggles are instant-save — clicking Connect / Disconnect mutates the
// store (connectors) or the imported mock array (socialAccounts) and shows
// a toast. No working-copy, no Save button.

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=81";
import { parseHashParams, setHashQuery } from "../url-state.js?v=4";
import { showToast } from "../components/toast.js?v=20";
import { socialAccounts } from "../mocks.js?v=36";
import {
  getConnectors,
  findConnector,
  setConnectorStatus,
  subscribe as subscribeConnectors,
} from "../connectors-store.js?v=21";
// Admin section — prototype-only controls (was the floating admin chip).
import { FLAGS } from "../ff-catalog.js?v=4";
import { getFlags, setFlag } from "../feature-flags.js?v=3";
import { getUserMode, setUserMode } from "../user-mode.js?v=22";

const SECTIONS = [
  {
    id: "connectors",
    label: "Connectors",
    icon: "ap-icon-link",
    sub: "Where I pull source material from when drafting posts.",
  },
  {
    id: "social",
    label: "Social accounts",
    icon: "ap-icon-multiple-users",
    sub: "Where I publish your approved posts.",
  },
  {
    id: "admin",
    label: "Admin",
    icon: "ap-icon-cog",
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

let unsubscribe = null;
let boundTarget = null;
let boundHandler = null;
let boundChangeHandler = null;

export function renderSettings(_params, target) {
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Connectors mutate via the store — repaint when an external surface
  // (add-source-modal) flips a connector's state.
  unsubscribe = subscribeConnectors(() => paint(target));

  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
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
  const id = parseHashParams().get("section") || "connectors";
  return SECTIONS.find((s) => s.id === id) ? id : "connectors";
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
  const connectorCounts = counts(getConnectors());
  const socialCounts = counts(socialAccounts);
  const subFor = (id) => {
    if (id === "connectors") return connectorCounts.label;
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
                <i class="${s.icon}"></i>
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
  const items = activeId === "connectors" ? sortConnected(getConnectors()) : sortConnected(socialAccounts);
  const c = counts(items);
  const rowFn = activeId === "connectors" ? renderConnectorRow : renderSocialRow;
  return html`
    <main class="settings-view__content">
      <header class="settings-view__section-head">
        <div>
          <h2>${escapeHtml(section.label)}</h2>
          <p>${escapeHtml(section.sub)}</p>
        </div>
        <span class="ap-status grey no-dot">${escapeHtml(c.label)}</span>
      </header>
      <div class="ap-card settings-view__list">
        ${raw(items.map((item, i) => (i === 0 ? "" : `<div class="ap-divider"></div>`) + rowFn(item)).join(""))}
      </div>
    </main>
  `;
}

function renderAdminSection(section) {
  const mode = getUserMode();
  const flags = getFlags();
  const modeRows = ADMIN_MODE_OPTIONS.map((opt) => {
    const active = opt.value === mode;
    return `
      <label class="ap-radio-container settings-admin__row${active ? " is-active" : ""}" data-admin-mode="${escapeHtml(opt.value)}">
        <input type="radio" name="settings-admin-user-mode" value="${escapeHtml(opt.value)}" ${active ? "checked" : ""} />
        <i></i>
        <span class="settings-admin__row-text">
          <span class="settings-admin__row-label">${escapeHtml(opt.label)}</span>
          <span class="settings-admin__row-hint">${escapeHtml(opt.hint)}</span>
        </span>
      </label>
    `;
  }).join("");

  const flagRows = FLAGS.map((flag) => {
    const enabled = !!flags[flag.id];
    return `
      <label class="settings-admin__row settings-admin__row--flag" data-admin-flag="${escapeHtml(flag.id)}" title="${escapeHtml(flag.hides || "")}">
        <span class="settings-admin__row-text">
          <span class="settings-admin__row-label">${escapeHtml(flag.label)}</span>
          ${flag.hides ? `<span class="settings-admin__row-hint">${escapeHtml(flag.hides)}</span>` : ""}
        </span>
        <span class="ap-toggle-container settings-admin__toggle" aria-hidden="true">
          <input type="checkbox" ${enabled ? "checked" : ""} tabindex="-1" />
          <i></i>
          <span></span>
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

      <div class="ap-card settings-view__list settings-admin">
        <div class="settings-admin__group">
          <h3 class="settings-admin__group-title">User mode</h3>
          <div role="radiogroup" aria-label="User mode">${raw(modeRows)}</div>
        </div>

        <div class="ap-divider"></div>

        <div class="settings-admin__group">
          <h3 class="settings-admin__group-title">Feature flags</h3>
          ${raw(flagRows)}
        </div>

        <div class="ap-divider"></div>

        <div class="settings-admin__group">
          <h3 class="settings-admin__group-title">Docs</h3>
          <a
            class="settings-admin__row settings-admin__link"
            href="/handoff/components.html"
            target="_blank"
            rel="noopener"
          >
            <span class="settings-admin__row-text">
              <span class="settings-admin__row-label">Conversation thread components</span>
              <span class="settings-admin__row-hint">Live HTML + tokens · dev handoff</span>
            </span>
            <i class="ap-icon-external-link" aria-hidden="true"></i>
          </a>
        </div>
      </div>
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

function renderConnectorRow(c) {
  const isConnected = c.status === "connected";
  const meta = isConnected
    ? `<div class="settings-row__meta">Connected as <strong>${escapeHtml(c.account || "")}</strong> · Last sync: ${escapeHtml(c.lastSync || "—")}</div>`
    : "";
  return `
    <div class="settings-row" data-row-id="${escapeHtml(c.id)}">
      <img class="settings-row__logo" src="${escapeHtml(c.logo)}" alt="" width="32" height="32" loading="lazy" />
      <div class="settings-row__body">
        <div class="settings-row__title">${escapeHtml(c.name)}</div>
        <div class="settings-row__sub">${escapeHtml(c.desc)}</div>
        ${meta}
      </div>
      <div class="settings-row__action">
        ${
          isConnected
            ? `<span class="ap-status green">Connected</span>
               <button type="button" class="ap-button ghost grey" data-connector-toggle="${escapeHtml(c.id)}">Disconnect</button>`
            : `<button type="button" class="ap-button stroked grey" data-connector-toggle="${escapeHtml(c.id)}">Connect</button>`
        }
      </div>
    </div>
  `;
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

    // Connector toggle — goes through the store so the add-source modal
    // (the other surface listing connectors) stays in sync.
    const connBtn = event.target.closest("[data-connector-toggle]");
    if (connBtn) {
      const id = connBtn.dataset.connectorToggle;
      const c = findConnector(id);
      if (!c) return;
      const wasConnected = c.status === "connected";
      // Snapshot the pre-toggle state so the toast's Undo can restore
      // the previous account/lastSync exactly, not just flip status back.
      const previous = {
        status: c.status,
        account: c.account || null,
        lastSync: c.lastSync || null,
      };
      const updated = wasConnected
        ? setConnectorStatus(id, { status: "disconnected", account: null, lastSync: null })
        : setConnectorStatus(id, { status: "connected", account: "matt@archie.io", lastSync: "just now" });
      // store notification already triggers paint via subscribeConnectors,
      // but we paint here too so the immediate UI feels instant if the
      // notifier ever debounces.
      paint(target);
      showToast(`${updated.name} ${wasConnected ? "disconnected" : "connected"}`, {
        action: {
          label: "Undo",
          onClick: () => {
            setConnectorStatus(id, previous);
            paint(target);
          },
        },
      });
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
