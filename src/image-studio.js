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
// locally. Crop (same-seed reframe) and the added logo/text elements produce
// faithful results; Reprompt is an honest preview (reseed). The committed url
// rides back to the draft via attachImageToDraft (see the modal component).

import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "./clip-formats.js?v=12";
// Layering note: the only import this engine takes from the view side, and a
// deliberate one — canvas.js is pure, UI-agnostic (its own header says so) and
// already shared by both studio versions. "Text in image" is mocked by baking the
// words into the generated pixels with the very same flattener the Edit overlays
// use, so there is nothing to duplicate here.
import { compositeOverlays } from "./components/image-studio/canvas.js?v=2";

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// Mock latencies — short enough to demo, long enough to read as work.
const GEN_MS = 4200; // "generating N variations" loader
const EDIT_MS = 2600; // per-edit loader
const DERIVE_MS = 2000; // "writing your image prompt" loader on open / re-suggest

export const MAX_REFS = 6;
export const VARIATION_CHOICES = [1, 2, 3, 4];

// "Text in image" — words the model paints INTO the artwork (a headline, a price,
// a date), as opposed to the Edit-mode text overlay, which is a movable layer on
// top of a finished image. Short by design: a generated headline that runs long
// stops being legible at thumbnail size.
export const MAX_RENDER_TEXT = 90;
export const RENDER_TEXT_MAX_LINES = 4;

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

// Image type — what the image is FOR (a hero visual vs a data infographic vs an
// illustration). A distinct dimension from the aesthetic style. Single-select,
// toggle-off. Rendered as selectable cards (title + short description).
export const IMAGE_TYPES = [
  { key: "visual-hook", label: "Visual hook", desc: "Eye-catching visual" },
  { key: "infographic", label: "Infographic", desc: "Data visualization" },
  { key: "illustration", label: "Illustration", desc: "Artistic imagery" },
];

// Style presets — the aesthetic look. Single-select with toggle-off; switches off
// when reference images guide the look. Rendered as filter chips.
export const STYLE_PRESETS = [
  { key: "tech-minimal", label: "Tech Minimal" },
  { key: "corporate", label: "Corporate" },
  { key: "3d-render", label: "3D Render" },
  { key: "bold-editorial", label: "Bold Editorial" },
  { key: "photoreal", label: "Photoreal" },
  { key: "hand-drawn", label: "Hand-drawn" },
];

// Curated logo presets for the "Add logo" tray (real bundled assets).
// Logos & stickers the user can stamp onto the image in the Edit "Add image"
// popover — brand marks + social badges + a few app logos (the user reaches for
// small graphics here, not big photos). Displayed contained on a white tile.
export const IMAGE_PRESETS = [
  { label: "Northwind", url: "assets/avatars/northwind-studio.svg" },
  { label: "Archie", url: "assets/logos/archie-mono.svg" },
  { label: "Archie wordmark", url: "assets/logos/archie-wordmark.svg" },
  { label: "LinkedIn", url: "assets/logos/social/linkedin.svg" },
  { label: "X", url: "assets/logos/social/x.svg" },
  { label: "Instagram", url: "assets/logos/social/instagram.svg" },
  { label: "Facebook", url: "assets/logos/social/facebook.svg" },
  { label: "YouTube", url: "assets/logos/social/youtube.svg" },
  { label: "TikTok", url: "assets/logos/social/tiktok.svg" },
  { label: "Threads", url: "assets/logos/social/threads.svg" },
  { label: "Pinterest", url: "assets/logos/social/pinterest.svg" },
  { label: "Bluesky", url: "assets/logos/social/bluesky.svg" },
  { label: "Notion", url: "assets/logos/notion.svg" },
  { label: "Slack", url: "assets/logos/slack.svg" },
  { label: "Figma", url: "assets/logos/figma.svg" },
  { label: "GitHub", url: "assets/logos/github.svg" },
];

// Text-overlay colour swatches.
export const TEXT_COLORS = ["#FFFFFF", "#0A1B33", "#FF3C00", "#178DFE"];

// Curated fonts for text overlays. `family: null` is the app default (Averta);
// the rest are bundled locally via @font-face (styles/fonts.css) so the canvas
// bake can flatten them offline. Users can also upload their own (customFonts).
export const FONT_OPTIONS = [
  { family: null, label: "Default" },
  { family: "Montserrat", label: "Montserrat" },
  { family: "Playfair Display", label: "Playfair Display" },
  { family: "Oswald", label: "Oswald" },
  { family: "Caveat", label: "Caveat" },
];

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

// A short, stable digest of a string — keeps the seed tidy while still letting
// free text take part in it.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// Seed captures the inputs so a Regenerate with the same options is stable while
// a changed option (style / mood / format / variation index / the text to render)
// reshuffles.
function seedFor(s, extra) {
  const text = (s.renderText || "").trim();
  return `${s.postId || "img"}-${s.styleKey || "s"}-${s.imageTypeKey || "t"}-${s.formatId || "f"}-${text ? hash(text) : "n"}-${extra}`;
}

// ── Text in image ───────────────────────────────────────────────────────────

// Turn the requested words into overlay specs compositeOverlays can paint. The
// mock is a centred headline: line breaks split it, the longest line sets the
// size (so a long line shrinks to fit rather than running off the frame), white
// with a soft shadow because it has to land on an unknown photo.
function renderTextOverlays(s) {
  const lines = (s.renderText || "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, RENDER_TEXT_MAX_LINES);
  if (!lines.length) return [];
  const longest = Math.max(...lines.map((l) => l.length));
  // ~14 characters fill the width at the biggest size; longer lines scale down.
  const sizeF = Math.max(0.04, Math.min(0.12, 1.7 / Math.max(14, longest)));
  const lineH = sizeF * 1.28;
  const firstY = 0.5 - ((lines.length - 1) * lineH) / 2;
  return lines.map((text, i) => ({
    kind: "text",
    text,
    xF: 0.5,
    yF: firstY + i * lineH,
    sizeF,
    rot: 0,
    bold: true,
    italic: false,
    color: "#FFFFFF",
    outline: false,
    shadow: true,
    shadowIntensity: 70,
  }));
}

// Flatten the requested text into an image's pixels. Every generated image goes
// through here, so the words live in the file itself — they survive into the
// variations grid, the in-feed preview, the Edit canvas and the draft, with no
// extra plumbing on any of those surfaces. `baseUrl` is the untouched photo, kept
// beside `url` so a re-bake (crop, redraw) never stacks text on text.
// A failure (offline, a CORS-tainted canvas) falls back to the plain photo — the
// flow must never stall on the mock.
function bakeRenderText(s, img) {
  const overlays = renderTextOverlays(s);
  const base = img.baseUrl || img.url;
  if (!overlays.length) return Promise.resolve({ ...img, baseUrl: base, url: base });
  return compositeOverlays(base, overlays, img.w, img.h)
    .then((url) => ({ ...img, baseUrl: base, url }))
    .catch(() => ({ ...img, baseUrl: base, url: base }));
}

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
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
    postText = "",
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
    currentImage = { url: editImage.url, baseUrl: editImage.url, w, h, seed: `${postId || "img"}-edit` };
    mode = "edit";
  } else if (carousel && carousel.urls && carousel.urls.length) {
    // Reopen an existing carousel to add / remove / regenerate slides.
    const [w, h] = dimsFor(resolvedFormat);
    outputMode = "carousel";
    genPhase = "results";
    slideCount = carousel.urls.length;
    variations = carousel.urls.map((url, i) => ({ seed: `${postId || "img"}-slide-${i}`, url, baseUrl: url, w, h }));
    selectedIndex = 0;
    currentImage = { url: variations[0].url, baseUrl: variations[0].url, w, h, seed: variations[0].seed };
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
    postText: String(postText || "").trim(), // the draft's copy — what derivePrompt writes the brief from (newlines kept: they split lines)
    network: net,
    formatId: resolvedFormat,
    promptText: "",
    promptLoading: false,
    renderText: "", // words to paint INTO the image (empty = none)
    styleKey: null, // selected Style preset (STYLE_PRESETS)
    imageTypeKey: null, // selected Image type (IMAGE_TYPES)
    referenceImages: initialRefs, // [{ id, url, label?, fromPlaybook? }] (max MAX_REFS)
    playbookRefs: pbRefs, // the Playbook's brand images (snapshot, for the toggle)
    playbookColors: (Array.isArray(playbookColors) ? playbookColors : []).filter(Boolean), // brand hex list for text swatches
    customTextColors: [], // custom hex colours the user added to the text swatches
    customFonts: [], // [{ family, label, url }] fonts the user uploaded (FontFace)
    playbookName: playbookName || "", // brand/playbook label for the toggle
    usePlaybookRefs, // include the Playbook brand images in the grid
    // Sections start COLLAPSED, with the exceptions below: every setting shows
    // its current value in its header and only opens if the user wants to change
    // it. Once opened a section STAYS open (the panel is not an accordion), so
    // this Set is only the starting point.
    //
    // `renderText` is NOT in here: Archie now pre-fills the headline from the
    // draft, and a section that arrives with content in it has to arrive open —
    // otherwise the studio silently decided to paint words into the image and the
    // only clue is a value in a collapsed header.
    //
    // Brand kit isn't in here either, for a different reason: it's pinned open in
    // the view and never collapses. Style preset has its own `disabled` state
    // (references guide the look), independent of this Set.
    collapsedGroups: new Set(["refs", "imageType", "style", "format", "output"]),
    composerExpanded: false, // prompt composer size: small (default) vs expanded
    variationCount: 2, // single-image mode: how many alternatives to pick from
    slideCount, // carousel mode: how many slides to generate
    variations, // [{ seed, url, w, h }] — alternatives (single) or slides (carousel)
    addingVariation: false, // a "+" generate-another is in flight
    selectedIndex,
    currentImage, // { url, w, h, seed } — the working image in edit
    editBusy: false,
    editHistory: [], // undo stack of prior currentImage snapshots
    editPrompt: "", // scratch text for the Reprompt tool
    overlays: [], // draggable logo/text elements layered on the working image
    selectedOverlayId: null,
    editingOverlayId: null, // text overlay in inline (contenteditable) edit
    openPopover: null, // edit action-bar popover open: "crop" | "logo" | "textColor"
    // Freeform crop — clicking Crop enters a draw mode: a resizable rectangle
    // (fractions of the frame) that genuinely crops the pixels on Apply. cropAspect
    // locks the box to a ratio (w/h decimal); null = unconstrained (Freeform).
    cropDrawing: false,
    cropRect: null, // { xF, yF, wF, hF } while drawing
    cropAspect: null, // null = freeform, else a width/height decimal to lock
    _genTimer: null,
    _genRun: null, // id of the newest generation run (guards the async text bake)
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
  for (const r of s.referenceImages) safeRevoke(r.url);
  for (const o of s.overlays) if (o.kind === "logo") safeRevoke(o.url);
  for (const f of s.customFonts || []) safeRevoke(f.url);
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

// Same deal for the text to render: typing must not re-render the settings (the
// row would be rebuilt under the caret). The header's value catches up on blur,
// via commitRenderText.
export function setRenderTextSilent(sessionId, text) {
  const s = states.get(sessionId);
  if (s) s.renderText = String(text || "").slice(0, MAX_RENDER_TEXT);
}

export function commitRenderText(sessionId, text) {
  const s = states.get(sessionId);
  if (!s) return;
  s.renderText = String(text || "").slice(0, MAX_RENDER_TEXT);
  notify(sessionId);
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

export function setImageType(sessionId, key) {
  const s = states.get(sessionId);
  if (!s) return;
  s.imageTypeKey = s.imageTypeKey === key ? null : key;
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

// Prompt composer size (small ↔ expanded) — expanded raises the textarea's
// max-height so a long, structured prompt fits without scrolling. Set silently
// (no re-render): the toggle mutates the composer in place so the max-height
// CSS transition can animate on the persistent node (a full re-render would
// swap the node and kill the animation) — state stays correct for later renders.
export function setComposerExpandedSilent(sessionId, value) {
  const s = states.get(sessionId);
  if (s) s.composerExpanded = !!value;
}

// ── "Suggest from this post" (mock) ─────────────────────────────────────────

// Used when the draft has no copy to work from (studio opened on an empty post).
const FALLBACK_PROMPTS = [
  "A professional executive presenting data insights in a modern office environment, photorealistic, warm lighting",
  "Bold graphic showing an upward-trending growth chart with vibrant blue and orange colors, minimalist style",
  "Diverse team collaborating around a laptop in a bright co-working space, candid photography",
  "Abstract representation of connected ideas and knowledge networks, tech aesthetic, deep blue palette",
  "Close-up of hands typing on a keyboard with data visualizations floating above, futuristic editorial style",
];

// Visual direction per image type — the bridge from "what the image is for" to a
// scene the prompt can actually describe.
const TYPE_DIRECTION = {
  "visual-hook": "One striking focal subject and generous negative space, so the image stops the scroll on its own.",
  infographic: "Clean data-led composition: a single chart or diagram as the hero, labels legible at thumbnail size.",
  illustration: "Illustrated metaphor rather than photography — flat shapes, confident linework, limited palette.",
};

// Split the draft into sentences and keep the substantial ones (hashtags, CTAs
// and one-word lines make poor visual briefs).
function sentencesOf(text) {
  return text
    .split(/(?:[.!?]+|\n+)\s*/)
    .map((s) => s.trim().replace(/^[#>\-–—•\s]+/, ""))
    .filter((s) => s.length > 12 && !/^#/.test(s));
}

// A headline for the artwork, derived from the draft the way the prompt is.
//
// The SHORTEST usable sentence wins, not the first: type baked into an image has
// to read at a glance, and a draft's opening line is usually its longest. Broken
// at a natural pause into two lines when there is one, because that is how a
// headline is set — and the field takes one line per line break.
function deriveRenderText(s) {
  const parts = sentencesOf(s.postText || "").map((t) => t.replace(/[.!?]+$/, "").trim());
  const pick = parts.filter((t) => t.length <= MAX_RENDER_TEXT).sort((a, b) => a.length - b.length)[0];
  if (!pick) return "";
  // Break on a dash / colon / comma, but only when both halves are worth a line.
  const at = pick.search(/\s[—–]\s|:\s|,\s/);
  if (at > 8 && pick.length - at > 12) {
    const head = pick.slice(0, at).trim();
    const tail = pick
      .slice(at)
      .replace(/^[\s—–:,]+/, "")
      .trim();
    return `${head}\n${tail}`;
  }
  return pick;
}

// Compose a structured image brief FROM THE DRAFT — the hook becomes the
// subject, the next line the key message, and the studio's own settings (image
// type, style, brand, format) fill in the direction. Still a mock (no model
// call), but every line traces back to something the user can see.
function derivePrompt(s) {
  const parts = sentencesOf(s.postText || "");
  if (!parts.length) {
    const id = s.postId || "p";
    return FALLBACK_PROMPTS[Math.abs(id.charCodeAt(id.length - 1)) % FALLBACK_PROMPTS.length];
  }
  // The split ate the terminal punctuation — put a full stop back so the brief
  // doesn't read as a list of fragments.
  const stop = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const hook = stop(parts[0]);
  const message = stop(parts[1] || parts[0]);
  const type = IMAGE_TYPES.find((o) => o.key === s.imageTypeKey);
  const style = STYLE_PRESETS.find((o) => o.key === s.styleKey);
  const fmt = FORMATS[s.formatId];
  const refs = s.referenceImages.length;
  const lines = [`Subject: ${hook}`, `Key message: ${message}`];
  if (type) lines.push(`Image type: ${type.label} — ${type.desc.toLowerCase()}`);
  lines.push(`Visual direction: ${TYPE_DIRECTION[s.imageTypeKey] || TYPE_DIRECTION["visual-hook"]}`);
  if (refs) {
    lines.push(
      `Look: match the ${refs} reference image${refs > 1 ? "s" : ""} provided${s.playbookName ? ` — ${s.playbookName} brand kit` : ""}.`,
    );
  } else if (style) {
    lines.push(`Look: ${style.label}.`);
  }
  if (s.playbookColors.length) lines.push(`Palette: ${s.playbookColors.slice(0, 4).join(", ")}.`);
  // Whether the artwork carries type is the user's call ("Text in image"), so the
  // composition line states whichever one they asked for rather than assuming.
  const inImage = (s.renderText || "").trim();
  if (inImage) {
    lines.push(
      `Text in image: "${inImage.replace(/\n+/g, " / ")}" — set as part of the artwork, high contrast, legible.`,
    );
  }
  if (fmt) {
    const typeClause = inImage ? "room for the headline" : "no text baked in";
    lines.push(`Composition: ${fmt.tag} ${fmt.label.toLowerCase()}, key subject off-centre, ${typeClause}.`);
  }
  return lines.join("\n");
}

export function runDerive(sessionId) {
  const s = states.get(sessionId);
  if (!s || s.promptLoading) return;
  s.promptLoading = true;
  notify(sessionId);
  s._deriveTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    // Headline first: derivePrompt reads renderText to write the "Text in image:"
    // line, so deriving it after would leave the brief and the field disagreeing.
    // Only when empty — a re-derive must never overwrite what the user typed.
    if (!cur.renderText) cur.renderText = deriveRenderText(cur);
    cur.promptText = derivePrompt(cur);
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
  s.currentImage = { url: v.url, baseUrl: v.baseUrl || v.url, w: v.w, h: v.h, seed: v.seed };
  s.editHistory = [];
  s.editPrompt = "";
  // Focusing a variation / slide is a fresh edit context — drop any overlays.
  s.overlays = [];
  s.selectedOverlayId = null;
  s.editingOverlayId = null;
  s.openPopover = null;
}

export function runGeneration(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.mode = "generate";
  s.genPhase = "generating";
  s.selectedIndex = null;
  s.variations = [];
  if (s._genTimer) clearTimeout(s._genTimer);
  const runId = Date.now().toString(36);
  s._genRun = runId; // whose results are allowed to land (see the await below)
  s._genTimer = setTimeout(async () => {
    const cur = states.get(sessionId);
    if (!cur || cur.genPhase !== "generating") return;
    const dims = dimsFor(cur.formatId);
    const count = cur.outputMode === "carousel" ? cur.slideCount : cur.variationCount;
    const shots = Array.from({ length: count }, (_, i) => {
      const seed = seedFor(cur, `${runId}-${i}`);
      const url = picsum(seed, dims);
      return { seed, url, baseUrl: url, w: dims[0], h: dims[1] };
    });
    // Any requested text is painted in BEFORE the results land, so the grid never
    // shows a frame of untyped images. The loader is already up, which is where
    // the canvas work hides.
    const baked = await Promise.all(shots.map((v) => bakeRenderText(cur, v)));
    // The studio may have closed — or a Regenerate may have started — while the
    // canvas worked. Only the newest run gets to write.
    const now = states.get(sessionId);
    if (!now || now._genRun !== runId) return;
    now.variations = baked;
    now.genPhase = "results";
    // Auto-adopt the first variation as the working image so the Edit mode
    // unlocks immediately; the user can still pick another in the grid.
    adoptVariation(now, 0);
    now._genTimer = null;
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
  // Switching mode drops any transient edit-UI state (inline text edit / open
  // action-bar popover) so we never strand it across a mode change.
  s.editingOverlayId = null;
  s.openPopover = null;
  if (mode === "generate") {
    // Leaving a carousel-slide edit via the Generate tab = cancel: drop overlays
    // + edit history and revert the working image to the focused slide (an
    // applied edit goes through updateSlide, which persists first).
    if (s.outputMode === "carousel") {
      s.overlays = [];
      s.selectedOverlayId = null;
      s.editHistory = [];
      const v = s.selectedIndex != null ? s.variations[s.selectedIndex] : null;
      if (v) s.currentImage = { url: v.url, baseUrl: v.baseUrl || v.url, w: v.w, h: v.h, seed: v.seed };
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
  s._genTimer = setTimeout(async () => {
    const cur = states.get(sessionId);
    if (!cur) return;
    const dims = dimsFor(cur.formatId);
    const seed = seedFor(cur, `add-${runId}-${cur.variations.length}`);
    const url = picsum(seed, dims);
    const shot = await bakeRenderText(cur, { seed, url, baseUrl: url, w: dims[0], h: dims[1] });
    if (!states.get(sessionId)) return; // closed mid-bake
    cur.variations.push(shot);
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
    const url = picsum(cur.seed, dims);
    return { url, baseUrl: url, w: dims[0], h: dims[1], seed: cur.seed };
  }
  // prompt → reseed at the same dimensions (mock).
  const seed = `${cur.seed}-${tool}-${stamp}`;
  const url = picsum(seed, [cur.w, cur.h]);
  return { url, baseUrl: url, w: cur.w, h: cur.h, seed };
}

export function applyEdit(sessionId, tool, payload = {}) {
  const s = states.get(sessionId);
  if (!s || !s.currentImage || s.editBusy) return;
  s.editBusy = true;
  notify(sessionId);
  if (s._editTimer) clearTimeout(s._editTimer);
  s._editTimer = setTimeout(async () => {
    const cur = states.get(sessionId);
    if (!cur) return;
    const next = computeEdit(cur, tool, payload);
    // A reframe or a redraw returns a fresh photo, so the requested text has to be
    // painted in again — otherwise one "Redraw" would silently erase it.
    const baked = await bakeRenderText(cur, next);
    if (!states.get(sessionId)) return; // closed mid-bake
    cur.editHistory.push({ ...cur.currentImage });
    cur.currentImage = baked;
    cur.editBusy = false;
    // Keep the applied tool active (segmented palette is never empty) so the
    // user can iterate — just clear the Reprompt scratch text.
    cur.editPrompt = "";
    cur._editTimer = null;
    notify(sessionId);
  }, EDIT_MS);
}

export function undoEdit(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.editHistory.length || s.editBusy) return;
  s.currentImage = s.editHistory.pop();
  notify(sessionId);
}

// ── Freeform crop (draw a rectangle) ────────────────────────────────────────

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Clamp a crop rect to the frame and enforce a minimum size so a stray click
// can't produce a zero-area crop.
function sanitizeCropRect(r) {
  const wF = Math.min(1, Math.max(0.05, r.wF));
  const hF = Math.min(1, Math.max(0.05, r.hF));
  const xF = clamp01(Math.min(r.xF, 1 - wF));
  const yF = clamp01(Math.min(r.yF, 1 - hF));
  return { xF, yF, wF, hF };
}

// Resize a rect to a target aspect (w/h, in frame pixels), centered on its
// current center, then clamp back inside the frame. frameRatio = image w/h so
// the fraction-space box matches the requested on-screen aspect.
function fitRectToAspect(r, aspect, frameRatio) {
  if (!aspect) return sanitizeCropRect(r);
  const cx = r.xF + r.wF / 2;
  const cy = r.yF + r.hF / 2;
  // aspect = wPx/hPx; wF/hF relate by the frame's own aspect (frameRatio = W/H):
  // wPx/hPx = (wF*W)/(hF*H) = (wF/hF)*frameRatio  ⇒  wF/hF = aspect/frameRatio.
  const k = aspect / (frameRatio || 1);
  let wF = r.wF;
  let hF = wF / k;
  if (hF > 1) {
    hF = 1;
    wF = hF * k;
  }
  wF = Math.min(wF, 1);
  return sanitizeCropRect({ xF: cx - wF / 2, yF: cy - hF / 2, wF, hF });
}

export function enterCropDraw(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.currentImage || s.editBusy) return;
  s.cropDrawing = true;
  s.cropAspect = null;
  s.cropRect = { xF: 0.15, yF: 0.15, wF: 0.7, hF: 0.7 };
  s.openPopover = null;
  s.selectedOverlayId = null;
  s.editingOverlayId = null;
  notify(sessionId);
}

// Silent during a drag (element updated inline for smoothness); notifying on up.
export function setCropRectSilent(sessionId, rect) {
  const s = states.get(sessionId);
  if (!s || !s.cropDrawing) return;
  s.cropRect = sanitizeCropRect(rect);
}

export function setCropRect(sessionId, rect) {
  const s = states.get(sessionId);
  if (!s || !s.cropDrawing) return;
  s.cropRect = sanitizeCropRect(rect);
  notify(sessionId);
}

export function setCropAspect(sessionId, aspect) {
  const s = states.get(sessionId);
  if (!s || !s.cropDrawing || !s.cropRect) return;
  s.cropAspect = aspect || null;
  const frameRatio = s.currentImage ? s.currentImage.w / s.currentImage.h : 1;
  s.cropRect = fitRectToAspect(s.cropRect, s.cropAspect, frameRatio);
  notify(sessionId);
}

export function cancelCropDraw(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.cropDrawing) return;
  s.cropDrawing = false;
  s.cropRect = null;
  s.cropAspect = null;
  notify(sessionId);
}

// The modal runs the async canvas crop; these two bracket it so the busy
// overlay shows and history/undo stay consistent.
export function beginCropApply(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.cropDrawing || s.editBusy) return;
  s.editBusy = true;
  notify(sessionId);
}

export function commitCrop(sessionId, { url, w, h } = {}) {
  const s = states.get(sessionId);
  if (!s || !url) return;
  s.editHistory.push({ ...s.currentImage });
  // A freeform crop is real pixels (text and all) — there is no clean photo left
  // underneath, so the cropped image is its own base.
  s.currentImage = { url, baseUrl: url, w, h, seed: `${s.currentImage.seed}-crop` };
  s.formatId = "custom"; // no preset ratio matches a freeform crop
  s.cropDrawing = false;
  s.cropRect = null;
  s.cropAspect = null;
  s.editBusy = false;
  notify(sessionId);
}

export function abortCropApply(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.editBusy = false;
  notify(sessionId);
}

// ── Overlay layer (Add logo / Add text) ─────────────────────────────────────

let overlaySeq = 0;

// Only one edit tool is active at a time: picking up an overlay (add / select)
// ends any in-progress crop. Mirrors enterCropDraw, which clears the overlay
// selection when crop takes over.
function exitCropDraw(s) {
  if (!s.cropDrawing) return;
  s.cropDrawing = false;
  s.cropRect = null;
  s.cropAspect = null;
}

const OVERLAY_DEFAULTS = {
  logo: { xF: 0.5, yF: 0.5, wF: 0.28, rot: 0 },
  // Fresh text starts clean — no bold / outline / shadow — so the user opts into
  // each effect. outlineColor / outlineWidth / shadowIntensity are the values used
  // once those effects are switched on. fontFamily null = the default (Averta).
  text: {
    text: "Your text",
    color: "#FFFFFF",
    outline: false,
    outlineColor: "#0A1B33",
    outlineWidth: 50,
    shadow: false,
    shadowIntensity: 55,
    fontFamily: null,
    sizeF: 0.09,
    bold: false,
    italic: false,
    xF: 0.5,
    yF: 0.5,
    rot: 0,
  },
};

export function addOverlay(sessionId, partial = {}) {
  const s = states.get(sessionId);
  if (!s) return null;
  overlaySeq += 1;
  const id = `ov-${overlaySeq}`;
  const overlay = { id, ...(OVERLAY_DEFAULTS[partial.kind] || {}), ...partial };
  exitCropDraw(s); // switching to the text/logo tool ends any active crop
  s.overlays.push(overlay);
  s.selectedOverlayId = id;
  // A fresh text element opens straight into inline edit (contenteditable) so
  // the user types over "Your text" immediately — no extra click.
  s.editingOverlayId = partial.kind === "text" ? id : null;
  notify(sessionId);
  return id;
}

// Add a custom hex to the shared text-colour swatches (dedup, case-insensitive)
// and apply it to the selected text overlay. `applyKey` picks which field to
// write — "color" (fill) or "outlineColor" (stroke) — so the same swatch store
// feeds both pickers. Re-renders so the new swatch shows.
export function addCustomColor(sessionId, hex, applyKey = "color") {
  const s = states.get(sessionId);
  if (!s || !hex) return;
  const h = hex.toUpperCase();
  const known = new Set(
    [...(s.playbookColors || []), ...TEXT_COLORS, ...s.customTextColors].map((c) => c.toUpperCase()),
  );
  if (!known.has(h)) s.customTextColors.push(h);
  if (s.selectedOverlayId) {
    const o = s.overlays.find((x) => x.id === s.selectedOverlayId);
    if (o) o[applyKey] = h;
  }
  notify(sessionId);
}

// Register an uploaded font (already loaded via FontFace + document.fonts.add)
// as a selectable option and apply it to the selected text overlay.
export function addCustomFont(sessionId, { family, label, url } = {}) {
  const s = states.get(sessionId);
  if (!s || !family) return;
  if (!s.customFonts.some((f) => f.family === family)) s.customFonts.push({ family, label, url });
  if (s.selectedOverlayId) {
    const o = s.overlays.find((x) => x.id === s.selectedOverlayId);
    if (o) o.fontFamily = family;
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

// Overlays paint in array order (no explicit z-index), so moving an element to
// the end of the list brings it to the front. Depth is managed implicitly:
// selecting an element promotes it above the others.
function moveOverlayToFront(s, id) {
  const i = s.overlays.findIndex((o) => o.id === id);
  if (i >= 0 && i < s.overlays.length - 1) s.overlays.push(s.overlays.splice(i, 1)[0]);
}

// Reorder-to-front without a re-render — used during a drag gesture (the modal
// moves the DOM node directly; pair with notifyOverlays on pointerup).
export function bringOverlayToFrontSilent(sessionId, id) {
  const s = states.get(sessionId);
  if (s) moveOverlayToFront(s, id);
}

export function selectOverlay(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  // Selecting a different element (or nothing) exits any inline text edit.
  if (id !== s.selectedOverlayId) s.editingOverlayId = null;
  if (id) exitCropDraw(s); // selecting an overlay ends any active crop
  s.selectedOverlayId = id;
  if (id) moveOverlayToFront(s, id); // selected element comes to the front
  notify(sessionId);
}

// Enter / leave inline (contenteditable) edit of a text overlay. Entering also
// selects it. Leave with id = null.
export function setEditingOverlay(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  s.editingOverlayId = id || null;
  if (id) {
    s.selectedOverlayId = id;
    moveOverlayToFront(s, id);
  }
  notify(sessionId);
}

// Which edit action-bar / element popover is open (one at a time): "crop" |
// "logo" | "textColor" | null.
export function setOpenPopover(sessionId, name) {
  const s = states.get(sessionId);
  if (!s) return;
  s.openPopover = name || null;
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
  if (s.editingOverlayId === id) s.editingOverlayId = null;
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
  s.variations[index] = { url, baseUrl: url, w: w || v.w, h: h || v.h, seed: `${v.seed}-e${slideEditSeq}` };
  s.selectedIndex = index;
  s.currentImage = { ...s.variations[index] };
  s.editHistory = [];
  s.overlays = [];
  s.selectedOverlayId = null;
  s.editingOverlayId = null;
  s.openPopover = null;
  s.editBusy = false;
  s.mode = "generate"; // back to the carousel results filmstrip
  notify(sessionId);
}
