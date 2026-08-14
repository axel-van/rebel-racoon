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

import { pillars as seed } from "./mocks.js?v=91";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=3";

const notifier = createNotifier("pillars-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(null);

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
  const m = AGE_RE.exec(String(label || ""));
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

// ─── Writes ───────────────────────────────────────────────────────────────

// The condense step, mocked. Real implementation replaces the body and keeps the
// signature: everything else in this store calls it rather than touching
// `context`, so there is exactly one place a prompt has to be wired.
function recondense(p) {
  p.contextUpdatedAgo = "just now";
  p.contextRebuilding = false;
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
  Object.assign(p, patch);
  notify();
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
