// Welcome sources — optional final onboarding step. Renders a 2x2 grid
// of the four DS-defined connectors (Slite, Notion, Google Drive, Slack)
// with one-click "Connect" actions backed by `setConnectorStatus`. Both
// the skip link and the primary "Entrer dans Archie" button drop the
// user on the dashboard with a confirmation toast naming their freshly
// created Playbook.
//
// No real OAuth — same mock pattern as add-source-modal's connector tab.
// The user can come back later via Settings → Connectors.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { getConnectors, setConnectorStatus, subscribe } from "../connectors-store.js?v=20";
import { getContexts } from "../contexts-store.js?v=27";
import { setHandoff } from "../handoff.js?v=20";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

export function renderWelcomeSources(_params, target) {
  document.body.classList.add("onboarding");

  paint(target);
  const unsubscribe = subscribe(() => paint(target));
  target.addEventListener("click", onClick);

  return () => {
    unsubscribe();
    target.removeEventListener("click", onClick);
  };
}

function paint(target) {
  target.innerHTML = html`
    <section class="welcome-screen">
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">Archie</span>
        <span class="welcome-screen__chip">Powered by Agorapulse</span>
      </header>
      <div class="welcome-screen__body">
        <div class="welcome-sources">
          <div class="welcome-sources__header">
            <span class="welcome-sources__tag">Étape finale · optionnelle</span>
            <h1 class="welcome-sources__title">Tu as ton Playbook. Veux-tu qu'Archie lise tes documents ?</h1>
            <p class="welcome-sources__sub">
              Connecte Slite, Notion ou Google Drive — Archie y puisera tes contenus existants pour s'aligner sur ton
              style. Tu pourras en ajouter d'autres à tout moment.
            </p>
          </div>
          <ul class="welcome-sources__grid">
            ${raw(getConnectors().map(renderCard).join(""))}
          </ul>
          <footer class="welcome-sources__footer">
            <button type="button" class="welcome-sources__footer-skip" data-welcome-skip>Passer pour l'instant</button>
            <button type="button" class="ap-button primary orange" data-welcome-done>
              Entrer dans Archie
              <i class="ap-icon-arrow-right"></i>
            </button>
          </footer>
        </div>
      </div>
    </section>
  `;
}

function renderCard(c) {
  const isConnected = c.status === "connected";
  return `
    <li class="welcome-sources__card${isConnected ? " is-connected" : ""}" data-connector-id="${escapeHtml(c.id)}">
      <img class="welcome-sources__logo" src="${escapeHtml(c.logo)}" alt="" width="48" height="48" />
      <div class="welcome-sources__body">
        <div class="welcome-sources__name">${escapeHtml(c.name)}</div>
        <div class="welcome-sources__desc">${escapeHtml(c.desc)}</div>
        ${
          isConnected
            ? `<div class="welcome-sources__status"><i class="ap-icon-rounded-check_fill"></i> Connecté${c.account ? " · " + escapeHtml(c.account) : ""}</div>`
            : ""
        }
      </div>
      ${
        isConnected
          ? `<button type="button" class="ap-button stroked grey" data-welcome-disconnect="${escapeHtml(c.id)}">Déconnecter</button>`
          : `<button type="button" class="ap-button stroked blue" data-welcome-connect="${escapeHtml(c.id)}">Connecter</button>`
      }
    </li>
  `;
}

function onClick(event) {
  const connectBtn = event.target.closest("[data-welcome-connect]");
  if (connectBtn) {
    setConnectorStatus(connectBtn.dataset.welcomeConnect, {
      status: "connected",
      account: "matt@archie.io",
      lastSync: "just now",
    });
    return;
  }
  const disconnectBtn = event.target.closest("[data-welcome-disconnect]");
  if (disconnectBtn) {
    setConnectorStatus(disconnectBtn.dataset.welcomeDisconnect, {
      status: "disconnected",
      account: null,
      lastSync: null,
    });
    return;
  }
  if (event.target.closest("[data-welcome-done]") || event.target.closest("[data-welcome-skip]")) {
    // Pass the freshly-created Playbook name to the dashboard so it can
    // welcome the user by name. We use the most recently added context
    // since context-builder's addContext puts new entries at the top.
    const latest = getContexts()[0];
    if (latest?.name) setHandoff("welcomeComplete", { playbookName: latest.name });
    document.body.classList.remove("onboarding");
    navigate("/");
    return;
  }
}
