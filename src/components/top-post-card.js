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

import { html, raw } from "../utils.js?v=21";
import { profileForNetwork, NETWORK_ICON_BY_PLATFORM, BRAND_INITIALS } from "../social-profiles.js?v=64";
import { renderEmptyState } from "./empty-state.js?v=1";

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
];

// Period filter — narrow the board to a recency window (spec: "filter by
// metrics"). `maxDays` is the inclusive age ceiling in days. Matched against each
// post's `daysAgo`. Default window is the first entry (last month).
export const PERIODS = [
  { key: "1m", label: "Last month", maxDays: 30 },
  { key: "3m", label: "Last 3 months", maxDays: 90 },
  { key: "6m", label: "Last 6 months", maxDays: 180 },
  { key: "1y", label: "Last year", maxDays: 365 },
];

// How many winners the board surfaces — the "Show my 20 top posts" promise.
// The board caps its sorted list at this; the CTA copy uses it too.
export const TOP_POSTS_LIMIT = 20;

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

// "View on <network>" link — a discreet text link + the network's own icon,
// opening the original post in a new tab. Shared by the board card footer and
// the conversation echo card so both use the same affordance.
function renderViewOnLink(post) {
  return `<a
      class="top-post-view-on"
      href="${postPermalink(post.network, post.id)}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View original post on ${labelFor(post.network)}"
    ><span>View on</span><i class="${iconFor(post.network)}" aria-hidden="true"></i></a>`;
}

// Post-type indicator — a small overlay pill (icon + label) shown bottom-left of
// every card's visual zone, so the board reads the format of each winner at a
// glance. Generalises the old carousel-only count badge to all post types
// (Text / Photo / Carousel · N / Video), mirroring the DS media overlay badges.
function postTypeBadge(post) {
  const type = post.mediaType || "text";
  const count = post.imageCount || 1;
  // Icon-only badge; a carousel shows its image count, a document its page count.
  let icon = "ap-icon-file--text";
  let title = "Text";
  let text = "";
  if (type === "video") {
    icon = "ap-icon-video";
    title = "Video";
  } else if (type === "document") {
    // LinkedIn Document — no preview, so the badge carries the page count.
    const pages = post.pageCount || 1;
    icon = "ap-icon-file--pdf";
    title = `Document · ${pages} pages`;
    text = `${pages} pages`;
  } else if (type === "image" && count > 1) {
    icon = "ap-icon-multiple-images";
    title = `Carousel · ${count} images`;
    text = String(count);
  } else if (type === "image") {
    icon = "ap-icon-image";
    title = "Photo";
  }
  return `<span class="top-post-card__type${text ? "" : " top-post-card__type--icon"}" title="${title}"><i class="${icon}" aria-hidden="true"></i>${text}</span>`;
}

// The media block inside the post-preview body, mirroring the Figma
// `.post Contructor` component: a rounded 16:9 media below the copy, with the
// post-type badge overlaid bottom-left.
//   image → poster image
//   text  → no media (the pull-quote note carries the card on its own)
function renderMediaBlock(post) {
  const type = post.mediaType || "text";
  if (type !== "image") return "";
  return `<div class="top-post-card__media top-post-card__media--image">
      <img class="top-post-card__media-img" src="${post.image}" alt="" loading="lazy" />
      ${postTypeBadge(post)}
    </div>`;
}

// A text-only winner has no media, so the pull-quote IS the card — and posts vary
// wildly in length (a one-line hook vs a network's max-length body). Scale the
// type to the length so short posts read big and punchy while long ones step down
// to fit more, and every tier line-clamps so the card height stays bounded (the
// copy truncates rather than growing the card / its grid row). Thresholds are on
// the rendered character count.
export function soloSizeTier(text) {
  const n = (text || "").length;
  if (n <= 70) return "top-post-card__text--xl";
  if (n <= 150) return "top-post-card__text--lg";
  if (n <= 300) return "top-post-card__text--md";
  return "top-post-card__text--sm";
}

export function renderTopPostCard(post) {
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
  const mediaHtml = renderMediaBlock(post);
  // Text-only winners have no media, so the copy IS the body: the pull-quote on a
  // soft "note" surface, with the post-type badge overlaid bottom-left (same as
  // the media cards). Media posts keep copy-above-media.
  const bodyInner = mediaHtml
    ? html`<p class="top-post-card__text">${post.excerpt}</p>
        ${raw(mediaHtml)}`
    : html` <div class="top-post-card__note">
        <p class="top-post-card__text top-post-card__text--solo ${soloSizeTier(post.excerpt)}">${post.excerpt}</p>
        ${raw(postTypeBadge(post))}
      </div>`;
  return html`
    <article class="ap-card top-post-card">
      <header class="top-post-card__preview-head">
        <span class="ap-avatar size-24 top-post-card__avatar" aria-hidden="true"
          >${raw(avatarInner)}<span class="ap-avatar-network"><i class="${networkIcon}"></i></span
        ></span>
        <span class="top-post-card__identity">
          <span class="top-post-card__author">${handle}</span>
          <span class="top-post-card__time">${post.publishedOn}</span>
        </span>
        ${raw(renderViewOnLink(post))}
      </header>

      <div class="top-post-card__body">${raw(bodyInner)}</div>

      <div class="top-post-card__perf">
        <div class="top-post-card__stats">${raw(statsHtml)}</div>
        <div class="top-post-card__foot">
          <span class="top-post-card__hero">
            <span class="top-post-card__hero-value">${post.vsAvg}×</span>
            <span class="top-post-card__hero-label">vs&nbsp;average</span>
          </span>
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
  // (image poster / text glyph) beside the posting profile, excerpt and a
  // trimmed stat line. Same visual language, one row tall.
  const type = post.mediaType || "text";
  let thumb;
  if (type === "text") {
    thumb = `<span class="top-post-echo__thumb top-post-echo__thumb--text"><i class="ap-icon-file--text" aria-hidden="true"></i></span>`;
  } else {
    thumb = `<span class="top-post-echo__thumb">${
      post.image ? `<img src="${post.image}" alt="" loading="lazy" />` : ""
    }</span>`;
  }
  // Lead with the posting profile (brand avatar + network badge + handle) — the
  // same identity the board card shows — not a bare network label. Falls back to
  // the network label when no connected profile resolves.
  const net = (post.network || "").toLowerCase();
  const account = profileForNetwork(post.network);
  const networkIcon = NETWORK_ICON_BY_PLATFORM[net] || iconFor(post.network);
  const handle = account?.handle || labelFor(post.network);
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${BRAND_INITIALS}</span>`;
  return html`
    <div class="top-post-echo">
      ${raw(thumb)}
      <div class="top-post-echo__body">
        <span class="top-post-echo__head">
          <span class="ap-avatar size-16 top-post-echo__avatar" aria-hidden="true"
            >${raw(avatarInner)}<span class="ap-avatar-network"><i class="${networkIcon}"></i></span
          ></span>
          <span class="top-post-echo__net">${handle}</span>
          ${raw(renderViewOnLink(post))}
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

// One selectable row — the echo card inside the DS radio-button card
// (`.ap-radio-card.card`): the card renders the radio dot (::before) + the
// selected/hover border, we just supply the content. The whole row is a
// `<label>` so clicking anywhere selects the (visually-hidden) real
// `<input type=radio>`; a shared `name` (per widget `group`) makes the rows a
// native single-select group. `disabled` freezes it once the pick is confirmed.
export function renderTopPostSelectRow(post, { selected = false, disabled = false, group = "" } = {}) {
  if (!post) return "";
  return html`
    <label class="ap-radio-card card top-posts-widget__row">
      <input
        type="radio"
        name="topposts-pick-${group}"
        value="${post.id}"
        data-topposts-widget-radio="${post.id}"
        ${raw(selected ? "checked" : "")}
        ${raw(disabled ? "disabled" : "")}
      />
      <div>${raw(renderTopPostEcho(post))}</div>
    </label>
  `;
}

// The widget card — header + single-select rows + a "Reuse this post" CTA.
// SINGLE-select (pick one winner, like the studio's per-card Repurpose). When
// `answered`, rows freeze and the footer drops (a static record of the pick).
// `group` scopes the radios' shared `name` to this widget so multiple widgets in
// one thread don't cross-select.
export function renderTopPostsWidget({ network, posts = [], selected = [], answered = false, group = "" } = {}) {
  const sel = new Set(selected);
  const rows = posts
    .map((p) => renderTopPostSelectRow(p, { selected: sel.has(p.id), disabled: answered, group }))
    .join("");
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
      <div class="top-posts-widget__list" role="radiogroup" aria-label="Pick one post to reuse">${raw(rows)}</div>
      ${raw(footer)}
    </div>
  `;
}

// Step 1 (pick which connected account to mine) is now the app's numbered
// Quickpicker (renderPicker), rendered by session.js from
// top-posts-flow.getProfileChoices() — no bespoke card grid here anymore.

// The board: Period/Sort toolbar + the sorted card grid, scoped to the profile
// chosen on step 1. `profile` is a network slug; `sort` is one of SORTS[].key.
// The board shows every matching winner (no pagination).
export function renderTopPostsBoard({ posts, sort = "performance", profile = null, period = "all" }) {
  const all = posts || [];
  // `profile` is a specific network chosen on the step-1 profile chooser;
  // "all" (or null) means no network filter.
  const activeProfile = profile && profile !== "all" ? profile.toLowerCase() : "all";

  const activePeriod = PERIODS.find((p) => p.key === period) || PERIODS[0];
  const byProfile =
    activeProfile === "all" ? all : all.filter((p) => (p.network || "").toLowerCase() === activeProfile);
  const visible = byProfile.filter((p) => (p.daysAgo ?? 0) <= activePeriod.maxDays);

  const active = SORTS.find((s) => s.key === sort) || SORTS[0];
  // Cap at the top N (the "Show my 20 top posts" promise) after sorting.
  const sorted = [...visible].sort(active.compare).slice(0, TOP_POSTS_LIMIT);
  const count = sorted.length;

  const cards = sorted.length
    ? sorted.map((p) => renderTopPostCard(p)).join("")
    : renderEmptyState({
        icon: "ap-icon-feature-analytics",
        title: "No best-performing posts in this window",
        body: "None of your posts beat your average for this period. Widen the time range to look further back.",
        wrapperClass: "session__empty top-posts-empty",
      });

  // One post is repurposed at a time (via each card's "Repurpose" button), so
  // the toolbar just holds the count + the Period/Sort filters. No multi-select
  // / bulk bar.
  const toolbar = html`
    <div class="top-posts-toolbar">
      <span class="top-posts-toolbar__count">${count} best-performing ${count === 1 ? "post" : "posts"}</span>
      <div class="top-posts-filters">
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
