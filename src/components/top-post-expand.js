// Top-post expanding card — the winner's preview "grows" out of its board card
// (a FLIP / container-transform): the card morphs from its grid position up to
// a centered, enlarged panel that floats above the others (no scrim), revealing
// the full preview. Replaces the modal surface.
//
// Public API:
//   open(cardEl, post, { onBuild })  — expand from `cardEl` (the clicked
//                                       .top-post-card) into the full preview.
//
// Dismiss: the close button, Esc, or a click outside collapses it back to the
// card. "Build on this" closes then calls onBuild (the reuse flow).

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { renderTopPostPreview } from "./top-post-card.js?v=7";

const MODAL_ID = "topPost";
const DURATION = 300; // ms — enter; exit runs ~70% of this (exit-faster-than-enter)
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

let layer = null;
let panel = null;
let cardRef = null;
let pendingOnBuild = null;
let escHandler = null;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// FLIP transform that places `panel` (at its natural centered geometry) back
// over `rect` (the card), so animating the transform away morphs it open.
function transformFromRect(rect) {
  const end = panel.getBoundingClientRect();
  const dx = rect.left - end.left;
  const dy = rect.top - end.top;
  const sx = rect.width / end.width;
  const sy = rect.height / end.height;
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

export function open(cardEl, post, { onBuild } = {}) {
  if (!post || !cardEl) return;
  if (layer) close({ instant: true });
  requestOpen(MODAL_ID, close);

  cardRef = cardEl;
  pendingOnBuild = typeof onBuild === "function" ? onBuild : null;

  layer = document.createElement("div");
  layer.className = "tp-expand-layer";
  layer.innerHTML = `
    <article class="tp-expand" role="dialog" aria-modal="true" aria-label="Top post preview">
      <button class="ap-icon-button transparent tp-expand__close" type="button" data-tpx-close aria-label="Close">
        <i class="ap-icon-close"></i>
      </button>
      <div class="tp-expand__scroll">${renderTopPostPreview(post)}</div>
    </article>`;
  document.body.appendChild(layer);
  panel = layer.querySelector(".tp-expand");
  document.body.classList.add("has-modal");

  layer.addEventListener("click", onLayerClick);
  escHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", escHandler);

  const start = cardEl.getBoundingClientRect();

  if (prefersReducedMotion()) {
    cardRef.style.visibility = "hidden";
    return; // no morph — panel just appears centered
  }

  // FLIP: start the panel over the card, then release to its centered identity.
  panel.style.transformOrigin = "top left";
  panel.style.transform = transformFromRect(start);
  panel.classList.add("is-collapsed"); // content faded out at the start
  cardRef.style.visibility = "hidden";

  requestAnimationFrame(() => {
    panel.style.transition = `transform ${DURATION}ms ${EASE}`;
    panel.style.transform = "translate(0, 0) scale(1, 1)";
    panel.classList.remove("is-collapsed"); // fades the content in
  });
}

function onLayerClick(event) {
  if (event.target.closest("[data-top-post-build]")) {
    const fn = pendingOnBuild;
    close();
    fn?.();
    return;
  }
  if (event.target.closest("[data-tpx-close]")) {
    close();
    return;
  }
  // Click on the backdrop area (outside the panel) dismisses.
  if (!event.target.closest(".tp-expand")) close();
}

function teardown() {
  if (escHandler) document.removeEventListener("keydown", escHandler);
  escHandler = null;
  layer?.remove();
  if (cardRef) cardRef.style.visibility = "";
  layer = panel = cardRef = pendingOnBuild = null;
  document.body.classList.remove("has-modal");
  notifyClose(MODAL_ID);
}

function close({ instant = false } = {}) {
  if (!layer) return;
  if (instant || prefersReducedMotion() || !cardRef) {
    teardown();
    return;
  }
  // Reverse FLIP — collapse back onto the (still-laid-out) card, then remove.
  const rect = cardRef.getBoundingClientRect();
  const exit = Math.round(DURATION * 0.7);
  panel.style.transition = `transform ${exit}ms ${EASE}`;
  panel.classList.add("is-collapsed");
  panel.style.transform = transformFromRect(rect);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    teardown();
  };
  panel.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, exit + 80); // safety net if transitionend doesn't fire
}
