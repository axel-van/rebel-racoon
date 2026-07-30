// Shared "connected social profiles" source + picker-item builder.
//
// Single source of truth so the Playbook onboarding profile step
// (context-builder.js) and the in-session "draft for which profile?"
// picker (session.js) propose the EXACT same connected accounts,
// presented identically: brand handle as the label, "Platform · Kind"
// as the muted caption, and a DS avatar carrying the brand photo plus a
// corner network badge.

import { socialAccounts, demoManyProfiles } from "./mocks.js?v=61";
import { escapeHtml } from "./utils.js?v=21";
import { isFlagOn } from "./feature-flags.js?v=16";

// Map our mock's `platform` slug to the DS's official full-color network
// icon used by the .ap-avatar-network corner badge.
export const NETWORK_ICON_BY_PLATFORM = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
  tiktok: "ap-icon-tiktok-official",
  youtube: "ap-icon-youtube-official",
};

// Human label for a platform/network slug — fallback profile name when no
// connected account resolves.
export const NETWORK_LABEL = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
};

// Mock brand initials shown as the avatar fallback when no photo loads.
export const BRAND_INITIALS = "NS";

// Above this many profiles, a profile picker turns on its live search box so a
// long connected-account list stays scannable. Shared so every profile picker
// (draft, clips, onboarding, repurpose) flips to search at the same count.
export const PROFILE_SEARCH_THRESHOLD = 8;

// Normalise a network slug (posts-store rewrites x → twitter; undo here).
function normalizePlatform(network) {
  return network === "twitter" ? "x" : network || "";
}

// Resolve a connected profile from a network/platform slug.
export function profileForNetwork(network) {
  const key = normalizePlatform(network);
  if (!key) return null;
  return socialAccounts.find((a) => a.platform === key && a.status === "connected") || null;
}

// Canonical profile display — DS avatar (brand photo + corner network badge)
// followed by the profile name. The single source of truth for "show a
// profile" so every surface (drafts card, schedule modal, picker echoes…)
// renders the SAME UI: Avatar + network indicator + profile name.
// `account` is a socialAccounts entry (preferred); `network` is the slug
// used to badge + label when no account is available.
export function renderProfileTag(account, { network } = {}) {
  const platform = account?.platform || normalizePlatform(network);
  const name = account?.handle || account?.platformLabel || NETWORK_LABEL[platform] || platform || "Profile";
  const networkIcon = NETWORK_ICON_BY_PLATFORM[platform];
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${account?.initials || BRAND_INITIALS}</span>`;
  const badge = networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : "";
  return `
    <span class="profile-tag" title="${escapeHtml(name)}">
      <span class="ap-avatar size-24" aria-hidden="true">${avatarInner}${badge}</span>
      <span class="profile-tag__name">${escapeHtml(name)}</span>
    </span>
  `;
}

// Conversation echo card for a picked profile — matches the selection-echo
// visual (rounded navy-tint card, 32px leading visual, two lines): the profile
// NAME on top, the @handle below (or "Platform · Kind" when the handle isn't a
// distinct @). Used by the chat "which account(s)?" echoes so profile picks
// read like every other selection echo in the thread.
export function renderProfileEchoCard(account, { network } = {}) {
  const platform = account?.platform || normalizePlatform(network);
  const name = account?.name || account?.handle || NETWORK_LABEL[platform] || platform || "Profile";
  const handle = account?.handle || "";
  const meta =
    handle && handle !== name
      ? handle
      : [account?.platformLabel || NETWORK_LABEL[platform], account?.kind].filter(Boolean).join(" · ");
  const networkIcon = NETWORK_ICON_BY_PLATFORM[platform];
  const avatarInner = account?.photo
    ? `<img src="${account.photo}" alt="" />`
    : `<span class="ap-avatar-initials">${account?.initials || BRAND_INITIALS}</span>`;
  const badge = networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : "";
  return `
    <div class="selection-echo selection-echo--profile" title="${escapeHtml(name)}">
      <span class="selection-echo__icon selection-echo__icon--avatar">
        <span class="ap-avatar size-32" aria-hidden="true">${avatarInner}${badge}</span>
      </span>
      <span class="selection-echo__body">
        <span class="selection-echo__title">${escapeHtml(name)}</span>
        ${meta ? `<span class="selection-echo__meta">${escapeHtml(meta)}</span>` : ""}
      </span>
    </div>
  `;
}

// All currently-connected social accounts (mock). With the `manyProfiles`
// feature flag ON, the base connected accounts are followed by a large, varied
// demo set (see mocks.demoManyProfiles) so the profile quickpicker's search
// can be evaluated against a realistic ~40-profile list.
export function getConnectedProfiles() {
  const base = socialAccounts.filter((p) => p.status === "connected");
  return isFlagOn("manyProfiles") ? [...base, ...demoManyProfiles] : base;
}

// Build inline-question picker items for the connected profiles. The
// profile name is the primary identifier — the platform is a secondary
// detail (signalled both by the caption and the avatar's corner network
// badge), so we lead with the handle and demote "Facebook · Page" to the
// muted caption. Reused by both the onboarding profile step and the
// in-session draft profile picker so the two stay identical.
// `requirePosts` (default true) is for the "analyse my top posts" flows: a
// profile with no published history can't be analysed, so it's disabled with a
// "No posts to analyze" note. Pass `requirePosts: false` when the profile is
// only a DESTINATION (e.g. picking which accounts to draft clips for) — there
// every connected account is a valid target regardless of post history.
export function buildConnectedProfileItems({ requirePosts = true } = {}) {
  return getConnectedProfiles().map((p) => {
    const hasNoPosts = requirePosts && p.postCount === 0;
    const captionParts = [];
    if (p.platformLabel) captionParts.push(p.platformLabel);
    if (p.kind) captionParts.push(p.kind);
    return {
      value: p.id,
      label: p.handle,
      caption: captionParts.join(" · "),
      // Search haystack for the picker's live filter — the brand name and
      // network aren't always visible in the label (e.g. an @handle row), so
      // fold them in explicitly so "linkedin" or a brand name both match.
      search: [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" "),
      disabled: hasNoPosts,
      endNote: hasNoPosts ? "No posts to analyze" : null,
      avatar: {
        imageUrl: p.photo,
        initials: p.initials || BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[p.platform],
      },
    };
  });
}
