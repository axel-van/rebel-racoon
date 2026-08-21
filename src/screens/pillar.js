// One pillar, route /pillar/:id — one page, no tabs.
//
//   Pillar Aggregated Context   the condensed prose Archie carries into a chat,
//                               with the diff toggle and the pencil that edits it
//   Assets                      the files you have attached
//
// ── Where the trail went ──────────────────────────────────────────────────
// This page used to have a second tab, "What went into it": every topic, chat and
// note, newest first, each quoted and each removable. It is now the History
// dialog (components/pillar-history-modal.js), opened from the provenance line
// under the prose.
//
// The tab was the wrong shape twice over. It sat on the OTHER SIDE of the page
// from the text it explained, so it was opened rarely and the context stayed
// unexplained; and it listed one row per input, which is not how anyone thinks
// about a weekly cadence. The dialog answers where the question is asked and
// groups by event.
//
// Removing an input went with it, deliberately. An input is a record of what
// happened; deleting it would rewrite that record to change a sentence. The
// sentence is changed by editing the context — the pencil on the section.
//
// ── Why the record still quotes every input ───────────────────────────────
// A title tells you a topic was matched. An excerpt tells you WHAT PART of it the
// pillar swallowed, which is the only thing anyone can actually judge. A note is
// the user's own text, so it is quoted whole and marked as such — the one place
// in this feature where a model must not restate the input.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate, getPath } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=492";
import { showToast } from "../components/toast.js?v=21";
import { isFlagOn } from "../feature-flags.js?v=23";
import { parseHashParams } from "../url-state.js?v=21";
import { renderDiff, hasDiff } from "../text-diff.js?v=1";
import { open as openHistory } from "../components/pillar-history-modal.js?v=17";
import {
  getPillarById,
  addAsset,
  removeAsset,
  assetKindFor,
  markPillarSeen,
  updatePillar,
  subscribe as subscribePillars,
  recordContextEdit,
  NAME_MAX,
} from "../pillars-store.js?v=16";

const PAGE = 8;

// The group's own horizontal chrome: 2 × --ref-spacing-xs of padding + 2 × 1px of
// border. .ap-input-group is border-box, so the measured title width has to be
// grown by this much for the input's TEXT to start where the title's text did.
const INPUT_CHROME = 26;

// The trail is no longer a TAB. It is the History dialog
// (components/pillar-history-modal.js), opened from the provenance line under the
// context — which is where the question "what changed?" is actually asked. As a
// tab it sat on the other side of the page from the text it explained, and it was
// opened rarely enough that the context stayed unexplained.
//
// showDiff: whether the context is rendered marked against its previous version.
// OFF on arrival, always: the output is what the page is for, and a page that
// opens covered in ins/del marks answers a question nobody asked yet.
//
// editing: null | "name" | "context" — two independent in-place edits.
// nameWidth: the h1's measured px width, captured before the repaint swaps it for
// the input. It lives on `view` rather than in a local because the pillars-store
// subscription repaints while the edit is open, and every repaint has to size the
// field the same way.
let view = { id: null, showDiff: false, editing: null, nameWidth: 0 };
let unsubscribe = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;
export function renderPillar(params, target) {
  if (!isFlagOn("contentStrategy")) {
    navigate("/");
    return;
  }
  const pillar = getPillarById(params.id);
  if (!pillar) {
    navigate("/content-strategy");
    return;
  }
  // parseHashParams returns a URLSearchParams, not a plain object.
  const q = parseHashParams();
  // ?tab=sources is a dead link now — the trail it pointed at is the History
  // dialog. Kept readable rather than redirected: landing on the pillar is the
  // right destination, and the dialog is one click below.
  const samePillar = view.id === params.id;
  view = {
    id: params.id,
    // Marks never survive a remount, for the same reason edit mode does not:
    // arriving at a page already covered in them is not what anyone asked for.
    showDiff: samePillar ? view.showDiff : false,
    // Edit mode never survives a remount: leaving the block you were editing and
    // coming back to a live textarea is how unsaved text goes missing without
    // anyone noticing.
    editing: null,
    // Dropped with `editing`: a width measured against another pillar's title, or
    // against this one before a rename, would size the next field to the wrong text.
    nameWidth: 0,
  };
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Opening the pillar is what marks its sources seen — not opening the section.
  // Clearing from the list would wipe a badge whose contents nobody looked at.
  markPillarSeen(params.id);
  // …and an Archie-opened pillar loses its label here, for the same reason: the
  // label means "you have not vetted this yet", not "a machine made it".
  if (pillar.createdBy === "archie" && !pillar.reviewed) updatePillar(params.id, { reviewed: true });
  unsubscribe = subscribePillars(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  // Removed by name, like the click handler. The listener is bound to #app, which the
  // router does NOT replace between screens, so an anonymous one would outlive this
  // screen and keep firing on whatever renders next. (The `change`, `dragover`,
  // `dragleave` and `drop` handlers below are bound anonymously and do exactly that —
  // pre-existing, not touched here, but worth knowing before adding a sixth.)
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function paint(target) {
  const p = getPillarById(view.id);
  if (!p) return;
  target.innerHTML = html`<section class="screen pillar-view">${raw(renderPage(p))}</section>`;
  // After EVERY paint, not just when the edit opens: the pillars-store subscription
  // repaints while the editor is on screen, and a fresh textarea comes back at its
  // rows height with the height JS had set thrown away.
  autosizeEditor(target);
}

// Grow the context editor to its own text. The whole trick is the reset on the first
// line: a textarea's `height: auto` is its ROWS height, not its content height, so
// after the reset `scrollHeight` reports whichever is taller — the content, or the
// four rows the markup asks for. That single number is both requirements at once, so
// there is no line arithmetic here to drift from the DS's line-height.
//
// The border delta is added because .ap-textarea-field's textarea is border-box:
// scrollHeight covers content + padding but not the 1px frame, and leaving it out
// clips the last line by two pixels — which reads as a rendering bug, not a rounding
// one.
function autosizeEditor(target) {
  const el = target.querySelector("[data-pillar-context]");
  if (!el) return;
  el.style.height = "auto";
  const borders = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + borders}px`;
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderPage(p) {
  return `
    <header class="pillar-view__head">
      <div class="pillar-view__heading">
        <!-- TWO independent edits on this page, each with its own pencil: the
             NAME here, the condensed context on its own section. One control for
             both used to swap the whole page into an edit state, so renaming a
             pillar put you in front of a textarea you had not asked to touch —
             and saving wrote both fields whether or not you meant to.
             Both follow playbook-view's renderPanelHead: the pencil and the
             Cancel/Save pair occupy ONE slot and swap places, so the row keeps its
             shape and the controls that commit an edit sit where the control that
             started it was. -->
        <div class="pillar-view__title-row">
          ${
            view.editing === "name"
              ? // No .ap-form-field and no label: the h1 this input replaces already
                // said what the field is, so a "Name" label above it would caption a
                // title. .ap-input-group is what carries the DS border, so the input
                // needs no class of its own — but it does need an aria-label, because
                // dropping the visible label leaves it with no accessible name.
                //
                // The width is the TITLE's own measured width, so the header does not
                // resize as the two swap — a header that grows on entering edit mode
                // moves Save under the cursor that just pressed the pencil. Inline,
                // because only the runtime knows how wide this name rendered; CSS
                // keeps the floor and the ceiling (see .pillar-view__name-input).
                // The `ch` fallback covers a repaint that never measured, and keeps
                // the field content-sized rather than snapping to the ceiling.
                `<div class="ap-input-group pillar-view__name-input" style="width:${
                  view.nameWidth ? `${view.nameWidth + INPUT_CHROME}px` : `${Math.min(p.name.length, NAME_MAX) + 2}ch`
                }">
                   <input type="text" data-pillar-name value="${escapeAttr(p.name)}" aria-label="Pillar name"
                     maxlength="${NAME_MAX}" />
                 </div>
                 <div class="pillar-view__actions">
                   <button type="button" class="ap-button ghost grey" data-pillar-cancel><span>Cancel</span></button>
                   <button type="button" class="ap-button primary orange" data-pillar-save>
                     <i class="ap-icon-check"></i><span>Save changes</span>
                   </button>
                 </div>`
              : `<h1 class="ap-h2 pillar-view__title">${escapeAttr(p.name)}</h1>
                 <button type="button" class="ap-icon-button ghost grey pillar-view__rename" data-pillar-edit="name"
                   title="Rename this pillar" aria-label="Rename this pillar">
                   <i class="ap-icon-pen"></i>
                 </button>`
          }
        </div>
      </div>
      <!-- Share stays put through a rename, the same way the Playbook recap keeps
           its header actions while a section is being edited: it acts on the whole
           pillar, so an edit to one field is not a reason for it to disappear. -->
      <div class="pillar-view__actions">
        <button type="button" class="ap-button stroked grey" data-pillar-share>
          <i class="ap-icon-share"></i><span>Share</span>
        </button>
      </div>
    </header>
    ${renderContextTab(p)}
  `;
}

function renderContextTab(p) {
  const editing = view.editing === "context";
  const text = p.context || p.about || "";
  // Something to compare against — a run or an edit has landed at least once.
  // Without it the toggle would be a control that can only disappoint.
  const comparable = hasDiff(p.previousContext, text);
  const marked = view.showDiff && comparable;
  // `autoresize`, not `resizable`. The DS ships both: `resizable` is a drag handle,
  // `autoresize` is `overflow: hidden` on the textarea — the CSS half of a height that
  // code keeps in step with the content (its Angular component sets the other half;
  // here autosizeEditor() does). They are not combinable: with a handle you can drag
  // the box shorter than its text, and overflow:hidden would then hide the text with
  // no scrollbar to find it again.
  //
  // The handle is no loss. It existed because the box opened at a fixed 5 rows onto a
  // context of any length, so the first thing you did was drag it; a box that already
  // fits has nothing to drag for.
  //
  // rows="4" is the MINIMUM, expressed the way HTML expresses it: a textarea's
  // intrinsic height comes from `rows`, so a short context still opens as four lines
  // rather than collapsing onto one. autosizeEditor() never goes below it.
  const body = editing
    ? `<div class="ap-textarea-field autoresize pillar-sec__editor">
         <textarea data-pillar-context rows="4">${escapeAttr(text)}</textarea>
       </div>`
    : `<p class="pillar-sec__prose">${marked ? renderDiff(p.previousContext, text) : escapeAttr(text)}</p>`;
  return `
    <section class="pillar-sec ${editing ? "is-editing" : ""}">
      <div class="pillar-sec__head">
        <!-- The Frozen pill rides WITH the title, not with the controls: it
             qualifies the section, and the corner is reserved for the two things
             that act on the text. Same DS status pill, in the same orange, the
             Topic Feed's paused row uses. -->
        <h2 class="pillar-sec__title">
          Pillar Aggregated Context
          ${p.frozen ? `<span class="ap-status tagOrange"><span>Frozen</span></span>` : ""}
        </h2>
        <!-- The pencil belongs to THIS section, because this section is the only
             thing it edits. An icon button rather than a labelled one: the
             heading beside it already names what is being edited, so the word
             "Edit" would have been the second half of a sentence the title has
             just finished.
             Editing swaps it for Cancel + Save in the same slot — the pattern
             playbook-view's renderPanelHead uses for every panel. The pair used to
             sit at the FOOT of the section, below the note, which put the commit
             two paragraphs away from the pencil that started the edit and made the
             section grow a row as you entered it. -->
        ${
          editing
            ? `<div class="pillar-sec__actions">
                 <button type="button" class="ap-button ghost grey" data-pillar-cancel><span>Cancel</span></button>
                 <button type="button" class="ap-button primary orange" data-pillar-save>
                   <i class="ap-icon-check"></i><span>Save changes</span>
                 </button>
               </div>`
            : // Two controls, and only two: see what changed, and change it. The
              // frozen state moved to the title and the freeze switch moved into
              // the History dialog, because a corner holding four things buried
              // the two the reader came for.
              `<div class="pillar-sec__ctrls">
                 <label class="ap-toggle-container pillar-sec__diff" ${comparable ? "" : 'aria-disabled="true"'}>
                   <input type="checkbox" data-pillar-diff ${view.showDiff && comparable ? "checked" : ""}
                     ${comparable ? "" : "disabled"} />
                   <i aria-hidden="true"></i>
                   <span>Show what changed</span>
                 </label>
                 <button type="button" class="ap-icon-button ghost grey pillar-sec__edit" data-pillar-edit="context"
                   title="Edit the context" aria-label="Edit the context">
                   <i class="ap-icon-pen"></i>
                 </button>
               </div>`
        }
      </div>
      ${body}
      <!-- The provenance line: when the context last changed, and the one route to
           the record. It reads AFTER the prose because it is about the prose — the
           output is the reason the page exists.
           It used to open by restating the cadence ("Updated weekly from every
           topic, chat and note in this pillar"), which is the same sentence the
           pillar's own description already carries and the History dialog says
           again at the top of the record. Three statements of one fact, and the
           two things this line alone can tell you — when it last ran, and where to
           read what it did — were the ones being read past. The FROZEN half stays:
           that is a state, not a cadence, and nothing else on the section says it. -->
      <p class="pillar-sec__note pillar-sec__note--record">
        ${
          editing
            ? "Your words win. The context is rewritten whenever a source is added or removed — editing it now replaces what was there, and the change is kept in the history."
            : // CONTROL FIRST, then what it annotates. The link used to follow the
              // sentence, which put the line's only control at the end of a run of
              // prose and left the reader scanning past a timestamp to find it. Lead
              // with it and the line reads as "here is the record — and here is when
              // it last changed".
              //
              // `standalone`, with a glyph. The default inline variant is for a link
              // sitting INSIDE a sentence, underlined to match the prose around it —
              // this one leads the line and is its only control, which is what
              // standalone means. The DS notes that dropping the underline takes away
              // the affordance the text had, so a standalone link highly recommends an
              // icon; ap-icon-history is the same glyph the article dialog's "See past
              // versions" link uses for the same kind of record.
              //
              // The link keeps standalone's 14px/700 and the sentence goes back to
              // caption — the two asks that produced this line are both satisfied by
              // the SPLIT rather than by one size for both. Same size for a control
              // and its annotation is what made the control hard to find in the first
              // place; different sizes with the control leading is the hierarchy.
              // Icon LEADS the label, as a marker for the control rather than a
              // direction out of it. Getting that back without breaking the row's
              // baseline is a CSS job, not a DOM-order one — see .pillar-sec__history:
              // the icon opts out of baseline alignment so the LABEL is what the link
              // offers the row as its baseline. Swapping the two in the markup was the
              // blunt way to the same place and it cost the icon its leading position.
              `<button type="button"
                 class="ap-link standalone pillar-sec__history" data-pillar-history>
                 <i class="ap-icon-history" aria-hidden="true"></i>Context history</button>
               <span class="pillar-sec__when">${p.frozen ? "Frozen — updates are held. " : ""}Last rewritten ${escapeAttr(
                 p.contextUpdatedAgo || "a while ago",
               )}.</span>`
        }
      </p>
    </section>
    ${renderAssets(p)}`;
}

// Assets sit on the CONTEXT tab, not the trail: they describe what the pillar
// HAS, not how it was built. They are also the one shelf in this feature that is
// entirely the user's — nothing is ever filed here automatically, and saying so
// on the surface is what makes the rest of the automatic behaviour tolerable.
function renderAssets(p) {
  const tiles = p.assets.map(
    (a) => `
    <div class="pillar-asset" data-asset-id="${escapeAttr(a.id)}">
      <span class="pillar-asset__thumb pillar-asset__thumb--${escapeAttr(a.kind)}">
        <i class="${a.kind === "image" ? "ap-icon-image" : a.kind === "video" ? "ap-icon-video" : "ap-icon-file"}"></i>
      </span>
      <span class="pillar-asset__name" title="${escapeAttr(a.name)}">${escapeAttr(a.name)}</span>
      <span class="pillar-asset__meta">${escapeAttr(a.size || "")}</span>
      <button type="button" class="ap-icon-button transparent pillar-asset__x"
        data-asset-remove="${escapeAttr(a.id)}" aria-label="Remove ${escapeAttr(a.name)}">
        <i class="ap-icon-close"></i>
      </button>
    </div>`,
  );
  return `
    <section class="pillar-sec">
      <h2 class="pillar-sec__title">Assets <span class="ap-counter normal grey">${p.assets.length}</span></h2>
      <div class="pillar-assets">
        ${tiles.join("")}
        <div class="ap-dropzone ap-dropzone--compact pillar-drop" data-dropzone data-pillar-drop role="button" tabindex="0"
          aria-label="Drop files here, or browse">
          <span class="ap-dropzone__icon"><i class="ap-icon-upload" aria-hidden="true"></i></span>
          <span class="ap-dropzone__text">
            <span class="ap-dropzone__title">Drop files here, or <span class="ap-dropzone__browse">browse</span></span>
            <span class="ap-dropzone__sub">Images, video, PDF, docs</span>
          </span>
          <input type="file" class="ap-dropzone__input" multiple hidden />
        </div>
      </div>
      <p class="pillar-sec__note">
        Assets are only used drafting from this pillar. They are never automatically adjusted.
      </p>
    </section>`;
}

// The trail that used to live here — renderSourcesTab, its rows, the empty state
// and the IntersectionObserver that paged it — is gone, not parked. It became the
// History dialog (components/pillar-history-modal.js), which reads the same data
// through pillars-store.getPillarTimeline() and shows it as EVENTS: a weekly run
// with its inputs, a manual rewrite with its diff, a freeze, a resume. Keeping
// both would have been two answers to one question on one surface.
//
// Removing a source went with it, deliberately. An input is a record of what
// happened; deleting it rewrites that record to change a sentence. The sentence
// is changed by editing the context — which is what the pencil above does, and
// what the dialog's one verb offers.

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    // The record, in a dialog. It carries the freeze switch too, so this one link
    // is the way to everything that is not "read or edit the text".
    // The dialog is read-only and hands nothing back — it used to close into this
    // page's edit state, which made the loudest control on a screen for READING
    // the record one that changed the text, from a surface that could not show
    // the result. Editing is the pencil above, in place, where the text is.
    if (event.target.closest("[data-pillar-history]")) {
      openHistory({ pillarId: view.id });
      return;
    }
    const startEdit = event.target.closest("[data-pillar-edit]");
    if (startEdit) {
      // "name" or "context" — one page, two independent edits.
      view.editing = startEdit.getAttribute("data-pillar-edit") || "context";
      // Measure the h1 BEFORE the repaint removes it — this is the only moment the
      // rendered title width exists to be read. paint() writes innerHTML, so the
      // node is gone by the next line.
      if (view.editing === "name") {
        const titleEl = target.querySelector(".pillar-view__title");
        view.nameWidth = titleEl ? Math.round(titleEl.getBoundingClientRect().width) : 0;
      }
      paint(target);
      const field = target.querySelector(view.editing === "name" ? "[data-pillar-name]" : "[data-pillar-context]");
      if (field) {
        field.focus();
        if (view.editing === "name") field.select();
      }
      return;
    }
    if (event.target.closest("[data-pillar-cancel]")) {
      view.editing = null;
      paint(target);
      return;
    }
    if (event.target.closest("[data-pillar-save]")) {
      // Each editor writes ONLY its own field. The single save used to write both
      // whether or not the other had been opened, so renaming a pillar rewrote
      // the context with whatever the textarea happened to hold.
      const mode = view.editing;
      view.editing = null;
      if (mode === "name") {
        const nameEl = target.querySelector("[data-pillar-name]");
        // Sliced as well as maxlength'd: the attribute stops typing and pasting, it
        // does not stop a value that arrived any other way. The store is what every
        // other surface reads, so the cap has to hold at the write.
        const name = nameEl ? nameEl.value.trim().slice(0, NAME_MAX) : "";
        // A pillar with no name is not a pillar — keep the old one rather than
        // writing an empty title nobody can find again.
        if (name) updatePillar(view.id, { name });
        else paint(target);
        showToast(name ? "Pillar renamed" : "Name left as it was");
        return;
      }
      const contextEl = target.querySelector("[data-pillar-context]");
      const context = contextEl ? contextEl.value.trim() : "";
      // Read the OLD context before the write, or there is nothing left to
      // record: the trail entry is the only copy of what the condensed text used
      // to say.
      const previous = getPillarById(view.id)?.context || "";
      updatePillar(view.id, { context });
      const logged = recordContextEdit(view.id, previous, context);
      showToast(logged ? "Context rewritten — added to the history" : "Context unchanged");
      return;
    }
    if (event.target.closest("[data-pillar-share]")) {
      showToast("Share link copied");
      return;
    }
    const rmAsset = event.target.closest("[data-asset-remove]");
    if (rmAsset) {
      const removed = removeAsset(view.id, rmAsset.getAttribute("data-asset-remove"));
      if (removed) showToast(`Removed ${removed.name}`);
      return;
    }
    const drop = event.target.closest("[data-pillar-drop]");
    if (drop) {
      const input = drop.querySelector(".ap-dropzone__input");
      if (input) input.click();
      return;
    }
  };
  target.addEventListener("click", boundClick);

  // Keep growing as you type. This is what makes `autoresize`'s overflow:hidden safe
  // — without it, text typed past the opening height would be clipped with no
  // scrollbar and no handle to recover it. Delegated like every other listener here,
  // and it repaints nothing: the height is the only thing that changes, so touching
  // innerHTML would cost the caret its position on every keystroke.
  boundInput = (event) => {
    if (event.target.closest("[data-pillar-context]")) autosizeEditor(target);
  };
  target.addEventListener("input", boundInput);

  target.addEventListener("change", (event) => {
    // The diff toggle. `change` rather than click: it is a checkbox inside a
    // label, and the label's own activation is what fires here.
    const diff = event.target.closest("[data-pillar-diff]");
    if (diff) {
      view.showDiff = diff.checked;
      paint(target);
      return;
    }
    const input = event.target.closest(".ap-dropzone__input");
    if (!input || !input.files || !input.files.length) return;
    const names = [...input.files].map((f) => f.name);
    for (const name of names) addAsset(view.id, { name, kind: assetKindFor(name), size: "—" });
    input.value = "";
    showToast(names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} assets`);
  });

  // Drag-and-drop on the dropzone. Not bindDropzone(): that helper wires a
  // stable ancestor and this screen repaints its whole tree on every store
  // notification, so the listeners live on the screen root like every other
  // handler here.
  target.addEventListener("dragover", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (!dz) return;
    event.preventDefault();
    dz.classList.add("is-dragover");
  });
  target.addEventListener("dragleave", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (dz) dz.classList.remove("is-dragover");
  });
  target.addEventListener("drop", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (!dz) return;
    event.preventDefault();
    dz.classList.remove("is-dragover");
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    for (const f of files) addAsset(view.id, { name: f.name, kind: assetKindFor(f.name), size: "—" });
    showToast(files.length === 1 ? `Added ${files[0].name}` : `Added ${files.length} assets`);
  });
}
