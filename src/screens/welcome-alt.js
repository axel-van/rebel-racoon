// First Time User ALT — thin redirect. We don't render anything; we
// mint a transient session, arm the pendingStartContextBuilder handoff
// with `flow: "alt"` + `finishMode: "switch-to-returning"`, and
// navigate immediately. session.js consumes the handoff on mount and
// fires contextBuilder.startAlt() inside the onboarding chrome (the
// session view hides sidebar+topbar when path matches
// /session/welcome-alt-*, see app.js setAfterRender).
//
// Earlier iteration rendered a visual single-select profile picker
// here; user feedback was that ALT should be conversational from the
// first screen — the profile pick is now question 2 of 3 inside the
// chat, alongside URL (q1) and Documents (q3, skippable).

import { navigate } from "../router.js?v=30";
import { setHandoff } from "../handoff.js?v=20";

// Mock URL — the brand site is supposed to be collected by an earlier
// step that lives outside the prototype. We hardcode a believable value
// here so the conversational entry feels like a continuation, not the
// first beat. Matches the "NS" brand initials used by askAltProfile.
const PREFILLED_URL = "https://nicesoap.com";

export function renderWelcomeAlt(_params, _target) {
  // First-time onboarding is full-bleed: make sure no leftover
  // "integrated" flag (from a previous New-Playbook run) keeps the app
  // shell visible here.
  try {
    window.sessionStorage.removeItem("welcomeAltIntegrated");
    window.sessionStorage.removeItem("welcomeAltReturnTo");
  } catch {
    /* ignore */
  }
  document.body.classList.add("onboarding");
  const sid = `welcome-alt-${Date.now().toString(36)}`;
  setHandoff("pendingStartContextBuilder", {
    returnTo: "/",
    finishMode: "switch-to-returning",
    flow: "alt",
    prefilledUrl: PREFILLED_URL,
  });
  navigate(`/session/${sid}`);
  return () => {};
}
