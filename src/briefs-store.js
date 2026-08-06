// Briefs store — what Archie found inside a lane, plus how the user triaged it.
//
// GLOBAL and lane-keyed, like research-store: a brief arrives on a cadence and
// belongs to a lane, not to a chat.
//
// ── The one invariant this store exists to protect ──────────────────────────
// `status` and `isTrending` are SEPARATE FIELDS and must stay that way.
// Trending is not a fifth status; it is an independent boolean. A brief can be
// Saved AND trending, or Ignored AND trending. Every consumer therefore reads
// two things, and no code path may write trending into `status`.
//
// The consequences the views depend on:
//   • In the FEED, a trending brief shows under its own status — a trending New
//     brief appears only when "New" is ticked and vanishes when it isn't.
//     Trending is not a feed-level override. (This is the whole reason trending
//     moved out of a collapsible feed section: as a section it had to override
//     the status filter, which made the filter lie.)
//   • On the TRENDING PAGE, the status filter is ignored entirely. That page is
//     the home of trending, so a spike is never hidden by triage state.
//
// Triage is kept in its own map rather than written onto the brief, mirroring the
// handoff's data model: a Brief is what the scan returned (server-owned), a
// Triage row is what this user did with it (user-owned). Keeping them apart means
// a re-scan can replace briefs without clobbering triage.
//
// Public API:
//   getBriefsForLane(laneId, filters?) → Brief[]  (newest first, filtered)
//   getTrendingForLane(laneId)         → Brief[]  (ignores the status filter)
//   countTrendingForLane(laneId)       → number   (whole lane, filter-blind)
//   countHiddenTrendingForLane(id, f)  → number   (trending the filter EXCLUDES)
//   countNewForLane(laneId)            → number   (the lane card's NEW badge)
//   getBriefById(id)                   → Brief | null
//   getStatus(briefId)                 → 'new'|'saved'|'used'|'ignored'
//   getIgnoreReason(briefId)           → string
//   setStatus(briefId, status)         mutates + notifies
//   toggleSaved(briefId)               → the resulting status
//   ignoreBrief(briefId, reason)       mutates + notifies
//   updateSummary(briefId, text)       — Adapt mode commits through here
//   subscribe(fn)                      → unsubscribe

import { researchBriefs as seed } from "./mocks.js?v=69";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";
import { DEFAULT_STATUS_IDS, DEFAULT_TYPE_IDS, RESEARCH_SOURCES } from "./research-catalog.js?v=6";

const briefs = isNewUser() ? [] : seed.map(cloneBrief);

// briefId → { status, reason, updatedAt }. Seeded from the brief's own
// `seedStatus` so the mock feed shows a realistic spread of triage states
// instead of forty identical New pills.
const triage = new Map();
for (const b of briefs) {
  triage.set(b.id, { status: b.seedStatus || "new", reason: b.seedReason || "", updatedAt: b.ageLabel || "" });
}

const notifier = createNotifier("briefs-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(null);

// Posts and history carry nested objects, so a shallow copy would hand out
// references into the mocks module and let a view mutate the seed.
function cloneBrief(b) {
  return {
    ...b,
    research: {
      ...(b.research || {}),
      paragraphs: Array.isArray(b.research?.paragraphs) ? b.research.paragraphs.slice() : [],
    },
    posts: Array.isArray(b.posts) ? b.posts.map((p) => ({ ...p, author: { ...(p.author || {}) } })) : [],
    history: Array.isArray(b.history) ? b.history.map((h) => ({ ...h })) : [],
    isTrending: !!b.isTrending,
  };
}

// ── Age → sortable minutes ─────────────────────────────────────────────────
// The mock briefs carry a relative label ("2d ago") rather than a timestamp,
// because a prototype has no clock worth trusting and authored dates rot as the
// file ages. Ascending minutes IS newest first.
//
// Replace this with real timestamps when the feed is wired to a backend — this
// parser is the seam, and nothing else reads `ageLabel`.
const UNIT_MINUTES = { m: 1, h: 60, d: 1440, w: 10080 };

export function ageMinutes(label) {
  const m = /^\s*(\d+)\s*([mhdw])\b/i.exec(String(label || ""));
  // Unparseable sorts LAST, not first: an unknown age is not a fresh one.
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * (UNIT_MINUTES[m[2].toLowerCase()] || 1);
}

function byRecency(a, b) {
  return ageMinutes(a.ageLabel) - ageMinutes(b.ageLabel);
}

const ALL_SOURCE_IDS = RESEARCH_SOURCES.map((s) => s.id);

/** The filter state a fresh feed opens with. Reset restores exactly this. */
export function defaultFilters() {
  return {
    statuses: DEFAULT_STATUS_IDS.slice(),
    sources: ALL_SOURCE_IDS.slice(),
    types: DEFAULT_TYPE_IDS.slice(),
  };
}

// How many of the three groups are narrowed below full breadth. The Filters
// badge counts GROUPS, not ticked options — "2" means two groups are filtering,
// which is what the user needs to know. Counting options gave numbers like "5"
// that meant nothing.
export function narrowedGroupCount(filters = defaultFilters()) {
  let n = 0;
  if ((filters.statuses || []).length !== 4) n++;
  if ((filters.sources || []).length !== ALL_SOURCE_IDS.length) n++;
  if ((filters.types || []).length !== 2) n++;
  return n;
}

function withTriage(b) {
  const t = triage.get(b.id) || { status: "new", reason: "" };
  return { ...b, status: t.status, ignoreReason: t.reason };
}

// The one filter predicate. Factored out so the feed's list and the "what is the
// filter hiding?" count can never disagree about what "hidden" means — if they
// did, the notice would contradict the list it sits above.
function matchesFilters(b, filters) {
  const { statuses = [], sources = [], types = [] } = filters;
  return statuses.includes(b.status) && sources.includes(b.sourceId) && types.includes(b.researchType);
}

/**
 * A lane's briefs, newest first, with triage merged in.
 * `filters` omitted → unfiltered (the export count and the picker both want this).
 */
export function getBriefsForLane(laneId, filters = null) {
  const list = briefs
    .filter((b) => b.laneId === laneId)
    .map(withTriage)
    .filter((b) => !filters || matchesFilters(b, filters));
  return list.sort(byRecency);
}

// Every trending brief in the lane, whatever its review status. Deliberately
// does NOT take a filters argument — the trending page ignores the status filter
// by design, and accepting one would invite a caller to pass it.
export function getTrendingForLane(laneId) {
  return briefs
    .filter((b) => b.laneId === laneId && b.isTrending)
    .map(withTriage)
    .sort(byRecency);
}

export function countTrendingForLane(laneId) {
  return briefs.filter((b) => b.laneId === laneId && b.isTrending).length;
}

// How many trending briefs the CURRENT filter is hiding — the only number the
// feed's notice is allowed to say. The old notice counted the whole lane, so on
// lane-1 at the default filter it announced 3 while the feed could account for
// 1, and never said where the other 2 were. That unexplained gap is what reads
// as a broken filter.
//
// Deliberately every filter group, not just status: a trending brief kept out by
// the sources or types filter is just as hidden, and the copy says "don't match
// your filters", plural.
export function countHiddenTrendingForLane(laneId, filters) {
  if (!filters) return 0;
  return briefs
    .filter((b) => b.laneId === laneId && b.isTrending)
    .map(withTriage)
    .filter((b) => !matchesFilters(b, filters)).length;
}

// How many briefs in this lane are still untriaged — what the lane card's NEW
// badge counts. Deliberately status-only and filter-free: the lane list has no
// filters, and "is there anything to look at in here?" must not depend on how
// somebody left the feed's filter panel.
export function countNewForLane(laneId) {
  return briefs.filter((b) => b.laneId === laneId && getStatus(b.id) === "new").length;
}

export function getBriefById(id) {
  const b = briefs.find((x) => x.id === id);
  return b ? withTriage(b) : null;
}

export function getStatus(briefId) {
  return (triage.get(briefId) || {}).status || "new";
}

export function getIgnoreReason(briefId) {
  return (triage.get(briefId) || {}).reason || "";
}

export function setStatus(briefId, status) {
  const b = briefs.find((x) => x.id === briefId);
  if (!b) return null;
  const prev = triage.get(briefId) || { reason: "" };
  triage.set(briefId, { ...prev, status, updatedAt: "just now" });
  notify();
  return withTriage(b);
}

// Save ↔ un-save. Un-saving returns to New rather than to whatever it was
// before: "Remove from saved" reads as "put it back in the queue", and the feed
// defaults to New, so that is where the user expects to find it again.
export function toggleSaved(briefId) {
  const next = getStatus(briefId) === "saved" ? "new" : "saved";
  setStatus(briefId, next);
  return next;
}

export function ignoreBrief(briefId, reason = "") {
  const b = briefs.find((x) => x.id === briefId);
  if (!b) return null;
  triage.set(briefId, { status: "ignored", reason: String(reason || "").trim(), updatedAt: "just now" });
  notify();
  return withTriage(b);
}

// Adapt mode edits the summary BODY, never the headline — the headline is the
// claim the research supports, and letting it drift from the article underneath
// would make the brief lie about its own evidence.
export function updateSummary(briefId, text) {
  const b = briefs.find((x) => x.id === briefId);
  if (!b) return null;
  b.summary = String(text || "");
  notify();
  return withTriage(b);
}
