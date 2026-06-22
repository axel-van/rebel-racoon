// Contexts store — single source of truth for the global contexts list.
//
// Calqued sur connectors-store.js (FIND-01 pattern). Plusieurs surfaces lisent
// les contexts (dashboard New chat dropdown, session Context tab, settings
// drawer Contexts tab) et il faut pouvoir muter (memorize → save as global,
// rename via in-session edit) avec propagation. L'array est seedé une fois
// depuis mocks.contexts ; chaque mutation notifie tous les subscribers.
//
// Public API:
//   getContexts()                → Context[]   (snapshot)
//   getContextById(id)           → Context | null
//   addContext(ctx)              → Context     (assigns id if missing, notifies)
//   updateContext(id, patch)     → Context | null   (deep-ish merge for voice/brief/brand subobjects)
//   subscribe(fn)                → unsubscribe
//
// Note: addContext is also used by the wizard memorize step when the user
// chooses "Save as global". updateContext is used by the section-edit flow
// when scope is "Update everywhere".

import { contexts as seed } from "./mocks.js?v=44";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=2";

// Lot 15 — first-time user mode starts empty so the standalone /contexts
// page renders its empty state. Returning user keeps the mock seed.
const contexts = isNewUser() ? [] : seed.map((c) => ({ ...c }));
const notifier = createNotifier("contexts-store");

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getContexts());

function freshId() {
  // Stable-enough id for the proto: "ctx-" + base36 timestamp + random suffix.
  return `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getContexts() {
  return contexts.slice();
}

export function getContextById(id) {
  return contexts.find((c) => c.id === id) || null;
}

// The playbook a fresh chat starts with — the one flagged isDefault, else
// the first available. Returns null only when there are no playbooks at all.
export function getDefaultContext() {
  return contexts.find((c) => c.isDefault) || contexts[0] || null;
}

/**
 * Add a new global context to the store. Q2 hybrid shape — flat editable
 * fields (color, brandName, audience, briefSummary, tones, doRules,
 * dontRules, cta, usedIn) sit at the top level. The analytical sub-object
 * (analysis: {voice, brief, brand}) is preserved for the legacy accessors
 * the rest of the app reads.
 *
 * @param {object} ctx — partial Context, fields not provided default to
 *   sensible empties so the editor can render without nulls.
 * @returns {Context}
 */
export function addContext(ctx = {}) {
  // audience used to be a free-text string; the V1 brief builder makes it
  // a multi-pick array. Accept either shape so seeds and existing code
  // paths keep working (string → wrap in single-element array).
  const audienceVal = Array.isArray(ctx.audience)
    ? ctx.audience.slice()
    : typeof ctx.audience === "string" && ctx.audience.length > 0
      ? [ctx.audience]
      : [];
  const next = {
    id: ctx.id || freshId(),
    name: ctx.name || "Untitled playbook",
    color: ctx.color || "orange",
    isDefault: ctx.isDefault === true,
    // — legacy fields (kept for backwards compatibility with seeds + the
    //   ContextForm read mode) —
    brandName: ctx.brandName || "",
    briefSummary: ctx.briefSummary || "",
    doRules: Array.isArray(ctx.doRules) ? ctx.doRules.slice() : [],
    dontRules: Array.isArray(ctx.dontRules) ? ctx.dontRules.slice() : [],
    cta: ctx.cta || "",
    // — V1 brief-builder fields —
    websiteUrl: ctx.websiteUrl || "",
    sourceType: ctx.sourceType || null,
    sourceUrl: ctx.sourceUrl || ctx.websiteUrl || "",
    sourceFile: ctx.sourceFile || null,
    sourcePlatform: ctx.sourcePlatform || null,
    businessSummary: ctx.businessSummary || ctx.briefSummary || "",
    audience: audienceVal,
    audienceProblems: Array.isArray(ctx.audienceProblems) ? ctx.audienceProblems.slice() : [],
    tones: Array.isArray(ctx.tones) ? ctx.tones.slice() : [],
    voiceProfile: ctx.voiceProfile && typeof ctx.voiceProfile === "object" ? { ...ctx.voiceProfile } : null,
    contentStyle: Array.isArray(ctx.contentStyle) ? ctx.contentStyle.slice() : [],
    objective: Array.isArray(ctx.objective) ? ctx.objective.slice() : [],
    contentAction: Array.isArray(ctx.contentAction) ? ctx.contentAction.slice() : [],
    ctaLinks: Array.isArray(ctx.ctaLinks) ? ctx.ctaLinks.map((l) => ({ ...l })) : [],
    language: ctx.language || "English",
    connectedSocials: Array.isArray(ctx.connectedSocials) ? ctx.connectedSocials.slice() : [],
    selectedProfileId: ctx.selectedProfileId || null,
    imageVoice:
      ctx.imageVoice && Array.isArray(ctx.imageVoice.websites)
        ? { websites: ctx.imageVoice.websites.map((w) => ({ ...w })) }
        : { websites: [] },
    // — 3-section model: voice & style + brand identity —
    signatureHooks: Array.isArray(ctx.signatureHooks) ? ctx.signatureHooks.slice() : [],
    closingPatterns: Array.isArray(ctx.closingPatterns) ? ctx.closingPatterns.slice() : [],
    formattingStyle: ctx.formattingStyle || "",
    visualStyle: ctx.visualStyle || "",
    voiceMode: ctx.voiceMode === "manual" ? "manual" : "guided",
    voiceManual: ctx.voiceManual || "",
    brandPersonality: ctx.brandPersonality || "",
    brandTypography: ctx.brandTypography && typeof ctx.brandTypography === "object" ? { ...ctx.brandTypography } : null,
    brandColors: Array.isArray(ctx.brandColors) ? ctx.brandColors.map((c) => ({ ...c })) : [],
    referenceImages: Array.isArray(ctx.referenceImages) ? ctx.referenceImages.map((i) => ({ ...i })) : [],
    // — meta —
    usedIn: typeof ctx.usedIn === "number" ? ctx.usedIn : 0,
    updatedAt: ctx.updatedAt || "just now",
    analysis: ctx.analysis || { voice: null, brief: null, brand: null },
  };
  // Re-attach the legacy voice/brief/brand getters so old call sites stay
  // working on freshly-added contexts too.
  Object.defineProperty(next, "voice", { get: () => next.analysis?.voice, enumerable: true });
  Object.defineProperty(next, "brief", { get: () => next.analysis?.brief, enumerable: true });
  Object.defineProperty(next, "brand", { get: () => next.analysis?.brand, enumerable: true });
  contexts.push(next);
  notify();
  return next;
}

/**
 * Patch a context. Top-level fields are replaced; analysis is replaced
 * wholesale (not deep-merged) to keep the model simple. Both old keys
 * (voice/brief/brand) and new keys (color, brandName, audience,
 * briefSummary, tones, doRules, dontRules, cta, isDefault, usedIn) are
 * accepted so the migration path stays open for legacy consumers.
 *
 * @param {string} id
 * @param {object} patch
 * @returns {Context | null}
 */
export function updateContext(id, patch) {
  const c = contexts.find((x) => x.id === id);
  if (!c) return null;
  // New flat editable fields
  if (patch.name !== undefined) c.name = patch.name;
  if (patch.color !== undefined) c.color = patch.color;
  if (patch.isDefault !== undefined) c.isDefault = patch.isDefault;
  if (patch.brandName !== undefined) c.brandName = patch.brandName;
  if (patch.audience !== undefined) c.audience = patch.audience;
  if (patch.briefSummary !== undefined) c.briefSummary = patch.briefSummary;
  if (patch.tones !== undefined) c.tones = patch.tones;
  if (patch.voiceProfile !== undefined) c.voiceProfile = patch.voiceProfile;
  if (patch.doRules !== undefined) c.doRules = patch.doRules;
  if (patch.dontRules !== undefined) c.dontRules = patch.dontRules;
  if (patch.cta !== undefined) c.cta = patch.cta;
  // V1 brief-builder fields
  if (patch.websiteUrl !== undefined) c.websiteUrl = patch.websiteUrl;
  if (patch.sourceType !== undefined) c.sourceType = patch.sourceType;
  if (patch.sourceUrl !== undefined) c.sourceUrl = patch.sourceUrl;
  if (patch.sourceFile !== undefined) c.sourceFile = patch.sourceFile;
  if (patch.sourcePlatform !== undefined) c.sourcePlatform = patch.sourcePlatform;
  if (patch.businessSummary !== undefined) c.businessSummary = patch.businessSummary;
  if (patch.audienceProblems !== undefined) c.audienceProblems = patch.audienceProblems;
  if (patch.contentStyle !== undefined) c.contentStyle = patch.contentStyle;
  if (patch.objective !== undefined) c.objective = patch.objective;
  if (patch.contentAction !== undefined) c.contentAction = patch.contentAction;
  if (patch.ctaLinks !== undefined) c.ctaLinks = patch.ctaLinks;
  if (patch.imageVoice !== undefined) c.imageVoice = patch.imageVoice;
  if (patch.signatureHooks !== undefined) c.signatureHooks = patch.signatureHooks;
  if (patch.closingPatterns !== undefined) c.closingPatterns = patch.closingPatterns;
  if (patch.formattingStyle !== undefined) c.formattingStyle = patch.formattingStyle;
  if (patch.visualStyle !== undefined) c.visualStyle = patch.visualStyle;
  if (patch.voiceMode !== undefined) c.voiceMode = patch.voiceMode;
  if (patch.voiceManual !== undefined) c.voiceManual = patch.voiceManual;
  if (patch.brandPersonality !== undefined) c.brandPersonality = patch.brandPersonality;
  if (patch.brandTypography !== undefined) c.brandTypography = patch.brandTypography;
  if (patch.brandColors !== undefined) c.brandColors = patch.brandColors;
  if (patch.referenceImages !== undefined) c.referenceImages = patch.referenceImages;
  if (patch.language !== undefined) c.language = patch.language;
  if (patch.connectedSocials !== undefined) c.connectedSocials = patch.connectedSocials;
  if (patch.selectedProfileId !== undefined) c.selectedProfileId = patch.selectedProfileId;
  if (patch.usedIn !== undefined) c.usedIn = patch.usedIn;
  if (patch.updatedAt !== undefined) c.updatedAt = patch.updatedAt;
  // Legacy + analysis sub-object
  if (patch.analysis !== undefined) c.analysis = patch.analysis;
  if (patch.voice !== undefined) c.analysis = { ...(c.analysis || {}), voice: patch.voice };
  if (patch.brief !== undefined) c.analysis = { ...(c.analysis || {}), brief: patch.brief };
  if (patch.brand !== undefined) c.analysis = { ...(c.analysis || {}), brand: patch.brand };
  notify();
  return c;
}

/**
 * Duplicate a context — clones every editable field, resets usedIn /
 * isDefault, marks the name as "(copy)". Returns the new context.
 */
export function duplicateContext(id) {
  const src = contexts.find((c) => c.id === id);
  if (!src) return null;
  return addContext({
    name: `${src.name} (copy)`,
    color: src.color,
    brandName: src.brandName,
    audience: src.audience,
    briefSummary: src.briefSummary,
    tones: (src.tones || []).slice(),
    doRules: (src.doRules || []).slice(),
    dontRules: (src.dontRules || []).slice(),
    cta: src.cta,
    signatureHooks: (src.signatureHooks || []).slice(),
    closingPatterns: (src.closingPatterns || []).slice(),
    formattingStyle: src.formattingStyle || "",
    visualStyle: src.visualStyle || "",
    brandPersonality: src.brandPersonality || "",
    brandTypography: src.brandTypography ? { ...src.brandTypography } : null,
    brandColors: (src.brandColors || []).map((c) => ({ ...c })),
    isDefault: false,
    usedIn: 0,
    analysis: src.analysis ? { ...src.analysis } : { voice: null, brief: null, brand: null },
  });
}

/**
 * Delete a context. Refuses to delete the last remaining one — every chat
 * needs a context to point at. Returns true on success.
 */
export function deleteContext(id) {
  if (contexts.length <= 1) return false;
  const idx = contexts.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  contexts.splice(idx, 1);
  notify();
  return true;
}
