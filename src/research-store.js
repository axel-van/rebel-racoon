// Research store — the findings feed and the scan engine.
//
// A FINDING is an evidence-backed research insight (headline, summary,
// long-form synthesis, source posts, idea seeds). Findings sit upstream of
// Ideas: Source → Finding → Idea → Draft → Schedule.
//
// GLOBAL, like top-posts-store and sources-stream — findings come from
// account-level listening, and /research has no session context at all. Each
// finding is tagged with the Playbook it was produced for (`contextId`) so the
// feed can filter; the per-session part of the story is the CONSEQUENCE of
// using a finding, and that's library.injectIdeasForSource, already
// per-session. So nothing here takes a sessionId — it's only recorded on
// `usedIn` for provenance.
//
// The CONFIG (which sources are scanned, cadence, notify) is per Playbook and
// lives on the Context (`ctx.research`), not here — see contexts-store. This
// module reads and patches it through getResearchConfig/setSourceEnabled/…,
// filling the catalog defaults when a legacy seed has no field.
//
// Public API:
//   getFindings({ contextId, includeDismissed })  → Finding[]  (newest first)
//   getFinding(id)                                → Finding | null
//   findingKey(finding)                           → string     (dedupe key)
//   getNewCount({ contextId })                    → number      status === "new"
//   markSeen(id) / markAllSeen({ contextId })
//   markUsed(id, { sessionId })                   → Finding | null
//   dismissFinding(id)                            → boolean
//   getResearchConfig(contextId)                  → { enabledSourceIds, cadence, notify }
//   setSourceEnabled(contextId, sourceId, on) / setCadence(contextId, id) / setNotify(contextId, on)
//   runScan({ contextId, manual, onDone })        → boolean     (started?)
//   isScanning(contextId)                         → boolean
//   getLastScanAt(contextId)                      → string | null
//   subscribe(fn)                                 → unsubscribe
//
// Empty in new-alt mode — a brand-new user has nothing to have researched yet,
// so /research shows its empty state and offers a scan instead.

import { researchFindings as seed, researchScanPool as poolSeed } from "./mocks.js?v=58";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";
import { getContextById, updateContext } from "./contexts-store.js?v=39";
import { DEFAULT_ENABLED_IDS, findCadence } from "./research-catalog.js?v=2";

// How long a scan "runs". Long enough to read as work, short enough to demo.
const SCAN_MS = 2600;

// A scan delivers at most this many findings at once — a feed that gains eight
// cards in one go reads as a dump, not as research.
const MAX_PER_SCAN = 3;

let findings = null;
let pool = null;
// dedupeKeys of findings the user rejected. Scans filter against this, so a
// dismissed finding never comes back — even if a later scan re-derives the same
// insight under a new id. Same contract as ctx.dismissedCompetitors.
const dismissedKeys = [];
// contextId → scan timeout handle, so a second click can't stack scans.
const scanning = new Map();
// contextId → human "last scan" label.
const lastScanAt = new Map();

const notifier = createNotifier("research-store");
export const subscribe = notifier.subscribe;

function notify() {
  notifier.notify({
    findings: getFindings(),
    newCount: getNewCount(),
    scanning: scanning.size > 0,
  });
}

// Deep-ish clone: a finding carries nested posts and idea seeds, and callers
// (the modal, the flow) hold on to them, so a shallow copy of the seed would
// let one surface's edit leak into the mock array.
function cloneFinding(f) {
  return {
    ...f,
    synthesis: Array.isArray(f.synthesis) ? f.synthesis.slice() : [],
    posts: Array.isArray(f.posts) ? f.posts.map((p) => ({ ...p, author: { ...p.author } })) : [],
    ideaSeeds: Array.isArray(f.ideaSeeds) ? f.ideaSeeds.map((s) => ({ ...s })) : [],
  };
}

function ensureSeeded() {
  if (findings === null) findings = isNewUser() ? [] : seed.map(cloneFinding);
  if (pool === null) pool = isNewUser() ? [] : poolSeed.map(cloneFinding);
  return findings;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** Stable identity across scans — keyed on dedupeKey, never on id. */
export function findingKey(finding) {
  if (!finding) return "";
  if (typeof finding === "string") return finding;
  return finding.dedupeKey || finding.id || "";
}

export function getFindings({ contextId = null, includeDismissed = false } = {}) {
  const all = ensureSeeded();
  return all.filter((f) => {
    if (contextId && f.contextId !== contextId) return false;
    if (!includeDismissed && f.status === "dismissed") return false;
    return true;
  });
}

export function getFinding(id) {
  return ensureSeeded().find((f) => f.id === id) || null;
}

/**
 * Unseen findings. The badge and the "New" tag read the same `status` field —
 * one field covers new/seen/used/dismissed, so there's no seen-set to join.
 */
export function getNewCount({ contextId = null } = {}) {
  return getFindings({ contextId }).filter((f) => f.status === "new").length;
}

export function getLastScanAt(contextId) {
  return lastScanAt.get(contextId) || null;
}

export function isScanning(contextId = null) {
  if (contextId) return scanning.has(contextId);
  return scanning.size > 0;
}

/** How many findings sit in the pool for a Playbook, ignoring enabled sources. */
export function getPoolCount(contextId) {
  ensureSeeded();
  return pool.filter((f) => f.contextId === contextId).length;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

export function markSeen(id) {
  const f = getFinding(id);
  if (!f || f.status !== "new") return false;
  f.status = "seen";
  notify();
  return true;
}

/**
 * Clear the "New" state. Called from the /research screen's TEARDOWN, not its
 * mount — clearing on arrival would make the tags vanish while the user is
 * still reading them.
 */
export function markAllSeen({ contextId = null } = {}) {
  let changed = 0;
  for (const f of getFindings({ contextId })) {
    if (f.status === "new") {
      f.status = "seen";
      changed += 1;
    }
  }
  if (changed) notify();
  return changed;
}

export function markUsed(id, { sessionId = null } = {}) {
  const f = getFinding(id);
  if (!f) return null;
  f.status = "used";
  f.usedIn = { sessionId, at: "just now" };
  notify();
  return f;
}

/**
 * Reject a finding. Remembers the dedupeKey so no later scan re-proposes it,
 * and keeps the finding itself around (status "dismissed") so the feed's "Show
 * dismissed" toggle can surface it and Undo can restore it.
 */
export function dismissFinding(id) {
  const f = getFinding(id);
  if (!f || f.status === "dismissed") return false;
  f.status = "dismissed";
  const key = findingKey(f);
  if (key && !dismissedKeys.includes(key)) dismissedKeys.push(key);
  notify();
  return true;
}

/** Undo a dismissal — restores the card and forgets the rejection. */
export function restoreFinding(id) {
  const f = getFinding(id);
  if (!f || f.status !== "dismissed") return false;
  f.status = "seen";
  const idx = dismissedKeys.indexOf(findingKey(f));
  if (idx !== -1) dismissedKeys.splice(idx, 1);
  notify();
  return true;
}

// ── Per-Playbook config (stored on the Context) ────────────────────────────

/**
 * The research config for a Playbook, with catalog defaults filled in. A
 * Playbook seeded before this feature existed has no `research` field and
 * behaves exactly like a fresh one.
 */
export function getResearchConfig(contextId) {
  const ctx = contextId ? getContextById(contextId) : null;
  const cfg = ctx && ctx.research ? ctx.research : null;
  return {
    enabledSourceIds: Array.isArray(cfg?.enabledSourceIds) ? cfg.enabledSourceIds.slice() : DEFAULT_ENABLED_IDS.slice(),
    cadence: findCadence(cfg?.cadence)?.id || "weekly",
    notify: cfg?.notify !== false,
  };
}

function patchConfig(contextId, patch) {
  if (!contextId) return null;
  const next = { ...getResearchConfig(contextId), ...patch };
  // updateContext notifies contexts-store; notify() here so the research
  // surfaces (feed header, sidebar) repaint on the same tick.
  updateContext(contextId, { research: next });
  notify();
  return next;
}

export function setSourceEnabled(contextId, sourceId, on) {
  const current = getResearchConfig(contextId).enabledSourceIds;
  const next = on ? [...new Set([...current, sourceId])] : current.filter((id) => id !== sourceId);
  return patchConfig(contextId, { enabledSourceIds: next });
}

export function setCadence(contextId, cadenceId) {
  if (!findCadence(cadenceId)) return null;
  return patchConfig(contextId, { cadence: cadenceId });
}

export function setNotify(contextId, on) {
  return patchConfig(contextId, { notify: on === true });
}

// ── Scanning ──────────────────────────────────────────────────────────────

/**
 * Run a scan for one Playbook. Pulls from the held-back pool, skipping
 * anything from a disabled source, anything already in the feed, and anything
 * the user dismissed — so a repeat scan is idempotent.
 *
 * IMPORTANT: cadence is NOT a timer. daily/weekly/monthly would never fire
 * inside a demo session, so the cadence only drives copy and how much a scan
 * yields. Do not wire a setInterval off it.
 *
 * @returns {boolean} false when a scan is already in flight for this Playbook.
 */
export function runScan({ contextId, manual = false, onDone = null } = {}) {
  if (!contextId || scanning.has(contextId)) return false;
  ensureSeeded();

  const { enabledSourceIds, cadence } = getResearchConfig(contextId);
  const live = new Set(findings.map((f) => findingKey(f)));
  const candidates = pool.filter(
    (f) =>
      f.contextId === contextId &&
      enabledSourceIds.includes(f.sourceId) &&
      !live.has(findingKey(f)) &&
      !dismissedKeys.includes(findingKey(f)),
  );

  // A daily cadence delivers less per scan than a monthly one — the same pool,
  // paced. Manual scans always allow the full batch: the user asked.
  const cap = manual ? MAX_PER_SCAN : cadence === "daily" ? 1 : cadence === "monthly" ? MAX_PER_SCAN : 2;
  const batch = candidates.slice(0, cap);

  const timer = window.setTimeout(() => {
    scanning.delete(contextId);
    lastScanAt.set(contextId, "just now");
    for (const f of batch) {
      const idx = pool.indexOf(f);
      if (idx !== -1) pool.splice(idx, 1);
      f.status = "new";
      f.scannedAt = "just now";
      findings.unshift(f);
    }
    notify();
    onDone?.(batch.slice());
  }, SCAN_MS);

  scanning.set(contextId, timer);
  notify();
  return true;
}

/** Test/teardown helper — cancels any in-flight scan. */
export function cancelScans() {
  for (const timer of scanning.values()) window.clearTimeout(timer);
  scanning.clear();
}
