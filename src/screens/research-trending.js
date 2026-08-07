// Content Ideas — the attention page, route /research/:id/attention.
//
// The file is still research-trending.js. The route was renamed when the page
// grew to carry both signals; the module name lags, the same split as
// Playbook/Context and brief/topic.
//
// This page is the HOME of both ATTENTION SIGNALS — trending and updated — and
// that has one consequence driving everything else here: it lists every brief
// carrying either, REGARDLESS OF REVIEW STATUS, ignoring the feed's status filter
// entirely. A spike must never be hidden because the user happened to have
// triaged it — an Ignored topic now running at 4x baseline is exactly the thing
// worth seeing, and the same holds for one whose story has just moved on.
//
// That is also why they aren't a section at the top of the feed. Trending was,
// once (see the handoff's explorations/): as a section it competed with the triage
// list and forced trending to override the status filter, which made the filter
// lie about what it was doing. Splitting it into a notice plus this page lets the
// feed's filter stay honest and gives both signals somewhere to be complete.
//
// Cards here are deliberately REDUCED — single Use-in-chat button, no dropdown, no
// Ignore, no status pill. See components/brief-card.js, variant "trending".

import { html, raw } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=316";
import { isFlagOn } from "../feature-flags.js?v=18";
import { renderBriefCard } from "../components/brief-card.js?v=23";
import { openFullResearch } from "../components/research-modals.js?v=40";
import { showToast } from "../components/toast.js?v=20";
import { getLaneById } from "../research-store.js?v=20";
import { getAttentionForLane, setStatus, subscribe as subscribeBriefs } from "../briefs-store.js?v=26";
import { findResearchSource, findCadence } from "../research-catalog.js?v=10";

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
  const briefs = getAttentionForLane(laneId);
  const cadence = findCadence(lane.cadence);
  const n = briefs.length;
  // Grouped by signal rather than listed flat: the two mean different things —
  // one is "this is spiking", the other "this moved since I last looked" — and a
  // flat list makes the reader work that out from the marks. A brief that is both
  // appears under Trending, the louder of the two, and never twice.
  const trending = briefs.filter((b) => b.isTrending);
  const updated = briefs.filter((b) => b.isUpdated && !b.isTrending);

  const group = (title, note, list) =>
    list.length
      ? html`<section class="research-attention__group">
          <h2 class="research-attention__group-title">${title}</h2>
          <p class="research-attention__group-note">${note}</p>
          ${raw(
            list
              .map((b) => renderBriefCard(b, { source: findResearchSource(b.sourceId), variant: "trending" }))
              .join(""),
          )}
        </section>`
      : "";

  // Same recap__header shape as the feed, minus the monogram: this page belongs
  // to one lane you have already identified by arriving from it, and the orange
  // mark is the thing that should carry the eye. Back is the topbar's, via
  // backTargetFor() — no in-page button on any Content Ideas detail view.
  return html`<div class="research-feed__body">
    <div class="research-trending__inner">
      <header class="research-feed__header research-feed__header--trending">
        <div class="research-feed__id">
          <span class="research-trending__mark" aria-hidden="true"><i class="ap-icon-arrow-up"></i></span>
          <div class="research-feed__id-text">
            <div class="research-feed__titlerow">
              <h1 class="research-feed__name">${n} ${n === 1 ? "topic needs" : "topics need"} your attention</h1>
            </div>
            <div class="research-feed__meta">
              <span class="research-feed__meta-item">
                Refreshed ${cadence ? cadence.adverb : "weekly"} — whatever their review status, so nothing here is
                hidden by how you triaged it.
              </span>
            </div>
          </div>
        </div>
      </header>
      ${raw(
        n
          ? group(
              "Trending",
              `Running above ${trending.length === 1 ? "its" : "their"} usual volume baseline this ${cadence ? cadence.every : "week"}.`,
              trending,
            ) +
              group(
                "Updated",
                `The story moved since ${updated.length === 1 ? "this was" : "these were"} last scanned.`,
                updated,
              )
          : html`<p class="research-feed__empty muted">Nothing is trending or has changed right now.</p>`,
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
