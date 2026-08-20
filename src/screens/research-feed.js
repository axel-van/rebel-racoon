// Content Research — one Topic feed, route /topic-feeds/:id.
//
// VOCABULARY: the UI says Topic feed (a lane) and Topic (a brief/"topic"). The
// code below keeps lane/brief/topic throughout — see CLAUDE.md's vocabulary note.
// Comments in this file predate the rename and still say "topic" for a Topic.
//
// The generating loader runs on ARRIVAL FROM ELSEWHERE only, keyed on ?fresh=1,
// which both the lane list's open action and the form's save append. Returning
// from the trending page or from settings carries no param and so paints
// straight away — re-running a 1.6s spinner on a back button is punishment, not
// feedback.
//
// Filtering is ONE control: the Filters panel, three groups — Topic type, Topic
// status, Sources — in that order. Its badge counts NARROWED GROUPS, not ticked
// options (see briefs-store.narrowedGroupCount).
//
// Topic type was briefly an always-visible chip row under the header, on the
// argument that the axis which changes a card's action should never be hidden.
// It went back in the panel because the row cost about 48px — a whole card line
// above the fold — to keep two checkboxes on screen, and the card's own tag
// already says which type it is. Defaults: both types, all sources, and New +
// Saved of the four statuses — Used and Ignored are answers the reader has already
// given, so the feed does not open on finished work (research-catalog has the why).
//
// The two ATTENTION SIGNALS — trending and updated — are NOT overrides in this
// feed: a brief carrying either appears under its own review status and
// disappears when that status is unticked. /attention is where they ignore
// triage. Keeping that split is the whole reason they are a notice here rather
// than a section.
//
// The notice counts every flagged topic in the lane and breaks that down by
// signal. It deliberately does NOT track what the filter hides or what you have
// already looked at — both were tried and removed. Nothing overrides the filter
// either; the feed's list stays exactly what the filter says it is.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { parseHashParams } from "../url-state.js?v=21";
// The picker footer's "Create a Playbook" hands the context-builder its return route,
// exactly as /contexts and the composer do.
import { setHandoff } from "../handoff.js?v=20";
import { renderTopbar, setTopbarActions, clearTopbarActions } from "../components/topbar.js?v=472";
import { isFlagOn } from "../feature-flags.js?v=23";
import { renderBriefCard, renderUseButtons } from "../components/brief-card.js?v=73";
import {
  openIgnoreReason,
  // PARKED with its handler and its link — kept imported so restoring is one uncomment.
  openVersionHistory,
  openSourcePosts,
  // PARKED with the handler below — kept imported so restoring is one uncomment.
  openAddToStrategy,
  renderResearchArticle,
  // researchArticleSub went with the pane's subtitle — the card's source row says
  // the same thing. Still exported and still used by the Full-research dialog.
} from "../components/research-modals.js?v=159";
import { openBriefInChat } from "../brief-flow.js?v=41";
import { showToast } from "../components/toast.js?v=21";
import { unlinkBrief, pillarForBrief, subscribe as subscribePillars } from "../pillars-store.js?v=14";
import {
  getActivePlaybook,
  getActivePlaybookId,
  setActivePlaybook,
  subscribe as subscribeScope,
} from "../active-playbook.js?v=65";
import { open as openPillarPicker } from "../components/pillar-picker-modal.js?v=51";
import { getLaneById, getLanes, toggleLanePause } from "../research-store.js?v=52";
import {
  getBriefById,
  briefTitle,
  getBriefsForLane,
  groupBriefsByAge,
  attentionCountsForLane,
  defaultFilters,
  narrowedGroupCount,
  setStatus,
  unignoreBrief,
  subscribe as subscribeBriefs,
} from "../briefs-store.js?v=67";
import {
  RESEARCH_SOURCES,
  REVIEW_STATUSES,
  LIVE_SOURCE_IDS,
  findResearchSource,
  findCadence,
} from "../research-catalog.js?v=22";
import { getContextById, getContexts } from "../contexts-store.js?v=81";

// How long the mock generation appears to run. The handoff's ~1.6s: long enough
// to register that I'm doing work, short enough that nobody waits for it.
// ── One list, grouped by age ────────────────────────────────────────────────
// This was two columns — "Content strategy" left, "Ready to post" right — and the
// split has moved onto the card as a tag. The reasoning is in
// SPEC-OPTION-B.md, but the short version is that the columns asserted a
// FALLIBLE AI classification as a fact of the layout: a column header cannot
// offer you a way to disagree with it, and the card's dropdown can.
//
// Three smaller things went with them, all of which the single list fixes for
// free: the age separators no longer render twice (once per column) and the two
// scroll positions no longer drift apart; the layout no longer changes meaning
// below 1200px, where the columns stacked into two headings; and the grouping
// axis is now free, which is what the lifecycle work needs — see
// needs-assets-vs-ready-to-post.html, Option E.
//
// The cards keep their own max-width, so the reading measure is unchanged. What
// is lost is density: a single capped column leaves the right of a wide window
// empty, which is exactly the space the columns existed to use. That is the
// accepted cost, not an oversight.
// ─── Infinite load ─────────────────────────────────────────────────────────
// A page is 10 topics. The next 10 arrive when the sentinel below the list comes
// into view, after a deliberate 2s — long enough that the spinner is legible in a
// demo, short enough not to feel broken.
//
// Paging is applied to the FLAT filtered list before grouping, not per age group.
// The list is already sorted newest-first, so slicing the flat list and grouping
// the slice keeps every group complete-as-far-as-it-goes: a page boundary can land
// inside "Earlier", and the heading simply gains cards on the next load rather than
// a fourth group appearing out of order.
const PAGE_SIZE = 10;
const LOAD_MS = 2000;

function renderList(briefs, view) {
  const cards = (rows) =>
    rows
      .map((b) =>
        renderBriefCard(b, {
          source: findResearchSource(b.sourceId),
          variant: "feed",
          menuOpen: view.openMenu === b.id,
          articleOpen: view.articleId === b.id,
        }),
      )
      .join("");

  const shown = briefs.slice(0, view.shown);
  const remaining = briefs.length - shown.length;

  return html`<div class="research-feed__list">
    ${raw(
      groupBriefsByAge(shown)
        .map(
          // A heading per non-empty age frame, EXCEPT the newest one. "Last 7 days"
          // was a label on the default: the list is newest-first, so the first group
          // is where anyone expects to land, and naming it spent a line of
          // above-the-fold height telling the reader what they had already assumed.
          // The later frames keep their labels, because those ARE a departure —
          // "Earlier this month" tells you the recent topics have run out.
          //
          // Gated on the group's id rather than its index, so a lane whose newest
          // topics are all older than a week still labels whatever it opens with.
          // isFirstFrame is what the pane's alignment reads; see renderPage.
          ({ group, briefs: rows }) =>
            html`<section class="topics-agegroup">
              ${raw(group.id === "week" ? "" : html`<h3 class="topics-agegroup__label">${group.label}</h3>`)}
              ${raw(cards(rows))}
            </section>`,
        )
        .join(""),
    )}
    ${raw(remaining > 0 ? renderLoadMore(remaining, view.loadingMore) : "")}
  </div>`;
}

// Does the list open with a labelled frame? The pane's top margin exists only to
// clear the first label so its first line of text lands on the first card's source
// row — with no label there is nothing to clear, and the 32px would be a hole.
//
// Derived from the same grouping the list renders, so the two cannot disagree.
function listOpensWithLabel(briefs, shown) {
  const groups = groupBriefsByAge(briefs.slice(0, shown));
  return !!groups.length && groups[0].group.id !== "week";
}

// The sentinel AND the loading row, one element. It has to render whether or not a
// load is running: an IntersectionObserver needs something in the DOM to watch, so
// an element that only appeared once loading started could never start a load.
//
// Idle state is a REAL BUTTON, not just a "scroll to load" caption. Scrolling is
// the primary trigger and the observer handles it, but an infinite list whose only
// trigger is scroll position cannot be paged from the keyboard and gives a
// screen-reader user nothing to activate. The button is the same gesture made
// explicit — it is also what makes the load demoable on command rather than only
// by scrolling. .ap-button stroked grey: secondary weight, because paging a list is
// not the thing you came to this screen to do.
//
// Loading state swaps it for .ap-loader — empty, because archie-loader.js sweeps
// for the class and supplies the animated Archie mark, so this matches
// renderGenerating above and every other spinner in the app. size-24 rather than
// that page's 60: a row at the foot of a list, not a whole-screen state.
//
// role="status" on the caption, so the swap is announced rather than silent.
function renderLoadMore(remaining, loading) {
  const label = `Load ${remaining === 1 ? "1 more Topic" : `${remaining > PAGE_SIZE ? PAGE_SIZE : remaining} more Topics`}`;
  return html`<div class="research-feed__more" data-research-more>
    ${raw(
      loading
        ? `<span class="ap-loader orange size-24" aria-hidden="true"></span>
           <p class="research-feed__more-caption" role="status">Loading more Topics…</p>`
        : html`<button type="button" class="ap-button stroked grey" data-research-more-load>
            <span>${label}</span>
          </button>`,
    )}
  </div>`;
}

// The article, in the page, to the right of the list.
//
// Sticky rather than fixed: it is a flex item that has to stay put while the list
// scrolls past it, and sticky does that without taking the pane out of flow and
// without hardcoding a left offset that the sidebar's collapse would falsify.
// `align-self: flex-start` in the CSS is what makes sticky possible at all — a
// stretched flex item is already as tall as the row and has nothing to stick
// within.
//
// It carries its own close control. The card that opened it also closes it, but
// that card can be scrolled off-screen, so the pane needs an exit that is always
// where the reader is looking.
function renderArticlePane(brief, entering = false) {
  return html`<aside class="research-feed__article${raw(entering ? " is-entering" : "")}" aria-label="Topic">
    <header class="research-feed__article-head">
      <!-- One title, and it is the ARTICLE's — brief.research.title, promoted out of
           the body and into the header.

           Three things left this block. The "Full article" kicker, because the pane
           has a title and a close button and sits beside the card it belongs to;
           naming itself as well was the fourth label in a 60px band. The topic
           headline, because the card carrying it is right there and highlighted, so
           the pane repeated the one line the user had just clicked. And the
           source-and-count sub, which said "Competitors · 14 posts" — the card's own
           source row says the same thing two inches to the left.

           What remains is briefTitle() — the SAME string the card shows, in the
           SAME class. That is the point: the pane must read as the thing you just
           clicked rather than as a different object.

           That string is now the ARTICLE's title everywhere (briefs-store.briefTitle).
           A brief carries two — the scan's own headline and the article's title —
           and they were different sentences about one topic. The article's is the
           claim the topic makes, so it wins on the card, in the pane, and in every
           dialog; the scan's is only the fallback for a brief with no article yet.

           The body still renders with withTitle: false, so the title appears once:
           here, in the header. -->
      <div class="research-feed__article-headtext">
        <h2 class="topics-card__headline">${briefTitle(brief)}</h2>
      </div>
      <button
        type="button"
        class="ap-icon-button ghost grey"
        data-feed-article-close
        aria-label="Close Topic"
        title="Close Topic"
      >
        <i class="ap-icon-close" aria-hidden="true"></i>
      </button>
    </header>
    <div class="research-feed__article-body">
      ${raw(renderResearchArticle(brief, { withLabel: false, withTitle: false }))}
    </div>
    <!-- The card's actions, at the foot of the pane. A reader who has scrolled four
         paragraphs down cannot see the card that opened this, so the verbs have to be
         where they finished reading — the same argument the pane's own close button
         makes.

         All THREE flat, not the card's split. The card hides two behind a chevron
         because it is one of ten in a column and can spare one button's width; the
         footer is the full pane with nothing else in it, so the chevron was charging
         a click for space that was already free. It also takes no view state at all
         now — no menu means no menu key to keep apart from the card's. -->
    <footer class="research-feed__article-foot">${raw(renderUseButtons(brief))}</footer>
  </aside>`;
}

const GENERATE_MS = 1600;

// The attention notice above the Topic list. Off: with every review status ticked
// by default, a flagged Topic is already visible in the list, so the notice
// repeated it. One line to restore — nothing below it was removed.
const SHOW_ATTENTION_NOTICE = false;

let laneId = null;
let filters = defaultFilters();
// One factory, used at module load AND on every mount. It was two literals, and
// they had already drifted: the mount copy still carried a `types` filter group
// that had moved out to the toolbar chips, and would have missed `articleId`
// entirely — so an article left open on one lane would have followed you to the
// next one.
function freshView() {
  return {
    // Which segment is showing. THE TYPE STOPPED BEING A TAG YOU READ AND BECAME
    // THE VIEW YOU ARE IN — see renderSegments for what each one holds.
    segment: "ready",
    generating: false,
    panelOpen: false,
    groups: { status: true, sources: true },
    openMenu: null,
    // Which topic's article is showing beside the list, or null. View state, not
    // URL state: the article is a way of reading the list, not a place, and a
    // link to "the feed with this one open" is a link to a scroll position.
    articleId: null,
    // Should the pane play its entrance on the NEXT paint? True only when the
    // user opens the pane from closed. Deliberately false for the two cases that
    // are not an opening:
    //   • the once-per-mount auto-open — the pane is part of the screen's initial
    //     state, and animating it makes arriving at the page look like something
    //     happened, when nothing did;
    //   • swapping topics while the pane is already open — the container is not
    //     appearing, its contents are changing, and wiping the whole pane in to
    //     announce a new headline overstates it.
    // Consumed and cleared by renderPage, so it survives exactly one paint.
    articleEntering: false,
    // Has the once-per-mount auto-open already run? A separate flag, because
    // `articleId === null` is ALSO what closing the pane looks like — keying the
    // auto-open off the id alone would reopen the pane the instant the user shut
    // it, which is the closest thing to a locked door this screen could have.
    articleAuto: false,
    // How many topics of the filtered list are on screen. One page to start; the
    // sentinel adds a page at a time. View state, like articleId — "the feed with
    // three pages loaded" is a scroll position, not a place worth linking to.
    shown: PAGE_SIZE,
    // Is a page in flight? Guards the observer against firing twice for the same
    // sentinel (it stays intersecting for the whole 2s) and drives the spinner.
    loadingMore: false,
  };
}

let view = freshView();
let timer = null;

// Has the generating loader already played in this page load? Module-level, so it
// survives every mount and remount of this screen and resets only on a reload —
// which is the "first time you click the nav" this restores.
let generatingPlayed = false;

let unsubscribe = null;
let unsubscribePillars = null;
let unsubscribeScope = null;
// Guards the scope callback against re-entering its own mount. store-utils now
// iterates a copy of its subscriber set, so the infinite loop this screen caused
// cannot happen there any more; this is the second lock on the same door,
// because re-running a full mount from inside a store notification is exactly
// the shape that produced it.
let remounting = false;
let fromScope = false;
let mountedParams = null;
let mountedTarget = null;
let topbarEl = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;
let boundDocClick = null;
let boundResize = null;
let boundScroll = null;
// The element the scroll handler is on. Held separately because paint() replaces the
// scroller on every repaint, so teardown has to detach from the one it attached to,
// not from whichever element happens to match the selector by then.
let boundScrollEl = null;

export function renderResearchFeed(params, target) {
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  // ── One feed per Playbook ────────────────────────────────────────────────
  // /topic-feeds carries no id: the feed IS the active Playbook's, resolved
  // here. The id form survives for deep links — a pillar's trail links straight
  // to `/topic-feeds/:laneId?topic=…` — and for the attention page.
  //
  // A Playbook with more than one lane shows its first: the mocks give each
  // brand exactly one, and the moment that stops being true this is the seam
  // where the briefs of several lanes get merged into one list.
  // Remembered so a SCOPE CHANGE can re-resolve. /topic-feeds carries no id, so
  // its lane is a function of the active Playbook — and switching brand while
  // standing on it changed nothing until this existed, because the route did not
  // change and the router had nothing to re-run.
  fromScope = !params.id;
  mountedParams = params;
  mountedTarget = target;
  laneId = params.id || firstLaneForScope();
  const lane = getLaneById(laneId);
  if (!lane) {
    // No lane for this Playbook. NOT a redirect: /topic-feeds is where this
    // resolves from, so bouncing there would loop. With feed creation gone the
    // feed is implicit — every Playbook has one — so the honest state is "it has
    // no sources yet", and the way out is its settings.
    teardown();
    renderTopbar();
    paintNoFeed(target);
    unsubscribeScope = subscribeScope(onScopeChange);
    return teardown;
  }

  renderTopbar();
  teardown();
  filters = defaultFilters();
  view = freshView();

  // ?topic=<briefId> — arrive with one topic already open, from a pillar's trail.
  // Two things have to give way for it: the auto-open (which would pick the
  // newest instead) and the default status filter, because a topic that has been
  // Used or Ignored is not in the default view and the pane would open onto a
  // card the list does not show.
  const wanted = parseHashParams().get("topic");
  const wantedBrief = wanted ? getBriefById(wanted) : null;
  if (wantedBrief) {
    filters = { ...filters, statuses: REVIEW_STATUSES.map((st) => st.id) };
    view.articleId = wantedBrief.id;
    view.articleAuto = true;
  }

  // Two ways in. `?fresh=1` is the EXPLICIT one — a save on the settings form
  // appends it, and so did the parked feed list when you opened a feed.
  //
  // The second is the FIRST arrival of the page load, which is what restored the
  // loader after the feed list was retired: the sidebar's Topic Feed row navigates
  // to a bare /topic-feeds, so with `?fresh=1` as the only trigger the loader had
  // quietly stopped playing for the one route anybody actually uses. It plays once
  // per page load, like the starter-topic countdown and the pillar cards' own
  // generating state — this is a prototype showing that a feed is SCANNED, and a
  // spinner on every visit would be a lie you sit through.
  //
  // Not when a deep link names a topic (`?topic=`): you asked for one card, and
  // making you wait 1.6s to be shown the thing you clicked is the loader getting in
  // the way of the content it is supposed to be announcing.
  const fresh = parseHashParams().get("fresh") === "1";
  const firstArrival = !generatingPlayed && !wantedBrief;
  generatingPlayed = true;
  if (fresh || firstArrival) {
    view.generating = true;
    timer = window.setTimeout(() => {
      view.generating = false;
      timer = null;
      paint(target);
    }, GENERATE_MS);
  }

  paint(target);
  bind(target);
  unsubscribe = subscribeBriefs(() => paint(target));
  // Unlinking a topic from a pillar repaints the card that carries the mark.
  unsubscribePillars = subscribePillars(() => paint(target));
  unsubscribeScope = subscribeScope(onScopeChange);
  return teardown;
}

function paintNoFeed(target) {
  target.innerHTML = html`<section class="screen research-feed">
    <div class="research-feed__nofeed">
      <span class="research-feed__nofeed-mark"><i class="ap-icon-antenna"></i></span>
      <h1 class="ap-h3">No sources yet</h1>
      <p>
        This Playbook's feed has nothing to listen to. Pick the competitors, influencers and trends I should watch, and
        topics start arriving on their own.
      </p>
      <button type="button" class="ap-button primary blue" data-feed-settings>
        <i class="ap-icon-cog"></i><span>Choose sources</span>
      </button>
    </div>
  </section>`;
  target.addEventListener("click", onNoFeedClick);
  boundTarget = target;
  boundClick = onNoFeedClick;
}

function onNoFeedClick(event) {
  // Straight into THIS Playbook's feed settings, not the table of every feed.
  // The user is one click from an empty screen and wants to fix that screen —
  // a table is a detour that makes them find their own row first.
  if (event.target.closest("[data-feed-settings]")) navigate("/topic-feeds/settings");
}

// ── The two segments ──────────────────────────────────────────────────────
// A topic is IN "Topics for later" only while it is a content-strategy topic
// that no pillar has claimed. Link it to a pillar and it leaves — because that
// is exactly what linking means: the thing that was blocking it (no angle, no
// home) is answered, and it is now draftable.
//
// So the split is not the raw `researchType` any more. Type is the input; the
// pillar link is the second half, and the segment is the answer.
function inSegment(brief, segment) {
  const later = brief.researchType === "content-strategy" && !pillarForBrief(brief.id);
  return segment === "later" ? later : !later;
}

function segmentBriefs(segment) {
  return getBriefsForLane(laneId, filters).filter((b) => inSegment(b, segment));
}

// A PORT of the DS's Segmented Control, not a look-alike.
//
// The DS ships this component in Angular only (<ap-segmented-control>) — the
// CSS-UI layer has no class for it — while its own tie-breaker names a segmented
// control as the component for flipping between two to four short co-visible
// views, which is exactly this. So it is hand-built, but from the component's
// real template and SCSS: same class names, same markup, same values. The CSS
// lives in ds-patches.css, the one place this app is allowed to add a primitive
// the CSS-UI layer forgot, and swapping in the real component is a delete.
//
// The first version was a look-alike rather than a port — a grey track with a
// raised white chip on it, the iOS shape. The DS's is an outlined button group:
// white segments, grey-20 borders sharing an edge, and a SELECTED state that
// changes border and text to electric blue rather than filling anything.
//
// The count is the one addition, and it is a DS **Counter** rather than a styled
// span. The segment option carries a label and an optional icon, so the number is
// ours to place — but not ours to draw: `.ap-counter normal` is the documented
// way this product puts a number beside a label, and it is what the nav rows use
// for the size of a set you own. The first version was a bare span with a
// font-weight override, which is the "recreate a component in raw CSS" drift the
// guidelines call out.
//
// It takes the SEGMENT's state: grey while unselected, blue when selected, using
// the DS's own two colour pairs so the number belongs to the segment it sits in
// rather than floating grey against blue text.

// The Playbook picker, in the topbar's LEAD slot beside the section title.
//
// ⚠️ It is a VIEW OF THE RAIL'S SCOPE, not a second scope. CLAUDE.md records that
// active-playbook.js deliberately replaced four separate Playbook pickers — the
// composer's, this feed's form, the New-pillar dialog's and /content-strategy's —
// because "any two could disagree". Picking here therefore calls
// setActivePlaybook(): the rail's switcher, this trigger, the feed, the pillar
// counters and a new chat's Playbook all keep reading one value. A local
// `view.playbook` would have put a second answer on the same screen as the first.
//
// "First Playbook selected by default" falls out of that for free rather than
// needing its own rule: getActivePlaybook() already falls back to
// getDefaultContext() || getContexts()[0], so with nothing chosen the trigger shows
// the first Playbook in the list.
//
// Markup is the composer's, part for part — .ap-select > summary.ap-select-trigger
// .composer-playbook__trigger with an inline label, then .ap-select-dropdown with
// .ap-select-option rows. The one part NOT reused is the dropdown's own class:
// .composer-playbook__dropdown pins itself with `bottom: 100%` because the composer
// sits at the bottom of the screen and has to open UPWARD. In a topbar that is
// upside down — the panel opened over the title instead of below the trigger — so
// this uses .research-playbook__dropdown, which keeps the DS's own downward
// `top: 100%`. Reused rather than re-derived: it is the same control
// answering the same question, and the composer's already carries the DS's
// details/summary behaviour, the selected check and the colour dot.
function renderPlaybookPicker() {
  const playbooks = getContexts();
  const active = getActivePlaybook();
  const items = playbooks
    .map((c) => {
      const isSel = active && c.id === active.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-feed-playbook-pick="${escapeAttr(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="composer-context__dot" style="background: var(--ref-color-${escapeAttr(
            c.color === "blue" ? "electric-blue" : c.color || "grey",
          )}-100);"></span>
          <span class="ap-select-option-text">${escapeAttr(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const value = active
    ? `<span class="ap-select-value">${escapeAttr(active.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select research-playbook" data-feed-playbook>
      <summary class="ap-select-trigger composer-playbook__trigger" title="Choose the Playbook this feed listens for">
        <span class="ap-select-inline-label">Playbook</span>
        ${value}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown research-playbook__dropdown" role="listbox" aria-label="Choose a Playbook">
        <div class="ap-select-options">${items}</div>
        <!-- The DS's own footer, which brings the separator with it: .ap-select-footer
             is a border-top plus a margin, and .ap-select-create is the blue bold row
             inside it. Nothing here is app CSS — the composer's picker uses the same
             three classes, and this is the same control offering the same way out of
             an empty list. -->
        <div class="ap-select-footer">
          <button type="button" class="ap-select-create" data-feed-playbook-create>
            <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
            <span>Create a Playbook</span>
          </button>
        </div>
      </div>
    </details>`;
}

function renderSegments() {
  const counts = {
    ready: segmentBriefs("ready").length,
    later: segmentBriefs("later").length,
  };
  const seg = (id, label) => {
    const on = view.segment === id;
    return `
    <button
      type="button"
      class="ap-segmented-control__segment ${on ? "ap-segmented-control__segment--selected" : ""}"
      data-feed-segment="${id}"
      aria-pressed="${on ? "true" : "false"}"
    >
      <span class="ap-segmented-control__label">${label}</span>
      <span class="ap-counter normal ${on ? "blue" : "grey"} research-segments__count">${counts[id]}</span>
    </button>`;
  };
  return `<div class="ap-segmented-control research-segments" role="group" aria-label="Which topics to show">
      ${seg("ready", "Ready to draft")}${seg("later", "Topics for later")}
    </div>`;
}

// Switching brand re-resolves the feed: /topic-feeds carries no id, so its lane
// is a function of the active Playbook and the router has no hash change to react
// to. Re-mounting is the honest way to do that — it re-runs every step, including
// the filters and the pane — so the guard is what keeps it from re-entering.
function onScopeChange() {
  if (!fromScope || remounting) return;
  remounting = true;
  try {
    renderResearchFeed(mountedParams, mountedTarget);
  } finally {
    remounting = false;
  }
}

function firstLaneForScope() {
  const scopeId = getActivePlaybookId();
  const lanes = getLanes();
  const mine = scopeId ? lanes.filter((l) => l.playbookId === scopeId) : lanes;
  return mine.length ? mine[0].id : null;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (unsubscribePillars) {
    unsubscribePillars();
    unsubscribePillars = null;
  }
  if (unsubscribeScope) {
    unsubscribeScope();
    unsubscribeScope = null;
  }
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  // The observer holds the sentinel from a screen that is being unmounted, and the
  // timer would paint into a target the router has already replaced.
  if (moreObserver) {
    moreObserver.disconnect();
    moreObserver = null;
  }
  if (moreTimer) {
    window.clearTimeout(moreTimer);
    moreTimer = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (topbarEl && boundClick) topbarEl.removeEventListener("click", boundClick);
  if (topbarEl && boundInput) {
    topbarEl.removeEventListener("input", boundInput);
    topbarEl.removeEventListener("change", boundInput);
  }
  topbarEl = null;
  clearTopbarActions();
  if (boundTarget && boundInput) {
    boundTarget.removeEventListener("input", boundInput);
    boundTarget.removeEventListener("change", boundInput);
  }
  if (boundDocClick) {
    document.removeEventListener("click", boundDocClick);
    boundDocClick = null;
  }
  if (boundResize) {
    window.removeEventListener("resize", boundResize);
    boundResize = null;
  }
  if (boundScrollEl && boundScroll) {
    boundScrollEl.removeEventListener("scroll", boundScroll);
  }
  boundScrollEl = null;
  boundScroll = null;
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function pushTopbarActions() {
  // The segments go LEFT, beside the section title: they say WHICH LIST you are
  // looking at, which is the same question the title answers — where Filters and
  // Export act ON that list. Grouping them with the actions made "Ready to
  // draft" read as a third button rather than as the name of the view.
  // The picker sits in the RIGHT slot, immediately before the Filters button, and the
  // lead slot keeps the title + segments. Both are scope controls, and the right slot
  // is where this screen's controls already live: "which brand, then which of its
  // topics" reads as one cluster there, where in the lead slot the picker was wedged
  // between the section title and the segments that name the view.
  setTopbarActions(renderPlaybookPicker() + renderTopbarActions(narrowedGroupCount(filters)), renderSegments());
}

function paint(target) {
  // Every action in this feed repaints the whole screen, and innerHTML wipes the
  // scroll container with it. Without carrying scrollTop across the swap, using
  // or saving a brief halfway down the list threw the user back to the top —
  // which reads as the page reloading, not as the action working.
  const prev = target.querySelector(".research-feed__body");
  const scrollTop = prev ? prev.scrollTop : 0;
  target.innerHTML = html`<section class="screen research-feed">${raw(renderPage())}</section>`;
  // The cluster lives outside #app, so it is repainted here rather than by the
  // innerHTML above — the Filters badge tracks the filter state and would go
  // stale on the first narrowing otherwise.
  pushTopbarActions();
  if (scrollTop) {
    const next = target.querySelector(".research-feed__body");
    if (next) {
      // Read a layout property first. Assigning scrollTop straight after an
      // innerHTML swap clamps it to the height the browser has computed SO FAR,
      // which is smaller than the final one — the restore silently lands short.
      void next.scrollHeight;
      next.scrollTop = scrollTop;
    }
  }
  // The sentinel is destroyed and rebuilt by the innerHTML above, so the observer
  // has to be re-pointed after every paint — not once at mount.
  observeMore(target);
  watchPaneScroll(target);
  sizeArticlePane(target);
}

// Keep the pane's cap in step with the scroll. Re-bound on every paint for the same
// reason the sentinel observer is: the innerHTML swap above destroys the scroller,
// so a listener from the previous paint is attached to a detached node.
//
// Synchronous, not rAF-coalesced. rAF looks like the right tool for scroll-driven
// layout and was tried first, but it does not fire at all while the tab is hidden —
// so the cap would go stale in a background tab and, more practically, the behaviour
// could not be exercised in an automated browser. The work here is two rect reads
// and a write the epsilon guard usually skips, against scroll events the browser
// already delivers at about frame rate, so coalescing bought little.
//
// Passive, so measuring never delays the scroll. Measure only — no repaint — so it
// cannot fight what the user is doing.
function watchPaneScroll(target) {
  if (boundScrollEl && boundScroll) boundScrollEl.removeEventListener("scroll", boundScroll);
  boundScrollEl = target.querySelector(".research-feed__body");
  boundScroll = null;
  if (!boundScrollEl) return;
  boundScroll = () => sizeArticlePane(target);
  boundScrollEl.addEventListener("scroll", boundScroll, { passive: true });
}

// Cap the article pane so its BOTTOM — and therefore its footer — is always on
// screen.
//
// The CSS max-height it replaces was `100vh - topbar - 2 × xl`, which assumes the
// pane starts directly below the topbar. It doesn't: the feed header sits above it
// INSIDE the scroller and scrolls away, so at scrollTop 0 the pane starts ~148px
// lower and its bottom edge lands about 70px past the fold. That was survivable
// while the pane ended in mid-paragraph; with an action footer down there it is not,
// because the control is simply not visible until you scroll.
//
// Not expressible in CSS: the pane's top moves. It starts below the feed header and
// rises to the sticky offset as that header scrolls away — 116px of travel here —
// and a % max-height resolves against a containing block whose height is the LIST's,
// not the scroller's. So measure and publish a custom property the stylesheet reads.
//
// Measured from the pane's CURRENT top, on every paint AND on scroll, so the pane
// fills the screen in both states. A single static cap cannot: sized for the unstuck
// position it leaves ~130px of dead space once stuck, and sized for the stuck one it
// pushes the footer off the fold at the top of the page. Two right answers, so the
// value has to follow the travel.
//
// Safe to resize on scroll because the pane is not what makes the scroller scroll —
// the list column is several times taller, so the split's height is the list's and
// changing the pane's cannot feed back into scrollHeight. The epsilon guard below is
// belt-and-braces for the case where a heavily filtered list leaves the pane as the
// tallest item.
function sizeArticlePane(target) {
  const pane = target.querySelector(".research-feed__article");
  const scroller = target.querySelector(".research-feed__body");
  if (!pane || !scroller) return;
  // Against the VIEWPORT, not the scroller: what matters is where the fold is, and
  // the scroller already ends there. Reading the live rect also means the sticky
  // clamp is accounted for without reproducing it — no need to know the pane's
  // margin or the scroller's offset, both of which this got wrong before. (It used
  // pane.offsetTop, whose offsetParent is the document body rather than the
  // scroller, so the cap carried the topbar's 56px as well.)
  const avail = window.innerHeight - pane.getBoundingClientRect().top - PANE_BOTTOM_GAP;
  const next = Math.max(PANE_MIN_H, Math.round(avail));
  // Only write on a real change. A no-op style write is cheap but not free, and this
  // runs on every scroll frame.
  const current = parseInt(pane.style.getPropertyValue("--article-max-h"), 10);
  if (Number.isFinite(current) && Math.abs(current - next) < 2) return;
  pane.style.setProperty("--article-max-h", `${next}px`);
}

// Breathing room under the pane, so its shadow and rounded corner are not flush
// with the fold.
const PANE_BOTTOM_GAP = 16;
// A floor, so a very short window cannot collapse the pane to nothing — better to
// overflow slightly than to render a 40px article.
const PANE_MIN_H = 320;

// ── Infinite load plumbing ─────────────────────────────────────────────────

let moreObserver = null;
let moreTimer = null;

function resetPaging() {
  view.shown = PAGE_SIZE;
  view.loadingMore = false;
  // A page in flight belongs to the list that requested it. Cancel it, or it lands
  // on the newly filtered list and pages it too.
  if (moreTimer) {
    clearTimeout(moreTimer);
    moreTimer = null;
  }
}

// Point the observer at the current sentinel. Cheap to call on every paint: the
// observer is created once and simply re-targeted, and disconnect() drops the
// stale element the paint just threw away.
//
// root is the scroll container, not the viewport — .research-feed__body is what
// scrolls here, so a viewport-rooted observer would never see the sentinel cross
// anything. rootMargin gives it a screenful of lead time so the next page is
// already arriving as the user reaches the end.
function observeMore(target) {
  const sentinel = target.querySelector("[data-research-more]");
  if (moreObserver) moreObserver.disconnect();
  if (!sentinel) return;
  const root = target.querySelector(".research-feed__body");
  if (!moreObserver) {
    moreObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        loadMore(target);
      },
      { root, rootMargin: "200px" },
    );
  }
  moreObserver.observe(sentinel);
}

function loadMore(target) {
  if (view.loadingMore) return;
  const total = segmentBriefs(view.segment).length;
  if (view.shown >= total) return;
  view.loadingMore = true;
  paint(target); // swap the caption for the spinner
  moreTimer = setTimeout(() => {
    moreTimer = null;
    view.shown += PAGE_SIZE;
    view.loadingMore = false;
    paint(target);
  }, LOAD_MS);
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderPage() {
  const lane = getLaneById(laneId);
  if (!lane) return "";
  if (view.generating) return renderGenerating();

  const briefs = segmentBriefs(view.segment);
  // ── The attention notice is switched OFF ─────────────────────────────────
  // Kept, not deleted, so it can be switched back on in one line. It reported
  // trending and updated topics above the list; with every status now ticked by
  // default the list already shows them, so the notice was restating what was
  // already on screen.
  //
  // Flip `SHOW_ATTENTION_NOTICE` to true to bring it back — renderAttentionNotice
  // and attentionCountsForLane are both still here and still correct.
  // ── The first topic opens by itself, once per visit ──────────────────────
  // The pane is the point of the layout, and an empty right half on arrival
  // doesn't say so — the reader has to click a card to discover that reading one
  // in place is even possible. Opening the newest topic answers that before it is
  // asked, and it is the topic they would most likely have clicked anyway.
  //
  // Taken from the GROUPED order rather than from `briefs[0]`, so it is genuinely
  // the first card rendered: the list draws age groups in order, and the auto-open
  // must agree with what the eye lands on.
  //
  // Runs after the generating guard above, so a lane arriving with ?fresh=1 opens
  // on its first real paint rather than being skipped while the loader is up.
  const groups = groupBriefsByAge(briefs);
  if (!view.articleAuto) {
    view.articleAuto = true;
    view.articleId = groups[0]?.briefs[0]?.id || null;
  }

  // Resolved here rather than inside the split so a stale id — the topic was
  // ignored out of the filter, or the lane was re-scanned — simply closes the
  // pane instead of rendering an empty one.
  // An empty list closes the pane, which is why this is a `let` — clearing the id
  // alone left the already-resolved brief rendering, so the empty state came up with
  // an article still open beside it: the reader told nothing matches while reading
  // one of the things that doesn't.
  //
  // Keyed on the list being EMPTY rather than on "is the open article in the list",
  // deliberately: a ?topic= deep link can legitimately open a topic the current
  // segment does not hold, and the narrower test would slam that pane shut on
  // arrival. When the list has cards, an article from outside it is a deep link
  // doing its job; when the list has none, it is debris.
  let article = view.articleId ? getBriefById(view.articleId) : null;
  if (view.articleId && !article) view.articleId = null;
  if (!briefs.length) {
    view.articleId = null;
    article = null;
  }

  // Read and clear: the entrance class lands in exactly one paint's markup, so an
  // unrelated repaint (a dropdown, a filter) neither replays it nor keeps it.
  const entering = view.articleEntering;
  view.articleEntering = false;

  const attention = SHOW_ATTENTION_NOTICE ? attentionCountsForLane(laneId) : null;
  const showNotice = SHOW_ATTENTION_NOTICE && attention.total > 0 && lane.showTrending;

  return html`<div class="research-feed__body">
    <div class="research-feed__inner">
      <!-- A paused feed has to SAY so here. The switch is in the settings table,
           two screens away, and the only other symptom is a list that quietly
           stops growing — which reads as "nothing is happening in my market",
           not as "I turned this off". The Resume button is in the notice because
           the fix belongs where the news is. -->
      ${raw(
        lane.paused
          ? html`<div class="ap-infobox warning research-feed__paused" role="status">
              <i class="ap-icon-warning_fill" aria-hidden="true"></i>
              <div class="ap-infobox-content">
                <div class="ap-infobox-texts">
                  <span class="ap-infobox-message">
                    This feed is paused. Everything below stays, but nothing new arrives until you start it again.
                  </span>
                </div>
                <button type="button" class="ap-button stroked grey" data-feed-resume>
                  <i class="ap-icon-play" aria-hidden="true"></i><span>Resume</span>
                </button>
              </div>
            </div>`
          : "",
      )}
      ${raw(showNotice ? renderAttentionNotice(attention) : "")}
      <!-- The split starts HERE, below the header and the chips, so neither of
           them changes width when an article opens.

           is-labelled says the list opens with an age-group heading, which is the
           only case where the pane needs a top margin to stay aligned with the first
           card. Carried on the split rather than the pane because it is a fact about
           the LIST, and the pane is the thing that reacts to it. -->
      <div
        class="research-feed__split${raw(article ? " is-split" : "")}${raw(
          listOpensWithLabel(briefs, view.shown) ? " is-labelled" : "",
        )}"
      >
        ${raw(briefs.length ? renderList(briefs, view) : renderEmpty())}
        ${raw(article ? renderArticlePane(article, entering) : "")}
      </div>
    </div>
  </div>`;
}

// Two different emptinesses, and calling them the same thing is a lie one way or
// the other. A feed that has NEVER returned anything — a Playbook whose feed was
// just provisioned, listening to competitors and waiting for its first scan — is
// not a filter problem, and telling that reader to widen their filters sends them
// to a panel where nothing is narrowed. The filter message is kept for the case
// it actually describes: topics exist, and the current narrowing hides them all.
function renderEmpty() {
  const anyAtAll = getBriefsForLane(laneId, null).length > 0;
  if (anyAtAll) return renderFilteredEmpty();
  return html`<div class="research-feed__empty research-feed__empty--fresh">
    <span class="research-feed__nofeed-mark"><i class="ap-icon-antenna"></i></span>
    <h2 class="ap-h3">Nothing has landed yet</h2>
    <p class="muted">
      I'm listening on this Playbook's sources. Topics show up here as they arrive — add more sources if you want me
      watching wider.
    </p>
    <button type="button" class="ap-button stroked grey" data-feed-empty-settings>
      <i class="ap-icon-cog" aria-hidden="true"></i><span>Feed settings</span>
    </button>
  </div>`;
}

// ── Nothing matches the filter ─────────────────────────────────────────────
// It was one muted line — "No Topics match these filters. Try widening them, or
// reset to the defaults." — which named the problem and left the reader to find
// the panel and work out which tick to undo. The three ways out of an empty feed
// are known, so the state names them:
//
//   1. WAIT. The feed scans on a cadence, so the list refilling needs nothing
//      from the reader. Said first because it is true whatever the filter says.
//      It names the feed's OWN cadence, and is replaced when the feed is paused,
//      where it would be a promise nothing is going to keep.
//   2. THE OTHER SEGMENT. Named only when it holds something: pointing someone
//      at an empty list is worse than saying nothing.
//   3. WIDEN THE STATUS FILTER. Named only when Used or Ignored is unticked AND
//      ticking it would reveal something IN THIS SEGMENT — counted against the
//      widened filter rather than the whole lane, so the sentence cannot promise
//      topics the source filter or the segment still hides.
//
// DESCRIBED, NOT BUTTONED. This had two buttons that switched the segment and
// ticked the statuses. They were shortcuts to controls already on screen — the
// segmented control is six inches up, Filters is beside it — so the state was
// growing a second copy of the page's own chrome, and the second copy is the one
// that drifts. Sentences point at the real controls and cannot fall out of step
// with them. It is also why this state has no button at all where its --fresh
// sibling does: that one's Feed settings is a real destination, not a duplicate.
//
// The shape still mirrors --fresh deliberately: the two are the same kind of
// thing. Both are hand-built pattern-1 empty states and both are candidates for
// components/empty-state.js — migrating one alone is what would make them diverge.
//
// First person, like --fresh and unlike the dialogs: an empty state is one of the
// places Archie talks (CLAUDE.md).
function renderFilteredEmpty() {
  const lane = getLaneById(laneId);
  const cadence = findCadence(lane?.cadence);
  const other = view.segment === "later" ? "ready" : "later";
  const otherCount = segmentBriefs(other).length;
  const otherLabel = other === "later" ? "Topics for later" : "Ready to draft";

  // What ticking Used and Ignored would actually surface, in THIS segment.
  const hiddenStatuses = REVIEW_STATUSES.map((st) => st.id).filter((id) => !filters.statuses.includes(id));
  const widened = hiddenStatuses.length
    ? getBriefsForLane(laneId, { ...filters, statuses: [...filters.statuses, ...hiddenStatuses] }).filter((b) =>
        inSegment(b, view.segment),
      ).length
    : 0;

  // Built as parts and joined rather than nested ternaries: four combinations of
  // two optional clauses is where a ternary chain stops being readable, and the
  // sentence has to end up as ONE paragraph however many clauses survive.
  const parts = [
    lane?.paused
      ? "This feed is paused, so nothing new will arrive until you start it again."
      : `I scan ${cadence?.adverb || "regularly"}, so the next batch lands here on its own.`,
  ];
  if (otherCount) parts.push(`${otherLabel} has ${otherCount}.`);
  if (widened) parts.push("Tick Used and Ignored under Filters to bring back the ones you have already handled.");

  return html`<div class="research-feed__empty research-feed__empty--fresh">
    <span class="research-feed__nofeed-mark"><i class="ap-icon-filter"></i></span>
    <h2 class="ap-h3">No Topics match these filters</h2>
    <p class="muted">${parts.join(" ")}</p>
  </div>`;
}

function renderGenerating() {
  // .ap-loader, not a hand-rolled ring. initArchieLoader() sweeps for this class
  // and swaps its contents for the animated Archie network-assemble mark, so
  // this spinner matches every other spinner in the app for free. A custom ring
  // was the only loader in the product that didn't.
  return html`<div class="research-generating">
    <span class="ap-loader orange size-60" aria-hidden="true"></span>
    <p class="research-generating__caption" role="status">We are generating topics for you…</p>
  </div>`;
}

// The topbar cluster: Filters (with its panel) and Feed settings. Export is gone —
// it shipped a CSV of a list nobody has asked to take out of the app, and it sat at
// the same weight as Filters, which every reader uses.
function renderTopbarActions(narrowed) {
  return html`<div class="research-filters">
    <button
      type="button"
      class="ap-button stroked grey"
      data-feed-filters
      aria-expanded="${view.panelOpen ? "true" : "false"}"
    >
      <i class="ap-icon-filter" aria-hidden="true"></i>
      <span>Filters</span>
      <!-- The DS Counter, not a hand-built pill. Same correction the segment counts
           got: .ap-counter normal grey is how this product puts a number beside a
           label, and the pill here was 11px/800 on grey-10 with a radius of its
           own. -->
      ${raw(narrowed ? html`<span class="ap-counter normal grey research-filters__badge">${narrowed}</span>` : "")}
    </button>
    ${raw(view.panelOpen ? renderFilterPanel() : "")}
  </div>`;
}

// Two groups: Topic status, then Sources.
//
// ── Topic type is GONE from here, and had to be ───────────────────────────
// The segmented control is that filter now. Leaving both meant two controls
// answering one question, and they could contradict: untick "Draft-ready" while
// standing in the Ready-to-draft segment and the list empties with the segment
// still claiming a count. The catalogue's own rule — one pattern per problem per
// surface — decides it, and the segment wins because it is always visible.
//
// `filters.types` still exists and still defaults to both, so
// getBriefsForLane's shape is unchanged; nothing narrows on it any more.
// A PORT of the DS Filter Dropdown, like the segmented control before it.
//
// `@agorapulse/ui-components/filter-dropdown` ships Angular only —
// <ap-filter-dropdown> + <ap-filter-leaf>, no CSS-UI classes — while the intent
// lookup sends "filter dropdown" straight to it. The structure here was already
// leaf-for-leaf identical (header + chevron, collapsible options, checkboxes), so
// what the port changes is the class names and the values: 420px, the
// --comp-action-dropdown-* surface, and the leaf's own spacing. CSS in
// ds-patches.css.
//
// role="group", not the component's role="menu": its own children are menu items
// and these are checkboxes, so "menu" would promise arrow-key semantics that do
// not exist here. The label is what the DS gives it.
// LIVE sources only, which today is Competitors alone (V1 scope).
//
// The other seven are `live: false` in research-catalog.js — declared so the settings
// form can show what is coming and open the "Need that source?" modal — and a filter
// row for a source that cannot produce a topic is a control that can only ever remove
// nothing or remove everything. It also misrepresents the feed: unticking "Global
// trends" implied there were global-trends topics being hidden.
//
// briefs-store's ALL_SOURCE_IDS derives from the same LIVE set, so the panel and the
// filter agree about what "all sources" means. Without that the group would read as
// narrowed the moment it opened — a 1-id selection against an 8-id notion of full
// breadth — and the Filters badge would be pinned to 1 forever.
function filterableSources() {
  return RESEARCH_SOURCES.filter((s) => LIVE_SOURCE_IDS.includes(s.id));
}

function renderFilterPanel() {
  return html`<div class="ap-filter-dropdown research-filters__panel" data-feed-panel role="group" aria-label="Filters">
    ${raw(
      renderGroup("status", "Topic status", REVIEW_STATUSES, filters.statuses, "statuses") +
        // Sources renders WITHOUT its glyphs, unlike Topic status. The difference is
        // whether the row has a mapping to teach: a card shows its status as a BARE
        // icon, so the filter row is the only place that glyph is ever named — while
        // a card's source badge already carries the word beside the glyph, leaving
        // the filter to repeat a pairing the reader has met on every card. Eight of
        // them down the panel also blunt the status icons, which do need reading.
        // The icons stay in the catalogue: the source cards on the form use them.
        renderGroup("sources", "Sources", filterableSources(), filters.sources, "sources", {
          icons: false,
          // The component's isLastLeaf: the final leaf owns no separator, because the
          // panel's own footer border is the line under it.
          isLast: true,
        }),
    )}
    <!-- The component's own footer: .ap-filter-dropdown__footer, right-aligned,
         with a real ghost-blue .ap-button carrying the reset symbol on the left.
         It was a hand-rolled link-button (14px/800 electric blue, no DS class).
         No Apply beside it — every control here commits on change, so a second
         button would promise something is pending. -->
    <div class="ap-filter-dropdown__footer">
      <div class="ap-filter-dropdown__footer--apply">
        <button type="button" class="ap-button ghost blue" data-feed-reset>
          <i class="ap-icon-refresh" aria-hidden="true"></i><span>Reset filters</span>
        </button>
      </div>
    </div>
  </div>`;
}

// The status glyphs, unlabelled, for the collapsed group head. Read from
// REVIEW_STATUSES so it is the same list, in the same order, with the same icons the
// cards use — a hand-written legend would drift the first time one icon changed.
//
// Filtered to statuses that HAVE an icon, which is three of the four: New renders no
// marker on a card, so a legend entry for it would explain a glyph the reader will
// never see. The filter, rather than a hardcoded list of three, is what keeps this
// honest if a status gains or loses its icon later.
function renderStatusLegend() {
  return html`<span class="research-filters__legend" aria-hidden="true">
    ${raw(
      REVIEW_STATUSES.filter((s) => s.icon)
        .map((s) => html`<i class="${s.icon}"></i>`)
        .join(""),
    )}
  </span>`;
}

// `icons: false` suppresses the option glyphs for a group whose data happens to
// carry them (Sources) — the catalogue keeps them for the surfaces that do use
// them, and only this panel opts out.
function renderGroup(key, label, options, selected, field, { icons = true, isLast = false } = {}) {
  const open = view.groups[key];
  // Does this group MIX iconless options with iconed ones? Only Topic status does,
  // now that New carries no glyph, and without this its label would sit a glyph's
  // width to the left of the other three — four checkboxes with a ragged label
  // column read as a rendering bug rather than as a status without a marker.
  // Groups where NO option has an icon (Topic type) reserve nothing, so they keep
  // their tighter row.
  const mixedIcons = icons && options.some((o) => o.icon) && options.some((o) => !o.icon);
  // `with-border-bottom` is the component's separator between leaves, and the component
  // drives it from `isLastLeaf` — every leaf except the last carries it. This port drove
  // it from the OPEN state instead, which is a different rule and a visible one: with
  // two groups, expanding the first removed the line between them and collapsing it put
  // the line back, so the panel's internal division appeared and disappeared as you
  // used it. Position is stable; expansion is not.
  return html`<section class="ap-filter-leaf research-filters__group ${raw(isLast ? "" : "with-border-bottom")}">
    <button
      type="button"
      class="ap-filter-leaf__header ${raw(open ? "ap-filter-leaf__expanded" : "")} research-filters__group-head"
      data-feed-group="${key}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span class="ap-filter-leaf__title">${label}</span>
      <!-- The status group's head carries the glyphs as a LEGEND, so the panel that
           owns this axis also says what the cards' icons mean. Three of them, not
           four — New has no marker on a card, so it has none here either.
           Shown only while the group is COLLAPSED: expanded, every option row below
           carries its own icon beside its own name, which is the pairing that
           actually teaches the mapping — the legend would then be the same glyphs
           twice, once without labels.
           aria-hidden, because the head is a button whose accessible name is the
           group's label; a run of icon names read out before "Topic status" would
           make the control harder to use, not easier, and the options below name
           each status properly. -->
      ${raw(key === "status" && !open ? renderStatusLegend() : "")}
      <!-- One glyph, rotated — the component's own trick
           (.ap-filter-leaf__chevron--rotated) rather than two icon names, so the
           two states cannot pick up different marks. -->
      <i
        class="ap-icon-chevron-up research-filters__chevron ${raw(open ? "" : "ap-filter-leaf__chevron--rotated")}"
        aria-hidden="true"
      ></i>
    </button>
    ${raw(
      open
        ? html`<div class="ap-filter-leaf__content research-filters__options">
            ${raw(
              options
                .map(
                  (o) =>
                    html`<label class="ap-checkbox-container ap-filter-leaf__option research-filters__option">
                      <!-- The DS checkbox: a <label> holding a visually-hidden
                           <input> and an <i> that IS the box — the same shape as
                           .ap-toggle-container, which this app already uses on the
                           feed-settings form. It carried class="ap-checkbox", which
                           exists nowhere in the CSS-UI layer, so every option
                           rendered as a raw 13px OS checkbox: the only native form
                           control left in the product. -->
                      <input
                        type="checkbox"
                        data-feed-filter="${escapeAttr(field)}"
                        value="${escapeAttr(o.id)}"
                        ${raw(selected.includes(o.id) ? "checked" : "")}
                      />
                      <i aria-hidden="true"></i>
                      <!-- The icon, where a status has one — this is the row that
                           teaches the mapping, because it is the only place the glyph
                           and the word sit together. Types have none and the
                           expression renders nothing at all; Sources have them in the
                           catalogue but this panel opts out (icons: false). New is the
                           third case: it sits in a group whose other three options DO
                           have glyphs, so it gets an empty slot of the same width to
                           keep the labels in one column (see mixedIcons above).
                           aria-hidden on both: the label beside it is the accessible
                           name and the checkbox already owns it. -->
                      <span class="research-filters__option-name">
                        ${raw(
                          icons && o.icon
                            ? html`<i class="${o.icon} research-filters__option-icon" aria-hidden="true"></i>`
                            : mixedIcons
                              ? html`<span class="research-filters__option-icon is-empty" aria-hidden="true"></span>`
                              : "",
                        )}
                        <span>${o.label || o.name}</span>
                      </span>
                    </label>`,
                )
                .join(""),
            )}
          </div>`
        : "",
    )}
  </section>`;
}

// The DS Infobox, not a hand-built box: "banner" is an intent-lookup entry that
// resolves to Infobox, so building one by hand is banned. Anatomy is the CSS-UI
// layer's: `> i`, then -content > -texts > -title/-message with the button a
// DIRECT child of -content (the DS styles `> .ap-button` and `> i` itself, so no
// wrapper divs).
//
// `main` (orange), not `info`. Blue read as a neutral aside and undersold it —
// this is Archie saying you are not seeing something, which is the app's orange
// across every surface. The variant is a ds-patches addition; the DS ships no
// orange infobox, and `warning` would have been picking a semantic family for
// its hue.
//
// ── It now carries BOTH signals ────────────────────────────────────────────
// The title counts topics, not signals, so a brief that is both trending and
// updated is one topic needing attention. The breakdown below it names the
// signals separately and deliberately does NOT read as an equation — see
// hiddenAttentionForLane on why the two numbers can exceed the total.
//
// Everything flagged, unconditionally. Two narrower rules were tried and removed
// — counting only what the active filter hid, then counting only what the reader
// had not yet opened /attention to see. Both existed to stop this becoming
// permanent furniture; with both gone it shows for as long as anything is
// flagged, and `showTrending` on the lane is the only way to switch it off.
function renderAttentionNotice({ trending, updated, total }) {
  const one = total === 1;
  const parts = [];
  if (trending) parts.push(`${trending} trending`);
  if (updated) parts.push(`${updated} updated`);
  return html`<div class="ap-infobox main has-title research-feed__notice" role="status">
    <i class="ap-icon-arrow-up" aria-hidden="true"></i>
    <div class="ap-infobox-content">
      <div class="ap-infobox-texts">
        <span class="ap-infobox-title">${total} ${one ? "Topic needs" : "Topics need"} your attention</span>
        <span class="ap-infobox-message"> ${raw(parts.join(" · "))} in this Topic feed. </span>
      </div>
      <button type="button" class="ap-button primary blue" data-feed-trending>
        <span>See Topics</span>
        <i class="ap-icon-arrow-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    // No gear in this cluster: the topbar renders one for this route (topbar.js)
    // and it opens /topic-feeds/settings — this feed's own sources form.
    if (event.target.closest("[data-feed-trending]"))
      return navigate(`/topic-feeds/${encodeURIComponent(laneId)}/attention`);

    if (event.target.closest("[data-feed-empty-settings]")) return navigate("/topic-feeds/settings");

    if (event.target.closest("[data-feed-resume]")) {
      toggleLanePause(laneId);
      return paint(target);
    }

    if (event.target.closest("[data-feed-filters]")) {
      view.panelOpen = !view.panelOpen;
      return paint(target);
    }
    const group = event.target.closest("[data-feed-group]");
    if (group) {
      const k = group.dataset.feedGroup;
      view.groups[k] = !view.groups[k];
      return paint(target);
    }
    if (event.target.closest("[data-feed-reset]")) {
      filters = defaultFilters();
      resetPaging();
      return paint(target);
    }
    // ── Brief actions ───────────────────────────────────────────────────
    // The card's own kebab. Shares `view.openMenu` with the (parked) split
    // button's key on purpose — one open menu at a time across the whole feed,
    // and the click-outside handler at the bottom of this file already closes it.
    const segBtn = event.target.closest("[data-feed-segment]");
    if (segBtn) {
      const next = segBtn.dataset.feedSegment;
      if (next === view.segment) return;
      view.segment = next;
      // The open article belongs to the segment you just left. Clearing it and
      // re-arming the auto-open means the new segment opens on ITS first topic,
      // which is what arriving at a list does everywhere else in this feature.
      view.articleId = null;
      view.articleAuto = false;
      resetPaging();
      return paint(target);
    }

    const moreBtn = event.target.closest("[data-brief-more]");
    if (moreBtn) {
      const id = moreBtn.dataset.briefMore;
      view.openMenu = view.openMenu === id ? null : id;
      return paint(target);
    }

    // Unlink clears the MARK only — the topic keeps its place in the feed, its
    // status and its row in the pillar's trail. Removing it from the pillar is a
    // separate action on the pillar page, and conflating them would let a click
    // in a feed quietly rewrite a pillar's condensed context.
    const link = event.target.closest("[data-brief-link]");
    if (link) {
      view.openMenu = null;
      openPillarPicker({ briefId: link.dataset.briefLink });
      return;
    }

    const unlink = event.target.closest("[data-brief-unlink]");
    if (unlink) {
      view.openMenu = null;
      const pillar = unlinkBrief(unlink.dataset.briefUnlink);
      // Same link on the way out: after unlinking, "what does that pillar hold
      // now?" is exactly the question the action answers.
      if (pillar) {
        showToast(`Unlinked from “${pillar.name}”`, {
          action: { label: "See Content pillar", onClick: () => navigate(`/pillar/${encodeURIComponent(pillar.id)}`) },
        });
      } else paint(target);
      return;
    }

    const menuBtn = event.target.closest("[data-brief-use-menu]");
    if (menuBtn) {
      const id = menuBtn.dataset.briefUseMenu;
      view.openMenu = view.openMenu === id ? null : id;
      return paint(target);
    }

    // "Use in chat" opens a NEW chat with the topic attached as a source — the
    // same thing it means from the starter card and the picker, so the phrase
    // does one job everywhere. It used to set the status and raise a snackbar,
    // which described a chat that never opened.
    //
    // Marking it Used stays: taking a topic into a chat IS using it, and the
    // status has to change before the navigation because this screen unmounts.
    const use = event.target.closest("[data-brief-use]");
    if (use) {
      view.openMenu = null;
      setStatus(use.dataset.briefUse, "used");
      openBriefInChat(use.dataset.briefUse);
      return;
    }

    // ─── PARKED: Add to strategy ─────────────────────────────────────────────
    // The way in. Uncomment to bring the flow back — the dialog it opens is still
    // in research-modals.js, and brief-card.js no longer emits data-brief-strategy
    // (see its own PARKED note), so that has to come back too.
    //
    // const strategy = event.target.closest("[data-brief-strategy]");
    // if (strategy) {
    //   view.openMenu = null;
    //   const lane = getLaneById(laneId);
    //   // Opens a confirmation. The status does NOT change here — only on confirm,
    //   // inside the modal. Flipping it on this click was a real bug.
    //   return openAddToStrategy({ briefId: strategy.dataset.briefStrategy, playbookId: lane?.playbookId });
    // }

    // The reroute. Writes through the store rather than into `view`, so the
    // correction survives a repaint and a remount — it is a fact about the topic
    // now, not a state of this screen.
    const ignore = event.target.closest("[data-brief-ignore]");
    if (ignore) {
      view.openMenu = null;
      return openIgnoreReason({ briefId: ignore.dataset.briefIgnore });
    }

    // The way back out of Ignore. No confirmation and no reason prompt: ignoring
    // asks for one because it is the decision that hides something, and undoing a
    // decision does not need to be argued for.
    //
    // The toast is the whole feedback. Un-ignoring from the DEFAULT filter makes the
    // card vanish from the list under the cursor — the topic is New now, and New is
    // what the feed shows, but the reader was looking at Ignored to find it. Saying
    // where it went is the difference between that and looking like a deletion.
    const unignore = event.target.closest("[data-brief-unignore]");
    if (unignore) {
      view.openMenu = null;
      const brief = unignoreBrief(unignore.dataset.briefUnignore);
      if (brief) showToast("Topic back on the list as New");
      return;
    }

    // ── The article opens IN THE PAGE, beside the list ──────────────────────
    // Not a modal (it blacks out the list you are comparing against) and no
    // longer the app's right panel either. The panel is a column of the SHELL
    // grid, so opening it narrowed everything in the content column — the lane
    // header and the type chips included, which made two pieces of page
    // furniture twitch every time an article was opened or closed.
    //
    // So the split moved inside the page instead: header and chips keep the full
    // width and never move, and only the region below them divides in two. This
    // is the catalogue's master–detail archetype, scoped to the part of the page
    // that is actually a list.
    //
    // Clicking the card whose article is already open closes it, so one target
    // works both ways.
    const research = event.target.closest("[data-brief-research]");
    if (research) {
      const id = research.dataset.briefResearch;
      // Animate only on closed → open. Same card = close; different card while
      // open = swap without the entrance.
      const wasOpen = !!view.articleId;
      if (view.articleId === id) {
        view.articleId = null;
      } else {
        view.articleEntering = !wasOpen;
        view.articleId = id;
      }
      return paint(target);
    }

    if (event.target.closest("[data-feed-article-close]")) {
      view.articleId = null;
      return paint(target);
    }

    // "See past versions of this article", from the article PANE. The same link in
    // the Full-article dialog is wired inside research-modals' own panel handler —
    // the markup is shared, the delegation root is not.
    // The past-versions link is gone (V1 scope), so its handler is too. It called
    // openVersionHistory({ briefId }) — still exported from research-modals and still
    // working, just unreachable. Restoring is this block plus the link.

    // "See all N posts", from the article PANE. Its twin in the Full-article dialog
    // is wired inside research-modals' own panel handler.
    const sourcesLink = event.target.closest("[data-brief-sources]");
    if (sourcesLink) {
      return openSourcePosts({ briefId: sourcesLink.dataset.briefSources });
    }

    // Picking a Playbook in the topbar. It writes the RAIL'S scope, not a local
    // field, so the switcher and this trigger can never say different things — see
    // renderPlaybookPicker. The scope subscription repaints and re-resolves which
    // feed is shown, so there is nothing to do here but write and close.
    // "Create a Playbook" from the picker's footer. It runs the SAME conversational
    // flow as the /contexts "New Playbook" CTA and the composer's own create row —
    // the integrated welcome-alt session — rather than inventing a third way to make
    // a Playbook. The only thing that differs between the three callers is returnTo,
    // which is where the recap sends you when it is done: here, back to this feed.
    const pbCreate = event.target.closest("[data-feed-playbook-create]");
    if (pbCreate) {
      event.preventDefault();
      const details = pbCreate.closest("[data-feed-playbook]");
      if (details) details.open = false;
      try {
        window.sessionStorage.setItem("welcomeAltIntegrated", "1");
        window.sessionStorage.setItem("welcomeAltReturnTo", "/topic-feeds");
      } catch {
        /* ignore — a private-mode sessionStorage failure must not block the flow */
      }
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: "/topic-feeds" });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
      return;
    }

    const pbPick = event.target.closest("[data-feed-playbook-pick]");
    if (pbPick) {
      const details = pbPick.closest("[data-feed-playbook]");
      if (details) details.open = false;
      setActivePlaybook(pbPick.dataset.feedPlaybookPick);
      return;
    }

    // The explicit half of the infinite load — same path the observer takes, so
    // the two can never disagree about what a page is or how long it takes.
    if (event.target.closest("[data-research-more-load]")) {
      return loadMore(target);
    }
  };
  target.addEventListener("click", boundClick);
  // …and again on the topbar, because the Filters / Export / Settings cluster
  // now renders there, outside #app. Same handler, so the three actions cannot
  // drift apart depending on where they were pressed.
  topbarEl = document.getElementById("topbar");
  if (topbarEl) topbarEl.addEventListener("click", boundClick);

  boundInput = (event) => {
    const box = event.target.closest("[data-feed-filter]");
    if (!box) return;
    const field = box.dataset.feedFilter;
    const val = box.value;
    const set = new Set(filters[field]);
    if (box.checked) set.add(val);
    else set.delete(val);
    filters = { ...filters, [field]: [...set] };
    // Back to page one. The count is a position in THIS filtered list, so carrying
    // it across a filter change would show a widened list already three pages deep
    // — the user narrows to see less and would get more.
    resetPaging();
    paint(target);
  };
  target.addEventListener("input", boundInput);
  target.addEventListener("change", boundInput);
  // …and on the topbar, for the same reason boundClick is bound there: the filter
  // panel renders inside the topbar cluster, outside #app, so a change event from
  // one of its checkboxes never reached a listener on #app. Ticking a source did
  // nothing at all — the list did not narrow and the trigger's count stayed empty.
  if (topbarEl) {
    topbarEl.addEventListener("input", boundInput);
    topbarEl.addEventListener("change", boundInput);
  }

  // Close the filters panel and any open Use-in-chat menu on an outside click.
  // Bound on document because the click that dismisses them lands outside the
  // panel by definition.
  boundDocClick = (event) => {
    if (!view.panelOpen && !view.openMenu) return;
    // The card's kebab and its menu are exempt for the same reason .topics-use
    // was: the click that OPENS a menu is itself an outside click by this
    // handler's definition, so without the exemption the menu opens and closes in
    // the same event.
    if (
      event.target.closest(".research-filters") ||
      event.target.closest(".topics-use") ||
      event.target.closest(".topics-card__more") ||
      event.target.closest(".topics-card__more-menu")
    )
      return;
    view.panelOpen = false;
    view.openMenu = null;
    paint(target);
  };
  document.addEventListener("click", boundDocClick);

  // Re-measure the pane on resize. The scroll half of this is bound in paint(),
  // because paint() replaces the scroller and a listener attached here would be
  // detached from the document on the first repaint. Window-level events like this
  // one survive, so they belong here.
  boundResize = () => sizeArticlePane(target);
  window.addEventListener("resize", boundResize);
}
