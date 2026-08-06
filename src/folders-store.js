// Draft folders store — global list of Agorapulse content folders that
// saved drafts can be filed into. Same seed-from-mocks + notifier pattern as
// contexts-store / connectors-store. New-alt user mode starts empty.
//
// Public API:
//   getFolders()              → Folder[]  (snapshot, newest first)
//   addFolder(name)           → Folder    (creates + notifies)
//   addDraftsToFolder(id, n)  → Folder|null  (bumps the draft count by n;
//                                             accepts a negative n for Undo)
//   subscribe(fn)             → unsubscribe

import { draftFolders as seed } from "./mocks.js?v=70";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";

const folders = isNewUser() ? [] : seed.map((f) => ({ ...f }));
const notifier = createNotifier("folders-store");

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getFolders());

function freshId() {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getFolders() {
  return folders.slice();
}

export function addFolder(name) {
  const next = { id: freshId(), name: (name || "").trim() || "Untitled folder", count: 0 };
  folders.unshift(next);
  notify();
  return next;
}

export function addDraftsToFolder(id, n = 1) {
  const f = folders.find((x) => x.id === id);
  if (!f) return null;
  f.count = Math.max(0, (f.count || 0) + n);
  notify();
  return f;
}
