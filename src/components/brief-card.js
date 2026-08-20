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
// "picker" is the Pick-a-topic modal, and its card BODY is now the feed's, part
// for part: badge, source, age, status glyph, pillar mark, Trending/Updated,
// headline, summary. The modal used to show a compact one-line row of its own, so
// the thing you picked looked nothing like the thing you had been reading two
// seconds earlier; the pillar mark was the last thing still telling them apart.
//
// What the variant still changes is BEHAVIOUR, not content: the body carries
// data-idea-read rather than data-brief-research (the dialog opens the article
// inside itself, not in a side pane beside a list), there is no aria-expanded
// because nothing is being disclosed next to it, and there is no kebab — the
// picker offers one verb, and it lives in the article's own footer.
//
// It used to be true that "in a picker the card IS the control", with the body
// carrying data-idea-pick. That is what justified stripping things out of it, and
// it stopped being true when the pick moved to the article footer — where the
// reader has actually read the thing they are choosing.
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
import { findReviewStatus } from "../research-catalog.js?v=24";
// One title per topic — the article's, not the scan's headline. See briefs-store.
import { briefTitle } from "../briefs-store.js?v=71";
import { isFlagOn } from "../feature-flags.js?v=23";
import { pillarForBrief } from "../pillars-store.js?v=15";

// No full stop — it is a caption on a menu row, not a sentence. This started as a
// paragraph, became one line, and is now the shortest thing that still carries the
// rule: ignoring is not deleting, and a spike overrides it.
//
// "this list", not "feed": the user is standing in ONE Topic feed when they read
// it, and that is the scope of what ignoring does. "Feed" was ambiguous with the
// /topics feed, which is a different surface with a different object in it.
// "Baseline" went earlier for length; the full version still lives where the
// decision is actually made — the infobox in the ignore-reason modal
// (research-modals.openIgnoreReason).
const IGNORE_HINT = "Kept off this list unless trending or updated";

// The counterpart, and it says where the topic GOES rather than what un-ignoring
// is. The feed opens on To review, so this is also the sentence that tells the
// reader they will see it again without changing a filter.
const UNIGNORE_HINT = "Back on this list to review";

// ── The ROUTE TAG WAS HERE, and it is gone ─────────────────────────────────
// `renderRouteTag()` drew an .ap-tag naming the topic's type (Ready to post /
// Content strategy) on the left of the meta run. It existed to tell you which
// verb the card's SPLIT BUTTON would lead with — and the split button went when
// the card lost its footer. The card's menu now shows every verb at once, so the
// label predicted nothing.
//
// The argument it carried is worth keeping because it was right about its own
// question: with exactly two types, labelling only the exception costs more than
// the extra chip saves, because reading a route off an ABSENCE is work. If a
// route label ever comes back — on a filter chip, in the menu header, anywhere —
// label both types, not just one.
//
// What is lost, and is not free: the route still drives the ORDER of the menu
// rows, and that is now invisible until the menu is open. `typeTagColor` in
// research-catalog.js now has NO callers — left in place beside the catalogue it
// belongs to rather than deleted, because it is the colour half of the mapping
// and a route label returning without it would be reinvented wrong.

// The status, as one glyph. It was a filled pill carrying the word.
//
// Why the pill went: it was the widest thing in the meta row and it stated the
// least. Three of the four values are things the reader themselves did, so the row
// spent its most valuable horizontal space telling them their own last action —
// while the two things they could NOT know without being told, Trending and Updated,
// sat to its left competing for the same strip. A glyph says the same thing in 16px
// and stops competing.
//
// The tooltip is where the words went, and it says MORE than the pill did: the pill
// said "Ignored", the tooltip says what being ignored does to the topic.
//
// The DS Tooltip, not a title attribute — title waits a second, cannot be styled and
// renders in OS chrome. Structure follows session.js's starter-topic tip, the app's
// existing use of this component: the bubble sits AFTER its trigger so a plain
// adjacent-sibling selector reveals it, and visibility lives on the APP class,
// never on .ap-tooltip, because redeclaring a DS class outside ds-patches.css flips
// the cascade for every other use of it.
//
// aria-hidden on the bubble, with the label AND the hint on the trigger's aria-label:
// a display:none element cannot be read through aria-describedby, so the accessible
// name has to carry the explanation itself.
function renderStatusIcon(status) {
  const meta = findReviewStatus(status);
  // No icon in the catalog means the status renders no marker at all — New is the
  // absence of one, and the empty string keeps the meta row from reserving space or
  // emitting an empty tooltip wrapper for it. `research-catalog.js` has the why.
  if (!meta || !meta.icon) return "";
  return html`<span class="topics-card__status" data-status="${escapeAttr(meta.id)}">
    <i class="${meta.icon} topics-card__status-icon" role="img" aria-label="${meta.label}. ${meta.hint}"></i>
    <span class="ap-tooltip bottom-left topics-card__status-tip" aria-hidden="true">
      <strong>${meta.label}</strong> — ${meta.hint}
    </span>
  </span>`;
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

// The pillar mark — "this topic is filed under one of your pillars".
//
// `ap-icon-stack`, deliberately NOT `ap-icon-bookmark`: bookmark already means
// the SAVED review status on this exact card, and one glyph may mean one thing.
// (Stack is the closest thing the DS ships; it reads as "a list" more than "a
// theme" and is a placeholder until there is a real pillar glyph. What it must
// not be is bookmark.)
//
// A span with a tooltip, never a link: this sits inside topics-card__body, which
// IS a button, and a focusable element in there is the invalid nesting the
// body/footer split exists to avoid. The words live in the icon's aria-label so
// a display:none tooltip is not the only place they exist — the same
// construction, and the same reason, as the status glyph above. Getting TO the
// pillar is a menu row, not this glyph.
// The pillar mark: the icon, then the pillar's NAME.
//
// The icon alone said a topic was filed somewhere without saying where, so the
// one fact the mark exists to carry — which pillar — was only available by
// hovering. The name is clamped at 15 characters because it sits in a meta run
// beside the source and the age, and a pillar called "Social media measurement
// that survives a board meeting" would have owned the row.
//
// The tooltip keeps the FULL name and the explanation, and now opens from the
// whole element rather than the icon: with a label beside it, hovering the words
// and getting nothing is the more likely miss.
const PILLAR_LABEL_MAX = 15;

function renderPillarMark(pillar) {
  const full = pillar.name || "";
  const short = full.length > PILLAR_LABEL_MAX ? `${full.slice(0, PILLAR_LABEL_MAX).trimEnd()}…` : full;
  return html`<span
    class="topics-card__pillar"
    tabindex="0"
    role="img"
    aria-label="Linked with the ${full} content pillar. The pillar's context will be included if you use this topic in chat."
  >
    <i class="ap-icon-stack" aria-hidden="true"></i>
    <span class="topics-card__pillar-name">${short}</span>
    <span class="ap-tooltip bottom-left topics-card__pillar-tip" aria-hidden="true">
      Linked with <strong>${full}</strong> content pillar. The pillar's context will be included if you use this topic
      in chat.
    </span>
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
  { source = null, variant = "feed", menuOpen = false, articleOpen = false } = {},
) {
  if (!brief) return "";
  const trendingPage = variant === "trending";
  const picker = variant === "picker";
  const ignored = brief.status === "ignored";
  // Resolved here rather than passed in: unlike `source`, which the screen
  // already has in hand, the pillar link is one Map lookup and threading it
  // through three call sites bought nothing. Flag-gated, so with Content
  // strategy off this card is byte-for-byte what it was.
  const pillar = isFlagOn("contentStrategy") ? pillarForBrief(brief.id) : null;

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
         it up with no new wiring. In the picker it carries data-idea-read: a
         different attribute for the same verb, because the picker's dialog opens
         the article INSIDE itself rather than in the feed's side pane.

         It used to carry data-idea-pick — the card was the control, and clicking
         it chose the topic there and then. That asked the reader to decide from
         two clamped lines of summary; the pick moved to the article's own footer,
         where they have just read the thing they are choosing.

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
      ${raw(picker ? `data-idea-read="${escapeAttr(brief.id)}"` : `data-brief-research="${escapeAttr(brief.id)}"`)}
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
        <span class="topics-card__when">· ${brief.ageLabel}</span>
        <!-- The status glyph, immediately right of the age. It moved here from the
             far right of the row, past the spacer, and the move is the point: the
             left of this row is the topic's own facts — where it came from, how old
             it is — and its triage state is now read as one of them rather than as
             a chip competing with the Trending and Updated marks. Those two keep
             the right-hand side to themselves.
             Never on the trending page, which shows no triage controls at all — see
             the variant note at the top of this file. -->
        ${raw(trendingPage ? "" : renderStatusIcon(brief.status))}
        <!-- The pillar mark, after the triage glyph: source · age · status is the
             topic's own record, and the pillar is a RELATIONSHIP to something
             else — so it reads last in the facts group and before the signals.
             Gated with the feature, and ON THE PICKER TOO.
             It used to be suppressed there, on the argument that the picker's card
             IS a control rather than something to read. That stopped being true when
             the body button gave up data-idea-pick: it now opens the article inside
             the dialog, so the picker's card is read exactly like the feed's — and
             it was the one thing making the two look different. Which pillar a topic
             is filed into is also more use here than anywhere, since picking one is
             a decision about what to write next. -->
        ${raw(pillar ? renderPillarMark(pillar) : "")}
        <!-- Trending / Updated, in the slot the route tag used to hold.
             THE ROW NO LONGER HAS A RIGHT-HAND SIDE. It used to: everything
             before the spacer answered "what is this", everything after it
             answered "where am I with it". The kebab now occupies the card's
             top-right corner, so nothing else can live out there — the meta run
             is one left-aligned line and the trailing spacer is dead space
             RESERVING that corner, which is why it is still here.
             The marks moved into it because they are the two things in this row
             a reader genuinely cannot know without being told; on the far right
             they were the last thing scanned. -->
        ${raw(brief.isTrending ? renderTrendingMark() : "")}${raw(brief.isUpdated ? renderUpdatedMark() : "")}
        <span class="topics-card__spacer"></span>
      </span>

      <span class="topics-card__headline">${briefTitle(brief)}</span>

      <!-- No "Summary:" label. Every card carried it, so it labelled nothing —
           the two-line block under a headline is self-evidently the summary, and
           the word ate a chunk of the first of only two visible lines. -->
      <span class="topics-card__summary" data-brief-summary>${brief.summary}</span>

      <!-- Why now and What changed used to sit here, each in a tinted block
           clamped to two lines. Both moved to the article's "Trend levels"
           section (research-modals.renderResearchArticle).

           The card kept saying WHY a topic was flagged while the badge above
           already said THAT it was, and it could only ever show a clamped two
           lines of an explanation whose whole value is the detail. Two tinted
           blocks also gave every flagged card a different height from its
           neighbours, so the list read as ragged rather than scannable.

           What stays on the card is the signal itself — the Trending and Updated
           badges in the header. They are the reason to open the article; the
           article is where the reason is explained. -->
      ${raw(
        !trendingPage && ignored && brief.ignoreReason
          ? html`<span class="topics-card__reason">
              <span class="topics-card__reason-label">You ignored this:</span> ${brief.ignoreReason}
            </span>`
          : "",
      )}
    </button>

    <!-- No footer, on any variant. The card is a reading surface now; the verbs live
         in the article pane's own footer (research-feed.renderUseButtons), which is
         where the reader has just finished reading and which shows all three at once
         rather than one plus a chevron.

         The picker never had one, and still does not: it offers a single verb and
         that verb sits under the article, so a row of actions here would be a second,
         different answer to the same click. The feed and the trending page did have
         one, and both lose it here along with the hairline separator that divided it
         from the summary. -->
    <!-- …but there IS a kebab, and it is a SIBLING of the body button, never
         inside it: the body is one big button and nesting a second button is
         invalid HTML, which is the same reason the old footer was a sibling too.
         It carries the article footer's three verbs (renderUseButtons) plus
         Unlink, so the reader who does not want to open the full read is not
         forced to. Not a footer by the back door: four rows behind one trigger
         is a menu — if a fifth verb turns up, revisit rather than grow it.

         Not on the picker, which offers one verb and hosts it in the article's
         footer — a four-row triage menu there would be the picker growing a second
         job. And NOT on the trending page: that page answers "what's spiking", not "what have I
         triaged", and three of these four rows are triage. The pillar mark above
         still shows there — it is a fact about the topic, not something the user
         did. Same rule the reduced trending variant already followed. -->
    ${raw(picker || trendingPage ? "" : renderCardMore(brief, pillar, menuOpen))}
  </article>`;
}

// The card's kebab + its menu.
//
// Row order is ROUTE-DRIVEN, exactly as the parked split button decided: a
// Ready-to-post topic leads with Use in chat, a Content-strategy one leads with
// Save for later, and whichever verb leads is not repeated below. That rule is
// now invisible until the menu opens — the price of dropping the route tag.
//
// Unlink sits third because it is about the PILLAR, not the topic. The triage row
// is last, and it flips direction rather than disappearing: Ignore on a topic
// that is not ignored, Un-ignore on one that is.
function renderCardMore(brief, pillar, menuOpen) {
  const ignored = brief.status === "ignored";
  // ── Save is gone, and with it the route-driven ORDER ─────────────────────
  // The menu used to lead with Save for a Content-strategy topic and with Use
  // in chat for a Draft-ready one. With Save removed there is one verb left, so
  // there is nothing left to order — and "I'll come back to this" is now the
  // segment a topic sits in rather than something you press.
  const rows = [{ attr: "data-brief-use", icon: "ap-icon-single-chat-bubble", label: "Use in chat" }];
  return html`<button
      type="button"
      class="ap-icon-button transparent topics-card__more"
      data-brief-more="${escapeAttr(brief.id)}"
      aria-haspopup="menu"
      aria-expanded="${menuOpen ? "true" : "false"}"
      aria-label="More actions"
    >
      <i class="ap-icon-more"></i>
    </button>
    ${raw(
      menuOpen
        ? html`<div class="ap-action-dropdown topics-card__more-menu" role="menu">
            ${raw(rows.map((r) => menuRow(brief.id, r)).join(""))}
            <!-- Link when it is filed nowhere, Unlink when it is. Never both:
                 they are the same decision in two directions, and offering to
                 link a topic that is already linked offers to do what it just
                 did. Re-filing is Unlink then Link — two clicks for a rare
                 action, rather than a third row on every card forever. -->
            ${raw(
              !isFlagOn("contentStrategy")
                ? ""
                : pillar
                  ? unlinkRow(brief.id, pillar)
                  : menuRow(brief.id, {
                      attr: "data-brief-link",
                      icon: "ap-icon-stack",
                      label: "Link to a Content pillar",
                    }),
            )}
            <!-- A normal row, with no divider above it. Ignoring hides a topic
                 that a spike brings back — nothing is destroyed — so red-mode was
                 flagging a danger that is not there, and the rule was fencing it
                 off from actions it belongs with. Same correction the pane's
                 Ignore button got.

                 ONE SLOT, TWO DIRECTIONS. An ignored topic used to have no row
                 here at all, on the reasoning that a second press of Ignore has
                 nothing to do — true of Ignore, and it left the decision with no
                 way back on the surface that took it. The slot now carries
                 whichever direction is available: Ignore, or Un-ignore. Never
                 both, because they are one decision read from opposite ends.

                 eye-on against eye-off: the same glyph inverted, which is what
                 the pair means. The description states the OUTCOME rather than
                 repeating the label — a topic coming back is worth saying it
                 comes back to review, because that is where the reader will look
                 for it. -->
            ${raw(
              ignored
                ? html`<button
                    type="button"
                    role="menuitem"
                    class="ap-action-dropdown-item has-description"
                    data-brief-unignore="${escapeAttr(brief.id)}"
                  >
                    <i class="ap-icon-eye-on"></i>
                    <div class="ap-action-dropdown-item-text">
                      <div class="ap-action-dropdown-item-label-container">
                        <span class="ap-action-dropdown-item-label">Un-ignore</span>
                      </div>
                      <span class="ap-action-dropdown-item-description">${UNIGNORE_HINT}</span>
                    </div>
                  </button>`
                : html`<button
                    type="button"
                    role="menuitem"
                    class="ap-action-dropdown-item has-description"
                    data-brief-ignore="${escapeAttr(brief.id)}"
                  >
                    <i class="ap-icon-eye-off"></i>
                    <div class="ap-action-dropdown-item-text">
                      <div class="ap-action-dropdown-item-label-container">
                        <span class="ap-action-dropdown-item-label">Ignore</span>
                      </div>
                      <span class="ap-action-dropdown-item-description">${IGNORE_HINT}</span>
                    </div>
                  </button>`,
            )}
          </div>`
        : "",
    )}`;
}

function menuRow(briefId, { attr, icon, label }) {
  return html`<button
    type="button"
    role="menuitem"
    class="ap-action-dropdown-item"
    ${raw(`${attr}="${escapeAttr(briefId)}"`)}
  >
    <i class="${icon}"></i>
    <div class="ap-action-dropdown-item-text">
      <div class="ap-action-dropdown-item-label-container">
        <span class="ap-action-dropdown-item-label">${label}</span>
      </div>
    </div>
  </button>`;
}

// One line, naming the pillar. It carried a description ("Keeps the topic, drops
// …'s context") and the name lived down there because the label container is
// nowrap + ellipsis — but the row now says WHICH pillar in the label itself,
// which is the thing a reader needs before pressing it, and the consequence is
// evident from the verb.
//
// `has-description` goes with the description: that class exists only to un-fix
// the row's 40px height for a second line, so keeping it would leave a 50px row
// holding one line of text.
//
// The label still ellipsises on a very long pillar name. The menu is 300px and
// the alternative — the name in a description nobody reads — was worse.
function unlinkRow(briefId, pillar) {
  return html`<button
    type="button"
    role="menuitem"
    class="ap-action-dropdown-item"
    data-brief-unlink="${escapeAttr(briefId)}"
  >
    <i class="ap-icon-link"></i>
    <div class="ap-action-dropdown-item-text">
      <div class="ap-action-dropdown-item-label-container">
        <span class="ap-action-dropdown-item-label">Unlink for ${pillar.name} content pillar</span>
      </div>
    </div>
  </button>`;
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
/**
 * The article pane's footer: the split button's three actions, laid out flat.
 *
 * Same three verbs the card's split offers, no chevron and no menu. The card needs
 * the menu because it is one of ten in a scrolling column and can spare one button's
 * width; the footer is 620px of pane with nothing else in it, so hiding two of three
 * actions behind a chevron was spending a click to save space that was already free.
 *
 * Dropping the menu also retires two things the split needed and this does not: the
 * `article:<id>` menu key that kept the footer's dropdown from opening the card's,
 * and the upward-opening rule that stopped it being clipped by the pane's
 * overflow: hidden. Fewer moving parts for the same three actions.
 *
 * Real .ap-button, not the card's hand-rolled .topics-use__main — the segments only
 * hand-roll it because a split needs a squared inner edge the DS does not expose, and
 * three separate buttons have no such constraint. The weights carry the hierarchy the
 * menu used to carry by position:
 *
 *   primary orange the main verb. Orange is the AI / spotlight colour in this app,
 *                  and taking a topic into a chat is the AI action the pane exists
 *                  to set up. It was stroked blue, matching the card's parked split
 *                  button — but with the split gone there is nothing left to match,
 *                  and three stroked buttons gave the pane no obvious next step
 *   ghost grey     Ignore. It sits NEXT TO Use in chat rather than pushed to the far
 *                  right: with only two buttons left, the gap read as a missing third
 *                  one, and a control alone at the opposite edge of a 620px pane looks
 *                  like it belongs to the pane rather than to the topic. Grey, not red —
 *                  ignoring hides a topic that a spike brings back, so the destructive
 *                  colour was promising a consequence the action does not have. Ghost
 *                  keeps it from reading as a second equal choice.
 */
/**
 * The footer under an article: the one verb, plus a way out.
 *
 * `dismiss` names what that way out IS, and the two surfaces need different ones.
 * In the feed's PANE the article sits beside the list it came from, so leaving it
 * means deciding about the Topic — Ignore, which files it away and is undoable. In
 * a DIALOG the article is the whole screen and the way out is Close, which is also
 * what every other dialog in this component puts there. Ignore in a dialog offered
 * a filing decision as the only alternative to the primary, on a surface the reader
 * opened to read one topic.
 *
 * Close is wired to the shell's own [data-research-modal-close], so it needs no
 * handler of its own and cannot fall out of step with the X in the corner.
 */
export function renderUseButtons(brief, { dismiss = "ignore" } = {}) {
  const ignored = brief.status === "ignored";
  // One verb and one taking-away. Save is gone (see the menu above), so the
  // main/alt split it existed to arbitrate went with it.
  const main = { attr: "data-brief-use", label: "Use in chat" };

  // primary orange, not stroked blue. The house convention (CLAUDE.md) is orange =
  // AI / spotlight action, blue = routine list-page CTA — and taking a topic into a
  // chat is the AI action this whole pane exists to set up. It is also the only
  // primary on screen, so the surface has one obvious next step.
  const primary = html`<button
    type="button"
    class="ap-button primary orange"
    ${raw(`${main.attr}="${escapeAttr(brief.id)}"`)}
  >
    <span>${main.label}</span>
  </button>`;

  // The second slot, in whichever direction is available: Close in a dialog,
  // Un-ignore on an ignored topic, Ignore otherwise. It used to render nothing at
  // all once a topic was ignored, which left the surface offering no way to undo
  // the decision it had just taken.
  //
  // The Ignore hint the menu row carried as a caption becomes a tooltip here: a
  // button has no room for a second line, and the sentence is the whole reason a
  // reader is willing to press it (ignoring is not deleting, and a spike overrides
  // it). Same DS Tooltip construction as the card's status glyph — bubble after its
  // trigger, visibility on the app class, aria-hidden with the words repeated in the
  // button's own aria-label so a display:none element is not the only place they
  // live.
  //
  // Neither Close nor Un-ignore gets a tooltip: one needs no explaining, and the
  // other's outcome rides in its aria-label where the words cost nothing.
  const secondary =
    dismiss === "close"
      ? html`<button type="button" class="ap-button ghost grey" data-research-modal-close>
          <span>Close</span>
        </button>`
      : ignored
        ? html`<button
            type="button"
            class="ap-button ghost grey"
            data-brief-unignore="${escapeAttr(brief.id)}"
            aria-label="Un-ignore Topic. ${UNIGNORE_HINT}"
          >
            <span>Un-ignore</span>
          </button>`
        : html`<span class="topics-use-flat__ignore">
            <button
              type="button"
              class="ap-button ghost grey"
              data-brief-ignore="${escapeAttr(brief.id)}"
              aria-label="Ignore Topic. ${IGNORE_HINT}"
            >
              <span>Ignore</span>
            </button>
            <span class="ap-tooltip top-left topics-use-flat__tip" aria-hidden="true">${IGNORE_HINT}</span>
          </span>`;

  // ── Order depends on the SURFACE, and deliberately so ─────────────────────
  // In a DIALOG the way out comes first: every other dialog in research-modals
  // already reads Not now / Send feedback and Cancel / Submit and ignore, so a
  // primary in the leading slot put it exactly where Cancel sits three dialogs
  // over. `dismiss === "close"` is only ever true in a dialog, so it is also the
  // test for "am I a dialog footer".
  //
  // In the feed's article PANE the verb leads. That is not a dialog footer — it is
  // the action bar under the article you have just read, the pane exists to set that
  // action up, and Ignore beside it is the alternative rather than the way out.
  //
  // DOM order, not row-reverse: the tab order has to match what the eye sees, and a
  // CSS reversal leaves the keyboard reaching the primary first on a footer where it
  // is drawn second.
  const dialogFooter = dismiss === "close";
  return html`<span class="topics-use-flat" data-brief-use-wrap="${escapeAttr(brief.id)}">
    ${raw(dialogFooter ? secondary : primary)}${raw(dialogFooter ? primary : secondary)}
  </span>`;
}

/**
 * The card's Use-in-chat split button — UNREACHABLE, and kept on purpose.
 *
 * ⚠️ It still emits `data-brief-save`, and SAVE NO LONGER EXISTS anywhere in the
 * product — no handler listens for that attribute. Restoring this function means
 * deciding what its second verb is now, not wiring the old one back up.
 *
 * Nothing calls it: the card's footer is gone from every variant, and the article
 * pane uses renderUseButtons above. Left whole rather than deleted for the reason the
 * PARKED blocks elsewhere are: it carries the reasoning for the whole main-segment /
 * menu split — which verb leads for which topic type, why neither action is ever
 * hidden, why the reroute row was removed — and renderUseButtons was derived from it.
 * Restoring a card footer means rendering this again, not rebuilding it.
 *
 * The same goes for renderUseSingle below, the trending page's single-button variant.
 *
 * @param {string} menuKey — the value `view.openMenu` is compared against, and the
 *   value the toggle writes back. Defaults to the brief id.
 */
export function renderUseSplit(brief, menuOpen, { menuKey = brief.id, modifier = "" } = {}) {
  const saved = brief.status === "saved";
  const ignored = brief.status === "ignored";
  const ready = brief.researchType === "ready-to-post";
  return html`<span
    class="topics-use${raw(modifier ? ` ${modifier}` : "")}"
    data-brief-use-wrap="${escapeAttr(brief.id)}"
  >
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
      data-brief-use-menu="${escapeAttr(menuKey)}"
      aria-haspopup="true"
      aria-expanded="${menuOpen ? "true" : "false"}"
      aria-label="More options for this Topic"
    >
      <i class="ap-icon-chevron-down" aria-hidden="true"></i>
    </button>
    <div class="topics-use__menu" data-brief-menu="${escapeAttr(menuKey)}" ${raw(menuOpen ? "" : " hidden")}>
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
           rule decides which: a Draft-ready topic leads with Save for later (its
           main segment is Use in chat), a Topics-for-later topic leads with Use in
           chat (its main segment is now Save for later). -->
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
                <span>Ignore</span>
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
