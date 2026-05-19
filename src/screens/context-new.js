// Conversational shell for /contexts/new — a thin screen that hosts the
// inline-question phase of the context-builder. It renders:
//   • The assistant chat thread on the left (built from postAssistantMessage
//     turns + the user's typed/picked answers)
//   • The sticky picker bar at the bottom (driven by inline-question's
//     current state)
// The right-panel takes over once the form phase opens — this screen still
// stays mounted so the user can see the full conversation.

import { html, raw } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=40";
import { navigate } from "../router.js?v=21";
import { bindWizardKeyboard, unbindWizardKeyboard, renderPicker, chatTurn } from "./_analyse-common.js?v=25";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=27";
import * as inlineQuestion from "../inline-question.js?v=21";
import * as contextBuilder from "../context-builder.js?v=23";
import { showToast } from "../components/toast.js?v=20";

// Per-mount cleanup — abort previous subscriptions + the previous click
// listener before wiring fresh ones for a new sessionId.
let abortController = null;
let unsubscribers = [];
let activeSessionId = null;

function teardown() {
  for (const off of unsubscribers) {
    try {
      off();
    } catch (err) {
      console.warn("[context-new] unsubscribe threw", err);
    }
  }
  unsubscribers = [];
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (activeSessionId) {
    contextBuilder.cancel(activeSessionId);
    activeSessionId = null;
  }
  unbindWizardKeyboard();
}

export function renderContextNew(_params, target) {
  renderTopbar();
  teardown();

  // One-shot id per visit — keeps state isolated across reloads / re-entries
  // since the flow is dissociated from chat sessions.
  const sessionId = `context-builder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  activeSessionId = sessionId;
  abortController = new AbortController();

  bindClickDelegation(target, sessionId, abortController.signal);

  const repaint = () => {
    if (activeSessionId !== sessionId) return; // navigated away mid-flight
    paint(target, sessionId);
  };
  unsubscribers.push(subscribeThread(sessionId, repaint));
  unsubscribers.push(inlineQuestion.subscribe(sessionId, repaint));
  unsubscribers.push(contextBuilder.subscribe(sessionId, repaint));

  contextBuilder.start(sessionId, {
    onComplete: (created) => {
      activeSessionId = null; // teardown skips the cancel call
      showToast(`Saved “${created.name}”`);
      navigate("/contexts");
    },
  });

  paint(target, sessionId);
}

function paint(target, sessionId) {
  const thread = getThread(sessionId, { hasContext: false, skipGreeting: true });
  const threadHtml = thread
    .filter((m) => m.text && (m.role === "assistant" || m.role === "user"))
    .map((m) => chatTurn({ role: m.role === "assistant" ? "ai" : "user", text: m.text }))
    .join("");
  const chrome = inlineQuestion.renderChrome(sessionId);
  const pickerHtml = chrome?.picker ? renderPicker(chrome.picker) : "";

  target.innerHTML = html`
    <section class="screen analyse analyse--wizard context-new">
      <div class="analyse__chat" id="contextNewChat">
        <div class="analyse__chat-inner">${raw(threadHtml)}</div>
      </div>
      <div class="analyse__sticky-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(pickerHtml)}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </section>
  `;

  if (inlineQuestion.isActive(sessionId)) {
    bindWizardKeyboard(target, {
      handler: "inline-question",
      onExit: () => {
        contextBuilder.cancel(sessionId);
        activeSessionId = null;
        navigate("/contexts");
      },
      onCustomSubmit: (value) => {
        inlineQuestion.submitCustom(sessionId, value);
      },
      onMultiSubmit: (selectedValues) => {
        inlineQuestion.submitMulti(sessionId, selectedValues);
      },
    });
  } else {
    unbindWizardKeyboard();
  }

  const chat = target.querySelector("#contextNewChat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

// Bound once per renderContextNew via AbortController — survives the
// innerHTML rewrites done in paint() because the listener is on the target
// element itself, not the picker rows.
function bindClickDelegation(target, sessionId, signal) {
  target.addEventListener(
    "click",
    (event) => {
      const pickBtn = event.target.closest("[data-inline-question]");
      if (pickBtn) {
        event.preventDefault();
        const opts = pickBtn.closest(".analyse__options");
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = pickBtn.classList.contains("is-selected");
          pickBtn.classList.toggle("is-selected", !wasSelected);
          pickBtn.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
        } else {
          inlineQuestion.pick(sessionId, pickBtn.dataset.inlineQuestion);
        }
        return;
      }
      const submitBtn = event.target.closest("[data-inline-question-submit]");
      if (submitBtn) {
        event.preventDefault();
        const opts = submitBtn.closest(".analyse__options");
        const selected = opts
          ? Array.from(opts.querySelectorAll("[data-inline-question].is-selected")).map(
              (el) => el.dataset.inlineQuestion,
            )
          : [];
        if (selected.length) inlineQuestion.submitMulti(sessionId, selected);
        return;
      }
      if (event.target.closest("[data-inline-question-skip]")) {
        event.preventDefault();
        inlineQuestion.skip(sessionId);
        return;
      }
      const customSubmit = event.target.closest("[data-inline-question-custom-submit]");
      if (customSubmit) {
        event.preventDefault();
        const input = customSubmit.closest(".analyse__options")?.querySelector("[data-inline-question-custom]");
        const value = input?.value?.trim();
        if (value) inlineQuestion.submitCustom(sessionId, value);
        return;
      }
    },
    { signal },
  );
}
