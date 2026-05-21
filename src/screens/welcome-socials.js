// Welcome step 2 of 4 — connect the social profiles where the brand
// publishes. Cards visual mirroring /welcome/sources : each platform
// gets a Connecter / Déconnecter toggle. Picks land on
// `draft.connectedSocials` via context-builder.patchDraft. The website
// analysis launched on step 1 keeps running in the background while the
// user is here.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { SOCIAL_PLATFORMS, getDraft, patchDraft } from "../context-builder.js?v=36";

const WELCOME_SESSION_KEY = "welcomeSessionId";

export function renderWelcomeSocials(_params, target) {
  document.body.classList.add("onboarding");
  // The draft is mandatory — without it we have nothing to attach the
  // picks to. Bounce back to step 1 so the user re-enters the URL.
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
  const selected = new Set(getDraft(sid)?.connectedSocials || []);
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
            <span class="welcome-step__tag">Étape 2 sur 4</span>
            <h1 class="welcome-step__title">Où publies-tu aujourd'hui ?</h1>
            <p class="welcome-step__sub">
              Connecte les comptes sociaux où ce Playbook s'applique — Archie adaptera les drafts pour chaque canal.
            </p>
          </div>
          <ul class="welcome-socials__grid">
            ${raw(SOCIAL_PLATFORMS.map((p) => renderSocialCard(p, selected.has(p.value))).join(""))}
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

function renderSocialCard(platform, isConnected) {
  return `
    <li class="welcome-socials__card${isConnected ? " is-connected" : ""}" data-socials-card="${platform.value}">
      <img class="welcome-socials__logo" src="${platform.imgSrc}" alt="" width="40" height="40" />
      <div class="welcome-socials__body">
        <div class="welcome-socials__name">${platform.label}</div>
        ${isConnected ? `<div class="welcome-socials__status"><i class="ap-icon-rounded-check_fill"></i> Connecté · @archie</div>` : ""}
      </div>
      ${
        isConnected
          ? `<button type="button" class="ap-button stroked grey" data-welcome-disconnect="${platform.value}">Déconnecter</button>`
          : `<button type="button" class="ap-button stroked blue" data-welcome-connect="${platform.value}">Connecter</button>`
      }
    </li>
  `;
}

function onClick(event, target, sid) {
  const connectBtn = event.target.closest("[data-welcome-connect]");
  if (connectBtn) {
    toggleConnection(sid, connectBtn.dataset.welcomeConnect, true);
    paint(target, sid);
    return;
  }
  const disconnectBtn = event.target.closest("[data-welcome-disconnect]");
  if (disconnectBtn) {
    toggleConnection(sid, disconnectBtn.dataset.welcomeDisconnect, false);
    paint(target, sid);
    return;
  }
  if (event.target.closest("[data-welcome-skip]") || event.target.closest("[data-welcome-continue]")) {
    navigate("/welcome/sources");
    return;
  }
}

function toggleConnection(sid, platform, connected) {
  const current = getDraft(sid)?.connectedSocials || [];
  const next = connected ? Array.from(new Set([...current, platform])) : current.filter((p) => p !== platform);
  patchDraft(sid, { connectedSocials: next });
}
