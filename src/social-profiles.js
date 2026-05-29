// Shared "connected social profiles" source + picker-item builder.
//
// Single source of truth so the Playbook onboarding profile step
// (context-builder.js) and the in-session "draft for which profile?"
// picker (session.js) propose the EXACT same connected accounts,
// presented identically: brand handle as the label, "Platform · Kind"
// as the muted caption, and a DS avatar carrying the brand photo plus a
// corner network badge.

import { socialAccounts } from "./mocks.js?v=36";

// Map our mock's `platform` slug to the DS's official full-color network
// icon used by the .ap-avatar-network corner badge.
export const NETWORK_ICON_BY_PLATFORM = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
};

// Mock brand initials shown as the avatar fallback when no photo loads.
export const BRAND_INITIALS = "NS";

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
