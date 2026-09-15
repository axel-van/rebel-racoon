// Image Studio — shared runtime context for the split modal modules.
//
// The state engine (src/image-studio.js) is a Map(key → state), so a studio
// identifies itself with a KEY. Only one is ever open at a time, so a single KEY
// plus a mutable `ctx` (populated by index.js on open) is all the sibling modules
// need to find the DOM and the origin draft.
//
// The "studio-v2" key and the "imageStudioV2" modal id are historical names from
// when a second studio was mounted beside this one behind a flag. That studio is
// gone; the strings stayed because nothing outside this module reads their value —
// KEY only has to be stable, and MODAL_ID only has to be unique among modals.

import * as imageStudio from "../../image-studio.js?v=1215";

export const MODAL_ID = "imageStudioV2";
export const KEY = "studio-v2";

// Runtime refs, set by index.js init()/open(). Modules read `ctx.modal` for DOM
// queries and `ctx.sessionId` / `ctx.postId` to resolve the origin draft.
export const ctx = {
  modal: null,
  body: null,
  postId: null,
  sessionId: null,
};

export function state() {
  return imageStudio.getState(KEY);
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// The frame that holds the working image. Gestures measure against it and the
// overlay/crop layers position inside it, so both interactions.js and the views
// need the same selector — named once here.
export const FRAME_SEL = ".isv2-frame";

// Grow a composer textarea to fit its content, bounded by the max-height in CSS
// (past which it scrolls) — mirrors autosizeInput in the main composer. Lives
// here rather than in index.js because both the render path and the input handler
// need it, and importing it across those two would make a cycle.
export function autosize(ta) {
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}
