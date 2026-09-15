// Connect-a-social-account dialog. The confirm step of connecting: it lists the
// brand's accounts that aren't connected yet and flips the ones you tick.
//
// Why a modal and not just a picker: connecting an account is an Agorapulse
// action, not an Archie one (CONCEPTS.md §6 — the account catalogue belongs to
// the platform). Archie asks for it inside the flow that needs it; the consent
// happens here.
//
// Public API:
//   init()                                  — inject markup + bind once on app boot
//   open({ network, preselected, onConfirm, onDismiss })
//       onConfirm(connectedAccounts: Account[]) — at least one connected
//       onDismiss()                            — closed without connecting
//
// Behaviour:
//   - Lists getConnectableAccounts(), scoped to `network` when given — the
//     step's grid picks the network, this dialog picks the account on it.
//     `preselected` ids start ticked.
//   - "Connect" is disabled until at least one account is ticked; it calls
//     connectAccounts(ids) then fires onConfirm with the accounts that flipped.
//   - Cancel / Esc / backdrop / close-X dismiss without connecting anything.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1188";
import { escapeHtml as esc } from "../utils.js?v=1188";
import {
  getConnectableAccounts,
  connectAccounts,
  NETWORK_ICON_BY_PLATFORM,
  NETWORK_LABEL,
  BRAND_INITIALS,
} from "../social-profiles.js?v=1188";

const MODAL_ID = "connect-account";

let backdrop, modal, listEl, titleEl, confirmBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnConfirm = null;
let pendingOnDismiss = null;

const HTML = `
<div class="app-modal-backdrop connect-account-modal__backdrop" id="connectAccountBackdrop" hidden></div>
<aside
  class="ap-dialog connect-account-modal"
  id="connectAccountModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="connectAccountTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="connectAccountTitle">Connect a social account</span>
  </div>
  <button class="ap-dialog-close" type="button" id="connectAccountClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="connect-account-modal__lead">
      Drafts are written for the network they publish on — that's what sets the format and the
      length.
    </p>
    <div class="connect-account-modal__list" id="connectAccountList" role="group" aria-label="Accounts to connect"></div>
    <div class="ap-infobox info connect-account-modal__note">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">Nothing publishes without your say-so — connecting only lets drafts be written and scheduled.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="connectAccountCancel">Cancel</button>
      <button type="button" class="ap-button primary blue" id="connectAccountConfirm" disabled>Connect</button>
    </div>
  </div>
</aside>`;

function renderList(preselected, network) {
  const accounts = getConnectableAccounts().filter((p) => !network || p.platform === network);
  if (!accounts.length) {
    listEl.innerHTML = `<p class="connect-account-modal__empty">Every account is already connected.</p>`;
    return;
  }
  const picked = new Set(preselected || []);
  // Row HTML is built from esc()'d values; assign directly (no escaping wrapper).
  listEl.innerHTML = accounts
    .map((p) => {
      const caption = [p.platformLabel, p.kind].filter(Boolean).join(" · ");
      const icon = NETWORK_ICON_BY_PLATFORM[p.platform] || "";
      return `
      <label class="ap-checkbox-container connect-account-modal__row">
        <input type="checkbox" value="${esc(p.id)}" data-connect-check ${picked.has(p.id) ? "checked" : ""} />
        <i></i>
        <span class="ap-avatar size-36" aria-hidden="true">
          ${p.photo ? `<img src="${esc(p.photo)}" alt="" />` : `<span class="ap-avatar-initials">${esc(p.initials || BRAND_INITIALS)}</span>`}
          ${icon ? `<span class="ap-avatar-network"><i class="${esc(icon)}"></i></span>` : ""}
        </span>
        <span class="connect-account-modal__meta">
          <span class="connect-account-modal__handle">${esc(p.handle || "Account")}</span>
          ${caption ? `<span class="connect-account-modal__caption">${esc(caption)}</span>` : ""}
        </span>
      </label>`;
    })
    .join("");
}

function selectedIds() {
  return Array.from(listEl.querySelectorAll("[data-connect-check]:checked")).map((el) => el.value);
}

function syncConfirm() {
  confirmBtn.disabled = selectedIds().length === 0;
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("connectAccountBackdrop");
  modal = document.getElementById("connectAccountModal");
  listEl = document.getElementById("connectAccountList");
  titleEl = document.getElementById("connectAccountTitle");
  confirmBtn = document.getElementById("connectAccountConfirm");
  cancelBtn = document.getElementById("connectAccountCancel");
  closeBtn = document.getElementById("connectAccountClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  confirmBtn.addEventListener("click", submit);
  listEl.addEventListener("change", (e) => {
    if (e.target.matches("[data-connect-check]")) syncConfirm();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  initialized = true;
}

function submit() {
  const ids = selectedIds();
  if (!ids.length) return;
  const fn = pendingOnConfirm;
  pendingOnConfirm = null;
  pendingOnDismiss = null;
  // Connect BEFORE closing so a subscriber repainting on close already sees them.
  const connected = connectAccounts(ids);
  close();
  if (typeof fn === "function") fn(connected);
}

export function init() {
  injectOnce();
}

export function open({ network = null, preselected = [], onConfirm = null, onDismiss = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  pendingOnConfirm = onConfirm;
  pendingOnDismiss = onDismiss;
  // Name the network the grid just picked, so the dialog reads as its step and
  // not as a second, unrelated question.
  titleEl.textContent = network
    ? `Connect your ${NETWORK_LABEL[network] || network} account`
    : "Connect a social account";
  renderList(preselected, network);
  syncConfirm();

  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  document.body.classList.remove("has-modal");
  // Still holding onConfirm means nothing was connected: this is a cancel, and
  // the caller has to put its step back (the card grid resolved on pick, so
  // there is nothing left on screen otherwise).
  const dismissed = pendingOnConfirm ? pendingOnDismiss : null;
  pendingOnConfirm = null;
  pendingOnDismiss = null;
  notifyClose(MODAL_ID);
  if (typeof dismissed === "function") dismissed();
}
