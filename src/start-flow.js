// Conversational onboarding flow that plays inside the assistant sidebar
// when the user opens a chat that already has a context attached.
//
//   startActionPickerFlow(sessionId, { contextName })
//     Asks "what do you want to do?" with one chip per quick action.
//     Dispatched from session.js when a pendingStartFlow handoff is set by
//     the dashboard's New chat handler with hasContext: true.
//
// The legacy create-context-on-new-chat flow was removed — context creation
// runs inline in the current session via contextBuilder.start(), launched
// from any "+ New context" entry point (composer picker, AI inline
// question chip, /contexts page via a spawn-session handoff).

import { postAssistantMessage, postUserTurn, postAssistantChoice } from "./assistant.js?v=67";

// ---- Action picker -----------------------------------------------------

export function startActionPickerFlow(sessionId, { contextName = "Your playbook" } = {}) {
  postAssistantMessage(sessionId, `Welcome back. ${contextName} is attached — what do you want to do?`);
  postAssistantChoice(sessionId, {
    text: "",
    choices: [
      { value: "add-source", label: "Add a source", icon: "ap-icon-plus" },
      { value: "browse", label: "Browse sources", icon: "ap-icon-feature-library" },
      { value: "compare", label: "Compare ideas", icon: "ap-icon-sparkles" },
      { value: "draft", label: "Draft a post", icon: "ap-icon-archie-official" },
    ],
    multi: false,
    handler: "start-action",
    context: {},
    submitLabel: "Continue",
  });
}

// ---- Step router (called from session.js choice-submit dispatcher) ------

export function handleActionPick(sessionId, message, selectedValues, { setQuery }) {
  const value = selectedValues[0];
  const label =
    {
      "add-source": "Add a source",
      browse: "Browse sources",
      compare: "Compare ideas",
      draft: "Draft a post",
    }[value] || value;
  postUserTurn(sessionId, label);

  switch (value) {
    case "add-source": {
      // Open the existing assistant attach menu — no tab change needed.
      const toggle = document.querySelector("[data-assistant-attach-toggle]");
      const menu = document.querySelector("[data-assistant-attach-menu]");
      if (toggle && menu) {
        toggle.setAttribute("aria-expanded", "true");
        menu.hidden = false;
      }
      postAssistantMessage(sessionId, "Pick a source type from the attach menu — PDF, video, or URL.");
      return;
    }
    case "browse": {
      setQuery({ tab: "content", view: "sources" });
      postAssistantMessage(sessionId, "Here's everything you've attached. Open the Sources panel to dig in.");
      return;
    }
    case "compare": {
      setQuery({ tab: "content", view: "ideas" });
      postAssistantMessage(sessionId, "Here are your ideas. Pick two and I'll compare them.");
      return;
    }
    case "draft": {
      setQuery({ tab: "content", view: "ideas" });
      postAssistantMessage(
        sessionId,
        "Open the Ideas panel and hit Draft post on the one you want — I'll generate the post.",
      );
      return;
    }
  }
}
