// Image Studio — generate-mode left panel render. The panel IS the flow, in the
// order the user works: (1) review the prompt Archie wrote from the draft, (2)
// adjust settings if needed — brand kit / reference images / image type / style
// preset / format / output, each collapsed to its current value. Step 3 is the
// footer's Generate CTA (see shell-view). `generateControls` is the single entry
// point the shell composes into the panel.

import { escapeHtml } from "../../utils.js?v=21";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=26";
import { KEY } from "./context.js?v=14";
import * as imageStudio from "../../image-studio.js?v=40";

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

// Left panel — generate mode: the prompt lead, then the settings.
export function generateControls(st) {
  return `${promptCard(st)}${composeGroups(st)}`;
}

// Step 1 — the prompt. Archie drafts it from the post on open, so the card leads
// with what he wrote and the user's job is to review it. While he's writing, the
// card itself holds the loader (the canvas keeps its empty state) so the layout
// is legible from the first frame.
function promptCard(st) {
  const expanded = !!st.composerExpanded;
  const expandLabel = expanded ? "Collapse prompt" : "Expand prompt";
  const body = st.promptLoading
    ? `<div class="image-studio__prompt-loading" role="status">
        <span class="gen-image-spinner gen-loading-mark"></span>
        <span class="image-studio__prompt-loading-text">Writing your image prompt…</span>
      </div>`
    : `<div class="image-studio__prompt">
        <i class="ap-icon-sparkles-mermaid image-studio__ai-icon" aria-hidden="true"></i>
        <textarea id="imgStudioPrompt" class="image-studio__reprompt-field" data-img-prompt rows="3" placeholder="${escapeHtml(PROMPT_PLACEHOLDER)}" aria-label="Describe your image">${escapeHtml(st.promptText)}</textarea>
        <button type="button" class="ap-button ghost grey image-studio__prompt-expand" data-img-composer-expand aria-label="${expandLabel}" title="${expandLabel}" aria-pressed="${expanded}"><i class="ap-icon-${expanded ? "minimize" : "maximize"}" aria-hidden="true"></i></button>
      </div>`;
  return `<div class="image-studio__group image-studio__group--prompt">
    <p class="image-studio__group-label image-studio__group-label--eyebrow"><span class="image-studio__step">1</span>Your prompt</p>
    ${body}
    ${deriveButton(st)}
  </div>`;
}

// The AI helper that (re)writes the prompt from the draft. It runs automatically
// on open, so once there's text it reads as a redo rather than a first action.
function deriveButton(st) {
  if (st.promptLoading) {
    return `<button type="button" class="image-studio__derive" data-img-derive disabled><span class="gen-spinner"></span><span>Writing from this post…</span></button>`;
  }
  const label = (st.promptText || "").trim() ? "Suggest again" : "Suggest from this post";
  return `<button type="button" class="image-studio__derive" data-img-derive><i class="ap-icon-archie-official" aria-hidden="true"></i><span>${label}</span></button>`;
}

// Image type — light filter chips (the label is self-explanatory; the short
// description rides in the tooltip). Single-select, toggle-off.
function imageTypeChips(st) {
  return imageStudio.IMAGE_TYPES.map((o) => {
    const sel = st.imageTypeKey === o.key;
    const tip = `${o.label} · ${o.desc}`;
    return `<button type="button" class="ap-filter-chip" data-img-image-type="${escapeHtml(o.key)}" aria-pressed="${sel}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${escapeHtml(o.label)}</button>`;
  }).join("");
}

// Style preset — thumbnail cards (a small preview hints the aesthetic look) +
// label. Single-select, toggle-off.
function stylePresetCards(st) {
  return imageStudio.STYLE_PRESETS.map((o) => {
    const sel = st.styleKey === o.key;
    return `<button type="button" class="gen-style-card${sel ? " is-selected" : ""}" data-img-style="${escapeHtml(o.key)}" aria-pressed="${sel}" title="${escapeHtml(o.label)}">
      <span class="gen-style-thumb">
        <img src="https://picsum.photos/seed/archie-style-${escapeHtml(o.key)}/220/170" alt="" loading="lazy" />
        ${sel ? `<span class="gen-style-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </span>
      <span class="gen-style-name">${escapeHtml(o.label)}</span>
    </button>`;
  }).join("");
}

// Format — a light filter chip per ratio: a small aspect-ratio glyph (portrait vs
// landscape at a glance) + the ratio tag. The full name (Square/Portrait/…) rides
// in the tooltip + the collapsed group summary, so the chips stay compact.
function formatChip(f, selected) {
  const full = `${f.tag} · ${f.label}`;
  return `<button type="button" class="ap-filter-chip image-studio__format-chip" data-img-format="${escapeHtml(f.id)}" aria-pressed="${selected}" title="${escapeHtml(full)}" aria-label="${escapeHtml(full)}"><span class="image-studio__format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>${escapeHtml(f.tag)}</button>`;
}

// Playbook reference tile — an explicit include/exclude control. The whole tile
// is the toggle; the checkbox tick (present vs absent — a shape signal, not
// colour alone) plus a desaturating scrim on skip make the two states clear
// without a worded pill crowding every thumbnail. Note + target networks ride
// in the tile's tooltip.
function playbookRefTile(r, on, capReached) {
  const lockedOff = !on && capReached;
  const note = (r.note || "").trim();
  const nets = Array.isArray(r.networks) ? r.networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  const stateWord = on ? "Used in this image" : "Skipped";
  const infoParts = [stateWord];
  if (note) infoParts.push(note);
  if (nets.length) infoParts.push(`Best for ${nets.map((n) => NETWORK_LABEL[n] || n).join(", ")}`);
  const infoText = infoParts.join(" · ");
  return `<button type="button" class="image-studio__ref image-studio__ref--pick${on ? " is-used" : " is-skipped"}" data-img-ref-toggle="${escapeHtml(r.id)}" aria-pressed="${on}" aria-label="${escapeHtml(stateWord)} — tap to toggle"${lockedOff ? " disabled" : ""} title="${escapeHtml(infoText)}">
    <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
    <span class="image-studio__ref-scrim" aria-hidden="true"></span>
    <span class="image-studio__ref-box" aria-hidden="true">${on ? `<i class="ap-icon-check"></i>` : ""}</span>
  </button>`;
}

function uploadRefTile(r) {
  return `<div class="image-studio__ref">
    <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
    <button type="button" class="image-studio__ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove reference"><i class="ap-icon-close" aria-hidden="true"></i></button>
  </div>`;
}

// ── The settings row ─────────────────────────────────────────────────────────
// Every setting is the SAME row: a three-column grid of
//   [ label ] [ current value, right-aligned ] [ 32px trailing control ]
// so the six rows share one left edge, one value column and one right edge. The
// trailing column is a fixed 32px because that's the DS toggle's exact width —
// it lets the chevrons and the brand-kit switch land on the same axis even
// though each row is its own grid. Label and value both ellipsis rather than
// wrap: the rail narrows to 320px and a wrapped label breaks the row rhythm.
//
// `summary` is the current value (Refactoring UI: the de-emphasized value beside
// its label, so a folded row still reads). `disabled` swaps the value + chevron
// for a quieter hint — used to switch Style preset off while references drive
// the look.
function collapsibleGroup(st, { id, label, summary = "", body, disabled = false, disabledHint = "" }) {
  const collapsed = disabled || st.collapsedGroups.has(id);
  const right =
    disabled && disabledHint
      ? `<span class="image-studio__group-note">${escapeHtml(disabledHint)}</span>`
      : `<span class="image-studio__group-summary">${escapeHtml(summary)}</span>
         <i class="ap-icon-chevron-down image-studio__group-chevron" aria-hidden="true"></i>`;
  return `<div class="image-studio__group is-collapsible${collapsed ? " is-collapsed" : ""}${disabled ? " is-disabled" : ""}">
    <button type="button" class="image-studio__group-head" data-img-group-toggle="${id}" aria-expanded="${!collapsed}"${disabled ? " disabled" : ""}>
      <span class="image-studio__group-label">${label}</span>
      ${right}
    </button>
    <div class="image-studio__group-body"${collapsed ? " hidden" : ""}>${body}</div>
  </div>`;
}

// Brand kit — the one row whose trailing control is a switch, not a chevron.
// The switch IS the disclosure (off = no brand images in play, so there's
// nothing to show); a chevron next to it was a second control for the same job.
// The head is a <div>, not a <button>: the DS switch is interactive content and
// would be invalid nested in one.
function brandKitGroup(st) {
  const brand = st.playbookName || "Playbook";
  const on = !!st.usePlaybookRefs;
  const usedIds = new Set(st.referenceImages.map((r) => r.id));
  const capReached = st.referenceImages.length >= imageStudio.MAX_REFS;
  const usedCount = (st.playbookRefs || []).filter((r) => usedIds.has(r.id)).length;
  const tiles = (st.playbookRefs || []).map((r) => playbookRefTile(r, usedIds.has(r.id), capReached)).join("");
  // The brand name is the value, not part of the label — it's what varies.
  const summary = on ? `${brand} · ${usedCount} image${usedCount === 1 ? "" : "s"}` : brand;
  return `<div class="image-studio__group${on ? " is-on" : ""}">
    <div class="image-studio__group-head">
      <span class="image-studio__group-label">Brand kit</span>
      <span class="image-studio__group-summary">${escapeHtml(summary)}</span>
      <label class="ap-toggle-container image-studio__group-switch" title="Use your brand kit">
        <input type="checkbox" data-img-toggle-playbook-refs ${on ? "checked" : ""} aria-label="Use ${escapeHtml(brand)} brand kit" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    <div class="image-studio__group-body"${on ? "" : " hidden"}><div class="image-studio__refs">${tiles}</div></div>
  </div>`;
}

// Compact single-row drop target: the whole bar opens the file picker and
// accepts drops (both hooks live on one element). One image matches its style;
// two or more blend into a new look — carried in the sub-line, not a separate
// paragraph.
function dropzone(st) {
  if (st.referenceImages.length >= imageStudio.MAX_REFS) {
    return `<p class="image-studio__dropzone-sub">Maximum ${imageStudio.MAX_REFS} reference images reached.</p>`;
  }
  return `<button type="button" class="image-studio__dropzone" data-img-dropzone data-img-ref-add>
    <i class="ap-icon-plus image-studio__dropzone-icon" aria-hidden="true"></i>
    <span class="image-studio__dropzone-text">
      <span class="image-studio__dropzone-title">Drop or click to add images</span>
      <span class="image-studio__dropzone-sub">PNG, JPG, WebP · one matches its style, more blend a new look</span>
    </span>
  </button>`;
}

function composeGroups(st) {
  const hasUsedRefs = st.referenceImages.length > 0;
  // Step 2 heads EVERY setting below — Archie has already picked defaults, so
  // this whole block is the optional detour.
  const eyebrow = `<p class="image-studio__group-label image-studio__group-label--eyebrow image-studio__group-label--step2"><span class="image-studio__step">2</span>Settings</p>`;

  // What goes in: the Playbook's brand set (switch) + the user's own uploads.
  const hasPlaybookRefs = Array.isArray(st.playbookRefs) && st.playbookRefs.length > 0;
  const brandKit = hasPlaybookRefs ? brandKitGroup(st) : "";
  const uploads = st.referenceImages.filter((r) => !r.fromPlaybook);
  const uploadTiles = uploads.map(uploadRefTile).join("");
  const refsGroup = collapsibleGroup(st, {
    id: "refs",
    label: "References",
    summary: uploads.length ? `${uploads.length} added` : "None",
    body: `${dropzone(st)}${uploadTiles ? `<div class="image-studio__refs">${uploadTiles}</div>` : ""}`,
  });

  // Image type — what the image is for (hook / infographic / illustration). A
  // distinct dimension from the style; not tied to the reference images.
  const imageTypeLabel = st.imageTypeKey
    ? imageStudio.IMAGE_TYPES.find((o) => o.key === st.imageTypeKey)?.label || "Any"
    : "Any";
  const imageTypeGroup = collapsibleGroup(st, {
    id: "imageType",
    label: "Image type",
    summary: imageTypeLabel,
    body: `<div class="image-studio__chips">${imageTypeChips(st)}</div>`,
  });

  // Style preset — the aesthetic look. Mutually exclusive with reference images:
  // when refs guide the look, this section switches off and folds away. Collapsed,
  // its header carries the picked preset (or "Any").
  const styleLabel = st.styleKey ? imageStudio.STYLE_PRESETS.find((o) => o.key === st.styleKey)?.label || "Any" : "Any";
  const styleGroup = collapsibleGroup(st, {
    id: "style",
    label: "Style preset",
    summary: styleLabel,
    body: `<div class="gen-style-grid">${stylePresetCards(st)}</div>`,
    disabled: hasUsedRefs,
    disabledHint: "From your references",
  });

  // Format — the collapsed summary is the picked ratio ("1:1 · Square"); the
  // "Best for" hint moves inside the body as a caption above the cards. The hint
  // follows the app-wide convention: the words "Best for" then the network icon
  // (never the spelled-out name — that rides in title/aria-label).
  const choices = imageStudio.formatChoices(KEY);
  const curFmt = choices.find((f) => f.id === st.formatId);
  const fmtSummary = curFmt ? `${curFmt.tag} · ${curFmt.label}` : "Aspect ratio";
  const netLabel = st.network ? NETWORK_LABEL[st.network] || st.network : "";
  const netIcon = st.network ? NETWORK_ICON_BY_PLATFORM[st.network] : null;
  const fmtHint = st.network
    ? `Best for ${netIcon ? `<i class="${netIcon}" title="${escapeHtml(netLabel)}" aria-hidden="true"></i>` : escapeHtml(netLabel)}`
    : "Pick an aspect ratio";
  const fmtChips = choices.map((f) => formatChip(f, st.formatId === f.id)).join("");
  const formatGroup = collapsibleGroup(st, {
    id: "format",
    label: "Format",
    summary: fmtSummary,
    body: `<p class="image-studio__count image-studio__count--net"${st.network ? ` aria-label="Best for ${escapeHtml(netLabel)}"` : ""}>${fmtHint}</p><div class="image-studio__chips">${fmtChips}</div>`,
  });

  // Output — merges the type toggle (single / carousel) with its count control
  // (Variations for a single image, Slides for a carousel) in one section. Only
  // networks that support carousels get the toggle (LinkedIn / Instagram).
  const carousel = imageStudio.supportsCarousel(st.network);
  const isCarousel = carousel && st.outputMode === "carousel";
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
  const outSummary = isCarousel
    ? `Carousel · ${st.slideCount} slides`
    : `${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}`;
  const outputGroup = collapsibleGroup(st, {
    id: "output",
    label: carousel ? "Output" : "Variations",
    summary: outSummary,
    body: carousel
      ? `${outputChips}<p class="image-studio__subgroup-label">${countLabel}</p>${countChips}`
      : countChips,
  });
  return `${eyebrow}${brandKit}${refsGroup}${imageTypeGroup}${styleGroup}${formatGroup}${outputGroup}`;
}
