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
// Trending in this feed is NOT an override: a trending brief appears under its
// own review status and disappears when that status is unticked. The trending
// page is where trending ignores triage. Keeping that split is the whole reason
// trending is a banner here rather than a section.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { parseHashParams } from "../url-state.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=283";
import { isFlagOn } from "../feature-flags.js?v=16";
import { renderBriefCard } from "../components/brief-card.js?v=3";
import {
  openFullResearch,
  openIgnoreReason,
  openExport,
  openAddToStrategy,
} from "../components/research-modals.js?v=5";
import { showToast } from "../components/toast.js?v=20";
import { getLaneById } from "../research-store.js?v=2";
import {
  getBriefsForLane,
  countTrendingForLane,
  defaultFilters,
  narrowedGroupCount,
  setStatus,
  toggleSaved,
  subscribe as subscribeBriefs,
} from "../briefs-store.js?v=3";
import { RESEARCH_SOURCES, REVIEW_STATUSES, RESEARCH_TYPES, findResearchSource } from "../research-catalog.js?v=2";

// How long the mock generation appears to run. The handoff's ~1.6s: long enough
// to register that I'm doing work, short enough that nobody waits for it.
const GENERATE_MS = 1600;

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
  const trendingCount = countTrendingForLane(laneId);
  // Two conditions, both required: the lane has to have trending briefs AND the
  // lane's own Show-trending setting has to be on.
  const showBanner = trendingCount > 0 && lane.showTrending;

  return html`${raw(renderTopBar(lane))}
    <div class="research-feed__body">
      <div class="research-feed__inner">
        ${raw(showBanner ? renderBanner(trendingCount) : "")}
        ${raw(
          briefs.length
            ? briefs
                .map((b) =>
                  renderBriefCard(b, {
                    source: findResearchSource(b.sourceId),
                    variant: "feed",
                    menuOpen: view.openMenu === b.id,
                  }),
                )
                .join("")
            : html`<p class="research-feed__empty muted">
                No briefs match these filters. Try widening them, or reset to the defaults.
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
    <p class="research-generating__caption" role="status">We are generating content research for you…</p>
  </div>`;
}

function renderTopBar(lane) {
  const narrowed = narrowedGroupCount(filters);
  return html`<header class="research-feed__topbar">
    <button type="button" class="ap-icon-button ghost grey" data-feed-back aria-label="Back to Content Research">
      <i class="ap-icon-arrow-left" aria-hidden="true"></i>
    </button>
    <h2 class="research-feed__title">${lane.name}</h2>
    <span class="research-feed__spacer"></span>
    <div class="research-feed__tools">
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
      <button type="button" class="ap-icon-button ghost grey" data-feed-settings aria-label="Feed settings">
        <i class="ap-icon-cog" aria-hidden="true"></i>
      </button>
    </div>
  </header>`;
}

// Group order is fixed: Review status, Sources, Research type. Research type is
// last by request — it's the least-touched of the three.
function renderFilterPanel() {
  return html`<div class="research-filters__panel" data-feed-panel>
    ${raw(
      renderGroup("status", "Review status", REVIEW_STATUSES, filters.statuses, "statuses") +
        renderGroup("sources", "Sources", RESEARCH_SOURCES, filters.sources, "sources") +
        renderGroup("types", "Research type", RESEARCH_TYPES, filters.types, "types"),
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

function renderBanner(count) {
  return html`<div class="research-banner">
    <span class="research-banner__mark" aria-hidden="true"><i class="ap-icon-arrow-up"></i></span>
    <span class="research-banner__text">
      <strong class="research-banner__title">You have ${count} ${count === 1 ? "topic" : "topics"} trending</strong>
      <span class="research-banner__sub">Running above their usual volume baseline right now.</span>
    </span>
    <button type="button" class="ap-button primary blue" data-feed-trending>
      <span>See all trending topics</span>
      <i class="ap-icon-arrow-right" aria-hidden="true"></i>
    </button>
  </div>`;
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;

  boundClick = (event) => {
    if (event.target.closest("[data-feed-back]")) return navigate("/research");
    if (event.target.closest("[data-feed-settings]"))
      return navigate(`/research/${encodeURIComponent(laneId)}/settings`);
    if (event.target.closest("[data-feed-trending]"))
      return navigate(`/research/${encodeURIComponent(laneId)}/trending`);

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

  // Close the filters panel and any open Use-now menu on an outside click.
  // Bound on document because the click that dismisses them lands outside the
  // panel by definition.
  boundDocClick = (event) => {
    if (!view.panelOpen && !view.openMenu) return;
    if (event.target.closest(".research-filters") || event.target.closest(".brief-use")) return;
    view.panelOpen = false;
    view.openMenu = null;
    paint(target);
  };
  document.addEventListener("click", boundDocClick);
}
