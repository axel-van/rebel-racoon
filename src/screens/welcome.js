// Welcome splash — first thing a new user sees. Hides the app shell
// (sidebar + topbar) via body.onboarding, then offers a single primary
// CTA that launches the Playbook creation flow on a fresh transient
// session. After save, the context-builder's onComplete handoff routes
// the user to /welcome/sources.
//
// Visual design intent: two-column hero. Left = copy + roadmap + CTA;
// right = a faux Playbook card preview so the user sees the artefact
// they're about to create. Removes any "skip" affordance — the Playbook
// is required for Archie to do anything useful.

import { html } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { setHandoff } from "../handoff.js?v=20";

export function renderWelcome(_params, target) {
  document.body.classList.add("onboarding");

  target.innerHTML = html`
    <section class="welcome-screen welcome-screen--hero">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">Powered by Agorapulse</span>
      </header>
      <div class="welcome-screen__body welcome-screen__body--split">
        <div class="welcome-hero">
          <span class="welcome-hero__eyebrow">Bienvenue 👋</span>
          <h1 class="welcome-hero__title">Faisons connaissance<br />avec ton brand.</h1>
          <p class="welcome-hero__sub">
            Archie écrit comme toi, pour ton audience. Avant de générer le premier post, on va construire ensemble ton
            <strong>Playbook</strong> — le doc qui résume ta voix, ton brief et tes objectifs de contenu.
          </p>

          <ol class="welcome-roadmap welcome-roadmap--horizontal">
            <li class="welcome-roadmap__step is-current">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">1</span></span>
              <span class="welcome-roadmap__label">Crée ton Playbook</span>
              <span class="welcome-roadmap__meta">~3 min</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">2</span></span>
              <span class="welcome-roadmap__label">Connecte tes sources</span>
              <span class="welcome-roadmap__meta">Optionnel</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">3</span></span>
              <span class="welcome-roadmap__label">Lance ta première création</span>
              <span class="welcome-roadmap__meta">Avec Archie</span>
            </li>
          </ol>

          <div class="welcome-hero__actions">
            <button type="button" class="ap-button primary orange welcome-hero__cta" data-welcome-cta>
              Créer mon Playbook
              <i class="ap-icon-arrow-right"></i>
            </button>
            <span class="welcome-hero__hint">Tu pourras tout modifier plus tard, à tout moment.</span>
          </div>
        </div>

        <aside class="welcome-preview" aria-hidden="true">
          <div class="welcome-preview__floater welcome-preview__floater--top">
            <i class="ap-icon-sparkles-mermaid"></i>
            <span>Voilà à quoi ressemble un Playbook</span>
          </div>
          <article class="welcome-preview__card contexts-card contexts-card--orange">
            <span class="contexts-card__swatch"></span>
            <header class="welcome-preview__head">
              <h3 class="welcome-preview__name">
                Acme · Q2 marketing
                <span class="welcome-preview__badge"><i class="ap-icon-star_fill"></i></span>
              </h3>
            </header>
            <span class="welcome-preview__voice">
              <i class="ap-icon-sparkles"></i>
              <span>Direct · operator-first · specific</span>
            </span>
            <p class="welcome-preview__brief">
              Drive awareness for Acme's Q2 launch. Lead with concrete time savings and customer outcomes — not feature
              lists.
            </p>
            <ul class="welcome-preview__chips">
              <li>Operators</li>
              <li>B2B startups</li>
              <li>50–200 people</li>
            </ul>
            <footer class="welcome-preview__foot">
              <span class="welcome-preview__counter"><i class="ap-icon-single-chat-bubble"></i> 4</span>
              <span class="welcome-preview__counter"><i class="ap-icon-target"></i> 1</span>
              <span class="welcome-preview__palette">
                <span style="background:#1a1f36"></span>
                <span style="background:#ff6726"></span>
                <span style="background:#ffffff;border:1px solid var(--app-border-soft)"></span>
              </span>
            </footer>
            <div class="welcome-preview__updated">Updated just now</div>
          </article>
          <div class="welcome-preview__floater welcome-preview__floater--bottom">
            <i class="ap-icon-rounded-check_fill"></i>
            <span>Archie n'oubliera plus jamais ton ton.</span>
          </div>
        </aside>
      </div>
    </section>
  `;

  target.addEventListener("click", onClick);

  return () => {
    target.removeEventListener("click", onClick);
  };
}

function onClick(event) {
  if (event.target.closest("[data-welcome-cta]")) {
    // Mint a transient session id (welcome- prefix is used as a tag) and
    // arm the handoff so the session screen launches contextBuilder.start()
    // on mount. onComplete returns to /welcome/sources.
    const sid = `welcome-${Date.now().toString(36)}`;
    setHandoff("pendingStartContextBuilder", { returnTo: "/welcome/sources" });
    navigate(`/session/${sid}`);
    return;
  }
}
