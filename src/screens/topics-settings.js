// Topic Feed settings — route /topics/settings.
//
// Which listening sources are live for a Playbook, how often the feed runs, and
// which sites the Brand-website source reads.
//
// A SETTINGS PAGE, not a tab beside the feed. A tab gives this equal billing with
// the feed, and that is wrong for what it is: you set your sources once and then
// read Topics for months. The feed is the destination; this is somewhere you visit
// occasionally and leave.
//
// It is NOT a return of the aggregated Settings page that has been reverted four
// times here — the project rule allows config on the entity that owns it OR on a
// route scoped to one feature, and this is the second. The data lives in
// topic-feeds-store, keyed by Playbook; only the surface is here.
//
// ONE Playbook at a time, scoped by `?pb=` — the same param the feed filters on,
// so filtering the feed to a brand and opening settings lands on that brand, and
// the topbar's back carries it home again. Under `playbookWorkspace` the rail
// owns the scope instead: `?pb=` is not read, the page's own Playbook select
// states the brand rather than offering the others, and nothing writes the param
// any more. Stacking a block per Playbook was the
// first shape this page ever had and it does not scale: at twenty Playbooks that
// is 160 switches with each of the eight descriptions repeated twenty times, and
// it is the descriptions, not the switches, that make such a page explode.
//
// Chrome follows the DS settings recipe (`--sys-settings-*`). The shape: a light
// labelled toolbar for the two page-level controls, then ONE CARD PER SOURCE in
// two columns. A card can carry that source's own options — which Brand website
// now does — and a row cannot without turning the list into a form. No save bar:
// every control commits immediately through updateFeed.

import { html, raw, escapeAttr } from "../utils.js?v=1163";
import { navigate } from "../router.js?v=1163";
import { parseHashParams } from "../url-state.js?v=1163";
import { renderTopbar } from "../components/topbar.js?v=1163";
import { renderEmptyState } from "../components/empty-state.js?v=1163";
import { isFlagOn } from "../feature-flags.js?v=1163";
import { getContextById, getDefaultContext } from "../contexts-store.js?v=1163";
import {
  getActivePlaybook,
  isWorkspaceMode,
  catalogueRoute,
  subscribe as subscribeScope,
} from "../active-playbook.js?v=1163";
import { editableContexts, canEdit } from "../playbook-access.js?v=1163";
import { getFeedForPlaybook, updateFeed, subscribe as subscribeFeeds } from "../topic-feeds-store.js?v=1163";
import { TOPIC_SOURCES, CADENCES, findTopicSource, findCadence, isLiveSource } from "../topics-catalog.js?v=1163";
import { open as openFeedback } from "../components/feedback-modal.js?v=1163";

// Above this many Playbooks the picker earns a search field. Below it, a search
// box over four rows is just noise.
const PB_SEARCH_THRESHOLD = 8;

let unsubscribeFeeds = null;
let unsubscribeScope = null;
let boundTarget = null;
let boundClick = null;
let boundChange = null;
let boundInput = null;

// Which Playbook this page is scoped to, from `?pb=`. In the URL rather than
// module state because a per-entity config surface MUST carry its scope:
// otherwise configuring Playbook B and pressing back silently shows Playbook A's
// switches.
//
// A Playbook I cannot edit cannot be scoped to either — a stale `?pb=` pointing
// at someone else's shared Playbook falls back rather than showing switches that
// would refuse to commit.
function activePlaybookId() {
  // Workspace mode: the page configures the feed of the brand you are IN, and
  // `?pb=` is not read — the rail is the only scope. The canEdit guard still
  // applies: a Playbook I can't edit can't be configured either.
  if (isWorkspaceMode()) {
    const active = getActivePlaybook();
    if (active && canEdit(active)) return active.id;
    return editableContexts()[0]?.id || null;
  }
  const wanted = parseHashParams().get("pb");
  if (wanted && canEdit(getContextById(wanted))) return wanted;
  const fallback = getDefaultContext();
  if (fallback && canEdit(fallback)) return fallback.id;
  return editableContexts()[0]?.id || null;
}

export function renderTopicsSettings(_params, target) {
  // Same gate as the feed: with the flag off the route is unreachable from the
  // UI, but a stale deep link has to bounce home.
  if (!isFlagOn("topicFeed")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Every control writes through updateFeed, so the store's notify is what
  // repaints — there is no local draft state to keep in sync.
  unsubscribeFeeds = subscribeFeeds(() => paint(target));
  // A brand switched in the rail re-points this page in place — the switches
  // shown are the ones of the feed you are now in.
  unsubscribeScope = subscribeScope(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribeFeeds) {
    unsubscribeFeeds();
    unsubscribeFeeds = null;
  }
  if (unsubscribeScope) {
    unsubscribeScope();
    unsubscribeScope = null;
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

// A comparable fingerprint of what a Playbook listens to, for counting how many
// others differ from the selected one.
function feedKey(pb) {
  const feed = getFeedForPlaybook(pb.id);
  if (!feed) return "";
  return `${feed.sources.slice().sort().join(",")}|${feed.cadence}`;
}

function renderPage() {
  // Which sources run and how often is the OWNER's call: it is the job Archie
  // runs for that brand, not something a reader of a shared Playbook decides.
  const playbooks = editableContexts();
  if (!playbooks.length) {
    return html`<div class="topics-settings__content">
      ${raw(
        renderEmptyState({
          icon: "ap-icon-target",
          title: "No Playbooks yet",
          body: "I listen on behalf of a Playbook. Create one and I'll show you what I can watch for it.",
          actionHtml: `<button type="button" class="ap-button primary blue" data-settings-playbooks><i class="ap-icon-target"></i><span>Go to Playbooks</span></button>`,
          wrapperClass: "topics-settings__empty",
        }),
      )}
    </div>`;
  }

  const ctx = getContextById(activePlaybookId()) || playbooks[0];
  const feed = getFeedForPlaybook(ctx.id);
  const enabled = new Set(feed ? feed.sources : []);
  const onCount = TOPIC_SOURCES.filter((s) => enabled.has(s.id)).length;

  const mine = feedKey(ctx);
  // "N other Playbooks listen to different sources" was the picker's companion:
  // a reason to open it and compare. In workspace mode there is no picker here
  // and the other brands are out of scope, so the line points at something this
  // page can no longer reach — it goes, and "Open the Playbook" stands alone.
  const differing = isWorkspaceMode() ? 0 : playbooks.filter((c) => c.id !== ctx.id && feedKey(c) !== mine).length;

  const count =
    onCount === 0
      ? "Nothing on yet — turn one on and I'll start listening."
      : `${onCount} of ${TOPIC_SOURCES.length} on`;

  return html`
    <div class="topics-settings__content">
      <header class="topics-settings__head">
        <h1 class="ap-h1 topics-settings__title">Feed settings</h1>
        <p class="ap-body topics-settings__lead">
          The sources I listen to on your behalf, and how often I check them. Everything I find lands in this Playbook's
          Topic Feed.
        </p>

        <!-- A toolbar, not a card each. These two controls scope everything
             below — which Playbook, what rhythm — and a card apiece is what made
             this page read as two mostly-empty boxes, one of them a title over a
             single select.

             Each label sits INSIDE its control, via the DS's own
             .ap-select-inline-label: that is the "Creator | Select" shape the
             product uses in every one of its toolbars, and stacking a <label>
             above a select is form chrome that does not belong on one. Same
             treatment as the feed's own toolbar, so the pair of screens reads as
             related. -->
        <div class="topics-settings__bar">
          ${raw(renderPlaybookSelect(playbooks, ctx))} ${raw(renderCadenceSelect(feed, findCadence(feed?.cadence)))}
        </div>

        <p class="topics-settings__meta">
          ${raw(
            differing
              ? html`<span
                    >${differing === 1 ? "1 other Playbook listens to" : `${differing} other Playbooks listen to`}
                    different sources.</span
                  >
                  <span aria-hidden="true">·</span>`
              : "",
          )}
          <button type="button" class="ap-link" data-settings-playbook="${escapeAttr(ctx.id)}">
            ${isWorkspaceMode() ? `Open ${ctx.name}` : "Open the Playbook"}
          </button>
        </p>
      </header>

      <section class="topics-settings__sources">
        <!-- A real heading, styled as a group label rather than a third size of
             bold: at 24 / 16 the page title and the card titles already carry the
             hierarchy, and a 16px "Sources" between them just flattens it. -->
        <div class="topics-settings__group">
          <h2 class="ap-caption-bold topics-settings__group-title">Sources</h2>
          <span aria-hidden="true">·</span>
          <span class="topics-settings__count">${count}</span>
        </div>
        <div class="topics-settings__grid">
          ${raw(TOPIC_SOURCES.map((s) => renderSourceCard(ctx, feed, s, enabled.has(s.id))).join(""))}
        </div>
      </section>
    </div>
  `;
}

// The picker doubles as the overview: each option carries "5 of 8 · weekly" as a
// DS caption, so you can compare Playbooks without leaving the page — most of
// what the stacked layout was actually good for.
function renderPlaybookSelect(playbooks, active) {
  // ⚠️ Workspace mode: no select at all. The rail owns the scope, so this one
  // could only be a disabled restatement of it — and this page has real
  // switches, next to which a greyed-out field reads as one more thing that
  // refuses to move. What the page loses is the brand's NAME in the bar; the
  // "Open the Playbook" link below picks it up (see renderPage), which keeps
  // the name on a control that still does something.
  if (isWorkspaceMode()) return "";
  const options = playbooks
    .map((c) => {
      const feed = getFeedForPlaybook(c.id);
      const on = feed ? TOPIC_SOURCES.filter((s) => feed.sources.includes(s.id)).length : 0;
      const isActive = c.id === active.id;
      return html`<div
        class="ap-select-option${raw(isActive ? " selected" : "")}"
        data-settings-pb="${escapeAttr(c.id)}"
        data-settings-pb-name="${escapeAttr(c.name.toLowerCase())}"
        role="option"
        aria-selected="${isActive ? "true" : "false"}"
      >
        <span class="ap-select-option-content">
          <span class="ap-select-option-text">${c.name}</span>
          <span class="ap-select-option-caption"
            >${on} of ${TOPIC_SOURCES.length} · ${feed ? feed.cadence : "weekly"}</span
          >
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
            data-settings-pb-search
          />
        </div>`
      : "";

  return html`<details class="ap-select topics-settings__pbselect">
    <summary class="ap-select-trigger" title="Which Playbook these sources belong to">
      <span class="ap-select-inline-label">Playbook</span>
      <span class="ap-select-value">${active.name}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="Playbook">
      ${raw(search)}
      <div class="ap-select-options">${raw(options)}</div>
      <!-- Inline display, not the hidden attribute: the DS gives
           .ap-select-not-found display:flex, which out-specifies [hidden] and
           would leave this visible with every option showing. -->
      <div class="ap-select-not-found" data-settings-pb-empty style="display: none">No Playbook matches that.</div>
    </div>
  </details>`;
}

// DS .ap-select over <details> — never a bare native <select>.
function renderCadenceSelect(feed, active) {
  const options = CADENCES.map((c) => {
    const on = !!active && c.id === active.id;
    return html`<div
      class="ap-select-option${raw(on ? " selected" : "")}"
      data-settings-cadence="${escapeAttr(`${feed ? feed.id : ""}::${c.id}`)}"
      role="option"
      aria-selected="${on ? "true" : "false"}"
    >
      <span class="ap-select-option-text">${c.label}</span>
      ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
    </div>`;
  }).join("");
  return html`<details class="ap-select topics-settings__cadence">
    <summary class="ap-select-trigger" title="How often this feed runs">
      <span class="ap-select-inline-label">Refresh</span>
      <span class="ap-select-value">${active ? active.label : "Weekly"}</span>
      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
    </summary>
    <div class="ap-select-dropdown" role="listbox" aria-label="How often the feed runs">
      <div class="ap-select-options">${raw(options)}</div>
    </div>
  </details>`;
}

// One source, one card. The switch sits in the card's header because it is the
// card's on/off, and the footer is the slot a source's own options go in — the
// reason each source is a card rather than a row.
//
// Only competitor-posts is live. The other seven are declared so a reader can see
// the shape of the feature, and their switch is disabled with a Coming-soon tag
// rather than pretending to work — a switch that flips and changes nothing is
// worse than one that says it is not ready.
function renderSourceCard(ctx, feed, source, on) {
  const live = isLiveSource(source.id);

  // The competitor-driven sources depend on a section of the Playbook, so their
  // note LINKS there rather than just naming it. One link per card at most, and
  // only on the cards that have somewhere to send you — the fork put an arrow row
  // on all eight, including the five that read nothing the Playbook holds.
  const anchor = source.playbookAnchor
    ? html`<a
        class="ap-link topics-src__note"
        href="#/playbook/${escapeAttr(ctx.id)}?section=${escapeAttr(source.playbookAnchor)}"
      >
        <i class="ap-icon-buildings" aria-hidden="true"></i><span>Review this Playbook's ${source.playbookAnchor}</span>
      </a>`
    : "";

  // The one source whose subject is a VALUE the feed holds, so its card shows
  // that value instead of only a description. A flag rather than an id check, so
  // a second value-carrying source would not need this renderer touched again.
  const sites = source.showsWebsites && feed ? renderSiteList(feed) : "";

  const foot = anchor || sites ? html`<footer class="topics-src__foot">${raw(anchor)}${raw(sites)}</footer>` : "";

  return html`<article class="ap-card topics-src${raw(on ? "" : " is-off")}">
    <header class="topics-src__head">
      <span class="topic-badge topic-badge--lg topic-badge--${source.accent}" aria-hidden="true">
        <i class="${source.icon}"></i>
      </span>
      <h3 class="ap-card-title topics-src__name">${source.name}</h3>
      ${raw(
        live
          ? ""
          : html`<span class="topics-src__soon-group">
              <span class="ap-tag grey mini topics-src__soon">Coming soon</span>
              <!-- The one thing a reader can do about a source that is not live yet:
                   say how they would use it. Without this the card is a dead end
                   wearing a tag. -->
              <button
                type="button"
                class="ap-link standalone small topics-src__need"
                data-topics-need="${escapeAttr(source.id)}"
              >
                Need this source?
              </button>
            </span>`,
      )}
      <label class="ap-toggle-container topics-src__switch">
        <input
          type="checkbox"
          data-settings-toggle="${escapeAttr(`${feed ? feed.id : ""}::${source.id}`)}"
          ${raw(on ? "checked" : "")}
          ${raw(live ? "" : "disabled")}
          aria-label="${escapeAttr(`${source.name} for ${ctx.name}`)}"
        />
        <i aria-hidden="true"></i>
      </label>
    </header>
    <p class="topics-src__desc">${source.howItWorks}</p>
    ${raw(foot)}
  </article>`;
}

// The sites the Brand-website source scans. Owned by the FEED, not by the
// Playbook: the Playbook's own websiteUrl is the brand's canonical address, while
// this is one feed's scan list, which may add a blog, a docs site or a regional
// domain the brand record has no business holding.
function renderSiteList(feed) {
  const rows = feed.websites
    .map(
      (url, i) =>
        html`<li class="topics-src__site">
          <div class="ap-input-group topics-src__site-field">
            <i class="ap-icon-link" aria-hidden="true"></i>
            <input
              type="url"
              value="${escapeAttr(url)}"
              data-settings-site="${escapeAttr(`${feed.id}::${i}`)}"
              aria-label="Site to scan"
            />
          </div>
          <button
            type="button"
            class="ap-icon-button transparent grey"
            data-settings-site-remove="${escapeAttr(`${feed.id}::${i}`)}"
            aria-label="Remove ${escapeAttr(url)}"
          >
            <i class="ap-icon-close"></i>
          </button>
        </li>`,
    )
    .join("");

  return html`<div class="topics-src__sites">
    <ul class="topics-src__site-list">
      ${raw(rows)}
    </ul>
    <button type="button" class="ap-link standalone small" data-settings-site-add="${escapeAttr(feed.id)}">
      <i class="ap-icon-plus" aria-hidden="true"></i><span>Add another site</span>
    </button>
  </div>`;
}

// ─── Interaction ───────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    // "Need this source?" on a source that is not live yet. Reuses the feedback
    // dialog rather than adding a ninth near-identical shell: its "Feature area"
    // select is a SUBJECT picker, and here the subject is known, so the dialog
    // answers that question instead of asking it.
    const need = event.target.closest("[data-topics-need]");
    if (need) {
      const src = findTopicSource(need.dataset.topicsNeed);
      openFeedback({
        subject: {
          area: "other",
          title: "Need this source?",
          intro: `${src ? src.name : "This source"} isn't live yet. Tell me how you'd use it and it goes to the team building the next ones.`,
          placeholder: "How would you use this source?",
        },
      });
      return;
    }

    // Playbook pick — rewrites `?pb=`, which the router turns into a repaint.
    const pbPick = event.target.closest("[data-settings-pb]");
    if (pbPick) {
      pbPick.closest("details")?.removeAttribute("open");
      navigate(`/topics/settings?pb=${encodeURIComponent(pbPick.dataset.settingsPb)}`);
      return;
    }

    // Cadence pick. Commits straight through updateFeed — this surface has no
    // Save button, so nothing is staged.
    const cadencePick = event.target.closest("[data-settings-cadence]");
    if (cadencePick) {
      cadencePick.closest("details")?.removeAttribute("open");
      const [feedId, cadence] = cadencePick.dataset.settingsCadence.split("::");
      if (feedId && findCadence(cadence)) updateFeed(feedId, { cadence });
      return;
    }

    const addSite = event.target.closest("[data-settings-site-add]");
    if (addSite) {
      const feedId = addSite.dataset.settingsSiteAdd;
      // DOM-ONLY, deliberately. normalizeFeed drops empty entries, so writing a
      // blank through the store would repaint the list without the row the
      // reader just asked for. The field commits itself on change like any
      // other, and until then it costs the store nothing.
      const list = target.querySelector(".topics-src__site-list");
      if (list) appendBlankSite(list, feedId);
      return;
    }

    const removeSite = event.target.closest("[data-settings-site-remove]");
    if (removeSite) {
      const [feedId, index] = removeSite.dataset.settingsSiteRemove.split("::");
      const feed = feedFrom(feedId);
      if (feed) {
        const next = feed.websites.slice();
        next.splice(Number(index), 1);
        updateFeed(feedId, { websites: next });
      }
      return;
    }

    const playbook = event.target.closest("[data-settings-playbook]");
    if (playbook) {
      navigate(`/playbook/${playbook.dataset.settingsPlaybook}`);
      return;
    }

    if (event.target.closest("[data-settings-playbooks]")) navigate(catalogueRoute());
  };
  target.addEventListener("click", boundClick);

  // The switches are checkboxes, so `change` — not `click`. It fires once (a
  // click on the wrapping label forwards to the input, which would double up),
  // and it also catches the keyboard's Space.
  boundChange = (event) => {
    const toggle = event.target.closest("[data-settings-toggle]");
    if (toggle) {
      const key = toggle.dataset.settingsToggle;
      const [feedId, sourceId] = key.split("::");
      const feed = feedFrom(feedId);
      if (!feed || !findTopicSource(sourceId)) return;

      const next = new Set(feed.sources);
      if (toggle.checked) next.add(sourceId);
      else next.delete(sourceId);
      // Catalogue order rather than click order, so the stored list stays
      // readable and two feeds with the same set serialise identically.
      updateFeed(feedId, { sources: TOPIC_SOURCES.filter((s) => next.has(s.id)).map((s) => s.id) });

      // The repaint replaced the node the reader was on, so put focus back where
      // they left it — otherwise every keyboard toggle dumps them at the top.
      const again = target.querySelector(`[data-settings-toggle="${CSS.escape(key)}"]`);
      if (again) again.focus({ preventScroll: true });
      return;
    }

    // A site commits on blur / Enter rather than on every keystroke: `change` is
    // what an <input> fires when the reader has finished with it, and committing
    // per character would repaint the field out from under the caret.
    const site = event.target.closest("[data-settings-site]");
    if (site) {
      const [feedId, index] = site.dataset.settingsSite.split("::");
      const feed = feedFrom(feedId);
      if (!feed) return;
      const next = feed.websites.slice();
      const i = Number(index);
      if (i < next.length) next[i] = site.value;
      else next.push(site.value);
      updateFeed(feedId, { websites: next });
    }
  };
  target.addEventListener("change", boundChange);

  boundInput = (event) => {
    const field = event.target.closest("[data-settings-pb-search]");
    if (!field) return;
    filterDropdownRows({
      field,
      scopeSelector: ".ap-select-dropdown",
      rowSelector: "[data-settings-pb]",
      nameAttr: "settingsPbName",
      emptySelector: "[data-settings-pb-empty]",
    });
  };
  target.addEventListener("input", boundInput);
}

function feedFrom(feedId) {
  const pb = getContextById(activePlaybookId());
  const feed = pb ? getFeedForPlaybook(pb.id) : null;
  return feed && feed.id === feedId ? feed : null;
}

// A blank row is DOM-only until it holds a URL: normalizeFeed drops empty
// entries, so a round trip through the store would delete the row the reader just
// asked for. It commits on change like any other site field.
function appendBlankSite(list, feedId) {
  const index = list.children.length;
  const li = document.createElement("li");
  li.className = "topics-src__site";
  li.innerHTML = `
    <div class="ap-input-group topics-src__site-field">
      <i class="ap-icon-link" aria-hidden="true"></i>
      <input type="url" value="" placeholder="https://…" data-settings-site="${feedId}::${index}" aria-label="Site to scan" />
    </div>
    <button type="button" class="ap-icon-button transparent grey" data-settings-site-remove="${feedId}::${index}" aria-label="Remove this site">
      <i class="ap-icon-close"></i>
    </button>`;
  list.appendChild(li);
  li.querySelector("input")?.focus();
}

// Deliberately duplicated from the pattern screens/topics.js uses rather than
// shared: fifteen lines of DOM work with no state, and a module for one helper
// costs more than the copy. It filters in the DOM, on `input`, never by
// repainting — a repaint would close the <details> and take the caret with it,
// which is also why the query is never kept in state. Rows hide by inline display
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
