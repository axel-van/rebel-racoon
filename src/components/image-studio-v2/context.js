// Image Studio v2 — shared runtime context for the split modal modules.
//
// Same contract as v1's context.js, but its own MODAL_ID and its own state KEY:
// the state engine (src/image-studio.js) is a Map(key → state), so v1 and v2 can
// be mounted side by side (both init() at boot) without sharing a byte of state.
// Only one studio is open at a time, so a single KEY plus a mutable `ctx`
// (populated by index.js on open) is all the sibling modules need.

import * as imageStudio from "../../image-studio.js?v=60";

export const MODAL_ID = "imageStudioV2";
export const KEY = "studio-v2"; // distinct from v1's "studio" — separate state

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
