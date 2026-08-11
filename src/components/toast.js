/* Toast / snackbar system.
 *
 * Wraps the DS .ap-snackbar-thread + .ap-snackbar primitives. The DS
 * provides the visuals + slide animations (animate-in / animate-out);
 * we own the queue, dwell timer, and optional Undo action.
 *
 * Usage:
 *   showToast("Source added");
 *   showToast("Idea unpinned", { action: { label: "Undo", onClick: () => ... } });
 *   showToast("Failed to import", { variant: "error" });
 */

import { escapeHtml } from "../utils.js?v=21";

const REGION_ID = "toastRegion";
const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3200;
const ANIMATION_OUT_MS = 300;

function getRegion() {
  return document.getElementById(REGION_ID);
}

/**
 * Show a toast.
 * @param {string} message
 * @param {object} [opts]
 * @param {"success"|"error"} [opts.variant] — defaults to success
 * @param {number} [opts.duration] — ms before auto-dismiss; pass 0 to keep open
 * @param {{ label: string, onClick: () => void }} [opts.action]
 */
export function showToast(message, opts = {}) {
  const region = getRegion();
  if (!region) return;

  const variant = opts.variant === "error" ? "error" : "success";
  const duration = opts.duration ?? DEFAULT_DURATION;
  const action = opts.action;

  // Trim the oldest if we're over the cap.
  const live = region.querySelectorAll(".ap-snackbar:not(.animate-out)");
  if (live.length >= MAX_VISIBLE) {
    dismiss(live[0]);
  }

  const el = document.createElement("div");
  el.className = `ap-snackbar ${variant} animate-in`;
  el.innerHTML = `
    <div class="ap-snackbar-left">
      <i></i>
      <span>${escapeHtml(message)}</span>
    </div>
    <div class="ap-snackbar-right">
      ${
        // The action MUST be an <a>: the DS styles this slot as
        // `.ap-snackbar-right > a` (action link) and `> button` (close icon), and
        // the close rule is `width/height: 20px; padding: 0; border-radius: 50%`.
        // A <button> here therefore rendered the label inside a 20px circle,
        // overflowing its own box and colliding with the ×. No `.ap-link` either
        // — the slot rule already carries the link treatment, and `.ap-link`
        // would fight it (permanent underline + its own type scale).
        //
        // No `href`: every action is a JS callback, and this app is hash-routed,
        // so an `href="#"` would navigate. `role="button"` + `tabindex` restore
        // what dropping href takes away; Enter/Space are wired up below because
        // an anchor without href doesn't activate on the keyboard by itself.
        action ? `<a role="button" tabindex="0" data-toast-action>${escapeHtml(action.label)}</a>` : ""
      }
      <button type="button" aria-label="Close" data-toast-close>
        <i class="ap-icon-close" aria-hidden="true"></i>
      </button>
    </div>
  `;
  region.appendChild(el);

  if (action) {
    const actionEl = el.querySelector("[data-toast-action]");
    const run = () => {
      try {
        action.onClick();
      } finally {
        dismiss(el);
      }
    };
    actionEl?.addEventListener("click", run);
    actionEl?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); // Space would scroll the page
      run();
    });
  }
  el.querySelector("[data-toast-close]")?.addEventListener("click", () => dismiss(el));

  if (duration > 0) {
    // Pause auto-dismiss while the user hovers, resume on leave. Without
    // the resume hook the toast would dwell forever after a brief hover,
    // which silently kept old snackbars on screen while the user was
    // reaching for the action button or just glancing at the message.
    let timer = setTimeout(() => dismiss(el), duration);
    el.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      timer = null;
    });
    el.addEventListener("mouseleave", () => {
      if (timer == null) timer = setTimeout(() => dismiss(el), duration);
    });
  }

  return { dismiss: () => dismiss(el) };
}

function dismiss(el) {
  if (!el || el.classList.contains("animate-out")) return;
  el.classList.remove("animate-in");
  el.classList.add("animate-out");
  setTimeout(() => el.remove(), ANIMATION_OUT_MS);
}
