// Tiny coordinator to enforce "one overlay at a time" across modals,
// drawers, and the shortcut legend. Resolves FIND-23 — every overlay
// previously bound its own document keydown listener and called open()
// blind, so two topbar buttons clicked in quick succession could stack
// two modals (with z-index races and Esc behaviour undefined).
//
// Usage:
//   import { requestOpen, notifyClose } from "./modal-coordinator.js";
//
//   export function open() {
//     requestOpen("bugReport", close);   // closes the active overlay first
//     ... show modal ...
//   }
//   export function close() {
//     ... hide modal ...
//     notifyClose("bugReport");
//   }
//
// Re-entry safety: requestOpen detects when the active overlay is the
// same id (e.g. the user pressed the toggle twice) and is a no-op so we
// don't recursively call close on ourselves.
//
// Focus restore (FIND-C): the coordinator snapshots document.activeElement
// when an overlay opens and re-focuses it on close. This makes every
// overlay keyboard-friendly without each one having to track focus itself
// (only search-modal.js used to do this).

let activeId = null;
let activeClose = null;
let lastFocus = null;

export function requestOpen(id, closeFn) {
  if (activeId === id) return;
  if (activeId && typeof activeClose === "function") {
    const prevId = activeId;
    const prevClose = activeClose;
    // Clear first so prev's close() can call notifyClose(prevId) without
    // racing the upcoming registration.
    activeId = null;
    activeClose = null;
    try {
      prevClose();
    } catch (err) {
      console.warn(`[modal-coordinator] close handler for ${prevId} threw`, err);
    }
  } else {
    // Snapshot focus ONLY on a fresh open. Modal→modal swaps reuse the
    // first overlay's snapshot so the user lands back on the trigger
    // that started the chain.
    const active = document.activeElement;
    lastFocus = active instanceof HTMLElement ? active : null;
  }
  activeId = id;
  activeClose = closeFn;
}

export function notifyClose(id) {
  if (activeId === id) {
    activeId = null;
    activeClose = null;
    const target = lastFocus;
    lastFocus = null;
    if (target && typeof target.focus === "function" && document.body.contains(target)) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        // ignore — element may have been removed from the DOM
      }
    }
  }
}

// bindOverlayDismissal wires the common dismissal patterns (Escape key,
// backdrop click) to a modal's close handler. Returns nothing — call
// once during init().
//
// Each modal still owns its own DOM structure, open() signature, and
// state reset; this helper just removes the boilerplate every overlay
// would otherwise repeat. Centralising it makes "press Esc when this
// modal is on top" behave identically everywhere.
//
// Usage:
//   bindOverlayDismissal({
//     modal,       // the .ap-dialog / .ap-drawer element with `.open` class
//     backdrop,    // the click-to-dismiss backdrop element (optional)
//     close,       // the modal-local close() function
//     isOpen,      // optional: defaults to modal.classList.contains("open")
//   });
export function bindOverlayDismissal({ modal, backdrop, close, isOpen }) {
  const opened = isOpen || (() => modal?.classList.contains("open"));
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      if (opened()) close();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && opened()) close();
  });
}
