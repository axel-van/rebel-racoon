// "Generate an image" dialog — opened from the placeholder button on a
// post card. Same module-level pattern as bug-report-modal / feedback-modal:
// init() injects the DOM once, then open(postId, onUse?) and close() toggle
// visibility.
//
// Two-pane layout — the options (prompt + style + mood + brand colours) stay
// editable on the left at all times, alongside a preview pane on the right
// that reflects the current stage:
//   - idle:    a quiet "preview appears here" placeholder; footer = Generate.
//   - loading: a pulsing skeleton + centred Archie loader; footer = Generating…
//   - result:  the generated image + "How's this image?" feedback; footer =
//              Regenerate + Use this image. Editing any option while a result
//              is shown marks it "dirty" and the footer prompts a regenerate.
//
// The component is self-contained — reset() wipes the ephemeral state on
// close. If a caller passes an `onUse` callback to open(), it fires with
// the picked image URL when the user confirms. No store, no persistence.

import { escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";
import { renderFeedbackControl, onFeedbackClick } from "./feedback-control.js?v=1";
import { getSessionById } from "../sessions-store.js?v=3";
import { getContextById, getDefaultContext } from "../contexts-store.js?v=31";
import { getPosts } from "../posts-store.js?v=31";
import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "../clip-formats.js?v=1";

const MODAL_ID = "generateImage";

let backdrop, modal, body, footer;
let initialized = false;

// Ephemeral state — lives until the modal closes.
let currentPostId = null;
let currentSessionId = null;
let genState = "idle"; // 'idle' | 'loading' | 'result'
let promptText = "";
let promptLoading = false;
let styleKey = null;
let moodKey = null;
// Output format (aspect ratio) — drives the preview frame AND the generated
// image dimensions. Resolved from the post's network on open.
let formatId = null;
let currentNetwork = null;
let imageUrl = null;
// Seed of the currently-shown image — used to key its feedback target so
// each Regenerate produces a fresh, independently-rated image.
let imageSeed = null;
let onUseCallback = null;
// Last-generation error message — surfaced as an infobox above the
// idle-state form when a previous run failed (FIND-A2). Clears the
// next time the user clicks Generate so the error doesn't outlive
// the retry attempt.
let lastError = null;
// Snapshot of the inputs that produced the currently-previewed image, so we
// can tell the user when their edits no longer match the preview ("dirty").
let generatedSnapshot = null;

const STYLE_OPTIONS = [
  { key: "photorealistic", label: "Photorealistic" },
  { key: "illustration", label: "Illustration" },
  { key: "bold-graphic", label: "Bold graphic" },
  { key: "editorial", label: "Editorial photo" },
  { key: "abstract", label: "Abstract" },
];

const MOOD_OPTIONS = [
  { key: "professional", label: "Professional" },
  { key: "energetic", label: "Energetic" },
  { key: "calm", label: "Calm" },
  { key: "inspiring", label: "Inspiring" },
  { key: "playful", label: "Playful" },
];

const HTML = `
<div class="app-modal-backdrop generate-image-modal__backdrop" id="generateImageBackdrop" hidden></div>
<aside
  class="ap-dialog generate-image-modal"
  id="generateImageModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="generateImageTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="generateImageTitle">Generate an image</span>
  </div>
  <button class="ap-dialog-close" type="button" id="closeGenerateImageBtn" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content" id="generateImageBody"></div>
  <div class="ap-dialog-footer" id="generateImageFooter"></div>
</aside>`;

// ── Helpers ───────────────────────────────────────────────────────────

function focusSafe(el) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function buildSeed() {
  return `${currentPostId || "img"}-${styleKey || "none"}-${moodKey || "none"}-${formatId || "none"}-${Date.now()}`;
}

// Pixel dimensions to request per format, so the mock image comes back at the
// chosen ratio and fills the preview frame exactly (no letterboxing).
const FORMAT_DIMS = {
  "9:16": [720, 1280],
  "4:5": [864, 1080],
  "1:1": [1080, 1080],
  "16:9": [1280, 720],
};

// The format options to offer — the post network's recommended set when known,
// otherwise the full catalogue.
function formatChoices() {
  if (currentNetwork && NETWORK_FORMATS[currentNetwork]) return formatsForNetwork(currentNetwork);
  return Object.values(FORMATS);
}

// width/height (decimal) of the active format, for the preview frame ratio.
function activeRatio() {
  return FORMATS[formatId]?.ratio || FORMATS["16:9"].ratio;
}

// The active Playbook's named brand colours (alpha feedback #10). Resolved
// from the session → context; falls back to the default context's authored
// `brandColors`, then to its scraped site palette. Empty when none apply.
function activeBrandColors() {
  const session = currentSessionId ? getSessionById(currentSessionId) : null;
  const ctx = (session?.contextId && getContextById(session.contextId)) || getDefaultContext();
  if (!ctx) return [];
  if (Array.isArray(ctx.brandColors) && ctx.brandColors.length) {
    return ctx.brandColors.filter((c) => c.hex);
  }
  const c = ctx.imageVoice?.websites?.[0]?.colors || {};
  return [
    { name: "Primary", hex: c.primary },
    { name: "Accent", hex: c.accent },
    { name: "Background", hex: c.background },
  ].filter((s) => s.hex);
}

function buildFullPrompt() {
  const parts = [promptText.trim()];
  if (styleKey) {
    const s = STYLE_OPTIONS.find((o) => o.key === styleKey);
    if (s) parts.push(`${s.label} style`);
  }
  if (moodKey) {
    const m = MOOD_OPTIONS.find((o) => o.key === moodKey);
    if (m) parts.push(`${m.label.toLowerCase()} mood`);
  }
  const colors = activeBrandColors();
  if (colors.length) {
    parts.push(`using brand colours ${colors.map((c) => `${c.name || "brand"} (${c.hex})`).join(", ")}`);
  }
  return parts.filter(Boolean).join(", ");
}

// ── Mock async stand-ins for real endpoints ──────────────────────────

async function derivePromptFromPost(postId) {
  await new Promise((r) => setTimeout(r, 6000));
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

async function generateImage(prompt, seed) {
  // Pretend to call an image generation API; the seed keeps Picsum stable per
  // set of inputs so the "Regenerate" flow shows a different image each time.
  // Request at the chosen format's dimensions so the result fills the frame.
  void prompt;
  const [w, h] = FORMAT_DIMS[formatId] || FORMAT_DIMS["16:9"];
  await new Promise((r) => setTimeout(r, 6000));
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

// ── Render ────────────────────────────────────────────────────────────

function renderChips(options, selectedKey, dataAttr) {
  return options
    .map((o) => {
      const selected = selectedKey === o.key ? " selected" : "";
      const icon = o.icon ? `<span class="gen-chip-icon">${escapeHtml(o.icon)}</span>` : "";
      return `<button type="button" class="gen-chip${selected}" ${dataAttr}="${escapeHtml(o.key)}">${icon}${escapeHtml(o.label)}</button>`;
    })
    .join("");
}

// Read-only note showing which Playbook brand colours will steer the image,
// so the user sees their palette is being honoured (alpha feedback #10).
function renderBrandColorsNote() {
  const colors = activeBrandColors();
  if (!colors.length) return "";
  const dots = colors
    .map(
      (c) =>
        `<span class="gen-brand-swatch" title="${escapeHtml(`${c.name || "Brand"} ${c.hex}`)}" style="background:${escapeHtml(c.hex)}"></span>`,
    )
    .join("");
  return `
    <div class="gen-section gen-brand-colors">
      <p class="gen-section-label">Brand colours<span>— from your Playbook</span></p>
      <div class="gen-brand-swatches">${dots}</div>
    </div>
  `;
}

// True when the user has edited the prompt / style / mood since the
// currently-previewed image was generated — so the preview is stale and a
// "regenerate to apply" hint is warranted.
function isDirty() {
  if (genState !== "result" || !generatedSnapshot) return false;
  return (
    generatedSnapshot.prompt !== promptText.trim() ||
    generatedSnapshot.style !== styleKey ||
    generatedSnapshot.mood !== moodKey ||
    generatedSnapshot.format !== formatId
  );
}

// Two-pane layout: the options (left) stay editable at all times alongside
// the live preview (right), so tweaking style/mood/prompt no longer hides the
// image. The footer holds the stage-appropriate actions in every state.
function renderBody() {
  const errorBlock = lastError
    ? `<div class="ap-infobox error" role="alert">
         <i class="ap-icon-error_fill" aria-hidden="true"></i>
         <div class="ap-infobox-content">
           <div class="ap-infobox-texts">
             <span class="ap-infobox-message">${escapeHtml(lastError)}</span>
           </div>
         </div>
       </div>`
    : "";

  body.innerHTML = `
    ${errorBlock}
    <div class="gen-image-layout">
      <div class="gen-image-controls">${renderControls()}</div>
      <div class="gen-image-preview-pane">${renderPreviewPane()}</div>
    </div>
  `;

  renderFooter();

  // Keep the textarea synced to module state as the user types, and refresh
  // the footer (Generate enabled-state + the "options changed" hint) without
  // re-rendering the body so the textarea keeps focus.
  const ta = body.querySelector("#genImagePrompt");
  if (ta) {
    ta.addEventListener("input", () => {
      promptText = ta.value;
      renderFooter();
    });
  }
}

function renderControls() {
  const deriveLabel = promptLoading
    ? `<span class="gen-image-spinner"></span>Deriving from post content…`
    : `<i class="ap-icon-archie-official"></i><span>Re-derive from post content</span>`;
  return `
    <div class="gen-section">
      <p class="gen-section-label">Describe your image<span>— edit or write your own</span></p>
      <textarea
        class="gen-prompt-area"
        id="genImagePrompt"
        rows="3"
        placeholder="e.g. A professional team celebrating a milestone in a modern office…"
      >${escapeHtml(promptText)}</textarea>
      <button type="button" class="gen-derive-btn" id="genDeriveBtn"${promptLoading ? " disabled" : ""}>
        ${deriveLabel}
      </button>
    </div>

    <div class="gen-section">
      <p class="gen-section-label">Visual style<span>— optional</span></p>
      <div class="gen-chips">${renderChips(STYLE_OPTIONS, styleKey, "data-gen-style")}</div>
    </div>

    <div class="gen-section">
      <p class="gen-section-label">Mood<span>— optional</span></p>
      <div class="gen-chips">${renderChips(MOOD_OPTIONS, moodKey, "data-gen-mood")}</div>
    </div>

    <div class="gen-section">
      <p class="gen-section-label">Format<span>${currentNetwork ? `— best for ${networkLabel(currentNetwork)}` : "— aspect ratio"}</span></p>
      <div class="gen-chips">${renderFormatChips()}</div>
    </div>
    ${renderBrandColorsNote()}
  `;
}

function networkLabel(net) {
  const labels = {
    linkedin: "LinkedIn",
    instagram: "Instagram",
    facebook: "Facebook",
    x: "X",
    twitter: "X",
    tiktok: "TikTok",
  };
  return labels[net] || net;
}

// Format chips carry an aspect-ratio glyph + tag + descriptive label, so the
// shape is legible at a glance. Single-select (a format is always required).
function renderFormatChips() {
  return formatChoices()
    .map((f) => {
      const selected = formatId === f.id ? " selected" : "";
      return `
        <button type="button" class="gen-chip gen-format-chip${selected}" data-gen-format="${escapeHtml(f.id)}">
          <span class="gen-format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>
          <span class="gen-format-tag">${escapeHtml(f.tag)}</span>
          <span class="gen-format-name">${escapeHtml(f.label)}</span>
        </button>`;
    })
    .join("");
}

function renderPreviewPane() {
  // The image lives inside a framed "stage" — a neutral letterbox canvas that
  // contains the image (object-fit: contain) so ANY network ratio (square,
  // portrait, wide) shows in full without cropping or stretching. The frame
  // keeps a constant footprint across idle / loading / result.
  // The stage adopts the selected format's aspect ratio, so the frame IS the
  // output shape — no generic letterbox, no wasted canvas.
  const ratioStyle = `--gen-ratio:${activeRatio()}`;
  let stageInner;
  let stageMod = "";
  let feedback = "";
  if (genState === "loading") {
    stageMod = " gen-image-stage--loading";
    stageInner = `
      <div class="gen-image-loading" role="status">
        <span class="gen-image-spinner gen-image-spinner--xl"></span>
        <p class="gen-image-loading-label">Generating image…</p>
      </div>`;
  } else if (genState === "result") {
    stageInner = `<img class="gen-image-preview" src="${escapeHtml(imageUrl)}" alt="Generated image" />`;
    feedback = renderFeedbackControl(`image:${currentPostId || "img"}:${imageSeed || "0"}`, {
      kind: "image",
      label: "How's this image?",
    });
  } else {
    // Idle — no image yet. A quiet placeholder so the framed zone reads as
    // "the preview lands here" rather than empty space.
    stageMod = " gen-image-stage--empty";
    stageInner = `
      <div class="gen-image-empty">
        <i class="ap-icon-image"></i>
        <p>Your preview appears here</p>
        <span>Set your options, then generate.</span>
      </div>`;
  }
  const fmt = FORMATS[formatId];
  return `
    <p class="gen-section-label">Preview<span>${fmt ? `— ${fmt.label} · ${fmt.tag}` : ""}</span></p>
    <div class="gen-image-viewport">
      <div class="gen-image-stage${stageMod}" style="${ratioStyle}">${stageInner}</div>
    </div>
    ${feedback}
  `;
}

function renderFooter() {
  footer.hidden = false;
  let right;
  if (genState === "loading") {
    right = `
      <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
      <button type="button" class="ap-button primary orange loading" disabled>
        <span class="ap-loading-bar"></span>
        <span>Generating…</span>
      </button>`;
  } else if (genState === "result") {
    right = `
      <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
      <button type="button" class="ap-button stroked grey" id="genImageRegenerate">
        <i class="ap-icon-refresh"></i>
        <span>Regenerate</span>
      </button>
      <button type="button" class="ap-button primary orange" id="genImageUse">Use this image</button>`;
  } else {
    const promptValid = promptText.trim().length > 0;
    right = `
      <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="genImageGenerate"${promptValid ? "" : " disabled"}>
        <i class="ap-icon-archie-official"></i>
        <span>Generate image</span>
      </button>`;
  }

  const hint = isDirty()
    ? `<span class="gen-footer-hint"><i class="ap-icon-refresh" aria-hidden="true"></i>Options changed — regenerate to apply</span>`
    : "";

  footer.innerHTML = `
    <div class="ap-dialog-footer-left">${hint}</div>
    <div class="ap-dialog-footer-right">${right}</div>
  `;
}

// ── Flow ──────────────────────────────────────────────────────────────

async function runDerive() {
  promptLoading = true;
  renderBody();
  let derivedFailed = false;
  try {
    promptText = await derivePromptFromPost(currentPostId);
  } catch {
    // FIND-D5: the previous catch was silent — the spinner just stopped
    // and the textarea stayed empty, leaving the user wondering whether
    // the click registered. Surface a discreet toast so the failure is
    // visible without blocking the flow (the user can still type a
    // prompt manually).
    derivedFailed = true;
  }
  promptLoading = false;
  renderBody();
  if (derivedFailed) {
    showToast("Couldn't auto-derive a prompt. Type one in or try again.", {
      variant: "error",
      duration: 4000,
    });
  }
  const ta = body.querySelector("#genImagePrompt");
  if (ta) {
    focusSafe(ta);
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
}

async function runGeneration() {
  // Clear any stale error from a previous run so the in-flight generation
  // doesn't show a contradictory message.
  lastError = null;
  genState = "loading";
  renderBody();
  try {
    imageSeed = buildSeed();
    imageUrl = await generateImage(buildFullPrompt(), imageSeed);
    genState = "result";
    // Record the inputs behind this image so later edits read as "dirty".
    generatedSnapshot = { prompt: promptText.trim(), style: styleKey, mood: moodKey, format: formatId };
  } catch {
    // FIND-A2: surface the failure inline next to the form instead of
    // silently rolling back to idle. The user can then tweak the prompt
    // and retry, or close the modal — but at least they know the click
    // registered and the system reached the API.
    genState = "idle";
    lastError = "Image generation failed. Tweak the prompt or try again.";
  }
  renderBody();
}

// ── Event delegation ──────────────────────────────────────────────────

function onModalClick(event) {
  // Shared "how's this?" feedback on the generated image (result state).
  // Handled first; never blocks the Use / Regenerate / Edit actions below.
  if (onFeedbackClick(event)) return;

  // Options stay editable in every state (incl. while a result is previewed);
  // changing one marks the preview dirty so the footer prompts a regenerate.
  const styleBtn = event.target.closest("[data-gen-style]");
  if (styleBtn) {
    const key = styleBtn.dataset.genStyle;
    styleKey = styleKey === key ? null : key;
    renderBody();
    return;
  }

  const moodBtn = event.target.closest("[data-gen-mood]");
  if (moodBtn) {
    const key = moodBtn.dataset.genMood;
    moodKey = moodKey === key ? null : key;
    renderBody();
    return;
  }

  // Format is single-select (always one active) — changing it re-shapes the
  // preview frame immediately and marks a shown result dirty.
  const fmtBtn = event.target.closest("[data-gen-format]");
  if (fmtBtn) {
    formatId = fmtBtn.dataset.genFormat;
    renderBody();
    return;
  }

  if (event.target.closest("#genDeriveBtn") && !promptLoading) {
    runDerive();
    return;
  }

  if (event.target.closest("#genImageGenerate") && genState === "idle") {
    runGeneration();
    return;
  }

  if (event.target.closest("#genImageRegenerate")) {
    runGeneration();
    return;
  }

  if (event.target.closest("#genImageUse")) {
    if (typeof onUseCallback === "function") onUseCallback(imageUrl);
    close();
    return;
  }

  if (event.target.closest("#genImageCancel")) {
    close();
    return;
  }
}

// ── Public API ────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("generateImageBackdrop");
  modal = document.getElementById("generateImageModal");
  body = document.getElementById("generateImageBody");
  footer = document.getElementById("generateImageFooter");

  document.getElementById("closeGenerateImageBtn").addEventListener("click", close);
  modal.addEventListener("click", onModalClick);
  bindOverlayDismissal({ modal, backdrop, close });
}

export function open(postId, onUse, opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  currentPostId = postId || null;
  currentSessionId = opts.sessionId || null;
  onUseCallback = typeof onUse === "function" ? onUse : null;

  // Resolve the post's network so the format options + default match where the
  // image will publish (e.g. a LinkedIn draft defaults to LinkedIn's ratio).
  const post = currentSessionId ? getPosts(currentSessionId).find((p) => p.id === currentPostId) : null;
  // posts-store stores X as "twitter"; the format catalogue keys on "x".
  currentNetwork = (post?.network === "twitter" ? "x" : post?.network) || null;
  formatId = post?.format || (currentNetwork ? defaultFormatFor(currentNetwork) : "1:1");

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();

  // Auto-derive the first time the modal opens with an empty prompt.
  if (!promptText && !promptLoading) runDerive();
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");

  // Reset ephemeral state — next open() starts fresh.
  genState = "idle";
  promptText = "";
  lastError = null;
  promptLoading = false;
  styleKey = null;
  moodKey = null;
  formatId = null;
  currentNetwork = null;
  imageUrl = null;
  imageSeed = null;
  generatedSnapshot = null;
  currentPostId = null;
  onUseCallback = null;
  notifyClose(MODAL_ID);
}
