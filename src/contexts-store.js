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

import { contexts as seed } from "./mocks.js?v=26";
import { isNewUser } from "./user-mode.js?v=20";

// Lot 15 — first-time user mode starts empty so the standalone /contexts
// page renders its empty state. Returning user keeps the mock seed.
const contexts = isNewUser() ? [] : seed.map((c) => ({ ...c }));
const subscribers = new Set();

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
  const next = {
    id: ctx.id || freshId(),
    name: ctx.name || "Untitled context",
    color: ctx.color || "orange",
    isDefault: ctx.isDefault === true,
    brandName: ctx.brandName || "",
    audience: ctx.audience || "",
    briefSummary: ctx.briefSummary || "",
    tones: Array.isArray(ctx.tones) ? ctx.tones.slice() : [],
    doRules: Array.isArray(ctx.doRules) ? ctx.doRules.slice() : [],
    dontRules: Array.isArray(ctx.dontRules) ? ctx.dontRules.slice() : [],
    cta: ctx.cta || "",
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
  if (patch.doRules !== undefined) c.doRules = patch.doRules;
  if (patch.dontRules !== undefined) c.dontRules = patch.dontRules;
  if (patch.cta !== undefined) c.cta = patch.cta;
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

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  const snapshot = getContexts();
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn("[contexts-store] subscriber threw", err);
    }
  });
}
