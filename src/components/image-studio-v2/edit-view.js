// Image Studio v2 — the edit canvas.
//
// Everything that MUST live on the canvas, and nothing that doesn't: the working
// image, the draggable overlay layer, the crop rectangle with its handles, and
// the mini toolbar that follows a selected text element.
//
// These pieces DELIBERATELY REUSE v1's classes (`.image-studio__overlay*`,
// `__text-toolbar`, `__tt-*`, `__popover*`, `__swatch*`, `__font-*`,
// `__slider-*`, `__crop-*`) and therefore v1's stylesheet, which is already
// loaded. v2 rewrote them once and it was a mistake: the on-canvas text
// toolbar, its colour / font / outline / shadow popovers and the overlay handles
// were never what was wrong with v1 — the rail + footer + floating-bar
// ARRANGEMENT was. Sharing them keeps the two studios pixel-identical here and
// means there is one place to fix a text-overlay bug, not two.
//
// Only what v2 genuinely re-arranges carries an `.isv2-` class: the frame (it
// has its own sizing) and the crop confirm pair (its ratio options moved to the
// tool palette, so only ✕ / ✓ stay on the canvas).

import { escapeHtml } from "../../utils.js?v=21";
import { FORMATS, NETWORK_FORMATS } from "../../clip-formats.js?v=29";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=49";
import { KEY } from "./context.js?v=44";
import { outlineMetrics, shadowMetrics, cssFamily } from "../image-studio/canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=80";

// The working image is clipped inside .isv2-frame-clip while the frame itself is
// overflow:visible, so on-element toolbars / popovers / handles can extend past
// the image edge without being cut off.
export function editCanvas(st) {
  const img = st.currentImage;
  const ratio = img ? img.w / img.h : imageStudio.activeRatio(KEY);
  const busy = st.editBusy
    ? `<div class="isv2-busy"><span class="gen-image-spinner"></span><span>Applying…</span></div>`
    : "";
  const badge =
    st.outputMode === "carousel"
      ? `<span class="isv2-slide-badge"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Editing slide ${(st.selectedIndex ?? 0) + 1} / ${st.variations.length}</span>`
      : "";
  const crop = st.cropDrawing && !st.editBusy ? cropRect(st) : "";
  return `<div class="isv2-frame isv2-frame--edit" style="--isv2-ratio:${ratio}">
    <div class="isv2-frame-clip"><img class="isv2-frame-img" src="${img ? escapeHtml(img.url) : ""}" alt="Working image" /></div>
    ${overlayLayer(st)}${crop}${busy}${badge}
  </div>`;
}

// ── Crop ────────────────────────────────────────────────────────────────────

// The rectangle drawn over the working image. Its own overflow:hidden layer
// clips the box-shadow dim-mask to the image bounds (the frame is
// overflow:visible in edit mode). Corner handles resize it; the body drags it;
// pointerdown on the dimmed area draws a fresh rect.
function cropRect(st) {
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

// Crop options as a floating toolbar attached just below the crop rectangle —
// main's arrangement, main's classes, verbatim. It holds the "Best for" hint, the
// divider-separated aspect options and the ✕ / ✓ pair in ONE bar, at the contact
// point of the gesture.
//
// v2 had split this: the ratios into a tool-palette sheet, the ✕ / ✓ into their
// own little pill. That put the ratio you were choosing a canvas-width away from
// the box it reshapes, which is the one place it must not be.
//
// Rendered as a frame child (outside the crop layer) so it isn't clipped and
// can't start a drag; it hides while a crop gesture runs.
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

// Freeform + the network's optimised ratios as one divider-separated group, each
// with a glyph drawn to its own proportions so the shape reads at a glance.
// Freeform is the default and stays available for an arbitrary crop.
function cropAspectChips(st) {
  const net = st.network || null;
  const optimalIds = net ? NETWORK_FORMATS[net] || null : null;
  const chip = (id, label, ratio, on) =>
    `<button type="button" class="image-studio__crop-aspect${ratio ? "" : " image-studio__crop-aspect--free"}${on ? " is-selected" : ""}" data-img-crop-aspect="${escapeHtml(id)}" aria-pressed="${on}"><span class="image-studio__crop-aspect-glyph"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`;
  const freeform = chip("free", "Freeform", null, !st.cropAspect);
  const presets = Object.values(FORMATS)
    .filter((f) => !optimalIds || optimalIds.includes(f.id))
    .map((f) => chip(f.id, f.tag, f.ratio, !!st.cropAspect && Math.abs(st.cropAspect - f.ratio) < 0.001));
  return [freeform, ...presets].join(`<span class="image-studio__crop-sep" aria-hidden="true"></span>`);
}

// ── Overlay layer ───────────────────────────────────────────────────────────

function overlayLayer(st) {
  if (!st.overlays.length) return "";
  // Selected → un-clip so a bleeding element + its chrome stay grabbable; idle →
  // clip to the image (matches the flattened result).
  const cls = `image-studio__overlay-layer${st.selectedOverlayId ? " has-selection" : ""}`;
  return `<div class="${cls}" data-img-overlay-layer>${st.overlays
    .map((o) => renderOverlay(o, o.id === st.selectedOverlayId, o.id === st.editingOverlayId, st))
    .join("")}</div>`;
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
  const handles = `<span class="image-studio__overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>${rotateReset}
    <span class="image-studio__overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  let inner;
  let chrome;
  if (o.kind === "logo") {
    inner = `<img src="${escapeHtml(o.url)}" alt="" draggable="false" />`;
    chrome = `<button type="button" class="image-studio__overlay-delete" data-img-overlay-delete="${o.id}" aria-label="Delete element"><i class="ap-icon-close" aria-hidden="true"></i></button>${handles}`;
  } else {
    const sm = shadowMetrics(o.shadowIntensity);
    const om = outlineMetrics(o.outlineWidth);
    const textStyle =
      `color:${escapeHtml(o.color || "#FFFFFF")}; font-family:${cssFamily(o.fontFamily)};` +
      ` font-size:${o.sizeF * 100}cqh; font-weight:${o.bold ? 700 : 400}; font-style:${o.italic ? "italic" : "normal"};` +
      // paint-order:stroke → the fill paints over the stroke, so only the
      // stroke's outer half shows — an external outline that never bites into
      // the glyph.
      (o.outline
        ? ` -webkit-text-stroke:${om.emStroke}em ${escapeHtml(o.outlineColor || "#0A1B33")}; paint-order:stroke;`
        : "") +
      (o.shadow ? ` text-shadow:0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha});` : "");
    // Editing = contenteditable + focusable; otherwise inert so pointerdown
    // falls through to the draggable overlay div.
    const editAttrs = editing
      ? ` contenteditable="true" role="textbox" aria-multiline="false" aria-label="Text element" spellcheck="false"`
      : "";
    inner = `<span class="image-studio__overlay-text" data-img-overlay-text${editAttrs} style="${textStyle}">${escapeHtml(o.text || "")}</span>`;
    // Text elements: the mini toolbar carries the style controls + delete; size
    // is changed with the corner handle.
    chrome = `${textToolbar(o, st, selected)}${handles}`;
  }
  const cls = `image-studio__overlay${o.kind === "text" ? " is-text" : ""}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
  return `<div class="${cls}" data-img-overlay="${o.id}" tabindex="0" role="button" aria-label="${o.kind === "text" ? "Text element" : "Logo element"}" style="${style}">${inner}${chrome}</div>`;
}

// ── Text mini toolbar (must follow the element — stays on canvas) ────────────

// Shown via .is-selected CSS, so it appears the moment the element is selected
// — no re-render needed.
function textToolbar(o, st, selected) {
  const open = (name) => selected && st.openPopover === name;
  const colorOpen = open("textColor");
  const fontOpen = open("textFont");
  const outlineOpen = open("textOutline");
  const shadowOpen = open("textShadow");
  const fontLabel = o.fontFamily
    ? (st.customFonts || []).find((f) => f.family === o.fontFamily)?.label || o.fontFamily
    : "Default";
  // Each trigger sits in its own `.isv2-tt-anchor`, which is what lets its
  // popover be centred on the BUTTON. Without the anchor, `left: 0` resolves
  // against the nearest positioned ancestor — the whole text overlay — so the
  // panel opened wherever the element happened to start rather than under the
  // control you just pressed.
  const sep = `<span class="image-studio__tt-sep" aria-hidden="true"></span>`;
  const anchored = (btn, pop) => `<span class="isv2-tt-anchor">${btn}${pop}</span>`;
  return `<div class="image-studio__text-toolbar" data-img-text-toolbar>
    ${anchored(
      `<button type="button" class="image-studio__tt-btn" data-img-popover-toggle="textColor" aria-haspopup="true" aria-expanded="${colorOpen}" aria-label="Text colour"><span class="image-studio__tt-swatch" style="--sw:${escapeHtml(o.color || "#FFFFFF")}"></span><span>Colour</span></button>`,
      colorOpen ? textColorPopover(o, st) : "",
    )}
    ${sep}
    ${anchored(
      `<button type="button" class="image-studio__tt-btn image-studio__tt-font" data-img-popover-toggle="textFont" aria-haspopup="true" aria-expanded="${fontOpen}" title="Font — ${escapeHtml(fontLabel)}" aria-label="Font"><span class="image-studio__tt-aa" aria-hidden="true">Aa</span></button>`,
      fontOpen ? textFontPopover(o, st) : "",
    )}
    <button type="button" class="image-studio__tt-btn image-studio__tt-bold" data-img-text-bold aria-pressed="${!!o.bold}">Bold</button>
    <button type="button" class="image-studio__tt-btn image-studio__tt-italic" data-img-text-italic aria-pressed="${!!o.italic}">Italic</button>
    ${sep}
    ${anchored(
      `<button type="button" class="image-studio__tt-btn image-studio__tt-outline${o.outline ? " is-on" : ""}" data-img-popover-toggle="textOutline" aria-haspopup="true" aria-expanded="${outlineOpen}" title="Outline"><span class="image-studio__tt-swatch" style="--sw:${escapeHtml(o.outlineColor || "#0A1B33")}"></span><span>Outline</span></button>`,
      outlineOpen ? textOutlinePopover(o, st) : "",
    )}
    ${anchored(
      `<button type="button" class="image-studio__tt-btn image-studio__tt-shadow${o.shadow ? " is-on" : ""}" data-img-popover-toggle="textShadow" aria-haspopup="true" aria-expanded="${shadowOpen}" title="Shadow"><span class="image-studio__tt-shadowdot" aria-hidden="true"></span><span>Shadow</span></button>`,
      shadowOpen ? textShadowPopover(o) : "",
    )}
    ${sep}
    <button type="button" class="ap-icon-button image-studio__tt-del" data-img-overlay-delete="${o.id}" aria-label="Delete text"><i class="ap-icon-trash" aria-hidden="true"></i></button>
  </div>`;
}

// The Playbook brand colours get their own framed section (so they read as
// "your brand"); the defaults + any custom colours + an "add" picker sit below.
// Deduped case-insensitively across both groups. Shared by the fill-colour and
// outline-colour popovers — `applyAttr` is stamped on each preset swatch,
// `pickAttr` on the hidden colour input.
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

// Outline — on/off switch + a thickness slider (0–100) + a colour grid for the
// stroke. The body dims (and controls disable) while outline is off.
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

// A radio-style list of the bundled + uploaded fonts, each label previewed in
// its own face.
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
