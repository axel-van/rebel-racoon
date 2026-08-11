// Connectors modal — the gallery + per-connector detail as an overlay.
//
// Same surface as the /connectors page (shares connectors-view.js render
// helpers), but reachable from chat contexts so you can connect a source
// without navigating away:
//   • composer "Add" menu  → open({ currentSessionId })           [gallery]
//   • Sources panel        → open({ currentSessionId })           [gallery]
//   • gallery page card     → open({ connectorId })               [detail]
//
// Two views in one modal: gallery (browse + connect) and detail (one
// connector). Clicking a connector in gallery view switches to detail view in
// place; a back control returns to the gallery.
//
// Standard modal lifecycle via modal-coordinator (one overlay at a time, focus
// restore, Esc / backdrop dismissal) — mirrors add-source-modal.js.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { navigate } from "../router.js?v=30";
import { showToast } from "./toast.js?v=21";
import { setHandoff } from "../handoff.js?v=20";
import { findConnector, setConnectorStatus, subscribe as subscribeConnectors } from "../connectors-store.js?v=51";
import { renderGalleryBody, renderDetailBody } from "../connectors-view.js?v=33";
import { askConnector } from "../connector-ask.js?v=31";

const MODAL_ID = "connectors";

let backdrop, modal, headerEl, contentEl;
let initialized = false;
let unsubscribe = null;

// Module-local view state. `connectorId` set → detail view, else gallery.
// `currentSessionId` lets Try-in-chat target the chat the modal was opened
// from (null when opened from the gallery page → spawns a fresh chat).
let view = { query: "", category: "all", connectorId: null, currentSessionId: null };

const HTML = `
<div class="app-modal-backdrop connectors-modal__backdrop" id="connectorsModalBackdrop" hidden></div>
<aside
  class="ap-dialog connectors-modal"
  id="connectorsModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="connectorsModalTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header connectors-modal__header" id="connectorsModalHeader"></div>
  <button class="ap-dialog-close" type="button" id="connectorsModalClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content connectors-modal__content" id="connectorsModalContent"></div>
</aside>
`;

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("connectorsModalBackdrop");
  modal = document.getElementById("connectorsModal");
  headerEl = document.getElementById("connectorsModalHeader");
  contentEl = document.getElementById("connectorsModalContent");

  modal.addEventListener("click", onClick);
  modal.addEventListener("input", onInput);
  bindOverlayDismissal({ modal, backdrop, close });
}

export function open({ connectorId = null, currentSessionId = null } = {}) {
  if (!initialized) init();
  requestOpen(MODAL_ID, close);
  view = { query: "", category: "all", connectorId, currentSessionId };
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  // Keep badges live if a connector is toggled elsewhere while open.
  if (!unsubscribe) unsubscribe = subscribeConnectors(() => render());
  render();
}

function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  notifyClose(MODAL_ID);
}

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  if (view.connectorId) {
    const c = findConnector(view.connectorId);
    if (!c) {
      view.connectorId = null;
      return render();
    }
    // Detail view supplies its own header (logo + name + actions), so the
    // modal title would be redundant — leave the bar empty (it just reserves
    // the row for the floating close button).
    headerEl.innerHTML = "";
    contentEl.innerHTML = renderDetailBody(c);
  } else {
    headerEl.innerHTML = `<span class="ap-dialog-title" id="connectorsModalTitle">Connectors</span>`;
    contentEl.innerHTML = renderGalleryBody(view, { showHero: false });
  }
}

// ─── Events ────────────────────────────────────────────────────────────────

function onInput(event) {
  const search = event.target.closest("[data-connectors-search]");
  if (!search) return;
  view.query = search.value;
  render();
  // Restore focus + caret after the re-render swaps the input node.
  const next = contentEl.querySelector("[data-connectors-search]");
  if (next) {
    next.focus();
    const len = next.value.length;
    try {
      next.setSelectionRange(len, len);
    } catch {
      /* some browsers reject setSelectionRange on type=search */
    }
  }
}

function onClick(event) {
  if (event.target.closest("#connectorsModalClose") || event.target.closest("[data-modal-close]")) {
    close();
    return;
  }
  // Category filter.
  const catChip = event.target.closest("[data-connectors-category]");
  if (catChip) {
    view.category = catChip.dataset.connectorsCategory;
    render();
    return;
  }
  // Open a connector's detail in place.
  const openBtn = event.target.closest("[data-connector-open]");
  if (openBtn) {
    view.connectorId = openBtn.dataset.connectorOpen;
    render();
    return;
  }
  const connectBtn = event.target.closest("[data-connector-connect]");
  if (connectBtn) {
    toggleConnector(connectBtn.dataset.connectorConnect, true);
    return;
  }
  const disconnectBtn = event.target.closest("[data-connector-disconnect]");
  if (disconnectBtn) {
    toggleConnector(disconnectBtn.dataset.connectorDisconnect, false);
    return;
  }
  const tryBtn = event.target.closest("[data-connector-try]");
  if (tryBtn) {
    startTryInChat(tryBtn.dataset.connectorTry);
    return;
  }
}

function toggleConnector(id, connect) {
  const c = findConnector(id);
  if (!c) return;
  const previous = { status: c.status, account: c.account || null, lastSync: c.lastSync || null };
  const updated = connect
    ? setConnectorStatus(id, { status: "connected", account: "matt@archie.io", lastSync: "just now" })
    : setConnectorStatus(id, { status: "disconnected", account: null, lastSync: null });
  render();
  showToast(`${updated.name} ${connect ? "connected" : "disconnected"}`, {
    action: {
      label: "Undo",
      onClick: () => {
        setConnectorStatus(id, previous);
        render();
      },
    },
  });
}

// Try-in-chat: close the modal, then ask the connector in the current chat if
// we were opened from one; otherwise hand off to a fresh chat (session.js
// consumes pendingAskConnector on mount).
function startTryInChat(id) {
  const sid = view.currentSessionId;
  close();
  if (sid) {
    askConnector(sid, id);
  } else {
    setHandoff("pendingAskConnector", { connectorId: id });
    navigate(`/session/new-${Date.now().toString(36)}`);
  }
}
