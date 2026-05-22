// First Time User ALT — step 1 of 2. Visual single-select picker over the
// brand's pre-connected social profiles, identical markup to
// welcome-socials.js (DS .ap-avatar with network badge). On Continue we
// mint a transient session id, arm the pendingStartContextBuilder handoff
// with the picked profile as prefill + finishMode "switch-to-returning",
// and navigate to /session/welcome-alt-{ts}. session.js then auto-launches
// the conversational Playbook builder inside the onboarding chrome (the
// app shell hides sidebar+topbar when path starts with /session/welcome-
// alt-, see app.js setAfterRender).
//
// Unlike welcome-socials.js, this screen owns its own selection state in
// memory — we don't go through the linear-welcome draft store here.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { setHandoff } from "../handoff.js?v=20";
import { socialAccounts } from "../mocks.js?v=31";

const CONNECTED_PROFILES = socialAccounts.filter((p) => p.status === "connected");

const BRAND_INITIALS = "NS";

const NETWORK_ICON_BY_PLATFORM = {
  facebook: "ap-icon-facebook-official",
  instagram: "ap-icon-instagram-official",
  linkedin: "ap-icon-linkedin-official",
  x: "ap-icon-x-official",
};

let selectedId = null;

export function renderWelcomeAlt(_params, target) {
  document.body.classList.add("onboarding");
  paint(target);
  const handler = (event) => onClick(event, target);
  target.addEventListener("click", handler);
  return () => {
    target.removeEventListener("click", handler);
  };
}

function paint(target) {
  target.innerHTML = html`
    <section class="welcome-screen">
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">Powered by Agorapulse</span>
      </header>
      <div class="welcome-screen__body">
        <div class="welcome-step">
          <div class="welcome-step__header">
            <span class="welcome-step__tag">Étape 1 sur 2</span>
            <h1 class="welcome-step__title">Quel profil veux-tu utiliser ?</h1>
            <p class="welcome-step__sub">
              Voici les comptes que tu as déjà connectés à Agorapulse — choisis-en un pour démarrer. On enchaîne avec
              quelques questions pour construire ton Playbook.
            </p>
          </div>
          <ul class="welcome-socials__grid">
            ${raw(CONNECTED_PROFILES.map((p) => renderProfileCard(p, p.id === selectedId)).join(""))}
          </ul>
          <footer class="welcome-step__footer">
            <button type="button" class="welcome-step__footer-skip" data-welcome-skip>Passer pour l'instant</button>
            <button type="button" class="ap-button primary orange" data-welcome-continue>
              Continuer
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

function onClick(event, target) {
  const card = event.target.closest("[data-profile-card]");
  if (card) {
    const id = card.dataset.profileCard;
    selectedId = selectedId === id ? null : id;
    paint(target);
    return;
  }
  if (event.target.closest("[data-welcome-skip]") || event.target.closest("[data-welcome-continue]")) {
    enterConversationalFlow();
    return;
  }
}

function enterConversationalFlow() {
  const profile = selectedId ? CONNECTED_PROFILES.find((p) => p.id === selectedId) : null;
  const sid = `welcome-alt-${Date.now().toString(36)}`;
  setHandoff("pendingStartContextBuilder", {
    returnTo: "/",
    finishMode: "switch-to-returning",
    prefill: profile
      ? { selectedProfileId: profile.id, platform: profile.platform }
      : { selectedProfileId: null, platform: null },
  });
  // Reset local state so a second pass through this screen starts blank.
  selectedId = null;
  navigate(`/session/${sid}`);
}
