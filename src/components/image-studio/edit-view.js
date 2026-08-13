// Image Studio — edit-mode render. The floating action bar (AI reprompt + manual
// tools), the crop-draw toolbar + rectangle, the logo/text popovers, and the
// draggable overlay layer (logos + on-canvas text with its mini style toolbar).
// `actionBar` and `editCanvas` are the two entry points the shell composes; the
// rest are their private building blocks.

import { escapeHtml } from "../../utils.js?v=21";
import { FORMATS, NETWORK_FORMATS } from "../../clip-formats.js?v=43";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=63";
import { KEY } from "./context.js?v=68";
import { outlineMetrics, shadowMetrics, cssFamily } from "./canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=94";

// Edit mode — the floating AI reprompt bar over the canvas bottom: a single-row
// composer card — the mermaid-sparkle cue (= generative AI), a borderless
// multi-line textarea like the main conversational composer, and a compact
// orange icon button (the send-style Apply) — describe a change and I redraw the
// image. The manual hand-tools live in the left palette (toolPalette). During
// crop the AI bar hides so the crop toolbar (attached below the crop box) has
// clear space beneath the image.
export function actionBar(st) {
  if (st.cropDrawing) return "";
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="image-studio__actionbar" role="toolbar" aria-label="AI edit">
    <i class="ap-icon-sparkles-mermaid image-studio__ai-icon" aria-hidden="true"></i>
    <textarea class="image-studio__reprompt-field" data-img-edit-prompt rows="1" placeholder="Describe a change and I'll redraw it…" aria-label="Describe a change for AI to apply" ${busy}>${escapeHtml(st.editPrompt || "")}</textarea>
    <button type="button" class="ap-button primary orange image-studio__actionbar-apply" data-img-apply-edit="prompt" aria-label="Apply" title="Apply" ${busy}><i class="ap-icon-arrow-up" aria-hidden="true"></i></button>
  </div>`;
}

// Manual edit tools as a labelled palette floating at the canvas top-left (a
// Figma/Canva-style rail). Crop enters draw mode (its options float below the
// crop box, see cropToolbar); Add text drops an overlay directly; Add image
// opens the image popover (flyout to the right of the rail). Hooks are unchanged
// — event delegation keys off the data-* attributes.
export function toolPalette(st) {
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="image-studio__palette" role="toolbar" aria-label="Edit tools">
    <button type="button" class="ap-button ghost grey" data-img-crop-start aria-pressed="${st.cropDrawing}" ${busy}><i class="ap-icon-cropper" aria-hidden="true"></i><span>Crop</span></button>
    <button type="button" class="ap-button ghost grey" data-img-add-text ${busy}><i class="ap-icon-closed-captions" aria-hidden="true"></i><span>Add text</span></button>
    <div class="image-studio__palette-anchor">
      <button type="button" class="ap-button ghost grey" data-img-popover-toggle="logo" aria-haspopup="true" aria-expanded="${st.openPopover === "logo"}" ${busy}><i class="ap-icon-file--image" aria-hidden="true"></i><span>Add image</span></button>
      ${st.openPopover === "logo" ? logoPopover() : ""}
    </div>
  </div>`;
}

// Crop options as a floating toolbar attached just below the crop rectangle (the
// same on-canvas pattern as the text element's mini toolbar). Holds the
// aspect-lock chips ("Best for <Network>" + Freeform + presets, non-optimal
// disabled) + Cancel / Apply crop. Rendered by renderCropRect as a frame child
// (outside the crop-layer so it isn't clipped and can't start a drag) and
// positioned from the crop-rect fractions; it hides while a crop gesture runs.
function cropToolbar(st) {
  const busy = st.editBusy ? "disabled" : "";
  const r = st.cropRect || { xF: 0.15, yF: 0.15, wF: 0.7, hF: 0.7 };
  const style = `left:${(r.xF + r.wF / 2) * 100}%; top:${(r.yF + r.hF) * 100}%;`;
  const net = st.network || null;
  const netLabel = escapeHtml(NETWORK_LABEL[net] || net || "");
  const bestFor =
    net && NETWORK_FORMATS[net]
      ? `<span class="image-studio__crop-bestfor" aria-label="Best for ${netLabel}">Best for <i class="${NETWORK_ICON_BY_PLATFORM[net] || ""}" title="${netLabel}" aria-hidden="true"></i></span>`
      : "";
  // One horizontal bar like the text mini toolbar: the "Best for" hint, the
  // borderless aspect options (divider-separated, no pills), then the compact
  // validation icon buttons (✕ / ✓).
  const sep = `<span class="image-studio__crop-sep" aria-hidden="true"></span>`;
  return `<div class="image-studio__crop-toolbar" data-img-crop-toolbar style="${style}" role="toolbar" aria-label="Crop">
    ${bestFor ? `${bestFor}${sep}` : ""}
    <div class="image-studio__crop-aspects">${cropAspectChips(st)}</div>
    ${sep}
    <div class="image-studio__crop-actions">
      <button type="button" class="ap-icon-button" data-img-crop-cancel title="Cancel" aria-label="Cancel" ${busy}><i class="ap-icon-close" aria-hidden="true"></i></button>
      <button type="button" class="ap-icon-button image-studio__crop-apply" data-img-crop-apply title="Apply crop" aria-label="Apply crop" ${busy}><i class="ap-icon-check" aria-hidden="true"></i></button>
    </div>
  </div>`;
}

// Freeform + the ratio presets, as a single chip group that locks the crop box's
// aspect (Freeform = unconstrained, the default). Each chip carries a small glyph
// drawn to its own proportions (Freeform = a dashed square) so the ratio reads at
// a glance — more legible than a bare label. When the draft targets a network, a
// "Best for <Network>" hint leads the row and only that network's optimised
// ratios are shown — Freeform stays available for an arbitrary crop.
function cropAspectChips(st) {
  const net = st.network || null;
  const optimalIds = net ? NETWORK_FORMATS[net] || null : null;
  const chip = (id, label, ratio, on) =>
    `<button type="button" class="image-studio__crop-aspect${ratio ? "" : " image-studio__crop-aspect--free"}${on ? " is-selected" : ""}" data-img-crop-aspect="${escapeHtml(id)}" aria-pressed="${on}"><span class="image-studio__crop-aspect-glyph"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`;
  const freeform = chip("free", "Freeform", null, !st.cropAspect);
  // Only the network's optimised ratios (all of them when no network); the rest
  // are hidden outright rather than shown disabled.
  const presets = Object.values(FORMATS)
    .filter((f) => !optimalIds || optimalIds.includes(f.id))
    .map((f) => {
      const on = !!st.cropAspect && Math.abs(st.cropAspect - f.ratio) < 0.001;
      return chip(f.id, f.tag, f.ratio, on);
    });
  // Divider-separated (like the text toolbar), not free-floating pills.
  return [freeform, ...presets].join(`<span class="image-studio__crop-sep" aria-hidden="true"></span>`);
}

function logoPopover() {
  // Upload is a distinct full-width action at the top (not a tile in the grid).
  const upload = `<button type="button" class="ap-button stroked grey image-studio__logo-upload" data-img-logo-upload><i class="ap-icon-upload" aria-hidden="true"></i><span>Upload an image</span></button>`;
  const presets = imageStudio.IMAGE_PRESETS.map(
    (p) =>
      `<button type="button" class="image-studio__preset" data-img-logo-preset="${escapeHtml(p.url)}" title="${escapeHtml(p.label)}"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.label)}" loading="lazy" /></button>`,
  ).join("");
  return `<div class="image-studio__popover image-studio__popover--logo" data-img-popover role="menu" aria-label="Images">
    <div class="image-studio__popover-head"><p class="image-studio__popover-title">Images</p></div>
    <div class="image-studio__popover-body">
      ${upload}
      <div class="image-studio__presets">${presets}</div>
    </div>
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
  const brand = dedupe((st.playbookColors || []).map((c) => c.hex)); // brand first → wins the dedupe
  const others = dedupe([...imageStudio.TEXT_COLORS, ...(st.customTextColors || [])]);
  const addSwatch = `<label class="image-studio__swatch image-studio__swatch--add" title="${pickLabel}"><input type="color" ${pickAttr} aria-label="${pickLabel}" /><i class="ap-icon-plus" aria-hidden="true"></i></label>`;
  // Name the brand in parentheses (e.g. "Brand (Acme)") — matches how the
  // Ingredients panel labels the brand kit.
  const brandName = (st.playbookName || "").trim();
  const brandLabel = brandName ? `Brand (${escapeHtml(brandName)})` : "Brand";
  const brandGroup = brand.length
    ? `<div class="image-studio__color-group">
        <p class="image-studio__color-label">${brandLabel}</p>
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

// Outline popover — on/off switch + a thickness slider (0–100) + a colour grid
// for the stroke colour. The body dims (and controls disable) while outline is off.
function textOutlinePopover(o, st) {
  const on = !!o.outline;
  const w = o.outlineWidth ?? 50;
  return `<div class="image-studio__popover image-studio__popover--textcolor image-studio__popover--outline${on ? "" : " is-off"}" data-img-popover role="menu" aria-label="Outline">
    <div class="image-studio__popover-head">
      <p class="image-studio__popover-title">Outline</p>
      ${fxToggle("data-img-outline-toggle", on, "Toggle outline")}
    </div>
    <div class="image-studio__popover-body">
      <div class="image-studio__slider-row">
        <input type="range" class="ap-slider" min="0" max="100" step="1" value="${w}" data-img-outline-width aria-label="Outline thickness" style="--fill:${w}%" ${on ? "" : "disabled"} />
        <span class="image-studio__slider-val" data-img-outline-val>${w}</span>
      </div>
      ${swatchGrid({ st, selected: o.outlineColor, applyAttr: "data-img-outline-color", pickAttr: "data-img-outline-colorpick", pickLabel: "Add outline colour" })}
    </div>
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
  const crop = st.cropDrawing && !st.editBusy ? renderCropRect(st) : "";
  return `<div class="image-studio__frame" style="--imgs-ratio:${ratio}">
      <div class="image-studio__frame-clip"><img class="image-studio__frame-img" src="${img ? img.url : ""}" alt="Working image" /></div>
      ${overlayLayer(st)}${crop}${busy}${badge}
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
    </div>${cropToolbar(st)}`;
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
    <button type="button" class="image-studio__tt-btn image-studio__tt-italic" data-img-text-italic aria-pressed="${!!o.italic}">Italic</button>
    <span class="image-studio__tt-sep" aria-hidden="true"></span>
    <button type="button" class="image-studio__tt-btn image-studio__tt-outline${o.outline ? " is-on" : ""}" data-img-popover-toggle="textOutline" aria-haspopup="true" aria-expanded="${outlineOpen}" title="Outline"><span class="image-studio__tt-swatch" style="--sw:${escapeHtml(o.outlineColor || "#0A1B33")}"></span><span>Outline</span></button>
    ${outlineOpen ? textOutlinePopover(o, st) : ""}
    <button type="button" class="image-studio__tt-btn image-studio__tt-shadow${o.shadow ? " is-on" : ""}" data-img-popover-toggle="textShadow" aria-haspopup="true" aria-expanded="${shadowOpen}" title="Shadow"><span class="image-studio__tt-shadowdot" aria-hidden="true"></span><span>Shadow</span></button>
    ${shadowOpen ? textShadowPopover(o) : ""}
    <span class="image-studio__tt-sep" aria-hidden="true"></span>
    <button type="button" class="ap-icon-button image-studio__tt-del" data-img-overlay-delete="${o.id}" aria-label="Delete text"><i class="ap-icon-trash" aria-hidden="true"></i></button>
  </div>`;
}

function renderOverlay(o, selected, editing, st) {
  const base = `left:${o.xF * 100}%; top:${o.yF * 100}%; transform:translate(-50%,-50%) rotate(${o.rot || 0}rad);`;
  const style = o.kind === "logo" ? `${base} width:${o.wF * 100}%;` : base;
  // A rotated element gets a small "reset rotation" button beside the rotate
  // handle; it disappears once the element is back to 0.
  const rotateReset =
    Math.abs(o.rot || 0) > 0.001
      ? `<button type="button" class="image-studio__overlay-rotate-reset" data-img-overlay-rotate-reset="${o.id}" title="Reset rotation" aria-label="Reset rotation"><i class="ap-icon-reset" aria-hidden="true"></i></button>`
      : "";
  let inner;
  let chrome;
  if (o.kind === "logo") {
    inner = `<img src="${escapeHtml(o.url)}" alt="" draggable="false" />`;
    // Logos keep the corner ×, rotate and resize handles.
    chrome = `<button type="button" class="image-studio__overlay-delete" data-img-overlay-delete="${o.id}" aria-label="Delete element"><i class="ap-icon-close" aria-hidden="true"></i></button>
      <span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>${rotateReset}
      <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  } else {
    const sm = shadowMetrics(o.shadowIntensity);
    const om = outlineMetrics(o.outlineWidth);
    const textStyle =
      `color:${escapeHtml(o.color || "#FFFFFF")}; font-family:${cssFamily(o.fontFamily)};` +
      ` font-size:${o.sizeF * 100}cqh; font-weight:${o.bold ? 700 : 400}; font-style:${o.italic ? "italic" : "normal"};` +
      // paint-order:stroke → the fill paints over the stroke, so only the stroke's
      // outer half shows — an external outline that never bites into the glyph.
      (o.outline
        ? ` -webkit-text-stroke:${om.emStroke}em ${escapeHtml(o.outlineColor || "#0A1B33")}; paint-order:stroke;`
        : "") +
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
      <span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>${rotateReset}
      <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  }
  const cls = `image-studio__overlay${o.kind === "text" ? " is-text" : ""}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
  return `<div class="${cls}" data-img-overlay="${o.id}" tabindex="0" role="button" aria-label="${o.kind === "text" ? "Text element" : "Logo element"}" style="${style}">${inner}${chrome}</div>`;
}
