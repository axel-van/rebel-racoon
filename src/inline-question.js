// Inline single-question picker — renders inside the assistant panel using
// the same numbered-option-row UX as the analyse-* wizards. Reusable for any
// "pick one of N options before continuing" prompt: which social profile,
// which language, which tone, etc.
//
// Sibling of sidebar-wizard.js but for one-shot questions (no multi-stage
// flow). Both share the renderPicker rendering primitive, keyboard nav, and
// the "session__assistant--wizard" chrome in session.js.
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
//   subtitle          string  — optional helper line under the title (what to do)
//   stepLabel         string  — small label on the top right (e.g. "Profile")
//   skipLabel         string  — label on the Skip button (default "Skip")
//   items             array   — [{ value, label, caption?, icon?, imgSrc?, counter? }]
//                               a row with `counter: true` carries an inline
//                               −/+ version stepper even in single-select mode;
//                               clicking the row advances and onPick gets its
//                               count as a 2nd arg (clamped by countMin/countMax)
//   variant           string  — "cards" renders items as a visual card grid
//                               (preview + label + caption per card) instead of
//                               numbered rows; single-select advance. Each item
//                               may carry `preview` (trusted HTML for the visual).
//   cardCols          number  — fix the card grid's column count (else auto-fit)
//   footerAction      object  — { value, label, icon? } — a prominent button in
//                               the cards footer that resolves via onPick(value)
//                               (e.g. "No subtitles" beneath the style grid)
//   multi             bool    — when true, render multi-select toggles + Continue button
//   single            bool    — single-select-with-confirm: rows highlight (one
//                               at a time) instead of advancing; the CALLER owns
//                               the submit (e.g. a Next button → submitSingle).
//                               `selected` seeds the initial highlight.
//   defaultSelected   array   — values to render pre-selected (multi mode only)
//   submitLabel       string  — multi-select submit button label (default "Continue")
//   stepper           bool    — per-row count steppers; each row carries its
//                               own count (0 opts it out) and the submit sums them
//   defaultCount      number  — initial per-item count in stepper mode (default 1)
//   countMin/countMax number  — clamp range in stepper mode (default 1 / 20)
//   submitCountLabel  fn(total) — submit button label given the summed total
//                               (stepper mode); onPick gets { picks:[{value,count}], total }
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

import { chatTurn } from "./screens/_analyse-common.js?v=54";

const states = new Map(); // sessionId → opts
const subscribers = new Map(); // sessionId → Set<fn>

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function ask(sessionId, opts) {
  // Stepper mode — each item carries an adjustable count and the user picks
  // ONE item, then submits with its count (e.g. "Generate N drafts" from a
  // chosen angle). Seed the mutable per-item counts + the initial selection.
  if (opts.stepper) {
    const def = opts.defaultCount ?? 1;
    opts._counts = {};
    for (const it of opts.items || []) opts._counts[it.value] = def;
    opts._selected = opts.items?.[0]?.value ?? null;
  } else if (opts.single) {
    // Single-select-with-confirm — one highlighted row, confirmed by a separate
    // submit affordance (e.g. a "Next" button). Track the selection here so it
    // survives re-renders (the picker chrome re-reads `_selected`).
    opts._selected = opts.selected ?? opts.defaultSelected?.[0] ?? null;
  } else if ((opts.items || []).some((it) => it.counter)) {
    // A single-select picker can still carry inline counters on individual
    // rows (e.g. the "Same profile" repurpose row): seed a count for each such
    // row so the −/+ have state, without switching to full stepper mode.
    const def = opts.defaultCount ?? 1;
    opts._counts = {};
    for (const it of opts.items || []) if (it.counter) opts._counts[it.value] = it.count ?? def;
  }
  states.set(sessionId, opts);
  notify(sessionId);
}

// Stepper mode — set the active item (clicking a row or pressing its digit).
export function stepSelect(sessionId, value) {
  const s = states.get(sessionId);
  if (!s || !s.stepper) return;
  s._selected = value;
  notify(sessionId);
}

// Single-select mode — highlight a row without advancing (the caller confirms
// via its own submit, e.g. a "Next" button). Re-render reflects the highlight.
export function singleSelect(sessionId, value) {
  const s = states.get(sessionId);
  if (!s || !s.single) return;
  s._selected = value;
  notify(sessionId);
}

// Single-select mode — confirm the highlighted row (no-op if nothing selected).
export function submitSingle(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.single || !s._selected) return;
  const value = s._selected;
  states.delete(sessionId);
  notify(sessionId);
  s.onPick?.(value);
}

// Single-select mode — the currently highlighted value (or null). Lets the
// caller render its confirm affordance's enabled/disabled state.
export function getSelected(sessionId) {
  return states.get(sessionId)?._selected ?? null;
}

// Bump a row's count by ±delta, clamped. Works for full stepper pickers and
// for single-select pickers that carry an inline counter on a row (any picker
// with seeded `_counts`). In stepper mode it also makes the row the selection.
export function stepBump(sessionId, value, delta) {
  const s = states.get(sessionId);
  if (!s || !s._counts) return;
  const min = s.countMin ?? 1;
  const max = s.countMax ?? 20;
  const cur = s._counts[value] ?? s.defaultCount ?? 1;
  s._counts[value] = Math.max(min, Math.min(max, cur + delta));
  if (s.stepper) s._selected = value;
  notify(sessionId);
}

// Stepper mode — resolve with every row that has a count > 0. Each item can
// carry its own count (and 0 to opt out), so the result is a batch:
//   { picks: [{ value, count }], total }
// onPick gets the batch; a total of 0 is a no-op (the submit is disabled).
export function stepSubmit(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.stepper) return;
  const picks = (s.items || [])
    .map((it) => ({ value: it.value, count: s._counts[it.value] ?? 0 }))
    .filter((p) => p.count > 0);
  const total = picks.reduce((sum, p) => sum + p.count, 0);
  if (total <= 0) return;
  states.delete(sessionId);
  notify(sessionId);
  s.onPick?.({ picks, total });
}

export function pick(sessionId, value) {
  const s = states.get(sessionId);
  if (!s) return;
  // A row may carry an inline counter (single-select); hand its current count
  // to onPick as a second arg (ignored by handlers that don't take a count).
  const count = s._counts?.[value];
  states.delete(sessionId);
  notify(sessionId);
  s.onPick?.(value, count);
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
  // Stepper total = sum of every row's count (drives the submit label +
  // disabled state).
  const stepTotal = s.stepper ? Object.values(s._counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;
  const picker = {
    items: s.items || [],
    handler: "inline-question",
    // Loading state — show a loader inside the picker card (e.g. while Archie
    // "finds the angles") before the real options are swapped in.
    loading: s.loading === true,
    title: s.title || null,
    subtitle: s.subtitle || null,
    // Card-grid variant — visual cards instead of numbered rows (clip
    // aspect-ratio + subtitle-style steps). Single-select advance.
    variant: s.variant || null,
    cardCols: s.cardCols || null,
    // Footer action — a prominent bottom button in the cards footer that
    // resolves like any pick (e.g. "No subtitles" under the style grid).
    footerAction: s.footerAction || null,
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
    // Single-select-with-confirm — selectable rows, one at a time; the caller
    // owns the submit. `selectedValue` drives the highlight.
    single: s.single === true,
    selectedValue: s._selected ?? null,
    defaultSelected: Array.isArray(s.defaultSelected) ? s.defaultSelected : [],
    // Stepper mode — per-row counts; the submit reflects the TOTAL across
    // every row (each angle contributes its own count; 0 opts out).
    stepper: s.stepper === true,
    stepCounts: s._counts || {},
    stepMin: s.countMin ?? 1,
    stepMax: s.countMax ?? 20,
    stepTotal: stepTotal,
    submitLabel: s.stepper
      ? s.submitCountLabel
        ? s.submitCountLabel(stepTotal)
        : `Generate ${stepTotal}`
      : s.submitLabel || "Continue",
  };
  return { body, picker };
}
