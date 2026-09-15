// ---- Insights — the shell: one model, three layouts, a switch -----------------
//
// /insights is where the active Playbook's objectives are read: where each one
// stands (On track / At risk / Off track), how its measures moved over the
// window, and which posts drafted with Archie moved them. Nothing else lives
// here — no production stats, no brand KPIs outside a measure, no history feed.
// The previous hub grew all of those and read as a report about Archie; this is
// a view of the reader's objectives.
//
// Three LAYOUTS paint the same model, chosen from the topbar's View switch and
// remembered in localStorage — the catalogue and the choice live in views.js,
// because the topbar renders the switch and the shell paints the choice:
//   cockpit     — the instrument panel (default): a rail of every objective,
//                 one read in full beside it
//   mob_index   — a grid of objective cards, each with its curve; the one you
//                 click read at full width behind a crumb
//   mob_side    — the narrow column on the RIGHT, filled with facts rather
//                 than navigation
// They are deliberately different answers to "how do I read my objectives", so
// the switch exists to compare them live — it is a prototype exploration, and
// the day one wins the other is a delete. A third, Bento (a mosaic of tiles),
// was built and cut: at a glance is not how anyone reads an objective, and the
// board turned every measure into a number without its curve.
//
// The shell owns everything that is NOT painting: the topbar, the click
// dispatch (every action is a `data-ins-*` hook every layout renders the same
// way), the modal and chat doors, the post removal + Undo, the focus handoff
// from a Playbook's objectives block, the store subscriptions and the teardown.
// A layout is a pure `render(host, vm) → cleanup` and never binds a listener.
//
// Charts: Highcharts keeps a reference and a resize listener per chart, so the
// host is never repainted without `destroyChartsIn(host)` first — the one rule
// that keeps a brand switch from leaking a chart per repaint.

import { html, raw } from "../../utils.js?v=1213";
import { renderTopbar } from "../../components/topbar.js?v=1213";
import { subscribe as subscribeContexts, updateContext } from "../../contexts-store.js?v=1213";
import {
  subscribe as subscribeScope,
  getActivePlaybook,
  getActivePlaybookId,
  setActivePlaybook,
} from "../../active-playbook.js?v=1213";
import { getPath, navigate } from "../../router.js?v=1213";
import { isFlagOn } from "../../feature-flags.js?v=1213";
import { parseHashParams, setHashQuery } from "../../url-state.js?v=1213";
import { consumeHandoff } from "../../handoff.js?v=1213";
import { open as openObjectiveModal } from "../../components/objective-modal.js?v=1213";
import { openObjectiveInChat, repurposePostInChat } from "../../objective-flow.js?v=1213";
import { renderEmptyState } from "../../components/empty-state.js?v=1213";
import { playbookTitle } from "./pieces.js?v=1213";
import { objectiveEntries, playbookRollup, entryByKey } from "./model.js?v=1213";
import { destroyChartsIn, reflowChartsIn } from "./charts.js?v=1213";
import { DEFAULT_LAYOUT, readLayoutId, writeLayoutId, layoutById } from "./views.js?v=1213";

/** Set by a Playbook's objectives block ("Open in Insights"); payload `${ctxId}::${label}`. */
export const FOCUS_OBJECTIVE_HANDOFF = "focusObjective";

// ── Module state ──────────────────────────────────────────────────────────

let host = null;
let section = null;
let layoutId = DEFAULT_LAYOUT;
let layoutCleanup = null;
let focusKey = null;
let focused = false;
let firstPaint = true;
let raf = 0;
// Survives teardown on purpose — it is how a remount tells itself apart from a
// first arrival (see renderInsights).
let lastMountKey = null;

// Layout-local UI state the shell keeps across repaints — which measure a
// chapter or a pane is charting. Not persisted: it is the reader's place on the
// page, not a preference.
const local = { measureTab: {} };

const unsubs = [];
let topbarEl = null;
let boundTarget = null;

// ── No page bar ───────────────────────────────────────────────────────────
//
// There was one, and all three of its controls left. The SCOPE became the
// heading each layout renders (`playbookTitle`), the VIEW switch went to the
// topbar (views.js) where prototype chrome belongs, and New objective followed
// it there — a row of the page spent on one button, sitting above a header that
// then had to compete with it for the top of the screen. What is left below the
// topbar is the reading, and its own header band.

// ── Empty states ──────────────────────────────────────────────────────────

// With no objectives no layout renders, and the heading is the only Playbook
// switcher there is — so the empty page keeps it above the state. Without it a
// brand with an empty Insights was a dead end: nothing on screen could re-point
// the page off it.
function renderEmptyPage(ctx) {
  // `playbookTitle` is empty in workspace mode (pieces.js) — the rail is the
  // switcher there, so the band has nothing to carry and an empty one would be
  // a white 56px strip with a rule under it. The empty state carries its own
  // title, so nothing takes its place.
  const brand = ctx ? playbookTitle(ctx) : "";
  const head = brand ? `<header class="insights__band"><div class="insights__band-inner">${brand}</div></header>` : "";
  return head + renderEmpty(ctx);
}

function renderEmpty(ctx) {
  if (!ctx) {
    return renderEmptyState({
      icon: "ap-icon-target ap-icon-lg",
      level: 1,
      title: "No Playbook yet",
      body: "Insights reads the objectives of the active Playbook. Build one and its objectives show up here.",
      wrapperClass: "insights__empty",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-target ap-icon-lg",
    level: 1,
    title: `No objectives on ${ctx.brandName || ctx.name} yet`,
    body: "An objective is a sentence with measures under it — pick a metric from the catalogue and a target, and its verdict is read from the numbers.",
    actionHtml: `<button type="button" class="ap-button primary blue" data-ins-new><i class="ap-icon-plus" aria-hidden="true"></i><span>New objective</span></button>`,
    wrapperClass: "insights__empty",
  });
}

// ── Painting ──────────────────────────────────────────────────────────────

function currentLayout() {
  return layoutById(layoutId);
}

function paint() {
  if (!host) return;
  if (layoutCleanup) {
    layoutCleanup();
    layoutCleanup = null;
  }
  destroyChartsIn(host);

  const ctx = getActivePlaybook();
  const entries = ctx ? objectiveEntries(ctx) : [];
  section.className = `screen insights insights--${layoutId}`;

  if (!ctx || !entries.length) {
    host.innerHTML = renderEmptyPage(ctx);
    return;
  }

  const rollup = playbookRollup(entries, ctx);
  const selected = parseHashParams().get("objective") || focusKey;
  // firstPaint gates the load reveal: a repaint replaces innerHTML, and a CSS
  // animation on fresh nodes restarts — so re-animating on every store notify
  // would flicker the page on a brand switch or an edited objective.
  const vm = { entries, rollup, ctx, layoutId, focusKey, selectedKey: selected, local, firstPaint };
  firstPaint = false;
  layoutCleanup = currentLayout().render(host, vm) || null;
  focusOnce();
}

// The focus handoff scrolls to one objective once per mount — not on every
// repaint, or a brand edit would yank the reader back to that card.
function focusOnce() {
  if (focused || !focusKey) return;
  const node = host.querySelector(`[data-ins-objective="${cssEscape(focusKey)}"]`);
  focused = true;
  if (!node) return;
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  node.classList.add("is-focused");
  window.setTimeout(() => node.classList.remove("is-focused"), 1800);
}

function cssEscape(s) {
  return window.CSS?.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

// Coalesce a burst of store notifications into one paint. A macrotask, not
// requestAnimationFrame: rAF never fires in a hidden tab, so a Playbook edit
// made while Insights sits in a background tab would repaint only on return —
// and a headless check of the page would never see the update at all.
function schedulePaint() {
  if (raf) return;
  raf = window.setTimeout(() => {
    raf = 0;
    paint();
  }, 0);
}

// ── Actions ───────────────────────────────────────────────────────────────

// The modal mutates the live Playbook object and calls back; a store notify
// with a fresh `updatedAt` is what repaints every reader (contexts-store
// pattern — objectiveMeasures rides along on the same object).
function commit(ctxId) {
  updateContext(ctxId || getActivePlaybookId(), { updatedAt: "just now" });
}

function onClick(event) {
  // Every dropdown here is a <details>, which does not close itself on an
  // outside click. Any click not inside the open one shuts it — before the
  // dispatch guard below, so a click on empty page space still closes it.
  // Two hosts, because the two dropdowns live on either side of #app: the scope
  // switcher is a layout's heading, the View switch is in the topbar. A query
  // that saw only one left the other stuck open.
  [section, topbarEl].forEach((root) =>
    root?.querySelectorAll("[data-ins-scope][open]").forEach((d) => {
      if (!d.contains(event.target)) d.removeAttribute("open");
    }),
  );

  const t = event.target.closest(
    "[data-ins-new],[data-ins-adjust],[data-ins-chat],[data-ins-select],[data-ins-unselect],[data-ins-measure-tab],[data-ins-jump],[data-ins-scope-pick],[data-ins-repurpose],[data-ins-view]",
  );
  if (!t) return;
  const ds = t.dataset;

  if (ds.insView) {
    if (ds.insView === layoutId) return;
    event.preventDefault();
    t.closest("[data-ins-scope]")?.removeAttribute("open");
    layoutId = ds.insView;
    writeLayoutId(layoutId);
    // The switch is in the topbar and shows the CURRENT reading, so it has to
    // be repainted with the page — otherwise it keeps naming the view the
    // reader just left.
    renderTopbar();
    // NO reveal here. Switching view is the reader re-arranging the page they
    // are already reading, not arriving on it — and it is a control they use to
    // compare, so it gets used repeatedly. Re-running the 300ms rise on every
    // click made the whole page bounce each time.
    paint();
    return;
  }
  if (ds.insScopePick) {
    // Re-point the whole dashboard. setActivePlaybook notifies and the scope
    // subscription repaints; a ?objective from the old brand is dropped rather
    // than left to miss, since the key carries the Playbook id.
    event.preventDefault();
    t.closest("[data-ins-scope]")?.removeAttribute("open");
    if (ds.insScopePick === getActivePlaybookId()) return;
    focusKey = null;
    if (parseHashParams().get("objective")) setHashQuery(getPath(), {});
    setActivePlaybook(ds.insScopePick);
    return;
  }

  if ("insNew" in ds) {
    openObjectiveModal({ mode: "create", contextId: getActivePlaybookId(), onChange: commit });
    return;
  }
  if (ds.insAdjust) {
    const entry = entryByKey(ds.insAdjust);
    if (!entry) return;
    openObjectiveModal({ data: entry.context, label: entry.label, mode: "adjust", onChange: commit });
    return;
  }
  if (ds.insChat) {
    const entry = entryByKey(ds.insChat);
    if (entry) openObjectiveInChat(entry);
    return;
  }
  if (ds.insRepurpose) {
    // Straight into a chat that opens on the post — Insights has no composer of
    // its own, and the winners board's repurpose flow keys on top-posts-store,
    // which these evidence rows are not in.
    const entry = entryByKey(ds.insRepurpose);
    const post = entry?.posts.find((p) => p.id === ds.insPost);
    if (entry && post) repurposePostInChat(entry, post);
    return;
  }
  if (ds.insSelect) {
    // Cockpit's selection rides in the URL so a link carries the objective;
    // the router re-runs this screen on the query change.
    setHashQuery(getPath(), { objective: ds.insSelect });
    return;
  }
  if ("insUnselect" in ds) {
    // The way back UP a level, for a lecture that has one (mob_index): drop
    // ?objective and the layout renders its index again. Same primitive the
    // scope pick uses above to purge a key belonging to another brand.
    setHashQuery(getPath(), {});
    return;
  }
  if (ds.insMeasureTab) {
    local.measureTab[ds.insMeasureTab] = ds.insMeasure;
    paint();
    return;
  }
  if (ds.insJump) {
    const node = host.querySelector(`[data-ins-objective="${cssEscape(ds.insJump)}"]`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

// ← → walk a radiogroup and a tablist; Home / End jump to the ends. Both
// patterns require it, and both had every option in the tab order instead.
function onKeydown(event) {
  const KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!KEYS.includes(event.key)) return;
  const group = event.target.closest("[data-ins-tablist]");
  if (!group) return;
  const items = [...group.querySelectorAll('[role="tab"]')];
  const from = items.indexOf(event.target);
  if (from < 0) return;
  event.preventDefault();
  const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
  const to =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (from + (back ? -1 : 1) + items.length) % items.length;
  items[to].focus();
  items[to].click();
}

// The select's aria-expanded has to follow the <details>, or it lies the moment
// the reader opens it.
function onToggle(event) {
  const details = event.target.closest?.("[data-ins-scope]");
  if (!details) return;
  // `[role="combobox"]`, not `.ap-select-trigger`: the scope switcher's trigger
  // wears the heading's class, and only the role is common to both.
  details.querySelector('[role="combobox"]')?.setAttribute("aria-expanded", String(details.open));
}

function onResize() {
  if (host) reflowChartsIn(host);
}

// ── Mount / teardown ──────────────────────────────────────────────────────

export function renderInsights(_params, target) {
  // The flag hid the nav row but not the route, so a typed URL or an old
  // bookmark opened a surface the switch says does not exist. A stale deep link
  // bounces home, same as /topics.
  if (!isFlagOn("insightsHub")) {
    navigate("/");
    return () => {};
  }
  teardown();
  renderTopbar();

  layoutId = readLayoutId();
  // The reveal plays when this is a NEW reading, not on every mount: selecting
  // an objective writes `?objective=` and the router re-runs this handler, so a
  // tab click in Report (and a row click in Cockpit) is a remount of the same
  // page — re-animating it made the whole page jump on every switch.
  //
  // The layout is deliberately NOT part of the key: it is how the same reading
  // is arranged, not which reading it is. With it in, switching view and then
  // clicking an objective produced a key never seen before and the entrance
  // replayed one click after the switch — the same bounce, one step removed.
  const mountKey = getActivePlaybookId() || "none";
  firstPaint = mountKey !== lastMountKey;
  lastMountKey = mountKey;
  // ONLY the handoff highlights. `?objective=` is how a selection is expressed
  // now, so reading it here flashed the arrival outline every time the reader
  // switched objective — the highlight means "you were sent here", nothing else.
  focusKey = consumeHandoff(FOCUS_OBJECTIVE_HANDOFF) || null;
  focused = false;

  target.innerHTML = html`<section class="screen insights insights--${layoutId}">
    <div class="insights__host" data-ins-host></div>
  </section>`;
  section = target.querySelector(".insights");
  host = target.querySelector("[data-ins-host]");

  paint();

  // `target` is the router's #app, reused across navigations — and the topbar
  // sits OUTSIDE it, so the switch and New-objective need their own binding.
  boundTarget = target;
  boundTarget.addEventListener("click", onClick);
  boundTarget.addEventListener("keydown", onKeydown);
  boundTarget.addEventListener("toggle", onToggle, true);
  topbarEl = document.getElementById("topbar");
  topbarEl?.addEventListener("click", onClick);
  topbarEl?.addEventListener("keydown", onKeydown);
  // `toggle` does not bubble — hence capture, and hence on both hosts: the
  // View switch's <details> is in the topbar, the scope switcher's is in #app.
  topbarEl?.addEventListener("toggle", onToggle, true);
  window.addEventListener("resize", onResize);

  unsubs.push(subscribeContexts(schedulePaint), subscribeScope(schedulePaint));

  return teardown;
}

function teardown() {
  if (raf) {
    window.clearTimeout(raf);
    raf = 0;
  }
  while (unsubs.length) unsubs.pop()?.();
  if (layoutCleanup) {
    layoutCleanup();
    layoutCleanup = null;
  }
  if (host) destroyChartsIn(host);
  boundTarget?.removeEventListener("click", onClick);
  boundTarget?.removeEventListener("keydown", onKeydown);
  boundTarget?.removeEventListener("toggle", onToggle, true);
  topbarEl?.removeEventListener("click", onClick);
  topbarEl?.removeEventListener("keydown", onKeydown);
  topbarEl?.removeEventListener("toggle", onToggle, true);
  window.removeEventListener("resize", onResize);
  boundTarget = null;
  topbarEl = null;
  host = null;
  section = null;
}
