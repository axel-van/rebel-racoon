// Image Studio v2 — the three panels the console used to hold.
//
//   ┌────────────────────────────────────────────────────┐
//   │  Image Studio    Generate | Edit                ✕  │
//   ├────────────────────────────────────────────────────┤
//   │              [ Image | In feed ]                   │
//   │  ┌──┐                            ┌──────────────┐  │
//   │  │▪ │                            │ Brand kit  ▾ │  │
//   │  │▪ │        [   IMAGE   ]       │ References ▾ │  │
//   │  │+ │                            │ Type       ▾ │  │
//   │  └──┘                            │ Style      ▾ │  │
//   │  chutier                         │ Format     ▾ │  │
//   │                                  │ Output     ▾ │  │
//   │                                  └──────────────┘  │
//   ├────────────────────────────────────────────────────┤
//   │  ✨ PROMPT …          [Suggest] [Regen] [Use it]   │
//   └────────────────────────────────────────────────────┘
//
// The creative-tool three-zone layout: assets left, canvas centre, inspector
// right, composer bottom. Two things fall out of it. The settings sit beside the
// image they describe instead of underneath it, and the bottom bar shrinks back
// to the one thing it should hold — the prompt — which is what let it be too
// wide and too heavy in the first place.
//
// EDIT drops the inspector and floats its three manual tools top-left over the
// canvas, at the contact point of the work (v1's arrangement, which was right).
//
// Three exported surfaces, all composed by stage-view:
//   composer(st)      the bottom console — prompt + CTAs, both modes
//   settingsPanel(st) the floating inspector (generate only)
//   toolPalette(st)   the floating tool palette (edit only)
//
// Sheets are FLAT — sections + dividers, never a nested dropdown (the ADS has no
// flyout-submenu pattern). One is open at a time, tracked by state.openPopover.

import { escapeHtml } from "../../utils.js?v=21";
import { FORMATS, NETWORK_FORMATS } from "../../clip-formats.js?v=7";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=27";
import { KEY } from "./context.js?v=5";
import * as imageStudio from "../../image-studio.js?v=42";

// Empty-state hint for the prompt field — a full structured brief, so the
// placeholder itself shows the kind of rich prompt the box is built for (and why
// the expand toggle exists). Shown only when the field is empty, which in
// practice means the user cleared what Archie wrote.
const PROMPT_PLACEHOLDER = `Campaign title: AI UX Safeguard
Campaign objective: Raise awareness about the risks of unmediated AI in UX design and establish the line between acceleration and shortcuts.
Audience: UX/UI Designers, Product Managers, Tech Leaders
Tone: Professional, provocative, authoritative

Title: AI can easily ruin your UX
Key message: Velocity is useless if you are building the wrong things faster. Human oversight is non-negotiable.
Narrative purpose: Grab attention immediately with a provocative statement and a striking visual metaphor of speed leading to chaos.
Visual goal: Create an instant visual metaphor for speed without direction or acceleration leading to product degradation.
Visual scene: A deep blue background. On the left, massive bold typography. On the right, a single powerful graphic: a thick, horizontal orange arrow representing velocity. The tail of the arrow is solid and perfectly defined, but as it points forward, the tip shatters and dissolves into a chaotic cloud of tiny, disconnected digital pixels and glitch fragments.
Composition focus: The transition point of the arrow where order turns into digital chaos, aligned with the bold headline.`;

export function composer(st) {
  return st.mode === "edit" ? editComposer(st) : generateComposer(st);
}

// The floating inspector — the six settings, beside the image rather than under
// it. Same DS Selects, same flyout sheets; only the container moved.
export function settingsPanel(st) {
  return `<aside class="isv2-panel" role="group" aria-label="Generation settings">${settingRows(st)}</aside>`;
}

// The floating palette — the manual tools, top-left over the canvas, where the
// work is. This is v1's palette, reusing v1's classes and its ghost-grey buttons
// verbatim: the arrangement was already right and the compact look was already
// right, so there is nothing here for v2 to redesign. Only the flyout direction
// differs — the palette sits at the LEFT edge, so its options open right.
export function toolPalette(st) {
  return `<div class="image-studio__palette" role="toolbar" aria-label="Edit tools">${editTools(st)}</div>`;
}

// ── Shared building blocks ──────────────────────────────────────────────────

// One setting = one DS Accordion section, expanding IN PLACE inside the panel.
//
// This replaced a stack of `.ap-select` triggers that threw flyout sheets over
// the image. Sections are the better tool for three reasons: the options land
// next to the label they belong to instead of across the canvas, nothing has to
// be positioned (no flyout can fall off an edge), and with no sheet needing to
// escape it the panel is finally free to scroll — the `overflow: auto` trap that
// bit this file three times simply stops existing.
//
// `.ap-accordion` brings the frame, the header row, the title, the toggle and
// its 180° rotation on `.collapsed`. Only one is open at a time (state.openPopover
// holds which), so the panel stays short.
function settingRow({ name, label, value, body, open, set = false, disabled = false }) {
  const expanded = open && !disabled;
  return `<div class="ap-accordion isv2-acc${expanded ? "" : " collapsed"}${disabled ? " is-disabled" : ""}">
    <button type="button" class="ap-accordion-header isv2-acc-head" data-img-popover-toggle="${name}" aria-expanded="${expanded}"${disabled ? " disabled" : ""}>
      <span class="ap-accordion-title isv2-acc-title">${escapeHtml(label)}</span>
      <span class="isv2-acc-value${set ? " is-set" : ""}">${escapeHtml(value)}</span>
      ${disabled ? "" : `<i class="ap-icon-chevron-up ap-accordion-toggle" aria-hidden="true"></i>`}
    </button>
    <div class="ap-accordion-content isv2-acc-body">${expanded ? body() : ""}</div>
  </div>`;
}

// One palette tool, exactly as v1 draws it: a ghost-grey DS button with its
// glyph and label. `.image-studio__palette-anchor` is v1's relative wrapper that
// the flyout hangs off.
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
function sheet({ title, body, wide = false }) {
  return `<div class="isv2-sheet${wide ? " isv2-sheet--wide" : ""}" data-img-popover role="dialog" aria-label="${escapeHtml(title)}">
    <p class="isv2-sheet-title">${escapeHtml(title)}</p>
    <div class="isv2-sheet-body">${body}</div>
  </div>`;
}

const sheetDivider = `<span class="isv2-sheet-divider" role="separator"></span>`;

// "Best for <network icon>" — the app-wide convention: the words, then the
// icon; the spelled-out name rides in title/aria-label, never inline.
function bestFor(network) {
  if (!network) return "";
  const label = NETWORK_LABEL[network] || network;
  const icon = NETWORK_ICON_BY_PLATFORM[network];
  const glyph = icon ? `<i class="${icon}" title="${escapeHtml(label)}" aria-hidden="true"></i>` : escapeHtml(label);
  return `<p class="isv2-sheet-hint" aria-label="Best for ${escapeHtml(label)}">Best for ${glyph}</p>`;
}

// ── Generate mode ───────────────────────────────────────────────────────────

// The composer is a CARD centred on the stage, not a full-width footer strip.
// At 1440px a full-bleed prompt runs ~180 characters per line — unreadable, and
// it made the six settings look like chrome stranded at the bottom of a huge
// empty bar. Capped and centred, the card reads as one object you act in.
function generateComposer(st) {
  return console_("Image prompt", promptField(st), generateActions(st), "to generate");
}

// The frame both modes share, and it IS the app's own conversational composer:
// a bordered card that lights up on focus, a borderless field, a toolbar row
// under it holding the action, and a keyboard hint below the card. Same recipe
// as `.session__composer-card` — same border, same shadow, same padding rhythm,
// same focus behaviour, same 2-to-12-line field — because the user is doing the
// same thing here (writing a brief for Archie) and it should not feel like a
// different product.
//
// What v2 grew instead and has now shed: an eyebrow, a "Suggest again" button
// and an expand toggle. The eyebrow only gave the field an identity that the
// composer's own frame already gives it; the expand solved a scrolling problem
// the composer solves with a line cap; and re-deriving the prompt now happens
// once, automatically, when the studio opens.
function console_(label, field, action, hintVerb) {
  return `<div class="isv2-dock">
    <div class="isv2-console-wrap">
      <div class="isv2-console" role="group" aria-label="${escapeHtml(label)}">
        ${field}
        ${action ? `<div class="isv2-console-toolbar">${action}</div>` : ""}
      </div>
      <div class="isv2-console-hint">
        <kbd>Enter</kbd> ${hintVerb} · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line
      </div>
    </div>
  </div>`;
}

// Archie drafts the brief from the post on open, so the field leads with what he
// wrote and the user's job is to review it. While he's writing, the field itself
// holds the loader (the stage keeps its empty state) so the layout is legible
// from the first frame.
function promptField(st) {
  if (st.promptLoading) {
    return `<div class="isv2-prompt-loading" role="status">
      <span class="gen-image-spinner gen-loading-mark"></span>
      <span>Writing your image prompt…</span>
    </div>`;
  }
  return `<textarea id="isv2Prompt" class="isv2-prompt" data-img-prompt rows="2" placeholder="${escapeHtml(PROMPT_PLACEHOLDER)}" aria-label="Describe your image">${escapeHtml(st.promptText)}</textarea>`;
}

// The prompt card's own action — running the prompt. SECONDARY, because it is a
// step and not the destination: the modal has exactly one primary now and it
// lives in the footer ("Use this image"). Before the footer existed this button
// had to carry both jobs, which is why it was orange.
function generateActions(st) {
  if (st.genPhase === "generating") {
    return `<button type="button" class="ap-button stroked grey loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>`;
  }
  // A prompt being rewritten isn't one you can run yet.
  const promptReady = !st.promptLoading && !!(st.promptText || "").trim();
  const hasResults = st.genPhase === "results" && st.variations.length > 0;
  const icon = hasResults ? "ap-icon-refresh" : "ap-icon-sparkles-mermaid";
  const label = hasResults ? "Regenerate" : "Generate image";
  return `<button type="button" class="ap-button stroked grey" data-img-generate ${promptReady ? "" : "disabled"}><i class="${icon}"></i><span>${label}</span></button>`;
}

// ── The modal footer ────────────────────────────────────────────────────────

// One bar across the bottom of the modal, in BOTH modes, carrying the single
// action that ends the flow. Having it there from the first frame — disabled
// until there is something to commit — means the destination is visible the
// whole way through instead of appearing only once results land.
export function footerBar(st) {
  const carousel = st.outputMode === "carousel";
  let left = "";
  let primary;
  if (st.mode === "edit") {
    left = `<button type="button" class="ap-button ghost grey" data-img-undo ${imageStudio.canUndo(KEY) ? "" : "disabled"}><i class="ap-icon-reset"></i><span>Undo</span></button>`;
    // Editing a carousel slide commits back into that slide rather than to the
    // draft — a different destination, so a different verb.
    primary = carousel
      ? `<button type="button" class="ap-button primary orange" data-img-apply-slide ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Apply to slide ${(st.selectedIndex ?? 0) + 1}</span></button>`
      : `<button type="button" class="ap-button primary orange" data-img-use ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Use this image</span></button>`;
  } else {
    const label = carousel ? `Use carousel · ${st.variations.length} slides` : "Use this image";
    const ready = carousel ? st.variations.length >= 2 : !!st.currentImage;
    primary = `<button type="button" class="ap-button primary orange" data-img-use ${ready ? "" : "disabled"}><i class="ap-icon-check"></i><span>${escapeHtml(label)}</span></button>`;
  }
  return `<div class="ap-dialog-footer isv2-footer">
    <div class="ap-dialog-footer-left">${left}</div>
    <div class="ap-dialog-footer-right">${primary}</div>
  </div>`;
}

// ── The six setting chips ───────────────────────────────────────────────────

function settingRows(st) {
  const open = st.openPopover;
  const out = [];

  // Brand kit — only when the Playbook actually has reference images.
  const hasPlaybookRefs = Array.isArray(st.playbookRefs) && st.playbookRefs.length > 0;
  if (hasPlaybookRefs) {
    const brand = st.playbookName || "Playbook";
    const on = !!st.usePlaybookRefs;
    const usedIds = new Set(st.referenceImages.map((r) => r.id));
    const usedCount = st.playbookRefs.filter((r) => usedIds.has(r.id)).length;
    out.push(
      settingRow({
        name: "brandKit",
        label: "Brand kit",
        value: on ? `${brand} · ${usedCount}` : "Off",
        set: on,
        open: open === "brandKit",
        body: () => brandKitBody(st),
      }),
    );
  }

  // References — the user's own uploads (Playbook tiles live in Brand kit).
  const uploads = st.referenceImages.filter((r) => !r.fromPlaybook);
  out.push(
    settingRow({
      name: "refs",
      label: "References",
      value: uploads.length ? `${uploads.length} added` : "None",
      set: uploads.length > 0,
      open: open === "refs",
      body: () => refsBody(st, uploads),
    }),
  );

  // Image type — what the image is FOR. A distinct dimension from the style.
  const typeLabel = st.imageTypeKey
    ? imageStudio.IMAGE_TYPES.find((o) => o.key === st.imageTypeKey)?.label || "Any"
    : "Any";
  out.push(
    settingRow({
      name: "imageType",
      label: "Type",
      value: typeLabel,
      set: !!st.imageTypeKey,
      open: open === "imageType",
      body: () => imageTypeBody(st),
    }),
  );

  // Style preset — the aesthetic look. Mutually exclusive with references: when
  // refs guide the look, the row switches off and says why instead.
  const hasRefs = st.referenceImages.length > 0;
  const styleLabel = st.styleKey ? imageStudio.STYLE_PRESETS.find((o) => o.key === st.styleKey)?.label || "Any" : "Any";
  out.push(
    settingRow({
      name: "style",
      label: "Style",
      value: hasRefs ? "From references" : styleLabel,
      set: !hasRefs && !!st.styleKey,
      disabled: hasRefs,
      open: open === "style",
      body: () => styleBody(st),
    }),
  );

  // Format — the value says the shape ("1:1 · Square"); the ratio glyphs live in
  // the sheet, where they actually help you choose.
  const choices = imageStudio.formatChoices(KEY);
  const cur = choices.find((f) => f.id === st.formatId);
  out.push(
    settingRow({
      name: "format",
      label: "Format",
      value: cur ? `${cur.tag} · ${cur.label}` : "Aspect ratio",
      set: false, // format always has a value; "set" would be meaningless here
      open: open === "format",
      body: () => formatBody(st, choices),
    }),
  );

  // Output — single vs carousel, merged with its count control.
  const canCarousel = imageStudio.supportsCarousel(st.network);
  const isCarousel = canCarousel && st.outputMode === "carousel";
  out.push(
    settingRow({
      name: "output",
      label: canCarousel ? "Output" : "Variations",
      value: isCarousel
        ? `Carousel · ${st.slideCount}`
        : `${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}`,
      set: isCarousel,
      open: open === "output",
      body: () => outputBody(st, canCarousel, isCarousel),
    }),
  );

  return out.join("");
}

// Brand kit — the switch IS the disclosure for the tiles below it (off = no
// brand images in play, so there's nothing to show).
function brandKitBody(st) {
  const brand = st.playbookName || "Playbook";
  const on = !!st.usePlaybookRefs;
  const usedIds = new Set(st.referenceImages.map((r) => r.id));
  const capReached = st.referenceImages.length >= imageStudio.MAX_REFS;
  const tiles = (st.playbookRefs || []).map((r) => playbookRefTile(r, usedIds.has(r.id), capReached)).join("");
  return `<div class="isv2-sheet-switch">
      <span class="isv2-sheet-switch-label">Use ${escapeHtml(brand)}'s images</span>
      <label class="ap-toggle-container" title="Use your brand kit">
        <input type="checkbox" data-img-toggle-playbook-refs ${on ? "checked" : ""} aria-label="Use ${escapeHtml(brand)} brand kit" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    ${on ? `${sheetDivider}<div class="isv2-refs">${tiles}</div>` : ""}`;
}

// An explicit include/exclude control. The whole tile is the toggle; the tick
// (present vs absent — a shape signal, not colour alone) plus a desaturating
// scrim on skip make the two states clear without a worded pill on every
// thumbnail. Note + target networks ride in the tooltip.
function playbookRefTile(r, on, capReached) {
  const lockedOff = !on && capReached;
  const note = (r.note || "").trim();
  const nets = Array.isArray(r.networks) ? r.networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  const stateWord = on ? "Used in this image" : "Skipped";
  const info = [stateWord];
  if (note) info.push(note);
  if (nets.length) info.push(`Best for ${nets.map((n) => NETWORK_LABEL[n] || n).join(", ")}`);
  return `<button type="button" class="isv2-ref isv2-ref--pick${on ? " is-used" : " is-skipped"}" data-img-ref-toggle="${escapeHtml(r.id)}" aria-pressed="${on}" aria-label="${escapeHtml(stateWord)} — tap to toggle"${lockedOff ? " disabled" : ""} title="${escapeHtml(info.join(" · "))}">
    <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
    <span class="isv2-ref-scrim" aria-hidden="true"></span>
    <span class="isv2-ref-box" aria-hidden="true">${on ? `<i class="ap-icon-check"></i>` : ""}</span>
  </button>`;
}

function refsBody(st, uploads) {
  const capped = st.referenceImages.length >= imageStudio.MAX_REFS;
  const dropzone = capped
    ? `<p class="isv2-sheet-hint">Maximum ${imageStudio.MAX_REFS} reference images reached.</p>`
    : `<button type="button" class="isv2-dropzone" data-img-dropzone data-img-ref-add>
        <i class="ap-icon-plus" aria-hidden="true"></i>
        <span class="isv2-dropzone-text">
          <span class="isv2-dropzone-title">Drop or click to add images</span>
          <span class="isv2-dropzone-sub">PNG, JPG, WebP · one matches its style, more blend a new look</span>
        </span>
      </button>`;
  const tiles = uploads
    .map(
      (r) => `<div class="isv2-ref">
        <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
        <button type="button" class="isv2-ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove reference"><i class="ap-icon-close" aria-hidden="true"></i></button>
      </div>`,
    )
    .join("");
  return `${dropzone}${tiles ? `<div class="isv2-refs">${tiles}</div>` : ""}`;
}

function imageTypeBody(st) {
  const chips = imageStudio.IMAGE_TYPES.map((o) => {
    const sel = st.imageTypeKey === o.key;
    const tip = `${o.label} · ${o.desc}`;
    return `<button type="button" class="ap-filter-chip" data-img-image-type="${escapeHtml(o.key)}" aria-pressed="${sel}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${escapeHtml(o.label)}</button>`;
  }).join("");
  return `<div class="isv2-chip-group">${chips}</div>`;
}

function styleBody(st) {
  const cards = imageStudio.STYLE_PRESETS.map((o) => {
    const sel = st.styleKey === o.key;
    return `<button type="button" class="gen-style-card${sel ? " is-selected" : ""}" data-img-style="${escapeHtml(o.key)}" aria-pressed="${sel}" title="${escapeHtml(o.label)}">
      <span class="gen-style-thumb">
        <img src="https://picsum.photos/seed/archie-style-${escapeHtml(o.key)}/220/170" alt="" loading="lazy" />
        ${sel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </span>
      <span class="gen-style-name">${escapeHtml(o.label)}</span>
    </button>`;
  }).join("");
  return `<div class="gen-style-grid isv2-style-grid">${cards}</div>`;
}

function formatBody(st, choices) {
  const chips = choices
    .map((f) => {
      const sel = st.formatId === f.id;
      const full = `${f.tag} · ${f.label}`;
      return `<button type="button" class="ap-filter-chip isv2-format-chip" data-img-format="${escapeHtml(f.id)}" aria-pressed="${sel}" title="${escapeHtml(full)}" aria-label="${escapeHtml(full)}"><span class="isv2-ratio-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>${escapeHtml(f.tag)}</button>`;
    })
    .join("");
  return `${bestFor(st.network)}<div class="isv2-chip-group">${chips}</div>`;
}

// Type + count in one flat sheet: two labelled sections separated by a divider,
// never a nested dropdown.
function outputBody(st, canCarousel, isCarousel) {
  const typeSection = canCarousel
    ? `<div class="isv2-chip-group">
        <button type="button" class="ap-filter-chip" data-img-output="single" aria-pressed="${!isCarousel}"><i class="ap-icon-image" aria-hidden="true"></i>Single image</button>
        <button type="button" class="ap-filter-chip" data-img-output="carousel" aria-pressed="${isCarousel}"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Carousel</button>
      </div>${sheetDivider}`
    : "";
  const countLabel = isCarousel ? `Slides · up to ${imageStudio.carouselMaxFor(st.network)}` : "Variations";
  const counts = isCarousel
    ? imageStudio.SLIDE_CHOICES.filter((n) => n <= imageStudio.carouselMaxFor(st.network))
        .map(
          (n) =>
            `<button type="button" class="ap-filter-chip" data-img-slidecount="${n}" aria-pressed="${st.slideCount === n}">${n}</button>`,
        )
        .join("")
    : imageStudio.VARIATION_CHOICES.map(
        (n) =>
          `<button type="button" class="ap-filter-chip" data-img-varcount="${n}" aria-pressed="${st.variationCount === n}">${n}</button>`,
      ).join("");
  return `${typeSection}<p class="isv2-sheet-label">${escapeHtml(countLabel)}</p><div class="isv2-chip-group">${counts}</div>`;
}

// ── Edit mode ───────────────────────────────────────────────────────────────

// The same composer, re-tasked: describe a change instead of a brief. Identical
// frame, identical field, and its action sits in the same toolbar slot Generate
// uses — so switching modes moves the label, not the furniture. Secondary, like
// Generate: the modal's one primary is "Use this image" in the footer.
function editComposer(st) {
  const busy = st.editBusy ? "disabled" : "";
  return console_(
    "Edit the image",
    `<textarea class="isv2-prompt" data-img-edit-prompt rows="2" placeholder="Describe a change and I'll redraw it…" aria-label="Describe a change for AI to apply" ${busy}>${escapeHtml(st.editPrompt || "")}</textarea>`,
    `<button type="button" class="ap-button stroked grey" data-img-apply-edit="prompt" ${busy}><i class="ap-icon-sparkles-mermaid"></i><span>Redraw</span></button>`,
    "to redraw",
  );
}

function editTools(st) {
  const busy = !!st.editBusy;
  return [
    // Crop is a mode, not a menu: the row enters the draw mode AND opens its
    // ratio sheet. The box + its ✕/✓ stay on the canvas, at the contact point of
    // the gesture; only the options moved down here.
    toolRow({
      name: "crop",
      label: "Crop",
      icon: "ap-icon-cropper",
      action: `data-img-crop-start`,
      active: !!st.cropDrawing,
      open: st.openPopover === "crop",
      disabled: busy,
      sheet: () => cropSheet(st),
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
      sheet: () => logoSheet(),
    }),
  ].join("");
}

// Freeform + the network's optimised ratios, each with a glyph drawn to its own
// proportions. Non-optimal ratios are hidden outright rather than shown disabled.
function cropSheet(st) {
  const net = st.network || null;
  const optimalIds = net ? NETWORK_FORMATS[net] || null : null;
  const chipFor = (id, label, ratio, on) =>
    `<button type="button" class="ap-filter-chip isv2-format-chip" data-img-crop-aspect="${escapeHtml(id)}" aria-pressed="${on}"><span class="isv2-ratio-glyph${ratio ? "" : " isv2-ratio-glyph--free"}"${ratio ? ` style="aspect-ratio:${ratio}"` : ""} aria-hidden="true"></span>${escapeHtml(label)}</button>`;
  const freeform = chipFor("free", "Freeform", null, !st.cropAspect);
  const presets = Object.values(FORMATS)
    .filter((f) => !optimalIds || optimalIds.includes(f.id))
    .map((f) => chipFor(f.id, f.tag, f.ratio, !!st.cropAspect && Math.abs(st.cropAspect - f.ratio) < 0.001))
    .join("");
  return sheet({
    title: "Crop",
    body: `${bestFor(net)}<div class="isv2-chip-group">${freeform}${presets}</div>`,
  });
}

function logoSheet() {
  const presets = imageStudio.IMAGE_PRESETS.map(
    (p) =>
      `<button type="button" class="image-studio__preset" data-img-logo-preset="${escapeHtml(p.url)}" title="${escapeHtml(p.label)}"><img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.label)}" loading="lazy" /></button>`,
  ).join("");
  return sheet({
    title: "Add an image",
    body: `<button type="button" class="ap-button stroked grey image-studio__logo-upload" data-img-logo-upload><i class="ap-icon-upload" aria-hidden="true"></i><span>Upload an image</span></button>
      ${sheetDivider}
      <div class="image-studio__presets">${presets}</div>`,
    wide: true,
  });
}
