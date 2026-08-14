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
//   openVersionHistory({ briefId })   — past versions of the article
//
// Public API mirrors every other modal here: init() once at boot, then open*().
// Overlay arbitration goes through modal-coordinator so only one is ever up, and
// so the source-feedback dialog can legitimately stack over the research form.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { findResearchSource, findReviewStatus } from "../research-catalog.js?v=19";
import {
  ageMinutes,
  getBriefById,
  getBriefVersions,
  getBriefsForLane,
  groupBriefsByAge,
  ignoreBrief,
  setStatus,
  toggleSaved,
} from "../briefs-store.js?v=52";
// The article dialog's footer is the feed's footer — same component, same three
// verbs — so it comes from the same module rather than being re-written here.
import { renderUseButtons } from "./brief-card.js?v=47";
import { getLanes } from "../research-store.js?v=42";
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
} from "../contexts-store.js?v=74";
// No cycle: brief-flow reaches briefs-store / sources-stream / router, never back
// into this file. The version dialog goes through it rather than calling
// addReadySource directly so "use in chat" has one definition.
import { openBriefInChat } from "../brief-flow.js?v=25";
import { renderBriefCard } from "./brief-card.js?v=47";
import { renderSocialPostCard } from "./social-post-card.js?v=30";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "research";

// The picker's "Trending, normally hidden" group — the counterpart to the feed's
// attention notice, and switched off with it. It surfaced ignored-but-trending
// topics that the picker's own ignored-exclusion would otherwise drop. One line
// to restore; pickerSplit and the group's render are both still below.
const SHOW_HIDDEN_TRENDING = false;

let backdrop, panel, titleEl, subEl, bodyEl, footEl, backEl;
let initialized = false;
let active = null; // { kind, ctx } — what's currently open
let backTo = null; // briefId to return to, when this view was opened from the article
// Topic-picker state. Module-level because each step re-renders through openShell,
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
    <!-- The back button belongs to the HEADER, not to the body, because it navigates
         the dialog rather than the content: it is a sibling of the close button, and
         the two together say "this view sits inside something". Hidden unless the
         current view was opened from another one. -->
    <button type="button" class="ap-button ghost grey research-modal__back" data-research-modal-back hidden>
      <i class="ap-icon-chevron-left" aria-hidden="true"></i><span>Back to the topic</span>
    </button>
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
  backEl = panel.querySelector("[data-research-modal-back]");

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

function openShell(kind, ctx, { title, sub = "", body, foot, wide = false, size = "", back = null }) {
  init();
  requestOpen(MODAL_ID, close);
  active = { kind, ctx };
  titleEl.textContent = title;
  subEl.textContent = sub;
  subEl.hidden = !sub;
  bodyEl.innerHTML = body;
  footEl.innerHTML = foot;
  // `back` is the id of the Topic to return to, or null. Stored on the shell rather
  // than on the button so a view can be reopened without re-deriving it.
  backTo = back;
  // Hidden with BOTH the attribute and inline display, deliberately. `.ap-button` sets
  // display: inline-flex, and a class rule beats the UA's [hidden] { display: none } —
  // so the attribute alone left the button on screen in every view, including the ones
  // opened from the feed's pane where there is nothing to go back to. The repo already
  // records this trap for .ap-select-not-found (UI-PATTERNS); this is the second case.
  // The attribute stays for assistive tech, the inline style is what actually hides it.
  if (backEl) {
    backEl.hidden = !back;
    backEl.style.display = back ? "" : "none";
  }
  panel.classList.toggle("research-modal--nested", !!back);
  panel.classList.toggle("research-modal--wide", wide);
  // One extra width, for the step whose content sets its own. See
  // .research-modal--topics in research-modals.css.
  panel.classList.toggle("research-modal--topics", size === "topics");
  // ─── PARKED: Add to strategy ─────────────────────────────────────────────
  // Its own name and its own width (700px, +25% on the 560 base). Named for the
  // dialog rather than the shell because .research-modal IS the shell — the same
  // element serves Need-that-source, Ignore topic, Export, Full research and both
  // pickers, so a name claiming otherwise would be wrong on five of the six.
  // Uncomment with the rest of the flow; .content-strategy-add-modal is still in
  // styles/components/research-modals.css, untouched.
  //
  // panel.classList.toggle("content-strategy-add-modal", kind === "strategy");
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
      title: "Why did this Topic miss the mark?",
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
            This helps me tailor Topics to your needs. I'll keep this Topic out of your feed unless it trends well above
            its usual volume baseline — so you still catch real spikes without noise from recurring Topics.
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
      title: "Export Topics",
      body: html`<p class="research-modal__lede">
          Export all ${count} ${count === 1 ? "Topic" : "Topics"} currently in your feed.
        </p>
        <label class="research-modal__radio is-selected">
          <input type="radio" name="researchExportFormat" checked />
          <span class="research-modal__radio-text">
            <strong>CSV spreadsheet</strong>
            <span>One row per Topic, with source and status.</span>
          </span>
        </label>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-export-go>
          <span>Export ${count} ${count === 1 ? "Topic" : "Topics"}</span>
        </button>`,
    },
  );
}

// ─── 4. Add to Content strategy ────────────────────────────────────────────

// What a pillar IS, stated once, at the moment the user is deciding to make one.
// A pillar is not a saved Topic and the difference is not obvious, so the dialog
// says it rather than assuming it: a saved topic gets reused as it is, a pillar
// accumulates and gets refined as more topics feed into it.
const PILLAR_EXPLAINER =
  "Archie writes against your pillars: when a draft fits one, it adapts its " +
  "writing to what that pillar already knows. Filing a Topic into an existing " +
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
      : html`<p class="muted">No Playbook has a content pillar yet. Add a Topic to a strategy first.</p>`,
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
              srcN ? `${srcN} ${srcN === 1 ? "Topic" : "Topics"}` : "",
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

// ─── PARKED: Add to strategy ───────────────────────────────────────────────
// UNREACHABLE while the flow is parked, and left whole on purpose. Every caller
// is commented out (research-feed.js), the card no longer emits the attribute
// that reaches them (brief-card.js), and the dialog's width class no longer gets
// toggled (openShell above). The function, its paint, its confirm handler and the
// contexts-store pillar API it writes through are all still here — restoring is
// uncommenting the call sites, not rebuilding this.
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
                <span class="ap-infobox-title">A pillar is not a saved Topic</span>
                <span class="ap-infobox-message">${PILLAR_EXPLAINER}</span>
              </div>
            </div>
          </div>

          ${raw(
            returning
              ? html`<p class="strategy__returning">
                  This Topic already feeds <strong>${target ? target.title : "a pillar"}</strong>. What changed is below
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

          <!-- .ap-textarea-field, NOT .ap-form-field with a class on the textarea.
               The DS ships a dedicated field wrapper for textareas that styles its
               child textarea implicitly (border, padding, radius, focus ring, the
               input type scale) — and there is no .ap-textarea class at all, so the
               old markup left the control with none of it. "resizable" is the DS
               modifier for resize: vertical, which app CSS was hand-rolling.
               Never a backtick in this comment — it sits inside a tagged template
               literal, and one backtick here ends the template. -->
          <div class="ap-textarea-field resizable strategy__field">
            <label for="strategyText">${linking ? "What this Topic adds" : "Details"}</label>
            <textarea id="strategyText" rows="9" data-strategy-text>${strategyText}</textarea>
            <span class="ap-form-message"
              >${brief ? "Pre-filled from the Topic. Trim it to what the pillar should actually carry." : ""}</span
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
            ? `All ${PILLAR_LIMIT} pillars are in use. File the Topic into one of them, or remove a pillar in the Playbook first.`
            : `${pillars.length} of ${PILLAR_LIMIT} used. A new theme to write against — start it from this Topic, then refine it as more Topics land.`}</span
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

// ─── 6. Pick a topic (composer Add → Topic feeds) ─────────────────────────
//
// The composer's Add menu can reach every other source kind but had no way into
// Topic feeds, so a topic you had already triaged could only be used from its
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
    title: "Pick a Topic",
    sub: "Which Playbook do you want Topics from?",
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
                      <span class="contexts-card__counter" title="${n} ${n === 1 ? "Topic" : "Topics"}">
                        <i class="ap-icon-note"></i><span>${n}</span>
                      </span>
                      <span
                        class="contexts-card__counter"
                        title="${lanes.length} ${lanes.length === 1 ? "Topic feed" : "Topic feeds"}"
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
      : html`<p class="research-pick__empty muted">No Topics yet. Your Topic feeds fill up once one has run.</p>`,
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
    title: "Pick a Topic",
    sub: `${shownTotal} ${shownTotal === 1 ? "Topic" : "Topics"} in ${pb ? pb.name : "this Playbook"}`,
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
        : html`<p class="research-pick__empty muted">No Topics in this Playbook yet.</p>`,
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
export function renderResearchArticle(brief, { withLabel = true, withTitle = true } = {}) {
  if (!brief) return "";
  const posts = brief.posts || [];
  // Both flags are OFF for the feed's article PANE and ON for this module's dialog,
  // and the reason is the same in each case: the pane has chrome of its own, the
  // dialog's chrome belongs to something else.
  //
  //   withLabel — the pane has a title and a close button and sits beside the card it
  //     belongs to, so "Full article" was the fourth label in a 60px band. In the
  //     dialog the article is one section among several, so the label earns its place.
  //   withTitle — the pane promotes brief.research.title into its own header, so
  //     rendering it again here printed the same line twice. The dialog's shell title
  //     is the topic HEADLINE, which is a different string, so the article still needs
  //     to name itself inside the body.
  //
  // Defaults are ON so the dialog reads unchanged and any future caller gets the
  // complete article rather than a silently headless one.
  return html`<section class="research-article">
      ${raw(
        withLabel
          ? html`<span class="research-article__label"
              ><i class="ap-icon-sparkles" aria-hidden="true"></i> Full Topic</span
            >`
          : "",
      )}
      ${raw(withTitle ? html`<h3 class="research-article__title">${brief.research?.title || ""}</h3>` : "")}
      ${raw(renderArticleBody(brief.research))}
    </section>
    ${raw(renderTrendLevels(brief))} ${raw(renderHistory(brief.history || [], brief.status, brief.id))}
    ${raw(renderSources(brief))}`;
}

// ── Sources ────────────────────────────────────────────────────────────────
// The posts the article was written from, under Topic history — the last section,
// because it is the evidence rather than the argument, and a reader who wants it
// wants it after the claim rather than before.
//
// THREE, then a link. This used to render every post it had, which on the
// densest topic was seventeen cards below a four-paragraph article: the section
// stopped being evidence you could check and became a second document. Three is
// enough to see what KIND of post backs the claim, and the modal is there for
// anyone who wants to audit the rest.
//
// The lede is one sentence and it earns its place: a reader arriving at a stack of
// competitor posts underneath an article by Archie has no way to know whether they
// are sources or suggestions. It says which.
//
// The count is the FULL count, not three. The lede used to add "Showing 3." after
// it and that sentence is gone: the link underneath already reads "See all 6 posts",
// which says the same thing at the moment the reader can act on it, so the lede was
// announcing a limit twice before anyone had reached it. Rendered only when there is
// more than the sample; with exactly three, all three are already on screen and the
// count in the lede is the whole truth on its own.
const SOURCE_SAMPLE = 3;

function renderSources(brief) {
  const posts = brief.posts || [];
  if (!posts.length) return "";
  const shown = posts.slice(0, SOURCE_SAMPLE);
  const more = posts.length - shown.length;
  return html`<section class="research-article">
    <span class="research-article__label"><i class="ap-icon-quote" aria-hidden="true"></i> Sources</span>
    <p class="research-sources__lede">
      ${String(posts.length)} ${posts.length === 1 ? "post" : "posts"} from your listening sources make up the Topic
      above.
    </p>
    <div class="research-modal__posts">${raw(shown.map((p) => renderSocialPostCard(p)).join(""))}</div>
    ${raw(
      more > 0
        ? // .ap-link standalone small on a real <button>, matching the past-versions
          // link exactly — same shape of action (open a reader), so the same control.
          html`<button
            type="button"
            class="ap-link standalone small research-sources__all"
            data-brief-sources="${escapeAttr(brief.id)}"
          >
            <i class="ap-icon-view-grid" aria-hidden="true"></i>
            See all ${String(posts.length)} posts
          </button>`
        : "",
    )}
  </section>`;
}

// ─── 7. Every source post behind one topic ─────────────────────────────────
export function openSourcePosts({ briefId, from = null }) {
  const brief = getBriefById(briefId);
  if (!brief) return;
  const posts = brief.posts || [];
  openShell(
    "sources",
    { briefId },
    {
      title: "Sources",
      sub: `Topic: ${brief.headline}`,
      wide: true,
      back: from,
      body: html`<p class="research-sources__lede">
          Every post Archie read to write this Topic. Each one links out to the original.
        </p>
        <div class="research-modal__posts">${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}</div>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
        <span>Close</span>
      </button>`,
    },
  );
}

// ── Trend levels ───────────────────────────────────────────────────────────
// The two attention signals, explained. Both used to sit on the CARD as tinted
// two-line blocks; they now live here, together, because they answer one question
// — why is this topic flagged right now — and reading them side by side is the
// only way to tell a spike apart from a rewrite.
//
// One section for both, not two: they are the same kind of claim about the same
// moment. A topic CAN carry both — isTrending and isUpdated are independent
// booleans, which is the invariant briefs-store exists to protect — though no
// seeded topic currently does, so the both-signals case is untested against real
// copy. Two sections would have made such a topic look like it had two unrelated
// notices; one section stacks Why now above What changed and reads as one answer.
//
// Rendered only when a signal is actually present, so an untriaged topic with no
// spike and no rewrite gets no empty heading. The gates are the SIGNAL BOOLEANS,
// not just the text: briefs-store keeps isTrending / isUpdated separate from
// `status` precisely so a view can ask "is this flagged" without inferring it, and
// a whyNow string on a topic that is not trending is stale copy rather than a
// reason to show the block.
//
// Reuses .topics-card__whynow and .topics-card__changed — the two tinted blocks the
// card used to own. They are still the right treatment (a coloured left rule, warm
// for a spike, cool for a rewrite) and moving the markup does not make them a new
// component. Neither carries the card's inner clamp span, so both read in full,
// which is the whole reason for being here rather than there.
function renderTrendLevels(brief) {
  const trending = brief.isTrending && brief.whyNow;
  const updated = brief.isUpdated && brief.whatChanged;
  if (!trending && !updated) return "";
  return html`<section class="research-article">
    <!-- ap-icon-arrow-up, the same glyph the card's Trending badge carries — the
         section explains that badge, so it should be recognisable as its
         continuation. There is no ap-icon-trending-up in the DS. -->
    <span class="research-article__label"><i class="ap-icon-arrow-up" aria-hidden="true"></i> Trend levels</span>
    ${raw(
      trending
        ? html`<p class="topics-card__whynow">
            <strong class="topics-card__whynow-label">Why now:</strong> ${brief.whyNow}
          </p>` + (brief.whyNowDetail ? html`<p>${brief.whyNowDetail}</p>` : "")
        : "",
    )}
    ${raw(
      updated
        ? html`<p class="topics-card__changed">
            <strong class="topics-card__changed-label">What changed:</strong> ${brief.whatChanged}
          </p>`
        : "",
    )}
  </section>`;
}

// The article body: two named sections rather than an undifferentiated run of
// paragraphs.
//
// Placement is derived, not authored. Every article in this prototype has the same
// rhetorical shape — the first half is what the scan found and what the accounts
// say, the second half is the position and what blocks it — so the split lands at
// the midpoint and each subhead leads a half. The alternative was an index per
// heading in the data, which would have to be re-checked every time a paragraph was
// added or cut.
//
// Halves rather than "after paragraph 1" and "before the last": that rule orphans
// the second heading on the two-paragraph topics, of which this lane has two.
// Splitting on ceil(n/2) gives 1|1, 2|2 and 3|2 for the paragraph counts actually
// present, with no empty section at either end.
//
// Degrades to plain paragraphs when a research object carries fewer than two
// subheads — which is what the past-version articles do, since they are rendered by
// the version dialog rather than through here.
//
// <h4>, because the article title above is the <h3> — the document order has to
// hold. The h3 TEXT STYLE is applied by class instead, which the DS sanctions
// explicitly for the case where the right tag and the right size disagree.
function renderArticleBody(research) {
  const paras = research?.paragraphs || [];
  const subheads = research?.subheads || [];
  const para = (p) => html`<p>${p}</p>`;
  if (subheads.length < 2 || paras.length < 2) return paras.map(para).join("");
  const split = Math.ceil(paras.length / 2);
  const section = (heading, rows) =>
    html`<h4 class="research-article__subhead">${heading}</h4>` + rows.map(para).join("");
  return section(subheads[0], paras.slice(0, split)) + section(subheads[1], paras.slice(split));
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

/**
 * The same article, with the feed's own actions under it.
 *
 * openFullResearch above is the READ-ONLY twin, opened from the Topic picker
 * where the only sensible verb is Close. This one is opened from the new-session
 * carousel, where the reader is deciding what to DO with the Topic — so it
 * carries the identical footer the feed's article pane carries: renderUseButtons,
 * the same component, so the three verbs cannot drift between the two surfaces.
 *
 * Why a dialog here and a pane there: the feed has a list to compare against and a
 * modal would black it out (research-feed.js says so at the pane's own handler).
 * The carousel has no list — one card is on screen — so there is nothing to keep
 * visible, and a dialog costs no layout.
 */
export function openIdeaArticle({ briefId }) {
  const brief = getBriefById(briefId);
  if (!brief) return;
  openShell(
    "idea-article",
    { briefId },
    {
      title: brief.headline,
      sub: researchArticleSub(brief),
      wide: true,
      body: renderResearchArticle(brief),
      foot: renderUseButtons(brief),
    },
  );
}

// ─── 6. Past versions of an article ────────────────────────────────────────
//
// A topic gets rewritten when a re-scan changes what the evidence says. The card
// marks that with an Updated badge and the timeline records that it happened; this
// is where you read what actually changed.
//
// Version state is module-level for the same reason the strategy dialog's is: each
// pick re-renders through openShell, which rebuilds the dialog, so the selection
// has to outlive the paint.
let versionBriefId = null;
let versionPickedId = null;
// Where to go back to, when this was opened from the article dialog. Module-level for
// the same reason the selection is: paintVersions re-renders the whole shell on every
// pick, so it has to outlive the paint.
let versionFrom = null;

export function openVersionHistory({ briefId, from = null }) {
  const brief = getBriefById(briefId);
  if (!brief) return;
  const versions = getBriefVersions(briefId);
  if (!versions.length) return;
  versionBriefId = briefId;
  versionFrom = from;
  // Opens on the CURRENT version — the first row, since the picker is newest-first.
  // It is the baseline: you compare an older draft against what the article says
  // now, so the dialog starts by showing you what "now" is, and every step down the
  // list is a step back from a known position. It also puts the default selection
  // on the row nearest the trigger that opened it.
  //
  // The trade, stated because it is real: the footer's action starts DISABLED, since
  // using the current version is what the card's own Use-in-chat already does. On
  // open, Close is the only enabled button. That is the honest reading of this state
  // — there is nothing to take into a chat that the card doesn't already offer — and
  // picking any other row enables it immediately.
  //
  // (This opened on the most recent PAST version until asked otherwise, on the
  // argument that landing on what the panel behind already shows looks like nothing
  // happened. Current-as-baseline is the stronger reading; noted so the swap isn't
  // mistaken for an oversight.)
  const current = versions.find((v) => v.isCurrent);
  versionPickedId = (current || versions[versions.length - 1]).id;
  paintVersions();
}

function paintVersions() {
  const brief = getBriefById(versionBriefId);
  if (!brief) return;
  // Two orders, deliberately, and they are not interchangeable:
  //   chrono  — oldest → current, the order the article was actually written in.
  //             This is what "Version 3 of 5" counts, because a version's number is
  //             a fact about when it was written and must not change with how the
  //             list happens to be sorted.
  //   ordered — newest → oldest, the order the picker shows. Most recent first is
  //             what a reader reaches for: the interesting comparison is against
  //             what the article says NOW, not against its first draft.
  const chrono = getBriefVersions(versionBriefId);
  const ordered = [...chrono].reverse();
  const picked = ordered.find((v) => v.id === versionPickedId) || ordered[0];
  const idx = chrono.indexOf(picked);
  const label = (v) => `${v.when}${v.isCurrent ? " · current" : ""}`;

  openShell(
    "versions",
    { briefId: versionBriefId },
    {
      title: "Past versions",
      // "Topic:" is a fixed label, present whatever the headline says. The headline
      // alone was ambiguous in this dialog specifically: the title above it reads
      // "Past versions", so an unlabelled sentence underneath could be taken for
      // the name of a version rather than the topic all five belong to.
      //
      // Prefixed HERE, not in the shell. .research-modal__sub is shared by nine
      // openShell calls and carries something different in each — a connector's
      // name, a Playbook's name, a topic count, an outright question ("Which
      // Playbook do you want topics from?"). Labelling the slot itself would print
      // "Topic: Agorapulse" over a Playbook and "Topic: Which Playbook…" over a
      // picker.
      sub: `Topic: ${brief.headline}`,
      wide: true,
      back: versionFrom,
      body: html`<div class="research-versions">
        <!-- The DS Select, built as the details/summary composition it actually is
             (see the long note in the strategy dialog above for why a native
             <select class="ap-select"> is drift). Options are dates, NEWEST FIRST
             — the current Topic leads, then back through the rewrites. The
             version NUMBERS below stay chronological; see the note on the two
             orders above. -->
        <div class="ap-form-field research-versions__field">
          <label id="versionPickLabel">Version</label>
          <details class="ap-select">
            <summary class="ap-select-trigger" aria-labelledby="versionPickLabel">
              <span class="ap-select-value">${label(picked)}</span>
              <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
            </summary>
            <div class="ap-select-dropdown">
              <div class="ap-select-options">
                ${raw(
                  ordered
                    .map(
                      (v) =>
                        html`<div
                          class="ap-select-option${raw(v.id === picked.id ? " selected" : "")}"
                          data-version-pick="${escapeAttr(v.id)}"
                        >
                          <span class="ap-select-option-text">${label(v)}</span>
                          ${raw(
                            v.id === picked.id
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
        </div>

        <!-- Which of how many, in words. The picker shows a date; this says where
             that date sits in the sequence, which a date alone doesn't tell you.
             Counted on the chronological order, so version 1 is always the first
             draft however the picker above is sorted. -->
        <p class="research-versions__pos">
          Version ${String(idx + 1)} of
          ${String(chrono.length)}${raw(picked.isCurrent ? " — the version you are reading" : "")}
        </p>

        <!-- The DS infobox, in its documented anatomy. This was built without the
             .ap-infobox-texts wrapper and it showed: .ap-infobox-content switches to
             a ROW at 588px and up, so the title and the message became the two row
             items and the title wrapped in a squeezed column beside the text.
             .ap-infobox-texts is the width:100% wrapper the two are meant to stack
             inside; the row layout is for content-plus-action-button.

             Three more corrections from the same spec: .has-title is required
             whenever .ap-infobox-title is present (it re-aligns the icon to the
             top), the info variant's icon is ap-icon-info_fill rather than
             ap-icon-info, and the body is .ap-infobox-message rather than a bare
             paragraph. -->
        ${raw(
          picked.whatChanged
            ? html`<div class="ap-infobox info has-title research-versions__changed">
                <i class="ap-icon-info_fill" aria-hidden="true"></i>
                <div class="ap-infobox-content">
                  <div class="ap-infobox-texts">
                    <span class="ap-infobox-title">What changed in this version</span>
                    <span class="ap-infobox-message">${picked.whatChanged}</span>
                  </div>
                </div>
              </div>`
            : "",
        )}

        <section class="research-article">
          <h3 class="research-article__title">${picked.title}</h3>
          ${raw(picked.paragraphs.map((p) => html`<p>${p}</p>`).join(""))}
        </section>
      </div>`,
      // Matched to the topic card's "Use in chat", because it IS that action — same
      // verb, same destination, one surface further in. It was `primary orange` on
      // the argument that use-in-chat is the AI action; the card disagrees, and the
      // card is what the user sees first, so the card wins.
      //
      // .ap-button stroked blue is the DS component whose recipe the card hand-rolls
      // in .topics-use__main — white fill, electric-blue border, electric-blue-100
      // label, 14/800. Using the real class rather than copying that CSS also picks
      // up the hover, active, focus and disabled states the card's version never
      // declared, and corrects its border to the DS's electric-blue-60 (the card
      // sets -40).
      //
      // One label, one behaviour, every row — including the current version. It used
      // to disable itself there and read "This is the current version", on the
      // argument that the card's own Use-in-chat already covers that case. The
      // uniform version is better: a picker whose action changes meaning depending on
      // which row you are on makes the reader check the footer before trusting it,
      // and the dialog now OPENS on the current version, so the disabled state was
      // the first thing you met.
      //
      // Nothing downstream needed changing for it to be correct. attachBriefToChat
      // already branches on isCurrent — the current version attaches as the plain
      // Topic, with the topic's own summary and no date in the filename, which is
      // exactly what the card produces. So the two paths agree rather than
      // duplicating: same source, same id, arrived at from two surfaces.
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Close</span>
        </button>
        <button type="button" class="ap-button stroked blue" data-version-use="${escapeAttr(picked.id)}">
          <span>Use this version in chat</span>
        </button>`,
    },
  );
}

// The timeline of how this brief got to its current state. The brief's CURRENT
// status is appended as the final entry so the list always ends where the card
// says it is — an authored history that stopped one step short read as a bug.
function renderHistory(history, currentStatus, briefId = "") {
  const meta = findReviewStatus(currentStatus);
  // Used gets its own sentence. The other three statuses describe a state that is
  // still true, which "Currently X." says well; Used describes something that
  // already happened to the topic, and naming the action is what a history row is
  // for. Only this one is special-cased — the shape still covers New, Saved and
  // Ignored.
  const note = currentStatus === "used" ? "Used to draft a post" : `Currently ${meta ? meta.label : currentStatus}.`;
  const entries = [...history, { status: currentStatus, when: "now", note }];
  // Offered only when there IS more than one version. A link promising past
  // versions that opens a dialog holding one is worse than no link.
  //
  // .ap-link STANDALONE on a real <button>, with an icon. Three things the DS's
  // link guidance settles, and this had all three wrong first time:
  //
  //   • Element. It opens a dialog, so it is an action, and the guidance is
  //     explicit that the element must match the behaviour — <button> for an
  //     action, <a href> for navigation. It was an <a role="button" tabindex="0">,
  //     which is the "an <a> used as a button" anti-pattern by name.
  //   • Variant. `standalone` is the on-its-own action variant (the guidance's own
  //     examples are "see more" and "edit"); the default inline variant is for a
  //     link sitting inside a sentence and is underlined to match it. This is on
  //     its own line, so it is standalone. `small` keeps it at the density of the
  //     timeline it follows.
  //   • Icon. Standalone links are documented as highly recommending one, since
  //     dropping the underline takes away the affordance the text had on its own.
  //     ap-icon-history rather than the ap-icon-clock on the section label just
  //     above it — the same glyph twice in six lines reads as a repeat.
  //
  // It sits BELOW the timeline because it is the same subject continued: the
  // timeline says the topic changed, this is where you see what the change was.
  const versions = briefId ? getBriefVersions(briefId) : [];
  const past = versions.length ? versions.length - 1 : 0;
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
    ${raw(
      past > 0
        ? html`<button
            type="button"
            class="ap-link standalone small research-article__versions"
            data-brief-versions="${escapeAttr(briefId)}"
          >
            <i class="ap-icon-history" aria-hidden="true"></i>
            See past versions of this Topic
          </button>`
        : "",
    )}
  </section>`;
}

// ─── Shared wiring ─────────────────────────────────────────────────────────

function onPanelClick(event) {
  if (event.target.closest("[data-research-modal-close]")) {
    close();
    return;
  }
  // Back re-opens the article in the SAME shell rather than closing and reopening —
  // the dialog never leaves the screen, so it reads as going up a level rather than
  // as dismissing one thing and summoning another.
  if (event.target.closest("[data-research-modal-back]")) {
    const id = backTo;
    if (id) return openIdeaArticle({ briefId: id });
    return close();
  }
  if (!active) return;

  // The "See past versions" link inside the Full-article DIALOG. The feed's
  // article PANE renders the same markup and wires the same attribute in
  // research-feed.js — one link, two containers.
  const versionsLink = event.target.closest("[data-brief-versions]");
  if (versionsLink) {
    const id = versionsLink.dataset.briefVersions;
    // Opened from inside the article dialog, so it gets a way back to it. The feed's
    // pane wires the same attribute in research-feed.js WITHOUT a `from`, because
    // there the article is the page behind the dialog — there is nothing to go back
    // to that closing does not already do.
    return openVersionHistory({ briefId: id, from: active?.kind === "idea-article" ? id : null });
  }

  // The article dialog's three verbs. Deliberately the SAME semantics as
  // research-feed.js's handlers, because they are the same buttons: Use marks the
  // Topic used before navigating (the status has to change while this code
  // still runs), Save toggles and says so, Ignore hands over to the reason dialog.
  //
  // All three LEAVE this dialog: Use navigates, Ignore replaces the dialog's
  // contents, and Save closes. Save kept the dialog open for a while, on the
  // argument that the label flips to Remove from saved and the reader should see
  // it — but saving IS the decision, and holding a full-screen article open after
  // it asks the reader to close a thing they have finished with. The toast carries
  // the confirmation, and the flipped label is there on the card and in the feed
  // the moment they look.
  const useBtn = event.target.closest("[data-brief-use]");
  if (useBtn) {
    const id = useBtn.dataset.briefUse;
    setStatus(id, "used");
    close();
    return openBriefInChat(id);
  }
  const saveBtn = event.target.closest("[data-brief-save]");
  if (saveBtn) {
    const next = toggleSaved(saveBtn.dataset.briefSave);
    close();
    showToast(next === "saved" ? "Saved for later" : "Removed from saved");
    return;
  }
  const ignoreBtn = event.target.closest("[data-brief-ignore]");
  if (ignoreBtn) {
    return openIgnoreReason({ briefId: ignoreBtn.dataset.briefIgnore });
  }

  // "See all N posts", from the Full-article DIALOG. Same markup in the feed's
  // article pane, wired there — one link, two delegation roots, exactly like the
  // past-versions link above.
  const sourcesLink = event.target.closest("[data-brief-sources]");
  if (sourcesLink) {
    const id = sourcesLink.dataset.briefSources;
    return openSourcePosts({ briefId: id, from: active?.kind === "idea-article" ? id : null });
  }

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

  // ── Topic-picker step navigation ──────────────────────────────────────────
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
    showToast(`Exported ${n} ${n === 1 ? "Topic" : "Topics"} as CSV`);
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

  // ── Past versions ────────────────────────────────────────────────────────
  // Picking a version. The repaint is what closes the <details> and redraws the
  // body — the DS Select has no JS of its own to close it.
  const versionPick = event.target.closest("[data-version-pick]");
  if (versionPick) {
    versionPickedId = versionPick.dataset.versionPick;
    return paintVersions();
  }

  const versionUse = event.target.closest("[data-version-use]");
  if (versionUse) {
    const id = versionBriefId;
    const vid = versionUse.dataset.versionUse;
    close();
    // Used, exactly as the card's own Use-in-chat marks it. The status is a fact
    // about the TOPIC — whether this user has taken it into a chat — not about
    // which draft of the article they took, so an older version counts. Anything
    // else would leave a topic sitting at New after it had been acted on, and the
    // point of the status is to stop a triaged topic asking again.
    //
    // Before openBriefInChat, and that order matters: the call navigates, this
    // screen unmounts, and a setStatus after it would run against a store nobody
    // is listening to any more. Same reasoning as research-feed.js's handler.
    setStatus(id, "used");
    // Same entry point the topic card's Use-in-chat goes through, with a version
    // attached — so a version lands in a chat exactly the way a topic does, and
    // there is one definition of what "use in chat" means.
    openBriefInChat(id, { versionId: vid });
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
