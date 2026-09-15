// Share a Playbook — the one surface where a Playbook's reach is decided.
//
// Three reaches, and the middle one carries a list: mine alone, a FIXED set of
// colleagues, or the whole organisation — a DYNAMIC set that follows people in
// and out of the org. The doc asks twice for that distinction to be underlined
// (§5.1), so it is what the two sharing cards say first, before who-may-use vs
// who-may-edit. ⚠️ This dialog shipped as a radio PAIR for two weeks, on an
// arbitration that was never written down; the doc has had three states all
// along, so the picker is back.
//
// It also holds the two things that only make sense once a Playbook is shared:
// who owns it (and handing that over), and the change log. Neither belongs on
// the Playbook page itself — the fiche answers "who are you?", not "who touched
// this?" (CONCEPTS.md §1).
//
// Public API:
//   init()  — inject markup + bind once on app boot
//   open({ contextId, onDone })
//     • onDone() — fired after a committed change (scope or ownership), so the
//       caller can repaint or bail out if it just handed away its own access.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=1195";
import { getContextById, updateContext, appendHistory } from "../contexts-store.js?v=1195";
import {
  canTransfer,
  isMine,
  actingOnBehalf,
  ownerName,
  recipientsOf,
  tiedProfile,
  profileBlockFor,
} from "../playbook-access.js?v=1195";
import { MEMBERS, ORG, CURRENT_USER, getMember, memberName } from "../org.js?v=1195";
import { showToast } from "./toast.js?v=1195";
import { html, raw, escapeHtml } from "../utils.js?v=1195";

const MODAL_ID = "sharePlaybook";

let backdrop, modal, subtitleEl, contentEl, saveBtn, cancelBtn, closeBtn;
let initialized = false;
let activeId = null;
let pendingOnDone = null;
// The two controls the scope is derived from (see `pickedScope`): who has been
// invited by name, and whether general access is the whole org. Both in module
// state rather than read off the DOM, because adding or removing somebody is a
// structural change and the body is rebuilt around it.
let invited = new Set();
let orgAccess = false;
// The invite field's query, kept for the same reason: a re-render must not
// swallow what the reader was typing.
let query = "";
let transferTo = null;

// Search has to ignore accents, or half this org is unreachable by typing:
// "lea" would miss Léa Mercier and "ines" Inès Ferrand. Folded on both sides —
// the row key and the query.
function fold(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const HTML = `
<div class="app-modal-backdrop share-playbook-modal__backdrop" id="sharePlaybookBackdrop" hidden></div>
<aside
  class="ap-dialog share-playbook-modal"
  id="sharePlaybookModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="sharePlaybookTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="sharePlaybookTitle">Share this Playbook</span>
    <span class="ap-dialog-subtitle" id="sharePlaybookSubtitle"></span>
  </div>
  <button class="ap-dialog-close" type="button" id="sharePlaybookClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content" id="sharePlaybookContent"></div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="sharePlaybookCancel">Cancel</button>
      <button type="button" class="ap-button primary blue" id="sharePlaybookSave">Save</button>
    </div>
  </div>
</aside>`;

function avatar(member) {
  const initials = member?.initials || "?";
  return html`<span class="ap-avatar size-24" aria-hidden="true"
    ><span class="ap-avatar-initials">${initials}</span></span
  >`;
}

// ── The two lists ─────────────────────────────────────────────────────
// The shape Notion, Slite and Drive all landed on, and for the same reason:
// the question a reader opens this dialog with is "who has this?", not "which
// of three modes is this in?". So the answer is the first thing on screen —
// a list of faces — and the scope stops being something you pick at all. It
// is DERIVED from the two controls: a field that adds people, and a general-
// access select underneath.
//
// ⚠️ This replaced three `.ap-radio-card` modes (Just me / Specific people /
// Everyone at {org}) with a people picker folded behind the middle one. The
// three stored scopes are untouched — the doc requires all three (§5.1) and
// `pickedScope()` is the one place they are reconstituted:
//   organization ← general access is the org
//   members      ← invited list has somebody in it
//   personal     ← neither
// Nobody has to name a mode to reach one, which is the whole point.

// Who the invite field can offer: the org, minus the owner (who holds it by
// construction) and minus whoever is already on the list.
function candidates(ctx) {
  return MEMBERS.filter((m) => m.id !== ctx.ownerId);
}

function suggestions(ctx) {
  return candidates(ctx).filter((m) => !invited.has(m.id));
}

// The scope the two controls add up to. Never chosen directly.
function pickedScope() {
  if (orgAccess) return "organization";
  return invited.size ? "members" : "personal";
}

// The invite field. Its suggestion list lives IN FLOW under it (same rule as
// every other dropdown here — a floating panel in a scrolling dialog ends up
// over the footer), and shows while the field holds focus, the way Notion's
// does: adding somebody is the primary action, so it costs no click to start.
function renderInvite(ctx) {
  // Org-wide, there is nobody left to invite: everyone is already in.
  if (orgAccess) return "";
  const rows = suggestions(ctx);
  const q = fold(query.trim());
  const list = rows
    .map((m) => {
      const hidden = q && !fold(m.name).includes(q);
      // "Le destinataire ne peut pas être sélectionné" (doc §7): the row stays
      // in the list, disabled, and says WHY — dropping it would leave the owner
      // wondering where their colleague went. A short tag + tooltip rather than
      // a sentence, so a row stays one line.
      const blocked = profileBlockFor(ctx, m.id);
      const account = blocked ? blocked.handle || blocked.name || "this account" : "";
      return html`<button
        type="button"
        class="share-playbook-modal__suggestion${raw(blocked ? " is-disabled" : "")}${raw(hidden ? " is-hidden" : "")}"
        data-share-add="${m.id}"
        data-share-row="${fold(m.name)}"
        ${raw(blocked ? "disabled" : "")}
      >
        ${raw(avatar(m))}
        <span class="share-playbook-modal__row-name">${m.name}</span>
        ${raw(
          blocked ? html`<span class="ap-tag grey mini" data-tooltip="No access to ${account}">No access</span>` : "",
        )}
      </button>`;
    })
    .join("");
  const visible = rows.filter((m) => !q || fold(m.name).includes(q)).length;
  return html`
    <div class="share-playbook-modal__invite">
      <div class="ap-input-group share-playbook-modal__invite-field">
        <i class="ap-icon-user--plus" aria-hidden="true"></i>
        <input
          type="text"
          value="${query}"
          data-share-search
          placeholder="Add a teammate…"
          aria-label="Add a teammate"
          autocomplete="off"
        />
      </div>
      <div class="share-playbook-modal__suggestions" data-share-suggestions hidden>
        ${raw(list)}
        <!-- Always in the DOM, just hidden: typing filters rows in place
             instead of re-rendering, so there has to be a node to reveal. -->
        <p class="share-playbook-modal__nomatch" data-share-nomatch ${raw(visible ? "hidden" : "")}>
          ${raw(
            rows.length
              ? `Nobody at ${escapeHtml(ORG.name)} matches your search.`
              : `Everyone at ${escapeHtml(ORG.name)} is already on the list.`,
          )}
        </p>
      </div>
    </div>
  `;
}

// "you", on whichever row is mine — the owner's when the Playbook is mine, a
// recipient's when a manager is looking at a colleague's. A reader scanning a
// list of twelve colleagues should never have to find themselves by name.
function youChip(memberId) {
  if (memberId !== CURRENT_USER.id) return "";
  return `<span class="share-playbook-modal__you">you</span>`;
}

// Who has it, owner first. ⚠️ The owner used to be a separate labelled block
// below the decision; it is a row of this list now, because "who can open
// this" and "whose is it" are one answer with one shape, and two of them made
// the reader join the halves themselves.
function renderPeople(ctx) {
  const owner = getMember(ctx.ownerId);
  const named = candidates(ctx).filter((m) => invited.has(m.id));
  const rows = [
    html`<li class="share-playbook-modal__person">
      ${raw(avatar(owner))}
      <span class="share-playbook-modal__row-main">
        <span class="share-playbook-modal__row-name">${raw(owner ? escapeHtml(owner.name) : "a teammate")}</span>
        ${raw(youChip(ctx.ownerId))}
      </span>
      <span class="share-playbook-modal__role">Owner</span>
    </li>`,
    ...named.map(
      (m) =>
        html`<li class="share-playbook-modal__person">
          ${raw(avatar(m))}
          <span class="share-playbook-modal__row-main">
            <span class="share-playbook-modal__row-name">${m.name}</span>
            ${raw(youChip(m.id))}
          </span>
          <span class="share-playbook-modal__role">${raw(orgAccess ? "Invited" : "Can use")}</span>
          ${raw(
            orgAccess
              ? ""
              : html`<button
                  type="button"
                  class="ap-icon-button share-playbook-modal__remove"
                  data-share-remove="${m.id}"
                  aria-label="Remove ${m.name}"
                  data-tooltip="Remove ${m.name}"
                >
                  <i class="ap-icon-close" aria-hidden="true"></i>
                </button>`,
          )}
        </li>`,
    ),
  ].join("");
  return html`
    <section class="share-playbook-modal__section">
      <h3 class="share-playbook-modal__section-title">People with access</h3>
      <ul class="share-playbook-modal__people">
        ${raw(rows)}
      </ul>
      ${raw(orgAccess ? "" : reachNote(ctx))}
    </section>
  `;
}

// What every share has in common — the single role a recipient gets. It sits
// under whichever control DEFINES the reach: the people list while access is
// invite-only, the general-access line once the whole org is in. Left under a
// list of three while twelve can open it, "they" would name the wrong people.
// ⚠️ It used to be
// two sentences repeated verbatim inside both sharing cards — a third of the
// dialog's words were a duplicate. It was also WRONG on a manager's screen:
// "you stay the only one who can change it" is a promise about the OWNER, and
// a manager governing Sam's Playbook still can't edit a word of it (canEdit is
// the owner, full stop).
function reachNote(ctx) {
  if (pickedScope() === "personal") return "";
  const who = isMine(ctx) ? "you" : escapeHtml(ownerName(ctx));
  return html`<p class="share-playbook-modal__note">
    They can read it and write with it. Only ${raw(who)} can change what it says.
  </p>`;
}

// General access — the second half of the answer, and the only place the
// FIXED ⇄ DYNAMIC difference has to be drawn (doc §5.1): the list above is a
// fixed set of named faces you can count, this select is a rule that follows
// the org.
function renderGeneral(ctx) {
  const options = [
    {
      value: "invited",
      icon: "ap-icon-lock-on",
      label: "Invited people only",
      hint: `Nobody else at ${escapeHtml(ORG.name)} can open it.`,
    },
    {
      value: "organization",
      icon: "ap-icon-multiple-users",
      label: `Everyone at ${escapeHtml(ORG.name)}`,
      hint: orgReachLine(ctx),
    },
  ];
  const current = options[orgAccess ? 1 : 0];
  const list = options
    .map((o) => {
      const on = o === current;
      return html`<div
        class="ap-select-option${raw(on ? " selected" : "")}"
        data-share-general="${o.value}"
        role="option"
        aria-selected="${on ? "true" : "false"}"
      >
        <i class="${o.icon} ap-select-option-icon" aria-hidden="true"></i>
        <span class="ap-select-option-text">${raw(o.label)}</span>
        ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");
  return html`
    <section class="share-playbook-modal__section">
      <h3 class="share-playbook-modal__section-title">General access</h3>
      <details class="ap-select share-playbook-modal__general">
        <summary class="ap-select-trigger">
          <i class="${current.icon} share-playbook-modal__general-glyph" aria-hidden="true"></i>
          <span class="ap-select-value">${raw(current.label)}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown share-playbook-modal__generaldrop" role="listbox" aria-label="General access">
          <div class="ap-select-options">${raw(list)}</div>
        </div>
      </details>
      <p class="share-playbook-modal__note">${raw(current.hint)}</p>
      ${raw(orgAccess ? reachNote(ctx) : "")}
    </section>
  `;
}

// The dynamic list, said accurately. A Playbook that publishes under a social
// profile doesn't reach the whole org — it reaches the part of it that can see
// that profile, joiners included (doc §7). Promising "all 12" would be a lie
// the invite list contradicts a few rows above.
function orgReachLine(ctx) {
  const profile = tiedProfile(ctx);
  if (!profile) {
    return `All ${ORG.memberCount} today, and whoever joins next — the list <strong>follows</strong> the org.`;
  }
  return `Everyone who can reach ${escapeHtml(profile.handle || profile.name || "this account")}, joiners included — the list <strong>follows</strong> the org.`;
}

// Who it reaches TODAY: the stored list minus anyone the profile gate already
// keeps out, because that is who canView() actually lets in. Using the raw list
// instead would open the dialog "dirty", offering to remove a colleague who
// never had access in the first place.
function currentRecipients(ctx) {
  return recipientsOf(ctx).filter((id) => !profileBlockFor(ctx, id));
}

// Who this Playbook reaches if the current pick commits. `null` for the org —
// the list is dynamic, so it can't be enumerated.
function reachAfter(ctx) {
  const target = pickedScope();
  if (target === "organization") return null;
  if (target === "members") return candidates(ctx).filter((m) => invited.has(m.id));
  return [];
}

// Who can open it TODAY, for the same comparison. Also null for the org.
function reachBefore(ctx) {
  if (ctx.scope === "organization") return null;
  if (ctx.scope === "members") {
    const now = currentRecipients(ctx);
    return candidates(ctx).filter((m) => now.includes(m.id));
  }
  return [];
}

// Has anything actually changed? The scope, or — within a named share — the
// list. Without the second half, Save would stand down while the reader is
// still editing who is on it.
function isDirty(ctx) {
  const target = pickedScope();
  if (target !== ctx.scope) return true;
  if (target !== "members") return false;
  const before = currentRecipients(ctx);
  return before.length !== invited.size || before.some((id) => !invited.has(id));
}

// Only shown when the reach SHRINKS — sharing more widely never costs anyone
// anything. Say the consequence before it happens, not in a toast after.
//
// Two ranks, not one paragraph: WHO loses access is the fact the reader has to
// weigh, and what survives is the reassurance under it. Flat, they read as four
// lines of equal yellow and the name got lost in the middle of them.
function renderConsequence(ctx) {
  const before = reachBefore(ctx);
  const after = reachAfter(ctx);
  // Going org-wide takes nothing away from anyone.
  if (after === null) return "";
  const KEPT =
    "Chats they started on this Playbook keep the drafts already written — those can still be saved and " +
    "scheduled — but nothing new will generate. Playbooks they duplicated from it are their own and stay untouched.";
  let lead = "";
  let detail = KEPT;
  if (before === null) {
    // Leaving an org-wide share: the losers can't be named, so count the work.
    const chats = ctx.usedIn || 0;
    const who = chats === 1 ? "1 chat" : `${chats} chats`;
    lead = chats
      ? `${who} across ${escapeHtml(ORG.name)} still run on this Playbook.`
      : `Anyone at ${escapeHtml(ORG.name)} who opened it loses access.`;
  } else {
    const keep = new Set(after.map((m) => m.id));
    const losing = before.filter((m) => !keep.has(m.id));
    if (!losing.length) return "";
    const names = listNames(losing.map((m) => m.name));
    lead = `${names} ${losing.length === 1 ? "loses" : "lose"} access.`;
  }
  return html`
    <div class="ap-infobox warning share-playbook-modal__warn">
      <i class="ap-icon-warning" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-title share-playbook-modal__warn-lead">${raw(lead)}</span>
          <span class="ap-infobox-message share-playbook-modal__warn-detail">${raw(detail)}</span>
        </div>
      </div>
    </div>
  `;
}

// "Léa Mercier", "Léa Mercier and Nina Kowalski", "Léa Mercier, Nina Kowalski
// and 2 others" — a warning that lists eleven names stops being read.
function listNames(names) {
  const safe = names.map((n) => escapeHtml(n));
  if (safe.length === 1) return safe[0];
  if (safe.length === 2) return `${safe[0]} and ${safe[1]}`;
  const rest = safe.length - 2;
  return `${safe[0]}, ${safe[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

// Everything below the rule is about the OBJECT rather than its reach: how it
// changes hands, and what has already happened to it. ⚠️ WHO owns it used to
// be a labelled block here too — it is the first row of the people list now,
// tagged `Owner`, because "who can open this" and "whose is it" are one answer
// with one shape, and two of them made the reader join the halves themselves.
function renderTransfer(ctx) {
  if (!canTransfer(ctx)) return "";
  const target = transferTo ? getMember(transferTo) : null;
  const candidates = MEMBERS.filter((m) => m.id !== ctx.ownerId);
  const options = candidates
    .map((m) => {
      const on = m.id === transferTo;
      return html`<div
        class="ap-select-option${raw(on ? " selected" : "")}"
        data-share-owner="${m.id}"
        role="option"
        aria-selected="${on ? "true" : "false"}"
      >
        <span class="ap-select-option-text">${m.name}${raw(m.id === CURRENT_USER.id ? " (you)" : "")}</span>
        ${raw(on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : "")}
      </div>`;
    })
    .join("");

  return html`
    <details class="share-playbook-modal__fold share-playbook-modal__handover">
      <summary>
        <i class="ap-icon-user--arrow-right share-playbook-modal__fold-glyph" aria-hidden="true"></i>
        <span class="share-playbook-modal__fold-label">Hand it over to someone else</span>
        <i class="ap-icon-chevron-down share-playbook-modal__fold-chevron" aria-hidden="true"></i>
      </summary>
      <div class="share-playbook-modal__fold-body">
        <div class="share-playbook-modal__handover-row">
          <details class="ap-select share-playbook-modal__ownerselect">
            <summary class="ap-select-trigger">
              <span class="ap-select-value"
                >${raw(
                  target ? escapeHtml(target.name) : `<span class="ap-select-placeholder">Choose a teammate…</span>`,
                )}</span
              >
              <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
            </summary>
            <div class="ap-select-dropdown share-playbook-modal__ownerdrop" role="listbox" aria-label="New owner">
              <div class="ap-select-options">${raw(options)}</div>
            </div>
          </details>
          <button
            type="button"
            class="ap-button stroked grey share-playbook-modal__transfer"
            data-share-transfer
            ${raw(transferTo ? "" : "disabled")}
          >
            <span>Transfer</span>
          </button>
        </div>
        <p class="share-playbook-modal__handover-note">
          They become the only person who can edit it${raw(isMine(ctx) ? " — including instead of you" : "")}.
        </p>
      </div>
    </details>
  `;
}

function renderLog(ctx) {
  const entries = Array.isArray(ctx.history) ? ctx.history.slice().reverse() : [];
  if (!entries.length) return "";
  const rows = entries
    .map(
      (e) =>
        html`<li class="share-playbook-modal__log-row">
          <span class="share-playbook-modal__log-who">${raw(escapeHtml(memberName(e.actorId)))}</span>
          <span class="share-playbook-modal__log-what">${e.action}</span>
          <span class="share-playbook-modal__log-when">${e.when}</span>
        </li>`,
    )
    .join("");
  return html`
    <details class="share-playbook-modal__fold share-playbook-modal__log">
      <summary>
        <i class="ap-icon-history share-playbook-modal__fold-glyph" aria-hidden="true"></i>
        <span class="share-playbook-modal__fold-label">Recent changes</span>
        <i class="ap-icon-chevron-down share-playbook-modal__fold-chevron" aria-hidden="true"></i>
      </summary>
      <div class="share-playbook-modal__fold-body">
        <ul class="share-playbook-modal__log-list">
          ${raw(rows)}
        </ul>
      </div>
    </details>
  `;
}

function renderBody() {
  const ctx = getContextById(activeId);
  if (!ctx) return;
  subtitleEl.textContent = ctx.name;
  const gov = `${renderTransfer(ctx)}${renderLog(ctx)}`;
  contentEl.innerHTML = [
    renderInvite(ctx),
    renderPeople(ctx),
    renderGeneral(ctx),
    // A slot rather than the infobox itself: general access has to be able to
    // rewrite the warning without rebuilding anything around it.
    // (`:empty` hides the slot, so an absent warning costs no gap.)
    `<div id="sharePlaybookWarn">${renderConsequence(ctx)}</div>`,
    // The governance zone is one block behind one rule — emitted only when it
    // has something in it, or the rule would draw under nothing.
    gov ? `<div class="share-playbook-modal__gov">${gov}</div>` : "",
  ].join("");
  syncCommit(ctx);
}

// Rebuild, then put the caret back where it was: adding or removing somebody
// changes both lists at once, so it can't be a targeted patch — but a reader
// mid-invite must not have the field yanked out from under them.
function renderAndRefocus() {
  renderBody();
  const input = contentEl.querySelector("[data-share-search]");
  if (!input) return;
  input.focus({ preventScroll: true });
  openSuggestions(true);
}

function openSuggestions(open) {
  const box = contentEl.querySelector("[data-share-suggestions]");
  if (box) box.hidden = !open;
}

// Save's two facts — whether there's a change to commit, and what committing
// will do.
function syncCommit(ctx) {
  const target = pickedScope();
  const n = invited.size;
  // One meaningful action: Save commits the reach and nothing else, so it stands
  // down when the pick matches what's already true. Transfer has its own button
  // because it's a different decision, not a variant of this one.
  const dirty = isDirty(ctx);
  saveBtn.disabled = !dirty;
  // The label names the CHANGE, not the state: standing down it must not offer
  // "Share with 2 people" for a Playbook already shared with exactly those two
  // — a disabled button describing what is already true reads as a failure.
  if (!dirty) saveBtn.textContent = "Save";
  else if (target === "organization") saveBtn.textContent = "Share with the org";
  else if (target === "personal") saveBtn.textContent = "Make it private";
  else saveBtn.textContent = n === 1 ? "Share with 1 person" : `Share with ${n} people`;
}

function refreshConsequence(ctx) {
  const slot = contentEl.querySelector("#sharePlaybookWarn");
  if (slot) slot.innerHTML = renderConsequence(ctx);
}

// Live search over the rows already on screen — never a re-render, or the
// caret would leave the field on the first keystroke.
function filterSuggestions() {
  const q = fold(query.trim());
  let visible = 0;
  contentEl.querySelectorAll("[data-share-row]").forEach((row) => {
    const match = !q || row.dataset.shareRow.includes(q);
    row.classList.toggle("is-hidden", !match);
    if (match) visible += 1;
  });
  const empty = contentEl.querySelector("[data-share-nomatch]");
  if (empty) empty.hidden = visible !== 0;
}

// The first row the query still shows — what Enter commits to, so typing a
// name and pressing Enter adds it without reaching for the mouse.
function firstMatch() {
  return contentEl.querySelector("[data-share-add]:not(.is-hidden):not([disabled])");
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("sharePlaybookBackdrop");
  modal = document.getElementById("sharePlaybookModal");
  subtitleEl = document.getElementById("sharePlaybookSubtitle");
  contentEl = document.getElementById("sharePlaybookContent");
  saveBtn = document.getElementById("sharePlaybookSave");
  cancelBtn = document.getElementById("sharePlaybookCancel");
  closeBtn = document.getElementById("sharePlaybookClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  bindOverlayDismissal({ modal, backdrop, close });
  saveBtn.addEventListener("click", commitScope);

  contentEl.addEventListener("input", (event) => {
    if (!event.target.matches("[data-share-search]")) return;
    query = event.target.value || "";
    filterSuggestions();
    openSuggestions(true);
  });

  // The suggestion list follows the field's focus, the way Notion's does: it
  // opens on focus (adding somebody is why this dialog exists, so it costs no
  // click to start) and closes when focus leaves the invite block entirely.
  // `focusout` with a relatedTarget test, because the click that ADDS somebody
  // moves focus to a row inside the same block.
  contentEl.addEventListener("focusin", (event) => {
    if (event.target.closest(".share-playbook-modal__invite")) openSuggestions(true);
  });
  contentEl.addEventListener("focusout", (event) => {
    // Adding somebody rebuilds the body, which tears the focused input out of
    // the DOM — the browser then fires a focusout for it, with a null
    // relatedTarget, AFTER the new input has been focused. Its ancestors came
    // away with it, so `.closest()` still matches; only "is this still in the
    // document?" tells the two apart. Without this, every add bounced focus
    // back to <body> and shut the suggestion list the reader was working in.
    if (!contentEl.contains(event.target)) return;
    const block = event.target.closest(".share-playbook-modal__invite");
    if (!block) return;
    if (event.relatedTarget && block.contains(event.relatedTarget)) return;
    openSuggestions(false);
  });

  contentEl.addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-share-search]")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const row = firstMatch();
      if (row) addMember(row.dataset.shareAdd);
      return;
    }
    // Escape closes the suggestions before it closes the dialog — the modal's
    // own handler sits on `document` in the bubble phase, so stopping here is
    // enough to let one Escape mean "never mind this list".
    if (event.key === "Escape") {
      const box = contentEl.querySelector("[data-share-suggestions]");
      if (box && !box.hidden) {
        event.stopPropagation();
        openSuggestions(false);
      }
    }
  });

  contentEl.addEventListener("click", (event) => {
    const add = event.target.closest("[data-share-add]");
    if (add) {
      addMember(add.dataset.shareAdd);
      return;
    }
    const remove = event.target.closest("[data-share-remove]");
    if (remove) {
      invited.delete(remove.dataset.shareRemove);
      renderBody();
      return;
    }
    const general = event.target.closest("[data-share-general]");
    if (general) {
      orgAccess = general.dataset.shareGeneral === "organization";
      renderBody();
      return;
    }
    const owner = event.target.closest("[data-share-owner]");
    if (owner) {
      transferTo = owner.dataset.shareOwner;
      renderBody();
      // renderBody() rebuilds the body, which would collapse the disclosure the
      // click happened inside — reopen it so the Transfer button stays reachable.
      contentEl.querySelector(".share-playbook-modal__handover")?.setAttribute("open", "");
      return;
    }
    if (event.target.closest("[data-share-transfer]")) commitTransfer();
  });

  initialized = true;
}

// Adding somebody clears the query, the way every picker of this shape does:
// the next name you type starts from the whole org again, not from the letters
// of the last one.
function addMember(id) {
  if (!id) return;
  invited.add(id);
  query = "";
  renderAndRefocus();
}

export function init() {
  injectOnce();
}

// Every write goes through here: the log line is part of the change, not an
// afterthought, and acting on someone else's Playbook owes them a heads-up.
function record(ctx, action) {
  appendHistory(ctx.id, action);
  if (actingOnBehalf(ctx)) showToast(`${ownerName(ctx)} will be notified.`);
}

function commitScope() {
  const ctx = getContextById(activeId);
  if (!ctx || !isDirty(ctx)) return;
  const target = pickedScope();
  const ids = candidates(ctx)
    .filter((m) => invited.has(m.id))
    .map((m) => m.id);
  // An empty named share reaches nobody — which `pickedScope()` already reads
  // as "personal", so this can only be a bug if it ever fires.
  if (target === "members" && !ids.length) return;

  const named = ids.length === 1 ? memberName(ids[0]) : `${ids.length} people`;
  let action;
  let toastText;
  if (target === "organization") {
    action = "shared it with the organisation";
    toastText = `Everyone at ${ORG.name} can now use “${ctx.name}”.`;
  } else if (target === "personal") {
    action = ctx.scope === "organization" ? "stopped sharing it with the organisation" : "stopped sharing it";
    toastText = `“${ctx.name}” is yours alone again.`;
  } else if (ctx.scope === "members") {
    // Same reach, different list. The log says a list changed and not what it
    // became, for the same reason it carries no diffs anywhere else.
    action = "changed who it's shared with";
    toastText = `Updated who can use “${ctx.name}”.`;
  } else {
    // `named` is already the person's name when there's exactly one of them.
    action = `shared it with ${named}`;
    toastText = `${named} can now use “${ctx.name}”.`;
  }

  record(ctx, action);
  // sharedWith is only written when it's the list being decided: leaving a named
  // share for private keeps it, so coming back re-offers the same people
  // (doc §5.3 — both ways, no data loss).
  updateContext(ctx.id, target === "members" ? { scope: target, sharedWith: ids } : { scope: target });
  const fn = pendingOnDone;
  close();
  showToast(toastText);
  if (typeof fn === "function") fn();
}

function commitTransfer() {
  const ctx = getContextById(activeId);
  if (!ctx || !transferTo || transferTo === ctx.ownerId) return;
  const to = getMember(transferTo);
  record(ctx, `handed it over to ${to?.name || "a teammate"}`);
  updateContext(ctx.id, { ownerId: transferTo });
  const fn = pendingOnDone;
  close();
  showToast(`“${ctx.name}” now belongs to ${to?.name || "a teammate"}.`);
  if (typeof fn === "function") fn();
}

export function open({ contextId, onDone = null } = {}) {
  const ctx = getContextById(contextId);
  if (!ctx) return;
  injectOnce();
  requestOpen(MODAL_ID, close);

  activeId = contextId;
  pendingOnDone = onDone;
  orgAccess = ctx.scope === "organization";
  // Seeded from the Playbook whatever its scope is: a fiche pulled back to
  // private still remembers the list, so pulling general access back to
  // "Invited people only" offers the same names rather than an empty slate
  // (doc §5.3 — both directions, no data loss).
  invited = new Set(currentRecipients(ctx));
  query = "";
  transferTo = null;
  renderBody();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  // No autofocus on the invite field: it would open its suggestion list over
  // the rest of the dialog before the reader has read a word of it. The list
  // of who has access is what this dialog is for — let it be seen first.
  setTimeout(() => {
    modal.focus?.({ preventScroll: true });
  }, 0);
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  activeId = null;
  pendingOnDone = null;
  transferTo = null;
  invited = new Set();
  orgAccess = false;
  query = "";
  notifyClose(MODAL_ID);
}
