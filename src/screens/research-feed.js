// Content Research — a lane's brief feed, route /research/:id.
//
// The generating loader runs on ARRIVAL FROM ELSEWHERE only, keyed on ?fresh=1,
// which both the lane list's open action and the form's save append. Returning
// from the trending page or from settings carries no param and so paints
// straight away — re-running a 1.6s spinner on a back button is punishment, not
// feedback.
//
// Filters: three groups, defaults New / all sources / Ready to post. The badge
// counts NARROWED GROUPS, not ticked options (see briefs-store.narrowedGroupCount).
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
import { renderTopbar } from "../components/topbar.js?v=320";
import { isFlagOn } from "../feature-flags.js?v=18";
import { renderBriefCard } from "../components/brief-card.js?v=23";
import {
  openFullResearch,
  openIgnoreReason,
  openExport,
  openAddToStrategy,
} from "../components/research-modals.js?v=40";
import { showToast } from "../components/toast.js?v=20";
import { getLaneById } from "../research-store.js?v=20";
import {
  getBriefsForLane,
  groupBriefsByAge,
  attentionCountsForLane,
  defaultFilters,
  narrowedGroupCount,
  setStatus,
  toggleSaved,
  subscribe as subscribeBriefs,
} from "../briefs-store.js?v=26";
import {
  RESEARCH_SOURCES,
  REVIEW_STATUSES,
  RESEARCH_TYPES,
  findResearchSource,
  findCadence,
} from "../research-catalog.js?v=10";
import { getContextById } from "../contexts-store.js?v=55";

// How long the mock generation appears to run. The handoff's ~1.6s: long enough
// to register that I'm doing work, short enough that nobody waits for it.
const GENERATE_MS = 1600;

// The attention notice above the topic list. Off: with every review status ticked
// by default, a flagged topic is already visible in the list, so the notice
// repeated it. One line to restore — nothing below it was removed.
const SHOW_ATTENTION_NOTICE = false;

let laneId = null;
let filters = defaultFilters();
let view = {
  generating: false,
  panelOpen: false,
  groups: { status: true, sources: true, types: true },
  openMenu: null,
};
let timer = null;

let unsubscribe = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;
let boundDocClick = null;

export function renderResearchFeed(params, target) {
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  laneId = params.id;
  const lane = getLaneById(laneId);
  if (!lane) {
    navigate("/research");
    return;
  }

  renderTopbar();
  teardown();
  filters = defaultFilters();
  view = { generating: false, panelOpen: false, groups: { status: true, sources: true, types: true }, openMenu: null };

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
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundInput) {
    boundTarget.removeEventListener("input", boundInput);
    boundTarget.removeEventListener("change", boundInput);
  }
  if (boundDocClick) {
    document.removeEventListener("click", boundDocClick);
    boundDocClick = null;
  }
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function paint(target) {
  // Every action in this feed repaints the whole screen, and innerHTML wipes the
  // scroll container with it. Without carrying scrollTop across the swap, using
  // or saving a brief halfway down the list threw the user back to the top —
  // which reads as the page reloading, not as the action working.
  const prev = target.querySelector(".research-feed__body");
  const scrollTop = prev ? prev.scrollTop : 0;
  target.innerHTML = html`<section class="screen research-feed">${raw(renderPage())}</section>`;
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
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderPage() {
  const lane = getLaneById(laneId);
  if (!lane) return "";
  if (view.generating) return renderGenerating();

  const briefs = getBriefsForLane(laneId, filters);
  // ── The attention notice is switched OFF ─────────────────────────────────
  // Kept, not deleted, so it can be switched back on in one line. It reported
  // trending and updated topics above the list; with every status now ticked by
  // default the list already shows them, so the notice was restating what was
  // already on screen.
  //
  // Flip `SHOW_ATTENTION_NOTICE` to true to bring it back — renderAttentionNotice
  // and attentionCountsForLane are both still here and still correct.
  const attention = SHOW_ATTENTION_NOTICE ? attentionCountsForLane(laneId) : null;
  const showNotice = SHOW_ATTENTION_NOTICE && attention.total > 0 && lane.showTrending;

  return html`<div class="research-feed__body">
    <div class="research-feed__inner">
      ${raw(renderFeedHeader(lane))} ${raw(showNotice ? renderAttentionNotice(attention) : "")}
      ${raw(
        briefs.length
          ? groupBriefsByAge(briefs)
              .map(
                // A heading per non-empty age frame. The label is /topics'
                // .topics-group__label — the app's own answer to this exact
                // problem one feature over — so the two age-grouped card lists
                // read as one idea rather than two.
                ({ group, briefs: rows }) =>
                  html`<section class="topics-agegroup">
                    <h2 class="topics-agegroup__label">${group.label}</h2>
                    ${raw(
                      rows
                        .map((b) =>
                          renderBriefCard(b, {
                            source: findResearchSource(b.sourceId),
                            variant: "feed",
                            menuOpen: view.openMenu === b.id,
                          }),
                        )
                        .join(""),
                    )}
                  </section>`,
              )
              .join("")
          : html`<p class="research-feed__empty muted">
              No topics match these filters. Try widening them, or reset to the defaults.
            </p>`,
      )}
    </div>
  </div>`;
}

function renderGenerating() {
  // .ap-loader, not a hand-rolled ring. initArchieLoader() sweeps for this class
  // and swaps its contents for the animated Archie network-assemble mark, so
  // this spinner matches every other spinner in the app for free. A custom ring
  // was the only loader in the product that didn't.
  return html`<div class="research-generating">
    <span class="ap-loader orange size-60" aria-hidden="true"></span>
    <p class="research-generating__caption" role="status">We are generating content ideas for you…</p>
  </div>`;
}

// Mirrors recap__header — the prototype's established detail-view header:
//
//   __id ( __monogram + __id-text ( __titlerow(h1 + inline affordance) + __meta ) )
//   opposite __header-actions
//
// It replaces a bordered bar that carried its own back button and captioned
// itself, matching no other detail screen. Back now lives in the global topbar
// via backTargetFor(), exactly as /playbook's does.
//
// Own class names rather than reusing recap__*: those belong to the Playbook
// render engine, and sharing them would mean restyling one detail view silently
// restyles the other.
function renderFeedHeader(lane) {
  const narrowed = narrowedGroupCount(filters);
  const ctx = getContextById(lane.playbookId);
  const cadence = findCadence(lane.cadence);
  const n = lane.sources.length;

  // The Playbook's monogram, same idea as recap__monogram: it says which brand
  // this research belongs to before you read a word. Tinted by a CLASS, not an
  // inline hex — a lane has a semantic colour key, where /playbook has real
  // extracted brand colours to interpolate.
  const color = ctx?.color || "orange";
  const initials = ((ctx?.brandName || ctx?.name || "?").trim()[0] || "?").toUpperCase();

  const meta = [
    ctx
      ? html`<span class="research-feed__meta-item"><i class="ap-icon-target" aria-hidden="true"></i>${ctx.name}</span>`
      : "",
    html`<span class="research-feed__meta-item">${n} ${n === 1 ? "source" : "sources"}</span>`,
    cadence ? html`<span class="research-feed__meta-item">Refreshed ${cadence.adverb}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  return html`<header class="research-feed__header">
    <div class="research-feed__id">
      <span class="research-feed__monogram research-feed__monogram--${color}" aria-hidden="true">${initials}</span>
      <div class="research-feed__id-text">
        <div class="research-feed__titlerow">
          <h1 class="research-feed__name">${lane.name}</h1>
        </div>
        <div class="research-feed__meta">${raw(meta)}</div>
      </div>
    </div>
    <div class="research-feed__header-actions">
      <div class="research-filters">
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
      </div>
      <button type="button" class="ap-button stroked grey" data-feed-export>
        <i class="ap-icon-upload" aria-hidden="true"></i><span>Export</span>
      </button>
      <!-- Last in the cluster, to the right of Export. It sat inline beside the
           name as recap's rename pen does, but the handoff puts the settings gear
           at the end of the toolbar and that is where it reads as the lane's
           own control rather than as a rename. -->
      <button
        type="button"
        class="ap-icon-button stroked grey"
        data-feed-settings
        title="Feed settings"
        aria-label="Feed settings"
      >
        <i class="ap-icon-cog"></i>
      </button>
    </div>
  </header>`;
}

// Group order is fixed: Topic status, Sources, Topic type. Topic type is
// last by request — it's the least-touched of the three.
function renderFilterPanel() {
  return html`<div class="research-filters__panel" data-feed-panel>
    ${raw(
      renderGroup("status", "Topic status", REVIEW_STATUSES, filters.statuses, "statuses") +
        renderGroup("sources", "Sources", RESEARCH_SOURCES, filters.sources, "sources") +
        renderGroup("types", "Topic type", RESEARCH_TYPES, filters.types, "types"),
    )}
    <div class="research-filters__reset-row">
      <button type="button" class="research-filters__reset" data-feed-reset>
        <i class="ap-icon-refresh" aria-hidden="true"></i><span>Reset filters</span>
      </button>
    </div>
  </div>`;
}

function renderGroup(key, label, options, selected, field) {
  const open = view.groups[key];
  return html`<section class="research-filters__group">
    <button
      type="button"
      class="research-filters__group-head"
      data-feed-group="${key}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span>${label}</span>
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
                      <span>${o.label || o.name}</span>
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
        <span class="ap-infobox-title">${total} ${one ? "topic needs" : "topics need"} your attention</span>
        <span class="ap-infobox-message"> ${raw(parts.join(" · "))} in this topic list. </span>
      </div>
      <button type="button" class="ap-button primary blue" data-feed-trending>
        <span>See topics</span>
        <i class="ap-icon-arrow-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    if (event.target.closest("[data-feed-settings]"))
      return navigate(`/research/${encodeURIComponent(laneId)}/settings`);
    if (event.target.closest("[data-feed-trending]"))
      return navigate(`/research/${encodeURIComponent(laneId)}/attention`);

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
      return paint(target);
    }
    if (event.target.closest("[data-feed-export]")) {
      // The count is what's in the feed RIGHT NOW, i.e. after filtering — the
      // dialog says "currently in your feed" and has to mean it.
      return openExport({ count: getBriefsForLane(laneId, filters).length });
    }

    // ── Brief actions ───────────────────────────────────────────────────
    const menuBtn = event.target.closest("[data-brief-use-menu]");
    if (menuBtn) {
      const id = menuBtn.dataset.briefUseMenu;
      view.openMenu = view.openMenu === id ? null : id;
      return paint(target);
    }

    const use = event.target.closest("[data-brief-use]");
    if (use) {
      setStatus(use.dataset.briefUse, "used");
      showToast("Added to a chat draft");
      return;
    }

    const save = event.target.closest("[data-brief-save]");
    if (save) {
      const next = toggleSaved(save.dataset.briefSave);
      view.openMenu = null;
      showToast(next === "saved" ? "Saved for later" : "Removed from saved");
      return;
    }

    const strategy = event.target.closest("[data-brief-strategy]");
    if (strategy) {
      view.openMenu = null;
      const lane = getLaneById(laneId);
      // Opens a confirmation. The status does NOT change here — only on confirm,
      // inside the modal. Flipping it on this click was a real bug.
      return openAddToStrategy({ briefId: strategy.dataset.briefStrategy, playbookId: lane?.playbookId });
    }

    const ignore = event.target.closest("[data-brief-ignore]");
    if (ignore) return openIgnoreReason({ briefId: ignore.dataset.briefIgnore });

    const research = event.target.closest("[data-brief-research]");
    if (research) return openFullResearch({ briefId: research.dataset.briefResearch });
  };
  target.addEventListener("click", boundClick);

  boundInput = (event) => {
    const box = event.target.closest("[data-feed-filter]");
    if (!box) return;
    const field = box.dataset.feedFilter;
    const val = box.value;
    const set = new Set(filters[field]);
    if (box.checked) set.add(val);
    else set.delete(val);
    filters = { ...filters, [field]: [...set] };
    paint(target);
  };
  target.addEventListener("input", boundInput);
  target.addEventListener("change", boundInput);

  // Close the filters panel and any open Use-in-chat menu on an outside click.
  // Bound on document because the click that dismisses them lands outside the
  // panel by definition.
  boundDocClick = (event) => {
    if (!view.panelOpen && !view.openMenu) return;
    if (event.target.closest(".research-filters") || event.target.closest(".topics-use")) return;
    view.panelOpen = false;
    view.openMenu = null;
    paint(target);
  };
  document.addEventListener("click", boundDocClick);
}
