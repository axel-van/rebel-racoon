// top-post-card — the milker's winner-selection board (top-posts-flow.js →
// renderTopPostsPickerScreen in session.js). This is the most important screen
// of the feature: the user has to confidently pick which winner to build on,
// so it's built for comparison, not just display.
//
//   renderTopPostsBoard({ posts, sort }) → sort toolbar + responsive card grid
//   renderTopPostCard(post, { selected }) → one decision card
//
// Each card leads with the decision metric (×-vs-average, big), backed by a
// relative-performance bar (sorted descending, value labels always visible),
// engagement rate and reach, recency, topic, and the percentile badge. Pure
// render; no module-local state (the active sort lives in top-posts-flow's
// picker state).

import { html, raw, escapeHtml } from "../utils.js?v=21";
import { profileForNetwork, NETWORK_ICON_BY_PLATFORM, BRAND_INITIALS } from "../social-profiles.js?v=23";
import { isFlagOn } from "../feature-flags.js?v=9";

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

// Period filter — narrow the board to a recency window (spec: "filter by
// metrics"). `maxDays` is the inclusive age ceiling in days; "all" keeps
// everything. Matched against each post's `daysAgo`.
export const PERIODS = [
  { key: "all", label: "All time", maxDays: Infinity },
  { key: "90d", label: "Last 90 days", maxDays: 90 },
  { key: "30d", label: "Last 30 days", maxDays: 30 },
];

// One compact DS .ap-select (a native <details> dropdown) for a filter axis —
// Period or Sort. Collapsing the old chip rows into two dropdowns keeps the
// toolbar to a single tidy line. Options carry the same data-* hooks the chips
// did (data-top-post-period / -sort), so the session delegation is unchanged;
// picking one re-renders the board, which closes the <details>.
function renderFilterSelect({ dataAttr, label, active, options }) {
  const opts = options
    .map((o) => {
      const on = o.key === active.key;
      return `<div
          class="ap-select-option${on ? " selected" : ""}"
          ${dataAttr}="${o.key}"
          role="option"
          aria-selected="${on ? "true" : "false"}"
        >
          <span class="ap-select-option-text">${o.label}</span>
          ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  return `<details class="ap-select top-posts-select">
      <summary class="ap-select-trigger">
        <span class="ap-select-inline-label">${label}</span>
        <span class="ap-select-value">${active.label}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="${label}">
        <div class="ap-select-options">${opts}</div>
      </div>
    </details>`;
}

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

// Permalink to the original post on its network — the "Open original" link.
// Prototype: these are mock winners, so we build a plausible per-network URL
// from the post id (opens in a new tab). A real integration would carry the
// permalink on the post payload instead.
const PERMALINK = {
  linkedin: (id) => `https://www.linkedin.com/feed/update/${id}`,
  x: (id) => `https://x.com/i/web/status/${id}`,
  twitter: (id) => `https://x.com/i/web/status/${id}`,
  instagram: (id) => `https://www.instagram.com/p/${id}/`,
  facebook: (id) => `https://www.facebook.com/${id}`,
};
function postPermalink(network, id) {
  const fn = PERMALINK[(network || "").toLowerCase()];
  return fn ? fn(id) : "#";
}

// Seconds → "M:SS" for the video duration pill.
function fmtDuration(s) {
  const sec = Math.max(0, Math.round(s || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// The preview tile at the top of every card, adapting to the post's media type:
//   video → poster image + play overlay + duration pill
//   image → poster image
//   text  → the excerpt featured as a large quote on a surface tile
// A uniform 16:9 box so the board grid stays regular whatever the mix.
function renderMediaTile(post) {
  const type = post.mediaType || "text";
  if (type === "text") {
    return `
      <div class="top-post-card__media top-post-card__media--text">
        <i class="ap-icon-file--text top-post-card__media-glyph" aria-hidden="true"></i>
        <p class="top-post-card__media-quote">${escapeHtml(post.excerpt)}</p>
      </div>`;
  }
  const img = `<img class="top-post-card__media-img" src="${post.image}" alt="" loading="lazy" />`;
  if (type === "video") {
    return `
      <div class="top-post-card__media top-post-card__media--video">
        ${img}
        <span class="top-post-card__media-play" aria-hidden="true"><i class="ap-icon-play_fill"></i></span>
        ${post.mediaDuration ? `<span class="top-post-card__media-dur">${fmtDuration(post.mediaDuration)}</span>` : ""}
      </div>`;
  }
  return `<div class="top-post-card__media top-post-card__media--image">${img}</div>`;
}

function renderTopPostCard(post) {
  // These are posts from the brand's own profiles, so the card leads with the
  // profile identity (brand avatar + network badge + handle) — the same lens the
  // board's profile chips sort by — rather than a bare network label. Falls back
  // to the network label when no connected profile resolves.
  const account = profileForNetwork(post.network);
  const net = (post.network || "").toLowerCase();
  const networkIcon = NETWORK_ICON_BY_PLATFORM[net] || iconFor(post.network);
  const handle = account?.handle || labelFor(post.network);
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${BRAND_INITIALS}</span>`;
  // Metric breakdown (Views / Reach / Reactions / Shares) — the raw counts the
  // decision leans on, below the ×-vs-average hero. Rendered as a 4-column strip
  // (value stacked over label) so each metric reads as its own scannable column
  // instead of a run-on line. IG surfaces Saves in place of Shares.
  const secondaryVal = post.saves != null ? post.saves : post.shares;
  const secondaryLabel = post.saves != null ? "Saves" : "Shares";
  const statsHtml = [
    [formatCompact(post.views), "Views"],
    [formatCompact(post.impressions), "Reach"],
    [formatCompact(post.reactions), "Reactions"],
    [formatCompact(secondaryVal), secondaryLabel],
  ]
    .map(
      ([v, l]) =>
        `<div class="top-post-card__stat"><span class="top-post-card__stat-value">${v}</span><span class="top-post-card__stat-label">${l}</span></div>`,
    )
    .join("");
  return html`
    <article class="ap-card top-post-card">
      ${raw(renderMediaTile(post))}

      <div class="top-post-card__head">
        <span class="top-post-card__profile">
          <span class="ap-avatar size-24 top-post-card__avatar" aria-hidden="true"
            >${raw(avatarInner)}<span class="ap-avatar-network"><i class="${networkIcon}"></i></span
          ></span>
          <span class="top-post-card__handle">${handle}</span>
        </span>
      </div>

      <div class="top-post-card__perf">
        <span class="top-post-card__hero">
          <span class="top-post-card__hero-value">${post.vsAvg}×</span>
          <span class="top-post-card__hero-label">vs&nbsp;average</span>
        </span>
        <div class="top-post-card__stats">${raw(statsHtml)}</div>
      </div>

      <div class="top-post-card__foot">
        <span class="top-post-card__meta">${post.publishedOn}</span>
        <div class="top-post-card__actions">
          <a
            class="ap-icon-button stroked"
            href="${postPermalink(post.network, post.id)}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open original post"
            title="Open original"
          >
            <i class="ap-icon-external-link" aria-hidden="true"></i>
          </a>
          <button type="button" class="ap-button primary blue top-post-card__cta" data-top-post-repurpose="${post.id}">
            Repurpose
          </button>
        </div>
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
  // A compact, chat-sized take on the board card: a small media thumbnail
  // (image / video poster + play + duration / text glyph) beside the network,
  // excerpt and a trimmed stat line. Same visual language, one row tall.
  const type = post.mediaType || "text";
  let thumb;
  if (type === "text") {
    thumb = `<span class="top-post-echo__thumb top-post-echo__thumb--text"><i class="ap-icon-file--text" aria-hidden="true"></i></span>`;
  } else {
    const overlay =
      type === "video"
        ? `<span class="top-post-echo__thumb-play" aria-hidden="true"><i class="ap-icon-play_fill"></i></span>${
            post.mediaDuration ? `<span class="top-post-echo__thumb-dur">${fmtDuration(post.mediaDuration)}</span>` : ""
          }`
        : "";
    thumb = `<span class="top-post-echo__thumb">${
      post.image ? `<img src="${post.image}" alt="" loading="lazy" />` : ""
    }${overlay}</span>`;
  }
  return html`
    <div class="top-post-echo">
      ${raw(thumb)}
      <div class="top-post-echo__body">
        <span class="top-post-echo__head">
          <i class="${iconFor(post.network)}" aria-hidden="true"></i>
          <span class="top-post-echo__net">${labelFor(post.network)}</span>
        </span>
        <span class="top-post-echo__excerpt">${post.excerpt}</span>
        <span class="top-post-echo__stats">
          <b class="top-post-echo__avg">${post.vsAvg}×</b> vs avg · <b>${formatCompact(post.views)}</b> views ·
          <b>${formatCompact(post.impressions)}</b> reach
        </span>
      </div>
    </div>
  `;
}

// ── Inline selection widget (Add-menu flow) ─────────────────────────
// A ChatGPT-apps-style interactive card embedded in the conversation: a compact,
// multi-select list of an account's winners + a confirm CTA. Reuses the echo
// card visuals; selection lives on the widget turn (assistant.js) and re-renders
// in place. `renderTopPostsWidgetTurn` in session.js wraps this in an AI turn.

// One selectable row — the echo card fronted by a toggle + check. The whole row
// is the toggle (data-topposts-widget-toggle); `disabled` freezes it once the
// selection is confirmed.
export function renderTopPostSelectRow(post, { selected = false, disabled = false } = {}) {
  if (!post) return "";
  return html`
    <button
      type="button"
      class="top-posts-widget__row${selected ? " is-selected" : ""}"
      data-topposts-widget-toggle="${post.id}"
      aria-pressed="${selected ? "true" : "false"}"
      ${raw(disabled ? "disabled" : "")}
    >
      <span class="top-posts-widget__check" aria-hidden="true"><i class="ap-icon-check"></i></span>
      ${raw(renderTopPostEcho(post))}
    </button>
  `;
}

// The widget card — header + single-select rows + a "Reuse this post" CTA.
// SINGLE-select (pick one winner, like the studio's per-card Repurpose). When
// `answered`, rows freeze and the footer drops (a static record of the pick).
export function renderTopPostsWidget({ network, posts = [], selected = [], answered = false } = {}) {
  const sel = new Set(selected);
  const rows = posts.map((p) => renderTopPostSelectRow(p, { selected: sel.has(p.id), disabled: answered })).join("");
  const footer = answered
    ? ""
    : `<div class="top-posts-widget__foot">
        <button
          type="button"
          class="ap-button primary blue top-posts-widget__cta"
          data-topposts-widget-confirm
          ${sel.size ? "" : "disabled"}
        >
          <span>Reuse this post</span>
        </button>
      </div>`;
  return html`
    <div class="top-posts-widget${answered ? " top-posts-widget--answered" : ""}" data-topposts-widget>
      <div class="top-posts-widget__head">
        <span class="top-posts-widget__title">
          <i class="${iconFor(network)}" aria-hidden="true"></i>
          Your top ${labelFor(network)} posts
        </span>
        <span class="top-posts-widget__hint muted">Pick one</span>
      </div>
      <div class="top-posts-widget__list">${raw(rows)}</div>
      ${raw(footer)}
    </div>
  `;
}

// ── Profile dropdown (flag OFF — the previous in-toolbar filter) ──────
// Group winners by network into lenses (name + avatar + count), rendered as a
// scalable DS .ap-select. Only used when the repurposeProfileFirst flag is OFF.
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
        name: account?.handle || labelFor(lens.network),
        photo: account?.photo || null,
        networkIcon: NETWORK_ICON_BY_PLATFORM[lens.network] || iconFor(lens.network),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function renderProfileOption(dataValue, { avatar, text, count, selected }) {
  return `<div
      class="ap-select-option${selected ? " selected" : ""}"
      data-top-post-profile="${dataValue}"
      role="option"
      aria-selected="${selected ? "true" : "false"}"
    >
      ${avatar || ""}
      <span class="ap-select-option-text">${text}</span>
      <span class="top-posts-select__count">${count}</span>
      ${selected ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
    </div>`;
}

function renderProfileSelect(lenses, activeProfile, total) {
  const activeLens = lenses.find((l) => l.network === activeProfile);
  const triggerValue = activeProfile === "all" ? "All profiles" : activeLens?.name || "All profiles";
  const allOpt = renderProfileOption("all", { text: "All profiles", count: total, selected: activeProfile === "all" });
  const rows = lenses
    .map((l) => {
      const avatarInner = l.photo
        ? `<img src="${l.photo}" alt="" />`
        : `<span class="ap-avatar-initials">${BRAND_INITIALS}</span>`;
      const avatar = `<span class="ap-avatar size-24 top-posts-select__opt-avatar" aria-hidden="true"
        >${avatarInner}<span class="ap-avatar-network"><i class="${l.networkIcon}"></i></span></span>`;
      return renderProfileOption(l.network, {
        avatar,
        text: l.name,
        count: l.count,
        selected: l.network === activeProfile,
      });
    })
    .join("");
  return `<details class="ap-select top-posts-select top-posts-profile-select">
      <summary class="ap-select-trigger">
        <span class="ap-select-inline-label">Profile</span>
        <span class="ap-select-value">${triggerValue}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Filter by profile">
        <div class="ap-select-options">${allOpt}${rows}</div>
      </div>
    </details>`;
}

// Step 1 (pick which connected account to mine) is now the app's numbered
// Quickpicker (renderPicker), rendered by session.js from
// top-posts-flow.getProfileChoices() — no bespoke card grid here anymore.

// The board: Period/Sort toolbar + the sorted card grid, scoped to the profile
// chosen on step 1. `profile` is a network slug; `sort` is one of SORTS[].key.
export function renderTopPostsBoard({ posts, sort = "performance", profile = null, period = "all" }) {
  const all = posts || [];
  // Flag ON (profile-first): `profile` is a specific network chosen upstream.
  // Flag OFF: `profile` is "all" (or a network) and an in-toolbar dropdown lets
  // the user switch — "all" means no network filter.
  const profileFirst = isFlagOn("repurposeProfileFirst");
  const activeProfile = profile && profile !== "all" ? profile.toLowerCase() : "all";

  const activePeriod = PERIODS.find((p) => p.key === period) || PERIODS[0];
  const byProfile =
    activeProfile === "all" ? all : all.filter((p) => (p.network || "").toLowerCase() === activeProfile);
  const visible = byProfile.filter((p) => (p.daysAgo ?? 0) <= activePeriod.maxDays);

  const active = SORTS.find((s) => s.key === sort) || SORTS[0];
  const sorted = [...visible].sort(active.compare);
  const count = sorted.length;

  const cards = sorted.length
    ? sorted.map((p) => renderTopPostCard(p)).join("")
    : `<p class="top-posts-empty">No winning posts in this window — try a wider period.</p>`;

  // One post is repurposed at a time (via each card's "Repurpose" button), so
  // the toolbar just holds the count + the Period/Sort filters (+ the Profile
  // dropdown in flag-OFF mode). No multi-select / bulk bar.
  const toolbar = html`
    <div class="top-posts-toolbar">
      <span class="top-posts-toolbar__count">${count} winning ${count === 1 ? "post" : "posts"}</span>
      <div class="top-posts-filters">
        ${raw(profileFirst ? "" : renderProfileSelect(buildProfileLenses(all), activeProfile, all.length))}
        ${raw(
          renderFilterSelect({
            dataAttr: "data-top-post-period",
            label: "Period",
            active: activePeriod,
            options: PERIODS,
          }),
        )}
        ${raw(renderFilterSelect({ dataAttr: "data-top-post-sort", label: "Sort", active, options: SORTS }))}
      </div>
    </div>
  `;

  return html`
    <div class="top-posts-board">
      ${raw(toolbar)}
      <div class="top-posts-grid" role="group" aria-label="Your top-performing posts">${raw(cards)}</div>
    </div>
  `;
}
