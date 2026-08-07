// topics-card — one research brief, summarised, in a lane's feed.
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
import { findReviewStatus } from "../research-catalog.js?v=6";

// One line, not the paragraph this used to be. As a hover tooltip it could afford
// the full explanation; as a permanent menu row it just made the menu tall. The
// long version still exists where it is actually being decided — the infobox in
// the ignore-reason modal (research-modals.openIgnoreReason).
const IGNORE_HINT = "Kept out of your feed unless it trends well above its baseline.";

function renderStatusPill(status) {
  const meta = findReviewStatus(status);
  if (!meta) return "";
  return html`<span class="topics-status topics-status--${meta.id}">${meta.label}</span>`;
}

// The Updated counterpart. Same reasoning as the trending mark — text, never a
// pill — but menthol rather than the Archie orange: this says "the story moved",
// which matters less than "this is spiking", and it must not compete. Menthol is
// also the one calm DS family that is NOT an action colour in this app, so it
// cannot read as clickable the way electric-blue would.
function renderUpdatedMark() {
  return html`<span class="updated-mark">
    <i class="ap-icon-refresh" aria-hidden="true"></i>
    <span>Updated</span>
  </span>`;
}

function renderTrendingMark() {
  return html`<span class="trending-mark">
    <i class="ap-icon-arrow-up" aria-hidden="true"></i>
    <span>Trending</span>
  </span>`;
}

export function renderBriefCard(brief, { source = null, variant = "feed", menuOpen = false } = {}) {
  if (!brief) return "";
  const trendingPage = variant === "trending";
  const ignored = brief.status === "ignored";

  return html`<article
    class="topics-card${raw(brief.isTrending ? " topics-card--trending" : "")}"
    data-brief-id="${escapeAttr(brief.id)}"
  >
    <!-- The card body is ONE BUTTON opening the full read — and since the footer's
         "Full research" button was removed it is the ONLY way in, which is why it
         must stay a button and stay the whole text area. The actions sit
         outside it in a sibling footer. A button inside a button is invalid HTML
         and the browser resolves the nesting unpredictably, which is the same
         reason topic-card splits body from footer.

         It carries data-brief-research — the exact attribute the footer's "Full
         research" button already uses — so both screens' existing handlers pick
         it up with no new wiring.

         Everything inside is a <span>, not the h3/p it was: a button may only
         contain PHRASING content, so a heading or paragraph in here is invalid.
         topic-card made the same trade for the same reason. The classes are
         unchanged, so the styling carries over; the spans are given display:block
         in brief-card.css where they relied on being block elements. -->
    <button type="button" class="topics-card__body" data-brief-research="${escapeAttr(brief.id)}">
      <span class="topics-card__source-row">
        ${raw(
          source
            ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
                  ><i class="${source.icon}"></i></span
                ><span class="topics-card__source">${source.name}</span>`
            : "",
        )}
        <span class="topics-card__when">· ${brief.ageLabel}</span>
        <span class="topics-card__spacer"></span>
        ${raw(brief.isTrending ? renderTrendingMark() : "")}${raw(brief.isUpdated ? renderUpdatedMark() : "")}
        <!-- Status pill is ALWAYS shown in the feed and NEVER on the trending
             page — see the variant note at the top of this file. -->
        ${raw(trendingPage ? "" : renderStatusPill(brief.status))}
      </span>

      <span class="topics-card__headline">${brief.headline}</span>

      <span class="topics-card__summary" data-brief-summary>
        <strong class="topics-card__summary-label">Summary:</strong> ${brief.summary}
      </span>

      ${raw(
        brief.isTrending && brief.whyNow
          ? html`<span class="topics-card__whynow">
              <strong class="topics-card__whynow-label">Why now:</strong> ${brief.whyNow}
            </span>`
          : "",
      )}
      ${raw(
        brief.isUpdated && brief.whatChanged
          ? html`<span class="topics-card__changed">
              <strong class="topics-card__changed-label">What changed:</strong> ${brief.whatChanged}
            </span>`
          : "",
      )}
      ${raw(
        !trendingPage && ignored && brief.ignoreReason
          ? html`<span class="topics-card__reason">
              <span class="topics-card__reason-label">You ignored this:</span> ${brief.ignoreReason}
            </span>`
          : "",
      )}
    </button>

    <footer class="topics-card__foot">
      ${raw(trendingPage ? renderUseSingle(brief) : renderUseSplit(brief, menuOpen))}
    </footer>
  </article>`;
}

// Feed: a split button. The main segment drafts and marks Used; the chevron
// opens save / add-to-Playbook.
function renderUseSplit(brief, menuOpen) {
  const saved = brief.status === "saved";
  const ignored = brief.status === "ignored";
  return html`<span class="topics-use" data-brief-use-wrap="${escapeAttr(brief.id)}">
    <button type="button" class="topics-use__main" data-brief-use="${escapeAttr(brief.id)}">Use now</button>
    <button
      type="button"
      class="topics-use__toggle"
      data-brief-use-menu="${escapeAttr(brief.id)}"
      aria-haspopup="true"
      aria-expanded="${menuOpen ? "true" : "false"}"
      aria-label="More options for this topic"
    >
      <i class="ap-icon-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="topics-use__menu" data-brief-menu="${escapeAttr(brief.id)}" ${raw(menuOpen ? "" : " hidden")}>
      <button type="button" class="topics-use__item" data-brief-save="${escapeAttr(brief.id)}">
        <span class="topics-use__tile" aria-hidden="true"><i class="ap-icon-bookmark_fill"></i></span>
        <span>${saved ? "Remove from saved" : "Save for later"}</span>
      </button>
      <button type="button" class="topics-use__item" data-brief-strategy="${escapeAttr(brief.id)}">
        <span class="topics-use__tile" aria-hidden="true"><i class="ap-icon-target"></i></span>
        <span>Add to Playbook — Content strategy</span>
      </button>
      ${raw(
        // Ignore lives in here rather than beside Use now. It is the one
        // destructive-ish option on the card, and a menu is where the app already
        // puts those; out in the footer it sat at the same weight as the action
        // you actually want, which is backwards.
        //
        // Hidden once ignored — the action has been taken and a second press has
        // nothing to do. The tooltip that used to explain it does not survive the
        // move (a menu row cannot host a hover popover without fighting the menu's
        // own dismissal), so the explanation moves into the row's own description.
        ignored
          ? ""
          : html`<button
              type="button"
              class="topics-use__item topics-use__item--ignore"
              data-brief-ignore="${escapeAttr(brief.id)}"
            >
              <span class="topics-use__tile" aria-hidden="true"><i class="ap-icon-eye-off"></i></span>
              <span class="topics-use__item-text">
                <span>Ignore topic</span>
                <span class="topics-use__item-desc">${IGNORE_HINT}</span>
              </span>
            </button>`,
      )}
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
