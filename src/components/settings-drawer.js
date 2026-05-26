// Settings drawer — right-anchored overlay panel with internal section nav.
// Same init/open/close pattern as feedback-modal/bug-report-modal: HTML
// injected once, all state module-local, no router involvement.
//
// Connectors and Social accounts use an instant-save model — clicking
// Connect / Disconnect mutates the source array directly, no working copy
// and no Save button. That's intentional: the action IS the save, and the
// user gets toast feedback (see FIND-02).

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";

import { socialAccounts } from "../mocks.js?v=34";
import { getConnectors, findConnector, setConnectorStatus } from "../connectors-store.js?v=21";

const OVERLAY_ID = "settingsDrawer";

// ─── State ───────────────────────────────────────────────────────────────

let initialized = false;
let backdrop, drawer, navEl, contentEl;

const SECTIONS = [
  { id: "connectors", label: "Connectors", icon: "ap-icon-link" },
  { id: "social", label: "Social accounts", icon: "ap-icon-multiple-users" },
];

const state = {
  open: false,
  activeSection: "connectors",
};

// ─── Markup ──────────────────────────────────────────────────────────────

const HTML = `
<div class="app-modal-backdrop settings-drawer__backdrop" id="settingsBackdrop" hidden></div>
<aside
  class="ap-dialog settings-drawer"
  id="settingsDrawer"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settingsDrawerTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header settings-drawer__header">
    <h2 class="ap-dialog-title" id="settingsDrawerTitle">Settings</h2>
  </div>
  <button class="ap-dialog-close" type="button" id="settingsDrawerClose" aria-label="Close settings">
    <i class="ap-icon-close"></i>
  </button>
  <div class="settings-drawer__body">
    <nav class="settings-drawer__nav ap-list-panel" id="settingsNav" aria-label="Settings sections"></nav>
    <div class="settings-drawer__content" id="settingsContent" tabindex="-1"></div>
  </div>
</aside>
`;

// ─── Section renderers ───────────────────────────────────────────────────

function renderConnectorsSection() {
  return html`
    <header class="settings-drawer__section-header">
      <h3 class="settings-drawer__section-title">Connectors</h3>
      <p class="settings-drawer__section-sub">Where Archie pulls source material when drafting posts.</p>
    </header>
    <ul class="settings-drawer__rows" data-rows="connectors">
      ${raw(getConnectors().map(renderConnectorRow).join(""))}
    </ul>
  `;
}

function renderConnectorRow(c) {
  const isConnected = c.status === "connected";
  return `
    <li class="ap-card settings-row" data-row-id="${escapeHtml(c.id)}">
      <img class="settings-row__logo" src="${escapeHtml(c.logo)}" alt="" width="32" height="32" />
      <div class="settings-row__body">
        <div class="settings-row__title">${escapeHtml(c.name)}</div>
        <div class="settings-row__sub">${escapeHtml(c.desc)}</div>
        ${
          isConnected && c.account
            ? `<div class="settings-row__meta">Connected as <span class="settings-row__meta-strong">${escapeHtml(c.account)}</span> · Last sync: ${escapeHtml(c.lastSync || "—")}</div>`
            : ""
        }
      </div>
      <div class="settings-row__action">
        ${
          isConnected
            ? `<span class="ap-status green">Connected</span>
               <button type="button" class="ap-button transparent grey" data-connector-toggle="${escapeHtml(c.id)}">Disconnect</button>`
            : `<button type="button" class="ap-button stroked grey" data-connector-toggle="${escapeHtml(c.id)}">Connect</button>`
        }
      </div>
    </li>
  `;
}

function renderSocialSection() {
  return html`
    <header class="settings-drawer__section-header">
      <h3 class="settings-drawer__section-title">Social accounts</h3>
      <p class="settings-drawer__section-sub">Where Archie can publish on your behalf once a post is approved.</p>
    </header>
    <ul class="settings-drawer__rows">
      ${raw(socialAccounts.map(renderSocialRow).join(""))}
    </ul>
  `;
}

function renderSocialRow(a) {
  const isConnected = a.status === "connected";
  return `
    <li class="ap-card settings-row" data-row-id="${escapeHtml(a.id)}">
      <img class="settings-row__logo" src="${escapeHtml(a.logo)}" alt="" width="32" height="32" />
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
               <button type="button" class="ap-button transparent grey" data-social-toggle="${escapeHtml(a.id)}">Disconnect</button>`
            : `<button type="button" class="ap-button stroked grey" data-social-toggle="${escapeHtml(a.id)}">Connect</button>`
        }
      </div>
    </li>
  `;
}

// ─── Section dispatch ────────────────────────────────────────────────────

function renderActiveSection() {
  switch (state.activeSection) {
    case "connectors":
      return renderConnectorsSection();
    case "social":
      return renderSocialSection();
    default:
      return "";
  }
}

// ─── Render ──────────────────────────────────────────────────────────────

function renderNav() {
  navEl.innerHTML = `<div class="ap-list-panel-items">${SECTIONS.map(
    (s) => `
      <button type="button"
        class="ap-list-panel-item settings-drawer__nav-item ${s.id === state.activeSection ? "selected" : ""}"
        data-section="${s.id}"
        ${s.id === state.activeSection ? 'aria-current="page"' : ""}
      >
        <i class="${s.icon}"></i>
        <span>${escapeHtml(s.label)}</span>
      </button>
    `,
  ).join("")}</div>`;
}

function renderContent() {
  contentEl.innerHTML = renderActiveSection();
  contentEl.scrollTop = 0;
}

function render() {
  renderNav();
  renderContent();
}

function setActiveSection(id) {
  state.activeSection = id;
  render();
}

// ─── Drawer open/close ───────────────────────────────────────────────────

export function open(opts = {}) {
  if (!initialized) init();
  requestOpen(OVERLAY_ID, close);
  if (opts.section && SECTIONS.find((s) => s.id === opts.section)) {
    state.activeSection = opts.section;
  }
  state.open = true;
  backdrop.hidden = false;
  backdrop.classList.add("open");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  render();
  // Focus the active nav item for keyboard users.
  window.setTimeout(() => {
    const active = navEl.querySelector(".settings-drawer__nav-item.selected");
    if (active)
      try {
        active.focus({ preventScroll: true });
      } catch {
        active.focus();
      }
  }, 60);
}

function close() {
  if (!initialized) return;
  state.open = false;
  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  state.activeSection = "connectors";
  notifyClose(OVERLAY_ID);
}

// ─── Event handling ──────────────────────────────────────────────────────

function onClick(event) {
  // Section nav
  const navBtn = event.target.closest("[data-section]");
  if (navBtn) {
    const target = navBtn.dataset.section;
    if (target !== state.activeSection) setActiveSection(target);
    return;
  }

  // Connectors connect/disconnect — go through connectors-store so the
  // add-source modal stays in sync (FIND-01). Toast confirms the action.
  const connectorBtn = event.target.closest("[data-connector-toggle]");
  if (connectorBtn) {
    const id = connectorBtn.dataset.connectorToggle;
    const c = findConnector(id);
    if (c) {
      const wasConnected = c.status === "connected";
      const updated = wasConnected
        ? setConnectorStatus(id, { status: "disconnected", account: null, lastSync: null })
        : setConnectorStatus(id, { status: "connected", account: "matt@archie.io", lastSync: "just now" });
      renderContent();
      showToast(`${updated.name} ${wasConnected ? "disconnected" : "connected"}`);
    }
    return;
  }

  // Social accounts toggle — same instant-save model as connectors.
  const socialBtn = event.target.closest("[data-social-toggle]");
  if (socialBtn) {
    const id = socialBtn.dataset.socialToggle;
    const a = socialAccounts.find((x) => x.id === id);
    if (a) {
      const wasConnected = a.status === "connected";
      if (wasConnected) {
        a.status = "disconnected";
      } else {
        a.status = "connected";
        if (!a.handle) a.handle = "@archie";
      }
      renderContent();
      const label = a.platformLabel || a.platform || "Account";
      showToast(`${label} ${wasConnected ? "disconnected" : "connected"}`);
    }
    return;
  }

  // Drawer close
  if (event.target.closest("#settingsDrawerClose")) {
    close();
    return;
  }
}

function onKeydown(event) {
  if (event.key !== "Escape") return;
  if (drawer.classList.contains("open")) {
    close();
  }
}

// ─── Init ────────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("settingsBackdrop");
  drawer = document.getElementById("settingsDrawer");
  navEl = document.getElementById("settingsNav");
  contentEl = document.getElementById("settingsContent");

  drawer.addEventListener("click", onClick);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
}
