// Per-session ideas state + the scripted "Add PDF / video / URL" flow
// behind the session composer's inline `+` menu. Sources are per-session
// in sources-stream; ideas are also per-session here.
//
// Public API:
//   getSources(sessionId) → Source[]   (delegates to sources-stream)
//   getIdeas(sessionId)    → Idea[]
//   subscribe(sessionId, fn) → unsubscribe   payload: { sources, ideas }
//   appendExtractedIdeas(sessionId, sources)  bulk "extract more" flow
//   removeIdeasForSources(sessionId, sourceIds)  cleanup after bulk-delete

import {
  ideas as seedIdeas,
  ideasBySession as seedIdeasBySession,
  recentSessions as seedRecentSessions,
} from "./mocks.js?v=67";
import { isNewUser } from "./user-mode.js?v=22";

// Demo session ids — the recentSessions seed (s-acme-launch / s-riverside /
// etc.). Only these sessions get the seeded ideas mock; brand-new
// conversations (created at runtime via "+ New conversation") start empty
// to match the user's mental model. Anything else looked-up — same path.
const DEMO_SESSION_IDS = new Set(seedRecentSessions.map((s) => s.id));
import { postAssistantMessage, postExtractionResult, startPending, finishPending } from "./assistant.js?v=68";
import {
  getSources as streamGetSources,
  subscribeSources,
  pushScriptedSource,
  completeScriptedSource,
} from "./sources-stream.js?v=61";

// --- Module state -------------------------------------------------------

const ideasMap = new Map(); // sessionId → Idea[]
const subscribers = new Map(); // sessionId → Set<fn>

// Per-session source-stream forwarding: when a session's sources change,
// re-emit to the library subscribers so consumers reading via library
// (e.g. Content tab) stay in sync.
const streamUnsubsBySession = new Map();

// ── The global pool ───────────────────────────────────────────────────────
//
// `seedIdeas` IS mocks.ideas — a flat union of every demo session's ideas that
// several surfaces read directly instead of going through this store (the
// right-panel Ideas mode, draft-flow's fallback resolver, assistant's reasoning
// copy).
//
// It used to be write-only from injectIdeasForSource and never pruned, so a
// global surface showed ghosts (deleted ideas) and missed real ones (anything
// from addSource / appendExtractedIdeas). Every write and every delete now goes
// through these two helpers, so the pool and the per-session lists agree.
//
// Not the same objects: the pool holds shallow copies, so a per-session edit
// doesn't silently mutate the global row and vice versa. Identity is the `id`.

function poolAdd(ideas) {
  if (!Array.isArray(ideas) || ideas.length === 0) return;
  const known = new Set(seedIdeas.map((i) => i.id));
  const fresh = ideas.filter((i) => !known.has(i.id)).map((i) => ({ ...i }));
  if (fresh.length) seedIdeas.unshift(...fresh);
}

function poolRemove(ideaIds) {
  if (!Array.isArray(ideaIds) || ideaIds.length === 0) return;
  const set = new Set(ideaIds);
  for (let i = seedIdeas.length - 1; i >= 0; i -= 1) {
    if (set.has(seedIdeas[i].id)) seedIdeas.splice(i, 1);
  }
}

let idCounter = 0;
function newId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// --- Public API ---------------------------------------------------------

export function getSources(sessionId) {
  return streamGetSources(sessionId);
}

export function getIdeas(sessionId) {
  if (!ideasMap.has(sessionId)) seed(sessionId);
  return ideasMap.get(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) {
    subscribers.set(sessionId, new Set());
    // First subscriber for this session — bind a per-session sources
    // listener that forwards to all library subscribers of this session.
    streamUnsubsBySession.set(
      sessionId,
      subscribeSources(sessionId, () => notify(sessionId)),
    );
  }
  subscribers.get(sessionId).add(fn);
  return () => {
    const set = subscribers.get(sessionId);
    if (set) {
      set.delete(fn);
      if (set.size === 0) {
        subscribers.delete(sessionId);
        const off = streamUnsubsBySession.get(sessionId);
        if (off) {
          off();
          streamUnsubsBySession.delete(sessionId);
        }
      }
    }
  };
}

// Drop all ideas + subscribers + stream forwarding for a session — used
// by the conversation-delete flow in the sidebar.
export function clearSession(sessionId) {
  ideasMap.delete(sessionId);
  const set = subscribers.get(sessionId);
  if (set) {
    for (const fn of set) {
      try {
        fn();
      } catch {}
    }
    subscribers.delete(sessionId);
  }
  const off = streamUnsubsBySession.get(sessionId);
  if (off) {
    off();
    streamUnsubsBySession.delete(sessionId);
  }
}

// Bulk "extract more ideas" — used by the source-list bulk action bar.
// For each source passed in, generates 1–2 fresh angle-flavored ideas using
// EXTRA_IDEA_TEMPLATES, prepends them to the per-session ideas store, and
// posts a single extraction turn into the assistant thread summarising the
// outcome. The narrative is "give me more angles from these files" — never
// destructive, always additive.
export function appendExtractedIdeas(sessionId, sources, onDone) {
  if (!Array.isArray(sources) || sources.length === 0) return;
  // Make sure ideas are seeded before we prepend to them.
  getIdeas(sessionId);

  // Run as a short background task so the composer status bar reads
  // "Extracting ideas…" (consistent with source analysis / drafting) rather
  // than completing in the same tick. onDone fires after the work lands so the
  // caller's confirmation toast doesn't contradict the in-progress bar.
  const pendingId = startPending(sessionId, "Extracting ideas");
  setTimeout(() => {
    const created = [];
    sources.forEach((source, idx) => {
      const template = EXTRA_IDEA_TEMPLATES[(idx + created.length) % EXTRA_IDEA_TEMPLATES.length];
      created.push({
        id: newId("idea"),
        title: template.title.replace("{filename}", source.filename),
        body: template.body.replace("{filename}", source.filename),
        rationale: template.rationale,
        relevance: template.relevance,
        relevanceColor: template.relevanceColor,
        confidence: template.confidence,
        channels: template.channels,
        state: "New",
        pinned: false,
        sourceIds: [source.id],
        sessionId,
        extractedAt: "just now",
      });
    });

    ideasMap.get(sessionId).unshift(...created);
    poolAdd(created);

    // Single extraction-turn summarising all of them. If only one source was
    // selected we use its filename; otherwise show "N sources".
    const filename =
      sources.length === 1 ? sources[0].filename : `${sources.length} source${sources.length === 1 ? "" : "s"}`;
    postExtractionResult(sessionId, { filename, ideas: created });

    finishPending(sessionId, pendingId);
    notify(sessionId);
    onDone?.(created);
  }, 1600);
}

// Silently inject a set of ideas associated with one source. Used by flows
// that want the ideas to land in the Ideas panel WITHOUT also posting an
// inline extraction turn in the assistant thread (e.g. the composer "Add
// video → Extract ideas" branch). Each idea may omit secondary fields;
// defaults are filled in to match the seed idea shape.
//
// We mutate BOTH the per-session ideasMap AND the shared mocks `seedIdeas`
// array. The right-panel + /ideas + /sources surfaces read directly from
// mocks (the prototype never wired them to the library store), so without
// the dual-write the injected ideas would only show up via library APIs
// and remain invisible in the Ideas panel.
export function injectIdeasForSource(sessionId, sourceId, ideas) {
  if (!Array.isArray(ideas) || ideas.length === 0) return [];
  getIdeas(sessionId);
  const created = ideas.map((i) => ({
    id: i.id || newId("idea"),
    title: i.title,
    body: i.body,
    kind: i.kind || "insight",
    tags: i.tags || [],
    used: i.used ?? 0,
    ref: i.ref || "",
    rationale: i.rationale || "",
    relevance: i.relevance || "Medium relevance",
    relevanceColor: i.relevanceColor || "tagOrange",
    confidence: i.confidence ?? 70,
    channels: i.channels || ["linkedin"],
    state: "New",
    pinned: false,
    sourceIds: [sourceId],
    sessionId,
    extractedAt: "just now",
  }));
  ideasMap.get(sessionId).unshift(...created);
  poolAdd(created);
  notify(sessionId);
  return created;
}

// "Analyze for ideas" branch of the video-intake choice — inject the canned
// video idea set against the given source. Reuses injectIdeasForSource so the
// ideas land in both the per-session store and the global seed list. Returns
// the created ideas so the caller can post the "Extracted N ideas" turn.
export function extractVideoIdeas(sessionId, sourceId) {
  return injectIdeasForSource(sessionId, sourceId, SCRIPTS.video.ideas);
}

// Bulk-delete ideas by id. Used by the "All ideas" view's bulk-action bar.
// Returns the number of ideas actually removed (no-op for unknown ids).
export function removeIdeas(sessionId, ideaIds) {
  if (!Array.isArray(ideaIds) || ideaIds.length === 0) return 0;
  const set = new Set(ideaIds);
  const ideas = ideasMap.get(sessionId);
  if (!ideas) return 0;
  const before = ideas.length;
  for (let i = ideas.length - 1; i >= 0; i -= 1) {
    if (set.has(ideas[i].id)) ideas.splice(i, 1);
  }
  const removed = before - ideas.length;
  // Prune the global pool too, or the idea lives on in every surface that
  // reads it — which is what made a global library impossible before.
  if (removed > 0) {
    poolRemove(ideaIds);
    notify(sessionId);
  }
  return removed;
}

// Drop every idea whose ONLY source was one of the deleted sources. Ideas
// that draw from multiple sources lose just the deleted reference and stay
// in the list — half their context is still around.
export function removeIdeasForSources(sessionId, sourceIds) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return 0;
  const set = new Set(sourceIds);
  const ideas = ideasMap.get(sessionId);
  if (!ideas) return 0;
  const before = ideas.length;
  const dropped = [];
  // Filter in place — same array reference so subscribers see the change.
  for (let i = ideas.length - 1; i >= 0; i -= 1) {
    const idea = ideas[i];
    const remaining = (idea.sourceIds || []).filter((sid) => !set.has(sid));
    if (remaining.length === 0) {
      dropped.push(idea.id);
      ideas.splice(i, 1);
    } else if (remaining.length !== (idea.sourceIds || []).length) {
      idea.sourceIds = remaining;
    }
  }
  poolRemove(dropped);
  const removed = before - ideas.length;
  notify(sessionId);
  return removed;
}

export function addSource(sessionId, kind) {
  const script = SCRIPTS[kind];
  if (!script) return;

  // Make sure ideas are seeded before we prepend to them.
  getIdeas(sessionId);

  // 1. Push the source through the global store in "Processing" state.
  const sourceId = pushScriptedSource({
    filename: script.filename,
    kind: script.kindLabel,
  });

  // Video defers all extraction to the post-upload "what to do?" choice —
  // the intake lifecycle posts it once the source flips Processed, and the
  // choice handler in session.js drives idea OR clip generation. Here we
  // just run the source through Processing → Processed (no inline ideas).
  if (script.kindLabel === "Video") {
    setTimeout(() => {
      completeScriptedSource(sourceId, {
        signal: script.signal,
        signalColor: script.signalColor,
        ideaCount: 0,
      });
    }, 6000);
    return;
  }

  // Right-aligned "Source intake" turn is now posted by the centralized
  // subscription in session.js (bindSession → subscribeInputs path),
  // which fires for every new attach and flips to ready when the source
  // hits Processed. The legacy call here would have double-posted.

  // 2b. Flip the composer into "thinking" mode for the duration of the
  // extraction — the composer status bar reads "Extracting ideas…".
  const pendingId = startPending(sessionId, "Extracting ideas");

  // 3. Simulate extraction — standardized 6s reasoning delay across the
  // prototype so every "Archie is thinking" moment feels predictable.
  const delay = 6000;
  setTimeout(() => {
    // Flip the source to Processed in the global store. notifySources()
    // inside completeScriptedSource fans out to every session subscriber.
    completeScriptedSource(sourceId, {
      signal: script.signal,
      signalColor: script.signalColor,
      ideaCount: script.ideas.length,
    });

    // Prepend the extracted ideas (per-session).
    const extracted = script.ideas.map((seed) => ({
      id: newId("idea"),
      title: seed.title,
      body: seed.body,
      rationale: seed.rationale,
      relevance: seed.relevance,
      relevanceColor: seed.relevanceColor,
      confidence: seed.confidence,
      channels: seed.channels || ["linkedin"],
      state: "New",
      pinned: false,
      sourceIds: [sourceId],
      sessionId,
      extractedAt: "just now",
    }));
    ideasMap.get(sessionId).unshift(...extracted);
    poolAdd(extracted);

    // Structured extraction turn — Drafting pill ("Extracted N ideas") +
    // "Analyzed <filename>" + one idea card per extracted idea.
    if (extracted.length > 0) {
      postExtractionResult(sessionId, {
        filename: script.filename,
        ideas: extracted,
      });
    } else {
      postAssistantMessage(sessionId, `Scanned ${script.filename} but didn't find a clear idea to pull.`);
    }

    finishPending(sessionId, pendingId);
    notify(sessionId);
  }, delay);
}

// --- Internals ----------------------------------------------------------

function seed(sessionId) {
  // Seed ideas only for: (a) returning-user mode AND (b) demo sessions
  // shipped in the recentSessions mock. New conversations created at
  // runtime start empty — the mock library would otherwise spill into
  // every fresh chat and confuse the user ("how can a new conversation
  // already have 7 ideas?").
  //
  // Pulls from the per-session bucket in mocks (`ideasBySession`) so each
  // demo session has its own distinct content — counters in the topbar,
  // status card and chat picker therefore vary realistically per session.
  const shouldSeed = !isNewUser() && DEMO_SESSION_IDS.has(sessionId);
  const seedForSession = shouldSeed ? seedIdeasBySession[sessionId] || [] : [];
  ideasMap.set(
    sessionId,
    seedForSession.map((i) => ({ ...i })),
  );
}

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  const payload = {
    sources: streamGetSources().slice(),
    ideas: (ideasMap.get(sessionId) || []).slice(),
  };
  set.forEach((fn) => fn(payload));
}

// --- Extra-extraction templates (bulk "extract more ideas") ------------
//
// One of these is picked per selected source by appendExtractedIdeas. The
// {filename} placeholder is replaced with the source's filename so each
// idea looks freshly mined. Order doesn't matter — they're rotated.

const EXTRA_IDEA_TEMPLATES = [
  {
    title: "The unspoken constraint hiding in {filename}",
    body: "A pattern Archie noticed on a second pass — what the doc keeps circling without naming directly.",
    rationale:
      "Re-reads tend to surface the structural constraint authors avoid stating. High-leverage angle for thoughtful audiences.",
    relevance: "High relevance",
    relevanceColor: "orange",
    confidence: 84,
    channels: ["linkedin"],
  },
  {
    title: "What surprised me about {filename}",
    body: "A first-person reaction post — the line in the source that didn't match the rest of its tone.",
    rationale: "Personal-reaction posts perform well when grounded in a specific moment. Reusable template.",
    relevance: "Medium relevance",
    relevanceColor: "tagOrange",
    confidence: 73,
    channels: ["linkedin", "x"],
  },
  {
    title: "A case-study angle from {filename}",
    body: "Reframes the source as one company's data point in a larger pattern.",
    rationale: "Case-study framing draws comments from operators who've lived a similar setup — strong reach signal.",
    relevance: "Medium relevance",
    relevanceColor: "tagOrange",
    confidence: 68,
    channels: ["linkedin"],
  },
  {
    title: "The contrarian read of {filename}",
    body: "A take that pushes back on the source's headline argument while staying grounded in its own evidence.",
    rationale: "Contrarian-but-fair posts attract debate without alienating the original author's audience.",
    relevance: "High relevance",
    relevanceColor: "orange",
    confidence: 81,
    channels: ["linkedin", "x"],
  },
];

// --- Per-kind mock scripts ---------------------------------------------

const SCRIPTS = {
  pdf: {
    kindLabel: "PDF",
    filename: "Q2-offsite-notes.pdf",
    size: "1.2mb",
    signal: "High signal",
    signalColor: "orange",
    ideas: [
      {
        title: "Three constraints that killed our first launch",
        kind: "story",
        body: "A candid retro framed around the three bottlenecks the team kept underestimating: scope, distribution, onboarding.",
        rationale:
          "Concrete and personal — operator retros are the kind of post readers save and reread. Strong pull on discussion.",
        relevance: "High relevance",
        relevanceColor: "orange",
        confidence: 92,
        channels: ["linkedin"],
      },
      {
        title: "Why we stopped writing quarterly OKRs",
        kind: "insight",
        body: "Contrarian take grounded in the offsite notes — frames OKRs as a lagging signal rather than a tool for focus.",
        rationale:
          "A contrarian frame on a rituals-heavy topic. High comment potential from teams with their own OKR scars.",
        relevance: "High relevance",
        relevanceColor: "orange",
        confidence: 88,
        channels: ["linkedin", "x"],
      },
    ],
  },
  video: {
    kindLabel: "Video",
    filename: "founder-keynote.mp4",
    size: "34mb",
    signal: "Medium signal",
    signalColor: "tagOrange",
    ideas: [
      {
        title: "What a founder keynote looks like at 50 people",
        kind: "story",
        body: "Behind-the-scenes recap of the keynote, including the bits that got cut.",
        rationale:
          "Behind-the-scenes posts earn trust fast — readers get a rare look at how the company actually operates.",
        relevance: "Medium relevance",
        relevanceColor: "tagOrange",
        confidence: 76,
        channels: ["linkedin", "instagram"],
      },
      {
        title: "The one founder story we won't tell (and why)",
        kind: "insight",
        body: "A meta-post about editorial restraint.",
        rationale:
          "Meta-post about judgement, not the story itself. Niche but memorable for founders in similar positions.",
        relevance: "Low relevance",
        relevanceColor: "grey",
        confidence: 54,
        channels: ["x"],
      },
    ],
  },
  url: {
    kindLabel: "URL",
    filename: "acme.com/launch",
    size: null,
    signal: "Medium signal",
    signalColor: "tagOrange",
    ideas: [
      {
        title: "How we pick which roadmap items we talk about publicly",
        body: "An editorial rule of thumb the team actually uses.",
        rationale:
          "Editorial restraint is under-used as an angle. Positions the team as thoughtful rather than hype-driven.",
        relevance: "Medium relevance",
        relevanceColor: "tagOrange",
        confidence: 71,
        channels: ["linkedin"],
      },
    ],
  },
};
