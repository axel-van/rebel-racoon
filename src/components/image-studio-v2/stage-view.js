// Image Studio — the modal's chrome, and the whole layout assembled.
//
//   GENERATE (setup-stage.js)            EDIT (edit-view.js + tools-view.js)
//   ┌──────────────────────────────┐     ┌──────────────────────────────┐
//   │ Image Studio  Generate|Edit ✕│     │ Image Studio  Generate|Edit ✕│
//   ├──────────────┬───────────────┤     ├──────────────────────────────┤
//   │ Options |Adv.│ PREVIEW  ▣|▤  │     │        [ Image | In feed ]   │
//   │ References ▾ │ ┌───────────┐ │     │  ┌──┐                        │
//   │ Text in …  ▾ │ │           │ │     │  │▪ │      [  IMAGE  ]       │
//   │ Branding   ▾ │ │   IMAGE   │ │     │  │▪ │                        │
//   │ Type       ▾ │ │           │ │     │  └──┘   tools-view           │
//   │ Style      ▾ │ └───────────┘ │     ├──────────────────────────────┤
//   │ Format     ▾ │  ▪ ▪ ▪        │     │  ✨ [ describe a change ] [↺]│
//   │ Output     ▾ │               │     ├──────────────────────────────┤
//   ├──────────────┴───────────────┤     │  [Undo]     [Use this image] │
//   │  [note]      [Generate]      │     └──────────────────────────────┘
//   └──────────────────────────────┘
//
// Generate is TWO HALVES for the whole loop — the form on the left, the picture on
// the right — so setting an option and judging what it produced never swap screens.
// Edit is the other shape: one centred canvas with its tools pinned to the left edge
// and a composer under it, because there the image IS the surface being worked on.
//
// The stage therefore has no shared middle state, and this module is the SHELL:
// the header, the footer, the mode dispatch and the in-feed preview. Each mode's
// body is its own module.

import { html, raw, escapeHtml } from "../../utils.js?v=1227";
import { getPosts } from "../../posts-store.js?v=1227";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=1227";
import { renderPostCard } from "../post-card.js?v=1227";
import { KEY, ctx } from "./context.js?v=1227";
import { composer } from "./composer-view.js?v=1227";
import { setupStage } from "./setup-stage.js?v=1227";
import { toolPalette } from "./tools-view.js?v=1227";
import { promptGuardDialog } from "./prompt-guard.js?v=1227";
import { editCanvas } from "./edit-view.js?v=1227";
import { compositeOverlays } from "../../image-studio-canvas.js?v=1227";
import * as imageStudio from "../../image-studio.js?v=1227";

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
  // `.isv2-main` was a two-column row: a pinned settings inspector, then the stage.
  // The inspector is gone — generate carries its own options inside the stage — so the
  // row has one child. It stays a row rather than collapsing into the shell because
  // the column is what gives the stage `min-height: 0` against a flex parent, which is
  // what lets the options half scroll instead of pushing the footer off the modal.
  return html`
    <div class="isv2">
      ${raw(header(st))}
      <div class="isv2-main">
        <div class="isv2-main-col">
          <section class="isv2-stage" aria-label="Preview">${raw(stageContent(st))}</section>
          ${raw(composer(st))}
        </div>
      </div>
      ${raw(footerBar(st))} ${raw(promptGuardDialog(st))}
    </div>
  `;
}

/** Is there an image to preview yet? Used by both the shell and the stage. */
function hasImage(st) {
  return !!st.currentImage || (st.genPhase === "results" && st.variations.length > 0);
}

// ── The footer bar ─────────────────────────────────────────────────────────

// One bar across the bottom of the modal, in BOTH modes, carrying the single
// action that ends the flow. Having it there from the first frame — disabled
// until there is something to commit — means the destination is visible the
// whole way through instead of appearing only once results land.
function footerBar(st) {
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
    // Generate is the form's SUBMIT, so it lives in the footer: while there is nothing
    // to use, the primary slot carries it; once an image exists that slot carries the
    // destination ("Use this image") and Regenerate moves beside it. Same slot, same
    // weight, no layout swap between the two.
    //
    // Never gated on the brief: there is no brief yet by design — it is written when
    // this button is pressed (commit.js#runGenerate → deriveNow) — so gating on it
    // would leave the form's only live control dead for no stated reason.
    const busy = st.genPhase === "generating";
    const hasShot = st.variations.length > 0;
    if (hasShot) {
      left = `<button type="button" class="ap-button stroked grey" data-img-generate ${busy ? "disabled" : ""}><i class="ap-icon-refresh"></i><span>Regenerate</span></button>`;
      primary = `<button type="button" class="ap-button primary orange" data-img-use ${st.currentImage ? "" : "disabled"}><i class="ap-icon-check"></i><span>${escapeHtml(carousel ? `Use carousel · ${st.variations.length} slides` : "Use this image")}</span></button>`;
    } else if (busy) {
      primary = `<button type="button" class="ap-button primary blue loading" disabled><span class="ap-loading-bar"></span><span>Generating…</span></button>`;
    } else {
      primary = `<button type="button" class="ap-button primary blue" data-img-generate><i class="ap-icon-sparkles-mermaid"></i><span>Generate</span></button>`;
    }
  }
  return `<div class="ap-dialog-footer isv2-footer">
    <div class="ap-dialog-footer-left">${left}</div>
    <div class="ap-dialog-footer-right">${primary}</div>
  </div>`;
}

// ── Header ──────────────────────────────────────────────────────────────────

// ONE 48px row, not a dialog header with a tab strip below it: the
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
  // GENERATE owns its whole stage — both halves, from open to commit — so the shell
  // adds nothing around it: no pinned inspector, no variations rail, no stage-wide
  // view toggle (the preview column carries its own, beside the picture it switches).
  if (st.mode === "generate") {
    // No scroll, ever: the stage is laid out to fit exactly, and `has-setup` says so
    // in CSS. Something overflowing is a layout bug to fix, not a scrollbar to hide it.
    return `<div class="isv2-stage-body has-setup">${setupStage(st)}</div>`;
  }
  // EDIT is the other shape: one centred canvas with the tool palette pinned to the
  // left edge, and the body reserving that width on BOTH sides so the image sits on
  // the modal's exact centre line rather than sliding under the palette.
  const hasImg = hasImage(st);
  const feedView = hasImg && st.canvasView === "feed";
  const top = hasImg ? `<div class="isv2-stage-top">${viewToggle(st)}</div>` : "";
  return `${top}<div class="isv2-stage-body${feedView ? "" : " has-palette"}">
    ${feedView ? feedPreview(st) : editCanvas(st)}
    ${feedView ? "" : toolPalette(st)}
  </div>`;
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
