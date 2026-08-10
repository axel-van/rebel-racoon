// Topics — the feed of dossiers Agorapulse listening produced, route /topics.
//
// One chronological stream across every Playbook, newest first, each card carrying
// the Playbook it came from. Not a right-panel mode: the panel is session-bound by
// the shell rules, and a topic belongs to a Playbook and arrives on a cadence long
// before any chat exists to hold it.
//
// The config (Topics settings) is NOT here. It lived as a tab on this page and that
// gave it equal billing with the feed, which is wrong for something you set once and
// then leave alone for months — it's a settings page now, screens/topics-settings.js.
// It isn't on /playbook/:id either: a Playbook is a fact sheet, and which feeds are
// live is operational, not declarative.
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
import { renderTopbar } from "../components/topbar.js?v=335";
import { showToast } from "../components/toast.js?v=20";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { renderTopicCard } from "../components/topic-card.js?v=16";
import { open as openTopicModal } from "../components/topic-modal.js?v=22";
import { isFlagOn } from "../feature-flags.js?v=19";
import { getContexts, getContextById, subscribe as subscribeContexts } from "../contexts-store.js?v=59";
import { TOPIC_SOURCES, findTopicSource, findCadence } from "../topics-catalog.js?v=3";
import { openTopicInChat } from "../topic-flow.js?v=20";
import {
  getTopics,
  getUnseenCount,
  dismissTopic,
  restoreTopic,
  refreshTopics,
  hasMoreToScan,
  subscribe as subscribeTopics,
} from "../topics-store.js?v=15";

// How long the mock scan appears to run. Long enough to read the scanning line,
// short enough that nobody waits for it in a demo.
const SCAN_MS = 2000;

// Local view state. `source` is a catalog id or "all"; `scanning` drives the
// skeleton feed. The Playbook facet is deliberately NOT here — see
// activePlaybookFilter().
let view = { source: "all", scanning: false };
let scanTimer = null;

let unsubscribe = null;
let unsubscribeContexts = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;

// `?pb=` is ONE idea — "scoped to this Playbook" — shared with /topics/settings, so
// filtering the feed to a brand and opening the settings page lands on that brand.
// The two surfaces differ only in what an ABSENT value means, which follows from what
// each is for: here it's "all Playbooks" (a feed with nothing selected shows
// everything); on the settings page it's the default (★) Playbook, because you always
// have to be editing one.
//
// In the URL rather than module state because a per-entity config surface MUST carry
// its scope — configuring Playbook B and pressing back would otherwise silently show
// Playbook A's switches — and because it survives the round trip to that page.
/** The feed's Playbook filter: a real Playbook id, or "all". */
function activePlaybookFilter() {
  const wanted = parseHashParams().get("pb");
  return wanted && getContextById(wanted) ? wanted : "all";
}

// Build the hash query, carrying `pb` unless it's being changed (null clears it,
// undefined keeps it).
function scopedQuery({ pb } = {}) {
  const nextPb = pb === undefined ? parseHashParams().get("pb") : pb;
  return nextPb && getContextById(nextPb) ? { pb: nextPb } : {};
}

/** `/topics/settings`, carrying the current Playbook scope. */
function settingsHref() {
  const pb = parseHashParams().get("pb");
  return pb && getContextById(pb) ? `/topics/settings?pb=${encodeURIComponent(pb)}` : "/topics/settings";
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
  // …and when a Playbook changes, since Topics settings edits straight into
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
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
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
  const sub = filtered
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

  return html`
    <div class="topics-view__page">
      <header class="topics-view__head">
        <div class="topics-view__head-text">
          <h1 class="topics-view__title">Topics</h1>
          <p class="topics-view__sub">${sub}</p>
        </div>
        <div class="topics-view__head-actions">
          <!-- Config lives on its own route, not in a tab beside the feed: you set
               your sources once and then read topics for months, so it doesn't
               deserve equal billing. Labelled rather than a bare cog — it names the
               thing instead of making you hover a glyph. -->
          <button type="button" class="ap-button ghost grey" data-topics-settings>
            <i class="ap-icon-cog" aria-hidden="true"></i>
            <span>Settings</span>
          </button>
          ${raw(renderRefresh())}
        </div>
      </header>

      ${raw(all.length ? renderFilterBar(all) : "")}
      <div class="topics-view__body">
        ${raw(
          view.scanning
            ? renderScanning()
            : visible.length
              ? renderFeed(visible)
              : renderEmpty({ total: all.length, playbooks }),
        )}
      </div>
    </div>
  `;
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
      // Straight to the page that fixes it.
      actionHtml: `<button type="button" class="ap-button primary blue" data-topics-settings>
             <i class="ap-icon-cog"></i><span>Choose what I watch</span>
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
    // Config is a route now, not a tab — carry the Playbook scope into it so the page
    // opens on whatever the feed was filtered to.
    if (event.target.closest("[data-topics-settings]")) {
      navigate(settingsHref());
      return;
    }
    // Playbook facet — in the URL, since `?pb=` is also what scopes the settings page.
    const pbPick = event.target.closest("[data-topics-pb]");
    if (pbPick) {
      pbPick.closest("details")?.removeAttribute("open");
      const value = pbPick.dataset.topicsPb;
      setHashQuery("/topics", scopedQuery({ pb: value === "all" ? null : value }));
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

  boundInput = (event) => {
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
