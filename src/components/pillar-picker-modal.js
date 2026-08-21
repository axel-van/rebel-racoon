// "Link to a Content pillar" — pick one, from a topic's card menu.
//
// A dialog rather than a submenu: the choice needs each pillar's own sentence to
// be answerable ("which of these is this topic actually about?"), and a nested
// `.ap-action-dropdown` can only carry a label and a caption at 40px a row. It
// is also opened from a menu that is itself inside a scrolling feed column —
// a flyout there would be clipped or would have to escape its own scroller.
//
// ── Scoped, and it must stay scoped ────────────────────────────────────────
// Only the ACTIVE Playbook's pillars are listed. A topic belongs to a feed,
// a feed belongs to a Playbook, and filing it under another brand's pillar would
// put a mark on a card that pillar could never have matched — the one invariant
// the seed data is built to hold.
//
// Public API:
//   init()
//   open({ briefId, onPicked? })

import { requestOpen, notifyClose } from "../modal-coordinator.js?v=21";
import { escapeAttr } from "../utils.js?v=21";
import { getPillarsForPlaybook, linkBrief } from "../pillars-store.js?v=16";
import { getActivePlaybookId, getActivePlaybook } from "../active-playbook.js?v=75";
import { navigate } from "../router.js?v=30";
import { showToast } from "./toast.js?v=21";

const MODAL_ID = "pillar-picker";

let backdrop, modal, listEl, subEl, cancelBtn, closeBtn;
let initialized = false;
let state = { briefId: null, onPicked: null };

const HTML = `
<div class="app-modal-backdrop pillar-picker__backdrop" id="pillarPickerBackdrop" hidden></div>
<aside
  class="ap-dialog pillar-picker"
  id="pillarPickerModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pillarPickerTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="pillarPickerTitle">Link to a Content pillar</span>
    <span class="ap-dialog-subtitle" id="pillarPickerSub"></span>
  </div>
  <button class="ap-dialog-close" type="button" id="pillarPickerClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content pillar-picker__content" id="pillarPickerList"></div>
  <div class="ap-dialog-footer">
    <div class="ap-dialog-footer-right">
      <button type="button" class="ap-button transparent grey" id="pillarPickerCancel">Cancel</button>
    </div>
  </div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("pillarPickerBackdrop");
  modal = document.getElementById("pillarPickerModal");
  listEl = document.getElementById("pillarPickerList");
  subEl = document.getElementById("pillarPickerSub");
  cancelBtn = document.getElementById("pillarPickerCancel");
  closeBtn = document.getElementById("pillarPickerClose");

  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  // Delegated, because the list is rebuilt on every open.
  listEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-pick-pillar]");
    if (row) {
      const pillarId = row.getAttribute("data-pick-pillar");
      const { briefId, onPicked } = state;
      close();
      const pillar = linkBrief(briefId, pillarId);
      // The toast carries the way THERE. Filing a topic is the moment you most
      // want to see what it landed in — the pillar's page shows the context it
      // just joined — and without this the only route is the section, then the
      // card, then the page.
      if (pillar) {
        showToast(`Linked to “${pillar.name}”`, {
          action: { label: "See Content pillar", onClick: () => navigate(`/pillar/${encodeURIComponent(pillar.id)}`) },
        });
      }
      if (typeof onPicked === "function") onPicked(pillar);
      return;
    }
    if (event.target.closest("[data-pick-new]")) {
      close();
      navigate("/content-strategy");
    }
  });

  initialized = true;
}

function paint() {
  const pillars = getPillarsForPlaybook(getActivePlaybookId());
  if (!pillars.length) {
    // Nothing to pick. The way out is to make one — and it goes to the section
    // rather than opening the create dialog on top of this one, because a modal
    // over a modal is the pattern this app refuses everywhere else.
    listEl.innerHTML = `
      <div class="pillar-picker__empty">
        <span class="pillar-picker__empty-mark"><i class="ap-icon-stack"></i></span>
        <p>This Playbook has no pillars yet. Make one and I'll start filing matching topics into it.</p>
        <button type="button" class="ap-button stroked blue" data-pick-new>
          <i class="ap-icon-plus"></i><span>Go to Content strategy</span>
        </button>
      </div>`;
    return;
  }
  listEl.innerHTML = pillars
    .map(
      (p) => `
      <button type="button" class="pillar-picker__row" data-pick-pillar="${escapeAttr(p.id)}">
        <span class="pillar-picker__row-mark"><i class="ap-icon-stack" aria-hidden="true"></i></span>
        <span class="pillar-picker__row-text">
          <span class="pillar-picker__row-name">${escapeAttr(p.name)}</span>
          <span class="pillar-picker__row-about">${escapeAttr(p.about || p.context || "")}</span>
        </span>
        <span class="pillar-picker__row-meta">${p.sources.length} ${p.sources.length === 1 ? "source" : "sources"}</span>
      </button>`,
    )
    .join("");
}

export function init() {
  injectOnce();
}

export function open({ briefId, onPicked = null } = {}) {
  injectOnce();
  requestOpen(MODAL_ID, close);
  state = { briefId, onPicked };

  const pb = getActivePlaybook();
  subEl.textContent = pb ? `Pillars in ${pb.name}` : "";
  paint();

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
  state.onPicked = null;
  notifyClose(MODAL_ID);
}
