// Loading watchdog for the session view. The visible "in progress" indicator
// is now the composer status bar (renderComposerStatus / syncComposerStatus in
// session.js) — this module no longer owns any DOM. It exists solely to surface
// a "taking longer than expected" toast once a loading turn crosses the 30s mark
// (FIND-D1), driven purely off the assistant thread's loading messages.
//
// Public API:
//   updateLoadingWatchdog(sessionId) — call after every thread change
//   stopThinkingTimer()              — call on session unmount

import { getThread } from "../../assistant.js?v=64";
import { showToast } from "../../components/toast.js?v=20";

const THINKING_TIMEOUT_MS = 30000;
const timedOutMessageIds = new Set();
let thinkingIntervalId = null;

export function updateLoadingWatchdog(sessionId) {
  const loadingMessages = getThread(sessionId).filter((m) => m.status === "loading");
  if (loadingMessages.length === 0) {
    stopThinkingTimer();
    return;
  }
  startThinkingTimer(sessionId);
}

function startThinkingTimer(sessionId) {
  // FIND-F: clear-and-restart rather than early-return — a new session opening
  // its watchdog while another is still running would otherwise keep polling the
  // previous sessionId.
  if (thinkingIntervalId) {
    clearInterval(thinkingIntervalId);
    thinkingIntervalId = null;
  }
  thinkingIntervalId = setInterval(() => {
    const loading = getThread(sessionId).find((m) => m.status === "loading");
    if (!loading) {
      stopThinkingTimer();
      return;
    }

    // Per-message timeout — show the toast once per loading turn that crosses
    // the boundary, so successive long turns each get their own notice instead
    // of a single early one and silence afterwards.
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
