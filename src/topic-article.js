// The Topic article — ONE renderer, three hosts.
//
// The feed shows it beside the list, the picker shows it inside its own dialog,
// and the in-chat list opens it in that same dialog. All three call the functions
// here, so there is exactly one article and no way for two of them to drift
// apart. Same shape as playbook-view.js and connectors-view.js: pure render
// helpers, no store reads beyond the title resolver, no DOM, no listeners.
//
//   renderTopicHeader(topic, { source, menuOpen, titleFirst, withMenu })  the identity
//   renderTopicArticle(topic, { source, withHeader, actions, withPosts, headerOpts })
//   renderTopicPosts(topic, { collapsible })            the evidence (inline or a panel)
//   renderTopicActions(topic, { close })                the two verbs
//   renderTopicMenu(topic, { open })                    the header's kebab
//   renderTopicTrail(topic) / trailLength(topic)        the trail, for its hosts
//   renderTopicStates(topic)                            the state chips, for the card too
//
// ── The identity is ONE ORDER, and the ARTICLE follows the CARD ───────────
// Provenance, then the claim, then the verbs: the card has always led with its
// meta run — badge, source, age, state chips — and the article header now leads
// with the same one. A card and the thing it opens must not present one object two
// ways round, and the card is the shape a reader meets first and meets twelve
// times, so it is the article that moves.
//
// It is the editorial kicker: the small line that says WHERE you are before the
// headline says WHAT it is. Which also puts the source and the age at the top of
// the pane rather than tucked under a 24px title, and a reader triaging a
// listening queue is asking "who, and how recently" as much as "what".
//
// ⚠️ The other direction was built first — claim on top in both — on the argument
// that the claim is the identity and the caption line is identical on every card
// while `competitor-posts` is the only live source. Turned down for the CARD and
// the feed PANE: their order is provenance-then-claim, and it stays.
//
// The wider article DIALOG is the ONE exception, on purpose: it passes `titleFirst`
// so the claim is the hero and the "Competitors · age · status" run sits under it —
// a two-column reading surface has room to lead with the title, where the card and
// the one-column pane do not. Same renderer, the order is a host option.
//
// The chips are exported for the same reason the order is shared: they were
// declared in the card and nowhere else, so opening a Trending Topic dropped the
// word "Trending" — the card and the article disagreed about what the Topic IS.
// One renderer, both hosts.
//
// ── Why the identity is its own renderer ───────────────────────────────────
// The feed's pane keeps its header OUTSIDE the scroller, so the title stays put
// while the analysis scrolls. The kebab rides in its top-right corner; the two
// verbs are NOT up here — they sit at the FOOT of the read, on a sticky bar the
// article renders between the analysis and the evidence, so the reader decides
// having just finished the thing they are deciding on. That bar floats at the
// pane's bottom edge while a long analysis scrolls and settles above Contributing
// posts at the end (see renderTopicArticle's `actions` slot and the CSS on
// `.topic-article__actionbar`).
//
// The dialog composes the same pieces differently: two columns — the identity and
// the analysis on the left (title-first), the contributing posts EXPANDED in a grey
// panel on the right (renderTopicPosts, collapsible false) — with the verbs in a
// footer and Topic history a button beside them (no header kebab). That is the
// host's business. What may NOT differ is what the identity and the verbs SAY,
// which is why both are rendered from here and nowhere else.
//
// ── What the article is ────────────────────────────────────────────────────
// The two triage facts, the analysis in its two authored sections, and the posts
// the analysis was written from. Nothing else — and in particular no version
// history: an updated Topic reads as its current version, because a reader
// deciding what to post does not need the draft that preceded it.
//
// The TRAIL is no longer part of it. It sat last, in a collapsed accordion, and
// spent the reading surface's one framed box on something that is meta rather
// than argument — see the note above renderTopicTrail.
//
// ── Why the two facts are in the ARTICLE and not in the header ────────────
// They were in the header for one commit, on the argument that triage criteria
// belong with the identity and the verbs that act on it. The measurement killed
// it: the fixed header went from 125px to 291px — 32% of the pane — and, worse,
// its height then varied with whichever fields a Topic happened to carry, so the
// scrollport resized every time the reader opened the next Topic.
//
// They are the article's FIRST band instead, so nothing about the reading order
// or the visual layout changes: facts, then the analysis, then the evidence, then
// the trail. What it buys is a header of one fixed height, and parity between the
// two hosts — in the dialog the facts already scrolled, because the dialog renders
// the header inline. One placement, one behaviour.
//
// It carries no "Why now" block of its own beyond those rows. The card used to
// repeat the reason a Topic was flagged while the mark above already said THAT it
// was flagged, and it could only ever show two clamped lines of an explanation
// whose whole value is the detail.

import { html, raw, escapeAttr } from "./utils.js?v=1229";
import { topicTitle, topicStates } from "./topics-store.js?v=1229";
import { findTopicState } from "./topics-catalog.js?v=1229";
import { renderSocialPostCard } from "./components/social-post-card.js?v=1229";

/**
 * The object's identity: where it came from, then the claim as an h2 under it —
 * the same order the cards carry — with the kebab pinned to the top-right corner.
 *
 * No verbs here anymore: the pane keeps this header fixed outside its scroller and
 * hangs the two verbs on the article's sticky `actions` bar; the dialog renders
 * this same header inline and keeps the verbs in its own footer.
 */
export function renderTopicHeader(
  topic,
  { source = null, menuOpen = false, titleFirst = false, withMenu = true } = {},
) {
  if (!topic) return "";
  // The kebab sits in the header's TOP-RIGHT CORNER, out of flow, exactly where
  // the list cards put theirs (topic-card__more) — so a reader who learned `...`
  // on a card finds it in the same place here. `withMenu: false` drops it entirely
  // — the article dialog moves Topic history to a footer button, so its header
  // carries no kebab.
  //
  // ORDER is the host's: the feed pane leads with provenance then the claim — the
  // card's own order, door and room agreeing. The wider article DIALOG passes
  // `titleFirst` so the claim is the hero and the "Competitors · age · status" run
  // sits UNDER it, which is what the two-column layout has room for.
  //
  // The two verbs are NEVER in the header — the pane hangs them on its sticky
  // actions bar, the dialog keeps them in its footer.
  const menu = withMenu ? renderTopicMenu(topic, { open: menuOpen }) : "";
  const provenance = renderProvenance(topic, source);
  const title = html`<h2 class="topic-article__title">${topicTitle(topic)}</h2>`;
  const order = titleFirst ? `${title}${provenance}` : `${provenance}${title}`;
  return html`<div class="topic-article__head${raw(titleFirst ? " topic-article__head--title-first" : "")}">
    ${raw(menu)}${raw(order)}
  </div>`;
}

/**
 * The prose and the evidence. `withHeader: false` for a host that renders the
 * identity itself, outside the scroller — printing it twice would be the same
 * sentence twice.
 */
export function renderTopicArticle(
  topic,
  { source = null, withHeader = true, menuOpen = false, actions = "", withPosts = true, headerOpts = {} } = {},
) {
  if (!topic) return "";
  const article = topic.article || {};
  const paragraphs = article.paragraphs || [];
  const subheads = article.subheads || [];

  // The prose is authored as N paragraphs under M subheads, where the subheads
  // mark where a section STARTS. Two subheads and three paragraphs means the
  // second section runs to the end — so a subhead is emitted before the
  // paragraph at its own index and the rest of the paragraphs fall under the
  // last one opened. Never a section per paragraph: that turned a two-part
  // analysis into a list of headed fragments.
  const body = paragraphs
    .map((p, i) => {
      const head = subheads[i] ? html`<h3 class="topic-article__subhead">${subheads[i]}</h3>` : "";
      return html`${raw(head)}
        <p class="topic-article__para">${p}</p>`;
    })
    .join("");

  const posts = topic.posts || [];

  // ── A "later" Topic is a theme kept, not a draft yet ──────────────────────
  // It leads with a CALLOUT that says so — draftability, not absence of content:
  // the analysis still shows below it (all `later` Topics carry a finished one,
  // 136 words on average). ⚠️ Do NOT turn this into the old placeholder that
  // REPLACED the prose with "not enough to write a detailed version" while the
  // detailed version sat in the data — the callout sits ABOVE the analysis, it
  // does not stand in for it. The message is the true one: not enough to DRAFT
  // from yet, use it in chat to fill the gap or leave it for a later run.
  const laterCallout = topic.kind === "later" ? renderLaterCallout() : "";

  return html`<div class="topic-article">
    ${raw(withHeader ? renderTopicHeader(topic, { source, menuOpen, ...headerOpts }) : "")}
    <!-- The "For later" callout leads the article — a theme kept, not draftable
         yet — above the analysis, never in its place. -->
    ${raw(laterCallout)}
    <!-- Band 1: what this Topic is for and why it landed. Renders nothing at all
         on the 43 Topics of 52 that carry neither field. -->
    ${raw(renderRelevance(topic))}
    <!-- Band 2: the analysis. The "For later" draftability note is no longer a
         thin line at the bottom of the prose — it is the callout at the top. -->
    <div class="topic-article__body">${raw(body)}</div>
    ${raw(renderArticleBottom(topic, { actions, posts: withPosts ? posts : [] }))}
  </div>`;
}

// ── The pane's bottom: the verbs and the evidence, one grey band ───────────
// The sticky action bar carries the "Contributing posts N" disclosure on its
// LEFT and the verbs on its right; opening it unfolds the posts BELOW, in the same
// grey. So the whole bottom of the pane is one continuous band — verbs always in
// reach, evidence a click away — rather than a bar and a separate section under it.
//
// The checkbox, the bar and the tray are siblings so the CSS `~` disclosure works
// (`.topic-article__section-check:checked ~ .topic-article__posts` shows the tray,
// `~ .topic-article__actionbar .…-toggle` turns the chevron). No JS: the renderer
// is pure and the pane has nowhere to keep an open flag.
//
// A host with posts but NO verbs (none today) still gets the standalone collapsible
// section; a host with verbs but no posts gets just the bar. The dialog passes
// withPosts:false, so its posts live in the side panel and never reach here.
function renderArticleBottom(topic, { actions = "", posts = [] } = {}) {
  if (!actions) {
    return posts.length
      ? html`<section class="topic-article__section">${raw(renderTopicPosts(topic, { collapsible: true }))}</section>`
      : "";
  }
  const id = `topic-posts-${topic.id}`;
  const toggle = posts.length
    ? html`<label class="ap-link standalone topic-article__posts-toggle" for="${escapeAttr(id)}">
        <span>Contributing posts</span>
        <span class="ap-counter normal grey">${String(posts.length)}</span>
        <i class="ap-icon-chevron-down topic-article__section-toggle" aria-hidden="true"></i>
      </label>`
    : "";
  return html`${raw(
      posts.length ? html`<input type="checkbox" class="topic-article__section-check" id="${escapeAttr(id)}" />` : "",
    )}
    <div class="topic-article__actionbar">${raw(toggle)}${raw(actions)}</div>
    ${raw(
      posts.length
        ? html`<div class="topic-article__posts topic-article__posts--tray">
            ${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}
          </div>`
        : "",
    )}`;
}

// ── The "For later" callout ────────────────────────────────────────────────
// A centred block at the top of a `later` Topic's article: a soft icon medallion,
// a title and one sentence, on the article's grey-05 ground. It says the theme is
// kept but not draftable yet — it sits ABOVE the analysis, never in its place.
function renderLaterCallout() {
  return html`<div class="topic-article__later">
    <span class="topic-article__later-icon" aria-hidden="true"><i class="ap-icon-note"></i></span>
    <h3 class="topic-article__later-title">Not enough data to write a detailed version yet</h3>
    <p class="topic-article__later-body">
      There's not enough content or assets around this topic to create a draft yet. Use the topic in chat if you have
      assets that fill the gaps, or leave it here and let a future run add more details.
    </p>
  </div>`;
}

// ── The evidence, behind ONE disclosure ───────────────────────────────────
// Collapsed, the section is a single line: "Contributing posts 6" and a chevron.
// The article is a reading surface and these cards are the heaviest thing on it —
// the only blocks wearing a fill, ~100px each — so two of them stack 200px of grey
// under the analysis that is the actual deliverable. Folded away, the reader gets
// prose, then the apparatus stated in one line, then the evidence on demand. Same
// judgement that moved the trail behind the kebab, one step short of it: the trail
// is meta, this is the argument's own footing, so it stays in the article.
//
// ⚠️ THIS REPLACED A CAP, and deliberately: the section used to show the first two
// posts and put the rest behind a second "N more posts" link. A collapsible
// section plus that link is TWO nested disclosures for one list, and the reader
// has to operate both to see six posts. So `POST_CAP`, `__more` and
// `__posts-rest` are gone — open the section and every post is there.
//
// ── ALWAYS closed, whatever the kind ─────────────────────────────────────
// ⚠️ `later` Topics opened expanded for one commit, on the argument that they
// have no draftable angle so the posts ARE the material. It was the wrong trade:
// a resting state that changes with a field the reader cannot see is a rule they
// have to discover, and the panel it was protecting is not actually empty — a
// `later` Topic still shows its title, its facts and its full analysis (136 words
// on average) above this line. `8d8d0b4b` was about REPLACING prose with a false
// placeholder, which is a different thing from folding supporting evidence behind
// a labelled, counted disclosure. One resting state, no exception.
//
// The disclosure is a sibling checkbox, not <details> and not the DS accordion:
//   • this renderer is PURE and has three hosts, none of which has anywhere to
//     keep an open flag — the same reason the trail used one;
//   • `.ap-accordion` would put a FRAMED BOX around blocks that already wear a
//     fill. The article has exactly one framed species (the two facts) and one
//     filled species (these cards); a third device saying "section" is what the
//     hairline above this heading was already removed for. It would also give the
//     header 14/700 dark ink, outranking the 12/700 light apparatus label the rest
//     of the article uses.
export function renderTopicPosts(topic, { collapsible = true } = {}) {
  const posts = topic?.posts || [];
  if (!posts.length) return "";
  const list = html`<div class="topic-article__posts">
    ${raw(posts.map((pp) => renderSocialPostCard(pp)).join(""))}
  </div>`;
  // Shown directly, no disclosure — the article dialog's right-hand panel, where
  // the posts ARE the panel's content, so folding them away would leave it empty.
  if (!collapsible) {
    return html`<h3 class="topic-article__section-head topic-article__section-head--static">
        <span>Contributing posts</span>
        <span class="ap-counter normal grey">${String(posts.length)}</span>
      </h3>
      ${raw(list)}`;
  }
  const id = `topic-posts-${topic.id}`;
  return html`<input type="checkbox" class="topic-article__section-check" id="${escapeAttr(id)}" />
    <!-- The <h3> stays, so the document outline does not lose a section to a
         label. The label inside it is what makes the whole ROW the target — the
         count, the chevron and every pixel of air between them, edge to edge, at a
         control's height. It was one 18px text line for a while: full width, so it
         looked right in the CSS, and still something you had to aim at. -->
    <h3 class="topic-article__section-head">
      <label class="ap-link standalone topic-article__section-label" for="${escapeAttr(id)}">
        <!-- "Contributing posts", not "Sources": a Source in this app is
             something you bring INTO a chat, and these are the evidence the
             analysis was written from. Naming them Sources put two different
             objects under one word on the same screen. -->
        <span>Contributing posts</span>
        <!-- The count is why folding these away costs nothing: it says how much
             evidence exists, so the section defers it rather than hiding it. -->
        <span class="ap-counter normal grey">${String(posts.length)}</span>
        <i class="ap-icon-chevron-down topic-article__section-toggle" aria-hidden="true"></i>
      </label>
    </h3>
    <div class="topic-article__posts">${raw(posts.map((pp) => renderSocialPostCard(pp)).join(""))}</div>`;
}

// ── The state chips: ONE species, five tones, TWO hosts ───────────────────
// Every state a Topic carries renders as a DS Tag — `.ap-tag <tone>` + glyph +
// word, from the tone and icon topics-catalog declares per state.
//
// This lives HERE, beside the header it belongs to, and `topic-card.js` imports
// it: the chips are part of a Topic's identity, and the identity has exactly one
// declaration in this feature. It was private to the card, which is why the
// article header carried no signal at all — a reader who clicked a card marked
// Trending landed on a page that never mentioned it.
//
// ⚠️ This replaced TWO renderers that put one vocabulary at two levels: the two
// signals were already DS pills, while Already used and Ignored were bare neutral
// icons with a `title`, and For later was not on the card at all — it was a whole
// tab. A pill, an icon and a tab for what a reader thinks of as one list.
//
// ⚠️ IT WAS `.ap-status`, and that was the wrong sibling. Status has no icon slot,
// so the glyph had to be smuggled into the dot's place with `no-dot` — a modifier
// whose whole job is to REMOVE the dot, used to repurpose it. Tag styles `> i` and
// `> span` as real slots (12px glyph, 180px truncating label), carries a border as
// well as a fill so a chip has an edge, and ships the five tones this vocabulary
// needs. Height, radius, padding and type all resolve from --comp-tag-*, so this
// still costs no CSS of its own.
//
// One consequence, and it is a fix: Tag has no plain-`orange` modifier. Trending
// wore `orange` — the AI / spotlight ACTION colour the header's Use-in-chat primary
// owns — on a static chip. It takes `tagOrange` now, and Updated moves to
// `menthol`, cool against Trending's warm so the two signals differ rather than
// reading as two shades of one thing.
//
// `new` renders nothing, and that is the design: it is the absence of an answer,
// the most common value in any feed, and a glyph meaning "nothing has happened
// yet" is the one thing a glyph cannot say. It keeps its filter row.
//
// A Topic can wear more than one — Already used AND Trending is a real state, and
// showing both is the point. They sit in one group at the end of the meta run so
// the run wraps as a unit instead of one chip at a time.
//
// Colour is never the only signal: each chip carries its word, so a colour-blind
// reader and a screen reader both get "Trending" either way. The `title` carries
// the state's hint, which says what it MEANS rather than repeating the label.
export function renderTopicStates(topic) {
  const chips = topicStates(topic)
    .map((id) => findTopicState(id))
    .filter((st) => st && st.chip)
    .map(
      (st) =>
        html`<span class="ap-tag ${st.tone}" title="${st.label} — ${st.hint}">
          <i class="${st.icon}" aria-hidden="true"></i><span>${st.label}</span>
        </span>`,
    )
    .join("");
  if (!chips) return "";
  return html`<span class="topic-states">${raw(chips)}</span>`;
}

// Where it came from, how old it is and what states it carries, on one line ABOVE
// the title — the kicker. Sentence case and caption size, a run of facts rather
// than a labelled header block. Part for part the card's own meta run, in the same
// order and in the same position, because this line and that one describe the same
// Topic and a reader crosses both.
//
// A <div>, not a <p>: the chips are spans inside spans, but the run as a whole is
// now facts plus controls-adjacent marks rather than one sentence.
function renderProvenance(topic, source) {
  return html`<div class="topic-article__provenance">
    ${raw(
      source
        ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
              ><i class="${source.icon}"></i></span
            ><span class="topic-article__source">${source.name}</span>`
        : "",
    )}
    <!-- The separator belongs to the source, not to the age: with no source to
         separate from, a leading "· 2h ago" is a dangling punctuation mark. -->
    <span>${source ? `· ${topic.ageLabel}` : topic.ageLabel}</span>
    <!-- The chips come last on the line and are pushed to its END (CSS
         margin-left: auto), a common right edge with the feed card's chips so the
         signals own the same edge in both columns. They stop at the kebab's
         reserved gutter, not the pane edge. -->
    ${raw(renderTopicStates(topic))}
  </div>`;
}

// ── Relevance and Why now ──────────────────────────────────────────────────
// Two rows at most, and only the ones the Topic actually carries. They answer
// who the Topic is for and why it landed now, which is what a reader needs
// before the analysis rather than after it.
//
// NEITHER row is ever tinted, under any signal. Why now used to take the signal's
// tint - peach for a spike, menthol for a rewrite - and it went with the rest of
// the article's colour-coding: painting a spike as a warning tone is the same
// mistake as painting Ignore red. The card still says the signal, in words.
// ── The two quick facts: a definition list, NOT two filled boxes ──────────
// A <dl> whose labels share one grid column, so both sentences start on the same
// x and the pair reads as two ROWS rather than two objects.
//
// ⚠️ They were two grey blocks, and that was one of five things wearing the same
// fill on this surface — the facts, the placeholder, the evidence cards and the
// trail all on --app-surface-subtle. Five greys of equal weight is a column of
// slabs: the blur test showed no hierarchy at all. A fill is the loudest thing a
// block can wear, so exactly one KIND of thing gets one here (the quoted posts,
// below), and everything else earns its separation from spacing and type.
//
// Two facts, two short sentences: they cost ~70px like this against ~130px as
// boxes, and they stop competing with the analysis they introduce.
const FACTS = [
  { key: "relevance", label: "Relevance", icon: "ap-icon-target" },
  { key: "whyNow", label: "Why now", icon: "ap-icon-clock" },
];

function renderRelevance(topic) {
  // A <div> per pair - which a <dl> is allowed to carry - is what lets each fact
  // be its own BOUNDED block rather than two rows sharing one flow.
  const blocks = FACTS.filter((f) => topic[f.key]).map(
    (f) =>
      html`<div class="topic-article__fact">
        <dt class="topic-article__fact-label"><i class="${f.icon}" aria-hidden="true"></i><span>${f.label}</span></dt>
        <dd class="topic-article__fact-text">${topic[f.key]}</dd>
      </div>`,
  );
  if (!blocks.length) return "";
  return html`<dl class="topic-article__facts">${raw(blocks.join(""))}</dl>`;
}

// ── The trail ──────────────────────────────────────────────────────────────
// It is no longer IN the article. It was the last band and a collapsed DS
// accordion, which cost the reading surface its one framed box for something
// that is meta - not part of the argument - and that has a SINGLE entry on 38 of
// the 50 Topics carrying one. Behind the header's kebab it costs nothing until
// asked for, and the box it gave up is what the two facts now wear.
//
// This exports the ROWS only, so the trail stays one renderer with two
// placements: the feed opens it in a modal, the dialog swaps to it as a third
// view rather than stacking an overlay on an overlay (modal-coordinator's
// requestOpen closes the active overlay, so a modal from inside the picker would
// close the picker). Placement is the host's; what the trail SAYS is not.
//
// A trail entry's status is any of the six states — it carries `updated` and
// `trending` as well as the three triage ones — which is exactly what the single
// TOPIC_STATES vocabulary now covers. This used to be a hand-written map of five
// words beside a `findReviewStatus` that only knew three; one vocabulary means one
// place to change a label.
const trailLabel = (id) => findTopicState(id)?.label || id;

function trailLength(topic) {
  return (topic?.history || []).length;
}

// ── The status medallion, adopted from the DS "Post History" timeline ──────
// Each row leads with a circular colour-coded icon, the same shape and read as
// the Post History design. It reuses the `topic-badge` primitive (tinted -10
// ground, glyph on -100/-150) — the app's one tinted-icon pip, already on the
// card and the header — with a `--round` variant, rather than inventing a second
// medallion. The colour is the state's OWN tone (so the medallion matches the
// chip the reader already knows) and the glyph is the state's OWN icon.
//
// `tone → topic-badge accent`: the tag tones don't share the badge's accent
// names one-for-one, so the pairs are spelled out. `new` ("To review") carries
// no chip tone or icon — it is the absence of an answer — so it falls back to a
// neutral grey ground and the antenna glyph, the mark of the scan that surfaced
// it.
const TRAIL_ACCENT = { tagOrange: "orange", menthol: "menthol", green: "green", blue: "electric-blue", grey: "grey" };

function trailMark(status) {
  const st = findTopicState(status);
  const accent = TRAIL_ACCENT[st?.tone] || "grey";
  const icon = st?.icon || "ap-icon-antenna";
  // grey is the base `.topic-badge`, so it takes no accent modifier.
  const accentClass = accent === "grey" ? "" : ` topic-badge--${accent}`;
  return { icon, accentClass };
}

export function renderTopicTrail(topic) {
  const trail = topic?.history || [];
  if (!trail.length) return "";
  const rows = trail
    .map((h) => {
      const { icon, accentClass } = trailMark(h.status);
      // The time is pushed to the row's right edge (CSS margin-left: auto on the
      // when), the analysis line on the left — the Post History layout: mark ·
      // action … time, then the note on its own line under the action.
      return html`<li class="topic-article__trail-row">
        <span class="topic-badge topic-badge--lg topic-badge--round${raw(accentClass)}" aria-hidden="true">
          <i class="${icon}"></i>
        </span>
        <div class="topic-article__trail-main">
          <div class="topic-article__trail-head">
            <strong class="topic-article__trail-status">${trailLabel(h.status)}</strong>
            <span class="topic-article__trail-when">${h.when}</span>
          </div>
          ${raw(h.note ? html`<p class="topic-article__trail-note">${h.note}</p>` : "")}
        </div>
      </li>`;
    })
    .join("");

  return html`<ol class="topic-article__trail">
    ${raw(rows)}
  </ol>`;
}

// ── The header's kebab ─────────────────────────────────────────────────────
// One item today, and it is deliberately a MENU rather than a bare icon that
// fires straight away: `...` is unlabelled until it opens, so the label has to
// live somewhere, and the cards already teach this exact control. The open flag
// belongs to the host - this renderer is pure - so each host passes it in.
//
// Nothing to show, no control: a Topic with no trail renders no kebab rather
// than a menu whose only item is empty.
function renderTopicMenu(topic, { open = false } = {}) {
  const count = trailLength(topic);
  if (!count) return "";
  return html`<div class="topic-article__tools">
    <button
      type="button"
      class="ap-icon-button transparent topic-article__more"
      data-topic-trail-menu="${escapeAttr(topic.id)}"
      aria-haspopup="menu"
      aria-expanded="${open ? "true" : "false"}"
      aria-label="More about this Topic"
    >
      <i class="ap-icon-more"></i>
    </button>
    ${raw(
      open
        ? html`<div class="ap-action-dropdown topic-article__menu" role="menu">
            <button
              type="button"
              role="menuitem"
              class="ap-action-dropdown-item"
              data-topic-trail="${escapeAttr(topic.id)}"
            >
              <i class="ap-icon-history"></i>
              <div class="ap-action-dropdown-item-text">
                <div class="ap-action-dropdown-item-label-container">
                  <span class="ap-action-dropdown-item-label">Topic history</span>
                </div>
              </div>
            </button>
          </div>`
        : "",
    )}
  </div>`;
}

/**
 * The footer's verbs.
 *
 * Two, and the same two everywhere the article is shown — plus, optionally, the
 * host's own way out. `close` names it and the dialog's footer takes it; a falsy
 * `close` omits it, for a host that already renders one (the pane puts it in the
 * header, opposite the title).
 *
 * Use in chat is the PRIMARY and it is ORANGE: it hands the Topic to Archie, and
 * orange is the AI / spotlight action everywhere else in this app. Ignore is a
 * stroked grey secondary, not a red one — ignoring hides a Topic that ticking
 * Ignored brings straight back, so nothing is destroyed and red would be flagging
 * a danger that is not there.
 *
 * An ignored Topic swaps Ignore for Un-ignore: one slot, two directions, never
 * both, because they are one decision read from opposite ends.
 */
export function renderTopicActions(topic, { close = "Close" } = {}) {
  if (!topic) return "";
  const ignored = topic.status === "ignored";
  // Secondary FIRST, primary LAST — the affirmative action is the one you reach
  // last, and in the pane this group is right-aligned so "last" also means
  // closest to the edge the eye lands on. It was the other way round for a
  // commit, which put Ignore in the position the primary should hold.
  return html`<div class="topic-article__actions">
    <!-- The way out comes FIRST and the primary LAST, which is the order the DS
         dialog footer prescribes and the order topic-ignore-modal.js already uses
         (Cancel, then the action). It used to be [Ignore][Use in chat][Close] with
         Close shoved right by a margin - a hand-rolled footer layout inside a
         component that ships one. -->
    ${raw(
      close
        ? html`<button type="button" class="ap-button transparent grey topic-article__close" data-topic-close>
            ${close}
          </button>`
        : "",
    )}
    ${raw(
      ignored
        ? html`<button type="button" class="ap-button stroked grey" data-topic-unignore="${escapeAttr(topic.id)}">
            <i class="ap-icon-eye-on"></i><span>Un-ignore</span>
          </button>`
        : html`<button type="button" class="ap-button stroked grey" data-topic-ignore="${escapeAttr(topic.id)}">
            <i class="ap-icon-eye-off"></i><span>Ignore</span>
          </button>`,
    )}
    <button type="button" class="ap-button primary orange" data-topic-use="${escapeAttr(topic.id)}">
      <i class="ap-icon-single-chat-bubble"></i><span>Use in chat</span>
    </button>
  </div>`;
}
