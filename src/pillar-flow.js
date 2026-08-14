// Launches the in-chat interaction for a Playbook's content pillar.
//
// The same shape as brief-flow.js, and for the same reason: two surfaces start
// this and they sit on opposite sides of a navigation.
//
//   • The composer's Add menu ("Post about a Content Pillar") is ALREADY inside a
//     chat, so it calls attachPillarToChat(session.id, …) directly — no handoff,
//     no navigation, the pillar lands in the thread you are looking at.
//   • The pillar dialog on /playbook has no chat to attach to, so it calls
//     openPillarInChat(), which arms the handoff and navigates to a fresh one.
//
// Both end in the same attach, which is the point of the split: "Use in chat"
// means one thing whichever surface you press it from, exactly as it does for a
// topic.
//
// A pillar arrives as an already-processed SOURCE. Nothing new had to be built
// for it — intake-lifecycle turns it into a source-intake card in the thread, and
// every affordance the app already has (Extract ideas, Draft a post, Ask about
// it, the Sources panel) lights up on its own.
//
// Version pins MUST match screens/session.js's for sources-stream and
// contexts-store — each keeps module-local state, and a second copy at a
// different URL would keep its own. scripts/bump-cache.py --audit enforces it.

import { navigate } from "./router.js?v=30";
import { setHandoff } from "./handoff.js?v=20";
import { addReadySource } from "./sources-stream.js?v=89";
import { getContextById, getPillarById } from "./contexts-store.js?v=75";

export const PILLAR_CHAT_HANDOFF = "pendingPillarChat";

/**
 * From the pillar dialog on /playbook — spawn a chat that opens on this pillar.
 * @returns {boolean} false when the pillar is unknown, so the caller can bail
 *   without navigating.
 */
export function openPillarInChat(ctxId, pillarId) {
  const pillar = getPillarById(ctxId, pillarId);
  if (!pillar) return false;
  setHandoff(PILLAR_CHAT_HANDOFF, { ctxId, pillarId });
  // Playbook and chat name ride in the URL rather than the handoff: session.js
  // already resolves `?contextId=` and `?title=` when it mints a `new-*` session,
  // so the chat is bound to the right Playbook and named on its first paint.
  // Binding the Playbook matters more here than it does for a topic — a pillar IS
  // a piece of that Playbook's strategy, so a chat about it in another brand's
  // voice would be incoherent.
  const params = new URLSearchParams();
  params.set("contextId", ctxId);
  params.set("title", pillar.title);
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
  return true;
}

/**
 * Attach a pillar to a chat as an already-processed source. Called directly by
 * the composer's picker, and at session mount when the handoff above fires.
 */
export function attachPillarToChat(sessionId, ctxId, pillarId) {
  const pillar = getPillarById(ctxId, pillarId);
  if (!pillar) return;
  const ctx = getContextById(ctxId);
  addReadySource(sessionId, {
    // Prefixed, because a pillar id and a source id share one namespace in
    // sources-stream and a bare `pil-…` could collide with a future kind.
    id: `pillar-${pillar.id}`,
    filename: pillar.title,
    kind: "Content pillar",
    // The pillar's own description is what Archie should write against, so it is
    // what the source preview carries. Notes are deliberately left out: they are
    // the user's instructions to themselves, not the brief.
    preview: pillar.description || (ctx ? `A content pillar from ${ctx.name}` : ""),
    iconClass: pillar.icon || "ap-icon-target",
  });
}
