// Tiny admin helper: lets the prototype preview three entry-point states.
//   "new"       → first-time user, linear 4-screen /welcome wizard
//   "new-alt"   → first-time user, hybrid flow: visual profile picker then
//                 conversational Playbook builder (no sidebar/topbar)
//   "returning" → populated mocks everywhere
//
// The mode is stored in localStorage and read synchronously at render time.
// Toggling reloads the page so nothing has to subscribe to changes.

const KEY = "archie-user-mode";

export function getUserMode() {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "new") return "new";
    if (v === "new-alt") return "new-alt";
    return "returning";
  } catch {
    return "returning";
  }
}

export function setUserMode(mode) {
  try {
    if (mode === "new") window.localStorage.setItem(KEY, "new");
    else if (mode === "new-alt") window.localStorage.setItem(KEY, "new-alt");
    else window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}

// Both first-time variants count as "new" for empty-store seeding —
// ALT users still start with no contexts/sessions in the mocks.
export function isNewUser() {
  const m = getUserMode();
  return m === "new" || m === "new-alt";
}

export function isNewUserAlt() {
  return getUserMode() === "new-alt";
}
