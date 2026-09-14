// Image Studio — the code that patches the DOM instead of re-rendering.
//
// Every other interaction in the studio goes state → notify → rebuild the body.
// These don't, and each one has a specific reason it can't:
//
//   • typing in a text overlay      a rebuild swaps the contenteditable node,
//                                   which loses the caret and the selection
//   • dragging a colour / slider    a rebuild would replace the input mid-drag,
//                                   so the pointer stops driving anything
//   • toggling outline / shadow     the open popover would remount and replay
//                                   its entrance animation (reads as a "jump")
//
// So state is updated SILENTLY (`updateOverlaySilent`, no notify) and the DOM is
// patched to match by hand. That is a real cost: every patch here has to keep
// itself in step with how edit-view.js renders the same thing. It buys the only
// thing that matters for direct manipulation — the control stays under your
// finger.
//
// This module owns two of the three concatenated class families, so a rename in
// styles/screens/image-studio-canvas.css has to come through here:
//   .image-studio__popover--{outline,shadow}   the dim state of an open popover
//   .image-studio__tt-{outline,shadow}         the toolbar button's on state

import { KEY, ctx, state } from "./context.js?v=1160";
import { outlineMetrics, shadowMetrics } from "../../image-studio-canvas.js?v=1160";
import * as imageStudio from "../../image-studio.js?v=1160";

// The live text node of the overlay currently being edited, if any.
function editingTextNode() {
  const st = state();
  if (!st?.editingOverlayId) return null;
  return ctx.modal.querySelector(`[data-img-overlay="${st.editingOverlayId}"] [data-img-overlay-text]`);
}

// The rendered text of a given overlay — what the style patches below write to.
function overlayTextNode(id) {
  return ctx.modal.querySelector(`[data-img-overlay="${id}"] .image-studio__overlay-text`);
}

// Focus the contenteditable of the text overlay in edit mode, so the user types
// directly on the image. `selectAll` selects the whole placeholder ("Your text")
// so the first keystroke replaces it (used when adding); otherwise the caret sits
// at the end (used after a style click re-renders the element). notify() is
// synchronous, so the node is already in the DOM when this is called.
export function focusEditingText({ selectAll = false } = {}) {
  const node = editingTextNode();
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
export function syncEditingText() {
  const st = state();
  if (!st?.editingOverlayId) return;
  const node = editingTextNode();
  if (node) imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: node.textContent });
}

// Keep the caret in the contenteditable after a style click re-rendered it.
export function restoreEditingCaret() {
  if (state()?.editingOverlayId) focusEditingText({ selectAll: false });
}

// The `input` events that must not re-render: inline text, and the three
// drag-driven style controls. Returns true if it handled the event, so the
// caller's dispatch chain can stop.
export function previewOverlayInput(event) {
  const t = event.target;
  const st = state();

  if (t.matches("[data-img-overlay-text]")) {
    // The DOM node is the source of truth while editing; state follows it.
    if (st?.editingOverlayId) imageStudio.updateOverlaySilent(KEY, st.editingOverlayId, { text: t.textContent });
    return true;
  }

  const id = st?.selectedOverlayId;

  if (t.matches("[data-img-text-colorpick]")) {
    if (!id) return true;
    imageStudio.updateOverlaySilent(KEY, id, { color: t.value });
    const node = overlayTextNode(id);
    if (node) node.style.color = t.value;
    return true;
  }

  if (t.matches("[data-img-outline-colorpick]")) {
    // Stroke colour only; the width stays where the slider left it.
    if (!id) return true;
    imageStudio.updateOverlaySilent(KEY, id, { outlineColor: t.value });
    const node = overlayTextNode(id);
    if (node) node.style.webkitTextStrokeColor = t.value;
    return true;
  }

  if (t.matches("[data-img-outline-width]")) {
    if (!id) return true;
    const v = Number(t.value);
    imageStudio.updateOverlaySilent(KEY, id, { outlineWidth: v });
    const node = overlayTextNode(id);
    if (node) node.style.webkitTextStrokeWidth = `${outlineMetrics(v).emStroke}em`;
    paintSlider(t, v, "[data-img-outline-val]");
    return true;
  }

  if (t.matches("[data-img-shadow-intensity]")) {
    if (!id) return true;
    const v = Number(t.value);
    imageStudio.updateOverlaySilent(KEY, id, { shadowIntensity: v });
    const sm = shadowMetrics(v);
    const node = overlayTextNode(id);
    if (node) node.style.textShadow = `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})`;
    paintSlider(t, v, "[data-img-shadow-val]");
    return true;
  }

  return false;
}

// The DS slider paints its filled track from a custom property, and the number
// beside it is a separate node — neither updates itself.
function paintSlider(input, value, valSelector) {
  input.style.setProperty("--fill", `${value}%`);
  const valEl = ctx.modal.querySelector(valSelector);
  if (valEl) valEl.textContent = String(value);
}

// Turn outline / shadow on or off on the selected text WITHOUT a re-render, so
// the open popover stays mounted and doesn't replay its entrance animation. Four
// things have to be patched to match what a render would have produced: the text
// style itself, the popover's dim state, the toolbar button, and whether the
// slider is enabled.
export function toggleTextEffect(kind, on) {
  const st = state();
  const id = st?.selectedOverlayId;
  if (!id) return;
  imageStudio.updateOverlaySilent(KEY, id, { [kind]: on });
  const o = (st.overlays || []).find((ov) => ov.id === id);
  const textNode = overlayTextNode(id);
  if (kind === "outline") {
    if (textNode) {
      textNode.style.webkitTextStroke = on
        ? `${outlineMetrics(o?.outlineWidth).emStroke}em ${o?.outlineColor || "#0A1B33"}`
        : "";
      textNode.style.paintOrder = on ? "stroke" : "";
    }
  } else {
    const sm = shadowMetrics(o?.shadowIntensity);
    if (textNode) textNode.style.textShadow = on ? `0 ${sm.offYEm}em ${sm.blurEm}em rgba(0,0,0,${sm.alpha})` : "";
  }
  const slider = ctx.modal.querySelector(
    kind === "outline" ? "[data-img-outline-width]" : "[data-img-shadow-intensity]",
  );
  if (slider) slider.disabled = !on;
  const btn = ctx.modal.querySelector(`.image-studio__tt-${kind}`);
  if (btn) btn.classList.toggle("is-on", on);
  const pop = ctx.modal.querySelector(`.image-studio__popover--${kind}`);
  if (pop) pop.classList.toggle("is-off", !on);
}
