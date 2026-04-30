import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=34";
import { getSessionById, socialAccounts, recentSessions, chatStarters } from "../mocks.js?v=25";
import { getContextById, getContexts, updateContext } from "../contexts-store.js?v=24";
import { isNewUser } from "../user-mode.js?v=20";
import { getThread, sendMessage, postAssistantMessage, subscribe, submitAssistantChoice } from "../assistant.js?v=23";
import { getSources, getIdeas, subscribe as subscribeLibrary } from "../library.js?v=23";
import { wireLibraryActions, renderSourcesBulkBar, renderIdeasBulkBar } from "../library-actions.js?v=20";
import { getPosts, attachImageToDraft, subscribe as subscribePostsStore } from "../posts-store.js?v=23";
import { startDraftFlow, executeDraft } from "../draft-flow.js?v=20";
import { startActionPickerFlow, handleActionPick } from "../start-flow.js?v=24";
import * as sidebarWizard from "../sidebar-wizard.js?v=31";
import * as inlineQuestion from "../inline-question.js?v=21";
import { renderPicker, bindWizardKeyboard, unbindWizardKeyboard } from "./_analyse-common.js?v=24";
import { renderSourceCard } from "../components/source-card.js?v=26";
import { renderIdeaCard } from "../components/idea-card.js?v=25";
import {
  contentState,
  renderContentWorkspace as renderSharedContentWorkspace,
  rerenderContentWorkspaceBody,
  renderContentEmptyState,
} from "../components/content-workspace.js?v=23";
import { open as openGenerateImageModal } from "../components/generate-image-modal.js?v=20";
import { open as openSettingsDrawer } from "../components/settings-drawer.js?v=22";
import { open as openChatPickerModal } from "../components/chat-picker-modal.js?v=21";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=21";
import {
  classifyFile,
  startFileUpload,
  cancelUpload,
  removeSources,
  getSources as getStreamSources,
  getUploads as getStreamUploads,
  subscribeSources,
  subscribeUploads,
  pushScriptedSource,
  completeScriptedSource,
} from "../sources-stream.js?v=25";
import { showToast } from "../components/toast.js?v=20";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  getActiveBatchRef as getActiveDraftsBatchRef,
  getMode as getRightPanelMode,
  subscribe as subscribeRightPanel,
} from "../components/right-panel.js?v=40";
import { setHandoff, consumeHandoff, hasHandoff } from "../handoff.js?v=20";
import { parseHashParams, setHashQuery } from "../url-state.js?v=20";

// Session screen — persistent assistant panel on the left, workspace with
// tabs on the right.
//
// URL:   #/session/:id?tab=posts|library|ideas|context
//
// For a real session id (e.g. s-acme-launch) in returning-user mode, the
// tabs render populated views; otherwise they render empty states.

function readQuery() {
  const params = parseHashParams();
  // Posts tab dropped at Lot 4.4 (Q4). Legacy `?tab=posts` URLs land on
  // Content + auto-open the right panel Drafts in renderSession below.
  const rawTab = params.get("tab");
  const tab = !rawTab || rawTab === "posts" ? "content" : rawTab;
  return {
    tab,
    populated: params.get("populated") === "1" || params.get("populated") === "true",
    title: params.get("title") || "",
    contextId: params.get("contextId") || "",
    postsFilter: params.get("postsFilter") || "all",
    postsNetwork: params.get("postsNetwork") || "all",
    focusIdea: params.get("focusIdea") || "",
    focusPost: params.get("focusPost") || "",
    focusSource: params.get("focusSource") || "",
    view: params.get("view") || "sources",
  };
}

// Search query + sort live in the shared content-workspace module — same
// state in the dashboard's start screen and the in-session Content tab.

function setQuery(next) {
  const merged = { ...readQuery(), ...next };
  Object.keys(merged).forEach((key) => {
    if (merged[key] == null || merged[key] === "" || merged[key] === false) delete merged[key];
  });
  setHashQuery(`/session/${getActiveSessionIdFromHash()}`, merged);
}

function getActiveSessionIdFromHash() {
  const m = /^#\/session\/([^/?]+)/.exec(window.location.hash);
  return m ? m[1] : "new";
}

// Library selection — module-local Sets, mutated in place by
// library-actions.js. One Set per kind (sources / ideas) so the matching
// bulk bar shows up only when its view is active. Cleared whenever the
// user navigates to a different session id; persists across tab + view
// switches within the same session.
const sourceSelection = new Set();
const ideaSelection = new Set();
let previousSessionId = null;
function clearSelection() {
  sourceSelection.clear();
  ideaSelection.clear();
}

// Unsubscribe fn for the assistant thread + library subscriptions.
let currentUnsubscribe = null;

// Controller used to abort the click/keydown listeners that bindSession
// attaches to the stable #app element. Each renderSession call aborts the
// previous batch and hands bindSession a fresh controller — otherwise tab
// switches stack listeners and `[data-add-source]` fires N times per click.
let currentListenerController = null;

export function renderSession(params, target) {
  const mockedSession = getSessionById(params.id);
  const isRealSession = !!mockedSession && !isNewUser();
  const q = readQuery();

  const session = mockedSession || {
    id: params.id,
    name: q.title || (params.id === "new" ? "Untitled session" : "Session"),
    contextId: q.contextId || null,
  };
  // Reset selection when switching to a different chat. Tab + URL-param
  // changes within the same session keep the selection intact.
  if (previousSessionId !== session.id) {
    clearSelection();
    previousSessionId = session.id;
  }
  renderTopbar({ crumb: session.name });

  // Resolution priority — URL state wins over the mock seed so wizard-
  // driven changes (save as new global) take effect immediately without
  // needing to mutate the mock object. Every chat references a single
  // global context (the local-context concept was removed):
  //  1. URL contextId       → getContextById (wizard "save as global", or
  //                                            initial nav with explicit param)
  //  2. session.contextId   → mock seed (initial state for s-acme-launch etc.)
  //  3. URL populated=1     → first global (legacy demo flag)
  //  4. null                → transient creation phase (wizard active, no
  //                                            context yet)
  const attachedContext = q.contextId
    ? getContextById(q.contextId)
    : session.contextId
      ? getContextById(session.contextId)
      : q.populated
        ? getContexts()[0]
        : null;
  const hasContext = !!attachedContext;

  // Lot 13 — handoff alignment. The session screen is now a chat-only body
  // (full width assistant panel) with the right-panel overlay handling
  // Drafts / Ideas. The previous Content + Context workspace tabs were
  // dropped here: Content is covered by the standalone /sources + /ideas
  // routes (Lots 6 + 7), Context is reachable through the ContextDrawer
  // (Lot 8) — both via the sidebar nav, not as inline session workspace.
  target.innerHTML = html`
    <section class="screen session session--solo">${raw(renderAssistantPanel(session, attachedContext))}</section>
  `;

  bindSession(target, session);
  wireAssistantPanel(target, session, attachedContext);
}

function renderAssistantPanel(session, attachedContext) {
  // Skip the default greeting if a start flow is queued — its first AI bubble
  // will introduce the conversation instead. (Read-only: don't consume the
  // flag here; the bindSession handoff below clears it after dispatching.)
  const hasPendingStartFlow = hasHandoff("pendingStartFlow");
  const thread = getThread(session.id, {
    hasContext: !!attachedContext,
    skipGreeting: hasPendingStartFlow,
  });

  // Wizard mode — when sidebar-wizard has state for this session, replace the
  // normal thread + composer with the analyse-style wizard chrome.
  if (sidebarWizard.isActive(session.id)) {
    return renderAssistantPanelWizard(session);
  }
  // Inline single-question mode — same chrome as the wizard but for one-shot
  // pickers (e.g. "Which profile to draft for?").
  if (inlineQuestion.isActive(session.id)) {
    return renderAssistantPanelQuestion(session);
  }

  // Empty conversation = the user hasn't typed anything yet. We swap the
  // thread for the handoff "What are we creating today?" hero with a 2x2
  // grid of starter cards (Q14). Once the user types, the thread takes over.
  const isEmptyConversation = thread.every((m) => m.role !== "user");

  return html`
    <aside class="session__assistant" aria-label="Assistant panel">
      <div class="session__assistant-thread" id="assistantThread" data-assistant-thread>
        ${isEmptyConversation ? raw(renderEmptyHero()) : raw(renderThread(thread))}
      </div>
      <div class="session__composer">
        <div class="session__composer-inner">
          <div class="session__composer-card">
            <div class="session__composer-thinking" data-assistant-thinking hidden>
              <span class="session__composer-thinking-spinner" aria-hidden="true"></span>
              <span class="session__composer-thinking-text" data-thinking-text>0s · 1 credit</span>
            </div>
            <div class="composer-pills" data-composer-pills hidden></div>
            <div class="session__composer-input">
              <textarea
                class="session__composer-input-field"
                id="assistantInput"
                placeholder="Ask Archie to compare ideas, find a signal, or draft the next move…"
                rows="3"
              ></textarea>
              <div class="session__composer-actions">
                <div class="composer-actions__left">
                  <button
                    type="button"
                    class="ap-icon-button transparent"
                    aria-label="Joindre un fichier"
                    data-composer-attach
                  >
                    <i class="ap-icon-paper-clip"></i>
                  </button>
                  <input type="file" data-composer-file-input hidden />
                  <div class="assistant-attach">
                    <button
                      type="button"
                      class="ap-icon-button transparent"
                      aria-label="Attach a source"
                      data-assistant-attach-toggle
                    >
                      <i class="ap-icon-plus"></i>
                    </button>
                    <div
                      class="ap-action-dropdown assistant-attach__menu"
                      data-assistant-attach-menu
                      hidden
                      role="menu"
                    >
                      <button type="button" class="ap-action-dropdown-item" data-add-source="pdf" role="menuitem">
                        <i class="ap-icon-file--pdf"></i>
                        <div class="ap-action-dropdown-item-text">
                          <div class="ap-action-dropdown-item-label">Add PDF</div>
                        </div>
                      </button>
                      <button type="button" class="ap-action-dropdown-item" data-add-source="video" role="menuitem">
                        <i class="ap-icon-file--video"></i>
                        <div class="ap-action-dropdown-item-text">
                          <div class="ap-action-dropdown-item-label">Add video</div>
                        </div>
                      </button>
                      <button type="button" class="ap-action-dropdown-item" data-add-source="url" role="menuitem">
                        <i class="ap-icon-link"></i>
                        <div class="ap-action-dropdown-item-text">
                          <div class="ap-action-dropdown-item-label">Add URL</div>
                        </div>
                      </button>
                    </div>
                  </div>
                  ${raw(renderComposerContextDropdown(attachedContext, { locked: !isEmptyConversation }))}
                </div>
                <button
                  type="button"
                  class="ap-button primary orange session__composer-send"
                  aria-label="Send"
                  data-assistant-send
                >
                  <i class="ap-icon-arrow-up"></i>
                </button>
              </div>
            </div>
            <div class="session__composer-hint">
              <kbd>↵</kbd> to send · <kbd>Shift</kbd>+<kbd>↵</kbd> for new line · <kbd>⌘</kbd>+<kbd>↵</kbd> sends from
              anywhere · drop a file anywhere to add it as a source
            </div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

// Composer context dropdown — trigger + menu items derived live from the
// contexts-store, replacing the previous hardcoded markup that diverged
// from the actual store (esp. broken in `isNewUser()` mode where the store
// is empty but the dropdown still showed three Agorapulse contexts).
//
// FIND-A5: trigger reflects the currently attached context (or a neutral
// "No context" fallback); menu lists every saved context plus a New CTA.
// Click handler at the bottom of bindSession updates the URL via setQuery,
// so the session re-renders with the chosen context attached.
// `locked` — once the chat has at least one user turn, the attached
// context is committed: render the trigger as a static span (no menu, no
// chevron) so the user can read it but can't swap it. Swapping mid-chat
// would invalidate the citations / drafts already produced under the
// original context.
function renderComposerContextDropdown(attachedContext, { locked = false } = {}) {
  const all = getContexts();
  const triggerColor = attachedContext?.color || "grey";
  const triggerLabel = attachedContext?.name || "No context";
  if (locked) {
    return `
      <div class="composer-context composer-context--locked" data-composer-context aria-live="polite">
        <span
          class="ap-tag tagOrange composer-context__trigger composer-context__trigger--locked"
          aria-label="Context (locked for this chat)"
          title="The context is locked once the conversation has started."
        >
          <span class="composer-context__dot" style="background: var(--ref-color-${escapeHtml(triggerColor)}-100);"></span>
          <span>${escapeHtml(triggerLabel)}</span>
        </span>
      </div>
    `;
  }
  const triggerClass = attachedContext
    ? "ap-tag tagOrange composer-context__trigger"
    : "ap-tag grey composer-context__trigger composer-context__trigger--empty";
  const items = all
    .map(
      (c) => `
        <button
          type="button"
          class="ap-action-dropdown-item ${c.id === attachedContext?.id ? "is-on" : ""}"
          data-context-id="${escapeHtml(c.id)}"
          role="menuitem"
        >
          <span class="composer-context__dot" style="background: var(--ref-color-${escapeHtml(c.color || "grey")}-100);"></span>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label">${escapeHtml(c.name)}</div>
          </div>
        </button>
      `,
    )
    .join("");
  const detachItem = attachedContext
    ? `
        <button type="button" class="ap-action-dropdown-item" data-context-id="__detach__" role="menuitem">
          <i class="ap-icon-close"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label">Detach context</div>
          </div>
        </button>
      `
    : "";
  const noneItem =
    !attachedContext && all.length === 0
      ? `<div class="ap-action-dropdown-item composer-context__menu-empty muted">No saved contexts yet.</div>`
      : "";
  return `
    <div class="composer-context" data-composer-context>
      <button
        type="button"
        class="${triggerClass}"
        data-context-trigger
        aria-haspopup="menu"
        aria-expanded="false"
      >
        <span class="composer-context__dot" data-context-dot style="background: var(--ref-color-${escapeHtml(triggerColor)}-100);"></span>
        <span data-context-label>${escapeHtml(triggerLabel)}</span>
        <i class="ap-icon-arrow-down"></i>
      </button>
      <div class="ap-action-dropdown composer-context__menu" data-context-menu hidden role="menu">
        ${noneItem}
        ${items}
        ${items || detachItem ? `<div class="ap-action-dropdown-divider"></div>` : ""}
        ${detachItem}
        <button type="button" class="ap-action-dropdown-item" data-context-id="__new__" role="menuitem">
          <i class="ap-icon-plus"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label">New context…</div>
          </div>
        </button>
      </div>
    </div>
  `;
}

// Empty-state hero — shown inside the assistant thread region when the user
// hasn't sent a first message yet. Mirrors the handoff (Chat.jsx empty state):
// hero question + sub-line + 2x2 grid of starter cards. Cards click → prefill
// the composer textarea (handler in bindSession via [data-starter]).
//
// FIND-A4: the raw prompts in mocks.chatStarters use a `{{source}}` placeholder
// that the previous version dropped into the textarea verbatim. Resolve it at
// render time: if a source is attached we name it; otherwise we fall back to
// "your source" so the prompt still reads cleanly for first-run users.
function renderEmptyHero() {
  const sources = getStreamSources();
  const firstSource = sources.find((s) => s.status !== "Processing") || sources[0] || null;
  const sourceLabel = firstSource ? `"${firstSource.filename}"` : "your source";
  const cards = chatStarters
    .map((s) => {
      const resolvedPrompt = s.prompt.replace(/\{\{source\}\}/g, sourceLabel);
      return `
        <button type="button" class="starter-card" data-starter="${s.id}" data-starter-prompt="${escapeHtml(resolvedPrompt)}">
          <span class="starter-card__icon"><i class="${s.icon}"></i></span>
          <span class="starter-card__title">${s.title}</span>
          <span class="starter-card__prompt">${escapeHtml(resolvedPrompt)}</span>
        </button>
      `;
    })
    .join("");
  return html`
    <div class="empty-chat" data-empty-chat>
      <div class="empty-chat__hello">What are we creating today?</div>
      <div class="empty-chat__sub">
        Drop in a source and Archie will turn it into a batch of posts you can review, edit, and schedule.
      </div>
      <div class="starter-grid">${raw(cards)}</div>
    </div>
  `;
}

// Minimal HTML attribute escaper — starter prompts contain quotes that would
// otherwise break the data-starter-prompt attribute.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Wizard chrome — replaces the normal thread + suggestions + composer when
// sidebar-wizard is active. Reuses the analyse-* picker rendering and
// keyboard binding so the UX is identical to the standalone /analyse routes.
function renderAssistantPanelWizard(session) {
  const chrome = sidebarWizard.renderChrome(session.id);
  if (!chrome) return "";
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="sidebarWizardChat">
        <div class="analyse__chat-inner">${raw(chrome.body)}</div>
      </div>
      <div class="analyse__sticky-bar session__assistant-wizard-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(chrome.picker ? renderPicker(chrome.picker) : "")}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </aside>
  `;
}

// Inline question chrome — same shell as the wizard but for one-shot pickers.
function renderAssistantPanelQuestion(session) {
  const chrome = inlineQuestion.renderChrome(session.id);
  if (!chrome) return "";
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="inlineQuestionChat">
        <div class="analyse__chat-inner">${raw(chrome.body)}</div>
      </div>
      <div class="analyse__sticky-bar session__assistant-wizard-bar" role="group" aria-label="Answer">
        <div class="analyse__sticky-bar-inner">
          ${raw(chrome.picker ? renderPicker(chrome.picker) : "")}
          <p class="analyse__hints muted">
            <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> submit ·
            <kbd>Esc</kbd> exit
          </p>
        </div>
      </div>
    </aside>
  `;
}

// Build + show the "What would you like to know about this source?" inline
// question. Triggered after the user clicks "Ask" on a source card and
// picks the chat to ask in. Suggested prompts + a free-text custom row.
function askWhatToKnow(sessionId, filename) {
  inlineQuestion.ask(sessionId, {
    intro: `What would you like to know about ${filename}?`,
    title: filename || "About this source",
    stepLabel: "Source",
    items: [
      { value: "What's the main takeaway?", label: "What's the main takeaway?", icon: "ap-icon-sparkles" },
      { value: "Summarize this in 3 bullet points.", label: "Summarize in 3 bullets", icon: "ap-icon-numbered-list" },
      { value: "Find a contrarian angle worth posting.", label: "Find a contrarian angle", icon: "ap-icon-bolden" },
    ],
    customPlaceholder: "Type your own question…",
    onPick: (text) => sendMessage(sessionId, text),
    onCustom: (text) => sendMessage(sessionId, text),
    onSkip: () => {},
  });
}

// Confirm prompt before editing a section of a global context. Contexts
// are now always shared — any edit propagates to every chat using the
// context — so we surface that explicitly before launching the wizard.
// Cancel quietly drops the request; Continue runs the section wizard.
function startEditConfirmPrompt(session, section, ctxId) {
  const sectionTitle = section === "voice" ? "Voice" : section === "brief" ? "Strategy brief" : "Brand theme";
  inlineQuestion.ask(session.id, {
    intro: `Editing the ${sectionTitle.toLowerCase()} will update this context across every chat using it.`,
    title: "Continue editing?",
    stepLabel: "Confirm",
    items: [
      {
        value: "continue",
        label: "Continue",
        caption: "Run the edit wizard. Changes propagate to all chats using this context.",
        icon: "ap-icon-check",
      },
      {
        value: "cancel",
        label: "Cancel",
        caption: "Don't make any changes.",
        icon: "ap-icon-close",
      },
    ],
    onPick: (choice) => {
      if (choice === "continue") startSectionEdit(session, section, ctxId);
    },
    onSkip: () => {},
  });
}

// Single-stage wizard for editing one section of an attached context.
// skipMemorize bypasses the save/name prompt — we're editing an existing
// global, not creating a new one. On completion we bump the global's
// updatedAt timestamp so the "Updated …" subline in consumers refreshes.
function startSectionEdit(session, section, contextId) {
  sidebarWizard.startWizard(session.id, {
    stages: [section],
    skipMemorize: true,
    onComplete: () => {
      const sectionTitle = section === "voice" ? "Voice" : section === "brief" ? "Strategy brief" : "Brand theme";
      if (contextId) updateContext(contextId, { updatedAt: "just now" });
      postAssistantMessage(session.id, `${sectionTitle} updated everywhere this context is used.`);
    },
  });
}

// Triggered from a source card's "Ask" button — routes through the chat
// picker the same way "Draft Post" does, then the chosen session shows
// the askWhatToKnow inline question.
function startAskFlowFromSession(sessionId, sourceId, filename) {
  const handoff = (choice) => {
    if (choice.kind === "existing" && choice.session.id === sessionId) {
      // Already in the picked chat — skip the navigation and ask now.
      askWhatToKnow(sessionId, filename);
      return;
    }
    setHandoff("pendingAskSource", { sourceId, filename });
    if (choice.kind === "new") {
      const qs = new URLSearchParams({ tab: "posts", title: defaultChatNameLocal() });
      navigate(`/session/new?${qs.toString()}`);
    } else {
      navigate(`/session/${choice.session.id}?tab=posts`);
    }
  };
  if (recentSessions.length === 0) {
    handoff({ kind: "new" });
  } else {
    openChatPickerModal({ onPick: handoff });
  }
}

// Local copy of dashboard's defaultChatName — keeps session.js standalone
// without a circular import for a 5-line helper.
function defaultChatNameLocal() {
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat · ${fmt.format(new Date())}`;
}

// Build + show the "Which profile?" question. Used both from the in-session
// Draft Post button and from the dashboard's Draft Post handler (via the
// pendingDraftIdeaId hand-off in handoff.js).
function askProfileQuestion(sessionId, ideaId) {
  const connected = socialAccounts.filter((a) => a.status === "connected");
  if (connected.length === 0) {
    postAssistantMessage(
      sessionId,
      "You don't have any connected social profiles yet. Open Settings → Social accounts to connect one, then come back to draft.",
    );
    return;
  }
  inlineQuestion.ask(sessionId, {
    intro: "Which profile should I draft this for?",
    title: "Pick a connected social profile",
    stepLabel: "Profile",
    items: connected.map((a) => ({
      value: a.id,
      label: a.platformLabel,
      caption: a.handle ? (a.kind ? `${a.kind} · ${a.handle}` : a.handle) : a.kind || "",
      imgSrc: a.logo,
    })),
    onPick: () => {
      startDraftFlow(sessionId, ideaId);
    },
    onSkip: () => {
      // Just exit the question — no draft started, no error.
    },
  });
}

function renderThread(messages) {
  return messages.map(renderTurn).join("");
}

function renderTurn(message) {
  // Hidden placeholders (pre-reply AI bubbles) don't render.
  if (message.hidden) return "";

  // Pending marker — renders the inline "Extracting" notice while loading,
  // disappears once the caller flips status to "ready". Figma 25:1413.
  if (message.role === "pending") {
    if (message.status !== "loading") return "";
    return renderExtractingNotice();
  }

  // Right-aligned "Source intake" turn — Figma 25:1127 / 25:1131.
  if (message.role === "source-intake") {
    return renderSourceIntakeTurn(message);
  }

  // AI extraction result — Figma 25:1053.
  if (message.role === "assistant" && message.variant === "extraction") {
    return renderExtractionTurn(message);
  }

  // Draft result — "Drafted N posts" mermaid-pill + mini post cards.
  if (message.role === "assistant" && message.variant === "draft") {
    return renderDraftTurn(message);
  }

  // Channel-picker choice turn — chip row + "Draft them" button.
  if (message.role === "assistant-choice") {
    return renderChoiceTurn(message);
  }

  // Drafting / system notices — mermaid status pill + optional detail body.
  if (message.role === "system") {
    return renderSystemNotice(message);
  }

  const isAi = message.role === "assistant";
  const bubbleClass = isAi ? "chat-bubble--ai" : "chat-bubble--user";
  const turnClass = isAi ? "chat-turn--ai" : "chat-turn--user";
  const loadingClass = message.status === "loading" ? " is-loading" : "";
  const header = isAi
    ? `<i class="ap-icon-sparkles-mermaid chat-turn-avatar" aria-hidden="true"></i>`
    : `<span class="chat-turn-role">You</span>`;
  return `
    <div class="chat-turn ${turnClass}">
      ${header}
      <div class="chat-bubble ${bubbleClass}${loadingClass}">
        <p class="chat-bubble-text">${message.text}</p>
      </div>
    </div>
  `;
}

function renderSystemNotice(message) {
  const variantClass = message.variant === "mermaid" ? " assistant-notice--mermaid" : "";
  const loadingClass = message.status === "loading" ? " is-loading" : "";
  const openAttr = message.open ? " open" : "";
  const statusClass = message.variant === "mermaid" ? "ap-status mermaid" : "ap-status grey";
  const hasDetail = !!message.text;
  return `
    <details class="assistant-notice${variantClass}${loadingClass}"${openAttr}>
      <summary class="assistant-notice__toggle">
        <span class="${statusClass}">${message.meta || "System"}</span>
        ${hasDetail ? '<i class="ap-icon-chevron-down assistant-notice__chevron"></i>' : ""}
      </summary>
      ${hasDetail ? `<div class="assistant-notice__detail">${message.text}</div>` : ""}
    </details>
  `;
}

// Inline "Extracting" notice (Figma 25:1413) — mermaid status pill + small
// blue spinner, sits in the thread while a source extraction is in flight.
function renderExtractingNotice() {
  return `
    <div class="chat-turn chat-turn--ai chat-turn--extracting">
      <div class="extracting-notice">
        <span class="ap-status mermaid">Extracting</span>
        <span class="extracting-notice__spinner" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

function renderSourceIntakeTurn(message) {
  const iconByKind = {
    pdf: "ap-icon-file--pdf",
    video: "ap-icon-file--video",
    url: "ap-icon-link",
  };
  const icon = iconByKind[message.kind] || "ap-icon-file";
  const suffix = message.size ? ` · ${message.size}` : "";
  return `
    <div class="chat-turn chat-turn--user">
      <span class="chat-turn-role">${message.meta || "Source intake"}</span>
      <div class="chat-bubble chat-bubble--source-intake">
        <i class="${icon}" aria-hidden="true"></i>
        <p class="chat-bubble-text">${message.filename}${suffix}</p>
      </div>
    </div>
  `;
}

function renderExtractionTurn(message) {
  const loadingClass = message.status === "loading" ? " is-loading" : "";
  const openAttr = message.open === false ? "" : " open";
  const count = message.count ?? (message.ideas ? message.ideas.length : 0);
  const cards = (message.ideas || [])
    .map(
      (i) => `
        <div class="ap-card extraction-turn__idea-card">
          <div class="extraction-turn__idea-card-text">
            <p class="extraction-turn__idea-card-title">${i.title}</p>
            <p class="extraction-turn__idea-card-body">${i.body}</p>
          </div>
          <div class="extraction-turn__idea-card-footer">
            <div class="extraction-turn__idea-card-feedback" role="group" aria-label="Rate this idea">
              <button
                type="button"
                class="extraction-turn__idea-card-thumb"
                title="Helpful"
                aria-label="Mark as helpful"
                aria-pressed="false"
                data-idea-feedback="up"
                data-idea-id="${i.id || ""}"
              >
                <i class="ap-icon-thumb-up"></i>
              </button>
              <button
                type="button"
                class="extraction-turn__idea-card-thumb"
                title="Not helpful"
                aria-label="Mark as not helpful"
                aria-pressed="false"
                data-idea-feedback="down"
                data-idea-id="${i.id || ""}"
              >
                <i class="ap-icon-thumb-down"></i>
              </button>
            </div>
            <a
              href="#"
              class="ap-link standalone small extraction-turn__idea-card-view"
              data-focus-idea="${i.id || ""}"
              aria-label="Open this idea in Content ideas"
            >
              <span>View idea</span>
              <i class="ap-icon-external-link"></i>
            </a>
          </div>
        </div>
      `,
    )
    .join("");
  return `
    <div class="chat-turn chat-turn--ai chat-turn--extraction">
      <details class="assistant-notice assistant-notice--mermaid${loadingClass}"${openAttr}>
        <summary class="assistant-notice__toggle">
          <span class="ap-status mermaid">Extracted ${count} idea${count === 1 ? "" : "s"}</span>
          <i class="ap-icon-chevron-down assistant-notice__chevron"></i>
        </summary>
        <div class="extraction-turn__detail">
          <div class="extraction-turn__analyzed-row">
            <strong>Analyzed</strong>
            <span>${message.filename}</span>
          </div>
          ${cards}
        </div>
      </details>
    </div>
  `;
}

function wireAssistantPanel(root, session, attachedContext) {
  // Tear down any subscriptions attached to the previous render.
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  stopThinkingTimer();

  // The assistant aside (and thread inside it) gets replaced wholesale
  // when sidebarWizard / inlineQuestion subscribers re-render the panel.
  // Querying lazily inside the subscriber keeps writes hitting the live
  // DOM node instead of an orphaned one.
  const getThreadEl = () => root.querySelector("[data-assistant-thread]");
  {
    const thread = getThreadEl();
    if (thread) {
      queueMicrotask(() => {
        thread.scrollTop = thread.scrollHeight;
      });
    }
  }

  // Initial chip sync (in case the thread already has a loading message
  // carried over from a prior render, e.g. after a tab switch).
  updateThinkingChip(session.id);

  // Subscribe to the assistant thread.
  // When a NEW draft message lands we auto-open the right panel in Drafts
  // mode pinned to that batch — matches the handoff App.jsx "if the reply
  // has a batch, set activeBatchRef and switch to drafts" rule (§ State
  // Management → send transitions).
  let lastDraftMessageId = null;
  // Track whether we've already crossed the empty → has-user-turn boundary.
  // The first time we cross it, the composer context picker locks in (its
  // markup changes shape), so we re-render the whole assistant aside.
  let firstUserTurnSeen = getThread(session.id).some((m) => m.role === "user");
  const offThread = subscribe(session.id, (messages) => {
    const thread = getThreadEl();
    if (thread) {
      thread.innerHTML = renderThread(messages);
      thread.scrollTop = thread.scrollHeight;
    }
    updateThinkingChip(session.id);
    if (!firstUserTurnSeen && messages.some((m) => m.role === "user")) {
      firstUserTurnSeen = true;
      refreshAssistantAside();
    }
    const latestDraft = [...messages].reverse().find((m) => m.variant === "draft");
    if (latestDraft && latestDraft.id !== lastDraftMessageId) {
      lastDraftMessageId = latestDraft.id;
      openDraftsPanel({ sessionId: session.id, messageId: latestDraft.id });
    }
  });

  // Subscribe to the right-panel state — when the active batch flips or the
  // panel opens/closes, the in-thread Drafts summary card needs to swap its
  // .is-active visual. Cheaper than re-rendering everything: just repaint
  // the thread.
  const offRightPanel = subscribeRightPanel(() => {
    const thread = getThreadEl();
    if (!thread) return;
    const messages = getThread(session.id);
    thread.innerHTML = renderThread(messages);
  });

  // The library subscription used to re-render the in-session Content tab.
  // Lot 13 dropped that tab — now /sources, /ideas (standalone routes) own
  // the rendering. Keep a no-op offLibrary so the unsubscribe slot in
  // currentUnsubscribe stays the same shape.
  const offLibrary = () => {};

  // Subscribe to sidebar-wizard state — when state changes, re-render the
  // entire assistant panel (wizard chrome <-> normal thread+composer) and
  // re-bind keyboard nav for the wizard picker.
  const rebindWizardKeyboardIfActive = () => {
    const aside = root.querySelector(".session__assistant");
    if (!aside) return;
    if (sidebarWizard.isActive(session.id)) {
      bindWizardKeyboard(aside, {
        handler: "wizard-answer",
        onExit: () => {
          unbindWizardKeyboard();
          sidebarWizard.exit(session.id);
        },
        onCustomSubmit: (value) => {
          sidebarWizard.answer(session.id, "other", value);
        },
        onMultiSubmit: (selectedValues) => {
          sidebarWizard.answer(session.id, selectedValues);
        },
      });
    } else if (inlineQuestion.isActive(session.id)) {
      bindWizardKeyboard(aside, {
        handler: "inline-question",
        onExit: () => {
          unbindWizardKeyboard();
          inlineQuestion.skip(session.id);
        },
        onCustomSubmit: (value) => {
          inlineQuestion.submitCustom(session.id, value);
        },
        onMultiSubmit: (selectedValues) => {
          inlineQuestion.submitMulti(session.id, selectedValues);
        },
      });
    } else {
      unbindWizardKeyboard();
    }
  };
  const refreshAssistantAside = () => {
    const aside = root.querySelector(".session__assistant");
    const screen = aside?.parentElement;
    if (screen) {
      const fresh = renderAssistantPanel(session, attachedContext);
      const tmp = document.createElement("div");
      tmp.innerHTML = fresh;
      const newAside = tmp.firstElementChild;
      if (newAside && aside) {
        screen.replaceChild(newAside, aside);
        // The new aside ships with an empty pills container — paint
        // any persisted pills for this session into it.
        paintComposerPills(root, session.id);
      }
    }
    rebindWizardKeyboardIfActive();
  };
  const offWizard = sidebarWizard.subscribe(session.id, refreshAssistantAside);
  const offInlineQuestion = inlineQuestion.subscribe(session.id, refreshAssistantAside);
  // Initial bind in case the panel was rendered with wizard / question mode on.
  rebindWizardKeyboardIfActive();

  // Posts tab dropped at Lot 4.4 then the workspace itself at Lot 13. The
  // posts-store subscription used to repaint the in-session Posts tab body.
  // No subscriber to wire today; the right-panel Drafts surface listens to
  // assistant.subscribe directly for batch updates.
  const offPosts = () => {};

  // Composer pills — repaint on every sources/uploads stream change. The
  // analyzing → ready transition crosses the upload→source boundary on the
  // 📎 path, so subscribing to both catches every state flip. Initial
  // paint covers pills carried over by composerStates from a prior render.
  const offComposerSources = subscribeSources(() => paintComposerPills(root, session.id));
  const offComposerUploads = subscribeUploads(() => paintComposerPills(root, session.id));
  paintComposerPills(root, session.id);

  // Apply idea focus on initial render if ?focusIdea= is present.
  applyIdeaFocus(root);

  // Check for a pending draft intent set by the dashboard handler — start the
  // conversational flow after subscriptions are active so thread updates show.
  const pendingIdeaId = consumeHandoff("pendingDraftIdeaId");
  if (pendingIdeaId) {
    setTimeout(() => askProfileQuestion(session.id, pendingIdeaId), 100);
  }

  // Hand-off from a source card's "Ask" button on the dashboard or another
  // session — open the askWhatToKnow inline question in this freshly mounted
  // chat.
  const pendingAsk = consumeHandoff("pendingAskSource");
  if (pendingAsk?.filename) {
    setTimeout(() => askWhatToKnow(session.id, pendingAsk.filename), 150);
  }

  // Pending start flow set by the dashboard's New chat button. Only the
  // action-picker variant remains — creating a context is now handled by
  // the dedicated /contexts/new route, not by spawning a chat. New chats
  // without a context attached just land on the empty hero.
  const pendingStart = consumeHandoff("pendingStartFlow");
  if (pendingStart && pendingStart.hasContext) {
    setTimeout(() => {
      startActionPickerFlow(session.id, { contextName: pendingStart.contextName });
    }, 200);
  }

  // Drag-and-drop a file anywhere on the assistant panel → kicks off the
  // upload pipeline directly (no modal). Matches the handoff "drop a file
  // anywhere to add it as a source" hint shown under the composer. Files
  // that don't classify (wrong extension, too big) fall back to the Add
  // Source modal so the user gets the explicit error UX.
  const aside = root.querySelector(".session__assistant");
  if (aside) {
    let dragDepth = 0;
    aside.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
      dragDepth += 1;
      aside.classList.add("is-drop-target");
    });
    aside.addEventListener("dragover", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    aside.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) aside.classList.remove("is-drop-target");
    });
    aside.addEventListener("drop", (event) => {
      if (!event.dataTransfer || !event.dataTransfer.files?.length) return;
      event.preventDefault();
      dragDepth = 0;
      aside.classList.remove("is-drop-target");
      const files = Array.from(event.dataTransfer.files);
      let started = 0;
      let firstReject = null;
      for (const file of files) {
        const classification = classifyFile(file);
        if (classification.ok) {
          startFileUpload(file, classification);
          started += 1;
        } else if (!firstReject) {
          firstReject = classification.reason;
        }
      }
      if (started > 0) {
        showToast(
          started === 1 ? `Uploading "${files[0].name}"…` : `Uploading ${started} file${started === 1 ? "" : "s"}…`,
        );
      }
      if (firstReject) {
        // Fall back to the modal so the user sees the explicit error UX
        // and can retry with a supported file.
        openAddSourceModal({ tab: "upload" });
      }
    });
  }

  currentUnsubscribe = () => {
    offThread();
    offRightPanel();
    offLibrary();
    offPosts();
    offWizard();
    offInlineQuestion();
    offComposerSources();
    offComposerUploads();
    stopThinkingTimer();
  };
}

// --- Thinking chip -------------------------------------------------------

let thinkingIntervalId = null;
// FIND-D1: 30-second cap on a single thinking turn — past that we surface a
// "taking longer than expected" toast so the user knows the system is still
// alive. We don't auto-cancel the message (the mock pipeline always finishes
// in <2s), but the toast is the hook that wires to a real timeout / retry
// path when the API lands.
const THINKING_TIMEOUT_MS = 30000;
const timedOutMessageIds = new Set();

function updateThinkingChip(sessionId) {
  const chip = document.querySelector("[data-assistant-thinking]");
  if (!chip) return;
  const thread = getThread(sessionId);
  const loadingMessages = thread.filter((m) => m.status === "loading");
  if (loadingMessages.length === 0) {
    chip.hidden = true;
    stopThinkingTimer();
    return;
  }
  chip.hidden = false;
  const startedAt = loadingMessages[0].createdAt || Date.now();
  paintThinkingChip(chip, startedAt);
  startThinkingTimer(sessionId);
}

function paintThinkingChip(chip, startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const credits = Math.max(1, Math.round(seconds / 6));
  const label = formatElapsed(seconds);
  const text = chip.querySelector("[data-thinking-text]");
  if (text) {
    text.textContent = `${label} · ${credits} credit${credits === 1 ? "" : "s"}`;
  }
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function startThinkingTimer(sessionId) {
  if (thinkingIntervalId) return;
  thinkingIntervalId = setInterval(() => {
    const chip = document.querySelector("[data-assistant-thinking]");
    if (!chip || chip.hidden) {
      stopThinkingTimer();
      return;
    }
    const thread = getThread(sessionId);
    const loading = thread.find((m) => m.status === "loading");
    if (!loading) {
      chip.hidden = true;
      stopThinkingTimer();
      return;
    }
    paintThinkingChip(chip, loading.createdAt || Date.now());

    // Per-message timeout — show the toast once per loading turn that
    // crosses the boundary, so successive long turns each get their own
    // notice instead of a single early one and silence afterwards.
    const elapsed = Date.now() - (loading.createdAt || Date.now());
    if (elapsed >= THINKING_TIMEOUT_MS && !timedOutMessageIds.has(loading.id)) {
      timedOutMessageIds.add(loading.id);
      showToast("This is taking longer than expected. Hang tight, or refresh if it stays stuck.", {
        variant: "error",
        duration: 6000,
      });
    }
  }, 1000);
}

function stopThinkingTimer() {
  if (thinkingIntervalId) {
    clearInterval(thinkingIntervalId);
    thinkingIntervalId = null;
  }
}

// --- Focused-idea highlight ---------------------------------------------

function applyIdeaFocus(root) {
  const q = readQuery();
  if (!q.focusIdea || q.tab !== "content" || q.view !== "ideas") return;
  const card = root.querySelector(`[data-idea-id="${q.focusIdea}"]`);
  if (!card) return;
  card.classList.add("is-focused");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.classList.remove("is-focused"), 1800);
}

// Thin wrapper around the shared rerenderContentWorkspaceBody — keeps the
// session.js call sites unchanged while the actual rendering lives in the
// shared module. Also threads selection state + bulk bar through so the
// in-place repaint after a checkbox toggle stays consistent with the
// initial render.
function rerenderContentWorkspace(root, session) {
  const q = readQuery();
  if (q.tab !== "content") return;
  const view = q.view === "ideas" ? "ideas" : "sources";
  const sourceSel = view === "sources" ? sourceSelection : null;
  const ideaSel = view === "ideas" ? ideaSelection : null;
  rerenderContentWorkspaceBody(root, {
    sources: getSources(session.id),
    ideas: getIdeas(session.id),
    view,
    sourceSelection: sourceSel,
    sourcesBulkBar: sourceSel && sourceSel.size > 0 ? renderSourcesBulkBar(sourceSel.size) : "",
    ideaSelection: ideaSel,
    ideasBulkBar: ideaSel && ideaSel.size > 0 ? renderIdeasBulkBar(ideaSel.size) : "",
  });
}

// Channel-picker choice turn — chips toggle on click, "Draft them" submits.
function renderChoiceTurn(message) {
  const isAnswered = message.status === "answered";
  const chips = (message.choices || [])
    .map((c) => {
      const isSelected = (message.selected || []).includes(c.value);
      const selectedClass = isSelected ? " is-selected" : "";
      if (isAnswered) {
        return `<span class="chat-bubble-choice-chip${selectedClass}">
          <i class="${c.icon}" aria-hidden="true"></i>
          <span>${c.label}</span>
        </span>`;
      }
      return `<button
        type="button"
        class="chat-bubble-choice-chip${selectedClass}"
        data-assistant-choice="${c.value}"
        data-assistant-choice-msg="${message.id}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >
        <i class="${c.icon}" aria-hidden="true"></i>
        <span>${c.label}</span>
      </button>`;
    })
    .join("");

  const submitLabel = message.submitLabel || "Submit";
  const footer = isAnswered
    ? ""
    : `<div class="chat-bubble-choices-footer">
        <button
          type="button"
          class="ap-button primary orange"
          data-assistant-choice-submit="${message.id}"
        >
          <span>${submitLabel}</span>
        </button>
      </div>`;

  return `
    <div class="chat-turn chat-turn--ai">
      <i class="ap-icon-sparkles-mermaid chat-turn-avatar" aria-hidden="true"></i>
      <div class="chat-bubble chat-bubble--ai">
        <p class="chat-bubble-text">${message.text}</p>
        <div class="chat-bubble-choices">${chips}</div>
        ${footer}
      </div>
    </div>
  `;
}

// Network → icon mapping — used both in the Drafts summary card network row
// and (later) by the Drafts work-surface in Lot 4. Keep the slug list aligned
// with mocks.socialAccounts so the visual surfaces never miss a network.
const NETWORK_ICON = {
  linkedin: "ap-icon-linkedin",
  twitter: "ap-icon-twitter-official",
  x: "ap-icon-twitter-official",
  instagram: "ap-icon-instagram",
  facebook: "ap-icon-facebook",
  tiktok: "ap-icon-tiktok-official",
};

function networkLabel(network) {
  if (network === "twitter") return "X";
  if (!network) return "";
  return network.charAt(0).toUpperCase() + network.slice(1);
}

// In-thread Drafts summary card — handoff §2.1 spec. Replaces the previous
// accordion-style "Drafted N posts" turn with a flat horizontal card:
//
//   [ pen icon tile ]  N drafts ready  [pill]    View drafts ›
//                      [network logos] Across N networks · review, edit…
//
// Click anywhere on the card → currently navigates to the Posts tab. In
// Lot 4 this rewires to setActiveBatchRef + open the right-panel Drafts
// surface (the actual editable BatchCards land there, never inline).
function renderDraftTurn(message) {
  const drafts = message.drafts || [];
  const count = message.count ?? drafts.length;
  const networks = [...new Set(drafts.map((d) => d.network).filter(Boolean))];
  const networkIcons = networks
    .map((n) => `<i class="${NETWORK_ICON[n] || "ap-icon-megaphone"}" title="${networkLabel(n)}"></i>`)
    .join("");
  const networkCount = networks.length;
  const networkLabelText =
    networkCount === 0
      ? "review, edit, and schedule"
      : `Across ${networkCount} ${networkCount === 1 ? "network" : "networks"} · review, edit, and schedule`;

  // Active when the right panel is open in Drafts mode and pinned to THIS
  // message — gives the user a visual anchor between the chat thread and
  // the editable batch surface.
  const activeRef = getRightPanelMode() === "drafts" ? getActiveDraftsBatchRef() : null;
  const isActive = activeRef && activeRef.messageId === message.id;

  return `
    <div class="chat-turn chat-turn--ai chat-turn--extraction">
      <button type="button" class="drafts-card ${isActive ? "is-active" : ""}" data-drafts-card-message="${message.id || ""}">
        <span class="drafts-card__icon" aria-hidden="true">
          <i class="ap-icon-pen"></i>
        </span>
        <span class="drafts-card__main">
          <span class="drafts-card__title">
            ${count} draft${count === 1 ? "" : "s"} ready
          </span>
          <span class="drafts-card__sub">
            ${networks.length ? `<span class="drafts-card__nets">${networkIcons}</span>` : ""}
            <span class="drafts-card__sub-text">${networkLabelText}</span>
          </span>
        </span>
        <span class="drafts-card__cta">
          View drafts
          <i class="ap-icon-chevron-right"></i>
        </span>
      </button>
    </div>
  `;
}

// ─── Composer state — pills + context selection (per-session) ────────────
//
// Pills track in-flight + recently-completed attachments shown in the input
// zone above the textarea. They survive thread/right-panel/wizard re-renders
// because they live in this module-level Map keyed by sessionId rather than
// inside bindSession's local scope. Each pill points to either a backing
// upload (started via the 📎 button → real File) or a source (started via
// the + menu items → fake scripted source for the proto). Display state is
// re-derived from the global sources-stream snapshot on every paint.
// FIND-A5: COMPOSER_CONTEXTS / composerSt.contextId removed when the
// composer dropdown moved to a contexts-store-driven render. The dropdown
// now reads the attached context from the session's URL state and the
// menu items from getContexts(); selection routes through setQuery, so
// per-composer context tracking is no longer needed here.
const composerStates = new Map();
function getComposerState(sessionId) {
  let s = composerStates.get(sessionId);
  if (!s) {
    s = { pills: new Map() };
    composerStates.set(sessionId, s);
  }
  return s;
}

const PILL_KIND_ICON = {
  PDF: "ap-icon-file--pdf",
  Word: "ap-icon-file--text",
  Text: "ap-icon-file--text",
  Video: "ap-icon-file--video",
  Audio: "ap-icon-file",
  Image: "ap-icon-file--image",
  URL: "ap-icon-link",
};

const SCRIPTED_KINDS = {
  pdf: { kindLabel: "PDF", filename: "Roadmap Q3.pdf" },
  video: { kindLabel: "Video", filename: "Demo replay.mp4" },
  url: { kindLabel: "URL", filename: "blog.example.com/post" },
};

// Resolves a pill against the live sources/uploads stream. Returns null
// when the backing record is gone (cancelled upload / removed source) so
// the caller can drop the pill from local state.
function resolveComposerPill(pill) {
  if (pill.uploadId) {
    const upload = getStreamUploads().find((u) => u.id === pill.uploadId);
    if (!upload || upload.status === "cancelled") return null;
    if (upload.sourceId) {
      const src = getStreamSources().find((s) => s.id === upload.sourceId);
      if (src) {
        return {
          state: src.status === "Processed" ? "ready" : "analyzing",
          filename: src.filename,
          kindLabel: src.kind,
          ideaCount: src.ideaCount,
          sourceId: src.id,
        };
      }
    }
    return {
      state: "analyzing",
      filename: upload.name,
      kindLabel: upload.kind,
      ideaCount: 0,
      sourceId: null,
    };
  }
  if (pill.sourceId) {
    const src = getStreamSources().find((s) => s.id === pill.sourceId);
    if (!src) return null;
    return {
      state: src.status === "Processed" ? "ready" : "analyzing",
      filename: src.filename,
      kindLabel: src.kind,
      ideaCount: src.ideaCount,
      sourceId: src.id,
    };
  }
  return null;
}

function renderComposerPill(pillId, snap) {
  const icon = PILL_KIND_ICON[snap.kindLabel] || "ap-icon-file";
  // Every state-specific indicator lives OUTSIDE the blue pill, as a
  // sibling within the .composer-pill-group. The blue pill itself stays
  // minimal (icon + label + ×) so the eye reads "this file" → "what's
  // happening with it" left-to-right.
  let siblingIndicator = "";
  if (snap.state === "analyzing") {
    siblingIndicator = `
      <span class="composer-pill__indicator analyzing" aria-live="polite">
        <span class="ap-loader blue size-16" aria-hidden="true">
          <svg><circle></circle><circle></circle></svg>
        </span>
        <span class="composer-pill__status">Analyse en cours…</span>
      </span>`;
  } else if (snap.state === "ready") {
    const ideas = snap.ideaCount === 1 ? "1 nouvelle idée" : `${snap.ideaCount} nouvelles idées`;
    siblingIndicator = `
      <button type="button" class="ap-tag green mini composer-pill__ideas" data-open-source-ideas="${snap.sourceId}" data-idea-count="${snap.ideaCount}">
        <span>${escapeHtml(ideas)}</span>
      </button>`;
  } else if (snap.state === "error") {
    siblingIndicator = `<span class="ap-tag red mini">Échec</span>`;
  }
  const closeAttr = snap.state === "analyzing" ? `data-pill-cancel="${pillId}"` : `data-pill-remove="${pillId}"`;
  const closeAria = snap.state === "analyzing" ? "Annuler" : "Retirer";

  return `
    <span class="composer-pill-group">
      <span class="ap-tag blue composer-pill" data-pill-id="${pillId}" data-pill-state="${snap.state}"${snap.sourceId ? ` data-source-id="${snap.sourceId}"` : ""}>
        <i class="${icon}"></i>
        <span class="composer-pill__label">${escapeHtml(snap.filename)}</span>
        <button type="button" class="ap-icon-button transparent composer-pill__close" ${closeAttr} aria-label="${closeAria}">
          <i class="ap-icon-close"></i>
        </button>
      </span>
      ${siblingIndicator}
    </span>`;
}

function paintComposerPills(root, sessionId) {
  const container = root.querySelector("[data-composer-pills]");
  if (!container) return;
  const state = getComposerState(sessionId);
  const html = [];
  for (const [pillId, pill] of state.pills) {
    const snap = resolveComposerPill(pill);
    if (!snap) {
      state.pills.delete(pillId);
      continue;
    }
    html.push(renderComposerPill(pillId, snap));
  }
  container.innerHTML = html.join("");
  container.hidden = html.length === 0;
}

function startPillFromFile(root, sessionId, file) {
  const cls = classifyFile(file);
  if (!cls.ok) {
    showToast(cls.reason);
    return;
  }
  const uploadId = startFileUpload(file, cls);
  getComposerState(sessionId).pills.set(`pill-${uploadId}`, { uploadId });
  // pushScriptedSource / startFileUpload notify subscribers BEFORE we
  // record the pill — paint once explicitly so the analyzing state
  // shows up on the same tick as the click.
  paintComposerPills(root, sessionId);
}

function startPillFromKind(root, sessionId, kind) {
  const spec = SCRIPTED_KINDS[kind];
  if (!spec) return;
  const sourceId = pushScriptedSource({ filename: spec.filename, kind: spec.kindLabel });
  getComposerState(sessionId).pills.set(`pill-${sourceId}`, { sourceId });
  paintComposerPills(root, sessionId);
  // Match the brief — flip to ready in ~3-5s with 3-8 ideas.
  const delay = 3000 + Math.floor(Math.random() * 2000);
  const ideaCount = 3 + Math.floor(Math.random() * 6);
  setTimeout(() => {
    completeScriptedSource(sourceId, {
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount,
    });
  }, delay);
}

function bindSession(root, session) {
  // Abort any listeners attached by the previous render so they don't stack
  // on the stable #app element and fire N times per click.
  if (currentListenerController) currentListenerController.abort();
  currentListenerController = new AbortController();
  const { signal } = currentListenerController;

  // Library actions (selection toggles, bulk Extract/Delete, per-row "…"
  // menu) are wired through the shared library-actions module so the
  // dashboard and the in-session Content tab behave identically.
  wireLibraryActions(root, {
    sessionId: session.id,
    sourceSelection,
    ideaSelection,
    getSources: () => getSources(session.id),
    onRerender: () => rerenderContentWorkspace(root, session),
    signal,
  });

  const input = root.querySelector("#assistantInput");

  // The assistant aside (and its attach menu) gets replaced wholesale on
  // sidebarWizard / inlineQuestion / library subscribe callbacks. Holding a
  // reference here would bind to a detached node — query lazily instead.
  function getAttachMenu() {
    return root.querySelector("[data-assistant-attach-menu]");
  }

  function closeAttachMenu() {
    const menu = getAttachMenu();
    if (menu) menu.hidden = true;
  }

  function submitInput() {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    sendMessage(session.id, text);
    input.value = "";
  }

  root.addEventListener(
    "click",
    (event) => {
      // Thumb up/down feedback on an extraction idea card — exclusive toggle.
      const thumb = event.target.closest("[data-idea-feedback]");
      if (thumb) {
        event.preventDefault();
        const card = thumb.closest(".extraction-turn__idea-card");
        if (card) {
          const wasActive = thumb.classList.contains("is-active");
          // Mutually exclusive: clear both thumbs in this card first.
          card.querySelectorAll("[data-idea-feedback]").forEach((b) => {
            b.classList.remove("is-active");
            b.setAttribute("aria-pressed", "false");
            const i = b.querySelector("i");
            if (i) {
              const dir = b.dataset.ideaFeedback;
              i.className = dir === "up" ? "ap-icon-thumb-up" : "ap-icon-thumb-down";
            }
          });
          if (!wasActive) {
            thumb.classList.add("is-active");
            thumb.setAttribute("aria-pressed", "true");
            const i = thumb.querySelector("i");
            if (i) {
              const dir = thumb.dataset.ideaFeedback;
              i.className = dir === "up" ? "ap-icon-thumb-up_fill" : "ap-icon-thumb-down_fill";
            }
          }
        }
        return;
      }

      // Sidebar wizard option click — single-select advances immediately,
      // multi-select toggles the row and waits for the Submit button.
      const wizardOption = event.target.closest("[data-wizard-answer]");
      if (wizardOption) {
        event.preventDefault();
        const opts = wizardOption.closest(".analyse__options");
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = wizardOption.classList.contains("is-selected");
          wizardOption.classList.toggle("is-selected", !wasSelected);
          wizardOption.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
        } else {
          sidebarWizard.answer(session.id, wizardOption.dataset.wizardAnswer);
        }
        return;
      }

      // Multi-select submit — collect every .is-selected in the picker and
      // hand the array to the wizard as the answer value.
      const wizardSubmitBtn = event.target.closest("[data-wizard-answer-submit]");
      if (wizardSubmitBtn) {
        event.preventDefault();
        const opts = wizardSubmitBtn.closest(".analyse__options");
        const selected = opts
          ? Array.from(opts.querySelectorAll("[data-wizard-answer].is-selected")).map((el) => el.dataset.wizardAnswer)
          : [];
        if (selected.length) sidebarWizard.answer(session.id, selected);
        return;
      }

      // Skip button — bumps the wizard to the next stage's intake (or to
      // the memorize step if this was the last stage).
      if (event.target.closest("[data-wizard-answer-skip]")) {
        event.preventDefault();
        sidebarWizard.skipStage(session.id);
        return;
      }

      // Inline single-question pick / skip / custom-submit / multi-submit.
      const inlineQuestionBtn = event.target.closest("[data-inline-question]");
      if (inlineQuestionBtn) {
        event.preventDefault();
        const opts = inlineQuestionBtn.closest(".analyse__options");
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = inlineQuestionBtn.classList.contains("is-selected");
          inlineQuestionBtn.classList.toggle("is-selected", !wasSelected);
          inlineQuestionBtn.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
        } else {
          inlineQuestion.pick(session.id, inlineQuestionBtn.dataset.inlineQuestion);
        }
        return;
      }
      const inlineQuestionSubmitBtn = event.target.closest("[data-inline-question-submit]");
      if (inlineQuestionSubmitBtn) {
        event.preventDefault();
        const opts = inlineQuestionSubmitBtn.closest(".analyse__options");
        const selected = opts
          ? Array.from(opts.querySelectorAll("[data-inline-question].is-selected")).map(
              (el) => el.dataset.inlineQuestion,
            )
          : [];
        if (selected.length) inlineQuestion.submitMulti(session.id, selected);
        return;
      }
      if (event.target.closest("[data-inline-question-skip]")) {
        event.preventDefault();
        inlineQuestion.skip(session.id);
        return;
      }
      const inlineQuestionCustomSubmit = event.target.closest("[data-inline-question-custom-submit]");
      if (inlineQuestionCustomSubmit) {
        event.preventDefault();
        const input = inlineQuestionCustomSubmit
          .closest(".analyse__options")
          ?.querySelector("[data-inline-question-custom]");
        const value = input?.value?.trim();
        if (value) inlineQuestion.submitCustom(session.id, value);
        return;
      }

      // Channel-picker chip toggle — visual only, no state change yet.
      const choiceChip = event.target.closest("[data-assistant-choice]");
      if (choiceChip && choiceChip.tagName === "BUTTON") {
        event.preventDefault();
        const wasSelected = choiceChip.classList.contains("is-selected");
        choiceChip.classList.toggle("is-selected", !wasSelected);
        choiceChip.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
        return;
      }

      // "Draft them" submit — freeze the choice message + run executeDraft.
      const submitChoiceBtn = event.target.closest("[data-assistant-choice-submit]");
      if (submitChoiceBtn) {
        event.preventDefault();
        const msgId = submitChoiceBtn.dataset.assistantChoiceSubmit;
        const thread = getThread(session.id);
        const msg = thread.find((m) => m.id === msgId);
        if (!msg) return;
        // Collect selected chip values from the DOM.
        const bubble = submitChoiceBtn.closest(".chat-bubble");
        const selectedValues = bubble
          ? [...bubble.querySelectorAll("button.chat-bubble-choice-chip.is-selected")]
              .map((c) => c.dataset.assistantChoice)
              .filter(Boolean)
          : [];
        if (selectedValues.length === 0) return; // nothing selected — no-op
        submitAssistantChoice(session.id, msgId, selectedValues);
        if (msg.handler === "draft-channels" && msg.context?.ideaId) {
          executeDraft(session.id, msg.context.ideaId, selectedValues);
        } else if (msg.handler === "start-action") {
          handleActionPick(session.id, msg, selectedValues, { setQuery });
        }
        return;
      }

      // In-thread Drafts summary card → opens the right-panel Drafts surface
      // pinned to this batch's assistant message. The full editable BatchCards
      // live in the panel; the in-thread card is just the entry point.
      const draftsCard = event.target.closest("[data-drafts-card-message]");
      if (draftsCard) {
        event.preventDefault();
        const messageId = draftsCard.dataset.draftsCardMessage;
        openDraftsPanel({ sessionId: session.id, messageId });
        return;
      }
      // Any other [data-go-to-posts] surface (older link patterns) — keep the
      // legacy navigation to the Posts tab until those callers are migrated
      // to the right panel.
      if (event.target.closest("[data-go-to-posts]")) {
        event.preventDefault();
        setQuery({ tab: "posts", postsFilter: "all", postsNetwork: "all" });
        return;
      }

      // External-link on an extraction idea card — jump to Content ideas + focus.
      const focusBtn = event.target.closest("[data-focus-idea]");
      if (focusBtn) {
        event.preventDefault();
        const id = focusBtn.dataset.focusIdea;
        if (id) setQuery({ tab: "content", view: "ideas", focusIdea: id });
        return;
      }

      // "View all N ideas" inside a source card → switch to All ideas view.
      if (event.target.closest("[data-source-view]")) {
        event.preventDefault();
        setQuery({ tab: "content", view: "ideas", focusIdea: "" });
        return;
      }

      // Content workspace view switch — By source / All ideas.
      const contentViewBtn = event.target.closest("[data-content-view]");
      if (contentViewBtn) {
        event.preventDefault();
        setQuery({ tab: "content", view: contentViewBtn.dataset.contentView, focusIdea: "" });
        return;
      }

      // "+ Add source" in the Content tab header (mirrors the dashboard's
      // dashboardAddSource button — same modal, same global flow).
      if (event.target.closest("[data-session-add-source]")) {
        openAddSourceModal();
        return;
      }

      // Source / idea selection + bulk + per-row "…" menu actions are all
      // dispatched by library-actions.wireLibraryActions (attached below
      // with the same abort signal) so we don't duplicate the dispatch
      // here. See library-actions.js for the full hook list.

      // "Ask" inside a source card → open the chat picker (same UX as
      // Draft Post), then show the askWhatToKnow inline question in the
      // chosen chat.
      const askBtn = event.target.closest("[data-source-ask]");
      if (askBtn) {
        event.preventDefault();
        const sourceId = askBtn.dataset.sourceAsk;
        const src = getSources(session.id).find((s) => s.id === sourceId);
        if (!src) return;
        startAskFlowFromSession(session.id, sourceId, src.filename);
        return;
      }

      // Idea-card source chips — navigate to the source within this session.
      const openSrc = event.target.closest("[data-source-open]");
      if (openSrc) {
        event.preventDefault();
        setQuery({ tab: "content", view: "sources", focusSource: openSrc.dataset.sourceOpen });
        return;
      }

      // Idea-card title click → "Open idea": give the card a visual pulse
      // (dossier view is future work). Pin + more-menu behavior is
      // encapsulated inside src/components/idea-card.js.
      const openBtn = event.target.closest("[data-idea-open]");
      if (openBtn) {
        event.preventDefault();
        const card = openBtn.closest(".idea-card");
        if (card) {
          card.classList.add("is-focused");
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => card.classList.remove("is-focused"), 1600);
        }
        return;
      }

      if (event.target.closest("[data-idea-generate]")) {
        event.preventDefault();
        const btn = event.target.closest("[data-idea-generate]");
        if (btn.disabled) return;
        const ideaId = btn.dataset.ideaGenerate;
        if (ideaId) {
          btn.disabled = true;
          btn.classList.add("is-pending");
          askProfileQuestion(session.id, ideaId);
        }
        return;
      }

      const tab = event.target.closest("[data-session-tab]");
      if (tab) {
        // Clear focus markers on any explicit tab switch — they're scoped to
        // the originating tab, leaving them set leaks pulse highlights when
        // the user comes back.
        setQuery({ tab: tab.dataset.sessionTab, focusIdea: "", focusPost: "", focusSource: "" });
        return;
      }

      const filter = event.target.closest("[data-posts-filter]");
      if (filter) {
        setQuery({ postsFilter: filter.dataset.postsFilter });
        return;
      }

      const network = event.target.closest("[data-posts-network]");
      if (network) {
        setQuery({ postsNetwork: network.dataset.postsNetwork });
        return;
      }

      if (event.target.closest("[data-posts-clear]")) {
        setQuery({ postsFilter: "all", postsNetwork: "all" });
        return;
      }

      // Post card "Generate an image" placeholder → open the modal.
      const genImageBtn = event.target.closest("[data-generate-image]");
      if (genImageBtn) {
        event.preventDefault();
        const postId = genImageBtn.dataset.generateImage;
        openGenerateImageModal(postId, (imageUrl) => {
          attachImageToDraft(session.id, postId, imageUrl);
          setQuery({ tab: "posts", focusPost: postId, postsFilter: "all", postsNetwork: "all" });
        });
        return;
      }

      // --- Context tab ---
      if (event.target.closest("[data-manage-contexts]")) {
        event.preventDefault();
        openSettingsDrawer({ section: "contexts" });
        return;
      }
      // Edit a single section (Voice / Brief / Brand) via conversation.
      // Every context is global now — surface a confirm prompt because
      // edits propagate across every chat using the context.
      const editSection = event.target.closest("[data-edit-context-section]");
      if (editSection) {
        const section = editSection.dataset.editContextSection;
        const ctxId = readQuery().contextId || session.contextId || "";
        if (!ctxId) return;
        startEditConfirmPrompt(session, section, ctxId);
        return;
      }

      // --- Assistant panel ---
      // Empty-state starter card click — pre-fills the composer textarea
      // with the starter's prompt text. The `{{source}}` placeholder has
      // already been resolved at render time (cf. renderEmptyHero), so the
      // textarea receives clean text the user can either submit as-is or
      // tweak before sending.
      const starterBtn = event.target.closest("[data-starter]");
      if (starterBtn && input) {
        input.value = starterBtn.dataset.starterPrompt;
        input.focus();
        // Place cursor at end so the user can edit.
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }

      if (event.target.closest("[data-assistant-send]")) {
        submitInput();
        return;
      }

      const rewritePost = event.target.closest("[data-post-rewrite]");
      if (rewritePost && input) {
        input.value = "Rewrite this post with a sharper hook and one concrete proof point.";
        input.focus();
        return;
      }

      if (event.target.closest("[data-assistant-attach-toggle]")) {
        const menu = getAttachMenu();
        if (menu) menu.hidden = !menu.hidden;
        return;
      }

      const addSrc = event.target.closest("[data-add-source]");
      if (addSrc) {
        // Composer + menu items drop a non-blocking pill in the input
        // zone (analyzing → ready) — same UX as the 📎 button.
        startPillFromKind(root, session.id, addSrc.dataset.addSource);
        closeAttachMenu();
        return;
      }

      // 📎 — trigger the hidden native file picker. Result handled by the
      // input's change listener below.
      if (event.target.closest("[data-composer-attach]")) {
        const fileInput = root.querySelector("[data-composer-file-input]");
        if (fileInput) fileInput.click();
        return;
      }

      const pillCancelBtn = event.target.closest("[data-pill-cancel]");
      if (pillCancelBtn) {
        event.preventDefault();
        const pillId = pillCancelBtn.dataset.pillCancel;
        const pill = getComposerState(session.id).pills.get(pillId);
        if (pill?.uploadId) cancelUpload(pill.uploadId);
        if (pill?.sourceId) removeSources([pill.sourceId]);
        paintComposerPills(root, session.id);
        return;
      }
      const pillRemoveBtn = event.target.closest("[data-pill-remove]");
      if (pillRemoveBtn) {
        event.preventDefault();
        const pillId = pillRemoveBtn.dataset.pillRemove;
        const pill = getComposerState(session.id).pills.get(pillId);
        if (pill?.sourceId) removeSources([pill.sourceId]);
        paintComposerPills(root, session.id);
        return;
      }
      const openIdeasBtn = event.target.closest("[data-open-source-ideas]");
      if (openIdeasBtn) {
        event.preventDefault();
        const ideaCount = parseInt(openIdeasBtn.dataset.ideaCount || "0", 10) || 3;
        openIdeasPanel();
        // Wait for the panel to mount + render its idea cards, then pulse
        // the first N as the "ideas extracted from this source" highlight.
        // The proto's mock IDEAS aren't linked to user-uploaded sources,
        // so we approximate the connection by pulsing the top N cards
        // (matching the source's ideaCount).
        requestAnimationFrame(() => {
          const panel = document.querySelector(".app-right-panel");
          if (!panel) return;
          const cards = Array.from(panel.querySelectorAll(".rpanel-ideas__card")).slice(0, ideaCount);
          cards.forEach((c) => {
            c.classList.remove("is-focused");
            // Force reflow so the pulse animation restarts on repeated clicks.
            void c.offsetWidth;
            c.classList.add("is-focused");
          });
          if (cards[0]) cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }

      // Composer context dropdown — toggle, select, or close on outside click.
      if (event.target.closest("[data-context-trigger]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-context-menu]");
        const trigger = root.querySelector("[data-context-trigger]");
        if (menu) menu.hidden = !menu.hidden;
        if (trigger) trigger.setAttribute("aria-expanded", menu && !menu.hidden ? "true" : "false");
        return;
      }
      const ctxItem = event.target.closest("[data-context-id]");
      if (ctxItem) {
        event.preventDefault();
        const id = ctxItem.dataset.contextId;
        const menu = root.querySelector("[data-context-menu]");
        const trigger = root.querySelector("[data-context-trigger]");
        if (menu) menu.hidden = true;
        if (trigger) trigger.setAttribute("aria-expanded", "false");
        if (id === "__new__") {
          // Hand the user over to the conversational create-context flow.
          navigate("/contexts/new");
        } else if (id === "__detach__") {
          setQuery({ contextId: "" });
        } else {
          // Update the URL so renderSession resolves the new context and
          // re-renders the panel with attachedContext / hasContext refreshed.
          setQuery({ contextId: id });
        }
        return;
      }
      if (!event.target.closest(".composer-context")) {
        const menu = root.querySelector("[data-context-menu]");
        const trigger = root.querySelector("[data-context-trigger]");
        if (menu && !menu.hidden) {
          menu.hidden = true;
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        }
      }

      // Click outside the attach menu → close it
      if (!event.target.closest(".assistant-attach")) {
        closeAttachMenu();
      }
    },
    { signal },
  );

  // 📎 — file picker change handler. Reset value so re-picking the same
  // file fires change again.
  root.addEventListener(
    "change",
    (event) => {
      if (event.target.matches("[data-composer-file-input]")) {
        const file = event.target.files?.[0];
        if (file) startPillFromFile(root, session.id, file);
        event.target.value = "";
      }
    },
    { signal },
  );

  if (input) {
    input.addEventListener(
      "keydown",
      (event) => {
        // Cmd/Ctrl+Enter sends from anywhere in the textarea (matches Claude.ai
        // and the handoff README spec). Plain Enter (no shift, no modifier)
        // also sends — preserves the archie default. Shift+Enter newlines.
        const isCmdEnter = event.key === "Enter" && (event.metaKey || event.ctrlKey);
        const isPlainEnter =
          event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
        if (isCmdEnter || isPlainEnter) {
          event.preventDefault();
          submitInput();
        }
      },
      { signal },
    );
  }

  // Content workspace: live search input + sort dropdown. These update the
  // module-level contentState and re-render just the list body so the input
  // cursor and focus are preserved.
  root.addEventListener(
    "input",
    (event) => {
      if (event.target.matches("[data-content-search]")) {
        contentState.q = event.target.value;
        rerenderContentWorkspace(root, session);
      }
    },
    { signal },
  );
  root.addEventListener(
    "change",
    (event) => {
      if (event.target.matches("[data-content-sort]")) {
        contentState.sort = event.target.value;
        rerenderContentWorkspace(root, session);
      }
    },
    { signal },
  );
}
