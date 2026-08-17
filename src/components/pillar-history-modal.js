// The pillar's history — every change to its aggregated context, in one dialog.
//
// A MODAL, not the tab it replaces. The tab put the record on the other side of
// the page from the text it explains, so it was opened rarely and the context
// stayed unexplained; the dialog opens from the provenance line under the prose,
// which is where the question is actually asked.
//
// ── What a row is ─────────────────────────────────────────────────────────
// One row per EVENT, not per input: a weekly run that folded in four topics is
// one row with a count, not four. That is what carries two years — a hundred
// weekly rows rather than four hundred item rows — and it matches how a reader
// thinks about a cadence ("what did last week do?"). Manual rewrites, freezes and
// resumes are rows of the same list, because they are the same kind of fact: the
// context changed, or stopped changing.
//
// ── Freezing lives here ───────────────────────────────────────────────────
// The switch that holds updates sits at the top of the record it governs, not in
// the section's corner. The corner is for acting on the text — see the diff, edit
// it — and a third control there buried both. Here the switch has its own state
// line, and every past freeze is one scroll below it.
//
// ── Read-only, and the footer says so by being empty ──────────────────────
// Nothing in this dialog changes the context. Nothing removes an input either —
// an input is a record of what happened, and deleting it would rewrite that
// record to change a sentence.
//
// The footer used to carry "Edit the context", which closed the dialog and put
// the section behind it into edit mode. It read as the obvious next step from a
// screen whose whole job is to show you what the text used to say, and that is
// exactly the problem: you arrive here to READ, and the loudest control offered
// to change the thing you are reading — from a surface that cannot show you the
// result. The pencil on the section does it in place, where the text is.
//
// So: one verb, Close. The one control that stays is the freeze switch, because
// it governs the record rather than the text.
//
// Public API:
//   init()
//   open({ pillarId })

import { html, raw, escapeAttr, escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { getPillarById, getPillarTimeline, setPillarFrozen, subscribe } from "../pillars-store.js?v=11";
import { renderDiff } from "../text-diff.js?v=1";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "pillar-history";
const PAGE = 6;

let backdrop, modal, bodyEl, subEl;
let initialized = false;
let unsubscribe = null;
let state = { pillarId: null, open: new Set(), shown: PAGE };

const HTML = `
<div class="app-modal-backdrop pillar-history__backdrop" id="pillarHistoryBackdrop" hidden></div>
<aside
  class="ap-dialog pillar-history"
  id="pillarHistoryModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pillarHistoryTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="pillarHistoryTitle">History</span>
    <span class="ap-dialog-subtitle" id="pillarHistorySub"></span>
  </div>
  <button class="ap-dialog-close" type="button" data-history-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content pillar-history__body" id="pillarHistoryBody"></div>
  <!-- One control, and no caption beside it. The footer used to carry a line
       explaining that nothing here is removable — true, but it was answering a
       question nobody had asked yet, and it cost three lines of the height the
       list needs to show four weeks at once. Read the module header for the
       reasoning; the surface does not have to argue its own case. -->
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button stroked grey" data-history-close><span>Close</span></button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("pillarHistoryBackdrop");
  modal = document.getElementById("pillarHistoryModal");
  bodyEl = document.getElementById("pillarHistoryBody");
  subEl = document.getElementById("pillarHistorySub");

  backdrop.addEventListener("click", close);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  // Delegated: the list is rebuilt on every open, on every expand, and on every
  // freeze — three reasons a per-row listener would be wrong.
  modal.addEventListener("click", onClick);
  modal.addEventListener("change", onChange);

  initialized = true;
}

function onClick(event) {
  if (event.target.closest("[data-history-close]")) return close();

  const row = event.target.closest("[data-history-entry]");
  if (row) {
    const key = row.getAttribute("data-history-entry");
    if (state.open.has(key)) state.open.delete(key);
    else state.open.add(key);
    return paint();
  }

  if (event.target.closest("[data-history-more]")) {
    state.shown += PAGE;
    return paint();
  }
}

function onChange(event) {
  const sw = event.target.closest("[data-history-freeze]");
  if (!sw) return;
  // The switch reads "keep updating", so checked means NOT frozen.
  const p = setPillarFrozen(state.pillarId, !sw.checked);
  if (p) showToast(p.frozen ? "Updates frozen" : "Updates resumed");
  paint();
}

// ── Rows ───────────────────────────────────────────────────────────────────

function renderInput(s) {
  const kind = s.kind === "chat" ? "orange" : s.kind === "note" ? "grey" : "blue";
  const label = s.kind === "chat" ? "Chat" : s.kind === "note" ? "Note" : "Topic";
  return html`<div class="pillar-history__in">
      <span class="ap-tag ${kind} mini"><span>${label}</span></span>
      <span class="pillar-history__in-title">${s.title || "Untitled"}</span>
    </div>
    ${raw(s.quote ? html`<p class="pillar-history__quote">“${s.quote}”</p>` : "")}`;
}

// A weekly run: the inputs it folded in, each with the excerpt it carried.
//
// It does NOT claim which words of the context came from which input — a
// condensed paragraph rarely traces cleanly to one source, and asserting it is
// where this would lose trust rather than build it. What it shows is what each
// input said.
function renderUpdate(entry, open) {
  const key = `w${entry.bucket}`;
  const n = entry.inputs.length;
  return html`<section class="ap-accordion pillar-history__entry ${raw(open ? "" : "collapsed")}">
    <button
      type="button"
      class="ap-accordion-header pillar-history__head"
      data-history-entry="${escapeAttr(key)}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span class="ap-accordion-title">${entry.label}</span>
      <span class="ap-counter normal grey">${n}</span>
      <i class="ap-icon-chevron-up ap-accordion-toggle" aria-hidden="true"></i>
    </button>
    <div class="ap-accordion-content pillar-history__content">
      <span class="pillar-history__lbl">What went in</span>
      ${raw(entry.inputs.map(renderInput).join(""))}
    </div>
  </section>`;
}

// A manual rewrite: the one entry that carries both texts, so it can show the
// diff rather than describe it.
function renderManual(entry, open) {
  const s = entry.source;
  const key = s.id;
  return html`<section class="ap-accordion pillar-history__entry ${raw(open ? "" : "collapsed")}">
    <button
      type="button"
      class="ap-accordion-header pillar-history__head"
      data-history-entry="${escapeAttr(key)}"
      aria-expanded="${open ? "true" : "false"}"
    >
      <span class="ap-accordion-title">${s.title || "You rewrote the context"}</span>
      <span class="ap-tag grey mini"><span>Manual</span></span>
      <span class="pillar-history__when">${s.addedAgo}</span>
      <i class="ap-icon-chevron-up ap-accordion-toggle" aria-hidden="true"></i>
    </button>
    <div class="ap-accordion-content pillar-history__content">
      <span class="pillar-history__lbl">What it changed</span>
      <p class="pillar-history__diff">${raw(renderDiff(s.before || "", s.after || ""))}</p>
    </div>
  </section>`;
}

// A freeze or a resume. No body: the event is the whole content, which is why it
// is a row rather than an accordion that opens onto nothing.
function renderEvent(entry) {
  const s = entry.source;
  const frozen = s.kind === "freeze";
  return html`<div class="pillar-history__event">
    <span class="ap-status ${raw(frozen ? "tagOrange" : "green")}"><span>${frozen ? "Frozen" : "Resumed"}</span></span>
    <span class="pillar-history__in-title">${s.title || (frozen ? "Updates frozen" : "Updates resumed")}</span>
    <span class="pillar-history__when">${s.addedAgo}</span>
  </div>`;
}

function paint() {
  const p = getPillarById(state.pillarId);
  if (!p) return close();
  const timeline = getPillarTimeline(state.pillarId);
  const shown = timeline.slice(0, state.shown);
  const more = timeline.length - shown.length;

  subEl.textContent = `${timeline.length} ${timeline.length === 1 ? "entry" : "entries"} · newest first`;

  const rows = shown
    .map((entry) => {
      if (entry.type === "update") return renderUpdate(entry, state.open.has(`w${entry.bucket}`));
      if (entry.type === "edit") return renderManual(entry, state.open.has(entry.source.id));
      return renderEvent(entry);
    })
    .join("");

  bodyEl.innerHTML = html` <!-- The state, above the record it governs: what this pillar is doing, and
         the one switch that changes it. -->
    <div class="pillar-history__state">
      <span class="pillar-history__state-text">
        <span class="pillar-history__state-title">Weekly updates</span>
        <span class="pillar-history__state-sub">
          ${p.frozen ? "Frozen — nothing is being folded in" : "Running — inputs are folded in each week"}
        </span>
      </span>
      <label class="ap-toggle-container">
        <input type="checkbox" data-history-freeze ${raw(p.frozen ? "" : "checked")} />
        <i aria-hidden="true"></i>
        <span class="sr-only">Keep updating</span>
      </label>
    </div>
    ${raw(rows || html`<p class="pillar-history__empty muted">Nothing has happened to this pillar yet.</p>`)}
    ${raw(
      more > 0
        ? html`<p class="pillar-history__more">
            Showing ${shown.length} of ${timeline.length} ·
            <button type="button" class="ap-link pillar-history__more-btn" data-history-more>Load more</button>
          </p>`
        : "",
    )}`;
}

export function init() {
  injectOnce();
}

export function open({ pillarId } = {}) {
  injectOnce();
  const p = getPillarById(pillarId);
  if (!p) return;
  requestOpen(MODAL_ID, close);

  // The newest entry opens with the dialog: the reader came for the last change,
  // and an all-collapsed list makes them click to find out what they were told
  // about on the page they came from.
  const timeline = getPillarTimeline(pillarId);
  const first = timeline[0];
  const firstKey = first ? (first.type === "update" ? `w${first.bucket}` : first.source?.id) : null;
  state = { pillarId, open: new Set(firstKey ? [firstKey] : []), shown: PAGE };

  paint();
  // The freeze switch writes to the store, and so does anything else on the page
  // while this is open — repaint rather than hold a snapshot.
  unsubscribe = subscribe(() => {
    if (!modal.hidden) paint();
  });

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  modal.focus?.();
}

export function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  notifyClose(MODAL_ID);
}
