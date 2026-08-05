// draft-rewrite — orchestrates the "Regenerate draft" sparkles click into a
// three-phase visual flow:
//
//   T0       click → set isRegenerating + stage=thinking. Card paints
//                    ghost skeleton + mermaid "Rewriting…" pill ; all
//                    other action buttons disabled.
//   T+400ms  stage=streaming. The streamer empties .posts__card-body and
//                    writes tokens directly into the DOM (no notify per
//                    chunk — otherwise the panel subscriber re-renders
//                    and destroys our in-flight stream).
//   T_end    commit text/hashtags/cta + clear flags via one final
//            updatePostContent. The card returns to its stable state with
//            the new canonical content.
//
// Concurrence : posts can stream in parallel. Each running rewrite owns
// an AbortController in inFlight ; a second click on the same post is
// ignored. Session switch, panel close, or any DOM replacement during
// the stream is handled by re-looking up the target selector each tick
// — when it disappears the stream aborts cleanly.

import { getPosts, updatePostContent } from "./posts-store.js?v=45";
import { escapeText } from "./utils.js?v=21";

const inFlight = new Map(); // postId → AbortController

const THINKING_MS = 400;
// Word-fade cadence — fast enough that a full paragraph appears in
// under a second, but slow enough that the eye registers each token
// as a separate fade. The CSS animation on .posts__card-word adds
// 200ms of opacity transition per word, which overlaps with adjacent
// tokens for a smooth "ripple" rather than a discrete typewriter.
const TOKEN_MS_MIN = 8;
const TOKEN_MS_MAX = 18;

export function startRewrite(sessionId, postId, intent = "fresh") {
  if (!sessionId || !postId) return;
  if (inFlight.has(postId)) return;

  const post = getPosts(sessionId).find((p) => p.id === postId);
  if (!post) return;
  // Scheduled posts are locked — rewriting one would invalidate the
  // queue. The card-level UI already greys the action ; this is the
  // guard for direct API calls.
  if (post.status === "scheduled") return;

  const controller = new AbortController();
  inFlight.set(postId, controller);

  const final = fakeRewrite(post, intent);

  // Phase 1 — thinking. Single notify ; the card subscriber paints the
  // skeleton + Rewriting pill on its own.
  updatePostContent(sessionId, postId, {
    isRegenerating: true,
    regenerateStage: "thinking",
  });

  setTimeout(() => {
    if (controller.signal.aborted) return;
    // Phase 2 — streaming. Switch stage so post-card renders an empty
    // body with the caret ; then the streamer types into it directly.
    updatePostContent(sessionId, postId, { regenerateStage: "streaming" });

    streamIntoCard(postId, final, controller.signal).then((completed) => {
      if (!completed || controller.signal.aborted) {
        inFlight.delete(postId);
        return;
      }
      // Phase 3 — commit. Final single notify with the new canonical
      // content + flags cleared. The card re-renders to its stable
      // post-rewrite state.
      updatePostContent(sessionId, postId, {
        text: final.text,
        hashtags: final.hashtags,
        cta: final.cta,
        isRegenerating: false,
        regenerateStage: null,
      });
      inFlight.delete(postId);
    });
  }, THINKING_MS);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Intent-driven transform (alpha feedback #14 — Goldie's "make it shorter /
// longer / warmer" toggles). Keeps hashtags + CTA untouched; reshapes the
// body per intent so the streaming animation shows a believable change:
//   shorter  → condense to the punchiest single line
//   longer   → keep the body, add an elaboration paragraph
//   warmer   → prepend a warm, human opener
//   formal   → prepend a measured, professional opener
//   fresh    → swap the hook + reorder (the original regenerate behaviour)
function fakeRewrite(post, intent = "fresh") {
  const paras = Array.isArray(post.text) ? post.text.filter(Boolean) : [];
  const base = { hashtags: post.hashtags || [], cta: post.cta || "" };
  const network = (post.network || "linkedin").toLowerCase();

  if (intent === "shorter") {
    const joined = paras.join(" ").trim();
    const firstSentence = (joined.match(/[^.!?]*[.!?]/)?.[0] || joined).trim();
    return { ...base, text: [firstSentence || joined].filter(Boolean) };
  }
  if (intent === "longer") {
    const addOn = pick(LONGER_ADDONS[network] || LONGER_ADDONS.linkedin);
    return { ...base, text: [...(paras.length ? paras : [pick(HOOK_POOL[network] || HOOK_POOL.linkedin)]), addOn] };
  }
  if (intent === "warmer") {
    return { ...base, text: [pick(WARMER_HOOKS), ...paras] };
  }
  if (intent === "formal") {
    return { ...base, text: [pick(FORMAL_HOOKS), ...paras] };
  }

  // fresh — swap intro for a new hook and push the old intro to the bottom.
  const hook = pick(HOOK_POOL[network] || HOOK_POOL.linkedin);
  let nextParagraphs;
  if (paras.length === 0) nextParagraphs = [hook];
  else if (paras.length === 1) nextParagraphs = [hook, paras[0]];
  else {
    const [intro, ...rest] = paras;
    nextParagraphs = [hook, ...rest, intro];
  }
  return { ...base, text: nextParagraphs };
}

const WARMER_HOOKS = [
  "Okay, real talk for a second —",
  "I've been sitting with this one, and here's what keeps coming back to me:",
  "Sharing this because it genuinely changed how I think:",
  "This one's close to my heart, so bear with me:",
];

const FORMAL_HOOKS = [
  "A considered take on what the data shows:",
  "Here is our position, stated plainly:",
  "A brief summary of the findings and what they mean:",
  "For those evaluating this closely, the essentials:",
];

const LONGER_ADDONS = {
  linkedin: [
    "Worth adding: the second-order effect is what compounds. The first win is obvious; the durable one shows up three quarters later when the habit has set in.",
    "One more thing I'd flag — the failure mode here is doing it halfway. Commit fully or skip it; the middle ground is where teams quietly lose months.",
  ],
  twitter: ["(And if you've tried this, reply with what broke — the edge cases are the interesting part.)"],
  instagram: [
    "Save this for the next time you're staring at a blank draft — it's the nudge that gets the first line out.",
  ],
  tiktok: ["Stick around to the end — the last step is the one everyone skips and it's the one that matters."],
};

const HOOK_POOL = {
  linkedin: [
    "Here is the part nobody talks about:",
    "I rewrote this for clarity — read it once and tell me what you'd cut.",
    "After 12 months of testing this, here's what actually moved the needle.",
    "This is the version I should have shipped first.",
    "Three things changed when we stopped optimising for the wrong metric.",
  ],
  twitter: [
    "Take two on this — sharper.",
    "Same idea, fewer words.",
    "Rewriting the thread from scratch:",
    "Punchier version below.",
  ],
  instagram: ["Take two — same vibe, cleaner cut.", "Re-framing this one:", "Trying again with less noise."],
  tiktok: ["Round two — same energy, tighter delivery.", "Rewriting the hook:"],
};

// Stream the rewritten content into the live DOM of the target card.
// Returns true if the stream completed, false if it aborted (controller
// fired or target node disappeared during the run).
//
// Approach: append-only. We never rewrite the body's innerHTML during
// the stream — instead we create one <p> per paragraph up-front, then
// append .posts__card-word spans token by token. The CSS animation on
// each span runs once on insertion (no replay), which gives the soft
// per-word fade without the typewriter feel. Faster pacing than
// before so the full body materialises in a fraction of a second.
async function streamIntoCard(postId, final, signal) {
  if (signal.aborted) return false;

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tokens = tokenize(final.text);

  if (reducedMotion) {
    const body = findBody(postId);
    if (!body) return false;
    body.innerHTML = final.text.map((p) => `<p class="posts__card-paragraph">${escapeText(p)}</p>`).join("");
    return true;
  }

  // Set up empty paragraph containers up-front so the streamer can
  // append words into them without touching the surrounding DOM.
  let body = findBody(postId);
  if (!body) return false;
  body.innerHTML = final.text.map(() => `<p class="posts__card-paragraph"></p>`).join("");

  for (const token of tokens) {
    if (signal.aborted) return false;
    body = findBody(postId);
    if (!body) return false;
    const paragraphs = body.querySelectorAll(".posts__card-paragraph");
    const target = paragraphs[token.paragraphIndex];
    if (!target) return false;
    appendWord(target, token.text);
    await wait(TOKEN_MS_MIN + Math.random() * (TOKEN_MS_MAX - TOKEN_MS_MIN));
  }
  return true;
}

function tokenize(paragraphs) {
  const out = [];
  paragraphs.forEach((p, pi) => {
    // Split on whitespace runs, keep separators so the rendered text
    // preserves spacing as the words appear.
    const parts = p.split(/(\s+)/).filter((s) => s.length > 0);
    parts.forEach((part) => {
      out.push({ text: part, paragraphIndex: pi });
    });
  });
  return out;
}

function findBody(postId) {
  return document.querySelector(`[data-post-id="${cssEscape(postId)}"] .posts__card-body`);
}

function appendWord(paragraphEl, text) {
  // Whitespace separator tokens don't need a wrapper — they just slot
  // in as a text node so the surrounding word spans get their natural
  // spacing without an extra element in the flow.
  if (/^\s+$/.test(text)) {
    paragraphEl.appendChild(document.createTextNode(text));
    return;
  }
  const span = document.createElement("span");
  span.className = "posts__card-word";
  span.textContent = text;
  paragraphEl.appendChild(span);
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
