// Conversational context-builder orchestrator (V1).
//
// Two-phase flow:
//   1. Inline Q (website URL) — free-text via inline-question (custom row).
//   2. Pending "Reading your website…" (~10s) → analyzeWebsite(url) mocks an
//      analysis result, which seeds the draft (businessSummary, suggested
//      values for each multi-pick question).
//   3. Brief panel opens side-by-side with the chat (Claude-Artifact style)
//      via rightPanel.openContextBriefPanel(...). User edits the brief
//      directly — chips, CTAs, language, color — and clicks "Generate my
//      brief" to save.
//
// State per "session" (a synthetic id when invoked outside a real chat) is
// the draft: { websiteUrl, name, businessSummary, audience, audienceProblems,
// tones, contentStyle, objective, contentAction, ctaLinks, language, color,
// suggestions, editingId, onComplete }.
//
// The legacy 3-phase form (URL → profiles → right-panel form) is gone. The
// right-panel ContextForm read mode (openRead) stays for viewing existing
// contexts that may still have the old shape.

import * as inlineQuestion from "./inline-question.js?v=21";
import { postAssistantMessage, postUserTurn } from "./assistant.js?v=27";
import * as rightPanel from "./components/right-panel.js?v=44";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=25";
import { analyzeWebsite } from "./context-mock-analysis.js?v=20";

const drafts = new Map(); // sessionId → draft
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

function emptyDraft(overrides = {}) {
  return {
    websiteUrl: "",
    name: "",
    businessSummary: "",
    audience: [],
    audienceProblems: [],
    tones: [],
    contentStyle: [],
    objective: [],
    contentAction: [],
    ctaLinks: [], // Array<{ label, url, checked, suggested }>
    language: "English",
    color: "orange",
    suggestions: {
      audience: [],
      audienceProblems: [],
      tones: [],
      contentStyle: [],
      objective: [],
      contentAction: [],
      ctaLinks: [],
    },
    customAdditions: {
      audience: [],
      audienceProblems: [],
      tones: [],
      contentStyle: [],
      objective: [],
      contentAction: [],
    },
    editingId: null,
    onComplete: null,
    ...overrides,
  };
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

// Kick off the V1 brief-builder flow. The inline question asks for the URL
// inside `sessionId`'s assistant panel; once submitted, a ~10s "Reading
// your website…" pending turn fires before the brief panel opens.
export function start(sessionId, { onComplete } = {}) {
  drafts.set(sessionId, emptyDraft({ onComplete }));
  notify(sessionId);
  askUrl(sessionId);
}

// Open the right-panel context-form on an existing context in read mode.
// (Read mode still uses the legacy ContextForm renderer — it knows how to
// display both the old shape and the new V1 fields.)
export function openRead(contextId) {
  rightPanel.openContextForm({
    mode: "read",
    getCtx: () => getContextById(contextId),
    onEnterEdit: () => startEdit(contextId),
  });
}

// Re-open an existing context for editing via the brief panel. Pre-fills
// the draft from the persisted Context, jumping straight to phase 3.
export function startEdit(contextId) {
  const ctx = getContextById(contextId);
  if (!ctx) return;
  const sessionId = `context-edit-${contextId}-${Date.now()}`;
  drafts.set(
    sessionId,
    emptyDraft({
      editingId: contextId,
      websiteUrl: ctx.websiteUrl || "",
      name: ctx.name || "",
      businessSummary: ctx.businessSummary || ctx.briefSummary || "",
      audience: Array.isArray(ctx.audience) ? ctx.audience.slice() : ctx.audience ? [ctx.audience] : [],
      audienceProblems: Array.isArray(ctx.audienceProblems) ? ctx.audienceProblems.slice() : [],
      tones: Array.isArray(ctx.tones) ? ctx.tones.slice() : [],
      contentStyle: Array.isArray(ctx.contentStyle) ? ctx.contentStyle.slice() : [],
      objective: Array.isArray(ctx.objective) ? ctx.objective.slice() : [],
      contentAction: Array.isArray(ctx.contentAction) ? ctx.contentAction.slice() : [],
      ctaLinks: Array.isArray(ctx.ctaLinks) ? ctx.ctaLinks.map((l) => ({ ...l })) : [],
      language: ctx.language || "English",
      color: ctx.color || "orange",
    }),
  );
  openBriefPanel(sessionId);
}

export function cancel(sessionId) {
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
}

// --- Phase 1 — URL ---------------------------------------------------------

function askUrl(sessionId) {
  postAssistantMessage(sessionId, "Let's set up a new context. What's the URL of your company website?");
  inlineQuestion.ask(sessionId, {
    title: "What's the URL of your company website?",
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
  d.websiteUrl = (url || "").trim();
  postUserTurn(sessionId, d.websiteUrl || "Skip");
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  runAnalysis(sessionId);
}

// --- Phase 2 — Mock website analysis (~10s) -------------------------------

function runAnalysis(sessionId) {
  postAssistantMessage(sessionId, "Reading your website… I'll have a draft brief ready in about 10 seconds.");
  notify(sessionId);
  window.setTimeout(() => {
    const d = drafts.get(sessionId);
    if (!d) return; // session bailed out mid-analysis
    const analysis = analyzeWebsite(d.websiteUrl);
    d.name = d.name || analysis.name;
    d.businessSummary = analysis.businessSummary;
    d.suggestions = analysis.suggestions;
    // Pre-select the suggested values so the chips start in their "selected"
    // (green / checked) state. The user toggles them off if not relevant.
    d.audience = (analysis.suggestions.audience || []).slice();
    d.audienceProblems = (analysis.suggestions.audienceProblems || []).slice();
    d.tones = (analysis.suggestions.tones || []).slice();
    d.contentStyle = (analysis.suggestions.contentStyle || []).slice();
    d.objective = (analysis.suggestions.objective || []).slice();
    d.contentAction = (analysis.suggestions.contentAction || []).slice();
    d.ctaLinks = (analysis.suggestions.ctaLinks || []).map((l) => ({ ...l }));
    d.language = analysis.suggestions.language || "English";
    d.color = analysis.suggestions.color || "orange";
    notify(sessionId);
    postAssistantMessage(
      sessionId,
      "Here's a draft brief. Tweak anything that doesn't fit, then click \"Generate my brief\" to save.",
    );
    openBriefPanel(sessionId);
  }, 10000);
}

// --- Phase 3 — Brief panel -------------------------------------------------

function openBriefPanel(sessionId) {
  rightPanel.openContextBriefPanel({
    getDraft: () => drafts.get(sessionId) || emptyDraft(),
    onAnswer: (field, value) => setAnswer(sessionId, field, value),
    onToggleChip: (field, value) => toggleChip(sessionId, field, value),
    onAddOther: (field, value) => addCustomChip(sessionId, field, value),
    onRemoveChip: (field, value) => toggleChip(sessionId, field, value),
    onToggleCta: (url) => toggleCta(sessionId, url),
    onName: (name) => setName(sessionId, name),
    onSave: () => save(sessionId),
    onCancel: () => cancel(sessionId),
  });
}

export function setAnswer(sessionId, field, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d[field] = value;
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

export function setName(sessionId, name) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.name = name || "";
  notify(sessionId);
  // No refresh — let the input keep its focus.
}

function toggleChip(sessionId, field, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  const arr = Array.isArray(d[field]) ? d[field].slice() : [];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  d[field] = arr;
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function addCustomChip(sessionId, field, value) {
  const v = (value || "").trim();
  if (!v) return;
  const d = drafts.get(sessionId);
  if (!d) return;
  const arr = Array.isArray(d[field]) ? d[field].slice() : [];
  if (!arr.includes(v)) arr.push(v);
  d[field] = arr;
  // Track that this is a user-added chip (not an AI suggestion).
  const customs = d.customAdditions[field] || [];
  if (!customs.includes(v)) customs.push(v);
  d.customAdditions[field] = customs;
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function toggleCta(sessionId, url) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.ctaLinks = d.ctaLinks.map((l) => (l.url === url ? { ...l, checked: !l.checked } : l));
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

export function save(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return;
  const name = (d.name || "").trim();
  if (!name) return; // Save button is disabled in this state; defensive.
  const payload = {
    name,
    color: d.color,
    websiteUrl: d.websiteUrl,
    businessSummary: d.businessSummary,
    briefSummary: d.businessSummary, // mirror to legacy field for backwards-read compat
    audience: d.audience,
    audienceProblems: d.audienceProblems,
    tones: d.tones,
    contentStyle: d.contentStyle,
    objective: d.objective,
    contentAction: d.contentAction,
    ctaLinks: d.ctaLinks.filter((l) => l.checked),
    cta: d.ctaLinks.find((l) => l.checked)?.url || "",
    language: d.language,
    updatedAt: "just now",
  };
  const saved = d.editingId ? updateContext(d.editingId, payload) : addContext(payload);
  const onComplete = d.onComplete;
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  rightPanel.closeContextBriefPanelSilently?.();
  if (onComplete) onComplete(saved);
}
