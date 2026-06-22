// top-post-card — the milker's winner-selection board (top-posts-flow.js →
// renderTopPostsPickerScreen in session.js). This is the most important screen
// of the feature: the user has to confidently pick which winner to build on,
// so it's built for comparison, not just display.
//
//   renderTopPostsBoard({ posts, sort }) → sort toolbar + responsive card grid
//   renderTopPostCard(post, { maxVsAvg }) → one decision card
//
// Each card leads with the decision metric (×-vs-average, big), backed by a
// relative-performance bar (sorted descending, value labels always visible),
// engagement rate and reach, recency, topic, the percentile badge, and the
// "why it worked" insight. Pure render; no module-local state (the active sort
// lives in top-posts-flow's picker state).

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

// Sort options for the toolbar. `key` matches data-top-post-sort + the picker
// state; `compare` sorts descending by the decision-useful value (recent sorts
// ascending by age). Always sorted so the strongest option for that lens is
// first (chart guidance: rank descending by value).
export const SORTS = [
  { key: "performance", label: "Performance", compare: (a, b) => b.vsAvg - a.vsAvg },
  { key: "engagement", label: "Engagement", compare: (a, b) => b.engagementRate - a.engagementRate },
  { key: "reach", label: "Reach", compare: (a, b) => b.impressions - a.impressions },
  { key: "recent", label: "Recent", compare: (a, b) => a.daysAgo - b.daysAgo },
];

function iconFor(network) {
  return NET_ICON[(network || "").toLowerCase()] || "ap-icon-share";
}

function labelFor(network) {
  return NET_LABEL[(network || "").toLowerCase()] || network;
}

// 41800 → "41.8K", 2030 → "2K", 940 → "940". Keeps reach scannable.
function formatCompact(n) {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
}

function renderTopPostCard(post, { maxVsAvg }) {
  // Relative-performance bar — this post's ×-vs-average against the strongest
  // in the current set, so the grid reads as a ranking at a glance.
  const pct = maxVsAvg > 0 ? Math.max(8, Math.round((post.vsAvg / maxVsAvg) * 100)) : 0;
  return html`
    <button type="button" class="ap-card top-post-card" data-top-post-pick="${post.id}">
      <span class="top-post-card__head">
        <span class="top-post-card__net">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
          ${labelFor(post.network)}
        </span>
        <span class="top-post-card__head-right">
          <span class="top-post-card__age">${post.publishedAt}</span>
          <span class="ap-status green no-dot top-post-card__badge">${post.perfBadge}</span>
        </span>
      </span>

      <span class="top-post-card__excerpt">${post.excerpt}</span>

      <span class="top-post-card__stats">
        <span class="top-post-stat top-post-stat--hero">
          <span class="top-post-stat__value">${post.vsAvg}×</span>
          <span class="top-post-stat__label">vs your avg</span>
        </span>
        <span class="top-post-stat">
          <span class="top-post-stat__value">${post.engagementRate}%</span>
          <span class="top-post-stat__label">engagement</span>
        </span>
        <span class="top-post-stat">
          <span class="top-post-stat__value">${formatCompact(post.impressions)}</span>
          <span class="top-post-stat__label">reach</span>
        </span>
      </span>

      <span class="top-post-card__bar" aria-hidden="true">
        <span class="top-post-card__bar-fill" style="width: ${pct}%"></span>
      </span>

      <span class="top-post-card__foot">
        <span class="ap-tag grey mini top-post-card__topic">${post.topic}</span>
        <span class="top-post-card__why">
          <i class="ap-icon-sparkles keep-sparkle" aria-hidden="true"></i>
          <span><b>Why it worked:</b> ${post.whyItWorked}</span>
        </span>
      </span>

      <span class="top-post-card__cta"> Build on this <i class="ap-icon-arrow-right" aria-hidden="true"></i> </span>
    </button>
  `;
}

// The full board: sort toolbar + the sorted card grid. `sort` is one of
// SORTS[].key (defaults to "performance").
export function renderTopPostsBoard({ posts, sort = "performance" }) {
  const active = SORTS.find((s) => s.key === sort) || SORTS[0];
  const sorted = [...(posts || [])].sort(active.compare);
  const maxVsAvg = sorted.reduce((m, p) => Math.max(m, p.vsAvg || 0), 0);
  const count = sorted.length;

  const chips = SORTS.map(
    (s) =>
      html`<button
        type="button"
        class="ap-filter-chip top-posts-sort__chip"
        data-top-post-sort="${s.key}"
        aria-pressed="${s.key === active.key ? "true" : "false"}"
      >
        ${s.label}
      </button>`,
  ).join("");

  const cards = sorted.map((p) => renderTopPostCard(p, { maxVsAvg })).join("");

  return html`
    <div class="top-posts-board">
      <div class="top-posts-toolbar">
        <span class="top-posts-toolbar__count">${count} winning ${count === 1 ? "post" : "posts"}</span>
        <div class="top-posts-sort" role="group" aria-label="Sort posts">
          <span class="top-posts-sort__label muted">Sort by</span>
          ${raw(chips)}
        </div>
      </div>
      <div class="top-posts-grid" role="group" aria-label="Your top-performing posts">${raw(cards)}</div>
    </div>
  `;
}
