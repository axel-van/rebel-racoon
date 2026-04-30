import { recentSessions } from "../mocks.js?v=25";
import { isNewUser } from "../user-mode.js?v=20";

// Dashboard route — pure redirect surface.
//
// The earlier draft of this screen rendered a "New chat" form + Content
// workspace (welcome card / projects panel / content section). Lot 13 aligned
// the prototype with the handoff App.jsx pattern where `/` IS the active
// chat — the redirect happens here, the standalone /sources, /ideas,
// /contexts views own the library surfaces, and the Sidebar's "Chats" nav
// item still points at `/`, so clicking it lands the user back on a chat
// surface either way.
//
// FIND-A3: the previous render code (renderProjectsPanel + welcome card +
// content section + bindings) was unreachable because the redirect runs
// before any rendering. ~280 lines deleted; if a true `/dashboard` empty
// home is reintroduced later, restore from git history rather than keeping
// dead code on main.

export function renderDashboard(_params, _target) {
  const recent = recentSessions[0];
  const targetPath = isNewUser() || !recent ? "/session/new" : `/session/${recent.id}`;
  // Use replace() rather than navigate() so the browser history doesn't end
  // up with a `/` entry that immediately bounces — feels broken on Back.
  window.location.replace(window.location.href.split("#")[0] + "#" + targetPath);
}
