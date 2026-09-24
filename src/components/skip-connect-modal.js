// "Skip connecting an account?" — the dialog that intercepts the Skip on
// onboarding's account step, reassures, and asks why.
//
// Public API:
//   init()                            — inject markup + bind once on app boot
//   open({ onSkip, onDismiss })
//       onSkip(reasons: string[], comment: string) — the skip is confirmed
//       onDismiss()                                — backed out; the step stands
//
// ── Why intercept a Skip at all ───────────────────────────────────────────
// Under `skipConnectProfiles` the account step is a choice, and the whole bet
// of that feature is that a user who declines here is not lost — the ask comes
// back in the chat flows that draft FOR an account. But nothing anywhere
// records WHY they declined, and that is the one question this step can answer
// that no later surface can: the hesitation is live, and the reasons are not
// interchangeable. "I don't have the admin rights" is an org problem, "I'd
// rather not link our accounts yet" is a trust problem, and "the network isn't
// in the list" is a gap in the product. They need different answers.
//
// So the dialog does two jobs in the order the user needs them:
//   1. REASSURE — what a connected account is actually used for, and what
//      never happens. Most of the hesitation here is about publishing rights,
//      so the three lines answer that before asking anything in return.
//      Connecting belongs to Agorapulse, not to Archie (CONCEPTS.md §6), and
//      the copy says so rather than implying Archie holds the accounts.
//   2. ASK — a multi-select, because the reasons genuinely stack (no rights
//      AND someone else handles it AND they'd like to look around first).
//
// ⚠️ Answering is REQUIRED: Skip stays disabled until a box is ticked. That is
// a deliberate departure from topic-ignore-modal, whose reason is optional —
// there, the reason is a bonus on an action the reader already owns; here it is
// the only thing the step gets back for letting the user through, and the same
// user meets this dialog once in their life. Backing out is always free (Back,
// Esc, the backdrop, the X), and it returns to the network grid rather than
// skipping — so the gate is on the SKIP, never on leaving the dialog.
//
// The whole module only ever runs under `skipConnectProfiles`: it is reached
// from the one Skip that flag creates, so it needs no flag test of its own.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=1232";

const MODAL_ID = "skip-connect";

// What a connected account is for, and what it doesn't do. Three, because the
// hesitation this dialog meets is almost always about publishing rights.
//
// Each one is a CLAIM plus its detail, not a sentence: the three claims alone
// (69 characters) carry the whole answer for someone who only scans, and the
// captions are there for whoever reads on. The first pass was three two-line
// paragraphs at one weight and one size — 260 characters with no rank, so the
// reader had to read all of it to find out none of it was the question.
//
// Every detail is ≤ 29 characters, which is what holds ONE line in a 170px
// column (33 wraps — measured, not guessed), so the three read as a tidy row
// instead of 1-2-2. And each one ADDS a fact the claim doesn't state: what
// never happens, what is read, where the accounts live. A caption that only
// rephrases its claim is the padding this block was full of.
const ASSURANCES = [
  {
    icon: "ap-icon-lock-on",
    claim: "You approve every draft",
    detail: "Nothing publishes on its own.",
  },
  {
    icon: "ap-icon-eye-on",
    claim: "I learn from your posts",
    detail: "Only what's already public.",
  },
  {
    icon: "ap-icon-user",
    claim: "Your accounts stay yours",
    detail: "In Agorapulse, not in Archie.",
  },
];

// The reasons, in the order they come up. `other` is last and carries the free
// text — the glossary keeps "Other…" out of primary labels, so the row reads
// "Something else" and the input is what collects it.
const REASONS = [
  { value: "no-access", label: "I don't have the login or the admin rights" },
  { value: "someone-else", label: "Someone else on the team handles our accounts" },
  { value: "try-first", label: "I want to see what Archie does before connecting" },
  { value: "not-yet", label: "I'd rather not link our accounts to a new tool yet" },
  { value: "network-missing", label: "The network I publish on isn't in the list" },
  { value: "other", label: "Something else" },
];

let backdrop, modal, listEl, otherField, otherInput, skipBtn, backBtn, closeBtn;
let initialized = false;
let pendingOnSkip = null;
let pendingOnDismiss = null;

const HTML = `
<div class="app-modal-backdrop skip-connect__backdrop" id="skipConnectBackdrop" hidden></div>
<aside
  class="ap-dialog skip-connect"
  id="skipConnectModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="skipConnectTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="skipConnectTitle">Skip connecting an account?</span>
  </div>
  <button class="ap-dialog-close" type="button" id="skipConnectClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="skip-connect__lead">
      A connected account is what tells me the format, the length and where a draft gets scheduled.
    </p>
    <ul class="skip-connect__assurances">
      ${ASSURANCES.map(
        (a) => `
      <li class="skip-connect__assurance">
        <i class="${a.icon}" aria-hidden="true"></i>
        <strong class="skip-connect__claim">${a.claim}</strong>
        <span class="skip-connect__detail">${a.detail}</span>
      </li>`,
      ).join("")}
    </ul>
    <div class="ap-form-field skip-connect__question">
      <label class="skip-connect__label" id="skipConnectReasonsLabel">Why not now?</label>
      <p class="skip-connect__hint">Tick everything that applies — at least one.</p>
      <div class="skip-connect__reasons" id="skipConnectReasons" role="group" aria-labelledby="skipConnectReasonsLabel">
        ${REASONS.map(
          (r) => `
        <label class="ap-checkbox-container skip-connect__reason">
          <input type="checkbox" value="${r.value}" data-skip-reason />
          <i></i>
          <span>${r.label}</span>
        </label>`,
        ).join("")}
      </div>
      <div class="ap-input-group skip-connect__other" id="skipConnectOtherField" hidden>
        <input type="text" id="skipConnectOther" placeholder="What's holding it up?" aria-label="Something else" />
      </div>
    </div>
    <div class="ap-infobox info skip-connect__note">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">Skipping costs you nothing — I'll ask again when I write your first draft, and you can connect an account from any chat.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="skipConnectBack">Back</button>
      <button type="button" class="ap-button primary blue" id="skipConnectSkip" disabled>Skip</button>
    </div>
  </div>
</aside>`;

function selectedReasons() {
  return Array.from(listEl.querySelectorAll("[data-skip-reason]:checked")).map((el) => el.value);
}

// The free-text row belongs to the "Something else" tick: it appears with it and
// is cleared when it goes, so a stale sentence can't be reported under reasons
// the user un-ticked.
function syncOther() {
  const on = listEl.querySelector('[data-skip-reason][value="other"]')?.checked;
  otherField.hidden = !on;
  if (!on) otherInput.value = "";
  else otherInput.focus({ preventScroll: true });
}

function syncSkip() {
  skipBtn.disabled = selectedReasons().length === 0;
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("skipConnectBackdrop");
  modal = document.getElementById("skipConnectModal");
  listEl = document.getElementById("skipConnectReasons");
  otherField = document.getElementById("skipConnectOtherField");
  otherInput = document.getElementById("skipConnectOther");
  skipBtn = document.getElementById("skipConnectSkip");
  backBtn = document.getElementById("skipConnectBack");
  closeBtn = document.getElementById("skipConnectClose");

  backBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  skipBtn.addEventListener("click", submit);

  // Escape + backdrop go through the shared helper, which binds Escape on
  // `document`: nothing inside this dialog holds focus on open (the first
  // control is a checkbox, and stealing focus onto it would tick nothing while
  // suggesting it had), so a modal-scoped keydown would never fire.
  bindOverlayDismissal({ modal, backdrop, close });

  listEl.addEventListener("change", (event) => {
    if (!event.target.matches("[data-skip-reason]")) return;
    if (event.target.value === "other") syncOther();
    syncSkip();
  });

  // Enter in the free-text row submits, the way it would in a one-field form.
  otherInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !skipBtn.disabled) {
      event.preventDefault();
      submit();
    }
  });

  initialized = true;
}

function submit() {
  const reasons = selectedReasons();
  if (!reasons.length) return;
  const comment = otherInput.value.trim();
  const fn = pendingOnSkip;
  pendingOnSkip = null;
  pendingOnDismiss = null;
  close();
  if (typeof fn === "function") fn(reasons, comment);
}

export function init() {
  injectOnce();
}

export function open({ onSkip = null, onDismiss = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  pendingOnSkip = onSkip;
  pendingOnDismiss = onDismiss;

  listEl.querySelectorAll("[data-skip-reason]").forEach((el) => {
    el.checked = false;
  });
  otherInput.value = "";
  otherField.hidden = true;
  syncSkip();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
}

export function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  // Still holding onSkip means the skip was never confirmed: this is a back-out,
  // and the caller has to put its step back — the card grid is gone from screen
  // (the dialog took over), so there would be nothing left otherwise. Same
  // contract as connect-account-modal's onDismiss.
  const dismissed = pendingOnSkip ? pendingOnDismiss : null;
  pendingOnSkip = null;
  pendingOnDismiss = null;
  notifyClose(MODAL_ID);
  if (typeof dismissed === "function") dismissed();
}
