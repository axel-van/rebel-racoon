// Content Research modals — five dialogs behind one shell.
//
// The repo convention is one file per modal, and this deliberately deviates.
// These five share an identical shell (scrim, panel, header with ×, scrolling
// body, bordered footer) and differ only in body content and one footer action.
// Five files would have meant five copies of that shell, and the shell is
// exactly the part that drifts. They are also all lane-scoped and only ever
// opened from the two Content Research screens, so they have one call site each.
//
//   openNeedSource({ sourceId })      — a source that isn't live yet
//   openIgnoreReason({ briefId, onDone })
//   openExport({ count })
//   openAddToStrategy({ briefId, playbookId, onConfirm })
//   openFullResearch({ briefId })
//
// Public API mirrors every other modal here: init() once at boot, then open*().
// Overlay arbitration goes through modal-coordinator so only one is ever up, and
// so the source-feedback dialog can legitimately stack over the research form.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { findResearchSource, findReviewStatus } from "../research-catalog.js?v=14";
import {
  ageMinutes,
  getBriefById,
  getBriefsForLane,
  groupBriefsByAge,
  ignoreBrief,
  setStatus,
} from "../briefs-store.js?v=37";
import { getLanes } from "../research-store.js?v=30";
import {
  getContexts,
  getContextById,
  getPillars,
  getPillarById,
  pillarForTopic,
  pillarRoom,
  addPillarFromTopic,
  addTopicToPillar,
  PILLAR_LIMIT,
} from "../contexts-store.js?v=65";
import { renderBriefCard } from "./brief-card.js?v=34";
import { renderSocialPostCard } from "./social-post-card.js?v=20";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "research";

// The picker's "Trending, normally hidden" group — the counterpart to the feed's
// attention notice, and switched off with it. It surfaced ignored-but-trending
// topics that the picker's own ignored-exclusion would otherwise drop. One line
// to restore; pickerSplit and the group's render are both still below.
const SHOW_HIDDEN_TRENDING = false;

let backdrop, panel, titleEl, subEl, bodyEl, footEl;
let initialized = false;
let active = null; // { kind, ctx } — what's currently open
// Idea-picker state. Module-level because each step re-renders through openShell,
// which rebuilds the dialog — the step and the answer have to outlive that.
let pickerStep = "playbooks";
let pickerPlaybook = null; // one id; picking a card IS the navigation
// Add-to-strategy state. Same reason as the picker's: choosing create-vs-link
// re-renders the dialog through openShell, so the choice and the edited text have
// to live outside it. `text` is seeded once from the topic and then belongs to the
// user — re-seeding it on every render would wipe their trimming.
// Pillar-picker state — same reason the topic picker's lives here: each step
// re-renders through openShell, so the step and the answers have to outlive it.
let pillarStep = "playbooks"; // "playbooks" | "pillars" | "detail"
let pillarPbId = null;
let pillarPickedId = null;

let strategyMode = "create"; // "create" | "link"
let strategyPillarId = null;
let strategyTitle = "";
let strategyText = "";

const SHELL = `
<div class="app-modal-backdrop research-modal__backdrop" id="researchModalBackdrop" hidden></div>
<aside class="research-modal" id="researchModal" role="dialog" aria-modal="true" aria-labelledby="researchModalTitle" tabindex="-1" hidden>
  <header class="research-modal__head">
    <div class="research-modal__head-text">
      <h2 class="research-modal__title" id="researchModalTitle"></h2>
      <p class="research-modal__sub"></p>
    </div>
    <button type="button" class="ap-icon-button ghost grey" data-research-modal-close aria-label="Close">
      <i class="ap-icon-close" aria-hidden="true"></i>
    </button>
  </header>
  <div class="research-modal__body"></div>
  <footer class="research-modal__foot"></footer>
</aside>`;

export function init() {
  if (initialized) return;
  const host = document.createElement("div");
  host.innerHTML = SHELL;
  while (host.firstChild) document.body.appendChild(host.firstChild);

  backdrop = document.getElementById("researchModalBackdrop");
  panel = document.getElementById("researchModal");
  titleEl = panel.querySelector(".research-modal__title");
  subEl = panel.querySelector(".research-modal__sub");
  bodyEl = panel.querySelector(".research-modal__body");
  footEl = panel.querySelector(".research-modal__foot");

  // One delegated listener for every dialog's controls — the shell is shared, so
  // the wiring is too. Each branch reads `active` for its context.
  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("input", onPanelInput);
  // The Playbook step's cards are .contexts-card — an <article role="button">,
  // not a <button>, because that is the element /contexts styles. A real button
  // gets Enter and Space for free; role="button" does not, so they are wired
  // here exactly as contexts.js wires the same card on its own page.
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest?.('[data-idea-pb][role="button"]');
    if (!card) return;
    event.preventDefault();
    card.click();
  });
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  initialized = true;
}

function isOpen() {
  return !!panel && !panel.hidden;
}

function openShell(kind, ctx, { title, sub = "", body, foot, wide = false, size = "" }) {
  init();
  requestOpen(MODAL_ID, close);
  active = { kind, ctx };
  titleEl.textContent = title;
  subEl.textContent = sub;
  subEl.hidden = !sub;
  bodyEl.innerHTML = body;
  footEl.innerHTML = foot;
  panel.classList.toggle("research-modal--wide", wide);
  // One extra width, for the step whose content sets its own. See
  // .research-modal--topics in research-modals.css.
  panel.classList.toggle("research-modal--topics", size === "topics");
  backdrop.hidden = false;
  // The `open` class, not just [hidden], is what actually reveals the scrim —
  // .app-modal-backdrop is display:none until it lands. Every other modal in the
  // app does the same pair; dropping it left the dialog floating over an
  // undimmed page.
  backdrop.classList.add("open");
  panel.hidden = false;
  // Focus the panel so Esc lands and screen readers announce the dialog.
  panel.focus?.();
}

export function close() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  active = null;
  notifyClose(MODAL_ID);
}

// ─── 1. Need that source? ──────────────────────────────────────────────────

export function openNeedSource({ sourceId }) {
  const source = findResearchSource(sourceId);
  openShell(
    "need-source",
    { sourceId },
    {
      title: "Need that source?",
      sub: source ? source.name : "",
      body: html`<p class="research-modal__lede">
          This source isn't live yet. Tell me how you'd use it and the team will factor it into what we build next.
        </p>
        <textarea
          class="research-modal__textarea"
          rows="5"
          placeholder="How would you use this source?"
          data-need-text
        ></textarea>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Not now</span>
        </button>
        <button type="button" class="ap-button primary blue" data-need-send aria-disabled="true">
          <span>Send feedback</span>
        </button>`,
    },
  );
}

// ─── 2. Ignore reason ──────────────────────────────────────────────────────

export function openIgnoreReason({ briefId, onDone = null }) {
  openShell(
    "ignore",
    { briefId, onDone },
    {
      title: "Why did this topic miss the mark?",
      body: html`<textarea
          class="research-modal__textarea"
          rows="4"
          placeholder="Tell me what was off…"
          data-ignore-text
        ></textarea>
        <!-- The DS Infobox: the "info box" intent maps straight to it. The i
             element is an implicit child the CSS-UI layer styles directly. -->
        <div class="ap-infobox info research-modal__infobox">
          <i class="ap-icon-info" aria-hidden="true"></i>
          <div>
            This helps me tailor topics to your needs. I'll keep this topic out of your feed unless it trends well above
            its usual volume baseline — so you still catch real spikes without noise from recurring topics.
          </div>
        </div>
        <label class="research-modal__check">
          <input type="checkbox" class="ap-checkbox" data-ignore-mute />
          <span>Don't show this again</span>
        </label>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-ignore-submit>
          <span>Submit &amp; ignore</span>
        </button>`,
    },
  );
}

// ─── 3. Export ─────────────────────────────────────────────────────────────

export function openExport({ count }) {
  openShell(
    "export",
    { count },
    {
      title: "Export topics",
      body: html`<p class="research-modal__lede">
          Export all ${count} research ${count === 1 ? "card" : "cards"} currently in your feed.
        </p>
        <label class="research-modal__radio is-selected">
          <input type="radio" name="researchExportFormat" checked />
          <span class="research-modal__radio-text">
            <strong>CSV spreadsheet</strong>
            <span>One row per topic, with source and status.</span>
          </span>
        </label>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-export-go>
          <span>Export ${count} ${count === 1 ? "topic" : "topics"}</span>
        </button>`,
    },
  );
}

// ─── 4. Add to Content strategy ────────────────────────────────────────────

// What a pillar IS, stated once, at the moment the user is deciding to make one.
// A pillar is not a saved topic and the difference is not obvious, so the dialog
// says it rather than assuming it: a saved topic gets reused as it is, a pillar
// accumulates and gets refined as more topics feed into it.
const PILLAR_EXPLAINER =
  "Archie writes against your pillars: when a draft fits one, it adapts its " +
  "writing to what that pillar already knows. Filing a topic into an existing " +
  "pillar fleshes it out, so the next draft on that theme starts better informed " +
  "once the assets are ready.";

// The topic's own words, and only the topic's own words — headline into the name
// field, the full article into the details field. No generated summary, no
// invented framing: the user trims what they don't want, which they can only do
// if what is there is text they recognise.
function topicSeed(brief) {
  if (!brief) return { title: "", text: "" };
  const paras = Array.isArray(brief.research?.paragraphs) ? brief.research.paragraphs : [];
  return {
    title: brief.research?.title || brief.headline || "",
    text: paras.length ? paras.join("\n\n") : brief.summary || "",
  };
}

/**
 * Add a topic to a Playbook's content strategy — as a new pillar, or into one
 * that already exists.
 *
 * ── Why two paths and not one ───────────────────────────────────────────────
 * "Add to strategy" used to be a confirmation: it showed the topic's headline, then
 * dumped the Playbook's whole existing strategy underneath as context, and the
 * only button was Add. It never said what adding DID, and it could only ever make
 * the same undifferentiated thing. Both paths here are real and they produce
 * different objects: a new pillar is a commitment to a theme, filing into an
 * existing one is evidence that a theme already committed to is live.
 *
 * ── The Updated case opens pre-decided ──────────────────────────────────────
 * If this topic already feeds a pillar, the dialog opens in `link` mode on THAT
 * pillar with only `whatChanged` seeded. An updated topic is not a new
 * commitment; it is news about one already made, and asking the user to re-pick
 * the pillar they already picked is asking them to remember for the app.
 */

// ─── Pillar picker — "Post about a Content Pillar" ──────────────────────────
//
// Three steps: which Playbook → which pillar → read it, then use it. The topic
// picker next door is two, and the third step here is the difference that
// matters: a topic is a claim you can judge from its headline, while a pillar is
// a standing instruction whose whole value is the accumulated detail. Picking one
// blind would be picking a title.
//
// Each step reuses the card that object already has elsewhere — .contexts-card
// for a Playbook, .recap__pillar for a pillar — for the reason the topic picker
// does: the thing you pick should look like the thing you were reading a moment
// ago. Nothing new was drawn for either.
export function openPillarPicker({ onPick }) {
  pillarStep = "playbooks";
  pillarPbId = null;
  pillarPickedId = null;
  renderPillarPicker({ onPick });
}

function renderPillarPicker(ctx) {
  if (pillarStep === "playbooks") return renderPillarPbStep(ctx);
  if (pillarStep === "pillars") return renderPillarListStep(ctx);
  return renderPillarDetailStep(ctx);
}

/** Only Playbooks that actually own a pillar — the rest can only empty step 2. */
function pillarPbOptions() {
  return getContexts().filter((c) => getPillars(c.id).length > 0);
}

function renderPillarPbStep(ctx) {
  const options = pillarPbOptions();
  openShell("pillar-picker", ctx, {
    title: "Post about a content pillar",
    sub: "Which Playbook's strategy do you want to write from?",
    wide: true,
    body: options.length
      ? html`<div class="research-pick__pbgrid">
          ${raw(
            options
              .map((o) => {
                const n = getPillars(o.id).length;
                const color = o.color || "orange";
                return html`<article
                  class="contexts-card contexts-card--${color}"
                  data-pillar-pb="${escapeAttr(o.id)}"
                  role="button"
                  tabindex="0"
                >
                  <span class="contexts-card__swatch" aria-hidden="true"></span>
                  <header class="contexts-card__head">
                    <h3 class="contexts-card__name">${o.name}</h3>
                  </header>
                  <footer class="contexts-card__foot">
                    <span class="contexts-card__counter">${n} ${n === 1 ? "pillar" : "pillars"}</span>
                  </footer>
                </article>`;
              })
              .join(""),
          )}
        </div>`
      : html`<p class="muted">No Playbook has a content pillar yet. Add a topic to a strategy first.</p>`,
    foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
      <span>Cancel</span>
    </button>`,
  });
}

function renderPillarListStep(ctx) {
  const pb = getContextById(pillarPbId);
  const pillars = getPillars(pillarPbId);
  openShell("pillar-picker", ctx, {
    title: "Post about a content pillar",
    sub: pb ? pb.name : "",
    body: html`<div class="research-pick__pillars">
      ${raw(
        pillars
          .map((p) => {
            const srcN = p.sources.length;
            const assetN = p.assets.length;
            const meta = [
              srcN ? `${srcN} ${srcN === 1 ? "topic" : "topics"}` : "",
              assetN ? `${assetN} ${assetN === 1 ? "asset" : "assets"}` : "",
            ]
              .filter(Boolean)
              .join(" · ");
            return html`<div class="recap__pillar" data-pillar-pick="${escapeAttr(p.id)}" role="button" tabindex="0">
              <span class="recap__pillar-icon" aria-hidden="true"><i class="${p.icon || "ap-icon-target"}"></i></span>
              <span class="recap__pillar-body">
                <span class="recap__pillar-title">${p.title}</span>
                ${raw(p.description ? html`<span class="recap__pillar-desc">${p.description}</span>` : "")}
                ${raw(meta ? html`<span class="recap__pillar-meta">${meta}</span>` : "")}
              </span>
            </div>`;
          })
          .join(""),
      )}
    </div>`,
    foot: html`<button type="button" class="ap-button stroked grey" data-pillar-back>
        <span>Back</span>
      </button>
      <button type="button" class="ap-button stroked grey" data-research-modal-close>
        <span>Cancel</span>
      </button>`,
  });
}

// Step 3 renders the pillar READ-ONLY, in this shell rather than by reusing
// playbook-view's dialog. That dialog is wired to the Playbook screen's edit
// scope, snapshot and commit path; borrowing it here would drag all three into a
// picker whose only verb is "use this". Same content, no editing.
function renderPillarDetailStep(ctx) {
  const pb = getContextById(pillarPbId);
  const p = getPillarById(pillarPbId, pillarPickedId);
  if (!p) {
    pillarStep = "pillars";
    return renderPillarListStep(ctx);
  }
  openShell("pillar-picker", ctx, {
    title: p.title,
    sub: pb ? `${pb.name} · Content strategy` : "",
    body: html`<div class="research-pick__detail">
      <section class="research-article">
        <span class="research-article__label">Pillar Detail</span>
        ${raw(p.description ? html`<p>${p.description}</p>` : html`<p class="muted">Nothing written yet.</p>`)}
      </section>
      ${raw(
        p.notes
          ? html`<section class="research-article">
              <span class="research-article__label">Your notes</span>
              <p>${p.notes}</p>
            </section>`
          : "",
      )}
      ${raw(
        p.assets.length
          ? html`<section class="research-article">
              <span class="research-article__label">Reference assets</span>
              <ul class="recap__pilmodal-assets">
                ${raw(
                  p.assets
                    .map(
                      (a) =>
                        html`<li class="recap__pilmodal-asset">
                          <i class="${a.icon || "ap-icon-file"}" aria-hidden="true"></i>
                          <span class="recap__pilmodal-asset-name">${a.name}</span>
                        </li>`,
                    )
                    .join(""),
                )}
              </ul>
            </section>`
          : "",
      )}
      ${raw(
        p.sources.length
          ? html`<section class="research-article">
              <span class="research-article__label">Topics that fed this pillar</span>
              <ol class="recap__pilmodal-sources">
                ${raw(
                  p.sources
                    .map(
                      (srcItem) =>
                        html`<li class="recap__pilmodal-source">
                          <span class="recap__pilmodal-source-head">${srcItem.headline}</span>
                          ${raw(
                            srcItem.when ? html`<span class="recap__pilmodal-source-when">${srcItem.when}</span>` : "",
                          )}
                        </li>`,
                    )
                    .join(""),
                )}
              </ol>
            </section>`
          : "",
      )}
    </div>`,
    foot: html`<button type="button" class="ap-button stroked grey" data-pillar-back>
        <span>Back</span>
      </button>
      <button type="button" class="ap-button primary blue" data-pillar-use="${escapeAttr(p.id)}">
        <span>Add to chat</span>
      </button>`,
  });
}

export function openAddToStrategy({ briefId, playbookId, onConfirm = null }) {
  const brief = getBriefById(briefId);
  const ctx = getContextById(playbookId);
  const existing = ctx ? pillarForTopic(ctx.id, briefId) : null;
  const seed = topicSeed(brief);

  // Seed once per opening, not per render.
  if (existing) {
    strategyMode = "link";
    strategyPillarId = existing.id;
    // Only the delta. The pillar already holds what this topic said the first time.
    strategyText = brief?.whatChanged || seed.text;
  } else {
    strategyMode = pillarRoom(playbookId) === 0 ? "link" : "create";
    strategyPillarId = null;
    strategyText = seed.text;
  }
  strategyTitle = seed.title;

  paintStrategy({ briefId, playbookId, onConfirm, returning: !!existing });
}

// Re-rendered on every mode switch, so it is a function rather than an inline body.
function paintStrategy({ briefId, playbookId, onConfirm, returning }) {
  const brief = getBriefById(briefId);
  const ctx = getContextById(playbookId);
  const pillars = ctx ? getPillars(ctx.id) : [];
  const room = pillarRoom(playbookId);
  const full = room === 0;
  const linking = strategyMode === "link";
  if (linking && !strategyPillarId && pillars.length) strategyPillarId = pillars[0].id;
  const target = pillars.find((p) => p.id === strategyPillarId) || null;

  openShell(
    "strategy",
    { briefId, playbookId, onConfirm },
    {
      title: returning ? "Update a content pillar" : "Add to Content strategy",
      sub: ctx ? ctx.name : "",
      body:
        // The DS Infobox, because "explain what this does" on a persistent
        // surface is what an infobox is for. `info`, not the app's orange: this
        // is Archie describing a mechanism, not flagging something needing
        // attention.
        html`<div class="ap-infobox info has-title strategy__why">
            <i class="ap-icon-info_fill"></i>
            <div class="ap-infobox-content">
              <div class="ap-infobox-texts">
                <span class="ap-infobox-title">A pillar is not a saved topic</span>
                <span class="ap-infobox-message">${PILLAR_EXPLAINER}</span>
              </div>
            </div>
          </div>

          ${raw(
            returning
              ? html`<p class="strategy__returning">
                  This topic already feeds <strong>${target ? target.title : "a pillar"}</strong>. What changed is below
                  — it gets appended, so nothing the pillar already knows is lost.
                </p>`
              : renderStrategyChoice(pillars, room, full),
          )}
          ${raw(
            linking && !returning
              ? // ── The DS Select, which is NOT a native <select> ─────────────────
                // This was `<select class="ap-select">`, which is drift twice over:
                // .ap-select is a details/summary composition — trigger + dropdown +
                // option rows — and the DS ships a SEPARATE class,
                // .ap-native-select, for the native fallback. A <select> wearing
                // .ap-select gets the styling of neither.
                //
                // Built as the real component: <details> owns open/close with no JS,
                // the trigger shows the current value, and each option is a row
                // carrying its own id. No .ap-select-search — the anatomy lists it as
                // optional and a Playbook is capped at ten pillars, which is well
                // inside what you can read without filtering.
                //
                // The <label> has no `for`: a <details> is not a labelable element, so
                // the summary points back at the label with aria-labelledby instead.
                //
                // Known limitation of the DS's details/summary pattern: an open
                // dropdown does not close on an outside click, only on the summary or
                // on picking. Accepted rather than patched — hand-rolling that would
                // mean re-implementing the component's own behaviour.
                html`<div class="ap-form-field strategy__field">
                  <label id="strategyPillarLabel">Pillar</label>
                  <details class="ap-select">
                    <summary class="ap-select-trigger" aria-labelledby="strategyPillarLabel">
                      <span class="ap-select-value">${target ? target.title : "Choose a pillar"}</span>
                      <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
                    </summary>
                    <div class="ap-select-dropdown">
                      <div class="ap-select-options">
                        ${raw(
                          pillars
                            .map(
                              (p) =>
                                html`<div
                                  class="ap-select-option${raw(p.id === strategyPillarId ? " selected" : "")}"
                                  data-strategy-pick="${escapeAttr(p.id)}"
                                >
                                  <span class="ap-select-option-text">${p.title}</span>
                                  ${raw(
                                    p.id === strategyPillarId
                                      ? '<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>'
                                      : "",
                                  )}
                                </div>`,
                            )
                            .join(""),
                        )}
                      </div>
                    </div>
                  </details>
                </div>`
              : html`<div class="ap-form-field strategy__field">
                  <label for="strategyName">Pillar name</label>
                  <div class="ap-input-group">
                    <input type="text" id="strategyName" data-strategy-title value="${strategyTitle}" />
                  </div>
                </div>`,
          )}

          <div class="ap-form-field strategy__field">
            <label for="strategyText">${linking ? "What this topic adds" : "Details"}</label>
            <textarea class="ap-textarea strategy__text" id="strategyText" rows="9" data-strategy-text>
${strategyText}</textarea
            >
            <span class="ap-form-message"
              >${brief ? "Pre-filled from the topic. Trim it to what the pillar should actually carry." : ""}</span
            >
          </div>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-strategy-confirm>
          <span>${linking ? "Update pillar" : "Create pillar"}</span>
        </button>`,
    },
  );
}

// Create vs link. .ap-radio-card in `card` mode — the DS component for a
// single-select where each option needs a title, a description and a badge, which
// is exactly this choice. Never two buttons: the two paths are not equal-weight
// actions, they are two answers to one question, and the answer changes the form
// underneath.
function renderStrategyChoice(pillars, room, full) {
  const none = pillars.length === 0;
  return html`<div class="strategy__choice">
    <label class="ap-radio-card card${raw(full ? " is-unavailable" : "")}">
      <input
        type="radio"
        name="strategyMode"
        value="create"
        data-strategy-mode
        ${raw(strategyMode === "create" ? "checked" : "")}
        ${raw(full ? "disabled" : "")}
      />
      <div>
        <div class="ap-radio-card-header">
          <i class="ap-icon-plus" aria-hidden="true"></i>
          <span class="ap-radio-card-title">Create a new pillar</span>
        </div>
        <!-- The count is still ALWAYS shown — a cap you first meet at the moment it
             blocks you reads as a bug — but as plain text inside the sentence
             rather than as an .ap-status chip. Status means "the state of the whole
             surrounding component", and 4 of 10 is a COUNT; the DS's own rule for a
             number inside a phrase is that it is plain text, not a chip. The
             radio-card anatomy does sanction .ap-status in its header, which is why
             it got there — but sanctioned position does not make it the right
             component for this value. -->
        <span
          >${full
            ? `All ${PILLAR_LIMIT} pillars are in use. File the topic into one of them, or remove a pillar in the Playbook first.`
            : `${pillars.length} of ${PILLAR_LIMIT} used. A new theme to write against — start it from this topic, then refine it as more topics land.`}</span
        >
      </div>
    </label>
    <label class="ap-radio-card card${raw(none ? " is-unavailable" : "")}">
      <input
        type="radio"
        name="strategyMode"
        value="link"
        data-strategy-mode
        ${raw(strategyMode === "link" ? "checked" : "")}
        ${raw(none ? "disabled" : "")}
      />
      <div>
        <div class="ap-radio-card-header">
          <i class="ap-icon-target" aria-hidden="true"></i>
          <span class="ap-radio-card-title">Add to an existing pillar</span>
        </div>
        <span
          >${none
            ? "No pillars yet — create the first one."
            : "Flesh out a theme you have already committed to, so the next draft on it knows more."}</span
        >
      </div>
    </label>
  </div>`;
}

// ─── 5. Playbook competitors / influencers (READ-ONLY) ─────────────────────
//
// Opened from the research form's per-source rows. Deliberately read-only, and
// deliberately a modal rather than a link to /playbook: the form is a place you
// are mid-edit, and sending someone to another route to check who their
// competitors are loses the lane they were configuring. It answers "who is in
// here?" and nothing else — editing stays on the Playbook, which the footer
// links to.
//
// This replaces three broken links: the form used to point at
// `#/playbook/:id?section=<anchor>`, but /playbook never honoured `?section=`,
// the influencers anchor named a section that didn't exist, and the competitors
// one was invisible whenever the playbookCompetitors flag was off.

const LIST_KINDS = {
  competitors: {
    title: "Competitors",
    intro: "Direct competitors we found for your brand, with their website and social profiles.",
    empty: "No competitors in this Playbook yet.",
    pick: (ctx) => (Array.isArray(ctx?.competitors) ? ctx.competitors.filter((c) => !c.suggested) : []),
  },
  influencers: {
    title: "Influencers",
    intro: "Creators in your niche worth partnering with, with their reach and social profiles.",
    empty: "No influencers in this Playbook yet.",
    pick: (ctx) => (Array.isArray(ctx?.influencers) ? ctx.influencers : []),
  },
};

/** First letter of the brand, for the header tile. */
function brandInitial(ctx) {
  return ((ctx?.brandName || ctx?.name || "?").trim()[0] || "?").toUpperCase();
}

function renderProfileLinks(entry) {
  const links = [];
  if (entry.websiteUrl) links.push({ network: "website", url: entry.websiteUrl, label: "Website" });
  for (const s of entry.socials || []) {
    if (s && s.url) links.push({ network: s.network || "website", url: s.url, label: s.network || "Profile" });
  }
  if (!links.length) return "";
  return html`<span class="pbklist__links">
    ${raw(
      links
        .map(
          (l) =>
            // rel=noopener on every outbound link — without it the opened page
            // gets a handle on this window via window.opener.
            html`<a
              class="pbklist__link"
              href="${l.url}"
              target="_blank"
              rel="noopener noreferrer"
              title="${l.label}"
              aria-label="${l.label}"
              ><i class="${NETWORK_ICONS[l.network] || NETWORK_ICONS.website}" aria-hidden="true"></i
            ></a>`,
        )
        .join(""),
    )}
  </span>`;
}

const NETWORK_ICONS = {
  website: "ap-icon-web",
  facebook: "ap-icon-facebook",
  instagram: "ap-icon-instagram",
  x: "ap-icon-twitter",
  twitter: "ap-icon-twitter",
};

export function openPlaybookList({ playbookId, kind }) {
  const spec = LIST_KINDS[kind];
  if (!spec) return;
  const ctx = getContextById(playbookId);
  const list = spec.pick(ctx);

  openShell(
    "playbook-list",
    { playbookId, kind },
    {
      title: spec.title,
      // The Playbook name as an uppercase eyebrow ABOVE the section title, so the
      // dialog says whose competitors these are without a second heading.
      sub: "",
      body: html`<div class="pbklist__eyebrow">
          <span class="pbklist__tile" aria-hidden="true">${brandInitial(ctx)}</span>
          <span class="pbklist__brand">${ctx ? ctx.name : "Playbook"}</span>
        </div>
        <p class="research-modal__lede">${spec.intro}</p>
        ${raw(
          list.length
            ? html`<ul class="pbklist">
                ${raw(
                  list
                    .map(
                      (e) =>
                        html`<li class="pbklist__row">
                          <span class="pbklist__name">${e.name || "Untitled"}</span>
                          ${raw(e.reach ? html`<span class="pbklist__reach">${e.reach} reach</span>` : "")}
                          ${raw(e.description ? html`<span class="pbklist__desc">${e.description}</span>` : "")}
                          ${raw(renderProfileLinks(e))}
                        </li>`,
                    )
                    .join(""),
                )}
              </ul>`
            : html`<p class="muted">${spec.empty}</p>`,
        )}`,
      // Read-only, so the footer offers the one thing this dialog can't do —
      // and it goes to the Playbook, where editing actually lives.
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Close</span>
        </button>
        <button type="button" class="ap-button primary blue" data-pbklist-edit="${escapeAttr(playbookId)}">
          <span>Edit in the Playbook</span>
        </button>`,
    },
  );
}

// ─── 6. Pick a topic (composer Add → Content Ideas) ─────────────────────────
//
// The composer's Add menu can reach every other source kind but had no way into
// Content Ideas, so a topic you had already triaged could only be used from its
// own feed. This is that door.
//
// Grouped by lane rather than shown flat: a topic only means something next to
// the research that produced it, and the lane name is the only thing that says
// which brand and which sources it came from.
//
// IGNORED topics are left out. Everything else — New, Saved, Used — is offered,
// because re-using a topic in a second chat is legitimate, but "Ignore" is the
// one status that means "not this one".
// TWO STEPS, not a filter dropdown. Picking the Playbook first is a real
// question with a small answer set, and answering it up front means step two is
// already the short list — where a dropdown made you open the modal, read a list
// you did not want, then go filter it.
//
// `pickerStep` and `pickerPlaybook` are module-level because each step re-renders
// through openShell, which rebuilds the dialog; the answers have to outlive that.
export function openIdeaPicker({ onPick }) {
  pickerStep = "playbooks";
  pickerPlaybook = null;
  renderIdeaPicker({ onPick });
}

// Every Playbook that actually owns a topic, in lane order. Offering Playbooks
// with nothing behind them would be a choice that can only empty the next step.
function pickerPlaybookOptions() {
  const seen = new Map();
  for (const lane of getLanes()) {
    if (seen.has(lane.playbookId)) continue;
    const pb = getContextById(lane.playbookId);
    if (pb) seen.set(lane.playbookId, pb);
  }
  return [...seen.values()];
}

// A lane's topics, split by whether the picker would normally show them.
//
// `shown` is everything not ignored. `hiddenTrending` is the exception this
// picker makes: a topic you ignored but which is now running above its baseline.
// That is the trending page's rule — "a spike is never hidden by triage state" —
// and it does NOT contradict the feed's no-override rule, because there the user
// set the status filter themselves and gets told what it hides. Here the
// exclusion is a built-in default nobody chose, so silently dropping a spike
// would just lose it.
function pickerSplit(laneId) {
  const all = getBriefsForLane(laneId);
  return {
    shown: all.filter((b) => b.status !== "ignored"),
    // Empty while the exception is off, so the group below simply never renders.
    hiddenTrending: SHOW_HIDDEN_TRENDING ? all.filter((b) => b.status === "ignored" && b.isTrending) : [],
  };
}

function pickerLanes() {
  return getLanes().filter((lane) => lane.playbookId === pickerPlaybook);
}

function renderIdeaPicker(ctx) {
  if (pickerStep === "playbooks") return renderPlaybookStep(ctx);
  return renderTopicStep(ctx);
}

// ── Step 1: which Playbook ─────────────────────────────────────────────────
//
// One click on a card IS the answer — no checkboxes, no Continue. The question
// has exactly one answer in practice ("show me this brand's topics"), and a
// multi-select made you state it twice: tick, then confirm.
//
// It reuses the /contexts card — .contexts-card and its children, colour
// modifier and all — rather than a list row of its own. A Playbook is the same
// object here as it is on its own page, and the picker was the only surface
// that drew it differently.
//
// Two deliberate omissions from that card:
//   • .contexts-card__brief. Asked for, and right: the brief is a paragraph you
//     read when you are deciding how a Playbook is set up, not when you are
//     answering "whose topics?". It also made the cards tall enough to push the
//     second row under the fold.
//   • .contexts-card__actions (edit / duplicate / delete). Those are page
//     affordances — a topic picker must not be a place you can delete a
//     Playbook from.
//
// The topic count replaces them as an extra .contexts-card__counter, so the
// picker's own information rides in the card's existing footer rather than in a
// new element.
function renderPlaybookStep(ctx) {
  const options = pickerPlaybookOptions();

  openShell("idea-picker", ctx, {
    title: "Pick a topic",
    sub: "Which Playbook do you want topics from?",
    // wide, because .contexts-card is built for a ~300px minimum and the default
    // 560px shell gave it one cramped column.
    wide: true,
    body: options.length
      ? html`<div class="research-pick__pbgrid">
          ${raw(
            options
              .map((o) => {
                const lanes = getLanes().filter((l) => l.playbookId === o.id);
                const n = lanes.reduce((t, l) => t + pickerSplit(l.id).shown.length, 0);
                const color = o.color || "orange";
                const voice = o.voiceProfile && o.voiceProfile.headline;
                return html`<article
                  class="contexts-card contexts-card--${color}"
                  data-idea-pb="${escapeAttr(o.id)}"
                  role="button"
                  tabindex="0"
                >
                  <span class="contexts-card__swatch" aria-hidden="true"></span>
                  <header class="contexts-card__head">
                    <h3 class="contexts-card__name">${o.name}</h3>
                  </header>
                  ${raw(
                    voice
                      ? html`<div class="contexts-card__voice">
                          <i class="ap-icon-archie-official"></i><span>${voice}</span>
                        </div>`
                      : "",
                  )}
                  <footer class="contexts-card__foot">
                    <div class="contexts-card__counters">
                      <span class="contexts-card__counter" title="${n} ${n === 1 ? "topic" : "topics"}">
                        <i class="ap-icon-note"></i><span>${n}</span>
                      </span>
                      <span
                        class="contexts-card__counter"
                        title="${lanes.length} ${lanes.length === 1 ? "topic list" : "topic lists"}"
                      >
                        <i class="ap-icon-folder"></i><span>${lanes.length}</span>
                      </span>
                    </div>
                  </footer>
                </article>`;
              })
              .join(""),
          )}
        </div>`
      : html`<p class="research-pick__empty muted">No topics yet. Content Ideas fills up once a lane has run.</p>`,
    foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
      <span>Cancel</span>
    </button>`,
  });
}

// ── Step 2: the topics themselves ──────────────────────────────────────────
// Grouped BY AGE, exactly like the topic-list screen — same groupBriefsByAge,
// same AGE_GROUPS order, same .topics-agegroup chrome. It used to group by lane,
// which meant the one list in the app that shows the feed's cards sorted them by
// a different rule than the feed does; "3 days ago" is the thing you actually
// scan a topic list by, and the picker had no reason to disagree.
//
// The lane didn't just disappear with its headings: it moves onto each card's
// meta line (see pickerCard), because a Playbook can own several lanes and the
// picker is the one surface that spans them.
function renderTopicStep(ctx) {
  const lanes = pickerLanes().map((lane) => ({ lane, ...pickerSplit(lane.id) }));
  const laneNameOf = new Map();
  const shown = [];
  for (const g of lanes) {
    for (const b of [...g.shown, ...g.hiddenTrending]) laneNameOf.set(b.id, g.lane.name);
    shown.push(...g.shown);
  }
  // Newest first inside a group, matching the feed's own sort.
  shown.sort((a, b) => ageMinutes(a.ageLabel) - ageMinutes(b.ageLabel));
  const ageGroups = groupBriefsByAge(shown);
  const shownTotal = shown.length;
  const trending = lanes.flatMap((g) => g.hiddenTrending);
  const pb = getContextById(pickerPlaybook);

  openShell("idea-picker", ctx, {
    title: "Pick a topic",
    sub: `${shownTotal} ${shownTotal === 1 ? "topic" : "topics"} in ${pb ? pb.name : "this Playbook"}`,
    // Sized to the card rather than to a generic "wide": the topic card caps
    // itself at its own content, so the 768px shell step 1 uses would leave a
    // dead column beside every card.
    size: "topics",
    // Plain string concatenation, NOT raw(): openShell assigns this to
    // bodyEl.innerHTML, and raw() returns a marker object that only means
    // something inside an html`` template — as innerHTML it stringifies to
    // "[object Object]" and the list silently vanishes.
    //
    // Trending-but-ignored goes FIRST, for the same reason the feed puts its
    // notice above the list: it is the thing you would otherwise not see.
    body:
      shownTotal || trending.length
        ? (trending.length
            ? html`<section class="research-pick__group research-pick__group--trending">
                <h4 class="research-pick__group-title">Trending, normally hidden</h4>
                <p class="research-pick__group-note">
                  You ignored ${trending.length === 1 ? "this one" : "these"}, but
                  ${trending.length === 1 ? "it is" : "they are"} running above baseline again.
                </p>
                ${raw(trending.map((b) => pickerCard(b, laneNameOf.get(b.id))).join(""))}
              </section>`
            : "") +
          ageGroups
            .map(
              ({ group, briefs }) =>
                html`<section class="topics-agegroup">
                  <h4 class="topics-agegroup__label">${group.label}</h4>
                  ${raw(briefs.map((b) => pickerCard(b, laneNameOf.get(b.id))).join(""))}
                </section>`,
            )
            .join("")
        : html`<p class="research-pick__empty muted">No topics in this Playbook yet.</p>`,
    foot: html`<button type="button" class="ap-button stroked grey" data-idea-back>
        <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Playbooks</span>
      </button>
      <button type="button" class="ap-button stroked grey" data-research-modal-close>
        <span>Close</span>
      </button>`,
  });
}

// The SAME card the topic list draws, in its picker variant — see
// components/brief-card.js. This used to be a compact one-line row of its own
// (headline + a "source · age · lane" meta string + a status pill), which meant
// the topic you picked looked nothing like the topic you had been reading in the
// feed two seconds earlier. The summary, the Trending and Updated marks and the
// Why-now / What-changed blocks are the things you actually choose on, and the
// row dropped all four.
function pickerCard(b, laneName = "") {
  return renderBriefCard(b, { source: findResearchSource(b.sourceId), variant: "picker", laneName });
}

// ─── 7. Full research ──────────────────────────────────────────────────────

/**
 * The article itself, as a string — no dialog, no panel, no chrome.
 *
 * Extracted so the SAME markup can be hosted by two very different containers:
 * the right panel (where the feed now opens it, so cards stay scrollable beside
 * it) and this module's own dialog (still used by the attention page, which has
 * no panel to open into). The alternative was right-panel.js importing
 * briefs-store — a core-shell module reaching into a flag-gated feature — which
 * is exactly the dependency this seam avoids.
 */
export function renderResearchArticle(brief, { withLabel = true } = {}) {
  if (!brief) return "";
  const posts = brief.posts || [];
  // `withLabel: false` for the feed's article pane, which promotes "Full article"
  // into its own header — the pane IS the article, so labelling it again inside
  // its own body said the same thing twice. The dialog keeps the inline label,
  // because there the article is one section among several in a shell whose title
  // is the topic's headline.
  return html`<section class="research-article">
      ${raw(
        withLabel
          ? html`<span class="research-article__label"
              ><i class="ap-icon-sparkles" aria-hidden="true"></i> Full article</span
            >`
          : "",
      )}
      <h3 class="research-article__title">${brief.research?.title || ""}</h3>
      ${raw((brief.research?.paragraphs || []).map((p) => html`<p>${p}</p>`).join(""))}
    </section>
    ${raw(
      brief.isTrending && brief.whyNow
        ? html`<section class="research-article">
            <p class="topics-card__whynow">
              <strong class="topics-card__whynow-label">Why now:</strong> ${brief.whyNow}
            </p>
            ${raw(brief.whyNowDetail ? html`<p>${brief.whyNowDetail}</p>` : "")}
          </section>`
        : "",
    )}
    ${raw(renderHistory(brief.history || [], brief.status))}
    ${raw(
      posts.length
        ? html`<section class="research-article">
            <span class="research-article__label">Source posts</span>
            <div class="research-modal__posts">${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}</div>
          </section>`
        : "",
    )}`;
}

/** Source name + post count, the article's own subtitle in either container. */
export function researchArticleSub(brief) {
  if (!brief) return "";
  const source = findResearchSource(brief.sourceId);
  const posts = brief.posts || [];
  // Drop the count entirely at zero rather than printing "0 posts", which reads
  // as a bug. A brief legitimately has no attached posts when its scan returned
  // topics without the underlying items.
  return [source ? source.name : "", posts.length ? `${posts.length} ${posts.length === 1 ? "post" : "posts"}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function openFullResearch({ briefId }) {
  const brief = getBriefById(briefId);
  if (!brief) return;

  openShell(
    "full-research",
    { briefId },
    {
      title: brief.headline,
      sub: researchArticleSub(brief),
      wide: true,
      body: renderResearchArticle(brief),
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
        <span>Close</span>
      </button>`,
    },
  );
}

// The timeline of how this brief got to its current state. The brief's CURRENT
// status is appended as the final entry so the list always ends where the card
// says it is — an authored history that stopped one step short read as a bug.
function renderHistory(history, currentStatus) {
  const meta = findReviewStatus(currentStatus);
  const entries = [
    ...history,
    { status: currentStatus, when: "now", note: `Currently ${meta ? meta.label : currentStatus}.` },
  ];
  return html`<section class="research-article">
    <span class="research-article__label"><i class="ap-icon-clock" aria-hidden="true"></i> Topic history</span>
    <ol class="research-timeline">
      ${raw(
        entries
          .map((e) => {
            const m = findReviewStatus(e.status);
            return html`<li class="research-timeline__row">
              <span class="research-timeline__dot topics-status--${e.status}" aria-hidden="true"></span>
              <span class="research-timeline__body">
                <span class="topics-status topics-status--${e.status}">${m ? m.label : e.status}</span>
                <span class="research-timeline__when">${e.when}</span>
                <span class="research-timeline__note">${e.note}</span>
              </span>
            </li>`;
          })
          .join(""),
      )}
    </ol>
  </section>`;
}

// ─── Shared wiring ─────────────────────────────────────────────────────────

function onPanelClick(event) {
  if (event.target.closest("[data-research-modal-close]")) {
    close();
    return;
  }
  if (!active) return;

  const pbkEdit = event.target.closest("[data-pbklist-edit]");
  if (pbkEdit) {
    // ?section= is honoured by screens/playbook.js, so this lands on the right
    // section rather than the top of the page.
    const kind = active.ctx.kind;
    close();
    navigate(`/playbook/${encodeURIComponent(pbkEdit.dataset.pbklistEdit)}?section=${kind}`);
    return;
  }

  if (event.target.closest("[data-need-send]")) {
    const btn = event.target.closest("[data-need-send]");
    if (btn.getAttribute("aria-disabled") === "true") return;
    // Swap to the success state in place rather than closing — the confirmation
    // is the point, and a dialog that vanishes on send reads as a dropped form.
    bodyEl.innerHTML = html`<div class="research-modal__success">
      <span class="research-modal__success-mark" aria-hidden="true"><i class="ap-icon-rounded-check"></i></span>
      <p>Thanks — your feedback is with the team.</p>
    </div>`;
    footEl.innerHTML = html`<button type="button" class="ap-button primary blue" data-research-modal-close>
      <span>Close</span>
    </button>`;
    return;
  }

  // ── Idea-picker step navigation ──────────────────────────────────────────
  // A Playbook card: choosing it and moving on are one action, so there is no
  // Continue to guard and no state that can be empty.
  const pbCard = event.target.closest("[data-idea-pb]");
  if (pbCard) {
    pickerPlaybook = pbCard.dataset.ideaPb;
    pickerStep = "topics";
    renderIdeaPicker(active.ctx);
    return;
  }

  if (event.target.closest("[data-idea-back]")) {
    pickerStep = "playbooks";
    renderIdeaPicker(active.ctx);
    return;
  }

  const pick = event.target.closest("[data-idea-pick]");
  if (pick) {
    const brief = getBriefById(pick.dataset.ideaPick);
    // Read the callback off `active` BEFORE closing — close() nulls it, which is
    // the same trap the ignore branch below documents.
    const onPick = active.ctx.onPick;
    close();
    if (brief && onPick) onPick(brief);
    return;
  }

  if (event.target.closest("[data-ignore-submit]")) {
    const text = panel.querySelector("[data-ignore-text]");
    ignoreBrief(active.ctx.briefId, text ? text.value : "");
    const done = active.ctx.onDone;
    close();
    if (done) done();
    showToast("Topic ignored");
    return;
  }

  if (event.target.closest("[data-export-go]")) {
    const n = active.ctx.count;
    close();
    showToast(`Exported ${n} ${n === 1 ? "topic" : "topics"} as CSV`);
    return;
  }

  if (event.target.closest("[data-strategy-confirm]")) {
    // Status flips HERE, on confirm — never when the menu item was clicked.
    // That was a real bug: the brief went Used the moment the dropdown item was
    // pressed, so cancelling still left it triaged.
    const { briefId, playbookId, onConfirm } = active.ctx;
    const brief = getBriefById(briefId);
    const topic = brief ? { briefId, headline: brief.headline, when: brief.ageLabel } : null;
    // Read the fields at confirm time rather than tracking every keystroke: the
    // dialog is the only editor and it is about to close.
    const titleEl2 = panel.querySelector("[data-strategy-title]");
    const textEl = panel.querySelector("[data-strategy-text]");
    const title = titleEl2 ? titleEl2.value : strategyTitle;
    const text = textEl ? textEl.value : strategyText;

    let result = null;
    if (strategyMode === "link") {
      result = addTopicToPillar(playbookId, strategyPillarId, { addition: text, topic });
    } else {
      result = addPillarFromTopic(playbookId, { title, description: text, topic });
    }
    // A null here means the cap was reached between opening and confirming.
    // Don't close on failure — the dialog is where the user can still choose the
    // other path.
    if (!result) {
      showToast(`This Playbook already has ${PILLAR_LIMIT} pillars`);
      return;
    }
    setStatus(briefId, "used");
    close();
    if (onConfirm) onConfirm();
    // The snackbar carries a way to go and look at what was just written. Without
    // it the user is told a pillar exists somewhere they are not, and has to find
    // the Playbook and then the section inside it by hand.
    //
    // `?section=strategy` rather than a bare /playbook/:id — the screen already
    // resolves that param to #pbk-sec-strategy and scrolls it into view on mount,
    // so the page opens ON the Content strategy section instead of at the top with
    // the user hunting for it.
    //
    // action.onClick, not a raw <a>: the snackbar renders the action in the DS's
    // `.ap-snackbar-right > a` slot and dismisses itself after the handler, which
    // a plain link would not do — leaving a stale toast over the page it just
    // navigated to.
    //
    // Names the DESTINATION, not the pillar. "Added to Attainable by design" was
    // the pillar's own title, which says nothing about where the topic landed —
    // and on a pillar created from a topic the title is the topic's headline, so
    // the message read as a sentence about the topic rather than a confirmation.
    // "Content Strategy" is the Playbook section's exact name (playbook-view.js
    // SECTIONS) and the place the action button goes, so the message and the
    // button now describe the same destination.
    const pbName = playbookId ? getContextById(playbookId)?.name : "";
    showToast(pbName ? `Added to ${pbName}'s Content Strategy` : "Added to the Playbook's Content Strategy", {
      action: playbookId
        ? {
            label: "View in Playbook",
            onClick: () => navigate(`/playbook/${encodeURIComponent(playbookId)}?section=strategy`),
          }
        : null,
    });
    return;
  }

  // ── Pillar picker ──────────────────────────────────────────────────────
  const pillarPb = event.target.closest("[data-pillar-pb]");
  if (pillarPb) {
    pillarPbId = pillarPb.dataset.pillarPb;
    pillarStep = "pillars";
    return renderPillarPicker(active.ctx);
  }
  const pillarCard = event.target.closest("[data-pillar-pick]");
  if (pillarCard) {
    pillarPickedId = pillarCard.dataset.pillarPick;
    pillarStep = "detail";
    return renderPillarPicker(active.ctx);
  }
  if (event.target.closest("[data-pillar-back]")) {
    // detail → list → playbooks, so Back always undoes exactly one choice.
    if (pillarStep === "detail") {
      pillarStep = "pillars";
      pillarPickedId = null;
    } else {
      pillarStep = "playbooks";
      pillarPbId = null;
    }
    return renderPillarPicker(active.ctx);
  }
  const pillarUse = event.target.closest("[data-pillar-use]");
  if (pillarUse) {
    const { onPick } = active.ctx;
    const ctxId = pillarPbId;
    const pid = pillarUse.dataset.pillarUse;
    close();
    if (onPick) onPick(ctxId, pid);
    return;
  }

  // Picking a pillar. A repaint is what closes the <details> and redraws the
  // trigger, so the in-progress text has to survive it — same as the mode switch
  // below, for the same reason.
  // `pillarPick`, not `pick` — [data-idea-pick] already owns that name in this
  // same function, and re-declaring it threw a SyntaxError that took the whole
  // module down.
  const pillarPick = event.target.closest("[data-strategy-pick]");
  if (pillarPick && active && active.kind === "strategy") {
    const textEl = panel.querySelector("[data-strategy-text]");
    if (textEl) strategyText = textEl.value;
    strategyPillarId = pillarPick.dataset.strategyPick;
    paintStrategy({ ...active.ctx, returning: false });
    return;
  }

  // Switching create ↔ link re-renders the form beneath the choice, so the
  // in-progress text has to be carried across the repaint by hand.
  const modeRadio = event.target.closest("[data-strategy-mode]");
  if (modeRadio && active && active.kind === "strategy") {
    const textEl = panel.querySelector("[data-strategy-text]");
    const titleEl2 = panel.querySelector("[data-strategy-title]");
    if (textEl) strategyText = textEl.value;
    if (titleEl2) strategyTitle = titleEl2.value;
    strategyMode = modeRadio.value;
    paintStrategy({ ...active.ctx, returning: false });
    return;
  }
}

function onPanelInput(event) {
  const text = event.target.closest("[data-need-text]");
  if (!text) return;
  const send = panel.querySelector("[data-need-send]");
  if (!send) return;
  // aria-disabled alone drives both the semantics and the tint — ds-patches.css
  // styles .ap-button[aria-disabled="true"], so there's no second class to keep
  // in sync with the attribute.
  send.setAttribute("aria-disabled", text.value.trim() ? "false" : "true");
}
