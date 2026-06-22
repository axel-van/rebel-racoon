// Connectors store — single source of truth for the connectors list.
//
// FIND-01 (resolved): the audit found that the settings surface and
// add-source-modal both imported `connectors` directly from mocks.js and
// mutated the array in place. It worked at runtime via the shared ES
// module reference, but there was no observer pattern and the moment any
// consumer did .slice() the sync would break silently. This module owns
// the array, exposes immutable snapshots, and notifies subscribers on
// every mutation so the two surfaces stay in sync.
//
// Public API:
//   getConnectors()                    → Connector[]   (snapshot)
//   findConnector(id)                  → Connector | null
//   setConnectorStatus(id, { ... })    mutates + notifies
//   subscribe(fn)                      → unsubscribe
//
// The internal array is seeded once from mocks.connectors. Re-imports of
// this module return the same store; a full page reload re-seeds.

import { connectors as seed } from "./mocks.js?v=45";
import { createNotifier } from "./store-utils.js?v=2";

const connectors = seed.map((c) => ({ ...c }));
const notifier = createNotifier("connectors-store");

export const subscribe = notifier.subscribe;
const notify = () => notifier.notify(getConnectors());

export function getConnectors() {
  return connectors.slice();
}

export function findConnector(id) {
  return connectors.find((c) => c.id === id) || null;
}

// Connected connectors only — the gallery's "Try in chat" and the session's
// live-source surface both list these as queryable live sources.
export function getConnectedConnectors() {
  return connectors.filter((c) => c.status === "connected").map((c) => ({ ...c }));
}

/**
 * Patch a connector's connection state.
 * @param {string} id
 * @param {object} patch — partial { status, account, lastSync }. Pass
 *   `null` for account/lastSync to clear them.
 * @returns {Connector | null}
 */
export function setConnectorStatus(id, patch) {
  const c = connectors.find((x) => x.id === id);
  if (!c) return null;
  if (patch.status !== undefined) c.status = patch.status;
  // null → clear the field; undefined → leave it; anything else → set.
  if (patch.account === null) delete c.account;
  else if (patch.account !== undefined) c.account = patch.account;
  if (patch.lastSync === null) delete c.lastSync;
  else if (patch.lastSync !== undefined) c.lastSync = patch.lastSync;
  notify();
  return c;
}
