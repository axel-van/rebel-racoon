// Launches the in-chat interaction for a Content Ideas topic.
//
// "Use in chat" is the forward action on a topic, and it now means the same thing
// from every surface that offers it: the topic opens a chat of its own with itself
// attached as a SOURCE. Rather than invent a downstream surface, it reuses the one
// the app already has — so Extract ideas, Draft a post, Ask about it and the
// Sources panel all light up with no new plumbing.
//
// Two halves, because the entry point and the arrival sit on opposite sides of a
// navigation. This is the same shape topic-flow.js uses for /topics, and it exists
// as its own module for the reason topic-flow does: FOUR surfaces now start this
// flow — the feed's card footer, the attention page's card, the new-session
// starter card, and the composer's Pick-a-topic modal — and three of them cannot
// import from screens/session.js.
//
//   • openBriefInChat(briefId)          — arm the handoff and navigate to a fresh
//     chat, pre-bound to the topic's Playbook and named after its headline (both
//     via query params, which session.js already reads when minting a `new-*`
//     session).
//   • attachBriefToChat(sessionId, id)  — consumed at session mount: attach.
//
// Unlike /topics there is no echo message and no question picker. The
// source-intake card already names the topic and the composer is right there; a
// sentence repeating the headline was the same fact twice.
//
// Version pins MUST match screens/session.js's for sources-stream and
// briefs-store — each keeps per-session state in a module-local Map, and a second
// copy at a different URL would keep its own. scripts/bump-cache.py --audit
// enforces it.

import { navigate } from "./router.js?v=30";
import { setHandoff } from "./handoff.js?v=20";
import { addReadySource } from "./sources-stream.js?v=76";
import { getBriefById } from "./briefs-store.js?v=33";
import { getLaneById } from "./research-store.js?v=27";
import { findResearchSource } from "./research-catalog.js?v=14";

export const BRIEF_CHAT_HANDOFF = "pendingBriefChat";

/**
 * From a topic card, the attention page, the starter card or the picker — spawn a
 * chat that opens on this topic.
 * @param {string} briefId
 * @returns {boolean} false when the topic is unknown, so the caller can bail
 *   without navigating.
 */
export function openBriefInChat(briefId) {
  const brief = getBriefById(briefId);
  if (!brief) return false;
  setHandoff(BRIEF_CHAT_HANDOFF, { briefId: brief.id });
  // The Playbook and the chat name ride in the URL rather than in the handoff:
  // session.js already resolves `?contextId=` and `?title=` when it mints a
  // `new-*` session, so the chat is bound and named on its very first paint
  // instead of being renamed a frame later.
  const lane = getLaneById(brief.laneId);
  const params = new URLSearchParams();
  if (lane?.playbookId) params.set("contextId", lane.playbookId);
  params.set("title", brief.headline);
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Consumed at session mount. Attaches the topic as an already-processed source;
 * intake-lifecycle turns that into the source-intake card in the thread.
 */
export function attachBriefToChat(sessionId, briefId) {
  const brief = getBriefById(briefId);
  if (!brief) return;
  const src = findResearchSource(brief.sourceId);
  addReadySource(sessionId, {
    id: brief.id,
    filename: brief.headline,
    kind: "Topic",
    preview: brief.summary,
    iconClass: src?.icon || "ap-icon-folder",
  });
}
