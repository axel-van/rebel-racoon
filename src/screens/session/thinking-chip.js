// Animated "Archie is thinking…" chip that lives in the session
// composer. Polls the assistant thread once per second to:
//   - update the elapsed-time label + credit counter
//   - surface a "taking longer than expected" toast once a loading
//     turn crosses the 30s mark (FIND-D1)
//
// Extracted from session.js (Lot H) so the timer + DOM lookups + the
// timed-out set live in one place. The session view keeps owning when
// to call updateThinkingChip / stopThinkingTimer.
//
// Public API:
//   updateThinkingChip(sessionId)  — call after every thread change
//   stopThinkingTimer()            — call on session unmount

import { getThread } from "../../assistant.js?v=36";
import { showToast } from "../../components/toast.js?v=20";

const THINKING_TIMEOUT_MS = 30000;
const timedOutMessageIds = new Set();
let thinkingIntervalId = null;

export function updateThinkingChip(sessionId) {
  const chip = document.querySelector("[data-assistant-thinking]");
  if (!chip) return;
  const thread = getThread(sessionId);
  const loadingMessages = thread.filter((m) => m.status === "loading");
  if (loadingMessages.length === 0) {
    chip.hidden = true;
    stopThinkingTimer();
    return;
  }
  chip.hidden = false;
  const startedAt = loadingMessages[0].createdAt || Date.now();
  paintThinkingChip(chip, startedAt);
  startThinkingTimer(sessionId);
}

function paintThinkingChip(chip, startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const credits = Math.max(1, Math.round(seconds / 6));
  const label = formatElapsed(seconds);
  const text = chip.querySelector("[data-thinking-text]");
  if (text) {
    text.textContent = `${label} · ${credits} credit${credits === 1 ? "" : "s"}`;
  }
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function startThinkingTimer(sessionId) {
  // FIND-F: clear-and-restart rather than early-return — a new session
  // opening its thinking-chip while another is still running would
  // otherwise keep polling the previous sessionId.
  if (thinkingIntervalId) {
    clearInterval(thinkingIntervalId);
    thinkingIntervalId = null;
  }
  thinkingIntervalId = setInterval(() => {
    const chip = document.querySelector("[data-assistant-thinking]");
    if (!chip || chip.hidden) {
      stopThinkingTimer();
      return;
    }
    const thread = getThread(sessionId);
    const loading = thread.find((m) => m.status === "loading");
    if (!loading) {
      chip.hidden = true;
      stopThinkingTimer();
      return;
    }
    paintThinkingChip(chip, loading.createdAt || Date.now());

    // Per-message timeout — show the toast once per loading turn that
    // crosses the boundary, so successive long turns each get their own
    // notice instead of a single early one and silence afterwards.
    const elapsed = Date.now() - (loading.createdAt || Date.now());
    if (elapsed >= THINKING_TIMEOUT_MS && !timedOutMessageIds.has(loading.id)) {
      timedOutMessageIds.add(loading.id);
      showToast("This is taking longer than expected. Hang tight, or refresh if it stays stuck.", {
        variant: "error",
        duration: 6000,
      });
    }
  }, 1000);
}

export function stopThinkingTimer() {
  if (thinkingIntervalId) {
    clearInterval(thinkingIntervalId);
    thinkingIntervalId = null;
  }
}
