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
// lie about what it was doing. Splitting it into a banner plus this page lets
// the feed's filter stay honest and gives trending somewhere to be complete.
//
// Cards here are deliberately REDUCED — single Use-now button, no dropdown, no
// Ignore, no status pill. See components/brief-card.js, variant "trending".

import { html, raw } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=282";
import { isFlagOn } from "../feature-flags.js?v=16";
import { renderBriefCard } from "../components/brief-card.js?v=2";
import { openFullResearch } from "../components/research-modals.js?v=3";
import { showToast } from "../components/toast.js?v=20";
import { getLaneById } from "../research-store.js?v=2";
import { getTrendingForLane, setStatus, subscribe as subscribeBriefs } from "../briefs-store.js?v=3";
import { findResearchSource, findCadence } from "../research-catalog.js?v=2";

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
  // there is no banner to reach this page from, so a stale link has to bounce
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

  return html`<header class="research-feed__topbar">
      <button type="button" class="ap-icon-button ghost grey" data-trending-back aria-label="Back to the feed">
        <i class="ap-icon-arrow-left" aria-hidden="true"></i>
      </button>
      <h2 class="research-feed__title">Trending now</h2>
    </header>
    <div class="research-feed__body">
      <div class="research-trending__inner">
        <div class="research-trending__head">
          <span class="research-banner__mark" aria-hidden="true"><i class="ap-icon-arrow-up"></i></span>
          <span>
            <strong class="research-trending__title">You have ${n} ${n === 1 ? "topic" : "topics"} trending</strong>
            <span class="research-trending__sub">
              Refreshed ${cadence ? cadence.adverb : "weekly"} — topics appear here when this
              ${cadence ? cadence.every : "week"}'s volume runs above the last one's baseline, whatever their review
              status.
            </span>
          </span>
        </div>
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
    if (event.target.closest("[data-trending-back]")) return navigate(`/research/${encodeURIComponent(laneId)}`);

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
