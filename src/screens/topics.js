// Topics — the feed of dossiers Agorapulse listening produced, route /topics.
//
// One chronological stream across every Playbook, newest first, each card
// carrying the Playbook it came from. Not a right-panel mode: the panel is
// session-bound by the shell rules, and a topic belongs to a Playbook and
// arrives on a cadence long before any chat exists to hold it.
//
// Cadence is copy, never a timer — a weekly tick would never fire inside a demo
// session. The recurring feel comes from "Refresh now": a scanning state, then a
// batch of unseen dossiers on top. See topics-store.refreshTopics.
//
// Modelled on screens/connectors.js — flag guard, teardown/paint/bind, one
// delegated click listener, a store subscription, and teardown returned to the
// router.

import { html, raw, escapeAttr, escapeText } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=238";
import { showToast } from "../components/toast.js?v=20";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { renderTopicCard } from "../components/topic-card.js?v=1";
import { open as openTopicModal } from "../components/topic-modal.js?v=1";
import { isFlagOn } from "../feature-flags.js?v=14";
import { getContexts, getContextById } from "../contexts-store.js?v=41";
import { TOPIC_SOURCES, findTopicSource, findCadence } from "../topics-catalog.js?v=1";
import { openTopicInChat } from "../topic-flow.js?v=1";
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

// Local view state. `source` is a catalog id or "all"; `scanning` drives the
// skeleton feed.
let view = { source: "all", scanning: false };
let scanTimer = null;

let unsubscribe = null;
let boundTarget = null;
let boundClick = null;

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
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (scanTimer) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  view.scanning = false;
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
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
  const visible = view.source === "all" ? all : all.filter((t) => t.sourceId === view.source);
  const unseen = getUnseenCount();
  const playbooks = getContexts().filter((c) => (c.topics?.enabledSourceIds || []).length > 0);
  // Count the Playbooks actually REPRESENTED in the feed, not the ones I'm
  // watching: "9 topics across 4 Playbooks" is a lie when nine of them come from
  // two, and the honest number is the one that helps the user place a card.
  const represented = new Set(all.map((t) => t.contextId)).size;

  const sub = [
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
        <div class="topics-view__head-actions">${raw(renderRefresh())}</div>
      </header>

      ${raw(all.length ? renderFilters(all) : "")}

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

// Source filters. Only sources that actually produced something get a chip —
// a row of six chips where four are dead ends is noise. `aria-pressed` drives
// the active state, the same contract every other .ap-filter-chip uses.
function renderFilters(all) {
  const counts = new Map();
  for (const t of all) counts.set(t.sourceId, (counts.get(t.sourceId) || 0) + 1);
  const chips = TOPIC_SOURCES.filter((s) => counts.has(s.id)).map(
    (s) =>
      html`<button
        type="button"
        class="ap-filter-chip"
        data-topics-source="${s.id}"
        aria-pressed="${view.source === s.id ? "true" : "false"}"
      >
        <i class="${s.icon}" aria-hidden="true"></i>
        <span>${s.name}</span>
        <span class="ap-counter normal grey">${counts.get(s.id)}</span>
      </button>`,
  );
  return html`<div class="topics-view__filters" role="group" aria-label="Filter by source">
    <button
      type="button"
      class="ap-filter-chip"
      data-topics-source="all"
      aria-pressed="${view.source === "all" ? "true" : "false"}"
    >
      <span>All</span>
      <span class="ap-counter normal grey">${all.length}</span>
    </button>
    ${raw(chips.join(""))}
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
    const target = getContexts()[0];
    return renderEmptyState({
      icon: "ap-icon-antenna",
      title: "Tell me what to watch",
      body: "Turn on the listening sources in a Playbook and I'll bring you what your market is publishing.",
      actionHtml: target
        ? `<button type="button" class="ap-button primary blue" data-topics-configure="${escapeAttr(target.id)}">
             <i class="ap-icon-target"></i><span>Open ${escapeText(target.name)}</span>
           </button>`
        : "",
      wrapperClass: "topics-view__empty",
    });
  }
  if (total > 0 && view.source !== "all") {
    const source = findTopicSource(view.source);
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "Nothing from that source",
      body: `I haven't brought you anything from ${source ? source.name : "that source"} yet.`,
      actionHtml: `<button type="button" class="ap-button stroked grey" data-topics-source="all">Show everything</button>`,
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
    const chip = event.target.closest("[data-topics-source]");
    if (chip) {
      view.source = chip.dataset.topicsSource;
      paint(target);
      return;
    }
    if (event.target.closest("[data-topics-refresh]")) {
      startScan(target);
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
