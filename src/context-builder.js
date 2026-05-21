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

import * as inlineQuestion from "./inline-question.js?v=25";
import { postAssistantMessage, postUserTurn, postSystemNotice, markSystemNoticeReady } from "./assistant.js?v=31";
import * as rightPanel from "./components/right-panel.js?v=59";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=26";
import { analyzeWebsite, analyzeSocialProfile, analyzeDocument, detectPlatform } from "./context-mock-analysis.js?v=21";
import { launch as launchPlaybookEditor } from "./playbook-editor.js?v=8";

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
    voiceProfile: null,
    sourceType: null, // "website" | "documents" | "social"
    sourceUrl: "",
    sourceFile: null,
    sourcePlatform: null,
    imageVoice: { websites: [] },
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
// `autoLaunched: true` softens the entry copy with a transitional message
// — used when session.js fires the wizard on the user's first message
// without a context. Explicit "+ New context" entry points keep the
// existing concise intro since the user already opted in.
export function start(sessionId, { onComplete, autoLaunched = false } = {}) {
  drafts.set(sessionId, emptyDraft({ onComplete }));
  notify(sessionId);
  askSource(sessionId, { autoLaunched });
}

// Open the right-panel brief panel in read mode for an existing context.
// Same card-per-section layout as the brief builder — just read-only
// (selected chips only, no Other inputs, footer = Close + Edit). Legacy
// fields (briefSummary, plain-string audience, single cta) are normalized
// inside readBriefFromCtx in right-panel.js.
export function openRead(contextId) {
  // The Edit button (panel footer) now launches the conversational
  // Playbook editor — same entry point as the pen icon on the /contexts
  // cards. The form-based startEdit() flow stays exported in case some
  // future surface needs it.
  rightPanel.openContextBriefPanel({
    mode: "read",
    getCtx: () => getContextById(contextId),
    onEnterEdit: () => launchPlaybookEditor(contextId, "/contexts"),
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
      voiceProfile: ctx.voiceProfile && typeof ctx.voiceProfile === "object" ? { ...ctx.voiceProfile } : null,
      imageVoice:
        ctx.imageVoice && Array.isArray(ctx.imageVoice.websites)
          ? { websites: ctx.imageVoice.websites.map((w) => ({ ...w })) }
          : { websites: [] },
    }),
  );
  openBriefPanel(sessionId);
}

export function cancel(sessionId) {
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
}

// --- Phase 1 — Source picker + source-specific input -----------------------

// Step 0: 3-card picker for the input type. Archie analyses whatever the
// user provides and produces the playbook from it.
function askSource(sessionId, { autoLaunched = false } = {}) {
  const intro = autoLaunched
    ? "Before I dive in — there's no playbook defined for this conversation yet. Let's create one together, it'll only take a minute."
    : "Let's set up a new playbook.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "How should I start?",
    items: [
      {
        value: "website",
        label: "Website",
        caption: "Paste any URL — agorapulse.com, your blog, a landing page…",
        icon: "ap-icon-web",
      },
      {
        value: "documents",
        label: "Documents",
        caption: "Drop a PDF, DOCX or TXT — brand doc, strategy deck…",
        icon: "ap-icon-file--pdf",
      },
      {
        value: "social",
        label: "Social profile",
        caption: "LinkedIn, X, Instagram, TikTok, Bluesky…",
        icon: "ap-icon-multiple-users",
      },
    ],
    onPick: (value) => setSourceType(sessionId, value),
    onSkip: () => exitWithoutSave(sessionId),
    skipLabel: "Skip",
  });
}

function setSourceType(sessionId, sourceType) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.sourceType = sourceType;
  notify(sessionId);
  inlineQuestion.exit(sessionId);
  // Route to the matching input step.
  if (sourceType === "website") askUrl(sessionId);
  else if (sourceType === "social") askProfileUrl(sessionId);
  else if (sourceType === "documents") askDocument(sessionId);
}

function exitWithoutSave(sessionId) {
  drafts.delete(sessionId);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
}

// Step 1a: Website URL. No skip — the wizard needs something to analyse;
// the back button is the way out (returns to source picker).
function askUrl(sessionId) {
  const intro = "Got it — paste your website URL and I'll pull the brand voice, audience and visual identity from it.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "What's the URL of your company website?",
    items: [],
    customPlaceholder: "https://your-brand.com",
    onCustom: (value) => setUrl(sessionId, value),
    onBack: () => askSource(sessionId),
  });
}

// Step 1b: Social profile URL. Same chrome as askUrl, different placeholder.
function askProfileUrl(sessionId) {
  const intro = "Got it — paste the profile URL. I'll detect the platform and analyse the voice from there.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "What's your social profile URL?",
    items: [],
    customPlaceholder: "linkedin.com/in/jdoe",
    onCustom: (value) => setUrl(sessionId, value),
    onBack: () => askSource(sessionId),
  });
}

// Step 1c: Document upload. customFile dropzone variant of inline-question.
function askDocument(sessionId) {
  const intro = "Got it — drop a brand or strategy document and I'll build the playbook from it.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "Upload a brand or strategy document",
    items: [],
    customFile: true,
    customFileAccept:
      ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
    customFileLabel: "Drop a file here, or click to browse",
    customFileHint: "PDF · DOCX · TXT — max 10 MB",
    customFileIcon: "ap-icon-upload",
    onFile: (file) => setFile(sessionId, file),
    onBack: () => askSource(sessionId),
  });
}

function setUrl(sessionId, url) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.sourceUrl = (url || "").trim();
  // Keep websiteUrl in sync for back-compat with downstream readers.
  if (d.sourceType === "website") d.websiteUrl = d.sourceUrl;
  postUserTurn(sessionId, d.sourceUrl || "Skip");
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  runAnalysis(sessionId);
}

function setFile(sessionId, file) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.sourceFile = file ? { name: file.name, size: file.size, type: file.type } : null;
  postUserTurn(sessionId, file ? file.name : "Skip");
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  runAnalysis(sessionId);
}

// --- Phase 2 — Mock website analysis (~10s) -------------------------------

function runAnalysis(sessionId) {
  // Mermaid status pill — same chrome as the "Drafting" reasoning pill,
  // labeled "Extracting guidelines" while the mocked website analysis is
  // in flight, then flipped to "Extracted guidelines" once the brief
  // panel is ready to open.
  const noticeId = postSystemNotice(sessionId, { meta: "Extracting guidelines", variant: "mermaid" });
  notify(sessionId);
  window.setTimeout(() => {
    const d = drafts.get(sessionId);
    if (!d) return; // session bailed out mid-analysis
    // Dispatch on the user's chosen source type. Each mock returns the
    // same shape so the rest of the brief-panel pipeline is unchanged.
    let analysis;
    if (d.sourceType === "social") {
      analysis = analyzeSocialProfile(d.sourceUrl);
      d.sourcePlatform = detectPlatform(d.sourceUrl);
    } else if (d.sourceType === "documents") {
      analysis = analyzeDocument(d.sourceFile);
    } else {
      analysis = analyzeWebsite(d.sourceUrl || d.websiteUrl);
    }
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
    d.voiceProfile = analysis.suggestions.voiceProfile ? { ...analysis.suggestions.voiceProfile } : null;
    d.imageVoice = analysis.suggestions.imageVoice || { websites: [] };
    markSystemNoticeReady(sessionId, noticeId, { meta: "Extracted guidelines" });
    notify(sessionId);
    openBriefPanel(sessionId);
  }, 6000);
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
    onVoiceProfileChange: (fieldId, value) => setVoiceProfileField(sessionId, fieldId, value),
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

export function setVoiceProfileField(sessionId, fieldId, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  if (!d.voiceProfile || typeof d.voiceProfile !== "object") d.voiceProfile = {};
  d.voiceProfile[fieldId] = value;
  notify(sessionId);
  // No refresh — let the textarea keep its focus while typing.
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
    sourceType: d.sourceType || null,
    sourceUrl: d.sourceUrl || d.websiteUrl || "",
    sourceFile: d.sourceFile || null,
    sourcePlatform: d.sourcePlatform || null,
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
    voiceProfile: d.voiceProfile || null,
    imageVoice: d.imageVoice && Array.isArray(d.imageVoice.websites) ? d.imageVoice : { websites: [] },
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
