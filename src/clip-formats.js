// Shared aspect-ratio catalog for video clips.
//
// Single source of truth for the export formats a clip can be cropped to,
// consumed by the video-clips editor (per-clip format picker + preview crop
// frame) AND the in-session "draft from a clip" quick-picker (aspect-ratio
// step). `ratio` is width/height — drives the chip's aspect glyph and the
// preview crop frame. `tag` is the short chip label; `label` the descriptive
// name (shown on hover / as a caption).
export const FORMATS = {
  "9:16": { id: "9:16", tag: "9:16", label: "Vertical", ratio: 9 / 16 },
  "4:5": { id: "4:5", tag: "4:5", label: "Portrait", ratio: 4 / 5 },
  "1:1": { id: "1:1", tag: "1:1", label: "Square", ratio: 1 },
  "16:9": { id: "16:9", tag: "16:9", label: "Landscape", ratio: 16 / 9 },
};

// Optimized formats per network — first entry is the recommended default.
export const NETWORK_FORMATS = {
  facebook: ["1:1", "4:5", "9:16", "16:9"],
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

// Union of the formats supported by a set of networks, de-duped and
// order-preserving (first network's order wins, later networks append any
// new ones). Used when a clip is drafted for several accounts at once and
// the user picks one shared ratio.
export function formatsForNetworks(netIds) {
  const seen = new Set();
  const out = [];
  for (const net of netIds || []) {
    for (const id of NETWORK_FORMATS[net] || ["16:9"]) {
      if (!seen.has(id) && FORMATS[id]) {
        seen.add(id);
        out.push(FORMATS[id]);
      }
    }
  }
  return out.length ? out : [FORMATS["16:9"]];
}

// True for vertical-ish ratios (portrait video frame), false for square /
// landscape. Lets consumers pick a portrait vs landscape preview frame.
export function isPortraitFormat(id) {
  return id === "9:16" || id === "4:5";
}
