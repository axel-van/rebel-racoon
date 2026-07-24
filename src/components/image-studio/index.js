// Image Studio — a near-fullscreen modal "Generate an image" flow inspired by
// Adobe Firefly. Opened from a draft (post card / right-panel Drafts); the
// chosen image attaches back to that draft. Same module-singleton pattern as the
// other modals: init() injects the DOM once, open(postId, { sessionId }) and
// close() toggle it, coordinated by modal-coordinator.js.
//
// This entry owns the modal shell, the render loop, the event delegation, the
// commit-to-draft path, and the public API. The rest of the feature is split
// across sibling modules (see context.js for the map):
//   context.js       — KEY + shared ctx refs + state()
//   canvas.js        — image bake + text metrics (pure)
//   compose-view.js  — generate-mode left panel render
//   edit-view.js     — edit-mode canvas / overlays / popovers render
//   shell-view.js    — shell + shared canvas states + footer (renderStudio)
//   interactions.js  — file/font pickers + on-canvas pointer gestures
//
// State + all mock behavior live in ../../image-studio.js (UI-agnostic). It
// REUSES the shared .gen-* image tiles / preview primitives from
// styles/screens/modals.css.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../../modal-coordinator.js?v=21";
import { showToast } from "../toast.js?v=20";
import { getPosts, attachImageToDraft, attachCarouselToDraft } from "../../posts-store.js?v=36";
import { getSessionById } from "../../sessions-store.js?v=6";
import { getContextById } from "../../contexts-store.js?v=37";
import { MODAL_ID, KEY, ctx, state } from "./context.js?v=2";
import { compositeOverlays, loadImg, shadowMetrics, STROKE_K } from "./canvas.js?v=1";
import { renderStudio } from "./shell-view.js?v=9";
import {
  openFilePicker,
  openLogoPicker,
  startOverlayGesture,
  startCropGesture,
  applyCropSelection,
} from "./interactions.js?v=3";
import * as imageStudio from "../../image-studio.js?v=28";

let backdrop;
let initialized = false;
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

function renderBody() {
  const st = state();
  if (!st || !ctx.body) return;
  ctx.body.innerHTML = renderStudio(st);
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
// slide, then return to the carousel results filmstrip (updateSlide flips the
// mode). "Use carousel" then ships the edited set.
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

// Apply an edit — a mocked reseed inside applyEdit (Reprompt syncs its note first).
function applyEditTool(tool) {
  if (tool === "prompt") {
    const ta = ctx.modal.querySelector("[data-img-edit-prompt]");
    if (ta) imageStudio.setEditPromptSilent(KEY, ta.value);
  }
  imageStudio.applyEdit(KEY, tool);
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
  const outBtn = event.target.closest("[data-img-output]");
  if (outBtn) return void imageStudio.setOutputMode(KEY, outBtn.dataset.imgOutput);
  const slideBtn = event.target.closest("[data-img-slidecount]");
  if (slideBtn) return void imageStudio.setSlideCount(KEY, Number(slideBtn.dataset.imgSlidecount));
  const grpToggle = event.target.closest("[data-img-group-toggle]");
  if (grpToggle && !grpToggle.disabled)
    return void imageStudio.toggleGroupCollapsed(KEY, grpToggle.dataset.imgGroupToggle);
  // Brand kit toggle is a DS switch (checkbox) — handled in onChange.
  if (event.target.closest("[data-img-ref-add]")) return void openFilePicker("ref");
  const refToggle = event.target.closest("[data-img-ref-toggle]");
  if (refToggle) return void imageStudio.toggleReferenceImage(KEY, refToggle.dataset.imgRefToggle);
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);
  if (event.target.closest("[data-img-derive]") && !st.promptLoading) return void imageStudio.runDerive(KEY);
  const modeBtn = event.target.closest("[data-img-mode]");
  if (modeBtn) return void imageStudio.setMode(KEY, modeBtn.dataset.imgMode);
  const viewBtn = event.target.closest("[data-img-view]");
  if (viewBtn) return void imageStudio.setCanvasView(KEY, viewBtn.dataset.imgView);
  // Generate + Regenerate share the same path: sync the prompt, then run.
  if (event.target.closest("[data-img-generate]") || event.target.closest("[data-img-regenerate]")) {
    const ta = ctx.modal.querySelector("[data-img-prompt]");
    if (ta) imageStudio.setPromptSilent(KEY, ta.value);
    if ((state()?.promptText || "").trim()) imageStudio.runGeneration(KEY);
    return;
  }
  if (event.target.closest("[data-img-add-variation]")) return void imageStudio.addVariation(KEY);
  // Remove a slide — checked before the tile-select since it's nested in the tile.
  const varRm = event.target.closest("[data-img-remove-variation]");
  if (varRm) return void imageStudio.removeVariation(KEY, Number(varRm.dataset.imgRemoveVariation));
  const varPick = event.target.closest("[data-img-variation]");
  if (varPick) return void imageStudio.selectVariation(KEY, Number(varPick.dataset.imgVariation));
  // ── Edit action bar + on-canvas manipulation ──
  // Action-bar / text-toolbar popover toggle (Crop, Add logo, text colour).
  const popToggle = event.target.closest("[data-img-popover-toggle]");
  if (popToggle) {
    const name = popToggle.dataset.imgPopoverToggle;
    return void imageStudio.setOpenPopover(KEY, st.openPopover === name ? null : name);
  }
  // A click outside any open popover (but not on its trigger) closes it; fall
  // through so the click still performs its normal action.
  if (st.openPopover && !event.target.closest("[data-img-popover]")) imageStudio.setOpenPopover(KEY, null);

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
  const ovDel = event.target.closest("[data-img-overlay-delete]");
  if (ovDel) return void imageStudio.removeOverlay(KEY, ovDel.dataset.imgOverlayDelete);
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
  // Crop tool → enter the draw-a-rectangle mode.
  if (event.target.closest("[data-img-crop-start]")) return void imageStudio.enterCropDraw(KEY);
  if (event.target.closest("[data-img-crop-cancel]")) return void imageStudio.cancelCropDraw(KEY);
  if (event.target.closest("[data-img-crop-apply]")) return void applyCropSelection();
  const cropAspect = event.target.closest("[data-img-crop-aspect]");
  if (cropAspect) {
    const id = cropAspect.dataset.imgCropAspect;
    const ratio = id === "free" ? null : imageStudio.formatChoices(KEY).find((f) => f.id === id)?.ratio || null;
    return void imageStudio.setCropAspect(KEY, ratio);
  }
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-apply-slide]")) return void commitSlideEdit();
  if (event.target.closest("[data-img-use]")) return void useImage();
  // Click on the image but not on an element → deselect + exit inline edit
  // (selectOverlay(null) also clears editingOverlayId).
  if (
    (st.selectedOverlayId || st.editingOverlayId) &&
    event.target.closest(".image-studio__frame") &&
    !event.target.closest("[data-img-overlay]")
  ) {
    return void imageStudio.selectOverlay(KEY, null);
  }
}

function onInput(event) {
  if (event.target.matches("[data-img-prompt]")) {
    imageStudio.setPromptSilent(KEY, event.target.value);
    const gen = ctx.modal.querySelector("[data-img-generate]");
    if (gen) gen.disabled = !event.target.value.trim();
  } else if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
  } else if (event.target.matches("[data-img-overlay-text]")) {
    // Inline text editing: sync the contenteditable to state WITHOUT re-render so
    // the caret / focus survive (the DOM node is the source of truth here).
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
  } else if (event.target.matches("[data-img-shadow-intensity]") && st?.selectedOverlayId) {
    // Slider release commits + re-renders (live preview happened in onInput).
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { shadowIntensity: Number(event.target.value) });
  } else if (event.target.matches("[data-img-toggle-playbook-refs]")) {
    // Brand kit switch (DS toggle checkbox).
    imageStudio.setUsePlaybookRefs(KEY, event.target.checked);
  }
}

// Toggle outline / shadow on the selected text WITHOUT a re-render — the open
// popover stays mounted so it doesn't replay its entrance animation (the "jump").
// State is updated silently and the DOM is patched to match: the text style, the
// popover's dim state, the toolbar button, and (shadow) the slider's enabled state.
function toggleTextEffect(kind, on) {
  const st = state();
  const id = st?.selectedOverlayId;
  if (!id) return;
  imageStudio.updateOverlaySilent(KEY, id, { [kind]: on });
  const o = (st.overlays || []).find((ov) => ov.id === id);
  const textNode = ctx.modal.querySelector(`[data-img-overlay="${id}"] .image-studio__overlay-text`);
  if (kind === "outline") {
    if (textNode) textNode.style.webkitTextStroke = on ? `${STROKE_K}em ${o?.outlineColor || "#0A1B33"}` : "";
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

// Drag-and-drop reference images onto the "Reference images" drop-zone.
function onDragOver(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (!dz) return;
  event.preventDefault();
  dz.classList.add("is-dragover");
}

function onDragLeave(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (dz && !dz.contains(event.relatedTarget)) dz.classList.remove("is-dragover");
}

function onDrop(event) {
  const dz = event.target.closest?.("[data-img-dropzone]");
  if (!dz) return;
  event.preventDefault();
  dz.classList.remove("is-dragover");
  const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
  for (const f of files) imageStudio.addReferenceImage(KEY, URL.createObjectURL(f));
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
  // Clicks on the element's mini toolbar / a popover are UI, not a drag.
  if (event.target.closest("[data-img-text-toolbar]") || event.target.closest("[data-img-popover]")) return;
  const overlayEl = event.target.closest("[data-img-overlay]");
  if (!overlayEl) return;
  // While a text element is being edited, let pointer events reach the
  // contenteditable (caret placement / selection) instead of starting a drag —
  // EXCEPT on the resize / rotate handles, which must stay grabbable so you can
  // resize straight after changing a style (font/colour/…) without first
  // clicking away to exit inline edit. A handle drag ends the edit on pointerup.
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

// ── Public API ────────────────────────────────────────────────────────────

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("imageStudioBackdrop");
  ctx.modal = document.getElementById("imageStudioModal");
  ctx.body = document.getElementById("imageStudioBody");
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
    network: post?.network || null,
    formatId: post?.format || null,
    editImage: editImageUrl ? { url: editImageUrl } : null,
    carousel: carouselUrls ? { urls: carouselUrls } : null,
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
