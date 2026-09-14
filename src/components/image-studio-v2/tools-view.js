// Image Studio — Edit mode's floating tool palette, and its one flyout.
//
// The manual tools live top-left OVER the canvas, at the contact point of the
// work. They take `.image-studio__palette` (styles/screens/image-studio-canvas.css)
// with the DS ghost-grey buttons: the arrangement was already right and the
// compact look was already right, so there was nothing here to redesign.
//
// Crop is a plain mode toggle — its ratio options live in the on-canvas toolbar
// under the crop box (edit-view.js#cropToolbar), not in a flyout a canvas-width
// away from the box it reshapes. So exactly ONE sheet exists: the Add-image
// stamp picker, tracked by `state.openPopover` along with the text toolbar's
// popovers, which genuinely are one-at-a-time.

import { escapeHtml } from "../../utils.js?v=1187";
import { sheetDivider } from "./settings-view.js?v=1187";
import * as imageStudio from "../../image-studio.js?v=1187";

// The floating palette — the manual tools, top-left over the canvas, where the
// work is, in ghost-grey DS buttons. It sits at the stage's LEFT edge — the same
// edge the settings panel occupies in Generate mode — so its flyout opens right.
export function toolPalette(st) {
  return `<div class="image-studio__palette" role="toolbar" aria-label="Edit tools">${editTools(st)}</div>`;
}

// One palette tool: a ghost-grey DS button with its glyph and label.
// `.image-studio__palette-anchor` is the relative wrapper the flyout hangs off
// (styles/screens/image-studio-canvas.css).
function toolRow({ name, label, icon, sheet, open, active = false, disabled = false, action = "" }) {
  const hook = action || `data-img-popover-toggle="${name}"`;
  const busy = disabled ? " disabled" : "";
  const btn = `<button type="button" class="ap-button ghost grey" ${hook}${sheet ? ` aria-haspopup="true" aria-expanded="${open}"` : ""} aria-pressed="${active}"${busy}><i class="${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`;
  if (!sheet) return btn;
  return `<div class="image-studio__palette-anchor">${btn}${open && !disabled ? sheet() : ""}</div>`;
}

// The drop-up surface. Not an .ap-action-dropdown — that component is a fixed
// 250px list of action rows, and half of these sheets are tile grids or slider
// panels. It borrows the action-dropdown's own --comp-* tokens for the surface
// (see the stylesheet) so it reads as the same object, sized to its content.
function sheet({ title, body }) {
  return `<div class="isv2-sheet" data-img-popover role="dialog" aria-label="${escapeHtml(title)}">
    <p class="isv2-sheet-title">${escapeHtml(title)}</p>
    <div class="isv2-sheet-body">${body}</div>
  </div>`;
}

function editTools(st) {
  const busy = !!st.editBusy;
  return [
    // Crop is a mode, not a menu — it just enters the draw mode. Its ratio
    // options belong on the canvas, in the toolbar under the box they reshape
    // (see edit-view#cropToolbar), not in a sheet a canvas-width away.
    toolRow({
      name: "crop",
      label: "Crop",
      icon: "ap-icon-cropper",
      action: `data-img-crop-start`,
      active: !!st.cropDrawing,
      disabled: busy,
    }),
    toolRow({
      name: "addText",
      label: "Add text",
      icon: "ap-icon-closed-captions",
      action: "data-img-add-text",
      disabled: busy,
    }),
    toolRow({
      name: "logo",
      label: "Add image",
      icon: "ap-icon-file--image",
      open: st.openPopover === "logo",
      disabled: busy,
      sheet: () => logoSheet(st),
    }),
  ].join("");
}

function logoSheet(st) {
  const presets = imageStudio.IMAGE_PRESETS.map(
    (p) =>
      `<button type="button" class="image-studio__preset" data-img-logo-preset="${escapeHtml(p.url)}" title="${escapeHtml(p.label)}"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.label)}" loading="lazy" /></button>`,
  ).join("");
  return sheet({
    title: "Add an image",
    body: `${playbookMark(st)}<button type="button" class="ap-button stroked grey image-studio__logo-upload" data-img-logo-upload><i class="ap-icon-upload" aria-hidden="true"></i><span>Upload an image</span></button>
      ${sheetDivider}
      <div class="image-studio__presets">${presets}</div>`,
  });
}

// The Playbook's own marks, FIRST — ahead of Upload and ahead of the presets,
// because "put my brand on this" is the likeliest reason to open this sheet, and
// they're already in hand: nothing to upload, nothing to hunt for.
//
// EVERY variant, not just the default. The Branding switch stamps the default
// bottom-right; this is the other half of that, and the reason to reach for it is
// usually that a different variant fits — the reversed lockup on a dark photo,
// the icon where a wordmark won't read at that size. Offering only the default
// would make the other three unreachable from the one place they're useful.
//
// Absent entirely when the Playbook has no marks — the switch's disabled row is
// where that gets explained, and a second empty slot here would just repeat it.
//
// Tiles carry an INDEX rather than `data-img-logo-preset="<url>"`: an uploaded
// logo is a data URL, and putting that in an attribute would paste hundreds of KB
// of base64 into the DOM on every render.
function playbookMark(st) {
  // Fall back to the lone default for a Playbook whose set hasn't been
  // normalized (a payload from before brandLogos existed).
  const logos = st.playbookLogos?.length
    ? st.playbookLogos
    : st.playbookLogo
      ? [{ label: "Logo", url: st.playbookLogo }]
      : [];
  if (!logos.length) return "";
  const who = st.playbookName || "Playbook";
  const tiles = logos
    .map((l, i) => {
      const alt = `${who} — ${l.label || "Logo"}`;
      return `<button type="button" class="image-studio__preset" data-img-logo-playbook="${i}" title="${escapeHtml(alt)}"><img src="${escapeHtml(l.url)}" alt="${escapeHtml(alt)}" /></button>`;
    })
    .join("");
  return `<p class="isv2-sheet-label">From your Playbook</p>
    <div class="image-studio__presets">${tiles}</div>
    ${sheetDivider}`;
}
