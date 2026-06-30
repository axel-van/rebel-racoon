// "Generate an image" dialog — opened from the placeholder button on a post
// card (and the right-panel drafts surface). Same module-level pattern as the
// other modals: init() injects the DOM once, then open(postId, onUse?, opts?)
// and close() toggle visibility.
//
// Two-pane studio on a grey canvas with white control cards (figure/ground,
// like the schedule modal): a control rail on the left (prompt, visual style,
// mood) stays editable at all times, beside a preview pane on the right
// (format selector + the generated image). Each run produces ONE image, shown
// large in the stage:
//   - idle:    a quiet "preview appears here" placeholder at the chosen ratio.
//   - loading: a pulsing skeleton at the chosen ratio.
//   - result:  the generated image + "How's this image?" feedback. Editing any
//              option marks it "dirty" and the footer prompts a regenerate.
//
// The component is self-contained — close() wipes the ephemeral state. If a
// caller passes an `onUse` callback to open(), it fires with the image URL when
// the user confirms. No store, no persistence.

import { escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";
import { renderFeedbackControl, onFeedbackClick } from "./feedback-control.js?v=1";
import { getPosts } from "../posts-store.js?v=31";
import { FORMATS, formatsForNetwork, defaultFormatFor, NETWORK_FORMATS } from "../clip-formats.js?v=1";

const MODAL_ID = "generateImage";

let backdrop, modal, body, footer, styleUpload;
let initialized = false;

// Ephemeral state — lives until the modal closes.
let currentPostId = null;
let currentSessionId = null;
let genState = "idle"; // 'idle' | 'loading' | 'result'
let promptText = "";
let promptLoading = false;
let styleKey = null;
let moodKey = null;
// Object URL of a user-uploaded style reference (the "Your style" card).
let customStyleUrl = null;
// Output format (aspect ratio) — drives the preview frame AND the generated
// image dimensions. Resolved from the post's network on open.
let formatId = null;
let currentNetwork = null;
// The generated image + its seed (keys its feedback target).
let imageUrl = null;
let imageSeed = null;
let onUseCallback = null;
// Last-generation error message — surfaced as an infobox above the form when a
// run failed. Clears the next time the user generates.
let lastError = null;
// Snapshot of the inputs that produced the current image, so we can tell the
// user when their edits no longer match the preview ("dirty").
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
  <input type="file" id="genStyleUpload" accept="image/*" hidden />
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
// chosen ratio and fills the frame exactly (no letterboxing).
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

function buildFullPrompt() {
  const parts = [promptText.trim()];
  if (styleKey === "custom") {
    parts.push("matching the uploaded style reference");
  } else if (styleKey) {
    const s = STYLE_OPTIONS.find((o) => o.key === styleKey);
    if (s) parts.push(`${s.label} style`);
  }
  if (moodKey) {
    const m = MOOD_OPTIONS.find((o) => o.key === moodKey);
    if (m) parts.push(`${m.label.toLowerCase()} mood`);
  }
  return parts.filter(Boolean).join(", ");
}

// True when the user has edited the prompt / style / mood / format since the
// currently-previewed image was generated — so the preview is stale.
function isDirty() {
  if (genState !== "result" || !generatedSnapshot) return false;
  return (
    generatedSnapshot.prompt !== promptText.trim() ||
    generatedSnapshot.style !== styleKey ||
    generatedSnapshot.mood !== moodKey ||
    generatedSnapshot.format !== formatId
  );
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
  // set of inputs so each Regenerate shows a distinct image. Request at the
  // chosen format's dimensions so the result fills the frame.
  void prompt;
  const [w, h] = FORMAT_DIMS[formatId] || FORMAT_DIMS["16:9"];
  await new Promise((r) => setTimeout(r, 6000));
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

// ── Render ────────────────────────────────────────────────────────────

// Style / mood chips reuse the shared .ap-filter-chip primitive (driven by
// aria-pressed). Single-select, with a click on the active chip clearing it.
function renderChips(options, selectedKey, dataAttr) {
  return options
    .map((o) => {
      const pressed = selectedKey === o.key;
      return `<button type="button" class="ap-filter-chip" ${dataAttr}="${escapeHtml(o.key)}" aria-pressed="${pressed}">${escapeHtml(o.label)}</button>`;
    })
    .join("");
}

// Visual style as a grid of preview thumbnails (Canva / Gamma pattern) — you
// SEE the style rather than reading a label. Single-select with toggle-off;
// the selected card takes the blue border + check. Each thumbnail is a stable
// mock sample (a real build would show a curated style exemplar).
function renderStyleCards(selectedKey) {
  const builtins = STYLE_OPTIONS.map((o) => {
    const sel = selectedKey === o.key;
    return `
      <button
        type="button"
        class="gen-style-card${sel ? " is-selected" : ""}"
        data-gen-style="${escapeHtml(o.key)}"
        aria-pressed="${sel}"
        title="${escapeHtml(o.label)}"
      >
        <span class="gen-style-thumb">
          <img src="https://picsum.photos/seed/archie-style-${escapeHtml(o.key)}/220/170" alt="" loading="lazy" />
          ${sel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
        </span>
        <span class="gen-style-name">${escapeHtml(o.label)}</span>
      </button>`;
  }).join("");

  // "Your style" — upload your own image as a style reference. Clicking opens
  // the file picker (upload or replace); a picked image is auto-selected.
  const customSel = selectedKey === "custom";
  const customThumb = customStyleUrl
    ? `<img src="${escapeHtml(customStyleUrl)}" alt="Your uploaded style" />
       ${customSel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}`
    : `<span class="gen-style-upload-ph"><i class="ap-icon-plus" aria-hidden="true"></i></span>`;
  const customCard = `
    <button
      type="button"
      class="gen-style-card gen-style-card--upload${customSel ? " is-selected" : ""}${customStyleUrl ? " has-image" : ""}"
      data-gen-style-upload
      aria-pressed="${customSel}"
      title="Upload your own style"
    >
      <span class="gen-style-thumb">${customThumb}</span>
      <span class="gen-style-name">${customStyleUrl ? "Your style" : "Upload yours"}</span>
    </button>`;

  return builtins + customCard;
}

function renderControls() {
  const deriveLabel = promptLoading
    ? `<span class="gen-spinner"></span><span>Suggesting from this post…</span>`
    : `<i class="ap-icon-archie-official" aria-hidden="true"></i><span>Suggest from this post</span>`;
  const fmtHint = currentNetwork ? `Best for ${networkLabel(currentNetwork)}` : "Aspect ratio";
  // Each control group is a white card on the grey canvas, so the surfaces read
  // as distinct figure-on-ground zones (matches the schedule modal).
  return `
    <div class="gen-card">
      <label class="gen-card-label" for="genImagePrompt">Describe your image</label>
      <div class="gen-prompt-wrap">
        <textarea
          class="gen-prompt-area"
          id="genImagePrompt"
          rows="3"
          placeholder="e.g. A product team celebrating a launch milestone in a bright, modern office…"
        >${escapeHtml(promptText)}</textarea>
        <button type="button" class="gen-derive-btn" id="genDeriveBtn"${promptLoading ? " disabled" : ""}>
          ${deriveLabel}
        </button>
      </div>
    </div>

    <div class="gen-card">
      <div class="gen-subfield">
        <p class="gen-card-label">Visual style <span class="gen-field-opt">Optional</span></p>
        <div class="gen-style-grid">${renderStyleCards(styleKey)}</div>
      </div>
      <div class="gen-subfield">
        <p class="gen-card-label">Mood <span class="gen-field-opt">Optional</span></p>
        <div class="gen-chips">${renderChips(MOOD_OPTIONS, moodKey, "data-gen-mood")}</div>
      </div>
    </div>

    <div class="gen-card">
      <p class="gen-card-label">Format <span class="gen-field-opt">${escapeHtml(fmtHint)}</span></p>
      <div class="gen-format-chips">${renderFormatChips()}</div>
    </div>
  `;
}

// Format chips carry an aspect-ratio glyph + tag + descriptive label so the
// shape is legible at a glance. Single-select (a format is always required).
function renderFormatChips() {
  return formatChoices()
    .map((f) => {
      const selected = formatId === f.id ? " is-selected" : "";
      return `
        <button type="button" class="gen-format-chip${selected}" data-gen-format="${escapeHtml(f.id)}" aria-pressed="${formatId === f.id}">
          <span class="gen-format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>
          <span class="gen-format-meta">
            <span class="gen-format-tag">${escapeHtml(f.tag)}</span>
            <span class="gen-format-name">${escapeHtml(f.label)}</span>
          </span>
        </button>`;
    })
    .join("");
}

function renderPreviewStage() {
  if (genState === "loading") {
    // The skeleton hosts the animated Archie mark (archie-loader.js injects the
    // SVG into the .gen-image-spinner element) + a label.
    return `
      <div class="gen-single gen-single--loading" style="aspect-ratio:${activeRatio()}" role="status" aria-label="Generating image">
        <div class="gen-loading-inner">
          <span class="gen-image-spinner gen-loading-mark"></span>
          <p class="gen-loading-label">Generating…</p>
        </div>
      </div>`;
  }
  if (genState === "result") {
    // Regenerate lives ON the image, not in the footer. When the user edits an
    // option after generating, the shown image is stale: dim it and present a
    // prominent, centred "regenerate to apply" button. Otherwise a quiet
    // top-right Regenerate pill keeps the reroll available.
    const stale = isDirty();
    const overlay = stale
      ? `<div class="gen-single-overlay">
           <span class="gen-stale-msg">Options changed</span>
           <button type="button" class="ap-button stroked grey" id="genImageRegenerate">
             <i class="ap-icon-refresh"></i><span>Regenerate to apply</span>
           </button>
         </div>`
      : `<div class="gen-single-actions">
           <button type="button" class="ap-button stroked grey" id="genImageRegenerate">
             <i class="ap-icon-refresh"></i><span>Regenerate</span>
           </button>
         </div>`;
    return `
      <div class="gen-single${stale ? " is-stale" : ""}" style="aspect-ratio:${activeRatio()}">
        <img class="gen-single-img" src="${escapeHtml(imageUrl)}" alt="Generated image" />
        ${overlay}
      </div>`;
  }
  // Idle — a quiet centred placeholder on the tinted stage (no card chrome).
  return `
    <div class="gen-empty">
      <i class="ap-icon-image" aria-hidden="true"></i>
      <p class="gen-empty-title">Your image appears here</p>
      <span class="gen-empty-sub">Set your options, then generate.</span>
    </div>`;
}

function renderPreviewPane() {
  const feedback =
    genState === "result" && imageUrl
      ? renderFeedbackControl(`image:${currentPostId || "img"}:${imageSeed || "0"}`, {
          kind: "image",
          label: "How's this image?",
        })
      : "";
  // The right pane is a pure preview — all options (incl. Format) live in the
  // left rail. The stage sits flat on the grey canvas; the image is the figure.
  return `
    <div class="gen-stage-wrap" style="--gen-ratio:${activeRatio()}">
      ${renderPreviewStage()}
    </div>
    ${feedback}
  `;
}

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
      <section class="gen-image-controls" aria-label="Image options">${renderControls()}</section>
      <section class="gen-image-preview-pane" aria-label="Preview">${renderPreviewPane()}</section>
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
    // Regenerate lives on the image overlay, not here.
    right = `
      <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="genImageUse">Use this image</button>`;
  } else {
    const promptValid = promptText.trim().length > 0;
    right = `
      <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="genImageGenerate"${promptValid ? "" : " disabled"}>
        <i class="ap-icon-archie-official"></i>
        <span>Generate</span>
      </button>`;
  }

  footer.innerHTML = `
    <div class="ap-dialog-footer-left"></div>
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
    // Surface a discreet toast so the failure is visible without blocking the
    // flow (the user can still type a prompt manually).
    derivedFailed = true;
  }
  promptLoading = false;
  renderBody();
  if (derivedFailed) {
    showToast("Couldn't suggest a prompt. Type one in or try again.", {
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
  // Clear any stale error from a previous run.
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
    // Surface the failure inline next to the form instead of silently rolling
    // back. The user can tweak the prompt and retry, or close the modal.
    genState = "idle";
    imageUrl = null;
    imageSeed = null;
    lastError = "Image generation failed. Tweak the prompt or try again.";
  }
  renderBody();
}

// ── Event delegation ──────────────────────────────────────────────────

function onModalClick(event) {
  // Shared "how's this?" feedback on the generated image (result state).
  // Handled first; never blocks the Use / Regenerate / Edit actions below.
  if (onFeedbackClick(event)) return;

  // "Your style" card — open the file picker to upload / replace a reference.
  if (event.target.closest("[data-gen-style-upload]")) {
    styleUpload.click();
    return;
  }

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
    if (imageUrl && typeof onUseCallback === "function") onUseCallback(imageUrl);
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

  styleUpload = document.getElementById("genStyleUpload");
  styleUpload.addEventListener("change", onStyleUpload);

  document.getElementById("closeGenerateImageBtn").addEventListener("click", close);
  modal.addEventListener("click", onModalClick);
  bindOverlayDismissal({ modal, backdrop, close });
}

// A picked style reference becomes the active style (key "custom").
function onStyleUpload(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // allow re-picking the same file
  if (!file) return;
  if (customStyleUrl) URL.revokeObjectURL(customStyleUrl);
  customStyleUrl = URL.createObjectURL(file);
  styleKey = "custom";
  renderBody();
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

  // Auto-suggest the first time the modal opens with an empty prompt.
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
  if (customStyleUrl) {
    URL.revokeObjectURL(customStyleUrl);
    customStyleUrl = null;
  }
  formatId = null;
  currentNetwork = null;
  imageUrl = null;
  imageSeed = null;
  generatedSnapshot = null;
  currentPostId = null;
  onUseCallback = null;
  notifyClose(MODAL_ID);
}
