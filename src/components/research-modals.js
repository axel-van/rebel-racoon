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

import { html, raw, escapeHtml } from "../utils.js?v=21";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { findResearchSource, findReviewStatus } from "../research-catalog.js?v=2";
import { getBriefById, ignoreBrief, setStatus } from "../briefs-store.js?v=3";
import { getContextById } from "../contexts-store.js?v=44";
import { renderSocialPostCard } from "./social-post-card.js?v=6";
import { showToast } from "./toast.js?v=20";

const MODAL_ID = "research";

let backdrop, panel, titleEl, subEl, bodyEl, footEl;
let initialized = false;
let active = null; // { kind, ctx } — what's currently open

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
      title: "Why did this research miss the mark?",
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
            This helps me tailor research to your needs. I'll keep this topic out of your feed unless it trends well
            above its usual volume baseline — so you still catch real spikes without noise from recurring topics.
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
      title: "Export content research",
      body: html`<p class="research-modal__lede">
          Export all ${count} research ${count === 1 ? "card" : "cards"} currently in your feed.
        </p>
        <label class="research-modal__radio is-selected">
          <input type="radio" name="researchExportFormat" checked />
          <span class="research-modal__radio-text">
            <strong>CSV spreadsheet</strong>
            <span>One row per research card, with source and status.</span>
          </span>
        </label>`,
      foot: html`<button type="button" class="ap-button stroked grey" data-research-modal-close>
          <span>Cancel</span>
        </button>
        <button type="button" class="ap-button primary blue" data-export-go>
          <span>Export ${count} ${count === 1 ? "card" : "cards"}</span>
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

// ─── 5. Full research ──────────────────────────────────────────────────────

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
                <p class="brief-card__whynow">
                  <strong class="brief-card__whynow-label">Why now:</strong> ${brief.whyNow}
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
              <span class="research-timeline__dot brief-status--${e.status}" aria-hidden="true"></span>
              <span class="research-timeline__body">
                <span class="brief-status brief-status--${e.status}">${m ? m.label : e.status}</span>
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

  if (event.target.closest("[data-ignore-submit]")) {
    const text = panel.querySelector("[data-ignore-text]");
    ignoreBrief(active.ctx.briefId, text ? text.value : "");
    const done = active.ctx.onDone;
    close();
    if (done) done();
    showToast("Brief ignored");
    return;
  }

  if (event.target.closest("[data-export-go]")) {
    const n = active.ctx.count;
    close();
    showToast(`Exported ${n} ${n === 1 ? "card" : "cards"} as CSV`);
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
