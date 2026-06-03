// Connectors — full-page gallery route /connectors.
//
// A Codex-style marketplace of integrations (Notion, Slite, Drive, GitHub, …).
// Once connected, a connector becomes a LIVE source: the assistant queries its
// content live over a (simulated) MCP round-trip instead of the user importing
// static docs. See connector-ask.js + assistant.js sendConnectorMessage.
//
// Surfaces:
//   • search + category filter + "Featured" grid + grouped list
//   • a detail view (?connector=<id>) with full description, capabilities,
//     and Connect / Disconnect / Try-in-chat actions
//
// Connect/Disconnect goes through connectors-store so Settings and the
// Add-source modal (the other surfaces listing connectors) stay in sync.

import { html, raw, escapeHtml } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=96";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { showToast } from "../components/toast.js?v=20";
import { setHandoff } from "../handoff.js?v=20";
import {
  getConnectors,
  findConnector,
  setConnectorStatus,
  subscribe as subscribeConnectors,
} from "../connectors-store.js?v=22";

// Category display order — anything unlisted falls to the end alphabetically.
const CATEGORY_ORDER = ["Docs & wikis", "Storage", "Dev & project", "Messaging", "CRM & support"];

// Local view state (not URL-encoded — the detail view IS, via ?connector=).
let view = { query: "", category: "all" };

let unsubscribe = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;

export function renderConnectors(_params, target) {
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Repaint when an external surface (Settings / Add-source modal) flips a
  // connector's state, so the gallery's badges stay live.
  unsubscribe = subscribeConnectors(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

// ─── Logo helper (shared) ──────────────────────────────────────────────────
// SVG asset when one ships; otherwise an accent-colored monogram tile. Exported
// so Settings and the Add-source modal render connectors identically.
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

// ─── Render ────────────────────────────────────────────────────────────────

function activeConnectorId() {
  return parseHashParams().get("connector");
}

function paint(target) {
  const detailId = activeConnectorId();
  const detail = detailId ? findConnector(detailId) : null;
  target.innerHTML = html`<section class="screen connectors-view">
    ${raw(detail ? renderDetail(detail) : renderGallery())}
  </section>`;
}

function counts() {
  const all = getConnectors();
  return { total: all.length, connected: all.filter((c) => c.status === "connected").length };
}

function capabilityChips(c) {
  return (c.capabilities || [])
    .map((cap) => `<span class="ap-tag grey connector-cap">${escapeHtml(cap)}</span>`)
    .join("");
}

function matchesQuery(c, q) {
  if (!q) return true;
  const hay = `${c.name} ${c.desc} ${(c.capabilities || []).join(" ")} ${c.category || ""}`.toLowerCase();
  return hay.includes(q);
}

function sortedCategories(cats) {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function renderGallery() {
  const all = getConnectors();
  const q = view.query.trim().toLowerCase();
  const cats = sortedCategories(new Set(all.map((c) => c.category || "Other")));
  const c = counts();

  const filtered = all.filter((x) => matchesQuery(x, q) && (view.category === "all" || x.category === view.category));

  // Featured grid only when browsing unfiltered (no search, all categories).
  const showFeatured = !q && view.category === "all";
  const featured = showFeatured ? all.filter((x) => x.featured) : [];

  const catChips = [
    renderCategoryChip("all", "All", view.category === "all"),
    ...cats.map((cat) => renderCategoryChip(cat, cat, view.category === cat)),
  ].join("");

  // Grouped list (skip the categories already shown in the featured grid? no —
  // show all so the page reads as a full catalog).
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
         <div class="connectors-empty__title">No connectors match "${escapeHtml(view.query)}"</div>
         <div class="connectors-empty__sub muted">Try a different search or clear the filters.</div>
       </div>`;

  return html`
    <header class="connectors-view__hero">
      <div class="connectors-view__hero-text">
        <h1>Connectors</h1>
        <p class="ap-subtitle">
          Connect your tools and I'll search them live while we work — no need to import anything.
        </p>
      </div>
      <span class="ap-status grey no-dot connectors-view__count">${c.connected} of ${c.total} connected</span>
    </header>

    <div class="connectors-view__toolbar">
      <div class="ap-input-group connectors-view__search">
        <i class="ap-icon-search"></i>
        <input
          type="search"
          class="ap-input"
          placeholder="Search connectors…"
          value="${escapeHtml(view.query)}"
          data-connectors-search
          aria-label="Search connectors"
        />
      </div>
      <div class="connectors-view__categories" role="tablist" aria-label="Filter by category">${raw(catChips)}</div>
    </div>

    ${raw(
      featured.length
        ? `<div class="connectors-featured">
             <h2 class="connectors-group__title">Featured</h2>
             <div class="connectors-featured__grid">${featured.map(renderFeaturedCard).join("")}</div>
           </div>`
        : "",
    )}
    ${raw(list)} ${raw(empty)}
  `;
}

function renderCategoryChip(value, label, active) {
  // Reuse the shared .ap-filter-chip primitive (ds-patches.css) — same chip as
  // the Ideas panel's kind filters; aria-pressed drives the selected state.
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

function renderConnectorRow(c) {
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

function renderDetail(c) {
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

  return html`
    <div class="connectors-detail">
      <button type="button" class="ap-button transparent grey connectors-detail__back" data-connector-back>
        <i class="ap-icon-arrow-left"></i><span>All connectors</span>
      </button>

      <header class="connectors-detail__head">
        ${raw(renderConnectorLogo(c, 64))}
        <div class="connectors-detail__head-text">
          <div class="connectors-detail__title-line">
            <h1>${escapeHtml(c.name)}</h1>
            ${isConnected ? `<span class="ap-status green">Connected</span>` : ""}
          </div>
          <span class="ap-tag grey">${escapeHtml(c.category || "Other")}</span>
          <p class="connectors-detail__desc">${escapeHtml(c.desc)}.</p>
          ${raw(meta)}
        </div>
        <div class="connectors-detail__actions">
          ${raw(
            isConnected
              ? `<button type="button" class="ap-button primary orange" data-connector-try="${escapeHtml(c.id)}">
                   <i class="ap-icon-single-chat-bubble"></i><span>Try in chat</span>
                 </button>
                 <button type="button" class="ap-button ghost grey" data-connector-disconnect="${escapeHtml(c.id)}">Disconnect</button>`
              : `<button type="button" class="ap-button primary blue" data-connector-connect="${escapeHtml(c.id)}">
                   <i class="ap-icon-plus"></i><span>Connect</span>
                 </button>`,
          )}
        </div>
      </header>

      <div class="ap-card connectors-detail__card">
        <h2 class="connectors-detail__section-title">What I can do over MCP</h2>
        <p class="muted connectors-detail__section-sub">
          Once connected, I query ${escapeHtml(c.name)} live — these are the tools I'll call.
        </p>
        <ul class="connectors-detail__caps">
          ${raw(caps)}
        </ul>
      </div>
    </div>
  `;
}

// ─── Events ──────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundInput = (event) => {
    const search = event.target.closest("[data-connectors-search]");
    if (search) {
      view.query = search.value;
      // Repaint but keep focus + caret in the search field.
      paint(target);
      const next = target.querySelector("[data-connectors-search]");
      if (next) {
        next.focus();
        const len = next.value.length;
        try {
          next.setSelectionRange(len, len);
        } catch {
          /* search inputs may not support setSelectionRange in all browsers */
        }
      }
    }
  };
  target.addEventListener("input", boundInput);

  boundClick = (event) => {
    const catChip = event.target.closest("[data-connectors-category]");
    if (catChip) {
      view.category = catChip.dataset.connectorsCategory;
      paint(target);
      return;
    }

    const openBtn = event.target.closest("[data-connector-open]");
    if (openBtn) {
      setHashQuery("/connectors", { connector: openBtn.dataset.connectorOpen });
      paint(target);
      return;
    }

    if (event.target.closest("[data-connector-back]")) {
      setHashQuery("/connectors", {});
      paint(target);
      return;
    }

    const connectBtn = event.target.closest("[data-connector-connect]");
    if (connectBtn) {
      toggleConnector(connectBtn.dataset.connectorConnect, true, target);
      return;
    }

    const disconnectBtn = event.target.closest("[data-connector-disconnect]");
    if (disconnectBtn) {
      toggleConnector(disconnectBtn.dataset.connectorDisconnect, false, target);
      return;
    }

    const tryBtn = event.target.closest("[data-connector-try]");
    if (tryBtn) {
      startTryInChat(tryBtn.dataset.connectorTry);
      return;
    }
  };
  target.addEventListener("click", boundClick);
}

function toggleConnector(id, connect, target) {
  const c = findConnector(id);
  if (!c) return;
  const previous = { status: c.status, account: c.account || null, lastSync: c.lastSync || null };
  const updated = connect
    ? setConnectorStatus(id, { status: "connected", account: "matt@archie.io", lastSync: "just now" })
    : setConnectorStatus(id, { status: "disconnected", account: null, lastSync: null });
  // store notify repaints, but paint here too so the toggle feels instant.
  paint(target);
  showToast(`${updated.name} ${connect ? "connected" : "disconnected"}`, {
    action: {
      label: "Undo",
      onClick: () => {
        setConnectorStatus(id, previous);
        paint(target);
      },
    },
  });
}

// Hand off to a fresh chat that runs the "Ask a connector" flow on mount
// (session.js consumes pendingAskConnector). Mirrors the sidebar's new-chat id.
function startTryInChat(id) {
  setHandoff("pendingAskConnector", { connectorId: id });
  navigate(`/session/new-${Date.now().toString(36)}`);
}
