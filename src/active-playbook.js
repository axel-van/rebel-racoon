// The ACTIVE PLAYBOOK — the one scope everything else in Archie hangs off.
//
// A Playbook is not a field on the work any more. It is the level ABOVE it: one
// Playbook is active at all times, chosen once from the switcher under the
// wordmark in the rail, and every surface below it — the chat list, a new chat,
// the Topic feed and its count, Insights, the studios' drafts — is that brand's
// work. Nothing asks again.
//
// ⚠️ Gated by `playbookWorkspace`, EXCEPT for Insights, which reads the scope
// flag or no flag (it landed with this module, before the rest of the app used
// it). The gate is the three functions at the bottom of this file — every scoped
// surface reads those, never the flag, so OFF is byte-for-byte the per-chat
// model. Insights is the only caller that reads getActivePlaybook() directly.
//
// ── What this removed ─────────────────────────────────────────────────────
// Six separate pickers, each asking the same question somewhere else: the
// composer's Playbook select on a fresh chat, the Topic Feed toolbar's, the one
// on /topics/settings, and the batch / clip-studio / repurpose selects — plus
// `?pb=` in the URL and an implicit getDefaultContext() for anything new. Any
// two of them could disagree: a chat, a feed and a batch could belong to three
// different brands at once and only the objects knew.
//
// ── The cost, stated plainly ──────────────────────────────────────────────
// A global scope HIDES. Anything outside it is invisible rather than empty, so
// every surface that filters on this has to be one a user can plausibly believe
// is complete. That is why the switcher is permanent and always shows the brand
// name: the scope is only safe while it is legible. Cross-brand views were the
// price — there is no "All Playbooks" here, and adding one would turn the
// guarantee back into a filter.
//
// Persisted, like the sidebar's collapse state and the feature flags: reopening
// the app in a different brand than you left it is the one thing a scope must
// never do.
//
// Public API:
//   getActivePlaybookId()  → string | null
//   getActivePlaybook()    → Context | null   (falls back to the default)
//   setActivePlaybook(id)  mutates + notifies
//   subscribe(fn)          → unsubscribe
//   isWorkspaceMode()      → is the scope live at all? (flag playbookWorkspace)
//   playbookForNewWork()   → the Playbook new work is born under
//   scopeSessions(list)    → the chat list, scoped
//   isAccountScope(path)   → is this route ABOVE the workspaces?

import { getContexts, getContextById, getDefaultContext } from "./contexts-store.js?v=1228";
import { isFlagOn } from "./feature-flags.js?v=1228";
import { createNotifier } from "./store-utils.js?v=1228";

const KEY = "archie-active-playbook";

const notifier = createNotifier("active-playbook");
export const subscribe = notifier.subscribe;

let activeId = read();

function read() {
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

function write(id) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Resolved on every read rather than cached: a stored id can outlive the
// Playbook it names — deleted elsewhere, or absent in `new-alt` mode where the
// stores seed empty — and a scope pointing at nothing would empty every surface
// with no way to tell why.
export function getActivePlaybook() {
  const stored = activeId ? getContextById(activeId) : null;
  if (stored) return stored;
  const fallback = getDefaultContext() || getContexts()[0] || null;
  if (fallback && fallback.id !== activeId) {
    activeId = fallback.id;
    write(activeId);
  }
  return fallback;
}

export function getActivePlaybookId() {
  const pb = getActivePlaybook();
  return pb ? pb.id : null;
}

export function setActivePlaybook(id) {
  if (!id || id === activeId) return;
  activeId = id;
  write(id);
  notifier.notify(null);
}

// ── The flag's one short-circuit ──────────────────────────────────────────
//
// `playbookWorkspace` OFF has to be byte-for-byte the per-chat model, so every
// surface the workspace changes reads the scope through the three functions
// below rather than testing the flag itself — the same arrangement as
// `playbook-access.js` and its `playbookSharing` gate. One place to delete when
// the flag is baked in, one place to look when it misbehaves.

export function isWorkspaceMode() {
  return isFlagOn("playbookWorkspace");
}

// The Playbook a piece of NEW work is born under — a fresh chat, a clip studio,
// a batch, a repurpose board. Workspace mode: the active one, nothing asked.
// Otherwise the implicit default, which is the value those four pickers opened
// on anyway.
export function playbookForNewWork() {
  return isWorkspaceMode() ? getActivePlaybook() : getDefaultContext();
}

// The chat list, scoped to the active brand.
//
// A chat with NO Playbook is kept in EVERY workspace rather than filtered out:
// it belongs to no brand, so no workspace could claim it, and hiding it would
// make it unreachable from anywhere — a scope may hide what lives elsewhere,
// never what lives nowhere. With no scope resolved (new-alt mode, zero
// Playbooks) the filter is a no-op instead of an empty rail.
export function scopeSessions(list) {
  if (!isWorkspaceMode()) return list;
  const id = getActivePlaybookId();
  if (!id) return list;
  return list.filter((s) => !s.contextId || s.contextId === id);
}

// ── Above the workspaces ──────────────────────────────────────────────────
//
// Two levels, and the switcher is the seam between them. Inside a workspace,
// every surface is one brand's. But the CATALOGUE of brands — and any other
// brand's fiche you open from it — belongs to the level above: it talks about
// the marques you are not in, which is the one thing the rail promises never to
// do. So those routes step OUT of the shell (app.js drops `body.account-scope`
// on them, layout.css hides the rail) and lead back in with a crumb.
//
// ⚠️ The active brand's OWN fiche is not account scope: it is the workspace's
// identity sheet, the row in the rail points at it, and it keeps the chrome.
// That is the whole rule — the chrome follows the object's scope.
export function isAccountScope(path) {
  if (!isWorkspaceMode()) return false;
  // Both, deliberately: `/contexts` redirects to `/home` in this mode, and
  // afterRender() still runs once with the old path on the redirect frame —
  // dropping it there would flash the rail back in for one paint.
  if (path === "/home" || path === "/contexts") return true;
  const match = /^\/playbook\/([^/?]+)/.exec(path || "");
  return !!match && match[1] !== getActivePlaybookId();
}

// Where the catalogue of brands lives, per model — so no caller has to test the
// flag to find it. Workspace mode merged it into the account home; without the
// flag it is still its own page.
//
// ⚠️ WITH the tab. The home opens on Chats by default, so a control that says
// "All playbooks" and navigates to a bare `/home` lands on the other list —
// which is what every one of these doors did. Every caller uses this as a
// navigation target only (navigate / href / returnTo), never compared against a
// path, and path comparisons elsewhere read getPath(), which strips the query.
export function catalogueRoute() {
  return isWorkspaceMode() ? "/home?tab=playbooks" : "/contexts";
}
