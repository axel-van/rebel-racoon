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

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=1165";
import { getContextById, updateContext, appendHistory } from "../contexts-store.js?v=1165";
import {
  canTransfer,
  isMine,
  actingOnBehalf,
  ownerName,
  recipientsOf,
  tiedProfile,
  profileBlockFor,
} from "../playbook-access.js?v=1165";
import { MEMBERS, ORG, CURRENT_USER, getMember, memberName } from "../org.js?v=1165";
import { showToast } from "./toast.js?v=1165";
import { html, raw, escapeHtml } from "../utils.js?v=1165";

const MODAL_ID = "sharePlaybook";

let backdrop, modal, subtitleEl, contentEl, saveBtn, cancelBtn, closeBtn;
let initialized = false;
let activeId = null;
let pendingOnDone = null;
// The scope currently picked in the radio group — read back on Save. Kept in a
// variable rather than off the DOM so a re-render of the body can restore it.
let picked = "personal";
// Who is ticked in the people picker, for the "members" scope. A Set, seeded
// from the Playbook on open and committed as an array.
let pickedMembers = new Set();
// The people-picker's search box. In module state for the same reason as the
// rest: the body re-renders, and a query that vanished on every radio click
// would be worse than no search at all.
let memberQuery = "";
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

// Above this many rows a picker earns its search box — the same threshold
// social-profiles.js uses for profile pickers, so every list in the app flips
// at the same length.
const MEMBER_SEARCH_THRESHOLD = 8;

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

function renderScopeCards(ctx) {
  const org = `${escapeHtml(ORG.name)}`;
  return html`
    <div class="share-playbook-modal__options" role="radiogroup" aria-label="Who can use this Playbook">
      <label class="ap-radio-card card share-playbook-modal__option">
        <input type="radio" name="playbookScope" value="personal" ${raw(picked === "personal" ? "checked" : "")} />
        <div>
          <span class="ap-radio-card-title">
            <i class="ap-icon-lock-on" aria-hidden="true"></i>
            Just me
          </span>
          <span>Nobody else in ${raw(org)} can see it or use it.</span>
        </div>
      </label>

      <label class="ap-radio-card card share-playbook-modal__option">
        <input type="radio" name="playbookScope" value="members" ${raw(picked === "members" ? "checked" : "")} />
        <div>
          <span class="ap-radio-card-title">
            <i class="ap-icon-user--plus" aria-hidden="true"></i>
            Specific people
          </span>
          <span
            >A fixed list you choose below — nobody else, and nobody who joins later. They can read it and write with
            it. You stay the only one who can change it.</span
          >
        </div>
      </label>

      <label class="ap-radio-card card share-playbook-modal__option">
        <input
          type="radio"
          name="playbookScope"
          value="organization"
          ${raw(picked === "organization" ? "checked" : "")}
        />
        <div>
          <span class="ap-radio-card-title">
            <i class="ap-icon-multiple-users" aria-hidden="true"></i>
            Everyone at ${raw(org)}
          </span>
          <span
            >${raw(orgReachLine(ctx))} They can read it and write with it. You stay the only one who can change
            it.</span
          >
        </div>
      </label>
    </div>
  `;
}

// The dynamic list, said accurately. A Playbook that publishes under a social
// profile doesn't reach the whole org — it reaches the part of it that can see
// that profile, joiners included (doc §7). Promising "all 12" would be a lie
// the picker below contradicts three rows down.
function orgReachLine(ctx) {
  const profile = tiedProfile(ctx);
  if (!profile) {
    return `All ${ORG.memberCount} of them, and whoever joins next — the list follows the org.`;
  }
  return `Everyone who can reach ${escapeHtml(profile.handle || profile.name || "this account")}, joiners included — the list follows the org.`;
}

// Everyone the picker can offer: the org minus the owner, who holds it already.
function candidates(ctx) {
  return MEMBERS.filter((m) => m.id !== ctx.ownerId);
}

// The people picker, revealed by the middle card: the DS **Selection
// Dropdown** behind an `.ap-select` trigger — the component the design system
// ships for exactly this (search + checkable items + an empty state), and the
// same composition the save-drafts dialog already uses for its folder picker.
// One pattern for "pick from a list of things" in a modal, not two.
//
// ⚠️ It shipped for one commit as eleven full-width checkbox CARDS stacked in
// the dialog body. That made the content ~250px taller than a 900px viewport
// could hold — Save ended up under the fold — and it asked the reader to scan a
// wall of rows to answer "who has this?", which is what the trigger now says in
// one line. Don't go back to the flat list.
function renderMemberPicker(ctx) {
  if (picked !== "members") return "";
  const rows = candidates(ctx);
  const q = fold(memberQuery.trim());
  const list = rows
    .map((m) => {
      const on = pickedMembers.has(m.id);
      const hidden = q && !fold(m.name).includes(q);
      // "Le destinataire ne peut pas être sélectionné" (doc §7): the row stays
      // in the list, disabled, and says WHY — dropping it would leave the owner
      // wondering where their colleague went. A short tag + tooltip rather than
      // a sentence, so a row stays one line.
      const blocked = profileBlockFor(ctx, m.id);
      const account = blocked ? blocked.handle || blocked.name || "this account" : "";
      return html`<label
        class="ap-selection-dropdown-item share-playbook-modal__member${raw(blocked ? " is-disabled" : "")}${raw(
          hidden ? " is-hidden" : "",
        )}"
        data-share-member-row="${fold(m.name)}"
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
        <span class="share-playbook-modal__member-name">${m.name}</span>
        ${raw(
          blocked ? html`<span class="ap-tag grey mini" data-tooltip="No access to ${account}">No access</span>` : "",
        )}
      </label>`;
    })
    .join("");
  const visible = rows.filter((m) => !q || fold(m.name).includes(q)).length;
  // Open on arrival only while there is nobody to show in the trigger: that is
  // the state where the reader has to open it anyway (and Save is disabled, so
  // the panel covering the footer costs nothing). With a list already in the
  // trigger it starts collapsed, and Save is never hidden behind it.
  return html`
    <div class="share-playbook-modal__field">
      <details class="ap-select share-playbook-modal__combo" ${raw(pickedMembers.size ? "" : "open")}>
        <summary class="ap-select-trigger" title="Choose who gets this Playbook">
          <span class="ap-select-value" data-share-people-value>${raw(triggerContent(ctx))}</span>
          <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
        </summary>
        <div class="ap-selection-dropdown share-playbook-modal__dropdown">
          <div class="ap-selection-dropdown-search">
            <i class="ap-icon-search" aria-hidden="true"></i>
            <input
              type="text"
              value="${memberQuery}"
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
    </div>
  `;
}

// What the trigger says. Faces first (the DS avatar group, capped at three with
// its own overflow bubble), then the names — two of them fit, past that a count
// reads better than a truncated list.
function triggerContent(ctx) {
  const chosen = candidates(ctx).filter((m) => pickedMembers.has(m.id));
  if (!chosen.length) return html`<span class="ap-select-placeholder">Choose who gets it…</span>`;
  const shown = chosen.slice(0, 3);
  const extra = chosen.length - shown.length;
  // row-reverse on .ap-avatar-group means the LAST child sits leftmost, so the
  // overflow bubble is emitted first to land at the end of the stack.
  const faces = html`<span class="ap-avatar-group" aria-hidden="true"
    >${raw(extra ? html`<span class="ap-avatar-group-overflow">+${extra}</span>` : "")}${raw(
      shown
        .slice()
        .reverse()
        .map((m) => avatar(m))
        .join(""),
    )}</span
  >`;
  const label =
    chosen.length === 1
      ? chosen[0].name
      : chosen.length === 2
        ? `${chosen[0].name} and ${chosen[1].name}`
        : `${chosen.length} people`;
  return html`${raw(faces)}<span class="share-playbook-modal__people-label">${label}</span>`;
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
  if (picked === "organization") return null;
  if (picked === "members") return candidates(ctx).filter((m) => pickedMembers.has(m.id));
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
// still ticking people.
function isDirty(ctx) {
  if (picked !== ctx.scope) return true;
  if (picked !== "members") return false;
  const before = currentRecipients(ctx);
  return before.length !== pickedMembers.size || before.some((id) => !pickedMembers.has(id));
}

// Only shown when the reach SHRINKS — sharing more widely never costs anyone
// anything. Say the consequence before it happens, not in a toast after.
function renderConsequence(ctx) {
  const before = reachBefore(ctx);
  const after = reachAfter(ctx);
  // Going org-wide takes nothing away from anyone.
  if (after === null) return "";
  let body = "";
  if (before === null) {
    // Leaving an org-wide share: the losers can't be named, so count the work.
    const chats = ctx.usedIn || 0;
    const who = chats === 1 ? "1 chat" : `${chats} chats`;
    body = chats
      ? `${who} across ${escapeHtml(ORG.name)} still run on this Playbook. They keep the drafts already written — they can save and schedule those — but they won't be able to generate anything new.`
      : `Anyone in ${escapeHtml(ORG.name)} who opened it loses access. Playbooks they duplicated from it are their own and stay untouched.`;
  } else {
    const keep = new Set(after.map((m) => m.id));
    const losing = before.filter((m) => !keep.has(m.id));
    if (!losing.length) return "";
    const names = listNames(losing.map((m) => m.name));
    body = `${names} ${losing.length === 1 ? "loses" : "lose"} access. Chats they started on this Playbook keep the drafts already written — they can save and schedule those — but they won't be able to generate anything new. Playbooks they duplicated from it are their own and stay untouched.`;
  }
  return html`
    <div class="ap-infobox warning share-playbook-modal__warn">
      <i class="ap-icon-warning" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">${raw(body)}</span>
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

function renderTransfer(ctx) {
  if (!canTransfer(ctx)) return "";
  const owner = getMember(ctx.ownerId);
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
    <div class="share-playbook-modal__owner">
      <span class="share-playbook-modal__owner-label">Owner</span>
      <span class="share-playbook-modal__owner-who">
        ${raw(avatar(owner))}
        <span>${raw(owner ? escapeHtml(owner.name) : "a teammate")}${raw(isMine(ctx) ? " (you)" : "")}</span>
      </span>
    </div>
    <details class="share-playbook-modal__handover">
      <summary>Hand it over to someone else<i class="ap-icon-chevron-down" aria-hidden="true"></i></summary>
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
          <div class="ap-select-dropdown" role="listbox" aria-label="New owner">
            <div class="ap-select-options">${raw(options)}</div>
          </div>
        </details>
        <button
          type="button"
          class="ap-button stroked grey share-playbook-modal__transfer"
          data-share-transfer
          ${raw(transferTo ? "" : "disabled")}
        >
          <i class="ap-icon-user--arrow-right" aria-hidden="true"></i>
          <span>Transfer</span>
        </button>
      </div>
      <p class="share-playbook-modal__handover-note">
        They become the only person who can edit it${raw(isMine(ctx) ? " — including instead of you" : "")}.
      </p>
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
    <details class="share-playbook-modal__log">
      <summary>Recent changes<i class="ap-icon-chevron-down" aria-hidden="true"></i></summary>
      <ul class="share-playbook-modal__log-list">
        ${raw(rows)}
      </ul>
    </details>
  `;
}

function renderBody() {
  const ctx = getContextById(activeId);
  if (!ctx) return;
  subtitleEl.textContent = ctx.name;
  contentEl.innerHTML = [
    renderScopeCards(ctx),
    renderMemberPicker(ctx),
    // A slot rather than the infobox itself: ticking a person has to be able to
    // rewrite the warning without rebuilding the list the tick happened in.
    `<div id="sharePlaybookWarn">${renderConsequence(ctx)}</div>`,
    renderTransfer(ctx),
    renderLog(ctx),
  ].join("");
  syncCommit(ctx);
}

// Save's two facts — whether there's a change to commit, and what committing
// will do. Split out of renderBody so ticking a person can refresh them without
// re-rendering the picker under the reader's cursor (which would also take the
// search query with it).
function syncCommit(ctx) {
  const n = pickedMembers.size;
  // One meaningful action: Save commits the reach and nothing else, so it stands
  // down when the pick matches what's already true. Transfer has its own button
  // because it's a different decision, not a variant of this one.
  saveBtn.disabled = !isDirty(ctx) || (picked === "members" && n === 0);
  if (picked === "organization") saveBtn.textContent = "Share with the org";
  else if (picked === "personal") saveBtn.textContent = "Make it private";
  // A disabled button that says what's missing beats one that says "Share with
  // 0 people" — unticking everyone is not a way to make a Playbook private.
  else if (!n) saveBtn.textContent = "Pick who gets it";
  else saveBtn.textContent = n === 1 ? "Share with 1 person" : `Share with ${n} people`;
}

function refreshPickerTrigger(ctx) {
  const el = contentEl.querySelector("[data-share-people-value]");
  if (el) el.innerHTML = triggerContent(ctx);
}

function refreshConsequence(ctx) {
  const slot = contentEl.querySelector("#sharePlaybookWarn");
  if (slot) slot.innerHTML = renderConsequence(ctx);
}

// Live search over the rows already on screen — never a re-render, or the
// caret would leave the field on the first keystroke.
function filterMembers() {
  const q = fold(memberQuery.trim());
  let visible = 0;
  contentEl.querySelectorAll("[data-share-member-row]").forEach((row) => {
    const match = !q || row.dataset.shareMemberRow.includes(q);
    row.classList.toggle("is-hidden", !match);
    if (match) visible += 1;
  });
  const empty = contentEl.querySelector("[data-share-nomatch]");
  if (empty) empty.hidden = visible !== 0;
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

  contentEl.addEventListener("change", (event) => {
    const ctx = getContextById(activeId);
    if (!ctx) return;
    if (event.target.matches('input[name="playbookScope"]')) {
      picked = event.target.value;
      // A structural change — the picker appears or goes — so the whole body is
      // rebuilt, and the focus put back on the card that caused it.
      renderBody();
      contentEl.querySelector('input[name="playbookScope"]:checked')?.focus({ preventScroll: true });
      return;
    }
    if (event.target.matches("[data-share-member]")) {
      if (event.target.checked) pickedMembers.add(event.target.value);
      else pickedMembers.delete(event.target.value);
      // Targeted, not a re-render: the dropdown stays open, the row keeps its
      // focus, and the search query survives.
      syncCommit(ctx);
      refreshPickerTrigger(ctx);
      refreshConsequence(ctx);
    }
  });

  contentEl.addEventListener("input", (event) => {
    if (!event.target.matches("[data-share-search]")) return;
    memberQuery = event.target.value || "";
    filterMembers();
  });

  contentEl.addEventListener("click", (event) => {
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
  const target = picked;
  const ids = candidates(ctx)
    .filter((m) => pickedMembers.has(m.id))
    .map((m) => m.id);
  // An empty named share reaches nobody — that's "Just me" with extra steps,
  // and Save is disabled on it. Belt and braces, since Enter can reach here.
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
  picked = ctx.scope === "members" || ctx.scope === "organization" ? ctx.scope : "personal";
  // Seeded from the Playbook whatever its scope is: a fiche pulled back to
  // private still remembers the list, so picking "Specific people" again offers
  // the same names rather than an empty slate.
  pickedMembers = new Set(currentRecipients(ctx));
  memberQuery = "";
  transferTo = null;
  renderBody();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");

  setTimeout(() => {
    contentEl.querySelector('input[name="playbookScope"]:checked')?.focus({ preventScroll: true });
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
  pickedMembers = new Set();
  memberQuery = "";
  notifyClose(MODAL_ID);
}
