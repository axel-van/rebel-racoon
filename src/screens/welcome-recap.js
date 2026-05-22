// Welcome step 4 of 4 — full recap of the freshly-built Playbook. Reads
// the draft from context-builder via the welcomeSessionId stashed in
// sessionStorage on step 1. If the website analysis is still in flight
// (the user moved fast through the previous screens), we show an
// "Analyzing…" state and poll every 400ms until it lands.
//
// The recap renders the same section markup as the right-panel brief
// in read mode via the exported `renderBriefSections` — full content
// fidelity without re-implementing every card type. Two CTAs at the
// bottom:
//   • Fine-tune mon Playbook → save + launch the conversational
//     playbook-editor on the saved context.
//   • Entrer dans Archie → save + navigate to the dashboard with a
//     welcomeComplete handoff that fires the nominal toast.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=21";
import { getDraft, isAnalysisReady, save } from "../context-builder.js?v=38";
import { renderBriefSections } from "../components/right-panel.js?v=62";
import { launch as launchPlaybookEditor } from "../playbook-editor.js?v=9";
import { setHandoff } from "../handoff.js?v=20";

const WELCOME_SESSION_KEY = "welcomeSessionId";
const POLL_INTERVAL_MS = 400;

let pollTimer = null;

export function renderWelcomeRecap(_params, target) {
  document.body.classList.add("onboarding");
  const sid = readWelcomeSessionId();
  if (!sid || !getDraft(sid)) {
    // No active draft — the user must have lost the session storage
    // entry or refreshed past the timeout. Send them back to step 1.
    navigate("/welcome");
    return () => {};
  }

  paint(target, sid);

  // If analysis hasn't landed yet, poll until it does and repaint so
  // the recap fills in.
  if (!isAnalysisReady(sid)) {
    stopPolling();
    pollTimer = window.setInterval(() => {
      if (isAnalysisReady(sid)) {
        stopPolling();
        paint(target, sid);
      }
    }, POLL_INTERVAL_MS);
  }

  const handler = (event) => onClick(event, sid);
  target.addEventListener("click", handler);

  return () => {
    stopPolling();
    target.removeEventListener("click", handler);
  };
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function readWelcomeSessionId() {
  try {
    return window.sessionStorage.getItem(WELCOME_SESSION_KEY);
  } catch {
    return null;
  }
}

function paint(target, sid) {
  const draft = getDraft(sid);
  const ready = isAnalysisReady(sid);
  const playbookName = (draft?.name || "ton Playbook").trim();
  // Render the brief sections only when the analysis has landed; until
  // then, show a mermaid pulse placeholder so the user knows we're
  // working on it.
  const briefContent = ready
    ? renderBriefSections(draft, { isRead: true, canRefine: false })
    : `
      <div class="welcome-recap__pending">
        <i class="ap-icon-sparkles-mermaid"></i>
        <p>Archie analyse ton site…</p>
        <p class="welcome-recap__pending-sub">Le récap apparaît dans un instant.</p>
      </div>
    `;
  target.innerHTML = html`
    <section class="welcome-screen welcome-screen--recap">
      <div class="welcome-screen__bg" aria-hidden="true"></div>
      <header class="welcome-screen__top">
        <span class="welcome-screen__brand">
          <i class="ap-icon-sparkles-mermaid"></i>
          Archie
        </span>
        <span class="welcome-screen__chip">Powered by Agorapulse</span>
      </header>
      <div class="welcome-screen__body welcome-recap">
        <div class="welcome-recap__header">
          <span class="welcome-step__tag">Étape 4 sur 4</span>
          <h1 class="welcome-recap__title">Voici ton Playbook.</h1>
          <p class="welcome-recap__sub">
            Vérifie les détails — tu peux le raffiner avec Archie ou démarrer directement.
          </p>
        </div>
        <div class="welcome-recap__body context-brief context-brief--read">
          <div class="context-brief__body">${raw(briefContent)}</div>
        </div>
      </div>
      <footer class="welcome-recap__footer">
        <button type="button" class="ap-button stroked grey" data-welcome-finetune ${ready ? "" : "disabled"}>
          <i class="ap-icon-sparkles"></i>
          <span>Fine-tune mon Playbook</span>
        </button>
        <button type="button" class="ap-button primary orange" data-welcome-done ${ready ? "" : "disabled"}>
          <span>Entrer dans Archie</span>
          <i class="ap-icon-arrow-right"></i>
        </button>
      </footer>
    </section>
  `;
  // Suppress the playbookName from JSON.stringify — we use it just for
  // the handoff payload below.
  void playbookName;
}

function onClick(event, sid) {
  const fineTune = event.target.closest("[data-welcome-finetune]");
  if (fineTune) {
    const saved = save(sid);
    if (!saved) return;
    clearWelcomeSessionId();
    setHandoff("welcomeComplete", { playbookName: saved.name });
    document.body.classList.remove("onboarding");
    // launchPlaybookEditor opens a confirm modal then routes to a new
    // /session/playbook-edit-* session. The fine-tune chip menu shows
    // up and the user can iterate. On exit they land back at "/".
    launchPlaybookEditor(saved.id, "/");
    return;
  }
  if (event.target.closest("[data-welcome-done]")) {
    const saved = save(sid);
    if (!saved) return;
    clearWelcomeSessionId();
    setHandoff("welcomeComplete", { playbookName: saved.name });
    document.body.classList.remove("onboarding");
    navigate("/");
    return;
  }
}

function clearWelcomeSessionId() {
  try {
    window.sessionStorage.removeItem(WELCOME_SESSION_KEY);
  } catch {
    // ignore
  }
}
