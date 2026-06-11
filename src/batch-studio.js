// Batch Studio — a dedicated, full-page "Batch from a source" intake that runs
// in its own `batch-*` session. Unlike Clip Studio, it has a single stage: an
// upload screen where the user stages one OR MORE sources (files from their
// computer, a public/Drive link, or a connected source) and picks the Playbook
// for the chat. The primary CTA then creates a NEW chat bound to that Playbook
// and replays the staged sources through the classic source → idea-extraction
// workflow.
//
// Mirrors the per-session state pattern of clip-studio.js: a module-local
// Map(sessionId → state) + a Map(sessionId → Set<fn>) of subscribers, with
// notify() fanning out to re-render the assistant panel.
//
// Files can't survive a sessionStorage handoff, so the staged sources (incl.
// the live File objects) are carried to the freshly minted chat through an
// in-memory `pendingBatch` slot — the SPA never reloads between the two
// navigations, so a module-level variable is the safe bridge.

const states = new Map(); // sessionId → state
const subscribers = new Map(); // sessionId → Set<fn>

// In-memory carry from the batch screen to the new chat (holds File objects).
let pendingBatch = null;

let uidSeq = 0;
function nextUid() {
  uidSeq += 1;
  return `bs-${uidSeq}`;
}

// Staging lifecycle durations. Files run a brief "uploading" phase then the
// ~15s background "analyzing" pass; links/connectors skip straight to analyzing
// (nothing to upload). Purely a batch-screen visual — the real sources-stream
// processing happens later, in the chat, after "Start drafting".
const UPLOAD_MS = 1500;
const ANALYZE_MS = 15000;

function notify(sessionId) {
  const subs = subscribers.get(sessionId);
  if (subs) for (const fn of subs) fn();
}

function clearTimers(src) {
  if (src._timers) for (const t of src._timers) clearTimeout(t);
  src._timers = [];
}

// Drive a staged source uploading → analyzing → ready, notifying on each flip.
function scheduleLifecycle(sessionId, src) {
  src._timers = [];
  const toReady = () => {
    src.status = "ready";
    notify(sessionId);
  };
  const toAnalyzing = () => {
    src.status = "analyzing";
    notify(sessionId);
    src._timers.push(setTimeout(toReady, ANALYZE_MS));
  };
  if (src.origin === "file") {
    src.status = "uploading";
    src._timers.push(setTimeout(toAnalyzing, UPLOAD_MS));
  } else {
    src.status = "analyzing";
    src._timers.push(setTimeout(toReady, ANALYZE_MS));
  }
}

export function isActive(sessionId) {
  return states.has(sessionId);
}

export function getState(sessionId) {
  return states.get(sessionId) || null;
}

export function start(sessionId, { contextId = null } = {}) {
  states.set(sessionId, {
    contextId: contextId || null,
    sources: [], // { uid, name, kind, iconKey, origin, file?, classification?, url?, connector?, doc? }
  });
  notify(sessionId);
}

export function setContext(sessionId, contextId) {
  const s = states.get(sessionId);
  if (!s) return;
  s.contextId = contextId || null;
  notify(sessionId);
}

// ── Staging ──────────────────────────────────────────────────────────────────
export function addFileSource(sessionId, file, classification) {
  const s = states.get(sessionId);
  if (!s) return;
  const src = {
    uid: nextUid(),
    name: file.name,
    kind: classification.kind,
    iconKey: classification.iconKey,
    origin: "file",
    status: "uploading",
    file,
    classification,
  };
  s.sources.push(src);
  scheduleLifecycle(sessionId, src);
  notify(sessionId);
}

export function addUrlSource(sessionId, url) {
  const s = states.get(sessionId);
  if (!s) return;
  const clean = url.trim();
  if (!clean) return;
  const name = clean.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Skip exact duplicates so a double-submit doesn't double-stage.
  if (s.sources.some((src) => src.origin === "url" && src.url === clean)) return;
  const src = { uid: nextUid(), name, kind: "URL", iconKey: "url", origin: "url", url: clean, status: "analyzing" };
  s.sources.push(src);
  scheduleLifecycle(sessionId, src);
  notify(sessionId);
}

export function addConnectorSource(sessionId, connector, doc) {
  const s = states.get(sessionId);
  if (!s) return;
  const src = {
    uid: nextUid(),
    name: doc.title,
    kind: doc.kind || connector.name,
    iconKey: (doc.iconKey || "file").toLowerCase(),
    origin: "connector",
    status: "analyzing",
    connector,
    doc,
  };
  s.sources.push(src);
  scheduleLifecycle(sessionId, src);
  notify(sessionId);
}

export function addTextSource(sessionId, text) {
  const s = states.get(sessionId);
  if (!s) return;
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  // Same clean-label logic as sources-stream.startTextImport: a short title-like
  // first line, else the generic "Pasted text" (never a giant blob or a URL).
  const firstLine = (trimmed.split("\n").find((l) => l.trim().length) || "").trim();
  const looksLikeUrl = /^https?:\/\//i.test(firstLine);
  const name = firstLine && !looksLikeUrl && firstLine.length <= 52 ? firstLine : "Pasted text";
  const src = {
    uid: nextUid(),
    name,
    kind: "Text",
    iconKey: "text",
    origin: "text",
    text: trimmed,
    status: "analyzing",
  };
  s.sources.push(src);
  scheduleLifecycle(sessionId, src);
  notify(sessionId);
}

export function removeSource(sessionId, uid) {
  const s = states.get(sessionId);
  if (!s) return;
  const src = s.sources.find((x) => x.uid === uid);
  if (src) clearTimers(src);
  s.sources = s.sources.filter((x) => x.uid !== uid);
  notify(sessionId);
}

// ── Carry to the new chat ─────────────────────────────────────────────────────
// Stash the staged sources + chosen context for the freshly minted chat to pick
// up on mount. Returns true when there's something to carry.
export function stashPending(sessionId) {
  const s = states.get(sessionId);
  if (!s || !s.sources.length) return false;
  pendingBatch = { sources: s.sources.slice(), contextId: s.contextId || null };
  return true;
}

// Atomic read+clear — consumed by the new chat on mount.
export function consumePending() {
  const p = pendingBatch;
  pendingBatch = null;
  return p;
}

// ── Teardown ──────────────────────────────────────────────────────────────────
export function exit(sessionId) {
  const s = states.get(sessionId);
  if (s) for (const src of s.sources) clearTimers(src);
  states.delete(sessionId);
  notify(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  subscribers.get(sessionId).add(fn);
  return () => subscribers.get(sessionId)?.delete(fn);
}
