// Mocked conversational AI for the session assistant panel.
//
// Per-session thread state lives in a module-local Map (no persistence). Each
// send pushes a user turn + a placeholder AI turn, then resolves the
// placeholder to a scripted reply after a short simulated thinking delay.
//
// Subscribers re-render the thread DOM on any change — no global store.

import { ideas, threadsBySession as seedThreadsBySession, connectorDocs } from "./mocks.js?v=81";
import { findConnector } from "./connectors-store.js?v=50";
import { createSessionNotifier } from "./store-utils.js?v=2";
import { showToast } from "./components/toast.js?v=20";
import { isFlagOn } from "./feature-flags.js?v=19";

const threads = new Map(); // sessionId → messages[]
const notifier = createSessionNotifier("assistant");

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

export const subscribe = notifier.subscribe;

// Drop all state for a session — used by the conversation-delete flow in
// the sidebar. Subscribers are flushed too; any DOM still mounted will
// get one last empty-thread notify so it can clean up gracefully.
export function clearSession(sessionId) {
  threads.delete(sessionId);
  notifier.clear(sessionId, []);
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
    meta: "Thinking",
    variant: "mermaid",
    text: "Analyzing your request and sources…",
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

  const delay = 6000;
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

// Live connector query — simulates an MCP round-trip against a CONNECTED
// connector (Notion, Slite, …). Mirrors sendMessage's three-turn shape, but
// the reasoning notice is framed as a sequence of MCP tool calls and the
// answer is grounded in (and cites) the connector's mock content. This is the
// "connector = live source" model: the user never pre-imports docs — I query
// the workspace live when asked.
export function sendConnectorMessage(sessionId, connectorId, text) {
  if (!text || !text.trim()) return;
  const connector = findConnector(connectorId);
  // Defensive fallback — a disconnected/unknown connector routes to the
  // generic assistant rather than failing silently.
  if (!connector || connector.status !== "connected") {
    sendMessage(sessionId, text);
    return;
  }

  const thread = getThread(sessionId);
  const reasoningId = newId();
  const replyId = newId();

  thread.push({
    id: newId(),
    role: "user",
    meta: "You",
    text: text.trim(),
    status: "ready",
    createdAt: Date.now(),
  });
  thread.push({
    id: reasoningId,
    role: "system",
    meta: `Querying ${connector.name} via MCP`,
    variant: "mermaid",
    text: `Running ${mcpCallTrace(connector)}…`,
    open: true,
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

  setTimeout(() => {
    const reply = mockConnectorReply(connector, text);
    const reasoning = thread.find((m) => m.id === reasoningId);
    if (reasoning) {
      reasoning.text = reply.reasoning;
      reasoning.status = "ready";
      reasoning.open = false;
    }
    const replyMsg = thread.find((m) => m.id === replyId);
    if (replyMsg) {
      replyMsg.text = reply.text;
      replyMsg.status = "ready";
      replyMsg.hidden = false;
    }
    notify(sessionId);
  }, 5200);
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

// Standalone mermaid system notice — same pill style as the "Drafting"
// reasoning block, but pushed on its own (no surrounding user/AI turns).
// Use for inline status indicators like "Extracting guidelines" while a
// long-running, non-blocking task is in flight. Returns the id so callers
// can flip the pill state to ready via markSystemNoticeReady.
export function postSystemNotice(sessionId, { meta, text = "", variant = "mermaid", open = false } = {}) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "system",
    meta: meta || "Working…",
    variant,
    text,
    open,
    status: "loading",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

export function markSystemNoticeReady(sessionId, id, patch = {}) {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === id);
  if (!msg) return;
  msg.status = "ready";
  if (patch.meta) msg.meta = patch.meta;
  if (patch.text != null) msg.text = patch.text;
  if (patch.open != null) msg.open = patch.open;
  notify(sessionId);
}

// "Connect a service first" prompt — posted when the user pastes a link to a
// connector-backed service (Slite, Notion, Google Docs, …) that isn't
// connected. Renders a card with the service logo, an explanation, and
// Connect / Close actions (see renderConnectPromptTurn in session.js). The
// click delegate connects the connector then retries startUrlImport(url).
// `status`: "pending" → "connected" (resolved) or "dismissed" (hidden).
export function postConnectPrompt(sessionId, { connectorId, connectorName, logo, url, noun = "document" }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "connect-prompt",
    meta: "Archie",
    connectorId,
    connectorName,
    logo,
    url,
    noun,
    status: "pending",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// Resolve a connect-prompt turn — "connected" swaps the card for a compact
// confirmation, "dismissed" removes it from the thread render.
export function markConnectPromptResolved(sessionId, id, status = "connected") {
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.id === id);
  if (!msg) return;
  msg.status = status;
  notify(sessionId);
}

// Right-aligned "Source intake" turn — renders like a user turn but with
// a light electric-blue bubble containing a file icon + filename · size.
// Figma 25:1127/25:1131.
//
// Pass `sourceId` so the renderer can read live `source.status` from
// sources-stream and so `markSourceIntakeReady` can flip this turn from
// loading → ready when processing completes. Status defaults to
// `"loading"` — the upload subscription in session.js calls
// markSourceIntakeReady when sources-stream flips the source to
// Processed.
export function postSourceIntake(sessionId, { kind, filename, size, sourceId, status = "loading" }) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "source-intake",
    meta: "Source intake",
    kind,
    filename,
    size,
    sourceId: sourceId || null,
    status,
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Flip an existing source-intake turn from loading → ready. Lookup by
// sourceId so the caller doesn't have to track message ids.
export function markSourceIntakeReady(sessionId, sourceId) {
  if (!sourceId) return;
  const thread = getThread(sessionId);
  const msg = thread.find((m) => m.role === "source-intake" && m.sourceId === sourceId);
  if (!msg || msg.status === "ready") return;
  msg.status = "ready";
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
    // Carry kind + rationale through so the conversation idea card can show
    // the same kind tag + "Why this idea" rationale as the right-panel card.
    ideas: ideas.map((i) => ({
      id: i.id,
      title: i.title,
      body: i.body,
      kind: i.kind,
      rationale: i.rationale,
    })),
    count: ideas.length,
    status: "ready",
    open: true,
    createdAt: Date.now(),
  });
  notify(sessionId);
  // Completion ping — consistent across every idea-extraction path (bulk /
  // per-row / video analyze / save-the-angle), mirroring how drafts announce
  // "N drafts ready". No action button: the extracted ideas already render
  // inline in the thread as an idea card.
  const n = ideas.length;
  if (isFlagOn("statusActionSnackbars")) showToast(`${n} idea${n === 1 ? "" : "s"} ready`);
}

// Push a "pending" marker to indicate the session is busy (e.g. while a source
// is being extracted). Renders as an inline "Extracting" notice in the thread
// (Figma 25:1413) and also drives the composer status bar via its
// status === "loading" tag. `meta` is the human label shown on the composer
// status bar (e.g. "Extracting ideas", "Generating drafts"); it defaults to a
// generic "Working". Returns an id so the caller can clear the marker when work
// finishes.
export function startPending(sessionId, meta = null) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "pending",
    status: "loading",
    meta: meta || null,
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

// Push a user turn that echoes the picked social profiles visually — a row
// of avatar (+ network badge) + handle chips instead of a plain text bubble.
// `profiles` = raw socialAccounts entries (rendered via renderProfileTag).
export function postUserProfilesTurn(sessionId, profiles) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "profiles",
    meta: "You",
    profiles: Array.isArray(profiles) ? profiles : [],
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Push a user turn that echoes the top post the user chose to build on — a
// compact preview card (network + excerpt + key stats) instead of a truncated
// text bubble. Rendered by renderTopPostPickTurn in session.js. `post` is a
// trimmed copy of the winner (see top-posts-flow.chooseMode).
export function postTopPostPickTurn(sessionId, post) {
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "top-post-pick",
    meta: "You",
    post: post || null,
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
}

// Interactive "top posts" selection widget — the inline (Add-menu) alternative
// to the full-screen studio board. Renders a compact, multi-select list of an
// account's winners directly in the conversation (renderTopPostsWidgetTurn in
// session.js). The selection lives ON the turn object and mutates in place, so
// every thread re-render reflects it (mirrors the source-intake mutate pattern).
export function postTopPostsWidget(sessionId, { network, postIds }) {
  const thread = getThread(sessionId);
  const id = newId();
  thread.push({
    id,
    role: "assistant",
    variant: "top-posts-widget",
    meta: "Archie",
    network: network || null,
    postIds: Array.isArray(postIds) ? postIds.slice() : [],
    selected: [],
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
  return id;
}

// Find the latest still-open (ready) top-posts widget turn for a session.
function activeTopPostsWidget(sessionId) {
  const thread = getThread(sessionId);
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const m = thread[i];
    if (m.variant === "top-posts-widget" && m.status === "ready") return m;
  }
  return null;
}

// Pick a post in the active top-posts widget. SINGLE-select: the clicked post
// becomes the sole selection (clicking the selected one clears it). Returns
// whether the post is now selected. Deliberately does NOT notify() — the caller
// updates the rows in place (like the Quickpicker) so there's no whole-thread
// re-render, image reload, or scroll reset inside the widget list.
export function toggleTopPostsWidgetPick(sessionId, postId) {
  const msg = activeTopPostsWidget(sessionId);
  if (!msg) return false;
  const alreadyOnly = msg.selected.length === 1 && msg.selected[0] === postId;
  msg.selected = alreadyOnly ? [] : [postId];
  return !alreadyOnly;
}

// Freeze the active top-posts widget (status → "answered", disabling further
// selection) and return the chosen post ids so the caller can advance the flow.
export function answerTopPostsWidget(sessionId) {
  const msg = activeTopPostsWidget(sessionId);
  if (!msg) return [];
  msg.status = "answered";
  notify(sessionId);
  return msg.selected.slice();
}

// Generic "you picked this object" echo — a compact icon + title + meta chip in
// the thread, used whenever the user selects a dynamic object (source, idea,
// clip, …) so the pick stays visible like the post / profile echoes do.
// `echo` = { icon, title, meta }. Rendered by renderSelectionEcho in session.js.
export function postSelectionEcho(sessionId, echo) {
  if (!echo || !echo.title) return;
  const thread = getThread(sessionId);
  thread.push({
    id: newId(),
    role: "user",
    variant: "selection-echo",
    meta: "You",
    echo: { icon: echo.icon || "ap-icon-file", title: echo.title, meta: echo.meta || "" },
    status: "ready",
    createdAt: Date.now(),
  });
  notify(sessionId);
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
  // Expose a shallow copy so subscribers can't mutate the thread by accident.
  notifier.notify(sessionId, (threads.get(sessionId) || []).slice());
}

function seedThread(sessionId, { hasContext, skipGreeting }) {
  // Start-flow takes over the intro — skip the default greeting so we don't
  // double up "Hi —" + the flow's first AI turn. Welcome-alt onboarding owns
  // its own intro too (context-builder startAlt); seed it empty regardless of
  // which read (topbar / status card / panel) triggers the seed first, so the
  // chat never opens with a stray greeting above the onboarding message.
  // Clip Studio sessions (clip-studio-*) own their own full-page flow; the
  // clips-stage chat should open empty (no stray greeting above the grid),
  // same as the welcome-alt onboarding.
  if (skipGreeting || sessionId.startsWith("welcome-alt-") || sessionId.startsWith("clip-studio-")) {
    threads.set(sessionId, []);
    return;
  }

  // Demo sessions ship with a scripted thread so opening one looks like
  // a real, mid-flight conversation (source intakes + extractions +
  // user prompt + draft result). Materialised lazily on first read:
  // each turn gets a fresh id + createdAt so the renderer and future
  // mutations behave like any in-flight thread.
  const scripted = seedThreadsBySession?.[sessionId];
  if (Array.isArray(scripted) && scripted.length > 0) {
    const baseTime = Date.now() - scripted.length * 1000;
    threads.set(
      sessionId,
      scripted.map((turn, idx) => ({
        ...turn,
        id: newId(),
        status: turn.status || "ready",
        createdAt: baseTime + idx * 1000,
      })),
    );
    return;
  }

  const greeting = hasContext
    ? "Hi. Want me to compare ideas, pick the strongest one, or draft a post? You can also type a question or drop a source."
    : "Hi. I'll help you pick sources, sharpen ideas, and draft posts. Attach a Playbook any time to make my suggestions sharper.";

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

// Build a fake MCP tool-call trace from a connector's capabilities, e.g.
// "notion.search → notion.read → notion.query". Each capability's leading verb
// becomes a lowercase method on the connector's namespace; reads like a real
// MCP server invocation in the reasoning chip.
function mcpCallTrace(connector) {
  const verb = (cap) => (cap || "").trim().split(/\s+/)[0].toLowerCase() || "call";
  const caps = Array.isArray(connector.capabilities) ? connector.capabilities : [];
  const tools = (caps.length ? caps : ["query"]).slice(0, 3).map((c) => `${connector.id}.${verb(c)}`);
  return tools.join(" → ");
}

// Scripted reply for a live connector query. Grounds the answer in 1–2 items
// from the connector's mock doc pool and cites them, so a simulated MCP query
// reads like it actually pulled from the workspace. Voice stays first-person.
function mockConnectorReply(connector, prompt) {
  const pool = connectorDocs[connector.id] || [];
  const cited = pool.slice(0, Math.min(2, pool.length));
  const lead = cited[0];
  const sourcesBlock = cited.length
    ? `\n\nSources I pulled:\n${cited.map((d) => `• ${d.title} — ${d.kind}`).join("\n")}`
    : "";

  const reasoning = `Called ${connector.name} over MCP — ran ${mcpCallTrace(connector)}. Scanned the workspace and pulled the ${
    cited.length || "most"
  } most relevant item${cited.length === 1 ? "" : "s"} to ground the answer.`;

  // No content to cite — connector is connected but its pool is empty.
  if (!lead) {
    return {
      reasoning,
      text: `I queried ${connector.name} live, but didn't find anything specific to work from yet. Try a more specific ask, or point me at a topic and I'll search again.`,
    };
  }

  const p = prompt || "";
  let body;
  if (/contrarian|angle|hot take|provocative/i.test(p)) {
    body = `Pulling from "${lead.title}", here's a contrarian angle worth posting: take the prevailing assumption it documents and argue the inverse, backed by the specifics inside. That tension is what stops the scroll.`;
  } else if (/summar|tl;?dr|bullet|recap/i.test(p)) {
    body = `Here's the recap from ${connector.name}, drawn mainly from "${lead.title}": the core decision, the reasoning behind it, and the one open question still worth resolving. I can turn any of those three into a post.`;
  } else if (/post|draft|repurpose|content|idea/i.test(p)) {
    body = `Based on "${lead.title}", the most post-worthy thread is the concrete before/after it captures. Let's lead a draft with that specific change — it's believable and it earns the claim.`;
  } else {
    body = `Here's what I found in ${connector.name}, grounded in "${lead.title}": the clearest, most specific point is the one I'd build on. Want me to draft a post from it, or dig into another item?`;
  }

  return { reasoning, text: body + sourcesBlock };
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
        : `I drafted ${batch.length} posts grounded in "${leadIdea.title}". Each is sized for its network and follows the active playbook's tone rules.`,
      batch,
    };
  }

  if (/compare|versus|\bvs\b/i.test(prompt) && otherIdea) {
    const stronger = leadIdea.confidence >= otherIdea.confidence ? leadIdea : otherIdea;
    const weaker = stronger.id === leadIdea.id ? otherIdea : leadIdea;
    return {
      reasoning: `Compared confidence + relevance between "${leadIdea.title}" (${leadIdea.confidence}%) and "${otherIdea.title}" (${otherIdea.confidence}%). Picked the higher-confidence, more specific angle to lead with.`,
      text: `Between "${leadIdea.title}" and "${otherIdea.title}", I'd lead with "${stronger.title}" — clearer proof, higher confidence. Keep "${weaker.title}" as a follow-up draft.`,
    };
  }

  if (/pin|priority|strongest|signal|actionable/i.test(prompt)) {
    return {
      reasoning: `Looked across ${ideaCount} ideas for the one closest to "specific, believable, publishable". "${leadIdea.title}" scored highest on all three.`,
      text: `The strongest idea right now is "${leadIdea.title}" — specific, believable, close to publishable. I'd pin it, pressure-test it against one alternative, then draft the first post.`,
    };
  }

  if (/source|pdf|video|url|attach|add/i.test(prompt)) {
    return {
      reasoning:
        "Reviewed current source coverage and the ideas already extracted — most are derived from marketing-adjacent material.",
      text: "Drop one more source to pressure-test the current idea — ideally something that isn't a marketing post. A transcript, a product retro, or a customer interview moves the needle fastest.",
    };
  }

  return {
    reasoning: `Reviewed session state: ${ideaCount} ideas extracted, strongest being "${leadIdea.title}". No draft in progress.`,
    text: `I can keep working in this chat. My recommendation: confirm the strongest idea in the Ideas panel, then generate a draft so the post stays grounded in the source. "${leadIdea.title}" is the one I'd start with.`,
  };
}
