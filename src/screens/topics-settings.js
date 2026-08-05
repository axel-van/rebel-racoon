// Topics settings — route /topics/settings.
//
// Which listening sources are live for a Playbook, and how often I check them.
//
// A SETTINGS PAGE, not a tab beside the feed. A tab gives this equal billing with
// the feed, and that's wrong for what it is: you set your sources once and then
// read topics for months. The feed is the destination; this is somewhere you visit
// occasionally and leave. It was built as a tab first and that's the mistake this
// route corrects.
//
// It's also NOT a return of the aggregated Settings page that's been reverted three
// times here — the project rule allows config on the entity that owns it OR on a
// route scoped to one feature, and this is the second. The data stays per Playbook
// (`ctx.topics`); only the surface is here.
//
// ONE Playbook at a time, scoped by `?pb=` — the same param the feed filters on, so
// filtering the feed to a brand and opening settings lands on that brand. Stacking a
// block per Playbook was the first shape and it doesn't scale: at twenty Playbooks
// that's 120 switches with each of the six descriptions repeated twenty times, and
// it's the descriptions, not the switches, that make such a page explode.
//
// Chrome follows the DS settings recipe (`--sys-settings-*`). The shape: a light
// labelled toolbar for the two page-level controls, then ONE CARD PER SOURCE in two
// columns. The first pass gave each control a card and stacked the six sources as rows
// inside a seventh — a card title over a single select is mostly padding, and a row
// can't hold a source's own options. No save bar: every control commits immediately
// through updateContext.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { parseHashParams } from "../url-state.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=287";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { isFlagOn } from "../feature-flags.js?v=16";
import {
  getContexts,
  getContextById,
  getDefaultContext,
  updateContext,
  subscribe as subscribeContexts,
} from "../contexts-store.js?v=46";
import {
  TOPIC_SOURCES,
  CADENCES,
  DEFAULT_ENABLED_IDS,
  DEFAULT_CADENCE,
  findTopicSource,
  findCadence,
} from "../topics-catalog.js?v=2";

// Above this many Playbooks the picker earns a search field. Below it, a search box
// over four rows is just noise.
const PB_SEARCH_THRESHOLD = 8;

let unsubscribeContexts = null;
let boundTarget = null;
let boundClick = null;
let boundChange = null;
let boundInput = null;

// Which Playbook this page is scoped to, from `?pb=`. In the URL rather than module
// state because a per-entity config surface MUST carry its scope: otherwise
// configuring Playbook B and pressing back silently shows you Playbook A's switches.
// Falls back to the default (★) Playbook, then the first — a deleted or bogus id
// renders something real instead of an empty page.
function activePlaybookId() {
  const wanted = parseHashParams().get("pb");
  if (wanted && getContextById(wanted)) return wanted;
  return getDefaultContext()?.id || getContexts()[0]?.id || null;
}

export function renderTopicsSettings(_params, target) {
  // Same gate as the feed: when the flag is off the route is unreachable from the
  // UI, but a stale deep link has to bounce home.
  if (!isFlagOn("topics")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Every control writes through updateContext, so the store's notify is what
  // repaints — there's no local draft state to keep in sync.
  unsubscribeContexts = subscribeContexts(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribeContexts) {
    unsubscribeContexts();
    unsubscribeContexts = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundChange) boundTarget.removeEventListener("change", boundChange);
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
  boundChange = null;
  boundInput = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen topics-settings">${raw(renderPage())}</section>`;
}

// ─── Render ────────────────────────────────────────────────────────────────

// Read-only view of a Playbook's topics config. contexts-store already normalises
// it, but a caller shouldn't have to trust that to render — and this must never
// mutate the stored object, since every write goes through updateContext so the
// store can notify.
function watchConfig(ctx) {
  const t = (ctx && ctx.topics) || {};
  return {
    enabledSourceIds: Array.isArray(t.enabledSourceIds) ? t.enabledSourceIds : DEFAULT_ENABLED_IDS.slice(),
    cadence: findCadence(t.cadence) ? t.cadence : DEFAULT_CADENCE,
  };
}

// A comparable fingerprint of what a Playbook watches, for counting how many others
// differ from the selected one.
function watchKey(ctx) {
  const c = watchConfig(ctx);
  return `${c.enabledSourceIds.slice().sort().join(",")}|${c.cadence}`;
}

function renderPage() {
  const playbooks = getContexts();
  if (!playbooks.length) {
    return html`<div class="topics-settings__content">
      ${raw(
        renderEmptyState({
          icon: "ap-icon-target",
          title: "No Playbooks yet",
          body: "I listen on behalf of a Playbook. Create one and I'll show you what I can watch for it.",
          actionHtml: `<button type="button" class="ap-button primary blue" data-topics-playbooks><i class="ap-icon-target"></i><span>Go to Playbooks</span></button>`,
          wrapperClass: "topics-settings__empty",
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

  const count =
    onCount === 0
      ? "Nothing on yet — turn one on and I'll start watching."
      : `${onCount} of ${TOPIC_SOURCES.length} on`;

  return html`
    <div class="topics-settings__content">
      <header class="topics-settings__head">
        <h1 class="ap-h1 topics-settings__title">Topics settings</h1>
        <p class="ap-body topics-settings__lead">
          The sources I listen to on your behalf, and how often I check them. Everything I find lands in your Topics
          feed.
        </p>

        <!-- A labelled toolbar, not a card each. These two controls scope everything
             below — which Playbook, what rhythm — and a card apiece is what made this
             page read as two mostly-empty boxes, one of them a title over a single
             select. Same two-select shape as the feed's filter bar, so the pair of
             screens looks related. "Playbook" is named in prose as well as offered as a
             control: a page that looks like settings otherwise reads as global, and
             .ap-select collapses to one option when there's a single Playbook.
             The wrapper is the DS ap-form-field primitive: label above control, and it
             styles its direct > label, so nothing wraps that. (No code ticks anywhere in
             here — a backtick inside this comment ends the template literal.) -->
        <div class="topics-settings__bar">
          <div class="ap-form-field topics-settings__field">
            <label>Playbook</label>
            ${raw(renderPlaybookSelect(playbooks, ctx))}
          </div>
          <div class="ap-form-field topics-settings__field">
            <label>How often I check</label>
            ${raw(renderCadenceSelect(ctx, findCadence(conf.cadence)))}
          </div>
        </div>

        <!-- Playbook-level facts only. The on/off count belongs to the source grid and
             is stated there, so the two lines don't say the same thing twice. -->
        <p class="topics-settings__meta">
          ${raw(
            differing
              ? html`<span
                    >${differing === 1 ? "1 other Playbook watches" : `${differing} other Playbooks watch`} different
                    sources.</span
                  >
                  <span aria-hidden="true">·</span>`
              : "",
          )}
          <button type="button" class="ap-link" data-topics-configure="${escapeAttr(ctx.id)}">Open the Playbook</button>
        </p>
      </header>

      <section class="topics-settings__sources">
        <!-- A real heading, styled as a group label rather than a third size of bold:
             at 24 / 16 the page title and the card titles already carry the hierarchy,
             and a 16px "Sources" between them just flattens it. -->
        <div class="topics-settings__group">
          <h2 class="ap-caption-bold topics-settings__group-title">Sources</h2>
          <span aria-hidden="true">·</span>
          <span class="topics-settings__count">${count}</span>
        </div>
        <!-- One card per source, not six rows in one card. A card can carry that
             source's own options later; a row can't without turning the list into a
             form. Two columns, so the set is one glance instead of a long scroll. -->
        <div class="topics-settings__grid">
          ${raw(TOPIC_SOURCES.map((s) => renderWatchSource(ctx, s, enabled.has(s.id))).join(""))}
        </div>
      </section>
    </div>
  `;
}

// The picker doubles as the overview: each option carries "5 of 6 · weekly" as a DS
// caption, so you can compare Playbooks without leaving the page — most of what the
// stacked layout was actually good for.
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

  return html`<details class="ap-select topics-settings__pbselect">
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

// DS .ap-select over <details> — never a bare native <select>.
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
  return html`<details class="ap-select topics-settings__cadence">
    <summary class="ap-select-trigger">
      <span class="ap-select-value">${active.label}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Refresh cadence for ${escapeAttr(ctx.name)}">
      <div class="ap-select-options">${raw(options)}</div>
    </div>
  </details>`;
}

// One source, one card. The switch sits in the card's header because it's the card's
// on/off, and the footer is the slot a source's own options go in — the reason each
// source is a card rather than a row. Nothing has options yet, so today the footer
// carries only the Playbook dependency, and only the two sources that have one.
function renderWatchSource(ctx, source, on) {
  // The competitor-driven sources state their dependency as a caption, not a link:
  // the page already has one link to the Playbook, and six more would be noise. What
  // matters is knowing WHY the source needs the Playbook.
  const foot =
    source.playbookAnchor === "competitors"
      ? html`<footer class="topics-src__foot">
          <span class="topics-src__note">
            <i class="ap-icon-buildings" aria-hidden="true"></i><span>Reads your competitors</span>
          </span>
        </footer>`
      : "";

  return html`<article class="ap-card topics-src${raw(on ? "" : " is-off")}">
    <header class="topics-src__head">
      <span class="topic-badge topic-badge--lg topic-badge--${source.accent}" aria-hidden="true">
        <i class="${source.icon}"></i>
      </span>
      <h3 class="ap-card-title topics-src__name">${source.name}</h3>
      <label class="ap-toggle-container topics-src__switch">
        <input
          type="checkbox"
          data-topics-toggle="${escapeAttr(`${ctx.id}::${source.id}`)}"
          ${raw(on ? "checked" : "")}
          aria-label="${escapeAttr(`${source.name} for ${ctx.name}`)}"
        />
        <i aria-hidden="true"></i>
      </label>
    </header>
    <p class="topics-src__desc">${source.description}</p>
    ${raw(foot)}
  </article>`;
}

// ─── Interaction ───────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    // Playbook pick — rewrites `?pb=`, which the router turns into a repaint.
    const pbPick = event.target.closest("[data-topics-pb]");
    if (pbPick) {
      pbPick.closest("details")?.removeAttribute("open");
      navigate(`/topics/settings?pb=${encodeURIComponent(pbPick.dataset.topicsPb)}`);
      return;
    }
    // Cadence pick. Commits straight through updateContext — this surface has no Save
    // button, so nothing is staged.
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
    const configure = event.target.closest("[data-topics-configure]");
    if (configure) {
      navigate(`/playbook/${configure.dataset.topicsConfigure}`);
      return;
    }
    if (event.target.closest("[data-topics-playbooks]")) {
      navigate("/contexts");
    }
  };
  target.addEventListener("click", boundClick);

  // The switches are checkboxes, so `change` — not `click`. It fires once (a click on
  // the wrapping <label> forwards to the input, which would double up), and it also
  // catches the keyboard's Space.
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
    // Keep catalog order rather than click order, so the stored list stays readable
    // and two Playbooks with the same set serialise identically.
    const enabledSourceIds = TOPIC_SOURCES.filter((s) => next.has(s.id)).map((s) => s.id);

    updateContext(ctxId, { topics: { ...conf, enabledSourceIds } });

    // The repaint replaced the node the user was on, so put focus back where they
    // left it — otherwise every keyboard toggle dumps them at the top of the page.
    const again = target.querySelector(`[data-topics-toggle="${CSS.escape(key)}"]`);
    if (again) again.focus({ preventScroll: true });
  };
  target.addEventListener("change", boundChange);

  boundInput = (event) => {
    const field = event.target.closest("[data-topics-pb-search]");
    if (!field) return;
    filterDropdownRows({
      field,
      scopeSelector: ".ap-select-dropdown",
      rowSelector: "[data-topics-pb]",
      nameAttr: "topicsPbName",
      emptySelector: "[data-topics-pb-empty]",
    });
  };
  target.addEventListener("input", boundInput);
}

// Deliberately duplicated from screens/topics.js rather than shared: it's fifteen
// lines of DOM work with no state, and a module for one helper used by two screens
// costs more than the copy. Both copies filter the same way — in the DOM, on `input`,
// never by repainting. A repaint would close the <details> and take the caret with
// it, which is also why neither keeps its query in state. Rows hide by inline display
// rather than the [hidden] attribute: the DS gives both the option rows and the
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
