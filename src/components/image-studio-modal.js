// Image Studio — a near-fullscreen modal "Generate an image" flow inspired by
// Adobe Firefly. Opened from a draft (post card / right-panel Drafts); the
// chosen image attaches back to that draft. Same module-singleton pattern as the
// other modals: init() injects the DOM once, open(postId, { sessionId }) and
// close() toggle it, coordinated by modal-coordinator.js.
//
// State + all mock behavior live in image-studio.js (UI-agnostic, keyed here by
// a single constant since only one studio is open at a time). This file owns the
// modal shell + the stage renders (compose → generating → results → edit) + the
// event wiring. It REUSES the shared .gen-* image tiles / preview primitives
// from styles/screens/modals.css.

import { html, raw, escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { showToast } from "./toast.js?v=20";
import { getPosts, attachImageToDraft } from "../posts-store.js?v=34";
import { NETWORK_LABEL } from "../social-profiles.js?v=25";
import * as imageStudio from "../image-studio.js?v=2";

const MODAL_ID = "imageStudio";
const KEY = "studio"; // single active studio → one state key

let backdrop, modal, body;
let initialized = false;
let currentPostId = null;
let currentSessionId = null;
let unsub = null;

const HTML = `
<div class="app-modal-backdrop image-studio-modal__backdrop" id="imageStudioBackdrop" hidden></div>
<aside
  class="ap-dialog image-studio-modal"
  id="imageStudioModal"
  role="dialog"
  aria-modal="true"
  aria-label="Generate an image"
  aria-hidden="true"
>
  <button class="ap-dialog-close image-studio-modal__close" type="button" data-img-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="image-studio-modal__body" id="imageStudioBody"></div>
</aside>`;

function state() {
  return imageStudio.getState(KEY);
}

// ── Render ────────────────────────────────────────────────────────────────

function renderStudio(st) {
  if (st.stage === "generating") return renderGenerating(st);
  if (st.stage === "results") return renderResults(st);
  if (st.stage === "edit") return renderEdit(st);
  return renderCompose(st);
}

function studioTopBar(title) {
  return `<div class="image-studio__top">
    <span class="image-studio__top-title"><i class="ap-icon-archie-official" aria-hidden="true"></i>${escapeHtml(title)}</span>
  </div>`;
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

function formatChip(f, selected, dataAttr) {
  return `<button type="button" class="gen-format-chip${selected ? " is-selected" : ""}" ${dataAttr}="${escapeHtml(f.id)}" aria-pressed="${selected}">
    <span class="gen-format-glyph" style="aspect-ratio:${f.ratio}" aria-hidden="true"></span>
    <span class="gen-format-meta">
      <span class="gen-format-tag">${escapeHtml(f.tag)}</span>
      <span class="gen-format-name">${escapeHtml(f.label)}</span>
    </span>
  </button>`;
}

function refs(st) {
  const tiles = st.referenceImages
    .map(
      (r) => `<div class="image-studio__ref">
        <img src="${escapeHtml(r.url)}" alt="Reference image" />
        <button type="button" class="image-studio__ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove reference"><i class="ap-icon-close" aria-hidden="true"></i></button>
      </div>`,
    )
    .join("");
  const addTile =
    st.referenceImages.length < imageStudio.MAX_REFS
      ? `<button type="button" class="image-studio__ref-add" data-img-ref-add><i class="ap-icon-plus" aria-hidden="true"></i><span>Add</span></button>`
      : "";
  return tiles + addTile;
}

function composeGroups(st) {
  const fmtHint = st.network ? `Best for ${NETWORK_LABEL[st.network] || st.network}` : "Aspect ratio";
  const fmtChips = imageStudio
    .formatChoices(KEY)
    .map((f) => formatChip(f, st.formatId === f.id, "data-img-format"))
    .join("");
  const varChips = imageStudio.VARIATION_CHOICES.map(
    (n) =>
      `<button type="button" class="ap-filter-chip" data-img-varcount="${n}" aria-pressed="${st.variationCount === n}">${n}</button>`,
  ).join("");
  return `
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Reference images</p>
        <span class="image-studio__count">${st.referenceImages.length}/${imageStudio.MAX_REFS}</span>
      </div>
      <div class="image-studio__refs">${refs(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Visual style</p>
        <span class="image-studio__opt">Optional</span>
      </div>
      <div class="gen-style-grid">${styleCards(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Mood</p>
        <span class="image-studio__opt">Optional</span>
      </div>
      <div class="image-studio__chips">${moodChips(st)}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Format</p>
        <span class="image-studio__count">${escapeHtml(fmtHint)}</span>
      </div>
      <div class="gen-format-chips">${fmtChips}</div>
    </div>
    <div class="image-studio__group">
      <div class="image-studio__group-head">
        <p class="image-studio__group-label">Variations</p>
      </div>
      <div class="image-studio__chips">${varChips}</div>
    </div>
  `;
}

function renderCompose(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const promptValid = st.promptText.trim().length > 0;
  const deriveLabel = st.promptLoading
    ? `<span class="gen-spinner"></span><span>Suggesting from this post…</span>`
    : `<i class="ap-icon-archie-official" aria-hidden="true"></i><span>Suggest from this post</span>`;
  return html`
    <div class="image-studio image-studio--compose">
      ${raw(studioTopBar("Generate an image"))}
      <div class="image-studio__scroll">
        <div class="image-studio__compose">
          <div class="image-studio__rail">${raw(composeGroups(st))}</div>
          <div class="image-studio__preview">
            <div class="gen-stage-wrap" style="--gen-ratio:${ratio}">
              <div class="gen-empty">
                <i class="ap-icon-image" aria-hidden="true"></i>
                <p class="gen-empty-title">Your image appears here</p>
                <span class="gen-empty-sub">Describe it below, then generate.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="image-studio__bar">
        <div class="image-studio__prompt">
          <textarea
            class="image-studio__prompt-field"
            data-img-prompt
            rows="1"
            placeholder="Describe the image you want to generate…"
          >
${st.promptText}</textarea
          >
          <button type="button" class="image-studio__derive" data-img-derive ${st.promptLoading ? "disabled" : ""}>
            ${raw(deriveLabel)}
          </button>
        </div>
        <button
          type="button"
          class="ap-button primary orange"
          data-img-generate
          ${promptValid && !st.promptLoading ? "" : "disabled"}
        >
          <i class="ap-icon-archie-official"></i><span>Generate</span>
        </button>
      </div>
    </div>
  `;
}

function renderGenerating(st) {
  const ratio = imageStudio.activeRatio(KEY);
  return html`
    <div class="image-studio image-studio--generating">
      ${raw(studioTopBar("Generate an image"))}
      <div class="image-studio__scroll">
        <div class="image-studio__results">
          <div class="gen-stage-wrap" style="--gen-ratio:${ratio}">
            <div
              class="gen-single gen-single--loading"
              style="aspect-ratio:${ratio}"
              role="status"
              aria-label="Generating"
            >
              <div class="gen-loading-inner">
                <span class="gen-image-spinner gen-loading-mark"></span>
                <p class="gen-loading-label">
                  Generating ${st.variationCount} variation${st.variationCount > 1 ? "s" : ""}…
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderResults(st) {
  const ratio = imageStudio.activeRatio(KEY);
  const cards = st.variations
    .map((v, i) => {
      const sel = st.selectedIndex === i;
      return `<button type="button" class="image-studio__variation${sel ? " is-selected" : ""}" data-img-variation="${i}" aria-pressed="${sel}">
        <img src="${escapeHtml(v.url)}" alt="Variation ${i + 1}" style="--imgs-ratio:${ratio}" />
        ${sel ? `<span class="image-studio__variation-check" aria-hidden="true"><i class="ap-icon-check"></i></span>` : ""}
      </button>`;
    })
    .join("");
  const single = st.variations.length === 1 ? " is-single" : "";
  const hasSel = st.selectedIndex != null;
  return html`
    <div class="image-studio image-studio--results">
      ${raw(studioTopBar("Generate an image"))}
      <div class="image-studio__scroll">
        <div class="image-studio__results">
          <div class="image-studio__results-head">
            <h2 class="image-studio__results-title">Pick a variation</h2>
          </div>
          <div class="image-studio__grid${single}" style="--imgs-ratio:${ratio}">${raw(cards)}</div>
        </div>
      </div>
      <div class="image-studio__bar">
        <button type="button" class="ap-button stroked grey" data-img-back-compose>
          <i class="ap-icon-chevron-left"></i><span>Back to options</span>
        </button>
        <button type="button" class="ap-button ghost grey" data-img-regenerate>
          <i class="ap-icon-refresh"></i><span>Regenerate</span>
        </button>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button stroked grey" data-img-edit ${hasSel ? "" : "disabled"}>
          <i class="ap-icon-pen"></i><span>Edit image</span>
        </button>
        <button type="button" class="ap-button primary orange" data-img-use ${hasSel ? "" : "disabled"}>
          <i class="ap-icon-check"></i><span>Use this image</span>
        </button>
      </div>
    </div>
  `;
}

function editSubpanel(st) {
  const tool = st.activeTool;
  if (!tool) return "";
  const meta = imageStudio.EDIT_TOOLS.find((t) => t.key === tool);
  if (!meta) return "";
  if (tool === "prompt") {
    return `<div class="image-studio__subpanel">
      <p class="image-studio__subpanel-label">Describe the change</p>
      <textarea class="image-studio__edit-prompt" data-img-edit-prompt rows="2" placeholder="e.g. warmer lighting, add a laptop on the desk…">${escapeHtml(st.editPrompt || "")}</textarea>
      <div class="image-studio__subpanel-row">
        <span class="image-studio__subpanel-hint">Preview — reruns the generation with your note.</span>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button primary orange" data-img-apply-edit="prompt"><i class="ap-icon-archie-official"></i><span>Apply</span></button>
      </div>
    </div>`;
  }
  if (tool === "expand") {
    const chips = imageStudio
      .formatChoices(KEY)
      .map((f) => formatChip(f, st.formatId === f.id, "data-img-expand-format"))
      .join("");
    return `<div class="image-studio__subpanel">
      <p class="image-studio__subpanel-label">Expand to a new ratio</p>
      <div class="gen-format-chips">${chips}</div>
      <p class="image-studio__subpanel-hint">Preview — reshapes the frame and regenerates the outer area.</p>
    </div>`;
  }
  if (tool === "annotate" || tool === "fill" || tool === "remove") {
    const hint =
      tool === "annotate"
        ? "Draw on the image — your strokes are baked into the picture."
        : `Brush the area to ${tool === "fill" ? "fill in" : "remove"} — preview reruns generation on that region.`;
    return `<div class="image-studio__subpanel">
      <div class="image-studio__subpanel-row">
        <p class="image-studio__subpanel-label">${escapeHtml(meta.label)}</p>
        <span class="image-studio__subpanel-hint">${escapeHtml(hint)}</span>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button ghost grey" data-img-clear-brush><span>Clear</span></button>
        <button type="button" class="ap-button primary orange" data-img-apply-edit="${escapeHtml(tool)}"><i class="ap-icon-check"></i><span>Apply</span></button>
      </div>
    </div>`;
  }
  // upscale / removebg — one-click.
  const hint =
    tool === "upscale"
      ? "Doubles the resolution of the current image."
      : "Isolates the subject on a transparent background (preview).";
  return `<div class="image-studio__subpanel">
    <div class="image-studio__subpanel-row">
      <p class="image-studio__subpanel-label">${escapeHtml(meta.label)}</p>
      <span class="image-studio__subpanel-hint">${escapeHtml(hint)}</span>
      <div class="image-studio__bar-spacer"></div>
      <button type="button" class="ap-button primary orange" data-img-apply-edit="${escapeHtml(tool)}"><i class="ap-icon-check"></i><span>Apply</span></button>
    </div>
  </div>`;
}

function renderEdit(st) {
  const img = st.currentImage;
  const ratio = img ? img.w / img.h : imageStudio.activeRatio(KEY);
  const tools = imageStudio.EDIT_TOOLS.map((t) => {
    const active = st.activeTool === t.key;
    return `<button type="button" class="image-studio__tool${active ? " is-active" : ""}" data-img-tool="${escapeHtml(t.key)}" aria-pressed="${active}" ${st.editBusy ? "disabled" : ""}>
      <i class="${t.icon}" aria-hidden="true"></i><span>${escapeHtml(t.label)}</span>
    </button>`;
  }).join("");
  const brushTool = st.activeTool === "annotate" || st.activeTool === "fill" || st.activeTool === "remove";
  const canvasOverlay =
    brushTool && img
      ? `<canvas class="image-studio__annotate" data-img-annotate data-tool="${escapeHtml(st.activeTool)}" width="${img.w}" height="${img.h}"></canvas>`
      : "";
  const busy = st.editBusy
    ? `<div class="image-studio__busy"><span class="gen-image-spinner"></span><span>Applying…</span></div>`
    : "";
  const badge =
    img && img.upscaled
      ? `<span class="image-studio__badge"><i class="ap-icon-arrow-up" aria-hidden="true"></i>Upscaled 2×</span>`
      : img && img.noBg
        ? `<span class="image-studio__badge"><i class="ap-icon-cropper" aria-hidden="true"></i>Background removed (preview)</span>`
        : "";
  return html`
    <div class="image-studio image-studio--edit">
      ${raw(studioTopBar("Edit image"))}
      <div class="image-studio__scroll">
        <div class="image-studio__edit">
          <div class="image-studio__tools" aria-label="Edit tools">${raw(tools)}</div>
          <div class="image-studio__stage">
            <div class="image-studio__frame${img && img.noBg ? " is-nobg" : ""}" style="--imgs-ratio:${ratio}">
              <img class="image-studio__frame-img" src="${img ? img.url : ""}" alt="Working image" />
              ${raw(canvasOverlay)} ${raw(busy)} ${raw(badge)}
            </div>
            ${raw(editSubpanel(st))}
          </div>
        </div>
      </div>
      <div class="image-studio__bar">
        <button type="button" class="ap-button stroked grey" data-img-back-results>
          <i class="ap-icon-chevron-left"></i><span>Back to variations</span>
        </button>
        <button type="button" class="ap-button ghost grey" data-img-undo ${imageStudio.canUndo(KEY) ? "" : "disabled"}>
          <i class="ap-icon-refresh"></i><span>Undo</span>
        </button>
        <div class="image-studio__bar-spacer"></div>
        <button type="button" class="ap-button primary orange" data-img-use ${st.editBusy ? "disabled" : ""}>
          <i class="ap-icon-check"></i><span>Use this image</span>
        </button>
      </div>
    </div>
  `;
}

function renderBody() {
  const st = state();
  if (!st || !body) return;
  body.innerHTML = renderStudio(st);
}

// ── Behavior helpers ──────────────────────────────────────────────────────

// Throwaway file picker for the "Your style" tile (kind="style") and the
// reference-images grid (kind="ref").
function openFilePicker(kind) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (kind === "style") imageStudio.setCustomStyle(KEY, url);
    else imageStudio.addReferenceImage(KEY, url);
  });
  input.click();
}

// Commit the working image to the origin draft, then close.
function useImage() {
  const url = imageStudio.commit(KEY);
  if (url && currentSessionId && currentPostId) {
    attachImageToDraft(currentSessionId, currentPostId, url);
    showToast("Image added to your draft");
  }
  close();
}

// Apply an edit. Annotation composites the strokes into the image locally (a
// faithful result); every other tool runs a mocked reseed inside applyEdit.
function applyEditTool(tool) {
  if (tool === "annotate") {
    const canvas = modal.querySelector("canvas[data-img-annotate]");
    const st = state();
    if (!canvas || !st?.currentImage) return;
    compositeAnnotation(st.currentImage.url, canvas)
      .then((dataUrl) => imageStudio.applyEdit(KEY, "annotate", { dataUrl }))
      .catch(() => imageStudio.applyEdit(KEY, "annotate")); // fallback: mocked reseed
    return;
  }
  if (tool === "prompt") {
    const ta = modal.querySelector("[data-img-edit-prompt]");
    if (ta) imageStudio.setEditPromptSilent(KEY, ta.value);
  }
  imageStudio.applyEdit(KEY, tool);
}

// Composite the source image + the annotation canvas into a PNG data URL.
// Picsum sends `Access-Control-Allow-Origin: *`, so crossOrigin lets us export;
// if the canvas ends up tainted, the caller falls back to a mocked reseed.
function compositeAnnotation(url, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const out = document.createElement("canvas");
        out.width = img.naturalWidth || canvas.width;
        out.height = img.naturalHeight || canvas.height;
        const ctx = out.getContext("2d");
        ctx.drawImage(img, 0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0, out.width, out.height);
        resolve(out.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Freehand stroke on the brush canvas. Annotate = opaque orange (baked into the
// image); fill / remove = translucent blue mask (visual only — the region seeds
// a mocked reseed).
function startStroke(canvas, downEvent) {
  downEvent.preventDefault();
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const annotate = canvas.dataset.tool === "annotate";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = annotate ? "#ff3c00" : "#178dfe";
  ctx.globalAlpha = annotate ? 1 : 0.4;
  ctx.lineWidth = annotate ? Math.max(4, canvas.width * 0.01) : Math.max(18, canvas.width * 0.06);
  const at = (e) => [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  const [x0, y0] = at(downEvent);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + 0.01, y0 + 0.01);
  ctx.stroke();
  const move = (e) => {
    const [x, y] = at(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ── Event delegation ──────────────────────────────────────────────────────

function onClick(event) {
  const st = state();
  if (!st) return;
  if (event.target.closest("[data-img-close]")) return void close();
  if (event.target.closest("[data-img-style-upload]")) return void openFilePicker("style");
  const styleBtn = event.target.closest("[data-img-style]");
  if (styleBtn) return void imageStudio.setStyle(KEY, styleBtn.dataset.imgStyle);
  const moodBtn = event.target.closest("[data-img-mood]");
  if (moodBtn) return void imageStudio.setMood(KEY, moodBtn.dataset.imgMood);
  const fmtBtn = event.target.closest("[data-img-format]");
  if (fmtBtn) return void imageStudio.setFormat(KEY, fmtBtn.dataset.imgFormat);
  const varBtn = event.target.closest("[data-img-varcount]");
  if (varBtn) return void imageStudio.setVariationCount(KEY, Number(varBtn.dataset.imgVarcount));
  if (event.target.closest("[data-img-ref-add]")) return void openFilePicker("ref");
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);
  if (event.target.closest("[data-img-derive]") && !st.promptLoading) return void imageStudio.runDerive(KEY);
  if (event.target.closest("[data-img-generate]")) {
    const ta = modal.querySelector("[data-img-prompt]");
    if (ta) imageStudio.setPromptSilent(KEY, ta.value);
    if ((state()?.promptText || "").trim()) imageStudio.runGeneration(KEY);
    return;
  }
  if (event.target.closest("[data-img-back-compose]")) return void imageStudio.backToCompose(KEY);
  if (event.target.closest("[data-img-regenerate]")) return void imageStudio.runGeneration(KEY);
  const varPick = event.target.closest("[data-img-variation]");
  if (varPick) return void imageStudio.selectVariation(KEY, Number(varPick.dataset.imgVariation));
  if (event.target.closest("[data-img-edit]")) return void imageStudio.editVariation(KEY, null);
  if (event.target.closest("[data-img-back-results]")) return void imageStudio.backToResults(KEY);
  const toolBtn = event.target.closest("[data-img-tool]");
  if (toolBtn) return void imageStudio.setActiveTool(KEY, toolBtn.dataset.imgTool);
  if (event.target.closest("[data-img-clear-brush]")) {
    const canvas = modal.querySelector("canvas[data-img-annotate]");
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const expandFmt = event.target.closest("[data-img-expand-format]");
  if (expandFmt) return void imageStudio.applyEdit(KEY, "expand", { formatId: expandFmt.dataset.imgExpandFormat });
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-use]")) return void useImage();
}

function onInput(event) {
  if (event.target.matches("[data-img-prompt]")) {
    imageStudio.setPromptSilent(KEY, event.target.value);
    const gen = modal.querySelector("[data-img-generate]");
    if (gen) gen.disabled = !event.target.value.trim();
  } else if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
  }
}

function onPointerDown(event) {
  const canvas = event.target.closest("canvas[data-img-annotate]");
  if (canvas) startStroke(canvas, event);
}

// ── Public API ────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("imageStudioBackdrop");
  modal = document.getElementById("imageStudioModal");
  body = document.getElementById("imageStudioBody");
  modal.addEventListener("click", onClick);
  modal.addEventListener("input", onInput);
  modal.addEventListener("pointerdown", onPointerDown);
  bindOverlayDismissal({ modal, backdrop, close });
}

export function open(postId, opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  currentPostId = postId || null;
  currentSessionId = opts.sessionId || null;

  // Resolve the draft's network so the format options + default match where the
  // image will publish (a LinkedIn draft defaults to LinkedIn's ratio).
  const post = currentSessionId ? getPosts(currentSessionId).find((p) => p.id === currentPostId) : null;
  imageStudio.start(KEY, {
    postId: currentPostId,
    network: post?.network || null,
    formatId: post?.format || null,
  });
  if (unsub) unsub();
  unsub = imageStudio.subscribe(KEY, renderBody);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();
  if (currentPostId) imageStudio.runDerive(KEY);
}

function close() {
  if (!initialized) return;
  if (unsub) {
    unsub();
    unsub = null;
  }
  imageStudio.exit(KEY);
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  currentPostId = null;
  currentSessionId = null;
  notifyClose(MODAL_ID);
}
