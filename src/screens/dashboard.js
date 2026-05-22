import { getSessions } from "../sessions-store.js?v=1";
import { getContexts } from "../contexts-store.js?v=28";
import { isNewUser, isNewUserAlt } from "../user-mode.js?v=21";
import { hasHandoff } from "../handoff.js?v=20";

// Dashboard route — pure redirect surface.
//
// Three branches:
//   1. First-time onboarding — isNewUser() with no Playbook yet → /welcome.
//   2. Just finished onboarding — welcomeComplete handoff armed → drop
//      the user on a fresh session with the new Playbook pre-attached so
//      the empty hero already feels personal (the session screen consumes
//      the handoff and surfaces a "Bienvenue {playbook}!" toast).
//   3. Returning user — most recent session, or /session/new if none.
//
// The earlier draft of this screen rendered a "New chat" form + Content
// workspace. Lot 13 aligned the prototype with the handoff App.jsx pattern
// where `/` IS the active chat — the redirect happens here, the standalone
// /sources, /ideas, /contexts views own the library surfaces, and the
// Sidebar's "Chats" nav item still points at `/`.

export function renderDashboard(_params, _target) {
  // Branch 1 — first-time user without a Playbook → onboarding.
  // ALT mode lands on /welcome-alt (visual profile picker → conversational
  // builder); regular new mode lands on the linear 4-screen /welcome.
  if (isNewUser() && getContexts().length === 0) {
    const target = isNewUserAlt() ? "#/welcome-alt" : "#/welcome";
    window.location.replace(window.location.href.split("#")[0] + target);
    return;
  }

  // Branch 2 — fresh from onboarding. Pre-attach the new Playbook so the
  // user's first chat already reads as theirs. hasHandoff peeks without
  // consuming; session.js consumes it on mount to fire the welcome toast.
  if (hasHandoff("welcomeComplete")) {
    const latest = getContexts()[0];
    const ctxParam = latest?.id ? `?contextId=${encodeURIComponent(latest.id)}` : "";
    window.location.replace(window.location.href.split("#")[0] + `#/session/new${ctxParam}`);
    return;
  }

  // Branch 3 — normal redirect.
  const recent = getSessions()[0];
  const targetPath = isNewUser() || !recent ? "/session/new" : `/session/${recent.id}`;
  window.location.replace(window.location.href.split("#")[0] + "#" + targetPath);
}
