// Launches the in-chat interaction for a topic.
//
// "Start a chat" is the only forward action a topic offers (the other is
// Dismiss). Rather than invent a new downstream surface, it hands the topic to
// the chat as a SOURCE — the same move a repurposed top post makes — so every
// affordance the app already has (Extract ideas, Draft a post, Ask about it, the
// Sources panel) lights up on its own with no new plumbing.
//
// Two halves, because the entry point and the choreography live on opposite
// sides of a navigation:
//   • openTopicInChat(topicId)         — from a topic card or the topic dialog:
//     arm the handoff and navigate to a fresh chat, pre-bound to the topic's
//     Playbook and named after its headline (both via query params, which
//     session.js already reads when minting a `new-*` session).
//   • startTopicChat(sessionId, id)    — consumed at session mount: echo, attach,
//     and open on Archie's read of it.
//
// Version pins MUST match session.js's so the assistant / sources-stream /
// inline-question module instances are shared — each holds per-session state in
// a module-local Map, and a second copy at a different URL would hold its own.

import { navigate } from "./router.js?v=30";
import { setHandoff } from "./handoff.js?v=20";
import { postAssistantMessage, sendMessage } from "./assistant.js?v=69";
import { addReadySource } from "./sources-stream.js?v=62";
import * as inlineQuestion from "./inline-question.js?v=48";
import { getTopicById, markSeen } from "./topics-store.js?v=5";
import { findTopicSource } from "./topics-catalog.js?v=2";

export const TOPIC_CHAT_HANDOFF = "pendingTopicChat";

/**
 * From /topics (a card or the dialog) — spawn a chat that opens on this topic.
 * @param {string} topicId
 * @returns {boolean} false when the topic is unknown, so the caller can bail
 *   without navigating.
 */
export function openTopicInChat(topicId) {
  const topic = getTopicById(topicId);
  if (!topic) return false;
  setHandoff(TOPIC_CHAT_HANDOFF, { topicId });
  // The Playbook and the chat name ride in the URL rather than in the handoff:
  // session.js already resolves `?contextId=` and `?title=` when it mints a
  // `new-*` session, so the chat is correctly bound on its very first paint
  // instead of being renamed a frame later.
  const params = new URLSearchParams();
  if (topic.contextId) params.set("contextId", topic.contextId);
  params.set("title", topic.headline);
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Consumed at session mount. Echoes the topic, attaches it as a ready source,
 * and opens the conversation on it.
 */
export function startTopicChat(sessionId, topicId) {
  const topic = getTopicById(topicId);
  if (!topic) return;
  const source = findTopicSource(topic.sourceId);
  // Arriving via the chat counts as reading it.
  markSeen(topicId);

  // Attach it as an already-processed source. Deduped on the topic id inside
  // addReadySource, so re-entering the same chat twice can't double it up.
  //
  // This is also what puts the topic in the thread as a CARD rather than as a
  // sentence: intake-lifecycle posts a source-intake turn for any source landing
  // after mount, so the pick is visible the way a chosen source, idea or clip is.
  // A postSelectionEcho on top of it stacked the same headline twice.
  addReadySource(sessionId, {
    id: topic.id,
    filename: topic.headline,
    kind: "Topic",
    preview: topic.summary,
    iconClass: source?.icon || "ap-icon-antenna",
  });

  const postCount = (topic.posts || []).length;
  const evidence = postCount === 1 ? "1 post" : `${postCount} posts`;
  postAssistantMessage(
    sessionId,
    `I read ${evidence} for this one${source ? ` from your ${source.name.toLowerCase()}` : ""}. ` +
      `The short version: ${topic.summary}`,
  );

  // The picker offers questions the user could have typed anyway — a prompt
  // shortcut, not a new action surface. Skip drops straight into the composer
  // with the topic already attached.
  inlineQuestion.ask(sessionId, {
    title: "Where do you want to take this?",
    stepLabel: "Topic",
    items: [
      { value: "What should we post about this?", label: "What should we post?", icon: "ap-icon-archie-official" },
      { value: "Give me three angles from this.", label: "Give me three angles", icon: "ap-icon-numbered-list" },
      { value: "Where do we have an advantage here?", label: "Find our advantage", icon: "ap-icon-bolden" },
    ],
    customPlaceholder: "Ask me something about it…",
    onPick: (text) => sendMessage(sessionId, text),
    onCustom: (text) => sendMessage(sessionId, text),
    onSkip: () => {},
  });
}
