// Image Studio — the References section of the settings panel.
//
// ONE section, one reference image. Brand kit used to be a separate row above
// this one, and that was a distinction without a difference: both hold images the
// generator should look like. Where an image CAME from is a label on the tile, not
// a reason for a second section — split across two, you had to check two places
// to answer one question ("what is this going to look like?").
//
// State model: `playbookRefs` and `uploadedRefs` are two POOLS, `selectedRefId`
// is the choice, and `referenceImages` stays a derived array of 0 or 1 — because
// the prompt, the generation seed and the Style-preset lock all read "the
// references in play" without caring how many. `MAX_REFS` bounds the upload pool,
// not a multi-selection.
//
// Note on class names: the `isv2-sheet-*` classes below were written for the
// flyout sheets these panel sections replaced. They dress the panel now. See
// settings-view.js for the full note.

import { escapeHtml } from "../../utils.js?v=1225";
import { NETWORK_LABEL, NETWORK_ICON_BY_PLATFORM } from "../../social-profiles.js?v=1225";
import * as imageStudio from "../../image-studio.js?v=1225";

// The two provenances a reference image can have. Shared by the group labels and
// the collapsed header so the section can only ever call them the same thing.
// How many reference tiles fit the panel's 260px body at --isv2-tile + an 8px
// gap. Kept next to the CSS that sizes them: change one, change the other.
const VISIBLE_REFS = 3;

export const REFS_TIP =
  "An image I'll use as a reference for style, layout and composition. The mode below sets how closely I follow it.";

const BRAND_GROUP = "Brand book";

const CUSTOM_GROUP = "Custom";

// What a picked reference is called in the collapsed header: its own label if it
// has one, else where it came from. "Brand board" beats "1 selected".
// The collapsed header answers WHERE the reference came from, not which file it
// is. "Product UI" told you a filename you already see in the grid below; the
// brand book's name tells you the thing you can't see from a thumbnail — whether
// this image is going to look on-brand or like something you dropped in.
function refSource(ref, st) {
  if (!ref) return "None";
  return ref.fromPlaybook ? st.playbookName || BRAND_GROUP : CUSTOM_GROUP;
}

// …plus the mode, but ONLY when it isn't the default. The summary should report a
// choice the user made — that's what a set value means everywhere else in this
// panel — and "Acme · Blend" on every draft would say nothing while costing the
// header half its width.
export function refSummary(ref, st) {
  const source = refSource(ref, st);
  if (!ref || st.refMode === imageStudio.DEFAULT_REF_MODE) return source;
  const mode = imageStudio.REF_MODES.find((m) => m.key === st.refMode);
  return mode ? `${source} \u00b7 ${mode.label}` : source;
}

// The merged section: both pools in one grid, brand book first, then the uploader.
// Every group is LABELLED, even when it's the only one — with the two sections
// gone, the label is the only thing left saying these images come from the
// Playbook's brand book rather than from somewhere the user chose. Naming the
// book also names the standard the generated image is being held to.
export function refsBody(st, picked) {
  const pool = imageStudio.referencePool(st);
  const brand = pool.filter((r) => r.fromPlaybook);
  const mine = pool.filter((r) => !r.fromPlaybook);
  const selectedId = picked ? picked.id : null;
  const groups = [];
  if (brand.length) {
    // An em dash, not a middot: a Playbook name has middots of its own
    // ("Acme · Q2 marketing") and a third one made the label unparseable.
    const book = st.playbookName ? `${BRAND_GROUP} — ${st.playbookName}` : BRAND_GROUP;
    groups.push(refGroup(book, brand.map((r) => refTile(r, r.id === selectedId)).join(""), brand.length));
  }
  if (mine.length) {
    groups.push(refGroup(CUSTOM_GROUP, mine.map((r) => refTile(r, r.id === selectedId)).join(""), mine.length));
  }
  const capped = mine.length >= imageStudio.MAX_REFS;
  const dropzone = capped
    ? `<p class="isv2-sheet-hint">Maximum ${imageStudio.MAX_REFS} images. Remove one to add another.</p>`
    : // Just the button — not a dashed drop panel, and no longer a line of accepted
      // file types under it. The panel was a 64px-tall placeholder for an action that
      // is one click; the caption listed formats nobody was going to be surprised by
      // and restated the section's own promise. Dropping still works —
      // `data-img-dropzone` rides on the button, and generate mode accepts a drop
      // anywhere in the modal anyway (see index.js#onDrop).
      //
      // STROKED. It was ghost for a moment, to stop it out-shouting the three
      // photographs above it — but with no border and no fill it stopped reading as
      // an object at all and floated between the tiles and the mode chips. The
      // hierarchy problem it was solving is solved better by the label tiers and the
      // grouping around it, and the DS has no filled grey button (secondary is blue
      // and orange only), so a border is the way a quiet button stays a button.
      //
      // The wrapper stays: `.isv2-group` is a column flex, so an unwrapped button
      // would stretch to the panel's full width.
      `<div class="isv2-adder">
        <button type="button" class="ap-button stroked grey" data-img-dropzone data-img-ref-add>
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add an image</span>
        </button>
      </div>`;
  // The switch owns "no reference at all" — it was an 81px tile in the grid, which
  // is a lot of square for nothing, and a two-state choice is what a switch is. Off
  // hides the grid rather than leaving a picker that picks nothing: the switch IS
  // the disclosure.
  //
  // No dividers between the pieces: rules inside a section re-draw the boundary the
  // merge just removed. The group labels already separate the pools, and the
  // section's own frame separates it from Text in image below.
  const on = !!picked;
  return `<div class="isv2-sheet-switch">
      <span class="isv2-sheet-switch-label">Use a reference image</span>
      <label class="ap-toggle-container" title="Give the generator an image to match">
        <input type="checkbox" data-img-toggle-ref ${on ? "checked" : ""} aria-label="Use a reference image" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    ${on ? `<div class="isv2-group">${groups.join("")}${dropzone}</div>${picked ? refModeBlock(st) : ""}` : ""}`;
}

// A pool and its label as ONE block. Unwrapped, the body's 12px gap fell between
// the label and its own grid exactly as it fell between the two pools, so nothing
// grouped: the label read as floating above everything below it rather than as
// the title of the three tiles it belongs to.
function refGroup(label, tiles, count) {
  const head = label ? `<p class="isv2-sheet-label">${escapeHtml(label)}</p>` : "";
  // Exactly VISIBLE_REFS tiles fit the panel, which is the problem: with the
  // fourth starting a hair past the edge there is no half-tile peeking to say
  // more exist, and macOS hides its overlay scrollbar until you already scroll.
  // Ten images would read as three. The class turns on an edge fade — the only
  // affordance left — so the count is announced by the strip itself.
  const more = count > VISIBLE_REFS ? " is-scrollable" : "";
  return `<div class="isv2-block">${head}<div class="isv2-refs${more}">${tiles}</div></div>`;
}

// HOW the picked image gets used — the last thing in the section, after the pool
// and the uploader, and only ever shown when something is actually picked: a
// sub-option that outlives its subject is a control that lies.
//
// Chips, the panel's own vocabulary for "one of a small set" (Type, Format and
// Output are all chip groups) — so nothing new to learn, and one row of them fits
// the 260px body. Short labels for that reason; the hint under them spells the
// active one out in full, the same label-and-hint shape Format uses for "Best for".
function refModeBlock(st) {
  const active = imageStudio.REF_MODES.some((m) => m.key === st.refMode) ? st.refMode : imageStudio.DEFAULT_REF_MODE;
  const chips = imageStudio.REF_MODES.map((m) => {
    const sel = m.key === active;
    const tip = `${m.label} · ${m.hint}`;
    return `<button type="button" class="ap-filter-chip" data-img-ref-mode="${escapeHtml(m.key)}" aria-pressed="${sel}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${escapeHtml(m.label)}</button>`;
  }).join("");
  const hint = imageStudio.REF_MODES.find((m) => m.key === active).hint;
  return `<div class="isv2-block">
      <p class="isv2-sheet-label">How to use it</p>
      <div class="isv2-chip-group">${chips}</div>
      <p class="isv2-sheet-hint">${escapeHtml(hint)}</p>
    </div>`;
}

// One candidate. SINGLE-SELECT: picking one drops whatever was picked before, so
// the marker is a radio dot, not a tick — a tick promises you can have several.
// `aria-pressed` and not `role="radio"`, because clicking the picked one clears
// it and a radio group can't be emptied; same single-select-with-toggle-off
// contract as Image type and Style preset. An upload also carries a remove
// button: it belongs to the user, whereas a Playbook image belongs to the
// Playbook and "not this one" is what deselecting already means.
function refTile(r, on) {
  const note = (r.note || "").trim();
  const nets = Array.isArray(r.networks) ? r.networks.filter((n) => NETWORK_ICON_BY_PLATFORM[n]) : [];
  const info = [on ? "The reference for this image" : "Use as the reference"];
  if (note) info.push(note);
  if (nets.length) info.push(`Best for ${nets.map((n) => NETWORK_LABEL[n] || n).join(", ")}`);
  const remove = r.fromPlaybook
    ? ""
    : `<button type="button" class="isv2-ref-remove" data-img-ref-remove="${escapeHtml(r.id)}" aria-label="Remove this image"><i class="ap-icon-close" aria-hidden="true"></i></button>`;
  return `<div class="isv2-ref-slot">
    <button type="button" class="isv2-ref isv2-ref--pick${on ? " is-used" : " is-skipped"}" data-img-ref-toggle="${escapeHtml(r.id)}" aria-pressed="${on}" aria-label="${escapeHtml(info[0])}" title="${escapeHtml(info.join(" · "))}">
      <img src="${escapeHtml(r.url)}" alt="${escapeHtml(r.label || "Reference image")}" />
      <span class="isv2-ref-scrim" aria-hidden="true"></span>
      <span class="isv2-ref-radio" aria-hidden="true"></span>
    </button>
    ${remove}
  </div>`;
}
