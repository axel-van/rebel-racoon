// Clip Studio — a dedicated, full-page "Extract video clips" flow that runs in
// its own `clip-studio-*` session. Stages drive the render in
// screens/session.js (renderClipStudio):
//
//   upload    → 2-panel config screen (upload + duration/format/caption/instructions)
//   analyzing → full-page loader; a self-contained ticker fakes a ~2 min
//               analysis (real wait ~12s) then attaches clips to a REAL source
//   clips     → full-page review grid (select / edit / add clips) — no composer
//   profiles  → pick profiles + per-network format, then create drafts
//
// Mirrors the per-session state pattern of inline-question.js: a module-local
// Map(sessionId → state) + a Map(sessionId → Set<fn>) of subscribers, with
// notify() fanning out to re-render the assistant panel.
//
// Clips are SOURCE-BACKED: at analysis completion we persist them to a real
// sources-stream video source (created up-front in session.js), so the
// video-clips-modal trimmer, the right-panel Clips/Drafts surfaces, and the
// draft-creation flow all operate on one source with no divergence.

import { buildClipsForSource, updateSourceClips, getSources } from "./sources-stream.js?v=63";

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// Real analyze duration. Short enough to demo, while the ETA copy communicates
// the production "~2 min" (see fakeEtaSec in the render).
const ANALYZE_TOTAL_MS = 12000; // background "upload + analyze" while configuring
const EXTRACT_TOTAL_MS = 8000; // full-page "cutting clips" loader after Create clips

// Sub-stage labels surfaced under the loader, keyed by progress threshold.
const CLIP_STAGES = [
  { from: 0, label: "Transcribing audio" },
  { from: 0.3, label: "Finding highlights" },
  { from: 0.65, label: "Cutting clips" },
  { from: 0.9, label: "Polishing" },
];

function stageLabelFor(progress) {
  let label = CLIP_STAGES[0].label;
  for (const s of CLIP_STAGES) if (progress >= s.from) label = s.label;
  return label;
}

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

export function isActive(sessionId) {
  return states.has(sessionId);
}

export function getState(sessionId) {
  return states.get(sessionId) || null;
}

// Re-render hook for callers that mutated source-backed state outside this
// module (e.g. the video-clips-modal saving clips) and need the studio to
// repaint from the now-updated source.
export function refresh(sessionId) {
  notify(sessionId);
}

export function start(sessionId, { contextId = null } = {}) {
  states.set(sessionId, {
    stage: "upload",
    contextId: contextId || null, // Playbook governing the voice of the drafts
    config: { duration: "auto", format: "9:16", captionStyle: "bold", instructions: "" },
    videoProvided: false,
    uploadState: null, // null | "processing" | "ready" — background upload/analysis
    pending: null, // { sourceName } stashed at file/url pick
    sourceName: null,
    sourceId: null, // real sources-stream source id (set when analysis starts)
    clips: null, // mirror; the source is the source of truth once analysis completes
    selectedClipIds: null, // array of selected clip ids (default = all)
    profileSelection: null, // array of selected account ids
    perNetworkFormat: {}, // { network: formatId } overrides for the profiles step
    analyzeStartedAt: 0,
    analyzeTotalMs: EXTRACT_TOTAL_MS,
    _progress: 0,
    _stageLabel: CLIP_STAGES[0].label,
    _tickerTimer: null, // extraction loader ticker
    _uploadTimer: null, // background upload/analyze timer
  });
  notify(sessionId);
}

export function setStage(sessionId, stage) {
  const s = states.get(sessionId);
  if (!s) return;
  s.stage = stage;
  notify(sessionId);
}

// Playbook (Context) governing the voice/audience/CTAs of the drafts created
// from the selected clips. Chosen up-front on the setup screen.
export function setContext(sessionId, contextId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.contextId = contextId || null;
  notify(sessionId);
}

// ── Config (upload screen) ────────────────────────────────────────────────
export function setConfig(sessionId, partial) {
  const s = states.get(sessionId);
  if (!s) return;
  s.config = { ...s.config, ...partial };
  notify(sessionId);
}

// Marks that a video has been chosen (file picked / URL submitted) so the
// "Generate clips" CTA can enable. Analysis starts only on Generate.
export function setVideoProvided(sessionId, { sourceName }) {
  const s = states.get(sessionId);
  if (!s) return;
  s.videoProvided = true;
  s.pending = { sourceName: sourceName || "your video" };
  notify(sessionId);
}

// ── Background upload/analysis ──────────────────────────────────────────────
// Starts the moment a video is provided. The flow STAYS on the upload/config
// stage (options remain visible + editable) while the video is "uploaded +
// analyzed" in the background (indeterminate dropzone spinner). When done, the
// dropzone flips to "ready". The real clip extraction happens later, on
// "Create clips" (createClips), which always shows the full-page loader.
export function beginProcessing(sessionId, { sourceName, sourceId }) {
  const s = states.get(sessionId);
  if (!s) return;
  s.videoProvided = true;
  s.uploadState = "processing";
  s.sourceName = sourceName || s.pending?.sourceName || "your video";
  s.sourceId = sourceId || null;
  if (s._uploadTimer) clearTimeout(s._uploadTimer);
  s._uploadTimer = setTimeout(() => {
    const cur = states.get(sessionId);
    if (!cur) return;
    cur.uploadState = "ready";
    cur._uploadTimer = null;
    notify(sessionId);
  }, ANALYZE_TOTAL_MS);
  notify(sessionId);
}

// "Create clips" — ALWAYS run the full-page extraction loader (cutting the
// clips) before showing the grid, even if the background analysis is done. The
// loader animates purely in CSS over EXTRACT_TOTAL_MS (no per-tick re-render),
// so the shimmer + progress bar stay smooth; we just flip to the grid when the
// single timeout fires.
export function createClips(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.videoProvided) return;
  if (s._uploadTimer) clearTimeout(s._uploadTimer);
  s._uploadTimer = null;
  s.stage = "analyzing";
  if (s._tickerTimer) clearTimeout(s._tickerTimer);
  s._tickerTimer = setTimeout(() => finishExtraction(sessionId), EXTRACT_TOTAL_MS);
  notify(sessionId);
}

function finishExtraction(sessionId) {
  const s = states.get(sessionId);
  if (!s || s.stage !== "analyzing") return;
  const style = s.config?.captionStyle === "none" ? null : s.config?.captionStyle || null;
  const format = s.config?.format || "9:16";
  const clips = buildClipsForSource(s.sourceId || `clipstudio_${sessionId}`).map((c) => ({
    ...c,
    subtitleStyle: style,
    format,
  }));
  s.clips = clips;
  s.selectedClipIds = clips.map((c) => c.id);
  if (s.sourceId) updateSourceClips(s.sourceId, clips);
  s.uploadState = "ready";
  s._tickerTimer = null;
  // "done" — clips are generated and attached to the source. The studio no
  // longer shows a review grid / profiles screen; session.js observes this
  // stage and hands off to the conversational chat (see clipsToChat).
  s.stage = "done";
  notify(sessionId);
}

// Re-bake the current format + caption config onto every clip. Called when the
// user changes format/caption on the review step (the choice moved there from
// setup) so the trimmer modal and the resulting drafts reflect their pick.
export function applyConfigToClips(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  const style = s.config?.captionStyle === "none" ? null : s.config?.captionStyle || null;
  const format = s.config?.format || "9:16";
  const apply = (clips) => clips.map((c) => ({ ...c, subtitleStyle: style, format }));
  const src = currentSource(sessionId);
  if (src && Array.isArray(src.clips)) updateSourceClips(s.sourceId, apply(src.clips));
  if (Array.isArray(s.clips)) s.clips = apply(s.clips);
  notify(sessionId);
}

// ── Clips (review) ──────────────────────────────────────────────────────────
// The real source is the source of truth; fall back to the state mirror.
export function currentSource(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.sourceId) return null;
  return getSources(sessionId).find((src) => src.id === s.sourceId) || null;
}

export function getClips(sessionId) {
  const src = currentSource(sessionId);
  if (src && Array.isArray(src.clips)) return src.clips;
  return states.get(sessionId)?.clips || [];
}

export function toggleClip(sessionId, clipId) {
  const s = states.get(sessionId);
  if (!s) return;
  const set = new Set(s.selectedClipIds || []);
  if (set.has(clipId)) set.delete(clipId);
  else set.add(clipId);
  s.selectedClipIds = [...set];
  notify(sessionId);
}

export function setSelectedClips(sessionId, ids) {
  const s = states.get(sessionId);
  if (!s) return;
  s.selectedClipIds = [...ids];
  notify(sessionId);
}

export function isClipSelected(sessionId, clipId) {
  const s = states.get(sessionId);
  return !!s && (s.selectedClipIds || []).includes(clipId);
}

// ── Profiles step ───────────────────────────────────────────────────────────
export function goToProfiles(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.stage = "profiles";
  notify(sessionId);
}

export function backToClips(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.stage = "clips";
  notify(sessionId);
}

// Back to the config screen (from the extraction loader or the clips review).
// Cancels any running extraction; the uploaded source + its clips are kept, so
// the config shows the "ready" preview and Create clips re-runs the extraction.
export function backToConfig(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s._tickerTimer) clearTimeout(s._tickerTimer);
  s._tickerTimer = null;
  s.stage = "upload";
  notify(sessionId);
}

export function setProfileSelection(sessionId, ids) {
  const s = states.get(sessionId);
  if (!s) return;
  s.profileSelection = [...ids];
  notify(sessionId);
}

// Live search query for the profiles step. Deliberately does NOT notify — the
// caller filters the rendered rows in place so the search field keeps focus
// while typing; the query is persisted here only so a re-render (from a
// checkbox toggle) can re-apply the filter.
export function setProfileSearch(sessionId, q) {
  const s = states.get(sessionId);
  if (!s) return;
  s.profileSearch = q;
}

export function toggleProfile(sessionId, id) {
  const s = states.get(sessionId);
  if (!s) return;
  const set = new Set(s.profileSelection || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  s.profileSelection = [...set];
  notify(sessionId);
}

export function setNetworkFormat(sessionId, network, formatId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.perNetworkFormat = { ...s.perNetworkFormat, [network]: formatId };
  notify(sessionId);
}

// ── Teardown ────────────────────────────────────────────────────────────────
export function exit(sessionId) {
  const s = states.get(sessionId);
  if (!s) return;
  if (s._tickerTimer) clearTimeout(s._tickerTimer);
  if (s._uploadTimer) clearTimeout(s._uploadTimer);
  states.delete(sessionId);
  notify(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => subscribers.get(sessionId)?.delete(fn);
}
