// Image Studio — the brief, read and edited as BLOCKS. One renderer, two hosts.
//
// `derivePrompt` stores the brief as one prose string of "Label: value" lines. The
// structure is therefore already in the text; this module just stops hiding it —
// the label recedes to a caption and the value carries the weight, so a block reads
// as an answer under a question rather than as a form field.
//
// Its host is setup-stage.js's Advanced pane. It stays a module of its own because a
// block is a SUBJECT with its own rules — how it is parsed out of the prose, that
// typing in one is the takeover, how an edit writes back to its own line — and the
// stage is the layout that hosts it. Placement there, meaning here.
//
// Every block is a field, ALWAYS — there is no read-only mode and no "edit it
// yourself" link to press first. Typing in one IS the takeover
// (image-studio.js#commitBriefLine), which is what stops the next option change from
// overwriting it.

import { escapeHtml } from "../../utils.js?v=1224";
import { KEY } from "./context.js?v=1224";
import * as imageStudio from "../../image-studio.js?v=1224";

// The words on the image, as the lead block. This one edits `renderText` — the text
// that actually gets set into the artwork — not the prompt's sentence about it. They
// used to be two fields that looked like one: a "Text on image" control holding the
// real value and a brief line describing it. One field, the real one, and the prompt
// line follows from it.
//
// It leads, and leads bigger: those words are the only part of the brief that ends up
// literally visible in the artwork, so they outrank a description of them.
function textHeroBlock(st) {
  const val = st.renderText || "";
  const over = imageStudio.renderTextOverMessage(val);
  return `<label class="isv2-bs-block isv2-bs-block--hero">
    <span class="isv2-bs-key">Text on the image</span>
    <textarea class="isv2-bs-val" data-img-render-text placeholder="No words on the image" aria-label="Text on the image">${escapeHtml(val)}</textarea>
    <span class="ap-form-message error" data-img-render-text-msg role="status"${over ? "" : ` style="display:none"`}>${escapeHtml(over)}</span>
  </label>`;
}

// Lines with no label (the fallback prompts are plain prose) become a block with no
// caption rather than a block captioned with a guess.
function briefBlock(line, index) {
  const at = line.indexOf(":");
  const key = at > 0 ? line.slice(0, at) : "";
  const val = at > 0 ? line.slice(at + 1).trim() : line;
  const label = key || "Brief";
  return `<label class="isv2-bs-block">
    ${key ? `<span class="isv2-bs-key">${escapeHtml(key)}</span>` : ""}
    <textarea class="isv2-bs-val" data-img-brief-line="${index}" aria-label="${escapeHtml(label)}">${escapeHtml(val)}</textarea>
  </label>`;
}

export function briefBody(st) {
  if (st.promptLoading) {
    return `<div class="isv2-bs-loading" role="status">
      <span class="gen-image-spinner gen-loading-mark"></span>
      <p class="isv2-bs-loading-label">Writing your brief…</p>
    </div>`;
  }
  // Indices stay pointed at the RAW prompt lines even though the blocks are reordered
  // (the hero jumps to the front and the "Text in image:" line is dropped), because an
  // edit writes back to its own line — image-studio.js#writeBriefLine. So the order on
  // screen and the order in the text are allowed to differ.
  const lines = (st.promptText || "").split("\n");
  const isText = (l) => /^\s*text in image\s*:/i.test(l);
  const rest = lines
    .map((l, i) => ({ l, i }))
    .filter((e) => e.l.trim() && !isText(e.l))
    .map((e) => briefBlock(e.l, e.i))
    .join("");
  const blocks = textHeroBlock(st) + rest;
  if (!blocks)
    return `<div class="isv2-bs-doc"><div class="isv2-bs-block"><span class="isv2-bs-key">Brief</span></div></div>`;
  return `<div class="isv2-bs-doc">${blocks}</div>`;
}

// Where the brief stands, printed under the blocks in the Advanced pane.
//
// No invitation to start editing, since every block already is a field: this only
// reports the state, and offers the way back to Archie's version once something has
// changed.
//
// `intro` stays a parameter because it is the one sentence that makes a SPATIAL claim
// about where the options are, and the pane it prints in is a tab away from them — a
// second host would have to word that differently. The two taken-over states make no
// such claim, so they are fixed here.
const NOTE_INTRO = `I write this brief from your options. Change one and I rewrite it — or edit the text yourself.`;

export function briefNote(st, { intro = NOTE_INTRO } = {}) {
  if (st.promptLoading) return "";
  if (!st.briefTakenOver) return intro;
  if (st.briefStale) {
    return `<span class="isv2-brief-stale">You changed the options after editing this.</span> <button type="button" class="ap-link standalone small" data-img-brief-rebuild>Rewrite it from them</button>, or keep your words.`;
  }
  return `This is your text now, so I'll leave it alone. <button type="button" class="ap-link standalone small" data-img-brief-rebuild>Let me write it again</button>`;
}
