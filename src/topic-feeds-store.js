// Topic feeds — one per Playbook: which sources it listens to, and how often.
//
// GLOBAL, like connectors-store: a feed pairs a Playbook with a set of sources
// and runs on a cadence, long before any chat exists to hold what it finds.
//
// ── Why this is a store and not a field on the Playbook ────────────────────
// The Topics magazine this replaces kept the same config on the Context, as
// `ctx.topics`. It came off for the reason CONCEPTS.md §1 gives: a Playbook is
// an identity sheet — every field answers "who are you?" — and which feeds are
// live and how often they run answers "what job should Archie run?". That is
// operational, and the settings PAGE it is edited on was already a route scoped
// to one feature rather than a section of the fiche. Moving the data to match
// the surface costs nothing and stops the fiche growing a config block.
//
// It also buys `websites`, which has nowhere to live on a Context: the
// Playbook's own `websiteUrl` is the brand's canonical address, while this is
// the scan list for one feed, which may add a blog, a docs site or a regional
// domain the brand record has no business holding.
//
// Public API:
//   getFeeds()               → Feed[]  (creation order — nothing reshuffles)
//   getFeedById(id)          → Feed | null
//   getFeedForPlaybook(id)   → Feed | null   (there is exactly one)
//   updateFeed(id, patch)    → Feed | null
//   subscribe(fn)            → unsubscribe
//
// Feed shape (see mocks.topicFeeds):
//   { id, name, playbookId,
//     sources: string[],   — enabled source ids, from topics-catalog
//     cadence,             — a CADENCES id; copy, never a timer
//     websites: string[] } — the sites the Brand-website source scans

import { topicFeeds as seed } from "./mocks.js?v=1181";
import { getContexts } from "./contexts-store.js?v=1181";
import { isNewUser } from "./user-mode.js?v=1181";
import { createNotifier } from "./store-utils.js?v=1181";
import { DEFAULT_ENABLED_IDS, DEFAULT_CADENCE, findCadence, findTopicSource } from "./topics-catalog.js?v=1181";

// First-time user mode starts with no seeded feed, so /topics renders its
// nothing-found-yet state. Returning user keeps the seed. Same guard as
// contexts-store and library. Note that provisionMissingFeeds() below still runs
// in `new-alt` — a Playbook created at 10am must have a feed at noon.
const feeds = isNewUser() ? [] : seed.map(normalizeFeed);

const notifier = createNotifier("topic-feeds-store");
export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getFeeds());

// Everything that enters the store goes through this — the seed included, which
// would otherwise bypass it and let a typo'd cadence or an unknown source id
// reach the view. contexts-store learned this the hard way with normalizeTopics,
// which the seed originally skipped.
function normalizeFeed(raw = {}) {
  const sources = Array.isArray(raw.sources) ? raw.sources.filter((id) => !!findTopicSource(id)) : [];
  return {
    id: raw.id || "",
    name: (raw.name || "").trim(),
    playbookId: raw.playbookId || "",
    // Fall back to the catalogue default rather than an empty feed: a feed with
    // no sources can never return a Topic, which looks like a bug not a choice.
    sources: sources.length ? Array.from(new Set(sources)) : DEFAULT_ENABLED_IDS.slice(),
    cadence: findCadence(raw.cadence) ? raw.cadence : DEFAULT_CADENCE,
    websites: dedupeUrls(Array.isArray(raw.websites) ? raw.websites : []),
  };
}

// Trimmed, blanks dropped, de-duplicated case-insensitively. A blank row is how
// a freshly-added field starts, so it must never survive a save.
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

// Both arrays cloned on the way out. Handing back the live arrays let a view's
// splice mutate the store behind its back.
function copyFeed(f) {
  return { ...f, sources: f.sources.slice(), websites: f.websites.slice() };
}

// ── EVERY Playbook has a feed, and it listens from day one ─────────────────
// A brand new to the app must never land on a screen asking it to configure
// something before anything can happen. Competitors is the source every brand
// already has an answer for — the Playbook lists them — so it is the one that
// ships on.
//
// Provisioned lazily on read rather than at module load: in `new-alt` mode the
// stores start empty and the Playbooks arrive later, so a one-shot pass at boot
// would provision nothing. The guard is the Playbook id, so this runs once per
// brand — which is also why nothing here can DELETE a feed: the next read would
// build it straight back.
function provisionMissingFeeds() {
  for (const ctx of getContexts()) {
    if (feeds.some((f) => f.playbookId === ctx.id)) continue;
    feeds.push(
      normalizeFeed({
        id: `feed-auto-${ctx.id}`,
        name: `${ctx.name} · listening`,
        playbookId: ctx.id,
        sources: ["competitor-posts"],
        websites: ctx.websiteUrl ? [ctx.websiteUrl] : [],
      }),
    );
  }
}

/** Every feed, in creation order so nothing reshuffles on repaint. */
function getFeeds() {
  provisionMissingFeeds();
  return feeds.map(copyFeed);
}

export function getFeedById(id) {
  provisionMissingFeeds();
  const f = feeds.find((x) => x.id === id);
  return f ? copyFeed(f) : null;
}

/**
 * The one feed a Playbook has. Singular by design: a feed is IMPLICIT in its
 * Playbook, so there is nothing to list and nothing to create. What a reader
 * changes is which sources it listens to.
 */
export function getFeedForPlaybook(playbookId) {
  if (!playbookId) return null;
  provisionMissingFeeds();
  const f = feeds.find((x) => x.playbookId === playbookId);
  return f ? copyFeed(f) : null;
}

export function updateFeed(id, patch = {}) {
  const i = feeds.findIndex((x) => x.id === id);
  if (i < 0) return null;
  // Re-normalise the MERGED result, not the patch: a patch carrying only
  // `cadence` still has to be validated against the catalogue.
  feeds[i] = normalizeFeed({ ...feeds[i], ...patch, id });
  notify();
  return copyFeed(feeds[i]);
}
