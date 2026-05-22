// Tiny URL-state helpers shared by every screen that encodes query state
// in the hash (?tab=, ?view=, ?contextId=, etc.).
//
// Per-screen readQuery() functions still own their default values and the
// shape of the returned object — they just delegate the parsing primitive
// to parseHashParams() so each screen no longer hand-rolls the same split.

import { navigate } from "./router.js?v=30";

export function parseHashParams() {
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw);
}

export function setHashQuery(path, params) {
  const qs = new URLSearchParams(params).toString();
  navigate(qs ? `${path}?${qs}` : path);
}
