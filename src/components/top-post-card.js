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
// engagement rate and reach, recency, topic, and the percentile badge. Pure
// render; no module-local state (the active sort lives in top-posts-flow's
// picker state).

import { html, raw } from "../utils.js?v=21";
import { profileForNetwork, NETWORK_ICON_BY_PLATFORM, BRAND_INITIALS } from "../social-profiles.js?v=22";

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
    <article class="ap-card top-post-card">
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

      <div class="top-post-card__actions">
        <button type="button" class="ap-button stroked grey" data-top-post-details="${post.id}">Details</button>
        <button type="button" class="ap-button primary blue" data-top-post-repurpose="${post.id}">Repurpose</button>
      </div>
    </article>
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

  // Rendered as the inner of the DS .ap-dialog (top-post-modal.js): header
  // (post identity) + content (2-col analytics / exact post) + footer (actions,
  // hug + right-aligned per the DS dialog footer).
  return html`
    <button class="ap-dialog-close" type="button" data-tpm-close aria-label="Close">
      <i class="ap-icon-close"></i>
    </button>
    <div class="ap-dialog-header">
      <span class="tp-preview__head">
        <span class="tp-preview__net">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
          ${net}
        </span>
        <span class="ap-status green no-dot">${post.perfBadge}</span>
      </span>
    </div>

    <div class="ap-dialog-content">
      <div class="tp-preview tp-preview--split">
        <div class="tp-preview__col">
          <section class="tp-preview__section">
            <h3 class="tp-preview__title">How it performed</h3>
            <div class="tp-stats">${raw(stats)}</div>
          </section>
        </div>

        <div class="tp-preview__col">
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
                  ><i class="ap-icon-thumb-up_fill" aria-hidden="true"></i> ${(
                    post.reactions ?? 0
                  ).toLocaleString()}</span
                >
                <span>${(post.comments ?? 0).toLocaleString()} comments</span>
                <span
                  >${(post.saves ?? post.shares ?? 0).toLocaleString()} ${post.saves != null ? "saves" : "shares"}</span
                >
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>

    <div class="ap-dialog-footer">
      <div class="ap-dialog-footer-right">
        <a class="ap-button stroked" href="${postUrl(post)}" target="_blank" rel="noopener noreferrer">
          View on ${net} <i class="ap-icon-external-link" aria-hidden="true"></i>
        </a>
        <button type="button" class="ap-button primary blue" data-top-post-build="${post.id}">Repurpose</button>
      </div>
    </div>
  `;
}

// ── Profile lens ─────────────────────────────────────────────────────
// Group the winners by network into "profile lenses" so the board can be
// explored one profile at a time. Each lens resolves its identity from the
// connected social profile when one exists (brand avatar + handle), falling
// back to the network's own icon + label so a winner on a not-yet-connected
// network (e.g. TikTok) is still reachable. Ordered by winner count, descending
// — the profile you've won most on leads.
function buildProfileLenses(posts) {
  const byNet = new Map();
  for (const p of posts || []) {
    const net = (p.network || "").toLowerCase();
    if (!net) continue;
    if (!byNet.has(net)) byNet.set(net, { network: net, count: 0 });
    byNet.get(net).count += 1;
  }
  return [...byNet.values()]
    .map((lens) => {
      const account = profileForNetwork(lens.network);
      return {
        ...lens,
        // The connected brand handle reads as a "profile"; otherwise the
        // network label keeps the lens honest about what it is.
        name: account?.handle || labelFor(lens.network),
        photo: account?.photo || null,
        networkIcon: NETWORK_ICON_BY_PLATFORM[lens.network] || iconFor(lens.network),
      };
    })
    .sort((a, b) => b.count - a.count);
}

// One profile chip — DS avatar (brand photo + corner network badge) + handle +
// winner count. Built on the shared .ap-filter-chip primitives (count, pressed
// state) but with its own `top-posts-profile-chip` modifier that lets the chip
// grow to fit the 24px avatar (the DS chip's fixed 24px height would crop it).
// Driven by aria-pressed; `data-top-post-profile` carries the network slug (or
// "all") back to the session delegation.
function renderProfileChip(lens, activeProfile) {
  const pressed = lens.network === activeProfile;
  const avatarInner = lens.photo
    ? `<img src="${lens.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${BRAND_INITIALS}</span>`;
  return html`<button
    type="button"
    class="ap-filter-chip top-posts-profile-chip"
    data-top-post-profile="${lens.network}"
    aria-pressed="${pressed ? "true" : "false"}"
  >
    <span class="ap-avatar size-24 top-posts-profile-chip__avatar" aria-hidden="true"
      >${raw(avatarInner)}<span class="ap-avatar-network"><i class="${lens.networkIcon}"></i></span
    ></span>
    <span>${lens.name}</span>
    <span class="ap-filter-chip-count">${lens.count}</span>
  </button>`;
}

// The full board: profile selector (primary lens) + sort toolbar + the sorted
// card grid. `sort` is one of SORTS[].key; `profile` is a network slug or "all"
// (defaults to "all" — every winner).
export function renderTopPostsBoard({ posts, sort = "performance", profile = "all" }) {
  const all = posts || [];
  const lenses = buildProfileLenses(all);
  // Guard against a stale profile filter (e.g. its last winner was removed):
  // fall back to "all" so the grid never renders empty.
  const activeProfile = profile !== "all" && lenses.some((l) => l.network === profile) ? profile : "all";

  const visible = activeProfile === "all" ? all : all.filter((p) => (p.network || "").toLowerCase() === activeProfile);

  const active = SORTS.find((s) => s.key === sort) || SORTS[0];
  const sorted = [...visible].sort(active.compare);
  // Re-rank the relative-performance bar within the visible set so the board
  // reads as "best posts for THIS profile", not against the global leader.
  const maxVsAvg = sorted.reduce((m, p) => Math.max(m, p.vsAvg || 0), 0);
  const count = sorted.length;

  // Profile selector — "All profiles" leads, then one chip per profile lens.
  const allChip = html`<button
    type="button"
    class="ap-filter-chip top-posts-profile-chip top-posts-profile-chip--all"
    data-top-post-profile="all"
    aria-pressed="${activeProfile === "all" ? "true" : "false"}"
  >
    <span class="ap-filter-chip-icon"><i class="ap-icon-feature-analytics" aria-hidden="true"></i></span>
    <span>All profiles</span>
    <span class="ap-filter-chip-count">${all.length}</span>
  </button>`;
  const profileChips = lenses.map((l) => renderProfileChip(l, activeProfile)).join("");

  const sortChips = SORTS.map(
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
      <div class="top-posts-profiles" role="group" aria-label="Explore winners by profile">
        ${raw(allChip)}${raw(profileChips)}
      </div>
      <div class="top-posts-toolbar">
        <span class="top-posts-toolbar__count">${count} winning ${count === 1 ? "post" : "posts"}</span>
        <div class="top-posts-sort" role="group" aria-label="Sort posts">
          <span class="top-posts-sort__label muted">Sort by</span>
          ${raw(sortChips)}
        </div>
      </div>
      <div class="top-posts-grid" role="group" aria-label="Your top-performing posts">${raw(cards)}</div>
    </div>
  `;
}
