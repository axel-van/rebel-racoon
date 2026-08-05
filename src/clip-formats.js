import { NETWORK_ICON_BY_PLATFORM, NETWORK_LABEL } from "./social-profiles.js?v=36";

// Shared aspect-ratio catalog for video clips.
//
// Single source of truth for the export formats a clip can be cropped to,
// consumed by the video-clips editor (per-clip format picker + preview crop
// frame) AND the in-session "draft from a clip" quick-picker (aspect-ratio
// step). `ratio` is width/height — drives the chip's aspect glyph and the
// preview crop frame. `tag` is the short chip label; `label` the descriptive
// name (shown on hover / as a caption).
// `networks` lists the platforms each ratio is best suited to (short, curated —
// the picker surfaces these as small network logos so the user can pick the
// right export shape before choosing accounts).
export const FORMATS = {
  "9:16": { id: "9:16", tag: "9:16", label: "Vertical", ratio: 9 / 16, networks: ["tiktok", "instagram", "youtube"] },
  "4:5": { id: "4:5", tag: "4:5", label: "Portrait", ratio: 4 / 5, networks: ["instagram", "facebook"] },
  "1:1": { id: "1:1", tag: "1:1", label: "Square", ratio: 1, networks: ["instagram", "facebook", "x"] },
  "4:3": { id: "4:3", tag: "4:3", label: "Standard", ratio: 4 / 3, networks: ["facebook"] },
  "16:9": { id: "16:9", tag: "16:9", label: "Landscape", ratio: 16 / 9, networks: ["youtube", "linkedin", "x"] },
};

// Optimized formats per network — first entry is the recommended default.
export const NETWORK_FORMATS = {
  facebook: ["1:1", "4:5", "9:16", "4:3", "16:9"],
  instagram: ["9:16", "4:5", "1:1"],
  linkedin: ["1:1", "4:5", "16:9"],
  x: ["16:9", "1:1"],
  tiktok: ["9:16"],
};

export function formatsForNetwork(net) {
  return (NETWORK_FORMATS[net] || ["16:9"]).map((id) => FORMATS[id]).filter(Boolean);
}

export function defaultFormatFor(net) {
  return (NETWORK_FORMATS[net] || ["16:9"])[0];
}

// True for vertical-ish ratios (portrait video frame), false for square /
// landscape. Lets consumers pick a portrait vs landscape preview frame.
export function isPortraitFormat(id) {
  return id === "9:16" || id === "4:5";
}

// The format's aspect ratio as a CSS `aspect-ratio` value, for the surfaces
// that draw the chosen output shape (editor viewfinder, clip thumbnails).
// Falls back to the source's 16:9 for clips that never got an explicit format.
export function ratioValue(id) {
  return String((FORMATS[id] || FORMATS["16:9"]).ratio);
}

// ── Clip-draft "pick an export format" quick-picker items ────────────────
// The aspect-ratio step of the draft-from-clip flow (screens/session.js) and
// the handoff gallery both build the card-grid picker from this — one shared
// source so the two never drift.

// Order the aspect-ratio tiles the way creators think of them: landscape,
// vertical, then the squarer ratios.
export const CLIP_RATIO_ORDER = ["16:9", "9:16", "4:3", "1:1", "4:5"];

// A small proportion tile — a rectangle drawn at the format's true aspect ratio
// (CSS `aspect-ratio`) with the ratio label centered inside. Styled in
// subtitle-style.css.
export function ratioTilePreview(fmt) {
  return `<span class="ratio-tile"><span class="ratio-tile__frame" style="aspect-ratio:${fmt.id.replace(":", "/")}"></span><span class="ratio-tile__tag">${fmt.tag}</span></span>`;
}

// Row of full-colour network logos for the platforms a format suits best —
// rendered under the ratio label so the user picks the right shape per target.
export function ratioNetworksMeta(fmt) {
  const nets = fmt.networks || [];
  if (!nets.length) return "";
  return `<span class="ratio-nets" aria-label="Best for ${nets.map((p) => NETWORK_LABEL[p] || p).join(", ")}"><span class="ratio-nets__label muted">Best for</span>${nets
    .map((p) => `<i class="${NETWORK_ICON_BY_PLATFORM[p]}" title="${NETWORK_LABEL[p] || p}" aria-hidden="true"></i>`)
    .join("")}</span>`;
}

// The picker items (value/label/preview/meta) for the aspect-ratio step.
export function clipFormatItems() {
  return CLIP_RATIO_ORDER.map((id) => FORMATS[id])
    .filter(Boolean)
    .map((f) => ({
      value: f.id,
      // Ratio ("16:9") lives inside the frame; the label carries the name only.
      label: f.label,
      preview: ratioTilePreview(f),
      meta: ratioNetworksMeta(f),
    }));
}
