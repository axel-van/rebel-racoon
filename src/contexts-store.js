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
//   appendHistory(id, action)    → Context | null   (one line in the change log)
//   subscribe(fn)                → unsubscribe
//
// Ownership (ownerId / scope / history) lives here, but WHO MAY DO WHAT does
// not: that's playbook-access.js. This store keeps returning every Playbook to
// every caller on purpose — see the note at the top of that file.
//
// Note: addContext is also used by the wizard memorize step when the user
// chooses "Save as global". updateContext is used by the section-edit flow
// when scope is "Update everywhere".

import { contexts as seed, sharedContexts } from "./mocks.js?v=1150";
import { isNewUser } from "./user-mode.js?v=1150";
import { CURRENT_USER } from "./org.js?v=1150";
import { isFlagOn } from "./feature-flags.js?v=1150";
import { createNotifier } from "./store-utils.js?v=1150";
import {
  normalizeLanguages,
  mirrorPrimaryToTopLevel,
  syncTopLevelToPrimary,
  cloneVoiceByLanguage,
} from "./languages.js?v=1150";

// Lives up here, away from normalizeBrandLogos where it belongs, because the
// seed below calls that normalizer at module-init time — a `let` declared beside
// the function would still be in its temporal dead zone when the seed runs.
let brandLogoSeq = 0;
// Up here for the same reason as brandLogoSeq: the seed calls normalizeOwnership
// at module-init time, before a declaration sitting next to normalizeHistory
// would have left its temporal dead zone.
const MAX_HISTORY = 12;
let historySeq = 0;

// Lot 15 — first-time user mode starts empty so the standalone /contexts
// page renders its empty state. Returning user keeps the mock seed. Every
// seed is upgraded to the multilingual shape (languages/primaryLanguage/
// voiceByLanguage) lazily via normalizeLanguages — legacy single-language
// mocks keep rendering identically.
// Seeds bypass addContext, so anything addContext normalises has to be applied
// here too, or a seeded Playbook would render a section against `undefined`.
// The sharing seeds join the list only under their flag: with sharing off there
// is one implicit user, so a Playbook owned by a colleague — let alone one
// deliberately out of reach — would just be a stray card.
const allSeeds = isFlagOn("playbookSharing") ? [...seed, ...sharedContexts] : seed;
const contexts = isNewUser()
  ? []
  : allSeeds.map((c) =>
      normalizeLanguages({
        ...c,
        ...normalizeOwnership(c),
        ...normalizeBrandLogos(c),
        ...normalizeImageDefaults(c),
      }),
    );
const notifier = createNotifier("contexts-store");

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getContexts());

function freshId() {
  // Stable-enough id for the proto: "ctx-" + base36 timestamp + random suffix.
  return `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Competitors carry a nested socials array, so a shallow copy isn't enough —
// clone both levels and stamp an id on entries that arrive without one (the
// mock analysis and the mocks seed them without).
let competitorSeq = 0;
function normalizeCompetitors(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c) => ({
    ...c,
    id: c.id || `cmp-${(competitorSeq += 1)}`,
    name: c.name || "",
    description: c.description || "",
    websiteUrl: c.websiteUrl || "",
    logo: c.logo || "",
    socials: Array.isArray(c.socials) ? c.socials.map((s) => ({ ...s })) : [],
  }));
}

// Brand logos — a SET of marks with one resolved default.
//
// A site scrape finds several: the header lockup, the reversed one from the
// footer, the square icon, the favicon. They're all legitimately "the logo", so
// storing one string would mean throwing three away and asking the user to
// re-upload the one they actually wanted.
//
// `brandLogos` is the set; `brandLogo` stays the DEFAULT'S URL rather than
// becoming an id or a getter. Two reasons: everything downstream (the Playbook
// header, the studio's stamp, `branding-view`'s preview) already reads
// `brandLogo` and needs no change, and `snapshotEditable` JSON-round-trips the
// data, which would flatten a getter. The invariant this enforces is that
// `brandLogo` is always one of the set's urls, or "" when the set is empty.
// (`brandLogoSeq` is declared at the top of the file — see the note there.)
function normalizeBrandLogos(ctx) {
  const list = (Array.isArray(ctx.brandLogos) ? ctx.brandLogos : [])
    .filter((l) => l && l.url)
    .map((l) => ({ id: l.id || `logo-${(brandLogoSeq += 1)}`, label: l.label || "Logo", url: l.url }));
  // A context that only ever carried the single `brandLogo` (the mocks, an
  // older payload) becomes a one-entry set rather than losing its mark.
  if (!list.length && ctx.brandLogo) {
    list.push({ id: `logo-${(brandLogoSeq += 1)}`, label: "Logo", url: ctx.brandLogo });
  }
  const urls = list.map((l) => l.url);
  return {
    brandLogos: list,
    brandLogo: urls.includes(ctx.brandLogo) ? ctx.brandLogo : urls[0] || "",
  };
}

// The brand's default LOOK for generated images: what KIND of image, what
// AESTHETIC, and how a reference image should be used.
//
// Three declarative criteria, and they pass CONCEPTS §1's inclusion test the way
// `brandColors` does: they say what the brand looks like, they schedule nothing.
// The test that separates them from the listening config that LEFT this fiche —
// does removing the field change what Archie does on its own or on a cadence? For
// `enabledSourceIds`/`cadence`, yes. For a style preset, no: nothing runs, nothing
// is fetched, the value is read only at the instant a human opens a studio. What
// stays out is the RUN config — format, single/carousel, variation count — which
// answers "what job for this post?"; `formatId` already derives from the draft's
// network, a better answer than a stored preference.
//
// Shaped after `brandTypography`, not `brandLogos`: a nested plain object, one
// row in the Brand section, one line in each of the four wiring points. `""` means
// no preference — and it means two subtly different things downstream, which is
// why the studio and not this store decides: an empty `imageType`/`style` leaves
// the studio on "Any" (`null`), while an empty `refMode` falls back to the engine's
// DEFAULT_REF_MODE. So the fiche must NOT show "Blend" pre-selected on "" or it
// would claim a decision nobody made.
//
// Always exactly three string keys, never `undefined`: `snapshotEditable`
// JSON-round-trips this object and `JSON.stringify` DROPS an undefined key, so a
// two-key snapshot would make Cancel restore a differently shaped object.
// Membership is NOT validated here — that would make this store import the studio
// engine. `image-studio.js#start` does it, where the three catalogues live.
// (No id counter, so none of the module-init TDZ hazard noted at the top of this
// file applies — nothing to hoist.)
function normalizeImageDefaults(ctx) {
  const d = ctx.imageDefaults && typeof ctx.imageDefaults === "object" ? ctx.imageDefaults : {};
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  return { imageDefaults: { imageType: s(d.imageType), style: s(d.style), refMode: s(d.refMode) } };
}

// Ownership — who this Playbook belongs to and how far it reaches. Two scopes
// only: "personal" (its owner alone) or "organization" (the whole org may use
// it, the owner alone may edit it). There is no named sharing, so there is no
// recipient list to keep in sync.
//
// `history` is a governance log, not versioning: who touched the fiche and when,
// never what changed. Like `usedIn` it is stored ON the Context but is never a
// section OF it — it's read in the Share modal (see CONCEPTS.md §1, "exceptions
// de stockage").
function normalizeHistory(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((e) => e && e.action)
    .slice(-MAX_HISTORY)
    .map((e) => ({
      id: e.id || `h-${++historySeq}`,
      actorId: e.actorId || CURRENT_USER.id,
      action: e.action,
      when: e.when || "just now",
    }));
}

// The three reaches of a Playbook (doc §5.3). `members` is a FIXED list,
// `organization` a dynamic one — that difference is the thing the Share dialog
// has to make legible, and it's why they aren't one field with a count.
//
// The values are inlined rather than kept in a module-level array: the seed at
// the top of this file normalizes Playbooks while the module is still
// evaluating, and a `const` declared down here is in its TDZ at that point
// (a bare `function` is hoisted, so this one is safe to call from anywhere).
function normalizeScope(scope) {
  return scope === "members" || scope === "organization" ? scope : "personal";
}

// The named recipients. Kept whatever the scope is, so switching to private and
// back doesn't lose the list — "le passage d'un état à l'autre se fait dans les
// deux sens, sans perte de données" (doc §5.3). Only `scope` decides who's in.
function normalizeSharedWith(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => typeof id === "string" && id))];
}

function normalizeOwnership(ctx) {
  return {
    ownerId: ctx.ownerId || CURRENT_USER.id,
    scope: normalizeScope(ctx.scope),
    sharedWith: normalizeSharedWith(ctx.sharedWith),
    history: normalizeHistory(ctx.history),
  };
}

/**
 * Append one line to a Playbook's change log. Callers pass the sentence they
 * want read back ("shared it with the organisation", "edited the Voice & style
 * section") — this store never infers it, because inferring would mean diffing,
 * and there is deliberately no diff.
 *
 * @param {string} id
 * @param {string} action
 * @param {string} [actorId] — defaults to me
 * @returns {Context | null}
 */
export function appendHistory(id, action, actorId = CURRENT_USER.id) {
  const c = contexts.find((x) => x.id === id);
  if (!c || !action) return null;
  if (!Array.isArray(c.history)) c.history = [];
  c.history.push({ id: `h-${++historySeq}`, actorId, action, when: "just now" });
  // Keep the newest MAX_HISTORY: a prototype log that grows forever would push
  // the modal off screen, and nobody reads the twentieth line.
  if (c.history.length > MAX_HISTORY) c.history = c.history.slice(-MAX_HISTORY);
  notify();
  return c;
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
    // The per-label corrections the objective editor writes (measures, window,
    // grace, origin). Whitelisted so a rebuilt or patched Playbook keeps them.
    objectiveMeasures:
      ctx.objectiveMeasures && typeof ctx.objectiveMeasures === "object" ? structuredClone(ctx.objectiveMeasures) : {},
    contentAction: Array.isArray(ctx.contentAction) ? ctx.contentAction.slice() : [],
    ctaLinks: Array.isArray(ctx.ctaLinks) ? ctx.ctaLinks.map((l) => ({ ...l })) : [],
    // — multilingual model (see languages.js) — flat `language` kept as a
    //   transitional mirror of primaryLanguage.
    language: ctx.language || "English",
    languages: Array.isArray(ctx.languages) ? ctx.languages.slice() : undefined,
    primaryLanguage: ctx.primaryLanguage || undefined,
    voiceByLanguage: ctx.voiceByLanguage ? cloneVoiceByLanguage(ctx.voiceByLanguage) : undefined,
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
    // The brand marks + which one is the default (see normalizeBrandLogos).
    // Optional — a Playbook can have a voice and an audience without anyone
    // having supplied a logo, and the surfaces that use it have to say so rather
    // than stamp a placeholder.
    ...normalizeBrandLogos(ctx),
    ...normalizeImageDefaults(ctx),
    referenceImages: Array.isArray(ctx.referenceImages)
      ? ctx.referenceImages.map((i) => ({ ...i, networks: Array.isArray(i.networks) ? [...i.networks] : [] }))
      : [],
    // — competitors (name / description / website / social profiles / logo) —
    //   `suggested: true` = still a pending proposal from Archie, not yet part
    //   of the Playbook. dismissedCompetitors holds the keys of the ones the
    //   user rejected so discovery never re-proposes them.
    competitors: normalizeCompetitors(ctx.competitors),
    dismissedCompetitors: Array.isArray(ctx.dismissedCompetitors) ? ctx.dismissedCompetitors.slice() : [],
    // — ownership (owner + scope + change log; see normalizeOwnership) —
    ...normalizeOwnership(ctx),
    // — meta —
    usedIn: typeof ctx.usedIn === "number" ? ctx.usedIn : 0,
    updatedAt: ctx.updatedAt || "just now",
    analysis: ctx.analysis || { voice: null, brief: null, brand: null },
  };
  // Fill the multilingual structure (languages/primaryLanguage/voiceByLanguage)
  // then push the primary entry down onto the flat legacy fields. Safe here:
  // at construction the primary entry either came from the caller's
  // voiceByLanguage or was seeded from the flat fields — mirroring is idempotent.
  normalizeLanguages(next);
  mirrorPrimaryToTopLevel(next);
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
  if (patch.objectiveMeasures !== undefined) c.objectiveMeasures = patch.objectiveMeasures;
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
  // Re-normalised rather than assigned, so a partial patch still lands three keys.
  if (patch.imageDefaults !== undefined) Object.assign(c, normalizeImageDefaults(patch));
  // The set and its default are one fact, so they re-normalize together even
  // when only one of them is patched — otherwise a patch that drops the default
  // logo from the set would leave `brandLogo` pointing at a mark that's gone.
  if (patch.brandLogos !== undefined || patch.brandLogo !== undefined) {
    Object.assign(
      c,
      normalizeBrandLogos({
        brandLogos: patch.brandLogos !== undefined ? patch.brandLogos : c.brandLogos,
        brandLogo: patch.brandLogo !== undefined ? patch.brandLogo : c.brandLogo,
      }),
    );
  }
  if (patch.referenceImages !== undefined) c.referenceImages = patch.referenceImages;
  if (patch.competitors !== undefined) c.competitors = normalizeCompetitors(patch.competitors);
  if (patch.dismissedCompetitors !== undefined)
    c.dismissedCompetitors = Array.isArray(patch.dismissedCompetitors) ? patch.dismissedCompetitors.slice() : [];
  // — multilingual fields —
  if (patch.languages !== undefined)
    c.languages = Array.isArray(patch.languages) ? patch.languages.slice() : patch.languages;
  if (patch.primaryLanguage !== undefined) c.primaryLanguage = patch.primaryLanguage;
  if (patch.voiceByLanguage !== undefined) c.voiceByLanguage = cloneVoiceByLanguage(patch.voiceByLanguage);
  // Transitional single-language patch — map onto primaryLanguage + languages.
  if (patch.language !== undefined) {
    c.language = patch.language;
    c.primaryLanguage = patch.language;
    const rest = Array.isArray(c.languages) ? c.languages.filter((l) => l !== patch.language) : [];
    c.languages = [patch.language, ...rest];
  }
  if (patch.connectedSocials !== undefined) c.connectedSocials = patch.connectedSocials;
  if (patch.selectedProfileId !== undefined) c.selectedProfileId = patch.selectedProfileId;
  if (patch.usedIn !== undefined) c.usedIn = patch.usedIn;
  if (patch.ownerId !== undefined) c.ownerId = patch.ownerId || CURRENT_USER.id;
  if (patch.scope !== undefined) c.scope = normalizeScope(patch.scope);
  if (patch.sharedWith !== undefined) c.sharedWith = normalizeSharedWith(patch.sharedWith);
  if (patch.history !== undefined) c.history = normalizeHistory(patch.history);
  if (patch.updatedAt !== undefined) c.updatedAt = patch.updatedAt;
  // Legacy + analysis sub-object
  if (patch.analysis !== undefined) c.analysis = patch.analysis;
  if (patch.voice !== undefined) c.analysis = { ...(c.analysis || {}), voice: patch.voice };
  if (patch.brief !== undefined) c.analysis = { ...(c.analysis || {}), brief: patch.brief };
  if (patch.brand !== undefined) c.analysis = { ...(c.analysis || {}), brand: patch.brand };

  // Keep the per-language voice map and the flat legacy mirror in sync.
  const touchedLangStruct =
    patch.languages !== undefined ||
    patch.primaryLanguage !== undefined ||
    patch.voiceByLanguage !== undefined ||
    patch.language !== undefined;
  const touchedFlatVoice =
    patch.signatureHooks !== undefined ||
    patch.closingPatterns !== undefined ||
    patch.cta !== undefined ||
    patch.ctaLinks !== undefined;
  if (touchedLangStruct) {
    // voiceByLanguage / primaryLanguage are authoritative → refresh flat mirror.
    normalizeLanguages(c);
    mirrorPrimaryToTopLevel(c);
  } else if (touchedFlatVoice) {
    // Legacy caller edited the flat fields → push them into the primary entry.
    normalizeLanguages(c);
    syncTopLevelToPrimary(c);
  }

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
    languages: Array.isArray(src.languages) ? src.languages.slice() : undefined,
    primaryLanguage: src.primaryLanguage || undefined,
    voiceByLanguage: src.voiceByLanguage ? cloneVoiceByLanguage(src.voiceByLanguage) : undefined,
    signatureHooks: (src.signatureHooks || []).slice(),
    closingPatterns: (src.closingPatterns || []).slice(),
    formattingStyle: src.formattingStyle || "",
    visualStyle: src.visualStyle || "",
    brandPersonality: src.brandPersonality || "",
    brandTypography: src.brandTypography ? { ...src.brandTypography } : null,
    imageDefaults: { ...(src.imageDefaults || {}) },
    brandColors: (src.brandColors || []).map((c) => ({ ...c })),
    brandLogos: (src.brandLogos || []).map((l) => ({ ...l })),
    brandLogo: src.brandLogo || "",
    referenceImages: (src.referenceImages || []).map((i) => ({
      ...i,
      networks: Array.isArray(i.networks) ? [...i.networks] : [],
    })),
    isDefault: false,
    usedIn: 0,
    // A duplicate is MINE and starts private, whoever I copied it from — that's
    // the whole point of the action for someone reading a shared Playbook they
    // can't edit (doc §6.2). Its history starts empty: the original's log is the
    // original's, and the copy is detached, with no "duplicated from" link.
    ownerId: CURRENT_USER.id,
    scope: "personal",
    history: [],
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

// Which brand inputs the image generator would have used, and doesn't have.
//
// DÉRIVÉ, jamais stocké. Un champ de complétude posé sur le Context échouerait
// au test d'inclusion de CONCEPTS.md §1 — il bougerait sans que personne ne
// touche à l'identité de la marque, donc ce n'est pas de l'identité.
//
// Les champs listés ici ne sont PLUS tous ceux qu'`image-studio-v2/index.js` lit
// sur le Context : `imageDefaults` (le look par défaut) en est un quatrième, et il
// n'est délibérément PAS un gap — son état vide veut dire « Any », une réponse
// légitime et pas un manque. Ceux d'ici sont ceux dont l'absence change vraiment
// l'image produite (playbookLogo / playbookColors / playbookRefs). `brandName`
// retombe sur `name` et `brandLogos` dérive de `brandLogo`, donc ni l'un ni
// l'autre ne peut manquer.
//
// Le verdict ci-dessus reste vrai tel quel : il porte sur un champ de COMPLÉTUDE,
// qui bougerait sans que personne ne touche à l'identité. Trois critères de look
// déclaratifs, eux, passent le test — voir CONCEPTS.md §1.
export function getBrandKitGaps(ctx) {
  if (!ctx) return [];
  const gaps = [];
  if (!ctx.brandLogo) gaps.push({ id: "logo", label: "a logo" });
  if (!(ctx.brandColors || []).some((c) => c && c.hex)) gaps.push({ id: "colors", label: "brand colors" });
  if (!(ctx.referenceImages || []).length) gaps.push({ id: "refs", label: "reference images" });
  return gaps;
}
