// Deep links that open an overlay for a screenshot.
//
// The Figma sync workflow captures the app screen by screen, and a modal or
// a right-panel mode has no URL of its own — it lives behind a click. These
// two query params give the capture tool a way in:
//
//   ?openModal=add-source|bug|feedback|chat-picker|search  [&tab=upload|url|connectors]
//   ?openPanel=drafts|ideas|sources|context                [&route=/session/<id>]
//
// Note they are SEARCH params, not hash params — the hash belongs to the
// router (url-state.js), and the capture tool drives both independently.
//
// Kept out of app.js so the entry point stays a route table plus a boot
// sequence: this is tooling, and it is the only reason those overlay modules
// are imported twice in the app's graph.

import * as addSourceModal from "./components/add-source-modal.js?v=1232";
import * as bugReportModal from "./components/bug-report-modal.js?v=1232";
import * as feedbackModal from "./components/feedback-modal.js?v=1232";
import * as chatPickerModal from "./components/chat-picker-modal.js?v=1232";
import * as searchModal from "./components/search-modal.js?v=1232";
import { openDrafts, openIdeas, openSources, openContextBriefPanel } from "./components/right-panel.js?v=1232";

// Both are deferred: the screen has to mount before an overlay can sit on it.
// The panel waits longer than the modal because a session screen seeds its
// stores on mount and the panel reads them.
const MODAL_DELAY_MS = 600;
const PANEL_DELAY_MS = 1000;

function openModal(which, tab) {
  switch (which) {
    case "add-source":
      addSourceModal.open({ tab: tab || "upload" });
      break;
    case "bug":
      bugReportModal.open();
      break;
    case "feedback":
      feedbackModal.open();
      break;
    case "chat-picker":
      chatPickerModal.open({ ideaId: null });
      break;
    case "search":
      searchModal.open();
      break;
  }
}

function openPanel(panel, route) {
  switch (panel) {
    case "drafts":
      openDrafts();
      break;
    case "ideas":
      openIdeas();
      break;
    case "sources":
      openSources();
      break;
    case "context": {
      const sessionId = /^\/session\/([^/?]+)/.exec(route || "")?.[1] || null;
      if (sessionId) openContextBriefPanel({ sessionId, mode: "read" });
      break;
    }
  }
}

export function initFigmaCapture() {
  const params = new URLSearchParams(window.location.search);
  const which = params.get("openModal");
  const panel = params.get("openPanel");
  if (!which && !panel) return;

  if (which) {
    const tab = params.get("tab");
    window.setTimeout(() => {
      try {
        openModal(which, tab);
      } catch (err) {
        console.error("[capture] failed to open modal", which, err);
      }
    }, MODAL_DELAY_MS);
  }

  if (panel) {
    window.setTimeout(() => {
      try {
        openPanel(panel, params.get("route"));
      } catch (err) {
        console.error("[capture] failed to open panel", panel, err);
      }
    }, PANEL_DELAY_MS);
  }
}
