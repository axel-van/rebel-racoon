// Connectors — full-page gallery route /connectors.
//
// A Codex-style marketplace of integrations (Notion, Slite, Drive, GitHub, …).
// Once connected, a connector becomes a LIVE source: the assistant queries its
// content live over a (simulated) MCP round-trip instead of importing static
// docs. See connector-ask.js + assistant.js sendConnectorMessage.
//
// The gallery markup is shared with the connectors modal via connectors-view.js.
// Clicking a connector opens its DETAIL in that modal (components/
// connectors-modal.js) rather than an in-page view, so the same focused
// surface is reachable from chat contexts too.

import { html, raw } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=209";
import { showToast } from "../components/toast.js?v=20";
import { setHandoff } from "../handoff.js?v=20";
import { findConnector, setConnectorStatus, subscribe as subscribeConnectors } from "../connectors-store.js?v=28";
import { renderGalleryBody } from "../connectors-view.js?v=10";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=11";
import { isFlagOn } from "../feature-flags.js?v=10";

// Local view state (search + category filter).
let view = { query: "", category: "all" };

let unsubscribe = null;
let boundTarget = null;
let boundClick = null;
let boundInput = null;

export function renderConnectors(_params, target) {
  // Connectors are gated behind a feature flag (default OFF). When off, the
  // route is unreachable from the UI but a stale deep link bounces home.
  if (!isFlagOn("connectors")) {
    navigate("/");
    return;
  }
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Repaint when an external surface (modal / Settings) flips a connector's
  // state, so the gallery's badges stay live.
  unsubscribe = subscribeConnectors(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  if (boundTarget && boundInput) boundTarget.removeEventListener("input", boundInput);
  boundTarget = null;
  boundClick = null;
  boundInput = null;
}

function paint(target) {
  target.innerHTML = html`<section class="screen connectors-view">
    ${raw(renderGalleryBody(view, { showHero: true }))}
  </section>`;
}

function bind(target) {
  boundTarget = target;

  boundInput = (event) => {
    const search = event.target.closest("[data-connectors-search]");
    if (!search) return;
    view.query = search.value;
    paint(target);
    const next = target.querySelector("[data-connectors-search]");
    if (next) {
      next.focus();
      const len = next.value.length;
      try {
        next.setSelectionRange(len, len);
      } catch {
        /* some browsers reject setSelectionRange on type=search */
      }
    }
  };
  target.addEventListener("input", boundInput);

  boundClick = (event) => {
    const catChip = event.target.closest("[data-connectors-category]");
    if (catChip) {
      view.category = catChip.dataset.connectorsCategory;
      paint(target);
      return;
    }
    // Clicking a connector opens its detail in the connectors modal.
    const openBtn = event.target.closest("[data-connector-open]");
    if (openBtn) {
      openConnectorsModal({ connectorId: openBtn.dataset.connectorOpen });
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
  };
  target.addEventListener("click", boundClick);
}

function toggleConnector(id, connect) {
  const c = findConnector(id);
  if (!c) return;
  const previous = { status: c.status, account: c.account || null, lastSync: c.lastSync || null };
  const updated = connect
    ? setConnectorStatus(id, { status: "connected", account: "matt@archie.io", lastSync: "just now" })
    : setConnectorStatus(id, { status: "disconnected", account: null, lastSync: null });
  if (boundTarget) paint(boundTarget);
  showToast(`${updated.name} ${connect ? "connected" : "disconnected"}`, {
    action: {
      label: "Undo",
      onClick: () => {
        setConnectorStatus(id, previous);
        if (boundTarget) paint(boundTarget);
      },
    },
  });
}

// From the gallery page (not inside a chat) → hand off to a fresh chat that
// runs the ask-connector flow on mount (session.js consumes pendingAskConnector).
function startTryInChat(id) {
  setHandoff("pendingAskConnector", { connectorId: id });
  navigate(`/session/new-${Date.now().toString(36)}`);
}
