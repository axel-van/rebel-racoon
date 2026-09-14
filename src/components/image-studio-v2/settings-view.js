// Image Studio — the seven option rows, and the controls inside them.
//
// They are the LEFT HALF of the generate stage (setup-stage.js hosts them, one card
// each). This module owns what a row is and what its body holds; where the rows sit
// is the stage's business. They used to be a 284px inspector pinned to the stage's
// left edge beside a mostly-empty canvas — `git log -S isv2-panel` has it.
//
// Row order is "what goes IN the image" first, then treatment:
//   References · Text in image · Branding   what the image is made of
//   Type · Style · Format · Output          how it gets made
//
// Each row is a DS `.ap-accordion` — THE CLASS, NOT THE BEHAVIOUR. Sections are
// independent: one you opened stays open, and opening a second doesn't shut the
// first. One-at-a-time kept the panel short but meant you could never see two
// settings at once and it closed things behind your back. State lives in
// `collapsedGroups` (a Set of what's SHUT), which leaves `openPopover` meaning
// only what its name says — the Edit-mode flyouts, which are one at a time.
//
// ── A note on class names ───────────────────────────────────────────────────
// `isv2-sheet-label`, `isv2-sheet-hint`, `isv2-sheet-switch` and
// `-switch-label` were written for the flyout SHEETS these sections replaced.
// They dress the panel now. `isv2-sheet-body` / `-title` still belong to the one
// real sheet left (the Add-image flyout, tools-view.js). The names stayed because
// renaming them means touching two stylesheets and four modules for something no
// user can see — this note is the disclosure instead.
//
// Hierarchy inside a row body is ONE binary: dark = it names the thing below it
// (`.isv2-sheet-label`, `.isv2-sheet-switch-label`), light = it is an aside about
// that thing (`.isv2-sheet-hint`). No second size and no bold — three bold labels
// stacked in a 260px column would shout over the section title.

import { escapeHtml } from "../../utils.js?v=1150";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=1150";
import { KEY } from "./context.js?v=1150";
import { REFS_TIP, refSummary, refsBody } from "./references-view.js?v=1150";
import { BRANDING_TIP, brandingBody } from "./branding-view.js?v=1150";
import * as imageStudio from "../../image-studio.js?v=1150";
import { typeArt } from "./type-art.js?v=1150";
import { styleArt } from "./style-art.js?v=1150";

// A thin rule between two clusters inside one row body. Shared with the
// Add-image sheet (tools-view.js), which is where the class name comes from.
export const sheetDivider = `<span class="isv2-sheet-divider" role="separator"></span>`;

// One setting = one DS Accordion section, expanding IN PLACE.
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
// `collapsedGroups`, which leaves `openPopover` meaning only what its name says:
// the edit-mode flyouts, which ARE one at a time.
//
// `pinned` opts a row out of that: it is always expanded and never collapses, so
// its header stops being a control — a static row rather than a <button>, with no
// chevron and no toggle hook. Nothing to press means nothing that can mislead, and
// it never enters `collapsedGroups` at all. The value still rides in the header:
// with the body open it is a summary of what's below ("Acme · 3") rather than a
// stand-in for it.
function settingRow({ name, label, value, tip = "", body, open, set = false, disabled = false, pinned = false }) {
  const expanded = pinned || (open && !disabled);
  // `tip` is an info icon beside the TITLE — where an annotation belongs, and where
  // it can sit next to a value rather than instead of one (References has both: a
  // summary worth reading and a section worth explaining).
  //
  // Title and icon share a wrapper that takes the free space, so everything after
  // it — the value, the chevron — keeps the right edge exactly as before. Without
  // it the DS's `flex: 1` on the title pushed the icon to the far side, and moving
  // that flex onto the icon's row would have stranded the chevron.
  //
  // aria-hidden because the row's header is a <button>: a focusable element inside
  // it would be a control inside a control, and folding the sentence into the
  // button's accessible name would make its label a paragraph. `data-tooltip` is the
  // DS tooltip (components/tooltip.js), not a native title — it mounts on <body> so
  // the panel's own scroll box can't clip it, and tabbing to the header shows it,
  // which a title never does.
  const head = `<span class="isv2-acc-label">
        <span class="ap-accordion-title isv2-acc-title">${escapeHtml(label)}</span>
        ${tip ? `<i class="ap-icon-info isv2-acc-info" data-tooltip="${escapeHtml(tip)}" aria-hidden="true"></i>` : ""}
      </span>
      ${value ? `<span class="isv2-acc-value${set ? " is-set" : ""}">${escapeHtml(value)}</span>` : ""}`;
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

// "Best for <network icon>" — the app-wide convention: the words, then the
// icon; the spelled-out name rides in title/aria-label, never inline.
function bestFor(network) {
  if (!network) return "";
  const label = NETWORK_LABEL[network] || network;
  const icon = NETWORK_ICON_BY_PLATFORM[network];
  const glyph = icon ? `<i class="${icon}" title="${escapeHtml(label)}" aria-hidden="true"></i>` : escapeHtml(label);
  return `<p class="isv2-sheet-hint" aria-label="Best for ${escapeHtml(label)}">Best for ${glyph}</p>`;
}

// The seven rows, each tagged with its own name.
//
// Returned as tagged entries (not one concatenated string) so the host can address a
// row by `name` rather than by index: setup-stage renders each as its own card, and the
// tag is what let the short-lived two-group layout pick rows out. The order is the
// meaning — References / Text / Branding is what goes IN the image, Type / Style /
// Format / Output is how it's made — carried by the sequence, never by a caption.
export function settingRowEntries(st) {
  // Sections are independent: a Set of what's shut, not a single "which one is open".
  const isOpen = (id) => !st.collapsedGroups.has(id);
  const out = [];
  const row = (cfg) => out.push({ name: cfg.name, html: settingRow(cfg) });

  // ONE References section. Brand kit used to be its own row above this one, and
  // that was a distinction without a difference: both hold images the generator
  // should look like. Where an image CAME from is a label on the tile, not a
  // reason for a second section — and split across two, the user had to check two
  // places to answer one question ("what is this going to look like?").
  //
  // Pinned open, the way Brand kit was: it's that same question, and a section you
  // re-open on every visit shouldn't be a section you have to open.
  const picked = imageStudio.selectedReference(st);
  row({
    name: "refs",
    label: "References",
    tip: REFS_TIP,
    value: refSummary(picked, st),
    set: !!picked,
    pinned: true,
    body: () => refsBody(st, picked),
  });

  // Text in image — words the model paints into the artwork. It sits with the
  // references because both answer "what goes IN the image"; type / style /
  // format / output below are all treatment.
  row({
    name: "renderText",
    label: "Text in image",
    tip: RENDER_TEXT_TIP,
    open: isOpen("renderText"),
    body: () => renderTextBody(st),
  });

  // Branding — the Playbook's logo, stamped on the artwork. Third in the "what
  // goes IN the image" run (references / words / mark) before the treatment
  // settings below. Disabled rather than hidden when the Playbook has no mark: a
  // missing section leaves you wondering whether the feature exists, a disabled
  // one tells you where to go and get it.
  const hasLogo = !!st.playbookLogo;
  const hasColors = (st.playbookColors || []).length > 0;
  const branded = hasLogo && !!st.useBranding;
  const tinted = hasColors && !!st.useBrandColors;
  // The header value NAMES which half is on, because they're now independently
  // switchable and "On" would hide the difference between a stamped mark and a
  // colour brief. Both on is the Playbook's name — the whole brand kit, said the
  // short way.
  let brandValue = "Off";
  if (!hasLogo && !hasColors) brandValue = "No brand kit";
  else if (branded && tinted) brandValue = st.playbookName || "On";
  else if (branded) brandValue = "Logo only";
  else if (tinted) brandValue = "Colors only";
  row({
    name: "branding",
    label: "Branding",
    tip: BRANDING_TIP,
    value: brandValue,
    set: branded || tinted,
    disabled: !hasLogo && !hasColors,
    open: isOpen("branding"),
    body: () => brandingBody(st, branded, tinted),
  });

  // Image type — what the image is FOR. A distinct dimension from the style.
  const typeLabel = st.imageTypeKey
    ? imageStudio.IMAGE_TYPES.find((o) => o.key === st.imageTypeKey)?.label || "Any"
    : "Any";
  row({
    name: "imageType",
    label: "Type",
    value: typeLabel,
    set: !!st.imageTypeKey,
    open: isOpen("imageType"),
    body: () => imageTypeBody(st),
  });

  // Style preset — the aesthetic look. Mutually exclusive with references: when
  // refs guide the look, the row switches off and says why instead.
  const hasRefs = st.referenceImages.length > 0;
  const styleLabel = st.styleKey ? imageStudio.STYLE_PRESETS.find((o) => o.key === st.styleKey)?.label || "Any" : "Any";
  row({
    name: "style",
    label: "Style",
    value: hasRefs ? "From references" : styleLabel,
    set: !hasRefs && !!st.styleKey,
    disabled: hasRefs,
    open: isOpen("style"),
    body: () => styleBody(st),
  });

  // Format — the value says the shape ("1:1 · Square"); the ratio glyphs live in
  // the sheet, where they actually help you choose.
  const choices = imageStudio.formatChoices(KEY);
  const cur = choices.find((f) => f.id === st.formatId);
  row({
    name: "format",
    label: "Format",
    value: cur ? `${cur.tag} · ${cur.label}` : "Aspect ratio",
    set: false, // format always has a value; "set" would be meaningless here
    open: isOpen("format"),
    body: () => formatBody(st, choices),
  });

  // Output — single vs carousel, merged with its count control.
  const canCarousel = imageStudio.supportsCarousel(st.network);
  const isCarousel = canCarousel && st.outputMode === "carousel";
  row({
    name: "output",
    label: canCarousel ? "Output" : "Variations",
    value: isCarousel
      ? `Carousel · ${st.slideCount}`
      : `${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}`,
    set: isCarousel,
    open: isOpen("output"),
    body: () => outputBody(st, canCarousel, isCarousel),
  });

  return out;
}

// Text in image — a plain DS textarea field, and nothing under it until something
// is wrong. The permanent `54/90` counter was a meter for a limit you hit once in
// twenty drafts, sitting in a panel that is short of room; now the field says
// nothing while the text fits and raises a DS form message when it doesn't.
//
// The message node is always in the DOM, hidden inline, because typing must not
// re-render the panel (the row would be rebuilt under the caret) — the input handler
// writes into it. Inline `display`, not `[hidden]`: `.ap-form-message` carries
// `display: flex`, which beats the attribute.
//
// The line that used to sit beside the counter — naming the OTHER thing the user
// might have meant, the movable text overlay in Edit — is now the header's info
// tooltip. It was a permanent two-line footnote for a fact you need once, in a panel
// that is short of room; the counter is the only thing here that changes as you
// type, so it is the only thing that earns a standing line.
//
// Casualty worth knowing about: that sentence carried a live link into the Edit tab
// (enabled only once an image existed). A title tooltip can't hold a link, so the
// path is now the Edit tab in the modal header — one click either way.
const RENDER_TEXT_TIP = "For a text box you can move, use Add text in Edit.";

// Two lines, so the placeholder teaches the line break as well as the length.
const RENDER_TEXT_PLACEHOLDER = `Black Friday
−50% on everything`;

function renderTextBody(st) {
  const text = st.renderText || "";
  return `<div class="ap-textarea-field narrow isv2-textfield">
      <textarea data-img-render-text rows="2" placeholder="${escapeHtml(RENDER_TEXT_PLACEHOLDER)}" aria-label="Text to write into the image">${escapeHtml(text)}</textarea>
    </div>
    <p class="ap-form-message error" data-img-render-text-msg role="status"${imageStudio.renderTextOverMessage(text) ? "" : ` style="display:none"`}>${escapeHtml(imageStudio.renderTextOverMessage(text))}</p>`;
}

// ── The drawn option art ─────────────────────────────────────────────────────
//
// Type and Style are two different questions, so they get two different KINDS of
// picture — otherwise nine cards in two neighbouring sections read as one choice
// with nine branches, when the panel's own comment says Type is "a distinct
// dimension from the style":
//
//   Type  = the IMAGE. What this type produces — a backlit shot with a headline, a
//           data poster, a flat landscape. Three subjects. `type-art.js`.
//   Style = the TREATMENT. One held-still subject — a hero object and two lines of
//           text — rendered six ways. `style-art.js`.
//
// Both are inline SVG with every colour in CSS; the reasoning lives with each module.
// The `.isv2-art` span is only the fallback frame for a catalogue key with no drawing.
function optionArt(family, key) {
  return family === "type" ? typeArt(key) : styleArt(key);
}

// The selection marker for BOTH: a radio DOT, not a tick.
//
// references-view.js states the contract — single-select WITH toggle-off gets
// `aria-pressed` + a dot, because "a tick promises you can have several". Type and
// Style are exactly that shape (`s.x === key ? null : key`), so Style's old tick was
// the odd one out and Type had no marker at all. Always rendered, empty when off
// (like the reference tiles): an empty ring says a choice is on offer, and the card
// keeps the same parts whether or not it is picked, so nothing shifts on select.
const pickMark = `<span class="isv2-pickmark" aria-hidden="true"></span>`;

// One card renderer, two catalogues. Same frame (`.gen-style-card`: border, hover,
// focus-visible, selected) so a Type card and a Style card are the same object with
// different art inside.
function optionCard({ family, hook, key, label, tip, selected }) {
  return `<button type="button" class="gen-style-card${selected ? " is-selected" : ""}" ${hook}="${escapeHtml(key)}"
    aria-pressed="${selected}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">
    <span class="gen-style-thumb">${optionArt(family, key)}${pickMark}</span>
    <span class="gen-style-name">${escapeHtml(label)}</span>
  </button>`;
}

function imageTypeBody(st) {
  const cards = imageStudio.IMAGE_TYPES.map((o) =>
    optionCard({
      family: "type",
      hook: "data-img-image-type",
      key: o.key,
      label: o.label,
      // `desc` stays out of the card face and rides in the tooltip: the art does that
      // job now, and a second caption line nearly doubles the row's height at 79px to
      // restate the picture.
      tip: `${o.label} · ${o.desc}`,
      selected: st.imageTypeKey === o.key,
    }),
  ).join("");
  return `<div class="gen-style-grid isv2-type-grid">${cards}</div>`;
}

function styleBody(st) {
  const cards = imageStudio.STYLE_PRESETS.map((o) =>
    optionCard({
      family: "look",
      hook: "data-img-style",
      key: o.key,
      label: o.label,
      tip: o.label,
      selected: st.styleKey === o.key,
    }),
  ).join("");
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
