// Welcome step 2 of 4 — pick one social profile that the user has
// already connected to Agorapulse from outside Archie. Single-select:
// the chosen profile id lands on `draft.selectedProfileId`, and we
// mirror its platform into `draft.connectedSocials` so the persisted
// context keeps that info. The website analysis launched on step 1
// keeps running in the background while the user is here.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { getDraft, patchDraft } from "../context-builder.js?v=46";
import { socialAccounts } from "../mocks.js?v=35";

const WELCOME_SESSION_KEY = "welcomeSessionId";

// Profiles already connected to Agorapulse (outside Archie). We hardcode
// the filter on `status === "connected"` so the picker stays focused on
// what the user can actually pick — disconnected accounts don't belong
// in this step.
const CONNECTED_PROFILES = socialAccounts.filter((p) => p.status === "connected");

// All mock profiles belong to the same fictional brand (Northwind
// Studio) — same initials on every avatar, the per-platform variation
// comes from the network badge in the corner. If we ever switch the
// mock to multi-brand, derive these per-profile instead.
const BRAND_INITIALS = "NS";

// Map our mock's `platform` slug to the DS's official, full-color icon
// class. The DS requires `-official` variants for .ap-avatar-network.
const NETWORK_ICON_BY_PLATFORM = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
};

export function renderWelcomeSocials(_params, target) {
  document.body.classList.add("onboarding");
  // The draft is mandatory — without it we have nothing to attach the
  // pick to. Bounce back to step 1 so the user re-enters the URL.
  const sid = readWelcomeSessionId();
  if (!sid || !getDraft(sid)) {
    navigate("/welcome");
    return () => {};
  }

  paint(target, sid);
  // Named handler ref so the cleanup actually unbinds when the route
  // changes — anonymous arrows would leak the listener and intercept
  // clicks on the next welcome screen.
  const handler = (event) => onClick(event, target, sid);
  target.addEventListener("click", handler);

  return () => {
    target.removeEventListener("click", handler);
  };
}

function readWelcomeSessionId() {
  try {
    return window.sessionStorage.getItem(WELCOME_SESSION_KEY);
  } catch {
    return null;
  }
}

function paint(target, sid) {
  const selectedId = getDraft(sid)?.selectedProfileId || null;
  target.innerHTML = html`
    <section class="welcome-screen">
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">BETA</span>
      </header>
      <div class="welcome-screen__body">
        <div class="welcome-step">
          <div class="welcome-step__header">
            <span class="welcome-step__tag">Step 2 of 4</span>
            <h1 class="welcome-step__title">Which profile should I use?</h1>
            <p class="welcome-step__sub">
              Here are the accounts you've already connected. Pick one to start — you can add more later.
            </p>
          </div>
          <ul class="welcome-socials__grid">
            ${raw(CONNECTED_PROFILES.map((p) => renderProfileCard(p, p.id === selectedId)).join(""))}
          </ul>
          <footer class="welcome-step__footer">
            <button type="button" class="welcome-step__footer-skip" data-welcome-skip>Skip for now</button>
            <button type="button" class="ap-button primary orange" data-welcome-continue>
              Continue
              <i class="ap-icon-arrow-right"></i>
            </button>
          </footer>
        </div>
      </div>
    </section>
  `;
}

function renderProfileCard(profile, isSelected) {
  const subtitleParts = [];
  if (profile.kind) subtitleParts.push(profile.kind);
  if (profile.handle) subtitleParts.push(profile.handle);
  const subtitle = subtitleParts.join(" · ");
  const networkIcon = NETWORK_ICON_BY_PLATFORM[profile.platform];
  return `
    <li>
      <button
        type="button"
        class="welcome-socials__card${isSelected ? " is-selected" : ""}"
        data-profile-card="${profile.id}"
        aria-pressed="${isSelected}"
      >
        <div class="ap-avatar size-40" aria-hidden="true">
          <span class="ap-avatar-initials">${BRAND_INITIALS}</span>
          ${networkIcon ? `<span class="ap-avatar-network"><i class="${networkIcon}"></i></span>` : ""}
        </div>
        <div class="welcome-socials__body">
          <div class="welcome-socials__name">${profile.platformLabel}</div>
          ${subtitle ? `<div class="welcome-socials__meta">${subtitle}</div>` : ""}
        </div>
        <span class="welcome-socials__check" aria-hidden="true">
          <i class="ap-icon-rounded-check_fill"></i>
        </span>
      </button>
    </li>
  `;
}

function onClick(event, target, sid) {
  const card = event.target.closest("[data-profile-card]");
  if (card) {
    selectProfile(sid, card.dataset.profileCard);
    paint(target, sid);
    return;
  }
  if (event.target.closest("[data-welcome-skip]") || event.target.closest("[data-welcome-continue]")) {
    navigate("/welcome/sources");
    return;
  }
}

function selectProfile(sid, profileId) {
  const current = getDraft(sid)?.selectedProfileId || null;
  // Toggle off when the user clicks the already-selected card so they
  // can land on the next screen with no profile picked (same outcome as
  // "Passer pour l'instant").
  if (current === profileId) {
    patchDraft(sid, { selectedProfileId: null, connectedSocials: [] });
    return;
  }
  const profile = CONNECTED_PROFILES.find((p) => p.id === profileId);
  if (!profile) return;
  patchDraft(sid, { selectedProfileId: profileId, connectedSocials: [profile.platform] });
}
