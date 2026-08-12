// topics-card — one research brief, summarised, in a lane's feed.
//
// Pure render, no store reads: the screen resolves the source and passes it in,
// so the card stays a function of its arguments and can be rendered in the feed,
// the trending page or a modal without knowing where its data came from.
// Interaction is delegated — every hook is a data-* attribute.
//
//   renderBriefCard(brief, { source, variant }) → one card
//
// ── variant: "feed" | "trending" | "picker" ─────────────────────────────────
// The trending page's cards are DELIBERATELY reduced: Use in chat becomes a single
// button with no dropdown, Ignore disappears, and so does the status pill. That
// page answers "what's spiking", not "what have I triaged" — showing triage
// controls there invites the user to work a queue that isn't one.
//
// "picker" is the Pick-a-topic modal. It has NO footer at all, because in a
// picker the card IS the control — the body button, which everywhere else opens
// the full read, carries data-idea-pick instead. Everything above the footer is
// identical to the feed on purpose: the modal used to show a compact one-line
// row of its own, so the thing you picked looked nothing like the thing you had
// been reading two seconds earlier.
//
// ── Two signals that must never read as peers ───────────────────────────────
// A filled pill unambiguously means REVIEW STATUS in this app. Trending is
// therefore PLAIN TEXT with an icon, never a pill: as a pill it read as a fifth
// status, and trending is an independent boolean that coexists with all four.
//
// ── A trending card has no frame accent, and never had a span ───────────────
// Trending cards once carried a peach border plus a 4px orange rail on top.
// Both are gone: the signal lives inside the card, in the "Trending" mark and
// the orange-railed "Why now" block, which is how Updated already worked. Two
// signals, one grammar.
//
// The history still matters if an accent ever comes back. It began as an
// absolutely-positioned 4px span inside an overflow:hidden wrapper and caused
// three bugs: it clipped the Use-in-chat dropdown, and because overflow:hidden
// zeroes a flex item's automatic minimum size, the column's default flex-shrink
// crushed the cards and cut their footers off. A border is the only safe way to
// draw one. flex:0 0 auto in research.css is the other half of that fix and is
// still load-bearing — don't undo it.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { findReviewStatus, findResearchType, typeTagColor } from "../research-catalog.js?v=14";

// No full stop — it is a caption on a menu row, not a sentence. This started as a
// paragraph, became one line, and is now the shortest thing that still carries the
// rule: ignoring is not deleting, and a spike overrides it.
//
// "this list", not "feed": the user is standing in ONE topic list when they read
// it, and that is the scope of what ignoring does. "Feed" was ambiguous with the
// /topics feed, which is a different surface with a different object in it.
// "Baseline" went earlier for length; the full version still lives where the
// decision is actually made — the infobox in the ignore-reason modal
// (research-modals.openIgnoreReason).
const IGNORE_HINT = "Kept off this list unless trending or updated";

// The ROUTE, as a DS Tag.
//
// Why a tag and not a second pill: choosing-components.md §1 draws the line by
// how much of the object the marker describes. A marker that is single and
// describes the whole row is a Status; one of several classifiable markers that
// coexist is a Tag. Review status is the former — one value, whole card. The
// route is the latter: it coexists with all four statuses and with both
// attention signals, so three markers can sit in this row at once.
//
// Both types are labelled. Tagging only the exception was tried and reverted: with
// exactly two types, the tag is what tells you which action the footer offers, and
// reading that off an ABSENCE costs more than the extra chip saves.
//
// A <span>, not a <button>: tag.md says a static tag is a span and only a
// clickable one is a button. Rerouting lives in the footer menu, not here — a
// clickable tag inside the card's body button would be a button in a button,
// the same invalid nesting the body/footer split exists to avoid.
function renderRouteTag(researchType) {
  const meta = findResearchType(researchType);
  if (!meta) return "";
  return html`<span class="ap-tag ${typeTagColor(researchType)} topics-card__route">${meta.label}</span>`;
}

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

export function renderBriefCard(
  brief,
  { source = null, variant = "feed", menuOpen = false, laneName = "", articleOpen = false } = {},
) {
  if (!brief) return "";
  const trendingPage = variant === "trending";
  const picker = variant === "picker";
  const feed = !trendingPage && !picker;
  const ignored = brief.status === "ignored";

  return html`<article
    class="topics-card${raw(picker ? " topics-card--picker" : "")}${raw(articleOpen ? " is-reading" : "")}"
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
         it up with no new wiring. In the picker it carries data-idea-pick
         instead: same button, different verb, because there the card is the
         control rather than a way into the full read.

         Everything inside is a <span>, not the h3/p it was: a button may only
         contain PHRASING content, so a heading or paragraph in here is invalid.
         topic-card made the same trade for the same reason. The classes are
         unchanged, so the styling carries over; the spans are given display:block
         in brief-card.css where they relied on being block elements. -->
    <!-- aria-expanded, because this button DISCLOSES the article pane beside the
         list — and because the selected state must not be carried by colour
         alone. The is-reading class on the article is only the paint. -->
    <button
      type="button"
      class="topics-card__body"
      ${raw(picker ? `data-idea-pick="${escapeAttr(brief.id)}"` : `data-brief-research="${escapeAttr(brief.id)}"`)}
      ${raw(picker ? "" : `aria-expanded="${articleOpen ? "true" : "false"}"`)}
    >
      <span class="topics-card__source-row">
        ${raw(
          source
            ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
                  ><i class="${source.icon}"></i></span
                ><span class="topics-card__source">${source.name}</span>`
            : "",
        )}
        <!-- The lane, picker only. The feed and the attention page are already
             inside one lane, so naming it there would be noise; the picker spans
             every lane a Playbook owns, and grouping by age (not by lane) is
             what took the lane headings away. -->
        ${raw(laneName ? html`<span class="topics-card__lane">· ${laneName}</span>` : "")}
        <span class="topics-card__when">· ${brief.ageLabel}</span>
        <!-- The route sits on the LEFT of the meta run, with the source and the
             age. The left side answers "what is this"; the right side, past the
             spacer, answers "where am I with it" — signals then status. Putting
             the tag on the right would have made it the fourth chip in a huddle
             and implied it was another thing the user had done. Feed only: the
             attention page shows no triage controls and the picker's card IS a
             control, so neither needs to be told which queue a topic is in. -->
        ${raw(feed ? renderRouteTag(brief.researchType) : "")}
        <span class="topics-card__spacer"></span>
        ${raw(brief.isTrending ? renderTrendingMark() : "")}${raw(brief.isUpdated ? renderUpdatedMark() : "")}
        <!-- Status pill is ALWAYS shown in the feed and NEVER on the trending
             page — see the variant note at the top of this file. -->
        ${raw(trendingPage ? "" : renderStatusPill(brief.status))}
      </span>

      <span class="topics-card__headline">${brief.headline}</span>

      <!-- No "Summary:" label. Every card carried it, so it labelled nothing —
           the two-line block under a headline is self-evidently the summary, and
           the word ate a chunk of the first of only two visible lines. -->
      <span class="topics-card__summary" data-brief-summary>${brief.summary}</span>

      ${raw(
        brief.isTrending && brief.whyNow
          ? html`<span class="topics-card__whynow">
              <!-- The clamp is on an INNER span, and here that is doing two jobs.
                   First, the padding trap: a -webkit-line-clamp element clips at
                   its PADDING box, so clamping the tinted block itself would
                   render a third line into its 11px bottom padding — truncated
                   and still perfectly readable, the worst of both. Same reason
                   __changed-clamp exists.

                   Second, and specific to Why-now: this same class is reused by
                   the FULL ARTICLE (research-modals.renderResearchArticle), where
                   the whole point is to read everything. Putting the clamp on
                   .topics-card__whynow would have truncated the text in the one
                   place the user went to see all of it. The article renders no
                   inner span, so it stays unclamped for free. -->
              <span class="topics-card__whynow-clamp">
                <strong class="topics-card__whynow-label">Why now:</strong> ${brief.whyNow}
              </span>
            </span>`
          : "",
      )}
      ${raw(
        brief.isUpdated && brief.whatChanged
          ? html`<span class="topics-card__changed">
              <!-- The clamp goes on an INNER span, not on the tinted block. A
                   -webkit-line-clamp element clips at its PADDING box, so with
                   the block's own 11px bottom padding a third line rendered into
                   that strip below the ellipsis — truncated and still visible.
                   Clamping a child that has no padding puts the clip where the
                   text ends. -->
              <span class="topics-card__changed-clamp">
                <strong class="topics-card__changed-label">What changed:</strong> ${brief.whatChanged}
              </span>
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

    <!-- No footer in the picker: the body button already picks, so a row of
         actions underneath would be a second, different answer to the same
         click. -->
    ${raw(
      picker
        ? ""
        : html`<footer class="topics-card__foot">
            ${raw(trendingPage ? renderUseSingle(brief) : renderUseSplit(brief, menuOpen))}
          </footer>`,
    )}
  </article>`;
}

// Feed: a split button. The main segment carries the action the topic's ROUTE
// implies; the chevron opens the rest.
//
// ── The main segment is not one verb any more ───────────────────────────────
// A Ready-to-post topic can go to a writer, so the default is Use in chat. A
// Needs-assets topic cannot — its blocker is a commitment, a shoot or a customer
// who will go on record — so its default is Add to strategy. This is the whole
// point of Option B: the route stops being a label you read and becomes the
// button you press, which is the only version of it that changes what happens.
//
// Neither action is ever hidden. A Content-strategy card keeps "Use in chat
// anyway" as its first menu row, and that row IS the correction — there is no
// separate "reroute this topic" step.
//
// A reroute row existed and was removed. It changed the topic's stored type, so
// it needed a store mutation that wrote onto server-owned data, and it asked the
// user to relabel a topic in order to do something with it. "Use in chat anyway"
// gets them straight to the thing they wanted, one click instead of two.
//
// The trade is real and worth naming: the classification is now OVERRIDABLE but
// no longer CORRECTABLE. If Archie files a topic wrongly it stays filed wrongly
// — the label simply stops blocking anyone. Fine while the label costs nothing to
// ignore; revisit if a mislabel ever carries a consequence beyond this card.
// ─── PARKED: Add to strategy ───────────────────────────────────────────────
// The Content-strategy / pillar flow is parked, not deleted. Everything it needs
// is still here — briefs-store, contexts-store's pillar API, the dialog in
// research-modals.js, the Playbook section in playbook-view.js, the composer item
// in screens/session.js. Only the ways IN are commented out, in five files, each
// marked "PARKED".
//
// To restore this card, put these two expressions back (they are written without
// template syntax on purpose — a backtick or a dollar-brace in a comment inside
// the html literal below would end or interpolate it):
//
//   main segment attribute:
//     ready ? data-brief-use=ID : data-brief-strategy=ID
//   main segment label:
//     ready ? "Use in chat" : "Add to strategy"
//   first menu row:
//     ready ? a data-brief-strategy row labelled "Add to strategy"
//           : a data-brief-use row labelled "Use in chat"
//   plus the standalone data-brief-save row that always followed it.
//
// While parked, Save for later is promoted from that standalone row to the main
// segment for content-strategy topics, because Add to strategy was the only thing
// there and a topic still needs one verb of its own.
function renderUseSplit(brief, menuOpen) {
  const saved = brief.status === "saved";
  const ignored = brief.status === "ignored";
  const ready = brief.researchType === "ready-to-post";
  return html`<span class="topics-use" data-brief-use-wrap="${escapeAttr(brief.id)}">
    <!-- PARKED — see the restore notes in the JS comment above this function.
         A content-strategy topic has no Add-to-strategy destination while that
         flow is parked, so its main segment takes the other verb the card already
         owns: Save for later. The card's rule still holds — whichever action is
         the main segment does NOT repeat in the menu below. -->
    <button
      type="button"
      class="topics-use__main"
      ${raw(ready ? `data-brief-use="${escapeAttr(brief.id)}"` : `data-brief-save="${escapeAttr(brief.id)}"`)}
    >
      ${ready ? "Use in chat" : saved ? "Remove from saved" : "Save for later"}
    </button>
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
      <!-- Text only, no icon tiles. Three rows is short enough to read as a
           list, and the tiles were doing decoration rather than disambiguation:
           a bookmark, a target and an eye-off don't tell you anything the labels
           don't already say. -->
      <!-- Whichever of the two actions is NOT the main segment leads the menu, so
           the pair is always both present and never duplicated.
           
           Each row uses the OTHER card's main-segment label VERBATIM — "Add to
           strategy" and "Use in chat" — so a reader learns two verbs for the whole
           feature instead of four. It was "Add to Playbook — Content strategy"
           (which named a destination the button already implies) and "Use in chat
           anyway", where "anyway" was doing the work of arguing with Archie's
           classification. Neither is needed: the row's presence already says the
           other action is available. -->
      <!-- PARKED — the Add-to-strategy row; the restore snippet is in the JS
           comment above this function, kept out of the template because a
           backtick or a dollar-brace inside it would end or interpolate the
           literal.

           With Add-to-strategy parked there is only one alternate verb left, so
           the menu carries exactly one row above Ignore and the no-duplication
           rule decides which: a ready-to-post topic leads with Save for later
           (its main segment is Use in chat), a content-strategy topic leads with
           Use in chat (its main segment is now Save for later). -->
      ${raw(
        ready
          ? html`<button type="button" class="topics-use__item" data-brief-save="${escapeAttr(brief.id)}">
              <span>${saved ? "Remove from saved" : "Save for later"}</span>
            </button>`
          : html`<button type="button" class="topics-use__item" data-brief-use="${escapeAttr(brief.id)}">
              <span>Use in chat</span>
            </button>`,
      )}
      ${raw(
        // Ignore lives in here rather than beside Use in chat. It is the one
        // destructive-ish option on the card, and a menu is where the app already
        // puts those; out in the footer it sat at the same weight as the action
        // you actually want, which is backwards.
        //
        // Hidden once ignored — the action has been taken and a second press has
        // nothing to do. The tooltip that used to explain it does not survive the
        // move (a menu row cannot host a hover popover without fighting the menu's
        // own dismissal), so the explanation moves into the row's own description.
        //
        // With the tiles gone, the red tile that marked this row as the taking-away
        // one went with them, so the red moved onto the label — which is what the
        // DS's own .ap-action-dropdown-item.red-mode does. Same family, same intent,
        // no icon needed to carry it.
        ignored
          ? ""
          : html`<button
              type="button"
              class="topics-use__item topics-use__item--ignore"
              data-brief-ignore="${escapeAttr(brief.id)}"
            >
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
    <span>Use in chat</span>
  </button>`;
}
