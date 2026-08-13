// Research store — the lanes a user has set up, account-wide.
//
// GLOBAL, like connectors-store and topics-store, not per-session: a lane pairs
// a Playbook with a set of sources and runs on a cadence, long before any chat
// exists to hold what it finds. The lane list spans every Playbook.
//
// A lane is the unit Content Research is built on, and it is exactly what
// /topics deliberately does NOT have. Topics is one stream across every
// Playbook; a lane is a named, scoped standing query. That difference is why
// this is a separate store rather than a field on contexts-store.
//
// Public API:
//   getLanes()             → Lane[]  (creation order — the grid is stable)
//   getLaneById(id)        → Lane | null
//   getLanesForPlaybook(id)→ Lane[]
//   addLane(draft)         → Lane    (assigns the id, normalises, notifies)
//   updateLane(id, patch)  → Lane | null
//   duplicateLane(id)      → Lane | null  (appends a "(copy)" sibling)
//   deleteLane(id)         → boolean
//   subscribe(fn)          → unsubscribe
//
// Lane shape (see mocks.researchLanes):
//   { id, name, playbookId,
//     sources: string[],        — enabled source ids, from research-catalog
//     cadence,                  — a CADENCES id; copy, never a timer
//     notify,                   — "notify me after a scan" switch
//     showTrending }            — gates the banner AND the trending page entry

import { researchLanes as seed } from "./mocks.js?v=90";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";
import { DEFAULT_ENABLED_IDS, DEFAULT_CADENCE, findCadence, findResearchSource } from "./research-catalog.js?v=19";

// First-time user mode starts empty so /topic-feeds renders its empty state and the
// sidebar row carries no count. Returning user keeps the mock seed. Same guard
// as contexts-store / topics-store / library.
const lanes = isNewUser() ? [] : seed.map(normalizeLane);

let seq = lanes.length;

const notifier = createNotifier("research-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getLanes());

// Every lane that enters the store goes through this — addLane AND the seed,
// which would otherwise bypass it and let a typo'd cadence or an unknown source
// id reach the view. contexts-store learned this the hard way with
// normalizeTopics(), which the seed originally skipped.
function normalizeLane(raw = {}) {
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((id) => !!findResearchSource(id)) : [];
  return {
    id: raw.id || "",
    name: (raw.name || "").trim(),
    playbookId: raw.playbookId || "",
    // Fall back to the catalogue default rather than an empty lane: a lane with
    // no sources can never return a brief, which looks like a bug not a choice.
    sources: sources.length ? Array.from(new Set(sources)) : DEFAULT_ENABLED_IDS.slice(),
    cadence: findCadence(raw.cadence) ? raw.cadence : DEFAULT_CADENCE,
    notify: raw.notify !== false,
    showTrending: raw.showTrending !== false,
    // Sites the Brand-website source scans. Owned by the LANE, not the Playbook:
    // the Playbook's own websiteUrl is the brand's canonical address, while this
    // is the scan list for one research lane, which may add a blog, a docs site
    // or a regional domain the brand record has no business holding. The form
    // seeds the list from the Playbook so the common case needs no typing.
    //
    // Normalised rather than trusted: trimmed, blanks dropped, de-duplicated
    // case-insensitively. A blank row is how a freshly-added field starts, so it
    // must never survive a save.
    websites: dedupeUrls(Array.isArray(raw.websites) ? raw.websites : []),
  };
}

function dedupeUrls(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const url = String(raw || "").trim();
    if (!url) continue;
    const key = url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

// Both array fields cloned on the way out. Handing back the live arrays let a
// view's splice mutate the store behind its back — the reason every getter here
// went through .slice() already; `websites` joins it rather than being the one
// field that leaks.
function copyLane(l) {
  return { ...l, sources: l.sources.slice(), websites: l.websites.slice() };
}

/** Every lane, in creation order so the grid doesn't reshuffle on repaint. */
export function getLanes() {
  return lanes.map(copyLane);
}

export function getLaneById(id) {
  const l = lanes.find((x) => x.id === id);
  return l ? copyLane(l) : null;
}

export function getLanesForPlaybook(playbookId) {
  return getLanes().filter((l) => l.playbookId === playbookId);
}

export function addLane(draft = {}) {
  const lane = normalizeLane({ ...draft, id: draft.id || `lane-${++seq}` });
  lanes.push(lane);
  notify();
  return copyLane(lane);
}

export function updateLane(id, patch = {}) {
  const i = lanes.findIndex((x) => x.id === id);
  if (i < 0) return null;
  // Re-normalise the merged result, not the patch: a patch that only carries
  // `cadence` still has to be validated against the catalogue.
  lanes[i] = normalizeLane({ ...lanes[i], ...patch, id });
  notify();
  return copyLane(lanes[i]);
}

// Appends rather than inserting beside the original: the grid is creation-ordered,
// so a copy landing last is where the user's eye already is after the click.
export function duplicateLane(id) {
  const src = lanes.find((x) => x.id === id);
  if (!src) return null;
  return addLane({ ...src, id: `lane-${++seq}`, name: `${src.name} (copy)` });
}

export function deleteLane(id) {
  const i = lanes.findIndex((x) => x.id === id);
  if (i < 0) return false;
  lanes.splice(i, 1);
  notify();
  return true;
}
