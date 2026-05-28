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
import { updateSourceClips, setClipExtractionStatus, buildClipsForSource } from "../sources-stream.js?v=32";

const DEFAULT_DURATION_MS = 6000;

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
    updateSourceClips(source.id, buildClipsForSource(source.id));
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
