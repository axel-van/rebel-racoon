// Image Studio v2 — the chrome + the stage.
//
// One vertical layout for both modes: a single-row header (title · mode tabs ·
// view toggle), a full-width STAGE that owns all the height it can get, and the
// bottom COMPOSER (delegated to composer-view). There is no left rail and no
// separate footer — the composer is both, which is the whole point of the v2
// layout: the prompt sits where the user's attention ends up, and in Edit mode
// that same bar becomes the AI reprompt + tool bar.
//
// This module renders the shell and every stage state EXCEPT the edit canvas,
// which edit-view owns (it carries the overlay/crop machinery).

import { html, raw, escapeHtml } from "../../utils.js?v=21";
import { getPosts } from "../../posts-store.js?v=59";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=53";
import { renderPostCard } from "../post-card.js?v=98";
import { KEY, ctx } from "./context.js?v=48";
import { composer, settingsPanel, toolPalette, footerBar } from "./composer-view.js?v=73";
import { editCanvas } from "./edit-view.js?v=48";
import { compositeOverlays } from "../image-studio/canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=84";

// In-feed preview — the edit canvas layers logo/text overlays as live DOM over
// the image, but renderPostCard only takes a URL, so overlays wouldn't show. We
// flatten (base image + overlays) into a PNG and feed the card that.
// compositeOverlays is async while render is sync, so we memoise by a signature
// of the flatten inputs and re-render once it lands; the plain image shows
// meanwhile. Only one studio is open at a time (KEY is constant), so a
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
        imageStudio.notifyOverlays(KEY); // re-render → swaps in the flattened image
      })
      .catch(() => {
        previewPendingSig = null;
      });
  }
  return img.url; // fall back to the plain image until the composite lands
}

export function renderStudio(st) {
  return html`
    <div class="isv2 isv2--${st.mode}">
      ${raw(header(st))}
      <section class="isv2-stage" aria-label="Preview">${raw(stageContent(st))}</section>
      ${raw(composer(st))} ${raw(footerBar(st))}
    </div>
  `;
}

// ── Header ──────────────────────────────────────────────────────────────────

// One 48px row instead of v1's two (dialog header + a tab strip below it): the
// stage needs every pixel it can get now that the console owns the bottom. The
// header carries only what scopes the WHOLE modal — its name and the two peer
// modes; the × is the .ap-dialog-close in the shell, which the row's right
// padding clears. The view toggle is not modal-wide, so it isn't here (see
// stageContent).
function header(st) {
  const hasImg = !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
  const editState = (st.mode === "edit" ? " active" : "") + (hasImg ? "" : " disabled");
  const lockedAttrs = hasImg ? "" : 'disabled title="Generate an image first"';
  return `<div class="ap-dialog-header isv2-header">
    <span class="ap-dialog-title isv2-title">Image Studio</span>
    <div class="ap-tabs isv2-modes">
      <div class="ap-tabs-nav" role="tablist" aria-label="Studio mode">
        <button type="button" class="ap-tabs-tab${st.mode === "generate" ? " active" : ""}" role="tab" aria-selected="${st.mode === "generate"}" data-img-mode="generate"><span>Generate</span></button>
        <button type="button" class="ap-tabs-tab${editState}" role="tab" aria-selected="${st.mode === "edit"}" data-img-mode="edit" ${lockedAttrs}><span>Edit</span></button>
      </div>
    </div>
  </div>`;
}

// Plain image ↔ network-accurate in-feed preview. A pair of filter chips driven
// by aria-pressed (the app's shared toggle primitive) rather than a second
// .ap-tabs strip, which would read as a competing mode switch beside the real
// one. It sits directly ABOVE the image, centred on it: it changes what the
// stage shows and nothing else, so it belongs to the stage — parked up in the
// modal header it read as global chrome and sat a long way from its effect.
function viewToggle(st) {
  const feed = st.canvasView === "feed";
  const netIcon = st.network ? NETWORK_ICON_BY_PLATFORM[st.network] || "ap-icon-image" : "ap-icon-image";
  const netLabel = st.network ? NETWORK_LABEL[st.network] || st.network : "your feed";
  return `<div class="isv2-viewseg" role="group" aria-label="Preview view">
    <button type="button" class="ap-filter-chip" data-img-view="image" aria-pressed="${!feed}"><i class="ap-icon-image" aria-hidden="true"></i>Image</button>
    <button type="button" class="ap-filter-chip" data-img-view="feed" aria-pressed="${feed}" title="Preview on ${escapeHtml(netLabel)}"><i class="${netIcon}" aria-hidden="true"></i>In feed</button>
  </div>`;
}

// ── Stage ───────────────────────────────────────────────────────────────────

function stageContent(st) {
  const hasImg = !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
  const feedView = hasImg && st.canvasView === "feed";
  let inner;
  if (feedView) inner = feedPreview(st);
  else if (st.mode === "edit") inner = editCanvas(st);
  else if (st.genPhase === "generating") inner = generatingStage(st);
  else if (st.genPhase === "results") inner = resultsStage(st);
  else inner = emptyStage();
  // Three floating zones around the image: the settings inspector LEFT and the
  // manual edit tools TOP-LEFT — one side for everything you set — and the
  // variations "chutier" RIGHT, where what you produced accumulates. The body
  // reserves room for whichever ones are up, so the image centres in what's left
  // over rather than sliding underneath them.
  const showRail = st.mode === "generate" && !feedView && st.genPhase === "results" && st.variations.length > 0;
  const showPanel = st.mode === "generate" && !feedView;
  const showPalette = st.mode === "edit" && !feedView;
  // The inspector and the chutier are PINNED to the stage's edges, and the body
  // reserves the same width on BOTH sides for them. Symmetry is the whole point:
  // it puts the image on the modal's exact centre line, which is also where the
  // toggle above it and the prompt below it sit. Reserving asymmetrically (the
  // rail is narrower than the inspector) is what knocked the image off that line
  // and left it visibly misaligned with its own prompt.
  const bodyCls = "isv2-stage-body" + (showPanel ? " has-panel" : "") + (showPalette ? " has-palette" : "");
  const top = hasImg ? `<div class="isv2-stage-top">${viewToggle(st)}</div>` : "";
  return `${top}<div class="${bodyCls}">
    ${inner}
    ${showRail ? variationsRail(st) : ""}
    ${showPanel ? settingsPanel(st) : ""}
    ${showPalette ? toolPalette(st) : ""}
  </div>`;
}

function emptyStage() {
  return `<div class="gen-empty">
    <i class="ap-icon-image" aria-hidden="true"></i>
    <p class="gen-empty-title">Your image appears here</p>
    <span class="gen-empty-sub">Write a prompt below, then generate.</span>
  </div>`;
}

function generatingStage(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const n = st.outputMode === "carousel" ? st.slideCount : st.variationCount;
  const what = st.outputMode === "carousel" ? "slide" : "variation";
  return `<div class="gen-stage-wrap" style="--gen-ratio:${ratio}">
    <div class="gen-single gen-single--loading" style="aspect-ratio:${ratio}" role="status" aria-label="Generating">
      <div class="gen-loading-inner">
        <span class="gen-image-spinner gen-loading-mark"></span>
        <p class="gen-loading-label">Generating ${n} ${what}${n > 1 ? "s" : ""}…</p>
      </div>
    </div>
  </div>`;
}

// One large preview of the focused image, centered. The pencil enters Edit on
// the image under the cursor — the fastest path from "that one" to retouching it.
function resultsStage(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const carousel = st.outputMode === "carousel";
  const sel = st.selectedIndex == null ? 0 : st.selectedIndex;
  const current = st.variations[sel] || st.variations[0];
  const editLabel = carousel ? `Edit slide ${sel + 1}` : "Edit this image";
  return `<div class="isv2-frame isv2-frame--result" style="--isv2-ratio:${ratio}">
    <img class="isv2-frame-img" src="${current ? escapeHtml(current.url) : ""}" alt="${carousel ? `Slide ${sel + 1}` : "Selected variation"}" />
    <button type="button" class="ap-icon-button isv2-frame-edit" data-img-mode="edit" aria-label="${editLabel}" title="${editLabel}"><i class="ap-icon-pen" aria-hidden="true"></i></button>
    ${carousel ? `<span class="isv2-slide-pos" aria-hidden="true">${sel + 1} / ${st.variations.length}</span>` : ""}
  </div>`;
}

// Vertical rail on the LEFT edge of the image area — your generated assets,
// where a creative tool keeps them. Single = pick-one (check on the chosen one);
// carousel = numbered slides, removable down to 2, all kept.
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
        return `<div class="isv2-thumb${on ? " is-selected" : ""}" role="button" tabindex="0" aria-pressed="${on}" data-img-variation="${i}" title="${label}">
          <img src="${escapeHtml(v.url)}" alt="${label}" />
          <span class="isv2-thumb-num" aria-hidden="true">${i + 1}</span>
          ${canRemove ? `<button type="button" class="isv2-thumb-remove" data-img-remove-variation="${i}" aria-label="Remove ${label}"><i class="ap-icon-close" aria-hidden="true"></i></button>` : ""}
        </div>`;
      }
      return `<button type="button" class="isv2-thumb${on ? " is-selected" : ""}" role="tab" aria-selected="${on}" data-img-variation="${i}" title="Variation ${i + 1}">
        <img src="${escapeHtml(v.url)}" alt="Variation ${i + 1}" />
        ${on ? `<span class="isv2-thumb-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </button>`;
    })
    .join("");
  const addTile =
    st.variations.length < cap
      ? `<button type="button" class="isv2-thumb isv2-thumb--add" data-img-add-variation title="${carousel ? "Add a slide" : "Generate another"}" ${st.addingVariation ? "disabled" : ""}>${
          st.addingVariation
            ? `<span class="gen-image-spinner"></span>`
            : `<i class="ap-icon-plus" aria-hidden="true"></i>`
        }</button>`
      : "";
  const label = carousel
    ? `<p class="isv2-rail-label" title="Carousel · all slides are kept"><i class="ap-icon-multiple-images" aria-hidden="true"></i>${st.variations.length}</p>`
    : "";
  return `<div class="isv2-rail" role="${carousel ? "group" : "tablist"}" aria-label="${carousel ? "Slides" : "Variations"}">${label}${thumbs}${addTile}</div>`;
}

// The post rendered in-feed exactly as the Drafts board shows it (reuses
// renderPostCard), fed the CURRENT studio image / carousel. App chrome (action
// stack, feedback strip, hover controls) is hidden via scoped CSS.
function feedPreview(st) {
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
    // Overlays are edited against the focused slide — flatten them into it so
    // the preview reflects the edit in progress.
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
  return `<div class="isv2-feed">
    <p class="isv2-feed-note">How this looks on ${escapeHtml(netLabel)}</p>
    <div class="isv2-feed-card">${renderPostCard(previewPost)}</div>
  </div>`;
}
