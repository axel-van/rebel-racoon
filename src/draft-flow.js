// Draft-a-post conversational flow orchestrator.
//
// startDraftFlow(sessionId, ideaId):
//   Kicks off the multi-step flow from an idea card "Draft a post" click.
//   1. Echoes user intent as a user turn.
//   2. Shows a thinking chip (~1.5s).
//   3a. If idea has >1 channel: shows an assistant-choice turn (channel picker).
//   3b. If idea has 1 channel: skips the picker and calls executeDraft directly.
//
// executeDraft(sessionId, ideaId, selectedChannels):
//   Called from session.js when the user clicks "Draft them" in the choice turn.
//   1. Echoes the selected channels as a user turn.
//   2. Shows a thinking chip (~2s).
//   3. Creates one draft post per channel via posts-store.js.
//   4. Posts a structured "Drafted N posts" result turn.

import { postUserTurn, postAssistantChoice, startPending, finishPending, postDraftResult } from "./assistant.js?v=23";
import { getIdeas } from "./library.js?v=23";
import { addPostDraft } from "./posts-store.js?v=23";

const CHANNEL_META = {
  linkedin: { icon: "ap-icon-linkedin", label: "LinkedIn" },
  x: { icon: "ap-icon-twitter-official", label: "X" },
  twitter: { icon: "ap-icon-twitter-official", label: "X" },
  instagram: { icon: "ap-icon-instagram", label: "Instagram" },
};

function labelFor(channel) {
  return CHANNEL_META[channel.toLowerCase()]?.label || channel;
}

export function startDraftFlow(sessionId, ideaId) {
  const idea = getIdeas(sessionId).find((i) => i.id === ideaId);
  if (!idea) return;

  // 1. Echo the user's intent.
  postUserTurn(sessionId, `Draft a post: ${idea.title}`);

  // 2. Thinking chip while "deciding" which channels to suggest.
  const pendingId = startPending(sessionId);

  setTimeout(() => {
    finishPending(sessionId, pendingId);

    const channels = (idea.channels || ["linkedin"]).filter((c) => CHANNEL_META[c.toLowerCase()]);

    // 3a. Single-channel shortcut — skip the picker entirely.
    if (channels.length <= 1) {
      const chosen = channels.length === 1 ? channels : ["linkedin"];
      executeDraft(sessionId, ideaId, chosen);
      return;
    }

    // 3b. Multi-channel — show the picker.
    const choices = channels.map((c) => ({
      value: c,
      label: labelFor(c),
      icon: CHANNEL_META[c.toLowerCase()].icon,
    }));

    postAssistantChoice(sessionId, {
      text: "Which channels should I draft for?",
      choices,
      multi: true,
      handler: "draft-channels",
      context: { ideaId: idea.id },
      submitLabel: "Draft them",
    });
  }, 1500);
}

export function executeDraft(sessionId, ideaId, selectedChannels) {
  const idea = getIdeas(sessionId).find((i) => i.id === ideaId);
  if (!idea || !selectedChannels || selectedChannels.length === 0) return;

  // 1. Echo the user's channel selection.
  const selectionText = selectedChannels.map(labelFor).join(", ");
  postUserTurn(sessionId, selectionText);

  // 2. Thinking chip while "generating" the drafts.
  const pendingId = startPending(sessionId);

  setTimeout(() => {
    finishPending(sessionId, pendingId);

    // 3. Create one draft per selected channel.
    const drafts = selectedChannels.map((channel) =>
      addPostDraft(sessionId, {
        network: channel,
        text: [idea.title, ...(idea.body ? [idea.body] : [])],
        hashtags: [],
      }),
    );

    // 4. Announce the result in the assistant thread.
    postDraftResult(sessionId, {
      ideaTitle: idea.title,
      drafts,
    });
  }, 2000);
}
