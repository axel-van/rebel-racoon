// Non-blocking clip extraction. The video clip-extraction phase used to
// take over the UI with a modal; now it runs in the background and the
// user is pinged via a toast notification when clips are ready. Matches
// the PDF upload pattern (sources-stream + completion toast).
//
// Public API:
//   startClipExtraction(source, { onReady })
//     - If clips already exist on the source, onReady is called synchronously.
//     - If an extraction is already in flight for this source, the call is
//       ignored (the existing completion toast still fires).
//     - Otherwise, mutates the source's clipExtractionStatus to "extracting",
//       fires a start toast, waits 30s, attaches mocked clips, fires a
//       completion toast with an "Open clips" action that calls onReady.

import { showToast } from "./toast.js";
import { updateSourceClips, setClipExtractionStatus } from "../sources-stream.js?v=30";

const DEFAULT_DURATION_MS = 6000;

// Canned extraction output — the mocked AI result attached to any video
// source that hasn't been through extraction yet. Generic enough to
// plausibly come from any keynote / talk / demo video.
const EXTRACTED_CLIPS_TEMPLATE = [
  {
    start: 252,
    end: 282,
    hue: 22,
    title: "Opening hook — the thesis in one line",
    summary: "Single-sentence framing that lands the whole talk. Strong cold open.",
    why: "Quotable. Reads as a standalone post or as the lede of a longer story.",
    network: "x",
    tags: ["hook", "positioning"],
  },
  {
    start: 510,
    end: 568,
    hue: 280,
    title: "Live demo — the payoff moment",
    summary: "Compact demo segment where the value lands visually in under a minute.",
    why: "Short, kinetic, ends on a clear payoff. Travels well on vertical formats.",
    network: "instagram",
    tags: ["demo", "product"],
  },
  {
    start: 890,
    end: 938,
    hue: 200,
    title: "Headline stat with the story behind it",
    summary: "Specific number delivered with the customer context that earns it.",
    why: "Numbers + before/after. LinkedIn audiences over-index on time-savings proof.",
    network: "linkedin",
    tags: ["stat", "proof"],
  },
  {
    start: 1102,
    end: 1156,
    hue: 12,
    title: "Contrarian POV — why we did the unpopular thing",
    summary: "Founder explains a decision that goes against the obvious move.",
    why: "Strong POV in a single beat. Ideal for thought-leadership context.",
    network: "linkedin",
    tags: ["contrarian", "pov"],
  },
  {
    start: 1340,
    end: 1392,
    hue: 145,
    title: "Closing line — the quotable outro",
    summary: "Clean closing delivery with room around it for graphics or captions.",
    why: "Vertical-format reel material. Punchy, mid-length, ends on a quotable.",
    network: "tiktok",
    tags: ["closing", "reel"],
  },
];

export function startClipExtraction(source, { onReady } = {}) {
  if (!source) return;
  const ready = typeof onReady === "function" ? onReady : () => {};

  const hasClips = Array.isArray(source.clips) && source.clips.length > 0;
  if (hasClips) {
    ready(source);
    return;
  }

  if (source.clipExtractionStatus === "extracting") {
    // Already in flight — let the existing completion toast handle the open.
    return;
  }

  const filename = source.filename || "your video";

  setClipExtractionStatus(source.id, "extracting");

  showToast(`Extracting clips from ${filename}…`, { duration: 3200 });

  setTimeout(() => {
    source.durationSec = source.durationSec || 1458;
    const clipsWithIds = EXTRACTED_CLIPS_TEMPLATE.map((c, i) => ({
      ...c,
      id: `clip_${source.id}_${i}`,
    }));
    updateSourceClips(source.id, clipsWithIds);
    setClipExtractionStatus(source.id, "ready");

    showToast(`Clips ready for ${filename}`, {
      duration: 0,
      action: {
        label: "Open clips",
        onClick: () => ready(source),
      },
    });
  }, DEFAULT_DURATION_MS);
}
