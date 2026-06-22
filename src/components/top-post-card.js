// top-post-card — visual selection card for the "Use top performing posts"
// milker's first screen (top-posts-flow.js → renderTopPostsPickerScreen in
// session.js). Each card is a button that picks that winner to build on.
//
// Pure render; no module-local state. The grid is the entry screen the user
// asked for in place of a numbered quick-picker: full-colour network logo,
// a green performance badge (green = performance, per the brand convention),
// the post excerpt, its headline metrics, and the "why it worked" insight.

import { html, raw } from "../utils.js?v=21";

// Full-colour DS logos per network. `x`/`twitter` share the X mark.
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

function iconFor(network) {
  return NET_ICON[(network || "").toLowerCase()] || "ap-icon-share";
}

function labelFor(network) {
  return NET_LABEL[(network || "").toLowerCase()] || network;
}

// One winner card. `html` escapes interpolations by default, so the excerpt /
// metric / why strings are safe to drop in directly.
export function renderTopPostCard(post) {
  return html`
    <button type="button" class="ap-card top-post-card" data-top-post-pick="${post.id}">
      <span class="top-post-card__head">
        <span class="top-post-card__net">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
          ${labelFor(post.network)}
        </span>
        <span class="ap-status green no-dot top-post-card__badge">${post.perfBadge}</span>
      </span>
      <span class="top-post-card__excerpt">${post.excerpt}</span>
      <span class="top-post-card__metrics">${post.metricLine}</span>
      <span class="top-post-card__why">
        <i class="ap-icon-sparkles keep-sparkle" aria-hidden="true"></i>
        <span><b>Why it worked:</b> ${post.whyItWorked}</span>
      </span>
      <span class="top-post-card__cta"> Build on this <i class="ap-icon-arrow-right" aria-hidden="true"></i> </span>
    </button>
  `;
}

// The full selection grid. Caller passes the list of top posts.
export function renderTopPostsGrid(posts) {
  return html`<div class="top-posts-grid" role="group" aria-label="Your top-performing posts">
    ${raw((posts || []).map((p) => renderTopPostCard(p)).join(""))}
  </div>`;
}
