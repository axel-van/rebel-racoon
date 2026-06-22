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
  postTopPostPickTurn,
} from "./assistant.js?v=46";
import * as inlineQuestion from "./inline-question.js?v=34";
import { getTopPosts, getTopPost } from "./top-posts-store.js?v=2";
import { addPostDraft } from "./posts-store.js?v=31";
import { injectIdeasForSource } from "./library.js?v=36";
import { open as openScheduleModal } from "./components/schedule-modal.js?v=39";
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

// The four angle reframings offered in the variations stepper. `title` /
// `caption` drive the picker row; `key` keys into ANGLE_COPY for the actual
// post body.
const ANGLE_DEFS = [
  {
    key: "contrarian",
    title: "Push the contrarian angle",
    caption: "A bolder version of the take that already landed",
  },
  { key: "howto", title: "Turn it into a how-to", caption: "The same idea as a step-by-step readers can act on" },
  { key: "story", title: "Tell the story behind it", caption: "The real moment and the lesson that made it resonate" },
  { key: "data", title: "Lead with the proof", caption: "Anchor it to the number that makes it undeniable" },
];

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

// Resolve the four angle options for a post, each with its ready-to-post body.
function anglesForPost(post) {
  const copy = ANGLE_COPY[post.id] || {};
  return ANGLE_DEFS.map((def) => ({
    id: `${post.id}-angle-${def.key}`,
    title: def.title,
    description: def.caption,
    text: copy[def.key] || genericAngleCopy(post, def.key),
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

// Channel adaptation for Repurpose — the same proven core, reframed in each
// network's native format: X stays punchy and single-idea, LinkedIn invites
// discussion, Instagram is save-worthy, Facebook is conversational, TikTok
// opens on a hook. Returns { text[], hashtags[], cta }.
function composeForChannel(post, channel) {
  const net = (channel || "").toLowerCase();
  const tags = post.hashtags || [];
  if (net === "x" || net === "twitter") {
    // One sharp idea; trim to the lead so it reads native to X.
    const lead = firstSentence(post.excerpt);
    return { text: [lead.length > 12 ? lead : post.excerpt], hashtags: tags.slice(0, 2), cta: "" };
  }
  if (net === "instagram") {
    return { text: [post.excerpt, "Save this for later 📌"], hashtags: tags, cta: "" };
  }
  if (net === "facebook") {
    return { text: ["Sharing this one again — it still holds up:", post.excerpt], hashtags: tags.slice(0, 2), cta: "" };
  }
  if (net === "tiktok") {
    return { text: ["POV: the one post that actually worked 👇", post.excerpt], hashtags: tags.slice(0, 3), cta: "" };
  }
  // linkedin + default — keep it full, end on a discussion prompt.
  return { text: [post.excerpt, "What would you add? 👇"], hashtags: tags.slice(0, 3), cta: "" };
}

// Provenance stamped onto every generated draft so the Drafts panel always
// shows where a post came from (the milker's core promise: capitalise on
// what worked). Rendered as a pill by post-card.js.
function originFor(post, mode) {
  const net = labelFor(post.network);
  const map = {
    repurpose: { icon: "ap-icon-share", label: `Repurposed from your top ${net} post · ${post.perfBadge}` },
    variations: { icon: "ap-icon-shuffle", label: `New angle on your top ${net} post · ${post.perfBadge}` },
    refresh: { icon: "ap-icon-refresh", label: `Refreshed from your top ${net} post · ${post.perfBadge}` },
  };
  return map[mode] || null;
}

// ---- Step 1: the winner-selection grid screen -------------------------
//
// Step 1 is a visual grid of post cards (a "screen"), not a numbered
// quick-picker — it takes over the assistant panel the same way Batch / Clip
// Studio do. session.js checks isPickerActive() in renderAssistantPanel, paints
// the grid via renderTopPostsPickerScreen, and routes a card click back here
// through pickWinner(). Steps 2+ stay as inline-question pickers.
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

// A card click — clear the grid, then drop into the mode picker for that winner.
export function pickWinner(sessionId, postId) {
  if (!pickerStates.has(sessionId)) return;
  pickerStates.delete(sessionId);
  notifyPicker(sessionId);
  chooseMode(sessionId, postId);
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

// (Re)open the board grid for the current winners. Silent — no intro turn —
// so it doubles as the "← Back" target from the reuse-mode picker without
// duplicating Archie's opener. Preserves nothing else; the sort resets to the
// default, which is fine for a re-entry.
function openBoard(sessionId) {
  const posts = getTopPosts();
  if (!posts.length) return;
  pickerStates.set(sessionId, { posts, sort: "performance" });
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
  postAssistantMessage(
    sessionId,
    "Let's build on what already works. Here are your top-performing posts — pick the one you want to milk for more.",
  );
  openBoard(sessionId);
}

// ---- Step 2: explain the why, pick a reuse mode -----------------------

function chooseMode(sessionId, postId) {
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
    // ← Back returns to the winner board (silent re-open, no duplicate intro).
    onBack: () => openBoard(sessionId),
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
      const drafts = picked.map((c) => {
        const copy = composeForChannel(post, c);
        const draft = addPostDraft(sessionId, { network: c, text: copy.text, hashtags: copy.hashtags });
        draft.origin = originFor(post, "repurpose");
        return draft;
      });
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
          const draft = addPostDraft(sessionId, {
            network: post.network,
            text: angle ? angle.text : [post.excerpt],
            hashtags: post.hashtags || [],
          });
          draft.origin = originFor(post, "variations");
          drafts.push(draft);
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
      draft.origin = originFor(post, "refresh");
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
