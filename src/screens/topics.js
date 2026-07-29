// Topics — route /topics. Two tabs: the feed of dossiers Agorapulse listening
// produced, and the standing instructions that produced them.
//
// The feed is one chronological stream across every Playbook, newest first, each
// card carrying the Playbook it came from. Not a right-panel mode: the panel is
// session-bound by the shell rules, and a topic belongs to a Playbook and
// arrives on a cadence long before any chat exists to hold it.
//
// "What I watch" lives HERE rather than on /playbook/:id, where it was first
// built. A Playbook is a fact sheet — every section answers "who are you?".
// Which sources are live and how often they refresh answers "what job should
// Archie run?", which is operational, not declarative; as a grid of switches it
// read as a settings panel wedged into a profile. The project rule allows both
// homes — the entity that owns the config, OR a route scoped to one feature —
// and this is the second. The DATA is still per Playbook (`ctx.topics`); only
// the editing surface is here.
//
// Cadence is copy, never a timer — a weekly tick would never fire inside a demo
// session. The recurring feel comes from "Refresh now": a scanning state, then a
// batch of unseen dossiers on top. See topics-store.refreshTopics.
//
// Modelled on screens/connectors.js — flag guard, teardown/paint/bind, delegated
// listeners, store subscriptions, and teardown returned to the router.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=240";
import { showToast } from "../components/toast.js?v=20";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { renderTopicCard } from "../components/topic-card.js?v=1";
import { open as openTopicModal } from "../components/topic-modal.js?v=2";
import { isFlagOn } from "../feature-flags.js?v=15";
import {
  getContexts,
  getContextById,
  getDefaultContext,
  updateContext,
  subscribe as subscribeContexts,
} from "../contexts-store.js?v=43";
import {
  TOPIC_SOURCES,
  CADENCES,
  DEFAULT_ENABLED_IDS,
  DEFAULT_CADENCE,
  findTopicSource,
  findCadence,
} from "../topics-catalog.js?v=2";
import { openTopicInChat } from "../topic-flow.js?v=2";
import {
  getTopics,
  getUnseenCount,
  dismissTopic,
  restoreTopic,
  refreshTopics,
  hasMoreToScan,
  subscribe as subscribeTopics,
} from "../topics-store.js?v=1";

// How long the mock scan appears to run. Long enough to read the scanning line,
// short enough that nobody waits for it in a demo.
const SCAN_MS = 2000;

// The two tabs. `sources` is the URL value — "what I watch" is the label, but the
// param says what it holds.
const TABS = ["feed", "sources"];

// Local view state. `source` is a catalog id or "all"; `scanning` drives the
// skeleton feed. The TAB is deliberately NOT here — see activeTab().
let view = { source: "all", scanning: false };
let scanTimer = null;

let unsubscribe = null;
let unsubscribeContexts = null;
let boundTarget = null;
let boundClick = null;
let boundChange = null;
let boundInput = null;

// The tab lives in the URL, not in module state. renderTopics resets `view` on
// every render and the router re-runs the handler on query-only changes, so a
// tab held in module state would bounce straight back to the feed. Reading it
// from the hash also makes it deep-linkable and back/forward-correct — the same
// idiom session.js uses for its own ?view=.
function activeTab() {
  const raw = parseHashParams().get("view");
  return TABS.includes(raw) ? raw : "feed";
}

// `?pb=` is ONE idea — "scoped to this Playbook" — shared by both tabs, so filtering
// the feed to a brand and switching to What I watch lands you on that brand's config.
// The two tabs only differ in what an ABSENT value means, which follows from what
// each surface is for:
//
//   • the feed  → "all Playbooks" (a feed with nothing selected shows everything)
//   • the config → the default (★) Playbook (you always have to be editing one)
//
// In the URL rather than module state for the same reason the tab is, plus a
// specific one: a per-entity config surface MUST carry its scope, or configuring
// Playbook B and pressing back silently shows you Playbook A's switches.
function activePlaybookId() {
  const wanted = parseHashParams().get("pb");
  if (wanted && getContextById(wanted)) return wanted;
  return getDefaultContext()?.id || getContexts()[0]?.id || null;
}

/** The feed's Playbook filter: a real Playbook id, or "all". */
function activePlaybookFilter() {
  const wanted = parseHashParams().get("pb");
  return wanted && getContextById(wanted) ? wanted : "all";
}

// Build the hash query, carrying whatever isn't being changed. Overrides: `tab`
// (defaults to the current one) and `pb` (null clears it, undefined keeps it).
function scopedQuery({ tab, pb } = {}) {
  const nextTab = tab || activeTab();
  const nextPb = pb === undefined ? parseHashParams().get("pb") : pb;
  const out = {};
  if (nextTab !== "feed") out.view = nextTab;
  if (nextPb && getContextById(nextPb)) out.pb = nextPb;
  return out;
}

function matchesFilters(topic) {
  const pb = activePlaybookFilter();
  return (pb === "all" || topic.contextId === pb) && (view.source === "all" || topic.sourceId === view.source);
}

export function renderTopics(_params, target) {
  // Gated behind a feature flag (default OFF). When off the route is unreachable
  // from the UI, but a stale deep link has to bounce home rather than render a
  // surface the flag says doesn't exist.
  if (!isFlagOn("topics")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  view = { source: "all", scanning: false };
  paint(target);
  bind(target);
  // Repaint when a topic is read, dismissed or restored from elsewhere (the
  // dialog, or a chat marking one seen on arrival).
  unsubscribe = subscribeTopics(() => paint(target));
  // …and when a Playbook changes, since "What I watch" edits straight into
  // contexts-store and the feed's Playbook chips read names from it.
  unsubscribeContexts = subscribeContexts(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (unsubscribeContexts) {
    unsubscribeContexts();
    unsubscribeContexts = null;
  }
  if (scanTimer) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  view.scanning = false;
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundChange) boundTarget.removeEventListener("change", boundChange);
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
  boundChange = null;
  boundInput = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen topics-view">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

// Date buckets, from `ageDays` rather than a real clock. Order matters — the
// feed renders them in this sequence and drops the empty ones.
const GROUPS = [
  { id: "week", label: "This week", holds: (d) => d <= 7 },
  { id: "month", label: "Earlier this month", holds: (d) => d <= 30 },
  { id: "older", label: "Earlier", holds: () => true },
];

function groupByAge(topics) {
  const out = GROUPS.map((g) => ({ ...g, items: [] }));
  for (const t of topics) {
    const bucket = out.find((g) => g.holds(t.ageDays ?? 0));
    (bucket || out[out.length - 1]).items.push(t);
  }
  return out.filter((g) => g.items.length > 0);
}

/** Every source switched on by at least one Playbook — what I'm actually watching. */
function watchedSourceIds() {
  const ids = new Set();
  for (const ctx of getContexts()) for (const id of ctx.topics?.enabledSourceIds || []) ids.add(id);
  return ids;
}

function renderPage() {
  const tab = activeTab();
  const all = getTopics();
  const pbFilter = activePlaybookFilter();
  const visible = all.filter(matchesFilters);
  const unseen = getUnseenCount();
  const playbooks = getContexts().filter((c) => (c.topics?.enabledSourceIds || []).length > 0);
  // Count the Playbooks actually REPRESENTED in the feed, not the ones I'm
  // watching: "9 topics across 4 Playbooks" is a lie when nine of them come from
  // two, and the honest number is the one that helps the user place a card.
  const represented = new Set(all.map((t) => t.contextId)).size;
  const filtered = pbFilter !== "all" || view.source !== "all";

  // Filtered, the subtitle has to say what you're looking at — otherwise "9 topics"
  // over a list of 3 reads as a bug. Unfiltered it keeps the account overview.
  const feedSub = filtered
    ? [
        `${visible.length} of ${all.length} ${all.length === 1 ? "topic" : "topics"}`,
        pbFilter !== "all" ? getContextById(pbFilter)?.name : null,
        view.source !== "all" ? findTopicSource(view.source)?.name : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : [
        unseen ? `${unseen} new` : null,
        `${all.length} ${all.length === 1 ? "topic" : "topics"}`,
        represented ? `from ${playbookCount(represented)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const sub = tab === "sources" ? "The sources I listen to, and how often I check them." : feedSub;

  return html`
    <div class="topics-view__page">
      <header class="topics-view__head">
        <div class="topics-view__head-text">
          <h1 class="topics-view__title">Topics</h1>
          <p class="topics-view__sub">${sub}</p>
        </div>
        <!-- Refresh belongs to the feed: on the config tab there's no list to
             refresh, and offering it there would scan sources you're mid-edit. -->
        <div class="topics-view__head-actions">${raw(tab === "feed" ? renderRefresh() : "")}</div>
      </header>

      ${raw(renderTabs(tab, all.length))}
      ${raw(tab === "sources" ? renderSourcesTab() : renderFeedTab({ all, visible, playbooks }))}
    </div>
  `;
}

// DS .ap-tabs, same markup as content-workspace. The feed carries its count; "What
// I watch" carries none — a number there reads ambiguously (sources? Playbooks?).
function renderTabs(tab, topicCount) {
  return html`<div class="ap-tabs topics-view__tabs">
    <div class="ap-tabs-nav">
      <button type="button" class="ap-tabs-tab ${raw(tab === "feed" ? "active" : "")}" data-topics-tab="feed">
        <i class="ap-icon-web-news" aria-hidden="true"></i>
        <span>Feed</span>
        <span class="ap-counter normal ${raw(tab === "feed" ? "blue" : "grey")}">${topicCount}</span>
      </button>
      <button type="button" class="ap-tabs-tab ${raw(tab === "sources" ? "active" : "")}" data-topics-tab="sources">
        <i class="ap-icon-antenna" aria-hidden="true"></i>
        <span>What I watch</span>
      </button>
    </div>
  </div>`;
}

function renderFeedTab({ all, visible, playbooks }) {
  return html`${raw(all.length ? renderFilterBar(all) : "")}
    <div class="topics-view__body">
      ${raw(
        view.scanning
          ? renderScanning()
          : visible.length
            ? renderFeed(visible)
            : renderEmpty({ total: all.length, playbooks }),
      )}
    </div>`;
}

function playbookCount(n) {
  return `${n} ${n === 1 ? "Playbook" : "Playbooks"}`;
}

// Blue, not orange: refreshing a list is a routine page action. Orange is
// reserved for the spotlight move on a card ("Start a chat").
function renderRefresh() {
  if (view.scanning) {
    return html`<button type="button" class="ap-button secondary blue" disabled>
      <span class="archie-loader" aria-hidden="true"></span>
      <span>Scanning…</span>
    </button>`;
  }
  const dry = !hasMoreToScan();
  return html`<button
    type="button"
    class="ap-button secondary blue"
    data-topics-refresh
    ${raw(dry ? "disabled" : "")}
    title="${dry ? "Nothing new to find right now" : "Scan my sources again"}"
  >
    <i class="ap-icon-refresh" aria-hidden="true"></i>
    <span>Refresh now</span>
  </button>`;
}

// ─── Filters ───────────────────────────────────────────────────────────────
//
// TWO SELECTS — Playbook and Source — not one "Filters" trigger. The DS does ship a
// Filters dropdown (V2 Molecules › Filters dropdown: a 420px panel of checkboxes with
// Clear / Apply, i.e. <ap-filter-dropdown> with needApplyButton), and that's the right
// component when the user is composing a multi-value filter set and applying it in one
// go. Here each facet takes exactly ONE value and applies immediately, so two selects
// say what's selected without being opened — which a trigger reading "Filters (2)"
// cannot. Same toolbar shape as the top-posts board's Period / Sort.
//
// A chip per Playbook was the other option, and it's the trap the config tab just
// escaped: it can't survive twenty Playbooks. A select can.

// Above this many options, the Playbook select earns a search field.
const PB_FILTER_SEARCH_THRESHOLD = 8;

function countBy(topics, key) {
  const out = new Map();
  for (const t of topics) out.set(t[key], (out.get(t[key]) || 0) + 1);
  return out;
}

// One option row. A zero count DISABLES it rather than hiding it, so the list doesn't
// reshuffle as the other facet changes — and a dead combination stays unreachable.
function renderFilterOption({ attr, value, label, icon, count, active, searchKey }) {
  const disabled = count === 0 && !active;
  return html`<div
    class="ap-select-option${raw(active ? " selected" : "")}${raw(disabled ? " disabled" : "")}"
    ${raw(disabled ? "" : `${attr}="${escapeAttr(value)}"`)}
    ${raw(searchKey ? `data-topics-filter-name="${escapeAttr(searchKey.toLowerCase())}"` : "")}
    role="option"
    aria-selected="${active ? "true" : "false"}"
    aria-disabled="${disabled ? "true" : "false"}"
  >
    ${raw(icon ? `<i class="${icon} ap-select-option-icon" aria-hidden="true"></i>` : "")}
    <span class="ap-select-option-text">${label}</span>
    <span class="ap-select-option-badge">${count}</span>
    ${raw(active ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
  </div>`;
}

// `.ap-select` over <details>, with the DS's inline label in the trigger so the facet
// names itself ("Playbook | All") without a separate <label>.
function renderFilterSelect({ label, valueLabel, options, search, extraClass = "" }) {
  return html`<details class="ap-select topics-filter__select ${raw(extraClass)}">
    <summary class="ap-select-trigger">
      <span class="ap-select-inline-label">${label}</span>
      <span class="ap-select-value">${valueLabel}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="${escapeAttr(label)}">
      ${raw(search)}
      <div class="ap-select-options">${raw(options)}</div>
      <!-- Inline display, not the hidden attribute: the DS gives
           .ap-select-not-found display:flex, which out-specifies [hidden]. -->
      <div class="ap-select-not-found" data-topics-filter-empty style="display: none">No match.</div>
    </div>
  </details>`;
}

function renderFilterBar(all) {
  const pb = activePlaybookFilter();
  const src = view.source;

  // Each facet's counts are computed against the OTHER facet's selection, so a number
  // never promises rows the current filters would exclude.
  const inPbScope = all.filter((t) => pb === "all" || t.contextId === pb);
  const inSrcScope = all.filter((t) => src === "all" || t.sourceId === src);
  const srcCounts = countBy(inPbScope, "sourceId");
  const pbCounts = countBy(inSrcScope, "contextId");

  // Only Playbooks that appear in the feed at all — a filter that can only ever return
  // nothing isn't a filter. This is what really bounds the list: it grows with the
  // feed's content, not with the size of the account.
  const feedPlaybooks = getContexts().filter((c) => all.some((t) => t.contextId === c.id));
  const activePb = pb === "all" ? null : getContextById(pb);
  const activeSrc = src === "all" ? null : findTopicSource(src);

  const pbOptions = [
    renderFilterOption({
      attr: "data-topics-pb",
      value: "all",
      label: "All Playbooks",
      count: inSrcScope.length,
      active: pb === "all",
    }),
    ...feedPlaybooks.map((c) =>
      renderFilterOption({
        attr: "data-topics-pb",
        value: c.id,
        label: c.name,
        count: pbCounts.get(c.id) || 0,
        active: pb === c.id,
        searchKey: c.name,
      }),
    ),
  ].join("");

  const srcOptions = [
    renderFilterOption({
      attr: "data-topics-source",
      value: "all",
      label: "All sources",
      count: inPbScope.length,
      active: src === "all",
    }),
    ...TOPIC_SOURCES.map((s) =>
      renderFilterOption({
        attr: "data-topics-source",
        value: s.id,
        label: s.name,
        icon: s.icon,
        count: srcCounts.get(s.id) || 0,
        active: src === s.id,
      }),
    ),
  ].join("");

  const pbSearch =
    feedPlaybooks.length > PB_FILTER_SEARCH_THRESHOLD
      ? html`<div class="ap-select-search">
          <i class="ap-icon-search ap-select-search-icon" aria-hidden="true"></i>
          <input
            type="search"
            class="ap-select-search-input"
            placeholder="Search Playbooks…"
            aria-label="Search Playbooks"
            data-topics-filter-search
          />
        </div>`
      : "";

  return html`<div class="topics-view__filters">
    ${raw(
      renderFilterSelect({
        label: "Playbook",
        valueLabel: activePb ? activePb.name : "All",
        options: pbOptions,
        search: pbSearch,
        extraClass: "topics-filter__select--pb",
      }),
    )}
    ${raw(
      renderFilterSelect({
        label: "Source",
        valueLabel: activeSrc ? activeSrc.name : "All",
        options: srcOptions,
        search: "",
      }),
    )}
    <!-- Only offered when there's something to clear: each select already has its own
         "All", so a permanent Clear would be a third way to do the same thing. -->
    ${raw(
      activePb || activeSrc
        ? html`<button type="button" class="ap-button ghost grey" data-topics-filter-clear>
            <span>Clear</span>
          </button>`
        : "",
    )}
  </div>`;
}

function renderFeed(topics) {
  return groupByAge(topics)
    .map(
      (group) =>
        html`<section class="topics-group">
          <h2 class="topics-group__label">${group.label}</h2>
          <div class="topics-group__list">
            ${raw(
              group.items
                .map((t) =>
                  renderTopicCard(t, {
                    source: findTopicSource(t.sourceId),
                    playbookName: getContextById(t.contextId)?.name || "",
                  }),
                )
                .join(""),
            )}
          </div>
        </section>`,
    )
    .join("");
}

// Skeletons rather than a spinner: the feed keeps its shape while I scan, so the
// arriving cards land in a layout the eye already knows.
function renderScanning() {
  const rows = [0, 1, 2]
    .map(
      () =>
        html`<div class="topics-skel">
          <span class="topics-skel__line topics-skel__line--eyebrow"></span>
          <span class="topics-skel__line topics-skel__line--title"></span>
          <span class="topics-skel__line"></span>
          <span class="topics-skel__line topics-skel__line--short"></span>
        </div>`,
    )
    .join("");
  return html`<p class="topics-view__scanning" role="status">
      <span class="archie-loader" aria-hidden="true"></span>
      <span>Reading what your sources published…</span>
    </p>
    ${raw(rows)}`;
}

// Three genuinely different dead ends: nothing switched on anywhere, a filter
// with no match, and a feed the user has emptied by hand.
function renderEmpty({ total, playbooks }) {
  if (!watchedSourceIds().size) {
    return renderEmptyState({
      icon: "ap-icon-antenna",
      title: "Tell me what to watch",
      body: "Turn a listening source on and I'll bring you what your market is publishing.",
      // Straight to the tab that fixes it — this used to open a Playbook, which
      // is no longer where the switches are.
      actionHtml: `<button type="button" class="ap-button primary blue" data-topics-tab="sources">
             <i class="ap-icon-antenna"></i><span>Choose what I watch</span>
           </button>`,
      wrapperClass: "topics-view__empty",
    });
  }
  // Filters active but nothing matches. Name BOTH facets — "nothing from that
  // source" is a lie when it's the Playbook doing the excluding.
  const pb = activePlaybookFilter();
  if (total > 0 && (pb !== "all" || view.source !== "all")) {
    const named = [
      view.source !== "all" ? findTopicSource(view.source)?.name : null,
      pb !== "all" ? getContextById(pb)?.name : null,
    ].filter(Boolean);
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "Nothing matches those filters",
      body: named.length
        ? `I haven't brought you anything for ${named.join(" · ")} yet.`
        : "Nothing matches the filters you've set.",
      actionHtml: `<button type="button" class="ap-button stroked grey" data-topics-filter-clear><span>Clear filters</span></button>`,
      wrapperClass: "topics-view__empty",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-antenna",
    title: "Nothing new right now",
    body: playbooks.length
      ? `I'm watching ${playbooks.length === 1 ? "1 Playbook" : `${playbooks.length} Playbooks`} and I'll bring you the next batch ${cadenceAdverb(playbooks)}.`
      : "I'll bring you the next batch as soon as your sources publish something worth reading.",
    actionHtml: hasMoreToScan()
      ? `<button type="button" class="ap-button secondary blue" data-topics-refresh><i class="ap-icon-refresh"></i><span>Refresh now</span></button>`
      : "",
    wrapperClass: "topics-view__empty",
  });
}

// ─── "What I watch" — the standing instructions ────────────────────────────

// Read-only view of a Playbook's topics config. contexts-store already
// normalises it, but a caller shouldn't have to trust that to render — and this
// must never mutate the stored object, since every write goes through
// updateContext so the store can notify.
function watchConfig(ctx) {
  const t = (ctx && ctx.topics) || {};
  return {
    enabledSourceIds: Array.isArray(t.enabledSourceIds) ? t.enabledSourceIds : DEFAULT_ENABLED_IDS.slice(),
    cadence: findCadence(t.cadence) ? t.cadence : DEFAULT_CADENCE,
  };
}

// Above this many Playbooks the picker earns a search field. Below it, a search
// box over four rows is just noise.
const PB_SEARCH_THRESHOLD = 8;

// A comparable fingerprint of what a Playbook watches, for counting how many
// others differ from the selected one.
function watchKey(ctx) {
  const c = watchConfig(ctx);
  return `${c.enabledSourceIds.slice().sort().join(",")}|${c.cadence}`;
}

// ONE Playbook at a time. Stacking a block per Playbook was the first shape and
// it doesn't scale: at twenty Playbooks that's 120 switches and each of the six
// descriptions repeated twenty times — and it's the descriptions, not the
// switches, that make the page explode. Scoped to one, the page is the same
// height at four Playbooks or two hundred, and each description appears exactly
// once, where the decision is made.
function renderSourcesTab() {
  const playbooks = getContexts();
  if (!playbooks.length) {
    return html`<div class="topics-view__body">
      ${raw(
        renderEmptyState({
          icon: "ap-icon-target",
          title: "No Playbooks yet",
          body: "I listen on behalf of a Playbook. Create one and I'll show you what I can watch for it.",
          actionHtml: `<button type="button" class="ap-button primary blue" data-topics-playbooks><i class="ap-icon-target"></i><span>Go to Playbooks</span></button>`,
          wrapperClass: "topics-view__empty",
        }),
      )}
    </div>`;
  }

  const ctx = getContextById(activePlaybookId()) || playbooks[0];
  const conf = watchConfig(ctx);
  const enabled = new Set(conf.enabledSourceIds);
  const onCount = TOPIC_SOURCES.filter((s) => enabled.has(s.id)).length;

  const mine = watchKey(ctx);
  const differing = playbooks.filter((c) => c.id !== ctx.id && watchKey(c) !== mine).length;

  const meta =
    onCount === 0
      ? "Nothing on — I'm not watching anything for this Playbook."
      : `${onCount} of ${TOPIC_SOURCES.length} sources on`;

  return html`<div class="topics-view__body">
    <section class="topics-watch">
      <header class="topics-watch__head">
        <!-- "Watching for" carries the scope as prose as well as a control. A page
             that looks like settings reads as global; the label is what stops it,
             and a bare picker isn't enough — .ap-select collapses to a single
             option when there's only one Playbook. -->
        <div class="topics-watch__scope">
          <span class="topics-watch__scope-label">Watching for</span>
          ${raw(renderPlaybookSelect(playbooks, ctx))}
        </div>
        <label class="topics-watch__cadence">
          <span class="topics-watch__cadence-label">Refresh</span>
          ${raw(renderCadenceSelect(ctx, findCadence(conf.cadence)))}
        </label>
      </header>

      <p class="topics-watch__meta">
        <span>${meta}</span>
        <span class="topics-watch__sep" aria-hidden="true">·</span>
        <button type="button" class="topics-watch__link" data-topics-configure="${escapeAttr(ctx.id)}">
          <span>Open the Playbook</span><i class="ap-icon-arrow-right" aria-hidden="true"></i>
        </button>
      </p>

      <div class="topics-watch__grid">
        ${raw(TOPIC_SOURCES.map((s) => renderWatchSource(ctx, s, enabled.has(s.id))).join(""))}
      </div>

      <!-- One-at-a-time invites "I thought I'd set this everywhere". Saying how
           many others differ is the one thing stacking gave for free. -->
      ${raw(
        differing
          ? html`<p class="topics-watch__others">
              ${differing === 1 ? "1 other Playbook watches" : `${differing} other Playbooks watch`} different sources.
            </p>`
          : "",
      )}
    </section>
  </div>`;
}

// The picker doubles as the overview: each option carries "5 of 6 · weekly" as a
// DS caption, so you can compare Playbooks without leaving the tab — most of what
// the stacked layout was actually good for.
function renderPlaybookSelect(playbooks, active) {
  const options = playbooks
    .map((c) => {
      const conf = watchConfig(c);
      const on = TOPIC_SOURCES.filter((s) => conf.enabledSourceIds.includes(s.id)).length;
      const isActive = c.id === active.id;
      return html`<div
        class="ap-select-option${raw(isActive ? " selected" : "")}"
        data-topics-pb="${escapeAttr(c.id)}"
        data-topics-pb-name="${escapeAttr(c.name.toLowerCase())}"
        role="option"
        aria-selected="${isActive ? "true" : "false"}"
      >
        <span class="ap-select-option-content">
          <span class="ap-select-option-text">${c.name}</span>
          <span class="ap-select-option-caption">${on} of ${TOPIC_SOURCES.length} · ${conf.cadence}</span>
        </span>
        ${raw(isActive ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");

  // The DS ships this search slot but the app had never used it. Filtering happens
  // in the DOM on `input` rather than by repainting — a repaint would close the
  // <details> and take the caret with it.
  const search =
    playbooks.length > PB_SEARCH_THRESHOLD
      ? html`<div class="ap-select-search">
          <i class="ap-icon-search ap-select-search-icon" aria-hidden="true"></i>
          <input
            type="search"
            class="ap-select-search-input"
            placeholder="Search Playbooks…"
            aria-label="Search Playbooks"
            data-topics-pb-search
          />
        </div>`
      : "";

  return html`<details class="ap-select topics-watch__pbselect">
    <summary class="ap-select-trigger">
      <span class="ap-select-value">${active.name}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Playbook">
      ${raw(search)}
      <div class="ap-select-options">${raw(options)}</div>
      <!-- Inline display, not the hidden attribute: the DS gives
           .ap-select-not-found display:flex, which out-specifies [hidden] and would
           leave this visible with every option showing. -->
      <div class="ap-select-not-found" data-topics-pb-empty style="display: none">No Playbook matches that.</div>
    </div>
  </details>`;
}

// DS .ap-select over <details> — never a bare native <select>. Same shape as
// top-post-card's filter selects.
function renderCadenceSelect(ctx, active) {
  const options = CADENCES.map((c) => {
    const on = c.id === active.id;
    return html`<div
      class="ap-select-option${raw(on ? " selected" : "")}"
      data-topics-cadence="${escapeAttr(`${ctx.id}::${c.id}`)}"
      role="option"
      aria-selected="${on ? "true" : "false"}"
    >
      <span class="ap-select-option-text">${c.label}</span>
      ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
    </div>`;
  }).join("");
  return html`<details class="ap-select topics-watch__select">
    <summary class="ap-select-trigger">
      <span class="ap-select-value">${active.label}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Refresh cadence for ${escapeAttr(ctx.name)}">
      <div class="ap-select-options">${raw(options)}</div>
    </div>
  </details>`;
}

function renderWatchSource(ctx, source, on) {
  // The competitor-driven sources state their dependency as a caption, not a
  // link: the block already has one link to the Playbook, and six more would be
  // noise. What matters is knowing WHY the source needs the Playbook.
  const note =
    source.playbookAnchor === "competitors"
      ? html`<span class="topics-src__note">
          <i class="ap-icon-buildings" aria-hidden="true"></i><span>Reads your competitors</span>
        </span>`
      : "";

  return html`<div class="topics-src${raw(on ? "" : " is-off")}">
    <span class="topic-badge topic-badge--lg topic-badge--${source.accent}" aria-hidden="true">
      <i class="${source.icon}"></i>
    </span>
    <div class="topics-src__text">
      <span class="topics-src__name">${source.name}</span>
      <p class="topics-src__desc">${source.description}</p>
      ${raw(note)}
    </div>
    <label class="ap-toggle-container topics-src__switch">
      <input
        type="checkbox"
        data-topics-toggle="${escapeAttr(`${ctx.id}::${source.id}`)}"
        ${raw(on ? "checked" : "")}
        aria-label="${escapeAttr(`${source.name} for ${ctx.name}`)}"
      />
      <i aria-hidden="true"></i>
    </label>
  </div>`;
}

// One cadence per Playbook, so several Playbooks can disagree — say the fastest
// one rather than listing them, since it's the one that will fire first.
function cadenceAdverb(playbooks) {
  const order = ["daily", "weekly", "monthly"];
  const fastest = playbooks
    .map((c) => c.topics?.cadence)
    .filter(Boolean)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return findCadence(fastest)?.adverb || "soon";
}

// ─── Interaction ───────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    // Tab switch goes through the URL, so back/forward and deep links work. The
    // router re-runs this handler, which repaints — no local state to sync. `pb`
    // rides along both ways: it means the same thing on either tab, so filtering the
    // feed to a brand and switching to What I watch lands on that brand's config.
    const tabBtn = event.target.closest("[data-topics-tab]");
    if (tabBtn) {
      const next = tabBtn.dataset.topicsTab;
      if (next === activeTab()) return;
      setHashQuery("/topics", scopedQuery({ tab: next }));
      return;
    }
    // Playbook pick — the feed's filter and the config tab's scope are the same
    // `?pb=`, so one handler serves both. Only "all" is feed-specific: the config tab
    // never offers it, because you always have to be editing some Playbook.
    const pbPick = event.target.closest("[data-topics-pb]");
    if (pbPick) {
      pbPick.closest("details")?.removeAttribute("open");
      const value = pbPick.dataset.topicsPb;
      setHashQuery("/topics", scopedQuery({ pb: value === "all" ? null : value }));
      return;
    }
    // Cadence pick. Commits straight through updateContext — this surface has no
    // Save button, so nothing is staged.
    const cadencePick = event.target.closest("[data-topics-cadence]");
    if (cadencePick) {
      cadencePick.closest("details")?.removeAttribute("open");
      const [ctxId, cadence] = cadencePick.dataset.topicsCadence.split("::");
      const ctx = getContextById(ctxId);
      if (ctx && findCadence(cadence)) {
        updateContext(ctxId, { topics: { ...watchConfig(ctx), cadence } });
      }
      return;
    }
    // Source facet — module state, not the URL. It changes far more often than the
    // scope, and putting it in the hash would stack a history entry per click.
    const srcPick = event.target.closest("[data-topics-source]");
    if (srcPick) {
      srcPick.closest("details")?.removeAttribute("open");
      view.source = srcPick.dataset.topicsSource;
      paint(target);
      return;
    }
    if (event.target.closest("[data-topics-filter-clear]")) {
      view.source = "all";
      // Clears `pb` too, which repaints via the router — no explicit paint needed.
      setHashQuery("/topics", scopedQuery({ pb: null }));
      return;
    }
    if (event.target.closest("[data-topics-refresh]")) {
      startScan(target);
      return;
    }
    if (event.target.closest("[data-topics-playbooks]")) {
      navigate("/contexts");
      return;
    }
    const configure = event.target.closest("[data-topics-configure]");
    if (configure) {
      navigate(`/playbook/${configure.dataset.topicsConfigure}`);
      return;
    }
    const openBtn = event.target.closest("[data-topic-open]");
    if (openBtn) {
      openTopicModal({ topicId: openBtn.dataset.topicOpen, onDismiss: announceDismissal });
      return;
    }
    const chatBtn = event.target.closest("[data-topic-chat]");
    if (chatBtn) {
      openTopicInChat(chatBtn.dataset.topicChat);
      return;
    }
    const dismissBtn = event.target.closest("[data-topic-dismiss]");
    if (dismissBtn) {
      const id = dismissBtn.dataset.topicDismiss;
      dismissTopic(id);
      announceDismissal(id);
    }
  };
  target.addEventListener("click", boundClick);

  // The switches are checkboxes, so `change` — not `click`. It fires once (a
  // click on the wrapping <label> forwards to the input, which would double up),
  // and it also catches the keyboard's Space.
  boundChange = (event) => {
    const toggle = event.target.closest("[data-topics-toggle]");
    if (!toggle) return;
    const key = toggle.dataset.topicsToggle;
    const [ctxId, sourceId] = key.split("::");
    const ctx = getContextById(ctxId);
    if (!ctx || !findTopicSource(sourceId)) return;

    const conf = watchConfig(ctx);
    const next = new Set(conf.enabledSourceIds);
    if (toggle.checked) next.add(sourceId);
    else next.delete(sourceId);
    // Keep catalog order rather than click order, so the stored list stays
    // readable and two Playbooks with the same set serialise identically.
    const enabledSourceIds = TOPIC_SOURCES.filter((s) => next.has(s.id)).map((s) => s.id);

    // Direct commit — no snapshot, no Save. contexts-store notifies, which
    // repaints through the subscription.
    updateContext(ctxId, { topics: { ...conf, enabledSourceIds } });

    // The repaint replaced the node the user was on, so put focus back where they
    // left it — otherwise every keyboard toggle dumps them at the top of the page.
    const again = target.querySelector(`[data-topics-toggle="${CSS.escape(key)}"]`);
    if (again) again.focus({ preventScroll: true });
  };
  target.addEventListener("change", boundChange);

  boundInput = (event) => {
    // The config tab's Playbook picker.
    const pbField = event.target.closest("[data-topics-pb-search]");
    if (pbField) {
      filterDropdownRows({
        field: pbField,
        scopeSelector: ".ap-select-dropdown",
        rowSelector: "[data-topics-pb]",
        nameAttr: "topicsPbName",
        emptySelector: "[data-topics-pb-empty]",
      });
      return;
    }
    // The feed's Playbook select.
    const filterField = event.target.closest("[data-topics-filter-search]");
    if (filterField) {
      filterDropdownRows({
        field: filterField,
        scopeSelector: ".ap-select-dropdown",
        rowSelector: "[data-topics-filter-name]",
        nameAttr: "topicsFilterName",
        emptySelector: "[data-topics-filter-empty]",
      });
    }
  };
  target.addEventListener("input", boundInput);
}

// Both searchable dropdowns on this screen filter the SAME way — in the DOM, on
// `input`, never by repainting. A repaint would close the <details> and take the caret
// with it, which is also why neither keeps its query in state. Rows hide by inline
// display, not the [hidden] attribute: the DS gives both the option rows and the
// not-found row a `display`, which out-specifies [hidden].
function filterDropdownRows({ field, rowSelector, nameAttr, emptySelector, scopeSelector }) {
  const q = field.value.trim().toLowerCase();
  const dropdown = field.closest(scopeSelector);
  if (!dropdown) return;
  let shown = 0;
  for (const row of dropdown.querySelectorAll(rowSelector)) {
    const hit = !q || (row.dataset[nameAttr] || "").includes(q);
    row.style.display = hit ? "" : "none";
    if (hit) shown += 1;
  }
  const empty = dropdown.querySelector(emptySelector);
  if (empty) empty.style.display = shown > 0 ? "none" : "";
}

// Dismissal hides rather than deletes, so the toast can genuinely undo it. Also
// passed to the dialog, so a dismissal from either surface reads the same.
function announceDismissal(id) {
  showToast("Dismissed — I won't bring it up again", {
    action: { label: "Undo", onClick: () => restoreTopic(id) },
  });
}

function startScan(target) {
  if (view.scanning) return;
  view.scanning = true;
  paint(target);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    view.scanning = false;
    const batch = refreshTopics();
    // refreshTopics notifies, which already repaints through the subscription;
    // paint again anyway so clearing `scanning` is guaranteed to land even if the
    // store's notify contract ever changes. A second paint is invisible.
    paint(target);
    showToast(
      batch.length
        ? `${batch.length} new ${batch.length === 1 ? "topic" : "topics"}`
        : "Nothing new since the last scan",
    );
  }, SCAN_MS);
}
