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

import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "./clip-formats.js?v=1227";
// Layering note: the only import this engine takes from the view side, and a
// deliberate one — canvas.js is pure, UI-agnostic (its own header says so) and
// already shared by both studio versions. "Text in image" is mocked by baking the
// words into the generated pixels with the very same flattener the Edit overlays
// use, so there is nothing to duplicate here.
import { compositeOverlays } from "./image-studio-canvas.js?v=1227";

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// Mock latencies — short enough to demo, long enough to read as work.
const GEN_MS = 4200; // "generating N variations" loader
const EDIT_MS = 2600; // per-edit loader
const DERIVE_MS = 2000; // "writing your image prompt" loader on open / re-suggest
// A chip click has to answer immediately, so a re-derive gets a much shorter beat
// than the opening one — long enough that the user SEES the brief change under
// them, short enough that adjusting three settings in a row isn't a wait.
const REDERIVE_MS = 600;
export const MAX_REFS = 6;
export const VARIATION_CHOICES = [1, 2, 3, 4];

// "Text in image" — words the model paints INTO the artwork (a headline, a price,
// a date), as opposed to the Edit-mode text overlay, which is a movable layer on
// top of a finished image. Short by design: a generated headline that runs long
// stops being legible at thumbnail size.
const MAX_RENDER_TEXT = 90;
const RENDER_TEXT_MAX_LINES = 4;

// Carousels — only some networks support a multi-slide post. Map is network →
// max slides. LinkedIn (document/carousel) and Instagram are the ones we offer.
const CAROUSEL_MAX = { linkedin: 20, instagram: 10 };
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
// HOW the model should use the reference image, not WHETHER — that's the switch
// above it. "Match this image" was doing a lot of unstated work: reproducing a
// composition and borrowing a palette are two different jobs, and picking a
// reference gave you no way to say which one you meant.
//
// One catalog for all three faces of a mode — the chip's label, the hint under the
// chips, and the clause that goes in the brief — because they say the same thing
// to three different readers and drift the moment they live apart.
//
// Every clause keeps the same sentence head so the brand-kit suffix still lands and
// so anyone who ignores the control gets exactly what `match this image` meant.
export const REF_MODES = [
  {
    key: "layout",
    label: "Layout",
    hint: "Reproduce its composition and framing, with new subject matter.",
    clause: "reproduce its composition and framing, with new subject matter",
  },
  {
    key: "blend",
    label: "Blend",
    hint: "Its look, plus a light echo of one of its elements.",
    clause: "its palette, texture and treatment, plus a light echo of one of its elements",
  },
  {
    key: "style",
    // "Style only" and not "Style": the "only" IS the mode — it's what separates it
    // from Blend at a glance. It was briefly shortened because the chips had 212px
    // and it missed the row by 2.4px; the panel is one width now and they have 260,
    // so the constraint that forced it is gone.
    label: "Style only",
    hint: "Palette, texture and treatment only — none of its composition.",
    clause: "its art style only: palette, texture and treatment, none of its composition",
  },
];

export const DEFAULT_REF_MODE = "blend";

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
// bake can flatten them offline.
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

// One-click generation from a draft's empty media slot — no studio session.
//
// The studio is the place you go to *steer* an image (references, type, style,
// format, branding). When all you want is "an image for this draft", booting a
// whole modal to press one button is the long way round. This mints the same
// seeded-Picsum mock the studio does, at the network's default ratio, and hands
// it back for `attachImageToDraft`. Nothing is stored — there is no state to
// exit and nothing to commit.
//
// The nonce is what makes a second press give a second picture: the seed is
// otherwise a pure function of the draft, so Remove-then-Generate would hand
// back the identical image and read as a broken button.
let quickSeq = 0;
export function quickGenerateUrl(post) {
  if (!post) return null;
  const formatId = post.format || (post.network ? defaultFormatFor(post.network) : null) || "1:1";
  quickSeq += 1;
  const text = (post.text || []).join(" ").trim();
  const seed = `${post.id || "img"}-quick-${text ? hash(text) : "n"}-${quickSeq}`;
  return picsum(seed, dimsFor(formatId));
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
// Where the mark lands: bottom-right, always. It was choosable — nine anchors of
// a 3×3 — and the choice went unused; signing a visual in the bottom-right corner
// is the default for the same reason it's the default on paper. The fractions are
// the overlay's CENTRE, and `wF` is 0.26, so 0.78 / 0.89 leaves the same ~9%
// margin to the right as underneath.
const BRAND_MARK = { xF: 0.78, yF: 0.89, wF: 0.26 };

// The brief's palette line, in one place: derivePrompt writes it and the brand-
// colours switch splices it in and out, and those two disagreeing would show up
// as a duplicate line rather than as an error.
const PALETTE_RE = /^Palette: /;

// Null when there is nothing to say about the look — no reference AND no style
// preset — so the callers can use it to mean "this line shouldn't exist".
function lookLine(s) {
  const ref = s.referenceImages[0] || null;
  if (ref) {
    const mode = REF_MODES.find((m) => m.key === s.refMode) || REF_MODES.find((m) => m.key === DEFAULT_REF_MODE);
    // The brand kit rides in the noun phrase rather than after its own dash: the
    // mode clause already needs the dash, and two em dashes in one sentence made
    // the line read as three fragments.
    const what =
      ref.fromPlaybook && s.playbookName
        ? `the provided reference from the ${s.playbookName} brand kit`
        : "the reference image provided";
    return `Look: match ${what} — ${mode.clause}.`;
  }
  const style = STYLE_PRESETS.find((o) => o.key === s.styleKey);
  return style ? `Look: ${style.label}.` : null;
}

function paletteLine(s) {
  return `Palette: ${s.playbookColors
    .slice(0, 4)
    .map((c) => c.hex)
    .join(", ")}.`;
}

// The brand mark, at 26% of the frame's width — a wordmark has to stay readable,
// and 18% left the name too small to be one.
function brandingOverlays(s) {
  if (!s.useBranding || !s.playbookLogo) return [];
  return [{ kind: "logo", url: s.playbookLogo, ...BRAND_MARK, rot: 0 }];
}

function bakeRenderText(s, img) {
  const overlays = [...renderTextOverlays(s), ...brandingOverlays(s)];
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
    playbookLogo = "",
    playbookLogos = [],
    playbookRefs = [],
    playbookName = "",
    playbookColors = [],
    playbookImageDefaults = null,
  } = {},
) {
  // NAMED colours, filtered once here so both `playbookColors` and the switch that
  // gates them read from the same list — deriving the default from an unfiltered
  // array would turn a palette of malformed entries into a switch that's on with
  // nothing behind it.
  const brandColors = (Array.isArray(playbookColors) ? playbookColors : []).filter((c) => c && c.hex);
  // The brand's default LOOK, from the Playbook's Brand section (the "Default look"
  // row). Same shape as useBranding / useBrandColors / selectedRefId below: a default
  // DERIVED from the fiche rather than a constant.
  //
  // Membership is validated HERE and not in contexts-store, because this is where the
  // three catalogues live — a store that imported them would invert the layering. An
  // unrecognised key therefore means "no preference", never a crash and never a
  // section that opens on nothing.
  //
  // Read once, never written back: the studio reads the Playbook, it does not edit it
  // (CONCEPTS §5). The chips inside the studio mutate this state, never the Context.
  const pbLook = playbookImageDefaults && typeof playbookImageDefaults === "object" ? playbookImageDefaults : {};
  const pbImageType = IMAGE_TYPES.some((o) => o.key === pbLook.imageType) ? pbLook.imageType : null;
  const pbStyle = STYLE_PRESETS.some((o) => o.key === pbLook.style) ? pbLook.style : null;
  const pbRefMode = REF_MODES.some((m) => m.key === pbLook.refMode) ? pbLook.refMode : DEFAULT_REF_MODE;

  // Sections start COLLAPSED with the documented exceptions (the long note at
  // `collapsedGroups` below) — but a section that ARRIVES carrying a value has to
  // arrive OPEN, or the studio decided something behind a collapsed header. A
  // Playbook default is exactly that case, so it opens its own row.
  //
  // A `delete` on the constructed Set rather than a second literal: the delete says
  // WHY a row opens (it arrived carrying a value) where a second list would only say
  // which.
  //
  // Guarded on the VALIDATED values, so a typo'd key in a seed or an analysis can
  // never open an empty section. `refMode` needs nothing: `refs` is pinned open and
  // never enters this Set, so a Playbook ref mode is on screen for free (refSummary
  // prints it, e.g. "Acme · Layout").
  // "imageType" is NOT in here: that card — the Type and the words on the image — is
  // pinned open in the view, like `refs`, so it never enters this Set at all.
  const collapsedGroups = new Set(["branding", "style", "format", "output"]);
  if (pbStyle) collapsedGroups.delete("style");
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
  // ONE reference image is active at a time, taken from either pool — the
  // Playbook's brand kit or the user's own uploads. They're the same kind of
  // thing (an image the generator should look like), which is why they share one
  // section and one selection. It starts on the Playbook's first, so the first
  // generate is on-brand before the user touches anything.
  const initialSelectedRefId = pbRefs.length ? pbRefs[0].id : null;
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
    // The last text the STUDIO wrote into the field. The prompt counts as
    // hand-edited when the field has drifted from this — not when a keystroke has
    // happened, so typing a word and deleting it again leaves you clean.
    derivedPrompt: "",
    promptLoading: false,
    // A settings change parked behind the "you'll lose your edits" confirmation:
    // { kind, payload }. Non-null means the dialog is up.
    pendingSettingChange: null,
    // The user's own opt-out, ticked in that dialog. Per studio-open: exit(KEY)
    // drops it, so silencing a destructive action never outlives the session.
    skipPromptWarning: false,
    // One step of undo for a rewrite, offered in a toast.
    promptUndo: null,
    // Which half-left pane is showing: "options" or "advanced" (the brief). Advanced
    // is unreachable until an image exists, so this only ever leaves "options" after
    // a generation — see setPane.
    pane: "options",
    renderTextSeeded: false, // "Text in image" pre-suggested once at open, never re-touched after
    // Where the Suggest button is in the candidate list for the Type in play, and
    // the text it last handed over. The index walks (so pressing again offers the
    // NEXT one) and resets when the Type changes — a new Type is a new list. The
    // text is what tells the button whether the field still holds a suggestion of
    // ours ("Try another") or something the user wrote ("Suggest").
    renderTextSuggestIndex: -1,
    suggestedRenderText: "",
    renderTextLoading: false, // Suggest is writing — the button's own loading state
    briefTakenOver: false, // user hit "Edit the brief" — the words are theirs now
    briefStale: false, // a setting changed while taken over — brief no longer matches
    shotSig: null, // the inputs the shots on screen were made from (see previewStale)
    staleAckShotSig: null, // the IMAGE (shotSig) the user dismissed the "out of date" notice for (see previewStale)
    renderText: "", // words to paint INTO the image (empty = none)
    styleKey: pbStyle, // selected Style preset (STYLE_PRESETS) — the Playbook's, or null = "Any"
    imageTypeKey: pbImageType, // selected Image type (IMAGE_TYPES) — the Playbook's, or null = "Any"
    // The ACTIVE reference as an array of 0 or 1, derived from selectedRefId by
    // syncSelectedRef(). Kept in this shape because the prompt, the generation
    // seed and the style-preset lock all read "the refs in play" and none of
    // them cares how many there are.
    referenceImages: initialSelectedRefId ? [{ ...pbRefs[0], fromPlaybook: true }] : [],
    selectedRefId: initialSelectedRefId,
    lastRefId: initialSelectedRefId, // what the switch restores when turned back on
    refMode: pbRefMode, // how the model uses it — the Playbook's, else DEFAULT_REF_MODE (REF_MODES)
    playbookRefs: pbRefs, // the Playbook's brand images (snapshot)
    uploadedRefs: [], // the user's own uploads — a POOL to pick from, not the selection
    // Branding — the Playbook's logo, stamped into the corner of what's generated.
    // ON by default when the Playbook has a mark: an image made for a brand should
    // carry it unless someone says otherwise. A Playbook without one can't brand
    // anything, so the switch has nothing to offer and the section says so.
    playbookLogo: playbookLogo || "",
    // The whole SET of the Playbook's marks, not just the default. The switch
    // above stamps the default; these are what Edit mode's "Add an image" offers,
    // because the variant that suits a given visual (the reversed lockup on a dark
    // photo, the icon where a wordmark won't read) is often not the default one.
    playbookLogos: (Array.isArray(playbookLogos) ? playbookLogos : [])
      .filter((l) => l && l.url)
      .map((l, i) => ({ id: l.id || `pb-logo-${i}`, label: l.label || "Logo", url: l.url })),
    useBranding: !!playbookLogo,
    // [{ name, hex }] — NAMED, not bare hexes. Every consumer that wants the hex
    // maps for it; the Branding recap and nothing else wants the name, and two
    // parallel arrays for one palette is the kind of thing that drifts.
    playbookColors: brandColors,
    // The palette is a SEPARATE opt-out from the logo. A stamped mark and a colour
    // brief are two different impositions on an image — plenty of posts want the
    // brand's colours without its wordmark sitting in a corner, and a launch visual
    // may want the mark on someone else's artwork. One switch for both made the
    // cheap half hostage to the expensive one. ON by default, same reasoning as the
    // logo: an image made for a brand should look like it unless someone says no.
    useBrandColors: brandColors.length > 0,
    customTextColors: [], // custom hex colours the user added to the text swatches
    playbookName: playbookName || "", // brand/playbook label for the toggle
    // Sections start COLLAPSED, with the exceptions below: every setting shows
    // its current value in its header and only opens if the user wants to change
    // it. Once opened a section STAYS open (the panel is not an accordion), so
    // this Set is only the starting point.
    //
    // `refs` is NOT in here: it's pinned open in the view. `branding` IS: it
    // defaults on, but its header already says whose logo ("Branding · Acme"), and
    // a switch needs no room to be understood.
    //
    // Brand kit isn't in here either, for a different reason: it's pinned open in
    // the view and never collapses. Style preset has its own `disabled` state
    // (references guide the look), independent of this Set — which is also why no
    // guard is needed when the Playbook supplies a style AND a reference is in play:
    // `settingRow` computes `expanded = pinned || (open && !disabled)`, so the row
    // stays shut reading "From references" (nothing hidden) and opens on the
    // Playbook's value the moment the References switch goes off.
    //
    // A Playbook default un-collapses its own row — see the two `delete`s above.
    //
    // `renderText` IS in here, unlike the other things the studio decides for you:
    // nothing is pre-filled at open — the headline is seeded at generate time
    // (deriveNow) — so the section would arrive open and EMPTY, spending the ~60px
    // that decides whether all seven rows fit the half without a scroll. It fills in
    // and opens itself at that seed — see deriveNow.
    collapsedGroups,
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
  for (const r of s.uploadedRefs || []) safeRevoke(r.url);
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

// Writing the brief FROM the settings — the one place that moves both values, so
// that what the studio wrote is never mistaken for what the user typed.
function writeBrief(s, text) {
  s.promptText = text;
  s.derivedPrompt = text;
}

function isDirty(s) {
  return (s.promptText || "").trim() !== (s.derivedPrompt || "").trim();
}

// Same deal for the text to render: typing must not re-render the settings (the
// row would be rebuilt under the caret).
//
// NOT truncated at MAX_RENDER_TEXT any more, and neither is the field. The cap was
// enforced three times over — `maxlength` on the textarea plus a slice in each of
// these — which made going over impossible and left a permanent counter as the only
// way to know the limit existed. It is a legibility limit, not a data one: 90
// characters is roughly what still reads in a generated image, and past it the type
// just comes out small. So the field takes whatever you write and says so, and what
// you wrote is what gets baked.
export function setRenderTextSilent(sessionId, text) {
  const s = states.get(sessionId);
  if (s) s.renderText = String(text || "");
}

export function commitRenderText(sessionId, text) {
  const s = states.get(sessionId);
  if (!s) return;
  s.renderText = String(text || "");
  // "Text in image" is a first-class input: committing it rewrites the brief like
  // any other option.
  settingChanged(sessionId);
}

/** The over-limit line, or "" while the text fits. Here rather than in a view
    because both the first render and every keystroke ask for it, from two
    different modules, and they must not word it differently. */
export function renderTextOverMessage(text) {
  const over = (text || "").length - MAX_RENDER_TEXT;
  if (over <= 0) return "";
  return `${over} character${over > 1 ? "s" : ""} over — long text comes out small in the image.`;
}

export function setEditPromptSilent(sessionId, text) {
  const s = states.get(sessionId);
  if (s) s.editPrompt = text;
}

function applyStyle(s, key) {
  s.styleKey = s.styleKey === key ? null : key;
}

export function setStyle(sessionId, key) {
  const s = states.get(sessionId);
  if (!s) return;
  if (defer(s, sessionId, "style", key)) return;
  applyStyle(s, key);
  settingChanged(sessionId);
}

// ── The guarded settings ────────────────────────────────────────────────────
//
// Type and References are the two settings that REWRITE the brief rather than
// nudge a line of it, so touching either one throws away a hand-edited prompt.
// Each of them is therefore split in two: an `apply*` mutator that only touches
// state, and a public setter that first asks `defer()` whether the user has
// edits worth protecting. `confirmSettingChange` replays the parked intent
// through the same mutators, so the confirmed path and the clean path can't
// drift.
//
// Everything else (Style, Format, Text in image, Output) leaves the brief alone
// after the opening derive, and brand colours splices its own line — see
// syncPaletteLine, which stands down on a hand-edited prompt rather than
// clobbering it.

// Park the change behind the confirmation instead of applying it. Returns true
// when it parked, so the caller bails out.
function defer(s, sessionId, kind, payload) {
  // The brief's blocks are edited in place, and editing one IS the takeover
  // (commitBriefLine). Every option rewrites the whole brief, so once those words are
  // the user's, changing one has to ask before throwing them away.
  if (!s.briefTakenOver || s.skipPromptWarning) return false;
  s.pendingSettingChange = { kind, payload };
  notify(sessionId);
  return true;
}

function applyImageType(s, key) {
  s.imageTypeKey = s.imageTypeKey === key ? null : key;
  // A new Type is a new list of suggestions — start it from the top rather than
  // wherever the previous type's list had been walked to.
  s.renderTextSuggestIndex = -1;
}

export function setImageType(sessionId, key) {
  const s = states.get(sessionId);
  if (!s) return;
  if (defer(s, sessionId, "imageType", key)) return;
  applyImageType(s, key);
  settingChanged(sessionId);
}

function applyFormat(s, formatId) {
  s.formatId = formatId;
}

export function setFormat(sessionId, formatId) {
  const s = states.get(sessionId);
  if (!s) return;
  // Format writes the brief's Composition line, so it is one of the rewrites the guard
  // covers. Count/output are not: they change how many images, not what the brief says.
  if (defer(s, sessionId, "format", formatId)) return;
  s.formatId = formatId;
  settingChanged(sessionId);
}

export function setVariationCount(sessionId, n) {
  const s = states.get(sessionId);
  if (!s) return;
  s.variationCount = n;
  settingChanged(sessionId);
}

// Single image vs multi-slide carousel (generate mode). Only meaningful when the
// draft network supports carousels — the modal gates the control on that.
export function setOutputMode(sessionId, mode) {
  const s = states.get(sessionId);
  if (!s) return;
  s.outputMode = mode === "carousel" ? "carousel" : "single";
  if (s.outputMode === "carousel" && s.slideCount < 2) s.slideCount = 4;
  settingChanged(sessionId);
}

export function setSlideCount(sessionId, n) {
  const s = states.get(sessionId);
  if (!s) return;
  const max = carouselMaxFor(s.network) || 10;
  s.slideCount = Math.max(2, Math.min(max, n));
  settingChanged(sessionId);
}

// Every candidate the user can pick from, brand kit first — the one grid the
// References section renders. `fromPlaybook` is what tells the two apart in the
// view (labels, and which URLs are safe to revoke).
export function referencePool(s) {
  if (!s) return [];
  return [
    ...(s.playbookRefs || []).map((r) => ({ ...r, fromPlaybook: true })),
    ...(s.uploadedRefs || []).map((r) => ({ ...r, fromPlaybook: false })),
  ];
}

export function selectedReference(s) {
  if (!s || !s.selectedRefId) return null;
  return referencePool(s).find((r) => r.id === s.selectedRefId) || null;
}

// `referenceImages` is derived, never assigned from the outside: every mutator
// below changes `selectedRefId` and calls this. One writer keeps the derived
// array honest without a getter (state is a plain object).
//
// It also re-writes the brief's look line, so the ONE sentence the References
// section produces is never left describing an image that is no longer in play —
// switching references off used to leave "Look: match the reference image
// provided" behind, and that line now carries the mode too, which made a stale one
// louder. A no-op before the brief exists (spliceBriefLine bails on empty text).
function syncSelectedRef(s) {
  const picked = selectedReference(s);
  s.referenceImages = picked ? [picked] : [];
}

let refSeq = 0;
// An upload joins the pool AND becomes the selection — you dropped it because
// you want this image, so making you click it again would be ceremony. The cap
// bounds the POOL, not a multi-selection: past it the grid stops being scannable.
// An upload NEVER gets thrown away by a confirmation. The file lands in the pool
// unconditionally; only SELECTING it (which is what rewrites the brief) is
// guarded. So cancelling a drop onto a hand-edited prompt leaves the image sitting
// there, unselected, instead of discarding what the user just dragged in.
export function addReferenceImage(sessionId, url) {
  const s = states.get(sessionId);
  if (!s || s.uploadedRefs.length >= MAX_REFS) return;
  refSeq += 1;
  const ref = { id: `ref-${refSeq}`, url };
  s.uploadedRefs.push(ref);
  if (defer(s, sessionId, "selectRef", ref.id)) return; // in the pool, not picked
  applySelectRef(s, ref.id);
  settingChanged(sessionId);
}

// Drops an upload from the pool for good. Playbook images can't be removed —
// they belong to the Playbook, and deselecting is what "not this one" means.
function applyRemoveRef(s, id) {
  const ref = s.uploadedRefs.find((r) => r.id === id);
  if (!ref) return false;
  safeRevoke(ref.url); // only ever an uploaded object URL — never a Playbook URL
  s.uploadedRefs = s.uploadedRefs.filter((r) => r.id !== id);
  if (s.selectedRefId === id) s.selectedRefId = null;
  syncSelectedRef(s);
  return true;
}

export function removeReferenceImage(sessionId, id) {
  const s = states.get(sessionId);
  if (!s || !s.uploadedRefs.some((r) => r.id === id)) return;
  // Removing the image the brief describes rewrites it; removing any other one
  // doesn't, so it needs no confirmation.
  const inPlay = s.selectedRefId === id;
  if (inPlay && defer(s, sessionId, "removeRef", id)) return;
  if (!applyRemoveRef(s, id)) return;
  if (inPlay) settingChanged(sessionId);
  else notify(sessionId);
}

// Stamp the Playbook's logo into what gets generated, or don't. A no-op without a
// logo — there is nothing to turn on.
function applyUseBranding(s, on) {
  s.useBranding = !!on;
}

export function setUseBranding(sessionId, on) {
  const s = states.get(sessionId);
  if (!s || !s.playbookLogo) return;
  if (defer(s, sessionId, "useBranding", !!on)) return;
  s.useBranding = !!on;
  settingChanged(sessionId);
}

// Send the Playbook's palette to the model, or don't. A no-op without colours —
// same contract as setUseBranding, and for the same reason: a switch that can't
// change anything shouldn't pretend it did.
function applyUseBrandColors(s, on) {
  s.useBrandColors = !!on;
  syncPaletteLine(s);
}

export function setUseBrandColors(sessionId, on) {
  const s = states.get(sessionId);
  if (!s || !s.playbookColors.length) return;
  if (defer(s, sessionId, "useBrandColors", !!on)) return;
  s.useBrandColors = !!on;
  syncPaletteLine(s);
  settingChanged(sessionId);
}

// A setting reaches the model through exactly ONE line of the brief, and the brief
// is only written when the studio opens — so a control that owns a line has to edit
// that line in place. Re-deriving the whole thing would throw away every word the
// user typed; leaving the text alone would make the control inert for the
// generation they are about to run, since Generate sends the field, not the
// settings.
//
// Surgical on purpose: it adds, replaces or removes its own line and touches
// nothing else. `line` of null means "this line should not exist".
//
// `after` is the prefixes to sit behind when inserting, most-preferred first —
// derivePrompt's own order, so the brief doesn't end up reading differently
// depending on which control the user touched first.
function spliceBriefLine(s, re, line, after) {
  const text = s.promptText || "";
  if (!text.trim()) return; // nothing derived yet — derivePrompt will get it right
  const lines = text.split("\n");
  const at = lines.findIndex((l) => re.test(l));
  if (at >= 0) {
    if (line) lines[at] = line;
    else lines.splice(at, 1);
  } else if (line) {
    let idx = -1;
    for (const prefix of after) {
      idx = lines.findIndex((l) => l.startsWith(prefix));
      if (idx >= 0) break;
    }
    lines.splice(idx < 0 ? lines.length : idx + 1, 0, line);
  } else {
    return;
  }
  s.promptText = lines.join("\n");
}

// Brand colours edit their own line in place rather than re-deriving, because the
// switch is cheap and re-deriving would be a sledgehammer. The exception is a
// hand-edited prompt: splicing into one would silently replace a line the user
// may have written, and this setting is not worth a confirmation dialog. So it
// stands down — the switch still governs the NEXT derive, it just stops rewriting
// text it no longer owns.
function syncPaletteLine(s) {
  if (isDirty(s)) return;
  const on = s.useBrandColors && s.playbookColors.length > 0;
  spliceBriefLine(s, PALETTE_RE, on ? paletteLine(s) : null, ["Look:", "Visual direction:"]);
  s.derivedPrompt = s.promptText; // the studio wrote this, so it stays "clean"
}

// Every reference control ends here: the switch, the tile you pick, and the mode.
// All three change what that one line says, and none of them is allowed to leave a
// line describing a reference that is no longer in play.

// How the model should use the reference. Only ever one of the catalog's keys — a
// bad value here would silently fall back to Blend and the chips would disagree
// with the brief.
export function setRefMode(sessionId, key) {
  const s = states.get(sessionId);
  if (!s || !REF_MODES.some((m) => m.key === key) || s.refMode === key) return;
  if (defer(s, sessionId, "refMode", key)) return;
  s.refMode = key;
  settingChanged(sessionId);
}

// Whether the generator gets a reference image AT ALL. This is the switch at the
// top of the section, and it owns the "none" state on its own — which is why the
// tiles below are a plain radio group with no toggle-off: two ways to reach the
// same nothing is one too many.
//
// Off remembers the pick so switching back doesn't make the user find it again;
// on restores it, or falls back to the first image available.
function applyUseReference(s, on) {
  if (on) {
    const pool = referencePool(s);
    const back = pool.some((r) => r.id === s.lastRefId) ? s.lastRefId : pool[0]?.id || null;
    s.selectedRefId = back;
  } else {
    if (s.selectedRefId) s.lastRefId = s.selectedRefId;
    s.selectedRefId = null;
  }
  syncSelectedRef(s);
}

export function setUseReference(sessionId, on) {
  const s = states.get(sessionId);
  if (!s) return;
  if (defer(s, sessionId, "useReference", !!on)) return;
  applyUseReference(s, !!on);
  settingChanged(sessionId);
}

// Pick THE reference image — single-select across both pools. Clicking the picked
// one is a no-op, not a clear: the switch above is what turns references off, and
// a radio group that can empty itself by re-click is a trap you fall into.
function applySelectRef(s, id) {
  s.selectedRefId = id;
  s.lastRefId = id;
  syncSelectedRef(s);
}

export function toggleReferenceImage(sessionId, id) {
  const s = states.get(sessionId);
  if (!s || s.selectedRefId === id) return;
  if (!referencePool(s).some((r) => r.id === id)) return;
  if (defer(s, sessionId, "selectRef", id)) return;
  applySelectRef(s, id);
  settingChanged(sessionId);
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

// The stage's left half: which pane is showing. "advanced" (the brief) is only reachable
// once there is an image, since the brief describes one — the chip is disabled
// until then, and this refuses the switch as well so a stale click can't slip past
// a re-render.
export function setPane(sessionId, pane) {
  const s = states.get(sessionId);
  if (!s) return;
  const next = pane === "advanced" ? "advanced" : "options";
  if (next === "advanced" && !s.variations.length && !s.currentImage) return;
  if (s.pane === next) return;
  s.pane = next;
  notify(sessionId);
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

// The draft's sentences that could be set as type, SHORTEST FIRST — not first
// first: type baked into an image has to read at a glance, and a draft's opening
// line is usually its longest.
function renderTextPool(s) {
  return sentencesOf(s.postText || "")
    .map((t) => t.replace(/[.!?]+$/, "").trim())
    .filter((t) => t.length <= MAX_RENDER_TEXT)
    .sort((a, b) => a.length - b.length);
}

// Set as a headline is: broken at a natural pause when there is one, because the
// field takes one line per line break. Only when both halves are worth a line.
function twoLines(pick) {
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

// A headline for the artwork, derived from the draft the way the prompt is. This
// is the UNASKED seed (deriveNow, once per studio): the first candidate the Type
// in play would suggest, so the seed and the Suggest button can never disagree
// about what a good headline for this image looks like.
function deriveRenderText(s) {
  return suggestionsFor(s)[0] || "";
}

// ── Suggesting the words, in the shape the TYPE asks for ─────────────────────
//
// The three types want three different kinds of type set into them, which is the
// whole reason Suggest reads the Type rather than just the draft:
//
//   Visual hook   a headline — the draft's sharpest line, broken like one
//   Infographic   a figure and what it counts, never a sentence
//   Illustration  a concept in a breath: two or three words, no punctuation
//
// A LIST, not one answer, so pressing the button again offers the next one instead
// of re-suggesting what the user just declined. Mock, like everything else the
// studio "writes" — but every candidate traces back to a line of the draft.

// Words that carry no weight on their own — a fragment must not end on one.
const TRAILING_STOPWORDS =
  /^(?:the|a|an|and|or|of|to|in|on|for|with|by|at|from|that|which|who|is|are|was|were|it|its|as|but|so)$/i;

// A fragment must not START or END on a word that carries nothing — "and ship less"
// and "Teams who" are both the seam of a sentence rather than a phrase.
function trimFragment(words) {
  const out = [...words];
  while (out.length > 1 && TRAILING_STOPWORDS.test(out[out.length - 1])) out.pop();
  while (out.length > 1 && TRAILING_STOPWORDS.test(out[0])) out.shift();
  return out.join(" ").replace(/^[.,;:!?]+|[.,;:!?]+$/g, "");
}

// A figure and what it counts, pulled out of whichever sentences carry a number.
//
// `\b\d` on purpose: it matches a figure standing on its own and NOT the 2 inside
// "Q2", which is how a first pass produced the memorable "2 / Your Q plan isn't".
// The label is what FOLLOWS the figure — that is the clause the number belongs to —
// and only falls back to what precedes it when the figure ends its sentence.
function statLines(s) {
  const out = [];
  for (const line of sentencesOf(s.postText || "")) {
    const m = line.match(/\b\d[\d.,]*\s?(?:%|x|×)?/);
    if (!m) continue;
    const after = line
      .slice(m.index + m[0].length)
      .split(/\s+/)
      .filter(Boolean);
    const before = line.slice(0, m.index).split(/\s+/).filter(Boolean);
    const label = after.length >= 2 ? trimFragment(after.slice(0, 4)) : trimFragment(before.slice(-4));
    if (label.length > 3) out.push(`${m[0].trim()}\n${label}`);
  }
  return out;
}

// Two or three words for a concept — taken off the END of a usable line, not the
// front. A sentence's opening is its setup ("Teams who track…"); what it is ABOUT
// tends to sit at the close ("…ship on cadence", "…a wish list").
function conceptLines(s) {
  return renderTextPool(s)
    .map((t) => trimFragment(t.split(/\s+/).slice(-3)))
    .filter((t) => t.length > 6);
}

// What a type suggests when the draft gives nothing to work with — an empty draft,
// or one made entirely of hashtags. The button must always have something to hand
// back: a control that sometimes silently does nothing is worse than no control.
const SUGGEST_FALLBACKS = {
  "visual-hook": ["The part\nnobody mentions", "Read this\nbefore you post", "One change,\nthree weeks"],
  infographic: ["3 numbers\nthat matter", "Before\nafter", "What the data says"],
  illustration: ["A better way", "Where it starts", "The long game"],
};

function suggestionsFor(s) {
  const key = IMAGE_TYPES.some((o) => o.key === s.imageTypeKey) ? s.imageTypeKey : "visual-hook";
  let list;
  if (key === "infographic") list = [...statLines(s), ...renderTextPool(s).map(twoLines)];
  else if (key === "illustration") list = conceptLines(s);
  else list = renderTextPool(s).map(twoLines);
  list = [...new Set(list.map((t) => t.trim()).filter(Boolean))].slice(0, 4);
  return list.length ? list : SUGGEST_FALLBACKS[key];
}

// Press it again and you get the next candidate, not the same one: the index walks
// the list and wraps. Marked `renderTextSeeded`, because the studio has now written
// here on purpose — the unasked seed at generate time must not fire on top of it.
//
// It takes a BEAT, and the button says so (`renderTextLoading` → the DS loading state,
// events are off while it runs). `suggestionsFor` is a pure function, so the two
// seconds are staged — the same staging as the 4.2s generate and the brief's own
// loader at open, and for the same reason: asking Archie for words is a request to
// Archie, and an answer that lands before the finger leaves the button doesn't read as
// one. It is also the only honest shape for the day a model writes these.
export function suggestRenderText(sessionId) {
  const s = states.get(sessionId);
  // Already writing: the timer reads state when it FIRES, so a second press would
  // produce the same walk. Dropping it is right — same rule as runDerive.
  if (!s || s.renderTextLoading) return;
  s.renderTextLoading = true;
  notify(sessionId);
  s._suggestTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return; // the studio closed under it — exit(KEY) dropped the state
    cur.renderTextLoading = false;
    cur._suggestTimer = null;
    writeSuggestion(cur, sessionId);
  }, DERIVE_MS);
}

function writeSuggestion(s, sessionId) {
  const list = suggestionsFor(s);
  s.renderTextSuggestIndex = (s.renderTextSuggestIndex + 1) % list.length;
  s.renderText = list[s.renderTextSuggestIndex];
  s.suggestedRenderText = s.renderText;
  s.renderTextSeeded = true;
  // The brief follows the words IMMEDIATELY — `settingChangedNow`, not
  // `settingChanged`. The wait already happened, on the button; a second beat of 600ms
  // would only add a repaint that rebuilds the textarea under anyone who started
  // editing the suggestion the moment it landed, taking their caret with it.
  settingChangedNow(s, sessionId);
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
  const fmt = FORMATS[s.formatId];
  const lines = [`Subject: ${hook}`, `Key message: ${message}`];
  if (type) lines.push(`Image type: ${type.label} — ${type.desc.toLowerCase()}`);
  lines.push(`Visual direction: ${TYPE_DIRECTION[s.imageTypeKey] || TYPE_DIRECTION["visual-hook"]}`);
  const look = lookLine(s);
  if (look) lines.push(look);
  if (s.useBrandColors && s.playbookColors.length) lines.push(paletteLine(s));
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

function runDerive(sessionId, { delay = DERIVE_MS } = {}) {
  const s = states.get(sessionId);
  // Already writing: the pending timer reads state when it FIRES, so a second
  // trigger during the window would produce the same text. Dropping it is right.
  if (!s || s.promptLoading) return;
  s.promptLoading = true;
  notify(sessionId);
  s._deriveTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    // Headline first: derivePrompt reads renderText to write the "Text in image:"
    // line, so deriving it after would leave the brief and the field disagreeing.
    //
    // Seeded ONCE, then no option ever rewrites it again — which is what stops
    // touching Type from moving two fields at a time. Only when empty, so the seed
    // can never overwrite what the user typed.
    if (!cur.renderTextSeeded) {
      if (!cur.renderText) cur.renderText = deriveRenderText(cur);
      cur.renderTextSeeded = true;
    }
    writeBrief(cur, derivePrompt(cur));
    cur.promptLoading = false;
    cur._deriveTimer = null;
    notify(sessionId);
  }, delay);
}

// A settings-driven rewrite: same derive, shorter beat, and it remembers the text
// it is about to replace so the toast can offer one step back. Only worth an undo
// when there was something of the user's to lose.
function rederive(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.promptUndo = isDirty(s) ? { text: s.promptText, derived: s.derivedPrompt } : null;
  runDerive(sessionId, { delay: REDERIVE_MS });
}

// The brief is written AT generate time rather than at open, and written
// SYNCHRONOUSLY: derivePrompt is a pure function — the DERIVE_MS beat is theatre —
// so there is nothing to wait for, and a beat here would only leave the Generate
// button dead for two seconds on a screen that never shows the brief anyway. The
// 4200ms generating loader is where the work reads as work.
//
// This is also what makes the Advanced tab honest: the text it holds is the prompt
// that produced the image on screen, not a draft of one.
//
// A brief the user took over is left exactly as they wrote it — Generate uses their
// words. `briefStale` is cleared because regenerating from those words is precisely
// the answer to "you changed the options after editing this".
export function deriveNow(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s.briefTakenOver) {
    s.briefStale = false;
    return;
  }
  if (!s.renderTextSeeded) {
    if (!s.renderText) s.renderText = deriveRenderText(s);
    s.renderTextSeeded = true;
    // Nothing to open: the card holding those words is pinned. It used to un-collapse
    // itself here, because the seed is the one moment the studio puts words into the
    // image unasked and a collapsed row would have been the only clue.
  }
  writeBrief(s, derivePrompt(s));
}

// ── One rule for every option ────────────────────────────────────────────────
//
// The brief is a faithful, always-in-sync output of the options — so ANY option
// change rewrites it. The one exception is a brief the user has taken over: we
// don't clobber their words, we flag that the brief no longer matches the options
// and let them rebuild on their terms.
// The same rewrite as `settingChanged`, minus the loader and the timer: derivePrompt
// is a pure function, so a beat only makes sense where the user is waiting for the
// answer. Use it for a change whose result is already on screen.
function settingChangedNow(s, sessionId) {
  if (s.briefTakenOver) s.briefStale = true;
  else writeBrief(s, derivePrompt(s));
  notify(sessionId);
}

function settingChanged(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s.briefTakenOver) {
    s.briefStale = true;
    notify(sessionId);
    return;
  }
  rederive(sessionId);
}

// Rebuilding hands the brief back to Archie: settings drive it again, and the
// next render re-syncs from them. Taking it over happens implicitly the moment
// a block is edited (commitBriefLine below) — there's no separate "start editing"
// action anymore.
export function rebuildBrief(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.briefTakenOver = false;
  s.briefStale = false;
  rederive(sessionId);
}

// ── The brief, edited section by section ─────────────────────────────────────
//
// The brief is stored as one prose string, but it is READ as blocks — one per
// "Label: value" line — and each block is directly editable. So an edit writes back
// into its own line and leaves the label alone; nothing has to re-parse the whole
// thing, and the sections keep their order.
//
// Editing IS the takeover. There is no "edit it yourself" link to press first: the
// moment you change a word the brief is yours, which is what stops the next modifier
// change from overwriting it (settingChanged flags it stale instead). `rebuildBrief`
// is still the way back to Archie's version.
function writeBriefLine(s, index, value) {
  const lines = (s.promptText || "").split("\n");
  if (index < 0 || index >= lines.length) return;
  const at = lines[index].indexOf(":");
  lines[index] = at > 0 ? `${lines[index].slice(0, at)}: ${value}` : value;
  s.promptText = lines.join("\n");
}

export function setBriefLineSilent(sessionId, index, value) {
  const s = states.get(sessionId);
  if (!s) return;
  writeBriefLine(s, Number(index), String(value || ""));
}

export function commitBriefLine(sessionId, index, value) {
  const s = states.get(sessionId);
  if (!s) return;
  writeBriefLine(s, Number(index), String(value || ""));
  // Typing is the takeover — see the note above.
  s.briefTakenOver = true;
  s.briefStale = false;
  notify(sessionId);
}

/** Put back the hand-edited brief the last settings change replaced. */
export function undoPromptRewrite(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.promptUndo) return;
  s.promptText = s.promptUndo.text;
  s.derivedPrompt = s.promptUndo.derived;
  s.promptUndo = null;
  notify(sessionId);
}

// ── The confirmation ────────────────────────────────────────────────────────
//
// Consumers (prompt-guard.js, events.js) read the parked change straight off
// state (`st.pendingSettingChange`) rather than through a getter here.

// Replaying the parked intent through the very same mutators the clean path uses,
// so "confirmed" and "never asked" can't diverge.
const APPLY = {
  imageType: applyImageType,
  style: applyStyle,
  format: applyFormat,
  useBranding: applyUseBranding,
  useBrandColors: applyUseBrandColors,
  selectRef: applySelectRef,
  removeRef: applyRemoveRef,
  refMode: (s, key) => {
    s.refMode = key;
  },
  useReference: applyUseReference,
};

export function confirmSettingChange(sessionId) {
  const s = states.get(sessionId);
  const parked = s?.pendingSettingChange;
  if (!parked) return;
  s.pendingSettingChange = null;
  APPLY[parked.kind]?.(s, parked.payload);
  rederive(sessionId);
}

export function cancelSettingChange(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.pendingSettingChange) return;
  s.pendingSettingChange = null;
  notify(sessionId);
}

/** The user's "don't warn me again", ticked in the dialog. Lasts one studio open. */
export function setSkipPromptWarning(sessionId, on) {
  const s = states.get(sessionId);
  if (!s) return;
  s.skipPromptWarning = !!on;
  notify(sessionId);
}

// ── Is the picture still the picture these inputs describe? ─────────────────
//
// Everything that changes what the model would draw, in one string. Stamped onto the
// state when results land, so the view can tell whether the image on screen still
// answers the brief beside it — the brief is editable and the modifiers rewrite it, so
// "generated a moment ago" is no guarantee.
function genSignature(s) {
  return JSON.stringify([
    s.promptText,
    s.renderText,
    s.imageTypeKey,
    s.styleKey,
    s.formatId,
    s.outputMode,
    s.variationCount,
    s.slideCount,
    s.selectedRefId,
    s.refMode,
    s.useBranding,
    s.useBrandColors,
  ]);
}

/** Has anything changed since the image on screen was made? */
export function previewStale(s) {
  if (!s || s.variations.length === 0 || !s.shotSig) return false;
  // Dismissed FOR THIS IMAGE — the reader chose to keep it. Keyed to shotSig (the image's
  // identity, rewritten only by a generation), never to the live option signature: the
  // signature space is navigable back and forth, so acknowledging a signature made the
  // notice flip-flop as options were toggled toward and away from the dismissed combo.
  // Tied to the image, "keep it" stays kept until the next generation replaces it.
  if (s.staleAckShotSig === s.shotSig) return false;
  return s.shotSig !== genSignature(s);
}

/** The reader closed the "out of date" notice — keep the current image, and stop nagging
 *  about it until a new generation replaces it. */
export function dismissStale(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.shotSig) return;
  s.staleAckShotSig = s.shotSig;
  notify(sessionId);
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
    // Stamp what these shots were made from — see previewStale.
    now.shotSig = genSignature(now);
    now.staleAckShotSig = null; // a fresh image starts with no dismissed notice
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

// Produce the edited image: an AI edit reseeds at the same dimensions (mock).
// Crop does NOT come through here — it is a real pixel operation, drawn on the
// canvas and committed by interactions.js#applyCropSelection → commitCrop.
function computeEdit(s, tool) {
  const cur = s.currentImage;
  const seed = `${cur.seed}-${tool}-${Date.now().toString(36)}`;
  const url = picsum(seed, [cur.w, cur.h]);
  return { url, baseUrl: url, w: cur.w, h: cur.h, seed };
}

export function applyEdit(sessionId, tool) {
  const s = states.get(sessionId);
  if (!s || !s.currentImage || s.editBusy) return;
  s.editBusy = true;
  notify(sessionId);
  if (s._editTimer) clearTimeout(s._editTimer);
  s._editTimer = setTimeout(async () => {
    const cur = states.get(sessionId);
    if (!cur) return;
    const next = computeEdit(cur, tool);
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
    [...(s.playbookColors || []).map((c) => c.hex), ...TEXT_COLORS, ...s.customTextColors].map((c) => c.toUpperCase()),
  );
  if (!known.has(h)) s.customTextColors.push(h);
  if (s.selectedOverlayId) {
    const o = s.overlays.find((x) => x.id === s.selectedOverlayId);
    if (o) o[applyKey] = h;
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
