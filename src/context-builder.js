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

import * as inlineQuestion from "./inline-question.js?v=27";
import { postAssistantMessage, postUserTurn, postSystemNotice, markSystemNoticeReady } from "./assistant.js?v=36";
import * as rightPanel from "./components/right-panel.js?v=108";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=28";
import { analyzeWebsite, analyzeDocument } from "./context-mock-analysis.js?v=21";
import { launch as launchPlaybookEditor, refineField as refinePlaybookField } from "./playbook-editor.js?v=10";
import { socialAccounts, connectors as connectorMocks } from "./mocks.js?v=34";

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
    connectedSocials: [],
    selectedProfileId: null,
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

// Non-chat entry point used by the linear /welcome flow. Mints a draft
// for the new sessionId, kicks off the mock website analysis on a 6s
// timer, and returns immediately so the caller can navigate to the next
// screen. The draft fields populate in the background; downstream
// screens read via getDraft(sid) and either render immediately (if
// analysis already done) or show a transient "Analysing…" state.
//
// Mirrors the patches that runAnalysis applies in the conversational
// flow, minus the chat turns (no postSystemNotice / postAssistantMessage).
export function startBackground(sessionId, websiteUrl) {
  const url = (websiteUrl || "").trim();
  drafts.set(
    sessionId,
    emptyDraft({
      sourceType: "website",
      sourceUrl: url,
      websiteUrl: url,
    }),
  );
  notify(sessionId);
  window.setTimeout(() => {
    const d = drafts.get(sessionId);
    if (!d) return;
    const analysis = analyzeWebsite(url);
    applyAnalysisToDraft(d, analysis);
    notify(sessionId);
  }, 6000);
}

// Shared draft patch — used by the conversational `runAnalysis` and by
// the linear `startBackground` so they stay in sync. Pre-selects every
// suggested value so the brief panel reads as "Archie's best guess,
// edit if anything's off".
function applyAnalysisToDraft(d, analysis) {
  d.name = d.name || analysis.name;
  d.businessSummary = analysis.businessSummary;
  d.suggestions = analysis.suggestions;
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
}

// Patch the draft from outside the conversational flow — used by the
// linear welcome screens to update connectedSocials / other draft
// fields without going through inlineQuestion.
export function patchDraft(sessionId, patch) {
  const d = drafts.get(sessionId);
  if (!d) return null;
  Object.assign(d, patch);
  notify(sessionId);
  return d;
}

// True once the website analysis has populated the draft. The linear
// recap screen polls this to decide between "Analyzing…" and "Show
// the Playbook".
export function isAnalysisReady(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return false;
  return Boolean(d.businessSummary || (d.tones && d.tones.length));
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
export function start(sessionId, { onComplete, autoLaunched = false, prefill = null } = {}) {
  drafts.set(sessionId, emptyDraft({ onComplete }));
  // Optional draft pre-seed — kept as a generic primitive even though no
  // current call site uses it (the First Time User ALT flow has its own
  // 3-question orchestration via startAlt below).
  if (prefill) {
    const d = drafts.get(sessionId);
    if (prefill.selectedProfileId) d.selectedProfileId = prefill.selectedProfileId;
    if (prefill.platform) d.connectedSocials = [prefill.platform];
  }
  notify(sessionId);
  askSource(sessionId, { autoLaunched });
}

// First Time User ALT — same 3 questions as the linear /welcome wizard
// (URL → profiles → documents) but rendered as inline-questions inside
// a chat with body.onboarding chrome. The website analysis kicks off in
// the background as soon as the URL lands, so by the time the user
// finishes the documents step the brief panel can open immediately.
//
// `prefilledUrl` represents an URL collected by an earlier step that
// lives outside the prototype — the chat surface uses it to pre-populate
// the URL question card so the user just confirms instead of typing.
export function startAlt(sessionId, { onComplete, prefilledUrl = "" } = {}) {
  const url = (prefilledUrl || "").trim();
  drafts.set(
    sessionId,
    emptyDraft({
      onComplete,
      sourceType: "website",
      websiteUrl: url,
      sourceUrl: url,
    }),
  );
  notify(sessionId);
  askAltUrl(sessionId, url);
}

function askAltUrl(sessionId, prefilledUrl = "") {
  const intro = prefilledUrl
    ? "Here's the site I found — confirm it below to begin. Three quick steps (site, profile, optional docs) and your Playbook's ready."
    : "Drop your website URL below to begin. Three quick steps (site, profile, optional docs) and your Playbook's ready.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "What's your website URL?",
    stepLabel: "1 / 3",
    items: [],
    customPlaceholder: "https://your-brand.com",
    customValue: prefilledUrl,
    onCustom: (value) => {
      const d = drafts.get(sessionId);
      if (!d) return;
      d.sourceUrl = (value || "").trim();
      d.websiteUrl = d.sourceUrl;
      postUserTurn(sessionId, d.sourceUrl);
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      // Kick off the website analysis in the background. It runs while
      // the user moves through questions 2 and 3 — by the time they
      // finish, the draft is hydrated and the brief panel can render
      // without an additional pending state.
      window.setTimeout(() => {
        const dd = drafts.get(sessionId);
        if (!dd) return;
        applyAnalysisToDraft(dd, analyzeWebsite(dd.sourceUrl || dd.websiteUrl));
        notify(sessionId);
      }, 6000);
      askAltProfile(sessionId);
    },
  });
}

// Map our mock's `platform` slug to the DS's official, full-color
// network icon used by .ap-avatar-network. Same mapping as
// welcome-socials.js — duplicated here to keep the module local.
const ALT_NETWORK_ICON_BY_PLATFORM = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
};
const ALT_BRAND_INITIALS = "NS";

function askAltProfile(sessionId) {
  postAssistantMessage(sessionId, "Pick the profile to use for this Playbook. I'll tune tone and format for it.");
  const connectedProfiles = socialAccounts.filter((p) => p.status === "connected");
  const items = connectedProfiles.map((p) => {
    const captionParts = [];
    if (p.kind) captionParts.push(p.kind);
    if (p.handle) captionParts.push(p.handle);
    return {
      value: p.id,
      label: p.platformLabel,
      caption: captionParts.join(" · "),
      // Render via the DS .ap-avatar with the corner network badge,
      // same look as the original step-2 welcome screen.
      avatar: {
        initials: ALT_BRAND_INITIALS,
        networkIcon: ALT_NETWORK_ICON_BY_PLATFORM[p.platform],
      },
    };
  });
  inlineQuestion.ask(sessionId, {
    title: "Which profile will publish?",
    stepLabel: "2 / 3",
    items,
    onPick: (id) => {
      const profile = connectedProfiles.find((p) => p.id === id);
      const d = drafts.get(sessionId);
      if (!d) return;
      if (profile) {
        d.selectedProfileId = profile.id;
        d.connectedSocials = [profile.platform];
        postUserTurn(sessionId, `${profile.platformLabel} · ${profile.handle || profile.kind || ""}`);
      }
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      askAltDocuments(sessionId);
    },
    onBack: () => {
      // Re-render question 1 with whatever URL the draft already holds
      // (the prefilled value, or what the user typed when they advanced).
      const d = drafts.get(sessionId);
      askAltUrl(sessionId, d?.sourceUrl || d?.websiteUrl || "");
    },
  });
}

function askAltDocuments(sessionId) {
  postAssistantMessage(
    sessionId,
    "Optional: connect documents that detail your Brand (brand book, brief, etc.). Or skip.",
  );
  const items = connectorMocks.map((c) => ({
    value: c.id,
    label: c.name,
    caption: c.desc,
    imgSrc: c.logo,
  }));
  inlineQuestion.ask(sessionId, {
    title: "Connect documents (optional)",
    stepLabel: "3 / 3",
    items,
    multi: true,
    submitLabel: "Continue",
    skipLabel: "Skip",
    onPick: (ids) => {
      if (ids?.length) {
        const noun = ids.length === 1 ? "source" : "sources";
        postUserTurn(sessionId, `${ids.length} ${noun} connected`);
      }
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      maybeOpenAltBrief(sessionId);
    },
    onSkip: () => {
      inlineQuestion.exit(sessionId);
      notify(sessionId);
      maybeOpenAltBrief(sessionId);
    },
    onBack: () => askAltProfile(sessionId),
  });
}

// At the end of the ALT chat, navigate to the centered /welcome-alt/recap
// surface instead of opening the right-anchored brief panel. The brief
// panel is an editing surface; the end of a conversational flow deserves
// a dedicated result presentation (UI/UX review).
//
// Stashes the ALT sessionId in sessionStorage so the recap screen can
// re-attach to the same draft after navigation.
function maybeOpenAltBrief(sessionId) {
  const navigateToRecap = () => {
    try {
      window.sessionStorage.setItem("welcomeAltSessionId", sessionId);
    } catch {
      /* ignore */
    }
    // Use the hash router — context-builder doesn't import navigate()
    // directly to avoid a cycle with the router module.
    window.location.hash = "#/welcome-alt/recap";
  };
  if (isAnalysisReady(sessionId)) {
    navigateToRecap();
    return;
  }
  const noticeId = postSystemNotice(sessionId, { meta: "Reading your site", variant: "mermaid" });
  notify(sessionId);
  const interval = window.setInterval(() => {
    if (!drafts.get(sessionId)) {
      window.clearInterval(interval);
      return;
    }
    if (isAnalysisReady(sessionId)) {
      window.clearInterval(interval);
      markSystemNoticeReady(sessionId, noticeId, { meta: "Site read" });
      notify(sessionId);
      navigateToRecap();
    }
  }, 400);
}

// Open the right-panel brief panel in read mode for an existing context.
// Same card-per-section layout as the brief builder — just read-only
// (selected chips only, no Other inputs, footer = Close + Edit). Legacy
// fields (briefSummary, plain-string audience, single cta) are normalized
// inside readBriefFromCtx in right-panel.js.
export function openRead(contextId) {
  // The Edit button (panel footer) flips the same panel into edit mode in
  // place via `openEdit` — no transient session, no confirm modal. The
  // per-section hover-reveal Refine button still routes to the
  // conversational playbook-editor sub-flow (`refinePlaybookField`) so
  // section-targeted Archie refinement remains available from read mode.
  rightPanel.openContextBriefPanel({
    mode: "read",
    getCtx: () => getContextById(contextId),
    onEnterEdit: () => openEdit(contextId),
    onRefineField: (fieldKey) => refinePlaybookField(contextId, fieldKey, "/contexts"),
  });
}

// Open the right-panel brief panel directly in edit mode for an existing
// context. The draft is a shallow copy of the saved Context — every chip
// toggle / textarea input mutates it through the panel's existing
// `data-brief-*` delegate (see right-panel.js click + input handlers).
// Save persists the draft via `updateContext`; Cancel discards it and
// flips back to read mode.
export function openEdit(contextId) {
  const saved = getContextById(contextId);
  if (!saved) return;
  // Shape the draft to match what the brief renderer expects (chip
  // arrays, suggestions/customAdditions buckets). `readBriefFromCtx`
  // lives in right-panel.js, but the same normalization is duplicated
  // in `startEdit` above — re-use that fan-out here for consistency.
  const draft = {
    websiteUrl: saved.websiteUrl || "",
    name: saved.name || "",
    businessSummary: saved.businessSummary || saved.briefSummary || "",
    audience: Array.isArray(saved.audience) ? saved.audience.slice() : saved.audience ? [saved.audience] : [],
    audienceProblems: Array.isArray(saved.audienceProblems) ? saved.audienceProblems.slice() : [],
    tones: Array.isArray(saved.tones) ? saved.tones.slice() : [],
    contentStyle: Array.isArray(saved.contentStyle) ? saved.contentStyle.slice() : [],
    objective: Array.isArray(saved.objective) ? saved.objective.slice() : [],
    contentAction: Array.isArray(saved.contentAction) ? saved.contentAction.slice() : [],
    ctaLinks: Array.isArray(saved.ctaLinks) ? saved.ctaLinks.map((l) => ({ ...l })) : [],
    language: saved.language || "English",
    color: saved.color || "orange",
    voiceProfile: saved.voiceProfile && typeof saved.voiceProfile === "object" ? { ...saved.voiceProfile } : null,
    imageVoice:
      saved.imageVoice && Array.isArray(saved.imageVoice.websites)
        ? { websites: saved.imageVoice.websites.map((w) => ({ ...w })) }
        : { websites: [] },
    // Empty buckets — no AI suggestions surface in the direct-edit flow.
    suggestions: {},
    customAdditions: {},
  };

  const toggleInArray = (field, value) => {
    if (!Array.isArray(draft[field])) draft[field] = [];
    const idx = draft[field].indexOf(value);
    if (idx === -1) draft[field].push(value);
    else draft[field].splice(idx, 1);
  };

  rightPanel.openContextBriefPanel({
    mode: "edit",
    getDraft: () => draft,
    getCtx: () => saved,
    onName: (value) => {
      draft.name = value;
    },
    onAnswer: (field, value) => {
      draft[field] = value;
      rightPanel.refreshContextBriefPanel();
    },
    onToggleChip: (field, value) => {
      toggleInArray(field, value);
      rightPanel.refreshContextBriefPanel();
    },
    onAddOther: (field, value) => {
      if (!Array.isArray(draft[field])) draft[field] = [];
      if (!draft[field].includes(value)) draft[field].push(value);
      rightPanel.refreshContextBriefPanel();
    },
    onToggleCta: (url) => {
      const cta = (draft.ctaLinks || []).find((l) => l.url === url);
      if (cta) cta.checked = !cta.checked;
    },
    onCtaToggleAt: (i) => {
      const cta = (draft.ctaLinks || [])[i];
      if (cta) cta.checked = !cta.checked;
    },
    onCtaUpdate: (i, field, value) => {
      const cta = (draft.ctaLinks || [])[i];
      if (cta) cta[field] = value;
    },
    onCtaDelete: (i) => {
      if (Array.isArray(draft.ctaLinks)) draft.ctaLinks.splice(i, 1);
    },
    onCtaAdd: () => {
      if (!Array.isArray(draft.ctaLinks)) draft.ctaLinks = [];
      draft.ctaLinks.push({ label: "", url: "", checked: true });
    },
    onCtaRestore: (snapshot) => {
      draft.ctaLinks = Array.isArray(snapshot) ? snapshot.map((c) => ({ ...c })) : [];
    },
    onVoiceProfileChange: (key, value) => {
      if (!draft.voiceProfile || typeof draft.voiceProfile !== "object") draft.voiceProfile = {};
      draft.voiceProfile[key] = value;
    },
    onSave: () => {
      updateContext(contextId, draft);
      openRead(contextId);
    },
    onCancel: () => {
      // Returning truthy tells the panel's cancel delegate not to
      // tear itself down — we want to keep the panel open and flip
      // straight into read mode.
      openRead(contextId);
      return true;
    },
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
      connectedSocials: Array.isArray(ctx.connectedSocials) ? ctx.connectedSocials.slice() : [],
      selectedProfileId: ctx.selectedProfileId || null,
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

// Step 0: 2-card picker for the input type. Archie analyses whatever the
// user provides and produces the playbook from it. Social profiles used
// to be a third path here; they now have their own dedicated step that
// runs AFTER the website analysis (see `askSocial`), so the user can
// describe the brand AND list the channels rather than choosing between
// the two.
function askSource(sessionId, { autoLaunched = false } = {}) {
  const intro = autoLaunched
    ? "There's no Playbook in this chat yet. Let's build one — it takes a minute."
    : "Let's set up a new Playbook.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "How should I start?",
    items: [
      {
        value: "website",
        label: "Website",
        caption: "Paste any URL — your website, blog, or landing page.",
        icon: "ap-icon-web",
      },
      {
        value: "documents",
        label: "Documents",
        caption: "Drop a PDF, DOCX or TXT — brand doc, strategy deck…",
        icon: "ap-icon-file--pdf",
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
  // Route to the matching input step. Only Website + Documents are
  // reachable from the picker; the social step is part of the Website
  // path tail (see runAnalysis → askSocial).
  if (sourceType === "website") askUrl(sessionId);
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
  const intro = "Paste your website URL and I'll pull the brand voice, audience, and visual identity.";
  postAssistantMessage(sessionId, intro);
  inlineQuestion.ask(sessionId, {
    title: "What's the URL of your company website?",
    items: [],
    customPlaceholder: "https://your-brand.com",
    onCustom: (value) => setUrl(sessionId, value),
    onBack: () => askSource(sessionId),
  });
}

// Step 1b: Document upload. customFile dropzone variant of inline-question.
function askDocument(sessionId) {
  const intro = "Drop a brand or strategy document and I'll build the Playbook from it.";
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
  if (d.sourceUrl) postUserTurn(sessionId, d.sourceUrl);
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  runAnalysis(sessionId);
}

function setFile(sessionId, file) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.sourceFile = file ? { name: file.name, size: file.size, type: file.type } : null;
  if (file) postUserTurn(sessionId, file.name);
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
  const noticeId = postSystemNotice(sessionId, { meta: "Reading your source", variant: "mermaid" });
  notify(sessionId);
  window.setTimeout(() => {
    const d = drafts.get(sessionId);
    if (!d) return; // session bailed out mid-analysis
    // Dispatch on the user's chosen source type. Each mock returns the
    // same shape so the rest of the brief-panel pipeline is unchanged.
    const analysis =
      d.sourceType === "documents" ? analyzeDocument(d.sourceFile) : analyzeWebsite(d.sourceUrl || d.websiteUrl);
    applyAnalysisToDraft(d, analysis);
    markSystemNoticeReady(sessionId, noticeId, { meta: "Source read" });
    notify(sessionId);
    // Website path tails into the social-channels step so the user can
    // tell Archie where the brand publishes. Documents path skips it —
    // a strategy doc usually doesn't need a channel inventory and the
    // step would feel out of place after a single upload.
    if (d.sourceType === "website") askSocial(sessionId);
    else openBriefPanel(sessionId);
  }, 6000);
}

// --- Phase 2b — Profile picker (Website path only) -----------------------
//
// After the website analysis, Archie asks WHICH connected social
// profile to analyse — the profile's voice feeds the playbook tone
// and format. Single-select since voice is sourced from one profile.
// Mirrors the askAltProfile pattern above (DS .ap-avatar with corner
// network badge).

function deriveBrandInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function askSocial(sessionId) {
  const d = getDraft(sessionId);
  const connectedProfiles = socialAccounts.filter((p) => p.status === "connected");
  // Edge case: no connected profiles. Skip the step rather than show an
  // empty picker — the playbook can still be built from the website
  // analysis alone.
  if (connectedProfiles.length === 0) {
    openBriefPanel(sessionId);
    return;
  }

  postAssistantMessage(
    sessionId,
    "Which connected profile should I analyze? I'll capture its voice and shape the Playbook's tone and format around it.",
  );
  const initials = deriveBrandInitials(d?.name);
  const items = connectedProfiles.map((p) => {
    const captionParts = [];
    if (p.platformLabel) captionParts.push(p.platformLabel);
    if (p.kind) captionParts.push(p.kind);
    return {
      value: p.id,
      label: p.handle || p.platformLabel,
      caption: captionParts.join(" · "),
      avatar: {
        initials,
        networkIcon: ALT_NETWORK_ICON_BY_PLATFORM[p.platform],
      },
    };
  });
  inlineQuestion.ask(sessionId, {
    title: "Which profile to analyse?",
    stepLabel: "Voice source",
    items,
    skipLabel: "Skip",
    onPick: (id) => setSelectedProfile(sessionId, id),
    onSkip: () => setSelectedProfile(sessionId, null),
    onBack: () => askUrl(sessionId),
  });
}

function setSelectedProfile(sessionId, profileId) {
  const d = drafts.get(sessionId);
  if (!d) return;
  if (profileId) {
    const profile = socialAccounts.find((p) => p.id === profileId);
    if (profile) {
      d.selectedProfileId = profile.id;
      d.connectedSocials = [profile.platform];
      postUserTurn(sessionId, `${profile.platformLabel} · ${profile.handle || profile.kind || ""}`);
    }
  } else {
    d.selectedProfileId = null;
    d.connectedSocials = [];
    // Phase 2 §8.3: don't echo procedural "Skip" as a <You> bubble.
  }
  inlineQuestion.exit(sessionId);
  notify(sessionId);
  openBriefPanel(sessionId);
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
    onCtaToggleAt: (i) => toggleCtaAt(sessionId, i),
    onCtaUpdate: (i, field, value) => updateCta(sessionId, i, field, value),
    onCtaDelete: (i) => deleteCta(sessionId, i),
    onCtaAdd: () => addCta(sessionId),
    onCtaRestore: (snapshot) => restoreCtas(sessionId, snapshot),
    onName: (name) => setName(sessionId, name),
    onVoiceProfileChange: (fieldId, value) => setVoiceProfileField(sessionId, fieldId, value),
    onSave: () => save(sessionId),
    onCancel: () => cancel(sessionId),
  });
}

function setAnswer(sessionId, field, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d[field] = value;
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function setVoiceProfileField(sessionId, fieldId, value) {
  const d = drafts.get(sessionId);
  if (!d) return;
  if (!d.voiceProfile || typeof d.voiceProfile !== "object") d.voiceProfile = {};
  d.voiceProfile[fieldId] = value;
  notify(sessionId);
  // No refresh — let the textarea keep its focus while typing.
}

function setName(sessionId, name) {
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

function toggleCtaAt(sessionId, i) {
  const d = drafts.get(sessionId);
  if (!d || !Array.isArray(d.ctaLinks) || !d.ctaLinks[i]) return;
  d.ctaLinks = d.ctaLinks.map((l, idx) => (idx === i ? { ...l, checked: !l.checked } : l));
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function updateCta(sessionId, i, field, value) {
  const d = drafts.get(sessionId);
  if (!d || !Array.isArray(d.ctaLinks) || !d.ctaLinks[i]) return;
  // No refresh — let the input keep its focus while typing.
  d.ctaLinks[i][field] = value;
  notify(sessionId);
}

function deleteCta(sessionId, i) {
  const d = drafts.get(sessionId);
  if (!d || !Array.isArray(d.ctaLinks)) return;
  d.ctaLinks.splice(i, 1);
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function addCta(sessionId) {
  const d = drafts.get(sessionId);
  if (!d) return;
  if (!Array.isArray(d.ctaLinks)) d.ctaLinks = [];
  d.ctaLinks.push({ label: "", url: "", checked: true });
  notify(sessionId);
  rightPanel.refreshContextBriefPanel?.();
}

function restoreCtas(sessionId, snapshot) {
  const d = drafts.get(sessionId);
  if (!d) return;
  d.ctaLinks = Array.isArray(snapshot) ? snapshot.map((c) => ({ ...c })) : [];
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
    connectedSocials: Array.isArray(d.connectedSocials) ? d.connectedSocials.slice() : [],
    selectedProfileId: d.selectedProfileId || null,
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
  return saved;
}
