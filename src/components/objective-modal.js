// The objective modal (handoff screen 1e) — an objective reads as a SENTENCE:
// "Grow [name] over a [window]", then MEASURED BY, each measure a compact card
// (metric · from X to Y · on which networks) whose target input matches the
// metric's type — a volume runs from→to with Archie's suggestion marked, a
// rate holds a bar ("hold above 3.5%"). Adding a measure slides this same
// dialog into the metric catalogue (objective-catalog-panel's shared flow).
// The status inset says the one thing worth saying: the verdict derives from
// the measures, nothing to configure.
//
// One modal, two modes:
//   create — a STAGED draft: nothing touches the Playbook until "Create
//            objective", which writes the label + its override ({measures,
//            window, grace day 1 of 7, origin:"user"}) and notifies. Naming
//            the objective resolves it live: a name that couples pre-fills
//            Archie's suggested measures, a name that doesn't reads as coming
//            soon. From Insights the sentence gains "for [Playbook]" — the
//            design assumes the playbook is known; documented deviation.
//   adjust — the same staged form seeded from an EXISTING objective; "Save
//            changes" applies rename + measures + window in one write.
//
// Replaces objective-editor-modal (the field-stack editor): the sentence form
// is the editor now. Body-level, modal-coordinator, closes on route change.

import { escapeHtml as esc } from "../utils.js?v=1170";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1170";
import { getContexts } from "../contexts-store.js?v=1170";
import { getActivePlaybookId } from "../active-playbook.js?v=1170";
import { createCatalogFlow, searchSelectorFor } from "./objective-catalog-panel.js?v=1170";
import {
  resolveObjectives,
  materializeMeasureEntries,
  metricLabel,
  isRateMetric,
  scopedBaselineFor,
  scopeLabel,
  proposeTargetFrom,
  WINDOWS,
} from "../objective-measures.js?v=1170";

const MODAL_ID = "objectiveModal";

let backdrop = null;
let panel = null;
let bodyEl = null;
let footEl = null;
let footLeftEl = null;
let titleEl = null;
let subEl = null;
let initialized = false;
let idSeq = 0;

// The staged draft — nothing below writes to the Playbook until Create/Save.
let draft = null; // { mode, data, contextId, originalLabel, name, window, measures[], onChange }
let catalogFlow = null; // the embedded 2c/2d flow, when open
// Measures waiting on Archie — one timer per card, cleared on close so a
// dialog that goes away never repaints over a dead draft.
const settling = new Map();
let catalogEditIndex = null; // the measure being re-picked (null = adding a new one)

const SHELL = `
<div class="app-modal-backdrop objm__backdrop" id="objmBackdrop" hidden>
  <aside class="ap-dialog objm" id="objmModal" role="dialog" aria-modal="true" aria-label="Objective" tabindex="-1">
    <div class="ap-dialog-header">
      <span class="ap-dialog-title" id="objmTitle">New objective</span>
      <span class="ap-dialog-subtitle" id="objmSub" hidden></span>
    </div>
    <button type="button" class="ap-dialog-close" data-objm-close aria-label="Close"><i class="ap-icon-close"></i></button>
    <div class="ap-dialog-content objm__content"></div>
    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left" id="objmFootLeft"></div>
      <div class="ap-dialog-footer-right" id="objmFoot"></div>
    </div>
  </aside>
</div>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  backdrop = document.getElementById("objmBackdrop");
  panel = document.getElementById("objmModal");
  bodyEl = panel.querySelector(".objm__content");
  footEl = document.getElementById("objmFoot");
  footLeftEl = document.getElementById("objmFootLeft");
  titleEl = document.getElementById("objmTitle");
  subEl = document.getElementById("objmSub");

  panel.addEventListener("click", onClick);
  panel.addEventListener("input", onInput);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop && !backdrop.hidden) close();
  });
  window.addEventListener("hashchange", close);
  initialized = true;
}

function genId() {
  idSeq += 1;
  return `m-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// data: the live Playbook/draft object (null in create-from-Insights until a
// playbook is picked). label: the objective to adjust (adjust mode only).
export function open({ data = null, label = null, mode = "adjust", contextId = null, onChange = null } = {}) {
  init();
  requestOpen(MODAL_ID, close);
  // The scope comes from the surface, never from a control in here (§ renderForm).
  // The fallback is the same function Insights itself reads, so the two can
  // never resolve to different Playbooks.
  const ctxId = contextId ?? data?.id ?? getActivePlaybookId();
  draft = {
    mode,
    data,
    contextId: ctxId,
    originalLabel: label,
    name: label || "",
    window: { type: "rolling" },
    measures: [],
    onChange,
  };
  if (mode === "adjust" && data && label) {
    const override = data.objectiveMeasures?.[label] || {};
    draft.window = override.window ? { ...override.window } : { type: "rolling" };
    draft.measures = materializeMeasureEntries(label, override).map((e) => ({ ...e }));
    const resolved = resolveObjectives([label], ctxId, data.objectiveMeasures)[0];
    if (!draft.measures.length && resolved?.status === "parked") {
      // A parked objective adjusts its proxy as its one measure.
      draft.measures = [{ id: "proxy", metricId: resolved.proxy.metricId, target: resolved.proxy.target }];
    }
    // Entries are sparse — a target the user never touched lives only in the
    // resolution. Hydrate it so the form shows the standing suggestion (the
    // ARCHIE SUGGESTED badge marks exactly these).
    const resolvedMeasures = resolved?.status === "measured" ? resolved.measures : [];
    draft.measures.forEach((entry) => {
      if (entry.target != null) {
        entry.targetEdited = true;
        return;
      }
      const match = resolvedMeasures.find((m) => m.id === (entry.id || entry.metricId));
      entry.target = match?.target || entry.target;
    });
  }
  catalogFlow = null;
  titleEl.textContent = mode === "create" ? "New objective" : "Adjust objective";
  paint();
  backdrop.hidden = false;
  panel.focus?.();
}

export function close() {
  if (!backdrop || backdrop.hidden) return;
  clearSettling();
  catalogFlow?.dispose();
  catalogFlow = null;
  catalogEditIndex = null;
  draft = null;
  backdrop.hidden = true;
  bodyEl.innerHTML = "";
  footEl.innerHTML = "";
  footLeftEl.innerHTML = "";
  setSubtitle("");
  notifyClose(MODAL_ID);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function paint(opts = {}) {
  if (!draft) return;
  // Only the metric CATALOGUE scrolls — see `.objm__content--scroll`. Every
  // other view holds a floating DS dropdown that a scroll box would clip.
  bodyEl.classList.toggle("objm__content--scroll", !!catalogFlow && catalogFlow.state.view === "catalog");
  if (catalogFlow) {
    const sel = searchSelectorFor(opts);
    if (sel) {
      const el = bodyEl.querySelector(sel);
      const pos = el ? el.selectionStart : null;
      bodyEl.innerHTML = catalogFlow.render();
      const next = bodyEl.querySelector(sel);
      if (next && pos != null) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    } else {
      bodyEl.innerHTML = catalogFlow.render();
    }
    const foot = catalogFlow.renderFooter();
    footLeftEl.innerHTML = foot.left;
    footEl.innerHTML = foot.right;
    titleEl.textContent = catalogEditIndex != null ? "Change measure" : "Add a measure";
    setSubtitle(catalogFlow.subtitle());
    return;
  }
  const nameInput = bodyEl.querySelector("[data-objm-name]");
  if (nameInput) draft.name = nameInput.value;
  titleEl.textContent = draft.mode === "create" ? "New objective" : "Adjust objective";
  setSubtitle("");
  bodyEl.innerHTML = renderForm();
  footLeftEl.innerHTML = "";
  footEl.innerHTML = `
    <button type="button" class="ap-button ghost grey" data-objm-close><span>Cancel</span></button>
    <button type="button" class="ap-button primary orange" data-objm-save${canSave() ? "" : " disabled"}>
      <span>${draft.mode === "create" ? "Create objective" : "Save changes"}</span>
    </button>`;
}

function setSubtitle(text) {
  subEl.textContent = text;
  subEl.hidden = !text;
}

function canSave() {
  // Not while a measure is still settling: a target that hasn't landed would be
  // written as empty, and the button would have committed a half-read measure.
  return (
    !!draft.name.trim() && !!draft.contextId && draft.measures.length > 0 && !draft.measures.some((m) => m.computing)
  );
}

// ⚠️ NO `for <Playbook>` CLAUSE. An objective is created in the Playbook the
// surface that opened this dialog is scoped to — `/insights` reads ONE Playbook
// and names it permanently (the rail's switcher in workspace mode, the page's
// own heading otherwise), and the shell passes that id in. Asking again is the
// fault this repo keeps removing: a control restating the scope the chrome
// already prints is a control the reader has to rule out, and two places that
// can answer "which Playbook" are two answers that can disagree. Same reason
// the composer's, the feed's, the batch's, the clip's and the repurpose board's
// own Playbook selects are gone (CLAUDE.md § The Playbook scope).
//
// The modal is not left guessing: `open()` falls back to the active Playbook,
// so a caller that passes nothing still produces a saveable draft.
function renderForm() {
  const hasMeasures = draft.measures.length > 0;
  // The sentence, on a two-column GRID: `Grow` and `over a` in the first
  // column, their controls in the second, so both rows start on the same two
  // x's whatever they hold. The window's row carries its select and — only
  // when the window has one — its date (§ the sentence, in the stylesheet, for
  // why the shape must not depend on the content).
  return `
    <div class="objm__sentence">
      <span class="objm__titleword">Grow</span>
      <div class="ap-input-group objm__name">
        <input type="text" data-objm-name value="${esc(draft.name)}" placeholder="what this objective grows…" aria-label="Objective name" />
      </div>
      <span class="objm__word">over a</span>
      <div class="objm__windowrow">
        ${renderInlineSelect({
          value: draft.window.type,
          options: WINDOWS.map((w) => ({ value: w.id, label: w.label.toLowerCase() })),
          attr: "data-objm-window",
        })}
        ${
          // ⚠️ The date belongs to the CLAUSE, not to a block of its own. It was
          // an `.ap-form-field` with its own "Ends on" label, stacked under the
          // sentence — a second form language beside a sentence that had just
          // announced the same thing, at a left edge that lined up with nothing
          // else. Inside the clause it finishes the line the select starts
          // ("over a window ending on 17/09/2026") and wraps with it rather
          // than away from it. Native date input: documented deviation from
          // `.ap-datepicker`, which the CSS-UI layer doesn't ship.
          draft.window.type === "fixed"
            ? `<div class="ap-input-group objm__date"><input type="date" data-objm-date value="${esc(draft.window.date || "")}" aria-label="Ends on" /></div>`
            : ""
        }
      </div>
    </div>
    <div class="objm__section">
      <span class="objm__seclabel">Measured by${hasMeasures ? ` <span class="ap-counter normal grey">${draft.measures.length}</span>` : ""}</span>
      ${
        // ⚠️ ONE CONTROL, in both states: the DS button. The empty state used to
        // be a hand-built DASHED CARD with a bold title and a hint line — a
        // component ADS does not ship, and one that looked like a radio card
        // and a button without being either. (The app's dashed box means "you
        // can drop a file here"; nothing can be dropped on this one.) So the
        // action is `.ap-button stroked blue`, the same control the filled
        // state already used, at the same weight in both — a single action
        // should not change treatment because a list above it is empty.
        //
        // ⚠️ The caption is EMPTY-STATE ONLY. "Its status … is read from these
        // measures" teaches what a measure is FOR, which is what a reader with
        // none needs; over a list of two it is two lines of 12px restating what
        // the list already demonstrates. Teaching copy belongs where the thing
        // is missing.
        hasMeasures
          ? ""
          : `<p class="objm__caption">Its status — on track, watch, or at risk — is read from these measures. Nothing else to set.</p>`
      }
      ${hasMeasures ? `<div class="objm__measures">${draft.measures.map((entry, i) => renderMeasureCard(entry, i)).join("")}</div>` : ""}
      <div class="objm__addrow">
        <button type="button" class="ap-button stroked blue" data-objm-add-measure>
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add a measure</span>
        </button>
      </div>
    </div>`;
}

function renderInlineSelect({ value, options, attr, placeholder = "" }) {
  const selected = options.find((o) => o.value === value);
  return `
    <details class="ap-select objm__select" data-objm-select>
      <summary class="ap-select-trigger">
        <span class="ap-select-value${selected ? "" : " ap-select-placeholder"}">${esc(selected ? selected.label : placeholder)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox">
        <div class="ap-select-options">
          ${options
            .map(
              (o) => `
              <div class="ap-select-option${o.value === value ? " selected" : ""}" ${attr}="${esc(o.value)}" role="option" aria-selected="${o.value === value}">
                <span class="ap-select-option-text">${esc(o.label)}</span>
                ${o.value === value ? `<i class="ap-icon-check" aria-hidden="true"></i>` : ""}
              </div>`,
            )
            .join("")}
        </div>
      </div>
    </details>`;
}

// One measure, on ONE row: the identity, the two figures, the verbs.
//
// ⚠️ It was two rows — identity + fields, then a derived line under the fields —
// at 86px a card. Three things were wrong and they were the same thing: the
// supporting text was SCATTERED. The scope sat under the name, the suggestion
// under the fields, and between them ran a hundred and seventy pixels of
// nothing. Both are 12px grey supporting text about the same measure, so they
// are now ONE line under the name, where the eye already is:
//
//     Brand mentions                 [48] → [60]        ✎ ✕
//     all networks · Suggested +25% · +1/day
//
// 86px → 60px, one orphan line fewer, and the fields still land on the same x
// from card to card (the grid's `auto` columns).
//
// `from`/`to` became the ARROW the rest of the app already uses for
// current→target — the index card's `14,800 → 20,000`, the fiche's table.
// Two grey words at 12px next to two 14px values were fussier than the glyph
// that means exactly that, and they cost 60px of the row.
//
// Hierarchy, top to bottom: the name (14 bold navy, the only bold thing in the
// card) → the values (14 regular, the only bordered things) → one grey line
// with one orange word in it. Three levels, one accent — and it survives the
// grayscale test, since nothing but the name is heavy.
//
// The metric TYPE isn't shown: it is 1:1 with the name (a Reach is always a
// volume) and the `→` vs `hold above` shape already says which.
function renderMeasureCard(entry, i) {
  const rate = isRateMetric(entry.metricId);
  const computing = !!entry.computing;
  // The baseline is suggested from the catalogue but editable — the current
  // value is the user's to correct.
  const baseline = entry.baseline ?? scopedBaselineFor(entry.metricId, draft.contextId, entry.scope);
  const target = entry.target || "";
  const suggestedPct = pctDelta(baseline, target);
  const scopeText = entry.scope?.network ? scopeLabel(entry.scope) : "all networks";
  const name = metricLabel(entry.metricId);
  // While it computes, the SAME fields render empty and disabled: same
  // geometry throughout, so the card fills rather than jumping, and the empty
  // boxes say where the numbers are about to land.
  const field = (kind, value, label) =>
    `<div class="ap-input-group objm__${kind}"><input type="text" data-objm-${kind === "from" ? "baseline" : "target"} data-objm-i="${i}" value="${computing ? "" : esc(value)}" aria-label="${label}"${computing ? " disabled" : ""} /></div>`;
  // A rate has no from→to: its target is a bar to hold, so the words stay
  // there — `45% → 38%` would read as a drop, which is the opposite of what a
  // floor means.
  const body = rate
    ? `
      <span class="objm__word">hold above</span>
      ${field("target", target, "Target")}
      <span class="objm__word">now at</span>
      ${field("from", baseline, "Current value")}`
    : `
      ${field("from", baseline, "Current value")}
      <span class="objm__arrow" aria-hidden="true">→</span>
      ${field("target", target, "Target")}`;

  // The supporting line: the scope, then what the target is worth. `Suggested`
  // marks a target Archie proposed and the reader hasn't touched — orange
  // because that is this app's mark for the AI's own work, as INK and never a
  // filled tag (a pill here outranked the metric's name).
  const showSuggested = !rate && !(entry.target == null && target === "") && !entry.targetEdited;
  const deltas = [];
  if (!rate && suggestedPct != null) deltas.push(`+${suggestedPct}%`);
  const pd = rate ? "" : perDay(baseline, target);
  if (pd) deltas.push(pd);
  const meta = computing
    ? `<span class="ap-loader blue size-16" aria-hidden="true"><svg><circle></circle><circle></circle></svg></span>
       <span>Reading your last 30 days…</span>`
    : [
        `<span>${esc(scopeText)}</span>`,
        showSuggested ? `<span class="objm__suggested">Suggested</span>` : "",
        deltas.length ? `<span class="objm__hinttext">${deltas.join(" · ")}</span>` : "",
      ]
        .filter(Boolean)
        .join(`<span class="objm__metadot" aria-hidden="true">·</span>`);

  return `
    <div class="objm__card${entry.fresh ? " objm__card--fresh" : ""}">
      <div class="objm__id">
        <span class="objm__cardname">${esc(name)}</span>
        <p class="objm__meta${computing ? " objm__meta--computing" : ""}">${meta}</p>
      </div>
      <div class="objm__cardbody">${body}</div>
      <div class="objm__cardverbs">
        ${
          computing
            ? ""
            : `<button type="button" class="ap-icon-button transparent" data-objm-edit="${i}" aria-label="Change ${esc(name)} metric or scope"><i class="ap-icon-pen"></i></button>`
        }
        <button type="button" class="ap-icon-button transparent" data-objm-remove="${i}" aria-label="Remove ${esc(name)}"><i class="ap-icon-close"></i></button>
      </div>
    </div>`;
}

function parseNum(str) {
  if (typeof str !== "string") return null;
  const cleaned = str.replace(/[€$,+\s]/g, "").replace(/%$/, "");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

function pctDelta(baseline, target) {
  const b = parseNum(baseline);
  const t = parseNum(target);
  if (b == null || t == null || b === 0) return null;
  return Math.round(((t - b) / b) * 100);
}

function perDay(baseline, target) {
  const b = parseNum(baseline);
  const t = parseNum(target);
  if (b == null || t == null || t <= b) return "";
  return `+${Math.max(1, Math.round((t - b) / 30)).toLocaleString("en-US")}/day`;
}

// ── Behavior ─────────────────────────────────────────────────────────────────

// A name that couples pre-fills Archie's suggested measures (targets marked
// suggested); a name that doesn't stays empty and will read coming-soon.
function seedFromName() {
  if (draft.mode !== "create" || draft.measures.length || !draft.name.trim()) return;
  const resolved = resolveObjectives([draft.name.trim()], draft.contextId)[0];
  if (resolved?.status === "measured") {
    draft.measures = resolved.measures.map((m) => ({ id: genId(), metricId: m.metricId, target: m.target }));
  } else if (resolved?.status === "parked") {
    draft.measures = [{ id: genId(), metricId: resolved.proxy.metricId, target: resolved.proxy.target }];
  }
}

// editIndex null → add a new measure; a number → re-pick metric + scope for that
// existing measure (the catalogue is the only place metric/scope are chosen, so
// "edit" is re-run it and replace in place). The inline target input stays.
function openCatalog(editIndex = null) {
  catalogEditIndex = editIndex;
  catalogFlow = createCatalogFlow({
    contextId: draft.contextId,
    targetLabel: draft.name.trim() || "this objective",
    confirmLabel: editIndex != null ? "Change measure" : "",
    // Adding is ONE step — pick a metric and it lands on the form, scope and
    // suggested target resolved (objective-catalog-panel.js § adding in one
    // step). Editing keeps the configurator: that is where a measure's scope
    // and its window override live.
    immediate: editIndex == null,
    // What this objective already measures — those rows are shown as taken.
    // The one being CHANGED is not: re-picking it is how you keep the metric
    // and re-do its scope.
    taken: draft.measures.filter((_, i) => i !== editIndex).map((e) => e.metricId),
    onAdd(entry) {
      catalogFlow?.dispose();
      catalogFlow = null;
      catalogEditIndex = null;
      if (editIndex != null && draft.measures[editIndex]) {
        const prev = draft.measures[editIndex];
        // Keep the row's id; swap metric + scope; keep the old target unless the
        // catalogue set a new one.
        draft.measures[editIndex] = {
          ...prev,
          metricId: entry.metricId,
          scope: entry.scope,
          target: entry.target ?? prev.target,
        };
      } else {
        draft.measures.push(entry);
      }
      startSettling(draft.measures[editIndex != null ? editIndex : draft.measures.length - 1]);
      paint();
    },
    onBack() {
      catalogFlow?.dispose();
      catalogFlow = null;
      catalogEditIndex = null;
      paint();
    },
    requestRender: (opts) => paint(opts),
  });
  paint();
}

// ── The measure settles ──────────────────────────────────────────────────
//
// A measure added from the catalogue arrives with its scope and NO target: the
// card shows its fields empty behind a loader while Archie "reads the window",
// then the baseline and the suggestion land in them.
//
// ⚠️ The beat is on the CARD, which is the whole point. It used to be a screen
// of its own — the configurator, with a spinner and "computing from your
// profiles…" — and when that screen went, the beat went with it. Wrong thing to
// drop: the wait is what says a number was WORKED OUT rather than typed in, and
// it belongs where the number lands. The values themselves are synchronous
// (objective-measures.js); the delay stands in for the round-trip a real
// integration would make.
const SETTLE_MS = 1400;
const FRESH_MS = 2000;

function settleMeasure(entryId) {
  settling.delete(entryId);
  if (!draft) return;
  const entry = draft.measures.find((e) => e.id === entryId);
  if (!entry || !entry.computing) return;
  const baseline = scopedBaselineFor(entry.metricId, draft.contextId, entry.scope);
  entry.target = proposeTargetFrom(entry.metricId, baseline, draft.contextId, entry.scope) || undefined;
  delete entry.computing;
  // And it says so for two seconds: the card that just landed wears the blue
  // until the eye has found it. A list of identical white cards gives a reader
  // arriving from a full-dialog catalogue nothing to land on — the answer to
  // "where did it go?" should not be "count them".
  entry.fresh = true;
  settling.set(
    `fresh:${entryId}`,
    window.setTimeout(() => {
      settling.delete(`fresh:${entryId}`);
      if (!draft) return;
      const e = draft.measures.find((m) => m.id === entryId);
      if (!e?.fresh) return;
      delete e.fresh;
      paint();
    }, FRESH_MS),
  );
  paint();
}

function startSettling(entry) {
  if (!entry?.computing || settling.has(entry.id)) return;
  settling.set(
    entry.id,
    window.setTimeout(() => settleMeasure(entry.id), SETTLE_MS),
  );
}

function clearSettling() {
  settling.forEach((t) => window.clearTimeout(t));
  settling.clear();
}

function save() {
  const name = draft.name.trim();
  if (!canSave()) return;
  const data = draft.data || getContexts().find((c) => c.id === draft.contextId);
  if (!data) return;
  if (!Array.isArray(data.objective)) data.objective = [];
  if (!data.objectiveMeasures || typeof data.objectiveMeasures !== "object") data.objectiveMeasures = {};
  const override = {
    measures: draft.measures.map((e) => ({ ...e })),
    window: { ...draft.window },
  };
  if (draft.mode === "create") {
    let finalName = name;
    let n = 2;
    while (data.objective.some((l) => l.toLowerCase() === finalName.toLowerCase())) finalName = `${name} ${n++}`;
    data.objective.push(finalName);
    // A fresh objective earns no verdict yet — it collects.
    override.grace = { day: 1, of: 7 };
    override.origin = "user";
    data.objectiveMeasures[finalName] = override;
  } else {
    const old = draft.originalLabel;
    const idx = data.objective.indexOf(old);
    const prev = data.objectiveMeasures[old] || {};
    if (idx >= 0 && name !== old) {
      data.objective[idx] = name;
      delete data.objectiveMeasures[old];
    }
    data.objectiveMeasures[name] = { ...prev, ...override };
  }
  const cb = draft.onChange;
  const savedCtxId = draft.contextId;
  close();
  cb?.(savedCtxId);
}

function onClick(event) {
  if (!draft) return;
  if (catalogFlow) {
    if (event.target.closest("[data-objm-close]")) {
      close();
      return;
    }
    catalogFlow.handleClick(event);
    return;
  }

  // One open dropdown at a time.
  const inSelect = event.target.closest("[data-objm-select]");
  bodyEl.querySelectorAll("[data-objm-select][open]").forEach((d) => {
    if (d !== inSelect) d.removeAttribute("open");
  });

  if (event.target.closest("[data-objm-close]")) {
    close();
    return;
  }
  if (event.target.closest("[data-objm-save]")) {
    save();
    return;
  }
  const win = event.target.closest("[data-objm-window]");
  if (win) {
    draft.window =
      win.dataset.objmWindow === "fixed" ? { type: "fixed", date: draft.window.date } : { type: "rolling" };
    paint();
    return;
  }
  const editM = event.target.closest("[data-objm-edit]");
  if (editM) {
    if (!draft.contextId) return;
    openCatalog(Number(editM.dataset.objmEdit));
    return;
  }
  const remove = event.target.closest("[data-objm-remove]");
  if (remove) {
    draft.measures.splice(Number(remove.dataset.objmRemove), 1);
    paint();
    return;
  }
  if (event.target.closest("[data-objm-add-measure]")) {
    if (!draft.contextId) return;
    openCatalog();
  }
}

function onInput(event) {
  if (!draft) return;
  if (catalogFlow) {
    catalogFlow.handleInput(event);
    return;
  }
  const t = event.target;
  if (t.matches("[data-objm-name]")) {
    draft.name = t.value;
    // The sentence resolves live: once the name lands (debounced to the next
    // blur-ish pause via change below would be late — seed on first coupling).
    if (!draft.measures.length && draft.contextId) {
      const before = draft.measures.length;
      seedFromName();
      if (draft.measures.length !== before) paint();
    }
    const saveBtn = footEl.querySelector("[data-objm-save]");
    if (saveBtn) saveBtn.toggleAttribute("disabled", !canSave());
    return;
  }
  if (t.matches("[data-objm-date]")) {
    draft.window = { type: "fixed", date: t.value };
    return;
  }
  if (t.matches("[data-objm-target]")) {
    const entry = draft.measures[Number(t.dataset.objmI)];
    if (entry) {
      entry.target = t.value;
      entry.targetEdited = true;
    }
    return;
  }
  if (t.matches("[data-objm-baseline]")) {
    const entry = draft.measures[Number(t.dataset.objmI)];
    // Don't re-render on keystroke (it would drop focus) — the derived hints
    // ("Archie suggested", "that's N/day") recompute on the next paint.
    if (entry) entry.baseline = t.value;
  }
}
