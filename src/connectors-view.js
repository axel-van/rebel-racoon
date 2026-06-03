// Connectors — shared, pure render + filter helpers.
//
// Used by BOTH the gallery page (screens/connectors.js) and the connectors
// modal (components/connectors-modal.js) so the two surfaces render identically
// and stay DRY. This module is import-only one way: it reads connectors-store
// + utils and imports nothing that imports it back (no cycle with the page or
// the modal).
//
// Every builder returns a plain HTML string with values escaped via escapeHtml
// (NOT a tagged html`` template — callers inject these via innerHTML / raw()).
// Interactive hooks are data-* attributes bound identically on each surface:
//   data-connector-open|connect|disconnect|try, data-connectors-category|search

import { escapeHtml } from "./utils.js?v=20";
import { getConnectors } from "./connectors-store.js?v=22";

// Category display order — anything unlisted falls to the end alphabetically.
export const CATEGORY_ORDER = ["Docs & wikis", "Storage", "Dev & project", "Messaging", "CRM & support"];

// ─── Logo ────────────────────────────────────────────────────────────────
// SVG asset when one ships; otherwise an accent-colored monogram tile (width /
// height / font-size set inline so the tile matches each call site).
export function renderConnectorLogo(c, size = 40) {
  if (c.logo) {
    return `<img class="connector-logo" src="${escapeHtml(c.logo)}" alt="" width="${size}" height="${size}" loading="lazy" />`;
  }
  const initial = (c.name || "?").trim().charAt(0).toUpperCase();
  const px = Number(size) || 40;
  return `<span class="connector-logo connector-logo--mono" style="--connector-accent:${escapeHtml(
    c.accent || "#41526b",
  )};width:${px}px;height:${px}px;font-size:${Math.round(px * 0.4)}px" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

// ─── Filtering ─────────────────────────────────────────────────────────────

export function matchesQuery(c, q) {
  if (!q) return true;
  const hay = `${c.name} ${c.desc} ${(c.capabilities || []).join(" ")} ${c.category || ""}`.toLowerCase();
  return hay.includes(q);
}

export function sortedCategories(cats) {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function counts(all) {
  return { total: all.length, connected: all.filter((c) => c.status === "connected").length };
}

// ─── Small builders ──────────────────────────────────────────────────────

function capabilityChips(c) {
  return (c.capabilities || [])
    .map((cap) => `<span class="ap-tag grey connector-cap">${escapeHtml(cap)}</span>`)
    .join("");
}

function renderCategoryChip(value, label, active) {
  // Shared .ap-filter-chip primitive (ds-patches.css) — same chip as the Ideas
  // panel; aria-pressed drives the selected state.
  return `<button type="button" class="ap-filter-chip" data-connectors-category="${escapeHtml(
    value,
  )}" role="tab" aria-pressed="${active}" aria-selected="${active}"><span>${escapeHtml(label)}</span></button>`;
}

function renderFeaturedCard(c) {
  const isConnected = c.status === "connected";
  return `
    <button type="button" class="ap-card connectors-featured__card" data-connector-open="${escapeHtml(c.id)}">
      <div class="connectors-featured__card-head">
        ${renderConnectorLogo(c, 44)}
        ${isConnected ? `<span class="ap-status green">Connected</span>` : `<span class="connectors-featured__add"><i class="ap-icon-plus"></i></span>`}
      </div>
      <div class="connectors-featured__card-name">${escapeHtml(c.name)}</div>
      <div class="connectors-featured__card-desc muted">${escapeHtml(c.desc)}</div>
    </button>
  `;
}

export function renderConnectorRow(c) {
  const isConnected = c.status === "connected";
  const action = isConnected
    ? `<button type="button" class="ap-button primary orange" data-connector-try="${escapeHtml(c.id)}">
         <i class="ap-icon-single-chat-bubble"></i><span>Try in chat</span>
       </button>
       <button type="button" class="ap-button ghost grey" data-connector-disconnect="${escapeHtml(c.id)}">Disconnect</button>`
    : `<button type="button" class="ap-button stroked blue" data-connector-connect="${escapeHtml(c.id)}">
         <i class="ap-icon-plus"></i><span>Connect</span>
       </button>`;
  return `
    <div class="connectors-row" data-connector-id="${escapeHtml(c.id)}">
      <button type="button" class="connectors-row__main" data-connector-open="${escapeHtml(c.id)}">
        ${renderConnectorLogo(c, 40)}
        <div class="connectors-row__body">
          <div class="connectors-row__title-line">
            <span class="connectors-row__title">${escapeHtml(c.name)}</span>
            ${isConnected ? `<span class="ap-status green">Connected</span>` : ""}
          </div>
          <div class="connectors-row__desc muted">${escapeHtml(c.desc)}</div>
          <div class="connectors-row__caps">${capabilityChips(c)}</div>
        </div>
      </button>
      <div class="connectors-row__action">${action}</div>
    </div>
  `;
}

// ─── Gallery body ──────────────────────────────────────────────────────────
// `view` = { query, category }. `showHero` toggles the page's title block
// (the modal supplies its own header, so it passes showHero:false).
export function renderGalleryBody(view, { showHero = true } = {}) {
  const all = getConnectors();
  const q = (view.query || "").trim().toLowerCase();
  const cats = sortedCategories(new Set(all.map((c) => c.category || "Other")));
  const cnt = counts(all);

  const filtered = all.filter((x) => matchesQuery(x, q) && (view.category === "all" || x.category === view.category));

  // Featured grid only when browsing unfiltered (no search, all categories).
  const showFeatured = !q && view.category === "all";
  const featured = showFeatured ? all.filter((x) => x.featured) : [];

  const catChips = [
    renderCategoryChip("all", "All", view.category === "all"),
    ...cats.map((cat) => renderCategoryChip(cat, cat, view.category === cat)),
  ].join("");

  const groups = sortedCategories(new Set(filtered.map((x) => x.category || "Other")));
  const list = groups
    .map((cat) => {
      const rows = filtered
        .filter((x) => (x.category || "Other") === cat)
        .map(renderConnectorRow)
        .join("");
      return `
        <div class="connectors-group">
          <h2 class="connectors-group__title">${escapeHtml(cat)}</h2>
          <div class="ap-card connectors-list">${rows}</div>
        </div>`;
    })
    .join("");

  const empty = filtered.length
    ? ""
    : `<div class="connectors-empty">
         <div class="connectors-empty__icon"><i class="ap-icon-search"></i></div>
         <div class="connectors-empty__title">No connectors match "${escapeHtml(view.query || "")}"</div>
         <div class="connectors-empty__sub muted">Try a different search or clear the filters.</div>
       </div>`;

  const hero = showHero
    ? `<header class="connectors-view__hero">
         <div class="connectors-view__hero-text">
           <h1>Connectors</h1>
           <p class="ap-subtitle">Connect your tools and I'll search them live while we work — no need to import anything.</p>
         </div>
         <span class="ap-status grey no-dot connectors-view__count">${cnt.connected} of ${cnt.total} connected</span>
       </header>`
    : "";

  const featuredBlock = featured.length
    ? `<div class="connectors-featured">
         <h2 class="connectors-group__title">Featured</h2>
         <div class="connectors-featured__grid">${featured.map(renderFeaturedCard).join("")}</div>
       </div>`
    : "";

  return `
    ${hero}
    <div class="connectors-view__toolbar">
      <div class="ap-input-group connectors-view__search">
        <i class="ap-icon-search"></i>
        <input
          type="search"
          class="ap-input"
          placeholder="Search connectors…"
          value="${escapeHtml(view.query || "")}"
          data-connectors-search
          aria-label="Search connectors"
        />
      </div>
      <div class="connectors-view__categories" role="tablist" aria-label="Filter by category">${catChips}</div>
    </div>
    ${featuredBlock}
    ${list}
    ${empty}
  `;
}

// ─── Detail body ─────────────────────────────────────────────────────────
// One connector's detail — no back button (the host page/modal owns chrome).
export function renderDetailBody(c) {
  const isConnected = c.status === "connected";
  const caps = (c.capabilities || [])
    .map(
      (cap) => `
      <li class="connectors-detail__cap">
        <i class="ap-icon-bolden" aria-hidden="true"></i>
        <span>${escapeHtml(cap)}</span>
      </li>`,
    )
    .join("");
  const meta = isConnected
    ? `<div class="connectors-detail__meta muted">Connected${
        c.account ? ` as <strong>${escapeHtml(c.account)}</strong>` : ""
      }${c.lastSync ? ` · Last sync: ${escapeHtml(c.lastSync)}` : ""}</div>`
    : "";
  const actions = isConnected
    ? `<button type="button" class="ap-button primary orange" data-connector-try="${escapeHtml(c.id)}">
         <i class="ap-icon-single-chat-bubble"></i><span>Try in chat</span>
       </button>
       <button type="button" class="ap-button ghost grey" data-connector-disconnect="${escapeHtml(c.id)}">Disconnect</button>`
    : `<button type="button" class="ap-button primary blue" data-connector-connect="${escapeHtml(c.id)}">
         <i class="ap-icon-plus"></i><span>Connect</span>
       </button>`;

  return `
    <div class="connectors-detail">
      <header class="connectors-detail__head">
        ${renderConnectorLogo(c, 64)}
        <div class="connectors-detail__head-text">
          <div class="connectors-detail__title-line">
            <h1>${escapeHtml(c.name)}</h1>
            ${isConnected ? `<span class="ap-status green">Connected</span>` : ""}
          </div>
          <span class="ap-tag grey">${escapeHtml(c.category || "Other")}</span>
          <p class="connectors-detail__desc">${escapeHtml(c.desc)}.</p>
          ${meta}
        </div>
        <div class="connectors-detail__actions">${actions}</div>
      </header>

      <div class="ap-card connectors-detail__card">
        <h2 class="connectors-detail__section-title">What I can do over MCP</h2>
        <p class="muted connectors-detail__section-sub">
          Once connected, I query ${escapeHtml(c.name)} live — these are the tools I'll call.
        </p>
        <ul class="connectors-detail__caps">${caps}</ul>
      </div>
    </div>
  `;
}
