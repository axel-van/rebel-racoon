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
