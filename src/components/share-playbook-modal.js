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
// It also holds the thing that only makes sense once a Playbook is shared:
// who owns it, and handing that over. It doesn't belong on the Playbook page
// itself — the fiche answers "who are you?", not "whose is this?"
// (CONCEPTS.md §1).
//
// Public API:
//   init()  — inject markup + bind once on app boot
//   open({ contextId, onDone })
//     • onDone() — fired after a committed change (scope or ownership), so the
//       caller can repaint or bail out if it just handed away its own access.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=1228";
import { getContextById, updateContext, appendHistory } from "../contexts-store.js?v=1228";
import {
  canTransfer,
  isMine,
  actingOnBehalf,
  ownerName,
  recipientsOf,
  tiedProfile,
  profileBlockFor,
} from "../playbook-access.js?v=1228";
import { MEMBERS, ORG, CURRENT_USER, getMember, memberName } from "../org.js?v=1228";
import { showToast } from "./toast.js?v=1228";
import { html, raw, escapeHtml } from "../utils.js?v=1228";

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
// The handover picker's own query. It doubles as the field's value once a
// teammate is picked, so the field shows the choice instead of an empty box
// next to an enabled Transfer button.
let transferQuery = "";

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
// is DERIVED from the two controls: a picker that adds people, and a
// general-access select underneath.
//
// ⚠️ This replaced three `.ap-radio-card` modes (Just me / Specific people /
// Everyone at {org}) with a people picker folded behind the middle one. The
// three stored scopes are untouched — the doc requires all three (§5.1) and
// `pickedScope()` is the one place they are reconstituted:
//   organization ← general access is the org
//   members      ← invited list has somebody in it
//   personal     ← neither
// Nobody has to name a mode to reach one, which is the whole point.
//
// ⚠️ EVERY control here is a DS component, unmodified. A pass invented two —
// a hand-rolled borderless combobox for the invite and a switch row for
// general access — because a dropdown could not escape the scrolling dialog.
// That was solving the wrong problem: the app already answers it (the
// sidebar's row menu), and the answer is `position: fixed` + coordinates set
// on toggle, not a new component. See `placePopover`.

// Who the picker can offer: the org, minus the owner (who holds it by
// construction).
function candidates(ctx) {
  return MEMBERS.filter((m) => m.id !== ctx.ownerId);
}

// The scope the two controls add up to. Never chosen directly.
function pickedScope() {
  if (orgAccess) return "organization";
  return invited.size ? "members" : "personal";
}

// The people picker: the DS **Selection Dropdown** behind an `.ap-select`
// trigger — the component the design system ships for exactly this (search +
// checkable items + an empty state), and the same composition the save-drafts
// dialog uses for its folder picker. Ticking a row IS adding somebody; the
// list below is the readout, so the dropdown stays open while you work.
function renderPicker(ctx) {
  // Org-wide, there is nobody left to invite: everyone is already in.
  if (orgAccess) return "";
  const rows = candidates(ctx);
  const q = fold(query.trim());
  const list = rows
    .map((m) => {
      const on = invited.has(m.id);
      const hidden = q && !fold(m.name).includes(q);
      // "Le destinataire ne peut pas être sélectionné" (doc §7): the row stays
      // in the list, disabled, and says WHY — dropping it would leave the owner
      // wondering where their colleague went.
      const blocked = profileBlockFor(ctx, m.id);
      const account = blocked ? blocked.handle || blocked.name || "this account" : "";
      return html`<label
        class="ap-selection-dropdown-item share-playbook-modal__member${raw(blocked ? " is-disabled" : "")}${raw(
          hidden ? " is-hidden" : "",
        )}"
        data-share-row="${fold(m.name)}"
      >
        <span class="ap-checkbox-container">
          <input
            type="checkbox"
            value="${m.id}"
            data-share-member
            ${raw(on ? "checked" : "")}
            ${raw(blocked ? "disabled" : "")}
          />
          <i></i>
        </span>
        ${raw(avatar(m))}
        <span class="share-playbook-modal__row-name">${m.name}</span>
        ${raw(
          blocked ? html`<span class="ap-tag grey mini" data-tooltip="No access to ${account}">No access</span>` : "",
        )}
      </label>`;
    })
    .join("");
  const visible = rows.filter((m) => !q || fold(m.name).includes(q)).length;
  return html`
    <details class="ap-select share-playbook-modal__picker" data-share-pop>
      <summary class="ap-select-trigger">
        <i class="ap-icon-user--plus share-playbook-modal__trigger-glyph" aria-hidden="true"></i>
        <span class="ap-select-value"><span class="ap-select-placeholder">Add teammates…</span></span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-selection-dropdown share-playbook-modal__pop">
        <div class="ap-selection-dropdown-search">
          <i class="ap-icon-search" aria-hidden="true"></i>
          <input
            type="text"
            value="${query}"
            data-share-search
            placeholder="Search ${escapeHtml(ORG.name)}…"
            aria-label="Search teammates"
            autocomplete="off"
          />
        </div>
        <div class="ap-selection-dropdown-items" role="group" aria-label="People to share with">
          ${raw(list)}
          <!-- Always in the DOM, just hidden: typing filters rows in place
               instead of re-rendering, so there has to be a node to reveal. -->
          <div class="ap-selection-dropdown-empty" data-share-nomatch ${raw(visible ? "hidden" : "")}>
            Nobody at ${escapeHtml(ORG.name)} matches your search.
          </div>
        </div>
      </div>
    </details>
  `;
}

// "you", on whichever row is mine — the owner's when the Playbook is mine, a
// recipient's when a manager is looking at a colleague's. A reader scanning a
// list of twelve colleagues should never have to find themselves by name.
function youChip(memberId) {
  if (memberId !== CURRENT_USER.id) return "";
  return `<span class="share-playbook-modal__you">you</span>`;
}

// The people rows. Owner first — ⚠️ it used to be a separate labelled block
// below the decision, but "who can open this" and "whose is it" are one
// answer with one shape, and two of them made the reader join the halves.
function peopleRows(ctx) {
  const owner = getMember(ctx.ownerId);
  const named = candidates(ctx).filter((m) => invited.has(m.id));
  return [
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
}

function renderPeople(ctx) {
  return html`
    <section class="share-playbook-modal__section">
      <h3 class="share-playbook-modal__section-title">People with access</h3>
      ${raw(renderPicker(ctx))}
      <ul class="share-playbook-modal__people" data-share-people>
        ${raw(peopleRows(ctx))}
      </ul>
      ${raw(orgAccess ? "" : reachNote(ctx))}
    </section>
  `;
}

// What every share has in common — the single role a recipient gets. It sits
// under whichever control DEFINES the reach: the people list while access is
// invite-only, the general-access line once the whole org is in. Left under a
// list of three while twelve can open it, "they" would name the wrong people.
// ⚠️ It used to be two sentences repeated verbatim inside both sharing cards —
// a third of the dialog's words were a duplicate. It was also WRONG on a
// manager's screen: "you stay the only one who can change it" is a promise
// about the OWNER, and a manager governing Sam's Playbook still can't edit a
// word of it (canEdit is the owner, full stop).
function reachNote(ctx) {
  if (pickedScope() === "personal") return "";
  const who = isMine(ctx) ? "you" : escapeHtml(ownerName(ctx));
  return html`<p class="share-playbook-modal__note">
    They can read it and write with it. Only ${raw(who)} can change what it says.
  </p>`;
}

// General access — the DS select, two options. This is the only place the
// FIXED ⇄ DYNAMIC difference has to be drawn (doc §5.1): the list above is a
// set of named faces you can count, this is a rule that follows the org.
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
      <details class="ap-select share-playbook-modal__general" data-share-pop>
        <summary class="ap-select-trigger">
          <i class="${current.icon} share-playbook-modal__trigger-glyph" aria-hidden="true"></i>
          <span class="ap-select-value">${raw(current.label)}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-select-dropdown share-playbook-modal__pop" role="listbox" aria-label="General access">
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
// the picker contradicts a few rows above.
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
  const options = MEMBERS.filter((m) => m.id !== ctx.ownerId)
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
        <span class="share-playbook-modal__fold-label">Transfer ownership to another teammate</span>
        <i class="ap-icon-chevron-down share-playbook-modal__fold-chevron" aria-hidden="true"></i>
      </summary>
      <div class="share-playbook-modal__fold-body">
        <div class="share-playbook-modal__handover-row">
          <details class="ap-select share-playbook-modal__ownerselect" data-share-pop>
            <summary class="ap-select-trigger">
              <span class="ap-select-value"
                >${raw(
                  target ? escapeHtml(target.name) : `<span class="ap-select-placeholder">Choose a teammate…</span>`,
                )}</span
              >
              <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
            </summary>
            <div class="ap-select-dropdown share-playbook-modal__pop" role="listbox" aria-label="New owner">
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

function renderBody() {
  const ctx = getContextById(activeId);
  if (!ctx) return;
  subtitleEl.textContent = ctx.name;
  const gov = renderTransfer(ctx);
  contentEl.innerHTML = [
    // General access FIRST, because it GATES the section under it: org-wide
    // there is nobody left to invite and the picker goes away. ⚠️ The list was
    // on top for a while, on the argument that "who has this?" is the question
    // the dialog is opened with — but that put the reader in front of a list to
    // configure, with a control BELOW it that could make what they had just
    // done moot. Reading order follows the dependency; the gate is one row, so
    // the list still lands in the first screenful.
    renderGeneral(ctx),
    renderPeople(ctx),
    // A slot rather than the infobox itself: general access has to be able to
    // rewrite the warning without rebuilding anything around it.
    // (`:empty` hides the slot, so an absent warning costs no gap.)
    `<div id="sharePlaybookWarn">${renderConsequence(ctx)}</div>`,
    // The governance zone is one block behind one rule — emitted only when it
    // has something in it, or the rule would draw under nothing. ⚠️ It used to
    // hold a "Recent changes" log too; that section was dropped (the store still
    // records the trail, see contexts-store's appendHistory — nothing renders it).
    gov ? `<div class="share-playbook-modal__gov">${gov}</div>` : "",
  ].join("");
  syncCommit(ctx);
}

// Both pickers — invite and handover — are the same block, so every helper
// takes the element you are acting from and finds ITS panel. Global lookups
// would have the second picker driving the first one's list.
// A DS dropdown is `position: absolute` inside its `.ap-select`, and this
// dialog's body SCROLLS — a scroller clips absolutely-positioned children, so
// the panel would be cut off at the dialog's edge. The app already answers
// this: the sidebar's row menu goes `position: fixed` and has its coordinates
// set on toggle. Same mechanism here, for all three dropdowns.
//
// ⚠️ The wrong answer, tried and removed, was to invent components that open
// in flow — a borderless combobox and a switch row — which pushed the dialog
// open instead of floating over it, and were not DS components at all.
function placePopover(details) {
  const panel = details?.querySelector("[class*='share-playbook-modal__pop']");
  const trigger = details?.querySelector("summary");
  if (!panel || !trigger || !modal) return;
  const r = trigger.getBoundingClientRect();
  // ⚠️ `position: fixed` does NOT resolve against the viewport here. Every
  // centred modal in this app carries `transform: translate(-50%, -50%)`, and a
  // transformed ancestor becomes the containing block of its fixed
  // descendants — so viewport coordinates land the panel off by the modal's own
  // origin (measured: 211px right, 129px down). Offset by the modal's box, and
  // the panel still escapes the scrolling body because the modal is what it is
  // positioned against, not the scroller.
  const host = modal.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 16;
  const above = r.top - 16;
  // Flip up only when below genuinely can't hold a usable panel AND above is
  // roomier — a panel that jumps sides on a few pixels reads as a glitch.
  const flip = below < 200 && above > below;
  panel.style.width = `${Math.round(r.width)}px`;
  panel.style.left = `${Math.round(r.left - host.left)}px`;
  panel.style.maxHeight = `${Math.round(Math.max(140, Math.min(320, flip ? above : below)))}px`;
  if (flip) {
    panel.style.top = "auto";
    panel.style.bottom = `${Math.round(host.bottom - r.top + 4)}px`;
  } else {
    panel.style.bottom = "auto";
    panel.style.top = `${Math.round(r.bottom - host.top + 4)}px`;
  }
}

// One open at a time, and never left floating over a dialog the reader has
// scrolled away from.
function closePopovers(except) {
  contentEl?.querySelectorAll("details[data-share-pop][open]").forEach((d) => {
    if (d !== except) d.open = false;
  });
}

// Live search over the rows already on screen — never a re-render, or the
// caret would leave the field on the first keystroke.
function filterMembers() {
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

// Ticking somebody must NOT rebuild the body: the dropdown is a multi-select
// and would close on every pick, taking the search query with it. The people
// list is the readout, so only it is redrawn.
function refreshPeople(ctx) {
  const list = contentEl.querySelector("[data-share-people]");
  if (list) list.innerHTML = peopleRows(ctx);
  syncCommit(ctx);
  refreshConsequence(ctx);
}

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
// Picking a new owner is a single choice, so it CLOSES its dropdown and the
// field then shows the name rather than an empty box beside an enabled button.
function pickNewOwner(id) {
  const member = getMember(id);
  if (!member) return;
  transferTo = id;
  renderBody();
  // renderBody() rebuilds the body, which would collapse the disclosure the
  // click happened inside — reopen it so the Transfer button stays reachable.
  contentEl.querySelector(".share-playbook-modal__handover")?.setAttribute("open", "");
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

  // Ticking a teammate in the Selection Dropdown: targeted refresh only, so the
  // panel stays open, the row keeps focus and the search query survives.
  contentEl.addEventListener("change", (event) => {
    const ctx = getContextById(activeId);
    if (!ctx || !event.target.matches("[data-share-member]")) return;
    if (event.target.checked) invited.add(event.target.value);
    else invited.delete(event.target.value);
    refreshPeople(ctx);
  });

  contentEl.addEventListener("input", (event) => {
    if (!event.target.matches("[data-share-search]")) return;
    query = event.target.value || "";
    filterMembers();
  });

  contentEl.addEventListener("click", (event) => {
    // A DS dropdown lives in a <details>; wait for `open` to flip, then place
    // the panel. Same shape as the sidebar's row menu.
    const pop = event.target.closest("details[data-share-pop] > summary");
    if (pop) {
      const details = pop.parentElement;
      requestAnimationFrame(() => {
        if (details.open) {
          closePopovers(details);
          placePopover(details);
        }
      });
      return;
    }
    const remove = event.target.closest("[data-share-remove]");
    if (remove) {
      const ctx = getContextById(activeId);
      invited.delete(remove.dataset.shareRemove);
      if (ctx) refreshPeople(ctx);
      // The dropdown's own checkbox has to follow, or the two disagree.
      const box = contentEl.querySelector(`[data-share-member][value="${remove.dataset.shareRemove}"]`);
      if (box) box.checked = false;
      return;
    }
    const general = event.target.closest("[data-share-general]");
    if (general) {
      orgAccess = general.dataset.shareGeneral === "organization";
      // Structural: org-wide there is nobody left to invite, so the picker goes
      // and the role line moves. Rebuild.
      renderBody();
      return;
    }
    const owner = event.target.closest("[data-share-owner]");
    if (owner) {
      pickNewOwner(owner.dataset.shareOwner);
      return;
    }
    if (event.target.closest("[data-share-transfer]")) commitTransfer();
  });

  // A fixed-position panel does not travel with its trigger, so a scroll would
  // leave it hanging over the wrong row.
  contentEl.addEventListener("scroll", () => closePopovers());
  // <details> has no outside-click close of its own, and a floating panel left
  // open over a dialog is worse than one that shuts.
  document.addEventListener("click", (event) => {
    if (!modal?.classList.contains("open")) return;
    if (event.target.closest("details[data-share-pop]")) return;
    closePopovers();
  });

  initialized = true;
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
  // The log says what the control said — a trail that renames the gesture is
  // a trail you have to translate.
  record(ctx, `transferred ownership to ${to?.name || "a teammate"}`);
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
  transferQuery = "";
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
  transferQuery = "";
  invited = new Set();
  orgAccess = false;
  query = "";
  notifyClose(MODAL_ID);
}
