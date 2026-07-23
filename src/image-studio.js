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
// Picsum URL keyed on the inputs; the edit tools reseed / composite / crop
// locally. Annotation (canvas composite), Crop (same-seed reframe) and the added
// logo/text elements produce faithful results; Reprompt is an honest preview
// (reseed). The committed url rides back to the draft via attachImageToDraft
// (see the modal component).

import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "./clip-formats.js?v=5";

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// Mock latencies — short enough to demo, long enough to read as work.
const GEN_MS = 4200; // "generating N variations" loader
const EDIT_MS = 2600; // per-edit loader
const DERIVE_MS = 3200; // "suggest a prompt from this post"

export const MAX_REFS = 6;
export const VARIATION_CHOICES = [1, 2, 3, 4];

// Carousels — only some networks support a multi-slide post. Map is network →
// max slides. LinkedIn (document/carousel) and Instagram are the ones we offer.
export const CAROUSEL_MAX = { linkedin: 20, instagram: 10 };
export const SLIDE_CHOICES = [3, 4, 5, 6, 8, 10];
export function carouselMaxFor(network) {
  const net = network === "twitter" ? "x" : network || null;
  return CAROUSEL_MAX[net] || 0;
}
export function supportsCarousel(network) {
  return carouselMaxFor(network) > 0;
}

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

// Firefly-style edit tools. `panel` is the contextual sub-panel a tool needs
// before applying:
//   - "prompt" → a textarea describing the change (reseed)
//   - "format" → a ratio picker (crop the current image to the chosen aspect)
//   - "overlay"→ draggable logo / text element controls
export const EDIT_TOOLS = [
  { key: "prompt", label: "Reprompt", icon: "ap-icon-archie-official", panel: "prompt", faithful: false },
  { key: "crop", label: "Crop", icon: "ap-icon-cropper", panel: "format", faithful: true },
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
export function start(
  key,
  {
    postId = null,
    network = null,
    formatId = null,
    editImage = null,
    carousel = null,
    playbookRefs = [],
    playbookName = "",
    playbookColors = [],
  } = {},
) {
  // posts-store stores X as "twitter"; the format catalogue keys on "x".
  const net = network === "twitter" ? "x" : network || null;
  const resolvedFormat = formatId || (net ? defaultFormatFor(net) : "1:1");
  // Opening straight into Edit on the draft's existing image (post card hover →
  // "Edit"): seed it as the working image so the Edit tab is unlocked + active.
  // Dims come from the image when known (the caller refines them async via
  // setEditImageDims), otherwise the format's dims.
  let currentImage = null;
  let mode = "generate";
  let genPhase = "idle"; // "idle" | "generating" | "results" (generate-mode canvas)
  let outputMode = "single"; // "single" | "carousel" (multi-slide post)
  let variations = []; // [{ seed, url, w, h }]
  let selectedIndex = null;
  let slideCount = supportsCarousel(net) ? 4 : 0;
  // Brand reference images from the session's Playbook — prefilled into the
  // Reference images grid (marked fromPlaybook) so generated imagery stays
  // on-brand. The user can add their own or toggle the Playbook set off.
  const pbRefs = (Array.isArray(playbookRefs) ? playbookRefs : [])
    .filter((r) => r && r.url)
    .map((r, i) => ({
      id: r.id || `pb-${i}`,
      url: r.url,
      label: r.label || "",
      note: r.note || "",
      networks: Array.isArray(r.networks) ? r.networks : [],
    }));
  const usePlaybookRefs = pbRefs.length > 0;
  const initialRefs = usePlaybookRefs ? pbRefs.slice(0, MAX_REFS).map((r) => ({ ...r, fromPlaybook: true })) : [];
  if (editImage && editImage.url) {
    const [w, h] = editImage.w && editImage.h ? [editImage.w, editImage.h] : dimsFor(resolvedFormat);
    currentImage = { url: editImage.url, w, h, seed: `${postId || "img"}-edit` };
    mode = "edit";
  } else if (carousel && carousel.urls && carousel.urls.length) {
    // Reopen an existing carousel to add / remove / regenerate slides.
    const [w, h] = dimsFor(resolvedFormat);
    outputMode = "carousel";
    genPhase = "results";
    slideCount = carousel.urls.length;
    variations = carousel.urls.map((url, i) => ({ seed: `${postId || "img"}-slide-${i}`, url, w, h }));
    selectedIndex = 0;
    currentImage = { url: variations[0].url, w, h, seed: variations[0].seed };
  }
  states.set(key, {
    // Two peer modes toggled via the top segmented control. "edit" is only
    // reachable once an image exists (currentImage set after generation or
    // seeded here when editing an existing draft image).
    mode, // "generate" | "edit"
    canvasView: "image", // right-pane view: "image" | "feed" (in-feed preview)
    genPhase,
    outputMode, // single image vs multi-slide carousel (generate mode)
    postId,
    network: net,
    formatId: resolvedFormat,
    promptText: "",
    promptLoading: false,
    styleKey: null,
    moodKey: null,
    customStyleUrl: null, // object URL of an uploaded "Your style" reference
    referenceImages: initialRefs, // [{ id, url, label?, fromPlaybook? }] (max MAX_REFS)
    playbookRefs: pbRefs, // the Playbook's brand images (snapshot, for the toggle)
    playbookColors: (Array.isArray(playbookColors) ? playbookColors : []).filter(Boolean), // brand hex list for text swatches
    customTextColors: [], // custom hex colours the user added to the text swatches
    playbookName: playbookName || "", // brand/playbook label for the toggle
    usePlaybookRefs, // include the Playbook brand images in the grid
    collapsedGroups: new Set(), // generate-panel section ids the user collapsed
    variationCount: 2, // single-image mode: how many alternatives to pick from
    slideCount, // carousel mode: how many slides to generate
    variations, // [{ seed, url, w, h }] — alternatives (single) or slides (carousel)
    addingVariation: false, // a "+" generate-another is in flight
    selectedIndex,
    currentImage, // { url, w, h, seed } — the working image in edit
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

// Refine the working image's intrinsic dims once the caller has loaded it — so
// the frame ratio and the overlay bake (compositeOverlays draws base at w×h)
// match the real image rather than the format-based guess used at start().
export function setEditImageDims(key, w, h) {
  const s = states.get(key);
  if (!s || !s.currentImage || !w || !h) return;
  s.currentImage = { ...s.currentImage, w, h };
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

// Single image vs multi-slide carousel (generate mode). Only meaningful when the
// draft network supports carousels — the modal gates the control on that.
export function setOutputMode(sessionId, mode) {
  const s = states.get(sessionId);
  if (!s) return;
  s.outputMode = mode === "carousel" ? "carousel" : "single";
  if (s.outputMode === "carousel" && s.slideCount < 2) s.slideCount = 4;
  notify(sessionId);
}

export function setSlideCount(sessionId, n) {
  const s = states.get(sessionId);
  if (!s) return;
  const max = carouselMaxFor(s.network) || 10;
  s.slideCount = Math.max(2, Math.min(max, n));
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
  // Only revoke uploaded object URLs — never the Playbook's shared image URLs.
  if (ref && !ref.fromPlaybook) safeRevoke(ref.url);
  s.referenceImages = s.referenceImages.filter((r) => r.id !== id);
  notify(sessionId);
}

// Toggle ONE Playbook reference image in/out of the used set. The Playbook
// tiles are always shown in the grid; this flips whether a given one is sent
// to generation (selected) or skipped. Adds respect the MAX_REFS cap.
export function toggleReferenceImage(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  const selected = s.referenceImages.some((r) => r.id === id);
  if (selected) {
    s.referenceImages = s.referenceImages.filter((r) => r.id !== id);
  } else {
    if (s.referenceImages.length >= MAX_REFS) return;
    const pb = (s.playbookRefs || []).find((r) => r.id === id);
    if (pb) s.referenceImages.push({ ...pb, fromPlaybook: true });
  }
  // Keep the bulk flag in sync so the "Use all / Clear" chip reflects reality.
  s.usePlaybookRefs = s.referenceImages.some((r) => r.fromPlaybook);
  notify(sessionId);
}

// Toggle the Playbook's brand reference images in/out of the grid. Off = ignore
// the Playbook (user-added images are always kept); on = re-add the brand set.
export function setUsePlaybookRefs(sessionId, on) {
  const s = states.get(sessionId);
  if (!s) return;
  s.usePlaybookRefs = !!on;
  if (on) {
    for (const r of s.playbookRefs) {
      if (s.referenceImages.length >= MAX_REFS) break;
      if (!s.referenceImages.some((x) => x.id === r.id)) {
        s.referenceImages.push({ ...r, fromPlaybook: true });
      }
    }
  } else {
    s.referenceImages = s.referenceImages.filter((r) => !r.fromPlaybook);
  }
  notify(sessionId);
}

// Collapse / expand a generate-panel section (Reference images, Visual style,
// Mood, Format, …). State is per-studio so it survives the panel re-render.
export function toggleGroupCollapsed(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s.collapsedGroups.has(id)) s.collapsedGroups.delete(id);
  else s.collapsedGroups.add(id);
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
  // Focusing a variation / slide is a fresh edit context — drop any overlays.
  s.overlays = [];
  s.selectedOverlayId = null;
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
    const count = cur.outputMode === "carousel" ? cur.slideCount : cur.variationCount;
    cur.variations = Array.from({ length: count }, (_, i) => {
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

// Switch between the peer modes. "edit" requires a working image. Switching
// mode always returns the right pane to the plain image view (the in-feed
// preview is a within-mode toggle, not a persistent mode).
export function setMode(sessionId, mode) {
  const s = states.get(sessionId);
  if (!s) return;
  if (mode === "edit" && !s.currentImage) return;
  s.mode = mode;
  s.canvasView = "image";
  if (mode === "generate") {
    s.activeTool = null;
    // Leaving a carousel-slide edit via the Generate tab = cancel: drop overlays
    // + edit history and revert the working image to the focused slide (an
    // applied edit goes through updateSlide, which persists first).
    if (s.outputMode === "carousel") {
      s.overlays = [];
      s.selectedOverlayId = null;
      s.editHistory = [];
      const v = s.selectedIndex != null ? s.variations[s.selectedIndex] : null;
      if (v) s.currentImage = { url: v.url, w: v.w, h: v.h, seed: v.seed };
    }
  }
  notify(sessionId);
}

// Flip the right pane between the plain image and the in-feed network preview.
export function setCanvasView(sessionId, view) {
  const s = states.get(sessionId);
  if (!s) return;
  s.canvasView = view === "feed" ? "feed" : "image";
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

// Generate one more variation / slide from the "+" tile and append it.
const MAX_VARIATIONS = 8;
function addCap(s) {
  return s.outputMode === "carousel" ? carouselMaxFor(s.network) || MAX_VARIATIONS : MAX_VARIATIONS;
}
export function addVariation(sessionId) {
  const s = states.get(sessionId);
  if (!s || s.genPhase !== "results" || s.addingVariation || s.variations.length >= addCap(s)) return;
  s.addingVariation = true;
  notify(sessionId);
  const runId = Date.now().toString(36);
  if (s._genTimer) clearTimeout(s._genTimer);
  s._genTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    const dims = dimsFor(cur.formatId);
    const seed = seedFor(cur, `add-${runId}-${cur.variations.length}`);
    cur.variations.push({ seed, url: picsum(seed, dims), w: dims[0], h: dims[1] });
    cur.addingVariation = false;
    adoptVariation(cur, cur.variations.length - 1); // focus the fresh one
    if (cur.outputMode === "carousel") cur.slideCount = cur.variations.length;
    cur._genTimer = null;
    notify(sessionId);
  }, GEN_MS);
}

// Remove a slide from a carousel (results). Kept ≥ 2 slides — a carousel needs
// at least two. Single-image mode never shows the remove control.
export function removeVariation(sessionId, index) {
  const s = states.get(sessionId);
  if (!s || s.variations.length <= 2) return;
  s.variations.splice(index, 1);
  s.slideCount = s.variations.length;
  const sel = Math.min(s.selectedIndex ?? 0, s.variations.length - 1);
  adoptVariation(s, sel);
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

// Produce the edited image. Crop is faithful (same-seed reframe); Reprompt reseeds.
function computeEdit(s, tool, payload) {
  const cur = s.currentImage;
  const stamp = Date.now().toString(36);
  if (tool === "crop") {
    // Crop = reframe the SAME photo to a new aspect. Keeping the seed and only
    // changing the requested dimensions makes picsum return the current image
    // cropped to the ratio — a faithful reframe, not a fresh generation.
    const fmt = payload.formatId || s.formatId;
    s.formatId = fmt; // the frame genuinely changes shape
    const dims = dimsFor(fmt);
    return { url: picsum(cur.seed, dims), w: dims[0], h: dims[1], seed: cur.seed };
  }
  // prompt → reseed at the same dimensions (mock).
  const seed = `${cur.seed}-${tool}-${stamp}`;
  return { url: picsum(seed, [cur.w, cur.h]), w: cur.w, h: cur.h, seed };
}

export function applyEdit(sessionId, tool, payload = {}) {
  const s = states.get(sessionId);
  if (!s || !s.currentImage || s.editBusy) return;
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

// Add a custom hex to the text-colour swatches (dedup, case-insensitive) and
// apply it to the selected text overlay. Re-renders so the new swatch shows.
export function addCustomTextColor(sessionId, hex) {
  const s = states.get(sessionId);
  if (!s || !hex) return;
  const h = hex.toUpperCase();
  const known = new Set(
    [...(s.playbookColors || []), ...TEXT_COLORS, ...s.customTextColors].map((c) => c.toUpperCase()),
  );
  if (!known.has(h)) s.customTextColors.push(h);
  if (s.selectedOverlayId) {
    const o = s.overlays.find((x) => x.id === s.selectedOverlayId);
    if (o) o.color = h;
  }
  notify(sessionId);
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

// The ordered slide URLs to attach as a carousel (generate mode, carousel
// output). All generated slides are kept — this is not a pick-one.
export function commitCarousel(sessionId) {
  const s = states.get(sessionId);
  if (!s) return [];
  return s.variations.map((v) => v.url);
}

// Write an edited image back into a carousel slide (Edit tab on a carousel →
// "Apply to slide"). Replaces variations[index], clears the edit scratch, and
// returns to the carousel results view. The caller flattens any overlays first.
let slideEditSeq = 0;
export function updateSlide(sessionId, index, { url, w, h }) {
  const s = states.get(sessionId);
  if (!s || !s.variations[index] || !url) return;
  const v = s.variations[index];
  slideEditSeq += 1;
  s.variations[index] = { url, w: w || v.w, h: h || v.h, seed: `${v.seed}-e${slideEditSeq}` };
  s.selectedIndex = index;
  s.currentImage = { ...s.variations[index] };
  s.editHistory = [];
  s.overlays = [];
  s.selectedOverlayId = null;
  s.activeTool = null;
  s.editBusy = false;
  s.mode = "generate"; // back to the carousel results filmstrip
  notify(sessionId);
}
