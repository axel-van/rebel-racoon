// Analyze-social-profiles dialog. Lets the user pick one or more connected
// social profiles to (re-)fill a Playbook's sections from their posts. Same
// init/open/close pattern as rename-modal / confirm-modal.
//
// Public API:
//   init()                       — inject markup + bind once on app boot
//   open({ onConfirm })          — onConfirm(selectedProfileIds: string[])
//
// Behaviour:
//   - Lists getConnectedProfiles() as a checkable list; profiles with no
//     posts are disabled (nothing to learn from).
//   - "Analyze & fill" is disabled until at least one profile is selected;
//     it fires onConfirm(ids) then closes. A warning notes the overwrite.
//   - Cancel / Esc / backdrop / close-X dismiss without firing.

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { escapeHtml as esc } from "../utils.js?v=21";
import { getConnectedProfiles, NETWORK_ICON_BY_PLATFORM, BRAND_INITIALS } from "../social-profiles.js?v=21";

const MODAL_ID = "analyze-profiles";

let backdrop, modal, listEl, confirmBtn, cancelBtn, closeBtn;
let initialized = false;
let pendingOnConfirm = null;

const HTML = `
<div class="app-modal-backdrop analyze-profiles-modal__backdrop" id="analyzeProfilesBackdrop" hidden></div>
<aside
  class="ap-dialog analyze-profiles-modal"
  id="analyzeProfilesModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="analyzeProfilesTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="analyzeProfilesTitle">Analyze social profiles</span>
  </div>
  <button class="ap-dialog-close" type="button" id="analyzeProfilesClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content">
    <p class="analyze-profiles-modal__lead">
      Pick the profiles to learn from — Archie reads their recent posts and rebuilds your Voice &amp; style.
    </p>
    <div class="analyze-profiles-modal__list" id="analyzeProfilesList" role="group" aria-label="Connected profiles"></div>
    <div class="ap-infobox warning analyze-profiles-modal__warn">
      <i class="ap-icon-info_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">This replaces your Voice &amp; style section.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="analyzeProfilesCancel">Cancel</button>
      <button type="button" class="ap-button primary orange" id="analyzeProfilesConfirm" disabled>
        <i class="ap-icon-sparkles-mermaid"></i><span>Analyze &amp; fill</span>
      </button>
    </div>
  </div>
</aside>`;

function renderList() {
  const profiles = getConnectedProfiles();
  if (!profiles.length) {
    listEl.innerHTML = `<p class="analyze-profiles-modal__empty">No connected profiles. Connect a social account first.</p>`;
    return;
  }
  // Row HTML is built from esc()'d values; assign directly (no escaping wrapper).
  listEl.innerHTML = profiles
    .map((p) => {
      const noPosts = p.postCount === 0;
      const caption = [p.platformLabel, p.kind].filter(Boolean).join(" · ");
      const icon = NETWORK_ICON_BY_PLATFORM[p.platform] || "";
      return `
      <label class="ap-checkbox-container analyze-profiles-modal__row ${noPosts ? "is-disabled" : ""}">
        <input type="checkbox" value="${esc(p.id)}" data-profile-check ${noPosts ? "disabled" : ""} />
        <i></i>
        <span class="ap-avatar size-36" aria-hidden="true">
          ${p.photo ? `<img src="${esc(p.photo)}" alt="" />` : `<span class="ap-avatar-initials">${esc(BRAND_INITIALS)}</span>`}
          ${icon ? `<span class="ap-avatar-network"><i class="${esc(icon)}"></i></span>` : ""}
        </span>
        <span class="analyze-profiles-modal__meta">
          <span class="analyze-profiles-modal__handle">${esc(p.handle || "Profile")}</span>
          ${caption ? `<span class="analyze-profiles-modal__caption">${esc(caption)}</span>` : ""}
        </span>
        ${noPosts ? `<span class="analyze-profiles-modal__note">No posts to analyze</span>` : ""}
      </label>`;
    })
    .join("");
}

function selectedIds() {
  return Array.from(listEl.querySelectorAll("[data-profile-check]:checked")).map((el) => el.value);
}

function syncConfirm() {
  confirmBtn.disabled = selectedIds().length === 0;
}

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("analyzeProfilesBackdrop");
  modal = document.getElementById("analyzeProfilesModal");
  listEl = document.getElementById("analyzeProfilesList");
  confirmBtn = document.getElementById("analyzeProfilesConfirm");
  cancelBtn = document.getElementById("analyzeProfilesCancel");
  closeBtn = document.getElementById("analyzeProfilesClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  confirmBtn.addEventListener("click", submit);
  listEl.addEventListener("change", (e) => {
    if (e.target.matches("[data-profile-check]")) syncConfirm();
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
  close();
  if (typeof fn === "function") fn(ids);
}

export function init() {
  injectOnce();
}

export function open({ onConfirm = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);

  pendingOnConfirm = onConfirm;
  renderList();
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
  pendingOnConfirm = null;
  notifyClose(MODAL_ID);
}
