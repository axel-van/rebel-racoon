// Shared "connected social profiles" source + picker-item builder.
//
// Single source of truth so the Playbook onboarding profile step
// (context-builder.js) and the in-session "draft for which profile?"
// picker (session.js) propose the EXACT same connected accounts,
// presented identically: brand handle as the label, "Platform · Kind"
// as the muted caption, and a DS avatar carrying the brand photo plus a
// corner network badge.

import { socialAccounts } from "./mocks.js?v=37";
import { escapeHtml } from "./utils.js?v=20";

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
    : `<span class="ap-avatar-initials">${BRAND_INITIALS}</span>`;
  const badge = networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : "";
  return `
    <span class="profile-tag" title="${escapeHtml(name)}">
      <span class="ap-avatar size-24" aria-hidden="true">${avatarInner}${badge}</span>
      <span class="profile-tag__name">${escapeHtml(name)}</span>
    </span>
  `;
}

// All currently-connected social accounts (mock).
export function getConnectedProfiles() {
  return socialAccounts.filter((p) => p.status === "connected");
}

// Build inline-question picker items for the connected profiles. The
// profile name is the primary identifier — the platform is a secondary
// detail (signalled both by the caption and the avatar's corner network
// badge), so we lead with the handle and demote "Facebook · Page" to the
// muted caption. Reused by both the onboarding profile step and the
// in-session draft profile picker so the two stay identical.
export function buildConnectedProfileItems() {
  return getConnectedProfiles().map((p) => {
    const captionParts = [];
    if (p.platformLabel) captionParts.push(p.platformLabel);
    if (p.kind) captionParts.push(p.kind);
    return {
      value: p.id,
      label: p.handle,
      caption: captionParts.join(" · "),
      avatar: {
        imageUrl: p.photo,
        initials: BRAND_INITIALS,
        networkIcon: NETWORK_ICON_BY_PLATFORM[p.platform],
      },
    };
  });
}
