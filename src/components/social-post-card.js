// social-post-card — one published post by SOMEONE ELSE, shown as evidence.
//
// Deliberately NOT top-post-card. That component resolves identity through the
// brand's own connected profiles and frames its numbers as a performance
// decision (the ×-vs-average hero, a Repurpose CTA, a permalink built from your
// own post id) — it assumes the post is yours. A competitor's or a creator's
// post has an author who isn't you, and its engagement is evidence for a claim
// rather than a metric you act on. Hence a separate, quieter card.
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
// footer rather than a reading surface.
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

// "View on <network>" — the same affordance top-post-card.js offers on a winner,
// deliberately identical so one gesture means one thing wherever a post appears.
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
    class="top-post-view-on social-post-card__view-on"
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

  // The engagement run and the View-on link share one row: both are "what happened
  // to this post", and stacking them would give a four-line card a fifth line for
  // one link. compact drops the stats but KEEPS the link — a post riding inside a
  // chat turn still needs a way out to the original.
  const footer =
    compact && !post.url
      ? ""
      : html`<div class="social-post-card__foot">
          ${raw(
            compact
              ? ""
              : html`<div class="social-post-card__stats">
                  <span class="social-post-card__stat">
                    <i class="ap-icon-heart" aria-hidden="true"></i>
                    <span>${formatCompact(post.likes)}</span>
                    <span class="social-post-card__sr">likes</span>
                  </span>
                  <span class="social-post-card__stat">
                    <i class="ap-icon-double-chat-bubbles" aria-hidden="true"></i>
                    <span>${formatCompact(post.comments)}</span>
                    <span class="social-post-card__sr">comments</span>
                  </span>
                  <span class="social-post-card__stat">
                    <i class="ap-icon-refresh" aria-hidden="true"></i>
                    <span>${formatCompact(post.reposts)}</span>
                    <span class="social-post-card__sr">reposts</span>
                  </span>
                </div>`,
          )}
          ${raw(renderViewOn(post))}
        </div>`;

  return html`<article class="social-post-card${raw(compact ? " social-post-card--compact" : "")}">
    <header class="social-post-card__head">
      <span class="ap-avatar ${raw(compact ? "size-24" : "size-32")} social-post-card__avatar" data-accent="${accent}">
        <span class="ap-avatar-initials">${author.initials || "?"}</span>
      </span>
      <span class="social-post-card__identity">
        <span class="social-post-card__author">${identity}</span>
        <span class="social-post-card__meta">${network} · ${post.publishedOn}</span>
      </span>
      <i class="${iconFor(post.network)} social-post-card__net" aria-label="${network}" role="img"></i>
    </header>
    <p class="social-post-card__text">${post.text}</p>
    ${raw(footer)}
  </article>`;
}
