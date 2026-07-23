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
//   addSession(session)          → Session     (used by future "new chat" flows)
//   subscribe(fn)                → unsubscribe

import { recentSessions as seed } from "./mocks.js?v=56";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";

// First-time user starts with an empty session list (matches every other
// store's first-run mode); returning users get the seeded conversations.
const sessions = isNewUser() ? [] : seed.map((s) => ({ ...s }));
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

// Reserved for a future "new chat from sidebar" flow — the entry path
// today is the dashboard redirect into /session/new. Kept un-exported
// until a consumer needs it. Counts (sources / ideas / drafts) derive
// from the per-session stores, not from fields on the session record.
function addSession(session) {
  const next = {
    id: session.id || `s-${Date.now().toString(36)}`,
    name: session.name || "New conversation",
    lastActivity: session.lastActivity || "just now",
    contextId: session.contextId || null,
    pinned: session.pinned === true,
    ...session,
  };
  sessions.unshift(next);
  notify();
  return next;
}
