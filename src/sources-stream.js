// Per-session sources + global uploads store.
//
// Sources are owned by the conversation that created them — no cross-
// session reuse. Each session has its own `Source[]` list and its own
// set of subscribers. Uploads (transient pre-source state) remain global
// since they're short-lived and the modal cares about them as a pool.
//
// The state machine timers live here (not inside the modal) so uploads
// continue in background after the user closes the modal.

import { sourcesBySession as seedByCsesssion } from "./mocks.js?v=29";
import { isNewUser } from "./user-mode.js?v=20";

// ─── State ───────────────────────────────────────────────────────────────

// Per-session source lists. Seeded from mocks for returning users; empty
// (per-session lazy init via getSources) for new users.
const sourcesBySession = new Map();
if (!isNewUser()) {
  for (const [sessionId, seed] of Object.entries(seedByCsesssion || {})) {
    sourcesBySession.set(
      sessionId,
      seed.map((s) => ({ ...s, clips: s.clips ? s.clips.map((c) => ({ ...c })) : undefined })),
    );
  }
}

// Uploads currently being processed. Global. Visible in the modal's
// upload list.
//   { id, name, size, kind, status: 'uploading'|'processing'|'done'|'cancelled', progress, sourceId?, sessionId }
const uploads = [];

// Per-session source subscribers. Map<sessionId, Set<fn>>.
const sourceSubsBySession = new Map();
const uploadSubs = new Set();

let counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function getOrInitSessionSources(sessionId) {
  let list = sourcesBySession.get(sessionId);
  if (!list) {
    list = [];
    sourcesBySession.set(sessionId, list);
  }
  return list;
}

function notifySources(sessionId) {
  const subs = sourceSubsBySession.get(sessionId);
  if (!subs) return;
  const snapshot = getOrInitSessionSources(sessionId);
  for (const fn of subs) fn(snapshot);
}

function notifyUploads() {
  for (const fn of uploadSubs) fn(uploads);
}

// Resolve which session owns a given sourceId. Used by mutators that take
// only the sourceId (clip extraction, completion, cancellation).
function findSourceOwner(sourceId) {
  for (const [sid, list] of sourcesBySession) {
    if (list.some((s) => s.id === sourceId)) return sid;
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function getSources(sessionId) {
  if (!sessionId) return [];
  return getOrInitSessionSources(sessionId);
}

export function getUploads() {
  return uploads;
}

export function subscribeSources(sessionId, fn) {
  if (!sessionId) return () => {};
  let subs = sourceSubsBySession.get(sessionId);
  if (!subs) {
    subs = new Set();
    sourceSubsBySession.set(sessionId, subs);
  }
  subs.add(fn);
  return () => subs.delete(fn);
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
  // Standardized 6s reasoning delay across the whole prototype.
  return 6000;
}

// ─── Pipelines ───────────────────────────────────────────────────────────

// Kicks off the file upload pipeline:
//   1. Upload progress 0→100% over ~2s (modal-only state).
//   2. Push a Processing source under the target session.
//   3. After 3-5s, flip source to Processed with random signal/ideaCount.
export function startFileUpload(file, classification, sessionId) {
  const upload = {
    id: newId("up"),
    name: file.name,
    size: formatSize(file.size),
    kind: classification.kind,
    iconKey: classification.iconKey,
    status: "uploading",
    progress: 0,
    sourceId: null,
    sessionId,
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
  const list = getOrInitSessionSources(upload.sessionId);
  list.unshift({
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
  notifySources(upload.sessionId);
  notifyUploads();

  startProcessingTicker(upload.sessionId, sourceId, totalMs);
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
  if (stage.label === "Reading content" && (kind === "Video" || kind === "Audio")) {
    return "Transcribing audio";
  }
  return stage.label;
}

function startProcessingTicker(sessionId, sourceId, totalMs) {
  const startedAt = Date.now();
  const tickInterval = 200;
  const tick = () => {
    const list = sourcesBySession.get(sessionId);
    const src = list && list.find((s) => s.id === sourceId);
    if (!src || src.status !== "Processing") return;
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(0.99, elapsed / totalMs);
    src.progress = progress;
    src.stage = stageForKind(src.kind, progress);
    src.etaSec = Math.max(1, Math.round((totalMs - elapsed) / 1000));
    notifySources(sessionId);
    if (elapsed < totalMs) setTimeout(tick, tickInterval);
  };
  setTimeout(tick, tickInterval);
}

function transitionToDone(upload) {
  if (upload.status === "cancelled") return;
  upload.status = "done";
  let ideaCount = 0;
  const list = sourcesBySession.get(upload.sessionId);
  const src = list && list.find((s) => s.id === upload.sourceId);
  if (src) {
    const sig = randomSignal();
    src.status = "Processed";
    src.signal = sig.signal;
    src.signalColor = sig.signalColor;
    src.ideaCount = randomIdeas();
    ideaCount = src.ideaCount;
    src.progress = 1;
    src.stage = undefined;
    src.etaSec = undefined;
    notifySources(upload.sessionId);
  }
  notifyUploads();

  import("./components/toast.js").then(({ showToast }) => {
    const ideas = ideaCount === 1 ? "1 idea" : `${ideaCount} ideas`;
    showToast(`${upload.name} ready · ${ideas} extracted`);
  });
}

// URL import skips the upload phase — straight into Processing.
export function startUrlImport(url, sessionId) {
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
    sessionId,
  };
  uploads.unshift(upload);

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  const list = getOrInitSessionSources(sessionId);
  list.unshift({
    id: sourceId,
    filename,
    kind: "URL",
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources(sessionId);
  notifyUploads();

  setTimeout(() => transitionToDone(upload), 6000);
  return upload.id;
}

// Connector import — same shape as URL: skip uploading, straight to processing.
export function startConnectorImport(connector, doc, sessionId) {
  const upload = {
    id: newId("up"),
    name: doc.title,
    size: doc.size || connector.name,
    kind: doc.kind || connector.name,
    iconKey: (doc.iconKey || "file").toLowerCase(),
    status: "processing",
    progress: 100,
    sourceId: null,
    sessionId,
  };
  uploads.unshift(upload);

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  const list = getOrInitSessionSources(sessionId);
  list.unshift({
    id: sourceId,
    filename: doc.title,
    kind: doc.kind || connector.name,
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources(sessionId);
  notifyUploads();

  setTimeout(() => transitionToDone(upload), randomProcessingMs());
  return upload.id;
}

// Scripted-source pipeline used by the session composer's inline `+` menu
// (Add PDF / Add video / Add URL). The caller controls timing — push the
// source as Processing, then flip it Processed in lockstep with the
// thread's extraction turn so the user sees source state and ideas land
// together.
export function pushScriptedSource({ filename, kind, sessionId }) {
  const sourceId = newId("src");
  const list = getOrInitSessionSources(sessionId);
  list.unshift({
    id: sourceId,
    filename,
    kind,
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
  });
  notifySources(sessionId);
  return sourceId;
}

export function completeScriptedSource(sourceId, { signal, signalColor, ideaCount }) {
  const sessionId = findSourceOwner(sourceId);
  if (!sessionId) return;
  const src = sourcesBySession.get(sessionId).find((s) => s.id === sourceId);
  if (!src) return;
  src.status = "Processed";
  src.signal = signal;
  src.signalColor = signalColor;
  src.ideaCount = ideaCount;
  notifySources(sessionId);
}

// Cancel an in-flight upload. After Done it's a no-op.
export function cancelUpload(uploadId) {
  const idx = uploads.findIndex((u) => u.id === uploadId);
  if (idx < 0) return;
  const u = uploads[idx];
  if (u.status === "done") return;
  u.status = "cancelled";
  uploads.splice(idx, 1);
  if (u.sourceId && u.sessionId) {
    const list = sourcesBySession.get(u.sessionId);
    if (list) {
      const sIdx = list.findIndex((s) => s.id === u.sourceId);
      if (sIdx >= 0) list.splice(sIdx, 1);
      notifySources(u.sessionId);
    }
  }
  notifyUploads();
}

// Replace a source's clips array (used by the Video Clips modal after the
// user trims/edits/deletes/adds clips). Mutates in place so existing
// references keep working, then notifies the owning session.
export function updateSourceClips(sourceId, nextClips) {
  const sessionId = findSourceOwner(sourceId);
  if (!sessionId) return;
  const source = sourcesBySession.get(sessionId).find((s) => s.id === sourceId);
  if (!source) return;
  source.clips = nextClips.map((c) => ({ ...c }));
  notifySources(sessionId);
}

// Tracks the background clip-extraction phase on a video source. Status
// is one of: undefined (never run) | "extracting" | "ready".
export function setClipExtractionStatus(sourceId, status) {
  const sessionId = findSourceOwner(sourceId);
  if (!sessionId) return;
  const source = sourcesBySession.get(sessionId).find((s) => s.id === sourceId);
  if (!source) return;
  source.clipExtractionStatus = status;
  notifySources(sessionId);
}

// Remove one or more sources from a session. Returns the count of
// actually-removed entries. No-op for ids not found in the session.
export function removeSources(ids, sessionId) {
  if (!Array.isArray(ids) || ids.length === 0 || !sessionId) return 0;
  const list = sourcesBySession.get(sessionId);
  if (!list) return 0;
  const set = new Set(ids);
  const before = list.length;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (set.has(list[i].id)) list.splice(i, 1);
  }
  const removed = before - list.length;
  if (removed > 0) notifySources(sessionId);
  return removed;
}
