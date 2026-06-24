// Conversational context-builder orchestrator.
//
// Playbook CREATION is the First Time User ALT flow (`startAlt`): a 3-question
// chat (URL → profile → optional documents) that kicks off a mock website
// analysis, then reveals the editable recap (see playbook-view + the
// welcome-alt-recap / integrated New-Playbook wrappers). `save()` persists the
// draft into the contexts-store. The older brief-builder (a "Website /
// Documents" source picker → right-panel brief form) was removed once the ALT
// flow became the single creation path.
//
// State per "session" (a synthetic id when invoked outside a real chat) is the
// draft: { websiteUrl, name, businessSummary, audience, audienceProblems,
// tones, contentStyle, objective, contentAction, ctaLinks, language, color,
// suggestions, editingId, onComplete }.

import * as inlineQuestion from "./inline-question.js?v=41";
import { postAssistantMessage, postUserTurn, postUserProfilesTurn } from "./assistant.js?v=52";
import * as rightPanel from "./components/right-panel.js?v=214";
import { addContext, updateContext, getContextById } from "./contexts-store.js?v=31";
import { analyzeWebsite } from "./context-mock-analysis.js?v=23";
import { connectors as connectorMocks } from "./mocks.js?v=45";
import { getConnectedProfiles, buildConnectedProfileItems } from "./social-profiles.js?v=22";

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
    // Voice & style — concrete patterns surfaced in the Playbook view.
    signatureHooks: [],
    closingPatterns: [],
    formattingStyle: "",
    visualStyle: "",
    voiceMode: "guided", // "guided" (structured fields) | "manual" (free-form)
    voiceManual: "",
    // Brand — author-editable identity (seeded from the scraped site on first edit).
    brandPersonality: "",
    brandTypography: null, // { headingFont, bodyFont }
    brandColors: [], // Array<{ name, hex }>
    referenceImages: [], // Array<{ id, label, url }>
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

// Map an analysis result onto the section fields of a Playbook/draft, WITHOUT
// touching identity (name) or chrome. Shared by the onboarding draft fill
// (applyAnalysisToDraft) and the saved-Playbook "Auto-fill" overwrite on the
// detail page (screens/playbook.js). Returns a plain patch object.
export function sectionPatchFromAnalysis(analysis) {
  const s = (analysis && analysis.suggestions) || {};
  return {
    businessSummary: analysis?.businessSummary || "",
    briefSummary: analysis?.businessSummary || "", // legacy mirror
    // Primary audience is single-select (the user picks one from Archie's
    // analysed list in the recap), so pre-select only the top suggestion —
    // the full list stays available via `suggestions.audience` for the picker.
    audience: (s.audience || []).slice(0, 1),
    audienceProblems: (s.audienceProblems || []).slice(),
    tones: (s.tones || []).slice(),
    contentStyle: (s.contentStyle || []).slice(),
    objective: (s.objective || []).slice(),
    contentAction: (s.contentAction || []).slice(),
    ctaLinks: (s.ctaLinks || []).map((l) => ({ ...l })),
    language: s.language || "English",
    voiceProfile: s.voiceProfile ? { ...s.voiceProfile } : null,
    imageVoice: s.imageVoice || { websites: [] },
    signatureHooks: (s.signatureHooks || []).slice(),
    closingPatterns: (s.closingPatterns || []).slice(),
    formattingStyle: s.formattingStyle || "",
    visualStyle: s.visualStyle || "",
    // A fresh analysis always produces structured voice — reset to guided.
    voiceMode: "guided",
    voiceManual: "",
    brandPersonality: s.brandPersonality || "",
    brandTypography: s.brandTypography ? { ...s.brandTypography } : null,
    brandColors: (s.brandColors || []).map((c) => ({ ...c })),
  };
}

// Shared draft patch — applied by the First Time User ALT flow (`startAlt`)
// after the website analysis lands. Pre-selects every suggested value so the
// recap reads as "Archie's best guess, edit if anything's off".
function applyAnalysisToDraft(d, analysis) {
  d.name = d.name || analysis.name;
  d.suggestions = analysis.suggestions;
  d.color = analysis.suggestions.color || "orange";
  Object.assign(d, sectionPatchFromAnalysis(analysis));
}

// Patch the draft from outside the conversational flow — used by the
// welcome-alt recap to edit Playbook fields without going through
// inlineQuestion.
export function patchDraft(sessionId, patch) {
  const d = drafts.get(sessionId);
  if (!d) return null;
  Object.assign(d, patch);
  notify(sessionId);
  return d;
}

// Re-seed a draft from a persisted snapshot (e.g. the welcome-alt recap
// rehydrating itself after a page reload, where the in-memory Map is
// empty). Replaces any existing draft for the session wholesale.
export function restoreDraft(sessionId, draft) {
  if (!draft) return null;
  drafts.set(sessionId, draft);
  notify(sessionId);
  return draft;
}

// True once the website analysis has populated the draft. The welcome-alt
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

// First Time User ALT — a 3-question onboarding (URL → profiles →
// documents) rendered as inline-questions inside a chat with
// body.onboarding chrome. The website analysis kicks off in
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

function askAltProfile(sessionId) {
  postAssistantMessage(sessionId, "Pick the profile to use for this Playbook. I'll tune tone and format for it.");
  // Connected profiles + their picker presentation come from the shared
  // social-profiles helper so this onboarding step and the in-session
  // draft profile picker stay identical.
  const connectedProfiles = getConnectedProfiles();
  const items = buildConnectedProfileItems();
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
        postUserProfilesTurn(sessionId, [profile]);
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
  // Onboarding keeps the choice tight — the four sources most people connect
  // first. The full catalogue lives on /connectors; the subtitle points there.
  const ONBOARDING_DOC_CONNECTORS = ["slite", "notion", "gdrive", "slack"];
  const items = ONBOARDING_DOC_CONNECTORS.map((id) => connectorMocks.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      value: c.id,
      label: c.name,
      caption: c.desc,
      imgSrc: c.logo,
    }));
  inlineQuestion.ask(sessionId, {
    title: "Connect documents (optional)",
    subtitle: "You can connect more sources later in Settings.",
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
  // Navigate straight to the recap — it owns the branded loading
  // sequence (centered Archie loader + staged "here's what we're doing"
  // copy) and waits for the analysis to land before revealing the
  // Playbook. No in-chat "Reading your site" notice: the loading moment
  // belongs on the recap surface, not as a stray chat pill.
  try {
    window.sessionStorage.setItem("welcomeAltSessionId", sessionId);
  } catch {
    /* ignore */
  }
  // Use the hash router — context-builder doesn't import navigate()
  // directly to avoid a cycle with the router module.
  window.location.hash = "#/welcome-alt/recap";
}

// Open the right-panel brief panel in read mode for an existing context.
// Same card-per-section layout as the brief builder — just read-only
// (selected chips only, no Other inputs, footer = Close + Edit). Legacy
// fields (briefSummary, plain-string audience, single cta) are normalized
// inside readBriefFromCtx in right-panel.js.
export function openRead(contextId) {
  // The Edit button (panel footer) flips the same panel into edit mode in
  // place via `openEdit` — no transient session, no confirm modal.
  rightPanel.openContextBriefPanel({
    mode: "read",
    getCtx: () => getContextById(contextId),
    onEnterEdit: () => openEdit(contextId),
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
    // New 3-section model fields (previously dropped on save).
    signatureHooks: Array.isArray(d.signatureHooks) ? d.signatureHooks.filter((s) => (s || "").trim()) : [],
    closingPatterns: Array.isArray(d.closingPatterns) ? d.closingPatterns.filter((s) => (s || "").trim()) : [],
    formattingStyle: d.formattingStyle || "",
    visualStyle: d.visualStyle || "",
    brandPersonality: d.brandPersonality || "",
    brandTypography: d.brandTypography ? { ...d.brandTypography } : null,
    brandColors: Array.isArray(d.brandColors) ? d.brandColors.map((c) => ({ ...c })) : [],
    referenceImages: Array.isArray(d.referenceImages) ? d.referenceImages.map((i) => ({ ...i })) : [],
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
