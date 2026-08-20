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
//     brief appears only when "To review" is ticked and vanishes when it isn't.
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
//   groupBriefsByAge(briefs)           → [{group, briefs}] in AGE_GROUPS order
//   getTrendingForLane(laneId)         → Brief[]  (ignores the status filter)
//   getAttentionForLane(laneId)        → Brief[]  (trending OR updated, deduped)
//   countTrendingForLane(laneId)       → number   (whole lane, filter-blind)
//   attentionCountsForLane(laneId)     → {trending, updated, total} flagged in the lane
//   countNewForLane(laneId)            → number   (the lane card's NEW badge)
//   getBriefById(id)                   → Brief | null
//   getStatus(briefId)                 → 'new'|'saved'|'used'|'ignored'
//   getIgnoreReason(briefId)           → string
//   setStatus(briefId, status)         mutates + notifies
//   toggleSaved(briefId)               → the resulting status
//   ignoreBrief(briefId, reason)       mutates + notifies
//   unignoreBrief(briefId)             back to 'new', reason cleared
//   updateSummary(briefId, text)       — Adapt mode commits through here
//   subscribe(fn)                      → unsubscribe

import { researchBriefs as seed } from "./mocks.js?v=97";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=3";
import { DEFAULT_STATUS_IDS, DEFAULT_TYPE_IDS, LIVE_SOURCE_IDS, findReviewStatus } from "./research-catalog.js?v=24";

const briefs = isNewUser() ? [] : seed.map(cloneBrief);

// briefId → { status, reason, updatedAt }. Seeded from the brief's own
// `seedStatus` so the mock feed shows a realistic spread of triage states
// instead of forty identical New pills.
const triage = new Map();
for (const b of briefs) {
  // `saved` normalises to New: the status no longer exists, and a brief carrying
  // it would filter to nothing rather than simply appearing untriaged.
  const seeded = b.seedStatus === "saved" ? "new" : b.seedStatus || "new";
  triage.set(b.id, { status: seeded, reason: b.seedReason || "", updatedAt: b.ageLabel || "" });
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
      // The article's two section headings. Copied for the same reason paragraphs
      // are: the spread above would hand a view a reference into the mocks module.
      subheads: Array.isArray(b.research?.subheads) ? b.research.subheads.slice() : [],
    },
    posts: Array.isArray(b.posts) ? b.posts.map((p) => ({ ...p, author: { ...(p.author || {}) } })) : [],
    // History rows are FILTERED to statuses that still exist, not just copied. Two
    // seeded rows said `saved`, and Save was scrapped — so the timeline rendered a
    // raw lowercase "saved" in a grey pill, because findReviewStatus() has nothing to
    // map it to and the row falls back to printing the id.
    //
    // Dropped rather than normalised to `new`, which is what a seedStatus of `saved`
    // does below: a status is a state the topic is IN, so re-labelling it is honest,
    // while a history row is an EVENT that happened. Being saved can no longer
    // happen, so there is no event left to show — and normalising would have printed
    // a second "To review" row beside the first.
    history: Array.isArray(b.history)
      ? b.history.filter((h) => !!findReviewStatus(h?.status)).map((h) => ({ ...h }))
      : [],
    // Past article versions. Cloned a level deeper than the spread for the same
    // reason `research` is: each carries its own paragraphs array, and a shallow
    // copy would hand a view a reference straight into the mocks module.
    versions: Array.isArray(b.versions)
      ? b.versions.map((v) => ({ ...v, paragraphs: Array.isArray(v.paragraphs) ? v.paragraphs.slice() : [] }))
      : [],
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
// `mo` FIRST — the alternation is ordered, so putting `m` first would match the
// "m" of "2mo" and leave "o" to fail the \b, which is exactly what used to
// happen: every month label fell through to MAX_SAFE_INTEGER and sorted as
// "unknown age". Months became usable only once the age grouping needed them.
const UNIT_MINUTES = { mo: 43200, w: 10080, d: 1440, h: 60, m: 1 };
const AGE_RE = /^\s*(\d+)\s*(mo|[wdhm])\b/i;

export function ageMinutes(label) {
  const m = AGE_RE.exec(String(label || ""));
  // Unparseable sorts LAST, not first: an unknown age is not a fresh one.
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * (UNIT_MINUTES[m[2].toLowerCase()] || 1);
}

// The age separators a topic list draws between its cards.
//
// Defined HERE, next to the parser, and not in the view: the feed asks which
// bucket a brief falls in, it does not get to decide what "7 days" means. Order
// is newest-first and the render relies on it — see AC-AGE-1.
//
// Boundaries are inclusive at the top, so "1w ago" is Last 7 days rather than
// falling into the next bucket on a technicality.
const DAY = 1440;
export const AGE_GROUPS = Object.freeze([
  { id: "week", label: "Last 7 days", maxDays: 7 },
  { id: "month", label: "Earlier this month", maxDays: 30 },
  { id: "earlier", label: "Earlier", maxDays: Infinity },
]);

export function ageGroupOf(brief) {
  const days = ageMinutes(brief && brief.ageLabel) / DAY;
  return AGE_GROUPS.find((g) => days <= g.maxDays) || AGE_GROUPS[AGE_GROUPS.length - 1];
}

// How many the new-session list can hold. Four when it was a carousel showing one
// card at a time, then eight for the list, now six: eight filled the section past the
// point where the eye takes it in as one group, and the closing row is a better answer
// than a longer scroll. The list renders the closing row after these, and its own cap
// has to match this one.
const STARTER_MAX = 6;

/**
 * Up to six briefs for the new-session page's Topics list, in the order
 * they are shown: the trending one, the updated one, then two plain New ones.
 *
 * The order is the point. The card shows one topic at a time, so the first one
 * has to be the one most worth acting on — and after the signals are spent, the
 * queue falls back to whatever is newest and untriaged. Saved / Used / Ignored
 * are excluded: all three mean the user has already answered this topic.
 *
 * Returns whole briefs (laneId included) rather than a view model — the screen
 * resolves the lane name, because lane names live in research-store and this
 * store deliberately doesn't know about it.
 */
/** Age cut for "fresh": the same 7 days the feed's first age group uses. */
const FRESH_DAYS = 7;
const isFresh = (b) => ageMinutes(b.ageLabel) <= FRESH_DAYS * DAY;

/**
 * Every Topic under a week old, across every feed and whatever its status. The
 * denominator of the new-session list's "N out of M shown" — M is what is FRESH,
 * not what is untriaged, so the number does not drop as the reader works through
 * the list. Counting all statuses is also what keeps M ≥ N: the list only draws
 * fresh `new` ones, which is a subset of this.
 */
export function countFreshTopics(laneIds = null) {
  return briefs.filter((b) => isFresh(b) && (!laneIds || laneIds.includes(b.laneId))).length;
}

/**
 * The new-session list.
 *
 * `laneIds` scopes it to the active Playbook's feeds — the caller resolves them,
 * because this store knows about lanes but not about which Playbook owns one.
 * Passing null means every lane, which is what the screen did before the rail
 * gained a scope switcher.
 */
export function getStarterTopics(laneIds = null) {
  // Fresh only, to match the section's own label. A `new` Topic older than a week
  // used to qualify, which made "Fresh topics to review" false and could push the
  // shown count above the fresh total.
  const inScope = laneIds ? (b) => laneIds.includes(b.laneId) : () => true;
  const all = briefs.map(withTriage).filter((b) => b.status === "new" && isFresh(b) && inScope(b));
  const byAge = (a, b) => ageMinutes(a.ageLabel) - ageMinutes(b.ageLabel);
  const trending = all.filter((b) => b.isTrending).sort(byAge)[0] || null;
  const updated = all.filter((b) => b.isUpdated && b !== trending).sort(byAge)[0] || null;
  const picked = [trending, updated].filter(Boolean);
  const plain = all
    .filter((b) => !b.isTrending && !b.isUpdated)
    .sort(byAge)
    .slice(0, STARTER_MAX - picked.length);
  return [...picked, ...plain].slice(0, STARTER_MAX);
}

/** A lane's briefs already split into AGE_GROUPS order, empty groups dropped. */
export function groupBriefsByAge(briefs) {
  return AGE_GROUPS.map((g) => ({ group: g, briefs: briefs.filter((b) => ageGroupOf(b).id === g.id) })).filter(
    (row) => row.briefs.length,
  );
}

function byRecency(a, b) {
  return ageMinutes(a.ageLabel) - ageMinutes(b.ageLabel);
}

// The LIVE sources, not every declared one. Seven of the eight in research-catalog.js
// are `live: false` — declared for the settings form, unable to produce a topic — and
// the Filters panel only offers the live ones (see research-feed.filterableSources).
// This has to be the same set: "all sources" is what the panel can tick, so deriving it
// from the full eight would leave the group permanently narrowed against a default it
// could never reach, and pin the Filters badge to 1.
const ALL_SOURCE_IDS = LIVE_SOURCE_IDS.slice();

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
  // Against the DEFAULT, not against all four. The default is New alone now, so a
  // full-breadth comparison would read "narrowed" the moment the panel opened and pin
  // the badge to 1 forever — which is exactly the failure the types note below
  // records from when their default was two of three. The badge means "you have
  // changed something", and at rest it means nothing is changed.
  //
  // Length alone is enough here and deliberately so: any change to a group's
  // selection changes its length UNLESS the user swaps one option for another, which
  // for a four-item group means they narrowed and widened in equal measure — still a
  // deviation, but not one worth a second data structure to catch in a prototype.
  if ((filters.statuses || []).length !== DEFAULT_STATUS_IDS.length) n++;
  if ((filters.sources || []).length !== ALL_SOURCE_IDS.length) n++;
  // Types are NOT counted, and the reason is the same one that excluded them
  // when they were always-visible chips: a control you can see needs no badge.
  // The segmented control in the topbar is that control now, and `filters.types`
  // no longer has a UI at all — it stays at its default forever, so counting it
  // could only ever add zero.
  return n;
}

// ── An attention signal only ever lives in Last 7 days ──────────────────────
// Trending and Updated are claims about RIGHT NOW — "this is running above its
// baseline", "the story just moved". A card carrying either one under a
// three-weeks-ago separator contradicts itself, and it is the separator the
// reader believes. So the flags are cleared past the first age group rather
// than left to the seed data to get right: age is the single source of truth
// (see AGE_GROUPS), and a signal is a statement about age.
//
// Enforced here rather than in mocks.js because every read goes through this
// function — the feed, the attention page, the picker and the lane counts all
// agree for free, and a future seed cannot reintroduce the contradiction.
function withTriage(b) {
  const t = triage.get(b.id) || { status: "new", reason: "" };
  const fresh = ageGroupOf(b).id === "week";
  return {
    ...b,
    status: t.status,
    ignoreReason: t.reason,
    isTrending: !!b.isTrending && fresh,
    isUpdated: !!b.isUpdated && fresh,
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

// Every brief carrying an ATTENTION SIGNAL — trending or updated — whatever its
// review status. The union of the two, deduped by construction (one brief, one
// entry, even when it is both). Like getTrendingForLane it takes no filters: the
// attention page ignores triage by design, and accepting one would invite a
// caller to pass it.
export function getAttentionForLane(laneId) {
  return briefs
    .filter((b) => b.laneId === laneId && (b.isTrending || b.isUpdated))
    .map(withTriage)
    .sort(byRecency);
}

// How many topics in the lane carry an attention signal, broken down by signal.
//
// Unconditional by product decision: the notice reports what is flagged, full
// stop. Two narrower rules were tried and removed — counting only what the active
// filter hid, then counting only what the reader had not yet opened /attention to
// see. Both existed to stop the notice becoming permanent furniture, and both are
// gone, so it now shows for as long as anything is flagged. `showTrending` on the
// lane is the only way to switch it off.
//
// `total` is DEDUPED while the two breakdowns are not: a brief that is both
// trending and updated is one topic needing attention but appears under both
// labels, so the two numbers may sum to more than the total. The copy therefore
// lists them as separate labels and never as an equation.
export function attentionCountsForLane(laneId) {
  const flagged = briefs.filter((b) => b.laneId === laneId && (b.isTrending || b.isUpdated));
  return {
    trending: flagged.filter((b) => b.isTrending).length,
    updated: flagged.filter((b) => b.isUpdated).length,
    total: flagged.length,
  };
}

export function countNewForLane(laneId) {
  return briefs.filter((b) => b.laneId === laneId && getStatus(b.id) === "new").length;
}

/**
 * THE title of a Topic, for every surface that shows one.
 *
 * A brief carries two: `headline`, written when the scan grouped the posts, and
 * `research.title`, written when Archie wrote the article. They were different
 * sentences about the same topic, so a card said one thing and the article you
 * opened from it said another — the card read as a summary of something else.
 *
 * The article's is the one that survives: it is the claim the topic actually
 * makes, and it is what the reader is deciding on. `headline` stays in the data
 * as the fallback for a brief whose article has not been written.
 */
export function briefTitle(brief) {
  return brief?.research?.title || brief?.headline || "";
}

export function getBriefById(id) {
  const b = briefs.find((x) => x.id === id);
  return b ? withTriage(b) : null;
}

/**
 * Every version of a topic's article, oldest first, with the CURRENT one appended
 * as the last entry.
 *
 * Appending rather than storing it twice: `research` is the live article and the
 * mocks hold only past versions, so this is the single place the two shapes are
 * reconciled. `isCurrent` is what a view keys "you are reading this one" off —
 * never the array index, which changes the next time the topic is re-scanned.
 *
 * Returns [] when a topic has only ever had one version. One version is not a
 * history, and the caller uses the empty array to decide whether to offer the
 * link at all.
 */
export function getBriefVersions(briefId) {
  const b = briefs.find((x) => x.id === briefId);
  if (!b || !Array.isArray(b.versions) || !b.versions.length) return [];
  return [
    ...b.versions.map((v) => ({ ...v, paragraphs: v.paragraphs.slice(), isCurrent: false })),
    {
      id: "current",
      when: b.ageLabel || "now",
      // The current version's "what changed" IS the card's Updated explanation —
      // that badge and this row are the same claim, so they read from one field.
      whatChanged: b.whatChanged || "",
      title: b.research?.title || "",
      paragraphs: (b.research?.paragraphs || []).slice(),
      isCurrent: true,
    },
  ];
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
/**
 * @deprecated SAVED IS GONE — nothing calls this.
 *
 * "I'll come back to this" is now a VIEW (the Topics-for-later segment), not a
 * status, and a status duplicating a view is a second answer to one question.
 * Kept because restoring Save means restoring exactly this, and because the
 * seed data still carries `seedStatus: "saved"` rows that normalise to New.
 */
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

// The way back. Its own function rather than setStatus(id, "new") because it has
// to CLEAR the reason as well: setStatus spreads the previous triage row, so the
// sentence the user typed when they ignored the topic would survive on a topic
// that is no longer ignored — invisible while it sits there, and then wrong the
// moment anything reads it.
//
// Back to `new`, not to whatever the status was before. Ignoring is the only
// thing that can be undone here, and the two states it can be undone FROM are
// `new` (nothing had happened) and `used` (the topic went into a chat) — and
// restoring `used` would put a finished topic back on a list of things to do.
// "Un-ignore" means "put it back in the queue", which is what `new` is.
export function unignoreBrief(briefId) {
  const b = briefs.find((x) => x.id === briefId);
  if (!b) return null;
  triage.set(briefId, { status: "new", reason: "", updatedAt: "just now" });
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
