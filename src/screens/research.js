// Content Research — the lane list, route /research.
//
// A LANE is a named standing query: one Playbook × a set of sources × a cadence.
// This screen is the account's whole set of them, plus the empty state before any
// exist.
//
// Why a list of lanes and not a feed: /topics is the feed shape — one stream
// across every Playbook — and it is deliberately kept. Content Research answers
// the other need, several named research operations running side by side, each
// with its own sources. So the entry point has to be the set of operations, not
// their merged output.
//
// Sidebar → Content Research always resets HERE (or to the empty state), never
// straight into a feed. Landing inside the last-opened lane hides the fact that
// others exist, and the lane you want is rarely the one you left.
//
// Modelled on screens/topics.js / screens/connectors.js — flag guard, then
// teardown/paint/bind, delegated listeners, store subscriptions, teardown handed
// back to the router.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=282";
import { showToast } from "../components/toast.js?v=20";
import { isFlagOn } from "../feature-flags.js?v=16";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=44";
import { getLanes, duplicateLane, deleteLane, subscribe as subscribeLanes } from "../research-store.js?v=2";
import { countNewForLane, countTrendingForLane, subscribe as subscribeBriefs } from "../briefs-store.js?v=3";

// Local view state. The Playbook facet lives here rather than in the URL: unlike
// /topics, whose `?pb=` scope has to survive the round trip to a per-Playbook
// settings page, a lane's settings are reached from the lane itself and carry
// their own id. Nothing downstream needs this filter, so it stays module state.
let view = { query: "", playbook: "all" };

let unsubscribeLanes = null;
let unsubscribeContexts = null;
let unsubscribeBriefs = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;

export function renderResearch(_params, target) {
  // Gated behind a feature flag (default OFF). When off the route is unreachable
  // from the UI, but a stale deep link has to bounce home rather than render a
  // surface the flag says doesn't exist. Same guard as /topics.
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  view = { query: "", playbook: "all" };
  paint(target);
  bind(target);
  unsubscribeLanes = subscribeLanes(() => paint(target));
  // Playbook names are read from contexts-store on every card, so a rename
  // elsewhere has to repaint this grid.
  unsubscribeContexts = subscribeContexts(() => paint(target));
  // …and the NEW badge counts untriaged briefs, so triaging one in a feed (or
  // confirming an add-to-strategy in a modal) has to be reflected back here.
  unsubscribeBriefs = subscribeBriefs(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribeLanes) {
    unsubscribeLanes();
    unsubscribeLanes = null;
  }
  if (unsubscribeContexts) {
    unsubscribeContexts();
    unsubscribeContexts = null;
  }
  if (unsubscribeBriefs) {
    unsubscribeBriefs();
    unsubscribeBriefs = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundInput) {
    // Bound for both events (see bind) — a <select> reports `change`, not
    // `input`, in some browsers. Both have to come off or the handler outlives
    // the screen and repaints a detached target.
    boundTarget.removeEventListener("input", boundInput);
    boundTarget.removeEventListener("change", boundInput);
  }
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen research-view">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

function matchesFilters(lane) {
  const q = view.query.trim().toLowerCase();
  const byName = !q || lane.name.toLowerCase().includes(q);
  const byPlaybook = view.playbook === "all" || lane.playbookId === view.playbook;
  return byName && byPlaybook;
}

function renderPage() {
  const lanes = getLanes();
  // The empty state is about having no lanes AT ALL — not about a search that
  // matched nothing. Conflating the two tells a user with twelve lanes that they
  // have none, and offers "create" when what they want is "clear the filter".
  if (!lanes.length) return renderEmpty();
  return html`${raw(renderTopBar())}${raw(renderBody(lanes))}`;
}

function renderTopBar() {
  return html`<header class="research-view__topbar">
    <h2 class="research-view__topbar-title">Content Research</h2>
  </header>`;
}

// The 4:3 Archie mark, from the in-repo mask glyph (.ap-icon-archie-official,
// viewBox 227.15×170.03 ≈ 4:3 — the same ratio as the brand SVGs). Mask-based,
// so `color` recolours it, which is what the create card's hover needs.
function renderMark(sizePx) {
  return html`<i
    class="ap-icon-archie-official research-mark"
    style="height:${sizePx}px;width:${Math.round(sizePx * 1.336)}px"
    aria-hidden="true"
  ></i>`;
}

function renderEmpty() {
  // Hand-composed rather than routed through components/empty-state.js: that
  // helper renders an icon-font glyph inside a fixed circle, and this state needs
  // the Archie mark at its own 4:3 ratio inside a butter disc. Everything else
  // (title, body, single CTA) follows the same shape.
  return html`<div class="research-empty">
    <span class="research-empty__disc" aria-hidden="true">${raw(renderMark(38))}</span>
    <h1 class="research-empty__title">Oops, there's nothing here yet</h1>
    <p class="research-empty__body">
      Create a content research to pair a Playbook with the sources I should watch — then I'll start surfacing briefs
      for you.
    </p>
    <button type="button" class="ap-button primary blue" data-research-create>
      <span>Create a content research</span>
    </button>
  </div>`;
}

function renderBody(lanes) {
  const shown = lanes.filter(matchesFilters);
  return html`<div class="research-view__body">
    <div class="research-view__inner">
      ${raw(renderHeaderRow())}
      <div class="research-grid">${raw(shown.map(renderLaneCard).join(""))}${raw(renderCreateCard())}</div>
      ${raw(!shown.length ? html`<p class="research-view__nomatch muted">No research matches that search.</p>` : "")}
    </div>
  </div>`;
}

function renderHeaderRow() {
  const contexts = getContexts();
  const active = view.playbook;
  return html`<div class="research-view__header">
    <h1 class="research-view__title">Content Research</h1>
    <div class="research-view__actions">
      <div class="ap-input research-view__search">
        <i class="ap-icon-search" aria-hidden="true"></i>
        <input type="search" placeholder="Search research…" value="${escapeAttr(view.query)}" data-research-search />
      </div>
      <select class="ap-select research-view__filter" data-research-playbook aria-label="Filter by Playbook">
        <option value="all" ${raw(active === "all" ? " selected" : "")}>All Playbooks</option>
        ${raw(
          contexts
            .map(
              (c) =>
                html`<option value="${escapeAttr(c.id)}" ${raw(active === c.id ? " selected" : "")}>${c.name}</option>`,
            )
            .join(""),
        )}
      </select>
      <button type="button" class="ap-button primary blue" data-research-create>
        <span>Create a research</span>
      </button>
    </div>
  </div>`;
}

function renderLaneCard(lane) {
  const ctx = getContextById(lane.playbookId);
  const playbookName = ctx?.name || "No Playbook";
  const n = lane.sources.length;
  const meta = `${playbookName} playbook · ${n} ${n === 1 ? "source" : "sources"}`;
  // Untriaged briefs waiting in this lane. Drives the NEW badge, which replaces
  // the Playbook accent bar: the bar encoded which Playbook a lane belonged to,
  // but the meta line already says that in words, so the colour was decoration.
  // What the card couldn't say before is whether there's anything to look at.
  const newCount = countNewForLane(lane.id);
  // Gated on the lane's own Show-trending switch, not just the count. With it off
  // there is no banner and no trending page for this lane (that route bounces
  // back to the feed), so advertising a number here would point at nothing.
  const trendingCount = lane.showTrending ? countTrendingForLane(lane.id) : 0;

  // The card body is a button and the hover actions are its SIBLINGS, not
  // children: a button inside a button is invalid HTML and the browser resolves
  // the nesting unpredictably. Same reason topic-card splits body from footer.
  // Both signals live on their OWN row, directly under the title and above the
  // meta line. Their own row rather than beside the title because there they cost
  // it ~140px between them and it ellipsised to "Lost dog reco…" — the lane's
  // name is the one thing that has to stay readable. Under the title they attach
  // to the thing they describe, and are read before the more static metadata
  // (which Playbook, how many sources) rather than after it.
  const signals =
    newCount || trendingCount
      ? html`<div class="research-card__signals">
          <!-- The DS Badge, not a hand-rolled pill: Badge is the system-generated
               marker (uppercase, orange, nowrap out of the box), and "I found new
               research" is exactly that — Archie's own signal, not a user state.
               It carries the count as well as the word, so one component answers
               both "is there anything new" and "how much". -->
          ${raw(
            newCount
              ? html`<span
                  class="ap-badge orange"
                  aria-label="${newCount} new ${newCount === 1 ? "brief" : "briefs"} to review"
                  >${newCount} new</span
                >`
              : "",
          )}
          <!-- Trending is TEXT beside that badge, never a second pill. Two filled
               pills side by side would read as two of the same kind of thing, and
               these are different kinds: NEW counts what you haven't triaged,
               trending counts what's spiking regardless of triage. Same treatment
               the brief cards use — see styles/components/trending-mark.css. -->
          ${raw(
            trendingCount
              ? html`<span
                  class="trending-mark"
                  aria-label="${trendingCount} ${trendingCount === 1 ? "topic" : "topics"} trending"
                >
                  <i class="ap-icon-arrow-up" aria-hidden="true"></i>
                  <span>${trendingCount} trending</span>
                </span>`
              : "",
          )}
        </div>`
      : "";

  return html`<article class="research-card" data-lane-id="${escapeAttr(lane.id)}">
    <div class="research-card__head">
      <button type="button" class="research-card__title" data-lane-open="${escapeAttr(lane.id)}">${lane.name}</button>
      <!-- Revealed by a PARENT-hover CSS rule (.research-card:hover &), not by a
           JS handler: an inline hover on the card can't reach a child. It is
           absolutely positioned and fades in via opacity — NOT visibility, which
           would make these buttons unfocusable and put them out of reach of the
           keyboard. See research.css. -->
      <span class="research-card__hover">
        <button
          type="button"
          class="ap-icon-button ghost grey"
          data-lane-edit="${escapeAttr(lane.id)}"
          title="Feed settings"
          aria-label="Feed settings"
        >
          <i class="ap-icon-pen" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button ghost grey"
          data-lane-duplicate="${escapeAttr(lane.id)}"
          title="Duplicate"
          aria-label="Duplicate"
        >
          <i class="ap-icon-copy" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button ghost grey research-card__delete"
          data-lane-delete="${escapeAttr(lane.id)}"
          title="Delete"
          aria-label="Delete"
        >
          <i class="ap-icon-trash" aria-hidden="true"></i>
        </button>
      </span>
    </div>
    ${raw(signals)}
    <p class="research-card__meta">${meta}</p>
    <!-- The action carries margin-top:auto itself, so it stays pinned to the
         bottom whatever the block above it holds. It no longer needs a wrapper:
         that only existed to own the pinning while the conditional signals row
         shared the footer with it. -->
    <button type="button" class="research-card__open" data-lane-open="${escapeAttr(lane.id)}">
      <span>Open research</span>
      <i class="ap-icon-arrow-right" aria-hidden="true"></i>
    </button>
  </article>`;
}

function renderCreateCard() {
  return html`<button type="button" class="research-create-card" data-research-create>
    <span class="research-create-card__disc">${raw(renderMark(24))}</span>
    <span class="research-create-card__label">Create a research</span>
  </button>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    const create = event.target.closest("[data-research-create]");
    if (create) {
      navigate("/research/new");
      return;
    }

    // The three hover actions are checked BEFORE the open handlers and each
    // stops propagation, so clicking one never also navigates into the lane.
    const edit = event.target.closest("[data-lane-edit]");
    if (edit) {
      event.stopPropagation();
      navigate(`/research/${encodeURIComponent(edit.dataset.laneEdit)}/settings`);
      return;
    }

    const dup = event.target.closest("[data-lane-duplicate]");
    if (dup) {
      event.stopPropagation();
      const copy = duplicateLane(dup.dataset.laneDuplicate);
      if (copy) showToast(`Duplicated as "${copy.name}"`);
      return;
    }

    const del = event.target.closest("[data-lane-delete]");
    if (del) {
      event.stopPropagation();
      const lane = getLanes().find((l) => l.id === del.dataset.laneDelete);
      if (deleteLane(del.dataset.laneDelete) && lane) showToast(`Deleted "${lane.name}"`);
      return;
    }

    const open = event.target.closest("[data-lane-open]");
    if (open) {
      // ?fresh=1 is what tells the feed to run the generating loader. Selecting
      // a lane and saving a new one both count as arriving from elsewhere;
      // coming back from the trending page or settings does not, and those
      // carry no param.
      navigate(`/research/${encodeURIComponent(open.dataset.laneOpen)}?fresh=1`);
      return;
    }
  };
  target.addEventListener("click", boundClick);

  // One input listener covers the search field and the Playbook select — both
  // only mutate view state and repaint, so they don't need separate handlers.
  boundInput = (event) => {
    const search = event.target.closest("[data-research-search]");
    if (search) {
      view.query = search.value;
      paint(target);
      // Repainting replaces the input, so focus and the caret have to be put
      // back or typing a second character loses the field.
      const next = target.querySelector("[data-research-search]");
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
      return;
    }
    const pb = event.target.closest("[data-research-playbook]");
    if (pb) {
      view.playbook = pb.value;
      paint(target);
      return;
    }
  };
  target.addEventListener("input", boundInput);
  // <select> fires change, not input, in some browsers — listen for both so the
  // facet can't get stuck.
  target.addEventListener("change", boundInput);
}
