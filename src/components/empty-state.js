// Shared empty-state renderer.
//
// Three patterns coexisted in the codebase before this module landed:
//   1. Rich card with icon + title + body + optional CTA (content-workspace
//      "renderEmptyState", settings-drawer Contexts, right-panel Drafts).
//   2. Minimal text-only paragraph (sources / ideas / contexts library
//      pages, right-panel filter no-match).
//   3. Drop tile / interactive empty (sources page drop tile, add-source
//      modal dropzone).
//
// FIND-B1: pattern 1 is the project standard — every divergent empty
// state is a candidate to migrate here. Each surface still owns its CSS
// chrome (the wrapping class), but the inner layout is shared.
//
// Usage:
//   import { renderEmptyState } from "../components/empty-state.js?v=1";
//   const html = renderEmptyState({
//     icon: "ap-icon-feature-library",
//     title: "No sources yet",
//     body: "Drop a PDF, video, or URL to get started.",
//     actionHtml: '<button class="ap-button primary orange">…</button>',
//     wrapperClass: "sources-view__empty",  // optional; default "session__empty"
//   });
//
// Pass `actionHtml` to surface a CTA underneath the body. Pass
// `wrapperClass` to keep the surrounding screen-level styling (margins,
// alignment) — defaults to the `session__empty` class that ships in
// styles/base.css since it's the most common shape.

export function renderEmptyState({ icon, title, body, actionHtml = "", wrapperClass = "session__empty" }) {
  return `
    <div class="${wrapperClass}">
      <div class="session__empty-icon">
        <i class="${icon} lg"></i>
      </div>
      <h3 class="text-subtitle">${title}</h3>
      <p class="muted">${body}</p>
      ${actionHtml ? `<div class="session__empty-action">${actionHtml}</div>` : ""}
    </div>
  `;
}
