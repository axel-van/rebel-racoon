import { getSessions } from "../sessions-store.js?v=1149";
import { scopeSessions } from "../active-playbook.js?v=1149";
import { getContexts } from "../contexts-store.js?v=1149";
import { isNewUser } from "../user-mode.js?v=1149";

// Dashboard route — pure redirect surface.
//
// Two branches:
//   1. First-time onboarding — isNewUser() with no Playbook yet → /welcome-alt.
//   2. Returning user — most recent session, or /session/new if none.
//
// `/` renders nothing of its own, deliberately. This is a tool you come to with
// a task already in mind, so the landing page is the chat you were last in.
//
// It DID render something once: behind the `frontPage` flag, `/` became a
// magazine front page filled by the listening feature — a lead story, a grid of
// six, section chips. That went out with the Topics magazine it was built on
// (see the Topic Feed § in CLAUDE.md). If a front page comes back, it comes back
// on top of the Topic Feed's own data, not as a second reader of a second store.
//
// ⚠️ The account home is NOT that page: `/home` (screens/home.js, flag
// `playbookWorkspace`) is a page of what you HAVE — your Playbooks and your
// chats — while the front page was a page of what Archie PROPOSES. `/` is still
// only a redirect, and it resolves the active BRAND's home; `/home` is the
// account's. Two levels, two homes.

export function renderDashboard(_params, _target) {
  // Branch 1 — first-time user without a Playbook → onboarding.
  // ALT mode lands on /welcome-alt (visual profile picker → conversational
  // Playbook builder).
  if (isNewUser() && getContexts().length === 0) {
    window.location.replace(window.location.href.split("#")[0] + "#/welcome-alt");
    return;
  }

  // Branch 2 — normal redirect, THROUGH the scope. In workspace mode `/` is
  // "the home of the brand I'm in": landing on another brand's chat would put a
  // conversation on screen that the rail beside it doesn't list. It is also the
  // one definition of that destination — the rail's switcher and the way back
  // from the catalogue both come here rather than each computing their own.
  const recent = scopeSessions(getSessions())[0];
  const targetPath = isNewUser() || !recent ? "/session/new" : `/session/${recent.id}`;
  window.location.replace(window.location.href.split("#")[0] + "#" + targetPath);
}
