// The ACTIVE PLAYBOOK — the one scope everything else in Archie hangs off.
//
// A Playbook is not a field on several objects any more. It is the level ABOVE
// them: one Playbook is active at all times, chosen once from the switcher at the
// top of the rail, and every surface below it — Content strategy, the Topic feed,
// the chat list, a new chat, the new-session Topics — shows only that brand's
// work. Nothing asks again.
//
// ── What this removed ─────────────────────────────────────────────────────
// Four separate pickers: the composer's Playbook select, the Topic-feed form's,
// the New-pillar dialog's, and the Playbook facet on /content-strategy. Each was
// the same question asked in a different place, and any two of them could
// disagree — a chat, a feed and a pillar could belong to three different brands
// at once and only the objects knew.
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

import { getContexts, getContextById, getDefaultContext } from "./contexts-store.js?v=78";
import { createNotifier } from "./store-utils.js?v=3";

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
