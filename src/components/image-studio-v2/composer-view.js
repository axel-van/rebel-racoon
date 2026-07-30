// Image Studio v2 — the three panels the console used to hold.
//
//   ┌────────────────────────────────────────────────────┐
//   │  Image Studio    Generate | Edit                ✕  │
//   ├────────────────────────────────────────────────────┤
//   │              [ Image | In feed ]                   │
//   │  ┌──────────────┐                          ┌──┐    │
//   │  │ Brand kit  ▾ │                          │▪ │    │
//   │  │ References ▾ │      [   IMAGE   ]       │▪ │    │
//   │  │ Type       ▾ │                          │+ │    │
//   │  │ Style      ▾ │                          └──┘    │
//   │  │ Format     ▾ │                        chutier   │
//   │  │ Output     ▾ │                                  │
//   │  └──────────────┘                                  │
//   ├────────────────────────────────────────────────────┤
//   │  ✨ PROMPT …          [Suggest] [Regen] [Use it]   │
//   └────────────────────────────────────────────────────┘
//
// The creative-tool three-zone layout: inputs left, canvas centre, output right,
// composer bottom. Two things fall out of it. The settings sit beside the image
// they describe instead of underneath it, and the bottom bar shrinks back to the
// one thing it should hold — the prompt — which is what let it be too wide and
// too heavy in the first place. The inspector shares the LEFT edge with edit
// mode's tool palette, so switching mode swaps the controls in place instead of
// throwing them across the modal; the chutier keeps the right edge to itself.
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
// flyout-submenu pattern). One sheet is open at a time, tracked by
// state.openPopover — that's the EDIT-mode flyouts. The generate panel's settings
// sections are independent and live in state.collapsedGroups.

import { escapeHtml } from "../../utils.js?v=21";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=33";
import { KEY } from "./context.js?v=18";
import * as imageStudio from "../../image-studio.js?v=54";

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

// The two provenances a reference image can have. Shared by the group labels and
// the collapsed header so the section can only ever call them the same thing.
const BRAND_GROUP = "Brand book";
const CUSTOM_GROUP = "Custom";

// Two lines, so the placeholder teaches the line break as well as the length.
const RENDER_TEXT_PLACEHOLDER = `Black Friday
−50% on everything`;

export function composer(st) {
  return st.mode === "edit" ? editComposer(st) : generateComposer(st);
}

// The floating inspector — the settings, beside the image rather than under it,
// on the stage's left edge (where edit mode also keeps its tools).
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
// its 180° rotation on `.collapsed`.
//
// NOT an accordion in behaviour, despite the DS class: a section the user opened
// stays open, and opening a second doesn't shut the first. One-at-a-time kept the
// panel short, but it also meant you could never see two settings at once and
// every section you'd opened shut itself behind your back. State lives in
// `collapsedGroups` — the same Set v1's composer already used, so the two studios
// track section state identically and `openPopover` goes back to meaning only what
// its name says: the edit-mode flyouts, which ARE one at a time.
//
// `pinned` opts a row out of that: it is always expanded and never collapses, so
// its header stops being a control — a static row rather than a <button>, with no
// chevron and no toggle hook. Nothing to press means nothing that can mislead, and
// it never enters `collapsedGroups` at all. The value still rides in the header:
// with the body open it is a summary of what's below ("Acme · 3") rather than a
// stand-in for it.
function settingRow({ name, label, value, body, open, set = false, disabled = false, pinned = false }) {
  const expanded = pinned || (open && !disabled);
  const head = `<span class="ap-accordion-title isv2-acc-title">${escapeHtml(label)}</span>
      <span class="isv2-acc-value${set ? " is-set" : ""}">${escapeHtml(value)}</span>`;
  return `<div class="ap-accordion isv2-acc${expanded ? "" : " collapsed"}${disabled ? " is-disabled" : ""}${pinned ? " isv2-acc--pinned" : ""}">
    ${
      pinned
        ? `<div class="ap-accordion-header isv2-acc-head isv2-acc-head--static">${head}</div>`
        : `<button type="button" class="ap-accordion-header isv2-acc-head" data-img-group-toggle="${name}" aria-expanded="${expanded}"${disabled ? " disabled" : ""}>
      ${head}
      ${disabled ? "" : `<i class="ap-icon-chevron-up ap-accordion-toggle" aria-hidden="true"></i>`}
    </button>`
    }
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
  return console_("Image prompt", promptField(st), generateActions(st), "to generate", {
    inline: true,
    aux: expandToggle(st),
    expanded: !!st.composerExpanded,
  });
}

// Doubles the field's height cap, 4 lines → 8. It holds the console's TOP-RIGHT
// corner while Generate stays on the field's last line, so the two controls read
// as what they are: one resizes the box, one runs what's in it. Hidden while the
// brief is being written — there is nothing to expand yet.
function expandToggle(st) {
  if (st.promptLoading) return "";
  const on = !!st.composerExpanded;
  const label = on ? "Collapse the prompt" : "Expand the prompt";
  return `<button type="button" class="ap-icon-button isv2-console-expand" data-img-composer-expand aria-pressed="${on}" aria-label="${label}" title="${label}"><i class="ap-icon-${on ? "minimize" : "maximize"}" aria-hidden="true"></i></button>`;
}

// The frame both modes share, and it IS the app's own conversational composer:
// a bordered card that lights up on focus, a borderless field, the action beside
// it, and a keyboard hint below the card. Same recipe as
// `.session__composer-card` — same border, same shadow, same padding rhythm, same
// focus behaviour — because the user is doing the same thing here (writing a
// brief for Archie) and it should not feel like a different product.
//
// What v2 grew instead and has now shed: an eyebrow, a "Suggest again" button
// and an expand toggle. The eyebrow only gave the field an identity that the
// composer's own frame already gives it; the expand solved a scrolling problem
// the composer solves with a line cap; and re-deriving the prompt now happens
// once, automatically, when the studio opens.
//
// `inline` puts the action BESIDE the field rather than on a row of its own,
// bottom-aligned so it stays on the field's last line. Both modes use it: a
// toolbar row of its own was a full row of card whose left half was empty, and
// the text would rather have that space. Kept as a flag, not baked in, because a
// console with several actions would need the row back.
function console_(label, field, action, hintVerb, { inline = false, aux = "", expanded = false } = {}) {
  const toolbar = aux || action ? `<div class="isv2-console-toolbar">${aux}${action}</div>` : "";
  return `<div class="isv2-dock">
    <div class="isv2-console-wrap">
      <div class="isv2-console${inline ? " isv2-console--inline" : ""}${expanded ? " is-expanded" : ""}" role="group" aria-label="${escapeHtml(label)}">
        ${field}
        ${toolbar}
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
    // `.gen-image-spinner` alone — NOT `.gen-loading-mark`, which is the 88px
    // canvas mark for the stage's empty state. Wearing it here put an 88px glyph
    // in a 36px field, where it overflowed the card and shoved the text sideways.
    return `<div class="isv2-prompt-loading" role="status">
      <span class="gen-image-spinner"></span>
      <span>Writing your image prompt…</span>
    </div>`;
  }
  return `<textarea id="isv2Prompt" class="isv2-prompt" data-img-prompt rows="2" placeholder="${escapeHtml(PROMPT_PLACEHOLDER)}" aria-label="Describe your image">${escapeHtml(st.promptText)}</textarea>`;
}

// The prompt card's own action — running the prompt. `secondary blue`: it is a
// step and not the destination, so it stays a tier below the modal's one primary
// ("Use this image", in the footer), and blue rather than orange because it's the
// routine action of this card rather than the spotlight moment. Before the footer
// existed this button had to carry both jobs, which is why it was orange.
//
// "Generate", not "Generate image": the card is labelled Image prompt and the modal
// is called Image Studio, so the noun was the third "image" in one corner.
function generateActions(st) {
  if (st.genPhase === "generating") {
    return `<button type="button" class="ap-button secondary blue loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>`;
  }
  // A prompt being rewritten isn't one you can run yet.
  const promptReady = !st.promptLoading && !!(st.promptText || "").trim();
  const hasResults = st.genPhase === "results" && st.variations.length > 0;
  const icon = hasResults ? "ap-icon-refresh" : "ap-icon-sparkles-mermaid";
  const label = hasResults ? "Regenerate" : "Generate";
  return `<button type="button" class="ap-button secondary blue" data-img-generate ${promptReady ? "" : "disabled"}><i class="${icon}"></i><span>${label}</span></button>`;
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
  // Sections are independent: a Set of what's shut, not a single "which one is open".
  const isOpen = (id) => !st.collapsedGroups.has(id);
  const out = [];

  // ONE References section. Brand kit used to be its own row above this one, and
  // that was a distinction without a difference: both hold images the generator
  // should look like. Where an image CAME from is a label on the tile, not a
  // reason for a second section — and split across two, the user had to check two
  // places to answer one question ("what is this going to look like?").
  //
  // Pinned open, the way Brand kit was: it's that same question, and a section you
  // re-open on every visit shouldn't be a section you have to open.
  const picked = imageStudio.selectedReference(st);
  out.push(
    settingRow({
      name: "refs",
      label: "References",
      value: refSource(picked, st),
      set: !!picked,
      pinned: true,
      body: () => refsBody(st, picked),
    }),
  );

  // Text in image — words the model paints into the artwork. It sits with the
  // references because both answer "what goes IN the image"; type / style /
  // format / output below are all treatment.
  const inImage = (st.renderText || "").trim();
  out.push(
    settingRow({
      name: "renderText",
      label: "Text in image",
      value: inImage ? shortRenderText(inImage) : "None",
      set: !!inImage,
      open: isOpen("renderText"),
      body: () => renderTextBody(st),
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
      open: isOpen("imageType"),
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
      open: isOpen("style"),
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
      open: isOpen("format"),
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
      open: isOpen("output"),
      body: () => outputBody(st, canCarousel, isCarousel),
    }),
  );

  return out.join("");
}

// What a picked reference is called in the collapsed header: its own label if it
// has one, else where it came from. "Brand board" beats "1 selected".
// The collapsed header answers WHERE the reference came from, not which file it
// is. "Product UI" told you a filename you already see in the grid below; the
// brand book's name tells you the thing you can't see from a thumbnail — whether
// this image is going to look on-brand or like something you dropped in.
function refSource(ref, st) {
  if (!ref) return "None";
  return ref.fromPlaybook ? st.playbookName || BRAND_GROUP : CUSTOM_GROUP;
}

// The merged section: both pools in one grid, brand book first, then the uploader.
// Every group is LABELLED, even when it's the only one — with the two sections
// gone, the label is the only thing left saying these images come from the
// Playbook's brand book rather than from somewhere the user chose. Naming the
// book also names the standard the generated image is being held to.
function refsBody(st, picked) {
  const pool = imageStudio.referencePool(st);
  const brand = pool.filter((r) => r.fromPlaybook);
  const mine = pool.filter((r) => !r.fromPlaybook);
  const selectedId = picked ? picked.id : null;
  const groups = [];
  if (brand.length) {
    // An em dash, not a middot: a Playbook name has middots of its own
    // ("Acme · Q2 marketing") and a third one made the label unparseable.
    const book = st.playbookName ? `${BRAND_GROUP} — ${st.playbookName}` : BRAND_GROUP;
    groups.push(refGroup(book, brand.map((r) => refTile(r, r.id === selectedId)).join("")));
  }
  if (mine.length) {
    groups.push(refGroup(CUSTOM_GROUP, mine.map((r) => refTile(r, r.id === selectedId)).join("")));
  }
  const capped = mine.length >= imageStudio.MAX_REFS;
  const dropzone = capped
    ? `<p class="isv2-sheet-hint">Maximum ${imageStudio.MAX_REFS} images. Remove one to add another.</p>`
    : // A button and a line under it, not a dashed drop panel. The panel was a
      // 64px-tall placeholder for an action that is one click, and it was the
      // biggest thing in a section whose subject is the images above it. Dropping
      // still works — `data-img-dropzone` rides on the button, and generate mode
      // accepts a drop anywhere in the modal anyway (see index.js#onDrop).
      `<div class="isv2-adder">
        <button type="button" class="ap-button stroked grey" data-img-dropzone data-img-ref-add>
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add an image</span>
        </button>
        <p class="isv2-sheet-hint">PNG, JPG or WebP · I'll match its look</p>
      </div>`;
  // The switch owns "no reference at all" — it was an 81px tile in the grid, which
  // is a lot of square for nothing, and a two-state choice is what a switch is. Off
  // hides the grid rather than leaving a picker that picks nothing: the switch IS
  // the disclosure.
  //
  // No dividers between the pieces: rules inside a section re-draw the boundary the
  // merge just removed. The group labels already separate the pools, and the
  // section's own frame separates it from Text in image below.
  const on = !!picked;
  return `<div class="isv2-sheet-switch">
      <span class="isv2-sheet-switch-label">Use a reference image</span>
      <label class="ap-toggle-container" title="Give the generator an image to match">
        <input type="checkbox" data-img-toggle-ref ${on ? "checked" : ""} aria-label="Use a reference image" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    ${on ? `${groups.join("")}${dropzone}` : ""}`;
}

function refGroup(label, tiles) {
  const head = label ? `<p class="isv2-refs-group">${escapeHtml(label)}</p>` : "";
  return `${head}<div class="isv2-refs">${tiles}</div>`;
}

// One candidate. SINGLE-SELECT: picking one drops whatever was picked before, so
// the marker is a radio dot, not a tick — a tick promises you can have several.
// `aria-pressed` and not `role="radio"`, because clicking the picked one clears
// it and a radio group can't be emptied; same single-select-with-toggle-off
// contract as Image type and Style preset. An upload also carries a remove
// button: it belongs to the user, whereas a Playbook image belongs to the
// Playbook and "not this one" is what deselecting already means.
function refTile(r, on) {
  const note = (r.note || "").trim();
  const nets = Array.isArray(r.networks) ? r.networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  const info = [on ? "The reference for this image" : "Use as the reference"];
  if (note) info.push(note);
  if (nets.length) info.push(`Best for ${nets.map((n) => NETWORK_LABEL[n] || n).join(", ")}`);
  const remove = r.fromPlaybook
    ? ""
    : `<button type="button" class="isv2-ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove this image"><i class="ap-icon-close" aria-hidden="true"></i></button>`;
  return `<div class="isv2-ref-slot">
    <button type="button" class="isv2-ref isv2-ref--pick${on ? " is-used" : " is-skipped"}" data-img-ref-toggle="${escapeHtml(r.id)}" aria-pressed="${on}" aria-label="${escapeHtml(info[0])}" title="${escapeHtml(info.join(" · "))}">
      <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
      <span class="isv2-ref-scrim" aria-hidden="true"></span>
      <span class="isv2-ref-radio" aria-hidden="true"></span>
    </button>
    ${remove}
  </div>`;
}

// The collapsed row's value has one line of a 284px panel to live in, beside a
// label that must stay readable — so it shows the headline's first line, clipped.
// The full text is one click away in the field itself.
function shortRenderText(text) {
  const first = text.split("\n")[0].trim();
  const rest = text.split("\n").length > 1;
  const clipped = first.length > 18 ? `${first.slice(0, 18).trimEnd()}…` : first;
  return rest && clipped === first ? `${clipped}…` : clipped;
}

// Text in image — a plain DS textarea field. The counter is a live node the input
// handler writes into (typing must not re-render the panel, or the caret dies), and
// the hint names the other thing the user might have meant: the movable text
// overlay in Edit, which is a different job on a finished image.
//
// "Edit" is a link straight to that tab — but ONLY once an image exists. The tab
// is disabled until then, so linking earlier would promise a place you can't go.
// It reuses `data-img-mode`, the mode tabs' own hook, so there's no second path
// into setMode to keep in step.
function renderTextBody(st) {
  const text = st.renderText || "";
  const hasImg = !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
  const editLink = hasImg
    ? `<button type="button" class="ap-link small isv2-hint-link" data-img-mode="edit">Edit</button>`
    : "Edit";
  return `<div class="ap-textarea-field narrow isv2-textfield">
      <textarea data-img-render-text rows="2" maxlength="${imageStudio.MAX_RENDER_TEXT}" placeholder="${escapeHtml(RENDER_TEXT_PLACEHOLDER)}" aria-label="Text to write into the image">${escapeHtml(text)}</textarea>
    </div>
    <p class="isv2-sheet-hint isv2-textfield-foot">
      <span>For a text box you can move, use Add text in ${editLink}.</span>
      <span class="isv2-textfield-count" data-img-render-text-count>${text.length}/${imageStudio.MAX_RENDER_TEXT}</span>
    </p>`;
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
    `<textarea class="isv2-prompt" data-img-edit-prompt rows="1" placeholder="Describe a change and I'll redraw it…" aria-label="Describe a change for AI to apply" ${busy}>${escapeHtml(st.editPrompt || "")}</textarea>`,
    `<button type="button" class="ap-button stroked grey" data-img-apply-edit="prompt" ${busy}><i class="ap-icon-sparkles-mermaid"></i><span>Redraw</span></button>`,
    "to redraw",
    { inline: true },
  );
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
      sheet: () => logoSheet(),
    }),
  ].join("");
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
    // Not `wide`: the stamp grid is on fixed 72px tracks now, so the sheet sizes
    // to the grid. Raising the cap only let it stretch the tiles.
  });
}
