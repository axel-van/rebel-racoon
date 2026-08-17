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
import { renderTopbar, setTopbarActions, clearTopbarActions } from "../components/topbar.js?v=440";
import { isFlagOn } from "../feature-flags.js?v=22";
import { renderBriefCard, renderUseButtons } from "../components/brief-card.js?v=58";
import {
  openIgnoreReason,
  openVersionHistory,
  openSourcePosts,
  // PARKED with the handler below — kept imported so restoring is one uncomment.
  openAddToStrategy,
  renderResearchArticle,
  // researchArticleSub went with the pane's subtitle — the card's source row says
  // the same thing. Still exported and still used by the Full-research dialog.
} from "../components/research-modals.js?v=126";
import { openBriefInChat } from "../brief-flow.js?v=32";
import { showToast } from "../components/toast.js?v=21";
import { unlinkBrief, pillarForBrief, subscribe as subscribePillars } from "../pillars-store.js?v=7";
import { getActivePlaybookId, subscribe as subscribeScope } from "../active-playbook.js?v=28";
import { open as openPillarPicker } from "../components/pillar-picker-modal.js?v=19";
import { getLaneById, getLanes, toggleLanePause } from "../research-store.js?v=46";
import {
  getBriefById,
  briefTitle,
  getBriefsForLane,
  groupBriefsByAge,
  attentionCountsForLane,
  defaultFilters,
  narrowedGroupCount,
  setStatus,
  subscribe as subscribeBriefs,
} from "../briefs-store.js?v=59";
import { RESEARCH_SOURCES, REVIEW_STATUSES, findResearchSource, findCadence } from "../research-catalog.js?v=20";
import { getContextById } from "../contexts-store.js?v=76";

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

  const fresh = parseHashParams().get("fresh") === "1";
  if (fresh) {
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
  setTopbarActions(renderTopbarActions(narrowedGroupCount(filters)), renderSegments());
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
  const article = view.articleId ? getBriefById(view.articleId) : null;
  if (view.articleId && !article) view.articleId = null;

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
  if (anyAtAll) {
    return html`<p class="research-feed__empty muted">
      No Topics match these filters. Try widening them, or reset to the defaults.
    </p>`;
  }
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
      ${raw(narrowed ? html`<span class="research-filters__badge">${narrowed}</span>` : "")}
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
function renderFilterPanel() {
  return html`<div class="research-filters__panel" data-feed-panel>
    ${raw(
      renderGroup("status", "Topic status", REVIEW_STATUSES, filters.statuses, "statuses") +
        // Sources renders WITHOUT its glyphs, unlike Topic status. The difference is
        // whether the row has a mapping to teach: a card shows its status as a BARE
        // icon, so the filter row is the only place that glyph is ever named — while
        // a card's source badge already carries the word beside the glyph, leaving
        // the filter to repeat a pairing the reader has met on every card. Eight of
        // them down the panel also blunt the status icons, which do need reading.
        // The icons stay in the catalogue: the source cards on the form use them.
        renderGroup("sources", "Sources", RESEARCH_SOURCES, filters.sources, "sources", {
          icons: false,
        }),
    )}
    <div class="research-filters__reset-row">
      <button type="button" class="research-filters__reset" data-feed-reset>
        <i class="ap-icon-refresh" aria-hidden="true"></i><span>Reset filters</span>
      </button>
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
function renderGroup(key, label, options, selected, field, { icons = true } = {}) {
  const open = view.groups[key];
  // Does this group MIX iconless options with iconed ones? Only Topic status does,
  // now that New carries no glyph, and without this its label would sit a glyph's
  // width to the left of the other three — four checkboxes with a ragged label
  // column read as a rendering bug rather than as a status without a marker.
  // Groups where NO option has an icon (Topic type) reserve nothing, so they keep
  // their tighter row.
  const mixedIcons = icons && options.some((o) => o.icon) && options.some((o) => !o.icon);
  return html`<section class="research-filters__group">
    <button
      type="button"
      class="research-filters__group-head"
      data-feed-group="${key}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span>${label}</span>
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
      <i class="${open ? "ap-icon-chevron-up" : "ap-icon-chevron-down"}" aria-hidden="true"></i>
    </button>
    ${raw(
      open
        ? html`<div class="research-filters__options">
            ${raw(
              options
                .map(
                  (o) =>
                    html`<label class="research-filters__option">
                      <input
                        type="checkbox"
                        class="ap-checkbox"
                        data-feed-filter="${escapeAttr(field)}"
                        value="${escapeAttr(o.id)}"
                        ${raw(selected.includes(o.id) ? "checked" : "")}
                      />
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
      if (pillar) showToast(`Unlinked from “${pillar.name}”`);
      else paint(target);
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
    const versionsLink = event.target.closest("[data-brief-versions]");
    if (versionsLink) {
      return openVersionHistory({ briefId: versionsLink.dataset.briefVersions });
    }

    // "See all N posts", from the article PANE. Its twin in the Full-article dialog
    // is wired inside research-modals' own panel handler.
    const sourcesLink = event.target.closest("[data-brief-sources]");
    if (sourcesLink) {
      return openSourcePosts({ briefId: sourcesLink.dataset.briefSources });
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
