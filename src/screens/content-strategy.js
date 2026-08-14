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
  updatePillar,
  unseenCountFor,
  subscribe as subscribePillars,
} from "../pillars-store.js?v=1";

// The Playbook facet lives in module state, not the URL, for the same reason the
// Topic-feeds list keeps its own: nothing downstream needs this scope, and a
// pillar's page carries its own id.
let view = { playbook: "all" };

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
  view = { playbook: "all" };
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

// The pillar card IS the Topic-feeds lane card — .research-card and its parts,
// reused rather than re-derived. Both are "a standing thing that collects, with a
// count of what has arrived and a way in", and the two drifted apart within a
// week when they were separate: a bespoke card had to reinvent the title button,
// the meta line, the signal row and the footer, and got each of them slightly
// wrong. Same precedent as .topics-card__summary being shared by the feed and
// the new-session list — one kind of object, one treatment.
//
// What is strategy-specific and therefore additive: the "Automatically created"
// tag, and nothing else.
function renderCard(p) {
  const ctx = p.playbookId ? getContextById(p.playbookId) : null;
  const arrived = unseenCountFor(p.id);
  const auto = p.createdBy === "archie" && !p.reviewed;
  const sourceCount = `${p.sources.length} ${p.sources.length === 1 ? "source" : "sources"}`;
  return `
    <article class="research-card strategy-card" data-pillar-card="${escapeAttr(p.id)}">
      <div class="research-card__head">
        <button type="button" class="research-card__title" data-pillar-open="${escapeAttr(p.id)}">
          ${escapeAttr(p.name)}
        </button>
        <!-- Edit + Delete as a hover panel, exactly as the lane card does it —
             which is also what retired the kebab and its dropdown. Merge lived in
             that dropdown and is out for now; when it returns it needs a target
             picker, so it will not fit in a two-icon panel and the menu comes
             back with it.

             The pen NAVIGATES to the pillar, it does not open a dialog — the same
             thing the lane card's pen does with feed settings. A pillar is edited
             on its own page, beside the context, the assets and the trail it is
             about; a modal could only ever offer a name and a sentence, which is
             the smallest and least useful part of it. -->
        <span class="research-card__hover">
          <button type="button" class="ap-icon-button ghost grey" data-pillar-open="${escapeAttr(p.id)}"
            title="Edit pillar" aria-label="Edit ${escapeAttr(p.name)}">
            <i class="ap-icon-pen" aria-hidden="true"></i>
          </button>
          <button type="button" class="ap-icon-button ghost grey research-card__delete"
            data-pillar-delete="${escapeAttr(p.id)}" title="Delete" aria-label="Delete ${escapeAttr(p.name)}">
            <i class="ap-icon-trash" aria-hidden="true"></i>
          </button>
        </span>
      </div>
      <p class="research-card__meta">
        <span class="research-card__meta-pb">
          <i class="ap-icon-target" aria-hidden="true"></i>
          <span class="sr-only">Playbook</span>${escapeAttr(ctx ? ctx.name : "No Playbook")}
        </span>
        <span class="research-card__meta-sep" aria-hidden="true">·</span>
        <span>${sourceCount}</span>
      </p>
      <p class="strategy-card__about">${escapeAttr(p.about || p.context || "")}</p>
      ${
        arrived || auto
          ? `<div class="research-card__signals">
              ${
                auto
                  ? // A CLICKABLE tag, which the DS allows (.ap-tag:is(button)) — the
                    // label means "you have not vetted this yet", so acknowledging it
                    // is the one thing it should be able to do. Opening the pillar
                    // clears it too; both are the same single click it waits for.
                    `<button type="button" class="ap-tag blue strategy-card__auto" data-pillar-ack="${escapeAttr(p.id)}"
                       title="Dismiss this label"><span>Automatically created</span></button>`
                  : ""
              }
              ${
                arrived
                  ? // The DS Badge, same component and same reasoning as the lane
                    // card's: an orange, system-generated marker for "I brought you
                    // something", carrying the count so one element answers both
                    // "is there anything" and "how much".
                    `<span class="ap-badge orange" aria-label="${arrived} filed since you last looked">${arrived} to review</span>`
                  : ""
              }
            </div>`
          : ""
      }
      <button type="button" class="research-card__open" data-pillar-open="${escapeAttr(p.id)}">
        <span>Review</span>
        <i class="ap-icon-arrow-right" aria-hidden="true"></i>
      </button>
    </article>`;
}

function renderNewTile() {
  return `
    <button type="button" class="strategy-card--new" data-strategy-new aria-label="Create a Content pillar">
      <span class="strategy-card--new__glyph"><i class="ap-icon-archie-official"></i></span>
      <span class="strategy-card--new__title">Create a Content pillar</span>
      <span class="strategy-card--new__sub">
        Create a context hub to create rich posts from topics, chats and your own assets.
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
    const del = event.target.closest("[data-pillar-delete]");
    if (del) {
      const p = getPillarById(del.getAttribute("data-pillar-delete"));
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
