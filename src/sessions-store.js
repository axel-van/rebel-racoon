// Sessions store — single source of truth for the conversation list.
//
// Mirrors the contexts-store.js pattern. Before this store, recentSessions
// was a static array imported from mocks.js by 4+ modules; the sidebar
// mutated `pinned` in place but every other surface kept its own stale
// snapshot. Wrapping it here gives the sidebar / topbar / session header
// a single subscribe hook so rename + delete propagate everywhere.
//
// Public API:
//   getSessions()                → Session[]   (snapshot, ordered as in store)
//   getSessionById(id)           → Session | null
//   updateSession(id, patch)     → Session | null   (shallow merge)
//   deleteSession(id)            → boolean
//   togglePin(id)                → Session | null   (flips `pinned`)
//   subscribe(fn)                → unsubscribe

import { recentSessions as seed, sharedSessions } from "./mocks.js?v=1199";
import { isFlagOn } from "./feature-flags.js?v=1199";
import { isNewUser } from "./user-mode.js?v=1199";
import { createNotifier } from "./store-utils.js?v=1199";

// First-time user starts with an empty session list (matches every other
// store's first-run mode); returning users get the seeded conversations.
// The chat that lost its Playbook rides in only under `playbookSharing` — same
// reason as sharedContexts in contexts-store: with sharing off it has no story.
const allSeeds = isFlagOn("playbookSharing") ? [...seed, ...sharedSessions] : seed;
const sessions = isNewUser() ? [] : allSeeds.map((s) => ({ ...s }));
const notifier = createNotifier("sessions-store");

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getSessions());

export function getSessions() {
  return sessions.slice();
}

export function getSessionById(id) {
  return sessions.find((s) => s.id === id) || null;
}

export function updateSession(id, patch) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, patch);
  notify();
  return s;
}

export function deleteSession(id) {
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  sessions.splice(idx, 1);
  notify();
  return true;
}

export function togglePin(id) {
  const s = sessions.find((x) => x.id === id);
  if (!s) return null;
  s.pinned = !s.pinned;
  notify();
  return s;
}
