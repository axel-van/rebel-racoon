// schedule-store — live "upcoming queue" of scheduled posts.
//
// Seeds from mocks.scheduledQueue and accepts new entries when the user
// confirms the Schedule modal. Stands in for the publishing API that
// would own this data in production. The schedule modal reads from here
// to paint calendar dots + the per-day "already scheduled" list so the
// view always reflects both the seed and posts the user just scheduled
// in this session.
//
// Public API (mirrors the other stores in src/):
//   • getQueue()                — sorted by `when` ascending
//   • getQueueOn(date)          — entries that fall on the given local day
//   • subscribe(fn)             — shallow notify on every mutation
//   • addToQueue(entries)       — push one or many {id, network, text, when}
//   • removeFromQueue(id)       — drop a single entry (unschedule)
//   • busyCountsByDay(start,end)— Map<dateKey, count> for calendar dots

import { scheduledQueue as SEED } from "./mocks.js?v=87";
import { createNotifier } from "./store-utils.js?v=2";

let queue = SEED.slice();
const notifier = createNotifier("schedule-store");

export const subscribe = notifier.subscribe;

function notify() {
  notifier.notify(queue);
}

export function getQueue() {
  return queue.slice().sort((a, b) => a.when - b.when);
}

// Key used to bucket a timestamp into its local-time day. Stable string
// so it can be a Map key and compared directly.
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getQueueOn(dateOrTs) {
  const key = dayKey(typeof dateOrTs === "number" ? dateOrTs : dateOrTs.getTime());
  return getQueue().filter((entry) => dayKey(entry.when) === key);
}

export function busyCountsByDay() {
  const counts = new Map();
  for (const entry of queue) {
    const key = dayKey(entry.when);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function addToQueue(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  queue = queue.concat(entries.filter(Boolean));
  notify();
}

export function removeFromQueue(id) {
  const before = queue.length;
  queue = queue.filter((e) => e.id !== id);
  if (queue.length !== before) notify();
}
