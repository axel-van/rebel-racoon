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
import { findResearchSource, findReviewStatus } from "../research-catalog.js?v=22";
import {
  ageMinutes,
  getBriefById,
  getBriefVersions,
  getBriefsForLane,
  groupBriefsByAge,
  ignoreBrief,
  setStatus,
  briefTitle,
} from "../briefs-store.js?v=66";
// The article dialog's footer is the feed's footer — same component, same three
// verbs — so it comes from the same module rather than being re-written here.
import { renderUseButtons } from "./brief-card.js?v=71";
import { getLanes } from "../research-store.js?v=52";
// The scope the whole app hangs off — this modal reads it instead of asking.
import { getActivePlaybook, getActivePlaybookId } from "../active-playbook.js?v=63";
// pillars-store, not contexts-store: this is the Content-strategy pillar a topic
// gets FILED into, which is what decides whether it is ready to draft. The
// getPillars imported below from contexts-store is the older per-Playbook pillar
// list and a different object entirely.
import { pillarForBrief } from "../pillars-store.js?v=14";
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
} from "../contexts-store.js?v=81";
// No cycle: brief-flow reaches briefs-store / sources-stream / router, never back
// into this file. The version dialog goes through it rather than calling
// addReadySource directly so "use in chat" has one definition.
import { openBriefInChat } from "../brief-flow.js?v=40";
import { renderBriefCard } from "./brief-card.js?v=71";
import { renderEmptyState } from "./empty-state.js?v=1";
import { renderSocialPostCard } from "./social-post-card.js?v=43";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "research";

// The picker's "Trending, normally hidden" group — the counterpart to the feed's
// attention notice, and switched off with it. It surfaced ignored-but-trending
// topics that the picker's own ignored-exclusion would otherwise drop. One line
// to restore; pickerSplit and the group's render are both still below.
const SHOW_HIDDEN_TRENDING = false;

let backdrop, panel, headEl, titleEl, bodyEl, footEl, backEl;
let initialized = false;
let active = null; // { kind, ctx } — what's currently open
// Where the header's back button goes. Either a briefId — meaning "back to that
// Topic's article", which is what every caller meant when this was the only kind
// — or a { label, go } pair for a view that returns somewhere else. The picker's
// article returns to the LIST, which is not an article and has no id.
let backTo = null;
// Topic-picker state. Module-level because each step re-renders through openShell,
// which rebuilds the dialog — the step and the answer have to outlive that.
// No picker STEP any more: the rail's switcher answers "whose topics?" for the
// whole app, so the modal opens on the answer. The id is still held, because the
// answer is not always the rail's — a chat keeps the Playbook it was created in,
// and offering another brand's topics to it would file a Noba topic as a source
// in an Acme chat.
let pickerPlaybookId = null;
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
  <!-- Close is a sibling of the header, not a child of it — the DS's own shape.
       .ap-dialog-close is position:absolute against the dialog, and .ap-dialog-header
       reserves padding-right:64px so a title cannot run under it; the two never share
       a flex row. The Angular API says the same thing twice over: closable and
       headerVisible are independent inputs, so a dialog with no header still has
       its close button, in the same corner.

       Here it was an in-flow flex child of the head, and that inversion cost two
       patches. The three article views hide their header text, which used to mean
       .sr-only — position:absolute — on the title block, so the flex item doing the
       pushing left the flow and the button snapped to the top-LEFT corner; that
       needed a margin-left:auto. And an empty header still reserved a band, so it
       needed its padding shrunk. Out of the flow, both problems stop existing
       rather than being corrected. -->
  <button type="button" class="ap-icon-button ghost grey research-modal__close" data-research-modal-close aria-label="Close">
    <i class="ap-icon-close" aria-hidden="true"></i>
  </button>
  <header class="research-modal__head">
    <!-- The back button belongs to the HEADER, not to the body, because it navigates
         the dialog rather than the content — it says "this view sits inside
         something". Hidden unless the current view was opened from another one. -->
    <button type="button" class="ap-button ghost grey research-modal__back" data-research-modal-back hidden>
      <i class="ap-icon-chevron-left" aria-hidden="true"></i><span>Back to the topic</span>
    </button>
    <!-- Title only. The subtitle this used to carry is gone from every view — see
         openShell for what each one held and why the title now stands alone. -->
    <div class="research-modal__head-text">
      <h2 class="research-modal__title" id="researchModalTitle"></h2>
    </div>
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
  headEl = panel.querySelector(".research-modal__head");
  titleEl = panel.querySelector(".research-modal__title");
  bodyEl = panel.querySelector(".research-modal__body");
  footEl = panel.querySelector(".research-modal__foot");
  backEl = panel.querySelector("[data-research-modal-back]");

  // One delegated listener for every dialog's controls — the shell is shared, so
  // the wiring is too. Each branch reads `active` for its context.
  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("input", onPanelInput);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  initialized = true;
}

function isOpen() {
  return !!panel && !panel.hidden;
}

// `bareHead` drops the header entirely — see the three article views, whose BODY
// renders the title, so a header would print the same string directly above itself.
//
// It used to keep the header and put .sr-only on its text, because the dialog is
// labelled by that element. That is what made the header a band holding nothing,
// and it took the close button out of the flow with it. Now the header is simply
// not rendered — which is the DS's own answer (`headerVisible=false` is an input,
// independent of `closable`) — and the dialog is named with aria-label instead.
// An aria-labelledby pointing INTO a display:none subtree names nothing, so the
// swap is required rather than tidier: without it these three dialogs, the ones
// with the longest content, would be the nameless ones.
//
// No bareHead view passes `back`, and none can while the header owns that button:
// if one ever needs to, the back button moves out of the header the same way the
// close button just did.
function openShell(kind, ctx, { title, body, foot, wide = false, size = "", back = null, bareHead = false }) {
  init();
  requestOpen(MODAL_ID, close);
  active = { kind, ctx };
  titleEl.textContent = title;
  headEl.hidden = bareHead;
  if (bareHead) {
    panel.removeAttribute("aria-labelledby");
    panel.setAttribute("aria-label", title);
  } else {
    panel.removeAttribute("aria-label");
    panel.setAttribute("aria-labelledby", "researchModalTitle");
  }
  bodyEl.innerHTML = body;
  footEl.innerHTML = foot;
  // Normalised here so every call site can keep passing a bare briefId. Stored on
  // the shell rather than on the button so a view can be reopened without
  // re-deriving it.
  backTo =
    typeof back === "string" && back
      ? { label: "Back to the topic", go: () => openIdeaArticle({ briefId: back }) }
      : back || null;
  // Hidden with BOTH the attribute and inline display, deliberately. `.ap-button` sets
  // display: inline-flex, and a class rule beats the UA's [hidden] { display: none } —
  // so the attribute alone left the button on screen in every view, including the ones
  // opened from the feed's pane where there is nothing to go back to. The repo already
  // records this trap for .ap-select-not-found (UI-PATTERNS); this is the second case.
  // The attribute stays for assistive tech, the inline style is what actually hides it.
  if (backEl) {
    backEl.hidden = !backTo;
    backEl.style.display = backTo ? "" : "none";
    // The label is per destination: "Back to the topic" from a version list,
    // "Back to topics" from the picker's article. A back button that names the
    // wrong place is worse than one with no words at all.
    const backLabel = backEl.querySelector("span");
    if (backLabel && backTo) backLabel.textContent = backTo.label;
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
    title: briefTitle(brief),
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
// ONE STEP. It used to open on a grid of Playbooks — "whose topics?" — and only
// then show the list. That question has moved: the rail's switcher answers it for
// every surface in the app, permanently and visibly, so asking again inside a
// modal made the user state something they had already stated, and let the modal
// disagree with the rail. The step is gone; the subtitle names the brand, because
// a scope that hides has to stay legible on the surfaces it filters.
export function openIdeaPicker({ onPick, playbookId = null }) {
  pickerPlaybookId = playbookId || getActivePlaybookId();
  renderIdeaPicker({ onPick });
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
    shown: all.filter((b) => b.status !== "ignored" && isReadyToDraft(b)),
    // Empty while the exception is off, so the group below simply never renders.
    hiddenTrending: SHOW_HIDDEN_TRENDING ? all.filter((b) => b.status === "ignored" && b.isTrending) : [],
  };
}

function pickerLanes() {
  return getLanes().filter((lane) => !pickerPlaybookId || lane.playbookId === pickerPlaybookId);
}

// READY TO DRAFT only, by the feed's own rule: a "Topics for later" card is one
// no pillar has claimed, which is exactly the topic you are not ready to write
// from. Same predicate as research-feed.inSegment, deliberately — the composer
// and the feed disagreeing about what "ready" means would be worse than either
// answer on its own.
function isReadyToDraft(brief) {
  return !(brief.researchType === "content-strategy" && !pillarForBrief(brief.id));
}

function renderIdeaPicker(ctx) {
  return renderTopicStep(ctx);
}

// ── The list ───────────────────────────────────────────────────────────────
// Grouped BY AGE, exactly like the topic-list screen — same groupBriefsByAge,
// same AGE_GROUPS order, same .topics-agegroup chrome. It used to group by lane,
// which meant the one list in the app that shows the feed's cards sorted them by
// a different rule than the feed does; "3 days ago" is the thing you actually
// scan a topic list by, and the picker had no reason to disagree.
//
// The lane's NAME is gone from the cards too. It moved onto the meta line back
// when a Playbook could own several feeds and this was the one surface that
// spanned them — one feed per Playbook, and a picker scoped to one Playbook,
// means every card in this list now carries the same string. What does not change
// from row to row is not information. (Same reason the "Playbook › Topic feed"
// breadcrumb left the new-session cards.)
// The Playbook select, at the top of the picker's list.
//
// Same control as the Topic feed's topbar, part for part — .ap-select > summary
// .ap-select-trigger.composer-playbook__trigger with an inline label, and the same
// .research-playbook__dropdown that keeps the DS's downward `top: 100%` instead of the
// composer's upward `bottom: 100%`.
//
// ⚠️ It writes DIFFERENT state from the feed's, and the difference is deliberate.
// The feed's select is a view of the rail's global scope and calls
// setActivePlaybook(); this one writes `pickerPlaybookId`, which is module state this
// picker already owned. A picker is a transient lens for one pick: opening it from the
// composer, glancing at another brand's topics and having the rail, the feed, the
// pillar counters and the next new chat all follow you there is a side effect nobody
// asked for. It opens ON the active Playbook, so the default still agrees with the
// app; only browsing away from it stays local.
//
// This is also what the removed step-1 "Which Playbook do you want Topics from?" used
// to do, minus the step: same choice, no navigation, and the list is visible while you
// make it.
function renderPickerPlaybookSelect() {
  const playbooks = getContexts();
  const current = pickerPlaybookId ? getContextById(pickerPlaybookId) : getActivePlaybook();
  const items = playbooks
    .map((c) => {
      const isSel = current && c.id === current.id;
      return html`<div
        class="ap-select-option${raw(isSel ? " selected" : "")}"
        data-picker-playbook-pick="${escapeAttr(c.id)}"
        role="option"
        aria-selected="${isSel ? "true" : "false"}"
      >
        <span class="ap-select-option-text">${c.name}</span>
        ${raw(isSel ? html`<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");
  return html`<div class="research-pick__scope">
    <details class="ap-select research-playbook" data-picker-playbook>
      <summary class="ap-select-trigger composer-playbook__trigger" title="Choose the Playbook to pick a Topic from">
        <span class="ap-select-inline-label">Playbook</span>
        <span class="ap-select-value">${current ? current.name : "Select a playbook"}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown research-playbook__dropdown" role="listbox" aria-label="Choose a Playbook">
        <div class="ap-select-options">${raw(items)}</div>
      </div>
    </details>
  </div>`;
}

function renderTopicStep(ctx) {
  const lanes = pickerLanes().map((lane) => ({ lane, ...pickerSplit(lane.id) }));
  const shown = [];
  for (const g of lanes) shown.push(...g.shown);
  // Newest first inside a group, matching the feed's own sort.
  shown.sort((a, b) => ageMinutes(a.ageLabel) - ageMinutes(b.ageLabel));
  const ageGroups = groupBriefsByAge(shown);
  const shownTotal = shown.length;
  const trending = lanes.flatMap((g) => g.hiddenTrending);
  const pb = pickerPlaybookId ? getContextById(pickerPlaybookId) : getActivePlaybook();

  openShell("idea-picker", ctx, {
    title: "Pick a Topic",
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
    // The select leads the body in BOTH branches: an empty Playbook is exactly when
    // you need the way to another one, so hiding the control with the list would
    // strand the reader on the one Playbook that has nothing.
    body:
      renderPickerPlaybookSelect() +
      (shownTotal || trending.length
        ? (trending.length
            ? html`<section class="research-pick__group research-pick__group--trending">
                <h4 class="research-pick__group-title">Trending, normally hidden</h4>
                <p class="research-pick__group-note">
                  You ignored ${trending.length === 1 ? "this one" : "these"}, but
                  ${trending.length === 1 ? "it is" : "they are"} running above baseline again.
                </p>
                ${raw(trending.map((b) => pickerCard(b)).join(""))}
              </section>`
            : "") +
          ageGroups
            .map(
              ({ group, briefs }) =>
                html`<section class="topics-agegroup">
                  <h4 class="topics-agegroup__label">${group.label}</h4>
                  ${raw(briefs.map((b) => pickerCard(b)).join(""))}
                </section>`,
            )
            .join("")
        : html`<p class="research-pick__empty muted">
            Nothing ready to draft in this Playbook. Topics parked for later show up here once they are linked to a
            content pillar.
          </p>`),
    // One button. The back to Playbooks went with the step it returned to.
    foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
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
// The full read, INSIDE the picker.
//
// The card used to pick on click, which asked the reader to choose a topic from
// two clamped lines of summary — the same trade the feed refused when it gave
// every card an article pane. Here the card opens the article in the shell it is
// already in, and the pick moves to the article's footer: read, then decide.
//
// It reuses the article dialog's own body (renderResearchArticle) and its `wide`
// width, so the picker's full read and the feed's full read are the same document
// rather than two that drift. The one difference is the header's back button,
// which returns to the LIST — the reason openShell's `back` had to stop meaning
// "a briefId" and start meaning "a destination".
function renderPickerArticle(ctx, brief) {
  openShell("idea-article-picker", ctx, {
    title: briefTitle(brief),
    // The LIST's width, not the article's 768. The dialog jumped 62px wider when a
    // topic opened and back when you returned — one dialog, growing and shrinking
    // under a back button, reads as two. 706 is the topic card plus the body's own
    // padding, so both steps are sized to what the body actually holds; the prose
    // gets a 666px measure, which is nearer a reading measure than 728 was anyway.
    size: "topics",
    // No header title here: the article's own title is the heading (see
    // renderResearchArticle), and with briefTitle() they are now the SAME string —
    // so a header would have printed it twice, directly above itself.
    bareHead: true,
    body: renderResearchArticle(brief),
    // data-idea-pick, NOT the article dialog's data-brief-use: both end at
    // openBriefInChat, but only this one goes through the picker's own onPick,
    // which is the contract the caller passed in.
    foot: html`<button type="button" class="ap-button primary orange" data-idea-pick="${escapeAttr(brief.id)}">
        <span>Use in chat</span>
      </button>
      <button type="button" class="ap-button stroked grey" data-research-modal-close><span>Close</span></button>`,
    back: { label: "Back to topics", go: () => renderIdeaPicker(ctx) },
  });
}

function pickerCard(b) {
  return renderBriefCard(b, { source: findResearchSource(b.sourceId), variant: "picker" });
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
  // ── A "Topics for later" topic has no write-up, and says so ───────────────
  // The two routes mean two different things about the same scan. A Draft-ready topic
  // was written up because the scan gave enough to write from; a Topics-for-later one
  // was not, and printing four paragraphs of prose for it would present the same
  // artefact for both — the reader could not tell which they were holding, and would
  // draft from a write-up the model never actually stood behind.
  //
  // So the body becomes an empty state that names the gap, and the rest of the pane
  // stays exactly as it is: Topic Relevance still says how much backed it and why now,
  // the history still says when it arrived, and Sources still lists the posts. Those
  // are what the scan DID produce, and they are what a reader needs to judge whether
  // their own assets close the distance.
  //
  // The two ways out are the two that actually exist: bring assets to it in a chat
  // (the pane's own primary, "Use in chat"), or leave it for a later run to grow. No
  // third invented affordance, and no button of its own here — the footer's primary is
  // the action this copy names, and a second orange button two inches above it would
  // be the same verb asking twice.
  const later = brief.researchType === "content-strategy";
  const bodySection = later
    ? renderEmptyState({
        icon: "ap-icon-note",
        title: "Not enough data to write a detailed version yet",
        body:
          "There's not enough content or assets around this topic to create a draft yet. " +
          "Use the topic in chat if you have assets that fill the gaps, or leave it here and let a future run add more details.",
        wrapperClass: "research-article__empty",
      })
    : html`${raw(withTitle ? html`<h3 class="research-article__title">${brief.research?.title || ""}</h3>` : "")}
      ${raw(renderArticleBody(brief.research))}`;

  return html`<section class="research-article">
      ${raw(
        withLabel
          ? html`<span class="research-article__label"
              ><i class="ap-icon-sparkles" aria-hidden="true"></i> Full Topic</span
            >`
          : "",
      )}
      ${raw(bodySection)}
    </section>
    ${raw(renderTopicRelevance(brief))} ${raw(renderHistory(brief.history || [], brief.status, brief.id))}
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

// ── Topic Relevance ────────────────────────────────────────────────────────
// What the scan judged about this topic, before the article argues anything: how
// much of the scan backed it (Volume), who feels it (Relevance), and why it landed
// in this window (Why now). All three come from the listening-insights export, and
// they are the model's judgement of the TOPIC rather than the article's argument —
// which is why they sit in their own section above the prose.
//
// It renders for EVERY topic that has any of the three. That is a change from the
// section this replaces: "Trend levels" was gated on the attention BOOLEANS and so
// appeared only on a spike or a rewrite, which meant the volume and relevance of an
// ordinary topic had nowhere to go.
//
// ── The highlight is the signal, and only the signal ──────────────────────
// Tint carries meaning here, so it is spent only where a signal justifies it:
//
//   trending → Why now in .topics-card__whynow (peach + orange rule). It used to tint
//              Volume as well, on the argument that a spike is a claim about volume in
//              a moment; with Volume gone the reason row carries the signal alone.
//   updated  → Why now in .topics-card__changed (menthol + green rule).
//   neither  → nothing tinted. An ordinary topic's rows are information, and tinting
//              them would spend the spike's colour on a topic with no spike.
//
// Reuses the card's own two blocks rather than inventing a third treatment: they are
// the coloured left rules the card used to own, warm for a spike and cool for a
// rewrite, and moving the markup does not make them a new component. Neither carries
// the card's inner clamp, so both read in full.

function renderTopicRelevance(brief) {
  const trending = !!brief.isTrending;
  const updated = !!brief.isUpdated;
  const rows = [];

  // ── Two rows: Relevance, then Why now ─────────────────────────────────────
  // Relevance says who the topic is for and is the one that decides whether to read on
  // at all; Why now says what put it in front of you.
  //
  // Volume was the third and is gone. It was one word — high / medium / low — and the
  // only row here that measured the scan rather than describing the topic, so it read
  // as a statistic parked among sentences. What it was actually good for is already
  // said better elsewhere: Why now names the concentration in words ("14 items, every
  // major competitor inside thirty days") and Sources lists the posts to count.
  // `brief.volume` still exists on the seeded topics and now has no reader.

  if (brief.relevance) {
    // Never tinted, under any signal: relevance is who the topic is for, which does
    // not change because the pile grew or the story moved.
    rows.push(
      html`<p class="research-relevance__row">
        <strong class="research-relevance__label">Relevance:</strong> ${brief.relevance}
      </p>`,
    );
  }

  if (brief.whyNow) {
    const cls = trending ? "topics-card__whynow" : updated ? "topics-card__changed" : "research-relevance__row";
    const labelCls = trending
      ? "topics-card__whynow-label"
      : updated
        ? "topics-card__changed-label"
        : "research-relevance__label";
    rows.push(html`<p class="${cls}"><strong class="${labelCls}">Why now:</strong> ${brief.whyNow}</p>`);
  }

  // ── Two rows, and nothing else ────────────────────────────────────────────
  // Three things used to render here and all three are gone: "What changed", which
  // narrated a rewrite between two runs; whyNowDetail, authored prose elaborating a
  // claim the row above had already made; and Volume, a one-word measurement of the
  // scan among sentences about the topic. What is left describes the topic — who it is
  // for, and why it landed now.
  //
  // `updated` still decides the TINT on Why now (menthol rather than peach), which is
  // the whole of what the rewrite signal needs to say here — the row it colours is the
  // reason, and the reason is the field.
  //
  // Neither field is deleted from the data. `whatChanged` still seeds the
  // Add-to-strategy textarea and the pillar-picker infobox below, so it is live
  // elsewhere; `whyNowDetail` now has no reader at all and is dead seed data.

  if (!rows.length) return "";
  return html`<section class="research-article">
    <!-- ap-icon-target, not the arrow-up this section carried as "Trend levels". The
         arrow was the Trending badge's own glyph and belonged to a section that only
         appeared on a spike; this one appears on every topic, so a glyph that means
         "this is what it is worth" beats one that means "this is rising". -->
    <span class="research-article__label"><i class="ap-icon-target" aria-hidden="true"></i> Topic Relevance</span>
    ${raw(rows.join(""))}
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

// researchArticleSub() lived here — source name + post count, the article's own
// subtitle. It went with the subtitle slot itself: its three callers were the three
// article views, which are `bareHead` and have not rendered a header at all since
// the close button moved out of it, so it was already computing a string nobody
// saw. The card in the feed still names its source and its post count, which is
// where a reader looks for both.

export function openFullResearch({ briefId }) {
  const brief = getBriefById(briefId);
  if (!brief) return;

  openShell(
    "full-research",
    { briefId },
    {
      title: briefTitle(brief),
      wide: true,
      // Same reason as the picker's: the body renders the title, and it is now the
      // same string the header carried.
      bareHead: true,
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
 * carousel, where the reader is deciding what to DO with the Topic — so it carries
 * the feed pane's own footer, renderUseButtons, and the primary cannot drift
 * between the two surfaces.
 *
 * `dismiss: "close"` is the one difference. In the pane the alternative to using a
 * Topic is ignoring it, because the list is right there and the reader is triaging.
 * In this dialog the article IS the screen, so the alternative is leaving — and
 * every other dialog here puts Close in that slot.
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
      title: briefTitle(brief),
      wide: true,
      bareHead: true,
      body: renderResearchArticle(brief),
      foot: renderUseButtons(brief, { dismiss: "close" }),
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
      // "Past versions" of WHAT is no longer said in the header — the subtitle that
      // carried "Topic: <headline>" is gone from every view. The list below names
      // each version, and this dialog is only ever reached from the topic itself
      // (the back button says so), so the topic is the thing you just left rather
      // than something the header has to re-state.
      title: "Past versions",
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
  // The "See past versions" link that used to close this section is gone with the V1
  // trim — the tombstone inside the section below records what it was and how to put
  // it back. The DS reasoning it carried is worth keeping wherever a standalone link
  // lands next: <button> for an action and <a href> for navigation, `standalone` for a
  // link on its own line rather than inside a sentence, and an icon with it, since
  // dropping the underline takes away the affordance the text had.
  return html`<section class="research-article">
    <span class="research-article__label"><i class="ap-icon-clock" aria-hidden="true"></i> Topic history</span>
    <!-- ── The DS Status component, and nothing hand-built around it ───────────
         This list used to draw three things the DS already ships. All three are gone:
           • .topics-status — a hand-rolled pill (3px 10px, radius 24, 11px/800,
             uppercase, four hardcoded --ref-color fills) that re-created .ap-status.
             The three review statuses map 1:1 onto its variants, so nothing was
             gained by drawing it: grey / blue / red, from statusColor in
             research-catalog.js.
           • .research-timeline__dot — a 22px circle with a 3px white ring, filled
             with the PILL's background token. .ap-status carries its own 8px dot by
             default, coloured from --comp-status-*-dot-background-color, so the app's
             version was a second drawing of one idea in the wrong colour.
           • the row's ::before rail — a 2px connector at left:10px, top:22px, every
             number derived from that dot's geometry, so the dot could not change size
             without silently breaking the line. It carried no meaning the <ol> and the
             dates do not already carry.
         What is left is one flex row per entry. The <ol> stays: this is an ordered
         sequence of events and the markup should say so. -->
    <ol class="research-timeline">
      ${raw(
        entries
          .map((e) => {
            const m = findReviewStatus(e.status);
            return html`<li class="research-timeline__row">
              <span class="ap-status ${m && m.statusColor ? m.statusColor : "grey"}">${m ? m.label : e.status}</span>
              <span class="research-timeline__when">${e.when}</span>
              <span class="research-timeline__note">${e.note}</span>
            </li>`;
          })
          .join(""),
      )}
    </ol>
    <!-- The "See past versions of this Topic" link is GONE (V1 scope), with its
         handler in research-feed. openVersionHistory() below is still exported and
         still works — it is simply unreachable, so restoring the link is one block
         here plus one handler there.
         What it was: .ap-link standalone small with ap-icon-history, rendered only
         when a topic had more than one version, sitting under the timeline because
         it continued the same subject — the timeline says the topic changed, that
         link showed what the change was. V1 ships the fact of the change without
         the diff behind it. -->
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
    const dest = backTo;
    if (dest && typeof dest.go === "function") return dest.go();
    return close();
  }
  if (!active) return;

  // Picking a Playbook in the topics picker. Local to the picker (pickerPlaybookId),
  // never the global scope — see renderPickerPlaybookSelect for why — and it re-renders
  // the step in place so the list under the trigger simply becomes the new Playbook's.
  const pickerPb = event.target.closest("[data-picker-playbook-pick]");
  if (pickerPb) {
    const details = pickerPb.closest("[data-picker-playbook]");
    if (details) details.open = false;
    pickerPlaybookId = pickerPb.dataset.pickerPlaybookPick;
    return renderTopicStep(active.ctx);
  }

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

  // The picker card's body: open the full read in this same dialog.
  const read = event.target.closest("[data-idea-read]");
  if (read) {
    const brief = getBriefById(read.dataset.ideaRead);
    if (brief) renderPickerArticle(active.ctx, brief);
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
    const topic = brief ? { briefId, headline: briefTitle(brief), when: brief.ageLabel } : null;
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
