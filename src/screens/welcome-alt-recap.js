// First Time User ALT — recap surface. Reached at the end of the
// 3-question chat flow (context-builder.startAlt). Mirrors the linear
// /welcome/recap chrome: centered single column, brand chip top, big
// "Voici ton Playbook" headline, brief sections rendered read-only,
// footer with Fine-tune + Entrer dans Archie CTAs.
//
// Per the UI/UX review: the brief panel is an *editing* surface, not a
// result presentation. The end of a conversational flow deserves a
// dedicated centered surface that reads as "voilà ce qu'on a construit
// ensemble", not as another todo list.
//
// State flow: contextBuilder.maybeOpenAltBrief stashes the ALT
// sessionId in sessionStorage under WELCOME_ALT_KEY, then navigates
// here. We read the draft via getDraft(sid), render. On "Entrer dans
// Archie" we call contextBuilder.save(sid) which fires the draft's
// onComplete — that callback was set on session mount via the
// pendingStartContextBuilder handoff and handles the
// switch-to-returning + dashboard navigation.

import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=30";
import { getDraft, isAnalysisReady, save } from "../context-builder.js?v=42";
import { renderBriefSections } from "../components/right-panel.js?v=65";
import { launch as launchPlaybookEditor } from "../playbook-editor.js?v=9";

const WELCOME_ALT_KEY = "welcomeAltSessionId";
const POLL_INTERVAL_MS = 400;

let pollTimer = null;

export function renderWelcomeAltRecap(_params, target) {
  document.body.classList.add("onboarding");
  const sid = readSessionId();
  if (!sid || !getDraft(sid)) {
    // No active draft — the user must have refreshed past the timeout
    // or landed here without going through the chat. Send them back
    // to the ALT entry.
    navigate("/welcome-alt");
    return () => {};
  }

  paint(target, sid);

  // Defensive — if analysis hasn't landed yet, poll until it does.
  // maybeOpenAltBrief already waits for isAnalysisReady before
  // navigating here, but a fresh tab + sessionStorage replay could
  // still arrive early.
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

function readSessionId() {
  try {
    return window.sessionStorage.getItem(WELCOME_ALT_KEY);
  } catch {
    return null;
  }
}

function clearSessionId() {
  try {
    window.sessionStorage.removeItem(WELCOME_ALT_KEY);
  } catch {
    /* ignore */
  }
}

function paint(target, sid) {
  const draft = getDraft(sid);
  const ready = isAnalysisReady(sid);
  const briefContent = ready
    ? renderBriefSections(draft, { isRead: true, canRefine: false })
    : `
      <div class="welcome-recap__pending">
        <i class="ap-icon-sparkles-mermaid"></i>
        <p>Reading your site…</p>
        <p class="welcome-recap__pending-sub">The recap lands in a moment.</p>
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
        <span class="welcome-screen__chip">BETA</span>
      </header>
      <div class="welcome-screen__body welcome-recap">
        <div class="welcome-recap__header">
          <span class="welcome-step__tag">Result</span>
          <h1 class="welcome-recap__title">Here's your Playbook.</h1>
          <p class="welcome-recap__sub">
            Here's what I pulled from your Brand through our chat. Refine it or jump straight in.
          </p>
        </div>
        <div class="welcome-recap__body context-brief context-brief--read">
          <div class="context-brief__body">${raw(briefContent)}</div>
        </div>
      </div>
      <footer class="welcome-recap__footer">
        <button type="button" class="ap-button stroked grey" data-welcome-finetune ${ready ? "" : "disabled"}>
          <i class="ap-icon-sparkles"></i>
          <span>Fine-tune Playbook</span>
        </button>
        <button type="button" class="ap-button primary orange" data-welcome-done ${ready ? "" : "disabled"}>
          <span>Enter Archie</span>
          <i class="ap-icon-arrow-right"></i>
        </button>
      </footer>
    </section>
  `;
}

function onClick(event, sid) {
  const fineTune = event.target.closest("[data-welcome-finetune]");
  if (fineTune) {
    const saved = save(sid);
    if (!saved) return;
    clearSessionId();
    document.body.classList.remove("onboarding");
    // Fine-tune launches the conversational Playbook editor on the
    // freshly-saved context. The user can iterate; on exit they land
    // at "/". Note: save() already fired the ALT onComplete callback
    // (set on session mount) which flips mode → returning and
    // navigates + reloads. So launching the playbook editor here
    // races with that reload. Skip the launchPlaybookEditor on this
    // path for now — the user can always re-open the editor from the
    // dashboard. Keep the button for visual parity with the linear
    // recap.
    return;
  }
  if (event.target.closest("[data-welcome-done]")) {
    const saved = save(sid);
    if (!saved) return;
    clearSessionId();
    // save() fires onComplete which flips mode + navigates + reloads.
    // We don't need to do anything else here.
    return;
  }
  // Suppress unused-import warning for launchPlaybookEditor until we
  // wire up the fine-tune flow properly.
  void launchPlaybookEditor;
}
