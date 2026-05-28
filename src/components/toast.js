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

const REGION_ID = "toastRegion";
const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3200;
const ANIMATION_OUT_MS = 300;

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

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
      ${action ? `<button type="button" class="ap-link" data-toast-action>${escapeHtml(action.label)}</button>` : ""}
      <button type="button" aria-label="Close" data-toast-close>
        <i class="ap-icon-close" aria-hidden="true"></i>
      </button>
    </div>
  `;
  region.appendChild(el);

  if (action) {
    el.querySelector("[data-toast-action]")?.addEventListener("click", () => {
      try {
        action.onClick();
      } finally {
        dismiss(el);
      }
    });
  }
  el.querySelector("[data-toast-close]")?.addEventListener("click", () => dismiss(el));

  if (duration > 0) {
    const timer = setTimeout(() => dismiss(el), duration);
    el.addEventListener("mouseenter", () => clearTimeout(timer), { once: true });
  }

  return { dismiss: () => dismiss(el) };
}

function dismiss(el) {
  if (!el || el.classList.contains("animate-out")) return;
  el.classList.remove("animate-in");
  el.classList.add("animate-out");
  setTimeout(() => el.remove(), ANIMATION_OUT_MS);
}
