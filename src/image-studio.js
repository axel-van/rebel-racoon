// Image Studio — a dedicated, full-screen "Generate an image" flow inspired by
// Adobe Firefly, running in its own `image-studio-*` session. Launched from a
// draft (post card / right-panel Drafts), it takes over the assistant panel and
// hands the chosen image back to the origin draft. Stages drive the render in
// screens/session.js (renderImageStudio):
//
//   compose    → settings rail (references + style + mood + format + variations)
//                beside a live preview frame, with a bottom prompt/Generate bar
//   generating → full-panel loader (fakes generation) → results
//   results    → grid of N seeded variations; pick one → edit (or use directly)
//   edit       → Firefly-style edit surface (tool rail + canvas + apply / undo)
//
// Mirrors the per-session state pattern of clip-studio.js: a module-local
// Map(sessionId → state) + a Map(sessionId → Set<fn>) of subscribers, with
// notify() fanning out to re-render the assistant panel.
//
// Everything is MOCKED (no real image API): generateImage returns a seeded
// Picsum URL keyed on the inputs; the edit tools reseed / composite locally.
// Only Annotation (canvas composite) and Upscale (same seed, 2× dims) produce a
// faithful result — the generative tools (Fill / Remove / Expand / Remove
// background) are honest previews. The committed url rides back to the draft via
// attachImageToDraft (see session.js).

import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "./clip-formats.js?v=4";

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// Mock latencies — short enough to demo, long enough to read as work.
const GEN_MS = 4200; // "generating N variations" loader
const EDIT_MS = 2600; // per-edit loader
const DERIVE_MS = 3200; // "suggest a prompt from this post"

export const MAX_REFS = 6;
export const VARIATION_CHOICES = [1, 2, 3, 4];

// Visual-style exemplars + moods — ported from the old generate-image modal
// (they lived nowhere else). Single-select with toggle-off, both optional.
export const STYLE_OPTIONS = [
  { key: "photorealistic", label: "Photorealistic" },
  { key: "illustration", label: "Illustration" },
  { key: "bold-graphic", label: "Bold graphic" },
  { key: "editorial", label: "Editorial photo" },
  { key: "abstract", label: "Abstract" },
];

export const MOOD_OPTIONS = [
  { key: "professional", label: "Professional" },
  { key: "energetic", label: "Energetic" },
  { key: "calm", label: "Calm" },
  { key: "inspiring", label: "Inspiring" },
  { key: "playful", label: "Playful" },
];

// Firefly-style edit tools. `mock` describes how the (faked) result is produced;
// `panel` is the contextual sub-panel a tool needs before applying:
//   - "brush"  → a canvas overlay to draw on (annotate composites; fill/remove
//                brush a region that seeds a reseed)
//   - "prompt" → a textarea describing the change (reseed)
//   - "format" → an aspect picker (reseed at the new dimensions)
//   - null     → one-click apply
export const EDIT_TOOLS = [
  { key: "prompt", label: "Reprompt", icon: "ap-icon-archie-official", panel: "prompt", faithful: false },
  { key: "annotate", label: "Annotate", icon: "ap-icon-pen", panel: "brush", faithful: true },
  { key: "fill", label: "Generative fill", icon: "ap-icon-plus", panel: "brush", faithful: false },
  { key: "remove", label: "Remove object", icon: "ap-icon-trash", panel: "brush", faithful: false },
  { key: "expand", label: "Expand", icon: "ap-icon-maximize", panel: "format", faithful: false },
  { key: "upscale", label: "Upscale", icon: "ap-icon-arrow-up", panel: null, faithful: true },
  { key: "removebg", label: "Remove background", icon: "ap-icon-cropper", panel: null, faithful: false },
  // Overlay tools — add a draggable logo / text element onto the image, then
  // flatten it in. `panel: "overlay"` renders the overlay controls.
  { key: "logo", label: "Add logo", icon: "ap-icon-file--image", panel: "overlay", faithful: true },
  { key: "text", label: "Add text", icon: "ap-icon-closed-captions", panel: "overlay", faithful: true },
];

// Curated logo presets for the "Add logo" tray (real bundled assets).
export const LOGO_PRESETS = [
  { label: "Brand", url: "assets/avatars/northwind-studio.svg" },
  { label: "Archie", url: "assets/logos/archie-mono.svg" },
  { label: "Wordmark", url: "assets/logos/archie-wordmark.svg" },
];

// Text-overlay size presets (fraction of image height).
export const TEXT_SIZES = [
  { label: "S", value: 0.06 },
  { label: "M", value: 0.09 },
  { label: "L", value: 0.14 },
];

// Text-overlay colour swatches.
export const TEXT_COLORS = ["#FFFFFF", "#0A1B33", "#FF3C00", "#178DFE"];

// Pixel dimensions per format so the mock image fills the frame at the chosen
// ratio (no letterboxing).
const FORMAT_DIMS = {
  "9:16": [720, 1280],
  "4:5": [864, 1080],
  "1:1": [1080, 1080],
  "4:3": [1080, 810],
  "16:9": [1280, 720],
};

function dimsFor(formatId) {
  return FORMAT_DIMS[formatId] || FORMAT_DIMS["1:1"];
}

function picsum(seed, [w, h]) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

// Seed captures the inputs so a Regenerate with the same options is stable while
// a changed option (style / mood / format / variation index) reshuffles.
function seedFor(s, extra) {
  return `${s.postId || "img"}-${s.styleKey || "s"}-${s.moodKey || "m"}-${s.formatId || "f"}-${extra}`;
}

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function isActive(sessionId) {
  return states.has(sessionId);
}

export function getState(sessionId) {
  return states.get(sessionId) || null;
}

// The format options to offer — the draft network's recommended set when known,
// otherwise the full catalogue.
export function formatChoices(sessionId) {
  const s = states.get(sessionId);
  const net = s?.network;
  if (net && NETWORK_FORMATS[net]) return formatsForNetwork(net);
  return Object.values(FORMATS);
}

// Decimal width/height of the active format, for the preview frame ratio.
export function activeRatio(sessionId) {
  const s = states.get(sessionId);
  return FORMATS[s?.formatId]?.ratio || 1;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
export function start(key, { postId = null, network = null, formatId = null } = {}) {
  // posts-store stores X as "twitter"; the format catalogue keys on "x".
  const net = network === "twitter" ? "x" : network || null;
  states.set(key, {
    // Two peer modes toggled via the top segmented control. "edit" is only
    // reachable once an image exists (currentImage set after generation).
    mode: "generate", // "generate" | "edit"
    genPhase: "idle", // "idle" | "generating" | "results" (generate-mode canvas)
    postId,
    network: net,
    formatId: formatId || (net ? defaultFormatFor(net) : "1:1"),
    promptText: "",
    promptLoading: false,
    styleKey: null,
    moodKey: null,
    customStyleUrl: null, // object URL of an uploaded "Your style" reference
    referenceImages: [], // [{ id, url }] (max MAX_REFS)
    variationCount: 2,
    variations: [], // [{ seed, url, w, h }]
    selectedIndex: null,
    currentImage: null, // { url, w, h, seed, upscaled?, noBg? } — the working image in edit
    activeTool: null, // one of EDIT_TOOLS keys
    editBusy: false,
    editHistory: [], // undo stack of prior currentImage snapshots
    editPrompt: "", // scratch text for the Reprompt tool
    overlays: [], // draggable logo/text elements layered on the working image
    selectedOverlayId: null,
    lastError: null,
    _genTimer: null,
    _editTimer: null,
    _deriveTimer: null,
  });
  notify(key);
}

export function exit(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s._genTimer) clearTimeout(s._genTimer);
  if (s._editTimer) clearTimeout(s._editTimer);
  if (s._deriveTimer) clearTimeout(s._deriveTimer);
  if (s.customStyleUrl) safeRevoke(s.customStyleUrl);
  for (const r of s.referenceImages) safeRevoke(r.url);
  for (const o of s.overlays) if (o.kind === "logo") safeRevoke(o.url);
  states.delete(sessionId);
  notify(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => subscribers.get(sessionId)?.delete(fn);
}

function safeRevoke(url) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

// ── Compose inputs ──────────────────────────────────────────────────────────

// Store the prompt WITHOUT notifying so typing doesn't re-render the aside
// (mirrors clip-studio's instructions textarea). The bottom-bar Generate button
// reads state.promptText at click time.
export function setPromptSilent(sessionId, text) {
  const s = states.get(sessionId);
  if (s) s.promptText = text;
}

export function setEditPromptSilent(sessionId, text) {
  const s = states.get(sessionId);
  if (s) s.editPrompt = text;
}

export function setStyle(sessionId, key) {
  const s = states.get(sessionId);
  if (!s) return;
  s.styleKey = s.styleKey === key ? null : key;
  notify(sessionId);
}

export function setCustomStyle(sessionId, url) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s.customStyleUrl) safeRevoke(s.customStyleUrl);
  s.customStyleUrl = url;
  s.styleKey = "custom";
  notify(sessionId);
}

export function setMood(sessionId, key) {
  const s = states.get(sessionId);
  if (!s) return;
  s.moodKey = s.moodKey === key ? null : key;
  notify(sessionId);
}

export function setFormat(sessionId, formatId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.formatId = formatId;
  notify(sessionId);
}

export function setVariationCount(sessionId, n) {
  const s = states.get(sessionId);
  if (!s) return;
  s.variationCount = n;
  notify(sessionId);
}

let refSeq = 0;
export function addReferenceImage(sessionId, url) {
  const s = states.get(sessionId);
  if (!s || s.referenceImages.length >= MAX_REFS) return;
  refSeq += 1;
  s.referenceImages.push({ id: `ref-${refSeq}`, url });
  notify(sessionId);
}

export function removeReferenceImage(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  const ref = s.referenceImages.find((r) => r.id === id);
  if (ref) safeRevoke(ref.url);
  s.referenceImages = s.referenceImages.filter((r) => r.id !== id);
  notify(sessionId);
}

// ── "Suggest from this post" (mock) ─────────────────────────────────────────

function derivePrompt(postId) {
  const prompts = [
    "A professional executive presenting data insights in a modern office environment, photorealistic, warm lighting",
    "Bold graphic showing an upward-trending growth chart with vibrant blue and orange colors, minimalist style",
    "Diverse team collaborating around a laptop in a bright co-working space, candid photography",
    "Abstract representation of connected ideas and knowledge networks, tech aesthetic, deep blue palette",
    "Close-up of hands typing on a keyboard with data visualizations floating above, futuristic editorial style",
  ];
  const id = postId || "p";
  return prompts[Math.abs(id.charCodeAt(id.length - 1)) % prompts.length];
}

export function runDerive(sessionId) {
  const s = states.get(sessionId);
  if (!s || s.promptLoading) return;
  s.promptLoading = true;
  notify(sessionId);
  s._deriveTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    cur.promptText = derivePrompt(cur.postId);
    cur.promptLoading = false;
    cur._deriveTimer = null;
    notify(sessionId);
  }, DERIVE_MS);
}

// ── Generation ──────────────────────────────────────────────────────────────

// Snapshot a variation as the working image, resetting any edit history so the
// selection is a fresh base for the Edit mode.
function adoptVariation(s, i) {
  const v = s.variations[i];
  if (!v) return;
  s.selectedIndex = i;
  s.currentImage = { url: v.url, w: v.w, h: v.h, seed: v.seed };
  s.editHistory = [];
  s.activeTool = null;
  s.editPrompt = "";
}

export function runGeneration(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.lastError = null;
  s.mode = "generate";
  s.genPhase = "generating";
  s.selectedIndex = null;
  s.variations = [];
  if (s._genTimer) clearTimeout(s._genTimer);
  const runId = Date.now().toString(36);
  s._genTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur || cur.genPhase !== "generating") return;
    const dims = dimsFor(cur.formatId);
    cur.variations = Array.from({ length: cur.variationCount }, (_, i) => {
      const seed = seedFor(cur, `${runId}-${i}`);
      return { seed, url: picsum(seed, dims), w: dims[0], h: dims[1] };
    });
    cur.genPhase = "results";
    // Auto-adopt the first variation as the working image so the Edit mode
    // unlocks immediately; the user can still pick another in the grid.
    adoptVariation(cur, 0);
    cur._genTimer = null;
    notify(sessionId);
  }, GEN_MS);
  notify(sessionId);
}

// Switch between the two peer modes. "edit" requires a working image.
export function setMode(sessionId, mode) {
  const s = states.get(sessionId);
  if (!s) return;
  if (mode === "edit" && !s.currentImage) return;
  s.mode = mode;
  if (mode === "generate") s.activeTool = null;
  notify(sessionId);
}

// Pick a variation from the results grid (stays in generate mode; updates the
// working image so Edit mode operates on it).
export function selectVariation(sessionId, index) {
  const s = states.get(sessionId);
  if (!s) return;
  adoptVariation(s, index);
  notify(sessionId);
}

// ── Edit surface ────────────────────────────────────────────────────────────

export function setActiveTool(sessionId, tool, { toggle = true } = {}) {
  const s = states.get(sessionId);
  if (!s || s.editBusy) return;
  s.activeTool = toggle && s.activeTool === tool ? null : tool;
  s.editPrompt = "";
  notify(sessionId);
}

// Produce the (faked) edited image. Only annotate (handled by the caller, which
// passes a composited data URL) and upscale are faithful; the rest reseed.
function computeEdit(s, tool, payload) {
  const cur = s.currentImage;
  const stamp = Date.now().toString(36);
  if (tool === "upscale") {
    const w = cur.w * 2;
    const h = cur.h * 2;
    return { url: picsum(cur.seed, [w, h]), w, h, seed: cur.seed, upscaled: true };
  }
  if (tool === "expand") {
    const fmt = payload.formatId || s.formatId;
    s.formatId = fmt; // the frame genuinely changes shape
    const dims = dimsFor(fmt);
    const seed = `${cur.seed}-exp-${stamp}`;
    return { url: picsum(seed, dims), w: dims[0], h: dims[1], seed };
  }
  if (tool === "removebg") {
    // We can't segment — present the current image on a checkerboard cutout.
    // Fresh object (no spread) so a prior Upscale badge doesn't linger.
    return { url: cur.url, w: cur.w, h: cur.h, seed: `${cur.seed}-nobg`, noBg: true };
  }
  // prompt / fill / remove → reseed at the same dimensions (mock).
  const seed = `${cur.seed}-${tool}-${stamp}`;
  return { url: picsum(seed, [cur.w, cur.h]), w: cur.w, h: cur.h, seed };
}

export function applyEdit(sessionId, tool, payload = {}) {
  const s = states.get(sessionId);
  if (!s || !s.currentImage || s.editBusy) return;

  // Annotation composites synchronously (the caller hands us a data URL of the
  // image + strokes) — no fake latency, a faithful result.
  if (tool === "annotate" && payload.dataUrl) {
    const prev = s.currentImage;
    s.editHistory.push({ ...prev });
    // Fresh object (no spread) so a prior op's badge flag doesn't linger.
    s.currentImage = { url: payload.dataUrl, w: prev.w, h: prev.h, seed: `${prev.seed}-annot` };
    s.activeTool = null;
    notify(sessionId);
    return;
  }

  s.editBusy = true;
  notify(sessionId);
  if (s._editTimer) clearTimeout(s._editTimer);
  s._editTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    cur.editHistory.push({ ...cur.currentImage });
    cur.currentImage = computeEdit(cur, tool, payload);
    cur.editBusy = false;
    cur.activeTool = null;
    cur.editPrompt = "";
    cur._editTimer = null;
    notify(sessionId);
  }, EDIT_MS);
}

export function undoEdit(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.editHistory.length || s.editBusy) return;
  s.currentImage = s.editHistory.pop();
  s.activeTool = null;
  notify(sessionId);
}

// ── Overlay layer (Add logo / Add text) ─────────────────────────────────────

let overlaySeq = 0;

const OVERLAY_DEFAULTS = {
  logo: { xF: 0.5, yF: 0.5, wF: 0.28, rot: 0 },
  text: { text: "Your text", color: "#FFFFFF", sizeF: 0.09, bold: true, outline: true, xF: 0.5, yF: 0.5, rot: 0 },
};

export function addOverlay(sessionId, partial = {}) {
  const s = states.get(sessionId);
  if (!s) return null;
  overlaySeq += 1;
  const id = `ov-${overlaySeq}`;
  const overlay = { id, ...(OVERLAY_DEFAULTS[partial.kind] || {}), ...partial };
  s.overlays.push(overlay);
  s.selectedOverlayId = id;
  notify(sessionId);
  return id;
}

// Merge a patch and re-render (for panel controls: text / colour / size…).
export function updateOverlay(sessionId, id, patch) {
  const s = states.get(sessionId);
  if (!s) return;
  const o = s.overlays.find((x) => x.id === id);
  if (!o) return;
  Object.assign(o, patch);
  notify(sessionId);
}

// Merge a patch WITHOUT re-rendering — used during a drag/resize/rotate gesture
// (the caller updates the DOM directly for smoothness); pair with notifyOverlays
// on pointerup. Mirrors caption-editor's move/commit split.
export function updateOverlaySilent(sessionId, id, patch) {
  const s = states.get(sessionId);
  if (!s) return;
  const o = s.overlays.find((x) => x.id === id);
  if (o) Object.assign(o, patch);
}

export function notifyOverlays(sessionId) {
  notify(sessionId);
}

export function selectOverlay(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  s.selectedOverlayId = id;
  notify(sessionId);
}

export function getOverlay(sessionId, id) {
  return states.get(sessionId)?.overlays.find((o) => o.id === id) || null;
}

export function removeOverlay(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  const o = s.overlays.find((x) => x.id === id);
  if (o && o.kind === "logo") safeRevoke(o.url);
  s.overlays = s.overlays.filter((x) => x.id !== id);
  if (s.selectedOverlayId === id) s.selectedOverlayId = null;
  notify(sessionId);
}

export function canUndo(sessionId) {
  const s = states.get(sessionId);
  return !!s && s.editHistory.length > 0 && !s.editBusy;
}

// The url to attach to the origin draft: the edited working image if the user
// went through edit, otherwise the selected variation.
export function commit(sessionId) {
  const s = states.get(sessionId);
  if (!s) return null;
  if (s.currentImage) return s.currentImage.url;
  if (s.selectedIndex != null) return s.variations[s.selectedIndex]?.url || null;
  return null;
}
