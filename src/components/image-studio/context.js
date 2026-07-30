// Image Studio — shared runtime context for the split modal modules.
//
// Only one studio is open at a time, so a single state KEY plus a mutable `ctx`
// object (populated by index.js on open) is all the sibling modules need. Every
// module imports these instead of reaching back into the entry file, which keeps
// the dependency graph acyclic (context depends on nothing app-specific).

import * as imageStudio from "../../image-studio.js?v=55";

export const MODAL_ID = "imageStudio";
export const KEY = "studio"; // single active studio → one state key

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
