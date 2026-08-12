// Keyboard binding for the wizard picker (sidebar-wizard /
// inline-question modes) that overlays the assistant panel.
//
// Extracted from session.js (Lot H+) — the original block ran on every
// refresh of the assistant aside and lived inline. Pulling it out
// keeps the dispatch (which mode is active?) close to the wizard
// modules it talks to, while session.js only needs to call
// rebindWizardKeyboard(aside, sessionId) on (re-)render.
//
// Public API:
//   rebindWizardKeyboard(aside, sessionId) — call after every aside
//     swap. No-op if no wizard is active.

import * as sidebarWizard from "../../sidebar-wizard.js?v=82";
import * as inlineQuestion from "../../inline-question.js?v=48";
import * as topPostsFlow from "../../top-posts-flow.js?v=112";
import { bindWizardKeyboard, unbindWizardKeyboard } from "../_analyse-common.js?v=55";

export function rebindWizardKeyboard(aside, sessionId) {
  if (!aside) return;
  // Top-posts step 1 — the account picker is the exact inline-question component
  // (handler "inline-question"), armed by top-posts-flow when the profile stage
  // opens. Single-select: a digit / Enter clicks the row, which the shared
  // inline-question delegate routes to inlineQuestion.pick → chooseProfile. This
  // branch stays ahead of the generic inline-question one so Esc exits the whole
  // top-posts flow (clearing both stores), not just the question.
  if (topPostsFlow.getPickerState(sessionId)?.stage === "profile") {
    bindWizardKeyboard(aside, {
      handler: "inline-question",
      onExit: () => {
        unbindWizardKeyboard();
        topPostsFlow.exitPicker(sessionId);
      },
    });
    return;
  }
  // Top-posts empty studio (no published history) — no picker to nav, but Esc
  // should still leave the whole flow like the profile stage does.
  if (topPostsFlow.getPickerState(sessionId)?.stage === "empty") {
    bindWizardKeyboard(aside, {
      handler: "inline-question",
      onExit: () => {
        unbindWizardKeyboard();
        topPostsFlow.exitPicker(sessionId);
      },
    });
    return;
  }
  if (sidebarWizard.isActive(sessionId)) {
    bindWizardKeyboard(aside, {
      handler: "wizard-answer",
      onExit: () => {
        unbindWizardKeyboard();
        sidebarWizard.exit(sessionId);
      },
      onCustomSubmit: (value) => {
        sidebarWizard.answer(sessionId, "other", value);
      },
      onMultiSubmit: (selectedValues) => {
        sidebarWizard.answer(sessionId, selectedValues);
      },
    });
    return;
  }
  if (inlineQuestion.isActive(sessionId)) {
    bindWizardKeyboard(aside, {
      handler: "inline-question",
      onExit: () => {
        unbindWizardKeyboard();
        inlineQuestion.skip(sessionId);
      },
      onCustomSubmit: (value) => {
        inlineQuestion.submitCustom(sessionId, value);
      },
      onMultiSubmit: (selectedValues) => {
        inlineQuestion.submitMulti(sessionId, selectedValues);
      },
      // Stepper mode — ±/arrows adjust a row's count; Enter generates.
      onStep: (value, delta) => {
        inlineQuestion.stepBump(sessionId, value, delta);
      },
      onGenerate: () => {
        inlineQuestion.stepSubmit(sessionId);
      },
    });
    // File dropzone variant — bind `change` on the hidden <input type=file>
    // so picking a file submits via the dedicated submitFile path.
    const fileInput = aside.querySelector("[data-inline-question-custom-file]");
    if (fileInput) {
      fileInput.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) inlineQuestion.submitFile(sessionId, file);
      });
    }
    // When the question has only a free-text input (no `items`), focus
    // it on render so the user can type immediately without clicking.
    const customInput = aside.querySelector("[data-inline-question-custom]");
    const firstItem = aside.querySelector("[data-inline-question]");
    if (customInput && !firstItem) {
      Promise.resolve().then(() => customInput.focus());
    }
    return;
  }
  unbindWizardKeyboard();
}
