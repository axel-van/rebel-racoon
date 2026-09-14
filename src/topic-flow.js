// Topic → chat. The one forward action a Topic has, from the four surfaces that
// offer it: the feed card's menu, the article beside the feed, the in-chat fresh
// list, and the composer's Add menu.
//
// It hands the Topic to a chat as a SOURCE. Rather than invent a downstream
// surface, it reuses the one the app already has — so Extract ideas, Draft a
// post, Ask about it and the Sources panel all light up with no new plumbing and
// no special case anywhere.
//
// THREE surfaces hand it to a NEW chat, across a navigation; the composer hands
// it to the chat the reader is ALREADY in, inline:
//
//   useTopicInChat(topicId)             feed card / feed article / hero card:
//                                       mark it Used, then navigate to a fresh
//                                       chat bound to the Topic's Playbook
//   attachTopicToChat(sessionId, id)    consumed at session mount (the handoff)
//                                       AND by the inline picker's confirm:
//                                       attach as a ready source
//   startTopicPickerInline(sid, sess)   the composer's "Pick from the Topic Feed":
//                                       one Archie line + an in-thread widget
//                                       of the feed's draft-ready Topics, the
//                                       same shape as "Top performing posts"
//
// ── Why the composer stays in the chat ─────────────────────────────────────
// The composer's Add menu is where a reader pulls things INTO the chat they are
// writing in — a PDF, a URL, their top posts. Every neighbour in that menu acts
// in place; a Topic that opened a second chat was the one item that took the
// reader away from the one they had just asked to add to. So it mirrors
// startTopPostsInline (top-posts-flow.js): no modal, no navigation, a widget
// turn to pick from, and the pick attaches right here.
//
// ── The mark lands BEFORE the chat opens (the navigating three) ────────────
// Not after, and not on arrival. The reader's last sight of the feed has to be
// the Topic already marked, or the feed they come back to looks like it forgot.
// It is done here rather than in each caller so those three surfaces mean
// exactly the same thing by "Use in chat". The inline path marks at confirm,
// which is the same moment relative to the attach.
//
// ── No echo message, and no question picker (the navigating three) ─────────
// The source-intake card already names the Topic and the composer is right
// there. The inline path DOES follow with a next-steps picker — there the reader
// has not just left a decision behind, they are mid-conversation and the Topic
// has just landed, so "what should I do with it" is the natural next line.
//
// Version pins MUST match screens/session.js's for sources-stream and handoff:
// each keeps per-session state in a module-local Map, and a second copy at a
// different URL would keep its own.

import { navigate } from "./router.js?v=1177";
import { setHandoff } from "./handoff.js?v=1177";
import { addReadySource } from "./sources-stream.js?v=1177";
import { postAssistantMessage, postTopicsWidget } from "./assistant.js?v=1177";
import { getTopicById, topicTitle, markUsed, getPickableTopics } from "./topics-store.js?v=1177";
import { getFeedById, getFeedForPlaybook } from "./topic-feeds-store.js?v=1177";
import { findTopicSource } from "./topics-catalog.js?v=1177";
import { getContextById } from "./contexts-store.js?v=1177";

export const TOPIC_CHAT_HANDOFF = "pendingTopicChat";

// How many Topics the in-thread widget lists. The same cap as the hero's
// "Fresh topics" grid: a thread turn is not a page, and six is what the eye takes
// in as one group. Newest first — getPickableTopics is.
const TOPICS_WIDGET_MAX = 6;

/**
 * Mark the Topic Used and open a new chat with it attached.
 * @returns {boolean} false when the Topic is unknown, so a caller can bail
 *   without navigating — a link to a Topic that no longer exists goes nowhere.
 */
export function useTopicInChat(topicId) {
  const topic = getTopicById(topicId);
  if (!topic) return false;

  markUsed(topic.id);
  setHandoff(TOPIC_CHAT_HANDOFF, { topicId: topic.id });

  // The Playbook and the chat's name ride in the URL rather than in the handoff:
  // session.js already resolves `?contextId=` and `?title=` when it mints a
  // `new-*` session, so the chat is bound and named on its very first paint
  // instead of being renamed a frame later.
  const feed = getFeedById(topic.feedId);
  const params = new URLSearchParams();
  if (feed?.playbookId) params.set("contextId", feed.playbookId);
  params.set("title", topicTitle(topic));
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Consumed at session mount. Attaches the Topic as an already-processed source;
 * intake-lifecycle turns that into the source-intake card in the thread.
 *
 * Deduped on the Topic id inside addReadySource, so re-entering the same chat
 * cannot double it up.
 */
export function attachTopicToChat(sessionId, topicId) {
  const topic = getTopicById(topicId);
  if (!topic) return;
  const source = findTopicSource(topic.sourceId);
  addReadySource(sessionId, {
    id: topic.id,
    filename: topicTitle(topic),
    kind: "Topic",
    preview: topic.summary,
    iconClass: source?.icon || "ap-icon-antenna",
  });
}

/**
 * The composer's "Pick from the Topic Feed", inline. One Archie line, then a
 * single-select widget turn listing the feed's draft-ready Topics (the same
 * `pickable` rule the old dialog used, capped at six, newest first). No
 * Quickpicker step before it: a chat has exactly one Playbook, so there is
 * nothing to ask. The confirm is wired in session.js (finishTopicPick), which
 * marks the Topic Used, attaches it HERE via attachTopicToChat, then offers the
 * next step.
 *
 * `session` is passed in rather than looked up so this stays free of the
 * sessions store — the caller already has it in hand.
 */
export function startTopicPickerInline(sessionId, session) {
  const pb = session?.contextId ? getContextById(session.contextId) : null;
  const feed = pb ? getFeedForPlaybook(pb.id) : null;
  // The two empty copies the dialog used, unchanged — the situation is the same,
  // only the surface moved into the thread.
  if (!pb || !feed) {
    postAssistantMessage(sessionId, "This chat has no Playbook, so there's no feed to pick from.");
    return;
  }
  const topics = getPickableTopics(feed.id).slice(0, TOPICS_WIDGET_MAX);
  if (!topics.length) {
    postAssistantMessage(
      sessionId,
      `I haven't found a draft-ready Topic for ${pb.name} yet. There may be some under Topics for later in the feed.`,
    );
    return;
  }
  postAssistantMessage(
    sessionId,
    `Here are the freshest draft-ready Topics from ${pb.name} — pick one and I'll bring it in as a source.`,
  );
  postTopicsWidget(sessionId, { feedId: feed.id, topicIds: topics.map((t) => t.id) });
}
