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

import { escapeHtml } from "./utils.js?v=21";
import { getConnectors } from "./connectors-store.js?v=26";

// Category display order — anything unlisted falls to the end alphabetically.
export const CATEGORY_ORDER = [
  "Docs & wikis",
  "Storage",
  "Meetings & calls",
  "Dev & project",
  "Messaging",
  "CRM & support",
];

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

function renderCategoryChip(value, label, active) {
  // Shared .ap-filter-chip primitive (ds-patches.css) — same chip as the Ideas
  // panel; aria-pressed drives the selected state.
  return `<button type="button" class="ap-filter-chip" data-connectors-category="${escapeHtml(
    value,
  )}" role="tab" aria-pressed="${active}" aria-selected="${active}"><span>${escapeHtml(label)}</span></button>`;
}

// One connector — a compact marketplace ROW (Codex-style): logo + name +
// single-line description, with a trailing affordance (green check when
// connected, "+" when not). The whole row opens the detail (where Connect /
// Try-in-chat / Disconnect live), so the grid stays dense and scannable.
export function renderConnectorCard(c) {
  const isConnected = c.status === "connected";
  const trailing = isConnected
    ? `<span class="connectors-card__check" aria-hidden="true"><i class="ap-icon-rounded-check"></i></span>`
    : `<span class="connectors-card__add" aria-hidden="true"><i class="ap-icon-plus"></i></span>`;
  return `
    <button type="button" class="ap-card connectors-card" data-connector-open="${escapeHtml(
      c.id,
    )}" aria-label="${escapeHtml(c.name)}${isConnected ? " (connected)" : ""} — open details">
      ${renderConnectorLogo(c, 36)}
      <div class="connectors-card__body">
        <div class="connectors-card__name">${escapeHtml(c.name)}</div>
        <div class="connectors-card__desc">${escapeHtml(c.desc)}</div>
      </div>
      ${trailing}
    </button>
  `;
}

// Featured connectors float to the top of their category group.
function byFeaturedThenName(a, b) {
  const fa = a.featured ? 0 : 1;
  const fb = b.featured ? 0 : 1;
  if (fa !== fb) return fa - fb;
  return a.name.localeCompare(b.name);
}

// ─── Gallery body ──────────────────────────────────────────────────────────
// `view` = { query, category }. `showHero` toggles the page's title block
// (the modal supplies its own header, so it passes showHero:false). One uniform
// card grid grouped by category — no separate "Featured" section, so a
// connector is never listed twice.
export function renderGalleryBody(view, { showHero = true } = {}) {
  const all = getConnectors();
  const q = (view.query || "").trim().toLowerCase();
  const cats = sortedCategories(new Set(all.map((c) => c.category || "Other")));
  const cnt = counts(all);

  const filtered = all.filter((x) => matchesQuery(x, q) && (view.category === "all" || x.category === view.category));

  const catChips = [
    renderCategoryChip("all", "All", view.category === "all"),
    ...cats.map((cat) => renderCategoryChip(cat, cat, view.category === cat)),
  ].join("");

  const groups = sortedCategories(new Set(filtered.map((x) => x.category || "Other")));
  const list = groups
    .map((cat) => {
      const cards = filtered
        .filter((x) => (x.category || "Other") === cat)
        .sort(byFeaturedThenName)
        .map(renderConnectorCard)
        .join("");
      return `
        <section class="connectors-group">
          <h2 class="connectors-group__title">${escapeHtml(cat)}</h2>
          <div class="connectors-grid">${cards}</div>
        </section>`;
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
    ${list}
    ${empty}
  `;
}

// Marketing-style example prompts shown in the hero of a connected connector.
function exampledPrompts(c) {
  return [
    `What's worth posting from ${c.name} right now?`,
    `Summarize the latest in ${c.name}`,
    `Find a contrarian angle in ${c.name}`,
  ];
}

// ─── Detail body ─────────────────────────────────────────────────────────
// One connector's detail — a polished, marketing-style layout: an accent-tinted
// hero (logo + name + actions + example prompt chips), a capabilities card, and
// a small info line. No back button (the host page/modal owns the chrome).
export function renderDetailBody(c) {
  const isConnected = c.status === "connected";
  const accent = escapeHtml(c.accent || "#41526b");

  const actions = isConnected
    ? `<button type="button" class="ap-button primary orange" data-connector-try="${escapeHtml(c.id)}">
         <i class="ap-icon-single-chat-bubble"></i><span>Start a chat</span>
       </button>
       <button type="button" class="ap-button ghost grey" data-connector-disconnect="${escapeHtml(c.id)}">Disconnect</button>`
    : `<button type="button" class="ap-button primary blue" data-connector-connect="${escapeHtml(c.id)}">
         <i class="ap-icon-plus"></i><span>Connect</span>
       </button>`;

  // Example prompt chips — only for connected connectors (clicking runs the
  // in-chat ask flow, like the hero CTA).
  const examples = isConnected
    ? `<div class="connectors-detail__examples">
        ${exampledPrompts(c)
          .map(
            (p) => `
          <button type="button" class="connectors-detail__example" data-connector-try="${escapeHtml(c.id)}">
            <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
            <span>${escapeHtml(p)}</span>
            <i class="ap-icon-arrow-right connectors-detail__example-go" aria-hidden="true"></i>
          </button>`,
          )
          .join("")}
      </div>`
    : "";

  const caps = (c.capabilities || [])
    .map(
      (cap) => `
      <li class="connectors-detail__cap">
        <span class="connectors-detail__cap-icon" aria-hidden="true"><i class="ap-icon-rounded-check"></i></span>
        <span>${escapeHtml(cap)}</span>
      </li>`,
    )
    .join("");

  const meta = isConnected
    ? `<p class="connectors-detail__meta muted">Connected${
        c.account ? ` as <strong>${escapeHtml(c.account)}</strong>` : ""
      }${c.lastSync ? ` · Last sync: ${escapeHtml(c.lastSync)}` : ""}</p>`
    : "";

  return `
    <div class="connectors-detail">
      <div class="connectors-detail__hero" style="--connector-accent:${accent}">
        <div class="connectors-detail__hero-main">
          <span class="connectors-detail__hero-logo">${renderConnectorLogo(c, 48)}</span>
          <div class="connectors-detail__hero-text">
            <div class="connectors-detail__title-line">
              <h1>${escapeHtml(c.name)}</h1>
              ${isConnected ? `<span class="ap-status green">Connected</span>` : ""}
              <span class="ap-tag grey">${escapeHtml(c.category || "Other")}</span>
            </div>
            <p class="connectors-detail__desc">${escapeHtml(c.desc)}.</p>
          </div>
          <div class="connectors-detail__actions">${actions}</div>
        </div>
        ${examples}
      </div>

      <div class="ap-card connectors-detail__card">
        <h2 class="connectors-detail__section-title">What I can do over MCP</h2>
        <p class="muted connectors-detail__section-sub">
          ${
            isConnected
              ? `I query ${escapeHtml(c.name)} live over MCP — these are the tools I'll call.`
              : `Once connected, I'll query ${escapeHtml(c.name)} live over MCP — these are the tools I'll call.`
          }
        </p>
        <ul class="connectors-detail__caps">${caps}</ul>
      </div>

      ${meta}
    </div>
  `;
}
