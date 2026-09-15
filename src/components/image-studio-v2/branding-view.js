// Image Studio — the Branding section of the settings panel.
//
// TWO switches, not one: "Show my logo on the image" and "Use brand colors". The
// logo and the palette are different impositions on an image — plenty of posts
// want the brand's colours without its wordmark in a corner, and a launch visual
// may want the mark on someone else's artwork. One switch for both made the cheap
// half hostage to the expensive one. Both default ON when the Playbook has the
// material; a switch with nothing behind it stays VISIBLE but disabled, with the
// reason underneath — a control that disappears leaves you wondering whether the
// option exists.
//
// No placement setting, just a preview of the mark: it lands bottom-right, full
// stop (BRAND_MARK in image-studio.js). Signing a visual bottom-right is the
// default for the same reason it is on paper, so the only decision left is
// WHETHER the mark appears — which makes "here is the logo I would use" the one
// thing this section owes the user, and seeing it is what catches a wrong or
// stale logo before generating.

import { escapeHtml } from "../../utils.js?v=1217";

// What the section is FOR, in the header's tooltip — the tiles show you which
// image, never why the section exists or what picking one changes.
//
// "reference for style, layout, composition" and not "an image I'll match":
// "match" overpromises and says nothing about WHAT gets matched. Naming the three
// things also names the three modes below, which are exactly those axes.
// Both halves of the section, and the one thing the controls can't say: WHERE the
// mark lands. That stopped being choosable, so the tooltip is the only place left
// that states it. Worth carrying on a disabled row too — a Playbook with neither a
// logo nor colours still gets told what the section would have done.
export const BRANDING_TIP =
  "Your Playbook's logo, stamped bottom-right, and its colors in the brief. Each switches on its own.";

// TWO switches, not one: the logo and the palette are separate impositions on an
// image and get separate opt-outs. Each one owns its own disclosure — the placer
// belongs to the logo, the swatches to the colours — so turning one off takes its
// half of the section with it and leaves the other intact.
//
// A switch stays visible with nothing behind it (disabled, with a line saying
// why) rather than disappearing: a Playbook with colours but no mark should still
// tell you the logo option exists and where it comes from.
export function brandingBody(st, branded, tinted) {
  const palette = st.playbookColors || [];
  const hasLogo = !!st.playbookLogo;
  return `${brandSwitch({
    label: "Show my logo",
    hint: "Stamp the Playbook's logo on what I generate",
    hook: "data-img-toggle-branding",
    on: branded,
    available: hasLogo,
    missing: "This Playbook has no logo yet.",
    body: branded ? brandingPreview(st) : "",
  })}
  ${brandSwitch({
    label: "Use brand colors",
    hint: "Brief the model with the Playbook's palette",
    hook: "data-img-toggle-brand-colors",
    on: tinted,
    available: palette.length > 0,
    missing: "This Playbook has no brand colors yet.",
    body: tinted ? swatchRow(palette) : "",
  })}`;
}

// One switch row and whatever it discloses. Same shape as the References switch,
// which is the other place a section is gated by one — a second bespoke row would
// have made two identical controls look like two different kinds of control.
function brandSwitch({ label, hint, hook, on, available, missing, body }) {
  const off = available ? "" : "disabled";
  // Switch and disclosure WRAPPED as one group, because the accordion body spaces
  // its children evenly: unwrapped, the gap between a switch and the thing it
  // controls was the same as the gap between the two halves, so the placer read as
  // belonging to the colours row below it as much as to the logo row above.
  return `<div class="isv2-group">
    <div class="isv2-sheet-switch">
      <span class="isv2-sheet-switch-label">${escapeHtml(label)}</span>
      <label class="ap-toggle-container" title="${escapeHtml(available ? hint : missing)}">
        <input type="checkbox" ${hook} ${on ? "checked" : ""} ${off} aria-label="${escapeHtml(label)}" />
        <i aria-hidden="true"></i>
      </label>
    </div>
    ${available ? body : `<p class="isv2-sheet-hint">${escapeHtml(missing)}</p>`}
  </div>`;
}

// The colours, as a RECAP: nothing here is clickable, and the switch above is the
// only decision — they reach the model through the brief's "Palette:" line.
//
// NO label of its own. "Use brand colors" with five dots directly under it says
// everything a "Brand color" caption in between would have said, and the caption
// made the pair read as two rows instead of one statement. The label the switch
// already carries is the label.
//
// Dots, the shape the Playbook's own "Brand color" row uses; each names itself on
// hover.
function swatchRow(palette) {
  const dots = palette
    .map(
      (c) =>
        `<span class="isv2-branddot" style="background:${escapeHtml(c.hex)}" title="${escapeHtml(
          c.name ? `${c.name} \u00b7 ${c.hex}` : c.hex,
        )}"></span>`,
    )
    .join("");
  return `<p class="isv2-branddots">${dots}</p>`;
}

// The logo PREVIEW. Not a placement control: the mark lands bottom-right and the
// user's only decision is whether it lands at all, so all this owes them is
// "here's the logo I'd use" — from the Playbook, so seeing it is how you catch a
// wrong or stale one before generating.
//
// It was a 3×3 anchor grid beside the mark. Nine positions turned out to be nine
// ways to answer a question nobody was asking.
function brandingPreview(st) {
  return `<div class="isv2-brandthumb">
      <img class="isv2-brandmark" src="${escapeHtml(st.playbookLogo)}" alt="${escapeHtml(st.playbookName || "Brand")} logo" />
    </div>`;
}
