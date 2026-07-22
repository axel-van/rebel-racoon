// Image Studio — a near-fullscreen modal "Generate an image" flow inspired by
// Adobe Firefly. Opened from a draft (post card / right-panel Drafts); the
// chosen image attaches back to that draft. Same module-singleton pattern as the
// other modals: init() injects the DOM once, open(postId, { sessionId }) and
// close() toggle it, coordinated by modal-coordinator.js.
//
// State + all mock behavior live in image-studio.js (UI-agnostic, keyed here by
// a single constant since only one studio is open at a time). This file owns the
// modal shell + the stage renders (compose → generating → results → edit) + the
// event wiring. It REUSES the shared .gen-* image tiles / preview primitives
// from styles/screens/modals.css.

import { html, raw, escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";
import { getPosts, attachImageToDraft } from "../posts-store.js?v=34";
import { NETWORK_LABEL } from "../social-profiles.js?v=25";
import * as imageStudio from "../image-studio.js?v=5";

const MODAL_ID = "imageStudio";
const KEY = "studio"; // single active studio → one state key

let backdrop, modal, body;
let initialized = false;
let currentPostId = null;
let currentSessionId = null;
let unsub = null;

const HTML = `
<div class="app-modal-backdrop image-studio-modal__backdrop" id="imageStudioBackdrop" hidden></div>
<aside
  class="ap-dialog image-studio-modal"
  id="imageStudioModal"
  role="dialog"
  aria-modal="true"
  aria-label="Generate an image"
  aria-hidden="true"
>
  <button class="ap-dialog-close image-studio-modal__close" type="button" data-img-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="image-studio-modal__body" id="imageStudioBody"></div>
</aside>`;

function state() {
  return imageStudio.getState(KEY);
}

// ── Render ────────────────────────────────────────────────────────────────
//
// One persistent two-column layout for both modes: a controls PANEL on the left
// (mode-dependent) and a shared CANVAS on the right (preview / variations /
// working image). A top segmented control switches the two peer modes; "Edit"
// unlocks once an image exists.

function renderStudio(st) {
  return html`
    <div class="image-studio image-studio--${st.mode}">
      ${raw(topBar(st))}
      <div class="image-studio__workspace">
        <aside class="image-studio__panel" aria-label="${st.mode === "edit" ? "Edit tools" : "Generation options"}">
          ${raw(st.mode === "edit" ? editControls(st) : generateControls(st))}
        </aside>
        <section class="image-studio__canvas" aria-label="Preview">${raw(canvasContent(st))}</section>
      </div>
      ${raw(footer(st))}
    </div>
  `;
}

function topBar(st) {
  const canEdit = !!st.currentImage;
  const editState = (st.mode === "edit" ? " active" : "") + (canEdit ? "" : " disabled");
  const editAttrs = canEdit ? "" : 'disabled title="Generate an image first"';
  // DS Tabs (.ap-tabs) as the two peer modes — a full-width tab bar under the
  // title, used natively (no custom styling).
  return `<div class="image-studio__top">
      <span class="image-studio__top-title"><i class="ap-icon-archie-official" aria-hidden="true"></i>Image Studio</span>
    </div>
    <div class="ap-tabs image-studio__modes">
      <div class="ap-tabs-nav" role="tablist" aria-label="Studio mode">
        <button type="button" class="ap-tabs-tab${st.mode === "generate" ? " active" : ""}" role="tab" aria-selected="${st.mode === "generate"}" data-img-mode="generate"><span>Generate</span></button>
        <button type="button" class="ap-tabs-tab${editState}" role="tab" aria-selected="${st.mode === "edit"}" data-img-mode="edit" ${editAttrs}><span>Edit</span></button>
      </div>
    </div>`;
}

// Left panel — generate mode: prompt (lead) + reference / style / mood / format
// / variations.
function generateControls(st) {
  const deriveLabel = st.promptLoading
    ? `<span class="gen-spinner"></span><span>Suggesting from this post…</span>`
    : `<i class="ap-icon-archie-official" aria-hidden="true"></i><span>Suggest from this post</span>`;
  const promptGroup = `
    <div class="image-studio__group image-studio__group--prompt">
      <label class="image-studio__group-label" for="imgStudioPrompt">Describe your image</label>
      <textarea id="imgStudioPrompt" class="image-studio__prompt-input" data-img-prompt rows="3" placeholder="e.g. A bold graphic of an upward-trending growth chart, vibrant blue and orange, minimalist style…">${escapeHtml(st.promptText)}</textarea>
      <button type="button" class="image-studio__derive" data-img-derive ${st.promptLoading ? "disabled" : ""}>${deriveLabel}</button>
    </div>`;
  return promptGroup + composeGroups(st);
}

// Left panel — edit mode: the tool rail as a DS Action Dropdown menu
// (.ap-action-dropdown items, 40px rows). Active tool uses the DS `.focused`
// item state.
function editControls(st) {
  const items = imageStudio.EDIT_TOOLS.map((t) => {
    const active = st.activeTool === t.key;
    return `<button type="button" class="ap-action-dropdown-item${active ? " focused" : ""}" role="menuitem" data-img-tool="${escapeHtml(t.key)}" ${st.editBusy ? "disabled" : ""}>
      <i class="${t.icon}" aria-hidden="true"></i>
      <span class="ap-action-dropdown-item-text">${escapeHtml(t.label)}</span>
    </button>`;
  }).join("");
  return `<div class="ap-action-dropdown image-studio__tools" role="menu" aria-label="Edit tools">${items}</div>`;
}

// Right canvas — shared; content depends on mode / generation phase.
function canvasContent(st) {
  if (st.mode === "edit") return editCanvas(st);
  if (st.genPhase === "generating") return generatingCanvas(st);
  if (st.genPhase === "results") return resultsCanvas(st);
  return `<div class="gen-empty">
    <i class="ap-icon-image" aria-hidden="true"></i>
    <p class="gen-empty-title">Your image appears here</p>
    <span class="gen-empty-sub">Describe it on the left, then generate.</span>
  </div>`;
}

function generatingCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  return `<div class="gen-stage-wrap" style="--gen-ratio:${ratio}">
    <div class="gen-single gen-single--loading" style="aspect-ratio:${ratio}" role="status" aria-label="Generating">
      <div class="gen-loading-inner">
        <span class="gen-image-spinner gen-loading-mark"></span>
        <p class="gen-loading-label">Generating ${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}…</p>
      </div>
    </div>
  </div>`;
}

// One large preview of the selected variation + a bottom filmstrip (chutier) to
// switch between variations. The filmstrip is hidden when there's only one.
function resultsCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const current = st.variations[sel] || st.variations[0];
  const strip =
    st.variations.length > 1
      ? `<div class="image-studio__filmstrip" role="tablist" aria-label="Variations">${st.variations
          .map((v, i) => {
            const on = i === sel;
            return `<button type="button" class="image-studio__thumb${on ? " is-selected" : ""}" role="tab" aria-selected="${on}" data-img-variation="${i}" title="Variation ${i + 1}">
              <img src="${escapeHtml(v.url)}" alt="Variation ${i + 1}" />
              ${on ? `<span class="image-studio__thumb-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
            </button>`;
          })
          .join("")}</div>`
      : "";
  return `<div class="image-studio__preview-stage">
    <div class="image-studio__preview-main">
      <div class="image-studio__frame" style="--imgs-ratio:${ratio}">
        <img class="image-studio__frame-img" src="${current ? escapeHtml(current.url) : ""}" alt="Selected variation" />
      </div>
    </div>
    ${strip}
  </div>`;
}

function editCanvas(st) {
  const img = st.currentImage;
  const ratio = img ? img.w / img.h : imageStudio.activeRatio(KEY);
  const brushTool = st.activeTool === "annotate" || st.activeTool === "fill" || st.activeTool === "remove";
  const canvasOverlay =
    brushTool && img
      ? `<canvas class="image-studio__annotate" data-img-annotate data-tool="${escapeHtml(st.activeTool)}" width="${img.w}" height="${img.h}"></canvas>`
      : "";
  const busy = st.editBusy
    ? `<div class="image-studio__busy"><span class="gen-image-spinner"></span><span>Applying…</span></div>`
    : "";
  const badge =
    img && img.upscaled
      ? `<span class="image-studio__badge"><i class="ap-icon-arrow-up" aria-hidden="true"></i>Upscaled 2×</span>`
      : img && img.noBg
        ? `<span class="image-studio__badge"><i class="ap-icon-cropper" aria-hidden="true"></i>Background removed (preview)</span>`
        : "";
  return `<div class="image-studio__edit-canvas">
    <div class="image-studio__frame${img && img.noBg ? " is-nobg" : ""}" style="--imgs-ratio:${ratio}">
      <img class="image-studio__frame-img" src="${img ? img.url : ""}" alt="Working image" />
      ${overlayLayer(st)}${canvasOverlay}${busy}${badge}
    </div>
    ${editSubpanel(st)}
  </div>`;
}

// Draggable logo/text elements layered over the working image (edit mode).
function overlayLayer(st) {
  if (!st.overlays.length) return "";
  return `<div class="image-studio__overlay-layer" data-img-overlay-layer>${st.overlays
    .map((o) => renderOverlay(o, o.id === st.selectedOverlayId))
    .join("")}</div>`;
}

function renderOverlay(o, selected) {
  const base = `left:${o.xF * 100}%; top:${o.yF * 100}%; transform:translate(-50%,-50%) rotate(${o.rot || 0}rad);`;
  const style = o.kind === "logo" ? `${base} width:${o.wF * 100}%;` : base;
  const inner =
    o.kind === "logo"
      ? `<img src="${escapeHtml(o.url)}" alt="" draggable="false" />`
      : `<span class="image-studio__overlay-text" style="color:${escapeHtml(o.color || "#FFFFFF")}; font-size:${o.sizeF * 100}cqh; font-weight:${o.bold ? 700 : 400};${o.outline ? " text-shadow:0 2px 8px rgba(0,0,0,.55); -webkit-text-stroke:0.055em rgba(0,0,0,.6);" : ""}">${escapeHtml(o.text || "")}</span>`;
  const handles = `<button type="button" class="image-studio__overlay-delete" data-img-overlay-delete="${o.id}" aria-label="Delete element"><i class="ap-icon-close" aria-hidden="true"></i></button>
    <span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>
    <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  return `<div class="image-studio__overlay${o.kind === "text" ? " is-text" : ""}${selected ? " is-selected" : ""}" data-img-overlay="${o.id}" style="${style}">${inner}${handles}</div>`;
}

// Bottom bar — one primary CTA per mode / phase.
function footer(st) {
  if (st.mode === "edit") {
    return `<div class="image-studio__bar">
      <button type="button" class="ap-button ghost grey" data-img-undo ${imageStudio.canUndo(KEY) ? "" : "disabled"}><i class="ap-icon-refresh"></i><span>Undo</span></button>
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange" data-img-use ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Use this image</span></button>
    </div>`;
  }
  if (st.genPhase === "generating") {
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>
    </div>`;
  }
  if (st.genPhase === "results") {
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button stroked grey" data-img-regenerate><i class="ap-icon-refresh"></i><span>Regenerate</span></button>
      <button type="button" class="ap-button primary orange" data-img-use ${st.currentImage ? "" : "disabled"}><i class="ap-icon-check"></i><span>Use this image</span></button>
    </div>`;
  }
  const promptValid = st.promptText.trim().length > 0;
  return `<div class="image-studio__bar">
    <div class="image-studio__bar-spacer"></div>
    <button type="button" class="ap-button primary orange" data-img-generate ${promptValid && !st.promptLoading ? "" : "disabled"}><i class="ap-icon-archie-official"></i><span>Generate</span></button>
  </div>`;
}

function styleCards(st) {
  const builtins = imageStudio.STYLE_OPTIONS.map((o) => {
    const sel = st.styleKey === o.key;
    return `<button type="button" class="gen-style-card${sel ? " is-selected" : ""}" data-img-style="${escapeHtml(o.key)}" aria-pressed="${sel}" title="${escapeHtml(o.label)}">
      <span class="gen-style-thumb">
        <img src="https://picsum.photos/seed/archie-style-${escapeHtml(o.key)}/220/170" alt="" loading="lazy" />
        ${sel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </span>
      <span class="gen-style-name">${escapeHtml(o.label)}</span>
    </button>`;
  }).join("");
  const customSel = st.styleKey === "custom";
  const customThumb = st.customStyleUrl
    ? `<img src="${escapeHtml(st.customStyleUrl)}" alt="Your uploaded style" />${customSel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}`
    : `<span class="gen-style-upload-ph"><i class="ap-icon-plus" aria-hidden="true"></i></span>`;
  const customCard = `<button type="button" class="gen-style-card gen-style-card--upload${customSel ? " is-selected" : ""}${st.customStyleUrl ? " has-image" : ""}" data-img-style-upload aria-pressed="${customSel}" title="Upload your own style">
    <span class="gen-style-thumb">${customThumb}</span>
    <span class="gen-style-name">${st.customStyleUrl ? "Your style" : "Upload yours"}</span>
  </button>`;
  return builtins + customCard;
}

function moodChips(st) {
  return imageStudio.MOOD_OPTIONS.map((o) => {
    const pressed = st.moodKey === o.key;
    return `<button type="button" class="ap-filter-chip" data-img-mood="${escapeHtml(o.key)}" aria-pressed="${pressed}">${escapeHtml(o.label)}</button>`;
  }).join("");
}

function formatChip(f, selected, dataAttr) {
  return `<button type="button" class="gen-format-chip${selected ? " is-selected" : ""}" ${dataAttr}="${escapeHtml(f.id)}" aria-pressed="${selected}">
    <span class="gen-format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>
    <span class="gen-format-meta">
      <span class="gen-format-tag">${escapeHtml(f.tag)}</span>
      <span class="gen-format-name">${escapeHtml(f.label)}</span>
    </span>
  </button>`;
}

function refs(st) {
  const tiles = st.referenceImages
    .map(
      (r) => `<div class="image-studio__ref">
        <img src="${escapeHtml(r.url)}" alt="Reference image" />
        <button type="button" class="image-studio__ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove reference"><i class="ap-icon-close" aria-hidden="true"></i></button>
      </div>`,
    )
    .join("");
  const addTile =
    st.referenceImages.length < imageStudio.MAX_REFS
      ? `<button type="button" class="image-studio__ref-add" data-img-ref-add><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>`
      : "";
  return tiles + addTile;
}

function composeGroups(st) {
  const fmtHint = st.network ? `Best for ${NETWORK_LABEL[st.network] || st.network}` : "Aspect ratio";
  const fmtChips = imageStudio
    .formatChoices(KEY)
    .map((f) => formatChip(f, st.formatId === f.id, "data-img-format"))
    .join("");
  const varChips = imageStudio.VARIATION_CHOICES.map(
    (n) =>
      `<button type="button" class="ap-filter-chip" data-img-varcount="${n}" aria-pressed="${st.variationCount === n}">${n}</button>`,
  ).join("");
  return `
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Reference images</p>
        <span class="image-studio__count">${st.referenceImages.length}/${imageStudio.MAX_REFS}</span>
      </div>
      <div class="image-studio__refs">${refs(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Visual style</p>
        <span class="image-studio__opt">Optional</span>
      </div>
      <div class="gen-style-grid">${styleCards(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Mood</p>
        <span class="image-studio__opt">Optional</span>
      </div>
      <div class="image-studio__chips">${moodChips(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Format</p>
        <span class="image-studio__count">${escapeHtml(fmtHint)}</span>
      </div>
      <div class="gen-format-chips">${fmtChips}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Variations</p>
      </div>
      <div class="image-studio__chips">${varChips}</div>
    </div>
  `;
}

function editSubpanel(st) {
  const tool = st.activeTool;
  if (!tool) return "";
  const meta = imageStudio.EDIT_TOOLS.find((t) => t.key === tool);
  if (!meta) return "";
  if (tool === "logo" || tool === "text") return overlaySubpanel(st, tool);
  if (tool === "prompt") {
    return `<div class="image-studio__subpanel">
      <p class="image-studio__subpanel-label">Describe the change</p>
      <textarea class="image-studio__edit-prompt" data-img-edit-prompt rows="2" placeholder="e.g. warmer lighting, add a laptop on the desk…">${escapeHtml(st.editPrompt || "")}</textarea>
      <div class="image-studio__subpanel-row">
        <span class="image-studio__subpanel-hint">Preview — reruns the generation with your note.</span>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button primary orange" data-img-apply-edit="prompt"><i class="ap-icon-archie-official"></i><span>Apply</span></button>
      </div>
    </div>`;
  }
  if (tool === "expand") {
    const chips = imageStudio
      .formatChoices(KEY)
      .map((f) => formatChip(f, st.formatId === f.id, "data-img-expand-format"))
      .join("");
    return `<div class="image-studio__subpanel">
      <p class="image-studio__subpanel-label">Expand to a new ratio</p>
      <div class="gen-format-chips">${chips}</div>
      <p class="image-studio__subpanel-hint">Preview — reshapes the frame and regenerates the outer area.</p>
    </div>`;
  }
  if (tool === "annotate" || tool === "fill" || tool === "remove") {
    const hint =
      tool === "annotate"
        ? "Draw on the image — your strokes are baked into the picture."
        : `Brush the area to ${tool === "fill" ? "fill in" : "remove"} — preview reruns generation on that region.`;
    return `<div class="image-studio__subpanel">
      <div class="image-studio__subpanel-row">
        <p class="image-studio__subpanel-label">${escapeHtml(meta.label)}</p>
        <span class="image-studio__subpanel-hint">${escapeHtml(hint)}</span>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button ghost grey" data-img-clear-brush><span>Clear</span></button>
        <button type="button" class="ap-button primary orange" data-img-apply-edit="${escapeHtml(tool)}"><i class="ap-icon-check"></i><span>Apply</span></button>
      </div>
    </div>`;
  }
  // upscale / removebg — one-click.
  const hint =
    tool === "upscale"
      ? "Doubles the resolution of the current image."
      : "Isolates the subject on a transparent background (preview).";
  return `<div class="image-studio__subpanel">
    <div class="image-studio__subpanel-row">
      <p class="image-studio__subpanel-label">${escapeHtml(meta.label)}</p>
      <span class="image-studio__subpanel-hint">${escapeHtml(hint)}</span>
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange" data-img-apply-edit="${escapeHtml(tool)}"><i class="ap-icon-check"></i><span>Apply</span></button>
    </div>
  </div>`;
}

// Contextual panel for the overlay tools (Add logo / Add text). Edits the
// currently-selected overlay live; a shared Apply flattens the layer.
function overlaySubpanel(st, tool) {
  const sel = st.overlays.find((o) => o.id === st.selectedOverlayId) || null;
  const hint = `<span class="image-studio__subpanel-hint">Drag to move · corner to resize · top handle to rotate. Added to the image when you use it.</span>`;

  if (tool === "logo") {
    const presets = imageStudio.LOGO_PRESETS.map(
      (p) =>
        `<button type="button" class="image-studio__preset" data-img-logo-preset="${escapeHtml(p.url)}" title="${escapeHtml(p.label)}"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.label)}" /></button>`,
    ).join("");
    const del =
      sel && sel.kind === "logo"
        ? `<button type="button" class="ap-button ghost red" data-img-overlay-delete="${sel.id}"><i class="ap-icon-trash"></i><span>Delete</span></button>`
        : "";
    return `<div class="image-studio__subpanel">
      <div class="image-studio__subpanel-row">
        <p class="image-studio__subpanel-label">Add a logo</p>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button stroked blue" data-img-logo-upload><i class="ap-icon-upload"></i><span>Upload</span></button>
      </div>
      <div class="image-studio__presets">${presets}</div>
      <div class="image-studio__subpanel-row">${hint}<div class="image-studio__bar-spacer"></div>${del}</div>
    </div>`;
  }

  // text
  const t = sel && sel.kind === "text" ? sel : null;
  const colors = imageStudio.TEXT_COLORS.map(
    (c) =>
      `<button type="button" class="image-studio__swatch${t && t.color === c ? " is-selected" : ""}" data-img-text-color="${c}" style="--sw:${c}" aria-label="${c}"></button>`,
  ).join("");
  const sizes = imageStudio.TEXT_SIZES.map(
    (s) =>
      `<button type="button" class="ap-filter-chip" data-img-text-size="${s.value}" aria-pressed="${t && Math.abs(t.sizeF - s.value) < 0.001}">${s.label}</button>`,
  ).join("");
  return `<div class="image-studio__subpanel">
    <input type="text" class="image-studio__edit-prompt" data-img-text-input placeholder="Your text" value="${t ? escapeHtml(t.text) : ""}" ${t ? "" : "disabled"} />
    <div class="image-studio__subpanel-row image-studio__text-controls">
      <span class="image-studio__swatches">${colors}</span>
      <div class="image-studio__chips">${sizes}</div>
      <button type="button" class="ap-filter-chip" data-img-text-bold aria-pressed="${t ? !!t.bold : false}">Bold</button>
      <button type="button" class="ap-filter-chip" data-img-text-outline aria-pressed="${t ? !!t.outline : false}">Outline</button>
    </div>
    <div class="image-studio__subpanel-row">${hint}<div class="image-studio__bar-spacer"></div>${
      t
        ? `<button type="button" class="ap-button ghost red" data-img-overlay-delete="${t.id}"><i class="ap-icon-trash"></i><span>Delete</span></button>`
        : ""
    }</div>
  </div>`;
}

function renderBody() {
  const st = state();
  if (!st || !body) return;
  body.innerHTML = renderStudio(st);
}

// ── Behavior helpers ──────────────────────────────────────────────────────

// Throwaway file picker for the "Your style" tile (kind="style") and the
// reference-images grid (kind="ref").
function openFilePicker(kind) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (kind === "style") imageStudio.setCustomStyle(KEY, url);
    else imageStudio.addReferenceImage(KEY, url);
  });
  input.click();
}

// Upload a logo → add it as a draggable overlay element.
function openLogoPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) imageStudio.addOverlay(KEY, { kind: "logo", url: URL.createObjectURL(file) });
  });
  input.click();
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Commit the working image to the origin draft, then close.
function useImage() {
  const st = state();
  const finalize = (url) => {
    if (url && currentSessionId && currentPostId) {
      attachImageToDraft(currentSessionId, currentPostId, url);
      showToast("Image added to your draft");
    }
    close();
  };
  // Overlay elements stay live/editable until here; flatten them into the image
  // only at commit (no per-edit "Apply").
  if (st?.currentImage && st.overlays.length) {
    compositeOverlays(st.currentImage.url, st.overlays, st.currentImage.w, st.currentImage.h)
      .then(finalize)
      .catch(() => finalize(imageStudio.commit(KEY)));
    return;
  }
  finalize(imageStudio.commit(KEY));
}

// Apply an edit. Annotation composites the strokes into the image locally (a
// faithful result); every other tool runs a mocked reseed inside applyEdit.
function applyEditTool(tool) {
  if (tool === "annotate") {
    const canvas = modal.querySelector("canvas[data-img-annotate]");
    const st = state();
    if (!canvas || !st?.currentImage) return;
    compositeAnnotation(st.currentImage.url, canvas)
      .then((dataUrl) => imageStudio.applyEdit(KEY, "annotate", { dataUrl }))
      .catch(() => imageStudio.applyEdit(KEY, "annotate")); // fallback: mocked reseed
    return;
  }
  if (tool === "prompt") {
    const ta = modal.querySelector("[data-img-edit-prompt]");
    if (ta) imageStudio.setEditPromptSilent(KEY, ta.value);
  }
  imageStudio.applyEdit(KEY, tool);
}

// Composite the source image + the annotation canvas into a PNG data URL.
// Picsum sends `Access-Control-Allow-Origin: *`, so crossOrigin lets us export;
// if the canvas ends up tainted, the caller falls back to a mocked reseed.
function compositeAnnotation(url, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const out = document.createElement("canvas");
        out.width = img.naturalWidth || canvas.width;
        out.height = img.naturalHeight || canvas.height;
        const ctx = out.getContext("2d");
        ctx.drawImage(img, 0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0, out.width, out.height);
        resolve(out.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Flatten the base image + all overlay elements (logos drawn, text painted with
// optional outline/shadow) into a PNG data URL at the image's intrinsic size.
function compositeOverlays(baseUrl, overlays, w, h) {
  const logoUrls = [...new Set(overlays.filter((o) => o.kind === "logo").map((o) => o.url))];
  return Promise.all([loadImg(baseUrl), ...logoUrls.map(loadImg)]).then(([base, ...logos]) => {
    const logoMap = new Map(logoUrls.map((u, i) => [u, logos[i]]));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.drawImage(base, 0, 0, w, h);
    for (const o of overlays) {
      ctx.save();
      ctx.translate(o.xF * w, o.yF * h);
      ctx.rotate(o.rot || 0);
      if (o.kind === "logo") {
        const img = logoMap.get(o.url);
        const dw = o.wF * w;
        const ratio = img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
        const dh = dw * ratio;
        if (img) ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        const fontPx = o.sizeF * h;
        ctx.font = `${o.bold ? 700 : 400} ${fontPx}px Averta, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (o.outline) {
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = fontPx * 0.18;
          ctx.shadowOffsetY = fontPx * 0.04;
          ctx.lineWidth = fontPx * 0.12;
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.lineJoin = "round";
          ctx.strokeText(o.text || "", 0, 0);
          ctx.shadowColor = "transparent";
        }
        ctx.fillStyle = o.color || "#FFFFFF";
        ctx.fillText(o.text || "", 0, 0);
      }
      ctx.restore();
    }
    return out.toDataURL("image/png");
  });
}

// Freehand stroke on the brush canvas. Annotate = opaque orange (baked into the
// image); fill / remove = translucent blue mask (visual only — the region seeds
// a mocked reseed).
function startStroke(canvas, downEvent) {
  downEvent.preventDefault();
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const annotate = canvas.dataset.tool === "annotate";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = annotate ? "#ff3c00" : "#178dfe";
  ctx.globalAlpha = annotate ? 1 : 0.4;
  ctx.lineWidth = annotate ? Math.max(4, canvas.width * 0.01) : Math.max(18, canvas.width * 0.06);
  const at = (e) => [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  const [x0, y0] = at(downEvent);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + 0.01, y0 + 0.01);
  ctx.stroke();
  const move = (e) => {
    const [x, y] = at(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// Move / resize / rotate a placed overlay. Updates state silently + the element
// directly during the gesture (no re-render → smooth), then notifies on up.
function startOverlayGesture(event, el) {
  event.preventDefault();
  const id = el.dataset.imgOverlay;
  const o = imageStudio.getOverlay(KEY, id);
  const frame = modal.querySelector(".image-studio__frame");
  if (!o || !frame) return;
  const rect = frame.getBoundingClientRect();
  const mode = event.target.closest("[data-img-overlay-resize]")
    ? "resize"
    : event.target.closest("[data-img-overlay-rotate]")
      ? "rotate"
      : "move";
  // Select immediately without a re-render (toggle classes directly).
  const st = state();
  if (st) st.selectedOverlayId = id;
  modal.querySelectorAll(".image-studio__overlay.is-selected").forEach((n) => n.classList.remove("is-selected"));
  el.classList.add("is-selected");

  const cx = rect.left + o.xF * rect.width;
  const cy = rect.top + o.yF * rect.height;
  const startDist = Math.hypot(event.clientX - cx, event.clientY - cy) || 1;
  const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
  const start = { px: event.clientX, py: event.clientY, xF: o.xF, yF: o.yF, wF: o.wF, sizeF: o.sizeF, rot: o.rot || 0 };
  const textNode = el.querySelector(".image-studio__overlay-text");

  const move = (e) => {
    if (mode === "move") {
      const xF = clamp(start.xF + (e.clientX - start.px) / rect.width, 0.02, 0.98);
      const yF = clamp(start.yF + (e.clientY - start.py) / rect.height, 0.02, 0.98);
      imageStudio.updateOverlaySilent(KEY, id, { xF, yF });
      el.style.left = `${xF * 100}%`;
      el.style.top = `${yF * 100}%`;
    } else if (mode === "resize") {
      const factor = Math.hypot(e.clientX - cx, e.clientY - cy) / startDist;
      if (o.kind === "logo") {
        const wF = clamp(start.wF * factor, 0.05, 1.3);
        imageStudio.updateOverlaySilent(KEY, id, { wF });
        el.style.width = `${wF * 100}%`;
      } else {
        const sizeF = clamp(start.sizeF * factor, 0.02, 0.5);
        imageStudio.updateOverlaySilent(KEY, id, { sizeF });
        if (textNode) textNode.style.fontSize = `${sizeF * 100}cqh`;
      }
    } else {
      const rot = start.rot + (Math.atan2(e.clientY - cy, e.clientX - cx) - startAngle);
      imageStudio.updateOverlaySilent(KEY, id, { rot });
      el.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    const cur = state();
    if (cur) cur.activeTool = o.kind; // surface the matching panel
    imageStudio.notifyOverlays(KEY);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ── Event delegation ──────────────────────────────────────────────────────

function onClick(event) {
  const st = state();
  if (!st) return;
  if (event.target.closest("[data-img-close]")) return void close();
  if (event.target.closest("[data-img-style-upload]")) return void openFilePicker("style");
  const styleBtn = event.target.closest("[data-img-style]");
  if (styleBtn) return void imageStudio.setStyle(KEY, styleBtn.dataset.imgStyle);
  const moodBtn = event.target.closest("[data-img-mood]");
  if (moodBtn) return void imageStudio.setMood(KEY, moodBtn.dataset.imgMood);
  const fmtBtn = event.target.closest("[data-img-format]");
  if (fmtBtn) return void imageStudio.setFormat(KEY, fmtBtn.dataset.imgFormat);
  const varBtn = event.target.closest("[data-img-varcount]");
  if (varBtn) return void imageStudio.setVariationCount(KEY, Number(varBtn.dataset.imgVarcount));
  if (event.target.closest("[data-img-ref-add]")) return void openFilePicker("ref");
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);
  if (event.target.closest("[data-img-derive]") && !st.promptLoading) return void imageStudio.runDerive(KEY);
  const modeBtn = event.target.closest("[data-img-mode]");
  if (modeBtn) return void imageStudio.setMode(KEY, modeBtn.dataset.imgMode);
  // Generate + Regenerate share the same path: sync the prompt, then run.
  if (event.target.closest("[data-img-generate]") || event.target.closest("[data-img-regenerate]")) {
    const ta = modal.querySelector("[data-img-prompt]");
    if (ta) imageStudio.setPromptSilent(KEY, ta.value);
    if ((state()?.promptText || "").trim()) imageStudio.runGeneration(KEY);
    return;
  }
  const varPick = event.target.closest("[data-img-variation]");
  if (varPick) return void imageStudio.selectVariation(KEY, Number(varPick.dataset.imgVariation));
  const toolBtn = event.target.closest("[data-img-tool]");
  if (toolBtn) {
    const t = toolBtn.dataset.imgTool;
    // Overlay tools don't toggle: "Add text" adds an element; "Add logo" opens
    // the upload/presets panel (the element is added on pick).
    if (t === "text") {
      imageStudio.setActiveTool(KEY, "text", { toggle: false });
      imageStudio.addOverlay(KEY, { kind: "text" });
      return;
    }
    if (t === "logo") return void imageStudio.setActiveTool(KEY, "logo", { toggle: false });
    return void imageStudio.setActiveTool(KEY, t);
  }
  // Overlay controls (Add logo / Add text panels).
  if (event.target.closest("[data-img-logo-upload]")) return void openLogoPicker();
  const preset = event.target.closest("[data-img-logo-preset]");
  if (preset) return void imageStudio.addOverlay(KEY, { kind: "logo", url: preset.dataset.imgLogoPreset });
  const ovDel = event.target.closest("[data-img-overlay-delete]");
  if (ovDel) return void imageStudio.removeOverlay(KEY, ovDel.dataset.imgOverlayDelete);
  const txtColor = event.target.closest("[data-img-text-color]");
  if (txtColor && st.selectedOverlayId)
    return void imageStudio.updateOverlay(KEY, st.selectedOverlayId, { color: txtColor.dataset.imgTextColor });
  const txtSize = event.target.closest("[data-img-text-size]");
  if (txtSize && st.selectedOverlayId)
    return void imageStudio.updateOverlay(KEY, st.selectedOverlayId, { sizeF: Number(txtSize.dataset.imgTextSize) });
  if (event.target.closest("[data-img-text-bold]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    return void imageStudio.updateOverlay(KEY, st.selectedOverlayId, { bold: !o?.bold });
  }
  if (event.target.closest("[data-img-text-outline]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    return void imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outline: !o?.outline });
  }
  if (event.target.closest("[data-img-clear-brush]")) {
    const canvas = modal.querySelector("canvas[data-img-annotate]");
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const expandFmt = event.target.closest("[data-img-expand-format]");
  if (expandFmt) return void imageStudio.applyEdit(KEY, "expand", { formatId: expandFmt.dataset.imgExpandFormat });
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-use]")) return void useImage();
}

function onInput(event) {
  if (event.target.matches("[data-img-prompt]")) {
    imageStudio.setPromptSilent(KEY, event.target.value);
    const gen = modal.querySelector("[data-img-generate]");
    if (gen) gen.disabled = !event.target.value.trim();
  } else if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
  } else if (event.target.matches("[data-img-text-input]")) {
    // Live-edit the selected text overlay without a re-render (keeps focus).
    const st = state();
    if (!st?.selectedOverlayId) return;
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { text: event.target.value });
    const node = modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.textContent = event.target.value;
  }
}

function onPointerDown(event) {
  const canvas = event.target.closest("canvas[data-img-annotate]");
  if (canvas) return void startStroke(canvas, event);
  if (event.target.closest("[data-img-overlay-delete]")) return; // click handles delete
  const overlayEl = event.target.closest("[data-img-overlay]");
  if (overlayEl) startOverlayGesture(event, overlayEl);
}

// ── Public API ────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("imageStudioBackdrop");
  modal = document.getElementById("imageStudioModal");
  body = document.getElementById("imageStudioBody");
  modal.addEventListener("click", onClick);
  modal.addEventListener("input", onInput);
  modal.addEventListener("pointerdown", onPointerDown);
  bindOverlayDismissal({ modal, backdrop, close });
}

export function open(postId, opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  currentPostId = postId || null;
  currentSessionId = opts.sessionId || null;

  // Resolve the draft's network so the format options + default match where the
  // image will publish (a LinkedIn draft defaults to LinkedIn's ratio).
  const post = currentSessionId ? getPosts(currentSessionId).find((p) => p.id === currentPostId) : null;
  imageStudio.start(KEY, {
    postId: currentPostId,
    network: post?.network || null,
    formatId: post?.format || null,
  });
  if (unsub) unsub();
  unsub = imageStudio.subscribe(KEY, renderBody);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();
  if (currentPostId) imageStudio.runDerive(KEY);
}

function close() {
  if (!initialized) return;
  if (unsub) {
    unsub();
    unsub = null;
  }
  imageStudio.exit(KEY);
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  currentPostId = null;
  currentSessionId = null;
  notifyClose(MODAL_ID);
}
