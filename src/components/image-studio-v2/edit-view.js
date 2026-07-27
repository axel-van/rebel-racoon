// Image Studio v2 — the edit canvas.
//
// Everything that MUST live on the canvas, and nothing that doesn't. The AI
// reprompt bar and the three manual tools moved down into the composer; what
// stays here is what has to track a specific pixel: the working image, the
// draggable overlay layer, the crop rectangle with its handles and its ✕/✓
// (kept at the contact point of the gesture — its ratio options are in the
// composer's Crop sheet), and the mini toolbar that follows a selected text
// element.

import { escapeHtml } from "../../utils.js?v=21";
import { KEY } from "./context.js?v=1";
import { outlineMetrics, shadowMetrics, cssFamily } from "../image-studio/canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=42";

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
        `<span class="isv2-crop-handle isv2-crop-handle--${c}" data-img-crop-handle="${c}" aria-hidden="true"></span>`,
    )
    .join("");
  return `<div class="isv2-crop-layer" data-img-crop-layer>
      <div class="isv2-croprect" data-img-croprect style="${style}">${handles}</div>
    </div>${cropConfirm(st, r)}`;
}

// Just the two verbs, pinned under the box. The ratio chips that used to crowd
// this bar are a composer sheet now, so the confirm pair stays out of the way of
// the crop you're judging. Rendered as a frame child (outside the crop layer) so
// it isn't clipped and can't start a drag.
function cropConfirm(st, r) {
  const busy = st.editBusy ? "disabled" : "";
  const style = `left:${(r.xF + r.wF / 2) * 100}%; top:${(r.yF + r.hF) * 100}%;`;
  return `<div class="isv2-crop-confirm" data-img-crop-toolbar style="${style}" role="toolbar" aria-label="Crop">
    <button type="button" class="ap-icon-button" data-img-crop-cancel title="Cancel" aria-label="Cancel crop" ${busy}><i class="ap-icon-close" aria-hidden="true"></i></button>
    <button type="button" class="ap-icon-button isv2-crop-apply" data-img-crop-apply title="Apply crop" aria-label="Apply crop" ${busy}><i class="ap-icon-check" aria-hidden="true"></i></button>
  </div>`;
}

// ── Overlay layer ───────────────────────────────────────────────────────────

function overlayLayer(st) {
  if (!st.overlays.length) return "";
  // Selected → un-clip so a bleeding element + its chrome stay grabbable; idle →
  // clip to the image (matches the flattened result).
  const cls = `isv2-overlay-layer${st.selectedOverlayId ? " has-selection" : ""}`;
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
      ? `<button type="button" class="isv2-overlay-rotate-reset" data-img-overlay-rotate-reset="${o.id}" title="Reset rotation" aria-label="Reset rotation"><i class="ap-icon-reset" aria-hidden="true"></i></button>`
      : "";
  const handles = `<span class="isv2-overlay-rotate" data-img-overlay-rotate="${o.id}" title="Rotate" aria-hidden="true"><i class="ap-icon-refresh"></i></span>${rotateReset}
    <span class="isv2-overlay-resize" data-img-overlay-resize="${o.id}" title="Resize" aria-hidden="true"></span>`;
  let inner;
  let chrome;
  if (o.kind === "logo") {
    inner = `<img src="${escapeHtml(o.url)}" alt="" draggable="false" />`;
    chrome = `<button type="button" class="isv2-overlay-delete" data-img-overlay-delete="${o.id}" aria-label="Delete element"><i class="ap-icon-close" aria-hidden="true"></i></button>${handles}`;
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
    inner = `<span class="isv2-overlay-text" data-img-overlay-text${editAttrs} style="${textStyle}">${escapeHtml(o.text || "")}</span>`;
    // Text elements: the mini toolbar carries the style controls + delete; size
    // is changed with the corner handle.
    chrome = `${textToolbar(o, st, selected)}${handles}`;
  }
  const cls = `isv2-overlay${o.kind === "text" ? " is-text" : ""}${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`;
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
  return `<div class="isv2-tt" data-img-text-toolbar>
    <button type="button" class="isv2-tt-btn" data-img-popover-toggle="textColor" aria-haspopup="dialog" aria-expanded="${colorOpen}" aria-label="Text colour"><span class="isv2-tt-swatch" style="--sw:${escapeHtml(o.color || "#FFFFFF")}"></span><span>Colour</span></button>
    ${colorOpen ? textColorPopover(o, st) : ""}
    <span class="isv2-tt-sep" aria-hidden="true"></span>
    <button type="button" class="isv2-tt-btn isv2-tt-font" data-img-popover-toggle="textFont" aria-haspopup="dialog" aria-expanded="${fontOpen}" title="Font — ${escapeHtml(fontLabel)}" aria-label="Font"><span class="isv2-tt-aa" aria-hidden="true">Aa</span></button>
    ${fontOpen ? textFontPopover(o, st) : ""}
    <button type="button" class="isv2-tt-btn isv2-tt-bold" data-img-text-bold aria-pressed="${!!o.bold}">Bold</button>
    <button type="button" class="isv2-tt-btn isv2-tt-italic" data-img-text-italic aria-pressed="${!!o.italic}">Italic</button>
    <span class="isv2-tt-sep" aria-hidden="true"></span>
    <button type="button" class="isv2-tt-btn isv2-tt-outline${o.outline ? " is-on" : ""}" data-img-popover-toggle="textOutline" aria-haspopup="dialog" aria-expanded="${outlineOpen}" title="Outline"><span class="isv2-tt-swatch" style="--sw:${escapeHtml(o.outlineColor || "#0A1B33")}"></span><span>Outline</span></button>
    ${outlineOpen ? textOutlinePopover(o, st) : ""}
    <button type="button" class="isv2-tt-btn isv2-tt-shadow${o.shadow ? " is-on" : ""}" data-img-popover-toggle="textShadow" aria-haspopup="dialog" aria-expanded="${shadowOpen}" title="Shadow"><span class="isv2-tt-shadowdot" aria-hidden="true"></span><span>Shadow</span></button>
    ${shadowOpen ? textShadowPopover(o) : ""}
    <span class="isv2-tt-sep" aria-hidden="true"></span>
    <button type="button" class="ap-icon-button isv2-tt-del" data-img-overlay-delete="${o.id}" aria-label="Delete text"><i class="ap-icon-trash" aria-hidden="true"></i></button>
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
    `<button type="button" class="isv2-swatch${sel === c ? " is-selected" : ""}" ${applyAttr}="${c}" style="--sw:${c}" aria-label="${c}"></button>`;
  const seen = new Set();
  const dedupe = (list) =>
    (list || []).map((c) => (c || "").toUpperCase()).filter((c) => c && !seen.has(c) && seen.add(c));
  const brand = dedupe(st.playbookColors); // brand first → wins the dedupe
  const others = dedupe([...imageStudio.TEXT_COLORS, ...(st.customTextColors || [])]);
  const addSwatch = `<label class="isv2-swatch isv2-swatch--add" title="${pickLabel}"><input type="color" ${pickAttr} aria-label="${pickLabel}" /><i class="ap-icon-plus" aria-hidden="true"></i></label>`;
  const brandName = (st.playbookName || "").trim();
  const brandLabel = brandName ? `Brand (${escapeHtml(brandName)})` : "Brand";
  const brandGroup = brand.length
    ? `<div class="isv2-color-group">
        <p class="isv2-sheet-label">${brandLabel}</p>
        <span class="isv2-swatches">${brand.map(swatch).join("")}</span>
      </div>`
    : "";
  const othersGroup = `<div class="isv2-color-group">
      ${brand.length ? `<p class="isv2-sheet-label">More</p>` : ""}
      <span class="isv2-swatches">${others.map(swatch).join("")}${addSwatch}</span>
    </div>`;
  return `${brandGroup}${othersGroup}`;
}

// On-element popovers drop DOWN from the toolbar (the toolbar sits above the
// element, and the element can be anywhere on the canvas).
function elementPopover({ title, body, extraClass = "", head = "" }) {
  return `<div class="isv2-pop ${extraClass}" data-img-popover role="dialog" aria-label="${escapeHtml(title)}">
    <div class="isv2-pop-head"><p class="isv2-sheet-title">${escapeHtml(title)}</p>${head}</div>
    <div class="isv2-pop-body">${body}</div>
  </div>`;
}

function textColorPopover(o, st) {
  return elementPopover({
    title: "Colour",
    body: swatchGrid({
      st,
      selected: o.color,
      applyAttr: "data-img-text-color",
      pickAttr: "data-img-text-colorpick",
      pickLabel: "Add text colour",
    }),
  });
}

// A small on/off switch (DS toggle) for an effect popover's header.
function fxToggle(attr, on, label) {
  return `<label class="ap-toggle-container isv2-fx-toggle" title="${label}"><input type="checkbox" ${attr} ${on ? "checked" : ""} aria-label="${label}" /><i aria-hidden="true"></i></label>`;
}

// Outline — on/off switch + a thickness slider (0–100) + a colour grid for the
// stroke. The body dims (and controls disable) while outline is off.
function textOutlinePopover(o, st) {
  const on = !!o.outline;
  const w = o.outlineWidth ?? 50;
  return elementPopover({
    title: "Outline",
    extraClass: `isv2-pop--outline${on ? "" : " is-off"}`,
    head: fxToggle("data-img-outline-toggle", on, "Toggle outline"),
    body: `<div class="isv2-slider-row">
        <input type="range" class="ap-slider" min="0" max="100" step="1" value="${w}" data-img-outline-width aria-label="Outline thickness" style="--fill:${w}%" ${on ? "" : "disabled"} />
        <span class="isv2-slider-val" data-img-outline-val>${w}</span>
      </div>
      ${swatchGrid({ st, selected: o.outlineColor, applyAttr: "data-img-outline-color", pickAttr: "data-img-outline-colorpick", pickLabel: "Add outline colour" })}`,
  });
}

function textShadowPopover(o) {
  const on = !!o.shadow;
  const val = o.shadowIntensity ?? 55;
  return elementPopover({
    title: "Shadow",
    extraClass: `isv2-pop--shadow${on ? "" : " is-off"}`,
    head: fxToggle("data-img-shadow-toggle", on, "Toggle shadow"),
    body: `<div class="isv2-slider-row">
        <input type="range" class="ap-slider" min="0" max="100" step="1" value="${val}" data-img-shadow-intensity aria-label="Shadow intensity" style="--fill:${val}%" ${on ? "" : "disabled"} />
        <span class="isv2-slider-val" data-img-shadow-val>${val}</span>
      </div>`,
  });
}

// A radio-style list of the bundled + uploaded fonts, each label previewed in
// its own face. This one IS a list of options, so it uses the DS action-dropdown
// item rows rather than the studio's own sheet body.
function textFontPopover(o, st) {
  const cur = o.fontFamily || null;
  const row = (family, label) => {
    const on = (family || null) === cur;
    const preview = family ? ` style="font-family:${cssFamily(family)}"` : "";
    return `<button type="button" class="ap-action-dropdown-item isv2-font-row${on ? " is-selected" : ""}" data-img-font="${escapeHtml(family || "")}" role="menuitemradio" aria-checked="${on}">
      <span class="ap-action-dropdown-item-label"${preview}>${escapeHtml(label)}</span>
      ${on ? `<i class="ap-icon-check isv2-font-check" aria-hidden="true"></i>` : ""}
    </button>`;
  };
  const builtins = imageStudio.FONT_OPTIONS.map((f) => row(f.family, f.label)).join("");
  const custom = (st.customFonts || []).map((f) => row(f.family, f.label)).join("");
  return elementPopover({
    title: "Font",
    extraClass: "isv2-pop--font",
    body: `<div class="isv2-font-list">${builtins}${custom}</div>`,
  });
}
