// Conversational context-builder orchestrator.
//
// Runs the create-context flow inside a per-"session" context (the screen
// passes any unique id — usually a one-off id like "context-builder-…"
// since the flow is dissociated from chat sessions). Three phases:
//
//   1. Inline Q1 (URL)        — free-text via inline-question (custom row only)
//   2. Inline Q2 (profiles)   — multi-pick via inline-question (multi: true)
//   3. Right-panel form        — multi-question form, name + Save in footer
//
// Holds the in-progress draft (URL, profiles, per-field answers, name).
// Calls into right-panel via openContextForm() once the inline phase is done,
// and into contexts-store#addContext() on save.

import * as inlineQuestion from "./inline-question.js?v=21";
import { postAssistantMessage, postUserTurn } from "./assistant.js?v=23";
import * as rightPanel from "./components/right-panel.js?v=38";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=24";
import { emptyAnswers } from "./context-questions.js?v=20";

// Mock social profiles offered for analysis. Identical seed to the one used
// by sidebar-wizard.js so the picker reads consistent across surfaces.
const MOCK_PROFILES = [
  {
    value: "profile-linkedin-maya",
    label: "linkedin.com/in/maya-chen",
    icon: "ap-icon-linkedin",
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
    icon: "ap-icon-instagram",
    caption: "Instagram · 412 followers · last post 2 weeks ago",
  },
];

// Per-session draft store + subscribers (the /contexts/new screen subscribes
// so it can repaint the assistant chat when state advances).
const drafts = new Map(); // sessionId → { url, profiles[], answers, name }
const subscribers = new Map(); // sessionId → Set<fn>

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch (err) {
      console.warn("[context-builder] subscriber threw", err);
    }
  }
}

export function isActive(sessionId) {
  return drafts.has(sessionId);
}

export function getDraft(sessionId) {
  return drafts.get(sessionId) || null;
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => subscribers.get(sessionId)?.delete(fn);
}

// Kick off the flow. Optional onComplete is called with the saved Context
// after the user clicks Save (the screen typically uses it to navigate
// away from /contexts/new).
export function start(sessionId, { onComplete } = {}) {
  drafts.set(sessionId, {
    url: "",
    profiles: [],
    answers: emptyAnswers(),
    name: "",
    editingId: null,
    onComplete: onComplete || null,
  });
  notify(sessionId);
  askUrl(sessionId);
}

// Open the right-panel context-form on an existing context in read mode.
// onEnterEdit (triggered by the Edit footer button) seeds an editable draft
// from the same context and re-opens the form in edit mode.
export function openRead(contextId) {
  rightPanel.openContextForm({
    mode: "read",
    getCtx: () => getContextById(contextId),
    onEnterEdit: () => startEdit(contextId),
  });
}

// Skip the conversational phase and open the form directly populated with
// an existing context's values. Save flows back through updateContext()
// instead of addContext() so the original context id is preserved.
export function startEdit(contextId) {
  const ctx = getContextById(contextId);
  if (!ctx) return;
  const sessionId = `context-edit-${contextId}-${Date.now()}`;
  drafts.set(sessionId, {
    url: "",
    profiles: [],
    answers: {
      brandName: ctx.brandName || "",
      audience: ctx.audience || "",
      tones: Array.isArray(ctx.tones) ? ctx.tones.slice() : [],
      doRules: Array.isArray(ctx.doRules) ? ctx.doRules.slice() : [],
      dontRules: Array.isArray(ctx.dontRules) ? ctx.dontRules.slice() : [],
      briefSummary: ctx.briefSummary || "",
      cta: ctx.cta || "",
      color: ctx.color || "orange",
    },
    name: ctx.name || "",
    editingId: contextId,
    onComplete: null,
  });
  openForm(sessionId);
}

export function cancel(sessionId) {
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
}

// --- Phase 1 — URL ---------------------------------------------------------

function askUrl(sessionId) {
  postAssistantMessage(sessionId, "Let's set up a new context. What's the URL of your website?");
  inlineQuestion.ask(sessionId, {
    title: "What's the URL of your website?",
    stepLabel: "Step 1 of 2",
    items: [],
    customPlaceholder: "https://your-brand.com",
    onCustom: (value) => setUrl(sessionId, value),
    onSkip: () => setUrl(sessionId, ""),
    skipLabel: "Skip",
  });
}

function setUrl(sessionId, url) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.url = (url || "").trim();
  postUserTurn(sessionId, d.url || "Skip");
  notify(sessionId);
  askProfiles(sessionId);
}

// --- Phase 2 — Profiles ----------------------------------------------------

function askProfiles(sessionId) {
  postAssistantMessage(sessionId, "Which social profiles should I analyse to learn the brand voice?");
  inlineQuestion.ask(sessionId, {
    title: "Pick the profiles to analyse",
    stepLabel: "Step 2 of 2",
    items: MOCK_PROFILES,
    multi: true,
    submitLabel: "Open the questionnaire",
    onPick: (values) => setProfiles(sessionId, values),
    onSkip: () => setProfiles(sessionId, []),
    skipLabel: "Skip",
  });
}

function setProfiles(sessionId, values) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.profiles = Array.isArray(values) ? values.slice() : [];
  const labels = d.profiles.map((v) => MOCK_PROFILES.find((p) => p.value === v)?.label || v).join(", ");
  postUserTurn(sessionId, labels || "Skip");
  notify(sessionId);
  postAssistantMessage(
    sessionId,
    "Got it — I've prepared a few questions in the panel on the right. Pick the answers that fit and add anything missing.",
  );
  openForm(sessionId);
}

// --- Phase 3 — Right-panel form -------------------------------------------

function openForm(sessionId) {
  rightPanel.openContextForm({
    mode: "edit",
    getDraft: () => {
      const d = drafts.get(sessionId);
      return d ? { name: d.name, answers: d.answers } : { name: "", answers: emptyAnswers() };
    },
    onAnswer: (field, value) => setAnswer(sessionId, field, value),
    onName: (name) => setName(sessionId, name),
    onSave: () => save(sessionId),
    onCancel: () => cancel(sessionId),
  });
}

export function setAnswer(sessionId, field, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.answers[field] = value;
  notify(sessionId);
  rightPanel.refreshContextForm();
}

export function setName(sessionId, name) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.name = name || "";
  notify(sessionId);
  // Don't refreshContextForm here — typing in the name input would lose
  // focus on every keystroke. The panel handles its own enable/disable
  // toggle on the Save button via a localized DOM tweak.
}

export function save(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return;
  const name = (d.name || "").trim();
  if (!name) return; // Save button is disabled in this state, but defensive.
  const saved = d.editingId
    ? updateContext(d.editingId, { name, ...d.answers, updatedAt: "just now" })
    : addContext({ name, ...d.answers });
  const onComplete = d.onComplete;
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  // Close the panel without firing onCancel — the draft was just persisted
  // so the cancel path (which would discard it again) doesn't apply.
  rightPanel.closeContextFormSilently();
  if (onComplete) onComplete(saved);
}
