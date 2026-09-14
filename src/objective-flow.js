// Launches the in-chat interaction for an OBJECTIVE — the loop's exit (PP
// "Objectives in Archie", key flow 4: steered → acted).
//
// The Insights detail ends on one Next move; its CTA opens a chat pre-loaded
// with the objective, and Archie's first turn carries the diagnosis and the
// angles that answer the weak measure. Same two-half shape as topic-flow.js,
// and for the same reason — the entry point and the choreography live on
// opposite sides of a navigation:
//   • openObjectiveInChat(entry)      — from either detail host: arm the
//     handoff and navigate to a fresh chat, pre-bound to the objective's
//     Playbook and named after it (query params session.js already reads).
//   • startObjectiveChat(sessionId, payload) — consumed at session mount:
//     Archie opens on the diagnosis, then the question picker.
//
// The recommendation itself is resolved by nextMoveFor(): authored in
// mocks.objectiveNextMoves (deterministic, evidence-citing), with a generic
// derivation by objective state as the fallback — so an un-authored objective
// still gets a door, never a dead end.
//
// Version pins MUST match session.js's so the assistant / inline-question
// module instances are shared — each holds per-session state in a module-local
// Map, and a second copy at a different URL would hold its own.

import { navigate } from "./router.js?v=1178";
import { setHandoff } from "./handoff.js?v=1178";
import { postAssistantMessage, sendMessage } from "./assistant.js?v=1178";
import * as inlineQuestion from "./inline-question.js?v=1178";
import { objectiveNextMoves } from "./mocks.js?v=1178";

export const OBJECTIVE_CHAT_HANDOFF = "pendingObjectiveChat";

// The measure the generic fallback talks about — the weakest one, by the same
// reading the Insights model uses (worst progress wins), duplicated in three
// lines rather than importing a screens/ module from a root flow.
function weakMeasureLabel(entry) {
  const measures = entry.resolved?.status === "parked" ? [entry.resolved.proxy] : entry.resolved?.measures || [];
  const weak = [...measures].sort((a, b) => (a.progressPct ?? 100) - (b.progressPct ?? 100))[0];
  return weak?.metricLabel || "the weak measure";
}

/** The recommendation an objective's detail ends on. Authored, or derived. */
// The pitch names the ACTION only. It used to open by restating the verdict —
// "Reach is the measure deciding this verdict" directly under a headline reading
// "Reach is at 52% of target" — which was the same sentence twice, 40px apart.
// The move band now sits after the proof, so the reader arrives having seen it.
export function nextMoveFor(entry) {
  const authored = objectiveNextMoves[entry.key];
  if (authored) return authored;
  const metric = weakMeasureLabel(entry);
  if (entry.collecting) {
    return {
      pitch: `Let's publish what feeds ${metric.toLowerCase()}, before the first verdict lands.`,
      cta: "Brief me in a chat",
      opening: `"${entry.label}" is still in its collecting window — no verdict yet, which makes this the cheapest moment to act. Let's publish what feeds ${metric.toLowerCase()} so the first verdict lands with data behind it.`,
    };
  }
  if (entry.verdict?.tier === "on-track") {
    return {
      pitch: `Let's name what carries ${metric.toLowerCase()} and make more of it.`,
      cta: "Double down in a chat",
      opening: `"${entry.label}" is on track. The useful question now is WHAT carries it — let's name what's working on ${metric.toLowerCase()} and make more of exactly that.`,
    };
  }
  return {
    pitch: `Let's draft the posts that move ${metric.toLowerCase()}.`,
    cta: "Fix this in a chat",
    opening: `We're here about "${entry.label}" — ${metric.toLowerCase()} is the measure deciding the verdict right now. Let's look at what you've published against it and draft what moves it.`,
  };
}

const DEFAULT_ANGLES = [
  { value: "What should we publish to move this measure?", label: "What should we publish?" },
  { value: "What in my recent posts worked against this objective?", label: "What worked so far?" },
  { value: "Draft two posts aimed at this objective.", label: "Draft 2 posts for it" },
];

// The angles a REPURPOSE opens on: the post already worked, so the question is
// how to get more of it — not what is wrong.
const POST_ANGLES = [
  { value: "Draft two more posts like this one.", label: "Draft 2 more like it" },
  { value: "What made this post work?", label: "Why did it work?" },
  { value: "Adapt this post for my other networks.", label: "Adapt it elsewhere" },
];

/**
 * From a detail host (the List panel or the board's modal) — spawn a chat that
 * opens on this objective.
 * @param {object} entry — a objectiveEntries() entry (key, ctxId, label, …).
 */
export function openObjectiveInChat(entry) {
  if (!entry?.ctxId) return false;
  setHandoff(OBJECTIVE_CHAT_HANDOFF, { key: entry.key, ctxId: entry.ctxId, label: entry.label });
  // Playbook + chat name ride in the URL: session.js resolves `?contextId=` and
  // `?title=` when it mints a `new-*` session, so the chat is bound on its very
  // first paint instead of being renamed a frame later (topic-flow's rule).
  const params = new URLSearchParams();
  params.set("contextId", entry.ctxId);
  params.set("title", entry.label);
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Repurpose one of the posts Archie drafted for an objective — the loop's other
 * end. Insights lists the posts that MOVED an objective; this is how one of them
 * becomes the next one, without leaving for the winners board (where it does not
 * live: these are the objective's own evidence rows, not top-posts-store).
 * Rides the same handoff, so there is one door into an objective's chat.
 * @param {object} entry — the objective the post is filed under
 * @param {object} post — a linked post from the Insights model
 */
export function repurposePostInChat(entry, post) {
  if (!entry?.ctxId || !post) return false;
  setHandoff(OBJECTIVE_CHAT_HANDOFF, {
    key: entry.key,
    ctxId: entry.ctxId,
    label: entry.label,
    post: {
      excerpt: post.excerpt,
      network: post.networkLabel || post.network,
      date: post.date,
      contribution: post.contribution?.label || "",
    },
  });
  const params = new URLSearchParams();
  params.set("contextId", entry.ctxId);
  params.set("title", entry.label);
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Consumed at session mount: Archie opens on the diagnosis, then offers the
 * angles as a question picker — prompt shortcuts, not a new action surface.
 */
export function startObjectiveChat(sessionId, payload) {
  // A repurpose opens on the POST, not on the verdict: the reader clicked a
  // thing that worked, so Archie quotes it back with what it did and asks how
  // to get more of it.
  if (payload.post) {
    const p = payload.post;
    postAssistantMessage(
      sessionId,
      `“${p.excerpt}” — your ${p.network} post from ${p.date}${p.contribution ? `, ${p.contribution}` : ""} on "${payload.label}". It worked; let's get more of it.`,
    );
    inlineQuestion.ask(sessionId, {
      title: "How do we build on it?",
      stepLabel: "Repurpose",
      items: POST_ANGLES.map((a) => ({ value: a.value, label: a.label, icon: "ap-icon-sparkles" })),
      customPlaceholder: "Tell me how you'd like to reuse it…",
      onPick: (text) => sendMessage(sessionId, text),
      onCustom: (text) => sendMessage(sessionId, text),
      onSkip: () => {},
    });
    return;
  }
  const move = objectiveNextMoves[payload.key] || null;
  const opening =
    move?.opening ||
    `We're here about "${payload.label}". Let's look at what you've published against it and draft what moves it.`;
  postAssistantMessage(sessionId, opening);

  inlineQuestion.ask(sessionId, {
    title: "Where do we start?",
    stepLabel: "Objective",
    items: (move?.angles || DEFAULT_ANGLES).map((a) => ({
      value: a.value,
      label: a.label,
      icon: "ap-icon-target",
    })),
    customPlaceholder: "Ask me anything about this objective…",
    onPick: (text) => sendMessage(sessionId, text),
    onCustom: (text) => sendMessage(sessionId, text),
    onSkip: () => {},
  });
}
