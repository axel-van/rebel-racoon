// Catalog of questions surfaced in the right-panel context-form.
//
// Each question maps onto a field of the Context model (see mocks.js#contexts
// and contexts-store.js#addContext). The form panel iterates this list to
// render groups (label + hint + chip row / input) and the context-builder
// orchestrator stores answers under the same field name so saving is a
// straight `addContext({ ...answers })`.
//
// Question types:
//   text             — single-line free input
//   textarea         — multi-line free input
//   chips-radio      — pick exactly one value (and optionally type "Other…")
//   chips-multi      — pick zero or more values (toggle), allows "Other…" too
//   chips-multi-add  — same as chips-multi but the "Other…" row appends a
//                      free-form chip instead of replacing the selection (used
//                      for do/don't rules where each entry is a sentence).

export const CONTEXT_QUESTIONS = [
  {
    id: "brandName",
    field: "brandName",
    type: "text",
    label: "What's the brand name?",
    hint: "Shown on every chat that uses this context.",
    placeholder: "e.g. Acme",
  },
  {
    id: "audience",
    field: "audience",
    type: "textarea",
    label: "Who is the primary audience?",
    hint: "Affects tone and how much background context to include.",
    placeholder: "e.g. Operators and marketing leads at 50–200-person B2B startups.",
  },
  {
    id: "tones",
    field: "tones",
    type: "chips-multi",
    label: "Tone of voice",
    hint: "Pick up to three. Archie blends them.",
    options: [
      "Direct",
      "Professional",
      "Friendly",
      "Bold",
      "Witty",
      "Conversational",
      "Authoritative",
      "Inspirational",
      "Operator-first",
    ],
    allowOther: true,
    max: 3,
  },
  {
    id: "doRules",
    field: "doRules",
    type: "chips-multi-add",
    label: "Do rules",
    hint: "Things Archie should always do when drafting.",
    options: [
      "Use 'we' and 'you' — never third person",
      "Open with a hook or specific number",
      "End every post with a clear next step",
      "Quote customers directly when possible",
    ],
    allowOther: true,
    addPlaceholder: "Add a Do rule…",
  },
  {
    id: "dontRules",
    field: "dontRules",
    type: "chips-multi-add",
    label: "Don't rules",
    hint: "Things to avoid.",
    options: [
      "No emoji in B2B contexts",
      "Avoid jargon (synergy, leverage, 10x)",
      "No clickbait cliffhangers",
      "No hashtags",
    ],
    allowOther: true,
    addPlaceholder: "Add a Don't rule…",
    accent: "red",
  },
  {
    id: "briefSummary",
    field: "briefSummary",
    type: "textarea",
    label: "Strategy in one sentence",
    hint: "What is this context trying to achieve?",
    placeholder: "e.g. Drive awareness for our Q3 launch by leading with concrete outcomes.",
  },
  {
    id: "cta",
    field: "cta",
    type: "text",
    label: "Default call-to-action",
    hint: "Optional. Used when the post warrants one.",
    placeholder: "e.g. Try Acme free for 30 days.",
  },
  {
    id: "color",
    field: "color",
    type: "chips-radio",
    label: "Color tag",
    hint: "Used to spot this context at a glance across the app.",
    options: ["orange", "blue", "green", "purple", "red", "yellow"],
  },
];
