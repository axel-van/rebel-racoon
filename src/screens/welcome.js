// Welcome splash — first thing a new user sees. Hides the app shell
// (sidebar + topbar) via body.onboarding, then offers a single primary
// CTA that launches the Playbook creation flow on a fresh transient
// session. After save, the context-builder's onComplete handoff routes
// the user to /welcome/sources.
//
// The skip link below the CTA is a demo escape hatch — drops the user
// directly into the dashboard without a Playbook. The dashboard redirect
// (`isNewUser() && contexts.length === 0`) means refreshing /welcome
// re-appears, but explicitly navigating away from it doesn't trap them.

import { html } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { setHandoff } from "../handoff.js?v=20";
import { showToast } from "../components/toast.js?v=20";

export function renderWelcome(_params, target) {
  document.body.classList.add("onboarding");

  target.innerHTML = html`
    <section class="welcome-screen">
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">Archie</span>
        <span class="welcome-screen__chip">Powered by Agorapulse</span>
      </header>
      <div class="welcome-screen__body">
        <div class="welcome-hero">
          <div class="welcome-hero__glyph"><i class="ap-icon-sparkles-mermaid"></i></div>
          <h1 class="welcome-hero__title">Bienvenue dans Archie.</h1>
          <p class="welcome-hero__sub">
            Archie écrit comme toi, pour ton audience. Pour démarrer, on crée ensemble ton
            <strong>Playbook</strong> — le doc qui résume ta voix, ton brief et tes objectifs de contenu. Ça prend 3
            minutes.
          </p>
          <ol class="welcome-roadmap">
            <li class="welcome-roadmap__step is-current">
              <span class="welcome-roadmap__num">1</span>
              <span>Crée ton Playbook</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__num">2</span>
              <span>Connecte tes sources</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__num">3</span>
              <span>Lance ta première création</span>
            </li>
          </ol>
          <div class="welcome-hero__actions">
            <button type="button" class="ap-button primary orange" data-welcome-cta>
              Créer mon Playbook
              <i class="ap-icon-arrow-right"></i>
            </button>
            <button type="button" class="welcome-hero__skip" data-welcome-skip>
              Sauter et explorer Archie sans Playbook
            </button>
          </div>
        </div>
      </div>
    </section>
  `;

  target.addEventListener("click", onClick);

  return () => {
    // Cleanup runs on next route change — leave body.onboarding for the
    // next screen to manage. The welcome-flow screens all re-add it on
    // mount; non-welcome routes strip it (see router.js cleanup hook).
    target.removeEventListener("click", onClick);
  };
}

function onClick(event) {
  if (event.target.closest("[data-welcome-cta]")) {
    // Mint a transient session id (welcome- prefix triggers body.onboarding
    // in session.js) and arm the handoff so the session screen launches
    // contextBuilder.start() on mount. onComplete returns to /welcome/sources.
    const sid = `welcome-${Date.now().toString(36)}`;
    setHandoff("pendingStartContextBuilder", { returnTo: "/welcome/sources" });
    navigate(`/session/${sid}`);
    return;
  }
  if (event.target.closest("[data-welcome-skip]")) {
    // Demo escape — leave onboarding without a Playbook. The user will
    // bounce back to /welcome on next dashboard hit (contexts still empty)
    // but explicit navigation respects their choice for now.
    showToast("Tu peux créer ton Playbook à tout moment depuis la sidebar.");
    document.body.classList.remove("onboarding");
    navigate("/");
    return;
  }
}
