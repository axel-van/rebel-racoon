// Image Studio — generate-mode left panel render. Pure string builders driven by
// the studio state: the prompt lead + "Ingredients" (brand kit / reference
// images) + Visual style / Mood / Format / Output sections. `generateControls`
// is the single entry point the shell composes into the panel.

import { escapeHtml } from "../../utils.js?v=21";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=26";
import { KEY } from "./context.js?v=9";
import * as imageStudio from "../../image-studio.js?v=35";

// Left panel — generate mode: the reglages only (reference / style / mood /
// format / variations). The prompt lead moved to the floating bottom composer
// (see shell-view generateComposer), so the panel holds settings alone.
export function generateControls(st) {
  return composeGroups(st);
}

// "Suggest from this post" — an AI helper that drafts the prompt from the draft's
// text. It followed the prompt out of the panel; shell-view places it just above
// the bottom composer, so it's exported here.
export function deriveButton(st) {
  const label = st.promptLoading
    ? `<span class="gen-spinner"></span><span>Suggesting from this post…</span>`
    : `<i class="ap-icon-archie-official" aria-hidden="true"></i><span>Suggest from this post</span>`;
  return `<button type="button" class="image-studio__derive" data-img-derive ${st.promptLoading ? "disabled" : ""}>${label}</button>`;
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

function formatChip(f, selected) {
  return `<button type="button" class="gen-format-chip${selected ? " is-selected" : ""}" data-img-format="${escapeHtml(f.id)}" aria-pressed="${selected}">
    <span class="gen-format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>
    <span class="gen-format-meta">
      <span class="gen-format-tag">${escapeHtml(f.tag)}</span>
      <span class="gen-format-name">${escapeHtml(f.label)}</span>
    </span>
  </button>`;
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

// A generate-panel section that collapses to a single row. `summary` is the
// current value, shown muted at the right of the header so a collapsed section
// still tells you its state (Refactoring UI: de-emphasized value beside the
// label). When `disabled`, the section can't be expanded and shows
// `disabledHint` instead of the value + chevron — used to switch Visual style
// off while references drive the look.
function collapsibleGroup(st, { id, label, summary = "", body, disabled = false, disabledHint = "" }) {
  const collapsed = disabled || st.collapsedGroups.has(id);
  const right =
    disabled && disabledHint
      ? `<span class="image-studio__group-note">${escapeHtml(disabledHint)}</span>`
      : `${summary ? `<span class="image-studio__group-summary">${escapeHtml(summary)}</span>` : ""}<i class="ap-icon-chevron-down image-studio__group-chevron" aria-hidden="true"></i>`;
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
    ? `<div class="image-studio__ingredient-body"><div class="image-studio__refs">${tiles}</div></div>`
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
  const summary = uploads.length ? `${uploads.length} added` : "";
  return `<div class="image-studio__ingredient image-studio__ingredient--refs${collapsed ? " is-collapsed" : ""}">
    <button type="button" class="image-studio__ingredient-head" data-img-group-toggle="refs" aria-expanded="${!collapsed}">
      <i class="ap-icon-file--image image-studio__ingredient-icon" aria-hidden="true"></i>
      <span class="image-studio__ingredient-title">Reference images</span>
      ${summary ? `<span class="image-studio__group-summary">${escapeHtml(summary)}</span>` : ""}
      <i class="ap-icon-chevron-down image-studio__group-chevron" aria-hidden="true"></i>
    </button>
    <div class="image-studio__ingredient-body"${collapsed ? " hidden" : ""}>
      ${dropzone(st)}
      ${uploadTiles ? `<div class="image-studio__refs">${uploadTiles}</div>` : ""}
    </div>
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
  // Reference inputs are framed as "Ingredients": a Brand kit toggle (Playbook
  // brand set as use/skip tiles) + a collapsible Reference images drop target.
  const hasUsedRefs = st.referenceImages.length > 0;
  const ingredients = ingredientsSection(st);

  // Visual style is mutually exclusive with reference images — when refs guide
  // the look, this section switches off and folds away. Collapsed, its header
  // carries the picked style (or "Any") so the value stays visible.
  const styleLabel = st.styleKey
    ? st.styleKey === "custom"
      ? "Your style"
      : imageStudio.STYLE_OPTIONS.find((o) => o.key === st.styleKey)?.label || "Custom"
    : "Any";
  const styleGroup = collapsibleGroup(st, {
    id: "style",
    label: "Visual style",
    summary: styleLabel,
    body: `<div class="gen-style-grid">${styleCards(st)}</div>`,
    disabled: hasUsedRefs,
    disabledHint: "Guided by your reference images",
  });

  const moodLabel = st.moodKey ? imageStudio.MOOD_OPTIONS.find((o) => o.key === st.moodKey)?.label || "Any" : "Any";
  const moodGroup = collapsibleGroup(st, {
    id: "mood",
    label: "Mood",
    summary: moodLabel,
    body: `<div class="image-studio__chips">${moodChips(st)}</div>`,
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
    body: `<p class="image-studio__count image-studio__count--net"${st.network ? ` aria-label="Best for ${escapeHtml(netLabel)}"` : ""}>${fmtHint}</p><div class="gen-format-chips">${fmtChips}</div>`,
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
  return `${ingredients}${styleGroup}${moodGroup}${formatGroup}${outputGroup}`;
}
