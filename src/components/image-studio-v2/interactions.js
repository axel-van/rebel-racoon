// Image Studio v2 — imperative interactions: throwaway file/logo pickers and the
// on-canvas pointer gestures (drag / resize / rotate an overlay, draw / move /
// resize the crop rectangle, then apply the crop). These run outside the render
// cycle: gestures update state silently + move the DOM node directly during the
// drag for smoothness, then notify (re-render) on pointer-up. All DOM queries go
// through ctx.modal.

import { KEY, ctx, state, clamp, FRAME_SEL } from "./context.js?v=53";
import { cropImage } from "../image-studio/canvas.js?v=2";
import * as imageStudio from "../../image-studio.js?v=89";

// ── File / font pickers ─────────────────────────────────────────────────────

// Throwaway file picker for the References sheet.
export function openFilePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    imageStudio.addReferenceImage(KEY, URL.createObjectURL(file));
  });
  input.click();
}

// Upload a logo → add it as a draggable overlay element.
export function openLogoPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) imageStudio.addOverlay(KEY, { kind: "logo", url: URL.createObjectURL(file) });
  });
  input.click();
}

// ── Overlay gesture ─────────────────────────────────────────────────────────

// Move / resize / rotate a placed overlay. Updates state silently + the element
// directly during the gesture (no re-render → smooth), then notifies on up.
export function startOverlayGesture(event, el) {
  event.preventDefault();
  const id = el.dataset.imgOverlay;
  const o = imageStudio.getOverlay(KEY, id);
  const frame = ctx.modal.querySelector(FRAME_SEL);
  if (!o || !frame) return;
  const rect = frame.getBoundingClientRect();
  const mode = event.target.closest("[data-img-overlay-resize]")
    ? "resize"
    : event.target.closest("[data-img-overlay-rotate]")
      ? "rotate"
      : "move";
  // Select immediately without a re-render (toggle classes directly).
  const st = state();
  if (st) st.selectedOverlayId = id;
  ctx.modal.querySelectorAll(".image-studio__overlay.is-selected").forEach((n) => n.classList.remove("is-selected"));
  el.classList.add("is-selected");
  // Hide the text mini-toolbar while dragging so it doesn't trail the element.
  const layer = ctx.modal.querySelector("[data-img-overlay-layer]");
  if (layer) {
    layer.classList.add("is-gesturing");
    layer.appendChild(el); // bring the selected element to the front (DOM order)
    imageStudio.bringOverlayToFrontSilent(KEY, id); // keep state order in sync
  }

  const cx = rect.left + o.xF * rect.width;
  const cy = rect.top + o.yF * rect.height;
  const startDist = Math.hypot(event.clientX - cx, event.clientY - cy) || 1;
  const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
  const start = { px: event.clientX, py: event.clientY, xF: o.xF, yF: o.yF, wF: o.wF, sizeF: o.sizeF, rot: o.rot || 0 };
  const textNode = el.querySelector(".image-studio__overlay-text");

  const move = (e) => {
    if (mode === "move") {
      const xF = clamp(start.xF + (e.clientX - start.px) / rect.width, 0.02, 0.98);
      const yF = clamp(start.yF + (e.clientY - start.py) / rect.height, 0.02, 0.98);
      imageStudio.updateOverlaySilent(KEY, id, { xF, yF });
      el.style.left = `${xF * 100}%`;
      el.style.top = `${yF * 100}%`;
    } else if (mode === "resize") {
      const factor = Math.hypot(e.clientX - cx, e.clientY - cy) / startDist;
      if (o.kind === "logo") {
        const wF = clamp(start.wF * factor, 0.05, 1.3);
        imageStudio.updateOverlaySilent(KEY, id, { wF });
        el.style.width = `${wF * 100}%`;
      } else {
        const sizeF = clamp(start.sizeF * factor, 0.02, 0.5);
        imageStudio.updateOverlaySilent(KEY, id, { sizeF });
        if (textNode) textNode.style.fontSize = `${sizeF * 100}cqh`;
      }
    } else {
      const rot = start.rot + (Math.atan2(e.clientY - cy, e.clientX - cx) - startAngle);
      imageStudio.updateOverlaySilent(KEY, id, { rot });
      el.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (layer) layer.classList.remove("is-gesturing");
    // Interacting with an element ends any inline text edit (of another
    // element); the re-render below drops its contenteditable.
    const cur = state();
    if (cur) cur.editingOverlayId = null;
    imageStudio.notifyOverlays(KEY);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ── Crop gesture + apply ────────────────────────────────────────────────────

// Draw / move / resize the freeform crop rectangle. Like startOverlayGesture but
// in fraction space on { xF, yF, wF, hF }: "move" translates the box, "resize"
// drags one corner from the opposite anchor, "draw" starts a fresh box from the
// pointerdown point. Honours the aspect lock; updates inline during the drag,
// persists (with a re-render) on pointer-up.
export function startCropGesture(event, mode, corner) {
  event.preventDefault();
  const frame = ctx.modal.querySelector(FRAME_SEL);
  const boxEl = ctx.modal.querySelector("[data-img-croprect]");
  const st = state();
  if (!frame || !boxEl || !st || !st.cropRect) return;
  const rect = frame.getBoundingClientRect();
  const k = st.cropAspect ? st.cropAspect / (rect.width / rect.height) : null; // wF/hF lock
  const r0 = { ...st.cropRect };
  const fx = (cx) => clamp((cx - rect.left) / rect.width, 0, 1);
  const fy = (cy) => clamp((cy - rect.top) / rect.height, 0, 1);

  // Fixed corner for a resize; the pointerdown point for a fresh draw.
  let anchorX;
  let anchorY;
  if (mode === "resize") {
    anchorX = corner === "nw" || corner === "sw" ? r0.xF + r0.wF : r0.xF;
    anchorY = corner === "nw" || corner === "ne" ? r0.yF + r0.hF : r0.yF;
  } else if (mode === "draw") {
    anchorX = fx(event.clientX);
    anchorY = fy(event.clientY);
  }
  const startPx = event.clientX;
  const startPy = event.clientY;

  const paint = (next) => {
    imageStudio.setCropRectSilent(KEY, next);
    const c = state().cropRect;
    boxEl.style.left = `${c.xF * 100}%`;
    boxEl.style.top = `${c.yF * 100}%`;
    boxEl.style.width = `${c.wF * 100}%`;
    boxEl.style.height = `${c.hF * 100}%`;
  };

  const move = (e) => {
    if (mode === "move") {
      const dx = (e.clientX - startPx) / rect.width;
      const dy = (e.clientY - startPy) / rect.height;
      paint({
        xF: clamp(r0.xF + dx, 0, 1 - r0.wF),
        yF: clamp(r0.yF + dy, 0, 1 - r0.hF),
        wF: r0.wF,
        hF: r0.hF,
      });
      return;
    }
    // resize / draw — the corner opposite the anchor follows the pointer.
    const px = fx(e.clientX);
    const py = fy(e.clientY);
    let wF = Math.abs(px - anchorX);
    let hF = Math.abs(py - anchorY);
    if (k) {
      // Lock the aspect, driven by whichever axis the pointer moved farther on.
      if (wF >= hF * k) hF = wF / k;
      else wF = hF * k;
    }
    paint({
      xF: px >= anchorX ? anchorX : anchorX - wF,
      yF: py >= anchorY ? anchorY : anchorY - hF,
      wF,
      hF,
    });
  };
  // Hide the below-box confirm pair for the duration of the drag (its position
  // is only recomputed on re-render); pointer-up's re-render puts it back.
  frame.classList.add("is-gesturing");
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    frame.classList.remove("is-gesturing");
    const cur = state();
    if (cur && cur.cropRect) imageStudio.setCropRect(KEY, cur.cropRect); // persist + re-render
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function applyCropSelection() {
  const st = state();
  if (!st || !st.currentImage || !st.cropRect || st.editBusy) return;
  const r = st.cropRect;
  imageStudio.beginCropApply(KEY);
  cropImage(st.currentImage.url, r)
    .then((res) => imageStudio.commitCrop(KEY, res))
    .catch(() => imageStudio.abortCropApply(KEY));
}
