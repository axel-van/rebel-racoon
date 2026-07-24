// Image Studio — the top-level render shell. One persistent two-column layout for
// both modes: a controls PANEL on the left (generate mode only) and a shared
// CANVAS on the right (preview / variations / working image). A top segmented
// control switches the two peer modes; "Edit" unlocks once an image exists.
// This module owns the shell + the shared canvas states (generating / results /
// in-feed preview) + the footer; it delegates the generate panel to compose-view
// and the edit canvas + action bar to edit-view.

import { html, raw, escapeHtml } from "../../utils.js?v=21";
import { getPosts } from "../../posts-store.js?v=36";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=26";
import { renderPostCard } from "../post-card.js?v=68";
import { KEY, ctx } from "./context.js?v=10";
import { generateControls, deriveButton } from "./compose-view.js?v=13";
import { actionBar, toolPalette, editCanvas } from "./edit-view.js?v=24";
import { compositeOverlays } from "./canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=36";

// Empty-state hint for the prompt composer — a full structured brief, so the
// placeholder itself shows the kind of rich prompt the box is built for (and why
// the expand toggle exists). Shown only when the field is empty.
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

// In-feed preview — the edit canvas layers logo/text overlays as live DOM over the
// image, but the post-card preview can't (it just takes an image URL), so overlays
// wouldn't show. We flatten (base image + overlays) into a PNG and feed the card
// that. compositeOverlays is async while render is sync, so we memoise by a
// signature of the flatten inputs and re-render once it lands; the plain image
// shows meanwhile. Only one studio is open at a time (KEY is constant), so a
// module-level cache suffices.
let previewComposite = null; // { sig, url }
let previewPendingSig = null;

const overlaySig = (img, overlays) => JSON.stringify([img.url, img.w, img.h, overlays]);

function compositedPreviewUrl(img, overlays) {
  const sig = overlaySig(img, overlays);
  if (previewComposite && previewComposite.sig === sig) return previewComposite.url;
  if (previewPendingSig !== sig) {
    previewPendingSig = sig;
    compositeOverlays(img.url, overlays, img.w, img.h)
      .then((url) => {
        previewComposite = { sig, url };
        previewPendingSig = null;
        imageStudio.notifyOverlays(KEY); // re-render → swaps the plain image for the flattened one
      })
      .catch(() => {
        previewPendingSig = null;
      });
  }
  return img.url; // fall back to the plain image until the composite lands
}

export function renderStudio(st) {
  // Edit mode is a direct editor: a full-width canvas with a floating action bar
  // + on-canvas manipulation (no left panel). Generate keeps its 2-column
  // options-panel + canvas layout.
  const workspace =
    st.mode === "edit"
      ? `<section class="image-studio__canvas" aria-label="Preview">${canvasContent(st)}</section>`
      : `<aside class="image-studio__panel" aria-label="Generation options">${generateControls(st)}</aside>
         <section class="image-studio__canvas" aria-label="Preview">${canvasContent(st)}</section>`;
  return html`
    <div class="image-studio image-studio--${st.mode}">
      ${raw(topBar(st))}
      <div class="image-studio__workspace">${raw(workspace)}</div>
      ${raw(footer(st))}
    </div>
  `;
}

function topBar(st) {
  // Edit acts on the working image; the in-feed preview is a right-pane view
  // toggle (see canvasViewToggle), not a mode.
  const hasImg = !!st.currentImage;
  const editState = (st.mode === "edit" ? " active" : "") + (hasImg ? "" : " disabled");
  const lockedAttrs = hasImg ? "" : 'disabled title="Generate an image first"';
  // Classic DS modal header (.ap-dialog-header / .ap-dialog-title); the × is the
  // .ap-dialog-close in the shell. DS Tabs (.ap-tabs) sit under it as the peer
  // modes, used natively.
  return `<div class="ap-dialog-header image-studio__header">
      <span class="ap-dialog-title image-studio__title"><i class="ap-icon-archie-official" aria-hidden="true"></i>Image Studio</span>
    </div>
    <div class="ap-tabs image-studio__modes">
      <div class="ap-tabs-nav" role="tablist" aria-label="Studio mode">
        <button type="button" class="ap-tabs-tab${st.mode === "generate" ? " active" : ""}" role="tab" aria-selected="${st.mode === "generate"}" data-img-mode="generate"><span>Generate</span></button>
        <button type="button" class="ap-tabs-tab${editState}" role="tab" aria-selected="${st.mode === "edit"}" data-img-mode="edit" ${lockedAttrs}><span>Edit</span></button>
      </div>
    </div>`;
}

// A compact segmented pill at the top of the right pane, flipping between the
// plain image and the network-accurate in-feed preview. Shown only once there's
// an image to preview (results in generate mode, or edit mode).
function canvasViewToggle(st) {
  const feed = st.canvasView === "feed";
  const netIcon = st.network ? NETWORK_ICON_BY_PLATFORM[st.network] || "ap-icon-eye-on" : "ap-icon-eye-on";
  return `<div class="image-studio__viewseg" role="group" aria-label="Preview view">
    <button type="button" class="image-studio__viewseg-btn" data-img-view="image" aria-pressed="${!feed}"><i class="ap-icon-image" aria-hidden="true"></i>Image</button>
    <button type="button" class="image-studio__viewseg-btn" data-img-view="feed" aria-pressed="${feed}"><i class="${netIcon}" aria-hidden="true"></i>In feed</button>
  </div>`;
}

// Right canvas — shared; content depends on mode / generation phase, with an
// optional in-feed preview view layered on top via the toggle.
function canvasContent(st) {
  const hasImg = !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
  const showToggle = hasImg && (st.mode === "edit" || (st.mode === "generate" && st.genPhase === "results"));
  const toggle = showToggle ? canvasViewToggle(st) : "";
  const feedView = showToggle && st.canvasView === "feed";
  // On open (and on a manual re-suggest) Archie first drafts the best image
  // prompt from the draft — a full-canvas loader stands in until it lands, then
  // the composer appears pre-filled.
  const deriving = st.mode === "generate" && !feedView && st.promptLoading && st.genPhase === "idle";
  let inner;
  if (feedView) inner = previewCanvas(st);
  else if (st.mode === "edit") inner = editCanvas(st);
  else if (deriving) inner = derivingCanvas();
  else if (st.genPhase === "generating") inner = generatingCanvas(st);
  else if (st.genPhase === "results") inner = resultsCanvas(st);
  else
    inner = `<div class="gen-empty">
      <i class="ap-icon-image" aria-hidden="true"></i>
      <p class="gen-empty-title">Your image appears here</p>
      <span class="gen-empty-sub">Describe it below, then generate.</span>
    </div>`;
  // Edit mode (image view): the floating AI bar lives over the canvas bottom and
  // the manual hand-tools float as a palette top-left. Each palette tool opens
  // its options in a right-flyout popover (Crop / Add image) — so the palette
  // stays put during crop rather than the bottom bar taking over.
  const editingImage = st.mode === "edit" && !feedView;
  const editBar = editingImage ? actionBar(st) : "";
  const palette = editingImage ? toolPalette(st) : "";
  // Generate mode (image view): mirror the edit layout — the prompt composer
  // floats over the canvas bottom (every phase), and the variations "chutier"
  // floats as a vertical rail on the right (results only).
  const generating = st.mode === "generate" && !feedView;
  const genComposer = generating && !deriving ? generateComposer(st) : "";
  const rail = generating && st.genPhase === "results" && st.variations.length > 0 ? variationsRail(st) : "";
  return `${toggle}<div class="image-studio__canvas-body">${inner}</div>${palette}${editBar}${rail}${genComposer}`;
}

// Full-canvas loader shown while Archie drafts the image prompt from the draft
// (on open + on a manual re-suggest). The animated network mark (initArchieLoader
// swaps the .gen-image-spinner) + a status line.
function derivingCanvas() {
  return `<div class="gen-empty image-studio__deriving" role="status" aria-label="Writing your image prompt">
    <span class="gen-image-spinner gen-loading-mark"></span>
    <p class="gen-empty-title">Writing your image prompt…</p>
    <span class="gen-empty-sub">Archie is drafting the best prompt for your post.</span>
  </div>`;
}

// Generate mode — the prompt composer floating over the canvas bottom, built on
// the same card as the edit action bar (mermaid-sparkle cue + roomy auto-growing
// textarea + a send-style Apply that (re)generates). The arrow-up button drives
// Generate / Regenerate (data-img-generate covers both) — the footer keeps only
// the commit CTA, mirroring Edit. The "Suggest from this post" AI helper sits
// just below the bar.
function generateComposer(st) {
  const busy = st.promptLoading || st.genPhase === "generating";
  const applyLabel = st.genPhase === "results" ? "Regenerate" : "Generate";
  const applyDisabled = busy || !(st.promptText || "").trim();
  const expanded = !!st.composerExpanded;
  const expandLabel = expanded ? "Collapse prompt" : "Expand prompt";
  return `<div class="image-studio__composer${expanded ? " is-expanded" : ""}">
    <div class="image-studio__actionbar image-studio__actionbar--generate" role="group" aria-label="Image prompt">
      <i class="ap-icon-sparkles-mermaid image-studio__ai-icon" aria-hidden="true"></i>
      <textarea id="imgStudioPrompt" class="image-studio__reprompt-field" data-img-prompt rows="3" placeholder="${escapeHtml(PROMPT_PLACEHOLDER)}" aria-label="Describe your image" ${busy ? "disabled" : ""}>${escapeHtml(st.promptText)}</textarea>
      <button type="button" class="ap-button ghost grey image-studio__actionbar-expand" data-img-composer-expand aria-label="${expandLabel}" title="${expandLabel}" aria-pressed="${expanded}"><i class="ap-icon-${expanded ? "minimize" : "maximize"}" aria-hidden="true"></i></button>
      <button type="button" class="ap-button primary orange image-studio__actionbar-apply" data-img-generate aria-label="${applyLabel}" title="${applyLabel}" ${applyDisabled ? "disabled" : ""}><i class="ap-icon-arrow-up" aria-hidden="true"></i></button>
    </div>
    ${deriveButton(st)}
  </div>`;
}

// The variations "chutier" as a vertical rail floating on the canvas right edge
// (mirror of the edit-mode tool palette on the left). Single mode = pick-one
// (check on the chosen variation); carousel = numbered, removable kept slides.
// Reuses the .image-studio__thumb tiles + their data-* hooks unchanged.
function variationsRail(st) {
  const carousel = st.outputMode === "carousel";
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const cap = carousel ? imageStudio.carouselMaxFor(st.network) || 8 : 8;
  const canRemove = carousel && st.variations.length > 2;
  const thumbs = st.variations
    .map((v, i) => {
      const on = i === sel;
      if (carousel) {
        const label = `Slide ${i + 1}`;
        return `<div class="image-studio__thumb${on ? " is-selected" : ""}" role="button" tabindex="0" aria-pressed="${on}" data-img-variation="${i}" title="${label}">
          <img src="${escapeHtml(v.url)}" alt="${label}" />
          <span class="image-studio__thumb-num" aria-hidden="true">${i + 1}</span>
          ${canRemove ? `<button type="button" class="image-studio__thumb-remove" data-img-remove-variation="${i}" aria-label="Remove ${label}"><i class="ap-icon-close" aria-hidden="true"></i></button>` : ""}
        </div>`;
      }
      return `<button type="button" class="image-studio__thumb${on ? " is-selected" : ""}" role="tab" aria-selected="${on}" data-img-variation="${i}" title="Variation ${i + 1}">
        <img src="${escapeHtml(v.url)}" alt="Variation ${i + 1}" />
        ${on ? `<span class="image-studio__thumb-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </button>`;
    })
    .join("");
  const addTile =
    st.variations.length < cap
      ? `<button type="button" class="image-studio__thumb image-studio__thumb--add" data-img-add-variation title="${carousel ? "Add a slide" : "Generate another"}" ${st.addingVariation ? "disabled" : ""}>${
          st.addingVariation
            ? `<span class="gen-image-spinner"></span>`
            : `<i class="ap-icon-plus" aria-hidden="true"></i>`
        }</button>`
      : "";
  const label = carousel
    ? `<p class="image-studio__rail-label" title="Carousel · all slides are kept"><i class="ap-icon-multiple-images" aria-hidden="true"></i>${st.variations.length}</p>`
    : "";
  return `<div class="image-studio__filmstrip image-studio__filmstrip--rail" role="${carousel ? "group" : "tablist"}" aria-label="${carousel ? "Slides" : "Variations"}">${label}${thumbs}${addTile}</div>`;
}

function generatingCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  return `<div class="gen-stage-wrap" style="--gen-ratio:${ratio}">
    <div class="gen-single gen-single--loading" style="aspect-ratio:${ratio}" role="status" aria-label="Generating">
      <div class="gen-loading-inner">
        <span class="gen-image-spinner gen-loading-mark"></span>
        <p class="gen-loading-label">Generating ${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}…</p>
      </div>
    </div>
  </div>`;
}

// One large preview of the focused image, centered in the canvas. The variations
// "chutier" is no longer stacked below — it floats as a vertical rail on the
// right (see variationsRail), mirroring the edit-mode layout.
function resultsCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const carousel = st.outputMode === "carousel";
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const current = st.variations[sel] || st.variations[0];
  return `<div class="image-studio__preview-stage">
    <div class="image-studio__preview-main">
      <div class="image-studio__frame" style="--imgs-ratio:${ratio}">
        <img class="image-studio__frame-img" src="${current ? escapeHtml(current.url) : ""}" alt="${carousel ? `Slide ${sel + 1}` : "Selected variation"}" />
        <button type="button" class="image-studio__frame-edit" data-img-mode="edit" aria-label="${carousel ? `Edit slide ${sel + 1}` : "Edit this image"}" title="${carousel ? `Edit slide ${sel + 1}` : "Edit this image"}"><i class="ap-icon-pen" aria-hidden="true"></i></button>
        ${carousel ? `<span class="image-studio__slide-pos" aria-hidden="true">${sel + 1} / ${st.variations.length}</span>` : ""}
      </div>
    </div>
  </div>`;
}

// Preview mode — the post rendered in-feed exactly as the Drafts board shows it
// (reuses renderPostCard), fed the CURRENT studio image / carousel. App chrome
// (action stack, feedback strip, hover controls) is hidden via scoped CSS.
function previewCanvas(st) {
  const post = ctx.sessionId && ctx.postId ? getPosts(ctx.sessionId).find((p) => p.id === ctx.postId) : null;
  const base = post || {
    id: ctx.postId || "preview",
    author: { name: "You", title: "", initials: "YO", connection: "1st", visibility: "public" },
    network: st.network || "linkedin",
    status: "ready",
    timeLabel: "now",
    text: ["Your post text will appear here."],
    hashtags: [],
    cta: "",
    stats: { likes: 0, comments: 0, reposts: 0 },
  };
  let media;
  if (st.outputMode === "carousel") {
    const urls = st.variations.map((v) => v.url);
    // Overlays are edited against the focused slide — flatten them into it so the
    // preview reflects the edit in progress.
    if (st.overlays.length && st.currentImage && st.selectedIndex != null)
      urls[st.selectedIndex] = compositedPreviewUrl(st.currentImage, st.overlays);
    media = { imageUrl: urls[0] || null, carousel: urls };
  } else {
    let url = st.currentImage?.url || (st.selectedIndex != null ? st.variations[st.selectedIndex]?.url : null);
    if (st.overlays.length && st.currentImage) url = compositedPreviewUrl(st.currentImage, st.overlays);
    media = { imageUrl: url, carousel: null };
  }
  // Null clip/regenerate so the image branch renders (not the video PIP).
  const previewPost = { ...base, clipRef: null, isRegenerating: false, ...media };
  const netLabel = NETWORK_LABEL[st.network] || st.network || "your network";
  return `<div class="image-studio__preview">
    <p class="image-studio__preview-note">How this looks on ${escapeHtml(netLabel)}</p>
    <div class="image-studio__preview-network">${renderPostCard(previewPost)}</div>
  </div>`;
}

// Bottom bar — one primary CTA per mode / phase.
function footer(st) {
  if (st.mode === "edit") {
    // Editing a carousel slide bakes the edit back into that slide and returns
    // to the carousel; editing a single image attaches it to the draft.
    const carouselSlide = st.outputMode === "carousel";
    const primary = carouselSlide
      ? `<button type="button" class="ap-button primary orange" data-img-apply-slide ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Apply to slide ${(st.selectedIndex ?? 0) + 1}</span></button>`
      : `<button type="button" class="ap-button primary orange" data-img-use ${st.editBusy || !st.currentImage ? "disabled" : ""}><i class="ap-icon-check"></i><span>Use this image</span></button>`;
    return `<div class="image-studio__bar">
      <button type="button" class="ap-button ghost grey" data-img-undo ${imageStudio.canUndo(KEY) ? "" : "disabled"}><i class="ap-icon-refresh"></i><span>Undo</span></button>
      <div class="image-studio__bar-spacer"></div>
      ${primary}
    </div>`;
  }
  if (st.genPhase === "generating") {
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>
    </div>`;
  }
  // Generate / Regenerate now live on the composer's ↑; the footer keeps only the
  // commit CTA (mirrors Edit), disabled until there's an image to use.
  const carousel = st.outputMode === "carousel";
  const hasResults = st.genPhase === "results" && st.variations.length > 0;
  const useLabel = hasResults && carousel ? `Use carousel · ${st.variations.length} slides` : "Use this image";
  const useReady = hasResults && (carousel ? st.variations.length >= 2 : !!st.currentImage);
  return `<div class="image-studio__bar">
    <div class="image-studio__bar-spacer"></div>
    <button type="button" class="ap-button primary orange" data-img-use ${useReady ? "" : "disabled"}><i class="ap-icon-check"></i><span>${useLabel}</span></button>
  </div>`;
}
