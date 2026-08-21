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
import { renderTopbar } from "../components/topbar.js?v=489";
import { showToast } from "../components/toast.js?v=21";
import { isFlagOn } from "../feature-flags.js?v=23";
import { subscribe as subscribeContexts } from "../contexts-store.js?v=83";
import { getActivePlaybook, getActivePlaybookId, subscribe as subscribeScope } from "../active-playbook.js?v=84";
import { open as openConfirm } from "../components/confirm-modal.js?v=22";
import { open as openPillarModal } from "../components/pillar-modal.js?v=76";
import {
  getPillars,
  getPillarById,
  deletePillar,
  duplicatePillar,
  updatePillar,
  unseenCountFor,
  subscribe as subscribePillars,
} from "../pillars-store.js?v=16";

// No view state left. The Playbook facet is gone — the rail's scope switcher IS
// the filter now, and a second one on this page would be a way for the two to
// disagree.
let view = {};

// ── The generating card ────────────────────────────────────────────────────
// A pillar Archie opened arrives as a LOADER first, then as a card. Same device,
// same 3 seconds and the same DS spinner as the new-session starter-topic panel
// (session.js, STARTER_TOPIC_COUNTDOWN) — and for the same reason: it is purely
// theatrical, nothing is being fetched, but it is the one moment the prototype can
// show that a pillar is WRITTEN rather than simply present. A card that is already
// there when the page paints cannot say that.
//
// Which cards: exactly the ones that carry the "Automatically created" tag
// (createdBy archie, not yet reviewed). A pillar you typed yourself is not being
// generated and must not pretend to be.
//
// Once per page load. `played` decides whether to POPULATE the set; the set decides
// what renders; the timer empties it. They are three things rather than one because
// leaving the screen mid-countdown clears the timer, and on coming back the ids
// would otherwise stay pending forever with nothing left to resolve them — so the
// mount restarts the timer whenever the set is non-empty.
const GENERATING_MS = 3000;
let generatingPlayed = false;
let generatingIds = new Set();
let generatingTimer = null;

let unsubscribePillars = null;
let unsubscribeContexts = null;
let unsubscribeScope = null;
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
  if (!generatingPlayed) {
    generatingPlayed = true;
    // Every auto-created pillar in the ACCOUNT, not just the ones in scope. Scoping
    // the set here made the loader depend on the rail's switcher having already
    // resolved at first mount, and when it had not the set came out empty and the
    // cards simply appeared. What renders is decided per card in renderCard(), which
    // only ever sees pillars in scope anyway — so the filter belongs there, not here.
    generatingIds = new Set(
      getPillars()
        .filter(isAutoCreated)
        .map((p) => p.id),
    );
  }
  if (generatingIds.size) startGeneratingTimer(target);
  paint(target);
  bind(target);
  unsubscribePillars = subscribePillars(() => paint(target));
  // Playbook names are read on every card, so a rename elsewhere repaints.
  unsubscribeContexts = subscribeContexts(() => paint(target));
  unsubscribeScope = subscribeScope(() => paint(target));
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
  if (unsubscribeScope) {
    unsubscribeScope();
    unsubscribeScope = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
  // The pending ids deliberately SURVIVE this: leaving mid-countdown and coming
  // back should finish the reveal, not skip it and not restart it from zero. The
  // mount restarts the timer when the set is still populated.
  if (generatingTimer) {
    clearTimeout(generatingTimer);
    generatingTimer = null;
  }
}

// One delay, not a per-second tick — same call the starter-topic panel makes, and
// for the same reason: a spinner says "working" without promising a number, which
// is the honest signal when nothing is really being computed.
function startGeneratingTimer(target) {
  if (generatingTimer) clearTimeout(generatingTimer);
  generatingTimer = window.setTimeout(() => {
    generatingTimer = null;
    generatingIds = new Set();
    // The screen may have been torn down and re-rendered by another route in the
    // meantime; painting into a detached target would be a silent no-op, so check.
    if (target && target.isConnected) paint(target);
  }, GENERATING_MS);
}

const isAutoCreated = (p) => p.createdBy === "archie" && !p.reviewed;

function paint(target) {
  target.innerHTML = html`<section class="screen strategy-view">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

function visiblePillars() {
  const scopeId = getActivePlaybookId();
  return scopeId ? getPillars().filter((p) => p.playbookId === scopeId) : getPillars();
}

function renderPage() {
  const pillars = visiblePillars();
  const total = pillars.length;
  return `
    ${renderHead(total)}
    ${total === 0 ? renderEmpty() : `<div class="strategy-grid">${pillars.map(renderCard).join("")}${renderNewTile()}</div>`}
  `;
}

function renderHead(total) {
  const arrived = visiblePillars().reduce((n, p) => n + unseenCountFor(p.id), 0);
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
        <button type="button" class="ap-button primary blue" data-strategy-new>
          <i class="ap-icon-plus"></i><span>New pillar</span>
        </button>
      </div>
    </header>`;
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

// `.pillar-card`, not `.research-card strategy-card`.
//
// The card was built ON the Topic-feeds lane card because the two are the same kind
// of object — "a standing thing that collects, with a count of what arrived and a
// way in" — and a bespoke copy had drifted from it within a week. That reuse still
// holds; what stopped holding is the NAME. research.js is parked and unreachable, so
// this is the only live card of the pair, and naming it after a retired feature made
// every reader here start by learning about lanes.
//
// So the BLOCK class is this feature's own and the parts are still shared:
// `.research-card, .pillar-card` carry one set of block rules in research.css, and
// `research-card__head / __title / __hover / __signals / __open` are untouched. A
// parallel pillar-card__* set would be a rename with no reader — the two cards
// would still have to look identical, with two places to keep that true.
//
// What IS this card's own, and lives in content-strategy.css: __about, __auto,
// and the --new ghost tile.
function renderCard(p) {
  if (generatingIds.has(p.id)) return renderGeneratingCard();
  const arrived = unseenCountFor(p.id);
  const auto = isAutoCreated(p);
  return `
    <article class="pillar-card" data-pillar-card="${escapeAttr(p.id)}">
      <div class="research-card__head">
        <button type="button" class="research-card__title" data-pillar-open="${escapeAttr(p.id)}">
          ${escapeAttr(p.name)}
        </button>
        <!-- Edit + Duplicate + Delete as a hover panel — the same three, in the
             same order, with the same glyphs as a Playbook card on /contexts.
             Merge is still out; when it returns it needs a target picker, so it
             will not fit in an icon panel and the kebab menu comes back with it.

             The pen NAVIGATES to the pillar, it does not open a dialog. A pillar is
             edited on its own page, beside the context, the assets and the trail it
             is about; a modal could only ever offer a name and a sentence, which is
             the smallest and least useful part of it. -->
        <span class="research-card__hover">
          <button type="button" class="ap-icon-button ghost grey" data-pillar-open="${escapeAttr(p.id)}"
            title="Edit pillar" aria-label="Edit ${escapeAttr(p.name)}">
            <i class="ap-icon-pen" aria-hidden="true"></i>
          </button>
          <button type="button" class="ap-icon-button ghost grey" data-pillar-duplicate="${escapeAttr(p.id)}"
            title="Duplicate" aria-label="Duplicate ${escapeAttr(p.name)}">
            <i class="ap-icon-copy" aria-hidden="true"></i>
          </button>
          <button type="button" class="ap-icon-button ghost grey research-card__delete"
            data-pillar-delete="${escapeAttr(p.id)}" title="Delete" aria-label="Delete ${escapeAttr(p.name)}">
            <i class="ap-icon-trash" aria-hidden="true"></i>
          </button>
        </span>
      </div>
      <!-- No .research-card__meta, and no count of any kind on this card. The meta
           line named the Playbook, which is now the scope and therefore identical on
           every card here; the source count then lived in the signals row and has
           gone too. Neither told you anything you could act on: a pillar with six
           sources is not better than one with three, it is older. What a card has to
           answer is "did anything happen", and one word does that. -->
      <p class="pillar-card__about">${escapeAttr(p.about || p.context || "")}</p>
      <!-- Both markers sit in the SIGNALS ROW, the tag first. It lived on its own
           line under the title for a while, on the argument that it qualifies the
           whole pillar while the row counted what had arrived in it — so a tag in
           that row read as a third count beside a badge it has nothing to do with.
           Two things changed that. The row no longer counts anything (the badge is
           the word "Updated" and the source count is gone), so there is no count to
           be mistaken for; and on its own line the tag added a row of height to the
           card, which ate the free space the footer's margin-top:auto needs — the
           separator ended up flush against the row above it on exactly the cards
           that carried a tag. In the row, the card stops growing and the gap comes
           back. -->
      <div class="research-card__signals">
        ${
          auto
            ? // FIRST when both show, because it qualifies the pillar itself while
              // the badge reports an event inside it: "this one is unvetted, and it
              // changed" reads in that order and not the other way round.
              //
              // A CLICKABLE tag, which the DS allows (.ap-tag:is(button)):
              // acknowledging the label is the one thing it should be able to do.
              // Opening the pillar clears it too — both are the single click it
              // waits for.
              `<button type="button" class="ap-tag blue pillar-card__auto" data-pillar-ack="${escapeAttr(p.id)}"
                 title="Dismiss this label"><span>Automatically created</span></button>`
            : ""
        }
        ${
          p.frozen
            ? // FROZEN wins the badge's slot outright — the two cannot both be
              // true and honest. "Updated" reports that the weekly run touched
              // this pillar; a frozen pillar is one the run is being held off,
              // so a card carrying both would be telling you it changed and that
              // it cannot. A stale unseen mark from before the freeze is the only
              // way to reach that pair, and it is the freeze that is current.
              //
              // .ap-status, not the badge: status.md's own line is "for showing
              // item status", which is exactly what held-vs-running is, while a
              // badge marks an event that happened. tagOrange to match the pill
              // beside the section title on the pillar page — the same fact needs
              // to be the same object in both places, or the page you open from
              // this card looks like it is talking about something else.
              `<span class="ap-status tagOrange">Frozen</span>`
            : arrived
              ? // The DS Badge, orange: a system-generated marker for "something
                // landed here". It carries no NUMBER, for two reasons that point the
                // same way.
                //
                // Product: a pillar is rewritten by a weekly run, so the only thing a
                // card can honestly report is that the run touched it. "3 to review"
                // read as a queue of three things to work through — and nothing in
                // this feature is a queue (see the file header). Worse, the number
                // rewarded counting: two sources filed into a pillar is not twice the
                // news of one.
                //
                // DS: badge.md's own usage rule is "use .ap-counter for numeric
                // counts, not .ap-badge" — a count in a badge was the wrong component
                // for the content. As a text label it is now what the badge is for.
                //
                // The aria-label says a little more than the word, since a screen
                // reader hears it stripped of its position on the card.
                `<span class="ap-badge orange" aria-label="Updated since you last looked">Updated</span>`
              : ""
        }
      </div>
      <button type="button" class="research-card__open" data-pillar-open="${escapeAttr(p.id)}">
        <span>Review</span>
        <i class="ap-icon-arrow-right" aria-hidden="true"></i>
      </button>
    </article>`;
}

// The card, still being written. Built on `.pillar-card` itself rather than sized to
// match it, which is the lesson the starter-topic panel paid for twice: arithmetic
// that "adds up" to the real card lands a pixel or two out, and the grid jumps when
// the loader is replaced. Sharing the block means identical by construction.
//
// The name is deliberately withheld. Naming the pillar and then spinning would be a
// reveal followed by a wait; the point of the wait is that the pillar is arriving.
//
// .ap-loader, not a hand-rolled ring: initArchieLoader() sweeps the DOM for that
// class and swaps in the animated Archie mark, so this spinner matches every other
// spinner in the app for free — including ones injected after it, since it watches
// via MutationObserver. size-48 is the starter card's size.
//
// aria-busy + role=status: the swap is not user-initiated, so a screen reader needs
// to be told something is in flight and told again when the card lands.
function renderGeneratingCard() {
  return `
    <article class="pillar-card pillar-card--loading" aria-busy="true">
      <span class="pillar-card__loading-title" role="status">Writing a new pillar</span>
      <span class="pillar-card__loading-sub">Hold on tight</span>
      <span class="ap-loader-container pillar-card__loading-spinner" aria-hidden="true">
        <span class="ap-loader orange size-48"></span>
      </span>
    </article>`;
}

function renderNewTile() {
  return `
    <button type="button" class="pillar-card--new" data-strategy-new aria-label="Create a Content pillar">
      <span class="pillar-card--new__glyph"><i class="ap-icon-archie-official"></i></span>
      <span class="pillar-card--new__title">Create a Content pillar</span>
      <span class="pillar-card--new__sub">
        Create a context hub to draft rich posts from topics, chats and your own assets.
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
      openPillarModal();
      return;
    }
    const ack = event.target.closest("[data-pillar-ack]");
    if (ack) {
      updatePillar(ack.getAttribute("data-pillar-ack"), { reviewed: true });
      return;
    }
    // Checked BEFORE [data-pillar-open], like every other hover action: the card's
    // title and footer both open the pillar, so an action that fell through would
    // duplicate and then navigate away from the result.
    const dup = event.target.closest("[data-pillar-duplicate]");
    if (dup) {
      const copy = duplicatePillar(dup.getAttribute("data-pillar-duplicate"));
      // No navigation into the copy, unlike a duplicated Playbook. A Playbook's
      // detail page is complete the moment it is copied; a pillar's is mostly its
      // trail, and a fresh copy's trail is empty by design — so landing there shows
      // the one view that looks broken. The new card appearing at the top of this
      // grid is the better answer, and the toast names it.
      if (copy) showToast(`Duplicated as “${copy.name}”`);
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
