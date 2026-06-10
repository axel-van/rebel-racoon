// "Generate an image" dialog — opened from the placeholder button on a
// post card. Same module-level pattern as bug-report-modal / feedback-modal:
// init() injects the DOM once, then open(postId, onUse?) and close() toggle
// visibility.
//
// Three visual states ("idle" → "loading" → "result"):
//   - idle:    textarea with an AI-derived prompt, "Re-derive from post
//              content" link, Visual-style + Mood chip selectors, Cancel +
//              Generate footer buttons.
//   - loading: a pulsing skeleton tile + summary tags + spinner label.
//   - result:  the generated image preview + Regenerate / Edit options /
//              Use-this-image actions (footer hidden).
//
// The component is self-contained — reset() wipes the ephemeral state on
// close. If a caller passes an `onUse` callback to open(), it fires with
// the picked image URL when the user confirms. No store, no persistence.

import { escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";
import { getSessionById } from "../sessions-store.js?v=1";
import { getContextById, getDefaultContext } from "../contexts-store.js?v=29";

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
let imageUrl = null;
let onUseCallback = null;
// Last-generation error message — surfaced as an infobox above the
// idle-state form when a previous run failed (FIND-A2). Clears the
// next time the user clicks Generate so the error doesn't outlive
// the retry attempt.
let lastError = null;

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
  return `${currentPostId || "img"}-${styleKey || "none"}-${moodKey || "none"}-${Date.now()}`;
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
  void prompt;
  await new Promise((r) => setTimeout(r, 6000));
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/600`;
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

function renderSummaryTags() {
  const tags = [];
  if (styleKey) {
    const s = STYLE_OPTIONS.find((o) => o.key === styleKey);
    if (s) tags.push(`${s.icon} ${s.label}`);
  }
  if (moodKey) {
    const m = MOOD_OPTIONS.find((o) => o.key === moodKey);
    if (m) tags.push(m.label);
  }
  if (!tags.length) return "";
  return `<div class="gen-summary-bar">${tags
    .map((t) => `<span class="gen-summary-tag">${escapeHtml(t)}</span>`)
    .join("")}</div>`;
}

function renderBody() {
  if (genState === "idle") {
    const deriveLabel = promptLoading
      ? `<span class="gen-image-spinner"></span>Deriving from post content…`
      : `<i class="ap-icon-sparkles"></i><span>Re-derive from post content</span>`;

    // Surface the previous-run error (if any) above the form so the
    // user has context for the retry. Cleared when they click Generate
    // again (cf. runGeneration). FIND-A2: until now the catch path
    // silently rolled back to idle, leaving the user unsure whether
    // the click registered.
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
      <div class="gen-image-body">
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
        ${renderBrandColorsNote()}
      </div>
    `;

    footer.hidden = false;
    const promptValid = promptText.trim().length > 0;
    footer.innerHTML = `
      <div class="ap-dialog-footer-right">
        <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
        <button type="button" class="ap-button primary orange" id="genImageGenerate"${promptValid ? "" : " disabled"}>
          <i class="ap-icon-sparkles"></i>
          <span>Generate image</span>
        </button>
      </div>
    `;

    // Keep the textarea synced to module state as the user types — and
    // gate the Generate button on a non-empty prompt so the user can
    // see the affordance for "you need to write something" without
    // having to click and see nothing happen.
    const ta = body.querySelector("#genImagePrompt");
    const generateBtn = footer.querySelector("#genImageGenerate");
    if (ta && generateBtn) {
      ta.addEventListener("input", () => {
        promptText = ta.value;
        generateBtn.toggleAttribute("disabled", promptText.trim().length === 0);
      });
    }
  } else if (genState === "loading") {
    body.innerHTML = `
      <div class="gen-image-body">
        <div class="gen-image-skeleton" aria-hidden="true"></div>
        ${renderSummaryTags()}
        <p class="gen-image-loading-label"><span class="gen-image-spinner"></span>Generating image…</p>
      </div>
    `;
    footer.hidden = false;
    footer.innerHTML = `
      <div class="ap-dialog-footer-right">
        <button type="button" class="ap-button transparent grey" id="genImageCancel">Cancel</button>
        <button type="button" class="ap-button primary orange loading" disabled>
          <span class="ap-loading-bar"></span>
          <span>Generating…</span>
        </button>
      </div>
    `;
  } else if (genState === "result") {
    body.innerHTML = `
      <div class="gen-image-body">
        <div class="gen-image-result">
          <img class="gen-image-preview" src="${escapeHtml(imageUrl)}" alt="Generated image" />
          ${renderSummaryTags()}
          <div class="gen-image-result-actions">
            <button type="button" class="ap-button transparent grey" id="genImageRegenerate">
              <i class="ap-icon-refresh"></i>
              <span>Regenerate</span>
            </button>
            <button type="button" class="ap-button transparent grey" id="genImageEdit">
              <i class="ap-icon-pen"></i>
              <span>Edit options</span>
            </button>
            <button type="button" class="ap-button primary orange" id="genImageUse">Use this image</button>
          </div>
        </div>
      </div>
    `;
    footer.hidden = true;
    footer.innerHTML = "";
  }
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
    imageUrl = await generateImage(buildFullPrompt(), buildSeed());
    genState = "result";
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
  const styleBtn = event.target.closest("[data-gen-style]");
  if (styleBtn && genState === "idle") {
    const key = styleBtn.dataset.genStyle;
    styleKey = styleKey === key ? null : key;
    renderBody();
    return;
  }

  const moodBtn = event.target.closest("[data-gen-mood]");
  if (moodBtn && genState === "idle") {
    const key = moodBtn.dataset.genMood;
    moodKey = moodKey === key ? null : key;
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

  if (event.target.closest("#genImageEdit")) {
    genState = "idle";
    renderBody();
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
  imageUrl = null;
  currentPostId = null;
  onUseCallback = null;
  notifyClose(MODAL_ID);
}
