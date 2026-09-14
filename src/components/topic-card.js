// One Topic, in the shapes it is read in.
//
//   renderTopicCard(topic, { variant: "feed" })    the queue on /topics
//   renderTopicCard(topic, { variant: "picker" })  the new chat's Fresh-topics grid
//   renderTopicCard(topic, { variant: "widget" })  the SAME body with no button in
//                                                  it, for a row of the in-chat
//                                                  picker widget (below)
//   renderTopicsWidget({ topics, … })              the composer's "Pick from the
//                                                  Topic Feed" turn: radio cards
//
// The widget variant is not a fourth look — it is the feed/picker body, part for
// part, minus the <button>. It exists because that body has to sit inside a
// radio <label> (the DS `.ap-radio-card`), and interactive content cannot nest
// in a label any more than a button can in a button — see the note at the end
// of this header. Everything inside the body was already a <span> for exactly
// that reason, so the widget costs one wrapper and nothing else.
//
// There WAS a third shape — renderTopicRow, a full-width row for the new chat's
// hero. Six of them stacked ran ~500px tall and pushed the workflow starters off
// the fold, and a row cannot carry an action without becoming a card anyway. The
// hero now renders the picker's card in a grid, so a Topic looks the same
// wherever it is read, and the shape count went down rather than up.
//
// The feed and the picker emit the SAME CARD, part for part — same frame, badge,
// age, status glyph, signals, headline, summary. A reader who has just been
// reading the feed must not be handed a different-looking object when they open
// the picker. The only difference is that the feed's card can be the one
// currently OPEN beside the list and the picker's cannot: one click there chooses
// the Topic, so nothing stays selected long enough to need marking.
//
// The feed variant was called `row` for one commit, when the list really was a
// continuous surface ruled by hairlines instead of a column of cards. That went
// too far — a wall of cards comes from the gaps and the weight, not from the
// cards having edges — and it left the screen as one 1440px slab belonging to no
// other surface in this app.
//
// The card also carries the reader's own progress: an untriaged Topic is set in
// the headline's full weight and a triaged one drops back a step. That is the
// unread/read idiom every mail client uses, and it is the other half of why the
// `new` status renders no glyph — the card's weight already says it.
//
// ── The order is the CARD's order, and the ARTICLE follows it ─────────────
// The meta run, then the claim, then the summary — and the article header renders
// the meta run, then the claim, then its verbs. One object, one reading order,
// whether you are looking at the door or standing in the room.
//
// ⚠️ The two disagreed until now: the card opened with "Competitors · 2h ago" and
// the article opened with the headline, so a reader crossing from one to the other
// met the same Topic laid out two ways. The CARD is the shape that wins — it is
// the one a reader meets first and meets twelve times over, and its meta run is
// the editorial kicker: the small line saying where you are before the headline
// says what it is. The article moved.
//
// ⚠️ It was built the other way round first — claim on top in both, `6777c2ad` —
// on the argument that the claim is the identity and that the kicker is identical
// on every card while `competitor-posts` is the only live source. Turned down.
// Don't re-propose it.
//
// The kebab keeps the top-right corner, on the meta run's line, and the RUN pays
// for its clearance rather than the whole body: the headline and the summary get
// the full measure, which is what they lost to a gutter reserved for a control
// they never sat beside.
//
// ── The card is a reading surface, not a control panel ─────────────────────
// The body is ONE BUTTON covering the whole text area, and it opens the article.
// The verbs live in the article's own footer, where the reader has just finished
// reading the thing they are deciding on — the earlier shape asked them to decide
// from two clamped lines of summary. The kebab is the shortcut for the reader who
// does not want to open the full read.
//
// The kebab is a SIBLING of the body button, never inside it: a button inside a
// button is invalid HTML and the browser resolves the nesting unpredictably.
// Everything inside the body is a <span> for the same reason — a button may only
// contain phrasing content, so no h3 and no p in there.

import { html, raw, escapeAttr } from "../utils.js?v=1187";
import { topicTitle } from "../topics-store.js?v=1187";
import { renderTopicStates } from "../topic-article.js?v=1187";
import { findTopicSource } from "../topics-catalog.js?v=1187";

// ── The state chips ───────────────────────────────────────────────────────
// `renderTopicStates` comes from topic-article.js, which is where a Topic's
// identity is declared. It was written HERE and exported by nothing, which is why
// the article header — the thing a card opens — carried no signal at all: click a
// card marked Trending and the page you landed on never said the word. Same
// argument as the article having one renderer for three hosts, one level down.

// Where it came from, how old it is, what states it carries — the article header's
// provenance line, part for part, in the same order and in the same position: the
// card's first line and the header's first row are one renderer's two hosts.
function renderMeta(topic, source) {
  return html`<span class="topic-card__meta">
    ${raw(
      source
        ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
              ><i class="${source.icon}"></i></span
            ><span class="topic-card__source">${source.name}</span>`
        : "",
    )}
    <span class="topic-card__age">· ${topic.ageLabel}</span>
    ${raw(renderTopicStates(topic))}
  </span>`;
}

/**
 * The card. `source` is passed in rather than looked up: the host already has
 * the catalogue in hand and resolving it per card would be one lookup per row.
 *
 * `articleOpen` paints the reading state; the same fact is on the button as
 * aria-expanded, because the selected card must not be carried by colour alone.
 */
export function renderTopicCard(
  topic,
  { source = null, variant = "feed", menuOpen = false, articleOpen = false, withUse = false } = {},
) {
  if (!topic) return "";
  const picker = variant === "picker";
  const ignored = topic.status === "ignored";
  // Read/unread, in the mail-reader sense: `new` is the one status still waiting
  // for an answer, so everything else has been dealt with and steps back.
  const triaged = topic.status !== "new";

  // The WIDGET shape: the body alone, in a <div>, so it can live inside the
  // radio <label> of the in-chat picker. No door of its own INSIDE — the label
  // is the control and the row's radio is what it toggles; the read door ("View
  // more") is a sibling of the label on the item, see renderTopicSelectRow.
  if (variant === "widget") {
    return html`<div
      class="topic-card topic-card--widget${raw(triaged ? " is-triaged" : "")}"
      data-topic-id="${escapeAttr(topic.id)}"
    >
      ${raw(renderTopicBody(topic, source, ignored))}
    </div>`;
  }

  return html`<article
    class="topic-card topic-card--${raw(picker ? "picker" : "feed")}${raw(triaged ? " is-triaged" : "")}${raw(
      articleOpen ? " is-reading" : "",
    )}"
    data-topic-id="${escapeAttr(topic.id)}"
  >
    <button
      type="button"
      class="topic-card__body"
      data-topic-read="${escapeAttr(topic.id)}"
      ${raw(picker ? "" : `aria-expanded="${articleOpen ? "true" : "false"}"`)}
    >
      ${raw(renderTopicBody(topic, source, ignored))}
    </button>
    ${raw(picker ? "" : renderKebab(topic, menuOpen))}
    <!-- The verb ON the card, for a host that has no kebab and sits beside other
         cards you click to START something — the new chat's hero. A sibling of
         the body button, never inside it: a button in a button is invalid HTML.
         The body still opens the article, so "read before you choose" keeps its
         door; this is the second one, for the reader who already knows. -->
    ${raw(
      withUse
        ? html`<div class="topic-card__act">
            <!-- secondary + blue, a DS-shipped variant: electric-blue-10 fill,
                 electric-blue-100 ink. Blue because this is the SECONDARY door
                 into a chat - blue is the interactive/navigation colour in this
                 app, and orange is kept for the spotlight primary, which is the
                 one in the article's own header. Was secondary orange for a
                 commit; that spent the AI colour on a second-rank entry point.
                 NOTE no backticks in here - this is inside a template literal. -->
            <button type="button" class="ap-button secondary blue" data-topic-use="${escapeAttr(topic.id)}">
              <i class="ap-icon-single-chat-bubble"></i><span>Use in chat</span>
            </button>
          </div>`
        : "",
    )}
  </article>`;
}

// The body every shape shares: WHERE IT CAME FROM FIRST, then the claim, then the
// summary — and the article header renders those same rows in that same order. A
// card and the article it opens are two views of one Topic and must not present
// it two ways round. See the note at the top of this file.
//
// All <span>s, on purpose: this sits inside a <button> in the feed and picker
// shapes and inside a radio <label> in the widget shape, and neither may hold
// interactive or block content.
function renderTopicBody(topic, source, ignored) {
  return html`${raw(renderMeta(topic, source))}
    <span class="topic-card__headline">${topicTitle(topic)}</span>
    <!-- No "Summary:" label. Every card carried one, so it labelled nothing — a
         two-line block under a headline is self-evidently the summary, and the
         word ate a chunk of the first of only two visible lines. -->
    <span class="topic-card__summary">${topic.summary}</span>
    <!-- The reason only ever shows on an ignored Topic, and only in the feed: it
         is the sentence the reader typed, and without it Ignored is a state with
         no explanation attached. The picker and the widget never list an ignored
         Topic, so they can never render this. -->
    ${raw(
      ignored && topic.ignoreReason
        ? html`<span class="topic-card__reason"
            ><span class="topic-card__reason-label">You ignored this:</span> ${topic.ignoreReason}</span
          >`
        : "",
    )}`;
}

// ── The in-chat picker widget ──────────────────────────────────────────────
// The composer's "Pick from the Topic Feed", rendered as a turn — the same
// shape as the top-posts widget (top-post-card.js renderTopPostsWidget): a head,
// a single-select list of radio cards, and a confirm CTA. SINGLE select, because
// a Topic becomes ONE source and the next step is asked about that one. When
// `answered`, rows freeze and the footer drops — a static record of the pick.
// `group` scopes the radios' shared `name` to this widget so two widgets in one
// thread cannot cross-select.
//
// One row is the DS radio-button card (`.ap-radio-card.card`): the card owns the
// frame, the dot (::before) and the hover / checked border; we supply the body.
// The whole row is a <label>, so clicking anywhere selects the (visually hidden)
// real <input type=radio> — which is why the body inside is the button-free
// widget variant. The hooks are `data-topics-widget-*`, DISTINCT from the hero's
// `data-topic-use` / `data-topic-read`, whose root-level delegates in session.js
// would otherwise swallow a click on a row.
function renderTopicSelectRow(topic, { source = null, selected = false, disabled = false, group = "" } = {}) {
  if (!topic) return "";
  return html`<div class="topics-widget__item">
    <label class="ap-radio-card card topics-widget__row">
      <input
        type="radio"
        name="topics-pick-${escapeAttr(group)}"
        value="${escapeAttr(topic.id)}"
        data-topics-widget-radio="${escapeAttr(topic.id)}"
        ${raw(selected ? "checked" : "")}
        ${raw(disabled ? "disabled" : "")}
      />
      <div>${raw(renderTopicCard(topic, { source, variant: "widget" }))}</div>
    </label>
    <!-- The read door: opens the article dialog. A SIBLING of the label, never a
         child - a click inside the label would toggle the radio, and interactive
         content in a label is invalid HTML besides. It sits over the card's
         bottom-right corner, where the body has cleared room for it. The hook is
         the same data-topic-read the hero's cards use, so the session's existing
         delegate opens the dialog with no new wiring. Reading stays available on a
         frozen widget too: the pick is made, the article is still worth a look. -->
    <button
      type="button"
      class="ap-link standalone small topics-widget__more"
      data-topic-read="${escapeAttr(topic.id)}"
    >
      View more
    </button>
  </div>`;
}

export function renderTopicsWidget({ topics = [], selected = [], answered = false, group = "" } = {}) {
  const sel = new Set(selected);
  const rows = topics
    .map((t) =>
      renderTopicSelectRow(t, {
        source: findTopicSource(t.sourceId),
        selected: sel.has(t.id),
        disabled: answered,
        group,
      }),
    )
    .join("");
  // Every id resolved to nothing — the Topics left the feed between the turn
  // landing and this paint. Say so rather than draw an empty frame.
  const body = rows || html`<p class="topics-widget__gone muted">These Topics are no longer in the feed.</p>`;
  const footer = answered
    ? ""
    : html`<div class="topics-widget__foot">
        <button
          type="button"
          class="ap-button primary blue topics-widget__cta"
          data-topics-widget-confirm
          ${raw(sel.size ? "" : "disabled")}
        >
          <span>Use this topic</span>
        </button>
      </div>`;
  return html`<div class="topics-widget${raw(answered ? " topics-widget--answered" : "")}" data-topics-widget>
    <div class="topics-widget__head">
      <span class="topics-widget__title">
        <i class="ap-icon-antenna" aria-hidden="true"></i>
        Draft-ready Topics
      </span>
      <span class="topics-widget__hint muted">Pick one</span>
    </div>
    <div class="topics-widget__list" role="radiogroup" aria-label="Pick one Topic to bring into this chat">
      ${raw(body)}
    </div>
    ${raw(footer)}
  </div>`;
}

// Two rows, and deliberately only two. Four behind one trigger is a menu; two is
// the shortcut for the reader who does not want to open the article. If a third
// verb turns up, revisit rather than grow it.
//
// ONE SLOT, TWO DIRECTIONS on the second row: Ignore, or Un-ignore. Never both,
// because they are one decision read from opposite ends. An ignored Topic used to
// get no row at all, which left the decision with no way back on the surface that
// took it.
//
// No red mode on Ignore. Ignoring hides a Topic that ticking Ignored brings back
// — nothing is destroyed — so red would be flagging a danger that is not there.
function renderKebab(topic, menuOpen) {
  const ignored = topic.status === "ignored";
  return html`<button
      type="button"
      class="ap-icon-button transparent topic-card__more"
      data-topic-more="${escapeAttr(topic.id)}"
      aria-haspopup="menu"
      aria-expanded="${menuOpen ? "true" : "false"}"
      aria-label="More actions"
    >
      <i class="ap-icon-more"></i>
    </button>
    ${raw(
      menuOpen
        ? html`<div class="ap-action-dropdown topic-card__menu" role="menu">
            ${raw(menuRow(topic.id, "data-topic-use", "ap-icon-single-chat-bubble", "Use in chat"))}
            ${raw(
              ignored
                ? menuRow(topic.id, "data-topic-unignore", "ap-icon-eye-on", "Un-ignore", "Back on this list to review")
                : menuRow(
                    topic.id,
                    "data-topic-ignore",
                    "ap-icon-eye-off",
                    "Ignore",
                    "Kept off this list, even if it trends or updates",
                  ),
            )}
          </div>`
        : "",
    )}`;
}

// The DS Action Dropdown's own markup. `has-description` is the DS's two-line
// variant — the description states the OUTCOME rather than repeating the label.
function menuRow(topicId, attr, icon, label, description = "") {
  return html`<button
    type="button"
    role="menuitem"
    class="ap-action-dropdown-item${raw(description ? " has-description" : "")}"
    ${raw(`${attr}="${escapeAttr(topicId)}"`)}
  >
    <i class="${icon}"></i>
    <div class="ap-action-dropdown-item-text">
      <div class="ap-action-dropdown-item-label-container">
        <span class="ap-action-dropdown-item-label">${label}</span>
      </div>
      ${raw(description ? html`<span class="ap-action-dropdown-item-description">${description}</span>` : "")}
    </div>
  </button>`;
}
