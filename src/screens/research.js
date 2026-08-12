// Content Research — the lane list, route /content-ideas.
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
import { renderTopbar } from "../components/topbar.js?v=374";
import { showToast } from "../components/toast.js?v=21";
import { isFlagOn } from "../feature-flags.js?v=19";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=70";
import { getLanes, duplicateLane, deleteLane, subscribe as subscribeLanes } from "../research-store.js?v=35";
import { countNewForLane, countTrendingForLane, subscribe as subscribeBriefs } from "../briefs-store.js?v=42";

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
  // Only `input` now — the `change` pairing existed for the native <select> the
  // Playbook facet used to be, and that listener is no longer attached.
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
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
  return renderBody(lanes);
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
      Create a topic list to pair a Playbook with the sources I should watch — then I'll start surfacing topics for you.
    </p>
    <button type="button" class="ap-button primary blue" data-research-create>
      <span>Create a topic list</span>
    </button>
  </div>`;
}

// Mirrors screens/contexts.js exactly — `__page` > `__head` > `__head-text`
// (title + sub) beside `__head-actions`. Same structure, own namespace: the
// contexts-view__* classes stay scoped to /contexts rather than being borrowed
// across screens, so changing one page's header can't silently restyle another.
//
// There is no in-page bordered top bar. /contexts has none either, and the one
// this screen used to carry only existed because topbar.js had no /content-ideas
// entry and fell through to "Archie" — so the page was captioning itself. The
// topbar names the section now.
function renderBody(lanes) {
  const shown = lanes.filter(matchesFilters);
  return html`<div class="research-view__page">
    ${raw(renderHead(lanes))}
    <div class="research-grid">${raw(shown.map(renderLaneCard).join(""))}${raw(renderCreateCard())}</div>
    ${raw(!shown.length ? html`<p class="research-view__nomatch muted">No topic list matches that search.</p>` : "")}
  </div>`;
}

function renderHead(lanes) {
  const contexts = getContexts();
  const active = view.playbook;
  // Mirrors "N Playbooks · applied across N chats" on /contexts: what you have,
  // then the number that tells you whether to act. Untriaged briefs summed
  // across every lane is that number here.
  const waiting = lanes.reduce((sum, l) => sum + countNewForLane(l.id), 0);
  const sub =
    `${lanes.length} ${lanes.length === 1 ? "topic list" : "topic lists"} · ` +
    `${waiting} ${waiting === 1 ? "topic" : "topics"} waiting`;

  return html`<header class="research-view__head">
    <div class="research-view__head-text">
      <h1 class="research-view__title">Content Ideas</h1>
      <p class="research-view__sub">${sub}</p>
    </div>
    <div class="research-view__head-actions">
      <div class="ap-input-group research-view__search">
        <i class="ap-icon-search"></i>
        <input
          type="search"
          class="ap-input"
          placeholder="Search topics…"
          value="${escapeAttr(view.query)}"
          data-research-search
        />
      </div>
      ${raw(renderPlaybookFilter(contexts, active))}
      <button type="button" class="ap-button primary blue" data-research-create>
        <span>Create a topic list</span>
      </button>
    </div>
  </header>`;
}

// The Playbook facet, as the DS select — `<details class="ap-select">` with a
// summary trigger and a dropdown of `.ap-select-option` rows.
//
// It was a native `<select class="ap-select">`, which was wrong twice over:
// .ap-select is not a class for a native select at all (it styles a
// details/summary widget — .ap-select-trigger, .ap-select-arrow,
// .ap-select-dropdown), and the DS styles no bare <select> anywhere. My own
// padding/border/radius rules were masking that, so when the head CSS was
// rewritten to mirror /contexts the control collapsed to a 21px native box
// beside its 36px neighbours. screens/topics-settings.js states the rule
// outright: "DS .ap-select over <details> — never a bare native <select>."
function renderPlaybookFilter(contexts, active) {
  const activeName =
    active === "all" ? "All Playbooks" : contexts.find((c) => c.id === active)?.name || "All Playbooks";

  const option = (id, label) => {
    const on = active === id;
    return html`<div
      class="ap-select-option${raw(on ? " selected" : "")}"
      data-research-playbook="${escapeAttr(id)}"
      role="option"
      aria-selected="${on ? "true" : "false"}"
    >
      <span class="ap-select-option-text">${label}</span>
      ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
    </div>`;
  };

  return html`<details class="ap-select research-view__filter">
    <summary class="ap-select-trigger">
      <span class="ap-select-value">${activeName}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Filter by Playbook">
      <div class="ap-select-options">
        ${raw(option("all", "All Playbooks"))}${raw(contexts.map((c) => option(c.id, c.name)).join(""))}
      </div>
    </div>
  </details>`;
}

function renderLaneCard(lane) {
  const ctx = getContextById(lane.playbookId);
  const playbookName = ctx?.name || "No Playbook";
  const n = lane.sources.length;
  // The Playbook gets the icon the rest of the app already uses for one —
  // ap-icon-target, from the sidebar's Playbooks nav row and from this feature's
  // own detail header (.research-feed__meta-item). Not a new glyph: a Playbook
  // looks the same wherever it is named.
  //
  // It earns its place here more than it does on the detail page, because these
  // Playbooks are named with middots of their own — "Pawtrack · always-on" — so
  // the line is three separators long with nothing marking where the name starts.
  // The icon marks it, which is also why the word "playbook" could come out.
  const sourceCount = `${n} ${n === 1 ? "source" : "sources"}`;
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
  // Both signals live on their OWN row, under the meta line. Their own row rather
  // than beside the title because there they cost it ~140px between them and it
  // ellipsised to "Lost dog reco…" — the lane's name is the one thing that has to
  // stay readable. Under the meta they close out the card's description of itself:
  // what this lane is, then what's currently in it.
  //
  // Three positions were tried before settling here — beside the title, in a
  // footer above the separator, and directly under the title. Don't move it again
  // without a reason; the row is conditional and each position needs its own
  // spacing and pinning rules.
  const signals =
    newCount || trendingCount
      ? html`<div class="research-card__signals">
          <!-- Trending first, the NEW badge second. Trending is TEXT and never a
               second pill: two filled pills side by side would read as two of the
               same kind of thing, and these are different kinds — NEW counts what
               you haven't triaged, trending counts what's spiking regardless of
               triage. Same treatment the brief cards use, see
               styles/components/trending-mark.css. -->
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
          <!-- The DS Badge, not a hand-rolled pill: Badge is the system-generated
               marker (uppercase, orange, nowrap out of the box), and "I found new
               research" is exactly that — Archie's own signal, not a user state.
               It carries the count as well as the word, so one component answers
               both "is there anything new" and "how much". -->
          ${raw(
            newCount
              ? html`<span
                  class="ap-badge orange"
                  aria-label="${newCount} new ${newCount === 1 ? "topic" : "topics"} to review"
                  >${newCount} new</span
                >`
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
    <p class="research-card__meta">
      <span class="research-card__meta-pb">
        <i class="ap-icon-target" aria-hidden="true"></i>
        <!-- The word "playbook" is gone from the visible line — the icon says it,
             and repeating it made a line that is already three middots long
             longer still. It stays for screen readers, because the icon is
             aria-hidden and a name on its own doesn't say what kind of thing it
             is: "Playbook Pawtrack · always-on". The detail header has the same
             icon-only treatment and no such label — worth fixing there too. -->
        <span class="sr-only">Playbook</span>${playbookName}
      </span>
      <span class="research-card__meta-sep" aria-hidden="true">·</span>
      <span>${sourceCount}</span>
    </p>
    ${raw(signals)}
    <!-- The action carries margin-top:auto itself, so it stays pinned to the
         bottom whatever the block above it holds. It no longer needs a wrapper:
         that only existed to own the pinning while the conditional signals row
         shared the footer with it. -->
    <button type="button" class="research-card__open" data-lane-open="${escapeAttr(lane.id)}">
      <span>See topics</span>
      <i class="ap-icon-arrow-right" aria-hidden="true"></i>
    </button>
  </article>`;
}

function renderCreateCard() {
  return html`<button type="button" class="research-create-card" data-research-create>
    <span class="research-create-card__disc">${raw(renderMark(24))}</span>
    <span class="research-create-card__label">Create a topic list</span>
  </button>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    const create = event.target.closest("[data-research-create]");
    if (create) {
      navigate("/content-ideas/new");
      return;
    }

    // The three hover actions are checked BEFORE the open handlers and each
    // stops propagation, so clicking one never also navigates into the lane.
    const edit = event.target.closest("[data-lane-edit]");
    if (edit) {
      event.stopPropagation();
      navigate(`/content-ideas/${encodeURIComponent(edit.dataset.laneEdit)}/settings`);
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

    // The Playbook facet is a details/summary dropdown now, so picking an option
    // is a CLICK, not a select's change event. Repainting is what closes the
    // <details> — which is the behaviour you want after choosing.
    const pb = event.target.closest("[data-research-playbook]");
    if (pb) {
      view.playbook = pb.dataset.researchPlaybook;
      paint(target);
      return;
    }

    const open = event.target.closest("[data-lane-open]");
    if (open) {
      // ?fresh=1 is what tells the feed to run the generating loader. Selecting
      // a lane and saving a new one both count as arriving from elsewhere;
      // coming back from the trending page or settings does not, and those
      // carry no param.
      navigate(`/content-ideas/${encodeURIComponent(open.dataset.laneOpen)}?fresh=1`);
      return;
    }
  };
  target.addEventListener("click", boundClick);

  // Only the search field needs an input listener now — the Playbook facet moved
  // to the click handler above with the switch to the DS select.
  boundInput = (event) => {
    const search = event.target.closest("[data-research-search]");
    if (!search) return;
    view.query = search.value;
    paint(target);
    // Repainting replaces the input, so focus and the caret have to be put back
    // or typing a second character loses the field.
    const next = target.querySelector("[data-research-search]");
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  };
  target.addEventListener("input", boundInput);
}
