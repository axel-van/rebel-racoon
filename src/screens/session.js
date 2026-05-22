import { html, raw } from "../utils.js?v=20";
import { navigate } from "../router.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=47";
import { socialAccounts, chatStarters } from "../mocks.js?v=31";
import { getSessionById, getSessions, subscribe as subscribeSessions } from "../sessions-store.js?v=1";
import { getContextById, getContexts, updateContext } from "../contexts-store.js?v=28";
import { isNewUser } from "../user-mode.js?v=20";
import {
  getThread,
  sendMessage,
  postAssistantChoice,
  postAssistantMessage,
  postClipExtractionTurn,
  postIdeaExtractionTurn,
  markIdeaExtractionReady,
  postSourceIntake,
  markSourceIntakeReady,
  postDraftResult,
  subscribe,
  submitAssistantChoice,
} from "../assistant.js?v=31";
import { getSources, getIdeas, injectIdeasForSource } from "../library.js?v=28";
import { wireLibraryActions, renderSourcesBulkBar, renderIdeasBulkBar } from "../library-actions.js?v=20";
import {
  renderInto as renderComposerMentions,
  removeMention as removeComposerMention,
  subscribe as subscribeComposerMentions,
} from "../composer-mentions.js?v=2";
import {
  getPosts,
  addPostDraft,
  attachImageToDraft,
  setSubtitleStyle,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=26";
import { startDraftFlow, executeDraft } from "../draft-flow.js?v=21";
import { startActionPickerFlow, handleActionPick } from "../start-flow.js?v=24";
import * as sidebarWizard from "../sidebar-wizard.js?v=31";
import * as inlineQuestion from "../inline-question.js?v=25";
import * as contextBuilder from "../context-builder.js?v=37";
import * as playbookEditor from "../playbook-editor.js?v=9";
import { renderPicker, bindWizardKeyboard, unbindWizardKeyboard } from "./_analyse-common.js?v=28";
import { renderSourceCard } from "../components/source-card.js?v=28";
import { renderIdeaCard } from "../components/idea-card.js?v=25";
import {
  contentState,
  renderContentWorkspace as renderSharedContentWorkspace,
  rerenderContentWorkspaceBody,
  renderContentEmptyState,
} from "../components/content-workspace.js?v=23";
import { open as openGenerateImageModal } from "../components/generate-image-modal.js?v=21";
import { open as openVideoClipsModal } from "../components/video-clips-modal.js?v=1";
import { startClipExtraction } from "../components/clip-extraction-loader.js?v=2";
import { open as openSettingsDrawer } from "../components/settings-drawer.js?v=23";
import { open as openChatPickerModal } from "../components/chat-picker-modal.js?v=21";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=22";
import {
  classifyFile,
  startFileUpload,
  getSources as getStreamSources,
  getUploads as getStreamUploads,
  subscribeSources,
  subscribeUploads,
  pushScriptedSource,
  completeScriptedSource,
  updateSourceClips,
} from "../sources-stream.js?v=30";
import { showToast } from "../components/toast.js?v=20";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  getActiveBatchRef as getActiveDraftsBatchRef,
  getMode as getRightPanelMode,
  subscribe as subscribeRightPanel,
} from "../components/right-panel.js?v=62";
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

  // Locked picker — driven purely by whether the user has actually sent
  // a message yet. The inline "Which context?" assistant-choice posted by
  // a starter click does NOT commit the chat: the user still hasn't typed
  // anything, so they should remain able to swap context via the picker.
  // Only an actual user turn freezes the choice.
  const hasUserMessage = thread.some((m) => m.role === "user");
  // Empty conversation = nothing has happened yet. Hides the empty hero
  // once any rich turn lands (user msg, assistant variant, or the
  // assistant-choice posted by the starter context question) so the
  // in-flight work stays visible across remounts.
  const isEmptyConversation =
    !hasUserMessage &&
    !thread.some((m) => m.role === "assistant-choice") &&
    !thread.some((m) => m.role === "assistant" && m.variant);

  // The composer markup is the same regardless of where it appears — bottom
  // of the panel (default) or inline inside the empty hero. We render it
  // once and place it via `${composerMarkup}` so click handlers (delegated
  // on #app) keep working in both positions.
  const composerMarkup = renderComposer(attachedContext, hasUserMessage, session);
  return html`
    <aside class="session__assistant" aria-label="Assistant panel">
      <div class="session__assistant-thread" id="assistantThread" data-assistant-thread>
        ${isEmptyConversation ? raw(renderEmptyHero(session.id, composerMarkup)) : raw(renderThread(thread))}
      </div>
      ${isEmptyConversation ? "" : raw(composerMarkup)}
    </aside>
  `;
}

// Composer markup — extracted so it can be rendered either at the bottom
// of the assistant panel (default) or inline inside the empty hero (when
// the conversation hasn't started yet). The click handlers in bindSession
// are delegated on #app, so the same markup works in both positions
// without re-wiring.
function renderComposer(attachedContext, hasUserMessage, session) {
  return `
    <div class="session__composer">
      <div class="session__composer-inner">
        <div class="session__composer-thinking" data-assistant-thinking hidden>
          <span class="session__composer-thinking-spinner" aria-hidden="true"></span>
          <span class="session__composer-thinking-text" data-thinking-text>0s · 1 credit</span>
        </div>
        <div class="session__composer-card">
          <div class="session__composer-input">
            <div
              class="session__composer-mentions"
              data-composer-mentions
              hidden
            ></div>
            <textarea
              class="session__composer-input-field"
              id="assistantInput"
              placeholder="ask archie..."
              rows="3"
            ></textarea>
            <button
              type="button"
              class="ap-button primary orange session__composer-send"
              aria-label="Send"
              data-assistant-send
            >
              <i class="ap-icon-arrow-up"></i>
            </button>
          </div>
          <div class="session__composer-toolbar">
            ${renderComposerContextDropdown(attachedContext, { locked: hasUserMessage })}
            <div class="assistant-attach">
              <button
                type="button"
                class="ap-button stroked grey assistant-attach__trigger"
                aria-label="Attach files"
                data-assistant-attach-toggle
              >
                <i class="ap-icon-paper-clip"></i>
                <span>Attach files</span>
              </button>
              <div class="ap-action-dropdown assistant-attach__menu" data-assistant-attach-menu hidden role="menu">
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
          </div>
        </div>
        <div class="session__composer-hint">
          <kbd>↵</kbd> to send · <kbd>Shift</kbd>+<kbd>↵</kbd> for new line · <kbd>⌘</kbd>+<kbd>↵</kbd> sends from
          anywhere · drop a file anywhere to add it as a source
        </div>
      </div>
    </div>
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
// The DS doesn't ship a plain --ref-color-blue-* family — its blue is
// split across electric-blue / soft-blue / bluesky. Map the legacy "blue"
// context color (used by ctx-founder-voice in the mocks) to electric-blue,
// the same alias the sidebar uses (styles/components/sidebar.css:277).
// Without this mapping, `var(--ref-color-blue-100)` silently resolves to
// transparent and the dot vanishes.
const CONTEXT_DOT_TOKEN = { blue: "electric-blue" };
function dotColorVar(colorName) {
  const token = CONTEXT_DOT_TOKEN[colorName] || colorName || "grey";
  return `var(--ref-color-${token}-100)`;
}

function renderComposerContextDropdown(attachedContext, { locked = false } = {}) {
  const all = getContexts();
  const triggerColor = attachedContext?.color || "grey";
  const triggerLabel = attachedContext?.name || "No playbook";
  // Locked state — conversation has at least one user turn. The context is
  // committed: swap the picker for a simple stroked button showing the
  // active context's color dot + name. Clicking it opens the right-panel
  // ContextForm in read mode (via contextBuilder.openRead) so the user
  // can review the brief / voice / do-don't details without leaving the
  // chat. If no context is attached when the lock kicks in, render
  // nothing in this slot — a "No context" view button would have no
  // content to show.
  if (locked) {
    if (!attachedContext) return "";
    return `
      <button
        type="button"
        class="ap-button stroked grey composer-context__locked"
        data-context-view
        title="View playbook"
        aria-label="View playbook: ${escapeHtml(triggerLabel)}"
      >
        <span class="composer-context__dot" style="background: ${dotColorVar(triggerColor)};"></span>
        <span>${escapeHtml(triggerLabel)}</span>
      </button>
    `;
  }
  // Unlocked state — DS .ap-select built on the native <details>/<summary>
  // pattern. The browser handles open/close on summary clicks; we only
  // wire pick (data-context-id) + outside-click in bindSession. The
  // inline-label DS sub-element ("Context") prefixes the active value so
  // the picker reads as "Context · {name}" at a glance.
  const options = all
    .map((c) => {
      const isSelected = c.id === attachedContext?.id;
      const color = c.color || "grey";
      return `
        <button
          type="button"
          class="ap-select-option ${isSelected ? "selected" : ""}"
          data-context-id="${escapeHtml(c.id)}"
          role="option"
        >
          <span class="composer-context__dot" style="background: ${dotColorVar(color)};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSelected ? `<i class="ap-icon-check ap-select-option-check"></i>` : ""}
        </button>
      `;
    })
    .join("");
  const detachItem = attachedContext
    ? `
        <div class="ap-select-divider"></div>
        <button type="button" class="ap-select-option" data-context-id="__detach__" role="option">
          <i class="ap-icon-close ap-select-option-icon"></i>
          <span class="ap-select-option-text">No playbook</span>
        </button>
      `
    : "";
  const noneItem = all.length === 0 ? `<div class="ap-select-option disabled muted">No saved playbooks yet.</div>` : "";
  return `
    <details class="ap-select composer-context-select" data-composer-context>
      <summary class="ap-select-trigger">
        <span class="composer-context__dot" data-context-dot style="background: ${dotColorVar(triggerColor)};"></span>
        <span class="ap-select-inline-label">Playbook</span>
        <span class="ap-select-value" data-context-label>${escapeHtml(triggerLabel)}</span>
        <i class="ap-icon-chevron-down ap-select-arrow"></i>
      </summary>
      <div class="ap-select-dropdown">
        <div class="ap-select-options" role="listbox">
          ${noneItem}
          ${options}
          ${detachItem}
          <div class="ap-select-divider"></div>
          <button type="button" class="ap-select-option" data-context-id="__new__" role="option">
            <i class="ap-icon-plus ap-select-create-icon"></i>
            <span class="ap-select-option-text">New playbook…</span>
          </button>
        </div>
      </div>
    </details>
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
//
// Context decision: handled entirely by the composer picker (visible
// inline inside this hero). The previous inline AI question flow
// ("Quick — which context?") was removed — the composer picker is now
// the single, always-visible context affordance.
function renderEmptyHero(sessionId, composerMarkup = "") {
  const sources = getStreamSources(sessionId);
  const firstSource = sources.find((s) => s.status !== "Processing") || sources[0] || null;
  const sourceLabel = firstSource ? `"${firstSource.filename}"` : "your source";
  // `{{video-source}}` resolves to the first processed video source so the
  // "Extract video clips" starter reads naturally even when the first
  // overall source is a PDF.
  const firstVideo = sources.find(
    (s) => (s.kind || "").toLowerCase() === "video" && s.status === "Processed" && typeof s.durationSec === "number",
  );
  const videoLabel = firstVideo ? `"${firstVideo.filename}"` : "your video";
  const cards = chatStarters
    .map((s) => {
      const resolvedPrompt = s.prompt
        .replace(/\{\{source\}\}/g, sourceLabel)
        .replace(/\{\{video-source\}\}/g, videoLabel);
      const actionAttr = s.action ? ` data-starter-action="${s.action}"` : "";
      const tone = s.tone || "orange";
      return `
        <button type="button" class="starter-card starter-card--${tone}" data-starter="${s.id}"${actionAttr} data-starter-prompt="${escapeHtml(resolvedPrompt)}">
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
      ${raw(composerMarkup)}
      <div class="empty-chat__starter-label">Start with a source or pick a starter pack</div>
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
  // The full assistant thread is rendered above the picker so the
  // wizard reads as a real conversation — each pick / submit posts a
  // user-turn and each AI prompt posts an assistant-turn, all visible
  // and scrollable. `chrome.body` (the current question's intro) is
  // only appended when callers chose to pass `intro:` to
  // inlineQuestion.ask; with the conversational pattern (post the
  // prompt via postAssistantMessage instead) it stays empty.
  const thread = getThread(session.id);
  // The thread container carries `data-assistant-thread` so the assistant
  // subscriber in wireAssistantPanel repaints it on new turns (postUserTurn /
  // postAssistantMessage / postSystemNotice during a wizard step). Without
  // it, new messages would be invisible until the picker state next changes.
  // `chrome.body` (legacy intro) sits in its own sibling div so the
  // subscriber can swap the thread innerHTML without nuking it — most modern
  // callers leave chrome.body empty by passing the prompt through
  // postAssistantMessage instead.
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="inlineQuestionChat">
        <div class="analyse__chat-inner">
          <div data-assistant-thread>${raw(renderThread(thread, session.id))}</div>
          ${raw(chrome.body)}
        </div>
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
  postAssistantMessage(sessionId, `What would you like to know about **${filename}**?`);
  inlineQuestion.ask(sessionId, {
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
  postAssistantMessage(
    session.id,
    `Editing the ${sectionTitle.toLowerCase()} will update this context across every chat using it.`,
  );
  inlineQuestion.ask(session.id, {
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
  if (getSessions().length === 0) {
    handoff({ kind: "new" });
  } else {
    openChatPickerModal({ onPick: handoff });
  }
}

// "Extract video clips" starter → multi-step flow:
//   1. Snapshot the current source ids, open the Add Source modal so the
//      user can upload a video file.
//   2. Subscribe to sources-stream; pick up the first new source whose kind
//      resolves to "video".
//   3. Wait for that source to reach `Processed` status (the existing
//      upload pipeline already runs 2s upload + 3-5s processing).
//   4. Kick off the non-blocking clip extraction (30s background job). The
//      UI stays usable; the user gets a toast with an "Open clips" action
//      when extraction completes, which opens the Video Clips modal.
//   5. "Draft posts from N clips" pipes drafts into the current session
//      with full clipRef so each draft card renders its video player.
//
// Bail conditions: a 2-minute watchdog clears subscriptions if the user
// cancels the Add Source modal so we don't leak listeners.

function startClipsExtractionFlow(session) {
  const initialIds = new Set(getStreamSources(session.id).map((s) => s.id));
  let newSourceId = null;
  let unsubNew = null;
  let unsubProcessed = null;
  let watchdog = null;

  const cleanup = () => {
    if (unsubNew) {
      unsubNew();
      unsubNew = null;
    }
    if (unsubProcessed) {
      unsubProcessed();
      unsubProcessed = null;
    }
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  // After the user picks a file, the Add Source modal kicks off the
  // existing upload pipeline which pushes a new source. We catch the
  // first new VIDEO source — anything else is ignored and the user
  // can re-trigger the starter.
  unsubNew = subscribeSources(session.id, (sources) => {
    const fresh = sources.find((s) => !initialIds.has(s.id) && (s.kind || "").toLowerCase() === "video");
    if (!fresh) return;
    newSourceId = fresh.id;
    unsubNew();
    unsubNew = null;

    // Now wait for the upload + processing pipeline to finish on this
    // specific source.
    unsubProcessed = subscribeSources(session.id, (latest) => {
      const target = latest.find((s) => s.id === newSourceId);
      if (!target || target.status !== "Processed") return;
      unsubProcessed();
      unsubProcessed = null;
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      startClipExtraction(target, {
        onReady: () => openIdeasPanel(),
      });
    });
  });

  // Drop listeners if the user backs out for 2 minutes without uploading.
  watchdog = setTimeout(cleanup, 120000);

  openAddSourceModal({ tab: "upload" });
}

// Open the Video Clips modal with the standard "session" callback wiring:
// save persists clip edits in sources-stream; use-clips drafts the picked
// clips into THIS session (drafts pill increments + inline draft turn +
// toast). Shared by every in-session entry point (dashboard starter, future
// "Add video" composer path, completion-toast action, inline thread card).
function openVideoClipsModalForSession(source, session) {
  openVideoClipsModal(source, {
    onSaveClips: (id, nextClips) => updateSourceClips(id, nextClips),
    onUseClips: (selectedClips, src) => {
      const drafts = selectedClips.map((clip) =>
        addPostDraft(session.id, {
          network: clip.network,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: {
            start: clip.start,
            end: clip.end,
            sourceName: src.filename,
            hue: clip.hue,
          },
        }),
      );
      postDraftResult(session.id, {
        ideaTitle: `From ${src.filename}`,
        drafts,
      });
      showToast(`Drafted ${drafts.length} post${drafts.length === 1 ? "" : "s"} from ${src.filename}`, {
        duration: 3200,
      });
    },
  });
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
  postAssistantMessage(sessionId, "Which profile should I draft this for?");
  inlineQuestion.ask(sessionId, {
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

function renderThread(messages, sessionId) {
  return messages.map((m) => renderTurn(m, sessionId)).join("");
}

function renderTurn(message, sessionId) {
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
    return renderSourceIntakeTurn(message, sessionId);
  }

  // AI extraction result — Figma 25:1053.
  if (message.role === "assistant" && message.variant === "extraction") {
    return renderExtractionTurn(message);
  }

  // Draft result — "Drafted N posts" mermaid-pill + mini post cards.
  if (message.role === "assistant" && message.variant === "draft") {
    return renderDraftTurn(message);
  }

  // Clip extraction — pending spinner pill that flips to a ready card with
  // an "Open clips" action once the background extraction completes.
  if (message.role === "assistant" && message.variant === "clip-extraction") {
    return renderClipExtractionTurn(message, sessionId);
  }

  // Idea extraction (Flow A — "Extract themes"). Same chrome as clip
  // extraction; flips to a "Themes ready · panel updated" notice when
  // injectIdeasForSource lands.
  if (message.role === "assistant" && message.variant === "idea-extraction") {
    return renderIdeaExtractionTurn(message, sessionId);
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

function renderSourceIntakeTurn(message, sessionId) {
  // Kind icon — map the raw kind label (from sources-stream) to the DS
  // icon name. Lowercased so "PDF" / "Video" / "URL" / "Word" / "Image"
  // / "Audio" all resolve.
  const iconByKind = {
    pdf: "ap-icon-file--pdf",
    video: "ap-icon-file--video",
    url: "ap-icon-link",
    word: "ap-icon-file--text",
    text: "ap-icon-file--text",
    image: "ap-icon-file--image",
    audio: "ap-icon-file",
  };
  const kindKey = (message.kind || "").toLowerCase();
  const icon = iconByKind[kindKey] || "ap-icon-file";
  const isLoading = message.status === "loading";

  // Live-derived sub-text. While loading we show "Uploading…"; once
  // marked ready, we show the source's idea count (or just "Processed"
  // if zero ideas yet — e.g. video routed to clip extraction). When
  // ideas > 0 the "N ideas" portion is a clickable affordance that
  // opens the Outputs panel — fixes the dead-end where users saw
  // "Processed · 3 ideas" and had no path to those ideas.
  let subText = "";
  if (isLoading) {
    subText = "Uploading…";
  } else if (message.sourceId) {
    const src = getStreamSources(sessionId).find((s) => s.id === message.sourceId);
    const ideas = src?.ideaCount || 0;
    if (ideas > 0) {
      const label = `${ideas} idea${ideas === 1 ? "" : "s"}`;
      subText = `Processed · <button type="button" class="chat-bubble-source-intake__ideas-link" data-source-intake-open-ideas title="Open Outputs panel">${label}</button>`;
    } else {
      subText = "Processed";
    }
  } else if (message.size) {
    subText = message.size;
  }

  const indicator = isLoading
    ? `<span class="ap-loader blue size-16 chat-bubble-source-intake__spinner" aria-hidden="true">
        <svg><circle></circle><circle></circle></svg>
      </span>`
    : `<i class="ap-icon-rounded-check_fill chat-bubble-source-intake__check" aria-hidden="true"></i>`;

  return `
    <div class="chat-turn chat-turn--user">
      <span class="chat-turn-role">${message.meta || "Source intake"}</span>
      <div class="chat-bubble chat-bubble--source-intake" data-intake-status="${message.status || "ready"}">
        <i class="${icon} chat-bubble-source-intake__kind" aria-hidden="true"></i>
        <div class="chat-bubble-source-intake__main">
          <p class="chat-bubble-text">${message.filename}</p>
          ${subText ? `<p class="chat-bubble-source-intake__sub muted">${subText}</p>` : ""}
        </div>
        ${indicator}
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

  // Composer mentions — the floating status card pushes source mentions
  // here via the composer-mentions store. Render once on mount, then
  // re-render on store updates (per-session subscription).
  const mentionsContainer = root.querySelector("[data-composer-mentions]");
  renderComposerMentions(mentionsContainer, session.id);
  const unsubMentions = subscribeComposerMentions(session.id, () => {
    renderComposerMentions(root.querySelector("[data-composer-mentions]"), session.id);
  });

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
      thread.innerHTML = renderThread(messages, session.id);
      thread.scrollTop = thread.scrollHeight;
    }
    // In wizard layouts the actual scroll container is the wizard chat
    // wrapper, not the [data-assistant-thread] inner div — scroll it
    // explicitly so newly posted turns stay pinned to the bottom.
    const wizardChat = root.querySelector("#inlineQuestionChat, .session__assistant-wizard-chat");
    if (wizardChat) wizardChat.scrollTop = wizardChat.scrollHeight;
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
    thread.innerHTML = renderThread(messages, session.id);
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
      // File dropzone variant — bind `change` on the hidden <input type=file>
      // so picking a file submits via the dedicated submitFile path.
      const fileInput = aside.querySelector("[data-inline-question-custom-file]");
      if (fileInput) {
        fileInput.addEventListener("change", (event) => {
          const file = event.target.files?.[0];
          if (file) inlineQuestion.submitFile(session.id, file);
        });
      }
      // When the question has only a free-text input (no `items`), focus
      // it on render so the user can type immediately without clicking.
      const customInput = aside.querySelector("[data-inline-question-custom]");
      const firstItem = aside.querySelector("[data-inline-question]");
      if (customInput && !firstItem) {
        Promise.resolve().then(() => customInput.focus());
      }
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
      }
    }
    rebindWizardKeyboardIfActive();
    // Wizard chat (inline-question / sidebar-wizard layouts) renders the
    // full thread above the picker — keep it pinned to the bottom on every
    // re-render so newly posted turns stay in view. Uses queueMicrotask so
    // it runs after the DOM swap above has committed.
    queueMicrotask(() => {
      const wizardChat = root.querySelector("#inlineQuestionChat, .session__assistant-wizard-chat");
      if (wizardChat) wizardChat.scrollTop = wizardChat.scrollHeight;
    });
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

  // Thread re-paints on source changes so inline clip-extraction cards
  // flip from pending to ready (and pick up clipExtractionStatus + clips
  // count) without an extra notify hop.
  const repaintThreadFromSources = () => {
    const thread = getThreadEl();
    if (!thread) return;
    thread.innerHTML = renderThread(getThread(session.id), session.id);
  };
  // Intake-turn lifecycle (loading → ready)
  //
  // seenSourceIds is a snapshot baseline of which sources were already
  // attached when bindSession mounted. Any sourceId that appears in
  // attachedSourceIds AFTER this baseline counts as a "new attach" — we
  // post an intake turn for it (unless the source is already Processed,
  // which means it's a Library re-attach, not an upload).
  //
  // sentReadyForSourceIds dedupes the markReady call: once a turn flips
  // to ready, we don't re-fire on every notify.
  // Intake-turn lifecycle (loading → ready)
  //
  // seenSourceIds is a snapshot baseline of the session's sources at
  // mount time. Any sourceId that appears in this session's sources
  // AFTER this baseline counts as a "new upload" — we post an intake
  // turn for it (Processing status). When the source flips to Processed,
  // the turn flips to ready.
  //
  // sentReadyForSourceIds dedupes the markReady call: once a turn flips
  // to ready, we don't re-fire on every notify.
  const seenSourceIds = new Set(getStreamSources(session.id).map((s) => s.id));
  const sentReadyForSourceIds = new Set();

  const offComposerSources = subscribeSources(session.id, (sources) => {
    // Post intake turns for any new source ids.
    for (const src of sources) {
      if (seenSourceIds.has(src.id)) continue;
      seenSourceIds.add(src.id);
      // Every new source in this session is a fresh upload (no library
      // re-attach in the per-session model) → post a loading intake.
      postSourceIntake(session.id, {
        kind: src.kind,
        filename: src.filename,
        sourceId: src.id,
        status: "loading",
      });
    }

    // Repaint the thread on every source flip — intake turns derive
    // ideaCount + status live from sources-stream, so re-rendering is
    // how "Processed · N ideas" lands.
    repaintThreadFromSources();

    // Flip pending intake turns to ready as their source completes.
    const thread = getThread(session.id);
    for (const msg of thread) {
      if (msg.role !== "source-intake") continue;
      if (!msg.sourceId || msg.status === "ready") continue;
      if (sentReadyForSourceIds.has(msg.sourceId)) continue;
      const src = sources.find((s) => s.id === msg.sourceId);
      if (src && src.status === "Processed") {
        sentReadyForSourceIds.add(msg.sourceId);
        markSourceIntakeReady(session.id, msg.sourceId);
      }
    }
  });

  // Uploads → no extra wiring needed: startFileUpload already takes a
  // session.id, so the resulting source lands in this session's list
  // and the source subscription above handles intake + ready flips.
  const offComposerUploads = subscribeUploads(() => {});

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
  // action-picker variant remains — creating a context happens via the
  // inline wizard (contextBuilder.start) instead.
  const pendingStart = consumeHandoff("pendingStartFlow");
  if (pendingStart && pendingStart.hasContext) {
    setTimeout(() => {
      startActionPickerFlow(session.id, { contextName: pendingStart.contextName });
    }, 200);
  }

  // Spawn-session handoff from the /contexts page "New context" button.
  // The page has no chat panel to host the wizard, so it minted this
  // fresh session for us. Launch the inline wizard now; onComplete
  // navigates back to the returnTo path (typically /contexts).
  const pendingCtxBuilder = consumeHandoff("pendingStartContextBuilder");
  if (pendingCtxBuilder) {
    const returnTo = pendingCtxBuilder.returnTo;
    setTimeout(() => {
      contextBuilder.start(session.id, {
        onComplete: () => {
          if (returnTo) navigate(returnTo);
        },
      });
    }, 50);
  }

  // Same mechanism for the Playbook editor — `/contexts` mints a
  // `/session/playbook-edit-{id}-{ts}` route + arms this handoff; we
  // launch the conversational editor on mount. The session id pattern
  // also drives the conditional Save/Cancel chrome in the composer
  // (cf. renderPlaybookEditorBar).
  const pendingPlaybookEditor = consumeHandoff("pendingStartPlaybookEditor");
  if (pendingPlaybookEditor && session.id.startsWith("playbook-edit-")) {
    const { contextId, returnTo, targetField } = pendingPlaybookEditor;
    setTimeout(() => {
      playbookEditor.start(session.id, contextId, {
        // `targetField` is set by `refineField` when the user enters the
        // editor from a section card's Refine button — playbook-editor
        // skips the chip menu and jumps straight to the matching flow.
        targetField,
        onComplete: () => {
          if (returnTo) navigate(returnTo);
        },
        onCancel: () => {
          if (returnTo) navigate(returnTo);
        },
      });
    }, 50);
  } else if (session.id.startsWith("playbook-edit-") && !playbookEditor.isActive(session.id)) {
    // Defensive: direct link to /session/playbook-edit-* without handoff.
    // Bounce back to /contexts (no playbook to edit).
    navigate("/contexts");
  }

  // First-time onboarding hand-off. /welcome/sources arms this after the
  // user finishes the Playbook creation step; the dashboard then forwards
  // to a fresh /session/new?contextId={id} which lands here. We consume
  // the handoff and surface a Playbook-named welcome toast.
  const pendingWelcome = consumeHandoff("welcomeComplete");
  if (pendingWelcome?.playbookName) {
    setTimeout(() => {
      showToast(`Bienvenue ${pendingWelcome.playbookName} !`);
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
          startFileUpload(file, classification, session.id);
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
    unsubMentions();
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
  // Preview-rich chips (e.g. subtitle style picker) carry a `preview`
  // string per choice that's rendered above the label as a styled
  // sample. The chip is taller and the icon slot is dropped — the
  // sample text *is* the icon visually.
  const hasPreviews = (message.choices || []).some((c) => typeof c.preview === "string" && c.preview.length > 0);
  const chips = (message.choices || [])
    .map((c) => {
      const isSelected = (message.selected || []).includes(c.value);
      const selectedClass = isSelected ? " is-selected" : "";
      const previewClass = c.preview ? ` chat-bubble-choice-chip--${c.previewKind || "preview"}` : "";
      const inner = c.preview
        ? `<span class="chat-bubble-choice-preview chat-bubble-choice-preview--${c.previewKind || "default"}">${c.preview}</span>
           <span class="chat-bubble-choice-label">${c.label}</span>`
        : `<i class="${c.icon}" aria-hidden="true"></i>
           <span>${c.label}</span>`;
      if (isAnswered) {
        return `<span class="chat-bubble-choice-chip${selectedClass}${previewClass}">
          ${inner}
        </span>`;
      }
      return `<button
        type="button"
        class="chat-bubble-choice-chip${selectedClass}${previewClass}"
        data-assistant-choice="${c.value}"
        data-assistant-choice-msg="${message.id}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >
        ${inner}
      </button>`;
    })
    .join("");
  const choicesRowClass = hasPreviews ? "chat-bubble-choices chat-bubble-choices--visual" : "chat-bubble-choices";

  const submitLabel = message.submitLabel || "Submit";
  // Instant pickers (single click = submit) skip the Submit button — the
  // chip-click handler fires the handler directly.
  const footer =
    isAnswered || message.instant
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
        <div class="${choicesRowClass}">${chips}</div>
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
      <button type="button" class="ap-card drafts-card ${isActive ? "is-active" : ""}" data-drafts-card-message="${message.id || ""}">
        <span class="drafts-card__icon" aria-hidden="true">
          <i class="ap-icon-pen"></i>
        </span>
        <span class="drafts-card__main">
          <span class="drafts-card__title">${count} draft${count === 1 ? "" : "s"} ready</span>
          <span class="drafts-card__sub">
            ${networks.length ? `<span class="ap-tag-list drafts-card__nets">${networkIcons}</span>` : ""}
            <span class="drafts-card__sub-text">${networkLabelText}</span>
          </span>
        </span>
        <i class="ap-icon-chevron-right drafts-card__chevron" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

// Pending → ready clip-extraction card. The turn carries only the sourceId
// and filename; the renderer reads the live source from sources-stream so
// the same turn naturally flips state when setClipExtractionStatus fires
// (the session view subscribes to subscribeSources, repainting the thread).
function renderClipExtractionTurn(message, sessionId) {
  const source = getStreamSources(sessionId).find((s) => s.id === message.sourceId);
  const filename = escapeHtml(source?.filename || message.filename || "your video");

  // Source was removed (e.g. user deleted it from /sources) — degrade to a
  // muted notice rather than leave a broken CTA.
  if (!source) {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        <div class="clip-extraction-card clip-extraction-card--gone">
          <span class="clip-extraction-card__icon" aria-hidden="true">
            <i class="ap-icon-file--video"></i>
          </span>
          <span class="clip-extraction-card__main">
            <span class="clip-extraction-card__title">Clips no longer available</span>
            <span class="clip-extraction-card__sub">${filename} was removed.</span>
          </span>
        </div>
      </div>
    `;
  }

  const clipsCount = Array.isArray(source.clips) ? source.clips.length : 0;
  const isReady = source.clipExtractionStatus === "ready" || clipsCount > 0;

  if (!isReady) {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        <div class="clip-extraction-card clip-extraction-card--pending">
          <span class="clip-extraction-card__spinner" role="status" aria-label="Extracting clips"></span>
          <span class="clip-extraction-card__main">
            <span class="clip-extraction-card__title">Cutting your clips…</span>
            <span class="clip-extraction-card__sub">Up to 45s · you can keep chatting</span>
          </span>
        </div>
      </div>
    `;
  }

  const countLabel = clipsCount === 1 ? "1 clip" : `${clipsCount} clips`;
  return `
    <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
      <div class="clip-extraction-card clip-extraction-card--ready">
        <span class="clip-extraction-card__icon" aria-hidden="true">
          <i class="ap-icon-sparkles"></i>
        </span>
        <span class="clip-extraction-card__main">
          <span class="clip-extraction-card__title">Clips ready · ${countLabel} from ${filename}</span>
          <span class="clip-extraction-card__sub">Pick the ones you want and turn them into posts.</span>
        </span>
        <button type="button" class="ap-button ghost grey clip-extraction-card__cta" data-clip-card-open="${source.id}">
          <span>Open clips</span>
        </button>
      </div>
    </div>
  `;
}

// Pending → ready idea-extraction notice for the "Extract themes" branch.
// Reuses the .clip-extraction-card chrome so the visual language stays
// consistent across both Flow A and Flow B non-blocking turns.
function renderIdeaExtractionTurn(message, sessionId) {
  const source = getStreamSources(sessionId).find((s) => s.id === message.sourceId);
  const filename = escapeHtml(source?.filename || message.filename || "your video");

  if (message.status === "loading") {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        <div class="clip-extraction-card clip-extraction-card--pending">
          <span class="clip-extraction-card__spinner" role="status" aria-label="Reading video for themes"></span>
          <span class="clip-extraction-card__main">
            <span class="clip-extraction-card__title">Reading the video for themes…</span>
            <span class="clip-extraction-card__sub">Up to 15s · you can keep chatting</span>
          </span>
        </div>
      </div>
    `;
  }

  return `
    <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
      <div class="clip-extraction-card clip-extraction-card--ready">
        <span class="clip-extraction-card__icon" aria-hidden="true">
          <i class="ap-icon-bulb"></i>
        </span>
        <span class="clip-extraction-card__main">
          <span class="clip-extraction-card__title">Themes ready from ${filename}</span>
          <span class="clip-extraction-card__sub">Check the Ideas panel on the right.</span>
        </span>
      </div>
    </div>
  `;
}

// ─── Composer side state ─────────────────────────────────────────────────
//
// The legacy per-session composer-pill machinery (composerStates,
// getComposerState, resolveComposerPill, renderComposerPill,
// paintComposerPills, dismissComposerIdeasBadge) was removed when
// sources moved into the right-panel "Sources" mode. Sources now live
// directly in sources-stream's per-session list and render in the
// panel — the composer stays minimal.

// Label map for subtitle preset picks — used by the toast confirmation
// after the user resolves the "Add subtitles?" turn (PDF flow 06.B).
const SUBTITLE_PICK_LABEL = {
  bold: "Bold",
  clean: "Clean",
  caption: "Caption",
};

// Post the "Add subtitles?" question into the assistant thread after the
// user has drafted ≥1 post from clips. Renders 4 visual preset chips
// (preview text styled per preset) plus a "No subtitles" option. The
// handler resolves to setSubtitleStyle(sessionId, draftIds, pick).
export function postSubtitleQuestion(sessionId, draftIds) {
  if (!Array.isArray(draftIds) || draftIds.length === 0) return;
  postAssistantChoice(sessionId, {
    text: "Add subtitles to your clips?",
    choices: [
      { value: "bold", label: "Bold", previewKind: "bold", preview: "POST" },
      { value: "clean", label: "Clean", previewKind: "clean", preview: "Post" },
      { value: "caption", label: "Caption", previewKind: "caption", preview: "post" },
      { value: "none", label: "No subtitles", previewKind: "none", preview: "—" },
    ],
    multi: false,
    instant: true,
    handler: "subtitle-style-pick",
    context: { draftIds },
  });
}

const SCRIPTED_KINDS = {
  pdf: { kindLabel: "PDF", filename: "Roadmap Q3.pdf" },
  video: { kindLabel: "Video", filename: "Demo replay.mp4" },
  url: { kindLabel: "URL", filename: "blog.example.com/post" },
};

// Canned ideas injected into the Ideas panel when the user picks "Extract
// ideas" on a video. Generic enough to plausibly come from any keynote /
// demo / founder-talk video. Full idea shape (matches library.js's
// EXTRA_IDEA_TEMPLATES) so the Ideas panel can render them with all
// secondary fields (rationale, relevance, confidence, channels).
function mockVideoIdeas(sourceId, filename) {
  const ref = filename ? `Video · ${filename}` : "Video";
  return [
    {
      id: `idea_${sourceId}_1`,
      title: "Opening thesis — one-line framing",
      body: "The video opens with the central claim. Reads as a standalone post or as the lede of a longer piece.",
      kind: "hook",
      tags: ["hook", "positioning"],
      used: 0,
      ref,
      rationale: "Quotable single-sentence framing — strong cold open for a thought-leadership post.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 86,
      channels: ["linkedin", "x"],
    },
    {
      id: `idea_${sourceId}_2`,
      title: "Demo segment — value lands visually",
      body: "Short compact demo where the product's value lands in under a minute. Travels well on vertical formats.",
      kind: "story",
      tags: ["demo", "product"],
      used: 0,
      ref,
      rationale: "Visual demos with a clear payoff outperform talking-head clips on vertical formats.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 74,
      channels: ["instagram", "tiktok"],
    },
    {
      id: `idea_${sourceId}_3`,
      title: "Headline stat with the story behind it",
      body: "Specific number delivered with the customer context that earns it. Strong proof point for LinkedIn.",
      kind: "stat",
      tags: ["stat", "proof"],
      used: 0,
      ref,
      rationale: "Numbers + before/after context land on LinkedIn audiences who over-index on time-savings proof.",
      relevance: "High relevance",
      relevanceColor: "orange",
      confidence: 82,
      channels: ["linkedin"],
    },
    {
      id: `idea_${sourceId}_4`,
      title: "Contrarian POV — the unpopular call",
      body: "Founder explains a decision that goes against the obvious move. Single-beat thought-leadership material.",
      kind: "insight",
      tags: ["contrarian", "pov"],
      used: 0,
      ref,
      rationale: "Strong POV in a single beat — drives debate without alienating either side.",
      relevance: "Medium relevance",
      relevanceColor: "tagOrange",
      confidence: 71,
      channels: ["linkedin", "x"],
    },
  ];
}

function startPillFromKind(_root, session, kind) {
  const spec = SCRIPTED_KINDS[kind];
  if (!spec) return;
  const sessionId = session.id;
  const sourceId = pushScriptedSource({ filename: spec.filename, kind: spec.kindLabel, sessionId });
  if (kind === "video") {
    // Video kind: skip auto-complete and ask the user up-front whether
    // they want clips or ideas. The choice handler completes the source
    // with the right ideaCount (0 for clips, random 3–8 for ideas) so
    // the composer pill's green "N nouvelles idées" badge never shows
    // before the user has actually chosen the ideas path.
    postAssistantChoice(sessionId, {
      text: "What should I do with this video?",
      choices: [
        { value: "clips", label: "Create clips", icon: "ap-icon-sparkles" },
        { value: "ideas", label: "Extract themes", icon: "ap-icon-tag" },
      ],
      multi: false,
      instant: true,
      handler: "video-intake-choice",
      context: { sourceId, filename: spec.filename },
    });
    return;
  }
  // PDF / URL — schedule the scripted completion (~6s) AND launch the
  // conversation right away. The user shouldn't have to type a prompt
  // to get Archie engaged — attaching a source is itself an intent
  // signal, so we acknowledge it and offer the most common next moves
  // (draft a batch, repurpose, just extract ideas first). The video
  // path already does this on its own with the clips/themes choice.
  const delay = 6000;
  const ideaCount = 3 + Math.floor(Math.random() * 6);
  setTimeout(() => {
    completeScriptedSource(sourceId, {
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount,
    });
  }, delay);
  postAssistantMessage(
    sessionId,
    `Got it — I'm reading **${spec.filename}**. While I extract the strongest moments, what should I do with it?`,
  );
  postAssistantChoice(sessionId, {
    text: "",
    choices: [
      { value: "batch", label: "Draft a batch of posts", icon: "ap-icon-sparkles-mermaid" },
      { value: "repurpose", label: "Repurpose into 8 posts", icon: "ap-icon-pen" },
      { value: "extract", label: "Just extract ideas first", icon: "ap-icon-tag" },
    ],
    multi: false,
    instant: true,
    handler: "source-intake-choice",
    context: { sourceId, filename: spec.filename, kind },
  });
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

  const getInput = () => root.querySelector("#assistantInput");

  function submitInput() {
    const input = getInput();
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const wasFirstUserMessage = !getThread(session.id).some((m) => m.role === "user");
    sendMessage(session.id, text);
    input.value = "";

    // First user message without a context attached → auto-launch the
    // context-builder flow. The conversation starts the brief setup
    // (website URL question) inline so the user defines a context
    // before going further. They can still Skip if they really want
    // to stay context-less.
    if (!wasFirstUserMessage) return;
    const q = readQuery();
    const ctxAttached = q.contextId || session.contextId;
    if (ctxAttached) return;
    setTimeout(() => {
      contextBuilder.start(session.id, {
        autoLaunched: true,
        onComplete: (created) => setQuery({ contextId: created.id }),
      });
    }, 200);
  }

  // Run the handler for a choice turn (freeze the message + dispatch). Called
  // by both the Submit-button path and the instant chip-click path.
  function dispatchChoiceSubmit(msg, selectedValues) {
    submitAssistantChoice(session.id, msg.id, selectedValues);
    if (msg.handler === "draft-channels" && msg.context?.ideaId) {
      executeDraft(session.id, msg.context.ideaId, selectedValues);
    } else if (msg.handler === "start-action") {
      handleActionPick(session.id, msg, selectedValues, { setQuery });
    } else if (msg.handler === "subtitle-style-pick") {
      // PDF flow step 06.B — user picks a subtitle preset (or "none") for
      // the clip-derived drafts. Applies the style to each draft id we
      // stashed in the message context.
      const { draftIds = [] } = msg.context || {};
      const pick = selectedValues[0];
      if (draftIds.length > 0 && pick) {
        setSubtitleStyle(session.id, draftIds, pick);
        const label = pick === "none" ? "No subtitles" : SUBTITLE_PICK_LABEL[pick] || pick;
        showToast(`Subtitles applied · ${label}`, { duration: 3200 });
      }
    } else if (msg.handler === "source-intake-choice") {
      // PDF / URL intake picker fired right after the user attaches a
      // source. Acknowledges the pick and routes to the right next beat
      // (draft batch / repurpose / extract). The scripted source is
      // already on the 6s ticker (see startPillFromKind), so we just
      // post the assistant follow-up message — the actual draft/extract
      // engines kick in only once the source flips to "Processed".
      const { filename } = msg.context || {};
      const pick = selectedValues[0];
      const followups = {
        batch: `Got it — I'll draft 5 posts from **${filename}** across LinkedIn, X, and Instagram as soon as the analysis lands.`,
        repurpose: `Got it — I'll turn **${filename}** into 8 posts (3 LinkedIn, 3 X, 2 Instagram) keeping the brand voice consistent.`,
        extract: `Got it — I'll surface the strongest ideas from **${filename}** first. You can decide what to draft from there.`,
      };
      const msgText = followups[pick];
      if (msgText) postAssistantMessage(session.id, msgText);
    } else if (msg.handler === "video-intake-choice") {
      // Single-select picker between "clips" (cut into clip-extraction flow)
      // and "ideas" (inject mock ideas into the Ideas panel). For video,
      // startPillFromKind intentionally skips auto-complete — we complete
      // the scripted source here so the pill's "N nouvelles idées" badge
      // only reflects the chosen branch (0 for clips, random 3-8 for ideas).
      const { sourceId, filename } = msg.context || {};
      const pick = selectedValues[0];
      if (sourceId && pick) {
        const ideas = pick === "ideas" ? mockVideoIdeas(sourceId, filename) : [];
        completeScriptedSource(sourceId, {
          signal: ideas.length > 0 ? "Medium signal" : "Low signal",
          signalColor: ideas.length > 0 ? "tagOrange" : "grey",
          ideaCount: ideas.length,
        });
        const source = getStreamSources(session.id).find((s) => s.id === sourceId);
        if (source && pick === "clips") {
          postClipExtractionTurn(session.id, { sourceId, filename });
          startClipExtraction(source, {
            onReady: () => openIdeasPanel(),
          });
        } else if (source && pick === "ideas") {
          // Ideas land in the Ideas panel (right-panel), not as an inline
          // assistant result turn. We do post a transient pending notice
          // ("Reading the video for themes… up to 15s") so the user knows
          // the AI is working non-blocking before the panel updates.
          const noticeId = postIdeaExtractionTurn(session.id, { sourceId, filename });
          window.setTimeout(() => {
            injectIdeasForSource(session.id, sourceId, ideas);
            markIdeaExtractionReady(session.id, noticeId);
          }, 6000);
        }
      }
    }
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
      if (event.target.closest("[data-inline-question-back]")) {
        event.preventDefault();
        inlineQuestion.back(session.id);
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

      // Choice chip click — instant pickers (msg.instant) fire the handler
      // immediately with the clicked value. Otherwise it's a visual-only
      // toggle and the user submits via the Submit button below.
      const choiceChip = event.target.closest("[data-assistant-choice]");
      if (choiceChip && choiceChip.tagName === "BUTTON") {
        event.preventDefault();
        const msgId = choiceChip.dataset.assistantChoiceMsg;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (msg?.instant) {
          dispatchChoiceSubmit(msg, [choiceChip.dataset.assistantChoice]);
        } else {
          const wasSelected = choiceChip.classList.contains("is-selected");
          choiceChip.classList.toggle("is-selected", !wasSelected);
          choiceChip.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
        }
        return;
      }

      // "Draft them" / "Continue" submit — freeze the choice + run handler.
      const submitChoiceBtn = event.target.closest("[data-assistant-choice-submit]");
      if (submitChoiceBtn) {
        event.preventDefault();
        const msgId = submitChoiceBtn.dataset.assistantChoiceSubmit;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (!msg) return;
        const bubble = submitChoiceBtn.closest(".chat-bubble");
        const selectedValues = bubble
          ? [...bubble.querySelectorAll("button.chat-bubble-choice-chip.is-selected")]
              .map((c) => c.dataset.assistantChoice)
              .filter(Boolean)
          : [];
        if (selectedValues.length === 0) return; // nothing selected — no-op
        dispatchChoiceSubmit(msg, selectedValues);
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

      // Stay-in-conversation policy — uploading / drafting / extracting
      // inside a chat must never redirect the user to a side panel or
      // the now-dead Content tab. We swallow the click events for these
      // legacy chips so the chip render can stay (visual signal) but
      // doesn't navigate. The data attributes are kept for analytics /
      // future re-wiring; the click is just consumed silently.
      if (event.target.closest("[data-focus-idea]")) {
        event.preventDefault();
        return;
      }
      if (event.target.closest("[data-source-view]")) {
        event.preventDefault();
        return;
      }
      if (event.target.closest("[data-content-view]")) {
        event.preventDefault();
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

      // Idea-card source chips — same stay-in-conversation policy as the
      // other dead Content-tab nav above. Click consumed, no nav.
      if (event.target.closest("[data-source-open]")) {
        event.preventDefault();
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
      //
      // Starters can opt into a direct action instead of text injection by
      // setting `action` on the mock. The "open-video-clips" action is now
      // a shortcut to the same path as the attach menu's "Add video" —
      // pushes a scripted video pill which posts the "Create clips /
      // Extract themes" choice turn. Keeps a single entry point for the
      // video flow regardless of whether the user picks via starter,
      // attach menu, or drag-drop.
      const starterBtn = event.target.closest("[data-starter]");
      if (starterBtn && starterBtn.dataset.starterAction === "open-video-clips") {
        startPillFromKind(root, session, "video");
        return;
      }
      if (starterBtn) {
        const input = getInput();
        if (!input) return;
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
      if (rewritePost) {
        const input = getInput();
        if (!input) return;
        input.value = "Rewrite this post with a sharper hook and one concrete proof point.";
        input.focus();
        return;
      }

      // Inline clip-extraction card "Open clips" button — after P0
      // unification, the CTA opens the Outputs panel (Clips tab) rather
      // than the modal; the modal is reserved for per-clip trim editing.
      const openClipsBtn = event.target.closest("[data-clip-card-open]");
      if (openClipsBtn) {
        event.preventDefault();
        openIdeasPanel();
        return;
      }

      // "Processed · N ideas" link inside a source-intake bubble — opens
      // the Outputs panel. Same destination as the topbar Outputs pill;
      // gives users a direct path from the source they just attached to
      // the ideas extracted from it.
      const openIdeasLink = event.target.closest("[data-source-intake-open-ideas]");
      if (openIdeasLink) {
        event.preventDefault();
        event.stopPropagation();
        openIdeasPanel();
        return;
      }

      // × on a composer mention pill — remove that source from the
      // session's composer-mentions state.
      const mentionRemove = event.target.closest("[data-composer-mention-remove]");
      if (mentionRemove) {
        event.preventDefault();
        event.stopPropagation();
        removeComposerMention(session.id, mentionRemove.dataset.composerMentionRemove);
        return;
      }

      // Playbook editor — Save changes (in the picker footer). Both Save
      // and Cancel surface a confirmation modal so the user has a
      // deliberate commit/discard step — no accidental clicks.
      if (event.target.closest("[data-playbook-editor-save]")) {
        event.preventDefault();
        event.stopPropagation();
        const dirty = playbookEditor.isDirty(session.id);
        import("../components/confirm-modal.js?v=20").then(({ open }) => {
          open({
            title: "Save changes?",
            body: dirty
              ? "Apply your edits to the Playbook. This overwrites the current version."
              : "No edits were staged — closing the editor will return you to the Playbooks library.",
            confirmLabel: dirty ? "Save changes" : "Close editor",
            cancelLabel: "Keep editing",
            onConfirm: () => {
              const ctxId = playbookEditor.save(session.id);
              if (ctxId && dirty) {
                import("../components/toast.js?v=20").then(({ showToast }) => showToast("Playbook updated"));
              }
            },
          });
        });
        return;
      }

      // Playbook editor — Cancel. Always prompt before dropping the
      // session, with a stronger warning copy when the draft is dirty.
      if (event.target.closest("[data-playbook-editor-cancel]")) {
        event.preventDefault();
        event.stopPropagation();
        const dirty = playbookEditor.isDirty(session.id);
        import("../components/confirm-modal.js?v=20").then(({ open }) => {
          open({
            title: dirty ? "Discard changes?" : "Close editor?",
            body: dirty
              ? "Your edits to this Playbook will be lost."
              : "You can re-open the editor anytime from the Playbooks library.",
            confirmLabel: dirty ? "Discard" : "Close",
            cancelLabel: "Keep editing",
            danger: dirty,
            onConfirm: () => playbookEditor.discard(session.id),
          });
        });
        return;
      }

      // Paper-clip in the composer — toggle the dropdown menu open/closed.
      // The menu offers three scripted "Add PDF/Video/URL" quick-actions.
      if (event.target.closest("[data-assistant-attach-toggle]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = !menu.hidden;
        return;
      }

      // Quick scripted attach items inside the paper-clip menu.
      const addSrcItem = event.target.closest("[data-add-source]");
      if (addSrcItem) {
        event.preventDefault();
        startPillFromKind(root, session, addSrcItem.dataset.addSource);
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        return;
      }

      // Click outside the paper-clip menu → close it.
      if (!event.target.closest(".assistant-attach")) {
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu && !menu.hidden) menu.hidden = true;
      }

      // Locked composer context — click on the stroked button opens the
      // right-panel ContextForm in read mode so the user can review the
      // active context's details without leaving the chat. Falls back
      // through the URL contextId (wizard-driven) then the session seed.
      if (event.target.closest("[data-context-view]")) {
        event.preventDefault();
        const ctxId = readQuery().contextId || session.contextId;
        if (ctxId) contextBuilder.openRead(ctxId);
        return;
      }

      // Composer context dropdown — picks + outside-click close. The DS
      // .ap-select is built on the native <details>/<summary> pattern, so
      // the browser handles open/close on the summary click. We only wire
      // (a) the option pick and (b) outside-click close (since <details>
      // doesn't natively close on outside clicks).
      const ctxItem = event.target.closest("[data-context-id]");
      if (ctxItem) {
        event.preventDefault();
        const id = ctxItem.dataset.contextId;
        const sel = root.querySelector("details.composer-context-select");
        if (sel) sel.open = false;
        if (id === "__new__") {
          // Launch the conversational create-context wizard inline in
          // this session. onComplete attaches the new context once saved.
          contextBuilder.start(session.id, {
            onComplete: (created) => setQuery({ contextId: created.id }),
          });
        } else if (id === "__detach__") {
          setQuery({ contextId: "" });
        } else {
          // Update the URL so renderSession resolves the new context and
          // re-renders the panel with attachedContext / hasContext refreshed.
          setQuery({ contextId: id });
        }
        return;
      }
      if (!event.target.closest(".composer-context-select")) {
        const sel = root.querySelector("details.composer-context-select");
        if (sel?.open) sel.open = false;
      }
    },
    { signal },
  );

  root.addEventListener(
    "keydown",
    (event) => {
      if (!event.target.matches("#assistantInput")) return;
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
