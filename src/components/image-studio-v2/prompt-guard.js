// Image Studio — protecting a hand-edited brief from the options that rewrite it.
//
// An option doesn't nudge a line of the brief, it re-derives the whole thing. That's
// fine while the brief is Archie's — it's his to rewrite — but once the user has
// typed in a block, the same click silently throws their words away. So a brief that
// has been taken over makes the options ask first.
//
// Two surfaces, one subject:
//   promptGuardDialog(st)    the confirmation, when a change is parked
//   offerUndoIfNeeded(st)    the toast that puts a replaced brief back
//
// ── Why this dialog is not confirm-modal.js ─────────────────────────────────
// `confirm-modal` registers with modal-coordinator, and `requestOpen` closes the
// active overlay before opening — which here is the studio itself. Its close()
// runs `imageStudio.exit(KEY)` and deletes the whole session: variations,
// overlays, every setting. An "are you sure you want to lose your prompt?" that
// loses the entire studio is worse than the problem it's warning about.
//
// So this one renders INSIDE the studio body, from state, on the same one-way
// path as everything else, and never touches the coordinator. The cost is that
// dismissal is ours to wire: events.js takes Escape in capture, before the
// studio's own document-level Escape-to-close sees it.

import { escapeHtml } from "../../utils.js?v=1160";
import { showToast } from "../toast.js?v=1160";
import { KEY } from "./context.js?v=1160";
import * as imageStudio from "../../image-studio.js?v=1160";

// What each guarded setting is called in the sentence, so the dialog names the
// thing the user just clicked rather than saying "a setting".
const WHAT = {
  imageType: "the image type",
  style: "the style",
  format: "the format",
  useBranding: "branding",
  useBrandColors: "the brand colours",
  selectRef: "the reference image",
  removeRef: "the reference image",
  refMode: "how the reference is used",
  useReference: "the reference image",
};

// The brief is a set of editable BLOCKS, and every option rewrites all of them — so
// the sentence is about the brief, never about "the prompt", a word the generate flow
// no longer shows anywhere.
const COPY = {
  title: "Rewrite the brief?",
  body: "You've edited the brief by hand. Changing",
  tail: "makes me write the whole brief again, so your edits will be lost.",
  cta: "Rewrite brief",
};

export function promptGuardDialog(st) {
  const parked = st.pendingSettingChange;
  if (!parked) return "";
  const what = WHAT[parked.kind] || "this setting";
  const copy = COPY;
  return `<div class="isv2-guard" data-img-guard>
    <div class="ap-dialog isv2-guard-card" role="alertdialog" aria-modal="true" aria-labelledby="isv2GuardTitle" aria-describedby="isv2GuardBody">
      <div class="ap-dialog-header">
        <span class="ap-dialog-title" id="isv2GuardTitle">${escapeHtml(copy.title)}</span>
      </div>
      <div class="ap-dialog-content">
        <p class="isv2-guard-body" id="isv2GuardBody">
          ${escapeHtml(copy.body)} ${escapeHtml(what)} ${escapeHtml(copy.tail)}
        </p>
        <label class="isv2-guard-skip">
          <span class="ap-checkbox-container">
            <input type="checkbox" data-img-guard-skip />
            <i></i>
          </span>
          <span>Don't ask again while this studio is open</span>
        </label>
      </div>
      <div class="ap-dialog-footer">
        <div class="ap-dialog-footer-left">
          <button type="button" class="ap-button stroked grey" data-img-guard-cancel>
            <span>Cancel</span>
          </button>
        </div>
        <div class="ap-dialog-footer-right">
          <button type="button" class="ap-button primary orange" data-img-guard-confirm>
            <i class="ap-icon-sparkles-mermaid" aria-hidden="true"></i><span>${escapeHtml(copy.cta)}</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── The undo toast ──────────────────────────────────────────────────────────
//
// A render-time side effect, which needs a word of defence: the engine notifies
// and the view rebuilds, so a transition ("a rewrite just landed") is only
// observable from the render pass. Firing it from the confirm handler instead
// would toast 600ms before the text actually changes.
//
// Keyed on the undo record's IDENTITY, not on its truthiness — it stays in state
// until the next rewrite, so a plain `if (promptUndo)` would re-toast on every
// keystroke that follows.
let offered = null;

export function offerUndoIfNeeded(st) {
  const undo = st.promptUndo;
  if (!undo || st.promptLoading || undo === offered) return;
  offered = undo;
  showToast("Brief rewritten from your options", {
    action: { label: "Undo", onClick: () => imageStudio.undoPromptRewrite(KEY) },
  });
}

/** Forget what we've toasted — called on open/close so a new session starts fresh. */
export function resetUndoOffers() {
  offered = null;
}
