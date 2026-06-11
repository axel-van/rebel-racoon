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
import { renderTopbar } from "../components/topbar.js?v=99";
import { parseHashParams, setHashQuery } from "../url-state.js?v=4";
import { showToast } from "../components/toast.js?v=20";
import { socialAccounts } from "../mocks.js?v=43";
// Admin section — prototype-only controls (was the floating admin chip).
import { FLAGS } from "../ff-catalog.js?v=5";
import { getFlags, setFlag } from "../feature-flags.js?v=4";
import { getUserMode, setUserMode } from "../user-mode.js?v=22";

const SECTIONS = [
  {
    id: "social",
    label: "Social profiles",
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
let boundInputHandler = null;

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
  if (boundTarget && boundInputHandler) {
    boundTarget.removeEventListener("input", boundInputHandler);
  }
  boundTarget = null;
  boundHandler = null;
  boundChangeHandler = null;
  boundInputHandler = null;
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

function renderNav(activeId) {
  const subFor = (id) => {
    if (id === "social") return `${getConnectedProfiles().length} profiles`;
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
  return renderSocialSection();
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

// ─── Social profiles (Settings › Social profiles — Figma 537-2318) ─────────

// Network → DS metadata. `icon` resolves the full-colour branded glyph
// (ap-icon-{icon}-official) used for both the group title and the avatar badge.
// Keyed by the `platform` slug used in mocks.socialAccounts.
const NETWORKS = {
  facebook: { label: "Facebook", icon: "facebook" },
  instagram: { label: "Instagram", icon: "instagram" },
  linkedin: { label: "LinkedIn", icon: "linkedin" },
  x: { label: "X (Twitter)", icon: "x" },
  tiktok: { label: "TikTok", icon: "tiktok" },
  youtube: { label: "YouTube", icon: "youtube" },
  pinterest: { label: "Pinterest", icon: "pinterest" },
  threads: { label: "Threads", icon: "threads" },
  bluesky: { label: "Bluesky", icon: "bluesky" },
};

// Token-status filter options.
const TOKEN_STATUSES = [
  { value: "all", label: "All" },
  { value: "expired", label: "Token expired" },
  { value: "expiring", label: "Expires soon" },
  { value: "ok", label: "Valid" },
];

// Plan context for the limit banner. The slots count is derived live from the
// number of connected profiles; the banner only shows once they're exhausted.
const PACKAGE_LIMIT = 12;
const PLAN_OWNER = "Benjamin Lanciaux";

// Live filter state (module-level so a repaint preserves the user's choices).
let spFilters = { network: "all", token: "all", query: "" };

function getConnectedProfiles() {
  return socialAccounts.filter((a) => a.status === "connected");
}

function matchesFilters(p) {
  if (spFilters.network !== "all" && p.platform !== spFilters.network) return false;
  const token = p.token || "ok";
  if (spFilters.token !== "all" && token !== spFilters.token) return false;
  const q = spFilters.query.trim().toLowerCase();
  if (q) {
    const hay = `${p.handle || ""} ${p.platformLabel || ""} ${p.kind || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Group profiles by network, preserving the order they appear in the source.
function groupByNetwork(profiles) {
  const order = [];
  const byKey = new Map();
  profiles.forEach((p) => {
    if (!byKey.has(p.platform)) {
      byKey.set(p.platform, []);
      order.push(p.platform);
    }
    byKey.get(p.platform).push(p);
  });
  return order.map((key) => ({ key, profiles: byKey.get(key) }));
}

function renderSocialSection() {
  const connected = getConnectedProfiles();
  const total = connected.length;
  const slotsLeft = Math.max(0, PACKAGE_LIMIT - total);
  const groups = groupByNetwork(connected.filter(matchesFilters));

  // Network filter options = "All" + every network the user actually has.
  const netOptions = [{ value: "all", label: "All" }].concat(
    [...new Set(connected.map((p) => p.platform))].map((key) => ({
      value: key,
      label: (NETWORKS[key] && NETWORKS[key].label) || key,
    })),
  );
  const networkLabel = (netOptions.find((o) => o.value === spFilters.network) || netOptions[0]).label;
  const tokenLabel = (TOKEN_STATUSES.find((o) => o.value === spFilters.token) || TOKEN_STATUSES[0]).label;

  return html`
    <main class="settings-view__content sp">
      <div class="sp-filters">
        ${raw(renderFilterSelect("network", "Network", networkLabel, netOptions))}
        ${raw(renderFilterSelect("token", "Token status", tokenLabel, TOKEN_STATUSES))}
        <div class="ap-form-field sp-search">
          <div class="ap-input-group">
            <i class="ap-icon-search"></i>
            <input
              type="search"
              placeholder="Search a social profile"
              aria-label="Search a social profile"
              value="${escapeHtml(spFilters.query)}"
              data-sp-search
            />
          </div>
        </div>
      </div>

      ${slotsLeft <= 0 ? raw(renderLimitBanner()) : ""}

      <div class="sp-count-row">
        <h2 class="sp-count-title">${total} social profiles</h2>
        <div class="sp-count-actions">
          <span class="sp-slots">
            <span class="ap-counter normal blue no-bg">${slotsLeft}</span>
            profile slots left to connect
          </span>
          <button type="button" class="ap-button secondary blue" data-sp-connect>
            <i class="ap-icon-plus"></i>
            Connect social profile
          </button>
        </div>
      </div>

      ${groups.length
        ? raw(groups.map(renderNetworkGroup).join(""))
        : raw('<p class="sp-no-results">No profiles match your filters.</p>')}
    </main>
  `;
}

function renderFilterSelect(kind, label, valueLabel, options) {
  const items = options
    .map((o) => {
      const selected = o.value === spFilters[kind];
      return `
        <div class="ap-select-option${selected ? " selected" : ""}" data-sp-option="${kind}" data-sp-value="${escapeHtml(o.value)}">
          <span class="ap-select-option-text">${escapeHtml(o.label)}</span>
          ${selected ? '<i class="ap-icon-check ap-select-option-check"></i>' : ""}
        </div>`;
    })
    .join("");
  return `
    <details class="ap-select sp-filter" data-sp-select="${kind}">
      <summary class="ap-select-trigger">
        <span class="ap-select-inline-label">${escapeHtml(label)}</span>
        <span class="ap-select-value">${escapeHtml(valueLabel)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow"></i>
      </summary>
      <div class="ap-select-dropdown">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>
  `;
}

function renderLimitBanner() {
  return `
    <div class="ap-infobox feature-lock has-title sp-limit-banner">
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-title">Social profiles limit reached</span>
          <span class="ap-infobox-message">You have reached your package limit of <strong>${PACKAGE_LIMIT}</strong> profiles. To connect more social profiles, ask the owner of the organization <strong>${escapeHtml(PLAN_OWNER)}</strong> to add more profiles slots.</span>
        </div>
      </div>
    </div>
  `;
}

function renderNetworkGroup(group) {
  const net = NETWORKS[group.key] || { label: group.key, icon: group.key };
  const needRenew = group.profiles.filter((p) => p.token && p.token !== "ok").length;
  return `
    <section class="sp-group">
      <header class="sp-group-head">
        <div class="sp-group-title">
          <i class="ap-icon-${net.icon}-official"></i>
          <span class="sp-group-name">${escapeHtml(net.label)}</span>
          <span class="ap-counter normal grey">${group.profiles.length}</span>
        </div>
        ${
          needRenew >= 2
            ? `<a href="#" class="ap-link standalone small sp-renew-all" data-sp-renew-all="${escapeHtml(group.key)}">Try renewing all <i class="ap-icon-refresh"></i></a>`
            : ""
        }
      </header>
      <div class="sp-grid">${group.profiles.map(renderProfileCard).join("")}</div>
    </section>
  `;
}

function renderProfileCard(p) {
  const net = NETWORKS[p.platform] || { icon: p.platform };
  const sub = p.kind || p.platformLabel || "";
  return `
    <div class="sp-card" data-sp-card="${escapeHtml(p.id)}">
      ${renderTokenBanner(p)}
      <div class="sp-card-body">
        <div class="ap-avatar size-36">
          <img src="${escapeHtml(p.photo)}" alt="" />
          <span class="ap-avatar-network"><i class="ap-icon-${net.icon}-official"></i></span>
        </div>
        <div class="sp-card-text">
          <div class="sp-card-name">${escapeHtml(p.handle || p.platformLabel || "")}</div>
          <div class="sp-card-org">${escapeHtml(sub)}</div>
        </div>
        <button type="button" class="ap-icon-button transparent sp-card-more" aria-label="More options" data-sp-more="${escapeHtml(p.id)}">
          <i class="ap-icon-more"></i>
        </button>
      </div>
    </div>
  `;
}

function renderTokenBanner(p) {
  if (!p.token || p.token === "ok") return "";
  const renew = `<a href="#" class="ap-link standalone small sp-renew" data-sp-renew="${escapeHtml(p.id)}">Renew <i class="ap-icon-refresh"></i></a>`;
  if (p.token === "expired") {
    return `
      <div class="sp-card-status expired">
        <span class="sp-status-label"><i class="ap-icon-error_fill"></i> Token expired</span>
        ${renew}
      </div>
    `;
  }
  return `
    <div class="sp-card-status expiring">
      <span class="sp-status-label"><i class="ap-icon-warning_fill"></i> Token expires in <strong>${p.expiresInDays} days</strong></span>
      ${renew}
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

    // Social profiles — filter dropdown option pick → update state + repaint.
    const filterOption = event.target.closest("[data-sp-option]");
    if (filterOption) {
      const kind = filterOption.dataset.spOption;
      spFilters[kind] = filterOption.dataset.spValue;
      paint(target);
      return;
    }

    // Social profiles — prototype-only affordances (no backend; surface a
    // toast so the interaction reads as live).
    const connectBtn = event.target.closest("[data-sp-connect]");
    if (connectBtn) {
      showToast("Connecting a social profile…");
      return;
    }

    const renewAll = event.target.closest("[data-sp-renew-all]");
    if (renewAll) {
      event.preventDefault();
      const net = NETWORKS[renewAll.dataset.spRenewAll];
      showToast(`Renewing all ${net ? net.label : ""} tokens…`.trim());
      return;
    }

    const renewBtn = event.target.closest("[data-sp-renew]");
    if (renewBtn) {
      event.preventDefault();
      const p = socialAccounts.find((x) => x.id === renewBtn.dataset.spRenew);
      showToast(`Renewing ${p ? p.handle || p.platformLabel : "profile"}'s token…`);
      return;
    }

    const moreBtn = event.target.closest("[data-sp-more]");
    if (moreBtn) {
      showToast("Profile options coming soon");
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

  // Social profiles — live search filter. Repaint, then restore focus +
  // caret so typing stays uninterrupted.
  boundInputHandler = (event) => {
    const search = event.target.closest("[data-sp-search]");
    if (!search) return;
    spFilters.query = search.value;
    paint(target);
    const next = target.querySelector("[data-sp-search]");
    if (next) {
      next.focus();
      try {
        const end = next.value.length;
        next.setSelectionRange(end, end);
      } catch {
        /* type=search may reject setSelectionRange in some engines */
      }
    }
  };
  target.addEventListener("input", boundInputHandler);
}
