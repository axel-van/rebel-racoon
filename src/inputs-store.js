// Per-session source attachments. Sources themselves are global (live in
// sources-stream.js); a session owns its own list of attached source ids
// that drives the Inputs strip above the composer. Multiple sessions can
// share the same source — detaching removes the link, not the source.
//
// Mock seed: each session's `attachedSourceIds` from mocks.js is loaded on
// first read. Per-session state is held in a Map<sessionId, Set<sourceId>>
// with subscribers notified on every mutation.

import { recentSessions } from "./mocks.js?v=26";
import { isNewUser } from "./user-mode.js?v=20";

const attachmentsBySessionId = new Map();
const subsBySessionId = new Map();

function ensureSession(sessionId) {
  if (!attachmentsBySessionId.has(sessionId)) {
    // New-user mode: every session starts with zero attachments so the
    // empty-state surface ("Attach a file or pick from library") gets a
    // chance to shine. Returning user: seed from mocks.
    if (isNewUser()) {
      attachmentsBySessionId.set(sessionId, new Set());
    } else {
      const seed = recentSessions.find((s) => s.id === sessionId);
      attachmentsBySessionId.set(sessionId, new Set(seed?.attachedSourceIds || []));
    }
  }
  return attachmentsBySessionId.get(sessionId);
}

function notify(sessionId) {
  const subs = subsBySessionId.get(sessionId);
  if (!subs) return;
  for (const fn of subs) fn();
}

export function getAttachedSourceIds(sessionId) {
  return Array.from(ensureSession(sessionId));
}

export function isAttached(sessionId, sourceId) {
  return ensureSession(sessionId).has(sourceId);
}

export function attachSource(sessionId, sourceId) {
  if (!sourceId) return;
  const set = ensureSession(sessionId);
  if (set.has(sourceId)) return;
  set.add(sourceId);
  notify(sessionId);
}

export function attachMany(sessionId, sourceIds) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return;
  const set = ensureSession(sessionId);
  let changed = false;
  for (const id of sourceIds) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) notify(sessionId);
}

export function detachSource(sessionId, sourceId) {
  const set = ensureSession(sessionId);
  if (!set.has(sourceId)) return;
  set.delete(sourceId);
  notify(sessionId);
}

export function subscribe(sessionId, fn) {
  let subs = subsBySessionId.get(sessionId);
  if (!subs) {
    subs = new Set();
    subsBySessionId.set(sessionId, subs);
  }
  subs.add(fn);
  return () => subs.delete(fn);
}
