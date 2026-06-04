// Launches the in-chat "Ask a connector" inline question.
//
// A CONNECTED connector behaves as a live source — there's nothing to
// pre-import; the user just asks and I query it live (simulated MCP). This
// module posts the intro turn + a picker of per-connector suggested prompts,
// then routes the chosen prompt to sendConnectorMessage, which runs the
// simulated MCP round-trip and answers with cited content.
//
// Shared by two entry points so the choreography lives in one place:
//   • the Connectors gallery's "Try in chat" (via the pendingAskConnector
//     handoff consumed at session mount, in session.js)
//   • the right-panel Sources surface's per-connector "Ask" button
//
// Version pins MUST match session.js's so the inline-question + assistant
// module instances are shared (ES modules are keyed by URL).
import * as inlineQuestion from "./inline-question.js?v=33";
import { postAssistantMessage, sendConnectorMessage } from "./assistant.js?v=40";
import { findConnector } from "./connectors-store.js?v=23";
import { connectorDocs } from "./mocks.js?v=38";

export function askConnector(sessionId, connectorId) {
  const connector = findConnector(connectorId);
  if (!connector) return;
  const pool = connectorDocs[connectorId] || [];

  // Tailor the first suggestion to the connector's actual content so the
  // picker feels grounded, then offer two generic post-oriented prompts.
  const items = [];
  if (pool[0]) {
    items.push({
      value: `Summarize ${pool[0].title}.`,
      label: `Summarize "${pool[0].title}"`,
      icon: "ap-icon-numbered-list",
    });
  }
  items.push({
    value: `What's the most post-worthy insight in ${connector.name} right now?`,
    label: "Find a post-worthy insight",
    icon: "ap-icon-sparkles",
  });
  items.push({
    value: `Find a contrarian angle worth posting from ${connector.name}.`,
    label: "Find a contrarian angle",
    icon: "ap-icon-bolden",
  });

  postAssistantMessage(
    sessionId,
    `${connector.name} is connected as a live source. What would you like me to find in it?`,
  );
  inlineQuestion.ask(sessionId, {
    title: connector.name,
    stepLabel: "Connector",
    items,
    customPlaceholder: `Ask ${connector.name} anything…`,
    onPick: (text) => sendConnectorMessage(sessionId, connectorId, text),
    onCustom: (text) => sendConnectorMessage(sessionId, connectorId, text),
    onSkip: () => {},
  });
}
