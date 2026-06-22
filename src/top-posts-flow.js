// "Milk a top post" conversational flow orchestrator.
//
// Launched from the "Use top performing posts" new-chat starter card
// (session.js starter click delegation → startTopPostsFlow). Runs inline in
// the current session's assistant panel using the same inline-question picker
// chrome as the draft / clip flows, so it reads as one continuous conversation.
//
// Arc:
//   1. startTopPostsFlow  — surface the user's winners; pick one to build on.
//   2. chooseMode         — explain WHY it worked, then pick a reuse mode.
//   3a. Repurpose         — pick target channels → one adapted draft per channel.
//   3b. Variations        — pick how many drafts per winning angle (stepper).
//   3c. Refresh & repost  — one freshened draft → offer to schedule it.
//   3d. Save the angle    — distil the winning pattern into a reusable idea.
//   4. generate*          — thinking chip → create drafts/ideas → post a result
//                           turn (drafts via posts-store, ideas via library).

import {
  postUserTurn,
  postAssistantMessage,
  startPending,
  finishPending,
  postDraftResult,
  postExtractionResult,
} from "./assistant.js?v=43";
import * as inlineQuestion from "./inline-question.js?v=34";
import { getTopPosts, getTopPost } from "./top-posts-store.js?v=1";
import { addPostDraft } from "./posts-store.js?v=30";
import { injectIdeasForSource } from "./library.js?v=33";
import { open as openScheduleModal } from "./components/schedule-modal.js?v=38";
import { showToast } from "./components/toast.js?v=20";

// Simulated "generating" delay — matches draft-flow's chip duration so the
// milker feels like the rest of the studio.
const GEN_DELAY_MS = 6000;

const CHANNEL_META = {
  linkedin: { icon: "ap-icon-linkedin-official", label: "LinkedIn" },
  x: { icon: "ap-icon-twitter-official", label: "X" },
  twitter: { icon: "ap-icon-twitter-official", label: "X" },
  instagram: { icon: "ap-icon-instagram-official", label: "Instagram" },
  facebook: { icon: "ap-icon-facebook-official", label: "Facebook" },
  tiktok: { icon: "ap-icon-tiktok-official", label: "TikTok" },
  youtube: { icon: "ap-icon-youtube-official", label: "YouTube" },
};

// Channels we offer as repurpose targets, in display order. The source post's
// own network is filtered out at render time (no point repurposing onto itself).
const REPURPOSE_TARGETS = ["linkedin", "x", "instagram", "facebook", "tiktok"];

function labelFor(network) {
  return CHANNEL_META[(network || "").toLowerCase()]?.label || network;
}

function iconFor(network) {
  return CHANNEL_META[(network || "").toLowerCase()]?.icon || "ap-icon-share";
}

// Trim an excerpt for a one-line label / echo without cutting mid-word.
function truncate(text, max = 70) {
  if (!text || text.length <= max) return text || "";
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

// Shared chip lifecycle (mirrors draft-flow.withPendingChip): show the thinking
// chip, wait out the simulated delay, clear it, run `work` inside try/catch so a
// downstream failure still clears the chip and offers a Retry.
function withPendingChip(sessionId, work, onError) {
  const pendingId = startPending(sessionId);
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    try {
      work();
    } catch (err) {
      onError(err);
    }
  }, GEN_DELAY_MS);
}

function genError(err, retry) {
  // eslint-disable-next-line no-console
  console.error("top-posts-flow: draft generation failed", err);
  showToast("Couldn't create those drafts. Try again?", {
    variant: "error",
    duration: 6000,
    action: { label: "Retry", onClick: retry },
  });
}

// Four fixed reframings of a winning post, seeded off its excerpt so the
// "variations" output reads as tailored without any randomness. Mirrors
// draft-flow.generateAngles but anchored on the post rather than an idea.
function anglesForPost(post) {
  return [
    {
      id: `${post.id}-angle-contrarian`,
      title: "Push the contrarian angle harder",
      description: "Lead with an even bolder version of the take that already landed.",
    },
    {
      id: `${post.id}-angle-howto`,
      title: "Turn it into a how-to",
      description: "Repackage the winning idea as a step-by-step readers can act on today.",
    },
    {
      id: `${post.id}-angle-story`,
      title: "Tell the story behind it",
      description: "Share the real moment and the lesson that made this resonate.",
    },
    {
      id: `${post.id}-angle-data`,
      title: "Back it with fresh proof",
      description: "Anchor the same point to a new number or customer result.",
    },
  ];
}

// ---- Step 1: surface the winners --------------------------------------

export function startTopPostsFlow(sessionId) {
  const posts = getTopPosts();
  if (!posts.length) {
    // New-alt users have no published history yet.
    postAssistantMessage(
      sessionId,
      "Once your posts start performing, I'll surface your winners here so you can spin new posts out of what already works. Publish a few and come back.",
    );
    return;
  }

  postAssistantMessage(
    sessionId,
    "Let's build on what already works. Here are your top-performing posts — pick the one you want to milk for more.",
  );
  inlineQuestion.ask(sessionId, {
    stepLabel: "Top posts",
    title: "Which winner should I build on?",
    items: posts.map((p) => ({
      value: p.id,
      label: truncate(p.excerpt, 90),
      caption: `${labelFor(p.network)} · ${p.perfBadge} · ${p.metricLine}`,
      icon: iconFor(p.network),
    })),
    onPick: (postId) => chooseMode(sessionId, postId),
  });
}

// ---- Step 2: explain the why, pick a reuse mode -----------------------

function chooseMode(sessionId, postId) {
  const post = getTopPost(postId);
  if (!post) return;
  postUserTurn(sessionId, `Build on my ${labelFor(post.network)} post: "${truncate(post.excerpt, 60)}"`);
  postAssistantMessage(
    sessionId,
    `Great pick. This one worked because of ${post.whyItWorked}. How do you want to reuse it?`,
  );
  inlineQuestion.ask(sessionId, {
    stepLabel: "Reuse",
    title: "How should I reuse this post?",
    items: [
      {
        value: "repurpose",
        label: "Repurpose to other channels",
        caption: "Adapt the same idea for your other networks",
        icon: "ap-icon-share",
      },
      {
        value: "variations",
        label: "Spin up variations",
        caption: "Fresh posts on the same winning angle",
        icon: "ap-icon-shuffle",
      },
      {
        value: "refresh",
        label: "Refresh & repost",
        caption: "Freshen it up and schedule it to run again",
        icon: "ap-icon-refresh",
      },
      {
        value: "extract",
        label: "Save the winning angle",
        caption: "Turn what worked into a reusable idea",
        icon: "ap-icon-star",
      },
    ],
    onPick: (mode) => {
      if (mode === "repurpose") return askChannels(sessionId, post);
      if (mode === "variations") return askVariations(sessionId, post);
      if (mode === "refresh") return generateRefresh(sessionId, post);
      return generateExtract(sessionId, post);
    },
    onBack: () => startTopPostsFlow(sessionId),
  });
}

// ---- Step 3a: Repurpose to other channels -----------------------------

function askChannels(sessionId, post) {
  postUserTurn(sessionId, "Repurpose it to other channels");
  const targets = REPURPOSE_TARGETS.filter((c) => c !== (post.network || "").toLowerCase());
  inlineQuestion.ask(sessionId, {
    stepLabel: "Channels",
    title: "Which channels should I adapt it for?",
    multi: true,
    defaultSelected: targets.slice(0, 1),
    submitLabel: "Adapt it",
    items: targets.map((c) => ({ value: c, label: labelFor(c), icon: iconFor(c) })),
    onPick: (channels) => generateRepurpose(sessionId, post, channels),
    onBack: () => chooseMode(sessionId, post.id),
  });
}

function generateRepurpose(sessionId, post, channels) {
  const picked = (channels || []).filter((c) => CHANNEL_META[c]);
  if (!picked.length) return;
  postUserTurn(sessionId, picked.map(labelFor).join(", "));
  withPendingChip(
    sessionId,
    () => {
      const drafts = picked.map((c) =>
        addPostDraft(sessionId, {
          network: c,
          text: [post.excerpt],
          hashtags: post.hashtags || [],
        }),
      );
      postDraftResult(sessionId, {
        ideaTitle: `Repurposed from your top ${labelFor(post.network)} post`,
        drafts,
      });
    },
    (err) => genError(err, () => generateRepurpose(sessionId, post, picked)),
  );
}

// ---- Step 3b: Variations on the winning angle -------------------------

function askVariations(sessionId, post) {
  postUserTurn(sessionId, "Spin up variations");
  const angles = anglesForPost(post);
  inlineQuestion.ask(sessionId, {
    stepLabel: "Variations",
    title: "How many drafts per angle?",
    subtitle: "Each angle reframes the same winning idea. Set a count, or 0 to skip.",
    stepper: true,
    defaultCount: 1,
    countMin: 0,
    countMax: 10,
    submitCountLabel: (n) => (n === 1 ? "Generate 1 draft" : `Generate ${n} drafts`),
    items: angles.map((a) => ({ value: a.id, label: a.title, caption: a.description })),
    onPick: ({ picks }) => generateVariations(sessionId, post, angles, picks),
    onBack: () => chooseMode(sessionId, post.id),
  });
}

function generateVariations(sessionId, post, angles, picks) {
  const valid = (picks || []).filter((p) => p.count > 0);
  if (!valid.length) return;
  const total = valid.reduce((sum, p) => sum + p.count, 0);
  postUserTurn(sessionId, total === 1 ? "Generate 1 variation" : `Generate ${total} variations`);
  withPendingChip(
    sessionId,
    () => {
      const drafts = [];
      for (const { value, count } of valid) {
        const angle = angles.find((a) => a.id === value);
        for (let i = 0; i < count; i += 1) {
          drafts.push(
            addPostDraft(sessionId, {
              network: post.network,
              text: [angle ? angle.description : post.excerpt],
              hashtags: post.hashtags || [],
            }),
          );
        }
      }
      postDraftResult(sessionId, {
        ideaTitle: `New takes on your top ${labelFor(post.network)} post`,
        drafts,
      });
    },
    (err) => genError(err, () => generateVariations(sessionId, post, angles, picks)),
  );
}

// ---- Step 3c: Refresh & repost ----------------------------------------

// One freshened draft on the post's own network, then an offer to schedule it
// straight into the queue (reusing the schedule modal). No extra picker before
// generating — "refresh" is a single, opinionated action.
function generateRefresh(sessionId, post) {
  postUserTurn(sessionId, "Refresh & repost");
  withPendingChip(
    sessionId,
    () => {
      const draft = addPostDraft(sessionId, {
        network: post.network,
        text: ["Reposting this with fresh proof — it still holds up:", post.excerpt],
        hashtags: post.hashtags || [],
      });
      postDraftResult(sessionId, {
        ideaTitle: `Refreshed your top ${labelFor(post.network)} post`,
        drafts: [draft],
      });
      offerSchedule(sessionId, draft);
    },
    (err) => genError(err, () => generateRefresh(sessionId, post)),
  );
}

// After a refresh, ask whether to schedule the draft now. "Schedule it" opens
// the standard schedule modal seeded with the single draft; "Keep as draft"
// just confirms it's in Drafts.
function offerSchedule(sessionId, draft) {
  postAssistantMessage(sessionId, "Here's the refreshed version. Want me to schedule it to run again?");
  inlineQuestion.ask(sessionId, {
    stepLabel: "Repost",
    title: "Schedule this repost?",
    items: [
      {
        value: "schedule",
        label: "Schedule it",
        caption: "Pick a time and add it to your queue",
        icon: "ap-icon-calendar",
      },
      {
        value: "keep",
        label: "Keep as a draft",
        caption: "I'll leave it in Drafts for now",
        icon: "ap-icon-feature-library",
      },
    ],
    onPick: (choice) => {
      if (choice === "schedule") {
        postUserTurn(sessionId, "Schedule it");
        openScheduleModal({
          posts: [draft],
          onConfirm: () =>
            postAssistantMessage(sessionId, "Done — it's queued to run again. You'll find it on your calendar."),
        });
        return;
      }
      postUserTurn(sessionId, "Keep as a draft");
      postAssistantMessage(sessionId, "Got it — it's waiting in your Drafts whenever you're ready.");
    },
  });
}

// ---- Step 3d: Save the winning angle as a reusable idea ---------------

// Distil the winning pattern (its `whyItWorked`) into one reusable idea so the
// user can build on the formula later. Lands in the Ideas library via
// injectIdeasForSource (dual-write so it shows in the Ideas panel) and posts an
// inline extraction-result turn.
function generateExtract(sessionId, post) {
  postUserTurn(sessionId, "Save the winning angle");
  withPendingChip(
    sessionId,
    () => {
      const idea = {
        title: `The winning formula behind your top ${labelFor(post.network)} post`,
        body: `What made it land: ${post.whyItWorked}. Reuse this formula on your next ${labelFor(post.network)} post.`,
        kind: "insight",
        tags: post.hashtags || [],
        rationale: `Distilled from a ${post.perfBadge} post (${post.metricLine}).`,
        channels: [post.network],
      };
      const created = injectIdeasForSource(sessionId, post.id, [idea]);
      postExtractionResult(sessionId, {
        filename: `your top ${labelFor(post.network)} post`,
        ideas: created,
      });
    },
    (err) => genError(err, () => generateExtract(sessionId, post)),
  );
}
