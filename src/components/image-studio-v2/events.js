// Image Studio — every delegated listener, in one place.
//
// Pure event delegation on the modal root: nine listeners, `data-*` hooks, no
// per-child binding. `bindStudioEvents` is called once from init().
//
// Two orderings in here are load-bearing and must stay readable together, which
// is why the handlers are not split by mode:
//
//   onClick    the popover lifecycle runs FIRST, so any other action implicitly
//              closes whatever was open, and then FALLS THROUGH so the click
//              still does its own job. Clicks on a toggle or inside a sheet are
//              exempt. Nested hooks are checked inner-first (remove-a-slide
//              before select-a-slide, or the tile would just get selected).
//
//   onKeydown  bound in CAPTURE, so Escape unwinds popover → crop draw → inline
//              edit before the modal's document-level Escape-to-close ever sees
//              it, and Enter commits inline text instead of inserting a newline.
//
// Anything that patches the DOM instead of re-rendering lives in inline-text.js;
// anything that writes to the draft lives in commit.js.

import { KEY, ctx, state, autosize } from "./context.js?v=1199";
import { useImage, commitSlideEdit, applyEditTool, runGenerate } from "./commit.js?v=1199";
import {
  focusEditingText,
  syncEditingText,
  restoreEditingCaret,
  previewOverlayInput,
  toggleTextEffect,
} from "./inline-text.js?v=1199";
import {
  openFilePicker,
  openLogoPicker,
  startOverlayGesture,
  startCropGesture,
  applyCropSelection,
} from "./interactions.js?v=1199";
import * as imageStudio from "../../image-studio.js?v=1199";

function onClick(event, close) {
  const st = state();
  if (!st) return;

  // The prompt guard is modal WITHIN the studio: while it's up it takes the whole
  // click surface, so nothing behind it can be operated by accident. Its own three
  // controls are handled here and everything else is swallowed — including the ✕,
  // because closing the studio out from under an unanswered question is exactly
  // the kind of data loss the dialog exists to prevent.
  if (st.pendingSettingChange) {
    if (event.target.closest("[data-img-guard-confirm]")) return void imageStudio.confirmSettingChange(KEY);
    if (event.target.closest("[data-img-guard-cancel]")) return void imageStudio.cancelSettingChange(KEY);
    if (event.target.closest("[data-img-guard-skip]")) return; // the checkbox — see onChange
    return; // clicks on the scrim, or anywhere behind it, do nothing
  }

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

  // The option rows — independent, not an accordion. A row the user opened stays open
  // until they close it, and opening a second leaves the first alone; the state is a
  // Set of what's SHUT (`collapsedGroups`).
  const grpToggle = event.target.closest("[data-img-group-toggle]");
  if (grpToggle && !grpToggle.disabled) {
    return void imageStudio.toggleGroupCollapsed(KEY, grpToggle.dataset.imgGroupToggle);
  }

  // The stage's left half: Options ⇄ Advanced (the brief). setPane refuses "advanced" while
  // there is no image, so the disabled chip and the state agree even if a click lands
  // between a generation ending and the re-render.
  const paneBtn = event.target.closest("[data-img-pane]");
  if (paneBtn && !paneBtn.disabled) {
    return void imageStudio.setPane(KEY, paneBtn.dataset.imgPane);
  }

  // The "out of date" overlay's × — keep the current image, close the notice.
  if (event.target.closest("[data-img-stale-dismiss]")) return void imageStudio.dismissStale(KEY);

  // ── The option rows ──
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
  const refMode = event.target.closest("[data-img-ref-mode]");
  if (refMode) return void imageStudio.setRefMode(KEY, refMode.dataset.imgRefMode);
  const refToggle = event.target.closest("[data-img-ref-toggle]");
  if (refToggle) return void imageStudio.toggleReferenceImage(KEY, refToggle.dataset.imgRefToggle);
  const refRm = event.target.closest("[data-img-ref-remove]");
  if (refRm) return void imageStudio.removeReferenceImage(KEY, refRm.dataset.imgRefRemove);

  // ── The brief ──
  // Rebuild hands an edited brief back to Archie — the options drive it again.
  if (event.target.closest("[data-img-brief-rebuild]")) return void imageStudio.rebuildBrief(KEY);

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
  // One of the Playbook's marks — the tile carries its index and the url is read
  // from state, because an uploaded logo is a data URL and would bloat the
  // attribute (see tools-view#playbookMark).
  const pbLogo = event.target.closest("[data-img-logo-playbook]");
  if (pbLogo) {
    const st = state();
    const list = st?.playbookLogos?.length ? st.playbookLogos : st?.playbookLogo ? [{ url: st.playbookLogo }] : [];
    const url = list[Number(pbLogo.dataset.imgLogoPlaybook)]?.url;
    imageStudio.setOpenPopover(KEY, null);
    if (url) imageStudio.addOverlay(KEY, { kind: "logo", url });
    return;
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
  const txtColor = event.target.closest("[data-img-text-color]");
  if (txtColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { color: txtColor.dataset.imgTextColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEditingCaret();
    return;
  }
  const outColor = event.target.closest("[data-img-outline-color]");
  if (outColor && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outlineColor: outColor.dataset.imgOutlineColor });
    imageStudio.setOpenPopover(KEY, null);
    restoreEditingCaret();
    return;
  }
  const fontPick = event.target.closest("[data-img-font]");
  if (fontPick && st.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { fontFamily: fontPick.dataset.imgFont || null });
    imageStudio.setOpenPopover(KEY, null);
    restoreEditingCaret();
    return;
  }
  if (event.target.closest("[data-img-text-bold]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { bold: !o?.bold });
    restoreEditingCaret();
    return;
  }
  if (event.target.closest("[data-img-text-italic]") && st.selectedOverlayId) {
    const o = imageStudio.getOverlay(KEY, st.selectedOverlayId);
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { italic: !o?.italic });
    restoreEditingCaret();
    return;
  }

  // ── Commit ──
  const applyBtn = event.target.closest("[data-img-apply-edit]");
  if (applyBtn) return void applyEditTool(applyBtn.dataset.imgApplyEdit);
  if (event.target.closest("[data-img-undo]")) return void imageStudio.undoEdit(KEY);
  if (event.target.closest("[data-img-apply-slide]")) return void commitSlideEdit();
  if (event.target.closest("[data-img-use]")) return void useImage(close);

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
  // Each brief section is its own editable block. Silent while typing — a re-render
  // would rebuild the block under the caret.
  const briefLine = event.target.matches("[data-img-brief-line]") ? event.target : null;
  if (briefLine) {
    imageStudio.setBriefLineSilent(KEY, briefLine.dataset.imgBriefLine, briefLine.value);
    autosize(briefLine); // grow with what's typed, without a re-render
    return;
  }
  if (event.target.matches("[data-img-render-text]")) {
    imageStudio.setRenderTextSilent(KEY, event.target.value);
    // Toggled inline, never via [hidden]: `.ap-form-message` is `display: flex`,
    // which wins over the attribute.
    const msg = ctx.modal.querySelector("[data-img-render-text-msg]");
    if (msg) {
      const text = imageStudio.renderTextOverMessage(event.target.value);
      msg.textContent = text;
      msg.style.display = text ? "" : "none";
    }
    return;
  }
  if (event.target.matches("[data-img-edit-prompt]")) {
    imageStudio.setEditPromptSilent(KEY, event.target.value);
    autosize(event.target);
  } else {
    // Inline text and the drag-driven style controls patch the DOM directly
    // rather than re-render — see inline-text.js for why each one must.
    previewOverlayInput(event);
  }
}

// The native colour picker commits on "change" — persist it as a swatch then.
function onChange(event) {
  const st = state();
  // Ticking it doesn't answer the question — the user still has to press one of
  // the two buttons. It just decides whether the NEXT one gets asked.
  if (event.target.matches("[data-img-guard-skip]")) {
    return void imageStudio.setSkipPromptWarning(KEY, event.target.checked);
  }
  if (event.target.matches("[data-img-text-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "color");
    imageStudio.setOpenPopover(KEY, null);
    restoreEditingCaret();
  } else if (event.target.matches("[data-img-outline-colorpick]")) {
    imageStudio.addCustomColor(KEY, event.target.value, "outlineColor");
    imageStudio.setOpenPopover(KEY, null);
    restoreEditingCaret();
  } else if (event.target.matches("[data-img-outline-toggle]") && st?.selectedOverlayId) {
    toggleTextEffect("outline", event.target.checked);
  } else if (event.target.matches("[data-img-shadow-toggle]") && st?.selectedOverlayId) {
    toggleTextEffect("shadow", event.target.checked);
  } else if (event.target.matches("[data-img-outline-width]") && st?.selectedOverlayId) {
    // Slider release commits + re-renders (live preview happened in onInput).
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { outlineWidth: Number(event.target.value) });
  } else if (event.target.matches("[data-img-shadow-intensity]") && st?.selectedOverlayId) {
    imageStudio.updateOverlay(KEY, st.selectedOverlayId, { shadowIntensity: Number(event.target.value) });
  } else if (event.target.matches("[data-img-toggle-branding]")) {
    imageStudio.setUseBranding(KEY, event.target.checked);
  } else if (event.target.matches("[data-img-toggle-brand-colors]")) {
    imageStudio.setUseBrandColors(KEY, event.target.checked);
  } else if (event.target.matches("[data-img-toggle-ref]")) {
    imageStudio.setUseReference(KEY, event.target.checked);
  } else if (event.target.matches("[data-img-render-text]")) {
    // Blur commits, which is what refreshes the collapsed row's value.
    imageStudio.commitRenderText(KEY, event.target.value);
  } else if (event.target.matches("[data-img-brief-line]")) {
    // Blur commits the section — and editing is what takes the brief over, so no
    // separate "edit this" step exists.
    imageStudio.commitBriefLine(KEY, event.target.dataset.imgBriefLine, event.target.value);
  }
}

// ── Drag & drop reference images ────────────────────────────────────────────
// The References row can be scrolled out of the options half, so the WHOLE modal
// accepts an image drop in generate mode — dragging a file in is unambiguous enough
// not to need the row in view first. The drop then opens it, because otherwise a
// drop would only change a count somewhere off-screen.

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
  // Show what just landed — a drop with the row closed would otherwise only change
  // a count in its header.
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
  // The guard's own keys are handled on DOCUMENT capture instead — see
  // onGuardKeydown. This listener sits on the modal element, so it only sees keys
  // pressed while focus is inside it.
  if (st.pendingSettingChange) return;
  // The edit composer: Enter runs Redraw, Shift+Enter inserts a newline — the same
  // contract as the main conversational composer.
  if (event.key === "Enter" && !event.shiftKey && event.target.matches("[data-img-edit-prompt]")) {
    event.preventDefault();
    event.stopPropagation();
    if (!st.editBusy) applyEditTool("prompt");
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

// The prompt guard's keys, on DOCUMENT capture. It has to be document-level: the
// studio's Escape-to-close (bindOverlayDismissal) is a document listener too, and
// Escape pressed while focus sits outside the modal — on <body>, after a click on
// the scrim — never travels through the modal element at all. Bound on the modal,
// this would miss those and the studio would close out from under an unanswered
// question, losing far more than the prompt it was asking about.
function onGuardKeydown(event) {
  if (!state()?.pendingSettingChange) return;
  if (event.key !== "Escape" && event.key !== "Enter") return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") imageStudio.cancelSettingChange(KEY);
  else imageStudio.confirmSettingChange(KEY);
}

// ── Wiring ──────────────────────────────────────────────────────────────────

export function bindStudioEvents({ modal, close }) {
  document.addEventListener("keydown", onGuardKeydown, true);
  modal.addEventListener("click", (e) => onClick(e, close));
  modal.addEventListener("input", onInput);
  modal.addEventListener("change", onChange);
  modal.addEventListener("pointerdown", onPointerDown);
  modal.addEventListener("dblclick", onDblClick);
  modal.addEventListener("keydown", onKeydown, true); // capture (Escape/Enter order)
  modal.addEventListener("dragover", onDragOver);
  modal.addEventListener("dragleave", onDragLeave);
  modal.addEventListener("drop", onDrop);
}
