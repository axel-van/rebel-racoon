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

function renderTopPostCard(post, { selected = false }) {
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
  return html`
    <article class="ap-card top-post-card${selected ? " top-post-card--selected" : ""}">
      <div class="top-post-card__head">
        <input
          type="checkbox"
          class="top-post-card__select"
          data-top-post-select="${post.id}"
          aria-label="Select for repurposing"
          ${selected ? "checked" : ""}
        />
        <span class="top-post-card__profile">
          <span class="ap-avatar size-24 top-post-card__avatar" aria-hidden="true"
            >${raw(avatarInner)}<span class="ap-avatar-network"><i class="${networkIcon}"></i></span
          ></span>
          <span class="top-post-card__handle">${handle}</span>
        </span>
        <span class="ap-status green no-dot top-post-card__badge">${post.perfBadge}</span>
      </div>

      <p class="top-post-card__excerpt">${post.excerpt}</p>

      <div class="top-post-card__perf">
        <span class="top-post-card__hero">
          <span class="top-post-card__hero-value">${post.vsAvg}×</span>
          <span class="top-post-card__hero-label">vs&nbsp;average</span>
        </span>
        <span class="top-post-card__submetrics"
          >${post.engagementRate}% engagement · ${formatCompact(post.impressions)} reach</span
        >
      </div>

      <div class="top-post-card__foot">
        <span class="top-post-card__meta">${post.publishedAt} · ${post.topic}</span>
        <button type="button" class="ap-button primary blue top-post-card__cta" data-top-post-repurpose="${post.id}">
          Repurpose
        </button>
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

// Profile lens as a scalable DS .ap-select dropdown — "All profiles" + one row
// per profile (avatar + handle + winner count). The options list scrolls (the DS
// caps it at 280px), so this holds 5 or 50 profiles without the old chip row
// exploding across the toolbar. Each option carries data-top-post-profile (a
// network slug or "all") — the same hook the session delegation already handles.
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

  const allOpt = renderProfileOption("all", {
    text: "All profiles",
    count: total,
    selected: activeProfile === "all",
  });

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

// The full board: profile selector (primary lens) + sort toolbar + the sorted
// card grid. `sort` is one of SORTS[].key; `profile` is a network slug or "all"
// (defaults to "all" — every winner).
export function renderTopPostsBoard({ posts, sort = "performance", profile = "all", period = "all", selected }) {
  const all = posts || [];
  const sel = selected instanceof Set ? selected : new Set(selected || []);
  const lenses = buildProfileLenses(all);
  // Guard against a stale profile filter (e.g. its last winner was removed):
  // fall back to "all" so the grid never renders empty.
  const activeProfile = profile !== "all" && lenses.some((l) => l.network === profile) ? profile : "all";

  const activePeriod = PERIODS.find((p) => p.key === period) || PERIODS[0];
  const byProfile =
    activeProfile === "all" ? all : all.filter((p) => (p.network || "").toLowerCase() === activeProfile);
  const visible = byProfile.filter((p) => (p.daysAgo ?? 0) <= activePeriod.maxDays);

  const active = SORTS.find((s) => s.key === sort) || SORTS[0];
  const sorted = [...visible].sort(active.compare);
  const count = sorted.length;

  const cards = sorted.map((p) => renderTopPostCard(p, { selected: sel.has(p.id) })).join("");

  // The toolbar is a single fixed-height slot that swaps between filter mode and
  // selection mode IN PLACE — so checking a post never pushes the grid down (no
  // layout shift). Filter mode: count + Profile/Period/Sort dropdowns (all three
  // scale to any number of options). Selection mode: count + Repurpose/Cancel.
  const selecting = sel.size > 0;
  const toolbar = selecting
    ? html`
        <div class="top-posts-toolbar top-posts-toolbar--selecting" role="region" aria-label="Bulk repurpose actions">
          <span class="top-posts-toolbar__count top-posts-toolbar__count--accent">${sel.size} selected</span>
          <div class="top-posts-toolbar__actions">
            <button type="button" class="ap-button primary blue" data-top-post-repurpose-bulk>
              <i class="ap-icon-shuffle" aria-hidden="true"></i>
              <span>Repurpose ${sel.size} ${sel.size === 1 ? "post" : "posts"}</span>
            </button>
            <button type="button" class="ap-button transparent grey" data-top-post-repurpose-cancel>Cancel</button>
          </div>
        </div>
      `
    : html`
        <div class="top-posts-toolbar">
          <span class="top-posts-toolbar__count">${count} winning ${count === 1 ? "post" : "posts"}</span>
          <div class="top-posts-filters">
            ${raw(renderProfileSelect(lenses, activeProfile, all.length))}
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
