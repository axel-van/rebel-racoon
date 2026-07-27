// social-post-card — one published post by SOMEONE ELSE, shown as evidence.
//
// Deliberately NOT top-post-card. That component resolves identity through
// profileForNetwork() + BRAND_INITIALS — it assumes the post is yours — and its
// whole information design is the performance decision (the ×-vs-average hero,
// the Views/Reach/Reactions/Shares strip, a Repurpose CTA, a permalink built
// from your own post id). A competitor's or creator's post has an author who
// isn't you, and its numbers are evidence for a claim, not a metric you act on.
//
//   renderSocialPostCard(post, { compact }) → one evidence card
//
// Pure render, no store reads. Post shape (see mocks.researchFindings):
//   { id, network, publishedOn,
//     author: { name, handle, initials, accent }, text,
//     likes, comments, reposts, image? }
//
// `compact: true` drops the engagement row and clamps the text to two lines —
// used when one representative post rides inside a chat turn.

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

// 41800 → "41.8K". Same idiom as top-post-card's formatCompact — engagement
// counts are read at a glance, not compared digit by digit.
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

export function renderSocialPostCard(post, { compact = false } = {}) {
  if (!post) return "";
  const author = post.author || {};
  const accent = author.accent || "grey";

  // Same DS avatar primitives top-post-card uses (.ap-avatar + the network
  // badge), so the two read as one family even though the data differs.
  const avatar = html`<span
    class="ap-avatar ${raw(
      compact ? "size-24" : "size-32",
    )} social-post-card__avatar social-post-card__avatar--${accent}"
    aria-hidden="true"
    ><span class="ap-avatar-initials">${author.initials || "?"}</span
    ><span class="ap-avatar-network"><i class="${iconFor(post.network)}"></i></span
  ></span>`;

  const stats = compact
    ? ""
    : html`<div class="social-post-card__stats">
        <span class="social-post-card__stat">
          <i class="ap-icon-heart" aria-hidden="true"></i>
          <span>${formatCompact(post.likes)}</span>
          <span class="social-post-card__stat-label">likes</span>
        </span>
        <span class="social-post-card__stat">
          <i class="ap-icon-double-chat-bubbles" aria-hidden="true"></i>
          <span>${formatCompact(post.comments)}</span>
          <span class="social-post-card__stat-label">comments</span>
        </span>
        <span class="social-post-card__stat">
          <i class="ap-icon-refresh" aria-hidden="true"></i>
          <span>${formatCompact(post.reposts)}</span>
          <span class="social-post-card__stat-label">reposts</span>
        </span>
      </div>`;

  return html`<article class="social-post-card${raw(compact ? " social-post-card--compact" : "")}">
    <header class="social-post-card__head">
      ${raw(avatar)}
      <span class="social-post-card__identity">
        <span class="social-post-card__author">${author.handle || author.name || "Unknown"}</span>
        <span class="social-post-card__meta">${labelFor(post.network)} · ${post.publishedOn}</span>
      </span>
    </header>
    <p class="social-post-card__text">${post.text}</p>
    ${raw(
      post.image && !compact ? html`<div class="social-post-card__media"><img src="${post.image}" alt="" /></div>` : "",
    )}
    ${raw(stats)}
  </article>`;
}
