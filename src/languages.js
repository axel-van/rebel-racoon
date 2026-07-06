// Language catalog + multilingual-Playbook data-model helpers.
//
// Single source of truth for the supported languages. Replaces the two
// mirrored `LANGUAGE_OPTIONS = ["English"]` constants that used to drift
// between src/playbook-view.js and src/components/right-panel.js.
//
// Data model — a Playbook (Context) is MULTILINGUAL:
//   languages: string[]         ordered; index 0 defaults primary
//   primaryLanguage: string     generation default; also mirrored to top-level
//   voiceByLanguage: {           the LANGUAGE-SCOPED written expression
//     [label]: {
//       signatureHooks: string[],
//       closingPatterns: string[],
//       cta: string,
//       ctaLabels: { [ctaLinkUrl]: string },   // labels fork per language; url stays shared
//     }
//   }
// The brand/strategy fields (audience, objective, tones, voiceProfile rules,
// formattingStyle, visualStyle, brandColors, imageVoice, do/dont rules…) stay
// language-agnostic at the top level.
//
// The flat legacy fields (signatureHooks / closingPatterns / cta /
// ctaLinks[].label) are kept as a MIRROR of the primary language so every
// reader that hasn't been migrated keeps working. Never machine-translate:
// Archie selects the native voice entry for the target language.

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

// Drop-in replacement for the old string arrays (list of labels).
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => l.label);

export const DEFAULT_LANGUAGE = "English";

export function labelForCode(code) {
  return LANGUAGES.find((l) => l.code === code)?.label || code;
}

// Build a per-language voice entry from a context's flat legacy fields.
function voiceEntryFromLegacy(ctx) {
  const ctaLabels = {};
  (Array.isArray(ctx.ctaLinks) ? ctx.ctaLinks : []).forEach((l) => {
    if (l && l.url) ctaLabels[l.url] = l.label || "";
  });
  return {
    signatureHooks: Array.isArray(ctx.signatureHooks) ? ctx.signatureHooks.slice() : [],
    closingPatterns: Array.isArray(ctx.closingPatterns) ? ctx.closingPatterns.slice() : [],
    cta: ctx.cta || "",
    ctaLabels,
  };
}

// A blank voice entry for a newly-added language — CTA urls carried over
// with empty labels so the editor can render the label inputs.
export function emptyVoiceEntry(ctx) {
  const ctaLabels = {};
  (Array.isArray(ctx?.ctaLinks) ? ctx.ctaLinks : []).forEach((l) => {
    if (l && l.url) ctaLabels[l.url] = "";
  });
  return { signatureHooks: [], closingPatterns: [], cta: "", ctaLabels };
}

// Deep-clone a voiceByLanguage map (arrays + ctaLabels object).
export function cloneVoiceByLanguage(vbl) {
  const out = {};
  Object.keys(vbl || {}).forEach((lang) => {
    const e = vbl[lang] || {};
    out[lang] = {
      signatureHooks: Array.isArray(e.signatureHooks) ? e.signatureHooks.slice() : [],
      closingPatterns: Array.isArray(e.closingPatterns) ? e.closingPatterns.slice() : [],
      cta: e.cta || "",
      ctaLabels: { ...(e.ctaLabels || {}) },
    };
  });
  return out;
}

// Push the primary language's voice entry down onto the flat legacy fields so
// unmigrated readers (post generation, brief panel) stay correct. Call after
// primaryLanguage / voiceByLanguage change.
//
// Note: ctaLinks stay language-AGNOSTIC (shared url + label, edited in the
// Audience & goals panel). Per-language CTA copy lives in entry.ctaLabels for
// generation, but we do NOT rewrite ctaLinks[].label here — that would clobber
// the shared list on every save. Only the voice examples fork per language.
export function mirrorPrimaryToTopLevel(ctx) {
  const entry = ctx.voiceByLanguage?.[ctx.primaryLanguage];
  if (!entry) return ctx;
  ctx.signatureHooks = Array.isArray(entry.signatureHooks) ? entry.signatureHooks.slice() : [];
  ctx.closingPatterns = Array.isArray(entry.closingPatterns) ? entry.closingPatterns.slice() : [];
  ctx.cta = entry.cta || "";
  return ctx;
}

// Pull the flat legacy voice fields UP into the primary language entry — used
// when a legacy caller patches top-level signatureHooks/closingPatterns/cta.
export function syncTopLevelToPrimary(ctx) {
  const primary = ctx.primaryLanguage;
  if (!primary) return ctx;
  if (!ctx.voiceByLanguage || typeof ctx.voiceByLanguage !== "object") ctx.voiceByLanguage = {};
  ctx.voiceByLanguage[primary] = voiceEntryFromLegacy(ctx);
  return ctx;
}

// Upgrade a context into the multilingual shape IN PLACE. Idempotent and safe
// on empty/undefined. Fills missing structure only — does NOT clobber existing
// flat fields (use mirrorPrimaryToTopLevel for that).
export function normalizeLanguages(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx;

  // languages[]
  let languages = Array.isArray(ctx.languages) && ctx.languages.length > 0 ? ctx.languages.slice() : null;
  if (!languages) languages = ctx.language ? [ctx.language] : [DEFAULT_LANGUAGE];
  ctx.languages = languages;

  // primaryLanguage — keep if valid, else first declared language
  ctx.primaryLanguage =
    ctx.primaryLanguage && languages.includes(ctx.primaryLanguage) ? ctx.primaryLanguage : languages[0];

  // voiceByLanguage — seed the primary from legacy flat fields if absent,
  // then guarantee an entry for every declared language.
  const vbl = ctx.voiceByLanguage && typeof ctx.voiceByLanguage === "object" ? { ...ctx.voiceByLanguage } : {};
  if (!vbl[ctx.primaryLanguage]) vbl[ctx.primaryLanguage] = voiceEntryFromLegacy(ctx);
  languages.forEach((lang) => {
    if (!vbl[lang]) vbl[lang] = emptyVoiceEntry(ctx);
  });
  ctx.voiceByLanguage = vbl;

  // Transitional mirror for any consumer still reading the scalar `language`.
  ctx.language = ctx.primaryLanguage;

  return ctx;
}
