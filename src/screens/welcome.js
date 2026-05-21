// Welcome step 1 of 4 — the URL input. The user pastes their company
// website, hits Continuer, and we kick off the mock analysis in the
// background while they move through the social channels + sources +
// recap screens. By the time they reach /welcome/recap the draft is
// populated and the playbook content is ready to display.
//
// Choice from the user-facing brief: the website URL is mandatory in
// this flow — no skip, no PDF upload fallback. Users without a site
// can still hit /contexts → New playbook for the conversational entry
// (which keeps its own picker with Documents path).

import { html } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { startBackground } from "../context-builder.js?v=36";

const WELCOME_SESSION_KEY = "welcomeSessionId";

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
      <div class="welcome-screen__body welcome-screen__body--centered">
        <div class="welcome-hero welcome-hero--centered">
          <span class="welcome-hero__eyebrow">Bienvenue 👋</span>
          <h1 class="welcome-hero__title">Faisons connaissance<br />avec ton brand.</h1>
          <p class="welcome-hero__sub">
            Colle l'URL de ton site et Archie en extrait ta voix, ton audience et ton identité visuelle. On construit
            ton Playbook ensemble en quelques étapes.
          </p>

          <form class="welcome-input-card" data-welcome-form>
            <label for="welcomeUrlInput" class="welcome-input-card__label">URL de ton site</label>
            <div class="welcome-input-card__row">
              <i class="ap-icon-web welcome-input-card__icon"></i>
              <input
                id="welcomeUrlInput"
                type="url"
                class="welcome-input-card__input"
                placeholder="https://your-brand.com"
                autocomplete="url"
                autofocus
                required
              />
              <button type="submit" class="ap-button primary orange welcome-input-card__submit">
                <span>Continuer</span>
                <i class="ap-icon-arrow-right"></i>
              </button>
            </div>
            <p class="welcome-input-card__hint">
              On analyse ton site pour démarrer ton Playbook. Tu pourras tout modifier après.
            </p>
            <p class="welcome-input-card__error" data-welcome-error hidden></p>
          </form>

          <ol class="welcome-roadmap welcome-roadmap--horizontal welcome-roadmap--four">
            <li class="welcome-roadmap__step is-current">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">1</span></span>
              <span class="welcome-roadmap__label">Ton site</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">2</span></span>
              <span class="welcome-roadmap__label">Tes réseaux</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">3</span></span>
              <span class="welcome-roadmap__label">Tes sources</span>
            </li>
            <li class="welcome-roadmap__step">
              <span class="welcome-roadmap__bullet"><span class="welcome-roadmap__num">4</span></span>
              <span class="welcome-roadmap__label">Ton Playbook</span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  `;

  target.addEventListener("submit", onSubmit);

  return () => {
    target.removeEventListener("submit", onSubmit);
  };
}

function onSubmit(event) {
  const form = event.target.closest("[data-welcome-form]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("#welcomeUrlInput");
  const errorEl = form.querySelector("[data-welcome-error]");
  const raw = (input?.value || "").trim();
  // Tolerant validation: accept `acme.com`, `www.acme.com`, `https://acme.com`.
  // We need *something* that looks like a domain — anything else gets
  // the inline error.
  if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(raw)) {
    if (errorEl) {
      errorEl.textContent = "Colle une URL valide pour démarrer (ex : acme.com).";
      errorEl.hidden = false;
    }
    input?.focus();
    return;
  }
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const sid = `welcome-${Date.now().toString(36)}`;
  try {
    window.sessionStorage.setItem(WELCOME_SESSION_KEY, sid);
  } catch {
    // sessionStorage may be unavailable in private browsing — the flow
    // still works as long as the user doesn't navigate between tabs.
  }
  startBackground(sid, url);
  navigate("/welcome/socials");
}
