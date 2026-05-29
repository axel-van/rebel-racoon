// Chat picker modal — shown when the user clicks "Draft Post" on an idea
// from the dashboard (no active session). Asks where the draft should land:
// a fresh chat or an existing one.
//
// Same init/open/close pattern as the other modals (feedback, bug-report).
// The body reuses renderPicker from _analyse-common.js so the visual
// language matches the inline-question pattern (numbered rows, 1-9 / ↑↓ /
// Enter / Esc keyboard nav).
//
// Usage:
//   openChatPickerModal({
//     onPick({ kind: "new" } | { kind: "existing", session })
//   });

import { recentSessions } from "../mocks.js?v=36";
import { getSources } from "../sources-stream.js?v=32";
import { getIdeas } from "../library.js?v=29";
import { getPosts } from "../posts-store.js?v=27";
import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";

const MODAL_ID = "chatPicker";
import { renderPicker, bindWizardKeyboard, unbindWizardKeyboard } from "../screens/_analyse-common.js?v=33";

let backdrop, modal, body;
let initialized = false;
let pendingPick = null;

const HTML = `
<div class="app-modal-backdrop chat-picker-modal__backdrop" id="chatPickerBackdrop" hidden></div>
<aside
  class="ap-dialog chat-picker-modal"
  id="chatPickerModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="chatPickerTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header">
    <span class="ap-dialog-title" id="chatPickerTitle">Where should this draft go?</span>
    <span class="ap-dialog-subtitle">Drafts live inside chats. Pick one, or start fresh.</span>
  </div>
  <button class="ap-dialog-close" type="button" id="chatPickerClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content chat-picker-modal__body" id="chatPickerBody"></div>
</aside>
`;

function buildItems() {
  const newItem = {
    value: "new",
    label: "Start a new chat",
    caption: "Empty chat — start fresh",
    icon: "ap-icon-plus",
  };
  const existing = recentSessions.map((s) => {
    // Counts derive from the live stores — the conversation-level counters
    // shown elsewhere (topbar pill, status card, content workspace tabs)
    // read the same source of truth, so the picker stays in sync as users
    // add sources / ideas / drafts in either chat.
    const sources = getSources(s.id).length;
    const ideas = getIdeas(s.id).length;
    const drafts = getPosts(s.id).length;
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    return {
      value: s.id,
      label: s.name,
      caption: `${plural(sources, "source")} · ${plural(ideas, "idea")} · ${plural(drafts, "draft")} · ${s.lastActivity}`,
      icon: "ap-icon-single-chat-bubble",
    };
  });
  return [newItem, ...existing];
}

function renderBody() {
  body.innerHTML = renderPicker({
    items: buildItems(),
    handler: "chat-picker",
  });
}

function bindKeyboard() {
  bindWizardKeyboard(modal, {
    handler: "chat-picker",
    onExit: () => {
      close();
    },
  });
}

export function open(opts = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  pendingPick = typeof opts.onPick === "function" ? opts.onPick : null;
  renderBody();
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  bindKeyboard();
}

function close() {
  if (!initialized) return;
  unbindWizardKeyboard();
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  pendingPick = null;
  notifyClose(MODAL_ID);
}

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("chatPickerBackdrop");
  modal = document.getElementById("chatPickerModal");
  body = document.getElementById("chatPickerBody");

  modal.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-chat-picker]");
    if (pick) {
      const value = pick.dataset.chatPicker;
      const cb = pendingPick;
      close();
      if (!cb) return;
      if (value === "new") cb({ kind: "new" });
      else {
        const session = recentSessions.find((s) => s.id === value);
        if (session) cb({ kind: "existing", session });
      }
      return;
    }
    if (event.target.closest("#chatPickerClose")) close();
  });

  bindOverlayDismissal({ modal, backdrop, close });
}
