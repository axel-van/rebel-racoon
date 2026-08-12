import { getSessions } from "../sessions-store.js?v=38";
import { getContexts } from "../contexts-store.js?v=72";
import { isNewUser } from "../user-mode.js?v=22";

// Dashboard route — pure redirect surface.
//
// Two branches:
//   1. First-time onboarding — isNewUser() with no Playbook yet → /welcome-alt.
//   2. Returning user — most recent session, or /session/new if none.
//
// The earlier draft of this screen rendered a "New chat" form + Content
// workspace. Lot 13 aligned the prototype with the handoff App.jsx pattern
// where `/` IS the active chat — the redirect happens here, the standalone
// /sources, /ideas, /contexts views own the library surfaces, and the
// Sidebar's "Chats" nav item still points at `/`.

export function renderDashboard(_params, _target) {
  // Branch 1 — first-time user without a Playbook → onboarding.
  // ALT mode lands on /welcome-alt (visual profile picker → conversational
  // Playbook builder).
  if (isNewUser() && getContexts().length === 0) {
    window.location.replace(window.location.href.split("#")[0] + "#/welcome-alt");
    return;
  }

  // Branch 2 — normal redirect.
  const recent = getSessions()[0];
  const targetPath = isNewUser() || !recent ? "/session/new" : `/session/${recent.id}`;
  window.location.replace(window.location.href.split("#")[0] + "#" + targetPath);
}
