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
import { getPosts, attachImageToDraft, attachCarouselToDraft } from "../posts-store.js?v=36";
import { getSessionById } from "../sessions-store.js?v=6";
import { getContextById } from "../contexts-store.js?v=37";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../social-profiles.js?v=26";
import { renderPostCard } from "./post-card.js?v=68";
import * as imageStudio from "../image-studio.js?v=26";

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
  // Edit mode is a direct editor: a full-width canvas with a floating action bar
  // + on-canvas manipulation (no left panel). Generate keeps its 2-column
  // options-panel + canvas layout.
  const workspace =
    st.mode === "edit"
      ? `<section class="image-studio__canvas" aria-label="Preview">${canvasContent(st)}</section>`
      : `<aside class="image-studio__panel" aria-label="Generation options">${generateControls(st)}</aside>
         <section class="image-studio__canvas" aria-label="Preview">${canvasContent(st)}</section>`;
  return html`
    <div class="image-studio image-studio--${st.mode}">
      ${raw(topBar(st))}
      <div class="image-studio__workspace">${raw(workspace)}</div>
      ${raw(footer(st))}
    </div>
  `;
}

function topBar(st) {
  // Edit acts on the working image; the in-feed preview is a right-pane view
  // toggle (see canvasViewToggle), not a mode.
  const hasImg = !!st.currentImage;
  const editState = (st.mode === "edit" ? " active" : "") + (hasImg ? "" : " disabled");
  const lockedAttrs = hasImg ? "" : 'disabled title="Generate an image first"';
  // Classic DS modal header (.ap-dialog-header / .ap-dialog-title); the × is the
  // .ap-dialog-close in the shell. DS Tabs (.ap-tabs) sit under it as the peer
  // modes, used natively.
  return `<div class="ap-dialog-header image-studio__header">
      <span class="ap-dialog-title image-studio__title"><i class="ap-icon-archie-official" aria-hidden="true"></i>Image Studio</span>
    </div>
    <div class="ap-tabs image-studio__modes">
      <div class="ap-tabs-nav" role="tablist" aria-label="Studio mode">
        <button type="button" class="ap-tabs-tab${st.mode === "generate" ? " active" : ""}" role="tab" aria-selected="${st.mode === "generate"}" data-img-mode="generate"><span>Generate</span></button>
        <button type="button" class="ap-tabs-tab${editState}" role="tab" aria-selected="${st.mode === "edit"}" data-img-mode="edit" ${lockedAttrs}><span>Edit</span></button>
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

// Edit mode — the floating action bar over the canvas bottom: an always-on
// Reprompt field + Apply (the #1 edit), then compact Crop / Add text / Add logo.
// Crop drops straight into a draw-a-rectangle mode (see cropConfirmBar); Add logo
// opens a small popover; text is added and edited directly on the canvas (see
// renderOverlay). Inspired by the bottom tool bar of Krea AI / DALL·E.
function actionBar(st) {
  // Crop draw mode takes over the whole bar with its own confirm controls.
  if (st.cropDrawing) return cropConfirmBar(st);
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="image-studio__actionbar" role="toolbar" aria-label="Edit tools">
    <div class="image-studio__actionbar-row">
      <input type="text" class="image-studio__actionbar-input" data-img-edit-prompt placeholder="Describe a change to the image…" value="${escapeHtml(st.editPrompt || "")}" ${busy} />
      <button type="button" class="ap-button primary orange image-studio__actionbar-apply" data-img-apply-edit="prompt" ${busy}><i class="ap-icon-archie-official" aria-hidden="true"></i><span>Apply</span></button>
    </div>
    <div class="image-studio__actionbar-row image-studio__actionbar-tools">
      <button type="button" class="ap-button stroked grey" data-img-crop-start ${busy}><i class="ap-icon-cropper" aria-hidden="true"></i><span>Crop</span></button>
      <button type="button" class="ap-button stroked grey" data-img-add-text ${busy}><i class="ap-icon-closed-captions" aria-hidden="true"></i><span>Add text</span></button>
      <div class="image-studio__actionbar-anchor">
        <button type="button" class="ap-button stroked grey" data-img-popover-toggle="logo" aria-haspopup="true" aria-expanded="${st.openPopover === "logo"}" ${busy}><i class="ap-icon-file--image" aria-hidden="true"></i><span>Add logo</span></button>
        ${st.openPopover === "logo" ? logoPopover(st) : ""}
      </div>
    </div>
  </div>`;
}

// The crop-draw toolbar — replaces the tools row while a crop rectangle is being
// drawn. A short hint, aspect-lock chips (Freeform + the ratio presets), then
// Cancel / Apply crop.
function cropConfirmBar(st) {
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="image-studio__actionbar image-studio__actionbar--crop" role="toolbar" aria-label="Crop">
    <div class="image-studio__actionbar-row image-studio__crop-row">
      <p class="image-studio__crop-hint"><i class="ap-icon-cropper" aria-hidden="true"></i>Drag to draw a crop, or adjust the box</p>
      <div class="image-studio__crop-actions">
        <button type="button" class="ap-button ghost grey" data-img-crop-cancel ${busy}><span>Cancel</span></button>
        <button type="button" class="ap-button primary orange" data-img-crop-apply ${busy}><i class="ap-icon-check" aria-hidden="true"></i><span>Apply crop</span></button>
      </div>
    </div>
    <div class="image-studio__actionbar-row image-studio__crop-aspects">${cropAspectChips(st)}</div>
  </div>`;
}

// Freeform + the ratio presets, as a single chip group that locks the crop box's
// aspect (Freeform = unconstrained, the default). Each chip carries a small glyph
// drawn to its own proportions (Freeform = a dashed square) so the ratio reads at
// a glance — more legible than a bare label.
function cropAspectChips(st) {
  const chip = (id, label, ratio, on) =>
    `<button type="button" class="image-studio__crop-aspect${ratio ? "" : " image-studio__crop-aspect--free"}${on ? " is-selected" : ""}" data-img-crop-aspect="${escapeHtml(id)}" aria-pressed="${on}"><span class="image-studio__crop-aspect-glyph"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`;
  const freeform = chip("free", "Freeform", null, !st.cropAspect);
  const presets = imageStudio
    .formatChoices(KEY)
    .map((f) => {
      const on = !!st.cropAspect && Math.abs(st.cropAspect - f.ratio) < 0.001;
      return chip(f.id, f.tag, f.ratio, on);
    })
    .join("");
  return `${freeform}${presets}`;
}

function logoPopover() {
  // Upload is the first tile in the grid (a dashed "add" cell) so it reads as
  // part of the set and the layout scales to many logos: the grid scrolls.
  const uploadTile = `<button type="button" class="image-studio__preset image-studio__preset--upload" data-img-logo-upload title="Upload a logo"><i class="ap-icon-upload" aria-hidden="true"></i><span>Upload</span></button>`;
  const presets = imageStudio.LOGO_PRESETS.map(
    (p) =>
      `<button type="button" class="image-studio__preset" data-img-logo-preset="${escapeHtml(p.url)}" title="${escapeHtml(p.label)}"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.label)}" /></button>`,
  ).join("");
  return `<div class="image-studio__popover image-studio__popover--logo" data-img-popover role="menu" aria-label="Logos">
    <p class="image-studio__popover-label">Logos</p>
    <div class="image-studio__presets">${uploadTile}${presets}</div>
  </div>`;
}

// The text-colour swatches for the selected text element, opened from its mini
// toolbar. The Playbook brand colours get their own framed section (so they read
// as "your brand"); the rest — the defaults + any custom colours + an "add"
// picker — sit below. All deduped case-insensitively across both groups.
// Shared swatch grid (framed Brand group + More group + a native "add" picker),
// reused by both the fill-colour and outline-colour popovers. `applyAttr` is the
// data-attr stamped on each preset swatch; `pickAttr` on the hidden colour input.
function swatchGrid({ st, selected, applyAttr, pickAttr, pickLabel }) {
  const sel = (selected || "").toUpperCase();
  const swatch = (c) =>
    `<button type="button" class="image-studio__swatch${sel === c ? " is-selected" : ""}" ${applyAttr}="${c}" style="--sw:${c}" aria-label="${c}"></button>`;
  const seen = new Set();
  const dedupe = (list) =>
    (list || []).map((c) => (c || "").toUpperCase()).filter((c) => c && !seen.has(c) && seen.add(c));
  const brand = dedupe(st.playbookColors); // brand first → wins the dedupe
  const others = dedupe([...imageStudio.TEXT_COLORS, ...(st.customTextColors || [])]);
  const addSwatch = `<label class="image-studio__swatch image-studio__swatch--add" title="${pickLabel}"><input type="color" ${pickAttr} aria-label="${pickLabel}" /><i class="ap-icon-plus" aria-hidden="true"></i></label>`;
  const brandGroup = brand.length
    ? `<div class="image-studio__color-group image-studio__color-group--brand">
        <p class="image-studio__color-label">Brand</p>
        <span class="image-studio__swatches">${brand.map(swatch).join("")}</span>
      </div>`
    : "";
  const othersGroup = `<div class="image-studio__color-group">
      ${brand.length ? `<p class="image-studio__color-label">More</p>` : ""}
      <span class="image-studio__swatches">${others.map(swatch).join("")}${addSwatch}</span>
    </div>`;
  return `${brandGroup}${othersGroup}`;
}

function textColorPopover(o, st) {
  return `<div class="image-studio__popover image-studio__popover--textcolor" data-img-popover role="menu" aria-label="Text colour">${swatchGrid(
    {
      st,
      selected: o.color,
      applyAttr: "data-img-text-color",
      pickAttr: "data-img-text-colorpick",
      pickLabel: "Add text colour",
    },
  )}</div>`;
}

// A small on/off switch (DS toggle) for an effect popover's header.
function fxToggle(attr, on, label) {
  return `<label class="ap-toggle-container image-studio__fx-toggle" title="${label}"><input type="checkbox" ${attr} ${on ? "checked" : ""} aria-label="${label}" /><i aria-hidden="true"></i></label>`;
}

// Outline popover — on/off switch + a colour grid for the stroke colour. The grid
// dims (and swatches disable) while outline is off.
function textOutlinePopover(o, st) {
  const on = !!o.outline;
  return `<div class="image-studio__popover image-studio__popover--textcolor image-studio__popover--outline${on ? "" : " is-off"}" data-img-popover role="menu" aria-label="Outline">
    <div class="image-studio__popover-head">
      <p class="image-studio__color-label">Outline</p>
      ${fxToggle("data-img-outline-toggle", on, "Toggle outline")}
    </div>
    ${swatchGrid({ st, selected: o.outlineColor, applyAttr: "data-img-outline-color", pickAttr: "data-img-outline-colorpick", pickLabel: "Add outline colour" })}
  </div>`;
}

// Shadow popover — on/off switch + an intensity slider (0–100). The slider dims
// (and disables) while shadow is off.
function textShadowPopover(o) {
  const on = !!o.shadow;
  const val = o.shadowIntensity ?? 55;
  return `<div class="image-studio__popover image-studio__popover--shadow${on ? "" : " is-off"}" data-img-popover role="menu" aria-label="Shadow">
    <div class="image-studio__popover-head">
      <p class="image-studio__color-label">Shadow</p>
      ${fxToggle("data-img-shadow-toggle", on, "Toggle shadow")}
    </div>
    <div class="image-studio__slider-row">
      <input type="range" class="ap-slider" min="0" max="100" step="1" value="${val}" data-img-shadow-intensity aria-label="Shadow intensity" style="--fill:${val}%" ${on ? "" : "disabled"} />
      <span class="image-studio__slider-val" data-img-shadow-val>${val}</span>
    </div>
  </div>`;
}

// Font popover — a radio-style list of the bundled + uploaded fonts (each label
// previewed in its own face), then an "Import my font" row.
function textFontPopover(o, st) {
  const cur = o.fontFamily || null;
  const row = (family, label) => {
    const on = (family || null) === cur;
    const preview = family ? ` style="font-family:${cssFamily(family)}"` : "";
    return `<button type="button" class="image-studio__font-row${on ? " is-selected" : ""}" data-img-font="${escapeHtml(family || "")}" role="menuitemradio" aria-checked="${on}">
      <span class="image-studio__font-name"${preview}>${escapeHtml(label)}</span>
      ${on ? `<i class="ap-icon-check image-studio__font-check" aria-hidden="true"></i>` : ""}
    </button>`;
  };
  const builtins = imageStudio.FONT_OPTIONS.map((f) => row(f.family, f.label)).join("");
  const custom = (st.customFonts || []).map((f) => row(f.family, f.label)).join("");
  return `<div class="image-studio__popover image-studio__popover--font" data-img-popover role="menu" aria-label="Font">
    <div class="image-studio__font-list">${builtins}${custom}</div>
    <div class="image-studio__font-div" aria-hidden="true"></div>
    <button type="button" class="image-studio__font-row image-studio__font-row--upload" data-img-font-upload>
      <i class="ap-icon-upload image-studio__font-upload-icon" aria-hidden="true"></i>
      <span class="image-studio__font-name">Import my font…</span>
    </button>
  </div>`;
}

// A compact segmented pill at the top of the right pane, flipping between the
// plain image and the network-accurate in-feed preview. Shown only once there's
// an image to preview (results in generate mode, or edit mode).
function canvasViewToggle(st) {
  const feed = st.canvasView === "feed";
  const netIcon = st.network ? NETWORK_ICON_BY_PLATFORM[st.network] || "ap-icon-eye" : "ap-icon-eye";
  return `<div class="image-studio__viewseg" role="group" aria-label="Preview view">
    <button type="button" class="image-studio__viewseg-btn" data-img-view="image" aria-pressed="${!feed}"><i class="ap-icon-image" aria-hidden="true"></i>Image</button>
    <button type="button" class="image-studio__viewseg-btn" data-img-view="feed" aria-pressed="${feed}"><i class="${netIcon}" aria-hidden="true"></i>In feed</button>
  </div>`;
}

// Right canvas — shared; content depends on mode / generation phase, with an
// optional in-feed preview view layered on top via the toggle.
function canvasContent(st) {
  const hasImg = !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
  const showToggle = hasImg && (st.mode === "edit" || (st.mode === "generate" && st.genPhase === "results"));
  const toggle = showToggle ? canvasViewToggle(st) : "";
  let inner;
  if (showToggle && st.canvasView === "feed") inner = previewCanvas(st);
  else if (st.mode === "edit") inner = editCanvas(st);
  else if (st.genPhase === "generating") inner = generatingCanvas(st);
  else if (st.genPhase === "results") inner = resultsCanvas(st);
  else
    inner = `<div class="gen-empty">
      <i class="ap-icon-image" aria-hidden="true"></i>
      <p class="gen-empty-title">Your image appears here</p>
      <span class="gen-empty-sub">Describe it on the left, then generate.</span>
    </div>`;
  // Edit mode (image view): the floating action bar lives over the canvas.
  const editingImage = st.mode === "edit" && !(showToggle && st.canvasView === "feed");
  const bar = editingImage ? actionBar(st) : "";
  return `${toggle}<div class="image-studio__canvas-body">${inner}</div>${bar}`;
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

// One large preview of the focused image + a bottom filmstrip (chutier). In
// single mode the filmstrip is a pick-one (check on the chosen variation); in
// carousel mode every tile is a kept slide (numbered, removable) and clicking a
// tile only focuses it for preview.
function resultsCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const carousel = st.outputMode === "carousel";
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const current = st.variations[sel] || st.variations[0];
  const cap = carousel ? imageStudio.carouselMaxFor(st.network) || 8 : 8;
  const canRemove = carousel && st.variations.length > 2;
  const thumbs = st.variations
    .map((v, i) => {
      const on = i === sel;
      // Carousel tiles are <div>s (not <button>s) so the per-slide remove
      // <button> can nest validly; single-mode tiles stay pick-one <button>s.
      if (carousel) {
        const label = `Slide ${i + 1}`;
        return `<div class="image-studio__thumb${on ? " is-selected" : ""}" role="button" tabindex="0" aria-pressed="${on}" data-img-variation="${i}" title="${label}">
          <img src="${escapeHtml(v.url)}" alt="${label}" />
          <span class="image-studio__thumb-num" aria-hidden="true">${i + 1}</span>
          ${canRemove ? `<button type="button" class="image-studio__thumb-remove" data-img-remove-variation="${i}" aria-label="Remove ${label}"><i class="ap-icon-close" aria-hidden="true"></i></button>` : ""}
        </div>`;
      }
      return `<button type="button" class="image-studio__thumb${on ? " is-selected" : ""}" role="tab" aria-selected="${on}" data-img-variation="${i}" title="Variation ${i + 1}">
        <img src="${escapeHtml(v.url)}" alt="Variation ${i + 1}" />
        ${on ? `<span class="image-studio__thumb-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </button>`;
    })
    .join("");
  const addTile =
    st.variations.length < cap
      ? `<button type="button" class="image-studio__thumb image-studio__thumb--add" data-img-add-variation title="${carousel ? "Add a slide" : "Generate another"}" ${st.addingVariation ? "disabled" : ""}>${
          st.addingVariation
            ? `<span class="gen-image-spinner"></span>`
            : `<i class="ap-icon-plus" aria-hidden="true"></i>`
        }</button>`
      : "";
  const stripLabel = carousel
    ? `<p class="image-studio__filmstrip-label"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Carousel · ${st.variations.length} slides — all slides are kept</p>`
    : "";
  const strip = `<div class="image-studio__filmstrip-wrap">${stripLabel}<div class="image-studio__filmstrip" role="tablist" aria-label="${carousel ? "Slides" : "Variations"}">${thumbs}${addTile}</div></div>`;
  return `<div class="image-studio__preview-stage">
    <div class="image-studio__preview-main">
      <div class="image-studio__frame" style="--imgs-ratio:${ratio}">
        <img class="image-studio__frame-img" src="${current ? escapeHtml(current.url) : ""}" alt="${carousel ? `Slide ${sel + 1}` : "Selected variation"}" />
        ${carousel ? `<span class="image-studio__slide-pos" aria-hidden="true">${sel + 1} / ${st.variations.length}</span>` : ""}
      </div>
    </div>
    ${strip}
  </div>`;
}

function editCanvas(st) {
  const img = st.currentImage;
  const ratio = img ? img.w / img.h : imageStudio.activeRatio(KEY);
  const busy = st.editBusy
    ? `<div class="image-studio__busy"><span class="gen-image-spinner"></span><span>Applying…</span></div>`
    : "";
  const badge =
    st.outputMode === "carousel"
      ? `<span class="image-studio__badge image-studio__badge--slide"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Editing slide ${(st.selectedIndex ?? 0) + 1} / ${st.variations.length}</span>`
      : "";
  // Direct editor: the image is clipped inside .image-studio__frame-clip while
  // the frame itself is overflow:visible, so the on-element toolbars / popovers /
  // handles can extend past the image edge without being cut off.
  return `<div class="image-studio__frame" style="--imgs-ratio:${ratio}">
      <div class="image-studio__frame-clip"><img class="image-studio__frame-img" src="${img ? img.url : ""}" alt="Working image" /></div>
      ${overlayLayer(st)}${st.cropDrawing && !st.editBusy ? renderCropRect(st) : ""}${busy}${badge}
    </div>`;
}

// The draggable/resizable crop rectangle drawn over the working image. Its own
// overflow:hidden layer clips the box-shadow dim-mask to the image bounds (the
// frame itself is overflow:visible in edit mode). Corner handles resize it; the
// body drags it; pointerdown on the dimmed area draws a fresh rect.
function renderCropRect(st) {
  const r = st.cropRect || { xF: 0.15, yF: 0.15, wF: 0.7, hF: 0.7 };
  const style = `left:${r.xF * 100}%; top:${r.yF * 100}%; width:${r.wF * 100}%; height:${r.hF * 100}%;`;
  const handles = ["nw", "ne", "sw", "se"]
    .map(
      (c) =>
        `<span class="image-studio__crop-handle image-studio__crop-handle--${c}" data-img-crop-handle="${c}" aria-hidden="true"></span>`,
    )
    .join("");
  return `<div class="image-studio__crop-layer" data-img-crop-layer>
      <div class="image-studio__croprect" data-img-croprect style="${style}">${handles}</div>
    </div>`;
}

// Preview mode — the post rendered in-feed exactly as the Drafts board shows it
// (reuses renderPostCard), fed the CURRENT studio image / carousel. App chrome
// (action stack, feedback strip, hover controls) is hidden via scoped CSS.
function previewCanvas(st) {
  const post =
    currentSessionId && currentPostId ? getPosts(currentSessionId).find((p) => p.id === currentPostId) : null;
  const base = post || {
    id: currentPostId || "preview",
    author: { name: "You", title: "", initials: "YO", connection: "1st", visibility: "public" },
    network: st.network || "linkedin",
    status: "ready",
    timeLabel: "now",
    text: ["Your post text will appear here."],
    hashtags: [],
    cta: "",
    stats: { likes: 0, comments: 0, reposts: 0 },
  };
  let media;
  if (st.outputMode === "carousel") {
    const urls = st.variations.map((v) => v.url);
    media = { imageUrl: urls[0] || null, carousel: urls };
  } else {
    const url = st.currentImage?.url || (st.selectedIndex != null ? st.variations[st.selectedIndex]?.url : null);
    media = { imageUrl: url, carousel: null };
  }
  // Null clip/regenerate so the image branch renders (not the video PIP).
  const previewPost = { ...base, clipRef: null, isRegenerating: false, ...media };
  const netLabel = NETWORK_LABEL[st.network] || st.network || "your network";
  return `<div class="image-studio__preview">
    <p class="image-studio__preview-note">How this looks on ${escapeHtml(netLabel)}</p>
    <div class="image-studio__preview-network">${renderPostCard(previewPost)}</div>
  </div>`;
}

// Draggable logo/text elements layered over the working image (edit mode).
function overlayLayer(st) {
  if (!st.overlays.length) return "";
  // Selected → un-clip so a bleeding element + its chrome stay grabbable; idle →
  // clip to the image (matches the flattened result).
  const cls = `image-studio__overlay-layer${st.selectedOverlayId ? " has-selection" : ""}`;
  return `<div class="${cls}" data-img-overlay-layer>${st.overlays
    .map((o) => renderOverlay(o, o.id === st.selectedOverlayId, o.id === st.editingOverlayId, st))
    .join("")}</div>`;
}

// Mini toolbar attached to a selected TEXT element (shown via .is-selected CSS,
// so it appears the moment the element is selected — no re-render needed). Holds
// the style controls that used to live in the side panel: colour (opens the
// swatch popover), size S/M/L, Bold, Outline, Delete.
// Size is changed with the corner handle (drag), so the toolbar carries only the
// labelled style controls: colour, Bold, Outline, and an icon-only Delete.
function textToolbar(o, st, selected) {
  const open = (name) => selected && st.openPopover === name;
  const colorOpen = open("textColor");
  const fontOpen = open("textFont");
  const outlineOpen = open("textOutline");
  const shadowOpen = open("textShadow");
  const fontLabel = o.fontFamily
    ? (st.customFonts || []).find((f) => f.family === o.fontFamily)?.label || o.fontFamily
    : "Default";
  return `<div class="image-studio__text-toolbar" data-img-text-toolbar>
    <button type="button" class="image-studio__tt-btn" data-img-popover-toggle="textColor" aria-haspopup="true" aria-expanded="${colorOpen}" aria-label="Text colour"><span class="image-studio__tt-swatch" style="--sw:${escapeHtml(o.color || "#FFFFFF")}"></span><span>Colour</span></button>
    ${colorOpen ? textColorPopover(o, st) : ""}
    <span class="image-studio__tt-sep" aria-hidden="true"></span>
    <button type="button" class="image-studio__tt-btn image-studio__tt-font" data-img-popover-toggle="textFont" aria-haspopup="true" aria-expanded="${fontOpen}" title="Font — ${escapeHtml(fontLabel)}" aria-label="Font"><span class="image-studio__tt-aa" aria-hidden="true">Aa</span></button>
    ${fontOpen ? textFontPopover(o, st) : ""}
    <button type="button" class="image-studio__tt-btn image-studio__tt-bold" data-img-text-bold aria-pressed="${!!o.bold}">Bold</button>
    <span class="image-studio__tt-sep" aria-hidden="true"></span>
    <button type="button" class="image-studio__tt-btn image-studio__tt-outline${o.outline ? " is-on" : ""}" data-img-popover-toggle="textOutline" aria-haspopup="true" aria-expanded="${outlineOpen}" title="Outline"><span class="image-studio__tt-swatch" style="--sw:${escapeHtml(o.outlineColor || "#0A1B33")}"></span><span>Outline</span></button>
    ${outlineOpen ? textOutlinePopover(o, st) : ""}
    <button type="button" class="image-studio__tt-btn image-studio__tt-shadow${o.shadow ? " is-on" : ""}" data-img-popover-toggle="textShadow" aria-haspopup="true" aria-expanded="${shadowOpen}" title="Shadow"><span class="image-studio__tt-shadowdot" aria-hidden="true"></span><span>Shadow</span></button>
    ${shadowOpen ? textShadowPopover(o) : ""}
    <span class="image-studio__tt-sep" aria-hidden="true"></span>
    <button type="button" class="image-studio__tt-del" data-img-overlay-delete="${o.id}" aria-label="Delete text"><i class="ap-icon-trash" aria-hidden="true"></i></button>
  </div>`;
}

// ── Shared text-overlay render helpers ──────────────────────────────────────
// Outline stroke + drop-shadow are expressed as fractions of the font size so the
// live <span> (em units) and the canvas bake (×fontPx) render identically.
const STROKE_K = 0.06; // -webkit-text-stroke width / canvas lineWidth ÷ font-size

// shadowIntensity 0–100 → { blurEm, offYEm, alpha }. Calibrated so the default (55)
// reproduces the previous baked shadow exactly: { blur .18em, offY .04em, α .55 }.
function shadowMetrics(i) {
  const t = Math.max(0, Math.min(100, i ?? 0)) / 55;
  return { blurEm: 0.06 + t * 0.12, offYEm: 0.02 + t * 0.02, alpha: 0.2 + t * 0.35 };
}

// The primary family, quoted if multi-word (for document.fonts.load / canvas).
function fontPrimary(family) {
  if (!family) return "Averta";
  return /\s/.test(family) ? `"${family}"` : family;
}

// Full family stack for CSS font-family / the canvas font shorthand — always keep
// the Averta + sans-serif fallback. null family → the app default (Averta).
function cssFamily(family) {
  return family ? `${fontPrimary(family)}, Averta, sans-serif` : "Averta, sans-serif";
}

function renderOverlay(o, selected, editing, st) {
  const base = `left:${o.xF * 100}%; top:${o.yF * 100}%; transform:translate(-50%,-50%) rotate(${o.rot || 0}rad);`;
  const style = o.kind === "logo" ? `${base} width:${o.wF * 100}%;` : base;
  let inner;
  let chrome;
  if (o.kind === "logo") {
    inner = `<img src="${escapeHtml(o.url)}" alt="" draggable="false" />`;
    // Logos keep the corner ×, rotate and resize handles.
    chrome = `<button type="button" class="image-studio__overlay-delete" data-img-overlay-delete="${o.id}" aria-label="Delete element"><i class="ap-icon-close" aria-hidden="true"></i></button>
      <span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>
      <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  } else {
    const sm = shadowMetrics(o.shadowIntensity);
    const textStyle =
      `color:${escapeHtml(o.color || "#FFFFFF")}; font-family:${cssFamily(o.fontFamily)};` +
      ` font-size:${o.sizeF * 100}cqh; font-weight:${o.bold ? 700 : 400};` +
      (o.outline ? ` -webkit-text-stroke:${STROKE_K}em ${escapeHtml(o.outlineColor || "#0A1B33")};` : "") +
      (o.shadow ? ` text-shadow:0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha});` : "");
    // Editing = contenteditable + focusable; otherwise inert so pointerdown falls
    // through to the draggable overlay div.
    const editAttrs = editing
      ? ` contenteditable="true" role="textbox" aria-multiline="false" aria-label="Text element" spellcheck="false"`
      : "";
    inner = `<span class="image-studio__overlay-text" data-img-overlay-text${editAttrs} style="${textStyle}">${escapeHtml(o.text || "")}</span>`;
    // Text elements: mini toolbar (style) + rotate/resize handles. Delete lives
    // in the toolbar. Handles are hidden while editing (see CSS).
    chrome = `${textToolbar(o, st, selected)}
      <span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>
      <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  }
  const cls = `image-studio__overlay${o.kind === "text" ? " is-text" : ""}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
  return `<div class="${cls}" data-img-overlay="${o.id}" tabindex="0" role="button" aria-label="${o.kind === "text" ? "Text element" : "Logo element"}" style="${style}">${inner}${chrome}</div>`;
}

// Bottom bar — one primary CTA per mode / phase.
function footer(st) {
  if (st.mode === "edit") {
    // Editing a carousel slide bakes the edit back into that slide and returns
    // to the carousel; editing a single image attaches it to the draft.
    const carouselSlide = st.outputMode === "carousel";
    const primary = carouselSlide
      ? `<button type="button" class="ap-button primary orange" data-img-apply-slide ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Apply to slide ${(st.selectedIndex ?? 0) + 1}</span></button>`
      : `<button type="button" class="ap-button primary orange" data-img-use ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Use this image</span></button>`;
    return `<div class="image-studio__bar">
      <button type="button" class="ap-button ghost grey" data-img-undo ${imageStudio.canUndo(KEY) ? "" : "disabled"}><i class="ap-icon-refresh"></i><span>Undo</span></button>
      <div class="image-studio__bar-spacer"></div>
      ${primary}
    </div>`;
  }
  if (st.genPhase === "generating") {
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>
    </div>`;
  }
  if (st.genPhase === "results") {
    const carousel = st.outputMode === "carousel";
    const useLabel = carousel ? `Use carousel · ${st.variations.length} slides` : "Use this image";
    const useReady = carousel ? st.variations.length >= 2 : !!st.currentImage;
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button stroked grey" data-img-regenerate><i class="ap-icon-refresh"></i><span>Regenerate</span></button>
      <button type="button" class="ap-button primary orange" data-img-use ${useReady ? "" : "disabled"}><i class="ap-icon-check"></i><span>${useLabel}</span></button>
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

// Playbook reference tile — an explicit include/exclude control. The whole tile
// is the toggle; a checkbox + a worded "Used" / "Skipped" state (not colour
// alone) make the two states unmistakable.
function playbookRefTile(r, on, capReached) {
  const lockedOff = !on && capReached;
  const note = (r.note || "").trim();
  const nets = Array.isArray(r.networks) ? r.networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  const stateTitle = on ? "Used in this image — tap to skip" : "Skipped — tap to use";
  // Guidance stays out of the grid — a small "i" badge carries the note +
  // target networks in its tooltip instead of a caption under every tile.
  const infoParts = [];
  if (note) infoParts.push(note);
  if (nets.length) infoParts.push(`Best for ${nets.map((n) => NETWORK_LABEL[n] || n).join(", ")}`);
  const infoText = infoParts.join(" · ");
  const infoBadge = infoText
    ? `<span class="image-studio__ref-info" title="${escapeHtml(infoText)}" aria-label="${escapeHtml(infoText)}"><i class="ap-icon-info" aria-hidden="true"></i></span>`
    : "";
  return `<button type="button" class="image-studio__ref image-studio__ref--pick${on ? " is-used" : " is-skipped"}" data-img-ref-toggle="${escapeHtml(r.id)}" aria-pressed="${on}"${lockedOff ? " disabled" : ""} title="${escapeHtml(stateTitle)}">
    <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
    <span class="image-studio__ref-scrim" aria-hidden="true"></span>
    <span class="image-studio__ref-box" aria-hidden="true">${on ? `<i class="ap-icon-check"></i>` : ""}</span>
    <span class="image-studio__ref-state">${on ? "Used" : "Skipped"}</span>
    ${infoBadge}
  </button>`;
}

function uploadRefTile(r) {
  return `<div class="image-studio__ref">
    <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
    <button type="button" class="image-studio__ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove reference"><i class="ap-icon-close" aria-hidden="true"></i></button>
  </div>`;
}

// A generate-panel section with a collapsible header (click to expand/collapse).
// `rightHtml` sits at the right of the header (count / Optional chip / format
// hint). When `disabled`, the section can't be expanded and shows `disabledHint`
// instead of its chevron — used to switch Visual style off while references
// drive the look.
function collapsibleGroup(st, { id, label, rightHtml = "", body, disabled = false, disabledHint = "" }) {
  const collapsed = disabled || st.collapsedGroups.has(id);
  const right =
    disabled && disabledHint
      ? `<span class="image-studio__group-note">${escapeHtml(disabledHint)}</span>`
      : `${rightHtml}<i class="ap-icon-chevron-down image-studio__group-chevron" aria-hidden="true"></i>`;
  return `<div class="image-studio__group is-collapsible${collapsed ? " is-collapsed" : ""}${disabled ? " is-disabled" : ""}">
    <button type="button" class="image-studio__group-head" data-img-group-toggle="${id}" aria-expanded="${!collapsed}"${disabled ? " disabled" : ""}>
      <span class="image-studio__group-label">${label}</span>
      <span class="image-studio__group-head-right">${right}</span>
    </button>
    <div class="image-studio__group-body"${collapsed ? " hidden" : ""}>${body}</div>
  </div>`;
}

// ── Ingredients (Generate) ───────────────────────────────────────────────────
// Frames the generation inputs as "ingredients": a Brand kit toggle (the
// Playbook's brand set, shown as use/skip tiles when on) + a Reference images
// card with a drop-zone for the user's own uploads.
function ingredientsSection(st) {
  const hasPlaybookRefs = Array.isArray(st.playbookRefs) && st.playbookRefs.length > 0;
  return `<div class="image-studio__group image-studio__group--ingredients">
    <p class="image-studio__group-label image-studio__group-label--eyebrow">Ingredients</p>
    <div class="image-studio__ingredients">
      ${hasPlaybookRefs ? brandKitCard(st) : ""}
      ${referenceImagesCard(st)}
    </div>
  </div>`;
}

function brandKitCard(st) {
  const brand = st.playbookName || "Playbook";
  const on = !!st.usePlaybookRefs;
  const usedIds = new Set(st.referenceImages.map((r) => r.id));
  const capReached = st.referenceImages.length >= imageStudio.MAX_REFS;
  const tiles = (st.playbookRefs || []).map((r) => playbookRefTile(r, usedIds.has(r.id), capReached)).join("");
  const body = on
    ? `<div class="image-studio__ingredient-body">
        <p class="image-studio__ref-help">Tap an image to use it, or tap again to skip.</p>
        <div class="image-studio__refs">${tiles}</div>
      </div>`
    : "";
  return `<div class="image-studio__ingredient${on ? " is-on" : ""}">
    <div class="image-studio__ingredient-head">
      <i class="ap-icon-star image-studio__ingredient-icon" aria-hidden="true"></i>
      <span class="image-studio__ingredient-title">Brand kit · ${escapeHtml(brand)}</span>
      <label class="ap-toggle-container image-studio__ingredient-toggle" title="Use your brand kit">
        <input type="checkbox" data-img-toggle-playbook-refs ${on ? "checked" : ""} aria-label="Use ${escapeHtml(brand)} brand kit" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    ${body}
  </div>`;
}

function referenceImagesCard(st) {
  const collapsed = st.collapsedGroups.has("refs");
  const uploads = st.referenceImages.filter((r) => !r.fromPlaybook);
  const uploadTiles = uploads.map(uploadRefTile).join("");
  return `<div class="image-studio__ingredient image-studio__ingredient--refs${collapsed ? " is-collapsed" : ""}">
    <button type="button" class="image-studio__ingredient-head" data-img-group-toggle="refs" aria-expanded="${!collapsed}">
      <i class="ap-icon-file--image image-studio__ingredient-icon" aria-hidden="true"></i>
      <span class="image-studio__ingredient-title">Reference images</span>
      <i class="ap-icon-chevron-down image-studio__group-chevron" aria-hidden="true"></i>
    </button>
    <div class="image-studio__ingredient-body"${collapsed ? " hidden" : ""}>
      ${dropzone(st)}
      ${uploadTiles ? `<div class="image-studio__refs">${uploadTiles}</div>` : ""}
      <p class="image-studio__ref-help">One image matches its style · two or more blend into a new look.</p>
    </div>
  </div>`;
}

function dropzone(st) {
  if (st.referenceImages.length >= imageStudio.MAX_REFS) {
    return `<div class="image-studio__dropzone is-full"><p class="image-studio__dropzone-sub">Maximum ${imageStudio.MAX_REFS} reference images reached.</p></div>`;
  }
  return `<div class="image-studio__dropzone" data-img-dropzone>
    <i class="ap-icon-file--image image-studio__dropzone-icon" aria-hidden="true"></i>
    <p class="image-studio__dropzone-title">Drop your reference images here</p>
    <p class="image-studio__dropzone-sub">PNG, JPG or WebP up to 10MB · 2–10 images</p>
    <button type="button" class="ap-button stroked grey" data-img-ref-add><i class="ap-icon-plus" aria-hidden="true"></i><span>Add images</span></button>
  </div>`;
}

function composeGroups(st) {
  // Format hint — the draft's network icon + "Best for <Network>" (or a plain
  // "Aspect ratio" label when no network is known).
  const netIcon = st.network ? NETWORK_ICON_BY_PLATFORM[st.network] : null;
  const fmtHint = st.network
    ? `${netIcon ? `<i class="${netIcon}" aria-hidden="true"></i>` : ""}Best for ${escapeHtml(NETWORK_LABEL[st.network] || st.network)}`
    : "Aspect ratio";
  const fmtChips = imageStudio
    .formatChoices(KEY)
    .map((f) => formatChip(f, st.formatId === f.id, "data-img-format"))
    .join("");
  // Output type (single image vs carousel) — only when the draft's network
  // supports carousels (LinkedIn / Instagram). The count group below adapts:
  // "Variations" (pick one) for single, "Slides" (all kept) for carousel.
  const carousel = imageStudio.supportsCarousel(st.network);
  const isCarousel = carousel && st.outputMode === "carousel";
  // Reference inputs are framed as "Ingredients": a Brand kit toggle (Playbook
  // brand set as use/skip tiles) + a Reference images card with a drop-zone.
  const hasUsedRefs = st.referenceImages.length > 0;
  const ingredients = ingredientsSection(st);
  // Visual style is mutually exclusive with reference images — when refs guide
  // the look, this section switches off and folds away.
  const styleGroup = collapsibleGroup(st, {
    id: "style",
    label: "Visual style",
    rightHtml: `<span class="image-studio__opt">Optional</span>`,
    body: `<div class="gen-style-grid">${styleCards(st)}</div>`,
    disabled: hasUsedRefs,
    disabledHint: "Guided by your reference images",
  });
  const moodGroup = collapsibleGroup(st, {
    id: "mood",
    label: "Mood",
    rightHtml: `<span class="image-studio__opt">Optional</span>`,
    body: `<div class="image-studio__chips">${moodChips(st)}</div>`,
  });
  const formatGroup = collapsibleGroup(st, {
    id: "format",
    label: "Format",
    rightHtml: `<span class="image-studio__count image-studio__count--net">${fmtHint}</span>`,
    body: `<div class="gen-format-chips">${fmtChips}</div>`,
  });
  // Output — merges the type toggle (single / carousel) with its count control
  // (Variations for a single image, Slides for a carousel) in one section.
  const outputChips = `<div class="image-studio__chips">
    <button type="button" class="ap-filter-chip" data-img-output="single" aria-pressed="${!isCarousel}"><i class="ap-icon-image" aria-hidden="true"></i>Single image</button>
    <button type="button" class="ap-filter-chip" data-img-output="carousel" aria-pressed="${isCarousel}"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Carousel</button>
  </div>`;
  const countChips = isCarousel
    ? `<div class="image-studio__chips">${imageStudio.SLIDE_CHOICES.filter(
        (n) => n <= imageStudio.carouselMaxFor(st.network),
      )
        .map(
          (n) =>
            `<button type="button" class="ap-filter-chip" data-img-slidecount="${n}" aria-pressed="${st.slideCount === n}">${n}</button>`,
        )
        .join("")}</div>`
    : `<div class="image-studio__chips">${imageStudio.VARIATION_CHOICES.map(
        (n) =>
          `<button type="button" class="ap-filter-chip" data-img-varcount="${n}" aria-pressed="${st.variationCount === n}">${n}</button>`,
      ).join("")}</div>`;
  const countLabel = isCarousel ? `Slides · up to ${imageStudio.carouselMaxFor(st.network)}` : "Variations";
  const outputGroup = collapsibleGroup(st, {
    id: "output",
    label: carousel ? "Output" : "Variations",
    rightHtml: carousel
      ? `<span class="image-studio__count">${NETWORK_LABEL[st.network] || st.network} supports carousels</span>`
      : "",
    body: carousel
      ? `${outputChips}<p class="image-studio__subgroup-label">${countLabel}</p>${countChips}`
      : countChips,
  });
  return `${ingredients}${styleGroup}${moodGroup}${formatGroup}${outputGroup}`;
}

function renderBody() {
  const st = state();
  if (!st || !body) return;
  body.innerHTML = renderStudio(st);
}

// ── Behavior helpers ──────────────────────────────────────────────────────

// Focus the contenteditable of the text overlay currently in edit mode, so the
// user types directly on the image. `selectAll` selects the whole placeholder
// ("Your text") so the first keystroke replaces it (used when adding); otherwise
// the caret sits at the end (used after a style click re-render). notify() is
// synchronous, so the node is already in the DOM when we call this.
function focusEditingText({ selectAll = false } = {}) {
  const st = state();
  if (!st?.editingOverlayId) return;
  const node = modal.querySelector(`[data-img-overlay="${st.editingOverlayId}"] [data-img-overlay-text]`);
  if (!node) return;
  node.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  if (!selectAll) range.collapse(false); // caret to end
  sel.removeAllRanges();
  sel.addRange(range);
}

// Safety net before baking: push the live contenteditable text into state, in
// case a click stole focus before the last `input` event fired.
function syncEditingText() {
  const st = state();
  if (!st?.editingOverlayId) return;
  const node = modal.querySelector(`[data-img-overlay="${st.editingOverlayId}"] [data-img-overlay-text]`);
  if (node) imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: node.textContent });
}

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

let fontSeq = 0;
const fontLabelFromName = (name) =>
  (name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Custom font";

// Upload a font file → register it via FontFace so both the live text and the
// canvas bake can use it, then select it on the current overlay.
function openFontPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ttf,.otf,.woff,.woff2,font/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const family = `studio-font-${++fontSeq}`;
    new FontFace(family, `url("${url}")`)
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        imageStudio.addCustomFont(KEY, { family, label: fontLabelFromName(file.name), url });
        imageStudio.setOpenPopover(KEY, null);
      })
      .catch(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
        showToast("Couldn't load that font file.");
      });
  });
  input.click();
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Commit the working image to the origin draft, then close.
function useImage() {
  syncEditingText(); // fold any in-flight inline text edit into state first
  const st = state();
  // Carousel: attach every (possibly per-slide-edited) slide as a multi-slide
  // post. Single image: the working image with any overlays flattened.
  if (st?.outputMode === "carousel") {
    const urls = imageStudio.commitCarousel(KEY);
    if (urls.length && currentSessionId && currentPostId) {
      attachCarouselToDraft(currentSessionId, currentPostId, urls);
      showToast(`Carousel added to your draft · ${urls.length} slides`);
    }
    close();
    return;
  }
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

// Bake the current carousel-slide edit (overlays flattened in) back into that
// slide, then return to the carousel results filmstrip (updateSlide flips the
// mode). "Use carousel" then ships the edited set.
function commitSlideEdit() {
  syncEditingText();
  const st = state();
  if (!st || st.selectedIndex == null || !st.currentImage) return;
  const idx = st.selectedIndex;
  const { w, h } = st.currentImage;
  const applySlide = (url) => imageStudio.updateSlide(KEY, idx, { url, w, h });
  if (st.overlays.length) {
    compositeOverlays(st.currentImage.url, st.overlays, w, h)
      .then(applySlide)
      .catch(() => applySlide(st.currentImage.url));
    return;
  }
  applySlide(st.currentImage.url);
}

// Apply an edit — a mocked reseed inside applyEdit (Reprompt syncs its note first).
function applyEditTool(tool) {
  if (tool === "prompt") {
    const ta = modal.querySelector("[data-img-edit-prompt]");
    if (ta) imageStudio.setEditPromptSilent(KEY, ta.value);
  }
  imageStudio.applyEdit(KEY, tool);
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
  // Preload every (weight, family) a text overlay uses so the bake doesn't fall
  // back to a system font before toDataURL. document.fonts.load never rejects.
  const fontSpecs = [
    ...new Set(
      overlays.filter((o) => o.kind === "text").map((o) => `${o.bold ? 700 : 400} 32px ${fontPrimary(o.fontFamily)}`),
    ),
  ];
  const fontsReady = document?.fonts
    ? Promise.all(fontSpecs.map((s) => document.fonts.load(s).catch(() => {})))
    : Promise.resolve();
  return Promise.all([fontsReady, loadImg(baseUrl), ...logoUrls.map(loadImg)]).then(([, base, ...logos]) => {
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
        const text = o.text || "";
        ctx.font = `${o.bold ? 700 : 400} ${fontPx}px ${cssFamily(o.fontFamily)}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Three passes, matching the live CSS: 1) drop shadow cast off the fill
        // glyph, 2) the coloured stroke, 3) the fill on top.
        if (o.shadow) {
          const sm = shadowMetrics(o.shadowIntensity);
          ctx.save();
          ctx.shadowColor = `rgba(0,0,0,${sm.alpha})`;
          ctx.shadowBlur = sm.blurEm * fontPx;
          ctx.shadowOffsetY = sm.offYEm * fontPx;
          ctx.fillStyle = o.color || "#FFFFFF";
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
        if (o.outline) {
          ctx.lineWidth = STROKE_K * fontPx;
          ctx.lineJoin = "round";
          ctx.strokeStyle = o.outlineColor || "#0A1B33";
          ctx.strokeText(text, 0, 0);
        }
        ctx.fillStyle = o.color || "#FFFFFF";
        ctx.fillText(text, 0, 0);
      }
      ctx.restore();
    }
    return out.toDataURL("image/png");
  });
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
  // Hide the text mini-toolbar while dragging so it doesn't trail the element.
  const layer = modal.querySelector("[data-img-overlay-layer]");
  if (layer) {
    layer.classList.add("is-gesturing");
    layer.appendChild(el); // bring the selected element to the front (DOM order)
    imageStudio.bringOverlayToFrontSilent(KEY, id); // keep state order in sync
  }

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
    if (layer) layer.classList.remove("is-gesturing");
    // Interacting with an element ends any inline text edit (of another element);
    // the re-render below drops its contenteditable.
    const cur = state();
    if (cur) cur.editingOverlayId = null;
    imageStudio.notifyOverlays(KEY);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// Draw / move / resize the freeform crop rectangle. Like startOverlayGesture but
// in fraction space on { xF, yF, wF, hF }: "move" translates the box, "resize"
// drags one corner from the opposite anchor, "draw" starts a fresh box from the
// pointerdown point. Honours the aspect lock; updates inline during the drag,
// persists (with a re-render) on pointer-up.
function startCropGesture(event, mode, corner) {
  event.preventDefault();
  const frame = modal.querySelector(".image-studio__frame");
  const boxEl = modal.querySelector("[data-img-croprect]");
  const st = state();
  if (!frame || !boxEl || !st || !st.cropRect) return;
  const rect = frame.getBoundingClientRect();
  const k = st.cropAspect ? st.cropAspect / (rect.width / rect.height) : null; // wF/hF lock
  const r0 = { ...st.cropRect };
  const fx = (cx) => clamp((cx - rect.left) / rect.width, 0, 1);
  const fy = (cy) => clamp((cy - rect.top) / rect.height, 0, 1);

  // Fixed corner for a resize; the pointerdown point for a fresh draw.
  let anchorX;
  let anchorY;
  if (mode === "resize") {
    anchorX = corner === "nw" || corner === "sw" ? r0.xF + r0.wF : r0.xF;
    anchorY = corner === "nw" || corner === "ne" ? r0.yF + r0.hF : r0.yF;
  } else if (mode === "draw") {
    anchorX = fx(event.clientX);
    anchorY = fy(event.clientY);
  }
  const startPx = event.clientX;
  const startPy = event.clientY;

  const paint = (next) => {
    imageStudio.setCropRectSilent(KEY, next);
    const c = state().cropRect;
    boxEl.style.left = `${c.xF * 100}%`;
    boxEl.style.top = `${c.yF * 100}%`;
    boxEl.style.width = `${c.wF * 100}%`;
    boxEl.style.height = `${c.hF * 100}%`;
  };

  const move = (e) => {
    if (mode === "move") {
      const dx = (e.clientX - startPx) / rect.width;
      const dy = (e.clientY - startPy) / rect.height;
      paint({
        xF: clamp(r0.xF + dx, 0, 1 - r0.wF),
        yF: clamp(r0.yF + dy, 0, 1 - r0.hF),
        wF: r0.wF,
        hF: r0.hF,
      });
      return;
    }
    // resize / draw — the corner opposite the anchor follows the pointer.
    const px = fx(e.clientX);
    const py = fy(e.clientY);
    let wF = Math.abs(px - anchorX);
    let hF = Math.abs(py - anchorY);
    if (k) {
      // Lock the aspect, driven by whichever axis the pointer moved farther on.
      if (wF >= hF * k) hF = wF / k;
      else wF = hF * k;
    }
    paint({
      xF: px >= anchorX ? anchorX : anchorX - wF,
      yF: py >= anchorY ? anchorY : anchorY - hF,
      wF,
      hF,
    });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    const cur = state();
    if (cur && cur.cropRect) imageStudio.setCropRect(KEY, cur.cropRect); // persist + re-render
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// Crop the working image to the selection rectangle — a genuine pixel crop via
// canvas (mirrors compositeOverlays), returning a PNG data URL + its dims.
function cropImage(baseUrl, r) {
  return loadImg(baseUrl).then((img) => {
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const sx = Math.round(r.xF * iw);
    const sy = Math.round(r.yF * ih);
    const sw = Math.max(1, Math.round(r.wF * iw));
    const sh = Math.max(1, Math.round(r.hF * ih));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return { url: out.toDataURL("image/png"), w: sw, h: sh };
  });
}

function applyCropSelection() {
  const st = state();
  if (!st || !st.currentImage || !st.cropRect || st.editBusy) return;
  const r = st.cropRect;
  imageStudio.beginCropApply(KEY);
  cropImage(st.currentImage.url, r)
    .then((res) => imageStudio.commitCrop(KEY, res))
    .catch(() => imageStudio.abortCropApply(KEY));
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
  const outBtn = event.target.closest("[data-img-output]");
  if (outBtn) return void imageStudio.setOutputMode(KEY, outBtn.dataset.imgOutput);
  const slideBtn = event.target.closest("[data-img-slidecount]");
  if (slideBtn) return void imageStudio.setSlideCount(KEY, Number(slideBtn.dataset.imgSlidecount));
  const grpToggle = event.target.closest("[data-img-group-toggle]");
  if (grpToggle && !grpToggle.disabled)
    return void imageStudio.toggleGroupCollapsed(KEY, grpToggle.dataset.imgGroupToggle);
  // Brand kit toggle is a DS switch (checkbox) — handled in onChange.
  if (event.target.closest("[data-img-ref-add]")) return void openFilePicker("ref");
  const refToggle = event.target.closest("[data-img-ref-toggle]");
  if (refToggle) return void imageStudio.toggleReferenceImage(KEY, refToggle.dataset.imgRefToggle);
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);
  if (event.target.closest("[data-img-derive]") && !st.promptLoading) return void imageStudio.runDerive(KEY);
  const modeBtn = event.target.closest("[data-img-mode]");
  if (modeBtn) return void imageStudio.setMode(KEY, modeBtn.dataset.imgMode);
  const viewBtn = event.target.closest("[data-img-view]");
  if (viewBtn) return void imageStudio.setCanvasView(KEY, viewBtn.dataset.imgView);
  // Generate + Regenerate share the same path: sync the prompt, then run.
  if (event.target.closest("[data-img-generate]") || event.target.closest("[data-img-regenerate]")) {
    const ta = modal.querySelector("[data-img-prompt]");
    if (ta) imageStudio.setPromptSilent(KEY, ta.value);
    if ((state()?.promptText || "").trim()) imageStudio.runGeneration(KEY);
    return;
  }
  if (event.target.closest("[data-img-add-variation]")) return void imageStudio.addVariation(KEY);
  // Remove a slide — checked before the tile-select since it's nested in the tile.
  const varRm = event.target.closest("[data-img-remove-variation]");
  if (varRm) return void imageStudio.removeVariation(KEY, Number(varRm.dataset.imgRemoveVariation));
  const varPick = event.target.closest("[data-img-variation]");
  if (varPick) return void imageStudio.selectVariation(KEY, Number(varPick.dataset.imgVariation));
  // ── Edit action bar + on-canvas manipulation ──
  // Action-bar / text-toolbar popover toggle (Crop, Add logo, text colour).
  const popToggle = event.target.closest("[data-img-popover-toggle]");
  if (popToggle) {
    const name = popToggle.dataset.imgPopoverToggle;
    return void imageStudio.setOpenPopover(KEY, st.openPopover === name ? null : name);
  }
  // A click outside any open popover (but not on its trigger) closes it; fall
  // through so the click still performs its normal action.
  if (st.openPopover && !event.target.closest("[data-img-popover]")) imageStudio.setOpenPopover(KEY, null);

  // Add text → drop an element that opens straight into inline edit; focus it so
  // typing replaces "Your text".
  if (event.target.closest("[data-img-add-text]")) {
    imageStudio.addOverlay(KEY, { kind: "text" });
    focusEditingText({ selectAll: true });
    return;
  }
  if (event.target.closest("[data-img-logo-upload]")) {
    imageStudio.setOpenPopover(KEY, null);
    return void openLogoPicker();
  }
  const preset = event.target.closest("[data-img-logo-preset]");
  if (preset) {
    imageStudio.setOpenPopover(KEY, null);
    return void imageStudio.addOverlay(KEY, { kind: "logo", url: preset.dataset.imgLogoPreset });
  }
  const ovDel = event.target.closest("[data-img-overlay-delete]");
  if (ovDel) return void imageStudio.removeOverlay(KEY, ovDel.dataset.imgOverlayDelete);
  // Text style controls (from the element's mini toolbar); keep the caret in the
  // contenteditable afterwards if we're editing.
  const restoreEdit = () => {
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  };
  const txtColor = event.target.closest("[data-img-text-color]");
  if (txtColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { color: txtColor.dataset.imgTextColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  const outColor = event.target.closest("[data-img-outline-color]");
  if (outColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outlineColor: outColor.dataset.imgOutlineColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  const fontPick = event.target.closest("[data-img-font]");
  if (fontPick && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { fontFamily: fontPick.dataset.imgFont || null });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  if (event.target.closest("[data-img-font-upload]")) return void openFontPicker();
  if (event.target.closest("[data-img-text-bold]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { bold: !o?.bold });
    restoreEdit();
    return;
  }
  // Crop tool → enter the draw-a-rectangle mode.
  if (event.target.closest("[data-img-crop-start]")) return void imageStudio.enterCropDraw(KEY);
  if (event.target.closest("[data-img-crop-cancel]")) return void imageStudio.cancelCropDraw(KEY);
  if (event.target.closest("[data-img-crop-apply]")) return void applyCropSelection();
  const cropAspect = event.target.closest("[data-img-crop-aspect]");
  if (cropAspect) {
    const id = cropAspect.dataset.imgCropAspect;
    const ratio = id === "free" ? null : imageStudio.formatChoices(KEY).find((f) => f.id === id)?.ratio || null;
    return void imageStudio.setCropAspect(KEY, ratio);
  }
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-apply-slide]")) return void commitSlideEdit();
  if (event.target.closest("[data-img-use]")) return void useImage();
  // Click on the image but not on an element → deselect + exit inline edit
  // (selectOverlay(null) also clears editingOverlayId).
  if (
    (st.selectedOverlayId || st.editingOverlayId) &&
    event.target.closest(".image-studio__frame") &&
    !event.target.closest("[data-img-overlay]")
  ) {
    return void imageStudio.selectOverlay(KEY, null);
  }
}

function onInput(event) {
  if (event.target.matches("[data-img-prompt]")) {
    imageStudio.setPromptSilent(KEY, event.target.value);
    const gen = modal.querySelector("[data-img-generate]");
    if (gen) gen.disabled = !event.target.value.trim();
  } else if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
  } else if (event.target.matches("[data-img-overlay-text]")) {
    // Inline text editing: sync the contenteditable to state WITHOUT re-render so
    // the caret / focus survive (the DOM node is the source of truth here).
    const st = state();
    if (st?.editingOverlayId)
      imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: event.target.textContent });
  } else if (event.target.matches("[data-img-text-colorpick]")) {
    // Live colour preview while dragging the picker (no re-render).
    const st = state();
    if (!st?.selectedOverlayId) return;
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { color: event.target.value });
    const node = modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.color = event.target.value;
  } else if (event.target.matches("[data-img-outline-colorpick]")) {
    // Live outline-colour preview (stroke colour only; width stays).
    const st = state();
    if (!st?.selectedOverlayId) return;
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { outlineColor: event.target.value });
    const node = modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.webkitTextStrokeColor = event.target.value;
  } else if (event.target.matches("[data-img-shadow-intensity]")) {
    // Live shadow-intensity preview (no re-render → the slider drag isn't lost).
    const st = state();
    if (!st?.selectedOverlayId) return;
    const v = Number(event.target.value);
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { shadowIntensity: v });
    const sm = shadowMetrics(v);
    const node = modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.textShadow = `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})`;
    event.target.style.setProperty("--fill", `${v}%`);
    const valEl = modal.querySelector("[data-img-shadow-val]");
    if (valEl) valEl.textContent = String(v);
  }
}

// The native colour picker commits on "change" — persist it as a swatch then.
function onChange(event) {
  const st = state();
  if (event.target.matches("[data-img-text-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "color");
    imageStudio.setOpenPopover(KEY, null);
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  } else if (event.target.matches("[data-img-outline-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "outlineColor");
    imageStudio.setOpenPopover(KEY, null);
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  } else if (event.target.matches("[data-img-outline-toggle]") && st?.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outline: event.target.checked });
  } else if (event.target.matches("[data-img-shadow-toggle]") && st?.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { shadow: event.target.checked });
  } else if (event.target.matches("[data-img-shadow-intensity]") && st?.selectedOverlayId) {
    // Slider release commits + re-renders (live preview happened in onInput).
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { shadowIntensity: Number(event.target.value) });
  } else if (event.target.matches("[data-img-toggle-playbook-refs]")) {
    // Brand kit switch (DS toggle checkbox).
    imageStudio.setUsePlaybookRefs(KEY, event.target.checked);
  }
}

// Drag-and-drop reference images onto the "Reference images" drop-zone.
function onDragOver(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (!dz) return;
  event.preventDefault();
  dz.classList.add("is-dragover");
}

function onDragLeave(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (dz && !dz.contains(event.relatedTarget)) dz.classList.remove("is-dragover");
}

function onDrop(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (!dz) return;
  event.preventDefault();
  dz.classList.remove("is-dragover");
  const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
  for (const f of files) imageStudio.addReferenceImage(KEY, URL.createObjectURL(f));
}

function onPointerDown(event) {
  const st0 = state();
  // Crop draw mode owns pointer gestures on the frame: a handle resizes, the box
  // moves, the dimmed area draws a fresh rectangle.
  if (st0?.cropDrawing) {
    if (st0.editBusy) return;
    const handle = event.target.closest("[data-img-crop-handle]");
    if (handle) return void startCropGesture(event, "resize", handle.dataset.imgCropHandle);
    if (event.target.closest("[data-img-croprect]")) return void startCropGesture(event, "move");
    if (event.target.closest("[data-img-crop-layer]")) return void startCropGesture(event, "draw");
    return;
  }
  if (event.target.closest("[data-img-overlay-delete]")) return; // click handles delete
  // Clicks on the element's mini toolbar / a popover are UI, not a drag.
  if (event.target.closest("[data-img-text-toolbar]") || event.target.closest("[data-img-popover]")) return;
  const overlayEl = event.target.closest("[data-img-overlay]");
  if (!overlayEl) return;
  // While a text element is being edited, let pointer events reach the
  // contenteditable (caret placement / selection) instead of starting a drag —
  // EXCEPT on the resize / rotate handles, which must stay grabbable so you can
  // resize straight after changing a style (font/colour/…) without first
  // clicking away to exit inline edit. A handle drag ends the edit on pointerup.
  const st = state();
  const onHandle = event.target.closest("[data-img-overlay-resize], [data-img-overlay-rotate]");
  if (st?.editingOverlayId === overlayEl.dataset.imgOverlay && !onHandle) return;
  startOverlayGesture(event, overlayEl);
}

// Double-click a text element to edit it inline (the keyboard equivalent is
// Enter on a focused overlay — see onKeydown).
function onDblClick(event) {
  const ov = event.target.closest("[data-img-overlay]");
  if (!ov) return;
  const o = imageStudio.getOverlay(KEY, ov.dataset.imgOverlay);
  if (o?.kind === "text" && !state()?.editBusy) {
    imageStudio.setEditingOverlay(KEY, ov.dataset.imgOverlay);
    focusEditingText({ selectAll: false });
  }
}

// Capture-phase keydown so popover / inline-edit Escape wins before the modal's
// document-level Escape-to-close, and Enter commits inline text (no newline).
function onKeydown(event) {
  const st = state();
  if (!st) return;
  if (event.key === "Enter" && st.editingOverlayId) {
    event.preventDefault();
    event.stopPropagation();
    syncEditingText();
    imageStudio.setEditingOverlay(KEY, null);
    return;
  }
  if (event.key === "Enter" && !st.editingOverlayId) {
    // Enter on a focused (selected, non-editing) text overlay enters edit mode.
    const ov = event.target.closest?.("[data-img-overlay]");
    const o = ov ? imageStudio.getOverlay(KEY, ov.dataset.imgOverlay) : null;
    if (o?.kind === "text" && !st.editBusy) {
      event.preventDefault();
      event.stopPropagation();
      imageStudio.setEditingOverlay(KEY, ov.dataset.imgOverlay);
      focusEditingText({ selectAll: true });
    }
    return;
  }
  if (event.key === "Escape") {
    if (st.openPopover) {
      event.stopPropagation();
      return void imageStudio.setOpenPopover(KEY, null);
    }
    if (st.cropDrawing && !st.editBusy) {
      event.stopPropagation();
      return void imageStudio.cancelCropDraw(KEY);
    }
    if (st.editingOverlayId) {
      event.stopPropagation();
      syncEditingText();
      return void imageStudio.setEditingOverlay(KEY, null);
    }
    // else: fall through to the modal's document-level Escape (close).
  }
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
  modal.addEventListener("change", onChange);
  modal.addEventListener("pointerdown", onPointerDown);
  modal.addEventListener("dblclick", onDblClick);
  modal.addEventListener("keydown", onKeydown, true); // capture (Escape/Enter order)
  modal.addEventListener("dragover", onDragOver);
  modal.addEventListener("dragleave", onDragLeave);
  modal.addEventListener("drop", onDrop);
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
  // editImageUrl (post card hover → "Edit") opens straight into Edit mode on the
  // draft's existing image; carouselUrls reopens an existing carousel in the
  // results view (add / remove / regenerate slides). Otherwise the generate flow.
  const editImageUrl = opts.editImageUrl || null;
  const carouselUrls = Array.isArray(opts.carouselUrls) && opts.carouselUrls.length > 1 ? opts.carouselUrls : null;
  // Pull the session's Playbook brand reference images so generation stays
  // on-brand — the user can add their own or toggle the Playbook set off.
  const session = currentSessionId ? getSessionById(currentSessionId) : null;
  const ctx = session?.contextId ? getContextById(session.contextId) : null;
  imageStudio.start(KEY, {
    postId: currentPostId,
    network: post?.network || null,
    formatId: post?.format || null,
    editImage: editImageUrl ? { url: editImageUrl } : null,
    carousel: carouselUrls ? { urls: carouselUrls } : null,
    playbookRefs: ctx?.referenceImages || [],
    playbookName: ctx?.brandName || ctx?.name || "",
    playbookColors: (Array.isArray(ctx?.brandColors) ? ctx.brandColors : []).map((c) => c && c.hex).filter(Boolean),
  });
  if (unsub) unsub();
  unsub = imageStudio.subscribe(KEY, renderBody);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();
  if (editImageUrl) {
    // Refine the working-image dims from the real image so the frame ratio and
    // the overlay bake match it (start() used a format-based guess).
    loadImg(editImageUrl)
      .then((img) => imageStudio.setEditImageDims(KEY, img.naturalWidth, img.naturalHeight))
      .catch(() => {});
  } else if (currentPostId && !carouselUrls) {
    imageStudio.runDerive(KEY);
  }
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
