// Global Top-Performing-Posts store.
//
// Unlike the per-session content stores (library.js, posts-store.js), a user's
// published-post history is account-level — the same winners surface in any
// chat — so this is a single global list, mirroring sources-stream's "global"
// role. Read-only for the prototype: the milker flow consumes these posts but
// never mutates them.
//
// Public API:
//   getTopPosts()      → TopPost[]  (seeds from mocks on first read)
//   getTopPost(id)     → TopPost | null
//
// Empty in new-alt mode — a brand-new user has no published history yet, so the
// "Use top performing posts" flow shows an empty-state message instead.

import { topPosts as seed } from "./mocks.js?v=93";
import { isNewUser } from "./user-mode.js?v=22";

let posts = null;

function ensureSeeded() {
  if (posts === null) posts = isNewUser() ? [] : seed.slice();
  return posts;
}

export function getTopPosts() {
  return ensureSeeded();
}

export function getTopPost(id) {
  return ensureSeeded().find((p) => p.id === id) || null;
}
