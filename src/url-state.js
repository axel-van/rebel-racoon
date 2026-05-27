// Tiny URL-state helpers shared by every screen that encodes query state
// in the hash (?tab=, ?view=, ?contextId=, etc.).
//
// Per-screen readQuery() functions still own their default values and the
// shape of the returned object — they just delegate the parsing primitive
// to parseHashParams() so each screen no longer hand-rolls the same split.

import { navigate } from "./router.js?v=30";

export function parseHashParams() {
  // Capture-mode bridge: when the hash holds figma capture params, source
  // hash-style params from window.location.search instead (set by the
  // capture URL alongside ?route=).
  const search = window.location.search;
  if (search && /[?&](panel|tab|focusIdea|contextId|view|filter)=/.test(search)) {
    const params = new URLSearchParams(search);
    // Strip our routing-only keys so screens don't get confused.
    params.delete("route");
    params.delete("setup");
    params.delete("openModal");
    if ([...params.keys()].length) return params;
  }
  const raw = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(raw);
}

export function setHashQuery(path, params) {
  const qs = new URLSearchParams(params).toString();
  navigate(qs ? `${path}?${qs}` : path);
}
