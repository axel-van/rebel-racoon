// Image Studio — the generate stage: the options come first, the brief comes last.
//
// ┌───────────────────────────────┬──────────────────────────────────┐
// │ [ Options ] [ Advanced ]      │  PREVIEW      [Image | In feed]  │
// │  References          Acme  ▾  │  ┌────────────────────────────┐  │
// │  Text in image             ▾  │  │  the image, or its         │  │
// │  Branding            Acme  ▾  │  │  placeholder               │  │
// │  Type                 Any  ▾  │  └────────────────────────────┘  │
// │  Style     From references  ▾ │  ▪ ▪ ▪                           │
// │  Format         1:1 · Square ▾│                                  │
// │  Output       2 variations  ▾ │                                  │
// └───────────────────────────────┴──────────────────────────────────┘
//
// The options are the form, Generate is its submit, and the brief is the answer to
// "what did you actually send?" rather than the thing you have to fill in first.
// There is no prose prompt field anywhere in the generate flow.
//
// Two earlier arrangements were removed rather than kept behind a flag, and are worth
// naming so they don't come back: a prose brief in a bottom composer with the options
// pinned to the stage's left edge in a 284px rail that ran out of height and clipped
// its own controls (git log -S isv2-panel), and one where the auto-written brief WAS
// the stage with the options as a bar of popover modifiers under it
// (git log -S isv2-bs-mod). Both landed the user on a brief before there was anything
// to brief about.
//
// ── Three decisions worth defending ──────────────────────────────────────────
//
// 1. The pane switch is a CHIP PAIR, not `.ap-tabs`. The modal header already carries
//    an `.ap-tabs` strip (Generate | Edit); a second one 300px away "would read as a
//    competing mode switch beside the real one" — the stated reason the Image / In feed
//    toggle uses `.ap-filter-chip` + `aria-pressed` (stage-view.js#viewToggle). Using
//    the same primitive also makes this strip symmetric with the one facing it in the
//    preview header.
//
// 2. Advanced is DISABLED until an image exists, exactly the way the header disables
//    Edit, with the same sentence. What it holds is the prompt that produced the image
//    on screen; offered before there is one it would be a draft of a brief, which is
//    the surface this variant exists to remove.
//
// 3. The layout NEVER changes — two halves from open to commit (`.isv2-bs`), so
//    switching pane or landing an image reflows nothing. The options half scrolls
//    internally; the preview half does not.
//
// 4. The form has a MEASURE (~520px, left-aligned in its half) rather than filling it. At
//    the half's full width a row put its label at one edge and its value at the other with
//    400px of nothing between them — the pair stopped reading as a pair. A form is one
//    of the few things that should be narrower than the space it has.
//
// 5. The DENSITY is the DS's, not the pinned panel's. These same seven rows run at 36px in
//    a 284px rail, where every pixel counts; in a 520px card that reads as a table. Under
//    `.isv2-opts` a row takes `.ap-list-panel-item`'s geometry (40px, `xxs sm`) and a
//    section body takes `.ap-accordion-content`'s padding and gap — the DS components for
//    "rows inside a bounded card" and "an expanded section". FEATURES §7bis has the table.
//
// The brief's blocks (brief-blocks.js) and the preview column (preview-column.js) stay
// in modules of their own: each is a subject with its own rules — what a brief block IS
// and how it commits, what the preview shows in each of its four states — and this file
// is the LAYOUT that hosts them.

import { settingRowEntries } from "./settings-view.js?v=1160";
import { briefBody, briefNote } from "./brief-blocks.js?v=1160";
import { previewColumn } from "./preview-column.js?v=1160";

/** Is the brief reachable yet? It describes an image, so it needs one. */
function briefReady(st) {
  return st.variations.length > 0 || !!st.currentImage;
}

// One chip per pane, driven by `aria-pressed` like every other toggle in this app.
function paneTabs(st) {
  const advanced = st.pane === "advanced" && briefReady(st);
  const locked = !briefReady(st);
  return `<div class="isv2-panetabs" role="group" aria-label="Options or the brief">
    <button type="button" class="ap-filter-chip" data-img-pane="options" aria-pressed="${!advanced}">Options</button>
    <button type="button" class="ap-filter-chip" data-img-pane="advanced" aria-pressed="${advanced}" ${locked ? 'disabled title="Generate an image first"' : ""}>Advanced</button>
  </div>`;
}

// The seven rows, verbatim from the settings panel — same sections, same state, same
// data-* hooks — each now its OWN card.
//
// This dropped the "What's in the image" / "How it's made" group headings and the two
// bounded group-cards they sat over. FEATURES §7bis argued for those groups (the order
// encodes "ce qui va DANS l'image, puis son traitement", stated rather than implied); the
// user overruled it — the headings read as chrome the options didn't need, and one card
// per option separates them more cleanly than a labelled group of rows did. The order
// still carries the reasoning by sequence, not by a caption. `settingRowEntries` already
// returns them in that order, so the pane is just their cards in a row — the card recipe
// lives in CSS (`.isv2-opts .isv2-acc`).
function optionsPane(st) {
  const rows = settingRowEntries(st)
    .map((e) => e.html)
    .join("");
  return `<div class="isv2-opts">${rows}</div>`;
}

// The brief, and where it stands. The status line sits UNDER the blocks here rather
// than in the modal footer (where the auto-brief stage keeps it): this pane is what the
// sentence is about, and the footer is a half-modal away from it.
function advancedPane(st) {
  // Past tense, and no "above": this brief has already been sent — it is what produced
  // the image beside it — and the options it came from are in the other pane.
  const note = briefNote(st, {
    intro: `I wrote this from your options. Change one and I'll write it again — or edit the text yourself.`,
  });
  return `<div class="isv2-opts isv2-opts--brief">
    <p class="isv2-bs-eyebrow">The brief I sent</p>
    ${briefBody(st)}
    ${note ? `<p class="isv2-bs-note">${note}</p>` : ""}
  </div>`;
}

export function setupStage(st) {
  const advanced = st.pane === "advanced" && briefReady(st);
  return `<div class="isv2-bs is-split isv2-bs--setup">
    <div class="isv2-bs-left">
      ${paneTabs(st)}
      ${advanced ? advancedPane(st) : optionsPane(st)}
    </div>
    ${previewColumn(st)}
  </div>`;
}
