// Settings drawer — right-anchored overlay panel with internal section nav.
// Same init/open/close pattern as feedback-modal/bug-report-modal: HTML
// injected once, all state module-local, no router involvement.
//
// All settings are mocked in-memory. Connect/disconnect, save preferences —
// every action mutates either the imported mock arrays directly (for instant
// flips like Connect) or a working copy that's committed on Save (for
// editable forms with dirty/cancel semantics).

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=20";
import { showToast } from "./toast.js?v=20";

const OVERLAY_ID = "settingsDrawer";

// Note: Connectors and Social accounts use an instant-save model — clicking
// Connect / Disconnect mutates the source array directly, no working copy
// and no Save button. That's intentional: the action IS the save, and the
// user gets toast feedback (see FIND-02). Preferences and Notifications use
// the working-copy + Save pattern because they're forms with multiple fields
// where intermediate states aren't meaningful.
import { contextComponentsFor, socialAccounts, generationPrefs, notificationPrefs } from "../mocks.js?v=27";
import { getContexts } from "../contexts-store.js?v=24";
import { getConnectors, findConnector, setConnectorStatus } from "../connectors-store.js?v=21";

// ─── State ───────────────────────────────────────────────────────────────

let initialized = false;
let backdrop, drawer, navEl, contentEl, footerEl;
let confirmBackdrop, confirmDialog, confirmText;

const SECTIONS = [
  { id: "connectors", label: "Connectors", icon: "ap-icon-link" },
  { id: "contexts", label: "Contexts", icon: "ap-icon-headset" },
  { id: "preferences", label: "Generation preferences", icon: "ap-icon-sparkles" },
  { id: "social", label: "Social accounts", icon: "ap-icon-multiple-users" },
  { id: "notifications", label: "Notifications", icon: "ap-icon-bell" },
];

const state = {
  open: false,
  activeSection: "connectors",
  dirty: false,
  pendingAction: null, // closure to run after the user confirms "Discard"
  // Working copies for editable sections (committed to imported mocks on Save).
  prefs: clone(generationPrefs),
  notif: clone(notificationPrefs),
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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
  <div class="ap-dialog-footer settings-drawer__footer" id="settingsFooter" hidden></div>
</aside>

<div class="app-modal-backdrop settings-confirm__backdrop" id="settingsConfirmBackdrop" hidden></div>
<aside
  class="ap-dialog settings-confirm"
  id="settingsConfirm"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settingsConfirmTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <h2 class="ap-dialog-title" id="settingsConfirmTitle">Discard changes?</h2>
  </div>
  <div class="ap-dialog-content">
    <p id="settingsConfirmText" class="settings-confirm__text">You have unsaved changes. They'll be lost if you continue.</p>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="settingsConfirmCancel">Keep editing</button>
      <button type="button" class="ap-button stroked red" id="settingsConfirmOk">Discard</button>
    </div>
  </div>
</aside>
`;

// ─── Section renderers ───────────────────────────────────────────────────

function renderConnectorsSection() {
  return html`
    <header class="settings-drawer__section-header">
      <h3 class="settings-drawer__section-title">Connectors</h3>
      <p class="settings-drawer__section-sub">Sources Archie pulls knowledge from when generating posts.</p>
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

function renderContextsSection() {
  const all = getContexts();
  return html`
    <header class="settings-drawer__section-header">
      <div>
        <h3 class="settings-drawer__section-title">Contexts</h3>
        <p class="settings-drawer__section-sub">
          Saved bundles of voice, brief, and brand. Create or edit one from inside any chat.
        </p>
      </div>
    </header>
    ${raw(
      all.length === 0
        ? `
            <div class="settings-drawer__empty">
              <div class="settings-drawer__empty-icon"><i class="ap-icon-headset lg"></i></div>
              <h4 class="settings-drawer__empty-title">No saved contexts yet</h4>
              <p class="settings-drawer__empty-body">
                Start a new chat — Archie will walk you through capturing a Voice, Strategy brief, and Brand theme,
                then offer to save it here.
              </p>
              <div class="settings-drawer__empty-action">
                <button type="button" class="ap-button primary orange" data-settings-new-chat>
                  <i class="ap-icon-plus"></i>
                  <span>Start a new chat</span>
                </button>
              </div>
            </div>
          `
        : `<ul class="settings-drawer__rows">${all.map(renderContextRow).join("")}</ul>`,
    )}
  `;
}

function renderContextRow(ctx) {
  const components = contextComponentsFor(ctx);
  const tagFor = (name) => {
    const color = name === "Voice" ? "blue" : name === "Brief" ? "tagOrange" : "menthol";
    return `<span class="ap-tag ${color}">${name}</span>`;
  };
  return `
    <li class="ap-card settings-row" data-row-id="${escapeHtml(ctx.id)}">
      <div class="settings-row__avatar settings-row__avatar--ctx" aria-hidden="true">
        <i class="ap-icon-headset"></i>
      </div>
      <div class="settings-row__body">
        <div class="settings-row__title">${escapeHtml(ctx.name)}</div>
        <div class="settings-row__sub">Updated ${escapeHtml(ctx.updatedAt)}</div>
        <div class="settings-row__tags">${components.length ? components.map(tagFor).join("") : `<span class="ap-tag grey">Empty</span>`}</div>
      </div>
    </li>
  `;
}

function renderPreferencesSection() {
  const p = state.prefs;
  return html`
    <header class="settings-drawer__section-header">
      <h3 class="settings-drawer__section-title">Generation preferences</h3>
      <p class="settings-drawer__section-sub">Defaults applied to every new post Archie drafts.</p>
    </header>

    <div class="ap-form-field">
      <label for="pref-tone">Default tone</label>
      <select id="pref-tone" class="ap-native-select" data-pref="tone">
        ${raw(option("professional", "Professional", p.tone))} ${raw(option("friendly", "Friendly", p.tone))}
        ${raw(option("casual", "Casual", p.tone))} ${raw(option("witty", "Witty", p.tone))}
        ${raw(option("inspirational", "Inspirational", p.tone))} ${raw(option("educational", "Educational", p.tone))}
      </select>
    </div>

    <div class="ap-form-field">
      <label for="pref-language">Default language</label>
      <select id="pref-language" class="ap-native-select" data-pref="language">
        ${raw(option("en", "English", p.language))} ${raw(option("fr", "Français", p.language))}
        ${raw(option("es", "Español", p.language))} ${raw(option("de", "Deutsch", p.language))}
        ${raw(option("it", "Italiano", p.language))} ${raw(option("pt", "Português", p.language))}
      </select>
    </div>

    <div class="ap-form-field">
      <label>Default post length</label>
      <div class="settings-drawer__radios">
        ${raw(radioCard("length", "short", "Short", "≤ 100 chars", p.length))}
        ${raw(radioCard("length", "medium", "Medium", "100–280", p.length))}
        ${raw(radioCard("length", "long", "Long", "280+", p.length))}
      </div>
    </div>

    <div class="settings-drawer__toggle-row">
      <div class="settings-drawer__toggle-label">
        <i class="ap-icon-hashtag"></i>
        <div>
          <div>Auto-add hashtags</div>
          <div class="settings-row__sub">Add a small set of relevant hashtags to each post.</div>
        </div>
      </div>
      ${raw(toggle("autoHashtags", p.autoHashtags))}
    </div>

    <div class="settings-drawer__toggle-row">
      <div class="settings-drawer__toggle-label">
        <i class="ap-icon-emoji"></i>
        <div>
          <div>Auto-add emojis</div>
          <div class="settings-row__sub">Sprinkle emojis where they fit the brand tone.</div>
        </div>
      </div>
      ${raw(toggle("autoEmojis", p.autoEmojis))}
    </div>

    ${raw(
      p.autoEmojis
        ? `
            <div class="settings-drawer__sub-pref">
              <label class="settings-drawer__sub-pref-label">Frequency</label>
              <div class="settings-drawer__radios">
                ${radioCard("emojiFreq", "minimal", "Minimal", "1 max", p.emojiFreq)}
                ${radioCard("emojiFreq", "balanced", "Balanced", "2–3", p.emojiFreq)}
                ${radioCard("emojiFreq", "generous", "Generous", "4+", p.emojiFreq)}
              </div>
            </div>
          `
        : "",
    )}

    <div class="ap-form-field">
      <label for="pref-cta">Default CTA style</label>
      <select id="pref-cta" class="ap-native-select" data-pref="ctaStyle">
        ${raw(option("none", "None", p.ctaStyle))} ${raw(option("question", "Question", p.ctaStyle))}
        ${raw(option("direct", "Direct ask", p.ctaStyle))} ${raw(option("soft", "Soft suggestion", p.ctaStyle))}
      </select>
    </div>
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

function renderNotificationsSection() {
  const n = state.notif;
  return html`
    <header class="settings-drawer__section-header">
      <h3 class="settings-drawer__section-title">Notifications</h3>
      <p class="settings-drawer__section-sub">How and when Archie pings you about activity in your sessions.</p>
    </header>

    ${raw(
      notifGroup("Email notifications", "ap-icon-envelope", [
        ["weeklyRecap", "Weekly performance recap", n.email.weeklyRecap, "email"],
        ["approvals", "Post approval requests", n.email.approvals, "email"],
        ["failures", "Generation failures", n.email.failures, "email"],
        ["productUpdates", "Product updates from Archie", n.email.productUpdates, "email"],
      ]),
    )}
    ${raw(
      notifGroup("In-app notifications", "ap-icon-single-chat-bubble", [
        ["mentions", "Mentions and replies on published posts", n.inApp.mentions, "inApp"],
        ["voiceReady", "New brand voice analysis ready", n.inApp.voiceReady, "inApp"],
        ["syncIssues", "Connector sync issues", n.inApp.syncIssues, "inApp"],
      ]),
    )}
    ${raw(
      notifGroup(
        "Push notifications",
        "ap-icon-smartphone",
        [
          ["mentions", "Mentions and replies", n.push.mentions, "push"],
          ["approvals", "Approval reminders", n.push.approvals, "push"],
        ],
        "Available on the mobile app — toggles preview the experience.",
      ),
    )}
  `;
}

// ─── Markup helpers ──────────────────────────────────────────────────────

function option(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function radioCard(name, value, label, hint, current) {
  const checked = current === value;
  return `
    <label class="settings-drawer__radio-card ${checked ? "selected" : ""}">
      <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" data-pref="${escapeHtml(name)}" ${checked ? "checked" : ""} />
      <span class="settings-drawer__radio-card-label">${escapeHtml(label)}</span>
      <span class="settings-drawer__radio-card-hint">${escapeHtml(hint)}</span>
    </label>
  `;
}

function toggle(field, value) {
  return `
    <label class="ap-toggle-container">
      <input type="checkbox" data-pref="${escapeHtml(field)}" ${value ? "checked" : ""} />
      <i></i>
    </label>
  `;
}

function notifGroup(title, icon, rows, footnote) {
  const items = rows
    .map(
      ([key, label, value, group]) => `
        <li class="settings-drawer__notif-row">
          <span>${escapeHtml(label)}</span>
          <label class="ap-toggle-container">
            <input type="checkbox" data-notif="${escapeHtml(group)}.${escapeHtml(key)}" ${value ? "checked" : ""} />
            <i></i>
          </label>
        </li>
      `,
    )
    .join("");
  return `
    <section class="settings-drawer__notif-group">
      <header class="settings-drawer__notif-group-header">
        <i class="${icon}"></i>
        <h4>${escapeHtml(title)}</h4>
      </header>
      <ul>${items}</ul>
      ${footnote ? `<p class="settings-drawer__notif-footnote">${escapeHtml(footnote)}</p>` : ""}
    </section>
  `;
}

// ─── Section dispatch + footer ───────────────────────────────────────────

function renderActiveSection() {
  switch (state.activeSection) {
    case "connectors":
      return renderConnectorsSection();
    case "contexts":
      return renderContextsSection();
    case "preferences":
      return renderPreferencesSection();
    case "social":
      return renderSocialSection();
    case "notifications":
      return renderNotificationsSection();
    default:
      return "";
  }
}

function footerForSection() {
  if (state.activeSection === "preferences") {
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button primary orange" data-prefs-save ${state.dirty ? "" : "disabled"}>Save</button>
        </div>
      `,
    };
  }
  if (state.activeSection === "notifications") {
    return {
      visible: true,
      html: `
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button primary orange" data-notif-save ${state.dirty ? "" : "disabled"}>Save</button>
        </div>
      `,
    };
  }
  return { visible: false, html: "" };
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

function renderFooter() {
  const f = footerForSection();
  footerEl.hidden = !f.visible;
  footerEl.innerHTML = f.html;
}

function render() {
  renderNav();
  renderContent();
  renderFooter();
}

// ─── Section change with dirty guard ─────────────────────────────────────

function attemptSectionChange(targetId) {
  if (state.dirty) {
    state.pendingAction = () => {
      revertWorkingCopies();
      setActiveSection(targetId);
    };
    openConfirm("Discard changes?", "You have unsaved changes. They'll be lost if you switch sections.");
  } else {
    setActiveSection(targetId);
  }
}

function setActiveSection(id) {
  state.activeSection = id;
  state.dirty = false;
  render();
}

function revertWorkingCopies() {
  state.prefs = clone(generationPrefs);
  state.notif = clone(notificationPrefs);
  state.dirty = false;
}

// ─── Confirm dialog ──────────────────────────────────────────────────────

function openConfirm(title, text) {
  document.getElementById("settingsConfirmTitle").textContent = title;
  confirmText.textContent = text;
  confirmBackdrop.hidden = false;
  confirmBackdrop.classList.add("open");
  confirmDialog.classList.add("open");
  confirmDialog.setAttribute("aria-hidden", "false");
}

function closeConfirm() {
  confirmDialog.classList.remove("open");
  confirmBackdrop.classList.remove("open");
  confirmBackdrop.hidden = true;
  confirmDialog.setAttribute("aria-hidden", "true");
  state.pendingAction = null;
}

// ─── Drawer open/close ───────────────────────────────────────────────────

export function open(opts = {}) {
  if (!initialized) init();
  // Use attemptClose so an unsaved-changes confirmation isn't silently
  // skipped when another modal asks the coordinator to close us.
  requestOpen(OVERLAY_ID, attemptClose);
  if (opts.section && SECTIONS.find((s) => s.id === opts.section)) {
    state.activeSection = opts.section;
  }
  state.dirty = false;
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

export function close() {
  if (!initialized) return;
  state.open = false;
  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  // Reset working copies so a fresh open shows fresh state.
  revertWorkingCopies();
  state.activeSection = "connectors";
  notifyClose(OVERLAY_ID);
}

function attemptClose() {
  if (state.dirty) {
    state.pendingAction = () => close();
    openConfirm("Discard changes?", "You have unsaved changes. They'll be lost if you close the drawer.");
  } else {
    close();
  }
}

// ─── Event handling ──────────────────────────────────────────────────────

function onClick(event) {
  // Section nav
  const navBtn = event.target.closest("[data-section]");
  if (navBtn) {
    const target = navBtn.dataset.section;
    if (target !== state.activeSection) attemptSectionChange(target);
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

  // Preferences save
  if (event.target.closest("[data-prefs-save]")) {
    Object.assign(generationPrefs, state.prefs);
    state.dirty = false;
    render();
    return;
  }

  // Notifications save
  if (event.target.closest("[data-notif-save]")) {
    Object.assign(notificationPrefs.email, state.notif.email);
    Object.assign(notificationPrefs.inApp, state.notif.inApp);
    Object.assign(notificationPrefs.push, state.notif.push);
    state.dirty = false;
    render();
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
    attemptClose();
    return;
  }

  // FIND-E1: empty-state CTA on the Contexts section — close the drawer
  // and route the user to the new-session entry point so the wizard can
  // walk them through Voice / Brief / Brand and save the resulting
  // context back into this list.
  if (event.target.closest("[data-settings-new-chat]")) {
    close();
    window.location.replace(window.location.href.split("#")[0] + "#/session/new");
    return;
  }
}

function onChange(event) {
  // Preferences inputs
  const pref = event.target.closest("[data-pref]");
  if (pref) {
    const key = pref.dataset.pref;
    if (pref.type === "checkbox") {
      state.prefs[key] = pref.checked;
    } else if (pref.type === "radio") {
      if (pref.checked) state.prefs[key] = pref.value;
    } else {
      state.prefs[key] = pref.value;
    }
    state.dirty = true;
    if (state.activeSection === "preferences") {
      // Re-render so the conditional emoji-frequency block reflects the toggle.
      renderContent();
      renderFooter();
    }
    return;
  }
  // Notification toggles
  const notif = event.target.closest("[data-notif]");
  if (notif) {
    const [group, key] = notif.dataset.notif.split(".");
    state.notif[group][key] = notif.checked;
    state.dirty = true;
    renderFooter();
    return;
  }
}

function onKeydown(event) {
  if (event.key !== "Escape") return;
  if (confirmDialog.classList.contains("open")) {
    closeConfirm();
    return;
  }
  if (drawer.classList.contains("open")) {
    attemptClose();
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
  footerEl = document.getElementById("settingsFooter");
  confirmBackdrop = document.getElementById("settingsConfirmBackdrop");
  confirmDialog = document.getElementById("settingsConfirm");
  confirmText = document.getElementById("settingsConfirmText");

  drawer.addEventListener("click", onClick);
  drawer.addEventListener("change", onChange);
  drawer.addEventListener("input", onChange);

  backdrop.addEventListener("click", attemptClose);

  document.addEventListener("keydown", onKeydown);

  // Confirm dialog wiring.
  document.getElementById("settingsConfirmCancel").addEventListener("click", closeConfirm);
  document.getElementById("settingsConfirmOk").addEventListener("click", () => {
    const action = state.pendingAction;
    closeConfirm();
    if (typeof action === "function") action();
  });
  confirmBackdrop.addEventListener("click", closeConfirm);
}
