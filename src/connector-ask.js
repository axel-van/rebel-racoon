// Launches the in-chat "Ask a connector" interaction.
//
// A CONNECTED connector behaves as a live source — there's nothing to
// pre-import; the user just asks and I query it live (simulated MCP).
//
// Rather than open a quick-picker of suggested prompts, asking a connector now
// attaches it to the composer as a chip: the next message the user types is
// routed to sendConnectorMessage() (in session.js's submit handler). This keeps
// the interaction in the composer — the user writes their own question with the
// connector context already in place. session.js owns rendering the chip,
// swapping the placeholder, and focusing the input.
//
// Shared by three entry points so the choreography lives in one place:
//   • the Connectors gallery's "Try in chat" (via the pendingAskConnector
//     handoff consumed at session mount, in session.js)
//   • the connectors modal's "Try in chat"
//   • the right-panel Sources surface's per-connector "Ask" button
//
// Version pins MUST match session.js's so the composer-connector + connectors
// store module instances are shared (ES modules are keyed by URL).
import { setActiveConnector } from "./composer-connector.js?v=2";
import { findConnector } from "./connectors-store.js?v=63";

export function askConnector(sessionId, connectorId) {
  const connector = findConnector(connectorId);
  if (!connector) return;
  // Attach the connector to the composer. The chip render + focus happens in
  // session.js via the composer-connector subscription.
  setActiveConnector(sessionId, connectorId);
}
