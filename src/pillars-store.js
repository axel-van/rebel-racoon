// Pillars store — Content strategy: the two or three things a brand keeps
// coming back to, and everything that has fed each one.
//
// GLOBAL, like briefs-store and topics-store: a pillar belongs to a Playbook and
// grows on its own as topics and chats arrive, long before a chat exists to hold
// it. Nothing here is per session.
//
// ── The decision this store encodes ────────────────────────────────────────
// Matching is TRUSTED and reviewed AFTERWARDS. There is no pending state, no
// approval queue and no `status` on a source: Archie files what matches, the
// row records WHEN it arrived, and the only user verb is Remove. An approval
// queue was the alternative and it makes a chore out of a feature nobody has to
// use — worse, an unattended queue silently stops the pillar learning anything.
//
// The two consequences every view depends on:
//   • Sources are ALWAYS newest first, and each carries `addedAgo`. That order
//     IS the review mechanism — "what arrived since I last looked" is the top of
//     the list, not a separate place.
//   • Removing a source RE-CONDENSES the context. A removal that leaves the
//     prose untouched is the failure mode: the user has been told the context
//     was rebuilt and will not check. `recondense()` is the seam where a real
//     prompt goes.
//
// ── Two different things point a topic at a pillar ─────────────────────────
// `pillar.sources` is the AUDIT TRAIL — what fed the condensed context.
// `links` (briefId → pillarId) is the MARK on the topic card, and what rides
// along into a chat.
// They are separate on purpose: unlinking from the feed must not silently
// rewrite a pillar's context, and removing a source from the pillar must not
// make the topic pretend it was never matched. Seeded together, diverge freely.
//
// Public API:
//   getPillars()                      → Pillar[]  (all Playbooks)
//   getPillarsForPlaybook(pbId)       → Pillar[]
//   getPillarById(id)                 → Pillar | null
//   addPillar({name, about, playbookId, assets}) → Pillar
//   updatePillar(id, patch)           mutates + notifies
//   deletePillar(id) / mergePillar(fromId, intoId)
//   removeSource(pillarId, sourceId)  → re-condenses
//   addAsset(pillarId, asset) / removeAsset(pillarId, assetId)
//   unseenCount() / unseenCountFor(id) / markPillarSeen(id)
//   pillarForBrief(briefId)           → Pillar | null   (the card's mark)
//   unlinkBrief(briefId)              → clears the mark only
//   subscribe(fn)                     → unsubscribe

import { pillars as seed } from "./mocks.js?v=95";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=3";

const notifier = createNotifier("pillars-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(null);

/**
 * How long a pillar's name may be, in characters.
 *
 * A pillar name is a THEME, not a sentence — "Sustainable wardrobe", "Full-price
 * confidence". Past about 50 characters it stops reading as a label: it wraps the
 * h1 on the pillar page, pushes Share off that header's row, and truncates in the
 * Content-strategy card and on the topic cards' pillar mark, both of which show it
 * in far less space.
 *
 * It lives HERE, not on the screen that types it, because two writers have to agree
 * on it: the rename field on /pillar/:id and duplicatePillar()'s "(copy)" suffix.
 */
export const NAME_MAX = 50;

let nextId = 1;

function clonePillar(p) {
  return {
    ...p,
    sources: Array.isArray(p.sources) ? p.sources.map((s) => ({ ...s })) : [],
    assets: Array.isArray(p.assets) ? p.assets.map((a) => ({ ...a })) : [],
  };
}

const pillars = isNewUser() ? [] : seed.map(clonePillar);

// briefId → pillarId. Seeded from whichever sources arrived as topics, so the
// mark on a topic card and the row in the trail start life agreeing.
const links = new Map();
for (const p of pillars) {
  for (const s of p.sources) {
    if (s.briefId) links.set(s.briefId, p.id);
  }
}

// ── Age → sortable minutes ────────────────────────────────────────────────
// Same parser and the same reasoning as briefs-store: the mocks carry a relative
// label because a prototype has no clock worth trusting. Ascending minutes IS
// newest first. Replace with timestamps when this is wired to a backend.
const UNIT_MINUTES = { mo: 43200, w: 10080, d: 1440, h: 60, m: 1 };
const AGE_RE = /^\s*(\d+)\s*(mo|[wdhm])\b/i;

export function addedMinutes(label) {
  const text = String(label || "").trim();
  // "just now" is what anything added during the session carries, and the regex
  // below cannot match it — so it fell through to MAX_SAFE_INTEGER and sorted as
  // the OLDEST thing in the trail. The first entry written at runtime (a context
  // rewrite) landed at the bottom of a list whose whole promise is newest-first.
  if (/^(just\s+)?now$/i.test(text)) return 0;
  const m = AGE_RE.exec(text);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * (UNIT_MINUTES[m[2].toLowerCase()] || 1);
}

// Under a week reads as recent. One number, used for the tint on a row and for
// nothing else — "new" (the counters) is the unseen flag below, not an age.
const FRESH_MINUTES = 7 * 24 * 60;
export const isRecent = (source) => addedMinutes(source.addedAgo) < FRESH_MINUTES;

function sortedSources(p) {
  return p.sources.slice().sort((a, b) => addedMinutes(a.addedAgo) - addedMinutes(b.addedAgo));
}

// ─── Reads ────────────────────────────────────────────────────────────────

export function getPillars() {
  return pillars.map((p) => ({ ...p, sources: sortedSources(p), assets: p.assets.slice() }));
}

export function getPillarsForPlaybook(playbookId) {
  return getPillars().filter((p) => p.playbookId === playbookId);
}

export function getPillarById(id) {
  const p = pillars.find((x) => x.id === id);
  return p ? { ...p, sources: sortedSources(p), assets: p.assets.slice() } : null;
}

// ─── Unseen ───────────────────────────────────────────────────────────────
// `seen` is per SOURCE, and it clears when the pillar itself is opened — not
// when the section is. Clearing on the list page would wipe a badge whose
// contents nobody looked at, which is the one thing a notification must not do.

export function unseenCountFor(pillarId) {
  const p = pillars.find((x) => x.id === pillarId);
  return p ? p.sources.filter((s) => !s.seen).length : 0;
}

/** Unseen across every pillar, or across one Playbook's when `playbookId` is given. */
export function unseenCount(playbookId = null) {
  return pillars
    .filter((p) => !playbookId || p.playbookId === playbookId)
    .reduce((n, p) => n + p.sources.filter((s) => !s.seen).length, 0);
}

export function markPillarSeen(pillarId) {
  const p = pillars.find((x) => x.id === pillarId);
  if (!p) return;
  let changed = false;
  for (const s of p.sources) {
    if (!s.seen) {
      s.seen = true;
      changed = true;
    }
  }
  if (changed) notify();
}

// ─── The mark on a topic card ─────────────────────────────────────────────

export function pillarForBrief(briefId) {
  const id = links.get(briefId);
  return id ? getPillarById(id) : null;
}

/**
 * File a topic under a pillar from the feed.
 *
 * Writes the LINK only — the mark on the card and the context that rides into a
 * chat. It does NOT push a row into the pillar's trail, because the trail
 * records what fed the condensed context and a link made by hand has not fed it
 * yet; that happens when the pillar next re-condenses. Keeping the two apart is
 * the same separation `unlinkBrief` relies on in the other direction.
 */
export function linkBrief(briefId, pillarId) {
  if (!briefId || !pillarId) return null;
  const pillar = pillars.find((p) => p.id === pillarId);
  if (!pillar) return null;
  links.set(briefId, pillarId);
  notify();
  return { ...pillar };
}

export function unlinkBrief(briefId) {
  if (!links.has(briefId)) return null;
  const pillar = getPillarById(links.get(briefId));
  links.delete(briefId);
  notify();
  return pillar;
}

// ─── The timeline ─────────────────────────────────────────────────────────
//
// The history is read as a list of EVENTS, not of items. Four kinds:
//
//   update   a weekly run — several inputs folded into one rewrite
//   manual   the user rewrote the context themselves
//   freeze   updates were held
//   unfreeze updates resumed
//
// Batching by week is what makes it survive two years: a run is the unit a
// reader thinks in ("what did last week do?"), so 100 rows beats 400. It is also
// a claim — if cadence ever becomes continuous, the week stops being a real
// boundary and this grouping should go with it.
//
// The bucket comes from the age label, because that is all a prototype has: the
// mocks carry "2d ago" and nothing carries a timestamp. Same parser as the sort.
const WEEK_MINUTES = 7 * 24 * 60;

function weekBucket(source) {
  const mins = addedMinutes(source.addedAgo);
  if (!Number.isFinite(mins) || mins === Number.MAX_SAFE_INTEGER) return 9999;
  return Math.floor(mins / WEEK_MINUTES);
}

function weekLabel(bucket) {
  if (bucket <= 0) return "This week";
  if (bucket === 1) return "Last week";
  if (bucket >= 9999) return "Earlier";
  return `${bucket} weeks ago`;
}

/**
 * The pillar's history, newest first, as the modal renders it.
 *
 * Manual rewrites and freeze events stay whole — each is one thing that happened
 * at one moment. Only the inputs a weekly run folded in are grouped, and they are
 * grouped by the week they arrived rather than by anything the run recorded,
 * because the run itself is not stored yet. That is the gap: with a real update
 * record this function reads it instead of inferring it, and nothing above
 * changes.
 */
export function getPillarTimeline(id) {
  const p = pillars.find((x) => x.id === id);
  if (!p) return [];
  const entries = [];
  const weeks = new Map();

  for (const s of sortedSources(p)) {
    if (s.kind === "edit" || s.kind === "freeze" || s.kind === "unfreeze") {
      entries.push({ type: s.kind, at: addedMinutes(s.addedAgo), source: s });
      continue;
    }
    const bucket = weekBucket(s);
    if (!weeks.has(bucket)) {
      const week = { type: "update", at: bucket * WEEK_MINUTES, bucket, label: weekLabel(bucket), inputs: [] };
      weeks.set(bucket, week);
      entries.push(week);
    }
    weeks.get(bucket).inputs.push(s);
  }

  // One ordering for both kinds: minutes ago, ascending. A week sorts at its own
  // start, so a manual edit made mid-week lands inside that week rather than
  // above or below the whole block.
  return entries.sort((a, b) => a.at - b.at);
}

// ─── Writes ───────────────────────────────────────────────────────────────

// The condense step, mocked. Real implementation replaces the body and keeps the
// signature: everything else in this store calls it rather than touching
// `context`, so there is exactly one place a prompt has to be wired.
function recondense(p) {
  p.contextUpdatedAgo = "just now";
  p.contextRebuilding = false;
}

/**
 * Freeze or resume the weekly updates for one pillar.
 *
 * Freezing is an EVENT, not a preference: it takes a row in the same list as the
 * updates it is suppressing, which is what makes a six-month gap explicable later
 * — the reason sits exactly where the missing weeks would have been. Unfreezing
 * writes the reciprocal row, so a pillar that was held twice reads as two pairs
 * rather than as one long silence.
 *
 * No confirm dialog: nothing is destroyed and the same switch undoes it.
 */
export function setPillarFrozen(id, frozen) {
  const p = pillars.find((x) => x.id === id);
  if (!p || !!p.frozen === !!frozen) return null;
  p.frozen = !!frozen;
  p.sources.unshift({
    id: `ps-${frozen ? "freeze" : "unfreeze"}-${nextId++}`,
    kind: frozen ? "freeze" : "unfreeze",
    title: frozen ? "You froze updates" : "You resumed updates",
    addedAgo: "just now",
    seen: true,
  });
  notify();
  return clonePillar(p);
}

/** Is this pillar holding its updates? */
export function isPillarFrozen(id) {
  const p = pillars.find((x) => x.id === id);
  return !!(p && p.frozen);
}

export function addPillar({ name, about = "", playbookId = null, assets = [] } = {}) {
  const pillar = {
    id: `pil-new-${nextId++}`,
    playbookId,
    name: String(name || "Untitled pillar").trim(),
    about: String(about || "").trim(),
    // A brand-new pillar has nothing to condense yet, so the user's own sentence
    // IS the context until something arrives. Showing empty prose here read as
    // broken; showing their sentence reads as "this is what I have so far".
    context: String(about || "").trim(),
    contextUpdatedAgo: "just now",
    createdBy: "you",
    openedAgo: "just now",
    sources: [],
    assets: assets.map((a, i) => ({ id: `as-new-${nextId}-${i}`, ...a })),
  };
  pillars.unshift(pillar);
  notify();
  return clonePillar(pillar);
}

export function updatePillar(id, patch = {}) {
  const p = pillars.find((x) => x.id === id);
  if (!p) return;
  // Snapshot before overwriting. `previousContext` is what "Show what changed"
  // marks against, and the context is generated — without the snapshot the old
  // wording is gone the moment a run or an edit lands, and the diff has nothing
  // to be a diff of.
  if (typeof patch.context === "string" && patch.context !== p.context) {
    p.previousContext = p.context;
  }
  Object.assign(p, patch);
  notify();
}

/**
 * Duplicate a pillar — the AUTHORED half only: name, sentence, condensed context,
 * assets, Playbook. The copy opens with ZERO sources.
 *
 * The trail cannot be copied, and that is the one interesting thing here. `links`
 * maps one briefId to exactly one pillarId, so copying a source leaves two bad
 * options: re-point the topic's mark at the copy, which silently unmarks the
 * original's cards in the feed, or leave the mark alone, which gives the copy a
 * trail claiming topics that belong to another pillar. mergePillar() re-points on
 * purpose — it deletes the source pillar in the same breath, so no mark is ever
 * orphaned. Here the original survives, so neither option is honest: the copy is a
 * new pillar with a head start on its prose, and it fills from the next scan like
 * any other.
 *
 * Asset ids are STRIPPED rather than passed through: addPillar spreads the incoming
 * asset after its generated id, so a kept id would win and two pillars would hold
 * assets under the same key.
 */
export function duplicatePillar(id) {
  const src = pillars.find((x) => x.id === id);
  if (!src) return null;
  const copy = addPillar({
    name: copyName(src.name),
    about: src.about,
    playbookId: src.playbookId,
    assets: src.assets.map(({ id: _dropId, ...rest }) => rest),
  });
  // addPillar seeds `context` from `about` — right for a pillar typed from scratch,
  // wrong here, where a condensed context already exists and was not necessarily
  // written from the sentence. createdBy is "you" whatever the original was: you
  // pressed Duplicate, so the copy must not wear the "Automatically created" label.
  updatePillar(copy.id, { context: src.context || src.about || "", createdBy: "you", reviewed: true });
  return getPillarById(copy.id);
}

// "<name> (copy)", with the BASE trimmed so the suffix survives the cap rather
// than being eaten by it. Clipping the other way round gives you two pillars
// called "Sustainable wardrobe and full-price confidence acr" and no way to tell
// which is which.
function copyName(name) {
  const suffix = " (copy)";
  const base = String(name || "Untitled pillar").trim();
  return base.length + suffix.length <= NAME_MAX
    ? `${base}${suffix}`
    : `${base.slice(0, NAME_MAX - suffix.length).trimEnd()}${suffix}`;
}

/**
 * Record a user's rewrite of the context as a trail entry.
 *
 * The trail answers "what went into this pillar", and until now it only knew
 * about things ARCHIE put in — topics, chats, notes. A person rewriting the
 * condensed context is the largest single change anyone can make to a pillar, and
 * it left no mark at all: the prose simply read differently the next time you
 * opened it, with "Last rewritten 2d ago" the only clue that anything had
 * happened, and no way to see what it used to say.
 *
 * Both halves are kept. `before` is the whole point — the condensed text is
 * generated, so an edit overwrites something nobody else has a copy of.
 *
 * Deliberately NOT called from recondense(): that is the machine rewriting its
 * own summary after a source is added or removed, and logging it would fill the
 * trail with entries the user did not make. Only an explicit save records one.
 */
export function recordContextEdit(id, before, after) {
  const p = pillars.find((x) => x.id === id);
  if (!p) return null;
  const from = String(before || "").trim();
  const to = String(after || "").trim();
  // Nothing changed — opening the editor and saving is not an edit.
  if (from === to) return null;
  const entry = {
    id: `ps-edit-${nextId++}`,
    kind: "edit",
    title: "You rewrote the context",
    before: from,
    after: to,
    addedAgo: "just now",
    seen: true,
  };
  p.sources.unshift(entry);
  notify();
  return { ...entry };
}

export function deletePillar(id) {
  const i = pillars.findIndex((x) => x.id === id);
  if (i === -1) return;
  for (const s of pillars[i].sources) if (s.briefId) links.delete(s.briefId);
  pillars.splice(i, 1);
  notify();
}

// Merge, not delete-and-recreate: the common failure of an auto-opened pillar is
// a near-duplicate of one that already exists, and without this the only
// recovery is deleting it and losing everything it collected.
export function mergePillar(fromId, intoId) {
  const from = pillars.find((x) => x.id === fromId);
  const into = pillars.find((x) => x.id === intoId);
  if (!from || !into || from === into) return;
  for (const s of from.sources) {
    into.sources.push({ ...s });
    if (s.briefId) links.set(s.briefId, into.id);
  }
  for (const a of from.assets) into.assets.push({ ...a });
  recondense(into);
  pillars.splice(pillars.indexOf(from), 1);
  notify();
}

export function removeSource(pillarId, sourceId) {
  const p = pillars.find((x) => x.id === pillarId);
  if (!p) return null;
  const i = p.sources.findIndex((s) => s.id === sourceId);
  if (i === -1) return null;
  const [removed] = p.sources.splice(i, 1);
  // The link survives on purpose: the topic was still matched, and a removal in
  // the pillar is not a statement about the topic's card in the feed.
  recondense(p);
  notify();
  return removed;
}

export function restoreSource(pillarId, source, index = 0) {
  const p = pillars.find((x) => x.id === pillarId);
  if (!p || !source) return;
  p.sources.splice(index, 0, { ...source });
  recondense(p);
  notify();
}

export function addAsset(pillarId, { name, kind = "doc", size = "" } = {}) {
  const p = pillars.find((x) => x.id === pillarId);
  if (!p || !name) return null;
  const asset = { id: `as-${nextId++}`, name, kind, size };
  p.assets.unshift(asset);
  notify();
  return asset;
}

export function removeAsset(pillarId, assetId) {
  const p = pillars.find((x) => x.id === pillarId);
  if (!p) return null;
  const i = p.assets.findIndex((a) => a.id === assetId);
  if (i === -1) return null;
  const [removed] = p.assets.splice(i, 1);
  notify();
  return removed;
}

// Extension → the three asset shapes the pillar page draws. Not file-kinds.js:
// that maps a SOURCE kind to a DS icon for the content pipeline, and a pillar
// asset is a different object with three buckets rather than nine.
export function assetKindFor(filename) {
  const ext = String(filename || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "avi", "m4v"].includes(ext)) return "video";
  return "doc";
}
