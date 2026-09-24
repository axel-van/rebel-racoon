// Image Studio — the bottom composer: "describe a change" + Redraw, in Edit mode.
//
// It IS the app's own conversational composer, doing the same job in another
// room — built to `.session__composer-card`'s recipe, value for value, so the
// two read as one control (styles/screens/image-studio-v2.css says which).
//
// A CARD centred on the stage, not a full-width footer strip: at 1440px a
// full-bleed field runs ~180 characters per line, which is unreadable, and it
// made the tools look like chrome stranded at the bottom of a huge bar.
//
// GENERATE has no composer at all. It used to hold the image brief as a prose
// field here, with the options pinned to the stage's left edge; the generate stage
// asks for the options first and writes the brief itself, so there is nothing left
// for a prompt box to hold (setup-stage.js states the argument).

import { escapeHtml } from "../../utils.js?v=1232";

export function composer(st) {
  return st.mode === "edit" ? editComposer(st) : "";
}

// One card, one field, one action. It IS the app's own conversational composer:
// a bordered card that lights up on focus, a borderless field, the action beside
// it, and a keyboard hint below. Same recipe as `.session__composer-card` — same
// border, same shadow, same padding rhythm, same focus behaviour — because the user
// is doing the same thing here (telling Archie what to change) and it should not
// feel like a different product.
//
// `--inline` puts the action BESIDE the field rather than on a row of its own,
// bottom-aligned so it stays on the field's last line: a toolbar row of its own was
// a full row of card whose left half was empty, and the text would rather have that
// space. It used to be a parameter, when Generate had a console down here too.
// Secondary weight: the modal's one primary is "Use this image", in the footer.
function editComposer(st) {
  const busy = st.editBusy ? "disabled" : "";
  return `<div class="isv2-dock">
    <div class="isv2-console-wrap">
      <div class="isv2-console isv2-console--inline" role="group" aria-label="Edit the image">
        <textarea class="isv2-prompt" data-img-edit-prompt rows="1" placeholder="Describe a change and I'll redraw it…" aria-label="Describe a change for AI to apply" ${busy}>${escapeHtml(st.editPrompt || "")}</textarea>
        <div class="isv2-console-toolbar">
          <button type="button" class="ap-button stroked grey" data-img-apply-edit="prompt" ${busy}><i class="ap-icon-sparkles-mermaid"></i><span>Redraw</span></button>
        </div>
      </div>
      <div class="isv2-console-hint">
        <kbd>Enter</kbd> to redraw · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line
      </div>
    </div>
  </div>`;
}
