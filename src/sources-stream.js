// Per-session sources + global uploads store.
//
// Sources are owned by the conversation that created them — no cross-
// session reuse. Each session has its own `Source[]` list and its own
// set of subscribers. Uploads (transient pre-source state) remain global
// since they're short-lived and the modal cares about them as a pool.
//
// The state machine timers live here (not inside the modal) so uploads
// continue in background after the user closes the modal.

import { sourcesBySession as seedByCsesssion } from "./mocks.js?v=91";
import { isNewUser } from "./user-mode.js?v=22";
import { createNotifier } from "./store-utils.js?v=3";
import { detectUrlService } from "./url-services.js?v=1";
import { isFlagOn } from "./feature-flags.js?v=22";

// Canned extraction output attached to every Processed Video source.
// Generic enough to plausibly come from any keynote / talk / demo video.
export const EXTRACTED_CLIPS_TEMPLATE = [
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

// Stable ids derived from the source id so downstream stores can
// reference clips reliably.
export function buildClipsForSource(sourceId) {
  return EXTRACTED_CLIPS_TEMPLATE.map((c, i) => ({
    ...c,
    id: `clip_${sourceId}_${i}`,
  }));
}

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

// Per-session source subscribers. Map<sessionId, Set<fn>> — keeps the
// per-key fan-out the createNotifier factory doesn't support.
const sourceSubsBySession = new Map();
// Global uploads notifier — single subscriber set, snapshot is the whole
// uploads array.
const uploadsNotifier = createNotifier("sources-stream/uploads");

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
  uploadsNotifier.notify(uploads);
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

export const subscribeUploads = uploadsNotifier.subscribe;

// Drop all sources + subscribers for a session — used by the
// conversation-delete flow in the sidebar.
export function clearSession(sessionId) {
  sourcesBySession.delete(sessionId);
  const subs = sourceSubsBySession.get(sessionId);
  if (subs) {
    for (const fn of subs) {
      try {
        fn([]);
      } catch {}
    }
    sourceSubsBySession.delete(sessionId);
  }
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

function formatSize(bytes) {
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
  let clipCount = 0;
  const list = sourcesBySession.get(upload.sessionId);
  const src = list && list.find((s) => s.id === upload.sourceId);
  if (src) {
    const sig = randomSignal();
    src.status = "Processed";
    src.signal = sig.signal;
    src.signalColor = sig.signalColor;
    src.progress = 1;
    src.stage = undefined;
    src.etaSec = undefined;
    if (src.kind === "Video") {
      // Defer idea extraction + clip creation until the user picks
      // "Analyze for ideas" / "Extract clips" in the post-upload choice
      // (posted by the intake lifecycle once the source is Processed).
      src.ideaCount = 0;
    } else {
      src.ideaCount = randomIdeas();
      ideaCount = src.ideaCount;
    }
    notifySources(upload.sessionId);
  }
  notifyUploads();

  const isVideo = !!(src && src.kind === "Video");
  // The non-video toast duplicates the green "N ideas ready" composer status
  // bar (onSourceReady), so it's gated behind statusActionSnackbars. The video
  // "ready" ping has no status-bar equivalent (extraction defers to the
  // analyze choice), so it always fires.
  if (isVideo || isFlagOn("statusActionSnackbars")) {
    import("./components/toast.js").then(({ showToast }) => {
      showToast(
        isVideo ? `${upload.name} ready` : `${upload.name} ready · ${formatExtractionSummary(ideaCount, clipCount)}`,
      );
    });
  }
}

// Hydrate a freshly-Processed Video source with the canned clip set so
// every video — regardless of attach path — ends up with both ideas AND
// clips. Returns the number of clips attached so the caller can use it
// in toasts / UI labels.
function attachVideoClips(src) {
  const clips = buildClipsForSource(src.id);
  src.clips = clips;
  src.clipExtractionStatus = "ready";
  if (!src.durationSec) src.durationSec = 1458;
  return clips.length;
}

// Clip-extraction stages — crossfade through explanatory labels over the
// simulated extraction window so the pending clip-extraction turn reads as real
// AI work rather than a static spinner. Mirrors PROCESSING_STAGES.
const CLIP_EXTRACTION_STAGES = [
  { from: 0, label: "Transcribing audio" },
  { from: 0.2, label: "Detecting highlights & hooks" },
  { from: 0.45, label: "Scoring moments" },
  { from: 0.7, label: "Cutting clips" },
  { from: 0.9, label: "Generating captions" },
];
const CLIP_EXTRACTION_MS = 7500;

function clipStageFor(progress) {
  const stage = [...CLIP_EXTRACTION_STAGES].reverse().find((s) => progress >= s.from);
  return stage ? stage.label : CLIP_EXTRACTION_STAGES[0].label;
}

// Drive the extracting source through its stages every 200ms, then attach the
// canned clips and flip it to "ready" once the window elapses.
function startClipExtractionTicker(sessionId, sourceId, totalMs) {
  const startedAt = Date.now();
  const tickInterval = 200;
  const tick = () => {
    const list = sourcesBySession.get(sessionId);
    const src = list && list.find((s) => s.id === sourceId);
    if (!src || src.clipExtractionStatus !== "extracting") return;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= totalMs) {
      attachVideoClips(src); // sets clipExtractionStatus = "ready" + clips
      src.clipProgress = 1;
      src.clipStage = undefined;
      notifySources(sessionId);
      return;
    }
    const progress = Math.min(0.99, elapsed / totalMs);
    const nextStage = clipStageFor(progress);
    // Only repaint when the stage LABEL changes (≈4 times), not every 200ms.
    // The thread repaint recreates the loader's animated SVG, so notifying every
    // tick restarted its animation before it could complete a cycle (looked
    // frozen). Progress is still tracked for any consumer that reads it.
    const stageChanged = src.clipStage !== nextStage;
    src.clipProgress = progress;
    src.clipStage = nextStage;
    if (stageChanged) notifySources(sessionId);
    setTimeout(tick, tickInterval);
  };
  setTimeout(tick, tickInterval);
}

// Post-hoc clip extraction — used by the "Extract clips" branch of the
// video-intake choice. Runs a staged ~7.5s extraction (transcribe → detect →
// score → cut → caption) on an already-Processed video source, then attaches
// the canned clip set so the inline clip-extraction turn flips to "ready" and
// the source-intake "M clips" pill appears. Pass { animate: false } to attach
// immediately (no staged loader). Returns the clip count when synchronous, else 0.
export function extractClipsForSource(sessionId, sourceId, { animate = true } = {}) {
  const list = sourcesBySession.get(sessionId);
  const src = list && list.find((s) => s.id === sourceId);
  if (!src) return 0;
  if (!animate) {
    const count = attachVideoClips(src);
    notifySources(sessionId);
    return count;
  }
  src.clipExtractionStatus = "extracting";
  src.clipProgress = 0;
  src.clipStage = clipStageFor(0);
  notifySources(sessionId);
  startClipExtractionTicker(sessionId, sourceId, CLIP_EXTRACTION_MS);
  return 0;
}

// Set a source's idea count post-hoc — used by the "Analyze for ideas"
// branch so the source-intake "N ideas" pill appears after deferred extraction.
export function setSourceIdeaCount(sessionId, sourceId, n) {
  const list = sourcesBySession.get(sessionId);
  const src = list && list.find((s) => s.id === sourceId);
  if (!src) return;
  src.ideaCount = n;
  notifySources(sessionId);
}

function formatExtractionSummary(ideaCount, clipCount) {
  const parts = [];
  parts.push(`${ideaCount} ${ideaCount === 1 ? "idea" : "ideas"}`);
  if (clipCount > 0) parts.push(`${clipCount} ${clipCount === 1 ? "clip" : "clips"}`);
  return `${parts.join(" · ")} extracted`;
}

// URL import skips the upload phase — straight into Processing.
export function startUrlImport(url, sessionId) {
  const filename = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Recognised links (YouTube, Drive, Notion, …) carry their service logo so
  // the source reflects its nature instead of a generic link glyph.
  const serviceLogo = detectUrlService(url)?.logo || null;
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
    serviceLogo,
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

// Pasted-text import (alpha feedback #4 — no more "convert your blurb to a
// PDF first"). Skips the upload phase entirely: a raw text blob goes
// straight into Processing as a "Text" source. A title is derived from the
// first non-empty line so the source list reads sensibly.
export function startTextImport(text, sessionId, title) {
  const trimmed = (text || "").trim();
  // One-line, whitespace-collapsed view of the blob — used for the preview
  // snippet + word count. We never surface the full content as the title.
  const collapsed = trimmed.replace(/\s+/g, " ").trim();
  const firstLine = (trimmed.split("\n").find((l) => l.trim().length) || "").trim();
  const wordCount = collapsed ? collapsed.split(" ").length : 0;
  const looksLikeUrl = /^https?:\/\//i.test(firstLine);
  // Clean, concise label: an explicit title wins; otherwise a short,
  // title-like first line; otherwise the generic "Pasted text" (so a giant
  // paragraph or a pasted URL never becomes the source name).
  const name =
    (title && title.trim()) || (firstLine && !looksLikeUrl && firstLine.length <= 52 ? firstLine : "Pasted text");
  const preview = truncate(collapsed, 100);
  const meta = `${wordCount} ${wordCount === 1 ? "word" : "words"}`;
  const upload = {
    id: newId("up"),
    name,
    size: meta,
    kind: "Text",
    iconKey: "text",
    status: "processing",
    progress: 100,
    sourceId: null,
    sessionId,
    preview,
    wordCount,
  };
  uploads.unshift(upload);

  const sourceId = newId("src");
  upload.sourceId = sourceId;
  const list = getOrInitSessionSources(sessionId);
  list.unshift({
    id: sourceId,
    filename: name,
    kind: "Text",
    status: "Processing",
    signal: "Pending",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
    preview,
    wordCount,
  });
  notifySources(sessionId);
  notifyUploads();

  setTimeout(() => transitionToDone(upload), randomProcessingMs());
  return upload.id;
}

function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
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

// Add an already-known item as a ready (Processed) source — no upload, no
// processing ticker. Used when a repurposed top post should show up in the
// Sources panel so the user can find what fed their drafts. Deduped by id
// (stable per post), so repurposing the same post twice doesn't duplicate it.
// `iconClass` lets the row render a network logo (see renderSourceRow).
export function addReadySource(
  sessionId,
  { id, filename, kind = "Post", preview = "", iconClass = null, topPost = null },
) {
  const list = getOrInitSessionSources(sessionId);
  if (list.some((s) => s.id === id)) return id;
  list.unshift({
    id,
    filename,
    kind,
    status: "Processed",
    signal: "Reused",
    signalColor: "grey",
    ideaCount: 0,
    addedAt: "just now",
    preview,
    iconClass,
    // A repurposed top post carries its full winner payload so the Sources
    // panel can render the real post card (renderTopPostEcho) instead of a
    // generic file row.
    topPost,
  });
  notifySources(sessionId);
  return id;
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
  const isVideo = src.kind === "Video";
  // Video defers idea extraction + clip creation to the post-upload
  // "what to do?" choice; other kinds keep their immediate ideaCount.
  src.ideaCount = isVideo ? 0 : ideaCount;
  let clipCount = 0;
  notifySources(sessionId);

  // Symmetric toast with transitionToDone — the chat is no longer
  // blocked during analysis, so the user may be mid-typing when the
  // source completes and miss the inline bubble flip. The non-video toast
  // duplicates the composer status bar, so it's gated; the video ping stays.
  if (isVideo || isFlagOn("statusActionSnackbars")) {
    import("./components/toast.js").then(({ showToast }) => {
      showToast(
        isVideo ? `${src.filename} ready` : `${src.filename} ready · ${formatExtractionSummary(ideaCount, clipCount)}`,
      );
    });
  }
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

// Rename a source (the displayed filename). No-op if the id isn't found or
// the name is empty.
export function renameSource(sessionId, sourceId, name) {
  const next = String(name || "").trim();
  if (!sessionId || !sourceId || !next) return false;
  const list = sourcesBySession.get(sessionId);
  if (!list) return false;
  const src = list.find((s) => s.id === sourceId);
  if (!src || src.filename === next) return false;
  src.filename = next;
  notifySources(sessionId);
  return true;
}
