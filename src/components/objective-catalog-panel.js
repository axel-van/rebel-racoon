// ---- The metric catalogue (handoff screen 2c) --------------------------------
//
// Archie's own catalogue, exposed to the user: every metric on screen, grouped
// by family, the not-yet-available ones greyed with the proxy Archie would use
// instead — the same rule for him and for the user. ONE question, one answer:
// WHICH metric. Clicking one adds it.
//
// ⚠️ It used to be two screens. A CONFIGURATOR (screen 2d) came after the
// pick — scope, then a live baseline, then Archie's suggested target, then a
// per-measure window — and the objective modal's pencil re-opened this whole
// flow to "change" an existing measure. Both are gone: everything that
// configurator asked is on the measure's own card in the modal (the scope as a
// select, the target as its input, the window as a chip pair), which is where
// the measure is READ and therefore where it is adjusted. What is left here is
// a picker, and a picker has one view.
//
// `createCatalogFlow()` returns a render/dispatch controller the objective
// modal EMBEDS (the panel is a view of that dialog, the design's own "the panel
// slides"); `open()` wraps the same flow in a standalone body-level dialog.

import { escapeHtml as esc } from "../utils.js?v=1222";
import { getConnectedProfiles } from "../social-profiles.js?v=1222";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1222";
import { getContextById } from "../contexts-store.js?v=1222";
import { catalogEntries } from "../objective-measures.js?v=1222";

let flowSeq = 0;

// ── The shared flow ──────────────────────────────────────────────────────────
// One view. All interactions are click-driven except the search input (the host
// wires input events to handleInput).
export function createCatalogFlow({ contextId, taken = [], onAdd, onBack, requestRender }) {
  flowSeq += 1;
  const state = { query: "" };

  // ── Adding in ONE step ────────────────────────────────────────────────
  //
  // Picking a metric ADDS it, with a scope and Archie's suggested target
  // already resolved — no configurator screen in between.
  //
  // ⚠️ That step used to be mandatory, and it asked three things the objective
  // form asks again forty pixels later: the target (the card's own `from → to`
  // fields), the scope (printed under the measure's name, and the pencil
  // changes it) and a per-measure window override (an edge case, still on the
  // pencil's path). Three screens to add one measure, two of them re-stating
  // each other. The form is where a measure is READ, so it is where it should
  // be adjusted; the catalogue's job is to answer WHICH metric.
  //
  // The 900ms "computing from your profiles…" beat goes with it: the baseline
  // and the proposal are synchronous functions (objective-measures.js), and the
  // wait was staged, not real.
  //
  // The default scope is the PLAYBOOK's own network — the profile the fiche is
  // tied to — and every profile on it. A Playbook that names no profile gets NO
  // scope, which the model reads as every network (`scope?.network` guards every
  // read of it) and the card prints as "all networks".
  //
  // ⚠️ Not `getConnectedProfiles()[0]`, which is what the configurator opened
  // on: it handed you Facebook for a LinkedIn brand. An arbitrary answer is
  // fine while a screen asks you to confirm it, and a silent wrong one the
  // moment nothing does — so the default is either MEANINGFUL (the Playbook's
  // own profile) or WIDE (everything), never a coin toss between six networks.
  function defaultScope() {
    const ctx = getContextById(contextId);
    const pinned = ctx?.selectedProfileId ? getConnectedProfiles().find((p) => p.id === ctx.selectedProfileId) : null;
    return pinned?.platform ? { network: pinned.platform } : undefined;
  }

  // The measure lands with its SCOPE and nothing else: `computing` says Archie
  // has not answered yet, and the host settles it (objective-modal.js
  // § the measure settles). Deliberately not pre-computed here — the card's own
  // loader IS the beat, so the values must arrive when the beat ends, not
  // before.
  function addNow(metricId) {
    onAdd({
      id: `m-${flowSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      metricId,
      scope: defaultScope(),
      computing: true,
    });
  }

  // ── Views ──────────────────────────────────────────────────────────────

  // ── The catalogue: EVERYTHING VISIBLE, in two columns ─────────────────
  //
  // ⚠️ It was eight collapsed accordion CARDS, one per family, each with a count
  // and a chevron — and that was the design's own stated intent ("the catalog
  // opens as a short stack of ~8 family headers, not a wall of metrics").
  // Wrong: the whole catalogue is EIGHTEEN metrics. Collapsing 18 items behind 8
  // doors spends 450px of chrome to hide 18 words, and nobody opens eight doors
  // to find out what is behind them — a picker whose items are invisible until
  // you guess which family holds them is a picker you search or abandon.
  //
  // So: two columns of family blocks, every metric on screen, no accordion. The
  // families become quiet 12px eyebrows and the METRICS carry the weight, which
  // is the right way round — they are what the reader picks. `columns: 2` with
  // `break-inside: avoid` keeps a family whole in one column.
  //
  // WHAT WAS DROPPED, because it was said two and three times over:
  //   • the TYPE tag on every row (`Volume` twelve times, `Counter`, `Rate`).
  //     It does not change which metric you want — it changes how the target is
  //     written, which the next step SHOWS with a live figure, and the dialog's
  //     own subtitle names it there ("Followers net growth · Counter").
  //   • the green `Adds up` tag. Same thing: it only matters once a scope is on
  //     screen, and the config step's caption says it in a sentence.
  //   • the per-family COUNT. It stood in for the rows it hid; the rows are
  //     there now.
  function renderCatalog() {
    const q = state.query.trim().toLowerCase();
    const fams = catalogEntries()
      .map((family) => {
        const metrics = family.metrics.filter((m) => !q || m.label.toLowerCase().includes(q));
        if (!metrics.length) return "";
        const rows = metrics
          .map((m) => {
            // ⚠️ Already on the objective — a REAL disabled list item, not a
            // muted div: same geometry and same left edge as the rows around
            // it, `disabled` so assistive tech announces it as unavailable and
            // the tab order skips it, and grey-60 ink (the house's reserved
            // disabled step) so it reads as out of play at a glance rather than
            // as one more pickable metric one grey step darker. Adding is one click now (§ adding in one step), so
            // nothing stands between a double-click and two identical measures;
            // it took the configurator's three screens to make that unlikely
            // before, never impossible.
            if (taken.includes(m.id)) {
              return `
                <button type="button" class="ap-list-panel-item objc__row objc__row--off" disabled>
                  <span class="ap-list-panel-item-text">
                    <span class="objc__row-name">${esc(m.label)}</span>
                    <span class="objc__soonwhy">Already measured</span>
                  </span>
                </button>`;
            }
            if (!m.available) {
              // A real metric the platform cannot serve yet: the name greyed, the
              // reason under it, and the proxy Archie would use instead as the
              // only control — so the row is honest about being unpickable
              // without being a dead end.
              return `
                <div class="ap-list-panel-item objc__row objc__row--off">
                  <span class="ap-list-panel-item-text">
                    <span class="objc__row-name">${esc(m.label)}</span>
                    <span class="objc__soonwhy">Needs Google Analytics ·
                      <button type="button" class="ap-link standalone small" data-objc-proxy-pick="${m.proxyId}">use ${esc(m.proxyLabel || "the proxy")}</button>
                    </span>
                  </span>
                </div>`;
            }
            // No trailing chevron: sixteen of them sat 150px to the right of
            // their own names, a second column of glyphs with nothing between.
            // `.ap-list-panel-item` already ships the hover (blue-10) that says
            // the row is a control, and every row in a picker is one.
            return `
              <button type="button" class="ap-list-panel-item objc__row" data-objc-pick="${m.id}">
                <span class="objc__row-name">${esc(m.label)}</span>
              </button>`;
          })
          .join("");
        return `
          <section class="objc__fam">
            <h4 class="objc__famname">
              <i class="${esc(family.familyIcon || "ap-icon-chart-screen")}" aria-hidden="true"></i>${esc(family.familyLabel)}
            </h4>
            <div class="objc__famrows">${rows}</div>
          </section>`;
      })
      .join("");
    return `
      <div class="objc__search">
        <div class="ap-input-group">
          <i class="ap-icon-search" aria-hidden="true"></i>
          <input type="text" data-objc-search value="${esc(state.query)}" placeholder="Search the metric catalog…" aria-label="Search the metric catalog" />
        </div>
      </div>
      <div class="objc__cols">${fams || `<p class="objc__empty">Nothing in the catalog matches "${esc(state.query)}".</p>`}</div>`;
  }

  // The dialog's own footer holds the actions. The catalogue's only verb is the
  // way out: picking a metric ADDS it and closes this view, so there is nothing
  // to confirm. (It once had a second view with its own footer growing inside
  // the scroll area, which left the real .ap-dialog-footer rendering as an
  // empty bordered band under it.)
  function renderFooter() {
    return {
      left: "",
      right: `<button type="button" class="ap-button ghost grey" data-objc-cancel><span>Cancel</span></button>`,
    };
  }

  return {
    state,
    render: renderCatalog,
    renderFooter,
    // Returns true when the event was consumed by the flow.
    handleClick(event) {
      const pick = event.target.closest("[data-objc-pick]");
      if (pick) {
        addNow(pick.dataset.objcPick);
        return true;
      }
      // The proxy link inside an unavailable row: it adds the metric Archie
      // would read instead, so it is the same one-click add.
      const proxyPick = event.target.closest("[data-objc-proxy-pick]");
      if (proxyPick) {
        addNow(proxyPick.dataset.objcProxyPick);
        return true;
      }
      if (event.target.closest("[data-objc-cancel]")) {
        onBack?.();
        return true;
      }
      return false;
    },
    handleInput(event) {
      const search = event.target.closest("[data-objc-search]");
      if (!search) return false;
      state.query = search.value;
      requestRender({ preserveSearch: true });
      return true;
    },
    // Kept as part of the controller's contract — there is no timer to clear
    // since the 900ms "computing from your profiles…" beat went with the
    // configurator (the values are synchronous; the card's own loader is the
    // beat now, objective-modal.js § the measure settles).
    dispose() {},
  };
}

// ── Standalone wrapper (Playbook block edit mode) ────────────────────────────

const MODAL_ID = "objectiveCatalog";

let backdrop = null;
let panel = null;
let bodyEl = null;
let titleEl = null;
let subEl = null;
let footLeftEl = null;
let footRightEl = null;
let initialized = false;
let flow = null;
let onDone = null;

const SHELL = `
<div class="app-modal-backdrop objc__backdrop" id="objcBackdrop" hidden>
  <aside class="ap-dialog objc" id="objcModal" role="dialog" aria-modal="true" aria-label="Metric catalog" tabindex="-1">
    <div class="ap-dialog-header">
      <span class="ap-dialog-title" id="objcTitle">Add a measure</span>
      <span class="ap-dialog-subtitle" id="objcSub" hidden></span>
    </div>
    <button type="button" class="ap-dialog-close" data-objc-close aria-label="Close"><i class="ap-icon-close"></i></button>
    <div class="ap-dialog-content objc__content"></div>
    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-left" id="objcFootLeft"></div>
      <div class="ap-dialog-footer-right" id="objcFootRight"></div>
    </div>
  </aside>
</div>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  backdrop = document.getElementById("objcBackdrop");
  panel = document.getElementById("objcModal");
  bodyEl = panel.querySelector(".objc__content");
  titleEl = document.getElementById("objcTitle");
  subEl = document.getElementById("objcSub");
  footLeftEl = document.getElementById("objcFootLeft");
  footRightEl = document.getElementById("objcFootRight");

  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-objc-close]")) {
      close();
      return;
    }
    flow?.handleClick(e);
  });
  panel.addEventListener("input", (e) => flow?.handleInput(e));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop && !backdrop.hidden) close();
  });
  window.addEventListener("hashchange", close);
  initialized = true;
}

// Typing re-renders, so the field being typed in has to be re-focused at the
// same caret.
export function searchSelectorFor(opts = {}) {
  return opts.preserveSearch ? "[data-objc-search]" : null;
}

function paint(opts = {}) {
  if (!flow) return;
  paintChrome();
  const sel = searchSelectorFor(opts);
  if (sel) {
    const el = bodyEl.querySelector(sel);
    const pos = el ? el.selectionStart : null;
    bodyEl.innerHTML = flow.render();
    const next = bodyEl.querySelector(sel);
    if (next && pos != null) {
      next.focus();
      next.setSelectionRange(pos, pos);
    }
    return;
  }
  bodyEl.innerHTML = flow.render();
}

function paintChrome() {
  subEl.hidden = true;
  const foot = flow.renderFooter();
  footLeftEl.innerHTML = foot.left;
  footRightEl.innerHTML = foot.right;
}

export function open({ contextId, onAdd }) {
  init();
  requestOpen(MODAL_ID, close);
  onDone = onAdd;
  flow = createCatalogFlow({
    contextId,
    onAdd: (entry) => {
      const cb = onDone;
      close();
      cb?.(entry);
    },
    onBack: close,
    requestRender: paint,
  });
  titleEl.textContent = "Add a measure";
  paint();
  backdrop.hidden = false;
  panel.focus?.();
}

export function close() {
  if (!backdrop || backdrop.hidden) return;
  flow?.dispose();
  flow = null;
  onDone = null;
  backdrop.hidden = true;
  bodyEl.innerHTML = "";
  footLeftEl.innerHTML = "";
  footRightEl.innerHTML = "";
  subEl.hidden = true;
  notifyClose(MODAL_ID);
}
