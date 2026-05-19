// Global sources + uploads store. The dashboard's Content panel renders
// from here. The Add source modal pushes through this module's state
// machine: file uploads, URL imports, connector imports all funnel into
// the same { Processing → Processed } pipeline.
//
// State machine timers live here (not inside the modal) so uploads
// continue in background after the user closes the modal.

import { sources as seedSources } from "./mocks.js?v=27";
import { isNewUser } from "./user-mode.js?v=20";

// ─── State ───────────────────────────────────────────────────────────────

// The live source list — seeded from mocks.sources in returning-user mode,
// empty in first-time mode (Lot 15 — sources-stream is global, the standalone
// /sources page reads through getSources(); without this guard the empty
// state never showed even when the dashboard correctly hid mocks).
const sources = isNewUser() ? [] : seedSources.map((s) => ({ ...s }));

// Uploads currently being processed. Visible in the modal's upload list.
// { id, name, size, kind, status: 'uploading'|'processing'|'done'|'cancelled', progress, sourceId? }
const uploads = [];

const sourceSubs = new Set();
const uploadSubs = new Set();

let counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function notifySources() {
  for (const fn of sourceSubs) fn(sources);
}
function notifyUploads() {
  for (const fn of uploadSubs) fn(uploads);
}

// ─── Public API ──────────────────────────────────────────────────────────

export function getSources() {
  return sources;
}

export function getUploads() {
  return uploads;
}

export function subscribeSources(fn) {
  sourceSubs.add(fn);
  return () => sourceSubs.delete(fn);
}

export function subscribeUploads(fn) {
  uploadSubs.add(fn);
  return () => uploadSubs.delete(fn);
}

// File extensions → ({ kind, iconKey }). The iconKey is the lowercase
// value file-kinds.js uses for KIND_ICON lookup.
const EXT_MAP = {
  pdf: { kind: "PDF", iconKey: "pdf" },
  doc: { kind: "Word", iconKey: "word" },
  docx: { kind: "Word", iconKey: "word" },
  txt: { kind: "Text", iconKey: "text" },
  md: { kind: "Text", iconKey: "text" },
  mp4: { kind: "Video", iconKey: "video" },
  mov: { kind: "Video", iconKey: "video" },
  mp3: { kind: "Audio", iconKey: "audio" },
  wav: { kind: "Audio", iconKey: "audio" },
  m4a: { kind: "Audio", iconKey: "audio" },
  png: { kind: "Image", iconKey: "image" },
  jpg: { kind: "Image", iconKey: "image" },
  jpeg: { kind: "Image", iconKey: "image" },
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function classifyFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const map = EXT_MAP[ext];
  if (!map) return { ok: false, reason: `Unsupported file type: ${file.name}` };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: `File too large: ${file.name} (max 100MB)` };
  return { ok: true, kind: map.kind, iconKey: map.iconKey };
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── State machine ───────────────────────────────────────────────────────

const SIGNALS = [
  { signal: "High signal", signalColor: "orange" },
  { signal: "Medium signal", signalColor: "tagOrange" },
  { signal: "Low signal", signalColor: "grey" },
];

function randomSignal() {
  // Skew toward Medium — feels more honest for a fresh upload.
  const r = Math.random();
  if (r < 0.25) return SIGNALS[0];
  if (r < 0.85) return SIGNALS[1];
  return SIGNALS[2];
}

function randomIdeas() {
  return 2 + Math.floor(Math.random() * 5); // 2..6
}

function randomProcessingMs() {
  return 3000 + Math.floor(Math.random() * 2000); // 3-5s
}

// ─── Pipelines ───────────────────────────────────────────────────────────

// Kicks off the file upload pipeline:
//   1. Upload progress 0→100% over ~2s (modal-only state).
//   2. Push a Processing source to getSources() (visible in dashboard).
//   3. After 3-5s, flip source to Processed with random signal/ideaCount.
export function startFileUpload(file, classification) {
  const upload = {
    id: newId("up"),
    name: file.name,
    size: formatSize(file.size),
    kind: classification.kind,
    iconKey: classification.iconKey,
    status: "uploading",
    progress: 0,
    sourceId: null,
  };
  uploads.unshift(upload);
  notifyUploads();

  // Tween progress 0 → 100% over ~2s, ticking every 100ms.
  const startedAt = Date.now();
  const totalMs = 2000;
  const interval = setInterval(() => {
    if (upload.status === "cancelled") {
      clearInterval(interval);
      return;
    }
    const elapsed = Date.now() - startedAt;
    upload.progress = Math.min(100, Math.round((elapsed / totalMs) * 100));
    notifyUploads();
    if (elapsed >= totalMs) {
      clearInterval(interval);
      transitionToProcessing(upload);
    }
  }, 100);

  return upload.id;
}

function transitionToProcessing(upload) {
  if (upload.status === "cancelled") return;
  upload.status = "processing";
  upload.progress = 100;

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  const totalMs = randomProcessingMs();
  sources.unshift({
    id: sourceId,
    filename: upload.name,
    kind: upload.kind,
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
    // Lot 6.2 — granular ticker fields per Q8. Surface progress + stage +
    // ETA during the Processing phase so SourceCards / panels can paint
    // a live progress bar instead of an opaque spinner. Optional —
    // consumers fall back to the old "Processing" pill if absent.
    progress: 0,
    stage: stageForKind(upload.kind, 0),
    etaSec: Math.round(totalMs / 1000),
    startedAt: Date.now(),
    totalProcessingMs: totalMs,
  });
  notifySources();
  notifyUploads();

  startProcessingTicker(sourceId, totalMs);
  setTimeout(() => transitionToDone(upload), totalMs);
}

// Stage label depends on source kind (audio/video transcribe, others read).
// Crossfades through 5 stages over the simulated processing window so the
// pipeline reads as a real backend rather than a static spinner.
const PROCESSING_STAGES = [
  { from: 0, label: "Extracting content" },
  { from: 0.2, label: "Reading content" },
  { from: 0.45, label: "Identifying ideas" },
  { from: 0.75, label: "Mining hooks & quotes" },
  { from: 0.95, label: "Finalizing" },
];

function stageForKind(kind, progress) {
  const stage = [...PROCESSING_STAGES].reverse().find((s) => progress >= s.from);
  if (!stage) return PROCESSING_STAGES[0].label;
  // Audio/video sources transcribe rather than read.
  if (stage.label === "Reading content" && (kind === "Video" || kind === "Audio")) {
    return "Transcribing audio";
  }
  return stage.label;
}

// Tick the source's progress every 200ms. Mirrors the handoff App.jsx
// 600ms ticker but a bit faster because we already gated the start
// behind a 2s upload phase. Stops when the source flips to Processed
// (transitionToDone) or disappears.
function startProcessingTicker(sourceId, totalMs) {
  const startedAt = Date.now();
  const tickInterval = 200;
  const tick = () => {
    const src = sources.find((s) => s.id === sourceId);
    if (!src || src.status !== "Processing") return;
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(0.99, elapsed / totalMs);
    src.progress = progress;
    src.stage = stageForKind(src.kind, progress);
    src.etaSec = Math.max(1, Math.round((totalMs - elapsed) / 1000));
    notifySources();
    if (elapsed < totalMs) setTimeout(tick, tickInterval);
  };
  setTimeout(tick, tickInterval);
}

function transitionToDone(upload) {
  if (upload.status === "cancelled") return;
  upload.status = "done";
  let ideaCount = 0;
  const src = sources.find((s) => s.id === upload.sourceId);
  if (src) {
    const sig = randomSignal();
    src.status = "Processed";
    src.signal = sig.signal;
    src.signalColor = sig.signalColor;
    src.ideaCount = randomIdeas();
    ideaCount = src.ideaCount;
    // Clear the granular ticker fields once the source is done — keeps
    // the post-processing card from showing a stale 99% / "Finalizing"
    // hint.
    src.progress = 1;
    src.stage = undefined;
    src.etaSec = undefined;
    notifySources();
  }
  notifyUploads();

  import("./components/toast.js").then(({ showToast }) => {
    const ideas = ideaCount === 1 ? "1 idea" : `${ideaCount} ideas`;
    showToast(`${upload.name} ready · ${ideas} extracted`);
  });
}

// URL import skips the upload phase — straight into Processing.
export function startUrlImport(url) {
  const filename = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const upload = {
    id: newId("up"),
    name: filename,
    size: "URL",
    kind: "URL",
    iconKey: "url",
    status: "processing",
    progress: 100,
    sourceId: null,
  };
  uploads.unshift(upload);

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  sources.unshift({
    id: sourceId,
    filename,
    kind: "URL",
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources();
  notifyUploads();

  setTimeout(() => transitionToDone(upload), 4000 + Math.floor(Math.random() * 2000));
  return upload.id;
}

// Connector import — same shape as URL: skip uploading, straight to processing.
// The "doc" object is the mock from mocks.connectorDocs.
export function startConnectorImport(connector, doc) {
  const upload = {
    id: newId("up"),
    name: doc.title,
    size: doc.size || connector.name,
    kind: doc.kind || connector.name,
    iconKey: (doc.iconKey || "file").toLowerCase(),
    status: "processing",
    progress: 100,
    sourceId: null,
  };
  uploads.unshift(upload);

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  sources.unshift({
    id: sourceId,
    filename: doc.title,
    kind: doc.kind || connector.name,
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources();
  notifyUploads();

  setTimeout(() => transitionToDone(upload), randomProcessingMs());
  return upload.id;
}

// Scripted-source pipeline used by the session composer's inline `+` menu
// (Add PDF / Add video / Add URL). The caller controls timing — push the
// source as Processing, then flip it Processed in lockstep with the thread's
// extraction turn so the user sees source state and ideas land together.
export function pushScriptedSource({ filename, kind }) {
  const sourceId = newId("src");
  sources.unshift({
    id: sourceId,
    filename,
    kind,
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources();
  return sourceId;
}

export function completeScriptedSource(sourceId, { signal, signalColor, ideaCount }) {
  const src = sources.find((s) => s.id === sourceId);
  if (!src) return;
  src.status = "Processed";
  src.signal = signal;
  src.signalColor = signalColor;
  src.ideaCount = ideaCount;
  notifySources();
}

// Cancel an in-flight upload. After Done it's a no-op — by then the
// "remove" affordance is gone in the modal anyway.
export function cancelUpload(uploadId) {
  const idx = uploads.findIndex((u) => u.id === uploadId);
  if (idx < 0) return;
  const u = uploads[idx];
  if (u.status === "done") return;
  u.status = "cancelled";
  uploads.splice(idx, 1);
  if (u.sourceId) {
    const sIdx = sources.findIndex((s) => s.id === u.sourceId);
    if (sIdx >= 0) sources.splice(sIdx, 1);
    notifySources();
  }
  notifyUploads();
}

// Remove one or more processed sources. Used by the bulk-delete flow on the
// Content tab. The accompanying ideas (per-session) are cleaned up by the
// caller via library.removeIdeasForSources — this module only owns the
// global sources array. No-op for ids that aren't found.
// Replace a source's clips array (used by the Video Clips modal after the
// user trims/edits/deletes/adds clips). Mutates in place so existing
// references in the dashboard / session keep working, then notifies.
export function updateSourceClips(sourceId, nextClips) {
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return;
  source.clips = nextClips.map((c) => ({ ...c }));
  notifySources();
}

// Tracks the background clip-extraction phase on a video source. Status is
// one of: undefined (never run) | "extracting" | "ready". Source cards read
// this to render a disabled "Extracting clips…" affordance while the job is
// in flight.
export function setClipExtractionStatus(sourceId, status) {
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return;
  source.clipExtractionStatus = status;
  notifySources();
}

export function removeSources(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const set = new Set(ids);
  const before = sources.length;
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    if (set.has(sources[i].id)) sources.splice(i, 1);
  }
  const removed = before - sources.length;
  if (removed > 0) notifySources();
  return removed;
}
