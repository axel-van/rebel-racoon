// Briefs store — what Archie found inside a lane, plus how the user triaged it.
//
// GLOBAL and lane-keyed, like research-store: a brief arrives on a cadence and
// belongs to a lane, not to a chat.
//
// ── The one invariant this store exists to protect ──────────────────────────
// `status`, `isTrending` and `isUpdated` are SEPARATE FIELDS and must stay that
// way. Neither signal is a fifth status; both are independent booleans. A brief
// can be Saved AND trending, New AND updated, or all three at once. Every
// consumer therefore reads three things, and no code path may write either
// signal into `status`.
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
//   getAttentionForLane(laneId)        → Brief[]  (trending OR updated, deduped)
//   countTrendingForLane(laneId)       → number   (whole lane, filter-blind)
//   hiddenAttentionForLane(id, f)      → {trending, updated, total} the filter EXCLUDES
//   countNewForLane(laneId)            → number   (the lane card's NEW badge)
//   getBriefById(id)                   → Brief | null
//   getStatus(briefId)                 → 'new'|'saved'|'used'|'ignored'
//   getIgnoreReason(briefId)           → string
//   setStatus(briefId, status)         mutates + notifies
//   toggleSaved(briefId)               → the resulting status
//   ignoreBrief(briefId, reason)       mutates + notifies
//   dismissSignals(briefId)            silences trending + updated, notifies
//   restoreSignals(briefId)            the Undo
//   updateSummary(briefId, text)       — Adapt mode commits through here
//   subscribe(fn)                      → unsubscribe

import { researchBriefs as seed } from "./mocks.js?v=70";
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

// briefId → its attention signals are dismissed. User-owned, and kept apart from
// the brief for the same reason triage is: a re-scan replaces briefs, and a signal
// the user silenced should be able to come back if it genuinely spikes again.
// A Set rather than a flag on the brief, so nothing can write it into the seed.
const dismissedSignals = new Set();

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
    isUpdated: !!b.isUpdated,
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

// Merges the user-owned facts onto a server-owned brief: the triage row, and
// whether the user has DISMISSED its attention signals.
//
// Masking the signals here rather than filtering them out at each call site is
// what makes a dismissal total — the mark on the card, the notice's count, the
// attention page and the picker all read isTrending/isUpdated through this, so one
// place governs all of them. Consequence for callers: filter on the HYDRATED
// brief, never on the raw one, or a dismissed signal slips through.
function hydrate(b) {
  const t = triage.get(b.id) || { status: "new", reason: "" };
  const muted = dismissedSignals.has(b.id);
  return {
    ...b,
    status: t.status,
    ignoreReason: t.reason,
    isTrending: muted ? false : !!b.isTrending,
    isUpdated: muted ? false : !!b.isUpdated,
  };
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
    .map(hydrate)
    .filter((b) => !filters || matchesFilters(b, filters));
  return list.sort(byRecency);
}

// Every trending brief in the lane, whatever its review status. Deliberately
// does NOT take a filters argument — the trending page ignores the status filter
// by design, and accepting one would invite a caller to pass it.
export function getTrendingForLane(laneId) {
  return briefs
    .filter((b) => b.laneId === laneId)
    .map(hydrate)
    .filter((b) => b.isTrending)
    .sort(byRecency);
}

export function countTrendingForLane(laneId) {
  return briefs
    .filter((b) => b.laneId === laneId)
    .map(hydrate)
    .filter((b) => b.isTrending).length;
}

// Every brief carrying an ATTENTION SIGNAL — trending or updated — whatever its
// review status. The union of the two, deduped by construction (one brief, one
// entry, even when it is both). Like getTrendingForLane it takes no filters: the
// attention page ignores triage by design, and accepting one would invite a
// caller to pass it.
export function getAttentionForLane(laneId) {
  return briefs
    .filter((b) => b.laneId === laneId)
    .map(hydrate)
    .filter((b) => b.isTrending || b.isUpdated)
    .sort(byRecency);
}

// What the CURRENT filter is hiding, broken down by signal — the only numbers the
// feed's notice is allowed to say. The old notice counted the whole lane, so on
// lane-1 at the default filter it announced 3 while the feed could account for 1,
// and never said where the other 2 were. That unexplained gap is what reads as a
// broken filter.
//
// `total` is DEDUPED while the two breakdowns are not: a brief that is both
// trending and updated is one topic needing attention but appears under both
// labels, so the two numbers may sum to more than the total. The copy therefore
// lists them as separate labels and never as an equation.
//
// Deliberately every filter group, not just status: a brief kept out by the
// sources or types filter is just as hidden.
export function hiddenAttentionForLane(laneId, filters) {
  if (!filters) return { trending: 0, updated: 0, total: 0 };
  const hidden = briefs
    .filter((b) => b.laneId === laneId)
    .map(hydrate)
    .filter((b) => (b.isTrending || b.isUpdated) && !matchesFilters(b, filters));
  return {
    trending: hidden.filter((b) => b.isTrending).length,
    updated: hidden.filter((b) => b.isUpdated).length,
    total: hidden.length,
  };
}

export function countNewForLane(laneId) {
  return briefs.filter((b) => b.laneId === laneId && getStatus(b.id) === "new").length;
}

export function getBriefById(id) {
  const b = briefs.find((x) => x.id === id);
  return b ? hydrate(b) : null;
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
  return hydrate(b);
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
  return hydrate(b);
}

// Adapt mode edits the summary BODY, never the headline — the headline is the
// claim the research supports, and letting it drift from the article underneath
// would make the brief lie about its own evidence.
// Silence a topic's attention signals — both of them, whichever put it on the
// page. Clearing only the one that surfaced it would leave a brief that is
// trending AND updated still sitting there under the other group, which is not
// what "stop showing me this" means.
//
// It does NOT touch review status: a dismissed signal is Archie being told to
// stop flagging, where Ignored is the user's own verdict on the topic. Two
// different facts, two different fields.
export function dismissSignals(briefId) {
  if (!briefs.some((b) => b.id === briefId)) return false;
  dismissedSignals.add(briefId);
  notify();
  return true;
}

/** Undo, so the toast can genuinely offer it. */
export function restoreSignals(briefId) {
  dismissedSignals.delete(briefId);
  notify();
}

export function updateSummary(briefId, text) {
  const b = briefs.find((x) => x.id === briefId);
  if (!b) return null;
  b.summary = String(text || "");
  notify();
  return hydrate(b);
}
