// Published-posts repurposing conversational flow orchestrator.
//
// Launched from the "Use top performing posts" new-chat starter card
// (session.js starter click delegation → startTopPostsFlow). Runs inline in
// the current session's assistant panel so it reads as one continuous
// conversation.
//
// Arc (mirrors the product spec "select one or more posts → pick a new angle →
// adapt to each connected network → schedule"):
//   1. startTopPostsFlow  — surface the user's winners (board screen). The user
//                           filters/sorts, then selects one or more via the
//                           per-card checkbox + bulk bar (or the per-card
//                           "Repurpose" shortcut for a single winner).
//   2. echoRepurposePicks — echo the picked post(s). session.js then drives the
//                           angle + profile quick-pickers (inline-question), the
//                           same numbered Quickpicker the draft flow uses; the
//                           data helpers here (ANGLE_CHOICES / repurposeProfile-
//                           Items) feed those pickers. The profile picker offers
//                           the OTHER connected profiles — not the one the winner
//                           already ran on.
//   3. executeRepurpose   — thinking chip → one adapted draft per
//                           post × angle × target profile → post a result turn.

import {
  postAssistantMessage,
  startPending,
  finishPending,
  postDraftResult,
  postTopPostPickTurn,
} from "./assistant.js?v=52";
import { getTopPosts, getTopPost } from "./top-posts-store.js?v=2";
import { addPostDraft } from "./posts-store.js?v=31";
import { getConnectedProfiles, BRAND_INITIALS, NETWORK_ICON_BY_PLATFORM } from "./social-profiles.js?v=22";
import { isFlagOn } from "./feature-flags.js?v=9";
import { showToast } from "./components/toast.js?v=20";

// Cap on drafts produced in one run — post × angle × channel can multiply fast
// (e.g. 3 posts × 4 angles × 3 channels = 36). Keep the result turn scannable;
// the title flags when the set was clipped.
const MAX_DRAFTS = 10;

// Simulated "generating" delay — matches draft-flow's chip duration so the
// milker feels like the rest of the studio.
const GEN_DELAY_MS = 6000;

// Simulated "loading this profile's top posts" beat between the profile chooser
// (step 1) and the winner board.
const PROFILE_LOAD_MS = 1800;

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

// The reframings the user can spin a winner into. Each keys into ANGLE_COPY for
// the actual post body. ANGLE_KEYS is the default set (used when the user skips
// the picker); ANGLE_CHOICES drives the in-chat quick-picker (value/label/icon,
// the same shape draft-flow's channel picker uses).
const ANGLE_KEYS = ["contrarian", "howto", "story", "data"];

export const ANGLE_CHOICES = [
  { value: "contrarian", label: "Contrarian", icon: "ap-icon-target" },
  { value: "howto", label: "How-to", icon: "ap-icon-numbered-list" },
  { value: "story", label: "Story", icon: "ap-icon-single-chat-bubble" },
  { value: "data", label: "Data-backed", icon: "ap-icon-data-report" },
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

// Mock body for a user's own free-text angle ("Other" option) — lead with their
// instruction, anchored on the post's excerpt so it reads as a real take.
function customAngleCopy(post, instruction) {
  const ask = (instruction || "").trim().replace(/\s+/g, " ");
  const hook = /[.!?]$/.test(ask) ? ask : `${ask}.`;
  return [hook, post.excerpt];
}

// Resolve the base body for one post × angle. A known angle key uses the
// handcrafted copy (or generic fallback); anything else is the user's own
// free-text instruction from the "Other" option. Run through adaptForNetwork per
// target channel afterwards.
function copyForAngle(post, key) {
  if (!ANGLE_KEYS.includes(key)) return customAngleCopy(post, key);
  const copy = ANGLE_COPY[post.id] || {};
  return copy[key] || genericAngleCopy(post, key);
}

// Adapt a base body to a target network's format + character constraints — the
// spec's "adapt the output to each connected network". Light, deterministic
// transforms (this is a prototype): X/Threads compress to a single punchy
// sub-280-char take; the long-form networks keep the full paragraph body.
function adaptForNetwork(textArr, network) {
  const net = (network || "").toLowerCase();
  const paras = Array.isArray(textArr) ? textArr : [textArr];
  if (net === "x" || net === "twitter") {
    // Grow from the hook, adding whole paragraphs while they fit, then clip on a
    // word boundary so the tweet never cuts mid-word.
    let out = (paras[0] || "").trim();
    for (let i = 1; i < paras.length; i += 1) {
      const next = `${out} ${paras[i].trim()}`;
      if (next.length <= 270) out = next;
      else break;
    }
    if (out.length > 280) out = `${out.slice(0, 269).replace(/\s+\S*$/, "")}…`;
    return [out];
  }
  // LinkedIn / Facebook / Instagram keep the full body (Instagram's hashtags are
  // trimmed by adaptHashtags, not here).
  return paras;
}

// Trim the source post's hashtags to what each network wears well — X stays
// terse (≤2), everyone else keeps the set.
function adaptHashtags(tags, network) {
  const net = (network || "").toLowerCase();
  const list = tags || [];
  if (net === "x" || net === "twitter") return list.slice(0, 2);
  return list;
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
// the grid via renderTopPostsPickerScreen, and routes a card / bulk-bar click
// back to session.js's startRepurposeFlow, which echoes the picks then opens
// the angle quick-picker.
const pickerStates = new Map(); // sessionId → { stage, posts, profile, sort, period, selected }
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

// Toggle a winner in the multi-select set (per-card checkbox). Drives the bulk
// bar count + the card's selected state.
export function toggleSelect(sessionId, postId) {
  const s = pickerStates.get(sessionId);
  if (!s) return;
  if (!s.selected) s.selected = new Set();
  if (s.selected.has(postId)) s.selected.delete(postId);
  else s.selected.add(postId);
  notifyPicker(sessionId);
}

// Clear the multi-select set (bulk bar "Cancel").
export function clearSelection(sessionId) {
  const s = pickerStates.get(sessionId);
  if (!s || !s.selected || s.selected.size === 0) return;
  s.selected.clear();
  notifyPicker(sessionId);
}

// Change the active period filter (toolbar chip). "all" | "90d" | "30d".
export function setPeriod(sessionId, period) {
  const s = pickerStates.get(sessionId);
  if (!s || s.period === period) return;
  s.period = period;
  notifyPicker(sessionId);
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

// Connected social profiles offered on the chooser screen (step 1). This is what
// the user picks first — the spec's "select a social profile in the first place".
// No winner count: it isn't known until the chosen profile's posts load.
export function getProfileChoices() {
  return getConnectedProfiles().map((a) => {
    const net = normNet(a.platform);
    return {
      network: net,
      accountId: a.id,
      handle: a.handle,
      caption: [a.platformLabel, a.kind].filter(Boolean).join(" · "),
      photo: a.photo,
      networkIcon: NETWORK_ICON_BY_PLATFORM[net] || null,
    };
  });
}

// Seed the picker at a given stage. Posts are loaded once up front; the board
// filters them to the active profile ("all" = every winner, the flag-OFF mode).
function openStage(sessionId, stage, profile = null) {
  const posts = getTopPosts();
  if (!posts.length) return;
  pickerStates.set(sessionId, {
    stage,
    posts,
    profile,
    sort: "performance",
    period: "all",
    selected: new Set(),
  });
  notifyPicker(sessionId);
}

// Change the active profile lens (flag-OFF dropdown). "all" or a network slug.
export function setProfile(sessionId, profile) {
  const s = pickerStates.get(sessionId);
  if (!s || s.profile === profile) return;
  s.profile = profile;
  notifyPicker(sessionId);
}

// Profile chosen on the chooser screen → briefly "load" its top posts, then
// reveal the board scoped to that profile.
export function chooseProfile(sessionId, network) {
  const s = pickerStates.get(sessionId);
  if (!s) return;
  s.profile = normNet(network);
  s.stage = "loading";
  s.selected = new Set();
  notifyPicker(sessionId);
  setTimeout(() => {
    const cur = pickerStates.get(sessionId);
    if (!cur || cur.stage !== "loading") return; // bailed / re-entered
    cur.stage = "board";
    notifyPicker(sessionId);
  }, PROFILE_LOAD_MS);
}

// Board → back to the profile chooser (step 1). Resets the profile, selection
// and filters so the chooser opens clean.
export function backToProfiles(sessionId) {
  const s = pickerStates.get(sessionId);
  if (!s) return;
  s.stage = "profile";
  s.profile = null;
  s.selected = new Set();
  s.sort = "performance";
  s.period = "all";
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
  // Flag ON (default): step 1 is the full-page profile chooser. Flag OFF: open
  // straight on the board of all winners with the in-toolbar profile dropdown.
  if (isFlagOn("repurposeProfileFirst")) {
    openStage(sessionId, "profile");
  } else {
    openStage(sessionId, "board", "all");
  }
}

// ---- Step 2: echo the pick(s) ----------------------------------------
//
// Clears the board grid (it may or may not be up — the Details-modal
// "Repurpose" path calls in with the grid still active) and echoes every chosen
// winner as a compact preview card so the picks stay visible in the
// conversation. Returns the valid post ids so the caller can drive the angle
// quick-picker; the picker itself lives in session.js (inline-question), which
// owns the onPick closures the way the draft flow's profile picker does.
export function echoRepurposePicks(sessionId, postIds) {
  const ids = (postIds || []).filter(Boolean);
  const posts = ids.map(getTopPost).filter(Boolean);
  if (!posts.length) return [];

  if (pickerStates.has(sessionId)) {
    pickerStates.delete(sessionId);
    notifyPicker(sessionId);
  }

  for (const post of posts) {
    postTopPostPickTurn(sessionId, {
      network: post.network,
      excerpt: post.excerpt,
      perfBadge: post.perfBadge,
      vsAvg: post.vsAvg,
      engagementRate: post.engagementRate,
      impressions: post.impressions,
    });
  }
  return posts.map((p) => p.id);
}

// Normalise a network/platform slug (top posts + social accounts both use "x",
// but be defensive about a stray "twitter").
function normNet(n) {
  const s = (n || "").toLowerCase();
  return s === "twitter" ? "x" : s;
}

// Unique source networks across the picked posts — the profiles the winner(s)
// already live on, which the repurpose target picker excludes.
export function repurposeSourceNetworks(postIds) {
  const posts = (postIds || []).map(getTopPost).filter(Boolean);
  return [...new Set(posts.map((p) => normNet(p.network)).filter((n) => CHANNEL_META[n]))];
}

// Repurpose-target quick-picker items — the user's CONNECTED SOCIAL PROFILES,
// minus the profile(s) the winner already succeeded on (repurposing means
// spreading a win to your OTHER audiences). Presented as profile rows (brand
// avatar + network badge + handle), the same shape as the draft flow's profile
// picker. Falls back to every connected profile if excluding the source would
// leave nothing to pick, so the flow never dead-ends.
export function repurposeProfileItems(postIds) {
  const sourceNets = repurposeSourceNetworks(postIds);
  const connected = getConnectedProfiles();
  const others = connected.filter((p) => !sourceNets.includes(normNet(p.platform)));
  const list = others.length ? others : connected;
  return list.map((p) => ({
    value: p.id,
    label: p.handle,
    caption: [p.platformLabel, p.kind].filter(Boolean).join(" · "),
    avatar: {
      imageUrl: p.photo,
      initials: BRAND_INITIALS,
      networkIcon: NETWORK_ICON_BY_PLATFORM[normNet(p.platform)],
    },
  }));
}

// Human labels for a set of angle values — used by session.js to echo the pick
// as a user turn once the quick-picker unmounts (profiles echo as chips).
export function angleLabels(values) {
  return (values || []).map((v) => ANGLE_CHOICES.find((a) => a.value === v)?.label || v);
}

function truncate(s, n = 60) {
  const t = (s || "").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
}

// Angle variations "extracted" from the picked winner(s) — the four reframings,
// but described in terms of THIS post's own topic + hook so the picker reads as
// suggestions pulled from the post rather than generic labels. Values stay the
// canonical ANGLE_KEYS so executeRepurpose resolves the right ANGLE_COPY body.
// session.js reveals these after a short "reading your post…" loading state.
export function repurposeAngleItems(postIds) {
  const posts = (postIds || []).map(getTopPost).filter(Boolean);
  const multi = posts.length > 1;
  const p = posts[0];
  const topic = p?.topic ? p.topic.toLowerCase() : "this";
  const subject = multi ? "these winners" : `your ${topic} post`;
  const hook = p ? truncate(firstSentence(p.excerpt)) : "";
  return [
    {
      value: "contrarian",
      label: "Contrarian take",
      caption: multi ? "Flip the premise and argue the other side." : `Challenge the idea behind “${hook}”.`,
    },
    {
      value: "howto",
      label: "Actionable how-to",
      caption: `Turn ${subject} into a step-by-step readers can follow today.`,
    },
    {
      value: "story",
      label: "Behind-the-scenes story",
      caption: multi ? "Tell the story behind these results." : `Tell the story that led to ${topic}.`,
    },
    {
      value: "data",
      label: "Data-backed proof",
      caption: `Lead with the number that made ${multi ? "them" : "it"} land.`,
    },
  ];
}

// First sentence of a picked post — used by session.js to name which post the
// current per-post angle step is for.
export function repurposePostHook(postId) {
  const p = getTopPost(postId);
  return p ? truncate(firstSentence(p.excerpt), 70) : "";
}

// ---- Step 3: generate the adapted drafts ------------------------------
//
// Each winner carries its OWN chosen angles (the user picked them post by post),
// so `anglesByPost` is [{ postId, angles: [key] }]. One draft per
// post × its-angles × channel, each body adapted to the target network. Falls
// back sanely if an entry came back empty (all angles / source network). Capped
// at MAX_DRAFTS.
export function executeRepurpose(sessionId, anglesByPost, channels) {
  const entries = (anglesByPost || [])
    .map((e) => ({
      post: getTopPost(e.postId),
      // A key is a known angle OR the user's free-text "Other" instruction —
      // keep both (copyForAngle resolves each). Drop only empties.
      keys: (e.angles || []).map((k) => (k || "").trim()).filter(Boolean),
    }))
    .filter((e) => e.post);
  if (!entries.length) return;

  const pickedChannels = (channels || []).filter((c) => CHANNEL_META[(c || "").toLowerCase()]);

  withPendingChip(
    sessionId,
    () => {
      const drafts = [];
      let capped = false;
      outer: for (const { post, keys } of entries) {
        const chans = pickedChannels.length ? pickedChannels : [post.network];
        const angleKeys = keys.length ? keys : ANGLE_KEYS;
        for (const key of angleKeys) {
          const base = copyForAngle(post, key);
          for (const ch of chans) {
            if (drafts.length >= MAX_DRAFTS) {
              capped = true;
              break outer;
            }
            const draft = addPostDraft(sessionId, {
              network: ch,
              text: adaptForNetwork(base, ch),
              hashtags: adaptHashtags(post.hashtags, ch),
            });
            draft.origin = variationOrigin(post);
            drafts.push(draft);
          }
        }
      }
      postDraftResult(sessionId, {
        ideaTitle: repurposeTitle(
          entries.map((e) => e.post),
          drafts.length,
          capped,
        ),
        drafts,
      });
    },
    (err) => genError(err, () => executeRepurpose(sessionId, anglesByPost, channels)),
  );
}

// Result-turn title: names the source when it's a single winner, counts them
// otherwise, and flags a clipped set so the count never reads as "all of them".
function repurposeTitle(posts, count, capped) {
  const base =
    posts.length === 1
      ? `New takes on your top ${labelFor(posts[0].network)} post`
      : `Fresh takes on ${posts.length} of your top posts`;
  return capped ? `${base} · first ${count}` : base;
}
