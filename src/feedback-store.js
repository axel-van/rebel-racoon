// feedback-store — central, in-memory record of what the user tells us: their
// verdicts on the things Archie generates (drafts, images, clips), and their
// reasons when a step asks for one. One flat Map keyed by a stable `targetId`
// string the caller mints per element:
//
//   draft:<postId>          — a generated post draft
//   image:<postId>:<seed>   — a generated image (seed so Regenerate = fresh target)
//   clip:<clipId>           — an extracted video clip
//   skip:connect-profiles   — why onboarding's account step was skipped
//
// Each record holds the thumb verdict plus the optional "what was off?"
// detail collected on a thumbs-down (reason chips + free-text comment). A
// record written by `recordReasons` carries the same reasons + comment shape
// with no verdict at all — it answers a question rather than rating a result,
// so there is no thumb to hold. Those targetIds live in their own namespace
// (`skip:`), so nothing that renders a thumb ever reads one.
//
// This is a prototype: there is no backend. We keep the votes in memory so
// the UI can reflect them across re-renders, and `console.info` each one so
// the "data we would collect" is visible in the dev console. No localStorage
// persistence (matches the rest of the app's app-state policy).

import { createNotifier } from "./store-utils.js?v=1217";

const feedbackByTarget = new Map(); // targetId → { verdict, reasons, comment, ts }
const notifier = createNotifier("feedback");

// Read the current record for a target, or null if the user hasn't voted.
export function getFeedback(targetId) {
  return feedbackByTarget.get(targetId) || null;
}

// Set / toggle the thumb verdict. Clicking the active side again clears it
// (and drops any attached reasons), mirroring the existing clip/idea thumbs.
// `meta` carries context for the console log (kind, label) — not persisted UI.
export function setVerdict(targetId, verdict, meta = {}) {
  if (verdict !== "up" && verdict !== "down") return null;
  const current = feedbackByTarget.get(targetId);
  const next = current?.verdict === verdict ? null : verdict;

  if (next === null) {
    feedbackByTarget.delete(targetId);
    log(targetId, { verdict: null }, meta);
    notify();
    return null;
  }

  const record = {
    verdict: next,
    // A fresh thumbs-down starts with empty detail; switching up→down keeps
    // nothing stale. Thumbs-up never carries reasons.
    reasons: next === "down" ? (current?.verdict === "down" ? current.reasons || [] : []) : [],
    comment: next === "down" && current?.verdict === "down" ? current.comment || "" : "",
    ts: stamp(),
  };
  feedbackByTarget.set(targetId, record);
  log(targetId, record, meta);
  notify();
  return record;
}

// Attach the "what was off?" detail to an existing thumbs-down. No-op if the
// target isn't currently a down-vote (the panel only shows in that state).
export function recordDetail(targetId, { reasons = [], comment = "" } = {}, meta = {}) {
  const current = feedbackByTarget.get(targetId);
  if (!current || current.verdict !== "down") return null;
  const record = { ...current, reasons: [...reasons], comment: comment.trim(), ts: stamp() };
  feedbackByTarget.set(targetId, record);
  log(targetId, record, { ...meta, detail: true });
  notify();
  return record;
}

// Record the reasons a user gave for a question the app asked — no verdict,
// because nothing here was generated to rate. Same `reasons` + `comment` shape
// as a thumbs-down detail, so the logged "data we would collect" reads the same
// whichever way it was collected. Overwrites: the question is asked once.
export function recordReasons(targetId, { reasons = [], comment = "" } = {}, meta = {}) {
  if (!targetId) return null;
  const record = { verdict: null, reasons: [...reasons], comment: comment.trim(), ts: stamp() };
  feedbackByTarget.set(targetId, record);
  log(targetId, record, meta);
  notify();
  return record;
}

function notify() {
  notifier.notify(feedbackByTarget);
}

// Date.now() is fine in app code (the no-Date rule only applies to workflow
// scripts). Used purely as an ordering hint in the logged "data".
function stamp() {
  return Date.now();
}

function log(targetId, record, meta) {
  console.info("[feedback]", targetId, { ...meta, ...record });
}
