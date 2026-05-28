// Inline single-question picker — renders inside the assistant panel using
// the same numbered-option-row UX as the analyse-* wizards. Reusable for any
// "pick one of N options before continuing" prompt: which social profile,
// which language, which tone, etc.
//
// Sibling of sidebar-wizard.js but for one-shot questions (no multi-stage
// flow). Both share the wizardChrome + renderPicker rendering primitives,
// keyboard nav, and the "session__assistant--wizard" chrome in session.js.
//
// Public API:
//   ask(sessionId, opts)     → show the question; opts described below
//   pick(sessionId, value)   → resolve with the chosen value
//   submitMulti(sessionId, valuesArray) → resolve with the selected values (multi mode)
//   submitCustom(sessionId, value) → resolve with a free-text answer
//   skip(sessionId)          → call onSkip and exit
//   exit(sessionId)          → just clear state (no callbacks)
//   isActive(sessionId)      → boolean
//   getState(sessionId)      → current state or null
//   renderChrome(sessionId)  → { body, picker } for the current question
//   subscribe(sessionId, fn) → re-render hook
//
// Options accepted by ask():
//   intro             string  — assistant message rendered above the picker
//   title             string  — question header inside the picker card
//   stepLabel         string  — small label on the top right (e.g. "Profile")
//   skipLabel         string  — label on the Skip button (default "Skip")
//   items             array   — [{ value, label, caption?, icon?, imgSrc? }]
//   multi             bool    — when true, render multi-select toggles + Continue button
//   defaultSelected   array   — values to render pre-selected (multi mode only)
//   submitLabel       string  — multi-select submit button label (default "Continue")
//   customPlaceholder string  — when set, render a free-text option row
//   customValue       string  — initial value for the free-text input (pre-fill)
//   customFile        bool    — when true, render a dropzone row instead of a text input
//   customFileAccept  string  — accept attribute for the dropzone <input type=file>
//   customFileLabel   string  — primary label on the dropzone row
//   customFileHint    string  — small hint below the label ("PDF · DOCX · TXT")
//   customFileIcon    string  — DS icon class (default "ap-icon-upload")
//   onPick(value)     fn      — called with the chosen item's value (or array in multi mode)
//   onCustom(value)   fn      — called with the free-text answer
//   onFile(file)      fn      — called with the picked File object
//   onSkip()          fn      — called when Skip / Esc; if omitted, no skip btn
//   onBack()          fn      — called when ← Back is clicked; if omitted, no back btn

import { chatTurn } from "./screens/_analyse-common.js?v=33";

const states = new Map(); // sessionId → opts
const subscribers = new Map(); // sessionId → Set<fn>

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function ask(sessionId, opts) {
  states.set(sessionId, opts);
  notify(sessionId);
}

export function pick(sessionId, value) {
  const s = states.get(sessionId);
  if (!s) return;
  states.delete(sessionId);
  notify(sessionId);
  s.onPick?.(value);
}

export function submitMulti(sessionId, values) {
  const s = states.get(sessionId);
  if (!s) return;
  states.delete(sessionId);
  notify(sessionId);
  s.onPick?.(values);
}

export function submitCustom(sessionId, value) {
  const s = states.get(sessionId);
  if (!s) return;
  states.delete(sessionId);
  notify(sessionId);
  if (s.onCustom) s.onCustom(value);
  else s.onPick?.(value);
}

// File-upload variant — wired by session.js when the dropzone row's
// hidden <input type=file> fires `change`. Mirrors submitCustom but
// hands a File object to onFile.
export function submitFile(sessionId, file) {
  const s = states.get(sessionId);
  if (!s) return;
  states.delete(sessionId);
  notify(sessionId);
  s.onFile?.(file);
}

export function skip(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  // Esc / Skip falls back to Back when the current step doesn't offer a
  // skip (e.g. the URL / file / profile input steps that need *something*
  // from the user — Back returns to the previous step rather than
  // leaving the wizard in a dangling state).
  const cb = s.onSkip || s.onBack;
  states.delete(sessionId);
  notify(sessionId);
  cb?.();
}

// Back — same lifecycle as skip but for the multi-step wizard's
// "return to the previous step" affordance. The previous step's
// `ask()` will re-set the state; we just clear current and notify.
export function back(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  const cb = s.onBack;
  states.delete(sessionId);
  notify(sessionId);
  cb?.();
}

export function exit(sessionId) {
  if (!states.has(sessionId)) return;
  states.delete(sessionId);
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

export function renderChrome(sessionId) {
  const s = states.get(sessionId);
  if (!s) return null;
  const body = s.intro ? chatTurn({ role: "ai", text: s.intro }) : "";
  const picker = {
    items: s.items || [],
    handler: "inline-question",
    title: s.title || null,
    stepIndicator: s.stepLabel || null,
    skipLabel: s.onSkip ? s.skipLabel || "Skip" : null,
    showBack: !!s.onBack,
    customPlaceholder: s.customPlaceholder || null,
    customValue: s.customValue || "",
    customFile: s.customFile === true,
    customFileAccept: s.customFileAccept || "",
    customFileLabel: s.customFileLabel || "Drop a file here, or click to browse",
    customFileHint: s.customFileHint || "",
    customFileIcon: s.customFileIcon || "ap-icon-upload",
    multi: s.multi === true,
    defaultSelected: Array.isArray(s.defaultSelected) ? s.defaultSelected : [],
    submitLabel: s.submitLabel || "Continue",
    // Pass-through for callers that want to inject custom buttons in
    // the picker footer (used by the playbook editor for Cancel + Save).
    footerSlot: s.footerSlot || "",
  };
  return { body, picker };
}
