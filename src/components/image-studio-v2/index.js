// Image Studio v2 — the prompt-at-the-bottom redesign, behind the
// `imageStudioV2` feature flag. Same entry contract as v1 (init() injects the
// DOM once; open(postId, { sessionId, editImageUrl?, carouselUrls? }); close()
// via modal-coordinator), and the same state engine — src/image-studio.js, keyed
// on "studio-v2" so both versions can be mounted at once without sharing state.
//
// What changed is the surface, and only the surface:
//   v1  header + tab strip · [settings rail | canvas] · footer CTA
//       + a floating AI bar and a floating tool palette in Edit
//   v2  one header row · full-width stage · ONE bottom composer that is the
//       prompt + every setting + the CTAs in Generate, and the AI reprompt +
//       the manual tools in Edit
//
// Module map:
//   context.js       — MODAL_ID / KEY / ctx / state() / FRAME_SEL
//   stage-view.js    — chrome + stage states + the variations rail (renderStudio)
//   composer-view.js — the bottom composer, both modes, and its sheets
//   edit-view.js     — the edit canvas: overlays, crop box, text mini-toolbar
//   interactions.js  — file pickers + on-canvas pointer gestures
// Pure canvas helpers (bake / crop / text metrics) are shared with v1 — they
// carry no design, so there is nothing to redesign in them.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../../modal-coordinator.js?v=21";
import { showToast } from "../toast.js?v=20";
import { getPosts, attachImageToDraft, attachCarouselToDraft } from "../../posts-store.js?v=41";
import { getSessionById } from "../../sessions-store.js?v=11";
import { getContextById } from "../../contexts-store.js?v=43";
import { MODAL_ID, KEY, ctx, state } from "./context.js?v=19";
import { compositeOverlays, loadImg, shadowMetrics, outlineMetrics } from "../image-studio/canvas.js?v=2";
import { renderStudio } from "./stage-view.js?v=36";
import {
  openFilePicker,
  openLogoPicker,
  startOverlayGesture,
  startCropGesture,
  applyCropSelection,
} from "./interactions.js?v=19";
import * as imageStudio from "../../image-studio.js?v=55";

let backdrop;
let initialized = false;
let unsub = null;

const HTML = `
<div class="app-modal-backdrop isv2-backdrop" id="isv2Backdrop" hidden></div>
<aside
  class="ap-dialog isv2-modal"
  id="isv2Modal"
  role="dialog"
  aria-modal="true"
  aria-label="Generate an image"
  aria-hidden="true"
>
  <button class="ap-dialog-close isv2-close" type="button" data-img-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="isv2-body" id="isv2Body"></div>
</aside>`;

function renderBody() {
  const st = state();
  if (!st || !ctx.body) return;
  ctx.body.innerHTML = renderStudio(st);
  // Both composer fields auto-grow to their carried-over text. Unlike v1 (whose
  // collapsed prompt was a fixed 5-line peek in a narrow rail), the v2 prompt is
  // full-width and grows from one line — the expand toggle only raises the cap.
  autosize(ctx.body.querySelector("[data-img-prompt]"));
  autosize(ctx.body.querySelector("[data-img-edit-prompt]"));
}

// Grow a composer textarea to fit its content, bounded by the max-height in CSS
// (past which it scrolls) — mirrors autosizeInput in the main composer.
function autosize(ta) {
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

// ── Inline-text edit helpers ────────────────────────────────────────────────

// Focus the contenteditable of the text overlay currently in edit mode, so the
// user types directly on the image. `selectAll` selects the whole placeholder
// ("Your text") so the first keystroke replaces it (used when adding); otherwise
// the caret sits at the end (used after a style click re-render). notify() is
// synchronous, so the node is already in the DOM when we call this.
function focusEditingText({ selectAll = false } = {}) {
  const st = state();
  if (!st?.editingOverlayId) return;
  const node = ctx.modal.querySelector(`[data-img-overlay="${st.editingOverlayId}"] [data-img-overlay-text]`);
  if (!node) return;
  node.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  if (!selectAll) range.collapse(false); // caret to end
  sel.removeAllRanges();
  sel.addRange(range);
}

// Safety net before baking: push the live contenteditable text into state, in
// case a click stole focus before the last `input` event fired.
function syncEditingText() {
  const st = state();
  if (!st?.editingOverlayId) return;
  const node = ctx.modal.querySelector(`[data-img-overlay="${st.editingOverlayId}"] [data-img-overlay-text]`);
  if (node) imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: node.textContent });
}

// ── Commit to draft ─────────────────────────────────────────────────────────

// Commit the working image to the origin draft, then close.
function useImage() {
  syncEditingText(); // fold any in-flight inline text edit into state first
  const st = state();
  // Carousel: attach every (possibly per-slide-edited) slide as a multi-slide
  // post. Single image: the working image with any overlays flattened.
  if (st?.outputMode === "carousel") {
    const urls = imageStudio.commitCarousel(KEY);
    if (urls.length && ctx.sessionId && ctx.postId) {
      attachCarouselToDraft(ctx.sessionId, ctx.postId, urls);
      showToast(`Carousel added to your draft · ${urls.length} slides`);
    }
    close();
    return;
  }
  const finalize = (url) => {
    if (url && ctx.sessionId && ctx.postId) {
      attachImageToDraft(ctx.sessionId, ctx.postId, url);
      showToast("Image added to your draft");
    }
    close();
  };
  // Overlay elements stay live/editable until here; flatten them into the image
  // only at commit (no per-edit "Apply").
  if (st?.currentImage && st.overlays.length) {
    compositeOverlays(st.currentImage.url, st.overlays, st.currentImage.w, st.currentImage.h)
      .then(finalize)
      .catch(() => finalize(imageStudio.commit(KEY)));
    return;
  }
  finalize(imageStudio.commit(KEY));
}

// Bake the current carousel-slide edit (overlays flattened in) back into that
// slide, then return to the carousel results (updateSlide flips the mode).
// "Use carousel" then ships the edited set.
function commitSlideEdit() {
  syncEditingText();
  const st = state();
  if (!st || st.selectedIndex == null || !st.currentImage) return;
  const idx = st.selectedIndex;
  const { w, h } = st.currentImage;
  const applySlide = (url) => imageStudio.updateSlide(KEY, idx, { url, w, h });
  if (st.overlays.length) {
    compositeOverlays(st.currentImage.url, st.overlays, w, h)
      .then(applySlide)
      .catch(() => applySlide(st.currentImage.url));
    return;
  }
  applySlide(st.currentImage.url);
}

// Apply an AI edit — a mocked reseed inside applyEdit (sync the note first).
function applyEditTool(tool) {
  if (tool === "prompt") {
    const ta = ctx.modal.querySelector("[data-img-edit-prompt]");
    if (ta) imageStudio.setEditPromptSilent(KEY, ta.value);
  }
  imageStudio.applyEdit(KEY, tool);
}

// Run (or re-run) generation from whatever is in the prompt field right now.
function runGenerate() {
  const ta = ctx.modal.querySelector("[data-img-prompt]");
  if (ta) imageStudio.setPromptSilent(KEY, ta.value);
  syncRenderText();
  if ((state()?.promptText || "").trim()) imageStudio.runGeneration(KEY);
}

// The text-to-render field is only read on demand (typing is silent), so a
// Generate fired straight from the field still picks up what's in it.
function syncRenderText() {
  const el = ctx.modal.querySelector("[data-img-render-text]");
  if (el) imageStudio.setRenderTextSilent(KEY, el.value);
}

// ── Event delegation ────────────────────────────────────────────────────────

function onClick(event) {
  const st = state();
  if (!st) return;
  if (event.target.closest("[data-img-close]")) return void close();

  // Sheet/popover lifecycle runs FIRST so every other action implicitly closes
  // whatever was open — a click on the stage, a CTA, a mode tab. Clicks on a
  // toggle or inside a sheet are exempt (the toggle flips it below; a click
  // inside is the user working in it). We fall through afterwards so the click
  // still performs its normal action.
  const popToggle = event.target.closest("[data-img-popover-toggle]");
  const insidePop = event.target.closest("[data-img-popover]");
  if (st.openPopover && !popToggle && !insidePop) imageStudio.setOpenPopover(KEY, null);

  const toggle = event.target.closest("[data-img-popover-toggle]");
  if (toggle && !toggle.disabled) {
    const name = toggle.dataset.imgPopoverToggle;
    return void imageStudio.setOpenPopover(KEY, st.openPopover === name ? null : name);
  }

  // The settings panel's sections — independent, not an accordion. A section the
  // user opened stays open until they close it, and opening a second leaves the
  // first alone. Same `collapsedGroups` Set v1's composer uses.
  const expandBtn = event.target.closest("[data-img-composer-expand]");
  if (expandBtn) return void imageStudio.setComposerExpanded(KEY, !state().composerExpanded);

  // Playbook pick — the view resolves it, the engine just takes the parts.
  const pbPick = event.target.closest("[data-img-playbook]");
  if (pbPick) {
    pbPick.closest("details")?.removeAttribute("open");
    const c = getContextById(pbPick.dataset.imgPlaybook);
    if (c) {
      imageStudio.setPlaybook(KEY, {
        id: c.id,
        name: c.brandName || c.name || "",
        refs: c.referenceImages || [],
        colors: (Array.isArray(c.brandColors) ? c.brandColors : []).map((x) => x && x.hex).filter(Boolean),
      });
    }
    return;
  }

  const grpToggle = event.target.closest("[data-img-group-toggle]");
  if (grpToggle && !grpToggle.disabled) {
    return void imageStudio.toggleGroupCollapsed(KEY, grpToggle.dataset.imgGroupToggle);
  }

  // ── Composer settings ──
  const typeBtn = event.target.closest("[data-img-image-type]");
  if (typeBtn) return void imageStudio.setImageType(KEY, typeBtn.dataset.imgImageType);
  const styleBtn = event.target.closest("[data-img-style]");
  if (styleBtn) return void imageStudio.setStyle(KEY, styleBtn.dataset.imgStyle);
  const fmtBtn = event.target.closest("[data-img-format]");
  if (fmtBtn) return void imageStudio.setFormat(KEY, fmtBtn.dataset.imgFormat);
  const varBtn = event.target.closest("[data-img-varcount]");
  if (varBtn) return void imageStudio.setVariationCount(KEY, Number(varBtn.dataset.imgVarcount));
  const outBtn = event.target.closest("[data-img-output]");
  if (outBtn) return void imageStudio.setOutputMode(KEY, outBtn.dataset.imgOutput);
  const slideBtn = event.target.closest("[data-img-slidecount]");
  if (slideBtn) return void imageStudio.setSlideCount(KEY, Number(slideBtn.dataset.imgSlidecount));
  // Brand kit switch is a DS toggle (checkbox) — handled in onChange.
  if (event.target.closest("[data-img-ref-add]")) return void openFilePicker();
  const refToggle = event.target.closest("[data-img-ref-toggle]");
  if (refToggle) return void imageStudio.toggleReferenceImage(KEY, refToggle.dataset.imgRefToggle);
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);

  // ── Prompt row ──

  // ── Chrome ──
  const modeBtn = event.target.closest("[data-img-mode]");
  if (modeBtn && !modeBtn.disabled) return void imageStudio.setMode(KEY, modeBtn.dataset.imgMode);
  const viewBtn = event.target.closest("[data-img-view]");
  if (viewBtn) return void imageStudio.setCanvasView(KEY, viewBtn.dataset.imgView);

  // ── Generate / results ──
  // Generate (no results yet) and Regenerate (with results) are the same path.
  if (event.target.closest("[data-img-generate]")) return void runGenerate();
  if (event.target.closest("[data-img-add-variation]")) return void imageStudio.addVariation(KEY);
  // Remove a slide — checked before the tile-select since it's nested in it.
  const varRm = event.target.closest("[data-img-remove-variation]");
  if (varRm) return void imageStudio.removeVariation(KEY, Number(varRm.dataset.imgRemoveVariation));
  const varPick = event.target.closest("[data-img-variation]");
  if (varPick) return void imageStudio.selectVariation(KEY, Number(varPick.dataset.imgVariation));

  // ── Edit tools ──
  // Crop is a plain mode toggle now — its ratio options live in the on-canvas
  // toolbar under the box, so there is no sheet to keep in sync.
  const cropChip = event.target.closest("[data-img-crop-start]");
  if (cropChip && !cropChip.disabled) {
    if (st.cropDrawing) return void imageStudio.cancelCropDraw(KEY);
    return void imageStudio.enterCropDraw(KEY);
  }
  if (event.target.closest("[data-img-crop-cancel]")) return void imageStudio.cancelCropDraw(KEY);
  if (event.target.closest("[data-img-crop-apply]")) return void applyCropSelection();
  const cropAspect = event.target.closest("[data-img-crop-aspect]");
  if (cropAspect) {
    const id = cropAspect.dataset.imgCropAspect;
    const ratio = id === "free" ? null : imageStudio.formatChoices(KEY).find((f) => f.id === id)?.ratio || null;
    return void imageStudio.setCropAspect(KEY, ratio);
  }
  // Add text → drop an element that opens straight into inline edit; focus it so
  // typing replaces "Your text".
  if (event.target.closest("[data-img-add-text]")) {
    imageStudio.addOverlay(KEY, { kind: "text" });
    focusEditingText({ selectAll: true });
    return;
  }
  if (event.target.closest("[data-img-logo-upload]")) {
    imageStudio.setOpenPopover(KEY, null);
    return void openLogoPicker();
  }
  const preset = event.target.closest("[data-img-logo-preset]");
  if (preset) {
    imageStudio.setOpenPopover(KEY, null);
    return void imageStudio.addOverlay(KEY, { kind: "logo", url: preset.dataset.imgLogoPreset });
  }

  // ── Overlay chrome ──
  const ovDel = event.target.closest("[data-img-overlay-delete]");
  if (ovDel) return void imageStudio.removeOverlay(KEY, ovDel.dataset.imgOverlayDelete);
  const ovRotReset = event.target.closest("[data-img-overlay-rotate-reset]");
  if (ovRotReset) return void imageStudio.updateOverlay(KEY, ovRotReset.dataset.imgOverlayRotateReset, { rot: 0 });
  // Text style controls (from the element's mini toolbar); keep the caret in the
  // contenteditable afterwards if we're editing.
  const restoreEdit = () => {
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  };
  const txtColor = event.target.closest("[data-img-text-color]");
  if (txtColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { color: txtColor.dataset.imgTextColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  const outColor = event.target.closest("[data-img-outline-color]");
  if (outColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outlineColor: outColor.dataset.imgOutlineColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  const fontPick = event.target.closest("[data-img-font]");
  if (fontPick && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { fontFamily: fontPick.dataset.imgFont || null });
    imageStudio.setOpenPopover(KEY, null);
    restoreEdit();
    return;
  }
  if (event.target.closest("[data-img-text-bold]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { bold: !o?.bold });
    restoreEdit();
    return;
  }
  if (event.target.closest("[data-img-text-italic]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { italic: !o?.italic });
    restoreEdit();
    return;
  }

  // ── Commit ──
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-apply-slide]")) return void commitSlideEdit();
  if (event.target.closest("[data-img-use]")) return void useImage();

  // Click on the image but not on an element → deselect + exit inline edit
  // (selectOverlay(null) also clears editingOverlayId).
  if (
    (st.selectedOverlayId || st.editingOverlayId) &&
    event.target.closest(".isv2-frame") &&
    !event.target.closest("[data-img-overlay]")
  ) {
    return void imageStudio.selectOverlay(KEY, null);
  }
}

function onInput(event) {
  if (event.target.matches("[data-img-render-text]")) {
    imageStudio.setRenderTextSilent(KEY, event.target.value);
    const count = ctx.modal.querySelector("[data-img-render-text-count]");
    if (count) count.textContent = `${event.target.value.length}/${imageStudio.MAX_RENDER_TEXT}`;
    return;
  }
  if (event.target.matches("[data-img-prompt]")) {
    imageStudio.setPromptSilent(KEY, event.target.value);
    const gen = ctx.modal.querySelector("[data-img-generate]");
    if (gen) gen.disabled = !event.target.value.trim();
    autosize(event.target);
  } else if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
    autosize(event.target);
  } else if (event.target.matches("[data-img-overlay-text]")) {
    // Inline text editing: sync the contenteditable to state WITHOUT re-render
    // so the caret / focus survive (the DOM node is the source of truth here).
    const st = state();
    if (st?.editingOverlayId)
      imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: event.target.textContent });
  } else if (event.target.matches("[data-img-text-colorpick]")) {
    // Live colour preview while dragging the picker (no re-render).
    const st = state();
    if (!st?.selectedOverlayId) return;
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { color: event.target.value });
    const node = ctx.modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.color = event.target.value;
  } else if (event.target.matches("[data-img-outline-colorpick]")) {
    // Live outline-colour preview (stroke colour only; width stays).
    const st = state();
    if (!st?.selectedOverlayId) return;
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { outlineColor: event.target.value });
    const node = ctx.modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.webkitTextStrokeColor = event.target.value;
  } else if (event.target.matches("[data-img-outline-width]")) {
    // Live outline-thickness preview (stroke width only; colour stays).
    const st = state();
    if (!st?.selectedOverlayId) return;
    const v = Number(event.target.value);
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { outlineWidth: v });
    const node = ctx.modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.webkitTextStrokeWidth = `${outlineMetrics(v).emStroke}em`;
    event.target.style.setProperty("--fill", `${v}%`);
    const valEl = ctx.modal.querySelector("[data-img-outline-val]");
    if (valEl) valEl.textContent = String(v);
  } else if (event.target.matches("[data-img-shadow-intensity]")) {
    // Live shadow-intensity preview (no re-render → the slider drag isn't lost).
    const st = state();
    if (!st?.selectedOverlayId) return;
    const v = Number(event.target.value);
    imageStudio.updateOverlaySilent(KEY, st.selectedOverlayId, { shadowIntensity: v });
    const sm = shadowMetrics(v);
    const node = ctx.modal.querySelector(`[data-img-overlay="${st.selectedOverlayId}"] .image-studio__overlay-text`);
    if (node) node.style.textShadow = `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})`;
    event.target.style.setProperty("--fill", `${v}%`);
    const valEl = ctx.modal.querySelector("[data-img-shadow-val]");
    if (valEl) valEl.textContent = String(v);
  }
}

// The native colour picker commits on "change" — persist it as a swatch then.
function onChange(event) {
  const st = state();
  if (event.target.matches("[data-img-text-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "color");
    imageStudio.setOpenPopover(KEY, null);
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  } else if (event.target.matches("[data-img-outline-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "outlineColor");
    imageStudio.setOpenPopover(KEY, null);
    if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
  } else if (event.target.matches("[data-img-outline-toggle]") && st?.selectedOverlayId) {
    toggleTextEffect("outline", event.target.checked);
  } else if (event.target.matches("[data-img-shadow-toggle]") && st?.selectedOverlayId) {
    toggleTextEffect("shadow", event.target.checked);
  } else if (event.target.matches("[data-img-outline-width]") && st?.selectedOverlayId) {
    // Slider release commits + re-renders (live preview happened in onInput).
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outlineWidth: Number(event.target.value) });
  } else if (event.target.matches("[data-img-shadow-intensity]") && st?.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { shadowIntensity: Number(event.target.value) });
  } else if (event.target.matches("[data-img-toggle-ref]")) {
    imageStudio.setUseReference(KEY, event.target.checked);
  } else if (event.target.matches("[data-img-render-text]")) {
    // Blur commits, which is what refreshes the collapsed row's value.
    imageStudio.commitRenderText(KEY, event.target.value);
  }
}

// Toggle outline / shadow on the selected text WITHOUT a re-render — the open
// popover stays mounted so it doesn't replay its entrance animation (the "jump").
// State is updated silently and the DOM is patched to match: the text style, the
// popover's dim state, the toolbar button, and the slider's enabled state.
function toggleTextEffect(kind, on) {
  const st = state();
  const id = st?.selectedOverlayId;
  if (!id) return;
  imageStudio.updateOverlaySilent(KEY, id, { [kind]: on });
  const o = (st.overlays || []).find((ov) => ov.id === id);
  const textNode = ctx.modal.querySelector(`[data-img-overlay="${id}"] .image-studio__overlay-text`);
  if (kind === "outline") {
    if (textNode) {
      textNode.style.webkitTextStroke = on
        ? `${outlineMetrics(o?.outlineWidth).emStroke}em ${o?.outlineColor || "#0A1B33"}`
        : "";
      textNode.style.paintOrder = on ? "stroke" : "";
    }
    const slider = ctx.modal.querySelector("[data-img-outline-width]");
    if (slider) slider.disabled = !on;
  } else {
    const sm = shadowMetrics(o?.shadowIntensity);
    if (textNode) textNode.style.textShadow = on ? `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})` : "";
    const slider = ctx.modal.querySelector("[data-img-shadow-intensity]");
    if (slider) slider.disabled = !on;
  }
  const btn = ctx.modal.querySelector(`.image-studio__tt-${kind}`);
  if (btn) btn.classList.toggle("is-on", on);
  const pop = ctx.modal.querySelector(`.image-studio__popover--${kind}`);
  if (pop) pop.classList.toggle("is-off", !on);
}

// ── Drag & drop reference images ────────────────────────────────────────────
// The References dropzone lives inside a sheet that is usually closed, so the
// WHOLE modal accepts an image drop in generate mode — dragging a file in is
// unambiguous enough not to need the sheet open first. The dropzone itself still
// lights up when it happens to be visible.

function isImageDrag(event) {
  return [...(event.dataTransfer?.items || [])].some((i) => i.kind === "file");
}

function onDragOver(event) {
  if (state()?.mode !== "generate" || !isImageDrag(event)) return;
  event.preventDefault();
  ctx.modal.querySelector(".isv2")?.classList.add("is-dragover");
  event.target.closest?.("[data-img-dropzone]")?.classList.add("is-dragover");
}

function onDragLeave(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (dz && !dz.contains(event.relatedTarget)) dz.classList.remove("is-dragover");
  if (!ctx.modal.contains(event.relatedTarget)) ctx.modal.querySelector(".isv2")?.classList.remove("is-dragover");
}

function onDrop(event) {
  if (state()?.mode !== "generate") return;
  event.preventDefault();
  ctx.modal.querySelector(".isv2")?.classList.remove("is-dragover");
  event.target.closest?.("[data-img-dropzone]")?.classList.remove("is-dragover");
  const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  for (const f of files) imageStudio.addReferenceImage(KEY, URL.createObjectURL(f));
  // Show what just landed — a drop with the sheet closed would otherwise only
  // change a chip's count.
  imageStudio.setOpenPopover(KEY, "refs");
}

function onPointerDown(event) {
  const st0 = state();
  // Crop draw mode owns pointer gestures on the frame: a handle resizes, the box
  // moves, the dimmed area draws a fresh rectangle.
  if (st0?.cropDrawing) {
    if (st0.editBusy) return;
    const handle = event.target.closest("[data-img-crop-handle]");
    if (handle) return void startCropGesture(event, "resize", handle.dataset.imgCropHandle);
    if (event.target.closest("[data-img-croprect]")) return void startCropGesture(event, "move");
    if (event.target.closest("[data-img-crop-layer]")) return void startCropGesture(event, "draw");
    return;
  }
  if (event.target.closest("[data-img-overlay-delete]")) return; // click handles delete
  if (event.target.closest("[data-img-overlay-rotate-reset]")) return; // click handles reset
  // Clicks on the element's mini toolbar / a popover are UI, not a drag.
  if (event.target.closest("[data-img-text-toolbar]") || event.target.closest("[data-img-popover]")) return;
  const overlayEl = event.target.closest("[data-img-overlay]");
  if (!overlayEl) return;
  // While a text element is being edited, let pointer events reach the
  // contenteditable (caret placement / selection) instead of starting a drag —
  // EXCEPT on the resize / rotate handles, which must stay grabbable so you can
  // resize straight after changing a style without first clicking away.
  const st = state();
  const onHandle = event.target.closest("[data-img-overlay-resize], [data-img-overlay-rotate]");
  if (st?.editingOverlayId === overlayEl.dataset.imgOverlay && !onHandle) return;
  startOverlayGesture(event, overlayEl);
}

// Double-click a text element to edit it inline (the keyboard equivalent is
// Enter on a focused overlay — see onKeydown).
function onDblClick(event) {
  const ov = event.target.closest("[data-img-overlay]");
  if (!ov) return;
  const o = imageStudio.getOverlay(KEY, ov.dataset.imgOverlay);
  if (o?.kind === "text" && !state()?.editBusy) {
    imageStudio.setEditingOverlay(KEY, ov.dataset.imgOverlay);
    focusEditingText({ selectAll: false });
  }
}

// Capture-phase keydown so popover / inline-edit Escape wins before the modal's
// document-level Escape-to-close, and Enter commits inline text (no newline).
function onKeydown(event) {
  const st = state();
  if (!st) return;
  // Both composer fields: Enter runs the bar's primary action, Shift+Enter
  // inserts a newline — the same contract as the main conversational composer.
  if (event.key === "Enter" && !event.shiftKey && event.target.matches("[data-img-edit-prompt]")) {
    event.preventDefault();
    event.stopPropagation();
    if (!st.editBusy) applyEditTool("prompt");
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && event.target.matches("[data-img-prompt]")) {
    event.preventDefault();
    event.stopPropagation();
    if (st.genPhase !== "generating") runGenerate();
    return;
  }
  if (event.key === "Enter" && st.editingOverlayId) {
    event.preventDefault();
    event.stopPropagation();
    syncEditingText();
    imageStudio.setEditingOverlay(KEY, null);
    return;
  }
  if (event.key === "Enter" && !st.editingOverlayId) {
    // Enter on a focused (selected, non-editing) text overlay enters edit mode.
    const ov = event.target.closest?.("[data-img-overlay]");
    const o = ov ? imageStudio.getOverlay(KEY, ov.dataset.imgOverlay) : null;
    if (o?.kind === "text" && !st.editBusy) {
      event.preventDefault();
      event.stopPropagation();
      imageStudio.setEditingOverlay(KEY, ov.dataset.imgOverlay);
      focusEditingText({ selectAll: true });
    }
    return;
  }
  if (event.key === "Escape") {
    if (st.openPopover) {
      event.stopPropagation();
      return void imageStudio.setOpenPopover(KEY, null);
    }
    if (st.cropDrawing && !st.editBusy) {
      event.stopPropagation();
      return void imageStudio.cancelCropDraw(KEY);
    }
    if (st.editingOverlayId) {
      event.stopPropagation();
      syncEditingText();
      return void imageStudio.setEditingOverlay(KEY, null);
    }
    // else: fall through to the modal's document-level Escape (close).
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("isv2Backdrop");
  ctx.modal = document.getElementById("isv2Modal");
  ctx.body = document.getElementById("isv2Body");
  ctx.modal.addEventListener("click", onClick);
  ctx.modal.addEventListener("input", onInput);
  ctx.modal.addEventListener("change", onChange);
  ctx.modal.addEventListener("pointerdown", onPointerDown);
  ctx.modal.addEventListener("dblclick", onDblClick);
  ctx.modal.addEventListener("keydown", onKeydown, true); // capture (Escape/Enter order)
  ctx.modal.addEventListener("dragover", onDragOver);
  ctx.modal.addEventListener("dragleave", onDragLeave);
  ctx.modal.addEventListener("drop", onDrop);
  bindOverlayDismissal({ modal: ctx.modal, backdrop, close });
}

export function open(postId, opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  ctx.postId = postId || null;
  ctx.sessionId = opts.sessionId || null;

  // Resolve the draft's network so the format options + default match where the
  // image will publish (a LinkedIn draft defaults to LinkedIn's ratio).
  const post = ctx.sessionId ? getPosts(ctx.sessionId).find((p) => p.id === ctx.postId) : null;
  // editImageUrl (post card hover → "Edit") opens straight into Edit mode on the
  // draft's existing image; carouselUrls reopens an existing carousel in the
  // results view (add / remove / regenerate slides). Otherwise the generate flow.
  const editImageUrl = opts.editImageUrl || null;
  const carouselUrls = Array.isArray(opts.carouselUrls) && opts.carouselUrls.length > 1 ? opts.carouselUrls : null;
  // Pull the session's Playbook brand reference images so generation stays
  // on-brand — the user can add their own or toggle the Playbook set off.
  const session = ctx.sessionId ? getSessionById(ctx.sessionId) : null;
  const context = session?.contextId ? getContextById(session.contextId) : null;
  imageStudio.start(KEY, {
    postId: ctx.postId,
    // The draft's copy — what "Suggest from this post" writes the brief from, so
    // the prompt Archie proposes is genuinely about this post.
    postText: Array.isArray(post?.text) ? post.text.join("\n") : post?.text || "",
    network: post?.network || null,
    formatId: post?.format || null,
    editImage: editImageUrl ? { url: editImageUrl } : null,
    carousel: carouselUrls ? { urls: carouselUrls } : null,
    playbookId: context?.id || null,
    playbookRefs: context?.referenceImages || [],
    playbookName: context?.brandName || context?.name || "",
    playbookColors: (Array.isArray(context?.brandColors) ? context.brandColors : [])
      .map((c) => c && c.hex)
      .filter(Boolean),
  });
  if (unsub) unsub();
  unsub = imageStudio.subscribe(KEY, renderBody);

  backdrop.hidden = false;
  backdrop.classList.add("open");
  ctx.modal.classList.add("open");
  ctx.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  renderBody();
  if (editImageUrl) {
    // Refine the working-image dims from the real image so the frame ratio and
    // the overlay bake match it (start() used a format-based guess).
    loadImg(editImageUrl)
      .then((img) => imageStudio.setEditImageDims(KEY, img.naturalWidth, img.naturalHeight))
      .catch(() => {});
  } else if (ctx.postId && !carouselUrls) {
    imageStudio.runDerive(KEY);
  }
}

function close() {
  if (!initialized) return;
  if (unsub) {
    unsub();
    unsub = null;
  }
  imageStudio.exit(KEY);
  ctx.modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  ctx.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  ctx.postId = null;
  ctx.sessionId = null;
  notifyClose(MODAL_ID);
}
