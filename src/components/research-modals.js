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
import { findResearchSource, findReviewStatus } from "../research-catalog.js?v=8";
import { getBriefById, getBriefsForLane, ignoreBrief, setStatus } from "../briefs-store.js?v=24";
import { getLanes } from "../research-store.js?v=18";
import { getContextById } from "../contexts-store.js?v=55";
import { renderBriefCard } from "./brief-card.js?v=18";
import { renderSocialPostCard } from "./social-post-card.js?v=10";
import { showToast } from "./toast.js?v=20";

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

function openShell(kind, ctx, { title, sub = "", body, foot, wide = false }) {
  init();
  requestOpen(MODAL_ID, close);
  active = { kind, ctx };
  titleEl.textContent = title;
  subEl.textContent = sub;
  subEl.hidden = !sub;
  bodyEl.innerHTML = body;
  footEl.innerHTML = foot;
  panel.classList.toggle("research-modal--wide", wide);
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

export function openAddToStrategy({ briefId, playbookId, onConfirm = null }) {
  const brief = getBriefById(briefId);
  const ctx = getContextById(playbookId);
  const strategy = ctx?.strategy || {};
  const pillars = Array.isArray(strategy.pillars) ? strategy.pillars : [];

  openShell(
    "strategy",
    { briefId, onConfirm },
    {
      title: "Add to Content strategy",
      sub: ctx ? ctx.name : "",
      body: html`<div class="research-modal__preview">${brief ? brief.headline : ""}</div>
        <h4 class="research-modal__sub-head">Current content strategy overview</h4>
        ${raw(strategy.approach ? html`<p class="research-modal__lede">${strategy.approach}</p>` : "")}
        ${raw(
          pillars.length
            ? html`<ul class="research-modal__pillars">
                ${raw(
                  pillars
                    .map((p) => html`<li><strong>${p.title || p.name || ""}</strong> ${p.description || ""}</li>`)
                    .join(""),
                )}
              </ul>`
            : html`<p class="muted">No pillars yet.</p>`,
        )}`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-strategy-confirm>
          <span>Add to strategy</span>
        </button>`,
    },
  );
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
function renderTopicStep(ctx) {
  const groups = pickerLanes()
    .map((lane) => ({ lane, ...pickerSplit(lane.id) }))
    .filter((g) => g.shown.length || g.hiddenTrending.length);
  const shownTotal = groups.reduce((n, g) => n + g.shown.length, 0);
  const trending = groups.flatMap((g) => g.hiddenTrending);
  const pb = getContextById(pickerPlaybook);

  openShell("idea-picker", ctx, {
    title: "Pick a topic",
    sub: `${shownTotal} ${shownTotal === 1 ? "topic" : "topics"} in ${pb ? pb.name : "this Playbook"}`,
    // Wide, like step 1 and for the same reason: these are the feed's cards, and
    // the feed gives them a full column.
    wide: true,
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
                ${raw(trending.map((b) => pickerCard(b)).join(""))}
              </section>`
            : "") +
          groups
            .filter((g) => g.shown.length)
            .map(
              (g) =>
                html`<section class="research-pick__group">
                  <h4 class="research-pick__group-title">${g.lane.name}</h4>
                  ${raw(g.shown.map((b) => pickerCard(b)).join(""))}
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
function pickerCard(b) {
  return renderBriefCard(b, { source: findResearchSource(b.sourceId), variant: "picker" });
}

// ─── 7. Full research ──────────────────────────────────────────────────────

export function openFullResearch({ briefId }) {
  const brief = getBriefById(briefId);
  if (!brief) return;
  const source = findResearchSource(brief.sourceId);
  const posts = brief.posts || [];

  openShell(
    "full-research",
    { briefId },
    {
      title: brief.headline,
      // Drop the count entirely at zero rather than printing "0 posts", which
      // reads as a bug. A brief legitimately has no attached posts when its scan
      // returned topics without the underlying items — the lane built from the
      // Alliance Jiu Jitsu listening export is exactly that case.
      sub: [source ? source.name : "", posts.length ? `${posts.length} ${posts.length === 1 ? "post" : "posts"}` : ""]
        .filter(Boolean)
        .join(" · "),
      wide: true,
      body: html`<section class="research-article">
          <span class="research-article__label"><i class="ap-icon-sparkles" aria-hidden="true"></i> Full article</span>
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
        )}`,
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
    const { briefId, onConfirm } = active.ctx;
    setStatus(briefId, "used");
    close();
    if (onConfirm) onConfirm();
    showToast("Added to the Playbook's content strategy");
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
