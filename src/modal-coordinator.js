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

let activeId = null;
let activeClose = null;

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
  }
  activeId = id;
  activeClose = closeFn;
}

export function notifyClose(id) {
  if (activeId === id) {
    activeId = null;
    activeClose = null;
  }
}
