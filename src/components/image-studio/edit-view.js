// Image Studio — edit-mode render. The floating action bar (AI reprompt + manual
// tools), the crop-draw toolbar + rectangle, the logo/text popovers, and the
// draggable overlay layer (logos + on-canvas text with its mini style toolbar).
// `actionBar` and `editCanvas` are the two entry points the shell composes; the
// rest are their private building blocks.

import { escapeHtml } from "../../utils.js?v=21";
import { FORMATS, NETWORK_FORMATS } from "../../clip-formats.js?v=5";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=26";
import { KEY } from "./context.js?v=1";
import { STROKE_K, shadowMetrics, cssFamily } from "./canvas.js?v=1";
import * as imageStudio from "../../image-studio.js?v=27";

// Edit mode — the floating action bar over the canvas bottom. Two clearly
// separated zones so the AI path and the manual path don't blur together:
//   1. AI zone — a filled prompt field (mermaid-sparkle cue = generative AI)
//      with the orange Apply CTA; describe a change and I redraw the image.
//   2. Manual zone — Crop / Add text / Add logo, precise hand tools, split off
//      below an "or edit by hand" divider so they read as the alternative.
// Crop drops straight into a draw-a-rectangle mode (see cropConfirmBar); Add logo
// opens a small popover; text is added and edited directly on the canvas (see
// renderOverlay). Inspired by the bottom tool bar of Krea AI / DALL·E.
export function actionBar(st) {
  // Crop draw mode takes over the whole bar with its own confirm controls.
  if (st.cropDrawing) return cropConfirmBar(st);
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="image-studio__actionbar" role="toolbar" aria-label="Edit tools">
    <div class="image-studio__actionbar-ai">
      <div class="ap-input-group">
        <i class="ap-icon-sparkles-mermaid image-studio__ai-icon" aria-hidden="true"></i>
        <input type="text" data-img-edit-prompt placeholder="Describe a change and I'll redraw it…" aria-label="Describe a change for AI to apply" value="${escapeHtml(st.editPrompt || "")}" ${busy} />
      </div>
      <button type="button" class="ap-button primary orange image-studio__actionbar-apply" data-img-apply-edit="prompt" ${busy}><i class="ap-icon-archie-official" aria-hidden="true"></i><span>Apply</span></button>
    </div>
    <div class="image-studio__actionbar-or" aria-hidden="true"><span>or edit by hand</span></div>
    <div class="image-studio__actionbar-row image-studio__actionbar-tools">
      <button type="button" class="ap-button stroked grey" data-img-crop-start ${busy}><i class="ap-icon-cropper" aria-hidden="true"></i><span>Crop</span></button>
      <button type="button" class="ap-button stroked grey" data-img-add-text ${busy}><i class="ap-icon-closed-captions" aria-hidden="true"></i><span>Add text</span></button>
      <div class="image-studio__actionbar-anchor">
        <button type="button" class="ap-button stroked grey" data-img-popover-toggle="logo" aria-haspopup="true" aria-expanded="${st.openPopover === "logo"}" ${busy}><i class="ap-icon-file--image" aria-hidden="true"></i><span>Add logo</span></button>
        ${st.openPopover === "logo" ? logoPopover() : ""}
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
// a glance — more legible than a bare label. When the draft targets a network,
// a "Best for <Network>" hint leads the row and the ratios that network isn't
// optimised for are disabled — Freeform stays available for an arbitrary crop.
function cropAspectChips(st) {
  const net = st.network || null;
  const optimalIds = net ? NETWORK_FORMATS[net] || null : null;
  const chip = (id, label, ratio, on, disabled) =>
    `<button type="button" class="image-studio__crop-aspect${ratio ? "" : " image-studio__crop-aspect--free"}${on ? " is-selected" : ""}${disabled ? " is-disabled" : ""}" data-img-crop-aspect="${escapeHtml(id)}" aria-pressed="${on}"${disabled ? " disabled" : ""}><span class="image-studio__crop-aspect-glyph"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`;
  const freeform = chip("free", "Freeform", null, !st.cropAspect, false);
  const presets = Object.values(FORMATS)
    .map((f) => {
      const on = !!st.cropAspect && Math.abs(st.cropAspect - f.ratio) < 0.001;
      const disabled = !!optimalIds && !optimalIds.includes(f.id);
      return chip(f.id, f.tag, f.ratio, on, disabled);
    })
    .join("");
  const bestFor = optimalIds
    ? `<span class="image-studio__crop-bestfor"><i class="${NETWORK_ICON_BY_PLATFORM[net] || ""}" aria-hidden="true"></i>Best for ${escapeHtml(NETWORK_LABEL[net] || net)}</span>`
    : "";
  return `${bestFor}${freeform}${presets}`;
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
    ? `<div class="image-studio__color-group">
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
  return `<div class="image-studio__popover image-studio__popover--textcolor" data-img-popover role="menu" aria-label="Text colour">
    <div class="image-studio__popover-head"><p class="image-studio__popover-title">Colour</p></div>
    <div class="image-studio__popover-body">${swatchGrid({
      st,
      selected: o.color,
      applyAttr: "data-img-text-color",
      pickAttr: "data-img-text-colorpick",
      pickLabel: "Add text colour",
    })}</div>
  </div>`;
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
      <p class="image-studio__popover-title">Outline</p>
      ${fxToggle("data-img-outline-toggle", on, "Toggle outline")}
    </div>
    <div class="image-studio__popover-body">${swatchGrid({ st, selected: o.outlineColor, applyAttr: "data-img-outline-color", pickAttr: "data-img-outline-colorpick", pickLabel: "Add outline colour" })}</div>
  </div>`;
}

// Shadow popover — on/off switch + an intensity slider (0–100). The slider dims
// (and disables) while shadow is off.
function textShadowPopover(o) {
  const on = !!o.shadow;
  const val = o.shadowIntensity ?? 55;
  return `<div class="image-studio__popover image-studio__popover--shadow${on ? "" : " is-off"}" data-img-popover role="menu" aria-label="Shadow">
    <div class="image-studio__popover-head">
      <p class="image-studio__popover-title">Shadow</p>
      ${fxToggle("data-img-shadow-toggle", on, "Toggle shadow")}
    </div>
    <div class="image-studio__popover-body">
      <div class="image-studio__slider-row">
        <input type="range" class="ap-slider" min="0" max="100" step="1" value="${val}" data-img-shadow-intensity aria-label="Shadow intensity" style="--fill:${val}%" ${on ? "" : "disabled"} />
        <span class="image-studio__slider-val" data-img-shadow-val>${val}</span>
      </div>
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
    <div class="image-studio__popover-head"><p class="image-studio__popover-title">Font</p></div>
    <div class="image-studio__popover-body">
      <div class="image-studio__font-list">${builtins}${custom}</div>
      <div class="image-studio__font-div" aria-hidden="true"></div>
      <button type="button" class="ap-button stroked grey image-studio__font-import" data-img-font-upload><i class="ap-icon-upload" aria-hidden="true"></i><span>Import my font…</span></button>
    </div>
  </div>`;
}

// Direct editor: the working image clipped inside .image-studio__frame-clip while
// the frame itself is overflow:visible, so the on-element toolbars / popovers /
// handles can extend past the image edge without being cut off.
export function editCanvas(st) {
  const img = st.currentImage;
  const ratio = img ? img.w / img.h : imageStudio.activeRatio(KEY);
  const busy = st.editBusy
    ? `<div class="image-studio__busy"><span class="gen-image-spinner"></span><span>Applying…</span></div>`
    : "";
  const badge =
    st.outputMode === "carousel"
      ? `<span class="image-studio__badge image-studio__badge--slide"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Editing slide ${(st.selectedIndex ?? 0) + 1} / ${st.variations.length}</span>`
      : "";
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
// swatch popover), font, Bold, Outline, Shadow, Delete. Size is changed with the
// corner handle (drag), so the toolbar carries only the labelled style controls.
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
