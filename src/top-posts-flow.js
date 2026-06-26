// "Milk a top post" conversational flow orchestrator.
//
// Launched from the "Use top performing posts" new-chat starter card
// (session.js starter click delegation → startTopPostsFlow). Runs inline in
// the current session's assistant panel so it reads as one continuous
// conversation.
//
// Arc:
//   1. startTopPostsFlow  — surface the user's winners; pick one to build on.
//   2. buildVariations    — echo the pick, explain WHY it worked, then go
//                           straight to spinning up fresh variations of it.
//                           Variations is the only reuse mode, so there's no
//                           reuse-mode picker between the pick and the result.
//   3. generateVariations — thinking chip → create the variation drafts → post
//                           a result turn (drafts via posts-store).

import {
  postAssistantMessage,
  startPending,
  finishPending,
  postDraftResult,
  postTopPostPickTurn,
} from "./assistant.js?v=52";
import { getTopPosts, getTopPost } from "./top-posts-store.js?v=2";
import { addPostDraft } from "./posts-store.js?v=31";
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

function labelFor(network) {
  return CHANNEL_META[(network || "").toLowerCase()]?.label || network;
}

// Shared chip lifecycle (mirrors draft-flow.withPendingChip): show the thinking
// chip, wait out the simulated delay, clear it, run `work` inside try/catch so a
// downstream failure still clears the chip and offers a Retry.
function withPendingChip(sessionId, work, onError, meta = "Generating drafts") {
  const pendingId = startPending(sessionId, meta);
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

// The reframings used to build the variation set. Each keys into ANGLE_COPY for
// the actual post body. No longer user-pickable — "Spin up variations" emits one
// draft per key — so only the key matters now.
const ANGLE_KEYS = ["contrarian", "howto", "story", "data"];

// Handcrafted, ready-to-post copy for each seeded winner × angle. This is what
// makes the variations read like real posts rather than rephrased prompts. A
// post id missing here falls back to genericAngleCopy() below, so the flow
// still works for any future / user-added winner.
const ANGLE_COPY = {
  "top-1": {
    contrarian: [
      "Unpopular opinion: your onboarding checklist is *why* people churn.",
      "We deleted ours. Activation went up 18%.",
      "Every step you add is one more place to drop off. The fix was never a better checklist — it was fewer decisions between signup and the first win.",
    ],
    howto: [
      "How we lifted activation 18% by removing onboarding steps, not adding them:",
      "1. Map every click between signup and first value.",
      "2. Delete everything that isn't the first win.",
      "3. Make that first win impossible to miss.",
      "Fewer steps. More activated users.",
    ],
    story: [
      "Six months ago our onboarding had 11 steps. We were proud of it.",
      "Then we watched a new user rage-quit on step 7.",
      "So we deleted the whole checklist and kept exactly one thing: the first win.",
      "Activation went up 18%. Sometimes the best feature is the one you remove.",
    ],
    data: [
      "18%.",
      "That's how much activation rose after we *deleted* our onboarding checklist — not optimised it, deleted it.",
      "Every extra step was quietly costing us conversions.",
    ],
  },
  "top-2": {
    contrarian: [
      "Hot take: most “AI content tools” are just expensive autocomplete.",
      "The ones that win do the boring thing — they remember your brand voice across every post.",
      "That's the whole game. Everything else is a demo.",
    ],
    howto: [
      "How to tell a real AI content tool from autocomplete in 30 seconds:",
      "Ask it to write 5 posts. If they sound like 5 different brands, it doesn't know your voice.",
      "Voice memory beats clever phrasing. Every time.",
    ],
    story: [
      "We tried 6 AI writing tools last quarter.",
      "Five produced text. One produced *us*.",
      "The difference wasn't the model — it was whether it held our voice between posts. That was the only feature that mattered.",
    ],
    data: [
      "6 tools tested. 1 kept.",
      "The keeper wasn't the smartest writer — it was the only one that held our brand voice across every post.",
      "Consistency beat cleverness, and it wasn't close.",
    ],
  },
  "top-3": {
    contrarian: [
      "You don't need a big team to ship great content.",
      "Our 4-person crew ships a full week of posts in one afternoon.",
      "The secret isn't more people — it's one repeatable workflow. Swipe for it →",
    ],
    howto: [
      "How a 4-person team ships a week of content in one afternoon:",
      "1. Batch every idea first, write second.",
      "2. Turn one source into many posts.",
      "3. Template the boring parts.",
      "Save this for your next content day 📌",
    ],
    story: [
      "A year ago, content took us all week — and we still missed posts.",
      "Now? One afternoon, a week's worth, done.",
      "Here's the exact workflow that got us there →",
    ],
    data: [
      "1 afternoon = 1 week of content. With 4 people.",
      "We used to spread this across 5 days. Same output, a fraction of the time.",
      "The workflow behind it →",
    ],
  },
};

// Generic fallback when a winner has no handcrafted copy — still produces a
// believable post shaped by the chosen angle, anchored on the post's excerpt.
function genericAngleCopy(post, key) {
  const core = firstSentence(post.excerpt);
  switch (key) {
    case "contrarian":
      return [`Unpopular opinion: ${lowerFirst(core)}`, post.excerpt];
    case "howto":
      return ["Here's how it actually works, step by step:", post.excerpt];
    case "story":
      return ["Here's the story behind one of our best-performing posts:", post.excerpt];
    case "data":
    default:
      return ["The proof that changed our mind:", post.excerpt];
  }
}

// Resolve the variation set for a post — one ready-to-post body per reframing,
// each a variation of the post's own copy (handcrafted, or generic fallback).
function variationsForPost(post) {
  const copy = ANGLE_COPY[post.id] || {};
  return ANGLE_KEYS.map((key) => ({
    text: copy[key] || genericAngleCopy(post, key),
  }));
}

// First sentence of a blob, used by the generic fallbacks + the X adapter.
function firstSentence(text) {
  const m = (text || "").match(/[^.!?]*[.!?]/);
  return (m ? m[0] : text || "").trim();
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// Provenance stamped onto every generated draft so the Drafts panel always
// shows where a post came from (the flow's core promise: capitalise on what
// worked). Rendered as a pill by post-card.js.
function variationOrigin(post) {
  return { icon: "ap-icon-shuffle", label: `New angle on your top ${labelFor(post.network)} post · ${post.perfBadge}` };
}

// ---- Step 1: the winner-selection grid screen -------------------------
//
// Step 1 is a visual grid of post cards (a "screen"), not a numbered
// quick-picker — it takes over the assistant panel the same way Batch / Clip
// Studio do. session.js checks isPickerActive() in renderAssistantPanel, paints
// the grid via renderTopPostsPickerScreen, and routes a card click back here
// through pickWinner(), which goes straight to spinning up variations.
const pickerStates = new Map(); // sessionId → { posts }
const pickerSubs = new Map(); // sessionId → Set<fn>

function notifyPicker(sessionId) {
  const subs = pickerSubs.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function isPickerActive(sessionId) {
  return pickerStates.has(sessionId);
}

export function getPickerState(sessionId) {
  return pickerStates.get(sessionId) || null;
}

export function subscribePicker(sessionId, fn) {
  if (!pickerSubs.has(sessionId)) pickerSubs.set(sessionId, new Set());
  pickerSubs.get(sessionId).add(fn);
  return () => pickerSubs.get(sessionId)?.delete(fn);
}

// A card click — clear the grid, then spin up variations for that winner.
export function pickWinner(sessionId, postId) {
  if (!pickerStates.has(sessionId)) return;
  pickerStates.delete(sessionId);
  notifyPicker(sessionId);
  buildVariations(sessionId, postId);
}

// Leave the grid without picking (Esc / route change cleanup).
export function exitPicker(sessionId) {
  if (!pickerStates.has(sessionId)) return;
  pickerStates.delete(sessionId);
  notifyPicker(sessionId);
}

// Change the active sort (toolbar chip click). Re-renders the board.
export function setSort(sessionId, sort) {
  const s = pickerStates.get(sessionId);
  if (!s || s.sort === sort) return;
  s.sort = sort;
  notifyPicker(sessionId);
}

// Change the active profile lens (profile chip click). "all" or a network slug.
// Re-renders the board, filtered to that profile's winners.
export function setProfile(sessionId, profile) {
  const s = pickerStates.get(sessionId);
  if (!s || s.profile === profile) return;
  s.profile = profile;
  notifyPicker(sessionId);
}

// (Re)open the board grid for the current winners. Silent — no intro turn —
// so it doubles as the "← Back" target from the reuse-mode picker without
// duplicating Archie's opener. Preserves nothing else; the sort resets to the
// default, which is fine for a re-entry.
function openBoard(sessionId) {
  const posts = getTopPosts();
  if (!posts.length) return;
  pickerStates.set(sessionId, { posts, sort: "performance", profile: "all" });
  notifyPicker(sessionId);
}

export function startTopPostsFlow(sessionId) {
  if (!getTopPosts().length) {
    // New-alt users have no published history yet.
    postAssistantMessage(
      sessionId,
      "Once your posts start performing, I'll surface your winners here so you can spin new posts out of what already works. Publish a few and come back.",
    );
    return;
  }
  // No intro chat bubble — the board screen renders its own studio-style
  // header (renderTopPostsPickerScreen in session.js).
  openBoard(sessionId);
}

// ---- Step 2: echo the pick, explain the why, spin up variations -------
//
// Variations is the only reuse mode, so picking a winner goes straight to
// generating fresh takes — no reuse-mode picker in between.
function buildVariations(sessionId, postId) {
  const post = getTopPost(postId);
  if (!post) return;
  // Echo the chosen post as a compact preview card (not a truncated text
  // bubble) so it stays visible in the conversation.
  postTopPostPickTurn(sessionId, {
    network: post.network,
    excerpt: post.excerpt,
    perfBadge: post.perfBadge,
    vsAvg: post.vsAvg,
    engagementRate: post.engagementRate,
    impressions: post.impressions,
  });
  postAssistantMessage(sessionId, `Great pick. Here are a few fresh takes on it:`);
  generateVariations(sessionId, post);
}

// ---- Step 3: Variations of the winning post ---------------------------

// Generate several drafts straight away. Each draft is a variation of the
// selected post's own copy (the per-winner handcrafted reframings double as the
// variation set; a winner with no handcrafted copy falls back to
// genericAngleCopy() off its excerpt).
function generateVariations(sessionId, post) {
  withPendingChip(
    sessionId,
    () => {
      const variations = variationsForPost(post);
      const drafts = variations.map((v) => {
        const draft = addPostDraft(sessionId, {
          network: post.network,
          text: v.text,
          hashtags: post.hashtags || [],
        });
        draft.origin = variationOrigin(post);
        return draft;
      });
      postDraftResult(sessionId, {
        ideaTitle: `New takes on your top ${labelFor(post.network)} post`,
        drafts,
      });
    },
    (err) => genError(err, () => generateVariations(sessionId, post)),
  );
}
