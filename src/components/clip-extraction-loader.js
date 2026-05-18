// Clip-extraction loader — a 30s pseudo-processing overlay shown after the
// user uploads a video from the "Extract video clips" starter. Sells the
// "we're mining your video for moments" beat with a progress bar and a
// scripted stage sequence; on completion, hands control back to the caller
// to open the Video Clips modal.
//
// Public API:
//   init()                                      — mount once at bootstrap
//   open({ filename, durationMs?, onComplete }) — show + auto-close after duration
//   close()                                     — manual cancel (rarely needed)

import { escapeHtml } from "../utils.js?v=20";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=20";
import { updateSourceClips } from "../sources-stream.js?v=25";

const MODAL_ID = "clipExtraction";
const DEFAULT_DURATION_MS = 30000;

// Stages span 0..1 of the duration; the active stage is whichever has the
// largest `from` <= progress. Labels mirror the language of the Video
// Clips modal's "Suggest more" microcopy.
const STAGES = [
  { from: 0.0, label: "Analyzing video frames" },
  { from: 0.18, label: "Transcribing audio" },
  { from: 0.42, label: "Identifying key moments" },
  { from: 0.7, label: "Generating titles & summaries" },
  { from: 0.92, label: "Finalizing clips" },
];

let backdrop;
let modal;
let titleEl;
let stageEl;
let progressEl;
let percentEl;
let initialized = false;

let onCompleteCallback = null;
let timer = null;
let tickInterval = null;
let startedAt = 0;
let totalMs = 0;

const SHELL_HTML = `
<div class="app-modal-backdrop" id="clipExtractionBackdrop" hidden></div>
<aside class="clip-extraction" id="clipExtractionModal" role="dialog"
       aria-modal="true" aria-labelledby="clipExtractionTitle" aria-hidden="true">
  <div class="clip-extraction__icon" aria-hidden="true">
    <i class="ap-icon-sparkles"></i>
  </div>
  <h2 class="clip-extraction__title" id="clipExtractionTitle">Extracting clips</h2>
  <p class="clip-extraction__filename" id="clipExtractionFilename"></p>
  <div class="clip-extraction__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <div class="clip-extraction__bar-fill" id="clipExtractionBarFill"></div>
  </div>
  <div class="clip-extraction__meta">
    <span class="clip-extraction__stage" id="clipExtractionStage">${STAGES[0].label}</span>
    <span class="clip-extraction__percent" id="clipExtractionPercent">0%</span>
  </div>
</aside>`;

function stageFor(progress) {
  let best = STAGES[0];
  for (const s of STAGES) {
    if (progress >= s.from) best = s;
  }
  return best.label;
}

function tick() {
  const elapsed = Date.now() - startedAt;
  const progress = Math.min(1, elapsed / totalMs);
  const pct = Math.round(progress * 100);
  if (progressEl) progressEl.style.width = `${pct}%`;
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (stageEl) stageEl.textContent = stageFor(progress);
  if (modal) {
    const bar = modal.querySelector(".clip-extraction__bar");
    if (bar) bar.setAttribute("aria-valuenow", String(pct));
  }
}

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", SHELL_HTML);

  backdrop = document.getElementById("clipExtractionBackdrop");
  modal = document.getElementById("clipExtractionModal");
  titleEl = document.getElementById("clipExtractionTitle");
  stageEl = document.getElementById("clipExtractionStage");
  progressEl = document.getElementById("clipExtractionBarFill");
  percentEl = document.getElementById("clipExtractionPercent");
}

export function open({ filename = "your video", durationMs = DEFAULT_DURATION_MS, onComplete } = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);

  totalMs = Math.max(1000, durationMs);
  startedAt = Date.now();
  onCompleteCallback = typeof onComplete === "function" ? onComplete : null;

  const fnEl = document.getElementById("clipExtractionFilename");
  if (fnEl) fnEl.textContent = filename;
  if (progressEl) progressEl.style.width = "0%";
  if (percentEl) percentEl.textContent = "0%";
  if (stageEl) stageEl.textContent = STAGES[0].label;

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  if (tickInterval) clearInterval(tickInterval);
  if (timer) clearTimeout(timer);

  // Tick 4x/s so the percentage feels alive without thrashing the DOM.
  tickInterval = setInterval(tick, 250);
  timer = setTimeout(() => {
    tick();
    const cb = onCompleteCallback;
    close();
    if (cb) cb();
  }, totalMs);
}

// Canned extraction output — the mocked AI result attached to any video
// source that hasn't been through the "Suggest clips" flow yet. Generic
// enough to plausibly come from any keynote / talk / demo video.
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

// Convenience wrapper used by every Video Clips entry point (the empty-state
// starter, the "Suggest clips" source-card button, and any future trigger):
// if the source already carries an extraction result, hand it off directly;
// otherwise run the 30s loader, attach the canned clips, then continue.
export function ensureClipsThen(source, onReady) {
  if (!source) return;
  const hasClips = Array.isArray(source.clips) && source.clips.length > 0;
  if (hasClips) {
    onReady(source);
    return;
  }
  open({
    filename: source.filename || "your video",
    durationMs: 30000,
    onComplete: () => {
      source.durationSec = source.durationSec || 1458;
      const clipsWithIds = EXTRACTED_CLIPS_TEMPLATE.map((c, i) => ({
        ...c,
        id: `clip_${source.id}_${i}`,
      }));
      updateSourceClips(source.id, clipsWithIds);
      onReady(source);
    },
  });
}

export function close() {
  if (!initialized || !modal?.classList.contains("open")) return;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  onCompleteCallback = null;
  notifyClose(MODAL_ID);
}
