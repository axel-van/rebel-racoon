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
    <button type="button" class="ap-card top-post-card" data-top-post-open="${post.id}">
      <span class="top-post-card__id">
        <span class="top-post-card__head">
          <span class="top-post-card__net">
            <i class="${iconFor(post.network)}" aria-hidden="true"></i>
            ${labelFor(post.network)}
          </span>
          <span class="ap-status green no-dot top-post-card__badge">${post.perfBadge}</span>
        </span>
        <span class="top-post-card__excerpt">${post.excerpt}</span>
        <span class="top-post-card__meta">${post.publishedAt} · ${post.topic}</span>
      </span>

      <span class="top-post-card__perf">
        <span class="top-post-card__stats">
          <span class="top-post-stat top-post-stat--hero">
            <span class="top-post-stat__value">${post.vsAvg}×</span>
            <span class="top-post-stat__label">vs avg</span>
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
      </span>

      <span class="top-post-card__why">
        <span class="top-post-card__why-label">
          <i class="ap-icon-sparkles" aria-hidden="true"></i> Why it worked
        </span>
        <span class="top-post-card__why-text">${post.whyItWorked}</span>
      </span>

      <span class="top-post-card__cta"> View details <i class="ap-icon-arrow-right" aria-hidden="true"></i> </span>
    </button>
  `;
}

// ── Conversation echo ────────────────────────────────────────────────
// Compact card shown in the thread when the user picks a winner to build on
// (assistant.postTopPostPickTurn → renderTopPostPickTurn in session.js), so the
// chosen post stays visible as a real preview rather than a truncated text echo.
export function renderTopPostEcho(post) {
  if (!post) return "";
  return html`
    <div class="top-post-echo">
      <span class="top-post-echo__head">
        <i class="${iconFor(post.network)}" aria-hidden="true"></i>
        <span class="top-post-echo__net">${labelFor(post.network)}</span>
        <span class="ap-status green no-dot">${post.perfBadge}</span>
      </span>
      <span class="top-post-echo__excerpt">${post.excerpt}</span>
      <span class="top-post-echo__stats">
        <b>${post.vsAvg}×</b> vs avg · ${post.engagementRate}% eng · ${formatCompact(post.impressions)} reach
      </span>
    </div>
  `;
}

// ── Preview panel ────────────────────────────────────────────────────
// Rendered into the right-panel "top-post" mode (right-panel.js → openTopPost).
// Three blocks: a detailed stats grid, a faithful network-style preview of the
// published post, and the actions (Build on this + open the real post).

// Plausible per-network permalink. The prototype has no real post ids, so this
// is cosmetic — it demonstrates the "go see it on the network" affordance.
const NET_HOME = {
  linkedin: "https://www.linkedin.com/feed/",
  x: "https://x.com/",
  twitter: "https://x.com/",
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/",
  youtube: "https://www.youtube.com/",
};

function postUrl(post) {
  return NET_HOME[(post.network || "").toLowerCase()] || "#";
}

function statTile(value, label, hero = false) {
  return `<div class="tp-stat${hero ? " tp-stat--hero" : ""}">
    <span class="tp-stat__value">${value}</span>
    <span class="tp-stat__label">${label}</span>
  </div>`;
}

export function renderTopPostPreview(post) {
  if (!post) return "";
  const net = labelFor(post.network);
  // The three analytical metrics that drive the decision. The raw engagement
  // counts (reactions / comments / shares) live in the Exact-post card below,
  // so they're not duplicated here.
  const stats = [
    statTile(`${post.vsAvg}×`, "vs your average", true),
    statTile(`${post.engagementRate}%`, "engagement rate"),
    statTile(formatCompact(post.impressions), "reach"),
  ].join("");

  const hashtags = (post.hashtags || []).length
    ? `<p class="tp-post__hashtags">${post.hashtags.map((h) => `#${h}`).join(" ")}</p>`
    : "";

  return html`
    <div class="tp-preview">
      <div class="tp-preview__head">
        <span class="tp-preview__net">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
          ${net}
        </span>
        <span class="ap-status green no-dot">${post.perfBadge}</span>
      </div>

      <section class="tp-preview__section">
        <h3 class="tp-preview__title">How it performed</h3>
        <div class="tp-stats">${raw(stats)}</div>
        <div class="tp-why">
          <span class="tp-why__label"><i class="ap-icon-sparkles" aria-hidden="true"></i> Why it worked</span>
          <span class="tp-why__text">${post.whyItWorked}</span>
        </div>
      </section>

      <section class="tp-preview__section">
        <h3 class="tp-preview__title">Exact post</h3>
        <article class="tp-post">
          <header class="tp-post__head">
            <span class="tp-post__avatar" aria-hidden="true"><i class="${iconFor(post.network)}"></i></span>
            <span class="tp-post__byline">
              <span class="tp-post__author">Your brand</span>
              <span class="tp-post__meta">${post.publishedAt} · ${net}</span>
            </span>
          </header>
          <p class="tp-post__body">${post.excerpt}</p>
          ${raw(hashtags)}
          <div class="tp-post__engagement">
            <span
              ><i class="ap-icon-thumb-up_fill" aria-hidden="true"></i> ${(post.reactions ?? 0).toLocaleString()}</span
            >
            <span>${(post.comments ?? 0).toLocaleString()} comments</span>
            <span>${(post.saves ?? post.shares ?? 0).toLocaleString()} ${post.saves != null ? "saves" : "shares"}</span>
          </div>
        </article>
      </section>

      <div class="tp-preview__actions">
        <button type="button" class="ap-button primary orange" data-top-post-build="${post.id}">
          <i class="ap-icon-sparkles" aria-hidden="true"></i> Build on this
        </button>
        <a class="ap-button stroked" href="${postUrl(post)}" target="_blank" rel="noopener noreferrer">
          View on ${net} <i class="ap-icon-external-link" aria-hidden="true"></i>
        </a>
      </div>
    </div>
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
