// Content Research — the trending page, route /research/:id/trending.
//
// This page is the HOME of trending, and that has one consequence that drives
// everything else here: it lists every trending brief in the lane REGARDLESS OF
// REVIEW STATUS, and ignores the feed's status filter entirely. A spike must
// never be hidden because the user happened to have triaged it — an Ignored
// topic that suddenly runs at 4x baseline is exactly the thing worth seeing.
//
// That is also why trending isn't a section at the top of the feed. It was, once
// (see the handoff's explorations/): as a section it competed with the triage
// list and forced trending to override the status filter, which made the filter
// lie about what it was doing. Splitting it into a notice plus this page lets
// the feed's filter stay honest and gives trending somewhere to be complete.
//
// Cards here are deliberately REDUCED — single Use-now button, no dropdown, no
// Ignore, no status pill. See components/brief-card.js, variant "trending".

import { html, raw } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=291";
import { isFlagOn } from "../feature-flags.js?v=16";
import { renderBriefCard } from "../components/brief-card.js?v=7";
import { openFullResearch } from "../components/research-modals.js?v=12";
import { showToast } from "../components/toast.js?v=20";
import { getLaneById } from "../research-store.js?v=9";
import { getTrendingForLane, setStatus, subscribe as subscribeBriefs } from "../briefs-store.js?v=10";
import { findResearchSource, findCadence } from "../research-catalog.js?v=5";

let laneId = null;
let unsubscribe = null;
let boundTarget = null;
let boundClick = null;

export function renderResearchTrending(params, target) {
  if (!isFlagOn("contentResearch")) {
    navigate("/");
    return;
  }
  laneId = params.id;
  const lane = getLaneById(laneId);
  // Gated by the lane's own setting as well as the flag: with Show-trending off
  // there is no notice to reach this page from, so a stale link has to bounce
  // back to the feed rather than render a surface the lane has switched off.
  if (!lane || !lane.showTrending) {
    navigate(lane ? `/research/${encodeURIComponent(laneId)}` : "/research");
    return;
  }

  renderTopbar();
  teardown();
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
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen research-trending">${raw(renderPage())}</section>`;
}

function renderPage() {
  const lane = getLaneById(laneId);
  if (!lane) return "";
  const briefs = getTrendingForLane(laneId);
  const cadence = findCadence(lane.cadence);
  const n = briefs.length;

  // Same recap__header shape as the feed, minus the monogram: this page belongs
  // to one lane you have already identified by arriving from it, and the orange
  // trending mark is the thing that should carry the eye. Back is the topbar's,
  // via backTargetFor() — no in-page button on any Content Research detail view.
  return html`<div class="research-feed__body">
    <div class="research-trending__inner">
      <header class="research-feed__header research-feed__header--trending">
        <div class="research-feed__id">
          <span class="research-trending__mark" aria-hidden="true"><i class="ap-icon-arrow-up"></i></span>
          <div class="research-feed__id-text">
            <div class="research-feed__titlerow">
              <h1 class="research-feed__name">You have ${n} ${n === 1 ? "topic" : "topics"} trending</h1>
            </div>
            <div class="research-feed__meta">
              <span class="research-feed__meta-item">
                Refreshed ${cadence ? cadence.adverb : "weekly"} — topics appear here when this
                ${cadence ? cadence.every : "week"}'s volume runs above the last one's baseline, whatever their review
                status.
              </span>
            </div>
          </div>
        </div>
      </header>
      ${raw(
        n
          ? briefs
              .map((b) => renderBriefCard(b, { source: findResearchSource(b.sourceId), variant: "trending" }))
              .join("")
          : html`<p class="research-feed__empty muted">Nothing is running above its baseline right now.</p>`,
      )}
    </div>
  </div>`;
}

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    const use = event.target.closest("[data-brief-use]");
    if (use) {
      setStatus(use.dataset.briefUse, "used");
      showToast("Added to a chat draft");
      return;
    }
    const research = event.target.closest("[data-brief-research]");
    if (research) return openFullResearch({ briefId: research.dataset.briefResearch });
  };
  target.addEventListener("click", boundClick);
}
