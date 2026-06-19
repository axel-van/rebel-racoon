// Per-session "active connector" attached to the composer.
//
// When the user "asks" a CONNECTED connector (from the Connectors gallery's
// "Try in chat", the connectors modal, or the right-panel Sources surface) we
// no longer open a picker — we attach the connector to the composer as a chip.
// The next message the user types is routed to sendConnectorMessage() (the
// simulated MCP round-trip) instead of the normal assistant sendMessage(). The
// chip is removable, and it clears automatically once a connector message is
// sent.
//
// Mirrors composer-mentions.js: a Map<sessionId, connectorId> + a Set of
// subscribers notified on change. session.js owns the DOM (chip + placeholder
// + focus) and subscribes here; connector-ask.js sets the active connector.
//
// Public API:
//   getActiveConnector(sessionId)   → connectorId | null
//   setActiveConnector(sessionId, connectorId)
//   clearActiveConnector(sessionId)
//   subscribe(sessionId, fn)        → unsubscribe

import { createSessionNotifier } from "./store-utils.js?v=2";

const bySession = new Map(); // sessionId → connectorId
const notifier = createSessionNotifier("composer-connector");

export function getActiveConnector(sessionId) {
  return bySession.get(sessionId) || null;
}

export function setActiveConnector(sessionId, connectorId) {
  if (!sessionId || !connectorId) return;
  bySession.set(sessionId, connectorId);
  notify(sessionId);
}

export function clearActiveConnector(sessionId) {
  if (!bySession.has(sessionId)) return;
  bySession.delete(sessionId);
  notify(sessionId);
}

export const subscribe = notifier.subscribe;

function notify(sessionId) {
  notifier.notify(sessionId, getActiveConnector(sessionId));
}
