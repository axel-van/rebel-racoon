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

import { html, raw } from "../utils.js?v=1209";

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

export function renderSocialPostCard(post, { compact = false } = {}) {
  if (!post) return "";
  const author = post.author || {};
  const accent = accentFor(author);
  const network = labelFor(post.network);
  // The handle is what a reader recognises; the full name is the fallback for
  // brand pages that post under a name rather than an @.
  const identity = author.handle || author.name || "Unknown";

  // ── The engagement row, as `ap-post-engagement` writes it ────────────────
  // ⚠️ NAMED metrics, separated by the same 4px dot as the identity. The real
  // component renders each stat as its own LABEL — "3 likes" — and reserves an
  // icon for exactly one of them, the comment count. This card had a heart, a
  // speech bubble and a refresh glyph each followed by a bare number, which breaks
  // the house rule outright: a metric has to be named in text, because an icon
  // beside a figure never identifies the data. A repost glyph and a like glyph are
  // a guess either way.
  //
  // A zero is not a measurement, it is the absence of one — and three zeroes in a
  // row on a quiet post read as a broken widget. Omitted rather than printed, so
  // the row only ever shows what happened.
  const metrics = [
    { n: post.likes, label: (v) => `${v} ${Number(post.likes) === 1 ? "like" : "likes"}` },
    { n: post.comments, icon: "ap-icon-single-chat-bubble", sr: "comments" },
    { n: post.reposts, label: (v) => `${v} ${Number(post.reposts) === 1 ? "repost" : "reposts"}` },
  ].filter((m) => Number(m.n) > 0);

  const stats =
    compact || !metrics.length
      ? ""
      : html`<div class="social-post-card__stats">
          ${raw(
            metrics
              .map((m, i) => {
                const sep = i ? html`<span class="social-post-card__stat-dot" aria-hidden="true"></span>` : "";
                const body = m.icon
                  ? html`<span class="social-post-card__stat">
                      <i class="${m.icon}" aria-hidden="true"></i><span>${formatCompact(m.n)}</span>
                      <span class="social-post-card__sr">${m.sr}</span>
                    </span>`
                  : html`<span class="social-post-card__stat">${m.label(formatCompact(m.n))}</span>`;
                return html`${raw(sep)}${raw(body)}`;
              })
              .join(""),
          )}
        </div>`;

  // ── The anatomy is the product's own listening card ──────────────────────
  // Modelled on `ap-mini-post` (conversation/commons/frontend/libs/ui) — the
  // component the real Listening feed renders every item with. Three parts, in its
  // order: top (avatar · identity · date), content (the text), bottom (engagement).
  //
  // What changed to match it:
  //   • the network mark is a BADGE ON THE AVATAR (`.ap-avatar-network`, a shipped
  //     class this app was not using) instead of an icon floating at the card's top
  //     right. That is where a reader of the real product looks for it, and it
  //     couples the network to the author rather than to the card.
  //   • the identity splits in two: `name · @handle` on one line with the DS's 4px
  //     dot separator, then the date on its own line. It was `@handle` over
  //     "Network · date", which spent the second line on a fact the avatar badge
  //     now carries and hid the full name entirely.
  //   • avatar 40px, not 32 — mini-post's size.
  return html`<article class="social-post-card${raw(compact ? " social-post-card--compact" : "")}">
    <header class="social-post-card__head">
      <span class="ap-avatar ${raw(compact ? "size-32" : "size-40")} social-post-card__avatar" data-accent="${accent}">
        <span class="ap-avatar-initials">${author.initials || "?"}</span>
        <span class="ap-avatar-network" aria-label="${network}" role="img">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
        </span>
      </span>
      <span class="social-post-card__identity">
        <span class="social-post-card__title">
          <span class="social-post-card__author">${identity}</span>
          ${raw(
            author.name && author.handle && author.name !== author.handle
              ? html`<span class="social-post-card__dot" aria-hidden="true"></span>
                  <span class="social-post-card__handle">${author.name}</span>`
              : "",
          )}
        </span>
        <time class="social-post-card__date">${post.publishedOn}</time>
      </span>
    </header>
    <p class="social-post-card__text">${post.text}</p>
    ${raw(stats)}
  </article>`;
}
