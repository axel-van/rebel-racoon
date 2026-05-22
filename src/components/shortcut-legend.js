/* Keyboard-shortcut cheat sheet.
 *
 * Small dialog listing the shortcuts available across the app. Opens via
 * the topbar "?" icon button, the "?" key (when no input is focused), or
 * programmatically. Closes on Escape, backdrop click, or another "?"
 * press. Reuses the standard .app-modal-backdrop + .ap-dialog primitives
 * already used by other modals in this app.
 */

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";

const OVERLAY_ID = "shortcutLegend";

const HTML = `
<div class="app-modal-backdrop shortcut-legend__backdrop" id="shortcutLegendBackdrop" hidden></div>
<aside
  class="ap-dialog shortcut-legend"
  id="shortcutLegend"
  role="dialog"
  aria-modal="true"
  aria-labelledby="shortcutLegendTitle"
  aria-hidden="true"
>
  <header class="ap-dialog-header">
    <h2 id="shortcutLegendTitle">Keyboard shortcuts</h2>
    <button
      type="button"
      class="ap-icon-button transparent ap-dialog-close"
      aria-label="Close"
      id="shortcutLegendClose"
    >
      <i class="ap-icon-close"></i>
    </button>
  </header>
  <div class="ap-dialog-content shortcut-legend__content">
    <dl class="shortcut-legend__list">
      <div class="shortcut-legend__row">
        <dt><kbd>?</kbd></dt>
        <dd>Show this list</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>Esc</kbd></dt>
        <dd>Close any modal, drawer, popover, or right panel</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>Enter</kbd></dt>
        <dd>Submit the current form or send a message</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>⌘</kbd> + <kbd>Enter</kbd></dt>
        <dd>Send a message from anywhere in the composer</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>Shift</kbd> + <kbd>Enter</kbd></dt>
        <dd>New line in the composer</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>⌘</kbd> + <kbd>B</kbd></dt>
        <dd>Toggle the sidebar (collapse to icon rail or expand)</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>1</kbd>–<kbd>9</kbd></dt>
        <dd>Pick an option in wizards and pickers</dd>
      </div>
      <div class="shortcut-legend__row">
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt>
        <dd>Navigate options in wizards and pickers</dd>
      </div>
    </dl>
  </div>
</aside>`;

let backdrop;
let modal;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);
  backdrop = document.getElementById("shortcutLegendBackdrop");
  modal = document.getElementById("shortcutLegend");
  document.getElementById("shortcutLegendClose")?.addEventListener("click", close);
  bindOverlayDismissal({ modal, backdrop, close });
}

export function open() {
  if (!initialized) init();
  requestOpen(OVERLAY_ID, close);
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  notifyClose(OVERLAY_ID);
}

export function toggle() {
  if (!initialized) init();
  if (modal.classList.contains("open")) close();
  else open();
}
