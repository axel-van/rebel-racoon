// social-post-card — one published post by SOMEONE ELSE, shown as evidence.
//
// ── It IS the production mini-post ─────────────────────────────────────────
// The markup below is a port of `ap-mini-post` from agorapulse/platform
// (conversation/commons/frontend/libs/ui/src/lib/components/mini-post), the
// component Listening already uses to show a post in a list. Same anatomy, same
// class names, same tokens:
//
//   .mini-post
//     .mini-post-top       -left(avatar + -content(-title, -date)) · -right(action)
//     .mini-post-content   the post's text
//     .mini-post-bottom    .post-engagement — the stats run
//     [view-on]            a slot AFTER the bottom, not inside it
//
// The class names are production's rather than this component's own on purpose:
// a reader who knows the Listening card should recognise this one as the same
// object, and anything that changes there can be diffed against this file. What
// stays `social-post-card__*` is only what this surface adds — the avatar tint
// and the compact variant.
//
// Deliberately NOT top-post-card. That component resolves identity through the
// brand's own connected profiles and frames its numbers as a performance
// decision (the ×-vs-average hero, a Repurpose CTA, a permalink built from your
// own post id) — it assumes the post is yours. A competitor's or a creator's
// post has an author who isn't you, and its engagement is evidence for a claim
// rather than a metric you act on.
//
//   renderSocialPostCard(post, { compact }) → one evidence card
//
// Pure render except for ONE thing: the sentiment is a menu, so this module keeps
// the chosen values and the open state and binds a single delegated listener via
// init(). Everything else is still a function of its arguments. Post shape (see
// mocks.topics):
//   { id, network, publishedOn,
//     author: { name, handle, initials, accent }, text,
//     likes, comments, reposts }
//
// `compact: true` drops the engagement row and clamps the text to two lines —
// for when a single representative post rides inside a chat turn or a card
// footer rather than a reading surface. mini-post has no such variant; this is
// the one thing here production does not carry.
//
// NOT ported, and why: `--seen` and `--selected`, plus the hover border. All
// three are states of a card you SELECT in a triage list. The sentiment is the
// only thing here you can act on, and a whole-card hover accent would suggest the
// card itself opens something.
//
// The network mark uses the DS `-official` glyphs, which carry the brand's own
// colours baked into the icon (they're SVG data-URI backgrounds, not font
// glyphs), so nothing here has to hardcode a third-party hex.

import { html, raw, escapeAttr } from "../utils.js?v=21";

const NET_ICON = {
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-twitter-official",
  twitter: "ap-icon-twitter-official",
  instagram: "ap-icon-instagram-official",
  facebook: "ap-icon-facebook-official",
  tiktok: "ap-icon-tiktok-official",
  youtube: "ap-icon-youtube-official",
};

const NET_LABEL = {
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Avatar tints the card knows how to paint (see social-post-card.css). An
// unknown accent falls back to grey rather than rendering an unstyled circle —
// an invalid DS colour fails silently, which is worse than a plain one.
const ACCENTS = new Set([
  "grey",
  "purple",
  "red",
  "menthol",
  "orange",
  "green",
  "electric-blue",
  "yellow",
  "soft-blue",
]);

// 1400 → "1.4K", 41800 → "42K", 640 → "640". Engagement here is read at a
// glance to size a claim, never compared digit by digit.
function formatCompact(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
}

function iconFor(network) {
  return NET_ICON[(network || "").toLowerCase()] || "ap-icon-share";
}

function labelFor(network) {
  return NET_LABEL[(network || "").toLowerCase()] || network || "Social";
}

function accentFor(author) {
  const a = (author.accent || "").toLowerCase();
  return ACCENTS.has(a) ? a : "grey";
}

// ── Sentiment ──────────────────────────────────────────────────────────────
// `ap-post-sentiment` (commons/ui/components/post-sentiment), NOT
// `.sentiment-main-container`. Listening has both and picks between them on one
// `@if` in listening-feed-search-list-item: with update permission the slot gets
// `ap-listening-sentiment-state-menu`, whose `.sentiment-main-container` is a
// DROPDOWN TRIGGER — that is where its cursor:pointer, its hover ground and its
// padding come from. Without the permission it gets `ap-post-sentiment`, a plain
// read-out. This card cannot change a sentiment, so it is the read-out.
//
// The first version here ported the trigger and then stripped the interaction off
// it, which produced the right pixels for the wrong reason and left a class named
// after a menu on a card with no menu.
//
// Colours come from SENTIMENT_SETTINGS (listening/model/sentiment), whose entries
// carry the token name in a comment beside each hex — so green-150 / red-150 /
// grey-80 are its values, not ones chosen here.
const SENTIMENT = {
  positive: { label: "Positive", icon: "ap-icon-sentiment-positive", tone: "positive" },
  negative: { label: "Negative", icon: "ap-icon-sentiment-negative", tone: "negative" },
  neutral: { label: "Neutral", icon: "ap-icon-sentiment-neutral", tone: "neutral" },
};

// Cue words, English and Dutch — the seed's competitor posts are in both, and a
// list that only reads English would mark every Belgian retailer neutral.
//
// This is a PROTOTYPE STAND-IN and nothing more. Real sentiment arrives on the
// item from Listening's own scoring; `post.sentiment` overrides this whenever the
// data carries it, which is the seam to keep when this stops being mock data.
// Deliberately crude rather than clever: a bag of words cannot read irony, so it
// stays on the safe side and answers "neutral" whenever the two sides tie.
const POSITIVE_CUES =
  /\b(favoriet\w*|geniet\w*|zonnig\w*|blij|mooi|top|shop|unlock\w*|reimagined?|introducing|announc\w*|excited?|delighted?|proud|love\b|best\b|winner|congrat\w*|thrilled)\b|[☀✨🌞🎉💡🙌]/i;
const NEGATIVE_CUES =
  /\b(turned it off|barely|never|without ever|problem\w*|broken|worse|fail\w*|disappoint\w*|frustrat\w*|annoy\w*|stop\w* arriving|argue|complain\w*|jammer|slecht|helaas)\b/i;

// The four-state model has an UNDEFINED too, drawn with ap-icon-sentiment-none.
// It is not reachable here: every post this card renders has text to read, so
// there is always an answer, even if that answer is "neutral". A state nothing
// can produce is a state to leave out rather than to render grey.
function sentimentFor(post) {
  // Three sources, most recent first: what the reader chose here, what the data
  // shipped with, then the guess. The reader's choice wins outright — a menu whose
  // pick can be overruled by a bag of cue words is a menu that does nothing.
  const picked = chosen.get(post.id);
  if (SENTIMENT[picked]) return SENTIMENT[picked];
  const explicit = (post.sentiment || "").toLowerCase();
  if (SENTIMENT[explicit]) return SENTIMENT[explicit];
  const text = String(post.text || "");
  const pos = POSITIVE_CUES.test(text);
  const neg = NEGATIVE_CUES.test(text);
  if (pos && !neg) return SENTIMENT.positive;
  if (neg && !pos) return SENTIMENT.negative;
  return SENTIMENT.neutral;
}

// ── The sentiment, and its menu ────────────────────────────────────────────
// Listening picks between two components on one @if in
// listening-feed-search-list-item: `ap-post-sentiment` when the reader cannot
// change the value, `ap-listening-sentiment-state-menu` when they can. This card
// is the SECOND now — the sentiment is a judgement about someone else's post and
// a reader looking at the evidence is exactly who would disagree with it.
//
// So `.sentiment-container` > `.sentiment-main-container` is back, and with it the
// cursor and the hover ground the previous pass stripped: they are what the
// trigger needs, and removing them was only right while nothing opened.
//
// The menu is the DS Action Dropdown, built from the CSS-UI classes the way the
// topic card's kebab already builds one. Production passes ActionDropdownItems
// with `startSymbolId` and `startSymbolColor: item.color`, so each row's glyph
// carries its own sentiment colour — unlike the TRIGGER, where only the label is
// coloured and the glyph stays grey. Both are deliberate and both are copied.
//
// `ap-action-dropdown__content` in the DOM you inspected is the Angular
// component's own inner element, not something the CSS-UI layer ships — the
// framework-agnostic anatomy the DS documents is `.ap-action-dropdown` holding
// `.ap-action-dropdown-item`s, which is what this builds.
const MENU_ORDER = ["positive", "neutral", "negative"];

// Chosen values, by post id. A prototype store rather than a field on the post:
// mocks.js is seed data, and a choice the reader makes at runtime is not seed.
// This is the seam where a real app would PATCH the item and let the store
// re-emit — sentimentFor() reads it first for exactly that reason.
const chosen = new Map();

// Rendered posts, by id, so the delegated handler can repaint one card's block
// without its host knowing anything about sentiment. The hosts here — the Sources
// dialog, the article, the topic dialog — render a list and never re-render on a
// leaf's state, which is why the card owns this rather than taking `menuOpen` the
// way brief-card takes it from its screen.
const rendered = new Map();
let openFor = null;
let listening = false;

function renderMenu(post) {
  const current = sentimentFor(post).tone;
  const rows = MENU_ORDER.map((tone) => {
    const s = SENTIMENT[tone];
    return html`<button
      type="button"
      role="menuitemradio"
      aria-checked="${tone === current ? "true" : "false"}"
      class="ap-action-dropdown-item"
      data-sentiment-pick="${escapeAttr(post.id)}"
      data-tone="${tone}"
    >
      <i class="${s.icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${s.label}</span>
        </div>
      </div>
    </button>`;
  }).join("");
  return html`<div class="ap-action-dropdown post-sentiment__menu" role="menu">${raw(rows)}</div>`;
}

// The wrapper's INNER html, so the delegated handler can replace it in place.
function renderSentimentInner(post) {
  const s = sentimentFor(post);
  const open = openFor === post.id;
  return html`<div
      class="sentiment-main-container"
      role="button"
      tabindex="0"
      aria-haspopup="menu"
      aria-expanded="${open ? "true" : "false"}"
      data-sentiment-trigger="${escapeAttr(post.id)}"
    >
      <i class="${s.icon}" role="img" aria-label="Sentiment: ${s.label}"></i>
      <span class="sentiment-label" data-tone="${s.tone}">${s.label}</span>
    </div>
    ${raw(open ? renderMenu(post) : "")}`;
}

function renderSentiment(post) {
  rendered.set(post.id, post);
  return html`<div class="sentiment-container" data-sentiment-wrap="${escapeAttr(post.id)}">
    ${raw(renderSentimentInner(post))}
  </div>`;
}

// Repaint one wrapper, wherever it is on the page. Two of them can be on screen
// at once (a Topic dialog over a feed), so this addresses by id rather than by
// "the open one".
function repaint(postId) {
  const post = rendered.get(postId);
  const wrap = document.querySelector(`[data-sentiment-wrap="${CSS.escape(postId)}"]`);
  if (post && wrap) wrap.innerHTML = renderSentimentInner(post);
}

// One listener for every card on the page, bound once. The card's hosts render
// lists and own no sentiment state, so pushing this up to them would mean teaching
// three modals about a leaf's menu; the coordinator modules in this repo take the
// same shape for the same reason.
export function init() {
  if (listening) return;
  listening = true;

  document.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-sentiment-pick]");
    if (pick) {
      const id = pick.getAttribute("data-sentiment-pick");
      chosen.set(id, pick.getAttribute("data-tone"));
      openFor = null;
      repaint(id);
      return;
    }

    const trigger = event.target.closest("[data-sentiment-trigger]");
    const id = trigger && trigger.getAttribute("data-sentiment-trigger");
    const previous = openFor;
    // Toggling, and closing whatever else was open — one menu at a time, the rule
    // modal-coordinator enforces for overlays.
    openFor = trigger && previous !== id ? id : null;
    if (previous && previous !== openFor) repaint(previous);
    if (openFor) repaint(openFor);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !openFor) return;
    const id = openFor;
    openFor = null;
    repaint(id);
  });
}

// "View on <network>" — the same affordance top-post-card.js offers on a winner,
// deliberately identical so one gesture means one thing wherever a post appears.
// `.top-post-view-on` paints it; `.post__view-on` places it, and is ap-post's own
// class for this link — `margin-left: auto`, so it takes the right edge of the
// actions row it now shares with the sentiment.
//
// It used to be a SIBLING of the bottom, on the strength of mini-post's
// [mini-post-view-on] slot sitting at article level. That slot exists because
// mini-post's one consumer projects nothing else; ap-post, the sibling component
// that carries a sentiment AND a link, puts the two on one row. See renderBottom.
//
// The URL comes off the post (`post.url`), unlike top-post-card which BUILDS a
// permalink from the id. It can here: these posts arrive from a listening export
// that already carries `post_link`, so there is a real address to open rather than
// a plausible one to construct.
//
// Rendered only when there is a url. A "View on" that goes to "#" is worse than no
// link — it looks like the app failed rather than like the data is thin.
function renderViewOn(post) {
  if (!post.url) return "";
  const network = labelFor(post.network);
  return html`<a
    class="top-post-view-on post__view-on"
    href="${post.url}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="View original post on ${network}"
    ><span>View on</span><i class="${iconFor(post.network)}" aria-hidden="true"></i
  ></a>`;
}

// ── .mini-post-bottom ──────────────────────────────────────────────────────
// Two lines: the engagement run, then an actions row carrying the sentiment and
// the way out.
//
// The ACTIONS ROW is `.post__footer-actions`, lifted from ap-post
// (commons/ui/components/post) rather than invented. mini-post's own template
// offers two separate holes — a [mini-post-sentiment] slot inside the bottom and
// a [mini-post-view-on] slot after it — and its one consumer, the screening
// modal, fills only the second, so it never had to decide how the two sit
// together. ap-post is the sibling that carries BOTH, and its answer is one row:
//
//   .post__footer          column, flex-start, gap xxs   (= .mini-post-bottom)
//   .post__footer-actions  row, centre, gap xs, width 100%
//   .post__view-on         margin-left: auto
//
// That is why the link is no longer a sibling of the bottom with
// `align-self: flex-end`. Stacked, it made three lines of chrome — stats, then
// sentiment, then a link on its own — under a two-line post. On one row the
// sentiment reads against the figures it belongs with, and the link keeps the
// right edge to itself.
//
// The engagement run is guarded rather than the bottom, matching production's
// `@if (stats.length > 0)`: a post with no engagement still has a sentiment and
// still has somewhere to go.
function renderBottom(post, { compact = false } = {}) {
  const stats = [
    { count: post.likes, noun: "likes" },
    { count: post.comments, noun: "comments" },
    { count: post.reposts, noun: "reposts" },
  ].filter((s) => Number(s.count) > 0);

  // compact keeps the way out and drops everything that is commentary on the
  // post — it rides inside a chat turn, where three lines of chrome under two
  // lines of quote is the tail wagging the dog.
  const run =
    compact || !stats.length
      ? ""
      : html`<section class="post-engagement" aria-label="Post engagement statistics">
          ${raw(
            stats
              .map((s) => html`<span>${formatCompact(s.count)} ${s.noun}</span>`)
              .join('<span class="separator" aria-hidden="true"></span>'),
          )}
        </section>`;

  const sentiment = compact ? "" : renderSentiment(post);
  const viewOn = renderViewOn(post);
  const actions =
    sentiment || viewOn ? html`<div class="post__footer-actions">${raw(sentiment)}${raw(viewOn)}</div>` : "";

  if (!run && !actions) return "";
  return html`<div class="mini-post-bottom">${raw(run)}${raw(actions)}</div>`;
}

export function renderSocialPostCard(post, { compact = false } = {}) {
  if (!post) return "";
  const author = post.author || {};
  const accent = accentFor(author);
  const network = labelFor(post.network);
  // The handle is what a reader recognises; the full name is the fallback for
  // brand pages that post under a name rather than an @.
  const identity = author.handle || author.name || "Unknown";

  return html`<article class="mini-post social-post-card${raw(compact ? " social-post-card--compact" : "")}">
    <!-- TOP. The title is production's three-column grid — text, a 4px dot, then
         the subtitle — and the date is a <time> on its own line beneath it. This
         used to be one "LinkedIn · 2 weeks ago" caption under the name; splitting
         it is what the grid is for, and it puts the network where a reader looks
         for the author's context rather than in the middle of a timestamp. -->
    <div class="mini-post-top">
      <div class="mini-post-top-left">
        <div class="mini-post-top-avatar">
          <span
            class="ap-avatar ${raw(compact ? "size-24" : "size-40")} social-post-card__avatar"
            data-accent="${accent}"
          >
            <span class="ap-avatar-initials">${author.initials || "?"}</span>
          </span>
        </div>
        <div class="mini-post-top-content">
          <h3 class="mini-post-top-title">
            <span class="mini-post-top-title-text">${identity}</span>
            <span class="mini-post-top-title-separator" aria-hidden="true"></span>
            <span class="mini-post-top-title-subtitle">${network}</span>
          </h3>
          <time class="mini-post-top-date">${post.publishedOn}</time>
        </div>
      </div>
      <!-- The action slot. In Listening it holds a menu; here it holds the network
           mark, which is the only thing this card ever puts in that corner. -->
      <div class="mini-post-top-right">
        <i class="${iconFor(post.network)} social-post-card__net" aria-label="${network}" role="img"></i>
      </div>
    </div>
    <div class="mini-post-content">
      <span class="mini-post-content-text">${post.text}</span>
    </div>
    ${raw(renderBottom(post, { compact }))}
  </article>`;
}
