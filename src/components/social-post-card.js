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
// Pure render, no store reads, no interactive children — the whole card is
// inert. Post shape (see mocks.topics):
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
// three are states of a card you can click in a triage list. Nothing here is
// clickable, and a hover accent on an inert card promises a click that never
// happens.
//
// The network mark uses the DS `-official` glyphs, which carry the brand's own
// colours baked into the icon (they're SVG data-URI backgrounds, not font
// glyphs), so nothing here has to hardcode a third-party hex.

import { html, raw } from "../utils.js?v=21";

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
// SENTIMENT_SETTINGS, ported from listening/model/sentiment. The production
// model carries hexes with the token written beside each in a comment; those
// comments are the tokens used here, so nothing is hardcoded.
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
  const explicit = (post.sentiment || "").toLowerCase();
  if (SENTIMENT[explicit]) return SENTIMENT[explicit];
  const text = String(post.text || "");
  const pos = POSITIVE_CUES.test(text);
  const neg = NEGATIVE_CUES.test(text);
  if (pos && !neg) return SENTIMENT.positive;
  if (neg && !pos) return SENTIMENT.negative;
  return SENTIMENT.neutral;
}

// .sentiment-container / .sentiment-main-container, ported from
// listening-sentiment-state-menu. In Listening this is the trigger for a dropdown
// that CHANGES the sentiment, which is where its cursor:pointer and hover ground
// come from. Neither is ported: this card is inert, and a hover state on a
// read-out promises a menu that will not open.
function renderSentiment(post) {
  const s = sentimentFor(post);
  return html`<div class="sentiment-container">
    <div class="sentiment-main-container" data-tone="${s.tone}">
      <i class="${s.icon}" aria-hidden="true"></i>
      <span>${s.label}</span>
    </div>
  </div>`;
}

// ── .mini-post-bottom · .post-engagement ───────────────────────────────────
// The stats run, ported from ap-post-engagement: bold, xs, grey-80, with a 4px
// round separator between entries rather than an icon in front of each.
//
// LABELS, not icon triples. The old row was a heart, a speech bubble and a
// refresh glyph, each with its number and an sr-only noun — three glyphs a
// sighted reader had to decode, and a noun only a screen reader ever got.
// Production's default branch renders `stat.label`, which is one string both
// readers get, and it is what makes a Repost legible as a Repost rather than as
// "the circular arrow one".
//
// The comment stat's icon variant (commentDisplay: 'icon') is NOT ported: it
// depends on ap-symbol and on a stat carrying a symbolId, and our posts carry
// three plain counts. Nothing here would gain from one of the three being drawn
// differently from the other two.
//
// The row collapses to nothing when there are no stats, the same way
// `:host:not(:has(.mini-post-bottom > *))` does in production — here it is a
// return rather than a selector, since we know at render time.
function renderBottom(post) {
  const stats = [
    { count: post.likes, noun: "likes" },
    { count: post.comments, noun: "comments" },
    { count: post.reposts, noun: "reposts" },
  ].filter((s) => Number(s.count) > 0);

  // Production guards the run itself (`@if (stats.length > 0)`) rather than the
  // bottom, because the sentiment beside it is a separate slot with its own
  // reason to exist. Same shape here: a post with no engagement still has a
  // sentiment, and dropping the whole row would take the sentiment with it.
  const run = stats.length
    ? html`<section class="post-engagement" aria-label="Post engagement statistics">
        ${raw(
          stats
            .map((s) => html`<span>${formatCompact(s.count)} ${s.noun}</span>`)
            .join('<span class="separator" aria-hidden="true"></span>'),
        )}
      </section>`
    : "";

  return html`<div class="mini-post-bottom">${raw(run)}${raw(renderSentiment(post))}</div>`;
}

// "View on <network>" — the same affordance top-post-card.js offers on a winner,
// deliberately identical so one gesture means one thing wherever a post appears.
// A SIBLING of the bottom rather than a child of it, which is where mini-post's
// own [mini-post-view-on] slot sits: the stats describe the post, the link leaves
// it, and production keeps those two on separate lines.
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
    class="top-post-view-on mini-post-view-on"
    href="${post.url}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="View original post on ${network}"
    ><span>View on</span><i class="${iconFor(post.network)}" aria-hidden="true"></i
  ></a>`;
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
    ${raw(compact ? "" : renderBottom(post))} ${raw(renderViewOn(post))}
  </article>`;
}
