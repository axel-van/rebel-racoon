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

import { postUserTurn, postAssistantChoice, startPending, finishPending, postDraftResult } from "./assistant.js?v=36";
import { getIdeas } from "./library.js?v=29";
import { ideas as GLOBAL_IDEAS } from "./mocks.js?v=34";
import { addPostDraft } from "./posts-store.js?v=27";
import { showToast } from "./components/toast.js?v=20";

// Per-session ideas live in library.js while the right-panel browses a
// flat global list (mocks.ideas). Some entry points only have a global
// id, so fall back to the mock list when the per-session store doesn't
// know about it — keeps the draft flow universal.
function resolveIdea(sessionId, ideaId) {
  return getIdeas(sessionId).find((i) => i.id === ideaId) || GLOBAL_IDEAS.find((i) => i.id === ideaId) || null;
}

const CHANNEL_META = {
  linkedin: { icon: "ap-icon-linkedin-official", label: "LinkedIn" },
  x: { icon: "ap-icon-twitter-official", label: "X" },
  twitter: { icon: "ap-icon-twitter-official", label: "X" },
  instagram: { icon: "ap-icon-instagram-official", label: "Instagram" },
  facebook: { icon: "ap-icon-facebook-official", label: "Facebook" },
  tiktok: { icon: "ap-icon-tiktok-official", label: "TikTok" },
  youtube: { icon: "ap-icon-youtube-official", label: "YouTube" },
};

function labelFor(channel) {
  return CHANNEL_META[channel.toLowerCase()]?.label || channel;
}

export function startDraftFlow(sessionId, ideaId, count = 1, channelOverride = null) {
  const idea = resolveIdea(sessionId, ideaId);
  if (!idea) return;

  const echo = count > 1 ? `Draft ${count} posts: ${idea.title}` : `Draft a post: ${idea.title}`;
  postUserTurn(sessionId, echo);

  const pendingId = startPending(sessionId);

  setTimeout(() => {
    finishPending(sessionId, pendingId);

    // The caller picked a profile explicitly — honour it and skip the
    // channel picker. Used by the right-panel count+profile flow where
    // the user has already chosen which network to draft for.
    if (Array.isArray(channelOverride) && channelOverride.length > 0) {
      executeDraft(sessionId, ideaId, channelOverride, count);
      return;
    }

    const channels = (idea.channels || ["linkedin"]).filter((c) => CHANNEL_META[c.toLowerCase()]);

    // When count > 1, the user has already committed to a batch size —
    // skip the channel picker entirely and draft on the idea's primary
    // channel so we don't stack two pickers back-to-back.
    if (count > 1 || channels.length <= 1) {
      const chosen = channels.length >= 1 ? [channels[0]] : ["linkedin"];
      executeDraft(sessionId, ideaId, chosen, count);
      return;
    }

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
  }, 6000);
}

export function executeDraft(sessionId, ideaId, selectedChannels, count = 1) {
  const idea = resolveIdea(sessionId, ideaId);
  if (!idea || !selectedChannels || selectedChannels.length === 0) return;

  // 1. Echo the user's channel selection (skip when the count flow
  //    already implied a single channel — the count picker echo above
  //    is enough on its own).
  if (count <= 1) {
    const selectionText = selectedChannels.map(labelFor).join(", ");
    postUserTurn(sessionId, selectionText);
  }

  // 2. Thinking chip while "generating" the drafts.
  const pendingId = startPending(sessionId);

  setTimeout(() => {
    // FIND-D2: wrap the draft creation + result post in a try/catch so
    // a downstream failure (posts-store throws, assistant push errors)
    // doesn't leave the thinking chip ticking forever. The chip itself
    // is cleared by finishPending so the user always gets back to a
    // stable state, and an error toast surfaces the failure with a
    // hook-able Retry action (idempotent — runs the same channels).
    finishPending(sessionId, pendingId);
    try {
      // Total drafts = max(count, channels). When count > channels.length
      // we cycle channels round-robin so a "5 drafts on linkedin" request
      // produces 5 linkedin posts and a multi-channel "1 draft per
      // channel" pick still creates one per channel.
      const total = Math.max(count, selectedChannels.length);
      const drafts = Array.from({ length: total }, (_, i) =>
        addPostDraft(sessionId, {
          network: selectedChannels[i % selectedChannels.length],
          text: [idea.title, ...(idea.body ? [idea.body] : [])],
          hashtags: [],
        }),
      );
      postDraftResult(sessionId, {
        ideaTitle: idea.title,
        drafts,
      });
    } catch (err) {
      // Surface the failure + offer a Retry that re-enters executeDraft
      // with the same arguments. Keep the toast duration generous so
      // the user has time to react before it auto-dismisses.
      // eslint-disable-next-line no-console
      console.error("draft-flow: executeDraft failed", err);
      showToast("Couldn't create those drafts. Try again?", {
        variant: "error",
        duration: 6000,
        action: {
          label: "Retry",
          onClick: () => executeDraft(sessionId, ideaId, selectedChannels, count),
        },
      });
    }
  }, 6000);
}
