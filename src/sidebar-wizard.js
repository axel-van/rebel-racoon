// Sidebar wizard — runs the Voice / Brief / Brand context-building flows
// inside the assistant panel using the same numbered-option-row picker UX
// as the standalone /analyse/* wizards (1–9 keyboard pick, ↑↓ nav, Enter
// submit, Esc exit).
//
// State per session lives in a module-local Map (no persistence). External
// code (session.js) subscribes and re-renders the assistant panel on each
// notify().
//
// Public API:
//   startWizard(sessionId, { stages, onComplete, skipMemorize? })
//                                                    → kick off the flow.
//                                                       skipMemorize=true: bypass
//                                                       the save/name prompts
//                                                       (used by section edits).
//   isActive(sessionId)                              → boolean
//   getState(sessionId)                              → current state or null
//   answer(sessionId, value, custom?)                → advance to next step
//   exit(sessionId)                                  → cancel + clear state
//   subscribe(sessionId, fn)                         → re-render hook
//   renderChrome(sessionId)                          → { body, picker } for
//                                                       the current step
//
// The stage scripts are compact (intake → recap → confirm) so the flow stays
// sidebar-shaped. Each script function returns either:
//   - a string: the next step id
//   - "done": advance to the next stage in `stages`
//   - "exit": cancel the wizard
//
// `body` is HTML (chat turns) and `picker` is the standard picker shape from
// _analyse-common.js (items + handler + optional customPlaceholder).

import { chatTurn, bulletsBlock, fieldsBlock } from "./screens/_analyse-common.js?v=55";
import { voiceAnalysis, strategyBrief, brandTheme } from "./mocks.js?v=88";

// ---- State -----------------------------------------------------------------

const states = new Map(); // sessionId → { stages, stageIdx, step, history, ... }
const subscribers = new Map(); // sessionId → Set<fn>
const completionHandlers = new Map(); // sessionId → fn (called once on memorize)

// ---- Public API ------------------------------------------------------------

export function startWizard(sessionId, { stages, onComplete, skipMemorize = false }) {
  states.set(sessionId, {
    stages,
    stageIdx: 0,
    step: "0",
    history: [], // [{ stage, step, role: 'ai'|'user', text, contentHtml? }] — replayed on each render
    awaitingMemorize: false,
    awaitingMemorizeName: false, // true while we wait for the user to type a context name
    skipMemorize, // when true, completion fires immediately after the last stage (used by section edits)
    isPending: false, // true while a "thinking" notice is displayed between steps
  });
  if (onComplete) completionHandlers.set(sessionId, onComplete);
  notify(sessionId);
}

export function isActive(sessionId) {
  return states.has(sessionId);
}

export function getState(sessionId) {
  return states.get(sessionId) || null;
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => subscribers.get(sessionId)?.delete(fn);
}

export function exit(sessionId) {
  states.delete(sessionId);
  completionHandlers.delete(sessionId);
  notify(sessionId);
}

// Skip the rest of the current stage and jump to the next one. If this was
// the last stage, either swap into the memorize step or, when skipMemorize is
// set (section-edit flows), fire completion immediately.
export function skipStage(sessionId) {
  const state = states.get(sessionId);
  if (!state) return;
  // Phase 2 §8.3: don't echo procedural "Skip" as a <You> bubble. The
  // next stage's AI bubble carries the conversational continuation.
  state.stageIdx += 1;
  state.step = "0";
  if (state.stageIdx >= state.stages.length) {
    if (state.skipMemorize) {
      finishImmediate(sessionId);
      return;
    }
    state.awaitingMemorize = true;
  }
  notify(sessionId);
}

// Fire onComplete + clean up. Used when skipMemorize is set so the wizard
// doesn't prompt the user about saving on a single-stage edit. The caller
// distinguishes section-edit completions from creation by passing
// skipMemorize=true at startWizard.
function finishImmediate(sessionId) {
  const onComplete = completionHandlers.get(sessionId);
  states.delete(sessionId);
  completionHandlers.delete(sessionId);
  notify(sessionId);
  if (onComplete) onComplete({ name: null });
}

export function answer(sessionId, value, custom = null) {
  const state = states.get(sessionId);
  if (!state) return;

  // Name prompt branch — user picked "Name it"; we now expect a typed name
  // in `custom` (the only input row in the picker uses customPlaceholder).
  // If they leave it blank, `name: null` falls back to the caller's default.
  if (state.awaitingMemorizeName) {
    const typed = (custom || (typeof value === "string" ? value : "") || "").trim();
    state.history.push({ role: "user", text: typed || "(skipped — use default name)" });
    const onComplete = completionHandlers.get(sessionId);
    states.delete(sessionId);
    completionHandlers.delete(sessionId);
    notify(sessionId);
    if (onComplete) onComplete({ name: typed || null });
    return;
  }

  // Memorize step — every wizard run produces a saved global context now
  // (the local-context concept was removed). Two paths: "name" pivots into
  // the name prompt; "default" fires onComplete with no name so the caller
  // can pick its own default (typically the session title).
  if (state.awaitingMemorize) {
    if (value === "name") {
      state.history.push({ role: "user", text: "Yes, name it" });
      state.awaitingMemorize = false;
      state.awaitingMemorizeName = true;
      notify(sessionId);
      return;
    }
    // value === "default" — auto-name; caller falls back to the chat title.
    state.history.push({ role: "user", text: "Use default name" });
    const onComplete = completionHandlers.get(sessionId);
    states.delete(sessionId);
    completionHandlers.delete(sessionId);
    notify(sessionId);
    if (onComplete) onComplete({ name: null });
    return;
  }

  const stage = state.stages[state.stageIdx];
  const script = STAGE_SCRIPTS[stage];
  if (!script) return;

  const next = script.handleAnswer(state, value, custom);

  if (next === "done") {
    // Advance to the next stage. If none left, swap into the memorize step
    // (or fire completion immediately when skipMemorize is set).
    state.stageIdx += 1;
    state.step = "0";
    if (state.stageIdx >= state.stages.length) {
      if (state.skipMemorize) {
        finishImmediate(sessionId);
        return;
      }
      state.awaitingMemorize = true;
    }
    notify(sessionId);
    return;
  }

  if (next === "exit") {
    states.delete(sessionId);
    completionHandlers.delete(sessionId);
    notify(sessionId);
    return;
  }

  // Pending directive — script wants to show a "thinking" notice for `ms`
  // milliseconds before advancing to `nextStep`. Used by the voice wizard
  // after the user clicks "Analyze selected" so Archie has a beat to think.
  if (typeof next === "object" && next !== null && next.pending) {
    state.isPending = true;
    notify(sessionId);
    setTimeout(() => {
      const live = states.get(sessionId);
      if (!live || live !== state) return; // wizard was exited mid-pending
      live.isPending = false;
      live.step = next.nextStep;
      notify(sessionId);
    }, next.ms || 6000);
    return;
  }

  state.step = next;
  notify(sessionId);
}

export function renderChrome(sessionId) {
  const state = states.get(sessionId);
  if (!state) return null;

  // Build the body — replay every prior history turn (so the wizard chat
  // grows as the user advances), then append the current step's question.
  const historyHtml = state.history
    .map((h) => chatTurn({ role: h.role, text: h.text, contentHtml: h.contentHtml || "" }))
    .join("");

  if (state.isPending) {
    return {
      body: historyHtml + analyzingNoticeHtml(),
      picker: null,
    };
  }

  if (state.awaitingMemorizeName) {
    return {
      body:
        historyHtml +
        chatTurn({
          role: "ai",
          text: "What should I call this playbook?",
        }),
      picker: MEMORIZE_NAME_PICKER,
    };
  }

  if (state.awaitingMemorize) {
    return {
      body:
        historyHtml +
        chatTurn({
          role: "ai",
          text: "Saving this playbook so you can reuse it. Want to name it, or use the chat's title as the default?",
        }),
      picker: MEMORIZE_PICKER,
    };
  }

  const stage = state.stages[state.stageIdx];
  const script = STAGE_SCRIPTS[stage];
  const stepView = script.renderStep(state);

  return {
    body: historyHtml + stepView.body,
    picker: stepView.picker,
  };
}

// Inline "Analyzing" notice — same chrome as renderExtractingNotice in
// session.js (mermaid status pill + spinner) but with a different label.
// The CSS classes (.chat-turn--extracting, .extracting-notice) live in
// styles/chat.css and are framework-agnostic.
function analyzingNoticeHtml() {
  return `
    <div class="chat-turn chat-turn--ai chat-turn--extracting">
      <div class="extracting-notice">
        <span class="extracting-notice__spinner" aria-hidden="true"></span>
        <span class="ap-status mermaid">Analyzing</span>
      </div>
    </div>
  `;
}

// ---- Internals -------------------------------------------------------------

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  set.forEach((fn) => fn(states.get(sessionId) || null));
}

// ---- Pickers ---------------------------------------------------------------

// Two-option memorize picker — every wizard run saves a global context
// (the local-context concept was removed). User chooses whether to name
// the context or accept a sensible default (the session/chat title).
const MEMORIZE_PICKER = {
  items: [
    { value: "name", label: "Name it", icon: "ap-icon-pen" },
    { value: "default", label: "Use the chat title", icon: "ap-icon-arrow-right" },
  ],
  handler: "wizard-answer",
  title: "Saving this playbook so you can reuse it. Name it, or use the chat title?",
  stepIndicator: "Save playbook",
};

// Custom-input-only picker — items=[] + customPlaceholder makes the input row
// the only thing the user can submit. Enter sends the typed value as `custom`
// in answer(sid, "other", value); the wizard captures it as the context name.
const MEMORIZE_NAME_PICKER = {
  items: [],
  handler: "wizard-answer",
  customPlaceholder: "Name this playbook (e.g. “Founder voice”)…",
  title: "What should I call this playbook?",
  stepIndicator: "Name playbook",
};

// ---- Voice script ----------------------------------------------------------
//
// Steps:
//   0       → intake question (yes/skip)
//   1       → source picker (linkedin/document/already-attached/other)
//   2..N+1  → per-section review (Looks good / Needs work)
//   summary → final voice profile + Looks great / Start over

const VOICE_SECTIONS = voiceAnalysis.sections;

const VOICE_INTAKE = {
  items: [
    { value: "yes", label: "Yes, analyze my writing", icon: "ap-icon-check" },
    { value: "skip", label: "Not yet — skip for now", icon: "ap-icon-arrow-right" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Want me to learn how you write? I'll analyze a profile or a document to match your voice.",
  stepIndicator: "Voice",
  skipLabel: "Skip",
};

const VOICE_SOURCE = {
  items: [
    {
      value: "linkedin",
      label: "Select a social profile",
      icon: "ap-icon-linkedin-official",
      caption: "LinkedIn, X, Threads…",
    },
    { value: "document", label: "Upload a document", icon: "ap-icon-file--text", caption: "PDF, DOCX, Markdown" },
    { value: "done", label: "Use the sources already attached", icon: "ap-icon-archie-official" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Which profile should I analyze?",
  stepIndicator: "Voice",
  skipLabel: "Skip",
};

// Mocked social profiles — shown when the user picks "Select a social
// profile" in the source picker. Captions show network + lightweight stats
// (followers, last-post recency) so the picker reads like a real account
// switcher. Multi-select so the user can analyse several voices at once.
const VOICE_PROFILE = {
  items: [
    {
      value: "profile-linkedin-maya",
      label: "linkedin.com/in/maya-chen",
      icon: "ap-icon-linkedin-official",
      caption: "LinkedIn · 1.2k followers · last post 3 days ago",
    },
    {
      value: "profile-x-maya",
      label: "@mayachen_",
      icon: "ap-icon-twitter-official",
      caption: "X · 843 followers · last post 1 week ago",
    },
    {
      value: "profile-instagram-maya",
      label: "@maya.chen",
      icon: "ap-icon-instagram-official",
      caption: "Instagram · 412 followers · last post 2 weeks ago",
    },
  ],
  handler: "wizard-answer",
  multi: true,
  submitLabel: "Analyze selected",
  title: "Pick a profile to analyze:",
  stepIndicator: "Voice",
  skipLabel: "Skip",
};

const VOICE_PROFILE_LABELS = Object.fromEntries(VOICE_PROFILE.items.map((it) => [it.value, it.label]));

// Per-section picker — voice section reviews. The title and stepIndicator
// are stamped onto a per-step copy so the indicator reads "3 of 7" etc.
const VOICE_SECTION_PICKER_BASE = {
  items: [{ value: "good", label: "Looks good, continue", icon: "ap-icon-rounded-check" }],
  handler: "wizard-answer",
  customPlaceholder: "Define your own writing style…",
  skipLabel: "Skip",
};

const VOICE_SUMMARY = {
  items: [
    { value: "yes", label: "Yes, looks good", icon: "ap-icon-rounded-check" },
    { value: "no", label: "No — start over", icon: "ap-icon-refresh" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Here's your full voice profile. Keep it or start over.",
  stepIndicator: "Voice review",
  skipLabel: "Skip",
};

const voiceScript = {
  renderStep(state) {
    const step = state.step;

    if (step === "0") {
      return {
        body: chatTurn({
          role: "ai",
          text: "Want me to learn how you write? I'll analyze a profile or a document to match your voice.",
        }),
        picker: VOICE_INTAKE,
      };
    }
    if (step === "1") {
      return {
        body: chatTurn({ role: "ai", text: "Which profile should I analyze?" }),
        picker: VOICE_SOURCE,
      };
    }
    if (step === "1.profile") {
      return {
        body: chatTurn({ role: "ai", text: "Pick a profile to analyze:" }),
        picker: VOICE_PROFILE,
      };
    }
    if (step === "summary") {
      return {
        body: chatTurn({
          role: "ai",
          text: "Here's your full voice profile. Keep it or start over.",
          contentHtml: bulletsBlock(VOICE_SECTIONS.flatMap((s) => s.bullets)),
        }),
        picker: VOICE_SUMMARY,
      };
    }

    const idx = Number(step);
    const sectionIdx = idx - 2;
    const section = VOICE_SECTIONS[sectionIdx];
    if (!section) return { body: "", picker: VOICE_INTAKE };

    const sectionQuestion = `Here's what I'm hearing in the ${section.title.toLowerCase()} (${sectionIdx + 1} of ${VOICE_SECTIONS.length}). Does it fit?`;

    return {
      body: chatTurn({
        role: "ai",
        text: sectionQuestion,
        contentHtml: bulletsBlock(section.bullets),
      }),
      picker: {
        ...VOICE_SECTION_PICKER_BASE,
        title: sectionQuestion,
        stepIndicator: `${sectionIdx + 1} of ${VOICE_SECTIONS.length}`,
      },
    };
  },

  handleAnswer(state, value) {
    const step = state.step;

    if (step === "0") {
      if (value === "skip") {
        // User skipped — just move on to the next stage.
        state.history.push({ role: "user", text: "Not yet — skip for now" });
        return "done";
      }
      state.history.push({ role: "user", text: "Yes, analyze my writing" });
      return "1";
    }
    if (step === "1") {
      const labelMap = {
        linkedin: "Select a social profile",
        document: "Upload a document",
        done: "Use the sources already attached",
      };
      state.history.push({ role: "user", text: labelMap[value] || "Other" });
      // Branch into the profile picker only for the social-profile path.
      // Document + already-attached + custom answers go straight to the
      // per-section review.
      if (value === "linkedin") return "1.profile";
      return "2";
    }
    if (step === "1.profile") {
      // Multi-select — value is an array of profile ids. Echo every picked
      // profile, joined with commas, then run a brief "Analyzing" pending
      // state before opening the per-section review.
      const values = Array.isArray(value) ? value : [value];
      const echoed = values.map((v) => VOICE_PROFILE_LABELS[v] || v).join(", ");
      state.history.push({ role: "user", text: echoed });
      return { pending: true, nextStep: "2", ms: 2000 };
    }
    if (step === "summary") {
      state.history.push({ role: "user", text: value === "yes" ? "Yes, looks good" : "Start over" });
      return "done";
    }

    // value === "good"   → "Looks good, continue"
    // value === "other"  → custom holds the typed-style answer; echo it verbatim
    const echo = value === "good" ? "Looks good, continue" : custom || "Define your own writing style";
    state.history.push({ role: "user", text: echo });
    const idx = Number(step);
    const nextIdx = idx + 1;
    if (nextIdx - 2 >= VOICE_SECTIONS.length) return "summary";
    return String(nextIdx);
  },
};

// ---- Brief script (compact: intake + summary) ------------------------------

const BRIEF_SECTIONS = strategyBrief.sections;

const BRIEF_INTAKE = {
  items: [
    { value: "yes", label: "Yes, capture my strategy", icon: "ap-icon-check" },
    { value: "skip", label: "Skip for now", icon: "ap-icon-arrow-right" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Want me to capture the brief? I'll set goals, audience, and brand voice for this chat.",
  stepIndicator: "Brief",
  skipLabel: "Skip",
};

const BRIEF_SUMMARY_PICKER = {
  items: [
    { value: "yes", label: "Yes, that's right", icon: "ap-icon-rounded-check" },
    { value: "no", label: "Refine the brief", icon: "ap-icon-refresh" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Here's your brief. Keep it or refine.",
  stepIndicator: "Brief review",
  skipLabel: "Skip",
};

const briefScript = {
  renderStep(state) {
    const step = state.step;

    if (step === "0") {
      return {
        body: chatTurn({
          role: "ai",
          text: "Want me to capture the brief? I'll set goals, audience, and brand voice for this chat.",
        }),
        picker: BRIEF_INTAKE,
      };
    }
    if (step === "summary") {
      const fields = BRIEF_SECTIONS.flatMap((s) =>
        s.fields.map((f) => ({ label: `${s.title}: ${f.label}`, value: f.value })),
      );
      return {
        body: chatTurn({
          role: "ai",
          text: "Here's your brief. Keep it or refine.",
          contentHtml: fieldsBlock(fields),
        }),
        picker: BRIEF_SUMMARY_PICKER,
      };
    }
    return { body: "", picker: BRIEF_INTAKE };
  },

  handleAnswer(state, value) {
    const step = state.step;

    if (step === "0") {
      if (value === "skip") {
        state.history.push({ role: "user", text: "Skip for now" });
        return "done";
      }
      state.history.push({ role: "user", text: "Yes, capture my strategy" });
      return "summary";
    }
    if (step === "summary") {
      state.history.push({ role: "user", text: value === "yes" ? "That's right" : "Refine the brief" });
      return "done";
    }
    return "0";
  },
};

// ---- Brand script (compact: intake + summary) ------------------------------

const BRAND_INTAKE = {
  items: [
    { value: "yes", label: "Yes, pull my brand", icon: "ap-icon-check" },
    { value: "skip", label: "Skip for now", icon: "ap-icon-arrow-right" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Want me to pull your Branding? I'll grab colors, imagery, and personality from your site.",
  stepIndicator: "Branding",
  skipLabel: "Skip",
};

const BRAND_SUMMARY_PICKER = {
  items: [
    { value: "yes", label: "Yes, that's the brand", icon: "ap-icon-rounded-check" },
    { value: "no", label: "Refine Branding", icon: "ap-icon-refresh" },
  ],
  handler: "wizard-answer",
  customPlaceholder: "Something else — type your answer…",
  title: "Here's what I pulled from your brand. Keep it or tweak.",
  stepIndicator: "Brand review",
  skipLabel: "Skip",
};

function brandSummaryHtml() {
  const colorList = brandTheme.colors
    .map(
      (c) =>
        `<li><span class="chat-bubble-color-swatch" style="background:${c.hex}"></span> ${c.name} <span class="muted">${c.hex}</span></li>`,
    )
    .join("");
  return `
    <div class="chat-bubble-card"><strong>Colors</strong><ul class="chat-bubble-color-list">${colorList}</ul></div>
    <div class="chat-bubble-card"><strong>Personality</strong><div class="chat-bubble-tags">${brandTheme.personality.map((p) => `<span class="ap-tag grey">${p}</span>`).join("")}</div></div>
    <div class="chat-bubble-card"><strong>Imagery</strong><ul class="chat-bubble-imagery-list">${brandTheme.imageryNotes.map((n) => `<li>${n}</li>`).join("")}</ul></div>
  `;
}

const brandScript = {
  renderStep(state) {
    const step = state.step;
    if (step === "0") {
      return {
        body: chatTurn({
          role: "ai",
          text: "Want me to pull your Branding? I'll grab colors, imagery, and personality from your site.",
        }),
        picker: BRAND_INTAKE,
      };
    }
    if (step === "summary") {
      return {
        body: chatTurn({
          role: "ai",
          text: "Here's what I pulled from your brand. Keep it or tweak.",
          contentHtml: brandSummaryHtml(),
        }),
        picker: BRAND_SUMMARY_PICKER,
      };
    }
    return { body: "", picker: BRAND_INTAKE };
  },

  handleAnswer(state, value) {
    const step = state.step;
    if (step === "0") {
      if (value === "skip") {
        state.history.push({ role: "user", text: "Skip for now" });
        return "done";
      }
      state.history.push({ role: "user", text: "Yes, pull my brand" });
      return "summary";
    }
    if (step === "summary") {
      state.history.push({ role: "user", text: value === "yes" ? "That's the Brand" : "Refine Branding" });
      return "done";
    }
    return "0";
  },
};

const STAGE_SCRIPTS = {
  voice: voiceScript,
  brief: briefScript,
  brand: brandScript,
};
