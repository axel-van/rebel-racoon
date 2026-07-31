// brief-card — one research brief, summarised, in a lane's feed.
//
// Pure render, no store reads: the screen resolves the source and passes it in,
// so the card stays a function of its arguments and can be rendered in the feed,
// the trending page or a modal without knowing where its data came from.
// Interaction is delegated — every hook is a data-* attribute.
//
//   renderBriefCard(brief, { source, variant }) → one card
//
// ── variant: "feed" | "trending" ────────────────────────────────────────────
// The trending page's cards are DELIBERATELY reduced: Use now becomes a single
// button with no dropdown, Ignore disappears, and so does the status pill. That
// page answers "what's spiking", not "what have I triaged" — showing triage
// controls there invites the user to work a queue that isn't one.
//
// ── Two signals that must never read as peers ───────────────────────────────
// A filled pill unambiguously means REVIEW STATUS in this app. Trending is
// therefore PLAIN TEXT with an icon, never a pill: as a pill it read as a fifth
// status, and trending is an independent boolean that coexists with all four.
//
// ── The trending accent is a border-top. This matters. ──────────────────────
// It started as an absolutely-positioned 4px span inside an overflow:hidden
// wrapper and caused three separate bugs: it clipped the Use-now dropdown, and
// because overflow:hidden zeroes a flex item's automatic minimum size, the
// column's default flex-shrink crushed the cards and cut their footers off.
// border-top + flex:0 0 auto (see research.css) is the fix — don't undo it.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { findReviewStatus } from "../research-catalog.js?v=1";

const IGNORE_TOOLTIP =
  "Ignored topics stay out of your feed unless they trend well above their usual " +
  "volume baseline — so you spot real spikes without noise from recurring topics.";

function renderStatusPill(status) {
  const meta = findReviewStatus(status);
  if (!meta) return "";
  return html`<span class="brief-status brief-status--${meta.id}">${meta.label}</span>`;
}

function renderTrendingMark() {
  return html`<span class="brief-trending">
    <i class="ap-icon-arrow-up" aria-hidden="true"></i>
    <span>Trending</span>
  </span>`;
}

export function renderBriefCard(brief, { source = null, variant = "feed", menuOpen = false } = {}) {
  if (!brief) return "";
  const trendingPage = variant === "trending";
  const ignored = brief.status === "ignored";

  return html`<article
    class="brief-card${raw(brief.isTrending ? " brief-card--trending" : "")}"
    data-brief-id="${escapeAttr(brief.id)}"
  >
    <div class="brief-card__source-row">
      ${raw(
        source
          ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
                ><i class="${source.icon}"></i></span
              ><span class="brief-card__source">${source.name}</span>`
          : "",
      )}
      <span class="brief-card__when">· ${brief.ageLabel}</span>
      <span class="brief-card__spacer"></span>
      ${raw(brief.isTrending ? renderTrendingMark() : "")}
      <!-- Status pill is ALWAYS shown in the feed and NEVER on the trending
           page — see the variant note at the top of this file. -->
      ${raw(trendingPage ? "" : renderStatusPill(brief.status))}
    </div>

    <h3 class="brief-card__headline">${brief.headline}</h3>

    <p class="brief-card__summary" data-brief-summary>
      <strong class="brief-card__summary-label">Summary:</strong> ${brief.summary}
    </p>

    ${raw(
      brief.isTrending && brief.whyNow
        ? html`<p class="brief-card__whynow">
            <strong class="brief-card__whynow-label">Why now:</strong> ${brief.whyNow}
          </p>`
        : "",
    )}
    ${raw(
      !trendingPage && ignored && brief.ignoreReason
        ? html`<p class="brief-card__reason">
            <span class="brief-card__reason-label">You ignored this:</span> ${brief.ignoreReason}
          </p>`
        : "",
    )}

    <footer class="brief-card__foot">
      ${raw(trendingPage ? renderUseSingle(brief) : renderUseSplit(brief, menuOpen))}
      ${raw(
        // Hidden entirely once ignored — the action has already been taken and
        // there is nothing for a second press to do.
        !trendingPage && !ignored
          ? html`<button
              type="button"
              class="ap-button stroked grey brief-card__ignore"
              data-brief-ignore="${escapeAttr(brief.id)}"
              title="${escapeAttr(IGNORE_TOOLTIP)}"
            >
              <span>Ignore brief</span>
            </button>`
          : "",
      )}
      <span class="brief-card__spacer"></span>
      <button type="button" class="ap-button stroked grey" data-brief-research="${escapeAttr(brief.id)}">
        <span>Full research</span>
      </button>
    </footer>
  </article>`;
}

// Feed: a split button. The main segment drafts and marks Used; the chevron
// opens save / add-to-Playbook.
function renderUseSplit(brief, menuOpen) {
  const saved = brief.status === "saved";
  return html`<span class="brief-use" data-brief-use-wrap="${escapeAttr(brief.id)}">
    <button type="button" class="brief-use__main" data-brief-use="${escapeAttr(brief.id)}">Use now</button>
    <button
      type="button"
      class="brief-use__toggle"
      data-brief-use-menu="${escapeAttr(brief.id)}"
      aria-haspopup="true"
      aria-expanded="${menuOpen ? "true" : "false"}"
      aria-label="More options for this brief"
    >
      <i class="ap-icon-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="brief-use__menu" data-brief-menu="${escapeAttr(brief.id)}" ${raw(menuOpen ? "" : " hidden")}>
      <button type="button" class="brief-use__item" data-brief-save="${escapeAttr(brief.id)}">
        <span class="brief-use__tile" aria-hidden="true"><i class="ap-icon-bookmark_fill"></i></span>
        <span>${saved ? "Remove from saved" : "Save for later"}</span>
      </button>
      <button type="button" class="brief-use__item" data-brief-strategy="${escapeAttr(brief.id)}">
        <span class="brief-use__tile" aria-hidden="true"><i class="ap-icon-target"></i></span>
        <span>Add to Playbook — Content strategy</span>
      </button>
    </div>
  </span>`;
}

// Trending page: one button, no dropdown. Nothing is hidden behind a chevron
// here because the two menu actions are triage, and this page isn't triage.
function renderUseSingle(brief) {
  // stroked blue, not filled: the feed's split button is white with a blue
  // border, and dropping the chevron shouldn't also promote the action. A column
  // of filled buttons down this page would read as nine primary actions.
  return html`<button type="button" class="ap-button stroked blue" data-brief-use="${escapeAttr(brief.id)}">
    <span>Use now</span>
  </button>`;
}
