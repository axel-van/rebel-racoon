// Mocked conversational AI for the session assistant panel.
//
// Per-session thread state lives in a module-local Map (no persistence). Each
// send pushes a user turn + a placeholder AI turn, then resolves the
// placeholder to a scripted reply after a short simulated thinking delay.
//
// Subscribers re-render the thread DOM on any change — no global store.

import { ideas } from "./mocks.js?v=26";

const threads = new Map(); // sessionId → messages[]
const subscribers = new Map(); // sessionId → Set<(messages) => void>

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `m-${Date.now().toString(36)}-${idCounter}`;
}

// --- Public API -----------------------------------------------------------

export function getThread(sessionId, { hasContext = false, skipGreeting = false } = {}) {
  if (!threads.has(sessionId)) {
    seedThread(sessionId, { hasContext, skipGreeting });
  }
  return threads.get(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => {
    const set = subscribers.get(sessionId);
    if (set) set.delete(fn);
  };
}

export function sendMessage(sessionId, text, options = {}) {
  if (!text || !text.trim()) return;
  const thread = getThread(sessionId);

  // System messages (e.g. source intake notices) render inline and don't
  // trigger an AI reply.
  if (options.role === "system") {
    thread.push({
      id: newId(),
      role: "system",
      meta: options.meta || "System",
      variant: options.variant || "grey",
      text: text.trim(),
      open: false,
      status: "ready",
      createdAt: Date.now(),
    });
    notify(sessionId);
    return;
  }

  // Regular user → AI exchange. We push three messages in order:
  //   1. user turn
  //   2. reasoning system-notice (mermaid-accented "Drafting" block) — open
  //      while loading, collapsed after reply
  //   3. placeholder AI bubble — hidden until the reply lands
  const userId = newId();
  const reasoningId = newId();
  const replyId = newId();

  thread.push({
    id: userId,
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  thread.push({
    id: reasoningId,
    role: "system",
    meta: "Drafting",
    variant: "mermaid",
    text: "Thinking through the best next move…",
    open: false,
    status: "loading",
    createdAt: Date.now(),
  });
  thread.push({
    id: replyId,
    role: "assistant",
    meta: "Archie",
    text: "",
    status: "loading",
    hidden: true,
    createdAt: Date.now(),
  });
  notify(sessionId);

  const delay = 900 + Math.round(Math.random() * 600);
  setTimeout(() => {
    const reply = mockAiReply({ prompt: text });
    const reasoning = thread.find((m) => m.id === reasoningId);
    if (reasoning) {
      reasoning.text = reply.reasoning;
      reasoning.status = "ready";
      reasoning.open = false; // collapse after the answer lands
    }
    const replyMsg = thread.find((m) => m.id === replyId);
    if (replyMsg) {
      replyMsg.text = reply.text;
      replyMsg.status = "ready";
      replyMsg.hidden = false;
    }
    notify(sessionId);
    // Lot 16 — when the prompt is "batch-y" (matches the keywords below)
    // we follow the AI text bubble with a Drafts summary turn. session.js's
    // wireAssistantPanel detects new draft messages and auto-opens the
    // right-panel Drafts surface (Lot 4.4 wiring), so the user lands on
    // the editable BatchCards without any extra click.
    if (reply.batch?.length) {
      postDraftResult(sessionId, {
        ideaTitle: leadIdeaTitle(),
        drafts: reply.batch,
      });
    }
  }, delay);
}

// Push a ready-state AI Copilot turn directly (no user turn, no Drafting
// collapsible). Used by library.js to narrate the outcome of an extraction.
export function postAssistantMessage(sessionId, text, { meta = "Archie" } = {}) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    meta,
    text,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Right-aligned "Source intake" turn — renders like a user turn but with a
// light electric-blue bubble containing a file icon + filename · size.
// Figma 25:1127/25:1131.
export function postSourceIntake(sessionId, { kind, filename, size }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "source-intake",
    meta: "Source intake",
    kind,
    filename,
    size,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Structured AI extraction result — Drafting pill ("Extracted N ideas") →
// "Analyzed <filename>" → N idea cards. Figma 25:1053 / 25:1057.
export function postExtractionResult(sessionId, { filename, ideas }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    variant: "extraction",
    meta: "Archie",
    filename,
    ideas: ideas.map((i) => ({ id: i.id, title: i.title, body: i.body })),
    count: ideas.length,
    status: "ready",
    open: true,
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Push a "pending" marker to indicate the session is busy (e.g. while a source
// is being extracted). Renders as an inline "Extracting" notice in the thread
// (Figma 25:1413) and also drives the composer thinking chip via its
// status === "loading" tag. Returns an id so the caller can clear the marker
// when work finishes.
export function startPending(sessionId) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "pending",
    status: "loading",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

export function finishPending(sessionId, id) {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === id);
  if (msg) {
    msg.status = "ready";
  }
  notify(sessionId);
}

// Push only a user bubble — no reasoning chip, no AI placeholder.
// Used by the draft flow so the user sees their intent echoed without
// triggering a generic AI reply.
export function postUserTurn(sessionId, text) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Convenience alias — same implementation as postUserTurn but semantically
// signals "channel selection echo" at call sites.
export function postUserChoice(sessionId, { text }) {
  postUserTurn(sessionId, text);
}

// Push an "assistant-choice" turn that renders a set of toggle chips plus a
// submit button. Keeps the module generic — the handler string identifies
// what the click delegate in session.js should do on submit.
//
// Pass `instant: true` for single-select pickers where each chip click
// immediately fires the handler (no Submit button). Useful for binary
// "pick a path" questions.
export function postAssistantChoice(
  sessionId,
  { text, choices, multi = true, handler = "", context = {}, submitLabel = "Submit", instant = false },
) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant-choice",
    meta: "Archie",
    text,
    choices, // [{ value, label, icon }]
    selected: [],
    multi,
    handler,
    context,
    submitLabel,
    instant,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Freeze a choice message after the user submits — chips become read-only.
export function submitAssistantChoice(sessionId, messageId, selectedValues) {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === messageId);
  if (!msg) return;
  msg.selected = selectedValues;
  msg.status = "answered";
  notify(sessionId);
}

// Inline "Extracting clips → Clips ready" card pinned to a single video
// source. The turn carries the sourceId; the renderer reads the source's
// live clipExtractionStatus / clips count from sources-stream so the same
// turn flips from pending to ready without an extra notify hop.
export function postClipExtractionTurn(sessionId, { sourceId, filename }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "clip-extraction",
    meta: "Archie",
    sourceId,
    filename,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// Structured "Drafted N posts" result turn. Reuses the extraction-turn chrome
// (mermaid pill + collapsible detail) but shows post mini-cards instead of
// idea cards.
export function postDraftResult(sessionId, { ideaTitle, drafts }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "assistant",
    variant: "draft",
    meta: "Archie",
    ideaTitle,
    drafts: drafts.map((d) => ({
      id: d.id,
      network: d.network,
      preview: Array.isArray(d.text) ? d.text[0] : d.text,
    })),
    count: drafts.length,
    status: "ready",
    open: true,
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// --- Internals ------------------------------------------------------------

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  // Expose a shallow copy so subscribers can't mutate the thread by accident.
  const snapshot = threads.get(sessionId).slice();
  set.forEach((fn) => fn(snapshot));
}

function seedThread(sessionId, { hasContext, skipGreeting }) {
  // Start-flow takes over the intro — skip the default greeting so we don't
  // double up "Hi —" + the flow's first AI turn.
  if (skipGreeting) {
    threads.set(sessionId, []);
    return;
  }

  const greeting = hasContext
    ? "Hi — I can compare ideas, pick the strongest signal, or draft a post. Pick a suggestion below, type a question, or drop a source."
    : "Hi — I'll help you pick sources, sharpen angles, and draft posts. Attach a context (Voice, Brief, Brand) any time to make my suggestions sharper.";

  threads.set(sessionId, [
    {
      id: newId(),
      role: "assistant",
      meta: "Archie",
      text: greeting,
      status: "ready",
      createdAt: Date.now(),
    },
  ]);
}

// Lot 16 — scripted batch generators (mirror handoff's defaultBatch /
// launchBatch). Stand-in until a real LLM is wired ; produces a small array
// of {id, network, text} drafts that postDraftResult can attach to a draft
// turn. `lead` is the top idea picked in mockAiReply ; we bias the copy to
// reference its title so the panel feels grounded in the source material.

function defaultBatch(lead) {
  const seed = lead?.title || "your story";
  const stamp = Date.now().toString(36);
  return [
    {
      id: `gen-${stamp}-1`,
      network: "linkedin",
      text: [
        `${seed} — the operator angle.`,
        "Open with the concrete change, add one proof signal from the source, close with a takeaway readers can try this week.",
      ],
    },
    {
      id: `gen-${stamp}-2`,
      network: "twitter",
      text: [`${seed}.`, "One sharp line. No filler."],
    },
    {
      id: `gen-${stamp}-3`,
      network: "instagram",
      text: [
        `${seed} — visual story.`,
        "Carousel-ready: hook → context → 3 beats → CTA. Aim for 1–2 minutes of read time.",
      ],
    },
    {
      id: `gen-${stamp}-4`,
      network: "linkedin",
      text: [
        `Why ${seed.toLowerCase()} matters now.`,
        "Frame as a contrarian read of the room. End with the question we're betting on.",
      ],
    },
    {
      id: `gen-${stamp}-5`,
      network: "twitter",
      text: [`Quick thread on ${seed}. 1/`, "Save the receipt at the end."],
    },
  ];
}

function launchBatch(lead) {
  const seed = lead?.title || "the launch";
  const stamp = Date.now().toString(36);
  const days = ["Day 1 · Tease", "Day 2 · Problem", "Day 3 · Reveal", "Day 4 · Demo", "Day 5 · CTA"];
  const networks = ["linkedin", "twitter", "linkedin", "instagram", "twitter"];
  return days.map((label, i) => ({
    id: `gen-${stamp}-${i + 1}`,
    network: networks[i],
    text: [`${label} — ${seed}.`, label.includes("CTA") ? "30 days free. No card." : "More soon."],
  }));
}

// Returns the title of the lead idea used by mockAiReply, for the
// `ideaTitle` field of the draft turn ("From idea: …" tagline).
let _lastLeadIdeaTitle = "";
function leadIdeaTitle() {
  return _lastLeadIdeaTitle;
}

// Scripted mock replies. Ported from the old prototype (src/mock-generators.js),
// extended to return a { text, reasoning } pair — `reasoning` is shown in the
// mermaid-accented "Drafting" collapsible above the answer.
function mockAiReply({ prompt }) {
  const leadIdea = ideas.find((i) => i.pinned) || ideas[0] || null;
  const otherIdea = ideas.find((i) => i.id !== leadIdea?.id) || null;
  const ideaCount = ideas.length;

  // Cache the lead idea title so postDraftResult's `ideaTitle` field is
  // populated correctly when sendMessage triggers a batch.
  _lastLeadIdeaTitle = leadIdea?.title || "";

  if (!leadIdea) {
    return {
      reasoning: "No sources attached in this session yet, so there's nothing to rank or draft from.",
      text: "I don't have enough source material in this session yet. Add a source first and I can extract ideas, compare angles, or draft a post.",
    };
  }

  // Batch-y prompt keywords — handoff App.jsx generateReply uses the same
  // intent matcher to switch from a text-only reply to a 5-post batch +
  // drafts summary card. We add the same path here so starter prompts
  // ("Pull the strongest moments…", "Plan a 5-day launch…", "Repurpose
  // {{source}} into 8 posts…", "Use {{source}} to draft a customer-story
  // post…") actually produce drafts instead of a generic text reply.
  const isLaunch = /\b(launch|5-?day|week|drumbeat|tease|reveal)\b/i.test(prompt);
  const isBatch =
    isLaunch ||
    /\b(batch|draft|repurpose|moments|pull|schedule|posts?)\b/i.test(prompt) ||
    /linkedin|twitter|\bx\b|instagram|facebook|tiktok/i.test(prompt);

  if (isBatch) {
    const batch = isLaunch ? launchBatch(leadIdea) : defaultBatch(leadIdea);
    return {
      reasoning: `Scanned ${ideaCount} extracted ideas, ranked by confidence and relevance. "${leadIdea.title}" came out on top (${leadIdea.confidence}% confidence) — composing a ${batch.length}-post batch grounded in its source.`,
      text: isLaunch
        ? `Here's a ${batch.length}-day sequence built from "${leadIdea.title}" — one post per day, mixed networks. Open the Drafts panel to review and schedule.`
        : `I drafted ${batch.length} posts grounded in "${leadIdea.title}". Each is sized for its network and follows the active context's tone rules.`,
      batch,
    };
  }

  if (/compare|versus|\bvs\b/i.test(prompt) && otherIdea) {
    const stronger = leadIdea.confidence >= otherIdea.confidence ? leadIdea : otherIdea;
    const weaker = stronger.id === leadIdea.id ? otherIdea : leadIdea;
    return {
      reasoning: `Compared confidence + relevance between "${leadIdea.title}" (${leadIdea.confidence}%) and "${otherIdea.title}" (${otherIdea.confidence}%). Picked the higher-confidence, more specific angle to lead with.`,
      text: `Between "${leadIdea.title}" and "${otherIdea.title}", I'd move forward with "${stronger.title}" first — clearer proof point and a higher confidence signal. Keep "${weaker.title}" as a supporting beat or follow-up draft.`,
    };
  }

  if (/pin|priority|strongest|signal|actionable/i.test(prompt)) {
    return {
      reasoning: `Looked across ${ideaCount} ideas for the one closest to "specific, believable, publishable". "${leadIdea.title}" scored highest on all three.`,
      text: `The strongest signal right now is "${leadIdea.title}" — specific, believable, and close to publishable. I'd pin it, pressure-test it against one secondary angle, then draft the first post.`,
    };
  }

  if (/source|pdf|video|url|attach|add/i.test(prompt)) {
    return {
      reasoning:
        "Reviewed current source coverage and the ideas already extracted — most are derived from marketing-adjacent material.",
      text: "Drop one more source to pressure-test the current angle — ideally something that isn't a marketing post. A transcript, a product retro, or a customer interview will shift the signal fastest.",
    };
  }

  return {
    reasoning: `Reviewed session state: ${ideaCount} ideas extracted, strongest being "${leadIdea.title}". No draft in progress.`,
    text: `I can keep working inside this session. My recommendation: tighten the angle in the Library tab, confirm the strongest idea, then generate a draft so the post stays grounded in the source context. "${leadIdea.title}" is the one I'd start with.`,
  };
}
