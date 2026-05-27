// Tiny admin helper: lets the prototype preview two entry-point states.
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
    if (v === "new-alt") return "new-alt";
    return "returning";
  } catch {
    return "returning";
  }
}

export function setUserMode(mode) {
  try {
    if (mode === "new-alt") window.localStorage.setItem(KEY, "new-alt");
    else window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.location.reload();
}

// First-time users start with empty stores (no contexts/sessions in the
// mocks) so the onboarding flow seeds them from scratch.
export function isNewUser() {
  return getUserMode() === "new-alt";
}

export function isNewUserAlt() {
  return getUserMode() === "new-alt";
}
