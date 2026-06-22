// Top-post preview modal — a classic centered dialog opened by the board
// card's "Details" action. Shows the winner's full preview (renderTopPostPreview,
// 2-column). Standard init/open/close + modal-coordinator pattern (see
// rename-modal.js).
//
// Public API:
//   init()                  — inject markup + bind once on app boot
//   open(post, { onBuild })  — render the preview for `post`; the in-modal
//                              primary CTA closes then calls onBuild (→ the
//                              reuse-mode picker).

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { renderTopPostPreview } from "./top-post-card.js?v=9";

const MODAL_ID = "topPost";

let backdrop, modal, contentEl, closeBtn;
let initialized = false;
let pendingOnBuild = null;

const HTML = `
<div class="app-modal-backdrop top-post-modal__backdrop" id="topPostBackdrop" hidden></div>
<aside
  class="ap-dialog top-post-modal"
  id="topPostModal"
  role="dialog"
  aria-modal="true"
  aria-label="Top post preview"
  aria-hidden="true"
>
  <button class="ap-icon-button transparent top-post-modal__close" type="button" id="topPostClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="top-post-modal__scroll" id="topPostContent"></div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("topPostBackdrop");
  modal = document.getElementById("topPostModal");
  contentEl = document.getElementById("topPostContent");
  closeBtn = document.getElementById("topPostClose");

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  contentEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-top-post-build]")) {
      const fn = pendingOnBuild;
      close();
      fn?.();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      event.preventDefault();
      close();
    }
  });

  initialized = true;
}

export function init() {
  injectOnce();
}

export function open(post, { onBuild } = {}) {
  if (!post) return;
  injectOnce();
  requestOpen(MODAL_ID, close);

  contentEl.innerHTML = renderTopPostPreview(post);
  contentEl.scrollTop = 0;
  pendingOnBuild = typeof onBuild === "function" ? onBuild : null;

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
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  pendingOnBuild = null;
  notifyClose(MODAL_ID);
}
