// Top-post preview modal — a classic DS dialog (.ap-dialog: header / content /
// footer) opened by the board card's "Details" action. The per-post inner
// (header + 2-column body + footer actions) is rendered by renderTopPostPreview.
// Standard init/open/close + modal-coordinator pattern (see rename-modal.js).
//
// Public API:
//   init()                  — inject the dialog shell + bind once on app boot
//   open(post, { onBuild })  — fill the dialog for `post`; the footer "Repurpose"
//                              closes then calls onBuild (→ the reuse-mode picker).

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { renderTopPostPreview } from "./top-post-card.js?v=11";

const MODAL_ID = "topPost";

let backdrop, modal;
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
></aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("topPostBackdrop");
  modal = document.getElementById("topPostModal");

  backdrop.addEventListener("click", close);

  // Delegate inside the dialog — its inner (header / content / footer) is
  // re-rendered per open by renderTopPostPreview.
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-tpm-close]")) {
      close();
      return;
    }
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

  modal.innerHTML = renderTopPostPreview(post);
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
