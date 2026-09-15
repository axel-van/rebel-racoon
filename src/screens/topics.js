// /topics — the Topic Feed: a queue you triage, with the article beside it.
//
// ── Scope ──────────────────────────────────────────────────────────────────
// One Playbook at a time. WHICH one depends on one flag, and the two answers
// were both written against the same failure.
//
// Flag OFF: `?pb=`. The version this was ported from had a module that owned the
// app's scope, persisted it, and was written to by a select sitting in this
// page's filter bar — so a control that promised a page filter silently
// re-scoped the sidebar, the next new chat and the composer's picker. `?pb=`
// says the same thing, survives a link, and stops at this screen. The settings
// page reads the same param, so the scope survives the round trip both ways.
//
// Flag `playbookWorkspace` ON: the ACTIVE Playbook, and `?pb=` is not read at
// all. What was wrong with the port was not that the scope was global, it was
// that it was HIDDEN behind a page control; a permanent switcher at the top of
// the rail is the other half of that bargain. This page's own scope select then
// own scope select then disappears entirely — see the toolbar.
//
// ── The layout ─────────────────────────────────────────────────────────────
// Master–detail, and the split is measured with a @container query on the row
// itself rather than a media query: the sidebar collapses and the right panel
// overlays, so viewport width never tells you content width.
//
// The list SHRINKS when the article opens. That is the fix for the port's worst
// bug: with the list pinned at a fixed 666px the article had nowhere to go under
// ~1180px of content width, so at 1440px of viewport — a 14" laptop — clicking a
// card rendered the article 1900px below the fold and nothing appeared to happen.
//
// ── Paging ─────────────────────────────────────────────────────────────────
// Ten at a time, and the last page's sentinel loads the next when it scrolls into
// view. There is an explicit Load more too, and both do exactly the same thing —
// an infinite list with no button is unusable by keyboard.

import { html, raw, escapeAttr } from "../utils.js?v=1188";
import { navigate, getPath } from "../router.js?v=1188";
import { isFlagOn } from "../feature-flags.js?v=1188";
import { parseHashParams, setHashQuery } from "../url-state.js?v=1188";
import { renderTopbar } from "../components/topbar.js?v=1188";
import { showToast } from "../components/toast.js?v=1188";
import { renderEmptyState } from "../components/empty-state.js?v=1188";
import { getContexts, getContextById, getDefaultContext } from "../contexts-store.js?v=1188";
import { getActivePlaybook, isWorkspaceMode, subscribe as subscribeScope } from "../active-playbook.js?v=1188";
import { getFeedForPlaybook, subscribe as subscribeFeeds } from "../topic-feeds-store.js?v=1188";
import {
  getTopicsForFeed,
  groupTopicsByAge,
  getTopicById,
  topicTitle,
  defaultFilters,
  narrowedGroupCount,
  ignoreTopic,
  unignoreTopic,
  subscribe as subscribeTopics,
} from "../topics-store.js?v=1188";
import {
  TOPIC_SOURCES,
  TOPIC_KINDS,
  MARKED_STATUS_IDS,
  findTopicState,
  findTopicSource,
  findCadence,
  isLiveSource,
} from "../topics-catalog.js?v=1188";
import { renderTopicCard } from "../components/topic-card.js?v=1188";
import { renderTopicArticle, renderTopicHeader, renderTopicActions } from "../topic-article.js?v=1188";
import { openIgnoreReason } from "../components/topic-ignore-modal.js?v=1188";
import { openTopicHistory } from "../components/topic-history-modal.js?v=1188";
import { useTopicInChat } from "../topic-flow.js?v=1188";

const PAGE = 10;
// Long enough to read the scanning line, short enough that nobody waits for it
// in a demo. Same number the magazine used.
const SCAN_MS = 1600;

let view = null;
let unsubscribe = null;
let unsubscribeFeeds = null;
let unsubscribeScope = null;
let boundRoot = null;
let boundChange = null;
let boundClick = null;
let boundKeydown = null;
let observer = null;

function freshView() {
  return {
    filters: defaultFilters(),
    page: 1,
    openTopicId: null,
    // The first Topic's article opens by itself ONCE. After the reader closes
    // it, it must not reopen on its own — this is the latch that guarantees it.
    autoOpened: false,
    menuTopicId: null,
    // The pane header's kebab. Its own flag rather than menuTopicId: that one is
    // keyed by Topic id, so reusing it would open the open Topic's CARD menu in
    // the list at the same time.
    paneMenuOpen: false,
    filtersOpen: false,
    // The three multi-selects inside the Filters panel (Topics, Marked as,
    // Sources). Held in `view` because a pick repaints the whole panel, so a
    // natively-open <details> would collapse on every tick — see renderMultiSelect.
    kindOpen: false,
    markedOpen: false,
    sourcesOpen: false,
    // Which article the last paint drew, so the pane's scroll offset is kept
    // across a repaint of the same Topic and dropped when the reader opens
    // another one.
    paintedTopicId: null,
    scanning: true,
    loadingMore: false,
    // Set for exactly one paint, by the click that opened an article. When the
    // split has collapsed to a column the pane renders BELOW the list, which on
    // a long list is below the fold — so the click would look like it did
    // nothing, which is the whole bug this port had to fix. Scrolling it into
    // view is the honest answer for the stacked case; side by side the pane is
    // already visible and `block: "nearest"` then does nothing.
    revealPane: false,
  };
}

// ── Scope resolution ───────────────────────────────────────────────────────
// Workspace mode: the feed reads the ACTIVE Playbook and `?pb=` stops being
// consulted at all — a page-level scope and an app-level scope that could
// disagree is the whole problem the switcher removes. Otherwise the old rule
// stands: `?pb=` if it names a real Playbook, else the default, so a stale link
// falls back rather than emptying the screen with no explanation.
function scopedPlaybook() {
  if (isWorkspaceMode()) return getActivePlaybook();
  const wanted = parseHashParams().get("pb");
  return (wanted && getContextById(wanted)) || getDefaultContext() || getContexts()[0] || null;
}

export function renderTopics(_params, target) {
  // Gated here rather than at the route table, so a stale deep link bounces to
  // the app's own landing rather than rendering a dead screen.
  if (!isFlagOn("topicFeed")) {
    navigate("/");
    return;
  }
  renderTopbar();
  const pb = scopedPlaybook();

  // Arriving on a link to one Topic: the article opens with the list, and the
  // status filter widens to EVERY state for that visit. An ignored Topic is not
  // in the default view, so without this the article would open onto a card the
  // list does not show.
  const deepTopicId = parseHashParams().get("topic");
  const deepTopic = deepTopicId ? getTopicById(deepTopicId) : null;

  teardown();
  view = freshView();
  if (deepTopic) {
    view.openTopicId = deepTopic.id;
    view.autoOpened = true;
    // Widen so a linked Topic opens whatever it carries. Kind stays empty (both
    // lanes), and every answered status is ticked so an ignored or used linked
    // Topic still shows. `new` passes anyway as the baseline.
    view.filters = { ...view.filters, kind: [], marked: MARKED_STATUS_IDS.slice() };
    // No scanning state on a Topic link: the reader came for one thing and a
    // working state would be theatre between them and it.
    view.scanning = false;
  }

  paint(target, pb);
  bind(target);

  if (view.scanning) {
    window.setTimeout(() => {
      if (!view) return;
      view.scanning = false;
      paint(target, scopedPlaybook());
    }, SCAN_MS);
  }

  unsubscribe = subscribeTopics(() => paint(target, scopedPlaybook()));
  unsubscribeFeeds = subscribeFeeds(() => paint(target, scopedPlaybook()));
  // Switching brand in the rail re-points this screen in place (there is no
  // navigation to re-run it). The view is reset rather than repainted: the open
  // article, the page and the narrowing all belong to the feed just left. No
  // scanning state either — the reader asked for another brand, not for a
  // refresh, and only the mount path has a timer to clear it.
  unsubscribeScope = subscribeScope(() => {
    view = freshView();
    view.scanning = false;
    paint(target, scopedPlaybook());
  });
  return teardown;
}

function teardown() {
  if (unsubscribe) (unsubscribe(), (unsubscribe = null));
  if (unsubscribeFeeds) (unsubscribeFeeds(), (unsubscribeFeeds = null));
  if (unsubscribeScope) (unsubscribeScope(), (unsubscribeScope = null));
  if (observer) (observer.disconnect(), (observer = null));
  // ⚠️ The listeners have to come OFF, not just be forgotten.
  //
  // This used to null `boundRoot` and leave them attached, and #app outlives the
  // screen — so every remount added a second pair on the same node. Two click
  // handlers made every toggle cancel itself: the first set `menuTopicId` and
  // repainted, the second ran on its own closure, read the value the first had
  // just written and toggled it straight back. The kebab and the Filters panel
  // both stopped opening, and only on the SECOND visit to the screen, which is
  // why it survived the first pass. Same shape screens/topics-settings.js uses.
  if (boundRoot) {
    if (boundChange) boundRoot.removeEventListener("change", boundChange);
    if (boundClick) boundRoot.removeEventListener("click", boundClick);
  }
  if (boundKeydown) document.removeEventListener("keydown", boundKeydown);
  boundRoot = null;
  boundChange = null;
  boundClick = null;
  boundKeydown = null;
  view = null;
}

// ── Render ─────────────────────────────────────────────────────────────────

function paint(target, pb) {
  if (!view) return;
  // Scroll position survives every action: using or ignoring a Topic halfway
  // down the list must not throw the reader back to the top.
  //
  // TWO offsets, because there are two possible scrollers. Side by side the list
  // column and the reading pane each scroll on their own — that independence is
  // most of what makes this read as a reader rather than as a page — and when the
  // container query collapses the split to one column the screen root scrolls
  // instead. Restoring both is cheaper than asking which is live: setting
  // scrollTop on an element that is not scrolling is a no-op.
  const prev = {
    root: target.querySelector(".topics-view")?.scrollTop || 0,
    list: target.querySelector(".topics-view__list")?.scrollTop || 0,
    pane: target.querySelector(".topics-view__pane-body")?.scrollTop || 0,
  };
  // The pane's own offset is kept only while the SAME article stays open —
  // opening another Topic has to start at the top of it.
  const sameArticle = view.openTopicId && view.openTopicId === view.paintedTopicId;
  view.paintedTopicId = view.openTopicId;

  target.innerHTML = html`<section class="screen topics-view">${raw(renderPage(pb))}</section>`;

  const root = target.querySelector(".topics-view");
  if (root && prev.root) root.scrollTop = prev.root;
  const list = target.querySelector(".topics-view__list");
  if (list && prev.list) list.scrollTop = prev.list;
  const paneBody = target.querySelector(".topics-view__pane-body");
  if (paneBody && sameArticle && prev.pane) paneBody.scrollTop = prev.pane;

  if (view.revealPane) {
    view.revealPane = false;
    revealPane(root, target.querySelector(".topics-view__pane"));
  }

  watchSentinel(target, pb);
}

// Bring the article into view, but only when it is actually out of it.
//
// Deliberately arithmetic rather than scrollIntoView(): "nearest" declined to
// move a pane 1700px down the page (the element is nearly as tall as the
// scrollport, so the browser reads it as already nearest), and "smooth" raced
// the next repaint — a store notification lands within the animation and the
// scroll was silently abandoned. Setting scrollTop is deterministic.
//
// Only ever does anything once the split has COLLAPSED. Side by side the pane is
// its own scrollport, always on screen, and there is nothing to reveal — the
// visibility test below is what establishes that, so one rule covers both layouts
// and cannot disagree with what the container query decided.
function revealPane(scroller, pane) {
  if (!scroller || !pane) return;
  const scRect = scroller.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const hidden = paneRect.top >= scRect.bottom - 40 || paneRect.bottom <= scRect.top + 40;
  if (!hidden) return;
  // Its top edge just under the head, not flush against it — a pane starting at
  // the exact top of the scrollport reads as a new screen rather than as
  // something that opened below the list.
  scroller.scrollTop += paneRect.top - scRect.top - 16;
}

function renderPage(pb) {
  const feed = pb ? getFeedForPlaybook(pb.id) : null;
  // One list. The two tabs are gone — `later` is a state in the filter now, so a
  // second control that could disagree with the filter no longer exists.
  const all = feed ? getTopicsForFeed(feed.id, view.filters) : [];

  // The first Topic's article opens by itself, ONCE per visit: the reader lands
  // on a master–detail screen and an empty right-hand half is a screen that
  // looks unfinished. The latch is what makes it once — closing it must not be
  // undone by the next repaint, and there are many (a filter change, a triage,
  // a store notification).
  if (!view.scanning && !view.autoOpened && all.length) {
    view.autoOpened = true;
    view.openTopicId = all[0].id;
  }

  // Unfiltered, so "the filter is hiding everything" can be told apart from
  // "this feed has not found anything yet". Two different states, two different
  // ways out.
  const total = feed ? getTopicsForFeed(feed.id).length : 0;

  const shown = all.slice(0, view.page * PAGE);
  const more = all.length - shown.length;

  const open = view.openTopicId ? getTopicById(view.openTopicId) : null;
  // The pane only renders for a Topic still in the list. Ignoring the one you
  // are reading takes it out of the default view, and an article hanging beside
  // a list that no longer contains its card is the pane contradicting the list.
  const openInList = open && shown.some((t) => t.id === open.id) ? open : null;

  // ── One shell, two shapes ───────────────────────────────────────────────
  // With Topics to show, the reader: a list column beside a reading pane, each
  // its own card. With nothing found, or the filter excluding everything, the
  // split would be an empty column beside an empty pane, so the state takes the
  // whole width instead. A reader with nothing in it is not a reader.
  //
  // ⚠️ SCANNING is NOT one of those. It used to be, and that is what put a 12px
  // spinner alone in the middle of the full-width block. Something IS coming and
  // its shape is known, so the wait keeps the split and draws it in ghosts — a
  // skeleton that does not pre-draw the layout is just a spinner with extra
  // steps. The dead ends have nothing to pre-draw, which is the difference.
  const empty = !view.scanning && !shown.length;

  return html`
    ${raw(renderToolbar(pb, feed))}
    <div class="topics-view__body">
      ${raw(
        empty
          ? html`<div class="topics-view__blank">${raw(renderList(shown, more, total, view.scanning, feed))}</div>`
          : html`<div class="topics-view__split">
              <section class="topics-view__list-col" aria-label="Topics">
                <div class="topics-view__list">${raw(renderList(shown, more, total, view.scanning, feed))}</div>
              </section>
              ${raw(
                view.scanning ? renderPaneSkeleton() : openInList ? renderPane(openInList) : renderPanePlaceholder(),
              )}
            </div>`,
      )}
    </div>
  `;
}

// ── Row 1 · the page header ────────────────────────────────────────────────
// The name, and the way to this brand's settings. Nothing else.
// ── The toolbar — and the only page-level row this screen draws ───────────
// What narrows the list, on the LEFT — the product's own arrangement in Drafts
// ("Creator | Select", "Labels | Select", "Filters") and Analytics ("Filters",
// then the date range) — and the settings cog LAST on the right, which is the
// one invariant every product header keeps without exception.
//
// ── Why there is no drawn <h1> ────────────────────────────────────────────
// There was one, for one commit, on a row of its own above this. It printed
// "Topic Feed" 40px under the app topbar, which prints "Topic Feed" for this
// route already: the same words twice, on a row that held nothing else but the
// cog. The product's header pattern does open with a title row — but in THIS
// app the shell owns that row, so a page that draws its own is not following
// the pattern, it is duplicating it.
//
// The rule the app actually keeps: the topbar names the route, and a screen
// draws its own title only where the topbar has CEDED it to a back control
// (/playbook/:id, /topics/settings). /contexts is the apparent exception and is
// not one — its head row carries a data-bearing subtitle, a search field and a
// primary CTA, so the title is one element of four rather than a row's whole
// reason to exist.
//
// Dropping it costs nothing for screen readers either: the topbar's
// .app-topbar__title IS an <h1>, so the document goes from two to one.
function renderToolbar(pb, feed) {
  const badge = narrowedGroupCount(view.filters);

  // The real DS Select — a <details>/<summary> dropdown, never a bare native
  // <select>.
  const pbOptions = getContexts()
    .map((c) => {
      const on = !!pb && c.id === pb.id;
      return html`<div
        class="ap-select-option${raw(on ? " selected" : "")}"
        data-topic-scope-pick="${escapeAttr(c.id)}"
        role="option"
        aria-selected="${on ? "true" : "false"}"
      >
        <span class="ap-select-option-text">${c.name}</span>
        ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");

  return html`<div class="topics-view__toolbar">
    <!-- The label goes INSIDE the control, via the DS's own
         .ap-select-inline-label — the "Creator | Select" shape the product uses
         in four of its five toolbars, and the one session.js already renders for
         the composer's Playbook picker. It was a bare select for one commit,
         which said nothing about what it scopes, and a <label> stacked above it
         before that, which is form chrome in a toolbar. -->
    <!-- The scope select says which Playbook this feed reads for. The cog that
         configures that Playbook's listening now lives at the far right of the
         topbar (components/topbar.js), the app's canonical home for a page-level
         action. -->
    ${raw(
      // ⚠️ Workspace mode: no scope control here AT ALL. The rail re-points this
      // page and prints the brand permanently, so this select could only be the
      // disabled half of itself — and a greyed-out field in a bar whose other
      // control (Filters) is live reads as something broken rather than as
      // information. Filters keeps its place: the toolbar is a `flex: 0 0 auto`
      // row, so it just loses a sibling.
      isWorkspaceMode()
        ? ""
        : html`<div class="topics-view__scope-group">
            <div class="topics-view__scope">
              <details class="ap-select" id="topicScope" data-topic-scope>
                <summary class="ap-select-trigger" title="Which Playbook this feed reads for">
                  <span class="ap-select-inline-label">Playbook</span>
                  <span class="ap-select-value">${raw(pb ? escapeAttr(pb.name) : "Choose a Playbook")}</span>
                  <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
                </summary>
                <div class="ap-select-dropdown" role="listbox" aria-label="Playbook">
                  <div class="ap-select-options">${raw(pbOptions)}</div>
                </div>
              </details>
            </div>
          </div>`,
    )}

    <!-- LABELLED, with its count inline. The product never ships this as an icon
         button — Inbox, Drafts and Analytics all write the word and put the
         number beside it. It was icon-only with an absolutely-positioned pip for
         one commit, which made the one control that says how much of the list is
         hidden the hardest one to find. -->
    <div class="topics-view__filters">
      <button
        type="button"
        class="ap-button stroked grey"
        data-topic-filters-toggle
        aria-haspopup="true"
        aria-expanded="${view.filtersOpen ? "true" : "false"}"
      >
        <i class="ap-icon-filter"></i><span>Filters</span>
        ${raw(badge ? html`<span class="ap-counter normal blue">${badge}</span>` : "")}
      </button>
      ${raw(view.filtersOpen ? renderFilters() : "")}
    </div>
  </div>`;
}

// ── The Filters panel — three groups, the product's Filter Dropdown ────────
// A reversal, made on purpose and with the docs (AC-SEG, AC-FILT) rewritten to
// match: the flat six-state list is gone. The panel is three grouped controls,
// each answering one question, each its own field in the filter:
//
//   Topics    a multi-select on `kind`, EMPTY at rest — both lanes show in one
//             list (To review, the active lane, and For later, the parked one).
//             Ticking a lane narrows to it; a For-later Topic is told apart in the
//             mixed list by its own blue "For later" chip, not by a card change.
//             ⚠️ This replaced a one-lane-at-a-time RADIO (`git log -S
//             renderKindRadio`) and, before it, tabs above the list (`renderTabs`)
//             — the arbitration changed: read both by default, narrow if you want.
//   Marked as a multi-select on the ANSWERED statuses — Already used / Ignored —
//             opted into on top of the To-review baseline the list already shows.
//   Sources   a multi-select on the listening source, live ones tickable and the
//             rest "Coming soon".
//
// ⚠️ TRENDING / UPDATED ARE NOT HERE. They are card chips, not filter rows: a
// signal is a claim about NOW, not a lane, and there is no "show me only what is
// spiking". Dropping them from the filter is what lets the ignored rule fall out
// for free — the predicate never reads a signal, so one can never resurface an
// ignored Topic (topics-store matchesFilters). `git log -S renderStateSelect` has
// the flat-filter version; `git log -S renderTabs` the tabbed one before it.
//
// The SELECTION shows as chips in each multi-select's trigger, echoing what the
// reader sees elsewhere — the state's own pill for "Marked as", the source's own
// provenance badge for "Sources".
function renderFilters() {
  return html`<div class="ap-filter-dropdown topics-view__filter-panel" role="menu" aria-label="Filter topics">
    <div class="ap-filter-dropdown__content">
      ${raw(
        renderFilterLeaf("Topics", "Both lanes show by default — narrow to one if you want.", renderKindSelect(), true),
      )}
      ${raw(
        renderFilterLeaf("Marked as", "Topics you have already answered keep their mark.", renderMarkedSelect(), true),
      )}
      ${raw(renderFilterLeaf("Sources", "Where I found the topic.", renderSourceSelect(), false))}
    </div>
    <div class="ap-filter-dropdown__footer">
      <div class="ap-filter-dropdown__footer--apply">
        <button type="button" class="ap-button ghost blue" data-topic-filters-reset>Reset filters</button>
      </div>
    </div>
  </div>`;
}

// One leaf: a bold group title, a one-line description, then the control. The
// description is the panel's own voice — it says what the group narrows, which a
// bare heading cannot.
function renderFilterLeaf(title, hint, bodyHtml, withBorder) {
  return html`<div class="ap-filter-leaf${raw(withBorder ? " with-border-bottom" : "")}">
    <div class="ap-filter-leaf__header ap-filter-leaf__expanded">
      <span class="ap-filter-leaf__title">${title}</span>
    </div>
    <div class="ap-filter-leaf__content">
      <p class="topics-view__filter-hint">${hint}</p>
      ${raw(bodyHtml)}
    </div>
  </div>`;
}

// ── Topics — a multi-select, EMPTY = both lanes ────────────────────────────
// The same DS Select the other two groups use, so all three filters read one way.
// Empty at rest, which the predicate treats as "no lane constraint" (both show).
// The trigger chips are neutral grey labels: a lane is a filter facet, not one of
// the state pills a Topic wears, so it takes no tone of its own here.
function renderKindSelect() {
  const picked = view.filters.kind || [];
  const chips = TOPIC_KINDS.filter((k) => picked.includes(k.id))
    .map((k) => html`<span class="ap-tag grey"><span>${k.label}</span></span>`)
    .join("");
  const options = TOPIC_KINDS.map((k) => filterCheckbox("kind", k.id, k.label, picked.includes(k.id))).join("");
  return renderMultiSelect("kind", view.kindOpen, chips, "Both lanes", options, "lanes");
}

// ── The two multi-selects — the DS Select, chips in the trigger ────────────
// A `<details>`/`<summary>` disclosure, the same primitive the toolbar's Playbook
// picker uses — no managed overlay, nothing for modal-coordinator to arbitrate.
// The DS `.ap-select-trigger` already styles `.ap-tag` chips inside it, so the
// selection reads as chips for free.
//
// ⚠️ THE OPEN FLAG IS IN `view`, not left to `<details>`. Ticking an option fires
// `change`, which repaints the panel, so a natively-open `<details>` would
// collapse on every pick. `view.markedOpen` / `view.sourcesOpen` survive the
// repaint the way `view.filtersOpen` does, and the summary's click is intercepted
// so the native toggle cannot desync from it.
//
// ⚠️ `.ap-select-dropdown` is `position: absolute`; the panel content is set to
// `overflow: visible` in topics.css so the LOWER select (Sources) is not clipped
// by a scroller — there are only three short groups, so the panel never needs to
// scroll and an open menu is free to overlay whatever sits below the panel.
function renderMultiSelect(id, open, chipsHtml, placeholder, optionsHtml, label) {
  return html`<details class="ap-select topics-view__ms" ${raw(open ? "open" : "")}>
    <summary class="ap-select-trigger" data-topic-ms-toggle="${escapeAttr(id)}" title="Choose ${escapeAttr(label)}">
      <span class="topics-view__ms-chips">
        ${raw(chipsHtml || html`<span class="ap-select-placeholder">${placeholder}</span>`)}
      </span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="group" aria-label="${escapeAttr(label)}">
      <div class="ap-select-options">${raw(optionsHtml)}</div>
    </div>
  </details>`;
}

// Marked as: the two answered statuses, each shown in the trigger as the STATE'S
// OWN pill — the green Already used / grey Ignored a card wears — so the filter
// and the card name a state the same way. Order follows the vocabulary.
function renderMarkedSelect() {
  const picked = view.filters.marked || [];
  const chips = MARKED_STATUS_IDS.filter((id) => picked.includes(id))
    .map((id) => {
      const st = findTopicState(id);
      return html`<span class="ap-tag ${raw(st.tone)}"
        ><i class="${raw(st.icon)}" aria-hidden="true"></i><span>${st.label}</span></span
      >`;
    })
    .join("");
  const options = MARKED_STATUS_IDS.map((id) => {
    const st = findTopicState(id);
    return filterCheckbox("marked", id, st.label, picked.includes(id));
  }).join("");
  return renderMultiSelect("marked", view.markedOpen, chips, "None", options, "marked statuses");
}

// Sources: each selected source shown as its provenance badge + name — the same
// pip the card carries — so a source reads the same here as everywhere. NOT a
// blue chip (blue is the interactive colour and a source name is static data);
// the badge keeps the source's own accent. The not-yet-built ones are disabled
// with a grey "Coming soon" tag.
function renderSourceSelect() {
  const picked = view.filters.sources || [];
  const chips = TOPIC_SOURCES.filter((s) => picked.includes(s.id))
    .map(
      (s) =>
        html`<span class="topics-view__ms-source"
          ><span class="topic-badge topic-badge--${raw(s.accent)}" aria-hidden="true"
            ><i class="${raw(s.icon)}"></i></span
          ><span>${s.name}</span></span
        >`,
    )
    .join("");
  const options = TOPIC_SOURCES.map((s) =>
    filterCheckbox("source", s.id, s.name, picked.includes(s.id), !isLiveSource(s.id)),
  ).join("");
  return renderMultiSelect("sources", view.sourcesOpen, chips, "No sources", options, "sources");
}

// One checkbox row inside a multi-select's dropdown. `.ap-select-option` gives the
// row its height/padding; `.ap-checkbox-container` draws the box — and it only
// works on a DIRECT child <i>, so the two compose on one element. The <i> stays
// BARE: an `ap-icon-*` there does not add a glyph, it masks the box away. A
// disabled source carries its grey "Coming soon" tag at the row's end.
function filterCheckbox(group, id, label, checked, disabled = false) {
  return html`<label class="ap-select-option ap-checkbox-container${raw(disabled ? " disabled" : "")}">
    <input
      type="checkbox"
      data-topic-filter="${escapeAttr(group)}"
      value="${escapeAttr(id)}"
      ${raw(checked ? "checked" : "")}
      ${raw(disabled ? "disabled" : "")}
    />
    <i aria-hidden="true"></i>
    <span class="ap-select-option-text">${label}</span>
    ${raw(disabled ? html`<span class="ap-tag grey mini">Coming soon</span>` : "")}
  </label>`;
}

// ── Waiting: GHOSTS, not a spinner ─────────────────────────────────────────
// A skeleton's whole job is to pre-draw the layout that is arriving, so the
// screen does not jump when it lands. This was an `.ap-loader` and one line of
// text, centred in a block that took the WHOLE reader — a 12px spinner alone in
// ~1100x700 of white, and then the two-column reader appeared around it.
//
// So the wait now renders the reader itself: ghost cards down the list column,
// a ghost article beside them, both in the real frames at the real widths. The
// status line goes where the first age separator will be ("Last 7 days"), which
// is the one slot that is genuinely free.
//
// Five cards, not "as many as are coming": the count is unknown while the scan
// runs, and a skeleton that guesses is a skeleton that lies.
const GHOST_BARS = [
  { w: "38%", cls: "topic-ghost__bar--meta" },
  { w: "92%", cls: "topic-ghost__bar--head" },
  { w: "64%", cls: "topic-ghost__bar--head" },
  { w: "100%", cls: "" },
  { w: "78%", cls: "" },
];

function renderGhostCard(i) {
  const bars = GHOST_BARS.map(
    (b) => html`<span class="topic-ghost__bar ${raw(b.cls)}" style="width:${raw(b.w)}"></span>`,
  ).join("");
  // The stagger is what stops five identical bars pulsing as one block.
  return html`<div class="topic-ghost" style="--ghost-delay: ${raw(String(i * 0.09))}s">${raw(bars)}</div>`;
}

function renderListSkeleton() {
  const cards = [0, 1, 2, 3, 4].map(renderGhostCard).join("");
  return html`<section class="topics-view__group">
    <h2 class="topics-view__group-label topics-view__scan-note">Reading what your competitors published…</h2>
    <div class="topics-view__group-cards">${raw(cards)}</div>
  </section>`;
}

// The pane's half of the wait. No action bar: there is nothing to act on yet, and
// a header of live verbs over a ghost article would be offering to use a Topic
// that does not exist.
function renderPaneSkeleton() {
  const bars = ["86%", "58%", "34%", "100%", "96%", "72%", "100%", "88%"]
    .map((w, i) => {
      const cls = i < 2 ? " topic-ghost__bar--title" : i === 2 ? " topic-ghost__bar--meta" : "";
      return html`<span class="topic-ghost__bar${raw(cls)}" style="width:${raw(w)}"></span>`;
    })
    .join("");
  return html`<section class="topics-view__pane topics-view__pane--waiting" aria-label="Loading topic">
    <div class="topics-view__pane-body">
      <div class="topic-ghost topic-ghost--article" style="--ghost-delay: 0.14s">${raw(bars)}</div>
    </div>
  </section>`;
}

// ── The list ───────────────────────────────────────────────────────────────

function renderList(shown, more, total, scanning, feed) {
  if (scanning) return renderListSkeleton();

  if (!shown.length) {
    return renderEmpty(total, feed);
  }

  const groups = groupTopicsByAge(shown);
  const body = groups
    .map(
      (g) =>
        html`<section class="topics-view__group">
          <h2 class="topics-view__group-label">${g.group.label}</h2>
          <div class="topics-view__group-cards">
            ${raw(
              g.topics
                .map((t) =>
                  renderTopicCard(t, {
                    source: findTopicSource(t.sourceId),
                    menuOpen: view.menuTopicId === t.id,
                    articleOpen: view.openTopicId === t.id,
                  }),
                )
                .join(""),
            )}
          </div>
        </section>`,
    )
    .join("");

  return html`${raw(body)}
  ${raw(
    more
      ? html`<div class="topics-view__more" data-topic-sentinel>
          <button
            type="button"
            class="ap-button stroked grey"
            data-topic-more-page
            ${raw(view.loadingMore ? "disabled" : "")}
          >
            ${raw(view.loadingMore ? html`<span class="ap-loader small"></span>` : "")}
            <span>Load ${more > PAGE ? PAGE : more} more</span>
          </button>
        </div>`
      : "",
  )}`;
}

// Two states, and they are NOT the same sentence. A feed that has found nothing
// yet is listening and has to read that way; a filter that excludes everything is
// the reader's own doing and needs the way back, not reassurance.
function renderEmpty(total, feed) {
  if (!feed) {
    return renderEmptyState({
      icon: "ap-icon-antenna",
      title: "No Playbook to listen for",
      body: "Create a Playbook and I'll start watching its competitors.",
      wrapperClass: "topics-view__empty",
    });
  }
  if (total === 0) {
    return renderEmptyState({
      icon: "ap-icon-antenna",
      title: "Nothing has landed yet",
      body: `I'm listening to this Playbook's competitors and I refresh ${findCadence(feed.cadence)?.adverb || "weekly"}. Switch on more sources and there'll be more to read.`,
      actionHtml:
        '<button type="button" class="ap-button stroked grey" data-topic-settings><i class="ap-icon-cog"></i><span>Feed settings</span></button>',
      wrapperClass: "topics-view__empty",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-filter",
    title: "Nothing matches these filters",
    body: "Widen the filters or switch Playbook.",
    actionHtml: '<button type="button" class="ap-button stroked grey" data-topic-filters-reset>Reset filters</button>',
    wrapperClass: "topics-view__empty",
  });
}

// ── The reading pane ──────────────────────────────────────────────────────
// Its own scrollport, and the verbs in a toolbar at the TOP of it.
//
// They were in a sticky footer. A toolbar is better for the same reason a mail
// reader puts Reply up there: the actions are then in view for a short article as
// well as a long one, they never overlap the last line of prose, and the reader
// always finds them in the same place instead of at the end of however much text
// this Topic happened to have. The requirement was that they stay reachable while
// the article scrolls, and being outside the scroller satisfies it absolutely
// rather than approximately.
//
// It carries the OBJECT'S HEADER, not a strip of verbs. It used to be the verbs
// alone, above a body whose title sat below them inside the scroller — so the
// actions had no subject on screen, and scrolling took away the one line naming
// what they act on. The title and the source now sit in that same fixed header,
// which is what a mail reader puts above its actions and for the same reason.
//
// Identity and verbs both come from topic-article.js. The header (provenance,
// title, top-right kebab) stays FIXED in `__pane-head`, outside the scroller; the
// verbs ride a sticky bar inside the scrolling article, between the analysis and
// the evidence (renderTopicArticle's `actions` slot). Only the placement is the
// host's — the dialog renders the same pieces in its own footer.
function renderPane(topic) {
  const source = findTopicSource(topic.sourceId);
  return html`<section class="topics-view__pane" aria-label="Topic article">
    <header class="topics-view__pane-head">
      ${raw(renderTopicHeader(topic, { source, menuOpen: view.paneMenuOpen }))}
    </header>
    <div class="topics-view__pane-body">
      ${raw(
        renderTopicArticle(topic, { source, withHeader: false, actions: renderTopicActions(topic, { close: null }) }),
      )}
    </div>
  </section>`;
}

// The pane with nothing in it. It renders rather than collapsing, so the two
// columns keep their widths and the list does not jump sideways every time an
// article opens or closes — the one thing a reader must never do. It is also
// where a reader looks first, so it is worth a sentence.
function renderPanePlaceholder() {
  return html`<section class="topics-view__pane topics-view__pane--blank" aria-label="Topic article">
    ${raw(
      renderEmptyState({
        icon: "ap-icon-note",
        title: "Nothing open",
        body: "Pick a topic on the left and I'll show you what I found, and the posts I found it in.",
        wrapperClass: "topics-view__pane-blank",
      }),
    )}
  </section>`;
}

// ── Paging on scroll ───────────────────────────────────────────────────────
// One observer, re-created per paint because the sentinel is replaced with the
// list. `loadingMore` is what stops a second load starting while one is in
// flight — reaching the end again mid-load must not queue a second page.
function watchSentinel(target, pb) {
  if (observer) observer.disconnect();
  const sentinel = target.querySelector("[data-topic-sentinel]");
  if (!sentinel) return;
  observer = new IntersectionObserver((entries) => {
    if (!view || view.loadingMore) return;
    if (entries.some((e) => e.isIntersecting)) loadMore(target, pb);
  });
  observer.observe(sentinel);
}

function loadMore(target, pb) {
  if (!view || view.loadingMore) return;
  view.loadingMore = true;
  paint(target, pb);
  // A beat, so the button's loading state is visible rather than flickering.
  window.setTimeout(() => {
    if (!view) return;
    view.page += 1;
    view.loadingMore = false;
    paint(target, scopedPlaybook());
  }, 250);
}

// ── Events ─────────────────────────────────────────────────────────────────

function bind(target) {
  boundRoot = target;

  boundChange = (event) => {
    if (!view) return;

    // A multi-select checkbox: "kind" (lane), "marked" (answered statuses) or
    // "source". The filter key is the same as the data value except "source",
    // which stores under the plural `sources`.
    const filter = event.target.closest("[data-topic-filter]");
    if (filter) {
      const group = filter.dataset.topicFilter === "source" ? "sources" : filter.dataset.topicFilter;
      const list = new Set(view.filters[group]);
      if (filter.checked) list.add(filter.value);
      else list.delete(filter.value);
      view.filters = { ...view.filters, [group]: [...list] };
      // Any filter change returns to page one. Narrowing must never leave the
      // reader three pages deep in a list that is now shorter than that.
      view.page = 1;
      paint(target, scopedPlaybook());
    }
  };
  target.addEventListener("change", boundChange);

  boundClick = (event) => {
    if (!view) return;

    // One card menu open at a time, and an outside click closes it. Checked
    // first so a click on another card's kebab closes this one on the way.
    const moreBtn = event.target.closest("[data-topic-more]");
    const insideMenu = event.target.closest(".topic-card__menu");
    if (!moreBtn && !insideMenu && view.menuTopicId) {
      view.menuTopicId = null;
      paint(target, scopedPlaybook());
    }
    const trailBtn = event.target.closest("[data-topic-trail-menu]");
    const insideTrailMenu = event.target.closest(".topic-article__menu");
    if (!trailBtn && !insideTrailMenu && view.paneMenuOpen) {
      view.paneMenuOpen = false;
      paint(target, scopedPlaybook());
    }
    const insidePanel = event.target.closest(".topics-view__filter-panel");
    const filtersBtn = event.target.closest("[data-topic-filters-toggle]");
    if (!filtersBtn && !insidePanel && view.filtersOpen) {
      view.filtersOpen = false;
      view.kindOpen = false;
      view.markedOpen = false;
      view.sourcesOpen = false;
      paint(target, scopedPlaybook());
    }

    if (moreBtn) {
      view.menuTopicId = view.menuTopicId === moreBtn.dataset.topicMore ? null : moreBtn.dataset.topicMore;
      paint(target, scopedPlaybook());
      return;
    }

    // A multi-select's own disclosure. preventDefault so `<details>` does not ALSO
    // toggle itself — the flag is the single source of truth. One select open at a
    // time, so opening one closes the other and there is never a second overlay.
    const msToggle = event.target.closest("[data-topic-ms-toggle]");
    if (msToggle) {
      event.preventDefault();
      const which = msToggle.dataset.topicMsToggle;
      view.kindOpen = which === "kind" ? !view.kindOpen : false;
      view.markedOpen = which === "marked" ? !view.markedOpen : false;
      view.sourcesOpen = which === "sources" ? !view.sourcesOpen : false;
      paint(target, scopedPlaybook());
      return;
    }

    if (filtersBtn) {
      // Closing the panel closes the selects with it, so reopening Filters never
      // starts with a menu already hanging open over the groups below it.
      view.filtersOpen = !view.filtersOpen;
      if (!view.filtersOpen) {
        view.kindOpen = false;
        view.markedOpen = false;
        view.sourcesOpen = false;
      }
      paint(target, scopedPlaybook());
      return;
    }

    if (trailBtn) {
      view.paneMenuOpen = !view.paneMenuOpen;
      paint(target, scopedPlaybook());
      return;
    }

    const trail = event.target.closest("[data-topic-trail]");
    if (trail) {
      // Close the menu before the overlay opens: it repaints the pane underneath,
      // so a menu left open would still be there when the dialog closes.
      view.paneMenuOpen = false;
      paint(target, scopedPlaybook());
      openTopicHistory(trail.dataset.topicTrail);
      return;
    }

    if (event.target.closest("[data-topic-filters-reset]")) {
      view.filters = defaultFilters();
      view.page = 1;
      paint(target, scopedPlaybook());
      return;
    }

    if (event.target.closest("[data-topic-settings]")) {
      const pb = scopedPlaybook();
      // No `?pb=` in workspace mode: the settings page reads the rail, and a
      // brand pinned in the URL would be a second scope beside it.
      navigate(pb && !isWorkspaceMode() ? `/topics/settings?pb=${encodeURIComponent(pb.id)}` : "/topics/settings");
      return;
    }

    const scopePick = event.target.closest("[data-topic-scope-pick]");
    if (scopePick) {
      // The scope is URL state, so switching Playbook is a navigation — the
      // router re-runs this screen and every bit of view state resets with it,
      // which is what "swaps the feed under the reader" has to mean.
      setHashQuery(getPath(), { pb: scopePick.dataset.topicScopePick });
      return;
    }

    const read = event.target.closest("[data-topic-read]");
    if (read) {
      const id = read.dataset.topicRead;
      const opening = view.openTopicId !== id;
      view.openTopicId = opening ? id : null;
      view.revealPane = opening;
      paint(target, scopedPlaybook());
      return;
    }

    if (event.target.closest("[data-topic-more-page]")) {
      loadMore(target, scopedPlaybook());
      return;
    }

    const use = event.target.closest("[data-topic-use]");
    if (use) {
      // The mark lands before the chat opens — see topic-flow.
      useTopicInChat(use.dataset.topicUse);
      return;
    }

    const ignore = event.target.closest("[data-topic-ignore]");
    if (ignore) {
      const id = ignore.dataset.topicIgnore;
      view.menuTopicId = null;
      openIgnoreReason(id, (reason) => {
        ignoreTopic(id, reason);
        const t = getTopicById(id);
        showToast(`Ignored — I'll keep "${topicTitle(t)}" off this list`, {
          action: { label: "Undo", onClick: () => unignoreTopic(id) },
        });
      });
      return;
    }

    const unignore = event.target.closest("[data-topic-unignore]");
    if (unignore) {
      const id = unignore.dataset.topicUnignore;
      view.menuTopicId = null;
      unignoreTopic(id);
      showToast("Back on the list to review");
      return;
    }
  };
  target.addEventListener("click", boundClick);

  // Escape closes the article. It is the pane's ONLY way out now that the header
  // spends no slot on a Close button — a two-pane reader closes a message by
  // opening the next one, and the list is right there. On `document` because
  // nothing in the pane holds focus, and held in a module-level binding so
  // teardown can remove it: #app outlives this screen, so a listener left behind
  // stacks up on every remount.
  boundKeydown = (event) => {
    if (event.key !== "Escape" || !view) return;
    // An OVERLAY takes it before any of this. `has-modal` is the class every modal
    // here puts on <body> while it is up, and this catches the modals that do NOT
    // consume Escape themselves — the Ignore dialog only listens on its textarea,
    // so a press with focus anywhere else used to close the article underneath and
    // leave the dialog stranded over a blank pane.
    //
    // It cannot catch a modal that DOES handle Escape and then bubbles: that
    // handler runs first and clears the class before this one looks. Consuming the
    // key in capture is the only fix there, which is what topic-history-modal
    // does — see the note in it.
    if (document.body.classList.contains("has-modal")) return;
    // A menu or the filter panel takes the key next: Escape shuts the thing
    // that opened last, not the thing behind it.
    // A multi-select is INSIDE the panel, so it is the innermost thing open:
    // Escape takes it alone and leaves the panel up.
    if (view.kindOpen || view.markedOpen || view.sourcesOpen) {
      view.kindOpen = false;
      view.markedOpen = false;
      view.sourcesOpen = false;
      paint(target, scopedPlaybook());
      return;
    }
    if (view.menuTopicId || view.filtersOpen || view.paneMenuOpen) {
      view.menuTopicId = null;
      view.filtersOpen = false;
      view.paneMenuOpen = false;
      paint(target, scopedPlaybook());
      return;
    }
    if (!view.openTopicId) return;
    view.openTopicId = null;
    paint(target, scopedPlaybook());
  };
  document.addEventListener("keydown", boundKeydown);
}
