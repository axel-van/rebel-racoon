// Content strategy — the pillar list, route /content-strategy.
//
// A PILLAR is a theme the brand keeps coming back to. This screen is the set of
// them, per account, plus the empty state before any exist.
//
// ── Why a section of its own, and not part of the Playbook ─────────────────
// A Playbook is a fact sheet: every section answers "who are you?". A pillar
// answers "what are we saying?" — and unlike a Playbook it CHANGES ON ITS OWN,
// which is the thing a fact sheet must never do. It also has to be reviewable at
// a glance and shareable with a client, which a pinned chat cannot be.
//
// This does not contradict "a settings surface must not aggregate" (CLAUDE.md):
// that rule's second clause is "…or on a route scoped to one feature", and this
// is one feature. Nothing else is re-hosted here.
//
// ── Nothing on this page is a queue ───────────────────────────────────────
// The counters count what ARRIVED, not what is waiting. There is no pending
// state to clear anywhere in this feature, so no card carries an action that
// says "deal with me" — Review is navigation, not triage.
//
// Modelled on screens/research.js: flag guard, teardown/paint/bind, delegated
// listeners, store subscriptions, teardown handed back to the router.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=415";
import { showToast } from "../components/toast.js?v=21";
import { isFlagOn } from "../feature-flags.js?v=22";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=74";
import { open as openConfirm } from "../components/confirm-modal.js?v=22";
import { open as openPillarModal } from "../components/pillar-modal.js?v=1";
import {
  getPillars,
  getPillarById,
  deletePillar,
  mergePillar,
  updatePillar,
  unseenCountFor,
  subscribe as subscribePillars,
} from "../pillars-store.js?v=1";

// The Playbook facet lives in module state, not the URL, for the same reason the
// Topic-feeds list keeps its own: nothing downstream needs this scope, and a
// pillar's page carries its own id.
let view = { playbook: "all", menuFor: null };

let unsubscribePillars = null;
let unsubscribeContexts = null;
let boundTarget = null;
let boundClick = null;

export function renderContentStrategy(_params, target) {
  // Gated (default OFF). When off the route is unreachable from the UI, but a
  // stale deep link has to bounce home rather than render a surface the flag
  // says doesn't exist. Same guard as /topics and /topic-feeds.
  if (!isFlagOn("contentStrategy")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  view = { playbook: "all", menuFor: null };
  paint(target);
  bind(target);
  unsubscribePillars = subscribePillars(() => paint(target));
  // Playbook names are read on every card, so a rename elsewhere repaints.
  unsubscribeContexts = subscribeContexts(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribePillars) {
    unsubscribePillars();
    unsubscribePillars = null;
  }
  if (unsubscribeContexts) {
    unsubscribeContexts();
    unsubscribeContexts = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen strategy-view">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

function visiblePillars() {
  const all = getPillars();
  return view.playbook === "all" ? all : all.filter((p) => p.playbookId === view.playbook);
}

function renderPage() {
  const pillars = visiblePillars();
  const total = getPillars().length;
  return `
    ${renderHead(total)}
    ${total === 0 ? renderEmpty() : `<div class="strategy-grid">${pillars.map(renderCard).join("")}${renderNewTile()}</div>`}
    ${total === 0 ? "" : `<p class="strategy-view__foot">Optional by design — a brand with no pillars sees this section empty and loses nothing. Everything I open on my own is labelled, and can be renamed, merged or deleted.</p>`}
  `;
}

function renderHead(total) {
  const arrived = getPillars().reduce((n, p) => n + unseenCountFor(p.id), 0);
  // The subtitle states in words what the nav badge states as a number. Both
  // describe what ARRIVED — neither is a to-do.
  const summary = total
    ? `${total} pillar${total === 1 ? "" : "s"}${arrived ? ` · ${arrived} thing${arrived === 1 ? "" : "s"} filed since you last looked` : " · nothing new since you last looked"}`
    : "Nothing yet";
  return `
    <header class="strategy-view__head">
      <div class="strategy-view__heading">
        <h1 class="ap-h2 strategy-view__title">Content strategy</h1>
        <p class="strategy-view__sub">${escapeAttr(summary)}</p>
      </div>
      <div class="strategy-view__actions">
        ${renderPlaybookFilter(getContexts(), view.playbook)}
        <button type="button" class="ap-button primary blue" data-strategy-new>
          <i class="ap-icon-plus"></i><span>New pillar</span>
        </button>
      </div>
    </header>`;
}

// The Playbook facet, as the DS select — `<details class="ap-select">` with a
// summary trigger and a dropdown of `.ap-select-option` rows. Copied wholesale
// from research.renderPlaybookFilter rather than re-derived, because the two are
// the same control on two sibling list pages and the note there is the one that
// matters: `.ap-select` styles a DETAILS/SUMMARY widget, and the DS styles no
// bare `<select>` anywhere. A native select wearing these classes collapses to a
// 21px box beside its 36px neighbours.
function renderPlaybookFilter(contexts, active) {
  const activeName =
    active === "all" ? "All Playbooks" : contexts.find((c) => c.id === active)?.name || "All Playbooks";
  const option = (id, label) => {
    const on = active === id;
    return `<div
      class="ap-select-option${on ? " selected" : ""}"
      data-strategy-playbook="${escapeAttr(id)}"
      role="option"
      aria-selected="${on ? "true" : "false"}"
    >
      <span class="ap-select-option-text">${escapeAttr(label)}</span>
      ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
    </div>`;
  };
  return `<details class="ap-select strategy-view__filter">
    <summary class="ap-select-trigger">
      <span class="ap-select-value">${escapeAttr(activeName)}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Filter by Playbook">
      <div class="ap-select-options">
        ${option("all", "All Playbooks")}${contexts.map((c) => option(c.id, c.name)).join("")}
      </div>
    </div>
  </details>`;
}

function renderEmpty() {
  return `
    <div class="strategy-empty">
      <span class="strategy-empty__mark"><i class="ap-icon-stack"></i></span>
      <h2 class="ap-h3 strategy-empty__title">No pillars yet</h2>
      <p class="strategy-empty__body">
        A pillar is a theme you keep coming back to. Name one and I'll file matching topics and chats into it as
        they arrive, and keep its context in one place — so a draft can start from what you already believe.
      </p>
      <p class="strategy-empty__body strategy-empty__body--quiet">
        Entirely optional. Plenty of brands never need one.
      </p>
      <button type="button" class="ap-button primary blue" data-strategy-new>
        <i class="ap-icon-plus"></i><span>New pillar</span>
      </button>
    </div>`;
}

function renderCard(p) {
  const ctx = p.playbookId ? getContextById(p.playbookId) : null;
  const arrived = unseenCountFor(p.id);
  const auto = p.createdBy === "archie" && !p.reviewed;
  const menuOpen = view.menuFor === p.id;
  // "N filed this week" is the only line on this card that gives anyone a reason
  // to open it. When nothing arrived it says so plainly rather than going blank —
  // a quiet pillar is a fact, not a missing value.
  const when = arrived
    ? `${arrived} filed since you last looked`
    : `updated ${escapeAttr(p.contextUpdatedAgo || "a while ago")}`;
  return `
    <article class="ap-card strategy-card${auto ? " strategy-card--auto" : ""}" data-pillar-card="${escapeAttr(p.id)}">
      <div class="strategy-card__head">
        <span class="strategy-card__name">${escapeAttr(p.name)}</span>
        ${
          auto
            ? // A CLICKABLE tag, which the DS allows (.ap-tag:is(button)) — the label
              // means "you have not vetted this yet", so acknowledging it is the one
              // thing it should be able to do. Opening the pillar clears it too; both
              // are the same single click the label is waiting for.
              `<button type="button" class="ap-tag blue strategy-card__auto" data-pillar-ack="${escapeAttr(p.id)}"
                 title="Dismiss this label">
                 <span>Automatically created</span>
               </button>`
            : ""
        }
      </div>
      <p class="strategy-card__body">${escapeAttr(p.about || p.context || "")}</p>
      <div class="strategy-card__meta">
        <span>${p.sources.length} source${p.sources.length === 1 ? "" : "s"}${ctx ? ` · ${escapeAttr(ctx.name)}` : ""}</span>
        <span class="strategy-card__when">${when}</span>
      </div>
      <div class="strategy-card__foot">
        <button type="button" class="ap-button ghost blue strategy-card__open" data-pillar-open="${escapeAttr(p.id)}">
          <span>Review</span><i class="ap-icon-arrow-right"></i>
        </button>
      </div>
      <button
        type="button"
        class="ap-icon-button transparent strategy-card__more"
        data-pillar-more="${escapeAttr(p.id)}"
        aria-haspopup="menu"
        aria-expanded="${menuOpen ? "true" : "false"}"
        aria-label="More actions for ${escapeAttr(p.name)}"
      >
        <i class="ap-icon-more"></i>
      </button>
      ${menuOpen ? renderCardMenu(p) : ""}
    </article>`;
}

// Rename · Merge · Delete. Merge is the one that matters and the reason this
// menu exists at all: the common failure of a pillar Archie opened is a
// near-duplicate of one that already exists, and without merge the only recovery
// is deleting it and losing everything it collected.
function renderCardMenu(p) {
  const siblings = getPillars().filter((x) => x.id !== p.id && x.playbookId === p.playbookId);
  return `
    <div class="ap-action-dropdown strategy-card__menu" role="menu" data-pillar-menu="${escapeAttr(p.id)}">
      <button type="button" role="menuitem" class="ap-action-dropdown-item" data-pillar-rename="${escapeAttr(p.id)}">
        <i class="ap-icon-pen"></i>
        <div class="ap-action-dropdown-item-text">
          <div class="ap-action-dropdown-item-label-container">
            <span class="ap-action-dropdown-item-label">Rename</span>
          </div>
        </div>
      </button>
      ${siblings
        .map(
          (s) => `
      <button type="button" role="menuitem" class="ap-action-dropdown-item has-description" data-pillar-merge="${escapeAttr(p.id)}" data-pillar-merge-into="${escapeAttr(s.id)}">
        <i class="ap-icon-stack"></i>
        <div class="ap-action-dropdown-item-text">
          <div class="ap-action-dropdown-item-label-container">
            <span class="ap-action-dropdown-item-label">Merge into ${escapeAttr(s.name)}</span>
          </div>
          <span class="ap-action-dropdown-item-description">Moves every source and asset across</span>
        </div>
      </button>`,
        )
        .join("")}
      <div class="ap-action-dropdown-divider"></div>
      <button type="button" role="menuitem" class="ap-action-dropdown-item red-mode" data-pillar-delete="${escapeAttr(p.id)}">
        <i class="ap-icon-trash"></i>
        <div class="ap-action-dropdown-item-text">
          <div class="ap-action-dropdown-item-label-container">
            <span class="ap-action-dropdown-item-label">Delete pillar</span>
          </div>
        </div>
      </button>
    </div>`;
}

// The ghost tile, in the /contexts "Create a Playbook" shape — same glyph, same
// centred stack, same butter hover. It was a card with a button inside it, and
// that was the bug behind "the new-pillar button is broken": the tile LOOKED
// like a target, but only the small button in its corner was one, so a click
// anywhere else did nothing. The whole tile is the button now.
function renderNewTile() {
  return `
    <button type="button" class="strategy-card--new" data-strategy-new aria-label="Create a new pillar">
      <span class="strategy-card--new__glyph"><i class="ap-icon-archie-official"></i></span>
      <span class="strategy-card--new__title">Start a pillar</span>
      <span class="strategy-card--new__sub">
        A theme you keep coming back to — I'll file matching topics into it as they arrive.
      </span>
    </button>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    const openBtn = event.target.closest("[data-pillar-open]");
    if (openBtn) {
      navigate(`/pillar/${openBtn.getAttribute("data-pillar-open")}`);
      return;
    }
    if (event.target.closest("[data-strategy-new]")) {
      // Close any open card menu first — a dropdown left standing behind a modal
      // is the classic one-overlay-at-a-time miss.
      const hadMenu = view.menuFor !== null;
      view.menuFor = null;
      if (hadMenu) paint(target);
      openPillarModal({ playbookId: view.playbook === "all" ? null : view.playbook });
      return;
    }
    const facet = event.target.closest("[data-strategy-playbook]");
    if (facet) {
      view.playbook = facet.getAttribute("data-strategy-playbook");
      // Close the <details> by hand: paint() rebuilds the tree, so the open
      // attribute would otherwise survive into the next render.
      const details = facet.closest("details");
      if (details) details.open = false;
      paint(target);
      return;
    }
    const ack = event.target.closest("[data-pillar-ack]");
    if (ack) {
      updatePillar(ack.getAttribute("data-pillar-ack"), { reviewed: true });
      return;
    }
    const more = event.target.closest("[data-pillar-more]");
    if (more) {
      const id = more.getAttribute("data-pillar-more");
      view.menuFor = view.menuFor === id ? null : id;
      paint(target);
      return;
    }
    const rename = event.target.closest("[data-pillar-rename]");
    if (rename) {
      const p = getPillarById(rename.getAttribute("data-pillar-rename"));
      view.menuFor = null;
      if (p) {
        openPillarModal({
          mode: "edit",
          pillar: p,
          onDone: () => showToast(`Saved “${p.name}”`),
        });
      } else paint(target);
      return;
    }
    const merge = event.target.closest("[data-pillar-merge]");
    if (merge) {
      const fromId = merge.getAttribute("data-pillar-merge");
      const intoId = merge.getAttribute("data-pillar-merge-into");
      const from = getPillarById(fromId);
      const into = getPillarById(intoId);
      view.menuFor = null;
      mergePillar(fromId, intoId);
      if (from && into) showToast(`Merged “${from.name}” into “${into.name}”`);
      return;
    }
    const del = event.target.closest("[data-pillar-delete]");
    if (del) {
      const p = getPillarById(del.getAttribute("data-pillar-delete"));
      view.menuFor = null;
      paint(target);
      if (!p) return;
      // A confirm, not an undo snackbar: a pillar carries a condensed context and
      // an audit trail that cannot be rebuilt from a toast.
      openConfirm({
        title: "Delete this pillar?",
        body: `“${p.name}” and everything filed into it — ${p.sources.length} source${p.sources.length === 1 ? "" : "s"} — go with it. Its topics stay in your feeds.`,
        confirmLabel: "Delete pillar",
        danger: true,
        onConfirm: () => {
          deletePillar(p.id);
          showToast(`Deleted “${p.name}”`);
        },
      });
      return;
    }
    // Click anywhere else closes an open card menu, the same one-open-at-a-time
    // rule every other card menu in the app follows.
    if (view.menuFor) {
      view.menuFor = null;
      paint(target);
    }
  };
  target.addEventListener("click", boundClick);
}

// Exported for the pillar page's "mark reviewed" path — kept here so the label
// rule (an Archie-opened pillar is labelled until someone opens it) lives beside
// the card that draws the label.
export function markPillarReviewed(id) {
  const p = getPillarById(id);
  if (p && p.createdBy === "archie" && !p.reviewed) updatePillar(id, { reviewed: true });
}
