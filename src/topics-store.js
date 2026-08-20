// Topics store — the dossiers Agorapulse listening produced, account-wide.
//
// GLOBAL, like connectors-store, not per-session: a topic belongs to a Playbook
// and arrives on a cadence, long before any chat exists to hold it. The /topics
// feed spans every Playbook (each card carries a Playbook chip), and the sidebar
// counter deliberately sums the whole account — the notification is account
// level even though the config that produced it is per Playbook.
//
// Public API:
//   getTopics()          → Topic[]   (visible = not dismissed, newest first)
//   getTopicById(id)     → Topic | null
//   getUnseenCount()     → number    (drives the sidebar nav counter)
//   markSeen(id)         mutates + notifies
//   dismissTopic(id)     mutates + notifies  — hidden, not deleted
//   restoreTopic(id)     mutates + notifies  — the dismissal toast's Undo
//   refreshTopics()      → Topic[]   (the mock scan; drains the seeded pool)
//   subscribe(fn)        → unsubscribe
//
// A topic shape (see mocks.topics):
//   { id, contextId, sourceId,
//     headline,       — the claim, used as the card title and the dialog title
//     analysisTitle,  — the heading over the written analysis
//     summary,        — one clamped paragraph on the card
//     analysis: [ … ],— the prose paragraphs
//     posts: [ … ],   — the source posts behind it (renderSocialPostCard)
//     ageDays, unseen, dismissed }
//
// `ageDays` — not a real timestamp — is the single source of truth for age: the
// feed groups on it AND every "3 days ago" label is derived from it via
// topicWhen(). A prototype has no clock worth trusting, and mock dates that drift
// as the file ages read worse than a stable "3 days ago".

import { topics as seed, topicScanPool as scanSeed } from "./mocks.js?v=95";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=3";

// First-time user mode starts empty so /topics renders its empty state and the
// sidebar counter stays absent. Returning user keeps the mock seed. Same guard
// as contexts-store / library.
const topics = isNewUser() ? [] : seed.map(cloneTopic);
// What "Refresh now" has left to find. Drained, so a demo can hit the button
// repeatedly without the same dossier arriving twice.
const scanPool = isNewUser() ? [] : scanSeed.map(cloneTopic);

const notifier = createNotifier("topics-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getTopics());

// The "when" label, derived from ageDays rather than stored. It has to be
// derived: refreshTopics ages every topic by a day, so an authored string would
// still read "yesterday" on a card the feed had already moved into last week.
// One source of truth means the label and the date group can never disagree.
export function topicWhen(ageDays) {
  const d = Math.max(0, Math.round(Number(ageDays) || 0));
  if (d === 0) return "just now";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const weeks = Math.round(d / 7);
  if (d < 31) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.round(d / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

// Posts carry a nested author object, so a shallow copy isn't enough — the
// store must not hand out references into the mocks module.
function cloneTopic(t) {
  return {
    ...t,
    analysis: Array.isArray(t.analysis) ? t.analysis.slice() : [],
    posts: Array.isArray(t.posts) ? t.posts.map((p) => ({ ...p, author: { ...(p.author || {}) } })) : [],
    unseen: !!t.unseen,
    dismissed: !!t.dismissed,
  };
}

// Newest first. `ageDays` ascending IS newest first; ties keep seed order so
// the feed is stable across repaints.
function byRecency(a, b) {
  return (a.ageDays ?? 0) - (b.ageDays ?? 0);
}

/** Every topic still in the feed, newest first. Dismissed ones are excluded. */
export function getTopics() {
  return topics.filter((t) => !t.dismissed).sort(byRecency);
}

export function getTopicById(id) {
  return topics.find((t) => t.id === id) || null;
}

/** Unseen and not dismissed — what the sidebar badge counts. */
export function getUnseenCount() {
  return topics.filter((t) => t.unseen && !t.dismissed).length;
}

/** How many visible topics a given source produced — the filter chip counts. */
export function countBySource(sourceId) {
  return topics.filter((t) => !t.dismissed && t.sourceId === sourceId).length;
}

/** Reading a topic clears its unseen badge. No-op if it was already read. */
export function markSeen(id) {
  const t = topics.find((x) => x.id === id);
  if (!t || !t.unseen) return null;
  t.unseen = false;
  notify();
  return t;
}

// Hidden, never deleted — the dismissal toast offers Undo, and a deleted topic
// couldn't come back.
export function dismissTopic(id) {
  const t = topics.find((x) => x.id === id);
  if (!t || t.dismissed) return null;
  t.dismissed = true;
  t.unseen = false;
  notify();
  return t;
}

export function restoreTopic(id) {
  const t = topics.find((x) => x.id === id);
  if (!t || !t.dismissed) return null;
  t.dismissed = false;
  notify();
  return t;
}

/** Anything left for "Refresh now" to find. Drives the button's disabled state. */
export function hasMoreToScan() {
  return scanPool.length > 0;
}

// The mock scan. Cadence is copy, not a timer, so the recurring feel comes from
// this: the user presses "Refresh now", the page shows a scanning state, and a
// batch lands as unseen. Ages every existing topic by a day so the new arrivals
// really are the newest and the date groups shift the way they would in life.
export function refreshTopics() {
  const batch = scanPool.splice(0, 2).map((t) => ({ ...t, unseen: true, ageDays: 0 }));
  if (!batch.length) {
    notify();
    return [];
  }
  for (const t of topics) t.ageDays = (t.ageDays ?? 0) + 1;
  topics.unshift(...batch);
  notify();
  return batch.map((t) => ({ ...t }));
}
