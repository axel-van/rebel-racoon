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
import { KEY, ctx } from "./context.js?v=1";
import { generateControls } from "./compose-view.js?v=1";
import { actionBar, editCanvas } from "./edit-view.js?v=3";
import * as imageStudio from "../../image-studio.js?v=27";

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
  let inner;
  if (showToggle && st.canvasView === "feed") inner = previewCanvas(st);
  else if (st.mode === "edit") inner = editCanvas(st);
  else if (st.genPhase === "generating") inner = generatingCanvas(st);
  else if (st.genPhase === "results") inner = resultsCanvas(st);
  else
    inner = `<div class="gen-empty">
      <i class="ap-icon-image" aria-hidden="true"></i>
      <p class="gen-empty-title">Your image appears here</p>
      <span class="gen-empty-sub">Describe it on the left, then generate.</span>
    </div>`;
  // Edit mode (image view): the floating action bar lives over the canvas.
  const editingImage = st.mode === "edit" && !(showToggle && st.canvasView === "feed");
  const bar = editingImage ? actionBar(st) : "";
  return `${toggle}<div class="image-studio__canvas-body">${inner}</div>${bar}`;
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

// One large preview of the focused image + a bottom filmstrip (chutier). In
// single mode the filmstrip is a pick-one (check on the chosen variation); in
// carousel mode every tile is a kept slide (numbered, removable) and clicking a
// tile only focuses it for preview.
function resultsCanvas(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const carousel = st.outputMode === "carousel";
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const current = st.variations[sel] || st.variations[0];
  const cap = carousel ? imageStudio.carouselMaxFor(st.network) || 8 : 8;
  const canRemove = carousel && st.variations.length > 2;
  const thumbs = st.variations
    .map((v, i) => {
      const on = i === sel;
      // Carousel tiles are <div>s (not <button>s) so the per-slide remove
      // <button> can nest validly; single-mode tiles stay pick-one <button>s.
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
  const stripLabel = carousel
    ? `<p class="image-studio__filmstrip-label"><i class="ap-icon-multiple-images" aria-hidden="true"></i>Carousel · ${st.variations.length} slides — all slides are kept</p>`
    : "";
  const strip = `<div class="image-studio__filmstrip-wrap">${stripLabel}<div class="image-studio__filmstrip" role="tablist" aria-label="${carousel ? "Slides" : "Variations"}">${thumbs}${addTile}</div></div>`;
  return `<div class="image-studio__preview-stage">
    <div class="image-studio__preview-main">
      <div class="image-studio__frame" style="--imgs-ratio:${ratio}">
        <img class="image-studio__frame-img" src="${current ? escapeHtml(current.url) : ""}" alt="${carousel ? `Slide ${sel + 1}` : "Selected variation"}" />
        ${carousel ? `<span class="image-studio__slide-pos" aria-hidden="true">${sel + 1} / ${st.variations.length}</span>` : ""}
      </div>
    </div>
    ${strip}
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
    media = { imageUrl: urls[0] || null, carousel: urls };
  } else {
    const url = st.currentImage?.url || (st.selectedIndex != null ? st.variations[st.selectedIndex]?.url : null);
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
  if (st.genPhase === "results") {
    const carousel = st.outputMode === "carousel";
    const useLabel = carousel ? `Use carousel · ${st.variations.length} slides` : "Use this image";
    const useReady = carousel ? st.variations.length >= 2 : !!st.currentImage;
    return `<div class="image-studio__bar">
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button stroked grey" data-img-regenerate><i class="ap-icon-refresh"></i><span>Regenerate</span></button>
      <button type="button" class="ap-button primary orange" data-img-use ${useReady ? "" : "disabled"}><i class="ap-icon-check"></i><span>${useLabel}</span></button>
    </div>`;
  }
  const promptValid = st.promptText.trim().length > 0;
  return `<div class="image-studio__bar">
    <div class="image-studio__bar-spacer"></div>
    <button type="button" class="ap-button primary orange" data-img-generate ${promptValid && !st.promptLoading ? "" : "disabled"}><i class="ap-icon-archie-official"></i><span>Generate</span></button>
  </div>`;
}
